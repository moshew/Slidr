import {
  createElement,
  type Background,
  type Element,
  type Layout,
  type Theme,
} from '@slidr/model';
import { copyJson } from '../json';
import type { Template } from '../template';
import {
  assetTable,
  at,
  atEnd,
  bullets,
  dot,
  drawing,
  flipBackgrounds,
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
 * Zerem: the technology template. Dark, precise, with one bright colour. Derived from the
 * reference deck `docs/reference-decks/zerem.html`, whose theme block holds these same values.
 */
export const zeremTheme: Theme = {
  id: 'zerem',
  name: 'Zerem',
  colors: {
    bg: '#0b1020',
    surface: '#151d36',
    text: '#eaf0ff',
    muted: '#98a5c8',
    primary: '#2ee6d0',
    secondary: '#8f7dff',
    accent: '#ffb547',
    chart: ['#2ee6d0', '#8f7dff', '#ffb547', '#5aa9ff', '#f472b6', '#98a5c8'],
  },
  fonts: {
    heading: { he: 'IBM Plex Sans Hebrew', latin: 'Space Grotesk' },
    body: { he: 'Heebo', latin: 'Inter' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 136,
      weight: 700,
      lineHeight: 1.05,
      color: { token: 'text' },
    },
    title: { font: 'heading', size: 72, weight: 700, lineHeight: 1.12, color: { token: 'text' } },
    heading: { font: 'heading', size: 44, weight: 600, lineHeight: 1.2, color: { token: 'text' } },
    body: { font: 'body', size: 30, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 12,
  shadow: { x: 0, y: 24, blur: 60, color: { value: '#000000', alpha: 0.45 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    { fill: { kind: 'solid', color: { token: 'surface' } } },
    { fill: { kind: 'solid', color: { token: 'primary' } } },
  ],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

const CARD = {
  stroke: { color: token('text', 0.12), width: 1 },
  effects: { radius: 12 },
};
const card = (id: string, frame: ReturnType<typeof at>) =>
  rect(id, frame, solid(token('surface')), CARD);

const MARK =
  '<svg viewBox="0 0 44 32"><rect x="0" y="1" width="26" height="6" rx="3" fill="#2ee6d0"/><rect x="32" y="1" width="12" height="6" rx="3" fill="#2ee6d0" opacity="0.5"/><rect x="8" y="13" width="36" height="6" rx="3" fill="#2ee6d0"/><rect x="0" y="25" width="14" height="6" rx="3" fill="#2ee6d0" opacity="0.5"/><rect x="20" y="25" width="24" height="6" rx="3" fill="#2ee6d0"/></svg>';

/** The mark of the template: three lanes of a stream. A deck replaces it with its own logo. */
const mark = (id: string, frame: ReturnType<typeof at>) =>
  drawing(id, frame, MARK, { '#2ee6d0': token('primary') }, { role: 'logo', name: 'logo' });

const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#98a5c8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 5-7 7 7 7"/></svg>';
const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#2ee6d0" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10"/></svg>';
const QUOTE =
  '<svg viewBox="0 0 66 52"><path fill="#2ee6d0" d="M0 52V30C0 12 9 2 26 0v10c-8 2-12 7-12 16h12v26H0Zm40 0V30C40 12 49 2 66 0v10c-8 2-12 7-12 16h12v26H40Z"/></svg>';

/** The line over a title and the title itself, as every content slide has them. */
const head = (width = 1728, lines = 1) => [
  place('p_kicker', 'caption', at(96, 80, 900, 34), 'caption'),
  place('p_title', 'title', at(96, 122, width, 81 * lines), 'title'),
];

/**
 * The foot of a content slide: a rule, the mark at the start, and at the end the deck's name
 * with the slide's number beyond it (SLD-04). The mark stands alone at its side, which leaves a
 * logo of any width room to replace it.
 */
function foot(
  name: string,
  width = 1728,
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  return {
    placeholders: [
      place('p_footer', 'footer', at(96 + width - 900, 961, 828, 34), 'caption', { align: 'end' }),
    ],
    decorations: [
      rect(`d_zerem_${name}_rule`, at(96, 940, width, 1), solid(token('text', 0.14))),
      mark(`d_zerem_${name}_mark`, at(96, 962, 44, 32)),
      pageNumber(`d_zerem_${name}_number`, at(96 + width - 60, 961, 60, 34)),
    ],
  };
}

/** The stream: lanes of events of different lengths, fading towards the text. */
const LANES: [
  x: number,
  y: number,
  w: number,
  color: 'primary' | 'secondary' | 'accent' | 'text',
  opacity: number,
][] = [
  [40, 150, 120, 'secondary', 0.5],
  [200, 150, 300, 'primary', 0.9],
  [560, 150, 60, 'text', 0.25],
  [-20, 234, 260, 'primary', 0.35],
  [300, 234, 90, 'secondary', 0.9],
  [430, 234, 220, 'text', 0.18],
  [90, 318, 60, 'accent', 1],
  [190, 318, 420, 'primary', 0.8],
  [660, 318, 110, 'secondary', 0.4],
  [20, 402, 180, 'secondary', 0.7],
  [250, 402, 70, 'text', 0.3],
  [370, 402, 330, 'primary', 0.25],
  [-40, 486, 380, 'primary', 0.95],
  [390, 486, 140, 'secondary', 0.55],
  [580, 486, 50, 'text', 0.3],
  [110, 570, 110, 'text', 0.2],
  [260, 570, 250, 'secondary', 0.85],
  [560, 570, 180, 'primary', 0.4],
  [10, 654, 300, 'primary', 0.6],
  [360, 654, 60, 'accent', 0.9],
  [470, 654, 200, 'text', 0.15],
  [70, 738, 90, 'secondary', 0.45],
  [210, 738, 360, 'primary', 0.85],
  [620, 738, 80, 'secondary', 0.3],
  [-30, 822, 220, 'text', 0.2],
  [240, 822, 130, 'primary', 0.5],
  [420, 822, 280, 'secondary', 0.7],
  [140, 906, 260, 'primary', 0.3],
  [450, 906, 70, 'text', 0.3],
  [570, 906, 160, 'secondary', 0.5],
];

function stream(id: string, width: number, rows: [from: number, to: number]): Element {
  const fade = (centre: number) => {
    const c = Math.min(Math.max(centre / width, 0), 1);
    return c < 0.72 ? 1 - (0.45 * c) / 0.72 : 0.55 * (1 - (c - 0.72) / 0.28);
  };
  const children = LANES.filter(([x, y]) => y >= rows[0] && y <= rows[1] && x < width - 80).map(
    ([x, y, w, color, opacity], i) => {
      const clipped = Math.min(w, width - 60 - x);
      const alpha = Math.round(opacity * fade(x + clipped / 2) * 100) / 100;
      return rect(`${id}_${i + 1}`, atEnd(x, y, clipped, 14), solid(token(color, alpha)), {
        effects: { radius: 7 },
      });
    },
  );
  return createElement.group({ id, name: 'stream', frame: atEnd(0, 0, width, 1080), children });
}

/** A glow in a corner of the slide; `side` is where it sits, as a share of the width. */
const glow = (
  side: number,
  top: number,
  color: 'primary' | 'secondary',
  share: number,
  size: string,
) =>
  `radial-gradient(${size} at ${side}% ${top}%, color-mix(in srgb, var(--color-${color}) ${share}%, transparent), transparent 70%)`;

const css = (...layers: string[]): Background => ({
  fill: { kind: 'css', value: [...layers, 'var(--color-bg)'].join(', ') },
});

/** The backgrounds free CSS paints, for each direction: the mirror cannot turn them. */
const backgrounds = (flip: boolean) => {
  const x = (share: number) => (flip ? 100 - share : share);
  return {
    hero: css(
      glow(x(8), 12, 'secondary', 30, '1100px 760px'),
      glow(x(0), 100, 'primary', 20, '900px 640px'),
    ),
    quote: css(glow(x(0), 100, 'secondary', 26, '1000px 700px')),
    closing: css(
      glow(x(8), 88, 'primary', 22, '1100px 760px'),
      glow(x(0), 0, 'secondary', 24, '900px 640px'),
    ),
  };
};

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const columns4 = [96, 540, 984, 1428];
const cards3 = [96, 688, 1280];
const steps5 = [96, 453, 810, 1167, 1524];
const points3 = [316, 516, 716];

function layouts(): Layout[] {
  const bg = backgrounds(false);
  return [
    {
      id: 'l_zerem_hero',
      name: 'Hero',
      archetype: 'hero',
      background: bg.hero,
      placeholders: [
        place('p_kicker', 'caption', at(96, 262, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 310, 1180, 286), 'display'),
        place('p_subtitle', 'subtitle', at(96, 634, 1040, 160), 'heading'),
        place('p_meta', 'caption', at(96, 860, 900, 34), 'caption'),
      ],
      decorations: [
        stream('d_zerem_hero_stream', 860, [150, 906]),
        mark('d_zerem_hero_mark', at(96, 88, 55, 40)),
        rect('d_zerem_hero_rule', at(96, 836, 560, 1), solid(token('text', 0.14))),
      ],
    },
    {
      id: 'l_zerem_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        place('p_number', 'number', at(96, 214, 1090, 100), 'title'),
        place('p_kicker', 'caption', at(96, 334, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 384, 1090, 143), 'display'),
        place('p_subtitle', 'subtitle', at(96, 566, 1000, 120), 'heading'),
      ],
      decorations: [
        rect('d_zerem_section_field', atEnd(0, 0, 640, 1080), solid(token('primary'))),
        rect('d_zerem_section_bar', at(96, 820, 320, 4), solid(token('primary'))),
      ],
    },
    {
      id: 'l_zerem_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head(1000),
        place('p_number', 'number', at(96, 262, 900, 300), 'display', { vAlign: 'middle' }),
        place('p_label', 'subtitle', at(96, 584, 900, 53), 'heading'),
        place('p_body', 'body', at(96, 660, 820, 180), 'body'),
        ...[250, 464, 678].flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(132, top + 30, 568, 81), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', atEnd(132, top + 120, 568, 34), 'caption'),
        ]),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        ...[250, 464, 678].map((top, i) =>
          card(`d_zerem_big_number_card${i + 1}`, atEnd(96, top, 640, 190)),
        ),
        ...foot('big_number').decorations,
      ],
    },
    {
      id: 'l_zerem_quote',
      name: 'Quote',
      archetype: 'quote',
      background: bg.quote,
      placeholders: [
        place('p_quote', 'quote', at(96, 300, 1640, 340), 'title'),
        place('p_attribution', 'attribution', at(96, 732, 1200, 53), 'heading'),
        place('p_caption', 'caption', at(96, 796, 1200, 34), 'caption'),
        ...foot('quote').placeholders,
      ],
      decorations: [
        drawing('d_zerem_quote_glyph', at(96, 150, 132, 104), QUOTE, {
          '#2ee6d0': token('primary'),
        }),
        rect('d_zerem_quote_bar', at(96, 700, 96, 4), solid(token('primary'))),
        ...foot('quote').decorations,
      ],
    },
    {
      id: 'l_zerem_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head(920, 2),
        place('p_image', 'image', atEnd(0, 0, 800, 1080)),
        // A point holds a paragraph of three lines: a deck that comes from another template
        // brings its own copy, and the dense slide of one is longer than this template's.
        ...points3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(168, top, 848, 53), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(168, top + 59, 848, 135), 'body'),
        ]),
        place('p_footer', 'footer', atEnd(896, 961, 700, 34), 'caption', { align: 'end' }),
      ],
      decorations: [
        ...points3.map((top, i) =>
          label(`d_zerem_text_image_n${i + 1}`, at(96, top + 6, 56, 45), `0${i + 1}`, 'body', {
            color: token('primary'),
            weight: 700,
          }),
        ),
        rect('d_zerem_text_image_rule', at(96, 940, 928, 1), solid(token('text', 0.14))),
        mark('d_zerem_text_image_mark', at(96, 962, 44, 32)),
      ],
    },
    {
      id: 'l_zerem_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture runs from edge to edge; the text has a band of its own under it, because
        // nothing of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 640)),
        place('p_kicker', 'caption', at(96, 688, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 730, 1060, 162), 'title'),
        place('p_body', 'body', atEnd(96, 738, 560, 180), 'body'),
      ],
      decorations: [
        rect('d_zerem_full_image_bar', atEnd(696, 746, 4, 140), solid(token('primary'))),
      ],
    },
    {
      id: 'l_zerem_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head(),
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}`, 'subtitle', at(start + 44, 414, 456, 106), 'heading'),
          place(`p_card${i + 1}_body`, 'body', at(start + 44, 540, 456, 200), 'body'),
          place(`p_card${i + 1}_note`, 'caption', at(start + 44, 768, 456, 34), 'caption'),
        ]),
        place('p_takeaway', 'body', at(96, 868, 1728, 45), 'body'),
        ...foot('cards').placeholders,
      ],
      decorations: [
        ...cards3.flatMap((start, i) => [
          card(`d_zerem_cards_card${i + 1}`, at(start, 262, 544, 580)),
          rect(
            `d_zerem_cards_tile${i + 1}`,
            at(start + 44, 306, 76, 76),
            solid(token('primary', 0.14)),
            {
              effects: { radius: 12 },
            },
          ),
          label(`d_zerem_cards_n${i + 1}`, at(start + 44, 322, 76, 45), `0${i + 1}`, 'body', {
            color: token('primary'),
            weight: 700,
            align: 'center',
          }),
        ]),
        ...foot('cards').decorations,
      ],
    },
    {
      id: 'l_zerem_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 296, 396, 100), 'title'),
          place(`p_what${i + 1}`, 'subtitle', at(start, 502, 396, 106), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start, 622, 396, 160), 'body'),
        ]),
        place('p_note', 'caption', at(132, 829, 1656, 45), 'body'),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        rect('d_zerem_timeline_axis', at(96, 444, 1728, 4), solid(token('text', 0.16)), {
          effects: { radius: 2 },
        }),
        ...columns4.map((start, i) =>
          dot(
            `d_zerem_timeline_dot${i + 1}`,
            at(start, 430, 32, 32),
            solid(token(i === 0 ? 'primary' : 'bg')),
            {
              stroke: { color: token('primary', i === 0 ? 1 : 0.6), width: 4 },
            },
          ),
        ),
        card('d_zerem_timeline_card', at(96, 806, 1728, 92)),
        ...foot('timeline').decorations,
      ],
    },
    {
      id: 'l_zerem_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => [
          // Two lines for the name of a step, which sits on the text under it: a name of
          // two words does not fit one line of a card this narrow.
          place(`p_step${i + 1}`, 'subtitle', at(start + 32, 362, 236, 106), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_step${i + 1}_body`, 'caption', at(start + 32, 480, 236, 136), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start + 32, 632, 236, 45), 'body'),
        ]),
        place('p_summary', 'body', at(96, 760, 1728, 90), 'body'),
        ...foot('process').placeholders,
      ],
      decorations: [
        ...steps5.flatMap((start, i) => [
          card(`d_zerem_process_card${i + 1}`, at(start, 270, 300, 440)),
          label(`d_zerem_process_n${i + 1}`, at(start + 32, 304, 236, 45), `0${i + 1}`, 'body', {
            color: token('primary'),
            weight: 700,
          }),
        ]),
        ...steps5.slice(1).map((start, i) =>
          drawing(`d_zerem_process_arrow${i + 1}`, at(start - 43, 474, 32, 32), CHEVRON, {
            '#98a5c8': token('muted'),
          }),
        ),
        ...foot('process').decorations,
      ],
    },
    {
      id: 'l_zerem_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head(),
        place('p_before_tag', 'caption', at(144, 306, 744, 34), 'caption'),
        place('p_before', 'subtitle', at(144, 346, 744, 53), 'heading'),
        place('p_before_body', 'body', at(144, 452, 744, 420), 'body'),
        place('p_after_tag', 'caption', atEnd(144, 306, 744, 34), 'caption'),
        place('p_after', 'subtitle', atEnd(144, 346, 744, 53), 'heading'),
        place('p_after_body', 'body', atEnd(144, 452, 744, 420), 'body'),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        rect('d_zerem_comparison_before', at(96, 262, 840, 640), NO_FILL, CARD),
        rect('d_zerem_comparison_after', atEnd(96, 262, 840, 640), solid(token('surface')), {
          stroke: { color: token('primary'), width: 2 },
          effects: { radius: 12 },
        }),
        rect('d_zerem_comparison_rule1', at(144, 424, 744, 1), solid(token('text', 0.14))),
        rect('d_zerem_comparison_rule2', atEnd(144, 424, 744, 1), solid(token('text', 0.14))),
        ...foot('comparison').decorations,
      ],
    },
    {
      id: 'l_zerem_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head(),
        place('p_chart', 'chart', at(96, 262, 1120, 640)),
        place('p_stat1', 'number', atEnd(96, 270, 512, 81), 'title'),
        place('p_stat1_body', 'body', atEnd(96, 372, 512, 135), 'body'),
        place('p_stat2', 'number', atEnd(96, 570, 512, 81), 'title'),
        place('p_stat2_body', 'body', atEnd(96, 672, 512, 135), 'body'),
        place('p_source', 'caption', atEnd(96, 834, 512, 68), 'caption'),
        ...foot('chart').placeholders,
      ],
      decorations: [
        rect('d_zerem_chart_split', atEnd(96, 534, 512, 1), solid(token('text', 0.14))),
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_zerem_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head(),
        // As tall as the slide allows: nine rows of the sample's height.
        place('p_table', 'table', at(96, 246, 1728, 630)),
        place('p_note', 'caption', at(96, 892, 1728, 34), 'caption'),
        ...foot('table').placeholders,
      ],
      decorations: foot('table').decorations,
    },
    {
      id: 'l_zerem_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start, 262, 396, 396)),
          place(`p_person${i + 1}`, 'subtitle', at(start, 684, 396, 53), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start, 742, 396, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start, 788, 396, 102), 'caption'),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: foot('team').decorations,
    },
    {
      id: 'l_zerem_closing',
      name: 'Closing',
      archetype: 'closing',
      background: bg.closing,
      placeholders: [
        place('p_kicker', 'caption', at(96, 150, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 198, 1300, 286), 'display'),
        ...[540, 628, 716].map((top, i) =>
          place(`p_step${i + 1}`, 'body', at(176, top + 2, 1100, 45), 'body'),
        ),
        place('p_contact', 'caption', at(96, 952, 900, 34), 'caption'),
      ],
      decorations: [
        stream('d_zerem_closing_stream', 620, [234, 822]),
        ...[540, 628, 716].flatMap((top, i) => [
          rect(`d_zerem_closing_tile${i + 1}`, at(96, top, 56, 56), solid(token('primary', 0.16)), {
            effects: { radius: 12 },
          }),
          drawing(`d_zerem_closing_check${i + 1}`, at(110, top + 14, 28, 28), CHECK, {
            '#2ee6d0': token('primary'),
          }),
        ]),
        rect('d_zerem_closing_rule', at(96, 832, 560, 1), solid(token('text', 0.14))),
        mark('d_zerem_closing_mark', at(96, 868, 77, 56)),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: the reference deck, slide by slide, on the layouts

const FOOTER = text('Zerem Platform · ארכיטקטורת v3');

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_zerem_hero',
    name: 'פתיחה',
    content: {
      caption: [
        text('PLATFORM ARCHITECTURE REVIEW'),
        text('צוות Platform · סקירת ארכיטקטורה · דצמבר 2026'),
      ],
      title: text('הארכיטקטורה הבאה של Zerem'),
      subtitle: text(
        'Event streaming של יותר ממיליארד אירועים ביום, בלי broker אחד שמחזיק את הכול.',
      ),
    },
  },
  {
    layout: 'l_zerem_section',
    name: 'למה עכשיו',
    content: {
      number: text('01'),
      caption: text('פרק ראשון מתוך שלושה'),
      title: text('למה עכשיו'),
      subtitle: text('שלושה לחצים שהצטברו במהלך 2026, ומה הם עולים לנו בכל שבוע שעובר.'),
    },
  },
  {
    layout: 'l_zerem_big_number',
    name: 'קנה מידה',
    content: {
      caption: [
        text('SCALE'),
        text('בנפח האירועים, בתוך 12 חודשים'),
        text('p99 מקצה לקצה. היעד: 50ms'),
        text('זמינות רבעונית של ה-cluster הראשי'),
      ],
      title: text('כמה אנחנו מזרימים היום'),
      number: [text('1.2B'), text('×4'), text('38ms'), text('99.99%')],
      subtitle: text('אירועים ביום, בשעת השיא'),
      body: text(
        'פי ארבעה מדצמבר 2025. רוב הגידול מגיע מ-telemetry של מכשירי קצה ומ-change data capture של שלושה שירותים חדשים.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zerem_text_image',
    name: 'הבעיה',
    content: {
      caption: text('THE PROBLEM'),
      title: text('ה-broker של v2 הפך לצוואר הבקבוק'),
      image: { assetId: pictures.zeremFiber.id },
      subtitle: [
        text('אחסון ו-compute צמודים זה לזה'),
        text('Rebalance שמרעיב את ה-consumers'),
        text('עלות שגדלה מהר יותר מהתעבורה'),
      ],
      body: [
        text('כל הוספת broker גוררת העתקה של טרה-בייטים, ולכן scale-out נמשך שעות ולא דקות.'),
        text('בזמן ההעתקה ה-p99 קופץ מ-40ms ל-900ms, בדיוק כשהעומס בשיאו.'),
        text('שומרים 13 חודשים על NVMe, אף ש-97% מהקריאות נוגעות בשש השעות האחרונות.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zerem_comparison',
    name: 'v2 מול v3',
    content: {
      caption: [text('V2 / V3'), text('v2 · המצב היום'), text('v3 · היעד')],
      title: text('אותו API, ארכיטקטורה אחרת'),
      subtitle: [text('Broker מונוליתי'), text('Brokers חסרי מצב ו-Tiered Storage')],
      body: [
        bullets(
          'אחסון: דיסק NVMe מקומי בכל broker',
          'Scale-out: 3 עד 5 שעות, עם rebalance מלא',
          'Failover: ידני, כ-12 דקות',
          'עלות ל-TB בחודש: $210',
        ),
        bullets(
          'אחסון: Object storage משותף, עם cache מקומי',
          'Scale-out: פחות מ-90 שניות, בלי העתקת נתונים',
          'Failover: אוטומטי, כ-4 שניות',
          'עלות ל-TB בחודש: $38',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zerem_process',
    name: 'מסלול של אירוע',
    content: {
      caption: [
        text('DATA PATH'),
        text('ה-SDK אוסף אירועים ל-batch ודוחס אותם ב-zstd.'),
        text('אימות, quota לכל tenant וניתוב לפי partition key.'),
        text('כתיבה ל-log בזיכרון, ו-ack אחרי שני עותקים נוספים.'),
        text('Segment שנסגר עולה ל-object storage ברקע.'),
        text('קריאה מה-cache החם, או ישירות מהשכבה הקרה.'),
      ],
      title: text('מסלולו של אירוע, מקצה לקצה'),
      subtitle: [
        text('Producer'),
        text('Gateway'),
        text('Broker'),
        text('Storage'),
        text('Consumer'),
      ],
      number: [text('2ms'), text('6ms'), text('12ms'), text('14ms'), text('4ms')],
      body: text('בסך הכול 38ms מה-producer עד ה-consumer, מול יעד של 50ms.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zerem_cards',
    name: 'עקרונות תכנון',
    content: {
      caption: [
        text('DESIGN PRINCIPLES'),
        text('המדד: זמן scale-out'),
        text('המדד: עלות ל-TB'),
        text('המדד: p99 בזמן עומס'),
      ],
      title: text('שלושה עקרונות שלא מתפשרים עליהם'),
      subtitle: [
        text('Brokers בלי מצב'),
        text('אחסון נפרד מ-compute'),
        text('Backpressure מקצה לקצה'),
      ],
      body: [
        text(
          'Broker לא מחזיק נתונים שאי אפשר לשחזר. כל instance ניתן להחלפה בתוך שניות, בלי העתקה.',
        ),
        text('הנתונים חיים ב-object storage, וה-compute רק קורא וכותב. כל אחד גדל לפי העומס שלו.'),
        text('כש-consumer מאט, ה-producer יודע על זה. אין תורים נסתרים שמתנפחים עד שמשהו נופל.'),
        text('כל החלטת תכנון ב-v3 נבחנת מול שלושתם, לפני שנכתבת שורת קוד אחת.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zerem_text_image',
    name: 'Tiered Storage',
    content: {
      caption: text('DEEP DIVE'),
      title: text('Tiered Storage: מה קורה לאירוע אחרי שנכתב'),
      image: {
        imagePrompt: 'A diagram of three storage tiers, hot, warm and cold, one above the other',
      },
      subtitle: [
        text('שכבה חמה: שש השעות האחרונות'),
        text('שכבה פושרת: שבעה ימים'),
        text('שכבה קרה: 13 חודשים'),
      ],
      body: [
        text('כל אירוע נכתב קודם ל-log על NVMe מקומי ומשוכפל לשני brokers נוספים לפני ה-ack.'),
        text('Segment שנסגר נדחס ועולה ל-SSD משותף בתוך דקות. ה-broker שומר רק אינדקס קטן.'),
        text('אחרי שבוע ה-segments עוברים compaction ונשמרים ב-object storage, בחמישית המחיר.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zerem_chart',
    name: 'תוצאות ה-pilot',
    content: {
      caption: [
        text('PILOT RESULTS'),
        text('מקור: cluster ה-pilot, צוותי Payments ו-Search, יולי עד דצמבר 2026.'),
      ],
      title: text('ה-pilot: יותר throughput על אותה חומרה'),
      number: [text('×3.1'), text('−64%')],
      body: [
        text('throughput בשיא בדצמבר, על אותם 24 nodes.'),
        text('ב-p99 בזמן rebalance: מ-900ms ל-320ms.'),
      ],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'אלפי אירועים בשנייה, בשיא',
      data: {
        categories: ['יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
        series: [
          { name: 'v2', values: [310, 325, 330, 340, 345, 350] },
          { name: 'v3 (pilot)', values: [380, 520, 690, 840, 960, 1080] },
        ],
      },
    },
  },
  {
    layout: 'l_zerem_table',
    name: 'שכבות שירות',
    content: {
      caption: [
        text('SERVICE TIERS'),
        text(
          'כל ה-SLOs נמדדים בחלון של 30 יום. חריגה משני רבעונים רצופים פותחת design review לשכבה.',
        ),
      ],
      title: text('מה אנחנו מבטיחים לכל סוג topic'),
      footer: FOOTER,
    },
    table: {
      cols: [270, 230, 220, 250, 758],
      rowHeight: 78,
      rows: [
        ['שכבת שירות', 'p99 כתיבה', 'זמינות', 'שמירה', 'למי זה מתאים'],
        ['Realtime', '15ms', '99.99%', '6 שעות', 'תשלומים, fraud detection, כל מה שמשתמש מחכה לו'],
        ['Standard', '50ms', '99.95%', '7 ימים', 'רוב שירותי המוצר: notifications, חיפוש, המלצות'],
        ['Analytics', '250ms', '99.9%', '90 יום', 'Pipelines של BI ו-dashboards תפעוליים'],
        ['Batch', '2s', '99.9%', '13 חודשים', 'אימון מודלים, דוחות חודשיים ו-backfill'],
        ['Audit', '5s', '99.99%', '7 שנים', 'רגולציה וביקורת: כתיבה בלבד, בלי מחיקה'],
        ['Replay', 'לפי המקור', '99.5%', 'לפי המקור', 'שחזור אחרי תקלה והרצה מחדש של consumers'],
      ],
    },
  },
  {
    layout: 'l_zerem_timeline',
    name: 'מפת דרכים',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text(
          'בכל רבעון יש נקודת יציאה: אם ה-p99 של v3 חורג מ-50ms שבועיים ברצף, עוצרים וחוזרים שלב.',
        ),
      ],
      title: text('ארבעה רבעונים, בלי big bang'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [
        text('Pilot עם שני צוותים'),
        text('Dual-write לכל ה-topics'),
        text('Cutover של production'),
        text('מכבים את v2'),
      ],
      body: [
        text('Payments ו-Search עוברים ל-cluster של v3, עם dual-read מול v2.'),
        text('כל producer כותב לשתי המערכות. מודדים פערים.'),
        text('ה-consumers עוברים בקבוצות של 10%, עם rollback מהיר.'),
        text('ארכוב ל-cold tier, שחרור החומרה וסגירת ה-runbooks.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zerem_quote',
    name: 'ציטוט',
    content: {
      quote: text('מאז שעברנו ל-v3 ה-pager שלי שותק בלילה. זה לא מזל, זו ארכיטקטורה.'),
      attribution: text('נועה ברק'),
      caption: text('SRE Lead בצוות Payments, אחד משני צוותי ה-pilot'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zerem_full_image',
    name: 'עמידות',
    content: {
      image: { assetId: pictures.zeremDatacenter.id },
      caption: text('RESILIENCE'),
      title: text('שלושה אזורים, אפס נקודות כשל'),
      body: text(
        'כל segment נכתב לשלושה אזורי זמינות לפני ה-ack. אזור שלם יכול ליפול בלי שאירוע אחד יאבד.',
      ),
    },
  },
  {
    layout: 'l_zerem_team',
    name: 'הצוות',
    content: {
      caption: [
        text('THE TEAM'),
        text('Tech Lead · Storage'),
        text('Staff Engineer · Brokers'),
        text('SRE · Reliability'),
        text('Product Manager · Platform'),
      ],
      title: text('הצוות שבונה את v3'),
      image: [
        { assetId: pictures.zeremTeam1.id },
        { assetId: pictures.zeremTeam2.id },
        { assetId: pictures.zeremTeam3.id },
        { assetId: pictures.zeremTeam4.id },
      ],
      subtitle: [text('מאיה לוין'), text('יונתן שגיא'), text('עומר דיין'), text('רונית אברהם')],
      body: [
        text('מובילה את ה-tiered storage ואת מודל העלויות.'),
        text('אחראי על ה-broker חסר המצב ועל ה-failover.'),
        text('בונה את ה-runbooks, ה-SLOs וה-dashboards של ה-pilot.'),
        text('מתאמת את ההגירה מול צוותי המוצר.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zerem_closing',
    name: 'סיום',
    content: {
      caption: [text('NEXT STEPS'), text('platform@zerem.example · docs.zerem.example/v3')],
      title: text('מתחילים ב-pilot בינואר'),
      body: [
        text('עד 15 בדצמבר: צוותים שרוצים להצטרף נרשמים ב-#zerem-v3'),
        text('עד סוף דצמבר: design review פתוח לכל ה-RFC'),
        text('5 בינואר: kickoff עם Payments ו-Search'),
      ],
    },
  },
];

const FOOTER_EN = text('Zerem Platform · v3 architecture');

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_zerem_hero',
    name: 'Opening',
    content: {
      caption: [
        text('PLATFORM ARCHITECTURE REVIEW'),
        text('Platform team · Architecture review · December 2026'),
      ],
      title: text('The next Zerem architecture'),
      subtitle: text(
        'Event streaming for over a billion events a day, with no single broker holding it all.',
      ),
    },
  },
  {
    layout: 'l_zerem_section',
    name: 'Why now',
    content: {
      number: text('01'),
      caption: text('Part one of three'),
      title: text('Why now'),
      subtitle: text(
        'Three pressures that built up during 2026, and what each week of waiting costs us.',
      ),
    },
  },
  {
    layout: 'l_zerem_big_number',
    name: 'Scale',
    content: {
      caption: [
        text('SCALE'),
        text('in event volume, within 12 months'),
        text('p99 end to end. Target: 50ms'),
        text('quarterly availability of the main cluster'),
      ],
      title: text('How much we stream today'),
      number: [text('1.2B'), text('×4'), text('38ms'), text('99.99%')],
      subtitle: text('events a day, at peak'),
      body: text(
        'Four times the volume of December 2025. Most of the growth is telemetry from edge devices and change data capture of three new services.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_zerem_text_image',
    name: 'The problem',
    content: {
      caption: text('THE PROBLEM'),
      title: text('The v2 broker became the bottleneck'),
      image: { assetId: pictures.zeremFiber.id },
      subtitle: [
        text('Storage and compute are tied'),
        text('A rebalance starves consumers'),
        text('Cost grows faster than traffic'),
      ],
      body: [
        text('Every new broker copies terabytes, so scaling out takes hours and not minutes.'),
        text('While data is copied, p99 jumps from 40ms to 900ms, just when load peaks.'),
        text('We keep 13 months on NVMe, though 97% of reads touch the last six hours.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_zerem_comparison',
    name: 'v2 and v3',
    content: {
      caption: [text('V2 / V3'), text('v2 · today'), text('v3 · the target')],
      title: text('The same API, another architecture'),
      subtitle: [text('A monolithic broker'), text('Stateless brokers, tiered storage')],
      body: [
        bullets(
          'Storage: local NVMe on every broker',
          'Scale-out: 3 to 5 hours, a full rebalance',
          'Failover: manual, about 12 minutes',
          'Cost per TB a month: $210',
        ),
        bullets(
          'Storage: shared object storage, local cache',
          'Scale-out: under 90 seconds, nothing copied',
          'Failover: automatic, about 4 seconds',
          'Cost per TB a month: $38',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_zerem_process',
    name: 'The path of an event',
    content: {
      caption: [
        text('DATA PATH'),
        text('The SDK batches events and compresses them.'),
        text('Authentication, a quota per tenant, routing.'),
        text('A write to the log, acked after two copies.'),
        text('A closed segment goes to object storage.'),
        text('Reads from the hot cache or the cold tier.'),
      ],
      title: text('The path of an event, end to end'),
      subtitle: [
        text('Producer'),
        text('Gateway'),
        text('Broker'),
        text('Storage'),
        text('Consumer'),
      ],
      number: [text('2ms'), text('6ms'), text('12ms'), text('14ms'), text('4ms')],
      body: text('In all, 38ms from producer to consumer, against a target of 50ms.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_zerem_cards',
    name: 'Design principles',
    content: {
      caption: [
        text('DESIGN PRINCIPLES'),
        text('Measured by: time to scale out'),
        text('Measured by: cost per TB'),
        text('Measured by: p99 under load'),
      ],
      title: text('Three principles we do not trade'),
      subtitle: [
        text('Stateless brokers'),
        text('Storage apart from compute'),
        text('Backpressure end to end'),
      ],
      body: [
        text('A broker holds nothing that cannot be rebuilt. Any instance is replaced in seconds.'),
        text('Data lives in object storage; compute reads and writes. Each grows on its own.'),
        text('When a consumer slows down, the producer knows. No hidden queue grows.'),
        text(
          'Every design decision in v3 is weighed against all three, before a line of code is written.',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_zerem_chart',
    name: 'Pilot results',
    content: {
      caption: [
        text('PILOT RESULTS'),
        text('Source: the pilot cluster, Payments and Search, July to December 2026.'),
      ],
      title: text('The pilot: more throughput, same hardware'),
      number: [text('×3.1'), text('−64%')],
      body: [
        text('peak throughput in December, on the same 24 nodes.'),
        text('in p99 during a rebalance: from 900ms to 320ms.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Thousands of events a second, at peak',
      data: {
        categories: ['July', 'August', 'September', 'October', 'November', 'December'],
        series: [
          { name: 'v2', values: [310, 325, 330, 340, 345, 350] },
          { name: 'v3 (pilot)', values: [380, 520, 690, 840, 960, 1080] },
        ],
      },
    },
  },
  {
    layout: 'l_zerem_table',
    name: 'Service tiers',
    content: {
      caption: [
        text('SERVICE TIERS'),
        text(
          'Every SLO is measured over 30 days. Two quarters in a row out of bounds open a design review.',
        ),
      ],
      title: text('What we promise each kind of topic'),
      footer: FOOTER_EN,
    },
    table: {
      cols: [270, 230, 220, 250, 758],
      rowHeight: 78,
      rows: [
        ['Tier', 'Write p99', 'Uptime', 'Retention', 'Who it is for'],
        ['Realtime', '15ms', '99.99%', '6 hours', 'Payments, fraud detection, checkout'],
        ['Standard', '50ms', '99.95%', '7 days', 'Most product services, notifications'],
        ['Analytics', '250ms', '99.9%', '90 days', 'BI pipelines and operational dashboards'],
        ['Batch', '2s', '99.9%', '13 months', 'Model training, monthly reports, backfill'],
        ['Audit', '5s', '99.99%', '7 years', 'Regulation and audit: append only'],
        ['Replay', 'By source', '99.5%', 'By source', 'Recovery, and rerunning consumers'],
      ],
    },
  },
  {
    layout: 'l_zerem_timeline',
    name: 'Roadmap',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text(
          'Every quarter has an exit: if v3 runs over 50ms at p99 for two weeks, we stop and step back.',
        ),
      ],
      title: text('Four quarters, no big bang'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [
        text('A pilot with two teams'),
        text('Dual-write for all topics'),
        text('Production cutover'),
        text('v2 is switched off'),
      ],
      body: [
        text('Payments and Search move to the v3 cluster.'),
        text('Every producer writes to both systems.'),
        text('Consumers move in groups of 10%.'),
        text('Archive to the cold tier, free the hardware.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_zerem_quote',
    name: 'Quote',
    content: {
      quote: text(
        'Since we moved to v3 my pager is quiet at night. That is not luck, it is architecture.',
      ),
      attribution: text('Noa Barak'),
      caption: text('SRE Lead on Payments, one of the two pilot teams'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_zerem_full_image',
    name: 'Resilience',
    content: {
      image: { assetId: pictures.zeremDatacenter.id },
      caption: text('RESILIENCE'),
      title: text('Three zones, no single point of failure'),
      body: text(
        'Every segment is written to three zones before the ack. A whole zone can go down.',
      ),
    },
  },
  {
    layout: 'l_zerem_team',
    name: 'The team',
    content: {
      caption: [
        text('THE TEAM'),
        text('Tech Lead · Storage'),
        text('Staff Engineer · Brokers'),
        text('SRE · Reliability'),
        text('Product Manager · Platform'),
      ],
      title: text('The team building v3'),
      image: [
        { assetId: pictures.zeremTeam1.id },
        { assetId: pictures.zeremTeam2.id },
        { assetId: pictures.zeremTeam3.id },
        { assetId: pictures.zeremTeam4.id },
      ],
      subtitle: [
        text('Maya Levin'),
        text('Yonatan Sagi'),
        text('Omer Dayan'),
        text('Ronit Avraham'),
      ],
      body: [
        text('Leads tiered storage and the cost model.'),
        text('Owns the stateless broker and failover.'),
        text('Builds the runbooks, SLOs and dashboards.'),
        text('Coordinates the migration with product teams.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_zerem_closing',
    name: 'Closing',
    content: {
      caption: [text('NEXT STEPS'), text('platform@zerem.example · docs.zerem.example/v3')],
      title: text('The pilot starts in January'),
      body: [
        text('By December 15: teams that want in sign up at #zerem-v3'),
        text('By the end of December: an open design review of every RFC'),
        text('January 5: kickoff with Payments and Search'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const zeremSamples = { he: sampleHe, en: sampleEn };

/** The Zerem template: the theme, fourteen layouts for both directions, and its sample deck. */
export function zeremTemplate(): Template {
  const flipped = backgrounds(true);
  const template: Template = {
    theme: copyJson(zeremTheme),
    description: 'Technology: dark and precise, for architecture and engineering decks.',
    dir: 'rtl',
    layouts: layouts(),
    assets: assetTable([
      pictures.zeremFiber,
      pictures.zeremDatacenter,
      pictures.zeremTeam1,
      pictures.zeremTeam2,
      pictures.zeremTeam3,
      pictures.zeremTeam4,
    ]),
  };
  template.flipped = flipBackgrounds(template.layouts, {
    l_zerem_hero: flipped.hero,
    l_zerem_quote: flipped.quote,
    l_zerem_closing: flipped.closing,
  });
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
