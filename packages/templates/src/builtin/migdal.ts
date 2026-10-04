import type { Element, Fill, Frame, Layout, Theme } from '@slidr/model';
import { copyJson } from '../json';
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
 * Migdal: the corporate template. A white ground, navy for text and structure, one corporate
 * blue and a quiet teal. Structure is the look: a tinted header band on every content slide,
 * bordered cards with a small radius, tinted panels, numbered tiles, and a sober foot. Its motif
 * is the facade of a tower: a regular grid of square cells, a few of them lit.
 *
 * It holds more on a slide than the other templates: the title is 54px and the body 28px.
 */
export const migdalTheme: Theme = {
  id: 'migdal',
  name: 'Migdal',
  colors: {
    bg: '#ffffff',
    surface: '#eef2f8',
    text: '#0d2240',
    muted: '#51627a',
    primary: '#1a56c8',
    secondary: '#0d2a52',
    accent: '#14a098',
    chart: ['#1a56c8', '#0d2a52', '#14a098', '#7ea6ea', '#8a97ab', '#9ad3ce'],
  },
  fonts: {
    heading: { he: 'IBM Plex Sans Hebrew', latin: 'IBM Plex Sans Hebrew' },
    body: { he: 'IBM Plex Sans Hebrew', latin: 'Inter' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 104,
      weight: 700,
      lineHeight: 1.08,
      color: { token: 'text' },
    },
    title: { font: 'heading', size: 54, weight: 600, lineHeight: 1.2, color: { token: 'text' } },
    heading: { font: 'heading', size: 36, weight: 600, lineHeight: 1.25, color: { token: 'text' } },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.45, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 6,
  shadow: { x: 0, y: 8, blur: 24, color: { value: '#0d2240', alpha: 0.1 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    { fill: { kind: 'solid', color: { token: 'surface' } } },
    { fill: { kind: 'solid', color: { token: 'secondary' } } },
    { fill: { kind: 'solid', color: { token: 'primary' } } },
  ],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

const SIDE = 96;
const WIDE = 1728;
/** The header band ends here, and the content of a slide begins at `TOP`. */
const BAND = 216;
const TOP = 256;
const FOOT = 932;

const LINE = token('text', 0.16);
const HAIR = solid(LINE);
const NAVY = solid(token('secondary'));
const BLUE = solid(token('primary'));
const TINT = solid(token('surface'));
const WHITE = solid(token('bg'));
const EDGE = { color: LINE, width: 1 };
const ROUND = { radius: 6 };

/** The literal colours of the drawings, and the tokens they stand for. */
const PAINT = {
  '#0d2a52': token('secondary'),
  '#1a56c8': token('primary'),
  '#14a098': token('accent'),
  '#ffffff': token('bg'),
  '#eef2f8': token('surface'),
  '#0d2240': token('text'),
};

const MARK =
  '<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="6" fill="#0d2a52"/><path fill="#ffffff" d="M9 33V22h7V7h8v15h7v11z"/><path fill="#1a56c8" d="M18 12h4v4h-4z"/></svg>';

/** The mark of the template: a stepped tower on a navy tile. A deck replaces it with its logo. */
const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** Straight quotation marks on a tile: the same mark in both directions, so the mirror is right. */
const QUOTE =
  '<svg viewBox="0 0 88 88"><rect width="88" height="88" rx="8" fill="#0d2a52"/><path fill="#ffffff" d="M22 26h18l-4 36H26zM48 26h18l-4 36H52z"/></svg>';

/** A chevron to the next step, drawn for a right-to-left slide: the mirror turns it. */
const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#1a56c8" stroke-width="3" stroke-linecap="square"><path d="M15 5l-7 7 7 7"/></svg>';

/** The arrow from one side of a comparison to the other, on a tile. Right-to-left as drawn. */
const TOWARDS =
  '<svg viewBox="0 0 56 56"><rect width="56" height="56" rx="6" fill="#0d2a52"/><path fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="square" d="M38 28H19M27 19l-9 9 9 9"/></svg>';

/** A card: white, a thin border, a small radius. */
const card = (id: string, frame: Frame, fill: Fill = WHITE) =>
  rect(id, frame, fill, { stroke: EDGE, effects: ROUND });

/** A tinted panel, without a border. */
const panel = (id: string, frame: Frame) => rect(id, frame, TINT, { effects: ROUND });

/**
 * A card with a tinted strip at its head, `strip` high. The strong one is tinted with the blue
 * all over and bordered in it: the side of a comparison the slide argues for.
 */
function sheet(id: string, frame: Frame, strip: number, strong = false): Element {
  const { w, h } = frame;
  const edge = strong
    ? 'stroke="#1a56c8" stroke-opacity="0.5"'
    : 'stroke="#0d2240" stroke-opacity="0.16"';
  const ground = strong ? 'fill="#1a56c8" fill-opacity="0.06"' : 'fill="#ffffff"';
  const head = strong ? 'fill="#1a56c8" fill-opacity="0.12"' : 'fill="#eef2f8"';
  const markup =
    `<svg viewBox="0 0 ${w} ${h}">` +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="6" ${ground} ${edge}/>` +
    `<path ${head} d="M1 ${strip}V6a5 5 0 0 1 5-5H${w - 6}a5 5 0 0 1 5 5V${strip}z"/>` +
    `<path fill="none" ${edge} d="M1 ${strip + 0.5}H${w - 1}"/></svg>`;
  return drawing(id, frame, markup, PAINT);
}

/** A number on a navy tile, set by the layout itself. Centred, so it holds in the mirror. */
const numeral = (id: string, frame: Frame, n: number): Element[] => [
  rect(`${id}_tile`, frame, NAVY, { effects: { radius: 4 } }),
  label(id, frame, `0${n}`, 'caption', {
    color: token('bg'),
    weight: 600,
    dir: 'auto',
    align: 'center',
    vAlign: 'middle',
  }),
];

/** The blue tab at the start edge of the slide, beside the title: it runs off the slide. */
const tab = (id: string, top: number, height: number) => rect(id, at(0, top, 32, height), BLUE);

// The facade: the motif of the template. A grid of square cells, a letter for each: `.` a dim
// cell, `w` a bright one, `b` blue, `t` teal, `-` only an outline, a space nothing.
const CELL = 64;
const GAP = 20;
const PITCH = CELL + GAP;
const span = (cells: number) => cells * PITCH - GAP;

const LOOKS = {
  dark: {
    '.': 'fill="#ffffff" fill-opacity="0.09"',
    w: 'fill="#ffffff" fill-opacity="0.6"',
    b: 'fill="#1a56c8"',
    t: 'fill="#14a098"',
    '-': 'fill="none" stroke="#ffffff" stroke-opacity="0.14"',
  },
  light: {
    '.': 'fill="#0d2a52" fill-opacity="0.08"',
    w: 'fill="#0d2a52"',
    b: 'fill="#1a56c8"',
    t: 'fill="#14a098"',
    '-': 'fill="none" stroke="#0d2a52" stroke-opacity="0.16"',
  },
} satisfies Record<string, Record<string, string>>;

/** A facade drawn on a dark or a light ground. The frame keeps the proportions of the grid. */
function facade(
  id: string,
  frame: Frame,
  rows: readonly string[],
  ground: keyof typeof LOOKS,
): Element {
  const looks: Record<string, string> = LOOKS[ground];
  const cells = rows.flatMap((row, r) =>
    [...row].map((letter, c) => {
      const look = looks[letter];
      return look
        ? `<rect x="${c * PITCH + 0.5}" y="${r * PITCH + 0.5}" width="${CELL - 1}" height="${CELL - 1}" rx="5" ${look}/>`
        : '';
    }),
  );
  const width = span(Math.max(...rows.map((row) => row.length)));
  const markup = `<svg viewBox="0 0 ${width} ${span(rows.length)}">${cells.join('')}</svg>`;
  return drawing(id, frame, markup, PAINT);
}

/** The tower of the opening slide: six cells wide, nine high, stepped. */
const TOWER = [
  '--.w--',
  '--b.--',
  '--..--',
  '-.t.b-',
  '-b...-',
  '...w.-',
  '.w.b..',
  'b...t.',
  '..b..w',
];
/** A floor of the tower, along the band of a section slide. */
const FLOOR = ['-..-.b..-.w.', '.b..t...b...', '..w...b...t.'];
/** A corner of it, on the closing slide. */
const CORNER = ['-.b.', '.w.t', 'b...'];
/** Columns that rise towards the end side: growth, beside a big number. */
const RISE = ['t----', '.b---', '..---', '..bb-', '....b', '.....'];

/** The line over a title and the title itself, in the header band of every content slide. */
const head = (width = WIDE) => [
  place('p_kicker', 'caption', at(SIDE, 80, Math.min(900, width), 34), 'caption'),
  place('p_title', 'title', at(SIDE, 116, width, 132), 'title'),
];

/**
 * What frames a content slide besides its head: the header band (a tint from edge to edge under
 * a navy strip, with the blue tab at the start edge), and the foot, a hairline with the mark at
 * the start and, at the end, the deck's name with the slide's number beyond it in a chip
 * (SLD-04). The mark stands alone at its side, which leaves a logo of any width room.
 */
function frameOf(
  name: string,
  { width = WIDE, band = true, chip = TINT }: { width?: number; band?: boolean; chip?: Fill } = {},
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  const id = (part: string) => `d_migdal_${name}_${part}`;
  const number = at(SIDE + width - 72, FOOT + 18, 72, 40);
  return {
    placeholders: [
      place('p_footer', 'footer', at(SIDE + width - 992, FOOT + 21, 900, 34), 'caption', {
        align: 'end',
      }),
    ],
    decorations: [
      ...(band
        ? [
            rect(id('band'), atEnd(0, 0, 1920, BAND), TINT),
            rect(id('strip'), atEnd(0, 0, 1920, 10), NAVY),
            rect(id('edge'), atEnd(0, BAND, 1920, 1), HAIR),
            tab(id('tab'), 86, 96),
          ]
        : []),
      rect(id('rule'), at(SIDE, FOOT, width, 1), HAIR),
      mark(id('mark'), at(SIDE, FOOT + 18, 40, 40)),
      rect(id('chip'), number, chip, { effects: { radius: 4 } }),
      pageNumber(id('number'), number, 'caption', { align: 'center', vAlign: 'middle' }),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const cards3 = [96, 688, 1280];
const columns4 = [96, 540, 984, 1428];
const steps5 = [96, 448, 800, 1152, 1504];
const rows3 = [256, 469, 682];
const stats3 = [256, 476, 696];
const kpis2 = [256, 516];

function layouts(): Layout[] {
  return [
    {
      id: 'l_migdal_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        // The line over the title stands beside the mark, as the name of the document.
        place('p_kicker', 'caption', at(176, 91, 800, 34), 'caption'),
        place('p_title', 'title', at(SIDE, 250, 1008, 340), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(SIDE, 632, 1008, 140), 'heading'),
        place('p_meta', 'caption', at(SIDE, FOOT + 21, 1008, 34), 'caption'),
      ],
      decorations: [
        rect('d_migdal_hero_field', atEnd(0, 0, 720, 1080), NAVY),
        facade('d_migdal_hero_tower', atEnd(118, 172, span(6), span(9)), TOWER, 'dark'),
        mark('d_migdal_hero_mark', at(SIDE, 80, 56, 56)),
        tab('d_migdal_hero_tab', 378, 212),
        rect('d_migdal_hero_bar', at(SIDE, 606, 96, 6), BLUE),
        rect('d_migdal_hero_rule', at(SIDE, FOOT, 1008, 1), HAIR),
      ],
    },
    {
      id: 'l_migdal_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        // The number of the section stands on a white tile that straddles the edge of the band.
        place('p_number', 'number', at(SIDE, 280, 240, 240), 'display', {
          align: 'center',
          vAlign: 'middle',
        }),
        place('p_kicker', 'caption', at(376, 444, 900, 34), 'caption'),
        place('p_title', 'title', at(SIDE, 556, 1400, 232), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(SIDE, 816, 1400, 96), 'heading'),
      ],
      decorations: [
        rect('d_migdal_section_band', atEnd(0, 0, 1920, 400), NAVY),
        facade('d_migdal_section_floor', atEnd(SIDE, 84, span(12), span(3)), FLOOR, 'dark'),
        rect('d_migdal_section_tile', at(SIDE, 280, 240, 240), WHITE, {
          stroke: EDGE,
          effects: { radius: 8 },
        }),
        tab('d_migdal_section_tab', 580, 208),
        rect('d_migdal_section_rule', at(SIDE, FOOT, WIDE, 1), HAIR),
        mark('d_migdal_section_mark', at(SIDE, FOOT + 18, 40, 40)),
      ],
    },
    {
      id: 'l_migdal_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head(),
        place('p_number', 'number', at(144, 336, 640, 116), 'display'),
        place('p_label', 'subtitle', at(144, 492, 640, 92), 'heading'),
        place('p_body', 'body', at(144, 606, 640, 250), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', at(1324, top + 36, 470, 68), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', at(1324, top + 110, 470, 68), 'caption'),
        ]),
        ...frameOf('big_number').placeholders,
      ],
      decorations: [
        panel('d_migdal_big_number_panel', at(SIDE, TOP, 1160, 640)),
        rect('d_migdal_big_number_bar', at(144, 468, 96, 6), BLUE),
        facade('d_migdal_big_number_rise', at(808, 334, span(5), span(6)), RISE, 'light'),
        ...stats3.flatMap((top, i) => [
          card(`d_migdal_big_number_card${i + 1}`, at(1288, top, 536, 200)),
          rect(`d_migdal_big_number_tab${i + 1}`, at(1288, top + 40, 6, 60), BLUE),
        ]),
        ...frameOf('big_number').decorations,
      ],
    },
    {
      id: 'l_migdal_quote',
      name: 'Quote',
      archetype: 'quote',
      // The quotation stands on a white sheet, and the sheet on the tint.
      background: { fill: TINT },
      placeholders: [
        place('p_quote', 'quote', at(176, 284, 1568, 352), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(176, 694, 1200, 50), 'heading'),
        place('p_caption', 'caption', at(176, 750, 1568, 68), 'caption'),
        ...frameOf('quote', { band: false, chip: WHITE }).placeholders,
      ],
      decorations: [
        card('d_migdal_quote_sheet', at(SIDE, 96, WIDE, 780)),
        drawing('d_migdal_quote_glyph', at(176, 168, 88, 88), QUOTE, PAINT),
        tab('d_migdal_quote_tab', 308, 304),
        rect('d_migdal_quote_bar', at(176, 664, 96, 6), BLUE),
        ...frameOf('quote', { band: false, chip: WHITE }).decorations,
      ],
    },
    {
      id: 'l_migdal_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head(),
        // The picture is docked under the band, and runs off the slide at the end and below.
        place('p_image', 'image', atEnd(0, BAND, 660, 1080 - BAND)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(176, top + 14, 1020, 50), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(176, top + 64, 1020, 164), 'body'),
        ]),
        ...frameOf('text_image', { width: 1100 }).placeholders,
      ],
      decorations: [
        ...rows3.flatMap((top, i) => [
          ...(i > 0
            ? [rect(`d_migdal_text_image_rule${i}`, at(SIDE, top - 8, 1100, 1), HAIR)]
            : []),
          ...numeral(`d_migdal_text_image_n${i + 1}`, at(SIDE, top + 16, 56, 56), i + 1),
        ]),
        ...frameOf('text_image', { width: 1100 }).decorations,
      ],
    },
    {
      id: 'l_migdal_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture runs from edge to edge; the text has a tinted band of its own under it,
        // because nothing of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 600)),
        place('p_kicker', 'caption', at(SIDE, 700, 900, 34), 'caption'),
        place('p_title', 'title', at(SIDE, 740, 1040, 132), 'title'),
        place('p_body', 'body', atEnd(128, 712, 536, 216), 'body', { vAlign: 'middle' }),
      ],
      decorations: [
        rect('d_migdal_full_image_band', atEnd(0, 600, 1920, 480), TINT),
        rect('d_migdal_full_image_strip', atEnd(0, 600, 1920, 10), NAVY),
        tab('d_migdal_full_image_tab', 708, 152),
        card('d_migdal_full_image_card', atEnd(SIDE, 692, 600, 256)),
      ],
    },
    {
      id: 'l_migdal_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head(),
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}`, 'subtitle', at(start + 32, 359, 480, 92), 'heading', {
            vAlign: 'middle',
          }),
          place(`p_card${i + 1}_body`, 'body', at(start + 32, 490, 480, 206), 'body'),
          place(`p_card${i + 1}_note`, 'caption', at(start + 32, 264, 480, 68), 'caption', {
            vAlign: 'middle',
          }),
        ]),
        place('p_takeaway', 'body', at(136, 768, 1648, 100), 'body', { vAlign: 'middle' }),
        ...frameOf('cards').placeholders,
      ],
      decorations: [
        ...cards3.flatMap((start, i) => [
          sheet(`d_migdal_cards_card${i + 1}`, at(start, TOP, 544, 464), 84),
          rect(`d_migdal_cards_rule${i + 1}`, at(start + 32, 470, 480, 1), HAIR),
        ]),
        panel('d_migdal_cards_takeaway', at(SIDE, 752, WIDE, 132)),
        rect('d_migdal_cards_accent', at(SIDE, 780, 6, 76), BLUE),
        ...frameOf('cards').decorations,
      ],
    },
    {
      id: 'l_migdal_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 258, 396, 68), 'title'),
          place(`p_what${i + 1}`, 'subtitle', at(start + 28, 412, 340, 92), 'heading', {
            vAlign: 'middle',
          }),
          place(`p_what${i + 1}_body`, 'body', at(start + 28, 540, 340, 212), 'body'),
        ]),
        place('p_note', 'caption', at(SIDE, 800, WIDE, 68), 'caption'),
        ...frameOf('timeline').placeholders,
      ],
      decorations: [
        // The axis, with a square where each period begins; under it a panel for each.
        rect('d_migdal_timeline_axis', at(SIDE, 352, WIDE, 4), NAVY),
        ...columns4.flatMap((start, i) => [
          rect(`d_migdal_timeline_node${i + 1}`, at(start, 340, 28, 28), BLUE, {
            effects: { radius: 4 },
          }),
          panel(`d_migdal_timeline_panel${i + 1}`, at(start, 392, 396, 384)),
          rect(`d_migdal_timeline_rule${i + 1}`, at(start + 28, 524, 340, 1), HAIR),
        ]),
        ...frameOf('timeline').decorations,
      ],
    },
    {
      id: 'l_migdal_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start + 24, 352, 272, 92), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_step${i + 1}_body`, 'caption', at(start + 24, 456, 272, 170), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start + 24, 654, 272, 68), 'title'),
        ]),
        place('p_summary', 'body', at(136, 782, 1648, 100), 'heading', { vAlign: 'middle' }),
        ...frameOf('process').placeholders,
      ],
      decorations: [
        ...steps5.flatMap((start, i) => [
          card(`d_migdal_process_card${i + 1}`, at(start, TOP, 320, 484)),
          ...numeral(`d_migdal_process_n${i + 1}`, at(start + 24, 280, 56, 56), i + 1),
          rect(`d_migdal_process_rule${i + 1}`, at(start + 24, 640, 272, 1), HAIR),
        ]),
        ...steps5
          .slice(0, 4)
          .map((start, i) =>
            drawing(`d_migdal_process_arrow${i + 1}`, at(start + 324, 296, 24, 24), CHEVRON, PAINT),
          ),
        panel('d_migdal_process_summary', at(SIDE, 768, WIDE, 128)),
        rect('d_migdal_process_accent', at(SIDE, 794, 6, 76), BLUE),
        ...frameOf('process').decorations,
      ],
    },
    {
      id: 'l_migdal_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head(),
        place('p_before_tag', 'caption', at(136, 264, 760, 68), 'caption', { vAlign: 'middle' }),
        place('p_before', 'subtitle', at(136, 361, 760, 92), 'heading', { vAlign: 'middle' }),
        place('p_before_body', 'body', at(136, 496, 760, 332), 'body'),
        place('p_after_tag', 'caption', atEnd(136, 264, 760, 68), 'caption', {
          vAlign: 'middle',
        }),
        place('p_after', 'subtitle', atEnd(136, 361, 760, 92), 'heading', { vAlign: 'middle' }),
        place('p_after_body', 'body', atEnd(136, 496, 760, 332), 'body'),
        ...frameOf('comparison').placeholders,
      ],
      decorations: [
        // One side is a plain card; the other, the one the slide argues for, is tinted blue.
        sheet('d_migdal_comparison_before', at(SIDE, TOP, 840, 600), 84),
        sheet('d_migdal_comparison_after', atEnd(SIDE, TOP, 840, 600), 84, true),
        rect('d_migdal_comparison_rule1', at(136, 474, 760, 1), HAIR),
        rect('d_migdal_comparison_rule2', atEnd(136, 474, 760, 1), HAIR),
        drawing('d_migdal_comparison_arrow', at(932, 528, 56, 56), TOWARDS, PAINT),
        ...frameOf('comparison').decorations,
      ],
    },
    {
      id: 'l_migdal_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head(),
        place('p_chart', 'chart', at(120, 276, 1112, 600)),
        ...kpis2.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', at(1324, top + 22, 470, 68), 'title'),
          place(`p_stat${i + 1}_body`, 'body', at(1324, top + 94, 470, 124), 'body'),
        ]),
        place('p_source', 'caption', at(1288, 780, 536, 102), 'caption'),
        ...frameOf('chart').placeholders,
      ],
      decorations: [
        card('d_migdal_chart_card', at(SIDE, TOP, 1160, 640)),
        ...kpis2.flatMap((top, i) => [
          panel(`d_migdal_chart_panel${i + 1}`, at(1288, top, 536, 240)),
          rect(`d_migdal_chart_tab${i + 1}`, at(1288, top + 26, 6, 60), BLUE),
        ]),
        ...frameOf('chart').decorations,
      ],
    },
    {
      id: 'l_migdal_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head(),
        place('p_table', 'table', at(SIDE, 240, WIDE, 610)),
        place('p_note', 'caption', at(SIDE, 858, WIDE, 68), 'caption'),
        ...frameOf('table').placeholders,
      ],
      decorations: frameOf('table').decorations,
    },
    {
      id: 'l_migdal_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start, TOP, 396, 344)),
          place(`p_person${i + 1}`, 'subtitle', at(start + 24, 618, 348, 50), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start + 24, 670, 348, 68), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start + 24, 758, 348, 136), 'caption'),
        ]),
        ...frameOf('team').placeholders,
      ],
      decorations: [
        ...columns4.flatMap((start, i) => [
          card(`d_migdal_team_card${i + 1}`, at(start, TOP, 396, 656)),
          rect(`d_migdal_team_bar${i + 1}`, at(start, 600, 396, 6), BLUE),
          rect(`d_migdal_team_rule${i + 1}`, at(start + 24, 746, 348, 1), HAIR),
        ]),
        ...frameOf('team').decorations,
      ],
    },
    {
      id: 'l_migdal_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(SIDE, 104, 900, 34), 'caption'),
        place('p_title', 'title', at(SIDE, 148, 1240, 240), 'display'),
        ...cards3.map((start, i) =>
          place(`p_line${i + 1}`, 'body', at(start + 32, 612, 480, 184), 'heading'),
        ),
        // The contact line stands beside the mark, as a signature.
        place('p_contact', 'caption', at(160, FOOT + 21, 1200, 34), 'caption'),
      ],
      decorations: [
        rect('d_migdal_closing_block', atEnd(0, 0, 520, 420), NAVY),
        facade('d_migdal_closing_corner', atEnd(102, 94, span(4), span(3)), CORNER, 'dark'),
        tab('d_migdal_closing_tab', 162, 208),
        ...cards3.flatMap((start, i) => [
          card(`d_migdal_closing_card${i + 1}`, at(start, 500, 544, 328)),
          ...numeral(`d_migdal_closing_n${i + 1}`, at(start + 32, 532, 56, 56), i + 1),
        ]),
        rect('d_migdal_closing_rule', at(SIDE, FOOT, WIDE, 1), HAIR),
        mark('d_migdal_closing_mark', at(SIDE, FOOT + 18, 40, 40)),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: a quarterly review for the board of an invented infrastructure company

const QUARTERS = ['Q2 2025', 'Q3 2025', 'Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026'];
const WATER = [398, 402, 391, 396, 409, 414];
const ENERGY = [431, 438, 452, 467, 484, 499];
const FIBRE = [142, 147, 152, 156, 162, 167];
const TABLE_COLS = [508, 220, 230, 220, 270, 280];
const TABLE_ROW = 72;

const FOOTER_HE = text('ארבל תשתיות · סקירה לדירקטוריון · Q3 2026');
const FOOTER_EN = text('Arbel Infrastructure · Board review · Q3 2026');

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_migdal_hero',
    name: 'פתיחה',
    content: {
      caption: [text('BOARD REVIEW'), text('מוצג לדירקטוריון · 18 בנובמבר 2026')],
      title: text('סקירה', 'רבעונית'),
      subtitle: text('ארבל תשתיות · רבעון שלישי 2026'),
    },
  },
  {
    layout: 'l_migdal_section',
    name: 'תמונת מצב',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('תמונת מצב'),
      subtitle: text('התוצאות, מדדי השירות וההשקעות של הרבעון.'),
    },
  },
  {
    layout: 'l_migdal_big_number',
    name: 'הכנסות',
    content: {
      caption: [
        text('REVENUE'),
        text('לעומת Q3 2025'),
        text('שיעור EBITDA מתואם'),
        text('מיליון ₪, תזרים מזומנים חופשי'),
      ],
      title: text('ההכנסות חצו מיליארד ₪'),
      number: [text('1.08'), text('+9.4%'), text('34.2%'), text('212')],
      subtitle: text('מיליארד ₪, הכנסות הרבעון השלישי'),
      body: text(
        'צמיחה של 9.4% לעומת הרבעון המקביל. מגזר האנרגיה גדל ב-14%, ומגזר המים שמר על יציבות למרות קיץ שחון.',
      ),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_migdal_cards',
    name: 'מדדי שירות',
    content: {
      caption: [
        text('SERVICE METRICS'),
        text('AVAILABILITY · זמינות הרשת'),
        text('RESPONSE · זמן תגובה לתקלה'),
        text('NPS · שביעות רצון לקוחות'),
      ],
      title: text('שלושה מדדי שירות, שלושתם ביעד'),
      subtitle: [text('99.97%'), text('38 דקות'), text('+46')],
      body: [
        text('היעד השנתי: 99.95%. אף הפסקת אספקה בלתי מתוכננת לא נמשכה יותר משעה.'),
        text('ירידה מ-52 דקות אשתקד, בזכות מוקד הבקרה המאוחד והצוותים האזוריים.'),
        text('עלייה של 7 נקודות בשנה, והציון הגבוה ביותר מאז תחילת המדידה ב-2021.'),
        text('מה שמחבר בין השלושה: 61% מהתקלות מזוהות היום בחיישנים, לפני שהלקוח מרגיש בהן.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_migdal_chart',
    name: 'הכנסות לפי מגזר',
    content: {
      caption: [text('REVENUE BY SEGMENT'), text('מקור: דוחות כספיים לא מבוקרים, במיליוני ₪.')],
      title: text('האנרגיה מובילה את הצמיחה'),
      number: [text('+14%'), text('+3%')],
      body: [text('הכנסות מגזר האנרגיה, לעומת Q3 2025.'), text('הכנסות מגזר המים, באותה תקופה.')],
      footer: FOOTER_HE,
    },
    chart: {
      chartType: 'column',
      title: 'הכנסות לפי רבעון, מיליוני ₪',
      data: {
        categories: QUARTERS,
        series: [
          { name: 'אנרגיה', values: ENERGY },
          { name: 'מים', values: WATER },
          { name: 'סיבים', values: FIBRE },
        ],
      },
    },
  },
  {
    layout: 'l_migdal_table',
    name: 'תוצאות לפי מגזר',
    content: {
      caption: [
        text('SEGMENT RESULTS'),
        text('נתונים לא מבוקרים. EBITDA מתואם אינו כולל פחת, הפחתות והוצאות חד-פעמיות.'),
      ],
      title: text('תוצאות הרבעון לפי מגזר'),
      footer: FOOTER_HE,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['מיליוני ₪', 'הכנסות', 'שינוי YoY', 'EBITDA', 'שיעור EBITDA', 'השקעות'],
        ['מים וביוב', '414', '+3.0%', '149', '36.0%', '62'],
        ['אנרגיה: חשמל', '341', '+12.5%', '109', '32.0%', '71'],
        ['אנרגיה: גז טבעי', '158', '+17.9%', '46', '29.1%', '24'],
        ['סיבים ותקשורת', '167', '+13.6%', '71', '42.5%', '38'],
        ['מטה והתאמות', '—', '—', '−6', '—', '5'],
        ['סך הכול Q3 2026', '1,080', '+9.4%', '369', '34.2%', '200'],
        ['סך הכול Q3 2025', '987', '+6.1%', '322', '32.6%', '176'],
      ],
    },
  },
  {
    layout: 'l_migdal_text_image',
    name: 'מוקד הבקרה',
    content: {
      caption: text('OPERATIONS'),
      title: text('מוקד הבקרה המאוחד עלה לאוויר'),
      image: { assetId: pictures.migdalHalf2.id },
      subtitle: [text('שלוש רשתות, חדר אחד'), text('זיהוי לפני תקלה'), text('תגובה ב-38 דקות')],
      body: [
        text(
          'מים, חשמל וסיבים מנוטרים יחד, 24 שעות ביממה, במקום שלושה מוקדים נפרדים. מפעיל אחד רואה את כל הרשת, ותקלה בקו אחד כבר לא מפתיעה את האחרים.',
        ),
        text(
          '14 אלף חיישנים מתריעים על לחץ, עומס וטמפרטורה. 61% מהתקלות מזוהות לפני שהן מורגשות, לעומת 23% לפני שנתיים, ורובן מטופלות בלי הפסקת אספקה.',
        ),
        text(
          'צוות אזורי יוצא לשטח עם אבחון מוכן ורשימת חלקים, ולא מתחיל לחפש את התקלה. זמן התגובה הממוצע ירד מ-52 דקות ל-38 בתוך שנה.',
        ),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_migdal_full_image',
    name: 'בשטח',
    content: {
      image: { assetId: pictures.migdalScene.id },
      caption: text('IN THE FIELD'),
      title: text('1.2 מיליון תושבים,', 'מוקד אחד'),
      body: text(
        'ארבל מפעילה 4,800 ק״מ של קווי מים, חשמל וסיבים ב-38 רשויות בצפון, ומנהלת את כולם ממוקד בקרה אחד.',
      ),
    },
  },
  {
    layout: 'l_migdal_section',
    name: 'מבט קדימה',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('מבט קדימה'),
      subtitle: text('ההחלטות שעל השולחן, והדרך ל-2027.'),
    },
  },
  {
    layout: 'l_migdal_comparison',
    name: 'שתי חלופות',
    content: {
      caption: [text('DECISION'), text('חלופה א׳'), text('חלופה ב׳ · המלצת ההנהלה')],
      title: text('הרחבת רשת הסיבים: שתי חלופות'),
      subtitle: [text('פריסה עצמית מלאה'), text('פריסה משותפת עם שותף')],
      body: [
        bullets(
          'השקעה: 420 מיליון ₪ בשלוש שנים',
          '180 אלף משקי בית עד סוף 2029',
          'שליטה מלאה ברשת ובתמחור',
          'המינוף עולה ל-3.4x EBITDA',
        ),
        bullets(
          'השקעה: 250 מיליון ₪, חלקנו 60%',
          '210 אלף משקי בית עד סוף 2028',
          'שנה מוקדם יותר, בסיכון ביצוע נמוך',
          'המינוף נשאר מתחת ל-3.0x EBITDA',
        ),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_migdal_process',
    name: 'אישור השקעה',
    content: {
      caption: [
        text('GOVERNANCE'),
        text('היחידה מגדירה צורך, היקף ואומדן ראשוני.'),
        text('ניתוח הנדסי, כלכלי ורגולטורי של שלוש חלופות.'),
        text('אישור תקציב ותשואה, עד 50 מיליון ₪.'),
        text('אישור פרויקטים שמעל 50 מיליון ₪.'),
        text('מכרז, התקשרות וצו התחלת עבודה.'),
      ],
      title: text('חמישה שערים לכל פרויקט השקעה'),
      subtitle: [
        text('ייזום'),
        text('היתכנות'),
        text('ועדת השקעות'),
        text('דירקטוריון'),
        text('יציאה לביצוע'),
      ],
      number: [text('10 ימים'), text('30 יום'), text('21 יום'), text('14 יום'), text('30 יום')],
      body: text('בממוצע 75 ימים מייזום ועד אישור, לעומת 110 ב-2024. היעד ל-2027: 60 ימים.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_migdal_timeline',
    name: 'תוכנית 2027',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text('אבני הדרך כפופות לאישור תקציב 2027 בישיבת הדירקטוריון בדצמבר.'),
      ],
      title: text('תוכנית העבודה ל-2027, רבעון אחר רבעון'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [
        text('הסכם השותפות'),
        text('תחנת מיתוג צפונית'),
        text('מונים חכמים לכולם'),
        text('דירוג אשראי AA'),
      ],
      body: [
        text('חתימה על הסכם הפריסה המשותפת, ותחילת העבודות בשלושה יישובים ראשונים.'),
        text('התחנה החדשה מוסיפה 120 מגה-ואט לרשת האזורית ומגבה את קו החוף.'),
        text('סיום ההתקנה ב-310 אלף בתי אב, וסוף לקריאת המונים הידנית.'),
        text('עדכון הדירוג לקראת גיוס אג״ח ירוקות בהיקף של 600 מיליון ₪.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_migdal_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'כשהמים, החשמל והתקשורת מנוהלים מאותו חדר, תקלה אחת כבר לא הופכת לשלוש. את זה התושבים מרגישים.',
      ),
      attribution: text('נועה בן-עמי'),
      caption: text('מהנדסת העיר, עיריית נוף אלון · לקוחת ארבל מאז 2019'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_migdal_team',
    name: 'הנהלה',
    content: {
      caption: [
        text('LEADERSHIP'),
        text('מנכ״ל · CEO'),
        text('סמנכ״לית כספים · CFO'),
        text('סמנכ״ל תפעול · COO'),
        text('סמנכ״לית רגולציה ואסטרטגיה'),
      ],
      title: text('ההנהלה שמציגה היום'),
      image: [
        { assetId: pictures.migdalTeam1.id },
        { assetId: pictures.migdalTeam2.id },
        { assetId: pictures.migdalTeam3.id },
        { assetId: pictures.migdalTeam4.id },
      ],
      subtitle: [text('אילן הראל'), text('תמר וייס'), text('גיא נחום'), text('רות אבידן')],
      body: [
        text('מוביל את ארבל מאז 2018, אחרי 20 שנה בניהול רשתות חשמל.'),
        text('הצטרפה ב-2021 והובילה שני גיוסי אג״ח בהיקף 1.4 מיליארד ₪.'),
        text('אחראי למוקד הבקרה המאוחד ול-1,900 עובדי השטח.'),
        text('מנהלת את הקשר עם הרגולטורים ואת תוכנית 2027.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_migdal_closing',
    name: 'סיום',
    content: {
      caption: [
        text('DECISIONS REQUESTED'),
        text('הישיבה הבאה: 17 בפברואר 2027 · board@arbel.example'),
      ],
      title: text('שלוש החלטות', 'להיום'),
      body: [
        text('לאשר את חלופת הפריסה המשותפת ברשת הסיבים'),
        text('לאשר תקציב השקעות של 860 מיליון ₪ ל-2027'),
        text('להסמיך את ההנהלה לגייס אג״ח ירוקות ב-2027'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_migdal_hero',
    name: 'Cover',
    content: {
      caption: [text('BOARD REVIEW'), text('Presented to the board · 18 November 2026')],
      title: text('Quarterly', 'Review'),
      subtitle: text('Arbel Infrastructure · Third quarter 2026'),
    },
  },
  {
    layout: 'l_migdal_section',
    name: 'At a glance',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('At a Glance'),
      subtitle: text('Results, service metrics and investment for the quarter.'),
    },
  },
  {
    layout: 'l_migdal_big_number',
    name: 'Revenue',
    content: {
      caption: [
        text('REVENUE'),
        text('vs. Q3 2025'),
        text('Adjusted EBITDA margin'),
        text('NIS million, free cash flow'),
      ],
      title: text('Revenue tops ₪1bn'),
      number: [text('1.08'), text('+9.4%'), text('34.2%'), text('212')],
      subtitle: text('NIS billion, Q3 revenue'),
      body: text(
        'Up 9.4% on the same quarter last year. Energy grew 14%, and water held steady through a dry summer.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_migdal_cards',
    name: 'Service metrics',
    content: {
      caption: [
        text('SERVICE METRICS'),
        text('AVAILABILITY · Network uptime'),
        text('RESPONSE · Time to respond'),
        text('NPS · Customer satisfaction'),
      ],
      title: text('Three service metrics, all on target'),
      subtitle: [text('99.97%'), text('38 min'), text('+46')],
      body: [
        text('The annual target is 99.95%. No unplanned outage lasted more than an hour.'),
        text('Down from 52 minutes a year ago, thanks to the unified control centre.'),
        text('Up 7 points in a year, and the highest score since tracking began in 2021.'),
        text(
          'What links the three: sensors now catch 61% of faults before a customer notices them.',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_migdal_chart',
    name: 'Revenue by segment',
    content: {
      caption: [
        text('REVENUE BY SEGMENT'),
        text('Source: unaudited financial statements, NIS millions.'),
      ],
      title: text('Energy is driving the growth'),
      number: [text('+14%'), text('+3%')],
      body: [text('Energy revenue, against Q3 2025.'), text('Water revenue, same period.')],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Revenue by quarter, NIS millions',
      data: {
        categories: QUARTERS,
        series: [
          { name: 'Energy', values: ENERGY },
          { name: 'Water', values: WATER },
          { name: 'Fibre', values: FIBRE },
        ],
      },
    },
  },
  {
    layout: 'l_migdal_table',
    name: 'Segment results',
    content: {
      caption: [
        text('SEGMENT RESULTS'),
        text('Unaudited. Adjusted EBITDA excludes depreciation, amortisation and one-off items.'),
      ],
      title: text('Quarterly results by segment'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['NIS millions', 'Revenue', 'Change YoY', 'EBITDA', 'EBITDA margin', 'Capex'],
        ['Water and sewage', '414', '+3.0%', '149', '36.0%', '62'],
        ['Energy: electricity', '341', '+12.5%', '109', '32.0%', '71'],
        ['Energy: natural gas', '158', '+17.9%', '46', '29.1%', '24'],
        ['Fibre and telecoms', '167', '+13.6%', '71', '42.5%', '38'],
        ['Head office and adjustments', '—', '—', '−6', '—', '5'],
        ['Total Q3 2026', '1,080', '+9.4%', '369', '34.2%', '200'],
        ['Total Q3 2025', '987', '+6.1%', '322', '32.6%', '176'],
      ],
    },
  },
  {
    layout: 'l_migdal_text_image',
    name: 'Control centre',
    content: {
      caption: text('OPERATIONS'),
      title: text('The unified control centre is live'),
      image: { assetId: pictures.migdalHalf2.id },
      subtitle: [
        text('Three networks, one room'),
        text('Seen before it fails'),
        text('On site in 38 minutes'),
      ],
      body: [
        text(
          'Water, power and fibre are monitored together, round the clock, in place of three separate rooms. One operator sees the whole network.',
        ),
        text(
          '14,000 sensors report pressure, load and temperature. 61% of faults are now caught before anyone feels them, up from 23% two years ago.',
        ),
        text(
          'A regional crew leaves with a diagnosis and a parts list, not to look for the fault. Average response fell from 52 minutes to 38 in a year.',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_migdal_full_image',
    name: 'In the field',
    content: {
      image: { assetId: pictures.migdalScene.id },
      caption: text('IN THE FIELD'),
      title: text('1.2 million residents,', 'one control room'),
      body: text(
        'Arbel runs 4,800 km of water, power and fibre lines in 38 northern municipalities, all from one room.',
      ),
    },
  },
  {
    layout: 'l_migdal_section',
    name: 'What is next',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('What’s Next'),
      subtitle: text('The decisions on the table, and the road to 2027.'),
    },
  },
  {
    layout: 'l_migdal_comparison',
    name: 'Two options',
    content: {
      caption: [text('DECISION'), text('Option A'), text('Option B · Recommended')],
      title: text('Expanding the fibre network: two options'),
      subtitle: [text('Build it all ourselves'), text('Build it with a partner')],
      body: [
        bullets(
          'Investment: NIS 420 million over three years',
          '180,000 households by the end of 2029',
          'Full control of the network and pricing',
          'Leverage rises to 3.4x EBITDA',
        ),
        bullets(
          'Investment: NIS 250 million, our share 60%',
          '210,000 households by the end of 2028',
          'A year sooner, with lower delivery risk',
          'Leverage stays below 3.0x EBITDA',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_migdal_process',
    name: 'Approving an investment',
    content: {
      caption: [
        text('GOVERNANCE'),
        text('The unit states the need, the scope and a first estimate.'),
        text('Engineering, financial and regulatory review of three options.'),
        text('Budget and return approved, up to NIS 50 million.'),
        text('Approval of projects above NIS 50 million.'),
        text('Tender, contract and the order to start work.'),
      ],
      title: text('Five gates for every investment project'),
      subtitle: [
        text('Initiation'),
        text('Feasibility'),
        text('Committee'),
        text('The board'),
        text('Go-ahead'),
      ],
      number: [text('10 days'), text('30 days'), text('21 days'), text('14 days'), text('30 days')],
      body: text('75 days on average from start to approval, down from 110 in 2024. Target: 60.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_migdal_timeline',
    name: 'Plan for 2027',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text('Milestones are subject to board approval of the 2027 budget in December.'),
      ],
      title: text('The 2027 work plan, quarter by quarter'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [
        text('Partnership deal'),
        text('Northern substation'),
        text('Smart meters for all'),
        text('AA credit rating'),
      ],
      body: [
        text('The joint roll-out is signed, and work begins in three towns.'),
        text('The new station adds 120 megawatts to the regional grid.'),
        text('Installed in 310,000 homes: the end of manual meter readings.'),
        text('A rating review ahead of a NIS 600 million green bond issue.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_migdal_quote',
    name: 'Quote',
    content: {
      quote: text(
        'When water, power and fibre are run from one room, one fault no longer turns into three. Residents feel that.',
      ),
      attribution: text('Noa Ben-Ami'),
      caption: text('City engineer, Nof Alon municipality · an Arbel customer since 2019'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_migdal_team',
    name: 'Leadership',
    content: {
      caption: [
        text('LEADERSHIP'),
        text('Chief Executive Officer'),
        text('Chief Financial Officer'),
        text('Chief Operating Officer'),
        text('Regulation and Strategy'),
      ],
      title: text('The team presenting today'),
      image: [
        { assetId: pictures.migdalTeam1.id },
        { assetId: pictures.migdalTeam2.id },
        { assetId: pictures.migdalTeam3.id },
        { assetId: pictures.migdalTeam4.id },
      ],
      subtitle: [text('Ilan Harel'), text('Tamar Weiss'), text('Guy Nahum'), text('Ruth Avidan')],
      body: [
        text('Has led Arbel since 2018, after 20 years running power grids.'),
        text('Joined in 2021 and led two bond issues worth NIS 1.4 billion.'),
        text('Runs the unified control centre and 1,900 field staff.'),
        text('Leads the work with regulators and the 2027 plan.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_migdal_closing',
    name: 'Closing',
    content: {
      caption: [
        text('DECISIONS REQUESTED'),
        text('Next meeting: 17 February 2027 · board@arbel.example'),
      ],
      title: text('Three calls', 'to make'),
      body: [
        text('Approve the partner option for the fibre network'),
        text('Approve a capital budget of NIS 860 million for 2027'),
        text('Authorise management to issue green bonds in 2027'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const migdalSamples = { he: sampleHe, en: sampleEn };

/**
 * The Migdal template: the theme, fourteen layouts for both directions, and its sample deck.
 * Nothing is drawn by hand for the other direction: the quotation mark is the same both ways.
 */
export function migdalTemplate(): Template {
  const template: Template = {
    theme: copyJson(migdalTheme),
    description: 'Corporate: white, navy and one blue, with header bands and bordered cards.',
    dir: 'rtl',
    layouts: layouts(),
    flipped: [],
    assets: assetTable([
      pictures.migdalScene,
      pictures.migdalHalf2,
      pictures.migdalTeam1,
      pictures.migdalTeam2,
      pictures.migdalTeam3,
      pictures.migdalTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
