import { createBaseTheme } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { chooseTextStyle, marksOver, snapColor, themeValues, type TextLook } from './tokens';

const theme = createBaseTheme();
/** The base theme as a browser would compute it: hex colours stay themselves here. */
const values = themeValues(
  theme,
  (css) => css,
  (css) =>
    css.includes('heading') ? '"Inter", "Heebo", sans-serif' : '"Inter", "Heebo", sans-serif',
);

const look = (over: Partial<TextLook> = {}): TextLook => ({
  families: ['Inter', 'Heebo', 'sans-serif'],
  size: 30,
  weight: 400,
  italic: false,
  color: { token: 'text' },
  letterSpacing: 0,
  ...over,
});

describe('colours', () => {
  it('turns a theme colour into its token, with its alpha', () => {
    expect(snapColor('rgb(47, 91, 234)', values)).toEqual({ token: 'primary' });
    expect(snapColor('rgba(15, 157, 138, 0.4)', values)).toEqual({
      token: 'secondary',
      alpha: 0.4,
    });
    expect(snapColor('color(srgb 0.184314 0.356863 0.917647 / 0.5)', values)).toEqual({
      token: 'primary',
      alpha: 0.5,
    });
  });

  it('keeps any other colour as a value', () => {
    expect(snapColor('rgb(1, 2, 3)', values)).toEqual({ value: '#010203' });
    expect(snapColor('rgba(0, 0, 0, 0.35)', values)).toEqual({ value: '#000000', alpha: 0.35 });
    expect(snapColor('oklch(0.7 0.1 200)', values)).toEqual({ value: 'oklch(0.7 0.1 200)' });
  });

  it('links only where the source took the colour from the theme', () => {
    const white = 'rgb(255, 255, 255)';
    // White text on a dark slide equals the theme's background and has nothing to do with it.
    expect(snapColor(white, values, () => false)).toEqual({ value: '#ffffff' });
    expect(snapColor(white, values, (token) => token === 'bg')).toEqual({ token: 'bg' });
  });

  it('picks, among tokens of one colour, the one that was used', () => {
    const both = themeValues(
      { ...theme, colors: { ...theme.colors, surface: '#ffffff' } },
      (css) => css,
      () => '',
    );
    expect(snapColor('rgb(255, 255, 255)', both, (token) => token === 'surface')).toEqual({
      token: 'surface',
    });
    expect(snapColor('rgb(255, 255, 255)', both)).toEqual({ token: 'bg' });
  });
});

describe('text styles', () => {
  it('points text at the theme style of its size', () => {
    expect(chooseTextStyle(look(), theme, values)).toBe('body');
    expect(chooseTextStyle(look({ size: 72, weight: 700 }), theme, values)).toBe('title');
    expect(chooseTextStyle(look({ size: 22 }), theme, values)).toBe('caption');
  });

  it('otherwise takes the largest style that is not larger than the text', () => {
    // The renderer lays a paragraph out on its style's size; a larger one would set the line height.
    expect(chooseTextStyle(look({ size: 60 }), theme, values)).toBe('heading');
    expect(chooseTextStyle(look({ size: 36 }), theme, values)).toBe('body');
    expect(chooseTextStyle(look({ size: 200 }), theme, values)).toBe('display');
    // Smaller than every style: the smallest.
    expect(chooseTextStyle(look({ size: 14 }), theme, values)).toBe('caption');
  });

  it('never picks a style that changes the case', () => {
    const shouting = {
      ...theme,
      textStyles: {
        ...theme.textStyles,
        body: { ...theme.textStyles.body, case: 'upper' as const },
      },
    };
    expect(chooseTextStyle(look(), shouting, values)).not.toBe('body');
    expect(chooseTextStyle(look({ case: 'upper' }), shouting, values)).toBe('body');
  });

  it('gives text that matches its style no marks at all', () => {
    expect(marksOver(look(), 'body', theme, values)).toEqual({});
    expect(marksOver(look({ size: 72, weight: 700 }), 'title', theme, values)).toEqual({});
  });

  it('marks only what differs from the style', () => {
    expect(
      marksOver(
        look({
          families: ['Georgia', 'serif'],
          size: 36,
          weight: 700,
          italic: true,
          color: { value: '#cbd5e1' },
          letterSpacing: 4,
          case: 'upper',
        }),
        'body',
        theme,
        values,
      ),
    ).toEqual({
      font: 'Georgia',
      size: 36,
      weight: 700,
      italic: true,
      color: { value: '#cbd5e1' },
      letterSpacing: 4,
      case: 'upper',
    });
  });

  it('names the first family the document can draw', () => {
    const marks = marksOver(
      look({ families: ['Missing Sans', 'Arial', 'sans-serif'], font: 'Arial' }),
      'body',
      theme,
      values,
    );
    expect(marks).toEqual({ font: 'Arial' });
  });

  it('writes every value out for text the theme is not about', () => {
    expect(marksOver(look(), 'body', theme, values, false)).toEqual({
      font: 'Inter',
      size: 30,
      weight: 400,
      color: { token: 'text' },
    });
  });
});
