import type {
  Color,
  Insets,
  ListInfo,
  Marks,
  Paragraph,
  RichText,
  Run,
  TextStyleRef,
} from '@slidr/model';
import { LEVEL_EM, MARKER_EM } from '@slidr/renderer';
import { attr, boolAttr, child, children, intAttr, textOf, type XmlElement } from '../xml';
import { readColor, type ColorContext, type ThemeInfo } from './drawing';

/*
 * Text as the model has it, from DrawingML and everything a paragraph inherits: the master's
 * text styles, the placeholders of the master and of the layout, the shape's own list style and
 * the paragraph's properties, the latest winning. A run says all of its look in the deck: its
 * size, weight and colour, and its font where that is not the font its style already has.
 */

/** The look of a run, as DrawingML says it, before it is turned into marks. */
export interface RunProps {
  sz?: number;
  b?: boolean;
  i?: boolean;
  u?: string;
  strike?: string;
  cap?: string;
  spc?: number;
  baseline?: number;
  fill?: XmlElement;
  latin?: string;
  ea?: string;
  cs?: string;
  highlight?: XmlElement;
  link?: XmlElement;
  /** The outline of the letters, and their effects (a shadow). */
  ln?: XmlElement;
  effects?: XmlElement;
}

/** A level of a list style: the paragraph's properties and its runs' defaults. */
export interface LevelProps {
  algn?: string;
  rtl?: boolean;
  marL?: number;
  indent?: number;
  lnSpc?: XmlElement;
  spcBef?: XmlElement;
  spcAft?: XmlElement;
  bullet?: XmlElement;
  buClr?: XmlElement | 'text';
  buSzPct?: number;
  buFont?: string;
  run: RunProps;
}

/** Nine levels; any may be missing. */
export type ListStyle = (LevelProps | undefined)[];

const BULLETS = new Set(['a:buNone', 'a:buChar', 'a:buAutoNum', 'a:buBlip']);

export function readRunProps(rPr: XmlElement | undefined): RunProps {
  if (!rPr) return {};
  const out: RunProps = {};
  const sz = intAttr(rPr, 'sz');
  if (sz !== undefined) out.sz = sz;
  const b = boolAttr(rPr, 'b');
  if (b !== undefined) out.b = b;
  const i = boolAttr(rPr, 'i');
  if (i !== undefined) out.i = i;
  const u = attr(rPr, 'u');
  if (u !== undefined) out.u = u;
  const strike = attr(rPr, 'strike');
  if (strike !== undefined) out.strike = strike;
  const cap = attr(rPr, 'cap');
  if (cap !== undefined) out.cap = cap;
  const spc = intAttr(rPr, 'spc');
  if (spc !== undefined) out.spc = spc;
  const baseline = intAttr(rPr, 'baseline');
  if (baseline !== undefined) out.baseline = baseline;
  for (const c of children(rPr)) {
    if (
      c.name === 'a:solidFill' ||
      c.name === 'a:gradFill' ||
      c.name === 'a:noFill' ||
      c.name === 'a:pattFill'
    )
      out.fill = c;
    else if (c.name === 'a:latin') out.latin = attr(c, 'typeface');
    else if (c.name === 'a:ea') out.ea = attr(c, 'typeface');
    else if (c.name === 'a:cs') out.cs = attr(c, 'typeface');
    else if (c.name === 'a:highlight') out.highlight = c;
    else if (c.name === 'a:hlinkClick') out.link = c;
    else if (c.name === 'a:ln') out.ln = c;
    else if (c.name === 'a:effectLst') out.effects = c;
  }
  // An empty typeface says nothing.
  for (const key of ['latin', 'ea', 'cs'] as const) if (!out[key]) delete out[key];
  return out;
}

export function readLevel(pPr: XmlElement | undefined): LevelProps | undefined {
  if (!pPr) return undefined;
  const out: LevelProps = { run: readRunProps(child(pPr, 'a:defRPr')) };
  const algn = attr(pPr, 'algn');
  if (algn) out.algn = algn;
  const rtl = boolAttr(pPr, 'rtl');
  if (rtl !== undefined) out.rtl = rtl;
  const marL = intAttr(pPr, 'marL');
  if (marL !== undefined) out.marL = marL;
  const indent = intAttr(pPr, 'indent');
  if (indent !== undefined) out.indent = indent;
  for (const c of children(pPr)) {
    if (c.name === 'a:lnSpc') out.lnSpc = c;
    else if (c.name === 'a:spcBef') out.spcBef = c;
    else if (c.name === 'a:spcAft') out.spcAft = c;
    else if (BULLETS.has(c.name)) out.bullet = c;
    else if (c.name === 'a:buClr') out.buClr = c;
    else if (c.name === 'a:buClrTx') out.buClr = 'text';
    else if (c.name === 'a:buSzPct') out.buSzPct = intAttr(c, 'val');
    else if (c.name === 'a:buFont') out.buFont = attr(c, 'typeface');
  }
  return out;
}

/** Every level of a list style (`a:lstStyle`, a master's `p:titleStyle`, ...). */
export function readListStyle(el: XmlElement | undefined): ListStyle {
  const base = readLevel(child(el, 'a:defPPr'));
  return Array.from({ length: 9 }, (_, i) => {
    const level = readLevel(child(el, `a:lvl${i + 1}pPr`));
    return base && level ? mergeLevel(base, level) : (level ?? base);
  });
}

export function mergeRun(a: RunProps, b: RunProps): RunProps {
  return { ...a, ...b };
}

export function mergeLevel(a: LevelProps | undefined, b: LevelProps | undefined): LevelProps {
  if (!a) return b ?? { run: {} };
  if (!b) return a;
  return { ...a, ...b, run: mergeRun(a.run, b.run) };
}

/** What text is read against: its colours, the theme's fonts, the slide's scale. */
export interface TextContext {
  colors: ColorContext;
  theme: ThemeInfo;
  /** Slide pixels in a point. */
  pxPerPt: number;
  /** The link of a run to an address or a slide (`#slide=<id>`), from its relationship id. */
  link: (rId: string, action: string | undefined) => string | undefined;
  /** The font a shape style says (`minor`, `major`). */
  fontRef?: 'minor' | 'major';
  /** The size of a text style of the deck's theme, in slide pixels. */
  styleSize?: (ref: TextStyleRef) => number;
}

/** The size of text nobody says a size of: 18pt. */
const DEFAULT_SIZE = 1800;

const HEBREW = /[\u0590-\u05ff\ufb1d-\ufb4f]/;
const ARABIC = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/;
const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\uff00-\uffef]/;
const LATIN_LETTER = /[A-Za-z\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff]/;

type Script = 'latin' | 'cs' | 'ea';

function scriptOf(char: string): Script | undefined {
  if (HEBREW.test(char) || ARABIC.test(char)) return 'cs';
  if (CJK.test(char)) return 'ea';
  if (LATIN_LETTER.test(char)) return 'latin';
  return undefined;
}

/** A theme font reference (`+mn-lt`) as the family it names. */
function resolveFace(
  face: string | undefined,
  theme: ThemeInfo,
  text: string,
  script: Script,
): string | undefined {
  if (!face) return undefined;
  const m = /^\+(mj|mn)-(lt|ea|cs)$/.exec(face);
  if (!m) return face;
  const set = m[1] === 'mj' ? theme.major : theme.minor;
  if (m[2] === 'lt') return set.latin || undefined;
  if (m[2] === 'ea')
    return set.ea || set.scripts.Jpan || set.scripts.Hans || set.latin || undefined;
  // A complex-script font: the theme's, else the one of the script the text is in.
  return (
    set.cs ||
    (HEBREW.test(text) ? set.scripts.Hebr : ARABIC.test(text) ? set.scripts.Arab : undefined) ||
    (script === 'cs' ? set.scripts.Hebr : undefined) ||
    set.latin ||
    undefined
  );
}

/** The family each part of a run's text is drawn in, as PowerPoint picks it by script. */
function fontsOf(
  text: string,
  props: RunProps,
  tc: TextContext,
): { text: string; font?: string }[] {
  const ref = tc.fontRef === 'major' ? '+mj' : '+mn';
  const face = (script: Script, part: string) =>
    script === 'cs'
      ? resolveFace(props.cs ?? `${ref}-cs`, tc.theme, part, 'cs')
      : script === 'ea'
        ? resolveFace(props.ea ?? `${ref}-ea`, tc.theme, part, 'ea')
        : resolveFace(props.latin ?? `${ref}-lt`, tc.theme, part, 'latin');
  // Split where the script changes; what belongs to no script stays with the part before it.
  const parts: { script: Script; text: string }[] = [];
  for (const char of text) {
    const script = scriptOf(char);
    const last = parts.at(-1);
    if (!last) parts.push({ script: script ?? 'latin', text: char });
    else if (script === undefined || script === last.script) last.text += char;
    else if (last.text.trim() === '' && parts.length === 1) {
      last.script = script;
      last.text += char;
    } else parts.push({ script, text: char });
  }
  const out: { text: string; font?: string }[] = [];
  for (const part of parts) {
    const font = face(part.script, part.text);
    const last = out.at(-1);
    if (last && last.font === font) last.text += part.text;
    else out.push({ text: part.text, ...(font ? { font } : {}) });
  }
  return out.length ? out : [{ text }];
}

/** The marks of a run, all of them said. */
function marksOf(props: RunProps, tc: TextContext): Marks {
  const marks: Marks = {};
  const size = ((props.sz ?? DEFAULT_SIZE) / 100) * tc.pxPerPt;
  marks.size = Math.max(1, Math.round(size * 100) / 100);
  marks.weight = props.b ? 700 : 400;
  if (props.i) marks.italic = true;
  if (props.u && props.u !== 'none') marks.underline = true;
  if (props.strike && props.strike !== 'noStrike') marks.strike = true;
  if (props.cap === 'all') marks.case = 'upper';
  if (props.spc) marks.letterSpacing = Math.round((props.spc / 100) * tc.pxPerPt * 100) / 100;
  if (props.baseline) marks.script = props.baseline > 0 ? 'sup' : 'sub';
  let color: Color | undefined;
  if (props.fill?.name === 'a:solidFill') color = readColor(props.fill, tc.colors)?.color;
  else if (props.fill?.name === 'a:gradFill') {
    color = readColor(child(child(props.fill, 'a:gsLst'), 'a:gs'), tc.colors)?.color;
  } else if (props.fill?.name === 'a:pattFill')
    color = readColor(child(props.fill, 'a:fgClr'), tc.colors)?.color;
  else if (props.fill?.name === 'a:noFill') color = { value: 'transparent' };
  if (color) marks.color = color;
  const highlight = props.highlight ? readColor(props.highlight, tc.colors)?.color : undefined;
  if (highlight) marks.highlight = highlight;
  if (props.link) {
    const rId = attr(props.link, 'r:id');
    const target = tc.link(rId ?? '', attr(props.link, 'action'));
    if (target) marks.link = target;
  }
  return marks;
}

/** Runs of a paragraph's content, each part of it in the family its script is drawn in. */
function runsOf(text: string, props: RunProps, tc: TextContext): Run[] {
  const marks = marksOf(props, tc);
  return fontsOf(text, props, tc).map((part) => ({
    text: part.text,
    marks: part.font ? { ...marks, font: part.font } : marks,
  }));
}

/** Wingdings and Symbol bullets, as the characters they are drawn as. */
const SYMBOL_BULLETS: Record<string, string> = {
  l: '\u25cf',
  n: '\u25a0',
  q: '\u2751',
  v: '\u2756',
  u: '\u25c6',
  o: '\u25a1',
  '\u00d8': '\u27a2',
  '\u00fc': '\u2713',
  '\u00a7': '\u25aa',
  '\u00e8': '\u2794',
  '\u00e0': '\u2794',
  '\u00b7': '\u2022',
  '\uf0b7': '\u2022',
  '\uf0a7': '\u25aa',
  '\uf06c': '\u25cf',
  '\uf0d8': '\u27a2',
};

const NUMBERING: Record<string, NonNullable<ListInfo['format']>> = {
  arabicPeriod: 'decimal',
  arabicPlain: 'decimal',
  arabicParenR: 'decimal-paren',
  arabicParenBoth: 'decimal-paren',
  romanUcPeriod: 'upper-roman',
  romanUcParenR: 'upper-roman',
  alphaUcPeriod: 'upper-alpha',
  alphaUcParenR: 'upper-alpha',
  alphaLcParenR: 'lower-alpha-paren',
  alphaLcParenBoth: 'lower-alpha-paren',
  alphaLcPeriod: 'lower-alpha',
  romanLcPeriod: 'lower-roman',
  romanLcParenR: 'lower-roman',
  hebrew2Minus: 'hebrew',
};

function listOf(
  level: number,
  props: LevelProps,
  tc: TextContext,
  firstColor: Color | undefined,
): ListInfo | undefined {
  const bullet = props.bullet;
  if (!bullet || bullet.name === 'a:buNone') return undefined;
  const list: ListInfo = { kind: bullet.name === 'a:buAutoNum' ? 'number' : 'bullet', level };
  if (bullet.name === 'a:buChar') {
    const char = attr(bullet, 'char') ?? '\u2022';
    const font = props.buFont ?? '';
    const symbol = /wingdings|symbol|webdings/i.test(font);
    list.glyph = (symbol ? SYMBOL_BULLETS[char] : undefined) ?? SYMBOL_BULLETS[char] ?? char;
    if (/[\uf000-\uf0ff]/.test(list.glyph)) list.glyph = '\u2022';
  }
  if (bullet.name === 'a:buAutoNum') {
    const format = NUMBERING[attr(bullet, 'type') ?? 'arabicPeriod'];
    if (format) list.format = format;
    const start = intAttr(bullet, 'startAt');
    if (start && start > 1) list.start = Math.min(9999, start);
  }
  if (props.buClr && props.buClr !== 'text') {
    const c = readColor(props.buClr, tc.colors)?.color;
    if (c) list.color = c;
  } else if (firstColor) list.color = firstColor;
  if (props.buSzPct && props.buSzPct !== 100000) {
    list.size = Math.min(400, Math.max(25, Math.round(props.buSzPct / 1000)));
  }
  return list;
}

/** A spacing (`a:spcPts` or `a:spcPct` of a line) in slide pixels, for text of `size` pixels. */
function spacing(el: XmlElement | undefined, size: number, pxPerPt: number): number | undefined {
  const pts = intAttr(child(el, 'a:spcPts'), 'val');
  if (pts !== undefined) return Math.round((pts / 100) * pxPerPt * 100) / 100;
  const pct = intAttr(child(el, 'a:spcPct'), 'val');
  if (pct !== undefined) return Math.round((pct / 100000) * size * 1.2 * 100) / 100;
  return undefined;
}

/** PowerPoint's single spacing in a CSS line height: about 1.2 of the size. */
const SINGLE = 1.2;

export interface ReadText {
  content: RichText;
  /** Whether any paragraph is right to left. */
  rtl: boolean;
  /**
   * The outline and the effects of the letters, as the first run with text says them: the model
   * has them for all the text of a box (TXT-11), as CSS of its element.
   */
  glyphs: { ln?: XmlElement; effects?: XmlElement };
  /**
   * How much further from the start side of the box the text begins in PowerPoint than the
   * renderer begins it: the paragraphs' left margin (`marL`), less the column a list's markers
   * already take. The model has no margin of a paragraph, so the box's padding takes it
   * (`withMargin`). Undefined when the paragraphs run both ways.
   */
  margin?: { side: 'left' | 'right'; px: number };
}

/** A box's padding with the text's margin added on its side; never below nothing. */
export function withMargin(padding: Insets, margin: ReadText['margin']): Insets {
  if (!margin?.px) return padding;
  const side = margin.side;
  return { ...padding, [side]: Math.max(0, Math.round((padding[side] + margin.px) * 100) / 100) };
}

/**
 * The paragraphs of a text body. `inherited` are the list styles under the shape's own, lowest
 * first.
 */
export function readParagraphs(
  txBody: XmlElement | undefined,
  inherited: readonly ListStyle[],
  tc: TextContext,
  styleRef?: Paragraph['styleRef'],
  /** The padding of the box, which a negative `margin` takes no more than. */
  padding?: Insets,
): ReadText {
  const own = readListStyle(child(txBody, 'a:lstStyle'));
  const paragraphs: Paragraph[] = [];
  let rtl = false;
  let glyphs: ReadText['glyphs'] | undefined;
  const px = (emu: number) => Math.round(emu * (tc.pxPerPt / 12700) * 100) / 100;
  /** Where each paragraph's text begins in PowerPoint, past where the renderer begins it. */
  const starts: { start: number; indent: number; text: boolean }[] = [];
  for (const p of children(txBody, 'a:p')) {
    const pPr = child(p, 'a:pPr');
    const level = Math.min(8, Math.max(0, intAttr(pPr, 'lvl') ?? 0));
    let props: LevelProps = { run: {} };
    for (const style of inherited) props = mergeLevel(props, style[level]);
    props = mergeLevel(props, own[level]);
    props = mergeLevel(props, readLevel(pPr));
    const runs: Run[] = [];
    for (const node of children(p)) {
      if (node.name === 'a:r' || node.name === 'a:fld') {
        const text = textOf(child(node, 'a:t'));
        if (text === '') continue;
        const runProps = mergeRun(props.run, readRunProps(child(node, 'a:rPr')));
        if (!glyphs && text.trim()) {
          glyphs = {
            ...(runProps.ln ? { ln: runProps.ln } : {}),
            ...(runProps.effects ? { effects: runProps.effects } : {}),
          };
        }
        runs.push(...runsOf(text.replaceAll('\v', '\n'), runProps, tc));
      } else if (node.name === 'a:br') {
        const runProps = mergeRun(props.run, readRunProps(child(node, 'a:rPr')));
        const last = runs.at(-1);
        if (last) last.text += '\n';
        else runs.push(...runsOf('\n', runProps, tc));
      }
    }
    const endProps = mergeRun(props.run, readRunProps(child(p, 'a:endParaRPr')));
    if (runs.length === 0) runs.push({ text: '', marks: marksOf(endProps, tc) });
    // Runs next to each other with the same marks are one run.
    const merged: Run[] = [];
    for (const run of runs) {
      const last = merged.at(-1);
      if (last && JSON.stringify(last.marks) === JSON.stringify(run.marks)) last.text += run.text;
      else merged.push({ ...run });
    }
    const dir: Paragraph['dir'] = props.rtl ? 'rtl' : 'ltr';
    if (props.rtl) rtl = true;
    const physical = props.algn ?? 'l';
    const align: Paragraph['align'] =
      physical === 'ctr'
        ? 'center'
        : physical === 'just' ||
            physical === 'dist' ||
            physical === 'justLow' ||
            physical === 'thaiDist'
          ? 'justify'
          : (physical === 'r') === (dir === 'rtl')
            ? 'start'
            : 'end';
    const largest = Math.max(
      ...merged.map((r) => r.marks?.size ?? (DEFAULT_SIZE / 100) * tc.pxPerPt),
    );
    const paragraph: Paragraph = { dir, align, runs: merged };
    if (styleRef) paragraph.styleRef = styleRef;
    // PowerPoint spaces the lines by the size of their text; CSS by that and by the size of the
    // paragraph's text style (the strut of its lines), whichever is larger. The line height is
    // the multiple of the larger that gives PowerPoint's spacing, as the export reads it
    // (`largestSize`): text smaller than its style is not spaced as the style.
    const strut = tc.styleSize?.(styleRef ?? 'body') ?? 0;
    const pct = intAttr(child(props.lnSpc, 'a:spcPct'), 'val');
    const pts = intAttr(child(props.lnSpc, 'a:spcPts'), 'val');
    const pitch =
      pct !== undefined
        ? (pct / 100000) * SINGLE * largest
        : pts !== undefined
          ? (pts / 100) * tc.pxPerPt
          : SINGLE * largest;
    paragraph.lineHeight = Math.round((pitch / Math.max(largest, strut)) * 1000) / 1000;
    if (paragraph.lineHeight <= 0) paragraph.lineHeight = SINGLE;
    const before = spacing(props.spcBef, largest, tc.pxPerPt);
    if (before) paragraph.spaceBefore = before;
    const after = spacing(props.spcAft, largest, tc.pxPerPt);
    if (after) paragraph.spaceAfter = after;
    const list = listOf(level, props, tc, merged[0]?.marks?.color);
    if (list) paragraph.list = list;
    const text = merged.some((r) => r.text.trim() !== '');
    // An item's text begins a column of markers in from the start, in its style's size.
    const column = list ? (level * LEVEL_EM + MARKER_EM) * strut : 0;
    starts.push({ start: px(props.marL ?? 0) - column, indent: px(props.indent ?? 0), text });
    paragraphs.push(paragraph);
  }
  // PowerPoint leaves out the space before the first paragraph of a box.
  if (paragraphs[0]) delete paragraphs[0].spaceBefore;
  // The margin all the paragraphs have is the box's; what one has beyond it, its first line's.
  const shown = paragraphs.filter((_, i) => starts[i]!.text);
  const dirs = new Set(shown.map((p) => p.dir));
  let margin: ReadText['margin'];
  if (tc.styleSize && dirs.size === 1) {
    const side = dirs.has('rtl') ? 'right' : 'left';
    const least = Math.min(...starts.filter((s) => s.text).map((s) => s.start));
    const common = Math.max(least, -(padding?.[side] ?? 0));
    if (Math.abs(common) >= 0.5) margin = { side, px: Math.round(common * 100) / 100 };
    for (const [i, p] of paragraphs.entries()) {
      const { start, indent } = starts[i]!;
      const first = Math.round((start - (margin?.px ?? 0) + indent) * 100) / 100;
      if (!p.list && first) p.indent = first;
    }
  } else {
    for (const [i, p] of paragraphs.entries()) {
      const { start, indent } = starts[i]!;
      if (!p.list && indent && !start) p.indent = indent;
    }
  }
  return { content: { paragraphs }, rtl, glyphs: glyphs ?? {}, ...(margin ? { margin } : {}) };
}

/** The box text is laid out in. */
export interface BodyProps {
  padding: Insets;
  vAlign: 'top' | 'middle' | 'bottom';
  autoFit: 'none' | 'shrink' | 'growHeight';
  wrap: boolean;
  columns?: number;
  /** Text written top to bottom: `vert` (a quarter turn clockwise) or `vert270`. */
  vertical?: 'vert' | 'vert270';
}

/** The text box of a body, from its `a:bodyPr` and those of the placeholders it inherits. */
export function readBody(bodies: readonly (XmlElement | undefined)[], pxPerEmu: number): BodyProps {
  const get = (name: string) => {
    let value: string | undefined;
    for (const b of bodies) value = attr(b, name) ?? value;
    return value;
  };
  let fit: BodyProps['autoFit'] = 'none';
  for (const b of bodies) {
    if (child(b, 'a:normAutofit')) fit = 'shrink';
    else if (child(b, 'a:spAutoFit')) fit = 'growHeight';
    else if (child(b, 'a:noAutofit')) fit = 'none';
  }
  const inset = (name: string, fallback: number) => {
    const v = get(name);
    const n = v === undefined ? fallback : Number(v);
    return Math.max(0, Math.round((Number.isFinite(n) ? n : fallback) * pxPerEmu * 100) / 100);
  };
  const anchor = get('anchor');
  const vert = get('vert');
  const columns = Number(get('numCol') ?? 1);
  return {
    padding: {
      left: inset('lIns', 91440),
      right: inset('rIns', 91440),
      top: inset('tIns', 45720),
      bottom: inset('bIns', 45720),
    },
    vAlign: anchor === 'ctr' ? 'middle' : anchor === 'b' ? 'bottom' : 'top',
    autoFit: fit,
    wrap: get('wrap') !== 'none',
    ...(columns > 1 ? { columns: Math.min(6, columns) } : {}),
    ...(vert === 'vert' || vert === 'eaVert' || vert === 'wordArtVertRtl'
      ? { vertical: 'vert' as const }
      : vert === 'vert270'
        ? { vertical: 'vert270' as const }
        : {}),
  };
}

/** Whether a text body has any text in it. */
export function hasText(txBody: XmlElement | undefined): boolean {
  return children(txBody, 'a:p').some((p) =>
    children(p).some(
      (n) => (n.name === 'a:r' || n.name === 'a:fld') && textOf(child(n, 'a:t')).trim() !== '',
    ),
  );
}
