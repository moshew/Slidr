import { frameCenter, rotateVector } from './geometry';
import type { Frame, ImageElement, SmartImageFrame } from './schema';

/**
 * How the artwork of a drawn frame lies in a picture of a given size.
 *
 * Artwork that says its scale keeps its size. A picture that is made larger, or given other
 * proportions, has the same artwork around a larger opening: the margins between the edges of
 * the artwork and its opening stay as wide as they are, and the opening takes up the change.
 * Only a picture that is too small for its artwork has it drawn smaller, whole, so the opening
 * is never narrower or lower than the one the artwork was drawn around.
 *
 * Artwork that says no scale is stretched with the picture, opening and all.
 */
export interface FrameLayout {
  /** Slide pixels to a unit of the artwork, across and down: unequal only in a stretch. */
  scale: { x: number; y: number };
  /** The picture's box in units of the artwork: never smaller than the artwork's own. */
  box: { w: number; h: number };
  /** The opening in that box. */
  opening: Frame;
}

export function frameLayout(design: SmartImageFrame, size: { w: number; h: number }): FrameLayout {
  const { viewBox, opening } = design;
  if (design.scale === undefined) {
    return {
      scale: { x: size.w / viewBox.w, y: size.h / viewBox.h },
      box: { ...viewBox },
      opening: { ...opening },
    };
  }
  const drawn = Math.min(design.scale, size.w / viewBox.w, size.h / viewBox.h) || design.scale;
  const box = { w: Math.max(viewBox.w, size.w / drawn), h: Math.max(viewBox.h, size.h / drawn) };
  return {
    scale: { x: drawn, y: drawn },
    box,
    opening: {
      x: opening.x,
      y: opening.y,
      w: opening.w + box.w - viewBox.w,
      h: opening.h + box.h - viewBox.h,
    },
  };
}

/** One axis of `placedInFrame`: where a stretch of the artwork starts and how long it is. */
function along(
  start: number,
  size: number,
  from: number,
  length: number,
  grown: number,
): [number, number] {
  const to = from + length;
  if (start <= from && start + size >= to) return [start, size + grown];
  const mid = start + size / 2;
  const at =
    mid <= from ? mid : mid >= to ? mid + grown : from + ((mid - from) * (length + grown)) / length;
  return [at - size / 2, size];
}

/**
 * Where a part of the artwork lies in a layout, given its box in the artwork as it was drawn.
 * A part that reaches from the margin before the opening to the margin after it grows with the
 * opening. Any other part keeps its size: beside the opening it stays as far from that side as
 * it was, and over the opening it stays at the same place along it.
 */
export function placedInFrame(design: SmartImageFrame, layout: FrameLayout, part: Frame): Frame {
  const { viewBox, opening } = design;
  const [x, w] = along(part.x, part.w, opening.x, opening.w, layout.box.w - viewBox.w);
  const [y, h] = along(part.y, part.h, opening.y, opening.h, layout.box.h - viewBox.h);
  return { x, y, w, h };
}

/** The photograph's opening, in the decorated frame's local coordinates. */
export function imageOpening(image: Pick<ImageElement, 'frame' | 'smartFrame'>): Frame {
  const design = image.smartFrame;
  if (!design) return { x: 0, y: 0, w: image.frame.w, h: image.frame.h };
  const { scale, opening: o } = frameLayout(design, image.frame);
  return { x: o.x * scale.x, y: o.y * scale.y, w: o.w * scale.x, h: o.h * scale.y };
}

/** The opening in the parent's coordinates, respecting the artwork's rotation and mirroring. */
export function imageOpeningFrame(
  image: Pick<ImageElement, 'frame' | 'smartFrame' | 'rotation' | 'flipH' | 'flipV'>,
): Frame {
  const o = imageOpening(image);
  const center = frameCenter(image.frame);
  const delta = rotateVector(
    {
      x: (o.x + o.w / 2 - image.frame.w / 2) * (image.flipH ? -1 : 1),
      y: (o.y + o.h / 2 - image.frame.h / 2) * (image.flipV ? -1 : 1),
    },
    image.rotation,
  );
  return { x: center.x + delta.x - o.w / 2, y: center.y + delta.y - o.h / 2, w: o.w, h: o.h };
}
