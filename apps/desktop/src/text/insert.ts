import {
  createElement,
  findElementInDeck,
  findSlide,
  newId,
  plainText,
  type Affected,
  type CommandBus,
} from '@slidr/model';
import { i18n } from '../i18n';
import type { Editor } from '../shell';

/* Inserting a text box (row A "Text", the `T` key). */

/** The width of a new text box, as a part of the slide's width. */
const WIDTH = 0.4;
/** A new box that would sit exactly on another one is put this far down and across. */
const CASCADE = 32;

/**
 * Adds a text box in the middle of the current slide and starts editing it. The box is one line
 * of body text tall and grows with what is typed; its paragraph takes its direction from the text.
 * Adding it is one undo step. A box that is left without any text is taken away again.
 */
export function insertTextBox(editor: Editor): boolean {
  const { bus, selection } = editor;
  const slide = findSlide(bus.deck, selection.getState().currentSlideId ?? '');
  if (!slide) return false;
  const { size, theme } = bus.deck;
  const body = theme.textStyles.body;
  const w = Math.round(size.w * WIDTH);
  const h = Math.ceil(body.size * body.lineHeight);
  let x = Math.round((size.w - w) / 2);
  let y = Math.round((size.h - h) / 2);
  while (slide.elements.some((e) => e.frame.x === x && e.frame.y === y)) {
    x += CASCADE;
    y += CASCADE;
  }
  const element = createElement.text({
    frame: { x, y, w, h },
    autoFit: 'growHeight',
    content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [] }] },
  });
  const txId = newId('tx');
  bus.dispatch(
    { type: 'element.add', slideId: slide.id, element },
    { txId, label: i18n.t('text:step.insert') },
  );
  selection.getState().startEditing(element.id);
  discardIfLeftEmpty(editor, element.id, txId);
  return true;
}

/** A step that changed this one element of this slide and nothing else of the deck. */
function onlyOf(affected: Affected, slideId: string, elementId: string): boolean {
  return (
    !affected.meta &&
    !affected.theme &&
    !affected.slideOrder &&
    affected.layouts.length === 0 &&
    affected.assets.length === 0 &&
    affected.slides.every((id) => id === slideId) &&
    affected.elements.every((id) => id === elementId)
  );
}

/**
 * Takes a new box that got no text out of the history together with everything that was done to
 * it since it was added: a format key on its empty line, text that was typed and deleted again.
 * Each of those is a step of the box alone, and none of them means anything without the box.
 * False, with nothing changed, when something else happened in between (another element, the
 * theme, a turn of the agent): the history is then not this box's to take apart.
 */
function forget(bus: CommandBus, slideId: string, elementId: string, txId: string): boolean {
  const stack = bus.undoStack;
  const added = stack.findIndex((entry) => entry.txId === txId);
  if (added < 0) return false;
  const since = stack.slice(added + 1);
  const own = since.every(
    (entry) =>
      entry.actor === 'user' &&
      entry.txId !== undefined &&
      onlyOf(entry.affected, slideId, elementId),
  );
  if (!own) return false;
  // From the latest back to the one that added the box: each is the latest when its turn comes.
  for (const entry of since.reverse()) bus.rollback(entry.txId as string);
  return bus.rollback(txId);
}

/**
 * When editing of a new text box ends and nothing was typed, the box goes: an empty text box is
 * invisible, and would stay on the slide unnoticed. It leaves no trace in the history, and
 * neither does what was done to it alone; only when something else was changed in between is
 * removing it a step of its own, which can be undone.
 */
function discardIfLeftEmpty({ bus, selection }: Editor, elementId: string, txId: string): void {
  const stop = selection.subscribe((state) => {
    if (state.editingElementId === elementId) return;
    stop();
    const found = findElementInDeck(bus.deck, elementId);
    if (!found || found.element.type !== 'text' || plainText(found.element.content) !== '') return;
    if (forget(bus, found.slide.id, elementId, txId)) return;
    bus.dispatch(
      { type: 'element.remove', slideId: found.slide.id, elementIds: [elementId] },
      { label: i18n.t('text:step.insert') },
    );
  });
}
