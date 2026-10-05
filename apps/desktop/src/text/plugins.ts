import { plainText, type Direction, type ListInfo, type Marks, type RichText } from '@slidr/model';
import { colorCss, listMarkers, MARKER_EM, readsAsNumber, runStyle } from '@slidr/renderer';
import type { JSONContent } from '@tiptap/core';
import { Slice, type Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection, type Transaction } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import type { TextTarget } from './actions';
import { resolveDirection } from './bidi';
import { caretMarks, marksOf, paragraphProps, STEP_META, toPmMarks } from './editorFormat';
import { paint, painter } from './painter';
import {
  pastedText,
  SLIDR_TEXT_MIME,
  type ClipboardText,
  type Destination,
  type PasteMode,
  type SourceContext,
} from './paste';
import { cleanMarks, docToRichText, richTextToDoc } from './richTextDoc';
import { cssText } from './schema';

/* The ProseMirror plugins of the slide text editor. See `TextEditor.tsx`. */

/** The marks that decide how the first glyph of a paragraph looks: its first run's, or its empty line's. */
function firstMarks(node: PmNode): Marks | undefined {
  if (node.firstChild) return marksOf(node.firstChild.marks);
  return (node.attrs.emptyMarks as Marks | null) ?? undefined;
}

/**
 * What the editor draws around the text, as the renderer draws it:
 * - List markers, as widgets the caret skips. A marker carries the direction of its paragraph
 *   itself, so that a lettered marker ("a.") is not the first strong character of a `dir: auto`
 *   paragraph and does not turn a Hebrew list item around.
 * - A `dir: auto` line gets the direction the renderer gives it (`paragraphDirection`): by its
 *   first letter, and the deck's direction when it has none, so the caret of a new Hebrew text
 *   box starts on the right and stays there while a number is typed.
 * - An empty line that keeps formatting is as tall as its text would be.
 */
export function decorationsPlugin(emptyDir: () => Direction): Plugin {
  return new Plugin({
    props: {
      decorations(state) {
        const nodes: { node: PmNode; pos: number }[] = [];
        state.doc.forEach((node, pos) => nodes.push({ node, pos }));
        const markers = listMarkers(
          nodes.map(({ node }) => {
            const list = node.attrs.list as ListInfo | null;
            return { dir: 'auto', align: 'start', runs: [], ...(list ? { list } : {}) };
          }),
        );
        const decorations: Decoration[] = [];
        nodes.forEach(({ node, pos }, i) => {
          const empty = node.content.size === 0;
          const fallback = emptyDir();
          const dir = resolveDirection(paragraphProps(node).dir, node.textContent, fallback);
          if (node.attrs.dir === 'auto') {
            decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir }));
            // Figures only, in a Hebrew deck: on the deck's side, but read from the left, run by
            // run, as the renderer draws them (`readsAsNumber`).
            if (readsAsNumber('auto', node.textContent, fallback))
              decorations.push(Decoration.inline(pos + 1, pos + node.nodeSize - 1, { dir: 'ltr' }));
          }
          const first = firstMarks(node);
          const list = node.attrs.list as ListInfo | null;
          const text = markers[i];
          if (list && text !== undefined) {
            const color = list.color ?? first?.color;
            const style = cssText({
              display: 'inline-block',
              width: `${MARKER_EM}em`,
              marginInlineStart: `-${MARKER_EM}em`,
              textIndent: 0,
              textAlign: 'start',
              textDecorationLine: 'none',
              ...(first?.size !== undefined ? { fontSize: first.size } : {}),
              ...(color ? { color: colorCss(color) } : {}),
            });
            decorations.push(
              Decoration.widget(
                pos + 1,
                () => {
                  const span = document.createElement('span');
                  span.textContent = text;
                  span.setAttribute('aria-hidden', 'true');
                  span.setAttribute('data-slidr-marker', '');
                  span.dir = dir;
                  span.contentEditable = 'false';
                  span.style.cssText = style;
                  return span;
                },
                { side: -1, key: `marker-${text}-${dir}-${style}` },
              ),
            );
          }
          if (empty && first) {
            // The height of the line: an empty box in the run's font and size.
            const style = cssText(runStyle(first, 'body'));
            decorations.push(
              Decoration.widget(
                pos + 1,
                () => {
                  const span = document.createElement('span');
                  span.textContent = '\u200B';
                  span.setAttribute('aria-hidden', 'true');
                  span.contentEditable = 'false';
                  span.style.cssText = style;
                  return span;
                },
                { side: -1, key: `strut-${style}` },
              ),
            );
          }
        });
        return DecorationSet.create(state.doc, decorations);
      },
    },
  });
}

/**
 * Formatting of empty lines. ProseMirror keeps formatting on text; a line without text keeps it in
 * the paragraph's `emptyMarks`, as the model keeps it on an empty run.
 * - A line that is emptied, or begun with Enter, keeps the formatting the caret had.
 * - The caret on such a line types in that formatting.
 * - A line that has text again carries its formatting on the text.
 */
export function emptyLinePlugin(): Plugin {
  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      // When the model's text replaced the document (undo, the agent), it is not ours to adjust.
      const external = transactions.some((tr) => tr.getMeta('preventUpdate'));
      const changed = !external && transactions.some((tr) => tr.docChanged);
      let tr: Transaction | null = null;
      if (changed) {
        newState.doc.forEach((node, pos) => {
          if (node.content.size > 0 && node.attrs.emptyMarks)
            (tr ??= newState.tr).setNodeAttribute(pos, 'emptyMarks', null);
        });
      }
      const { selection, schema } = newState;
      const node = selection.$from.parent;
      if (!selection.empty || node.type.name !== 'paragraph' || node.content.size > 0) return tr;
      const kept = node.attrs.emptyMarks as Marks | null;
      if (changed && !kept) {
        const carried = newState.storedMarks ? marksOf(newState.storedMarks) : caretMarks(oldState);
        // A link belongs to its text, not to the line.
        const marks = cleanMarks({ ...carried, link: undefined });
        if (marks) {
          tr ??= newState.tr;
          tr.setNodeAttribute(selection.$from.before(), 'emptyMarks', marks);
          tr.setStoredMarks(toPmMarks(schema, marks));
        }
      } else if (kept && !newState.storedMarks) {
        (tr ??= newState.tr).setStoredMarks(toPmMarks(schema, kept));
      }
      return tr;
    },
  });
}

/** The colour of the app's own text selection (`::selection` in the design system's theme.css). */
const SELECTION_STYLE =
  'background-color: color-mix(in oklab, var(--color-ui-accent) 30%, transparent)';

/**
 * Keeps the selection on show while the focus is elsewhere: in a field of the toolbar, or in a
 * popover. The browser draws no selection in an editor without focus, and without it there is no
 * telling what a colour or a size is about to change.
 */
export function blurredSelectionPlugin(): Plugin {
  const key = new PluginKey<boolean>('slidrBlurredSelection');
  return new Plugin<boolean>({
    key,
    state: {
      init: () => false,
      // The core `focusEvents` extension reports focus and blur as transactions.
      apply(tr, blurred) {
        if (tr.getMeta('blur')) return true;
        if (tr.getMeta('focus')) return false;
        return blurred;
      },
    },
    props: {
      decorations(state) {
        const { from, to, empty } = state.selection;
        if (empty || !key.getState(state)) return null;
        return DecorationSet.create(state.doc, [
          Decoration.inline(from, to, { style: SELECTION_STYLE, 'data-blurred-selection': '' }),
        ]);
      },
    },
  });
}

/**
 * The format painter inside the editor (TXT-10). While the brush is in hand, what the mouse
 * selects takes the picked format when the button is let go; a plain click paints the word under
 * it. The button may be let go outside the text, so the whole document is listened to; and the
 * editor learns of the new selection a moment after the button, so the painting waits for it.
 */
export function painterPlugin(target: () => TextTarget): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view) {
          if (!painter.getState().armed) return false;
          const onUp = () =>
            setTimeout(() => {
              if (!view.isDestroyed && painter.getState().armed) paint(target());
            });
          document.addEventListener('mouseup', onUp, { once: true });
          return false;
        },
      },
    },
  });
}

/**
 * A right click in the text (STG-06). Outside what is selected it moves the caret to where it
 * was made, as in every editor, so that a paste from the menu lands there; inside the selection
 * it leaves the selection, so that cut and copy are of what was selected. The browser moves its
 * own caret, but the editor would never hear of it: the menu takes the keyboard first.
 */
export function rightClickPlugin(): Plugin {
  return new Plugin({
    props: {
      handleDOMEvents: {
        contextmenu(view, event) {
          // The menu key opens the menu where the caret is.
          if (event.button !== 2) return false;
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const { from, to, empty } = view.state.selection;
          if (!at || (!empty && at.pos >= from && at.pos <= to)) return false;
          const caret = TextSelection.near(view.state.doc.resolve(at.pos));
          view.dispatch(view.state.tr.setSelection(caret));
          return false;
        },
      },
    },
  });
}

/** How long after a key that asks for a kind of paste a paste event still counts as that kind. */
const ARMED_MS = 1000;

/** What a paste needs of the deck it pastes into; asked when something is pasted. */
export interface PasteContext {
  /** For keeping the source's formatting: the fonts and the colours of the deck (`pasteSource.ts`). */
  source: () => SourceContext;
  /** The direction of a paragraph without letters: the deck's, and in a table the table's. */
  dir: () => Direction;
}

let armed: { mode: PasteMode; until: number } | null = null;

/**
 * Says that the paste event which follows is of this kind. For a key that the browser itself
 * turns into a paste: the key says the kind, and the paste event brings the clipboard, which
 * only it can read without asking for permission.
 */
export function armPaste(mode: PasteMode): void {
  armed = { mode, until: performance.now() + ARMED_MS };
}

/** The kind of paste a key asked for a moment ago, if no paste event has taken it yet. */
export function takeArmedPaste(): PasteMode | undefined {
  const mode = armed && performance.now() < armed.until ? armed.mode : undefined;
  armed = null;
  return mode;
}

/**
 * The text copied or cut last in this window. A menu's "Paste" reads the clipboard of the
 * system; where that is not allowed, it still pastes what was copied here. It also tells the
 * text of the clipboard as Slidr's own, which only a paste event can read in Slidr's format.
 */
let copied: ClipboardText | undefined;

const sameLines = (a: string, b: string) =>
  a.replace(/\r\n?/g, '\n').trimEnd() === b.replace(/\r\n?/g, '\n').trimEnd();

/**
 * Reads the text of the system clipboard outside a paste event: for a click on a menu. The
 * webview may ask the user for permission, or refuse; what was copied in this window is the
 * answer then, and undefined when there is nothing.
 */
export async function readClipboard(): Promise<ClipboardText | undefined> {
  try {
    // As a paste event gives it, with the stylesheets a word processor says its formatting in:
    // it is read, never inserted (`paste.ts`).
    const clipboard: { read(options?: object): Promise<ClipboardItems> } = navigator.clipboard;
    const data: ClipboardText = { html: '', text: '', slidr: '' };
    for (const item of await clipboard.read({ unsanitized: ['text/html'] })) {
      if (!data.html && item.types.includes('text/html'))
        data.html = await (await item.getType('text/html')).text();
      if (!data.text && item.types.includes('text/plain'))
        data.text = await (await item.getType('text/plain')).text();
    }
    if (copied && sameLines(copied.text, data.text)) data.slidr = copied.slidr;
    return data.html || data.text ? data : undefined;
  } catch {
    return copied;
  }
}

/** Puts pasted text where the selection is, as one undo step. */
function insertRichText(
  view: EditorView,
  content: (destination: Destination) => RichText,
  dir: Direction,
): void {
  const { state } = view;
  const { $from, empty } = state.selection;
  const destination = $from.parent;
  const rich = content({
    paragraph: paragraphProps(destination),
    marks: caretMarks(state),
    dir,
  });
  const fragment = state.schema.nodeFromJSON(richTextToDoc(rich)).content;
  const tr = state.tr;
  if (empty && destination.content.size === 0 && rich.paragraphs.length > 0) {
    // An empty line is replaced whole, so that the first pasted paragraph keeps what it is
    // (a list item stays a list item) instead of dissolving into the line it lands on.
    const start = $from.before();
    tr.replaceWith(start, $from.after(), fragment);
    tr.setSelection(TextSelection.create(tr.doc, start + fragment.size - 1));
  } else {
    // The first and the last paragraph join the text around the caret.
    tr.replaceSelection(new Slice(fragment, 1, 1));
  }
  view.dispatch(
    tr.setMeta('paste', true).setMeta('uiEvent', 'paste').setMeta(STEP_META, { label: 'Paste' }),
  );
}

/**
 * Pastes text into the editor in one of the kinds of paste. False when there was no text to
 * paste; the document is then as it was.
 */
export function pasteInto(
  view: EditorView,
  data: ClipboardText,
  mode: PasteMode,
  context: PasteContext,
): boolean {
  const content = pastedText(data, mode, context.source());
  if (!content) return false;
  insertRichText(view, content, context.dir());
  return true;
}

/**
 * Pastes from the system clipboard outside a paste event (a menu, or a key the browser does not
 * turn into a paste). False when the clipboard could not be read or holds no text.
 */
export async function pasteFromClipboard(
  view: EditorView,
  mode: PasteMode,
  context: PasteContext,
): Promise<boolean> {
  const data = await readClipboard();
  if (!data || view.isDestroyed) return false;
  // The click that asked for it took the keyboard; the text has it again, with its caret.
  view.focus();
  return pasteInto(view, data, mode, context);
}

/**
 * The clipboard (WG4-T06). Paste: Slidr's own copied text keeps its formatting; HTML is mapped to
 * a `RichText` in the style of the destination; plain text becomes paragraphs. Ctrl+Shift+V pastes
 * plain text, and a key or a menu may ask for another kind (`PasteMode`). Copy and cut put the
 * selection on the clipboard as HTML, as plain text and as the `RichText` itself.
 */
export function clipboardPlugin(context: PasteContext): Plugin {
  let plainUntil = 0;

  const copy = (view: EditorView, event: ClipboardEvent): boolean => {
    const { selection } = view.state;
    const data = event.clipboardData;
    if (selection.empty || !data) return false;
    const slice = selection.content();
    const { dom } = view.serializeForClipboard(slice);
    const rich = docToRichText({ type: 'doc', content: slice.content.toJSON() as JSONContent[] });
    event.preventDefault();
    data.clearData();
    copied = { html: dom.innerHTML, text: plainText(rich), slidr: JSON.stringify(rich) };
    data.setData('text/html', copied.html);
    // One line per paragraph, so that the text pastes back as the same paragraphs.
    data.setData('text/plain', copied.text);
    data.setData(SLIDR_TEXT_MIME, copied.slidr);
    if (event.type === 'cut')
      view.dispatch(view.state.tr.deleteSelection().setMeta('uiEvent', 'cut'));
    return true;
  };

  return new Plugin({
    props: {
      handleKeyDown(_view, event) {
        if (event.code === 'KeyV' && (event.ctrlKey || event.metaKey))
          plainUntil = event.shiftKey ? performance.now() + ARMED_MS : 0;
        return false;
      },
      handlePaste(view, event) {
        const data = event.clipboardData;
        const plain = performance.now() < plainUntil;
        plainUntil = 0;
        const asked = takeArmedPaste();
        if (!data) return false;
        pasteInto(
          view,
          {
            html: data.getData('text/html'),
            text: data.getData('text/plain'),
            slidr: data.getData(SLIDR_TEXT_MIME),
          },
          plain ? 'plain' : (asked ?? 'auto'),
          context,
        );
        // Handled either way: nothing from the clipboard reaches the document unread.
        return true;
      },
      handleDOMEvents: { copy, cut: copy },
    },
  });
}
