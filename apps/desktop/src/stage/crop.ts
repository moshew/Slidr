import {
  imageOpeningFrame,
  rotateVector,
  type Frame,
  type ImageElement,
  type Point,
} from '@slidr/model';
import type { Handle } from './geometry';
import { tidyFrame } from './space';

/**
 * Crop mode (WG5-T02, IMG-03, IMG-04, IMG-12), as pure functions.
 *
 * The model keeps a picture as a frame, a `crop` region of the original (0..1) and a `fit`; the
 * renderer scales the crop region to the frame by `fit` and lets the frame clip the rest
 * (`imagePlacement`, ADR-009). Crop mode works on what that comes to: **where the whole picture
 * lies relative to the frame**. A crop handle moves the frame over a picture that stays put, a
 * drag moves the picture under the frame, the wheel scales it. What is written back is the frame
 * and the part of the picture the frame shows, as `crop`: with it the crop region has the frame's
 * own proportions, so cover, contain and fill all draw exactly what crop mode showed.
 *
 * Outside crop mode the handles on the edges of an image work on the same view (`cropStretch`).
 *
 * An image in a drawn frame (`smartFrame`) shows its picture through the frame's opening, and the
 * view is of that opening (`outer`). The opening is the drawn frame's and stays as it is: there
 * the picture is moved and scaled under it, and only `crop` changes.
 *
 * Coordinates here are the frame's own, **mirrored** axes: the origin is the corner the picture's
 * top-left is drawn from, so a flipped image needs no special case below; `toOwn` converts.
 */

export type Crop = NonNullable<ImageElement['crop']>;
export type Fit = ImageElement['fit'];

/** A rectangle in the frame's own axes. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An image in crop mode: its frame on the slide, and where the whole picture lies in it. */
export interface CropView {
  frame: Frame;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  /** The whole picture in the frame's own axes; the frame itself is `0, 0, frame.w, frame.h`. */
  picture: Rect;
  /**
   * The image's own frame, where `frame` is not it but the opening of a drawn frame
   * (`smartFrame`) that the picture shows through. The artwork around the opening is sized with
   * the image, so crop mode changes neither of the two.
   */
  outer?: Frame;
}

/** The picture may be magnified up to this many times its smallest allowed size. */
export const MAX_CROP_ZOOM = 8;
/** The frame's smallest side in crop mode, in slide pixels. */
export const MIN_CROP_SIZE = 8;

const EPSILON = 1e-6;

/** Where the renderer puts the whole picture: `imagePlacement` without its rounding. */
export function picturePlacement(
  frame: { w: number; h: number },
  natural: { w: number; h: number },
  crop: ImageElement['crop'],
  fit: Fit,
): Rect {
  const c = crop ?? { x: 0, y: 0, w: 1, h: 1 };
  const cw = c.w * natural.w;
  const ch = c.h * natural.h;
  let sx = frame.w / cw;
  let sy = frame.h / ch;
  if (fit !== 'fill') sx = sy = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
  return {
    x: (frame.w - cw * sx) / 2 - c.x * natural.w * sx,
    y: (frame.h - ch * sy) / 2 - c.y * natural.h * sy,
    w: natural.w * sx,
    h: natural.h * sy,
  };
}

export function cropView(
  image: Pick<
    ImageElement,
    'frame' | 'rotation' | 'flipH' | 'flipV' | 'crop' | 'fit' | 'smartFrame'
  >,
  natural: { w: number; h: number },
): CropView {
  // In a drawn frame the renderer lays the picture out in the opening, not in the whole frame.
  const frame = image.smartFrame ? imageOpeningFrame(image) : image.frame;
  return {
    frame,
    rotation: image.rotation,
    flipH: Boolean(image.flipH),
    flipV: Boolean(image.flipV),
    picture: picturePlacement(frame, natural, image.crop, image.fit),
    ...(image.smartFrame ? { outer: image.frame } : {}),
  };
}

// Adding 0 turns -0 into 0, which would otherwise end up in the model.
const round6 = (v: number) => Math.round(v * 1e6) / 1e6 + 0;

/**
 * What a view is in the model: its frame, and the part of the picture the frame shows. A frame
 * that shows exactly the whole picture has no crop (`null` removes the field). For the opening
 * of a drawn frame the frame is the image's own, as it was.
 */
export function cropPatch(view: CropView): { frame: Frame; crop: Crop | null } {
  const { frame, picture } = view;
  const crop = {
    x: round6(-picture.x / picture.w),
    y: round6(-picture.y / picture.h),
    w: round6(frame.w / picture.w),
    h: round6(frame.h / picture.h),
  };
  const whole =
    Math.abs(crop.x) < EPSILON &&
    Math.abs(crop.y) < EPSILON &&
    Math.abs(crop.w - 1) < EPSILON &&
    Math.abs(crop.h - 1) < EPSILON;
  return { frame: view.outer ?? tidyFrame(frame), crop: whole ? null : crop };
}

/** A vector or a handle from the frame's unmirrored axes to its own, mirrored ones (and back). */
export function toOwn<T extends { x: number; y: number }>(
  view: Pick<CropView, 'flipH' | 'flipV'>,
  v: T,
): T {
  return { ...v, x: view.flipH ? -v.x : v.x, y: view.flipV ? -v.y : v.y };
}

/** A position in the frame's unmirrored box (origin at its corner) in its own, mirrored axes. */
export function positionToOwn(view: CropView, p: Point): Point {
  return {
    x: view.flipH ? view.frame.w - p.x : p.x,
    y: view.flipV ? view.frame.h - p.y : p.y,
  };
}

/**
 * How far each edge of the frame may go: to the edge of the picture, so the frame is never left
 * uncovered. Where the frame already reaches past the picture (the bars of `contain`), that edge
 * may only move inwards.
 */
function limits(view: CropView): { l: number; t: number; r: number; b: number } {
  const { frame, picture } = view;
  return {
    l: Math.min(0, picture.x),
    t: Math.min(0, picture.y),
    r: Math.max(frame.w, picture.x + picture.w),
    b: Math.max(frame.h, picture.y + picture.h),
  };
}

/** The view after its frame became `rect` (in the old frame's own axes); the picture stays put. */
function withFrameRect(view: CropView, rect: Rect): CropView {
  const { frame } = view;
  // The centre moves in the frame's own axes; on the slide that is mirrored back, then rotated.
  const shift = toOwn(view, {
    x: rect.x + rect.w / 2 - frame.w / 2,
    y: rect.y + rect.h / 2 - frame.h / 2,
  });
  const moved = rotateVector(shift, view.rotation);
  return {
    ...view,
    frame: {
      x: frame.x + frame.w / 2 + moved.x - rect.w / 2,
      y: frame.y + frame.h / 2 + moved.y - rect.h / 2,
      w: rect.w,
      h: rect.h,
    },
    picture: { ...view.picture, x: view.picture.x - rect.x, y: view.picture.y - rect.y },
  };
}

/** A moved edge lands on a whole pixel, and never past its limit. */
function snapEdge(value: number, low: number, high: number): number {
  const v = Math.round(value);
  if (v < low) return Math.ceil(low - 1e-9);
  if (v > high) return Math.floor(high + 1e-9);
  return v;
}

export interface CropResizeOptions {
  /** Width over height the frame keeps; undefined leaves it free. */
  ratio?: number;
  min?: number;
}

/**
 * The view after a crop handle was dragged by `delta` (slide pixels, in the frame's rotated but
 * unmirrored axes, as `resizeFrame` takes it after un-rotating). The frame changes, the picture
 * does not move on the slide, and the frame stays on the picture.
 */
export function cropResize(
  view: CropView,
  handle: Handle,
  delta: Point,
  options: CropResizeOptions = {},
): CropView {
  const min = options.min ?? MIN_CROP_SIZE;
  const h = toOwn(view, handle);
  const d = toOwn(view, delta);
  const { w: fw, h: fh } = view.frame;
  const lim = limits(view);
  let l = 0;
  let t = 0;
  let r = fw;
  let b = fh;
  const ratio = options.ratio;
  if (!ratio) {
    if (h.x < 0) l = Math.min(snapEdge(d.x, lim.l, fw), fw - min);
    if (h.x > 0) r = Math.max(snapEdge(fw + d.x, 0, lim.r), min);
    if (h.y < 0) t = Math.min(snapEdge(d.y, lim.t, fh), fh - min);
    if (h.y > 0) b = Math.max(snapEdge(fh + d.y, 0, lim.b), min);
    return withFrameRect(view, { x: l, y: t, w: r - l, h: b - t });
  }
  // With a ratio the frame grows from the opposite handle; an edge handle grows the other axis
  // around its middle. The room there is decides how large it may get.
  let w = h.x ? fw + h.x * d.x : fw;
  const tall = h.y ? fh + h.y * d.y : fh;
  // A corner follows whichever axis moved more; an edge handle of the height sets the width.
  if (h.x && h.y ? Math.abs(w / fw - 1) < Math.abs(tall / fh - 1) : !h.x) w = tall * ratio;
  const roomW =
    h.x > 0 ? lim.r : h.x < 0 ? fw - lim.l : 2 * Math.min(fw / 2 - lim.l, lim.r - fw / 2);
  const roomH =
    h.y > 0 ? lim.b : h.y < 0 ? fh - lim.t : 2 * Math.min(fh / 2 - lim.t, lim.b - fh / 2);
  const most = Math.min(roomW, roomH * ratio);
  const least = Math.max(min, min * ratio);
  w = Math.max(Math.min(w, most), Math.min(least, most));
  // Whole pixels where the room allows; the ratio then holds to within a pixel.
  w = Math.min(Math.round(w), Math.floor(most + 1e-9)) || w;
  const hh = Math.min(Math.round(w / ratio), Math.floor(roomH + 1e-9)) || w / ratio;
  l = h.x > 0 ? 0 : h.x < 0 ? fw - w : (fw - w) / 2;
  t = h.y > 0 ? 0 : h.y < 0 ? fh - hh : (fh - hh) / 2;
  return withFrameRect(view, { x: l, y: t, w, h: hh });
}

/** A frame that is this far past its picture, in slide pixels, is still covered by it. */
const NEAR = 0.05;

/** The picture reaches every edge of the frame: no part of the frame is bare (no `contain` bars). */
export function coversFrame(view: CropView): boolean {
  const { frame, picture } = view;
  return (
    picture.x <= NEAR &&
    picture.y <= NEAR &&
    picture.x + picture.w >= frame.w - NEAR &&
    picture.y + picture.h >= frame.h - NEAR
  );
}

/**
 * The view after an edge handle of the image itself, outside crop mode, was dragged until the
 * frame is `size` long on that handle's axis (IMG-02). The edge moves alone, and the picture
 * stays where it is on the slide for as long as it covers the frame: the edge cuts it, or shows
 * more of it. Past the end of the picture, the picture grows with the frame, from the edge that
 * stays (from the middle, with `fromCenter`) and around the middle of the other axis. For a view
 * whose picture covers its frame; the frame's place on the slide is `withFrameRect`'s.
 */
export function cropStretch(
  view: CropView,
  handle: Handle,
  size: number,
  fromCenter = false,
): CropView {
  const h = toOwn(view, handle);
  const { frame, picture } = view;
  const wide = h.x !== 0;
  const side = wide ? h.x : h.y;
  const length = wide ? frame.w : frame.h;
  // The frame's new ends on the axis, in its own axes as they are now, and the point that stays.
  const start = fromCenter ? (length - size) / 2 : side > 0 ? 0 : length - size;
  const anchor = fromCenter ? length / 2 : side > 0 ? 0 : length;
  const at = wide ? picture.x : picture.y;
  const extent = wide ? picture.w : picture.h;
  // How much the picture has to grow, from the anchor, to reach an end of the frame.
  const grow = (reach: number, have: number) =>
    reach > have + NEAR && have > 0 ? reach / have : 1;
  const k = Math.max(
    grow(anchor - start, anchor - at),
    grow(start + size - anchor, at + extent - anchor),
  );
  const pivot = wide ? { x: anchor, y: frame.h / 2 } : { x: frame.w / 2, y: anchor };
  const grown: Rect = {
    x: pivot.x - (pivot.x - picture.x) * k,
    y: pivot.y - (pivot.y - picture.y) * k,
    w: picture.w * k,
    h: picture.h * k,
  };
  return withFrameRect(
    { ...view, picture: grown },
    wide ? { x: start, y: 0, w: size, h: frame.h } : { x: 0, y: start, w: frame.w, h: size },
  );
}

/** Keeps the frame covered on one axis; a picture smaller than the frame stays inside it. */
function clampAxis(at: number, size: number, frame: number): number {
  const [low, high] = size >= frame ? [frame - size, 0] : [0, frame - size];
  return Math.min(high, Math.max(low, at));
}

function clampPicture(view: CropView, picture: Rect): Rect {
  return {
    ...picture,
    x: clampAxis(picture.x, picture.w, view.frame.w),
    y: clampAxis(picture.y, picture.h, view.frame.h),
  };
}

/** The view after the picture was dragged under the frame by `delta` (as in `cropResize`). */
export function cropPan(view: CropView, delta: Point): CropView {
  const d = toOwn(view, delta);
  const { picture } = view;
  return {
    ...view,
    picture: clampPicture(view, { ...picture, x: picture.x + d.x, y: picture.y + d.y }),
  };
}

/**
 * The smallest size the picture may have, as a share of its present size. For cover and fill it
 * still covers the frame; for contain all of it fits in the frame.
 */
function smallest(view: CropView, fit: Fit): number {
  const kx = view.frame.w / view.picture.w;
  const ky = view.frame.h / view.picture.h;
  return fit === 'contain' ? Math.min(kx, ky) : Math.max(kx, ky);
}

/** How much the picture is magnified: 1 at its smallest allowed size, up to `MAX_CROP_ZOOM`. */
export function cropZoomLevel(view: CropView, fit: Fit): number {
  return 1 / smallest(view, fit);
}

/**
 * The view with the picture at a zoom level, scaled around `pivot` (in the frame's own, mirrored
 * axes; default: the middle of the frame), which stays under the same part of the picture as
 * far as covering the frame allows.
 */
export function cropZoom(view: CropView, fit: Fit, level: number, pivot?: Point): CropView {
  const at = pivot ?? { x: view.frame.w / 2, y: view.frame.h / 2 };
  const target = Math.min(MAX_CROP_ZOOM, Math.max(1, level));
  const k = target * smallest(view, fit);
  const { picture } = view;
  return {
    ...view,
    picture: clampPicture(view, {
      x: at.x - (at.x - picture.x) * k,
      y: at.y - (at.y - picture.y) * k,
      w: picture.w * k,
      h: picture.h * k,
    }),
  };
}

/**
 * The view with a frame of the given proportions (width over height): the same area as now, around
 * the same centre, and made smaller or shifted where the picture ends.
 */
export function cropToRatio(view: CropView, ratio: number): CropView {
  const { w: fw, h: fh } = view.frame;
  const lim = limits(view);
  const roomW = lim.r - lim.l;
  const roomH = lim.b - lim.t;
  let w = Math.sqrt(fw * fh * ratio);
  w = Math.min(w, roomW, roomH * ratio);
  w = Math.min(Math.round(w), Math.floor(Math.min(roomW, roomH * ratio) + 1e-9)) || w;
  const h = Math.min(Math.round(w / ratio), Math.floor(roomH + 1e-9)) || w / ratio;
  const x = Math.min(lim.r - w, Math.max(lim.l, Math.round((fw - w) / 2)));
  const y = Math.min(lim.b - h, Math.max(lim.t, Math.round((fh - h) / 2)));
  return withFrameRect(view, { x, y, w, h });
}

/** The picture's own proportions as it is drawn (a `fill` image may be stretched). */
export function pictureRatio(view: CropView): number {
  return view.picture.w / view.picture.h;
}

/**
 * Back to the whole picture (IMG-12): the frame becomes the picture's own box, where the picture
 * is now on the slide, in whole pixels.
 */
export function cropReset(view: CropView): CropView {
  const { picture } = view;
  const w = Math.max(1, Math.round(picture.w));
  const h = Math.max(1, Math.round(picture.h));
  const framed = withFrameRect(view, {
    x: picture.x + (picture.w - w) / 2,
    y: picture.y + (picture.h - h) / 2,
    w,
    h,
  });
  return { ...framed, picture: { x: 0, y: 0, w, h } };
}

/**
 * The model patch for the whole picture: no crop. In a drawn frame the opening stays, and the
 * picture fills it again as it did when it was put there.
 */
export function resetPatch(view: CropView): { frame: Frame; crop: null } {
  return { frame: view.outer ?? tidyFrame(cropReset(view).frame), crop: null };
}
