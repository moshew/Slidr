import { createElement, findSlide, type Frame, type ImageElement } from '@slidr/model';
import { i18n } from '../i18n';
import { centredFrame } from '../objects/shapes';
import type { Target } from '../objects/target';
import { focusStage, type Editor } from '../shell';
import { newCardSet, readingOf, type CardSetId } from './cardSets';
import { framedElement, frameSizeOn, loadFrames, reframe, type PhotoFrame } from './frames';
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

/**
 * Places a photo frame on the current slide: a picture with no photograph yet, cut and
 * decorated as the frame says, with its stickers and its caption when it has them. It ends
 * selected, so the photograph chosen next can go into it. One undo step.
 */
export function insertFrame(editor: Editor, frame: PhotoFrame): boolean {
  const slideId = editor.selection.getState().currentSlideId;
  if (!slideId) return false;
  const { deck } = editor.bus;
  const box = { x: 0, y: 0, ...frameSizeOn(frame, deck.size) };
  const element = framedElement(frame, box, deck.meta.lang);
  editor.bus.dispatch(
    { type: 'element.add', slideId, element },
    { label: i18n.t('elements:history.frame') },
  );
  editor.selection.getState().selectElements([element.id]);
  focusStage();
  return true;
}

/**
 * Places a card set in the middle of the current slide, its words in the language of the deck
 * and its cards starting on the side the deck reads from. It ends selected, so that a card can
 * be added to it from row B at once. One undo step.
 */
export function insertCardSet(editor: Editor, id: CardSetId): boolean {
  const slideId = editor.selection.getState().currentSlideId;
  if (!slideId) return false;
  const { deck } = editor.bus;
  const taken: Frame[] = findSlide(deck, slideId)?.elements.map((e) => e.frame) ?? [];
  const set = newCardSet(id, readingOf(deck.meta));
  const element = { ...set, frame: centredFrame(set.frame, deck.size, taken) };
  editor.bus.dispatch(
    { type: 'element.add', slideId, element },
    { label: i18n.t('elements:history.cards') },
  );
  editor.selection.getState().selectElements([element.id]);
  focusStage();
  return true;
}

/**
 * Puts a picture of the slide in a frame: the photograph, its crop and its adjustments stay,
 * and the picture takes the frame's outline, artwork and proportions, and what the frame puts
 * beside it (`reframe`). One undo step.
 */
export async function framePicture(
  editor: Editor,
  picture: Target<ImageElement>,
  frame: PhotoFrame,
): Promise<void> {
  // The frames are loaded: the one that was clicked is one of them.
  const all = await loadFrames();
  const { deck } = editor.bus;
  const slide = findSlide(deck, picture.slideId);
  if (!slide) return;
  const { command, select } = reframe(slide, picture.element, frame, deck.meta.lang, all);
  editor.bus.dispatch(command, { label: i18n.t('elements:history.reframe') });
  editor.selection.getState().selectElements([select]);
  focusStage();
}
