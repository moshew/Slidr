import { describe, expect, it } from 'vitest';
import {
  attribute,
  clusters,
  differingPixels,
  downsample,
  uniformColor,
  type Picture,
} from './pixels';

/** A picture of one colour, with rectangles of other colours painted on it. */
function picture(
  width: number,
  height: number,
  base: [number, number, number],
  ...rects: [x: number, y: number, w: number, h: number, color: [number, number, number]][]
): Picture {
  const data = new Uint8ClampedArray(width * height * 4);
  const fill = (
    x0: number,
    y0: number,
    w: number,
    h: number,
    [r, g, b]: [number, number, number],
  ) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        data.set([r, g, b, 255], (y * width + x) * 4);
      }
    }
  };
  fill(0, 0, width, height, base);
  for (const [x, y, w, h, color] of rects) fill(x, y, w, h, color);
  return { width, height, data };
}

const WHITE: [number, number, number] = [255, 255, 255];
const count = (mask: Uint8Array) => mask.reduce((n, v) => n + v, 0);

describe('differing pixels', () => {
  it('sees nothing in two equal pictures', () => {
    const a = picture(40, 30, WHITE, [5, 5, 10, 10, [30, 58, 138]]);
    expect(
      count(differingPixels(a, picture(40, 30, WHITE, [5, 5, 10, 10, [30, 58, 138]]), 0.03)),
    ).toBe(0);
  });

  it('sees a box that moved', () => {
    const a = picture(40, 30, WHITE, [5, 5, 10, 10, [30, 58, 138]]);
    const b = picture(40, 30, WHITE, [8, 5, 10, 10, [30, 58, 138]]);
    // Three columns left behind and three newly covered.
    expect(count(differingPixels(a, b, 0.1))).toBe(60);
  });

  it('tells a slight colour change at the strict threshold only', () => {
    const a = picture(20, 20, [241, 245, 249]);
    const b = picture(20, 20, [251, 255, 255]);
    expect(count(differingPixels(a, b, 0.1))).toBe(0);
    expect(count(differingPixels(a, b, 0.03))).toBe(400);
  });

  it('averages blocks of pixels, which takes the edge off a half-pixel difference', () => {
    const a = downsample(picture(40, 40, WHITE, [0, 0, 21, 40, [0, 0, 0]]), 2);
    expect([a.width, a.height]).toEqual([20, 20]);
    // The column the edge runs through is half black.
    expect(a.data[10 * 4]).toBe(128);
    expect(a.data[9 * 4]).toBe(0);
    expect(a.data[11 * 4]).toBe(255);
    const same = picture(8, 8, WHITE);
    expect(downsample(same, 1)).toBe(same);
  });

  it('recognises a picture of one colour', () => {
    expect(uniformColor(picture(10, 10, [15, 23, 42]))).toEqual({ r: 15, g: 23, b: 42 });
    expect(uniformColor(picture(10, 10, [15, 23, 42], [2, 2, 1, 1, [16, 24, 43]]))).toEqual({
      r: 15,
      g: 23,
      b: 42,
    });
    expect(uniformColor(picture(10, 10, [15, 23, 42], [2, 2, 1, 1, [40, 23, 42]]))).toBeUndefined();
  });
});

describe('whose pixels differ', () => {
  const width = 40;
  const height = 30;
  const mask = (...points: [number, number][]) => {
    const m = new Uint8Array(width * height);
    for (const [x, y] of points) m[y * width + x] = 1;
    return m;
  };

  it('gives a pixel to the topmost region that covers it', () => {
    const under = { x: 5, y: 5, w: 20, h: 20 };
    const over = { x: 10, y: 10, w: 10, h: 10 };
    const owned = attribute(mask([6, 6], [12, 12], [13, 12], [30, 3]), width, height, [
      under,
      over,
    ]);
    expect(Array.from(owned.owned)).toEqual([300, 100]);
    expect(Array.from(owned.differing)).toEqual([1, 2]);
    expect(owned.loose).toEqual([3 * width + 30]);
    expect(owned.all).toHaveLength(4);
  });

  it('leaves a pixel to the region underneath when the one on top shows it through', () => {
    const card = { x: 2, y: 2, w: 30, h: 20 };
    const text = { x: 5, y: 5, w: 10, h: 5 };
    const sheen = { x: 3, y: 3, w: 28, h: 18 };
    // The sheen (2) leaves pixels to the text (1), and takes the card's (0) as any region does.
    const owned = attribute(
      mask([6, 6], [20, 15]),
      width,
      height,
      [card, text, sheen],
      [],
      (above, under) => above === 2 && under === 1,
    );
    expect(Array.from(owned.owned)).toEqual([30 * 20 - 28 * 18, 50, 28 * 18 - 50]);
    expect(Array.from(owned.differing)).toEqual([0, 1, 1]);
  });

  it('does not judge the outermost ring, nor ignored boxes', () => {
    const region = { x: 0, y: 0, w: width, h: height };
    const owned = attribute(
      mask([0, 0], [39, 10], [20, 29], [20, 15], [5, 5]),
      width,
      height,
      [region],
      [{ x: 4, y: 4, w: 4, h: 4 }],
    );
    expect(Array.from(owned.differing)).toEqual([1]);
    expect(owned.owned[0]).toBe(38 * 28 - 16);
  });

  it('groups differing pixels that lie together and names their owner', () => {
    const points: [number, number][] = [];
    for (let i = 0; i < 6; i++) points.push([13 + (i % 3), 13 + Math.floor(i / 3)]);
    points.push([35, 25]);
    const m = mask(...points);
    const owned = attribute(m, width, height, [{ x: 10, y: 10, w: 10, h: 10 }]);
    const found = clusters(owned.all, width, 6, owned.owner).sort((a, b) => b.pixels - a.pixels);
    expect(found).toEqual([
      { pixels: 6, owner: 0, box: { x: 12, y: 12, w: 6, h: 6 } },
      { pixels: 1, owner: -1, box: { x: 30, y: 24, w: 6, h: 6 } },
    ]);
  });

  it('joins neighbouring cells into one group', () => {
    const m = mask([5, 5], [6, 5], [7, 5]);
    const owned = attribute(m, width, height, []);
    expect(clusters(owned.loose, width, 6)).toEqual([
      { pixels: 3, owner: -1, box: { x: 0, y: 0, w: 12, h: 6 } },
    ]);
  });
});
