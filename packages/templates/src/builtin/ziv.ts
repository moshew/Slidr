import type { Background, Color, Element, Fill, Frame, Layout, Theme } from '@slidr/model';
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
 * Ziv (radiance): Y2K liquid chrome and holographic shimmer on pearl, in its restrained 2026
 * form. Chrome blobs bleed off the edges of the slide, four-point sparkles come in threes, one
 * holographic panel per slide catches the light, gel pills carry the small labels, and the cards
 * are early-web windows with a satin title bar. For launches, beauty, fashion and music.
 *
 * Every text style is dark (ink, slate or electric violet), so text reads on pearl, on white and
 * on the pale holographic panels alike; chrome carries no text, ever. The holographic stops are
 * kept pale enough for the slate captions (≥ 4.5:1 on the deepest of them).
 */
export const zivTheme: Theme = {
  id: 'ziv',
  name: 'Ziv',
  colors: {
    bg: '#eef0f6',
    surface: '#ffffff',
    text: '#17172b',
    muted: '#474961',
    primary: '#4f3be8',
    secondary: '#0f9fb4',
    accent: '#ff5fc9',
    chart: ['#4f3be8', '#0f9fb4', '#ff5fc9', '#17172b', '#8f98ab', '#5fbf3a'],
  },
  fonts: {
    heading: { he: 'Rubik', latin: 'Montserrat' },
    body: { he: 'Assistant', latin: 'DM Sans' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 150,
      weight: 700,
      lineHeight: 0.98,
      letterSpacing: -4,
      color: { token: 'primary' },
    },
    title: {
      font: 'heading',
      size: 64,
      weight: 700,
      lineHeight: 1.1,
      letterSpacing: -1,
      color: { token: 'text' },
    },
    heading: { font: 'heading', size: 40, weight: 600, lineHeight: 1.2, color: { token: 'text' } },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.45, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 600, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 28,
  shadow: { x: 0, y: 18, blur: 40, color: { value: '#4f3be8', alpha: 0.14 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    {
      fill: {
        kind: 'linear',
        angle: 120,
        stops: [
          { color: { value: '#b5f1ff' }, at: 0 },
          { color: { value: '#d3c6ff' }, at: 0.35 },
          { color: { value: '#ffcfef' }, at: 0.65 },
          { color: { value: '#fff5c2' }, at: 1 },
        ],
      },
    },
    { fill: { kind: 'solid', color: { token: 'surface' } } },
  ],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

/** The literal colours of the drawings that follow the theme. Chrome and holo stay themselves. */
const PAINT = {
  '#17172b': token('text'),
  '#4f3be8': token('primary'),
  '#ff5fc9': token('accent'),
  '#0f9fb4': token('secondary'),
};

const LIME = '#b7f35a';
const LILAC = '#c9b8ff';

const value = (hex: string, alpha?: number): Color =>
  alpha === undefined ? { value: hex } : { value: hex, alpha };

const linear = (angle: number, ...stops: [color: Color, at: number][]): Fill => ({
  kind: 'linear',
  angle,
  stops: stops.map(([color, stop]) => ({ color, at: stop })),
});

/** Liquid chrome: bright, a dark band, a flash of white, and a cool grey at the far end. */
const CHROME: [string, number][] = [
  ['#ffffff', 0],
  ['#d7dce6', 0.18],
  ['#8f98ab', 0.42],
  ['#f5f7fb', 0.52],
  ['#b3bbc9', 0.7],
  ['#6c7488', 1],
];
const chrome = (angle = 95): Fill =>
  linear(angle, ...CHROME.map(([hex, stop]): [Color, number] => [value(hex), stop]));

/** The holographic film: aqua, lilac, pink, butter. Pale enough to carry every text style. */
const HOLO: [string, number][] = [
  ['#b5f1ff', 0],
  ['#d3c6ff', 0.35],
  ['#ffcfef', 0.65],
  ['#fff5c2', 1],
];
const holoFill = (angle = 120): Fill =>
  linear(angle, ...HOLO.map(([hex, stop]): [Color, number] => [value(hex), stop]));

/** Gel: pearl at the top, cool grey at the bottom, like a pressed plastic button. */
const GEL = linear(180, [token('surface'), 0], [token('bg'), 0.5], [value('#d5d9e3'), 1]);

const SOFT = { x: 0, y: 18, blur: 40, color: token('primary', 0.14) };
const INK = token('text');

/**
 * The ground of a slide: pearl, with a wash of lilac from one corner (`x`, `y` in 0..1). The
 * model's own radial gradient, so the mirror moves the wash to the other side.
 */
const ground = (x: number, y: number, strength = 0.75): Background => ({
  fill: solid(token('bg')),
  overlay: {
    kind: 'radial',
    center: { x, y },
    stops: [
      { color: value(LILAC, strength), at: 0 },
      { color: value(LILAC, 0), at: 0.55 },
    ],
  },
});

const holoGround = (angle = 120): Background => ({ fill: holoFill(angle) });

/** A frame around a point given from the end side (the left of a right-to-left slide). */
const around = (x: number, y: number, r: number): Frame => atEnd(x - r, y - r, 2 * r, 2 * r);

const inset = (frame: Frame, by: number): Frame => ({
  x: frame.x + by,
  y: frame.y + by,
  w: frame.w - 2 * by,
  h: frame.h - 2 * by,
});

/** The holographic panel: the film, and a white line drawn 8px inside its edge. */
function holo(id: string, frame: Frame, radius = 40, angle = 120, line = true): Element[] {
  const panel = rect(id, frame, holoFill(angle), { effects: { radius } });
  if (!line) return [panel];
  return [
    panel,
    rect(
      `${id}_line`,
      inset(frame, 8),
      { kind: 'none' },
      {
        stroke: { color: token('surface', 0.9), width: 2 },
        effects: { radius: Math.max(0, radius - 8) },
      },
    ),
  ];
}

/** A gel pill: the pressed fill, a thin outline, and the white gleam along its top. */
function gel(id: string, frame: Frame, fill: Fill = GEL): Element[] {
  const r = frame.h / 2;
  return [
    rect(id, frame, fill, {
      stroke: { color: token('text', 0.28), width: 1.5 },
      effects: { radius: r, shadow: { x: 0, y: 8, blur: 18, color: token('primary', 0.12) } },
    }),
    rect(
      `${id}_gleam`,
      { x: frame.x + r * 0.6, y: frame.y + 3, w: frame.w - r * 1.2, h: frame.h * 0.38 },
      linear(180, [token('surface', 0.95), 0], [token('surface', 0), 1]),
      { effects: { radius: frame.h * 0.19 } },
    ),
  ];
}

/** A rectangle with only its top corners rounded, as SVG path data in its own box. */
const topRounded = (w: number, h: number, r: number) =>
  `M0 ${h}V${r}A${r} ${r} 0 0 1 ${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h}Z`;

/**
 * An early-web window: a white pane with a thin ink outline, a satin title bar, and three
 * coloured dots at its start. Its title bar may hold a caption; the dots take 90px of it.
 */
function windowPane(
  id: string,
  frame: Frame,
  bar: number,
  rest: { muted?: boolean; status?: number } = {},
) {
  const radius = 22;
  const barFrame = { ...frame, h: bar };
  const dots = rest.muted
    ? [token('muted', 0.35), token('muted', 0.35), token('muted', 0.35)]
    : [token('accent'), value(LIME), token('secondary')];
  return [
    rect(`${id}_pane`, frame, solid(token('surface')), { effects: { radius, shadow: SOFT } }),
    rect(
      `${id}_bar`,
      barFrame,
      linear(180, [token('surface'), 0], [value('#e3e6ee'), 0.55], [value('#ccd1dc'), 1]),
      {
        geometry: {
          kind: 'path',
          d: topRounded(frame.w, bar, radius),
          viewBox: { w: frame.w, h: bar },
        },
      },
    ),
    rect(`${id}_rule`, { x: frame.x, y: frame.y + bar - 2, w: frame.w, h: 2 }, solid(INK)),
    ...dots.map((color, i) =>
      dot(
        `${id}_dot${i + 1}`,
        { x: frame.x + frame.w - 40 - i * 26, y: frame.y + bar / 2 - 8, w: 16, h: 16 },
        solid(color),
        { stroke: { color: token('text', 0.6), width: 1.5 } },
      ),
    ),
    // A status bar at the foot of the pane: a gel track, part filled with film.
    ...(rest.status
      ? (() => {
          const track = { x: frame.x + 32, y: frame.y + frame.h - 50, w: frame.w - 64, h: 24 };
          const fill = track.w * rest.status;
          return [
            rect(`${id}_track`, track, solid(token('bg')), {
              stroke: { color: token('text', 0.35), width: 1.5 },
              effects: { radius: 12 },
            }),
            rect(
              `${id}_progress`,
              { x: track.x + track.w - fill, y: track.y, w: fill, h: track.h },
              holoFill(90),
              { stroke: { color: token('text', 0.35), width: 1.5 }, effects: { radius: 12 } },
            ),
          ];
        })()
      : []),
    rect(
      `${id}_edge`,
      frame,
      { kind: 'none' },
      {
        stroke: { color: INK, width: 2 },
        effects: { radius },
      },
    ),
  ];
}

// --- The drawings ----------------------------------------------------------------------------

const round1 = (n: number) => Math.round(n * 10) / 10;

const stops = (list: readonly [string, number][], opacity = 1) =>
  list
    .map(
      ([hex, at]) =>
        `<stop offset="${at}" stop-color="${hex}"${opacity < 1 ? ` stop-opacity="${opacity}"` : ''}/>`,
    )
    .join('');

/** A drop of a liquid shape: its centre (0..100 of the box's width and height) and its radius. */
type Ball = readonly [x: number, y: number, r: number];

/**
 * Liquid chrome: balls that run together into one shape (a blur and a hard threshold, the
 * "goo" of SVG), lit as a lump of polished metal. Inside the outline, smaller copies of the same
 * shape stack up: a dark band, a bright satin, a holographic core and a white hot spot, each a
 * little higher and further to the start, where the light comes from. Radii are in hundredths
 * of the box's shorter side. The ids of inline SVG are shared by the whole page, so every one
 * is named after the decoration.
 */
function liquid(id: string, frame: Frame, balls: readonly Ball[]): Element {
  const { w, h } = frame;
  const u = Math.min(w, h) / 100;
  const g = id.replace(/^d_/, 'g_');
  const circles = balls
    .map(
      ([x, y, r]) =>
        `<circle cx="${round1((x * w) / 100)}" cy="${round1((y * h) / 100)}" r="${round1(r * u)}"/>`,
    )
    .join('');
  let [sx, sy, sum] = [0, 0, 0];
  for (const [x, y, r] of balls) [sx, sy, sum] = [sx + x * r * r, sy + y * r * r, sum + r * r];
  const [cx, cy] = [((sx / sum) * w) / 100, ((sy / sum) * h) / 100];
  const goo = (key: string, blur: number) =>
    `<filter id="${g}_${key}" x="-25%" y="-25%" width="150%" height="150%">` +
    `<feGaussianBlur stdDeviation="${round1(5 * u)}"/>` +
    `<feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 24 -11"/>` +
    (blur ? `<feGaussianBlur stdDeviation="${round1(blur * u)}"/>` : '') +
    `</filter>`;
  const copy = (k: number, dx: number, dy: number, filter: string, fill: string, opacity: number) =>
    `<g transform="translate(${round1(cx + (dx * w) / 100)} ${round1(cy + (dy * h) / 100)}) scale(${k}) translate(${round1(-cx)} ${round1(-cy)})" filter="url(#${g}_${filter})" fill="${fill}" opacity="${opacity}"><use href="#${g}_balls"/></g>`;
  const markup =
    `<svg viewBox="0 0 ${w} ${h}"><defs>` +
    `<g id="${g}_balls">${circles}</g>` +
    goo('shape', 0) +
    goo('soft', 1.6) +
    goo('satin', 0.9) +
    `<filter id="${g}_hot" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${round1(0.35 * u)}"/></filter>` +
    `<mask id="${g}_mask"><g filter="url(#${g}_shape)" fill="#ffffff"><use href="#${g}_balls"/></g></mask>` +
    `<linearGradient id="${g}_metal_paint" x1="0" y1="0" x2="0.3" y2="1">${stops([
      ['#ffffff', 0],
      ['#e3e7ef', 0.25],
      ['#a3abbc', 0.5],
      ['#d9dee8', 0.8],
      ['#ffffff', 1],
    ])}</linearGradient>` +
    `<linearGradient id="${g}_satin_paint" x1="0" y1="0" x2="0.2" y2="1">${stops([
      ['#ffffff', 0],
      ['#e9ecf2', 0.45],
      ['#8d96aa', 0.75],
      ['#c8ceda', 1],
    ])}</linearGradient>` +
    `<linearGradient id="${g}_film_paint" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${w}" y2="${h}">${stops(
      [
        ['#d3c6ff', 0.2],
        ['#b5f1ff', 0.45],
        ['#ffcfef', 0.7],
      ],
    )}</linearGradient>` +
    `</defs><g mask="url(#${g}_mask)">` +
    `<rect width="${w}" height="${h}" fill="url(#${g}_metal_paint)"/>` +
    copy(0.94, 0, 4, 'soft', '#3d4458', 0.85) +
    copy(0.8, -2, -1, 'satin', `url(#${g}_satin_paint)`, 1) +
    copy(0.6, -3, 1, 'satin', `url(#${g}_film_paint)`, 0.9) +
    `<g filter="url(#${g}_hot)" fill="#ffffff">${[...balls]
      .sort((a, b) => b[2] - a[2])
      .slice(0, 2)
      .map(([x, y, r]) => {
        const [gx, gy] = [(x * w) / 100 - r * u * 0.36, (y * h) / 100 - r * u * 0.42];
        return `<ellipse cx="${round1(gx)}" cy="${round1(gy)}" rx="${round1(r * u * 0.26)}" ry="${round1(r * u * 0.1)}" transform="rotate(-38 ${round1(gx)} ${round1(gy)})"/>`;
      })
      .join('')}</g>` +
    `</g></svg>`;
  return drawing(id, frame, markup, PAINT);
}

/** A four-point sparkle: four concave sides meeting in sharp points. */
function star(cx: number, cy: number, r: number, k = 0.14): string {
  const [a, b] = [r * k, r];
  return (
    `M${cx} ${cy - b}Q${cx + a} ${cy - a} ${cx + b} ${cy}Q${cx + a} ${cy + a} ${cx} ${cy + b}` +
    `Q${cx - a} ${cy + a} ${cx - b} ${cy}Q${cx - a} ${cy - a} ${cx} ${cy - b}Z`
  );
}

/** Three sparkles, as the template always shows them: white with an ink outline, pink, lime. */
function sparkles(id: string, frame: Frame): Element {
  const markup =
    `<svg viewBox="0 0 100 100">` +
    `<path d="${star(40, 44, 36)}" fill="#ffffff" stroke="#17172b" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="${star(82, 80, 16)}" fill="#ff5fc9"/>` +
    `<path d="${star(84, 20, 11)}" fill="${LIME}"/>` +
    `</svg>`;
  return drawing(id, frame, markup, PAINT);
}

/** One sparkle, as a sticker on a corner. */
function sticker(id: string, frame: Frame, fill: string): Element {
  const markup = `<svg viewBox="0 0 100 100"><path d="${star(50, 50, 46, 0.16)}" fill="${fill}" stroke="#17172b" stroke-width="3" stroke-linejoin="round"/></svg>`;
  return drawing(id, frame, markup, PAINT);
}

/** A chrome bezel: a chrome ring, a white one, a fine chrome line, and a white face. */
function bezel(id: string, frame: Frame): Element {
  const g = id.replace(/^d_/, 'g_');
  const markup =
    `<svg viewBox="0 0 200 200"><defs>` +
    `<linearGradient id="${g}_a" x1="0" y1="0" x2="1" y2="1">${stops(CHROME)}</linearGradient>` +
    `<linearGradient id="${g}_b" x1="1" y1="1" x2="0" y2="0">${stops(CHROME)}</linearGradient>` +
    `</defs>` +
    `<circle cx="100" cy="100" r="100" fill="url(#${g}_a)"/>` +
    `<circle cx="100" cy="100" r="91" fill="#ffffff"/>` +
    `<circle cx="100" cy="100" r="87" fill="url(#${g}_b)"/>` +
    `<circle cx="100" cy="100" r="84" fill="#ffffff"/>` +
    `</svg>`;
  return drawing(id, frame, markup, PAINT);
}

/** A ring of chrome: a thick stroke of the metal, with a fine white line along its inside. */
function chromeRing(id: string, frame: Frame, width: number): Element {
  const g = id.replace(/^d_/, 'g_');
  const r = frame.w / 2 - width / 2;
  const c = frame.w / 2;
  const markup =
    `<svg viewBox="0 0 ${frame.w} ${frame.h}"><defs>` +
    `<linearGradient id="${g}_paint" x1="0" y1="0" x2="1" y2="1">${stops(CHROME)}</linearGradient></defs>` +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#${g}_paint)" stroke-width="${width}"/>` +
    `<circle cx="${c}" cy="${c}" r="${r - width / 2 + 2}" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.9"/>` +
    `</svg>`;
  return drawing(id, frame, markup, PAINT);
}

/** A drop of chrome, its tail up. */
const droplet = (id: string, frame: Frame) =>
  liquid(id, frame, [
    [50, 60, 36],
    [50, 30, 15],
  ]);

/** A small lump of chrome: compact, so the light runs round it whole. */
const PEBBLE: Ball[] = [
  [40, 52, 32],
  [66, 46, 22],
];
/** The column of the opening slide: drops stacked into one rising shape. */
const COLUMN: Ball[] = [
  [50, 72, 40],
  [62, 46, 26],
  [44, 30, 20],
  [56, 14, 12],
];
/** The pool of the closing slide: the same metal, spread out low. */
const POOL: Ball[] = [
  [40, 58, 30],
  [64, 52, 24],
  [22, 66, 16],
  [82, 64, 12],
];

/**
 * The mark: a chrome sparkle on a white disc with an ink ring. A deck replaces it with its logo.
 */
const MARK =
  `<svg viewBox="0 0 40 40"><defs><linearGradient id="g_ziv_mark" x1="0" y1="0" x2="1" y2="1">${stops(CHROME)}</linearGradient></defs>` +
  `<circle cx="20" cy="20" r="18.5" fill="#ffffff" stroke="#17172b" stroke-width="2"/>` +
  `<path d="${star(20, 20, 14, 0.16)}" fill="url(#g_ziv_mark)" stroke="#17172b" stroke-width="1.2" stroke-linejoin="round"/>` +
  `<path d="${star(31, 9, 5)}" fill="#ff5fc9"/></svg>`;

const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** An arrow from what was to what is, drawn for a right-to-left slide: the mirror turns it. */
const ARROW =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#17172b" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';

/**
 * The quotation mark: two drops of chrome, heads down and tails up (“) for a left-to-right
 * deck. The right-to-left mark is the same pair turned half a turn (”), not its mirror.
 */
function quoteGlyph(frame: Frame, rtl: boolean): Element {
  const glyph = liquid('d_ziv_quote_glyph', frame, [
    [27, 66, 24],
    [33, 38, 12],
    [40, 21, 7],
    [71, 66, 24],
    [77, 38, 12],
    [84, 21, 7],
  ]);
  return rtl ? { ...glyph, rotation: 180 } : glyph;
}

/**
 * The speech bubble of the quote: an early-web white with an ink outline, its tail pointing
 * down from the start side, floating on the film with a violet shadow.
 */
function bubble(id: string, frame: Frame, body: number): Element {
  const { w, h } = frame;
  const [r, m] = [64, 30];
  const [bw, bh, bb] = [w - 2 * m, h - 2 * m, body - 2 * m];
  const tail = bw - 300;
  const d =
    `M${r} 0H${bw - r}A${r} ${r} 0 0 1 ${bw} ${r}V${bb - r}A${r} ${r} 0 0 1 ${bw - r} ${bb}` +
    `H${tail + 120}L${tail + 150} ${bh}L${tail + 20} ${bb}H${r}A${r} ${r} 0 0 1 0 ${bb - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
  const markup =
    `<svg viewBox="0 0 ${w} ${h}"><defs><filter id="g_ziv_bubble_shadow" x="-10%" y="-10%" width="120%" height="130%">` +
    `<feDropShadow dx="0" dy="18" stdDeviation="20" flood-color="#4f3be8" flood-opacity="0.18"/></filter></defs>` +
    `<path transform="translate(${m} ${m})" d="${d}" fill="#ffffff" stroke="#17172b" stroke-width="2.5" stroke-linejoin="round" filter="url(#g_ziv_bubble_shadow)"/>` +
    `</svg>`;
  return drawing(id, frame, markup, PAINT);
}

/** The number of a point, written on its gel pill. Centred, so it stays there when the layout turns. */
const pointNumber = (id: string, frame: Frame, n: number) =>
  label(id, frame, String(n).padStart(2, '0'), 'heading', {
    color: token('primary'),
    weight: 700,
    dir: 'auto',
    align: 'center',
    vAlign: 'middle',
  });

/** The line over a title, in a gel pill like an address bar, and the title itself. */
function head(name: string, width = 1728, lines = 1) {
  return {
    placeholders: [
      place('p_kicker', 'caption', at(158, 84, 404, 34), 'caption', { vAlign: 'middle' }),
      place('p_title', 'title', at(96, 148, width, 72 * lines), 'title'),
    ],
    decorations: [
      ...gel(`d_ziv_${name}_kicker`, at(96, 76, 484, 50)),
      sticker(`d_ziv_${name}_kicker_star`, at(112, 85, 32, 32), LIME),
    ],
  };
}

/**
 * The foot of a content slide: the mark at the start, the deck's name beside it, and at the end
 * the slide's number in a small gel pill (SLD-04).
 */
function foot(name: string) {
  return {
    placeholders: [place('p_footer', 'footer', at(158, 960, 1000, 34), 'caption')],
    decorations: [
      mark(`d_ziv_${name}_mark`, at(96, 954, 46, 46)),
      ...gel(`d_ziv_${name}_folio`, atEnd(88, 952, 120, 48)),
      pageNumber(`d_ziv_${name}_number`, atEnd(96, 959, 104, 34), 'caption', {
        color: token('text'),
        align: 'center',
      }),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const columns4 = [96, 540, 984, 1428];
const cardStarts = [96, 732, 1314];
const cardWidths = [600, 546, 510];
const cardTops = [256, 292, 328];
const steps5 = [96, 448, 800, 1152, 1504];
const rows3 = [336, 532, 728];
const stats3 = [264, 486, 708];
const lines3 = [548, 652, 756];

function layouts(): Layout[] {
  const bigHead = head('big_number');
  const quoteFoot = foot('quote');
  return [
    {
      id: 'l_ziv_hero',
      name: 'Hero',
      archetype: 'hero',
      background: ground(0.05, 0.1, 0.9),
      placeholders: [
        place('p_kicker', 'caption', at(244, 105, 500, 34), 'caption', { vAlign: 'middle' }),
        place('p_title', 'title', at(96, 300, 1040, 480), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 800, 1040, 144), 'heading'),
        place('p_meta', 'caption', at(96, 958, 1000, 34), 'caption'),
      ],
      decorations: [
        // The cluster pours in from the far upper corner: a holographic moon behind, chrome
        // in front, a drop that has fallen from it, and the sparkles it throws.
        // The sculpture owns the end half: a disc of film, a ring of chrome around it, and a
        // column of liquid chrome that rises from below the edge, a drop breaking off its top.
        rect('d_ziv_hero_moon', atEnd(-200, 40, 1000, 1000), holoFill(140), {
          geometry: { kind: 'preset', preset: 'ellipse' },
        }),
        chromeRing('d_ziv_hero_ring', atEnd(-150, 90, 900, 900), 22),
        liquid('d_ziv_hero_pour', atEnd(-40, 160, 760, 980), COLUMN),
        liquid('d_ziv_hero_pebble', atEnd(-60, -50, 300, 260), PEBBLE),
        droplet('d_ziv_hero_drop', atEnd(650, 190, 90, 104)),
        sparkles('d_ziv_hero_sparkles', atEnd(500, 96, 210, 210)),
        mark('d_ziv_hero_mark', at(96, 92, 60, 60)),
        ...gel('d_ziv_hero_pill', at(176, 96, 588, 52)),
        sticker('d_ziv_hero_pill_star', at(194, 105, 34, 34), LIME),
      ],
    },
    {
      id: 'l_ziv_section',
      name: 'Section',
      archetype: 'section',
      background: holoGround(),
      placeholders: [
        place('p_number', 'number', atEnd(290, 440, 520, 200), 'display', {
          align: 'center',
          vAlign: 'middle',
        }),
        place('p_kicker', 'caption', at(166, 339, 640, 34), 'caption', { vAlign: 'middle' }),
        place('p_title', 'title', at(96, 410, 900, 310), 'display', { vAlign: 'middle' }),
        place('p_subtitle', 'subtitle', at(96, 740, 900, 150), 'heading'),
      ],
      decorations: [
        // The number sits in a chrome bezel on the film, like a dial on a pearl device.
        rect('d_ziv_section_halo', atEnd(196, 186, 708, 708), solid(token('surface', 0.35)), {
          geometry: { kind: 'preset', preset: 'ellipse' },
        }),
        bezel('d_ziv_section_bezel', atEnd(250, 240, 600, 600)),
        droplet('d_ziv_section_drop', atEnd(190, 770, 130, 150)),
        sparkles('d_ziv_section_sparkles', atEnd(740, 170, 190, 190)),
        ...gel('d_ziv_section_pill', at(96, 330, 720, 52)),
        sticker('d_ziv_section_pill_star', at(114, 340, 34, 34), LIME),
      ],
    },
    {
      id: 'l_ziv_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      background: ground(0.02, 0.98),
      placeholders: [
        ...bigHead.placeholders,
        place('p_number', 'number', at(150, 300, 960, 160), 'display'),
        place('p_label', 'subtitle', at(150, 486, 940, 100), 'heading'),
        place('p_body', 'body', at(150, 604, 940, 250), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(156, top + 22, 464, 76), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', atEnd(156, top + 104, 464, 68), 'caption'),
        ]),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        // The one number on a white tile, with a drop of chrome running off its corner; the
        // three that follow it on capsules of film.
        rect('d_ziv_big_number_tile', at(96, 264, 1060, 640), solid(token('surface')), {
          effects: { radius: 44, shadow: SOFT },
        }),
        ...stats3.flatMap((top, i) =>
          holo(`d_ziv_big_number_stat${i + 1}`, atEnd(96, top, 580, 196), 98, 100 + i * 30),
        ),
        liquid('d_ziv_big_number_pour', atEnd(610, 800, 240, 206), PEBBLE),
        sparkles('d_ziv_big_number_sparkles', at(46, 836, 120, 120)),
        ...bigHead.decorations,
        ...foot('big_number').decorations,
      ],
    },
    {
      id: 'l_ziv_quote',
      name: 'Quote',
      archetype: 'quote',
      background: holoGround(210),
      placeholders: [
        place('p_quote', 'quote', at(176, 196, 1360, 500), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(360, 786, 1100, 50), 'heading'),
        place('p_caption', 'caption', at(360, 842, 1100, 68), 'caption'),
        ...quoteFoot.placeholders,
      ],
      decorations: [
        bubble('d_ziv_quote_bubble', at(66, 120, 1580, 820), 660),
        quoteGlyph(at(24, 52, 290, 200), true),
        sparkles('d_ziv_quote_sparkles', atEnd(60, 136, 170, 170)),
        droplet('d_ziv_quote_drop', atEnd(150, 620, 110, 126)),
        ...quoteFoot.decorations,
      ],
    },
    {
      id: 'l_ziv_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      background: ground(0.02, 0.95),
      placeholders: [
        ...head('text_image', 1000, 2).placeholders,
        place('p_image', 'image', atEnd(130, 140, 560, 780)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(214, top, 950, 52), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(214, top + 58, 950, 126), 'body'),
        ]),
        ...foot('text_image').placeholders,
      ],
      decorations: [
        // The picture sits in a chrome bezel, over a slab of film that runs off the slide.
        ...holo('d_ziv_text_image_film', atEnd(-80, 400, 520, 800), 56, 150),
        rect('d_ziv_text_image_bezel', atEnd(108, 118, 604, 824), chrome(125), {
          effects: { radius: 34, shadow: SOFT },
        }),
        rect('d_ziv_text_image_mat', atEnd(120, 130, 580, 800), solid(token('surface')), {
          effects: { radius: 24 },
        }),
        sparkles('d_ziv_text_image_sparkles', atEnd(610, 64, 170, 170)),
        ...rows3.flatMap((top, i) => [
          ...gel(`d_ziv_text_image_n${i + 1}_pill`, at(96, top - 2, 96, 56)),
          pointNumber(`d_ziv_text_image_n${i + 1}`, at(96, top - 2, 96, 56), i + 1),
        ]),
        ...head('text_image').decorations,
        ...foot('text_image').decorations,
      ],
    },
    {
      id: 'l_ziv_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      background: ground(0.0, 1.0),
      placeholders: [
        // The picture runs from edge to edge; the text stands on a band of film under it,
        // because nothing of a layout can be drawn between a picture and text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 640)),
        place('p_kicker', 'caption', at(166, 707, 420, 34), 'caption', { vAlign: 'middle' }),
        place('p_title', 'title', at(96, 772, 1040, 150), 'title'),
        place('p_body', 'body', atEnd(112, 764, 600, 200), 'body'),
      ],
      decorations: [
        ...holo('d_ziv_full_image_film', atEnd(0, 652, 1920, 428), 0, 160, false),
        // The horizon: a tube of chrome where the picture meets the film.
        rect('d_ziv_full_image_tube', atEnd(-20, 626, 1960, 34), chrome(180), {
          effects: { radius: 17 },
        }),
        ...windowPane('d_ziv_full_image_window', atEnd(80, 696, 664, 290), 46),
        sticker('d_ziv_full_image_star', atEnd(44, 670, 80, 80), '#ffffff'),
        ...gel('d_ziv_full_image_pill', at(96, 698, 508, 52)),
        sticker('d_ziv_full_image_pill_star', at(114, 707, 34, 34), LIME),
      ],
    },
    {
      id: 'l_ziv_cards',
      name: 'Cards',
      archetype: 'cards',
      background: holoGround(300),
      placeholders: [
        ...head('cards').placeholders,
        ...cardStarts.flatMap((start, i) => {
          const [w, top] = [cardWidths[i]!, cardTops[i]!];
          return [
            place(`p_card${i + 1}`, 'subtitle', at(start + 32, top + 100, w - 64, 100), 'heading'),
            place(`p_card${i + 1}_body`, 'body', at(start + 32, top + 212, w - 64, 204), 'body'),
            place(
              `p_card${i + 1}_note`,
              'caption',
              at(start + 104, top + 6, w - 170, 68),
              'caption',
              {
                vAlign: 'middle',
              },
            ),
          ];
        }),
        place('p_takeaway', 'body', at(158, 836, 1622, 84), 'body', { vAlign: 'middle' }),
        ...foot('cards').placeholders,
      ],
      decorations: [
        // Three windows of unequal width, each a step lower: a cascade of open tabs.
        ...cardStarts.flatMap((start, i) => {
          const [w, top] = [cardWidths[i]!, cardTops[i]!];
          const pane = at(start, top, w, 480);
          return [
            ...windowPane(`d_ziv_cards_card${i + 1}`, pane, 80, { status: [0.42, 0.68, 0.86][i]! }),
            sticker(
              `d_ziv_cards_star${i + 1}`,
              { x: pane.x - 34, y: top - 36, w: 80, h: 80 },
              ['#ffffff', '#ff5fc9', LIME][i]!,
            ),
          ];
        }),
        ...gel('d_ziv_cards_takeaway', at(96, 836, 1728, 84)),
        sticker('d_ziv_cards_takeaway_star', at(116, 860, 36, 36), '#ff5fc9'),
        ...head('cards').decorations,
        ...foot('cards').decorations,
      ],
    },
    {
      id: 'l_ziv_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      background: ground(0.0, 1.0),
      placeholders: [
        ...head('timeline').placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start + 30, 346, 336, 84), 'title', {
            vAlign: 'middle',
          }),
          place(`p_what${i + 1}`, 'subtitle', at(start, 486, 396, 100), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start, 594, 396, 230), 'body'),
        ]),
        place('p_note', 'caption', at(96, 872, 1728, 68), 'caption'),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        // The year as a tube of chrome from edge to edge, with a gel stop for each date.
        ...holo('d_ziv_timeline_film', at(1400, 462, 452, 392), 36, 135),
        rect('d_ziv_timeline_tube', atEnd(-20, 372, 1960, 32), chrome(180), {
          effects: { radius: 16, shadow: SOFT },
        }),
        ...columns4.flatMap((start, i) =>
          gel(`d_ziv_timeline_stop${i + 1}`, at(start, 336, 396, 104)),
        ),
        sparkles('d_ziv_timeline_sparkles', atEnd(24, 246, 110, 110)),
        ...head('timeline').decorations,
        ...foot('timeline').decorations,
      ],
    },
    {
      id: 'l_ziv_process',
      name: 'Process',
      archetype: 'process',
      background: ground(1.0, 1.0),
      placeholders: [
        ...head('process', 1728, 2).placeholders,
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}_number`, 'number', at(start + 40, 430, 240, 56), 'heading', {
            align: 'center',
            vAlign: 'middle',
          }),
          place(`p_step${i + 1}`, 'subtitle', at(start + 18, 508, 284, 100), 'heading', {
            align: 'center',
          }),
          place(`p_step${i + 1}_body`, 'caption', at(start + 18, 614, 284, 190), 'caption', {
            align: 'center',
          }),
        ]),
        place('p_summary', 'body', at(158, 840, 1622, 84), 'body', { vAlign: 'middle' }),
        ...foot('process').placeholders,
      ],
      decorations: [
        // Five gel capsules on one line of chrome; the last is of film, where the steps lead.
        rect('d_ziv_process_line', atEnd(-20, 398, 1960, 16), chrome(180), {
          effects: { radius: 8 },
        }),
        ...steps5.flatMap((start, i) => [
          ...(i === 4
            ? holo(`d_ziv_process_step${i + 1}`, at(start, 312, 320, 508), 60, 150)
            : [
                rect(`d_ziv_process_step${i + 1}`, at(start, 312, 320, 508), GEL, {
                  stroke: { color: token('text', 0.28), width: 1.5 },
                  effects: { radius: 60, shadow: SOFT },
                }),
              ]),
          label(
            `d_ziv_process_n${i + 1}`,
            at(start, 330, 320, 80),
            String(i + 1).padStart(2, '0'),
            'title',
            {
              color: token('primary'),
              dir: 'auto',
              align: 'center',
              vAlign: 'middle',
            },
          ),
          rect(
            `d_ziv_process_chip${i + 1}`,
            at(start + 34, 428, 252, 60),
            solid(token('surface')),
            {
              stroke: { color: token('text', 0.5), width: 1.5 },
              effects: { radius: 30 },
            },
          ),
        ]),
        ...gel('d_ziv_process_summary', at(96, 840, 1728, 84)),
        sticker('d_ziv_process_summary_star', at(116, 864, 36, 36), LIME),
        ...head('process').decorations,
        ...foot('process').decorations,
      ],
    },
    {
      id: 'l_ziv_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      background: ground(1.0, 0.0, 0.5),
      placeholders: [
        ...head('comparison').placeholders,
        place('p_before_tag', 'caption', at(200, 276, 690, 50), 'caption', { vAlign: 'middle' }),
        place('p_before', 'subtitle', at(136, 352, 750, 100), 'heading'),
        place('p_before_body', 'body', at(136, 472, 750, 400), 'body'),
        place('p_after_tag', 'caption', atEnd(150, 291, 446, 34), 'caption', { vAlign: 'middle' }),
        place('p_after', 'subtitle', atEnd(130, 352, 770, 100), 'heading'),
        place('p_after_body', 'body', atEnd(130, 472, 770, 420), 'body'),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        // What was is a plain grey window; what is, a sheet of film that runs off the slide.
        ...holo('d_ziv_comparison_film', atEnd(-60, 248, 1004, 900), 64, 130),
        ...windowPane('d_ziv_comparison_before', at(96, 262, 830, 640), 64, { muted: true }),
        ...gel('d_ziv_comparison_pill', atEnd(130, 282, 520, 52)),
        sticker('d_ziv_comparison_pill_star', atEnd(604, 291, 34, 34), LIME),
        bezel('d_ziv_comparison_bezel', around(960, 580, 66)),
        drawing('d_ziv_comparison_arrow', around(960, 580, 26), ARROW, PAINT),
        sparkles('d_ziv_comparison_sparkles', atEnd(20, 196, 110, 110)),
        ...head('comparison').decorations,
        ...foot('comparison').decorations,
      ],
    },
    {
      id: 'l_ziv_chart',
      name: 'Chart',
      archetype: 'chart',
      background: ground(1.0, 1.0, 0.6),
      placeholders: [
        ...head('chart').placeholders,
        place('p_chart', 'chart', at(128, 318, 1066, 572)),
        place('p_stat1', 'number', atEnd(100, 280, 470, 150), 'display'),
        place('p_stat1_body', 'body', atEnd(100, 434, 460, 84), 'body'),
        place('p_stat2', 'number', atEnd(100, 534, 470, 150), 'display'),
        place('p_stat2_body', 'body', atEnd(100, 688, 460, 84), 'body'),
        place('p_source', 'caption', atEnd(100, 800, 460, 102), 'caption'),
        ...foot('chart').placeholders,
      ],
      decorations: [
        ...holo('d_ziv_chart_film', atEnd(-40, 252, 640, 660), 48, 160),
        ...windowPane('d_ziv_chart_window', at(96, 252, 1130, 660), 50),
        sparkles('d_ziv_chart_sparkles', atEnd(250, 150, 90, 90)),
        ...head('chart').decorations,
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_ziv_table',
      name: 'Table',
      archetype: 'table',
      background: ground(0.0, 0.0, 0.6),
      placeholders: [
        ...head('table').placeholders,
        place('p_table', 'table', at(124, 284, 1672, 592)),
        place('p_note', 'caption', at(96, 894, 1728, 56), 'caption'),
        ...foot('table').placeholders,
      ],
      decorations: [
        ...holo('d_ziv_table_film', at(-60, 560, 760, 560), 56, 120),
        ...windowPane('d_ziv_table_window', at(96, 236, 1728, 648), 36),
        sticker('d_ziv_table_star', atEnd(52, 196, 96, 96), '#ff5fc9'),
        ...head('table').decorations,
        ...foot('table').decorations,
      ],
    },
    {
      id: 'l_ziv_team',
      name: 'Team',
      archetype: 'team',
      background: ground(1.0, 1.0, 0.6),
      placeholders: [
        ...head('team').placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start + 30, 262, 336, 336)),
          place(`p_person${i + 1}`, 'subtitle', at(start + 14, 640, 368, 50), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start + 14, 694, 368, 68), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start + 14, 766, 368, 170), 'body'),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: [
        // A band of film behind the portraits, each in a bezel of chrome.
        ...holo('d_ziv_team_film', atEnd(0, 340, 1920, 190), 0, 100, false),
        ...columns4.flatMap((start, i) => [
          rect(`d_ziv_team_bezel${i + 1}`, at(start + 14, 246, 368, 368), chrome(115 + i * 20), {
            effects: { radius: 32, shadow: SOFT },
          }),
          rect(`d_ziv_team_mat${i + 1}`, at(start + 24, 256, 348, 348), solid(token('surface')), {
            effects: { radius: 22 },
          }),
        ]),
        sparkles('d_ziv_team_sparkles', atEnd(16, 226, 100, 100)),
        ...head('team').decorations,
        ...foot('team').decorations,
      ],
    },
    {
      id: 'l_ziv_closing',
      name: 'Closing',
      archetype: 'closing',
      background: ground(0.0, 1.0, 0.9),
      placeholders: [
        place('p_kicker', 'caption', at(96, 104, 1100, 68), 'caption', { vAlign: 'bottom' }),
        place('p_title', 'title', at(96, 190, 1300, 300), 'display'),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(160, top, 1060, 84), 'body', { vAlign: 'middle' }),
        ),
        place('p_contact', 'caption', at(96, 958, 1100, 34), 'caption'),
      ],
      decorations: [
        // The pour of the opening slide, now rising from the far lower corner.
        // The sculpture again, settled: a pool of chrome on the floor, in a ring of chrome.
        rect('d_ziv_closing_moon', atEnd(-100, 440, 640, 640), holoFill(40), {
          geometry: { kind: 'preset', preset: 'ellipse' },
        }),
        chromeRing('d_ziv_closing_ring', atEnd(-160, 380, 760, 760), 22),
        liquid('d_ziv_closing_pour', atEnd(-80, 600, 780, 560), POOL),
        droplet('d_ziv_closing_drop', atEnd(380, 280, 100, 116)),
        sparkles('d_ziv_closing_sparkles', atEnd(150, 240, 190, 190)),
        ...lines3.flatMap((top, i) => [
          ...gel(`d_ziv_closing_line${i + 1}`, at(96, top, 1160, 84)),
          sticker(
            `d_ziv_closing_star${i + 1}`,
            at(116, top + 24, 36, 36),
            [LIME, '#ff5fc9', '#ffffff'][i]!,
          ),
        ]),
        mark('d_ziv_closing_mark', at(96, 874, 60, 60)),
      ],
    },
  ];
}

/**
 * The layouts the mirror gets wrong for a left-to-right deck. Only the quote: its mark is a
 * glyph of the direction. The grounds are the model's own gradients, which the mirror turns.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  const quote = drawn.find((layout) => layout.id === 'l_ziv_quote');
  if (!quote) return [];
  const mirrored = mirrorLayout(quote);
  return [
    {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) =>
        decoration.id === 'd_ziv_quote_glyph' ? quoteGlyph(decoration.frame, false) : decoration,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: the launch of an invented beauty-tech ring, slide by slide

const FOOTER = text('PELIA HALO · LAUNCH 2027');
const ORDERS = [2.1, 3.4, 4.8, 6.9, 9.2, 12.6];
const FORECAST = [2.0, 2.6, 3.2, 3.8, 4.3, 4.8];
const TABLE_COLS = [592, 360, 360, 360];
const TABLE_ROW = 70;
const TEAM = [
  { assetId: pictures.zivTeam1.id },
  { assetId: pictures.zivTeam2.id },
  { assetId: pictures.zivTeam3.id },
  { assetId: pictures.zivTeam4.id },
];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_ziv_hero',
    name: 'פתיחה',
    content: {
      caption: [text('PELIA · LAUNCH 2027'), text('ערב ההשקה · הסטודיו ביפו · 14 באפריל 2027')],
      title: text('Pelia Halo', 'כבר כאן'),
      subtitle: text('טבעת כרום חכמה שמודדת שמש, שינה ולחות, ומספרת לעור מה הוא צריך'),
    },
  },
  {
    layout: 'l_ziv_section',
    name: 'המוצר',
    content: {
      number: text('01'),
      caption: text('PART ONE · המוצר'),
      title: text('טבעת אחת'),
      subtitle: text('שלושה חיישנים, 3.2 גרם, ואור שמשתנה יחד איתך.'),
    },
  },
  {
    layout: 'l_ziv_big_number',
    name: 'סוללה',
    content: {
      caption: [
        text('BATTERY'),
        text('גרם בלבד, קלה יותר מעגיל'),
        text('מדידה רציפה של שמש, שינה ולחות'),
        text('עמידה במים, גם בבריכה ובים'),
      ],
      title: text('סוללה שפשוט שוכחים ממנה'),
      number: [text('11'), text('3.2'), text('24/7'), text('IP68')],
      subtitle: text('ימים על טעינה אחת'),
      body: text(
        'הדור הראשון החזיק ארבעה ימים. שבב שנרדם בין מדידה למדידה וסוללה גמישה שמקיפה את כל הטבעת האריכו את הזמן כמעט פי שלושה.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_cards',
    name: 'שלושה חיישנים',
    content: {
      caption: [
        text('THREE SENSORS'),
        text('UV · חשיפה לשמש'),
        text('SLEEP · שינה והתאוששות'),
        text('HYDRATION · לחות העור'),
      ],
      title: text('שלושה חיישנים, תמונה אחת של העור'),
      subtitle: [text('יודעת מתי מספיק'), text('לילה טוב, במספרים'), text('מים לפני שהעור מבקש')],
      body: [
        text('הטבעת סופרת את קרינת השמש לאורך היום, ומזכירה לחדש קרם הגנה לפני שהעור נשרף.'),
        text('דופק, חום גוף ותנועה מצטרפים לציון אחד, שמסביר למה קמתם עייפים.'),
        text('חיישן בפנים הטבעת מודד את לחות העור, ומאיר בתכלת כשהגוף צריך מים.'),
        text('והרביעי: האור. הטבעת משנה גוון לפי מה שהיא מודדת, בלי מסך ובלי התראות.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_text_image',
    name: 'האור',
    content: {
      caption: text('INSIDE THE RING'),
      title: text('אור קטן שעושה הרבה'),
      image: { assetId: pictures.zivFiber.id },
      subtitle: [
        text('סיב אור אחד, 16 גוונים'),
        text('בלי מסך ובלי רעש'),
        text('מתעדכנת לבד בלילה'),
      ],
      body: [
        text('סיב אופטי דק מקיף את הטבעת ומפזר אור רך, שרואים מכל זווית גם באור יום.'),
        text('הטבעת לא מזמזמת ולא מציגה מספרים. שינוי עדין בגוון אומר את כל מה שצריך.'),
        text('בכל לילה, על המטען, היא מקבלת עדכונים ומכיילת מחדש את החיישנים.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_chart',
    name: 'הזמנות מוקדמות',
    content: {
      caption: [text('PRE-ORDERS'), text('מקור: מערכת ההזמנות של Pelia, אלפי הזמנות בשבוע.')],
      title: text('ההזמנות המוקדמות עקפו את התחזית'),
      number: [text('+163%'), text('38%')],
      body: [
        text('מעל התחזית, שלושה שבועות לפני ההשקה.'),
        text('מהמזמינים קנו שתי טבעות, אחת למישהו קרוב.'),
      ],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'הזמנות מוקדמות לפי שבוע, באלפים',
      data: {
        categories: ['שבוע 1', 'שבוע 2', 'שבוע 3', 'שבוע 4', 'שבוע 5', 'שבוע 6'],
        series: [
          { name: 'הזמנות', values: ORDERS },
          { name: 'תחזית', values: FORECAST },
        ],
      },
    },
  },
  {
    layout: 'l_ziv_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('WHAT CHANGED'), text('הדור הראשון · 2025'), text('Halo · 2027')],
      title: text('מה השתנה מאז הטבעת הראשונה'),
      subtitle: [text('טבעת טיטניום עם אפליקציה'), text('טבעת כרום שמדברת באור')],
      body: [
        bullets(
          'סוללה לארבעה ימים',
          'שני חיישנים: שינה ודופק',
          'כל המידע רק באפליקציה',
          'שלוש מידות בלבד',
        ),
        bullets(
          'סוללה לאחד-עשר ימים',
          'שלושה חיישנים, כולל שמש ולחות',
          'האור על הטבעת עונה בלי להוציא טלפון',
          'תשע מידות, וטבעת מדידה שמגיעה הביתה',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_table',
    name: 'מהדורות',
    content: {
      caption: [
        text('EDITIONS'),
        text('המחירים בשקלים, כולל מע״מ ומשלוח. מנוי Pelia+ כלול בשנה הראשונה בכל מהדורה.'),
      ],
      title: text('שלוש מהדורות, טבעת אחת'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['מה כלול', 'Chrome', 'Opal', 'Aura'],
        ['מחיר', '₪890', '₪1,190', '₪1,590'],
        ['גימור', 'כרום מבריק', 'אופל צבעוני', 'כרום ורוד'],
        ['גוונים של אור', '4', '16', '16'],
        ['סוללה', '11 ימים', '11 ימים', '14 ימים'],
        ['מטען', 'בסיס מגנטי', 'בסיס מגנטי', 'קופסת טעינה'],
        ['אחריות', 'שנה', 'שנתיים', 'שלוש שנים'],
      ],
    },
  },
  {
    layout: 'l_ziv_process',
    name: 'מהקופסה',
    content: {
      caption: [
        text('HOW IT STARTS'),
        text('טבעת מדידה מגיעה הביתה עוד לפני ההזמנה.'),
        text('בוחרים גימור ומידה, ומחליפים אם צריך.'),
        text('הבסיס המגנטי טוען עד הסוף בפחות משעה.'),
        text('האפליקציה מוצאת את הטבעת בלחיצה אחת.'),
        text('ומשם הטבעת עובדת לבד, ביום ובלילה.'),
      ],
      title: text('מהקופסה לאור הראשון בחמישה צעדים'),
      subtitle: [text('מודדים'), text('בוחרים'), text('טוענים'), text('מחברים'), text('עונדים')],
      number: [text('2 דק׳'), text('1 דק׳'), text('40 דק׳'), text('30 שנ׳'), text('11 ימים')],
      body: text('פחות משעה מפתיחת הקופסה ועד שהטבעת מאירה בפעם הראשונה.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_section',
    name: 'מה הלאה',
    content: {
      number: text('02'),
      caption: text('PART TWO · ההשקה'),
      title: text('מה הלאה'),
      subtitle: text('ערב ההשקה, מפת הדרכים, והאנשים שמאחורי הטבעת.'),
    },
  },
  {
    layout: 'l_ziv_timeline',
    name: 'מפת דרכים',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text('התאריכים הם יעדים. עדכונים שוטפים מתפרסמים ב-pelia.example/halo.'),
      ],
      title: text('ארבע תחנות בשנת ההשקה'),
      number: [text('אפר׳'), text('יוני'), text('ספט׳'), text('דצמ׳')],
      subtitle: [
        text('ההשקה ביפו'),
        text('אפליקציה חדשה'),
        text('חנויות פופ-אפ'),
        text('מהדורת חורף'),
      ],
      body: [
        text('המשלוחים הראשונים יוצאים ל-12 אלף המזמינים, והסטודיו נפתח לקהל.'),
        text('מסך אחד לעור, לשינה ולשמש, עם המלצה יומית שנכתבת לפי המדידות שלכם.'),
        text('תל אביב, חיפה ובאר שבע: מדידה, התאמה ואיסוף באותו ביקור.'),
        text('גימור כרום כהה, וגוונים חדשים של אור לערבי החורף הארוכים.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_full_image',
    name: 'הסטודיו',
    content: {
      image: { assetId: pictures.zivStudio.id },
      caption: text('THE STUDIO'),
      title: text('הסטודיו ביפו', 'פתוח לכולם'),
      body: text('מדידה, התאמה וערב של אור: בכל יום חמישי עד הקיץ, עם צוות המוצר עצמו.'),
    },
  },
  {
    layout: 'l_ziv_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'חשבתי שזה עוד גאדג׳ט. אחרי שבוע גיליתי שאני שותה יותר, ישנה טוב יותר, ובודקת את הטלפון הרבה פחות.',
      ),
      attribution: text('נועה ברק'),
      caption: text('מאפרת ראשית בתיאטרון העירוני · בודקת בטא מאז ינואר 2027'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_team',
    name: 'הצוות',
    content: {
      caption: [
        text('THE TEAM'),
        text('מייסדת ומנכ״לית'),
        text('ראש צוות החומרה'),
        text('מהנדס חיישנים'),
        text('מעצבת ראשית'),
      ],
      title: text('האנשים שמאחורי הטבעת'),
      image: TEAM,
      subtitle: [text('דנה אלמוג'), text('גיל שחר'), text('רועי מזרחי'), text('אורית לוי')],
      body: [
        text('הקימה את החברה ב-2023, אחרי עשור בפיתוח מוצרי טיפוח.'),
        text('תכנן את הסוללה הגמישה שמקיפה את כל הטבעת.'),
        text('לימד את הטבעת למדוד לחות דרך העור, בלי שום מגע נוסף.'),
        text('עיצבה טבעת שאפשר לענוד גם לערב חגיגי.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_closing',
    name: 'סיום',
    content: {
      caption: [text('PRE-ORDER TONIGHT'), text('hello@pelia.example · pelia.example/halo')],
      title: text('נתראה', 'באור'),
      body: [
        text('ההזמנות נפתחות הערב, באתר ובסטודיו ביפו'),
        text('המשלוחים הראשונים יוצאים ב-14 באפריל'),
        text('מי שמזמין הערב מקבל שנתיים של Pelia+'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_ziv_hero',
    name: 'Cover',
    content: {
      caption: [
        text('PELIA · LAUNCH 2027'),
        text('Launch night · The Jaffa studio · 14 April 2027'),
      ],
      title: text('Pelia Halo', 'is here'),
      subtitle: text(
        'A chrome smart ring that reads sun, sleep and hydration, and tells your skin what it needs',
      ),
    },
  },
  {
    layout: 'l_ziv_section',
    name: 'The product',
    content: {
      number: text('01'),
      caption: text('PART ONE · THE PRODUCT'),
      title: text('One ring'),
      subtitle: text('Three sensors, 3.2 grams, and a light that changes with you.'),
    },
  },
  {
    layout: 'l_ziv_big_number',
    name: 'Battery',
    content: {
      caption: [
        text('BATTERY'),
        text('grams in all, lighter than an earring'),
        text('tracking of sun, sleep and hydration'),
        text('water resistant, in the pool and the sea'),
      ],
      title: text('A battery you forget about'),
      number: [text('11'), text('3.2'), text('24/7'), text('IP68')],
      subtitle: text('days on a single charge'),
      body: text(
        'The first generation lasted four days. A chip that sleeps between readings and a flexible battery that wraps the whole ring nearly tripled it.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_cards',
    name: 'Three sensors',
    content: {
      caption: [
        text('THREE SENSORS'),
        text('UV · Sun exposure'),
        text('SLEEP · Rest and recovery'),
        text('HYDRATION · Skin moisture'),
      ],
      title: text('Three sensors, one picture of your skin'),
      subtitle: [
        text('Knows when it is enough'),
        text('A good night, in numbers'),
        text('Water before skin asks'),
      ],
      body: [
        text(
          'Halo counts UV through the day and reminds you to reapply sunscreen before you burn.',
        ),
        text('Pulse, temperature and movement add up to one score that explains a tired morning.'),
        text('A sensor inside the ring reads skin moisture and glows aqua when you need water.'),
        text(
          'And the fourth: light. The ring changes colour with what it measures, with no screen and no alerts.',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_text_image',
    name: 'The light',
    content: {
      caption: text('INSIDE THE RING'),
      title: text('A small light that does a lot'),
      image: { assetId: pictures.zivFiber.id },
      subtitle: [
        text('One fibre, 16 shades'),
        text('No screen, no noise'),
        text('Updates while you sleep'),
      ],
      body: [
        text(
          'A thin optical fibre runs round the ring and spreads a soft light you can see in daylight.',
        ),
        text('The ring never buzzes or shows numbers. A gentle change of colour says it all.'),
        text('Every night on the charger, Halo takes its updates and recalibrates its sensors.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_chart',
    name: 'Pre-orders',
    content: {
      caption: [
        text('PRE-ORDERS'),
        text('Source: the Pelia order system, thousands of orders a week.'),
      ],
      title: text('Pre-orders beat the forecast'),
      number: [text('+163%'), text('38%')],
      body: [
        text('above forecast, three weeks before launch.'),
        text('of buyers ordered two rings, one to give.'),
      ],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'Pre-orders by week, thousands',
      data: {
        categories: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
        series: [
          { name: 'Orders', values: ORDERS },
          { name: 'Forecast', values: FORECAST },
        ],
      },
    },
  },
  {
    layout: 'l_ziv_comparison',
    name: 'Before and after',
    content: {
      caption: [text('WHAT CHANGED'), text('First generation · 2025'), text('Halo · 2027')],
      title: text('What changed since the first ring'),
      subtitle: [text('A titanium ring with an app'), text('A chrome ring that speaks in light')],
      body: [
        bullets(
          'A four-day battery',
          'Two sensors: sleep and pulse',
          'Everything only in the app',
          'Three sizes only',
        ),
        bullets(
          'An eleven-day battery',
          'Three sensors, with sun and hydration',
          'Light on the ring, no phone needed',
          'Nine sizes, and a sizing ring sent home',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_table',
    name: 'Editions',
    content: {
      caption: [
        text('EDITIONS'),
        text(
          'Prices in shekels, VAT and delivery included. Pelia+ comes free for the first year with every edition.',
        ),
      ],
      title: text('Three editions, one ring'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['What you get', 'Chrome', 'Opal', 'Aura'],
        ['Price', '₪890', '₪1,190', '₪1,590'],
        ['Finish', 'Polished chrome', 'Iridescent opal', 'Rose chrome'],
        ['Shades of light', '4', '16', '16'],
        ['Battery', '11 days', '11 days', '14 days'],
        ['Charger', 'Magnetic base', 'Magnetic base', 'Charging case'],
        ['Warranty', 'One year', 'Two years', 'Three years'],
      ],
    },
  },
  {
    layout: 'l_ziv_process',
    name: 'Out of the box',
    content: {
      caption: [
        text('HOW IT STARTS'),
        text('A sizing ring arrives before you order.'),
        text('Pick a finish and a size, and swap if needed.'),
        text('The magnetic base charges it in under an hour.'),
        text('The app finds the ring with a single tap.'),
        text('From there the ring works alone, day and night.'),
      ],
      title: text('From the box to the first glow in five steps'),
      subtitle: [text('Measure'), text('Choose'), text('Charge'), text('Pair'), text('Wear')],
      number: [text('2 min'), text('1 min'), text('40 min'), text('30 sec'), text('11 days')],
      body: text('Under an hour from opening the box to the ring’s first glow.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_section',
    name: 'What’s next',
    content: {
      number: text('02'),
      caption: text('PART TWO · THE LAUNCH'),
      title: text('What’s next'),
      subtitle: text('Launch night, the roadmap, and the people behind the ring.'),
    },
  },
  {
    layout: 'l_ziv_timeline',
    name: 'Roadmap',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text('Dates are targets. Updates are published at pelia.example/halo.'),
      ],
      title: text('Four stops in the launch year'),
      number: [text('Apr'), text('Jun'), text('Sep'), text('Dec')],
      subtitle: [
        text('Launch in Jaffa'),
        text('A new app'),
        text('Pop-up stores'),
        text('Winter edition'),
      ],
      body: [
        text('First deliveries to 12 thousand early buyers, and the studio opens to all.'),
        text('One screen for skin, sleep and sun, with a daily tip written from your readings.'),
        text('Tel Aviv, Haifa and Beersheba: sizing, fitting and pick-up in one visit.'),
        text('A dark chrome finish, and new shades of light for long winter evenings.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_full_image',
    name: 'The studio',
    content: {
      image: { assetId: pictures.zivStudio.id },
      caption: text('THE STUDIO'),
      title: text('The Jaffa studio', 'is open to all'),
      body: text(
        'Sizing, fitting and an evening of light: every Thursday until summer, with the product team itself.',
      ),
    },
  },
  {
    layout: 'l_ziv_quote',
    name: 'Quote',
    content: {
      quote: text(
        'I thought it was another gadget. A week later I was drinking more water, sleeping better and checking my phone far less.',
      ),
      attribution: text('Noa Barak'),
      caption: text('Head make-up artist, the City Theatre · beta tester since January 2027'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_team',
    name: 'The team',
    content: {
      caption: [
        text('THE TEAM'),
        text('Founder and CEO'),
        text('Head of hardware'),
        text('Sensor engineer'),
        text('Lead designer'),
      ],
      title: text('The people behind the ring'),
      image: TEAM,
      subtitle: [text('Dana Almog'), text('Gil Shahar'), text('Roy Mizrahi'), text('Orit Levy')],
      body: [
        text('Founded Pelia in 2023, after a decade in skincare development.'),
        text('Designed the flexible battery that wraps the whole ring.'),
        text('Taught the ring to read skin moisture with no extra touch.'),
        text('Designed a ring you can also wear to a gala.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_ziv_closing',
    name: 'Closing',
    content: {
      caption: [text('PRE-ORDER TONIGHT'), text('hello@pelia.example · pelia.example/halo')],
      title: text('See you', 'in the light'),
      body: [
        text('Orders open tonight, online and at the Jaffa studio'),
        text('The first deliveries leave on 14 April'),
        text('Order tonight and get two years of Pelia+'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const zivSamples = { he: sampleHe, en: sampleEn };

/** The Ziv template: the theme, fourteen layouts for both directions, and its sample deck. */
export function zivTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(zivTheme),
    description:
      'Radiance: liquid chrome, holographic film and sparkles on pearl, for launches, beauty and music.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.zivFiber,
      pictures.zivStudio,
      pictures.zivTeam1,
      pictures.zivTeam2,
      pictures.zivTeam3,
      pictures.zivTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
