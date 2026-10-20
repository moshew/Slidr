import type {
  AudioElement,
  Element,
  Frame,
  GroupElement,
  ImageElement,
  LineElement,
  Point,
  ShapeElement,
  Slide,
  SvgElement,
  TextElement,
  VideoElement,
} from '@slidr/model';
import { isBoxPreset, linePath, presetPath, scalePath } from '@slidr/renderer';
import { REL, type PartRels } from '../opc';
import { soundIcon, videoStill } from '../png';
import { percent } from '../units';
import { el } from '../xml';
import { chartXml } from './chart';
import type { ExportContext, MediaPart } from './context';
import {
  customGeometryXml,
  effectsXml,
  fillXml,
  fitRects,
  presetGeometryXml,
  strokeXml,
  xfrmXml,
} from './drawing';
import { readCssLook } from './css';
import { tableXml } from './table';
import type { ShapeIds } from './timing';
import { bodyPrXml, linkXml, NO_PADDING, paragraphsXml, type TextContext } from './text';

/*
 * The objects of a slide as the shapes of its tree (`p:spTree`): a text box and a shape are
 * `p:sp`, a picture, a video and a sound `p:pic`, a line `p:cxnSp`, a group `p:grpSp`, a table
 * and a chart `p:graphicFrame`. What PowerPoint has no object for goes in as a picture of it.
 */

/** Text in a shape keeps clear of the outline, as the renderer draws it (`SHAPE_TEXT_PADDING`). */
const SHAPE_TEXT_PADDING = { top: 8, right: 16, bottom: 8, left: 16 };

/** The part a tree is written into: its relationships and the ids of its shapes. */
export interface PartWriter {
  rels: PartRels;
  /** The next id of a shape in the part: unique in it, from 2 (1 is the tree). */
  nextId(): number;
  /** The slide the shapes are on, for pictures the host draws; undefined in a layout. */
  slide?: Slide;
  /** The placeholder an element of the slide stands in for, as `p:ph`. */
  placeholder?: (element: Element) => string | undefined;
  /** The id each element's shape was given, for the slide's animations. */
  shapeIds?: ShapeIds;
}

/** Where an element is drawn on the slide: its frame moved by the groups around it. */
interface Placement {
  dx: number;
  dy: number;
  alpha: number;
}

const absolute = (frame: Frame, at: Placement): Frame => ({
  x: frame.x + at.dx,
  y: frame.y + at.dy,
  w: frame.w,
  h: frame.h,
});

function nvProps(
  e: Element,
  id: number,
  fallbackName: string,
  ctx: ExportContext,
  part: PartWriter,
  descr?: string,
): string {
  const link = e.link ? linkXml(e.link, ctx, part.rels) : undefined;
  part.shapeIds?.set(e.id, { id, text: e.type === 'text' || e.type === 'shape' });
  return el(
    'p:cNvPr',
    {
      id,
      name: e.name ?? `${fallbackName} ${id - 1}`,
      descr: descr || undefined,
      hidden: e.hidden ? 1 : undefined,
    },
    link,
  );
}

function textContext(
  ctx: ExportContext,
  alpha: number,
  extra: Partial<TextContext> = {},
): TextContext {
  return {
    theme: ctx.deck.theme,
    dir: ctx.deck.meta.dir,
    lang: ctx.deck.meta.lang,
    alpha,
    ...extra,
  };
}

/* ---------------------------------------------------------------- text and shapes */

async function textXml(
  e: TextElement,
  ctx: ExportContext,
  part: PartWriter,
  at: Placement,
): Promise<string> {
  const id = part.nextId();
  const alpha = at.alpha * e.opacity;
  const frame = absolute(e.frame, at);
  const ph = part.placeholder?.(e);
  const look = await readCssLook(e.css, ctx, part.rels, frame, alpha);
  const radius = e.effects?.radius ?? look.radius;
  const geometry =
    radius && frame.w > 0 && frame.h > 0
      ? presetGeometryXml('roundRect', {
          adj: Math.min(50000, percent(radius / Math.min(frame.w, frame.h))),
        })
      : presetGeometryXml('rect');
  const tc = textContext(ctx, alpha, {
    ...(e.color ? { color: e.color } : {}),
    ...(look.text ? { glyphs: look.text } : {}),
    slideNumber: e.role === 'slideNumber',
  });
  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      nvProps(e, id, ph ? 'Title' : 'TextBox', ctx, part),
      el('p:cNvSpPr', { txBox: ph ? undefined : 1 }),
      el('p:nvPr', {}, ph),
    ),
    el(
      'p:spPr',
      {},
      xfrmXml(frame, { rotation: e.rotation, flipH: e.flipH, flipV: e.flipV }),
      geometry,
      look.background ?? el('a:noFill'),
      strokeXml(look.border, alpha),
      effectsXml(
        e.effects?.shadow || !look.shadow ? e.effects : { ...e.effects, shadow: look.shadow },
        ctx,
        alpha,
      ),
    ),
    el(
      'p:txBody',
      {},
      bodyPrXml(
        {
          padding: e.padding ?? NO_PADDING,
          vAlign: e.vAlign,
          autoFit: e.autoFit,
          wrap: e.wrap !== false,
          ...(e.columns ? { columns: e.columns } : {}),
        },
        ctx.deck.meta.dir === 'rtl',
      ),
      el('a:lstStyle'),
      paragraphsXml(e.content, ctx, tc, part.rels),
    ),
  );
}

/** The outline of a shape in its box, as DrawingML: a preset where one draws the same. */
function shapeGeometry(e: ShapeElement, box: Frame): string {
  const g = e.geometry;
  const { w, h } = box;
  if (g.kind === 'path') {
    return customGeometryXml(
      scalePath(g.d, w / g.viewBox.w, h / g.viewBox.h),
      w,
      h,
      /z\s*$/i.test(g.d.trim()),
    );
  }
  switch (g.preset) {
    case 'rect': {
      const r = e.effects?.radius;
      return r && w > 0 && h > 0
        ? presetGeometryXml('roundRect', { adj: Math.min(50000, percent(r / Math.min(w, h))) })
        : presetGeometryXml('rect');
    }
    case 'roundRect':
      return presetGeometryXml('roundRect', {
        adj: percent(Math.min(0.5, Math.max(0, g.adjust?.[0] ?? 0.1667))),
      });
    case 'ellipse':
      return presetGeometryXml('ellipse');
    case 'triangle':
      return presetGeometryXml('triangle', { adj: percent(g.adjust?.[0] ?? 0.5) });
    case 'rightTriangle':
      return presetGeometryXml('rtTriangle');
    case 'diamond':
      return presetGeometryXml('diamond');
  }
  const path = presetPath(g.preset, w, h, g.adjust);
  if (!path) return presetGeometryXml('rect');
  return customGeometryXml(path.d, w, h, path.closed);
}

/** Whether a shape is closed, so that it has a fill and its outline is drawn inside it. */
function closedShape(e: ShapeElement): boolean {
  const g = e.geometry;
  if (g.kind === 'path') return /z\s*$/i.test(g.d.trim());
  if (isBoxPreset(g.preset)) return true;
  return presetPath(g.preset, 10, 10, g.adjust)?.closed ?? true;
}

async function shapeXml(
  e: ShapeElement,
  ctx: ExportContext,
  part: PartWriter,
  at: Placement,
): Promise<string> {
  const alpha = at.alpha * e.opacity;
  const outer = absolute(e.frame, at);
  // The renderer draws the outline of a closed shape inside it; DrawingML on its edge. Half the
  // width in on every side puts the outline where the deck has it.
  const half = e.stroke && e.stroke.width > 0 && closedShape(e) ? e.stroke.width / 2 : 0;
  const frame = {
    x: outer.x + half,
    y: outer.y + half,
    w: Math.max(0, outer.w - 2 * half),
    h: Math.max(0, outer.h - 2 * half),
  };
  const id = part.nextId();
  const ph = part.placeholder?.(e);
  const look = await readCssLook(e.css, ctx, part.rels, frame, alpha);
  const text = e.content
    ? el(
        'p:txBody',
        {},
        bodyPrXml(
          {
            padding: shrinkInsets(e.padding ?? SHAPE_TEXT_PADDING, half),
            vAlign: 'middle',
            autoFit: 'none',
            wrap: true,
          },
          ctx.deck.meta.dir === 'rtl',
        ),
        el('a:lstStyle'),
        paragraphsXml(
          e.content,
          ctx,
          textContext(ctx, alpha, look.text ? { glyphs: look.text } : {}),
          part.rels,
        ),
      )
    : undefined;
  const sp = el(
    'p:sp',
    {},
    el('p:nvSpPr', {}, nvProps(e, id, 'Shape', ctx, part), el('p:cNvSpPr'), el('p:nvPr', {}, ph)),
    el(
      'p:spPr',
      {},
      xfrmXml(frame, {
        rotation: e.accent ? 0 : e.rotation,
        flipH: e.flipH,
        flipV: e.flipV,
      }),
      shapeGeometry(e, frame),
      closedShape(e) ? await fillXml(e.fill, ctx, part.rels, frame, alpha) : el('a:noFill'),
      strokeXml(e.stroke, alpha),
      effectsXml(e.effects, ctx, alpha),
    ),
    text,
  );
  if (!e.accent) return sp;
  // A coloured edge is a stripe of its own, inside the outline, grouped with the shape so that
  // they turn together.
  const inset = e.stroke?.width ?? 0;
  const { side, size } = e.accent;
  const inner = {
    x: outer.x + inset,
    y: outer.y + inset,
    w: Math.max(0, outer.w - 2 * inset),
    h: Math.max(0, outer.h - 2 * inset),
  };
  const stripe =
    side === 'top'
      ? { ...inner, h: size }
      : side === 'bottom'
        ? { ...inner, y: inner.y + inner.h - size, h: size }
        : side === 'left'
          ? { ...inner, w: size }
          : { ...inner, x: inner.x + inner.w - size, w: size };
  const stripeId = part.nextId();
  const stripeXml = el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      el('p:cNvPr', { id: stripeId, name: `Accent ${stripeId - 1}` }),
      el('p:cNvSpPr'),
      el('p:nvPr'),
    ),
    el(
      'p:spPr',
      {},
      xfrmXml(stripe),
      presetGeometryXml('rect'),
      await fillXml(e.accent.fill, ctx, part.rels, stripe, alpha),
      el('a:ln', {}, el('a:noFill')),
    ),
  );
  return groupWrap(
    part,
    outer,
    e.rotation,
    [sp, stripeXml],
    e.name ? `${e.name} group` : undefined,
  );
}

function shrinkInsets(
  padding: { top: number; right: number; bottom: number; left: number },
  by: number,
) {
  return {
    top: Math.max(0, padding.top - by),
    right: Math.max(0, padding.right - by),
    bottom: Math.max(0, padding.bottom - by),
    left: Math.max(0, padding.left - by),
  };
}

/** Shapes in a group of their own, the group's box the frame given. */
function groupWrap(
  part: PartWriter,
  frame: Frame,
  rotation: number,
  inner: string[],
  name?: string,
) {
  const id = part.nextId();
  return el(
    'p:grpSp',
    {},
    el(
      'p:nvGrpSpPr',
      {},
      el('p:cNvPr', { id, name: name ?? `Group ${id - 1}` }),
      el('p:cNvGrpSpPr'),
      el('p:nvPr'),
    ),
    el('p:grpSpPr', {}, xfrmXml(frame, { rotation, child: frame })),
    ...inner,
  );
}

/* ---------------------------------------------------------------- pictures */

/** The outline a picture is cut to: its mask, or the element's corner radius. */
function maskGeometry(e: ImageElement, frame: Frame): string {
  const mask = e.mask;
  const { w, h } = frame;
  if (mask?.kind === 'ellipse') return presetGeometryXml('ellipse');
  if (mask?.kind === 'rounded') {
    return presetGeometryXml('roundRect', {
      adj: Math.min(50000, percent(mask.radius / Math.max(1, Math.min(w, h)))),
    });
  }
  if (mask?.kind === 'shape') {
    const path = presetPath(mask.preset, w, h);
    if (path) return customGeometryXml(path.d, w, h, true);
  }
  if (mask?.kind === 'path') {
    return customGeometryXml(scalePath(mask.d, w / mask.viewBox.w, h / mask.viewBox.h), w, h, true);
  }
  const r = e.effects?.radius;
  if (r)
    return presetGeometryXml('roundRect', {
      adj: Math.min(50000, percent(r / Math.max(1, Math.min(w, h)))),
    });
  return presetGeometryXml('rect');
}

/** A `p:pic` of a picture part, in a box, with the look DrawingML can give it. */
function picXml(options: {
  e: Element;
  id: number;
  name: string;
  descr?: string;
  ctx: ExportContext;
  part: PartWriter;
  frame: Frame;
  blip: string;
  src?: string;
  fill?: string;
  geometry?: string;
  border?: string;
  alpha: number;
  nvPr?: string;
  flips?: boolean;
}): string {
  const { e, ctx, part, frame } = options;
  return el(
    'p:pic',
    {},
    el(
      'p:nvPicPr',
      {},
      nvProps(e, options.id, options.name, ctx, part, options.descr),
      el('p:cNvPicPr', {}, el('a:picLocks', { noChangeAspect: 1 })),
      el('p:nvPr', {}, options.nvPr),
    ),
    el(
      'p:blipFill',
      {},
      options.blip,
      options.src ?? '',
      el('a:stretch', {}, options.fill || el('a:fillRect')),
    ),
    el(
      'p:spPr',
      {},
      xfrmXml(frame, {
        rotation: e.rotation,
        flipH: options.flips === false ? undefined : e.flipH,
        flipV: options.flips === false ? undefined : e.flipV,
      }),
      options.geometry ?? presetGeometryXml('rect'),
      options.border ?? '',
      effectsXml(e.effects, ctx, options.alpha),
    ),
  );
}

function blipXml(
  ctx: ExportContext,
  part: PartWriter,
  media: MediaPart,
  alpha: number,
  extra = '',
  svg?: MediaPart,
) {
  return el(
    'a:blip',
    { 'r:embed': ctx.imageRel(part.rels, media) },
    alpha < 1 ? el('a:alphaModFix', { amt: percent(alpha) }) : undefined,
    extra,
    svg
      ? el(
          'a:extLst',
          {},
          el(
            'a:ext',
            { uri: '{96DAC541-7B7A-43D3-8B79-37D633B846F1}' },
            el('asvg:svgBlip', {
              'xmlns:asvg': 'http://schemas.microsoft.com/office/drawing/2016/SVG/main',
              'r:embed': ctx.imageRel(part.rels, svg),
            }),
          ),
        )
      : undefined,
  );
}

/** Whether a picture has a look DrawingML has no setting for. */
function needsPicture(e: ImageElement): boolean {
  if (e.smartFrame || e.mask?.kind === 'window' || e.filterPreset) return true;
  const a = e.adjust;
  if (!a) return false;
  return Boolean(
    a.saturation || a.temperature || a.hue || a.blur || (a.grayscale && a.grayscale < 1),
  );
}

/** The element as the host drew it, written as a picture of its box. */
async function hostPicture(
  e: Element,
  ctx: ExportContext,
  part: PartWriter,
): Promise<{ png: MediaPart; svg?: MediaPart } | undefined> {
  if (!ctx.options.picture || !part.slide) return undefined;
  const drawn = await ctx.options.picture(e, part.slide, ctx.deck).catch(() => undefined);
  if (!drawn) return undefined;
  return {
    png: ctx.bytesPart(drawn.png, 'image/png'),
    ...(drawn.svg
      ? { svg: ctx.bytesPart(new TextEncoder().encode(drawn.svg), 'image/svg+xml') }
      : {}),
  };
}

async function imageXml(
  e: ImageElement,
  ctx: ExportContext,
  part: PartWriter,
  at: Placement,
): Promise<string | undefined> {
  const alpha = at.alpha * e.opacity;
  const frame = absolute(e.frame, at);
  const asset = e.assetId ? ctx.deck.assets[e.assetId] : undefined;
  if (!asset) {
    ctx.warn('image-placeholder', e.name);
    return undefined;
  }
  if (needsPicture(e)) {
    const drawn = await hostPicture(e, ctx, part);
    if (drawn) {
      ctx.warn('element-picture', 'image');
      return picXml({
        e,
        id: part.nextId(),
        name: 'Picture',
        descr: e.alt,
        ctx,
        part,
        frame,
        blip: blipXml(ctx, part, drawn.png, alpha),
        alpha,
        flips: false,
      });
    }
  }
  const media = await ctx.assetPart(asset);
  if (!media) return undefined;
  let box = frame;
  let fit = e.fit;
  if (
    fit === 'contain' &&
    asset.width &&
    asset.height &&
    !e.mask &&
    !e.border &&
    !e.effects?.radius
  ) {
    // A picture that does not fill its frame is a picture as large as it is drawn: every
    // application shows that the same way, where the inset of its fill some do not read.
    const crop = e.crop ?? { x: 0, y: 0, w: 1, h: 1 };
    const aspect = (crop.w * asset.width) / (crop.h * asset.height);
    const w = Math.min(frame.w, frame.h * aspect);
    const h = Math.min(frame.h, frame.w / aspect);
    box = { x: frame.x + (frame.w - w) / 2, y: frame.y + (frame.h - h) / 2, w, h };
    fit = 'fill';
  }
  const rects =
    asset.width && asset.height
      ? fitRects({ w: asset.width, h: asset.height }, box, fit, e.crop)
      : fitRects({ w: box.w || 1, h: box.h || 1 }, box, 'fill', e.crop);
  const looks: string[] = [];
  if (e.adjust?.grayscale && e.adjust.grayscale >= 1) looks.push(el('a:grayscl'));
  const bright = e.adjust?.brightness;
  const contrast = e.adjust?.contrast;
  if (bright || contrast) {
    looks.push(
      el('a:lum', {
        bright: bright ? percent(bright / 100) : undefined,
        contrast: contrast ? percent(contrast / 100) : undefined,
      }),
    );
  }
  const svg = asset.kind === 'svg' ? media : undefined;
  let main = media;
  if (svg) {
    // PowerPoint draws the SVG and shows the PNG where it cannot.
    const drawn = await hostPicture(e, ctx, part);
    if (drawn) main = drawn.png;
  }
  return picXml({
    e,
    id: part.nextId(),
    name: 'Picture',
    descr: e.alt,
    ctx,
    part,
    frame: box,
    blip: blipXml(ctx, part, main, alpha, looks.join(''), svg && main !== svg ? svg : undefined),
    src: rects.src,
    fill: rects.fill,
    geometry: maskGeometry(e, box),
    border: e.border ? strokeXml(e.border, alpha) : undefined,
    alpha,
  });
}

async function svgXml(
  e: SvgElement,
  ctx: ExportContext,
  part: PartWriter,
  at: Placement,
): Promise<string | undefined> {
  const alpha = at.alpha * e.opacity;
  const frame = absolute(e.frame, at);
  const drawn = await hostPicture(e, ctx, part);
  const png = drawn?.png;
  let svg = drawn?.svg;
  // A drawing that is laid out or stretched for its box is the picture of that box only.
  const vector = !e.stretch && !e.layout;
  if (!svg && vector) {
    if (e.assetId) {
      const asset = ctx.deck.assets[e.assetId];
      svg = asset ? await ctx.assetPart(asset) : undefined;
    } else if (e.markup && !e.colorOverrides) {
      svg = ctx.bytesPart(new TextEncoder().encode(e.markup), 'image/svg+xml');
    }
  }
  if (!vector) svg = undefined;
  const main = png ?? svg;
  if (!main) {
    ctx.warn('element-picture', 'svg');
    return undefined;
  }
  return picXml({
    e,
    id: part.nextId(),
    name: 'Graphic',
    ctx,
    part,
    frame,
    blip: blipXml(ctx, part, main, alpha, '', svg && svg !== main ? svg : undefined),
    alpha,
    // The host's picture is drawn with the element's mirroring already.
    flips: !drawn,
  });
}

async function htmlXml(
  e: Element,
  ctx: ExportContext,
  part: PartWriter,
  at: Placement,
): Promise<string | undefined> {
  const drawn = await hostPicture(e, ctx, part);
  if (!drawn) {
    ctx.warn('html-missing', e.name);
    return undefined;
  }
  ctx.warn('html-picture', e.name);
  const alpha = at.alpha * e.opacity;
  return picXml({
    e,
    id: part.nextId(),
    name: 'Picture',
    ctx,
    part,
    frame: absolute(e.frame, at),
    blip: blipXml(ctx, part, drawn.png, alpha),
    alpha,
    flips: false,
  });
}

/* ---------------------------------------------------------------- video and sound */

const MEDIA_EXT = '{DAA4B4D4-6727-11D9-A75A-0080C7D3A5FD}';

async function mediaXml(
  e: VideoElement | AudioElement,
  ctx: ExportContext,
  part: PartWriter,
  at: Placement,
): Promise<string | undefined> {
  const asset = ctx.deck.assets[e.assetId];
  const media = asset ? await ctx.assetPart(asset) : undefined;
  if (!asset || !media) return undefined;
  const frame = absolute(e.frame, at);
  const alpha = at.alpha * e.opacity;
  let poster: MediaPart | undefined;
  if (e.type === 'video') {
    if (e.poster && 'assetId' in e.poster) {
      const image = ctx.deck.assets[e.poster.assetId];
      poster = image ? await ctx.assetPart(image) : undefined;
    }
    if (!poster && ctx.options.videoFrame) {
      const blob = await ctx.assetBlob(asset);
      const time = e.poster && 'timeMs' in e.poster ? e.poster.timeMs : (e.trim?.startMs ?? 0);
      const png = blob
        ? await ctx.options.videoFrame(blob, time).catch(() => undefined)
        : undefined;
      if (png) poster = ctx.bytesPart(png, 'image/png');
    }
    poster ??= ctx.bytesPart(await videoStill(), 'image/png');
  } else {
    poster = ctx.bytesPart(await soundIcon(), 'image/png');
  }
  const linkType = e.type === 'video' ? REL.video : REL.audio;
  const link = part.rels.add(linkType, media.path);
  const embed = part.rels.add(REL.media, media.path);
  const trim = e.trim
    ? el('p14:trim', { st: Math.round(e.trim.startMs), end: Math.round(e.trim.endMs) })
    : undefined;
  const nvPr =
    el(e.type === 'video' ? 'a:videoFile' : 'a:audioFile', { 'r:link': link }) +
    el(
      'p:extLst',
      {},
      el(
        'p:ext',
        { uri: MEDIA_EXT },
        el(
          'p14:media',
          {
            'xmlns:p14': 'http://schemas.microsoft.com/office/powerpoint/2010/main',
            'r:embed': embed,
          },
          trim,
        ),
      ),
    );
  return picXml({
    e,
    id: part.nextId(),
    name: e.type === 'video' ? 'Video' : 'Audio',
    ctx,
    part,
    frame,
    blip: blipXml(ctx, part, poster, alpha),
    alpha,
    nvPr,
  });
}

/* ---------------------------------------------------------------- lines */

const LINE_SIZE = (width: number) => (width >= 2.5 ? 'med' : 'lg');

/** The points of a line on the slide's own axes in its box: mirrored as the element is. */
function localPoints(e: LineElement): Point[] {
  return e.points.map((p) => ({
    x: e.flipH ? e.frame.w - p.x : p.x,
    y: e.flipV ? e.frame.h - p.y : p.y,
  }));
}

function lineXml(e: LineElement, ctx: ExportContext, part: PartWriter, at: Placement): string {
  const alpha = at.alpha * e.opacity;
  const frame = absolute(e.frame, at);
  const points = localPoints(e);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const box = { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  // The box turns around the frame's centre; its own centre goes where that turn takes it.
  const rad = (e.rotation * Math.PI) / 180;
  const fc = { x: e.frame.w / 2, y: e.frame.h / 2 };
  const bc = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const turned = {
    x: fc.x + (bc.x - fc.x) * Math.cos(rad) - (bc.y - fc.y) * Math.sin(rad),
    y: fc.y + (bc.x - fc.x) * Math.sin(rad) + (bc.y - fc.y) * Math.cos(rad),
  };
  const placed: Frame = {
    x: frame.x + turned.x - box.w / 2,
    y: frame.y + turned.y - box.h / 2,
    w: box.w,
    h: box.h,
  };
  const id = part.nextId();
  const heads = { start: e.startHead, end: e.endHead };
  const stroke = strokeXml(e.stroke, alpha, heads).replace(
    /(<a:(?:head|tail)End [^>]*?)w="med" len="med"/g,
    `$1w="${LINE_SIZE(e.stroke.width)}" len="${LINE_SIZE(e.stroke.width)}"`,
  );
  // A straight line is a connector; an elbow or a curve is drawn as its own outline, which no
  // application routes again.
  if (points.length === 2 && e.curve === 'straight') {
    const [a, b] = points as [Point, Point];
    return el(
      'p:cxnSp',
      {},
      el(
        'p:nvCxnSpPr',
        {},
        nvProps(e, id, 'Connector', ctx, part),
        el('p:cNvCxnSpPr'),
        el('p:nvPr'),
      ),
      el(
        'p:spPr',
        {},
        xfrmXml(placed, { rotation: e.rotation, flipH: a.x > b.x, flipV: a.y > b.y }),
        presetGeometryXml('straightConnector1'),
        el('a:noFill'),
        stroke,
        effectsXml(e.effects, ctx, alpha),
      ),
    );
  }
  const d = linePath(
    points.map((p) => ({ x: p.x - box.x, y: p.y - box.y })),
    e.curve,
  );
  return el(
    'p:sp',
    {},
    el('p:nvSpPr', {}, nvProps(e, id, 'Freeform', ctx, part), el('p:cNvSpPr'), el('p:nvPr')),
    el(
      'p:spPr',
      {},
      xfrmXml(placed, { rotation: e.rotation }),
      customGeometryXml(d, box.w, box.h, false),
      el('a:noFill'),
      stroke,
      effectsXml(e.effects, ctx, alpha),
    ),
  );
}

/* ---------------------------------------------------------------- groups and the tree */

async function groupXml(
  e: GroupElement,
  ctx: ExportContext,
  part: PartWriter,
  at: Placement,
): Promise<string> {
  const frame = absolute(e.frame, at);
  const id = part.nextId();
  const inner = await elementsXml(e.children, ctx, part, {
    dx: frame.x,
    dy: frame.y,
    alpha: at.alpha * e.opacity,
  });
  return el(
    'p:grpSp',
    {},
    el('p:nvGrpSpPr', {}, nvProps(e, id, 'Group', ctx, part), el('p:cNvGrpSpPr'), el('p:nvPr')),
    el(
      'p:grpSpPr',
      {},
      xfrmXml(frame, { rotation: e.rotation, flipH: e.flipH, flipV: e.flipV, child: frame }),
      effectsXml(e.effects, ctx, at.alpha * e.opacity),
    ),
    inner,
  );
}

async function elementXml(
  e: Element,
  ctx: ExportContext,
  part: PartWriter,
  at: Placement,
): Promise<string | undefined> {
  switch (e.type) {
    case 'text':
      return textXml(e, ctx, part, at);
    case 'shape':
      return shapeXml(e, ctx, part, at);
    case 'image':
      return imageXml(e, ctx, part, at);
    case 'line':
      return lineXml(e, ctx, part, at);
    case 'svg':
      return svgXml(e, ctx, part, at);
    case 'table':
      return tableXml(e, ctx, part, absolute(e.frame, at), at.alpha * e.opacity, part.nextId());
    case 'chart':
      return chartXml(e, ctx, part, absolute(e.frame, at), part.nextId());
    case 'video':
    case 'audio':
      return mediaXml(e, ctx, part, at);
    case 'html':
      return htmlXml(e, ctx, part, at);
    case 'group':
      return groupXml(e, ctx, part, at);
  }
}

/** The shapes of a list of elements, bottom first, as the model orders them. */
export async function elementsXml(
  elements: readonly Element[],
  ctx: ExportContext,
  part: PartWriter,
  at: Placement = { dx: 0, dy: 0, alpha: 1 },
): Promise<string> {
  const out: string[] = [];
  for (const e of elements) {
    const xml = await elementXml(e, ctx, part, at);
    if (xml) out.push(xml);
  }
  return out.join('');
}

/** A shape tree: the group every part's shapes are in, and the shapes. */
export function spTreeXml(shapes: string): string {
  return el(
    'p:spTree',
    {},
    el('p:nvGrpSpPr', {}, el('p:cNvPr', { id: 1, name: '' }), el('p:cNvGrpSpPr'), el('p:nvPr')),
    el(
      'p:grpSpPr',
      {},
      el(
        'a:xfrm',
        {},
        el('a:off', { x: 0, y: 0 }),
        el('a:ext', { cx: 0, cy: 0 }),
        el('a:chOff', { x: 0, y: 0 }),
        el('a:chExt', { cx: 0, cy: 0 }),
      ),
    ),
    shapes,
  );
}
