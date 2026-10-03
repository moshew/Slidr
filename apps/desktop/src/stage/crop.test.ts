import { createElement, rotateVector, type ImageElement, type Point } from '@slidr/model';
import { imagePlacement } from '@slidr/renderer';
import { describe, expect, it } from 'vitest';
import {
  cropPan,
  cropPatch,
  cropReset,
  cropResize,
  cropToRatio,
  cropView,
  cropZoom,
  cropZoomLevel,
  MAX_CROP_ZOOM,
  picturePlacement,
  pictureRatio,
  positionToOwn,
  resetPatch,
  type CropView,
} from './crop';
import { heldRatio } from './cropSession';
import { HANDLES } from './geometry';
import { apply, boxMatrix } from './space';

/** A 3:2 picture. */
const NATURAL = { w: 2400, h: 1600 };

const image = (extra: Partial<ImageElement> = {}) =>
  createElement.image({
    assetId: 'a'.repeat(64),
    frame: { x: 100, y: 100, w: 600, h: 400 },
    ...extra,
  });

/** The corners of the whole picture on the slide. */
function pictureOnSlide(view: CropView): Point[] {
  const m = boxMatrix(view);
  const { x, y, w, h } = view.picture;
  return [
    apply(m, { x, y }),
    apply(m, { x: x + w, y }),
    apply(m, { x: x + w, y: y + h }),
    apply(m, { x, y: y + h }),
  ];
}

function expectSamePicture(a: CropView, b: CropView, digits = 6) {
  const pa = pictureOnSlide(a);
  pictureOnSlide(b).forEach((p, i) => {
    expect(p.x).toBeCloseTo(pa[i]!.x, digits);
    expect(p.y).toBeCloseTo(pa[i]!.y, digits);
  });
}

/** The view the renderer would draw after the patch went through the model. */
function reload(element: ImageElement, view: CropView): CropView {
  const { frame, crop } = cropPatch(view);
  return cropView({ ...element, frame, crop: crop ?? undefined }, NATURAL);
}

describe('picturePlacement', () => {
  it('is where the renderer puts the picture, for every fit', () => {
    const crops = [undefined, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0.1, y: 0.2, w: 0.3, h: 0.7 }];
    for (const fit of ['cover', 'contain', 'fill'] as const) {
      for (const crop of crops) {
        for (const frame of [
          { w: 400, h: 260 },
          { w: 200, h: 500 },
        ]) {
          const mine = picturePlacement(frame, NATURAL, crop, fit);
          const theirs = imagePlacement(frame, NATURAL, crop, fit);
          expect(mine.x).toBeCloseTo(theirs.left, 2);
          expect(mine.y).toBeCloseTo(theirs.top, 2);
          expect(mine.w).toBeCloseTo(theirs.width, 2);
          expect(mine.h).toBeCloseTo(theirs.height, 2);
        }
      }
    }
  });

  it('comes back unchanged through the model, for every fit', () => {
    for (const fit of ['cover', 'contain', 'fill'] as const) {
      const element = image({ fit, frame: { x: 0, y: 0, w: 500, h: 500 } });
      const view = cropView(element, NATURAL);
      const again = reload(element, view);
      expect(again.picture.x).toBeCloseTo(view.picture.x, 3);
      expect(again.picture.y).toBeCloseTo(view.picture.y, 3);
      expect(again.picture.w).toBeCloseTo(view.picture.w, 3);
      expect(again.picture.h).toBeCloseTo(view.picture.h, 3);
    }
  });

  it('writes no crop for a frame that shows the whole picture', () => {
    expect(cropPatch(cropView(image(), NATURAL))).toEqual({
      frame: { x: 100, y: 100, w: 600, h: 400 },
      crop: null,
    });
  });
});

describe('cropResize', () => {
  it('moves the frame over a picture that stays where it is', () => {
    const element = image();
    const view = cropView(element, NATURAL);
    const out = cropResize(view, HANDLES.e, { x: -150, y: 0 });
    expect(out.frame).toEqual({ x: 100, y: 100, w: 450, h: 400 });
    expectSamePicture(view, out);
    expect(cropPatch(out).crop).toEqual({ x: 0, y: 0, w: 0.75, h: 1 });
    // What the renderer then draws is the same picture.
    expectSamePicture(view, reload(element, out), 3);

    const corner = cropResize(view, HANDLES.nw, { x: 60, y: 100 });
    expect(corner.frame).toEqual({ x: 160, y: 200, w: 540, h: 300 });
    expect(cropPatch(corner).crop).toEqual({ x: 0.1, y: 0.25, w: 0.9, h: 0.75 });
    expectSamePicture(view, corner);
  });

  it('stops at the edge of the picture and at the smallest size', () => {
    const view = cropView(image(), NATURAL);
    expect(cropResize(view, HANDLES.se, { x: 200, y: 200 }).frame).toEqual(view.frame);
    const cropped = cropResize(view, HANDLES.w, { x: 200, y: 0 });
    expect(cropResize(cropped, HANDLES.w, { x: -500, y: 0 }).frame).toEqual(view.frame);
    const tiny = cropResize(view, HANDLES.se, { x: -5000, y: -5000 });
    expect(tiny.frame).toMatchObject({ x: 100, y: 100, w: 8, h: 8 });
  });

  it.each([
    { rotation: 30 },
    { rotation: 0, flipH: true },
    { rotation: -75, flipH: true },
    { rotation: 140, flipV: true },
    { rotation: 215, flipH: true, flipV: true },
  ])('keeps the picture fixed on the slide for %o', (transform) => {
    const element = image(transform);
    const view = cropView(element, NATURAL);
    // The pointer moves along the frame's own x axis, as the Stage hands it over.
    for (const name of ['e', 'w', 'nw', 's'] as const) {
      const handle = HANDLES[name];
      const out = cropResize(view, handle, { x: -handle.x * 120 || 0, y: -handle.y * 80 || 0 });
      expect(out.frame.w).toBe(handle.x ? 480 : 600);
      expect(out.frame.h).toBe(handle.y ? 320 : 400);
      expectSamePicture(view, out);
      expectSamePicture(view, reload(element, out), 3);
      // The edge opposite the handle stays on the slide too.
      const corner = (v: CropView) => {
        const c = { x: v.frame.x + v.frame.w / 2, y: v.frame.y + v.frame.h / 2 };
        const r = rotateVector(
          { x: (-handle.x * v.frame.w) / 2, y: (-handle.y * v.frame.h) / 2 },
          v.rotation,
        );
        return { x: c.x + r.x, y: c.y + r.y };
      };
      expect(corner(out).x).toBeCloseTo(corner(view).x, 6);
      expect(corner(out).y).toBeCloseTo(corner(view).y, 6);
    }
  });

  it('crops the side that is under the handle when the image is mirrored', () => {
    const view = cropView(image({ flipH: true }), NATURAL);
    // The east handle of a mirrored image uncovers the picture's left side.
    const out = cropResize(view, HANDLES.e, { x: -150, y: 0 });
    expect(out.frame).toEqual({ x: 100, y: 100, w: 450, h: 400 });
    expect(cropPatch(out).crop).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 });
  });

  it('keeps a ratio, within the picture', () => {
    const view = cropView(image(), NATURAL);
    const square = cropToRatio(view, 1);
    expect(square.frame.w).toBe(square.frame.h);
    const smaller = cropResize(square, HANDLES.se, { x: -100, y: -20 }, { ratio: 1 });
    expect(smaller.frame.w).toBe(square.frame.w - 100);
    expect(smaller.frame.h).toBe(square.frame.w - 100);
    expectSamePicture(view, smaller);
    // An edge handle grows the other axis around its middle, and stops when that runs out.
    const wide = cropResize(smaller, HANDLES.e, { x: 5000, y: 0 }, { ratio: 1 });
    expect(wide.frame.w).toBe(wide.frame.h);
    expect(wide.frame.h).toBeLessThanOrEqual(400);
    const crop = cropPatch(wide).crop!;
    expect(crop.x).toBeGreaterThanOrEqual(0);
    expect(crop.y).toBeGreaterThanOrEqual(0);
    expect(crop.x + crop.w).toBeLessThanOrEqual(1 + 1e-6);
    expect(crop.y + crop.h).toBeLessThanOrEqual(1 + 1e-6);
  });
});

describe('cropPan and cropZoom', () => {
  it('moves the picture under the frame and never uncovers the frame', () => {
    const view = cropResize(cropView(image(), NATURAL), HANDLES.e, { x: -300, y: 0 });
    const panned = cropPan(view, { x: -100, y: 50 });
    expect(panned.frame).toEqual(view.frame);
    expect(panned.picture).toMatchObject({ x: -100, y: 0 });
    expect(cropPatch(panned).crop).toMatchObject({ x: round(100 / 600), y: 0 });
    expect(cropPan(view, { x: -5000, y: 0 }).picture.x).toBe(-300);
    expect(cropPan(view, { x: 5000, y: 0 }).picture.x).toBe(0);
  });

  it('pans the way the pointer moves on a mirrored image', () => {
    const view = cropResize(cropView(image({ flipH: true }), NATURAL), HANDLES.e, {
      x: -300,
      y: 0,
    });
    // Dragging left moves the picture left on the slide, mirrored or not.
    const before = pictureOnSlide(view);
    const after = pictureOnSlide(cropPan(view, { x: -100, y: 0 }));
    expect(after[0]!.x - before[0]!.x).toBeCloseTo(-100, 6);
    expect(cropPan(view, { x: 100, y: 0 }).picture).toEqual(view.picture);
  });

  it('zooms around a pivot, between the smallest size and the largest', () => {
    const element = image();
    const view = cropView(element, NATURAL);
    expect(cropZoomLevel(view, 'cover')).toBeCloseTo(1, 6);
    const pivot = { x: 150, y: 100 };
    const zoomed = cropZoom(view, 'cover', 2, pivot);
    expect(cropZoomLevel(zoomed, 'cover')).toBeCloseTo(2, 6);
    expect(zoomed.picture).toEqual({ x: -150, y: -100, w: 1200, h: 800 });
    // Without a pivot: the middle of the frame.
    expect(cropPatch(cropZoom(view, 'cover', 2)).crop).toEqual({
      x: 0.25,
      y: 0.25,
      w: 0.5,
      h: 0.5,
    });
    expectSamePicture(zoomed, reload(element, zoomed), 3);
    // Back out: the picture cannot get smaller than the frame.
    const out = cropZoom(zoomed, 'cover', 0.2, pivot);
    expect(out.picture).toEqual({ x: 0, y: 0, w: 600, h: 400 });
    expect(cropZoomLevel(cropZoom(view, 'cover', 99), 'cover')).toBeCloseTo(MAX_CROP_ZOOM, 6);
  });

  it('takes the pivot from where the pointer is in the unmirrored box', () => {
    const view = cropView(image({ flipH: true, flipV: true }), NATURAL);
    expect(positionToOwn(view, { x: 100, y: 50 })).toEqual({ x: 500, y: 350 });
  });
});

describe('fit', () => {
  it('cover: the frame shows the middle of a picture of other proportions', () => {
    const element = image({ frame: { x: 0, y: 0, w: 400, h: 400 }, fit: 'cover' });
    const view = cropView(element, NATURAL);
    expect(view.picture).toEqual({ x: -100, y: 0, w: 600, h: 400 });
    // The first change writes the visible part as the crop; nothing moves.
    const out = cropPan(view, { x: 0, y: 0 });
    expect(cropPatch(out).crop).toEqual({ x: round(1 / 6), y: 0, w: round(2 / 3), h: 1 });
    expectSamePicture(view, reload(element, out), 3);
  });

  it('fill: the stretch is kept through a crop', () => {
    const element = image({ frame: { x: 0, y: 0, w: 400, h: 400 }, fit: 'fill' });
    const view = cropView(element, NATURAL);
    expect(view.picture).toEqual({ x: 0, y: 0, w: 400, h: 400 });
    const out = cropResize(view, HANDLES.s, { x: 0, y: -200 });
    expect(cropPatch(out)).toEqual({
      frame: { x: 0, y: 0, w: 400, h: 200 },
      crop: { x: 0, y: 0, w: 1, h: 0.5 },
    });
    expectSamePicture(view, reload(element, out), 3);
    expect(pictureRatio(view)).toBe(1);
  });

  it('contain: the bars may shrink but not grow, and the picture zooms out until it fits', () => {
    const element = image({ frame: { x: 0, y: 0, w: 400, h: 400 }, fit: 'contain' });
    const view = cropView(element, NATURAL);
    expect(view.picture.x).toBe(0);
    expect(view.picture.y).toBeCloseTo(66.667, 2);
    // The bottom edge is past the picture: it moves in, not out.
    expect(cropResize(view, HANDLES.s, { x: 0, y: 100 }).frame.h).toBe(400);
    const tight = cropResize(view, HANDLES.s, { x: 0, y: -100 });
    expect(tight.frame.h).toBe(300);
    expectSamePicture(view, tight);
    expectSamePicture(view, reload(element, tight), 3);
    // At its smallest the whole picture is inside the frame; zooming in covers the frame.
    expect(cropZoomLevel(view, 'contain')).toBeCloseTo(1, 6);
    const zoomed = cropZoom(view, 'contain', 1.5);
    expect(zoomed.picture.w).toBeCloseTo(600, 6);
    expect(zoomed.picture.y).toBeCloseTo(0, 6);
    expect(cropZoom(zoomed, 'contain', 0.1).picture.w).toBeCloseTo(400, 6);
    expectSamePicture(zoomed, reload(element, zoomed), 3);
  });
});

describe('cropToRatio and cropReset', () => {
  it('reshapes the frame around its centre with the same area, inside the picture', () => {
    const view = cropView(image(), NATURAL);
    const wide = cropToRatio(view, 16 / 9);
    // 600 x 400 has room for 600 x 338, not for the 653 x 367 of the same area.
    expect(wide.frame).toEqual({ x: 100, y: 131, w: 600, h: 338 });
    expectSamePicture(view, wide);
    const square = cropToRatio(wide, 1);
    expect(square.frame.w).toBe(square.frame.h);
    expect(square.frame.w).toBeLessThanOrEqual(400);
    expect(square.frame.x + square.frame.w / 2).toBeCloseTo(400, 0);
    // Back to the picture's own proportions: the frame grows again, it does not keep shrinking.
    const original = cropToRatio(square, pictureRatio(square));
    expect(original.frame.w / original.frame.h).toBeCloseTo(1.5, 1);
    expect(original.frame.w).toBeGreaterThan(square.frame.w);
  });

  it('crop then reset is the image as it was', () => {
    for (const transform of [{}, { rotation: 40 }, { flipH: true, rotation: -15 }]) {
      const element = image(transform);
      const view = cropView(element, NATURAL);
      let out = cropResize(view, HANDLES.nw, { x: 100, y: 60 });
      out = cropResize(out, HANDLES.e, { x: -80, y: 0 });
      out = cropToRatio(out, 1);
      expectSamePicture(view, out);
      const patch = resetPatch(reload(element, out));
      expect(patch.crop).toBeNull();
      expect(patch.frame.x).toBeCloseTo(element.frame.x, 2);
      expect(patch.frame.y).toBeCloseTo(element.frame.y, 2);
      expect(patch.frame.w).toBe(element.frame.w);
      expect(patch.frame.h).toBe(element.frame.h);
      expectSamePicture(view, cropReset(out), 6);
    }
  });

  it('reset frames the picture where a pan left it', () => {
    const view = cropResize(cropView(image(), NATURAL), HANDLES.e, { x: -300, y: 0 });
    const panned = cropPan(view, { x: -100, y: 0 });
    expect(resetPatch(panned).frame).toEqual({ x: 0, y: 100, w: 600, h: 400 });
    expectSamePicture(panned, cropReset(panned));
  });

  it('reset gives a frame of the picture’s proportions to an image that had other ones', () => {
    const element = image({ frame: { x: 0, y: 0, w: 400, h: 400 }, fit: 'cover' });
    expect(resetPatch(cropView(element, NATURAL))).toEqual({
      frame: { x: -100, y: 0, w: 600, h: 400 },
      crop: null,
    });
  });
});

describe('heldRatio', () => {
  it('holds the proportions of a preset only while the frame still has them', () => {
    expect(heldRatio(null, { w: 300, h: 200 })).toBeNull();
    expect(heldRatio(1, { w: 300, h: 300 })).toBe(1);
    // Whole pixels: 16 to 9 at a height of 338 is 600.9 wide.
    expect(heldRatio(16 / 9, { w: 600, h: 338 })).toBe(16 / 9);
    expect(heldRatio(16 / 9, { w: 28, h: 16 })).toBe(16 / 9);
    // After an undo the frame is the old one: the lock is off.
    expect(heldRatio(1, { w: 600, h: 400 })).toBeNull();
    expect(heldRatio(4 / 3, { w: 300, h: 222 })).toBeNull();
  });
});

function round(v: number): number {
  return Math.round(v * 1e6) / 1e6;
}
