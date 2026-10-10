import { findSlide, type ImageElement, type Point } from '@slidr/model';
import { i18n } from '../i18n';
import { isPicture } from '../objects/insert';
import { replaceWith } from '../objects/replace';
import { targetOf } from '../objects/target';
import { focusStage, type Editor } from '../shell';
import { insertAssetsCommands } from '../stage/insert';
import { indexElements } from '../stage/space';

/*
 * Dragging a picture from the media panel onto the slide (WG5-T13): the tile carries the id of
 * an asset of the deck, and a drop on the Stage puts the picture where it was dropped, as one
 * undo step. The Stage itself takes dropped files (STG-09); this listens beside it, for a drag
 * that started inside the app, and leaves every other drag to it.
 */

/** The type a dragged tile carries: the id of an asset of the open deck. */
export const ASSET_DRAG = 'application/x-slidr-asset';

/** The slide as the Stage draws it: its box on the screen is the slide, scaled. */
const SLIDE = '[data-testid="stage-frame"] .slidr-slide';
/** The region a drop counts in: the Stage, around the slide too. */
const STAGE = '[data-testid="stage"]';

/** A point of the window in slide pixels, by where the Stage draws the slide now. */
export function slidePoint(
  client: { clientX: number; clientY: number },
  box: { left: number; top: number; width: number; height: number },
  size: { w: number; h: number },
): Point {
  if (box.width <= 0 || box.height <= 0) return { x: size.w / 2, y: size.h / 2 };
  return {
    x: ((client.clientX - box.left) / box.width) * size.w,
    y: ((client.clientY - box.top) / box.height) * size.h,
  };
}

/** Marks a drag as one of an asset of the deck. For a tile's `dragstart`. */
export function startAssetDrag(event: DragEvent | React.DragEvent, assetId: string): void {
  const data = event.dataTransfer;
  if (!data) return;
  data.setData(ASSET_DRAG, assetId);
  data.effectAllowed = 'copy';
}

const overStage = (target: EventTarget | null) =>
  target instanceof Element && target.closest(STAGE) !== null;

/** The empty picture under a drop, including one nested in an editable group. */
export function emptyImageAt(
  target: EventTarget | null,
  editor: Pick<Editor, 'bus'>,
  slideId: string,
): ImageElement | undefined {
  if (!(target instanceof Element)) return undefined;
  const placeholder = target.closest('[data-slidr-placeholder="image"]');
  const id = placeholder?.closest('[data-element-id]')?.getAttribute('data-element-id');
  const slide = findSlide(editor.bus.deck, slideId);
  const located = id && slide ? indexElements(slide.elements).get(id) : undefined;
  return located?.element.type === 'image' &&
    !located.element.assetId &&
    !located.locked &&
    !located.hidden
    ? located.element
    : undefined;
}

/**
 * Lets the Stage take a dragged asset. Returns a function that stops listening.
 */
export function installAssetDrop(editor: Editor): () => void {
  const carries = (event: DragEvent) => event.dataTransfer?.types.includes(ASSET_DRAG) ?? false;

  const onDragOver = (event: DragEvent) => {
    if (!carries(event) || !overStage(event.target) || !event.dataTransfer) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (event: DragEvent) => {
    if (!carries(event) || !overStage(event.target) || !event.dataTransfer) return;
    event.preventDefault();
    const { bus, selection } = editor;
    const asset = bus.deck.assets[event.dataTransfer.getData(ASSET_DRAG)];
    const slideId = selection.getState().currentSlideId;
    const slide = document.querySelector(SLIDE);
    if (!asset || !slideId || !slide) return;
    const empty = isPicture(asset) ? emptyImageAt(event.target, editor, slideId) : undefined;
    if (empty) {
      replaceWith(editor, targetOf(bus, slideId, empty), asset, i18n.t('media:history.replace'));
      selection.getState().selectElements([empty.id]);
      focusStage();
      return;
    }
    const { size } = bus.deck;
    const at = slidePoint(event, slide.getBoundingClientRect(), size);
    const { commands, elementIds } = insertAssetsCommands(slideId, [asset], size, at, () => true);
    if (commands.length === 0) return;
    bus.batch(commands, { label: i18n.t('media:history.insert') });
    selection.getState().selectElements(elementIds);
    focusStage();
  };

  window.addEventListener('dragover', onDragOver);
  window.addEventListener('drop', onDrop);
  return () => {
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('drop', onDrop);
  };
}
