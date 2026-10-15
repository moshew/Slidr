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
import { techPictures as pictures } from './pictures';

/**
 * Anan (cloud): the slide is a cloud architecture diagram come to life. A cool, airy ground with
 * an isometric dot grid; on it, drawn in isometric projection, the things a platform is made of:
 * servers as blocks with their slots and lights, databases as cylinders of stacked disks, regions
 * as plates with a dashed boundary, a cloud over them, each casting a long soft shadow. Thin
 * dashed connectors with small arrowheads join them as an architecture diagram does, with packets
 * of traffic on the way. The chrome is a cloud console's: region chips, green status dots, the
 * uptime of the last thirty days in tiny bars at the foot, health badges. Deep navy text, one
 * confident sky blue, a teal for data and health, and a warm orange kept for what matters: the
 * canary, the packet in flight. For decks about cloud, infrastructure and DevOps: architecture
 * reviews, migrations, multi-region launches, reliability reports.
 *
 * The drawings without letters flip with the slide in a left-to-right deck: the light then falls
 * from the other side, on every drawing of the slide alike. The ones with letters (chips, console
 * panels) are turned back so they read.
 */
export const ananTheme: Theme = {
  id: 'anan',
  name: 'Anan',
  colors: {
    bg: '#f3f7fc',
    surface: '#ffffff',
    text: '#0c1a33',
    muted: '#55667f',
    primary: '#0f6cdc',
    secondary: '#13b3a5',
    accent: '#ff7a29',
    chart: ['#0f6cdc', '#13b3a5', '#ff7a29', '#0c1a33', '#8dbcf2', '#55667f'],
  },
  // A geometric face for the titles (Rubik's Hebrew, Manrope's Latin and figures), a plain one
  // for the reading (Heebo's Hebrew) with the same Latin, so figures and spaces match throughout.
  fonts: {
    heading: { he: 'Rubik', latin: 'Manrope' },
    body: { he: 'Heebo', latin: 'Manrope' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 104,
      weight: 700,
      lineHeight: 1.06,
      letterSpacing: -2,
      color: { token: 'text' },
    },
    title: {
      font: 'heading',
      size: 60,
      weight: 700,
      lineHeight: 1.12,
      letterSpacing: -0.8,
      color: { token: 'text' },
    },
    heading: { font: 'heading', size: 36, weight: 600, lineHeight: 1.25, color: { token: 'text' } },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 20,
  shadow: { x: 0, y: 16, blur: 40, color: { value: '#0c1a33', alpha: 0.1 } },
  // The ground: an isometric lattice of faint dots, two offset grids at the ratio of the
  // projection (56 : 32, as √3 : 1). Free CSS, the same from both sides.
  background: {
    fill: {
      kind: 'css',
      value: [
        'radial-gradient(circle, color-mix(in srgb, var(--color-primary) 26%, transparent) 1.7px, transparent 2.4px) 0 0 / 56px 32px',
        'radial-gradient(circle, color-mix(in srgb, var(--color-primary) 26%, transparent) 1.7px, transparent 2.4px) 28px 16px / 56px 32px',
        'var(--color-bg)',
      ].join(', '),
    },
  },
  backgroundVariants: [
    SURFACE,
    {
      // A morning sky: a breath of the primary colour at the top, fading to the ground.
      fill: {
        kind: 'linear',
        angle: 180,
        stops: [
          { color: { value: '#e4effc' }, at: 0 },
          { color: { value: '#f6f9fd' }, at: 1 },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// The colours of the drawings

const NAVY = '#0c1a33';
const MUTED = '#55667f';
const BLUE = '#0f6cdc';
const TEAL = '#13b3a5';
const ORANGE = '#ff7a29';
const WHITE = '#ffffff';
const GROUND = '#f3f7fc';
/** The green of a status light: a console's, which stays itself on every theme. */
const GREEN = '#1fbf6a';

const PAINT = {
  [NAVY]: token('text'),
  [MUTED]: token('muted'),
  [BLUE]: token('primary'),
  [TEAL]: token('secondary'),
  [ORANGE]: token('accent'),
  [WHITE]: token('surface'),
  [GROUND]: token('bg'),
};

const MONO = "font-family=\"'JetBrains Mono', ui-monospace, monospace\"";
const SANS = "font-family=\"Manrope, 'Heebo', sans-serif\"";

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

const art = (id: string, frame: Frame, body: string) => drawing(id, frame, svg(frame.w, frame.h, body), PAINT);

const r1 = (v: number) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------------------------------------
// Isometric drawing: x runs down to the right, y down to the left, z up

const COS = Math.cos(Math.PI / 6);

type P3 = readonly [number, number, number];
/** A layer of paint: a colour and how much of it covers what is under it. */
type Paint = readonly [color: string, opacity: number];
/** The paint of a solid's three visible faces: the top, the lit face, the face in shade. */
interface Look {
  top: readonly Paint[];
  right: readonly Paint[];
  left: readonly Paint[];
}

const LOOK = {
  white: {
    top: [[WHITE, 1]],
    right: [[WHITE, 1], [BLUE, 0.1]],
    left: [[WHITE, 1], [BLUE, 0.24], [NAVY, 0.04]],
  },
  sky: {
    top: [[WHITE, 1], [BLUE, 0.3]],
    right: [[WHITE, 1], [BLUE, 0.52]],
    left: [[WHITE, 1], [BLUE, 0.72], [NAVY, 0.08]],
  },
  blue: {
    top: [[BLUE, 1], [WHITE, 0.22]],
    right: [[BLUE, 1]],
    left: [[BLUE, 1], [NAVY, 0.26]],
  },
  teal: {
    top: [[TEAL, 1], [WHITE, 0.25]],
    right: [[TEAL, 1]],
    left: [[TEAL, 1], [NAVY, 0.22]],
  },
  orange: {
    top: [[ORANGE, 1], [WHITE, 0.22]],
    right: [[ORANGE, 1]],
    left: [[ORANGE, 1], [NAVY, 0.18]],
  },
  navy: {
    top: [[NAVY, 1], [WHITE, 0.2]],
    right: [[NAVY, 1], [WHITE, 0.08]],
    left: [[NAVY, 1]],
  },
  /** What is left behind: grey, as an old machine room is. */
  legacy: {
    top: [[WHITE, 1], [NAVY, 0.1]],
    right: [[WHITE, 1], [NAVY, 0.2]],
    left: [[WHITE, 1], [NAVY, 0.32]],
  },
  plate: {
    top: [[WHITE, 1]],
    right: [[WHITE, 1], [BLUE, 0.16]],
    left: [[WHITE, 1], [BLUE, 0.34], [NAVY, 0.05]],
  },
} as const satisfies Record<string, Look>;

/** An isometric scene, drawn into a box of the slide from an origin in it. */
class Scene {
  private readonly parts: string[] = [];
  private readonly defs: string[] = [];
  private count = 0;

  constructor(
    readonly ox: number,
    readonly oy: number,
    readonly k = 1,
  ) {}

  /** The extent of what has been drawn, in the scene's own coordinates. */
  private box0 = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

  private grow(X: number, Y: number, r = 0) {
    const b = this.box0;
    b.x0 = Math.min(b.x0, X - r);
    b.x1 = Math.max(b.x1, X + r);
    b.y0 = Math.min(b.y0, Y - r);
    b.y1 = Math.max(b.y1, Y + r);
  }

  xy([x, y, z]: P3): [number, number] {
    return [this.ox + (x - y) * COS * this.k, this.oy + ((x + y) / 2 - z) * this.k];
  }

  /** Makes room for something drawn by hand around a point. */
  extent(p: P3, r = 0) {
    const [X, Y] = this.xy(p);
    this.grow(X, Y, r);
    return [X, Y] as const;
  }

  /** A point that is drawn: it counts toward the extent of the scene. */
  private xyd(p: P3): [number, number] {
    const [X, Y] = this.xy(p);
    this.grow(X, Y);
    return [X, Y];
  }

  private pt(p: P3) {
    const [X, Y] = this.xyd(p);
    return `${r1(X)} ${r1(Y)}`;
  }

  d(points: readonly P3[], close = true) {
    return `M${points.map((p) => this.pt(p)).join('L')}${close ? 'Z' : ''}`;
  }

  raw(markup: string) {
    this.parts.push(markup);
    return this;
  }

  def(markup: (id: string) => string) {
    const id = `g${++this.count}`;
    this.defs.push(markup(id));
    return id;
  }

  face(points: readonly P3[], paints: readonly Paint[]) {
    const d = this.d(points);
    for (const [color, o] of paints) {
      this.parts.push(`<path d="${d}" fill="${color}"${o < 1 ? ` fill-opacity="${o}"` : ''}/>`);
    }
  }

  /** A block: its shade, its lit face, its top, and a light along the edges of the top. */
  box(x: number, y: number, z: number, w: number, d: number, h: number, look: Look = LOOK.white) {
    const t = z + h;
    this.face(
      [
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d, t],
        [x, y + d, t],
      ],
      look.left,
    );
    this.face(
      [
        [x + w, y, z],
        [x + w, y + d, z],
        [x + w, y + d, t],
        [x + w, y, t],
      ],
      look.right,
    );
    this.face(
      [
        [x, y, t],
        [x + w, y, t],
        [x + w, y + d, t],
        [x, y + d, t],
      ],
      look.top,
    );
    this.raw(
      `<path d="${this.d(
        [
          [x, y + d, t],
          [x + w, y + d, t],
          [x + w, y, t],
        ],
        false,
      )}" stroke="${WHITE}" stroke-opacity=".95" stroke-width="1.6" stroke-linejoin="round"/>`,
    );
    return this;
  }

  private shade?: string;

  /** The long soft shadow a solid casts away from the light, along y, over the ground at z. */
  shadow(x: number, y: number, z: number, w: number, d: number, length: number, strength = 0.14) {
    this.shade ??= this.def(
      (id) =>
        `<linearGradient id="${id}" x1="0.85" y1="0" x2="0.1" y2="1"><stop offset="0" stop-color="${NAVY}" stop-opacity="1"/><stop offset="1" stop-color="${NAVY}" stop-opacity="0"/></linearGradient>`,
    );
    this.raw(
      `<path d="${this.d([
        [x, y + d, z],
        [x + w, y + d, z],
        [x + w, y + d + length, z],
        [x, y + d + length, z],
      ])}" fill="url(#${this.shade})" fill-opacity="${strength}"/>`,
    );
    return this;
  }

  /** A server: a block with slots and their lights on the lit face. */
  server(x: number, y: number, z: number, w: number, d: number, h: number, look: Look = LOOK.white, light = GREEN) {
    this.box(x, y, z, w, d, h, look);
    const rows = Math.max(1, Math.floor((h - 10) / 18));
    const step = (h - 10) / rows;
    const ink = look === LOOK.blue || look === LOOK.navy || look === LOOK.teal ? WHITE : NAVY;
    for (let i = 0; i < rows; i++) {
      const zz = z + h - 10 - i * step - step / 2;
      this.raw(
        `<path d="${this.d(
          [
            [x + w, y + d * 0.42, zz],
            [x + w, y + d - 6, zz],
          ],
          false,
        )}" stroke="${ink}" stroke-opacity="${ink === WHITE ? 0.55 : 0.22}" stroke-width="2.4" stroke-linecap="round"/>`,
      );
      const [lx, ly] = this.xy([x + w, y + d * 0.2, zz]);
      const on = i === 1 && light !== GREEN ? light : GREEN;
      this.raw(`<circle cx="${r1(lx)}" cy="${r1(ly)}" r="${2.6 * this.k}" fill="${on}"/>`);
    }
    return this;
  }

  /** A cylinder; with disks, a database. Its colour is laid over white, darker on the shade side. */
  cylinder(cx: number, cy: number, z: number, r: number, h: number, tint = TEAL, disks = 0, lights = true) {
    const [X, Yb] = this.xy([cx, cy, z]);
    const Yt = Yb - h * this.k;
    const rx = r * Math.SQRT2 * COS * this.k;
    const ry = r * Math.SQRT2 * 0.5 * this.k;
    const [L, R] = [r1(X - rx), r1(X + rx)];
    this.grow(X - rx, Yb + ry);
    this.grow(X + rx, Yt - ry);
    const side = `M${L} ${r1(Yb)}L${L} ${r1(Yt)}A${r1(rx)} ${r1(ry)} 0 0 0 ${R} ${r1(Yt)}L${R} ${r1(Yb)}A${r1(rx)} ${r1(ry)} 0 0 1 ${L} ${r1(Yb)}Z`;
    const body = this.def(
      (id) =>
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${L}" y1="0" x2="${R}" y2="0">` +
        `<stop offset="0" stop-color="${tint}" stop-opacity=".92"/><stop offset=".55" stop-color="${tint}" stop-opacity=".7"/>` +
        `<stop offset=".8" stop-color="${tint}" stop-opacity=".52"/><stop offset="1" stop-color="${tint}" stop-opacity=".66"/></linearGradient>`,
    );
    this.raw(`<path d="${side}" fill="${WHITE}"/><path d="${side}" fill="url(#${body})"/>`);
    for (let i = 1; i <= disks; i++) {
      const y = r1(Yb - (h * this.k * i) / (disks + 1));
      this.raw(
        `<path d="M${L} ${y}A${r1(rx)} ${r1(ry)} 0 0 0 ${R} ${y}" stroke="${WHITE}" stroke-opacity=".95" stroke-width="${r1(2.4 * this.k)}"/>`,
      );
      if (lights) {
        this.raw(
          `<circle cx="${r1(X + rx * 0.45)}" cy="${r1(y + ry * 0.89 - 9 * this.k)}" r="${r1(2.6 * this.k)}" fill="${GREEN}"/>`,
        );
      }
    }
    this.raw(
      `<ellipse cx="${r1(X)}" cy="${r1(Yt)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${WHITE}"/>` +
        `<ellipse cx="${r1(X)}" cy="${r1(Yt)}" rx="${r1(rx)}" ry="${r1(ry)}" fill="${tint}" fill-opacity=".3"/>` +
        `<ellipse cx="${r1(X)}" cy="${r1(Yt)}" rx="${r1(rx * 0.62)}" ry="${r1(ry * 0.62)}" stroke="${WHITE}" stroke-opacity=".9" stroke-width="${r1(1.6 * this.k)}"/>`,
    );
    return this;
  }

  /** The shadow of a cylinder, from the band of its base across the light. */
  cylinderShadow(cx: number, cy: number, z: number, r: number, length: number, strength = 0.14) {
    return this.shadow(cx - r * 0.75, cy - r * 0.75, z, r * 1.5, r * 1.5, length, strength);
  }

  /** A region: a plate with a dashed boundary inside its top. */
  plate(x: number, y: number, z: number, w: number, d: number, h = 14, color = BLUE, look: Look = LOOK.plate) {
    this.box(x, y, z, w, d, h, look);
    const m = Math.min(w, d) * 0.07;
    const t = z + h;
    this.raw(
      `<path d="${this.d([
        [x + m, y + m, t],
        [x + w - m, y + m, t],
        [x + w - m, y + d - m, t],
        [x + m, y + d - m, t],
      ])}" stroke="${color}" stroke-opacity=".55" stroke-width="${r1(1.8 * this.k)}" stroke-dasharray="${r1(8 * this.k)} ${r1(6 * this.k)}" stroke-linejoin="round"/>`,
    );
    return this;
  }

  /** A connector: dashed, through the points, with an arrowhead at its end. */
  link(points: readonly P3[], color = BLUE, rest: { head?: boolean; width?: number; dash?: string; opacity?: number } = {}) {
    const { head = true, width = 2.4, dash = '7 7', opacity = 0.9 } = rest;
    this.raw(
      `<path d="${this.d(points, false)}" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${r1(width * this.k)}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round"/>`,
    );
    if (head) {
      const [ax, ay] = this.xy(points[points.length - 2]!);
      const [bx, by] = this.xy(points[points.length - 1]!);
      this.raw(arrowhead(ax, ay, bx, by, color, 9 * this.k));
    }
    return this;
  }

  /** A packet of traffic on its way, at a point. */
  packet(p: P3, color = ORANGE, size = 6) {
    const [X, Y] = this.xy(p);
    this.grow(X, Y, size * 2 * this.k);
    this.raw(
      `<circle cx="${r1(X)}" cy="${r1(Y)}" r="${r1(size * 2 * this.k)}" fill="${color}" fill-opacity=".18"/>` +
        `<circle cx="${r1(X)}" cy="${r1(Y)}" r="${r1(size * this.k)}" fill="${color}"/>`,
    );
    return this;
  }

  /** A cloud, standing in the scene, its foot at a point. */
  cloud(p: P3, width: number) {
    const [X, Y] = this.xy(p);
    this.grow(X - width * this.k * 0.5, Y - width * this.k * 0.48);
    this.grow(X + width * this.k * 0.5, Y + width * this.k * 0.2);
    this.raw(cloudShape(X, Y, width * this.k, (m) => this.def(m)));
    return this;
  }

  /** A healthy badge over a point: a green disc with a tick. */
  ok(p: P3, size = 13) {
    const [X, Y] = this.xy(p);
    this.grow(X, Y, size * 1.75 * this.k);
    this.raw(tick(X, Y, size * this.k));
    return this;
  }

  svg(w: number, h: number) {
    return svg(w, h, (this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '') + this.parts.join(''));
  }

  /**
   * How the scene is set into a box: scaled to fit inside the padding (never past `max`) and
   * placed by `ax`, `ay` (0 start, 0.5 middle, 1 end of the free room on each axis).
   */
  fitting(w: number, h: number, pad = 8, max = 4, ax = 0.5, ay = 0.5) {
    const b = this.box0;
    const scale = Math.min(max, (w - 2 * pad) / (b.x1 - b.x0), (h - 2 * pad) / (b.y1 - b.y0));
    const tx = pad + (w - 2 * pad - (b.x1 - b.x0) * scale) * ax - b.x0 * scale;
    const ty = pad + (h - 2 * pad - (b.y1 - b.y0) * scale) * ay - b.y0 * scale;
    return {
      scale,
      map: ([X, Y]: [number, number]): [number, number] => [tx + X * scale, ty + Y * scale],
      markup: () =>
        svg(
          w,
          h,
          (this.defs.length ? `<defs>${this.defs.join('')}</defs>` : '') +
            `<g transform="translate(${r1(tx)} ${r1(ty)}) scale(${Math.round(scale * 1000) / 1000})">${this.parts.join('')}</g>`,
        ),
    };
  }

  /** The scene fitted into a box. */
  fit(w: number, h: number, pad = 8, max = 4, ax = 0.5, ay = 0.5) {
    return this.fitting(w, h, pad, max, ax, ay).markup();
  }
}

/** An arrowhead at (bx, by), pointing away from (ax, ay). */
function arrowhead(ax: number, ay: number, bx: number, by: number, color: string, size: number) {
  const a = Math.atan2(by - ay, bx - ax);
  const p = (angle: number, len: number) =>
    `${r1(bx + Math.cos(angle) * len)} ${r1(by + Math.sin(angle) * len)}`;
  return `<path d="M${r1(bx)} ${r1(by)}L${p(a + Math.PI - 0.5, size)}L${p(a + Math.PI, size * 0.62)}L${p(a + Math.PI + 0.5, size)}Z" fill="${color}"/>`;
}

/** A green disc with a tick: healthy. */
function tick(X: number, Y: number, s: number) {
  return (
    `<circle cx="${r1(X)}" cy="${r1(Y)}" r="${r1(s * 1.75)}" fill="${GREEN}" fill-opacity=".18"/>` +
    `<circle cx="${r1(X)}" cy="${r1(Y)}" r="${r1(s)}" fill="${GREEN}"/>` +
    `<path d="M${r1(X - s * 0.45)} ${r1(Y + s * 0.02)}l${r1(s * 0.3)} ${r1(s * 0.3)} ${r1(s * 0.58)}-${r1(s * 0.6)}" stroke="${WHITE}" stroke-width="${r1(s * 0.24)}" stroke-linecap="round" stroke-linejoin="round"/>`
  );
}

/**
 * A cloud seen from the front, its foot at (X, Y): a pill and three bumps, white, with a breath
 * of the primary colour toward the foot and a soft shadow under it.
 */
function cloudShape(X: number, Y: number, w: number, def: (m: (id: string) => string) => string) {
  const c = (dx: number, dy: number, r: number) =>
    `<circle cx="${r1(X + dx * w)}" cy="${r1(Y + dy * w)}" r="${r1(r * w)}"/>`;
  const pill = `<rect x="${r1(X - 0.42 * w)}" y="${r1(Y - 0.2 * w)}" width="${r1(0.84 * w)}" height="${r1(0.2 * w)}" rx="${r1(0.1 * w)}"/>`;
  const shape = pill + c(-0.21, -0.17, 0.15) + c(0.02, -0.25, 0.22) + c(0.24, -0.15, 0.14);
  const clip = def((id) => `<clipPath id="${id}">${shape}</clipPath>`);
  const tint = def(
    (id) =>
      `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset=".25" stop-color="${BLUE}" stop-opacity="0"/><stop offset="1" stop-color="${BLUE}" stop-opacity=".2"/></linearGradient>`,
  );
  const lift = def(
    (id) =>
      `<radialGradient id="${id}"><stop offset="0" stop-color="${BLUE}" stop-opacity=".22"/><stop offset="1" stop-color="${BLUE}" stop-opacity="0"/></radialGradient>`,
  );
  return (
    `<ellipse cx="${r1(X)}" cy="${r1(Y + 0.12 * w)}" rx="${r1(0.5 * w)}" ry="${r1(0.08 * w)}" fill="url(#${lift})"/>` +
    `<g fill="${WHITE}">${shape}</g>` +
    `<rect x="${r1(X - 0.5 * w)}" y="${r1(Y - 0.5 * w)}" width="${r1(w)}" height="${r1(0.5 * w)}" fill="url(#${tint})" clip-path="url(#${clip})"/>` +
    `<path d="M${r1(X - 0.3 * w)} ${r1(Y - 0.27 * w)}a${r1(0.15 * w)} ${r1(0.15 * w)} 0 0 1 ${r1(0.12 * w)}-${r1(0.06 * w)}" stroke="${WHITE}" stroke-width="${r1(0.012 * w)}" stroke-linecap="round" stroke-opacity=".9"/>`
  );
}

// ---------------------------------------------------------------------------------------------
// The console's chrome

/**
 * A pill of the console: a status light and a name in mono (a region, a service). With a
 * pointer, a small notch at the middle of its top, as a label of a diagram points at its thing.
 */
function chipMarkup(
  label: string,
  light: string = GREEN,
  rest: { size?: number; ink?: string; fill?: string; pointer?: boolean } = {},
) {
  const { size = 19, ink = NAVY, fill = WHITE, pointer = false } = rest;
  const ph = Math.round(size * 1.8);
  const top = pointer ? 9 : 0;
  const h = ph + top + 2;
  const w = Math.round(38 + label.length * size * 0.6 + 16);
  const notch = pointer
    ? `<path d="M${w / 2 - 9} ${top + 1.5}L${w / 2} ${top - 7.5}L${w / 2 + 9} ${top + 1.5}" fill="${fill}" stroke="${NAVY}" stroke-opacity=".14" stroke-width="1.5" stroke-linejoin="round"/>`
    : '';
  const body =
    `<rect x="1" y="${top + 1}" width="${w - 2}" height="${ph - 2}" rx="${(ph - 2) / 2}" fill="${fill}" stroke="${NAVY}" stroke-opacity=".14" stroke-width="1.5"/>` +
    notch +
    (pointer ? `<path d="M${w / 2 - 8} ${top + 2.2}H${w / 2 + 8}" stroke="${fill}" stroke-width="2.4"/>` : '') +
    `<circle cx="${ph / 2 + 2}" cy="${top + ph / 2}" r="${size * 0.5}" fill="${light}" fill-opacity=".2"/>` +
    `<circle cx="${ph / 2 + 2}" cy="${top + ph / 2}" r="${size * 0.27}" fill="${light}"/>` +
    `<text x="${ph / 2 + 14}" y="${r1(top + ph / 2 + size * 0.36)}" ${MONO} font-size="${size}" font-weight="500" fill="${ink}">${label}</text>`;
  return { w, h, markup: svg(w, h, body) };
}

/**
 * A chip whose middle is at `cx` of the slide, as drawn for right to left: its top at `top`, or,
 * with a pointer, the tip of its notch there.
 */
function chip(id: string, cx: number, top: number, label: string, rest: { light?: string; size?: number; pointer?: boolean } = {}): Element {
  const { light = GREEN, size = 19, pointer = false } = rest;
  const { w, h, markup } = chipMarkup(label, light, { size, pointer });
  return lettered(id, { x: Math.round(cx - w / 2), y: Math.round(top), w, h }, markup);
}

/** The thirty days of uptime as tiny bars: every one whole but the `bad` ones. */
function uptimeBars(w: number, h: number, count: number, bad: Record<number, number>, gap = 2) {
  const bw = (w - gap * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => {
    const share = bad[i];
    const color = share === undefined ? TEAL : ORANGE;
    const bh = share === undefined ? h : h * share;
    return `<rect x="${r1(i * (bw + gap))}" y="${r1(h - bh)}" width="${r1(bw)}" height="${r1(bh)}" rx="${r1(Math.min(2, bw / 2))}" fill="${color}"${share === undefined ? ' fill-opacity=".85"' : ''}/>`;
  }).join('');
}

/** The template's mark: an isometric block, lit from the start side. */
const MARK = svg(
  46,
  50,
  `<path d="M23 3 42.5 14 23 25 3.5 14Z" fill="${WHITE}"/><path d="M23 3 42.5 14 23 25 3.5 14Z" fill="${BLUE}" fill-opacity=".38"/>` +
    `<path d="M23 25 42.5 14v22.5L23 47.5Z" fill="${BLUE}"/>` +
    `<path d="M3.5 14 23 25v22.5L3.5 36.5Z" fill="${BLUE}"/><path d="M3.5 14 23 25v22.5L3.5 36.5Z" fill="${NAVY}" fill-opacity=".35"/>` +
    `<path d="M3.5 14 23 25 42.5 14" stroke="${WHITE}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<circle cx="32.5" cy="29" r="2.6" fill="${WHITE}"/><circle cx="32.5" cy="36" r="2.6" fill="${WHITE}" fill-opacity=".6"/>`,
);

const mark = (id: string, frame: Frame) => drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** A node of the diagram before a kicker: a ring and its dot. */
const node = (id: string, start: number, top: number, color = BLUE) =>
  art(
    id,
    at(start, top, 26, 26),
    `<circle cx="13" cy="13" r="11" fill="${WHITE}" stroke="${color}" stroke-width="3"/><circle cx="13" cy="13" r="4.6" fill="${color}"/>`,
  );

/** The start of the text column and the end margin. */
const START = 128;
const END = 128;
const WIDTH = 1920 - START - END;
/** Where text starts after a node or a glyph. */
const AFTER = START + 42;

/** The kicker on its node, and the title. */
function head(name: string, width = 1240, lines = 2) {
  return {
    placeholders: [
      place('p_kicker', 'caption', at(AFTER, 84, Math.min(900, width - 42), 34), 'caption'),
      // Room for two lines: a title another deck brings may run to a second.
      place('p_title', 'title', at(START, 122, width, 74 * lines), 'title'),
    ],
    decorations: [node(`d_anan_${name}_node`, START, 88)],
  };
}

/** The connector along the foot: a dashed line from node to node. */
function footLine(id: string, top = 928) {
  const w = WIDTH;
  return art(
    id,
    atEnd(END - 6, top - 6, w + 12, 12),
    `<path d="M14 6H${w - 2}" stroke="${BLUE}" stroke-opacity=".38" stroke-width="2" stroke-dasharray="2 8" stroke-linecap="round"/>` +
      `<circle cx="6" cy="6" r="4.5" fill="${WHITE}" stroke="${BLUE}" stroke-width="2"/>` +
      `<circle cx="${w + 6}" cy="6" r="4.5" fill="${BLUE}"/>`,
  );
}

/**
 * The foot of a content slide: the connector, the mark and the deck's name at the start; at the
 * end the uptime of the last thirty days and the slide's number in a pill of the console.
 */
function foot(name: string, withFooter = true) {
  const strip = svg(
    214,
    30,
    `<circle cx="9" cy="15" r="9" fill="${GREEN}" fill-opacity=".2"/><circle cx="9" cy="15" r="4.6" fill="${GREEN}"/>` +
      `<g transform="translate(28 3)">${uptimeBars(186, 24, 30, { 9: 0.55 }, 2.2)}</g>`,
  );
  return {
    placeholders: withFooter ? [place('p_footer', 'footer', at(START + 66, 958, 900, 34), 'caption')] : [],
    decorations: [
      footLine(`d_anan_${name}_footline`),
      mark(`d_anan_${name}_mark`, at(START, 950, 46, 50)),
      drawing(`d_anan_${name}_uptime`, atEnd(END + 116, 961, 214, 30), strip, PAINT),
      rect(`d_anan_${name}_folio`, atEnd(END, 952, 96, 46), solid(token('surface')), {
        stroke: { color: token('text', 0.14), width: 1.5 },
        effects: { radius: 23 },
      }),
      pageNumber(`d_anan_${name}_number`, atEnd(END, 958, 96, 34), 'caption', {
        color: token('text'),
        weight: 700,
        align: 'center',
      }),
    ],
  };
}

/** A white card of the console, with a hairline and a soft shadow. */
const card = (id: string, frame: Frame, fill: Fill = solid(token('surface')), radius = 22) =>
  rect(id, frame, fill, {
    stroke: { color: token('text', 0.08), width: 1.5 },
    effects: { radius, shadow: { x: 0, y: 18, blur: 44, color: { value: NAVY, alpha: 0.08 } } },
  });

/** A field of the primary colour, lightly: the stage of a drawing inside a card. */
const STAGE = solid(token('primary', 0.06));

/** Dots of the isometric lattice in a box, for a stage that sits on a card. */
function lattice(id: string, frame: Frame, alpha = 0.3): Element {
  const { w, h } = frame;
  const dots: string[] = [];
  for (let row = 0; row * 16 < h; row++) {
    for (let col = 0; col * 56 < w + 28; col++) {
      const x = col * 56 + (row % 2 ? 28 : 0) + 14;
      const y = row * 16 + 8;
      if (x < w && y < h) dots.push(`<circle cx="${x}" cy="${y}" r="1.6"/>`);
    }
  }
  return art(id, frame, `<g fill="${BLUE}" fill-opacity="${alpha}">${dots.join('')}</g>`);
}

// ---------------------------------------------------------------------------------------------
// The scenes

/** The account a scene stands in: a faint field with a dashed boundary on the ground. */
function account(s: Scene, a: number, b: number) {
  s.raw(
    `<path d="${s.d([
      [a, a, 0],
      [b, a, 0],
      [b, b, 0],
      [a, b, 0],
    ])}" fill="${BLUE}" fill-opacity=".05" stroke="${BLUE}" stroke-opacity=".38" stroke-width="1.8" stroke-dasharray="3 8" stroke-linecap="round"/>`,
  );
}

/** The opening: an edge under the users' cloud, and three regions fanned out from it. */
function heroScene() {
  const s = new Scene(0, 0, 1);
  account(s, -46, 566);
  // Shadows first, then the plates and what stands on them, from the back.
  s.shadow(20, 20, 0, 140, 140, 40);
  for (const [x, y] of [
    [0, 300],
    [300, 0],
    [300, 300],
  ] as const) {
    s.shadow(x, y, 0, 220, 220, 50);
  }
  // The edge.
  s.plate(20, 20, 0, 140, 140, 14);
  s.shadow(50, 50, 14, 80, 80, 34, 0.12);
  s.box(50, 50, 14, 80, 80, 32, LOOK.blue);
  s.box(64, 64, 46, 52, 52, 14, LOOK.sky);
  // Connectors from the edge to each region, with traffic on them.
  s.link([
    [90, 160, 14],
    [90, 306, 14],
  ]);
  s.link([
    [160, 90, 14],
    [306, 90, 14],
  ]);
  s.link([
    [160, 160, 14],
    [304, 304, 14],
  ]);
  s.packet([90, 232, 14]);
  s.packet([232, 232, 14]);
  s.packet([226, 90, 14], BLUE, 5);

  // eu-west-1, to the end side: two servers and a database.
  s.plate(0, 300, 0, 220, 220, 14);
  s.shadow(36, 330, 14, 56, 56, 80);
  s.shadow(116, 330, 14, 56, 56, 58);
  s.cylinderShadow(72, 455, 14, 30, 44);
  s.server(36, 330, 14, 56, 56, 112);
  s.server(116, 330, 14, 56, 56, 80, LOOK.sky);
  s.cylinder(72, 455, 14, 30, 66, TEAL, 2);
  s.cylinder(160, 458, 14, 24, 42, TEAL, 1);

  // eu-central-1, to the start side.
  s.plate(300, 0, 0, 220, 220, 14);
  s.shadow(330, 36, 14, 56, 56, 64);
  s.shadow(330, 116, 14, 56, 56, 80);
  s.cylinderShadow(455, 72, 14, 30, 44);
  s.server(330, 36, 14, 56, 56, 90, LOOK.sky);
  s.server(330, 116, 14, 56, 56, 112);
  s.cylinder(455, 72, 14, 30, 66, TEAL, 2);
  s.box(428, 140, 14, 56, 56, 22, LOOK.white);
  s.box(440, 152, 36, 32, 32, 18, LOOK.orange);

  // il-central-1, in front: the busiest.
  s.plate(300, 300, 0, 220, 220, 14);
  s.shadow(330, 330, 14, 56, 56, 90);
  s.shadow(410, 330, 14, 56, 56, 70);
  s.shadow(330, 410, 14, 56, 56, 56);
  s.cylinderShadow(455, 458, 14, 30, 44);
  s.server(330, 330, 14, 56, 56, 132);
  s.server(410, 330, 14, 56, 56, 100, LOOK.sky);
  s.server(330, 410, 14, 56, 56, 74);
  s.cylinder(455, 458, 14, 32, 76, TEAL, 2);
  // Replication between the databases.
  s.link(
    [
      [102, 455, 54],
      [423, 458, 54],
    ],
    TEAL,
    { width: 2.2, dash: '3 6' },
  );
  s.link(
    [
      [455, 102, 54],
      [455, 426, 54],
    ],
    TEAL,
    { width: 2.2, dash: '3 6' },
  );
  s.packet([262, 456, 54], TEAL, 5);
  s.packet([455, 262, 54], TEAL, 5);

  // The users, in a cloud over the edge, and their traffic coming down.
  s.link(
    [
      [90, 90, 214],
      [90, 90, 66],
    ],
    ORANGE,
    { width: 2.6 },
  );
  s.packet([90, 90, 146]);
  s.cloud([90, 90, 222], 250);
  s.ok([100, 470, 160]);
  s.ok([470, 100, 160]);
  s.ok([470, 470, 168]);
  return s;
}

/** The section: a platform in three layers lifted apart, the edge over the services over data. */
function stackScene() {
  const s = new Scene(0, 0, 1);
  const size = 250;
  const levels = [0, 230, 460];
  // The footprint of the stack on the ground, dashed: where the layers come down to.
  s.raw(
    `<path d="${s.d([
      [0, 0, 0],
      [size, 0, 0],
      [size, size, 0],
      [0, size, 0],
    ])}" fill="${BLUE}" fill-opacity=".05" stroke="${BLUE}" stroke-opacity=".4" stroke-width="1.8" stroke-dasharray="3 8" stroke-linecap="round"/>`,
  );
  for (const [i, z] of levels.entries()) {
    const zz = z + 30;
    s.plate(0, 0, zz, size, size, 18, i === 0 ? TEAL : BLUE);
    const t = zz + 18;
    if (i === 0) {
      for (const [cx, cy] of [
        [70, 76],
        [176, 76],
        [124, 180],
      ] as const) {
        s.cylinderShadow(cx, cy, t, 30, 30, 0.08);
      }
      s.cylinder(70, 76, t, 30, 66, TEAL, 2);
      s.cylinder(176, 76, t, 30, 66, TEAL, 2);
      s.cylinder(124, 180, t, 30, 66, TEAL, 2);
    } else if (i === 1) {
      for (const [x, y] of [
        [36, 36],
        [146, 36],
        [36, 146],
        [146, 146],
      ] as const) {
        s.shadow(x, y, t, 68, 68, 28, 0.08);
      }
      s.server(36, 36, t, 68, 68, 64, LOOK.sky);
      s.server(146, 36, t, 68, 68, 84);
      s.server(36, 146, t, 68, 68, 84);
      s.server(146, 146, t, 68, 68, 56, LOOK.orange, WHITE);
    } else {
      s.shadow(75, 75, t, 100, 100, 30, 0.1);
      s.box(75, 75, t, 100, 100, 28, LOOK.blue);
      s.box(95, 95, t + 28, 60, 60, 14, LOOK.sky);
    }
  }
  // The paths between the layers: dashed from the corners, and traffic down the middle.
  for (const [x, y] of [
    [size, size],
    [0, size],
    [size, 0],
  ] as const) {
    for (const [from, to] of [
      [0, 30],
      [48, 260],
      [278, 490],
    ] as const) {
      s.link(
        [
          [x, y, to],
          [x, y, from],
        ],
        BLUE,
        { head: false, width: 1.8, dash: '3 7', opacity: 0.5 },
      );
    }
  }
  s.link(
    [
      [125, 125, 640],
      [125, 125, 548],
    ],
    ORANGE,
    { width: 2.6 },
  );
  s.packet([125, 125, 596]);
  s.cloud([125, 125, 648], 230);
  return s;
}

/** The agenda: the old machine room below, the cloud above, and a block on its way up. */
function migrationScene() {
  const s = new Scene(0, 0, 1);
  // The old room, at the start side, faded and dashed.
  s.raw(
    `<path d="${s.d([
      [270, -30, 0],
      [470, -30, 0],
      [470, 170, 0],
      [270, 170, 0],
    ])}" fill="${NAVY}" fill-opacity=".04" stroke="${NAVY}" stroke-opacity=".3" stroke-width="1.8" stroke-dasharray="3 8" stroke-linecap="round"/>`,
  );
  s.shadow(300, 10, 0, 60, 60, 80, 0.12);
  s.shadow(380, 10, 0, 60, 60, 60, 0.12);
  s.server(300, 10, 0, 60, 60, 124, LOOK.legacy, ORANGE);
  s.server(380, 10, 0, 60, 60, 92, LOOK.legacy);
  s.box(310, 96, 0, 50, 50, 28, LOOK.legacy);
  // The new place, raised over its footprint: a region plate with its services.
  const z = 270;
  const [px, py, pw] = [-40, 250, 230];
  s.raw(
    `<path d="${s.d([
      [px, py, 0],
      [px + pw, py, 0],
      [px + pw, py + pw, 0],
      [px, py + pw, 0],
    ])}" fill="${BLUE}" fill-opacity=".06" stroke="${BLUE}" stroke-opacity=".4" stroke-width="1.8" stroke-dasharray="3 8" stroke-linecap="round"/>`,
  );
  for (const [x, y] of [
    [px + pw, py],
    [px + pw, py + pw],
    [px, py + pw],
  ] as const) {
    s.link(
      [
        [x, y, z],
        [x, y, 0],
      ],
      BLUE,
      { head: false, width: 1.6, dash: '3 7', opacity: 0.45 },
    );
  }
  s.plate(px, py, z, pw, pw, 18);
  const t = z + 18;
  s.shadow(px + 30, py + 30, t, 58, 58, 60, 0.1);
  s.shadow(px + 112, py + 30, t, 58, 58, 44, 0.1);
  s.server(px + 30, py + 30, t, 58, 58, 104);
  s.server(px + 112, py + 30, t, 58, 58, 76, LOOK.sky);
  s.cylinder(px + 62, py + 168, t, 30, 62, TEAL, 2);
  s.cylinder(px + 160, py + 168, t, 30, 62, TEAL, 2);
  s.cloud([px + 80, py + 60, t + 200], 220);
  // The way up: a dashed curve from the old room to the new plate, a block in flight on it.
  const [ax, ay] = s.xy([330, 40, 140]);
  const [bx, by] = s.xy([px + pw + 30, py + pw / 2, t + 10]);
  const mx = (ax + bx) / 2 + 30;
  const my = Math.min(ay, by) - 70;
  s.raw(
    `<path d="M${r1(ax)} ${r1(ay)}Q${r1(mx)} ${r1(my)} ${r1(bx)} ${r1(by)}" stroke="${ORANGE}" stroke-width="3" stroke-dasharray="9 9" stroke-linecap="round"/>`,
  );
  s.raw(arrowhead(mx, my, bx, by, ORANGE, 13));
  const fx = 0.25 * ax + 0.5 * mx + 0.25 * bx;
  const fy = 0.25 * ay + 0.5 * my + 0.25 * by;
  const flight = new Scene(fx, fy + 20, 1);
  flight.box(-18, -18, 0, 36, 36, 36, LOOK.orange);
  s.raw(flight.svg(1, 1).replace(/^<svg[^>]*>|<\/svg>$/g, ''));
  return s;
}

/** The icon of a card: the gateway, the ledger, the risk engine. */
function serviceIcon(kind: 'gateway' | 'ledger' | 'risk') {
  const s = new Scene(0, 0, 1);
  if (kind === 'gateway') {
    s.plate(-20, -20, 0, 150, 150, 10);
    s.shadow(20, 20, 10, 70, 70, 34, 0.12);
    s.box(20, 20, 10, 70, 70, 34, LOOK.blue);
    s.box(35, 35, 44, 40, 40, 12, LOOK.sky);
    for (const [from, to] of [
      [
        [55, 132, 5],
        [55, 196, 5],
      ],
      [
        [132, 55, 5],
        [196, 55, 5],
      ],
      [
        [132, 132, 5],
        [186, 186, 5],
      ],
    ] as const) {
      s.link([from, to], BLUE, { width: 2.4 });
    }
    s.box(30, 206, 0, 50, 50, 30);
    s.box(206, 30, 0, 50, 50, 30);
    s.box(196, 196, 0, 50, 50, 30, LOOK.sky);
    s.packet([55, 166, 5]);
  } else if (kind === 'ledger') {
    s.plate(-20, -20, 0, 280, 130, 10, TEAL);
    for (const [i, x] of [20, 110, 200].entries()) {
      s.cylinderShadow(x + 20, 45, 10, 30, 30, 0.1);
      s.cylinder(x + 20, 45, 10, 30, i === 0 ? 84 : 66, TEAL, 2);
    }
    s.link(
      [
        [64, 45, 48],
        [126, 45, 48],
      ],
      TEAL,
      { width: 2.2, dash: '3 5' },
    );
    s.link(
      [
        [154, 45, 48],
        [216, 45, 48],
      ],
      TEAL,
      { width: 2.2, dash: '3 5' },
    );
    s.packet([95, 45, 48], TEAL, 5);
  } else {
    s.plate(-20, -20, 0, 200, 200, 10);
    for (const [x, y, h, look] of [
      [10, 10, 46, LOOK.sky],
      [92, 10, 70, LOOK.white],
      [10, 92, 70, LOOK.white],
      [92, 92, 42, LOOK.orange],
    ] as const) {
      s.shadow(x, y, 10, 66, 66, 30, 0.1);
      s.server(x, y, 10, 66, 66, h, look, look === LOOK.orange ? WHITE : GREEN);
    }
  }
  return s;
}

/** The icon of a step of a request's path: edge, balancer, service, ledger, replicas. */
function stepIcon(kind: number) {
  const s = new Scene(0, 0, 1);
  const plate = (color = BLUE) => {
    s.shadow(-10, -10, 0, 120, 120, 30, 0.1);
    s.plate(-10, -10, 0, 120, 120, 12, color);
  };
  if (kind === 0) {
    plate();
    s.shadow(22, 22, 12, 56, 56, 24, 0.1);
    s.box(22, 22, 12, 56, 56, 18, LOOK.sky);
    s.link(
      [
        [50, 50, 104],
        [50, 50, 32],
      ],
      ORANGE,
      { width: 2.4 },
    );
    s.cloud([50, 50, 110], 130);
  } else if (kind === 1) {
    plate();
    s.shadow(16, 16, 12, 68, 68, 30, 0.1);
    s.box(16, 16, 12, 68, 68, 34, LOOK.blue);
    s.box(30, 30, 46, 40, 40, 12, LOOK.sky);
  } else if (kind === 2) {
    plate();
    s.shadow(6, 10, 12, 42, 42, 46, 0.1);
    s.shadow(56, 10, 12, 42, 42, 34, 0.1);
    s.server(6, 10, 12, 42, 42, 86);
    s.server(56, 10, 12, 42, 42, 62, LOOK.sky);
    s.box(14, 64, 12, 30, 30, 18, LOOK.orange);
  } else if (kind === 3) {
    plate(TEAL);
    s.cylinderShadow(50, 50, 12, 34, 30, 0.1);
    s.cylinder(50, 50, 12, 34, 86, TEAL, 2);
  } else {
    plate(TEAL);
    for (const [cx, cy] of [
      [24, 24],
      [76, 24],
      [24, 76],
    ] as const) {
      s.cylinder(cx, cy, 12, 20, 46, TEAL, 1, false);
    }
    s.link(
      [
        [44, 24, 30],
        [56, 24, 30],
      ],
      TEAL,
      { width: 2, dash: '2 4', head: false },
    );
    s.link(
      [
        [24, 44, 30],
        [24, 56, 30],
      ],
      TEAL,
      { width: 2, dash: '2 4', head: false },
    );
  }
  return s;
}

/** A block of the rollout: the share of the traffic as its height, on its own plate. */
function rolloutBlock(i: number) {
  const s = new Scene(0, 0, 1);
  const h = [12, 46, 104, 170][i]!;
  s.shadow(-12, -12, 0, 124, 124, 34, 0.1);
  s.plate(-12, -12, 0, 124, 124, 10, i === 0 ? ORANGE : BLUE);
  s.shadow(0, 0, 10, 100, 100, Math.max(20, h * 0.55), 0.13);
  s.server(0, 0, 10, 100, 100, h, i === 0 ? LOOK.orange : i === 3 ? LOOK.blue : LOOK.sky, i === 0 ? WHITE : GREEN);
  return { s, top: s.xy([50, 50, 10 + h]) };
}

/** Before: one region with everything in it, a cold standby far off, and a warning. */
function beforeScene() {
  const s = new Scene(0, 0, 1);
  s.shadow(0, 0, 0, 200, 200, 44, 0.12);
  s.plate(0, 0, 0, 200, 200, 12, ORANGE);
  s.shadow(28, 28, 12, 54, 54, 50, 0.1);
  s.shadow(102, 28, 12, 54, 54, 40, 0.1);
  s.server(28, 28, 12, 54, 54, 96);
  s.server(102, 28, 12, 54, 54, 70, LOOK.sky);
  s.cylinder(62, 148, 12, 28, 58, TEAL, 2);
  s.cylinder(140, 148, 12, 22, 42, TEAL, 1);
  // A cold standby, far off and grey, with no traffic to it.
  s.raw(
    `<path d="${s.d(
      [
        [200, 100, 6],
        [340, 100, 6],
      ],
      false,
    )}" stroke="${NAVY}" stroke-opacity=".3" stroke-width="2.2" stroke-dasharray="3 8" stroke-linecap="round"/>`,
  );
  s.box(340, 55, 0, 90, 90, 10, LOOK.legacy);
  s.box(360, 75, 10, 50, 50, 44, LOOK.legacy);
  const [wx, wy] = s.xy([100, 100, 150]);
  s.extent([100, 100, 150], 34);
  s.raw(
    `<circle cx="${r1(wx)}" cy="${r1(wy)}" r="34" fill="${ORANGE}" fill-opacity=".18"/><circle cx="${r1(wx)}" cy="${r1(wy)}" r="21" fill="${ORANGE}"/>` +
      `<path d="M${r1(wx)} ${r1(wy - 10)}v11" stroke="${WHITE}" stroke-width="4.6" stroke-linecap="round"/><circle cx="${r1(wx)}" cy="${r1(wy + 9.5)}" r="2.8" fill="${WHITE}"/>`,
  );
  return s;
}

/** After: three regions, joined, each healthy. */
function afterScene() {
  const s = new Scene(0, 0, 1);
  const plates: [number, number][] = [
    [0, 0],
    [0, 230],
    [230, 0],
  ];
  for (const [x, y] of plates) s.shadow(x, y, 0, 160, 160, 34, 0.12);
  s.link(
    [
      [80, 160, 12],
      [80, 236, 12],
    ],
    BLUE,
    { width: 2.6 },
  );
  s.link(
    [
      [160, 80, 12],
      [236, 80, 12],
    ],
    BLUE,
    { width: 2.6 },
  );
  s.link(
    [
      [160, 300, 12],
      [300, 300, 12],
      [300, 166, 12],
    ],
    TEAL,
    { width: 2.6, dash: '3 7' },
  );
  for (const [i, [x, y]] of plates.entries()) {
    s.plate(x, y, 0, 160, 160, 12);
    s.shadow(x + 22, y + 22, 12, 46, 46, 40, 0.1);
    s.server(x + 22, y + 22, 12, 46, 46, 86 - i * 10);
    s.server(x + 86, y + 22, 12, 46, 46, 60, LOOK.sky);
    s.cylinder(x + 60, y + 115, 12, 24, 50, TEAL, 2);
    s.ok([x + 80, y + 80, 150 - i * 10], 16);
  }
  return s;
}

/** The close: the release has landed on the platform, and every region is ticked. */
function deployScene() {
  const s = new Scene(0, 0, 1);
  account(s, -40, 520);
  s.shadow(0, 0, 0, 480, 480, 70, 0.08);
  s.plate(0, 0, 0, 480, 480, 20);
  const t = 20;
  // The services, along the back, each with the new release.
  const spots: [number, number, number][] = [
    [40, 40, 92],
    [150, 40, 118],
    [260, 40, 84],
    [370, 40, 70],
    [40, 150, 70],
    [40, 260, 104],
    [40, 370, 64],
  ];
  for (const [x, y, h] of spots) s.shadow(x, y, t, 70, 70, h * 0.5, 0.1);
  for (const [x, y, h] of spots) s.server(x, y, t, 70, 70, h, h > 120 ? LOOK.sky : LOOK.white);
  s.cylinderShadow(370, 230, t, 38, 40, 0.1);
  s.cylinderShadow(230, 370, t, 38, 40, 0.1);
  s.cylinder(370, 230, t, 38, 84, TEAL, 3);
  s.cylinder(230, 370, t, 38, 84, TEAL, 3);
  s.shadow(340, 340, t, 100, 100, 40, 0.1);
  s.box(340, 340, t, 100, 100, 50, LOOK.blue);
  s.box(360, 360, t + 50, 60, 60, 24, LOOK.orange);
  // The release came down into its place: where it was, dashed, and the way down.
  const g = t + 210;
  s.raw(
    `<path d="${s.d([
      [360, 360, g + 24],
      [420, 360, g + 24],
      [420, 420, g + 24],
      [360, 420, g + 24],
    ])}M${s.xy([360, 420, g + 24]).map(r1).join(' ')}L${s.xy([360, 420, g]).map(r1).join(' ')}L${s.xy([420, 420, g]).map(r1).join(' ')}L${s.xy([420, 360, g]).map(r1).join(' ')}L${s.xy([420, 360, g + 24]).map(r1).join(' ')}M${s.xy([420, 420, g]).map(r1).join(' ')}L${s.xy([420, 420, g + 24]).map(r1).join(' ')}" stroke="${ORANGE}" stroke-width="2.2" stroke-dasharray="5 5" stroke-linejoin="round"/>`,
  );
  s.link(
    [
      [390, 390, g - 8],
      [390, 390, t + 92],
    ],
    ORANGE,
    { width: 2.8 },
  );
  for (const [x, y, h] of spots.filter((_, i) => i % 2 === 0)) s.ok([x + 35, y + 35, t + h + 34], 13);
  s.ok([440, 440, t + 120], 16);
  return s;
}

// ---------------------------------------------------------------------------------------------
// The console's panels and strips (they hold letters)

/** The night of the move on a graph: traffic leaves one region for three, errors stay at zero. */
function trafficPanel(w: number, h: number) {
  const x0 = 34;
  const x1 = w - 30;
  const top = 132;
  const base = h - 168;
  const span = base - top;
  const steps = 24;
  const at = (i: number) => x0 + ((x1 - x0) * i) / steps;
  // Shares of the traffic over the night: the old region gives way between 6 and 18.
  const shares = Array.from({ length: steps + 1 }, (_, i) => {
    const t = Math.min(1, Math.max(0, (i - 6) / 12));
    const e = t * t * (3 - 2 * t);
    return [1 - e * 0.54, e * 0.31, e * 0.23] as const;
  });
  const band = (lo: (i: number) => number, hi: (i: number) => number) => {
    const upper = shares.map((_, i) => `${r1(at(i))} ${r1(base - span * hi(i))}`);
    const lower = shares.map((_, i) => `${r1(at(i))} ${r1(base - span * lo(i))}`).reverse();
    return `M${upper.join('L')}L${lower.join('L')}Z`;
  };
  const s = (i: number) => shares[i]!;
  const bands =
    `<path d="${band(() => 0, (i) => s(i)[0])}" fill="${BLUE}" fill-opacity=".8"/>` +
    `<path d="${band((i) => s(i)[0], (i) => s(i)[0] + s(i)[1])}" fill="${TEAL}" fill-opacity=".85"/>` +
    `<path d="${band((i) => s(i)[0] + s(i)[1], () => 1)}" fill="${ORANGE}" fill-opacity=".8"/>`;
  const grid = [0, 0.5, 1]
    .map((v) => `<path d="M${x0} ${r1(base - span * v)}H${x1}" stroke="${NAVY}" stroke-opacity=".08" stroke-width="1.5"/>`)
    .join('');
  const ticks = ['02:00', '02:10', '02:20', '02:30', '02:40']
    .map((t, i) => `<text x="${r1(at(i * 6))}" y="${base + 30}" text-anchor="${i === 0 ? 'start' : i === 4 ? 'end' : 'middle'}" ${MONO} font-size="16" fill="${MUTED}">${t}</text>`)
    .join('');
  const legend = [
    ['il-central-1', BLUE],
    ['eu-central-1', TEAL],
    ['eu-west-1', ORANGE],
  ]
    .map(
      ([name, color], i) =>
        `<rect x="${x0 + i * 168}" y="86" width="14" height="14" rx="4" fill="${color}"/><text x="${x0 + 22 + i * 168}" y="99" ${MONO} font-size="16" fill="${NAVY}" fill-opacity=".8">${name}</text>`,
    )
    .join('');
  const errorsTop = base + 62;
  const errors =
    `<text x="${x0}" y="${errorsTop + 6}" ${MONO} font-size="16" fill="${MUTED}">errors</text>` +
    `<path d="M${x0 + 104} ${errorsTop}H${x1 - 84}" stroke="${GREEN}" stroke-width="3" stroke-linecap="round"/>` +
    `<text x="${x1}" y="${errorsTop + 6}" text-anchor="end" ${MONO} font-size="16" font-weight="700" fill="${NAVY}">0.00%</text>` +
    `<text x="${x0}" y="${errorsTop + 52}" ${MONO} font-size="16" fill="${MUTED}">declined</text>` +
    `<path d="M${x0 + 104} ${errorsTop + 46}H${x1 - 84}" stroke="${GREEN}" stroke-width="3" stroke-linecap="round"/>` +
    `<text x="${x1}" y="${errorsTop + 52}" text-anchor="end" ${MONO} font-size="16" font-weight="700" fill="${NAVY}">0</text>`;
  const header =
    `<circle cx="${x0 + 8}" cy="44" r="12" fill="${GREEN}" fill-opacity=".2"/><circle cx="${x0 + 8}" cy="44" r="6" fill="${GREEN}"/>` +
    `<text x="${x0 + 30}" y="51" ${SANS} font-size="21" font-weight="700" fill="${NAVY}">Traffic by region</text>` +
    `<text x="${x1}" y="51" text-anchor="end" ${MONO} font-size="16" fill="${MUTED}">22 Dec · live</text>`;
  return svg(w, h, header + legend + grid + bands + ticks + errors);
}

/** The header of a panel: three lights, a path in mono, and chips at the far end. */
function panelBar(w: number, title: string, chips: [string, string][], dir: Dir) {
  const lights = [0, 1, 2].map((i) => `<circle cx="${24 + i * 20}" cy="28" r="6" fill="${NAVY}" fill-opacity="${0.14 + i * 0.04}"/>`).join('');
  let x = w - 18;
  const pills = chips
    .map(([name, color]) => {
      const pw = 34 + name.length * 9.6 + 14;
      x -= pw;
      const px = x;
      x -= 10;
      return (
        `<rect x="${r1(px)}" y="11" width="${r1(pw)}" height="34" rx="17" fill="${WHITE}" stroke="${NAVY}" stroke-opacity=".12" stroke-width="1.5"/>` +
        `<circle cx="${r1(px + 18)}" cy="28" r="5" fill="${color}"/>` +
        `<text x="${r1(px + 32)}" y="34" ${MONO} font-size="16" fill="${NAVY}">${name}</text>`
      );
    })
    .join('');
  const body =
    lights +
    `<text x="96" y="34" ${MONO} font-size="17" fill="${NAVY}" fill-opacity=".72">${title}</text>` +
    pills;
  void dir;
  return body;
}

/** The uptime of ninety days, with the ends of its time named in the reading direction. */
function uptimeStrip(w: number, dir: Dir) {
  const bars = 90;
  const bad = dir === 'rtl' ? { 58: 0.6, 23: 0.82 } : { 31: 0.6, 66: 0.82 };
  const h = 62;
  const [early, late] = dir === 'rtl' ? [w, 0] : [0, w];
  return svg(
    w,
    118,
    `<g transform="translate(0 6)">${uptimeBars(w, h, bars, bad, 3)}</g>` +
      `<path d="M0 ${h + 22}H${w}" stroke="${NAVY}" stroke-opacity=".12" stroke-width="1.5"/>` +
      `<text x="${early}" y="${h + 52}" text-anchor="${dir === 'rtl' ? 'end' : 'start'}" ${MONO} font-size="17" fill="${MUTED}">90 days ago</text>` +
      `<text x="${late}" y="${h + 52}" text-anchor="${dir === 'rtl' ? 'start' : 'end'}" ${MONO} font-size="17" fill="${MUTED}">today</text>` +
      `<g transform="translate(${w / 2 - 130} ${h + 36})"><rect width="12" height="12" rx="3" fill="${TEAL}"/><text x="20" y="11" ${MONO} font-size="17" fill="${MUTED}">operational</text>` +
      `<rect x="150" width="12" height="12" rx="3" fill="${ORANGE}"/><text x="170" y="11" ${MONO} font-size="17" fill="${MUTED}">degraded</text></g>`,
  );
}

/** A sparkline in a metric tile: one kind a tile. */
function sparkline(kind: number) {
  const w = 170;
  const h = 96;
  // Drawn for right to left, time running toward the end side: now is at the left, and the
  // mirror of a left-to-right deck puts it at the right.
  if (kind === 0) {
    // Downtime: a flat line at zero over the night of the move.
    return svg(
      w,
      h,
      `<path d="M4 70H166" stroke="${GREEN}" stroke-width="3.4" stroke-linecap="round"/>` +
        `<path d="M4 30H166" stroke="${NAVY}" stroke-opacity=".1" stroke-width="1.5" stroke-dasharray="3 6"/>` +
        `<circle cx="6" cy="70" r="7" fill="${GREEN}"/><circle cx="6" cy="70" r="13" fill="${GREEN}" fill-opacity=".2"/>`,
    );
  }
  if (kind === 1) {
    // Latency coming down.
    const pts = [20, 22, 19, 24, 21, 30, 44, 58, 63, 66, 64, 67];
    const line = pts.map((v, i) => `${r1(166 - i * 14.6)} ${v + 6}`).join('L');
    return svg(
      w,
      h,
      `<path d="M${line}L6 ${h}L166 ${h}Z" fill="${BLUE}" fill-opacity=".1"/>` +
        `<path d="M${line}" stroke="${BLUE}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<circle cx="5.4" cy="73" r="6" fill="${BLUE}"/>`,
    );
  }
  // Regions: three plates, lit.
  const s = new Scene(98, 30, 0.42);
  for (const [x, y] of [
    [0, 0],
    [0, 120],
    [120, 0],
  ] as const) {
    s.plate(x, y, 0, 96, 96, 12);
    s.box(x + 28, y + 28, 12, 40, 40, 34, x + y === 0 ? LOOK.blue : LOOK.sky);
  }
  return s.svg(w, h);
}

/** The rotation of the month under the people: a week each, handed on, today marked. */
function rotation(w: number, starts: number[], colW: number, dir: Dir) {
  const parts: string[] = [];
  const order = dir === 'rtl' ? starts.map((s) => w - s - colW) : starts.map((s) => s);
  for (const [i, x] of order.entries()) {
    const fill = i === 0 ? BLUE : NAVY;
    parts.push(
      `<rect x="${x}" y="30" width="${colW}" height="12" rx="6" fill="${fill}" fill-opacity="${i === 0 ? 0.9 : 0.1}"/>`,
    );
    for (let d = 1; d < 7; d++) {
      const tx = dir === 'rtl' ? x + colW - (colW * d) / 7 : x + (colW * d) / 7;
      parts.push(`<path d="M${r1(tx)} 30v12" stroke="${WHITE}" stroke-width="2"/>`);
    }
    const label = `W${i + 1}`;
    parts.push(
      `<text x="${dir === 'rtl' ? x + colW : x}" y="18" text-anchor="${dir === 'rtl' ? 'end' : 'start'}" ${MONO} font-size="16" font-weight="700" fill="${i === 0 ? BLUE : MUTED}">${label}</text>`,
    );
    if (i < order.length - 1) {
      // The hand-over to the next one: a small arrow across the gap.
      const gapFrom = dir === 'rtl' ? x - 8 : x + colW + 8;
      const gapTo = dir === 'rtl' ? order[i + 1]! + colW + 8 : order[i + 1]! - 8;
      parts.push(
        `<path d="M${gapFrom} 36H${gapTo}" stroke="${BLUE}" stroke-opacity=".5" stroke-width="2" stroke-dasharray="2 4"/>` +
          arrowhead(gapFrom, 36, gapTo, 36, BLUE, 7),
      );
    }
  }
  // Today: the third day of the first week.
  const first = order[0]!;
  const today = dir === 'rtl' ? first + colW - (colW * 2.5) / 7 : first + (colW * 2.5) / 7;
  parts.push(
    `<path d="M${r1(today)} 24v24" stroke="${ORANGE}" stroke-width="3" stroke-linecap="round"/><circle cx="${r1(today)}" cy="22" r="6" fill="${ORANGE}"/>` +
      `<text x="${r1(today + (dir === 'rtl' ? -12 : 12))}" y="18" text-anchor="${dir === 'rtl' ? 'end' : 'start'}" ${MONO} font-size="16" fill="${ORANGE}">now</text>`,
  );
  return svg(w, 52, parts.join(''));
}

/** The toast of the close: the release, every region ticked. */
function deployToast(w: number, h: number) {
  const rows = ['il-central-1', 'eu-central-1', 'eu-west-1']
    .map((name, i) => {
      const y = 116 + i * 52;
      return (
        `<text x="30" y="${y}" ${MONO} font-size="18" fill="${NAVY}">${name}</text>` +
        `<rect x="190" y="${y - 12}" width="${w - 280}" height="10" rx="5" fill="${NAVY}" fill-opacity=".08"/>` +
        `<rect x="190" y="${y - 12}" width="${w - 280}" height="10" rx="5" fill="${i === 0 ? BLUE : TEAL}"/>` +
        tick(w - 52, y - 7, 11)
      );
    })
    .join('');
  return svg(
    w,
    h,
    `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="20" fill="${WHITE}" stroke="${NAVY}" stroke-opacity=".1" stroke-width="1.5"/>` +
      tick(46, 46, 15) +
      `<text x="76" y="53" ${SANS} font-size="23" font-weight="800" fill="${NAVY}">Deployed</text>` +
      `<text x="${w - 28}" y="52" text-anchor="end" ${MONO} font-size="17" fill="${MUTED}">v3.0 · 3/3</text>` +
      `<path d="M0 78H${w}" stroke="${NAVY}" stroke-opacity=".08" stroke-width="1.5"/>` +
      rows,
  );
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const cards3 = [START, START + 572, START + 1144];
const columns4 = [START, START + 416, START + 832, START + 1248];
const steps5 = [START, START + 341, START + 682, START + 1023, START + 1364];
const team4 = [START, START + 428, START + 856, START + 1284];
const rows3 = [292, 486, 680];
const tiles3 = [284, 492, 700];
const lines3 = [520, 630, 740];

function layouts(): Layout[] {
  // The opening scene, and the chips of its regions where the scene puts them.
  const heroArt = atEnd(24, 40, 890, 960);
  const hero = heroScene();
  const heroFit = hero.fitting(heroArt.w, heroArt.h, 28, 4, 0.5, 0.55);
  const pin = (p: P3) => {
    const [X, Y] = heroFit.map(hero.xy(p));
    return [heroArt.x + X, heroArt.y + Y] as const;
  };

  // The section's stack, and where its top layer is, for the callout of the number.
  const stackArt = atEnd(24, 130, 780, 920);
  const stack = stackScene();
  const stackFit = stack.fitting(stackArt.w, stackArt.h, 20, 4, 0.42, 0.6);
  const [cornerX, cornerY] = (() => {
    const [X, Y] = stackFit.map(stack.xy([250, 0, 508]));
    return [stackArt.x + X, stackArt.y + Y];
  })();
  const tag = atEnd(560, 108, 280, 176);

  const textArt = atEnd(64, 170, 650, 720);
  const migration = migrationScene();
  const migrationFit = migration.fitting(textArt.w, textArt.h, 16, 4, 0.5, 0.5);
  const label = (id: string, p: P3, text: string, light: string) => {
    const [X, Y] = migrationFit.map(migration.xy(p));
    return chip(id, textArt.x + X, textArt.y + Y + 12, text, { light, pointer: true, size: 17 });
  };
  const closingArt = atEnd(20, 60, 900, 820);
  const window = atEnd(END, 100, 780, 812);

  // The icons of the process and the blocks of the rollout share one scale a row.
  const fitted = (scenes: Scene[], w: number, h: number, pad: number) => {
    const scale = Math.min(...scenes.map((s) => s.fitting(w, h, pad).scale));
    return scenes.map((s) => s.fitting(w, h, pad, scale, 1, 1));
  };
  const steps = steps5.map((_, i) => stepIcon(i));
  const stepFits = fitted(steps, 210, 188, 6);
  const blocks = columns4.map((_, i) => rolloutBlock(i));
  const blockFits = fitted(
    blocks.map((b) => b.s),
    250,
    262,
    6,
  );
  const stepFrame = (start: number) => at(start, 252, 210, 188);
  const blockFrame = (start: number) => at(start, 244, 250, 262);
  // The tops of the blocks, on the slide.
  const tops = blocks.map((b, i) => {
    const [X, Y] = blockFits[i]!.map(b.top);
    const f = blockFrame(columns4[i]!);
    return [f.x + X, f.y + Y] as const;
  });
  const rise = at(START, 214, WIDTH, 300);
  const riseArcs = tops
    .slice(0, -1)
    .map(([ax, ay], i) => {
      const [bx, by] = tops[i + 1]!;
      const [x0, y0] = [ax - rise.x - 26, ay - rise.y - 10];
      const [x1, y1] = [bx - rise.x + 34, by - rise.y - 6];
      const [mx, my] = [(x0 + x1) / 2, Math.max(8, Math.min(y0, y1) - 46)];
      const color = i === 0 ? ORANGE : BLUE;
      return (
        `<path d="M${r1(x0)} ${r1(y0)}Q${r1(mx)} ${r1(my)} ${r1(x1)} ${r1(y1)}" stroke="${color}" stroke-opacity=".85" stroke-width="2.6" stroke-dasharray="7 8" stroke-linecap="round"/>` +
        arrowhead(mx, my, x1, y1, color, 11)
      );
    })
    .join('');

  return [
    {
      id: 'l_anan_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        place('p_kicker', 'caption', at(AFTER, 262, 780, 34), 'caption'),
        place('p_title', 'title', at(START, 312, 860, 262), 'display'),
        place('p_subtitle', 'subtitle', at(START, 596, 800, 140), 'heading'),
        place('p_meta', 'caption', at(AFTER, 860, 760, 34), 'caption'),
      ],
      decorations: [
        drawing('d_anan_hero_scene', heroArt, heroFit.markup(), PAINT),
        ...(
          [
            ['eu-west-1', [96, 520, 0]],
            ['eu-central-1', [520, 96, 0]],
            ['il-central-1', [520, 520, 0]],
          ] as const
        ).map(([label, p], i) => {
          const [x, y] = pin(p);
          return chip(`d_anan_hero_chip${i + 1}`, x, y + 10, label, { pointer: true });
        }),
        node('d_anan_hero_node', START, 266),
        art(
          'd_anan_hero_rule',
          at(START, 812, 800, 8),
          `<path d="M2 4H798" stroke="${BLUE}" stroke-opacity=".38" stroke-width="2" stroke-dasharray="2 8" stroke-linecap="round"/>`,
        ),
        art(
          'd_anan_hero_calendar',
          at(START, 862, 30, 30),
          `<rect x="2" y="5" width="26" height="23" rx="5" stroke="${BLUE}" stroke-width="2.4"/><path d="M2 12h26M9 2v6M21 2v6" stroke="${BLUE}" stroke-width="2.4" stroke-linecap="round"/><circle cx="20" cy="20" r="2.6" fill="${ORANGE}"/>`,
        ),
        mark('d_anan_hero_mark', at(START, 96, 46, 50)),
      ],
    },
    {
      id: 'l_anan_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        place('p_number', 'number', { ...tag, y: tag.y + 20, h: 136 }, 'display', {
          align: 'center',
          vAlign: 'middle',
          color: token('primary'),
        }),
        place('p_kicker', 'caption', at(AFTER, 372, 760, 34), 'caption'),
        // A title of one line sits midway between its kicker and its subtitle; one of two fills the box.
        place('p_title', 'title', at(START, 422, 820, 262), 'display', { vAlign: 'middle' }),
        place('p_subtitle', 'subtitle', at(START, 708, 800, 140), 'heading'),
      ],
      decorations: [
        rect('d_anan_section_field', atEnd(0, 0, 880, 1080), solid(token('primary', 0.07))),
        rect('d_anan_section_edge', atEnd(879, 0, 1.5, 1080), solid(token('primary', 0.2))),
        drawing('d_anan_section_stack', stackArt, stackFit.markup(), PAINT),
        // The callout: from the tag of the part down to the top layer, as a diagram labels.
        art(
          'd_anan_section_leader',
          { x: cornerX - 8, y: tag.y + tag.h - 4, w: tag.x + tag.w / 2 - cornerX + 16, h: cornerY - (tag.y + tag.h) + 12 },
          (() => {
            const w = tag.x + tag.w / 2 - cornerX + 16;
            const h = cornerY - (tag.y + tag.h) + 12;
            return (
              `<path d="M${w - 8} 4V${h - 22}Q${w - 8} ${h - 8} ${w - 22} ${h - 8}H14" stroke="${BLUE}" stroke-opacity=".6" stroke-width="2.2" stroke-dasharray="3 6" stroke-linecap="round"/>` +
              `<circle cx="${w - 8}" cy="4" r="4" fill="${BLUE}"/><circle cx="8" cy="${h - 8}" r="6" fill="${WHITE}" stroke="${BLUE}" stroke-width="2.6"/>`
            );
          })(),
        ),
        card('d_anan_section_tag', tag, solid(token('surface')), 26),
        lettered('d_anan_section_tag_label', { x: tag.x, y: tag.y + 14, w: tag.w, h: 26 }, (dir) =>
          svg(
            tag.w,
            26,
            `<text x="${dir === 'rtl' ? tag.w - 24 : 24}" y="19" text-anchor="${dir === 'rtl' ? 'end' : 'start'}" ${MONO} font-size="16" font-weight="600" letter-spacing="1" fill="${MUTED}">PART</text>` +
              `<g fill="${BLUE}">${[0, 1, 2].map((i) => `<circle cx="${dir === 'rtl' ? 24 + i * 12 : tag.w - 24 - i * 12}" cy="13" r="3.4" fill-opacity="${1 - i * 0.3}"/>`).join('')}</g>`,
          ),
        ),
        node('d_anan_section_node', START, 376),
        mark('d_anan_section_mark', at(START, 96, 46, 50)),
      ],
    },
    {
      id: 'l_anan_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head('big_number').placeholders,
        place('p_number', 'number', at(START, 284, 920, 135), 'display', { color: token('primary') }),
        place('p_label', 'subtitle', at(START, 426, 920, 53), 'heading'),
        place('p_body', 'body', at(START, 492, 880, 135), 'body'),
        ...tiles3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(END + 206, top + 26, 450, 79), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', atEnd(END + 206, top + 108, 450, 68), 'caption'),
        ]),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        ...head('big_number').decorations,
        lettered('d_anan_big_number_days', at(START, 672, 920, 118), (dir) => uptimeStrip(920, dir)),
        ...tiles3.flatMap((top, i) => [
          card(`d_anan_big_number_tile${i + 1}`, atEnd(END, top, 680, 192)),
          drawing(`d_anan_big_number_spark${i + 1}`, atEnd(END + 22, top + 48, 170, 96), sparkline(i), PAINT),
          rect(`d_anan_big_number_rule${i + 1}`, atEnd(END + 190, top + 30, 1.5, 132), solid(token('text', 0.08))),
        ]),
        ...foot('big_number').decorations,
      ],
    },
    {
      id: 'l_anan_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(START, 236, 1060, 420), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(START + 92, 712, 900, 53), 'heading'),
        place('p_caption', 'caption', at(START + 92, 770, 900, 68), 'caption'),
        ...foot('quote').placeholders,
      ],
      decorations: [
        // The marks open the quote as English sets them, in both directions.
        lettered(
          'd_anan_quote_marks',
          at(START, 120, 116, 92),
          svg(
            116,
            92,
            `<path d="M116 4c-30 6-50 28-50 62v22h44V52H88c0-18 10-30 28-34Z" fill="${BLUE}"/><path d="M50 4C20 10 0 32 0 66v22h44V52H22c0-18 10-30 28-34Z" fill="${BLUE}" fill-opacity=".45"/>`,
          ),
        ),
        art(
          'd_anan_quote_badge',
          at(START, 712, 66, 66),
          `<circle cx="33" cy="33" r="31" fill="${WHITE}" stroke="${NAVY}" stroke-opacity=".1" stroke-width="1.5"/><path d="M20 42V28a13 13 0 0 1 26 0v14" stroke="${BLUE}" stroke-width="3.2" stroke-linecap="round"/><rect x="14" y="34" width="10" height="14" rx="4" fill="${BLUE}"/><rect x="42" y="34" width="10" height="14" rx="4" fill="${BLUE}"/><circle cx="48" cy="18" r="6" fill="${GREEN}" stroke="${WHITE}" stroke-width="2.4"/>`,
        ),
        card('d_anan_quote_panel', atEnd(END, 196, 560, 640)),
        lettered('d_anan_quote_graph', atEnd(END, 196, 560, 640), trafficPanel(560, 640)),
        ...foot('quote').decorations,
      ],
    },
    {
      id: 'l_anan_text',
      name: 'Text',
      archetype: 'text',
      placeholders: [
        place('p_title', 'title', at(START, 122, 1080, 148), 'title'),
        place('p_body', 'body', at(START, 282, 1080, 610), 'body'),
      ],
      decorations: [
        drawing('d_anan_text_scene', textArt, migrationFit.markup(), PAINT),
        label('d_anan_text_from', [470, 170, 0], 'on-prem', MUTED),
        label('d_anan_text_to', [190, 480, 0], 'cloud', GREEN),
        ...foot('text', false).decorations,
      ],
    },
    {
      id: 'l_anan_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head('text_image', 820).placeholders,
        place('p_image', 'image', atEnd(END + 14, 156, 752, 742)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(START + 90, top, 740, 53), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(START + 90, top + 56, 740, 136), 'caption'),
        ]),
        ...foot('text_image').placeholders,
      ],
      decorations: [
        ...head('text_image').decorations,
        card('d_anan_text_image_window', window),
        lettered('d_anan_text_image_bar', atEnd(END, 100, 780, 56), (dir) =>
          svg(780, 56, panelBar(780, 'payments / architecture', [['3 regions', GREEN]], dir)),
        ),
        art(
          'd_anan_text_image_spine',
          at(START + 31, rows3[0]! + 70, 8, rows3[2]! - rows3[0]! - 74),
          `<path d="M4 4V${rows3[2]! - rows3[0]! - 78}" stroke="${BLUE}" stroke-opacity=".45" stroke-width="2.2" stroke-dasharray="3 7" stroke-linecap="round"/>`,
        ),
        ...rows3.map((top, i) => {
          const s = new Scene(0, 0, 1);
          s.box(0, 0, 0, 60, 60, 10, LOOK.plate);
          if (i === 0) {
            s.server(14, 14, 10, 32, 32, 50, LOOK.blue, WHITE);
          } else if (i === 1) {
            s.cylinder(30, 30, 10, 18, 52, TEAL, 2, false);
          } else {
            s.box(16, 16, 10, 28, 28, 18, LOOK.orange);
            s.cloud([30, 30, 64], 66);
          }
          return drawing(`d_anan_text_image_icon${i + 1}`, at(START, top - 8, 70, 70), s.fit(70, 70, 3), PAINT);
        }),
        ...foot('text_image').decorations,
      ],
    },
    {
      id: 'l_anan_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        place('p_image', 'image', atEnd(0, 0, 1920, 690)),
        place('p_kicker', 'caption', at(AFTER, 740, 900, 34), 'caption'),
        place('p_title', 'title', at(START, 786, 1060, 148), 'title'),
        place('p_body', 'body', atEnd(END, 786, 560, 180), 'body'),
      ],
      decorations: [
        rect('d_anan_full_image_band', atEnd(0, 690, 1920, 390), solid(token('surface'))),
        rect('d_anan_full_image_rule', atEnd(0, 690, 1920, 6), solid(token('primary'))),
        rect('d_anan_full_image_canary', at(0, 690, 300, 6), solid(token('accent'))),
        node('d_anan_full_image_node', START, 744),
        art(
          'd_anan_full_image_divider',
          atEnd(END + 620, 790, 8, 170),
          `<path d="M4 4V166" stroke="${BLUE}" stroke-opacity=".45" stroke-width="2.2" stroke-dasharray="3 7" stroke-linecap="round"/>`,
        ),
        ...foot('full_image', false).decorations.filter((d) => !d.id.endsWith('_footline')),
      ],
    },
    {
      id: 'l_anan_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head('cards').placeholders,
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}_note`, 'caption', at(start + 66, 456, 420, 34), 'caption'),
          place(`p_card${i + 1}`, 'subtitle', at(start + 32, 504, 456, 96), 'heading', { vAlign: 'bottom' }),
          place(`p_card${i + 1}_body`, 'body', at(start + 32, 608, 456, 190), 'body'),
        ]),
        place('p_takeaway', 'body', at(AFTER, 830, WIDTH - 42, 90), 'body', { vAlign: 'middle' }),
        ...foot('cards').placeholders,
      ],
      decorations: [
        ...head('cards').decorations,
        ...cards3.flatMap((start, i) => [
          card(`d_anan_cards_card${i + 1}`, at(start, 284, 520, 530)),
          rect(`d_anan_cards_stage${i + 1}`, at(start + 12, 296, 496, 204), STAGE, { effects: { radius: 14 } }),
          lattice(`d_anan_cards_lattice${i + 1}`, at(start + 12, 296, 496, 204), 0.28),
          drawing(
            `d_anan_cards_icon${i + 1}`,
            at(start + 12, 300, 496, 152),
            serviceIcon((['gateway', 'ledger', 'risk'] as const)[i]!).fit(496, 152, 12),
            PAINT,
          ),
          art(
            `d_anan_cards_light${i + 1}`,
            at(start + 32, 461, 24, 24),
            `<circle cx="12" cy="12" r="11" fill="${GREEN}" fill-opacity=".2"/><circle cx="12" cy="12" r="5.6" fill="${GREEN}"/>`,
          ),
        ]),
        node('d_anan_cards_takeaway_node', START, 862, TEAL),
        ...foot('cards').decorations,
      ],
    },
    {
      id: 'l_anan_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head('timeline').placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 546, 392, 79), 'title', { color: token('primary') }),
          place(`p_what${i + 1}`, 'subtitle', at(start, 628, 380, 96), 'heading', { vAlign: 'bottom' }),
          place(`p_what${i + 1}_body`, 'body', at(start, 728, 380, 142), 'caption'),
        ]),
        place('p_note', 'caption', at(AFTER, 884, WIDTH - 42, 34), 'caption'),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        ...head('timeline').decorations,
        art('d_anan_timeline_rise', rise, riseArcs),
        ...columns4.map((start, i) =>
          drawing(`d_anan_timeline_block${i + 1}`, blockFrame(start), blockFits[i]!.markup(), PAINT),
        ),
        node('d_anan_timeline_note_node', START, 888, ORANGE),
        ...foot('timeline').decorations,
      ],
    },
    {
      id: 'l_anan_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head('process').placeholders,
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start, 538, 300, 96), 'heading', { vAlign: 'bottom' }),
          place(`p_step${i + 1}_body`, 'caption', at(start, 640, 300, 136), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start, 456, 300, 79), 'title', {
            color: token('primary'),
          }),
        ]),
        place('p_summary', 'body', at(AFTER, 814, WIDTH - 42, 90), 'body', { vAlign: 'middle' }),
        ...foot('process').placeholders,
      ],
      decorations: [
        ...head('process').decorations,
        ...steps5.map((start, i) =>
          drawing(`d_anan_process_icon${i + 1}`, stepFrame(start), stepFits[i]!.markup(), PAINT),
        ),
        // The hops between the steps: dashed, the way the request goes.
        ...steps5.slice(0, -1).map((start, i) =>
          art(
            `d_anan_process_hop${i + 1}`,
            at(start + 222, 380, 341 - 222 - 10, 20),
            `<path d="M${341 - 222 - 14} 10H14" stroke="${i === 3 ? TEAL : BLUE}" stroke-width="2.6" stroke-dasharray="${i === 3 ? '3 6' : '7 7'}" stroke-linecap="round"/>` +
              arrowhead(30, 10, 4, 10, i === 3 ? TEAL : BLUE, 11) +
              (i === 1 ? `<circle cx="${(341 - 232) / 2}" cy="10" r="12" fill="${ORANGE}" fill-opacity=".18"/><circle cx="${(341 - 232) / 2}" cy="10" r="6" fill="${ORANGE}"/>` : ''),
          ),
        ),
        // The budget of the time, hop by hop, in one bar under the steps.
        ...(() => {
          const shares = [12, 3, 95, 70];
          const total = shares.reduce((a, b) => a + b, 0);
          let start = START;
          return shares.map((v, i) => {
            const w = Math.round(((WIDTH - 12) * v) / total);
            const el = rect(
              `d_anan_process_budget${i + 1}`,
              at(start, 794, w - 4, 10),
              solid(token(i === 3 ? 'secondary' : 'primary', i === 2 || i === 3 ? 0.9 : 0.45)),
              { effects: { radius: 5 } },
            );
            start += w;
            return el;
          });
        })(),
        node('d_anan_process_summary_node', START, 846, TEAL),
        ...foot('process').decorations,
      ],
    },
    {
      id: 'l_anan_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head('comparison').placeholders,
        ...(
          [
            ['before', START],
            ['after', START + 864],
          ] as const
        ).flatMap(([side, start]) => [
          place(`p_${side}_tag`, 'caption', at(start + 76, 472, 690, 34), 'caption'),
          place(`p_${side}`, 'subtitle', at(start + 42, 520, 716, 96), 'heading', { vAlign: 'bottom' }),
          place(`p_${side}_body`, 'body', at(start + 42, 622, 716, 270), 'body'),
        ]),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        ...head('comparison').decorations,
        ...(
          [
            ['before', START, ORANGE, beforeScene()],
            ['after', START + 864, GREEN, afterScene()],
          ] as const
        ).flatMap(([side, start, light, scene]) => [
          card(`d_anan_comparison_${side}`, at(start, 284, 800, 626)),
          rect(`d_anan_comparison_${side}_stage`, at(start + 12, 296, 776, 216), STAGE, { effects: { radius: 14 } }),
          lattice(`d_anan_comparison_${side}_lattice`, at(start + 12, 296, 776, 216), 0.26),
          drawing(`d_anan_comparison_${side}_scene`, at(start + 12, 300, 776, 166), scene.fit(776, 166, 8), PAINT),
          art(
            `d_anan_comparison_${side}_light`,
            at(start + 42, 477, 24, 24),
            `<circle cx="12" cy="12" r="11" fill="${light}" fill-opacity=".2"/><circle cx="12" cy="12" r="5.6" fill="${light}"/>`,
          ),
        ]),
        art(
          'd_anan_comparison_arrow',
          at(START + 800, 580, 64, 64),
          `<circle cx="32" cy="32" r="30" fill="${WHITE}" stroke="${NAVY}" stroke-opacity=".1" stroke-width="1.5"/><path d="M42 32H22m8-9-9 9 9 9" stroke="${BLUE}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
        ),
        ...foot('comparison').decorations,
      ],
    },
    {
      id: 'l_anan_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head('chart', 1100).placeholders,
        place('p_chart', 'chart', at(START + 24, 356, 1052, 540)),
        place('p_stat1', 'number', atEnd(END, 284, 480, 135), 'display', { color: token('primary') }),
        place('p_stat1_body', 'body', atEnd(END, 422, 480, 135), 'body'),
        place('p_stat2', 'number', atEnd(END, 580, 480, 135), 'display'),
        place('p_stat2_body', 'body', atEnd(END, 718, 480, 92), 'body'),
        place('p_source', 'caption', atEnd(END, 828, 480, 68), 'caption'),
        ...foot('chart').placeholders,
      ],
      decorations: [
        ...head('chart').decorations,
        card('d_anan_chart_panel', at(START, 284, 1100, 624)),
        lettered('d_anan_chart_bar', at(START, 284, 1100, 56), (dir) =>
          svg(1100, 56, panelBar(1100, 'metrics / latency.p95', [['edge', BLUE]], dir)),
        ),
        rect('d_anan_chart_bar_rule', at(START, 340, 1100, 1.5), solid(token('text', 0.08))),
        rect('d_anan_chart_divider', atEnd(END, 564, 480, 1.5), solid(token('text', 0.1))),
        art(
          'd_anan_chart_mark1',
          atEnd(END + 480 + 18, 322, 14, 60),
          `<rect x="2" width="10" height="60" rx="5" fill="${BLUE}"/>`,
        ),
        art(
          'd_anan_chart_mark2',
          atEnd(END + 480 + 18, 618, 14, 60),
          `<rect x="2" width="10" height="60" rx="5" fill="${TEAL}"/>`,
        ),
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_anan_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head('table', 1100).placeholders,
        place('p_table', 'table', at(START + 20, 292, WIDTH - 40, 612)),
        // The note stands under the filters, as a console says how fresh its data is.
        place('p_note', 'caption', atEnd(END, 146, 500, 68), 'caption'),
        ...foot('table').placeholders,
      ],
      decorations: [
        ...head('table').decorations,
        card('d_anan_table_panel', at(START, 280, WIDTH, 632)),
        lettered('d_anan_table_filters', atEnd(END, 82, 470, 46), (dir) => {
          const a = chipMarkup('window: 30d', BLUE, { size: 17 });
          const b = chipMarkup('regions: all', GREEN, { size: 17 });
          const gap = 12;
          const total = a.w + b.w + gap;
          const x0 = dir === 'rtl' ? 0 : 470 - total;
          const inner = (m: string) => m.replace(/^<svg[^>]*>|<\/svg>$/g, '');
          return svg(
            470,
            46,
            `<g transform="translate(${x0} 6)">${inner(a.markup)}</g><g transform="translate(${x0 + a.w + gap} 6)">${inner(b.markup)}</g>`,
          );
        }),
        node('d_anan_table_note_node', 1920 - END - 500 - 12 - 26, 150, TEAL),
        ...foot('table').decorations,
      ],
    },
    {
      id: 'l_anan_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head('team').placeholders,
        ...team4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start, 284, 380, 330)),
          place(`p_person${i + 1}`, 'subtitle', at(start, 636, 380, 53), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start + 42, 692, 338, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start, 732, 380, 102), 'caption'),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: [
        ...head('team').decorations,
        ...team4.flatMap((start, i) => [
          // The long shadow of the picture, cast toward the end and down as the drawings cast theirs.
          art(
            `d_anan_team_shadow${i + 1}`,
            at(start, 284, 440, 390),
            `<defs><linearGradient id="s" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${NAVY}" stop-opacity=".1"/><stop offset=".7" stop-color="${NAVY}" stop-opacity="0"/></linearGradient></defs>` +
              `<path d="M60 0 0 60V390H380L440 330V0Z" fill="url(#s)"/>`,
          ),
          rect(`d_anan_team_mat${i + 1}`, at(start - 8, 276, 396, 346), solid(token('surface')), {
            stroke: { color: token('text', 0.08), width: 1.5 },
            effects: { radius: 6 },
          }),
          art(
            `d_anan_team_light${i + 1}`,
            at(start, 697, 24, 24),
            `<circle cx="12" cy="12" r="11" fill="${i === 0 ? GREEN : NAVY}" fill-opacity="${i === 0 ? 0.2 : 0.06}"/><circle cx="12" cy="12" r="5.4" fill="${i === 0 ? GREEN : MUTED}" fill-opacity="${i === 0 ? 1 : 0.5}"/>`,
          ),
        ]),
        lettered('d_anan_team_rotation', at(START, 854, WIDTH, 52), (dir) =>
          rotation(
            WIDTH,
            team4.map((s) => s - START),
            380,
            dir,
          ),
        ),
        ...foot('team').decorations,
      ],
    },
    {
      id: 'l_anan_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(AFTER, 196, 760, 34), 'caption'),
        place('p_title', 'title', at(START, 246, 860, 262), 'display'),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(START + 66, top, 760, 92), 'body', { vAlign: 'middle' }),
        ),
        place('p_contact', 'caption', at(AFTER, 884, 820, 34), 'caption'),
      ],
      decorations: [
        drawing('d_anan_closing_scene', closingArt, deployScene().fit(closingArt.w, closingArt.h, 20, 4, 0.5, 0.35), PAINT),
        lettered('d_anan_closing_toast', atEnd(110, 752, 470, 250), deployToast(470, 250)),
        node('d_anan_closing_node', START, 200),
        ...lines3.flatMap((top, i) => [
          art(`d_anan_closing_tick${i + 1}`, at(START, top + 24, 44, 44), tick(22, 22, 14)),
          art(
            `d_anan_closing_rule${i + 1}`,
            at(START, top + 100, 828, 6),
            `<path d="M2 3H826" stroke="${BLUE}" stroke-opacity=".3" stroke-width="1.6" stroke-dasharray="2 7" stroke-linecap="round"/>`,
          ),
        ]),
        art(
          'd_anan_closing_mail',
          at(START, 886, 30, 30),
          `<rect x="2" y="5" width="26" height="20" rx="4" stroke="${BLUE}" stroke-width="2.4"/><path d="M3 7l12 9 12-9" stroke="${BLUE}" stroke-width="2.4" stroke-linejoin="round"/>`,
        ),
        mark('d_anan_closing_mark', at(START, 96, 46, 50)),
      ],
    },
  ];
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
        return (ltr ? { ...rest, markup: ltr } : rest) as Element;
      }),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The sample: a fintech's platform team on moving payments to three cloud regions

const FOOTER_HE = text('Nativ Pay · סקירת ארכיטקטורה');
const FOOTER_EN = text('Nativ Pay · Architecture review');
const TABLE_COLS = [384, 320, 300, 300, 320];
const TABLE_ROW = 96;
const P95 = [292, 286, 279, 241, 208, 180];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_anan_hero',
    name: 'פתיחה',
    content: {
      caption: [text('Nativ Pay · צוות הפלטפורמה'), text('סקירת ארכיטקטורה · 14 בינואר 2027')],
      title: text('תשלומים', 'בשלושה אזורים'),
      subtitle: text('איך העברנו את ליבת התשלומים לענן רב־אזורי,', 'בלי דקה אחת של השבתה'),
    },
  },
  {
    layout: 'l_anan_section',
    name: 'למה',
    content: {
      number: text('01'),
      caption: text('חלק ראשון'),
      title: text('אזור אחד'),
      subtitle: text('תקלה אחת שם עצרה את כל התשלומים.'),
    },
  },
  {
    layout: 'l_anan_text',
    name: 'על מה נדבר',
    content: {
      title: text('על מה נדבר היום'),
      body: {
        paragraphs: [
          para('עשרים דקות, ואחריהן שאלות:'),
          ...bullets(
            'למה אזור אחד כבר לא הספיק לנו',
            'הארכיטקטורה: שלושה אזורים פעילים במקביל',
            'המעבר בארבעה שלבים, בלי השבתה',
            'מה זה עשה לזמינות, לזמן התגובה ולעלות',
          ).paragraphs,
        ],
      },
    },
  },
  {
    layout: 'l_anan_big_number',
    name: 'זמינות',
    content: {
      caption: [
        text('זמינות'),
        text('השבתה בזמן המעבר'),
        text('זמן תגובה p95, לפני ואחרי'),
        text('אזורים שמשרתים במקביל'),
      ],
      title: text('שלושה חודשים בלי לעצור'),
      number: [text('99.995%'), text('0 דק׳'), text('−38%'), text('3')],
      subtitle: text('זמינות התשלומים מאז המעבר'),
      body: text('פחות משבע דקות של שירות חלקי ב-90 ימים.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_anan_text_image',
    name: 'הארכיטקטורה',
    content: {
      caption: text('הארכיטקטורה'),
      title: text('שלושה אזורים, ליבה אחת'),
      image: { assetId: pictures.ananArchitecture.id },
      subtitle: [text('כולם פעילים, כל הזמן'), text('ספר חשבונות מסונכרן'), text('ניתוב לפי בריאות')],
      body: [
        text('כל אזור מקבל תשלומים אמיתיים. אין אזור גיבוי שמחכה ליום רע.'),
        text('כל עסקה נכתבת בשני אזורים לפחות לפני שהיא מאושרת.'),
        text('הקצה שולח כל בקשה לאזור הקרוב והבריא ביותר, תוך שניות.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_anan_cards',
    name: 'מה עבר קודם',
    content: {
      caption: [text('מה עבר קודם'), text('svc/gateway'), text('svc/ledger'), text('svc/risk')],
      title: text('שלושת השירותים שעברו ראשונים'),
      subtitle: [text('שער התשלומים'), text('ספר החשבונות'), text('מנוע הסיכונים')],
      body: [
        text('מנתב כל בקשה. אין לו מצב משלו, ולכן עבר ראשון.'),
        text('הכסף עצמו: נכתב בשלושה אזורים ומאושר אחרי שניים.'),
        text('בודק כל עסקה ב-40 מילישניות, באותו מודל בכל אזור.'),
        text('39 השירותים האחרים עברו באותה דרך, בשישה שבועות.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_anan_timeline',
    name: 'המעבר',
    content: {
      caption: [text('המעבר'), text('כל שלב נפתח רק אחרי 72 שעות בתוך יעדי השירות.')],
      title: text('ארבעה שלבים, אפס השבתה'),
      number: [text('1%'), text('10%'), text('50%'), text('100%')],
      subtitle: [text('קנרי'), text('סוחרים קטנים'), text('חצי מהתעבורה'), text('כל התעבורה')],
      body: [
        text('1 בדצמבר: עובדי החברה בלבד, עם חזרה אוטומטית.'),
        text('8 בדצמבר: 2,000 סוחרים שביקשו להיות ראשונים.'),
        text('15 בדצמבר: האזורים החדשים נושאים חצי מהתשלומים.'),
        text('22 בדצמבר: שלושה אזורים, שווים.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_anan_process',
    name: 'הדרך של תשלום',
    content: {
      caption: [
        text('הדרך של תשלום'),
        text('DNS ו-TLS קרוב למשתמש'),
        text('בוחר את האזור הבריא הקרוב'),
        text('אימות, סיכון ותמחור'),
        text('נכתב בשני אזורים'),
        text('עותק שלישי, ברקע'),
      ],
      title: text('מה קורה ב-180 מילישניות'),
      subtitle: [text('קצה'), text('מאזן עומסים'), text('שירות'), text('ספר חשבונות'), text('שכפול')],
      number: [text('12 ms'), text('3 ms'), text('95 ms'), text('70 ms'), text('0 ms')],
      body: text('180 מילישניות מקצה לקצה ב-p95, לעומת 290 לפני המעבר.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_anan_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('לפני ואחרי'), text('לפני · אזור אחד'), text('אחרי · שלושה אזורים')],
      title: text('מה השתנה בארכיטקטורה'),
      subtitle: [text('אזור ראשי וגיבוי קר'), text('שלושה אזורים פעילים')],
      body: [
        bullets('מעבר לגיבוי: 4 שעות, ידנית', 'הגיבוי לא ראה תעבורה אמיתית', 'תקלה אחת עצרה את כל התשלומים'),
        bullets('אזור שנופל יוצא מהניתוב ב-30 שניות', 'כל אזור נושא תעבורה אמיתית', 'תקלה פוגעת בשליש לכל היותר'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_anan_chart',
    name: 'זמן תגובה',
    content: {
      caption: [text('זמן תגובה'), text('p95 של שירות התשלומים, נמדד בקצה, יולי עד דצמבר 2026.')],
      title: text('זמן תגובה p95, במילישניות'),
      number: [text('−38%'), text('−21%')],
      body: [
        text('בזמן התגובה: כל משתמש מגיע עכשיו לאזור קרוב אליו.'),
        text('בעלות לכל מיליון תשלומים, בלי גיבוי קר.'),
      ],
      footer: FOOTER_HE,
    },
    chart: {
      chartType: 'column',
      title: 'p95 במילישניות, ממוצע חודשי',
      data: {
        categories: ['יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'],
        series: [{ name: 'p95', values: P95 }],
      },
    },
  },
  {
    layout: 'l_anan_table',
    name: 'האזורים',
    content: {
      caption: [text('האזורים'), text('ממוצעי 30 יום, נכון ל-10 בינואר 2027.')],
      title: text('שלושה אזורים במספרים'),
      footer: FOOTER_HE,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['אזור', 'מיקום', 'חלק בתעבורה', 'p95', 'זמינות'],
        ['il-central-1', 'תל אביב', '46%', '164 ms', '99.997%'],
        ['eu-central-1', 'פרנקפורט', '31%', '188 ms', '99.996%'],
        ['eu-west-1', 'אירלנד', '23%', '196 ms', '99.995%'],
        ['סך הכול', 'שלושה אזורים', '100%', '180 ms', '99.995%'],
      ],
    },
  },
  {
    layout: 'l_anan_full_image',
    name: 'המפה החדשה',
    content: {
      image: { assetId: pictures.ananCity.id },
      caption: text('המפה החדשה'),
      title: text('שלושה אזורים, 42 שירותים,', 'מפה אחת'),
      body: text('כל שירות רץ בכל אזור, וכל אזור יכול לשאת לבד את כל התעבורה.'),
    },
  },
  {
    layout: 'l_anan_quote',
    name: 'ציטוט',
    content: {
      quote: text('בלילה של המעבר ישבנו מול הגרפים וחיכינו שמשהו יקרה. שום דבר לא קרה, וזה בדיוק היה הרעיון.'),
      attribution: text('עידו נחום'),
      caption: text('SRE, תורן בלילה של המעבר'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_anan_team',
    name: 'התורנות',
    content: {
      caption: [text('התורנות'), text('ראש הפלטפורמה'), text('SRE'), text('נתונים'), text('רשת וקצה')],
      title: text('מי החזיק את המעבר'),
      image: [
        { assetId: pictures.ananTeam1.id },
        { assetId: pictures.ananTeam2.id },
        { assetId: pictures.ananTeam3.id },
        { assetId: pictures.ananTeam4.id },
      ],
      subtitle: [text('מיכל שגב'), text('יואב כרמי'), text('רותי אלון'), text('עידו נחום')],
      body: [
        text('הובילה את המעבר ואת ההחלטה על שלושה אזורים.'),
        text('כתב את ספרי ההפעלה ואת מנגנון החזרה האוטומטית.'),
        text('אחראית לסנכרון ספר החשבונות.'),
        text('בנה את הניתוב לפי בריאות בקצה.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_anan_closing',
    name: 'סיום',
    content: {
      caption: [text('מה הלאה'), text('michal@nativpay.example · nativpay.example/regions')],
      title: text('תודה!'),
      body: [
        text('ספר ההפעלה של המעבר פתוח לכל הצוותים'),
        text('ברבעון הבא: אזור רביעי, בצפון אמריקה'),
        text('יש שאלות? נשמח לעבור יחד על הנתונים'),
      ],
    },
  },
];

const sampleEn: SampleSlide[] = [
  {
    layout: 'l_anan_hero',
    name: 'Opening',
    content: {
      caption: [text('Nativ Pay · Platform team'), text('Architecture review · 14 January 2027')],
      title: text('Payments in', '3 regions'),
      subtitle: text('Moving the payments core to three regions, with zero downtime'),
    },
  },
  {
    layout: 'l_anan_section',
    name: 'Why',
    content: {
      number: text('01'),
      caption: text('Part one'),
      title: text('One region'),
      subtitle: text('One outage there stopped every payment.'),
    },
  },
  {
    layout: 'l_anan_text',
    name: 'Today',
    content: {
      title: text('What we will cover today'),
      body: {
        paragraphs: [
          para('Twenty minutes, then questions:'),
          ...bullets(
            'Why one region was no longer enough',
            'The architecture: three active regions',
            'The move in four stages, with no downtime',
            'What it did to uptime, latency and cost',
          ).paragraphs,
        ],
      },
    },
  },
  {
    layout: 'l_anan_big_number',
    name: 'Availability',
    content: {
      caption: [
        text('Availability'),
        text('Downtime during the move'),
        text('p95 latency, before and after'),
        text('Regions serving at once'),
      ],
      title: text('Three months without a stop'),
      number: [text('99.995%'), text('0 min'), text('−38%'), text('3')],
      subtitle: text('Availability since the move'),
      body: text('Under seven minutes of partial service in 90 days.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_anan_text_image',
    name: 'The architecture',
    content: {
      caption: text('The architecture'),
      title: text('Three regions, one core'),
      image: { assetId: pictures.ananArchitecture.id },
      subtitle: [text('All active, all the time'), text('One ledger, in sync'), text('Routing by health')],
      body: [
        text('Every region takes live payments. No standby waits for a bad day.'),
        text('Each payment is saved in two regions first.'),
        text('The edge sends each request to the nearest healthy region, in seconds.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_anan_cards',
    name: 'What moved first',
    content: {
      caption: [text('Moved first'), text('svc/gateway'), text('svc/ledger'), text('svc/risk')],
      title: text('The first three to move'),
      subtitle: [text('Payment gateway'), text('The ledger'), text('Risk engine')],
      body: [
        text('Routes every request. Stateless, so it went first.'),
        text('The money itself: written to three regions, confirmed on two.'),
        text('Scores each payment in 40 ms, in every region.'),
        text('The other 39 services followed in six weeks.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_anan_timeline',
    name: 'The move',
    content: {
      caption: [text('The move'), text('Every stage held its targets for 72 hours.')],
      title: text('Four stages, zero downtime'),
      number: [text('1%'), text('10%'), text('50%'), text('100%')],
      subtitle: [text('Canary'), text('Early merchants'), text('Half the traffic'), text('Everyone')],
      body: [
        text('1 December: staff only, auto rollback.'),
        text('8 December: 2,000 merchants who asked first.'),
        text('15 December: the new regions carry half the load.'),
        text('22 December: old region becomes one of three.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_anan_process',
    name: 'The path of a payment',
    content: {
      caption: [
        text("A payment's path"),
        text('TLS near the user'),
        text('Picks a healthy region'),
        text('Auth, risk, pricing'),
        text('Written to two regions'),
        text('A third copy, async'),
      ],
      title: text('What happens in 180 ms'),
      subtitle: [text('Edge'), text('Load balancer'), text('Service'), text('Ledger'), text('Replication')],
      number: [text('12 ms'), text('3 ms'), text('95 ms'), text('70 ms'), text('0 ms')],
      body: text('180 ms end to end at p95, down from 290 before the move.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_anan_comparison',
    name: 'Before and after',
    content: {
      caption: [text('Architecture'), text('Before · one region'), text('After · three regions')],
      title: text('One region, then three'),
      subtitle: [text('Main region, cold standby'), text('Three active regions')],
      body: [
        bullets('Failover: four hours, by hand', 'The standby never saw real traffic', 'One outage stopped every payment'),
        bullets('Failed regions leave routing in 30 s', 'Every region carries live traffic', 'An outage hits a third at most'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_anan_chart',
    name: 'Latency',
    content: {
      caption: [text('Latency'), text('p95 of the payments service, measured at the edge, July to December 2026.')],
      title: text('p95 latency, in milliseconds'),
      number: [text('−38%'), text('−21%')],
      body: [
        text('In latency: every user now reaches a region near them.'),
        text('In cost per million payments, with no cold standby.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'p95 in milliseconds, monthly average',
      data: {
        categories: ['Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        series: [{ name: 'p95', values: P95 }],
      },
    },
  },
  {
    layout: 'l_anan_table',
    name: 'The regions',
    content: {
      caption: [text('The regions'), text('30-day averages, as of 10 January 2027.')],
      title: text('Three regions in numbers'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['Region', 'Location', 'Traffic share', 'p95', 'Availability'],
        ['il-central-1', 'Tel Aviv', '46%', '164 ms', '99.997%'],
        ['eu-central-1', 'Frankfurt', '31%', '188 ms', '99.996%'],
        ['eu-west-1', 'Ireland', '23%', '196 ms', '99.995%'],
        ['Total', 'Three regions', '100%', '180 ms', '99.995%'],
      ],
    },
  },
  {
    layout: 'l_anan_full_image',
    name: 'The new map',
    content: {
      image: { assetId: pictures.ananCity.id },
      caption: text('The new map'),
      title: text('Three regions, 42 services,', 'one map'),
      body: text('Every service runs in every region, and each region can carry all the traffic alone.'),
    },
  },
  {
    layout: 'l_anan_quote',
    name: 'Quote',
    content: {
      quote: text('On the night of the move we sat watching the graphs, waiting for something to happen. Nothing did, and that was the whole idea.'),
      attribution: text('Ido Nahum'),
      caption: text('SRE, on call the night of the move'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_anan_team',
    name: 'On call',
    content: {
      caption: [text('On call'), text('Platform lead'), text('SRE'), text('Data'), text('Network')],
      title: text('Who carried the move'),
      image: [
        { assetId: pictures.ananTeam1.id },
        { assetId: pictures.ananTeam2.id },
        { assetId: pictures.ananTeam3.id },
        { assetId: pictures.ananTeam4.id },
      ],
      subtitle: [text('Michal Segev'), text('Yoav Karmi'), text('Ruti Alon'), text('Ido Nahum')],
      body: [
        text('Led the move and the call for three regions.'),
        text('Wrote the runbooks and the automatic rollback.'),
        text('Kept one ledger in sync.'),
        text('Built the health-based routing.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_anan_closing',
    name: 'Closing',
    content: {
      caption: [text('What next'), text('michal@nativpay.example · nativpay.example/regions')],
      title: text('Thank you!'),
      body: [
        text('The migration runbook is open to every team'),
        text('Next quarter: a fourth region, in North America'),
        text('Questions? Happy to walk through the data'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const ananSamples = { he: sampleHe, en: sampleEn };

/** The Anan template: the theme, its layouts for both directions, and its sample deck. */
export function ananTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(ananTheme),
    description:
      'Cloud architecture: isometric servers, databases and regions on an airy dotted ground, dashed connectors and console chips, for infrastructure, DevOps and reliability reviews.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.ananArchitecture,
      pictures.ananCity,
      pictures.ananTeam1,
      pictures.ananTeam2,
      pictures.ananTeam3,
      pictures.ananTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}

export const entry = { id: 'anan', template: ananTemplate, samples: ananSamples };
