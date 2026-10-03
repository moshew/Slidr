import { describe, expect, it } from 'vitest';
import { hsvToRgb, hueHex, parseHex, rgbToHsv, toHex } from './color';

describe('colour maths', () => {
  it('parses every hex form', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseHex('1a2B3c')).toEqual({ r: 26, g: 43, b: 60, a: 1 });
    expect(parseHex('#00000080')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parseHex('#f008')).toEqual({ r: 255, g: 0, b: 0, a: 0.53 });
    expect(parseHex('#ggg')).toBeUndefined();
    expect(parseHex('#12345')).toBeUndefined();
  });

  it('writes hex, with alpha only when translucent', () => {
    expect(toHex({ r: 26, g: 43, b: 60, a: 1 })).toBe('#1a2b3c');
    expect(toHex({ r: 0, g: 0, b: 0, a: 0.5 })).toBe('#00000080');
    expect(toHex({ r: 0, g: 0, b: 0, a: 0.5 }, false)).toBe('#000000');
  });

  it('round-trips rgb through hsv', () => {
    for (const hex of ['#ff0000', '#2f5bea', '#0f9d8a', '#f59e0b', '#15171a', '#ffffff']) {
      const rgb = parseHex(hex)!;
      expect(toHex(hsvToRgb(rgbToHsv(rgb)))).toBe(hex);
    }
  });

  it('keeps the hue of a grey', () => {
    expect(rgbToHsv({ r: 128, g: 128, b: 128, a: 1 }, 210).h).toBe(210);
    expect(rgbToHsv({ r: 0, g: 0, b: 0, a: 1 }, 42)).toEqual({ h: 42, s: 0, v: 0 });
  });

  it('gives the pure colour of a hue', () => {
    expect(hueHex(0)).toBe('#ff0000');
    expect(hueHex(120)).toBe('#00ff00');
    expect(hueHex(240)).toBe('#0000ff');
  });
});
