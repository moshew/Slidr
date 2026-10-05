import type { Element, Fill, Frame, Layout, Theme } from '@slidr/model';
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
 * Ariach ("tile"): the bento template, after the product recaps of a keynote. Every slide is a
 * grid of borderless tiles with big round corners, of unequal sizes, and the biggest tile is
 * the message. The ground is a cool grey; the tiles are white, acid lime, ink and an
 * ultramarine gradient, at most one of each strong kind on a slide. Small drawings live in the
 * tiles: a progress ring, a dot matrix with one lit dot, a sparkline of round bars, a diagonal
 * arrow, a glyph in a rounded square.
 *
 * Placeholder text is ink (and the large figures ultramarine), so every placeholder sits on a
 * light tile: white, lime, a pale ultramarine tint or tangerine. The ink and ultramarine tiles
 * carry only drawings. The poster slides turn the ground itself dark: the section and the full
 * picture stand on ink, the closing slide on ultramarine, and their text keeps to light tiles.
 */
export const ariachTheme: Theme = {
  id: 'ariach',
  name: 'Ariach',
  colors: {
    bg: '#f0f1f5',
    surface: '#ffffff',
    text: '#111114',
    muted: '#5c5c66',
    primary: '#3d3bf3',
    secondary: '#ff6a3d',
    accent: '#c8f04b',
    chart: ['#3d3bf3', '#111114', '#ff6a3d', '#8e8cff', '#2fb67c', '#a3a3ad'],
  },
  fonts: {
    heading: { he: 'Noto Sans Hebrew', latin: 'Inter' },
    body: { he: 'Noto Sans Hebrew', latin: 'Inter' },
  },
  textStyles: {
    // The large figures and the cover are ultramarine: it reads on the ground, on white and on
    // the lime tile alike (5.1:1 and up).
    display: {
      font: 'heading',
      size: 156,
      weight: 800,
      lineHeight: 0.98,
      letterSpacing: -5,
      color: { token: 'primary' },
    },
    title: {
      font: 'heading',
      size: 64,
      weight: 800,
      lineHeight: 1.08,
      letterSpacing: -2,
      color: { token: 'text' },
    },
    heading: {
      font: 'heading',
      size: 40,
      weight: 700,
      lineHeight: 1.2,
      letterSpacing: -0.5,
      color: { token: 'text' },
    },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.4, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 40,
  shadow: { x: 0, y: 10, blur: 30, color: { value: '#111114', alpha: 0.06 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    { fill: { kind: 'solid', color: { token: 'surface' } } },
    { fill: { kind: 'solid', color: { token: 'text' } } },
    { fill: { kind: 'solid', color: { token: 'primary' } } },
  ],
};

// ---------------------------------------------------------------------------------------------
// The grid: twelve columns between margins of 48, gutters of 24. Tiles sit on the grid and text
// sits 48 inside them, which puts the text of an edge tile on the safe margin.

const GAP = 24;
const PAD = 48;
/** The distance of a column from the start side; the first is column 0. */
const col = (n: number) => 48 + n * 154;
/** The width of a number of columns. */
const span = (n: number) => n * 154 - GAP;

/** On a content slide the tiles end here; the foot of the slide is under them. */
const FLOOR = 936;
/** The rows of a poster slide, which has no foot: six of 144 from top to bottom. */
const prow = (n: number) => 48 + n * 168;
const pspan = (n: number) => n * 168 - GAP;

// ---------------------------------------------------------------------------------------------
// What the layouts share

/** The literal colours of the drawings, and the tokens they stand for. */
const PAINT = {
  '#111114': token('text'),
  '#ffffff': token('surface'),
  '#3d3bf3': token('primary'),
  '#c8f04b': token('accent'),
  '#ff6a3d': token('secondary'),
  '#f0f1f5': token('bg'),
};

const SOFT = { x: 0, y: 10, blur: 30, color: token('text', 0.06) };

type Kind = 'white' | 'lime' | 'ink' | 'blue' | 'tint' | 'tangerine';

const FILLS: Record<Exclude<Kind, 'blue'>, Fill> = {
  white: solid(token('surface')),
  lime: solid(token('accent')),
  ink: solid(token('text')),
  tint: solid({ token: 'primary', alpha: 0.12 }),
  tangerine: solid(token('secondary')),
};

/**
 * A tile: a borderless box with the big corner of the template. The ultramarine one is the
 * colour with a light that runs over it from a corner (two boxes, so it stays in theme colours).
 */
function tile(id: string, frame: Frame, kind: Kind, radius = 40): Element[] {
  if (kind === 'blue') {
    return [
      rect(id, frame, solid(token('primary')), { effects: { radius } }),
      rect(
        `${id}_light`,
        frame,
        {
          kind: 'linear',
          angle: 225,
          stops: [
            { color: token('surface', 0), at: 0.2 },
            { color: token('surface', 0.3), at: 1 },
          ],
        },
        { effects: { radius } },
      ),
    ];
  }
  const shadow = kind === 'white' || kind === 'tint' ? { shadow: SOFT } : {};
  return [rect(id, frame, FILLS[kind], { effects: { radius, ...shadow } })];
}

/** A pill under the line over a title, as a chip in a tile. */
const chip = (id: string, frame: Frame, fill: Fill = solid(token('bg'))): Element =>
  rect(id, frame, fill, { effects: { radius: frame.h / 2 } });

const svg = (w: number, h: number, body: string) => `<svg viewBox="0 0 ${w} ${h}">${body}</svg>`;

/**
 * A ring of progress with round caps: a faint track and an arc of `share` of a turn, from the
 * top, the way the sweep of a right-to-left slide runs (the mirror turns it).
 */
function ring(id: string, frame: Frame, share: number, arc: string, track: string, width = 22) {
  const r = 100 - width / 2 - 2;
  const angle = share * 2 * Math.PI;
  const x = (100 - r * Math.sin(angle)).toFixed(2);
  const y = (100 - r * Math.cos(angle)).toFixed(2);
  const large = share > 0.5 ? 1 : 0;
  const path =
    share >= 1
      ? `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${arc}" stroke-width="${width}"/>`
      : `<path d="M100 ${100 - r}A${r} ${r} 0 ${large} 0 ${x} ${y}" fill="none" stroke="${arc}" stroke-width="${width}" stroke-linecap="round"/>`;
  return drawing(
    id,
    frame,
    svg(
      200,
      200,
      `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${track}" stroke-opacity="0.16" stroke-width="${width}"/>${path}`,
    ),
    PAINT,
  );
}

/** A matrix of dots, one of them lit: the pattern of the ultramarine and lime tiles. */
function matrix(
  id: string,
  frame: Frame,
  cols: number,
  rows: number,
  dotColor: string,
  lit: [number, number],
  litColor: string,
  opacity = 0.32,
) {
  const step = frame.w / cols;
  const r = step * 0.16;
  const dots: string[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cx = (x + 0.5) * step;
      const cy = (y + 0.5) * step;
      const on = x === lit[0] && y === lit[1];
      dots.push(
        on
          ? `<circle cx="${cx}" cy="${cy}" r="${r * 2}" fill="${litColor}"/>`
          : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${dotColor}" fill-opacity="${opacity}"/>`,
      );
    }
  }
  return drawing(
    id,
    { ...frame, h: rows * step },
    svg(cols * step, rows * step, dots.join('')),
    PAINT,
  );
}

/** A sparkline of round bars, rising toward the end side; the last bar is the strong colour. */
function sparkline(
  id: string,
  frame: Frame,
  heights: readonly number[],
  bar: string,
  last: string,
) {
  const n = heights.length;
  const w = frame.w / (n * 2.2 - 1.2);
  const bars = heights
    .map((share, i) => {
      // Even the shortest bar stays a bar, not a dot.
      const h = Math.max(2 * w, (0.2 + 0.8 * share) * frame.h);
      // Drawn right to left: the first bar is at the start side.
      const x = frame.w - (i * 2.2 + 1) * w;
      return `<rect x="${x.toFixed(1)}" y="${(frame.h - h).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(w / 2).toFixed(1)}" fill="${i === n - 1 ? last : bar}"/>`;
    })
    .join('');
  return drawing(id, frame, svg(frame.w, frame.h, bars), PAINT);
}

/** The diagonal arrow, forward and up: toward the end side of a right-to-left slide. */
const arrow = (id: string, frame: Frame, color: string) =>
  drawing(
    id,
    frame,
    svg(
      100,
      100,
      `<path d="M84 84L18 18M18 70V18h52" fill="none" stroke="${color}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`,
    ),
    PAINT,
  );

/** The asterisk of the quote: three round bars across each other. */
const asterisk = (id: string, frame: Frame, color: string) =>
  drawing(
    id,
    frame,
    svg(
      100,
      100,
      [0, 60, 120]
        .map(
          (turn) =>
            `<rect x="42" y="0" width="16" height="100" rx="8" fill="${color}" transform="rotate(${turn} 50 50)"/>`,
        )
        .join(''),
    ),
    PAINT,
  );

/** The glyphs of the icon chips, drawn in a box of 48. */
const GLYPHS = {
  // A robot seen from above: a rounded body and its two lights.
  base: '<rect x="6" y="12" width="36" height="26" rx="9" fill="none" stroke="#c8f04b" stroke-width="5"/><circle cx="17" cy="25" r="3.5" fill="#c8f04b"/><circle cx="31" cy="25" r="3.5" fill="#c8f04b"/>',
  // Screens, stacked.
  layers:
    '<rect x="6" y="8" width="36" height="9" rx="4.5" fill="#c8f04b"/><rect x="6" y="21" width="36" height="9" rx="4.5" fill="#c8f04b" fill-opacity="0.6"/><rect x="6" y="34" width="36" height="9" rx="4.5" fill="#c8f04b" fill-opacity="0.3"/>',
  // Air: three waves.
  air: '<path d="M6 16c6-5 12 5 18 0s12-5 18 0M6 27c6-5 12 5 18 0s12-5 18 0M6 38c6-5 12 5 18 0s12-5 18 0" fill="none" stroke="#c8f04b" stroke-width="4.5" stroke-linecap="round"/>',
  check:
    '<path d="M10 25l9 9 19-20" fill="none" stroke="#c8f04b" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  // The mark in small: four tiles.
  tiles:
    '<rect x="6" y="6" width="16" height="16" rx="5" fill="#ffffff"/><rect x="26" y="6" width="16" height="16" rx="5" fill="#3d3bf3"/><rect x="6" y="26" width="16" height="16" rx="5" fill="#c8f04b"/><rect x="26" y="26" width="16" height="16" rx="5" fill="#ffffff" fill-opacity="0.35"/>',
};

/** A glyph in a rounded square of ink: the icon of a card. */
function icon(id: string, frame: Frame, glyph: keyof typeof GLYPHS): Element[] {
  const inset = frame.w * 0.22;
  return [
    rect(`${id}_chip`, frame, solid(token('text')), { effects: { radius: frame.w * 0.3 } }),
    drawing(
      `${id}_glyph`,
      { x: frame.x + inset, y: frame.y + inset, w: frame.w - 2 * inset, h: frame.h - 2 * inset },
      svg(48, 48, GLYPHS[glyph]),
      PAINT,
    ),
  ];
}

const MARK = svg(
  40,
  40,
  '<rect x="0" y="0" width="18" height="18" rx="5" fill="#111114"/><rect x="22" y="0" width="18" height="18" rx="5" fill="#3d3bf3"/><rect x="0" y="22" width="18" height="18" rx="5" fill="#c8f04b"/><rect x="22" y="22" width="18" height="18" rx="5" fill="#111114"/>',
);

/** The mark of the template: four tiles, one of each colour. A deck replaces it with its logo. */
const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** The quotation mark of each direction. They are two marks, not one mark and its mirror. */
const QUOTE_RTL = svg(
  66,
  52,
  '<path fill="#3d3bf3" d="M66 0v22c0 18-9 28-26 30V42c8-2 12-7 12-16H40V0h26ZM26 0v22C26 40 17 50 0 52V42c8-2 12-7 12-16H0V0h26Z"/>',
);
const QUOTE_LTR = svg(
  66,
  52,
  '<path fill="#3d3bf3" d="M0 52V30C0 12 9 2 26 0v10c-8 2-12 7-12 16h12v26H0Zm40 0V30C40 12 49 2 66 0v10c-8 2-12 7-12 16h12v26H40Z"/>',
);

const quoteGlyph = (frame: Frame, markup: string) =>
  drawing('d_ariach_quote_glyph', frame, markup, PAINT);

/** A number in a chip of its own. Centred, so it stays there when the layout turns. */
const chipNumber = (id: string, frame: Frame, n: number, color = token('surface')) =>
  label(id, frame, String(n), 'body', {
    color,
    weight: 800,
    dir: 'auto',
    align: 'center',
    vAlign: 'middle',
  });

/** The line over a title at the top of a tile that starts at `start`, `top`: a blue dot before it. */
function kicker(
  name: string,
  start: number,
  top: number,
  width: number,
): { placeholder: Layout['placeholders'][number]; decoration: Element } {
  return {
    placeholder: place('p_kicker', 'caption', at(start + 84, top + 44, width, 34), 'caption'),
    decoration: rect(
      `d_ariach_${name}_dot`,
      at(start + PAD, top + 52, 18, 18),
      solid(token('primary')),
      {
        effects: { radius: 6 },
      },
    ),
  };
}

/** The line over a title and the title, on the ground above the tiles: a lime dot before it. */
function head(name: string, width = 1728, lines = 2) {
  return {
    placeholders: [
      place('p_kicker', 'caption', at(128, 80, Math.min(900, width - 32), 34), 'caption'),
      place('p_title', 'title', at(96, 122, width, 70 * lines), 'title'),
    ],
    decorations: [
      rect(`d_ariach_${name}_dot`, at(96, 88, 18, 18), solid(token('primary')), {
        effects: { radius: 6 },
      }),
    ],
  };
}

/**
 * The foot of a content slide, under the tiles: the mark at the start, the deck's name after
 * it, and the slide's number in a white pill at the end (SLD-04).
 */
function foot(name: string): { placeholders: Layout['placeholders']; decorations: Element[] } {
  return {
    placeholders: [place('p_footer', 'footer', at(152, 958, 1000, 34), 'caption')],
    decorations: [
      mark(`d_ariach_${name}_mark`, at(96, 956, 36, 36)),
      chip(`d_ariach_${name}_pill`, atEnd(72, 951, 112, 48), solid(token('surface'))),
      pageNumber(`d_ariach_${name}_number`, atEnd(72, 958, 112, 34), 'caption', {
        align: 'center',
        color: token('text'),
        weight: 700,
      }),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const timeline4 = [col(0), col(3), col(6), col(9)];
const stair = [560, 440, 320, 200];
/** The steps of a process, laid like bricks: two rows of tiles whose seams do not line up. */
const steps = [
  { start: col(0), cols: 5, top: 290 },
  { start: col(5), cols: 3, top: 290 },
  { start: col(8), cols: 4, top: 290 },
  { start: col(0), cols: 4, top: 625 },
  { start: col(4), cols: 3, top: 625 },
];
const STEP_H = 311;
const points3 = [284, 508, 732];
const POINT_H = 200;
const team4 = [col(0), col(3), col(6), col(9)];
const closing3 = [48, 272, 496];

function layouts(): Layout[] {
  const sectionKicker = kicker('section', col(5), 48, 860);
  const bigKicker = kicker('big_number', 48, 48, 760);
  const cardsKicker = kicker('cards', 48, 48, 860);
  const chartKicker = kicker('chart', 48, 48, 860);
  const closingKicker = kicker('closing', 48, 48, 1000);
  const textImageHead = head('text_image', 1112);
  const timelineHead = head('timeline', 860);
  const processHead = head('process', 1728);
  const comparisonHead = head('comparison', 1728);
  const tableHead = head('table', 1300, 1);
  const teamHead = head('team', 1728, 1);
  const feet = (name: string) => foot(name);

  return [
    {
      id: 'l_ariach_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        place('p_kicker', 'caption', at(132, 103, 640, 34), 'caption'),
        // The title stands on the ground itself, not on a tile: a deck that paints its opening
        // slide keeps that ground, and its light title with it.
        place('p_title', 'title', at(96, 232, 1112, 470), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 724, 1000, 120), 'heading'),
        place('p_meta', 'caption', at(96, 926, 820, 68), 'caption', { vAlign: 'middle' }),
      ],
      decorations: [
        ...tile('d_ariach_hero_top', at(48, 48, span(6), pspan(1)), 'white'),
        rect('d_ariach_hero_dot', at(96, 111, 18, 18), solid(token('primary')), {
          effects: { radius: 6 },
        }),
        mark('d_ariach_hero_mark', at(col(6) - GAP - PAD - 56, 92, 56, 56)),
        ...tile('d_ariach_hero_go', at(col(6), 48, span(2), pspan(1)), 'tangerine'),
        arrow('d_ariach_hero_arrow', at(col(6) + 102, 80, 80, 80), '#111114'),
        // A lime band for the date and the place, with the year's bars at its end.
        ...tile('d_ariach_hero_band', at(48, prow(5), span(8), pspan(1)), 'lime'),
        sparkline(
          'd_ariach_hero_spark',
          at(col(8) - GAP - PAD - 236, prow(5) + 36, 236, 72),
          [0.3, 0.45, 0.4, 0.6, 0.55, 0.8, 1],
          '#111114',
          '#3d3bf3',
        ),
        // The end column: an ink tile with the ring of the year, and the ultramarine matrix.
        ...tile('d_ariach_hero_ink', at(col(8), 48, span(4), pspan(4)), 'ink'),
        ring('d_ariach_hero_ring', at(col(8) + 106, 164, 380, 380), 0.75, '#c8f04b', '#ffffff', 26),
        drawing(
          'd_ariach_hero_tiles',
          at(col(8) + 246, 304, 100, 100),
          svg(48, 48, GLYPHS.tiles),
          PAINT,
        ),
        ...tile('d_ariach_hero_blue', at(col(8), prow(4), span(4), pspan(2)), 'blue'),
        matrix(
          'd_ariach_hero_matrix',
          at(col(8) + 40, prow(4) + 36, 512, 0),
          12,
          5,
          '#ffffff',
          [3, 2],
          '#c8f04b',
          0.4,
        ),
      ],
    },
    {
      id: 'l_ariach_section',
      name: 'Section',
      archetype: 'section',
      background: { fill: solid(token('text')) },
      placeholders: [
        place('p_number', 'number', at(96, 820, 650, 170), 'display', { vAlign: 'bottom' }),
        sectionKicker.placeholder,
        place('p_title', 'title', at(col(5) + PAD, 200, 958, 450), 'display', {
          vAlign: 'bottom',
        }),
        place('p_subtitle', 'subtitle', at(col(5) + PAD, prow(4) + 40, 650, 232), 'heading', {
          vAlign: 'middle',
        }),
      ],
      decorations: [
        // A lime tile from top to bottom holds the number of the part, under a field of dots.
        ...tile('d_ariach_section_lime', at(48, 48, span(5), 984), 'lime'),
        matrix(
          'd_ariach_section_matrix',
          at(96, 96, 650, 0),
          9,
          8,
          '#111114',
          [2, 5],
          '#3d3bf3',
          0.22,
        ),
        ...tile('d_ariach_section_main', at(col(5), 48, span(7), pspan(4)), 'white'),
        sectionKicker.decoration,
        ...tile('d_ariach_section_note', at(col(5), prow(4), span(5), pspan(2)), 'white'),
        ...tile('d_ariach_section_blue', at(col(10), prow(4), span(2), pspan(2)), 'blue'),
        ring(
          'd_ariach_section_ring',
          at(col(10) + 46, prow(4) + 70, 192, 192),
          0.5,
          '#ffffff',
          '#ffffff',
          26,
        ),
      ],
    },
    {
      id: 'l_ariach_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        bigKicker.placeholder,
        place('p_title', 'title', at(96, 176, 804, 148), 'title'),
        place('p_number', 'number', at(96, 352, 804, 170), 'display'),
        place('p_label', 'subtitle', at(96, 536, 804, 100), 'heading'),
        place('p_body', 'body', at(96, 664, 804, 224), 'body'),
        place('p_stat1', 'number', at(col(6) + PAD, 272, 560, 76), 'title'),
        place('p_stat1_label', 'caption', at(col(6) + PAD, 352, 560, 68), 'caption'),
        place('p_stat2', 'number', at(col(6) + PAD, 736, 342, 76), 'title'),
        place('p_stat2_label', 'caption', at(col(6) + PAD, 816, 342, 72), 'caption'),
        place('p_stat3', 'number', at(col(9) + PAD, 736, 342, 76), 'title'),
        place('p_stat3_label', 'caption', at(col(9) + PAD, 816, 342, 72), 'caption'),
        ...feet('big_number').placeholders,
      ],
      decorations: [
        ...tile('d_ariach_big_number_main', at(48, 48, span(6), 888), 'white'),
        bigKicker.decoration,
        ...tile('d_ariach_big_number_lime', at(col(6), 48, span(6), 432), 'lime'),
        sparkline(
          'd_ariach_big_number_spark',
          atEnd(96, 96, 300, 200),
          [0.3, 0.42, 0.38, 0.55, 0.7, 1],
          '#111114',
          '#3d3bf3',
        ),
        ...tile('d_ariach_big_number_stat2', at(col(6), 504, span(3), 432), 'white'),
        ring(
          'd_ariach_big_number_ring',
          at(col(6) + PAD, 544, 120, 120),
          0.68,
          '#3d3bf3',
          '#111114',
          24,
        ),
        ...tile('d_ariach_big_number_stat3', at(col(9), 504, span(3), 432), 'tint'),
        arrow('d_ariach_big_number_arrow', at(col(9) + PAD, 548, 96, 96), '#3d3bf3'),
        ...feet('big_number').decorations,
      ],
    },
    {
      id: 'l_ariach_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(96, 240, 1266, 430), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(192, 712, 1000, 50), 'heading'),
        place('p_caption', 'caption', at(192, 766, 1000, 68), 'caption'),
        ...feet('quote').placeholders,
      ],
      decorations: [
        ...tile('d_ariach_quote_main', at(48, 48, span(9), 888), 'white'),
        quoteGlyph(at(96, 96, 132, 104), QUOTE_RTL),
        rect('d_ariach_quote_avatar', at(96, 716, 72, 72), solid(token('accent')), {
          effects: { radius: 24 },
        }),
        asterisk('d_ariach_quote_avatar_star', at(114, 734, 36, 36), '#111114'),
        ...tile('d_ariach_quote_ink', at(col(9), 48, span(3), 584), 'ink'),
        asterisk('d_ariach_quote_star', at(col(9) + 89, 210, 260, 260), '#c8f04b'),
        ...tile('d_ariach_quote_lime', at(col(9), 656, span(3), 280), 'lime'),
        matrix(
          'd_ariach_quote_matrix',
          at(col(9) + 40, 694, 358, 0),
          7,
          4,
          '#111114',
          [4, 1],
          '#3d3bf3',
          0.22,
        ),
        ...feet('quote').decorations,
      ],
    },
    {
      id: 'l_ariach_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...textImageHead.placeholders,
        // The picture is matted in a white tile: a placeholder cannot round its own corners.
        place('p_image', 'image', at(col(8) + 24, 72, 544, 840)),
        ...points3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(176, top + 30, 1032, 50), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(176, top + 82, 1032, 118), 'body'),
        ]),
        ...feet('text_image').placeholders,
      ],
      decorations: [
        ...textImageHead.decorations,
        ...tile('d_ariach_text_image_mat', at(col(8), 48, span(4), 888), 'white'),
        ...points3.flatMap((top, i) => [
          ...tile(
            `d_ariach_text_image_point${i + 1}`,
            at(48, top, span(8), POINT_H),
            i === 0 ? 'lime' : 'white',
          ),
          rect(`d_ariach_text_image_chip${i + 1}`, at(96, top + 30, 56, 56), solid(token('text')), {
            effects: { radius: 18 },
          }),
          chipNumber(`d_ariach_text_image_n${i + 1}`, at(96, top + 30, 56, 56), i + 1),
        ]),
        ...feet('text_image').decorations,
      ],
    },
    {
      id: 'l_ariach_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      background: { fill: solid(token('text')) },
      placeholders: [
        // The picture is the widest tile, on a ground of ink that frames it like a screen.
        place('p_image', 'image', at(48, 48, 1824, 648)),
        place('p_kicker', 'caption', at(96, 764, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 808, 1112, 148), 'title'),
        place('p_body', 'body', at(col(8) + PAD, 768, 496, 220), 'body'),
      ],
      decorations: [
        ...tile('d_ariach_full_image_text', at(48, 720, span(8), 312), 'white'),
        ...tile('d_ariach_full_image_lime', at(col(8), 720, span(4), 312), 'lime'),
      ],
    },
    {
      id: 'l_ariach_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        cardsKicker.placeholder,
        place('p_title', 'title', at(96, 144, 958, 140), 'title', { vAlign: 'bottom' }),
        // The tall lime card: its icon and its note at the top, its words at the foot.
        place('p_card1', 'subtitle', at(96, 640, 650, 100), 'heading', { vAlign: 'bottom' }),
        place('p_card1_body', 'body', at(96, 752, 650, 136), 'body'),
        place('p_card1_note', 'caption', at(216, 414, 530, 68), 'caption', { vAlign: 'middle' }),
        // The two wide white cards, one above the other.
        ...[352, 656].flatMap((top, i) => [
          place(`p_card${i + 2}`, 'subtitle', at(col(5) + PAD, top + 84, 838, 50), 'heading'),
          place(`p_card${i + 2}_body`, 'body', at(col(5) + PAD, top + 144, 838, 92), 'body'),
          place(`p_card${i + 2}_note`, 'caption', at(col(5) + PAD, top + 40, 838, 34), 'caption'),
        ]),
        // The takeaway seats a sentence of about 120 letters, as the wide takeaways of other decks are.
        place('p_takeaway', 'body', at(col(7) + PAD, 148, 650, 140), 'body', { vAlign: 'bottom' }),
        ...feet('cards').placeholders,
      ],
      decorations: [
        ...tile('d_ariach_cards_head', at(48, 48, span(7), 280), 'white'),
        cardsKicker.decoration,
        ...tile('d_ariach_cards_takeaway', at(col(7), 48, span(5), 280), 'tint'),
        arrow('d_ariach_cards_arrow', at(col(7) + PAD, 88, 52, 52), '#3d3bf3'),
        ...tile('d_ariach_cards_card1', at(48, 352, span(5), 584), 'lime'),
        ...icon('d_ariach_cards_icon1', at(96, 400, 96, 96), 'base'),
        ...tile('d_ariach_cards_card2', at(col(5), 352, span(7), 280), 'white'),
        ...icon('d_ariach_cards_icon2', atEnd(96, 400, 88, 88), 'layers'),
        ...tile('d_ariach_cards_card3', at(col(5), 656, span(7), 280), 'white'),
        ...icon('d_ariach_cards_icon3', atEnd(96, 704, 88, 88), 'air'),
        ...feet('cards').decorations,
      ],
    },
    {
      id: 'l_ariach_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...timelineHead.placeholders,
        ...timeline4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start + PAD, stair[i]! + 40, 342, 76), 'title'),
          place(
            `p_what${i + 1}`,
            'subtitle',
            at(start + PAD, stair[i]! + 124, 342, 100),
            'heading',
          ),
          place(
            `p_what${i + 1}_body`,
            'body',
            at(start + PAD, stair[i]! + 232, 342, 104),
            'caption',
          ),
        ]),
        place('p_note', 'caption', at(96, 300, 860, 68), 'caption'),
        ...feet('timeline').placeholders,
      ],
      decorations: [
        ...timelineHead.decorations,
        ...timeline4.flatMap((start, i) =>
          tile(
            `d_ariach_timeline_card${i + 1}`,
            at(start, stair[i]!, span(3), FLOOR - stair[i]!),
            i === 3 ? 'lime' : 'white',
          ),
        ),
        // The steps rise toward the end of the year, joined by one line through their corners.
        drawing(
          'd_ariach_timeline_track',
          at(0, 0, 1920, 1080),
          svg(
            1920,
            1080,
            `<path d="${timeline4
              .map((start, i) => `${i ? 'L' : 'M'}${1920 - start - 70} ${stair[i]}`)
              .join(
                '',
              )}" fill="none" stroke="#111114" stroke-width="4" stroke-linecap="round" stroke-dasharray="2 12"/>${timeline4
              .map(
                (start, i) =>
                  `<circle cx="${1920 - start - 70}" cy="${stair[i]}" r="13" fill="${i === 3 ? '#3d3bf3' : '#c8f04b'}" stroke="#111114" stroke-width="5"/>`,
              )
              .join('')}`,
          ),
          PAINT,
        ),
        arrow('d_ariach_timeline_arrow', at(col(9) + 40, 760, 120, 120), '#111114'),
        ...feet('timeline').decorations,
      ],
    },
    {
      id: 'l_ariach_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...processHead.placeholders,
        ...steps.flatMap(({ start, cols, top }, i) => [
          place(
            `p_step${i + 1}`,
            'subtitle',
            at(start + PAD, top + 124, span(cols) - 96, 50),
            'heading',
          ),
          place(
            `p_step${i + 1}_body`,
            'caption',
            at(start + PAD, top + 180, span(cols) - 96, 102),
            'caption',
          ),
          place(
            `p_step${i + 1}_number`,
            'number',
            at(start + 120, top + 28, span(cols) - 168, 76),
            'title',
            { align: 'end' },
          ),
        ]),
        place('p_summary', 'body', at(col(7) + PAD, 625 + 132, 650, 140), 'body'),
        ...feet('process').placeholders,
      ],
      decorations: [
        ...processHead.decorations,
        ...steps.flatMap(({ start, cols, top }, i) => [
          ...tile(
            `d_ariach_process_card${i + 1}`,
            at(start, top, span(cols), STEP_H),
            i === 4 ? 'tint' : 'white',
          ),
          rect(
            `d_ariach_process_chip${i + 1}`,
            at(start + PAD, top + 36, 60, 60),
            solid(token('text')),
            {
              effects: { radius: 30 },
            },
          ),
          chipNumber(
            `d_ariach_process_n${i + 1}`,
            at(start + PAD, top + 36, 60, 60),
            i + 1,
            token('accent'),
          ),
        ]),
        ...tile('d_ariach_process_summary', at(col(7), 625, span(5), STEP_H), 'lime'),
        arrow('d_ariach_process_arrow', at(col(7) + PAD, 665, 64, 64), '#111114'),
        ...feet('process').decorations,
      ],
    },
    {
      id: 'l_ariach_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...comparisonHead.placeholders,
        place('p_before_tag', 'caption', at(96, 338, 650, 34), 'caption'),
        place('p_before', 'subtitle', at(96, 384, 650, 100), 'heading'),
        place('p_before_body', 'body', at(96, 508, 650, 380), 'body'),
        place('p_after_tag', 'caption', at(col(5) + PAD, 338, 800, 34), 'caption'),
        place('p_after', 'subtitle', at(col(5) + PAD, 384, 958, 100), 'heading'),
        place('p_after_body', 'body', at(col(5) + PAD, 508, 958, 380), 'body'),
        ...feet('comparison').placeholders,
      ],
      decorations: [
        ...comparisonHead.decorations,
        ...tile('d_ariach_comparison_before', at(48, 290, span(5), 646), 'white'),
        ...tile('d_ariach_comparison_after', at(col(5), 290, span(7), 646), 'lime'),
        ...icon('d_ariach_comparison_check', atEnd(96, 330, 72, 72), 'check'),
        // What was is a field of unlit dots; what is, bars that rise.
        matrix(
          'd_ariach_comparison_dots',
          at(96, 808, 650, 0),
          13,
          2,
          '#111114',
          [12, 1],
          '#ff6a3d',
          0.14,
        ),
        sparkline(
          'd_ariach_comparison_spark',
          atEnd(96, 760, 280, 128),
          [0.2, 0.35, 0.3, 0.55, 0.75, 1],
          '#111114',
          '#3d3bf3',
        ),
        // The turn from one to the other, on the seam between the two tiles.
        rect('d_ariach_comparison_badge', at(col(5) - 60, 565, 96, 96), solid(token('primary')), {
          effects: { radius: 48, shadow: SOFT },
        }),
        drawing(
          'd_ariach_comparison_turn',
          at(col(5) - 38, 587, 52, 52),
          svg(
            48,
            48,
            '<path d="M40 24H8M20 12L8 24l12 12" fill="none" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
          ),
          PAINT,
        ),
        ...feet('comparison').decorations,
      ],
    },
    {
      id: 'l_ariach_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        chartKicker.placeholder,
        place('p_title', 'title', at(96, 158, 958, 140), 'title'),
        place('p_chart', 'chart', at(96, 316, 958, 504)),
        place('p_stat1', 'number', at(col(7) + PAD, 196, 650, 160), 'display'),
        place('p_stat1_body', 'body', at(col(7) + PAD, 364, 650, 84), 'body'),
        place('p_stat2', 'number', at(col(7) + PAD, 652, 650, 160), 'display'),
        place('p_stat2_body', 'body', at(col(7) + PAD, 820, 650, 84), 'body'),
        place('p_source', 'caption', at(96, 836, 958, 68), 'caption'),
        ...feet('chart').placeholders,
      ],
      decorations: [
        ...tile('d_ariach_chart_main', at(48, 48, span(7), 888), 'white'),
        chartKicker.decoration,
        ...tile('d_ariach_chart_kpi1', at(col(7), 48, span(5), 432), 'lime'),
        sparkline(
          'd_ariach_chart_spark',
          atEnd(96, 96, 220, 96),
          [0.35, 0.5, 0.45, 0.7, 1],
          '#111114',
          '#3d3bf3',
        ),
        ...tile('d_ariach_chart_kpi2', at(col(7), 504, span(5), 432), 'white'),
        ring('d_ariach_chart_ring', atEnd(96, 544, 96, 96), 0.62, '#3d3bf3', '#111114', 26),
        ...feet('chart').decorations,
      ],
    },
    {
      id: 'l_ariach_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...tableHead.placeholders,
        place('p_table', 'table', at(96, 268, 1728, 600)),
        place('p_note', 'caption', at(96, 882, 1728, 34), 'caption'),
        ...feet('table').placeholders,
      ],
      decorations: [
        ...tableHead.decorations,
        ...tile('d_ariach_table_lime', atEnd(48, 48, span(3), 164), 'lime'),
        matrix(
          'd_ariach_table_matrix',
          atEnd(80, 70, 374, 0),
          11,
          3,
          '#111114',
          [7, 1],
          '#3d3bf3',
          0.22,
        ),
        ...tile('d_ariach_table_main', at(48, 236, 1824, 700), 'white'),
        ...feet('table').decorations,
      ],
    },
    {
      id: 'l_ariach_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...teamHead.placeholders,
        ...team4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start + 16, 252, 406, 380)),
          place(`p_person${i + 1}`, 'subtitle', at(start + PAD, 656, 342, 50), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start + PAD, 710, 342, 68), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start + PAD, 786, 342, 102), 'caption'),
        ]),
        ...feet('team').placeholders,
      ],
      decorations: [
        ...teamHead.decorations,
        ...team4.flatMap((start, i) =>
          tile(
            `d_ariach_team_card${i + 1}`,
            at(start, 236, span(3), 700),
            (['lime', 'white', 'tint', 'white'] as const)[i]!,
          ),
        ),
        ...feet('team').decorations,
      ],
    },
    {
      id: 'l_ariach_closing',
      name: 'Closing',
      archetype: 'closing',
      background: { fill: solid(token('primary')) },
      placeholders: [
        closingKicker.placeholder,
        place('p_title', 'title', at(96, 170, 1112, 480), 'display', { vAlign: 'bottom' }),
        ...closing3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(col(8) + PAD, top + 92, 496, 84), 'body'),
        ),
        place('p_contact', 'caption', at(96, 900, 1000, 68), 'caption', { vAlign: 'bottom' }),
      ],
      decorations: [
        ...tile('d_ariach_closing_main', at(48, 48, span(8), pspan(4)), 'lime'),
        closingKicker.decoration,
        ...closing3.flatMap((top, i) => [
          ...tile(`d_ariach_closing_line${i + 1}`, at(col(8), top, span(4), 200), 'white'),
          rect(
            `d_ariach_closing_chip${i + 1}`,
            at(col(8) + PAD, top + 32, 48, 48),
            solid(token('text')),
            {
              effects: { radius: 16 },
            },
          ),
          chipNumber(
            `d_ariach_closing_n${i + 1}`,
            at(col(8) + PAD, top + 32, 48, 48),
            i + 1,
            token('accent'),
          ),
        ]),
        ...tile('d_ariach_closing_contact', at(48, prow(4), span(8), pspan(2)), 'white'),
        mark('d_ariach_closing_mark', at(96, 768, 72, 72)),
        arrow('d_ariach_closing_arrow', at(1080, 776, 104, 104), '#3d3bf3'),
        ...tile('d_ariach_closing_ink', at(col(8), prow(4), span(4), pspan(2)), 'ink'),
        ring(
          'd_ariach_closing_ring',
          at(col(8) + 176, prow(4) + 36, 240, 240),
          1,
          '#c8f04b',
          '#ffffff',
          26,
        ),
        drawing(
          'd_ariach_closing_check',
          at(col(8) + 246, prow(4) + 106, 100, 100),
          svg(48, 48, GLYPHS.check),
          PAINT,
        ),
      ],
    },
  ];
}

/** Drawings that read the same way in both directions: the mirror turns their box, not them. */
const UNTURNED = new Set(['d_ariach_comparison_check_glyph', 'd_ariach_closing_check']);

/**
 * The layouts the mirror gets wrong for a left-to-right deck: the quote, whose mark is a glyph
 * of the direction, and the two slides with a check mark, which is not mirrored either. The
 * grounds are plain colours, and the other drawings turn with their boxes.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  return drawn
    .filter((layout) =>
      ['l_ariach_quote', 'l_ariach_comparison', 'l_ariach_closing'].includes(layout.id),
    )
    .map((layout) => {
      const mirrored = mirrorLayout(layout);
      return {
        ...mirrored,
        decorations: mirrored.decorations.map((decoration) => {
          if (decoration.id === 'd_ariach_quote_glyph') {
            return quoteGlyph(decoration.frame, QUOTE_LTR);
          }
          if (UNTURNED.has(decoration.id)) {
            const { flipH: _, ...unturned } = decoration;
            return unturned;
          }
          return decoration;
        }),
      };
    });
}

// ---------------------------------------------------------------------------------------------
// The sample: the year in review of an invented home-robotics company, slide by slide

const FOOTER_HE = text('ORBI · סיכום 2026');
const FOOTER_EN = text('ORBI · 2026 in review');
const QUARTERS = [
  'Q1 2025',
  'Q2 2025',
  'Q3 2025',
  'Q4 2025',
  'Q1 2026',
  'Q2 2026',
  'Q3 2026',
  'Q4 2026',
];
const ROBOTS = [18, 22, 27, 41, 38, 46, 58, 72];
const SUBSCRIPTIONS = [6, 9, 14, 22, 30, 41, 56, 84];
const TABLE_COLS = [628, 366, 366, 368];
const TABLE_ROW = 64;
const TEAM = [
  { assetId: pictures.ariachTeam1.id },
  { assetId: pictures.ariachTeam2.id },
  { assetId: pictures.ariachTeam3.id },
  { assetId: pictures.ariachTeam4.id },
];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_ariach_hero',
    name: 'פתיחה',
    content: {
      caption: [
        text('YEAR IN REVIEW · 2026'),
        text('מפגש עובדים ומשקיעים · תל אביב · 14 בינואר 2027'),
      ],
      title: text('שנה של', 'בית שקט'),
      subtitle: text('Orbi · מה השקנו, כמה גדלנו, ומה מחכה לנו ב-2027'),
    },
  },
  {
    layout: 'l_ariach_section',
    name: 'במספרים',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('השנה במספרים'),
      subtitle: text('כמה בתים הצטרפו, כמה רובוטים יצאו מהמפעל, וכמה זמן החזרנו לאנשים.'),
    },
  },
  {
    layout: 'l_ariach_big_number',
    name: 'בתים',
    content: {
      caption: [
        text('HOMES'),
        text('דירוג ממוצע בחנויות האפליקציות'),
        text('דקות נחסכות לכל בית, בכל יום'),
        text('מהלקוחות ממשיכים לשנה שנייה'),
      ],
      title: text('יותר בתים מכל שנה קודמת'),
      number: [text('1.2M'), text('4.8'), text('38'), text('92%')],
      subtitle: text('בתים מפעילים את Orbi בסוף 2026'),
      body: text(
        'פי 2.4 מסוף 2025. רוב הגידול הגיע מהמלצות של חברים, ושני שלישים מהבתים החדשים קנו גם רובוט.',
      ),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_ariach_cards',
    name: 'שלוש השקות',
    content: {
      caption: [
        text('LAUNCHES'),
        text('BASE · הרובוט'),
        text('HOME 3 · האפליקציה'),
        text('AIR · החיישן'),
      ],
      title: text('שלוש השקות, בית אחד'),
      subtitle: [
        text('מנקה, מסדר ומחזיר למקום'),
        text('כל הבית במסך אחד'),
        text('יודע מתי לפתוח חלון'),
      ],
      body: [
        text('מפנה את הרצפה ומחזיר כל דבר למקומו, בזמן שאתם בחוץ.'),
        text('תאורה, מיזוג והרובוט בלוח אחד שלומד אתכם.'),
        text('מודד אבק, לחות ו-CO₂ בכל חדר.'),
        text('שלושתם עובדים יחד מהיום הראשון.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_ariach_text_image',
    name: 'הרובוט',
    content: {
      caption: text('ORBI BASE'),
      title: text('הרובוט שנכנס הביתה בשקט'),
      image: { assetId: pictures.ariachRobot.id },
      subtitle: [text('לומד את הבית בלילה אחד'), text('שקט יותר ממקרר'), text('סוללה ליום שלם')],
      body: [
        text('בסיבוב הראשון הוא ממפה כל חדר, וכבר למחרת יודע איפה הנעליים ואיפה הצעצועים.'),
        text('38 דציבל בעבודה מלאה. אפשר להפעיל אותו גם כשהתינוק ישן.'),
        text('תשע שעות על טעינה אחת, והוא חוזר לעמדה לבד לפני שהסוללה נגמרת.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_ariach_chart',
    name: 'צמיחה',
    content: {
      caption: [text('GROWTH'), text('באלפים, לפי רבעון. מקור: נתוני המכירות והמנויים של Orbi.')],
      title: text('המנויים עקפו את המכירות'),
      number: [text('×2.4'), text('46%')],
      body: [text('בתים פעילים לעומת סוף 2025.'), text('מההכנסות מגיעות כבר ממנויים.')],
      footer: FOOTER_HE,
    },
    chart: {
      chartType: 'column',
      title: 'רובוטים שנמכרו ומנויים חדשים, באלפים',
      data: {
        categories: QUARTERS,
        series: [
          { name: 'רובוטים', values: ROBOTS },
          { name: 'מנויים', values: SUBSCRIPTIONS },
        ],
      },
    },
  },
  {
    layout: 'l_ariach_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('HOME 3'), text('עד עכשיו · Home 2'), text('מעכשיו · Home 3')],
      title: text('מה השתנה באפליקציה'),
      subtitle: [text('שלט רחוק לכל מכשיר'), text('בית שמכיר את ההרגלים שלכם')],
      body: [
        bullets('מסך נפרד לכל מכשיר', 'כל תרחיש נבנה ביד', 'התראות על כל דבר'),
        bullets('לוח אחד לכל הבית', 'תרחישים שנבנים לבד מההרגלים', 'התראה רק כשבאמת צריך אתכם'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_ariach_table',
    name: 'המוצרים',
    content: {
      caption: [
        text('THE LINEUP'),
        text('מחירים לצרכן כולל מע״מ. המנוי כלול בשנה הראשונה בכל רכישה של רובוט.'),
      ],
      title: text('שלושה מוצרים, מנוי אחד'),
      footer: FOOTER_HE,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['', 'Base', 'Base Pro', 'Air'],
        ['מחיר', '₪2,490', '₪3,890', '₪390'],
        ['שטח עבודה', 'עד 90 מ״ר', 'עד 200 מ״ר', 'חדר אחד'],
        ['סוללה', '9 שעות', '14 שעות', 'שנתיים'],
        ['רעש בעבודה', '38 דציבל', '35 דציבל', '—'],
        ['אוסף חפצים', 'עד 1 ק״ג', 'עד 3 ק״ג', '—'],
        ['חיישנים', '6', '11', '4'],
        ['אחריות', 'שנתיים', '3 שנים', 'שנתיים'],
        ['מנוי Home 3', '₪29 לחודש', 'כלול', '₪9 לחודש'],
      ],
    },
  },
  {
    layout: 'l_ariach_process',
    name: 'התקנה',
    content: {
      caption: [
        text('SETUP'),
        text('מניחים את העמדה ליד שקע.'),
        text('סורקים את הקוד שעל הרובוט.'),
        text('הרובוט ממפה כל חדר לבד.'),
        text('מסמנים איפה לא להיכנס.'),
        text('הבית מסתדר, ואתם מאשרים.'),
      ],
      title: text('מהקופסה לבית מסודר בחמישה צעדים'),
      subtitle: [text('פותחים'), text('מחברים'), text('ממפים'), text('מגדירים'), text('נהנים')],
      number: [text('2 דק׳'), text('1 דק׳'), text('40 דק׳'), text('3 דק׳'), text('כל יום')],
      body: text('פחות משעה מהקופסה ועד בית שעובד, וכמעט כולה בלעדיכם.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_ariach_section',
    name: 'מה בדרך',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('מה בדרך'),
      subtitle: text('ארבע תחנות ב-2027, והאנשים שמובילים אותן.'),
    },
  },
  {
    layout: 'l_ariach_timeline',
    name: 'מפת דרכים',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text('התאריכים הם יעדים. עדכונים שוטפים יתפרסמו בקהילת המשתמשים של Orbi.'),
      ],
      title: text('ארבע תחנות בשנה הבאה'),
      number: [text('מרץ'), text('יוני'), text('ספט׳'), text('דצמ׳')],
      subtitle: [
        text('Base במטבח'),
        text('Home 3 בשעון'),
        text('Air לכל חדר'),
        text('Orbi באירופה'),
      ],
      body: [
        text('זרוע שמעמיסה את המדיח.'),
        text('כל הבית מהיד, בלי טלפון.'),
        text('חיישן ב-₪190, שנה על סוללה.'),
        text('קודם גרמניה והולנד.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_ariach_full_image',
    name: 'חדר הבקרה',
    content: {
      image: { assetId: pictures.ariachScene.id },
      caption: text('ORBI CARE · חיפה'),
      title: text('אנחנו רואים כל רובוט,', 'כדי שאתם לא תצטרכו'),
      body: text(
        'צוות של 24 אנשים עוקב אחרי 380 אלף רובוטים, ופותר 9 מכל 10 תקלות לפני שמישהו שם לב.',
      ),
    },
  },
  {
    layout: 'l_ariach_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'עם שלושה ילדים וכלב, הבית היה מבולגן תמיד. היום אני חוזרת מהעבודה, והרצפה פשוט ריקה. זה מרגיש כמו קסם קטן.',
      ),
      attribution: text('מיכל רוזן'),
      caption: text('אמא לשלושה מרמת גן · עם Orbi Base מאז מרץ 2026'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_ariach_team',
    name: 'הצוות',
    content: {
      caption: [
        text('THE TEAM'),
        text('מנכ״לית ומייסדת'),
        text('סמנכ״ל הנדסה'),
        text('ראש צוות המוצר'),
        text('סמנכ״ל תפעול'),
      ],
      title: text('האנשים שמאחורי Orbi'),
      image: TEAM,
      subtitle: [text('דנה אלמוג'), text('איתי שחר'), text('רוני ברק'), text('גיל אורן')],
      body: [
        text('הקימה את Orbi ב-2021, אחרי עשור ברובוטיקה תעשייתית.'),
        text('הוביל את Base מאב-טיפוס ראשון ועד פס הייצור.'),
        text('אחראית על Home 3, ועל כך שלא צריך מדריך.'),
        text('דואג שכל רובוט יגיע תוך 48 שעות.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_ariach_closing',
    name: 'סיום',
    content: {
      caption: [text('NEXT'), text('hello@orbi.example · orbi.example/2027')],
      title: text('נתראה', 'בבית'),
      body: [
        text('ההזמנות של Base Pro נפתחות ב-1 בפברואר'),
        text('המנוי ל-Home 3 חינם לכל לקוח עד סוף מרץ'),
        text('הדוח השנתי המלא יישלח במייל עד סוף החודש'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_ariach_hero',
    name: 'Cover',
    content: {
      caption: [
        text('YEAR IN REVIEW · 2026'),
        text('All hands and investors · Tel Aviv · 14 January 2027'),
      ],
      title: text('A year of', 'quiet homes'),
      subtitle: text('Orbi · what we shipped, and what comes next'),
    },
  },
  {
    layout: 'l_ariach_section',
    name: 'In numbers',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('In numbers'),
      subtitle: text(
        'How many homes joined, how many robots left the line, and how much time we gave back.',
      ),
    },
  },
  {
    layout: 'l_ariach_big_number',
    name: 'Homes',
    content: {
      caption: [
        text('HOMES'),
        text('average rating in the app stores'),
        text('minutes saved for every home, every day'),
        text('of customers renew for a second year'),
      ],
      title: text('More homes than ever'),
      number: [text('1.2M'), text('4.8'), text('38'), text('92%')],
      subtitle: text('homes run Orbi at the end of 2026'),
      body: text(
        '2.4 times the end of 2025, mostly through friends’ recommendations. Two in three new homes also bought a robot.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_ariach_cards',
    name: 'Three launches',
    content: {
      caption: [
        text('LAUNCHES'),
        text('BASE · The robot'),
        text('HOME 3 · The app'),
        text('AIR · The sensor'),
      ],
      title: text('Three launches, one home'),
      subtitle: [
        text('Tidies up for you'),
        text('One screen, whole home'),
        text('Knows when to air'),
      ],
      body: [
        text('Clears the floor while you are out.'),
        text('Lights, air and the robot on one board.'),
        text('Tracks dust, humidity and CO₂.'),
        text('All three work together from day one.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_ariach_text_image',
    name: 'The robot',
    content: {
      caption: text('ORBI BASE'),
      title: text('A robot that moves in quietly'),
      image: { assetId: pictures.ariachRobot.id },
      subtitle: [
        text('Learns the home in one night'),
        text('Quieter than a fridge'),
        text('A battery for a whole day'),
      ],
      body: [
        text('It maps every room on its first round.'),
        text('38 dB at full work, quiet enough for a nap.'),
        text('Nine hours a charge, then back to its dock.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_ariach_chart',
    name: 'Growth',
    content: {
      caption: [
        text('GROWTH'),
        text('In thousands, by quarter. Source: Orbi sales and subscription data.'),
      ],
      title: text('Subscriptions overtook sales'),
      number: [text('×2.4'), text('46%')],
      body: [
        text('active homes against the end of 2025.'),
        text('of revenue now comes from subscriptions.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Robots sold and new subscriptions, thousands',
      data: {
        categories: QUARTERS,
        series: [
          { name: 'Robots', values: ROBOTS },
          { name: 'Subscriptions', values: SUBSCRIPTIONS },
        ],
      },
    },
  },
  {
    layout: 'l_ariach_comparison',
    name: 'Before and after',
    content: {
      caption: [text('HOME 3'), text('Until now · Home 2'), text('From now · Home 3')],
      title: text('What changed in the app'),
      subtitle: [text('A remote for every device'), text('A home that knows your habits')],
      body: [
        bullets(
          'A screen for each device',
          'Every routine built by hand',
          'An alert for everything',
        ),
        bullets(
          'One board for the whole home',
          'Routines that build themselves',
          'An alert only when it matters',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_ariach_table',
    name: 'The lineup',
    content: {
      caption: [
        text('THE LINEUP'),
        text(
          'Retail prices including VAT. The subscription is free for the first year with any robot.',
        ),
      ],
      title: text('Three products, one subscription'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['', 'Base', 'Base Pro', 'Air'],
        ['Price', '₪2,490', '₪3,890', '₪390'],
        ['Area covered', 'Up to 90 m²', 'Up to 200 m²', 'One room'],
        ['Battery', '9 hours', '14 hours', 'Two years'],
        ['Noise at work', '38 dB', '35 dB', '—'],
        ['Picks up objects', 'Up to 1 kg', 'Up to 3 kg', '—'],
        ['Sensors', '6', '11', '4'],
        ['Warranty', 'Two years', 'Three years', 'Two years'],
        ['Home 3 plan', '₪29 a month', 'Included', '₪9 a month'],
      ],
    },
  },
  {
    layout: 'l_ariach_process',
    name: 'Setup',
    content: {
      caption: [
        text('SETUP'),
        text('Dock by a socket.'),
        text('Scan the robot.'),
        text('It maps each room.'),
        text('Mark no-go zones.'),
        text('Then it tidies.'),
      ],
      title: text('From the box to a tidy home in five steps'),
      subtitle: [text('Unbox'), text('Connect'), text('Map'), text('Set limits'), text('Enjoy')],
      number: [text('2 min'), text('1 min'), text('40 min'), text('3 min'), text('Daily')],
      body: text('Under an hour from box to a working home.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_ariach_section',
    name: 'What’s next',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('What’s next'),
      subtitle: text('Four stops in 2027, and the people who lead them.'),
    },
  },
  {
    layout: 'l_ariach_timeline',
    name: 'Roadmap',
    content: {
      caption: [text('ROADMAP 2027'), text('Dates are targets, not promises.')],
      title: text('Four stops next year'),
      number: [text('Mar'), text('Jun'), text('Sep'), text('Dec')],
      subtitle: [
        text('Base in the kitchen'),
        text('Home 3 on the watch'),
        text('Air in every room'),
        text('Orbi in Europe'),
      ],
      body: [
        text('An arm that loads the dishwasher.'),
        text('The whole home from your wrist.'),
        text('A ₪190 sensor, a year per battery.'),
        text('Germany and the Netherlands first.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_ariach_full_image',
    name: 'Control room',
    content: {
      image: { assetId: pictures.ariachScene.id },
      caption: text('ORBI CARE · HAIFA'),
      title: text('We watch every robot,', 'so you don’t have to'),
      body: text(
        'A team of 24 follows 380 thousand robots, and fixes 9 faults in 10 before anyone notices.',
      ),
    },
  },
  {
    layout: 'l_ariach_quote',
    name: 'Quote',
    content: {
      quote: text(
        'With three kids and a dog, the house was always a mess. Now I come home from work and the floor is simply clear. It feels like a small magic trick.',
      ),
      attribution: text('Michal Rosen'),
      caption: text('Mother of three in Ramat Gan · with Orbi Base since March 2026'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_ariach_team',
    name: 'The team',
    content: {
      caption: [
        text('THE TEAM'),
        text('Chief executive, founder'),
        text('VP engineering'),
        text('Head of product'),
        text('VP operations'),
      ],
      title: text('The people behind Orbi'),
      image: TEAM,
      subtitle: [text('Dana Almog'), text('Itai Shahar'), text('Roni Barak'), text('Gil Oren')],
      body: [
        text('Founded Orbi in 2021, after a decade of industrial robots.'),
        text('Took Base from prototype to production line.'),
        text('Runs Home 3, and keeps it manual-free.'),
        text('Gets every robot to you within 48 hours.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_ariach_closing',
    name: 'Closing',
    content: {
      caption: [text('NEXT'), text('hello@orbi.example · orbi.example/2027')],
      title: text('See you', 'at home'),
      body: [
        text('Base Pro orders open on 1 February'),
        text('Home 3 is free for every customer until March'),
        text('The full annual report goes out by email this month'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const ariachSamples = { he: sampleHe, en: sampleEn };

/** The Ariach template: the theme, fourteen layouts for both directions, and its sample deck. */
export function ariachTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(ariachTheme),
    description:
      'Bento: unequal round tiles in white, lime, ink and ultramarine, for recaps and launches.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.ariachRobot,
      pictures.ariachScene,
      pictures.ariachTeam1,
      pictures.ariachTeam2,
      pictures.ariachTeam3,
      pictures.ariachTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
