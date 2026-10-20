import type {
  Color,
  Direction,
  Insets,
  ListInfo,
  Paragraph,
  RichText,
  Run,
  TextStyle,
  Theme,
} from '@slidr/model';
import { listMarkers, paragraphDirection, readsAsNumber } from '@slidr/renderer';
import { readCss } from '../color';
import { REL, type PartRels } from '../opc';
import { centipoints, emu } from '../units';
import { el, esc } from '../xml';
import type { ExportContext } from './context';
import { colorXml, solidFillXml } from './drawing';

/*
 * Rich text as DrawingML. Every paragraph and every run says all of its look: its size, font,
 * colour and weight, its alignment and spacing. Nothing is left to the styles of the master,
 * so the text is drawn as the deck draws it whatever PowerPoint would inherit.
 */

/** What the renderer takes from around the text: its style, its colour, the direction. */
export interface TextContext {
  theme: Theme;
  /** The direction a paragraph without letters takes: the deck's, or a table's. */
  dir: Direction;
  /** A table cell aligns `dir: auto` paragraphs to the table's direction (`alignTo`). */
  alignTo?: Direction;
  /** The text's colour where a run says none, in place of its style's. */
  color?: Color;
  /** A table's header row or first column: its weight. */
  weight?: number;
  /** A table's header row: its colour as CSS. */
  cssColor?: string;
  /** The element's opacity, which PowerPoint has only as the alpha of each colour. */
  alpha: number;
  /** The paragraph style without `styleRef`. */
  styleRef?: Paragraph['styleRef'];
  /** The number of the slide, for a slide-number field. */
  slideNumber?: boolean;
  /** The letters' own fill, outline and shadow, from the element's CSS (`readCssLook`). */
  glyphs?: { fill?: string; line?: string; effects?: string };
  lang: string;
}

/** The bullets the renderer draws at each level when a list says no glyph. */
const BULLETS = ['\u2022', '\u25e6', '\u25aa'];

const NUMBERING: Record<NonNullable<ListInfo['format']>, string> = {
  decimal: 'arabicPeriod',
  'decimal-paren': 'arabicParenR',
  'upper-roman': 'romanUcPeriod',
  'upper-alpha': 'alphaUcPeriod',
  'lower-alpha-paren': 'alphaLcParenR',
  'lower-alpha': 'alphaLcPeriod',
  'lower-roman': 'romanLcPeriod',
  hebrew: 'hebrew2Minus',
};
const LEVEL_NUMBERING = ['arabicPeriod', 'alphaLcPeriod', 'romanLcPeriod'];

/** Width of the renderer's marker column and its indent per level, in em (see `text.tsx`). */
const MARKER_EM = 1.25;
const LEVEL_EM = 1.5;

/** The language a run of text is in, as PowerPoint names one: `he-IL`, `en-US`. */
export function cultureOf(lang: string): string {
  const code = lang.toLowerCase();
  if (code.includes('-')) return lang;
  const cultures: Record<string, string> = {
    he: 'he-IL',
    en: 'en-US',
    ar: 'ar-SA',
    fr: 'fr-FR',
    de: 'de-DE',
    es: 'es-ES',
    ru: 'ru-RU',
    ja: 'ja-JP',
    zh: 'zh-CN',
    ko: 'ko-KR',
    hi: 'hi-IN',
    pt: 'pt-BR',
    it: 'it-IT',
    vi: 'vi-VN',
    tr: 'tr-TR',
    fa: 'fa-IR',
  };
  return cultures[code] ?? lang;
}

const HEBREW = /[\u0590-\u05ff\ufb1d-\ufb4f]/;
const ARABIC = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/;
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;

/** The typefaces of a run: the Latin one, the East Asian one and the complex-script one. */
function typefacesXml(
  family: string | undefined,
  role: TextStyle['font'],
  text: string,
  ctx: ExportContext,
  tc: TextContext,
): string {
  const pair = tc.theme.fonts[role];
  if (!family) {
    ctx.fonts.add(pair.latin);
    if (HEBREW.test(text)) ctx.fonts.add(pair.he);
    // The theme's fonts: the slide follows the theme as it does in the deck.
    const major = role === 'heading';
    return (
      el('a:latin', { typeface: major ? '+mj-lt' : '+mn-lt' }) +
      el('a:ea', { typeface: major ? '+mj-ea' : '+mn-ea' }) +
      el('a:cs', { typeface: major ? '+mj-cs' : '+mn-cs' })
    );
  }
  ctx.fonts.add(family);
  const counterpart = (lang: string) => ctx.options.counterpart?.(family, lang);
  // Letters the family has none of are drawn as the renderer draws them: in the counterpart, or
  // in the Hebrew family of the role behind it (`runFontStack`).
  const cs = HEBREW.test(text)
    ? (counterpart('he') ?? family)
    : ARABIC.test(text)
      ? (counterpart('ar') ?? family)
      : family;
  const ea = CJK.test(text) ? (counterpart(tc.lang) ?? family) : family;
  if (cs !== family) ctx.fonts.add(cs);
  if (ea !== family) ctx.fonts.add(ea);
  return (
    el('a:latin', { typeface: family }) +
    el('a:ea', { typeface: ea }) +
    el('a:cs', { typeface: cs })
  );
}

/** A link of a run or an element: to an address, or to a slide of the deck. */
export function linkXml(
  link: { kind: 'url' | 'slide'; target: string } | string,
  ctx: ExportContext,
  rels: PartRels,
): string | undefined {
  const value =
    typeof link === 'string' ? link : link.kind === 'slide' ? `#slide=${link.target}` : link.target;
  const slide = /^#slide=(.+)$/.exec(value)?.[1];
  if (slide) {
    const part = ctx.slideParts.get(slide);
    if (!part) return undefined;
    return el('a:hlinkClick', {
      'r:id': rels.add(REL.slide, part),
      action: 'ppaction://hlinksldjump',
    });
  }
  if (!/^(?:https?:|mailto:|tel:)/i.test(value.trim())) return undefined;
  return el('a:hlinkClick', { 'r:id': rels.add(REL.hyperlink, value.trim(), true) });
}

/** The look of a run, all of it, from its marks over its paragraph's style. */
function runPropsXml(
  run: Run,
  style: TextStyle,
  ctx: ExportContext,
  tc: TextContext,
  rels: PartRels,
  tag = 'a:rPr',
): string {
  const marks = run.marks ?? {};
  const size = marks.size ?? style.size;
  const weight = marks.weight ?? tc.weight ?? style.weight;
  const letterSpacing = marks.letterSpacing ?? style.letterSpacing;
  const textCase = marks.case ?? style.case;
  const color: Color | undefined =
    marks.color ?? tc.color ?? (tc.cssColor ? cssColor(tc.cssColor) : undefined) ?? style.color;
  const link = marks.link ? linkXml(marks.link, ctx, rels) : undefined;
  const lines = [marks.underline && 'u', marks.strike && 'strike'];
  return el(
    tag,
    {
      lang: cultureOf(tc.lang),
      sz: Math.max(100, Math.min(400000, centipoints(size))),
      b: weight >= 600 ? 1 : 0,
      i: marks.italic ? 1 : 0,
      u: lines.includes('u') ? 'sng' : undefined,
      strike: lines.includes('strike') ? 'sngStrike' : undefined,
      cap: textCase === 'upper' ? 'all' : undefined,
      spc: letterSpacing ? centipoints(letterSpacing) : undefined,
      baseline: marks.script === 'sup' ? 30000 : marks.script === 'sub' ? -25000 : undefined,
      dirty: 0,
    },
    tc.glyphs?.line,
    tc.glyphs?.fill ??
      (color ? (invisible(color) ? el('a:noFill') : solidFillXml(color, tc.alpha)) : undefined),
    tc.glyphs?.effects,
    marks.highlight ? el('a:highlight', {}, colorXml(marks.highlight)) : undefined,
    typefacesXml(marks.font, style.font, run.text, ctx, tc),
    link,
  );
}

/** A colour that paints nothing: `transparent`, or an alpha of 0 (the letters of an outline). */
function invisible(color: Color): boolean {
  if (color.alpha === 0) return true;
  if ('token' in color) return false;
  const value = readCss(color.value);
  return value !== undefined && !('token' in value) && value.a === 0;
}

/** A colour the renderer was given as CSS (a table style's header text). */
function cssColor(css: string): Color | undefined {
  const value = readCss(css);
  if (!value) return undefined;
  return 'token' in value ? value : { value: css };
}

/** The runs of a paragraph: text, line breaks and the slide-number field. */
function runsXml(
  p: Paragraph,
  style: TextStyle,
  ctx: ExportContext,
  tc: TextContext,
  rels: PartRels,
): string {
  const out: string[] = [];
  const caseOf = (run: Run) => run.marks?.case ?? style.case;
  for (const run of p.runs) {
    // PowerPoint has no lower case: the letters are written that way.
    const text = caseOf(run) === 'lower' ? run.text.toLowerCase() : run.text;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (i > 0) out.push(el('a:br', {}, runPropsXml(run, style, ctx, tc, rels)));
      if (line === '') return;
      if (tc.slideNumber) {
        out.push(
          el(
            'a:fld',
            { id: ctx.guid(), type: 'slidenum' },
            runPropsXml(run, style, ctx, tc, rels),
            `<a:t>${esc(line)}</a:t>`,
          ),
        );
        return;
      }
      out.push(
        el(
          'a:r',
          {},
          runPropsXml(run, style, ctx, tc, rels),
          `<a:t>${esc(line.replace(/\t/g, ' '))}</a:t>`,
        ),
      );
    });
  }
  return out.join('');
}

/** The largest size in a paragraph: CSS lays its lines out by it. */
function largestSize(p: Paragraph, style: TextStyle): number {
  return Math.max(style.size, ...p.runs.map((run) => run.marks?.size ?? style.size));
}

function paragraphXml(
  p: Paragraph,
  marker: string | undefined,
  ctx: ExportContext,
  tc: TextContext,
  rels: PartRels,
): string {
  const style = tc.theme.textStyles[p.styleRef ?? tc.styleRef ?? 'body'];
  const text = p.runs.map((run) => run.text).join('');
  const dir = paragraphDirection(p.dir, text, tc.dir);
  // A figure in a right-to-left deck sits on the deck's side, and reads left to right.
  const rtl = dir === 'rtl' && !readsAsNumber(p.dir, text, tc.dir);
  // The side a line is aligned to, as the renderer finds it (`alignment` in text.tsx).
  const sideDir: Direction =
    tc.alignTo && p.dir === 'auto' && (p.align === 'start' || p.align === 'end') ? tc.alignTo : dir;
  const algn =
    p.align === 'center'
      ? 'ctr'
      : p.align === 'justify'
        ? 'just'
        : (p.align === 'start') === (sideDir === 'ltr')
          ? 'l'
          : 'r';
  const lineHeight = p.lineHeight ?? style.lineHeight;
  const size = largestSize(p, style);
  const list = p.list;
  let bullet: string;
  let marL: number | undefined;
  let indent: number | undefined;
  if (list) {
    const em = style.size;
    marL = emu((list.level * LEVEL_EM + MARKER_EM) * em);
    indent = -emu(MARKER_EM * em);
    const first = p.runs[0];
    const color = list.color ?? first?.marks?.color;
    const parts = [
      color ? el('a:buClr', {}, colorXml(color, tc.alpha)) : undefined,
      list.size ? el('a:buSzPct', { val: list.size * 1000 }) : undefined,
    ];
    if (list.kind === 'number' && !list.glyph) {
      const type = list.format ? NUMBERING[list.format] : LEVEL_NUMBERING[list.level % 3]!;
      bullet =
        parts.join('') +
        el('a:buFont', { typeface: '+mj-lt' }) +
        el('a:buAutoNum', { type, startAt: list.start && list.start > 1 ? list.start : undefined });
    } else {
      const glyph = list.glyph ?? marker ?? BULLETS[list.level % BULLETS.length]!;
      bullet =
        parts.join('') + el('a:buFont', { typeface: 'Arial' }) + el('a:buChar', { char: glyph });
    }
  } else {
    bullet = el('a:buNone');
    if (p.indent) indent = emu(p.indent);
  }
  const pPr = el(
    'a:pPr',
    {
      marL: marL ?? 0,
      lvl: list ? Math.min(8, list.level) : undefined,
      indent: indent ?? 0,
      algn,
      rtl: rtl ? 1 : 0,
    },
    el(
      'a:lnSpc',
      {},
      el('a:spcPts', { val: Math.max(0, Math.round(centipoints(lineHeight * size))) }),
    ),
    el('a:spcBef', {}, el('a:spcPts', { val: centipoints(p.spaceBefore ?? 0) })),
    el('a:spcAft', {}, el('a:spcPts', { val: centipoints(p.spaceAfter ?? 0) })),
    bullet,
  );
  const last = p.runs.at(-1) ?? { text: '' };
  return el(
    'a:p',
    {},
    pPr,
    runsXml(p, style, ctx, tc, rels),
    runPropsXml(last, style, ctx, tc, rels, 'a:endParaRPr'),
  );
}

/** The paragraphs of a rich text. An empty text is one empty paragraph, as DrawingML wants. */
export function paragraphsXml(
  content: RichText | undefined,
  ctx: ExportContext,
  tc: TextContext,
  rels: PartRels,
): string {
  const paragraphs = content?.paragraphs ?? [];
  if (paragraphs.length === 0) {
    return paragraphXml(
      { dir: 'auto', align: 'start', runs: [{ text: '' }] },
      undefined,
      ctx,
      tc,
      rels,
    );
  }
  const markers = listMarkers(paragraphs);
  return paragraphs.map((p, i) => paragraphXml(p, markers[i], ctx, tc, rels)).join('');
}

export interface BodyOptions {
  padding: Insets;
  vAlign: 'top' | 'middle' | 'bottom';
  autoFit: 'none' | 'shrink' | 'growHeight';
  wrap: boolean;
  columns?: number;
}

/** The box the text is laid out in: its insets, where it sits, how it fits. */
export function bodyPrXml(options: BodyOptions, rtl: boolean): string {
  const { padding } = options;
  return el(
    'a:bodyPr',
    {
      rot: 0,
      spcFirstLastPara: 0,
      vertOverflow: 'overflow',
      horzOverflow: 'overflow',
      vert: 'horz',
      wrap: options.wrap ? 'square' : 'none',
      lIns: emu(padding.left),
      tIns: emu(padding.top),
      rIns: emu(padding.right),
      bIns: emu(padding.bottom),
      numCol: options.columns && options.columns > 1 ? options.columns : 1,
      spcCol: options.columns && options.columns > 1 ? emu(32) : undefined,
      rtlCol: rtl && options.columns && options.columns > 1 ? 1 : 0,
      anchor: options.vAlign === 'middle' ? 'ctr' : options.vAlign === 'bottom' ? 'b' : 't',
      anchorCtr: 0,
    },
    options.autoFit === 'shrink'
      ? el('a:normAutofit')
      : options.autoFit === 'growHeight'
        ? el('a:spAutoFit')
        : el('a:noAutofit'),
  );
}

export const NO_PADDING: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
