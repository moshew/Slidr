import {
  createElement,
  newId,
  type Element,
  type Fill,
  type Frame,
  type GroupElement,
  type PlaceholderRole,
  type Shadow,
  type Stroke,
} from '@slidr/model';
import { colorCss } from '@slidr/renderer';
import { parseSvgPath } from '../path';
import {
  attr,
  boolAttr,
  child,
  children,
  descendants,
  intAttr,
  path,
  type XmlElement,
} from '../xml';
import { readChart } from './chart';
import {
  blipOf,
  fillElementOf,
  readColor,
  readFill,
  readOutline,
  readShadow,
  type ColorContext,
  type LineHead,
} from './drawing';
import { customGeometry, LINE_PRESETS, presetGeometry, type Geometry } from './geometry';
import type { Relationship } from './package';
import type { SlideImporter } from './slides';
import { readTable } from './table';
import {
  hasText,
  readBody,
  readParagraphs,
  type LevelProps,
  type ListStyle,
  type ReadText,
  type TextContext,
} from './text';

/*
 * The shapes of a tree (`p:spTree`) as elements of the model. A text box is a text element, a
 * shape a shape element (with its text, or under a text element of its own where the text does
 * not sit in its middle), a picture an image, a video or a sound, a connector a line, a group a
 * group. A table, a chart and the drawing of a SmartArt graphic come from their own parts.
 */

/** Where the shapes of a tree are put on the slide: EMU of the tree to slide pixels. */
export interface Space {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
}

/** What a part's shapes are read with: its relationships, colours and inherited styles. */
export interface PartContext {
  importer: SlideImporter;
  /** The part the shapes are in. */
  path: string;
  rels: Map<string, Relationship>;
  colors: ColorContext;
  /** The pictures of the part, stored, by relationship id. */
  pictures: Map<string, string>;
  /** The placeholders of the layout and of the master a placeholder of this part inherits. */
  inherit: (ph: XmlElement) => Inherited;
  /** The text styles under a shape that is no placeholder. */
  otherStyles: ListStyle[];
  /** Whether the shapes are a layout's or a master's: their placeholders are not drawn. */
  template: boolean;
  /** The slide, from 1, for warnings. */
  slide?: number;
  /** The element each shape of the slide's tree became, by shape id: what animations name. */
  shapeIds?: Map<string, string>;
}

/** What a placeholder inherits, lowest first: its geometry and look, its text box and styles. */
export interface Inherited {
  spPr: XmlElement[];
  bodies: XmlElement[];
  lists: ListStyle[];
  styles: XmlElement[];
}

const ROLES: Record<string, PlaceholderRole> = {
  title: 'title',
  ctrTitle: 'title',
  subTitle: 'subtitle',
  body: 'body',
  obj: 'body',
  pic: 'image',
  chart: 'chart',
  tbl: 'table',
  ftr: 'footer',
  sldNum: 'slideNumber',
};

/** The type of a placeholder; one that says none is a content placeholder. */
export const phType = (ph: XmlElement | undefined): string => attr(ph, 'type') ?? 'obj';

/** The placeholder a shape is, if any. */
export function placeholderOf(shape: XmlElement): XmlElement | undefined {
  for (const nv of ['p:nvSpPr', 'p:nvPicPr', 'p:nvGraphicFramePr', 'p:nvCxnSpPr']) {
    const ph = path(shape, nv, 'p:nvPr', 'p:ph');
    if (ph) return ph;
  }
  return undefined;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** The first child of a name among a placeholder's inherited `spPr` and the shape's own. */
function inheritedChild(
  own: XmlElement | undefined,
  chain: readonly XmlElement[],
  ...names: string[]
): XmlElement | undefined {
  const found = child(own, ...names);
  if (found) return found;
  for (let i = chain.length - 1; i >= 0; i--) {
    const c = child(chain[i], ...names);
    if (c) return c;
  }
  return undefined;
}

/** A box of DrawingML in the space of its tree, in slide pixels. */
function frameOf(
  xfrm: XmlElement | undefined,
  space: Space,
): { frame: Frame; rotation: number; flipH: boolean; flipV: boolean } | undefined {
  const off = child(xfrm, 'a:off');
  const ext = child(xfrm, 'a:ext');
  if (!off || !ext) return undefined;
  const x = intAttr(off, 'x') ?? 0;
  const y = intAttr(off, 'y') ?? 0;
  const cx = Math.max(0, intAttr(ext, 'cx') ?? 0);
  const cy = Math.max(0, intAttr(ext, 'cy') ?? 0);
  return {
    frame: {
      x: round(x * space.sx + space.ox),
      y: round(y * space.sy + space.oy),
      w: round(cx * space.sx),
      h: round(cy * space.sy),
    },
    rotation: round(((intAttr(xfrm, 'rot') ?? 0) / 60000) % 360),
    flipH: boolAttr(xfrm, 'flipH') ?? false,
    flipV: boolAttr(xfrm, 'flipV') ?? false,
  };
}

function nameOf(shape: XmlElement): {
  name?: string;
  descr?: string;
  hidden: boolean;
  link?: XmlElement;
} {
  const nv = children(shape).find((c) => c.name.startsWith('p:nv'));
  const cNvPr = child(nv, 'p:cNvPr');
  const name = attr(cNvPr, 'name')?.trim();
  const descr = attr(cNvPr, 'descr')?.trim();
  return {
    ...(name ? { name } : {}),
    ...(descr ? { descr } : {}),
    hidden: boolAttr(cNvPr, 'hidden') ?? false,
    ...(child(cNvPr, 'a:hlinkClick') ? { link: child(cNvPr, 'a:hlinkClick') } : {}),
  };
}

/** The colour a style reference (`a:fillRef`, `a:lnRef`, ...) gives `phClr`. */
function refColors(ref: XmlElement | undefined, colors: ColorContext): ColorContext {
  const c = readColor(ref, colors);
  return c ? { ...colors, ph: c } : colors;
}

/** The fill of a shape: its own, else its style's, else none. */
function shapeFill(
  spPr: XmlElement | undefined,
  chain: readonly XmlElement[],
  style: XmlElement | undefined,
  ctx: PartContext,
  group: Fill | undefined,
): Fill | undefined {
  const own =
    fillElementOf(spPr) ??
    [...chain]
      .reverse()
      .map((s) => fillElementOf(s))
      .find(Boolean);
  const picture = (blip: { rId: string }) => ctx.pictures.get(blip.rId);
  if (own) return readFill(own, ctx.colors, picture, group);
  const ref = child(style, 'a:fillRef');
  const idx = intAttr(ref, 'idx') ?? 0;
  if (!ref || idx === 0) return undefined;
  const theme = ctx.importer.theme;
  const list = idx >= 1000 ? theme.bgFills : theme.fills;
  const styled = list[idx >= 1000 ? idx - 1001 : idx - 1] ?? list[0];
  return styled ? readFill(styled, refColors(ref, ctx.colors), picture, group) : undefined;
}

function shapeOutline(
  spPr: XmlElement | undefined,
  chain: readonly XmlElement[],
  style: XmlElement | undefined,
  ctx: PartContext,
) {
  const own: (XmlElement | undefined)[] = [
    child(spPr, 'a:ln'),
    ...[...chain].reverse().map((s) => child(s, 'a:ln')),
  ];
  const ref = child(style, 'a:lnRef');
  const idx = intAttr(ref, 'idx') ?? 0;
  const themed = ref && idx > 0 ? ctx.importer.theme.lines[idx - 1] : undefined;
  // An outline the shape colours itself, or none of the style's: only the shape's own counts.
  if (!themed || own.some((ln) => fillElementOf(ln))) {
    return readOutline([...own, themed], ctx.colors, ctx.importer.pxPerEmu);
  }
  // Else the style's line, in the colour of the reference, under what the shape says of it.
  return readOutline([...own, themed], refColors(ref, ctx.colors), ctx.importer.pxPerEmu);
}

function shapeShadow(
  spPr: XmlElement | undefined,
  chain: readonly XmlElement[],
  style: XmlElement | undefined,
  ctx: PartContext,
): Shadow | undefined {
  const effects = inheritedChild(spPr, chain, 'a:effectLst');
  if (effects) return readShadow(effects, ctx.colors, ctx.importer.pxPerEmu);
  const ref = child(style, 'a:effectRef');
  const idx = intAttr(ref, 'idx') ?? 0;
  if (!ref || idx === 0) return undefined;
  const styled = ctx.importer.theme.effects[idx - 1];
  return readShadow(
    child(styled, 'a:effectLst'),
    refColors(ref, ctx.colors),
    ctx.importer.pxPerEmu,
  );
}

/** The link of a shape or a run: an address, or another slide of the deck. */
function linkOf(link: XmlElement | undefined, ctx: PartContext): Element['link'] | undefined {
  if (!link) return undefined;
  const target = ctx.importer.linkTarget(ctx.rels, attr(link, 'r:id') ?? '', attr(link, 'action'));
  if (!target) return undefined;
  const slide = /^#slide=(.+)$/.exec(target)?.[1];
  return slide ? { kind: 'slide', target: slide } : { kind: 'url', target };
}

function textContext(ctx: PartContext, style: XmlElement | undefined): TextContext {
  const fontRef = child(style, 'a:fontRef');
  return {
    colors: ctx.colors,
    theme: ctx.importer.theme,
    pxPerPt: ctx.importer.pxPerEmu * 12700,
    link: (rId, action) => ctx.importer.linkTarget(ctx.rels, rId, action),
    ...(attr(fontRef, 'idx') === 'major' ? { fontRef: 'major' as const } : {}),
  };
}

/** A shape style's font reference as a list style: its colour and font for every level. */
function fontRefStyle(fontRef: XmlElement): ListStyle {
  const color = children(fontRef)[0];
  const major = attr(fontRef, 'idx') === 'major';
  const level: LevelProps = {
    run: {
      ...(color ? { fill: { name: 'a:solidFill', attrs: {}, children: [color] } } : {}),
      latin: major ? '+mj-lt' : '+mn-lt',
      ea: major ? '+mj-ea' : '+mn-ea',
      cs: major ? '+mj-cs' : '+mn-cs',
    },
  };
  return Array.from({ length: 9 }, () => level);
}

/**
 * The outline and the shadow of a text's letters as the CSS the model keeps them as (TXT-11):
 * `-webkit-text-stroke` and `text-shadow`.
 */
function glyphCss(
  glyphs: ReadText['glyphs'],
  ctx: PartContext,
): Record<string, string> | undefined {
  const css: Record<string, string> = {};
  if (glyphs.ln) {
    const outline = readOutline([glyphs.ln], ctx.colors, ctx.importer.pxPerEmu);
    if (outline.stroke) {
      css['-webkit-text-stroke'] = `${outline.stroke.width}px ${colorCss(outline.stroke.color)}`;
      css['paint-order'] = 'stroke fill';
    }
  }
  const shadow = glyphs.effects
    ? readShadow(glyphs.effects, ctx.colors, ctx.importer.pxPerEmu)
    : undefined;
  if (shadow)
    css['text-shadow'] = `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${colorCss(shadow.color)}`;
  return Object.keys(css).length ? css : undefined;
}

/** The common fields of an element from a shape's box and name. */
function base(
  shape: XmlElement,
  box: NonNullable<ReturnType<typeof frameOf>>,
  ctx: PartContext,
  role?: PlaceholderRole,
) {
  const n = nameOf(shape);
  const link = linkOf(n.link, ctx);
  return {
    id: newId('e'),
    ...(n.name ? { name: n.name.slice(0, 200) } : {}),
    ...(role ? { role } : {}),
    frame: box.frame,
    rotation: box.rotation,
    ...(box.flipH ? { flipH: true } : {}),
    ...(box.flipV ? { flipV: true } : {}),
    opacity: 1,
    ...(n.hidden ? { hidden: true } : {}),
    ...(link ? { link } : {}),
  };
}

/* ---------------------------------------------------------------- shapes */

function readSp(
  sp: XmlElement,
  ctx: PartContext,
  space: Space,
  group: Fill | undefined,
): Element[] {
  const ph = placeholderOf(sp);
  if (ph && ctx.template) return [];
  const inherited: Inherited = ph
    ? ctx.inherit(ph)
    : { spPr: [], bodies: [], lists: [], styles: [] };
  const spPr = child(sp, 'p:spPr');
  const style = child(sp, 'p:style') ?? inherited.styles.at(-1);
  const xfrm = inheritedChild(spPr, inherited.spPr, 'a:xfrm');
  const box = frameOf(xfrm, space);
  if (!box) return [];
  const txBody = child(sp, 'p:txBody');
  const text = hasText(txBody);
  // An empty placeholder is a prompt of the editor: a show does not draw it.
  if (ph && !text) return [];
  const type = ph ? phType(ph) : undefined;
  const role = type ? ROLES[type] : undefined;
  const prstGeom = inheritedChild(spPr, inherited.spPr, 'a:prstGeom', 'a:custGeom');
  const prst = prstGeom?.name === 'a:prstGeom' ? (attr(prstGeom, 'prst') ?? 'rect') : undefined;
  const fill = shapeFill(spPr, inherited.spPr, style, ctx, group);
  const outline = shapeOutline(spPr, inherited.spPr, style, ctx);
  const shadow = shapeShadow(spPr, inherited.spPr, style, ctx);
  const effects = shadow ? { effects: { shadow } } : {};
  const common = { ...base(sp, box, ctx, role), ...effects };

  if (prst && LINE_PRESETS.has(prst)) {
    return [lineFrom(common, box, prst, outline.stroke, outline.start, outline.end, ctx)];
  }
  const emuBox = {
    w: box.frame.w / ctx.importer.pxPerEmu,
    h: box.frame.h / ctx.importer.pxPerEmu,
  };
  let geometry: Geometry = { kind: 'preset', preset: 'rect' };
  let closed = true;
  if (prstGeom?.name === 'a:custGeom') {
    const custom = customGeometry(prstGeom, emuBox, ctx.importer.pxPerEmu);
    if (custom) {
      geometry = custom.geometry;
      closed = custom.closed;
    }
  } else if (prstGeom) {
    const found = presetGeometry(prstGeom, box.frame);
    if (found) {
      geometry = found.geometry;
      if (found.approximated) ctx.importer.warn('shape-approximated', ctx.slide, prst);
    } else {
      ctx.importer.warn('shape-approximated', ctx.slide, prst);
    }
  }
  // An open outline of straight pieces is a line of the model, and so is a curve with heads.
  if (!closed && geometry.kind === 'path' && !text) {
    const line = lineOfPath(geometry.d, outline.start !== 'none' || outline.end !== 'none');
    if (line && outline.stroke) {
      return [
        createElement.line({
          ...common,
          points: line.points,
          curve: line.curve,
          stroke: outline.stroke,
          startHead: outline.start,
          endHead: outline.end,
        }),
      ];
    }
  }
  const visibleFill = fill !== undefined && fill.kind !== 'none';
  const visible = visibleFill || outline.stroke !== undefined;
  const bodyPr = child(txBody, 'a:bodyPr');
  const body = readBody([...inherited.bodies, ...(bodyPr ? [bodyPr] : [])], ctx.importer.pxPerEmu);
  // A shape's style names the font and the colour of its text, over the presentation's defaults.
  const fontRef = child(style, 'a:fontRef');
  const lists = ph
    ? inherited.lists
    : [...ctx.otherStyles, ...(fontRef ? [fontRefStyle(fontRef)] : [])];
  const styleRef = role === 'title' ? ('title' as const) : undefined;
  const readText = () => readParagraphs(txBody, lists, textContext(ctx, style), styleRef);
  if (body.vertical) ctx.importer.warn('vertical-text', ctx.slide);
  // Text written top to bottom is drawn as a box turned a quarter, its sides swapped.
  const turned = (frame: Frame, rotation: number) => {
    if (!body.vertical) return { frame, rotation };
    const cx = frame.x + frame.w / 2;
    const cy = frame.y + frame.h / 2;
    return {
      frame: { x: round(cx - frame.h / 2), y: round(cy - frame.w / 2), w: frame.h, h: frame.w },
      rotation: (rotation + (body.vertical === 'vert' ? 90 : 270)) % 360,
    };
  };
  const textElement = () => {
    const { content, glyphs } = readText();
    const css = glyphCss(glyphs, ctx);
    const place = turned(common.frame, common.rotation);
    return createElement.text({
      ...common,
      // Beside the shape it is drawn on, it is an element of its own.
      id: newId('e'),
      ...place,
      content,
      autoFit: body.autoFit,
      vAlign: body.vAlign,
      padding: body.padding,
      ...(body.wrap ? {} : { wrap: false }),
      ...(body.columns ? { columns: body.columns } : {}),
      ...(css ? { css } : {}),
    });
  };
  if (!visible) {
    if (text) return [textElement()];
    // An invisible shape that links somewhere is a place to click.
    if (!common.link) return [];
  }
  const shape = createElement.shape({
    ...common,
    geometry,
    fill: closed ? (fill ?? { kind: 'none' }) : { kind: 'none' },
    ...(outline.stroke ? { stroke: outline.stroke } : {}),
  });
  // The renderer draws a closed shape's outline inside its frame; PowerPoint on its edge.
  if (outline.stroke && closed) {
    const half = outline.stroke.width / 2;
    shape.frame = {
      x: round(shape.frame.x - half),
      y: round(shape.frame.y - half),
      w: round(shape.frame.w + 2 * half),
      h: round(shape.frame.h + 2 * half),
    };
  }
  if (!text) return [shape];
  if (body.vAlign === 'middle' && !body.vertical && body.autoFit !== 'growHeight') {
    // Text in the middle of a shape is the shape's own.
    const { content, glyphs } = readText();
    shape.content = content;
    shape.padding = body.padding;
    const css = glyphCss(glyphs, ctx);
    if (css) shape.css = css;
    return [shape];
  }
  // Text at the top or the bottom of a shape is a text box over it, grouped with it.
  const words = textElement();
  words.role = undefined;
  if (common.role) shape.role = undefined;
  return [groupOf([shape, { ...words, role: common.role }], shape.name)];
}

/**
 * The points of an open outline that a line of the model draws the same: one of straight
 * pieces, or, when `curves` (it has heads to keep), one of Béziers through its points, which the
 * renderer draws through them again (`linePath`).
 */
function lineOfPath(
  d: string,
  curves: boolean,
): { points: { x: number; y: number }[]; curve: 'straight' | 'curved' } | undefined {
  const segments = parseSvgPath(d);
  if (
    segments[0]?.type !== 'M' ||
    segments.slice(1).some((s) => s.type === 'M' || s.type === 'Z' || s.type === 'Q')
  ) {
    return undefined;
  }
  const rest = segments.slice(1);
  if (rest.length === 0) return undefined;
  const straight = rest.every((s) => s.type === 'L');
  if (!straight && !(curves && rest.every((s) => s.type === 'C'))) return undefined;
  const points = segments.map((s) => {
    const [x, y] = s.pts[s.pts.length - 1]!;
    return { x: round(x), y: round(y) };
  });
  return { points, curve: straight ? 'straight' : 'curved' };
}

/** Elements made into a group whose frame holds them all. */
function groupOf(elements: Element[], name?: string): GroupElement {
  const xs = elements.flatMap((e) => [e.frame.x, e.frame.x + e.frame.w]);
  const ys = elements.flatMap((e) => [e.frame.y, e.frame.y + e.frame.h]);
  const frame = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: round(Math.max(...xs) - Math.min(...xs)),
    h: round(Math.max(...ys) - Math.min(...ys)),
  };
  const children = elements.map((e) => {
    const copy = {
      ...e,
      frame: { ...e.frame, x: round(e.frame.x - frame.x), y: round(e.frame.y - frame.y) },
    };
    if (copy.role === undefined) delete copy.role;
    return copy;
  });
  return createElement.group({
    frame,
    children,
    ...(name ? { name } : {}),
  });
}

function lineFrom(
  common: ReturnType<typeof base> & { effects?: { shadow: Shadow } },
  box: NonNullable<ReturnType<typeof frameOf>>,
  prst: string,
  stroke: Stroke | undefined,
  start: LineHead,
  end: LineHead,
  ctx: PartContext,
): Element {
  void ctx;
  const { w, h } = box.frame;
  // A line runs from the box's top-left corner to its bottom-right; the flips turn it.
  const from = { x: box.flipH ? w : 0, y: box.flipV ? h : 0 };
  const to = { x: box.flipH ? 0 : w, y: box.flipV ? 0 : h };
  const curve = /^bent/.test(prst) ? 'elbow' : /^curved/.test(prst) ? 'curved' : 'straight';
  const { flipH, flipV, ...rest } = common;
  void flipH;
  void flipV;
  return createElement.line({
    ...rest,
    points:
      prst === 'lineInv'
        ? [
            { x: from.x, y: to.y },
            { x: to.x, y: from.y },
          ]
        : [from, to],
    stroke: stroke ?? { color: { token: 'text' }, width: 1.5 },
    startHead: start,
    endHead: end,
    curve,
  });
}

function readCxn(cxn: XmlElement, ctx: PartContext, space: Space): Element[] {
  const spPr = child(cxn, 'p:spPr');
  const box = frameOf(child(spPr, 'a:xfrm'), space);
  if (!box) return [];
  const style = child(cxn, 'p:style');
  const outline = shapeOutline(spPr, [], style, ctx);
  const prst = attr(child(spPr, 'a:prstGeom'), 'prst') ?? 'straightConnector1';
  const shadow = shapeShadow(spPr, [], style, ctx);
  const common = { ...base(cxn, box, ctx), ...(shadow ? { effects: { shadow } } : {}) };
  if (child(spPr, 'a:custGeom')) {
    const custom = customGeometry(
      child(spPr, 'a:custGeom')!,
      {
        w: box.frame.w / ctx.importer.pxPerEmu,
        h: box.frame.h / ctx.importer.pxPerEmu,
      },
      ctx.importer.pxPerEmu,
    );
    if (custom) {
      return [
        createElement.shape({
          ...common,
          geometry: custom.geometry,
          fill: { kind: 'none' },
          ...(outline.stroke ? { stroke: outline.stroke } : {}),
        }),
      ];
    }
  }
  return [
    lineFrom(
      common,
      box,
      LINE_PRESETS.has(prst) ? prst : 'line',
      outline.stroke,
      outline.start,
      outline.end,
      ctx,
    ),
  ];
}

/* ---------------------------------------------------------------- pictures, video and sound */

async function readPic(pic: XmlElement, ctx: PartContext, space: Space): Promise<Element[]> {
  const ph = placeholderOf(pic);
  if (ph && ctx.template) return [];
  const inherited: Inherited = ph
    ? ctx.inherit(ph)
    : { spPr: [], bodies: [], lists: [], styles: [] };
  const spPr = child(pic, 'p:spPr');
  const box = frameOf(inheritedChild(spPr, inherited.spPr, 'a:xfrm'), space);
  if (!box) return [];
  const blipFill = child(pic, 'p:blipFill');
  const blip = blipFill ? blipOf(blipFill) : undefined;
  const style = child(pic, 'p:style');
  const outline = shapeOutline(spPr, inherited.spPr, style, ctx);
  const shadow = shapeShadow(spPr, inherited.spPr, style, ctx);
  const common = {
    ...base(pic, box, ctx, ph ? 'image' : undefined),
    ...(shadow ? { effects: { shadow } } : {}),
  };
  const nvPr = path(pic, 'p:nvPicPr', 'p:nvPr');
  const video = child(nvPr, 'a:videoFile');
  const audio = child(nvPr, 'a:audioFile');
  if (video || audio) {
    let media: string | undefined;
    for (const ext of children(child(nvPr, 'p:extLst'), 'p:ext')) {
      const m = child(ext, 'p14:media');
      if (m) media = attr(m, 'r:embed');
    }
    const rId = media ?? attr(video ?? audio, 'r:link');
    const rel = rId ? ctx.rels.get(rId) : undefined;
    if (!rel || rel.external) {
      ctx.importer.warn('linked-media', ctx.slide, rel?.target);
      // The poster stays, as a picture.
    } else {
      const assetId = await ctx.importer.storeMedia(rel.target, video ? 'video' : 'audio');
      if (assetId) {
        const poster = blip ? ctx.pictures.get(blip.rId) : undefined;
        let trimStart: number | undefined;
        let trimEnd: number | undefined;
        for (const ext of children(child(nvPr, 'p:extLst'), 'p:ext')) {
          const trim = path(ext, 'p14:media', 'p14:trim');
          if (trim) {
            trimStart = intAttr(trim, 'st');
            trimEnd = intAttr(trim, 'end');
          }
        }
        const trim =
          trimStart !== undefined || trimEnd !== undefined
            ? { startMs: trimStart ?? 0, endMs: trimEnd ?? 0 }
            : undefined;
        if (video) {
          return [
            createElement.video({
              ...common,
              role: undefined,
              assetId,
              ...(poster ? { poster: { assetId: poster } } : {}),
            }),
          ].map((e) => {
            if (e.role === undefined) delete e.role;
            return trim && trim.endMs > trim.startMs ? { ...e, trim } : e;
          });
        }
        const sound = createElement.audio({ ...common, assetId });
        if (sound.role === 'image') delete sound.role;
        return [sound];
      }
    }
  }
  if (!blip) return [];
  const assetId = ctx.pictures.get(blip.rId);
  if (!assetId) return [];
  const geometry =
    child(spPr, 'a:prstGeom', 'a:custGeom') ??
    inheritedChild(undefined, inherited.spPr, 'a:prstGeom', 'a:custGeom');
  let mask: Parameters<typeof createElement.image>[0]['mask'];
  if (geometry?.name === 'a:prstGeom') {
    const prst = attr(geometry, 'prst') ?? 'rect';
    if (prst === 'ellipse') mask = { kind: 'ellipse' };
    else if (prst === 'roundRect') {
      const adj = Number(
        /^val\s+(\d+)/.exec(attr(child(child(geometry, 'a:avLst'), 'a:gd'), 'fmla') ?? '')?.[1] ??
          16667,
      );
      mask = {
        kind: 'rounded',
        radius: round((adj / 100000) * Math.min(box.frame.w, box.frame.h)),
      };
    } else if (prst !== 'rect') {
      const found = presetGeometry(geometry, box.frame);
      if (found?.geometry.kind === 'preset')
        mask = { kind: 'shape', preset: found.geometry.preset };
    }
  } else if (geometry?.name === 'a:custGeom') {
    const custom = customGeometry(
      geometry,
      {
        w: box.frame.w / ctx.importer.pxPerEmu,
        h: box.frame.h / ctx.importer.pxPerEmu,
      },
      ctx.importer.pxPerEmu,
    );
    if (custom?.geometry.kind === 'path')
      mask = { kind: 'path', d: custom.geometry.d, viewBox: custom.geometry.viewBox };
  }
  const look = child(blipFill, 'a:blip');
  const adjust: Record<string, number> = {};
  if (child(look, 'a:grayscl')) adjust.grayscale = 1;
  const lum = child(look, 'a:lum');
  if (lum) {
    const bright = intAttr(lum, 'bright');
    const contrast = intAttr(lum, 'contrast');
    if (bright) adjust.brightness = Math.round(bright / 1000);
    if (contrast) adjust.contrast = Math.round(contrast / 1000);
  }
  const n = nameOf(pic);
  const image = createElement.image({
    ...common,
    assetId,
    fit: 'fill',
    ...(blip.crop ? { crop: blip.crop } : {}),
    ...(mask ? { mask } : {}),
    ...(Object.keys(adjust).length ? { adjust } : {}),
    ...(outline.stroke ? { border: outline.stroke } : {}),
    ...(n.descr ? { alt: n.descr.slice(0, 2000) } : {}),
    opacity: blip.opacity ?? 1,
  });
  return [image];
}

/* ---------------------------------------------------------------- groups and frames */

async function readGroup(
  grp: XmlElement,
  ctx: PartContext,
  space: Space,
  group: Fill | undefined,
): Promise<Element[]> {
  const grpSpPr = child(grp, 'p:grpSpPr');
  const xfrm = child(grpSpPr, 'a:xfrm');
  const box = frameOf(xfrm, space);
  if (!box) return readTree(grp, ctx, space, group);
  const chOff = child(xfrm, 'a:chOff');
  const chExt = child(xfrm, 'a:chExt');
  const off = child(xfrm, 'a:off');
  const ext = child(xfrm, 'a:ext');
  const cx = intAttr(ext, 'cx') ?? 0;
  const cy = intAttr(ext, 'cy') ?? 0;
  const ccx = intAttr(chExt, 'cx') || cx || 1;
  const ccy = intAttr(chExt, 'cy') || cy || 1;
  const kx = cx / ccx;
  const ky = cy / ccy;
  const inner: Space = {
    sx: space.sx * kx,
    sy: space.sy * ky,
    ox: space.ox + space.sx * ((intAttr(off, 'x') ?? 0) - (intAttr(chOff, 'x') ?? 0) * kx),
    oy: space.oy + space.sy * ((intAttr(off, 'y') ?? 0) - (intAttr(chOff, 'y') ?? 0) * ky),
  };
  const groupFill = readFill(
    fillElementOf(grpSpPr),
    ctx.colors,
    (b) => ctx.pictures.get(b.rId),
    group,
  );
  const elements = await readTree(grp, ctx, inner, groupFill ?? group);
  if (elements.length === 0) return [];
  const { frame } = box;
  const childrenOf = elements.map((e) => {
    let x = e.frame.x - frame.x;
    let y = e.frame.y - frame.y;
    let rotation = e.rotation;
    let flipH = e.flipH;
    let flipV = e.flipV;
    // A flipped group mirrors where its shapes are, and each shape; the text stays readable.
    if (box.flipH) {
      x = frame.w - x - e.frame.w;
      flipH = !flipH;
      rotation = (360 - rotation) % 360;
    }
    if (box.flipV) {
      y = frame.h - y - e.frame.h;
      flipV = !flipV;
      rotation = (360 - rotation) % 360;
    }
    const copy = {
      ...e,
      frame: { ...e.frame, x: round(x), y: round(y) },
      rotation: round(rotation),
    };
    if (flipH) copy.flipH = true;
    else delete copy.flipH;
    if (flipV) copy.flipV = true;
    else delete copy.flipV;
    return copy;
  });
  const n = nameOf(grp);
  return [
    createElement.group({
      ...(n.name ? { name: n.name.slice(0, 200) } : {}),
      frame,
      rotation: box.rotation,
      ...(n.hidden ? { hidden: true } : {}),
      children: childrenOf,
    }),
  ];
}

async function readGraphicFrame(
  gf: XmlElement,
  ctx: PartContext,
  space: Space,
): Promise<Element[]> {
  const ph = placeholderOf(gf);
  if (ph && ctx.template) return [];
  const box = frameOf(child(gf, 'p:xfrm'), space);
  if (!box) return [];
  const data = path(gf, 'a:graphic', 'a:graphicData');
  const uri = attr(data, 'uri') ?? '';
  const common = base(gf, box, ctx);
  if (uri.endsWith('/table')) {
    const table = readTable(child(data, 'a:tbl'), common, ctx);
    return table ? [table] : [];
  }
  if (uri.endsWith('/chart')) {
    const rId = attr(child(data, 'c:chart'), 'r:id');
    const rel = rId ? ctx.rels.get(rId) : undefined;
    const chart = rel ? await readChart(rel.target, common, ctx) : undefined;
    return chart ? [chart] : [];
  }
  if (uri.endsWith('/diagram')) {
    // SmartArt: the shapes PowerPoint drew it with, kept in a part of their own.
    const ids = child(data, 'dgm:relIds');
    const drawing = await ctx.importer.diagramDrawing(ctx.path, ctx.rels, attr(ids, 'r:dm'));
    if (drawing) {
      ctx.importer.warn('smartart', ctx.slide);
      const inner: Space = {
        sx: space.sx,
        sy: space.sy,
        ox: box.frame.x,
        oy: box.frame.y,
      };
      const drawingCtx: PartContext = {
        ...ctx,
        path: drawing.path,
        rels: drawing.rels,
        pictures: await ctx.importer.pictures(drawing.path, drawing.tree, drawing.rels),
      };
      const elements = await readTree(drawing.tree, drawingCtx, inner, undefined);
      return elements.length ? [groupOf(elements, common.name)] : [];
    }
  }
  // An embedded object or anything else: the picture PowerPoint keeps of it, if there is one.
  const fallback =
    path(data, 'p:oleObj', 'p:pic') ?? children(data).flatMap((c) => children(c, 'p:pic'))[0];
  if (fallback) {
    ctx.importer.warn('object-picture', ctx.slide);
    const pictures = await ctx.importer.pictures(ctx.path, fallback, ctx.rels);
    for (const [k, v] of pictures) ctx.pictures.set(k, v);
    const picture = await readPic(withFrame(fallback, child(gf, 'p:xfrm')), ctx, space);
    return picture;
  }
  ctx.importer.warn('unsupported-object', ctx.slide, uri.split('/').at(-1));
  return [];
}

/** A picture with the box of the frame it stands in for. */
function withFrame(pic: XmlElement, xfrm: XmlElement | undefined): XmlElement {
  if (!xfrm) return pic;
  const spPr = child(pic, 'p:spPr');
  const frame: XmlElement = { name: 'a:xfrm', attrs: { ...xfrm.attrs }, children: xfrm.children };
  const newSpPr: XmlElement = {
    name: 'p:spPr',
    attrs: spPr?.attrs ?? {},
    children: [
      frame,
      ...(spPr?.children ?? []).filter((c) => typeof c === 'string' || c.name !== 'a:xfrm'),
    ],
  };
  return {
    ...pic,
    children: [
      ...pic.children.filter((c) => typeof c === 'string' || c.name !== 'p:spPr'),
      newSpPr,
    ],
  };
}

/** The branch of an `mc:AlternateContent` to read: the fallback, unless only the choice has content. */
function alternative(ac: XmlElement): XmlElement[] {
  const fallback = child(ac, 'mc:Fallback');
  const choice = child(ac, 'mc:Choice');
  const requires = attr(choice, 'Requires') ?? '';
  // What PowerPoint 2010 added to shapes, which this reads: the choice is the shape itself.
  if (
    choice &&
    /^(p14|p15|a14)$/.test(requires.trim()) &&
    !children(choice).some((c) => c.name === 'p:graphicFrame' || c.name === 'mc:AlternateContent')
  ) {
    const hasMath = JSON.stringify(choice).includes('a14:m');
    if (!hasMath || !fallback) return children(choice);
  }
  return children(fallback ?? choice);
}

/** The elements of a tree's shapes, bottom first. */
export async function readTree(
  tree: XmlElement,
  ctx: PartContext,
  space: Space,
  group: Fill | undefined,
): Promise<Element[]> {
  const out: Element[] = [];
  const visit = async (nodes: XmlElement[]) => {
    for (const node of nodes) {
      const before = out.length;
      switch (node.name) {
        case 'p:sp':
          out.push(...readSp(node, ctx, space, group));
          break;
        case 'p:pic':
          out.push(...(await readPic(node, ctx, space)));
          break;
        case 'p:cxnSp':
          out.push(...readCxn(node, ctx, space));
          break;
        case 'p:grpSp':
          out.push(...(await readGroup(node, ctx, space, group)));
          break;
        case 'p:graphicFrame':
          out.push(...(await readGraphicFrame(node, ctx, space)));
          break;
        case 'mc:AlternateContent':
          await visit(alternative(node));
          break;
        case 'p:contentPart':
          ctx.importer.warn('unsupported-object', ctx.slide, 'ink');
          break;
      }
      // A shape and every shape inside it animate as the element it became.
      const made = out[before];
      if (ctx.shapeIds && made && node.name !== 'mc:AlternateContent') {
        for (const nv of descendants(node, 'p:cNvPr')) {
          const id = attr(nv, 'id');
          if (id) ctx.shapeIds.set(id, made.id);
        }
      }
    }
  };
  await visit(children(tree));
  return out;
}
