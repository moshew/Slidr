import { createElement, rotateVector, type ImageElement, type Point } from '@slidr/model';
import { imagePlacement } from '@slidr/renderer';
import { describe, expect, it } from 'vitest';
import {
  coversFrame,
  cropPan,
  cropPatch,
  cropReset,
  cropResize,
  cropScalePicture,
  cropStretch,
  cropToRatio,
  cropView,
  cropZoom,
  cropZoomLevel,
  MAX_CROP_ZOOM,
  onCropPicture,
  picturePlacement,
  pictureRatio,
  positionToOwn,
  resetPatch,
  type CropView,
} from './crop';
import { heldRatio } from './cropSession';
import { HANDLES } from './geometry';
import { apply, boxMatrix, elementMatrix, indexElements } from './space';

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

describe('onCropPicture', () => {
  it('recognizes dimmed parts outside the frame through rotation, mirroring and a group', () => {
    for (const flips of [{}, { flipH: true }, { flipV: true }]) {
      const element = image({
        crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
        rotation: 30,
        ...flips,
      });
      const group = createElement.group({
        frame: { x: 300, y: 200, w: 900, h: 700 },
        rotation: -20,
        flipH: true,
        children: [element],
      });
      const located = indexElements([group]).get(element.id)!;
      const view = cropView(element, NATURAL);
      const toSlide = (point: Point) => apply(elementMatrix(located, true), point);

      expect(onCropPicture(located, view, toSlide({ x: -100, y: 200 }))).toBe(true);
      expect(onCropPicture(located, view, toSlide({ x: 300, y: 200 }))).toBe(true);
      expect(onCropPicture(located, view, toSlide({ x: -310, y: 200 }))).toBe(false);
    }
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

describe('cropStretch', () => {
  it('cuts the picture, which stays where it is, when the edge goes in', () => {
    const element = image();
    const view = cropView(element, NATURAL);
    const out = cropStretch(view, HANDLES.e, 450);
    expect(out.frame).toEqual({ x: 100, y: 100, w: 450, h: 400 });
    expectSamePicture(view, out);
    expect(cropPatch(out).crop).toEqual({ x: 0, y: 0, w: 0.75, h: 1 });
    expectSamePicture(view, reload(element, out), 3);

    // From the other side the frame's far edge stays, and the picture with it.
    const west = cropStretch(view, HANDLES.w, 450);
    expect(west.frame).toEqual({ x: 250, y: 100, w: 450, h: 400 });
    expectSamePicture(view, west);
    expect(cropPatch(west).crop).toEqual({ x: 0.25, y: 0, w: 0.75, h: 1 });
  });

  it('shows more of a picture that was cut, as far as the picture goes', () => {
    const view = cropView(image(), NATURAL);
    const cut = cropStretch(view, HANDLES.s, 250);
    const back = cropStretch(cut, HANDLES.s, 400);
    expect(back.frame).toEqual(view.frame);
    expectSamePicture(view, back);
    expect(cropPatch(back).crop).toBeNull();
  });

  it('makes the picture larger past its end, from the edge that stays', () => {
    const element = image();
    const view = cropView(element, NATURAL);
    const out = cropStretch(view, HANDLES.e, 750);
    expect(out.frame).toEqual({ x: 100, y: 100, w: 750, h: 400 });
    // The picture is as wide as the frame, and what it gained in height is cut above and below.
    expect(out.picture).toEqual({ x: 0, y: -50, w: 750, h: 500 });
    expect(cropPatch(out).crop).toEqual({ x: 0, y: 0.1, w: 1, h: 0.8 });
    expect(coversFrame(out)).toBe(true);
    expectSamePicture(out, reload(element, out), 3);

    // The height as well: the width is then cut on both sides.
    const tall = cropStretch(view, HANDLES.n, 600);
    expect(tall.frame).toEqual({ x: 100, y: -100, w: 600, h: 600 });
    expect(tall.picture).toEqual({ x: -150, y: 0, w: 900, h: 600 });
  });

  it('first shows what was cut, and only then makes the picture larger', () => {
    const view = cropView(image(), NATURAL);
    // 150 pixels of the picture are out of sight on the right.
    const cut = cropStretch(view, HANDLES.e, 450);
    expectSamePicture(view, cropStretch(cut, HANDLES.e, 600));
    const past = cropStretch(cut, HANDLES.e, 660);
    expect(past.picture.w).toBeCloseTo(660, 6);
    expect(past.picture.x).toBeCloseTo(0, 6);
    expect(coversFrame(past)).toBe(true);
  });

  it('keeps what is at the edge that stays, also where the picture goes on past that edge', () => {
    const view = cropView(image(), NATURAL);
    // The frame shows the right half of the picture; its left edge is the middle of the picture.
    const half = cropStretch(view, HANDLES.w, 300);
    const out = cropStretch(half, HANDLES.e, 450);
    expect(out.frame).toEqual({ x: 400, y: 100, w: 450, h: 400 });
    // The middle of the picture is still on the frame's left edge.
    expect(out.picture.x + out.picture.w / 2).toBeCloseTo(0, 6);
    expect(out.picture.x + out.picture.w).toBeCloseTo(450, 6);
  });

  it('from the middle moves both edges, and the picture grows around the middle', () => {
    const view = cropView(image(), NATURAL);
    const narrow = cropStretch(view, HANDLES.e, 400, true);
    expect(narrow.frame).toEqual({ x: 200, y: 100, w: 400, h: 400 });
    expectSamePicture(view, narrow);
    const wide = cropStretch(view, HANDLES.e, 900, true);
    expect(wide.frame).toEqual({ x: -50, y: 100, w: 900, h: 400 });
    expect(wide.picture).toEqual({ x: 0, y: -100, w: 900, h: 600 });
  });

  it.each([
    { rotation: 30 },
    { rotation: 0, flipH: true },
    { rotation: -75, flipH: true },
    { rotation: 140, flipV: true },
    { rotation: 215, flipH: true, flipV: true },
  ])('moves only the edge under the handle for %o', (transform) => {
    const element = image(transform);
    const view = cropView(element, NATURAL);
    for (const name of ['e', 'w', 'n', 's'] as const) {
      const handle = HANDLES[name];
      const far = (v: CropView) => {
        const c = { x: v.frame.x + v.frame.w / 2, y: v.frame.y + v.frame.h / 2 };
        const r = rotateVector(
          { x: (-handle.x * v.frame.w) / 2, y: (-handle.y * v.frame.h) / 2 },
          v.rotation,
        );
        return { x: c.x + r.x, y: c.y + r.y };
      };
      for (const by of [-120, 90]) {
        const out = cropStretch(view, handle, (handle.x ? 600 : 400) + by);
        expect(out.frame.w).toBe(handle.x ? 600 + by : 600);
        expect(out.frame.h).toBe(handle.y ? 400 + by : 400);
        // The edge opposite the handle stays on the slide.
        expect(far(out).x).toBeCloseTo(far(view).x, 6);
        expect(far(out).y).toBeCloseTo(far(view).y, 6);
        expect(coversFrame(out)).toBe(true);
        // Going in, the picture stays on the slide; the renderer draws what was worked out.
        if (by < 0) expectSamePicture(view, out);
        expectSamePicture(out, reload(element, out), 2);
      }
    }
  });

  it('keeps a stretched picture as stretched as it was', () => {
    const element = image({ fit: 'fill', frame: { x: 0, y: 0, w: 600, h: 600 } });
    const view = cropView(element, NATURAL);
    const out = cropStretch(view, HANDLES.e, 900);
    expect(out.picture.w / out.picture.h).toBeCloseTo(view.picture.w / view.picture.h, 9);
    expectSamePicture(out, reload(element, out), 2);
  });
});

describe('coversFrame', () => {
  it('tells a picture that fills its frame from one that leaves bars', () => {
    const square = { x: 0, y: 0, w: 500, h: 500 };
    expect(coversFrame(cropView(image({ frame: square }), NATURAL))).toBe(true);
    expect(coversFrame(cropView(image({ frame: square, fit: 'fill' }), NATURAL))).toBe(true);
    expect(coversFrame(cropView(image({ frame: square, fit: 'contain' }), NATURAL))).toBe(false);
    // A contained picture of the frame's own proportions leaves nothing bare.
    expect(coversFrame(cropView(image({ fit: 'contain' }), NATURAL))).toBe(true);
  });
});

describe('cropScalePicture', () => {
  it('scales from a picture corner with the opposite corner anchored and the frame fixed', () => {
    const view = cropView(image(), NATURAL);
    const fromSouthEast = cropScalePicture(view, 'cover', HANDLES.se, { x: 120, y: 80 });
    expect(fromSouthEast.frame).toEqual(view.frame);
    expect(fromSouthEast.picture).toEqual({ x: 0, y: 0, w: 720, h: 480 });
    expect(cropPatch(fromSouthEast).crop).toMatchObject({ x: 0, y: 0 });
    expect(
      cropScalePicture(fromSouthEast, 'cover', HANDLES.se, { x: -120, y: -80 }).picture,
    ).toEqual(view.picture);

    const fromNorthWest = cropScalePicture(view, 'cover', HANDLES.nw, { x: -120, y: -80 });
    expect(fromNorthWest.picture).toEqual({ x: -120, y: -80, w: 720, h: 480 });
    expect(cropScalePicture(view, 'cover', HANDLES.se, { x: -500, y: -500 }).picture).toEqual(
      view.picture,
    );
  });

  it('follows the visible corner of a mirrored picture', () => {
    const view = cropView(image({ flipH: true }), NATURAL);
    const scaled = cropScalePicture(view, 'cover', HANDLES.se, { x: -120, y: 80 });
    expect(scaled.picture).toEqual({ x: 0, y: 0, w: 720, h: 480 });
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

describe('a picture in a drawn frame', () => {
  /** An instant photo: a card with a square opening near its top, drawn at twice its size. */
  const smartFrame = {
    viewBox: { w: 400, h: 480 },
    opening: { x: 26, y: 26, w: 348, h: 348 },
    scale: 2,
    decorations: [],
  };
  const card = { x: 700, y: 60, w: 800, h: 960 };
  const framed = (extra: Partial<ImageElement> = {}) =>
    image({ frame: card, smartFrame, ...extra });

  it('is viewed through the opening, where the renderer lays it out', () => {
    const view = cropView(framed(), NATURAL);
    expect(view.frame).toEqual({ x: 752, y: 112, w: 696, h: 696 });
    expect(view.outer).toEqual(card);
    const theirs = imagePlacement({ w: 696, h: 696 }, NATURAL, undefined, 'cover');
    expect(view.picture).toEqual({
      x: theirs.left,
      y: theirs.top,
      w: theirs.width,
      h: theirs.height,
    });
    // An image in a frame of its own has no other frame.
    expect(cropView(image(), NATURAL).outer).toBeUndefined();
  });

  it('moves and scales the picture under the opening, and writes only the crop', () => {
    const element = framed();
    const view = cropView(element, NATURAL);
    // 1044 wide in an opening of 696: 174 are out of sight on either side.
    const panned = cropPan(view, { x: -100, y: 40 });
    expect(panned.frame).toEqual(view.frame);
    expect(cropPatch(panned)).toEqual({
      frame: card,
      crop: { x: round(274 / 1044), y: 0, w: round(696 / 1044), h: 1 },
    });
    expectSamePicture(panned, reload(element, panned), 2);

    const zoomed = cropZoom(view, 'cover', 2);
    expect(zoomed.picture.w).toBeCloseTo(2088, 6);
    expect(cropPatch(zoomed).frame).toEqual(card);
    expectSamePicture(zoomed, reload(element, zoomed), 2);

    // Reset leaves the card, and the picture fills the opening again.
    expect(resetPatch(zoomed)).toEqual({ frame: card, crop: null });
  });

  it.each([
    { rotation: 30 },
    { rotation: 0, flipH: true },
    { rotation: -75, flipH: true, flipV: true },
  ])('is where the artwork has its opening for %o', (transform) => {
    const element = framed(transform);
    const view = cropView(element, NATURAL);
    // The middle of the opening is 80 above the middle of the card, in the card's own axes.
    const up = rotateVector({ x: 0, y: transform.flipV ? 80 : -80 }, element.rotation);
    expect(view.frame.x + 348).toBeCloseTo(1100 + up.x, 6);
    expect(view.frame.y + 348).toBeCloseTo(540 + up.y, 6);
    // The picture goes the way the pointer does, and comes back the same through the model.
    const before = pictureOnSlide(view);
    const panned = cropPan(view, { x: -60, y: 0 });
    const along = rotateVector({ x: -60, y: 0 }, element.rotation);
    pictureOnSlide(panned).forEach((p, i) => {
      expect(p.x - before[i]!.x).toBeCloseTo(along.x, 6);
      expect(p.y - before[i]!.y).toBeCloseTo(along.y, 6);
    });
    expect(cropPatch(panned).frame).toEqual(card);
    expectSamePicture(panned, reload(element, panned), 2);
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
