import { createBaseTheme, type Theme } from '@slidr/model';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { colorRgb, duotonePreset, duotoneTokens, imageFilterNames, imageLook } from './imageLook';

const base = createBaseTheme();
const theme: Theme = {
  ...base,
  colors: { ...base.colors, bg: '#ffffff', text: '#101010', primary: '#2f5bea', accent: '#f5a' },
};
const id = (suffix: string) => `x-${suffix}`;
const defs = (look: ReturnType<typeof imageLook>) => renderToStaticMarkup(<>{look.defs}</>);

describe('the look of a picture', () => {
  it('is nothing for a picture drawn as its file holds it', () => {
    expect(imageLook({}, theme, id)).toEqual({ filter: undefined, defs: null });
    expect(imageLook({ adjust: { brightness: 1, contrast: 1 } }, theme, id).filter).toBeUndefined();
  });

  it('writes the adjustments as CSS filters, the temperature first as an SVG filter', () => {
    const look = imageLook(
      {
        adjust: {
          temperature: 0.8,
          brightness: 1.1,
          contrast: 1.2,
          saturation: 0.5,
          hue: 30,
          grayscale: 0.4,
          blur: 6,
        },
      },
      theme,
      id,
    );
    expect(look.filter).toBe(
      'url(#x-temperature) brightness(1.1) contrast(1.2) saturate(0.5) hue-rotate(30deg) grayscale(0.4) blur(6px)',
    );
    expect(defs(look)).toContain('<filter id="x-temperature"');
    expect(defs(look)).toContain('values="1.2 0 0 0 0 0 1 0 0 0 0 0 0.8 0 0 0 0 0 1 0"');
  });

  it('puts a ready-made look before the adjustments', () => {
    expect(imageLook({ filterPreset: 'mono' }, theme, id).filter).toBe('grayscale(1)');
    expect(imageLook({ filterPreset: 'mono', adjust: { blur: 2 } }, theme, id).filter).toBe(
      'grayscale(1) blur(2px)',
    );
    for (const name of imageFilterNames) {
      expect(imageLook({ filterPreset: name }, theme, id).filter, name).toBeTruthy();
    }
  });

  it("adds the temperature of a look to the element's own, within -1 and 1", () => {
    const warm = imageLook({ filterPreset: 'warm' }, theme, id);
    expect(warm.filter).toBe('url(#x-temperature) saturate(1.15)');
    expect(defs(warm)).toContain('values="1.125 0 0 0 0 0 1 0 0 0 0 0 0.875 0 0 0 0 0 1 0"');
    // Warm and cooled back by as much: no temperature filter at all.
    const even = imageLook({ filterPreset: 'warm', adjust: { temperature: -0.5 } }, theme, id);
    expect(even.filter).toBe('saturate(1.15)');
    const most = imageLook({ filterPreset: 'warm', adjust: { temperature: 0.9 } }, theme, id);
    expect(defs(most)).toContain('values="1.25 0 0 0 0 0 1 0 0 0 0 0 0.75 0 0 0 0 0 1 0"');
  });

  it('draws nothing for a look it does not know', () => {
    expect(imageLook({ filterPreset: 'from-the-future' }, theme, id)).toEqual({
      filter: undefined,
      defs: null,
    });
    expect(
      imageLook({ filterPreset: 'duotone:primary:nothing' }, theme, id).filter,
    ).toBeUndefined();
  });
});

describe("a duotone in the theme's colours", () => {
  it('names two tokens', () => {
    expect(duotonePreset('primary', 'bg')).toBe('duotone:primary:bg');
    expect(duotoneTokens('duotone:primary:bg')).toEqual(['primary', 'bg']);
    expect(duotoneTokens('mono')).toBeUndefined();
    expect(duotoneTokens(undefined)).toBeUndefined();
  });

  it('maps the dark parts to the darker colour, whichever way the tokens are named', () => {
    const one = imageLook({ filterPreset: 'duotone:primary:bg' }, theme, id);
    const other = imageLook({ filterPreset: 'duotone:bg:primary' }, theme, id);
    expect(one.filter).toBe('url(#x-duotone)');
    expect(defs(one)).toBe(defs(other));
    // Red runs from the primary's (0x2f) to the background's (0xff).
    expect(defs(one)).toContain('<feFuncR type="table" tableValues="0.1843 1"');
    expect(defs(one)).toContain('<feFuncB type="table" tableValues="0.9176 1"');
  });

  it('follows the theme: other colours, another filter', () => {
    const dark: Theme = { ...theme, colors: { ...theme.colors, bg: '#000000' } };
    const look = imageLook({ filterPreset: 'duotone:primary:bg' }, dark, id);
    expect(defs(look)).toContain('<feFuncR type="table" tableValues="0 0.1843"');
  });

  it('goes before the adjustments', () => {
    const look = imageLook(
      { filterPreset: 'duotone:text:accent', adjust: { contrast: 1.2 } },
      theme,
      id,
    );
    expect(look.filter).toBe('url(#x-duotone) contrast(1.2)');
  });
});

describe('a colour as numbers', () => {
  it('reads hex in its three lengths', () => {
    expect(colorRgb('#ffffff')).toEqual([1, 1, 1]);
    expect(colorRgb('#f00')).toEqual([1, 0, 0]);
    expect(colorRgb('#00ff0080')).toEqual([0, 1, 0]);
  });
});
