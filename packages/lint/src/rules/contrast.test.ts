import { createElement, richText } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { blend, contrastRatio, hex } from '../color';
import type { Rgb, TextSpanMeasure } from '../measure';
import { BLACK, check, span, text, WHITE } from '../testing';
import { requiredContrast, spanContrast } from './contrast';

const frame = { x: 160, y: 340, w: 800, h: 100 };
const label = createElement.text({ id: 'e_label', frame, content: richText('שלום עולם') });
const drawn = (...spans: Partial<TextSpanMeasure>[]) => ({
  e_label: { box: frame, text: text(frame, { spans: spans.map(span) }) },
});
const grey = (v: number): Rgb => [v, v, v];

describe('contrast', () => {
  it('is the WCAG ratio', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
    // The well-known boundary of AA on white.
    expect(contrastRatio(grey(0x76), WHITE)).toBeCloseTo(4.54, 2);
    expect(contrastRatio(grey(0x77), WHITE)).toBeCloseTo(4.48, 2);
  });

  it('blends translucent text over what is under it', () => {
    expect(blend(WHITE, 0.5, BLACK)).toEqual([128, 128, 128]);
    expect(blend(WHITE, 1, BLACK)).toEqual(WHITE);
    expect(hex([47, 91, 234])).toBe('#2f5bea');
  });

  it('asks for 4.5:1, and 3:1 only above 48px', () => {
    expect(requiredContrast(30)).toBe(4.5);
    expect(requiredContrast(48)).toBe(4.5);
    expect(requiredContrast(48.5)).toBe(3);
    expect(requiredContrast(112)).toBe(3);
  });

  it('is what all but the worst tenth of the backdrop keeps', () => {
    const dark = grey(20);
    const sky = grey(235);
    const over = (bright: number) =>
      spanContrast(
        span({
          color: WHITE,
          backdrop: Array.from({ length: 20 }, (_, i) => (i < bright ? sky : dark)),
        }),
      );
    // One sample in twenty is a stray highlight; three are a part of the text.
    expect(over(0)?.ratio).toBeGreaterThan(15);
    expect(over(1)?.ratio).toBeGreaterThan(15);
    expect(over(3)?.ratio).toBeLessThan(1.3);
    expect(over(3)?.under).toEqual(sky);
  });

  it('is unknown without a backdrop, and for glyphs that are not drawn', () => {
    expect(spanContrast(span({ backdrop: [] }))).toBeUndefined();
    expect(spanContrast(span({ alpha: 0 }))).toBeUndefined();
  });
});

describe('L05: text contrast below AA', () => {
  it('reports the colours, the ratio measured and the ratio needed', () => {
    expect(check('L05', [label], drawn({ color: grey(0x77) }))).toMatchObject([
      {
        rule: 'L05',
        severity: 'error',
        slideId: 's_1',
        elementIds: ['e_label'],
        message:
          'Text in #777777 has a contrast of 4.47:1 against what is under it (#ffffff); 30px text needs 4.5:1 (WCAG AA; 3:1 only above 48px). Change the text colour, or put a lighter shape or overlay under the text.',
      },
    ]);
  });

  it('passes at the bar', () => {
    expect(check('L05', [label], drawn({ color: grey(0x76) }))).toEqual([]);
    expect(check('L05', [label])).toEqual([]);
  });

  it('holds large text to 3:1', () => {
    // 3.03:1 on white.
    const faint = grey(0x94);
    expect(check('L05', [label], drawn({ color: faint, fontSize: 72 }))).toEqual([]);
    expect(check('L05', [label], drawn({ color: faint, fontSize: 48 }))).toHaveLength(1);
    expect(check('L05', [label], drawn({ color: grey(0x96), fontSize: 72 }))).toHaveLength(1);
  });

  it('judges white text by the photo under it', () => {
    const night = Array.from({ length: 24 }, () => [29, 46, 60] as const);
    const sky = Array.from({ length: 24 }, () => [217, 230, 250] as const);
    expect(check('L05', [label], drawn({ color: WHITE, backdrop: night }))).toEqual([]);
    const [finding] = check('L05', [label], drawn({ color: WHITE, backdrop: [...night, ...sky] }));
    expect(finding?.message).toMatch(
      /^Text in #ffffff has a contrast of 1\.2\d:1 against what is under it \(#d9e6fa\)/,
    );
    expect(finding?.message).toMatch(/put a darker shape or overlay under the text\.$/);
  });

  it('takes translucent text as it looks', () => {
    // Black at 40% over white is #999999: 2.84:1.
    const [finding] = check('L05', [label], drawn({ color: BLACK, alpha: 0.4 }));
    expect(finding?.message).toMatch(/^Text in #000000 at 40% opacity has a contrast of 2\.84:1/);
  });

  it('reports the worst span of an element, once', () => {
    const findings = check(
      'L05',
      [label],
      drawn({ color: grey(0x77) }, { color: [245, 158, 11] }, { color: BLACK }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toMatch(/^Text in #f59e0b has a contrast of 2\.14:1/);
  });

  it('says nothing when what is under the text could not be read', () => {
    expect(check('L05', [label], drawn({ color: WHITE, backdrop: [] }))).toEqual([]);
  });
});
