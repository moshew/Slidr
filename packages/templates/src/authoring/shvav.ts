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
  pageNumber,
  para,
  place,
  points,
  rect,
  sampleSlides,
  solid,
  SURFACE,
  text,
  token,
  type SampleSlide,
  withObjects,
} from '../builtin/kit';
import { picture } from './pictures';
import { technologySamples } from './technology/samples';

/**
 * Shvav (Hebrew for a chip): the slide is a printed circuit board. A deep solder-mask green ground,
 * lit from the middle; copper traces that route around the content at 45 degrees, tented vias
 * under the mask, and the gold of what the mask leaves bare: pads, test points, fiducials,
 * mounting holes, the fingers of an edge connector. The lettering of the board is silkscreen
 * white, in mono (U1, TP3, J1). The key figures sit inside the packages of chips, the chart is
 * an oscilloscope's screen, the table a bill of materials beside a reel's carrier tape, the
 * process a signal chain of schematic symbols, the timeline one trace with a via at every
 * stage, the team a row of footprints. One LED glows, in the accent, where the slide is now.
 * For hardware, IoT, embedded and semiconductor decks: engineering reviews, EVT/DVT/PVT updates,
 * hardware pitches and lab results.
 *
 * The letters of the drawings are SVG text, so they are never counted as the slide's words, and
 * they read left to right in both directions: a drawing with letters is drawn for each direction
 * (its geometry mirrored, its letters not), and a left-to-right deck takes the second.
 */
export const shvavTheme: Theme = {
  id: 'shvav',
  name: 'Shvav',
  colors: {
    bg: '#0a3424',
    surface: '#114330',
    text: '#f3efe2',
    muted: '#a4c8b1',
    primary: '#e3b65a',
    secondary: '#8fe0a8',
    accent: '#ff7a52',
    chart: ['#e3b65a', '#8fe0a8', '#f3efe2', '#d98a4e', '#ff7a52', '#a4c8b1'],
  },
  // Assistant for the Hebrew, with Space Grotesk's engineered figures in the headings and Manrope
  // for the running text. No mono face: it would open every gap between Hebrew words. The mono
  // is the silkscreen of the drawings.
  fonts: {
    heading: { he: 'Assistant', latin: 'Space Grotesk' },
    body: { he: 'Assistant', latin: 'Manrope' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 112,
      weight: 800,
      lineHeight: 1.06,
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
    heading: { font: 'heading', size: 36, weight: 700, lineHeight: 1.2, color: { token: 'text' } },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 10,
  shadow: { x: 0, y: 16, blur: 40, color: { value: '#021109', alpha: 0.55 } },
  // The board under a lamp: the mask lighter where the light falls.
  background: {
    fill: { kind: 'solid', color: { token: 'bg' } },
    overlay: {
      kind: 'radial',
      center: { x: 0.5, y: 0.45 },
      stops: [
        { color: { token: 'surface', alpha: 0.85 }, at: 0 },
        { color: { token: 'surface', alpha: 0 }, at: 0.8 },
      ],
    },
  },
  backgroundVariants: [SURFACE, { fill: { kind: 'solid', color: { token: 'bg' } } }],
};

// ---------------------------------------------------------------------------------------------
// The colours of the drawings

const GOLD = '#e3b65a';
const LIGHT = '#8fe0a8';
const LED = '#ff7a52';
const INK = '#f3efe2';
const MUTED = '#a4c8b1';
const BG = '#0a3424';
const PANEL = '#114330';
/** The colours of the parts themselves: they stay what they are on every variant. */
const GOLD_HI = '#f7dc96';
const GOLD_DEEP = '#a8792c';
const EPOXY = '#161a19';
const EPOXY_HI = '#2e3532';
const LASER = '#858c88';
const TIN = '#bfc4c2';
const TIN_HI = '#eef0ef';
const HOLE = '#03100a';
const OPENING = '#062519';
const CERAMIC = '#a4835c';
const TANTALUM = '#e0a12c';

const PAINT = {
  [GOLD]: token('primary'),
  [LIGHT]: token('secondary'),
  [LED]: token('accent'),
  [INK]: token('text'),
  [MUTED]: token('muted'),
  [BG]: token('bg'),
  [PANEL]: token('surface'),
};

const MONO = 'font-family="\'JetBrains Mono\', ui-monospace, monospace"';
const SANS = "font-family=\"'Space Grotesk', 'Manrope', sans-serif\"";

/** The gradients of gold, tin and moulding compound, and the glow of the LED. */
const DEFS =
  `<defs>` +
  `<linearGradient id="au" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${GOLD_HI}"/><stop offset=".45" stop-color="${GOLD}"/><stop offset="1" stop-color="${GOLD_DEEP}"/></linearGradient>` +
  `<linearGradient id="sn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${TIN_HI}"/><stop offset=".6" stop-color="${TIN}"/><stop offset="1" stop-color="#8a908e"/></linearGradient>` +
  `<linearGradient id="ep" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="${EPOXY_HI}"/><stop offset=".35" stop-color="${EPOXY}"/><stop offset="1" stop-color="#0b0e0d"/></linearGradient>` +
  `<radialGradient id="glow"><stop offset="0" stop-color="${LED}" stop-opacity=".75"/><stop offset=".22" stop-color="${LED}" stop-opacity=".32"/><stop offset=".6" stop-color="${LED}" stop-opacity=".08"/><stop offset="1" stop-color="${LED}" stop-opacity="0"/></radialGradient>` +
  `<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>` +
  `</defs>`;

// ---------------------------------------------------------------------------------------------
// Drawings, and the letters in them

/**
 * The drawings that hold letters: the mirror of a left-to-right deck turns them back and takes
 * the drawing for that direction.
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

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A word of silkscreen (or of a chip's marking), placed in the drawing's own coordinates. */
interface Letter {
  x: number;
  y: number;
  t: string;
  size?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  weight?: number;
  op?: number;
  spacing?: number;
  sans?: boolean;
  /** Degrees; turned letters keep their anchor in the mirror. */
  rot?: number;
}

function letters(list: readonly Letter[], w: number, dir: Dir): string {
  return list
    .map((l) => {
      const mirror = dir === 'ltr';
      const x = mirror ? w - l.x : l.x;
      const a = l.anchor ?? 'start';
      const anchor =
        mirror && !l.rot ? (a === 'start' ? 'end' : a === 'end' ? 'start' : 'middle') : a;
      const rot = l.rot ? ` transform="rotate(${l.rot} ${f1(x)} ${l.y})"` : '';
      const spacing = l.spacing ? ` letter-spacing="${l.spacing}"` : '';
      const op = l.op !== undefined ? ` fill-opacity="${l.op}"` : '';
      return `<text x="${f1(x)}" y="${l.y}" text-anchor="${anchor}" ${l.sans ? SANS : MONO} font-size="${l.size ?? 20}" font-weight="${l.weight ?? 600}" fill="${l.fill ?? INK}"${op}${spacing}${rot}>${esc(l.t)}</text>`;
    })
    .join('');
}

/**
 * A drawing for both directions: the geometry is drawn for a right-to-left slide and mirrored
 * for the other; the letters change sides and keep reading.
 */
const art =
  (w: number, h: number, geometry: string, words: readonly Letter[] = []) =>
  (dir: Dir) =>
    svg(
      w,
      h,
      DEFS +
        (dir === 'rtl' ? geometry : `<g transform="matrix(-1 0 0 1 ${w} 0)">${geometry}</g>`) +
        letters(words, w, dir),
    );

/**
 * A part of a drawing of the whole board: what it draws, in slide pixels of a right-to-left
 * slide, and the box on the slide that holds it.
 */
interface Part {
  name: string;
  box: Frame;
  g: string;
  words?: readonly Letter[];
}

/**
 * The parts of a drawing of the whole board, each a drawing of its own in its box: the slide
 * holds them apart (ADR-094), so the chip, a bus of traces or a mounting hole is picked, moved
 * and deleted by itself, and a press on the bare board picks none of them. Each is drawn in the
 * coordinates of the whole slide, its box a window on them, so the parts meet as they were drawn.
 */
function parts(layout: string, list: readonly Part[]): Element[] {
  return list.map(({ name, box, g, words = [] }) =>
    lettered(`d_shvav_${layout}_${name}`, box, (dir) => {
      const x = dir === 'rtl' ? box.x : 1920 - box.x - box.w;
      const geometry = dir === 'rtl' ? g : `<g transform="matrix(-1 0 0 1 1920 0)">${g}</g>`;
      return (
        `<svg viewBox="${x} ${box.y} ${box.w} ${box.h}" fill="none" direction="ltr" unicode-bidi="isolate">` +
        `${DEFS}${geometry}${letters(words, 1920, dir)}</svg>`
      );
    }),
  );
}

const f1 = (n: number) => Math.round(n * 10) / 10;

type Pt = readonly [number, number];

/** A trace: a run of straight segments with round joins. */
function tr(points: readonly Pt[], o: { w?: number; c?: string; op?: number } = {}): string {
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${f1(x)} ${f1(y)}`).join('');
  return `<path d="${d}" stroke="${o.c ?? LIGHT}" stroke-opacity="${o.op ?? 0.24}" stroke-width="${o.w ?? 6}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Traces of copper under the mask, and the bare gold of the ones that carry the eye. */
const UNDER = { c: LIGHT, op: 0.24, w: 6 };
const BARE = { c: GOLD, op: 0.9, w: 7 };

/** A via under the mask: a ring of copper and a dimple. */
const tented = (x: number, y: number, r = 8) =>
  `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" stroke="${LIGHT}" stroke-opacity=".34" stroke-width="${f1(r * 0.55)}"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.3)}" fill="${HOLE}" fill-opacity=".55"/>`;

/** A bare via: a gold ring around the drilled hole. */
const goldVia = (x: number, y: number, r = 9) =>
  `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="url(#au)"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.42)}" fill="${HOLE}"/>`;

/** A test point: a gold disc with the dimple of a probe. */
const testPoint = (x: number, y: number, r = 11) =>
  `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="url(#au)"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.28)}" fill="${GOLD_DEEP}"/>`;

/** A fiducial: a gold dot in a clear ring of the mask. */
const fiducial = (x: number, y: number) =>
  `<circle cx="${x}" cy="${y}" r="17" fill="${OPENING}"/><circle cx="${x}" cy="${y}" r="7.5" fill="url(#au)"/>`;

/** A plated mounting hole, with its ring of stitching vias and its keep-out in silkscreen. */
function mountHole(x: number, y: number, s = 1): string {
  const stitch = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    return `<circle cx="${f1(x + Math.cos(a) * 22.5 * s)}" cy="${f1(y + Math.sin(a) * 22.5 * s)}" r="${f1(2.4 * s)}" fill="${HOLE}" fill-opacity=".7"/>`;
  }).join('');
  return (
    `<circle cx="${x}" cy="${y}" r="${f1(40 * s)}" stroke="${INK}" stroke-opacity=".32" stroke-width="2.5"/>` +
    `<circle cx="${x}" cy="${y}" r="${f1(29 * s)}" fill="url(#au)"/>${stitch}<circle cx="${x}" cy="${y}" r="${f1(16 * s)}" fill="${HOLE}"/>`
  );
}

/** A gold pad. */
const pad = (x: number, y: number, w: number, h: number, r = 3) =>
  `<rect x="${f1(x - w / 2)}" y="${f1(y - h / 2)}" width="${f1(w)}" height="${f1(h)}" rx="${r}" fill="url(#au)"/>`;

/** Silkscreen: a thin white line round a box. */
const silkBox = (x: number, y: number, w: number, h: number, op = 0.5, r = 0) =>
  `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(w)}" height="${f1(h)}" rx="${r}" stroke="${INK}" stroke-opacity="${op}" stroke-width="2.5"/>`;

/** Silkscreen corner brackets round a part. */
function brackets(x: number, y: number, w: number, h: number, k = 36, op = 0.55): string {
  const d =
    `M${x} ${y + k}V${y}H${x + k}M${x + w - k} ${y}H${x + w}V${y + k}` +
    `M${x + w} ${y + h - k}V${y + h}H${x + w - k}M${x + k} ${y + h}H${x}V${y + h - k}`;
  return `<path d="${d}" stroke="${INK}" stroke-opacity="${op}" stroke-width="3" stroke-linecap="square"/>`;
}

/**
 * A quad flat package: a body of moulding compound with `n` tinned legs a side, the dimple of
 * pin 1 at its top-start corner.
 */
function qfp(
  cx: number,
  cy: number,
  s: number,
  n: number,
  leg = { len: 30, w: 11 },
  dimple = true,
): string {
  const pitch = (s * 0.84) / (n - 1);
  const half = s / 2;
  let legs = '';
  for (let i = 0; i < n; i++) {
    const o = (i - (n - 1) / 2) * pitch;
    legs +=
      `<rect x="${f1(cx - half - leg.len)}" y="${f1(cy + o - leg.w / 2)}" width="${leg.len + 2}" height="${leg.w}" rx="1.5" fill="url(#sn)"/>` +
      `<rect x="${f1(cx + half - 2)}" y="${f1(cy + o - leg.w / 2)}" width="${leg.len + 2}" height="${leg.w}" rx="1.5" fill="url(#sn)"/>` +
      `<rect x="${f1(cx + o - leg.w / 2)}" y="${f1(cy - half - leg.len)}" width="${leg.w}" height="${leg.len + 2}" rx="1.5" fill="url(#sn)"/>` +
      `<rect x="${f1(cx + o - leg.w / 2)}" y="${f1(cy + half - 2)}" width="${leg.w}" height="${leg.len + 2}" rx="1.5" fill="url(#sn)"/>`;
  }
  const r = Math.max(4, s * 0.02);
  return (
    legs +
    `<rect x="${f1(cx - half)}" y="${f1(cy - half)}" width="${s}" height="${s}" rx="${f1(r)}" fill="url(#ep)"/>` +
    `<rect x="${f1(cx - half + 4)}" y="${f1(cy - half + 4)}" width="${s - 8}" height="${s - 8}" rx="${f1(r)}" stroke="#ffffff" stroke-opacity=".07" stroke-width="2"/>` +
    (dimple
      ? `<circle cx="${f1(cx - half + s * 0.11)}" cy="${f1(cy - half + s * 0.11)}" r="${f1(Math.max(4, s * 0.026))}" fill="#000000" fill-opacity=".5" stroke="#ffffff" stroke-opacity=".1"/>`
      : '')
  );
}

/** A package with legs along its two long sides only (an SOIC, laid on its side). */
function soic(
  x: number,
  y: number,
  w: number,
  h: number,
  n: number,
  leg = { len: 30, w: 20 },
): string {
  const pitch = (w * 0.92) / (n - 1);
  let legs = '';
  for (let i = 0; i < n; i++) {
    const lx = x + w / 2 + (i - (n - 1) / 2) * pitch - leg.w / 2;
    legs +=
      `<rect x="${f1(lx)}" y="${y - leg.len}" width="${leg.w}" height="${leg.len + 2}" rx="2" fill="url(#sn)"/>` +
      `<rect x="${f1(lx)}" y="${y + h - 2}" width="${leg.w}" height="${leg.len + 2}" rx="2" fill="url(#sn)"/>`;
  }
  return (
    legs +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="url(#ep)"/>` +
    `<rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="6" stroke="#ffffff" stroke-opacity=".07" stroke-width="2"/>`
  );
}

/** An SMD chip part: a capacitor (ceramic) or a resistor (black), with tinned ends. */
function passive(
  cx: number,
  cy: number,
  kind: 'cap' | 'res',
  vertical = false,
  l = 40,
  w = 20,
): string {
  const [L, Wd] = vertical ? [w, l] : [l, w];
  const end = l * 0.24;
  const body = kind === 'cap' ? CERAMIC : '#1a1c1b';
  const ends = vertical
    ? `<rect x="${f1(cx - Wd / 2 - 0)}" y="${f1(cy - l / 2)}" width="${Wd}" height="${f1(end)}" rx="2" fill="url(#sn)"/><rect x="${f1(cx - Wd / 2)}" y="${f1(cy + l / 2 - end)}" width="${Wd}" height="${f1(end)}" rx="2" fill="url(#sn)"/>`
    : `<rect x="${f1(cx - l / 2)}" y="${f1(cy - w / 2)}" width="${f1(end)}" height="${w}" rx="2" fill="url(#sn)"/><rect x="${f1(cx + l / 2 - end)}" y="${f1(cy - w / 2)}" width="${f1(end)}" height="${w}" rx="2" fill="url(#sn)"/>`;
  const pads = vertical
    ? pad(cx, cy - l / 2 + end / 2, Wd + 6, end + 8, 2) +
      pad(cx, cy + l / 2 - end / 2, Wd + 6, end + 8, 2)
    : pad(cx - l / 2 + end / 2, cy, end + 8, w + 6, 2) +
      pad(cx + l / 2 - end / 2, cy, end + 8, w + 6, 2);
  return (
    pads +
    `<rect x="${f1(cx - L / 2)}" y="${f1(cy - Wd / 2)}" width="${f1(L)}" height="${f1(Wd)}" rx="3" fill="${body}"/>` +
    ends
  );
}

/** The LED, lit: its glow, its pads, its white housing and the lens. */
function led(cx: number, cy: number, glow = 96): string {
  return (
    `<circle cx="${cx}" cy="${cy}" r="${glow}" fill="url(#glow)"/>` +
    pad(cx - 17, cy, 12, 22, 2) +
    pad(cx + 17, cy, 12, 22, 2) +
    `<rect x="${cx - 16}" y="${cy - 10}" width="32" height="20" rx="3" fill="#efece4"/>` +
    `<rect x="${cx - 9}" y="${cy - 7}" width="18" height="14" rx="3" fill="${LED}"/>` +
    `<rect x="${cx - 6}" y="${cy - 5}" width="9" height="5" rx="2" fill="#fff6ec" fill-opacity=".9"/>`
  );
}

/** A crystal in its metal can. */
const crystal = (cx: number, cy: number, w = 84, h = 38) =>
  pad(cx - w / 2 + 6, cy, 18, h + 8, 2) +
  pad(cx + w / 2 - 6, cy, 18, h + 8, 2) +
  `<rect x="${cx - w / 2 + 4}" y="${cy - h / 2}" width="${w - 8}" height="${h}" rx="7" fill="url(#sn)"/>` +
  `<rect x="${cx - w / 2 + 12}" y="${cy - h / 2 + 7}" width="${w - 24}" height="${h - 14}" rx="4" stroke="#7d8381" stroke-opacity=".7" stroke-width="2"/>`;

/** A tantalum capacitor: an amber body with its polarity band. */
const tantalum = (cx: number, cy: number) =>
  pad(cx - 34, cy, 18, 30, 2) +
  pad(cx + 34, cy, 18, 30, 2) +
  `<rect x="${cx - 32}" y="${cy - 22}" width="64" height="44" rx="6" fill="${TANTALUM}"/>` +
  `<rect x="${cx - 32}" y="${cy - 22}" width="14" height="44" rx="3" fill="#7a4a12"/>`;

/** A data matrix in silkscreen: the serial number every board carries. */
function dataMatrix(x: number, y: number, n = 14, m = 8): string {
  let seed = 41;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let cells = '';
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const finder = i === 0 || j === n - 1;
      const timing = (j === 0 && i % 2 === 0) || (i === n - 1 && j % 2 === 1);
      if (finder || timing || (i > 0 && j > 0 && i < n - 1 && j < n - 1 && rnd() > 0.52)) {
        cells += `<rect x="${x + i * m}" y="${y + j * m}" width="${m}" height="${m}"/>`;
      }
    }
  }
  return `<g fill="${INK}" fill-opacity=".72">${cells}</g>`;
}

// ---------------------------------------------------------------------------------------------
// What the layouts share

/** The start of the text column (from the right of a right-to-left slide), and the end margin. */
const START = 128;
const END = 96;
const WIDTH = 1920 - START - END;
/** The x of the start edge of the text column, in slide pixels of a right-to-left slide. */
const SX = 1920 - START;
/** The top of the footer's line, and the y of the trace under it that joins the mark to the number. */
const FOOT = 960;
/** The top of a content slide's kicker; the title under it has room for two lines, to 266. */
const KICKER = 84;
const NET_Y = FOOT + 62;

/** The ground of a content slide: the mask lit from where the content is, darker at the edges. */
function ground(x = 0.5, y = 0.45): Background {
  return {
    fill: {
      kind: 'radial',
      center: { x, y },
      stops: [
        { color: token('surface'), at: 0 },
        { color: token('bg'), at: 0.72 },
      ],
    },
    overlay: {
      kind: 'radial',
      center: { x: 0.5, y: 0.5 },
      stops: [
        { color: { value: '#000000', alpha: 0 }, at: 0.5 },
        { color: { value: '#000000', alpha: 0.3 }, at: 1 },
      ],
    },
  };
}

/** The test point before a kicker, fed by a trace that drops in from the board's edge. */
const kickerPad = (id: string, top: number) =>
  drawing(
    id,
    at(START, 0, 22, top + 22),
    svg(
      22,
      top + 22,
      DEFS +
        tr(
          [
            [11, -10],
            [11, top + 2],
          ],
          { ...UNDER, op: 0.34, w: 5 },
        ) +
        testPoint(11, top + 11, 10),
    ),
    PAINT,
  );

/**
 * The head of a content slide: the kicker on its test point, and the title. `lines` is the room
 * the title has.
 */
function head(name: string, width = 1400, lines = 2, net = true) {
  return {
    placeholders: [
      place(
        'p_kicker',
        'caption',
        at(START + 44, KICKER, Math.min(900, width - 44), 34),
        'caption',
      ),
      place('p_title', 'title', at(START, KICKER + 38, width, 72 * lines), 'title'),
    ],
    decorations: [
      net
        ? kickerPad(`d_shvav_${name}_kicker_pad`, KICKER + 6)
        : drawing(
            `d_shvav_${name}_kicker_pad`,
            at(START, KICKER + 6, 22, 22),
            svg(22, 22, DEFS + testPoint(11, 11, 10)),
            PAINT,
          ),
    ],
  };
}

/** The mark: a small QFN, gold pads round a black body. */
const mark = (id: string, frame: Frame) =>
  drawing(
    id,
    frame,
    svg(
      40,
      40,
      DEFS +
        [0, 1, 2]
          .map((i) => {
            const o = 12 + i * 8;
            return `<rect x="${o - 2}" y="1" width="4" height="7" rx="1" fill="${GOLD}"/><rect x="${o - 2}" y="32" width="4" height="7" rx="1" fill="${GOLD}"/><rect x="1" y="${o - 2}" width="7" height="4" rx="1" fill="${GOLD}"/><rect x="32" y="${o - 2}" width="7" height="4" rx="1" fill="${GOLD}"/>`;
          })
          .join('') +
        `<rect x="7" y="7" width="26" height="26" rx="4" fill="url(#ep)" stroke="${GOLD}" stroke-opacity=".35" stroke-width="1.2"/><circle cx="13.5" cy="13.5" r="2.6" fill="${GOLD}"/>`,
    ),
    PAINT,
    { role: 'logo', name: 'logo' },
  );

/**
 * The foot of a content slide: the mark, the deck's name, and the slide's number on a gold pad
 * at the end (SLD-04). One trace under the mask joins the mark to the pad.
 */
function foot(name: string) {
  return {
    placeholders: [place('p_footer', 'footer', at(START + 60, FOOT, 900, 34), 'caption')],
    decorations: [
      drawing(
        `d_shvav_${name}_foot_net`,
        at(0, FOOT + 10, 1920, 80),
        svg(
          1920,
          80,
          tr(
            [
              [SX - 20, 26],
              [SX - 20, 34],
              [SX - 38, 52],
              [END + 62, 52],
              [END + 44, 34],
              [END + 44, 30],
            ],
            { ...UNDER, op: 0.3, w: 5 },
          ) +
            tented(SX - 220, 52, 7) +
            tented(980, 52, 7),
        ),
        PAINT,
      ),
      mark(`d_shvav_${name}_mark`, at(START, FOOT - 3, 40, 40)),
      rect(`d_shvav_${name}_folio`, atEnd(END, FOOT - 6, 88, 46), solid(token('primary')), {
        effects: { radius: 8 },
      }),
      pageNumber(`d_shvav_${name}_number`, atEnd(END, FOOT, 88, 34), 'caption', {
        color: token('bg'),
        weight: 700,
        align: 'center',
      }),
      drawing(
        `d_shvav_${name}_fiducial`,
        atEnd(36, 36, 40, 40),
        svg(40, 40, DEFS + fiducial(20, 20)),
        PAINT,
      ),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// The opening: the microcontroller, its fan-out, and the fingers of the edge connector

function heroArt(): Part[] {
  const cx = 400;
  const cy = 430;
  const s = 330;
  const pitch = (s * 0.84) / 11;
  const o = (i: number) => (i - 5.5) * pitch;
  let g = '';
  let bus = '';
  // Left: every pin fans out to the edge, the outer ones bending most.
  for (let i = 0; i < 12; i++) {
    const y = cy + o(i);
    const up = i < 6;
    const d = up ? (5 - i) * 12 : (i - 6) * 12;
    const yy = up ? y - d : y + d;
    if (i === 2 || i === 9)
      g +=
        tr(
          [
            [205, y],
            [175, y],
            [175 - d, yy],
            [104, yy],
          ],
          UNDER,
        ) + tented(96, yy);
    else
      g += tr(
        [
          [205, y],
          [175, y],
          [175 - d, yy],
          [-10, yy],
        ],
        UNDER,
      );
  }
  // Top: up and off the board.
  for (let i = 0; i < 12; i++) {
    const x = cx + o(i);
    const left = i < 6;
    const d = left ? (5 - i) * 12 : (i - 6) * 12;
    const xx = left ? x - d : x + d;
    g += tr(
      [
        [x, 235],
        [x, 205],
        [xx, 205 - d],
        [xx, -10],
      ],
      UNDER,
    );
  }
  // Right, above: escape vias in two staggered rows.
  for (let i = 0; i < 6; i++) {
    const y = cy + o(i);
    const x = 622 + (i % 2) * 30;
    g +=
      tr(
        [
          [595, y],
          [x, y],
        ],
        BARE,
      ) + goldVia(x + 6, y, 8);
  }
  for (const i of [6, 7]) {
    const y = cy + o(i);
    const x = 628 + (i % 2) * 30;
    g +=
      tr(
        [
          [595, y],
          [x, y],
        ],
        UNDER,
      ) + tented(x + 6, y, 8);
  }
  // Right, below: a bus of four that runs out under the words to the meta line.
  for (let i = 8; i < 12; i++) {
    const y = cy + o(i);
    const xt = 615 + (11 - i) * 6;
    const b = 776 + (i - 8) * 22;
    const xd = xt + (b - y);
    if (i === 11) {
      bus += tr(
        [
          [595, y],
          [xt, y],
          [xd, b],
          [SX - 70, b],
          [SX - 11, b + 59],
        ],
        BARE,
      );
    } else {
      const xe = SX - 150 - (10 - i) * 46;
      bus +=
        tr(
          [
            [595, y],
            [xt, y],
            [xd, b],
            [xe, b],
          ],
          BARE,
        ) + goldVia(xe + 8, b, 8);
    }
  }
  // Bottom: ten pins to the ten fingers, and the two outer ones to vias.
  for (let k = 0; k < 10; k++) {
    const x = cx + o(k + 1);
    const fx = 150 + k * 56;
    g += tr(
      [
        [x, 625],
        [x, 660],
        [fx, 660 + Math.abs(fx - x)],
        [fx, 980],
      ],
      BARE,
    );
  }
  g +=
    tr(
      [
        [cx + o(0), 625],
        [cx + o(0), 650],
        [cx + o(0) - 30, 680],
      ],
      BARE,
    ) + goldVia(cx + o(0) - 30, 680, 9);
  g +=
    tr(
      [
        [cx + o(11), 625],
        [cx + o(11), 650],
        [cx + o(11) + 30, 680],
      ],
      BARE,
    ) + goldVia(cx + o(11) + 30, 680, 9);
  // The edge connector: gold fingers off the bottom of the board, and its keep-out line.
  g += `<path d="M118 946H686" stroke="${INK}" stroke-opacity=".35" stroke-width="2.5" stroke-dasharray="10 8"/>`;
  for (let k = 0; k < 10; k++) {
    const fx = 150 + k * 56;
    g += `<rect x="${fx - 18}" y="966" width="36" height="140" rx="7" fill="url(#au)"/><rect x="${fx - 12}" y="972" width="7" height="100" rx="3" fill="#ffffff" fill-opacity=".18"/>`;
  }
  // The parts round the microcontroller.
  g += crystal(120, 150) + passive(84, 206, 'cap') + passive(134, 206, 'cap');
  g +=
    tr(
      [
        [78, 150],
        [52, 150],
        [40, 162],
      ],
      UNDER,
    ) +
    tr(
      [
        [162, 150],
        [180, 150],
      ],
      UNDER,
    );
  g +=
    led(742, 172) +
    passive(742, 232, 'res') +
    tr(
      [
        [722, 232],
        [700, 232],
        [688, 244],
        [688, 262],
      ],
      UNDER,
    ) +
    tented(688, 268, 7);
  g += tr(
    [
      [759, 172],
      [800, 172],
      [812, 160],
      [812, -10],
    ],
    UNDER,
  );
  g +=
    testPoint(100, 760, 14) +
    tr(
      [
        [100, 774],
        [100, 820],
        [118, 838],
      ],
      UNDER,
    ) +
    tented(124, 844, 7);
  g +=
    passive(700, 900, 'cap') +
    passive(760, 900, 'cap') +
    tr(
      [
        [680, 900],
        [660, 900],
      ],
      UNDER,
    );
  // The chip itself, its silkscreen and pin 1.
  g += qfp(cx, cy, s, 12) + brackets(cx - s / 2 - 46, cy - s / 2 - 46, s + 92, s + 92, 40);
  g += `<circle cx="${cx - s / 2 - 58}" cy="${cy - s / 2 - 58}" r="6" fill="${INK}" fill-opacity=".7"/>`;
  // The board's own marks: holes, fiducials, the kicker's and the meta line's test points.
  g += mountHole(64, 64) + fiducial(62, 934);
  const kicker =
    tr(
      [
        [SX - 11, -10],
        [SX - 11, 293],
      ],
      { ...UNDER, op: 0.34, w: 5 },
    ) + testPoint(SX - 11, 303, 10);
  bus += testPoint(SX - 11, 901, 10);
  const words: Letter[] = [
    {
      x: cx,
      y: cy - 36,
      t: 'SHVAV',
      size: 54,
      sans: true,
      weight: 700,
      fill: LASER,
      anchor: 'middle',
      spacing: 8,
    },
    { x: cx, y: cy + 22, t: 'SV32-L4  LoRa', size: 25, fill: LASER, anchor: 'middle', weight: 500 },
    { x: cx, y: cy + 62, t: '2648 · A3', size: 22, fill: LASER, anchor: 'middle', weight: 500 },
    { x: cx + s / 2 + 46, y: cy - s / 2 - 62, t: 'U1', size: 24, anchor: 'end' },
    { x: 120, y: 118, t: 'Y1', size: 20, anchor: 'middle', op: 0.75 },
    { x: 742, y: 132, t: 'D1', size: 20, anchor: 'middle', op: 0.75 },
    { x: 772, y: 239, t: 'R12', size: 18, anchor: 'start', op: 0.7 },
    { x: 100, y: 735, t: 'TP3', size: 18, anchor: 'middle', op: 0.75 },
    { x: 104, y: 1010, t: 'J1', size: 22, anchor: 'end' },
    { x: 730, y: 940, t: 'C7 C8', size: 18, anchor: 'middle', op: 0.6 },
  ];
  // The bus runs under the chip's legs, as it was drawn before them.
  return [
    { name: 'bus', box: atEnd(585, 485, 1215, 430), g: bus },
    { name: 'board', box: atEnd(0, 0, 850, 1080), g, words },
    { name: 'kicker_net', box: atEnd(1766, 0, 30, 320), g: kicker },
    ...corners(),
  ];
}

/** The marks in the far corners of an opening board: a mounting hole and a fiducial. */
const corners = (): Part[] => [
  { name: 'hole', box: atEnd(1806, 966, 92, 92), g: mountHole(1852, 1012) },
  { name: 'fiducial', box: atEnd(1836, 40, 44, 44), g: fiducial(1858, 62) },
];

// ---------------------------------------------------------------------------------------------
// The number of a part, in a big package

function sectionArt(): Part[] {
  const cx = 400;
  const cy = 540;
  const s = 400;
  const n = 14;
  const pitch = (s * 0.84) / (n - 1);
  const o = (i: number) => (i - (n - 1) / 2) * pitch;
  const half = s / 2;
  const len = 34;
  let g = '';
  for (let i = 0; i < n; i++) {
    const firstHalf = i < n / 2;
    const d = firstHalf ? (6 - i) * 12 : (i - 7) * 12;
    // Left, to the edge.
    const y = cy + o(i);
    const yy = firstHalf ? y - d : y + d;
    g += tr(
      [
        [cx - half - len, y],
        [cx - half - 64, y],
        [cx - half - 64 - d, yy],
        [-10, yy],
      ],
      UNDER,
    );
    // Top and bottom, off the board.
    const x = cx + o(i);
    const xx = firstHalf ? x - d : x + d;
    g += tr(
      [
        [x, cy - half - len],
        [x, cy - half - 64],
        [xx, cy - half - 64 - d],
        [xx, -10],
      ],
      UNDER,
    );
    g += tr(
      [
        [x, cy + half + len],
        [x, cy + half + 64],
        [xx, cy + half + 64 + d],
        [xx, 1090],
      ],
      i % 3 === 1 ? BARE : UNDER,
    );
    // Right: the upper half turns up, the lower half down, before the words begin.
    const xt = firstHalf ? 652 + i * 22 : 652 + (n - 1 - i) * 22;
    g += firstHalf
      ? tr(
          [
            [cx + half + len, y],
            [xt - 12, y],
            [xt, y - 12],
            [xt, -10],
          ],
          i % 2 ? UNDER : BARE,
        )
      : tr(
          [
            [cx + half + len, y],
            [xt - 12, y],
            [xt, y + 12],
            [xt, 1090],
          ],
          i % 2 ? BARE : UNDER,
        );
  }
  g += qfp(cx, cy, s, n, { len, w: 11 });
  g += brackets(cx - half - 50, cy - half - 50, s + 100, s + 100, 44);
  g += `<circle cx="${cx - half - 62}" cy="${cy - half - 62}" r="6" fill="${INK}" fill-opacity=".7"/>`;
  g += mountHole(64, 64) + fiducial(62, 1016);
  const kicker =
    tr(
      [
        [SX - 11, -10],
        [SX - 11, 373],
      ],
      { ...UNDER, op: 0.34, w: 5 },
    ) + testPoint(SX - 11, 383, 10);
  const words: Letter[] = [
    {
      x: cx,
      y: cy - half + 62,
      t: 'SHVAV',
      size: 30,
      sans: true,
      weight: 700,
      fill: LASER,
      anchor: 'middle',
      spacing: 6,
    },
    {
      x: cx,
      y: cy + half - 34,
      t: '2648 · A3',
      size: 20,
      fill: LASER,
      anchor: 'middle',
      weight: 500,
    },
    { x: cx - half - 50, y: cy - half - 72, t: 'U2', size: 24, anchor: 'start' },
  ];
  return [
    { name: 'chip', box: atEnd(0, 0, 800, 1080), g, words },
    { name: 'kicker_net', box: atEnd(1766, 0, 30, 400), g: kicker },
    ...corners(),
  ];
}

// ---------------------------------------------------------------------------------------------
// The key figure in a long package, and test points down the side

const STATS = [300, 510, 720];

function bigNumberArt(): Part[] {
  const x = SX - 1040;
  const y = 344;
  const w = 1040;
  const h = 246;
  const n = 20;
  const pitch = (w * 0.92) / (n - 1);
  let g = '';
  for (let i = 0; i < n; i++) {
    const px = x + w / 2 + (i - (n - 1) / 2) * pitch;
    const vy = i % 2 ? y - 64 : y - 50;
    g +=
      tr(
        [
          [px, y - 30],
          [px, vy],
        ],
        UNDER,
      ) + tented(px, vy - 4, 7);
  }
  g += soic(x, y, w, h, n);
  g += `<circle cx="${x + 30}" cy="${y + 30}" r="7" fill="#000000" fill-opacity=".5" stroke="#ffffff" stroke-opacity=".1"/>`;
  // The test points: on one trace down the side, which joins the foot's net.
  let probes = tr(
    [
      [650, STATS[0]! + 40],
      [650, NET_Y],
    ],
    { ...BARE, w: 6 },
  );
  for (const top of STATS) probes += testPoint(650, top + 40, 13);
  const kicker = tr(
    [
      [SX - 11, -10],
      [SX - 11, KICKER + 6],
    ],
    { ...UNDER, op: 0.34, w: 5 },
  );
  const words: Letter[] = [
    {
      x: x + 52,
      y: y + 40,
      t: 'SHVAV',
      size: 26,
      sans: true,
      weight: 700,
      fill: LASER,
      spacing: 5,
    },
    { x: x + 52, y: y + h - 26, t: '2648 · A3', size: 18, fill: LASER, weight: 500 },
    { x: x - 12, y: y - 40, t: 'U1', size: 22, anchor: 'end' },
  ];
  const points = STATS.map((top, i) => ({
    x: 674,
    y: top + 47,
    t: `TP${i + 1}`,
    size: 18,
    op: 0.75,
  }));
  return [
    { name: 'chip', box: atEnd(700, 262, 1100, 366), g, words },
    { name: 'kicker_net', box: atEnd(1766, 0, 30, 100), g: kicker },
    // Last: the layout draws it after the foot (`l_shvav_big_number`).
    { name: 'probes', box: atEnd(630, 320, 90, NET_Y + 10 - 320), g: probes, words: points },
  ];
}

// ---------------------------------------------------------------------------------------------
// The quote: a block of silkscreen, and quotation marks that are vias with teardrops

/** Two teardrops: a gold via with a tapered tail, drawn as the quote mark of each direction. */
function teardrops(dir: Dir): string {
  const one = (cx: number, cy: number, r: number) => {
    // A "9": the head above, the tail down to the start side; for English, the "6" of an
    // opening mark, turned.
    const p =
      `M${f1(cx + r)} ${cy}A${r} ${r} 0 1 0 ${f1(cx - r * 0.2)} ${f1(cy + r * 0.98)}` +
      `Q${f1(cx + r * 0.05)} ${f1(cy + r * 1.7)} ${f1(cx - r * 0.75)} ${f1(cy + r * 2.35)}` +
      `Q${f1(cx + r * 1.05)} ${f1(cy + r * 1.6)} ${f1(cx + r)} ${cy}Z`;
    const turn = dir === 'ltr' ? ` transform="rotate(180 ${cx} ${f1(cy + r * 0.68)})"` : '';
    return `<g${turn}><path d="${p}" fill="url(#au)"/><circle cx="${cx}" cy="${cy}" r="${f1(r * 0.4)}" fill="${HOLE}"/></g>`;
  };
  return svg(120, 100, DEFS + one(32, 30, 24) + one(88, 30, 24));
}

function quoteArt(): Part[] {
  const x0 = 112;
  const y0 = 168;
  const x1 = 1808;
  const y1 = 852;
  let g = silkBox(x0, y0, x1 - x0, y1 - y0, 0.42);
  // The tab of the note, in silkscreen with its letters knocked out.
  g += `<rect x="${x1 - 196}" y="${y0 - 18}" width="160" height="36" rx="3" fill="${INK}" fill-opacity=".85"/>`;
  for (const [cx, cy] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ] as const)
    g += pad(cx, cy, 18, 18, 2);
  g += tr(
    [
      [x0, y0],
      [x0 - 52, y0 - 52],
      [-10, y0 - 52],
    ],
    UNDER,
  );
  g += tr(
    [
      [x1, y1],
      [x1 + 52, y1 + 52],
      [1930, y1 + 52],
    ],
    UNDER,
  );
  g += tr(
    [
      [x0, y1],
      [x0 - 40, y1 + 40],
      [-10, y1 + 40],
    ],
    UNDER,
  );
  g +=
    tr(
      [
        [x1, y0],
        [x1, y0 - 70],
        [x1 + 30, y0 - 100],
      ],
      UNDER,
    ) + tented(x1 + 36, y0 - 106, 7);
  // A rule before the speaker: a short trace between two vias.
  const rule =
    tr(
      [
        [SX - 196, 652],
        [SX - 316, 652],
      ],
      BARE,
    ) +
    goldVia(SX - 192, 652, 8) +
    goldVia(SX - 320, 652, 8);
  // The serial number of the board, in the corner of the block.
  const serial = dataMatrix(x0 + 44, y1 - 44 - 112);
  return [
    {
      name: 'block',
      box: atEnd(0, 48, 1920, 864),
      g,
      words: [
        { x: x1 - 116, y: y0 + 7, t: 'NOTE 1', size: 19, fill: BG, anchor: 'middle', weight: 700 },
      ],
    },
    { name: 'rule', box: atEnd(SX - 334, 638, 156, 28), g: rule },
    {
      name: 'serial',
      box: atEnd(x0 + 38, y1 - 162, 280, 124),
      g: serial,
      words: [
        { x: x0 + 44 + 112 + 18, y: y1 - 50, t: 'SN 2648-0417', size: 17, op: 0.6 },
        { x: x0 + 44 + 112 + 18, y: y1 - 74, t: 'PCB-04L · 1.6', size: 17, op: 0.45 },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The text: a module from margin to margin, castellated down both sides

/** The module of the text slide: from the start margin to the end one, down to over the foot. */
const MODULE = at(START, 236, WIDTH, 690);

/**
 * The castellations of the module's two sides, half holes plated in gold down each edge, and
 * the traces that run from every other one off the board; a part each side.
 */
function moduleSides(): Part[] {
  const [l, r] = [MODULE.x, MODULE.x + MODULE.w];
  const rows = Array.from({ length: 12 }, (_, k) => MODULE.y + 44 + k * 55);
  const side = (x: number, out: number) => {
    let g = '';
    rows.forEach((y, j) => {
      if (j % 3 !== 1)
        g += tr(
          [
            [x + out * 14, y],
            [out > 0 ? 1930 : -10, y],
          ],
          j % 2 ? UNDER : { ...BARE, w: 5, op: 0.6 },
        );
      g += `<rect x="${f1(out > 0 ? x - 4 : x - 16)}" y="${y - 11}" width="20" height="22" rx="2" fill="url(#au)"/>`;
      g += `<circle cx="${x}" cy="${y}" r="11" fill="url(#au)"/><path d="M${x} ${y - 6}A6 6 0 0 ${out > 0 ? 0 : 1} ${x} ${y + 6}Z" fill="${HOLE}"/>`;
    });
    return g;
  };
  const top = rows[0]! - 14;
  const height = rows[rows.length - 1]! + 14 - top;
  return [
    { name: 'castellations_start', box: atEnd(r - 18, top, 1920 - r + 18, height), g: side(r, 1) },
    { name: 'castellations_end', box: atEnd(0, top, l + 18, height), g: side(l, -1) },
  ];
}

/**
 * The parts along the foot of the module, at its end corner and clear of the text: the crystal,
 * two passives, the microcontroller, and the LED, lit, where the slide is now.
 */
function moduleParts(): Part {
  const l = MODULE.x;
  const y = MODULE.y + MODULE.h - 40;
  const g =
    `<path d="M${l + 36} ${y - 28}H${l + 420}" stroke="${INK}" stroke-opacity=".14" stroke-width="2" stroke-dasharray="8 8"/>` +
    crystal(l + 84, y, 50, 22) +
    passive(l + 150, y, 'cap', false, 30, 15) +
    passive(l + 196, y, 'res', false, 30, 15) +
    tr(
      [
        [l + 212, y],
        [l + 246, y],
      ],
      { ...UNDER, w: 4 },
    ) +
    qfp(l + 276, y, 36, 6, { len: 6, w: 4 }) +
    tr(
      [
        [l + 306, y],
        [l + 350, y],
      ],
      { ...UNDER, w: 4 },
    ) +
    led(l + 376, y, 34);
  return { name: 'parts', box: atEnd(l + 20, y - 38, 400, MODULE.y + MODULE.h - (y - 38)), g };
}

// ---------------------------------------------------------------------------------------------
// The picture of the board, framed by its courtyard

const PHOTO = atEnd(END + 24, 120, 680, 790);

function photoFrameArt() {
  // In the drawing's own box, which reaches 64 past the picture on every side but the foot: it
  // stops short of the foot of the slide, which frames every slide and is not the slide's.
  const w = 808;
  const h = 890;
  const [x0, y0, x1, y1] = [64, 64, 744, 854];
  let g = silkBox(x0 - 22, y0 - 22, x1 - x0 + 44, y1 - y0 + 44, 0.42);
  const k = 48;
  const b = 12;
  const L = (x: number, y: number, dx: number, dy: number) =>
    `<path d="M${x + dx * k} ${y}H${x}V${y + dy * k}" stroke="${GOLD}" stroke-width="5" stroke-linecap="square"/>`;
  g +=
    L(x0 - b, y0 - b, 1, 1) +
    L(x1 + b, y0 - b, -1, 1) +
    L(x0 - b, y1 + b, 1, -1) +
    L(x1 + b, y1 + b, -1, -1);
  g += fiducial(w - 20, 20);
  const words: Letter[] = [
    { x: x0 - 22, y: 30, t: 'TOP SIDE', size: 18, anchor: 'start', op: 0.7 },
  ];
  return art(w, h, g, words);
}

/** A numbered pad before a point. */
const numberPad = (id: string, frame: Frame, n: number) =>
  lettered(
    id,
    frame,
    svg(
      48,
      48,
      DEFS +
        `<rect x="1" y="1" width="46" height="46" rx="8" fill="url(#au)"/>` +
        `<text x="24" y="33" text-anchor="middle" ${MONO} font-size="26" font-weight="700" fill="${BG}">${n}</text>`,
    ),
  );

// ---------------------------------------------------------------------------------------------
// Under the full picture: the castellations of a module, the fingers of the edge

function fullImageArt(): Part[] {
  let row = '';
  for (let x = SX - 11; x > -20; x -= 64) {
    row += `<circle cx="${x}" cy="640" r="15" fill="url(#au)"/><circle cx="${x}" cy="640" r="6.5" fill="${HOLE}"/>`;
  }
  const probe =
    tr(
      [
        [SX - 11, 655],
        [SX - 11, 697],
      ],
      BARE,
    ) + testPoint(SX - 11, 707, 10);
  const via =
    tr(
      [
        [694, 700],
        [694, 924],
      ],
      UNDER,
    ) +
    tented(694, 692, 8) +
    tented(694, 932, 8);
  let edge = `<path d="M92 946H640" stroke="${INK}" stroke-opacity=".35" stroke-width="2.5" stroke-dasharray="10 8"/>`;
  for (let k = 0; k < 10; k++) {
    const fx = 114 + k * 56;
    edge += `<rect x="${fx - 18}" y="966" width="36" height="140" rx="7" fill="url(#au)"/><rect x="${fx - 12}" y="972" width="7" height="100" rx="3" fill="#ffffff" fill-opacity=".18"/>`;
  }
  return [
    { name: 'edge', box: atEnd(0, 622, 1800, 36), g: row },
    { name: 'probe', box: atEnd(SX - 26, 648, 30, 74), g: probe },
    { name: 'via', box: atEnd(678, 678, 32, 268), g: via },
    {
      name: 'fingers',
      box: atEnd(88, 940, 612, 140),
      g: edge,
      words: [{ x: 664, y: 1012, t: 'J1', size: 22 }],
    },
    corners()[0]!,
  ];
}

// ---------------------------------------------------------------------------------------------
// The cards: modules with castellated edges, soldered side by side

const CARDS = [START, START + 588, START + 1176];
const CARD = { w: 520, top: 286, h: 500 };

function cardsArt(): Part[] {
  const rows = Array.from({ length: 8 }, (_, j) => CARD.top + 34 + j * 63);
  const edges = CARDS.map((s) => [1920 - s - CARD.w, 1920 - s] as const);
  // What each module draws: its castellations here, the parts along its foot below.
  const modules = edges.map(([l, r]) => {
    let g = '';
    for (const y of rows) {
      for (const x of [l, r]) {
        const out = x === l ? -1 : 1;
        g += `<rect x="${f1(out > 0 ? x - 4 : x - 16)}" y="${y - 11}" width="20" height="22" rx="2" fill="url(#au)"/>`;
        g += `<circle cx="${x}" cy="${y}" r="11" fill="url(#au)"/><path d="M${x} ${y - 6}A6 6 0 0 ${out > 0 ? 0 : 1} ${x} ${y + 6}Z" fill="${HOLE}"/>`;
      }
    }
    return (
      g + `<circle cx="${r - 22}" cy="${CARD.top + 18}" r="5.5" fill="${INK}" fill-opacity=".7"/>`
    );
  });
  // Between the modules, every other castellation is joined; the outer ones run off the board.
  const joins = [0, 1].map((k) => {
    const from = edges[k]![0];
    const to = edges[k + 1]![1];
    return rows
      .map((y, j) =>
        j % 2 === 0
          ? tr(
              [
                [from - 14, y],
                [to + 14, y],
              ],
              { ...BARE, w: 6 },
            )
          : tr(
              [
                [from - 14, y],
                [from - 24, y + 10],
              ],
              UNDER,
            ),
      )
      .join('');
  });
  let lead = '';
  let tail = '';
  rows.forEach((y, j) => {
    if (j % 3 !== 1) {
      lead += tr(
        [
          [edges[0]![1] + 14, y],
          [1930, y],
        ],
        j % 2 ? UNDER : { ...BARE, w: 5, op: 0.6 },
      );
      tail += tr(
        [
          [edges[2]![0] - 14, y],
          [-10, y],
        ],
        j % 2 ? UNDER : { ...BARE, w: 5, op: 0.6 },
      );
    }
  });
  // The parts of each module along its foot: the MCU, the radio under its can, the sensor's front
  // end and connector.
  for (const [k, [l, r]] of edges.entries()) {
    const y = CARD.top + CARD.h - 30;
    let g = `<path d="M${l + 36} ${y - 28}H${r - 36}" stroke="${INK}" stroke-opacity=".14" stroke-width="2" stroke-dasharray="8 8"/>`;
    if (k === 0)
      g +=
        qfp(r - 80, y, 36, 6, { len: 6, w: 4 }) +
        passive(r - 140, y, 'cap', false, 30, 15) +
        passive(r - 186, y, 'res', false, 30, 15) +
        crystal(r - 252, y, 50, 22);
    if (k === 1) {
      let m = `M${r - 214} ${y + 12}`;
      for (let x = r - 214, j = 0; x < r - 150; x += 10, j++)
        m += `V${j % 2 ? y - 14 : y + 12}H${x + 10}`;
      g += `<rect x="${r - 136}" y="${y - 20}" width="80" height="40" rx="5" fill="url(#sn)"/><rect x="${r - 130}" y="${y - 14}" width="68" height="28" rx="3" stroke="#8a908e" stroke-width="1.5"/>`;
      g +=
        `<path d="${m}" stroke="${GOLD}" stroke-opacity=".85" stroke-width="3"/>` +
        passive(r - 250, y, 'cap', false, 30, 15);
    }
    if (k === 2) {
      g +=
        qfp(r - 80, y, 34, 5, { len: 0.1, w: 4 }, false) +
        passive(r - 136, y, 'cap', false, 30, 15);
      g += `<rect x="${r - 236}" y="${y - 18}" width="66" height="36" rx="4" fill="#e9dfc9"/><rect x="${r - 230}" y="${y - 10}" width="54" height="10" rx="2" fill="#2a2e2c"/>`;
      for (let j = 0; j < 4; j++)
        g += `<rect x="${r - 228 + j * 14}" y="${y + 18}" width="6" height="10" fill="url(#sn)"/>`;
    }
    modules[k] += g;
  }
  // The traces join over the castellations they run from.
  return [
    ...edges.map(([l], k) => ({
      name: `castellations${k + 1}`,
      box: atEnd(l - 18, 290, CARD.w + 36, 500),
      g: modules[k]!,
    })),
    ...joins.map((g, k) => ({
      name: `joins${k + 1}`,
      box: atEnd(edges[k]![0] - 60, 312, 52, 466),
      g,
    })),
    { name: 'net_start', box: atEnd(1800, 314, 120, 390), g: lead },
    { name: 'net_end', box: atEnd(0, 314, 88, 390), g: tail },
  ];
}

// ---------------------------------------------------------------------------------------------
// The timeline: one trace, a via at every stage

const COLUMNS = [START, START + 434, START + 868, START + 1302];
const TRACE_Y = 456;

function timelineArt(): Part[] {
  const xs = COLUMNS.map((s) => 1920 - s - 22);
  const pts: Pt[] = [[1930, TRACE_Y]];
  for (const [k, x] of xs.entries()) {
    pts.push([x, TRACE_Y]);
    const next = k < xs.length - 1 ? xs[k + 1]! : -40;
    const mid = (x + next) / 2;
    pts.push(
      [mid + 64, TRACE_Y],
      [mid + 36, TRACE_Y + 28],
      [mid - 36, TRACE_Y + 28],
      [mid - 64, TRACE_Y],
    );
  }
  pts.push([-10, TRACE_Y]);
  let g = `<circle cx="${xs[0]}" cy="${TRACE_Y}" r="120" fill="url(#glow)"/>`;
  g += tr(pts, { c: GOLD, op: 0.3, w: 22 }) + tr(pts, { c: GOLD, op: 0.95, w: 8 });
  for (const x of xs) {
    g +=
      tr(
        [
          [x, TRACE_Y],
          [x, TRACE_Y + 52],
        ],
        UNDER,
      ) + tented(x, TRACE_Y + 58, 7);
    g +=
      `<circle cx="${x}" cy="${TRACE_Y}" r="34" stroke="${INK}" stroke-opacity=".3" stroke-width="2.5"/>` +
      goldVia(x, TRACE_Y, 24);
  }
  return [{ name: 'trace', box: atEnd(0, TRACE_Y - 126, 1920, 252), g }];
}

// ---------------------------------------------------------------------------------------------
// The process: a signal chain of schematic symbols

const STEPS = [START, START + 347, START + 694, START + 1041, START + 1388];
const STEP = { w: 308, top: 288, h: 170 };

const DESIGNATORS = ['X1', 'U2', 'U1', 'ANT1', ''];

function processArt(): Part[] {
  const cy = STEP.top + STEP.h / 2;
  const S = `stroke="${INK}" stroke-opacity=".85" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"`;
  const symbols = [
    // A transducer: its plate, and the waves of the water on the start side.
    (c: number) =>
      `<rect x="${c - 8}" y="${cy - 38}" width="16" height="76" rx="3" ${S}/>` +
      [22, 40, 58]
        .map(
          (r) =>
            `<path d="M${c + 8 + r * 0.5} ${cy - r * 0.9}Q${c + 8 + r} ${cy} ${c + 8 + r * 0.5} ${cy + r * 0.9}" ${S}/>`,
        )
        .join(''),
    // An amplifier, and the steps of a converter.
    (c: number) =>
      `<path d="M${c + 46} ${cy - 40}V${cy + 40}L${c - 18} ${cy}Z" ${S}/>` +
      `<path d="M${c + 46} ${cy - 18}h14M${c + 46} ${cy + 18}h14" ${S}/>` +
      `<rect x="${c - 76}" y="${cy - 22}" width="44" height="44" rx="4" ${S}/>` +
      `<path d="M${c - 70} ${cy + 14}h8v-8h8v-8h8v-8h8" ${S}/>`,
    // The microcontroller.
    (c: number) =>
      qfp(c, cy, 70, 6, { len: 12, w: 6 }) +
      `<circle cx="${c - 24}" cy="${cy - 24}" r="4" fill="${GOLD}"/>`,
    // An antenna, radiating.
    (c: number) =>
      `<path d="M${c} ${cy + 36}V${cy - 30}M${c} ${cy - 30}l-22 -26M${c} ${cy - 30}l22 -26M${c - 22} ${cy - 56}h44" ${S}/>` +
      [26, 44]
        .map(
          (r) =>
            `<path d="M${c - r} ${cy - 30 - r * 0.7}Q${c - r * 1.35} ${cy - 30} ${c - r} ${cy - 30 + r * 0.7}M${c + r} ${cy - 30 - r * 0.7}Q${c + r * 1.35} ${cy - 30} ${c + r} ${cy - 30 + r * 0.7}" ${S} stroke-opacity=".55"/>`,
        )
        .join(''),
    // The cloud, and what goes up to it.
    (c: number) =>
      `<path d="M${c - 52} ${cy + 26}H${c + 50}A26 26 0 0 0 ${c + 44} ${cy - 24}A36 36 0 0 0 ${c - 22} ${cy - 30}A28 28 0 0 0 ${c - 52} ${cy + 26}Z" ${S}/>` +
      `<path d="M${c} ${cy + 14}V${cy - 14}M${c - 11} ${cy - 3}L${c} ${cy - 14}L${c + 11} ${cy - 3}" stroke="${GOLD}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  ];
  const reach = [8, 46, 47, 0, 52];
  // What each step draws: its box, its symbol, the signal through it, the arrow on to the next.
  return STEPS.map((s, k): Part => {
    const r = 1920 - s;
    const l = r - STEP.w;
    const c = (l + r) / 2;
    const words: Letter[] = [];
    let g = silkBox(l, STEP.top, STEP.w, STEP.h, 0.38, 8);
    // The signal in at the start side, out at the end side.
    if (k > 0 && k < 3)
      g += tr(
        [
          [r, cy],
          [c + reach[k]!, cy],
        ],
        BARE,
      );
    // The antenna is fed at the foot of its mast.
    if (k === 3)
      g += tr(
        [
          [r, cy],
          [c + 30, cy],
          [c, cy + 30],
          [c, cy + 36],
        ],
        BARE,
      );
    if (k < 4 && k !== 3)
      g += tr(
        [
          [c - (k === 1 ? 76 : reach[k]!), cy],
          [l, cy],
        ],
        BARE,
      );
    if (k === 4)
      g += tr(
        [
          [r, cy],
          [c + 60, cy],
        ],
        { c: GOLD, op: 0.9, w: 5 },
      ).replace('/>', ' stroke-dasharray="2 12"/>');
    g += symbols[k]!(c);
    g += `<circle cx="${r - 18}" cy="${STEP.top + 18}" r="4.5" fill="${INK}" fill-opacity=".6"/>`;
    if (DESIGNATORS[k])
      words.push({
        x: r - 32,
        y: STEP.top + 25,
        t: DESIGNATORS[k],
        size: 18,
        anchor: 'end',
        op: 0.7,
      });
    // Between two steps: an arrow the way the signal goes.
    if (k < 4) {
      const gx = l - 20;
      g += `<path d="M${gx + 7} ${cy - 11}L${gx - 5} ${cy}L${gx + 7} ${cy + 11}" stroke="${GOLD}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return {
      name: `step${k + 1}`,
      box: atEnd(l - 30, STEP.top - 8, STEP.w + 38, STEP.h + 16),
      g,
      words,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The comparison: two boards side by side

const SIDES = [
  ['before', START],
  ['after', START + 876],
] as const;
const BOARD_TOP = 286;
const BOARD_H = 640;
const BOARD_W = 820;

function comparisonArt(): Part[] {
  const boards = SIDES.map(([side, s]): Part => {
    const r = 1920 - s;
    const l = r - BOARD_W;
    let g = '';
    for (const [x, y] of [
      [l + 32, BOARD_TOP + 32],
      [r - 32, BOARD_TOP + 32],
      [l + 32, BOARD_TOP + BOARD_H - 32],
      [r - 32, BOARD_TOP + BOARD_H - 32],
    ] as const) {
      g +=
        side === 'after'
          ? goldVia(x, y, 14)
          : `<circle cx="${x}" cy="${y}" r="14" stroke="${MUTED}" stroke-opacity=".6" stroke-width="3"/><circle cx="${x}" cy="${y}" r="6" fill="${HOLE}"/>`;
    }
    // At the top-end corner, by the mounting hole: a fiducial and the blank silkscreen box a
    // board's serial is written in.
    g += fiducial(l + 76, BOARD_TOP + 30);
    g += `<rect x="${l + 106}" y="${BOARD_TOP + 16}" width="74" height="24" rx="2" stroke="${INK}" stroke-opacity=".45" stroke-width="2"/><path d="M${l + 116} ${BOARD_TOP + 34}h20" stroke="${INK}" stroke-opacity=".45" stroke-width="2"/>`;
    // Along the foot of each board, under its text and clear of it, its parts: rev B crowded,
    // rev C down to one chip, and lit.
    const y = BOARD_TOP + BOARD_H - 56;
    g += `<rect x="${l + 66}" y="${y - 40}" width="${BOARD_W - 132}" height="80" rx="8" stroke="${INK}" stroke-opacity=".16" stroke-width="2" stroke-dasharray="8 8"/>`;
    g +=
      tr(
        [
          [r - 90, y + 26],
          [l + 90, y + 26],
        ],
        { ...UNDER, w: 4 },
      ) +
      tr(
        [
          [r - 90, y - 28],
          [l + 90, y - 28],
        ],
        { ...UNDER, w: 4 },
      );
    if (side === 'before') {
      g +=
        qfp(r - 130, y, 50, 8, { len: 8, w: 4 }) +
        qfp(r - 236, y, 44, 6, { len: 0.1, w: 5 }, false);
      g += crystal(r - 330, y - 14, 60, 26) + crystal(r - 330, y + 22, 46, 22);
      for (let k = 0; k < 4; k++)
        g += passive(r - 404 - k * 40, y + (k % 2 ? 12 : -12), k % 2 ? 'res' : 'cap', true, 30, 15);
      g +=
        tantalum(l + 214, y) +
        `<rect x="${l + 96}" y="${y - 30}" width="72" height="60" rx="6" fill="url(#sn)"/><rect x="${l + 104}" y="${y - 22}" width="56" height="44" rx="4" stroke="#8a908e" stroke-width="2"/>`;
    } else {
      g += qfp(r - 136, y, 54, 8, { len: 8, w: 4 }) + crystal(r - 252, y, 60, 26);
      g += passive(r - 330, y, 'cap', true, 30, 15) + passive(r - 374, y, 'cap', true, 30, 15);
      g += led(r - 470, y, 46);
    }
    return {
      name: `${side}_parts`,
      box: atEnd(l - 4, BOARD_TOP - 4, BOARD_W + 8, BOARD_H + 8),
      g,
    };
  });
  // Between the boards: from the old revision to the new one.
  const mid = 1920 - START - BOARD_W - 28;
  const y = BOARD_TOP + BOARD_H / 2;
  const arrow =
    tr(
      [
        [mid + 22, y],
        [mid - 14, y],
      ],
      BARE,
    ) +
    `<path d="M${mid - 2} ${y - 16}L${mid - 20} ${y}L${mid - 2} ${y + 16}" stroke="${GOLD}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
  return [...boards, { name: 'arrow', box: atEnd(mid - 28, y - 22, 58, 44), g: arrow }];
}

// ---------------------------------------------------------------------------------------------
// The chart: an oscilloscope's screen

const SCOPE = at(START, 282, 1160, 652);

function scopeArt() {
  const w = SCOPE.w;
  const h = SCOPE.h;
  // The graticule, over the chart's own box.
  const gx = 30;
  const gy = 44;
  const gw = 1100;
  const gh = 592;
  let grid = '';
  for (let i = 1; i < 10; i++) {
    const x = gx + (gw * i) / 10;
    grid += `<path d="M${f1(x)} ${gy}V${gy + gh}" stroke="${INK}" stroke-opacity="${i === 5 ? 0.2 : 0.08}" stroke-width="1.5" ${i === 5 ? '' : 'stroke-dasharray="3 7"'}/>`;
  }
  // Across, the chart draws its own lines; the time divisions and the centre's ticks are the
  // scope's.
  for (let t = 1; t < 40; t++) {
    const y = gy + (gh * t) / 40;
    grid += `<path d="M${gx + gw / 2 - 6} ${f1(y)}h12" stroke="${INK}" stroke-opacity=".2" stroke-width="1.5"/>`;
  }
  const g =
    `<rect x="0" y="0" width="${w}" height="${h}" rx="22" fill="#04110b"/>` +
    `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="21" stroke="${INK}" stroke-opacity=".12" stroke-width="2"/>` +
    `<rect x="${gx - 8}" y="${gy - 8}" width="${gw + 16}" height="${gh + 16}" rx="10" stroke="${LIGHT}" stroke-opacity=".35" stroke-width="10" filter="url(#soft)"/>` +
    `<rect x="${gx - 8}" y="${gy - 8}" width="${gw + 16}" height="${gh + 16}" rx="10" stroke="${LIGHT}" stroke-opacity=".45" stroke-width="2"/>` +
    grid +
    `<rect x="${gx}" y="6" width="64" height="24" rx="5" fill="${GOLD}"/>` +
    `<circle cx="${w - 128}" cy="18" r="6" fill="${LIGHT}"/>`;
  // The readouts of the strip above the screen: the scope's own, in English as a scope's are.
  const words: Letter[] = [
    { x: gx + 32, y: 24, t: 'CH1', size: 17, fill: BG, anchor: 'middle', weight: 700 },
    { x: gx + 84, y: 24, t: '10.0 mA/div', size: 17, op: 0.8 },
    { x: gx + 290, y: 24, t: 'M 100 ms', size: 17, op: 0.8 },
    { x: gx + 450, y: 24, t: 'TRIG ↑ 2.0 mA', size: 17, op: 0.8 },
    { x: w - 112, y: 24, t: 'RUN', size: 17, fill: LIGHT, weight: 700 },
  ];
  return art(w, h, g, words);
}

// ---------------------------------------------------------------------------------------------
// The table: a bill of materials beside the carrier tape of a reel

function tapeArt(): string {
  let g = `<rect x="0" y="-10" width="64" height="1100" fill="#0e1312"/>`;
  for (let y = 20; y < 1080; y += 40) g += `<circle cx="12" cy="${y}" r="5.5" fill="${BG}"/>`;
  for (let y = 14; y < 1080; y += 80) {
    g += `<rect x="25" y="${y}" width="32" height="56" rx="4" fill="#070a09" stroke="#2c3331" stroke-width="2"/>`;
    g += `<rect x="31" y="${y + 13}" width="20" height="30" rx="3" fill="${CERAMIC}"/>`;
    g += `<rect x="31" y="${y + 13}" width="20" height="7" rx="2" fill="url(#sn)"/><rect x="31" y="${y + 36}" width="20" height="7" rx="2" fill="url(#sn)"/>`;
  }
  g += `<rect x="22" y="-10" width="38" height="1100" fill="#ffffff" fill-opacity=".05"/>`;
  g += `<path d="M22 -10V1090M60 -10V1090" stroke="#ffffff" stroke-opacity=".1" stroke-width="1.5"/>`;
  return svg(64, 1080, DEFS + g);
}

// ---------------------------------------------------------------------------------------------
// The team: each portrait in the footprint of a part

const PEOPLE = [START, START + 439, START + 877, START + 1316];
const PORTRAIT = { w: 380, top: 290 };

function footprintArt(n: number) {
  const w = 448;
  const h = 448;
  const [x0, y0, x1, y1] = [34, 34, 414, 414];
  let g = silkBox(x0 - 10, y0 - 10, x1 - x0 + 20, y1 - y0 + 20, 0.45, 4);
  for (let k = 0; k < 4; k++) {
    const y = y0 + 62 + k * 86;
    g += pad(x0 - 14, y, 18, 26, 3) + pad(x1 + 14, y, 18, 26, 3);
  }
  g += `<circle cx="${x1 + 22}" cy="12" r="6" fill="${INK}" fill-opacity=".75"/>`;
  const words: Letter[] = [{ x: x1 + 4, y: 19, t: `U${n}`, size: 20, anchor: 'end' }];
  return art(w, h, g, words);
}

// ---------------------------------------------------------------------------------------------
// The closing: a production panel of six boards, every LED lit

function panelArt(): string {
  const w = 796;
  const h = 872;
  const rail = 74;
  const gap = 16;
  const bw = (w - 2 * 18 - gap) / 2;
  const bh = (h - 2 * rail - 2 * gap) / 3;
  let g = `<rect x="0" y="0" width="${w}" height="${h}" rx="14" fill="${PANEL}"/>`;
  // The routed slots between the boards, and the tabs that hold them, with their mouse bites.
  g += `<rect x="12" y="${rail - 6}" width="${w - 24}" height="${h - 2 * rail + 12}" rx="10" fill="${HOLE}" fill-opacity=".85"/>`;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const x = 18 + c * (bw + gap);
      const y = rail + r * (bh + gap);
      // Tabs to the next board or the rail.
      for (const tx of [x + bw * 0.3, x + bw * 0.7]) {
        g += `<rect x="${f1(tx - 22)}" y="${f1(y - gap - 2)}" width="44" height="${gap + 4}" fill="${PANEL}"/>`;
        for (let k = 0; k < 5; k++)
          g += `<circle cx="${f1(tx - 16 + k * 8)}" cy="${f1(y - 2)}" r="2.2" fill="${HOLE}"/>`;
      }
      if (r === 2) {
        for (const tx of [x + bw * 0.3, x + bw * 0.7]) {
          g += `<rect x="${f1(tx - 22)}" y="${f1(y + bh - 2)}" width="44" height="${gap + 4}" fill="${PANEL}"/>`;
          for (let k = 0; k < 5; k++)
            g += `<circle cx="${f1(tx - 16 + k * 8)}" cy="${f1(y + bh + 2)}" r="2.2" fill="${HOLE}"/>`;
        }
      }
      g += `<rect x="${f1(x)}" y="${f1(y)}" width="${f1(bw)}" height="${f1(bh)}" rx="12" fill="#0e4430"/>`;
      // The board: its traces, the microcontroller, the crystal, the tantalum, the antenna and
      // the LED, all small.
      const cx = x + 150;
      const cy = y + bh / 2 + 4;
      g += tr(
        [
          [cx - 46, cy - 20],
          [x + 40, cy - 20],
          [x + 26, cy - 34],
          [x + 26, y + 18],
        ],
        { ...UNDER, w: 4 },
      );
      g += tr(
        [
          [cx + 46, cy + 10],
          [cx + 100, cy + 10],
          [cx + 124, cy + 34],
          [x + bw - 70, cy + 34],
        ],
        { ...UNDER, w: 4 },
      );
      g += tr(
        [
          [cx, cy + 46],
          [cx, cy + 70],
          [cx - 20, cy + 90],
          [x + 40, cy + 90],
        ],
        { ...UNDER, w: 4 },
      );
      g += tr(
        [
          [cx + 20, cy - 46],
          [cx + 20, y + 30],
          [cx + 80, y + 30],
        ],
        { ...UNDER, w: 4 },
      );
      let ant = `M${f1(x + bw - 64)} ${f1(cy + 34)}`;
      for (let k = 0; k < 3; k++) ant += `V${f1(y + 30)}h7V${f1(y + bh - 30)}h7`;
      g += `<path d="${ant}" stroke="${LIGHT}" stroke-opacity=".3" stroke-width="3"/>`;
      g += qfp(cx, cy, 70, 7, { len: 10, w: 5 }, false);
      g += crystal(x + 66, y + 40, 52, 24) + tantalum(x + 70, y + bh - 44);
      g +=
        passive(cx + 70, cy - 30, 'cap', false, 26, 13) +
        passive(cx + 70, cy + 54, 'res', false, 26, 13);
      g += led(x + bw - 112, y + 34, 54);
      for (const [hx, hy] of [
        [x + 14, y + 14],
        [x + bw - 14, y + 14],
        [x + 14, y + bh - 14],
        [x + bw - 14, y + bh - 14],
      ] as const) {
        g += `<circle cx="${f1(hx)}" cy="${f1(hy)}" r="6" fill="url(#au)"/><circle cx="${f1(hx)}" cy="${f1(hy)}" r="2.6" fill="${HOLE}"/>`;
      }
      g += brackets(cx - 54, cy - 54, 108, 108, 16, 0.5);
    }
  }
  // The rails: tooling holes and fiducials.
  for (const y of [rail / 2, h - rail / 2]) {
    g += mountHole(38, y, 0.62) + mountHole(w - 38, y, 0.62);
    g += fiducial(100, y) + fiducial(w - 100, y);
    for (let x = 160; x < w - 160; x += 40)
      g += `<rect x="${x}" y="${y - 3}" width="22" height="6" rx="2" fill="${GOLD}" fill-opacity=".55"/>`;
  }
  return svg(w, h, DEFS + g);
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const ROWS = [316, 520, 724];
const LINES = [536, 640, 744];

/** The background of each layout, by its id; the mirror turns their light to the other side. */
function layouts(): Layout[] {
  return [
    {
      id: 'l_shvav_hero',
      name: 'Hero',
      archetype: 'hero',
      background: ground(0.24, 0.42),
      placeholders: [
        place('p_kicker', 'caption', at(START + 44, 286, 780, 34), 'caption'),
        place('p_title', 'title', at(START, 336, 940, 240), 'display'),
        place('p_subtitle', 'subtitle', at(START, 600, 880, 134), 'heading'),
        place('p_meta', 'caption', at(START + 44, 884, 780, 34), 'caption'),
      ],
      decorations: parts('hero', heroArt()),
    },
    {
      id: 'l_shvav_section',
      name: 'Section',
      archetype: 'section',
      background: ground(0.22, 0.5),
      placeholders: [
        place('p_number', 'number', atEnd(210, 450, 380, 180), 'display', {
          align: 'center',
          vAlign: 'middle',
          color: token('primary'),
        }),
        place('p_kicker', 'caption', at(START + 44, 366, 760, 34), 'caption'),
        // Room for two lines; one line stands in the middle, between the kicker and the subtitle.
        place('p_title', 'title', at(START, 416, 900, 240), 'display', { vAlign: 'middle' }),
        place('p_subtitle', 'subtitle', at(START, 690, 860, 106), 'heading'),
      ],
      decorations: parts('section', sectionArt()),
    },
    {
      id: 'l_shvav_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      background: ground(0.6, 0.4),
      placeholders: [
        ...head('big_number').placeholders,
        place('p_number', 'number', at(START + 44, 400, 960, 135), 'display', {
          color: token('primary'),
          vAlign: 'middle',
        }),
        place('p_label', 'subtitle', at(START, 648, 1000, 53), 'heading'),
        place('p_body', 'body', at(START, 708, 940, 135), 'body'),
        ...STATS.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(END, top, 500, 79), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', atEnd(END, top + 86, 500, 68), 'caption'),
        ]),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        ...parts('big_number', bigNumberArt().slice(0, -1)),
        drawing(
          'd_shvav_big_number_kicker_pad',
          at(START, KICKER + 6, 22, 22),
          svg(22, 22, DEFS + testPoint(11, 11, 10)),
          PAINT,
        ),
        ...foot('big_number').decorations,
        // The trace of the test points runs on into the foot's net. Drawn after the foot, which
        // is not then drawn over it, it is the slide's (ADR-094); cut at the foot, it would show
        // the cut.
        ...parts('big_number', bigNumberArt().slice(-1)),
      ],
    },
    {
      id: 'l_shvav_quote',
      name: 'Quote',
      archetype: 'quote',
      background: ground(0.5, 0.45),
      placeholders: [
        place('p_quote', 'quote', at(START + 190, 226, 1330, 400), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(START + 190, 676, 1100, 53), 'heading'),
        place('p_caption', 'caption', at(START + 190, 736, 1100, 68), 'caption'),
        ...foot('quote').placeholders,
      ],
      decorations: [
        ...parts('quote', quoteArt()),
        lettered('d_shvav_quote_marks', at(START + 46, 232, 120, 100), teardrops),
        ...foot('quote').decorations,
      ],
    },
    {
      id: 'l_shvav_text',
      name: 'Text',
      archetype: 'text',
      // The text is on a module from margin to margin, down to over the foot, from its top; its
      // castellations run down both sides and its parts stand at the end corner of its foot.
      background: ground(0.5, 0.42),
      placeholders: [
        place('p_title', 'title', at(START, 116, WIDTH, 92), 'title'),
        place('p_body', 'body', at(START + 64, MODULE.y + 56, WIDTH - 128, 536), 'body'),
      ],
      decorations: [
        drawing(
          'd_shvav_text_title_pad',
          at(START - 54, 151, 22, 22),
          svg(22, 22, DEFS + testPoint(11, 11, 10)),
          PAINT,
        ),
        rect('d_shvav_text_module', MODULE, solid(token('surface')), {
          stroke: { color: token('text', 0.14), width: 1.5 },
          effects: {
            radius: 12,
            shadow: { x: 0, y: 14, blur: 30, color: { value: '#01100a', alpha: 0.45 } },
          },
        }),
        ...parts('text', [...moduleSides(), moduleParts()]),
        ...foot('text').decorations,
      ],
    },
    {
      id: 'l_shvav_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      background: ground(0.7, 0.45),
      placeholders: [
        ...head('text_image', 900, 2).placeholders,
        place('p_image', 'image', PHOTO),
        ...ROWS.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(START + 76, top, 840, 53), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(START + 76, top + 58, 840, 132), 'body'),
        ]),
        ...foot('text_image').placeholders,
      ],
      decorations: [
        ...head('text_image', 900, 2).decorations,
        lettered(
          'd_shvav_text_image_courtyard',
          atEnd(END + 24 - 64, 120 - 64, 808, 890),
          photoFrameArt(),
        ),
        drawing(
          'd_shvav_text_image_net',
          at(START, ROWS[0]!, 48, ROWS[2]! - ROWS[0]! + 48),
          svg(
            48,
            ROWS[2]! - ROWS[0]! + 48,
            tr(
              [
                [24, 30],
                [24, ROWS[2]! - ROWS[0]! + 18],
              ],
              { ...UNDER, op: 0.34 },
            ),
          ),
          PAINT,
        ),
        ...ROWS.map((top, i) =>
          numberPad(`d_shvav_text_image_n${i + 1}`, at(START, top + 2, 48, 48), i + 1),
        ),
        ...foot('text_image').decorations,
      ],
    },
    {
      id: 'l_shvav_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      background: ground(0.5, 0.85),
      placeholders: [
        // The picture fills the top of the slide; the words are on the board under it, because
        // nothing of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 640)),
        place('p_kicker', 'caption', at(START + 44, 690, 900, 34), 'caption'),
        place('p_title', 'title', at(START, 736, 1060, 148), 'title'),
        place('p_body', 'body', atEnd(END, 740, 560, 180), 'body'),
      ],
      decorations: parts('full_image', fullImageArt()),
    },
    {
      id: 'l_shvav_cards',
      name: 'Cards',
      archetype: 'cards',
      background: ground(0.5, 0.45),
      placeholders: [
        ...head('cards').placeholders,
        ...CARDS.flatMap((start, i) => [
          place(
            `p_card${i + 1}_note`,
            'caption',
            at(start + 44, CARD.top + 26, 452, 76),
            'caption',
          ),
          place(`p_card${i + 1}`, 'subtitle', at(start + 44, CARD.top + 108, 452, 106), 'heading'),
          place(`p_card${i + 1}_body`, 'body', at(start + 44, CARD.top + 222, 452, 210), 'body'),
        ]),
        place('p_takeaway', 'body', at(START + 70, 816, WIDTH - 70, 90), 'body', {
          vAlign: 'middle',
        }),
        ...foot('cards').placeholders,
      ],
      decorations: [
        ...head('cards').decorations,
        ...CARDS.map((start, i) =>
          rect(
            `d_shvav_cards_module${i + 1}`,
            at(start, CARD.top, CARD.w, CARD.h),
            solid(token('surface')),
            {
              stroke: { color: token('text', 0.14), width: 1.5 },
              effects: {
                radius: 12,
                shadow: { x: 0, y: 14, blur: 30, color: { value: '#01100a', alpha: 0.45 } },
              },
            },
          ),
        ),
        ...parts('cards', cardsArt()),
        drawing(
          'd_shvav_cards_led',
          at(START - 22, 815, 92, 92),
          svg(92, 92, DEFS + led(46, 46, 46)),
          PAINT,
        ),
        ...foot('cards').decorations,
      ],
    },
    {
      id: 'l_shvav_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      background: ground(0.5, 0.42),
      placeholders: [
        ...head('timeline').placeholders,
        ...COLUMNS.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 316, 394, 79), 'title', {
            vAlign: 'bottom',
            color: token('primary'),
          }),
          place(`p_what${i + 1}`, 'subtitle', at(start, 542, 360, 96), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start, 640, 360, 170), 'caption'),
        ]),
        place('p_note', 'caption', at(START, 866, WIDTH, 34), 'caption'),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        ...head('timeline').decorations,
        ...parts('timeline', timelineArt()),
        rect('d_shvav_timeline_rule', at(START, 842, WIDTH, 1.5), solid(token('text', 0.16))),
        ...foot('timeline').decorations,
      ],
    },
    {
      id: 'l_shvav_process',
      name: 'Process',
      archetype: 'process',
      background: ground(0.5, 0.42),
      placeholders: [
        ...head('process').placeholders,
        ...STEPS.flatMap((start, i) => [
          place(`p_step${i + 1}_number`, 'number', at(start, 474, 308, 79), 'title', {
            color: token('primary'),
          }),
          place(`p_step${i + 1}`, 'subtitle', at(start, 562, 308, 96), 'heading'),
          place(`p_step${i + 1}_body`, 'caption', at(start, 660, 304, 136), 'caption'),
        ]),
        place('p_summary', 'body', at(START + 70, 836, WIDTH - 70, 90), 'body', {
          vAlign: 'middle',
        }),
        ...foot('process').placeholders,
      ],
      decorations: [
        ...head('process').decorations,
        ...parts('process', processArt()),
        drawing(
          'd_shvav_process_tp',
          at(START + 2, 859, 44, 44),
          svg(44, 44, DEFS + goldVia(22, 22, 18)),
          PAINT,
        ),
        ...foot('process').decorations,
      ],
    },
    {
      id: 'l_shvav_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      background: ground(0.5, 0.45),
      placeholders: [
        ...head('comparison').placeholders,
        ...SIDES.flatMap(([side, start]) => [
          place(`p_${side}_tag`, 'caption', at(start + 60, BOARD_TOP + 42, 660, 34), 'caption'),
          place(`p_${side}`, 'subtitle', at(start + 60, BOARD_TOP + 84, 708, 106), 'heading'),
          place(`p_${side}_body`, 'body', at(start + 60, BOARD_TOP + 192, 708, 350), 'body'),
        ]),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        ...head('comparison').decorations,
        ...SIDES.map(([side, start]) =>
          rect(
            `d_shvav_comparison_${side}`,
            at(start, BOARD_TOP, BOARD_W, BOARD_H),
            solid(token('surface', side === 'after' ? 1 : 0.55)),
            {
              stroke:
                side === 'after'
                  ? { color: token('primary', 0.85), width: 3 }
                  : { color: token('muted', 0.45), width: 2, dash: 'dashed' },
              effects: { radius: 26 },
            },
          ),
        ),
        ...parts('comparison', comparisonArt()),
        ...foot('comparison').decorations,
      ],
    },
    {
      id: 'l_shvav_chart',
      name: 'Chart',
      archetype: 'chart',
      background: ground(0.62, 0.45),
      placeholders: [
        ...head('chart').placeholders,
        place('p_chart', 'chart', at(START + 30, 326, 1100, 592)),
        place('p_stat1', 'number', atEnd(END, 290, 470, 135), 'display', {
          color: token('primary'),
        }),
        place('p_stat1_body', 'body', atEnd(END, 428, 470, 135), 'body'),
        place('p_stat2', 'number', atEnd(END, 590, 470, 135), 'display', {
          color: token('secondary'),
        }),
        place('p_stat2_body', 'body', atEnd(END, 728, 470, 96), 'body'),
        place('p_source', 'caption', atEnd(END, 842, 470, 68), 'caption'),
        ...foot('chart').placeholders,
      ],
      decorations: [
        ...head('chart').decorations,
        rect('d_shvav_chart_bezel_shadow', SCOPE, solid(token('bg')), {
          effects: {
            radius: 22,
            shadow: { x: 0, y: 24, blur: 50, color: { value: '#010a06', alpha: 0.6 } },
          },
        }),
        lettered('d_shvav_chart_scope', SCOPE, scopeArt()('rtl')),
        rect('d_shvav_chart_divider', atEnd(END, 574, 470, 1.5), solid(token('text', 0.16))),
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_shvav_table',
      name: 'Table',
      archetype: 'table',
      background: ground(0.5, 0.45),
      placeholders: [
        ...head('table', 1400, 2, false).placeholders,
        place('p_table', 'table', at(START, 282, WIDTH, 610)),
        place('p_note', 'caption', at(START, 904, WIDTH, 34), 'caption'),
        ...foot('table').placeholders,
      ],
      decorations: [
        ...head('table', 1400, 2, false).decorations,
        ...foot('table').decorations,
        // The tape runs on through the foot. Drawn after it, which is not then drawn over it, the
        // tape is the slide's (ADR-094); cut at the foot, it would show the cut.
        drawing('d_shvav_table_tape', at(22, 0, 64, 1080), tapeArt(), PAINT),
      ],
    },
    {
      id: 'l_shvav_team',
      name: 'Team',
      archetype: 'team',
      background: ground(0.5, 0.45),
      placeholders: [
        ...head('team').placeholders,
        ...PEOPLE.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start, PORTRAIT.top, PORTRAIT.w, PORTRAIT.w)),
          place(`p_person${i + 1}`, 'subtitle', at(start, 690, PORTRAIT.w + 24, 53), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start, 746, PORTRAIT.w + 24, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start, 786, PORTRAIT.w + 24, 102), 'caption'),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: [
        ...head('team').decorations,
        ...PEOPLE.map((start, i) =>
          lettered(
            `d_shvav_team_footprint${i + 1}`,
            at(start - 34, PORTRAIT.top - 34, 448, 448),
            footprintArt(i + 1),
          ),
        ),
        ...foot('team').decorations,
      ],
    },
    {
      id: 'l_shvav_closing',
      name: 'Closing',
      archetype: 'closing',
      background: ground(0.24, 0.5),
      placeholders: [
        place('p_kicker', 'caption', at(START + 44, 190, 760, 34), 'caption'),
        place('p_title', 'title', at(START, 238, 860, 240), 'display'),
        ...LINES.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(START + 70, top, 760, 92), 'body', {
            vAlign: 'middle',
          }),
        ),
        place('p_contact', 'caption', at(START + 44, 892, 760, 34), 'caption'),
      ],
      decorations: [
        drawing(
          'd_shvav_closing_net',
          at(0, 0, 220, 1080),
          svg(
            220,
            1080,
            DEFS +
              tr(
                [
                  [81, -10],
                  [81, 197],
                ],
                { ...UNDER, op: 0.34, w: 5 },
              ) +
              testPoint(81, 207, 10) +
              tr(
                [
                  [70, LINES[0]! + 46],
                  [70, LINES[2]! + 46],
                  [70, 888],
                  [81, 899],
                ],
                { ...UNDER, op: 0.34 },
              ) +
              testPoint(81, 909, 10) +
              mountHole(156, 1012),
          ),
          PAINT,
        ),
        ...LINES.map((top, i) =>
          // A tick reads the same way in both directions: drawn once, never mirrored.
          lettered(
            `d_shvav_closing_check${i + 1}`,
            at(START, top + 24, 44, 44),
            svg(
              44,
              44,
              DEFS +
                `<rect x="1" y="1" width="42" height="42" rx="8" fill="url(#au)"/><path d="M12 22.5l7 7 13-14" stroke="${BG}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`,
            ),
          ),
        ),
        rect('d_shvav_closing_panel_shadow', atEnd(64, 104, 796, 872), solid(token('bg')), {
          effects: {
            radius: 14,
            shadow: { x: 0, y: 30, blur: 60, color: { value: '#010a06', alpha: 0.6 } },
          },
        }),
        drawing('d_shvav_closing_panel', atEnd(64, 104, 796, 872), panelArt(), PAINT),
        drawing(
          'd_shvav_closing_fiducial',
          atEnd(36, 36, 40, 40),
          svg(40, 40, DEFS + fiducial(20, 20)),
          PAINT,
        ),
      ],
    },
  ];
}

/**
 * The layouts of a left-to-right deck: the mirrors, with every drawing that holds letters drawn
 * again for that direction.
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
// The sample: a hardware startup's EVT review of a smart water meter that runs ten years on one
// battery

const pictures = {
  shvavBoard: picture('shvavBoard'),
  shvavLine: picture('shvavLine'),
  shvavTeam1: picture('shvavTeam1'),
  shvavTeam2: picture('shvavTeam2'),
  shvavTeam3: picture('shvavTeam3'),
  shvavTeam4: picture('shvavTeam4'),
};

const FOOTER_HE = text('Zrima Labs · סקירת EVT של WM-10');
const FOOTER_EN = text('Zrima Labs · WM-10 EVT review');
const TABLE_COLS = [230, 640, 190, 320, 316];
const TABLE_ROW = 80;
/** Milliamps through one daily transmission, every 100 ms. */
const CURRENT = [0, 0, 3.1, 4.8, 39, 41, 40, 41, 40, 41, 39, 40, 11, 11, 0.4, 0, 0];
const TIMES = CURRENT.map((_, i) => (i / 10).toFixed(1));

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_shvav_hero',
    name: 'פתיחה',
    content: {
      caption: [text('Zrima Labs · Hardware'), text('רותי אלמוג · 14.3.2027 · סקירת EVT')],
      title: text('עשר שנים', 'על סוללה אחת'),
      subtitle: text('מונה המים WM-10, מאב־טיפוס ועד ייצור'),
    },
  },
  {
    layout: 'l_shvav_section',
    name: 'תקציב ההספק',
    content: {
      number: text('01'),
      caption: text('חלק ראשון'),
      title: text('תקציב ההספק'),
      subtitle: text('כל מיקרו־אמפר נספר, עשר שנים.'),
    },
  },
  {
    layout: 'l_shvav_text',
    name: 'מה בסקירה',
    content: {
      title: text('מה בסקירה'),
      body: {
        paragraphs: [
          para(
            'ארבע שאלות יקבעו אם WM-10 עובר ל-DVT באפריל. לכל אחת מהן יש בעלים בצוות, מספר שאפשר למדוד ותאריך שבו בודקים אותו, וכולן יקבלו תשובה עד סוף הסקירה, כדי שנוכל להחליט כבר היום.',
            { spaceAfter: 36 },
          ),
          ...points(
            [
              ['הספק: ', 'האם התקציב מחזיק עשר שנים על סוללה אחת, גם בחורף קר?'],
              ['עלות: ', 'כמה עולה לוח אחד בכמות של 10,000 יחידות, עם הרדיו והמארז.'],
              ['השטח: ', 'מה למדנו מ-60 המונים שעובדים בשטח מאז ינואר.'],
              ['ייצור: ', 'מה עוד צריך לסגור לפני שמזמינים את הסדרה הראשונה.'],
            ],
            { kind: 'number', mark: token('primary'), gap: 22 },
          ).paragraphs,
        ],
      },
    },
  },
  {
    layout: 'l_shvav_big_number',
    name: 'הזרם הממוצע',
    content: {
      caption: [
        text('תקציב ההספק'),
        text('זרם בשינה עמוקה'),
        text('סוללת ליתיום אחת, בגודל AA'),
        text('שנות סוללה, בחישוב עם מרווח'),
      ],
      title: text('לאן הולך הזרם ב-rev C'),
      number: [text('24µA'), text('1.8µA'), text('2.6Ah'), text('10.8')],
      subtitle: text('צריכה ממוצעת לאורך יממה שלמה'),
      body: text('רוב הזמן המונה ישן. הוא מתעורר כל 15 דקות למדידה, ומשדר פעם ביום.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shvav_cards',
    name: 'שלושה חלקים',
    content: {
      caption: [
        text('שלושה חלקים, תקציב אחד'),
        text('U1 · בקר'),
        text('U1 · רדיו'),
        text('U3 · חיישן'),
      ],
      title: text('מי צורך מה'),
      subtitle: [text('בקר שישן עמוק'), text('רדיו פעם ביום'), text('חיישן בלי מגע')],
      body: [
        text('מתעורר כל 15 דקות, מודד 40 מילישניות וחוזר לישון.'),
        text('הודעה אחת ביום, 1.2 שניות באוויר.'),
        text('גלי קול, בלי חלקים נעים שנשחקים.'),
        text('יחד: פי מאה פחות מנורית LED דולקת.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shvav_text_image',
    name: 'הלוח',
    content: {
      caption: text('rev C מקרוב'),
      title: text('לוח אחד,', '38 רכיבים'),
      image: { assetId: pictures.shvavBoard.id },
      subtitle: [text('בקר ורדיו בשבב אחד'), text('ארבע שכבות במקום שש'), text('ציפוי נגד לחות')],
      body: [
        text('הרדיו המובנה חוסך שבב, שני גבישים ו-9µA.'),
        text('ניתוב חדש הוריד 31% מעלות הלוח, בלי לפגוע באנטנה.'),
        text('המונה חי בבור רטוב, כל השנה.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shvav_timeline',
    name: 'הדרך לייצור',
    content: {
      caption: [text('הדרך לייצור'), text('כל מעבר שלב מותנה בתקציב ההספק ובאמינות.')],
      title: text('מ-EVT לייצור סדרתי'),
      number: [text('EVT'), text('DVT'), text('PVT'), text('MP')],
      subtitle: [
        text('אב־טיפוס הנדסי'),
        text('אימות התכנון'),
        text('אימות הייצור'),
        text('ייצור סדרתי'),
      ],
      body: [
        text('ינואר 2027', '60 מונים בשטח'),
        text('אפריל 2027', '200 יחידות למבחני מאמץ'),
        text('יוני 2027', '1,000 יחידות מהקו'),
        text('ספטמבר 2027', '10,000 ברבעון'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shvav_process',
    name: 'שרשרת האות',
    content: {
      caption: [
        text('שרשרת האות'),
        text('מתמר אולטרסוני'),
        text('דגימה של 16 ביט'),
        text('מסנן ומחשב ספיקה'),
        text('הודעה אחת ביום'),
        text('התראה על דליפה'),
      ],
      title: text('מהמים ועד הענן'),
      subtitle: [text('חיישן'), text('מגבר ו-ADC'), text('בקר'), text('רדיו'), text('ענן')],
      number: [text('6.2µA'), text('1.1µA'), text('4.3µA'), text('12.4µA'), text('0µA')],
      body: text('סך הכול 24µA בממוצע, והרדיו לבדו צורך יותר ממחצית.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shvav_comparison',
    name: 'rev B מול rev C',
    content: {
      caption: [text('מה השתנה'), text('REV B · אב־טיפוס'), text('REV C · לוח ה-EVT')],
      title: text('rev B מול rev C'),
      subtitle: [text('61µA בממוצע'), text('24µA בממוצע')],
      body: [
        bullets('שש שכבות ו-52 רכיבים', 'רדיו NB-IoT בשבב נפרד', '4.1 שנות סוללה'),
        bullets('ארבע שכבות ו-38 רכיבים', 'רדיו LoRa בתוך הבקר', '10.8 שנות סוללה'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shvav_chart',
    name: 'על הסקופ',
    content: {
      caption: [text('מדידה במעבדה'), text('יחידה 17 במעבדה, מרץ 2027.')],
      title: text('שידור אחד, על הסקופ'),
      number: [text('1.2s'), text('99.3%')],
      body: [text('באוויר, פעם אחת ביממה.'), text('מהקריאות הגיעו לענן בפיילוט.')],
      footer: FOOTER_HE,
    },
    chart: {
      chartType: 'line',
      title: 'זרם בזמן שידור, mA',
      data: { categories: TIMES, series: [{ name: 'mA', values: CURRENT }] },
    },
  },
  {
    layout: 'l_shvav_table',
    name: 'רשימת החלקים',
    content: {
      caption: [text('רשימת חלקים'), text('מחירים ל-10,000 יחידות, לפי הצעות ספקים ממרץ 2027.')],
      title: text('כמה עולה לוח אחד'),
      footer: FOOTER_HE,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['רכיב', 'תיאור', 'כמות', 'מחיר ליחידה', 'סה״כ'],
        ['U1', 'בקר עם רדיו LoRa', '1', '$2.10', '$2.10'],
        ['U3', 'מעבד אות אולטרסוני', '1', '$1.35', '$1.35'],
        ['BT1', 'סוללת ליתיום AA', '1', '$2.40', '$2.40'],
        ['PCB', 'לוח של ארבע שכבות', '1', '$0.85', '$0.85'],
        ['C, R, L', 'רכיבים פסיביים', '31', '$0.016', '$0.48'],
        ['', 'סה״כ ללוח', '', '', '$7.18'],
      ],
    },
  },
  {
    layout: 'l_shvav_full_image',
    name: 'קו הבדיקות',
    content: {
      image: { assetId: pictures.shvavLine.id },
      caption: text('קו הבדיקות'),
      title: text('כל לוח נבדק', 'לפני שהוא נסגר'),
      body: text('פאנל של שמונה לוחות עובר בדיקות זרם, רדיו וחיישן בתוך 40 שניות.'),
    },
  },
  {
    layout: 'l_shvav_quote',
    name: 'מהשטח',
    content: {
      quote: text(
        'התקנו את המונים בבורות הכי רטובים שמצאנו. אחרי חודשיים, כולם עדיין מדווחים כל בוקר.',
      ),
      attribution: text('שירה גולן'),
      caption: text('מנהלת תפעול, תאגיד המים של הפיילוט'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shvav_team',
    name: 'הצוות',
    content: {
      caption: [
        text('הצוות'),
        text('מנהלת חומרה'),
        text('RF ואנטנות'),
        text('קושחה'),
        text('ייצור'),
      ],
      title: text('מי בנה את הלוח'),
      image: [
        { assetId: pictures.shvavTeam1.id },
        { assetId: pictures.shvavTeam2.id },
        { assetId: pictures.shvavTeam3.id },
        { assetId: pictures.shvavTeam4.id },
      ],
      subtitle: [text('רותי אלמוג'), text('יואב כרמי'), text('מיכל שגב'), text('אבי נחום')],
      body: [
        text('הובילה את rev C, מהסכמה ועד ה-EVT.'),
        text('כיוון את האנטנה בתוך קופסה מלאה במים.'),
        text('כתבה קושחה שישנה 99.9% מהזמן.'),
        text('בנה את עמדת הבדיקה של קו הייצור.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shvav_closing',
    name: 'סיום',
    content: {
      caption: [text('השלב הבא: DVT'), text('hardware@zrima.example · zrima.example/wm10')],
      title: text('מוכנים', 'לייצור'),
      body: [
        text('200 יחידות DVT יוצאות לייצור באפריל'),
        text('מחפשים עוד שני תאגידי מים לפיילוט'),
        text('שאלות? הלוח עובר עכשיו בין הידיים'),
      ],
    },
  },
];

const sampleEn: SampleSlide[] = [
  {
    layout: 'l_shvav_hero',
    name: 'Opening',
    content: {
      caption: [text('Zrima Labs · Hardware'), text('Ruti Almog · EVT review · 14 Mar 2027')],
      title: text('Ten years,', 'one battery'),
      subtitle: text('The WM-10 smart water meter,', 'from prototype to production'),
    },
  },
  {
    layout: 'l_shvav_section',
    name: 'The power budget',
    content: {
      number: text('01'),
      caption: text('Part one'),
      title: text('Power budget'),
      subtitle: text('Every microamp counts, for ten years.'),
    },
  },
  {
    layout: 'l_shvav_text',
    name: 'This review',
    content: {
      title: text('What this review covers'),
      body: {
        paragraphs: [
          para(
            'Four questions decide whether WM-10 moves on to DVT in April. Each has an owner on the team and a number we can measure, and each gets its answer by the end of this review.',
            { spaceAfter: 36 },
          ),
          ...points(
            [
              ['Power: ', 'does the budget hold ten years on one cell, even in a cold winter?'],
              ['Cost: ', 'what one board costs at 10,000 units, with the radio and the case.'],
              ['The field: ', 'what the 60 meters running since January have taught us.'],
              ['Production: ', 'what is left to close before we order the first batch.'],
            ],
            { kind: 'number', mark: token('primary'), gap: 22 },
          ).paragraphs,
        ],
      },
    },
  },
  {
    layout: 'l_shvav_big_number',
    name: 'The average current',
    content: {
      caption: [
        text('The power budget'),
        text('Deep-sleep current'),
        text('One AA-size lithium cell'),
        text('Years of battery, with margin'),
      ],
      title: text('Where the current goes'),
      number: [text('24µA'), text('1.8µA'), text('2.6Ah'), text('10.8')],
      subtitle: text('Average draw over a whole day'),
      body: text(
        'The meter sleeps most of the time. It wakes every 15 minutes to measure, and transmits once a day.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvav_cards',
    name: 'Three parts',
    content: {
      caption: [
        text('Three parts, one budget'),
        text('U1 · MCU'),
        text('U1 · Radio'),
        text('U3 · Sensor'),
      ],
      title: text('Who draws what'),
      subtitle: [
        text('An MCU that sleeps'),
        text('A radio, once a day'),
        text('No-contact sensing'),
      ],
      body: [
        text('Wakes for 40 ms, measures, and goes back to sleep.'),
        text('One message a day, 1.2 s on air.'),
        text('Ultrasound, with no parts to wear.'),
        text('Together: a hundredth of one lit LED.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvav_text_image',
    name: 'The board',
    content: {
      caption: text('Rev C up close'),
      title: text('One board,', '38 parts'),
      image: { assetId: pictures.shvavBoard.id },
      subtitle: [
        text('MCU and radio in one chip'),
        text('Four layers, not six'),
        text('A coat against the damp'),
      ],
      body: [
        text('The built-in radio saves a chip, two crystals and 9 µA.'),
        text('New routing cut the board cost by 31%, antenna intact.'),
        text('The meter lives in a wet pit, all year round.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvav_timeline',
    name: 'The road to production',
    content: {
      caption: [
        text('The road to production'),
        text('Each gate depends on the power budget and reliability.'),
      ],
      title: text('From EVT to mass production'),
      number: [text('EVT'), text('DVT'), text('PVT'), text('MP')],
      subtitle: [
        text('Engineering build'),
        text('Design validation'),
        text('Production validation'),
        text('Mass production'),
      ],
      body: [
        text('January 2027', '60 meters in the field'),
        text('April 2027', '200 stress-test units'),
        text('June 2027', '1,000 off the line'),
        text('September 2027', '10,000 a quarter'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvav_process',
    name: 'The signal chain',
    content: {
      caption: [
        text('The signal chain'),
        text('Ultrasonic transducer'),
        text('16-bit sampling'),
        text('Filters, computes flow'),
        text('One message a day'),
        text('Leak alerts'),
      ],
      title: text('From the water to the cloud'),
      subtitle: [text('Sensor'), text('Amp and ADC'), text('MCU'), text('Radio'), text('Cloud')],
      number: [text('6.2µA'), text('1.1µA'), text('4.3µA'), text('12.4µA'), text('0µA')],
      body: text('24 µA in all, and the radio alone draws more than half of it.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvav_comparison',
    name: 'Rev B and rev C',
    content: {
      caption: [text('What changed'), text('REV B · prototype'), text('REV C · the EVT board')],
      title: text('Rev B against rev C'),
      subtitle: [text('61 µA on average'), text('24 µA on average')],
      body: [
        bullets(
          'Six layers and 52 parts',
          'An NB-IoT radio on its own chip',
          '4.1 years of battery',
        ),
        bullets('Four layers and 38 parts', 'A LoRa radio inside the MCU', '10.8 years of battery'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvav_chart',
    name: 'On the scope',
    content: {
      caption: [text('Lab measurement'), text('Lab unit 17, March 2027.')],
      title: text('One transmission, on the scope'),
      number: [text('1.2s'), text('99.3%')],
      body: [text('On air, once a day.'), text('Of pilot readings reached the cloud.')],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'line',
      title: 'Current while transmitting, mA',
      data: { categories: TIMES, series: [{ name: 'mA', values: CURRENT }] },
    },
  },
  {
    layout: 'l_shvav_table',
    name: 'Bill of materials',
    content: {
      caption: [
        text('Bill of materials'),
        text('Prices at 10,000 units, from supplier quotes of March 2027.'),
      ],
      title: text('What one board costs'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['Ref', 'Part', 'Qty', 'Unit price', 'Total'],
        ['U1', 'MCU with LoRa radio', '1', '$2.10', '$2.10'],
        ['U3', 'Ultrasonic front end', '1', '$1.35', '$1.35'],
        ['BT1', 'AA lithium cell', '1', '$2.40', '$2.40'],
        ['PCB', 'Four-layer board', '1', '$0.85', '$0.85'],
        ['C, R, L', 'Passive parts', '31', '$0.016', '$0.48'],
        ['', 'Total per board', '', '', '$7.18'],
      ],
    },
  },
  {
    layout: 'l_shvav_full_image',
    name: 'The test line',
    content: {
      image: { assetId: pictures.shvavLine.id },
      caption: text('The test line'),
      title: text('Every board tested', 'before it is sealed'),
      body: text('A panel of eight boards passes current, radio and sensor tests in 40 seconds.'),
    },
  },
  {
    layout: 'l_shvav_quote',
    name: 'From the field',
    content: {
      quote: text(
        'We put the meters in the wettest pits we could find. Two months on, every one still reports each morning.',
      ),
      attribution: text('Shira Golan'),
      caption: text('Head of operations, the pilot’s water utility'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvav_team',
    name: 'The team',
    content: {
      caption: [
        text('The team'),
        text('Hardware lead'),
        text('RF & antenna'),
        text('Firmware'),
        text('Manufacturing'),
      ],
      title: text('Who built the board'),
      image: [
        { assetId: pictures.shvavTeam1.id },
        { assetId: pictures.shvavTeam2.id },
        { assetId: pictures.shvavTeam3.id },
        { assetId: pictures.shvavTeam4.id },
      ],
      subtitle: [text('Ruti Almog'), text('Yoav Karmi'), text('Michal Segev'), text('Avi Nahum')],
      body: [
        text('Led rev C from schematic to EVT.'),
        text('Tuned the antenna underwater.'),
        text('Firmware that sleeps 99.9%.'),
        text('Built the line’s test station.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shvav_closing',
    name: 'Closing',
    content: {
      caption: [text('Next: DVT'), text('hardware@zrima.example · zrima.example/wm10')],
      title: text('Ready for', 'production'),
      body: [
        text('200 DVT units go to the line in April'),
        text('We are looking for two more utilities to pilot'),
        text('Questions? The board is going round the room'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const shvavSamples = technologySamples('shvav', sampleHe, sampleEn);

/** The Shvav template: the theme, its layouts for both directions, and its sample deck. */
export function shvavTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(shvavTheme),
    description:
      'Circuit board: deep solder-mask green, gold pads and traces, silkscreen labels, key figures inside chips, an oscilloscope chart, for hardware, IoT and engineering reviews.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.shvavBoard,
      pictures.shvavLine,
      pictures.shvavTeam1,
      pictures.shvavTeam2,
      pictures.shvavTeam3,
      pictures.shvavTeam4,
    ]),
  };
  // What makes up a slide is the slide's own, and the user changes it (ADR-094).
  const finished = withObjects(template);
  finished.sample = sampleSlides(finished, sampleHe);
  return finished;
}

export const entry = { id: 'shvav', template: shvavTemplate, samples: shvavSamples };
