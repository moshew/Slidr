import type { Color, ColorToken, Fill, Shadow, Stroke } from '@slidr/model';
import {
  hexRgba,
  modelColor,
  presetColor,
  rgbHex,
  transform,
  type ColorTransform,
  type Rgba,
} from '../color';
import { attr, child, children, intAttr, path, type XmlElement } from '../xml';

/*
 * DrawingML read into the model: the theme, colours with their transforms, fills, outlines and
 * shadows.
 */

/** The theme of a master: its colours by slot, its fonts and its format scheme. */
export interface ThemeInfo {
  name: string;
  /** `dk1`, `lt1`, `dk2`, `lt2`, `accent1`..`accent6`, `hlink`, `folHlink`. */
  colors: Record<string, Rgba>;
  major: FontSet;
  minor: FontSet;
  fills: XmlElement[];
  lines: XmlElement[];
  effects: XmlElement[];
  bgFills: XmlElement[];
}

export interface FontSet {
  latin: string;
  ea: string;
  cs: string;
  /** Fonts by script: `Hebr`, `Arab`, `Jpan`, ... */
  scripts: Record<string, string>;
}

const SLOTS = [
  'dk1',
  'lt1',
  'dk2',
  'lt2',
  'accent1',
  'accent2',
  'accent3',
  'accent4',
  'accent5',
  'accent6',
  'hlink',
  'folHlink',
];

const OFFICE_COLORS: Record<string, string> = {
  dk1: '000000',
  lt1: 'FFFFFF',
  dk2: '44546A',
  lt2: 'E7E6E6',
  accent1: '4472C4',
  accent2: 'ED7D31',
  accent3: 'A5A5A5',
  accent4: 'FFC000',
  accent5: '5B9BD5',
  accent6: '70AD47',
  hlink: '0563C1',
  folHlink: '954F72',
};

function fontSet(el: XmlElement | undefined, fallback: string): FontSet {
  const scripts: Record<string, string> = {};
  for (const f of children(el, 'a:font')) {
    const script = attr(f, 'script');
    const typeface = attr(f, 'typeface');
    if (script && typeface) scripts[script] = typeface;
  }
  return {
    latin: attr(child(el, 'a:latin'), 'typeface') || fallback,
    ea: attr(child(el, 'a:ea'), 'typeface') ?? '',
    cs: attr(child(el, 'a:cs'), 'typeface') ?? '',
    scripts,
  };
}

export function readTheme(theme: XmlElement | undefined): ThemeInfo {
  const elements = child(theme, 'a:themeElements');
  const scheme = child(elements, 'a:clrScheme');
  const colors: Record<string, Rgba> = {};
  const base: ColorContext = { theme: undefined, map: {}, tokens: false };
  for (const slot of SLOTS) {
    const value = children(child(scheme, `a:${slot}`))[0];
    colors[slot] = value
      ? (readColorRgba(value, base) ?? hexRgba(OFFICE_COLORS[slot]!))
      : hexRgba(OFFICE_COLORS[slot]!);
  }
  const fonts = child(elements, 'a:fontScheme');
  const fmt = child(elements, 'a:fmtScheme');
  return {
    name: attr(theme, 'name') ?? 'Imported',
    colors,
    major: fontSet(child(fonts, 'a:majorFont'), 'Calibri Light'),
    minor: fontSet(child(fonts, 'a:minorFont'), 'Calibri'),
    fills: children(child(fmt, 'a:fillStyleLst')),
    lines: children(child(fmt, 'a:lnStyleLst')),
    effects: children(child(fmt, 'a:effectStyleLst')),
    bgFills: children(child(fmt, 'a:bgFillStyleLst')),
  };
}

/** What a colour is read against: the theme, the colour map in force, a style's colour. */
export interface ColorContext {
  theme: ThemeInfo | undefined;
  /** `bg1` -> `lt1`, ... as the master maps them, or a layout or slide overrides it. */
  map: Record<string, string>;
  /** The colour a style reference gives `phClr`. */
  ph?: { color: Color; rgba: Rgba };
  /** Whether colours of the scheme may become the deck's theme tokens: the map is the master's. */
  tokens: boolean;
}

/** The token each name of the scheme becomes, under the master's colour map. */
const SCHEME_TOKEN: Record<string, ColorToken> = {
  bg1: 'bg',
  tx1: 'text',
  bg2: 'surface',
  tx2: 'muted',
  accent1: 'primary',
  accent2: 'secondary',
  accent3: 'accent',
};

const COLOR_ELEMENTS = new Set([
  'a:srgbClr',
  'a:schemeClr',
  'a:prstClr',
  'a:sysClr',
  'a:scrgbClr',
  'a:hslClr',
]);

function transformsOf(el: XmlElement): ColorTransform[] {
  return children(el).map((t) => ({
    name: t.name.replace(/^a:/, ''),
    val: Number(
      attr(t, 'val') ??
        (t.name === 'a:inv' || t.name === 'a:gray' || t.name === 'a:comp' ? 0 : 100000),
    ),
  }));
}

function slotOf(name: string, ctx: ColorContext): string {
  return (
    ctx.map[name] ??
    ({ bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' } as Record<string, string>)[name] ??
    name
  );
}

function baseRgba(el: XmlElement, ctx: ColorContext): Rgba | undefined {
  switch (el.name) {
    case 'a:srgbClr':
      return hexRgba(attr(el, 'val') ?? '000000');
    case 'a:sysClr':
      return hexRgba(attr(el, 'lastClr') ?? (attr(el, 'val') === 'window' ? 'FFFFFF' : '000000'));
    case 'a:prstClr':
      return presetColor(attr(el, 'val') ?? 'black');
    case 'a:scrgbClr': {
      const c = (name: string) => {
        const v = (intAttr(el, name) ?? 0) / 100000;
        return (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255;
      };
      return { r: c('r'), g: c('g'), b: c('b'), a: 1 };
    }
    case 'a:hslClr': {
      const h = (intAttr(el, 'hue') ?? 0) / 60000;
      const s = (intAttr(el, 'sat') ?? 0) / 100000;
      const l = (intAttr(el, 'lum') ?? 0) / 100000;
      return transform({ r: 0, g: 0, b: 0, a: 1 }, [
        { name: 'hue', val: h * 60000 },
        { name: 'sat', val: s * 100000 },
        { name: 'lum', val: l * 100000 },
      ]);
    }
    case 'a:schemeClr': {
      const val = attr(el, 'val') ?? 'tx1';
      if (val === 'phClr') return ctx.ph?.rgba ?? hexRgba('000000');
      return (
        ctx.theme?.colors[slotOf(val, ctx)] ?? hexRgba(OFFICE_COLORS[slotOf(val, ctx)] ?? '000000')
      );
    }
  }
  return undefined;
}

/** A colour element as numbers. */
export function readColorRgba(el: XmlElement, ctx: ColorContext): Rgba | undefined {
  const base = baseRgba(el, ctx);
  return base ? transform(base, transformsOf(el)) : undefined;
}

/** The colour element inside a fill or a style reference (`a:solidFill` > `a:srgbClr`). */
export function colorElementOf(el: XmlElement | undefined): XmlElement | undefined {
  return children(el).find((c) => COLOR_ELEMENTS.has(c.name));
}

/**
 * A colour as the model keeps it: a token of the deck's theme where it is one of the scheme with
 * nothing done to it but its alpha, else its value.
 */
export function readColor(
  el: XmlElement | undefined,
  ctx: ColorContext,
): { color: Color; rgba: Rgba } | undefined {
  if (!el) return undefined;
  const target = COLOR_ELEMENTS.has(el.name) ? el : colorElementOf(el);
  if (!target) return undefined;
  const rgba = readColorRgba(target, ctx);
  if (!rgba) return undefined;
  const transforms = transformsOf(target);
  const onlyAlpha = transforms.every((t) => t.name === 'alpha');
  if (target.name === 'a:schemeClr' && onlyAlpha) {
    const val = attr(target, 'val') ?? '';
    if (val === 'phClr' && ctx.ph) {
      const ph = ctx.ph.color;
      return { color: rgba.a < 1 ? { ...ph, alpha: rgba.a } : ph, rgba };
    }
    const token = ctx.tokens ? tokenOf(val, ctx) : undefined;
    if (token) {
      return {
        color: rgba.a < 1 ? { token, alpha: Math.round(rgba.a * 1000) / 1000 } : { token },
        rgba,
      };
    }
  }
  return { color: modelColor(rgba), rgba };
}

/** The token of a name of the scheme or of a slot, under the master's map. */
function tokenOf(val: string, ctx: ColorContext): ColorToken | undefined {
  const direct = SCHEME_TOKEN[val];
  if (direct) return direct;
  // A slot named itself: the token whose scheme name the master maps to it.
  for (const [name, token] of Object.entries(SCHEME_TOKEN)) {
    if (slotOf(name, ctx) === val) return token;
  }
  return undefined;
}

/* ---------------------------------------------------------------- fills */

/** The fill elements DrawingML has. */
export const FILL_ELEMENTS = new Set([
  'a:noFill',
  'a:solidFill',
  'a:gradFill',
  'a:blipFill',
  'a:pattFill',
  'a:grpFill',
]);

export function fillElementOf(el: XmlElement | undefined): XmlElement | undefined {
  return children(el).find((c) => FILL_ELEMENTS.has(c.name));
}

/** A picture fill: the part it shows, read by whoever stores pictures. */
export interface BlipRef {
  rId: string;
  /** The SVG of the picture, when it has one as well. */
  svgId?: string;
  fit: 'cover' | 'contain' | 'fill' | 'tile';
  opacity?: number;
  /** The part of the picture shown, normalised. */
  crop?: { x: number; y: number; w: number; h: number };
}

export function blipOf(fill: XmlElement): BlipRef | undefined {
  const blip = child(fill, 'a:blip');
  const rId = attr(blip, 'r:embed') ?? attr(blip, 'r:link');
  if (!rId) return undefined;
  const svg = path(blip, 'a:extLst');
  let svgId: string | undefined;
  for (const ext of children(svg, 'a:ext')) {
    const s = child(ext, 'asvg:svgBlip');
    if (s) svgId = attr(s, 'r:embed');
  }
  const alpha = intAttr(child(blip, 'a:alphaModFix'), 'amt');
  const src = child(fill, 'a:srcRect');
  const pct = (name: string) => (intAttr(src, name) ?? 0) / 100000;
  const l = pct('l');
  const t = pct('t');
  const r = pct('r');
  const b = pct('b');
  // The part of the box the picture fills, where it does not fill all of it.
  const fillRect = path(fill, 'a:stretch', 'a:fillRect');
  const fl = (intAttr(fillRect, 'l') ?? 0) / 100000;
  const ft = (intAttr(fillRect, 't') ?? 0) / 100000;
  const fr = (intAttr(fillRect, 'r') ?? 0) / 100000;
  const fb = (intAttr(fillRect, 'b') ?? 0) / 100000;
  let crop: BlipRef['crop'] = { x: l, y: t, w: 1 - l - r, h: 1 - t - b };
  if (fl || ft || fr || fb) {
    // The picture's region maps to the inner rectangle of the box: the box maps to more of it.
    const sx = crop.w / Math.max(1e-6, 1 - fl - fr);
    const sy = crop.h / Math.max(1e-6, 1 - ft - fb);
    crop = { x: crop.x - fl * sx, y: crop.y - ft * sy, w: sx, h: sy };
  }
  const whole =
    Math.abs(crop.x) < 1e-6 &&
    Math.abs(crop.y) < 1e-6 &&
    Math.abs(crop.w - 1) < 1e-6 &&
    Math.abs(crop.h - 1) < 1e-6;
  return {
    rId,
    ...(svgId ? { svgId } : {}),
    fit: child(fill, 'a:tile') ? 'tile' : 'fill',
    ...(alpha !== undefined && alpha < 100000 ? { opacity: alpha / 100000 } : {}),
    ...(whole || crop.w <= 0 || crop.h <= 0 ? {} : { crop }),
  };
}

/** A fill as the model has one. A picture fill needs its picture stored: `picture` does it. */
export function readFill(
  fill: XmlElement | undefined,
  ctx: ColorContext,
  picture: (blip: BlipRef) => string | undefined,
  group?: Fill,
): Fill | undefined {
  if (!fill) return undefined;
  switch (fill.name) {
    case 'a:noFill':
      return { kind: 'none' };
    case 'a:solidFill': {
      const c = readColor(fill, ctx);
      return c ? { kind: 'solid', color: c.color } : { kind: 'none' };
    }
    case 'a:grpFill':
      return group ?? { kind: 'none' };
    case 'a:pattFill': {
      // A pattern has no kind in the model: its foreground colour stands in for it.
      const fg = readColor(child(fill, 'a:fgClr'), ctx);
      const bg = readColor(child(fill, 'a:bgClr'), ctx);
      if (!fg && !bg) return { kind: 'none' };
      if (!fg || !bg) return { kind: 'solid', color: (fg ?? bg)!.color };
      // Stripes are a gradient that repeats, as CSS draws them; any other pattern is its colours
      // mixed.
      const prst = attr(fill, 'prst') ?? '';
      const stripe = /^(lt|dk|wd|nar|dash)?(Horz|Vert|UpDiag|DnDiag)$/i.exec(
        prst
          .replace(/^horz$/, 'Horz')
          .replace(/^vert$/, 'Vert')
          .replace(/^upDiag$/, 'UpDiag')
          .replace(/^dnDiag$/, 'DnDiag'),
      );
      if (stripe) {
        const kind = stripe[2]!.toLowerCase();
        const deg = kind === 'horz' ? 0 : kind === 'vert' ? 90 : kind === 'dndiag' ? 45 : 135;
        const weight = (stripe[1] ?? '').toLowerCase();
        const [a, b] =
          weight === 'wd'
            ? [12, 24]
            : weight === 'dk'
              ? [6, 12]
              : weight === 'lt' || weight === 'nar'
                ? [2, 8]
                : [4, 8];
        const css = (c: { rgba: Rgba }) =>
          c.rgba.a >= 1
            ? `#${rgbHex(c.rgba).toLowerCase()}`
            : `rgba(${Math.round(c.rgba.r)}, ${Math.round(c.rgba.g)}, ${Math.round(c.rgba.b)}, ${Math.round(c.rgba.a * 1000) / 1000})`;
        return {
          kind: 'css',
          value: `repeating-linear-gradient(${deg}deg, ${css(fg)} 0 ${a}px, ${css(bg)} ${a}px ${b}px)`,
        };
      }
      const mix = {
        r: (fg.rgba.r + bg.rgba.r) / 2,
        g: (fg.rgba.g + bg.rgba.g) / 2,
        b: (fg.rgba.b + bg.rgba.b) / 2,
        a: (fg.rgba.a + bg.rgba.a) / 2,
      };
      return { kind: 'solid', color: modelColor(mix) };
    }
    case 'a:gradFill': {
      const stops = children(child(fill, 'a:gsLst'), 'a:gs')
        .map((gs) => {
          const c = readColor(gs, ctx);
          return c
            ? { color: c.color, at: Math.min(1, Math.max(0, (intAttr(gs, 'pos') ?? 0) / 100000)) }
            : undefined;
        })
        .filter((s): s is { color: Color; at: number } => s !== undefined)
        .sort((a, b) => a.at - b.at);
      if (stops.length === 0) return { kind: 'none' };
      if (stops.length === 1) return { kind: 'solid', color: stops[0]!.color };
      const shade = child(fill, 'a:path');
      if (shade) {
        const rect = child(shade, 'a:fillToRect');
        const l = (intAttr(rect, 'l') ?? 50000) / 100000;
        const t = (intAttr(rect, 't') ?? 50000) / 100000;
        const r = (intAttr(rect, 'r') ?? 50000) / 100000;
        const b = (intAttr(rect, 'b') ?? 50000) / 100000;
        return {
          kind: 'radial',
          stops: stops,
          center: {
            x: Math.round(((l + 1 - r) / 2) * 1000) / 1000,
            y: Math.round(((t + 1 - b) / 2) * 1000) / 1000,
          },
        };
      }
      const ang = (intAttr(child(fill, 'a:lin'), 'ang') ?? 0) / 60000;
      return {
        kind: 'linear',
        angle: Math.round(((ang + 90) % 360) * 100) / 100,
        stops: stops,
      };
    }
    case 'a:blipFill': {
      const blip = blipOf(fill);
      const assetId = blip ? picture(blip) : undefined;
      if (!blip || !assetId) return { kind: 'none' };
      return {
        kind: 'image',
        assetId,
        fit: blip.fit === 'tile' ? 'tile' : blip.crop ? 'cover' : 'fill',
        ...(blip.opacity !== undefined ? { opacity: blip.opacity } : {}),
      };
    }
  }
  return undefined;
}

/* ---------------------------------------------------------------- outlines and shadows */

export type LineHead = 'none' | 'arrow' | 'triangle' | 'circle' | 'diamond' | 'bar';

const HEADS: Record<string, LineHead> = {
  triangle: 'triangle',
  stealth: 'triangle',
  arrow: 'arrow',
  oval: 'circle',
  diamond: 'diamond',
};

export interface Outline {
  stroke?: Stroke;
  start: LineHead;
  end: LineHead;
}

/**
 * An outline from its `a:ln` and the line style a shape's style refers to, the first winning
 * where both say something. `pxPerEmu` is the scale of the slide.
 */
export function readOutline(
  lines: readonly (XmlElement | undefined)[],
  ctx: ColorContext,
  pxPerEmu: number,
): Outline {
  const present = lines.filter((l): l is XmlElement => l !== undefined);
  const first = <T>(read: (ln: XmlElement) => T | undefined): T | undefined => {
    for (const ln of present) {
      const value = read(ln);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  const fill = first((ln) => fillElementOf(ln));
  const head = (name: string) =>
    HEADS[first((ln) => attr(child(ln, name), 'type')) ?? 'none'] ?? 'none';
  const out: Outline = { start: head('a:headEnd'), end: head('a:tailEnd') };
  if (!fill || fill.name === 'a:noFill') return out;
  let color: Color | undefined;
  if (fill.name === 'a:solidFill') color = readColor(fill, ctx)?.color;
  else if (fill.name === 'a:gradFill')
    color = readColor(child(child(fill, 'a:gsLst'), 'a:gs'), ctx)?.color;
  else if (fill.name === 'a:pattFill') color = readColor(child(fill, 'a:fgClr'), ctx)?.color;
  if (!color) return out;
  const w = first((ln) => intAttr(ln, 'w')) ?? 9525;
  const dash = first((ln) => attr(child(ln, 'a:prstDash'), 'val'));
  const cap = first((ln) => attr(ln, 'cap'));
  const join = first((ln) =>
    child(ln, 'a:round')
      ? 'round'
      : child(ln, 'a:bevel')
        ? 'bevel'
        : child(ln, 'a:miter')
          ? 'miter'
          : undefined,
  );
  const width = Math.max(0.5, Math.round(w * pxPerEmu * 100) / 100);
  out.stroke = {
    color,
    width,
    ...(dash && dash !== 'solid'
      ? {
          dash:
            /dot/i.test(dash) && !/dash/i.test(dash) ? ('dotted' as const) : ('dashed' as const),
        }
      : {}),
    ...(cap === 'rnd' ? { cap: 'round' as const } : cap === 'sq' ? { cap: 'square' as const } : {}),
    ...(join ? { join } : {}),
  };
  return out;
}

/** The first outer shadow of an effect list, as the model's shadow. */
export function readShadow(
  effects: XmlElement | undefined,
  ctx: ColorContext,
  pxPerEmu: number,
): Shadow | undefined {
  const shadow = child(effects, 'a:outerShdw');
  if (!shadow) return undefined;
  const c = readColor(shadow, ctx);
  if (!c) return undefined;
  const dist = (intAttr(shadow, 'dist') ?? 0) * pxPerEmu;
  const dir = ((intAttr(shadow, 'dir') ?? 0) / 60000) * (Math.PI / 180);
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    x: round(dist * Math.cos(dir)),
    y: round(dist * Math.sin(dir)),
    blur: round((intAttr(shadow, 'blurRad') ?? 0) * pxPerEmu),
    color: c.color,
  };
}
