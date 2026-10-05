import { createElement, newId } from '@slidr/model';
import { i18n } from '../i18n';
import { focusStage, tell, type Editor } from '../shell';
import { syncGrowHeight } from './actions';
import { activeEditor } from './activeEditor';
import { pastedText, type PasteMode } from './paste';
import { sourceContext } from './pasteSource';
import {
  armPaste,
  pasteFromClipboard,
  readClipboard,
  takeArmedPaste,
  type PasteContext,
} from './plugins';
import { formatContext, resolveTarget } from './toolbar/shared';

/*
 * The kinds of paste (TXT-13) from outside the text editor itself: a key of the shortcut
 * registry, and an entry of a menu. Ctrl+V and Ctrl+Shift+V stay the editor's own: the browser
 * turns them into a paste event, which carries the clipboard without asking anybody.
 */

/**
 * "Paste, keeping the source's formatting". Shift+Insert is the one key besides Ctrl+V and
 * Ctrl+Shift+V that the browser itself turns into a paste, so with it the clipboard comes in the
 * paste event; and it is a plain key to the shell (no Ctrl, no Alt), which lets it through.
 */
export const PASTE_SOURCE_KEYS = 'Shift+Insert';

function pasteContext(editor: Editor): PasteContext {
  return {
    source: () => sourceContext(editor.bus.deck),
    dir: () => formatContext(editor, resolveTarget(editor)).dir,
  };
}

/** Nothing was pasted: the clipboard could not be read, or holds no text. Ctrl+V always works. */
const tellNothing = () => tell(i18n.t('text:paste.nothingTitle'), i18n.t('text:paste.nothingBody'));

/**
 * Pastes into the text that is being edited, from a menu: the clipboard is read here, since no
 * paste event brings it. When it cannot be read, or holds no text, the user is told, and told
 * the key that always works.
 */
export async function pasteAs(editor: Editor, mode: PasteMode): Promise<void> {
  const active = activeEditor.getState().active;
  if (!active || active.editor.isDestroyed) return;
  const done = await pasteFromClipboard(active.editor.view, mode, pasteContext(editor));
  if (!done) await tellNothing();
}

/**
 * Pastes the text of the clipboard onto the slide, from the slide's menu, in a kind of paste: a
 * new text box in the middle of the slide, as wide as half of it, as plain text pasted on the
 * slide with Ctrl+V becomes. Where the text lands is body text of the deck. One undo step.
 */
export async function pasteTextBox(editor: Editor, mode: PasteMode): Promise<void> {
  const { bus, selection } = editor;
  const deckId = bus.deck.id;
  const data = await readClipboard();
  const slideId = selection.getState().currentSlideId;
  const content = data ? pastedText(data, mode, sourceContext(bus.deck)) : undefined;
  if (!content) return tellNothing();
  // Reading took a moment: another document may have been opened meanwhile.
  if (!slideId || bus.deck.id !== deckId) return;
  const rich = content({
    paragraph: { dir: 'auto', align: 'start', styleRef: 'body' },
    marks: undefined,
    dir: bus.deck.meta.dir,
  });
  const { size, theme } = bus.deck;
  const { size: line, lineHeight } = theme.textStyles.body;
  const w = size.w / 2;
  // The box grows with its text; this is the height it starts from.
  const h = Math.min(size.h, Math.ceil(rich.paragraphs.length * line * lineHeight));
  const element = createElement.text({
    frame: { x: (size.w - w) / 2, y: Math.round((size.h - h) / 2), w, h },
    autoFit: 'growHeight',
    content: rich,
  });
  const txId = newId('tx');
  bus.dispatch(
    { type: 'element.add', slideId, element },
    { txId, label: i18n.t('text:step.pasteText') },
  );
  selection.getState().selectElements([element.id]);
  syncGrowHeight(bus, element.id, txId);
  focusStage();
}

/**
 * The key of "paste, keeping the source's formatting", in the text that is being edited. It
 * says what kind the paste that follows is, and lets the key go on: the browser sends the paste
 * event. A key the browser does not turn into a paste (one the user chose in its place) sends
 * none, and the clipboard is read then.
 */
export function pasteSourceKey(editor: Editor, event: KeyboardEvent): boolean {
  const active = activeEditor.getState().active;
  const inText =
    active && event.target instanceof Node && active.editor.view.dom.contains(event.target);
  if (!inText) return false;
  armPaste('source');
  setTimeout(() => {
    if (takeArmedPaste() === 'source') void pasteAs(editor, 'source');
  });
  return false;
}
