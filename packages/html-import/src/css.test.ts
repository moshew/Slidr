import type { Color } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  alphaOf,
  collapseWhitespace,
  compareLines,
  cornerRadius,
  fontFamilies,
  groupLines,
  parseBoxShadow,
  parseColor,
  parseGradient,
  px,
  rotationAndScale,
  scalePx,
  shadowFromBox,
  splitTopLevel,
  toHex,
  uniformScale,
  wrapsDifferently,
  type Line,
} from './css';

/** Colours as the tests read them: the hex of what the browser computed. */
const color = (css: string): Color | undefined => {
  const rgba = parseColor(css);
  if (!rgba) return undefined;
  return rgba.a < 1 ? { value: toHex(rgba), alpha: rgba.a } : { value: toHex(rgba) };
};

describe('computed values', () => {
  it('reads lengths and leaves the rest at zero', () => {
    expect(px('12.5px')).toBe(12.5);
    expect(px('auto')).toBe(0);
    expect(px('50%')).toBe(0);
    expect(px(undefined)).toBe(0);
  });

  it('reads the colour forms getComputedStyle returns', () => {
    expect(parseColor('rgb(15, 23, 42)')).toEqual({ r: 15, g: 23, b: 42, a: 1 });
    expect(parseColor('rgba(0, 0, 0, 0.35)')).toEqual({ r: 0, g: 0, b: 0, a: 0.35 });
    expect(parseColor('color(srgb 1 0.5 0 / 0.4)')).toEqual({ r: 255, g: 127.5, b: 0, a: 0.4 });
    expect(parseColor('transparent')?.a).toBe(0);
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    // Another colour space is not guessed at; the caller keeps the string.
    expect(parseColor('oklch(0.7 0.1 200)')).toBeUndefined();
    expect(alphaOf('oklch(0.7 0.1 200)')).toBe(1);
    expect(toHex({ r: 30, g: 58, b: 138, a: 1 })).toBe('#1e3a8a');
  });

  it('splits at commas and spaces outside parentheses and strings', () => {
    expect(splitTopLevel('rgb(1, 2, 3) 0px, url("a,b") 5px', ',')).toEqual([
      'rgb(1, 2, 3) 0px',
      'url("a,b") 5px',
    ]);
    expect(splitTopLevel('rgba(0, 0, 0, 0.3) 0px 12px 32px', ' ')).toEqual([
      'rgba(0, 0, 0, 0.3)',
      '0px',
      '12px',
      '32px',
    ]);
  });

  it('scales every px length of a value', () => {
    expect(scalePx('rgba(0, 0, 0, 0.6) 0px 6px 18px', 1.5)).toBe('rgba(0, 0, 0, 0.6) 0px 9px 27px');
    expect(scalePx('blur(40px)', 1)).toBe('blur(40px)');
  });

  it('names the families of a font list', () => {
    expect(fontFamilies('Inter, "Heebo", sans-serif')).toEqual(['Inter', 'Heebo', 'sans-serif']);
    expect(fontFamilies('"Segoe UI"')).toEqual(['Segoe UI']);
  });
});

describe('shadows', () => {
  it('reads the layers of a computed box-shadow', () => {
    expect(parseBoxShadow('none')).toEqual([]);
    expect(parseBoxShadow('rgba(0, 0, 0, 0.35) 0px 20px 40px 0px')).toEqual([
      { inset: false, x: 0, y: 20, blur: 40, spread: 0, color: 'rgba(0, 0, 0, 0.35)' },
    ]);
    expect(
      parseBoxShadow('rgb(0, 0, 0) 0px 0px 0px 2px inset, rgb(255, 0, 0) 1px 2px 3px 0px'),
    ).toEqual([
      { inset: true, x: 0, y: 0, blur: 0, spread: 2, color: 'rgb(0, 0, 0)' },
      { inset: false, x: 1, y: 2, blur: 3, spread: 0, color: 'rgb(255, 0, 0)' },
    ]);
  });

  it('halves the blur of a shadow the renderer draws as drop-shadow', () => {
    const layer = { inset: false, x: 0, y: 20, blur: 40, spread: 0, color: '' };
    expect(shadowFromBox(layer, { value: '#000000' }, 1)).toEqual({
      x: 0,
      y: 20,
      blur: 20,
      color: { value: '#000000' },
    });
    // With spread the renderer draws a box-shadow, and the numbers are CSS's own.
    expect(shadowFromBox({ ...layer, spread: 4 }, { value: '#000000' }, 1.5)).toEqual({
      x: 0,
      y: 30,
      blur: 60,
      spread: 6,
      color: { value: '#000000' },
    });
  });
});

describe('transforms', () => {
  it('tells an even scale from everything else', () => {
    expect(uniformScale('none')).toBe(1);
    expect(uniformScale('matrix(0.8, 0, 0, 0.8, 12, 30)')).toBe(0.8);
    expect(uniformScale('matrix(0.8, 0, 0, 0.6, 0, 0)')).toBeUndefined();
    expect(uniformScale('matrix(0.99, -0.14, 0.14, 0.99, 0, 0)')).toBeUndefined();
    expect(
      uniformScale('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)'),
    ).toBeUndefined();
  });

  it('reads a turn with an even scale', () => {
    const turn = rotationAndScale('matrix(0.990268, -0.139173, 0.139173, 0.990268, 0, 0)');
    expect(turn?.rotation).toBeCloseTo(-8, 1);
    expect(turn?.scale).toBeCloseTo(1, 4);
    expect(rotationAndScale('matrix(1, 0.5, 0, 1, 0, 0)')).toBeUndefined();
  });
});

describe('corner radii', () => {
  const box = { w: 400, h: 100 };
  const all = (r: string) => [r, r, r, r] as const;

  it('reads one radius for all corners', () => {
    expect(cornerRadius(all('0px'), box)).toEqual({ kind: 'none' });
    expect(cornerRadius(all('24px'), box)).toEqual({ kind: 'px', value: 24 });
  });

  it('shrinks a radius that does not fit, as CSS does: a pill, not an ellipse', () => {
    expect(cornerRadius(all('999px'), box)).toEqual({ kind: 'px', value: 50 });
    expect(cornerRadius(all('50%'), box)).toEqual({ kind: 'ellipse' });
  });

  it('keeps corners that differ as CSS', () => {
    expect(cornerRadius(['16px', '16px', '0px', '0px'], box)).toEqual({
      kind: 'css',
      value: '16px 16px 0px 0px',
    });
    expect(cornerRadius(all('20px 10px'), box)).toEqual({
      kind: 'css',
      value: '20px 20px 20px 20px / 10px 10px 10px 10px',
    });
  });
});

describe('gradients', () => {
  const box = { w: 400, h: 300 };

  it('reads a linear gradient with an angle or a side', () => {
    expect(
      parseGradient('linear-gradient(135deg, rgb(15, 23, 42), rgb(30, 58, 138))', box, color),
    ).toEqual({
      kind: 'linear',
      angle: 135,
      stops: [
        { color: { value: '#0f172a' }, at: 0 },
        { color: { value: '#1e3a8a' }, at: 1 },
      ],
    });
    expect(
      parseGradient(
        'linear-gradient(to right, rgb(255, 0, 0), rgb(0, 255, 0) 40%, rgb(0, 0, 255))',
        box,
        color,
      ),
    ).toMatchObject({ angle: 90, stops: [{ at: 0 }, { at: 0.4 }, { at: 1 }] });
    // No direction: top to bottom.
    expect(
      parseGradient('linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))', box, color),
    ).toMatchObject({ angle: 180 });
  });

  it('works out the angle of a corner from the sides of the box', () => {
    const fill = parseGradient(
      'linear-gradient(to right bottom, rgb(0, 0, 0), rgb(255, 255, 255))',
      box,
      color,
    );
    // In a 4:3 box the line to the bottom-right corner runs at 180 - atan(3/4).
    expect(fill).toMatchObject({ kind: 'linear', angle: 143.13 });
    expect(
      parseGradient('linear-gradient(to top left, rgb(0, 0, 0), rgb(255, 255, 255))', box, color),
    ).toMatchObject({
      angle: 323.13,
    });
  });

  it('spreads stops without a position and turns px into fractions of the line', () => {
    const fill = parseGradient(
      'linear-gradient(90deg, rgb(0, 0, 0), rgb(10, 10, 10), rgb(20, 20, 20), rgb(30, 30, 30) 100px, rgba(0, 0, 0, 0.5))',
      box,
      color,
    );
    expect(fill).toMatchObject({
      stops: [
        { at: 0 },
        { at: 0.0833 },
        { at: 0.1667 },
        { at: 0.25 },
        { at: 1, color: { alpha: 0.5 } },
      ],
    });
  });

  it('reads radial and conic gradients of the shapes the model has', () => {
    expect(
      parseGradient('radial-gradient(rgb(96, 165, 250), rgb(30, 58, 138))', box, color),
    ).toMatchObject({
      kind: 'radial',
      stops: [{ at: 0 }, { at: 1 }],
    });
    expect(
      parseGradient('radial-gradient(at 30% 70%, rgb(0, 0, 0), rgb(255, 255, 255))', box, color),
    ).toMatchObject({
      kind: 'radial',
      center: { x: 0.3, y: 0.7 },
    });
    expect(
      parseGradient(
        'conic-gradient(from 90deg, rgb(255, 0, 0), rgb(0, 255, 0) 180deg, rgb(0, 0, 255))',
        box,
        color,
      ),
    ).toMatchObject({ kind: 'conic', angle: 90, stops: [{ at: 0 }, { at: 0.5 }, { at: 1 }] });
  });

  it('gives up on what the model cannot say, so that the caller keeps the CSS', () => {
    const not = (css: string) => expect(parseGradient(css, box, color)).toBeUndefined();
    not('repeating-linear-gradient(45deg, rgb(0, 0, 0) 0px, rgb(255, 255, 255) 20px)');
    not('radial-gradient(circle at 30% 30%, rgb(0, 0, 0), rgb(255, 255, 255))');
    not('radial-gradient(closest-side, rgb(0, 0, 0), rgb(255, 255, 255))');
    not('linear-gradient(rgb(0, 0, 0), 30%, rgb(255, 255, 255))');
    not('linear-gradient(oklch(0.5 0.1 20), rgb(255, 255, 255))');
    not('url("x.png")');
  });
});

describe('white space', () => {
  const collapse = (...parts: string[]) =>
    collapseWhitespace(
      parts,
      parts.map((p) => p === '\n'),
    );

  it('collapses runs of white space across runs, as normal text shows them', () => {
    expect(collapse('  Revenue   grew\n by ', ' a third ', '  early.  ')).toEqual([
      'Revenue grew by ',
      'a third ',
      'early.',
    ]);
  });

  it('drops the space around a forced break', () => {
    expect(collapse('one ', '\n', ' two')).toEqual(['one', '\n', 'two']);
    expect(collapse('Hebrew שלום ', '', '\n', 'next')).toEqual(['Hebrew שלום', '', '\n', 'next']);
  });
});

describe('lines of text', () => {
  const word = (left: number, right: number, top: number): Line => ({
    left,
    right,
    top,
    bottom: top + 40,
  });

  it('groups word boxes into lines, top to bottom', () => {
    const lines = groupLines([
      word(300, 420, 100),
      word(100, 280, 100),
      word(100, 200, 154),
      word(0, 0.2, 154),
    ]);
    expect(lines).toEqual([
      { left: 100, right: 420, top: 100, bottom: 140 },
      { left: 100, right: 200, top: 154, bottom: 194 },
    ]);
  });

  it('puts a taller word on the line its middle falls in', () => {
    const lines = groupLines([word(0, 100, 100), { left: 110, right: 200, top: 90, bottom: 150 }]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ top: 90, bottom: 150, right: 200 });
  });

  const source = [word(100, 900, 100), word(100, 500, 154)];
  const moved = (dx: number, dy: number) =>
    source.map((l) => ({
      left: l.left + dx,
      right: l.right + dx,
      top: l.top + dy,
      bottom: l.bottom + dy,
    }));

  it('tells lines in place from lines that only moved', () => {
    expect(compareLines(source, moved(0, 0))).toEqual({ kind: 'same', dx: 0, dy: 0 });
    // Within tolerance, with what is left to correct.
    const near = compareLines(source, moved(0.3, -0.8));
    expect(near.kind).toBe('same');
    expect((near as { dx: number }).dx).toBeCloseTo(0.3, 5);
    expect((near as { dy: number }).dy).toBeCloseTo(-0.8, 5);
    expect(compareLines(source, moved(0, 6))).toEqual({ kind: 'shifted', dx: 0, dy: 6 });
    expect(compareLines(source, moved(-12, 3))).toEqual({ kind: 'shifted', dx: -12, dy: 3 });
  });

  it('measures a shift at the baseline when the glyph boxes differ in height', () => {
    // The converted box is 1px taller and starts where the source's does: the baseline is 0.8px lower.
    const taller = source.map((l) => ({ ...l, bottom: l.bottom + 1 }));
    expect(compareLines(source, taller)).toMatchObject({ kind: 'same', dx: 0 });
    expect((compareLines(source, taller) as { dy: number }).dy).toBeCloseTo(0.8, 5);
  });

  it('sees a different line pitch, and how to correct it', () => {
    const looser = [source[0]!, { ...source[1]!, top: 163, bottom: 203 }];
    expect(compareLines(source, looser)).toEqual({ kind: 'pitch', ratio: 54 / 63 });
  });

  it('sees a different wrap', () => {
    const three = [...source, word(100, 300, 208)];
    expect(compareLines(source, three)).toEqual({
      kind: 'different',
      why: 'wraps differently (2 lines in the source, 3 converted)',
    });
    expect(wrapsDifferently(source, three)).toMatch(/2 lines in the source, 3 converted/);
    // The same lines somewhere else wrap the same.
    expect(wrapsDifferently(source, moved(40, 40))).toBeUndefined();
    const shorter = [source[0]!, word(100, 460, 154)];
    expect(wrapsDifferently(source, shorter)).toBe('line 2 is 40.0px wider or narrower');
    expect(compareLines(source, shorter).kind).toBe('different');
  });
});
