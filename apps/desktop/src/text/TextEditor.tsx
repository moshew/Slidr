import {
  newId,
  type CommandBus,
  type ShapeElement,
  type TextElement,
  type Theme,
} from '@slidr/model';
import { Extension } from '@tiptap/core';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { flipDirection, syncGrowHeight, toggleBold, toggleMark, type TextTarget } from './actions';
import { announceEditor } from './activeEditor';
import { changeParagraphsTr, STEP_META, type StepMeta } from './editorFormat';
import { levelChange, type FormatContext } from './format';
import {
  blurredSelectionPlugin,
  clipboardPlugin,
  decorationsPlugin,
  emptyLinePlugin,
} from './plugins';
import { docToRichText, normalizeRichText, richTextToDoc } from './richTextDoc';
import { textExtensions } from './schema';

/**
 * In-place text editing on the Stage (WG4-T02, TXT-01), following ADR-006:
 * - TipTap sits inside the scaled slide, in the element's own text box (`TextSlot`), so the text
 *   does not move when editing starts.
 * - TipTap keeps no history. Every change is `text.set` on the bus, and a burst of typing is one
 *   transaction: a pause of 650ms or a caret move starts the next (rule 3). Ctrl+Z is the bus's.
 * - The caret and the selection are the browser's own (rule 2).
 *
 * Formatting from the toolbar and from the keyboard, paste, cut and drop are each an undo step of
 * their own, apart from the typing around them (ADR-013). The editor announces itself
 * (`activeEditor.ts`), which is how the toolbar reaches its selection.
 */
export interface TextEditorProps {
  bus: CommandBus;
  slideId: string;
  element: TextElement | ShapeElement;
  theme: Theme;
  /** Where the user double-clicked, to put the caret there. Without it the caret goes to the end. */
  caretAt?: { x: number; y: number };
  /** Esc: leave editing. */
  onExit: () => void;
}

/** A pause in typing longer than this starts a new undo step (ADR-006). */
const BURST_MS = 650;

const signature = (value: unknown) => JSON.stringify(value);

type Dispatch = (tr: Transaction) => void;

/**
 * Tab / Shift+Tab: one list level deeper or shallower (TXT-06). Outside a list Tab does nothing,
 * but it is still taken, so focus does not leave the text box.
 */
function shiftLevel(state: EditorState, dispatch: Dispatch, by: 1 | -1): boolean {
  const tr = changeParagraphsTr(state, levelChange(by));
  if (tr.docChanged) dispatch(tr);
  return true;
}

/** Enter on an empty list item ends the list, as in every word processor. */
function leaveEmptyListItem(state: EditorState, dispatch: Dispatch): boolean {
  const { $from, empty } = state.selection;
  const node = $from.parent;
  if (!empty || node.type.name !== 'paragraph' || node.content.size > 0 || !node.attrs.list)
    return false;
  dispatch(state.tr.setNodeAttribute($from.before(), 'list', null));
  return true;
}

/** Backspace at the start of a list item removes its bullet before it joins paragraphs. */
function unlistAtStart(state: EditorState, dispatch: Dispatch): boolean {
  const { $from, empty } = state.selection;
  const node = $from.parent;
  if (!empty || $from.parentOffset !== 0 || node.type.name !== 'paragraph' || !node.attrs.list)
    return false;
  dispatch(state.tr.setNodeAttribute($from.before(), 'list', null));
  return true;
}

/**
 * Ctrl+arrow moves by a word; at the very start of the text, the arrow that points back has
 * nowhere to go. In the app Chromium then puts the caret at the END of the text (it does not in a
 * page with nothing editable before the editor), and with Shift selects all of it. The key is
 * taken instead, so the caret stays; the same at the end, where the browser already stays.
 * Which arrow points back depends on the direction of the paragraph (ADR-006: the arrows are
 * logical in it).
 */
function wordMoveAtEdge(view: EditorView, arrow: 'left' | 'right'): boolean {
  const { $head } = view.state.selection;
  const dom = view.nodeDOM($head.before());
  const rtl = dom instanceof HTMLElement && getComputedStyle(dom).direction === 'rtl';
  const forward = (arrow === 'left') === rtl;
  if (forward)
    return (
      $head.parentOffset === $head.parent.content.size &&
      $head.index(0) === $head.doc.childCount - 1
    );
  return $head.parentOffset === 0 && $head.index(0) === 0;
}

/** What makes a transaction an undo step of its own: a formatting change, or the clipboard. */
function ownStep(transaction: Transaction): StepMeta | undefined {
  const step = transaction.getMeta(STEP_META) as StepMeta | undefined;
  if (step) return step;
  const event = transaction.getMeta('uiEvent') as string | undefined;
  if (event === 'paste') return { label: 'Paste' };
  if (event === 'cut') return { label: 'Cut' };
  if (event === 'drop') return { label: 'Move text' };
  return undefined;
}

export function TextEditor({ bus, slideId, element, theme, caretAt, onExit }: TextEditorProps) {
  const exitRef = useRef(onExit);
  const burst = useRef<{ txId: string; at: number } | null>(null);
  /** What the editor last wrote to the model, to tell our own changes from undo or the agent's. */
  const written = useRef<string>(
    signature(normalizeRichText(element.content ?? { paragraphs: [] })),
  );

  useEffect(() => {
    exitRef.current = onExit;
  });

  const editor = useEditor(
    {
      extensions: [
        ...textExtensions({
          // Paragraph styles read the theme when they draw; a theme change rebuilds the editor.
          getTheme: () => theme,
          styleRef: 'body',
          wrap: element.type === 'text' ? (element.wrap ?? true) : true,
        }),
        Extension.create({
          name: 'slidrKeys',
          addKeyboardShortcuts() {
            const ed = this.editor;
            const target = (): TextTarget => ({
              kind: 'editor',
              view: ed.view,
              bus,
              slideId,
              element,
            });
            const ctx = (): FormatContext => ({ theme, dir: bus.deck.meta.dir });
            return {
              Tab: () => shiftLevel(ed.state, ed.view.dispatch, 1),
              'Shift-Tab': () => shiftLevel(ed.state, ed.view.dispatch, -1),
              Enter: () => leaveEmptyListItem(ed.state, ed.view.dispatch),
              Backspace: () => unlistAtStart(ed.state, ed.view.dispatch),
              'Mod-z': () => bus.undo() || true,
              'Mod-y': () => bus.redo() || true,
              'Shift-Mod-z': () => bus.redo() || true,
              'Mod-b': () => {
                toggleBold(target(), ctx());
                return true;
              },
              'Mod-i': () => {
                toggleMark(target(), ctx(), 'italic');
                return true;
              },
              'Mod-u': () => {
                toggleMark(target(), ctx(), 'underline');
                return true;
              },
              // SPEC Appendix A: flips the direction of the paragraphs the selection touches.
              'Mod-Shift-x': () => {
                flipDirection(target(), ctx());
                return true;
              },
              'Mod-ArrowLeft': () => wordMoveAtEdge(ed.view, 'left'),
              'Mod-ArrowRight': () => wordMoveAtEdge(ed.view, 'right'),
              'Shift-Mod-ArrowLeft': () => wordMoveAtEdge(ed.view, 'left'),
              'Shift-Mod-ArrowRight': () => wordMoveAtEdge(ed.view, 'right'),
              Escape: () => {
                exitRef.current();
                return true;
              },
            };
          },
          addProseMirrorPlugins: () => [
            decorationsPlugin(() => bus.deck.meta.dir),
            emptyLinePlugin(),
            blurredSelectionPlugin(),
            clipboardPlugin(),
          ],
        }),
      ],
      content: richTextToDoc(element.content ?? { paragraphs: [] }),
      editorProps: {
        attributes: {
          'data-text-editor': '',
          spellcheck: 'false',
          style:
            'outline: none; white-space: pre-wrap; overflow-wrap: break-word; caret-color: auto;',
        },
      },
      onSelectionUpdate: ({ transaction }) => {
        // Moving the caret ends the typing burst.
        if (!transaction.docChanged) burst.current = null;
      },
      onTransaction: ({ transaction }) => {
        // So does a formatting change, also one that only sets what is typed next.
        if (ownStep(transaction)) burst.current = null;
      },
      onUpdate: ({ editor: ed, transaction }) => {
        const content = docToRichText(ed.getJSON());
        written.current = signature(content);
        const step = ownStep(transaction);
        let txId: string;
        if (step) {
          txId = step.txId ?? newId('tx');
        } else {
          const now = performance.now();
          if (!burst.current || now - burst.current.at > BURST_MS)
            burst.current = { txId: newId('tx'), at: now };
          burst.current.at = now;
          txId = burst.current.txId;
        }
        bus.dispatch(
          { type: 'text.set', slideId, elementId: element.id, content },
          { txId, label: step ? (step.label ?? 'Format') : 'Typing' },
        );
        // A growing text box writes its new height to the frame, in the same undo step.
        syncGrowHeight(bus, element.id, txId, () =>
          ed.view.dom.closest<HTMLElement>('[data-element-id]'),
        );
      },
      onCreate: ({ editor: ed }) => {
        const pos = caretAt ? ed.view.posAtCoords({ left: caretAt.x, top: caretAt.y }) : null;
        if (pos) ed.commands.setTextSelection(pos.pos);
        ed.commands.focus(pos ? null : 'end');
      },
    },
    [theme],
  );

  useEffect(() => {
    if (!editor) return;
    return announceEditor({ editor, slideId, elementId: element.id });
  }, [editor, slideId, element.id]);

  // An undo, a redo or the agent changed the text while it is being edited: show the model's.
  const external = signature(normalizeRichText(element.content ?? { paragraphs: [] }));
  useEffect(() => {
    if (!editor || external === written.current) return;
    written.current = external;
    const { anchor, head } = editor.state.selection;
    editor.commands.setContent(richTextToDoc(element.content ?? { paragraphs: [] }), {
      emitUpdate: false,
    });
    // The selection stays where it was, as far as the new text allows.
    const { doc } = editor.state;
    const at = (pos: number) => doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
    editor.view.dispatch(
      editor.state.tr
        .setSelection(TextSelection.between(at(anchor), at(head)))
        .setMeta('preventUpdate', true),
    );
    burst.current = null;
  }, [editor, external, element.content]);

  return <EditorContent editor={editor} />;
}
