import { createElement, findSlide, type Frame, type ImageElement } from '@slidr/model';
import { i18n } from '../i18n';
import { centredFrame } from '../objects/shapes';
import type { Target } from '../objects/target';
import { focusStage, type Editor } from '../shell';
import { frameElement, framePatch, type PhotoFrame } from './frames';
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
 * decorated as the frame says. It ends selected, so the photograph chosen next can go into it.
 * One undo step.
 */
export function insertFrame(editor: Editor, frame: PhotoFrame): boolean {
  const slideId = editor.selection.getState().currentSlideId;
  if (!slideId) return false;
  const taken: Frame[] = findSlide(editor.bus.deck, slideId)?.elements.map((e) => e.frame) ?? [];
  const element = frameElement(frame, centredFrame(frame.size, editor.bus.deck.size, taken));
  editor.bus.dispatch(
    { type: 'element.add', slideId, element },
    { label: i18n.t('elements:history.frame') },
  );
  editor.selection.getState().selectElements([element.id]);
  focusStage();
  return true;
}

/**
 * Puts a picture of the slide in a frame: the photograph, its crop and its adjustments stay,
 * and the picture takes the frame's outline, artwork and proportions. One undo step.
 */
export function framePicture(picture: Target<ImageElement>, frame: PhotoFrame): void {
  picture.update(framePatch(frame, picture.element), {
    label: i18n.t('elements:history.reframe'),
  });
  focusStage();
}
