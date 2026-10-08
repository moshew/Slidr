import {
  createElement,
  type Color,
  type Element,
  type Frame,
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
 * Defus: print and poster. Ink on newsprint: heavy black rules, solid black blocks with square
 * corners, the marks of a printer's sheet in the margins, and one signal red that is used
 * rarely and loudly.
 *
 * Two voices. The text speaks in a grotesque, heavy in the headings: the `heading` pair, which
 * the `body` style uses too. The labels (the `caption` style, and with it the text of a chart)
 * speak in the `body` pair, whose Latin face is monospace: a line over a title, a date, a
 * source, the foot of the slide. A paragraph set in that pair takes its spaces and figures from
 * the monospace face in Hebrew too, which reads as a label and not as running text, and is a
 * fifth wider in English; that is why the running text is not set in it.
 *
 * `primary` is the ink itself: a table's header row and the first series of a chart are black,
 * and the red is left for the one thing a slide points at. The shadow is a hard one, a second
 * sheet of ink under the first; it falls towards the end side of a right-to-left slide, as the
 * shadows the layouts draw under their pictures do.
 */
export const defusTheme: Theme = {
  id: 'defus',
  name: 'Defus',
  colors: {
    bg: '#eeebe3',
    surface: '#f8f6f0',
    text: '#131311',
    muted: '#55524b',
    primary: '#131311',
    secondary: '#3a3835',
    accent: '#e4351c',
    chart: ['#131311', '#e4351c', '#8a877f', '#c4c0b4', '#55524b', '#f0907a'],
  },
  fonts: {
    heading: { he: 'Heebo', latin: 'Space Grotesk' },
    body: { he: 'IBM Plex Sans Hebrew', latin: 'JetBrains Mono' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 128,
      weight: 900,
      lineHeight: 1,
      letterSpacing: -2,
      color: { token: 'text' },
    },
    title: {
      font: 'heading',
      size: 64,
      weight: 800,
      lineHeight: 1.1,
      letterSpacing: -0.5,
      color: { token: 'text' },
    },
    heading: { font: 'heading', size: 40, weight: 700, lineHeight: 1.15, color: { token: 'text' } },
    body: { font: 'heading', size: 28, weight: 400, lineHeight: 1.45, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.35, color: { token: 'text' } },
  },
  radius: 0,
  shadow: { x: -12, y: 12, blur: 0, color: { token: 'text' } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [SURFACE],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

const INK = solid(token('text'));
const RED = solid(token('accent'));
const SHEET = solid(token('surface'));
const FRAME = { color: token('text'), width: 4 };

const INK_HEX = '#131311';
const RED_HEX = '#e4351c';
const PAPER_HEX = '#eeebe3';

/** The literal colours of the drawings, and the tokens they stand for. */
const PAINT = {
  [INK_HEX]: token('text'),
  [RED_HEX]: token('accent'),
  [PAPER_HEX]: token('bg'),
};

/**
 * The mark of the template: a block of ink with a registration target knocked out of it and a
 * red core. A deck replaces it with its logo.
 */
const MARK =
  `<svg viewBox="0 0 40 40"><rect width="40" height="40" fill="${INK_HEX}"/>` +
  `<circle cx="20" cy="20" r="10" fill="none" stroke="${PAPER_HEX}" stroke-width="3"/>` +
  `<path d="M20 4v32M4 20h32" fill="none" stroke="${PAPER_HEX}" stroke-width="3"/>` +
  `<circle cx="20" cy="20" r="4.5" fill="${RED_HEX}"/></svg>`;

const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** A registration target: a ring and a cross. `width` is the stroke in a box of 100. */
const target = (color: string, width: number) =>
  `<svg viewBox="0 0 100 100" fill="none" stroke="${color}" stroke-width="${width}">` +
  `<circle cx="50" cy="50" r="32"/><path d="M50 0v100M0 50h100"/></svg>`;

/** The two ticks of a crop mark, in a box of 44, for the corner they stand at. */
function cropMark(right: boolean, bottom: boolean): string {
  const x = right ? 4 : 40;
  const y = bottom ? 4 : 40;
  const across = right ? `M16 ${y}H44` : `M0 ${y}H28`;
  const down = bottom ? `M${x} 16V44` : `M${x} 0V28`;
  return `<svg viewBox="0 0 44 44" fill="none" stroke="${INK_HEX}" stroke-width="3"><path d="${across}${down}"/></svg>`;
}

/** The ticks of the grid, hanging from a rule: one per column, a longer one every third. */
function ruler(width: number, columns: number, color = INK_HEX): string {
  const step = (width - 4) / columns;
  const ticks = Array.from({ length: columns + 1 }, (_, i) => {
    const x = Math.round(i * step * 100) / 100;
    return `<rect x="${x}" y="0" width="4" height="${i % 3 === 0 ? 14 : 8}" fill="${color}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${width} 14">${ticks}</svg>`;
}

/** The colour control strip of a printed sheet: the ink, the signal colour, the bare paper. */
const STRIP =
  `<svg viewBox="0 0 76 20"><rect width="20" height="20" fill="${INK_HEX}"/>` +
  `<rect x="28" width="20" height="20" fill="${RED_HEX}"/>` +
  `<rect x="57" y="1" width="18" height="18" fill="none" stroke="${INK_HEX}" stroke-width="2"/></svg>`;

/** A typewriter's quotation mark: two wedges. It is the same mark from both directions. */
const QUOTE = `<svg viewBox="0 0 200 180"><path fill="${RED_HEX}" d="M10 0h70L66 180H24zM120 0h70l-14 180h-42z"/></svg>`;

/** An arrowhead towards the end side, drawn for a right-to-left slide: the mirror turns it. */
const arrow = (color: string) =>
  `<svg viewBox="0 0 24 24"><path fill="${color}" d="M24 0v24L0 12z"/></svg>`;

/** A long arrow towards the end side, for the block between the two sides of a comparison. */
const ARROW_LONG = `<svg viewBox="0 0 40 40" fill="none" stroke="${PAPER_HEX}" stroke-width="5" stroke-linecap="square"><path d="M36 20H6M18 7 5 20l13 13"/></svg>`;

/**
 * The marks of the printed sheet, in the margins: crop marks at the corners and a registration
 * target at the middle of each side. A slide with a field of colour at its end side keeps only
 * the marks of its start side.
 */
function sheet(name: string, sides: 'both' | 'start' = 'both'): Element[] {
  const id = (part: string) => `d_defus_${name}_${part}`;
  const start = [
    drawing(id('crop_start_top'), at(20, 20, 44, 44), cropMark(true, false), PAINT),
    drawing(id('crop_start_bottom'), at(20, 1016, 44, 44), cropMark(true, true), PAINT),
    drawing(id('register_start'), at(32, 524, 32, 32), target(INK_HEX, 7), PAINT),
  ];
  if (sides === 'start') return start;
  return [
    ...start,
    drawing(id('crop_end_top'), atEnd(20, 20, 44, 44), cropMark(false, false), PAINT),
    drawing(id('crop_end_bottom'), atEnd(20, 1016, 44, 44), cropMark(false, true), PAINT),
    drawing(id('register_end'), atEnd(32, 524, 32, 32), target(INK_HEX, 7), PAINT),
  ];
}

/**
 * A figure the layout itself sets, in the monospace face: the index of a step, a card, a line.
 * It is centred in its box, so it stays in its block when the layout is mirrored.
 */
function numeral(
  id: string,
  frame: Frame,
  value: string,
  size: number,
  color: Color = token('bg'),
): Element {
  return createElement.text({
    id,
    frame,
    vAlign: 'middle',
    content: {
      paragraphs: [
        {
          dir: 'auto',
          align: 'center',
          styleRef: 'caption',
          runs: [{ text: value, marks: { size, weight: 700, color } }],
        },
      ],
    },
  });
}

/** A block of ink with its index in it. */
const indexBlock = (id: string, frame: Frame, n: number, size = 26) => [
  rect(id, frame, INK),
  numeral(`${id}_n`, frame, `0${n}`, size),
];

/** The line over a title and the title itself, as every content slide has them. */
const head = (width = 1728) => [
  place('p_kicker', 'caption', at(96, 80, Math.min(1100, width), 34), 'caption'),
  place('p_title', 'title', at(96, 118, width, 142), 'title'),
];

/**
 * What frames a content slide besides its head. At the top, in the margin, the heavy rule of
 * the sheet with the ticks of its twelve columns, and the control strip at the far end of the
 * line over the title. At the foot a thin rule, the mark alone at the start, and at the end the
 * deck's name with the slide's number beyond it, in a tab of ink (SLD-04).
 */
function frameOf(
  name: string,
  strip = true,
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  const id = (part: string) => `d_defus_${name}_${part}`;
  return {
    placeholders: [
      place('p_footer', 'footer', atEnd(172, 960, 900, 34), 'caption', { align: 'end' }),
    ],
    decorations: [
      ...sheet(name),
      rect(id('head_bar'), at(96, 36, 1728, 10), INK),
      drawing(id('head_ruler'), at(96, 46, 1728, 14), ruler(1728, 12), PAINT),
      ...(strip ? [drawing(id('head_strip'), atEnd(96, 87, 76, 20), STRIP, PAINT)] : []),
      rect(id('foot_rule'), at(96, 944, 1728, 2), INK),
      mark(id('mark'), at(96, 958, 38, 38)),
      rect(id('foot_tab'), atEnd(96, 958, 60, 38), INK),
      pageNumber(id('number'), atEnd(96, 960, 60, 34), 'caption', {
        color: token('bg'),
        align: 'center',
      }),
    ],
  };
}

/**
 * The head of a poster slide (opening, section, closing), over the 1008px of paper beside the
 * field: the mark, and under it the heavy rule with its ticks. The mark stands alone on its
 * row, so a logo eight times as wide as it is tall has room there; the line that opens the
 * slide is set under the rule, at `KICKER`.
 */
function masthead(name: string): Element[] {
  const id = (part: string) => `d_defus_${name}_${part}`;
  return [
    mark(id('mark'), at(96, 80, 56, 56)),
    rect(id('head_bar'), at(96, 152, 1008, 12), INK),
    drawing(id('head_ruler'), at(96, 164, 1008, 14), ruler(1008, 7), PAINT),
  ];
}

/** The top of the line under the rule of a poster slide. */
const KICKER = 194;

/** A field of colour at the end side, 720 wide: the poster slides share it. */
const field = (id: string, color: 'text' | 'accent') =>
  rect(id, atEnd(0, 0, 720, 1080), solid(token(color)));

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const columns4 = [96, 540, 984, 1428];
const cards3 = [96, 672, 1248];
const steps5 = [96, 450, 804, 1158, 1512];
const rows3 = [270, 490, 710];
const lines3 = [650, 740, 830];
const stats3 = [280, 490, 700];

function layouts(): Layout[] {
  return [
    {
      id: 'l_defus_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        place('p_kicker', 'caption', at(96, KICKER, 1008, 34), 'caption'),
        place('p_title', 'title', at(96, 300, 1008, 384), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 716, 1008, 138), 'heading'),
        place('p_meta', 'caption', at(96, 918, 1008, 66), 'caption'),
        place('p_image', 'image', atEnd(40, 40, 640, 760)),
      ],
      decorations: [
        ...sheet('hero', 'start'),
        // The picture is mounted on a field of ink; under it, the marks of the sheet.
        field('d_defus_hero_field', 'text'),
        drawing('d_defus_hero_ticks', atEnd(40, 816, 640, 14), ruler(640, 8, PAPER_HEX), PAINT),
        dot('d_defus_hero_disc', atEnd(40, 880, 136, 136), RED),
        drawing('d_defus_hero_target', atEnd(208, 880, 136, 136), target(PAPER_HEX, 4), PAINT),
        ...masthead('hero'),
        rect('d_defus_hero_rule', at(96, 898, 1008, 2), INK),
      ],
    },
    {
      id: 'l_defus_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        // The number is set in ink on the red field: at this size the pair reads (4.2:1).
        place('p_number', 'number', atEnd(96, 92, 528, 130), 'display', { align: 'end' }),
        place('p_kicker', 'caption', at(96, KICKER, 1008, 34), 'caption'),
        place('p_title', 'title', at(96, 426, 1008, 384), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 852, 1008, 138), 'heading'),
      ],
      decorations: [
        ...sheet('section', 'start'),
        field('d_defus_section_field', 'accent'),
        rect('d_defus_section_under', atEnd(96, 244, 528, 12), INK),
        drawing('d_defus_section_target', atEnd(96, 560, 424, 424), target(INK_HEX, 3), PAINT),
        ...masthead('section'),
        rect('d_defus_section_rule', at(96, 828, 1008, 4), INK),
      ],
    },
    {
      id: 'l_defus_title',
      name: 'Title',
      archetype: 'title',
      placeholders: [place('p_title', 'title', at(96, 118, 1728, 71), 'title')],
      decorations: frameOf('title').decorations,
    },
    {
      id: 'l_defus_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head(),
        place('p_number', 'number', at(96, 368, 1040, 130), 'display'),
        place('p_label', 'subtitle', at(96, 550, 1040, 92), 'heading'),
        place('p_body', 'body', at(96, 662, 1000, 204), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', at(1240, top + 24, 504, 72), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', at(1240, top + 104, 584, 66), 'caption'),
        ]),
        ...frameOf('big_number').placeholders,
      ],
      decorations: [
        rect('d_defus_big_number_top', at(96, 280, 1040, 8), INK),
        rect('d_defus_big_number_signal', at(96, 514, 144, 12), RED),
        // A bar of ink between the number and the figures beside it.
        rect('d_defus_big_number_column', at(1176, 280, 24, 630), INK),
        ...stats3.flatMap((top, i) => [
          rect(`d_defus_big_number_rule${i + 1}`, at(1240, top, 584, i === 0 ? 8 : 4), INK),
          ...indexBlock(`d_defus_big_number_index${i + 1}`, atEnd(96, top + 28, 56, 56), i + 1),
        ]),
        ...frameOf('big_number').decorations,
      ],
    },
    {
      id: 'l_defus_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(96, 140, 1248, 440), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(96, 690, 1248, 48), 'heading'),
        place('p_caption', 'caption', at(96, 750, 1248, 98), 'caption'),
        ...frameOf('quote', false).placeholders,
      ],
      decorations: [
        // The mark of the quotation stands in a block of ink, at the end side.
        rect('d_defus_quote_block', atEnd(96, 96, 384, 804), INK),
        drawing('d_defus_quote_glyph', atEnd(176, 176, 224, 202), QUOTE, PAINT),
        drawing('d_defus_quote_target', atEnd(196, 664, 184, 184), target(PAPER_HEX, 3), PAINT),
        rect('d_defus_quote_signal', at(96, 650, 144, 12), RED),
        ...frameOf('quote', false).decorations,
      ],
    },
    {
      id: 'l_defus_text',
      name: 'Text',
      archetype: 'text',
      placeholders: [
        place('p_title', 'title', at(96, 118, 1728, 71), 'title'),
        place('p_body', 'body', at(96, 240, 1728, 656), 'body'),
      ],
      decorations: frameOf('text').decorations,
    },
    {
      id: 'l_defus_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head(),
        place('p_image', 'image', atEnd(112, 270, 600, 640)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(184, top + 10, 968, 46), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(184, top + 56, 968, 163), 'body'),
        ]),
        ...frameOf('text_image').placeholders,
      ],
      decorations: [
        // The picture throws a hard shadow of ink towards the end side.
        rect('d_defus_text_image_shadow', atEnd(96, 286, 600, 640), INK),
        ...rows3.flatMap((top, i) => [
          rect(`d_defus_text_image_rule${i + 1}`, at(96, top, 1056, 4), INK),
          ...indexBlock(`d_defus_text_image_index${i + 1}`, at(96, top + 18, 64, 64), i + 1),
        ]),
        ...frameOf('text_image').decorations,
      ],
    },
    {
      id: 'l_defus_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture is mounted on a block of ink that runs from edge to edge; the text has a
        // band of its own under it, because nothing of a layout can be drawn over a picture.
        place('p_image', 'image', atEnd(24, 24, 1872, 596)),
        place('p_kicker', 'caption', at(96, 708, 1000, 34), 'caption'),
        place('p_title', 'title', at(96, 748, 1040, 212), 'title'),
        place('p_body', 'body', atEnd(96, 714, 600, 244), 'body'),
      ],
      decorations: [
        rect('d_defus_full_image_mount', atEnd(0, 0, 1920, 644), INK),
        rect('d_defus_full_image_signal', at(96, 644, 144, 16), RED),
        rect('d_defus_full_image_column', atEnd(732, 714, 8, 244), INK),
      ],
    },
    {
      id: 'l_defus_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head(),
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}`, 'subtitle', at(start + 32, 424, 512, 92), 'heading'),
          place(`p_card${i + 1}_body`, 'body', at(start + 32, 544, 512, 204), 'body'),
          place(`p_card${i + 1}_note`, 'caption', at(start + 32, 348, 512, 66), 'caption', {
            vAlign: 'bottom',
          }),
        ]),
        place('p_takeaway', 'body', at(96, 796, 1728, 122), 'body'),
        ...frameOf('cards').placeholders,
      ],
      decorations: [
        // One sheet cut into three cells, under a bar of ink that carries their numbers.
        rect('d_defus_cards_sheet', at(96, 276, 1728, 492), SHEET, { stroke: FRAME }),
        rect('d_defus_cards_bar', at(96, 276, 1728, 56), INK),
        ...cards3.flatMap((start, i) => [
          numeral(`d_defus_cards_n${i + 1}`, at(start + 24, 276, 64, 56), `0${i + 1}`, 28),
          rect(`d_defus_cards_rule${i + 1}`, at(start + 32, 528, 512, 2), INK),
        ]),
        ...cards3
          .slice(1)
          .map((start, i) =>
            rect(`d_defus_cards_divider${i + 1}`, at(start - 2, 332, 4, 436), INK),
          ),
        ...frameOf('cards').decorations,
      ],
    },
    {
      id: 'l_defus_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          // The date stands on the axis at the size of a poster; a date of two words ("Feb 21")
          // takes two lines, so the frame is two lines high and the text sits at its foot.
          place(`p_when${i + 1}`, 'number', at(start, 262, 396, 260), 'display', {
            vAlign: 'bottom',
          }),
          place(`p_what${i + 1}`, 'subtitle', at(start + 28, 580, 368, 92), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start + 28, 680, 368, 163), 'body'),
        ]),
        place('p_note', 'caption', at(96, 866, 1728, 66), 'caption'),
        ...frameOf('timeline').placeholders,
      ],
      decorations: [
        // The axis: a bar of ink, a block where each step begins, an arrowhead beyond the last.
        rect('d_defus_timeline_axis', at(96, 534, 1716, 12), INK),
        drawing('d_defus_timeline_arrow', atEnd(84, 522, 36, 36), arrow(INK_HEX), PAINT),
        ...columns4.flatMap((start, i) => [
          rect(`d_defus_timeline_node${i + 1}`, at(start, 522, 36, 36), i === 0 ? RED : INK),
          rect(`d_defus_timeline_column${i + 1}`, at(start, 558, 4, 290), INK),
        ]),
        ...frameOf('timeline').decorations,
      ],
    },
    {
      id: 'l_defus_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start, 384, 312, 92), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_step${i + 1}_body`, 'caption', at(start, 484, 312, 162), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start, 670, 312, 72), 'title'),
        ]),
        place('p_summary', 'body', at(96, 794, 1728, 92), 'heading'),
        ...frameOf('process').placeholders,
      ],
      decorations: [
        ...steps5.flatMap((start, i) => [
          rect(`d_defus_process_block${i + 1}`, at(start, 276, 312, 96), INK),
          numeral(`d_defus_process_n${i + 1}`, at(start + 20, 276, 110, 96), `0${i + 1}`, 60),
          rect(`d_defus_process_rule${i + 1}`, at(start, 658, 312, 4), INK),
        ]),
        ...steps5
          .slice(0, 4)
          .map((start, i) =>
            drawing(
              `d_defus_process_arrow${i + 1}`,
              at(start + 321, 312, 24, 24),
              arrow(RED_HEX),
              PAINT,
            ),
          ),
        rect('d_defus_process_base', at(96, 764, 1728, 8), INK),
        ...frameOf('process').decorations,
      ],
    },
    {
      id: 'l_defus_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head(),
        place('p_before_tag', 'caption', at(136, 316, 736, 34), 'caption'),
        place('p_before', 'subtitle', at(136, 358, 736, 92), 'heading'),
        place('p_before_body', 'body', at(136, 486, 736, 380), 'body'),
        place('p_after_tag', 'caption', atEnd(152, 316, 736, 34), 'caption'),
        place('p_after', 'subtitle', atEnd(152, 358, 736, 92), 'heading'),
        place('p_after_body', 'body', atEnd(152, 486, 736, 380), 'body'),
        ...frameOf('comparison').placeholders,
      ],
      decorations: [
        // What was stands in an outline on the paper; what is, on a lighter sheet under a bar of
        // ink, with a hard shadow.
        rect(
          'd_defus_comparison_before',
          at(96, 276, 816, 624),
          { kind: 'none' },
          { stroke: FRAME },
        ),
        rect('d_defus_comparison_shadow', atEnd(96, 292, 816, 608), INK),
        rect('d_defus_comparison_after', atEnd(112, 276, 816, 608), SHEET, { stroke: FRAME }),
        rect('d_defus_comparison_bar', atEnd(112, 276, 816, 20), INK),
        rect('d_defus_comparison_rule1', at(136, 466, 736, 2), INK),
        rect('d_defus_comparison_rule2', atEnd(152, 466, 736, 2), INK),
        rect('d_defus_comparison_block', atEnd(932, 552, 72, 72), INK),
        drawing('d_defus_comparison_arrow', atEnd(948, 568, 40, 40), ARROW_LONG, PAINT),
        ...frameOf('comparison').decorations,
      ],
    },
    {
      id: 'l_defus_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head(),
        place('p_chart', 'chart', at(120, 300, 1088, 592)),
        place('p_stat1', 'number', at(1328, 272, 496, 130), 'display'),
        place('p_stat1_body', 'body', at(1328, 410, 496, 122), 'body'),
        place('p_stat2', 'number', at(1328, 566, 496, 130), 'display'),
        place('p_stat2_body', 'body', at(1328, 704, 496, 122), 'body'),
        place('p_source', 'caption', at(1328, 836, 496, 98), 'caption'),
        ...frameOf('chart').placeholders,
      ],
      decorations: [
        rect('d_defus_chart_sheet', at(96, 276, 1136, 640), SHEET, { stroke: FRAME }),
        rect('d_defus_chart_column', at(1264, 276, 24, 640), INK),
        rect('d_defus_chart_divider', at(1328, 546, 496, 8), INK),
        ...frameOf('chart').decorations,
      ],
    },
    {
      id: 'l_defus_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        place('p_kicker', 'caption', at(96, 80, 1000, 34), 'caption'),
        place('p_title', 'title', at(96, 118, 1100, 142), 'title'),
        place('p_table', 'table', at(96, 272, 1728, 656)),
        // The note stands beside the title, at the end side, and leaves the table the height.
        place('p_note', 'caption', atEnd(96, 124, 544, 130), 'caption', { vAlign: 'bottom' }),
        ...frameOf('table').placeholders,
      ],
      decorations: [
        rect('d_defus_table_note', atEnd(656, 124, 8, 130), INK),
        ...frameOf('table').decorations,
      ],
    },
    {
      id: 'l_defus_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start, 276, 384, 352)),
          place(`p_person${i + 1}`, 'subtitle', at(start, 658, 396, 48), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start, 710, 396, 66), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start, 782, 396, 132), 'caption'),
        ]),
        ...frameOf('team').placeholders,
      ],
      decorations: [
        ...columns4.map((start, i) =>
          rect(`d_defus_team_shadow${i + 1}`, at(start + 12, 288, 384, 352), INK),
        ),
        ...frameOf('team').decorations,
      ],
    },
    {
      id: 'l_defus_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(96, KICKER, 1008, 34), 'caption'),
        place('p_title', 'title', at(96, 240, 1008, 384), 'display', { vAlign: 'bottom' }),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(176, top, 928, 82), 'body', { vAlign: 'middle' }),
        ),
        place('p_contact', 'caption', at(96, 930, 1008, 66), 'caption'),
      ],
      decorations: [
        ...sheet('closing', 'start'),
        // The mark of the template at the size of a poster: the field, the target, the red core.
        field('d_defus_closing_field', 'text'),
        drawing('d_defus_closing_target', atEnd(60, 240, 600, 600), target(PAPER_HEX, 1.4), PAINT),
        dot('d_defus_closing_disc', atEnd(232, 412, 256, 256), RED),
        ...masthead('closing'),
        rect('d_defus_closing_top', at(96, 636, 1008, 4), INK),
        ...lines3.flatMap((top, i) => [
          ...indexBlock(`d_defus_closing_index${i + 1}`, at(96, top + 11, 60, 60), i + 1),
          rect(`d_defus_closing_rule${i + 1}`, at(96, top + 86, 1008, 2), INK),
        ]),
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: the yearly report of an invented urban research group

const FOOTER = text('STREET LAB · WALKABILITY INDEX 2026');
const HOURS = ['07:00', '09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'];
const WALKERS_2025 = [290, 250, 330, 270, 350, 430, 410, 220];
const WALKERS_2026 = [320, 290, 380, 310, 420, 520, 570, 300];
const TABLE_COLS = [608, 300, 260, 280, 280];
const TABLE_ROW = 70;

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_defus_hero',
    name: 'פתיחה',
    content: {
      caption: [
        text('WALKABILITY INDEX 2026'),
        text('מעבדת רחוב · הוצג בכנס העירוני, 3 בדצמבר 2026'),
      ],
      title: text('העיר', 'בהליכה'),
      subtitle: text('מדד ההליכה 2026: מה למדנו מ-212 רחובות'),
      image: { assetId: pictures.defusStreet1.id },
    },
  },
  {
    layout: 'l_defus_section',
    name: 'מה ספרנו',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('מה ספרנו'),
      subtitle: text('שנה של ספירות, מצלמות ושיחות ברחוב.'),
    },
  },
  {
    layout: 'l_defus_big_number',
    name: 'הולכי רגל',
    content: {
      caption: [
        text('THE HEADLINE'),
        text('לעומת 2025, באותם רחובות'),
        text('רחובות שנמדדו, בתשע שכונות'),
        text('מהנסיעות הקצרות נעשות ברגל'),
      ],
      title: text('יותר רגליים ברחוב'),
      number: [text('1.84M'), text('+23%'), text('212'), text('41%')],
      subtitle: text('הולכי רגל שנספרו ב-2026'),
      body: text(
        'ספרנו ב-212 רחובות, בכל שעות היום. ברחובות שבהם הוצר הכביש, מספר ההולכים עלה ב-23% בתוך שנה אחת.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_cards',
    name: 'ממצאים',
    content: {
      caption: [
        text('WHAT MOVES PEOPLE'),
        text('SHADE · צל'),
        text('WIDTH · רוחב'),
        text('FRONTAGE · חזית'),
      ],
      title: text('שלושה דברים שמניעים הליכה'),
      subtitle: [text('צל רציף'), text('מדרכה רחבה'), text('חזית פעילה')],
      body: [
        text(
          'רחוב מוצל ב-70% מאורכו מושך פי 1.8 יותר הולכים בצהרי הקיץ. עצים עובדים טוב יותר מסככות.',
        ),
        text('מעל 3.2 מטרים נטו אנשים הולכים בזוגות, עוצרים ומדברים. מתחת לזה הם ממהרים הלאה.'),
        text('דלת או חלון ראווה בכל 8 מטרים מאריכים את השהייה ב-40%. קיר אטום מקצר אותה בחצי.'),
        text('ומה שלא משנה: מספר הנתיבים. מה שקובע הוא המהירות שבה נוסעים בהם בפועל.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_chart',
    name: 'לפי שעה',
    content: {
      caption: [text('BY THE HOUR'), text('ספירה ידנית ומצלמות, ימי חול, ממוצע של 212 רחובות.')],
      title: text('הרחוב חי גם אחרי חמש'),
      number: [text('+38%'), text('19:00')],
      body: [
        text('הולכים בשעות הערב, לעומת 2025.'),
        text('שעת השיא החדשה. ב-2025 היא הייתה 17:00.'),
      ],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'הולכי רגל בשעה, ממוצע לרחוב',
      data: {
        categories: HOURS,
        series: [
          { name: '2025', values: WALKERS_2025 },
          { name: '2026', values: WALKERS_2026 },
        ],
      },
    },
  },
  {
    layout: 'l_defus_table',
    name: 'רחוב אחר רחוב',
    content: {
      caption: [
        text('STREET BY STREET'),
        text('ציון ההליכה, מ-0 עד 100, משוקלל מצל, רוחב, חזית ומהירות נסיעה.'),
      ],
      title: text('שבעה רחובות, מדד אחד'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['רחוב', 'הולכים ביום', 'צל רציף', 'רוחב מדרכה', 'ציון הליכה'],
        ['שדרת האלונים', '14,200', '82%', '4.6 מ׳', '91'],
        ['רחוב הנפחים', '11,800', '64%', '3.4 מ׳', '84'],
        ['רחוב המסילה', '7,900', '58%', '3.1 מ׳', '71'],
        ['סמטת הדפוס', '6,300', '77%', '2.2 מ׳', '68'],
        ['דרך התחנה', '9,650', '31%', '2.8 מ׳', '62'],
        ['שדרות הנמל', '5,400', '12%', '5.0 מ׳', '49'],
        ['רחוב הבורסקאים', '3,100', '25%', '1.9 מ׳', '38'],
      ],
    },
  },
  {
    layout: 'l_defus_text_image',
    name: 'רחוב הנפחים',
    content: {
      caption: text('CASE STUDY'),
      title: text('רחוב הנפחים, שנה אחרי'),
      image: { assetId: pictures.defusStreet2.id },
      subtitle: [text('נתיב אחד פחות'), text('38 עצים חדשים'), text('עסקים שנשארים')],
      body: [
        text('נתיב הנסיעה הימני הפך למדרכה ברוחב 3.4 מטרים.'),
        text('צל רציף ב-64% מאורך הרחוב, לעומת 22% לפני השינוי.'),
        text('התפוסה המסחרית עלתה מ-71% ל-93% בתוך שנה.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'פעם חציתי את הרחוב הזה בריצה. היום אני יושבת בו עם קפה, והילדים הולכים לבד לבית הספר.',
      ),
      attribution: text('רונית אלקיים'),
      caption: text('בעלת חנות ספרים ברחוב הנפחים · תושבת השכונה מאז 1998'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_section',
    name: 'מה הלאה',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('מה הלאה'),
      subtitle: text('שלושה רחובות, שיטה אחת ולוח זמנים ל-2027.'),
    },
  },
  {
    layout: 'l_defus_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('BEFORE AND AFTER'), text('רחוב הנפחים · 2025'), text('רחוב הנפחים · 2026')],
      title: text('אותו רחוב, שנה אחרי'),
      subtitle: [text('שני נתיבים, מדרכה צרה'), text('נתיב אחד, מדרכה רחבה')],
      body: [
        bullets('הולכים ביום: 7,400', 'מהירות נסיעה: 48 קמ״ש', 'צל רציף: 22%', 'תפוסה מסחרית: 71%'),
        bullets(
          'הולכים ביום: 11,800',
          'מהירות נסיעה: 27 קמ״ש',
          'צל רציף: 64%',
          'תפוסה מסחרית: 93%. שמונה עסקים חדשים נפתחו מאז האביב',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_process',
    name: 'השיטה',
    content: {
      caption: [
        text('METHOD'),
        text('ספירה ידנית ומצלמות, שלוש שעות ביום.'),
        text('צל, רוחב, חזית ומהירות, מטר אחרי מטר.'),
        text('צבע, אדניות וספסלים. בלי בטון.'),
        text('אותן ספירות, באותן שעות.'),
        text('מה שעבד נסלל, מה שלא עבד מוסר.'),
      ],
      title: text('מספירה ועד רחוב חדש ב-140 יום'),
      subtitle: [text('ספירה'), text('מיפוי'), text('ניסוי'), text('מדידה'), text('קבע')],
      number: [text('21 יום'), text('14 יום'), text('56 יום'), text('28 יום'), text('21 יום')],
      body: text('בסך הכול 140 יום, ורוב העלות מחכה עד שהספירות מראות שהשינוי עובד.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_timeline',
    name: 'תוכנית 2027',
    content: {
      caption: [text('PLAN 2027'), text('לוח הזמנים כפוף לאישור תקציב העירייה, בינואר.')],
      title: text('ארבעה צעדים ל-2027'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [text('דרך התחנה'), text('שדרות הנמל'), text('מדד פתוח'), text('300 רחובות')],
      body: [
        text('ניסוי בצבע ובאדניות לאורך 600 מטרים.'),
        text('120 עצים ושלוש נקודות צל עד הקיץ.'),
        text('כל הספירות עולות לרשת כנתונים פתוחים.'),
        text('המדד מתרחב לשתי ערים שכנות.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_full_image',
    name: 'ברחוב',
    content: {
      image: { assetId: pictures.defusScene.id },
      caption: text('ON THE STREET'),
      title: text('רחוב טוב נמדד', 'באנשים שנשארים בו'),
      body: text('לא רק כמה עוברים בו, אלא כמה עוצרים, יושבים ומדברים.'),
    },
  },
  {
    layout: 'l_defus_team',
    name: 'הצוות',
    content: {
      caption: [
        text('THE TEAM'),
        text('ראש המעבדה · אדריכלית'),
        text('חוקר נתונים'),
        text('מתכננת תנועה'),
        text('אנתרופולוג עירוני'),
      ],
      title: text('הצוות שמאחורי המדד'),
      image: [
        { assetId: pictures.defusTeam1.id },
        { assetId: pictures.defusTeam2.id },
        { assetId: pictures.defusTeam3.id },
        { assetId: pictures.defusTeam4.id },
      ],
      subtitle: [text('תמר גלעדי'), text('יונתן שגב'), text('הילה מרום'), text('עידו נחום')],
      body: [
        text('הקימה את המעבדה ב-2021, אחרי עשור בתכנון עירוני.'),
        text('בנה את מערך המצלמות ואת מודל הספירה.'),
        text('מתרגמת את הממצאים לחתכי רחוב.'),
        text('מוביל את הראיונות ואת תצפיות השהייה.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_closing',
    name: 'סיום',
    content: {
      caption: [
        text('NEXT STEPS'),
        text('lab@streetlab.example · הדוח המלא: streetlab.example/2026'),
      ],
      title: text('הולכים', 'על זה'),
      body: [
        text('ינואר: ניסוי בדרך התחנה, 600 מטרים של צבע ואדניות'),
        text('מרץ: המדד נפתח לציבור כנתונים פתוחים'),
        text('יוני: ספירת הקיץ, עם 80 מתנדבים מהשכונות'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_defus_hero',
    name: 'Cover',
    content: {
      caption: [
        text('WALKABILITY INDEX 2026'),
        text('Street Lab · presented at the Urban Forum, 3 December 2026'),
      ],
      title: text('The city', 'on foot'),
      subtitle: text('Walkability Index 2026: what 212 streets taught us'),
      image: { assetId: pictures.defusStreet1.id },
    },
  },
  {
    layout: 'l_defus_section',
    name: 'The count',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('The count'),
      subtitle: text('A year of counts, cameras and conversations on the street.'),
    },
  },
  {
    layout: 'l_defus_big_number',
    name: 'Pedestrians',
    content: {
      caption: [
        text('THE HEADLINE'),
        text('on 2025, on the same streets'),
        text('streets measured, in nine districts'),
        text('of short trips are made on foot'),
      ],
      title: text('More feet on the street'),
      number: [text('1.84M'), text('+23%'), text('212'), text('41%')],
      subtitle: text('pedestrians counted in 2026'),
      body: text(
        'We counted on 212 streets, at every hour of the day. Where the roadway was narrowed, walking rose 23% within a year.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_cards',
    name: 'Findings',
    content: {
      caption: [text('WHAT MOVES PEOPLE'), text('SHADE'), text('WIDTH'), text('FRONTAGE')],
      title: text('Three things that make people walk'),
      subtitle: [text('Continuous shade'), text('A wide pavement'), text('An active frontage')],
      body: [
        text(
          'A street shaded along 70% of its length draws 1.8 times the walkers at noon. Trees do better than awnings.',
        ),
        text(
          'Above 3.2 metres clear, people walk in pairs, stop and talk. Below that, they hurry on.',
        ),
        text(
          'A door or a shop window every 8 metres makes people stay 40% longer. A blank wall halves the stay.',
        ),
        text(
          'And what does not matter: the number of lanes. What counts is how fast people really drive in them.',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_chart',
    name: 'By the hour',
    content: {
      caption: [
        text('BY THE HOUR'),
        text('Manual counts and cameras, weekdays, mean of 212 streets.'),
      ],
      title: text('The street is alive after five'),
      number: [text('+38%'), text('19:00')],
      body: [
        text('Evening walkers, against 2025.'),
        text('The new peak hour. In 2025 it was 17:00.'),
      ],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'Pedestrians per hour, mean per street',
      data: {
        categories: HOURS,
        series: [
          { name: '2025', values: WALKERS_2025 },
          { name: '2026', values: WALKERS_2026 },
        ],
      },
    },
  },
  {
    layout: 'l_defus_table',
    name: 'Street by street',
    content: {
      caption: [
        text('STREET BY STREET'),
        text('The walk score, 0 to 100, weighs shade, width, frontage and driving speed.'),
      ],
      title: text('Seven streets, one index'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['Street', 'Walkers a day', 'Shade', 'Pavement', 'Walk score'],
        ['Oak Avenue', '14,200', '82%', '4.6 m', '91'],
        ['Smiths Street', '11,800', '64%', '3.4 m', '84'],
        ['Rail Street', '7,900', '58%', '3.1 m', '71'],
        ['Print Lane', '6,300', '77%', '2.2 m', '68'],
        ['Station Road', '9,650', '31%', '2.8 m', '62'],
        ['Harbour Boulevard', '5,400', '12%', '5.0 m', '49'],
        ['Tanners Street', '3,100', '25%', '1.9 m', '38'],
      ],
    },
  },
  {
    layout: 'l_defus_text_image',
    name: 'Smiths Street',
    content: {
      caption: text('CASE STUDY'),
      title: text('Smiths Street, a year on'),
      image: { assetId: pictures.defusStreet2.id },
      subtitle: [text('One lane fewer'), text('38 new trees'), text('Shops that stay')],
      body: [
        text('The right-hand traffic lane became a pavement 3.4 metres wide.'),
        text('Continuous shade on 64% of the street, up from 22%.'),
        text('Retail occupancy rose from 71% to 93% within a year.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_quote',
    name: 'Quote',
    content: {
      quote: text(
        'I used to cross this street at a run. Now I sit in it with a coffee, and the children walk to school alone.',
      ),
      attribution: text('Ronit Elkayam'),
      caption: text('Bookshop owner on Smiths Street · a resident of the district since 1998'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_section',
    name: 'What next',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('What next'),
      subtitle: text('Three streets, one method and a timetable for 2027.'),
    },
  },
  {
    layout: 'l_defus_comparison',
    name: 'Before and after',
    content: {
      caption: [
        text('BEFORE AND AFTER'),
        text('Smiths Street · 2025'),
        text('Smiths Street · 2026'),
      ],
      title: text('The same street, a year on'),
      subtitle: [text('Two lanes, a narrow pavement'), text('One lane, a wide pavement')],
      body: [
        bullets(
          'Walkers a day: 7,400',
          'Driving speed: 48 km/h',
          'Continuous shade: 22%',
          'Retail occupancy: 71%',
        ),
        bullets(
          'Walkers a day: 11,800',
          'Driving speed: 27 km/h',
          'Continuous shade: 64%',
          'Retail occupancy: 93%. Eight new shops have opened since spring',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_process',
    name: 'Method',
    content: {
      caption: [
        text('METHOD'),
        text('Manual counts and cameras, three hours a day.'),
        text('Shade, width, frontage and speed, metre by metre.'),
        text('Paint, planters and benches. No concrete.'),
        text('The same counts, at the same hours.'),
        text('What worked is paved; the rest is removed.'),
      ],
      title: text('From a count to a new street in 20 weeks'),
      subtitle: [text('Count'), text('Survey'), text('Trial'), text('Measure'), text('Build')],
      number: [text('3 wks'), text('2 wks'), text('8 wks'), text('4 wks'), text('3 wks')],
      body: text(
        '20 weeks in all, and most of the cost waits until the counts show the change works.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_timeline',
    name: 'Plan 2027',
    content: {
      caption: [text('PLAN 2027'), text('Subject to the city budget, to be approved in January.')],
      title: text('Four steps for 2027'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [
        text('Station Road'),
        text('Harbour Boulevard'),
        text('An open index'),
        text('300 streets'),
      ],
      body: [
        text('Paint and planters along 600 metres.'),
        text('120 trees and three shaded stops.'),
        text('Every count goes online as open data.'),
        text('The index grows to two neighbouring cities.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_full_image',
    name: 'On the street',
    content: {
      image: { assetId: pictures.defusScene.id },
      caption: text('ON THE STREET'),
      title: text('A good street is measured', 'by the people who stay'),
      body: text('Not only how many pass through, but how many stop, sit down and talk.'),
    },
  },
  {
    layout: 'l_defus_team',
    name: 'The team',
    content: {
      caption: [
        text('THE TEAM'),
        text('Head of the lab · architect'),
        text('Data researcher'),
        text('Transport planner'),
        text('Urban anthropologist'),
      ],
      title: text('The people behind the index'),
      image: [
        { assetId: pictures.defusTeam1.id },
        { assetId: pictures.defusTeam2.id },
        { assetId: pictures.defusTeam3.id },
        { assetId: pictures.defusTeam4.id },
      ],
      subtitle: [
        text('Tamar Giladi'),
        text('Yonatan Segev'),
        text('Hila Marom'),
        text('Ido Nahum'),
      ],
      body: [
        text('Founded the lab in 2021, after a decade in planning.'),
        text('Built the cameras and the counting model.'),
        text('Turns the findings into street sections.'),
        text('Leads the interviews and staying counts.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_defus_closing',
    name: 'Closing',
    content: {
      caption: [
        text('NEXT STEPS'),
        text('lab@streetlab.example · the full report: streetlab.example/2026'),
      ],
      title: text('Walk', 'with us'),
      body: [
        text('January: a trial on Station Road, in paint and planters'),
        text('March: the index opens to the public as open data'),
        text('June: the summer count, with 80 volunteers'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const defusSamples = { he: sampleHe, en: sampleEn };

/** The Defus template: the theme, sixteen layouts for both directions, and its sample deck. */
export function defusTemplate(): Template {
  const template: Template = {
    theme: copyJson(defusTheme),
    description:
      'Print and poster: ink on newsprint, heavy black rules and blocks, monospace labels and one signal red.',
    dir: 'rtl',
    // Every layout mirrors as it is: the quotation mark is a typewriter's, the same from both sides.
    layouts: layouts(),
    assets: assetTable([
      pictures.defusScene,
      pictures.defusStreet1,
      pictures.defusStreet2,
      pictures.defusTeam1,
      pictures.defusTeam2,
      pictures.defusTeam3,
      pictures.defusTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
