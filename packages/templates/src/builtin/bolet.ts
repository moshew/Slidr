import type { Background, Color, Element, Frame, Layout, Theme } from '@slidr/model';
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
 * A ground with the dot grid on it: a dot every 48px, ink at a sixth. Free CSS, which the mirror
 * leaves as it is; the grid is the same from both sides.
 */
const dotted = (color: string, dots = 'var(--color-text)', share = 16): Background => ({
  fill: {
    kind: 'css',
    value: `radial-gradient(circle, color-mix(in srgb, ${dots} ${share}%, transparent) 2.6px, transparent 3.2px) 0 0 / 48px 48px, ${color}`,
  },
});

const GROUND = {
  lilac: dotted('var(--color-bg)'),
  lime: dotted('var(--color-accent)', 'var(--color-text)', 20),
  pink: dotted('var(--color-secondary)', 'var(--color-text)', 18),
  sky: dotted('#56c8ff', 'var(--color-text)', 18),
  yellow: dotted('#ffd93b', 'var(--color-text)', 16),
  ink: dotted('var(--color-text)', 'var(--color-bg)', 22),
};

/**
 * Bolet: soft neo-brutalism. A pale lilac sheet with a dot grid, and on it everything a sticker
 * sheet has: boxes with a thick ink outline and a hard shadow that has no blur, candy fills,
 * starbursts, stickers turned a few degrees, browser windows with three dots, fat arrows, a
 * stroke of lime highlighter under the titles. The grounds change from slide to slide (lilac,
 * lime, pink, sky, yellow, ink) so a deck has a beat.
 *
 * Every text of the template is ink: ink reads on every candy colour, and a placeholder only
 * names a style. So the ink slides hold their text on light slabs, and cobalt never carries a
 * placeholder. The hard shadows are shapes of their own, not effects: a shadow effect does not
 * turn with the mirror, an offset shape does, so the light falls from the start side in both
 * directions.
 */
export const boletTheme: Theme = {
  id: 'bolet',
  name: 'Bolet',
  colors: {
    bg: '#ece6ff',
    surface: '#ffffff',
    text: '#0b0b0f',
    muted: '#3e3a56',
    primary: '#0b0b0f',
    secondary: '#ff5cb8',
    accent: '#c6f432',
    chart: ['#0b0b0f', '#ff5cb8', '#2d5bff', '#ff8a3d', '#8b5cf6', '#1fae6b'],
  },
  fonts: {
    heading: { he: 'Secular One', latin: 'Secular One' },
    body: { he: 'Rubik', latin: 'DM Sans' },
  },
  textStyles: {
    // Secular One has one weight: 400 everywhere, never a bold it would have to fake.
    display: {
      font: 'heading',
      size: 160,
      weight: 400,
      lineHeight: 0.98,
      letterSpacing: -2,
      color: { token: 'text' },
    },
    title: {
      font: 'heading',
      size: 80,
      weight: 400,
      lineHeight: 1.05,
      letterSpacing: -0.5,
      color: { token: 'text' },
    },
    heading: { font: 'heading', size: 42, weight: 400, lineHeight: 1.15, color: { token: 'text' } },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.38, color: { token: 'text' } },
    caption: {
      font: 'body',
      size: 24,
      weight: 700,
      lineHeight: 1.35,
      letterSpacing: 0.6,
      color: { token: 'text' },
    },
  },
  radius: 16,
  // Straight down: an element a user adds has no side to fall to that suits both directions.
  shadow: { x: 0, y: 10, blur: 0, color: { token: 'text' } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  // The light grounds of the layouts; the ink one is left out, since no text style reads on it.
  backgroundVariants: [GROUND.lilac, GROUND.lime, GROUND.pink, GROUND.sky, GROUND.yellow],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

const INK = '#0b0b0f';
const WHITE = '#ffffff';
const PINK = '#ff5cb8';
const LIME = '#c6f432';
const LILAC = '#ece6ff';
// The candy colours the theme has no token for. They only ever fill a shape under ink text.
const YELLOW = '#ffd93b';
const SKY = '#56c8ff';
const ORANGE = '#ff8a3d';

/** The literal colours of the drawings, and the tokens they stand for. */
const PAINT = {
  [INK]: token('text'),
  [WHITE]: token('surface'),
  [PINK]: token('secondary'),
  [LIME]: token('accent'),
  [LILAC]: token('bg'),
};

const C = {
  ink: token('text'),
  white: token('surface'),
  lilac: token('bg'),
  pink: token('secondary'),
  lime: token('accent'),
  yellow: { value: YELLOW },
  sky: { value: SKY },
  orange: { value: ORANGE },
} satisfies Record<string, Color>;

/** The fills of the candy colours, by name. */
type Candy = keyof typeof C;

const HEX: Record<Candy, string> = {
  ink: INK,
  white: WHITE,
  lilac: LILAC,
  pink: PINK,
  lime: LIME,
  yellow: YELLOW,
  sky: SKY,
  orange: ORANGE,
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The split ground of the comparison: white at the start, lime at the end, the grid over both.
 * The halves are a gradient of the model, which the mirror turns.
 */
const split = (): Background => ({
  fill: {
    kind: 'linear',
    angle: 90,
    stops: [
      { color: C.lime, at: 0 },
      { color: C.lime, at: 0.5 },
      { color: C.white, at: 0.5 },
      { color: C.white, at: 1 },
    ],
  },
  overlay: {
    kind: 'css',
    value:
      'radial-gradient(circle, color-mix(in srgb, var(--color-text) 16%, transparent) 2.6px, transparent 3.2px) 0 0 / 48px 48px',
  },
});

/** Where a hard shadow falls: toward the end side, and down. The mirror turns it with the box. */
const dropped = (frame: Frame, depth: number): Frame => ({
  ...frame,
  x: frame.x - depth,
  y: frame.y + depth,
});

/**
 * The box of the template: a fill, a 4px ink outline, and under it its hard shadow, an ink copy
 * of it set down and toward the end. On an ink ground the shadow takes a candy colour.
 */
function slab(
  id: string,
  frame: Frame,
  fill: Candy,
  rest: { radius?: number; depth?: number; line?: number; shade?: Candy; turn?: number } = {},
): Element[] {
  const { radius = 16, depth = 12, line = 4, shade = 'ink', turn = 0 } = rest;
  const shadow = rect(`${id}_shadow`, dropped(frame, depth), solid(C[shade]), {
    effects: { radius },
  });
  const face = rect(id, frame, solid(C[fill]), {
    stroke: { color: C.ink, width: line },
    effects: { radius },
  });
  return turn
    ? [
        { ...shadow, rotation: turn },
        { ...face, rotation: turn },
      ]
    : [shadow, face];
}

const svg = (w: number, h: number, ...parts: string[]) =>
  `<svg viewBox="0 0 ${w} ${h}">${parts.join('')}</svg>`;

/** The points of a starburst: `n` spikes between two radii. */
function burstPath(cx: number, cy: number, outer: number, inner: number, n: number): string {
  const points = Array.from({ length: 2 * n }, (_, k) => {
    const angle = -Math.PI / 2 + (k * Math.PI) / n;
    const radius = k % 2 === 0 ? outer : inner;
    return `${r1(cx + radius * Math.cos(angle))} ${r1(cy + radius * Math.sin(angle))}`;
  });
  return `M${points.join('L')}Z`;
}

/** A five-pointed star around a point. */
function starPath(cx: number, cy: number, outer: number): string {
  const inner = outer * 0.45;
  const points = Array.from({ length: 10 }, (_, k) => {
    const angle = -Math.PI / 2 + (k * Math.PI) / 5;
    const radius = k % 2 === 0 ? outer : inner;
    return `${r1(cx + radius * Math.cos(angle))} ${r1(cy + radius * Math.sin(angle))}`;
  });
  return `M${points.join('L')}Z`;
}

/** A four-pointed sparkle with hollow sides. */
const sparklePath = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;

/** A smiling face: two eyes and a grin, in ink. */
function smile(cx: number, cy: number, r: number): string {
  const eye = (dx: number) =>
    `<ellipse cx="${r1(cx + dx)}" cy="${r1(cy - r * 0.22)}" rx="${r1(r * 0.09)}" ry="${r1(r * 0.15)}" fill="${INK}"/>`;
  const grin = `<path d="M${r1(cx - r * 0.42)} ${r1(cy + r * 0.12)}Q${cx} ${r1(cy + r * 0.62)} ${r1(cx + r * 0.42)} ${r1(cy + r * 0.12)}" fill="none" stroke="${INK}" stroke-width="${r1(r * 0.12)}" stroke-linecap="round"/>`;
  return eye(-r * 0.27) + eye(r * 0.27) + grin;
}

/** A face that is not impressed yet: the eyes of the smile, and a flat mouth. */
function meh(cx: number, cy: number, r: number): string {
  const eye = (dx: number) =>
    `<ellipse cx="${r1(cx + dx)}" cy="${r1(cy - r * 0.22)}" rx="${r1(r * 0.09)}" ry="${r1(r * 0.15)}" fill="${INK}"/>`;
  const mouth = `<path d="M${r1(cx - r * 0.34)} ${r1(cy + r * 0.3)}H${r1(cx + r * 0.34)}" stroke="${INK}" stroke-width="${r1(r * 0.12)}" stroke-linecap="round"/>`;
  return eye(-r * 0.27) + eye(r * 0.27) + mouth;
}

/** A fat arrow that points to the end side (left, in a right-to-left slide), in a w×h box. */
function arrowPath(x: number, y: number, w: number, h: number): string {
  const head = Math.min(w * 0.45, h * 0.9);
  const shaft = h * 0.22;
  const mid = y + h / 2;
  return `M${r1(x + w)} ${r1(mid - shaft)}L${r1(x + head)} ${r1(mid - shaft)}L${r1(x + head)} ${y}L${x} ${r1(mid)}L${r1(x + head)} ${r1(y + h)}L${r1(x + head)} ${r1(mid + shaft)}L${r1(x + w)} ${r1(mid + shaft)}Z`;
}

/** A path drawn twice: in ink, set down toward the end, and in its colour with an ink outline. */
const raised = (d: string, fill: string, depth: number, line = 4, shade = INK) =>
  `<path d="${d}" fill="${shade}" transform="translate(${-depth} ${depth})"/><path d="${d}" fill="${fill}" stroke="${INK}" stroke-width="${line}" stroke-linejoin="round"/>`;

type Glyph = 'star' | 'smile' | 'meh' | 'sparkle' | 'arrow' | 'none';

function glyphOf(kind: Glyph, cx: number, cy: number, r: number): string {
  switch (kind) {
    case 'star':
      return `<path d="${starPath(cx, cy, r)}" fill="${INK}"/>`;
    case 'sparkle':
      return `<path d="${sparklePath(cx, cy, r)}" fill="${INK}"/>`;
    case 'smile':
      return smile(cx, cy, r);
    case 'meh':
      return meh(cx, cy, r);
    case 'arrow':
      return `<path d="${arrowPath(cx - r, cy - r * 0.7, 2 * r, 1.4 * r)}" fill="${INK}"/>`;
    case 'none':
      return '';
  }
}

/**
 * A starburst badge in a square frame: zigzag spikes, an ink outline, its hard shadow, and a
 * glyph in the middle. `turn` sets it at an angle, as a sticker is stuck on.
 */
function burst(
  id: string,
  frame: Frame,
  fill: Candy,
  rest: { glyph?: Glyph; spikes?: number; depth?: number; turn?: number; inner?: number } = {},
): Element {
  const { glyph = 'none', spikes = 14, depth = Math.round(frame.w / 30), turn = 0 } = rest;
  const size = frame.w;
  const line = size > 300 ? 5 : 4;
  const outer = size / 2 - depth / 2 - line;
  const cx = size / 2 + depth / 2;
  const cy = size / 2 - depth / 2;
  const d = burstPath(cx, cy, outer, outer * (rest.inner ?? 0.8), spikes);
  const markup = svg(
    size,
    size,
    raised(d, HEX[fill], depth, line),
    glyphOf(glyph, cx, cy, outer * 0.42),
  );
  return { ...drawing(id, frame, markup, PAINT), ...(turn ? { rotation: turn } : {}) };
}

/** A round sticker with a glyph on it. */
function sticker(id: string, frame: Frame, fill: Candy, glyph: Glyph, turn = 0): Element {
  const size = frame.w;
  const depth = Math.max(6, Math.round(size / 18));
  const radius = size / 2 - depth / 2 - 3;
  const cx = size / 2 + depth / 2;
  const cy = size / 2 - depth / 2;
  const circle = `M${r1(cx - radius)} ${cy}a${r1(radius)} ${r1(radius)} 0 1 0 ${r1(2 * radius)} 0a${r1(radius)} ${r1(radius)} 0 1 0 ${r1(-2 * radius)} 0Z`;
  const markup = svg(
    size,
    size,
    raised(circle, HEX[fill], depth, 4),
    glyphOf(glyph, cx, cy, radius * 0.5),
  );
  return { ...drawing(id, frame, markup, PAINT), ...(turn ? { rotation: turn } : {}) };
}

/** A fat ink arrow with its hard shadow in a colour, pointing on in the reading direction. */
function arrow(
  id: string,
  frame: Frame,
  fill: Candy = 'ink',
  shade: Candy = 'ink',
  turn = 0,
): Element {
  const { w, h } = frame;
  const depth = Math.max(5, Math.round(h / 9));
  const d = arrowPath(depth + 3, 3, w - depth - 6, h - depth - 6);
  const markup = svg(w, h, raised(d, HEX[fill], depth, 4, HEX[shade]));
  return { ...drawing(id, frame, markup, PAINT), ...(turn ? { rotation: turn } : {}) };
}

/**
 * The bar of a browser window across the top of a box: an ink rule and three outlined dots at
 * the start side, as the window of the reading direction has them.
 */
function browserBar(id: string, box: Frame, height = 56): Element {
  const { w } = box;
  const dots = [PINK, YELLOW, LIME]
    .map(
      (fill, i) =>
        `<circle cx="${w - 38 - i * 34}" cy="${height / 2}" r="10" fill="${fill}" stroke="${INK}" stroke-width="3.5"/>`,
    )
    .join('');
  const markup = svg(
    w,
    height,
    `<rect x="0" y="${height - 4}" width="${w}" height="4" fill="${INK}"/>`,
    dots,
  );
  return drawing(id, { x: box.x, y: box.y, w, h: height }, markup, PAINT);
}

/** A stroke of lime highlighter, laid a little crooked under a line of a title. */
const highlight = (id: string, frame: Frame, turn = -1.5): Element => ({
  ...rect(id, frame, solid(C.lime), { effects: { radius: 6 } }),
  rotation: turn,
});

/** A strip of tape, stuck on at an angle. */
const tape = (id: string, frame: Frame, fill: Candy, turn: number): Element => ({
  ...rect(id, frame, solid(C[fill]), { stroke: { color: C.ink, width: 3 } }),
  rotation: turn,
});

const MARK = svg(
  52,
  52,
  `<path d="${burstPath(26, 31, 21, 15, 10)}" fill="${INK}"/>`,
  `<path d="${burstPath(26, 24, 21, 15, 10)}" fill="${LIME}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`,
  `<path d="${starPath(26, 24, 8)}" fill="${INK}"/>`,
);

/** The mark of the template: a lime burst with a star. A deck replaces it with its logo. */
const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** The line over a title, after a small pink burst, and the title with its highlighter. */
const head = (width = 1728) => [
  place('p_kicker', 'caption', at(150, 84, Math.min(1000, width - 54), 34), 'caption'),
  place('p_title', 'title', at(96, 126, width, 172), 'title'),
];

function headDecor(name: string): Element[] {
  return [
    burst(`d_bolet_${name}_kicker_burst`, at(96, 76, 44, 44), 'pink', { spikes: 9, depth: 3 }),
    highlight(`d_bolet_${name}_highlight`, at(88, 182, 300, 30)),
  ];
}

/**
 * The foot of a content slide (SLD-04): the mark alone at the start, and at the end the slide's
 * number on a white pill, with the deck's name beside it.
 */
function frameOf(name: string): {
  placeholders: Layout['placeholders'];
  decorations: Element[];
} {
  return {
    placeholders: [
      place('p_footer', 'footer', atEnd(212, 956, 760, 34), 'caption', { align: 'end' }),
    ],
    decorations: [
      mark(`d_bolet_${name}_mark`, at(96, 944, 52, 52)),
      ...slab(`d_bolet_${name}_page`, atEnd(96, 946, 92, 48), 'white', {
        radius: 24,
        depth: 5,
        line: 3,
      }),
      pageNumber(`d_bolet_${name}_number`, atEnd(96, 953, 92, 34), 'caption', {
        align: 'center',
      }),
    ],
  };
}

/**
 * The card of the cover's fan: a browser window with something drawn in it, as a sticker. It
 * lies on the ink field, so its hard shadow is pink.
 */
function fanCard(
  id: string,
  frame: Frame,
  fill: Candy,
  content: 'lines' | 'bars' | 'face',
  turn: number,
) {
  const depth = 16;
  const w = frame.w - depth;
  const h = frame.h - depth;
  const x = depth;
  const box = `M${x + 18} 2H${x + w - 18}Q${x + w - 2} 2 ${x + w - 2} 18V${h - 18}Q${x + w - 2} ${h - 2} ${x + w - 18} ${h - 2}H${x + 18}Q${x + 2} ${h - 2} ${x + 2} ${h - 18}V18Q${x + 2} 2 ${x + 18} 2Z`;
  const dots = [PINK, YELLOW, LIME]
    .map(
      (dot, i) =>
        `<circle cx="${x + w - 34 - i * 30}" cy="30" r="9" fill="${dot}" stroke="${INK}" stroke-width="3.5"/>`,
    )
    .join('');
  const bar = `<rect x="${x}" y="56" width="${w}" height="4" fill="${INK}"/>`;
  let inside: string;
  if (content === 'lines') {
    const lines = [0.82, 0.64, 0.74, 0.5]
      .map(
        (share, i) =>
          `<rect x="${r1(x + w - 32 - share * (w - 64))}" y="${206 + i * 40}" width="${r1(share * (w - 64))}" height="18" rx="9" fill="${INK}"/>`,
      )
      .join('');
    inside = `<circle cx="${x + w - 92}" cy="128" r="46" fill="${PINK}" stroke="${INK}" stroke-width="4"/>${lines}`;
  } else if (content === 'bars') {
    const heights = [90, 150, 120, 220, 280];
    inside = heights
      .map(
        (bh, i) =>
          `<rect x="${x + 36 + i * ((w - 72) / 5)}" y="${h - 40 - bh}" width="${r1((w - 72) / 5 - 14)}" height="${bh}" fill="${i === 4 ? PINK : WHITE}" stroke="${INK}" stroke-width="4"/>`,
      )
      .join('');
  } else {
    const cy = 60 + (h - 60) / 2;
    inside = `<circle cx="${x + w / 2}" cy="${cy}" r="${(w - 120) / 2}" fill="${YELLOW}" stroke="${INK}" stroke-width="5"/>${smile(x + w / 2, cy, (w - 120) / 2)}`;
  }
  const markup = svg(
    frame.w,
    frame.h,
    `<path d="${box}" fill="${PINK}" transform="translate(${-depth} ${depth})"/>`,
    `<path d="${box}" fill="${HEX[fill]}" stroke="${INK}" stroke-width="4"/>`,
    bar,
    dots,
    inside,
  );
  return { ...drawing(id, frame, markup, PAINT), rotation: turn };
}

/** A ribbon of tape at an angle, with sparkles and pink dots along it. */
function ribbon(id: string, frame: Frame, fill: Candy, turn: number): Element {
  const { w, h } = frame;
  const marks = Array.from({ length: Math.floor(w / 120) }, (_, i) => {
    const cx = 60 + i * 120;
    return i % 2 === 0
      ? `<path d="${sparklePath(cx, h / 2, h * 0.3)}" fill="${fill === 'ink' ? LIME : INK}"/>`
      : `<circle cx="${cx}" cy="${h / 2}" r="${r1(h * 0.11)}" fill="${PINK}" stroke="${INK}" stroke-width="3"/>`;
  }).join('');
  const band = `<rect x="0" y="2" width="${w}" height="${h - 4}" fill="${HEX[fill]}" stroke="${INK}" stroke-width="4"/>`;
  return { ...drawing(id, frame, svg(w, h, band, marks), PAINT), rotation: turn };
}

/**
 * The ink field of the cover, at the end side, its edge toward the title cut in a zigzag like
 * the edge of a burst. The mirror turns it with the slide.
 */
function field(id: string, frame: Frame): Element {
  const { w, h } = frame;
  const teeth = 18;
  const step = h / teeth;
  const edge = Array.from(
    { length: teeth },
    (_, k) => `L${w} ${r1(k * step + step / 2)}L${w - 44} ${r1((k + 1) * step)}`,
  ).join('');
  const d = `M0 0H${w - 44}${edge}H0Z`;
  return drawing(id, frame, svg(w, h, `<path d="${d}" fill="${INK}"/>`), PAINT);
}

/** The quotation marks of each direction, lime and outlined. Two marks, not one and its mirror. */
const QUOTE_RTL_PATH =
  'M66 0v22c0 18-9 28-26 30V42c8-2 12-7 12-16H40V0h26ZM26 0v22C26 40 17 50 0 52V42c8-2 12-7 12-16H0V0h26Z';
const QUOTE_LTR_PATH =
  'M0 52V30C0 12 9 2 26 0v10c-8 2-12 7-12 16h12v26H0Zm40 0V30C40 12 49 2 66 0v10c-8 2-12 7-12 16h12v26H40Z';

function quoteGlyph(frame: Frame, path: string, shadowLeft: boolean): Element {
  // The marks are drawn at 2.6 times their size; the shadow falls to the end side of the slide.
  const s = 2.6;
  const depth = 5;
  const dx = shadowLeft ? -depth : depth;
  const g = (fill: string, x: number, y: number, stroke: boolean) =>
    `<g transform="translate(${x} ${y}) scale(${s})"><path d="${path}" fill="${fill}"${stroke ? ` stroke="${INK}" stroke-width="${r1(4 / s)}" stroke-linejoin="round"` : ''}/></g>`;
  const ox = 12;
  const oy = 6;
  return drawing(
    'd_bolet_quote_glyph',
    frame,
    svg(200, 160, g(INK, ox + dx, oy + depth, false), g(LIME, ox, oy, true)),
    PAINT,
  );
}

/** The speech bubble of the quote: a box with a tail at the start side, toward the speaker. */
function bubble(id: string, frame: Frame): Element {
  const { w, h } = frame;
  const depth = 16;
  const line = 5;
  const bw = w - depth - line;
  const bh = h - 120;
  const x0 = depth + line / 2;
  const y0 = line / 2;
  const rr = 40;
  const tail = [w - 300, w - 170, w - 210];
  const d = [
    `M${x0 + rr} ${y0}`,
    `H${x0 + bw - rr}`,
    `Q${x0 + bw} ${y0} ${x0 + bw} ${y0 + rr}`,
    `V${y0 + bh - rr}`,
    `Q${x0 + bw} ${y0 + bh} ${x0 + bw - rr} ${y0 + bh}`,
    `H${tail[1]}`,
    `L${tail[2]} ${h - depth - line}`,
    `L${tail[0]} ${y0 + bh}`,
    `H${x0 + rr}`,
    `Q${x0} ${y0 + bh} ${x0} ${y0 + bh - rr}`,
    `V${y0 + rr}`,
    `Q${x0} ${y0} ${x0 + rr} ${y0}Z`,
  ].join('');
  return drawing(id, frame, svg(w, h, raised(d, WHITE, depth, line)), PAINT);
}

/** The number of a step or a point, written on its sticker. Centred, so the mirror keeps it. */
const stickerNumber = (id: string, frame: Frame, n: number, color?: Color) =>
  label(id, frame, String(n), 'heading', {
    ...(color ? { color } : {}),
    dir: 'auto',
    align: 'center',
    vAlign: 'middle',
  });

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const columns4 = [96, 540, 984, 1428];
const cards3 = [96, 690, 1284];
const cardTops = [312, 352, 312];
const cardFills: Candy[] = ['pink', 'sky', 'yellow'];
const rows3 = [308, 512, 716];
const rowFills: Candy[] = ['pink', 'yellow', 'sky'];
const steps5 = [96, 450, 804, 1158, 1512];
const stepTops = [536, 480, 424, 368, 312];
const stepFills: Candy[] = ['white', 'pink', 'yellow', 'sky', 'lime'];
const stats3 = [296, 500, 704];
const statFills: Candy[] = ['pink', 'sky', 'lime'];
const chartStats = [312, 584];
const teamTops = [292, 318, 292, 318];
const teamTape: Candy[] = ['pink', 'lime', 'sky', 'orange'];
const lines3 = [728, 822, 916];
const lineFills: Candy[] = ['pink', 'sky', 'yellow'];

function layouts(): Layout[] {
  return [
    {
      id: 'l_bolet_hero',
      name: 'Hero',
      archetype: 'hero',
      background: GROUND.lilac,
      placeholders: [
        place('p_kicker', 'caption', at(134, 142, 570, 34), 'caption'),
        place('p_title', 'title', at(96, 232, 1240, 490), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 778, 1100, 106), 'heading'),
        place('p_meta', 'caption', at(96, 930, 1100, 34), 'caption'),
      ],
      decorations: [
        // The title stands on the ground itself: nothing light is drawn under it, so a cover
        // that keeps a dark background of its own still reads. The colour is all at the end.
        field('d_bolet_hero_field', atEnd(0, 0, 560, 1080)),
        ribbon('d_bolet_hero_ribbon', atEnd(-60, 952, 640, 70), 'lime', -6),
        fanCard('d_bolet_hero_card1', atEnd(30, 118, 340, 420), 'yellow', 'lines', -11),
        fanCard('d_bolet_hero_card2', atEnd(110, 214, 340, 420), 'sky', 'bars', 2),
        fanCard('d_bolet_hero_card3', atEnd(176, 330, 340, 420), 'white', 'face', 11),
        burst('d_bolet_hero_burst', atEnd(250, 660, 320, 320), 'lime', {
          glyph: 'star',
          spikes: 16,
          turn: -8,
        }),
        sticker('d_bolet_hero_dot', atEnd(40, 740, 150, 150), 'pink', 'sparkle', 10),
        sticker('d_bolet_hero_moon', atEnd(610, 64, 132, 132), 'sky', 'star', -10),
        ...slab('d_bolet_hero_tab', at(96, 126, 640, 66), 'pink', {
          radius: 33,
          depth: 7,
          turn: -2,
        }),
        rect('d_bolet_hero_rule', at(96, 744, 180, 16), solid(C.ink), { effects: { radius: 8 } }),
        burst('d_bolet_hero_spark', at(292, 736, 34, 34), 'pink', { spikes: 8, depth: 3 }),
      ],
    },
    {
      id: 'l_bolet_section',
      name: 'Section',
      archetype: 'section',
      background: GROUND.lime,
      placeholders: [
        place('p_number', 'number', at(126, 424, 400, 190), 'display', {
          align: 'center',
          vAlign: 'middle',
        }),
        place('p_kicker', 'caption', at(146, 334, 360, 66), 'caption', {
          align: 'center',
          vAlign: 'bottom',
        }),
        place('p_title', 'title', at(620, 344, 1110, 330), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(620, 694, 1000, 110), 'heading'),
      ],
      decorations: [
        // A row of stickers comes in over the top edge; the number is on a white square stuck
        // on crooked; a ribbon runs under it all.
        burst('d_bolet_section_burst', atEnd(-90, -150, 460, 460), 'yellow', {
          glyph: 'smile',
          spikes: 16,
          turn: 10,
        }),
        ...slab('d_bolet_section_pill', atEnd(420, 66, 440, 124), 'pink', {
          radius: 62,
          depth: 12,
          turn: -6,
        }),
        sticker('d_bolet_section_round', atEnd(910, 36, 180, 180), 'sky', 'sparkle', -8),
        arrow('d_bolet_section_arrow', atEnd(1150, 92, 230, 100), 'ink', 'pink', 0),
        ...slab('d_bolet_section_square', at(96, 300, 460, 420), 'white', {
          radius: 28,
          depth: 18,
          turn: -6,
        }),
        sticker('d_bolet_section_dot', at(440, 650, 120, 120), 'pink', 'star', 12),
        burst('d_bolet_section_spark', atEnd(56, 470, 170, 170), 'white', {
          glyph: 'sparkle',
          spikes: 12,
          turn: 12,
        }),
        ribbon('d_bolet_section_ribbon', atEnd(-60, 906, 2040, 84), 'ink', -2),
      ],
    },
    {
      id: 'l_bolet_title',
      name: 'Title',
      archetype: 'title',
      background: GROUND.lilac,
      placeholders: [place('p_title', 'title', at(96, 126, 1728, 86), 'title')],
      decorations: [...headDecor('title'), ...frameOf('title').decorations],
    },
    {
      id: 'l_bolet_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      background: GROUND.lilac,
      placeholders: [
        ...head(),
        place('p_number', 'number', at(130, 506, 540, 190), 'display', {
          align: 'center',
          vAlign: 'middle',
        }),
        place('p_label', 'subtitle', at(800, 336, 480, 110), 'heading'),
        place('p_body', 'body', at(800, 460, 480, 400), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(128, top + 20, 406, 86), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', atEnd(128, top + 106, 406, 66), 'caption'),
        ]),
        ...frameOf('big_number').placeholders,
      ],
      decorations: [
        ...headDecor('big_number'),
        // The giant burst holds the number; the label and the story stand beside it on the
        // ground, and the three numbers beside them are panels of their own.
        burst('d_bolet_big_number_burst', at(70, 270, 660, 660), 'yellow', { spikes: 16 }),
        rect('d_bolet_big_number_rule', at(800, 306, 140, 14), solid(C.ink), {
          effects: { radius: 7 },
        }),
        ...stats3.flatMap((top, i) =>
          slab(`d_bolet_big_number_stat${i + 1}`, atEnd(96, top, 470, 184), statFills[i]!, {
            radius: 20,
          }),
        ),
        sticker('d_bolet_big_number_dot', atEnd(64, 254, 84, 84), 'lime', 'sparkle', -10),
        ...frameOf('big_number').decorations,
      ],
    },
    {
      id: 'l_bolet_quote',
      name: 'Quote',
      archetype: 'quote',
      background: GROUND.pink,
      placeholders: [
        place('p_quote', 'quote', at(196, 190, 1420, 440), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(420, 790, 1100, 52), 'heading'),
        place('p_caption', 'caption', at(420, 846, 1100, 68), 'caption'),
        ...frameOf('quote').placeholders,
      ],
      decorations: [
        bubble('d_bolet_quote_bubble', at(96, 110, 1620, 704)),
        quoteGlyph(at(52, 56, 200, 160), QUOTE_RTL_PATH, true),
        sticker('d_bolet_quote_face', at(230, 776, 160, 160), 'yellow', 'smile', -6),
        burst('d_bolet_quote_burst', atEnd(20, 690, 230, 230), 'lime', {
          glyph: 'sparkle',
          spikes: 12,
          turn: 12,
        }),
        ...frameOf('quote').decorations,
      ],
    },
    {
      id: 'l_bolet_text',
      name: 'Text',
      archetype: 'text',
      background: GROUND.lilac,
      placeholders: [
        place('p_title', 'title', at(96, 126, 1728, 86), 'title'),
        place('p_body', 'body', at(96, 262, 1728, 640), 'body'),
      ],
      decorations: [...headDecor('text'), ...frameOf('text').decorations],
    },
    {
      id: 'l_bolet_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      background: GROUND.lilac,
      placeholders: [
        ...head(1040),
        place('p_image', 'image', atEnd(136, 112, 560, 780)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(196, top + 20, 900, 50), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(196, top + 74, 900, 116), 'body'),
        ]),
        ...frameOf('text_image').placeholders,
      ],
      decorations: [
        ...headDecor('text_image'),
        // The picture in a thick ink frame with its shadow, taped on, a burst under its corner.
        rect('d_bolet_text_image_shadow', atEnd(98, 118, 600, 820), solid(C.ink), {
          effects: { radius: 10 },
        }),
        rect('d_bolet_text_image_frame', atEnd(116, 92, 600, 820), solid(C.ink), {
          effects: { radius: 10 },
        }),
        burst('d_bolet_text_image_burst', atEnd(28, 806, 180, 180), 'lime', {
          glyph: 'star',
          spikes: 12,
          turn: -10,
        }),
        tape('d_bolet_text_image_tape', atEnd(500, 70, 200, 52), 'pink', 7),
        ...rows3.flatMap((top, i) => [
          ...slab(`d_bolet_text_image_row${i + 1}`, at(136, top, 960, 196), 'white', {
            radius: 20,
          }),
          sticker(`d_bolet_text_image_dot${i + 1}`, at(98, top + 20, 80, 80), rowFills[i]!, 'none'),
          stickerNumber(`d_bolet_text_image_n${i + 1}`, at(100, top + 18, 78, 76), i + 1),
        ]),
        ...frameOf('text_image').decorations,
      ],
    },
    {
      id: 'l_bolet_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      background: GROUND.ink,
      placeholders: [
        place('p_image', 'image', at(96, 72, 1728, 548)),
        place('p_kicker', 'caption', at(140, 706, 900, 34), 'caption'),
        place('p_title', 'title', at(140, 752, 1000, 176), 'title'),
        place('p_body', 'body', atEnd(132, 706, 500, 222), 'body'),
      ],
      decorations: [
        // On the ink ground the hard shadows turn lime and pink, and the picture gets a white mat.
        rect('d_bolet_full_image_shadow', dropped(at(84, 60, 1752, 572), 18), solid(C.lime), {
          effects: { radius: 12 },
        }),
        rect('d_bolet_full_image_mat', at(84, 60, 1752, 572), solid(C.white), {
          effects: { radius: 12 },
        }),
        ...slab('d_bolet_full_image_panel', at(96, 680, 1092, 278), 'lime', {
          radius: 22,
          depth: 16,
          shade: 'pink',
        }),
        ...slab('d_bolet_full_image_note', atEnd(96, 680, 568, 278), 'white', {
          radius: 22,
          depth: 16,
          shade: 'lime',
        }),
        burst('d_bolet_full_image_burst', atEnd(604, 560, 124, 124), 'pink', {
          glyph: 'star',
          spikes: 12,
          turn: 10,
        }),
      ],
    },
    {
      id: 'l_bolet_cards',
      name: 'Cards',
      archetype: 'cards',
      background: GROUND.lilac,
      placeholders: [
        ...head(),
        ...cards3.flatMap((start, i) => {
          const top = cardTops[i]!;
          return [
            place(`p_card${i + 1}`, 'subtitle', at(start + 32, top + 140, 476, 98), 'heading'),
            place(`p_card${i + 1}_body`, 'body', at(start + 32, top + 244, 476, 166), 'body'),
            place(`p_card${i + 1}_note`, 'caption', at(start + 32, top + 70, 476, 66), 'caption'),
          ];
        }),
        place('p_takeaway', 'body', at(212, 818, 1572, 82), 'body', { vAlign: 'middle' }),
        ...frameOf('cards').placeholders,
      ],
      decorations: [
        ...headDecor('cards'),
        ...cards3.flatMap((start, i) => {
          const top = cardTops[i]!;
          const card = at(start, top, 540, 424);
          return [
            ...slab(`d_bolet_cards_card${i + 1}`, card, cardFills[i]!, { radius: 20 }),
            browserBar(`d_bolet_cards_bar${i + 1}`, card),
          ];
        }),
        burst('d_bolet_cards_burst', atEnd(56, 252, 130, 130), 'lime', {
          glyph: 'sparkle',
          spikes: 12,
          turn: 12,
        }),
        ...slab('d_bolet_cards_takeaway', at(96, 810, 1728, 98), 'white', { radius: 49, depth: 8 }),
        sticker('d_bolet_cards_dot', at(116, 823, 72, 72), 'lime', 'arrow'),
        ...frameOf('cards').decorations,
      ],
    },
    {
      id: 'l_bolet_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      background: GROUND.sky,
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start + 70, 300, 326, 86), 'title', {
            vAlign: 'bottom',
          }),
          place(`p_what${i + 1}`, 'subtitle', at(start + 28, 468, 340, 98), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start + 28, 572, 340, 200), 'body'),
        ]),
        place('p_note', 'caption', at(96, 836, 1728, 66), 'caption'),
        ...frameOf('timeline').placeholders,
      ],
      decorations: [
        ...headDecor('timeline'),
        // The track: a thick ink road, with a lime stop at the start of each card.
        rect('d_bolet_timeline_track', at(60, 398, 1800, 16), solid(C.ink), {
          effects: { radius: 8 },
        }),
        arrow('d_bolet_timeline_arrow', atEnd(28, 370, 110, 72), 'ink', 'ink'),
        ...columns4.flatMap((start, i) => [
          ...slab(`d_bolet_timeline_card${i + 1}`, at(start, 448, 396, 340), 'white', {
            radius: 20,
          }),
          sticker(`d_bolet_timeline_stop${i + 1}`, at(start, 372, 66, 66), 'lime', 'none'),
        ]),
        ...frameOf('timeline').decorations,
      ],
    },
    {
      id: 'l_bolet_process',
      name: 'Process',
      archetype: 'process',
      background: GROUND.lilac,
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => {
          const top = stepTops[i]!;
          return [
            place(`p_step${i + 1}`, 'subtitle', at(start + 22, top + 96, 256, 98), 'heading'),
            place(`p_step${i + 1}_body`, 'caption', at(start + 22, top + 198, 256, 134), 'caption'),
            place(`p_step${i + 1}_number`, 'number', at(start + 92, top + 22, 186, 52), 'heading', {
              align: 'end',
            }),
          ];
        }),
        place('p_summary', 'body', at(130, 330, 630, 116), 'body', { vAlign: 'middle' }),
        ...frameOf('process').placeholders,
      ],
      decorations: [
        ...headDecor('process'),
        ...slab('d_bolet_process_note', at(96, 318, 690, 140), 'white', { radius: 20, turn: -1.5 }),
        // Five blocks climbing toward the end, each joined to the next by a fat arrow.
        ...steps5.flatMap((start, i) => {
          const top = stepTops[i]!;
          return [
            ...slab(`d_bolet_process_step${i + 1}`, at(start, top, 300, 380), stepFills[i]!, {
              radius: 20,
            }),
            sticker(`d_bolet_process_dot${i + 1}`, at(start + 20, top + 16, 66, 66), 'ink', 'none'),
            stickerNumber(
              `d_bolet_process_n${i + 1}`,
              at(start + 20, top + 14, 62, 62),
              i + 1,
              C.lilac,
            ),
          ];
        }),
        ...steps5
          .slice(0, 4)
          .map((start, i) =>
            arrow(
              `d_bolet_process_arrow${i + 1}`,
              at(start + 284, stepTops[i]! + 120, 84, 64),
              'ink',
              'ink',
              0,
            ),
          ),
        burst('d_bolet_process_burst', atEnd(70, 680, 230, 230), 'sky', {
          glyph: 'arrow',
          spikes: 14,
          turn: -18,
        }),
        ...frameOf('process').decorations,
      ],
    },
    {
      id: 'l_bolet_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      background: split(),
      placeholders: [
        ...head(),
        place('p_before_tag', 'caption', at(136, 318, 700, 34), 'caption'),
        place('p_before', 'subtitle', at(136, 360, 700, 172), 'title', { vAlign: 'bottom' }),
        place('p_before_body', 'body', at(136, 576, 700, 350), 'body'),
        place('p_after_tag', 'caption', atEnd(136, 318, 700, 34), 'caption'),
        place('p_after', 'subtitle', atEnd(136, 360, 700, 172), 'title', { vAlign: 'bottom' }),
        place('p_after_body', 'body', atEnd(136, 576, 700, 350), 'body'),
        ...frameOf('comparison').placeholders,
      ],
      decorations: [
        ...headDecor('comparison'),
        // The seam between what was and what is, crossed by a burst with an arrow.
        rect('d_bolet_comparison_seam', atEnd(956, 300, 8, 780), solid(C.ink)),
        rect('d_bolet_comparison_rule1', at(136, 548, 700, 6), solid(C.ink)),
        rect('d_bolet_comparison_rule2', atEnd(136, 548, 700, 6), solid(C.ink)),
        // The story of the slide in two faces: not impressed yet, then delighted.
        sticker('d_bolet_comparison_meh', at(126, 740, 190, 190), 'lilac', 'meh', -8),
        burst('d_bolet_comparison_joy', atEnd(110, 690, 250, 250), 'yellow', {
          glyph: 'smile',
          spikes: 14,
          turn: 10,
        }),
        burst('d_bolet_comparison_burst', atEnd(860, 450, 200, 200), 'pink', {
          glyph: 'arrow',
          spikes: 14,
        }),
        ...frameOf('comparison').decorations,
      ],
    },
    {
      id: 'l_bolet_chart',
      name: 'Chart',
      archetype: 'chart',
      background: GROUND.lilac,
      placeholders: [
        ...head(),
        place('p_chart', 'chart', at(124, 384, 1080, 516)),
        ...chartStats.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(128, top + 22, 452, 88), 'title'),
          place(`p_stat${i + 1}_body`, 'body', atEnd(128, top + 114, 452, 118), 'body'),
        ]),
        place('p_source', 'caption', atEnd(96, 856, 540, 66), 'caption'),
        ...frameOf('chart').placeholders,
      ],
      decorations: [
        ...headDecor('chart'),
        ...slab('d_bolet_chart_window', at(96, 312, 1136, 612), 'white', { radius: 20 }),
        browserBar('d_bolet_chart_bar', at(96, 312, 1136, 612)),
        ...chartStats.flatMap((top, i) =>
          slab(
            `d_bolet_chart_stat${i + 1}`,
            atEnd(96, top, 516, 246),
            i === 0 ? 'pink' : 'yellow',
            {
              radius: 20,
            },
          ),
        ),
        burst('d_bolet_chart_burst', atEnd(40, 240, 120, 120), 'lime', {
          glyph: 'star',
          spikes: 12,
          turn: -10,
        }),
        ...frameOf('chart').decorations,
      ],
    },
    {
      id: 'l_bolet_table',
      name: 'Table',
      archetype: 'table',
      background: GROUND.lilac,
      placeholders: [
        ...head(1080),
        place('p_table', 'table', at(120, 318, 1680, 592)),
        place('p_note', 'caption', atEnd(134, 112, 520, 100), 'caption', { vAlign: 'middle' }),
        ...frameOf('table').placeholders,
      ],
      decorations: [
        ...headDecor('table'),
        // The note of the table is a sticker of its own, stuck on crooked at the end.
        ...slab('d_bolet_table_note', atEnd(100, 90, 590, 146), 'yellow', {
          radius: 20,
          depth: 10,
          turn: 2.5,
        }),
        burst('d_bolet_table_burst', atEnd(56, 62, 92, 92), 'pink', {
          glyph: 'sparkle',
          spikes: 12,
          turn: 10,
        }),
        ...slab('d_bolet_table_window', at(96, 300, 1728, 628), 'white', { radius: 20 }),
        ...frameOf('table').decorations,
      ],
    },
    {
      id: 'l_bolet_team',
      name: 'Team',
      archetype: 'team',
      background: GROUND.yellow,
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => {
          const top = teamTops[i]!;
          return [
            place(`p_person${i + 1}_photo`, 'image', at(start + 22, top + 22, 352, 300)),
            place(`p_person${i + 1}`, 'subtitle', at(start + 22, top + 340, 352, 50), 'heading'),
            place(
              `p_person${i + 1}_role`,
              'caption',
              at(start + 22, top + 394, 352, 66),
              'caption',
            ),
            place(`p_person${i + 1}_body`, 'body', at(start + 22, top + 462, 352, 118), 'body'),
          ];
        }),
        ...frameOf('team').placeholders,
      ],
      decorations: [
        ...headDecor('team'),
        // Polaroids with a hard shadow, each taped on at its own angle.
        ...columns4.flatMap((start, i) => {
          const top = teamTops[i]!;
          return [
            ...slab(`d_bolet_team_card${i + 1}`, at(start, top, 396, 600), 'white', {
              radius: 10,
              depth: 14,
            }),
            tape(
              `d_bolet_team_tape${i + 1}`,
              at(start + 138, top - 22, 120, 44),
              teamTape[i]!,
              i % 2 ? 6 : -5,
            ),
          ];
        }),
        ...frameOf('team').decorations,
      ],
    },
    {
      id: 'l_bolet_closing',
      name: 'Closing',
      archetype: 'closing',
      background: GROUND.ink,
      placeholders: [
        place('p_kicker', 'caption', at(206, 172, 1100, 34), 'caption'),
        place('p_title', 'title', at(150, 222, 1200, 470), 'display', { vAlign: 'middle' }),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(150, top + 4, 980, 76), 'body', {
            vAlign: 'middle',
          }),
        ),
        place('p_contact', 'caption', atEnd(128, 862, 480, 100), 'caption', { vAlign: 'middle' }),
      ],
      decorations: [
        // The cover's colours turned around: a lime panel on the ink, its burst grown, and the
        // next steps as three buttons.
        burst('d_bolet_closing_burst', atEnd(20, 70, 620, 620), 'yellow', {
          glyph: 'smile',
          spikes: 18,
          turn: 8,
          depth: 22,
        }),
        ...slab('d_bolet_closing_panel', at(96, 124, 1300, 572), 'lime', {
          radius: 28,
          depth: 20,
          shade: 'pink',
          turn: -1,
        }),
        burst('d_bolet_closing_kicker_burst', at(150, 166, 44, 44), 'pink', {
          spikes: 9,
          depth: 3,
        }),
        ...lines3.flatMap((top, i) => [
          ...slab(`d_bolet_closing_line${i + 1}`, at(96, top, 1160, 84), lineFills[i]!, {
            radius: 42,
            depth: 8,
            shade: 'white',
          }),
          sticker(`d_bolet_closing_go${i + 1}`, at(1176, top + 8, 66, 66), 'white', 'arrow'),
        ]),
        ...slab('d_bolet_closing_contact', atEnd(96, 840, 540, 144), 'white', {
          radius: 24,
          depth: 10,
          shade: 'lime',
          turn: -3,
        }),
      ],
    },
  ];
}

/**
 * The layouts the mirror gets wrong for a left-to-right deck. Only the quote: its marks are
 * glyphs of the direction. Everything else is drawn in boxes, paths and model gradients, which
 * the mirror turns, shadows included.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  const quote = drawn.find((layout) => layout.id === 'l_bolet_quote');
  if (!quote) return [];
  const mirrored = mirrorLayout(quote);
  return [
    {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) =>
        decoration.id === 'd_bolet_quote_glyph'
          ? quoteGlyph(decoration.frame, QUOTE_LTR_PATH, false)
          : decoration,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: the demo day of an invented accelerator for creative startups, slide by slide

const FOOTER = text('KFITZA · DEMO DAY 07');
const COHORTS_HE = ['מחזור 3', 'מחזור 4', 'מחזור 5', 'מחזור 6', 'מחזור 7'];
const COHORTS_EN = ['Cohort 3', 'Cohort 4', 'Cohort 5', 'Cohort 6', 'Cohort 7'];
const ROUNDS = [2.1, 3.4, 5.2, 8.6, 24];
const GRANTS = [1.2, 1.5, 2, 2.4, 7];
const TABLE_COLS = [640, 340, 340, 340];
const TABLE_ROW = 54;
const TEAM = [
  { assetId: pictures.boletTeam1.id },
  { assetId: pictures.boletTeam2.id },
  { assetId: pictures.boletTeam3.id },
  { assetId: pictures.boletTeam4.id },
];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_bolet_hero',
    name: 'פתיחה',
    content: {
      caption: [text('DEMO DAY · מחזור 7'), text('המוסך, חולון · 18 בפברואר 2027 · דלתות בשש')],
      title: text('יום ההדגמה', 'של מחזור 7'),
      subtitle: text('12 מיזמים, 14 שבועות ושבע דקות לכל צוות על הבמה'),
    },
  },
  {
    layout: 'l_bolet_section',
    name: 'מה קרה',
    content: {
      number: text('01'),
      caption: text('חלק ראשון'),
      title: text('מה קרה'),
      subtitle: text('14 שבועות, 12 צוותים ואלפי פתקים צבעוניים על הקיר.'),
    },
  },
  {
    layout: 'l_bolet_big_number',
    name: 'במספרים',
    content: {
      caption: [
        text('במספרים'),
        text('מיזמים עלו הערב לבמה'),
        text('משקיעים ואורחים באולם'),
        text('מהצוותים מייסדים בפעם הראשונה'),
      ],
      title: text('המחזור החזק שלנו עד היום'),
      number: [text('31M'), text('12'), text('340'), text('68%')],
      subtitle: text('שקלים גויסו עד יום ההדגמה'),
      body: text(
        'תשעה מתוך 12 המיזמים כבר חתמו על סבב ראשון. במחזור הקודם הגיעו לכאן רק ארבעה, והסכום כולו היה פחות מחצי.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_cards',
    name: 'שלושה מסלולים',
    content: {
      caption: [
        text('המסלולים'),
        text('מסלול 01 · מוצר'),
        text('מסלול 02 · מותג'),
        text('מסלול 03 · קהילה'),
      ],
      title: text('שלושה מסלולים, מחזור אחד'),
      subtitle: [
        text('מוצרים שאפשר להחזיק ביד'),
        text('מותגים שמדברים בקול רם'),
        text('קהילות שבונות את עצמן'),
      ],
      body: [
        text('חומרים, אריזה וייצור ראשון. ארבעה צוותים יצאו עם אב טיפוס עובד ועם הזמנות מראש.'),
        text('שם, קול ושפה עיצובית. חמישה צוותים בנו מותג שלם, מהלוגו ועד הקמפיין הראשון.'),
        text('מועדונים, קורסים ואירועים. שלושה צוותים גדלו מעשרה חברים לאלפים בתוך עונה.'),
        text('בכל מסלול: מנטור צמוד, מענק של 40 אלף שקל ודדליין שבועי שאי אפשר להזיז.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_text_image',
    name: 'על הבמה',
    content: {
      caption: text('על הבמה'),
      title: text('שבע דקות, בלי שקף אחד מיותר'),
      image: { assetId: pictures.boletStage.id },
      subtitle: [text('פותחים בבעיה אמיתית'), text('הדגמה חיה, לא סרטון'), text('בקשה אחת וברורה')],
      body: [
        text(
          'כל הצגה מתחילה בסיפור של לקוח אחד, עם שם ופנים. הגרפים מגיעים רק אחרי שלקהל כבר אכפת.',
        ),
        text('המוצר עובד על הבמה, מול הקהל ובזמן אמת. אם משהו נתקע, מתקנים בשידור חי ומחייכים.'),
        text('כל צוות יורד מהבמה עם מספר אחד: כמה הוא מגייס, למה דווקא עכשיו ומה ייבנה בכסף הזה.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_chart',
    name: 'גיוסים',
    content: {
      caption: [text('גיוסים'), text('מקור: נתוני קפיצה, מיליוני שקלים עד יום ההדגמה.')],
      title: text('הגיוס צומח ממחזור למחזור'),
      number: [text('2.8x'), text('9/12')],
      body: [
        text('הסכום שגויס במחזור הזה, לעומת 11 מיליון במחזור 6.'),
        text('מהמיזמים כבר חתמו על סבב ראשון, ועוד שלושה במגעים.'),
      ],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'גיוס לפי מחזור, מיליוני שקלים',
      data: {
        categories: COHORTS_HE,
        series: [
          { name: 'סבב ראשון', values: ROUNDS },
          { name: 'מענקים', values: GRANTS },
        ],
      },
    },
  },
  {
    layout: 'l_bolet_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('לפני ואחרי'), text('היום הראשון במאיץ'), text('יום ההדגמה')],
      title: text('מה קורה בארבעה חודשים'),
      subtitle: [text('רעיון על מפית'), text('מוצר עם לקוחות')],
      body: [
        bullets('שקף אחד ושלושה חברים', 'אפס לקוחות משלמים', 'שם זמני ולוגו מהאינטרנט', 'פחד במה'),
        bullets(
          'צוות של חמישה, עם תפקידים ברורים',
          '1,200 לקוחות משלמים בממוצע',
          'מותג שלם, מהשם ועד האריזה',
          'שבע דקות על במה מול 340 איש',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_table',
    name: 'התוכנית',
    content: {
      caption: [
        text('התוכנית'),
        text('ההטבות לכל צוות שהתקבל למחזור. ההרשמה למחזור 8 נפתחת במרץ.'),
      ],
      title: text('מה מקבל כל צוות'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['מה כלול', 'מוצר', 'מותג', 'קהילה'],
        ['מענק ראשון', '₪40K', '₪40K', '₪40K'],
        ['שעות מנטורינג', '60', '60', '48'],
        ['סטודיו וציוד', 'מעבדת ייצור', 'סטודיו צילום', 'חדר הקלטות'],
        ['תקציב לניסויים', '₪15K', '₪25K', '₪10K'],
        ['ימים במשרד', '5 בשבוע', '4 בשבוע', '3 בשבוע'],
        ['פגישות עם משקיעים', '12', '12', '8'],
        ['ליווי אחרי המחזור', 'שנה', 'שנה', 'חצי שנה'],
        ['מקומות במחזור', '4', '5', '3'],
      ],
    },
  },
  {
    layout: 'l_bolet_process',
    name: 'איך זה עובד',
    content: {
      caption: [
        text('איך זה עובד'),
        text('טופס של עמוד אחד וסרטון של דקה.'),
        text('ראיון עם הצוות ושבוע ניסיון אצלנו.'),
        text('ספרינטים, מנטורים ולילות במעבדה.'),
        text('מוכרים ללקוחות אמיתיים ומודדים.'),
        text('שבע דקות מול משקיעים וקהל.'),
      ],
      title: text('מהרעיון לבמה בחמש קפיצות'),
      subtitle: [text('מגישים'), text('נבחרים'), text('בונים'), text('בודקים'), text('עולים לבמה')],
      number: [text('שבוע'), text('2 שב׳'), text('10 שב׳'), text('2 שב׳'), text('7 דק׳')],
      body: text('ארבעה חודשים מהטופס הראשון ועד שהאורות על הבמה נדלקים.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_section',
    name: 'מה הלאה',
    content: {
      number: text('02'),
      caption: text('חלק שני'),
      title: text('מה הלאה'),
      subtitle: text('מחזור 8, השנה הבאה, והאנשים שיובילו אותה.'),
    },
  },
  {
    layout: 'l_bolet_timeline',
    name: 'הדרך למחזור 8',
    content: {
      caption: [text('2027'), text('התאריכים הם יעדים. העדכונים מתפרסמים ב-kfitza.example/8.')],
      title: text('ארבע תחנות עד מחזור 8'),
      number: [text('מרץ'), text('מאי'), text('יולי'), text('ספט׳')],
      subtitle: [
        text('נפתחת ההרשמה'),
        text('בוחרים 14 צוותים'),
        text('מעבדה חדשה בחיפה'),
        text('יום הדגמה 08'),
      ],
      body: [
        text('טופס של עמוד אחד, בלי מצגת, ומפגש היכרות פתוח בכל יום חמישי.'),
        text('שני צוותים יותר מהשנה, ומסלול רביעי לחומרים בני קיימא.'),
        text('סדנת ייצור עם מדפסות, תנור וחדר צבע, פתוחה לכל הבוגרים.'),
        text('הבמה גדלה פי שניים, והכרטיסים לקהל נפתחים חודש מראש.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_full_image',
    name: 'הערב',
    content: {
      image: { assetId: pictures.boletScene.id },
      caption: text('הערב עצמו'),
      title: text('ככה נראית קפיצה', 'מול 340 איש'),
      body: text(
        'אורות, מוזיקה וצוות אחד בכל פעם. אחרי ההצגות הקהל מצביע בטלפון, והזוכים מקבלים עוד חודש במעבדה.',
      ),
    },
  },
  {
    layout: 'l_bolet_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'הגענו עם רעיון על מפית, ויצאנו עם 800 הזמנות מראש. את הקפיצה הזאת לא היינו עושים לבד.',
      ),
      attribution: text('נועה ברק'),
      caption: text('מייסדת שותפה, גומי · מסלול המוצר, מחזור 7'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_team',
    name: 'הצוות',
    content: {
      caption: [
        text('הצוות'),
        text('מנהלת התוכנית'),
        text('ראש מסלול המוצר'),
        text('מנטורית ראשית'),
        text('מעצב התוכנית'),
      ],
      title: text('האנשים שמאחורי הקפיצה'),
      image: TEAM,
      subtitle: [text('מיכל אדלר'), text('אורי שחם'), text('רותי גולן'), text('איתי בן דוד')],
      body: [
        text('בנתה את קפיצה מהמחזור הראשון, בחדר אחד עם שלושה שולחנות.'),
        text('ייצר צעצועים 15 שנה, ועכשיו מלמד איך מגיעים למדף.'),
        text('ליוותה יותר מ-60 מייסדים, ויודעת מתי לשאול שאלה קשה.'),
        text('אחראי לכל מה שקורה על הבמה, מהתאורה ועד השעון.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_closing',
    name: 'סיום',
    content: {
      caption: [text('ההרשמה פתוחה'), text('hello@kfitza.example · kfitza.example/8')],
      title: text('הקפיצה', 'הבאה שלכם'),
      body: [
        text('ההרשמה למחזור 8 נפתחת ב-1 במרץ'),
        text('ערב היכרות פתוח בכל יום חמישי בשש'),
        text('שאלות? בוגרי מחזור 7 עונים בצ׳אט'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_bolet_hero',
    name: 'Cover',
    content: {
      caption: [
        text('DEMO DAY · COHORT 7'),
        text('The Garage, Holon · 18 February 2027 · doors at six'),
      ],
      title: text('Demo Day', 'Cohort 7'),
      subtitle: text('12 startups, 14 weeks and seven minutes on stage for each team'),
    },
  },
  {
    layout: 'l_bolet_section',
    name: 'What happened',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('What happened'),
      subtitle: text('14 weeks, 12 teams and thousands of sticky notes on the wall.'),
    },
  },
  {
    layout: 'l_bolet_big_number',
    name: 'In numbers',
    content: {
      caption: [
        text('IN NUMBERS'),
        text('startups on stage tonight'),
        text('investors and guests in the hall'),
        text('of the teams are first-time founders'),
      ],
      title: text('Our strongest cohort yet'),
      number: [text('31M'), text('12'), text('340'), text('68%')],
      subtitle: text('shekels raised by demo day'),
      body: text(
        'Nine of the 12 startups have already signed a first round. Last cohort only four got this far, and the total was less than half.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_cards',
    name: 'Three tracks',
    content: {
      caption: [
        text('THE TRACKS'),
        text('TRACK 01 · PRODUCT'),
        text('TRACK 02 · BRAND'),
        text('TRACK 03 · COMMUNITY'),
      ],
      title: text('Three tracks, one cohort'),
      subtitle: [
        text('Products you can hold'),
        text('Brands that speak up'),
        text('Communities that build themselves'),
      ],
      body: [
        text(
          'Materials, packaging and a first run. Four teams left with a working prototype and pre-orders.',
        ),
        text(
          'A name, a voice, a visual language. Five teams built a whole brand, logo to first campaign.',
        ),
        text(
          'Clubs, courses and events. Three teams grew from ten members to thousands in a season.',
        ),
        text(
          'On every track: a mentor at your side, a ₪40K grant and a weekly deadline that never moves.',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_text_image',
    name: 'On stage',
    content: {
      caption: text('ON STAGE'),
      title: text('Seven minutes, not one slide too many'),
      image: { assetId: pictures.boletStage.id },
      subtitle: [
        text('Open with a real problem'),
        text('A live demo, not a video'),
        text('One clear ask'),
      ],
      body: [
        text(
          'Every pitch opens with the story of one customer, with a name and a face. Graphs come once the room cares.',
        ),
        text(
          'The product works on stage, in front of the room, in real time. If something sticks, it gets fixed live.',
        ),
        text(
          'Every team leaves the stage with one number: how much it is raising, why now, and what it will build.',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_chart',
    name: 'Funding',
    content: {
      caption: [
        text('FUNDING'),
        text('Source: Kfitza data, millions of shekels raised by demo day.'),
      ],
      title: text('Funding grows cohort by cohort'),
      number: [text('2.8x'), text('9/12')],
      body: [
        text('the sum raised this cohort, against ₪11M in cohort 6.'),
        text('startups have signed a first round, and three more are in talks.'),
      ],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'Raised by cohort, millions of shekels',
      data: {
        categories: COHORTS_EN,
        series: [
          { name: 'First round', values: ROUNDS },
          { name: 'Grants', values: GRANTS },
        ],
      },
    },
  },
  {
    layout: 'l_bolet_comparison',
    name: 'Before and after',
    content: {
      caption: [text('BEFORE AND AFTER'), text('Day one at the accelerator'), text('Demo day')],
      title: text('What four months can do'),
      subtitle: [text('An idea on a napkin'), text('A product with customers')],
      body: [
        bullets(
          'One slide and three friends',
          'Zero paying customers',
          'A working name and a clip-art logo',
          'Stage fright',
        ),
        bullets(
          'A team of five, each with a clear role',
          '1,200 paying customers on average',
          'A whole brand, from name to packaging',
          'Seven minutes on stage before 340 people',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_table',
    name: 'The program',
    content: {
      caption: [
        text('THE PROGRAM'),
        text('What every team in the cohort receives. Applications for cohort 8 open in March.'),
      ],
      title: text('What every team gets'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['What you get', 'Product', 'Brand', 'Community'],
        ['First grant', '₪40K', '₪40K', '₪40K'],
        ['Mentoring hours', '60', '60', '48'],
        ['Studio and kit', 'Maker lab', 'Photo studio', 'Sound room'],
        ['Budget for tests', '₪15K', '₪25K', '₪10K'],
        ['Days in the office', '5 a week', '4 a week', '3 a week'],
        ['Investor meetings', '12', '12', '8'],
        ['Support after demo day', 'A year', 'A year', 'Six months'],
        ['Places in the cohort', '4', '5', '3'],
      ],
    },
  },
  {
    layout: 'l_bolet_process',
    name: 'How it works',
    content: {
      caption: [
        text('HOW IT WORKS'),
        text('A one-page form and a one-minute video.'),
        text('An interview and a trial week with us.'),
        text('Sprints, mentors and nights in the lab.'),
        text('Selling to real customers, and measuring.'),
        text('Seven minutes before investors and a crowd.'),
      ],
      title: text('From an idea to the stage in five leaps'),
      subtitle: [
        text('Apply'),
        text('Get picked'),
        text('Build'),
        text('Test'),
        text('Take the stage'),
      ],
      number: [text('1 wk'), text('2 wks'), text('10 wks'), text('2 wks'), text('7 min')],
      body: text('Four months from the first form to the moment the stage lights come on.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_section',
    name: 'What’s next',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('What’s next'),
      subtitle: text('Cohort 8, the year ahead, and the people who will lead it.'),
    },
  },
  {
    layout: 'l_bolet_timeline',
    name: 'Road to cohort 8',
    content: {
      caption: [
        text('2027'),
        text('Dates are targets. Updates are published at kfitza.example/8.'),
      ],
      title: text('Four stops before cohort 8'),
      number: [text('Mar'), text('May'), text('Jul'), text('Sep')],
      subtitle: [
        text('Applications open'),
        text('14 teams picked'),
        text('A new lab in Haifa'),
        text('Demo Day 08'),
      ],
      body: [
        text('A one-page form, no deck, and an open meet-up every Thursday.'),
        text('Two more teams than this year, and a fourth track for lasting materials.'),
        text('A workshop with printers, a kiln and a paint room, open to every alum.'),
        text('The stage doubles in size, and tickets open a month ahead.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_full_image',
    name: 'The night',
    content: {
      image: { assetId: pictures.boletScene.id },
      caption: text('THE NIGHT ITSELF'),
      title: text('This is what a leap', 'looks like, times 340'),
      body: text(
        'Lights, music and one team at a time. After the pitches the crowd votes by phone, and the winners get another month in the lab.',
      ),
    },
  },
  {
    layout: 'l_bolet_quote',
    name: 'Quote',
    content: {
      quote: text(
        'We came in with an idea on a napkin and left with 800 pre-orders. We would never have made that leap alone.',
      ),
      attribution: text('Noa Barak'),
      caption: text('Co-founder, Gummy · product track, cohort 7'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_team',
    name: 'The team',
    content: {
      caption: [
        text('THE TEAM'),
        text('Program director'),
        text('Head of the product track'),
        text('Lead mentor'),
        text('Program designer'),
      ],
      title: text('The people behind the leap'),
      image: TEAM,
      subtitle: [
        text('Michal Adler'),
        text('Uri Shacham'),
        text('Ruti Golan'),
        text('Itai Ben David'),
      ],
      body: [
        text('Has built Kfitza since cohort one, in a room with three desks.'),
        text('Made toys for 15 years, and now teaches how to reach the shelf.'),
        text('Has mentored over 60 founders, and knows when to ask the hard one.'),
        text('Runs everything that happens on stage, from the lights to the clock.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_bolet_closing',
    name: 'Closing',
    content: {
      caption: [text('APPLICATIONS OPEN'), text('hello@kfitza.example · kfitza.example/8')],
      title: text('Your next', 'leap'),
      body: [
        text('Applications for cohort 8 open on 1 March'),
        text('An open evening every Thursday at six'),
        text('Questions? Cohort 7 alums answer in the chat'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const boletSamples = { he: sampleHe, en: sampleEn };

/** The Bolet template: the theme, sixteen layouts for both directions, and its sample deck. */
export function boletTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(boletTheme),
    description:
      'Bold: soft neo-brutalism on lilac, ink outlines, hard shadows, candy stickers and starbursts.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.boletScene,
      pictures.boletStage,
      pictures.boletTeam1,
      pictures.boletTeam2,
      pictures.boletTeam3,
      pictures.boletTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
