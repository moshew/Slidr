import type { AssetMeta, Element, Frame, Layout, Shadow, Theme } from '@slidr/model';
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
import { techPictures } from './pictures';
import { technologySamples } from './technology/samples';
import own from './pictures/mutzar.json';

/**
 * The pictures of the sample, by name: this template's own manifest, read directly as well as
 * through the folder's (a dev server that started before the manifest existed does not see it
 * in the folder's).
 */
const manifest: Record<string, AssetMeta> = {
  ...techPictures,
  ...(own as Record<string, AssetMeta>),
};

function picture(name: string): AssetMeta {
  const asset = manifest[name];
  if (!asset) throw new Error(`mutzar: no picture "${name}" in pictures/mutzar.json`);
  return asset;
}

const pictures = {
  builderHe: picture('mutzarBuilderHe'),
  builderEn: picture('mutzarBuilderEn'),
  heroHe: picture('mutzarHeroHe'),
  heroEn: picture('mutzarHeroEn'),
  team: [1, 2, 3, 4].map((n) => picture(`mutzarTeam${n}`)),
};

/**
 * Mutzar (product): the slide is the canvas of a collaborative product. A warm off-white board
 * with a faint grid of dots, and on it the pieces of a modern interface, each doing a job: the
 * opening's title is typed into a command palette, the section's number is printed on a key cap,
 * figures sit in an analytics window, the quote is a comment with its reactions, features are
 * settings panels with their switches on, the roadmap is a release track with GA and BETA badges,
 * the process is an onboarding checklist and the comparison an automation turned off and on.
 * The founders wear the name tags of multiplayer cursors, and those cursors, toasts and key caps
 * float around the slides. One vivid coral for what matters, ink for the words and a soft violet
 * beside them. For SaaS launches, product demos, release keynotes, roadmaps and onboarding.
 *
 * The interface's own words (a toast, a badge, a cursor's name) are drawn as SVG text, in the
 * deck's language: the right-to-left drawings say them in Hebrew, and the layouts of a
 * left-to-right deck take a drawing of their own, in English, laid out for that direction.
 */
export const mutzarTheme: Theme = {
  id: 'mutzar',
  name: 'Mutzar',
  colors: {
    bg: '#f6f4ef',
    surface: '#ffffff',
    text: '#18171d',
    muted: '#5b5862',
    primary: '#201e2a',
    secondary: '#f4512f',
    accent: '#6f5ef0',
    chart: ['#f4512f', '#6f5ef0', '#12a073', '#ffb547', '#201e2a', '#a8a4ad'],
  },
  // Rubik's round Hebrew with DM Sans for the Latin and the figures of what is said aloud, and
  // Assistant with Inter for what is read: the faces of a product's own interface.
  fonts: {
    heading: { he: 'Rubik', latin: 'DM Sans' },
    body: { he: 'Assistant', latin: 'Inter' },
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
  shadow: { x: 0, y: 20, blur: 50, color: { value: '#3b2414', alpha: 0.12 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    SURFACE,
    {
      // The board under a coral spotlight, from the corner of the end side.
      fill: { kind: 'solid', color: { token: 'bg' } },
      overlay: {
        kind: 'radial',
        center: { x: 0, y: 0 },
        stops: [
          { color: { token: 'secondary', alpha: 0.1 }, at: 0 },
          { color: { token: 'secondary', alpha: 0 }, at: 0.75 },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// The colours of the drawings

const CORAL = '#f4512f';
const VIOLET = '#6f5ef0';
const INK = '#18171d';
const MUTED = '#5b5862';
const CANVAS = '#f6f4ef';
const WHITE = '#ffffff';
/**
 * Colours the theme has no token for: the green of what succeeded, the fourth cursor, the
 * window's lights, a key's edge.
 */
const MINT = '#12a073';
const AMBER = '#ffb547';
const LIGHTS = ['#ff5f57', '#febc2e', '#28c840'] as const;
const KEY_EDGE = '#e4ded3';
const MASK = '#fefefe';

const PAINT = {
  [CORAL]: token('secondary'),
  [VIOLET]: token('accent'),
  [INK]: token('text'),
  [MUTED]: token('muted'),
  [CANVAS]: token('bg'),
  [WHITE]: token('surface'),
};

/** The interface's face: Inter, with Assistant for the Hebrew letters it does not have. */
const UI = 'font-family="Inter, Assistant, sans-serif"';

type Dir = 'rtl' | 'ltr';
/** Words of the interface, in both languages. */
type Words = { he: string; en: string };
const w2 = (he: string, en: string): Words => ({ he, en });

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A drawing. Its letters keep their own direction whatever the slide's. */
const svg = (w: number, h: number, body: string) =>
  `<svg viewBox="0 0 ${w} ${h}" fill="none" direction="ltr" unicode-bidi="isolate">${body}</svg>`;

/**
 * The drawings that hold letters: the mirror of a left-to-right deck turns them back, and takes
 * the drawing for that direction where one is given.
 */
const READABLE = new Map<string, string | undefined>();

function lettered(id: string, frame: Frame, markup: string | ((dir: Dir) => string)): Element {
  const rtl = typeof markup === 'string' ? markup : markup('rtl');
  READABLE.set(id, typeof markup === 'string' ? undefined : markup('ltr'));
  return drawing(id, frame, rtl, PAINT);
}

/**
 * A drawing that has no direction of its own: an icon, a check, a key's glyph. The mirror of a
 * left-to-right deck moves it to the other side and leaves it as it is; only what points the
 * way the slide reads (an arrow, a switch, a cursor, a line of time) is drawn turned.
 */
const still = (id: string, frame: Frame, markup: string) => lettered(id, frame, markup);

/** Where a box `bw` wide whose start edge is `s` from the start of a drawing `w` wide begins. */
const bx = (dir: Dir, w: number, s: number, bw = 0) => (dir === 'rtl' ? w - s - bw : s);

/**
 * A line of interface text. `s` is the distance of its anchor from the drawing's start edge,
 * and `anchor` is said the way the line reads: `start` is where its first letter is.
 */
function say(
  dir: Dir,
  w: number,
  s: number,
  y: number,
  size: number,
  words: Words | string,
  attrs = '',
  anchor: 'start' | 'middle' | 'end' = 'start',
): string {
  const t = esc(typeof words === 'string' ? words : dir === 'rtl' ? words.he : words.en);
  const x = dir === 'rtl' ? w - s : s;
  const d = dir === 'rtl' ? 'direction="rtl" ' : '';
  return `<text x="${x}" y="${y}" ${d}text-anchor="${anchor}" ${UI} font-size="${size}" ${attrs}>${t}</text>`;
}

/** About how wide a short line of interface text is. */
const wide = (words: string, size: number) => Math.round([...words].length * size * 0.56);

// ---------------------------------------------------------------------------------------------
// Icons: strokes on a 24-pixel grid

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16 16"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  sparkles:
    '<path d="M11 3.5l1.8 4.9 4.9 1.8-4.9 1.8L11 16.9l-1.8-4.9-4.9-1.8 4.9-1.8z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  bolt: '<path d="M13 2.5 4.5 13.5h7l-1 8 8.5-11h-7z"/>',
  plug: '<path d="M9 3v5M15 3v5M6 8h12v3.5a6 6 0 0 1-12 0zM12 17.5V21"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>',
  shield:
    '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  page: '<path d="M6 2.5h8l5 5v14H6z"/><path d="M14 2.5v5h5M9 13h7M9 17h5"/>',
  flow: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><path d="M10 6.5h3.5a3 3 0 0 1 3 3V14"/>',
  enter: '<path d="M19 5v7a3 3 0 0 1-3 3H5"/><path d="M9 11l-4 4 4 4"/>',
  command: '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  heart:
    '<path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
  thumb:
    '<path d="M7 10v10H4V10zM7 10l4-7c1.7 0 2.6 1.1 2.3 2.8L12.8 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/>',
  smile:
    '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c.9 1.2 2 1.8 3.5 1.8s2.6-.6 3.5-1.8M9 9.5h.01M15 9.5h.01"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  send: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  tag: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9z"/><circle cx="8" cy="8" r="1.6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
  chart: '<path d="M4 20h17M7 16v-5M12 16V6M17 16v-8"/>',
  bell: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 21h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  dots: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  filter: '<path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>',
} as const;
type Icon = keyof typeof ICONS;

/** An icon at (x, y), `size` pixels square, stroked in `color`. */
const icon = (name: Icon, x: number, y: number, size: number, color: string, weight = 2) =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})" stroke="${color}" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round" fill="none">${ICONS[name]}</g>`;

// ---------------------------------------------------------------------------------------------
// The pieces of the interface

const HAIR = { color: token('text', 0.08), width: 1.5 };
const LIFT: Shadow = { x: 0, y: 26, blur: 64, color: { value: '#3b2414', alpha: 0.11 } };
const LIFT_SM: Shadow = { x: 0, y: 10, blur: 26, color: { value: '#3b2414', alpha: 0.1 } };
const WHITE_FILL = solid(token('surface'));
const CORAL_FILL = solid(token('secondary'));
const PRIMARY_FILL = solid(token('primary'));

/** The board: a grid of dots, fading out away from the middle. */
function board(name: string): Element {
  const body =
    `<defs><pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="1.6" fill="${INK}" fill-opacity=".2"/></pattern>` +
    `<radialGradient id="f" cx="50%" cy="46%" r="72%"><stop offset="0" stop-color="${MASK}"/><stop offset=".7" stop-color="${MASK}" stop-opacity=".75"/><stop offset="1" stop-color="${MASK}" stop-opacity=".3"/></radialGradient>` +
    `<mask id="m"><rect width="1920" height="1080" fill="url(#f)"/></mask></defs>` +
    `<rect width="1920" height="1080" fill="url(#g)" mask="url(#m)"/>`;
  return drawing(`d_mutzar_${name}_board`, at(0, 0, 1920, 1080), svg(1920, 1080, body), PAINT);
}

/** A soft pool of colour on the board. */
function glow(id: string, frame: Frame, color: string, alpha: number): Element {
  const { w, h } = frame;
  return drawing(
    id,
    frame,
    svg(
      w,
      h,
      `<defs><radialGradient id="r"><stop offset="0" stop-color="${color}" stop-opacity="${alpha}"/><stop offset=".55" stop-color="${color}" stop-opacity="${alpha * 0.45}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient></defs>` +
        `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="url(#r)"/>`,
    ),
    PAINT,
  );
}

/** A white panel of the interface, lifted off the board. */
const panel = (id: string, frame: Frame, radius = 24, shadow: Shadow = LIFT) =>
  rect(id, frame, WHITE_FILL, { stroke: HAIR, effects: { radius, shadow } });

/**
 * Panels side by side: every shadow first, then every face over them, so no panel's shadow falls
 * across its neighbour.
 */
function panels(
  items: [id: string, frame: Frame][],
  radius: number,
  shadow: Shadow = LIFT_SM,
): Element[] {
  return [
    ...items.map(([id, frame]) =>
      rect(`${id}_shadow`, frame, WHITE_FILL, { effects: { radius, shadow } }),
    ),
    ...items.map(([id, frame]) =>
      rect(id, frame, WHITE_FILL, { stroke: HAIR, effects: { radius } }),
    ),
  ];
}

/**
 * A browser window: the panel, its bar with the lights at the start and the address in the
 * middle, and the hairline under the bar.
 */
function browser(
  name: string,
  frame: Frame,
  url: string,
  extra?: (dir: Dir, w: number) => string,
): Element[] {
  const { w } = frame;
  const bar = (dir: Dir) =>
    svg(
      w,
      52,
      LIGHTS.map(
        (c, i) => `<circle cx="${bx(dir, w, 28 + i * 22)}" cy="26" r="6.5" fill="${c}"/>`,
      ).join('') +
        (url
          ? `<rect x="${w / 2 - 170}" y="12" width="340" height="28" rx="14" fill="${CANVAS}"/>` +
            icon('lock', w / 2 - 6 - wide(url, 15) / 2 - 12, 18.5, 15, MUTED, 2.2) +
            `<text x="${w / 2 + 6}" y="31" text-anchor="middle" ${UI} font-size="15" fill="${MUTED}">${esc(url)}</text>`
          : '') +
        (extra ? extra(dir, w) : ''),
    );
  return [
    panel(`d_mutzar_${name}_window`, frame, 22),
    rect(
      `d_mutzar_${name}_window_rule`,
      { x: frame.x, y: frame.y + 52, w, h: 1 },
      solid(token('text', 0.08)),
    ),
    lettered(`d_mutzar_${name}_window_bar`, { x: frame.x, y: frame.y, w, h: 52 }, bar),
  ];
}

/**
 * A multiplayer cursor: the arrow, pointing up and towards the start, and its name tag. The
 * frame's top corner at the start side is the arrow's tip.
 */
function cursor(
  id: string,
  top: [number, number],
  color: string,
  name: Words,
  ink = WHITE,
): Element {
  const size = 18;
  const tw = Math.max(wide(name.he, size), wide(name.en, size)) + 28;
  const w = 18 + tw;
  const h = 66;
  const arrow = 'M2 2v26l7-6.6 4.6 10.4 4.6-2-4.6-10.2H23z';
  const draw = (dir: Dir) =>
    svg(
      w,
      h,
      `<g transform="${dir === 'rtl' ? `translate(${w} 0) scale(-1 1)` : ''}"><path d="${arrow}" fill="${color}" stroke="${WHITE}" stroke-width="2.4" stroke-linejoin="round"/></g>` +
        `<rect x="${bx(dir, w, 16, tw)}" y="28" width="${tw}" height="34" rx="10" fill="${color}"/>` +
        say(dir, w, 30, 51, size, name, `font-weight="600" fill="${ink}"`),
    );
  // The tip is at the frame's start corner.
  const [start, y] = top;
  return lettered(id, at(start - 2, y - 2, w, h), draw);
}

/** A key cap: its face, the edge under it and its shadow, with a glyph on it. */
function keycap(
  id: string,
  frame: Frame,
  glyph: (cx: number, cy: number, s: number) => string,
  tilt = 0,
): Element {
  const { w, h } = frame;
  // Room for the shadow, and for the corners of a tilted key.
  const pad = Math.round(
    Math.max(w, h) * (0.11 + Math.abs(Math.sin((tilt * Math.PI) / 180)) * 0.5),
  );
  const kw = w - 2 * pad;
  const kh = h - 2 * pad;
  const r = Math.min(kw, kh) * 0.2;
  const face = kh - kh * 0.1;
  const body =
    `<defs><filter id="s" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="${kh * 0.05}" stdDeviation="${kh * 0.035}" flood-color="#3b2414" flood-opacity=".2"/></filter>` +
    `<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${WHITE}"/><stop offset="1" stop-color="#f7f5f1"/></linearGradient></defs>` +
    `<g transform="rotate(${tilt} ${w / 2} ${h / 2})" filter="url(#s)">` +
    `<rect x="${pad}" y="${pad}" width="${kw}" height="${kh}" rx="${r}" fill="${KEY_EDGE}"/>` +
    `<rect x="${pad}" y="${pad}" width="${kw}" height="${face}" rx="${r}" fill="url(#t)" stroke="${INK}" stroke-opacity=".08" stroke-width="1.5"/>` +
    glyph(w / 2, pad + face / 2, Math.min(kw, face)) +
    `</g>`;
  return lettered(id, frame, svg(w, h, body));
}

const keyIcon =
  (name: Icon, color = INK) =>
  (cx: number, cy: number, s: number) =>
    icon(name, cx - s * 0.2, cy - s * 0.2, s * 0.4, color, 2.1);
const keyLetter = (letter: string) => (cx: number, cy: number, s: number) =>
  `<text x="${cx}" y="${cy + s * 0.15}" text-anchor="middle" font-family="'DM Sans', Inter, sans-serif" font-weight="600" font-size="${s * 0.42}" fill="${INK}">${letter}</text>`;

/** A switch: on (coral, the knob at the end side) or off. */
function toggle(id: string, frame: Frame, on: boolean): Element {
  const { w, h } = frame;
  const r = h / 2;
  const body =
    `<defs><filter id="k" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#3b2414" flood-opacity=".25"/></filter></defs>` +
    `<rect width="${w}" height="${h}" rx="${r}" fill="${on ? CORAL : INK}" fill-opacity="${on ? 1 : 0.14}"/>` +
    `<circle cx="${on ? r : w - r}" cy="${r}" r="${r - 4}" fill="${WHITE}" filter="url(#k)"/>`;
  return drawing(id, frame, svg(w, h, body), PAINT);
}

/** A badge of a release or a feature: NEW, BETA, GA. */
function badge(id: string, frame: Frame, words: Words, color: string, filled = false): Element {
  const { w, h } = frame;
  return lettered(id, frame, (dir) =>
    svg(
      w,
      h,
      `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="${(h - 2) / 2}" fill="${color}" fill-opacity="${filled ? 1 : 0.13}"/>` +
        say(
          dir,
          w,
          w / 2,
          h / 2 + 5.5,
          16,
          words,
          `font-weight="700" letter-spacing="${dir === 'rtl' ? 0 : 1}" fill="${filled ? WHITE : color}"`,
          'middle',
        ),
    ),
  );
}

/** A square of colour with a white icon in it: the mark of a feature or a step. */
function tile(id: string, frame: Frame, name: Icon, color: string, soft = false): Element {
  const s = frame.w;
  return still(
    id,
    frame,
    svg(
      s,
      s,
      `<rect width="${s}" height="${s}" rx="${s * 0.28}" fill="${color}" fill-opacity="${soft ? 0.13 : 1}"/>` +
        icon(name, s * 0.24, s * 0.24, s * 0.52, soft ? color : WHITE, 2.1),
    ),
  );
}

/** A toast of the interface: a check in a green circle, a message and a link. */
function toast(name: string, frame: Frame, message: Words, link: Words): Element[] {
  const { w, h } = frame;
  const draw = (dir: Dir) =>
    svg(
      w,
      h,
      `<circle cx="${bx(dir, w, 38)}" cy="${h / 2}" r="16" fill="${MINT}"/>` +
        `<path d="M${bx(dir, w, 38) - 7} ${h / 2}l4.6 4.6 9-9" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
        say(dir, w, 68, h / 2 + 7, 19, message, `font-weight="600" fill="${INK}"`) +
        say(dir, w, w - 24, h / 2 + 7, 17, link, `font-weight="600" fill="${CORAL}"`, 'end'),
    );
  return [
    rect(`d_mutzar_${name}_toast_box`, frame, WHITE_FILL, {
      stroke: HAIR,
      effects: { radius: 16, shadow: LIFT_SM },
    }),
    lettered(`d_mutzar_${name}_toast`, frame, draw),
  ];
}

/** The mark of the deck: a coral tile with two steps of a flow joined. */
const mark = (id: string, frame: Frame) =>
  drawing(
    id,
    frame,
    svg(
      40,
      40,
      `<rect width="40" height="40" rx="11" fill="${CORAL}"/>` +
        `<circle cx="12" cy="13" r="4.2" fill="${WHITE}"/><circle cx="28" cy="27" r="4.2" fill="${WHITE}"/>` +
        `<path d="M16 13h4.5c4 0 4 14 8 14" stroke="${WHITE}" stroke-width="3" stroke-linecap="round"/>`,
    ),
    PAINT,
    { role: 'logo', name: 'logo' },
  );

/** Who else is on the board, and the share button, at the top of the end side. */
function presence(name: string, frame: Frame = atEnd(END, 74, 248, 48)): Element {
  const w = 248;
  const h = 48;
  const people: [string, Words][] = [
    [CORAL, w2('נ', 'N')],
    [VIOLET, w2('א', 'E')],
    [MINT, w2('מ', 'M')],
  ];
  const draw = (dir: Dir) =>
    svg(
      w,
      h,
      people
        .map(([c, letter], i) => {
          const cx = bx(dir, w, 24 + i * 30);
          return (
            `<circle cx="${cx}" cy="24" r="21" fill="${c}" stroke="${CANVAS}" stroke-width="3.5"/>` +
            `<text x="${cx}" y="30.5" text-anchor="middle" ${UI} font-size="17" font-weight="700" fill="${WHITE}">${dir === 'rtl' ? letter.he : letter.en}</text>`
          );
        })
        .join('') +
        `<rect x="${bx(dir, w, 124, 124)}" y="4" width="124" height="40" rx="20" fill="${INK}"/>` +
        say(
          dir,
          w,
          186,
          30,
          17,
          w2('שיתוף', 'Share'),
          `font-weight="600" fill="${WHITE}"`,
          'middle',
        ),
    );
  return lettered(`d_mutzar_${name}_presence`, frame, draw);
}

// ---------------------------------------------------------------------------------------------
// What the layouts share

/** The start of the text column and the end margin. */
const START = 120;
const END = 120;
const WIDTH = 1920 - START - END;

/**
 * The kicker with a live dot before it, and the title under it, with room for two lines: the
 * content of every layout starts below the second line.
 */
function head(name: string, width = 1180) {
  return {
    placeholders: [
      place('p_kicker', 'caption', at(START + 30, 80, Math.min(900, width - 30), 34), 'caption'),
      place('p_title', 'title', at(START, 116, width, 136), 'title'),
    ],
    decorations: liveDot(name, 80),
  };
}

function liveDot(name: string, top: number): Element[] {
  return [
    dot(
      `d_mutzar_${name}_live_halo`,
      at(START - 3, top + 4, 26, 26),
      solid(token('secondary', 0.18)),
    ),
    dot(`d_mutzar_${name}_live`, at(START + 3, top + 10, 14, 14), CORAL_FILL),
  ];
}

/** The foot of a content slide: the mark and the deck's name, and the slide's number on a key. */
function foot(name: string) {
  return {
    placeholders: [place('p_footer', 'footer', at(START + 56, 960, 900, 34), 'caption')],
    decorations: [
      mark(`d_mutzar_${name}_mark`, at(START, 957, 40, 40)),
      rect(`d_mutzar_${name}_folio_edge`, atEnd(END, 956, 80, 52), solid({ value: KEY_EDGE }), {
        effects: { radius: 12, shadow: LIFT_SM },
      }),
      rect(`d_mutzar_${name}_folio`, atEnd(END, 950, 80, 52), WHITE_FILL, {
        stroke: HAIR,
        effects: { radius: 12 },
      }),
      pageNumber(`d_mutzar_${name}_number`, atEnd(END, 958, 80, 34), 'caption', {
        color: token('text'),
        weight: 600,
        align: 'center',
      }),
    ],
  };
}

// ---------------------------------------------------------------------------------------------
// The larger drawings

/** The rising curve of an analytics card, with its grid and a highlighted last point. */
function areaChart(id: string, frame: Frame): Element {
  const { w, h } = frame;
  const pts = [0.08, 0.12, 0.1, 0.19, 0.24, 0.22, 0.34, 0.41, 0.39, 0.52, 0.61, 0.66, 0.79, 0.9];
  const left = 8;
  const right = w - 24;
  const top = 24;
  const bottom = h - 18;
  const xy = pts.map(
    (v, i) =>
      [left + (i * (right - left)) / (pts.length - 1), bottom - v * (bottom - top)] as const,
  );
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const [lx, ly] = xy[xy.length - 1]!;
  const grid = [0, 1, 2, 3]
    .map(
      (i) =>
        `<path d="M${left} ${top + (i * (bottom - top)) / 3}H${right}" stroke="${INK}" stroke-opacity=".07" stroke-width="1.5" stroke-dasharray="${i === 3 ? '' : '4 6'}"/>`,
    )
    .join('');
  // Drawn for right to left: the curve rises towards the end side, where time runs on.
  const body =
    `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CORAL}" stop-opacity=".26"/><stop offset="1" stop-color="${CORAL}" stop-opacity="0"/></linearGradient></defs>` +
    grid +
    `<g transform="translate(${w} 0) scale(-1 1)">` +
    `<path d="${line}L${right} ${bottom}L${left} ${bottom}Z" fill="url(#a)"/>` +
    `<path d="${line}" stroke="${CORAL}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M${lx} ${ly}V${bottom}" stroke="${CORAL}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="3 5"/>` +
    `<circle cx="${lx}" cy="${ly}" r="18" fill="${CORAL}" fill-opacity=".16"/>` +
    `<circle cx="${lx}" cy="${ly}" r="8" fill="${WHITE}" stroke="${CORAL}" stroke-width="4"/>` +
    `</g>`;
  return drawing(id, frame, svg(w, h, body), PAINT);
}

/**
 * The way a piece of work takes, drawn at the foot of the comparison: by hand a line that loops
 * back on itself on its way, automated a straight run with its data on it and a check at the
 * end. Drawn for right to left: it starts at the right.
 */
function workPath(id: string, frame: Frame, tidy: boolean): Element {
  const { w, h } = frame;
  const y = h / 2;
  const x0 = w - 14;
  const x1 = 14;
  // The way runs from the start side to the end side; the check at its end stays a check.
  const turn = (dir: Dir, body: string) =>
    dir === 'rtl' ? body : `<g transform="translate(${w} 0) scale(-1 1)">${body}</g>`;
  const end = (dir: Dir) => (dir === 'rtl' ? x1 + 10 : w - x1 - 10);
  if (tidy) {
    const line =
      `<path d="M${x0} ${y}H${x1 + 24}" stroke="${CORAL}" stroke-width="3.5" stroke-linecap="round"/>` +
      `<circle cx="${x0}" cy="${y}" r="7" fill="${CORAL}"/>` +
      [0.28, 0.5, 0.72]
        .map((t) => `<circle cx="${x0 - t * (x0 - x1)}" cy="${y}" r="5" fill="${WHITE}"/>`)
        .join('');
    return lettered(id, frame, (dir) =>
      svg(
        w,
        h,
        turn(dir, line) +
          `<circle cx="${end(dir)}" cy="${y}" r="15" fill="${MINT}"/>` +
          icon('check', end(dir) - 9, y - 9, 18, WHITE, 3),
      ),
    );
  }
  // A prolate trochoid: where its swing is wider than its step, it loops back on itself.
  const turns = 5;
  const pts = Array.from({ length: 401 }, (_, i) => {
    const t = i / 400;
    const th = t * Math.PI * 2 * turns;
    const reach = Math.sin(Math.PI * t) ** 0.4 * (1 + 0.25 * Math.sin(t * 13));
    const x = x0 - t * (x0 - x1) - 50 * reach * Math.sin(th);
    const yy = y - 19 * reach * Math.cos(th) + 6 * reach;
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(1)}`;
  }).join('');
  const body =
    `<path d="${pts}" stroke="${INK}" stroke-opacity=".32" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="${x0}" cy="${y}" r="7" fill="${INK}" fill-opacity=".35"/>` +
    `<circle cx="${x1}" cy="${y}" r="7" fill="${WHITE}" stroke="${INK}" stroke-opacity=".35" stroke-width="2.5"/>`;
  return drawing(id, frame, svg(w, h, body), PAINT);
}

/** A person's silhouette in a round avatar with a warm gradient. */
function avatar(id: string, frame: Frame): Element {
  const s = frame.w;
  return drawing(
    id,
    frame,
    svg(
      s,
      s,
      `<defs><linearGradient id="v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${AMBER}"/><stop offset="1" stop-color="${CORAL}"/></linearGradient><clipPath id="c"><circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}"/></clipPath></defs>` +
        `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="url(#v)"/>` +
        `<g clip-path="url(#c)" fill="${WHITE}" fill-opacity=".92"><circle cx="${s / 2}" cy="${s * 0.4}" r="${s * 0.17}"/><ellipse cx="${s / 2}" cy="${s * 0.98}" rx="${s * 0.34}" ry="${s * 0.3}"/></g>`,
    ),
    PAINT,
  );
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const cards3 = [START, START + 572, START + 1144];
const columns4 = [START, START + 429, START + 858, START + 1286];
const steps5 = [0, 1, 2, 3, 4].map((i) => START + i * 336);
const rows3 = [296, 504, 712];
const buttons3 = [470, 594, 718];
const PEOPLE = [CORAL, VIOLET, MINT, AMBER] as const;
const NAMES: Words[] = [
  w2('נועה', 'Noa'),
  w2('יואב', 'Yoav'),
  w2('איתן', 'Eitan'),
  w2('מאיה', 'Maya'),
];

/** The text layout's window: the document, from margin to margin, down to over the foot. */
const PAGE = at(START, 236, WIDTH, 690);

/** Where the opening's command palette starts: at the end side, beside the title. */
const PALETTE = 1920 - END - 700;

/** The suggestions of the palette: an icon, its colour, what it does and its shortcut. */
const PALETTE_ROWS: [Icon, string, Words, string][] = [
  ['sparkles', CORAL, w2('פרסום גרסה 2.0 לכל הצוותים', 'Publish 2.0 to every team'), ''],
  ['users', VIOLET, w2('הזמנת הצוות לסביבת העבודה', 'Invite your team'), 'I'],
  ['chart', MINT, w2('פתיחת מפת הדרכים', 'Open the roadmap'), 'R'],
  ['bolt', AMBER, w2('הפעלת סוכן AI', 'Turn on an AI agent'), 'A'],
];

/** One suggestion of the palette, 676 wide: its icon, its words and, but for the first, its keys. */
function paletteRow(
  dir: Dir,
  name: Icon,
  color: string,
  words: Words,
  key: string,
  on: boolean,
): string {
  const w = 676;
  const keys = key
    ? [0, 1]
        .map((i) => {
          const x = bx(dir, w, w - 18 - (i === 0 ? 76 : 36), 34);
          return `<rect x="${x}" y="17" width="34" height="34" rx="8" fill="${CANVAS}" stroke="${INK}" stroke-opacity=".1"/>`;
        })
        .join('') +
      icon('command', bx(dir, w, w - 94 + 8, 18), 25, 18, MUTED, 2) +
      `<text x="${bx(dir, w, w - 54 + 17)}" y="40" text-anchor="middle" ${UI} font-size="16" font-weight="600" fill="${MUTED}">${key}</text>`
    : '';
  return svg(
    w,
    68,
    `<rect x="${bx(dir, w, 16, 44)}" y="12" width="44" height="44" rx="12" fill="${color}" fill-opacity="${on ? 1 : 0.15}"/>` +
      icon(
        name,
        bx(dir, w, 26, 24),
        22,
        24,
        on ? WHITE : color === AMBER ? '#c98317' : color,
        2.1,
      ) +
      say(
        dir,
        w,
        78,
        41,
        21,
        words,
        `font-weight="${on ? 600 : 500}" fill="${INK}" fill-opacity="${on ? 1 : 0.75}"`,
      ) +
      keys,
  );
}

function layouts(): Layout[] {
  const textWindow = atEnd(END, 84, 676, 836);
  const shot = { x: 96, y: 96, w: 1728, h: 568 };
  return [
    {
      id: 'l_mutzar_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        // Every word of the slide stands on its own ground at the start side, so it reads on
        // whatever ground or picture a deck brings to the end side, where the palette is.
        place('p_kicker', 'caption', at(START + 104, 251, 760, 34), 'caption'),
        place('p_title', 'title', at(START, 300, 900, 240), 'display'),
        place('p_subtitle', 'subtitle', at(START, 562, 860, 140), 'heading'),
        place('p_meta', 'caption', at(START + 62, 752, 760, 34), 'caption'),
      ],
      decorations: [
        board('hero'),
        glow('d_mutzar_hero_glow', atEnd(0, 120, 1000, 900), CORAL, 0.2),
        glow('d_mutzar_hero_glow2', at(200, 0, 1000, 560), VIOLET, 0.08),
        badge('d_mutzar_hero_new', at(START, 250, 86, 36), w2('חדש', 'NEW'), CORAL, true),
        avatar('d_mutzar_hero_presenter', at(START, 747, 44, 44)),
        rect('d_mutzar_hero_palette', at(PALETTE, 236, 700, 494), WHITE_FILL, {
          stroke: HAIR,
          effects: {
            radius: 28,
            shadow: { x: 0, y: 40, blur: 90, color: { value: '#3b2414', alpha: 0.14 } },
          },
        }),
        still(
          'd_mutzar_hero_search',
          at(PALETTE + 26, 261, 44, 44),
          svg(44, 44, icon('search', 4, 4, 36, CORAL, 2.4)),
        ),
        // The palette's empty field: the caret, and what it asks for.
        lettered('d_mutzar_hero_query', at(PALETTE + 82, 263, 500, 40), (dir) =>
          svg(
            500,
            40,
            `<rect x="${bx(dir, 500, 4, 3)}" y="7" width="3" height="27" rx="1.5" fill="${CORAL}"/>` +
              say(
                dir,
                500,
                18,
                28,
                22,
                w2('חיפוש או פקודה…', 'Search or type a command…'),
                `fill="${MUTED}"`,
              ),
          ),
        ),
        lettered(
          'd_mutzar_hero_shortcut',
          at(PALETTE + 700 - 24 - 66, 267, 66, 32),
          svg(
            66,
            32,
            `<rect x="1" y="1" width="64" height="30" rx="8" fill="${CANVAS}" stroke="${INK}" stroke-opacity=".1"/>` +
              icon('command', 12, 8, 16, MUTED, 2) +
              `<text x="45" y="22" text-anchor="middle" ${UI} font-size="16" font-weight="600" fill="${MUTED}">K</text>`,
          ),
        ),
        rect('d_mutzar_hero_rule', at(PALETTE, 322, 700, 1), solid(token('text', 0.08))),
        lettered('d_mutzar_hero_group', at(PALETTE + 30, 336, 300, 24), (dir) =>
          svg(
            300,
            24,
            say(
              dir,
              300,
              0,
              18,
              15,
              w2('הצעות', 'SUGGESTED'),
              `font-weight="600" letter-spacing="${dir === 'rtl' ? 0 : 1.2}" fill="${MUTED}"`,
            ),
          ),
        ),
        rect(
          'd_mutzar_hero_selected',
          at(PALETTE + 12, 366, 676, 76),
          solid(token('secondary', 0.08)),
          {
            effects: { radius: 14 },
          },
        ),
        rect('d_mutzar_hero_selected_bar', at(PALETTE + 12, 384, 4, 40), CORAL_FILL, {
          effects: { radius: 2 },
        }),
        ...PALETTE_ROWS.map(([name, color, words, key], i) =>
          lettered(`d_mutzar_hero_row${i + 1}`, at(PALETTE + 12, 370 + i * 70, 676, 68), (dir) =>
            paletteRow(dir, name, color, words, key, i === 0),
          ),
        ),
        keycap('d_mutzar_hero_enter', at(PALETTE + 700 - 12 - 96, 372, 88, 72), keyIcon('enter')),
        rect('d_mutzar_hero_foot_rule', at(PALETTE, 664, 700, 1), solid(token('text', 0.08))),
        lettered('d_mutzar_hero_hints', at(PALETTE + 30, 681, 640, 30), (dir) => {
          const w = 640;
          const key = (k: number, kw: number, glyph: string) =>
            `<rect x="${bx(dir, w, k, kw)}" y="1" width="${kw}" height="28" rx="7" fill="${CANVAS}" stroke="${INK}" stroke-opacity=".1"/>` +
            `<text x="${bx(dir, w, k + kw / 2)}" y="20.5" text-anchor="middle" ${UI} font-size="15" font-weight="600" fill="${MUTED}">${glyph}</text>`;
          // From the start: the arrows and what they do, the return key, and escape at the end.
          return svg(
            w,
            30,
            key(0, 30, '↑') +
              say(dir, w, 40, 20, 16, w2('ניווט', 'move'), `fill="${MUTED}"`) +
              key(130, 30, '↵') +
              say(dir, w, 170, 20, 16, w2('לבחירה', 'to select'), `fill="${MUTED}"`) +
              key(w - 44, 44, 'esc'),
          );
        }),
        keycap('d_mutzar_hero_cmd', atEnd(130, 18, 230, 230), keyIcon('command'), -9),
        keycap('d_mutzar_hero_k', atEnd(318, 52, 210, 210), keyLetter('K'), 7),
        cursor('d_mutzar_hero_cursor1', [1920 - 330, 168], VIOLET, NAMES[1]!),
        ...toast(
          'hero',
          atEnd(END + 20, 770, 450, 76),
          w2('גרסה 2.0 באוויר', 'Version 2.0 is live'),
          w2('לצפייה', 'View'),
        ),
        cursor('d_mutzar_hero_cursor2', [1920 - 206, 822], CORAL, NAMES[0]!),
      ],
    },
    {
      id: 'l_mutzar_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        place('p_number', 'number', atEnd(270, 400, 360, 180), 'display', {
          align: 'center',
          vAlign: 'middle',
          color: token('secondary'),
        }),
        place('p_kicker', 'caption', at(START + 30, 334, 760, 34), 'caption'),
        place('p_title', 'title', at(START, 380, 960, 240), 'display', { vAlign: 'middle' }),
        place('p_subtitle', 'subtitle', at(START, 642, 900, 110), 'heading'),
      ],
      decorations: [
        board('section'),
        glow('d_mutzar_section_glow', atEnd(20, 120, 880, 820), CORAL, 0.16),
        ...liveDot('section', 334),
        keycap('d_mutzar_section_key', atEnd(150, 232, 600, 560), () => ''),
        lettered('d_mutzar_section_legend', atEnd(256, 336, 388, 30), (dir) =>
          svg(
            392,
            30,
            say(
              dir,
              392,
              8,
              22,
              18,
              w2('פרק', 'PART'),
              `font-weight="600" letter-spacing="${dir === 'rtl' ? 0 : 1.5}" fill="${MUTED}"`,
            ),
          ),
        ),
        still(
          'd_mutzar_section_legend_mark',
          atEnd(262, 618, 40, 40),
          svg(40, 40, icon('enter', 6, 6, 28, MUTED, 2)),
        ),
        keycap('d_mutzar_section_cmd', atEnd(70, 130, 220, 220), keyIcon('command'), -12),
        keycap('d_mutzar_section_k', atEnd(600, 700, 200, 190), keyLetter('K'), 10),
        cursor('d_mutzar_section_cursor', [1920 - 596, 650], MINT, NAMES[3]!),
      ],
    },
    {
      id: 'l_mutzar_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head('big_number').placeholders,
        place('p_number', 'number', at(START + 48, 338, 920, 124), 'display', {
          color: token('secondary'),
        }),
        place('p_label', 'subtitle', at(START + 48, 466, 920, 53), 'heading'),
        place('p_body', 'body', at(START + 48, 528, 900, 135), 'body'),
        ...cards3.flatMap((start, i) => [
          place(`p_stat${i + 1}`, 'number', at(start + 104, 730, 404, 79), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', at(start + 30, 814, 478, 68), 'caption'),
        ]),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        board('big_number'),
        ...head('big_number').decorations,
        presence('big_number'),
        ...browser('big_number', at(START, 268, WIDTH, 424), 'zrima.app/insights'),
        areaChart('d_mutzar_big_number_curve', atEnd(END + 36, 338, 640, 330)),
        ...panels(
          cards3.map((start, i) => [`d_mutzar_big_number_tile${i + 1}`, at(start, 712, 536, 192)]),
          20,
        ),
        ...cards3.flatMap((start, i) => [
          tile(
            `d_mutzar_big_number_icon${i + 1}`,
            at(start + 30, 740, 56, 56),
            (['users', 'clock', 'shield'] as const)[i]!,
            [CORAL, VIOLET, MINT][i]!,
            true,
          ),
        ]),
        ...foot('big_number').decorations,
      ],
    },
    {
      id: 'l_mutzar_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(START + 128, 366, 1424, 360), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(START + 228, 220, 1000, 53), 'heading'),
        place('p_caption', 'caption', at(START + 228, 274, 1000, 68), 'caption'),
        ...foot('quote').placeholders,
      ],
      decorations: [
        board('quote'),
        glow('d_mutzar_quote_glow', atEnd(0, 460, 900, 620), VIOLET, 0.12),
        panel('d_mutzar_quote_card', at(START + 80, 176, 1520, 700), 30),
        avatar('d_mutzar_quote_avatar', at(START + 128, 220, 76, 76)),
        lettered('d_mutzar_quote_tools', atEnd(240, 228, 240, 44), (dir) =>
          svg(
            240,
            44,
            say(dir, 240, 0, 28, 18, w2('לפני 2 דק׳', '2 min ago'), `fill="${MUTED}"`) +
              `<circle cx="${bx(dir, 240, 240 - 72)}" cy="22" r="17" stroke="${MINT}" stroke-width="2.2"/>` +
              icon('check', bx(dir, 240, 240 - 72) - 10, 12, 20, MINT, 2.4) +
              icon('dots', bx(dir, 240, 240 - 16) - 12, 10, 24, MUTED, 2.6),
          ),
        ),
        lettered('d_mutzar_quote_reactions', at(START + 128, 750, 560, 48), (dir) => {
          const w = 560;
          const chip = (s: number, cw: number, name: Icon, count: string, on: boolean) =>
            `<rect x="${bx(dir, w, s, cw)}" y="2" width="${cw}" height="44" rx="22" fill="${on ? CORAL : INK}" fill-opacity="${on ? 0.12 : 0.05}" stroke="${on ? CORAL : INK}" stroke-opacity="${on ? 0.5 : 0.08}" stroke-width="1.5"/>` +
            icon(name, bx(dir, w, s + 16, 22), 13, 22, on ? CORAL : MUTED, 2.1) +
            say(dir, w, s + 46, 31, 19, count, `font-weight="600" fill="${on ? CORAL : MUTED}"`);
          return svg(
            w,
            48,
            chip(0, 100, 'heart', '48', true) +
              chip(114, 100, 'thumb', '31', false) +
              chip(228, 58, 'smile', '', false),
          );
        }),
        lettered('d_mutzar_quote_reply', at(START + 128, 810, 1424, 50), (dir) =>
          svg(
            1424,
            50,
            `<rect x="1" y="1" width="1422" height="48" rx="24" fill="${CANVAS}" stroke="${INK}" stroke-opacity=".08"/>` +
              say(
                dir,
                1424,
                28,
                32,
                19,
                w2('השב או הזכר מישהו עם @', 'Reply, or mention someone with @'),
                `fill="${MUTED}"`,
              ) +
              `<circle cx="${bx(dir, 1424, 1424 - 25)}" cy="25" r="19" fill="${CORAL}"/>` +
              icon('send', bx(dir, 1424, 1424 - 25) - 10, 15, 20, WHITE, 2.6),
          ),
        ),
        // The comment's pin on the board, its point towards the card.
        drawing(
          'd_mutzar_quote_pin',
          at(START + 4, 128, 84, 92),
          svg(
            84,
            92,
            `<defs><filter id="p" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#3b2414" flood-opacity=".2"/></filter></defs>` +
              `<path d="M42 86C42 86 4 82 4 44a38 38 0 1 1 76 0c0 30-26 42-38 42z" fill="${WHITE}" filter="url(#p)"/>` +
              `<circle cx="42" cy="44" r="29" fill="${VIOLET}"/>`,
          ),
          PAINT,
        ),
        still(
          'd_mutzar_quote_pin_icon',
          at(START + 4 + 28, 128 + 30, 28, 28),
          svg(28, 28, icon('page', 0, 0, 28, WHITE, 2.2)),
        ),
        cursor('d_mutzar_quote_cursor', [1920 - 300, 264], VIOLET, NAMES[2]!),
        ...foot('quote').decorations,
      ],
    },
    {
      id: 'l_mutzar_text',
      name: 'Text',
      archetype: 'text',
      // The text is the page of a document, in its window from margin to margin and down to over
      // the foot, from the top of the page; the people on the page stand beside the title.
      placeholders: [
        place('p_title', 'title', at(START, 112, WIDTH - 300, 92), 'title'),
        place('p_body', 'body', at(START + 64, PAGE.y + 132, WIDTH - 128, 512), 'body'),
      ],
      decorations: [
        board('text'),
        ...browser('text', PAGE, 'zrima.app/docs/launch-night'),
        // The page's cover, a band of the theme's colours under the bar of the window.
        rect(
          'd_mutzar_text_cover',
          { x: PAGE.x, y: PAGE.y + 52, w: PAGE.w, h: 36 },
          {
            kind: 'linear',
            angle: 90,
            stops: [
              { color: token('secondary', 0.26), at: 0 },
              { color: token('secondary', 0.1), at: 0.55 },
              { color: token('accent', 0.16), at: 1 },
            ],
          },
        ),
        presence('text'),
        ...foot('text').decorations,
      ],
    },
    {
      id: 'l_mutzar_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head('text_image', 920).placeholders,
        place('p_image', 'image', atEnd(END + 12, 136, 652, 772)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(START + 84, top, 880, 53), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(START + 84, top + 56, 880, 132), 'body'),
        ]),
        ...foot('text_image').placeholders,
      ],
      decorations: [
        board('text_image'),
        ...head('text_image', 920).decorations,
        ...browser('text_image', textWindow, 'zrima.app/builder'),
        ...rows3.map((top, i) =>
          toggle(`d_mutzar_text_image_switch${i + 1}`, at(START, top + 8, 64, 36), true),
        ),
        ...foot('text_image').decorations,
      ],
    },
    {
      id: 'l_mutzar_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture is a frame on the board, selected; the words are under it, on the board,
        // since nothing of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', shot),
        place('p_kicker', 'caption', at(START + 30, 714, 900, 34), 'caption'),
        place('p_title', 'title', at(START, 758, 1060, 140), 'title'),
        place('p_body', 'body', atEnd(END, 758, 560, 180), 'body'),
      ],
      decorations: [
        board('full_image'),
        ...liveDot('full_image', 714),
        rect(
          'd_mutzar_full_image_mat',
          { x: 86, y: 86, w: 1748, h: 588 },
          solid(token('surface')),
          {
            effects: { shadow: LIFT },
          },
        ),
        rect(
          'd_mutzar_full_image_selection',
          { x: 86, y: 86, w: 1748, h: 588 },
          { kind: 'none' },
          {
            stroke: { color: token('secondary'), width: 2.5 },
          },
        ),
        ...[
          [79, 79],
          [1827, 79],
          [79, 667],
          [1827, 667],
        ].map(([x, y], i) =>
          rect(`d_mutzar_full_image_handle${i + 1}`, { x: x!, y: y!, w: 14, h: 14 }, WHITE_FILL, {
            stroke: { color: token('secondary'), width: 2.5 },
          }),
        ),
        lettered('d_mutzar_full_image_label', at(96, 46, 420, 30), (dir) =>
          svg(
            420,
            30,
            `<path d="M${bx(dir, 420, 4)} 8v14M${bx(dir, 420, 16)} 8v14M${bx(dir, 420, 0)} 12h${dir === 'rtl' ? -20 : 20}M${bx(dir, 420, 0)} 18h${dir === 'rtl' ? -20 : 20}" stroke="${CORAL}" stroke-width="2" stroke-linecap="round"/>` +
              say(
                dir,
                420,
                32,
                21,
                17,
                w2('מסך הבית · Zrima 2.0', 'Home screen · Zrima 2.0'),
                `font-weight="600" fill="${CORAL}"`,
              ),
          ),
        ),
        lettered(
          'd_mutzar_full_image_size',
          { x: 960 - 76, y: 690, w: 152, h: 32 },
          svg(
            152,
            32,
            `<rect width="152" height="32" rx="8" fill="${CORAL}"/><text x="76" y="22" text-anchor="middle" ${UI} font-size="16" font-weight="600" fill="${WHITE}">1728 × 568</text>`,
          ),
        ),
      ],
    },
    {
      id: 'l_mutzar_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head('cards').placeholders,
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}_note`, 'caption', at(start + 30, 372, 476, 68), 'caption'),
          place(`p_card${i + 1}`, 'subtitle', at(start + 30, 444, 476, 100), 'heading'),
          place(`p_card${i + 1}_body`, 'body', at(start + 30, 550, 476, 210), 'body'),
        ]),
        place('p_takeaway', 'body', at(START + 96, 803, WIDTH - 130, 90), 'body', {
          vAlign: 'middle',
        }),
        ...foot('cards').placeholders,
      ],
      decorations: [
        board('cards'),
        ...head('cards').decorations,
        presence('cards'),
        ...panels(
          cards3.map((start, i) => [`d_mutzar_cards_card${i + 1}`, at(start, 268, 536, 510)]),
          24,
        ),
        ...cards3.flatMap((start, i) => [
          tile(
            `d_mutzar_cards_icon${i + 1}`,
            at(start + 30, 294, 60, 60),
            (['sparkles', 'plug', 'shield'] as const)[i]!,
            [CORAL, VIOLET, MINT][i]!,
          ),
          badge(
            `d_mutzar_cards_badge${i + 1}`,
            at(start + 104, 308, 92, 32),
            i === 2 ? w2('בטא', 'BETA') : w2('חדש', 'NEW'),
            i === 2 ? VIOLET : CORAL,
          ),
          toggle(`d_mutzar_cards_switch${i + 1}`, at(start + 536 - 28 - 76, 304, 76, 40), true),
          rect(
            `d_mutzar_cards_rule${i + 1}`,
            at(start + 30, 362, 476, 1),
            solid(token('text', 0.07)),
          ),
        ]),
        rect('d_mutzar_cards_banner', at(START, 796, WIDTH, 104), solid(token('secondary', 0.07)), {
          effects: { radius: 20 },
        }),
        rect('d_mutzar_cards_banner_bar', at(START, 817, 5, 62), CORAL_FILL, {
          effects: { radius: 3 },
        }),
        still(
          'd_mutzar_cards_banner_icon',
          at(START + 30, 824, 48, 48),
          svg(
            48,
            48,
            `<circle cx="24" cy="24" r="23" fill="${CORAL}"/>${icon('bolt', 12, 12, 24, WHITE, 2.2)}`,
          ),
        ),
        ...foot('cards').decorations,
      ],
    },
    {
      id: 'l_mutzar_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head('timeline').placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 308, 390, 79), 'title', { vAlign: 'bottom' }),
          place(`p_what${i + 1}`, 'subtitle', at(start + 30, 494, 338, 106), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start + 30, 604, 338, 170), 'caption'),
        ]),
        place('p_note', 'caption', at(START + 30, 834, WIDTH - 30, 34), 'caption'),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        board('timeline'),
        ...head('timeline').decorations,
        presence('timeline'),
        rect('d_mutzar_timeline_track', at(START, 418, WIDTH, 10), solid(token('text', 0.08)), {
          effects: { radius: 5 },
        }),
        rect('d_mutzar_timeline_progress', at(START, 418, 449, 10), CORAL_FILL, {
          effects: { radius: 5 },
        }),
        ...panels(
          columns4.map((start, i) => [`d_mutzar_timeline_card${i + 1}`, at(start, 472, 390, 324)]),
          22,
        ),
        dot(
          'd_mutzar_timeline_halo',
          at(START + 429 - 12, 391, 64, 64),
          solid(token('secondary', 0.16)),
        ),
        ...columns4.flatMap((start, i) => {
          const badges: [Words, string][] = [
            [w2('זמין', 'GA'), MINT],
            [w2('זמין · עכשיו', 'GA · NOW'), CORAL],
            [w2('בטא', 'BETA'), VIOLET],
            [w2('בתכנון', 'PLANNED'), INK],
          ];
          const [words, color] = badges[i]!;
          return [
            badge(
              `d_mutzar_timeline_badge${i + 1}`,
              at(start, 272, i === 1 ? 150 : 104, 34),
              words,
              color,
              i === 1,
            ),
            rect(
              `d_mutzar_timeline_stem${i + 1}`,
              at(start + 18, 440, 4, 32),
              solid(token(i < 2 ? 'secondary' : 'text', i < 2 ? 1 : 0.14)),
            ),
            i < 2
              ? still(
                  `d_mutzar_timeline_node${i + 1}`,
                  at(start, 403, 40, 40),
                  svg(
                    40,
                    40,
                    `<circle cx="20" cy="20" r="18" fill="${CORAL}" stroke="${WHITE}" stroke-width="${i === 1 ? 4 : 0}"/>${icon('check', 9, 9, 22, WHITE, 3)}`,
                  ),
                )
              : drawing(
                  `d_mutzar_timeline_node${i + 1}`,
                  at(start, 403, 40, 40),
                  svg(
                    40,
                    40,
                    `<circle cx="20" cy="20" r="16" fill="${WHITE}" stroke="${i === 2 ? VIOLET : INK}" stroke-opacity="${i === 2 ? 1 : 0.35}" stroke-width="4" stroke-dasharray="${i === 2 ? '' : '5 4'}"/>`,
                  ),
                  PAINT,
                ),
          ];
        }),
        cursor(
          'd_mutzar_timeline_cursor',
          [START + 429 + 34, 432],
          CORAL,
          w2('אנחנו כאן', 'We are here'),
        ),
        ...foot('timeline').decorations,
      ],
    },
    {
      id: 'l_mutzar_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head('process').placeholders,
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start + 30, 420, 302, 106), 'heading'),
          place(`p_step${i + 1}_body`, 'caption', at(start + 30, 528, 302, 136), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start + 30, 690, 302, 79), 'title', {
            color: token('secondary'),
          }),
        ]),
        place('p_summary', 'body', at(START + 100, 819, WIDTH - 140, 90), 'body', {
          vAlign: 'middle',
        }),
        ...foot('process').placeholders,
      ],
      decorations: [
        board('process'),
        ...head('process').decorations,
        presence('process'),
        panel('d_mutzar_process_panel', at(START, 266, WIDTH, 530), 26),
        lettered('d_mutzar_process_progress_label', at(START + 30, 282, 600, 34), (dir) =>
          svg(
            600,
            34,
            say(
              dir,
              600,
              0,
              24,
              19,
              w2('הקמת סביבת העבודה · 4 מתוך 5', 'Workspace setup · 4 of 5'),
              `font-weight="600" fill="${INK}"`,
            ),
          ),
        ),
        rect(
          'd_mutzar_process_progress_track',
          atEnd(END + 36, 292, 560, 12),
          solid(token('text', 0.08)),
          {
            effects: { radius: 6 },
          },
        ),
        rect('d_mutzar_process_progress', at(1920 - END - 36 - 560, 292, 448, 12), CORAL_FILL, {
          effects: { radius: 6 },
        }),
        rect('d_mutzar_process_rule', at(START, 330, WIDTH, 1), solid(token('text', 0.07))),
        ...steps5.flatMap((start, i) => [
          i < 4
            ? still(
                `d_mutzar_process_dot${i + 1}`,
                at(start + 30, 350, 52, 52),
                svg(
                  52,
                  52,
                  `<circle cx="26" cy="26" r="24" fill="${CORAL}"/>${icon('check', 14, 14, 24, WHITE, 3)}`,
                ),
              )
            : drawing(
                `d_mutzar_process_dot${i + 1}`,
                at(start + 30, 350, 52, 52),
                svg(
                  52,
                  52,
                  `<circle cx="26" cy="26" r="22" fill="${WHITE}" stroke="${CORAL}" stroke-width="4"/><circle cx="26" cy="26" r="8" fill="${CORAL}"/>`,
                ),
                PAINT,
              ),
          ...(i < 4
            ? [
                rect(
                  `d_mutzar_process_link${i + 1}`,
                  at(start + 98, 374, 336 - 86, 4),
                  i < 3 ? CORAL_FILL : solid(token('secondary', 0.3)),
                  { effects: { radius: 2 } },
                ),
                rect(
                  `d_mutzar_process_divider${i + 1}`,
                  at(start + 334, 430, 1, 340),
                  solid(token('text', 0.07)),
                ),
              ]
            : []),
        ]),
        rect('d_mutzar_process_toast', at(START, 812, WIDTH, 104), WHITE_FILL, {
          stroke: HAIR,
          effects: { radius: 22, shadow: LIFT_SM },
        }),
        still(
          'd_mutzar_process_toast_check',
          at(START + 32, 840, 48, 48),
          svg(
            48,
            48,
            `<circle cx="24" cy="24" r="23" fill="${MINT}"/>${icon('check', 12, 12, 24, WHITE, 3)}`,
          ),
        ),
        ...foot('process').decorations,
      ],
    },
    {
      id: 'l_mutzar_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head('comparison').placeholders,
        ...(
          [
            ['before', START, undefined],
            ['after', START + 860, token('surface')],
          ] as const
        ).flatMap(([side, start, color]) => [
          place(
            `p_${side}_tag`,
            'caption',
            at(start + 126, 303, 660, 34),
            'caption',
            color ? { color: token('surface', 0.78) } : {},
          ),
          place(
            `p_${side}`,
            'subtitle',
            at(start + 30, 368, 760, 106),
            'heading',
            color ? { color } : {},
          ),
          place(
            `p_${side}_body`,
            'body',
            at(start + 30, 484, 760, 350),
            'body',
            color ? { color } : {},
          ),
        ]),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        board('comparison'),
        ...head('comparison').decorations,
        presence('comparison'),
        // The card of the automated way first: its coral glow goes under the other card.
        rect('d_mutzar_comparison_after', at(START + 860, 266, 820, 650), PRIMARY_FILL, {
          effects: {
            radius: 28,
            shadow: { x: 0, y: 30, blur: 70, color: { token: 'secondary', alpha: 0.3 } },
          },
        }),
        panel('d_mutzar_comparison_before', at(START, 266, 820, 650), 28, LIFT_SM),
        toggle('d_mutzar_comparison_before_switch', at(START + 30, 300, 76, 40), false),
        toggle('d_mutzar_comparison_after_switch', at(START + 890, 300, 76, 40), true),
        rect(
          'd_mutzar_comparison_after_rule',
          at(START + 890, 354, 760, 1),
          solid(token('surface', 0.12)),
        ),
        rect(
          'd_mutzar_comparison_before_rule',
          at(START + 30, 354, 760, 1),
          solid(token('text', 0.07)),
        ),
        workPath('d_mutzar_comparison_before_path', at(START + 30, 846, 760, 56), false),
        workPath('d_mutzar_comparison_after_path', at(START + 890, 846, 760, 56), true),
        drawing(
          'd_mutzar_comparison_switch',
          at(START + 808, 559, 64, 64),
          svg(
            64,
            64,
            `<defs><filter id="b" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#3b2414" flood-opacity=".2"/></filter></defs>` +
              `<circle cx="32" cy="32" r="29" fill="${WHITE}" filter="url(#b)"/>` +
              icon('arrow', 18, 18, 28, CORAL, 2.8),
          ),
          PAINT,
        ),
        ...foot('comparison').decorations,
      ],
    },
    {
      id: 'l_mutzar_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head('chart').placeholders,
        place('p_chart', 'chart', at(START + 30, 384, 1020, 536)),
        place('p_stat1', 'number', atEnd(END + 22, 284, 520, 124), 'display', {
          color: token('secondary'),
        }),
        place('p_stat1_body', 'body', atEnd(END + 22, 412, 520, 135), 'body'),
        place('p_stat2', 'number', atEnd(END + 22, 598, 520, 124), 'display', {
          color: token('accent'),
        }),
        place('p_stat2_body', 'body', atEnd(END + 22, 726, 520, 100), 'body'),
        place('p_source', 'caption', atEnd(END + 22, 862, 520, 68), 'caption'),
        ...foot('chart').placeholders,
      ],
      decorations: [
        board('chart'),
        ...head('chart').decorations,
        ...browser('chart', at(START, 266, 1080, 664), 'zrima.app/insights/adoption'),
        lettered('d_mutzar_chart_range', at(START + 30, 332, 380, 40), (dir) => {
          const w = 380;
          const opts = [w2('חודש', 'Month'), w2('רבעון', 'Quarter'), w2('שנה', 'Year')];
          return svg(
            w,
            40,
            `<rect width="${w}" height="40" rx="12" fill="${CANVAS}"/>` +
              `<rect x="${bx(dir, w, 4, 120)}" y="4" width="120" height="32" rx="9" fill="${WHITE}" stroke="${INK}" stroke-opacity=".08"/>` +
              opts
                .map((o, i) =>
                  say(
                    dir,
                    w,
                    64 + i * 124,
                    26,
                    16,
                    o,
                    `font-weight="600" fill="${i ? MUTED : INK}"`,
                    'middle',
                  ),
                )
                .join(''),
          );
        }),
        ...panels(
          [
            ['d_mutzar_chart_stat1', atEnd(END, 266, 564, 296)],
            ['d_mutzar_chart_stat2', atEnd(END, 582, 564, 262)],
          ],
          24,
        ),
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_mutzar_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head('table', 1000).placeholders,
        place('p_table', 'table', at(START + 30, 322, WIDTH - 60, 612)),
        // The note says what the table shows, at the end side of the head, across from the title.
        place('p_note', 'caption', atEnd(END, 126, 660, 102), 'caption', { align: 'end' }),
        ...foot('table').placeholders,
      ],
      decorations: [
        board('table'),
        ...head('table', 1000).decorations,
        ...browser('table', at(START, 262, WIDTH, 680), 'zrima.app/pricing', (dir, w) => {
          // The views of the data at the start side, after the lights, and a search at the end.
          const views = [w2('טבלה', 'Table'), w2('לוח', 'Board'), w2('ציר זמן', 'Timeline')];
          return (
            views
              .map((v, i) => {
                const s = 110 + i * 96;
                return (
                  say(dir, w, s, 31, 16, v, `font-weight="600" fill="${i ? MUTED : INK}"`) +
                  (i === 0
                    ? `<rect x="${bx(dir, w, s, 44)}" y="48" width="44" height="3" rx="1.5" fill="${CORAL}"/>`
                    : '')
                );
              })
              .join('') +
            // The search field at the end side: its icon first, then the word.
            `<rect x="${bx(dir, w, w - 224, 200)}" y="11" width="200" height="30" rx="15" fill="${CANVAS}"/>` +
            icon('search', bx(dir, w, w - 210, 16), 18, 16, MUTED, 2.2) +
            say(dir, w, w - 184, 31, 15, w2('חיפוש', 'Search'), `fill="${MUTED}"`)
          );
        }),
        ...foot('table').decorations,
      ],
    },
    {
      id: 'l_mutzar_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head('team').placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start + 14, 282, 366, 320)),
          place(`p_person${i + 1}`, 'subtitle', at(start + 30, 622, 344, 52), 'heading', {
            vAlign: 'middle',
            color: token(i === 1 ? 'surface' : 'text'),
          }),
          place(`p_person${i + 1}_role`, 'caption', at(start + 14, 690, 376, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start + 14, 728, 376, 136), 'caption'),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: [
        board('team'),
        ...head('team').decorations,
        presence('team'),
        ...panels(
          columns4.map((start, i) => [`d_mutzar_team_card${i + 1}`, at(start, 268, 394, 628)]),
          26,
        ),
        ...columns4.flatMap((start, i) => [
          rect(
            `d_mutzar_team_tag${i + 1}`,
            at(start + 14, 618, 366, 60),
            solid({ value: PEOPLE[i]! }),
            {
              effects: { radius: 14 },
            },
          ),
          drawing(
            `d_mutzar_team_arrow${i + 1}`,
            at(start + 2, 604, 30, 36),
            svg(
              30,
              36,
              `<path d="M28 2v26l-7-6.6-4.6 10.4-4.6-2 4.6-10.2H5z" fill="${PEOPLE[i]}" stroke="${WHITE}" stroke-width="2.4" stroke-linejoin="round"/>`,
            ),
            PAINT,
          ),
        ]),
        ...foot('team').decorations,
      ],
    },
    {
      id: 'l_mutzar_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(START + 30, 150, 760, 34), 'caption'),
        place('p_title', 'title', at(START, 196, 1000, 240), 'display'),
        ...buttons3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(START + 40, top + 6, 750, 92), 'body', {
            vAlign: 'middle',
            ...(i === 0 ? { color: token('surface') } : {}),
          }),
        ),
        place('p_contact', 'caption', at(START + 40, 862, 800, 34), 'caption'),
      ],
      decorations: [
        board('closing'),
        glow('d_mutzar_closing_glow', atEnd(0, 140, 1000, 900), CORAL, 0.2),
        ...liveDot('closing', 150),
        ...buttons3.flatMap((top, i) => [
          rect(
            `d_mutzar_closing_button${i + 1}`,
            at(START, top, 860, 104),
            i === 0 ? PRIMARY_FILL : i === 1 ? WHITE_FILL : solid(token('secondary', 0.1)),
            {
              ...(i === 1 ? { stroke: { color: token('text', 0.14), width: 1.5 } } : {}),
              effects: {
                radius: 52,
                ...(i === 0
                  ? { shadow: { x: 0, y: 16, blur: 36, color: { value: '#3b2414', alpha: 0.22 } } }
                  : {}),
              },
            },
          ),
          // The arrow of the first button points the way the slide reads; the others have no way.
          (i === 0
            ? (id: string, frame: Frame, markup: string) => drawing(id, frame, markup, PAINT)
            : still)(
            `d_mutzar_closing_button${i + 1}_icon`,
            at(START + 860 - 30 - 48, top + 28, 48, 48),
            svg(
              48,
              48,
              `<circle cx="24" cy="24" r="23" fill="${i === 0 ? CORAL : i === 1 ? INK : CORAL}" fill-opacity="${i === 1 ? 0.06 : 1}"/>` +
                icon(
                  (['arrow', 'play', 'tag'] as const)[i]!,
                  12,
                  12,
                  24,
                  i === 1 ? INK : WHITE,
                  2.4,
                ),
            ),
          ),
        ]),
        still(
          'd_mutzar_closing_mail',
          at(START, 864, 32, 30),
          svg(32, 30, icon('mail', 2, 1, 28, CORAL, 2.2)),
        ),
        keycap('d_mutzar_closing_cmd', atEnd(150, 360, 320, 320), keyIcon('command'), -8),
        keycap('d_mutzar_closing_enter', atEnd(380, 470, 320, 300), keyIcon('enter', CORAL), 6),
        ...toast(
          'closing',
          atEnd(150, 236, 470, 76),
          w2('התהליך פורסם', 'Workflow published'),
          w2('פתיחה', 'Open'),
        ),
        cursor('d_mutzar_closing_cursor', [START + 860 - 78, 526], VIOLET, NAMES[1]!),
        dot(
          'd_mutzar_closing_click',
          at(START + 860 - 78 - 22, 504, 44, 44),
          { kind: 'none' },
          {
            stroke: { color: token('accent', 0.5), width: 2.5 },
          },
        ),
      ],
    },
  ];
}

/**
 * The layouts of a left-to-right deck: the mirrors, with every drawing that holds letters
 * turned back, and drawn again for that direction where it says words.
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
// The sample: the launch night of Zrima 2.0, workflow automation for operations teams

const FOOTER_HE = text('Zrima 2.0 · ערב ההשקה');
const FOOTER_EN = text('Zrima 2.0 · Launch night');
const ADOPTION = [12, 21, 38, 74, 118, 162];
const TABLE_COLS = [508, 352, 352, 408];
const TABLE_ROW = 96;

const TEAM_PICTURES = () => pictures.team.map((asset) => ({ assetId: asset.id }));

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_mutzar_hero',
    name: 'פתיחה',
    content: {
      caption: [text('ערב ההשקה · Zrima 2.0'), text('נועה ברק, מנכ״לית · תל אביב · 8.12.2026')],
      title: text('התפעול', 'רץ לבד'),
      subtitle: text('Zrima 2.0 מחברת את מערכות התפעול ומריצה את העבודה החוזרת.'),
    },
  },
  {
    layout: 'l_mutzar_section',
    name: 'מה חדש',
    content: {
      number: text('01'),
      caption: text('חלק ראשון'),
      title: text('מה חדש'),
      subtitle: text('שלוש יכולות שביקשתם, ואחת שלא ציפיתם לה.'),
    },
  },
  {
    layout: 'l_mutzar_text',
    name: 'סדר הערב',
    content: {
      title: text('על מה נדבר הערב'),
      body: {
        paragraphs: [
          para(
            'שלושים דקות על מה שחדש ב-Zrima 2.0, ולמה בנינו אותו כך. אחר כך הדגמה חיה על הבמה הזו: מעמוד ריק ועד תהליך עבודה שרץ לבד, בלי שורת קוד אחת ובלי עזרה מצוות הפיתוח.',
            { spaceAfter: 36 },
          ),
          ...points(
            [
              ['הבונה: ', 'כל שלבי התהליך על קנבס אחד, ו-AI שמנסח את הטיוטה הראשונה.'],
              ['הבטא: ', 'מה בנו 4,200 צוותי תפעול, ומה הם ביקשו מאיתנו.'],
              ['המסלולים: ', 'שלושה, מהמסלול החינמי ועד Business, במחירי השקה.'],
              ['מפת הדרכים: ', 'אישורים מהטלפון בפברואר, ותהליכים משותפים בהמשך 2027.'],
            ],
            { kind: 'number', mark: token('primary'), gap: 22 },
          ).paragraphs,
        ],
      },
    },
  },
  {
    layout: 'l_mutzar_big_number',
    name: 'הבטא במספרים',
    content: {
      caption: [
        text('שלושה חודשים של בטא'),
        text('צוותי תפעול בבטא הפתוחה'),
        text('בזמן הטיפול בהזמנה'),
        text('זמינות בשלושת החודשים'),
      ],
      title: text('הבטא במספרים'),
      number: [text('1.8M'), text('4,200'), text('−63%'), text('99.98%')],
      subtitle: text('תהליכים רצו בבטא, בלי מגע יד אדם'),
      body: text('צוותים בנו בממוצע 14 תהליכים בשבוע הראשון, והשאירו אותם לרוץ לבד.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_mutzar_cards',
    name: 'שלוש יכולות',
    content: {
      caption: [text('מה חדש'), text('אוטומציה'), text('חיבורים'), text('אבטחה')],
      title: text('שלוש יכולות חדשות'),
      subtitle: [text('סוכני AI'), text('400 חיבורים'), text('הרשאות לכל שלב')],
      body: [
        text('סוכן שמסווג פניות חוזרות, עונה עליהן ומעביר לאדם כשצריך.'),
        text('מהנהלת החשבונות ועד המחסן: חיבור חדש בשתי דקות, בלי קוד.'),
        text('כל שלב מקבל רק את ההרשאות שהוא צריך, וכל פעולה נרשמת.'),
        text('שלושתן זמינות מהערב לכל הלקוחות, בלי תוספת מחיר.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_mutzar_text_image',
    name: 'הבונה החדש',
    content: {
      caption: text('הבונה החדש'),
      title: text('בונה תהליכים', 'שכל הצוות מבין'),
      image: { assetId: pictures.builderHe.id },
      subtitle: [text('גוררים ומחברים'), text('AI שמציע את הצעד הבא'), text('בדיקה לפני פרסום')],
      body: [
        text('כל שלב הוא כרטיס על הקנבס. מותחים חץ, והנתונים עוברים לבד.'),
        text('מתארים במילים מה צריך לקרות, ו-Zrima בונה טיוטה של התהליך.'),
        text('מריצים על נתונים אמיתיים בסביבה סגורה, ואז מעלים לאוויר.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_mutzar_timeline',
    name: 'מפת הדרכים',
    content: {
      caption: [text('מפת הדרכים'), text('התאריכים של 2.1 ו-3.0 הם יעד, ועוד עשויים לזוז.')],
      title: text('מ-1.0 ועד 3.0'),
      number: [text('v1.0'), text('v2.0'), text('v2.1'), text('v3.0')],
      subtitle: [
        text('הבסיס'),
        text('בונה חדש ו-AI'),
        text('אפליקציה לנייד'),
        text('תהליכים משותפים'),
      ],
      body: [
        text('2025: ארבעים חיבורים ותהליכים פשוטים.'),
        text('דצמבר 2026: הבונה, סוכני AI ו-400 חיבורים.'),
        text('פברואר 2027: אישורים והתראות מהטלפון.'),
        text('סוף 2027: ספקים ולקוחות באותו תהליך.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_mutzar_process',
    name: 'הקמה',
    content: {
      caption: [
        text('מהרשמה לאוטומציה'),
        text('חינם, בלי כרטיס אשראי'),
        text('מחברים את המערכות הקיימות'),
        text('כל אחד עם ההרשאות שלו'),
        text('תבנית מוכנה, או תיאור במילים'),
        text('כמה שעות נחסכו השבוע'),
      ],
      title: text('רבע שעה עד התהליך הראשון'),
      subtitle: [text('הרשמה'), text('חיבור'), text('הזמנת הצוות'), text('אוטומציה'), text('דוח')],
      number: [text('1 דק׳'), text('3 דק׳'), text('1 דק׳'), text('10 דק׳'), text('שבועי')],
      body: text('ממוצע הבטא: רבע שעה מההרשמה ועד התהליך הראשון שרץ לבד.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_mutzar_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('לפני ואחרי'), text('בלי Zrima'), text('עם Zrima 2.0')],
      title: text('הזמנה אחת, שני עולמות'),
      subtitle: [text('שש מערכות, 40 דקות'), text('תהליך אחד, 4 דקות')],
      body: [
        bullets(
          'מעתיקים פרטים ידנית בין המערכות',
          'רודפים אחרי אישורים בטלפון ובמייל',
          'מגלים טעויות רק בסגירת החודש',
        ),
        bullets(
          'הנתונים עוברים לבד בין המערכות',
          'אישור בלחיצה, ישר מההתראה',
          'חריגה נתפסת ברגע שהיא קורית',
        ),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_mutzar_chart',
    name: 'אימוץ',
    content: {
      caption: [text('אימוץ'), text('נתוני השימוש של Zrima, יוני עד נובמבר 2026.')],
      title: text('צוותים לא רק נרשמו, הם נשארו'),
      number: [text('×13'), text('92%')],
      body: [
        text('גידול בתהליכים הפעילים מאז תחילת הבטא ביוני.'),
        text('מהצוותים עדיין פעילים אחרי 60 יום.'),
      ],
      footer: FOOTER_HE,
    },
    chart: {
      chartType: 'column',
      title: 'תהליכים פעילים, באלפים',
      data: {
        categories: ['יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳'],
        series: [{ name: 'תהליכים', values: ADOPTION }],
      },
    },
  },
  {
    layout: 'l_mutzar_table',
    name: 'מסלולים',
    content: {
      caption: [
        text('מסלולים ומחירים'),
        text('מחירי השקה, בתוקף עד 31.1.2027 לכל מי שנרשם עכשיו.'),
      ],
      title: text('שלושה מסלולים, אותו מוצר'),
      footer: FOOTER_HE,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['מה כלול', 'Free', 'Pro', 'Business'],
        ['תהליכים פעילים', '5', '100', 'ללא הגבלה'],
        ['ריצות בחודש', '1,000', '50,000', 'ללא הגבלה'],
        ['סוכני AI', '—', '3', '20'],
        ['הרשאות ו-SSO', '—', 'בסיסיות', 'מלאות'],
        ['מחיר למשתמש בחודש', 'חינם', '₪ 69', '₪ 139'],
      ],
    },
  },
  {
    layout: 'l_mutzar_full_image',
    name: 'מסך הבית',
    content: {
      image: { assetId: pictures.heroHe.id },
      caption: text('מסך הבית החדש'),
      title: text('לוח בקרה אחד', 'לכל התפעול'),
      body: text('הזמנות, מלאי, ספקים ופניות בזמן אמת, על מסך אחד שכל הצוות רואה.'),
    },
  },
  {
    layout: 'l_mutzar_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'פעם העתקנו כל הזמנה בין שש מערכות. היום הצוות שלי מטפל רק בחריגים, וכל השאר זורם לבד.',
      ),
      attribution: text('רותם אלון'),
      caption: text('מנהלת תפעול ברשת חנויות לציוד ספורט · לקוחה מהבטא'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_mutzar_team',
    name: 'המייסדים',
    content: {
      caption: [
        text('המייסדים'),
        text('מנכ״לית'),
        text('CTO'),
        text('סמנכ״ל מוצר'),
        text('מובילת עיצוב'),
      ],
      title: text('מי בונה את Zrima'),
      image: TEAM_PICTURES(),
      subtitle: [text('נועה ברק'), text('יואב לנדאו'), text('איתן שגב'), text('מאיה כרמי')],
      body: [
        text('ניהלה תפעול בשלוש חברות לוגיסטיקה לפני Zrima.'),
        text('בנה את המנוע שמריץ שני מיליון תהליכים ביום.'),
        text('אחראי על הבונה החדש ועל סוכני ה-AI.'),
        text('עיצבה את 2.0 יחד עם ארבעים צוותי תפעול.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_mutzar_closing',
    name: 'סיום',
    content: {
      caption: [text('מתחילים הערב'), text('hello@zrima.example · zrima.example/2.0')],
      title: text('מתחילים', 'לזרום'),
      body: [
        text('פתחו חשבון חינם ב-zrima.example'),
        text('הדגמה חיה בדוכן שלנו עד 22:00'),
        text('30% הנחת השקה עד סוף ינואר'),
      ],
    },
  },
];

const sampleEn: SampleSlide[] = [
  {
    layout: 'l_mutzar_hero',
    name: 'Opening',
    content: {
      caption: [text('Launch night · Zrima 2.0'), text('Noa Barak, CEO · Tel Aviv · 8 Dec 2026')],
      title: text('Ops on', 'autopilot'),
      subtitle: text('Zrima 2.0 connects your ops tools and runs the busywork for you.'),
    },
  },
  {
    layout: 'l_mutzar_section',
    name: "What's new",
    content: {
      number: text('01'),
      caption: text('Part one'),
      title: text("What's new"),
      subtitle: text('Three things you asked for, and one surprise.'),
    },
  },
  {
    layout: 'l_mutzar_text',
    name: 'Agenda',
    content: {
      title: text("Tonight's agenda"),
      body: {
        paragraphs: [
          para(
            'Thirty minutes on what is new in Zrima 2.0, and why we built it the way we did. Then a live demo on this stage, from an empty page to a workflow that runs on its own.',
            { spaceAfter: 36 },
          ),
          ...points(
            [
              ['The builder: ', 'every step of a workflow on one canvas, with AI to draft it.'],
              ['The beta: ', 'what 4,200 ops teams built, and what they asked us for.'],
              ['Plans: ', 'three of them, from the free plan to Business, at launch prices.'],
              ['The roadmap: ', 'approvals by phone in February, and shared flows later in 2027.'],
            ],
            { kind: 'number', mark: token('primary'), gap: 22 },
          ).paragraphs,
        ],
      },
    },
  },
  {
    layout: 'l_mutzar_big_number',
    name: 'The beta in numbers',
    content: {
      caption: [
        text('Three months of beta'),
        text('Ops teams in the open beta'),
        text('In order handling time'),
        text('Uptime across all three months'),
      ],
      title: text('The beta in numbers'),
      number: [text('1.8M'), text('4,200'), text('−63%'), text('99.98%')],
      subtitle: text('Workflows run in beta, hands-free'),
      body: text(
        'In their first week, teams built 14 workflows on average, then let them run on their own.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_cards',
    name: 'Three capabilities',
    content: {
      caption: [text("What's new"), text('Automation'), text('Integrations'), text('Security')],
      title: text('Three new capabilities'),
      subtitle: [text('AI agents'), text('400 integrations'), text('Per-step access')],
      body: [
        text('Sorts repeat requests, answers, and hands off to a person.'),
        text('Finance to warehouse: a new connection takes two minutes.'),
        text('The least access for each step, and every action logged.'),
        text('All three are live tonight, at no extra cost.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_text_image',
    name: 'The new builder',
    content: {
      caption: text('The new builder'),
      title: text('A builder the whole', 'team understands'),
      image: { assetId: pictures.builderEn.id },
      subtitle: [text('Drag and connect'), text('AI drafts the flow'), text('Test, then publish')],
      body: [
        text('Each step is a card. Draw an arrow, and the data flows.'),
        text('Describe the outcome, and Zrima drafts the workflow.'),
        text('Run it on real data in a sandbox, then go live.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_timeline',
    name: 'Roadmap',
    content: {
      caption: [text('Roadmap'), text('The dates of 2.1 and 3.0 are targets.')],
      title: text('From 1.0 to 3.0'),
      number: [text('v1.0'), text('v2.0'), text('v2.1'), text('v3.0')],
      subtitle: [
        text('Foundation'),
        text('Builder and AI'),
        text('Mobile app'),
        text('Shared flows'),
      ],
      body: [
        text('2025: forty integrations, simple flows.'),
        text('Dec 2026: the builder, AI agents, 400 integrations.'),
        text('Feb 2027: approvals and alerts by phone.'),
        text('Late 2027: suppliers and customers in one flow.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_process',
    name: 'Onboarding',
    content: {
      caption: [
        text('Onboarding'),
        text('Free, no card needed'),
        text('Link your tools'),
        text("Everyone's own access"),
        text('A template, or plain words'),
        text('Hours saved, every week'),
      ],
      title: text('Fifteen minutes to a first flow'),
      subtitle: [
        text('Sign up'),
        text('Connect'),
        text('Invite'),
        text('Automate'),
        text('Report'),
      ],
      number: [text('1 min'), text('3 min'), text('1 min'), text('10 min'), text('Weekly')],
      body: text('Beta average: fifteen minutes to a first live workflow.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_comparison',
    name: 'Before and after',
    content: {
      caption: [text('Before and after'), text('Without Zrima'), text('With Zrima 2.0')],
      title: text('One order, two worlds'),
      subtitle: [text('Six tools, 40 minutes'), text('One workflow, 4 minutes')],
      body: [
        bullets(
          'Details copied by hand between tools',
          'Chasing approvals by phone',
          'Mistakes found at month-end close',
        ),
        bullets(
          'Data moves between tools by itself',
          'One-tap approval, right from the alert',
          'Exceptions caught the moment they happen',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_chart',
    name: 'Adoption',
    content: {
      caption: [text('Adoption'), text('Zrima usage data, June to November 2026.')],
      title: text('Teams signed up, and stayed'),
      number: [text('×13'), text('92%')],
      body: [
        text('Growth in active workflows since the beta began in June.'),
        text('Of teams still active after 60 days.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Active workflows, thousands',
      data: {
        categories: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'],
        series: [{ name: 'Workflows', values: ADOPTION }],
      },
    },
  },
  {
    layout: 'l_mutzar_table',
    name: 'Plans',
    content: {
      caption: [
        text('Plans and pricing'),
        text('Launch prices, valid until 31 Jan 2027 for anyone who signs up now.'),
      ],
      title: text('Three plans, one product'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ["What's included", 'Free', 'Pro', 'Business'],
        ['Active workflows', '5', '100', 'Unlimited'],
        ['Runs per month', '1,000', '50,000', 'Unlimited'],
        ['AI agents', '—', '3', '20'],
        ['Permissions and SSO', '—', 'Basic', 'Full'],
        ['Price per user, monthly', 'Free', '$19', '$39'],
      ],
    },
  },
  {
    layout: 'l_mutzar_full_image',
    name: 'Home screen',
    content: {
      image: { assetId: pictures.heroEn.id },
      caption: text('The new home screen'),
      title: text('One board for', 'all of operations'),
      body: text(
        'Orders, stock, suppliers and tickets in real time, on one screen the whole team shares.',
      ),
    },
  },
  {
    layout: 'l_mutzar_quote',
    name: 'Quote',
    content: {
      quote: text(
        'We used to copy every order across six systems. Now my team handles only the exceptions, and the rest just flows.',
      ),
      attribution: text('Rotem Alon'),
      caption: text('Head of operations at a sports retail chain · beta customer'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_team',
    name: 'The founders',
    content: {
      caption: [
        text('The founders'),
        text('CEO'),
        text('CTO'),
        text('VP Product'),
        text('Design lead'),
      ],
      title: text('Who builds Zrima'),
      image: TEAM_PICTURES(),
      subtitle: [text('Noa Barak'), text('Yoav Landau'), text('Eitan Segev'), text('Maya Carmi')],
      body: [
        text('Ran operations at three logistics firms.'),
        text('Built the engine behind two million runs a day.'),
        text('Leads the builder and the AI agents.'),
        text('Designed 2.0 with forty operations teams.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_closing',
    name: 'Closing',
    content: {
      caption: [text('Start tonight'), text('hello@zrima.example · zrima.example/2.0')],
      title: text('Start', 'flowing'),
      body: [
        text('Open a free account at zrima.example'),
        text('Live demo at our booth until 10 pm'),
        text('30% launch discount until end of January'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const mutzarSamples = technologySamples('mutzar', sampleHe, sampleEn);

/** The Mutzar template: the theme, its layouts for both directions, and its sample deck. */
export function mutzarTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(mutzarTheme),
    description:
      'Product canvas: a warm board of dots with interface windows, a command palette, key caps, toggles, toasts and multiplayer cursors in coral and ink, for SaaS launches, product demos and roadmaps.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.builderHe,
      pictures.builderEn,
      pictures.heroHe,
      pictures.heroEn,
      ...pictures.team,
    ]),
  };
  // What makes up a slide is the slide's own, and the user changes it (ADR-094).
  const finished = withObjects(template);
  finished.sample = sampleSlides(finished, sampleHe);
  return finished;
}

export const entry = { id: 'mutzar', template: mutzarTemplate, samples: mutzarSamples };
