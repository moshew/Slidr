import type {
  Color,
  Direction,
  ListInfo,
  Marks,
  Paragraph,
  RichText,
  TextStyle,
  TextStyleRef,
  Theme,
} from '@slidr/model';
import { resolveDirection, scriptOf } from './bidi';
import { cleanMarks, normalizeRichText, sameValue } from './richTextDoc';

/*
 * Text formatting as pure functions over the model (WG4-T03, T04): how a change is made to marks
 * and to paragraphs, and how the toolbar reads the current value of a piece of text. The same
 * functions serve both targets: a text element that is selected (all of its text), and the
 * selection inside the editor (see `editorFormat.ts`). See docs/adr/ADR-013-text-formatting.md.
 */

/** A paragraph without its text. */
export type ParagraphProps = Omit<Paragraph, 'runs'>;

/** Marks to set; `null` removes a mark, and the text falls back to its text style. */
export type MarksPatch = { [K in keyof Marks]?: Marks[K] | null };

/** Paragraph fields to set; `null` removes an optional one. */
export type ParagraphPatch = {
  [K in keyof ParagraphProps]?:
    ParagraphProps[K] | (undefined extends ParagraphProps[K] ? null : never);
};

/** A change to the marks of a piece of text. It sees the paragraph, whose text style decides what "bold" takes. */
export type MarksChange = (marks: Marks, paragraph: ParagraphProps) => Marks;

/** A change to a paragraph's own fields. */
export type ParagraphChange = (paragraph: ParagraphProps) => ParagraphProps;

/** What the theme needs to say about text, and the deck about direction. */
export interface FormatContext {
  theme: Theme;
  /** The deck's direction: the direction of a `dir: auto` line that has no text yet. */
  dir: Direction;
  /** The text style of a paragraph without `styleRef` (the renderer's rule: `body`). */
  styleRef?: TextStyleRef;
  /** The colour of the text box, which its text has where a run sets none (`TextElement.color`). */
  color?: Color;
}

/** From this weight up, text counts as bold. */
export const BOLD_FROM = 600;
const BOLD = 700;
const REGULAR = 400;
export const MAX_LIST_LEVEL = 8;

function styleOf(paragraph: ParagraphProps, ctx: FormatContext): TextStyle {
  return ctx.theme.textStyles[paragraph.styleRef ?? ctx.styleRef ?? 'body'];
}

function withoutNulls<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined && item !== null) out[key] = item;
  }
  return out as T;
}

/* ---------------------------------------------------------------- changes */

/** Sets the given marks and removes the ones given as `null`. */
export function patchMarks(patch: MarksPatch): MarksChange {
  return (marks) => withoutNulls({ ...marks, ...patch }) as Marks;
}

/**
 * Bold, against a numeric weight (ADR-013). Bold on is weight 700, unless the paragraph's text
 * style is bold already: then the mark is dropped and the style's own weight shows. Bold off drops
 * the mark, unless the style is bold: then the text is set to 400 explicitly.
 */
export function boldChange(on: boolean, ctx: FormatContext): MarksChange {
  return (marks, paragraph) => {
    const styleIsBold = styleOf(paragraph, ctx).weight >= BOLD_FROM;
    const rest = { ...marks };
    delete rest.weight;
    if (on) return styleIsBold ? rest : { ...rest, weight: BOLD };
    return styleIsBold ? { ...rest, weight: REGULAR } : rest;
  };
}

/**
 * What of a run's marks is its link, not its formatting: the link itself, and the underline that
 * shows it (the link tool sets the two together, and the renderer draws a link in the colour and
 * the decoration of its text).
 */
function linkMarks(marks: Marks): Marks {
  if (!marks.link) return {};
  return marks.underline ? { link: marks.link, underline: true } : { link: marks.link };
}

/**
 * Clear formatting (TXT-10): every character mark goes, and the text shows its text style again.
 * A link is not formatting and stays, with its underline. Paragraph fields are not touched.
 */
export const clearMarks: MarksChange = (marks) => linkMarks(marks);

/**
 * A link on the text, or none (TXT-09). The renderer draws a link in the colour and the
 * decoration of its text, so the underline that shows it is set and taken away with it.
 */
export function linkChange(link: string | null): MarksChange {
  return patchMarks(link ? { link, underline: true } : { link: null, underline: null });
}

/** Sets the given paragraph fields and removes the ones given as `null`. */
export function patchParagraph(patch: ParagraphPatch): ParagraphChange {
  return (paragraph) => withoutNulls({ ...paragraph, ...patch }) as ParagraphProps;
}

/**
 * Applying a text style of the theme (TXT-08). The paragraph points at the style, and what would
 * hide it goes: the marks a style defines itself (font, size, weight, colour, letter spacing,
 * case) and the paragraph's own line height. Italic, underline, links and the like stay.
 */
export const styleMarks: MarksPatch = {
  font: null,
  size: null,
  weight: null,
  color: null,
  letterSpacing: null,
  case: null,
};

export function styleChange(styleRef: TextStyleRef): {
  marks: MarksChange;
  paragraphs: ParagraphChange;
} {
  return {
    marks: patchMarks(styleMarks),
    paragraphs: patchParagraph({ styleRef, lineHeight: null }),
  };
}

/**
 * Turns a list on or off. A paragraph that changes kind keeps its level and its marker colour; a
 * custom bullet is dropped on the way to a numbered list, where it would replace the numbers.
 */
export function listChange(kind: ListInfo['kind'], on: boolean): ParagraphChange {
  return (paragraph) => {
    const rest = { ...paragraph };
    delete rest.list;
    if (!on) return rest;
    const previous = paragraph.list;
    const list: ListInfo = { kind, level: previous?.level ?? 0 };
    if (previous?.color) list.color = previous.color;
    if (previous?.glyph && previous.kind === kind) list.glyph = previous.glyph;
    return { ...rest, list };
  };
}

/** One list level deeper or shallower; a paragraph that is not a list item stays as it is. */
export function levelChange(by: number): ParagraphChange {
  return (paragraph) => {
    if (!paragraph.list) return paragraph;
    const level = Math.max(0, Math.min(MAX_LIST_LEVEL, paragraph.list.level + by));
    return { ...paragraph, list: { ...paragraph.list, level } };
  };
}

/** The bullet glyph and the marker colour of list items; `null` goes back to the default. */
export function listStyleChange(patch: {
  glyph?: string | null;
  color?: Color | null;
}): ParagraphChange {
  return (paragraph) => {
    if (!paragraph.list) return paragraph;
    return { ...paragraph, list: withoutNulls({ ...paragraph.list, ...patch }) as ListInfo };
  };
}

/** The change applied to the marks of every run. An empty line keeps the result on an empty run. */
export function mapMarks(rich: RichText, change: MarksChange): RichText {
  return normalizeRichText({
    paragraphs: rich.paragraphs.map((paragraph) => {
      const { runs, ...props } = paragraph;
      // An empty line has no text to carry marks; one empty run does, and it sets the line's height.
      const source = runs.some((run) => run.text !== '') ? runs : [runs[0] ?? { text: '' }];
      return {
        ...props,
        runs: source.map((run) => {
          const marks = cleanMarks(change(run.marks ?? {}, props));
          return marks ? { text: run.text, marks } : { text: run.text };
        }),
      };
    }),
  });
}

/** The change applied to every paragraph. */
export function mapParagraphs(rich: RichText, change: ParagraphChange): RichText {
  return normalizeRichText({
    paragraphs: rich.paragraphs.map(({ runs, ...props }) => ({ ...change(props), runs })),
  });
}

/* ---------------------------------------------------------------- reading */

/** The text has more than one value. */
export const MIXED: unique symbol = Symbol('mixed');
export type Mixed = typeof MIXED;
export type Value<T> = T | Mixed;

export function isMixed<T>(value: Value<T>): value is Mixed {
  return value === MIXED;
}

/** A value for a control that shows nothing when the text is mixed. */
export function orNull<T>(value: Value<T>): T | null {
  return value === MIXED ? null : value;
}

/** A stretch of text with one formatting, and the paragraph it is in. */
export interface TextSpan {
  marks: Marks | undefined;
  paragraph: ParagraphProps;
}

/** The text a format is read from: a whole rich text, or what the editor's selection covers. */
export interface TextSample {
  paragraphs: { props: ParagraphProps; text: string }[];
  spans: TextSpan[];
}

const EMPTY_PARAGRAPH: ParagraphProps = { dir: 'auto', align: 'start' };

/** All of a rich text. A rich text without paragraphs reads as one empty paragraph. */
export function sampleRichText(rich: RichText): TextSample {
  const sample: TextSample = { paragraphs: [], spans: [] };
  for (const { runs, ...props } of rich.paragraphs) {
    sample.paragraphs.push({ props, text: runs.map((run) => run.text).join('') });
    const filled = runs.filter((run) => run.text !== '');
    for (const run of filled.length ? filled : [runs[0] ?? { text: '' }])
      sample.spans.push({ marks: run.marks, paragraph: props });
  }
  if (sample.paragraphs.length === 0) {
    sample.paragraphs.push({ props: EMPTY_PARAGRAPH, text: '' });
    sample.spans.push({ marks: undefined, paragraph: EMPTY_PARAGRAPH });
  }
  return sample;
}

/** What the toolbar shows for a piece of text: every value is the effective one, or `MIXED`. */
export interface TextFormat {
  /** The family: the mark's, or the theme font of the paragraph's text style. */
  font: Value<string>;
  /** No run names a font: the family shown is the text style's. */
  fontFromStyle: boolean;
  /** Slide pixels. */
  size: Value<number>;
  weight: Value<number>;
  /** Every part of the text is at weight 600 or more. */
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  color: Value<Color>;
  highlight: Value<Color | null>;
  script: Value<'sup' | 'sub' | null>;
  case: Value<'upper' | 'lower' | null>;
  letterSpacing: Value<number>;
  /** Where the text links to (TXT-09): an address, or a slide as `#slide=<id>`; null for no link. */
  link: Value<string | null>;

  /** The text style of the paragraphs; a paragraph that names none has the default one. */
  styleRef: Value<TextStyleRef>;
  align: Value<Paragraph['align']>;
  dir: Value<Paragraph['dir']>;
  /** The direction the first paragraph is laid out in: which side `start` is on. */
  direction: Direction;
  lineHeight: Value<number>;
  spaceBefore: Value<number>;
  spaceAfter: Value<number>;
  indent: Value<number>;
  list: Value<ListInfo['kind'] | null>;
  /** The level of the list items; 0 when there are none. */
  level: Value<number>;
  glyph: Value<string | null>;
  listColor: Value<Color | null>;
}

function common<T>(values: readonly T[]): Value<T> {
  const first = values[0] as T;
  return values.every((value) => sameValue(value, first)) ? first : MIXED;
}

/** The current formatting of a sample, with the theme's text styles standing in for unset marks. */
export function readFormat(sample: TextSample, ctx: FormatContext): TextFormat {
  const { spans, paragraphs } = sample;
  const text = paragraphs.map((p) => p.text).join('\n');
  // A font pair has a face per script: the one shown is the one this text is drawn in.
  const script = scriptOf(text) ?? (ctx.dir === 'rtl' ? 'he' : 'latin');
  const style = (span: TextSpan) => styleOf(span.paragraph, ctx);
  const weights = spans.map((span) => span.marks?.weight ?? style(span).weight);
  const props = paragraphs.map((p) => p.props);
  const lists = props.map((p) => p.list).filter((list): list is ListInfo => Boolean(list));
  const first = paragraphs[0];

  return {
    font: common(
      spans.map((span) => span.marks?.font ?? ctx.theme.fonts[style(span).font][script]),
    ),
    fontFromStyle: spans.every((span) => !span.marks?.font),
    size: common(spans.map((span) => span.marks?.size ?? style(span).size)),
    weight: common(weights),
    bold: weights.every((weight) => weight >= BOLD_FROM),
    italic: spans.every((span) => span.marks?.italic === true),
    underline: spans.every((span) => span.marks?.underline === true),
    strike: spans.every((span) => span.marks?.strike === true),
    color: common(spans.map((span) => span.marks?.color ?? ctx.color ?? style(span).color)),
    highlight: common(spans.map((span) => span.marks?.highlight ?? null)),
    script: common(spans.map((span) => span.marks?.script ?? null)),
    case: common(spans.map((span) => span.marks?.case ?? style(span).case ?? null)),
    letterSpacing: common(
      spans.map((span) => span.marks?.letterSpacing ?? style(span).letterSpacing ?? 0),
    ),
    link: common(spans.map((span) => span.marks?.link ?? null)),

    styleRef: common(props.map((p) => p.styleRef ?? ctx.styleRef ?? 'body')),
    align: common(props.map((p) => p.align)),
    dir: common(props.map((p) => p.dir)),
    direction: first ? resolveDirection(first.props.dir, first.text, ctx.dir) : ctx.dir,
    lineHeight: common(props.map((p) => p.lineHeight ?? styleOf(p, ctx).lineHeight)),
    spaceBefore: common(props.map((p) => p.spaceBefore ?? 0)),
    spaceAfter: common(props.map((p) => p.spaceAfter ?? 0)),
    indent: common(props.map((p) => p.indent ?? 0)),
    list: common(props.map((p) => p.list?.kind ?? null)),
    level: lists.length ? common(lists.map((list) => list.level)) : 0,
    glyph: lists.length ? common(lists.map((list) => list.glyph ?? null)) : null,
    listColor: lists.length ? common(lists.map((list) => list.color ?? null)) : null,
  };
}

/**
 * The direction that flips a text (Ctrl+Shift+X): the opposite of the direction its first
 * paragraph is laid out in. An `auto` paragraph becomes explicit.
 */
export function flippedDirection(sample: TextSample, ctx: FormatContext): Direction {
  return readFormat(sample, ctx).direction === 'rtl' ? 'ltr' : 'rtl';
}

/** What a text style and the marks both say: where they agree, the mark says nothing. */
const STYLE_FIELDS = ['size', 'weight', 'color', 'letterSpacing', 'case'] as const;

/**
 * "Update the style to match" (TXT-08): the text style with what the text has in its place, and
 * the change that takes from the text the marks and the line height that then only repeat the
 * style. A value the text has more than one of is left out, and the style keeps its own. The
 * font is not taken: a style names a role of the theme (`heading` or `body`), not a family.
 * Neither is the colour of the text box (`boxColor`): it is the box's, given by its layout for
 * the field the box stands on, and says nothing about the style. Null when the style already
 * matches.
 */
export function matchStyle(
  format: TextFormat,
  style: TextStyle,
  boxColor?: Color,
): { style: TextStyle; marks: MarksChange; paragraphs: ParagraphChange } | null {
  const next: TextStyle = { ...style };
  if (!isMixed(format.size)) next.size = format.size;
  if (!isMixed(format.weight)) next.weight = format.weight;
  if (!isMixed(format.color) && !(boxColor && sameValue(format.color, boxColor))) {
    next.color = format.color;
  }
  if (!isMixed(format.lineHeight)) next.lineHeight = format.lineHeight;
  // No spacing and no case are the absence of the field, in a style as in the marks.
  if (!isMixed(format.letterSpacing)) {
    if (format.letterSpacing) next.letterSpacing = format.letterSpacing;
    else delete next.letterSpacing;
  }
  if (!isMixed(format.case)) {
    if (format.case) next.case = format.case;
    else delete next.case;
  }
  if (sameValue(next, style)) return null;
  return {
    style: next,
    marks: (marks) => {
      const out = { ...marks };
      for (const key of STYLE_FIELDS) if (sameValue(out[key], next[key])) delete out[key];
      return out;
    },
    paragraphs: (paragraph) => {
      if (paragraph.lineHeight !== next.lineHeight) return paragraph;
      const { lineHeight: _lineHeight, ...rest } = paragraph;
      return rest;
    },
  };
}

/* ---------------------------------------------------------------- the format painter */

/**
 * What the format painter carries from one text to another (TXT-10): the character marks, and the
 * paragraph's format. Not the link, which belongs to its text, and not the direction, which
 * follows the language of the text it lands on.
 */
export interface PickedFormat {
  marks: Marks;
  paragraph: Omit<ParagraphProps, 'dir'>;
}

/** The format at the start of a sample: at the caret, or of the first text of a box. */
export function pickFormat(sample: TextSample): PickedFormat {
  const span = sample.spans[0];
  const marks = { ...span?.marks };
  delete marks.link;
  const { dir: _dir, ...paragraph } = sample.paragraphs[0]?.props ?? EMPTY_PARAGRAPH;
  return { marks: cleanMarks(marks) ?? {}, paragraph };
}

/** The picked marks in place of the text's own. A link the text has stays its link. */
export function paintMarks(picked: PickedFormat): MarksChange {
  return (marks) => ({ ...picked.marks, ...linkMarks(marks) });
}

/** The picked paragraph format in place of the paragraph's own; the paragraph keeps its direction. */
export function paintParagraph(picked: PickedFormat): ParagraphChange {
  return (paragraph) => ({ dir: paragraph.dir, ...picked.paragraph });
}
