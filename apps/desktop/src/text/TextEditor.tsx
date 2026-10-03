import {
  newId,
  type CommandBus,
  type ListInfo,
  type ShapeElement,
  type TextElement,
  type Theme,
} from '@slidr/model';
import { colorCss, listMarkers, MARKER_EM } from '@slidr/renderer';
import { Extension } from '@tiptap/core';
import { Plugin, type EditorState, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import { docToRichText, normalizeRichText, richTextToDoc } from './richTextDoc';
import { textExtensions } from './schema';

/**
 * In-place text editing on the Stage (WG4-T02, TXT-01), following ADR-006:
 * - TipTap sits inside the scaled slide, in the element's own text box (`TextSlot`), so the text
 *   does not move when editing starts.
 * - TipTap keeps no history. Every change is `text.set` on the bus, and a burst of typing is one
 *   transaction: a pause of 650ms or a caret move starts the next (rule 3). Ctrl+Z is the bus's.
 * - The caret and the selection are the browser's own (rule 2).
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

/** List markers drawn as the renderer draws them, as widgets the caret skips. */
function markerPlugin(): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const paragraphs: { pos: number; list: ListInfo | null; size?: number }[] = [];
        state.doc.forEach((node, offset) => {
          const firstMarks = node.firstChild?.marks ?? [];
          const size = firstMarks.find((m) => m.type.name === 'size')?.attrs.value as
            number | undefined;
          paragraphs.push({
            pos: offset,
            list: (node.attrs.list as ListInfo | null) ?? null,
            size,
          });
        });
        const markers = listMarkers(
          paragraphs.map((p) => ({
            dir: 'auto',
            align: 'start',
            runs: [],
            ...(p.list ? { list: p.list } : {}),
          })),
        );
        const decorations: Decoration[] = [];
        paragraphs.forEach((p, i) => {
          const text = markers[i];
          if (!p.list || text === undefined) return;
          const list = p.list;
          decorations.push(
            Decoration.widget(
              p.pos + 1,
              () => {
                const span = document.createElement('span');
                span.textContent = text;
                span.setAttribute('aria-hidden', 'true');
                span.contentEditable = 'false';
                Object.assign(span.style, {
                  display: 'inline-block',
                  width: `${MARKER_EM}em`,
                  marginInlineStart: `-${MARKER_EM}em`,
                  textIndent: '0',
                  textAlign: 'start',
                  ...(p.size ? { fontSize: `${p.size}px` } : {}),
                  ...(list.color ? { color: colorCss(list.color) } : {}),
                });
                return span;
              },
              { side: -1, key: `marker-${text}-${list.color ? JSON.stringify(list.color) : ''}` },
            ),
          );
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

const signature = (value: unknown) => JSON.stringify(value);

type Dispatch = (tr: Transaction) => void;

/** The paragraphs the selection touches, with their positions. */
function selectedParagraphs(state: EditorState): { pos: number; list: ListInfo | null }[] {
  const out: { pos: number; list: ListInfo | null }[] = [];
  const { from, to } = state.selection;
  state.doc.nodesBetween(from, to, (node, pos) => {
    if (node.type.name !== 'paragraph') return true;
    out.push({ pos, list: (node.attrs.list as ListInfo | null) ?? null });
    return false;
  });
  return out;
}

/**
 * Tab / Shift+Tab: one list level deeper or shallower (TXT-06). Outside a list Tab does nothing,
 * but it is still taken, so focus does not leave the text box.
 */
function shiftLevel(state: EditorState, dispatch: Dispatch, by: 1 | -1): boolean {
  const tr = state.tr;
  for (const p of selectedParagraphs(state)) {
    if (!p.list) continue;
    const level = Math.max(0, Math.min(8, p.list.level + by));
    if (level !== p.list.level) tr.setNodeAttribute(p.pos, 'list', { ...p.list, level });
  }
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

  /** A growing text box writes its new height to the frame, in the same undo step as the typing. */
  const syncHeight = (dom: HTMLElement, txId: string) => {
    requestAnimationFrame(() => {
      const box = dom.closest<HTMLElement>('[data-element-id]');
      const current = bus.deck.slides
        .find((s) => s.id === slideId)
        ?.elements.find((e) => e.id === element.id);
      if (!box || !current) return;
      const h = Math.round(box.offsetHeight);
      if (h > 0 && Math.abs(h - current.frame.h) >= 1) {
        bus.dispatch(
          {
            type: 'element.update',
            slideId,
            elementId: element.id,
            patch: { frame: { ...current.frame, h } },
          },
          { txId, label: 'Typing' },
        );
      }
    });
  };

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
            return {
              Tab: () => shiftLevel(ed.state, ed.view.dispatch, 1),
              'Shift-Tab': () => shiftLevel(ed.state, ed.view.dispatch, -1),
              Enter: () => leaveEmptyListItem(ed.state, ed.view.dispatch),
              Backspace: () => unlistAtStart(ed.state, ed.view.dispatch),
              'Mod-z': () => bus.undo() || true,
              'Mod-y': () => bus.redo() || true,
              'Shift-Mod-z': () => bus.redo() || true,
              Escape: () => {
                exitRef.current();
                return true;
              },
            };
          },
          addProseMirrorPlugins: () => [markerPlugin()],
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
      onUpdate: ({ editor: ed }) => {
        const content = docToRichText(ed.getJSON());
        written.current = signature(content);
        const now = performance.now();
        if (!burst.current || now - burst.current.at > BURST_MS)
          burst.current = { txId: newId('tx'), at: now };
        burst.current.at = now;
        bus.dispatch(
          { type: 'text.set', slideId, elementId: element.id, content },
          { txId: burst.current.txId, label: 'Typing' },
        );
        if (element.type === 'text' && element.autoFit === 'growHeight')
          syncHeight(ed.view.dom, burst.current.txId);
      },
      onCreate: ({ editor: ed }) => {
        const pos = caretAt ? ed.view.posAtCoords({ left: caretAt.x, top: caretAt.y }) : null;
        if (pos) ed.commands.setTextSelection(pos.pos);
        ed.commands.focus(pos ? null : 'end');
      },
    },
    [theme],
  );

  // An undo, a redo or the agent changed the text while it is being edited: show the model's.
  const external = signature(normalizeRichText(element.content ?? { paragraphs: [] }));
  useEffect(() => {
    if (!editor || external === written.current) return;
    written.current = external;
    const { from } = editor.state.selection;
    editor.commands.setContent(richTextToDoc(element.content ?? { paragraphs: [] }), {
      emitUpdate: false,
    });
    editor.commands.setTextSelection(Math.min(from, editor.state.doc.content.size - 1));
    burst.current = null;
  }, [editor, external, element.content]);

  return <EditorContent editor={editor} />;
}
