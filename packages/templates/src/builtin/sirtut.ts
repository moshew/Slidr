import type { Background, Element, Frame, Layout, Theme } from '@slidr/model';
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
 * Sirtut (שרטוט, a technical drawing): the idea presented as an engineer's plan. A saturated
 * blueprint blue sheet with a drafting grid and a double border; white linework, dimension
 * lines, centrelines and detail tags; a title block in the lower corner of every content slide,
 * where the deck's name, the scale and the sheet's number sit in their cells. Safety yellow is
 * the lettering that matters (the big numbers, the cover's title) and the red of a pencil rings
 * the one figure a slide is about.
 *
 * The heading font is Karantina, a condensed face that reads like engineering lettering, set big;
 * the running text is Open Sans. Every colour of the palette reads on the blue: yellow takes the
 * blue as its text in a table's header row, and the red, too faint for small text, is only
 * drawn.
 */
export const sirtutTheme: Theme = {
  id: 'sirtut',
  name: 'Sirtut',
  colors: {
    bg: '#14449c',
    surface: '#1a51b5',
    text: '#ffffff',
    muted: '#c3d4ff',
    primary: '#ffd23f',
    secondary: '#9cbdff',
    accent: '#ff7361',
    chart: ['#ffd23f', '#ffffff', '#9cbdff', '#ff7361', '#6fe3c8', '#c3d4ff'],
  },
  fonts: {
    heading: { he: 'Karantina', latin: 'Karantina' },
    body: { he: 'Open Sans', latin: 'Open Sans' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 180,
      weight: 700,
      lineHeight: 0.9,
      color: { token: 'primary' },
    },
    title: { font: 'heading', size: 96, weight: 700, lineHeight: 1, color: { token: 'text' } },
    heading: { font: 'heading', size: 54, weight: 700, lineHeight: 1.05, color: { token: 'text' } },
    body: { font: 'body', size: 26, weight: 400, lineHeight: 1.45, color: { token: 'text' } },
    caption: {
      font: 'body',
      size: 24,
      weight: 600,
      lineHeight: 1.35,
      letterSpacing: 0.5,
      color: { token: 'muted' },
    },
  },
  radius: 0,
  shadow: { x: 0, y: 0, blur: 0, color: { token: 'bg', alpha: 0 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  // The sheet under a lamp, and the deeper cyanotype of the opening and closing slides.
  backgroundVariants: [
    {
      fill: { kind: 'solid', color: { token: 'bg' } },
      overlay: {
        kind: 'radial',
        center: { x: 0.5, y: 0.4 },
        stops: [
          { color: { token: 'surface', alpha: 0.8 }, at: 0 },
          { color: { token: 'surface', alpha: 0 }, at: 0.75 },
        ],
      },
    },
    {
      fill: {
        kind: 'linear',
        angle: 160,
        stops: [
          { color: { token: 'bg' }, at: 0 },
          { color: { value: '#0d3278' }, at: 1 },
        ],
      },
    },
    { fill: { kind: 'solid', color: { token: 'surface' } } },
  ],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

const WHITE = '#ffffff';
const YELLOW = '#ffd23f';
const RED = '#ff7361';
const BLUE = '#14449c';
const PALE = '#9cbdff';

/** The literal colours of the drawings, and the tokens they stand for. */
const PAINT = {
  [WHITE]: token('text'),
  [YELLOW]: token('primary'),
  [RED]: token('accent'),
  [BLUE]: token('bg'),
  [PALE]: token('secondary'),
};

/** A drawing whose markup is measured in the slide pixels of its own frame. */
const ink = (id: string, frame: Frame, body: string): Element =>
  drawing(id, frame, `<svg viewBox="0 0 ${frame.w} ${frame.h}" fill="none">${body}</svg>`, PAINT);

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The ground of a content slide: the blue sheet, lit a little where the content stands. */
const ground = (x = 0.5, y = 0.45): Background => ({
  fill: solid(token('bg')),
  overlay: {
    kind: 'radial',
    center: { x, y },
    stops: [
      { color: token('surface', 0.75), at: 0 },
      { color: token('surface', 0), at: 0.8 },
    ],
  },
});

/**
 * The ground of the opening, the dividers and the closing: a deeper cyanotype, with the light
 * on the side where the drawing is.
 */
const deep = (x: number, y = 0.5): Background => ({
  fill: {
    kind: 'linear',
    angle: 160,
    stops: [
      { color: token('bg'), at: 0 },
      { color: { value: '#0b2c6c' }, at: 0.75 },
    ],
  },
  overlay: {
    kind: 'radial',
    center: { x, y },
    stops: [
      { color: token('surface', 0.85), at: 0 },
      { color: token('surface', 0), at: 0.55 },
    ],
  },
});

/**
 * The drawing sheet: a grid of minor lines every 24px and major ones every 120px, a double
 * border inset from the edge, the zone ticks in its margin and the centring marks at the middle
 * of each side. It is the same from both sides, so the mirror leaves it as it is.
 */
function sheet(id: string): Element {
  let minor = '';
  let major = '';
  for (let x = 48; x < 1878; x += 24) {
    if (x % 120 === 0) major += `M${x} 42V1038`;
    else minor += `M${x} 42V1038`;
  }
  for (let y = 48; y < 1038; y += 24) {
    if (y % 120 === 0) major += `M42 ${y}H1878`;
    else minor += `M42 ${y}H1878`;
  }
  let ticks = '';
  for (let x = 272; x < 1880; x += 240) ticks += `M${x} 16V32M${x} 1048V1064`;
  for (let y = 180; y < 1040; y += 240) ticks += `M16 ${y}H32M1888 ${y}H1904`;
  const centring = 'M960 8V42M960 1038V1072M8 540H42M1878 540H1912';
  return ink(
    id,
    { x: 0, y: 0, w: 1920, h: 1080 },
    `<path d="${minor}" stroke="${WHITE}" stroke-opacity="0.075" stroke-width="1"/>` +
      `<path d="${major}" stroke="${WHITE}" stroke-opacity="0.17" stroke-width="1.5"/>` +
      `<rect x="32" y="32" width="1856" height="1016" stroke="${WHITE}" stroke-opacity="0.85" stroke-width="3"/>` +
      `<rect x="42" y="42" width="1836" height="996" stroke="${WHITE}" stroke-opacity="0.4" stroke-width="1"/>` +
      `<path d="${ticks}" stroke="${WHITE}" stroke-opacity="0.6" stroke-width="2"/>` +
      `<path d="${centring}" stroke="${WHITE}" stroke-width="3"/>`,
  );
}

/** An arrowhead at (x, y) pointing along (dx, dy), a unit vector. */
function arrowhead(x: number, y: number, dx: number, dy: number, size = 18): string {
  const bx = x - dx * size;
  const by = y - dy * size;
  const nx = -dy * size * 0.32;
  const ny = dx * size * 0.32;
  return `M${r1(x)} ${r1(y)}L${r1(bx + nx)} ${r1(by + ny)}L${r1(bx - nx)} ${r1(by - ny)}Z`;
}

/**
 * A horizontal dimension line across its frame: extension lines at both ends that rise from
 * the bottom (or hang from the top), and arrowheads, or the architect's 45° ticks.
 */
function dimension(
  id: string,
  frame: Frame,
  rest: { color?: string; ends?: 'arrow' | 'tick'; from?: 'below' | 'above'; width?: number } = {},
): Element {
  const { color = YELLOW, ends = 'arrow', from = 'below', width = 3 } = rest;
  const { w, h } = frame;
  const y = r1(h / 2);
  const ext =
    from === 'below'
      ? `M2 ${y - 12}V${h}M${w - 2} ${y - 12}V${h}`
      : `M2 0V${y + 12}M${w - 2} 0V${y + 12}`;
  const marks =
    ends === 'arrow'
      ? `<path d="${arrowhead(2, y, -1, 0)}${arrowhead(w - 2, y, 1, 0)}" fill="${color}"/>`
      : `<path d="M${-8 + 2} ${y + 10}L${2 + 10} ${y - 10}M${w - 12} ${y + 10}L${w + 6} ${y - 10}" stroke="${color}" stroke-width="${width + 1}"/>`;
  return ink(
    id,
    frame,
    `<path d="${ext}" stroke="${color}" stroke-width="1.5" stroke-opacity="0.8"/>` +
      `<path d="M2 ${y}H${w - 2}" stroke="${color}" stroke-width="${width}"/>${marks}`,
  );
}

/** The same, standing: a dimension line down its frame, the extension lines on its end side. */
function dimensionUp(id: string, frame: Frame, color = WHITE): Element {
  const { w, h } = frame;
  const x = r1(w / 2);
  return ink(
    id,
    frame,
    `<path d="M${x - 12} 2H${w}M${x - 12} ${h - 2}H${w}" stroke="${color}" stroke-width="1.5" stroke-opacity="0.8"/>` +
      `<path d="M${x} 2V${h - 2}" stroke="${color}" stroke-width="2.5"/>` +
      `<path d="${arrowhead(x, 2, 0, -1)}${arrowhead(x, h - 2, 0, 1)}" fill="${color}"/>`,
  );
}

/** A centreline: the long dash and the short one, through the middle of its frame. */
function centreline(id: string, frame: Frame, opacity = 0.55): Element {
  const across = frame.w >= frame.h;
  const d = across ? `M0 ${r1(frame.h / 2)}H${frame.w}` : `M${r1(frame.w / 2)} 0V${frame.h}`;
  return ink(
    id,
    frame,
    `<path d="${d}" stroke="${WHITE}" stroke-opacity="${opacity}" stroke-width="2" stroke-dasharray="44 10 8 10"/>`,
  );
}

/** Corner ticks: the four L-marks a draughtsman puts where a box would be. */
function corners(
  id: string,
  frame: Frame,
  rest: { len?: number; color?: string; width?: number } = {},
): Element {
  const { len = 32, color = WHITE, width = 3 } = rest;
  const { w, h } = frame;
  const k = width / 2;
  const d =
    `M${k} ${len}V${k}H${len}M${w - len} ${k}H${w - k}V${len}` +
    `M${w - k} ${h - len}V${h - k}H${w - len}M${len} ${h - k}H${k}V${h - len}`;
  return ink(id, frame, `<path d="${d}" stroke="${color}" stroke-width="${width}"/>`);
}

/** A rectangle of hidden edges: dashed, as an edge behind the drawing is. */
function hidden(
  id: string,
  frame: Frame,
  rest: { color?: string; opacity?: number; fill?: boolean } = {},
): Element {
  const { color = WHITE, opacity = 0.75, fill = false } = rest;
  return ink(
    id,
    frame,
    `<rect x="1.5" y="1.5" width="${frame.w - 3}" height="${frame.h - 3}" ${fill ? `fill="${BLUE}" ` : ''}stroke="${color}" stroke-opacity="${opacity}" stroke-width="2.5" stroke-dasharray="14 9"/>`,
  );
}

/** A rule of hidden edges, between rows: a dashed line across its frame. */
const dashed = (id: string, frame: Frame, opacity = 0.5): Element =>
  ink(
    id,
    { ...frame, h: 4 },
    `<path d="M0 2H${frame.w}" stroke="${WHITE}" stroke-opacity="${opacity}" stroke-width="2" stroke-dasharray="14 9"/>`,
  );

/** A scale bar: blocks of white and of the blue in turn, and the ticks of their ends. */
function scaleBar(id: string, frame: Frame): Element {
  const { w } = frame;
  const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.6, 1];
  const blocks = steps
    .slice(0, -1)
    .map((from, i) => {
      const x = r1(from * (w - 4) + 2);
      const len = r1((steps[i + 1]! - from) * (w - 4));
      return `<rect x="${x}" y="8" width="${len}" height="12" fill="${i % 2 ? BLUE : WHITE}" stroke="${WHITE}" stroke-width="2"/>`;
    })
    .join('');
  const ticks = steps.map((at) => `M${r1(at * (w - 4) + 2)} 0V28`).join('');
  return ink(
    id,
    { ...frame, h: 28 },
    `${blocks}<path d="${ticks}" stroke="${WHITE}" stroke-width="2"/>`,
  );
}

/**
 * A track in plan: two rails, the sleepers across them, and the centreline between, ending in
 * the buffer stop of a siding. Drawn for the card of the railway; it reads as a detail of any part.
 */
function rails(id: string, frame: Frame): Element {
  const { w, h } = frame;
  let sleepers = '';
  for (let x = 40; x < w - 10; x += 26) sleepers += `M${x} 4V${h - 4}`;
  return ink(
    id,
    frame,
    `<path d="${sleepers}" stroke="${WHITE}" stroke-opacity="0.35" stroke-width="5"/>` +
      `<path d="M24 12H${w}M24 ${h - 12}H${w}" stroke="${WHITE}" stroke-width="3"/>` +
      `<path d="M0 ${h / 2}H${w}" stroke="${YELLOW}" stroke-width="2" stroke-dasharray="30 8 6 8"/>` +
      `<rect x="10" y="2" width="14" height="${h - 4}" fill="${YELLOW}"/>`,
  );
}

/** A drafting rule: a base line and its ticks, longer every fifth and tenth, as a scale has them. */
function ruler(id: string, frame: Frame, color = WHITE): Element {
  const { w } = frame;
  let ticks = '';
  for (let i = 0; i * 12 <= w - 4; i++) {
    const len = i % 10 === 0 ? 30 : i % 5 === 0 ? 20 : 10;
    ticks += `M${i * 12 + 2} 2V${len}`;
  }
  return ink(
    id,
    { ...frame, h: 32 },
    `<path d="M0 2H${w}" stroke="${color}" stroke-width="3"/><path d="${ticks}" stroke="${color}" stroke-width="2"/>`,
  );
}

/** A panel of the sheet: the blue itself, which hides the grid under the text, in corner ticks. */
function panel(
  id: string,
  frame: Frame,
  rest: { fill?: 'bg' | 'surface'; color?: string } = {},
): Element[] {
  const { fill = 'bg', color = WHITE } = rest;
  return [
    rect(`${id}_fill`, frame, solid(token(fill)), {
      stroke: { color: token('text', 0.22), width: 1.5 },
    }),
    corners(
      `${id}_ticks`,
      { x: frame.x - 10, y: frame.y - 10, w: frame.w + 20, h: frame.h + 20 },
      { color },
    ),
  ];
}

/**
 * A detail tag: a circle with a letter or a number in it, as a drawing calls out a part. With
 * `solid`, a yellow disc and the letter in the blue.
 */
function tag(id: string, frame: Frame, mark: string, solidTag = false): Element[] {
  const r = frame.w / 2;
  const body = solidTag
    ? `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="${YELLOW}"/>`
    : `<circle cx="${r}" cy="${r}" r="${r - 2}" fill="${BLUE}" stroke="${WHITE}" stroke-width="3"/><circle cx="${r}" cy="${r}" r="${r - 8}" stroke="${WHITE}" stroke-opacity="0.45" stroke-width="1.5"/>`;
  return [
    ink(`${id}_ring`, frame, body),
    label(`${id}_mark`, { ...frame, y: frame.y + 2 }, mark, 'heading', {
      dir: 'auto',
      align: 'center',
      vAlign: 'middle',
      ...(solidTag ? { color: token('bg') } : {}),
    }),
  ];
}

/** A crosshair circle: the ring, a finer one inside it, and the centre lines that cross it. */
function target(
  id: string,
  cx: number,
  cy: number,
  r: number,
  rest: { yellow?: boolean; reach?: number } = {},
): Element {
  const { yellow = false, reach = 40 } = rest;
  const s = r + reach;
  const ring = yellow ? YELLOW : WHITE;
  const d =
    `M0 ${s}H${s - r * 0.72}M${s + r * 0.72} ${s}H${2 * s}` +
    `M${s} 0V${s - r * 0.72}M${s} ${s + r * 0.72}V${2 * s}`;
  return ink(
    id,
    atEnd(cx - s, cy - s, 2 * s, 2 * s),
    `<circle cx="${s}" cy="${s}" r="${r}" fill="${BLUE}" stroke="${ring}" stroke-width="3"/>` +
      `<circle cx="${s}" cy="${s}" r="${r1(r * 0.86)}" stroke="${WHITE}" stroke-opacity="0.4" stroke-width="1.5" stroke-dasharray="10 8"/>` +
      `<path d="${d}" stroke="${WHITE}" stroke-opacity="0.7" stroke-width="2" stroke-dasharray="30 8 6 8"/>`,
  );
}

/**
 * The red pencil: a loop drawn by hand around the number a slide is about, a little more than
 * once round, so its two ends do not meet.
 */
function pencil(id: string, frame: Frame): Element {
  const { w, h } = frame;
  const cx = w / 2;
  const cy = h / 2;
  const points: string[] = [];
  const turns = 2 * Math.PI * 1.12;
  for (let i = 0; i <= 72; i++) {
    const t = -2.2 + (turns * i) / 72;
    const grow = 0.9 + (0.1 * i) / 72;
    const rx = (w / 2 - 8) * grow * (1 + 0.025 * Math.sin(3 * t));
    const ry = (h / 2 - 8) * grow * (1 + 0.04 * Math.cos(2 * t));
    const x = cx + rx * Math.cos(t);
    const y = cy + ry * Math.sin(t) - 0.08 * rx * Math.cos(t);
    points.push(`${i === 0 ? 'M' : 'L'}${r1(x)} ${r1(y)}`);
  }
  return ink(
    id,
    frame,
    `<path d="${points.join('')}" stroke="${RED}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`,
  );
}

const MARK =
  '<svg viewBox="0 0 48 48" fill="none"><rect x="2" y="2" width="44" height="44" stroke="#ffffff" stroke-width="3"/><path d="M11 38V10" stroke="#ffffff" stroke-width="3.5"/><path d="M11 10A28 28 0 0 1 39 38" stroke="#ffd23f" stroke-width="3" stroke-dasharray="4 4"/><path d="M11 38H39" stroke="#ffd23f" stroke-width="3.5"/></svg>';

/**
 * The mark of the template: a door and its swing, as a plan draws it. A deck replaces it with
 * its logo.
 */
const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/**
 * The title block, in the lower end corner of the sheet, against its border: the mark, the
 * deck's name (or the opening slide's line under it), the scale, and the number of the sheet.
 * The lower row is the fine print of a real block, drawn as strokes.
 */
function titleBlock(
  name: string,
  rest: { role?: 'footer' | 'caption'; id?: string; width?: number; numbered?: boolean } = {},
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  const { role = 'footer', id = 'p_footer', width = 432, numbered = true } = rest;
  const written = width > 0;
  const cells = [120, ...(written ? [width + 48] : []), 120, ...(numbered ? [120] : [])];
  const w = cells.reduce((sum, cell) => sum + cell, 0);
  let x = 0;
  const walls = cells.slice(0, -1).map((cell) => (x += cell));
  // The cells of the scale and the sheet have a lower row of fine print; the text cell is whole.
  const split = written ? walls[1]! : walls[0]!;
  const fine = [
    [split + 18, 60],
    [split + 132, 84],
    ...(numbered ? [[split + 250, 50] as const] : []),
  ]
    .map(([from, len]) => `M${from} 104h${len}`)
    .join('');
  const scale = written ? walls[1]! : walls[0]!;
  const decorations: Element[] = [
    ink(
      `d_sirtut_${name}_block`,
      atEnd(32, 920, w, 128),
      `<rect x="1.5" y="1.5" width="${w - 3}" height="125" fill="${BLUE}" stroke="${WHITE}" stroke-width="3"/>` +
        `<path d="M${split} 80H${w}${walls.map((wall) => `M${wall} 0V${wall > split ? 80 : 128}`).join('')}M${split + 120} 80V128" stroke="${WHITE}" stroke-width="1.5"/>` +
        `<path d="${fine}" stroke="${WHITE}" stroke-opacity="0.4" stroke-width="5"/>`,
    ),
    mark(`d_sirtut_${name}_mark`, atEnd(68, 960, 48, 48)),
    label(`d_sirtut_${name}_scale`, atEnd(32 + scale, 943, 120, 34), '1:100', 'caption', {
      dir: 'ltr',
      align: 'center',
    }),
  ];
  if (numbered) {
    decorations.push(
      pageNumber(`d_sirtut_${name}_number`, atEnd(32 + scale + 120, 943, 120, 34), 'caption', {
        align: 'center',
        color: token('primary'),
        weight: 700,
      }),
    );
  }
  return {
    placeholders: written
      ? [place(id, role, atEnd(32 + 120 + 24, 932, width, 66), 'caption', { vAlign: 'middle' })]
      : [],
    decorations,
  };
}

/** The line over a title and the title itself, as every content slide has them. */
const head = (width = 1728) => [
  place('p_kicker', 'caption', at(140, 88, Math.min(900, width - 44), 34), 'caption'),
  place('p_title', 'title', at(96, 128, width, 100), 'title'),
];

/** The small crosshair before the line over a title. */
const sight = (name: string) =>
  ink(
    `d_sirtut_${name}_sight`,
    at(96, 91, 28, 28),
    `<circle cx="14" cy="14" r="9" stroke="${YELLOW}" stroke-width="3"/><path d="M14 0V28M0 14H28" stroke="${YELLOW}" stroke-width="2"/>`,
  );

/** The general note at the foot of the start side, opposite the title block: a takeaway, a source. */
const NOTE = at(96, 912, 840, 88);

/** The two quotation marks of each direction. They are two marks, not one mark and its mirror. */
const QUOTE_RTL =
  '<svg viewBox="0 0 66 52"><path fill="#ffd23f" d="M66 0v22c0 18-9 28-26 30V42c8-2 12-7 12-16H40V0h26ZM26 0v22C26 40 17 50 0 52V42c8-2 12-7 12-16H0V0h26Z"/></svg>';
const QUOTE_LTR =
  '<svg viewBox="0 0 66 52"><path fill="#ffd23f" d="M0 52V30C0 12 9 2 26 0v10c-8 2-12 7-12 16h12v26H0Zm40 0V30C40 12 49 2 66 0v10c-8 2-12 7-12 16h12v26H40Z"/></svg>';

const quoteGlyph = (frame: Frame, markup: string) =>
  drawing('d_sirtut_quote_glyph', frame, markup, PAINT);

// ---------------------------------------------------------------------------------------------
// The drawing of the opening slide: an exploded isometric stack of the building's slabs

type P3 = [number, number, number];

/**
 * An isometric drawing of four slabs lifted apart along their centreline, the top one in
 * yellow: hidden edges dashed, the assembly lines between them, a dimension of the base, the
 * height of the stack, and three detail tags with their leaders. The frame is given from the
 * end side; the letters of the tags are text of the layout, placed on the drawing.
 *
 * `assembled`, it is the finished building instead: the floors stand on each other, with their
 * windows, and nothing is called out. `onYellow`, it is drawn in the blue, for a yellow field.
 */
function exploded(
  id: string,
  frame: Frame,
  rest: { assembled?: boolean; onYellow?: boolean; measure?: string } = {},
): Element[] {
  const { assembled = false, onYellow = false, measure = '96.00' } = rest;
  const LINE = onYellow ? BLUE : WHITE;
  const MEASURE = onYellow ? BLUE : YELLOW;
  const s = 1;
  const c30 = Math.cos(Math.PI / 6);
  const gap = assembled ? 0 : 128;
  const floor = assembled ? 84 : 26;
  const slabs: { o: P3; a: number; b: number; h: number; top?: boolean }[] = [
    { o: [0, 0, 0], a: 440, b: 300, h: 40 },
    { o: [30, 20, 40 + gap], a: 380, b: 260, h: floor },
    { o: [30, 20, 40 + floor + 2 * gap], a: 380, b: 260, h: floor },
    { o: [70, 50, 40 + 2 * floor + 3 * gap], a: 300, b: 200, h: 30, top: true },
  ];
  const raw = (p: P3): [number, number] => [
    (p[0] - p[1]) * c30 * s,
    (p[0] + p[1]) * 0.5 * s - p[2] * s,
  ];
  // Fit: the extent of every corner, then a margin for the tags and the dimensions.
  const all = slabs.flatMap(({ o, a, b, h }) =>
    [0, a].flatMap((dx) =>
      [0, b].flatMap((dy) => [0, h].map((dz) => raw([o[0] + dx, o[1] + dy, o[2] + dz]))),
    ),
  );
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(...all.map((p) => p[1]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const room = assembled ? 160 : 200;
  const k = Math.min((frame.w - room) / (maxX - minX), (frame.h - 150) / (maxY - minY));
  const ox = 130 - minX * k;
  const oy = 70 - minY * k;
  const P = (p: P3): [number, number] => {
    const [x, y] = raw(p);
    return [r1(ox + x * k), r1(oy + y * k)];
  };
  const pt = (p: P3) => P(p).join(' ');
  let faces = '';
  let edges = '';
  let dashed = '';
  let assembly = '';
  let windows = '';
  for (const [i, { o, a, b, h, top }] of slabs.entries()) {
    const [x0, y0, z0] = o;
    const v = (dx: number, dy: number, dz: number): P3 => [x0 + dx, y0 + dy, z0 + dz];
    const topFace = [v(0, 0, h), v(a, 0, h), v(a, b, h), v(0, b, h)];
    const right = [v(a, 0, 0), v(a, b, 0), v(a, b, h), v(a, 0, h)];
    const front = [v(0, b, 0), v(a, b, 0), v(a, b, h), v(0, b, h)];
    const poly = (ps: P3[]) => `M${ps.map(pt).join('L')}Z`;
    const crown = onYellow ? BLUE : YELLOW;
    faces +=
      `<path d="${poly(topFace)}" fill="${top ? crown : LINE}" fill-opacity="${top ? 1 : 0.1}"/>` +
      `<path d="${poly(right)}" fill="${LINE}" fill-opacity="${top ? 0.55 : 0.22}"/>` +
      `<path d="${poly(front)}" fill="${LINE}" fill-opacity="${top ? 0.35 : 0.06}"/>`;
    // The windows of a finished floor: mullions on its two faces, and the line of the sills.
    if (assembled && h > 60) {
      for (let x = 38; x < a - 10; x += 38) windows += `M${pt(v(x, b, 14))}L${pt(v(x, b, h - 12))}`;
      for (let y = 36; y < b - 10; y += 36) windows += `M${pt(v(a, y, 14))}L${pt(v(a, y, h - 12))}`;
      windows += `M${pt(v(0, b, 14))}L${pt(v(a, b, 14))}L${pt(v(a, 0, 14))}`;
      windows += `M${pt(v(0, b, h - 12))}L${pt(v(a, b, h - 12))}L${pt(v(a, 0, h - 12))}`;
    }
    edges += poly(topFace) + poly(right) + poly(front);
    dashed += `M${pt(v(0, 0, 0))}L${pt(v(a, 0, 0))}M${pt(v(0, 0, 0))}L${pt(v(0, b, 0))}M${pt(v(0, 0, 0))}L${pt(v(0, 0, h))}`;
    // The assembly lines: from each corner of this slab down to the one under it.
    const below = slabs[i - 1];
    if (below && !assembled) {
      const zb = below.o[2] + below.h;
      for (const [dx, dy] of [
        [0, 0],
        [a, 0],
        [a, b],
        [0, b],
      ] as const) {
        assembly += `M${pt(v(dx, dy, 0))}L${pt([x0 + dx, y0 + dy, zb])}`;
      }
    }
  }
  // The centreline of the stack, from under the base to above the top.
  const mid = slabs[0]!.a / 2;
  const midB = slabs[0]!.b / 2;
  const topZ = slabs[3]!.o[2] + slabs[3]!.h;
  const axis = `M${pt([mid, midB, -70])}L${pt([mid, midB, topZ + 120])}`;
  // The base, dimensioned along its front edge: offset outwards, with extension lines and ticks.
  const base = slabs[0]!;
  const off = 70;
  const d1: P3 = [0, base.b + off, 0];
  const d2: P3 = [base.a, base.b + off, 0];
  const dimLine =
    `M${pt([0, base.b + 10, 0])}L${pt([0, base.b + off + 16, 0])}M${pt([base.a, base.b + 10, 0])}L${pt([base.a, base.b + off + 16, 0])}` +
    `M${pt(d1)}L${pt(d2)}`;
  const tickAt = (p: P3) => {
    const [x, y] = P(p);
    return `M${x - 9} ${y + 9}L${x + 9} ${y - 9}`;
  };
  // The height of the stack, standing at the far end of the drawing.
  const [hx] = P([0, base.b, 0]);
  const yBottom = P([0, base.b, 0])[1];
  const yTop = P([slabs[3]!.o[0], slabs[3]!.o[1] + slabs[3]!.b, topZ])[1];
  const hX = r1(hx - 56);
  const height =
    `<path d="M${hX - 14} ${yTop}H${r1(hx - 10)}M${hX - 14} ${yBottom}H${r1(hx - 10)}" stroke="${LINE}" stroke-opacity="0.7" stroke-width="1.5"/>` +
    `<path d="M${hX} ${yTop}V${yBottom}" stroke="${LINE}" stroke-width="2.5"/>` +
    `<path d="${arrowhead(hX, yTop, 0, -1)}${arrowhead(hX, yBottom, 0, 1)}" fill="${LINE}"/>`;
  // Leaders from three slabs to their tags on the start side of the drawing.
  const tagR = 34;
  const tagX = frame.w - tagR - 6;
  const leaders = (assembled ? [] : [1, 2, 3]).map((i) => {
    const sl = slabs[i]!;
    const [px, py] = P([sl.o[0] + sl.a, sl.o[1] + sl.b * 0.5, sl.o[2] + sl.h / 2]);
    const ty = r1(py - 40);
    return { px, py, ty };
  });
  const leaderPaths = leaders
    .map(({ px, py, ty }) => `M${px} ${py}L${r1(px + (py - ty))} ${ty}H${tagX - tagR}`)
    .join('');
  const leaderDots = leaders
    .map(({ px, py }) => `<circle cx="${px}" cy="${py}" r="6" fill="${WHITE}"/>`)
    .join('');
  const rings = leaders
    .map(
      ({ ty }, i) =>
        `<circle cx="${tagX}" cy="${ty}" r="${tagR - 1}" fill="${i === 2 ? YELLOW : BLUE}" stroke="${i === 2 ? YELLOW : WHITE}" stroke-width="3"/>`,
    )
    .join('');
  const body =
    `<path d="${axis}" stroke="${LINE}" stroke-opacity="0.6" stroke-width="2" stroke-dasharray="36 9 7 9"/>` +
    faces +
    (assembly
      ? `<path d="${assembly}" stroke="${PALE}" stroke-width="1.5" stroke-dasharray="3 7"/>`
      : '') +
    (windows
      ? `<path d="${windows}" stroke="${LINE}" stroke-opacity="0.7" stroke-width="1.5"/>`
      : '') +
    `<path d="${dashed}" stroke="${LINE}" stroke-opacity="0.6" stroke-width="2" stroke-dasharray="9 7"/>` +
    `<path d="${edges}" stroke="${LINE}" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="${dimLine}" stroke="${MEASURE}" stroke-width="2.5"/>` +
    `<path d="${tickAt(d1)}${tickAt(d2)}" stroke="${MEASURE}" stroke-width="4"/>` +
    height +
    (leaderPaths ? `<path d="${leaderPaths}" stroke="${WHITE}" stroke-width="2"/>` : '') +
    leaderDots +
    rings;
  const out: Element[] = [ink(id, frame, body)];
  for (const [i, { ty }] of leaders.entries()) {
    out.push(
      label(
        `${id}_tag${i + 1}`,
        { x: frame.x + tagX - tagR, y: frame.y + ty - tagR + 2, w: 2 * tagR, h: 2 * tagR },
        ['C', 'B', 'A'][i]!,
        'heading',
        {
          dir: 'auto',
          align: 'center',
          vAlign: 'middle',
          ...(i === 2 ? { color: token('bg') } : {}),
        },
      ),
    );
  }
  // The measure of the base, written on its dimension line.
  const [mx, my] = P([base.a / 2, base.b + off, 0]);
  out.push(
    label(
      `${id}_measure`,
      { x: frame.x + mx - 70, y: frame.y + my + 10, w: 140, h: 34 },
      measure,
      'caption',
      {
        dir: 'ltr',
        align: 'center',
        color: token(onYellow ? 'bg' : 'primary'),
      },
    ),
  );
  return out;
}

/**
 * The divider's field: the end of the sheet printed the other way round, blue lines on safety
 * yellow, with a disc of the blue in the middle of it where the section's number stands. The
 * grid and the border are the sheet's own, so the field reads as part of the same drawing.
 */
function yellowField(id: string, disc = true): Element[] {
  const w = 880;
  const cx = 440;
  const cy = 540;
  let minor = '';
  let major = '';
  for (let x = 48; x < w; x += 24) {
    if (x % 120 === 0) major += `M${x} 42V1038`;
    else minor += `M${x} 42V1038`;
  }
  for (let y = 48; y < 1038; y += 24) {
    if (y % 120 === 0) major += `M42 ${y}H${w}`;
    else minor += `M42 ${y}H${w}`;
  }
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const t = (i * Math.PI) / 36;
    const r0 = i % 6 === 0 ? 262 : 276;
    const r2 = 290;
    return `M${r1(cx + r0 * Math.cos(t))} ${r1(cy + r0 * Math.sin(t))}L${r1(cx + r2 * Math.cos(t))} ${r1(cy + r2 * Math.sin(t))}`;
  }).join('');
  const body =
    `<rect width="${w}" height="1080" fill="${YELLOW}"/>` +
    `<path d="${minor}" stroke="${BLUE}" stroke-opacity="0.07" stroke-width="1"/>` +
    `<path d="${major}" stroke="${BLUE}" stroke-opacity="0.16" stroke-width="1.5"/>` +
    `<path d="M${w} 32H32V1048H${w}" stroke="${BLUE}" stroke-width="3"/>` +
    `<path d="M${w} 42H42V1038H${w}" stroke="${BLUE}" stroke-opacity="0.5" stroke-width="1"/>` +
    `<path d="M8 540H42M272 16V32M272 1048V1064M512 16V32M512 1048V1064M752 16V32M752 1048V1064M16 180H32M16 420H32M16 660H32M16 900H32" stroke="${BLUE}" stroke-width="3"/>` +
    `<path d="M42 ${cy}H${w}M${cx} 42V1038" stroke="${BLUE}" stroke-opacity="${disc ? 1 : 0.4}" stroke-width="2.5" stroke-dasharray="44 10 8 10"/>`;
  if (!disc) return [ink(id, atEnd(0, 0, w, 1080), body)];
  const target =
    `<path d="${ticks}" stroke="${BLUE}" stroke-width="2.5"/>` +
    `<path d="M${cx} ${cy - 308}A308 308 0 0 1 ${cx + 308} ${cy}" stroke="${BLUE}" stroke-width="10"/>` +
    `<circle cx="${cx}" cy="${cy}" r="236" fill="${BLUE}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="212" stroke="${WHITE}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="12 9"/>` +
    `<path d="M${cx - 236} ${cy}h40M${cx + 196} ${cy}h40M${cx} ${cy - 236}v40M${cx} ${cy + 196}v40" stroke="${WHITE}" stroke-width="3"/>`;
  return [ink(id, atEnd(0, 0, w, 1080), body + target)];
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const cards2 = [112, 512];
const columns4 = [96, 536, 976, 1416];
const steps5 = [96, 446, 796, 1146, 1496];
const statRows = [252, 466, 680];
const notes3 = [610, 720, 830];
const rows3 = [350, 527, 704];

function layouts(): Layout[] {
  const heroBlock = titleBlock('hero', { width: 0, numbered: false });
  const closingBlock = titleBlock('closing', {
    role: 'caption',
    id: 'p_contact',
    width: 560,
    numbered: false,
  });
  const heroArt = atEnd(70, 76, 790, 830);
  const closingArt = atEnd(60, 180, 780, 720);
  return [
    {
      id: 'l_sirtut_hero',
      name: 'Hero',
      archetype: 'hero',
      background: deep(0.24, 0.45),
      placeholders: [
        place('p_kicker', 'caption', at(272, 125, 800, 34), 'caption'),
        place('p_title', 'title', at(96, 176, 980, 490), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 756, 900, 116), 'heading'),
        // The line under it stays on the start side: a deck's opening photograph, kept where
        // its own template had it, is on the end side.
        place('p_meta', 'caption', at(96, 900, 900, 34), 'caption'),
      ],
      decorations: [
        sheet('d_sirtut_hero_sheet'),
        centreline('d_sirtut_hero_axis', atEnd(42, 560, 830, 12), 0.35),
        // The revision of the drawing: a yellow tag, and the line beside it.
        rect('d_sirtut_hero_rev', at(96, 116, 152, 52), solid(token('primary'))),
        label('d_sirtut_hero_rev_text', at(96, 116, 152, 52), 'REV A', 'caption', {
          dir: 'ltr',
          align: 'center',
          vAlign: 'middle',
          color: token('bg'),
          weight: 700,
        }),
        // The title is measured: a yellow dimension line spans its frame.
        dimension('d_sirtut_hero_dim', at(96, 688, 980, 48), { from: 'above' }),
        ...exploded('d_sirtut_hero_art', heroArt, { measure: '2026' }),
        ...heroBlock.decorations,
      ],
    },
    {
      id: 'l_sirtut_section',
      name: 'Section',
      archetype: 'section',
      background: deep(0.8, 0.45),
      placeholders: [
        place('p_number', 'number', atEnd(170, 450, 540, 180), 'display', {
          align: 'center',
          vAlign: 'middle',
        }),
        place('p_kicker', 'caption', at(96, 296, 860, 34), 'caption'),
        place('p_title', 'title', at(96, 340, 860, 330), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 748, 860, 120), 'heading'),
      ],
      decorations: [
        sheet('d_sirtut_section_sheet'),
        ...yellowField('d_sirtut_section_field'),
        dimension('d_sirtut_section_dim', at(96, 690, 860, 36), { ends: 'tick' }),
      ],
    },
    {
      id: 'l_sirtut_title',
      name: 'Title',
      archetype: 'title',
      background: ground(),
      placeholders: [place('p_title', 'title', at(96, 128, 1728, 100), 'title')],
      decorations: [
        sheet('d_sirtut_title_sheet'),
        sight('title'),
        // The block without the cell of the deck's name: the layout seats no footer.
        ...titleBlock('title', { width: 0 }).decorations,
      ],
    },
    {
      id: 'l_sirtut_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      background: ground(0.7, 0.5),
      placeholders: [
        ...head(),
        place('p_number', 'number', at(160, 300, 880, 200), 'display'),
        place('p_label', 'subtitle', at(160, 530, 880, 60), 'heading'),
        place('p_body', 'body', at(160, 604, 880, 200), 'body'),
        ...statRows.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(96, top, 560, 100), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', atEnd(96, top + 104, 560, 66), 'caption'),
        ]),
        ...titleBlock('big_number').placeholders,
      ],
      decorations: [
        sheet('d_sirtut_big_number_sheet'),
        sight('big_number'),
        ...panel('d_sirtut_big_number_panel', at(96, 262, 1000, 618)),
        pencil('d_sirtut_big_number_pencil', at(120, 268, 520, 260)),
        scaleBar('d_sirtut_big_number_bar', at(160, 826, 520, 28)),
        ...statRows.flatMap((top, i) => [
          ...tag(
            `d_sirtut_big_number_tag${i + 1}`,
            atEnd(704, top + 14, 72, 72),
            ['B', 'C', 'D'][i]!,
          ),
          ink(
            `d_sirtut_big_number_leader${i + 1}`,
            atEnd(776, top + 44, 48, 12),
            `<path d="M0 6H40" stroke="${WHITE}" stroke-width="2.5"/><circle cx="41" cy="6" r="5" fill="${WHITE}"/>`,
          ),
        ]),
        ...statRows
          .slice(1)
          .map((top, i) => dashed(`d_sirtut_big_number_rule${i + 1}`, atEnd(96, top - 24, 680, 4))),
        ...titleBlock('big_number').decorations,
      ],
    },
    {
      id: 'l_sirtut_quote',
      name: 'Quote',
      archetype: 'quote',
      background: deep(0.5, 0.45),
      placeholders: [
        place('p_quote', 'quote', at(300, 236, 1260, 410), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(300, 680, 1100, 60), 'heading'),
        place('p_caption', 'caption', at(300, 746, 1100, 68), 'caption'),
        ...titleBlock('quote').placeholders,
      ],
      decorations: [
        sheet('d_sirtut_quote_sheet'),
        // The quote is a part on the drawing: a box of hidden edges, measured on two sides.
        hidden('d_sirtut_quote_box', at(240, 196, 1380, 650), { fill: true }),
        dimension('d_sirtut_quote_width', at(240, 136, 1380, 48), { color: WHITE, width: 2.5 }),
        dimensionUp('d_sirtut_quote_height', at(140, 196, 80, 650), YELLOW),
        quoteGlyph(at(250, 118, 170, 134), QUOTE_RTL),
        centreline('d_sirtut_quote_axis', atEnd(42, 515, 290, 12)),
        ...tag('d_sirtut_quote_tag', atEnd(116, 480, 82, 82), 'Q', true),
        ...titleBlock('quote').decorations,
      ],
    },
    {
      id: 'l_sirtut_text',
      name: 'Text',
      archetype: 'text',
      background: ground(),
      placeholders: [
        place('p_title', 'title', at(96, 128, 1728, 100), 'title'),
        place('p_body', 'body', at(96, 268, 1728, 612), 'body'),
      ],
      decorations: [
        sheet('d_sirtut_text_sheet'),
        sight('text'),
        ...titleBlock('text', { width: 0 }).decorations,
      ],
    },
    {
      id: 'l_sirtut_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      background: ground(0.7, 0.45),
      placeholders: [
        ...head(900).map((p) => (p.role === 'title' ? { ...p, frame: { ...p.frame, h: 196 } } : p)),
        place('p_image', 'image', atEnd(150, 186, 680, 680)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(196, top, 800, 58), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(196, top + 60, 800, 115), 'body'),
        ]),
        ...titleBlock('text_image').placeholders,
      ],
      decorations: [
        sheet('d_sirtut_text_image_sheet'),
        sight('text_image'),
        // The picture is a figure on the sheet: a mat of the blue, ticks, and its dimensions.
        rect('d_sirtut_text_image_mat', atEnd(138, 174, 704, 704), solid(token('surface')), {
          stroke: { color: token('text', 0.9), width: 2 },
        }),
        corners('d_sirtut_text_image_ticks', atEnd(120, 156, 740, 740), { color: YELLOW }),
        dimension('d_sirtut_text_image_width', atEnd(150, 88, 680, 48), {
          color: WHITE,
          width: 2.5,
        }),
        dimensionUp('d_sirtut_text_image_height', atEnd(48, 186, 64, 680)),
        ...rows3.flatMap((top, i) => [
          ...tag(
            `d_sirtut_text_image_tag${i + 1}`,
            at(96, top - 4, 72, 72),
            String(i + 1),
            i === 0,
          ),
        ]),
        ...[1, 2].map((i) =>
          dashed(`d_sirtut_text_image_rule${i}`, at(196, rows3[i]! - 3, 800, 4)),
        ),
        ...titleBlock('text_image').decorations,
      ],
    },
    {
      id: 'l_sirtut_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      background: deep(0.85, 0.4),
      placeholders: [
        // The picture runs to three edges; the text stands in a column of its own on the sheet.
        place('p_image', 'image', atEnd(0, 0, 1196, 1080)),
        place('p_kicker', 'caption', at(96, 196, 560, 34), 'caption'),
        place('p_title', 'title', at(96, 246, 560, 400), 'title'),
        place('p_body', 'body', at(96, 696, 560, 230), 'body'),
      ],
      decorations: [
        sheet('d_sirtut_full_image_sheet'),
        // The line of the cut: a section through the picture, marked A–A at its two ends.
        rect('d_sirtut_full_image_cut', atEnd(1196, 0, 8, 1080), solid(token('primary'))),
        ink(
          'd_sirtut_full_image_arrows',
          atEnd(1196, 0, 120, 1080),
          `<path d="M4 120H70M4 952H70" stroke="${YELLOW}" stroke-width="5"/>` +
            `<path d="${arrowhead(98, 120, 1, 0, 30)}${arrowhead(98, 952, 1, 0, 30)}" fill="${YELLOW}"/>`,
        ),
        ...tag('d_sirtut_full_image_tag1', atEnd(1320, 84, 72, 72), 'A', true),
        ...tag('d_sirtut_full_image_tag2', atEnd(1320, 916, 72, 72), 'A', true),
        dimension('d_sirtut_full_image_dim', at(96, 652, 560, 36), { ends: 'tick' }),
      ],
    },
    {
      id: 'l_sirtut_cards',
      name: 'Cards',
      archetype: 'cards',
      background: ground(0.6, 0.5),
      placeholders: [
        // The title holds the start side only: the two smaller cards rise to the top of the end.
        ...head(792).map((p) => (p.role === 'title' ? { ...p, frame: { ...p.frame, h: 196 } } : p)),
        place('p_card1', 'subtitle', at(152, 456, 680, 124), 'heading'),
        place('p_card1_body', 'body', at(152, 590, 680, 196), 'body'),
        place('p_card1_note', 'caption', at(240, 380, 592, 34), 'caption'),
        ...cards2.flatMap((top, i) => [
          place(`p_card${i + 2}`, 'subtitle', atEnd(132, top + 104, 760, 60), 'heading'),
          place(`p_card${i + 2}_body`, 'body', atEnd(132, top + 176, 760, 160), 'body'),
          place(`p_card${i + 2}_note`, 'caption', atEnd(132, top + 43, 672, 34), 'caption'),
        ]),
        place('p_takeaway', 'body', NOTE, 'body', { vAlign: 'middle' }),
        ...titleBlock('cards').placeholders,
      ],
      decorations: [
        sheet('d_sirtut_cards_sheet'),
        sight('cards'),
        ...panel('d_sirtut_cards_card1', at(96, 352, 792, 520), { fill: 'surface', color: YELLOW }),
        ...tag('d_sirtut_cards_tag1', at(140, 362, 72, 72), 'A', true),
        rails('d_sirtut_cards_rails', at(132, 800, 720, 48)),
        ...cards2.flatMap((top, i) => [
          ...panel(`d_sirtut_cards_card${i + 2}`, atEnd(96, top, 832, 360)),
          ...tag(`d_sirtut_cards_tag${i + 2}`, atEnd(828, top + 24, 72, 72), ['B', 'C'][i]!),
        ]),
        // Card A is the assembly, B and C its parts: a leader branches from one to the others.
        ink(
          'd_sirtut_cards_link',
          atEnd(928, 280, 104, 430),
          `<path d="M104 332H52V12H0M52 332V412H0" stroke="${WHITE}" stroke-opacity="0.85" stroke-width="2" stroke-dasharray="10 7"/><circle cx="97" cy="332" r="7" fill="${WHITE}"/>`,
        ),
        ...titleBlock('cards').decorations,
      ],
    },
    {
      id: 'l_sirtut_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      background: ground(0.5, 0.55),
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start + 30, 278, 360, 100), 'title', {
            vAlign: 'bottom',
          }),
          place(`p_what${i + 1}`, 'subtitle', at(start + 30, 470, 360, 120), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start + 30, 600, 360, 260), 'caption'),
        ]),
        place('p_note', 'caption', NOTE, 'caption', { vAlign: 'middle' }),
        ...titleBlock('timeline').placeholders,
      ],
      decorations: [
        sheet('d_sirtut_timeline_sheet'),
        sight('timeline'),
        // The year as a chain of dimensions: one line, a tick at each milestone, arrows at the ends.
        ink(
          'd_sirtut_timeline_axis',
          at(96, 384, 1728, 72),
          `<path d="M4 36H1724" stroke="${YELLOW}" stroke-width="3.5"/>` +
            `<path d="${arrowhead(4, 36, -1, 0, 24)}${arrowhead(1724, 36, 1, 0, 24)}" fill="${YELLOW}"/>` +
            `<path d="${[0, 440, 880, 1320]
              .map((x) => `M${1728 - x - 3} 0V72M${1728 - x - 15} 50L${1728 - x + 9} 22`)
              .join('')}" stroke="${YELLOW}" stroke-width="3.5"/>`,
        ),
        ...columns4.flatMap((start, i) => [
          centreline(`d_sirtut_timeline_drop${i + 1}`, at(start - 6, 456, 12, 420), 0.4),
          ...(i === 0
            ? [rect('d_sirtut_timeline_now', at(start - 13, 407, 26, 26), solid(token('primary')))]
            : []),
        ]),
        ...titleBlock('timeline').decorations,
      ],
    },
    {
      id: 'l_sirtut_process',
      name: 'Process',
      archetype: 'process',
      background: ground(0.5, 0.4),
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start, 586, 328, 60), 'heading', {
            align: 'center',
          }),
          place(`p_step${i + 1}_body`, 'caption', at(start + 8, 652, 312, 200), 'caption', {
            align: 'center',
          }),
          place(`p_step${i + 1}_number`, 'number', at(start + 34, 362, 260, 100), 'title', {
            align: 'center',
            vAlign: 'middle',
          }),
        ]),
        place('p_summary', 'body', NOTE, 'body', { vAlign: 'middle' }),
        ...titleBlock('process').placeholders,
      ],
      decorations: [
        sheet('d_sirtut_process_sheet'),
        sight('process'),
        // The flow: one line through the five centres, with an arrow into each next step.
        ink(
          'd_sirtut_process_flow',
          at(96, 396, 1728, 32),
          `<path d="M0 16H1728" stroke="${WHITE}" stroke-opacity="0.8" stroke-width="2.5"/>` +
            `<path d="${steps5
              .slice(1)
              .map((start) => arrowhead(1920 - start - 164 + 144 - 96, 16, -1, 0, 24))
              .join('')}" fill="${WHITE}"/>`,
        ),
        ...steps5.flatMap((start, i) => [
          target(`d_sirtut_process_step${i + 1}`, 1920 - start - 164, 412, 142, {
            yellow: i === 4,
            reach: 0,
          }),
          ...tag(
            `d_sirtut_process_tag${i + 1}`,
            at(start + 128, 234, 72, 72),
            String(i + 1),
            i === 4,
          ),
        ]),
        ...titleBlock('process').decorations,
      ],
    },
    {
      id: 'l_sirtut_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      background: ground(0.3, 0.5),
      placeholders: [
        ...head(),
        place('p_before_tag', 'caption', at(140, 296, 740, 34), 'caption'),
        place('p_before', 'subtitle', at(140, 344, 740, 124), 'heading'),
        place('p_before_body', 'body', at(140, 496, 740, 316), 'body'),
        place('p_after_tag', 'caption', atEnd(140, 296, 740, 34), 'caption'),
        place('p_after', 'subtitle', atEnd(140, 344, 740, 124), 'heading'),
        place('p_after_body', 'body', atEnd(140, 496, 740, 316), 'body'),
        ...titleBlock('comparison').placeholders,
      ],
      decorations: [
        sheet('d_sirtut_comparison_sheet'),
        sight('comparison'),
        // What there is now is drawn in hidden edges; what is proposed, solid and in yellow.
        hidden('d_sirtut_comparison_before', at(96, 262, 840, 618), { fill: true, opacity: 0.85 }),
        ...panel('d_sirtut_comparison_after', atEnd(96, 262, 840, 618), {
          fill: 'surface',
          color: YELLOW,
        }),
        rect('d_sirtut_comparison_bar', atEnd(96, 262, 840, 12), solid(token('primary'))),
        dashed('d_sirtut_comparison_rule1', at(140, 474, 740, 4), 0.6),
        rect('d_sirtut_comparison_rule2', atEnd(140, 474, 740, 3), solid(token('primary'))),
        ruler('d_sirtut_comparison_ruler1', at(140, 828, 740, 32)),
        ruler('d_sirtut_comparison_ruler2', atEnd(140, 828, 740, 32), YELLOW),
        ink(
          'd_sirtut_comparison_arrow',
          at(916, 520, 88, 88),
          `<circle cx="44" cy="44" r="41" fill="${YELLOW}"/><path d="M66 44H26M40 28L24 44L40 60" stroke="${BLUE}" stroke-width="5" stroke-linecap="square"/>`,
        ),
        ...titleBlock('comparison').decorations,
      ],
    },
    {
      id: 'l_sirtut_chart',
      name: 'Chart',
      archetype: 'chart',
      background: ground(0.3, 0.45),
      placeholders: [
        ...head(),
        place('p_chart', 'chart', at(126, 286, 1048, 560)),
        ...[248, 560].flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(120, top + 12, 540, 190), 'display'),
          place(`p_stat${i + 1}_body`, 'body', atEnd(120, top + 206, 540, 80), 'body'),
        ]),
        place('p_source', 'caption', NOTE, 'caption', { vAlign: 'middle' }),
        ...titleBlock('chart').placeholders,
      ],
      decorations: [
        sheet('d_sirtut_chart_sheet'),
        sight('chart'),
        ...panel('d_sirtut_chart_panel', at(96, 262, 1108, 610)),
        pencil('d_sirtut_chart_pencil', atEnd(300, 236, 400, 230)),
        dimensionUp('d_sirtut_chart_height', atEnd(48, 270, 56, 560), YELLOW),
        dashed('d_sirtut_chart_rule', atEnd(120, 534, 540, 4)),
        ...titleBlock('chart').decorations,
      ],
    },
    {
      id: 'l_sirtut_table',
      name: 'Table',
      archetype: 'table',
      background: ground(0.5, 0.5),
      placeholders: [
        ...head(),
        place('p_table', 'table', at(176, 296, 1608, 584)),
        place('p_note', 'caption', NOTE, 'caption', { vAlign: 'middle' }),
        ...titleBlock('table').placeholders,
      ],
      decorations: [
        sheet('d_sirtut_table_sheet'),
        sight('table'),
        rect('d_sirtut_table_plate', at(176, 296, 1608, 584), solid(token('bg'))),
        corners('d_sirtut_table_ticks', at(160, 280, 1640, 616), { color: YELLOW }),
        dimension('d_sirtut_table_width', at(176, 236, 1608, 44), { color: WHITE, width: 2.5 }),
        dimensionUp('d_sirtut_table_height', at(96, 296, 56, 584), YELLOW),
        ...titleBlock('table').decorations,
      ],
    },
    {
      id: 'l_sirtut_team',
      name: 'Team',
      archetype: 'team',
      background: ground(0.5, 0.45),
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start + 24, 316, 360, 320)),
          place(`p_person${i + 1}`, 'subtitle', at(start + 24, 664, 360, 60), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start + 24, 726, 360, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start + 24, 772, 360, 130), 'caption'),
        ]),
        ...titleBlock('team').placeholders,
      ],
      decorations: [
        sheet('d_sirtut_team_sheet'),
        sight('team'),
        // One chain of dimensions over the four figures, and each figure in its ticks.
        ink(
          'd_sirtut_team_chain',
          at(96, 248, 1728, 52),
          `<path d="M24 26H1704" stroke="${WHITE}" stroke-width="2"/>` +
            `<path d="${columns4
              .flatMap((s) => [1728 - (s - 96) - 24, 1728 - (s - 96) - 384])
              .map((x) => `M${x} 8V52M${x - 9} 35L${x + 9} 17`)
              .join('')}" stroke="${WHITE}" stroke-width="3"/>`,
        ),
        ...columns4.flatMap((start, i) => [
          corners(`d_sirtut_team_ticks${i + 1}`, at(start + 10, 302, 388, 348), {
            color: i === 0 ? YELLOW : WHITE,
            len: 26,
          }),
          label(
            `d_sirtut_team_fig${i + 1}`,
            at(start + 24, 258, 360, 34),
            `FIG. ${i + 1}`,
            'caption',
            {
              dir: 'ltr',
              align: 'center',
              color: token('text'),
            },
          ),
        ]),
        ...titleBlock('team').decorations,
      ],
    },
    {
      id: 'l_sirtut_closing',
      name: 'Closing',
      archetype: 'closing',
      background: deep(0.8, 0.4),
      placeholders: [
        place('p_kicker', 'caption', at(272, 96, 800, 34), 'caption'),
        place('p_title', 'title', at(96, 100, 980, 456), 'display', { vAlign: 'bottom' }),
        ...notes3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(196, top, 860, 84), 'body', { vAlign: 'middle' }),
        ),
        ...closingBlock.placeholders,
      ],
      decorations: [
        sheet('d_sirtut_closing_sheet'),
        // The opening's drawing, built: the finished building in the blue, on the yellow field.
        ...yellowField('d_sirtut_closing_field', false),
        dimension('d_sirtut_closing_dim', at(96, 560, 920, 28), { ends: 'tick' }),
        rect('d_sirtut_closing_rev', at(96, 88, 152, 50), solid(token('primary'))),
        label('d_sirtut_closing_rev_text', at(96, 88, 152, 50), 'REV B', 'caption', {
          dir: 'ltr',
          align: 'center',
          vAlign: 'middle',
          color: token('bg'),
          weight: 700,
        }),
        ...notes3.flatMap((top, i) => [
          ...tag(`d_sirtut_closing_tag${i + 1}`, at(96, top + 6, 72, 72), String(i + 1), i === 0),
        ]),
        ...exploded('d_sirtut_closing_art', closingArt, {
          assembled: true,
          onYellow: true,
          measure: '2028',
        }),
        // Approved: the red pencil's tick over the finished building, set off by the blue.
        ink(
          'd_sirtut_closing_check',
          atEnd(590, 110, 230, 180),
          `<path d="M14 100L80 160L216 16" stroke="${BLUE}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>` +
            `<path d="M14 100L80 160L216 16" stroke="${RED}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>`,
        ),
        ...closingBlock.decorations,
      ],
    },
  ];
}

/**
 * The layouts the mirror gets wrong for a left-to-right deck: the quote, whose mark is a glyph
 * of the direction, and the closing, whose tick is a gesture of the hand. Everything else is a
 * drawing, which turns with the slide.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  const quote = drawn.find((layout) => layout.id === 'l_sirtut_quote');
  const closing = drawn.find((layout) => layout.id === 'l_sirtut_closing');
  if (!quote || !closing) return [];
  const mirroredQuote = mirrorLayout(quote);
  const mirroredClosing = mirrorLayout(closing);
  return [
    {
      ...mirroredQuote,
      decorations: mirroredQuote.decorations.map((decoration) =>
        decoration.id === 'd_sirtut_quote_glyph'
          ? quoteGlyph(decoration.frame, QUOTE_LTR)
          : decoration,
      ),
    },
    {
      // A tick reads the same way in both directions: it changes sides, not its stroke.
      ...mirroredClosing,
      decorations: mirroredClosing.decorations.map((decoration) => {
        if (decoration.id !== 'd_sirtut_closing_check') return decoration;
        const { flipH: _flipH, ...upright } = decoration;
        return upright;
      }),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: the master plan of an invented rail-freight terminal, slide by slide

const FOOTER = text('מסוף דרור · DRR-01');
const FOOTER_EN = text('Dror Terminal · DRR-01');
const QUARTERS = ['Q1 25', 'Q2 25', 'Q3 25', 'Q4 25', 'Q1 26', 'Q2 26'];
const PLANNED = [120, 180, 260, 310, 340, 360];
const SPENT = [110, 172, 248, 296, 318, 330];
const TABLE_COLS = [520, 362, 362, 362];
const TABLE_ROW = 70;
const TEAM = [
  { assetId: pictures.sirtutTeam1.id },
  { assetId: pictures.sirtutTeam2.id },
  { assetId: pictures.sirtutTeam3.id },
  { assetId: pictures.sirtutTeam4.id },
];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_sirtut_hero',
    name: 'פתיחה',
    content: {
      caption: [text('DRR-01 · תוכנית אב'), text('הצגה לדירקטוריון · יוני 2026')],
      title: text('מסוף דרור', 'יוצא לדרך'),
      subtitle: text('מסוף מטען אוטומטי לרכבות משא, 12 קילומטר מבאר שבע'),
    },
  },
  {
    layout: 'l_sirtut_section',
    name: 'התוכנית',
    content: {
      number: text('01'),
      caption: text('חלק ראשון'),
      title: text('מה בונים'),
      subtitle: text('מסילה, מחסן ומרכז בקרה, על שטח של 420 דונם.'),
    },
  },
  {
    layout: 'l_sirtut_big_number',
    name: 'קיבולת',
    content: {
      caption: [
        text('קיבולת'),
        text('שעות ביממה, בלי משמרת לילה ידנית'),
        text('רובוטים אוטונומיים במחסן הראשי'),
        text('פחות משאיות בכביש 40 בכל יום'),
      ],
      title: text('קיבולת של נמל קטן'),
      number: [text('1.2M'), text('24'), text('38'), text('900')],
      subtitle: text('טון מטען בשנה, כבר מהשנה הראשונה'),
      body: text(
        'היום כל המטען מנמל אשדוד עולה דרומה במשאיות. המסוף מעביר אותו לרכבת, ומעמיס אותו על משאית רק 12 קילומטר לפני היעד.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_sirtut_cards',
    name: 'שלושה רכיבים',
    content: {
      caption: [
        text('המערכת'),
        text('רכיב A · המסילה'),
        text('רכיב B · המחסן'),
        text('רכיב C · הבקרה'),
      ],
      title: text('שלושה רכיבים, מערכת אחת'),
      subtitle: [text('שלוש מסילות העמסה'), text('מחסן רובוטי'), text('מרכז בקרה')],
      body: [
        text('רכבת שלמה נכנסת בלי לפצל קרונות, ומנוף גשר פורק מכולה בארבע דקות.'),
        text('38 רובוטים ממיינים ומלקטים, בלי מלגזות.'),
        text('כל מכולה, רכבת ומשאית על מסך אחד, בזמן אמת.'),
        text('כל רכיב נבנה בשלב משלו, והמסילה הקיימת לא נעצרת.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_sirtut_text_image',
    name: 'המחסן',
    content: {
      caption: text('רכיב B · המחסן'),
      title: text('מחסן בלי מלגזות'),
      image: { assetId: pictures.sirtutSite.id },
      subtitle: [text('רובוטים במקום מלגזות'), text('מדפים לגובה 14 מטר'), text('אור יום מהגג')],
      body: [
        text('הרובוטים נוסעים בין המדפים ומביאים את הסחורה אל עמדות הליקוט.'),
        text('אותו שטח מחזיק פי שלושה סחורה ממחסן רגיל בגודל דומה.'),
        text('גג שקוף למחצה חוסך 40% מהחשמל של התאורה בשעות היום.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_sirtut_chart',
    name: 'תקציב',
    content: {
      caption: [text('תקציב'), text('מקור: דוחות הביצוע הרבעוניים, במיליוני שקלים.')],
      title: text('הבנייה עומדת בתקציב'),
      number: [text('1.9'), text('4%')],
      body: [text('מיליארד שקל לשלושת השלבים יחד.'), text('מתחת לתחזית, נכון לסוף הרבעון.')],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'הוצאה מצטברת לפי רבעון, במיליוני שקלים',
      data: {
        categories: QUARTERS,
        series: [
          { name: 'תכנון', values: PLANNED },
          { name: 'ביצוע', values: SPENT },
        ],
      },
    },
  },
  {
    layout: 'l_sirtut_comparison',
    name: 'היום ומחר',
    content: {
      caption: [text('היום מול 2028'), text('היום · במשאית'), text('מ-2028 · ברכבת')],
      title: text('מה משתנה בדרך דרומה'),
      subtitle: [text('משאית מהנמל עד היעד'), text('רכבת עד המסוף, ומשם 12 ק״מ')],
      body: [
        bullets('900 משאיות ביום בכביש 40', 'שלוש שעות נסיעה בעומס', 'עלות הובלה גבוהה בלילה'),
        bullets('שתי רכבות ביום מאשדוד', 'המטען מגיע ליעד תוך 90 דקות', 'פחות 60% פליטות בכל טון'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_sirtut_table',
    name: 'שלבים',
    content: {
      caption: [
        text('שלבי הביצוע'),
        text('התקציב במיליוני שקלים, לפי החוזים שנחתמו עד יוני 2026.'),
      ],
      title: text('שלושה שלבים, תקציב אחד'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['מה נבנה', 'שלב א׳', 'שלב ב׳', 'שלב ג׳'],
        ['עיקר העבודה', 'עפר ומסילות', 'מחסן', 'מרכז בקרה'],
        ['תקציב', '640', '880', '380'],
        ['התחלה', 'ספט׳ 2026', 'מאי 2027', 'ינו׳ 2028'],
        ['סיום', 'יוני 2027', 'מרץ 2028', 'נוב׳ 2028'],
        ['קבלן ראשי', 'מסלול הנדסה', 'אבן ופלדה', 'נתיב מערכות'],
        ['עובדים באתר', '220', '340', '90'],
      ],
    },
  },
  {
    layout: 'l_sirtut_process',
    name: 'מהרציף לשער',
    content: {
      caption: [
        text('מסלול המכולה'),
        text('מנוף מוריד את המכולה מהקרון.'),
        text('מצלמות קוראות את המספר והחותם.'),
        text('רובוט מעביר את המטען למדף פנוי.'),
        text('ההזמנה נאספת ונארזת לפי יעד.'),
        text('המשאית יוצאת עם תעודה דיגיטלית.'),
      ],
      title: text('מהרציף לשער בחמישה צעדים'),
      subtitle: [text('פריקה'), text('סריקה'), text('אחסון'), text('ליקוט'), text('יציאה')],
      number: [text('4 דק׳'), text('40 שנ׳'), text('2 דק׳'), text('6 דק׳'), text('15 דק׳')],
      body: text('פחות מחצי שעה מהרכבת ועד השער.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_sirtut_section',
    name: 'הדרך לשם',
    content: {
      number: text('02'),
      caption: text('חלק שני'),
      title: text('הדרך לשם'),
      subtitle: text('אבני הדרך עד 2028, והצוות שיוביל אותן.'),
    },
  },
  {
    layout: 'l_sirtut_timeline',
    name: 'אבני דרך',
    content: {
      caption: [text('לוח זמנים'), text('התאריכים הם יעדים; לוח הזמנים המלא מתעדכן בכל חודש.')],
      title: text('ארבע אבני דרך עד הרכבת הראשונה'),
      number: [text('2026'), text('2027'), text('2028'), text('2028')],
      subtitle: [
        text('היתרים ועבודות עפר'),
        text('מסילות וגשר'),
        text('המחסן ומרכז הבקרה'),
        text('הרכבת הראשונה'),
      ],
      body: [
        text('אישור הוועדה המחוזית ויישור 420 דונם.'),
        text('שלוש מסילות, ומעבר עילי מעל כביש 40.'),
        text('המבנים, הרובוטים והמערכות, כולל בדיקות קבלה.'),
        text('רכבת מטען ראשונה מאשדוד, ובהמשך שתיים ביום.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_sirtut_full_image',
    name: 'מרכז הבקרה',
    content: {
      image: { assetId: pictures.sirtutHall.id },
      caption: text('רכיב C · הבקרה'),
      title: text('מרכז הבקרה רואה כל מכולה'),
      body: text(
        '1,400 חיישנים, שרתים בתוך המסוף וגיבוי מלא באתר שני. גם אם הקשר לעולם נופל, הרכבות ממשיכות לנוע.',
      ),
    },
  },
  {
    layout: 'l_sirtut_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'בפעם הראשונה תכננו מסוף מהנתונים ולא מהמפה. כל קיר במחסן נמצא במקום שבו הרובוטים צריכים אותו.',
      ),
      attribution: text('נועה בר-לב'),
      caption: text('מנהלת התכנון, דרור תשתיות · אדריכלית המסוף'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_sirtut_team',
    name: 'הצוות',
    content: {
      caption: [
        text('הצוות'),
        text('מנהל הפרויקט'),
        text('מנהלת התכנון'),
        text('מהנדס מערכות'),
        text('מנהלת הביצוע'),
      ],
      title: text('מי מוביל את הבנייה'),
      image: TEAM,
      subtitle: [text('אמיר שלו'), text('נועה בר-לב'), text('דניאל כץ'), text('רונית אדלר')],
      body: [
        text('בנה שני מסופים בצפון, ומוביל את דרור מהיום הראשון.'),
        text('אדריכלית, תכננה את המחסן סביב תנועת הרובוטים.'),
        text('אחראי על הבקרה, החיישנים והמערכות הממוחשבות.'),
        text('מנהלת את הקבלנים באתר ואת לוח הזמנים.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_sirtut_closing',
    name: 'סיום',
    content: {
      caption: [text('הצעד הבא'), text('plan@dror.example · דרור תשתיות')],
      title: text('מאשרים', 'ומתחילים לבנות'),
      body: [
        text('אישור התקציב לשלב א׳ בישיבה הזו'),
        text('חתימה עם הקבלן הראשי עד סוף יולי'),
        text('עלייה לקרקע בספטמבר 2026'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_sirtut_hero',
    name: 'Cover',
    content: {
      caption: [text('DRR-01 · MASTER PLAN'), text('Board review · June 2026')],
      title: text('Building', 'Dror'),
      subtitle: text('An automated rail-freight terminal, 12 km from Beersheba'),
    },
  },
  {
    layout: 'l_sirtut_section',
    name: 'The plan',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('What we build'),
      subtitle: text('A railway, a warehouse and a control centre, on 42 hectares.'),
    },
  },
  {
    layout: 'l_sirtut_big_number',
    name: 'Capacity',
    content: {
      caption: [
        text('CAPACITY'),
        text('hours a day, with no manual night shift'),
        text('autonomous robots in the main warehouse'),
        text('fewer lorries on Route 40 every day'),
      ],
      title: text('The capacity of a small port'),
      number: [text('1.2M'), text('24'), text('38'), text('900')],
      subtitle: text('tonnes of freight a year'),
      body: text(
        'Today every load from Ashdod drives south by lorry. The terminal moves it to rail until the last 12 km.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_sirtut_cards',
    name: 'Three parts',
    content: {
      caption: [
        text('THE SYSTEM'),
        text('PART A · RAIL'),
        text('PART B · WAREHOUSE'),
        text('PART C · CONTROL'),
      ],
      title: text('Three parts, one system'),
      subtitle: [
        text('Three loading tracks'),
        text('A robotic warehouse'),
        text('A control centre'),
      ],
      body: [
        text('Two cranes unload a whole train, a container every four minutes.'),
        text('38 robots sort and pick, with no forklifts.'),
        text('Every container and train on one screen.'),
        text('Built in three phases.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_sirtut_text_image',
    name: 'The warehouse',
    content: {
      caption: text('PART B · THE WAREHOUSE'),
      title: text('A warehouse without forklifts'),
      image: { assetId: pictures.sirtutSite.id },
      subtitle: [
        text('Robots instead of forklifts'),
        text('Racks 14 metres high'),
        text('Daylight from the roof'),
      ],
      body: [
        text('Robots bring the goods from the racks to the pickers.'),
        text('The same floor holds three times the usual stock.'),
        text('A translucent roof saves 40% of the lighting power during the day.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_sirtut_chart',
    name: 'Budget',
    content: {
      caption: [
        text('BUDGET'),
        text('Source: quarterly progress reports, in millions of shekels.'),
      ],
      title: text('Construction is on budget'),
      number: [text('1.9'), text('4%')],
      body: [
        text('billion shekels for all three phases.'),
        text('under forecast, as of quarter end.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Cumulative spend by quarter, NIS millions',
      data: {
        categories: QUARTERS,
        series: [
          { name: 'Planned', values: PLANNED },
          { name: 'Spent', values: SPENT },
        ],
      },
    },
  },
  {
    layout: 'l_sirtut_comparison',
    name: 'Today and tomorrow',
    content: {
      caption: [text('TODAY AND 2028'), text('Today · by lorry'), text('From 2028 · by rail')],
      title: text('What changes on the way south'),
      subtitle: [text('A lorry from port to door'), text('Rail, then 12 km by road')],
      body: [
        bullets('900 lorries a day on Route 40', 'Three hours in traffic', 'Costly night haulage'),
        bullets('Two trains a day', 'At the door in 90 minutes', '60% less emissions'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_sirtut_table',
    name: 'Phases',
    content: {
      caption: [
        text('PHASES'),
        text('Budget in millions of shekels, by the contracts signed up to June 2026.'),
      ],
      title: text('Three phases, one budget'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['What is built', 'Phase A', 'Phase B', 'Phase C'],
        ['Main works', 'Earth and track', 'Warehouse', 'Control centre'],
        ['Budget', '640', '880', '380'],
        ['Start', 'Sep 2026', 'May 2027', 'Jan 2028'],
        ['Finish', 'Jun 2027', 'Mar 2028', 'Nov 2028'],
        ['Main contractor', 'Maslul Engineering', 'Even & Steel', 'Nativ Systems'],
        ['Workers on site', '220', '340', '90'],
      ],
    },
  },
  {
    layout: 'l_sirtut_process',
    name: 'Platform to gate',
    content: {
      caption: [
        text('A CONTAINER’S ROUTE'),
        text('A crane lifts it off the wagon.'),
        text('Cameras check the seal.'),
        text('A robot finds it a rack.'),
        text('Picked and packed.'),
        text('Out with a digital waybill.'),
      ],
      title: text('From platform to gate in five steps'),
      subtitle: [text('Unload'), text('Scan'), text('Store'), text('Pick'), text('Dispatch')],
      number: [text('4 min'), text('40 sec'), text('2 min'), text('6 min'), text('15 min')],
      body: text('Train to gate: under 30 minutes.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_sirtut_section',
    name: 'Getting there',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('Getting there'),
      subtitle: text('The milestones up to 2028, and the team that leads them.'),
    },
  },
  {
    layout: 'l_sirtut_timeline',
    name: 'Milestones',
    content: {
      caption: [text('SCHEDULE'), text('Dates are targets.')],
      title: text('Four milestones to the first train'),
      number: [text('2026'), text('2027'), text('2028'), text('2028')],
      subtitle: [
        text('Permits and earthworks'),
        text('Tracks and bridge'),
        text('Warehouse and control'),
        text('The first train'),
      ],
      body: [
        text('District approval, and levelling 42 hectares.'),
        text('Three tracks, and a bridge over Route 40.'),
        text('Buildings, robots and systems, all tested.'),
        text('The first train from Ashdod, then two a day.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_sirtut_full_image',
    name: 'The control centre',
    content: {
      image: { assetId: pictures.sirtutHall.id },
      caption: text('PART C · CONTROL'),
      title: text('The control centre sees every container'),
      body: text(
        '1,400 sensors, servers inside the terminal and a full backup on a second site. If the link to the world goes down, the trains keep moving.',
      ),
    },
  },
  {
    layout: 'l_sirtut_quote',
    name: 'Quote',
    content: {
      quote: text(
        'For the first time we planned a terminal from the data, not from the map. Every wall of the warehouse stands where the robots need it.',
      ),
      attribution: text('Noa Bar-Lev'),
      caption: text('Head of planning, Dror Infrastructure · architect of the terminal'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_sirtut_team',
    name: 'The team',
    content: {
      caption: [
        text('THE TEAM'),
        text('Project director'),
        text('Head of planning'),
        text('Systems engineer'),
        text('Construction manager'),
      ],
      title: text('Who leads the build'),
      image: TEAM,
      subtitle: [
        text('Amir Shalev'),
        text('Noa Bar-Lev'),
        text('Daniel Katz'),
        text('Ronit Adler'),
      ],
      body: [
        text('Built two terminals in the north; has led Dror from day one.'),
        text('Architect; planned the warehouse around the robots.'),
        text('In charge of control, sensors and systems.'),
        text('Runs the contractors and the schedule.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_sirtut_closing',
    name: 'Closing',
    content: {
      caption: [text('NEXT STEP'), text('plan@dror.example · Dror Infrastructure')],
      title: text('Approve,', 'and we build'),
      body: [
        text('Phase A budget approved at this meeting'),
        text('Main contractor signed by the end of July'),
        text('Breaking ground in September 2026'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const sirtutSamples = { he: sampleHe, en: sampleEn };

/** The Sirtut template: the theme, sixteen layouts for both directions, and its sample deck. */
export function sirtutTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(sirtutTheme),
    description:
      'Blueprint: white linework, dimension lines and a title block on blueprint blue, for plans, roadmaps and engineering.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.sirtutSite,
      pictures.sirtutHall,
      pictures.sirtutTeam1,
      pictures.sirtutTeam2,
      pictures.sirtutTeam3,
      pictures.sirtutTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
