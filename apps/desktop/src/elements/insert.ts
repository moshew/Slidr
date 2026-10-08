import { createElement, findSlide, type Frame } from '@slidr/model';
import { i18n } from '../i18n';
import { centredFrame } from '../objects/shapes';
import { focusStage, type Editor } from '../shell';
import { rememberSticker, type RecentSticker } from './recent';

/** The side of a new graphic or emoji on the slide, in slide pixels. */
const SIDE = 260;

/**
 * Places a graphic or an emoji on the current slide, as a self-contained vector drawing whose
 * colours can be changed, and remembers it for the first screen of Elements. One undo step.
 */
export function insertSticker(editor: Editor, sticker: RecentSticker): boolean {
  const slideId = editor.selection.getState().currentSlideId;
  if (!slideId) return false;
  const taken: Frame[] = findSlide(editor.bus.deck, slideId)?.elements.map((e) => e.frame) ?? [];
  const element = createElement.svg({
    frame: centredFrame({ w: SIDE, h: SIDE }, editor.bus.deck.size, taken),
    markup: sticker.markup,
    name: sticker.id,
  });
  editor.bus.dispatch(
    { type: 'element.add', slideId, element },
    { label: i18n.t('elements:history.insert') },
  );
  editor.selection.getState().selectElements([element.id]);
  rememberSticker(sticker);
  focusStage();
  return true;
}
