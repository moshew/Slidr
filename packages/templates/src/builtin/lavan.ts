import { unionBounds, type Element, type Frame, type Layout, type Theme } from '@slidr/model';
import { copyJson } from '../json';
import { mirrorLayout } from '../mirror';
import type { Template } from '../template';
import {
  assetTable,
  at,
  atEnd,
  bullets,
  drawing,
  label,
  NO_FILL,
  pageNumber,
  place,
  rect,
  sampleSlides,
  solid,
  text,
  token,
  type SampleSlide,
} from './kit';
import { pictures } from './pictures.generated';

/**
 * Lavan: the minimal template. A white sheet, near-black type set light and large, hairlines on
 * a strict grid, and one blue that appears a few times a slide at most. Nothing is boxed and
 * nothing is filled: scale, alignment and rules hold the slide.
 *
 * It has no reference deck: it was drawn as a template from the start, so the frames here are
 * the source. The pictures of its sample are one scene, whole and cut in two, and four portraits
 * in black and white: the blue of the chair in them is the one colour of the deck.
 */
export const lavanTheme: Theme = {
  id: 'lavan',
  name: 'Lavan',
  colors: {
    bg: '#ffffff',
    surface: '#f4f4f2',
    text: '#111214',
    muted: '#63666b',
    primary: '#1f3fe0',
    secondary: '#2b2d31',
    accent: '#8ea0f5',
    chart: ['#1f3fe0', '#111214', '#9aa0aa', '#8ea0f5', '#c9ccd2', '#4a4e57'],
  },
  fonts: {
    heading: { he: 'Heebo', latin: 'Manrope' },
    body: { he: 'Heebo', latin: 'Manrope' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 160,
      weight: 300,
      lineHeight: 1.04,
      letterSpacing: -3,
      color: { token: 'text' },
    },
    title: {
      font: 'heading',
      size: 68,
      weight: 300,
      lineHeight: 1.15,
      letterSpacing: -1,
      color: { token: 'text' },
    },
    heading: { font: 'heading', size: 40, weight: 400, lineHeight: 1.2, color: { token: 'text' } },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 400, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 0,
  shadow: { x: 0, y: 8, blur: 24, color: { value: '#111214', alpha: 0.08 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    { fill: { kind: 'solid', color: { token: 'surface' } } },
    { fill: { kind: 'solid', color: { token: 'primary' } } },
    { fill: { kind: 'solid', color: { token: 'secondary' } } },
  ],
};

// ---------------------------------------------------------------------------------------------
// The grid: twelve columns of 100 with gutters of 48, between margins of 96

const MARGIN = 96;
const WIDTH = 1728;
/** The width of a number of columns. */
const span = (columns: number) => columns * 148 - 48;
/** The distance of a column from the start side; the first is column 0. */
const column = (n: number) => MARGIN + n * 148;

/** Where the content of a slide begins, under a title of two lines, and where its foot is. */
const ZONE = 330;
const FOOT = 940;

// ---------------------------------------------------------------------------------------------
// What the layouts share

const HAIR = solid(token('text', 0.16));
const INK = solid(token('text'));
const BLUE = solid(token('primary'));

/** The literal colours of the drawings, and the tokens they stand for. */
const PAINT = {
  '#111214': token('text'),
  '#1f3fe0': token('primary'),
};

const MARK =
  '<svg viewBox="0 0 40 40"><path fill="none" stroke="#111214" stroke-width="3" d="M1.5 1.5h37v37h-37z"/><path fill="#1f3fe0" d="M20 20h12v12H20z"/></svg>';

/** The mark of the template: a white sheet and one blue square. A deck replaces it with its logo. */
const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** The quotation mark of each direction. They are two marks, not one mark and its mirror. */
const QUOTE_RTL =
  '<svg viewBox="0 0 66 50"><path fill="#1f3fe0" d="M40 0h26v26L52 50H42l10-24H40zM0 0h26v26L12 50H2l10-24H0z"/></svg>';
const QUOTE_LTR =
  '<svg viewBox="0 0 66 50"><path fill="#1f3fe0" d="M26 50H0V24L14 0h10L14 24h12zM66 50H40V24L54 0h10L54 24h12z"/></svg>';

const quoteGlyph = (frame: Frame, markup: string) =>
  drawing('d_lavan_quote_glyph', frame, markup, PAINT);

/**
 * What opens every slide: the ink rule on the top margin, and under it the blue square before
 * the line over the title.
 */
function top(name: string, width = WIDTH, square = true): Element[] {
  return [
    rect(`d_lavan_${name}_top`, at(MARGIN, 80, width, 2), INK),
    ...(square ? [rect(`d_lavan_${name}_square`, at(MARGIN, 111, 12, 12), BLUE)] : []),
  ];
}

/** The line over a title, after the blue square. */
const kicker = (width = 900) =>
  place('p_kicker', 'caption', at(MARGIN + 28, 100, width, 34), 'caption');

/** The line over a title and the title itself, with room for two lines. */
const head = (width = WIDTH) => [
  kicker(Math.min(900, width - 28)),
  place('p_title', 'title', at(MARGIN, 142, width, 160), 'title'),
];

/**
 * What frames a content slide besides its head: the rule and the square at the top, and the
 * foot, a hairline with the mark at the start, and at the end the deck's name with the slide's
 * number beyond it. The mark stands alone at its side, which leaves a logo of any width room to
 * replace it. The footer, the mark and the number are set here and nowhere else.
 */
function frameOf(
  name: string,
  square = true,
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  return {
    placeholders: [
      place('p_footer', 'footer', at(MARGIN + WIDTH - 900, FOOT + 16, 820, 34), 'caption', {
        align: 'end',
      }),
    ],
    decorations: [
      ...top(name, WIDTH, square),
      rect(`d_lavan_${name}_rule`, at(MARGIN, FOOT, WIDTH, 1), HAIR),
      mark(`d_lavan_${name}_mark`, at(MARGIN, FOOT + 17, 32, 32)),
      pageNumber(`d_lavan_${name}_number`, at(MARGIN + WIDTH - 60, FOOT + 16, 60, 34)),
    ],
  };
}

/**
 * A number the layout sets by itself, light and blue. A paragraph of figures alone takes the
 * direction of the deck (`auto`), so `start` keeps the number on the margin of its column in
 * both directions, whatever the width of its box.
 */
const index = (id: string, frame: Frame, n: number) =>
  label(id, frame, `0${n}`, 'heading', {
    color: token('primary'),
    weight: 300,
    dir: 'auto',
    align: 'start',
  });

/** What a rule is drawn with: ink, ink at a third, a hairline, or the blue. */
type Ink = 'ink' | 'soft' | 'hair' | 'blue';
const INKS: Record<Ink, string> = {
  ink: 'fill="#111214"',
  soft: 'fill="#111214" fill-opacity="0.35"',
  hair: 'fill="#111214" fill-opacity="0.16"',
  blue: 'fill="#1f3fe0"',
};
type Rule = readonly [frame: Frame, ink: Ink];

/**
 * The ruling of a layout, as one drawing. On a sheet without boxes the rules, the blue squares
 * that stand on them and the arrows between the columns are the picture of the slide, the way
 * cards are in other templates. Every part is given by its frame on the slide. An arrow runs
 * the width of its frame, at the middle of its height, and its head is at the end side: it
 * leads to the next column of a right-to-left slide, and the mirror turns it with the rest.
 */
function ruling(id: string, rules: readonly Rule[], arrows: readonly Frame[] = []): Element {
  const box = unionBounds([...rules.map(([frame]) => frame), ...arrows]);
  const rects = rules.map(
    ([f, ink]) =>
      `<rect ${INKS[ink]} x="${f.x - box.x}" y="${f.y - box.y}" width="${f.w}" height="${f.h}"/>`,
  );
  const lines = arrows.map((f) => {
    const [tip, top, middle, head] = [f.x - box.x + 1, f.y - box.y, f.y - box.y + f.h / 2, f.h / 2];
    return `<path fill="none" stroke="#111214" stroke-opacity="0.4" stroke-width="2" d="M${tip + f.w - 1} ${middle}H${tip}M${tip + head} ${top + 1}L${tip} ${middle}L${tip + head} ${top + f.h - 1}"/>`;
  });
  const markup = `<svg viewBox="0 0 ${box.w} ${box.h}">${rects.join('')}${lines.join('')}</svg>`;
  return drawing(id, box, markup, PAINT);
}

/** A blue square on a rule of two pixels, where a column begins: the mark at its smallest. */
const squareOn = (start: number, line: number): Rule => [at(start, line - 6, 14, 14), 'blue'];

/** The scale of the timeline: a rule with fine ticks, and a blue square where each column begins. */
const TICK = 37;
function scale(id: string, line: number, starts: readonly number[]): Element {
  const ticks = Array.from({ length: Math.floor(WIDTH / TICK) + 1 }, (_, i) => MARGIN + i * TICK);
  return ruling(id, [
    ...ticks.map((start): Rule => [at(start, line + 1, 1, 10), 'soft']),
    [at(MARGIN, line, WIDTH, 2), 'ink'],
    ...starts.map((start) => squareOn(start, line)),
  ]);
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const columns4 = [column(0), column(3), column(6), column(9)];
const columns3 = [column(0), column(4), column(8)];
/** Text in a third of the sheet, kept clear of the hairline that parts it from the next. */
const THIRD = span(4) - 48;
/** Five columns of 307 with a gutter of 48, which a hairline runs down. */
const STEP = 307;
const steps5 = [0, 1, 2, 3, 4].map((i) => MARGIN + i * (STEP + 48));
/** The rows of the text beside a picture. */
const ROW = 194;
const rows3 = [ZONE, ZONE + ROW, ZONE + 2 * ROW];
/** The two sides of a comparison: where they begin, and their width on either side of a hairline. */
const SIDES = 370;
const SIDE = span(6) - 24;
/** The plate of the opening slide, and the blue square of the mark at its size. */
const PLATE = atEnd(MARGIN, 80, span(4), 920);
const PLATE_BLUE = atEnd(MARGIN + 272, 728, 163, 163);

function layouts(): Layout[] {
  return [
    {
      id: 'l_lavan_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        // The mark has the start of the head to itself; the line over the title ends the row.
        place('p_kicker', 'caption', at(MARGIN + span(8) - 900, 111, 900, 34), 'caption', {
          align: 'end',
        }),
        place('p_title', 'title', at(MARGIN, 208, span(8), 502), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(MARGIN, 742, span(8), 148), 'heading'),
        place('p_meta', 'caption', at(MARGIN, 930, span(8), 68), 'caption'),
        // A plate on the wall: the picture stands inside the margins, as tall as the sheet.
        place('p_image', 'image', PLATE),
      ],
      decorations: [
        // Under the picture, for a deck that brings none: the mark at the size of the plate,
        // an empty sheet and its blue square.
        rect('d_lavan_hero_sheet', PLATE, NO_FILL, {
          stroke: { color: token('text', 0.16), width: 1 },
        }),
        rect('d_lavan_hero_blue', PLATE_BLUE, BLUE),
        ...top('hero', span(8), false),
        mark('d_lavan_hero_mark', at(MARGIN, 104, 48, 48)),
        rect('d_lavan_hero_rule', at(MARGIN, 912, span(8), 1), HAIR),
      ],
    },
    {
      id: 'l_lavan_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        // Four corners: the number and the line over the title above, the title and what it
        // promises below.
        place('p_number', 'number', atEnd(MARGIN, 108, span(5), 170), 'display', { align: 'end' }),
        kicker(),
        place('p_title', 'title', at(MARGIN, 650, span(8), 336), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', atEnd(MARGIN, 620, span(4), 192), 'heading'),
      ],
      decorations: [
        ...top('section'),
        rect('d_lavan_section_rule', at(MARGIN, 590, WIDTH, 1), HAIR),
      ],
    },
    {
      id: 'l_lavan_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head(),
        // A sheet of three columns: the number in the first and what it means beside it, and
        // under them a figure to a column.
        place('p_number', 'number', at(MARGIN, ZONE + 4, span(4), 170), 'display'),
        place('p_label', 'subtitle', at(column(4), ZONE + 30, span(8), 96), 'heading'),
        place('p_body', 'body', at(column(4), ZONE + 138, span(6), 130), 'body'),
        ...columns3.flatMap((start, i) => [
          place(`p_stat${i + 1}`, 'number', at(start, 668, THIRD, 84), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', at(start, 760, THIRD, 102), 'caption'),
        ]),
        ...frameOf('big_number').placeholders,
      ],
      decorations: [
        rect('d_lavan_big_number_split', at(MARGIN, 636, WIDTH, 1), HAIR),
        rect('d_lavan_big_number_column1', at(column(4) - 24, ZONE, 1, 562), HAIR),
        rect('d_lavan_big_number_column2', at(column(8) - 24, 636, 1, 256), HAIR),
        ...frameOf('big_number').decorations,
      ],
    },
    {
      id: 'l_lavan_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(column(2), 190, span(10), 400), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(column(2), 694, span(10), 53), 'heading'),
        place('p_caption', 'caption', at(column(2), 752, span(10), 68), 'caption'),
        ...frameOf('quote').placeholders,
      ],
      decorations: [
        // The mark hangs in the margin column, level with the middle of the words.
        quoteGlyph(at(MARGIN, 332, 152, 115), QUOTE_RTL),
        rect('d_lavan_quote_split', at(column(2), 662, span(10), 1), HAIR),
        ...frameOf('quote', false).decorations,
      ],
    },
    {
      id: 'l_lavan_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head(),
        // A plate as tall as the three rows beside it.
        place('p_image', 'image', atEnd(MARGIN, ZONE, span(4), 3 * ROW + 1)),
        // A row for each point: what it is in one column, what it means in the next.
        ...rows3.flatMap((row, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(MARGIN, row + 22, span(3), 144), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(column(3), row + 26, span(5), 168), 'body'),
        ]),
        ...frameOf('text_image').placeholders,
      ],
      decorations: [
        ...rows3.map((row, i) =>
          rect(`d_lavan_text_image_rule${i + 1}`, at(MARGIN, row, span(8), 1), HAIR),
        ),
        rect('d_lavan_text_image_base', at(MARGIN, ZONE + 3 * ROW, span(8), 1), HAIR),
        ...frameOf('text_image').decorations,
      ],
    },
    {
      id: 'l_lavan_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The head stays where every slide has it, and the picture takes the rest of the sheet
        // to its edges: nothing of a layout can be drawn between a picture and text over it.
        place('p_image', 'image', atEnd(0, 340, 1920, 740)),
        kicker(),
        place('p_title', 'title', at(MARGIN, 142, span(8), 160), 'title'),
        place('p_body', 'body', atEnd(MARGIN, 150, span(4), 172), 'body'),
      ],
      decorations: top('full_image'),
    },
    {
      id: 'l_lavan_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head(),
        ...columns3.flatMap((start, i) => [
          // The name of a card is set as large as a title, and stands on the rule over its text.
          place(`p_card${i + 1}`, 'subtitle', at(start, ZONE + 96, span(4), 160), 'title', {
            vAlign: 'bottom',
          }),
          place(`p_card${i + 1}_body`, 'body', at(start, ZONE + 290, span(4), 172), 'body'),
          place(`p_card${i + 1}_note`, 'caption', at(start, ZONE + 18, span(4), 68), 'caption'),
        ]),
        place('p_takeaway', 'body', at(MARGIN, 832, WIDTH, 84), 'body'),
        ...frameOf('cards').placeholders,
      ],
      decorations: [
        // No boxes: each column hangs from a rule of its own, with the blue square where it
        // begins, and the three are one drawing.
        ruling('d_lavan_cards_ruling', [
          ...columns3.flatMap((start): Rule[] => [
            [at(start, ZONE, span(4), 2), 'ink'],
            squareOn(start, ZONE),
            [at(start, ZONE + 272, span(4), 1), 'hair'],
          ]),
          [at(MARGIN, 814, WIDTH, 1), 'hair'],
        ]),
        ...frameOf('cards').decorations,
      ],
    },
    {
      id: 'l_lavan_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head(),
        // A date over the scale, in one line; what happens then under it.
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 350, span(3), 84), 'title'),
          place(`p_what${i + 1}`, 'subtitle', at(start, 496, span(3), 96), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start, 600, span(3), 168), 'body'),
        ]),
        place('p_note', 'caption', at(MARGIN, 828, WIDTH, 68), 'caption'),
        ...frameOf('timeline').placeholders,
      ],
      decorations: [
        scale('d_lavan_timeline_scale', 461, columns4),
        rect('d_lavan_timeline_base', at(MARGIN, 812, WIDTH, 1), HAIR),
        ...frameOf('timeline').decorations,
      ],
    },
    {
      id: 'l_lavan_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start, ZONE + 58, STEP, 96), 'heading'),
          place(`p_step${i + 1}_body`, 'caption', at(start, ZONE + 160, STEP, 135), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start, ZONE + 322, STEP, 84), 'title'),
        ]),
        place('p_summary', 'body', at(MARGIN, 808, WIDTH, 96), 'heading'),
        ...frameOf('process').placeholders,
      ],
      decorations: [
        ...steps5.map((start, i) =>
          index(`d_lavan_process_n${i + 1}`, at(start, ZONE, 96, 53), i + 1),
        ),
        // The steps are the columns of one ledger: a hairline down every gutter, and over it
        // an arrow from the number of each step to the next.
        ruling(
          'd_lavan_process_ruling',
          [
            ...steps5.map((start): Rule => [at(start, ZONE + 308, STEP, 1), 'hair']),
            ...steps5.slice(1).map((start): Rule => [at(start - 24, ZONE + 58, 1, 362), 'hair']),
            [at(MARGIN, 784, WIDTH, 2), 'ink'],
          ],
          steps5.slice(0, 4).map((start) => at(start + 64, ZONE + 17, STEP - 34, 20)),
        ),
        ...frameOf('process').decorations,
      ],
    },
    {
      id: 'l_lavan_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head(),
        // The two sides are built as the cards are: a line, a name set large, a rule, the text.
        // They begin lower than other content, so a list of four lines reaches the foot.
        place('p_before_tag', 'caption', at(MARGIN, SIDES + 18, SIDE, 34), 'caption'),
        place('p_before', 'subtitle', at(MARGIN, SIDES + 62, SIDE, 160), 'title', {
          vAlign: 'bottom',
        }),
        place('p_before_body', 'body', at(MARGIN, SIDES + 260, SIDE, 294), 'body'),
        place('p_after_tag', 'caption', atEnd(MARGIN, SIDES + 18, SIDE, 34), 'caption'),
        place('p_after', 'subtitle', atEnd(MARGIN, SIDES + 62, SIDE, 160), 'title', {
          vAlign: 'bottom',
        }),
        place('p_after_body', 'body', atEnd(MARGIN, SIDES + 260, SIDE, 294), 'body'),
        ...frameOf('comparison').placeholders,
      ],
      decorations: [
        // What was hangs from a hairline; what is, from the blue; and between their two lines
        // an arrow leads from the one to the other, over the hairline that parts them.
        ruling(
          'd_lavan_comparison_ruling',
          [
            [at(MARGIN, SIDES, SIDE, 1), 'soft'],
            [atEnd(MARGIN, SIDES - 1, SIDE, 4), 'blue'],
            [at(MARGIN, SIDES + 240, SIDE, 1), 'hair'],
            [atEnd(MARGIN, SIDES + 240, SIDE, 1), 'hair'],
            [at(MARGIN + span(6) + 24, SIDES + 68, 1, 486), 'hair'],
          ],
          [at(MARGIN + SIDE + 12, SIDES + 25, 72, 20)],
        ),
        ...frameOf('comparison').decorations,
      ],
    },
    {
      id: 'l_lavan_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head(),
        place('p_chart', 'chart', atEnd(MARGIN, ZONE, span(8), 510)),
        // Two figures share the first column, half of its height each.
        place('p_stat1', 'number', at(MARGIN, ZONE, THIRD, 84), 'title'),
        place('p_stat1_body', 'body', at(MARGIN, ZONE + 90, THIRD, 126), 'body'),
        place('p_stat2', 'number', at(MARGIN, ZONE + 320, THIRD, 84), 'title'),
        place('p_stat2_body', 'body', at(MARGIN, ZONE + 410, THIRD, 126), 'body'),
        place('p_source', 'caption', atEnd(MARGIN, 856, span(8), 68), 'caption'),
        ...frameOf('chart').placeholders,
      ],
      decorations: [
        rect('d_lavan_chart_column', at(column(4) - 24, ZONE, 1, 594), HAIR),
        rect('d_lavan_chart_split', at(MARGIN, ZONE + 296, THIRD, 1), HAIR),
        ...frameOf('chart').decorations,
      ],
    },
    {
      id: 'l_lavan_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head(span(8)),
        place('p_table', 'table', at(MARGIN, 308, WIDTH, 606)),
        // The note stands beside the title, where the head has room: the table takes the sheet.
        place('p_note', 'caption', atEnd(MARGIN, 152, span(4), 136), 'caption'),
        ...frameOf('table').placeholders,
      ],
      decorations: frameOf('table').decorations,
    },
    {
      id: 'l_lavan_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start, ZONE, span(3), 350)),
          place(`p_person${i + 1}`, 'subtitle', at(start, 696, span(3), 53), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start, 750, span(3), 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start, 788, span(3), 135), 'caption'),
        ]),
        ...frameOf('team').placeholders,
      ],
      decorations: frameOf('team').decorations,
    },
    {
      id: 'l_lavan_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        kicker(),
        // The title stops two columns short of the end side, which the blue square holds.
        place('p_title', 'title', at(MARGIN, 208, span(10), 336), 'display', {
          vAlign: 'bottom',
        }),
        ...columns3.map((start, i) =>
          place(`p_line${i + 1}`, 'body', at(start, 680, THIRD, 210), 'body'),
        ),
        place('p_contact', 'caption', at(MARGIN, 928, 1400, 68), 'caption'),
      ],
      decorations: [
        ...top('closing'),
        // The mark's blue square at the size of the title, standing on the rule: the full stop
        // of the deck.
        rect('d_lavan_closing_blue', atEnd(MARGIN, 492, 96, 96), BLUE),
        rect('d_lavan_closing_split', at(MARGIN, 588, WIDTH, 2), INK),
        ...columns3.map((start, i) =>
          index(`d_lavan_closing_n${i + 1}`, at(start, 614, 96, 53), i + 1),
        ),
        rect('d_lavan_closing_rule', at(MARGIN, 910, WIDTH, 1), HAIR),
        mark('d_lavan_closing_mark', atEnd(MARGIN, 936, 48, 48)),
      ],
    },
  ];
}

/**
 * The layouts the mirror gets wrong for a left-to-right deck. Only the quote: its mark is a
 * glyph of the direction, and a mirrored closing mark is not an opening one.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  const quote = drawn.find((layout) => layout.id === 'l_lavan_quote');
  if (!quote) return [];
  const mirrored = mirrorLayout(quote);
  return [
    {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) =>
        decoration.id === 'd_lavan_quote_glyph'
          ? quoteGlyph(decoration.frame, QUOTE_LTR)
          : decoration,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: the year of an invented product design studio, on the layouts

const YEARS = ['2021', '2022', '2023', '2024', '2025', '2026'];
const DESIGN = [6.2, 7.1, 8.4, 9.0, 10.3, 11.6];
const RESEARCH = [0.8, 1.4, 2.3, 3.4, 4.9, 6.8];
const TABLE_COLS = [560, 330, 300, 280, 258];
const TABLE_ROW = 75;

const FOOTER_HE = text('לבן סטודיו · סיכום שנתי 2026');

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_lavan_hero',
    name: 'פתיחה',
    content: {
      caption: [text('ANNUAL REVIEW 2026'), text('מוצג ללקוחות ולשותפים · 14 בינואר 2027')],
      title: text('שנה של', 'עיצוב שקט'),
      subtitle: text('לבן סטודיו · עיצוב מוצר · סיכום 2026'),
      image: { assetId: pictures.lavanChair1.id },
    },
  },
  {
    layout: 'l_lavan_section',
    name: 'השנה במספרים',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('השנה במספרים'),
      subtitle: text('מה יצא לשוק, מי חזר אלינו, וכמה זמן עבר מסקיצה ועד מדף.'),
    },
  },
  {
    layout: 'l_lavan_big_number',
    name: 'מוצרים',
    content: {
      caption: [
        text('OUTPUT'),
        text('לעומת 2025'),
        text('שבועות בממוצע מסקיצה ראשונה ועד אב-טיפוס עובד'),
        text('מהלקוחות חזרו לפרויקט נוסף'),
      ],
      title: text('שנת שיא על המדף'),
      number: [text('38'), text('+46%'), text('11'), text('92%')],
      subtitle: text('מוצרים שעיצבנו ויצאו לשוק ב-2026'),
      body: text(
        'לעומת 26 בשנה שעברה. רוב הגידול בא מלקוחות קיימים, שחזרו עם קו מוצרים שני ושלישי.',
      ),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_lavan_chart',
    name: 'הכנסות לפי תחום',
    content: {
      caption: [
        text('REVENUE BY PRACTICE'),
        text('מחקר ואסטרטגיה: מחקר משתמשים, אסטרטגיית מוצר וליווי השקה.'),
      ],
      title: text('המחקר גדל מהר יותר מהעיצוב'),
      number: [text('+39%'), text('+13%')],
      body: [
        text('הכנסות המחקר והאסטרטגיה, לעומת 2025.'),
        text('הכנסות עיצוב המוצר, באותה תקופה.'),
      ],
      footer: FOOTER_HE,
    },
    chart: {
      chartType: 'column',
      title: 'הכנסות לפי תחום, מיליוני ₪',
      data: {
        categories: YEARS,
        series: [
          { name: 'עיצוב מוצר', values: DESIGN },
          { name: 'מחקר ואסטרטגיה', values: RESEARCH },
        ],
      },
    },
  },
  {
    layout: 'l_lavan_table',
    name: 'המוצרים של השנה',
    content: {
      caption: [
        text('PROJECTS 2026'),
        text(
          'יחידות שנמכרו עד 31 בדצמבר 2026, לפי דיווחי הלקוחות. הדירוג הוא ממוצע הביקורות בחנויות המקוונות.',
        ),
      ],
      title: text('שבעה מוצרים שהובילו את השנה'),
      footer: FOOTER_HE,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['מוצר', 'קטגוריה', 'מסקיצה למדף', 'יחידות שנמכרו', 'דירוג לקוחות'],
        ['כיסא נערם ״קו״', 'ריהוט', '9 חודשים', '12,300', '4.8'],
        ['קומקום ״טיפה״', 'מוצרי בית', '11 חודשים', '68,500', '4.7'],
        ['מנורת שולחן ״אלומה״', 'תאורה', '8 חודשים', '41,000', '4.9'],
        ['רמקול ״הד״', 'אלקטרוניקה', '10 חודשים', '54,200', '4.6'],
        ['מד לחץ דם ״דופק״', 'מכשור רפואי', '16 חודשים', '27,800', '4.8'],
        ['מנעול אופניים ״טבעת״', 'ספורט', '7 חודשים', '33,900', '4.5'],
        ['תרמוס ״חום״', 'מוצרי בית', '6 חודשים', '90,400', '4.7'],
      ],
    },
  },
  {
    layout: 'l_lavan_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'הם הורידו מהמוצר שלנו שליש מהחלקים, ואף לקוח לא הרגיש שחסר משהו. ההחזרות ירדו בחצי.',
      ),
      attribution: text('תמר גלעד'),
      caption: text('מנכ״לית, הד מוצרי שמע · לקוחה מאז 2022, שלושה מוצרים משותפים'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_lavan_section',
    name: 'איך אנחנו עובדים',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('איך אנחנו עובדים'),
      subtitle: text('שלושה עקרונות, חודש ראשון אחד, ומוצר שמדגים את כולם.'),
    },
  },
  {
    layout: 'l_lavan_cards',
    name: 'עקרונות',
    content: {
      caption: [
        text('PRINCIPLES'),
        text('לפני שמציירים'),
        text('בזמן שמעצבים'),
        text('לפני שמציגים'),
      ],
      title: text('שלושה עקרונות שחוזרים בכל פרויקט'),
      subtitle: [
        text('מתחילים מהשימוש, לא מהצורה'),
        text('מורידים עד שנשאר העיקר'),
        text('בונים מודל לפני שמדברים'),
      ],
      body: [
        text('לפני הסקיצה הראשונה אנחנו צופים באנשים משתמשים במה שיש להם היום, בבית ובעבודה.'),
        text('כל חלק, כפתור וקו צריכים להצדיק את מקומם. מה שלא משרת את השימוש יוצא.'),
        text('מודל ראשון בקלקר כבר בשבוע הרביעי. מחליטים מול חפץ שאפשר להחזיק, לא מול הדמיה.'),
        text('התוצאה: פחות סבבי תיקונים. ב-2026 ירד הממוצע לפרויקט מ-5.1 סבבים ל-3.4.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_lavan_process',
    name: 'החודש הראשון',
    content: {
      caption: [
        text('THE FIRST MONTH'),
        text('אצל המשתמשים, בבית ובעבודה, עם מצלמה ומחברת.'),
        text('מה עובד היום, מה מפריע ומה חסר לגמרי.'),
        text('שלושה כיוונים שונים באמת, עדיין על נייר.'),
        text('קלקר, קרטון והדפסה תלת-ממדית, בגודל מלא.'),
        text('הלקוח מחזיק, משווה ובוחר כיוון אחד.'),
      ],
      title: text('מהבריף ועד מודל ביד ב-20 ימי עבודה'),
      subtitle: [text('תצפית'), text('מיפוי'), text('סקיצות'), text('מודלים'), text('בחירה')],
      number: [text('3 ימים'), text('3 ימים'), text('5 ימים'), text('6 ימים'), text('3 ימים')],
      body: text('אחרי ארבעה שבועות יש מודל שאפשר להחזיק. ב-2024 זה קרה רק בשבוע ה-12.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_lavan_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('BEFORE AND AFTER'), text('עד 2024'), text('מאז 2025')],
      title: text('מה שינינו בדרך העבודה'),
      subtitle: [text('מציגים הדמיות, בונים בסוף'), text('בונים מוקדם, מחליטים מול חפץ')],
      body: [
        bullets(
          'מודל ראשון בשבוע 12',
          'הלקוח רואה את המוצר במצגת',
          '5.1 סבבי תיקונים בממוצע',
          '47 שבועות מסקיצה ועד מדף',
        ),
        bullets(
          'מודל ראשון בשבוע 4',
          'הלקוח מחזיק את המוצר ביד, בסדנה שלנו',
          '3.4 סבבי תיקונים בממוצע',
          '39 שבועות מסקיצה ועד מדף',
        ),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_lavan_text_image',
    name: 'כיסא קו',
    content: {
      caption: text('CASE STUDY'),
      title: text('כיסא ״קו״: פחות חומר, יותר שנים'),
      image: { assetId: pictures.lavanChair2.id },
      subtitle: [text('3.9 ק״ג'), text('נערם עד שמונה'), text('ארבעה חלקים')],
      body: [
        text('שלד אלומיניום ממוחזר ומושב פוליפרופילן, בלי ריפוד ובלי דבק.'),
        text('שמונה כיסאות בגובה 1.3 מטר. מחסן של בית ספר מחזיק פי שלושה.'),
        text('מרכיבים בלי כלים בתוך שתי דקות, ומפרקים למיחזור באותה קלות.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_lavan_full_image',
    name: 'הסטודיו',
    content: {
      image: { assetId: pictures.lavanStudio.id },
      caption: text('THE STUDIO'),
      title: text('בית חדש ביפו: סדנה, מעבדה וגלריה'),
      body: text(
        'עברנו במאי. 620 מ״ר, ובקומת הרחוב גלריה שמציגה את מוצרי השנה, פתוחה לקהל בימי שישי.',
      ),
    },
  },
  {
    layout: 'l_lavan_timeline',
    name: 'התוכנית ל-2027',
    content: {
      caption: [text('PLAN 2027'), text('התוכנית כפופה לאישור השותפים בישיבת פברואר.')],
      title: text('ארבעה צעדים ל-2027'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [
        text('מעבדת חומרים'),
        text('סטודיו בברלין'),
        text('קו ריהוט ראשון'),
        text('50 מוצרים בשנה'),
      ],
      body: [
        text('ספריית חומרים ממוחזרים, פתוחה גם לסטודנטים.'),
        text('צוות של חמישה, קרוב ללקוחות באירופה.'),
        text('שלושה מוצרים בשם הסטודיו, בייצור מקומי.'),
        text('בלי להגדיל את הצוות ביותר מ-20%.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_lavan_team',
    name: 'השותפים',
    content: {
      caption: [
        text('PARTNERS'),
        text('שותפה מייסדת · עיצוב'),
        text('שותף · הנדסה'),
        text('שותפה · מחקר'),
        text('שותף · ייצור'),
      ],
      title: text('ארבעת השותפים'),
      image: [
        { assetId: pictures.lavanTeam1.id },
        { assetId: pictures.lavanTeam2.id },
        { assetId: pictures.lavanTeam3.id },
        { assetId: pictures.lavanTeam4.id },
      ],
      subtitle: [text('יעל שגיא'), text('עומר בן חיים'), text('דנה קורן'), text('איתן לביא')],
      body: [
        text('הקימה את הסטודיו ב-2014, אחרי עשור של עיצוב תאורה באירופה.'),
        text('מהנדס מכונות. דואג שכל סקיצה תהיה גם מוצר שאפשר לייצר.'),
        text('מובילה את מחקר המשתמשים ואת שבוע המחקר שפותח כל פרויקט.'),
        text('מלווה את המוצרים במפעלים, מסדרת הניסיון ועד המדף.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_lavan_closing',
    name: 'סיום',
    content: {
      caption: [
        text('NEXT STEPS'),
        text('לבן סטודיו · רחוב הנגרים 12, יפו · studio@lavan.example'),
      ],
      title: text('המוצר הבא', 'מתחיל בשיחה'),
      body: [
        text('שיחת היכרות של שעה, בסטודיו או אצלכם, בלי התחייבות.'),
        text('שבוע של מחקר ראשוני, ובסופו מסמך כיוון של עמוד אחד.'),
        text('הצעת עבודה עם לוח זמנים ומחיר קבוע לכל שלב.'),
      ],
    },
  },
];

const FOOTER_EN = text('Lavan Studio · Annual review 2026');

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_lavan_hero',
    name: 'Cover',
    content: {
      caption: [
        text('ANNUAL REVIEW 2026'),
        text('Presented to clients and partners · 14 January 2027'),
      ],
      title: text('A year of', 'quiet design'),
      subtitle: text('Lavan Studio · Product design · 2026 in review'),
      image: { assetId: pictures.lavanChair1.id },
    },
  },
  {
    layout: 'l_lavan_section',
    name: 'The year in numbers',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('In numbers'),
      subtitle: text('What we shipped, who came back, and how long it took from sketch to shelf.'),
    },
  },
  {
    layout: 'l_lavan_big_number',
    name: 'Products',
    content: {
      caption: [
        text('OUTPUT'),
        text('on 2025'),
        text('weeks from sketch to working prototype'),
        text('of clients came back for another project'),
      ],
      title: text('A record on the shelf'),
      number: [text('38'), text('+46%'), text('11'), text('92%')],
      subtitle: text('products launched in 2026'),
      body: text(
        'Up from 26 last year. Most of the growth came from existing clients, back for a second and a third product line.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_lavan_chart',
    name: 'Revenue by practice',
    content: {
      caption: [
        text('REVENUE BY PRACTICE'),
        text('Research and strategy: user research, product strategy and launch support.'),
      ],
      title: text('Research is growing faster than design'),
      number: [text('+39%'), text('+13%')],
      body: [
        text('Research and strategy revenue, on 2025.'),
        text('Product design revenue, same period.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Revenue by practice, NIS millions',
      data: {
        categories: YEARS,
        series: [
          { name: 'Product design', values: DESIGN },
          { name: 'Research and strategy', values: RESEARCH },
        ],
      },
    },
  },
  {
    layout: 'l_lavan_table',
    name: 'Products of the year',
    content: {
      caption: [
        text('PROJECTS 2026'),
        text(
          'Units sold to 31 December 2026, as reported by clients. Ratings are the average of online store reviews.',
        ),
      ],
      title: text('Seven products that led the year'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['Product', 'Category', 'Sketch to shelf', 'Units sold', 'Rating'],
        ['Kav stacking chair', 'Furniture', '9 months', '12,300', '4.8'],
        ['Tipa kettle', 'Homeware', '11 months', '68,500', '4.7'],
        ['Aluma desk lamp', 'Lighting', '8 months', '41,000', '4.9'],
        ['Hed speaker', 'Electronics', '10 months', '54,200', '4.6'],
        ['Dofek blood-pressure monitor', 'Medical devices', '16 months', '27,800', '4.8'],
        ['Taba’at bike lock', 'Sport', '7 months', '33,900', '4.5'],
        ['Hom flask', 'Homeware', '6 months', '90,400', '4.7'],
      ],
    },
  },
  {
    layout: 'l_lavan_quote',
    name: 'Quote',
    content: {
      quote: text(
        'They took a third of the parts out of our product, and not one customer felt anything was missing. Returns fell by half.',
      ),
      attribution: text('Tamar Gilad'),
      caption: text('CEO, Hed Audio · a client since 2022, three products together'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_lavan_section',
    name: 'How we work',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('How we work'),
      subtitle: text('Three principles, one first month, and a product that shows them all.'),
    },
  },
  {
    layout: 'l_lavan_cards',
    name: 'Principles',
    content: {
      caption: [
        text('PRINCIPLES'),
        text('Before we draw'),
        text('While we design'),
        text('Before we present'),
      ],
      title: text('Three principles in every project'),
      subtitle: [
        text('Start from use, not from form'),
        text('Take away until it is clear'),
        text('Build a model before talking'),
      ],
      body: [
        text(
          'Before the first sketch we watch people use what they have today, at home and at work.',
        ),
        text(
          'Every part, button and line has to earn its place. What does not serve the use comes out.',
        ),
        text('A first foam model by week four. We decide in front of an object, not a rendering.'),
        text(
          'The result: fewer rounds of changes. In 2026 the average per project fell from 5.1 to 3.4.',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_lavan_process',
    name: 'The first month',
    content: {
      caption: [
        text('THE FIRST MONTH'),
        text('With the users, at home and at work, camera and notebook.'),
        text('What works today, what gets in the way, what is missing.'),
        text('Three directions that really differ, still on paper.'),
        text('Foam, card and 3D print, at full size.'),
        text('The client holds, compares and picks one direction.'),
      ],
      title: text('From brief to a model in hand in 20 working days'),
      subtitle: [text('Observe'), text('Map'), text('Sketch'), text('Model'), text('Choose')],
      number: [text('3 days'), text('3 days'), text('5 days'), text('6 days'), text('3 days')],
      body: text(
        'After four weeks there is a model you can hold. In 2024 that came only in week 12.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_lavan_comparison',
    name: 'Before and after',
    content: {
      caption: [text('BEFORE AND AFTER'), text('Until 2024'), text('Since 2025')],
      title: text('What we changed in the way we work'),
      subtitle: [text('Show renderings, build last'), text('Build early, decide by hand')],
      body: [
        bullets(
          'First model in week 12',
          'The client sees the product in a deck',
          '5.1 rounds of changes on average',
          '47 weeks from sketch to shelf',
        ),
        bullets(
          'First model in week 4',
          'The client holds the product, in our workshop',
          '3.4 rounds of changes on average',
          '39 weeks from sketch to shelf',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_lavan_text_image',
    name: 'The Kav chair',
    content: {
      caption: text('CASE STUDY'),
      title: text('The Kav chair: less material, more years'),
      image: { assetId: pictures.lavanChair2.id },
      subtitle: [text('3.9 kg'), text('Stacks to eight'), text('Four parts')],
      body: [
        text('A recycled aluminium frame and a polypropylene seat. No upholstery, no glue.'),
        text('Eight chairs stand 1.3 metres high. A school storeroom holds three times as many.'),
        text('Assembled without tools in two minutes, and taken apart for recycling as easily.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_lavan_full_image',
    name: 'The studio',
    content: {
      image: { assetId: pictures.lavanStudio.id },
      caption: text('THE STUDIO'),
      title: text('A new home in Jaffa: workshop, lab and gallery'),
      body: text(
        'We moved in May. 620 square metres, with a street-level gallery of the year’s products, open on Fridays.',
      ),
    },
  },
  {
    layout: 'l_lavan_timeline',
    name: 'The plan for 2027',
    content: {
      caption: [
        text('PLAN 2027'),
        text('The plan is subject to the partners’ approval at the February meeting.'),
      ],
      title: text('Four steps for 2027'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [
        text('Materials lab'),
        text('A Berlin studio'),
        text('First furniture line'),
        text('50 products a year'),
      ],
      body: [
        text('A library of recycled materials, open to students too.'),
        text('A team of five, close to our clients in Europe.'),
        text('Three products under the studio’s name, made locally.'),
        text('Without growing the team by more than 20%.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_lavan_team',
    name: 'The partners',
    content: {
      caption: [
        text('PARTNERS'),
        text('Founding partner · Design'),
        text('Partner · Engineering'),
        text('Partner · Research'),
        text('Partner · Production'),
      ],
      title: text('The four partners'),
      image: [
        { assetId: pictures.lavanTeam1.id },
        { assetId: pictures.lavanTeam2.id },
        { assetId: pictures.lavanTeam3.id },
        { assetId: pictures.lavanTeam4.id },
      ],
      subtitle: [text('Yael Sagi'), text('Omer Ben Haim'), text('Dana Koren'), text('Eitan Lavi')],
      body: [
        text('Founded the studio in 2014, after a decade of lighting design in Europe.'),
        text('A mechanical engineer. Makes sure every sketch can also be made.'),
        text('Leads user research and the research week that opens every project.'),
        text('Sees products through the factories, from pilot run to shelf.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_lavan_closing',
    name: 'Closing',
    content: {
      caption: [
        text('NEXT STEPS'),
        text('Lavan Studio · 12 HaNagarim Street, Jaffa · studio@lavan.example'),
      ],
      title: text('It starts', 'with a talk'),
      body: [
        text('An hour to get acquainted, at the studio or at your place.'),
        text('A week of first research and a one-page direction paper.'),
        text('A proposal with a schedule and a fixed price per stage.'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const lavanSamples = { he: sampleHe, en: sampleEn };

/** The Lavan template: the theme, fourteen layouts for both directions, and its sample deck. */
export function lavanTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(lavanTheme),
    description: 'Minimal: a white sheet, light type and one blue, for studios and product work.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.lavanStudio,
      pictures.lavanChair1,
      pictures.lavanChair2,
      pictures.lavanTeam1,
      pictures.lavanTeam2,
      pictures.lavanTeam3,
      pictures.lavanTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
