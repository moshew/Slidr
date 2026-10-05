/**
 * What the built-in templates are drawn with. All three are drawn right-to-left, as their
 * reference decks are: `start` is the right side. A frame is given by its distance from the
 * start side, so the numbers here are the ones in the deck's HTML (`inset-inline-start`).
 */
import {
  createElement,
  SLIDE_WIDTH,
  type AssetMeta,
  type Background,
  type ChartElement,
  type Color,
  type ColorToken,
  type Deck,
  type Element,
  type Fill,
  type Frame,
  type Layout,
  type Paragraph,
  type Placeholder,
  type PlaceholderRole,
  type RichText,
  type ShapeElement,
  type Slide,
  type TableCell,
  type TextElement,
  type TextStyleRef,
} from '@slidr/model';
import { createSlide, type LayoutContent, type RoleFill } from '../createSlide';
import { deckFromTemplate } from '../deck';
import { mirrorLayout } from '../mirror';
import type { Template } from '../template';

/** A frame at a distance from the start side (the right) of a right-to-left slide. */
export const at = (start: number, top: number, w: number, h: number): Frame => ({
  x: SLIDE_WIDTH - start - w,
  y: top,
  w,
  h,
});

/** A frame at a distance from the end side (the left). */
export const atEnd = (end: number, top: number, w: number, h: number): Frame => ({
  x: end,
  y: top,
  w,
  h,
});

export const token = (name: ColorToken, alpha?: number): Color =>
  alpha === undefined ? { token: name } : { token: name, alpha };

export const solid = (color: Color): Fill => ({ kind: 'solid', color });

export const NO_FILL: Fill = { kind: 'none' };

/**
 * The ground of the theme's surface colour: the background every theme offers beside its own
 * (`Theme.backgroundVariants`, which the Background tool shows as the template's choices).
 *
 * A theme offers only grounds that all five of its text styles read on. The text of a
 * placeholder takes its colour from its text style and has none of its own (SPEC 5.5), so on a
 * field of the primary colour the template's own text is lost: black on black in `defus`,
 * 1.3:1 in `tzuk` and `lavan`. Such fields were offered and are not any more; they can come
 * back when a placeholder can carry a colour. `builtin.test.ts` holds every theme to this, and
 * the acceptance tests of a template try each variant behind every slide of its sample.
 */
export const SURFACE: Background = { fill: { kind: 'solid', color: { token: 'surface' } } };

/** A placeholder. The alignment is always stated, so text is seated on the layout's side. */
export function place(
  id: string,
  role: PlaceholderRole,
  frame: Frame,
  styleRef: TextStyleRef | undefined = undefined,
  rest: Pick<Placeholder, 'align' | 'vAlign'> = {},
): Placeholder {
  const text = role !== 'image' && role !== 'logo' && role !== 'chart' && role !== 'table';
  return {
    id,
    role,
    frame,
    ...(styleRef ? { styleRef } : {}),
    ...(text ? { align: 'start' as const } : {}),
    ...rest,
  };
}

/** A box: a card, a rule, a bar. */
export function rect(
  id: string,
  frame: Frame,
  fill: Fill,
  rest: Partial<Pick<ShapeElement, 'stroke' | 'effects' | 'opacity' | 'geometry'>> = {},
): ShapeElement {
  return createElement.shape({ id, frame, fill, ...rest });
}

/** A dot. */
export function dot(
  id: string,
  frame: Frame,
  fill: Fill,
  rest: Partial<Pick<ShapeElement, 'stroke' | 'opacity'>> = {},
): ShapeElement {
  return createElement.shape({
    id,
    frame,
    fill,
    geometry: { kind: 'preset', preset: 'ellipse' },
    ...rest,
  });
}

/** Text that belongs to the layout itself: a step number, a mark. */
export function label(
  id: string,
  frame: Frame,
  text: string,
  styleRef: TextStyleRef,
  rest: {
    color?: Color;
    weight?: number;
    dir?: Paragraph['dir'];
    align?: Paragraph['align'];
    vAlign?: TextElement['vAlign'];
  } = {},
): TextElement {
  const { color, weight, dir = 'ltr', align = 'end', vAlign = 'top' } = rest;
  const marks = { ...(color ? { color } : {}), ...(weight ? { weight } : {}) };
  return createElement.text({
    id,
    frame,
    vAlign,
    content: {
      paragraphs: [
        {
          dir,
          align,
          styleRef,
          runs: [{ text, ...(Object.keys(marks).length > 0 ? { marks } : {}) }],
        },
      ],
    },
  });
}

/**
 * The number of the slide, drawn by the layout (SLD-04): a text whose role makes the renderer
 * write the slide's own number in it. A figure reads left to right and sits on the deck's side,
 * so `end` is the far corner in both directions; `1` stands in where no deck numbers the slide.
 */
export function pageNumber(
  id: string,
  frame: Frame,
  styleRef: TextStyleRef = 'caption',
  rest: Parameters<typeof label>[4] = {},
): TextElement {
  return {
    ...label(id, frame, '1', styleRef, { dir: 'auto', align: 'end', ...rest }),
    role: 'slideNumber',
    name: 'slide number',
  };
}

/** Inline SVG whose colours follow the theme: each literal colour of the markup maps to a token. */
export function drawing(
  id: string,
  frame: Frame,
  markup: string,
  colors: Record<string, Color>,
  rest: { role?: PlaceholderRole; name?: string } = {},
): Element {
  return createElement.svg({ id, frame, markup, colorOverrides: colors, ...rest });
}

/**
 * Layouts for the other direction that the mirror alone does not get right (`Template.flipped`):
 * the mirror of each, with the background drawn by hand. Free CSS is the case: a glow in a
 * corner is not something `mirrorLayout` can turn.
 */
export function flipBackgrounds(
  layouts: readonly Layout[],
  backgrounds: Record<string, Background>,
): Layout[] {
  return layouts.flatMap((layout) => {
    const background = backgrounds[layout.id];
    return background ? [{ ...mirrorLayout(layout), background }] : [];
  });
}

// ---------------------------------------------------------------------------------------------
// Content of the sample slides

/** A paragraph of plain text. `auto` reads in the direction of its first letter. */
export function para(text: string, rest: Partial<Paragraph> = {}): Paragraph {
  return { dir: 'auto', align: 'start', runs: text ? [{ text }] : [], ...rest };
}

/** Plain text, a paragraph per line. */
export function text(...lines: string[]): RichText {
  return { paragraphs: lines.map((line) => para(line)) };
}

/** A bulleted list. */
export function bullets(...lines: string[]): RichText {
  return { paragraphs: lines.map((line) => para(line, { list: { kind: 'bullet', level: 0 } })) };
}

const RTL_LETTER = /[\p{Script=Hebrew}\p{Script=Arabic}]/u;
const LETTER = /\p{L}/u;

/**
 * The direction of a sample paragraph, as the Markdown of `text_set` would set it: the deck's,
 * unless the text has letters and none of them is of that direction. A Hebrew sentence that
 * opens with an English term is still a Hebrew sentence; `auto` would turn it around.
 */
function settled(paragraph: Paragraph, deckDir: 'rtl' | 'ltr'): Paragraph {
  if (paragraph.dir !== 'auto') return paragraph;
  const letters = [...paragraph.runs.map((run) => run.text).join('')].filter((c) => LETTER.test(c));
  if (letters.length === 0) return paragraph;
  const rtl = letters.some((letter) => RTL_LETTER.test(letter));
  const ltr = letters.some((letter) => !RTL_LETTER.test(letter));
  const dir = deckDir === 'rtl' ? (rtl ? 'rtl' : 'ltr') : ltr ? 'ltr' : 'rtl';
  return { ...paragraph, dir };
}

function settledContent(content: LayoutContent, deckDir: 'rtl' | 'ltr'): LayoutContent {
  const fill = (value: RoleFill): RoleFill =>
    'paragraphs' in value
      ? { paragraphs: value.paragraphs.map((paragraph) => settled(paragraph, deckDir)) }
      : value;
  const out: LayoutContent = {};
  for (const [role, value] of Object.entries(content)) {
    if (value === undefined) continue;
    out[role as PlaceholderRole] = Array.isArray(value)
      ? (value as readonly RoleFill[]).map(fill)
      : fill(value as RoleFill);
  }
  return out;
}

/** One sample slide: the layout, what goes into its placeholders, and what a role cannot say. */
export interface SampleSlide {
  layout: string;
  name: string;
  content: LayoutContent;
  /** The data of the slide's chart. */
  chart?: Pick<ChartElement, 'chartType' | 'data'> & { title?: string };
  /** The rows of the slide's table, header first. */
  table?: { rows: string[][]; cols: number[]; rowHeight: number };
}

/** A small seeded generator, so the ids of the sample slides are the same on every call. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The sample slides of a template, made by the engine itself from the template's layouts:
 * `createSlide` for every slide, in a deck of the given direction, so every element sits on its
 * placeholder. Content the layout has no place for is an error: a sample shows the template.
 */
export function sampleSlides(
  template: Template,
  slides: readonly SampleSlide[],
  options: { dir?: 'rtl' | 'ltr'; lang?: string; seed?: number } = {},
): Slide[] {
  const dir = options.dir ?? template.dir;
  const lang = options.lang ?? (dir === 'rtl' ? 'he' : 'en');
  const deck = deckFromTemplate(template, { lang, dir });
  // The pictures of the sample: a deck that only takes the template does not carry them.
  deck.assets = { ...deck.assets, ...template.assets };
  const random = seeded(options.seed ?? 1);
  for (const sample of slides) {
    const { slide, unplaced } = createSlide(
      deck,
      { layoutId: sample.layout, name: sample.name, content: settledContent(sample.content, dir) },
      { random },
    );
    if (unplaced.length > 0) {
      throw new Error(`${sample.layout} has no place for ${unplaced.join(', ')}`);
    }
    for (const element of slide.elements) {
      if (element.type === 'chart' && sample.chart) {
        element.chartType = sample.chart.chartType;
        element.data = sample.chart.data;
        if (sample.chart.title) element.options.title = sample.chart.title;
      }
      if (element.type === 'table' && sample.table) {
        const { rows, cols, rowHeight } = sample.table;
        element.cols = cols;
        element.rows = rows.map(() => rowHeight);
        element.cells = rows.map((row) =>
          row.map((cell): TableCell => ({ content: { paragraphs: [settled(para(cell), dir)] } })),
        );
      }
    }
    deck.slides.push(slide);
  }
  return deck.slides;
}

/** A deck on a template with sample slides on it, in the direction the slides were written for. */
export function sampleDeck(
  template: Template,
  slides: readonly SampleSlide[],
  options: { dir: 'rtl' | 'ltr'; lang: string },
): Deck {
  const deck = deckFromTemplate(template, options);
  deck.assets = { ...deck.assets, ...template.assets };
  deck.slides = sampleSlides(template, slides, options);
  return deck;
}

/** The asset table of a template from its picture files. */
export function assetTable(assets: readonly AssetMeta[]): Record<string, AssetMeta> {
  return Object.fromEntries(assets.map((asset) => [asset.id, asset]));
}
