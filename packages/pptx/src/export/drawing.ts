import type { Color, Fill, Frame, Shadow, Stroke } from '@slidr/model';
import { readCss, rgbHex, TOKEN_SCHEME, type Rgba } from '../color';
import type { PartRels } from '../opc';
import { mapSegments, parseSvgPath, type Segment } from '../path';
import { angle, emu, normalizeDegrees, percent } from '../units';
import { el } from '../xml';
import type { ExportContext } from './context';

/*
 * DrawingML for the parts every object is drawn with: colours, fills, outlines, effects, the
 * box and the outline of a shape.
 */

/** A colour of the model as DrawingML, its alpha multiplied by `alpha` (the element's opacity). */
export function colorXml(color: Color, alpha = 1): string {
  let a = (color.alpha ?? 1) * alpha;
  const value = 'token' in color ? color : readCss(color.value);
  if (value && 'token' in value) {
    return el('a:schemeClr', { val: TOKEN_SCHEME[value.token] }, a < 1 ? alphaXml(a) : undefined);
  }
  const rgba: Rgba = value ?? { r: 0, g: 0, b: 0, a: 1 };
  a *= rgba.a;
  return el('a:srgbClr', { val: rgbHex(rgba) }, a < 1 ? alphaXml(a) : undefined);
}

const alphaXml = (a: number) => el('a:alpha', { val: percent(Math.max(0, Math.min(1, a))) });

export const solidFillXml = (color: Color, alpha = 1): string =>
  el('a:solidFill', {}, colorXml(color, alpha));

type Stops = Extract<Fill, { kind: 'linear' }>['stops'];

function stopsXml(stops: Stops, alpha: number): string {
  return el(
    'a:gsLst',
    {},
    ...stops.map((stop) => el('a:gs', { pos: percent(stop.at) }, colorXml(stop.color, alpha))),
  );
}

/** A linear gradient: CSS measures its angle from the top, DrawingML from the right. */
function linearXml(cssAngle: number, stops: Stops, alpha: number): string {
  return el(
    'a:gradFill',
    { rotWithShape: 1 },
    stopsXml(stops, alpha),
    el('a:lin', { ang: angle(normalizeDegrees(cssAngle - 90)), scaled: 0 }),
  );
}

function radialXml(stops: Stops, center: { x: number; y: number } | undefined, alpha: number) {
  const cx = center?.x ?? 0.5;
  const cy = center?.y ?? 0.5;
  return el(
    'a:gradFill',
    { rotWithShape: 1 },
    stopsXml(stops, alpha),
    el(
      'a:path',
      { path: 'circle' },
      el('a:fillToRect', {
        l: percent(cx),
        t: percent(cy),
        r: percent(1 - cx),
        b: percent(1 - cy),
      }),
    ),
  );
}

/** The stops of a CSS gradient, read from its arguments: `#fff 0%, rgba(0,0,0,.5) 100%`. */
function cssStops(parts: readonly string[]): Stops | undefined {
  const stops: { color: Color; at?: number }[] = [];
  for (const part of parts) {
    // A colour and up to two positions: `#fff`, `red 40%`, `#2f5bea 0 12px`.
    const match = /^(.*?)((?:\s+-?[\d.]+(?:%|px)?){0,2})$/.exec(part.trim());
    const color = match?.[1]?.trim();
    if (!color || !readCss(color)) continue;
    const first = /(-?[\d.]+)%/.exec(match?.[2] ?? '')?.[1];
    const at = first === undefined ? undefined : Number(first) / 100;
    stops.push({ color: { value: color }, ...(at === undefined ? {} : { at }) });
  }
  if (stops.length < 2) return undefined;
  return stops.map((stop, i) => ({
    color: stop.color,
    at: Math.min(1, Math.max(0, stop.at ?? i / (stops.length - 1))),
  }));
}

/** Splits CSS arguments at the commas outside parentheses. */
function splitArgs(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

const SIDES: Record<string, number> = {
  'to top': 0,
  'to right': 90,
  'to bottom': 180,
  'to left': 270,
  'to top right': 45,
  'to right top': 45,
  'to bottom right': 135,
  'to right bottom': 135,
  'to bottom left': 225,
  'to left bottom': 225,
  'to top left': 315,
  'to left top': 315,
};

/** A fill the model keeps as CSS, as near as DrawingML says it. */
function cssFillXml(value: string, ctx: ExportContext, alpha: number): string {
  const solid = readCss(value);
  if (solid) {
    return solidFillXml('token' in solid ? solid : { value }, alpha);
  }
  const gradient = /^\s*(repeating-)?(linear|radial)-gradient\((.*)\)\s*$/is.exec(value);
  if (gradient) {
    const args = splitArgs(gradient[3] ?? '');
    const first = args[0]?.trim().toLowerCase() ?? '';
    if (gradient[2] === 'linear') {
      let cssAngle = 180;
      let rest = args;
      const deg = /^(-?[\d.]+)deg$/.exec(first);
      if (deg) {
        cssAngle = Number(deg[1]);
        rest = args.slice(1);
      } else if (SIDES[first] !== undefined) {
        cssAngle = SIDES[first]!;
        rest = args.slice(1);
      }
      const stops = cssStops(rest);
      if (stops && gradient[1]) {
        // Stripes: PowerPoint's own pattern of them, in the two colours, as near as it has.
        ctx.warn('fill-approximated');
        const a = normalizeDegrees(cssAngle) % 180;
        const prst =
          a < 22.5 || a >= 157.5
            ? 'wdHorz'
            : a < 67.5
              ? 'wdDnDiag'
              : a < 112.5
                ? 'wdVert'
                : 'wdUpDiag';
        const last = stops.at(-1)!;
        const other =
          stops.find((s) => JSON.stringify(s.color) !== JSON.stringify(stops[0]!.color)) ?? last;
        return el(
          'a:pattFill',
          { prst: prst === 'wdHorz' ? 'horz' : prst === 'wdVert' ? 'vert' : prst },
          el('a:fgClr', {}, colorXml(stops[0]!.color, alpha)),
          el('a:bgClr', {}, colorXml(other.color, alpha)),
        );
      }
      if (stops) return linearXml(cssAngle, stops, alpha);
    } else {
      const shaped = /circle|ellipse|at\s/.test(first);
      const stops = cssStops(shaped ? args.slice(1) : args);
      if (stops) return radialXml(stops, undefined, alpha);
    }
  }
  // The first colour of whatever it is stands in for it.
  ctx.warn('fill-approximated');
  const color = /#[0-9a-f]{3,8}\b|rgba?\([^()]*\)|hsla?\([^()]*\)/i.exec(value)?.[0];
  return color ? solidFillXml({ value: color }, alpha) : el('a:noFill');
}

/**
 * A fill as DrawingML. An image fill needs the relationships of the part it is written in, and
 * the size of the box, to crop the picture as the model fits it.
 */
export async function fillXml(
  fill: Fill,
  ctx: ExportContext,
  rels: PartRels,
  box: { w: number; h: number },
  alpha = 1,
): Promise<string> {
  switch (fill.kind) {
    case 'none':
      return el('a:noFill');
    case 'solid':
      return solidFillXml(fill.color, alpha);
    case 'linear':
      return linearXml(fill.angle, fill.stops, alpha);
    case 'radial':
      return radialXml(fill.stops, fill.center, alpha);
    case 'conic':
      // DrawingML has no sweep: a linear gradient through the same colours stands in for it.
      ctx.warn('fill-approximated');
      return linearXml(fill.angle + 90, fill.stops, alpha);
    case 'css':
      return cssFillXml(fill.value, ctx, alpha);
    case 'image': {
      const asset = ctx.deck.assets[fill.assetId];
      const part = asset ? await ctx.assetPart(asset) : undefined;
      if (!asset || !part) return el('a:noFill');
      const opacity = (fill.opacity ?? 1) * alpha;
      const blip = el(
        'a:blip',
        { 'r:embed': ctx.imageRel(rels, part) },
        opacity < 1 ? el('a:alphaModFix', { amt: percent(opacity) }) : undefined,
      );
      if (fill.fit === 'tile') {
        return el(
          'a:blipFill',
          { dpi: 0, rotWithShape: 1 },
          blip,
          el('a:srcRect'),
          el('a:tile', { tx: 0, ty: 0, sx: 50000, sy: 50000, flip: 'none', algn: 'tl' }),
        );
      }
      const rect =
        asset.width && asset.height
          ? fitRects({ w: asset.width, h: asset.height }, box, fill.fit)
          : { src: '', fill: '' };
      return el(
        'a:blipFill',
        { dpi: 0, rotWithShape: 1 },
        blip,
        rect.src || el('a:srcRect'),
        el('a:stretch', {}, rect.fill || el('a:fillRect')),
      );
    }
  }
}

/**
 * How a picture of `natural` size lies in a box by `fit`, as DrawingML says it: the part of the
 * picture that shows (`srcRect`, for a picture larger than the box) and the part of the box it
 * fills (`fillRect`, for one smaller). The picture's own crop, normalised, comes first.
 */
export function fitRects(
  natural: { w: number; h: number },
  box: { w: number; h: number },
  fit: 'cover' | 'contain' | 'fill',
  crop: { x: number; y: number; w: number; h: number } = { x: 0, y: 0, w: 1, h: 1 },
): { src: string; fill: string } {
  // The region of the picture that is to fill the box, in fractions of the picture.
  let region = { ...crop };
  let inset = { l: 0, t: 0, r: 0, b: 0 };
  if (fit !== 'fill' && box.w > 0 && box.h > 0) {
    const cw = crop.w * natural.w;
    const ch = crop.h * natural.h;
    const regionAspect = cw / ch;
    const boxAspect = box.w / box.h;
    if (fit === 'cover') {
      if (regionAspect > boxAspect) {
        const keep = boxAspect / regionAspect;
        region = { ...region, x: crop.x + (crop.w * (1 - keep)) / 2, w: crop.w * keep };
      } else if (regionAspect < boxAspect) {
        const keep = regionAspect / boxAspect;
        region = { ...region, y: crop.y + (crop.h * (1 - keep)) / 2, h: crop.h * keep };
      }
    } else if (regionAspect > boxAspect) {
      const used = boxAspect / regionAspect;
      inset = { l: 0, r: 0, t: (1 - used) / 2, b: (1 - used) / 2 };
    } else if (regionAspect < boxAspect) {
      const used = regionAspect / boxAspect;
      inset = { t: 0, b: 0, l: (1 - used) / 2, r: (1 - used) / 2 };
    }
  }
  const src = {
    l: region.x,
    t: region.y,
    r: 1 - region.x - region.w,
    b: 1 - region.y - region.h,
  };
  const some = (r: Record<string, number>) => Object.values(r).some((v) => Math.abs(v) > 1e-6);
  const attrs = (r: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(r)
        .filter(([, v]) => Math.abs(v) > 1e-6)
        .map(([k, v]) => [k, percent(v)]),
    );
  return {
    src: some(src) ? el('a:srcRect', attrs(src)) : '',
    fill: some(inset) ? el('a:fillRect', attrs(inset)) : '',
  };
}

const DASH = { dashed: 'dash', dotted: 'sysDot', solid: 'solid' } as const;
const CAP = { butt: 'flat', round: 'rnd', square: 'sq' } as const;

export type LineHead = 'none' | 'arrow' | 'triangle' | 'circle' | 'diamond' | 'bar';

const HEAD: Record<LineHead, string | undefined> = {
  none: undefined,
  arrow: 'arrow',
  triangle: 'triangle',
  circle: 'oval',
  diamond: 'diamond',
  bar: undefined,
};

/** An outline as `a:ln`; with no stroke, no line. */
export function strokeXml(
  stroke: Stroke | undefined,
  alpha = 1,
  heads?: { start: LineHead; end: LineHead },
): string {
  if (!stroke || stroke.width <= 0) return el('a:ln', {}, el('a:noFill'));
  const join = stroke.join ?? 'miter';
  return el(
    'a:ln',
    { w: emu(stroke.width), cap: CAP[stroke.cap ?? 'butt'] },
    solidFillXml(stroke.color, alpha),
    el('a:prstDash', { val: DASH[stroke.dash ?? 'solid'] }),
    join === 'round'
      ? el('a:round')
      : join === 'bevel'
        ? el('a:bevel')
        : el('a:miter', { lim: 800000 }),
    heads && HEAD[heads.start]
      ? el('a:headEnd', { type: HEAD[heads.start], w: 'med', len: 'med' })
      : undefined,
    heads && HEAD[heads.end]
      ? el('a:tailEnd', { type: HEAD[heads.end], w: 'med', len: 'med' })
      : undefined,
  );
}

/** A shadow as `a:outerShdw`. */
export function shadowXml(shadow: Shadow, alpha = 1): string {
  const dist = Math.hypot(shadow.x, shadow.y);
  const dir = normalizeDegrees((Math.atan2(shadow.y, shadow.x) * 180) / Math.PI);
  return el(
    'a:outerShdw',
    {
      blurRad: emu(shadow.blur),
      dist: emu(dist),
      dir: angle(dir),
      algn: 'ctr',
      rotWithShape: 0,
    },
    colorXml(shadow.color, alpha),
  );
}

/** The effects of an element: its shadow; DrawingML has no blur of a whole shape. */
export function effectsXml(
  effects: { shadow?: Shadow; blur?: number } | undefined,
  ctx: ExportContext,
  alpha = 1,
): string {
  if (effects?.blur) ctx.warn('blur');
  return effects?.shadow ? el('a:effectLst', {}, shadowXml(effects.shadow, alpha)) : '';
}

/** The box of a shape: where it is, its size, its rotation and mirroring. */
export function xfrmXml(
  frame: Frame,
  options: {
    rotation?: number;
    flipH?: boolean;
    flipV?: boolean;
    tag?: string;
    child?: Frame;
  } = {},
): string {
  const rot = options.rotation ? angle(normalizeDegrees(options.rotation)) : undefined;
  const off = el('a:off', { x: emu(frame.x), y: emu(frame.y) });
  const ext = el('a:ext', { cx: Math.max(0, emu(frame.w)), cy: Math.max(0, emu(frame.h)) });
  const child = options.child
    ? el('a:chOff', { x: emu(options.child.x), y: emu(options.child.y) }) +
      el('a:chExt', {
        cx: Math.max(0, emu(options.child.w)),
        cy: Math.max(0, emu(options.child.h)),
      })
    : '';
  return el(
    options.tag ?? 'a:xfrm',
    {
      rot: rot || undefined,
      flipH: options.flipH ? 1 : undefined,
      flipV: options.flipV ? 1 : undefined,
    },
    off,
    ext,
    child,
  );
}

export const presetGeometryXml = (preset: string, adjust?: Record<string, number>): string =>
  el(
    'a:prstGeom',
    { prst: preset },
    el(
      'a:avLst',
      {},
      ...Object.entries(adjust ?? {}).map(([name, value]) =>
        el('a:gd', { name, fmla: `val ${Math.round(value)}` }),
      ),
    ),
  );

/**
 * An outline of SVG path data in a box of `w` by `h` (slide pixels) as custom geometry, its
 * points in EMU of the box. `closed` false draws only the line: an open outline has no fill.
 */
export function customGeometryXml(
  d: string | readonly Segment[],
  w: number,
  h: number,
  closed = true,
): string {
  const segments = typeof d === 'string' ? parseSvgPath(d) : d;
  const points = mapSegments(segments, ([x, y]) => [emu(x), emu(y)]);
  const pt = ([x, y]: [number, number]) => el('a:pt', { x: Math.round(x), y: Math.round(y) });
  const commands = points.map((s) => {
    switch (s.type) {
      case 'M':
        return el('a:moveTo', {}, pt(s.pts[0]));
      case 'L':
        return el('a:lnTo', {}, pt(s.pts[0]));
      case 'Q':
        return el('a:quadBezTo', {}, ...s.pts.map(pt));
      case 'C':
        return el('a:cubicBezTo', {}, ...s.pts.map(pt));
      case 'Z':
        return el('a:close');
    }
  });
  return el(
    'a:custGeom',
    {},
    el('a:avLst'),
    el('a:gdLst'),
    el('a:ahLst'),
    el('a:cxnLst'),
    el('a:rect', { l: 'l', t: 't', r: 'r', b: 'b' }),
    el(
      'a:pathLst',
      {},
      el(
        'a:path',
        { w: Math.max(1, emu(w)), h: Math.max(1, emu(h)), fill: closed ? undefined : 'none' },
        ...commands,
      ),
    ),
  );
}
