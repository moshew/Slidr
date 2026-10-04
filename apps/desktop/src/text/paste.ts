import { RichText, type ListInfo, type Marks, type Paragraph, type Run } from '@slidr/model';
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
 */

/** The clipboard format Slidr writes next to HTML and plain text: the copied `RichText`, as JSON. */
export const SLIDR_TEXT_MIME = 'application/x-slidr-richtext+json';

const BOLD = 700;

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
}

/**
 * The text of an HTML clipboard as a `RichText`: paragraphs, line breaks, lists with their levels,
 * and the character marks that say what the text is (bold, italic, underline, strike, sub and
 * superscript, links). Everything else is dropped: fonts, sizes, colours, alignment, images,
 * scripts and styles. The markup is parsed into a detached document and only read.
 */
export function htmlToRichText(html: string): RichText {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  const paragraphs: Draft[] = [];
  let current: Draft | null = null;

  const open = (ctx: Context): Draft => {
    if (!current) {
      current = { runs: [] };
      if (ctx.list)
        current.list = { kind: ctx.list.kind, level: Math.min(ctx.list.level, MAX_LIST_LEVEL) };
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

  visit(body, { marks: {}, pre: false });
  return normalizeRichText({ paragraphs: trimEmptyEdges(paragraphs.map(finish)) });
}

function finish(draft: Draft): Paragraph {
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
  return {
    dir: 'auto',
    align: 'start',
    ...(draft.list ? { list: draft.list } : {}),
    runs: runs.filter((run) => run.text !== ''),
  };
}

function trimEmptyEdges(paragraphs: Paragraph[]): Paragraph[] {
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

/** Whether there is any text to paste. */
export function hasText(rich: RichText): boolean {
  return rich.paragraphs.some((paragraph) => paragraph.runs.some((run) => run.text !== ''));
}
