import type { ImageElement } from '@slidr/model';
import { imagePlacement } from '@slidr/renderer';
import { describe, expect, it } from 'vitest';
import { expandedCanvas, expandedFrame, type ExpandedCanvas } from './expand';

describe('the canvas a picture is extended to', () => {
  it('is the smallest one of the wanted shape that holds the whole picture, around its middle', () => {
    // A square picture to a wide slide: margins left and right.
    expect(expandedCanvas({ width: 1000, height: 1000 }, '16:9')).toEqual({
      w: 1778,
      h: 1000,
      x: 389,
      y: 0,
    });
    // A wide picture to a square: margins above and below.
    expect(expandedCanvas({ width: 1600, height: 900 }, '1:1')).toEqual({
      w: 1600,
      h: 1600,
      x: 0,
      y: 350,
    });
  });

  it('is nothing for a picture that already has the shape', () => {
    expect(expandedCanvas({ width: 1600, height: 900 }, '16:9')).toBeUndefined();
    expect(expandedCanvas({ width: 1602, height: 900 }, '16:9')).toBeUndefined();
  });

  it('is never larger than a provider draws: a huge picture is scaled down with it', () => {
    expect(expandedCanvas({ width: 8000, height: 8000 }, '16:9')).toEqual({
      w: 4096,
      h: 2304,
      x: 896,
      y: 0,
    });
  });
});

type Placed = Pick<ImageElement, 'frame' | 'crop' | 'fit' | 'rotation' | 'flipH' | 'flipV'>;

/**
 * Where a point of a picture (in its pixels) is drawn on the slide, and at what scale: through
 * the crop and the fit, the mirroring inside the frame, and the turn of the frame about its
 * middle, as the renderer draws an image element.
 */
function onSlide(
  element: Placed,
  natural: { w: number; h: number },
  point: { x: number; y: number },
) {
  const { frame } = element;
  const placed = imagePlacement(frame, natural, element.crop, element.fit);
  let x = placed.left + (point.x / natural.w) * placed.width;
  let y = placed.top + (point.y / natural.h) * placed.height;
  if (element.flipH) x = frame.w - x;
  if (element.flipV) y = frame.h - y;
  const turn = (element.rotation * Math.PI) / 180;
  const dx = x - frame.w / 2;
  const dy = y - frame.h / 2;
  return {
    x: frame.x + frame.w / 2 + dx * Math.cos(turn) - dy * Math.sin(turn),
    y: frame.y + frame.h / 2 + dx * Math.sin(turn) + dy * Math.cos(turn),
    scale: placed.width / natural.w,
  };
}

/** The same point of the old picture, once the element holds the extended one. */
function afterExtending(
  element: Placed,
  natural: { w: number; h: number },
  canvas: ExpandedCanvas,
  point: { x: number; y: number },
) {
  // The extended file may be a scaled-down copy: the old picture is `inside` wide in it.
  const inside = canvas.w - canvas.x * 2;
  const k = inside / natural.w;
  const extended: Placed = {
    ...element,
    crop: undefined,
    frame: expandedFrame(element, natural, canvas),
  };
  const drawn = onSlide(
    extended,
    { w: canvas.w, h: canvas.h },
    {
      x: canvas.x + point.x * k,
      y: canvas.y + point.y * k,
    },
  );
  return { ...drawn, scale: drawn.scale * k, frame: extended.frame };
}

const base: Placed = { frame: { x: 400, y: 200, w: 500, h: 500 }, fit: 'cover', rotation: 0 };

function expectKept(
  element: Placed,
  natural: { w: number; h: number },
  aspect: '16:9' | '1:1' | '9:16',
) {
  const canvas = expandedCanvas({ width: natural.w, height: natural.h }, aspect)!;
  for (const point of [
    { x: natural.w * 0.25, y: natural.h * 0.25 },
    { x: natural.w * 0.9, y: natural.h * 0.6 },
  ]) {
    const before = onSlide(element, natural, point);
    const after = afterExtending(element, natural, canvas, point);
    // The frame is in whole pixels, which is the most the picture may move.
    expect(after.scale / before.scale).toBeCloseTo(1, 2);
    expect(Math.abs(after.x - before.x)).toBeLessThan(1.5);
    expect(Math.abs(after.y - before.y)).toBeLessThan(1.5);
  }
}

describe('the frame of an extended picture', () => {
  it('grows around the frame it had, so the picture that was there stays where it was', () => {
    const natural = { w: 1000, h: 1000 };
    const canvas = expandedCanvas({ width: 1000, height: 1000 }, '16:9')!;
    expect(
      expandedFrame({ ...base, frame: { x: 600, y: 300, w: 400, h: 400 } }, natural, canvas),
    ).toEqual({ x: 444, y: 300, w: 711, h: 400 });
    expectKept(base, { w: 2000, h: 2000 }, '16:9');
  });

  it('keeps a cropped picture where it was, and at its size', () => {
    // The element shows the top-left quarter of the picture, 500 by 500 on the slide: the whole
    // picture is drawn 1000 by 1000 from the frame's corner, and the frame grows around that.
    const natural = { w: 2000, h: 2000 };
    const cropped: Placed = { ...base, crop: { x: 0, y: 0, w: 0.5, h: 0.5 } };
    const canvas = expandedCanvas({ width: 2000, height: 2000 }, '16:9')!;
    expect(expandedFrame(cropped, natural, canvas)).toEqual({ x: 11, y: 200, w: 1778, h: 1000 });
    expectKept(cropped, natural, '16:9');
    // A crop off the middle, of another shape than the frame, to a tall canvas.
    expectKept(
      {
        ...base,
        frame: { x: 300, y: 100, w: 640, h: 360 },
        crop: { x: 0.3, y: 0.5, w: 0.6, h: 0.4 },
      },
      { w: 2400, h: 1600 },
      '9:16',
    );
  });

  it('keeps a picture that covers a frame of another shape, or sits inside one', () => {
    const wide = { w: 2400, h: 1200 };
    expectKept({ ...base, fit: 'cover' }, wide, '1:1');
    expectKept({ ...base, fit: 'contain' }, wide, '1:1');
    expectKept({ ...base, fit: 'fill' }, wide, '1:1');
  });

  it('keeps a turned or mirrored picture where it was', () => {
    const natural = { w: 2000, h: 1500 };
    const crop = { x: 0.1, y: 0.2, w: 0.5, h: 0.5 };
    expectKept({ ...base, crop, rotation: 30 }, natural, '16:9');
    expectKept({ ...base, crop, rotation: -90 }, natural, '1:1');
    expectKept({ ...base, crop, flipH: true }, natural, '16:9');
    expectKept({ ...base, crop, flipV: true, rotation: 45 }, natural, '9:16');
    expectKept({ ...base, crop, flipH: true, flipV: true, rotation: 200 }, natural, '1:1');
  });

  it('keeps the picture of a file that was scaled down to be sent', () => {
    expectKept(
      { ...base, crop: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 } },
      { w: 8000, h: 8000 },
      '16:9',
    );
  });
});
