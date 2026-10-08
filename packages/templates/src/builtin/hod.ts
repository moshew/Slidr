import type { Background, Color, Element, Fill, Frame, Layout, Theme } from '@slidr/model';
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
  text,
  token,
  type SampleSlide,
} from './kit';
import { pictures } from './pictures.generated';

/**
 * Hod ("splendour"): Art Deco at its centenary. Gold line ornament on a deep peacock teal:
 * a double rule with stepped corners around every slide, sunbursts that rise from the foot of
 * a slide or open from its corners, arched niches and stepped crowns over the panels, and one
 * gilded slide, the section, where the colours change places. Corners are sharp; the arches
 * are the only curves. Symmetry is the rule and the asymmetric slides are the exception.
 *
 * Every text is light on teal: champagne for what is read, gold for figures and captions, pale
 * gold for headings. The gold fields carry no text, so the gold of the theme can be the colour
 * of the captions and of the table's header row (the teal of the ground on it reads 7:1).
 */
export const hodTheme: Theme = {
  id: 'hod',
  name: 'Hod',
  colors: {
    bg: '#0d2b30',
    surface: '#123a40',
    text: '#f3e9d2',
    muted: '#bbae8c',
    primary: '#d4af5f',
    secondary: '#e8d7a8',
    accent: '#e07a5f',
    chart: ['#d4af5f', '#f3e9d2', '#7fc8b1', '#e07a5f', '#9c8650', '#5e8f8a'],
  },
  fonts: {
    heading: { he: 'Suez One', latin: 'DM Serif Display' },
    body: { he: 'Assistant', latin: 'Montserrat' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 140,
      weight: 400,
      lineHeight: 1.02,
      color: { token: 'primary' },
    },
    title: {
      font: 'heading',
      size: 70,
      weight: 400,
      lineHeight: 1.12,
      letterSpacing: 0.5,
      color: { token: 'text' },
    },
    heading: {
      font: 'heading',
      size: 42,
      weight: 400,
      lineHeight: 1.2,
      color: { token: 'secondary' },
    },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: {
      font: 'body',
      size: 24,
      weight: 600,
      lineHeight: 1.4,
      letterSpacing: 2,
      color: { token: 'primary' },
    },
  },
  radius: 0,
  shadow: { x: 0, y: 18, blur: 44, color: { value: '#06171a', alpha: 0.55 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  // Only teal grounds: every style is light, and a gold ground would leave it unread.
  backgroundVariants: [
    {
      fill: {
        kind: 'linear',
        angle: 180,
        stops: [
          { color: { token: 'surface' }, at: 0 },
          { color: { token: 'bg' }, at: 0.62 },
        ],
      },
    },
    { fill: { kind: 'solid', color: { token: 'surface' } } },
  ],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

const GOLD = '#d4af5f';
const PALE = '#e8d7a8';
const CHAMPAGNE = '#f3e9d2';
const ANTIQUE = '#9c8650';
const TEAL = '#0d2b30';
const SURFACE = '#123a40';

/**
 * The literal colours of the drawings, and the tokens they stand for. Antique gold is the gold
 * of the theme let through to the teal under it, so it follows the theme as well.
 */
const PAINT = {
  [GOLD]: token('primary'),
  [PALE]: token('secondary'),
  [CHAMPAGNE]: token('text'),
  [ANTIQUE]: token('primary', 0.55),
  [TEAL]: token('bg'),
  [SURFACE]: token('surface'),
};

const linear = (angle: number, ...stops: [color: Color, at: number][]): Fill => ({
  kind: 'linear',
  angle,
  stops: stops.map(([color, stop]) => ({ color, at: stop })),
});

/** The ground of a content slide: the lighter teal at the top, deepening downwards. */
const deep = (): Background => ({
  fill: linear(180, [token('surface'), 0], [token('bg'), 0.62]),
});

/** The ground of the symmetric slides: lit from the foot of the slide, where the sun rises. */
const lit = (): Background => ({
  fill: {
    kind: 'radial',
    center: { x: 0.5, y: 1 },
    stops: [
      { color: token('surface'), at: 0 },
      { color: token('bg'), at: 0.78 },
    ],
  },
});

/** A lighter ground, for the slides whose panels are the dark teal. */
const raised = (): Background => ({
  fill: linear(180, [token('surface'), 0], [token('surface'), 0.55], [token('bg'), 1]),
});

/** The gilded ground of the section: leaf gold, pale at the top and deeper at the foot. */
const gilt = (): Background => ({
  fill: linear(165, [token('secondary'), 0], [token('primary'), 0.5], [token('primary'), 1]),
  overlay: linear(180, [token('bg', 0), 0.45], [token('bg', 0.32), 1]),
});

/** A number for SVG markup. */
const n = (value: number) => String(Math.round(value * 100) / 100);

/**
 * An arc of a circle or an ellipse between two angles, anticlockwise: angles are in degrees
 * from the right, and turn upwards.
 */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): string {
  const [x0, y0] = [
    cx + rx * Math.cos((a0 * Math.PI) / 180),
    cy - ry * Math.sin((a0 * Math.PI) / 180),
  ];
  const [x1, y1] = [
    cx + rx * Math.cos((a1 * Math.PI) / 180),
    cy - ry * Math.sin((a1 * Math.PI) / 180),
  ];
  return `M${n(x0)} ${n(y0)}A${n(rx)} ${n(ry)} 0 ${a1 - a0 > 180 ? 1 : 0} 0 ${n(x1)} ${n(y1)}`;
}

/** A band of an ellipse between two reaches and two angles. */
function band(cx: number, cy: number, r0: number, r1: number, k: number, a0: number, a1: number) {
  const outer = arc(cx, cy, r1, r1 * k, a0, a1);
  const [x1, y1] = [
    cx + r0 * Math.cos((a1 * Math.PI) / 180),
    cy - r0 * k * Math.sin((a1 * Math.PI) / 180),
  ];
  const [x0, y0] = [
    cx + r0 * Math.cos((a0 * Math.PI) / 180),
    cy - r0 * k * Math.sin((a0 * Math.PI) / 180),
  ];
  return `${outer}L${n(x1)} ${n(y1)}A${n(r0)} ${n(r0 * k)} 0 0 1 ${n(x0)} ${n(y0)}Z`;
}

/** A filled sector of an ellipse, from its centre. */
function sector(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): string {
  return `M${n(cx)} ${n(cy)}L${arc(cx, cy, rx, ry, a0, a1).slice(1)}Z`;
}

interface Burst {
  cx: number;
  cy: number;
  /** The reach of the rays; an ellipse when `ry` is given. */
  r: number;
  ry?: number;
  from: number;
  to: number;
  /** Degrees between two rays. */
  step: number;
  /** Where the rays start, as a share of the reach. */
  inner: number;
  /** The rings, as shares of the reach. */
  rings: readonly number[];
  /** The solid disc at the centre, as a share of the reach. */
  core: number;
  color?: string;
  /** Alternate wedges laid in, as the fluted fans of a Deco door. */
  flutes?: number;
  width?: number;
  gradient?: string;
}

/**
 * A sunburst: a solid core, rays that run from it to the reach, long and short in turn, and
 * rings across them. Drawn between two angles, so the same drawing is a rising half sun or a
 * quarter fan in a corner.
 */
function burst(b: Burst): string {
  const { cx, cy, r, from, to, step, inner, rings, core, color = GOLD, width = 1.5 } = b;
  const ry = b.ry ?? r;
  const parts: string[] = [];
  if (b.flutes) {
    // Between the start of the rays and the outermost ring, so each wedge ends on a ring.
    const reach = r * Math.max(...rings, 0.86);
    const wedges: string[] = [];
    for (let a = from; a < to - 0.01; a += step * 2) {
      wedges.push(band(cx, cy, r * inner, reach, ry / r, a, Math.min(a + step, to)));
    }
    parts.push(`<path d="${wedges.join('')}" fill="${color}" fill-opacity="${b.flutes}"/>`);
  }
  const rays: string[] = [];
  for (let a = from, i = 0; a <= to + 0.01; a += step, i++) {
    const reach = i % 2 === 0 ? 1 : 0.86;
    const c = Math.cos((a * Math.PI) / 180);
    const s = Math.sin((a * Math.PI) / 180);
    rays.push(
      `M${n(cx + r * inner * c)} ${n(cy - ry * inner * s)}L${n(cx + r * reach * c)} ${n(cy - ry * reach * s)}`,
    );
  }
  parts.push(`<path d="${rays.join('')}" stroke="${color}" stroke-width="${width}"/>`);
  for (const ring of rings) {
    parts.push(
      `<path d="${arc(cx, cy, r * ring, ry * ring, from, to)}" stroke="${color}" stroke-width="${width}"/>`,
    );
  }
  if (core > 0) {
    parts.push(
      `<path d="${sector(cx, cy, r * core, ry * core, from, to)}" fill="${b.gradient ? `url(#${b.gradient})` : color}"/>`,
      `<path d="${arc(cx, cy, r * core * 1.32, ry * core * 1.32, from, to)}" stroke="${color}" stroke-width="${width * 2}"/>`,
    );
  }
  return parts.join('');
}

/** A gradient of leaf gold, from pale at the top to antique at the foot. */
const leaf = (id: string) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PALE}"/><stop offset="0.5" stop-color="${GOLD}"/><stop offset="1" stop-color="${ANTIQUE}"/></linearGradient></defs>`;

/** An SVG drawing at the size of its frame, one unit a pixel. */
const art = (id: string, frame: Frame, inner: string): Element =>
  drawing(
    id,
    frame,
    `<svg viewBox="0 0 ${n(frame.w)} ${n(frame.h)}" fill="none">${inner}</svg>`,
    PAINT,
  );

/**
 * A rectangle whose corners step inwards, `steps` times by `s`: the ziggurat corner of the
 * frame and of the panels.
 */
function stepped(x: number, y: number, w: number, h: number, s: number, steps: number): string {
  const offsets: [number, number][] = [];
  for (let k = 0; k < steps; k++) {
    offsets.push([(steps - k) * s, k * s], [(steps - k) * s, (k + 1) * s]);
  }
  offsets.push([0, steps * s]);
  const back = [...offsets].reverse();
  const pts = [
    ...offsets.map(([a, b]) => [x + w - a, y + b]),
    ...back.map(([a, b]) => [x + w - a, y + h - b]),
    ...offsets.map(([a, b]) => [x + a, y + h - b]),
    ...back.map(([a, b]) => [x + a, y + b]),
  ];
  return `M${pts.map(([px, py]) => `${n(px!)} ${n(py!)}`).join('L')}Z`;
}

/** An arch: a rectangle under a half ellipse `ry` high. */
const archPath = (x: number, y: number, w: number, h: number, ry: number) =>
  `M${n(x)} ${n(y + h)}V${n(y + ry)}A${n(w / 2)} ${n(ry)} 0 0 1 ${n(x + w)} ${n(y + ry)}V${n(y + h)}Z`;

/**
 * A panel under a stepped crown, inset by `d`: the tiers narrow towards the top, each `rise`
 * high, to the shares of the width in `tiers` (widest first).
 */
function crownPath(w: number, h: number, rise: number, tiers: readonly number[], d = 0): string {
  const top = rise * tiers.length;
  const left: [number, number][] = [
    [d, h - d],
    [d, top + d],
  ];
  tiers.forEach((share, i) => {
    const x = (w * (1 - share)) / 2 + d;
    left.push([x, top - i * rise + d], [x, top - (i + 1) * rise + d]);
  });
  const right = [...left].reverse().map(([x, y]): [number, number] => [w - x, y]);
  return `M${[...left, ...right].map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
}

/** An octagon: a rectangle with its corners cut at 45 degrees. */
function octagon(x: number, y: number, w: number, h: number, c: number): string {
  return `M${n(x + c)} ${n(y)}H${n(x + w - c)}L${n(x + w)} ${n(y + c)}V${n(y + h - c)}L${n(x + w - c)} ${n(y + h)}H${n(x + c)}L${n(x)} ${n(y + h - c)}V${n(y + c)}Z`;
}

/** A diamond around a point. */
const diamondAt = (cx: number, cy: number, r: number) =>
  `M${n(cx)} ${n(cy - r)}L${n(cx + r)} ${n(cy)}L${n(cx)} ${n(cy + r)}L${n(cx - r)} ${n(cy)}Z`;

/**
 * The frame of every slide: an outer rule of gold with stepped corners, an inner rule of
 * antique gold, and a diamond where the outer rule crosses the middle of the top. On the
 * gilded slide it is drawn in teal.
 */
function border(id: string, color = GOLD, faint = ANTIQUE): Element {
  return art(
    id,
    atEnd(0, 0, 1920, 1080),
    `<path d="${stepped(36, 36, 1848, 1008, 12, 3)}" stroke="${color}" stroke-width="2"/>` +
      `<path d="${stepped(50, 50, 1820, 980, 9, 2)}" stroke="${faint}" stroke-width="1.25"/>` +
      `<path d="${diamondAt(960, 37, 9)}" fill="${color}"/>` +
      `<path d="${diamondAt(960, 37, 15)}" stroke="${color}" stroke-width="1.25"/>`,
  );
}

/** A rule of diamonds: hairlines between a diamond at each end and one in the middle. */
function diamonds(id: string, frame: Frame, color = GOLD): Element {
  const { w, h } = frame;
  const y = h / 2;
  const r = Math.min(6, y);
  return art(
    id,
    frame,
    `<path d="M${n(r * 2)} ${n(y)}H${n(w / 2 - r * 2.4)}M${n(w / 2 + r * 2.4)} ${n(y)}H${n(w - r * 2)}" stroke="${color}" stroke-width="1.25"/>` +
      `<path d="${diamondAt(r, y, r * 0.8)}${diamondAt(w - r, y, r * 0.8)}${diamondAt(w / 2, y, r * 1.3)}" fill="${color}"/>`,
  );
}

/** A short rule before a caption: a diamond and a hairline, set at the start of the line. */
function lead(id: string, frame: Frame): Element {
  const { w, h } = frame;
  return art(
    id,
    frame,
    `<path d="${diamondAt(w - 7, h / 2, 6)}" fill="${GOLD}"/><path d="M0 ${n(h / 2)}H${n(w - 18)}" stroke="${GOLD}" stroke-width="1.5"/>`,
  );
}

const MARK =
  `<svg viewBox="0 0 48 48" fill="none"><path d="M6 46V24A18 18 0 0 1 42 24V46Z" stroke="${GOLD}" stroke-width="2.5"/>` +
  `<path d="M24 40L12 26M24 40L18 21M24 40V19M24 40L30 21M24 40L36 26" stroke="${GOLD}" stroke-width="1.6"/>` +
  `<path d="M16 40A8 8 0 0 1 32 40Z" fill="${GOLD}"/><path d="M2 46H46" stroke="${GOLD}" stroke-width="2.5"/></svg>`;

/** The mark of the template: a sun rising in an arch. A deck replaces it with its logo. */
const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** The quotation mark of each direction, in gold. They are two marks, not one and its mirror. */
const QUOTE_RTL = `<svg viewBox="0 0 66 52"><path fill="${GOLD}" d="M66 0v22c0 18-9 28-26 30V42c8-2 12-7 12-16H40V0h26ZM26 0v22C26 40 17 50 0 52V42c8-2 12-7 12-16H0V0h26Z"/></svg>`;
const QUOTE_LTR = `<svg viewBox="0 0 66 52"><path fill="${GOLD}" d="M0 52V30C0 12 9 2 26 0v10c-8 2-12 7-12 16h12v26H0Zm40 0V30C40 12 49 2 66 0v10c-8 2-12 7-12 16h12v26H40Z"/></svg>`;

const quoteGlyph = (frame: Frame, markup: string) =>
  drawing('d_hod_quote_glyph', frame, markup, PAINT);

/** An arrow from what was to what is, drawn for a right-to-left slide: the mirror turns it. */
const ARROW = `<svg viewBox="0 0 40 24" fill="none"><path d="M38 12H4M14 2L4 12l10 10" stroke="${TEAL}" stroke-width="3" stroke-linecap="square"/></svg>`;

/** A Roman numeral, centred on what it numbers, in gold. */
const numeral = (id: string, frame: Frame, value: string, style: 'title' | 'heading' = 'heading') =>
  label(id, frame, value, style, {
    color: token('primary'),
    dir: 'ltr',
    align: 'center',
    vAlign: 'middle',
  });

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

/**
 * A panel under an arch, as the stat cards of a Deco foyer: teal, a rule of gold and one of
 * antique gold inside it, and a small sun rising at the foot of the arch.
 */
function archCard(
  id: string,
  frame: Frame,
  ry: number,
  rest: { fill?: string; fluted?: number } = {},
): Element {
  const { w, h } = frame;
  const fill = rest.fill ?? SURFACE;
  const sun = Math.min(ry * 0.62, 70);
  // The fluting of a column's foot, from `fluted` down to the inner rule.
  let foot = '';
  if (rest.fluted !== undefined && h - 24 - rest.fluted >= 40) {
    const lines = [];
    for (let x = w * 0.3; x <= w * 0.7 + 0.1; x += (w * 0.4) / 8) {
      lines.push(`M${n(x)} ${n(rest.fluted + 16)}V${n(h - 12)}`);
    }
    foot =
      `<path d="M${n(w * 0.26)} ${n(rest.fluted)}H${n(w * 0.74)}" stroke="${GOLD}" stroke-width="1.5"/>` +
      `<path d="${diamondAt(w / 2, rest.fluted, 6)}" fill="${GOLD}"/>` +
      `<path d="${lines.join('')}" stroke="${ANTIQUE}" stroke-width="1.25"/>`;
  }
  return art(
    id,
    frame,
    leaf(`${id}_g`) +
      `<path d="${archPath(1, 1, w - 2, h - 2, ry)}" fill="${fill}" stroke="${GOLD}" stroke-width="2"/>` +
      `<path d="${archPath(12, 12, w - 24, h - 24, ry - 11)}" stroke="${ANTIQUE}" stroke-width="1.25"/>` +
      burst({
        cx: w / 2,
        cy: ry + 6,
        r: sun,
        from: 12,
        to: 168,
        step: 12,
        inner: 0.3,
        rings: [],
        core: 0.2,
        width: 1.25,
        gradient: `${id}_g`,
      }) +
      foot,
  );
}

/** A panel under a stepped crown, with the crown's rules doubled. */
function crownCard(
  id: string,
  frame: Frame,
  rise: number,
  tiers: readonly number[],
  rest: { fill?: string } = {},
): Element {
  const { w, h } = frame;
  return art(
    id,
    frame,
    `<path d="${crownPath(w, h, rise, tiers, 1)}" fill="${rest.fill ?? SURFACE}" stroke="${GOLD}" stroke-width="2"/>` +
      `<path d="${crownPath(w, h, rise, tiers, 12)}" stroke="${ANTIQUE}" stroke-width="1.25"/>`,
  );
}

/** A panel with stepped corners and a double rule: what holds a chart or a table. */
function plaque(id: string, frame: Frame, fill = SURFACE): Element {
  const { w, h } = frame;
  return art(
    id,
    frame,
    `<path d="${stepped(1, 1, w - 2, h - 2, 10, 2)}" fill="${fill}" stroke="${GOLD}" stroke-width="2"/>` +
      `<path d="${stepped(12, 12, w - 24, h - 24, 7, 2)}" stroke="${ANTIQUE}" stroke-width="1.25"/>`,
  );
}

/**
 * An arched window around a picture: the lunette over the picture holds a sun, and two rules
 * run around the window. The picture's own frame is `photo`; the drawing reaches `crown` above
 * it and `margin` around it. Nothing is drawn where the picture will be.
 */
function window(id: string, photo: Frame, crown: number, margin: number): Element {
  const frame = {
    x: photo.x - margin,
    y: photo.y - crown,
    w: photo.w + 2 * margin,
    h: photo.h + crown + margin,
  };
  const { w, h } = frame;
  const cx = w / 2;
  const base = crown;
  const rx = photo.w / 2;
  const ry = crown - margin;
  return art(
    id,
    frame,
    leaf(`${id}_g`) +
      `<path d="${archPath(1, 1, w - 2, h - 2, crown - 1)}" stroke="${GOLD}" stroke-width="2"/>` +
      `<path d="${archPath(margin * 0.45, margin * 0.45, w - margin * 0.9, h - margin * 0.9, crown - margin * 0.45)}" stroke="${ANTIQUE}" stroke-width="1.25"/>` +
      `<path d="${archPath(margin, margin, photo.w, photo.h + ry, ry)}" fill="${SURFACE}"/>` +
      burst({
        cx,
        cy: base,
        r: rx * 0.92,
        ry: ry * 0.9,
        from: 0,
        to: 180,
        step: 7.5,
        inner: 0.34,
        rings: [0.62, 0.82],
        core: 0.22,
        width: 1.4,
        gradient: `${id}_g`,
      }),
  );
}

/** A band of chevrons between two hairlines: the zigzag of a Deco frieze. */
function chevrons(id: string, frame: Frame): Element {
  const { w, h } = frame;
  const period = h * 1.2;
  let zig = `M0 ${n(h - 6)}`;
  for (let x = 0, up = true; x < w; x += period / 2, up = !up) {
    zig += `L${n(Math.min(x + period / 2, w))} ${n(up ? 6 : h - 6)}`;
  }
  return art(
    id,
    frame,
    `<path d="M0 1H${n(w)}M0 ${n(h - 1)}H${n(w)}" stroke="${GOLD}" stroke-width="1.5"/>` +
      `<path d="${zig}" stroke="${GOLD}" stroke-width="2"/>`,
  );
}

/** Leaf gold as a fill: pale at the top, the theme's gold below. */
const LEAF = linear(165, [token('secondary'), 0], [token('primary'), 0.55], [token('primary'), 1]);

/**
 * What is etched into a plaque of gold leaf `w` by `h`: a sun rising behind a stepped tower,
 * in teal, with the tower's windows and crown picked out in gold.
 */
function tower(w: number, h: number): string {
  const c = w / 2;
  const tiers = [
    [180, h - 456],
    [150, h - 536],
    [120, h - 606],
    [80, h - 676],
    [20, h - 776],
  ] as const;
  // The silhouette, tier by tier: up the left side, over the needle, down the right side.
  const pts: [number, number][] = [[c - tiers[0][0], h]];
  tiers.forEach(([half, y], i) => {
    pts.push([c - half, y]);
    const next = tiers[i + 1];
    if (next) pts.push([c - next[0], y]);
  });
  pts.push([c - 4, h - 866], [c + 4, h - 866]);
  const right = pts
    .slice()
    .reverse()
    .map(([x, y]): [number, number] => [2 * c - x, y]);
  const outline = `M${[...pts, ...right].map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}Z`;
  const windows = [-150, -120, -90, -60, 60, 90, 120, 150]
    .map((dx) => `M${n(c + dx)} ${n(h - 420)}V${n(h)}`)
    .join('');
  return (
    burst({
      cx: c,
      cy: h - 236,
      r: h * 0.72,
      from: -10,
      to: 190,
      step: 5,
      inner: 0.2,
      rings: [0.5, 0.74, 0.98],
      core: 0,
      flutes: 0.1,
      color: TEAL,
      width: 2,
    }) +
    `<path d="${outline}" fill="${TEAL}"/>` +
    `<path d="${windows}" stroke="${GOLD}" stroke-width="1.5" stroke-opacity="0.75"/>` +
    `<path d="${archPath(c - 36, h - 300, 72, 300, 36)}" stroke="${GOLD}" stroke-width="2"/>` +
    `<path d="${archPath(c - 60, h - 640, 120, 160, 60)}${archPath(c - 44, h - 624, 88, 144, 44)}${archPath(c - 28, h - 608, 56, 128, 28)}" stroke="${GOLD}" stroke-width="1.5"/>` +
    `<path d="M16 16H${n(w - 16)}V${n(h - 16)}H16Z" stroke="${TEAL}" stroke-width="1.5"/>`
  );
}

/** Quarter fans that open from the corners of the frame, inside its inner rule. */
function fans(id: string, corners: readonly ('tl' | 'tr' | 'bl' | 'br')[], r: number): Element[] {
  const angles = { tl: [270, 360], tr: [180, 270], bl: [0, 90], br: [90, 180] } as const;
  return corners.map((corner) => {
    const right = corner.endsWith('r');
    const bottom = corner.startsWith('b');
    const [from, to] = angles[corner];
    return art(
      `${id}_${corner}`,
      atEnd(right ? 1920 - 62 - r : 62, bottom ? 1080 - 62 - r : 62, r, r),
      burst({
        cx: right ? r : 0,
        cy: bottom ? r : 0,
        r: r - 4,
        from,
        to,
        step: 9,
        inner: 0.3,
        rings: [0.62, 1],
        core: 0.18,
        width: 1.25,
      }),
    );
  });
}

/**
 * The foot of a content slide: the deck's name at the start, the slide's number at the end
 * (SLD-04), and the mark alone in the middle on a rule of diamonds, as a medallion on the frame.
 */
function foot(name: string): { placeholders: Layout['placeholders']; decorations: Element[] } {
  return {
    placeholders: [place('p_footer', 'footer', at(96, 958, 640, 34), 'caption')],
    decorations: [
      art(
        `d_hod_${name}_foot_rule`,
        atEnd(760, 968, 400, 14),
        `<path d="M14 7H160M240 7H386" stroke="${GOLD}" stroke-width="1.25"/>` +
          `<path d="${diamondAt(6, 7, 5)}${diamondAt(394, 7, 5)}" fill="${GOLD}"/>`,
      ),
      mark(`d_hod_${name}_mark`, atEnd(936, 950, 48, 48)),
      pageNumber(`d_hod_${name}_number`, atEnd(96, 958, 160, 34)),
    ],
  };
}

/** The line over a title and the title, at the start side: a caption after a short rule. */
const head = (width = 1728, lines = 1) => [
  place('p_kicker', 'caption', at(176, 92, Math.min(1100, width - 80), 34), 'caption'),
  place('p_title', 'title', at(96, 136, width, 80 * lines), 'title'),
];
const headLead = (name: string) => lead(`d_hod_${name}_lead`, at(96, 102, 64, 14));

/** The line over a title and the title, centred, with a rule of diamonds between them. */
const centredHead = (top = 150) => [
  place('p_kicker', 'caption', at(360, 88, 1200, 34), 'caption', { align: 'center' }),
  place('p_title', 'title', at(160, top, 1600, 80), 'title', { align: 'center' }),
];
const centredRule = (name: string) => diamonds(`d_hod_${name}_rule`, at(780, 128, 360, 12));

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const columns4 = [96, 540, 984, 1428];
const steps5 = [96, 450, 804, 1158, 1512];
const rows3 = [330, 520, 710];
const lines3 = [136, 710, 1284];

function layouts(): Layout[] {
  return [
    {
      id: 'l_hod_hero',
      name: 'Hero',
      archetype: 'hero',
      background: lit(),
      placeholders: [
        place('p_kicker', 'caption', at(136, 150, 924, 34), 'caption', { align: 'center' }),
        place('p_title', 'title', at(96, 226, 1004, 430), 'display', {
          align: 'center',
          vAlign: 'middle',
        }),
        place('p_subtitle', 'subtitle', at(136, 676, 924, 100), 'heading', { align: 'center' }),
        place('p_meta', 'caption', at(136, 800, 924, 34), 'caption', { align: 'center' }),
      ],
      decorations: [
        border('d_hod_hero_border'),
        // A plaque of gold leaf at the end side, a tower and its sun etched into it; the type
        // stands in the teal beside it, centred on its own axis.
        rect('d_hod_hero_leaf', atEnd(72, 72, 700, 936), LEAF),
        art('d_hod_hero_etching', atEnd(72, 72, 700, 936), tower(700, 936)),
        ...fans('d_hod_hero_fan', ['tr'], 150),
        diamonds('d_hod_hero_rule', at(398, 200, 400, 12)),
        art(
          'd_hod_hero_sun',
          at(298, 880, 600, 150),
          leaf('d_hod_hero_sun_g') +
            burst({
              cx: 300,
              cy: 150,
              r: 146,
              from: 0,
              to: 180,
              step: 9,
              inner: 0.38,
              rings: [0.7, 1],
              core: 0.26,
              width: 1.25,
              gradient: 'd_hod_hero_sun_g',
            }) +
            `<path d="M0 149H600" stroke="${GOLD}" stroke-width="2"/>`,
        ),
      ],
    },
    {
      id: 'l_hod_section',
      name: 'Section',
      archetype: 'section',
      background: gilt(),
      placeholders: [
        place('p_number', 'number', at(620, 300, 680, 150), 'display', { align: 'center' }),
        place('p_kicker', 'caption', at(620, 466, 680, 34), 'caption', { align: 'center' }),
        place('p_title', 'title', at(580, 540, 760, 160), 'title', {
          align: 'center',
          vAlign: 'middle',
        }),
        place('p_subtitle', 'subtitle', at(580, 716, 760, 152), 'heading', { align: 'center' }),
      ],
      decorations: [
        // Rays etched in teal across the gold, from the foot of the arch's curve.
        art(
          'd_hod_section_rays',
          atEnd(0, 0, 1920, 1080),
          burst({
            cx: 960,
            cy: 470,
            r: 1300,
            from: 0,
            to: 360,
            step: 6,
            inner: 0.3,
            flutes: 0.07,
            rings: [],
            core: 0,
            color: TEAL,
            width: 2,
          }) +
            `<path d="${stepped(36, 36, 1848, 1008, 12, 3)}" stroke="${TEAL}" stroke-width="2"/>` +
            `<path d="${stepped(50, 50, 1820, 980, 9, 2)}" stroke="${TEAL}" stroke-opacity="0.6" stroke-width="1.25"/>`,
        ),
        // The tower: stepped tiers behind the arch, then the arch itself, its rules in gold.
        art(
          'd_hod_section_tower',
          at(400, 110, 1120, 970),
          `<path d="M0 970V600H28V500H56V400H1064V500H1092V600H1120V970Z" fill="${TEAL}" fill-opacity="0.12" stroke="${TEAL}" stroke-width="2"/>` +
            `<path d="M14 970V614H42V514H70V414H1050V514H1078V614H1106V970" stroke="${TEAL}" stroke-opacity="0.6" stroke-width="1.25"/>` +
            `<path d="${archPath(80, 0, 960, 970, 340)}" fill="${TEAL}"/>` +
            `<path d="${archPath(98, 18, 924, 952, 322)}" stroke="${GOLD}" stroke-width="2"/>` +
            `<path d="${archPath(110, 30, 900, 940, 310)}" stroke="${ANTIQUE}" stroke-width="1.25"/>` +
            burst({
              cx: 560,
              cy: 132,
              r: 80,
              from: 15,
              to: 165,
              step: 15,
              inner: 0.3,
              rings: [],
              core: 0.2,
              width: 1.25,
            }),
        ),
        diamonds('d_hod_section_rule', at(780, 516, 360, 12)),
        chevrons('d_hod_section_frieze', at(600, 936, 720, 24)),
      ],
    },
    {
      id: 'l_hod_title',
      name: 'Title',
      archetype: 'title',
      background: deep(),
      placeholders: [place('p_title', 'title', at(96, 136, 1728, 80), 'title')],
      decorations: [border('d_hod_title_border'), headLead('title'), ...foot('title').decorations],
    },
    {
      id: 'l_hod_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      background: deep(),
      placeholders: [
        ...head(1040),
        place('p_number', 'number', at(136, 424, 740, 150), 'display', { align: 'center' }),
        place('p_label', 'subtitle', at(136, 590, 740, 52), 'heading', { align: 'center' }),
        place('p_body', 'body', at(136, 664, 740, 210), 'body', { align: 'center' }),
        ...[0, 1, 2].flatMap((i) => {
          const top = [440, 380, 320][i]!;
          const end = [96, 396, 696][i]!;
          return [
            place(`p_stat${i + 1}`, 'number', atEnd(end + 14, top + 150, 240, 80), 'title', {
              align: 'center',
            }),
            place(
              `p_stat${i + 1}_label`,
              'caption',
              atEnd(end + 24, top + 240, 220, 136),
              'caption',
              {
                align: 'center',
              },
            ),
          ];
        }),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        border('d_hod_big_number_border'),
        headLead('big_number'),
        archCard('d_hod_big_number_card', at(96, 250, 820, 670), 150),
        // A skyline of three arches, rising towards the great one.
        ...[0, 1, 2].map((i) => {
          const top = [440, 380, 320][i]!;
          const end = [96, 396, 696][i]!;
          return archCard(`d_hod_big_number_stat${i + 1}`, atEnd(end, top, 268, 920 - top), 134, {
            fluted: 392,
          });
        }),
        ...foot('big_number').decorations,
      ],
    },
    {
      id: 'l_hod_quote',
      name: 'Quote',
      archetype: 'quote',
      background: lit(),
      placeholders: [
        place('p_quote', 'quote', at(400, 248, 1120, 400), 'title', {
          align: 'center',
          vAlign: 'middle',
        }),
        place('p_attribution', 'attribution', at(400, 684, 1120, 52), 'heading', {
          align: 'center',
        }),
        place('p_caption', 'caption', at(400, 740, 1120, 68), 'caption', { align: 'center' }),
        ...foot('quote').placeholders,
      ],
      decorations: [
        border('d_hod_quote_border'),
        // A half sun behind the octagon: only its rays show, around the panel.
        art(
          'd_hod_quote_wings',
          atEnd(60, 80, 1800, 860),
          [
            [-26, 26],
            [154, 206],
          ]
            .map(([from, to]) =>
              burst({
                cx: 900,
                cy: 430,
                r: 880,
                from: from!,
                to: to!,
                step: 2,
                inner: 0.7,
                rings: [0.8, 0.92, 1],
                core: 0,
                flutes: 0.08,
                width: 1.25,
              }),
            )
            .join(''),
        ),
        art(
          'd_hod_quote_panel',
          atEnd(310, 140, 1300, 740),
          `<path d="${octagon(1, 1, 1298, 738, 70)}" fill="${SURFACE}" stroke="${GOLD}" stroke-width="2"/>` +
            `<path d="${octagon(14, 14, 1272, 712, 64)}" stroke="${ANTIQUE}" stroke-width="1.25"/>` +
            `<path d="M560 1H740L720 24H580Z" fill="${GOLD}"/>`,
        ),
        quoteGlyph(atEnd(921, 168, 78, 62), QUOTE_RTL),
        diamonds('d_hod_quote_rule', at(780, 662, 360, 12)),
        ...foot('quote').decorations,
      ],
    },
    {
      id: 'l_hod_text',
      name: 'Text',
      archetype: 'text',
      background: deep(),
      placeholders: [
        place('p_title', 'title', at(96, 136, 1728, 80), 'title'),
        place('p_body', 'body', at(96, 262, 1728, 638), 'body'),
      ],
      decorations: [border('d_hod_text_border'), headLead('text'), ...foot('text').decorations],
    },
    {
      id: 'l_hod_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      background: deep(),
      placeholders: [
        ...head(960, 2),
        place('p_image', 'image', atEnd(150, 330, 576, 570)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(196, top, 860, 52), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(196, top + 58, 860, 126), 'body'),
        ]),
        ...foot('text_image').placeholders,
      ],
      decorations: [
        border('d_hod_text_image_border'),
        headLead('text_image'),
        window('d_hod_text_image_window', atEnd(150, 330, 576, 570), 220, 28),
        ...rows3.flatMap((top, i) => [
          art(
            `d_hod_text_image_badge${i + 1}`,
            at(96, top - 4, 64, 64),
            `<path d="${diamondAt(32, 32, 31)}" fill="${SURFACE}" stroke="${GOLD}" stroke-width="2"/><path d="${diamondAt(32, 32, 24)}" stroke="${ANTIQUE}" stroke-width="1.25"/>`,
          ),
          numeral(`d_hod_text_image_n${i + 1}`, at(96, top + 2, 64, 52), ROMAN[i]!, 'heading'),
        ]),
        ...rows3
          .slice(1)
          .map((top, i) => diamonds(`d_hod_text_image_rule${i + 1}`, at(196, top - 22, 860, 12))),
        ...foot('text_image').decorations,
      ],
    },
    {
      id: 'l_hod_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      background: deep(),
      placeholders: [
        // The picture fills the frame; the text has the band under it, as nothing of a layout
        // can be drawn between a picture and text over it.
        place('p_image', 'image', atEnd(72, 72, 1776, 548)),
        place('p_kicker', 'caption', at(176, 716, 860, 34), 'caption'),
        place('p_title', 'title', at(96, 762, 940, 160), 'title'),
        place('p_body', 'body', atEnd(96, 716, 660, 210), 'body'),
      ],
      decorations: [
        border('d_hod_full_image_border'),
        chevrons('d_hod_full_image_frieze', atEnd(60, 644, 1800, 28)),
        lead('d_hod_full_image_lead', at(96, 726, 64, 14)),
        // A pillar between the title and the text: a double rule with a diamond on it.
        art(
          'd_hod_full_image_pillar',
          atEnd(800, 716, 24, 210),
          `<path d="M8 0V210M16 0V210" stroke="${GOLD}" stroke-width="1.25"/><path d="${diamondAt(12, 105, 10)}" fill="${GOLD}"/>`,
        ),
      ],
    },
    {
      id: 'l_hod_cards',
      name: 'Cards',
      archetype: 'cards',
      background: deep(),
      placeholders: [
        ...centredHead(),
        ...[96, 680, 1304].flatMap((start, i) => {
          const w = i === 1 ? 560 : 520;
          return [
            place(`p_card${i + 1}_note`, 'caption', at(start + 40, 378, w - 80, 68), 'caption', {
              align: 'center',
              vAlign: 'bottom',
            }),
            place(`p_card${i + 1}`, 'subtitle', at(start + 40, 458, w - 80, 100), 'heading', {
              align: 'center',
            }),
            place(`p_card${i + 1}_body`, 'body', at(start + 40, 584, w - 80, 186), 'body', {
              align: 'center',
            }),
          ];
        }),
        place('p_takeaway', 'body', at(200, 818, 1520, 84), 'body', {
          align: 'center',
          vAlign: 'middle',
        }),
        ...foot('cards').placeholders,
      ],
      decorations: [
        border('d_hod_cards_border'),
        centredRule('cards'),
        // Three towers under stepped crowns; the middle one rises highest.
        ...[96, 680, 1304].flatMap((start, i) => {
          const middle = i === 1;
          const w = middle ? 560 : 520;
          const top = middle ? 252 : 300;
          const rise = middle ? 30 : 24;
          return [
            crownCard(
              `d_hod_cards_card${i + 1}`,
              at(start, top, w, 790 - top),
              rise,
              [0.66, 0.44, 0.24],
            ),
            numeral(`d_hod_cards_n${i + 1}`, at(start + w / 2 - 50, top + 16, 100, 50), ROMAN[i]!),
            diamonds(`d_hod_cards_rule${i + 1}`, at(start + w / 2 - 110, 564, 220, 10)),
          ];
        }),
        art(
          'd_hod_cards_band',
          at(96, 808, 1728, 104),
          `<path d="${stepped(1, 1, 1726, 102, 8, 2)}" stroke="${GOLD}" stroke-width="1.5"/>` +
            `<path d="${diamondAt(40, 52, 9)}${diamondAt(1688, 52, 9)}" fill="${GOLD}"/>`,
        ),
        ...foot('cards').decorations,
      ],
    },
    {
      id: 'l_hod_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      background: raised(),
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 262, 396, 80), 'title', {
            align: 'center',
            vAlign: 'bottom',
          }),
          place(`p_what${i + 1}`, 'subtitle', at(start + 28, 490, 340, 100), 'heading', {
            align: 'center',
          }),
          place(`p_what${i + 1}_body`, 'body', at(start + 28, 600, 340, 236), 'body', {
            align: 'center',
          }),
        ]),
        place('p_note', 'caption', at(96, 870, 1728, 34), 'caption', { align: 'center' }),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        border('d_hod_timeline_border'),
        headLead('timeline'),
        // The rail: a double rule of gold with chevrons at its ends, a diamond at each stop.
        art(
          'd_hod_timeline_rail',
          at(96, 352, 1728, 40),
          `<path d="M24 16H1704M24 24H1704" stroke="${GOLD}" stroke-width="1.5"/>` +
            `<path d="M0 4L16 20L0 36M10 4L26 20L10 36M1728 4L1712 20L1728 36M1718 4L1702 20L1718 36" stroke="${GOLD}" stroke-width="2"/>` +
            columns4
              .map((start) => {
                const cx = 1728 - (start - 96) - 198;
                return `<path d="${diamondAt(cx, 20, 18)}" fill="${TEAL}" stroke="${GOLD}" stroke-width="2"/><path d="${diamondAt(cx, 20, 8)}" fill="${GOLD}"/>`;
              })
              .join(''),
        ),
        ...columns4.map((start, i) =>
          archCard(`d_hod_timeline_card${i + 1}`, at(start, 406, 396, 444), 60, { fill: TEAL }),
        ),
        ...foot('timeline').decorations,
      ],
    },
    {
      id: 'l_hod_process',
      name: 'Process',
      archetype: 'process',
      background: deep(),
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => {
          const top = 412 - i * 30;
          return [
            place(`p_step${i + 1}`, 'subtitle', at(start + 22, top + 20, 268, 100), 'heading', {
              align: 'center',
            }),
            place(
              `p_step${i + 1}_body`,
              'caption',
              at(start + 22, top + 126, 268, 168),
              'caption',
              {
                align: 'center',
              },
            ),
            place(`p_step${i + 1}_number`, 'number', at(start + 22, top + 318, 268, 80), 'title', {
              align: 'center',
            }),
          ];
        }),
        place('p_summary', 'body', at(200, 844, 1520, 84), 'body', {
          align: 'center',
          vAlign: 'middle',
        }),
        ...foot('process').placeholders,
      ],
      decorations: [
        border('d_hod_process_border'),
        headLead('process'),
        // A stair of five towers, each a step higher than the last.
        ...steps5.flatMap((start, i) => {
          const top = 412 - i * 30;
          return [
            crownCard(
              `d_hod_process_card${i + 1}`,
              at(start, top - 60, 312, 476),
              20,
              [0.7, 0.5, 0.34],
            ),
            numeral(`d_hod_process_n${i + 1}`, at(start + 116, top - 44, 80, 50), ROMAN[i]!),
            diamonds(`d_hod_process_rule${i + 1}`, at(start + 40, top + 302, 232, 10)),
          ];
        }),
        art(
          'd_hod_process_band',
          at(96, 840, 1728, 92),
          `<path d="${stepped(1, 1, 1726, 90, 8, 2)}" stroke="${GOLD}" stroke-width="1.5"/>` +
            `<path d="${diamondAt(40, 46, 9)}${diamondAt(1688, 46, 9)}" fill="${GOLD}"/>`,
        ),
        ...foot('process').decorations,
      ],
    },
    {
      id: 'l_hod_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      background: deep(),
      placeholders: [
        ...head(),
        place('p_before_tag', 'caption', at(136, 380, 700, 34), 'caption', { align: 'center' }),
        place('p_before', 'subtitle', at(136, 424, 700, 100), 'heading', { align: 'center' }),
        place('p_before_body', 'body', at(176, 560, 620, 330), 'body'),
        place('p_after_tag', 'caption', atEnd(136, 380, 700, 34), 'caption', { align: 'center' }),
        place('p_after', 'subtitle', atEnd(136, 424, 700, 100), 'heading', { align: 'center' }),
        place('p_after_body', 'body', atEnd(176, 560, 620, 330), 'body'),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        border('d_hod_comparison_border'),
        headLead('comparison'),
        // What was stands in a plain portal; what is, in a gilded one with the sun in its arch.
        art(
          'd_hod_comparison_before',
          at(96, 250, 780, 660),
          `<path d="${archPath(1, 1, 778, 658, 110)}" fill="${SURFACE}" fill-opacity="0.55" stroke="${ANTIQUE}" stroke-width="1.5"/>`,
        ),
        archCard('d_hod_comparison_after', atEnd(96, 250, 780, 660), 110),
        diamonds('d_hod_comparison_rule1', at(176, 536, 620, 12), ANTIQUE),
        diamonds('d_hod_comparison_rule2', atEnd(176, 536, 620, 12)),
        art(
          'd_hod_comparison_medal',
          at(916, 534, 88, 88),
          `<path d="${diamondAt(44, 44, 43)}" fill="${GOLD}"/><path d="${diamondAt(44, 44, 35)}" stroke="${TEAL}" stroke-width="1.5"/>`,
        ),
        drawing('d_hod_comparison_arrow', at(940, 566, 40, 24), ARROW, PAINT),
        ...foot('comparison').decorations,
      ],
    },
    {
      id: 'l_hod_chart',
      name: 'Chart',
      archetype: 'chart',
      background: deep(),
      placeholders: [
        ...head(),
        place('p_chart', 'chart', at(136, 282, 1080, 526)),
        place('p_source', 'caption', at(136, 852, 1080, 68), 'caption'),
        ...[0, 1].flatMap((i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(96, 300 + i * 314, 520, 150), 'display', {
            align: 'center',
          }),
          place(`p_stat${i + 1}_body`, 'body', atEnd(140, 454 + i * 314, 432, 126), 'body', {
            align: 'center',
          }),
        ]),
        ...foot('chart').placeholders,
      ],
      decorations: [
        border('d_hod_chart_border'),
        headLead('chart'),
        plaque('d_hod_chart_panel', at(96, 250, 1160, 590)),
        archCard('d_hod_chart_stats', atEnd(96, 250, 520, 670), 40),
        diamonds('d_hod_chart_rule', atEnd(216, 590, 280, 12)),
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_hod_table',
      name: 'Table',
      archetype: 'table',
      background: raised(),
      placeholders: [
        ...head(),
        place('p_table', 'table', at(96, 246, 1728, 650)),
        place('p_note', 'caption', at(96, 918, 1728, 34), 'caption', { align: 'center' }),
        ...foot('table').placeholders,
      ],
      decorations: [
        border('d_hod_table_border'),
        headLead('table'),
        plaque('d_hod_table_panel', at(72, 226, 1776, 686), TEAL),
        ...foot('table').decorations,
      ],
    },
    {
      id: 'l_hod_team',
      name: 'Team',
      archetype: 'team',
      background: deep(),
      placeholders: [
        ...centredHead(128),
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start + 38, 334, 320, 246)),
          place(`p_person${i + 1}`, 'subtitle', at(start + 24, 600, 348, 52), 'heading', {
            align: 'center',
          }),
          place(`p_person${i + 1}_role`, 'caption', at(start + 24, 654, 348, 68), 'caption', {
            align: 'center',
          }),
          place(`p_person${i + 1}_body`, 'body', at(start + 24, 728, 348, 172), 'body', {
            align: 'center',
          }),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: [
        border('d_hod_team_border'),
        // Four niches: an arch with a sun in its lunette, the portrait under it, the name below.
        ...columns4.map((start, i) =>
          archCard(`d_hod_team_niche${i + 1}`, at(start, 226, 396, 706), 90),
        ),
        ...columns4.map((start, i) =>
          art(
            `d_hod_team_mat${i + 1}`,
            at(start + 26, 322, 344, 270),
            `<path d="M1 1H343V269H1Z" stroke="${GOLD}" stroke-width="2"/>`,
          ),
        ),
        ...foot('team').decorations,
      ],
    },
    {
      id: 'l_hod_closing',
      name: 'Closing',
      archetype: 'closing',
      background: lit(),
      placeholders: [
        place('p_kicker', 'caption', at(360, 112, 1200, 34), 'caption', { align: 'center' }),
        place('p_title', 'title', at(260, 186, 1400, 300), 'display', {
          align: 'center',
          vAlign: 'middle',
        }),
        ...lines3.map((start, i) =>
          place(`p_line${i + 1}`, 'body', at(start, 520, 500, 126), 'body', {
            align: 'center',
            vAlign: 'middle',
          }),
        ),
        place('p_contact', 'caption', at(360, 668, 1200, 34), 'caption', { align: 'center' }),
      ],
      decorations: [
        border('d_hod_closing_border'),
        diamonds('d_hod_closing_rule', at(760, 162, 400, 12)),
        // The sun of the evening rises from the inner rule at the foot, between four fans.
        art(
          'd_hod_closing_sun',
          atEnd(410, 720, 1100, 310),
          leaf('d_hod_closing_sun_g') +
            burst({
              cx: 550,
              cy: 310,
              r: 302,
              from: 0,
              to: 180,
              step: 4.5,
              inner: 0.42,
              rings: [0.56, 0.78, 1],
              core: 0.3,
              flutes: 0.07,
              gradient: 'd_hod_closing_sun_g',
            }) +
            `<path d="M0 309H1100" stroke="${GOLD}" stroke-width="2"/>`,
        ),
        ...fans('d_hod_closing_fan', ['tl', 'tr', 'bl', 'br'], 196),
        ...[661, 1235].map((start, i) =>
          art(
            `d_hod_closing_pillar${i + 1}`,
            at(start, 520, 24, 126),
            `<path d="M8 0V126M16 0V126" stroke="${GOLD}" stroke-width="1.25"/><path d="${diamondAt(12, 63, 10)}" fill="${GOLD}"/>`,
          ),
        ),
      ],
    },
  ];
}

/**
 * The layouts the mirror gets wrong for a left-to-right deck. Only the quote: its mark is a
 * glyph of the direction. The grounds are the model's own gradients, which the mirror turns.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  const quote = drawn.find((layout) => layout.id === 'l_hod_quote');
  if (!quote) return [];
  const mirrored = mirrorLayout(quote);
  return [
    {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) =>
        decoration.id === 'd_hod_quote_glyph'
          ? quoteGlyph(decoration.frame, QUOTE_LTR)
          : decoration,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: the centennial gala of an invented concert hall, slide by slide

const FOOTER_HE = text('היכל אופיר · מאה שנה');
const FOOTER_EN = text('OPHIR HALL · 100 YEARS');
const DECADES = ['1976', '1986', '1996', '2006', '2016', '2026'];
const SUBSCRIBERS = [8.4, 9.1, 9.6, 10.2, 11.9, 19.5];
const YOUNG = [1.1, 1.3, 1.2, 1.6, 2.9, 7.4];
const TABLE_COLS = [628, 340, 340, 340];
const TABLE_ROW = 64;
const TEAM = [
  { assetId: pictures.hodTeam1.id },
  { assetId: pictures.hodTeam2.id },
  { assetId: pictures.hodTeam3.id },
  { assetId: pictures.hodTeam4.id },
];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_hod_hero',
    name: 'פתיחה',
    content: {
      caption: [text('1926 · ערב גאלה · 2026'), text('יום חמישי, 12 בנובמבר 2026 · האולם הגדול')],
      title: text('מאה שנה', 'להיכל אופיר'),
      subtitle: text('ערב אחד, מאה שנים של מוזיקה'),
    },
  },
  {
    layout: 'l_hod_section',
    name: 'מאה שנה במספרים',
    content: {
      number: text('I'),
      caption: text('חלק ראשון'),
      title: text('במספרים'),
      subtitle: text('מה ראה האולם הזה מאז ערב הפתיחה, באוקטובר 1926.'),
    },
  },
  {
    layout: 'l_hod_big_number',
    name: 'קונצרטים',
    content: {
      caption: [
        text('במספרים'),
        text('כרטיסים נמכרו מאז ערב הפתיחה'),
        text('מושבים באולם הגדול'),
        text('שניות של הדהוד באולם מלא'),
      ],
      title: text('מאה שנה של ערבים מלאים'),
      number: [text('11,800'), text('6.2M'), text('1,240'), text('2.1')],
      subtitle: text('קונצרטים על הבמה הגדולה'),
      body: text(
        'כמעט ערב אחרי ערב, במשך מאה שנה. האולם נסגר רק פעמיים: במלחמת העצמאות, ובשנת השיפוץ הגדול.',
      ),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_hod_cards',
    name: 'עונת המאה',
    content: {
      caption: [
        text('עונת המאה'),
        text('אוקטובר · ערב הפתיחה'),
        text('נובמבר · ערב הגאלה'),
        text('דצמבר · ערב המחווה'),
      ],
      title: text('שלושה ערבים, חגיגה אחת'),
      subtitle: [text('התזמורת של 1926'), text('גאלה על הבמה הגדולה'), text('הדור הבא מנגן')],
      body: [
        text('התוכנית של ערב הפתיחה, על כלים ובתלבושות של אז.'),
        text('התזמורת, המקהלה וחמישה סולנים שגדלו באולם הזה.'),
        text('שישים נגנים צעירים מכל הארץ מנגנים עם התזמורת.'),
        text('כל הכנסות העונה הולכות לקרן המלגות של ההיכל.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_hod_text_image',
    name: 'הבמה בגבעות',
    content: {
      caption: text('פסטיבל הקיץ'),
      title: text('הבית השני שלנו:', 'הבמה בגבעות'),
      image: { assetId: pictures.hodHills.id },
      subtitle: [text('קונצרט עם שקיעה'), text('אקוסטיקה של עמק'), text('פתוח לכל המשפחה')],
      body: [
        text('בכל ערב קיץ התזמורת מתחילה לנגן בדיוק כשהשמש נוגעת בקו הגבעות.'),
        text('הבמה בנויה על מדרון טבעי, וכל מושב שומע את התזמורת בלי הגברה.'),
        text('ילדים עד גיל 12 נכנסים בחינם, ויש מקום לשמיכות על הדשא.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_hod_chart',
    name: 'הקהל',
    content: {
      caption: [text('הקהל'), text('מקור: מחלקת המנויים של ההיכל, אלפי מנויים בתחילת כל עונה.')],
      title: text('הקהל שלנו צעיר מאי פעם'),
      number: [text('+64%'), text('38%')],
      body: [text('מנויים חדשים מאז 2016'), text('מהמנויים מתחת לגיל 35')],
      footer: FOOTER_HE,
    },
    chart: {
      chartType: 'column',
      title: 'מנויים בתחילת העונה, אלפים',
      data: {
        categories: DECADES,
        series: [
          { name: 'כל המנויים', values: SUBSCRIBERS },
          { name: 'מתחת לגיל 35', values: YOUNG },
        ],
      },
    },
  },
  {
    layout: 'l_hod_comparison',
    name: 'אז והיום',
    content: {
      caption: [text('אז והיום'), text('1926 · ערב הפתיחה'), text('2026 · עונת המאה')],
      title: text('אותו אולם, מאה שנה אחר כך'),
      subtitle: [text('אולם של 900 מושבים'), text('1,240 מושבים ואקוסטיקה מכווננת')],
      body: [
        bullets('תאורת גז ונברשת אחת', 'תזמורת של 40 נגנים', 'כרטיס שעלה גרוש וחצי'),
        bullets('תקרה מתכווננת לכל הרכב', 'תזמורת של 96 נגנים', 'מנוי צעיר ב-₪290 לעונה'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_hod_table',
    name: 'כרטיסים',
    content: {
      caption: [
        text('ערב הגאלה'),
        text('כל ההכנסות מהערב מוקדשות לקרן המלגות של ההיכל לנגנים צעירים.'),
      ],
      title: text('מה כלול בכל כרטיס'),
      footer: FOOTER_HE,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['מה כלול', 'יציע', 'אולם', 'לוז׳ה'],
        ['מחיר לכרטיס', '₪380', '₪720', '₪1,900'],
        ['קבלת פנים בגן', '✓', '✓', '✓'],
        ['שמפניה בהפסקה', '—', '✓', '✓'],
        ['תוכנייה מודפסת', '✓', '✓', 'כרוכה בעור'],
        ['ארוחת ערב אחרי', '—', '—', '✓'],
        ['פגישה עם הסולנים', '—', '—', '✓'],
        ['חניה', 'בחניון העירוני', 'בחניון ההיכל', 'שירות חונה'],
        ['שם על לוח התורמים', '—', '—', '✓'],
      ],
    },
  },
  {
    layout: 'l_hod_process',
    name: 'הערב',
    content: {
      caption: [
        text('סדר הערב'),
        text('יין, מנגינות של ג׳אז ועששיות בגן הפסלים.'),
        text('הסימפוניה של ערב הפתיחה, במלואה.'),
        text('קינוחים במרפסת שמשקיפה על העיר.'),
        text('חמישה סולנים, מקהלה ותזמורת.'),
        text('הרמת כוסית לכבוד מאה השנים הבאות.'),
      ],
      title: text('ערב הגאלה, שעה אחר שעה'),
      subtitle: [
        text('קבלת פנים'),
        text('המערכה הראשונה'),
        text('הפסקה'),
        text('המערכה השנייה'),
        text('הרמת כוסית'),
      ],
      number: [text('18:30'), text('19:30'), text('20:40'), text('21:10'), text('22:30')],
      body: text('הדלתות נסגרות ב-19:25 בדיוק. מי שמאחר נכנס בהפסקה.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_hod_section',
    name: 'הדרן',
    content: {
      number: text('II'),
      caption: text('חלק שני'),
      title: text('הדרן'),
      subtitle: text('המאה הבאה: מה נבנה, ואיך תוכלו להיות חלק מזה.'),
    },
  },
  {
    layout: 'l_hod_timeline',
    name: 'תוכנית',
    content: {
      caption: [text('עד 2030'), text('התאריכים תלויים בגיוס של קרן המאה.')],
      title: text('ארבע תחנות בדרך למאה הבאה'),
      number: [text('2027'), text('2028'), text('2029'), text('2030')],
      subtitle: [
        text('אולם קאמרי'),
        text('הארכיון ברשת'),
        text('בית ספר לנגינה'),
        text('במה פתוחה'),
      ],
      body: [
        text('אולם של 300 מושבים לרביעיות ולשירה.'),
        text('מאה שנים של הקלטות ותצלומים, פתוחים לכולם.'),
        text('לימודי נגינה לאלף ילדים מהשכונות שסביב ההיכל.'),
        text('הרחבה שמול ההיכל הופכת לבמה, עם קונצרט חינם בימי שישי.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_hod_full_image',
    name: 'הבמה',
    content: {
      image: { assetId: pictures.hodGala.id },
      caption: text('הבמה הגדולה'),
      title: text('הבמה מוכנה.', 'האור עולה בשמונה.'),
      body: text(
        'שלושה שבועות של חזרות, 96 נגנים ושמש אחת של זהב. בשמונה בדיוק המנצחת עולה לבמה, והמאה הבאה מתחילה.',
      ),
    },
  },
  {
    layout: 'l_hod_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'ניצחתי כאן לראשונה בגיל עשרים ושלוש. מאה שנה האולם הזה מלמד כל נגן להקשיב, לפני שהוא מנגן.',
      ),
      attribution: text('נעמה ברקאי'),
      caption: text('המנצחת הראשית של תזמורת ההיכל, מאז 2011'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_hod_team',
    name: 'הצוות',
    content: {
      caption: [
        text('האנשים'),
        text('מנכ״לית ההיכל'),
        text('המנהל המוזיקלי'),
        text('אוצר הארכיון'),
        text('מפיקת הגאלה'),
      ],
      title: text('האנשים שמחזיקים את המאה'),
      image: TEAM,
      subtitle: [text('רות אלמגור'), text('דניאל שחר'), text('אביב כרמי'), text('מיכל לנדאו')],
      body: [
        text('מנהלת את ההיכל מאז 2014, והובילה את השיפוץ.'),
        text('בונה כל עונה כך שתהיה בה גם יצירה חדשה.'),
        text('שמר מאה שנים של תוכניות, מכתבים והקלטות.'),
        text('אחראית על כל פרט בערב, מהגן ועד הקינוח.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_hod_closing',
    name: 'הזמנה',
    content: {
      caption: [text('הזמנה'), text('gala@ophirhall.example · ophirhall.example/100')],
      title: text('נתראה', 'בערב הגאלה'),
      body: [
        text('יום חמישי, 12 בנובמבר 2026, בשעה 18:30'),
        text('לבוש ערב. החניון פתוח כבר מ-17:30'),
        text('אישורי הגעה עד ה-1 בנובמבר'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_hod_hero',
    name: 'Cover',
    content: {
      caption: [
        text('1926 · GALA EVENING · 2026'),
        text('Thursday 12 November 2026 · The Great Hall'),
      ],
      title: text('A century of', 'Ophir Hall'),
      subtitle: text('One evening, a hundred years of music'),
    },
  },
  {
    layout: 'l_hod_section',
    name: 'In numbers',
    content: {
      number: text('I'),
      caption: text('PART ONE'),
      title: text('In numbers'),
      subtitle: text('What this hall has seen since its opening night, in October 1926.'),
    },
  },
  {
    layout: 'l_hod_big_number',
    name: 'Concerts',
    content: {
      caption: [
        text('BY THE NUMBERS'),
        text('tickets sold since opening night'),
        text('seats in the Great Hall'),
        text('seconds of reverb in a full hall'),
      ],
      title: text('A century of full houses'),
      number: [text('11,800'), text('6.2M'), text('1,240'), text('2.1')],
      subtitle: text('concerts on the great stage'),
      body: text(
        'Night after night for a century. The hall closed only twice: in 1948, and in the year of the great renovation.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_hod_cards',
    name: 'The centennial season',
    content: {
      caption: [
        text('THE CENTENNIAL SEASON'),
        text('OCTOBER · OPENING NIGHT'),
        text('NOVEMBER · THE GALA'),
        text('DECEMBER · THE TRIBUTE'),
      ],
      title: text('Three evenings, one celebration'),
      subtitle: [
        text('The orchestra of 1926'),
        text('A gala on the great stage'),
        text('The next generation'),
      ],
      body: [
        text('Opening night’s programme, in period dress, on period instruments.'),
        text('Orchestra, choir and five soloists who grew up in this hall.'),
        text('Sixty young players from across the country join the orchestra.'),
        text('Every shekel the season raises goes to the scholarship fund.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_hod_text_image',
    name: 'The stage in the hills',
    content: {
      caption: text('THE SUMMER FESTIVAL'),
      title: text('Our second home:', 'the stage in the hills'),
      image: { assetId: pictures.hodHills.id },
      subtitle: [
        text('A concert at sunset'),
        text('The acoustics of a valley'),
        text('Open to the whole family'),
      ],
      body: [
        text('Each summer evening the music begins as the sun meets the hills.'),
        text('Built into a natural slope, so every seat hears it unamplified.'),
        text('Children under 12 come free, with room for blankets on the grass.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_hod_chart',
    name: 'The audience',
    content: {
      caption: [
        text('THE AUDIENCE'),
        text('Source: the hall’s subscriptions office, thousands at the start of each season.'),
      ],
      title: text('Our audience is younger than ever'),
      number: [text('+64%'), text('38%')],
      body: [text('new subscribers since 2016'), text('of subscribers are under 35')],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Subscribers at the start of the season, thousands',
      data: {
        categories: DECADES,
        series: [
          { name: 'All subscribers', values: SUBSCRIBERS },
          { name: 'Under 35', values: YOUNG },
        ],
      },
    },
  },
  {
    layout: 'l_hod_comparison',
    name: 'Then and now',
    content: {
      caption: [text('THEN AND NOW'), text('1926 · OPENING NIGHT'), text('2026 · THE CENTENNIAL')],
      title: text('The same hall, a hundred years on'),
      subtitle: [text('A hall of 900 seats'), text('1,240 seats, acoustics tuned')],
      body: [
        bullets(
          'Gas light and one chandelier',
          'An orchestra of 40 players',
          'A ticket for a few pennies',
        ),
        bullets(
          'A ceiling that tunes to each ensemble',
          'An orchestra of 96 players',
          'A young subscription at ₪290',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_hod_table',
    name: 'Tickets',
    content: {
      caption: [
        text('THE GALA'),
        text(
          'Every shekel raised on the night goes to the hall’s scholarship fund for young players.',
        ),
      ],
      title: text('What each ticket includes'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['Included', 'Balcony', 'Stalls', 'Box'],
        ['Price per ticket', '₪380', '₪720', '₪1,900'],
        ['Reception in the garden', '✓', '✓', '✓'],
        ['Champagne at the interval', '—', '✓', '✓'],
        ['Printed programme', '✓', '✓', 'Leather-bound'],
        ['Dinner after the concert', '—', '—', '✓'],
        ['Meeting the soloists', '—', '—', '✓'],
        ['Parking', 'City car park', 'Hall car park', 'Valet'],
        ['Name on the donors’ wall', '—', '—', '✓'],
      ],
    },
  },
  {
    layout: 'l_hod_process',
    name: 'The evening',
    content: {
      caption: [
        text('THE EVENING'),
        text('Wine, jazz and lanterns in the sculpture garden.'),
        text('The symphony of opening night, in full.'),
        text('Desserts on the terrace over the city.'),
        text('Five soloists, a choir and the orchestra.'),
        text('A toast to the next hundred years.'),
      ],
      title: text('The gala, hour by hour'),
      subtitle: [
        text('Reception'),
        text('First half'),
        text('Interval'),
        text('Second half'),
        text('A toast'),
      ],
      number: [text('18:30'), text('19:30'), text('20:40'), text('21:10'), text('22:30')],
      body: text('Doors close at 19:25 sharp; latecomers enter at the interval.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_hod_section',
    name: 'Encore',
    content: {
      number: text('II'),
      caption: text('PART TWO'),
      title: text('Encore'),
      subtitle: text('The next century: what we will build, and how you can be part of it.'),
    },
  },
  {
    layout: 'l_hod_timeline',
    name: 'The plan',
    content: {
      caption: [
        text('TOWARDS 2030'),
        text('Dates depend on the Centennial Fund reaching its goal.'),
      ],
      title: text('Four stops to the next century'),
      number: [text('2027'), text('2028'), text('2029'), text('2030')],
      subtitle: [
        text('A chamber hall'),
        text('The archive online'),
        text('A music school'),
        text('An open stage'),
      ],
      body: [
        text('A 300-seat hall for quartets and song.'),
        text('A century of recordings, free for all.'),
        text('Afternoon lessons for a thousand children nearby.'),
        text('The square becomes a stage, with a free concert on Fridays.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_hod_full_image',
    name: 'The stage',
    content: {
      image: { assetId: pictures.hodGala.id },
      caption: text('THE GREAT STAGE'),
      title: text('The stage is set.', 'Lights up at eight.'),
      body: text(
        'Three weeks of rehearsals, 96 players and one golden sun. At eight sharp the conductor walks on, and the next century begins.',
      ),
    },
  },
  {
    layout: 'l_hod_quote',
    name: 'Quote',
    content: {
      quote: text(
        'I first conducted here at twenty-three. For a century this hall has taught every player to listen before they play.',
      ),
      attribution: text('Naama Barkai'),
      caption: text('Principal conductor of the Hall Orchestra since 2011'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_hod_team',
    name: 'The people',
    content: {
      caption: [
        text('THE PEOPLE'),
        text('Director general'),
        text('Music director'),
        text('Archive curator'),
        text('Gala producer'),
      ],
      title: text('The people who carry the century'),
      image: TEAM,
      subtitle: [
        text('Ruth Almagor'),
        text('Daniel Shahar'),
        text('Aviv Karmi'),
        text('Michal Landau'),
      ],
      body: [
        text('Has run the hall since 2014, and led its renovation.'),
        text('Puts at least one new work in every season.'),
        text('Has kept a century of programmes, letters and tapes.'),
        text('Owns every detail of the night, garden to dessert.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_hod_closing',
    name: 'Invitation',
    content: {
      caption: [text('AN INVITATION'), text('gala@ophirhall.example · ophirhall.example/100')],
      title: text('See you', 'at the gala'),
      body: [
        text('Thursday 12 November 2026, at 18:30'),
        text('Evening dress. The car park opens at 17:30'),
        text('Please reply by 1 November'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const hodSamples = { he: sampleHe, en: sampleEn };

/** The Hod template: the theme, sixteen layouts for both directions, and its sample deck. */
export function hodTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(hodTheme),
    description:
      'Splendour: Art Deco gold on peacock teal, sunbursts and arches, for galas and awards.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.hodGala,
      pictures.hodHills,
      pictures.hodTeam1,
      pictures.hodTeam2,
      pictures.hodTeam3,
      pictures.hodTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
