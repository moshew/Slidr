import type {
  Archetype,
  Background,
  Deck,
  Element,
  Layout,
  Placeholder,
  PlaceholderRole,
  RichText,
  Slide,
  Transition,
} from '@slidr/model';
import { CONTENT_TYPE, PML_NS, REL } from '../opc';
import { el, esc } from '../xml';
import type { ExportContext } from './context';
import { fillXml, presetGeometryXml, xfrmXml } from './drawing';
import { elementsXml, spTreeXml, type PartWriter } from './elements';
import { bodyPrXml, cultureOf, NO_PADDING, paragraphsXml } from './text';
import { timingXml, type ShapeIds } from './timing';

/*
 * The slide master, the layouts and the slides. The deck's layouts become layouts of the file:
 * what a layout draws on every slide of it (its decorations, its background) is drawn by the
 * layout there too, and its placeholders are PowerPoint's, so that a slide added in PowerPoint
 * gets them. A slide of no layout is on one with a title alone.
 */

/** The kind of placeholder of a role, as PowerPoint names it. */
const PH_TYPE: Partial<Record<PlaceholderRole, string>> = {
  title: 'title',
  subtitle: 'subTitle',
  body: 'body',
  quote: 'body',
  caption: 'body',
  attribution: 'body',
  number: 'body',
  image: 'pic',
  chart: 'chart',
  table: 'tbl',
  footer: 'ftr',
  slideNumber: 'sldNum',
};

const LAYOUT_TYPE: Partial<Record<Archetype, string>> = {
  hero: 'title',
  title: 'title',
  closing: 'title',
  section: 'secHead',
  blank: 'blank',
  text: 'obj',
  comparison: 'twoObj',
  textImage: 'picTx',
  table: 'tbl',
  chart: 'chart',
};

/** The words a placeholder shows in PowerPoint until something is typed in it. */
function prompt(role: PlaceholderRole, ctx: ExportContext): string {
  const prompts = ctx.options.prompts;
  if (role === 'slideNumber') return '#';
  if (role === 'title' || role === 'subtitle') return prompts?.title ?? 'Title';
  return prompts?.text ?? 'Text';
}

/** The placeholders of the file's layouts, by the deck's layout id: the `p:ph` of each one. */
export interface LayoutPart {
  path: string;
  /** The `p:ph` of each placeholder of the layout, in its order. */
  placeholders: { role: PlaceholderRole; ph: string }[];
}

function phXml(role: PlaceholderRole, index: number): string | undefined {
  const type = PH_TYPE[role];
  if (!type) return undefined;
  return el('p:ph', { type, idx: type === 'title' ? undefined : 100 + index });
}

/** A background as `p:bg`, and the shapes that draw what DrawingML's background cannot. */
export async function backgroundXml(
  background: Background | undefined,
  ctx: ExportContext,
  part: PartWriter,
): Promise<{ bg: string; shapes: string }> {
  if (!background) return { bg: '', shapes: '' };
  const slide = { w: ctx.deck.size.w, h: ctx.deck.size.h };
  const fill = await fillXml(background.fill, ctx, part.rels, slide);
  const bg = el('p:bg', {}, el('p:bgPr', {}, fill, el('a:effectLst')));
  if (background.blur) ctx.warn('blur');
  const veils: string[] = [];
  const veil = (fillOf: string) => {
    const id = part.nextId();
    veils.push(
      el(
        'p:sp',
        {},
        el(
          'p:nvSpPr',
          {},
          el('p:cNvPr', { id, name: `Background ${id - 1}` }),
          el('p:cNvSpPr'),
          el('p:nvPr', { userDrawn: 1 }),
        ),
        el(
          'p:spPr',
          {},
          xfrmXml({ x: 0, y: 0, w: slide.w, h: slide.h }),
          presetGeometryXml('rect'),
          fillOf,
          el('a:ln', {}, el('a:noFill')),
        ),
      ),
    );
  };
  if (background.dim) {
    veil(
      el(
        'a:solidFill',
        {},
        el(
          'a:srgbClr',
          { val: '000000' },
          el('a:alpha', { val: Math.round(background.dim * 100000) }),
        ),
      ),
    );
  }
  if (background.overlay && background.overlay.kind !== 'none') {
    veil(await fillXml(background.overlay, ctx, part.rels, slide));
  }
  return { bg, shapes: veils.join('') };
}

function idCounter(): () => number {
  let id = 1;
  return () => ++id;
}

/** The text of a placeholder of a layout, in the look of its text style. */
function placeholderShape(
  p: Placeholder,
  index: number,
  ctx: ExportContext,
  part: PartWriter,
): string | undefined {
  const ph = phXml(p.role, index);
  if (!ph) return undefined;
  const id = part.nextId();
  const content: RichText = {
    paragraphs: [
      {
        dir: 'auto',
        align: p.align ?? 'start',
        ...(p.styleRef ? { styleRef: p.styleRef } : {}),
        runs: [{ text: prompt(p.role, ctx) }],
      },
    ],
  };
  return el(
    'p:sp',
    {},
    el(
      'p:nvSpPr',
      {},
      el('p:cNvPr', { id, name: `${p.role} ${index + 1}` }),
      el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1 })),
      el('p:nvPr', {}, ph),
    ),
    el('p:spPr', {}, xfrmXml(p.frame)),
    p.role === 'image' || p.role === 'chart' || p.role === 'table'
      ? undefined
      : el(
          'p:txBody',
          {},
          bodyPrXml(
            { padding: NO_PADDING, vAlign: p.vAlign ?? 'top', autoFit: 'none', wrap: true },
            ctx.deck.meta.dir === 'rtl',
          ),
          el('a:lstStyle'),
          paragraphsXml(
            content,
            ctx,
            {
              theme: ctx.deck.theme,
              dir: ctx.deck.meta.dir,
              lang: ctx.deck.meta.lang,
              alpha: 1,
              ...(p.color ? { color: p.color } : {}),
              ...(p.styleRef ? { styleRef: p.styleRef } : {}),
            },
            part.rels,
          ),
        ),
  );
}

/** A layout of the deck as a layout of the file: its background, decorations, placeholders. */
export async function layoutXml(
  layout: Layout | undefined,
  path: string,
  masterPath: string,
  ctx: ExportContext,
): Promise<LayoutPart> {
  const rels = ctx.pkg.rels(path);
  rels.add(REL.slideMaster, masterPath);
  const part: PartWriter = { rels, nextId: idCounter() };
  const { bg, shapes } = await backgroundXml(layout?.background, ctx, part);
  const placeholders: LayoutPart['placeholders'] = [];
  const phShapes: string[] = [];
  // A slide of no layout (one the agent drew) is on "Title Only": its title is PowerPoint's.
  const own: Placeholder[] = layout?.placeholders ?? [
    {
      id: 'p_title',
      role: 'title',
      frame: { x: 120, y: 60, w: ctx.deck.size.w - 240, h: 160 },
      styleRef: 'title',
    },
  ];
  own.forEach((p, i) => {
    const ph = phXml(p.role, i);
    if (!ph) return;
    placeholders.push({ role: p.role, ph });
    const shape = placeholderShape(p, i, ctx, part);
    if (shape) phShapes.push(shape);
  });
  const decorations = layout ? await elementsXml(layout.decorations, ctx, part) : '';
  const type = layout ? (LAYOUT_TYPE[layout.archetype] ?? 'cust') : 'titleOnly';
  ctx.pkg.xml(
    path,
    `<p:sldLayout ${PML_NS} type="${type}" preserve="1">` +
      el(
        'p:cSld',
        { name: layout?.name ?? 'Title Only' },
        bg,
        spTreeXml(shapes + decorations + phShapes.join('')),
      ) +
      el('p:clrMapOvr', {}, el('a:masterClrMapping')) +
      '</p:sldLayout>',
    CONTENT_TYPE.slideLayout,
  );
  return { path, placeholders };
}

/** The level styles of the master's text: one level, in a text style of the theme. */
function levelStyles(ctx: ExportContext, styleRef: 'title' | 'body', levels: number): string {
  const style = ctx.deck.theme.textStyles[styleRef];
  const rtl = ctx.deck.meta.dir === 'rtl';
  const major = style.font === 'heading';
  const out: string[] = [];
  for (let level = 1; level <= levels; level++) {
    out.push(
      el(
        `a:lvl${level}pPr`,
        {
          marL: 0,
          indent: 0,
          algn: rtl ? 'r' : 'l',
          rtl: rtl ? 1 : 0,
          defTabSz: 914400,
        },
        el('a:lnSpc', {}, el('a:spcPct', { val: Math.round((style.lineHeight / 1.2) * 100000) })),
        el('a:spcBef', {}, el('a:spcPts', { val: 0 })),
        el('a:buNone'),
        el(
          'a:defRPr',
          { sz: Math.round(style.size * 50), b: style.weight >= 600 ? 1 : 0, kern: 1200 },
          el('a:solidFill', {}, el('a:schemeClr', { val: 'tx1' })),
          el('a:latin', { typeface: major ? '+mj-lt' : '+mn-lt' }),
          el('a:ea', { typeface: major ? '+mj-ea' : '+mn-ea' }),
          el('a:cs', { typeface: major ? '+mj-cs' : '+mn-cs' }),
        ),
      ),
    );
  }
  return out.join('');
}

/** The master: the theme's background, the standard placeholders, the text styles. */
export async function masterXml(
  path: string,
  themePath: string,
  layouts: readonly string[],
  ctx: ExportContext,
): Promise<void> {
  const rels = ctx.pkg.rels(path);
  const part: PartWriter = { rels, nextId: idCounter() };
  const ids = layouts.map((layout) => rels.add(REL.slideLayout, layout));
  rels.add(REL.theme, themePath);
  const { bg } = await backgroundXml(ctx.deck.theme.background, ctx, part);
  const W = ctx.deck.size.w;
  const H = ctx.deck.size.h;
  const masterPh = (
    type: string,
    idx: number | undefined,
    frame: { x: number; y: number; w: number; h: number },
    name: string,
  ) => {
    const id = part.nextId();
    return el(
      'p:sp',
      {},
      el(
        'p:nvSpPr',
        {},
        el('p:cNvPr', { id, name }),
        el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1 })),
        el('p:nvPr', {}, el('p:ph', { type, idx })),
      ),
      el('p:spPr', {}, xfrmXml(frame), presetGeometryXml('rect')),
      el(
        'p:txBody',
        {},
        el(
          'a:bodyPr',
          {
            vert: 'horz',
            lIns: 0,
            tIns: 0,
            rIns: 0,
            bIns: 0,
            anchor: type === 'title' ? 'b' : 't',
          },
          el('a:normAutofit'),
        ),
        el('a:lstStyle'),
        el(
          'a:p',
          {},
          el(
            'a:r',
            {},
            el('a:rPr', { lang: cultureOf(ctx.deck.meta.lang) }),
            `<a:t>${esc(name)}</a:t>`,
          ),
        ),
      ),
    );
  };
  const margin = 120;
  const shapes =
    masterPh('title', undefined, { x: margin, y: 80, w: W - 2 * margin, h: 180 }, 'Title') +
    masterPh('body', 1, { x: margin, y: 300, w: W - 2 * margin, h: 640 }, 'Text') +
    masterPh('dt', 10, { x: margin, y: H - 90, w: 360, h: 50 }, 'Date') +
    masterPh('ftr', 11, { x: W / 2 - 400, y: H - 90, w: 800, h: 50 }, 'Footer') +
    masterPh('sldNum', 12, { x: W - margin - 360, y: H - 90, w: 360, h: 50 }, '#');
  const other = levelStyles(ctx, 'body', 9);
  ctx.pkg.xml(
    path,
    `<p:sldMaster ${PML_NS}>` +
      el('p:cSld', {}, bg, spTreeXml(shapes)) +
      el('p:clrMap', {
        bg1: 'lt1',
        tx1: 'dk1',
        bg2: 'lt2',
        tx2: 'dk2',
        accent1: 'accent1',
        accent2: 'accent2',
        accent3: 'accent3',
        accent4: 'accent4',
        accent5: 'accent5',
        accent6: 'accent6',
        hlink: 'hlink',
        folHlink: 'folHlink',
      }) +
      el(
        'p:sldLayoutIdLst',
        {},
        ...ids.map((id, i) => el('p:sldLayoutId', { id: 2147483649 + i, 'r:id': id })),
      ) +
      el(
        'p:txStyles',
        {},
        el('p:titleStyle', {}, levelStyles(ctx, 'title', 1)),
        el('p:bodyStyle', {}, levelStyles(ctx, 'body', 9)),
        el('p:otherStyle', {}, other),
      ) +
      '</p:sldMaster>',
    CONTENT_TYPE.slideMaster,
  );
}

/* ---------------------------------------------------------------- transitions */

/** The side a transition comes from, as DrawingML names the four. */
function side(direction: Transition['direction'], dir: Deck['meta']['dir']): string {
  switch (direction) {
    case 'up':
      return 'u';
    case 'down':
      return 'd';
    case 'start':
      return dir === 'rtl' ? 'r' : 'l';
    case 'end':
    default:
      return dir === 'rtl' ? 'l' : 'r';
  }
}

export function transitionXml(transition: Transition | undefined, ctx: ExportContext): string {
  if (!transition || ctx.options.animations === false) return '';
  const dir = ctx.deck.meta.dir;
  const d = side(transition.direction, dir);
  const spd = transition.duration < 600 ? 'fast' : transition.duration < 900 ? 'med' : 'slow';
  let effect: string | undefined;
  switch (transition.type) {
    case 'none':
      effect = undefined;
      break;
    case 'fade':
    case 'crossfade':
      effect = el('p:fade');
      break;
    case 'flash':
      effect = el('p:fade', { thruBlk: 1 });
      break;
    case 'push':
      effect = el('p:push', { dir: d });
      break;
    case 'wipe':
      effect = el('p:wipe', { dir: d });
      break;
    case 'cover':
    case 'slide':
      effect = el('p:cover', { dir: d });
      break;
    case 'reveal':
      effect = el('p:pull', { dir: d });
      break;
    case 'zoom':
      effect = el('p:zoom');
      break;
    case 'split':
      effect = el('p:split', { orient: 'vert', dir: 'out' });
      break;
    case 'iris':
      effect = el('p:circle');
      break;
    case 'dissolve':
      effect = el('p:dissolve');
      break;
    case 'rotate':
      effect = el('p:wheel', { spokes: 1 });
      break;
    default:
      ctx.warn('transition-approximated', transition.type);
      effect = el('p:fade');
  }
  return el(
    'p:transition',
    {
      spd,
      advClick: transition.advance.onClick ? undefined : 0,
      advTm:
        transition.advance.afterMs !== undefined
          ? Math.round(transition.advance.afterMs)
          : undefined,
    },
    effect,
  );
}

/* ---------------------------------------------------------------- slides */

/** Whether a slide must not show its layout's drawings: one of them is a footer it has itself. */
function ownsFooter(slide: Slide, layout: Layout | undefined): boolean {
  if (!layout?.decorations.some((d) => d.role === 'footer')) return false;
  const says = (e: Element): boolean => {
    if (e.hidden) return false;
    if (e.type === 'group') return e.children.some(says);
    const words = e.type === 'text' || e.type === 'shape' ? e.content : undefined;
    return (
      e.role === 'footer' &&
      Boolean(words?.paragraphs.some((p) => p.runs.some((run) => run.text.trim() !== '')))
    );
  };
  return slide.elements.some(says);
}

export async function slideXml(
  slide: Slide,
  path: string,
  layout: Layout | undefined,
  layoutPart: LayoutPart,
  ctx: ExportContext,
  notesMaster: () => string,
): Promise<void> {
  const rels = ctx.pkg.rels(path);
  rels.add(REL.slideLayout, layoutPart.path);
  const used = new Set<number>();
  const shapeIds: ShapeIds = new Map();
  const part: PartWriter = {
    rels,
    nextId: idCounter(),
    slide,
    shapeIds,
    // The first text of a role stands in for the first free placeholder of that role.
    placeholder: (e) => {
      if (e.type !== 'text' || !e.role) return undefined;
      const at = layoutPart.placeholders.findIndex((p, i) => p.role === e.role && !used.has(i));
      if (at < 0) return undefined;
      used.add(at);
      return layoutPart.placeholders[at]!.ph;
    },
  };
  if (slide.css?.trim()) ctx.warn('slide-css');
  const { bg, shapes: veils } = await backgroundXml(slide.background, ctx, part);
  // A slide that has a footer of its own hides the layout's drawings, and draws the rest itself.
  const hideLayout = ownsFooter(slide, layout);
  const ownDecorations =
    hideLayout && layout
      ? await elementsXml(
          layout.decorations.filter((d) => d.role !== 'footer'),
          ctx,
          part,
        )
      : '';
  const layoutBackground =
    hideLayout && !slide.background && layout?.background
      ? await backgroundXml(layout.background, ctx, part)
      : undefined;
  const shapes = await elementsXml(slide.elements, ctx, part);
  const timing = ctx.options.animations === false ? '' : timingXml(slide, ctx, shapeIds);
  ctx.pkg.xml(
    path,
    `<p:sld ${PML_NS}${slide.hidden ? ' show="0"' : ''}${hideLayout ? ' showMasterSp="0"' : ''}>` +
      el(
        'p:cSld',
        { name: slide.name },
        bg || layoutBackground?.bg,
        spTreeXml(veils + (layoutBackground?.shapes ?? '') + ownDecorations + shapes),
      ) +
      el('p:clrMapOvr', {}, el('a:masterClrMapping')) +
      transitionXml(slide.transition, ctx) +
      timing +
      '</p:sld>',
    CONTENT_TYPE.slide,
  );
  if (slide.notes && slide.notes.paragraphs.some((p) => p.runs.some((r) => r.text.trim()))) {
    notesXml(slide.notes, path, notesMaster(), ctx);
  }
}

/** The notes of a slide, in a notes page of its own. */
function notesXml(notes: RichText, slidePath: string, master: string, ctx: ExportContext): void {
  const n = slidePath.match(/slide(\d+)\.xml$/)?.[1] ?? '1';
  const path = `ppt/notesSlides/notesSlide${n}.xml`;
  const rels = ctx.pkg.rels(path);
  rels.add(REL.notesMaster, master);
  rels.add(REL.slide, slidePath);
  ctx.pkg.rels(slidePath).add(REL.notesSlide, path);
  const rtl = ctx.deck.meta.dir === 'rtl';
  const paragraphs = notes.paragraphs
    .map((p) =>
      el(
        'a:p',
        {},
        el('a:pPr', { algn: rtl ? 'r' : 'l', rtl: rtl ? 1 : 0 }),
        ...p.runs.map((r) =>
          el(
            'a:r',
            {},
            el('a:rPr', { lang: cultureOf(ctx.deck.meta.lang), sz: 1200, dirty: 0 }),
            `<a:t>${esc(r.text)}</a:t>`,
          ),
        ),
      ),
    )
    .join('');
  ctx.pkg.xml(
    path,
    `<p:notes ${PML_NS}>` +
      el(
        'p:cSld',
        {},
        spTreeXml(
          el(
            'p:sp',
            {},
            el(
              'p:nvSpPr',
              {},
              el('p:cNvPr', { id: 2, name: 'Slide Image' }),
              el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1, noRot: 1, noChangeAspect: 1 })),
              el('p:nvPr', {}, el('p:ph', { type: 'sldImg' })),
            ),
            el('p:spPr'),
          ) +
            el(
              'p:sp',
              {},
              el(
                'p:nvSpPr',
                {},
                el('p:cNvPr', { id: 3, name: 'Notes' }),
                el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1 })),
                el('p:nvPr', {}, el('p:ph', { type: 'body', idx: 1 })),
              ),
              el('p:spPr'),
              el('p:txBody', {}, el('a:bodyPr'), el('a:lstStyle'), paragraphs),
            ),
        ),
      ) +
      el('p:clrMapOvr', {}, el('a:masterClrMapping')) +
      '</p:notes>',
    CONTENT_TYPE.notesSlide,
  );
}

/** The notes master: where a notes page puts the slide and the notes. */
export function notesMasterXml(path: string, themePath: string, ctx: ExportContext): void {
  ctx.pkg.rels(path).add(REL.theme, themePath);
  const notesW = 6858000;
  const ph = (
    id: number,
    type: string,
    idx: number | undefined,
    x: number,
    y: number,
    cx: number,
    cy: number,
    name: string,
  ) =>
    el(
      'p:sp',
      {},
      el(
        'p:nvSpPr',
        {},
        el('p:cNvPr', { id, name }),
        el('p:cNvSpPr', {}, el('a:spLocks', { noGrp: 1 })),
        el('p:nvPr', {}, el('p:ph', { type, idx })),
      ),
      el(
        'p:spPr',
        {},
        el('a:xfrm', {}, el('a:off', { x, y }), el('a:ext', { cx, cy })),
        presetGeometryXml('rect'),
      ),
      type === 'body'
        ? el(
            'p:txBody',
            {},
            el('a:bodyPr'),
            el('a:lstStyle'),
            el('a:p', {}, el('a:endParaRPr', { lang: 'en-US' })),
          )
        : undefined,
    );
  const shapes =
    ph(2, 'sldImg', 2, 381000, 685800, 6096000, 3429000, 'Slide Image') +
    ph(3, 'body', 3, 685800, 4400550, notesW - 2 * 685800, 3600450, 'Notes');
  ctx.pkg.xml(
    path,
    `<p:notesMaster ${PML_NS}>` +
      el('p:cSld', {}, spTreeXml(shapes)) +
      el('p:clrMap', {
        bg1: 'lt1',
        tx1: 'dk1',
        bg2: 'lt2',
        tx2: 'dk2',
        accent1: 'accent1',
        accent2: 'accent2',
        accent3: 'accent3',
        accent4: 'accent4',
        accent5: 'accent5',
        accent6: 'accent6',
        hlink: 'hlink',
        folHlink: 'folHlink',
      }) +
      el(
        'p:notesStyle',
        {},
        el(
          'a:lvl1pPr',
          { marL: 0, algn: 'l', rtl: 0 },
          el(
            'a:defRPr',
            { sz: 1200 },
            el('a:solidFill', {}, el('a:schemeClr', { val: 'tx1' })),
            el('a:latin', { typeface: '+mn-lt' }),
            el('a:cs', { typeface: '+mn-cs' }),
          ),
        ),
      ) +
      '</p:notesMaster>',
    CONTENT_TYPE.notesMaster,
  );
}
