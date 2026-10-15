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
  NO_FILL,
  pageNumber,
  para,
  place,
  rect,
  sampleSlides,
  solid,
  SURFACE,
  text,
  token,
  type SampleSlide,
} from '../builtin/kit';
import { picture } from './pictures';

/**
 * Magen (shield): the slide is the wall screen of a security operations centre at night. A
 * near-black ground ruled in cool steel, a signal red for what is an alert, an amber for what is a
 * warning, and a green for what is safe, used sparingly. The drawn language is a HUD's: targeting
 * brackets on the corners of the slide and around every picture, a radar with its sweep on the
 * opening, a hexagonal mesh fading out of a corner, a segmented threat meter, redaction bars over
 * a log, incident numbers and timestamps in mono, and a traffic-light classification (TLP) on the
 * top corner. The timeline is the trace of an incident, the process a response playbook in
 * chevrons, the comparison an exposed panel against a shielded one, the team a row of access
 * badges. For security briefings, SOC reports, incident reviews, compliance and risk decks.
 *
 * Every letter the drawings hold is SVG text in JetBrains Mono, never counted as the slide's
 * words, and it reads left to right in both directions: the layouts of a left-to-right deck are
 * the mirrors, with every drawing that holds letters turned back (and redrawn where its letters
 * follow the slide's direction).
 */
export const magenTheme: Theme = {
  id: 'magen',
  name: 'Magen',
  colors: {
    bg: '#0a0c10',
    surface: '#141920',
    text: '#eef1f4',
    muted: '#8f9aa6',
    primary: '#ff3b4a',
    secondary: '#ffb21e',
    accent: '#3ee08a',
    chart: ['#ff3b4a', '#c3ccd6', '#ffb21e', '#3ee08a', '#6f7b88', '#ff9aa2'],
  },
  // A heavy Hebrew grotesque, and a technical Latin one for the words and the figures between
  // its letters; the body is the plain Heebo and Inter. The mono is in the drawings only.
  fonts: {
    heading: { he: 'Heebo', latin: 'Space Grotesk' },
    body: { he: 'Heebo', latin: 'Inter' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 112,
      weight: 800,
      lineHeight: 1.04,
      letterSpacing: -1.5,
      color: { token: 'text' },
    },
    title: {
      font: 'heading',
      size: 60,
      weight: 700,
      lineHeight: 1.12,
      letterSpacing: -0.5,
      color: { token: 'text' },
    },
    heading: { font: 'heading', size: 36, weight: 600, lineHeight: 1.25, color: { token: 'text' } },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 4,
  shadow: { x: 0, y: 20, blur: 48, color: { value: '#000000', alpha: 0.6 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    SURFACE,
    {
      // The red of an alert, glowing from the top corner of the end side.
      fill: { kind: 'solid', color: { token: 'bg' } },
      overlay: {
        kind: 'radial',
        center: { x: 0, y: 0 },
        stops: [
          { color: { token: 'primary', alpha: 0.12 }, at: 0 },
          { color: { token: 'primary', alpha: 0 }, at: 0.75 },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// The colours of the drawings

const RED = '#ff3b4a';
const AMBER = '#ffb21e';
const GREEN = '#3ee08a';
const INK = '#eef1f4';
const STEEL = '#8f9aa6';
const BG = '#0a0c10';
const PANEL = '#141920';
/** Steel the theme has no token for: they stay themselves on every variant. */
const STEEL_LIGHT = '#c3ccd6';
/** The black of a redaction bar. */
const VOID = '#020304';

const PAINT = {
  [RED]: token('primary'),
  [AMBER]: token('secondary'),
  [GREEN]: token('accent'),
  [INK]: token('text'),
  [STEEL]: token('muted'),
  [BG]: token('bg'),
  [PANEL]: token('surface'),
};

const MONO = 'font-family="\'JetBrains Mono\', ui-monospace, monospace"';

/**
 * The drawings that hold letters: the mirror of a left-to-right deck turns them back, and takes
 * the drawing for that direction where one is given.
 */
const READABLE = new Map<string, string | undefined>();

type Dir = 'rtl' | 'ltr';

/** A drawing with letters in it, kept readable in both directions. */
function lettered(id: string, frame: Frame, markup: string | ((dir: Dir) => string)): Element {
  const rtl = typeof markup === 'string' ? markup : markup('rtl');
  READABLE.set(id, typeof markup === 'string' ? undefined : markup('ltr'));
  return drawing(id, frame, rtl, PAINT);
}

/** A drawing. Its letters read left to right whatever the slide's direction. */
const svg = (w: number, h: number, body: string) =>
  `<svg viewBox="0 0 ${w} ${h}" fill="none" direction="ltr" unicode-bidi="isolate">${body}</svg>`;

/**
 * A line of mono letters in a box, against the side of the box that faces the edge it stands
 * by: `hug` is that edge in the right-to-left drawing, and the other one in the mirror.
 */
const word =
  (
    w: number,
    h: number,
    base: number,
    size: number,
    body: string,
    hug: 'start' | 'end',
    attrs = '',
  ) =>
  (dir: Dir) => {
    const right = (hug === 'start') === (dir === 'rtl');
    return svg(
      w,
      h,
      `<text x="${right ? w : 0}" y="${base}" text-anchor="${right ? 'end' : 'start'}" ${MONO} font-size="${size}" ${attrs}>${body}</text>`,
    );
  };

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A small seeded generator, so a drawing comes out the same every time. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ---------------------------------------------------------------------------------------------
// What the layouts share

/** The margin of both sides, and the width between them. */
const M = 96;
const WIDTH = 1920 - 2 * M;

const PANEL_FILL = solid(token('surface'));
const RED_FILL = solid(token('primary'));
const HAIR = solid(token('text', 0.1));
const STEEL_HAIR = solid(token('muted', 0.28));

/** The four corners of a box, as the brackets of a sight: `arm` long, inside the box. */
function cornerPath(
  w: number,
  h: number,
  arm: number,
  i: number,
  only: 'all' | 'bottom' | 'top' = 'all',
) {
  const top = `M${i} ${i + arm}V${i}H${i + arm}M${w - i - arm} ${i}H${w - i}V${i + arm}`;
  const bottom = `M${w - i} ${h - i - arm}V${h - i}H${w - i - arm}M${i + arm} ${h - i}H${i}V${h - i - arm}`;
  return only === 'top' ? top : only === 'bottom' ? bottom : top + bottom;
}

interface Sight {
  color?: string;
  opacity?: number;
  arm?: number;
  width?: number;
  only?: 'all' | 'bottom' | 'top';
}

function brackets(id: string, frame: Frame, sight: Sight = {}): Element {
  const { color = STEEL, opacity = 0.6, arm = 28, width = 2, only = 'all' } = sight;
  const { w, h } = frame;
  return drawing(
    id,
    frame,
    svg(
      w,
      h,
      `<path d="${cornerPath(w, h, arm, width / 2, only)}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${width}"/>`,
    ),
    PAINT,
  );
}

/** The sight on the corners of the slide. */
const slideFrame = (name: string, only: 'all' | 'bottom' = 'all') =>
  brackets(`d_magen_${name}_frame`, at(36, 36, 1848, 1008), { opacity: 0.45, arm: 40, only });

/**
 * The traffic-light classification of the document on the top corner of the end side: who may
 * see it. AMBER for most of a briefing; CLEAR on the slide meant for everyone.
 */
function tlp(name: string, level: 'AMBER' | 'CLEAR' = 'AMBER'): Element {
  const color = level === 'AMBER' ? AMBER : INK;
  return lettered(
    `d_magen_${name}_tlp`,
    atEnd(M, 44, 156, 32),
    svg(
      156,
      32,
      `<rect x="1" y="1" width="154" height="30" fill="${color}" fill-opacity=".08" stroke="${color}" stroke-opacity=".7" stroke-width="1.5"/>` +
        `<rect x="13" y="11" width="10" height="10" fill="${color}"/>` +
        `<text x="34" y="22" ${MONO} font-size="16" font-weight="700" letter-spacing="1" fill="${color}">TLP:${level}</text>`,
    ),
  );
}

/** A sight with a red point: what stands before a kicker. */
const reticle = (id: string, frame: Frame) =>
  drawing(
    id,
    frame,
    svg(
      22,
      22,
      `<path d="${cornerPath(22, 22, 7, 1)}" stroke="${STEEL}" stroke-width="2"/><rect x="7" y="7" width="8" height="8" fill="${RED}"/>`,
    ),
    PAINT,
  );

/** The shield of the mark, in a box of 40 by 46. */
const SHIELD_PATH = 'M20 1.5 37.5 7.6V22.4c0 11-7.3 19.2-17.5 22.4C9.8 41.6 2.5 33.4 2.5 22.4V7.6z';
const KEYHOLE = (color: string) =>
  `<circle cx="20" cy="19.6" r="5.2" fill="${color}"/><path d="M17.4 22.6h5.2l1.7 9.6h-8.6z" fill="${color}"/>`;

const mark = (id: string, frame: Frame) =>
  drawing(id, frame, svg(40, 46, `<path d="${SHIELD_PATH}" fill="${RED}"/>${KEYHOLE(BG)}`), PAINT, {
    role: 'logo',
    name: 'logo',
  });

/** A ruler: a hairline with ticks, the first stretch of it red (drawn for right to left). */
function ruler(id: string, frame: Frame, lead = 160): Element {
  const { w, h } = frame;
  const ticks = Array.from({ length: Math.floor(w / 16) + 1 }, (_, i) => {
    const x = w - i * 16;
    const long = i % 5 === 0;
    return `<path d="M${r1(x)} 1v${long ? h - 1 : Math.round(h * 0.45)}" stroke="${STEEL}" stroke-opacity="${long ? 0.4 : 0.22}"/>`;
  }).join('');
  return drawing(
    id,
    frame,
    svg(
      w,
      h,
      `<path d="M0 .5H${w}" stroke="${STEEL}" stroke-opacity=".3"/>${ticks}<rect x="${w - lead}" y="0" width="${lead}" height="2.5" fill="${RED}"/>`,
    ),
    PAINT,
  );
}

/** The kicker after its sight and the title under it. */
function head(name: string, width = 1520, lines = 1) {
  return {
    placeholders: [
      place('p_kicker', 'caption', at(M + 38, 100, Math.min(900, width - 38), 34), 'caption'),
      place('p_title', 'title', at(M, 144, width, 74 * lines), 'title'),
    ],
    decorations: [reticle(`d_magen_${name}_reticle`, at(M, 106, 22, 22))],
  };
}

/**
 * The foot of a content slide: a ruler, the shield, the deck's name, and the number of the slide
 * between two brackets at the end (SLD-04).
 */
function foot(name: string) {
  return {
    placeholders: [place('p_footer', 'footer', at(M + 58, 958, 900, 34), 'caption')],
    decorations: [
      ruler(`d_magen_${name}_ruler`, at(M, 928, WIDTH, 12)),
      mark(`d_magen_${name}_mark`, at(M, 952, 38, 44)),
      drawing(
        `d_magen_${name}_folio`,
        atEnd(M, 950, 116, 48),
        svg(
          116,
          48,
          `<path d="M14 2H3v44h11M102 2h11v44h-11" stroke="${STEEL}" stroke-opacity=".7" stroke-width="2"/>`,
        ),
        PAINT,
      ),
      pageNumber(`d_magen_${name}_number`, atEnd(M + 16, 958, 84, 34), 'caption', {
        color: token('text'),
        weight: 600,
        align: 'center',
      }),
    ],
  };
}

/** What every content slide wears: the sight on its corners and its classification. */
const chrome = (name: string) => [slideFrame(name), tlp(name)];

/** A panel of the console: the surface, square, with a hairline. */
const panel = (id: string, frame: Frame, fill: Fill = PANEL_FILL) =>
  rect(id, frame, fill, { stroke: { color: token('text', 0.07), width: 1 } });

/** A glow of light on the ground, under everything. */
const glow = (id: string, frame: Frame, color: 'primary' | 'accent' | 'muted', alpha: number) =>
  dot(id, frame, {
    kind: 'radial',
    stops: [
      { color: token(color, alpha), at: 0 },
      { color: token(color, alpha * 0.45), at: 0.34 },
      // The ellipse is inscribed in the box, and the gradient reaches its farthest corner.
      { color: token(color, 0), at: 0.68 },
      { color: token(color, 0), at: 1 },
    ],
  });

// ---------------------------------------------------------------------------------------------
// The drawn pieces

/**
 * A mesh of hexagons fading out from a point: the classic tile of 56 by 100, scaled by `k`.
 * `cells` are cells of the mesh lit up, given by column and row of the tile and which of its two
 * hexagons (0: the whole one, 1: the one on the tile's corner).
 */
function hexMesh(
  id: string,
  frame: Frame,
  fade: { x: number; y: number; r: number },
  { k = 0.6, opacity = 0.22, cells = [] as [number, number, 0 | 1, string][] } = {},
): Element {
  const { w, h } = frame;
  const g = id.replace(/[^a-z0-9]/gi, '');
  const hex = (cx: number, cy: number) =>
    [
      [0, -33],
      [28, -17],
      [28, 17],
      [0, 33],
      [-28, 17],
      [-28, -17],
    ]
      .map(([dx, dy], i) => `${i ? 'L' : 'M'}${r1((cx + dx!) * k)} ${r1((cy + dy!) * k)}`)
      .join('') + 'Z';
  const lit = cells
    .map(([i, j, half, color]) => {
      const cx = half ? 56 * i : 28 + 56 * i;
      const cy = half ? 83 + 100 * j : 33 + 100 * j;
      return `<path d="${hex(cx, cy)}" fill="${color}" fill-opacity=".16" stroke="${color}" stroke-opacity=".85" stroke-width="1.5"/>`;
    })
    .join('');
  return drawing(
    id,
    frame,
    svg(
      w,
      h,
      `<defs><pattern id="${g}p" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(${k})">` +
        `<path d="M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100" stroke="${STEEL}" stroke-width="${r1(1.2 / k)}"/></pattern>` +
        `<radialGradient id="${g}g" gradientUnits="userSpaceOnUse" cx="${fade.x}" cy="${fade.y}" r="${fade.r}"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".55" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
        `<mask id="${g}m"><rect width="${w}" height="${h}" fill="url(#${g}g)"/></mask></defs>` +
        `<g mask="url(#${g}m)"><rect width="${w}" height="${h}" fill="url(#${g}p)" opacity="${opacity}"/>${lit}</g>`,
    ),
    PAINT,
  );
}

/** The ring of a radar, with its ticks, crosshair, rings, the edge of its sweep and its blips. */
const RADAR = 940;
const BLIPS: { a: number; r: number; color: string; size: number; label?: string }[] = [
  { a: -62, r: 300, color: RED, size: 9, label: 'INC-0412 · BLOCKED' },
  { a: 200, r: 214, color: AMBER, size: 7, label: '198.51.100.23 · PROBE' },
  { a: 128, r: 372, color: RED, size: 6, label: 'INC-0417 · BLOCKED' },
  { a: -118, r: 160, color: STEEL_LIGHT, size: 4 },
  { a: 32, r: 250, color: STEEL_LIGHT, size: 4 },
  { a: 70, r: 120, color: STEEL_LIGHT, size: 3 },
  { a: -170, r: 330, color: STEEL_LIGHT, size: 3 },
];
const polar = (c: number, a: number, r: number): [number, number] => [
  c + r * Math.cos((a * Math.PI) / 180),
  c + r * Math.sin((a * Math.PI) / 180),
];

function radarGrid(): string {
  const c = RADAR / 2;
  const R = c - 10;
  const rings = [R, R * 0.8, R * 0.6, R * 0.4, R * 0.2]
    .map(
      (r, i) =>
        `<circle cx="${c}" cy="${c}" r="${r1(r)}" stroke="${STEEL}" stroke-opacity="${i === 0 ? 0.42 : 0.2}" stroke-width="${i === 0 ? 2 : 1.2}"/>`,
    )
    .join('');
  const dashed = `<circle cx="${c}" cy="${c}" r="${r1(R * 0.7)}" stroke="${STEEL}" stroke-opacity=".16" stroke-dasharray="3 7"/>`;
  const ticks = Array.from({ length: 180 }, (_, i) => {
    const a = i * 2;
    const len = a % 30 === 0 ? 22 : a % 10 === 0 ? 12 : 6;
    const [x1, y1] = polar(c, a, R);
    const [x2, y2] = polar(c, a, R - len);
    return `<path d="M${r1(x1)} ${r1(y1)}L${r1(x2)} ${r1(y2)}" stroke="${STEEL}" stroke-opacity="${a % 30 === 0 ? 0.6 : 0.3}"/>`;
  }).join('');
  const cross =
    `<path d="M${c - R} ${c}H${c + R}M${c} ${c - R}V${c + R}" stroke="${STEEL}" stroke-opacity=".16"/>` +
    [45, 135]
      .map((a) => {
        const [x1, y1] = polar(c, a, R);
        const [x2, y2] = polar(c, a + 180, R);
        return `<path d="M${r1(x1)} ${r1(y1)}L${r1(x2)} ${r1(y2)}" stroke="${STEEL}" stroke-opacity=".07"/>`;
      })
      .join('');
  // The leading edge of the sweep, which turns clockwise: north-east.
  const [ex, ey] = polar(c, -45, R);
  const edge = `<path d="M${c} ${c}L${r1(ex)} ${r1(ey)}" stroke="${RED}" stroke-opacity=".9" stroke-width="2.5"/>`;
  const blips = BLIPS.map(({ a, r, color, size }) => {
    const [x, y] = polar(c, a, r);
    const halo =
      size > 5
        ? `<circle cx="${r1(x)}" cy="${r1(y)}" r="${size * 2.6}" stroke="${color}" stroke-opacity=".55" stroke-width="1.5"/><circle cx="${r1(x)}" cy="${r1(y)}" r="${size * 4.6}" stroke="${color}" stroke-opacity=".18"/>`
        : '';
    return `${halo}<circle cx="${r1(x)}" cy="${r1(y)}" r="${size}" fill="${color}" fill-opacity="${size > 5 ? 1 : 0.55}"/>`;
  }).join('');
  // The shield at the centre.
  const s = 3.3;
  const shield =
    `<g transform="translate(${c - 20 * s} ${c - 23 * s}) scale(${s})">` +
    `<path d="${SHIELD_PATH}" fill="${BG}" stroke="${RED}" stroke-width="1.3"/>` +
    `<path d="M20 6.5 33 11v11.4c0 8.4-5.4 14.6-13 17.2-7.6-2.6-13-8.8-13-17.2V11z" stroke="${RED}" stroke-opacity=".45" stroke-width=".6"/>${KEYHOLE(RED)}</g>`;
  return svg(RADAR, RADAR, rings + dashed + cross + ticks + edge + blips + shield);
}

/** The letters of the radar: its bearings, which stay where they are, and the names of its blips. */
const radarLabels = (dir: Dir) => {
  const c = RADAR / 2;
  const R = c - 10;
  const bearings = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
    .map((b) => {
      const [x, y] = polar(c, b - 90, R - 42);
      return `<text x="${r1(x)}" y="${r1(y + 5)}" text-anchor="middle" ${MONO} font-size="15" fill="${STEEL}" fill-opacity=".75">${String(b).padStart(3, '0')}</text>`;
    })
    .join('');
  const names = BLIPS.filter((b) => b.label)
    .map(({ a, r, color, size, label }) => {
      // Beside the blip, on the side that faces the middle of the slide.
      const [bx, y] = polar(c, a, r);
      const gap = size * 2.6 + 10;
      const x = dir === 'rtl' ? bx + gap : RADAR - bx - gap;
      return `<text x="${r1(x)}" y="${r1(y - size * 2.6 - 4)}" text-anchor="${dir === 'rtl' ? 'start' : 'end'}" ${MONO} font-size="15" font-weight="600" fill="${color === STEEL_LIGHT ? STEEL : color}">${label}</text>`;
    })
    .join('');
  return svg(RADAR, RADAR, bearings + names);
};

/**
 * A quarter of a radar from the corner of the end side: rings, the ticks of its rim, a sweep and
 * two blips. Drawn for right to left, where that corner is the bottom left.
 */
function radarQuarter(size: number): string {
  const cy = size;
  const at = (a: number, r: number): [number, number] => [
    r * Math.cos((a * Math.PI) / 180),
    cy + r * Math.sin((a * Math.PI) / 180),
  ];
  const R = size - 12;
  const rings = [0.2, 0.4, 0.6, 0.8, 1]
    .map(
      (k, i) =>
        `<path d="M${r1(R * k)} ${cy}A${r1(R * k)} ${r1(R * k)} 0 0 0 0 ${r1(cy - R * k)}" stroke="${STEEL}" stroke-opacity="${i === 4 ? 0.34 : 0.16}" stroke-width="${i === 4 ? 1.6 : 1}"/>`,
    )
    .join('');
  const ticks = Array.from({ length: 46 }, (_, i) => {
    const a = -i * 2;
    const len = i % 15 === 0 ? 20 : i % 5 === 0 ? 11 : 5;
    const [x1, y1] = at(a, R);
    const [x2, y2] = at(a, R - len);
    return `<path d="M${r1(x1)} ${r1(y1)}L${r1(x2)} ${r1(y2)}" stroke="${STEEL}" stroke-opacity="${i % 5 === 0 ? 0.45 : 0.25}"/>`;
  }).join('');
  const lead = -38;
  const trail = Array.from({ length: 14 }, (_, i) => {
    const a1 = lead - (i + 1) * 2.2;
    const a0 = lead - i * 2.2;
    const [x0, y0] = at(a0, R);
    const [x1, y1] = at(a1, R);
    return `<path d="M0 ${cy}L${r1(x0)} ${r1(y0)}A${R} ${R} 0 0 0 ${r1(x1)} ${r1(y1)}Z" fill="${RED}" fill-opacity="${r1(0.11 * (1 - i / 14) * 100) / 100}"/>`;
  }).join('');
  const [ex, ey] = at(lead, R);
  const blip = (a: number, r: number, color: string) => {
    const [x, y] = at(a, r);
    return `<circle cx="${r1(x)}" cy="${r1(y)}" r="7" fill="${color}"/><circle cx="${r1(x)}" cy="${r1(y)}" r="17" stroke="${color}" stroke-opacity=".5" stroke-width="1.5"/>`;
  };
  return svg(
    size,
    size,
    rings +
      ticks +
      trail +
      `<path d="M0 ${cy}L${r1(ex)} ${r1(ey)}" stroke="${RED}" stroke-opacity=".8" stroke-width="2"/>` +
      blip(-52, 360, RED) +
      blip(-20, 560, AMBER),
  );
}

/** The segmented meter of a threat level, read in the slide's direction. */
function meter(dir: Dir, w: number, lit: number, n = 25): string {
  const gap = 6;
  const seg = (w - gap * (n - 1)) / n;
  const x = (i: number) => (dir === 'rtl' ? w - (i + 1) * seg - i * gap : i * (seg + gap));
  const colorAt = (t: number) => (t < 0.28 ? GREEN : t < 0.62 ? AMBER : RED);
  const cells = Array.from({ length: n }, (_, i) => {
    const on = i < lit;
    const c = colorAt(i / (n - 1));
    return `<rect x="${r1(x(i))}" y="10" width="${r1(seg)}" height="20" fill="${on ? c : STEEL}" fill-opacity="${on ? 0.92 : 0.16}"/>`;
  }).join('');
  const zones = ['LOW', 'GUARDED', 'ELEVATED', 'HIGH', 'SEVERE'];
  const level = Math.min(4, Math.floor(((lit - 1) / n) * 5));
  const labels = zones
    .map((z, i) => {
      const from = Math.round((i * n) / 5);
      const to = Math.round(((i + 1) * n) / 5) - 1;
      const cx = (x(from) + x(to) + seg) / 2;
      const on = i === level;
      return `<text x="${r1(cx)}" y="54" text-anchor="middle" ${MONO} font-size="14" font-weight="${on ? 700 : 500}" letter-spacing="1" fill="${on ? colorAt(i / 4.6) : STEEL}" fill-opacity="${on ? 1 : 0.7}">${z}</text>`;
    })
    .join('');
  const mx = x(lit - 1) + seg / 2;
  const marker = `<path d="M${r1(mx - 7)} 0h14l-7 7z" fill="${INK}"/>`;
  return svg(w, 60, cells + labels + marker);
}

/** A sparkline of a readout, quietly going the way of the slide. */
function sparkline(id: string, frame: Frame, seed: number, color = STEEL): Element {
  const { w, h } = frame;
  const rnd = seeded(seed);
  const n = 18;
  const pts = Array.from({ length: n }, (_, i) => {
    const v = 0.35 + 0.4 * Math.sin(i / 2.4 + seed) * 0.5 + rnd() * 0.35;
    return `${r1((i / (n - 1)) * (w - 4) + 2)},${r1(h - 2 - v * (h - 6))}`;
  }).join(' ');
  return drawing(
    id,
    frame,
    svg(
      w,
      h,
      `<polyline points="${pts}" stroke="${color}" stroke-opacity=".7" stroke-width="2" stroke-linejoin="round"/>`,
    ),
    PAINT,
  );
}

/** An audio wave: the line of a recorded voice. */
function waveform(id: string, frame: Frame): Element {
  const { w, h } = frame;
  const rnd = seeded(41);
  const n = Math.floor(w / 8);
  const bars = Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const env = Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 0.6;
    const v = Math.max(0.06, env * (0.25 + rnd() * 0.75));
    const bh = r1(v * (h - 4));
    const hot = t > 0.08 && t < 0.42;
    return `<rect x="${w - (i + 1) * 8 + 2}" y="${r1((h - bh) / 2)}" width="4" height="${bh}" fill="${hot ? RED : STEEL}" fill-opacity="${hot ? 0.9 : 0.45}"/>`;
  }).join('');
  return drawing(id, frame, svg(w, h, bars), PAINT);
}

/** A hexagon with a number in it, the mark of a point. */
function hexBadge(id: string, frame: Frame, label: string, color = RED): Element {
  const { w, h } = frame;
  const cx = w / 2;
  const s = h / 2 - 2;
  const pts = [-90, -30, 30, 90, 150, 210]
    .map(
      (a) =>
        `${r1(cx + s * Math.cos((a * Math.PI) / 180))},${r1(h / 2 + s * Math.sin((a * Math.PI) / 180))}`,
    )
    .join(' ');
  return lettered(
    id,
    frame,
    svg(
      w,
      h,
      `<polygon points="${pts}" fill="${color}" fill-opacity=".12" stroke="${color}" stroke-width="2"/>` +
        `<text x="${cx}" y="${h / 2 + 6}" text-anchor="middle" ${MONO} font-size="17" font-weight="700" fill="${color}">${label}</text>`,
    ),
  );
}

/** A padlock, open or shut. */
function padlock(id: string, frame: Frame, open: boolean, color: string): Element {
  const shackle = open
    ? `<path d="M10 20v-7a8 8 0 0 1 15.6-2.5" stroke="${color}" stroke-width="3.2" stroke-linecap="round"/>`
    : `<path d="M10 20v-7a8 8 0 0 1 16 0v7" stroke="${color}" stroke-width="3.2"/>`;
  return drawing(
    id,
    frame,
    svg(
      36,
      40,
      `${shackle}<rect x="4" y="19" width="28" height="19" rx="3" fill="${color}" fill-opacity=".18" stroke="${color}" stroke-width="2.6"/><rect x="16.5" y="25" width="3" height="7" rx="1.5" fill="${color}"/>`,
    ),
    PAINT,
  );
}

/** A chevron that points the way the slide reads (drawn for right to left). */
const chevron = (id: string, frame: Frame, color = RED) =>
  drawing(
    id,
    frame,
    svg(
      frame.w,
      frame.h,
      `<path d="M${frame.w - 5} 4 5 ${frame.h / 2}l${frame.w - 10} ${frame.h / 2 - 4}" stroke="${color}" stroke-width="4" stroke-linecap="square" stroke-linejoin="miter"/>`,
    ),
    PAINT,
  );

/** A warning sign. */
const warning = (id: string, frame: Frame) =>
  drawing(
    id,
    frame,
    svg(
      38,
      34,
      `<path d="M19 2 36.5 32h-35z" fill="${AMBER}" fill-opacity=".14" stroke="${AMBER}" stroke-width="2.4" stroke-linejoin="round"/><path d="M19 12v9" stroke="${AMBER}" stroke-width="3" stroke-linecap="round"/><circle cx="19" cy="26.6" r="1.9" fill="${AMBER}"/>`,
    ),
    PAINT,
  );

/**
 * A small network of hosts: exposed, with a broken perimeter and attacks reaching three of them,
 * or shielded, inside a hexagon where the same attacks stop. In a box of 340 by 180.
 */
function network(exposed: boolean): string {
  const nodes: [number, number][] = [
    [170, 92],
    [96, 60],
    [244, 56],
    [104, 132],
    [238, 130],
    [170, 30],
    [170, 154],
  ];
  const edges = [
    [0, 1],
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [0, 6],
    [1, 5],
    [5, 2],
    [3, 6],
    [6, 4],
  ];
  const hit = new Set(exposed ? [1, 2, 4] : []);
  const lines = edges
    .map(([i, j]) => {
      const [x1, y1] = nodes[i!]!;
      const [x2, y2] = nodes[j!]!;
      return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="${STEEL}" stroke-opacity=".45" stroke-width="1.5"/>`;
    })
    .join('');
  const dots = nodes
    .map(([x, y], i) => {
      const color = hit.has(i) ? RED : i === 0 ? (exposed ? STEEL_LIGHT : GREEN) : STEEL_LIGHT;
      const halo = hit.has(i)
        ? `<circle cx="${x}" cy="${y}" r="14" stroke="${RED}" stroke-opacity=".55" stroke-width="1.5"/>`
        : '';
      return `${halo}<circle cx="${x}" cy="${y}" r="${i === 0 ? 8 : 6}" fill="${BG}" stroke="${color}" stroke-width="2.4"/>`;
    })
    .join('');
  // Attacks from outside: to a host, or to the wall.
  const attacks: [number, number, number][] = [
    [8, 14, 1],
    [334, 10, 2],
    [334, 176, 4],
  ];
  const hex = '170,6 318,47 318,133 170,174 22,133 22,47';
  const arrows = attacks
    .map(([x, y, n]) => {
      const [tx, ty] = nodes[n]!;
      const k = exposed ? 0.86 : 0.42;
      const ex = x + (tx - x) * k;
      const ey = y + (ty - y) * k;
      const end = exposed
        ? ''
        : `<path d="M${r1(ex - 7)} ${r1(ey - 7)}l14 14M${r1(ex + 7)} ${r1(ey - 7)}l-14 14" stroke="${RED}" stroke-width="2.4"/>`;
      return `<path d="M${x} ${y}L${r1(ex)} ${r1(ey)}" stroke="${RED}" stroke-opacity=".8" stroke-width="2" stroke-dasharray="6 5"/>${end}`;
    })
    .join('');
  const wall = exposed
    ? `<polygon points="${hex}" stroke="${RED}" stroke-opacity=".5" stroke-width="2" stroke-dasharray="26 18"/>`
    : `<polygon points="${hex}" fill="${GREEN}" fill-opacity=".06" stroke="${GREEN}" stroke-opacity=".85" stroke-width="2.4"/>`;
  return svg(340, 180, wall + lines + arrows + dots);
}

/** A barcode, as on the foot of an access badge. */
function barcode(id: string, frame: Frame, seed: number): Element {
  const { w, h } = frame;
  const rnd = seeded(seed);
  let x = 0;
  let bars = '';
  while (x < w - 4) {
    const bw = 1 + Math.floor(rnd() * 4);
    bars += `<rect x="${x}" y="0" width="${bw}" height="${h}" fill="${STEEL}" fill-opacity=".55"/>`;
    x += bw + 1 + Math.floor(rnd() * 3);
  }
  return drawing(id, frame, svg(w, h, bars), PAINT);
}

/**
 * The trace of an incident: a signal that spikes at the alarm and settles by the recovery,
 * going from red to amber to green the way the slide reads. `nodes` are the x of each stage in
 * the drawing, from the start.
 */
function trace(w: number, h: number, nodes: number[]): string {
  const base = h / 2;
  const amp = [56, 30, 14, 0];
  const rnd = seeded(17);
  const pts: string[] = [];
  for (let x = w; x >= 0; x -= 3) {
    let y = 0;
    nodes.forEach((n, k) => {
      const d = n - 40 - x;
      if (d > -40) y += amp[k]! * Math.exp(-((d / 70) ** 2)) * Math.sin(d / 7.5);
    });
    y += (rnd() - 0.5) * (x > nodes[3]! ? 3 : 1);
    pts.push(`${x},${r1(base - y)}`);
  }
  const ticks = Array.from({ length: Math.floor(w / 24) + 1 }, (_, i) => {
    const x = w - i * 24;
    return `<path d="M${x} ${h - 8}v${i % 4 === 0 ? 8 : 4}" stroke="${STEEL}" stroke-opacity="${i % 4 === 0 ? 0.4 : 0.22}"/>`;
  }).join('');
  return svg(
    w,
    h,
    `<defs><linearGradient id="tr" gradientUnits="userSpaceOnUse" x1="${w}" y1="0" x2="0" y2="0">` +
      `<stop offset="0" stop-color="${RED}"/><stop offset=".3" stop-color="${RED}"/><stop offset=".52" stop-color="${AMBER}"/><stop offset=".7" stop-color="${GREEN}"/><stop offset="1" stop-color="${GREEN}"/></linearGradient></defs>` +
      `<path d="M0 ${base}H${w}" stroke="${STEEL}" stroke-opacity=".18" stroke-dasharray="2 6"/>` +
      `<path d="M0 ${h - 8}H${w}" stroke="${STEEL}" stroke-opacity=".25"/>${ticks}` +
      `<polyline points="${pts.join(' ')}" stroke="url(#tr)" stroke-width="7" stroke-opacity=".14" stroke-linejoin="round"/>` +
      `<polyline points="${pts.join(' ')}" stroke="url(#tr)" stroke-width="2.4" stroke-linejoin="round"/>`,
  );
}

/** The incident log beside the quote, with what may not be read blacked out. */
function redactedLog(w: number, h: number): string {
  // What is blacked out is written as blocks: each run of them, with what lies between, is a bar.
  const rows: [string, string][] = [
    ['03:12:44', 'EDR alert R-4417 · FIN-WS-0231'],
    ['03:12:46', 'enc.exe spawned by ██████████'],
    ['03:12:51', 'host isolated · vlan 0'],
    ['03:13:02', 'session of ████████ closed'],
    ['03:13:20', 'credentials revoked · AD'],
    ['03:14:08', 'hash ██████████ MALICIOUS'],
    ['03:16:02', 'forensic image · 64%'],
    ['03:21:37', 'source ███.███.██.██'],
    ['03:22:10', 'ticket INC-2026-1209 · P1'],
    ['03:40:55', 'sweep: 14 hosts, 0 encrypted'],
    ['04:02:12', 'note: ████████ ██████'],
    ['07:24:40', 'restored from backup ✓'],
  ];
  const step = 42;
  const top = 96;
  const cw = 8.4;
  const body = rows
    .map(([time, line], i) => {
      const y = top + i * step;
      const cuts = [...line.matchAll(/█[█ .]*█|█/g)].map((m) => [m.index, m[0].length] as const);
      const bars = cuts
        .map(
          ([from, len]) =>
            `<rect x="${r1(104 + from * cw - 1)}" y="${y - 14}" width="${r1(len * cw + 2)}" height="19" fill="${VOID}"/>`,
        )
        .join('');
      const clean = line.replace(/█/g, ' ');
      return (
        `<text x="22" y="${y}" ${MONO} font-size="13" fill="${STEEL}" fill-opacity=".8">${time}</text>` +
        `<text x="104" y="${y}" ${MONO} font-size="14" fill="${i === 0 || i === 1 ? '#ff8a94' : STEEL_LIGHT}" fill-opacity=".85">${clean.replace(/ /g, '&#160;')}</text>${bars}`
      );
    })
    .join('');
  return svg(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${PANEL}"/><rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" stroke="${INK}" stroke-opacity=".08"/>` +
      `<path d="M0 54H${w}" stroke="${INK}" stroke-opacity=".08"/>` +
      `<circle cx="28" cy="27" r="6" fill="${RED}"/>` +
      `<text x="44" y="33" ${MONO} font-size="16" font-weight="700" fill="${INK}">INC-2026-1209 · LOG</text>` +
      `<text x="${w - 22}" y="33" text-anchor="end" ${MONO} font-size="14" fill="${STEEL}">12 / 214</text>` +
      body +
      `<rect x="22" y="${h - 50}" width="120" height="26" fill="${RED}" fill-opacity=".12" stroke="${RED}" stroke-opacity=".6"/>` +
      `<text x="82" y="${h - 32}" text-anchor="middle" ${MONO} font-size="13" font-weight="700" letter-spacing="1.5" fill="${RED}">REDACTED</text>` +
      `<text x="${w - 22}" y="${h - 32}" text-anchor="end" ${MONO} font-size="13" fill="${STEEL}">SHA-256 ✓</text>`,
  );
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

/** Columns across the width: four of a timeline, four badges, three cards, five steps. */
const COL4 = 414;
const columns4 = [M, M + 438, M + 876, M + 1314];
const BADGE = 420;
const team4 = [M, M + 436, M + 872, M + 1308];
const CARD = 550;
const cards3 = [M, M + 589, M + 1178];
const STEP = 320;
const steps5 = [M, M + 352, M + 704, M + 1056, M + 1408];
/** The two panels of a comparison. */
const SIDE = 844;
const rows3 = [318, 510, 702];
const stats3 = [262, 478, 694];
const lines3 = [520, 638, 756];

const PHASES = [RED, RED, AMBER, GREEN, STEEL_LIGHT] as const;
const PHASE_TOKENS = ['primary', 'primary', 'secondary', 'accent', 'muted'] as const;

function layouts(): Layout[] {
  const textPhoto = atEnd(M + 20, 170, 700, 720);
  const heroRadar = atEnd(-40, 70, RADAR, RADAR);
  const hexagon = { cx: 460, cy: 540, s: 250 };
  const hexW = Math.sqrt(3) * hexagon.s;
  const hexFrame = atEnd(hexagon.cx - hexW / 2, hexagon.cy - hexagon.s, hexW, hexagon.s * 2);
  const nodeX = (start: number) => 1920 - start - 14;
  return [
    {
      id: 'l_magen_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        place('p_kicker', 'caption', at(M + 38, 268, 760, 34), 'caption'),
        place('p_title', 'title', at(M, 316, 860, 244), 'display'),
        place('p_subtitle', 'subtitle', at(M, 584, 820, 140), 'heading'),
        place('p_meta', 'caption', at(M + 38, 848, 760, 34), 'caption'),
      ],
      decorations: [
        glow('d_magen_hero_glow', atEnd(-420, -260, 1700, 1600), 'primary', 0.1),
        hexMesh(
          'd_magen_hero_mesh',
          at(0, 0, 900, 420),
          { x: 900, y: 0, r: 760 },
          { opacity: 0.16 },
        ),
        rect('d_magen_hero_sweep', heroRadar, sweepFill(), {
          geometry: { kind: 'preset', preset: 'ellipse' },
        }),
        drawing('d_magen_hero_radar', heroRadar, radarGrid(), PAINT),
        lettered('d_magen_hero_radar_labels', heroRadar, radarLabels),
        slideFrame('hero'),
        tlp('hero'),
        reticle('d_magen_hero_reticle', at(M, 274, 22, 22)),
        rect('d_magen_hero_meta_rule', at(M, 812, 820, 1), HAIR),
        rect('d_magen_hero_meta_lead', at(M, 811, 120, 3), RED_FILL),
        dot('d_magen_hero_live', at(M + 4, 857, 14, 14), RED_FILL),
        dot('d_magen_hero_live_ring', at(M - 3, 850, 28, 28), NO_FILL, {
          stroke: { color: token('primary', 0.45), width: 2 },
        }),
      ],
    },
    {
      id: 'l_magen_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        place(
          'p_number',
          'number',
          atEnd(hexagon.cx - 190, hexagon.cy - 110, 380, 220),
          'display',
          {
            align: 'center',
            vAlign: 'middle',
          },
        ),
        place('p_kicker', 'caption', at(M + 38, 352, 760, 34), 'caption'),
        place('p_title', 'title', at(M, 400, 900, 250), 'display', { vAlign: 'middle' }),
        place('p_subtitle', 'subtitle', at(M, 676, 860, 140), 'heading'),
      ],
      decorations: [
        glow(
          'd_magen_section_glow',
          atEnd(hexagon.cx - 520, hexagon.cy - 520, 1040, 1040),
          'primary',
          0.12,
        ),
        hexMesh(
          'd_magen_section_mesh',
          atEnd(0, 0, 1060, 1080),
          { x: hexagon.cx, y: hexagon.cy, r: 600 },
          {
            k: 0.62,
            opacity: 0.3,
            cells: [
              [24, 4, 1, RED],
              [5, 13, 1, AMBER],
              [3, 3, 0, STEEL_LIGHT],
              [22, 12, 0, STEEL_LIGHT],
              [9, 15, 0, RED],
            ],
          },
        ),
        drawing(
          'd_magen_section_cross',
          atEnd(0, 0, 1000, 1080),
          svg(
            1000,
            1080,
            `<path d="M0 ${hexagon.cy}H1000M${hexagon.cx} 0V1080" stroke="${STEEL}" stroke-opacity=".22" stroke-dasharray="4 8"/>`,
          ),
          PAINT,
        ),
        drawing(
          'd_magen_section_hexagon',
          hexFrame,
          svg(
            r1(hexW),
            hexagon.s * 2,
            (() => {
              const c = { x: hexW / 2, y: hexagon.s };
              const poly = (s: number) =>
                [-90, -30, 30, 90, 150, 210]
                  .map(
                    (a) =>
                      `${r1(c.x + s * Math.cos((a * Math.PI) / 180))},${r1(c.y + s * Math.sin((a * Math.PI) / 180))}`,
                  )
                  .join(' ');
              return (
                `<polygon points="${poly(hexagon.s - 3)}" fill="${BG}" fill-opacity=".86" stroke="${RED}" stroke-width="5"/>` +
                `<polygon points="${poly(hexagon.s - 26)}" stroke="${STEEL}" stroke-opacity=".35" stroke-width="1.5"/>`
              );
            })(),
          ),
          PAINT,
        ),
        brackets('d_magen_section_lock', atEnd(hexagon.cx - 300, hexagon.cy - 300, 600, 600), {
          color: RED,
          opacity: 0.9,
          arm: 44,
          width: 3,
        }),
        slideFrame('section'),
        tlp('section'),
        reticle('d_magen_section_reticle', at(M, 358, 22, 22)),
      ],
    },
    {
      id: 'l_magen_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head('big_number').placeholders,
        place('p_number', 'number', at(M, 262, 1000, 140), 'display'),
        place('p_label', 'subtitle', at(M, 498, 1000, 53), 'heading'),
        place('p_body', 'body', at(M, 562, 960, 135), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(M + 28, top + 24, 504, 79), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', atEnd(M + 28, top + 106, 504, 68), 'caption'),
        ]),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        ...chrome('big_number'),
        ...head('big_number').decorations,
        lettered('d_magen_big_number_meter', at(M, 420, 1000, 60), (dir) => meter(dir, 1000, 14)),
        rect('d_magen_big_number_rule', at(M, 734, 1000, 1), HAIR),
        lettered(
          'd_magen_big_number_status',
          at(M, 750, 1000, 28),
          word(
            1000,
            28,
            20,
            15,
            `<tspan fill="${GREEN}">●</tspan><tspan fill="${STEEL}">&#160;&#160;SENSORS 412/412&#160;&#160;·&#160;&#160;FEEDS 38&#160;&#160;·&#160;&#160;LAST SYNC 00:00:42</tspan>`,
            'start',
          ),
        ),
        ...stats3.flatMap((top, i) => [
          panel(`d_magen_big_number_card${i + 1}`, atEnd(M, top, 560, 196)),
          brackets(`d_magen_big_number_card${i + 1}_corner`, atEnd(M - 6, top - 6, 572, 208), {
            color: RED,
            opacity: 0.85,
            arm: 18,
            width: 2,
          }),
          dot(
            `d_magen_big_number_led${i + 1}`,
            atEnd(M + 24, top + 26, 12, 12),
            solid(token((['accent', 'secondary', 'primary'] as const)[i]!)),
          ),
          lettered(
            `d_magen_big_number_id${i + 1}`,
            atEnd(M + 44, top + 20, 120, 24),
            word(120, 24, 17, 14, `KPI-0${i + 1}`, 'end', `fill="${STEEL}" letter-spacing="1"`),
          ),
          sparkline(
            `d_magen_big_number_spark${i + 1}`,
            atEnd(M + 24, top + 54, 140, 40),
            7 + i * 13,
          ),
        ]),
        ...foot('big_number').decorations,
      ],
    },
    {
      id: 'l_magen_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(M + 58, 208, 1180, 420), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(M + 58, 676, 1060, 53), 'heading'),
        place('p_caption', 'caption', at(M + 58, 734, 1060, 68), 'caption'),
        ...foot('quote').placeholders,
      ],
      decorations: [
        ...chrome('quote'),
        lettered(
          'd_magen_quote_header',
          at(M, 104, 900, 28),
          word(
            900,
            28,
            20,
            16,
            `<tspan fill="${RED}">● REC</tspan><tspan fill="${STEEL}">&#160;&#160;&#160;TRANSCRIPT&#160;·&#160;SHIFT C&#160;·&#160;CH 04</tspan>`,
            'start',
            'letter-spacing="1"',
          ),
        ),
        rect('d_magen_quote_bar', at(M, 228, 6, 380), RED_FILL),
        rect('d_magen_quote_bar_tail', at(M, 616, 6, 60), STEEL_HAIR),
        waveform('d_magen_quote_wave', at(M + 58, 836, 760, 60)),
        lettered('d_magen_quote_log', atEnd(M, 196, 420, 680), redactedLog(420, 680)),
        brackets('d_magen_quote_log_corner', atEnd(M - 10, 186, 440, 700), {
          opacity: 0.55,
          arm: 22,
        }),
        ...foot('quote').decorations,
      ],
    },
    {
      id: 'l_magen_text',
      name: 'Text',
      archetype: 'text',
      placeholders: [
        place('p_title', 'title', at(M, 136, 1300, 74), 'title'),
        place('p_body', 'body', at(M, 262, WIDTH, 620), 'body'),
      ],
      decorations: [
        ...chrome('text'),
        hexMesh(
          'd_magen_text_mesh',
          atEnd(0, 440, 900, 640),
          { x: 0, y: 640, r: 820 },
          { opacity: 0.18 },
        ),
        drawing('d_magen_text_radar', atEnd(0, 330, 750, 750), radarQuarter(750), PAINT),
        reticle('d_magen_text_reticle', at(54, 162, 22, 22)),
        rect('d_magen_text_margin', at(64, 262, 2, 600), STEEL_HAIR),
        rect('d_magen_text_margin_lead', at(63, 262, 4, 90), RED_FILL),
        lettered('d_magen_text_strip', at(M, 918, WIDTH, 30), (dir) => {
          const w = WIDTH;
          const cells: [string, number][] = [
            ['DISTRIBUTION: BOARD', 0],
            ['REF', 10],
            ['RETENTION 7Y', 0],
            ['OWNER', 14],
          ];
          let x = 0;
          const parts: string[] = [];
          for (const [label, redact] of cells) {
            parts.push(
              `<text x="${x}" y="21" ${MONO} font-size="15" letter-spacing="1" fill="${STEEL}">${label}</text>`,
            );
            x += label.length * 10.2 + 12;
            if (redact) {
              parts.push(
                `<rect x="${r1(x)}" y="6" width="${redact * 10}" height="18" fill="${VOID}"/>`,
              );
              x += redact * 10 + 12;
            }
            parts.push(
              `<text x="${r1(x)}" y="21" ${MONO} font-size="15" fill="${STEEL}" fill-opacity=".5">//</text>`,
            );
            x += 40;
          }
          const run = x - 40;
          const shift = dir === 'rtl' ? w - run : 0;
          return svg(
            w,
            30,
            `<g transform="translate(${r1(shift)} 0)"><rect x="-16" y="0" width="${r1(run + 32)}" height="30" fill="${PANEL}"/>${parts.slice(0, -1).join('')}</g>`,
          );
        }),
      ],
    },
    {
      id: 'l_magen_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head('text_image', 900, 2).placeholders,
        place('p_image', 'image', textPhoto),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(M + 84, top, 860, 53), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(M + 84, top + 56, 860, 128), 'body'),
        ]),
        ...foot('text_image').placeholders,
      ],
      decorations: [
        ...chrome('text_image'),
        ...head('text_image', 900, 2).decorations,
        rect('d_magen_text_image_mat', atEnd(M + 8, 158, 724, 744), solid(token('surface', 0.6))),
        brackets('d_magen_text_image_sight', atEnd(M, 150, 740, 760), {
          color: RED,
          opacity: 0.9,
          arm: 34,
          width: 3,
        }),
        lettered(
          'd_magen_text_image_feed',
          atEnd(M + 20, 120, 700, 24),
          svg(
            700,
            24,
            `<text x="0" y="17" ${MONO} font-size="15" letter-spacing="1" fill="${STEEL}">FEED-01 · SOC CONSOLE · SHIFT C</text>` +
              `<text x="700" y="17" text-anchor="end" ${MONO} font-size="15" font-weight="700" letter-spacing="1" fill="${RED}">● LIVE</text>`,
          ),
        ),
        ...rows3.flatMap((top, i) => [
          hexBadge(`d_magen_text_image_badge${i + 1}`, at(M, top - 2, 54, 60), `0${i + 1}`),
          ...(i < 2
            ? [rect(`d_magen_text_image_link${i + 1}`, at(M + 26, top + 66, 2, 128), STEEL_HAIR)]
            : []),
        ]),
        ...foot('text_image').decorations,
      ],
    },
    {
      id: 'l_magen_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture fills the wall screen; the words are on the console under it, because
        // nothing of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 712)),
        place('p_kicker', 'caption', at(M + 38, 762, 900, 34), 'caption'),
        place('p_title', 'title', at(M, 808, 1060, 148), 'title'),
        place('p_body', 'body', atEnd(M, 792, 600, 180), 'body'),
      ],
      decorations: [
        rect('d_magen_full_image_screen', atEnd(0, 0, 1920, 712), solid({ value: '#06080a' })),
        slideFrame('full_image', 'bottom'),
        rect('d_magen_full_image_edge', at(0, 712, 1920, 2), solid(token('primary', 0.5))),
        rect('d_magen_full_image_edge_lead', at(M, 711, 320, 4), RED_FILL),
        ruler('d_magen_full_image_ruler', at(M, 728, WIDTH, 12), 0),
        reticle('d_magen_full_image_reticle', at(M, 768, 22, 22)),
        rect('d_magen_full_image_divider', atEnd(M + 640, 796, 1, 170), HAIR),
      ],
    },
    {
      id: 'l_magen_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head('cards').placeholders,
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}_note`, 'caption', at(start + 104, 284, CARD - 136, 68), 'caption', {
            vAlign: 'middle',
          }),
          place(`p_card${i + 1}`, 'subtitle', at(start + 38, 372, CARD - 70, 106), 'heading'),
          place(`p_card${i + 1}_body`, 'body', at(start + 38, 486, CARD - 70, 210), 'body'),
        ]),
        place('p_takeaway', 'body', at(M + 76, 800, 1620, 90), 'body', { vAlign: 'middle' }),
        ...foot('cards').placeholders,
      ],
      decorations: [
        ...chrome('cards'),
        ...head('cards').decorations,
        ...cards3.flatMap((start, i) => {
          const color = [RED, AMBER, STEEL_LIGHT][i]!;
          const lit = [9, 7, 5][i]!;
          const cells = Array.from(
            { length: 10 },
            (_, k) =>
              `<rect x="${294 - (k + 1) * 24 - k * 6}" y="0" width="24" height="10" fill="${k < lit ? color : STEEL}" fill-opacity="${k < lit ? 0.9 : 0.18}"/>`,
          ).join('');
          return [
            panel(`d_magen_cards_card${i + 1}`, at(start, 262, CARD, 500)),
            hexMesh(
              `d_magen_cards_card${i + 1}_mesh`,
              atEnd(1920 - start - CARD + 1, 500, 330, 200),
              { x: 0, y: 200, r: 340 },
              {
                k: 0.48,
                opacity: 0.3,
              },
            ),
            rect(
              `d_magen_cards_card${i + 1}_top`,
              at(start, 262, 180, 3),
              solid(i === 2 ? token('muted') : token(i ? 'secondary' : 'primary')),
            ),
            brackets(`d_magen_cards_card${i + 1}_corner`, at(start - 6, 256, CARD + 12, 512), {
              opacity: 0.5,
              arm: 16,
            }),
            hexBadge(
              `d_magen_cards_card${i + 1}_node`,
              at(start + 38, 288, 52, 58),
              `0${i + 1}`,
              color,
            ),
            rect(`d_magen_cards_card${i + 1}_rule`, at(start + 38, 708, CARD - 70, 1), HAIR),
            drawing(
              `d_magen_cards_card${i + 1}_level`,
              at(start + 38, 728, 294, 10),
              svg(294, 10, cells),
              PAINT,
            ),
            lettered(
              `d_magen_cards_card${i + 1}_id`,
              at(start + CARD - 192, 722, 160, 22),
              word(
                160,
                22,
                16,
                14,
                `THREAT-0${i + 1}`,
                'end',
                `fill="${STEEL}" letter-spacing="1"`,
              ),
            ),
          ];
        }),
        rect('d_magen_cards_alert', at(M, 790, WIDTH, 110), solid(token('secondary', 0.08))),
        rect('d_magen_cards_alert_edge', at(M, 790, 4, 110), solid(token('secondary'))),
        warning('d_magen_cards_alert_sign', at(M + 22, 828, 38, 34)),
        ...foot('cards').decorations,
      ],
    },
    {
      id: 'l_magen_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head('timeline').placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 272, COL4, 79), 'title', {
            vAlign: 'bottom',
          }),
          place(`p_what${i + 1}`, 'subtitle', at(start, 540, COL4 - 30, 106), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start, 652, COL4 - 30, 170), 'caption'),
        ]),
        place('p_note', 'caption', at(M, 852, WIDTH, 68), 'caption'),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        ...chrome('timeline'),
        ...head('timeline').decorations,
        drawing(
          'd_magen_timeline_trace',
          at(M, 368, WIDTH, 148),
          trace(
            WIDTH,
            148,
            columns4.map((start) => nodeX(start) - M),
          ),
          PAINT,
        ),
        dot('d_magen_timeline_alarm', at(columns4[0]! - 8, 420, 44, 44), NO_FILL, {
          stroke: { color: token('primary', 0.5), width: 2 },
        }),
        ...columns4.flatMap((start, i) => [
          {
            ...rect(
              `d_magen_timeline_node${i + 1}`,
              at(start + 4, 432, 20, 20),
              solid(token((['primary', 'secondary', 'secondary', 'accent'] as const)[i]!)),
              {
                effects: { radius: 2 },
              },
            ),
            rotation: 45,
          },
          rect(`d_magen_timeline_drop${i + 1}`, at(start + 13, 466, 2, 58), STEEL_HAIR),
        ]),
        ...foot('timeline').decorations,
      ],
    },
    {
      id: 'l_magen_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head('process').placeholders,
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start, 452, STEP, 106), 'heading'),
          place(`p_step${i + 1}_body`, 'caption', at(start, 564, STEP, 136), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start, 336, STEP, 79), 'title', {
            color: token(PHASE_TOKENS[i]!),
          }),
        ]),
        place('p_summary', 'body', at(M + 76, 801, 1620, 90), 'body', { vAlign: 'middle' }),
        ...foot('process').placeholders,
      ],
      decorations: [
        ...chrome('process'),
        ...head('process').decorations,
        ...steps5.flatMap((start, i) => {
          const color = PHASES[i]!;
          const w = STEP;
          const h = 54;
          const pts =
            i === 0
              ? [
                  [18, 1],
                  [w - 1, 1],
                  [w - 1, h - 1],
                  [18, h - 1],
                  [1, h / 2],
                ]
              : [
                  [18, 1],
                  [w - 1, 1],
                  [w - 19, h / 2],
                  [w - 1, h - 1],
                  [18, h - 1],
                  [1, h / 2],
                ];
          return [
            drawing(
              `d_magen_process_phase${i + 1}`,
              at(start, 262, w, h),
              svg(
                w,
                h,
                `<polygon points="${pts.map((p) => p.join(',')).join(' ')}" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-opacity=".75" stroke-width="2"/>`,
              ),
              PAINT,
            ),
            lettered(
              `d_magen_process_n${i + 1}`,
              at(start + 26, 274, 70, 30),
              word(70, 30, 22, 18, `0${i + 1}`, 'start', `font-weight="700" fill="${color}"`),
            ),
            rect(`d_magen_process_rule${i + 1}`, at(start, 432, STEP, 1), HAIR),
            rect(
              `d_magen_process_rule${i + 1}_lead`,
              at(start, 431, 48, 3),
              solid(token(PHASE_TOKENS[i]!)),
            ),
          ];
        }),
        drawing(
          'd_magen_process_flow',
          at(M, 728, WIDTH, 24),
          svg(
            WIDTH,
            24,
            `<path d="M0 12H${WIDTH}" stroke="${STEEL}" stroke-opacity=".35" stroke-dasharray="2 8"/>` +
              steps5
                .map((start, i) => {
                  const x = WIDTH - (start - M) - 6;
                  return `<rect x="${x - 6}" y="6" width="12" height="12" transform="rotate(45 ${x} 12)" fill="${PHASES[i]}"/>`;
                })
                .join('') +
              `<path d="M14 4 4 12l10 8" stroke="${STEEL}" stroke-opacity=".7" stroke-width="2"/>`,
          ),
          PAINT,
        ),
        panel('d_magen_process_bar', at(M, 790, WIDTH, 110)),
        rect('d_magen_process_bar_edge', at(M, 790, 4, 110), RED_FILL),
        chevron('d_magen_process_prompt', at(M + 28, 828, 22, 34)),
        ...foot('process').decorations,
      ],
    },
    {
      id: 'l_magen_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head('comparison').placeholders,
        ...(
          [
            ['before', M],
            ['after', M + SIDE + 40],
          ] as const
        ).flatMap(([side, start]) => [
          place(`p_${side}_tag`, 'caption', at(start + 76, 288, SIDE - 114, 34), 'caption'),
          place(`p_${side}`, 'subtitle', at(start + 38, 342, SIDE - 76, 106), 'heading'),
          place(`p_${side}_body`, 'body', at(start + 38, 456, SIDE - 76, 400), 'body'),
        ]),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        ...chrome('comparison'),
        ...head('comparison').decorations,
        ...(
          [
            ['before', M, RED, 'primary', true],
            ['after', M + SIDE + 40, GREEN, 'accent', false],
          ] as const
        ).flatMap(([side, start, color, tone, open]) => [
          panel(`d_magen_comparison_${side}`, at(start, 262, SIDE, 640)),
          rect(`d_magen_comparison_${side}_top`, at(start, 262, SIDE, 3), solid(token(tone))),
          rect(
            `d_magen_comparison_${side}_head`,
            at(start, 265, SIDE, 68),
            solid(token(tone, 0.07)),
          ),
          padlock(`d_magen_comparison_${side}_lock`, at(start + 26, 282, 32, 36), open, color),
          drawing(
            `d_magen_comparison_${side}_net`,
            atEnd(1920 - start - SIDE + 28, 706, 340, 180),
            network(open),
            PAINT,
          ),
        ]),
        dot('d_magen_comparison_way', at(M + SIDE + 20 - 30, 556, 60, 60), solid(token('bg')), {
          stroke: { color: token('muted', 0.5), width: 2 },
        }),
        chevron('d_magen_comparison_way_arrow', at(M + SIDE + 20 - 8, 572, 18, 28), STEEL_LIGHT),
        ...foot('comparison').decorations,
      ],
    },
    {
      id: 'l_magen_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head('chart').placeholders,
        place('p_chart', 'chart', at(M + 30, 336, 1060, 540)),
        place('p_stat1', 'number', atEnd(M, 262, 520, 130), 'display', { color: token('primary') }),
        place('p_stat1_body', 'body', atEnd(M, 396, 520, 128), 'body'),
        place('p_stat2', 'number', atEnd(M, 560, 520, 130), 'display'),
        place('p_stat2_body', 'body', atEnd(M, 694, 520, 92), 'body'),
        place('p_source', 'caption', atEnd(M, 820, 520, 68), 'caption'),
        ...foot('chart').placeholders,
      ],
      decorations: [
        ...chrome('chart'),
        ...head('chart').decorations,
        panel('d_magen_chart_panel', at(M, 262, 1120, 640)),
        drawing(
          'd_magen_chart_scan',
          at(M, 318, 1120, 584),
          svg(
            1120,
            584,
            `<defs><pattern id="sl" width="8" height="4" patternUnits="userSpaceOnUse"><rect width="8" height="1" fill="${INK}"/></pattern></defs><rect width="1120" height="584" fill="url(#sl)" opacity=".035"/>`,
          ),
          PAINT,
        ),
        rect('d_magen_chart_panel_rule', at(M, 318, 1120, 1), HAIR),
        lettered('d_magen_chart_panel_head', at(M + 24, 276, 1072, 28), (dir) => {
          const live = `<tspan fill="${RED}">●</tspan><tspan fill="${STEEL}">&#160;&#160;LIVE&#160;FEED&#160;·&#160;SIEM</tspan>`;
          const toggles = ['1D', '7D', '30D', '12M']
            .map((t, i) => {
              const x = i * 58;
              const on = i === 3;
              return `<rect x="${x}" y="2" width="50" height="24" fill="${on ? RED : STEEL}" fill-opacity="${on ? 0.16 : 0.06}" stroke="${on ? RED : STEEL}" stroke-opacity="${on ? 0.7 : 0.25}"/><text x="${x + 25}" y="19" text-anchor="middle" ${MONO} font-size="13" font-weight="${on ? 700 : 500}" fill="${on ? RED : STEEL}">${t}</text>`;
            })
            .join('');
          const tw = 4 * 58 - 8;
          return dir === 'rtl'
            ? svg(
                1072,
                28,
                `<text x="1072" y="20" text-anchor="end" ${MONO} font-size="15" letter-spacing="1">${live}</text>${toggles}`,
              )
            : svg(
                1072,
                28,
                `<text x="0" y="20" ${MONO} font-size="15" letter-spacing="1">${live}</text><g transform="translate(${1072 - tw} 0)">${toggles}</g>`,
              );
        }),
        brackets('d_magen_chart_stats_sight', atEnd(M - 22, 250, 564, 652), {
          opacity: 0.4,
          arm: 22,
        }),
        rect('d_magen_chart_divider', atEnd(M, 540, 520, 1), HAIR),
        rect('d_magen_chart_divider_lead', atEnd(M + 520 - 64, 539, 64, 3), STEEL_HAIR),
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_magen_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head('table', 1240).placeholders,
        place('p_table', 'table', at(M, 250, WIDTH, 616)),
        place('p_note', 'caption', at(M, 882, WIDTH, 34), 'caption'),
        ...foot('table').placeholders,
      ],
      decorations: [
        ...chrome('table'),
        ...head('table', 1240).decorations,
        brackets('d_magen_table_sight', at(M - 18, 232, WIDTH + 36, 642), {
          color: RED,
          opacity: 0.8,
          arm: 26,
          width: 2,
        }),
        lettered('d_magen_table_key', atEnd(M, 168, 440, 30), (dir) => {
          const keys: [string, string][] = [
            ['CRIT', RED],
            ['HIGH', AMBER],
            ['MED', STEEL_LIGHT],
            ['LOW', STEEL],
          ];
          const w = 440;
          const step = 106;
          const parts = keys
            .map(([k, c], i) => {
              const x = dir === 'rtl' ? w - (i + 1) * step + 8 : i * step;
              return `<rect x="${x}" y="3" width="98" height="24" fill="${c}" fill-opacity=".12" stroke="${c}" stroke-opacity=".6"/><rect x="${x + 10}" y="11" width="8" height="8" fill="${c}"/><text x="${x + 58}" y="20" text-anchor="middle" ${MONO} font-size="13" font-weight="700" letter-spacing="1" fill="${c}">${k}</text>`;
            })
            .join('');
          return svg(w, 30, parts);
        }),
        ...foot('table').decorations,
      ],
    },
    {
      id: 'l_magen_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head('team').placeholders,
        ...team4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start + 10, 290, BADGE - 20, 372)),
          place(`p_person${i + 1}`, 'subtitle', at(start + 10, 680, BADGE - 20, 53), 'heading'),
          place(
            `p_person${i + 1}_role`,
            'caption',
            at(start + 10, 734, BADGE - 20, 34),
            'caption',
            {
              color: token('primary'),
            },
          ),
          place(`p_person${i + 1}_body`, 'body', at(start + 10, 772, BADGE - 20, 102), 'caption'),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: [
        ...chrome('team'),
        ...head('team').decorations,
        ...team4.flatMap((start, i) => [
          panel(`d_magen_team_badge${i + 1}`, at(start, 238, BADGE, 666)),
          rect(
            `d_magen_team_badge${i + 1}_slot`,
            at(start + BADGE / 2 - 30, 252, 60, 12),
            solid(token('bg')),
            {
              effects: { radius: 6 },
              stroke: { color: token('muted', 0.4), width: 1 },
            },
          ),
          lettered(
            `d_magen_team_badge${i + 1}_id`,
            at(start + 10, 250, 150, 22),
            word(
              150,
              22,
              16,
              13,
              `SOC-0${i + 1} · L${4 - Math.min(i, 2)}`,
              'start',
              `fill="${STEEL}" letter-spacing="1"`,
            ),
          ),
          dot(
            `d_magen_team_badge${i + 1}_led`,
            at(start + BADGE - 36, 256, 10, 10),
            solid(token('accent')),
          ),
          brackets(`d_magen_team_photo${i + 1}_sight`, at(start + 2, 282, BADGE - 4, 388), {
            color: RED,
            opacity: 0.85,
            arm: 20,
            width: 2,
          }),
          barcode(
            `d_magen_team_badge${i + 1}_code`,
            at(start + BADGE - 130, 882, 120, 12),
            5 + i * 7,
          ),
        ]),
        ...foot('team').decorations,
      ],
    },
    {
      id: 'l_magen_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(M + 38, 180, 760, 34), 'caption'),
        place('p_title', 'title', at(M, 228, 860, 250), 'display'),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(M + 64, top, 760, 92), 'body', { vAlign: 'middle' }),
        ),
        place('p_contact', 'caption', at(M + 38, 902, 820, 34), 'caption'),
      ],
      decorations: [
        glow('d_magen_closing_glow', atEnd(-80, -40, 1200, 1160), 'primary', 0.13),
        drawing(
          'd_magen_closing_rings',
          atEnd(-60, 0, 1160, 1080),
          svg(
            1160,
            1080,
            [200, 330, 460, 590, 720]
              .map(
                (r, i) =>
                  `<circle cx="580" cy="453" r="${r}" stroke="${STEEL}" stroke-opacity="${0.24 - i * 0.04}" ${i === 1 ? 'stroke-dasharray="3 7"' : ''}/>`,
              )
              .join('') +
              `<path d="M580 0V1080M0 453H1160" stroke="${STEEL}" stroke-opacity=".1"/>`,
          ),
          PAINT,
        ),
        drawing(
          'd_magen_closing_shield',
          atEnd(300, 200, 440, 506),
          svg(
            440,
            506,
            `<defs><pattern id="cs" width="56" height="100" patternUnits="userSpaceOnUse" patternTransform="scale(.5)"><path d="M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100" stroke="${RED}" stroke-width="2"/></pattern>` +
              `<clipPath id="cc"><path transform="scale(11)" d="${SHIELD_PATH}"/></clipPath>` +
              `<linearGradient id="cf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${RED}" stop-opacity=".22"/><stop offset="1" stop-color="${RED}" stop-opacity=".02"/></linearGradient></defs>` +
              `<g clip-path="url(#cc)"><rect width="440" height="506" fill="${BG}"/><rect width="440" height="506" fill="url(#cf)"/><rect width="440" height="506" fill="url(#cs)" opacity=".3"/></g>` +
              `<path transform="scale(11)" d="${SHIELD_PATH}" stroke="${RED}" stroke-width=".55"/>` +
              `<path transform="translate(40 46) scale(9)" d="${SHIELD_PATH}" stroke="${RED}" stroke-opacity=".4" stroke-width=".22"/>` +
              `<g transform="translate(102 69) scale(5.9)">${KEYHOLE(RED)}</g><circle cx="220" cy="215" r="74" stroke="${RED}" stroke-opacity=".5" stroke-width="2"/><circle cx="220" cy="215" r="92" stroke="${RED}" stroke-opacity=".2" stroke-dasharray="4 6"/>`,
          ),
          PAINT,
        ),
        brackets('d_magen_closing_lock', atEnd(240, 160, 560, 586), {
          color: STEEL,
          opacity: 0.55,
          arm: 36,
        }),
        lettered(
          'd_magen_closing_status',
          atEnd(240, 772, 560, 30),
          svg(
            560,
            30,
            `<text x="280" y="21" text-anchor="middle" ${MONO} font-size="16" font-weight="700" letter-spacing="3" fill="${GREEN}">● SHIELD ACTIVE</text>`,
          ),
        ),
        slideFrame('closing'),
        tlp('closing', 'CLEAR'),
        reticle('d_magen_closing_reticle', at(M, 186, 22, 22)),
        ...lines3.flatMap((top, i) => [
          chevron(`d_magen_closing_mark${i + 1}`, at(M + 14, top + 29, 20, 34)),
          rect(`d_magen_closing_rule${i + 1}`, at(M, top + 104, 840, 1), HAIR),
        ]),
        drawing(
          'd_magen_closing_mail',
          at(M, 906, 26, 26),
          svg(
            26,
            26,
            `<path d="M13 2 23 5.6v7.2c0 5.6-4 9.6-10 11.2C7 22.4 3 18.4 3 12.8V5.6z" stroke="${RED}" stroke-width="2.2"/><path d="M8.6 12.8l3 3 5.6-6" stroke="${RED}" stroke-width="2.2"/>`,
          ),
          PAINT,
        ),
      ],
    },
  ];
}

/** The sweep of the radar: a red trail behind its leading edge, clockwise. */
function sweepFill(): Fill {
  return {
    kind: 'conic',
    angle: 0,
    stops: [
      { color: token('primary', 0), at: 0 },
      { color: token('primary', 0.04), at: 0.06 },
      { color: token('primary', 0.3), at: 0.125 },
      { color: token('primary', 0), at: 0.1251 },
      { color: token('primary', 0), at: 1 },
    ],
  };
}

/**
 * The layouts of a left-to-right deck: the mirrors, with every drawing that holds letters turned
 * back so it reads.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  return drawn.map((layout) => {
    const mirrored = mirrorLayout(layout);
    return {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) => {
        if (!READABLE.has(decoration.id) || decoration.type !== 'svg') return decoration;
        const { flipH: _flipH, ...rest } = decoration;
        const ltr = READABLE.get(decoration.id);
        return ltr ? { ...rest, markup: ltr } : rest;
      }),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The sample: the annual security review of a bank's SOC, presented to the board in January 2027

const pictures = {
  magenTriage: picture('magenTriage'),
  magenThreatmap: picture('magenThreatmap'),
  magenTeam1: picture('magenTeam1'),
  magenTeam2: picture('magenTeam2'),
  magenTeam3: picture('magenTeam3'),
  magenTeam4: picture('magenTeam4'),
};

const FOOTER_HE = text('בנק תבור · סקירת אבטחה שנתית 2026');
const FOOTER_EN = text('Tavor Bank · Annual Security Review 2026');
const TABLE_COLS = [404, 300, 300, 300, 424];
const TABLE_ROW = 80;
/** Attacks blocked, in thousands a month: 4.22 million in the year. */
const BLOCKED = [281, 296, 322, 305, 341, 330, 356, 372, 349, 388, 421, 459];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_magen_hero',
    name: 'פתיחה',
    content: {
      caption: [text('מרכז ניטור האבטחה · בנק תבור'), text('ישיבת הדירקטוריון · 18.01.2027')],
      title: text('שנה בלי', 'פריצה אחת'),
      subtitle: text('סקירת האבטחה השנתית: מה ניסה להיכנס ב-2026, ומה עצר אותו'),
    },
  },
  {
    layout: 'l_magen_section',
    name: 'השנה במספרים',
    content: {
      number: text('01'),
      caption: text('חלק ראשון'),
      title: text('השנה במספרים'),
      subtitle: text('מה ניסה להיכנס, ומה עצר אותו בדרך.'),
    },
  },
  {
    layout: 'l_magen_text',
    name: 'על מה נדבר',
    content: {
      title: text('על מה נדבר היום'),
      body: {
        paragraphs: [
          para('שלושה דברים שהדירקטוריון צריך לדעת על 2026:'),
          ...bullets(
            'מה ניסה לתקוף אותנו, ואיך זה נבלם',
            'מה למדנו מתרגיל הכופרה בדצמבר',
            'איפה אנחנו עדיין חשופים',
            'על מה כדאי להשקיע את תקציב 2027',
          ).paragraphs,
        ],
      },
    },
  },
  {
    layout: 'l_magen_big_number',
    name: 'מה נבלם',
    content: {
      caption: [
        text('השנה במספרים'),
        text('פריצות שהגיעו למידע של לקוחות'),
        text('זמן ממוצע לזיהוי אירוע'),
        text('זמן ממוצע לבלימת אירוע'),
      ],
      title: text('מה נעצר בשער'),
      number: [text('4.2M'), text('0'), text('42 שנ׳'), text('11 דק׳')],
      subtitle: text('ניסיונות תקיפה נחסמו ב-2026'),
      body: text('כ-11,500 ביום. רובם נחסמו אוטומטית, לפני שאדם ראה אותם.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_magen_cards',
    name: 'שלושה איומים',
    content: {
      caption: [text('האיומים'), text('MITRE T1566'), text('MITRE T1486'), text('MITRE T1498')],
      title: text('שלושת האיומים של השנה'),
      subtitle: [text('דיוג ממוקד'), text('כופרה'), text('מניעת שירות')],
      body: [
        text('1.9 מיליון הודעות נחסמו. 14 עובדים לחצו, ואף חשבון לא נפרץ.'),
        text('שלושה ניסיונות אמיתיים נעצרו לפני שהספיקו להצפין.'),
        text('שיא של 380 גיגה-ביט לשנייה. האפליקציה לא נפלה לרגע.'),
        text('הדיוג נשאר הדרך הראשונה פנימה, ולכן 2027 מתחילה באנשים.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_magen_text_image',
    name: 'מסך הניטור',
    content: {
      caption: text('מאחורי המסך'),
      title: text('מסך אחד,', 'לכל ההתראות'),
      image: { assetId: pictures.magenTriage.id },
      subtitle: [text('ניטור 24/7'), text('תעדוף אוטומטי'), text('בידוד בלחיצה')],
      body: [
        text('שש משמרות, 412 חיישנים, ואנליסט על כל התראה קריטית.'),
        text('97% מההתראות נסגרות לבד. האנליסטים מטפלים ב-3% שחשובים.'),
        text('מחשב חשוד מנותק מהרשת תוך שניות, בלי לחכות לאישור.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_magen_timeline',
    name: 'תרגיל הכופרה',
    content: {
      caption: [
        text('תרגיל כופרה · 9 בדצמבר 2026'),
        text('היעד היה 24 שעות לשחזור, וסיימנו כמעט 20 שעות לפניו.'),
      ],
      title: text('מההתראה לשחזור ב-4:12 שעות'),
      number: [text('T+00:00'), text('T+00:04'), text('T+00:38'), text('T+04:12')],
      subtitle: [text('זיהוי'), text('בידוד'), text('ניקוי'), text('שחזור')],
      body: [
        text('המערכת זיהתה הצפנה חשודה בתחנה במחלקת הכספים.'),
        text('המחשב נותק, והסיסמאות של המשתמש הוחלפו.'),
        text('הנוזקה נמחקה מכל 14 המחשבים.'),
        text('השירות חזר מגיבוי נקי ומאומת.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_magen_process',
    name: 'תוכנית התגובה',
    content: {
      caption: [
        text('תוכנית התגובה'),
        text('התראה מכל חיישן'),
        text('ניתוק מהרשת'),
        text('הסרה ותיקון'),
        text('חזרה מגיבוי נקי'),
        text('תחקיר תוך שבוע'),
      ],
      title: text('חמישה שלבים, בכל אירוע'),
      subtitle: [text('זיהוי'), text('בלימה'), text('ניקוי'), text('התאוששות'), text('לקחים')],
      number: [text('1 דק׳'), text('15 דק׳'), text('4 שע׳'), text('24 שע׳'), text('7 ימים')],
      body: text('לכל שלב יש זמן יעד, והצוות מתאמן עליו בכל רבעון.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_magen_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('לפני ואחרי'), text('ינואר 2026'), text('דצמבר 2026')],
      title: text('משטח התקיפה, שנה אחרי'),
      subtitle: [text('1,140 שירותים חשופים'), text('86 שירותים חשופים')],
      body: [
        bullets(
          'חשבונות ניהול בלי אימות דו-שלבי',
          'שרתים ישנים בלי עדכוני אבטחה',
          'ספקים עם גישה קבועה לרשת',
        ),
        bullets(
          'אימות דו-שלבי לכל 3,200 העובדים',
          'כל השרתים מתעדכנים תוך 72 שעות',
          'ספקים נכנסים לפי בקשה, לזמן קצוב',
        ),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_magen_chart',
    name: 'מה נחסם',
    content: {
      caption: [text('מה נחסם'), text('נתוני ה-SIEM של הבנק, ינואר עד דצמבר 2026.')],
      title: text('ניסיונות תקיפה שנחסמו, בכל חודש'),
      number: [text('+38%'), text('99.9%')],
      body: [
        text('יותר ניסיונות תקיפה מאשר ב-2025, רובם הודעות דיוג ובוטים.'),
        text('נחסמו אוטומטית, בלי שאדם נגע בהם.'),
      ],
      footer: FOOTER_HE,
    },
    chart: {
      chartType: 'column',
      title: 'אלפי ניסיונות בחודש',
      data: {
        categories: [
          'ינו׳',
          'פבר׳',
          'מרץ',
          'אפר׳',
          'מאי',
          'יוני',
          'יולי',
          'אוג׳',
          'ספט׳',
          'אוק׳',
          'נוב׳',
          'דצמ׳',
        ],
        series: [{ name: 'אלפים', values: BLOCKED }],
      },
    },
  },
  {
    layout: 'l_magen_table',
    name: 'פגיעויות',
    content: {
      caption: [text('פגיעויות'), text('סריקות חודשיות ובדיקת חדירות חיצונית, נובמבר 2026.')],
      title: text('מה מצאנו, ומה כבר תוקן'),
      footer: FOOTER_HE,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['חומרה', 'נמצאו', 'תוקנו', 'פתוחות', 'זמן תיקון ממוצע'],
        ['קריטית', '12', '12', '0', 'יומיים'],
        ['גבוהה', '87', '84', '3', '9 ימים'],
        ['בינונית', '412', '371', '41', '26 ימים'],
        ['נמוכה', '1,036', '802', '234', '61 ימים'],
        ['סך הכול', '1,547', '1,269', '278', '—'],
      ],
    },
  },
  {
    layout: 'l_magen_full_image',
    name: 'מפת האיומים',
    content: {
      image: { assetId: pictures.magenThreatmap.id },
      caption: text('מפת האיומים'),
      title: text('11,500 ניסיונות ביום,', 'אף אחד לא עבר'),
      body: text('התקיפות מגיעות מ-140 מדינות, וכולן נעצרות באותה חומה.'),
    },
  },
  {
    layout: 'l_magen_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'בשלוש בלילה המערכת בודדה את המחשב לפני שהוצפן קובץ אחד. כשהגעתי למסך, נשאר לי רק לכתוב את הדוח.',
      ),
      attribution: text('תמר גולן'),
      caption: text('אנליסטית בכירה, משמרת לילה'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_magen_team',
    name: 'הצוות',
    content: {
      caption: [
        text('הצוות'),
        text('CISO'),
        text('ראש ה-SOC'),
        text('מודיעין איומים'),
        text('תגובה לאירועים'),
      ],
      title: text('מי שומר על הבנק בלילה'),
      image: [
        { assetId: pictures.magenTeam1.id },
        { assetId: pictures.magenTeam2.id },
        { assetId: pictures.magenTeam3.id },
        { assetId: pictures.magenTeam4.id },
      ],
      subtitle: [text('מיכל אדלר'), text('רון ברק'), text('יואב שטרן'), text('נועה שחר')],
      body: [
        text('מובילה את אסטרטגיית האבטחה ומדווחת לדירקטוריון.'),
        text('מנהל 28 אנליסטים בשש משמרות.'),
        text('עוקב אחרי הקבוצות שתוקפות בנקים.'),
        text('הובילה את תרגיל הכופרה בדצמבר.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_magen_closing',
    name: 'סיום',
    content: {
      caption: [text('מה הלאה'), text('soc@tavor-bank.example · שלוחה 4400')],
      title: text('מוכנים', 'ל-2027'),
      body: [
        text('הדרכת דיוג חודשית לכל העובדים'),
        text('גיבוי מנותק לכל מערכות הליבה'),
        text('תרגיל כופרה בכל רבעון, כולל ההנהלה'),
      ],
    },
  },
];

const sampleEn: SampleSlide[] = [
  {
    layout: 'l_magen_hero',
    name: 'Opening',
    content: {
      caption: [
        text('Security Operations Center · Tavor Bank'),
        text('Board meeting · 18 January 2027'),
      ],
      title: text('Not one', 'breach'),
      subtitle: text('Our 2026 security review: what tried to get in, and what stopped it'),
    },
  },
  {
    layout: 'l_magen_section',
    name: 'The numbers',
    content: {
      number: text('01'),
      caption: text('Part one'),
      title: text('The numbers'),
      subtitle: text('What tried to get in, and what stopped it.'),
    },
  },
  {
    layout: 'l_magen_text',
    name: 'Today',
    content: {
      title: text('What we will cover today'),
      body: {
        paragraphs: [
          para('Three things the board should know about 2026:'),
          ...bullets(
            'What attacked us, and how it was stopped',
            'What the December ransomware drill taught us',
            'Where we are still exposed',
            'Where the 2027 budget should go',
          ).paragraphs,
        ],
      },
    },
  },
  {
    layout: 'l_magen_big_number',
    name: 'What was stopped',
    content: {
      caption: [
        text('The year in numbers'),
        text('Breaches that reached customer data'),
        text('Average time to detect'),
        text('Average time to contain'),
      ],
      title: text('Stopped at the gate'),
      number: [text('4.2M'), text('0'), text('42 s'), text('11 min')],
      subtitle: text('Attack attempts blocked in 2026'),
      body: text('About 11,500 a day, most of them stopped automatically before anyone saw them.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_magen_cards',
    name: 'Three threats',
    content: {
      caption: [text('The threats'), text('MITRE T1566'), text('MITRE T1486'), text('MITRE T1498')],
      title: text('The year’s three threats'),
      subtitle: [text('Targeted phishing'), text('Ransomware'), text('Denial of service')],
      body: [
        text('1.9M emails blocked; 14 staff clicked, and no account fell.'),
        text('Three real attempts stopped before encryption.'),
        text('A 380 Gbps peak. The app stayed up throughout.'),
        text('Phishing is still the way in, so 2027 starts with people.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_magen_text_image',
    name: 'The console',
    content: {
      caption: text('Behind the screen'),
      title: text('One screen', 'for every alert'),
      image: { assetId: pictures.magenTriage.id },
      subtitle: [text('Watching 24/7'), text('Automatic triage'), text('Isolation in one click')],
      body: [
        text('Six shifts, 412 sensors, and an analyst on every critical alert.'),
        text('97% of alerts close on their own, so analysts can focus on the 3% that matter.'),
        text('A suspect machine is cut off within seconds, no sign-off needed.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_magen_timeline',
    name: 'The ransomware drill',
    content: {
      caption: [
        text('Ransomware drill · 9 December 2026'),
        text('Target: 24 hours to recover. We beat it by almost 20.'),
      ],
      title: text('Alert to recovery: 4 h 12 min'),
      number: [text('T+00:00'), text('T+00:04'), text('T+00:38'), text('T+04:12')],
      subtitle: [text('Detect'), text('Isolate'), text('Eradicate'), text('Recover')],
      body: [
        text('EDR flags encryption on a PC.'),
        text('The PC is cut off the network.'),
        text('Payload wiped from 14 PCs.'),
        text('Back from a verified backup.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_magen_process',
    name: 'The playbook',
    content: {
      caption: [
        text('The response playbook'),
        text('Any sensor raises it'),
        text('Off the network'),
        text('Remove and patch'),
        text('From a clean backup'),
        text('A review in a week'),
      ],
      title: text('Five steps, every incident'),
      subtitle: [
        text('Detect'),
        text('Contain'),
        text('Eradicate'),
        text('Recover'),
        text('Learn'),
      ],
      number: [text('1 min'), text('15 min'), text('4 h'), text('24 h'), text('7 days')],
      body: text('Each step has a target time, drilled every quarter.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_magen_comparison',
    name: 'Before and after',
    content: {
      caption: [text('Before and after'), text('January 2026'), text('December 2026')],
      title: text('The attack surface, a year later'),
      subtitle: [text('1,140 exposed services'), text('86 exposed services')],
      body: [
        bullets(
          'Admin accounts without two-factor sign-in',
          'Old servers with no security updates',
          'Suppliers with standing access',
        ),
        bullets(
          'Two-factor sign-in for all 3,200 staff',
          'Every server patched within 72 hours',
          'Supplier access on request, for a set time',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_magen_chart',
    name: 'What was blocked',
    content: {
      caption: [text('What was blocked'), text('SIEM data, January–December 2026.')],
      title: text('Attacks blocked, month by month'),
      number: [text('+38%'), text('99.9%')],
      body: [
        text('More attempts than in 2025, most of them phishing emails and bots.'),
        text('Blocked with no human touch.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Thousands of attempts a month',
      data: {
        categories: [
          'Jan',
          'Feb',
          'Mar',
          'Apr',
          'May',
          'Jun',
          'Jul',
          'Aug',
          'Sep',
          'Oct',
          'Nov',
          'Dec',
        ],
        series: [{ name: 'Thousands', values: BLOCKED }],
      },
    },
  },
  {
    layout: 'l_magen_table',
    name: 'Vulnerabilities',
    content: {
      caption: [
        text('Vulnerabilities'),
        text('Monthly scans and an external penetration test, November 2026.'),
      ],
      title: text('What we found, and what is fixed'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['Severity', 'Found', 'Fixed', 'Open', 'Average fix time'],
        ['Critical', '12', '12', '0', '2 days'],
        ['High', '87', '84', '3', '9 days'],
        ['Medium', '412', '371', '41', '26 days'],
        ['Low', '1,036', '802', '234', '61 days'],
        ['Total', '1,547', '1,269', '278', '—'],
      ],
    },
  },
  {
    layout: 'l_magen_full_image',
    name: 'The threat map',
    content: {
      image: { assetId: pictures.magenThreatmap.id },
      caption: text('The threat map'),
      title: text('11,500 attempts a day,', 'and none got through'),
      body: text('Attacks come from 140 countries, and all of them hit the same wall.'),
    },
  },
  {
    layout: 'l_magen_quote',
    name: 'Quote',
    content: {
      quote: text(
        'At 3 a.m. the system isolated the machine before a single file was encrypted. By the time I reached the screen, only the report was left.',
      ),
      attribution: text('Tamar Golan'),
      caption: text('Senior analyst, night shift'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_magen_team',
    name: 'The team',
    content: {
      caption: [
        text('The team'),
        text('CISO'),
        text('SOC Lead'),
        text('Threat Intel'),
        text('Response Lead'),
      ],
      title: text('Who guards the bank at night'),
      image: [
        { assetId: pictures.magenTeam1.id },
        { assetId: pictures.magenTeam2.id },
        { assetId: pictures.magenTeam3.id },
        { assetId: pictures.magenTeam4.id },
      ],
      subtitle: [text('Michal Adler'), text('Ron Barak'), text('Yoav Stern'), text('Noa Shahar')],
      body: [
        text('Leads the security strategy and reports to the board.'),
        text('Runs 28 analysts across six shifts.'),
        text('Tracks the attack groups that target banks.'),
        text('Led the ransomware drill.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_magen_closing',
    name: 'Closing',
    content: {
      caption: [text('What comes next'), text('soc@tavor-bank.example · ext. 4400')],
      title: text('Ready', 'for 2027'),
      body: [
        text('Monthly phishing training for all staff'),
        text('Offline backups for every core system'),
        text('A ransomware drill every quarter, the board included'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const magenSamples = { he: sampleHe, en: sampleEn };

/** The Magen template: the theme, its layouts for both directions, and its sample deck. */
export function magenTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(magenTheme),
    description:
      'Security operations: signal red and amber on near-black steel, HUD sights, a radar, a threat meter and redacted logs, for security briefings, SOC reports and incident reviews.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.magenTriage,
      pictures.magenThreatmap,
      pictures.magenTeam1,
      pictures.magenTeam2,
      pictures.magenTeam3,
      pictures.magenTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}

export const entry = { id: 'magen', template: magenTemplate, samples: magenSamples };
