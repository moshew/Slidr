import {
  CONTENT_LANGUAGES,
  type ContentLanguage,
  type Element,
  type Frame,
  type Layout,
  type Localized,
  type Theme,
} from '@slidr/model';
import { copyJson } from '../json';
import { mirrorLayout } from '../mirror';
import type { Template } from '../template';
import {
  assetTable,
  at,
  atEnd,
  bullets,
  drawing,
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
import { ATLAS_COPY, type AtlasCopy } from './atlas/copy';
import { picture } from './pictures';

const pictures = {
  plant: picture('atlasPlant'),
  coast: picture('atlasCoast'),
  team: [1, 2, 3, 4].map((n) => picture(`atlasTeam${n}`)),
};

/**
 * Atlas: the slide is a sheet of a modern atlas. Warm paper with a faint graticule, held in the
 * black-and-white border a printed map has; on it the instruments of a cartographer, each doing a
 * job: the opening is a globe on which great-circle routes join fourteen port cities, the number
 * of a part stands on the bezel of a compass, the quote is a postcard with its stamp and postmark,
 * the people are postage stamps, a plan is a route with pins, a process a transit line, figures a
 * map's legend. Deep ink for the words, an ocean blue beside them, vermilion kept for the route
 * and the pin, ochre for the land. For international organisations and companies, alliances,
 * conferences, travel and anything that crosses borders.
 *
 * Written for every language of the app: no drawing holds a word, so one set of layouts reads in
 * all of them, and the faces cover their letters (Rubik for Hebrew and Arabic, Montserrat and
 * Inter for Latin, Cyrillic and Vietnamese; Japanese, Korean, Chinese and Hindi take the system's
 * faces). Its sample deck is written in each of them.
 */
export const atlasTheme: Theme = {
  id: 'atlas',
  name: 'Atlas',
  colors: {
    bg: '#f3eee3',
    surface: '#fffdf8',
    text: '#13233b',
    muted: '#55606f',
    primary: '#1b5a87',
    secondary: '#c43c22',
    accent: '#c4892b',
    chart: ['#1b5a87', '#c43c22', '#2c8a73', '#c4892b', '#13233b', '#8fb2cc'],
  },
  // A geometric face of a map's lettering for what is said aloud (Montserrat, with Rubik for
  // Hebrew and Arabic), and Inter for what is read; Rubik carries the Hebrew and the Arabic of both.
  fonts: {
    heading: { he: 'Rubik', latin: 'Montserrat' },
    body: { he: 'Rubik', latin: 'Inter' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 100,
      weight: 700,
      lineHeight: 1.06,
      letterSpacing: -2,
      color: { token: 'text' },
    },
    title: {
      font: 'heading',
      size: 56,
      weight: 700,
      lineHeight: 1.14,
      letterSpacing: -0.8,
      color: { token: 'text' },
    },
    heading: { font: 'heading', size: 36, weight: 600, lineHeight: 1.25, color: { token: 'text' } },
    body: { font: 'body', size: 27, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: {
      font: 'body',
      size: 24,
      weight: 600,
      lineHeight: 1.4,
      letterSpacing: 0.3,
      color: { token: 'muted' },
    },
  },
  radius: 14,
  shadow: { x: 0, y: 18, blur: 42, color: { value: '#3a2a12', alpha: 0.12 } },
  // The ground: paper under a graticule of hairlines, a square every 96 pixels from the frame.
  background: {
    fill: {
      kind: 'css',
      value: [
        'linear-gradient(color-mix(in srgb, var(--color-primary) 6%, transparent) 1.2px, transparent 1.2px) 0 48px / 100% 96px',
        'linear-gradient(90deg, color-mix(in srgb, var(--color-primary) 6%, transparent) 1.2px, transparent 1.2px) 48px 0 / 96px 100%',
        'var(--color-bg)',
      ].join(', '),
    },
  },
  backgroundVariants: [
    SURFACE,
    // The paper alone, without its graticule.
    { fill: { kind: 'solid', color: { token: 'bg' } } },
  ],
};

// ---------------------------------------------------------------------------------------------
// The colours of the drawings, each tied to its token

const INK = '#13233b';
const MUTED = '#55606f';
const OCEAN = '#1b5a87';
const VERMILION = '#c43c22';
const OCHRE = '#c4892b';
const PAPER = '#f3eee3';
const WHITE = '#fffdf8';
/** The sea-green of the chart palette, which no token holds. */
const SEA = '#2c8a73';

const PAINT = {
  [INK]: token('text'),
  [MUTED]: token('muted'),
  [OCEAN]: token('primary'),
  [VERMILION]: token('secondary'),
  [OCHRE]: token('accent'),
  [PAPER]: token('bg'),
  [WHITE]: token('surface'),
};

const r1 = (v: number) => Math.round(v * 10) / 10;

/** A drawing whose box is `w` by `h`. */
const svg = (w: number, h: number, body: string) =>
  `<svg viewBox="0 0 ${r1(w)} ${r1(h)}" fill="none">${body}</svg>`;

const art = (id: string, frame: Frame, body: string) =>
  drawing(id, frame, svg(frame.w, frame.h, body), PAINT);

/**
 * The drawings that a left-to-right deck must not see mirrored: the globe (a mirrored world is
 * another world), and those with figures in them. Their mirror moves them to the other side
 * and leaves them as they are, or takes the drawing given for that direction: a globe that
 * stands to one side of its box stands to the other.
 */
const UPRIGHT = new Map<string, string | undefined>();

const upright = (id: string, frame: Frame, body: string, ltr?: string) => {
  UPRIGHT.set(id, ltr === undefined ? undefined : svg(frame.w, frame.h, ltr));
  return art(id, frame, body);
};

/** A soft shadow under a drawing of paper: a stamp, a postcard. */
const lifted = (element: Element, y = 14, blur = 30, alpha = 0.16): Element => ({
  ...element,
  effects: { shadow: { x: 0, y, blur, color: { value: '#3a2a12', alpha } } },
});

// ---------------------------------------------------------------------------------------------
// Cartography

const RAD = Math.PI / 180;
type LatLon = readonly [lat: number, lon: number];

/** The fourteen port cities of the sample's alliance, west to east. */
const PORTS: Record<string, LatLon> = {
  tangier: [35.77, -5.8],
  valencia: [39.47, -0.38],
  barcelona: [41.39, 2.17],
  algiers: [36.75, 3.06],
  marseille: [43.3, 5.37],
  genoa: [44.41, 8.93],
  tunis: [36.81, 10.18],
  naples: [40.85, 14.27],
  split: [43.51, 16.44],
  thessaloniki: [40.64, 22.94],
  izmir: [38.42, 27.14],
  alexandria: [31.2, 29.92],
  limassol: [34.71, 33.02],
  haifa: [32.79, 34.99],
};

/** The routes of the network: the charter's first five, and those who joined them. */
const ROUTES: [string, string][] = [
  ['valencia', 'marseille'],
  ['marseille', 'genoa'],
  ['genoa', 'split'],
  ['split', 'thessaloniki'],
  ['thessaloniki', 'izmir'],
  ['izmir', 'limassol'],
  ['limassol', 'haifa'],
  ['haifa', 'alexandria'],
  ['alexandria', 'tunis'],
  ['tunis', 'algiers'],
  ['algiers', 'tangier'],
  ['tangier', 'valencia'],
  ['barcelona', 'naples'],
  ['naples', 'tunis'],
  ['genoa', 'tunis'],
];

/** The orthographic projection of a globe of radius `r` seen above `centre`. */
function projection(r: number, [lat0, lon0]: LatLon) {
  const s0 = Math.sin(lat0 * RAD);
  const c0 = Math.cos(lat0 * RAD);
  return (lat: number, lon: number, lift = 1) => {
    const p = lat * RAD;
    const d = (lon - lon0) * RAD;
    const x = lift * r * Math.cos(p) * Math.sin(d);
    const y = lift * r * (c0 * Math.sin(p) - s0 * Math.cos(p) * Math.cos(d));
    const z = s0 * Math.sin(p) + c0 * Math.cos(p) * Math.cos(d);
    return { x, y: -y, z, front: z > 0 || Math.hypot(x, y) > r };
  };
}

/** A unit vector of a point of the globe, and back. */
const vec = ([lat, lon]: LatLon) => {
  const p = lat * RAD;
  const l = lon * RAD;
  return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)] as const;
};
const latLon = ([x, y, z]: readonly number[]): LatLon => [
  Math.asin(Math.max(-1, Math.min(1, z!))) / RAD,
  Math.atan2(y!, x!) / RAD,
];

/** The points of the great circle from `a` to `b`, `n` of them. */
function greatCircle(a: LatLon, b: LatLon, n: number): LatLon[] {
  const u = vec(a);
  const v = vec(b);
  const dot = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
  const omega = Math.acos(dot);
  const points: LatLon[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k1 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const k2 = Math.sin(t * omega) / Math.sin(omega);
    points.push(latLon([k1 * u[0] + k2 * v[0], k1 * u[1] + k2 * v[1], k1 * u[2] + k2 * v[2]]));
  }
  return points;
}

/** Polylines through the points that face the viewer, as an SVG path. */
function visiblePath(points: { x: number; y: number; front: boolean }[], cx: number, cy: number) {
  let d = '';
  let open = false;
  for (const point of points) {
    if (!point.front) {
      open = false;
      continue;
    }
    d += `${open ? 'L' : 'M'}${r1(cx + point.x)} ${r1(cy + point.y)}`;
    open = true;
  }
  return d;
}

interface GlobeOptions {
  r: number;
  /** The point of the earth at the middle of the disc. */
  centre: LatLon;
  /** The box of the drawing, and where the middle of the globe is in it. */
  w: number;
  h: number;
  cx: number;
  cy: number;
  /** Degrees between the lines of the graticule. */
  step?: number;
  /** The route drawn in the colour of what matters; the others are quieter. */
  highlight?: [string, string];
  /** A shadow on the ground under the globe, when the globe stands whole on the slide. */
  shadow?: boolean;
  /** How far the routes rise off the surface, as a share of the radius. */
  lift?: number;
}

/**
 * A globe in orthographic projection: the ocean shaded as a sphere under the light, the
 * graticule, the network's routes lifted off the surface as flight paths, and a pin on every
 * port. Geography without a coastline: the routes and the pins are where the cities are. The
 * box crops the globe where it is smaller than it.
 */
function globe(id: string, o: GlobeOptions) {
  const { cx, cy } = o;
  const step = o.step ?? 15;
  const project = projection(o.r, o.centre);
  const lines: string[] = [];
  // The meridians stop short of the poles, where they would crowd into a star.
  for (let lon = -180; lon < 180; lon += step) {
    const points = [];
    for (let lat = -90 + step; lat <= 90 - step; lat += 1.5) points.push(project(lat, lon));
    lines.push(visiblePath(points, cx, cy));
  }
  for (let lat = -90 + step; lat < 90; lat += step) {
    const points = [];
    for (let lon = -180; lon <= 180; lon += 1.5) points.push(project(lat, lon));
    lines.push(visiblePath(points, cx, cy));
  }
  const equator = visiblePath(
    Array.from({ length: 241 }, (_, i) => project(0, -180 + i * 1.5)),
    cx,
    cy,
  );
  const lift = o.lift ?? 0.035;
  const routes = ROUTES.map(([a, b]) => {
    const points = greatCircle(PORTS[a]!, PORTS[b]!, 48).map(([lat, lon], i, all) =>
      project(lat, lon, 1 + lift * Math.sin((Math.PI * i) / (all.length - 1))),
    );
    const hot = o.highlight && o.highlight.includes(a) && o.highlight.includes(b);
    return { d: visiblePath(points, cx, cy), hot };
  });
  const pins = Object.entries(PORTS).map(([name, [lat, lon]]) => {
    const p = project(lat, lon);
    return { name, x: cx + p.x, y: cy + p.y };
  });
  const g = (name: string) => `${id}-${name}`;
  const scale = Math.max(1, o.r / 330);
  return (
    `<defs>` +
    `<radialGradient id="${g('sea')}" cx="38%" cy="30%" r="78%">` +
    `<stop offset="0" stop-color="${WHITE}"/><stop offset=".5" stop-color="${OCEAN}" stop-opacity=".1"/>` +
    `<stop offset="1" stop-color="${OCEAN}" stop-opacity=".3"/></radialGradient>` +
    `<radialGradient id="${g('shadow')}" cx="50%" cy="50%" r="50%">` +
    `<stop offset="0" stop-color="${INK}" stop-opacity=".2"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></radialGradient>` +
    `</defs>` +
    (o.shadow
      ? `<ellipse cx="${cx}" cy="${r1(cy + o.r + 34)}" rx="${r1(o.r * 0.82)}" ry="20" fill="url(#${g('shadow')})"/>`
      : '') +
    `<circle cx="${cx}" cy="${cy}" r="${r1(o.r + 16 * scale)}" stroke="${OCEAN}" stroke-opacity=".22" stroke-width="1.2" stroke-dasharray="1 7" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${o.r}" fill="url(#${g('sea')})"/>` +
    `<path d="${lines.join('')}" stroke="${OCEAN}" stroke-opacity=".3" stroke-width="1.1"/>` +
    `<path d="${equator}" stroke="${OCEAN}" stroke-opacity=".55" stroke-width="1.4" stroke-dasharray="3 6"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${o.r}" stroke="${INK}" stroke-width="2.2"/>` +
    routes
      .map(
        ({ d, hot }) =>
          `<path d="${d}" stroke="${VERMILION}" stroke-opacity="${hot ? 1 : o.highlight ? 0.4 : 0.9}" stroke-width="${r1((hot ? 3.4 : 2.4) * Math.sqrt(scale))}" stroke-dasharray="${hot ? '1 0' : '2 7'}" stroke-linecap="round"/>`,
      )
      .join('') +
    pins
      .map(({ name, x, y }) => {
        const hot = o.highlight?.includes(name);
        const r = (hot ? 7 : 4.8) * Math.sqrt(scale);
        // The end of the highlighted route: the destination, ringed.
        const destination = hot && o.highlight![1] === name;
        return (
          (destination
            ? `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r * 4.2)}" stroke="${VERMILION}" stroke-width="1.6"/>` +
              `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r * 6.4)}" stroke="${VERMILION}" stroke-opacity=".45" stroke-width="1.2"/>`
            : '') +
          `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r * 2.5)}" fill="${VERMILION}" fill-opacity=".16"/>` +
          `<circle cx="${r1(x)}" cy="${r1(y)}" r="${r1(r)}" fill="${VERMILION}" stroke="${WHITE}" stroke-width="1.8"/>`
        );
      })
      .join('')
  );
}

/** A smooth closed path through points (Catmull-Rom as cubic Béziers). */
function closedCurve(points: [number, number][]): string {
  const n = points.length;
  let d = `M${r1(points[0]![0])} ${r1(points[0]![1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0]!)} ${r1(c1[1]!)} ${r1(c2[0]!)} ${r1(c2[1]!)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

interface Hill {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** The phases of the hill's shape: its lumps. */
  seed: number;
  levels: number;
}

/**
 * The contour lines of hills on a topographic map: each level a closed line around the summit,
 * lumpier near the foot, drawn nearer the summit as the hill rises.
 */
function contours(hills: readonly Hill[], stroke: string, opacity: number, width = 1.4) {
  const paths: string[] = [];
  for (const hill of hills) {
    for (let level = 0; level < hill.levels; level++) {
      const k = 1 - level / hill.levels;
      const points: [number, number][] = [];
      for (let i = 0; i < 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const lump =
          1 +
          0.16 * k * Math.sin(2 * a + hill.seed) +
          0.1 * k * Math.sin(3 * a + hill.seed * 1.7) +
          0.06 * Math.sin(5 * a + hill.seed * 2.3);
        // The summit sits up and to one side of the foot, so the slope is steeper there.
        const x = hill.x + hill.rx * 0.12 * (1 - k) + Math.cos(a) * hill.rx * k * lump;
        const y = hill.y - hill.ry * 0.1 * (1 - k) + Math.sin(a) * hill.ry * k * lump;
        points.push([x, y]);
      }
      const index = level % 5 === 0 ? 1.7 : 1;
      paths.push(
        `<path d="${closedCurve(points)}" stroke="${stroke}" stroke-opacity="${r1(opacity * index * 100) / 100}" stroke-width="${r1(width * index)}"/>`,
      );
    }
  }
  return paths.join('');
}

/** A compass rose of eight points; the north point in vermilion. */
function rose(cx: number, cy: number, long: number, short: number, width: number) {
  const point = (angle: number, length: number, w: number, north: boolean) => {
    const a = (angle - 90) * RAD;
    const tip = [cx + Math.cos(a) * length, cy + Math.sin(a) * length];
    const left = [cx + Math.cos(a - Math.PI / 2) * w, cy + Math.sin(a - Math.PI / 2) * w];
    const right = [cx + Math.cos(a + Math.PI / 2) * w, cy + Math.sin(a + Math.PI / 2) * w];
    const xy = (p: number[]) => `${r1(p[0]!)} ${r1(p[1]!)}`;
    return (
      `<path d="M${cx} ${cy}L${xy(tip)}L${xy(left)}Z" fill="${north ? VERMILION : INK}"/>` +
      `<path d="M${cx} ${cy}L${xy(tip)}L${xy(right)}Z" fill="${WHITE}" stroke="${north ? VERMILION : INK}" stroke-width="1.2" stroke-linejoin="round"/>`
    );
  };
  return (
    [45, 135, 225, 315].map((a) => point(a, short, width * 0.7, false)).join('') +
    [90, 180, 270, 0].map((a) => point(a, long, width, a === 0)).join('')
  );
}

/** The ticks of a compass's bezel: every 5°, longer every 10° and 30°. */
function bezel(cx: number, cy: number, r: number) {
  let d = '';
  for (let deg = 0; deg < 360; deg += 5) {
    const len = deg % 30 === 0 ? 22 : deg % 10 === 0 ? 14 : 8;
    const a = (deg - 90) * RAD;
    d +=
      `M${r1(cx + Math.cos(a) * r)} ${r1(cy + Math.sin(a) * r)}` +
      `L${r1(cx + Math.cos(a) * (r - len))} ${r1(cy + Math.sin(a) * (r - len))}`;
  }
  return d;
}

/** The outline of a postage stamp: a rectangle with the perforation bitten out of its edges. */
function perforated(w: number, h: number, hole = 7, step = 26) {
  const nx = Math.max(2, Math.round(w / step));
  const ny = Math.max(2, Math.round(h / step));
  const sx = w / nx;
  const sy = h / ny;
  const arc = (x: number, y: number) => `A${hole} ${hole} 0 0 0 ${r1(x)} ${r1(y)}`;
  let d = 'M0 0';
  for (let i = 0; i < nx; i++) {
    const cx = sx * (i + 0.5);
    d += `H${r1(cx - hole)}${arc(cx + hole, 0)}`;
  }
  d += `H${r1(w)}`;
  for (let j = 0; j < ny; j++) {
    const cy = sy * (j + 0.5);
    d += `V${r1(cy - hole)}${arc(w, cy + hole)}`;
  }
  d += `V${r1(h)}`;
  for (let i = nx - 1; i >= 0; i--) {
    const cx = sx * (i + 0.5);
    d += `H${r1(cx + hole)}${arc(cx - hole, h)}`;
  }
  d += 'H0';
  for (let j = ny - 1; j >= 0; j--) {
    const cy = sy * (j + 0.5);
    d += `V${r1(cy + hole)}${arc(0, cy - hole)}`;
  }
  return `${d}Z`;
}

/** A postage stamp: perforated paper, and a fine frame in its colour around the picture. */
function stamp(w: number, h: number, frame: string, inset = 22) {
  return (
    `<path d="${perforated(w, h)}" fill="${WHITE}"/>` +
    `<rect x="${inset}" y="${inset}" width="${w - inset * 2}" height="${h - inset * 2}" stroke="${frame}" stroke-width="2"/>`
  );
}

/** A postmark: two rings and the wavy lines of the cancellation running out of them. */
function postmark(cx: number, cy: number, r: number, waves: number, length: number) {
  const lines: string[] = [];
  for (let i = 0; i < waves; i++) {
    const y = cy - ((waves - 1) / 2 - i) * (r * 0.42);
    let d = `M${r1(cx + r * 0.6)} ${r1(y)}`;
    for (let x = 0; x <= length; x += 6) {
      d += `L${r1(cx + r * 0.6 + x)} ${r1(y + Math.sin(x / 9) * 3.2)}`;
    }
    lines.push(d);
  }
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${INK}" stroke-opacity=".55" stroke-width="2"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r1(r * 0.74)}" stroke="${INK}" stroke-opacity=".55" stroke-width="1.2"/>` +
    `<path d="${lines.join('')}" stroke="${INK}" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>`
  );
}

/** A map pin: a drop of vermilion with a white eye. */
function pinGlyph(x: number, y: number, s: number) {
  return (
    `<path d="M${x} ${r1(y + s * 1.4)}C${r1(x - s * 0.18)} ${r1(y + s * 0.95)} ${r1(x - s)} ${r1(y + s * 0.62)} ${r1(x - s)} ${y}A${s} ${s} 0 1 1 ${r1(x + s)} ${y}C${r1(x + s)} ${r1(y + s * 0.62)} ${r1(x + s * 0.18)} ${r1(y + s * 0.95)} ${x} ${r1(y + s * 1.4)}Z" fill="${VERMILION}"/>` +
    `<circle cx="${x}" cy="${y}" r="${r1(s * 0.38)}" fill="${WHITE}"/>`
  );
}

/** The scale bar of a map: five segments, ink and paper by turns, between two hairlines. */
function scaleBar(w: number) {
  const seg = w / 5;
  let body = `<rect x="1" y="7" width="${r1(w - 2)}" height="8" stroke="${INK}" stroke-width="1.4"/>`;
  for (let i = 0; i < 5; i += 2) {
    body += `<rect x="${r1(1 + i * seg)}" y="7" width="${r1(seg)}" height="8" fill="${INK}"/>`;
  }
  for (let i = 0; i <= 5; i++) {
    body += `<path d="M${r1(1 + Math.min(i * seg, w - 2))} 2V20" stroke="${INK}" stroke-width="1.4"/>`;
  }
  return body;
}

// ---------------------------------------------------------------------------------------------
// The frame of every slide

const OUTER = 36;
const BAND = 12;
const INNER = OUTER + BAND;

/**
 * The neatline of a printed map around the slide. The opening, the parts, the quote and the
 * closing have the whole black-and-white band; a content slide a hairline, with the band only at
 * its corners, so the page is quieter where it is read.
 */
function neatline(id: string, full: boolean): Element {
  const W = 1920;
  const H = 1080;
  const w = W - OUTER * 2;
  const h = H - OUTER * 2;
  let body = `<rect x="${OUTER}" y="${OUTER}" width="${w}" height="${h}" stroke="${INK}" stroke-width="1.6"/>`;
  const segments = (length: number) => {
    const n = Math.max(1, Math.round(length / 96));
    return Array.from({ length: n }, (_, i) => [(i * length) / n, length / n] as const);
  };
  const runX = segments(W - INNER * 2);
  const runY = segments(H - INNER * 2);
  const corner = 2;
  const keep = (i: number, n: number) => full || i < corner || i >= n - corner;
  if (full) {
    body += `<rect x="${INNER}" y="${INNER}" width="${W - INNER * 2}" height="${H - INNER * 2}" stroke="${INK}" stroke-width="1"/>`;
  }
  runX.forEach(([x, len], i) => {
    if (i % 2 || !keep(i, runX.length)) return;
    body += `<rect x="${r1(INNER + x)}" y="${OUTER}" width="${r1(len)}" height="${BAND}" fill="${INK}"/>`;
    body += `<rect x="${r1(INNER + x)}" y="${H - INNER}" width="${r1(len)}" height="${BAND}" fill="${INK}"/>`;
  });
  runY.forEach(([y, len], i) => {
    if (i % 2 || !keep(i, runY.length)) return;
    body += `<rect x="${OUTER}" y="${r1(INNER + y)}" width="${BAND}" height="${r1(len)}" fill="${INK}"/>`;
    body += `<rect x="${W - INNER}" y="${r1(INNER + y)}" width="${BAND}" height="${r1(len)}" fill="${INK}"/>`;
  });
  // The corners of the band.
  for (const [x, y] of [
    [OUTER, OUTER],
    [W - INNER, OUTER],
    [OUTER, H - INNER],
    [W - INNER, H - INNER],
  ] as const) {
    body += `<rect x="${x}" y="${y}" width="${BAND}" height="${BAND}" fill="${INK}"/>`;
  }
  if (!full) {
    // Where the band stops along a side: a hairline closes it on the inside.
    const stop = (n: number, len: number) => INNER + (corner * len) / n;
    const sx = stop(runX.length, W - INNER * 2);
    const sy = stop(runY.length, H - INNER * 2);
    body +=
      `<path d="M${OUTER} ${INNER}H${r1(sx)}V${OUTER}M${W - OUTER} ${INNER}H${r1(W - sx)}V${OUTER}` +
      `M${OUTER} ${H - INNER}H${r1(sx)}V${H - OUTER}M${W - OUTER} ${H - INNER}H${r1(W - sx)}V${H - OUTER}` +
      `M${INNER} ${OUTER}V${r1(sy)}H${OUTER}M${INNER} ${H - OUTER}V${r1(H - sy)}H${OUTER}` +
      `M${W - INNER} ${OUTER}V${r1(sy)}H${W - OUTER}M${W - INNER} ${H - OUTER}V${r1(H - sy)}H${W - OUTER}" stroke="${INK}" stroke-width="1"/>`;
  }
  return art(id, { x: 0, y: 0, w: W, h: H }, body);
}

// ---------------------------------------------------------------------------------------------
// The parts every slide is made of

const START = 136;
const END = 136;
const WIDTH = 1920 - START - END;

/** The pin before a kicker. */
const kickerPin = (id: string, top: number) =>
  art(id, at(START, top + 1, 24, 32), pinGlyph(12, 11, 10));

/** The kicker on its pin, and the title; without a kicker, the title on the pin. */
function head(name: string, width = 1100, lines = 2, kicker = true) {
  // Room for the leading a script may need beyond the theme's (`LEADING`).
  const title = at(START, 132, width, Math.round(56 * 1.3 * lines) + 4);
  if (!kicker) {
    return {
      placeholders: [
        place('p_title', 'title', { ...at(START + 44, 108, width - 44, title.h) }, 'title'),
      ],
      decorations: [kickerPin(`d_atlas_${name}_pin`, 126)],
    };
  }
  return {
    placeholders: [
      place('p_kicker', 'caption', at(START + 38, 90, Math.min(900, width - 38), 36), 'caption', {
        color: token('primary'),
      }),
      place('p_title', 'title', title, 'title'),
    ],
    decorations: [kickerPin(`d_atlas_${name}_pin`, 90)],
  };
}

/** The mark of the deck: a small compass, which the user may replace with a logo. */
function mark(id: string, frame: Frame): Element {
  const s = frame.w;
  const c = s / 2;
  return {
    ...drawing(
      id,
      frame,
      svg(
        s,
        s,
        `<circle cx="${c}" cy="${c}" r="${r1(c - 1.5)}" stroke="${INK}" stroke-width="1.6"/>` +
          rose(c, c, c - 5, c * 0.42, c * 0.2),
      ),
      PAINT,
      { role: 'logo', name: 'logo' },
    ),
  };
}

/**
 * The foot of a content slide: the mark and the deck's name at the start; at the end a scale
 * bar and the slide's number in a ring, as a map numbers its sheets.
 */
function foot(name: string, withFooter = true) {
  return {
    placeholders: withFooter
      ? [place('p_footer', 'footer', at(START + 56, 958, 900, 36), 'caption')]
      : [],
    decorations: [
      mark(`d_atlas_${name}_mark`, at(START, 956, 40, 40)),
      art(`d_atlas_${name}_scale`, atEnd(END + 84, 966, 200, 22), scaleBar(200)),
      art(
        `d_atlas_${name}_folio_ring`,
        atEnd(END, 948, 58, 58),
        `<circle cx="29" cy="29" r="27" stroke="${VERMILION}" stroke-width="2"/><circle cx="29" cy="29" r="22" stroke="${VERMILION}" stroke-opacity=".35" stroke-width="1"/>`,
      ),
      pageNumber(`d_atlas_${name}_number`, atEnd(END, 959, 58, 36), 'caption', {
        color: token('text'),
        weight: 700,
        align: 'center',
      }),
    ],
  };
}

/** A sheet of paper on the slide: a card. */
const card = (id: string, frame: Frame, radius = 14) =>
  rect(id, frame, solid(token('surface')), {
    stroke: { color: token('text', 0.1), width: 1.5 },
    effects: { radius, shadow: { x: 0, y: 16, blur: 40, color: { value: '#3a2a12', alpha: 0.1 } } },
  });

/** A numbered pin of a list: a ring of vermilion with its figure. */
function numberPin(id: string, frame: Frame, n: number) {
  const s = frame.w;
  const c = s / 2;
  return upright(
    id,
    frame,
    `<circle cx="${c}" cy="${c}" r="${c - 2}" fill="${VERMILION}"/>` +
      `<text x="${c}" y="${r1(c + s * 0.17)}" text-anchor="middle" font-family="Montserrat, Rubik, sans-serif" font-size="${r1(s * 0.46)}" font-weight="700" fill="${WHITE}">${n}</text>`,
  );
}

// ---------------------------------------------------------------------------------------------
// Pictograms of the cards: line drawings, without a word

const LINE = `stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"`;

const PICTOGRAMS = [
  // Reuse: a drop inside the circle of its return.
  (cx: number, cy: number) =>
    `<path d="M${cx} ${cy - 38}C${cx - 18} ${cy - 12} ${cx - 26} ${cy} ${cx - 26} ${cy + 12}A26 26 0 0 0 ${cx + 26} ${cy + 12}C${cx + 26} ${cy} ${cx + 18} ${cy - 12} ${cx} ${cy - 38}Z" fill="${OCEAN}" fill-opacity=".14" ${LINE}/>` +
    `<path d="M${cx - 60} ${cy - 10}A62 62 0 0 1 ${cx + 44} ${cy - 46}" ${LINE} stroke="${VERMILION}"/>` +
    `<path d="M${cx + 30} ${cy - 56}L${cx + 46} ${cy - 46}L${cx + 34} ${cy - 30}" ${LINE} stroke="${VERMILION}"/>` +
    `<path d="M${cx + 60} ${cy + 10}A62 62 0 0 1 ${cx - 44} ${cy + 46}" ${LINE} stroke="${VERMILION}"/>` +
    `<path d="M${cx - 30} ${cy + 56}L${cx - 46} ${cy + 46}L${cx - 34} ${cy + 30}" ${LINE} stroke="${VERMILION}"/>`,
  // Desalination: the sun over the sea, and the fresh drop it gives.
  (cx: number, cy: number) =>
    `<circle cx="${cx - 34}" cy="${cy - 22}" r="20" fill="${OCHRE}" fill-opacity=".3" ${LINE}/>` +
    [0, 45, 90, 135, 180, 225, 270, 315]
      .map((a) => {
        const r = a * RAD;
        return `<path d="M${r1(cx - 34 + Math.cos(r) * 30)} ${r1(cy - 22 + Math.sin(r) * 30)}L${r1(cx - 34 + Math.cos(r) * 40)} ${r1(cy - 22 + Math.sin(r) * 40)}" ${LINE}/>`;
      })
      .join('') +
    `<path d="M${cx - 76} ${cy + 34}q12 -10 24 0t24 0t24 0t24 0t24 0t24 0" ${LINE} stroke="${OCEAN}"/>` +
    `<path d="M${cx - 76} ${cy + 58}q12 -10 24 0t24 0t24 0t24 0t24 0t24 0" ${LINE} stroke="${OCEAN}" stroke-opacity=".55"/>` +
    `<path d="M${cx + 42} ${cy - 50}C${cx + 32} ${cy - 34} ${cx + 26} ${cy - 26} ${cx + 26} ${cy - 18}A16 16 0 0 0 ${cx + 58} ${cy - 18}C${cx + 58} ${cy - 26} ${cx + 52} ${cy - 34} ${cx + 42} ${cy - 50}Z" fill="${VERMILION}" fill-opacity=".18" ${LINE} stroke="${VERMILION}"/>`,
  // Leak detection: a pipe under the street, and the sound of the leak that gives it away.
  (cx: number, cy: number) =>
    `<rect x="${cx - 80}" y="${cy + 6}" width="160" height="26" rx="6" fill="${OCEAN}" fill-opacity=".12" ${LINE}/>` +
    `<path d="M${cx - 40} ${cy + 6}V${cy + 32}M${cx + 40} ${cy + 6}V${cy + 32}" ${LINE}/>` +
    `<path d="M${cx + 6} ${cy + 36}c-4 8 -6 12 -6 16a6 6 0 0 0 12 0c0 -4 -2 -8 -6 -16z" fill="${OCEAN}" ${LINE} stroke="${OCEAN}"/>` +
    `<path d="M${cx - 14} ${cy - 14}a20 20 0 0 1 28 0M${cx - 28} ${cy - 28}a40 40 0 0 1 56 0M${cx - 42} ${cy - 42}a60 60 0 0 1 84 0" ${LINE} stroke="${VERMILION}"/>`,
] as const;

// ---------------------------------------------------------------------------------------------
// The layouts

/** The columns of the rows of cards, steps, stops and people. */
const cards3 = [START, START + 580, START + 1160];
const stops4 = [START, START + 422, START + 844, START + 1266];
const steps5 = [START, START + 337, START + 674, START + 1011, START + 1348];
const team4 = [START, START + 428, START + 856, START + 1284];

function layouts(): Layout[] {
  // The opening's globe rises out of the end corner of the sheet, cropped by its border: the
  // Mediterranean high on its face, where the slide's eye falls.
  const heroArt = atEnd(INNER, INNER, 900, 1080 - INNER * 2);
  const heroGlobe = (side: 'start' | 'end') =>
    globe('d_atlas_hero_globe', {
      r: 600,
      centre: [12, 17],
      w: heroArt.w,
      h: heroArt.h,
      cx: side === 'end' ? 330 - INNER : heroArt.w - (330 - INNER),
      cy: 880 - INNER,
      step: 10,
      lift: 0.05,
    });
  const closingSize = 712;
  const closingGlobe = globe('d_atlas_closing_globe', {
    r: 300,
    centre: [39, 12],
    w: closingSize,
    h: closingSize,
    cx: closingSize / 2,
    cy: closingSize / 2 - 20,
    highlight: ['valencia', 'genoa'],
    shadow: true,
    lift: 0.09,
  });

  // The flight of the timeline: a gentle arc from the first stop to the last, and where the
  // stops stand on it.
  const flight = at(START - 40, 300, WIDTH + 80, 200);
  const arcY = (t: number) => 150 - Math.sin(Math.PI * t) * 92;
  const stopX = stops4.map((s) => flight.w - (s - (START - 40)) - 190);
  const flightPath = (() => {
    let d = '';
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      d += `${i ? 'L' : 'M'}${r1(flight.w - 20 - t * (flight.w - 40))} ${r1(arcY(t))}`;
    }
    return d;
  })();
  const yAt = (x: number) => arcY((flight.w - 20 - x) / (flight.w - 40));

  // The transit line of the process.
  const lineTop = 392;
  const stationX = steps5.map((s) => WIDTH - (s - START) - 150);

  return [
    {
      id: 'l_atlas_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        place('p_kicker', 'caption', at(START + 38, 300, 840, 36), 'caption', {
          color: token('primary'),
        }),
        place('p_title', 'title', at(START, 344, 900, 252), 'display'),
        place('p_subtitle', 'subtitle', at(START, 604, 840, 136), 'heading'),
        place('p_meta', 'caption', at(START + 46, 806, 820, 36), 'caption'),
      ],
      decorations: [
        neatline('d_atlas_hero_frame', true),
        upright('d_atlas_hero_globe', heroArt, heroGlobe('end'), heroGlobe('start')),
        kickerPin('d_atlas_hero_pin', 300),
        art(
          'd_atlas_hero_route',
          at(START, 766, 840, 12),
          `<path d="M10 6H${840 - 14}" stroke="${VERMILION}" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>` +
            `<circle cx="${840 - 7}" cy="6" r="5" fill="${VERMILION}"/><circle cx="6" cy="6" r="4.5" stroke="${VERMILION}" stroke-width="2"/>`,
        ),
        art(
          'd_atlas_hero_compass',
          at(START, 808, 30, 30),
          `<circle cx="15" cy="15" r="13.5" stroke="${INK}" stroke-width="1.6"/>` +
            rose(15, 15, 11, 5, 3),
        ),
      ],
    },
    {
      id: 'l_atlas_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        place('p_number', 'number', atEnd(530 - 130, 540 - 70, 260, 140), 'display', {
          align: 'center',
          vAlign: 'middle',
          color: token('primary'),
        }),
        place('p_kicker', 'caption', at(START + 38, 372, 780, 36), 'caption', {
          color: token('primary'),
        }),
        place('p_title', 'title', at(START, 416, 860, 252), 'display', { vAlign: 'middle' }),
        place('p_subtitle', 'subtitle', at(START, 676, 820, 136), 'heading'),
      ],
      decorations: [
        neatline('d_atlas_section_frame', true),
        art(
          'd_atlas_section_bezel',
          atEnd(130, 140, 800, 800),
          `<circle cx="400" cy="400" r="392" stroke="${INK}" stroke-width="2.2"/>` +
            `<circle cx="400" cy="400" r="384" stroke="${INK}" stroke-width="1"/>` +
            `<path d="${bezel(400, 400, 384)}" stroke="${INK}" stroke-width="1.6"/>` +
            `<circle cx="400" cy="400" r="350" stroke="${OCEAN}" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="2 6"/>` +
            `<g opacity=".9">${rose(400, 400, 330, 210, 46)}</g>` +
            `<circle cx="400" cy="400" r="150" fill="${WHITE}" stroke="${INK}" stroke-width="2.2"/>` +
            `<circle cx="400" cy="400" r="140" stroke="${OCEAN}" stroke-opacity=".4" stroke-width="1"/>`,
        ),
        kickerPin('d_atlas_section_pin', 372),
      ],
    },
    {
      id: 'l_atlas_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head('big_number', 1000, 1).placeholders,
        place('p_number', 'number', at(START, 344, 440, 134), 'display', {
          color: token('secondary'),
        }),
        place('p_label', 'subtitle', at(START, 494, 700, 96), 'heading'),
        place('p_note', 'body', at(START, 610, 680, 172), 'body'),
        ...[0, 1, 2].flatMap((i) => [
          place(`p_number${i + 2}`, 'number', atEnd(END + 128, 318 + i * 192, 520, 70), 'title', {
            color: token('primary'),
          }),
          place(`p_label${i + 2}`, 'caption', atEnd(END + 128, 390 + i * 192, 520, 104), 'caption'),
        ]),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        neatline('d_atlas_big_number_frame', false),
        ...head('big_number', 1000, 1).decorations,
        // The summit the figure stands for: a hill beside it, clear of every line of text.
        art(
          'd_atlas_big_number_hill',
          at(START + 460, 262, 440, 220),
          contours(
            [
              { x: 250, y: 112, rx: 170, ry: 88, seed: 1.2, levels: 9 },
              { x: 64, y: 150, rx: 50, ry: 40, seed: 3.1, levels: 4 },
            ],
            OCEAN,
            0.26,
          ) + pinGlyph(268, 70, 14),
        ),
        card('d_atlas_big_number_legend', atEnd(END, 290, 700, 610)),
        art(
          'd_atlas_big_number_legend_band',
          atEnd(END, 290, 700, 12),
          Array.from({ length: 7 }, (_, i) =>
            i % 2 ? '' : `<rect x="${i * 100}" y="0" width="100" height="12" fill="${INK}"/>`,
          ).join(''),
        ),
        ...[0, 1, 2].flatMap((i) => {
          const y = 318 + i * 192;
          const keys = [
            // A pin, a route, a hill: the three keys of the legend.
            pinGlyph(32, 26, 18),
            `<path d="M6 40Q32 4 58 40" stroke="${VERMILION}" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round"/><circle cx="6" cy="40" r="5" fill="${VERMILION}"/><circle cx="58" cy="40" r="5" fill="${VERMILION}"/>`,
            contours([{ x: 32, y: 34, rx: 28, ry: 22, seed: 2, levels: 4 }], OCEAN, 0.7, 1.6),
          ];
          return [
            art(`d_atlas_big_number_key${i + 2}`, atEnd(END + 36, y + 4, 64, 64), keys[i]!),
            ...(i < 2
              ? [
                  rect(
                    `d_atlas_big_number_rule${i + 2}`,
                    atEnd(END + 36, y + 180, 628, 1.5),
                    solid(token('text', 0.1)),
                  ),
                ]
              : []),
          ];
        }),
        ...foot('big_number').decorations,
      ],
    },
    {
      id: 'l_atlas_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(300, 300, 800, 420), 'title'),
        place('p_attribution', 'attribution', atEnd(290, 536, 420, 50), 'heading', {
          vAlign: 'bottom',
        }),
        place('p_caption', 'caption', atEnd(290, 604, 420, 140), 'caption', { vAlign: 'top' }),
        ...foot('quote').placeholders,
      ],
      decorations: [
        neatline('d_atlas_quote_frame', true),
        lifted(
          art(
            'd_atlas_quote_card',
            at(220, 150, 1480, 740),
            `<rect x="0" y="0" width="1480" height="740" rx="10" fill="${WHITE}" stroke="${INK}" stroke-opacity=".08" stroke-width="1.5"/>`,
          ),
          22,
          50,
          0.14,
        ),
        rect('d_atlas_quote_divider', at(220 + 960, 210, 2, 620), solid(token('text', 0.16))),
        upright(
          'd_atlas_quote_marks',
          at(296, 206, 96, 74),
          `<path d="M8 74V44C8 18 22 4 44 0L48 10C34 16 28 26 28 40H44V74Z M56 74V44C56 18 70 4 92 0L96 10C82 16 76 26 76 40H92V74Z" fill="${VERMILION}"/>`,
        ),
        lifted(
          art(
            'd_atlas_quote_stamp',
            atEnd(270, 190, 190, 230),
            stamp(190, 230, OCEAN, 18) +
              `<rect x="28" y="28" width="134" height="174" fill="${OCEAN}" fill-opacity=".08"/>` +
              contours([{ x: 96, y: 120, rx: 56, ry: 70, seed: 0.7, levels: 6 }], OCEAN, 0.5, 1.4) +
              pinGlyph(110, 104, 10),
          ),
          8,
          16,
          0.18,
        ),
        art('d_atlas_quote_postmark', atEnd(390, 214, 300, 140), postmark(70, 70, 56, 4, 200)),
        // The lines of the address: the attribution written on the first, the caption under it,
        // and the last two left for the rest of the address.
        ...[590, 778, 846].map((y, i) =>
          rect(`d_atlas_quote_line${i + 1}`, atEnd(290, y, 420, 2), solid(token('text', 0.22))),
        ),
        ...foot('quote').decorations,
      ],
    },
    {
      id: 'l_atlas_text',
      name: 'Text',
      archetype: 'text',
      placeholders: [
        ...head('text', 1040, 2, false).placeholders,
        place('p_body', 'body', at(START, 290, 1000, 610), 'body', { vAlign: 'middle' }),
      ],
      decorations: [
        neatline('d_atlas_text_frame', false),
        ...head('text', 1040, 2, false).decorations,
        card('d_atlas_text_inset', atEnd(END, 140, 520, 760)),
        art(
          'd_atlas_text_map',
          atEnd(END + 26, 166, 468, 708),
          `<rect x="1" y="1" width="466" height="706" stroke="${INK}" stroke-width="1.4"/>` +
            `<rect x="9" y="9" width="450" height="690" fill="${OCEAN}" fill-opacity=".06"/>` +
            contours(
              [
                { x: 150, y: 210, rx: 150, ry: 120, seed: 0.4, levels: 9 },
                { x: 330, y: 470, rx: 120, ry: 150, seed: 2.6, levels: 8 },
                { x: 120, y: 560, rx: 80, ry: 64, seed: 4.2, levels: 4 },
              ],
              OCEAN,
              0.32,
            ) +
            `<path d="M96 600C150 520 120 430 200 380S330 330 300 230S380 120 410 90" stroke="${VERMILION}" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>` +
            pinGlyph(96, 578, 13) +
            pinGlyph(200, 358, 11) +
            pinGlyph(300, 208, 11) +
            pinGlyph(410, 68, 13) +
            `<g transform="translate(400 600)"><circle r="34" fill="${WHITE}" stroke="${INK}" stroke-width="1.4"/>${rose(0, 0, 28, 13, 7)}</g>` +
            `<g transform="translate(36 660)">${scaleBar(160)}</g>`,
        ),
      ],
    },
    {
      id: 'l_atlas_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head('text_image', 960).placeholders,
        place('p_image', 'image', atEnd(END + 16, 156, 628, 728)),
        ...[0, 1, 2].flatMap((i) => [
          place(`p_point${i + 1}`, 'subtitle', at(START + 80, 314 + i * 182, 860, 48), 'heading'),
          place(`p_detail${i + 1}`, 'body', at(START + 80, 366 + i * 182, 860, 126), 'body'),
        ]),
        ...foot('text_image').placeholders,
      ],
      decorations: [
        neatline('d_atlas_text_image_frame', false),
        ...head('text_image', 960).decorations,
        art(
          'd_atlas_text_image_border',
          atEnd(END, 140, 660, 760),
          `<rect x=".75" y=".75" width="658.5" height="758.5" stroke="${INK}" stroke-width="1.5"/>` +
            `<rect x="12.5" y="12.5" width="635" height="735" stroke="${INK}" stroke-width="1"/>` +
            Array.from({ length: 7 }, (_, i) => {
              const len = 635 / 7;
              return i % 2
                ? ''
                : `<rect x="${r1(12.5 + i * len)}" y=".75" width="${r1(len)}" height="11.75" fill="${INK}"/><rect x="${r1(12.5 + i * len)}" y="747.5" width="${r1(len)}" height="11.75" fill="${INK}"/>`;
            }).join('') +
            Array.from({ length: 8 }, (_, i) => {
              const len = 735 / 8;
              return i % 2
                ? ''
                : `<rect x=".75" y="${r1(12.5 + i * len)}" width="11.75" height="${r1(len)}" fill="${INK}"/><rect x="647.5" y="${r1(12.5 + i * len)}" width="11.75" height="${r1(len)}" fill="${INK}"/>`;
            }).join(''),
        ),
        art(
          'd_atlas_text_image_thread',
          at(START + 26, 364, 4, 368),
          `<path d="M2 2V366" stroke="${VERMILION}" stroke-width="2.2" stroke-dasharray="2 8" stroke-linecap="round"/>`,
        ),
        ...[0, 1, 2].map((i) =>
          numberPin(`d_atlas_text_image_pin${i + 1}`, at(START, 310 + i * 182, 54, 54), i + 1),
        ),
        ...foot('text_image').decorations,
      ],
    },
    {
      id: 'l_atlas_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        place('p_image', 'image', atEnd(INNER, INNER, 1920 - INNER * 2, 690)),
        place('p_place', 'caption', at(START + 38, 780, 760, 36), 'caption', {
          color: token('primary'),
        }),
        place('p_title', 'title', at(START, 824, 800, 134), 'title'),
        place('p_body', 'body', atEnd(END + 226, 786, 570, 172), 'body', { vAlign: 'middle' }),
      ],
      decorations: [
        neatline('d_atlas_full_image_frame', true),
        rect(
          'd_atlas_full_image_edge',
          atEnd(INNER, INNER + 690, 1920 - INNER * 2, 2),
          solid(token('text')),
        ),
        kickerPin('d_atlas_full_image_pin', 780),
        art(
          'd_atlas_full_image_compass',
          atEnd(END + 20, 800, 150, 150),
          `<circle cx="75" cy="75" r="70" stroke="${INK}" stroke-width="1.6"/><circle cx="75" cy="75" r="62" stroke="${INK}" stroke-width="1"/>` +
            `<path d="${bezel(75, 75, 62)}" stroke="${INK}" stroke-width="1" stroke-opacity=".7"/>` +
            rose(75, 75, 50, 26, 9),
        ),
        rect(
          'd_atlas_full_image_rule',
          atEnd(END + 196, 790, 1.5, 168),
          solid(token('text', 0.16)),
        ),
      ],
    },
    {
      id: 'l_atlas_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head('cards', 1100).placeholders,
        ...cards3.flatMap((s, i) => [
          // The label sits on the card's title, whatever their lengths: a header over the text.
          place(`p_label${i + 1}`, 'caption', at(s + 36, 486, 420, 70), 'caption', {
            color: token('primary'),
            vAlign: 'bottom',
          }),
          place(`p_card${i + 1}_title`, 'subtitle', at(s + 36, 556, 420, 96), 'heading'),
          place(`p_card${i + 1}_body`, 'body', at(s + 36, 656, 420, 172), 'body'),
        ]),
        place('p_note', 'body', at(START, 878, 1400, 44), 'body'),
        ...foot('cards').placeholders,
      ],
      decorations: [
        neatline('d_atlas_cards_frame', false),
        ...head('cards', 1100).decorations,
        ...cards3.flatMap((s, i) => {
          const colour = [OCEAN, VERMILION, OCHRE][i]!;
          return [
            lifted(
              art(
                `d_atlas_cards_stamp${i + 1}`,
                at(s, 290, 488, 556),
                stamp(488, 556, colour, 20) +
                  `<rect x="30" y="30" width="428" height="148" fill="${colour}" fill-opacity=".09"/>` +
                  contours(
                    [{ x: 160, y: 104, rx: 112, ry: 48, seed: i * 1.9 + 0.5, levels: 6 }],
                    colour,
                    0.3,
                    1.2,
                  ),
              ),
              10,
              22,
              0.14,
            ),
            art(`d_atlas_cards_icon${i + 1}`, at(s + 58, 312, 156, 156), PICTOGRAMS[i]!(78, 80)),
          ];
        }),
        ...foot('cards').decorations,
      ],
    },
    {
      id: 'l_atlas_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head('timeline', 1100).placeholders,
        ...stops4.flatMap((s, i) => [
          place(`p_when${i + 1}`, 'number', at(s, 516, 380, 66), 'title', {
            color: token('primary'),
          }),
          place(`p_stop${i + 1}`, 'subtitle', at(s, 588, 380, 96), 'heading', { vAlign: 'bottom' }),
          place(`p_stop${i + 1}_body`, 'body', at(s, 692, 380, 166), 'body'),
        ]),
        place('p_note', 'caption', at(START + 38, 880, 1300, 72), 'caption'),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        neatline('d_atlas_timeline_frame', false),
        ...head('timeline', 1100).decorations,
        art(
          'd_atlas_timeline_flight',
          flight,
          `<path d="${flightPath}" stroke="${VERMILION}" stroke-width="2.6" stroke-dasharray="2 9" stroke-linecap="round"/>` +
            stopX
              .map(
                (x) =>
                  `<path d="M${r1(x)} ${r1(yAt(x) + 4)}V196" stroke="${INK}" stroke-opacity=".22" stroke-width="1.4" stroke-dasharray="1 5"/>` +
                  pinGlyph(r1(x), r1(yAt(x) - 30), 15),
              )
              .join('') +
            // The plane, past the last stop, flying on the way the slide reads.
            `<g transform="translate(${r1(flight.w - 20 - 0.985 * (flight.w - 40))} ${r1(arcY(0.985))}) rotate(${r1(-Math.atan2(arcY(0.985) - arcY(0.95), 0.035 * (flight.w - 40)) / RAD)})">` +
            `<path d="M-2 0L18 -3L28 -16L33 -16L28 -3L42 -2L47 -9L51 -9L48 0L51 9L47 9L42 2L28 3L33 16L28 16L18 3Z" fill="${INK}" transform="translate(-24 0) scale(-1 1) translate(-48 0)"/></g>`,
        ),
        art(
          'd_atlas_timeline_note_pin',
          at(START, 882, 24, 30),
          `<circle cx="12" cy="15" r="6" stroke="${VERMILION}" stroke-width="2.4"/>`,
        ),
        ...foot('timeline').decorations,
      ],
    },
    {
      id: 'l_atlas_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head('process', 1100).placeholders,
        ...steps5.flatMap((s, i) => [
          // The station's figure over it: a step's number, or a time, a share, a day.
          place(`p_station${i + 1}`, 'number', at(s, 304, 300, 74), 'title', {
            align: 'center',
            vAlign: 'bottom',
            color: i === 4 ? token('secondary') : token('primary'),
          }),
          place(`p_step${i + 1}`, 'subtitle', at(s, 470, 300, 96), 'heading', { align: 'center' }),
          place(`p_step${i + 1}_caption`, 'caption', at(s, 568, 300, 108), 'caption', {
            align: 'center',
          }),
        ]),
        place('p_note', 'body', at(START + 120, 722, 1360, 140), 'body', { vAlign: 'middle' }),
        ...foot('process').placeholders,
      ],
      decorations: [
        neatline('d_atlas_process_frame', false),
        ...head('process', 1100).decorations,
        art(
          'd_atlas_process_line',
          at(START, lineTop, WIDTH, 60),
          `<path d="M${r1(stationX[4]! - 110)} 30H${r1(stationX[4]! - 40)}" stroke="${OCEAN}" stroke-width="10" stroke-dasharray="10 8" stroke-opacity=".5"/>` +
            `<path d="M${r1(stationX[4]!)} 30H${r1(stationX[0]!)}" stroke="${OCEAN}" stroke-width="10" stroke-linecap="round"/>` +
            `<path d="M${r1(stationX[0]! + 40)} 30H${r1(stationX[0]! + 110)}" stroke="${OCEAN}" stroke-width="10" stroke-dasharray="10 8" stroke-opacity=".5"/>` +
            stationX
              .map((x, i) =>
                i === 4
                  ? `<circle cx="${r1(x)}" cy="30" r="25" fill="${WHITE}" stroke="${VERMILION}" stroke-width="7"/><circle cx="${r1(x)}" cy="30" r="9" fill="${VERMILION}"/>`
                  : `<circle cx="${r1(x)}" cy="30" r="22" fill="${WHITE}" stroke="${OCEAN}" stroke-width="7"/><circle cx="${r1(x)}" cy="30" r="6" fill="${OCEAN}"/>`,
              )
              .join(''),
        ),
        card('d_atlas_process_legend', at(START, 708, WIDTH, 168)),
        art(
          'd_atlas_process_legend_key',
          at(START + 30, 765, 60, 54),
          `<path d="M2 27H58" stroke="${OCEAN}" stroke-width="8"/><circle cx="30" cy="27" r="16" fill="${WHITE}" stroke="${OCEAN}" stroke-width="6"/>`,
        ),
        ...foot('process').decorations,
      ],
    },
    {
      id: 'l_atlas_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head('comparison', 1100).placeholders,
        ...(
          [
            ['before', at(START, 296, 780, 590)],
            ['after', atEnd(END, 296, 780, 590)],
          ] as const
        ).flatMap(([side, f]) => [
          place(
            `p_${side}_label`,
            'caption',
            { x: f.x + 40, y: f.y + 232, w: 700, h: 36 },
            'caption',
            {
              color: side === 'after' ? token('secondary') : token('muted'),
            },
          ),
          place(
            `p_${side}_title`,
            'subtitle',
            { x: f.x + 40, y: f.y + 272, w: 700, h: 50 },
            'heading',
          ),
          place(`p_${side}_body`, 'body', { x: f.x + 40, y: f.y + 330, w: 700, h: 244 }, 'body'),
        ]),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        neatline('d_atlas_comparison_frame', false),
        ...head('comparison', 1100).decorations,
        card('d_atlas_comparison_before', at(START, 296, 780, 590)),
        card('d_atlas_comparison_after', atEnd(END, 296, 780, 590)),
        (() => {
          // Five cities, each on its own: a loop of its own and nobody to share it with.
          const dots: [number, number][] = [
            [120, 120],
            [260, 70],
            [400, 150],
            [560, 80],
            [660, 160],
          ];
          return art(
            'd_atlas_comparison_alone',
            at(START + 20, 316, 740, 196),
            `<rect x="0" y="0" width="740" height="196" rx="8" fill="${INK}" fill-opacity=".04"/>` +
              contours(
                [{ x: 380, y: 104, rx: 320, ry: 74, seed: 1.1, levels: 4 }],
                MUTED,
                0.22,
                1.1,
              ) +
              dots
                .map(
                  ([x, y]) =>
                    `<circle cx="${x}" cy="${y}" r="26" stroke="${MUTED}" stroke-opacity=".6" stroke-width="2" stroke-dasharray="2 5"/>` +
                    `<circle cx="${x}" cy="${y}" r="8" fill="${MUTED}"/>`,
                )
                .join(''),
          );
        })(),
        (() => {
          const dots: [number, number][] = [
            [120, 120],
            [260, 70],
            [400, 150],
            [560, 80],
            [660, 160],
          ];
          const links: [number, number][] = [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 4],
            [0, 2],
            [2, 4],
            [1, 3],
          ];
          return art(
            'd_atlas_comparison_together',
            atEnd(END + 20, 316, 740, 196),
            `<rect x="0" y="0" width="740" height="196" rx="8" fill="${OCEAN}" fill-opacity=".07"/>` +
              contours(
                [{ x: 380, y: 104, rx: 320, ry: 74, seed: 1.1, levels: 4 }],
                OCEAN,
                0.22,
                1.1,
              ) +
              links
                .map(([a, b]) => {
                  const [x1, y1] = dots[a]!;
                  const [x2, y2] = dots[b]!;
                  const mx = (x1 + x2) / 2;
                  const my = Math.min(y1, y2) - 34;
                  return `<path d="M${x1} ${y1}Q${mx} ${my} ${x2} ${y2}" stroke="${VERMILION}" stroke-width="2.4" stroke-dasharray="2 6" stroke-linecap="round"/>`;
                })
                .join('') +
              dots
                .map(
                  ([x, y]) =>
                    `<circle cx="${x}" cy="${y}" r="16" fill="${VERMILION}" fill-opacity=".16"/><circle cx="${x}" cy="${y}" r="8" fill="${VERMILION}" stroke="${WHITE}" stroke-width="2"/>`,
                )
                .join(''),
          );
        })(),
        art(
          'd_atlas_comparison_arrow',
          atEnd(926, 380, 68, 68),
          `<circle cx="34" cy="34" r="32" fill="${WHITE}" stroke="${INK}" stroke-width="2"/><path d="M46 34H22M31 24L21 34L31 44" stroke="${VERMILION}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
        ),
        ...foot('comparison').decorations,
      ],
    },
    {
      id: 'l_atlas_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head('chart', 1080).placeholders,
        place('p_chart', 'chart', at(START + 38, 312, 1004, 484)),
        place('p_source', 'caption', at(START + 38, 804, 1004, 72), 'caption'),
        place('p_figure1', 'number', atEnd(END, 306, 480, 134), 'display', {
          color: token('primary'),
        }),
        place('p_figure1_body', 'body', atEnd(END, 444, 480, 124), 'body'),
        place('p_figure2', 'number', atEnd(END, 598, 480, 134), 'display', {
          color: token('secondary'),
        }),
        place('p_figure2_body', 'body', atEnd(END, 736, 480, 124), 'body'),
        ...foot('chart').placeholders,
      ],
      decorations: [
        neatline('d_atlas_chart_frame', false),
        ...head('chart', 1080).decorations,
        card('d_atlas_chart_panel', at(START, 290, 1080, 600)),
        rect('d_atlas_chart_rule', atEnd(END, 582, 480, 1.5), solid(token('text', 0.14))),
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_atlas_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head('table', 1200).placeholders,
        place('p_table', 'table', at(START + 38, 292, WIDTH - 76, 594)),
        place('p_note', 'caption', at(START + 38, 904, WIDTH - 38, 36), 'caption'),
        ...foot('table').placeholders,
      ],
      decorations: [
        neatline('d_atlas_table_frame', false),
        ...head('table', 1200).decorations,
        card('d_atlas_table_panel', at(START, 276, WIDTH, 618)),
        art(
          'd_atlas_table_band',
          at(START, 276, WIDTH, 10),
          Array.from({ length: 17 }, (_, i) =>
            i % 2
              ? ''
              : `<rect x="${r1((i * WIDTH) / 17)}" y="0" width="${r1(WIDTH / 17)}" height="10" fill="${INK}"/>`,
          ).join(''),
        ),
        art(
          'd_atlas_table_note_pin',
          at(START, 907, 24, 30),
          `<circle cx="12" cy="15" r="6" stroke="${VERMILION}" stroke-width="2.4"/>`,
        ),
        ...foot('table').decorations,
      ],
    },
    {
      id: 'l_atlas_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head('team', 1100).placeholders,
        ...team4.flatMap((s, i) => [
          place(`p_photo${i + 1}`, 'image', at(s + 30, 308, 300, 320)),
          place(`p_city${i + 1}`, 'caption', at(s, 688, 384, 70), 'caption', {
            color: token('primary'),
            vAlign: 'bottom',
          }),
          place(`p_name${i + 1}`, 'subtitle', at(s, 758, 384, 50), 'heading'),
          place(`p_role${i + 1}`, 'body', at(s, 810, 384, 132), 'body'),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: [
        neatline('d_atlas_team_frame', false),
        ...head('team', 1100).decorations,
        ...team4.flatMap((s, i) => [
          lifted(
            art(
              `d_atlas_team_stamp${i + 1}`,
              at(s, 280, 360, 376),
              stamp(360, 376, [OCEAN, VERMILION, OCHRE, SEA][i]!, 22),
            ),
            10,
            22,
            0.16,
          ),
          art(
            `d_atlas_team_postmark${i + 1}`,
            at(s - 34, 622, 150, 76),
            `<path d="M8 22q9 -8 18 0t18 0t18 0t18 0t18 0t18 0t18 0M8 38q9 -8 18 0t18 0t18 0t18 0t18 0t18 0t18 0M8 54q9 -8 18 0t18 0t18 0t18 0t18 0t18 0t18 0" stroke="${INK}" stroke-opacity=".42" stroke-width="2" stroke-linecap="round"/>`,
          ),
        ]),
        ...foot('team').decorations,
      ],
    },
    {
      id: 'l_atlas_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(START + 38, 262, 900, 36), 'caption', {
          color: token('primary'),
        }),
        place('p_title', 'title', at(START, 308, 900, 252), 'display'),
        ...[0, 1, 2].map((i) =>
          place(`p_line${i + 1}`, 'body', at(START + 56, 582 + i * 92, 840, 84), 'body', {
            vAlign: 'top',
          }),
        ),
        place('p_meta', 'caption', at(START + 46, 904, 900, 36), 'caption'),
      ],
      decorations: [
        neatline('d_atlas_closing_frame', true),
        upright('d_atlas_closing_globe', atEnd(140, 184, closingSize, closingSize), closingGlobe),
        kickerPin('d_atlas_closing_pin', 262),
        ...[0, 1, 2].map((i) =>
          art(
            `d_atlas_closing_key${i + 1}`,
            at(START, 586 + i * 92, 34, 34),
            [
              pinGlyph(17, 12, 10),
              `<rect x="3" y="6" width="28" height="25" rx="4" stroke="${INK}" stroke-width="2.4"/><path d="M3 13H31M10 3V9M24 3V9" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/><circle cx="23" cy="22" r="3" fill="${VERMILION}"/>`,
              `<circle cx="17" cy="17" r="14" stroke="${INK}" stroke-width="2.4"/><path d="M17 15V25" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><circle cx="17" cy="10" r="2" fill="${VERMILION}"/>`,
            ][i]!,
          ),
        ),
        art(
          'd_atlas_closing_route',
          at(START, 870, 840, 12),
          `<path d="M10 6H${840 - 14}" stroke="${VERMILION}" stroke-width="2" stroke-dasharray="2 7" stroke-linecap="round"/>` +
            `<circle cx="${840 - 7}" cy="6" r="5" fill="${VERMILION}"/><circle cx="6" cy="6" r="4.5" stroke="${VERMILION}" stroke-width="2"/>`,
        ),
        mark('d_atlas_closing_mark', at(START, 96, 46, 46)),
      ],
    },
  ];
}

/**
 * The layouts of a left-to-right deck: the mirrors, with the drawings that must not be seen
 * mirrored (the globe, the figures) moved across as they are.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  return drawn.map((layout) => {
    const mirrored = mirrorLayout(layout);
    return {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) => {
        if (!UPRIGHT.has(decoration.id) || decoration.type !== 'svg') return decoration;
        const { flipH: _flipH, ...rest } = decoration;
        const ltr = UPRIGHT.get(decoration.id);
        return ltr ? { ...rest, markup: ltr } : rest;
      }),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The sample: the annual report of an alliance of fourteen Mediterranean port cities

const TABLE_COLS = [280, 230, 290, 472, 300];
const TABLE_ROW = 80;
const NETWORK = [23, 29, 35, 41];
const BEST = [48, 55, 63, 71];

/** A text of one line, or of the lines it is given. */
const lines = (value: string | string[]) => text(...(Array.isArray(value) ? value : [value]));

/**
 * The leading of the titles and the quote where a script needs more than the theme's: the
 * vowel signs above and below Devanagari meet across lines set as tight as Latin display type.
 * The display titles of the opening, a part and the closing, and every other title.
 */
const LEADING: Partial<
  Record<ContentLanguage, { display: number; title: number; subtitle: number }>
> = {
  hi: { display: 1.18, title: 1.3, subtitle: 1.42 },
};
const DISPLAYED = new Set(['l_atlas_hero', 'l_atlas_section', 'l_atlas_closing']);

/** The sample deck in one language, from its copy. */
function sample(copy: AtlasCopy, lang: ContentLanguage): SampleSlide[] {
  const slides = drawSample(copy);
  const leading = LEADING[lang];
  if (!leading) return slides;
  return slides.map((slide) => {
    const content = { ...slide.content };
    const lineHeight = DISPLAYED.has(slide.layout) ? leading.display : leading.title;
    const roles = { title: lineHeight, quote: lineHeight, subtitle: leading.subtitle };
    for (const [role, value] of Object.entries(roles) as [keyof typeof roles, number][]) {
      // The subtitles of the opening and of a part, which run to two lines in a deep box.
      if (role === 'subtitle' && !DISPLAYED.has(slide.layout)) continue;
      const fill = content[role];
      if (fill && !Array.isArray(fill) && 'paragraphs' in fill) {
        content[role] = {
          paragraphs: fill.paragraphs.map((p) => ({ ...p, lineHeight: value })),
        };
      }
    }
    return { ...slide, content };
  });
}

function drawSample(copy: AtlasCopy): SampleSlide[] {
  const footer = text(copy.footer);
  return [
    {
      layout: 'l_atlas_hero',
      name: copy.hero.name,
      content: {
        caption: [text(copy.hero.org), text(copy.hero.meta)],
        title: text(...copy.hero.title),
        subtitle: text(...copy.hero.subtitle),
      },
    },
    {
      layout: 'l_atlas_section',
      name: copy.section.name,
      content: {
        number: text('01'),
        caption: text(copy.section.part),
        title: text(...copy.section.title),
        subtitle: text(copy.section.subtitle),
      },
    },
    {
      layout: 'l_atlas_text',
      name: copy.agenda.name,
      content: {
        title: lines(copy.agenda.title),
        body: {
          paragraphs: [
            para(copy.agenda.intro, { spaceAfter: 24 }),
            ...bullets(...copy.agenda.items).paragraphs.map((p) => ({ ...p, spaceAfter: 18 })),
          ],
        },
      },
    },
    {
      layout: 'l_atlas_big_number',
      name: copy.figures.name,
      content: {
        caption: [
          text(copy.figures.kicker),
          ...copy.figures.others.map(([, label]) => text(label)),
        ],
        title: lines(copy.figures.title),
        number: [
          text(copy.figures.hero.value),
          ...copy.figures.others.map(([value]) => text(value)),
        ],
        subtitle: text(copy.figures.hero.label),
        body: text(copy.figures.hero.note),
        footer,
      },
    },
    {
      layout: 'l_atlas_text_image',
      name: copy.project.name,
      content: {
        caption: text(copy.project.kicker),
        title: lines(copy.project.title),
        image: { assetId: pictures.plant.id },
        subtitle: copy.project.items.map(([title]) => text(title)),
        body: copy.project.items.map(([, body]) => text(body)),
        footer,
      },
    },
    {
      layout: 'l_atlas_full_image',
      name: copy.coast.name,
      content: {
        image: { assetId: pictures.coast.id },
        caption: text(copy.coast.place),
        title: text(...copy.coast.title),
        body: text(copy.coast.body),
      },
    },
    {
      layout: 'l_atlas_quote',
      name: copy.quote.name,
      content: {
        quote: text(copy.quote.text),
        attribution: text(copy.quote.who),
        caption: text(copy.quote.role),
        footer,
      },
    },
    {
      layout: 'l_atlas_cards',
      name: copy.programmes.name,
      content: {
        caption: [
          text(copy.programmes.kicker),
          ...copy.programmes.cards.map(([label]) => text(label)),
        ],
        title: lines(copy.programmes.title),
        subtitle: copy.programmes.cards.map(([, title]) => text(title)),
        body: [
          ...copy.programmes.cards.map(([, , body]) => text(body)),
          text(copy.programmes.note),
        ],
        footer,
      },
    },
    {
      layout: 'l_atlas_timeline',
      name: copy.milestones.name,
      content: {
        caption: [text(copy.milestones.kicker), text(copy.milestones.note)],
        title: lines(copy.milestones.title),
        number: copy.milestones.stops.map(([year]) => text(year)),
        subtitle: copy.milestones.stops.map(([, title]) => text(title)),
        body: copy.milestones.stops.map(([, , body]) => text(body)),
        footer,
      },
    },
    {
      layout: 'l_atlas_process',
      name: copy.joining.name,
      content: {
        caption: [
          text(copy.joining.kicker),
          ...copy.joining.steps.map(([, caption]) => text(caption)),
        ],
        title: lines(copy.joining.title),
        number: copy.joining.steps.map((_, i) => text(String(i + 1))),
        subtitle: copy.joining.steps.map(([step]) => text(step)),
        body: text(copy.joining.note),
        footer,
      },
    },
    {
      layout: 'l_atlas_comparison',
      name: copy.together.name,
      content: {
        caption: [
          text(copy.together.kicker),
          text(copy.together.before[0]),
          text(copy.together.after[0]),
        ],
        title: lines(copy.together.title),
        subtitle: [text(copy.together.before[1]), text(copy.together.after[1])],
        body: [text(copy.together.before[2]), text(copy.together.after[2])],
        footer,
      },
    },
    {
      layout: 'l_atlas_chart',
      name: copy.reuse.name,
      content: {
        caption: [text(copy.reuse.kicker), text(copy.reuse.source)],
        title: lines(copy.reuse.title),
        number: copy.reuse.figures.map(([value]) => text(value)),
        body: copy.reuse.figures.map(([, body]) => text(body)),
        footer,
      },
      chart: {
        chartType: 'column',
        data: {
          categories: ['2023', '2024', '2025', '2026'],
          series: [
            { name: copy.reuse.series[0], values: NETWORK },
            { name: copy.reuse.series[1], values: BEST },
          ],
        },
      },
    },
    {
      layout: 'l_atlas_table',
      name: copy.cities.name,
      content: {
        caption: [text(copy.cities.kicker), text(copy.cities.note)],
        title: lines(copy.cities.title),
        footer,
      },
      table: {
        cols: TABLE_COLS,
        rowHeight: TABLE_ROW,
        rows: [copy.cities.header, ...copy.cities.rows],
      },
    },
    {
      layout: 'l_atlas_team',
      name: copy.team.name,
      content: {
        caption: [text(copy.team.kicker), ...copy.team.people.map(([city]) => text(city))],
        title: lines(copy.team.title),
        image: pictures.team.map((p) => ({ assetId: p.id })),
        subtitle: copy.team.people.map(([, name]) => text(name)),
        body: copy.team.people.map(([, , role]) => text(role)),
        footer,
      },
    },
    {
      layout: 'l_atlas_closing',
      name: copy.closing.name,
      content: {
        caption: [text(copy.closing.kicker), text(copy.closing.meta)],
        title: text(...copy.closing.title),
        body: copy.closing.lines.map((line) => text(line)),
      },
    },
  ];
}

/** The sample decks of the template: one in every language its copy is written in. */
export const atlasSamples = Object.fromEntries(
  CONTENT_LANGUAGES.filter((lang) => ATLAS_COPY[lang]).map((lang) => [
    lang,
    sample(ATLAS_COPY[lang]!, lang),
  ]),
) as Localized<SampleSlide[]>;

/** The Atlas template: the theme, its layouts for both directions, and its sample deck. */
export function atlasTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(atlasTheme),
    description:
      'A modern atlas: warm paper in a map’s black-and-white border, a globe of great-circle routes, compass bezels, postage stamps and route lines, written in every language of the app.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([pictures.plant, pictures.coast, ...pictures.team]),
  };
  template.sample = sampleSlides(template, atlasSamples.he);
  return template;
}

export const entry = { id: 'atlas', template: atlasTemplate, samples: atlasSamples };
