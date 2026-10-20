import type { Color, Theme } from '@slidr/model';
import { parseHex, toHex, type Rgba } from '@slidr/ui';

/*
 * Model colours <-> the hex the colour picker works in. A model colour is a theme token or any
 * CSS colour (SPEC 5.9); the picker needs channels.
 */

const BLACK: Rgba = { r: 0, g: 0, b: 0, a: 1 };

let context: CanvasRenderingContext2D | null | undefined;

/** Any CSS colour as channels. Hex is read directly; every other syntax is the browser's to read. */
export function cssToRgba(css: string): Rgba | undefined {
  const hex = parseHex(css);
  if (hex) return hex;
  if (typeof document === 'undefined') return undefined;
  if (context === undefined) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    context = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!context || !CSS.supports('color', css)) return undefined;
  context.clearRect(0, 0, 1, 1);
  // A colour the canvas cannot resolve (one that needs the cascade) leaves `fillStyle` as it was.
  context.fillStyle = 'transparent';
  context.fillStyle = css;
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 255] = context.getImageData(0, 0, 1, 1).data;
  return { r, g, b, a: Math.round((a / 255) * 100) / 100 };
}

/** The colour as `#rrggbb` or `#rrggbbaa`, with a token read from the theme. */
export function colorToHex(color: Color, theme: Theme): string {
  const base = 'token' in color ? theme.colors[color.token] : color.value;
  const rgba = cssToRgba(base) ?? BLACK;
  return toHex({ ...rgba, a: rgba.a * (color.alpha ?? 1) });
}

/** The explicit model colour of a hex: `alpha` is kept apart from the value, as the model has it. */
export function hexToColor(hex: string): Color {
  const rgba = parseHex(hex) ?? BLACK;
  const value = toHex(rgba, false);
  return rgba.a < 1 ? { value, alpha: rgba.a } : { value };
}

/**
 * What a picked hex means for a colour that follows a theme token: when only the alpha moved, the
 * colour still follows the token; any other change makes it an explicit colour.
 */
export function pickedColor(hex: string, current: Color | null, theme: Theme): Color {
  const picked = parseHex(hex) ?? BLACK;
  if (current && 'token' in current) {
    const base = cssToRgba(theme.colors[current.token]);
    if (base && base.r === picked.r && base.g === picked.g && base.b === picked.b) {
      const alpha = base.a > 0 ? Math.round((picked.a / base.a) * 100) / 100 : 1;
      return alpha < 1 ? { token: current.token, alpha } : { token: current.token };
    }
  }
  return hexToColor(hex);
}
