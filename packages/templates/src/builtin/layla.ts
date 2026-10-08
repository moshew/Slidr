import type { Color, Element, Frame, Layout, Theme } from '@slidr/model';
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
  SURFACE,
  text,
  token,
  type SampleSlide,
} from './kit';
import { pictures } from './pictures.generated';

/**
 * Layla: the bold dark template. A warm black ground, one electric orange, and very heavy type
 * set large and tight, as on a poster or a keynote. Colour comes in solid blocks: a slab, a band,
 * a tile. Numerals are the ornament.
 *
 * A placeholder's text is always white here, so a block of the orange carries only text above
 * 48px (white on it is 3.3:1), or text the layout draws itself in black.
 */
export const laylaTheme: Theme = {
  id: 'layla',
  name: 'Layla',
  colors: {
    bg: '#0c0b0a',
    surface: '#1c1a18',
    text: '#ffffff',
    muted: '#a8a29a',
    primary: '#ff4d00',
    secondary: '#f3ece0',
    accent: '#ffb38a',
    chart: ['#ff4d00', '#f3ece0', '#8d877f', '#ff9466', '#5c5752', '#ffd0b8'],
  },
  fonts: {
    heading: { he: 'Heebo', latin: 'Montserrat' },
    body: { he: 'Heebo', latin: 'Inter' },
  },
  textStyles: {
    display: { font: 'heading', size: 168, weight: 900, lineHeight: 1, color: { token: 'text' } },
    title: { font: 'heading', size: 68, weight: 800, lineHeight: 1.1, color: { token: 'text' } },
    heading: { font: 'heading', size: 44, weight: 800, lineHeight: 1.15, color: { token: 'text' } },
    body: { font: 'body', size: 30, weight: 400, lineHeight: 1.4, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 600, lineHeight: 1.35, color: { token: 'muted' } },
  },
  radius: 0,
  shadow: { x: 0, y: 16, blur: 40, color: { value: '#000000', alpha: 0.5 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [SURFACE],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

const ORANGE = solid(token('primary'));
const COAL = solid(token('surface'));
const NIGHT = solid(token('bg'));
const HAIR = solid(token('text', 0.22));

/** The literal colours of the drawings, and the tokens they stand for. */
const PAINT = {
  '#ff4d00': token('primary'),
  '#0c0b0a': token('bg'),
  '#ffffff': token('text'),
  '#1c1a18': token('surface'),
};

/** The mark of the template: a slanted bar and a point. A deck replaces it with its logo. */
const markOf = (bar: string) =>
  `<svg viewBox="0 0 40 40"><path fill="${bar}" d="M13 0h17L17 40H0z"/><path fill="#ffffff" d="M29 29h11v11H29z"/></svg>`;

const mark = (id: string, frame: Frame, bar = '#ff4d00') =>
  drawing(id, frame, markOf(bar), PAINT, { role: 'logo', name: 'logo' });

/** The quotation mark of each direction. They are two marks, not one mark and its mirror. */
const QUOTE_RTL =
  '<svg viewBox="0 0 66 52"><path fill="#0c0b0a" d="M66 0v22c0 18-9 28-26 30V42c8-2 12-7 12-16H40V0h26ZM26 0v22C26 40 17 50 0 52V42c8-2 12-7 12-16H0V0h26Z"/></svg>';
const QUOTE_LTR =
  '<svg viewBox="0 0 66 52"><path fill="#0c0b0a" d="M0 52V30C0 12 9 2 26 0v10c-8 2-12 7-12 16h12v26H0Zm40 0V30C40 12 49 2 66 0v10c-8 2-12 7-12 16h12v26H40Z"/></svg>';

const quoteGlyph = (frame: Frame, markup: string) =>
  drawing('d_layla_quote_glyph', frame, markup, PAINT);

/**
 * Slanted bars, the motif of the template, cut by the box they are drawn in. They lean one way
 * on a right-to-left slide and the mirror turns them.
 */
function slashes(id: string, frame: Frame, count: number, ink: string): Element {
  const { w, h } = frame;
  const pitch = w / count;
  const bar = pitch / 2;
  const lean = h * 0.36;
  const bars = Array.from({ length: count + 2 }, (_, i) => {
    const x = (i - 1.5) * pitch;
    return `<path d="M${x + lean} 0h${bar}L${x + bar} ${h}h${-bar}z"/>`;
  }).join('');
  return drawing(id, frame, `<svg viewBox="0 0 ${w} ${h}" fill="${ink}">${bars}</svg>`, PAINT);
}

/**
 * A numeral the layout sets itself, in the middle of its box: black on an orange tile unless
 * another colour is given. Centred, so it stays where it is when the layout is mirrored.
 */
const numeral = (id: string, frame: Frame, n: number, color: Color = token('bg')) =>
  label(id, frame, `0${n}`, 'heading', {
    color,
    weight: 900,
    dir: 'auto',
    align: 'center',
    vAlign: 'middle',
  });

/**
 * The head of a content slide. The title stands on a line and grows upwards, so a title of one
 * line and a title of two end at the same height; the line over it sits at the far end of that
 * same line.
 */
const head = () => [
  place('p_kicker', 'caption', atEnd(96, 192, 480, 34), 'caption', { align: 'end' }),
  place('p_title', 'title', at(96, 78, 1200, 152), 'title', { vAlign: 'bottom' }),
];

/**
 * What frames a content slide besides its head: the orange bar under the title, and the foot.
 * The mark stands alone at the start, which leaves a logo of any width room to replace it; at
 * the end the deck's name, with the slide's number beyond it in black on an orange tab (SLD-04).
 */
function frameOf(
  name: string,
  width = 1728,
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  return {
    placeholders: [
      place('p_footer', 'footer', at(96 + width - 880, 953, 800, 34), 'caption', { align: 'end' }),
    ],
    decorations: [
      rect(`d_layla_${name}_bar`, at(96, 246, 96, 10), ORANGE),
      mark(`d_layla_${name}_mark`, at(96, 946, 48, 48)),
      rect(`d_layla_${name}_tab`, at(96 + width - 64, 946, 64, 48), ORANGE),
      pageNumber(`d_layla_${name}_number`, at(96 + width - 64, 953, 64, 34), 'caption', {
        color: token('bg'),
        weight: 700,
        align: 'center',
      }),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const columns4 = [96, 540, 984, 1428];
const cards3 = [96, 680, 1264];
const steps5 = [96, 450, 804, 1158, 1512];
const rows3 = [300, 500, 700];
const lines3 = [330, 500, 670];
const stats3 = [286, 492, 698];

function layouts(): Layout[] {
  return [
    {
      id: 'l_layla_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        place('p_kicker', 'caption', at(176, 95, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 272, 1248, 508), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 838, 1248, 104), 'heading'),
        place('p_meta', 'caption', at(96, 958, 1248, 34), 'caption'),
      ],
      decorations: [
        // A slab of the orange down the far side, with the slanted bars cut into its foot.
        rect('d_layla_hero_slab', atEnd(0, 0, 480, 1080), ORANGE),
        slashes('d_layla_hero_slashes', atEnd(0, 600, 480, 480), 4, '#0c0b0a'),
        mark('d_layla_hero_mark', at(96, 80, 56, 56)),
        rect('d_layla_hero_rule', at(96, 804, 1248, 8), solid(token('text'))),
      ],
    },
    {
      id: 'l_layla_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        place('p_number', 'number', at(96, 150, 900, 185), 'display'),
        place('p_kicker', 'caption', atEnd(96, 95, 800, 34), 'caption', { align: 'end' }),
        // The title stands on a band of the orange from edge to edge: white on it reads at
        // this size, and at no size below it.
        place('p_title', 'title', at(96, 430, 1728, 340), 'display', { vAlign: 'middle' }),
        place('p_subtitle', 'subtitle', at(96, 848, 1300, 104), 'heading'),
      ],
      decorations: [
        rect('d_layla_section_band', atEnd(0, 396, 1920, 408), ORANGE),
        slashes('d_layla_section_slashes', atEnd(96, 176, 400, 150), 5, '#1c1a18'),
      ],
    },
    {
      id: 'l_layla_title',
      name: 'Title',
      archetype: 'title',
      placeholders: [
        // The title stands on the orange bar, as on every content slide.
        place('p_title', 'title', at(96, 154, 1728, 76), 'title', { vAlign: 'bottom' }),
      ],
      decorations: frameOf('title').decorations,
    },
    {
      id: 'l_layla_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head(),
        place('p_number', 'number', at(136, 404, 976, 185), 'display', { vAlign: 'bottom' }),
        place('p_label', 'subtitle', at(96, 636, 1056, 53), 'heading'),
        place('p_body', 'body', at(96, 702, 1056, 170), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', at(1272, top + 22, 512, 79), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', at(1272, top + 106, 512, 68), 'caption'),
        ]),
        ...frameOf('big_number').placeholders,
      ],
      decorations: [
        // The figure of the slide stands on a block of the orange.
        rect('d_layla_big_number_block', at(96, 286, 1056, 322), ORANGE),
        ...stats3.map((top, i) =>
          rect(`d_layla_big_number_stat${i + 1}`, at(1232, top, 592, 190), COAL),
        ),
        ...frameOf('big_number').decorations,
      ],
    },
    {
      id: 'l_layla_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(504, 240, 1320, 378), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(504, 676, 1320, 53), 'heading'),
        place('p_caption', 'caption', at(504, 738, 1320, 68), 'caption'),
        ...frameOf('quote').placeholders,
      ],
      decorations: [
        rect('d_layla_quote_tile', at(96, 249, 360, 360), ORANGE),
        quoteGlyph(at(186, 358, 180, 142), QUOTE_RTL),
        rect('d_layla_quote_rule', at(504, 648, 96, 10), ORANGE),
        // The foot without the bar that stands under a title.
        ...frameOf('quote').decorations.slice(1),
      ],
    },
    {
      id: 'l_layla_text',
      name: 'Text',
      archetype: 'text',
      placeholders: [
        place('p_title', 'title', at(96, 154, 1728, 76), 'title', { vAlign: 'bottom' }),
        place('p_body', 'body', at(96, 296, 1728, 604), 'body'),
      ],
      decorations: frameOf('text').decorations,
    },
    {
      id: 'l_layla_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head(),
        // The picture runs off the far edge and the foot of the slide.
        place('p_image', 'image', atEnd(0, 286, 640, 794)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(192, top, 1016, 53), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(192, top + 58, 1016, 128), 'body'),
        ]),
        ...frameOf('text_image', 1112).placeholders,
      ],
      decorations: [
        ...rows3.flatMap((top, i) => [
          rect(`d_layla_text_image_tile${i + 1}`, at(96, top + 2, 72, 72), ORANGE),
          numeral(`d_layla_text_image_n${i + 1}`, at(96, top + 2, 72, 72), i + 1),
        ]),
        ...frameOf('text_image', 1112).decorations,
      ],
    },
    {
      id: 'l_layla_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture runs from edge to edge; the text has the black under it, because nothing
        // of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 668)),
        place('p_kicker', 'caption', at(96, 728, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 770, 1104, 152), 'title'),
        place('p_body', 'body', atEnd(96, 776, 520, 170), 'body'),
      ],
      decorations: [
        rect('d_layla_full_image_stripe', atEnd(0, 668, 1920, 24), ORANGE),
        rect('d_layla_full_image_column', atEnd(664, 776, 2, 146), HAIR),
      ],
    },
    {
      id: 'l_layla_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head(),
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}`, 'subtitle', at(start + 36, 404, 488, 104), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_card${i + 1}_body`, 'body', at(start + 36, 544, 488, 190), 'body'),
          place(`p_card${i + 1}_note`, 'caption', at(start + 188, 318, 336, 68), 'caption', {
            align: 'end',
          }),
        ]),
        place('p_takeaway', 'body', at(96, 800, 1728, 86), 'body'),
        ...frameOf('cards').placeholders,
      ],
      decorations: [
        ...cards3.flatMap((start, i) => [
          rect(`d_layla_cards_card${i + 1}`, at(start, 286, 560, 486), COAL),
          label(`d_layla_cards_n${i + 1}`, at(start + 36, 306, 140, 79), `0${i + 1}`, 'title', {
            color: token('primary'),
            weight: 900,
            dir: 'auto',
            align: 'start',
          }),
          rect(`d_layla_cards_rule${i + 1}`, at(start + 36, 524, 488, 2), HAIR),
        ]),
        ...frameOf('cards').decorations,
      ],
    },
    {
      id: 'l_layla_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head(),
        // The dates stand in white on a band of the orange, cut where one stage ends.
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 316, 396, 160), 'title', {
            vAlign: 'middle',
          }),
          place(`p_what${i + 1}`, 'subtitle', at(start, 500, 396, 104), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_what${i + 1}_body`, 'body', at(start, 616, 396, 212), 'body'),
        ]),
        place('p_note', 'caption', at(96, 868, 1728, 34), 'caption'),
        ...frameOf('timeline').placeholders,
      ],
      decorations: [
        rect('d_layla_timeline_band', atEnd(0, 316, 1920, 160), ORANGE),
        ...columns4
          .slice(1)
          .map((start, i) =>
            rect(`d_layla_timeline_cut${i + 1}`, at(start - 30, 316, 12, 160), NIGHT),
          ),
        ...frameOf('timeline').decorations,
      ],
    },
    {
      id: 'l_layla_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start, 402, 312, 104), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_step${i + 1}_body`, 'caption', at(start, 516, 312, 132), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start, 676, 312, 79), 'title'),
        ]),
        place('p_summary', 'body', at(136, 800, 1648, 86), 'body', { vAlign: 'middle' }),
        ...frameOf('process').placeholders,
      ],
      decorations: [
        rect('d_layla_process_rail', at(96, 330, 1728, 8), HAIR),
        ...steps5.flatMap((start, i) => [
          rect(`d_layla_process_tile${i + 1}`, at(start, 286, 96, 96), ORANGE),
          numeral(`d_layla_process_n${i + 1}`, at(start, 286, 96, 96), i + 1),
          rect(`d_layla_process_base${i + 1}`, at(start, 662, 312, 2), HAIR),
        ]),
        rect('d_layla_process_sum', at(96, 788, 1728, 110), COAL),
        ...frameOf('process').decorations,
      ],
    },
    {
      id: 'l_layla_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head(),
        place('p_before_tag', 'caption', at(136, 330, 760, 34), 'caption'),
        place('p_before', 'subtitle', at(136, 370, 760, 104), 'heading', { vAlign: 'bottom' }),
        place('p_before_body', 'body', at(136, 516, 760, 256), 'body'),
        place('p_after_tag', 'caption', atEnd(136, 330, 760, 34), 'caption'),
        place('p_after', 'subtitle', atEnd(136, 370, 760, 104), 'heading', { vAlign: 'bottom' }),
        place('p_after_body', 'body', atEnd(136, 516, 760, 256), 'body'),
        ...frameOf('comparison').placeholders,
      ],
      decorations: [
        // What was stands in an outline; what is, on a block with the orange over it.
        rect('d_layla_comparison_before', at(96, 286, 840, 526), solid(token('surface', 0)), {
          stroke: { color: token('text', 0.22), width: 2 },
        }),
        rect('d_layla_comparison_after', atEnd(96, 286, 840, 526), COAL),
        rect('d_layla_comparison_slab', atEnd(96, 286, 840, 16), ORANGE),
        rect('d_layla_comparison_rule1', at(136, 492, 760, 2), HAIR),
        rect('d_layla_comparison_rule2', atEnd(136, 492, 760, 2), HAIR),
        ...frameOf('comparison').decorations,
      ],
    },
    {
      id: 'l_layla_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head(),
        place('p_chart', 'chart', at(96, 286, 1080, 606)),
        place('p_stat1', 'number', at(1248, 294, 552, 170), 'display', { vAlign: 'middle' }),
        place('p_stat1_body', 'body', at(1224, 484, 600, 86), 'body'),
        place('p_stat2', 'number', at(1248, 588, 552, 170), 'display', { vAlign: 'middle' }),
        place('p_stat2_body', 'body', at(1224, 778, 600, 86), 'body'),
        place('p_source', 'caption', at(1224, 870, 600, 68), 'caption'),
        ...frameOf('chart').placeholders,
      ],
      decorations: [
        rect('d_layla_chart_block1', at(1224, 286, 600, 186), ORANGE),
        rect('d_layla_chart_block2', at(1224, 580, 600, 186), COAL),
        ...frameOf('chart').decorations,
      ],
    },
    {
      id: 'l_layla_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head(),
        place('p_table', 'table', at(96, 284, 1728, 608)),
        place('p_note', 'caption', at(96, 898, 1728, 34), 'caption'),
        ...frameOf('table').placeholders,
      ],
      decorations: frameOf('table').decorations,
    },
    {
      id: 'l_layla_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start, 286, 396, 380)),
          place(`p_person${i + 1}`, 'subtitle', at(start, 694, 396, 53), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start, 750, 396, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start, 790, 396, 132), 'caption'),
        ]),
        ...frameOf('team').placeholders,
      ],
      decorations: [
        ...columns4.map((start, i) =>
          rect(`d_layla_team_bar${i + 1}`, at(start, 666, 396, 12), ORANGE),
        ),
        ...frameOf('team').decorations,
      ],
    },
    {
      id: 'l_layla_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(1248, 95, 576, 68), 'caption'),
        // The opening turned inside out: the title stands on the orange, the black is the slab.
        // Four lines of room: two lines of a title that each break once still fit.
        place('p_title', 'title', at(96, 244, 960, 680), 'display', { vAlign: 'bottom' }),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(1336, top + 8, 488, 128), 'body'),
        ),
        place('p_contact', 'caption', at(1248, 924, 576, 68), 'caption', { vAlign: 'bottom' }),
      ],
      decorations: [
        rect('d_layla_closing_block', at(0, 0, 1152, 1080), ORANGE),
        slashes('d_layla_closing_slashes', at(672, 0, 480, 200), 4, '#0c0b0a'),
        mark('d_layla_closing_mark', at(96, 80, 72, 72), '#0c0b0a'),
        ...lines3.flatMap((top, i) => [
          rect(`d_layla_closing_rule${i + 1}`, at(1248, top - 22, 576, 2), HAIR),
          label(`d_layla_closing_n${i + 1}`, at(1248, top, 72, 53), `0${i + 1}`, 'heading', {
            color: token('primary'),
            weight: 900,
            dir: 'auto',
            align: 'start',
          }),
        ]),
      ],
    },
  ];
}

/**
 * The layouts the mirror gets wrong for a left-to-right deck. Only the quote: its mark is a
 * glyph of the direction, and a mirrored closing mark is not an opening one.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  const quote = drawn.find((layout) => layout.id === 'l_layla_quote');
  if (!quote) return [];
  const mirrored = mirrorLayout(quote);
  return [
    {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) =>
        decoration.id === 'd_layla_quote_glyph'
          ? quoteGlyph(decoration.frame, QUOTE_LTR)
          : decoration,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: a night festival's deck for its partners, slide by slide, on the layouts

const FOOTER = text('HATZOT 2027 · PARTNERS');
const YEARS = ['2021', '2022', '2023', '2024', '2025', '2026'];
const VISITORS = [9, 14, 21, 29, 35, 48];
const PRESALE = [1, 3, 6, 11, 19, 31];
const TABLE_COLS = [520, 520, 224, 216, 248];
const TABLE_ROW = 76;

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_layla_hero',
    name: 'פתיחה',
    content: {
      caption: [text('PARTNERSHIP DECK 2027'), text('מוצג לשותפים ולנותני חסות · ינואר 2027')],
      title: text('העיר', 'לא ישנה'),
      subtitle: text('פסטיבל חצות 2027 · הצעה לשותפים'),
    },
  },
  {
    layout: 'l_layla_section',
    name: 'הלילה במספרים',
    content: {
      number: text('01'),
      caption: text('חלק ראשון מתוך שניים'),
      title: text('הלילה במספרים'),
      subtitle: text('מי מגיע, כמה זמן נשאר, ומה זה שווה למי שנמצא שם איתנו.'),
    },
  },
  {
    layout: 'l_layla_big_number',
    name: 'קהל',
    content: {
      caption: [
        text('AUDIENCE'),
        text('לעומת קיץ 2025'),
        text('מהקהל בני 18 עד 34'),
        text('שעות שהייה בממוצע למבקר'),
      ],
      title: text('לילה אחד, קהל שיא'),
      number: [text('48K'), text('+37%'), text('71%'), text('6.5')],
      subtitle: text('מבקרים בלילה אחד, באוגוסט 2026'),
      body: text(
        'הכרטיסים אזלו 19 יום לפני האירוע. שניים מכל שלושה מבקרים הגיעו מחוץ לעיר, ורובם נשארו עד הזריחה.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_chart',
    name: 'צמיחה',
    content: {
      caption: [text('GROWTH'), text('מקור: מערכת הכרטוס של הפסטיבל, 2021 עד 2026.')],
      title: text('שש שנים, כל לילה גדול מקודמו'),
      number: [text('+37%'), text('64%')],
      body: [text('מבקרים, לעומת קיץ 2025.'), text('מהכרטיסים נמכרו במכירה המוקדמת.')],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'מבקרים וכרטיסים מוקדמים, באלפים',
      data: {
        categories: YEARS,
        series: [
          { name: 'מבקרים', values: VISITORS },
          { name: 'מכירה מוקדמת', values: PRESALE },
        ],
      },
    },
  },
  {
    layout: 'l_layla_text_image',
    name: 'הלילה',
    content: {
      caption: text('THE NIGHT'),
      title: text('ארבע במות, עיר אחת'),
      image: { assetId: pictures.laylaStage1.id },
      subtitle: [text('הבמה המרכזית'), text('שדרת האוכל'), text('גג האמנות')],
      body: [
        text('12 הופעות בין שמונה בערב לחמש בבוקר, מול 20 אלף איש בכיכר העירייה.'),
        text('40 דוכנים של שפים ויצרנים מקומיים, פתוחים עד הזריחה.'),
        text('מיצבי אור וסאונד על גג החניון, עם תצפית על כל הפסטיבל.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_quote',
    name: 'ציטוט',
    content: {
      quote: text('לא קנינו שלט. קנינו לילה שלם עם 48 אלף איש, והם עדיין מדברים עליו.'),
      attribution: text('תמר אשכנזי'),
      caption: text('סמנכ״לית שיווק, גלים משקאות · שותפת במה ב-2025 וב-2026'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_full_image',
    name: 'שלוש בלילה',
    content: {
      image: { assetId: pictures.laylaScene.id },
      caption: text('THREE A.M.'),
      title: text('שלוש בלילה.', 'אף אחד לא הולך הביתה.'),
      body: text('מבקר ממוצע נשאר בפסטיבל שש שעות וחצי. זה הזמן שהמותג שלכם נמצא איתו.'),
    },
  },
  {
    layout: 'l_layla_section',
    name: 'ההצעה',
    content: {
      number: text('02'),
      caption: text('חלק שני מתוך שניים'),
      title: text('ההצעה'),
      subtitle: text('שבע חבילות, לוח זמנים אחד, ומה קורה מהשיחה הראשונה ועד שהשער נפתח.'),
    },
  },
  {
    layout: 'l_layla_cards',
    name: 'למה להיות שם',
    content: {
      caption: [text('WHY PARTNER'), text('REACH'), text('PRESENCE'), text('CONTENT')],
      title: text('שלוש סיבות להיות שם'),
      subtitle: [text('2.4 מיליון צפיות'), text('מתחם משלכם'), text('במה על שמכם')],
      body: [
        text('שידור חי, סרטוני אמנים ותוכן של הקהל. המותג שלכם בכל פריים.'),
        text('200 מ״ר ממותגים בלב השדרה. כמעט כל מבקר עובר שם.'),
        text('אחת מארבע הבמות נושאת את שמכם: בשילוט, באפליקציה ובכל הכרזה.'),
        text('ב-2026 חזרו 9 מתוך 11 השותפים לשנה נוספת.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_table',
    name: 'חבילות',
    content: {
      caption: [
        text('PACKAGES'),
        text('המחירים לפני מע״מ. חבילת השותף הראשי נמכרת לשותף אחד בלבד.'),
      ],
      title: text('שבע חבילות שותפות לקיץ 2027'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['חבילה', 'מה היא כוללת', 'מתחם', 'כרטיסים', 'מחיר'],
        ['שותף ראשי · Headline', 'שם הפסטיבל והבמה המרכזית', '400 מ״ר', '600', '₪1.8M'],
        ['שותף במה · Stage', 'אחת משלוש במות המשנה', '200 מ״ר', '300', '₪950K'],
        ['שותף מתחם · Zone', 'שדרת האוכל או גג האמנות', '120 מ״ר', '150', '₪480K'],
        ['שותף תוכן · Content', 'השידור החי וסרטוני האמנים', '40 מ״ר', '80', '₪320K'],
        ['שותף תנועה · Mobility', 'ההסעות מהרכבת ובחזרה', '—', '60', '₪180K'],
        ['שותף קהילה · Community', 'מערך המתנדבים והנגישות', '40 מ״ר', '40', '₪140K'],
        ['ספק רשמי · Supplier', 'קטגוריית מוצר אחת', '20 מ״ר', '30', '₪60K'],
      ],
    },
  },
  {
    layout: 'l_layla_comparison',
    name: 'אז והיום',
    content: {
      caption: [text('THEN AND NOW'), text('קיץ 2024'), text('קיץ 2026')],
      title: text('מה השתנה בשנתיים'),
      subtitle: [text('במה אחת, 29 אלף איש'), text('ארבע במות, 48 אלף איש')],
      body: [
        bullets(
          'שלושה שותפים, כולם מקומיים',
          'מכירה מוקדמת: 38% מהכרטיסים',
          'שהייה ממוצעת: 3.8 שעות',
        ),
        bullets(
          'אחד עשר שותפים, ארבעה מהם ארציים',
          'מכירה מוקדמת: 64% מהכרטיסים',
          'שהייה ממוצעת: 6.5 שעות',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_process',
    name: 'איך זה עובד',
    content: {
      caption: [
        text('HOW IT WORKS'),
        text('שיחת היכרות: מטרות, קהל ותקציב.'),
        text('חבילה מותאמת, עם מדדים מוסכמים.'),
        text('המתחם, השילוט והתוכן.'),
        text('בנייה בשטח, חזרות ובדיקות בטיחות.'),
        text('משמונה בערב ועד הזריחה.'),
      ],
      title: text('מהשיחה הראשונה ועד שהשער נפתח'),
      subtitle: [text('שיחה'), text('הצעה'), text('עיצוב'), text('הקמה'), text('הלילה')],
      number: [text('3 ימים'), text('14 ימים'), text('41 ימים'), text('12 ימים'), text('9 שעות')],
      body: text('עשרה שבועות מהשיחה הראשונה ועד הלילה עצמו. ההרשמה נסגרת ב-1 באפריל.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_timeline',
    name: 'תחנות',
    content: {
      caption: [text('ROADMAP 2027'), text('התאריכים כפופים לאישור העירייה, שצפוי עד סוף ינואר.')],
      title: text('ארבע תחנות עד הלילה'),
      number: [text('15.2'), text('1.4'), text('10.6'), text('19.8')],
      subtitle: [
        text('מכירה מוקדמת'),
        text('סגירת השותפים'),
        text('חשיפת הליינאפ'),
        text('ליל הפסטיבל'),
      ],
      body: [
        text('20 אלף כרטיסים במחיר מוקדם, עם שמות השותפים הראשונים.'),
        text('החבילות נסגרות, ועיצוב המתחמים יוצא לדרך.'),
        text('36 אמנים ב-24 שעות של פרסום, בכל הערוצים.'),
        text('שמונה בערב, כיכר העירייה. השער נפתח.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_team',
    name: 'הצוות',
    content: {
      caption: [
        text('THE TEAM'),
        text('מנהלת הפסטיבל'),
        text('מנהל אמנותי'),
        text('שותפויות ומסחר'),
        text('הפקה ותפעול'),
      ],
      title: text('מי מרים את הלילה'),
      image: [
        { assetId: pictures.laylaTeam1.id },
        { assetId: pictures.laylaTeam2.id },
        { assetId: pictures.laylaTeam3.id },
        { assetId: pictures.laylaTeam4.id },
      ],
      subtitle: [text('נגה רביד'), text('אסף מלכה'), text('שירה לנדאו'), text('יונתן בר')],
      body: [
        text('מובילה את חצות מהלילה הראשון, ב-2021.'),
        text('בונה את הליינאפ: 36 אמנים על ארבע במות.'),
        text('הכתובת של כל שותף, מהשיחה ועד הדוח המסכם.'),
        text('250 אנשי צוות, 400 מתנדבים ולילה אחד.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_closing',
    name: 'סיום',
    content: {
      caption: [text('NEXT STEPS'), text('partners@hatzot.example · 03-555-0127')],
      title: text('נתראה', 'בחצות'),
      body: [
        text('עד 15 בפברואר: שיחת היכרות של שעה, אצלכם או אצלנו'),
        text('עד 1 במרץ: הצעה מותאמת, עם מדדים והתחייבות לחשיפה'),
        text('1 באפריל: ההרשמה לשותפים נסגרת'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_layla_hero',
    name: 'Opening',
    content: {
      caption: [text('PARTNERSHIP DECK 2027'), text('For partners and sponsors · January 2027')],
      title: text('The city', 'stays up'),
      subtitle: text('Hatzot Festival 2027 · A proposal for partners'),
    },
  },
  {
    layout: 'l_layla_section',
    name: 'The numbers',
    content: {
      number: text('01'),
      caption: text('Part one of two'),
      title: text('The numbers'),
      subtitle: text('Who comes, how long they stay, and what it is worth to be there with us.'),
    },
  },
  {
    layout: 'l_layla_big_number',
    name: 'Audience',
    content: {
      caption: [
        text('AUDIENCE'),
        text('on summer 2025'),
        text('of the crowd is aged 18 to 34'),
        text('hours on site, on average'),
      ],
      title: text('A record night'),
      number: [text('48K'), text('+37%'), text('71%'), text('6.5')],
      subtitle: text('visitors in a single night'),
      body: text(
        'Tickets sold out 19 days before the gates opened. Two in three visitors came from out of town, and most stayed until sunrise.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_chart',
    name: 'Growth',
    content: {
      caption: [text('GROWTH'), text('Source: the festival ticketing system, 2021 to 2026.')],
      title: text('Six years, each night bigger'),
      number: [text('+37%'), text('64%')],
      body: [text('visitors, on summer 2025.'), text('of tickets sold in the presale.')],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'Visitors and presale tickets, thousands',
      data: {
        categories: YEARS,
        series: [
          { name: 'Visitors', values: VISITORS },
          { name: 'Presale', values: PRESALE },
        ],
      },
    },
  },
  {
    layout: 'l_layla_text_image',
    name: 'The night',
    content: {
      caption: text('THE NIGHT'),
      title: text('Four stages, one city'),
      image: { assetId: pictures.laylaStage1.id },
      subtitle: [text('The main stage'), text('Food avenue'), text('The art roof')],
      body: [
        text('12 shows between eight in the evening and five in the morning, for 20,000 people.'),
        text('40 stalls run by local chefs and makers, open until sunrise.'),
        text('Light and sound installations on the car-park roof, above the whole festival.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_quote',
    name: 'Quote',
    content: {
      quote: text(
        'We did not buy a billboard. We bought a whole night with 48,000 people, and they still talk about it.',
      ),
      attribution: text('Tamar Ashkenazi'),
      caption: text('VP Marketing, Galim Beverages · stage partner in 2025 and 2026'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_full_image',
    name: 'Three a.m.',
    content: {
      image: { assetId: pictures.laylaScene.id },
      caption: text('THREE A.M.'),
      title: text('Three in the morning.', 'Nobody is going home.'),
      body: text(
        'The average visitor stays six and a half hours. That is how long your brand stays with them.',
      ),
    },
  },
  {
    layout: 'l_layla_section',
    name: 'The offer',
    content: {
      number: text('02'),
      caption: text('Part two of two'),
      title: text('The offer'),
      subtitle: text('Seven packages, one timeline, and what happens before the gates open.'),
    },
  },
  {
    layout: 'l_layla_cards',
    name: 'Why partner',
    content: {
      caption: [text('WHY PARTNER'), text('REACH'), text('PRESENCE'), text('CONTENT')],
      title: text('Three reasons to be there'),
      subtitle: [text('2.4M views'), text('Your own zone'), text('Your own stage')],
      body: [
        text('A live stream and artist videos. Your brand in every frame.'),
        text('200 branded square metres. Nearly every visitor passes through.'),
        text('One of four stages carries your name, on site and online.'),
        text('Nine of eleven partners returned in 2026.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_table',
    name: 'Packages',
    content: {
      caption: [
        text('PACKAGES'),
        text('Prices exclude VAT. The headline package is sold to one partner only.'),
      ],
      title: text('Seven partner packages for 2027'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['Package', 'What it includes', 'Zone', 'Tickets', 'Price'],
        ['Headline partner', 'Festival name, main stage', '400 m²', '600', '₪1.8M'],
        ['Stage partner', 'One of three side stages', '200 m²', '300', '₪950K'],
        ['Zone partner', 'Food avenue or the art roof', '120 m²', '150', '₪480K'],
        ['Content partner', 'Live stream, artist videos', '40 m²', '80', '₪320K'],
        ['Mobility partner', 'Shuttles to the train', '—', '60', '₪180K'],
        ['Community partner', 'Volunteers, accessibility', '40 m²', '40', '₪140K'],
        ['Official supplier', 'One product category', '20 m²', '30', '₪60K'],
      ],
    },
  },
  {
    layout: 'l_layla_comparison',
    name: 'Then and now',
    content: {
      caption: [text('THEN AND NOW'), text('Summer 2024'), text('Summer 2026')],
      title: text('What changed in two years'),
      subtitle: [text('One stage, 29,000 people'), text('Four stages, 48,000 people')],
      body: [
        bullets(
          'Three partners, all of them local',
          'Presale: 38% of tickets',
          'Average stay: 3.8 hours',
        ),
        bullets(
          'Eleven partners, four of them national',
          'Presale: 64% of tickets',
          'Average stay: 6.5 hours',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_process',
    name: 'How it works',
    content: {
      caption: [
        text('HOW IT WORKS'),
        text('Goals, audience, budget.'),
        text('A package with agreed metrics.'),
        text('Zone, signage, content.'),
        text('Building and safety checks.'),
        text('From eight until sunrise.'),
      ],
      title: text('From first call to open gates'),
      subtitle: [text('Call'), text('Offer'), text('Design'), text('Build'), text('The night')],
      number: [text('3 days'), text('14 days'), text('41 days'), text('12 days'), text('9 hours')],
      body: text('Ten weeks from first call to the night. Sign-up closes April 1.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_timeline',
    name: 'Stops',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text('Dates are subject to city approval, expected in January.'),
      ],
      title: text('Four stops before the night'),
      number: [text('Feb 15'), text('Apr 1'), text('Jun 10'), text('Aug 19')],
      subtitle: [
        text('Presale opens'),
        text('Partners close'),
        text('Line-up reveal'),
        text('Festival night'),
      ],
      body: [
        text('20,000 early tickets, first partners named.'),
        text('Packages close and zone design begins.'),
        text('36 artists announced in 24 hours.'),
        text('Eight in the evening. Gates open.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_team',
    name: 'The team',
    content: {
      caption: [
        text('THE TEAM'),
        text('Festival director'),
        text('Artistic director'),
        text('Partnerships'),
        text('Production'),
      ],
      title: text('The people behind the night'),
      image: [
        { assetId: pictures.laylaTeam1.id },
        { assetId: pictures.laylaTeam2.id },
        { assetId: pictures.laylaTeam3.id },
        { assetId: pictures.laylaTeam4.id },
      ],
      subtitle: [text('Noga Ravid'), text('Asaf Malka'), text('Shira Landau'), text('Yonatan Bar')],
      body: [
        text('Has led Hatzot since the first night, in 2021.'),
        text('Builds the line-up: 36 artists on four stages.'),
        text('Your contact, from the first call to the final report.'),
        text('A crew of 250, 400 volunteers and one night.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_layla_closing',
    name: 'Closing',
    content: {
      caption: [text('NEXT STEPS'), text('partners@hatzot.example · 03-555-0127')],
      title: text('See you at', 'midnight'),
      body: [
        text('By February 15: a one-hour call, at your office or ours'),
        text('By March 1: a tailored offer, with metrics and a reach promise'),
        text('April 1: partner sign-up closes'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const laylaSamples = { he: sampleHe, en: sampleEn };

/** The Layla template: the theme, sixteen layouts for both directions, and its sample deck. */
export function laylaTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(laylaTheme),
    description:
      'Bold and dark: a black ground, one electric orange and very heavy type, for launches and keynotes.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.laylaScene,
      pictures.laylaStage1,
      pictures.laylaTeam1,
      pictures.laylaTeam2,
      pictures.laylaTeam3,
      pictures.laylaTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
