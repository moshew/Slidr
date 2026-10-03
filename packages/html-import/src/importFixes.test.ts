import { describe, expect, it } from 'vitest';
import { compareLines, type Line } from './css';
import { freezeWindowLengths, type WindowUnits } from './htmlCopy';

/*
 * What real decks taught the engine (ADR-036): a text whose lines are spaced a fraction
 * differently, and HTML copies whose lengths depended on the window they were drawn in.
 */

const line = (top: number, right = 900): Line => ({ left: 100, right, top, bottom: top + 42 });

describe('line spacing, fitted exactly', () => {
  // Two lines; the converted second line sits 1.37px low: inside the 1.5px tolerance.
  const source = [line(465.61), line(507.61, 500)];
  const converted = [line(465.61), line(508.98, 500)];

  it('is still "the same" to the judgement, which tolerates a pixel and a half', () => {
    expect(compareLines(source, converted).kind).toBe('same');
  });

  it('is a spacing to put right for the fit, which is what the pixels will be held to', () => {
    const verdict = compareLines(source, converted, true);
    expect(verdict.kind).toBe('pitch');
    expect((verdict as { ratio: number }).ratio).toBeCloseTo(42 / 43.37, 6);
  });

  it('leaves lines that are spaced alike alone, and a single line too', () => {
    const shifted = source.map((l) => ({ ...l, top: l.top + 0.4, bottom: l.bottom + 0.4 }));
    expect(compareLines(source, shifted, true).kind).toBe('same');
    expect(compareLines([line(100)], [line(100.6)], true).kind).toBe('same');
    // A hair of difference is rounding, not spacing.
    const hair = [source[0]!, { ...source[1]!, top: 507.64, bottom: 549.64 }];
    expect(compareLines(source, hair, true).kind).toBe('same');
  });

  it('does not call lines of other widths a matter of spacing', () => {
    const rewrapped = [line(465.61, 700), line(508.98, 700)];
    expect(compareLines(source, rewrapped, true).kind).toBe('different');
  });
});

describe('lengths that depend on the window, written out in px', () => {
  // A source rendered in a 1920x1080 window whose root font size is 21px.
  const units: WindowUnits = { vw: 19.2, vh: 10.8, rem: 21 };
  const freeze = (css: string) => freezeWindowLengths(css, units);

  it('resolves viewport units and rem as they resolved in the source', () => {
    expect(freeze('{ padding: 6vh 7vw; font-size: 1.5rem; }')).toBe(
      '{ padding: 64.8px 134.4px; font-size: 31.5px; }',
    );
    expect(freeze('width: calc(100vw - 2rem)')).toBe('width: calc(1920px - 42px)');
    expect(freeze('font-size: clamp(1rem, 2.5vw, 3rem)')).toBe(
      'font-size: clamp(21px, 48px, 63px)',
    );
    expect(freeze('margin: -2vh .5rem')).toBe('margin: -21.6px 10.5px');
  });

  it('knows the smaller and the larger side, and the small, large and dynamic viewports', () => {
    expect(freeze('a: 10vmin; b: 10vmax')).toBe('a: 108px; b: 192px');
    expect(freeze('a: 50dvh; b: 50svw; c: 10lvmin; d: 1vi; e: 1vb')).toBe(
      'a: 540px; b: 960px; c: 108px; d: 19.2px; e: 10.8px',
    );
    expect(freeze('HEIGHT: 100VH')).toBe('HEIGHT: 1080px');
  });

  it('leaves every other length, and anything that only looks like one', () => {
    for (const css of [
      'font-size: 2em; width: 50%; line-height: 1.4; gap: 12px; flex: 1 1 0',
      'background: url(https://example.com/10vw.png)',
      "content: \"100vh of text\"; quotes: '1rem' '2rem'",
      'grid-area: row-2vw; animation-name: grow10vh',
      'color: #1rem; transition: all .3s',
    ]) {
      expect(freeze(css)).toBe(css);
    }
  });
});
