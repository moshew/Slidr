import type { Element, Fill, Frame, Layout, Theme } from '@slidr/model';
import { copyJson } from '../json';
import { mirrorLayout } from '../mirror';
import type { Template } from '../template';
import {
  assetTable,
  at,
  atEnd,
  bullets,
  dot,
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
 * Nof: the calm template. A ground of mist, panels in pale tints of sage, blue-grey and sand with
 * wide round corners and no borders, and a landscape drawn in thin lines: a ridge, a low sun,
 * the rings around it. One deep forest tone carries the text. Headings are a serif set at a
 * regular weight, the body a humanist sans.
 *
 * It has no reference deck: it was drawn as a template from the start, so the frames here are
 * the source. The heading font is one family for both scripts, so a figure beside Hebrew is
 * drawn by the same hand; so is the body font.
 */
export const nofTheme: Theme = {
  id: 'nof',
  name: 'Nof',
  colors: {
    bg: '#eef2ee',
    surface: '#f9faf7',
    text: '#1e3832',
    muted: '#465a53',
    primary: '#4a6e60',
    secondary: '#506c82',
    accent: '#c8ae84',
    chart: ['#4a6e60', '#6b8aa1', '#c8ae84', '#9db8a6', '#1e3832', '#b9c7d2'],
  },
  fonts: {
    heading: { he: 'Noto Serif Hebrew', latin: 'Noto Serif Hebrew' },
    body: { he: 'Assistant', latin: 'Assistant' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 112,
      weight: 400,
      lineHeight: 1.12,
      color: { token: 'text' },
    },
    title: { font: 'heading', size: 64, weight: 400, lineHeight: 1.18, color: { token: 'text' } },
    heading: { font: 'heading', size: 40, weight: 500, lineHeight: 1.25, color: { token: 'text' } },
    body: { font: 'body', size: 30, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 28,
  shadow: { x: 0, y: 10, blur: 30, color: { value: '#1e3832', alpha: 0.07 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    { fill: { kind: 'solid', color: { token: 'surface' } } },
    { fill: { kind: 'solid', color: { token: 'primary' } } },
    { fill: { kind: 'solid', color: { token: 'secondary' } } },
  ],
};

// ---------------------------------------------------------------------------------------------
// The sheet: margins of 96, a head of two lines, and the content under it

const M = 96;
const W = 1728;
/** Where the content of a slide begins, under a title of two lines. */
const ZONE = 300;
/** How far text stands inside a panel, and the line over a title inside the margin. */
const INSET = 56;

// ---------------------------------------------------------------------------------------------
// What the layouts share

const sage = (alpha: number) => solid(token('primary', alpha));
const SAGE = sage(0.13);
const MIST = solid(token('secondary', 0.14));
const SAND = solid(token('accent', 0.26));
const WHITE = solid(token('surface'));
/** The low sun: a disc of sand, pale enough for the text colour to read on it. */
const SUN = solid(token('accent', 0.5));

/** The literal colours of the drawings, and the tokens they stand for. */
const GREEN = '#4a6e60';
const BLUE = '#506c82';
const SAND_HEX = '#c8ae84';
const PAINT = {
  [GREEN]: token('primary'),
  [BLUE]: token('secondary'),
  [SAND_HEX]: token('accent'),
  '#1e3832': token('text'),
  '#eef2ee': token('bg'),
};

/** A soft panel: a tint, wide round corners, no border and no shadow. */
const panel = (id: string, frame: Frame, fill: Fill, radius = 32) =>
  rect(id, frame, fill, { effects: { radius } });

const MARK =
  '<svg viewBox="0 0 40 40"><circle cx="28" cy="12" r="8" fill="#c8ae84"/><path fill="#4a6e60" d="M1 37C7 35 10 19 17 19S25 29 29 32 35 36 39 37Z"/></svg>';

/** The mark of the template: a hill and the sun over its shoulder. A deck replaces it with its logo. */
const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

const DAWN =
  '<svg viewBox="0 0 40 22"><path fill="#c8ae84" d="M9 18a11 11 0 0 1 22 0z"/><path fill="none" stroke="#4a6e60" stroke-width="2" stroke-linecap="round" d="M1 19h38"/></svg>';

/** What opens the line over a title: the sun on the horizon. */
const dawn = (id: string, top = 86) => drawing(id, at(M, top, 40, 22), DAWN, PAINT);

/** An arrow from one side of a comparison to the other, drawn for a right-to-left slide. */
const ARROW =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#4a6e60" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';

/** The quotation mark of each direction. They are two marks, not one mark and its mirror. */
const QUOTE_RTL =
  '<svg viewBox="0 0 62 46"><path fill="#4a6e60" d="M14 2a12 12 0 0 1 12 12c0 13-7 24-19 30l-3-5c6-4 10-9 11-14a12 12 0 0 1-1-23zM48 2a12 12 0 0 1 12 12c0 13-7 24-19 30l-3-5c6-4 10-9 11-14a12 12 0 0 1-1-23z"/></svg>';
const QUOTE_LTR =
  '<svg viewBox="0 0 62 46"><path fill="#4a6e60" d="M14 44a12 12 0 0 1-12-12c0-13 7-24 19-30l3 5c-6 4-10 9-11 14a12 12 0 0 1 1 23zM48 44a12 12 0 0 1-12-12c0-13 7-24 19-30l3 5c-6 4-10 9-11 14a12 12 0 0 1 1 23z"/></svg>';

const quoteGlyph = (frame: Frame, markup: string) =>
  drawing('d_nof_quote_glyph', frame, markup, PAINT);

/** The line over a title and the title itself, with room for two lines. */
const head = (width = W) => [
  place('p_kicker', 'caption', at(M + INSET, 80, Math.min(900, width - INSET), 34), 'caption'),
  place('p_title', 'title', at(M, 120, width, 152), 'title'),
];

/**
 * What frames a content slide besides its head: the sun on the horizon before the line over the
 * title, and the foot. The foot has no rule: the mark stands alone at the start, which leaves a
 * logo of any width room to replace it, and at the end is the deck's name with the slide's number
 * beyond it. The footer, the mark and the number are set here and nowhere else.
 */
function frameOf(
  name: string,
  width = W,
  kicker = true,
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  return {
    placeholders: [
      place('p_footer', 'footer', at(M + width - 900, 956, 820, 34), 'caption', { align: 'end' }),
    ],
    decorations: [
      ...(kicker ? [dawn(`d_nof_${name}_dawn`)] : []),
      mark(`d_nof_${name}_mark`, at(M, 950, 40, 40)),
      pageNumber(`d_nof_${name}_number`, at(M + width - 60, 956, 60, 34)),
    ],
  };
}

/**
 * A number the layout sets by itself, in a disc. A figure alone takes the direction of the deck
 * (`auto`) and sits in the middle of its disc, so it is in place in both directions.
 */
const numeral = (id: string, frame: Frame, n: number) =>
  label(id, frame, String(n), 'caption', {
    color: token('text'),
    weight: 600,
    dir: 'auto',
    align: 'center',
    vAlign: 'middle',
  });

// ---------------------------------------------------------------------------------------------
// The landscape: ridges, the ground under them, and the rings of the sun

type Point = readonly [number, number];

/** A smooth line through points, level at each of them: the outline of rolling ground. */
function ridge(points: readonly Point[]): string {
  let d = '';
  let from: Point | undefined;
  for (const [x, y] of points) {
    if (from) {
      const mid = (from[0] + x) / 2;
      d += `C${mid} ${from[1]} ${mid} ${y} ${x} ${y}`;
    } else d = `M${x} ${y}`;
    from = [x, y];
  }
  return d;
}

/** Heights set at even steps across a width. */
const across = (w: number, heights: readonly number[]): Point[] =>
  heights.map((y, i) => [Math.round((i * w) / (heights.length - 1)), y]);

const stroke = (d: string, color: string, opacity: number) =>
  `<path fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1.5" d="${d}"/>`;

/** Contour lines under a ridge: the same line again, lower and flatter each time. */
function contours(w: number, heights: readonly number[], drops: readonly number[]): string {
  const mean = heights.reduce((sum, y) => sum + y, 0) / heights.length;
  return drops
    .map((drop, i) => {
      const flat = 1 - 0.25 * (i + 1);
      const lower = heights.map((y) => Math.round(mean + (y - mean) * flat + drop));
      return stroke(ridge(across(w, lower)), GREEN, 0.3);
    })
    .join('');
}

interface Rise {
  /** The height of the ridge, from the top of the drawing, at even steps from left to right. */
  heights: readonly number[];
  color: string;
  tint: number;
}

/**
 * The tints of the far ground and the near one where text may stand on both: together they are
 * still pale enough for the caption colour (5.1:1).
 */
const FAR = { tint: 0.07 };
const NEAR = { tint: 0.12 };

/**
 * Ground in layers, far to near: each a ridge with a tint under it down to the foot of the
 * drawing. The numbers are physical, for a right-to-left slide; the mirror turns the drawing.
 */
function ground(id: string, frame: Frame, rises: readonly Rise[], over = '', under = ''): Element {
  const { w, h } = frame;
  const layers = rises
    .map(({ heights, color, tint }) => {
      const top = ridge(across(w, heights));
      return (
        `<path fill="${color}" fill-opacity="${tint}" d="${top}L${w} ${h}L0 ${h}Z"/>` +
        stroke(top, color, 0.45)
      );
    })
    .join('');
  return drawing(id, frame, `<svg viewBox="0 0 ${w} ${h}">${under}${layers}${over}</svg>`, PAINT);
}

/** The foot of a panel: a ridge and one contour under it, between the panel's round corners. */
function foot(id: string, frame: Frame, color: string): Element {
  const { w, h } = frame;
  const heights = [h - 70, h - 88, h - 60, h - 80, h - 66];
  const lower = heights.map((y, i) => y + 26 - (i % 2) * 6);
  return drawing(
    id,
    frame,
    `<svg viewBox="0 0 ${w} ${h}">${stroke(ridge(across(w, heights)), color, 0.5)}${stroke(ridge(across(w, lower)), color, 0.3)}</svg>`,
    PAINT,
  );
}

/** Thin rings around a centre, cut by the frame they are drawn in. */
function rings(id: string, cx: number, cy: number, radii: readonly number[]): Element {
  const r = Math.max(...radii) + 2;
  const circles = radii
    .map(
      (radius) =>
        `<circle cx="${r}" cy="${r}" r="${radius}" fill="none" stroke="${GREEN}" stroke-opacity="0.3" stroke-width="1.5"/>`,
    )
    .join('');
  return drawing(
    id,
    { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r },
    `<svg viewBox="0 0 ${2 * r} ${2 * r}">${circles}</svg>`,
    PAINT,
  );
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const columns4 = [96, 540, 984, 1428];
const COLUMN = 396;
const cards3 = [96, 688, 1280];
const CARD = 544;
const steps5 = [96, 446, 796, 1146, 1496];
const STEP = 328;
/** The rows of the text beside a picture, and the lines of the closing slide. */
const rows3 = [ZONE, ZONE + 206, ZONE + 412];
const lines3 = [440, 540, 640];
/** The three figures beside the big number, and the two beside a chart. */
const STATS = M + 1064 + 32;
const stats3 = [ZONE, ZONE + 214, ZONE + 428];
const FACTS = M + 1128 + 32;
const facts2 = [ZONE, ZONE + 276];

/**
 * The window of the opening slide: a picture, and under it a drawn view for a deck with none.
 * The sky of the drawn view is a pale pane, so the sun that rises over the window shows whole.
 */
const WINDOW = atEnd(0, 236, 672, 590);
const SKY = `<rect width="672" height="590" fill="${BLUE}" fill-opacity="0.12"/>`;

/** The trail of the timeline: where it passes each column, and where its drawing begins. */
const TRAIL = [470, 432, 452, 408] as const;
const TRAIL_TOP = 340;
const UNDER_TRAIL = 516;

function trail(id: string): Element {
  const h = 1080 - TRAIL_TOP;
  // Physical x of a right-to-left slide: the first mark is at the right.
  const marks = columns4.map((start, i): Point => [1920 - start - 10, (TRAIL[i] ?? 0) - TRAIL_TOP]);
  // The ridge is drawn from the right, so the ground under it closes by the left corner.
  const top = ridge([[1920, 150], ...marks, [0, 50]]);
  const posts = marks
    .map(
      ([x, y]) =>
        stroke(`M${x} ${y + 14}V${UNDER_TRAIL - TRAIL_TOP - 12}`, GREEN, 0.45) +
        `<circle cx="${x}" cy="${y}" r="10" fill="#eef2ee" stroke="${GREEN}" stroke-width="2.5"/>` +
        `<circle cx="${x}" cy="${y}" r="4" fill="${GREEN}"/>`,
    )
    .join('');
  const markup =
    `<svg viewBox="0 0 1920 ${h}">` +
    `<path fill="${GREEN}" fill-opacity="0.13" d="${top}L0 ${h}L1920 ${h}Z"/>` +
    `<path fill="none" stroke="${GREEN}" stroke-width="2" d="${top}"/>` +
    `${posts}</svg>`;
  return drawing(id, { x: 0, y: TRAIL_TOP, w: 1920, h }, markup, PAINT);
}

/** The stream of the process: a slow wave that passes through the disc of every step. */
function stream(id: string, top: number): Element {
  // Physical x inside the drawing: the first disc is at the right, the wave turns between discs.
  const wave = ridge([
    [1674, 26],
    [1499, 8],
    [1149, 44],
    [799, 8],
    [449, 44],
    [274, 26],
  ]);
  return drawing(
    id,
    at(M, top, W, 52),
    `<svg viewBox="0 0 ${W} 52">${stroke(wave, GREEN, 0.6)}</svg>`,
    PAINT,
  );
}

function layouts(): Layout[] {
  return [
    {
      id: 'l_nof_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        place('p_kicker', 'caption', at(M + INSET, 236, 900, 34), 'caption'),
        place('p_title', 'title', at(M, 278, 1056, 252), 'display'),
        place('p_subtitle', 'subtitle', at(M, 548, 1056, 150), 'heading'),
        place('p_meta', 'caption', at(M, 948, 1056, 34), 'caption'),
        // A window on the view, across the horizon: sky behind its top, the ground at its foot.
        place('p_image', 'image', WINDOW),
      ],
      decorations: [
        ground(
          'd_nof_hero_land',
          atEnd(0, 720, 1920, 360),
          [
            { heights: [60, 30, 76, 40, 90, 54, 80], color: BLUE, ...FAR },
            { heights: [156, 120, 166, 128, 180, 146, 170], color: GREEN, ...NEAR },
          ],
          // Two contours, one over the line at the foot of the slide and one under it.
          contours(1920, [156, 120, 166, 128, 180, 146, 170], [44, 132]),
        ),
        // The sun rises over the window; in the window, for a deck that brings no picture, the
        // view is drawn.
        dot('d_nof_hero_sun', atEnd(226, 126, 220, 220), SUN),
        ground(
          'd_nof_hero_view',
          WINDOW,
          [
            { heights: [350, 316, 372, 330], color: BLUE, tint: 0.16 },
            { heights: [436, 400, 456, 416], color: GREEN, tint: 0.18 },
            { heights: [520, 492, 540, 504], color: GREEN, tint: 0.24 },
          ],
          '',
          SKY,
        ),
        mark('d_nof_hero_mark', at(M, 80, 48, 48)),
        dawn('d_nof_hero_dawn', 242),
      ],
    },
    {
      id: 'l_nof_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        // The number of the part stands in the sun.
        place('p_number', 'number', atEnd(216, 280, 320, 320), 'display', {
          align: 'center',
          vAlign: 'middle',
        }),
        // The line over the title is where every slide has it; the title sits on what it
        // promises, whether it takes one line or two.
        place('p_kicker', 'caption', at(M + INSET, 80, 900, 34), 'caption'),
        place('p_title', 'title', at(M, 250, 1100, 252), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(M, 530, 1000, 150), 'heading'),
      ],
      decorations: [
        ground('d_nof_section_land', atEnd(0, 760, 1920, 320), [
          { heights: [60, 30, 84, 50, 110, 86, 120], color: BLUE, ...FAR },
          { heights: [150, 120, 170, 140, 196, 176, 210], color: GREEN, ...NEAR },
        ]),
        rings('d_nof_section_rings', 376, 440, [190, 220, 250]),
        dot('d_nof_section_sun', atEnd(216, 280, 320, 320), SUN),
        dawn('d_nof_section_dawn'),
      ],
    },
    {
      id: 'l_nof_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head(),
        place('p_number', 'number', at(M + INSET, ZONE + 48, 952, 126), 'display'),
        place('p_label', 'subtitle', at(M + INSET, ZONE + 190, 952, 100), 'heading'),
        place('p_body', 'body', at(M + INSET, ZONE + 306, 900, 180), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', at(STATS + 36, top + 22, 560, 76), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', at(STATS + 36, top + 102, 560, 68), 'caption'),
        ]),
        ...frameOf('big_number').placeholders,
      ],
      decorations: [
        // The number has a wide panel of its own, with the ground drawn along its foot.
        panel('d_nof_big_number_panel', at(M, ZONE, 1064, 620), SAGE),
        drawing(
          'd_nof_big_number_lines',
          at(M, ZONE + 450, 1064, 170),
          `<svg viewBox="0 0 1064 170">${stroke(ridge(across(1064, [60, 34, 70, 44, 64])), GREEN, 0.45)}${contours(1064, [60, 34, 70, 44, 64], [34, 68])}</svg>`,
          PAINT,
        ),
        ...stats3.map((top, i) =>
          panel(`d_nof_big_number_stat${i + 1}`, at(STATS, top, 632, 192), WHITE, 28),
        ),
        ...frameOf('big_number').decorations,
      ],
    },
    {
      id: 'l_nof_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(M + 168, 300, 1392, 380), 'title', {
          align: 'center',
          vAlign: 'middle',
        }),
        place('p_attribution', 'attribution', at(M + 168, 712, 1392, 50), 'heading', {
          align: 'center',
        }),
        place('p_caption', 'caption', at(M + 168, 770, 1392, 68), 'caption', { align: 'center' }),
        ...frameOf('quote', W, false).placeholders,
      ],
      decorations: [
        // The mark stands in the sun, over the middle of the words.
        rings('d_nof_quote_rings', 960, 170, [92, 128]),
        dot('d_nof_quote_sun', { x: 904, y: 114, w: 112, h: 112 }, SUN),
        quoteGlyph({ x: 935, y: 152, w: 50, h: 37 }, QUOTE_RTL),
        ...frameOf('quote', W, false).decorations,
      ],
    },
    {
      id: 'l_nof_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head(1040),
        // The picture runs off three edges of the slide, so only one of its edges is a line.
        place('p_image', 'image', atEnd(0, 0, 688, 1080)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(M + 84, top + 3, 956, 50), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(M + 84, top + 58, 956, 136), 'body'),
        ]),
        ...frameOf('text_image', 1040).placeholders,
      ],
      decorations: [
        ...rows3.flatMap((top, i) => [
          dot(`d_nof_text_image_disc${i + 1}`, at(M, top, 56, 56), SUN),
          numeral(`d_nof_text_image_n${i + 1}`, at(M, top, 56, 56), i + 1),
        ]),
        ...frameOf('text_image', 1040).decorations,
      ],
    },
    {
      id: 'l_nof_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture runs from edge to edge; the text has the ground under it, because nothing
        // of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 640)),
        place('p_kicker', 'caption', at(M + INSET, 690, 900, 34), 'caption'),
        place('p_title', 'title', at(M, 732, 1010, 152), 'title'),
        place('p_body', 'body', atEnd(M, 736, 600, 225), 'body'),
      ],
      decorations: [
        ground('d_nof_full_image_land', atEnd(0, 930, 1920, 150), [
          { heights: [70, 44, 80, 50, 90, 64, 96], color: GREEN, tint: 0.12 },
        ]),
        dawn('d_nof_full_image_dawn', 696),
      ],
    },
    {
      id: 'l_nof_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head(),
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}`, 'subtitle', at(start + 44, ZONE + 110, 456, 100), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_card${i + 1}_body`, 'body', at(start + 44, ZONE + 224, 456, 225), 'body'),
          place(`p_card${i + 1}_note`, 'caption', at(start + 44, ZONE + 36, 412, 68), 'caption'),
        ]),
        place('p_takeaway', 'body', at(M + 44, 815, W - 88, 90), 'body', { vAlign: 'middle' }),
        ...frameOf('cards').placeholders,
      ],
      decorations: [
        // A tint to a card, and a dot of its own colour in the corner.
        ...cards3.flatMap((start, i) => {
          const tone = (['primary', 'secondary', 'accent'] as const)[i] ?? 'primary';
          return [
            panel(
              `d_nof_cards_card${i + 1}`,
              at(start, ZONE, CARD, 490),
              [SAGE, MIST, SAND][i] ?? SAGE,
            ),
            dot(
              `d_nof_cards_dot${i + 1}`,
              at(start + CARD - 44 - 20, ZONE + 43, 20, 20),
              solid(token(tone, 0.7)),
            ),
            foot(
              `d_nof_cards_foot${i + 1}`,
              at(start, ZONE + 370, CARD, 120),
              [GREEN, BLUE, SAND_HEX][i] ?? GREEN,
            ),
          ];
        }),
        panel('d_nof_cards_takeaway', at(M, 812, W, 96), WHITE, 28),
        ...frameOf('cards').decorations,
      ],
    },
    {
      id: 'l_nof_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          // The date stands in the sky over its mark; what happens then is on the ground.
          place(`p_when${i + 1}`, 'number', at(start, (TRAIL[i] ?? 0) - 106, 372, 76), 'title', {
            vAlign: 'bottom',
          }),
          place(`p_what${i + 1}`, 'subtitle', at(start, UNDER_TRAIL, 372, 100), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start, UNDER_TRAIL + 106, 372, 170), 'caption'),
        ]),
        place('p_note', 'caption', at(M, 836, W, 68), 'caption'),
        ...frameOf('timeline').placeholders,
      ],
      decorations: [trail('d_nof_timeline_trail'), ...frameOf('timeline').decorations],
    },
    {
      id: 'l_nof_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start + 28, ZONE + 96, 272, 100), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_step${i + 1}_body`, 'caption', at(start + 28, ZONE + 204, 272, 170), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start + 28, ZONE + 390, 272, 76), 'title'),
        ]),
        place('p_summary', 'body', at(M, 816, W, 100), 'heading'),
        ...frameOf('process').placeholders,
      ],
      decorations: [
        // The panels deepen step by step, and one stream runs through their discs.
        ...steps5.map((start, i) =>
          panel(
            `d_nof_process_step${i + 1}`,
            at(start, ZONE, STEP, 486),
            sage(0.07 + 0.03 * i),
            28,
          ),
        ),
        stream('d_nof_process_stream', ZONE + 26),
        ...steps5.flatMap((start, i) => [
          dot(`d_nof_process_disc${i + 1}`, at(start + 28, ZONE + 26, 52, 52), WHITE),
          numeral(`d_nof_process_n${i + 1}`, at(start + 28, ZONE + 26, 52, 52), i + 1),
        ]),
        ...frameOf('process').decorations,
      ],
    },
    {
      id: 'l_nof_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head(),
        place('p_before_tag', 'caption', at(M + INSET, ZONE + 40, 728, 34), 'caption'),
        place('p_before', 'subtitle', at(M + INSET, ZONE + 84, 728, 100), 'heading'),
        place('p_before_body', 'body', at(M + INSET, ZONE + 206, 728, 370), 'body'),
        place('p_after_tag', 'caption', atEnd(M + INSET, ZONE + 40, 728, 34), 'caption'),
        place('p_after', 'subtitle', atEnd(M + INSET, ZONE + 84, 728, 100), 'heading'),
        place('p_after_body', 'body', atEnd(M + INSET, ZONE + 206, 728, 370), 'body'),
        ...frameOf('comparison').placeholders,
      ],
      decorations: [
        // What was stands on white; what came of it, on the tint. A disc of the ground joins them.
        panel('d_nof_comparison_before', at(M, ZONE, 840, 620), WHITE),
        panel('d_nof_comparison_after', atEnd(M, ZONE, 840, 620), sage(0.15)),
        foot('d_nof_comparison_foot1', at(M, ZONE + 500, 840, 120), GREEN),
        foot('d_nof_comparison_foot2', atEnd(M, ZONE + 500, 840, 120), GREEN),
        dot('d_nof_comparison_join', { x: 924, y: 574, w: 72, h: 72 }, solid(token('bg'))),
        drawing('d_nof_comparison_arrow', { x: 944, y: 594, w: 32, h: 32 }, ARROW, PAINT),
        ...frameOf('comparison').decorations,
      ],
    },
    {
      id: 'l_nof_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head(),
        place('p_chart', 'chart', at(M + 32, ZONE + 24, 1064, 572)),
        ...facts2.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', at(FACTS + 36, top + 24, 496, 76), 'title'),
          place(`p_stat${i + 1}_body`, 'body', at(FACTS + 36, top + 104, 496, 135), 'body'),
        ]),
        place('p_source', 'caption', at(FACTS, 850, 568, 68), 'caption'),
        ...frameOf('chart').placeholders,
      ],
      decorations: [
        panel('d_nof_chart_panel', at(M, ZONE, 1128, 620), WHITE),
        panel('d_nof_chart_stat1', at(FACTS, ZONE, 568, 258), SAGE, 28),
        panel('d_nof_chart_stat2', at(FACTS, ZONE + 276, 568, 258), SAND, 28),
        ...frameOf('chart').decorations,
      ],
    },
    {
      id: 'l_nof_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        place('p_kicker', 'caption', at(M + INSET, 80, 864, 34), 'caption'),
        place('p_title', 'title', at(M, 120, 920, 152), 'title'),
        place('p_table', 'table', at(M, 290, W, 630)),
        // The note ends the head, over the far end of the table: the table needs all the rest.
        place('p_note', 'caption', atEnd(M, 204, 760, 68), 'caption', {
          align: 'end',
          vAlign: 'bottom',
        }),
        ...frameOf('table').placeholders,
      ],
      decorations: frameOf('table').decorations,
    },
    {
      id: 'l_nof_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start, ZONE, COLUMN, 372)),
          place(`p_person${i + 1}`, 'subtitle', at(start, 692, COLUMN, 50), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start, 744, COLUMN, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start, 786, COLUMN, 102), 'caption'),
        ]),
        ...frameOf('team').placeholders,
      ],
      decorations: [
        // The people stand on the horizon: sky behind their heads, the ground under their names.
        ground('d_nof_team_land', atEnd(0, 480, 1920, 600), [
          { heights: [40, 12, 56, 20, 64, 28, 48], color: BLUE, tint: 0.05 },
          { heights: [96, 70, 112, 78, 120, 86, 104], color: GREEN, tint: 0.1 },
        ]),
        ...frameOf('team').decorations,
      ],
    },
    {
      id: 'l_nof_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(M + INSET, 110, 1000, 34), 'caption'),
        place('p_title', 'title', at(M, 152, 1180, 252), 'display', { vAlign: 'bottom' }),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(M + 40, top, 1088, 90), 'body', { vAlign: 'middle' }),
        ),
        place('p_contact', 'caption', at(M, 948, 1100, 34), 'caption'),
      ],
      decorations: [
        // The near ground rises towards the start, so the mark and the contact line stand on it.
        ground('d_nof_closing_land', atEnd(0, 740, 1920, 340), [
          { heights: [70, 40, 86, 50, 96, 60, 84], color: BLUE, ...FAR },
          { heights: [156, 120, 166, 128, 160, 122, 108], color: GREEN, ...NEAR },
        ]),
        rings('d_nof_closing_rings', 400, 400, [190, 230, 270]),
        dot('d_nof_closing_sun', atEnd(250, 250, 300, 300), SUN),
        dawn('d_nof_closing_dawn', 116),
        ...lines3.map((top, i) =>
          dot(`d_nof_closing_dot${i + 1}`, at(M, top + 38, 14, 14), solid(token('accent'))),
        ),
        mark('d_nof_closing_mark', at(M, 880, 48, 48)),
      ],
    },
  ];
}

/**
 * The layouts the mirror gets wrong for a left-to-right deck. Only the quote: its mark is a
 * glyph of the direction, and a mirrored closing mark is not an opening one.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  const quote = drawn.find((layout) => layout.id === 'l_nof_quote');
  if (!quote) return [];
  const mirrored = mirrorLayout(quote);
  return [
    {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) =>
        decoration.id === 'd_nof_quote_glyph'
          ? quoteGlyph(decoration.frame, QUOTE_LTR)
          : decoration,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: the year of a retreat house, slide by slide, on the layouts

const FOOTER = text('נוף · סיכום שנה 2026');
const SEASONS = ['חורף', 'אביב', 'קיץ', 'סתיו'];
const WEEKENDS = [1420, 1610, 1380, 1540];
const MIDWEEK = [860, 1240, 1310, 1650];
const TABLE_COLS = [560, 260, 280, 290, 338];
const TABLE_ROW = 78;

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_nof_hero',
    name: 'פתיחה',
    content: {
      caption: [text('סיכום שנה · 2026'), text('מוגש לשותפים ולתומכים · דצמבר 2026')],
      title: text('מקום', 'לנשום'),
      subtitle: text('נוף · בית ריטריט בגליל העליון'),
      image: { assetId: pictures.nofView2.id },
    },
  },
  {
    layout: 'l_nof_section',
    name: 'מבט לאחור',
    content: {
      number: text('01'),
      caption: text('חלק ראשון'),
      title: text('מבט לאחור'),
      subtitle: text('מי הגיע אלינו, כמה זמן נשאר, ומה לקח איתו הביתה.'),
    },
  },
  {
    layout: 'l_nof_big_number',
    name: 'האורחים',
    content: {
      caption: [
        text('האורחים'),
        text('ממליצים על נוף לחבר קרוב (NPS 71)'),
        text('לילות בממוצע לשהות אחת'),
        text('חזרו לשהות שנייה בתוך שנה'),
      ],
      title: text('שנה מלאה, בקצב איטי'),
      number: [text('3,840'), text('92%'), text('4.2'), text('38%')],
      subtitle: text('אורחים שהו בנוף ב-2026'),
      body: text(
        'גידול של 24% לעומת 2025, בלי להוסיף חדר אחד: פתחנו את אמצע השבוע לשהויות ארוכות, והתפוסה בימים האלה כמעט הוכפלה.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_nof_chart',
    name: 'לילות שהות',
    content: {
      caption: [text('לילות שהות'), text('מקור: מערכת ההזמנות של נוף, ינואר עד דצמבר 2026.')],
      title: text('אמצע השבוע מתמלא'),
      number: [text('+68%'), text('71%')],
      body: [text('לילות שהות באמצע השבוע, לעומת 2025.'), text('תפוסה ממוצעת לאורך השנה כולה.')],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'לילות שהות לפי עונה',
      data: {
        categories: SEASONS,
        series: [
          { name: 'סופי שבוע', values: WEEKENDS },
          { name: 'אמצע השבוע', values: MIDWEEK },
        ],
      },
    },
  },
  {
    layout: 'l_nof_table',
    name: 'התוכניות',
    content: {
      caption: [text('התוכניות'), text('שביעות הרצון נמדדת בשאלון ביום העזיבה, בסולם של 1 עד 5.')],
      title: text('מה הצענו השנה'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['תוכנית', 'משך', 'משתתפים', 'שביעות רצון', 'מחיר לאדם'],
        ['סוף שבוע של שקט', '2 לילות', '1,460', '4.7', '₪1,480'],
        ['נשימה באמצע השבוע', '4 לילות', '920', '4.8', '₪2,650'],
        ['שבוע של התחדשות', '6 לילות', '310', '4.9', '₪3,900'],
        ['ריטריט שתיקה', '5 לילות', '240', '4.8', '₪3,200'],
        ['הליכה ותנועה', '3 לילות', '520', '4.6', '₪1,950'],
        ['מנוחה לצוותים מטפלים', '2 לילות', '390', '4.9', 'במימון שותפים'],
        ['יום פתוח לקהילה', 'יום אחד', '1,100', '4.5', 'ללא תשלום'],
      ],
    },
  },
  {
    layout: 'l_nof_cards',
    name: 'שלוש שהויות',
    content: {
      caption: [
        text('השהויות'),
        text('סוף שבוע · 2 לילות'),
        text('אמצע שבוע · 4 לילות'),
        text('שבוע מלא · 6 לילות'),
      ],
      title: text('שלוש דרכים לעצור'),
      subtitle: [text('הפוגה'), text('נשימה'), text('התחדשות')],
      body: [
        text('יוצאים ביום חמישי וחוזרים במוצאי שבת. הליכה, אוכל טוב ושינה ארוכה.'),
        text('ארבעה לילות בלי מסכים: תרגול בוקר, שעות של שקט ושיחה עם מלווה.'),
        text('שבוע שלם בקבוצה קטנה. מגיעים עייפים, וחוזרים עם הרגלים חדשים.'),
        text('בכל השהויות: עד 14 אורחים, חדר פרטי ושלוש ארוחות מהגינה.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_nof_text_image',
    name: 'יום בנוף',
    content: {
      caption: text('סדר היום'),
      title: text('יום אחד בנוף'),
      image: { assetId: pictures.nofView1.id },
      subtitle: [text('בוקר: תנועה איטית'), text('צהריים: אוכל מהגינה'), text('ערב: שקט מלא')],
      body: [
        text('מתחילים ב-6:30 בהליכה אל המצפה, וממשיכים לשעה של יוגה או תרגול נשימה.'),
        text('ארוחה צמחונית מירקות שגדלים כאן, ואחריה שלוש שעות פנויות לגמרי.'),
        text('אחרי השקיעה אין מסכים ואין Wi-Fi. מי שרוצה יושב מול האח עם ספר.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_nof_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('מה משתנה'), text('ביום ההגעה'), text('חודש אחרי השהות')],
      title: text('מה שנשאר אחרי חודש'),
      subtitle: [text('עייפות שהצטברה'), text('שגרה רגועה יותר')],
      body: [
        bullets(
          'שינה: 5.4 שעות בלילה, בממוצע',
          'מתח יומיומי: 7.8 מתוך 10',
          'פעילות גופנית: פעם בשבוע',
        ),
        bullets(
          'שינה: 6.9 שעות בלילה, בממוצע',
          'מתח יומיומי: 5.1 מתוך 10',
          'פעילות גופנית: שלוש פעמים בשבוע, ו-64% ממשיכים בתרגול הבוקר',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_nof_quote',
    name: 'ציטוט',
    content: {
      quote: text('הגעתי כדי לישון. חזרתי הביתה עם בוקר שמתחיל בלי טלפון, וזה שינה לי את כל היום.'),
      attribution: text('נטע אבירם'),
      caption: text('אחות בטיפול נמרץ · אורחת בתוכנית לצוותים מטפלים, מרץ 2026'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_nof_full_image',
    name: 'המקום',
    content: {
      image: { assetId: pictures.nofScene.id },
      caption: text('המקום'),
      title: text('הנוף עושה', 'חצי מהעבודה'),
      body: text('שבעה דונם של חורש, מצפה אחד ושקט שנשמע למרחוק. את השאר אנחנו רק מסדרים סביבו.'),
    },
  },
  {
    layout: 'l_nof_section',
    name: 'מבט קדימה',
    content: {
      number: text('02'),
      caption: text('חלק שני'),
      title: text('מבט קדימה'),
      subtitle: text('ארבע עונות, תוכנית חדשה אחת, ובית שגדל בזהירות.'),
    },
  },
  {
    layout: 'l_nof_timeline',
    name: 'ארבע עונות',
    content: {
      caption: [text('תוכנית 2027'), text('התוכנית כפופה לאישור התקציב באספת השותפים, בינואר.')],
      title: text('ארבע עונות ב-2027'),
      number: [text('חורף'), text('אביב'), text('קיץ'), text('סתיו')],
      subtitle: [
        text('ריטריט שתיקה'),
        text('גינה טיפולית'),
        text('שהות למשפחות'),
        text('שישה חדרים חדשים'),
      ],
      body: [
        text('חמישה לילות של שתיקה, פעם בחודש, בהנחיית צוות הבית.'),
        text('ערוגות חדשות, ועבודה בגינה כחלק מסדר היום.'),
        text('שבועיים באוגוסט שבהם מגיעים גם עם הילדים.'),
        text('אגף חדש נפתח, והבית גדל ל-20 חדרים.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_nof_process',
    name: 'המסלול של אורח',
    content: {
      caption: [
        text('המסלול של אורח'),
        text('שיחת טלפון קצרה: מה מביא אותך, ומה מתאים לך.'),
        text('קבלת פנים, סיור בבית והפקדת הטלפון.'),
        text('סדר יום קבוע, ומלווה אישי אחד לכל אורח.'),
        text('שיחת סיכום, ותוכנית קטנה לקחת הביתה.'),
        text('שלוש שיחות המשך, בטלפון או ב-Zoom.'),
      ],
      title: text('מהשיחה הראשונה ועד הבית'),
      subtitle: [text('היכרות'), text('הגעה'), text('שהות'), text('פרידה'), text('ליווי')],
      number: [text('20 דק׳'), text('יום 1'), text('4 ימים'), text('יום 5'), text('30 יום')],
      body: text('הליווי הוא מה שהופך חופשה לשינוי: 64% ממשיכים לתרגל גם אחרי חודש.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_nof_team',
    name: 'הצוות',
    content: {
      caption: [
        text('הצוות'),
        text('מנהלת הבית'),
        text('מורה ליוגה ולנשימה'),
        text('המטבח והגינה'),
        text('מלווה אישי'),
      ],
      title: text('האנשים של נוף'),
      image: [
        { assetId: pictures.nofTeam1.id },
        { assetId: pictures.nofTeam2.id },
        { assetId: pictures.nofTeam3.id },
        { assetId: pictures.nofTeam4.id },
      ],
      subtitle: [text('יעל שגב'), text('אורי נחום'), text('דנה כרמי'), text('מיכאל טל')],
      body: [
        text('הקימה את נוף ב-2018, אחרי 20 שנה בניהול בתי חולים.'),
        text('מלמד כבר 15 שנה, ומוביל את תרגול הבוקר.'),
        text('מבשלת ממה שגדל בגינה, ומלמדת לעשות זאת בבית.'),
        text('פסיכולוג קליני. מלווה כל אורח גם בחודש שאחרי.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_nof_closing',
    name: 'סיום',
    content: {
      caption: [text('ממשיכים יחד'), text('yael@nof.example · nof.example/2027')],
      title: text('נתראה', 'בנוף'),
      body: [
        text('עד 15 בינואר: אישור תקציב 2027 באספת השותפים'),
        text('פברואר: נפתחת ההרשמה לריטריט השתיקה'),
        text('מרץ: יום פתוח לשותפים, לתומכים ולמשפחות'),
      ],
    },
  },
];

const FOOTER_EN = text('Nof · The year in review 2026');
const SEASONS_EN = ['Winter', 'Spring', 'Summer', 'Autumn'];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_nof_hero',
    name: 'Cover',
    content: {
      caption: [
        text('The year in review · 2026'),
        text('For our partners and supporters · December 2026'),
      ],
      title: text('Room', 'to breathe'),
      subtitle: text('Nof · A retreat house in the Upper Galilee'),
      image: { assetId: pictures.nofView2.id },
    },
  },
  {
    layout: 'l_nof_section',
    name: 'Looking back',
    content: {
      number: text('01'),
      caption: text('Part one'),
      title: text('Looking back'),
      subtitle: text('Who came to us, how long they stayed, and what they took home.'),
    },
  },
  {
    layout: 'l_nof_big_number',
    name: 'Guests',
    content: {
      caption: [
        text('Our guests'),
        text('would recommend Nof to a close friend (NPS 71)'),
        text('nights on average in a single stay'),
        text('came back for a second stay within a year'),
      ],
      title: text('A full, unhurried year'),
      number: [text('3,840'), text('92%'), text('4.2'), text('38%')],
      subtitle: text('guests stayed at Nof in 2026'),
      body: text(
        'Up 24% on 2025 without adding a single room: we opened midweek to longer stays, and occupancy on those days nearly doubled.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_nof_chart',
    name: 'Nights stayed',
    content: {
      caption: [
        text('Nights stayed'),
        text('Source: the Nof booking system, January to December 2026.'),
      ],
      title: text('Midweek is filling up'),
      number: [text('+68%'), text('71%')],
      body: [
        text('midweek nights, compared with 2025.'),
        text('average occupancy across the whole year.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Nights stayed by season',
      data: {
        categories: SEASONS_EN,
        series: [
          { name: 'Weekends', values: WEEKENDS },
          { name: 'Midweek', values: MIDWEEK },
        ],
      },
    },
  },
  {
    layout: 'l_nof_table',
    name: 'Programmes',
    content: {
      caption: [
        text('The programmes'),
        text('Satisfaction is measured by a questionnaire on the day of departure, from 1 to 5.'),
      ],
      title: text('What we offered this year'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['Programme', 'Length', 'Guests', 'Satisfaction', 'Price per guest'],
        ['A quiet weekend', '2 nights', '1,460', '4.7', '₪1,480'],
        ['A midweek breath', '4 nights', '920', '4.8', '₪2,650'],
        ['A week of renewal', '6 nights', '310', '4.9', '₪3,900'],
        ['Silent retreat', '5 nights', '240', '4.8', '₪3,200'],
        ['Walking and movement', '3 nights', '520', '4.6', '₪1,950'],
        ['Rest for care teams', '2 nights', '390', '4.9', 'Partner-funded'],
        ['Community open day', 'One day', '1,100', '4.5', 'Free'],
      ],
    },
  },
  {
    layout: 'l_nof_cards',
    name: 'Three stays',
    content: {
      caption: [
        text('The stays'),
        text('Weekend · 2 nights'),
        text('Midweek · 4 nights'),
        text('Full week · 6 nights'),
      ],
      title: text('Three ways to pause'),
      subtitle: [text('Pause'), text('Breath'), text('Renewal')],
      body: [
        text('Leave on Thursday, return on Saturday night. Walks, good food, long sleep.'),
        text('Four nights without screens: morning practice, quiet hours, one guide.'),
        text('A whole week in a small group. Arrive tired, leave with new habits.'),
        text('In every stay: up to 14 guests, a private room and three meals from the garden.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_nof_text_image',
    name: 'A day at Nof',
    content: {
      caption: text('The daily rhythm'),
      title: text('A day at Nof'),
      image: { assetId: pictures.nofView1.id },
      subtitle: [
        text('Morning: slow movement'),
        text('Noon: food from the garden'),
        text('Evening: full quiet'),
      ],
      body: [
        text('We start at 6:30 with a walk to the lookout, then an hour of yoga or breathing.'),
        text('A vegetarian meal of what grows here, and then three hours left entirely free.'),
        text('After sunset there are no screens and no Wi-Fi. Some sit by the fire with a book.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_nof_comparison',
    name: 'Before and after',
    content: {
      caption: [
        text('What changes'),
        text('On the day of arrival'),
        text('A month after the stay'),
      ],
      title: text('What remains a month on'),
      subtitle: [text('Fatigue that built up'), text('A calmer routine')],
      body: [
        bullets(
          'Sleep: 5.4 hours a night, on average',
          'Daily stress: 7.8 out of 10',
          'Exercise: once a week',
        ),
        bullets(
          'Sleep: 6.9 hours a night, on average',
          'Daily stress: 5.1 out of 10',
          'Exercise: three times a week, and 64% keep up the morning practice',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_nof_quote',
    name: 'Quote',
    content: {
      quote: text(
        'I came to sleep. I went home with a morning that starts without a phone, and it changed my whole day.',
      ),
      attribution: text('Neta Aviram'),
      caption: text('Intensive-care nurse · a guest of the care teams programme, March 2026'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_nof_full_image',
    name: 'The place',
    content: {
      image: { assetId: pictures.nofScene.id },
      caption: text('The place'),
      title: text('The view does', 'half the work'),
      body: text(
        'Seven dunams of woodland, one lookout and a quiet you can hear from afar. We only arrange the rest around it.',
      ),
    },
  },
  {
    layout: 'l_nof_section',
    name: 'Looking ahead',
    content: {
      number: text('02'),
      caption: text('Part two'),
      title: text('Looking ahead'),
      subtitle: text('Four seasons, one new programme, and a house that grows with care.'),
    },
  },
  {
    layout: 'l_nof_timeline',
    name: 'Four seasons',
    content: {
      caption: [
        text('The plan for 2027'),
        text('The plan is subject to approval of the budget at the partners’ meeting in January.'),
      ],
      title: text('Four seasons in 2027'),
      number: [text('Winter'), text('Spring'), text('Summer'), text('Autumn')],
      subtitle: [
        text('Silent retreat'),
        text('A healing garden'),
        text('Family stays'),
        text('Six new rooms'),
      ],
      body: [
        text('Five nights of silence, once a month, led by the house team.'),
        text('New beds, and garden work as part of the daily rhythm.'),
        text('Two weeks in August when guests bring their children.'),
        text('A new wing opens, and the house grows to 20 rooms.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_nof_process',
    name: 'The path of a guest',
    content: {
      caption: [
        text('The path of a guest'),
        text('A short call: what brings you, and what suits you.'),
        text('A welcome, a tour of the house, the phone put away.'),
        text('A steady daily rhythm, and one personal guide.'),
        text('A closing talk, and a small plan to take home.'),
        text('Three follow-up talks, by phone or on Zoom.'),
      ],
      title: text('From the first call to home'),
      subtitle: [
        text('Hello'),
        text('Arrival'),
        text('The stay'),
        text('Farewell'),
        text('Follow-up'),
      ],
      number: [text('20 min'), text('Day 1'), text('4 days'), text('Day 5'), text('30 days')],
      body: text('Follow-up turns a holiday into a change: 64% still practise a month later.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_nof_team',
    name: 'The team',
    content: {
      caption: [
        text('The team'),
        text('House director'),
        text('Yoga and breath teacher'),
        text('Kitchen and garden'),
        text('Personal guide'),
      ],
      title: text('The people of Nof'),
      image: [
        { assetId: pictures.nofTeam1.id },
        { assetId: pictures.nofTeam2.id },
        { assetId: pictures.nofTeam3.id },
        { assetId: pictures.nofTeam4.id },
      ],
      subtitle: [text('Yael Segev'), text('Uri Nahum'), text('Dana Carmi'), text('Michael Tal')],
      body: [
        text('Founded Nof in 2018, after 20 years of running hospitals.'),
        text('Has taught for 15 years, and leads the morning practice.'),
        text('Cooks what the garden grows, and teaches guests to.'),
        text('A clinical psychologist. Guides each guest for a month.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_nof_closing',
    name: 'Closing',
    content: {
      caption: [text('Going on together'), text('yael@nof.example · nof.example/2027')],
      title: text('See you', 'at Nof'),
      body: [
        text('By January 15: the partners’ meeting approves the 2027 budget'),
        text('February: registration opens for the silent retreat'),
        text('March: an open day for partners, supporters and families'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const nofSamples = { he: sampleHe, en: sampleEn };

/** The Nof template: the theme, fourteen layouts for both directions, and its sample deck. */
export function nofTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(nofTheme),
    description:
      'Calm: mist, sage and sand, soft panels and a drawn landscape, for wellness and care.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.nofScene,
      pictures.nofView1,
      pictures.nofView2,
      pictures.nofTeam1,
      pictures.nofTeam2,
      pictures.nofTeam3,
      pictures.nofTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
