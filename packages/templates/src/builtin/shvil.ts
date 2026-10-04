import type { ColorToken, Element, Frame, Layout, RichText, Shadow, Theme } from '@slidr/model';
import { copyJson } from '../json';
import { mirrorLayout } from '../mirror';
import type { Template } from '../template';
import {
  assetTable,
  at,
  atEnd,
  dot,
  drawing,
  label,
  pageNumber,
  para,
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
 * Shvil: the marketing template. Warm, light and rounded, with large photographs. Derived from
 * the reference deck `docs/reference-decks/shvil.html`, whose theme block holds these same values.
 */
export const shvilTheme: Theme = {
  id: 'shvil',
  name: 'Shvil',
  colors: {
    bg: '#fbf6ec',
    surface: '#ffffff',
    text: '#2a1f1a',
    muted: '#75655a',
    primary: '#c4451c',
    secondary: '#1f5c4a',
    accent: '#f2b33d',
    chart: ['#c4451c', '#1f5c4a', '#f2b33d', '#e58f6a', '#3e8e7a', '#75655a'],
  },
  fonts: {
    heading: { he: 'Rubik', latin: 'Poppins' },
    body: { he: 'Rubik', latin: 'DM Sans' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 148,
      weight: 800,
      lineHeight: 1.02,
      color: { token: 'text' },
    },
    title: { font: 'heading', size: 76, weight: 800, lineHeight: 1.1, color: { token: 'text' } },
    heading: { font: 'heading', size: 46, weight: 700, lineHeight: 1.2, color: { token: 'text' } },
    body: { font: 'body', size: 30, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 32,
  shadow: { x: 0, y: 20, blur: 50, color: { value: '#3c1e0a', alpha: 0.12 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    { fill: { kind: 'solid', color: { token: 'surface' } } },
    { fill: { kind: 'solid', color: { token: 'primary' } } },
    { fill: { kind: 'solid', color: { token: 'secondary' } } },
  ],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

/** The soft shadow of the theme, in a token so that a card follows the theme's text colour. */
const SHADOW: Shadow = { x: 0, y: 20, blur: 50, color: token('text', 0.12) };

/** A white rounded card. */
const card = (id: string, frame: Frame) =>
  rect(id, frame, solid(token('surface')), { effects: { radius: 32, shadow: SHADOW } });

/** The white sheet that text sits on where the slide itself is a field of colour. */
const sheet = (id: string, frame: Frame) =>
  rect(id, frame, solid(token('surface')), { effects: { radius: 48 } });

/** A short bar of colour on the upper edge of a card. */
const tab = (id: string, frame: Frame, color: ColorToken = 'primary') =>
  rect(id, frame, solid(token(color)), { effects: { radius: 3 } });

/** The mark of the template: a winding trail with its destination. A deck's own logo replaces it. */
const markSvg = (square: string, path: string) =>
  `<svg viewBox="0 0 48 48"><rect width="48" height="48" rx="14" fill="${square}"/><path d="M13 37C22 37 31 34 31 28S17 25 17 19S26 11 33 11" fill="none" stroke="${path}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="35" cy="11" r="4.5" fill="#f2b33d"/></svg>`;

const MARK_COLORS = {
  '#c4451c': token('primary'),
  '#ffffff': token('surface'),
  '#f2b33d': token('accent'),
};

/** The mark on the slide's own background. */
const mark = (id: string, frame: Frame) =>
  drawing(id, frame, markSvg('#c4451c', '#ffffff'), MARK_COLORS, { role: 'logo', name: 'logo' });

/** The mark on a field of colour: a white square, the trail in the field's colour. */
const markOnColor = (id: string, frame: Frame) =>
  drawing(id, frame, markSvg('#ffffff', '#c4451c'), MARK_COLORS, { role: 'logo', name: 'logo' });

/** A map pin: the end of a trail, and the bullet of a list. */
const pin = (id: string, frame: Frame, body: ColorToken, hole: ColorToken) =>
  drawing(
    id,
    frame,
    '<svg viewBox="0 0 24 24"><path fill="#111111" d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle fill="#eeeeee" cx="12" cy="10" r="2.6"/></svg>',
    { '#111111': token(body), '#eeeeee': token(hole) },
  );

/**
 * The trail: the dashed winding path that runs through the template. The path is written in the
 * pixels of its own frame.
 */
const trail = (
  id: string,
  frame: Frame,
  path: string,
  look: { color?: ColorToken; alpha?: number; width?: number; dash?: string } = {},
) =>
  drawing(
    id,
    frame,
    `<svg viewBox="0 0 ${frame.w} ${frame.h}" fill="none"><path d="${path}" stroke="#111111" stroke-width="${look.width ?? 6}" stroke-linecap="round" stroke-dasharray="${look.dash ?? '14 20'}"/></svg>`,
    { '#111111': token(look.color ?? 'primary', look.alpha) },
  );

/** A dotted divider, the trail in small: along the longer side of its frame. */
const dots = (id: string, frame: Frame) =>
  trail(id, frame, frame.w >= frame.h ? `M3 3H${frame.w - 3}` : `M3 3V${frame.h - 3}`, {
    color: 'text',
    alpha: 0.36,
    width: 5,
    dash: '0.1 16',
  });

const QUOTE =
  '<svg viewBox="0 0 66 52"><path fill="#f2b33d" d="M0 52V30C0 12 9 2 26 0v10c-8 2-12 7-12 16h12v26H0Zm40 0V30C40 12 49 2 66 0v10c-8 2-12 7-12 16h12v26H40Z"/></svg>';

/**
 * A small sun-yellow dot, the line over a title, and the title, as every content slide has them.
 * The title has room for two lines, and the content under it starts below the second; where the
 * content is photographs that need the height, or a long table, the title has one line.
 */
function head(
  name: string,
  width = 1728,
  lines = 2,
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  return {
    placeholders: [
      place('p_kicker', 'caption', at(124, 80, 900, 34), 'caption'),
      place('p_title', 'title', at(96, 122, width, 84 * lines), 'title'),
    ],
    decorations: [dot(`d_shvil_${name}_dot`, at(96, 89, 16, 16), solid(token('accent')))],
  };
}

/**
 * The foot of a content slide: the mark at the start, and at the end the deck's name with the
 * slide's number beyond it (SLD-04). The mark stands alone at its side, which leaves a logo of
 * any width room to replace it.
 */
function foot(
  name: string,
  width = 1728,
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  return {
    placeholders: [
      place('p_footer', 'footer', at(96 + width - 900, 956, 828, 34), 'caption', { align: 'end' }),
    ],
    decorations: [
      mark(`d_shvil_${name}_mark`, at(96, 954, 36, 36)),
      pageNumber(`d_shvil_${name}_number`, at(96 + width - 60, 956, 60, 34)),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const cards3 = [96, 688, 1280];
const columns4 = [96, 540, 984, 1428];
const steps5 = [96, 448, 800, 1152, 1504];
const points3 = [306, 514, 722];
const closing3 = [660, 724, 788];

function layouts(): Layout[] {
  return [
    {
      id: 'l_shvil_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        // The line over the title sits in a badge beside the photograph, where the reference
        // deck has its launch date.
        place('p_kicker', 'caption', atEnd(716, 896, 326, 68), 'caption', { vAlign: 'middle' }),
        place('p_title', 'title', at(96, 150, 1084, 453), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 630, 1084, 166), 'heading'),
        place('p_meta', 'caption', at(96, 912, 560, 68), 'caption'),
        place('p_image', 'image', atEnd(0, 0, 640, 1080)),
      ],
      decorations: [
        dot('d_shvil_hero_sun', atEnd(530, 40, 220, 220), solid(token('accent'))),
        trail(
          'd_shvil_hero_trail',
          at(96, 790, 680, 150),
          'M676 40C580 0 520 86 412 66S270 4 190 60S80 132 6 136',
        ),
        card('d_shvil_hero_badge', atEnd(688, 872, 460, 116)),
        dot('d_shvil_hero_badge_dot', atEnd(1058, 898, 64, 64), solid(token('primary'))),
        pin('d_shvil_hero_badge_pin', atEnd(1074, 914, 32, 32), 'surface', 'primary'),
        mark('d_shvil_hero_mark', at(96, 80, 56, 56)),
      ],
    },
    {
      id: 'l_shvil_section',
      name: 'Section',
      archetype: 'section',
      background: { fill: solid(token('primary')) },
      placeholders: [
        place('p_number', 'number', at(144, 176, 1096, 151), 'display'),
        place('p_kicker', 'caption', at(172, 128, 900, 34), 'caption'),
        place('p_title', 'title', at(144, 336, 1096, 302), 'display'),
        place('p_subtitle', 'subtitle', at(144, 776, 1000, 166), 'heading', { vAlign: 'bottom' }),
      ],
      decorations: [
        dot('d_shvil_section_hill', atEnd(-260, 300, 1100, 1100), solid(token('text', 0.12))),
        trail(
          'd_shvil_section_trail',
          atEnd(0, 0, 616, 1080),
          'M48 1100C48 940 264 960 320 820S144 640 240 520S480 500 512 330',
          { color: 'surface', width: 8, dash: '20 26' },
        ),
        pin('d_shvil_section_pin', atEnd(452, 222, 120, 120), 'accent', 'primary'),
        sheet('d_shvil_section_sheet', at(64, 64, 1240, 952)),
        dot('d_shvil_section_dot', at(144, 137, 16, 16), solid(token('accent'))),
      ],
    },
    {
      id: 'l_shvil_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head('big_number').placeholders,
        place('p_number', 'number', at(96, 300, 800, 200), 'display', { vAlign: 'middle' }),
        place('p_label', 'subtitle', at(960, 322, 852, 56), 'heading'),
        place('p_body', 'body', at(960, 390, 852, 135), 'body'),
        ...cards3.flatMap((start, i) => [
          place(`p_stat${i + 1}`, 'number', at(start + 40, 644, 464, 84), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', at(start + 40, 738, 464, 68), 'caption'),
        ]),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        ...head('big_number').decorations,
        // The trail under the figure: the figure itself can take neither colour nor a larger size.
        trail('d_shvil_big_number_trail', at(96, 506, 460, 12), 'M3 6H457'),
        ...cards3.flatMap((start, i) => [
          card(`d_shvil_big_number_card${i + 1}`, at(start, 610, 544, 244)),
          tab(`d_shvil_big_number_bar${i + 1}`, at(start + 40, 610, 72, 6)),
        ]),
        ...foot('big_number').decorations,
      ],
    },
    {
      id: 'l_shvil_quote',
      name: 'Quote',
      archetype: 'quote',
      background: { fill: solid(token('secondary')) },
      placeholders: [
        place('p_quote', 'quote', at(144, 286, 1272, 420), 'title'),
        place('p_attribution', 'attribution', at(144, 766, 1200, 56), 'heading'),
        place('p_caption', 'caption', at(144, 828, 1200, 34), 'caption'),
        place('p_footer', 'footer', atEnd(504, 956, 700, 34), 'caption', { align: 'end' }),
      ],
      decorations: [
        dot('d_shvil_quote_hill', atEnd(-300, 520, 1000, 1000), solid(token('text', 0.16))),
        sheet('d_shvil_quote_sheet', at(64, 64, 1432, 952)),
        drawing('d_shvil_quote_glyph', at(144, 144, 132, 104), QUOTE, {
          '#f2b33d': token('accent'),
        }),
        tab('d_shvil_quote_bar', at(144, 736, 96, 6), 'accent'),
        mark('d_shvil_quote_mark', at(144, 954, 36, 36)),
      ],
    },
    {
      id: 'l_shvil_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head('text_image', 968).placeholders,
        place('p_image', 'image', atEnd(0, 0, 760, 1080)),
        ...points3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(152, top, 912, 56), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(152, top + 60, 912, 135), 'body'),
        ]),
        place('p_footer', 'footer', atEnd(856, 956, 700, 34), 'caption', { align: 'end' }),
      ],
      decorations: [
        ...head('text_image').decorations,
        ...points3.map((top, i) =>
          pin(`d_shvil_text_image_pin${i + 1}`, at(96, top + 8, 40, 40), 'primary', 'surface'),
        ),
        ...points3
          .slice(1)
          .map((top, i) => dots(`d_shvil_text_image_rule${i + 1}`, at(96, top - 10, 968, 6))),
        mark('d_shvil_text_image_mark', at(96, 954, 36, 36)),
      ],
    },
    {
      id: 'l_shvil_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture runs from edge to edge; the text has a band of its own under it, because
        // nothing of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 660)),
        place('p_kicker', 'caption', at(124, 716, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 758, 1060, 168), 'title'),
        place('p_body', 'body', atEnd(108, 760, 548, 180), 'body'),
      ],
      decorations: [
        dot('d_shvil_full_image_dot', at(96, 725, 16, 16), solid(token('accent'))),
        dots('d_shvil_full_image_rule', atEnd(690, 762, 6, 176)),
      ],
    },
    {
      id: 'l_shvil_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head('cards', 1728, 1).placeholders,
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}_photo`, 'image', at(start + 20, 268, 504, 300)),
          // The name stands on the lines under it, whether it takes one line or two.
          place(`p_card${i + 1}`, 'subtitle', at(start + 36, 578, 472, 112), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_card${i + 1}_body`, 'body', at(start + 36, 734, 472, 101), 'caption'),
          place(`p_card${i + 1}_note`, 'caption', at(start + 36, 694, 472, 34), 'caption'),
        ]),
        place('p_takeaway', 'body', at(96, 884, 1728, 45), 'body'),
        ...foot('cards').placeholders,
      ],
      decorations: [
        ...head('cards').decorations,
        ...cards3.map((start, i) => card(`d_shvil_cards_card${i + 1}`, at(start, 248, 544, 618))),
        ...foot('cards').decorations,
      ],
    },
    {
      id: 'l_shvil_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head('timeline').placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 300, 396, 84), 'title'),
          place(`p_what${i + 1}`, 'subtitle', at(start + 36, 462, 324, 112), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_what${i + 1}_body`, 'body', at(start + 36, 582, 324, 180), 'body'),
        ]),
        place('p_note', 'caption', at(96, 816, 1716, 68), 'caption'),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        ...head('timeline').decorations,
        trail('d_shvil_timeline_trail', at(96, 398, 1728, 12), 'M3 6H1725', { alpha: 0.55 }),
        ...columns4.map((start, i) =>
          dot(`d_shvil_timeline_dot${i + 1}`, at(start, 390, 28, 28), solid(token('surface')), {
            stroke: { color: token(i === 0 ? 'primary' : 'secondary'), width: 6 },
          }),
        ),
        ...columns4.flatMap((start, i) => [
          card(`d_shvil_timeline_card${i + 1}`, at(start, 440, 396, 356)),
          tab(
            `d_shvil_timeline_bar${i + 1}`,
            at(start + 36, 440, 72, 6),
            i === 0 ? 'primary' : 'secondary',
          ),
        ]),
        ...foot('timeline').decorations,
      ],
    },
    {
      id: 'l_shvil_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head('process').placeholders,
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start, 466, 308, 112), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_step${i + 1}_body`, 'caption', at(start, 672, 308, 135), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start, 582, 308, 84), 'title'),
        ]),
        place('p_summary', 'body', at(192, 847, 1560, 45), 'body'),
        ...foot('process').placeholders,
      ],
      decorations: [
        ...head('process').decorations,
        trail(
          'd_shvil_process_trail',
          atEnd(0, 266, 1920, 250),
          'M1940 170C1890 140 1840 90 1772 90C1640 90 1552 140 1420 140S1192 90 1068 90S842 140 716 140S492 90 364 90',
        ),
        ...steps5.flatMap((start, i) => {
          const top = i % 2 === 0 ? 304 : 354;
          return [
            // A ring of the slide's own colour keeps the trail off the circle.
            dot(`d_shvil_process_ring${i + 1}`, at(start, top, 104, 104), solid(token('bg'))),
            dot(
              `d_shvil_process_circle${i + 1}`,
              at(start + 8, top + 8, 88, 88),
              solid(token(i === steps5.length - 1 ? 'secondary' : 'primary')),
            ),
            label(
              `d_shvil_process_n${i + 1}`,
              at(start + 8, top + 8, 88, 88),
              `${i + 1}`,
              'heading',
              { color: token('surface'), weight: 800, align: 'center', vAlign: 'middle' },
            ),
          ];
        }),
        card('d_shvil_process_card', at(96, 826, 1728, 88)),
        pin('d_shvil_process_pin', at(132, 850, 40, 40), 'primary', 'surface'),
        ...foot('process').decorations,
      ],
    },
    {
      id: 'l_shvil_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head('comparison').placeholders,
        place('p_before_tag', 'caption', at(144, 376, 744, 34), 'caption'),
        place('p_before', 'subtitle', at(144, 412, 744, 112), 'heading', { vAlign: 'bottom' }),
        place('p_before_body', 'body', at(144, 568, 744, 272), 'body'),
        place('p_after_tag', 'caption', atEnd(144, 376, 744, 34), 'caption'),
        place('p_after', 'subtitle', atEnd(144, 412, 744, 112), 'heading', { vAlign: 'bottom' }),
        place('p_after_body', 'body', atEnd(144, 568, 744, 272), 'body'),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        ...head('comparison').decorations,
        rect('d_shvil_comparison_before', at(96, 340, 840, 530), solid(token('surface')), {
          stroke: { color: token('text', 0.1), width: 2 },
          effects: { radius: 32 },
        }),
        // The side that wins stands taller, in a frame of the partner colour, with a pin on it.
        rect('d_shvil_comparison_after', atEnd(96, 310, 840, 592), solid(token('surface')), {
          stroke: { color: token('secondary'), width: 12 },
          effects: { radius: 32, shadow: SHADOW },
        }),
        dot('d_shvil_comparison_badge', atEnd(56, 270, 88, 88), solid(token('accent'))),
        pin('d_shvil_comparison_pin', atEnd(76, 290, 48, 48), 'primary', 'surface'),
        dots('d_shvil_comparison_rule1', at(144, 542, 744, 6)),
        dots('d_shvil_comparison_rule2', atEnd(144, 542, 744, 6)),
        ...foot('comparison').decorations,
      ],
    },
    {
      id: 'l_shvil_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head('chart').placeholders,
        place('p_chart', 'chart', atEnd(128, 330, 1104, 542)),
        place('p_stat1', 'number', at(96, 306, 504, 84), 'title'),
        place('p_stat1_body', 'body', at(96, 396, 504, 135), 'body'),
        place('p_stat2', 'number', at(96, 572, 504, 84), 'title'),
        place('p_stat2_body', 'body', at(96, 662, 504, 135), 'body'),
        place('p_source', 'caption', at(96, 820, 504, 68), 'caption'),
        ...foot('chart').placeholders,
      ],
      decorations: [
        ...head('chart').decorations,
        card('d_shvil_chart_card', atEnd(96, 302, 1168, 598)),
        dots('d_shvil_chart_rule', at(96, 548, 504, 6)),
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_shvil_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head('table', 1728, 1).placeholders,
        place('p_table', 'table', at(96, 246, 1728, 630)),
        place('p_note', 'caption', at(96, 904, 1716, 34), 'caption'),
        ...foot('table').placeholders,
      ],
      decorations: [
        ...head('table').decorations,
        card('d_shvil_table_card', at(64, 228, 1792, 664)),
        ...foot('table').decorations,
      ],
    },
    {
      id: 'l_shvil_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head('team', 1728, 1).placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start + 20, 270, 356, 330)),
          place(`p_person${i + 1}`, 'subtitle', at(start + 24, 606, 348, 112), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_person${i + 1}_role`, 'caption', at(start + 24, 722, 348, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start + 24, 762, 348, 101), 'caption'),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: [
        ...head('team').decorations,
        ...columns4.map((start, i) => card(`d_shvil_team_card${i + 1}`, at(start, 250, 396, 640))),
        ...foot('team').decorations,
      ],
    },
    {
      id: 'l_shvil_closing',
      name: 'Closing',
      archetype: 'closing',
      background: { fill: solid(token('primary')) },
      placeholders: [
        place('p_kicker', 'caption', atEnd(144, 128, 1052, 34), 'caption'),
        place('p_title', 'title', atEnd(144, 176, 1080, 453), 'display', { vAlign: 'middle' }),
        ...closing3.map((top, i) =>
          place(`p_step${i + 1}`, 'body', atEnd(144, top, 1028, 45), 'body'),
        ),
        place('p_contact', 'caption', atEnd(144, 892, 1080, 68), 'caption'),
      ],
      decorations: [
        dot('d_shvil_closing_hill', at(-320, 640, 1100, 1100), solid(token('text', 0.12))),
        trail(
          'd_shvil_closing_trail',
          at(0, 0, 616, 1080),
          'M568 1100C568 940 352 960 296 820S472 640 376 520S136 500 104 330',
          { color: 'surface', width: 8, dash: '20 26' },
        ),
        pin('d_shvil_closing_pin', at(452, 222, 120, 120), 'accent', 'primary'),
        markOnColor('d_shvil_closing_mark', at(96, 80, 56, 56)),
        sheet('d_shvil_closing_sheet', atEnd(64, 64, 1240, 952)),
        dot('d_shvil_closing_dot', atEnd(1208, 137, 16, 16), solid(token('accent'))),
        ...closing3.map((top, i) =>
          pin(`d_shvil_closing_pin${i + 1}`, atEnd(1188, top + 4, 36, 36), 'primary', 'surface'),
        ),
      ],
    },
  ];
}

/**
 * The layouts the mirror does not get right. One: the quote mark opens a quote in both
 * directions, so in the mirrored layout it changes sides and keeps its own shape.
 */
function flipped(all: readonly Layout[]): Layout[] {
  return all
    .filter((layout) => layout.id === 'l_shvil_quote')
    .map((layout) => {
      const mirrored = mirrorLayout(layout);
      return {
        ...mirrored,
        decorations: mirrored.decorations.map((decoration) =>
          decoration.id === 'd_shvil_quote_glyph' ? { ...decoration, flipH: false } : decoration,
        ),
      };
    });
}

// ---------------------------------------------------------------------------------------------
// The sample: the reference deck, slide by slide, on the layouts

const FOOTER = text('Shvil · קמפיין אביב 2027');

/** A list with air between its lines, for the two sides of the comparison. */
const list = (...lines: string[]): RichText => ({
  paragraphs: lines.map((line) =>
    para(line, { list: { kind: 'bullet', level: 0 }, spaceAfter: 14 }),
  ),
});

const WEEKS = [
  '14.3',
  '21.3',
  '28.3',
  '4.4',
  '11.4',
  '18.4',
  '25.4',
  '2.5',
  '9.5',
  '16.5',
  '23.5',
  '30.5',
];
const INSTALLS_2026 = [7, 8, 9, 10, 11, 14, 12, 10, 9, 8, 7, 6];
const INSTALLS_2027 = [11, 15, 18, 20, 21, 25, 23, 19, 16, 13, 11, 8];

const AUDIENCE_DIAGRAM =
  'A diagram of the audience mix under the campaign line: one bar in three parts, families 46%, weekend hikers 34%, seasoned trekkers 20%';

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_shvil_hero',
    name: 'פתיחה',
    content: {
      caption: [text('ההשקה: 14 במרץ 2027'), text('צוות השיווק · מצגת להנהלה · ינואר 2027')],
      title: text('צאו', 'לשביל'),
      subtitle: text('קמפיין ההשקה של Shvil Plus'),
      image: { assetId: pictures.shvilRidge.id },
    },
  },
  {
    layout: 'l_shvil_section',
    name: 'הרעיון',
    content: {
      number: text('01'),
      caption: text('01 הרעיון · 02 המוצר · 03 התוכנית'),
      title: text('הרעיון'),
      subtitle: text('למה אנשים שאוהבים לטייל נשארים בבית, ומה Shvil Plus משנה.'),
    },
  },
  {
    layout: 'l_shvil_big_number',
    name: 'נקודת הפתיחה',
    content: {
      caption: [
        text('נקודת הפתיחה'),
        text('הורדות מאז ההשקה ב-2022'),
        text('דירוג ממוצע בחנויות, מתוך 5'),
        text('מסלולים מסומנים ומעודכנים'),
      ],
      title: text('כבר מזמן לא אפליקציית נישה'),
      number: [text('412K'), text('1.9M'), text('4.8'), text('3,200')],
      subtitle: text('מטיילים פעילים בחודש'),
      body: text(
        'פי 2.3 מאביב 2025, וכמעט בלי מדיה בתשלום. הקהל כבר כאן. עכשיו צריך לתת לו סיבה טובה לשלם.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_shvil_text_image',
    name: 'התובנה',
    content: {
      caption: text('התובנה'),
      title: text('מתכננים טיול אחד', 'בארבע אפליקציות'),
      image: { assetId: pictures.shvilBoots.id },
      subtitle: [
        text('4.2 אפליקציות לטיול אחד'),
        text('25 דקות של תכנון'),
        text('31% ויתרו ונשארו בבית'),
      ],
      body: [
        text('מפה, מזג אוויר, קבוצת המלצות וניווט לחניה.'),
        text('לפני שנועלים נעליים, לטיול של חצי יום.'),
        text('כמעט אחד מכל שלושה, כי התכנון הסתבך.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_shvil_full_image',
    name: 'קו הקמפיין',
    content: {
      image: { assetId: pictures.shvilSpring.id },
      caption: text('קו הקמפיין'),
      title: text('האביב קצר.', 'צאו לשביל.'),
      body: text(
        'שתי מילים שעובדות בכל מקום: על שלט חוצות, ב-push של שישי בבוקר ובסרטון של שש שניות.',
      ),
    },
  },
  {
    layout: 'l_shvil_cards',
    name: 'מסלולי הקמפיין',
    content: {
      caption: [
        text('מסלולי הקמפיין'),
        text('למשפחות · 4 ק״מ · קל · שעתיים'),
        text('לסופ״ש · 6.5 ק״מ · בינוני · 3 שעות'),
        text('למיטיבי לכת · 9 ק״מ · מאתגר · 5 שעות'),
      ],
      title: text('שלושה מסלולים, שלושה קהלים'),
      image: [
        { assetId: pictures.shvilTrail2.id },
        { assetId: pictures.shvilTrail1.id },
        { assetId: pictures.shvilTrail3.id },
      ],
      subtitle: [text('נחל השרכים'), text('קניון הארגמן'), text('שביל המצוק')],
      body: [
        text('אבני דריכה ומים זורמים כל השנה'),
        text('קירות אבן אדומה, וצל גם בצהריים'),
        text('הים מצד אחד, הפריחה מהצד השני'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_shvil_comparison',
    name: 'חינם מול Plus',
    content: {
      caption: [text('המוצר'), text('Shvil'), text('Shvil Plus')],
      title: text('מה Shvil Plus מוסיף על החינם'),
      subtitle: [text('חינם: מה שיש היום, ויישאר'), text('₪19.90 לחודש, או ₪149 לשנה')],
      body: [
        list(
          'מפות: רק כשיש קליטה',
          'ניווט: המיקום שלכם על המפה',
          'תכנון: מסלול שמור אחד',
          'תנאי שטח: תחזית כללית לאזור',
        ),
        list(
          'מפות offline לכל הארץ',
          'ניווט קולי והתראה בסטייה מהשביל',
          'מסלולים ללא הגבלה, גם לכמה ימים',
          'מזג אוויר לפי קטע, ועומס בשביל',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_shvil_process',
    name: 'מסע המשתמש',
    content: {
      caption: [
        text('מסע המשתמש'),
        text('נחשפים. סרטון קצר ממסלול אמיתי, או שלט בדרך אל הטיול.'),
        text('התקנות. דף חנות אחד ומסר אחד: פחות לתכנן, יותר ללכת.'),
        text('יוצאים לשביל בתוך 14 יום. האפליקציה מציעה מסלול קרוב לבית.'),
        text('חוזרים לטיול שני בתוך חודש. כאן נפתח חודש הניסיון של Plus.'),
        text('מנויי Plus, חדשים וותיקים יחד, רובם בתוכנית השנתית.'),
      ],
      title: text('מהסרטון הראשון ועד המנוי'),
      subtitle: [text('גילוי'), text('הורדה'), text('טיול ראשון'), text('הרגל'), text('מנוי')],
      number: [text('2.4M'), text('200K'), text('62%'), text('45%'), text('30K')],
      body: text('היעד לסוף יולי: 30K מנויי Plus, בעלות של ₪40 למנוי.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_shvil_text_image',
    name: 'מסגרת המסרים',
    content: {
      caption: text('מסגרת המסרים'),
      title: text('קו אחד, שלושה קהלים'),
      image: { imagePrompt: AUDIENCE_DIAGRAM },
      subtitle: [
        text('משפחות עם ילדים · 46%'),
        text('מטיילי סופ״ש · 34%'),
        text('מיטיבי לכת · 20%'),
      ],
      body: [
        text(
          'טיול שכולם חוזרים ממנו מרוצים: בוחרים לפי גיל, צל ומים. ההוכחה: 71% ממשפחות הבטא יצאו שוב בתוך חודש.',
        ),
        text(
          'פחות לתכנן, יותר ללכת: מסלול מלא בשלוש דקות. ההוכחה: זמן התכנון בבטא ירד מ-25 דקות ל-3.',
        ),
        text(
          'גם כשאין קליטה, יש שביל: מפות מלאות וניווט קולי. ההוכחה: 9 מכל 10 בוחני בטא סטו פחות מהמסלול.',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_shvil_chart',
    name: 'היעד',
    content: {
      caption: [text('היעד'), text('אביב 2026: נתוני אמת. אביב 2027: תחזית צוות Growth.')],
      title: text('200 אלף התקנות ב-12 שבועות'),
      number: [text('200K'), text('+80%')],
      body: [
        text('התקנות חדשות עד 5 ביוני, מתקציב מדיה של ₪1.2M.'),
        text('מול אביב 2026. בשבוע פסח היעד הוא 25K.'),
      ],
      footer: FOOTER,
    },
    chart: {
      chartType: 'line',
      title: 'התקנות בשבוע, באלפים',
      data: {
        categories: WEEKS,
        series: [
          { name: 'אביב 2026', values: INSTALLS_2026 },
          { name: 'יעד אביב 2027', values: INSTALLS_2027 },
        ],
      },
    },
  },
  {
    layout: 'l_shvil_table',
    name: 'תוכנית המדיה',
    content: {
      caption: [
        text('תוכנית המדיה'),
        text('סך הכול ₪1.2M. אחרי ההשקה מזיזים תקציב בין ערוצים פעם בשבוע, ורק לפי ה-CPI.'),
      ],
      title: text('התוכנית, ערוץ אחר ערוץ'),
      footer: FOOTER,
    },
    table: {
      cols: [340, 590, 200, 340, 258],
      rowHeight: 78,
      rows: [
        ['ערוץ', 'מטרה', 'תקציב', 'KPI', 'מי מוביל'],
        ['Paid Social', 'התקנות, ו-retargeting למי שלא יצא', '₪380K', 'CPI עד ₪5.50', 'אורי'],
        ['וידאו אונליין', 'מודעות לקו "צאו לשביל"', '₪240K', 'VTR מעל 35%', 'דפנה'],
        ['משפיענים ו-UGC', 'אמינות: מטיילים אמיתיים בשטח', '₪180K', '400 סרטוני UGC', 'מיכל'],
        ['חיפוש ו-ASO', 'לתפוס את הביקוש שלפני פסח', '₪150K', 'CTR מעל 6%', 'אורי'],
        ['שילוט חוצות', 'נוכחות בצירי היציאה לטיולים', '₪140K', 'Reach של 1.1M', 'דפנה'],
        ['פודקאסטים ורדיו', 'להסביר את Plus בדרך לטיול', '₪70K', '12K מימושי קופון', 'דפנה'],
        ['CRM ו-Push', 'להעביר משתמשי חינם לניסיון ב-Plus', '₪40K', '6% המרה לניסיון', 'איתי'],
      ],
    },
  },
  {
    layout: 'l_shvil_timeline',
    name: 'לוח הזמנים',
    content: {
      caption: [
        text('לוח הזמנים'),
        text(
          'היעדים: Reach של 1.1M בטיזר, 64K התקנות בהשקה, 168K עד אמצע מאי, 30K מנויי Plus עד סוף יולי.',
        ),
      ],
      title: text('ארבעה שלבים, מפברואר עד יולי'),
      number: [text('21.2'), text('14.3'), text('11.4'), text('16.5')],
      subtitle: [text('טיזר'), text('השקה'), text('שיא האביב'), text('קיץ')],
      body: [
        text('שלטי חוצות וסרטוני 6 שניות בלי לוגו. רק שאלה אחת: לאן יוצאים באביב?'),
        text('Shvil Plus עולה לחנויות עם חודש ניסיון. כל הערוצים פועלים יחד.'),
        text('שבוע פסח הוא שיא העונה: retargeting, UGC ומסלולי משפחות.'),
        text('עוברים למסלולי מים וזריחה. ה-CRM מוביל, והמדיה יורדת ל-20%.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_shvil_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'פעם תכננתי טיול בארבע אפליקציות ושתי קבוצות. היום אני פותחת את Shvil Plus, ואחרי שלוש דקות אנחנו כבר בדרך.',
      ),
      attribution: text('יעל מזרחי'),
      caption: text('אמא לשלושה מכרמיאל · בוחנת בטא של Shvil Plus מאז נובמבר 2026'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_shvil_team',
    name: 'הצוות',
    content: {
      caption: [
        text('הצוות'),
        text('VP Marketing'),
        text('Head of Growth'),
        text('Brand & Creative'),
        text('CRM & Lifecycle'),
      ],
      title: text('מי מוציא את הקמפיין לדרך'),
      image: [
        { assetId: pictures.shvilTeam1.id },
        { assetId: pictures.shvilTeam2.id },
        { assetId: pictures.shvilTeam3.id },
        { assetId: pictures.shvilTeam4.id },
      ],
      subtitle: [text('מיכל אלון'), text('אורי בן דוד'), text('דפנה שחר'), text('איתי רוזן')],
      body: [
        text('מובילה את הקמפיין', 'ואת תקציב המדיה.'),
        text('Paid Social, חיפוש ומדידה.', 'אחראי על ה-CAC.'),
        text('הקו, הקריאייטיב,', 'וכל מה שרואים ושומעים.'),
        text('מהתקנה למנוי:', 'onboarding, push ואימייל.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_shvil_closing',
    name: 'סיום',
    content: {
      caption: [
        text('שלוש החלטות עד סוף פברואר, והשביל פתוח'),
        text('מיכל אלון, VP Marketing · michal@shvil.example'),
      ],
      title: text('יוצאים לדרך', 'ב-14 במרץ'),
      body: [
        text('31 בינואר: ההנהלה מאשרת את תקציב המדיה, ₪1.2M'),
        text('15 בפברואר: נועלים את הקריאייטיב ואת תוכנית המדיה'),
        text('21 בפברואר: הטיזר עולה לאוויר'),
      ],
    },
  },
];

const FOOTER_EN = text('Shvil · Spring 2027 campaign');

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_shvil_hero',
    name: 'Opening',
    content: {
      caption: [
        text('Launch: March 14, 2027'),
        text('Marketing team · For management · January 2027'),
      ],
      title: text('Hit', 'the trail'),
      subtitle: text('The launch campaign of Shvil Plus'),
      image: { assetId: pictures.shvilRidge.id },
    },
  },
  {
    layout: 'l_shvil_section',
    name: 'The idea',
    content: {
      number: text('01'),
      caption: text('01 The idea · 02 The product · 03 The plan'),
      title: text('The idea'),
      subtitle: text('Why people who love hiking stay home, and what Shvil Plus changes.'),
    },
  },
  {
    layout: 'l_shvil_big_number',
    name: 'Where we start',
    content: {
      caption: [
        text('Where we start'),
        text('downloads since the launch in 2022'),
        text('average store rating, out of 5'),
        text('trails marked and kept up to date'),
      ],
      title: text('No longer a niche app'),
      number: [text('412K'), text('1.9M'), text('4.8'), text('3,200')],
      subtitle: text('active hikers a month'),
      body: text(
        '2.3 times spring 2025, with almost no paid media. The audience is here. Now it needs a good reason to pay.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvil_text_image',
    name: 'The insight',
    content: {
      caption: text('The insight'),
      title: text('One hike, planned', 'across four apps'),
      image: { assetId: pictures.shvilBoots.id },
      subtitle: [
        text('4.2 apps for one hike'),
        text('25 minutes of planning'),
        text('31% gave up and stayed home'),
      ],
      body: [
        text('A map, the weather, a tips group and navigation to the car park.'),
        text('Before the boots go on, for a half-day hike.'),
        text('Almost one in three, because the planning got out of hand.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvil_full_image',
    name: 'The campaign line',
    content: {
      image: { assetId: pictures.shvilSpring.id },
      caption: text('The campaign line'),
      title: text('Spring is short.', 'Hit the trail.'),
      body: text(
        'Three words that work everywhere: on a billboard, in a Friday-morning push and in a six-second video.',
      ),
    },
  },
  {
    layout: 'l_shvil_cards',
    name: 'The trails of the campaign',
    content: {
      caption: [
        text('The trails of the campaign'),
        text('Families · 4 km · easy · 2 hours'),
        text('Weekend · 6.5 km · moderate · 3 hours'),
        text('Trekkers · 9 km · hard · 5 hours'),
      ],
      title: text('Three trails, three audiences'),
      image: [
        { assetId: pictures.shvilTrail2.id },
        { assetId: pictures.shvilTrail1.id },
        { assetId: pictures.shvilTrail3.id },
      ],
      subtitle: [text('Fern Creek'), text('Crimson Canyon'), text('The Cliff Path')],
      body: [
        text('Stepping stones, and water that runs all year'),
        text('Red rock walls, and shade even at noon'),
        text('The sea on one side, the bloom on the other'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvil_comparison',
    name: 'Free and Plus',
    content: {
      caption: [text('The product'), text('Shvil'), text('Shvil Plus')],
      title: text('What Shvil Plus adds to free'),
      subtitle: [text('Free, today and from now on'), text('₪19.90 a month, or ₪149 a year')],
      body: [
        list(
          'Maps: only with reception',
          'Navigation: your position on the map',
          'Planning: one saved trail',
          'Conditions: a general forecast for the area',
        ),
        list(
          'Offline maps of the whole country',
          'Voice navigation, and an alert off the trail',
          'Unlimited trails, multi-day ones too',
          'Weather by section, and how busy the trail is',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvil_process',
    name: 'The journey of a user',
    content: {
      caption: [
        text('The journey of a user'),
        text('reached by a short trail video, or a billboard on the way out.'),
        text('installs. One store page, one message: plan less, walk more.'),
        text('hit the trail within 14 days. Onboarding suggests one nearby.'),
        text('come back within a month. Here the Plus trial month opens.'),
        text('Plus subscribers, new and existing, most on the yearly plan.'),
      ],
      title: text('From the first video to a subscription'),
      subtitle: [
        text('Discovery'),
        text('Install'),
        text('First hike'),
        text('Habit'),
        text('Subscriber'),
      ],
      number: [text('2.4M'), text('200K'), text('62%'), text('45%'), text('30K')],
      body: text('The goal for the end of July: 30K Plus subscribers, at ₪40 a subscriber.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvil_text_image',
    name: 'The messaging framework',
    content: {
      caption: text('The messaging framework'),
      title: text('One line, three audiences'),
      image: { imagePrompt: AUDIENCE_DIAGRAM },
      subtitle: [
        text('Families with children · 46%'),
        text('Weekend hikers · 34%'),
        text('Seasoned trekkers · 20%'),
      ],
      body: [
        text(
          'Everyone comes back happy: choose by age, shade and water. The proof: 71% of beta families went out again.',
        ),
        text(
          'Plan less, walk more: a full trail in three minutes. The proof: planning time fell from 25 minutes to 3.',
        ),
        text(
          'No reception, still a trail: full maps and voice navigation. The proof: 9 in 10 testers strayed less.',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvil_chart',
    name: 'The goal',
    content: {
      caption: [
        text('The goal'),
        text('Spring 2026: actual figures. Spring 2027: the forecast of the Growth team.'),
      ],
      title: text('200 thousand installs in 12 weeks'),
      number: [text('200K'), text('+80%')],
      body: [
        text('new installs by June 5, on a media budget of ₪1.2M.'),
        text('against spring 2026. Passover week goal: 25K.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'line',
      title: 'Installs a week, in thousands',
      data: {
        categories: WEEKS,
        series: [
          { name: 'Spring 2026', values: INSTALLS_2026 },
          { name: 'Spring 2027 goal', values: INSTALLS_2027 },
        ],
      },
    },
  },
  {
    layout: 'l_shvil_table',
    name: 'The media plan',
    content: {
      caption: [
        text('The media plan'),
        text(
          '₪1.2M in all. After the launch, budget moves between channels once a week, and only by CPI.',
        ),
      ],
      title: text('The plan, channel by channel'),
      footer: FOOTER_EN,
    },
    table: {
      cols: [340, 590, 200, 340, 258],
      rowHeight: 78,
      rows: [
        ['Channel', 'Goal', 'Budget', 'KPI', 'Lead'],
        ['Paid social', 'Installs, and retargeting', '₪380K', 'CPI up to ₪5.50', 'Uri'],
        ['Online video', 'Awareness of the campaign line', '₪240K', 'VTR above 35%', 'Dafna'],
        [
          'Influencers, UGC',
          'Credibility: real hikers on trails',
          '₪180K',
          '400 UGC videos',
          'Michal',
        ],
        ['Search and ASO', 'Catch the demand before Passover', '₪150K', 'CTR above 6%', 'Uri'],
        ['Outdoor', 'Presence on the roads out of town', '₪140K', 'Reach of 1.1M', 'Dafna'],
        [
          'Podcasts, radio',
          'Explain Plus on the way to a hike',
          '₪70K',
          '12K coupons used',
          'Dafna',
        ],
        ['CRM and push', 'Move free users to a Plus trial', '₪40K', '6% start a trial', 'Itai'],
      ],
    },
  },
  {
    layout: 'l_shvil_timeline',
    name: 'The schedule',
    content: {
      caption: [
        text('The schedule'),
        text(
          'Goals: 1.1M reach in the teaser, 64K installs at launch, 168K by mid-May, 30K on Plus by the end of July.',
        ),
      ],
      title: text('Four phases, February to July'),
      number: [text('Feb 21'), text('Mar 14'), text('Apr 11'), text('May 16')],
      subtitle: [text('Teaser'), text('Launch'), text('Spring peak'), text('Summer')],
      body: [
        text('Billboards and six-second videos with no logo. Where to this spring?'),
        text('Shvil Plus goes live with a trial month. Every channel runs together.'),
        text('Passover week is the peak: family trails, UGC and retargeting.'),
        text('On to water and sunrise trails. CRM leads; paid media drops to 20%.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvil_quote',
    name: 'Quote',
    content: {
      quote: text(
        'I used to plan a hike across four apps and two group chats. Now I open Shvil Plus, and three minutes later we are on our way.',
      ),
      attribution: text('Yael Mizrahi'),
      caption: text('A mother of three from Karmiel · Shvil Plus beta tester since November 2026'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvil_team',
    name: 'The team',
    content: {
      caption: [
        text('The team'),
        text('VP Marketing'),
        text('Head of Growth'),
        text('Brand & Creative'),
        text('CRM & Lifecycle'),
      ],
      title: text('Who takes the campaign out'),
      image: [
        { assetId: pictures.shvilTeam1.id },
        { assetId: pictures.shvilTeam2.id },
        { assetId: pictures.shvilTeam3.id },
        { assetId: pictures.shvilTeam4.id },
      ],
      subtitle: [
        text('Michal Alon'),
        text('Uri Ben David'),
        text('Dafna Shahar'),
        text('Itai Rosen'),
      ],
      body: [
        text('Leads the campaign and the media budget.'),
        text('Paid social, search and measurement. Owns the CAC.'),
        text('The line, the creative, and all that is seen and heard.'),
        text('From install to subscription: onboarding, push, email.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvil_closing',
    name: 'Closing',
    content: {
      caption: [
        text('Three decisions by the end of February, and the trail is open'),
        text('Michal Alon, VP Marketing · michal@shvil.example'),
      ],
      title: text('We set out', 'on March 14'),
      body: [
        text('January 31: management approves the media budget, ₪1.2M'),
        text('February 15: the creative and the media plan are locked'),
        text('February 21: the teaser goes on air'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const shvilSamples = { he: sampleHe, en: sampleEn };

/**
 * The Shvil template: the theme, fourteen layouts for both directions, and its sample deck. The
 * layouts are drawn right-to-left, and the mirror is right for all but one of them: the
 * backgrounds are plain fields of colour, and a trail, a pin or a dotted rule reads the same from
 * the other side. The quote mark does not, so the quote layout has a twin of its own.
 */
export function shvilTemplate(): Template {
  const template: Template = {
    theme: copyJson(shvilTheme),
    description: 'Marketing: warm, light and rounded, for campaign and brand decks.',
    dir: 'rtl',
    layouts: layouts(),
    assets: assetTable([
      pictures.shvilRidge,
      pictures.shvilBoots,
      pictures.shvilSpring,
      pictures.shvilTrail1,
      pictures.shvilTrail2,
      pictures.shvilTrail3,
      pictures.shvilTeam1,
      pictures.shvilTeam2,
      pictures.shvilTeam3,
      pictures.shvilTeam4,
    ]),
  };
  template.flipped = flipped(template.layouts);
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
