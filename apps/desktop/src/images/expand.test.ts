import { describe, expect, it } from 'vitest';
import { expandedCanvas, expandedFrame } from './expand';

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

describe('the frame of an extended picture', () => {
  it('grows around the frame it had, so the picture that was there stays where it was', () => {
    const image = { width: 1000, height: 1000 };
    const canvas = expandedCanvas(image, '16:9')!;
    expect(expandedFrame({ x: 600, y: 300, w: 400, h: 400 }, canvas)).toEqual({
      x: 445,
      y: 300,
      w: 711,
      h: 400,
    });
  });
});
