import { describe, expect, it } from 'vitest';
import { createElement } from './factories';
import { Element, SvgStretch, type SvgStretch as Stretch } from './schema';
import { svgStretchLayout } from './svgStretch';

const sign: Stretch = {
  viewBox: { w: 500, h: 150 },
  scale: 1,
  x: [
    [60, 160],
    [340, 440],
  ],
  y: [[70, 88]],
};

describe('a stretchable text background', () => {
  it('lengthens clear strips and keeps the corners and central ornament the same size', () => {
    const { x, y, scale } = svgStretchLayout(sign, { w: 800, h: 150 });
    expect(scale).toBe(1);
    expect(x.map(28)).toBe(28);
    expect(x.map(472)).toBe(772);
    expect(x.map(175)).toBe(325);
    expect(x.map(325) - x.map(175)).toBe(150);
    expect(y.map(95)).toBe(95);
    expect(y.map(122)).toBe(122);
  });

  it('grows only the vertical strip when height changes', () => {
    const { x, y } = svgStretchLayout(sign, { w: 500, h: 300 });
    expect(x.map(472)).toBe(472);
    expect(y.map(28)).toBe(28);
    expect(y.map(122)).toBe(272);
    expect(y.map(95)).toBe(245);
  });

  it('can be narrowed without scaling its corners, and remains reversible at very small sizes', () => {
    expect(svgStretchLayout(sign, { w: 400, h: 150 }).scale).toBe(1);
    for (const size of [
      { w: 200, h: 150 },
      { w: 500, h: 60 },
      { w: 4, h: 4 },
    ]) {
      const layout = svgStretchLayout(sign, size);
      for (const [axis, length, target] of [
        ['x', 500, size.w],
        ['y', 150, size.h],
      ] as const) {
        expect(layout[axis].map(length)).toBeCloseTo(target, 6);
        for (let at = 0; at <= length; at += 10) {
          expect(layout[axis].unmap(layout[axis].map(at))).toBeCloseTo(at, 6);
        }
      }
    }
  });

  it('saves all the information needed to render offline and rejects invalid bands', () => {
    const element = createElement.svg({
      frame: { x: 0, y: 0, w: 800, h: 150 },
      markup: '<svg viewBox="0 0 500 150"/>',
      stretch: sign,
    });
    expect(Element.parse(JSON.parse(JSON.stringify(element)))).toEqual(element);
    for (const x of [
      [[100, 50]],
      [
        [50, 100],
        [90, 150],
      ],
      [[10, 501]],
      [],
    ]) {
      expect(SvgStretch.safeParse({ ...sign, x }).success).toBe(false);
    }
    const { markup: _markup, ...rest } = element;
    expect(Element.safeParse({ ...rest, assetId: 'picture' }).success).toBe(false);
  });
});
