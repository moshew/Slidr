import { describe, expect, it } from 'vitest';
import { parseColor, readTextEffects, writeTextEffects } from './effects';

const NONE = { fill: null, outline: null, shadow: null };

describe('writing the text effects as CSS of the element', () => {
  it('a gradient fill: a background clipped to the glyphs, with the text itself transparent', () => {
    const css = writeTextEffects(undefined, {
      fill: { angle: 90, from: { token: 'primary' }, to: { value: '#ff8800' } },
    });
    // The record the renderer's browser test draws (packages/renderer, textEffects).
    expect(css).toEqual({
      'background-image': 'linear-gradient(90deg, var(--color-primary), #ff8800)',
      'background-clip': 'text',
      '-webkit-background-clip': 'text',
      '-webkit-text-fill-color': 'transparent',
    });
  });

  it('an outline behind the letters, and a shadow', () => {
    expect(
      writeTextEffects(undefined, { outline: { width: 3, color: { token: 'accent' } } }),
    ).toEqual({
      '-webkit-text-stroke': '3px var(--color-accent)',
      'paint-order': 'stroke fill',
    });
    expect(
      writeTextEffects(undefined, {
        shadow: { x: 4, y: -6.5, blur: 12, color: { value: '#000000', alpha: 0.4 } },
      }),
    ).toEqual({ 'text-shadow': '4px -6.5px 12px color-mix(in srgb, #000000 40%, transparent)' });
  });

  it('a colour of the theme is written as its variable, so it follows the theme', () => {
    const css = writeTextEffects(undefined, {
      shadow: { x: 0, y: 2, blur: 4, color: { token: 'text', alpha: 0.25 } },
    });
    expect(css?.['text-shadow']).toBe(
      '0px 2px 4px color-mix(in srgb, var(--color-text) 25%, transparent)',
    );
  });

  it('rounds away the noise of a drag', () => {
    const css = writeTextEffects(undefined, {
      outline: { width: 2.4999999, color: { token: 'text' } },
      fill: { angle: 44.999999, from: { token: 'primary' }, to: { token: 'accent' } },
    });
    expect(css?.['-webkit-text-stroke']).toBe('2.5px var(--color-text)');
    expect(css?.['background-image']).toBe(
      'linear-gradient(45deg, var(--color-primary), var(--color-accent))',
    );
  });
});

describe('reading them back', () => {
  it('reads what it wrote, all three together', () => {
    const effects = {
      fill: { angle: 135, from: { token: 'primary' as const }, to: { token: 'accent' as const } },
      outline: { width: 1.5, color: { value: '#112233' } },
      shadow: { x: -2, y: 3, blur: 0, color: { token: 'text' as const, alpha: 0.5 } },
    };
    expect(readTextEffects(writeTextEffects(undefined, effects))).toEqual(effects);
  });

  it('reads nothing from no CSS, and from CSS that is about something else', () => {
    expect(readTextEffects(undefined)).toEqual(NONE);
    expect(readTextEffects({ 'clip-path': 'circle(40%)', 'mix-blend-mode': 'multiply' })).toEqual(
      NONE,
    );
    // A background that is not clipped to the text is the box's own.
    expect(readTextEffects({ 'background-image': 'linear-gradient(red, blue)' })).toEqual(NONE);
    expect(readTextEffects({ 'text-shadow': 'none' })).toEqual(NONE);
  });

  it('reads property names as CSS does: in any case, with space around them', () => {
    expect(
      readTextEffects({ ' Text-Shadow ': ' 1px 2px 3px red ', 'PAINT-ORDER': 'stroke fill' }),
    ).toEqual({ ...NONE, shadow: { x: 1, y: 2, blur: 3, color: { value: 'red' } } });
  });

  it('CSS it did not write is "custom": drawn, and not shown as something it is not', () => {
    // Two shadows, a shadow without a blur, a radial gradient, an outline in two properties.
    expect(readTextEffects({ 'text-shadow': '0 0 4px red, 0 0 12px blue' }).shadow).toBe('custom');
    expect(readTextEffects({ 'text-shadow': '1px 1px black' }).shadow).toBe('custom');
    expect(
      readTextEffects({
        background: 'radial-gradient(red, blue)',
        '-webkit-background-clip': 'text',
        '-webkit-text-fill-color': 'transparent',
      }).fill,
    ).toBe('custom');
    expect(
      readTextEffects({
        'background-image': 'linear-gradient(90deg, red 10%, blue 60%, green)',
        'background-clip': 'text',
        '-webkit-text-fill-color': 'transparent',
      }).fill,
    ).toBe('custom');
    expect(readTextEffects({ '-webkit-text-fill-color': 'red' }).fill).toBe('custom');
    expect(
      readTextEffects({ '-webkit-text-stroke-width': '2px', '-webkit-text-stroke-color': 'red' })
        .outline,
    ).toBe('custom');
    expect(readTextEffects({ '-webkit-text-stroke': 'thin red' }).outline).toBe('custom');
  });

  it('reads the colours that colorCss writes', () => {
    expect(parseColor('var(--color-primary)')).toEqual({ token: 'primary' });
    expect(parseColor('#1a2b3c')).toEqual({ value: '#1a2b3c' });
    expect(parseColor('rgb(1, 2, 3)')).toEqual({ value: 'rgb(1, 2, 3)' });
    expect(parseColor('transparent')).toEqual({ value: 'transparent' });
    expect(parseColor('color-mix(in srgb, var(--color-accent) 30%, transparent)')).toEqual({
      token: 'accent',
      alpha: 0.3,
    });
    expect(parseColor('color-mix(in srgb, rgb(1, 2, 3) 62.5%, transparent)')).toEqual({
      value: 'rgb(1, 2, 3)',
      alpha: 0.625,
    });
    // A variable that is no colour of the theme is an explicit colour, as it stands.
    expect(parseColor('var(--color-brand)')).toEqual({ value: 'var(--color-brand)' });
    // A gradient stop with a position is not a colour; nor is a mix of a colour that is mixed.
    expect(parseColor('red 20%')).toBeUndefined();
    expect(
      parseColor('color-mix(in srgb, color-mix(in srgb, red 50%, transparent) 30%, transparent)'),
    ).toBeUndefined();
  });
});

describe('changing one effect leaves the rest of the CSS alone', () => {
  const imported = {
    'clip-path': 'inset(0 round 12px)',
    'text-shadow': '0 0 4px red, 0 0 12px blue',
    'Background-Image': 'linear-gradient(to right, gold, crimson)',
    '-webkit-background-clip': 'text',
    '-webkit-text-fill-color': 'transparent',
  };

  it('keeps custom CSS until that effect is changed', () => {
    const outlined = writeTextEffects(imported, {
      outline: { width: 2, color: { token: 'text' } },
    });
    expect(outlined).toEqual({
      ...imported,
      '-webkit-text-stroke': '2px var(--color-text)',
      'paint-order': 'stroke fill',
    });
    expect(readTextEffects(outlined)).toMatchObject({ fill: 'custom', shadow: 'custom' });
  });

  it('replaces a custom effect when it is set, whatever case its properties were written in', () => {
    const filled = writeTextEffects(imported, {
      fill: { angle: 0, from: { token: 'primary' }, to: { token: 'secondary' } },
    });
    expect(filled).toEqual({
      'clip-path': 'inset(0 round 12px)',
      'text-shadow': '0 0 4px red, 0 0 12px blue',
      'background-image': 'linear-gradient(0deg, var(--color-primary), var(--color-secondary))',
      'background-clip': 'text',
      '-webkit-background-clip': 'text',
      '-webkit-text-fill-color': 'transparent',
    });
  });

  it('removes an effect with every property it owns, and nothing else', () => {
    expect(writeTextEffects(imported, { fill: null, shadow: null })).toEqual({
      'clip-path': 'inset(0 round 12px)',
    });
    // A `background` shorthand that filled the text goes with the fill; one of the box stays.
    expect(
      writeTextEffects(
        { background: 'linear-gradient(red, blue)', 'background-clip': 'text', opacity: '0.9' },
        { fill: null },
      ),
    ).toEqual({ opacity: '0.9' });
    expect(writeTextEffects({ background: 'red' }, { fill: null })).toEqual({ background: 'red' });
  });

  it('gives no record at all when the last property goes', () => {
    const css = writeTextEffects(undefined, {
      shadow: { x: 1, y: 1, blur: 1, color: { value: 'red' } },
    });
    expect(writeTextEffects(css, { shadow: null })).toBeUndefined();
    expect(writeTextEffects(undefined, { fill: null })).toBeUndefined();
  });
});
