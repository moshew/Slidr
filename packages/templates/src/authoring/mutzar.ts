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
  rect,
  sampleSlides,
  solid,
  SURFACE,
  text,
  token,
  type SampleSlide,
} from '../builtin/kit';
import { techPictures } from './pictures';
import own from './pictures/mutzar.json';

/** The pictures of the sample: this template's own manifest, read directly as well as through the folder's. */
const pictures: Record<string, AssetMeta> = { ...techPictures, ...(own as Record<string, AssetMeta>) };

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
    muted: '#66636d',
    primary: '#f4512f',
    secondary: '#6f5ef0',
    accent: '#12a073',
    chart: ['#f4512f', '#6f5ef0', '#12a073', '#ffb547', '#18171d', '#a8a4ad'],
  },
  // Rubik's round Hebrew with Manrope's Latin and figures for what is said aloud, Assistant with
  // Inter for what is read: the faces of a product's own interface.
  fonts: {
    heading: { he: 'Rubik', latin: 'Manrope' },
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
          { color: { token: 'primary', alpha: 0.1 }, at: 0 },
          { color: { token: 'primary', alpha: 0 }, at: 0.75 },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// The colours of the drawings

const CORAL = '#f4512f';
const VIOLET = '#6f5ef0';
const MINT = '#12a073';
const INK = '#18171d';
const MUTED = '#66636d';
const CANVAS = '#f6f4ef';
const WHITE = '#ffffff';
/** Colours the theme has no token for: the fourth cursor, the window's lights, a key's edge. */
const AMBER = '#ffb547';
const LIGHTS = ['#ff5f57', '#febc2e', '#28c840'] as const;
const KEY_EDGE = '#e4ded3';
const MASK = '#fefefe';

const PAINT = {
  [CORAL]: token('primary'),
  [VIOLET]: token('secondary'),
  [MINT]: token('accent'),
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
  const x = anchor === 'middle' ? s : dir === 'rtl' ? w - s : s;
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
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  page: '<path d="M6 2.5h8l5 5v14H6z"/><path d="M14 2.5v5h5M9 13h7M9 17h5"/>',
  flow: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/><path d="M10 6.5h3.5a3 3 0 0 1 3 3V14"/>',
  enter: '<path d="M19 5v7a3 3 0 0 1-3 3H5"/><path d="M9 11l-4 4 4 4"/>',
  command:
    '<path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
  thumb: '<path d="M7 10v10H4V10zM7 10l4-7c1.7 0 2.6 1.1 2.3 2.8L12.8 9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7"/>',
  smile: '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5c.9 1.2 2 1.8 3.5 1.8s2.6-.6 3.5-1.8M9 9.5h.01M15 9.5h.01"/>',
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
const INK_FILL = solid(token('text'));
const CORAL_FILL = solid(token('primary'));

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
 * A browser window: the panel, its bar with the lights at the start and the address in the
 * middle, and the hairline under the bar.
 */
function browser(name: string, frame: Frame, url: string, extra?: (dir: Dir, w: number) => string): Element[] {
  const { w } = frame;
  const bar = (dir: Dir) =>
    svg(
      w,
      52,
      LIGHTS.map((c, i) => `<circle cx="${bx(dir, w, 28 + i * 22)}" cy="26" r="6.5" fill="${c}"/>`).join('') +
        `<rect x="${w / 2 - 170}" y="12" width="340" height="28" rx="14" fill="${CANVAS}"/>` +
        icon('lock', w / 2 - 6 - wide(url, 15) / 2 - 12, 18.5, 15, MUTED, 2.2) +
        `<text x="${w / 2 + 6}" y="31" text-anchor="middle" ${UI} font-size="15" fill="${MUTED}">${esc(url)}</text>` +
        (extra ? extra(dir, w) : ''),
    );
  return [
    panel(`d_mutzar_${name}_window`, frame, 22),
    rect(`d_mutzar_${name}_window_rule`, { x: frame.x, y: frame.y + 52, w, h: 1 }, solid(token('text', 0.08))),
    lettered(`d_mutzar_${name}_window_bar`, { x: frame.x, y: frame.y, w, h: 52 }, bar),
  ];
}

/**
 * A multiplayer cursor: the arrow, pointing up and towards the start, and its name tag. The
 * frame's top corner at the start side is the arrow's tip.
 */
function cursor(id: string, top: [number, number], color: string, name: Words, ink = WHITE): Element {
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
function keycap(id: string, frame: Frame, glyph: (cx: number, cy: number, s: number) => string, tilt = 0): Element {
  const { w, h } = frame;
  // Room for the shadow, and for the corners of a tilted key.
  const pad = Math.round(24 + Math.abs(Math.sin((tilt * Math.PI) / 180)) * 0.5 * Math.max(w, h));
  const kw = w - 2 * pad;
  const kh = h - 2 * pad;
  const r = Math.min(kw, kh) * 0.2;
  const face = kh - kh * 0.1;
  const body =
    `<defs><filter id="s" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="${kh * 0.07}" stdDeviation="${kh * 0.06}" flood-color="#3b2414" flood-opacity=".18"/></filter>` +
    `<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${WHITE}"/><stop offset="1" stop-color="#f7f5f1"/></linearGradient></defs>` +
    `<g transform="rotate(${tilt} ${w / 2} ${h / 2})" filter="url(#s)">` +
    `<rect x="${pad}" y="${pad}" width="${kw}" height="${kh}" rx="${r}" fill="${KEY_EDGE}"/>` +
    `<rect x="${pad}" y="${pad}" width="${kw}" height="${face}" rx="${r}" fill="url(#t)" stroke="${INK}" stroke-opacity=".08" stroke-width="1.5"/>` +
    glyph(w / 2, pad + face / 2, Math.min(kw, face)) +
    `</g>`;
  return lettered(id, frame, svg(w, h, body));
}

const keyIcon = (name: Icon, color = INK) => (cx: number, cy: number, s: number) =>
  icon(name, cx - s * 0.2, cy - s * 0.2, s * 0.4, color, 2.1);
const keyLetter = (letter: string) => (cx: number, cy: number, s: number) =>
  `<text x="${cx}" y="${cy + s * 0.15}" text-anchor="middle" font-family="Manrope, Inter, sans-serif" font-weight="600" font-size="${s * 0.42}" fill="${INK}">${letter}</text>`;

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
        say(dir, w, w / 2, h / 2 + 5.5, 16, words, `font-weight="700" letter-spacing="${dir === 'rtl' ? 0 : 1}" fill="${filled ? WHITE : color}"`, 'middle'),
    ),
  );
}

/** A square of colour with a white icon in it: the mark of a feature or a step. */
function tile(id: string, frame: Frame, name: Icon, color: string, soft = false): Element {
  const s = frame.w;
  return drawing(
    id,
    frame,
    svg(
      s,
      s,
      `<rect width="${s}" height="${s}" rx="${s * 0.28}" fill="${color}" fill-opacity="${soft ? 0.13 : 1}"/>` +
        icon(name, s * 0.24, s * 0.24, s * 0.52, soft ? color : WHITE, 2.1),
    ),
    PAINT,
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
        `<path d="M${bx(dir, w, 38) - 7} ${h / 2}l4.6 4.6 9-9" transform="${dir === 'rtl' ? `translate(${2 * bx(dir, w, 38)} 0) scale(-1 1)` : ''}" stroke="${WHITE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>` +
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
function presence(name: string): Element {
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
        say(dir, w, 186, 30, 17, w2('שיתוף', 'Share'), `font-weight="600" fill="${WHITE}"`, 'middle'),
    );
  return lettered(`d_mutzar_${name}_presence`, atEnd(END, 94, w, h), draw);
}

// ---------------------------------------------------------------------------------------------
// What the layouts share

/** The start of the text column and the end margin. */
const START = 120;
const END = 120;
const WIDTH = 1920 - START - END;

/** The kicker with a live dot before it, and the title under it. */
function head(name: string, width = 1180, lines = 1) {
  return {
    placeholders: [
      place('p_kicker', 'caption', at(START + 30, 92, Math.min(900, width - 30), 34), 'caption'),
      place('p_title', 'title', at(START, 134, width, 70 * lines), 'title'),
    ],
    decorations: liveDot(name, 92),
  };
}

function liveDot(name: string, top: number): Element[] {
  return [
    dot(`d_mutzar_${name}_live_halo`, at(START - 3, top + 4, 26, 26), solid(token('primary', 0.18))),
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
  const xy = pts.map((v, i) => [left + (i * (right - left)) / (pts.length - 1), bottom - v * (bottom - top)] as const);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const [lx, ly] = xy[xy.length - 1]!;
  const grid = [0, 1, 2, 3]
    .map((i) => `<path d="M${left} ${top + (i * (bottom - top)) / 3}H${right}" stroke="${INK}" stroke-opacity=".07" stroke-width="1.5" stroke-dasharray="${i === 3 ? '' : '4 6'}"/>`)
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
const NAMES: Words[] = [w2('נועה', 'Noa'), w2('יואב', 'Yoav'), w2('איתן', 'Eitan'), w2('מאיה', 'Maya')];

function layouts(): Layout[] {
  const palette = at(START, 214, 1180, 668);
  const textWindow = atEnd(END, 96, 740, 836);
  const shot = { x: 96, y: 96, w: 1728, h: 568 };
  return [
    {
      id: 'l_mutzar_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        place('p_kicker', 'caption', at(START + 104, 151, 780, 34), 'caption'),
        place('p_title', 'title', at(START + 124, 244, 1010, 240), 'display'),
        place('p_subtitle', 'subtitle', at(START + 132, 560, 850, 140), 'heading', { vAlign: 'middle' }),
        place('p_meta', 'caption', at(START + 44, 826, 720, 34), 'caption'),
      ],
      decorations: [
        board('hero'),
        glow('d_mutzar_hero_glow', atEnd(-260, 80, 1100, 980), CORAL, 0.2),
        glow('d_mutzar_hero_glow2', at(380, -120, 1000, 640), VIOLET, 0.1),
        badge('d_mutzar_hero_new', at(START, 150, 86, 36), w2('חדש', 'NEW'), CORAL, true),
        rect('d_mutzar_hero_palette', palette, WHITE_FILL, {
          stroke: HAIR,
          effects: { radius: 30, shadow: { x: 0, y: 40, blur: 90, color: { value: '#3b2414', alpha: 0.14 } } },
        }),
        drawing(
          'd_mutzar_hero_search',
          at(START + 40, 272, 60, 60),
          svg(60, 60, icon('search', 6, 6, 48, CORAL, 2.4)),
          PAINT,
        ),
        rect('d_mutzar_hero_rule', at(START, 506, 1180, 1), solid(token('text', 0.08))),
        lettered('d_mutzar_hero_group', at(START + 44, 516, 400, 26), (dir) =>
          svg(400, 26, say(dir, 400, 0, 19, 16, w2('הצעות', 'SUGGESTED'), `font-weight="600" letter-spacing="${dir === 'rtl' ? 0 : 1.2}" fill="${MUTED}"`)),
        ),
        rect('d_mutzar_hero_selected', at(START + 20, 546, 1140, 168), solid(token('primary', 0.07)), {
          effects: { radius: 18 },
        }),
        rect('d_mutzar_hero_selected_bar', at(START + 20, 570, 5, 120), CORAL_FILL, { effects: { radius: 3 } }),
        tile('d_mutzar_hero_selected_icon', at(START + 48, 598, 64, 64), 'sparkles', CORAL),
        keycap('d_mutzar_hero_enter', at(START + 1048, 590, 104, 92), keyIcon('enter')),
        lettered('d_mutzar_hero_row', at(START + 20, 724, 1140, 64), (dir) =>
          svg(
            1140,
            64,
            `<rect x="${bx(dir, 1140, 28, 44)}" y="10" width="44" height="44" rx="12" fill="${VIOLET}" fill-opacity=".13"/>` +
              icon('users', bx(dir, 1140, 38, 24), 20, 24, VIOLET, 2.1) +
              say(dir, 1140, 112, 40, 24, w2('הזמנת הצוות לסביבת העבודה', 'Invite your team to the workspace'), `fill="${INK}" fill-opacity=".72"`) +
              [0, 1]
                .map((i) => {
                  const x = bx(dir, 1140, 1140 - 28 - (i === 0 ? 76 : 36), 36);
                  return `<rect x="${x}" y="14" width="36" height="36" rx="9" fill="${CANVAS}" stroke="${INK}" stroke-opacity=".1"/>`;
                })
                .join('') +
              icon('command', bx(dir, 1140, 1140 - 104 + 9, 18), 23, 18, MUTED, 2) +
              `<text x="${bx(dir, 1140, 1140 - 64 + 18)}" y="38.5" text-anchor="middle" ${UI} font-size="17" font-weight="600" fill="${MUTED}">I</text>`,
          ),
        ),
        rect('d_mutzar_hero_foot_rule', at(START, 802, 1180, 1), solid(token('text', 0.08))),
        lettered('d_mutzar_hero_hints', at(START + 800, 828, 356, 30), (dir) => {
          const w = 356;
          const key = (s: number, kw: number, glyph: string) =>
            `<rect x="${bx(dir, w, s, kw)}" y="1" width="${kw}" height="28" rx="7" fill="${CANVAS}" stroke="${INK}" stroke-opacity=".1"/>` +
            `<text x="${bx(dir, w, s + kw / 2)}" y="20.5" text-anchor="middle" ${UI} font-size="15" font-weight="600" fill="${MUTED}">${glyph}</text>`;
          // Towards the end side: the arrows and what they do, the return key, then escape.
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
        keycap('d_mutzar_hero_cmd', atEnd(140, 236, 290, 290), keyIcon('command'), -9),
        keycap('d_mutzar_hero_k', atEnd(318, 318, 290, 290), keyLetter('K'), 7),
        cursor('d_mutzar_hero_cursor1', [1920 - 640, 300], CORAL, NAMES[0]!),
        cursor('d_mutzar_hero_cursor2', [1920 - 300, 600], VIOLET, NAMES[1]!),
        ...toast('hero', atEnd(110, 690, 450, 76), w2('גרסה 2.0 באוויר', 'Version 2.0 is live'), w2('לצפייה', 'View')),
      ],
    },
    {
      id: 'l_mutzar_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        place('p_number', 'number', atEnd(270, 408, 360, 180), 'display', {
          align: 'center',
          vAlign: 'middle',
          color: token('primary'),
        }),
        place('p_kicker', 'caption', at(START + 30, 334, 760, 34), 'caption'),
        place('p_title', 'title', at(START, 380, 960, 240), 'display'),
        place('p_subtitle', 'subtitle', at(START, 642, 900, 110), 'heading'),
      ],
      decorations: [
        board('section'),
        glow('d_mutzar_section_glow', atEnd(40, 160, 840, 760), CORAL, 0.16),
        ...liveDot('section', 334),
        keycap('d_mutzar_section_key', atEnd(194, 274, 512, 472), () => ''),
        lettered('d_mutzar_section_legend', atEnd(254, 322, 392, 30), (dir) =>
          svg(392, 30, say(dir, 392, 8, 22, 18, w2('פרק', 'PART'), `font-weight="600" letter-spacing="${dir === 'rtl' ? 0 : 1.5}" fill="${MUTED}"`)),
        ),
        drawing(
          'd_mutzar_section_legend_mark',
          atEnd(262, 650, 40, 40),
          svg(40, 40, icon('enter', 6, 6, 28, MUTED, 2)),
          PAINT,
        ),
        keycap('d_mutzar_section_cmd', atEnd(90, 150, 190, 190), keyIcon('command'), -12),
        keycap('d_mutzar_section_k', atEnd(610, 690, 180, 170), keyLetter('K'), 10),
        cursor('d_mutzar_section_cursor', [1920 - 610, 640], MINT, NAMES[3]!),
      ],
    },
    {
      id: 'l_mutzar_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head('big_number').placeholders,
        place('p_number', 'number', at(START + 48, 314, 820, 124), 'display', { color: token('primary') }),
        place('p_label', 'subtitle', at(START + 48, 444, 820, 53), 'heading'),
        place('p_body', 'body', at(START + 48, 506, 800, 135), 'body'),
        ...cards3.flatMap((start, i) => [
          place(`p_stat${i + 1}`, 'number', at(start + 104, 724, 404, 79), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', at(start + 28, 810, 480, 68), 'caption'),
        ]),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        board('big_number'),
        ...head('big_number').decorations,
        presence('big_number'),
        ...browser('big_number', at(START, 236, WIDTH, 450), 'zrima.app/insights'),
        areaChart('d_mutzar_big_number_curve', atEnd(END + 36, 316, 760, 340)),
        ...cards3.flatMap((start, i) => [
          panel(`d_mutzar_big_number_tile${i + 1}`, at(start, 708, 536, 196), 20, LIFT_SM),
          tile(`d_mutzar_big_number_icon${i + 1}`, at(start + 28, 736, 56, 56), (['users', 'clock', 'shield'] as const)[i]!, [CORAL, VIOLET, MINT][i]!, true),
        ]),
        ...foot('big_number').decorations,
      ],
    },
    {
      id: 'l_mutzar_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(START + 128, 366, 1424, 360), 'title'),
        place('p_attribution', 'attribution', at(START + 228, 220, 1000, 53), 'heading'),
        place('p_caption', 'caption', at(START + 228, 274, 1000, 68), 'caption'),
        ...foot('quote').placeholders,
      ],
      decorations: [
        board('quote'),
        glow('d_mutzar_quote_glow', atEnd(-200, 500, 900, 700), VIOLET, 0.12),
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
          return svg(w, 48, chip(0, 100, 'heart', '48', true) + chip(114, 100, 'thumb', '31', false) + chip(228, 58, 'smile', '', false));
        }),
        lettered('d_mutzar_quote_reply', at(START + 128, 810, 1424, 50), (dir) =>
          svg(
            1424,
            50,
            `<rect x="1" y="1" width="1422" height="48" rx="24" fill="${CANVAS}" stroke="${INK}" stroke-opacity=".08"/>` +
              say(dir, 1424, 28, 32, 19, w2('השב או הזכר מישהו עם @', 'Reply, or mention someone with @'), `fill="${MUTED}"`) +
              `<circle cx="${bx(dir, 1424, 1424 - 25)}" cy="25" r="19" fill="${CORAL}"/>` +
              icon('send', bx(dir, 1424, 1424 - 25) - 10, 15, 20, WHITE, 2.6),
          ),
        ),
        drawing(
          'd_mutzar_quote_pin',
          at(START + 4, 128, 84, 92),
          svg(
            84,
            92,
            `<defs><filter id="p" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#3b2414" flood-opacity=".2"/></filter></defs>` +
              `<path d="M42 86C42 86 4 82 4 44a38 38 0 1 1 76 0c0 30-26 42-38 42z" transform="translate(84 0) scale(-1 1)" fill="${WHITE}" filter="url(#p)"/>` +
              `<circle cx="42" cy="44" r="29" fill="${VIOLET}"/>` +
              icon('page', 28, 30, 28, WHITE, 2.2),
          ),
          PAINT,
        ),
        cursor('d_mutzar_quote_cursor', [START + 128 + 74, 790], VIOLET, NAMES[2]!),
        ...foot('quote').decorations,
      ],
    },
    {
      id: 'l_mutzar_text',
      name: 'Text',
      archetype: 'text',
      placeholders: [
        place('p_title', 'title', at(START + 116, 162, 1300, 70), 'title'),
        place('p_body', 'body', at(START + 36, 286, 1590, 640), 'body'),
      ],
      decorations: [
        board('text'),
        ...browser('text', at(START - 24, 64, WIDTH + 48, 920), 'zrima.app/docs/launch-night'),
        tile('d_mutzar_text_icon', at(START + 36, 164, 62, 62), 'page', CORAL, true),
        rect('d_mutzar_text_rule', at(START + 36, 256, WIDTH - 72, 1), solid(token('text', 0.08))),
        cursor('d_mutzar_text_cursor', [1920 - 268, 930], MINT, NAMES[3]!),
      ],
    },
    {
      id: 'l_mutzar_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head('text_image', 860, 2).placeholders,
        place('p_image', 'image', atEnd(END + 12, 148, 716, 772)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(START + 92, top, 768, 53), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(START + 92, top + 56, 768, 132), 'body'),
        ]),
        ...foot('text_image').placeholders,
      ],
      decorations: [
        board('text_image'),
        ...head('text_image', 860, 2).decorations,
        ...browser('text_image', textWindow, 'zrima.app/builder'),
        ...rows3.map((top, i) => toggle(`d_mutzar_text_image_switch${i + 1}`, at(START, top + 8, 68, 38), true)),
        cursor('d_mutzar_text_image_cursor', [1920 - 330, 924], VIOLET, NAMES[2]!),
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
        rect('d_mutzar_full_image_mat', { x: 86, y: 86, w: 1748, h: 588 }, solid(token('surface')), {
          effects: { shadow: LIFT },
        }),
        rect('d_mutzar_full_image_selection', { x: 86, y: 86, w: 1748, h: 588 }, { kind: 'none' }, {
          stroke: { color: token('primary'), width: 2.5 },
        }),
        ...[
          [79, 79],
          [1827, 79],
          [79, 667],
          [1827, 667],
        ].map(([x, y], i) =>
          rect(`d_mutzar_full_image_handle${i + 1}`, { x: x!, y: y!, w: 14, h: 14 }, WHITE_FILL, {
            stroke: { color: token('primary'), width: 2.5 },
          }),
        ),
        lettered('d_mutzar_full_image_label', at(96, 46, 420, 30), (dir) =>
          svg(
            420,
            30,
            `<path d="M${bx(dir, 420, 4)} 8v14M${bx(dir, 420, 16)} 8v14M${bx(dir, 420, 0)} 12h${dir === 'rtl' ? -20 : 20}M${bx(dir, 420, 0)} 18h${dir === 'rtl' ? -20 : 20}" stroke="${CORAL}" stroke-width="2" stroke-linecap="round"/>` +
              say(dir, 420, 32, 21, 17, w2('מסך הבית · Zrima 2.0', 'Home screen · Zrima 2.0'), `font-weight="600" fill="${CORAL}"`),
          ),
        ),
        lettered(
          'd_mutzar_full_image_size',
          { x: 960 - 76, y: 690, w: 152, h: 32 },
          svg(152, 32, `<rect width="152" height="32" rx="8" fill="${CORAL}"/><text x="76" y="22" text-anchor="middle" ${UI} font-size="16" font-weight="600" fill="${WHITE}">1728 × 568</text>`),
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
          place(`p_card${i + 1}_note`, 'caption', at(start + 28, 352, 480, 68), 'caption'),
          place(`p_card${i + 1}`, 'subtitle', at(start + 28, 424, 480, 100), 'heading'),
          place(`p_card${i + 1}_body`, 'body', at(start + 28, 530, 480, 210), 'body'),
        ]),
        place('p_takeaway', 'body', at(START + 96, 798, WIDTH - 130, 90), 'body', { vAlign: 'middle' }),
        ...foot('cards').placeholders,
      ],
      decorations: [
        board('cards'),
        ...head('cards').decorations,
        presence('cards'),
        ...cards3.flatMap((start, i) => [
          panel(`d_mutzar_cards_card${i + 1}`, at(start, 244, 536, 522), 24),
          tile(`d_mutzar_cards_icon${i + 1}`, at(start + 28, 272, 60, 60), (['sparkles', 'plug', 'shield'] as const)[i]!, [CORAL, VIOLET, MINT][i]!),
          badge(
            `d_mutzar_cards_badge${i + 1}`,
            at(start + 104, 286, 92, 32),
            i === 2 ? w2('בטא', 'BETA') : w2('חדש', 'NEW'),
            i === 2 ? VIOLET : CORAL,
          ),
          toggle(`d_mutzar_cards_switch${i + 1}`, at(start + 536 - 28 - 76, 282, 76, 40), true),
          rect(`d_mutzar_cards_rule${i + 1}`, at(start + 28, 340, 480, 1), solid(token('text', 0.07))),
        ]),
        rect('d_mutzar_cards_banner', at(START, 790, WIDTH, 106), solid(token('primary', 0.07)), {
          effects: { radius: 20 },
        }),
        rect('d_mutzar_cards_banner_bar', at(START, 812, 5, 62), CORAL_FILL, { effects: { radius: 3 } }),
        drawing(
          'd_mutzar_cards_banner_icon',
          at(START + 30, 819, 48, 48),
          svg(48, 48, `<circle cx="24" cy="24" r="23" fill="${CORAL}"/>${icon('bolt', 12, 12, 24, WHITE, 2.2)}`),
          PAINT,
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
          place(`p_when${i + 1}`, 'number', at(start, 290, 390, 79), 'title', { vAlign: 'bottom' }),
          place(`p_what${i + 1}`, 'subtitle', at(start + 28, 476, 340, 106), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start + 28, 588, 340, 170), 'caption'),
        ]),
        place('p_note', 'caption', at(START + 30, 836, WIDTH - 30, 34), 'caption'),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        board('timeline'),
        ...head('timeline').decorations,
        presence('timeline'),
        rect('d_mutzar_timeline_track', at(START, 398, WIDTH, 10), solid(token('text', 0.08)), {
          effects: { radius: 5 },
        }),
        rect('d_mutzar_timeline_progress', at(START, 398, 449, 10), CORAL_FILL, { effects: { radius: 5 } }),
        dot('d_mutzar_timeline_halo', at(START + 429 - 12, 371, 64, 64), solid(token('primary', 0.16))),
        ...columns4.flatMap((start, i) => {
          const badges: [Words, string][] = [
            [w2('זמין', 'GA'), MINT],
            [w2('זמין · עכשיו', 'GA · NOW'), CORAL],
            [w2('בטא', 'BETA'), VIOLET],
            [w2('בתכנון', 'PLANNED'), INK],
          ];
          const [words, color] = badges[i]!;
          return [
            badge(`d_mutzar_timeline_badge${i + 1}`, at(start, 250, i === 1 ? 150 : 104, 34), words, color, i === 1),
            panel(`d_mutzar_timeline_card${i + 1}`, at(start, 452, 390, 330), 22, LIFT_SM),
            rect(`d_mutzar_timeline_stem${i + 1}`, at(start + 18, 420, 4, 32), solid(token(i < 2 ? 'primary' : 'text', i < 2 ? 1 : 0.14))),
            i < 2
              ? drawing(
                  `d_mutzar_timeline_node${i + 1}`,
                  at(start, 383, 40, 40),
                  svg(40, 40, `<circle cx="20" cy="20" r="18" fill="${CORAL}" stroke="${WHITE}" stroke-width="${i === 1 ? 4 : 0}"/>${icon('check', 9, 9, 22, WHITE, 3)}`),
                  PAINT,
                )
              : drawing(
                  `d_mutzar_timeline_node${i + 1}`,
                  at(start, 383, 40, 40),
                  svg(40, 40, `<circle cx="20" cy="20" r="16" fill="${WHITE}" stroke="${i === 2 ? VIOLET : INK}" stroke-opacity="${i === 2 ? 1 : 0.35}" stroke-width="4" stroke-dasharray="${i === 2 ? '' : '5 4'}"/>`),
                  PAINT,
                ),
          ];
        }),
        cursor('d_mutzar_timeline_cursor', [START + 429 + 34, 412], CORAL, w2('אנחנו כאן', 'We are here')),
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
          place(`p_step${i + 1}`, 'subtitle', at(start + 28, 408, 296, 106), 'heading'),
          place(`p_step${i + 1}_body`, 'caption', at(start + 28, 516, 296, 136), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start + 28, 676, 296, 79), 'title', {
            color: token('primary'),
          }),
        ]),
        place('p_summary', 'body', at(START + 100, 822, WIDTH - 140, 90), 'body', { vAlign: 'middle' }),
        ...foot('process').placeholders,
      ],
      decorations: [
        board('process'),
        ...head('process').decorations,
        presence('process'),
        panel('d_mutzar_process_panel', at(START, 236, WIDTH, 556), 26),
        lettered('d_mutzar_process_progress_label', at(START + 36, 256, 600, 34), (dir) =>
          svg(600, 34, say(dir, 600, 0, 24, 19, w2('הקמת סביבת העבודה · 4 מתוך 5', 'Workspace setup · 4 of 5'), `font-weight="600" fill="${INK}"`)),
        ),
        rect('d_mutzar_process_progress_track', atEnd(END + 36, 266, 560, 12), solid(token('text', 0.08)), {
          effects: { radius: 6 },
        }),
        rect('d_mutzar_process_progress', at(1920 - END - 36 - 560, 266, 448, 12), CORAL_FILL, {
          effects: { radius: 6 },
        }),
        rect('d_mutzar_process_rule', at(START, 308, WIDTH, 1), solid(token('text', 0.07))),
        ...steps5.flatMap((start, i) => [
          i < 4
            ? drawing(
                `d_mutzar_process_dot${i + 1}`,
                at(start + 28, 334, 52, 52),
                svg(52, 52, `<circle cx="26" cy="26" r="24" fill="${CORAL}"/>${icon('check', 14, 14, 24, WHITE, 3)}`),
                PAINT,
              )
            : drawing(
                `d_mutzar_process_dot${i + 1}`,
                at(start + 28, 334, 52, 52),
                svg(52, 52, `<circle cx="26" cy="26" r="22" fill="${WHITE}" stroke="${CORAL}" stroke-width="4"/><circle cx="26" cy="26" r="8" fill="${CORAL}"/>`),
                PAINT,
              ),
          ...(i < 4
            ? [
                rect(
                  `d_mutzar_process_link${i + 1}`,
                  at(start + 96, 358, 336 - 84, 4),
                  i < 3 ? CORAL_FILL : solid(token('primary', 0.3)),
                  { effects: { radius: 2 } },
                ),
                rect(`d_mutzar_process_divider${i + 1}`, at(start + 336 - 6, 418, 1, 330), solid(token('text', 0.07))),
              ]
            : []),
        ]),
        rect('d_mutzar_process_toast', at(START, 814, WIDTH, 106), WHITE_FILL, {
          stroke: HAIR,
          effects: { radius: 22, shadow: LIFT_SM },
        }),
        drawing(
          'd_mutzar_process_toast_check',
          at(START + 32, 843, 48, 48),
          svg(48, 48, `<circle cx="24" cy="24" r="23" fill="${MINT}"/>${icon('check', 12, 12, 24, WHITE, 3)}`),
          PAINT,
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
          place(`p_${side}_tag`, 'caption', at(start + 132, 280, 650, 34), 'caption', color ? { color: token('surface', 0.78) } : {}),
          place(`p_${side}`, 'subtitle', at(start + 36, 348, 748, 106), 'heading', color ? { color } : {}),
          place(`p_${side}_body`, 'body', at(start + 36, 470, 748, 400), 'body', color ? { color } : {}),
        ]),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        board('comparison'),
        ...head('comparison').decorations,
        presence('comparison'),
        panel('d_mutzar_comparison_before', at(START, 240, 820, 666), 28, LIFT_SM),
        toggle('d_mutzar_comparison_before_switch', at(START + 36, 278, 76, 40), false),
        rect('d_mutzar_comparison_after', at(START + 860, 240, 820, 666), INK_FILL, {
          effects: { radius: 28, shadow: { x: 0, y: 30, blur: 70, color: { token: 'primary', alpha: 0.28 } } },
        }),
        toggle('d_mutzar_comparison_after_switch', at(START + 896, 278, 76, 40), true),
        rect('d_mutzar_comparison_after_rule', at(START + 896, 330, 748, 1), solid(token('surface', 0.12))),
        rect('d_mutzar_comparison_before_rule', at(START + 36, 330, 748, 1), solid(token('text', 0.07))),
        drawing(
          'd_mutzar_comparison_switch',
          at(START + 808, 541, 64, 64),
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
        place('p_chart', 'chart', at(START + 24, 352, 1032, 560)),
        place('p_stat1', 'number', atEnd(END, 256, 540, 124), 'display', { color: token('primary') }),
        place('p_stat1_body', 'body', atEnd(END, 384, 540, 135), 'body'),
        place('p_stat2', 'number', atEnd(END, 580, 540, 124), 'display', { color: token('secondary') }),
        place('p_stat2_body', 'body', atEnd(END, 708, 540, 100), 'body'),
        place('p_source', 'caption', atEnd(END, 850, 540, 68), 'caption'),
        ...foot('chart').placeholders,
      ],
      decorations: [
        board('chart'),
        ...head('chart').decorations,
        ...browser('chart', at(START, 236, 1080, 690), 'zrima.app/insights/adoption'),
        lettered('d_mutzar_chart_range', at(START + 28, 300, 380, 40), (dir) => {
          const w = 380;
          const opts = [w2('חודש', 'Month'), w2('רבעון', 'Quarter'), w2('שנה', 'Year')];
          return svg(
            w,
            40,
            `<rect width="${w}" height="40" rx="12" fill="${CANVAS}"/>` +
              `<rect x="${bx(dir, w, 4, 120)}" y="4" width="120" height="32" rx="9" fill="${WHITE}" stroke="${INK}" stroke-opacity=".08"/>` +
              opts.map((o, i) => say(dir, w, 64 + i * 124, 26, 16, o, `font-weight="600" fill="${i ? MUTED : INK}"`, 'middle')).join(''),
          );
        }),
        panel('d_mutzar_chart_stat1', atEnd(100, 236, 580, 300), 24, LIFT_SM),
        panel('d_mutzar_chart_stat2', atEnd(100, 560, 580, 270), 24, LIFT_SM),
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_mutzar_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head('table').placeholders,
        place('p_table', 'table', at(START + 24, 278, WIDTH - 48, 612)),
        place('p_note', 'caption', at(START + 30, 914, WIDTH - 30, 34), 'caption'),
        ...foot('table').placeholders,
      ],
      decorations: [
        board('table'),
        ...head('table').decorations,
        presence('table'),
        ...browser('table', at(START, 214, WIDTH, 690), 'zrima.app/pricing', (dir, w) => {
          // The views of the data at the start side, after the lights, and a search at the end.
          const views = [w2('טבלה', 'Table'), w2('לוח', 'Board'), w2('ציר זמן', 'Timeline')];
          return (
            views
              .map((v, i) => {
                const s = 110 + i * 96;
                return (
                  say(dir, w, s, 31, 16, v, `font-weight="600" fill="${i ? MUTED : INK}"`) +
                  (i === 0 ? `<rect x="${bx(dir, w, s, 44)}" y="48" width="44" height="3" rx="1.5" fill="${CORAL}"/>` : '')
                );
              })
              .join('') +
            `<rect x="${bx(dir, w, w - 24, 200)}" y="11" width="200" height="30" rx="15" fill="${CANVAS}"/>` +
            icon('search', bx(dir, w, w - 24 - 14, 16), 18, 16, MUTED, 2.2) +
            say(dir, w, w - 24 - 194 + 40, 31, 15, w2('חיפוש', 'Search'), `fill="${MUTED}"`)
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
          place(`p_person${i + 1}_photo`, 'image', at(start + 14, 250, 366, 340)),
          place(`p_person${i + 1}`, 'subtitle', at(start + 44, 612, 326, 52), 'heading', {
            vAlign: 'middle',
            color: token(i === 1 ? 'surface' : 'text'),
          }),
          place(`p_person${i + 1}_role`, 'caption', at(start + 14, 682, 366, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start + 14, 720, 366, 102), 'caption'),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: [
        board('team'),
        ...head('team').decorations,
        presence('team'),
        ...columns4.flatMap((start, i) => [
          panel(`d_mutzar_team_card${i + 1}`, at(start, 236, 394, 610), 26, LIFT_SM),
          rect(`d_mutzar_team_tag${i + 1}`, at(start + 14, 608, 366, 60), solid({ value: PEOPLE[i]! }), {
            effects: { radius: 14 },
          }),
          drawing(
            `d_mutzar_team_arrow${i + 1}`,
            at(start + 2, 594, 30, 36),
            svg(30, 36, `<path d="M28 2v26l-7-6.6-4.6 10.4-4.6-2 4.6-10.2H5z" fill="${PEOPLE[i]}" stroke="${WHITE}" stroke-width="2.4" stroke-linejoin="round"/>`),
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
          place(`p_line${i + 1}`, 'body', at(START + 40, top + 6, 720, 92), 'body', {
            vAlign: 'middle',
            ...(i === 0 ? { color: token('surface') } : {}),
          }),
        ),
        place('p_contact', 'caption', at(START + 46, 862, 800, 34), 'caption'),
      ],
      decorations: [
        board('closing'),
        glow('d_mutzar_closing_glow', atEnd(-240, 120, 1100, 900), CORAL, 0.18),
        ...liveDot('closing', 150),
        ...buttons3.flatMap((top, i) => [
          rect(
            `d_mutzar_closing_button${i + 1}`,
            at(START, top, 860, 104),
            i === 0 ? INK_FILL : i === 1 ? WHITE_FILL : solid(token('primary', 0.1)),
            {
              ...(i === 1 ? { stroke: { color: token('text', 0.14), width: 1.5 } } : {}),
              effects: { radius: 52, ...(i === 0 ? { shadow: { x: 0, y: 16, blur: 36, color: { value: '#3b2414', alpha: 0.22 } } } : {}) },
            },
          ),
          drawing(
            `d_mutzar_closing_button${i + 1}_icon`,
            at(START + 860 - 30 - 48, top + 28, 48, 48),
            svg(
              48,
              48,
              `<circle cx="24" cy="24" r="23" fill="${i === 0 ? CORAL : i === 1 ? INK : CORAL}" fill-opacity="${i === 1 ? 0.06 : 1}"/>` +
                icon((['arrow', 'play', 'tag'] as const)[i]!, 12, 12, 24, i === 1 ? INK : WHITE, 2.4),
            ),
            PAINT,
          ),
        ]),
        drawing('d_mutzar_closing_mail', at(START, 864, 32, 30), svg(32, 30, icon('mail', 2, 1, 28, CORAL, 2.2)), PAINT),
        keycap('d_mutzar_closing_cmd', atEnd(170, 300, 270, 270), keyIcon('command'), -8),
        keycap('d_mutzar_closing_enter', atEnd(380, 390, 270, 250), keyIcon('enter', CORAL), 6),
        ...toast('closing', atEnd(130, 170, 470, 76), w2('התהליך פורסם', 'Workflow published'), w2('פתיחה', 'Open')),
        cursor('d_mutzar_closing_cursor', [START + 860 - 78, 540], VIOLET, NAMES[1]!),
        dot('d_mutzar_closing_click', at(START + 860 - 78 - 22, 518, 44, 44), { kind: 'none' }, {
          stroke: { color: token('secondary', 0.5), width: 2.5 },
        }),
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
        return (ltr ? { ...rest, markup: ltr } : rest) as Element;
      }),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The sample: the launch night of Zrima 2.0, workflow automation for operations teams

const FOOTER_HE = text('Zrima 2.0 · ערב ההשקה · דצמבר 2026');
const FOOTER_EN = text('Zrima 2.0 · Launch night · December 2026');
const ADOPTION = [12, 21, 38, 74, 118, 162];
const TABLE_COLS = [520, 352, 352, 408];
const TABLE_ROW = 96;

const TEAM_PICTURES = () => [
  { assetId: pictures.mutzarTeam1.id },
  { assetId: pictures.mutzarTeam2.id },
  { assetId: pictures.mutzarTeam3.id },
  { assetId: pictures.mutzarTeam4.id },
];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_mutzar_hero',
    name: 'פתיחה',
    content: {
      caption: [text('ערב ההשקה · Zrima 2.0'), text('נועה ברק, מנכ״לית · תל אביב · 8.12.2026')],
      title: text('התפעול', 'על טייס אוטומטי'),
      subtitle: text('Zrima 2.0 מחברת את כל המערכות של צוות התפעול, ומריצה בשבילכם את העבודה שחוזרת על עצמה.'),
    },
  },
  {
    layout: 'l_mutzar_section',
    name: 'מה חדש',
    content: {
      number: text('01'),
      caption: text('חלק ראשון'),
      title: text('מה חדש ב-2.0'),
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
          para('ארבעה נושאים, ואחריהם הדגמה חיה על הבמה:'),
          ...bullets(
            'מה חדש בבונה התהליכים',
            'מה למדנו מ-4,200 צוותים בבטא',
            'המסלולים והמחירים החדשים',
            'מה מגיע ב-2027',
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
      caption: [text('שלוש יכולות חדשות'), text('אוטומציה'), text('חיבורים'), text('אבטחה')],
      title: text('מה נכנס לגרסה 2.0'),
      subtitle: [text('סוכני AI'), text('400 חיבורים'), text('הרשאות לכל שלב')],
      body: [
        text('סוכן שמסווג פניות חוזרות, עונה עליהן ומעביר לאדם כשצריך.'),
        text('מהנהלת החשבונות ועד המחסן: חיבור חדש לוקח שתי דקות, בלי קוד.'),
        text('כל שלב רץ בהרשאות המינימליות, וכל פעולה נרשמת ביומן.'),
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
      image: { assetId: pictures.mutzarBuilderHe.id },
      subtitle: [text('גוררים ומחברים'), text('AI שמציע את הצעד הבא'), text('בדיקה לפני פרסום')],
      body: [
        text('כל שלב הוא כרטיס על הקנבס. מותחים חץ, והנתונים עוברים לבד בין המערכות.'),
        text('מתארים במילים מה צריך לקרות, ו-Zrima בונה טיוטה של התהליך.'),
        text('מריצים על נתונים אמיתיים בסביבה סגורה, ורק אז מעלים לאוויר.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_mutzar_timeline',
    name: 'מפת הדרכים',
    content: {
      caption: [text('מפת הדרכים'), text('התאריכים של 2.1 ו-3.0 הם יעד, ועשויים להשתנות.')],
      title: text('מ-1.0 ועד 3.0'),
      number: [text('v1.0'), text('v2.0'), text('v2.1'), text('v3.0')],
      subtitle: [text('הבסיס'), text('בונה חדש ו-AI'), text('אפליקציה לנייד'), text('תהליכים בין חברות')],
      body: [
        text('2025: ארבעים חיבורים ותהליכים פשוטים לצוותים קטנים.'),
        text('דצמבר 2026: הבונה, סוכני AI ו-400 חיבורים.'),
        text('פברואר 2027: אישורים והתראות מהטלפון, בבטא פתוחה.'),
        text('סוף 2027: ספקים ולקוחות שותפים לאותו תהליך.'),
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
        text('חשבון חינם, בלי כרטיס אשראי'),
        text('מחברים את המערכות שכבר יש'),
        text('כל אחד עם ההרשאות שלו'),
        text('בוחרים תבנית או מתארים במילים'),
        text('סיכום שבועי של הזמן שנחסך'),
      ],
      title: text('רבע שעה עד התהליך הראשון'),
      subtitle: [text('הרשמה'), text('חיבור'), text('הזמנת הצוות'), text('אוטומציה'), text('דוח')],
      number: [text('1 דק׳'), text('3 דק׳'), text('1 דק׳'), text('10 דק׳'), text('כל שבוע')],
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
      title: text('תהליכים פעילים, באלפים'),
      number: [text('×13'), text('92%')],
      body: [text('גידול בתהליכים הפעילים מאז תחילת הבטא ביוני.'), text('מהצוותים עדיין פעילים אחרי 60 יום.')],
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
      caption: [text('מסלולים ומחירים'), text('מחירי השקה, בתוקף עד 31.1.2027 לכל מי שנרשם עכשיו.')],
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
      image: { assetId: pictures.mutzarHeroHe.id },
      caption: text('מסך הבית החדש'),
      title: text('לוח בקרה אחד', 'לכל התפעול'),
      body: text('הזמנות, מלאי, ספקים ופניות בזמן אמת, על מסך אחד שכל הצוות רואה.'),
    },
  },
  {
    layout: 'l_mutzar_quote',
    name: 'ציטוט',
    content: {
      quote: text('פעם העתקנו כל הזמנה בין שש מערכות. היום הצוות שלי מטפל רק בחריגים, וכל השאר זורם לבד.'),
      attribution: text('רותם אלון'),
      caption: text('מנהלת תפעול ברשת חנויות לציוד ספורט · לקוחה מהבטא'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_mutzar_team',
    name: 'המייסדים',
    content: {
      caption: [text('המייסדים'), text('מנכ״לית'), text('CTO'), text('סמנכ״ל מוצר'), text('מובילת עיצוב')],
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
      subtitle: text('Zrima 2.0 connects every tool your operations team uses, and runs the repetitive work for you.'),
    },
  },
  {
    layout: 'l_mutzar_section',
    name: "What's new",
    content: {
      number: text('01'),
      caption: text('Part one'),
      title: text("What's new in 2.0"),
      subtitle: text("Three things you asked for, and one you didn't see coming."),
    },
  },
  {
    layout: 'l_mutzar_text',
    name: 'Agenda',
    content: {
      title: text("Tonight's agenda"),
      body: {
        paragraphs: [
          para('Four topics, then a live demo on stage:'),
          ...bullets(
            "What's new in the workflow builder",
            'What 4,200 beta teams taught us',
            'The new plans and prices',
            "What's coming in 2027",
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
      body: text('Teams built 14 workflows on average in their first week, then let them run.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_cards',
    name: 'Three capabilities',
    content: {
      caption: [text('Three new capabilities'), text('Automation'), text('Integrations'), text('Security')],
      title: text("What's in version 2.0"),
      subtitle: [text('AI agents'), text('400 integrations'), text('Per-step access')],
      body: [
        text('An agent that sorts repeat requests, answers them, and hands off to a person.'),
        text('From finance to the warehouse: a new connection takes two minutes, no code.'),
        text('Each step runs with the least access it needs, and every action is logged.'),
        text('All three are live tonight for every customer, at no extra cost.'),
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
      image: { assetId: pictures.mutzarBuilderEn.id },
      subtitle: [text('Drag and connect'), text('AI drafts the next step'), text('Test before you publish')],
      body: [
        text('Every step is a card on the canvas. Draw an arrow, and data flows between your tools.'),
        text('Describe what should happen, and Zrima drafts the workflow for you.'),
        text('Run it on real data in a sandbox, and only then take it live.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_timeline',
    name: 'Roadmap',
    content: {
      caption: [text('Roadmap'), text('Dates for 2.1 and 3.0 are targets and may change.')],
      title: text('From 1.0 to 3.0'),
      number: [text('v1.0'), text('v2.0'), text('v2.1'), text('v3.0')],
      subtitle: [text('The foundation'), text('New builder and AI'), text('Mobile app'), text('Cross-company flows')],
      body: [
        text('2025: forty integrations and simple flows for small teams.'),
        text('December 2026: the builder, AI agents and 400 integrations.'),
        text('February 2027: approvals and alerts on your phone, in open beta.'),
        text('Late 2027: suppliers and customers share one workflow.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_process',
    name: 'Onboarding',
    content: {
      caption: [
        text('From sign-up to automation'),
        text('A free account, no card needed'),
        text('Link the tools you already use'),
        text('Everyone with their own access'),
        text('Pick a template, or describe it'),
        text('A weekly summary of time saved'),
      ],
      title: text('Fifteen minutes to your first flow'),
      subtitle: [text('Sign up'), text('Connect'), text('Invite'), text('Automate'), text('Report')],
      number: [text('1 min'), text('3 min'), text('1 min'), text('10 min'), text('Weekly')],
      body: text('Beta average: fifteen minutes from sign-up to a first workflow running on its own.'),
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
          'Chasing approvals by phone and email',
          'Mistakes found at month-end close',
        ),
        bullets(
          'Data moves between tools on its own',
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
      title: text('Active workflows, in thousands'),
      number: [text('×13'), text('92%')],
      body: [text('Growth in active workflows since the beta began in June.'), text('Of teams still active after 60 days.')],
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
      caption: [text('Plans and pricing'), text('Launch prices, valid until 31 Jan 2027 for anyone who signs up now.')],
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
      image: { assetId: pictures.mutzarHeroEn.id },
      caption: text('The new home screen'),
      title: text('One board for', 'all of operations'),
      body: text('Orders, stock, suppliers and tickets in real time, on one screen the whole team shares.'),
    },
  },
  {
    layout: 'l_mutzar_quote',
    name: 'Quote',
    content: {
      quote: text('We used to copy every order across six systems. Now my team handles only the exceptions, and the rest just flows.'),
      attribution: text('Rotem Alon'),
      caption: text('Head of operations at a sports retail chain · beta customer'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_mutzar_team',
    name: 'The founders',
    content: {
      caption: [text('The founders'), text('CEO'), text('CTO'), text('VP Product'), text('Design lead')],
      title: text('Who builds Zrima'),
      image: TEAM_PICTURES(),
      subtitle: [text('Noa Barak'), text('Yoav Landau'), text('Eitan Segev'), text('Maya Carmi')],
      body: [
        text('Ran operations at three logistics firms before Zrima.'),
        text('Built the engine that runs two million workflows a day.'),
        text('Leads the new builder and the AI agents.'),
        text('Designed 2.0 together with forty operations teams.'),
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
export const mutzarSamples = { he: sampleHe, en: sampleEn };

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
      pictures.mutzarBuilderHe,
      pictures.mutzarBuilderEn,
      pictures.mutzarHeroHe,
      pictures.mutzarHeroEn,
      pictures.mutzarTeam1,
      pictures.mutzarTeam2,
      pictures.mutzarTeam3,
      pictures.mutzarTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}

export const entry = { id: 'mutzar', template: mutzarTemplate, samples: mutzarSamples };
