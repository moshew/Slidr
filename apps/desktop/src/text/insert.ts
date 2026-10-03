import { createElement, findElementInDeck, findSlide, newId, plainText } from '@slidr/model';
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

/**
 * When editing of a new text box ends and nothing was typed, the box goes: an empty text box is
 * invisible, and would stay on the slide unnoticed. If adding it is still the latest change it
 * leaves no trace in the history; otherwise removing it is a step that can be undone.
 */
function discardIfLeftEmpty({ bus, selection }: Editor, elementId: string, txId: string): void {
  const stop = selection.subscribe((state) => {
    if (state.editingElementId === elementId) return;
    stop();
    const found = findElementInDeck(bus.deck, elementId);
    if (!found || found.element.type !== 'text' || plainText(found.element.content) !== '') return;
    if (bus.rollback(txId)) return;
    bus.dispatch(
      { type: 'element.remove', slideId: found.slide.id, elementIds: [elementId] },
      { label: i18n.t('text:step.insert') },
    );
  });
}
