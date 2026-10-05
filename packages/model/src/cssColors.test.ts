import { describe, expect, it } from 'vitest';
import { mapCssColors, parseCssColor, themeColorCss } from './cssColors';

describe('parseCssColor', () => {
  it('reads hex, short and long, with and without alpha', () => {
    expect(parseCssColor('#9d7bff')).toEqual({ r: 157, g: 123, b: 255, a: 1 });
    expect(parseCssColor('#FFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor('#00000080')?.a).toBeCloseTo(0.5, 2);
  });

  it('reads what a browser computes: rgb, rgba and color(srgb)', () => {
    expect(parseCssColor('rgb(157, 123, 255)')).toEqual({ r: 157, g: 123, b: 255, a: 1 });
    expect(parseCssColor('rgba(0, 0, 0, 0)')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(parseCssColor('rgb(157 123 255 / 35%)')).toEqual({ r: 157, g: 123, b: 255, a: 0.35 });
    const mixed = parseCssColor('color(srgb 0.615686 0.482353 1 / 0.35)')!;
    expect([mixed.r, mixed.g, mixed.b].map(Math.round)).toEqual([157, 123, 255]);
    expect(mixed.a).toBe(0.35);
  });

  it('leaves what it cannot read: a name, a variable, another colour space', () => {
    for (const text of ['tomato', 'var(--color-primary)', 'color(display-p3 1 0 0)', '#12', '']) {
      expect(parseCssColor(text)).toBeUndefined();
    }
  });
});

describe('mapCssColors', () => {
  const glow =
    'radial-gradient(circle, color(srgb 0.615686 0.482353 1 / 0.35) 0%, rgba(0, 0, 0, 0) 70%) 0% 0% / auto repeat';

  it('asks about every colour written as a value, and keeps the rest to the letter', () => {
    const seen: string[] = [];
    const out = mapCssColors(glow, (color, text) => {
      seen.push(text);
      return color.a > 0 ? 'RED' : undefined;
    });
    expect(seen).toEqual(['color(srgb 0.615686 0.482353 1 / 0.35)', 'rgba(0, 0, 0, 0)']);
    expect(out).toBe('radial-gradient(circle, RED 0%, rgba(0, 0, 0, 0) 70%) 0% 0% / auto repeat');
  });

  it('reads hex among other values, and nothing inside a url or a variable', () => {
    const value =
      'linear-gradient(90deg, #b4432e 0px, var(--color-bg) 50%), url(#b4432e), url("a#fff.png")';
    expect(mapCssColors(value, () => 'X')).toBe(
      'linear-gradient(90deg, X 0px, var(--color-bg) 50%), url(#b4432e), url("a#fff.png")',
    );
  });
});

describe('themeColorCss', () => {
  it("is the theme's variable, mixed with nothing where the colour is translucent", () => {
    expect(themeColorCss('primary')).toBe('var(--color-primary)');
    expect(themeColorCss('surface', 0.35)).toBe(
      'color-mix(in srgb, var(--color-surface) 35%, transparent)',
    );
    expect(themeColorCss('bg', 0.125)).toBe(
      'color-mix(in srgb, var(--color-bg) 12.5%, transparent)',
    );
    expect(themeColorCss('bg', 0)).toBe('transparent');
  });
});
