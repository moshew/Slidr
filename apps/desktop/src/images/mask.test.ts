import { describe, expect, it } from 'vitest';
import {
  BRUSH,
  brushRadius,
  canvasPoint,
  hasPaint,
  PAINT_ROOM,
  PAINT_SIDE,
  paintSize,
  shownSize,
} from './mask';

describe('the canvas a mask is painted on', () => {
  it('is the image at its own size, down to the painting size', () => {
    expect(paintSize({ width: 640, height: 400 })).toEqual({ w: 640, h: 400 });
    expect(paintSize({ width: 4096, height: 2048 })).toEqual({ w: PAINT_SIDE, h: 512 });
    expect(paintSize({ width: 1000, height: 3000 })).toEqual({ w: 341, h: PAINT_SIDE });
  });

  it('is shown whole in the room of the dialog, at its own proportions', () => {
    expect(shownSize({ w: 1024, h: 512 })).toEqual({ w: PAINT_ROOM.w, h: 340 });
    const tall = shownSize({ w: 341, h: 1024 });
    expect(tall.h).toBe(PAINT_ROOM.h);
    expect(tall.w / tall.h).toBeCloseTo(341 / 1024, 2);
  });

  it('turns a pointer over the shown canvas into a point of the canvas', () => {
    const box = { left: 100, top: 50, width: 340, height: 170 };
    const canvas = { w: 1024, h: 512 };
    expect(canvasPoint({ clientX: 100, clientY: 50 }, box, canvas)).toEqual({ x: 0, y: 0 });
    const middle = canvasPoint({ clientX: 270, clientY: 135 }, box, canvas);
    expect(middle.x).toBeCloseTo(512);
    expect(middle.y).toBeCloseTo(256);
  });

  it('has a brush that grows with the canvas and with the slider', () => {
    const canvas = { w: 1024, h: 512 };
    expect(brushRadius(BRUSH.start, canvas)).toBeCloseTo(30.72);
    expect(brushRadius(BRUSH.max, canvas)).toBeGreaterThan(brushRadius(BRUSH.min, canvas));
    expect(brushRadius(BRUSH.min, { w: 20, h: 10 })).toBe(1);
  });

  it('knows whether anything was painted', () => {
    const clear = new Uint8ClampedArray(4 * 4);
    expect(hasPaint(clear)).toBe(false);
    clear[11] = 40;
    expect(hasPaint(clear)).toBe(true);
  });
});
