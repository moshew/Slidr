import { parseCssColor, type Color, type ColorToken } from '@slidr/model';

/*
 * Colours between the two models. A theme token of Slidr is a scheme colour of PowerPoint, so a
 * colour that follows the theme in the deck follows it in the file too:
 *
 *   bg -> bg1 (lt1)   text -> tx1 (dk1)   surface -> bg2 (lt2)   muted -> tx2 (dk2)
 *   primary -> accent1   secondary -> accent2   accent -> accent3
 *
 * Any other colour is written as its RGB value and alpha.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0..1 */
  a: number;
}

/** The scheme colour each token is written as. */
export const TOKEN_SCHEME: Record<ColorToken, string> = {
  bg: 'bg1',
  text: 'tx1',
  surface: 'bg2',
  muted: 'tx2',
  primary: 'accent1',
  secondary: 'accent2',
  accent: 'accent3',
};

/** The theme slot of each token, before the colour map: what the theme part defines. */
export const TOKEN_SLOT: Record<ColorToken, string> = {
  bg: 'lt1',
  text: 'dk1',
  surface: 'lt2',
  muted: 'dk2',
  primary: 'accent1',
  secondary: 'accent2',
  accent: 'accent3',
};

/* ---------------------------------------------------------------- CSS colours */

const NAMED =
  'aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,' +
  'bisque:ffe4c4,black:000000,blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,' +
  'burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00,chocolate:d2691e,coral:ff7f50,' +
  'cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:00ffff,darkblue:00008b,' +
  'darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9,' +
  'darkkhaki:bdb76b,darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,' +
  'darkorchid:9932cc,darkred:8b0000,darksalmon:e9967a,darkseagreen:8fbc8f,darkslateblue:483d8b,' +
  'darkslategray:2f4f4f,darkslategrey:2f4f4f,darkturquoise:00ced1,darkviolet:9400d3,' +
  'deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dimgrey:696969,dodgerblue:1e90ff,' +
  'firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,' +
  'ghostwhite:f8f8ff,gold:ffd700,goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,' +
  'grey:808080,honeydew:f0fff0,hotpink:ff69b4,indianred:cd5c5c,indigo:4b0082,ivory:fffff0,' +
  'khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,lawngreen:7cfc00,lemonchiffon:fffacd,' +
  'lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,lightgoldenrodyellow:fafad2,' +
  'lightgray:d3d3d3,lightgreen:90ee90,lightgrey:d3d3d3,lightpink:ffb6c1,lightsalmon:ffa07a,' +
  'lightseagreen:20b2aa,lightskyblue:87cefa,lightslategray:778899,lightslategrey:778899,' +
  'lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32,linen:faf0e6,' +
  'magenta:ff00ff,maroon:800000,mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3,' +
  'mediumpurple:9370db,mediumseagreen:3cb371,mediumslateblue:7b68ee,mediumspringgreen:00fa9a,' +
  'mediumturquoise:48d1cc,mediumvioletred:c71585,midnightblue:191970,mintcream:f5fffa,' +
  'mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead,navy:000080,oldlace:fdf5e6,olive:808000,' +
  'olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6,palegoldenrod:eee8aa,' +
  'palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,' +
  'peachpuff:ffdab9,peru:cd853f,pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,' +
  'rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f,royalblue:4169e1,saddlebrown:8b4513,' +
  'salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d,silver:c0c0c0,' +
  'skyblue:87ceeb,slateblue:6a5acd,slategray:708090,slategrey:708090,snow:fffafa,' +
  'springgreen:00ff7f,steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,' +
  'turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,' +
  'yellowgreen:9acd32';

const NAMED_COLORS = new Map(NAMED.split(',').map((pair) => pair.split(':') as [string, string]));

const TOKEN_VAR =
  /^var\(\s*--color-(bg|surface|text|muted|primary|secondary|accent)\s*(?:,[^)]*)?\)$/;

/** A CSS colour as numbers, or a theme token it names with `var(--color-*)`. */
export function readCss(text: string): Rgba | { token: ColorToken } | undefined {
  const value = text.trim().toLowerCase();
  const token = TOKEN_VAR.exec(value)?.[1] as ColorToken | undefined;
  if (token) return { token };
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const named = NAMED_COLORS.get(value);
  if (named) return hexRgba(named);
  const parsed = parseCssColor(value);
  if (parsed) return parsed;
  const hsl = /^hsla?\(([^()]+)\)$/.exec(value)?.[1];
  if (hsl) {
    const parts = hsl.split(/[\s,/]+/).filter(Boolean);
    const h = parseFloat(parts[0] ?? '0');
    const s = parseFloat(parts[1] ?? '0') / 100;
    const l = parseFloat(parts[2] ?? '0') / 100;
    const a = parts[3] === undefined ? 1 : share(parts[3]);
    if ([h, s, l, a].every(Number.isFinite)) return { ...hslToRgb(h, s, l), a };
  }
  return undefined;
}

const share = (s: string) => (s.endsWith('%') ? parseFloat(s) / 100 : parseFloat(s));

export function hexRgba(hex: string, a = 1): Rgba {
  const h = hex.replace(/^#/, '');
  const wide = h.length === 3 ? Array.from(h, (c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(wide.padEnd(6, '0'), 16) || 0;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
}

const hex2 = (v: number) =>
  Math.round(Math.min(255, Math.max(0, v)))
    .toString(16)
    .padStart(2, '0');

/** `RRGGBB`, upper case, as DrawingML writes it. */
export function rgbHex(c: { r: number; g: number; b: number }): string {
  return `${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`.toUpperCase();
}

/** `#rrggbb`, as the model keeps an explicit colour. */
export function cssHex(c: { r: number; g: number; b: number }): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
}

/* ---------------------------------------------------------------- colour spaces */

export function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): {
  h: number;
  s: number;
  l: number;
} {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hue = (((h % 360) + 360) % 360) / 360;
  const sat = Math.min(1, Math.max(0, s));
  const lum = Math.min(1, Math.max(0, l));
  if (sat === 0) return { r: lum * 255, g: lum * 255, b: lum * 255 };
  const q = lum < 0.5 ? lum * (1 + sat) : lum + sat - lum * sat;
  const p = 2 * lum - q;
  const channel = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: channel(hue + 1 / 3) * 255, g: channel(hue) * 255, b: channel(hue - 1 / 3) * 255 };
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => {
  const v = Math.min(1, Math.max(0, c));
  return (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255;
};

/** A transform of DrawingML (`a:lumMod`, `a:tint`, ...) with its value in 1000ths of a percent. */
export interface ColorTransform {
  name: string;
  val: number;
}

/** Applies the transforms in order, as PowerPoint does. Unknown ones are skipped. */
export function transform(color: Rgba, transforms: readonly ColorTransform[]): Rgba {
  let c = { ...color };
  for (const { name, val } of transforms) {
    const f = val / 100000;
    switch (name) {
      case 'alpha':
        c.a = Math.min(1, Math.max(0, f));
        break;
      case 'alphaMod':
        c.a = Math.min(1, Math.max(0, c.a * f));
        break;
      case 'alphaOff':
        c.a = Math.min(1, Math.max(0, c.a + f));
        break;
      case 'lumMod':
      case 'lumOff':
      case 'satMod':
      case 'satOff':
      case 'hueMod':
      case 'hueOff':
      case 'lum':
      case 'sat':
      case 'hue': {
        const hsl = rgbToHsl(c);
        if (name === 'lumMod') hsl.l *= f;
        if (name === 'lumOff') hsl.l += f;
        if (name === 'lum') hsl.l = f;
        if (name === 'satMod') hsl.s *= f;
        if (name === 'satOff') hsl.s += f;
        if (name === 'sat') hsl.s = f;
        // Hue is in 60000ths of a degree, not a percentage.
        if (name === 'hueMod') hsl.h *= f;
        if (name === 'hueOff') hsl.h += val / 60000;
        if (name === 'hue') hsl.h = val / 60000;
        c = { ...hslToRgb(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l))), a: c.a };
        break;
      }
      case 'tint':
        c = {
          r: fromLinear(1 - (1 - toLinear(c.r)) * f),
          g: fromLinear(1 - (1 - toLinear(c.g)) * f),
          b: fromLinear(1 - (1 - toLinear(c.b)) * f),
          a: c.a,
        };
        break;
      case 'shade':
        c = {
          r: fromLinear(toLinear(c.r) * f),
          g: fromLinear(toLinear(c.g) * f),
          b: fromLinear(toLinear(c.b) * f),
          a: c.a,
        };
        break;
      case 'inv':
        c = { r: 255 - c.r, g: 255 - c.g, b: 255 - c.b, a: c.a };
        break;
      case 'gray': {
        const y = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
        c = { r: y, g: y, b: y, a: c.a };
        break;
      }
      case 'comp': {
        const hsl = rgbToHsl(c);
        c = { ...hslToRgb(hsl.h + 180, hsl.s, hsl.l), a: c.a };
        break;
      }
      default:
        break;
    }
  }
  return c;
}

/** DrawingML's preset colour names that are not CSS names as they are. */
const PRESET_ALIASES: Record<string, string> = {
  dkBlue: 'darkblue',
  dkCyan: 'darkcyan',
  dkGoldenrod: 'darkgoldenrod',
  dkGray: 'darkgray',
  dkGrey: 'darkgray',
  dkGreen: 'darkgreen',
  dkKhaki: 'darkkhaki',
  dkMagenta: 'darkmagenta',
  dkOliveGreen: 'darkolivegreen',
  dkOrange: 'darkorange',
  dkOrchid: 'darkorchid',
  dkRed: 'darkred',
  dkSalmon: 'darksalmon',
  dkSeaGreen: 'darkseagreen',
  dkSlateBlue: 'darkslateblue',
  dkSlateGray: 'darkslategray',
  dkSlateGrey: 'darkslategray',
  dkTurquoise: 'darkturquoise',
  dkViolet: 'darkviolet',
  ltBlue: 'lightblue',
  ltCoral: 'lightcoral',
  ltCyan: 'lightcyan',
  ltGoldenrodYellow: 'lightgoldenrodyellow',
  ltGray: 'lightgray',
  ltGrey: 'lightgray',
  ltGreen: 'lightgreen',
  ltPink: 'lightpink',
  ltSalmon: 'lightsalmon',
  ltSeaGreen: 'lightseagreen',
  ltSkyBlue: 'lightskyblue',
  ltSlateGray: 'lightslategray',
  ltSlateGrey: 'lightslategray',
  ltSteelBlue: 'lightsteelblue',
  ltYellow: 'lightyellow',
  medAquamarine: 'mediumaquamarine',
  medBlue: 'mediumblue',
  medOrchid: 'mediumorchid',
  medPurple: 'mediumpurple',
  medSeaGreen: 'mediumseagreen',
  medSlateBlue: 'mediumslateblue',
  medSpringGreen: 'mediumspringgreen',
  medTurquoise: 'mediumturquoise',
  medVioletRed: 'mediumvioletred',
};

/** The colour of a DrawingML preset colour name; black for a name nobody knows. */
export function presetColor(name: string): Rgba {
  const css = PRESET_ALIASES[name] ?? name.toLowerCase();
  return hexRgba(NAMED_COLORS.get(css) ?? '000000');
}

/* ---------------------------------------------------------------- the model's colours */

/** The colour of a token in a theme's palette. */
export function tokenRgba(colors: Record<ColorToken, string>, token: ColorToken): Rgba {
  const value = readCss(colors[token]);
  return value && !('token' in value) ? value : hexRgba('000000');
}

/**
 * A colour of the model as numbers, its token looked up in the theme. Undefined for a CSS value
 * that is not a colour this reads (`currentColor`, a `color-mix`).
 */
export function resolveColor(color: Color, colors: Record<ColorToken, string>): Rgba | undefined {
  const base = 'token' in color ? tokenRgba(colors, color.token) : readCss(color.value);
  if (!base) return undefined;
  const rgba = 'token' in base ? tokenRgba(colors, base.token) : base;
  return { ...rgba, a: rgba.a * (color.alpha ?? 1) };
}

/** A model colour from numbers: a hex value, and the alpha when it is not whole. */
export function modelColor(c: Rgba): Color {
  const a = Math.round(c.a * 1000) / 1000;
  return a >= 1 ? { value: cssHex(c) } : { value: cssHex(c), alpha: Math.max(0, a) };
}
