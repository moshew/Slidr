import {
  RichText,
  type Color,
  type Direction,
  type ListInfo,
  type Marks,
  type Paragraph,
  type Run,
} from '@slidr/model';
import { resolveDirection } from './bidi';
import { BOLD_FROM, MAX_LIST_LEVEL, type ParagraphProps } from './format';
import { cleanMarks, normalizeRichText } from './richTextDoc';

/*
 * Pasting into slide text (WG4-T06, TXT-13, SEC-06). What comes from the clipboard never reaches
 * the document as markup: it is read into a `RichText`, which has room only for text, the marks
 * and the paragraph fields of the model. Scripts, event handlers, styles and embedded content have
 * nowhere to go.
 *
 * The default paste matches the destination: it keeps the structure (paragraphs, line breaks,
 * lists and their levels) and bold, italic, underline, strike, sub / superscript and links, and
 * drops fonts, sizes and colours. See docs/adr/ADR-013-text-formatting.md.
 *
 * "Keep the source's formatting" also keeps what the source states of its font, size, weight,
 * colour, alignment and direction (`htmlToSourceText`, `keepSource`). It reads the same detached
 * document, and still only text and a closed list of properties.
 */

/** The clipboard format Slidr writes next to HTML and plain text: the copied `RichText`, as JSON. */
export const SLIDR_TEXT_MIME = 'application/x-slidr-richtext+json';

const BOLD = 700;
const REGULAR = 400;

/** Elements whose content is not text of the page. */
const SKIPPED = new Set([
  'script',
  'style',
  'head',
  'title',
  'meta',
  'link',
  'base',
  'noscript',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'canvas',
  'video',
  'audio',
  'img',
  'picture',
  'source',
  'input',
  'textarea',
  'select',
  'button',
]);

/** Elements that start a new line of their own. */
const BLOCKS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'center',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'tbody',
  'tfoot',
  'thead',
  'tr',
  'ul',
]);

/** Elements that hold only other elements: white space directly inside them is never drawn. */
const STRUCTURAL = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'ul', 'ol', 'dl']);

const TAG_MARKS: Record<string, Marks> = {
  b: { weight: BOLD },
  strong: { weight: BOLD },
  i: { italic: true },
  em: { italic: true },
  cite: { italic: true },
  dfn: { italic: true },
  var: { italic: true },
  u: { underline: true },
  ins: { underline: true },
  s: { strike: true },
  strike: { strike: true },
  del: { strike: true },
  sup: { script: 'sup' },
  sub: { script: 'sub' },
};

/**
 * A link to a slide of the deck, as the `link` mark holds it (TXT-09): `#slide=<slideId>`. The
 * renderer draws it as a link the runtime follows; it is never an address a browser opens.
 */
const SLIDE_LINK = /^#slide=([\w.:-]+)$/;

export function slideLink(slideId: string): string {
  return `#slide=${slideId}`;
}

/** The slide a link goes to, when it is a link to a slide. */
export function linkedSlide(link: string | null | undefined): string | undefined {
  return SLIDE_LINK.exec(link ?? '')?.[1];
}

/**
 * A link a slide may carry: one that opens a page or writes a mail, or one to a slide of the deck
 * in exactly its own form; never one that runs code.
 */
export function safeLink(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  // Browsers ignore whitespace and control characters inside the scheme.
  const compact = Array.from(href)
    .filter((char) => char.charCodeAt(0) > 0x20)
    .join('');
  if (SLIDE_LINK.test(compact)) return compact;
  return /^(?:https?:|mailto:|tel:)/i.test(compact) ? compact : undefined;
}

/**
 * The link for an address as a person types it: `example.com` is a page and gets `https://`, and
 * `name@example.com` is a mail. Undefined for what `safeLink` refuses, and for what is no address.
 */
export function typedLink(input: string): string | undefined {
  const text = input.trim();
  if (!text) return undefined;
  // A scheme of any kind is taken as typed, and refused below unless it is one a slide may
  // carry. `localhost:1420` is a host and a port, not a scheme.
  const hasScheme =
    /^(?:https?|mailto|tel):/i.test(text) || /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(text);
  const isMail = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(text);
  const address = hasScheme
    ? text
    : isMail
      ? `mailto:${text}`
      : `https://${text.replace(/^\/\//, '')}`;
  const link = safeLink(address);
  if (!link || linkedSlide(link)) return undefined;
  return /^https?:/i.test(link) && !URL.canParse(link) ? undefined : link;
}

/** The declarations of a `style` attribute, by lower-case property name. */
function declarations(style: string | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (style ?? '').split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    out.set(
      part.slice(0, colon).trim().toLowerCase(),
      part
        .slice(colon + 1)
        .trim()
        .toLowerCase(),
    );
  }
  return out;
}

interface Context {
  marks: Marks;
  /** Nesting depth of lists around this node, and the kind of the innermost. */
  list?: { kind: ListInfo['kind']; level: number };
  /** White space is kept as it is (`pre`, `white-space: pre`). */
  pre: boolean;
  /** Keeping the source's formatting: the font size around this node, in the source's pixels. */
  size: number;
  /** Keeping the source's formatting: the alignment and the direction the source states. */
  align?: SourceAlign;
  dir?: Direction;
}

/* ---------------------------------------------------------------- what the source states */

/**
 * What the place a text is pasted into gives the reader that keeps the source's formatting. The
 * reader itself stays pure: which fonts can be drawn, and what a CSS colour is, are asked here.
 */
export interface SourceContext {
  /**
   * Slide pixels for one pixel of the source. A slide is 1920 wide and stands for a page 13⅓
   * inches wide, as in other presentation editors, where a browser has 1280 pixels: 1.5. Text
   * of 12pt in a document is 12pt on the slide.
   */
  scale: number;
  /** Of the families of a `font-family` list, the first this deck can be drawn in, by its own name. */
  font: (families: readonly string[]) => string | undefined;
  /** A CSS colour as a colour of the model; undefined for what states no colour of its own. */
  color: (css: string) => Color | undefined;
}

/** The alignment as CSS says it: sides, or the start and the end of the line. */
export type SourceAlign = 'left' | 'right' | 'center' | 'justify' | 'start' | 'end';

/** A paragraph as its source states it. What it does not state, the destination gives. */
export interface SourceParagraph {
  runs: Run[];
  list?: ListInfo;
  dir?: Direction;
  align?: SourceAlign;
}

export interface SourceText {
  paragraphs: SourceParagraph[];
}

/** The properties that are read from the source. Nothing else of its styling is. */
const SOURCE_PROPERTIES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'color',
  'text-align',
  'direction',
  'text-decoration-line',
  'vertical-align',
] as const;

/** What a browser gives a heading by itself: its size, against the text around it, and its weight. */
const HEADING_SIZES: Record<string, string> = {
  h1: '2em',
  h2: '1.5em',
  h3: '1.17em',
  h4: '1em',
  h5: '0.83em',
  h6: '0.67em',
};

/** The size of text nobody gave a size: what relative sizes of the source are relative to. */
const ROOT_SIZE = 16;

/** CSS pixels of the absolute units. */
const UNIT_PIXELS: Record<string, number> = {
  px: 1,
  pt: 4 / 3,
  pc: 16,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  q: 96 / 101.6,
};

const SIZE_KEYWORDS: Record<string, number> = {
  'xx-small': 9,
  'x-small': 10,
  small: 13,
  medium: 16,
  large: 18,
  'x-large': 24,
  'xx-large': 32,
  'xxx-large': 48,
};

/** A `font-size` in the source's pixels; `base` is the size around it. Undefined for what is no size. */
export function sourceFontSize(value: string, base: number): number | undefined {
  const text = value.trim().toLowerCase();
  if (text in SIZE_KEYWORDS) return SIZE_KEYWORDS[text];
  if (text === 'larger') return base * 1.2;
  if (text === 'smaller') return base / 1.2;
  const match = /^(\d*\.?\d+)(px|pt|pc|in|cm|mm|q|em|rem|%)$/.exec(text);
  if (!match?.[1] || !match[2]) return undefined;
  const amount = Number(match[1]);
  const unit = match[2];
  const size =
    unit === 'em'
      ? amount * base
      : unit === 'rem'
        ? amount * ROOT_SIZE
        : unit === '%'
          ? (amount / 100) * base
          : amount * (UNIT_PIXELS[unit] ?? 1);
  return size > 0 ? size : undefined;
}

/** The names of a `font-family` list, without their quotes. */
function familyNames(value: string): string[] {
  return value
    .split(',')
    .map((name) =>
      name
        .trim()
        .replace(/^(["'])(.*)\1$/, '$2')
        .trim(),
    )
    .filter(Boolean);
}

const ALIGNS = new Set<string>(['left', 'right', 'center', 'justify', 'start', 'end']);

/** A rule of a stylesheet the source brought with it: its selector, and what it declares. */
interface SourceRule {
  selector: string;
  declared: Map<string, string>;
}

/**
 * The rules of the stylesheets in the pasted markup itself: a word processor says most of its
 * formatting there, by class. The sheets are parsed and never applied to a document, so nothing
 * they name is loaded. Where stylesheets cannot be parsed, inline styles are still read.
 */
function sourceRules(body: ParentNode): SourceRule[] {
  const rules: SourceRule[] = [];
  if (typeof CSSStyleSheet === 'undefined') return rules;
  const root = 'ownerDocument' in body && body.ownerDocument ? body.ownerDocument : body;
  root.querySelectorAll('style').forEach((element) => {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(element.textContent ?? '');
      for (const rule of Array.from(sheet.cssRules)) {
        const { selectorText, style } = rule as CSSStyleRule;
        if (!selectorText || !style) continue;
        const declared = new Map<string, string>();
        for (const name of SOURCE_PROPERTIES) {
          const value = style.getPropertyValue(name).trim().toLowerCase();
          if (value) declared.set(name, value);
        }
        if (declared.size > 0) rules.push({ selector: selectorText, declared });
      }
    } catch {
      // A stylesheet that cannot be read states nothing.
    }
  });
  return rules;
}

function matches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

/**
 * What the source states for an element: what its tag implies, then the rules of the source's
 * stylesheets that match it, in their order, then its own `style`, which wins. (The order of the
 * rules stands in for their specificity: a later rule wins.)
 */
function statedStyle(
  element: Element,
  rules: readonly SourceRule[],
  inline: Map<string, string>,
): Map<string, string> {
  const stated = new Map<string, string>();
  const heading = HEADING_SIZES[element.localName.toLowerCase()];
  if (heading) stated.set('font-size', heading).set('font-weight', 'bold');
  for (const rule of rules) {
    if (!matches(element, rule.selector)) continue;
    for (const [name, value] of rule.declared) stated.set(name, value);
  }
  for (const [name, value] of inline) stated.set(name, value);
  // A decoration may be written as the shorthand.
  const decoration = inline.get('text-decoration');
  if (decoration && !inline.has('text-decoration-line'))
    stated.set('text-decoration-line', decoration);
  return stated;
}

/** The marks an element adds when the source's formatting is kept, over the ones around it. */
function sourceMarks(
  stated: Map<string, string>,
  inherited: Marks,
  size: number | undefined,
  source: SourceContext,
): Marks {
  const marks: Marks = { ...inherited };
  const family = stated.get('font-family');
  if (family) {
    const font = source.font(familyNames(family));
    if (font) marks.font = font;
    else delete marks.font;
  }
  // One decimal, as the size field has.
  if (size !== undefined) marks.size = Math.round(size * source.scale * 10) / 10;
  const weight = stated.get('font-weight');
  if (weight) {
    const number =
      weight === 'bold' || weight === 'bolder'
        ? BOLD
        : weight === 'normal'
          ? REGULAR
          : Number.parseInt(weight, 10);
    if (number >= 1 && number <= 1000) marks.weight = number;
  }
  const fontStyle = stated.get('font-style');
  if (fontStyle) {
    if (fontStyle === 'italic' || fontStyle.startsWith('oblique')) marks.italic = true;
    else if (fontStyle === 'normal') delete marks.italic;
  }
  const lines = stated.get('text-decoration-line') ?? '';
  if (lines.includes('underline')) marks.underline = true;
  if (lines.includes('line-through')) marks.strike = true;
  const vertical = stated.get('vertical-align');
  if (vertical === 'super') marks.script = 'sup';
  else if (vertical === 'sub') marks.script = 'sub';
  const color = stated.get('color');
  if (color) {
    const own = source.color(color);
    if (own) marks.color = own;
  }
  return marks;
}

/** The marks an element adds to its text: by its tag, then by its inline style, which wins. */
function elementMarks(el: Element, inherited: Marks): Marks {
  const tag = el.localName.toLowerCase();
  const marks: Marks = { ...inherited, ...TAG_MARKS[tag] };
  if (tag === 'a') {
    const link = safeLink(el.getAttribute('href'));
    if (link) marks.link = link;
  }
  const style = declarations(el.getAttribute('style'));
  const weight = style.get('font-weight');
  if (weight) {
    // Google Docs wraps a whole copy in <b style="font-weight: normal">: the style decides.
    const bold =
      weight === 'bold' || weight === 'bolder' || Number.parseInt(weight, 10) >= BOLD_FROM;
    if (bold) marks.weight = BOLD;
    else delete marks.weight;
  }
  const fontStyle = style.get('font-style');
  if (fontStyle) {
    if (fontStyle === 'italic' || fontStyle.startsWith('oblique')) marks.italic = true;
    else if (fontStyle === 'normal') delete marks.italic;
  }
  const lines = `${style.get('text-decoration') ?? ''} ${style.get('text-decoration-line') ?? ''}`;
  if (lines.includes('underline')) marks.underline = true;
  if (lines.includes('line-through')) marks.strike = true;
  const vertical = style.get('vertical-align');
  if (vertical === 'super') marks.script = 'sup';
  else if (vertical === 'sub') marks.script = 'sub';
  return marks;
}

interface Draft {
  list?: ListInfo;
  runs: Run[];
  /** Holds text whose white space is kept (`pre`): the spaces at its edges are text too. */
  pre?: boolean;
  /** What the source states for the paragraph, when its formatting is kept. */
  align?: SourceAlign;
  dir?: Direction;
}

/**
 * Reads the text of an HTML clipboard into paragraphs. The markup is parsed into a detached
 * document and only read. With `source`, what the source states of its formatting is read too.
 */
function readHtml(html: string, source?: SourceContext): Draft[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const rules = source ? sourceRules(body) : [];
  const paragraphs: Draft[] = [];
  let current: Draft | null = null;

  const open = (ctx: Context): Draft => {
    if (!current) {
      current = { runs: [] };
      if (ctx.list)
        current.list = { kind: ctx.list.kind, level: Math.min(ctx.list.level, MAX_LIST_LEVEL) };
      if (ctx.align) current.align = ctx.align;
      if (ctx.dir) current.dir = ctx.dir;
      paragraphs.push(current);
    }
    return current;
  };
  const close = () => {
    current = null;
  };
  const append = (text: string, ctx: Context) => {
    const marks = cleanMarks(ctx.marks);
    const draft = open(ctx);
    draft.runs.push(marks ? { text, marks } : { text });
    if (ctx.pre) draft.pre = true;
  };
  const endsWithSpace = () => /[ \n\t]$/.test(current?.runs.at(-1)?.text ?? ' ');

  const visit = (node: Node, ctx: Context): void => {
    if (node.nodeType === 3) {
      const raw = (node.nodeValue ?? '').replace(/\r\n?/g, '\n');
      if (ctx.pre) {
        if (raw) append(raw.replaceAll('\u00A0', ' '), ctx);
        return;
      }
      // White space between blocks, rows and list items is formatting of the markup, not text.
      const blank = !/[^ \t\n\f]/.test(raw);
      const parent = node.parentNode?.nodeType === 1 ? (node.parentNode as Element).localName : '';
      if (blank && (!current || STRUCTURAL.has(parent.toLowerCase()))) return;
      let text = raw.replace(/[ \t\n\f\u00A0]+/g, ' ');
      if (endsWithSpace()) text = text.replace(/^ /, '');
      // A line that so far holds only a space (`&nbsp;`) is still a line.
      open(ctx);
      if (text) append(text, ctx);
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.localName.toLowerCase();
    if (SKIPPED.has(tag) || el.hasAttribute('hidden')) return;
    const style = declarations(el.getAttribute('style'));
    if (style.get('display') === 'none') return;
    if (tag === 'br') {
      append('\n', ctx);
      return;
    }

    const inner: Context = { ...ctx, marks: elementMarks(el, ctx.marks) };
    if (source) {
      const stated = statedStyle(el, rules, style);
      const size = stated.get('font-size');
      const sized = size ? sourceFontSize(size, ctx.size) : undefined;
      if (sized !== undefined) inner.size = sized;
      inner.marks = sourceMarks(stated, inner.marks, sized, source);
      const align = stated.get('text-align')?.replace(/^-webkit-/, '');
      if (align && ALIGNS.has(align)) inner.align = align as SourceAlign;
      const dir = (el.getAttribute('dir') ?? stated.get('direction') ?? '').toLowerCase();
      if (dir === 'rtl' || dir === 'ltr') inner.dir = dir;
    }
    const space = style.get('white-space');
    if (tag === 'pre' || space?.startsWith('pre') || space === 'break-spaces') inner.pre = true;
    else if (space === 'normal' || space === 'nowrap') inner.pre = false;
    if (tag === 'ul' || tag === 'ol') {
      inner.list = {
        kind: tag === 'ol' ? 'number' : 'bullet',
        level: ctx.list ? ctx.list.level + 1 : 0,
      };
    }
    const block = BLOCKS.has(tag);
    if (block) close();
    // Cells of a table row share its line, a tab apart.
    if ((tag === 'td' || tag === 'th') && current) append('\t', ctx);
    el.childNodes.forEach((child) => visit(child, inner));
    if (block) close();
  };

  visit(body, { marks: {}, pre: false, size: ROOT_SIZE });
  return trimEmptyEdges(paragraphs.map(finish));
}

/**
 * The text of an HTML clipboard as a `RichText`: paragraphs, line breaks, lists with their levels,
 * and the character marks that say what the text is (bold, italic, underline, strike, sub and
 * superscript, links). Everything else is dropped: fonts, sizes, colours, alignment, images,
 * scripts and styles.
 */
export function htmlToRichText(html: string): RichText {
  return normalizeRichText({
    paragraphs: readHtml(html).map(({ list, runs }) => ({
      dir: 'auto',
      align: 'start',
      ...(list ? { list } : {}),
      runs,
    })),
  });
}

/**
 * The text of an HTML clipboard with the formatting its source states: what `htmlToRichText`
 * reads, and the font (when the deck can be drawn in it), the size, the weight, the colour, the
 * alignment and the direction. What the source does not state is left to the destination
 * (`keepSource`); the colour behind the text is not read, since a web page's own background
 * arrives in the same property as a highlight.
 */
export function htmlToSourceText(html: string, source: SourceContext): SourceText {
  return {
    paragraphs: readHtml(html, source).map(({ list, runs, align, dir }) => ({
      runs: normalizeRichText({ paragraphs: [{ dir: 'auto', align: 'start', runs }] })
        .paragraphs[0]!.runs,
      ...(list ? { list } : {}),
      ...(align ? { align } : {}),
      ...(dir ? { dir } : {}),
    })),
  };
}

function finish(draft: Draft): Draft {
  const runs = draft.runs.map((run) => ({ ...run }));
  // A line break that only closes the block, and the spaces around the line, are not text.
  const last = runs.at(-1);
  if (last?.text.endsWith('\n')) last.text = last.text.slice(0, -1);
  if (!draft.pre) {
    const first = runs.find((run) => run.text !== '');
    if (first) first.text = first.text.replace(/^ +/, '');
    const end = runs.findLast((run) => run.text !== '');
    if (end) end.text = end.text.replace(/ +$/, '');
  }
  return { ...draft, runs: runs.filter((run) => run.text !== '') };
}

function trimEmptyEdges(paragraphs: Draft[]): Draft[] {
  let start = 0;
  let end = paragraphs.length;
  while (start < end && paragraphs[start]?.runs.length === 0) start++;
  while (end > start && paragraphs[end - 1]?.runs.length === 0) end--;
  return paragraphs.slice(start, end);
}

/** Plain text as paragraphs: one per line. The line break that ends the text is not a line. */
export function plainTextToRichText(text: string): RichText {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
  if (lines.length === 1 && lines[0] === '') return { paragraphs: [] };
  return {
    paragraphs: lines.map((line) => ({
      dir: 'auto',
      align: 'start',
      runs: line ? [{ text: line }] : [],
    })),
  };
}

/** The `RichText` Slidr itself put on the clipboard, if this is one; links are checked again. */
export function parseCopiedText(json: string): RichText | undefined {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return undefined;
  }
  const parsed = RichText.safeParse(data);
  if (!parsed.success) return undefined;
  return normalizeRichText({
    paragraphs: parsed.data.paragraphs.map((paragraph) => ({
      ...paragraph,
      runs: paragraph.runs.map((run) => {
        if (!run.marks?.link) return run;
        const { link, ...rest } = run.marks;
        const safe = safeLink(link);
        const marks = cleanMarks(safe ? { ...rest, link: safe } : rest);
        return marks ? { text: run.text, marks } : { text: run.text };
      }),
    })),
  });
}

/**
 * Pasted text in the style of where it lands: every paragraph takes the destination paragraph's
 * fields (a pasted list item stays one), and every run the marks at the caret, under its own.
 */
export function matchDestination(
  rich: RichText,
  destination: { paragraph: ParagraphProps; marks: Marks | undefined },
): RichText {
  const base = { ...destination.marks };
  // A link at the caret is that text's link, not a style of the place.
  delete base.link;
  return normalizeRichText({
    paragraphs: rich.paragraphs.map((paragraph) => {
      const props: ParagraphProps = { ...destination.paragraph };
      if (paragraph.list) props.list = paragraph.list;
      return {
        ...props,
        runs: paragraph.runs.map((run) => {
          const marks = cleanMarks({ ...base, ...run.marks });
          return marks ? { text: run.text, marks } : { text: run.text };
        }),
      };
    }),
  });
}

/** The side of the line an alignment of the source is on, in a paragraph that reads one way. */
function logicalAlign(align: SourceAlign, direction: Direction): Paragraph['align'] {
  if (align === 'left') return direction === 'ltr' ? 'start' : 'end';
  if (align === 'right') return direction === 'rtl' ? 'start' : 'end';
  return align;
}

/**
 * Pasted text that keeps the formatting of its source: every paragraph and every run has what
 * the source states, over the fields of the destination paragraph and the marks at the caret,
 * which give the rest. `dir` is the direction of a paragraph without letters (the deck's).
 */
export function keepSource(
  text: SourceText,
  destination: { paragraph: ParagraphProps; marks: Marks | undefined; dir: Direction },
): RichText {
  const base = { ...destination.marks };
  delete base.link;
  return normalizeRichText({
    paragraphs: text.paragraphs.map((paragraph) => {
      const props: ParagraphProps = { ...destination.paragraph };
      if (paragraph.list) props.list = paragraph.list;
      if (paragraph.dir) props.dir = paragraph.dir;
      if (paragraph.align) {
        // "Left" is the start or the end of the line by the way the paragraph will read.
        const letters = paragraph.runs.map((run) => run.text).join('');
        const direction = resolveDirection(props.dir, letters, destination.dir);
        props.align = logicalAlign(paragraph.align, direction);
      }
      return {
        ...props,
        runs: paragraph.runs.map((run) => {
          const marks = cleanMarks({ ...base, ...run.marks });
          return marks ? { text: run.text, marks } : { text: run.text };
        }),
      };
    }),
  });
}

/**
 * Text copied in Slidr, for a paste that takes the formatting of where it lands: what says how
 * the text looks (font, size, colour, highlight, letter spacing, case) goes, and what says what
 * the text is stays, as for text from outside: bold, italic, underline, strike, sub and
 * superscript, links, and lists.
 */
export function withoutLook(rich: RichText): RichText {
  return normalizeRichText({
    paragraphs: rich.paragraphs.map(({ runs, list }) => ({
      dir: 'auto',
      align: 'start',
      ...(list ? { list } : {}),
      runs: runs.map((run) => {
        const { italic, underline, strike, script, link, weight } = run.marks ?? {};
        const marks = cleanMarks({
          italic,
          underline,
          strike,
          script,
          link,
          ...(weight !== undefined && weight >= BOLD_FROM ? { weight: BOLD } : {}),
        });
        return marks ? { text: run.text, marks } : { text: run.text };
      }),
    })),
  });
}

/* ---------------------------------------------------------------- the kinds of paste */

/**
 * How pasted text is formatted (TXT-13), the three choices of other editors and what Ctrl+V does:
 * - `auto`, Ctrl+V: text copied in Slidr keeps its formatting, and text from outside takes the
 *   formatting of where it lands;
 * - `match`: the formatting of where it lands, whatever the text is;
 * - `source`: the formatting of the source, as far as the source states it;
 * - `plain`: the text alone.
 */
export type PasteMode = 'auto' | 'match' | 'source' | 'plain';

/** What is on the clipboard, in the formats that are text. Empty strings for what is not there. */
export interface ClipboardText {
  html: string;
  text: string;
  /** Slidr's own format (`SLIDR_TEXT_MIME`): the copied `RichText`, as JSON. */
  slidr: string;
}

/** Where pasted text lands: the paragraph of the caret, the marks typing there would take. */
export interface Destination {
  paragraph: ParagraphProps;
  marks: Marks | undefined;
  /** The direction of a paragraph without letters: the deck's, and in a table the table's. */
  dir: Direction;
}

/**
 * The text a paste puts into a destination, by its kind. Undefined when the clipboard holds no
 * text. Whatever the kind, the result is a `RichText`: nothing of the clipboard's markup is in it.
 */
export function pastedText(
  data: ClipboardText,
  mode: PasteMode,
  source: SourceContext,
): ((destination: Destination) => RichText) | undefined {
  if (mode !== 'plain') {
    const own = data.slidr ? parseCopiedText(data.slidr) : undefined;
    if (own && hasText(own)) {
      return mode === 'match'
        ? (destination) => matchDestination(withoutLook(own), destination)
        : () => own;
    }
    if (data.html && mode === 'source') {
      const kept = htmlToSourceText(data.html, source);
      if (hasText(kept)) return (destination) => keepSource(kept, destination);
    } else if (data.html) {
      const mapped = htmlToRichText(data.html);
      if (hasText(mapped)) return (destination) => matchDestination(mapped, destination);
    }
  }
  if (!data.text) return undefined;
  const plain = plainTextToRichText(data.text);
  return hasText(plain) ? (destination) => matchDestination(plain, destination) : undefined;
}

/** Whether there is any text to paste. */
export function hasText(rich: { paragraphs: readonly { runs: readonly Run[] }[] }): boolean {
  return rich.paragraphs.some((paragraph) => paragraph.runs.some((run) => run.text !== ''));
}
