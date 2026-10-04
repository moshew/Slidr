import type { Element, Frame, Layout, Theme } from '@slidr/model';
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
 * Tzuk: the business template. Paper, ink and one deep green; serif headings, thin rules, and
 * numbers set large. Derived from the reference deck `docs/reference-decks/tzuk.html`, whose
 * theme block holds these same values.
 *
 * The heading font is one family for both scripts: its figures are lining by default, and a
 * layout cannot ask a font for another set of figures.
 */
export const tzukTheme: Theme = {
  id: 'tzuk',
  name: 'Tzuk',
  colors: {
    bg: '#f7f5f0',
    surface: '#ffffff',
    text: '#16202e',
    muted: '#5c6470',
    primary: '#0f5b45',
    secondary: '#1d3557',
    accent: '#b8893a',
    chart: ['#0f5b45', '#1d3557', '#b8893a', '#7fa896', '#8a93a6', '#d9c6a0'],
  },
  fonts: {
    heading: { he: 'Frank Ruhl Libre', latin: 'Frank Ruhl Libre' },
    body: { he: 'Assistant', latin: 'Inter' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 128,
      weight: 700,
      lineHeight: 1.05,
      color: { token: 'text' },
    },
    title: { font: 'heading', size: 68, weight: 700, lineHeight: 1.15, color: { token: 'text' } },
    heading: { font: 'heading', size: 44, weight: 600, lineHeight: 1.2, color: { token: 'text' } },
    body: { font: 'body', size: 30, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 4,
  shadow: { x: 0, y: 12, blur: 32, color: { value: '#16202e', alpha: 0.1 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    { fill: { kind: 'solid', color: { token: 'surface' } } },
    { fill: { kind: 'solid', color: { token: 'primary' } } },
    { fill: { kind: 'solid', color: { token: 'secondary' } } },
  ],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

const HAIR = solid(token('text', 0.18));
const INK = solid(token('text'));
const GREEN = solid(token('primary'));
const BRASS = solid(token('accent'));

/** The literal colours of the drawings, and the tokens they stand for. */
const PAINT = {
  '#0f5b45': token('primary'),
  '#b8893a': token('accent'),
  '#5c6470': token('muted'),
  '#f7f5f0': token('bg'),
};

const MARK =
  '<svg viewBox="0 0 40 40"><path fill="#0f5b45" d="M3 37V15L24 5v32z"/><path fill="#b8893a" d="M28 29h9v8h-9z"/></svg>';

/** The mark of the template: a cliff and a block at its foot. A deck replaces it with its logo. */
const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** An arrow to the next step, drawn for a right-to-left slide: the mirror turns it. */
const ARROW =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#5c6470" stroke-width="2" stroke-linecap="square"><path d="M20 12H5M11 5l-7 7 7 7"/></svg>';

/** The quotation mark of each direction. They are two marks, not one mark and its mirror. */
const QUOTE_RTL =
  '<svg viewBox="0 0 66 52"><path fill="#b8893a" d="M66 0v22c0 18-9 28-26 30V42c8-2 12-7 12-16H40V0h26ZM26 0v22C26 40 17 50 0 52V42c8-2 12-7 12-16H0V0h26Z"/></svg>';
const QUOTE_LTR =
  '<svg viewBox="0 0 66 52"><path fill="#b8893a" d="M0 52V30C0 12 9 2 26 0v10c-8 2-12 7-12 16h12v26H0Zm40 0V30C40 12 49 2 66 0v10c-8 2-12 7-12 16h12v26H40Z"/></svg>';

/** The short brass rule that opens the line over a title. */
const tick = (id: string, top = 95) => rect(id, at(96, top, 40, 3), BRASS);

/** The line over a title and the title itself, as every content slide has them. */
const head = (width = 1728, lines = 1) => [
  place('p_kicker', 'caption', at(152, 80, Math.min(900, width - 56), 34), 'caption'),
  place('p_title', 'title', at(96, 122, width, 79 * lines), 'title'),
];

/**
 * What frames a content slide besides its head: the brass rule before the line over the title,
 * and the foot, a hairline with the mark at the start, and at the end the deck's name with the
 * slide's number beyond it (SLD-04). The mark stands alone at its side, which leaves a logo of
 * any width room to replace it.
 */
function frameOf(
  name: string,
  width = 1728,
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  return {
    placeholders: [
      place('p_footer', 'footer', at(96 + width - 900, 958, 828, 34), 'caption', { align: 'end' }),
    ],
    decorations: [
      tick(`d_tzuk_${name}_tick`),
      rect(`d_tzuk_${name}_rule`, at(96, 940, width, 1), HAIR),
      mark(`d_tzuk_${name}_mark`, at(96, 957, 34, 34)),
      pageNumber(`d_tzuk_${name}_number`, at(96 + width - 60, 958, 60, 34)),
    ],
  };
}

/** A field of colour at the end side, 720 wide: the poster slides share it. */
const field = (id: string, color: 'primary' | 'secondary') =>
  rect(id, atEnd(0, 0, 720, 1080), solid(token(color)));

/** Steps that climb towards the edge of a field: the motif of the template, drawn in the field. */
function climb(id: string, frame: Frame, rise: number): Element {
  const { w, h } = frame;
  const tread = w / 3;
  const corners = [0, 1, 2].flatMap((i) => [
    [w - i * tread, h - (i + 1) * rise],
    [w - (i + 1) * tread, h - (i + 1) * rise],
  ]);
  const points = corners.map(([x, y]) => `${x},${y}`).join(' ');
  const markup =
    `<svg viewBox="0 0 ${w} ${h}">` +
    `<polygon fill="#f7f5f0" fill-opacity="0.07" points="${w},${h} ${points} 0,${h}"/>` +
    `<polyline fill="none" stroke="#b8893a" stroke-width="3" points="${points}"/></svg>`;
  return drawing(id, frame, markup, PAINT);
}

/** The staircase of the timeline: four treads, a square where each begins. */
const TREADS = [560, 498, 436, 374] as const;
const STAIR_TOP = 354;
const STAIR_BOTTOM = 880;
function staircase(id: string): Element {
  const height = STAIR_BOTTOM - STAIR_TOP;
  // Physical x of a right-to-left slide: the first step begins at the right edge.
  const x = [1728, 1284, 840, 396, 0] as const;
  const outline = TREADS.flatMap((tread, i) => {
    const level = tread - STAIR_TOP;
    return [`${x[i]},${level}`, `${x[i + 1]},${level}`];
  });
  const squares = TREADS.map((tread, i) => {
    const left = i === 0 ? 1714 : (x[i] ?? 0) - 7;
    return `<rect fill="#b8893a" x="${left}" y="${tread - STAIR_TOP - 7}" width="14" height="14"/>`;
  }).join('');
  const markup =
    `<svg viewBox="0 0 1728 ${height}">` +
    `<polygon fill="#0f5b45" fill-opacity="0.07" points="1728,${height} ${outline.join(' ')} 0,${height}"/>` +
    `<polyline fill="none" stroke="#0f5b45" stroke-width="3" points="${outline.join(' ')}"/>` +
    `${squares}</svg>`;
  return drawing(id, at(96, STAIR_TOP, 1728, height), markup, PAINT);
}

/**
 * The number of a step, set by the layout itself. Its box is as wide as its two figures, so the
 * number stays on the margin when the layout is mirrored.
 */
const stepNumber = (id: string, frame: Frame, n: number) =>
  label(id, frame, `0${n}`, 'heading', { color: token('primary') });

const quoteGlyph = (frame: Frame, markup: string) =>
  drawing('d_tzuk_quote_glyph', frame, markup, PAINT);

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const columns4 = [96, 540, 984, 1428];
const cards3 = [96, 688, 1280];
const steps5 = [96, 450, 804, 1158, 1512];
const rows3 = [292, 502, 712];
const lines3 = [440, 554, 668];
const stats3 = [282, 488, 694];

function layouts(): Layout[] {
  return [
    {
      id: 'l_tzuk_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        place('p_kicker', 'caption', at(152, 330, 800, 34), 'caption'),
        place('p_title', 'title', at(96, 372, 1008, 270), 'display'),
        place('p_subtitle', 'subtitle', at(96, 672, 1008, 160), 'heading'),
        place('p_meta', 'caption', at(96, 958, 1008, 34), 'caption'),
        place('p_image', 'image', atEnd(0, 0, 720, 780)),
      ],
      decorations: [
        // The picture stands on a field of the strong colour.
        rect('d_tzuk_hero_field', atEnd(0, 780, 720, 300), GREEN),
        climb('d_tzuk_hero_climb', atEnd(0, 780, 720, 300), 75),
        mark('d_tzuk_hero_mark', at(96, 80, 48, 48)),
        tick('d_tzuk_hero_tick', 345),
        rect('d_tzuk_hero_rule', at(96, 940, 544, 1), HAIR),
      ],
    },
    {
      id: 'l_tzuk_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        place('p_number', 'number', at(96, 262, 1008, 135), 'display'),
        place('p_kicker', 'caption', at(152, 80, 800, 34), 'caption'),
        place('p_title', 'title', at(96, 456, 1008, 270), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 752, 1008, 160), 'heading'),
      ],
      decorations: [
        field('d_tzuk_section_field', 'primary'),
        climb('d_tzuk_section_climb', atEnd(0, 0, 720, 1080), 180),
        tick('d_tzuk_section_tick'),
        rect('d_tzuk_section_rule', at(96, 428, 1008, 2), INK),
      ],
    },
    {
      id: 'l_tzuk_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head(1088),
        place('p_number', 'number', at(96, 344, 1088, 135), 'display'),
        place('p_label', 'subtitle', at(96, 530, 1088, 53), 'heading'),
        place('p_body', 'body', at(96, 604, 940, 135), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', at(1280, top, 544, 79), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', at(1280, top + 92, 544, 68), 'caption'),
        ]),
        ...frameOf('big_number').placeholders,
      ],
      decorations: [
        rect('d_tzuk_big_number_bar', at(96, 500, 96, 3), BRASS),
        rect('d_tzuk_big_number_column', at(1232, 262, 1, 618), HAIR),
        ...stats3
          .slice(0, 2)
          .map((top, i) =>
            rect(`d_tzuk_big_number_rule${i + 1}`, at(1280, top + 176, 544, 1), HAIR),
          ),
        ...frameOf('big_number').decorations,
      ],
    },
    {
      id: 'l_tzuk_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(96, 232, 1008, 395), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(96, 706, 1008, 53), 'heading'),
        place('p_caption', 'caption', at(96, 768, 1008, 68), 'caption'),
        place('p_footer', 'footer', at(204, 958, 900, 34), 'caption', { align: 'end' }),
      ],
      decorations: [
        field('d_tzuk_quote_field', 'secondary'),
        quoteGlyph(atEnd(240, 446, 240, 189), QUOTE_RTL),
        rect('d_tzuk_quote_top', at(96, 162, 1008, 2), INK),
        rect('d_tzuk_quote_bar', at(96, 678, 96, 3), BRASS),
        rect('d_tzuk_quote_rule', at(96, 940, 1008, 1), HAIR),
        mark('d_tzuk_quote_mark', at(96, 957, 34, 34)),
      ],
    },
    {
      id: 'l_tzuk_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head(988, 2),
        place('p_image', 'image', atEnd(96, 80, 640, 800)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(244, top + 12, 840, 53), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(244, top + 62, 840, 135), 'body'),
        ]),
        ...frameOf('text_image', 988).placeholders,
      ],
      decorations: [
        ...rows3.flatMap((top, i) => [
          rect(`d_tzuk_text_image_rule${i + 1}`, at(96, top, 988, 1), HAIR),
          stepNumber(`d_tzuk_text_image_n${i + 1}`, at(96, top + 12, 52, 53), i + 1),
        ]),
        ...frameOf('text_image', 988).decorations,
      ],
    },
    {
      id: 'l_tzuk_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture runs from edge to edge; the text has a band of its own under it, because
        // nothing of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 620)),
        place('p_kicker', 'caption', at(152, 676, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 718, 1060, 158), 'title'),
        place('p_body', 'body', atEnd(96, 724, 560, 180), 'body'),
      ],
      decorations: [
        rect('d_tzuk_full_image_band', atEnd(0, 620, 1920, 8), GREEN),
        tick('d_tzuk_full_image_tick', 691),
        rect('d_tzuk_full_image_column', atEnd(704, 724, 1, 152), HAIR),
      ],
    },
    {
      id: 'l_tzuk_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head(),
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}`, 'subtitle', at(start + 40, 356, 464, 106), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_card${i + 1}_body`, 'body', at(start + 40, 506, 464, 180), 'body'),
          place(`p_card${i + 1}_note`, 'caption', at(start + 40, 286, 464, 68), 'caption', {
            vAlign: 'bottom',
          }),
        ]),
        place('p_takeaway', 'body', at(96, 772, 1728, 90), 'body'),
        ...frameOf('cards').placeholders,
      ],
      decorations: [
        ...cards3.flatMap((start, i) => [
          rect(`d_tzuk_cards_card${i + 1}`, at(start, 262, 544, 458), solid(token('surface')), {
            stroke: { color: token('text', 0.14), width: 1 },
            effects: { radius: 4 },
          }),
          rect(`d_tzuk_cards_bar${i + 1}`, at(start, 262, 544, 4), GREEN),
          rect(`d_tzuk_cards_rule${i + 1}`, at(start + 40, 482, 464, 1), HAIR),
        ]),
        ...frameOf('cards').decorations,
      ],
    },
    {
      id: 'l_tzuk_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => {
          const tread = TREADS[i] ?? 0;
          return [
            place(`p_when${i + 1}`, 'number', at(start + 28, tread - 170, 364, 158), 'title', {
              vAlign: 'bottom',
            }),
            place(`p_what${i + 1}`, 'subtitle', at(start + 28, tread + 18, 364, 106), 'heading', {
              vAlign: 'bottom',
            }),
            place(`p_what${i + 1}_body`, 'body', at(start + 28, tread + 134, 364, 170), 'caption'),
          ];
        }),
        place('p_note', 'caption', at(96, 894, 1728, 34), 'caption'),
        ...frameOf('timeline').placeholders,
      ],
      decorations: [staircase('d_tzuk_timeline_steps'), ...frameOf('timeline').decorations],
    },
    {
      id: 'l_tzuk_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start, 340, 312, 106), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_step${i + 1}_body`, 'caption', at(start, 456, 304, 102), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start, 590, 312, 158), 'title'),
        ]),
        place('p_summary', 'body', at(96, 770, 1728, 106), 'heading'),
        ...frameOf('process').placeholders,
      ],
      decorations: [
        ...steps5.flatMap((start, i) => [
          rect(`d_tzuk_process_head${i + 1}`, at(start, 262, 312, 2), INK),
          stepNumber(`d_tzuk_process_n${i + 1}`, at(start, 284, 52, 53), i + 1),
          rect(`d_tzuk_process_base${i + 1}`, at(start, 574, 312, 4), GREEN),
        ]),
        ...steps5
          .slice(0, 4)
          .map((start, i) =>
            drawing(`d_tzuk_process_arrow${i + 1}`, at(start + 276, 294, 36, 36), ARROW, PAINT),
          ),
        ...frameOf('process').decorations,
      ],
    },
    {
      id: 'l_tzuk_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head(),
        place('p_before_tag', 'caption', at(136, 298, 760, 34), 'caption'),
        place('p_before', 'subtitle', at(136, 342, 760, 106), 'heading'),
        place('p_before_body', 'body', at(136, 496, 760, 360), 'body'),
        place('p_after_tag', 'caption', atEnd(136, 298, 760, 34), 'caption'),
        place('p_after', 'subtitle', atEnd(136, 342, 760, 106), 'heading'),
        place('p_after_body', 'body', atEnd(136, 496, 760, 360), 'body'),
        ...frameOf('comparison').placeholders,
      ],
      decorations: [
        // What was planned stands on the paper; what happened, on a tint of the strong colour.
        rect('d_tzuk_comparison_before', at(96, 262, 840, 2), INK),
        rect('d_tzuk_comparison_after', atEnd(96, 262, 840, 618), solid(token('primary', 0.08)), {
          effects: { radius: 4 },
        }),
        rect('d_tzuk_comparison_bar', atEnd(96, 262, 840, 4), GREEN),
        rect('d_tzuk_comparison_rule1', at(136, 470, 760, 1), HAIR),
        rect('d_tzuk_comparison_rule2', atEnd(136, 470, 760, 1), HAIR),
        ...frameOf('comparison').decorations,
      ],
    },
    {
      id: 'l_tzuk_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head(),
        place('p_chart', 'chart', at(96, 262, 1136, 638)),
        place('p_stat1', 'number', at(1328, 250, 496, 135), 'display'),
        place('p_stat1_body', 'body', at(1328, 388, 496, 135), 'body'),
        place('p_stat2', 'number', at(1328, 546, 496, 135), 'display'),
        place('p_stat2_body', 'body', at(1328, 684, 496, 135), 'body'),
        place('p_source', 'caption', at(1328, 832, 496, 68), 'caption'),
        ...frameOf('chart').placeholders,
      ],
      decorations: [
        rect('d_tzuk_chart_column', at(1280, 262, 1, 638), HAIR),
        rect('d_tzuk_chart_divider', at(1328, 536, 496, 1), HAIR),
        ...frameOf('chart').decorations,
      ],
    },
    {
      id: 'l_tzuk_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head(),
        place('p_table', 'table', at(96, 232, 1728, 630)),
        place('p_note', 'caption', at(96, 872, 1728, 68), 'caption'),
        ...frameOf('table').placeholders,
      ],
      decorations: frameOf('table').decorations,
    },
    {
      id: 'l_tzuk_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start, 262, 396, 420)),
          place(`p_person${i + 1}`, 'subtitle', at(start, 708, 396, 53), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start, 768, 396, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start, 810, 396, 102), 'caption'),
        ]),
        ...frameOf('team').placeholders,
      ],
      decorations: [
        ...columns4.map((start, i) =>
          rect(`d_tzuk_team_bar${i + 1}`, at(start, 682, 396, 4), GREEN),
        ),
        ...frameOf('team').decorations,
      ],
    },
    {
      id: 'l_tzuk_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(152, 80, 800, 34), 'caption'),
        place('p_title', 'title', at(96, 132, 1008, 270), 'display'),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(140, top + 12, 964, 90), 'body', {
            vAlign: 'middle',
          }),
        ),
        place('p_contact', 'caption', at(96, 938, 1008, 34), 'caption'),
      ],
      decorations: [
        field('d_tzuk_closing_field', 'primary'),
        climb('d_tzuk_closing_climb', atEnd(0, 0, 720, 1080), 180),
        tick('d_tzuk_closing_tick'),
        rect('d_tzuk_closing_top', at(96, 440, 1008, 2), INK),
        ...lines3.flatMap((top, i) => [
          rect(`d_tzuk_closing_dot${i + 1}`, at(96, top + 50, 14, 14), BRASS),
          rect(`d_tzuk_closing_rule${i + 1}`, at(96, top + 114, 1008, 1), HAIR),
        ]),
        mark('d_tzuk_closing_mark', at(96, 852, 56, 56)),
      ],
    },
  ];
}

/**
 * The layouts the mirror gets wrong for a left-to-right deck. Only the quote: its mark is a
 * glyph of the direction, and a mirrored closing mark is not an opening one.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  const quote = drawn.find((layout) => layout.id === 'l_tzuk_quote');
  if (!quote) return [];
  const mirrored = mirrorLayout(quote);
  return [
    {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) =>
        decoration.id === 'd_tzuk_quote_glyph'
          ? quoteGlyph(decoration.frame, QUOTE_LTR)
          : decoration,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: the reference deck, slide by slide, on the layouts

const FOOTER = text('TZUK ROBOTICS · Q3 2026');
const QUARTERS = ['Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026'];
const HARDWARE = [24.6, 26.0, 27.9, 27.2, 28.6, 29.7];
const SUBSCRIPTION = [9.1, 10.8, 12.4, 14.3, 16.2, 18.5];
const TABLE_COLS = [648, 250, 250, 270, 310];
const TABLE_ROW = 70;
const FACTS =
  'A column of three key figures, one above the other: 42 days from order to go-live, 99.4% fleet uptime, 63 thousand shekels of recurring revenue per robot';

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_tzuk_hero',
    name: 'פתיחה',
    content: {
      caption: [text('INVESTOR UPDATE'), text('מוצג לדירקטוריון ולמשקיעים · 12 בנובמבר 2026')],
      title: text('עדכון', 'למשקיעים'),
      subtitle: text('צוק רובוטיקה · רבעון שלישי 2026'),
      image: { assetId: pictures.tzukWarehouse.id },
    },
  },
  {
    layout: 'l_tzuk_section',
    name: 'תמצית הרבעון',
    content: {
      number: text('I'),
      caption: text('PART ONE'),
      title: text('תמצית הרבעון'),
      subtitle: text('ההכנסות, הרווחיות והמדדים שמאחוריהן.'),
    },
  },
  {
    layout: 'l_tzuk_big_number',
    name: 'הכנסות',
    content: {
      caption: [
        text('REVENUE'),
        text('לעומת Q3 2025 (YoY)'),
        text('לעומת Q2 2026 (QoQ)'),
        text('מההכנסות מגיעות ממנויים, לעומת 29% לפני שנה'),
      ],
      title: text('רבעון שיא בהכנסות'),
      number: [text('48.2'), text('+31%'), text('+7.6%'), text('38%')],
      subtitle: text('מיליון ₪, הכנסות הרבעון השלישי של 2026'),
      body: text(
        'צמיחה של 31% לעומת הרבעון המקביל. הכנסות המנויים גדלו ב-71%, והן כבר 38% מסך ההכנסות.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_cards',
    name: 'מדדים',
    content: {
      caption: [
        text('KEY METRICS'),
        text('ARR · הכנסה שנתית חוזרת'),
        text('GROSS MARGIN · שיעור רווח גולמי'),
        text('INSTALLED BASE · רובוטים מותקנים'),
      ],
      title: text('ארבעה מדדים, כולם משתפרים'),
      subtitle: [text('₪78M'), text('50.2%'), text('1,240')],
      body: [
        text('צמיחה של 70% בשנה. מנויי תוכנה ושירות על 1,240 רובוטים פעילים.'),
        text('עלייה של 7.0 נקודות בשנה. לראשונה מעל 50%, בזכות משקל המנויים.'),
        text('148 רובוטים נוספו ברבעון, ב-46 מרכזים לוגיסטיים בישראל ובאירופה.'),
        text(
          'והרביעי: שימור ההכנסות נטו (NRR) עלה ל-124%. לקוחות קיימים מגדילים ציים ומוסיפים מודולים.',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_chart',
    name: 'תמהיל ההכנסות',
    content: {
      caption: [text('REVENUE MIX'), text('מנויים: תוכנת ניהול הצי, שירות ו-RaaS.')],
      title: text('המנויים סוגרים את הפער מהחומרה'),
      number: [text('+71%'), text('+14%')],
      body: [text('הכנסות המנויים, לעומת Q3 2025.'), text('הכנסות החומרה, באותה תקופה.')],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'הכנסות לפי רבעון, מיליוני ₪',
      data: {
        categories: QUARTERS,
        series: [
          { name: 'חומרה', values: HARDWARE },
          { name: 'מנויים', values: SUBSCRIPTION },
        ],
      },
    },
  },
  {
    layout: 'l_tzuk_table',
    name: 'רווח והפסד',
    content: {
      caption: [
        text('SUMMARY P&L'),
        text('נתונים לא מבוקרים. EBITDA מתואם אינו כולל פחת, הפחתות ותגמול הוני.'),
      ],
      title: text('דוח רווח והפסד תמציתי'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['מיליוני ₪', 'Q3 2025', 'Q2 2026', 'Q3 2026', 'שינוי YoY'],
        ['הכנסות', '36.8', '44.8', '48.2', '+31%'],
        ['מזה: הכנסות מנויים', '10.8', '16.2', '18.5', '+71%'],
        ['רווח גולמי', '15.9', '21.8', '24.2', '+52%'],
        ['שיעור רווח גולמי', '43.2%', '48.7%', '50.2%', '+7.0pp'],
        ['מחקר ופיתוח', '9.6', '10.9', '11.2', '+17%'],
        ['מכירות, שיווק והנהלה', '9.4', '10.6', '10.9', '+16%'],
        ['רווח (הפסד) תפעולי', '−3.1', '0.3', '2.1', '+5.2'],
        ['EBITDA מתואם', '−1.2', '2.4', '4.3', '+5.5'],
      ],
    },
  },
  {
    layout: 'l_tzuk_text_image',
    name: 'T4',
    content: {
      caption: text('PRODUCT'),
      title: text('T4: יותר מטען, פחות עצירות'),
      image: { assetId: pictures.tzukRobot.id },
      subtitle: [text('מטען של 600 ק״ג'), text('טעינה מלאה ב-18 דקות'), text('ניווט בלי תשתית')],
      body: [
        text('50% יותר מ-T3, על אותו שטח רצפה.'),
        text('סוללה מתחלפת, 22 שעות עבודה ביממה.'),
        text('LiDAR ומצלמות בלבד. אתר חדש עולה לאוויר ב-42 ימים.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_comparison',
    name: 'תוכנית מול ביצוע',
    content: {
      caption: [text('PLAN VS. ACTUAL'), text('התוכנית לרבעון'), text('הרבעון בפועל')],
      title: text('הרבעון מול התוכנית'),
      subtitle: [text('הכנסות של 46.0 מיליון ₪'), text('הכנסות של 48.2 מיליון ₪')],
      body: [
        bullets(
          'שיעור רווח גולמי: 49.0%',
          'EBITDA מתואם: 3.0 מיליון ₪',
          'רובוטים שהותקנו: 140',
          'הזמנות חדשות: 55.0 מיליון ₪',
        ),
        bullets(
          'שיעור רווח גולמי: 50.2%',
          'EBITDA מתואם: 4.3 מיליון ₪',
          'רובוטים שהותקנו: 148',
          'הזמנות חדשות: 51.6 מיליון ₪. שתי עסקאות באירופה נחתמו רק באוקטובר',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_process',
    name: 'הטמעה',
    content: {
      caption: [
        text('DEPLOYMENT'),
        text('מיפוי המחסן, סימולציה ותוכנית פריסה חתומה.'),
        text('בנייה ובדיקות במפעל ביקנעם, לפי התצורה.'),
        text('פריקה, מיפוי LiDAR והצבת עמדות הטעינה.'),
        text('אינטגרציה למערכת ניהול המחסן ובדיקות עומס.'),
        text('הפעלה מדורגת, הדרכת משמרות ומסירה ללקוח.'),
      ],
      title: text('מהזמנה ועד Go-live ב-42 ימים'),
      subtitle: [
        text('תכנון האתר'),
        text('ייצור והרכבה'),
        text('התקנה באתר'),
        text('חיבור ל-WMS'),
        text('Go-live'),
      ],
      number: [text('7 ימים'), text('14 ימים'), text('8 ימים'), text('9 ימים'), text('4 ימים')],
      body: text('בסך הכול 42 ימים, לעומת 63 ב-2025. היעד ל-2027: חמישה שבועות.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_text_image',
    name: 'מה למדנו',
    content: {
      caption: text('MANAGEMENT COMMENTARY'),
      title: text('מה למדנו ברבעון הזה'),
      image: { imagePrompt: FACTS },
      subtitle: [
        text('המנויים הם מנוע הרווח'),
        text('הקצב נקבע בהטמעה'),
        text('אירופה איטית מהתחזית'),
      ],
      body: [
        text(
          'הכנסות המנויים גדלו ב-71% והעלו את הרווח הגולמי אל מעל 50% לראשונה. כל רובוט מותקן מוסיף כ-63 אלף ₪ ל-ARR, ולכן נמשיך לתמחר את החומרה באיפוק ולהרוויח לאורך חיי החוזה.',
        ),
        text(
          'קיצרנו את הדרך מהזמנה ל-Go-live מ-63 ימים ל-42. הקיצור הזה, ולא גודל ה-pipeline, אפשר לנו להתקין 148 רובוטים ברבעון. צוואר הבקבוק הבא הוא החיבור ל-WMS, ושם נשקיע ב-2027.',
        ),
        text(
          'שתי עסקאות בהיקף 6.8 מיליון ₪ נדחו לאוקטובר, וההזמנות החדשות הסתכמו ב-51.6 מיליון ₪ מול יעד של 55. מחזור המכירה באירופה ארוך בכחודשיים משהנחנו, והתחזית ל-2027 עודכנה.',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_timeline',
    name: 'אבני דרך',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text('אבני הדרך כפופות לאישור תקציב 2027 בדירקטוריון, בדצמבר.'),
      ],
      title: text('ארבע אבני דרך ל-2027'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [
        text('T4 למחסני קירור'),
        text('מרכז שירות בהולנד'),
        text('הרובוט ה-2,000'),
        text('ARR של ₪130M'),
      ],
      body: [
        text('גרסה שעובדת במינוס 25 מעלות פותחת את שוק המזון הקפוא.'),
        text('מלאי חלפים וטכנאים באירופה, עם זמן תגובה של 24 שעות.'),
        text('ב-70 אתרים, רובם הרחבות של לקוחות קיימים.'),
        text('ושיעור EBITDA מתואם דו-ספרתי לשנה כולה.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_full_image',
    name: 'בשטח',
    content: {
      image: { assetId: pictures.tzukWarehouse.id },
      caption: text('IN THE FIELD'),
      title: text('1,240 רובוטים עובדים הלילה', 'ב-46 מחסנים'),
      body: text('כל אחד מהם משדר נתונים, מקבל עדכוני תוכנה ומייצר הכנסה חוזרת.'),
    },
  },
  {
    layout: 'l_tzuk_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'מאז שהרובוטים של צוק עלו לאוויר אנחנו מוציאים 40% יותר הזמנות במשמרת, בלי להוסיף אף עובד.',
      ),
      attribution: text('אורית שלם'),
      caption: text(
        'סמנכ״לית תפעול, דרומא לוגיסטיקה · לקוחה מאז 2024, עם 164 רובוטים בשלושה מרכזי הפצה',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_team',
    name: 'הנהלה',
    content: {
      caption: [
        text('LEADERSHIP'),
        text('מנכ״לית ומייסדת · CEO'),
        text('סמנכ״ל כספים · CFO'),
        text('סמנכ״ל טכנולוגיות · CTO'),
        text('סמנכ״לית תפעול · COO'),
      ],
      title: text('הנהלת צוק'),
      image: [
        { assetId: pictures.tzukTeam1.id },
        { assetId: pictures.tzukTeam2.id },
        { assetId: pictures.tzukTeam3.id },
        { assetId: pictures.tzukTeam4.id },
      ],
      subtitle: [text('דפנה רוזן'), text('אבנר שחם'), text('יואב קדמי'), text('מיכל אדלר')],
      body: [
        text('הקימה את צוק ב-2019, אחרי 15 שנה באוטומציה תעשייתית.'),
        text('הצטרף ב-2023, אחרי שהוביל שתי הנפקות בתעשייה.'),
        text('מוביל את פלטפורמת הניווט ואת צוות הפיתוח של דגם T4.'),
        text('אחראית להטמעה, לשירות ולהרחבות.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_closing',
    name: 'סיום',
    content: {
      caption: [text('OUTLOOK · Q4 2026'), text('הדוח הבא: 18 בפברואר 2027 · ir@tzuk.example')],
      title: text('ממשיכים לטפס'),
      body: [
        text('הכנסות: 51 עד 53 מיליון ₪, צמיחה של 27% עד 32% לעומת Q4 2025'),
        text('שיעור רווח גולמי: 51%, משקל המנויים ממשיך לעלות'),
        text('EBITDA מתואם: 5 עד 6 מיליון ₪, רבעון שלישי ברציפות של EBITDA חיובי'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_tzuk_hero',
    name: 'Cover',
    content: {
      caption: [
        text('QUARTERLY REPORT'),
        text('Presented to the board and investors · 12 November 2026'),
      ],
      title: text('Investor', 'Update'),
      subtitle: text('Tzuk Robotics · Third quarter 2026'),
      image: { assetId: pictures.tzukWarehouse.id },
    },
  },
  {
    layout: 'l_tzuk_section',
    name: 'Q3 in brief',
    content: {
      number: text('I'),
      caption: text('PART ONE'),
      title: text('Q3 in Brief'),
      subtitle: text('Revenue, margin and the metrics behind them.'),
    },
  },
  {
    layout: 'l_tzuk_big_number',
    name: 'Revenue',
    content: {
      caption: [
        text('REVENUE'),
        text('vs. Q3 2025 (YoY)'),
        text('vs. Q2 2026 (QoQ)'),
        text('of revenue is subscription, up from 29%'),
      ],
      title: text('A record quarter for revenue'),
      number: [text('48.2'), text('+31%'), text('+7.6%'), text('38%')],
      subtitle: text('NIS million, third-quarter revenue'),
      body: text(
        'Up 31% on the same quarter last year. Subscription revenue grew 71% and now makes up 38% of the total.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_cards',
    name: 'Key metrics',
    content: {
      caption: [
        text('KEY METRICS'),
        text('ARR · Annual recurring revenue'),
        text('GROSS MARGIN · Share of revenue'),
        text('INSTALLED BASE · Robots deployed'),
      ],
      title: text('Four metrics, all moving the right way'),
      subtitle: [text('₪78M'), text('50.2%'), text('1,240')],
      body: [
        text('Up 70% in a year. Software and service plans on 1,240 robots.'),
        text('Up 7.0 points in a year. Above 50% for the first time.'),
        text('148 robots added in the quarter, across 46 sites in Israel and Europe.'),
        text(
          'And the fourth: net revenue retention rose to 124%, as customers add robots and software modules.',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_chart',
    name: 'Revenue mix',
    content: {
      caption: [text('REVENUE MIX'), text('Subscription: fleet software, service and RaaS.')],
      title: text('Subscriptions are closing the gap on hardware'),
      number: [text('+71%'), text('+14%')],
      body: [text('Subscription revenue, YoY.'), text('Hardware revenue, same period.')],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'Revenue by quarter, NIS millions',
      data: {
        categories: QUARTERS,
        series: [
          { name: 'Hardware', values: HARDWARE },
          { name: 'Subscription', values: SUBSCRIPTION },
        ],
      },
    },
  },
  {
    layout: 'l_tzuk_table',
    name: 'Profit and loss',
    content: {
      caption: [
        text('SUMMARY P&L'),
        text(
          'Unaudited. Adjusted EBITDA excludes depreciation, amortisation and share-based compensation.',
        ),
      ],
      title: text('Summary profit and loss'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['NIS millions', 'Q3 2025', 'Q2 2026', 'Q3 2026', 'Change YoY'],
        ['Revenue', '36.8', '44.8', '48.2', '+31%'],
        ['of which subscription', '10.8', '16.2', '18.5', '+71%'],
        ['Gross profit', '15.9', '21.8', '24.2', '+52%'],
        ['Gross margin', '43.2%', '48.7%', '50.2%', '+7.0pp'],
        ['Research and development', '9.6', '10.9', '11.2', '+17%'],
        ['Sales, marketing and G&A', '9.4', '10.6', '10.9', '+16%'],
        ['Operating profit (loss)', '−3.1', '0.3', '2.1', '+5.2'],
        ['Adjusted EBITDA', '−1.2', '2.4', '4.3', '+5.5'],
      ],
    },
  },
  {
    layout: 'l_tzuk_text_image',
    name: 'T4',
    content: {
      caption: text('PRODUCT'),
      title: text('T4: more payload, fewer stops'),
      image: { assetId: pictures.tzukRobot.id },
      subtitle: [
        text('A 600 kg payload'),
        text('A full charge in 18 minutes'),
        text('No fixed infrastructure'),
      ],
      body: [
        text('Half again the T3’s load, same footprint.'),
        text('Swappable battery; 22 working hours a day.'),
        text('LiDAR and cameras only. Live in 42 days.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_comparison',
    name: 'Plan and actual',
    content: {
      caption: [text('PLAN VS. ACTUAL'), text('The plan for the quarter'), text('The quarter')],
      title: text('The quarter against plan'),
      subtitle: [text('Revenue of NIS 46.0 million'), text('Revenue of NIS 48.2 million')],
      body: [
        bullets(
          'Gross margin: 49.0%',
          'Adjusted EBITDA: NIS 3.0 million',
          'Robots installed: 140',
          'New bookings: NIS 55.0 million',
        ),
        bullets(
          'Gross margin: 50.2%',
          'Adjusted EBITDA: NIS 4.3 million',
          'Robots installed: 148',
          'New bookings: NIS 51.6 million. Two European deals were signed only in October',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_process',
    name: 'Deployment',
    content: {
      caption: [
        text('DEPLOYMENT'),
        text('Warehouse survey, simulation and a signed layout.'),
        text('Built and tested at the Yokneam plant.'),
        text('Unloading, LiDAR mapping, charging stations.'),
        text('Warehouse-system integration and load tests.'),
        text('Phased start, shift training and handover.'),
      ],
      title: text('From order to go-live in 42 days'),
      subtitle: [
        text('Site design'),
        text('Assembly'),
        text('Installation'),
        text('WMS link-up'),
        text('Go-live'),
      ],
      number: [text('7 days'), text('14 days'), text('8 days'), text('9 days'), text('4 days')],
      body: text('42 days in all, down from 63 in 2025. The target for 2027 is five weeks.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_text_image',
    name: 'What we learned',
    content: {
      caption: text('MANAGEMENT COMMENTARY'),
      title: text('What we learned this quarter'),
      image: { imagePrompt: FACTS },
      subtitle: [
        text('Subscriptions drive the profit'),
        text('Deployment sets the pace'),
        text('Europe is slower than forecast'),
      ],
      body: [
        text(
          'Subscription revenue grew 71% and took gross margin above 50% for the first time. Each robot adds about NIS 63 thousand to ARR, so we keep hardware pricing lean.',
        ),
        text(
          'We cut the path from order to go-live from 63 days to 42. That, not the size of the pipeline, let us install 148 robots. The next bottleneck is the WMS link-up.',
        ),
        text(
          'Two deals worth NIS 6.8 million slipped into October: bookings of NIS 51.6 million against a target of 55. Europe’s sales cycle is two months longer than we assumed.',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_timeline',
    name: 'Milestones',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text('Milestones are subject to board approval of the 2027 budget in December.'),
      ],
      title: text('Four milestones for 2027'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [
        text('Cold-storage T4'),
        text('EU service hub'),
        text('Robot no. 2,000'),
        text('ARR of ₪130M'),
      ],
      body: [
        text('A version rated to minus 25°C opens the frozen-food market.'),
        text('Parts and technicians in the Netherlands, with a 24-hour response time.'),
        text('Across 70 sites, most of them expansions by existing customers.'),
        text('With a double-digit adjusted EBITDA margin for the full year.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_full_image',
    name: 'In the field',
    content: {
      image: { assetId: pictures.tzukWarehouse.id },
      caption: text('IN THE FIELD'),
      title: text('Tonight, 1,240 robots are', 'at work in 46 warehouses'),
      body: text('Each one reports data, receives software updates and earns recurring revenue.'),
    },
  },
  {
    layout: 'l_tzuk_quote',
    name: 'Quote',
    content: {
      quote: text(
        'Since Tzuk’s robots went live we ship 40% more orders per shift, without adding a single worker.',
      ),
      attribution: text('Orit Shalem'),
      caption: text(
        'COO, Droma Logistics · a customer since 2024, with 164 robots across three distribution centres',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_team',
    name: 'Leadership',
    content: {
      caption: [
        text('LEADERSHIP'),
        text('Chief Executive, co-founder'),
        text('Chief Financial Officer'),
        text('Chief Technology Officer'),
        text('Chief Operating Officer'),
      ],
      title: text('The team leading Tzuk'),
      image: [
        { assetId: pictures.tzukTeam1.id },
        { assetId: pictures.tzukTeam2.id },
        { assetId: pictures.tzukTeam3.id },
        { assetId: pictures.tzukTeam4.id },
      ],
      subtitle: [
        text('Dafna Rosen'),
        text('Avner Shaham'),
        text('Yoav Kadmi'),
        text('Michal Adler'),
      ],
      body: [
        text('Founded Tzuk in 2019 after 15 years in industrial automation.'),
        text('Joined in 2023, having led two public offerings in industry.'),
        text('Leads the navigation platform and the development of the T4.'),
        text('Runs deployment and service across all 46 customer sites.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_tzuk_closing',
    name: 'Closing',
    content: {
      caption: [text('OUTLOOK · Q4 2026'), text('Next report: 18 February 2027 · ir@tzuk.example')],
      title: text('Still climbing'),
      body: [
        text('Revenue: ₪51–53M, growth of 27% to 32% on Q4 2025'),
        text('Gross margin: 51%, as the subscription mix keeps rising'),
        text('Adjusted EBITDA: ₪5–6M, a third straight positive quarter'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const tzukSamples = { he: sampleHe, en: sampleEn };

/** The Tzuk template: the theme, fourteen layouts for both directions, and its sample deck. */
export function tzukTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(tzukTheme),
    description: 'Business: paper, ink and one deep green, for reports and investor decks.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.tzukWarehouse,
      pictures.tzukRobot,
      pictures.tzukTeam1,
      pictures.tzukTeam2,
      pictures.tzukTeam3,
      pictures.tzukTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
