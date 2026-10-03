import {
  findElementInDeck,
  newId,
  type CellRef,
  type CommandBus,
  type Direction,
  type RichText,
  type ShapeElement,
  type TableElement,
  type TextElement,
  type Theme,
} from '@slidr/model';
import { cellTextDefaults } from '@slidr/renderer';
import { Extension } from '@tiptap/core';
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { flipDirection, syncGrowHeight, toggleBold, toggleMark, type TextTarget } from './actions';
import { announceEditor } from './activeEditor';
import { cellsWritten } from './cellScope';
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
 *
 * The same editor edits one cell of a table (WG6): it sits in the cell (`CellSlot`), writes
 * `text.set` with the cell, and takes the cell's direction and text defaults from its table.
 */
export interface TextEditorProps {
  bus: CommandBus;
  slideId: string;
  element: TextElement | ShapeElement | TableElement;
  /** For a table: the cell whose text is edited. */
  cell?: CellRef;
  theme: Theme;
  /** Where the user double-clicked, to put the caret there. Without it the caret goes to the end. */
  caretAt?: { x: number; y: number };
  /** Without `caretAt`: the caret at the end of the text (the default), or all of it selected. */
  select?: 'end' | 'all';
  /**
   * What was typed to open the editor (a character on a selected table cell): it takes the place
   * of all the text, in the formatting the text had, as the first of the typing that follows.
   */
  replaceWith?: string;
  /**
   * Keys the host takes before the editor does, by their ProseMirror names: Tab between the cells
   * of a table. A handler that returns false leaves the key to the editor.
   */
  keys?: Record<string, () => boolean>;
  /** Esc: leave editing. */
  onExit: () => void;
}

/** A pause in typing longer than this starts a new undo step (ADR-006). */
const BURST_MS = 650;
/** How long after it opened with a typed character the editor is still settling its selection. */
const OPENING_MS = 200;

const NO_TEXT: RichText = { paragraphs: [] };

const signature = (value: unknown) => JSON.stringify(value);

type Dispatch = (tr: Transaction) => void;

/** The text the editor is open on: the element's own, or that of one cell of a table. */
function editedText(element: TextEditorProps['element'], cell: CellRef | undefined): RichText {
  if (element.type !== 'table') return element.content ?? NO_TEXT;
  return (cell ? element.cells[cell.row]?.[cell.col]?.content : undefined) ?? NO_TEXT;
}

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

export function TextEditor({
  bus,
  slideId,
  element,
  cell,
  theme,
  caretAt,
  select = 'end',
  replaceWith,
  keys,
  onExit,
}: TextEditorProps) {
  // What the editor's handlers call when they run: the editor outlives the render that made it.
  const exitRef = useRef(onExit);
  const keysRef = useRef(keys);
  const burst = useRef<{ txId: string; at: number } | null>(null);
  /** When the editor opened with a typed character (`replaceWith`); 0 when it did not. */
  const openedTyping = useRef(0);
  /** What the editor last wrote to the model, to tell our own changes from undo or the agent's. */
  const written = useRef<string>(signature(normalizeRichText(editedText(element, cell))));

  useEffect(() => {
    exitRef.current = onExit;
    keysRef.current = keys;
  });

  /**
   * The direction of a `dir: auto` line without letters: the deck's, and in a table the table's
   * (SPEC 5.4). Read from the deck when it is asked for: the direction of a table can change
   * while one of its cells is edited.
   */
  const emptyDir = (): Direction => {
    const current = findElementInDeck(bus.deck, element.id)?.element;
    return current?.type === 'table' ? current.dir : bus.deck.meta.dir;
  };

  // The text of a table cell starts from what its table gives it: the header row's colour and
  // weight. The renderer draws the cell with the same, so nothing changes when editing starts.
  const defaults =
    element.type === 'table' && cell ? cellTextDefaults(element, cell.row, cell.col) : undefined;

  const editor = useEditor(
    {
      extensions: [
        ...textExtensions({
          // Paragraph styles read the theme when they draw; a theme change rebuilds the editor.
          getTheme: () => theme,
          styleRef: 'body',
          wrap: element.type === 'text' ? (element.wrap ?? true) : true,
          color: defaults?.color,
          weight: defaults?.weight,
          alignTo: defaults?.alignTo,
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
            const ctx = (): FormatContext => ({ theme, dir: emptyDir() });
            const own: Record<string, () => boolean> = {
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
            // The host's keys come first; one that declines leaves the key to the editor.
            const shortcuts = { ...own };
            for (const name of Object.keys(keys ?? {})) {
              shortcuts[name] = () =>
                Boolean(keysRef.current?.[name]?.()) || (own[name]?.() ?? false);
            }
            return shortcuts;
          },
          addProseMirrorPlugins: () => [
            decorationsPlugin(emptyDir),
            emptyLinePlugin(),
            blurredSelectionPlugin(),
            clipboardPlugin(),
          ],
        }),
      ],
      content: richTextToDoc(editedText(element, cell)),
      editorProps: {
        attributes: {
          'data-text-editor': '',
          spellcheck: 'false',
          style:
            'outline: none; white-space: pre-wrap; overflow-wrap: break-word; caret-color: auto;',
        },
      },
      onSelectionUpdate: ({ transaction }) => {
        // Moving the caret ends the typing burst. Not the selection the browser reports as the
        // editor takes the focus, right after it opened with a typed character: that character
        // and the typing that follows it are one burst.
        const opening = performance.now() - openedTyping.current < OPENING_MS;
        if (!transaction.docChanged && !opening) burst.current = null;
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
          { type: 'text.set', slideId, elementId: element.id, content, ...(cell ? { cell } : {}) },
          { txId, label: step ? (step.label ?? 'Format') : 'Typing' },
        );
        if (element.type === 'table') {
          // A row is as tall as its text: the table area writes the new heights, in the same step.
          cellsWritten(bus, element.id, txId);
        } else {
          // A growing text box writes its new height to the frame, in the same undo step.
          syncGrowHeight(bus, element.id, txId, () =>
            ed.view.dom.closest<HTMLElement>('[data-element-id]'),
          );
        }
      },
      onCreate: ({ editor: ed }) => {
        const pos = caretAt ? ed.view.posAtCoords({ left: caretAt.x, top: caretAt.y }) : null;
        if (pos) {
          // A point beside the text (in a table cell, most of the cell) is between two lines: the
          // caret goes to the nearest place in the text.
          const at = ed.state.doc.resolve(pos.pos);
          if (at.parent.inlineContent) ed.commands.setTextSelection(pos.pos);
          else ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(at)));
        } else if (select === 'all') ed.commands.selectAll();
        ed.commands.focus(pos || select === 'all' ? null : 'end');
        if (replaceWith) {
          // From the start of the first line to the end of the last: the first paragraph stays,
          // with its direction and alignment, and the new text takes the marks of the old.
          const { doc, tr } = ed.state;
          const all = TextSelection.create(doc, 1, doc.content.size - 1);
          openedTyping.current = performance.now();
          ed.view.dispatch(tr.setSelection(all).insertText(replaceWith));
        }
      },
    },
    [theme, defaults?.color, defaults?.weight, defaults?.alignTo],
  );

  useEffect(() => {
    if (!editor) return;
    return announceEditor({ editor, slideId, elementId: element.id, ...(cell ? { cell } : {}) });
    // The cell is given as a new object on every render; its place is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, slideId, element.id, cell?.row, cell?.col]);

  // An undo, a redo or the agent changed the text while it is being edited: show the model's.
  const text = editedText(element, cell);
  const external = signature(normalizeRichText(text));
  useEffect(() => {
    if (!editor || external === written.current) return;
    written.current = external;
    const { anchor, head } = editor.state.selection;
    editor.commands.setContent(richTextToDoc(text), { emitUpdate: false });
    // The selection stays where it was, as far as the new text allows.
    const { doc } = editor.state;
    const at = (pos: number) => doc.resolve(Math.max(0, Math.min(pos, doc.content.size)));
    editor.view.dispatch(
      editor.state.tr
        .setSelection(TextSelection.between(at(anchor), at(head)))
        .setMeta('preventUpdate', true),
    );
    burst.current = null;
  }, [editor, external, text]);

  return <EditorContent editor={editor} />;
}
