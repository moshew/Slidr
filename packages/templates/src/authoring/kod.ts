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
 * Kod (code): the slide is a code editor. A bar of tabs runs along the top, line numbers down the
 * gutter at the start side, and the foot is the editor's terminal: a prompt, the deck's name, and
 * the slide's number in a chip of the status bar. The palette is a syntax highlighter's on a
 * charcoal ground: string green for what is said, keyword violet for what holds it, number amber
 * for the figures. The timeline is a git graph, the comparison a diff, the process a pipeline,
 * the quote a block comment and the team a list of contributors with their activity. For tech
 * talks, engineering reviews, developer meetups and platform updates.
 *
 * The code the drawings show is drawn as SVG text in JetBrains Mono, so it is never counted as
 * the slide's words, and it reads left to right in both directions: the hand-drawn layouts of a
 * left-to-right deck are the mirrors, with every drawing that holds letters turned back.
 */
export const kodTheme: Theme = {
  id: 'kod',
  name: 'Kod',
  colors: {
    bg: '#15161e',
    surface: '#1e2030',
    text: '#e9e7f3',
    muted: '#a3a1ba',
    primary: '#7ee787',
    secondary: '#c3a6ff',
    accent: '#ffb86b',
    chart: ['#7ee787', '#82aaff', '#ffb86b', '#ff7ab6', '#c3a6ff', '#a3a1ba'],
  },
  // One family for both scripts: a Latin face of its own sets the spaces and the figures of a
  // Hebrew line, and a mono one would open every gap between words. The mono is in the drawings.
  fonts: {
    heading: { he: 'IBM Plex Sans Hebrew', latin: 'IBM Plex Sans Hebrew' },
    body: { he: 'IBM Plex Sans Hebrew', latin: 'IBM Plex Sans Hebrew' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 108,
      weight: 700,
      lineHeight: 1.08,
      letterSpacing: -1.5,
      color: { token: 'text' },
    },
    title: { font: 'heading', size: 58, weight: 700, lineHeight: 1.16, color: { token: 'text' } },
    heading: { font: 'heading', size: 38, weight: 600, lineHeight: 1.22, color: { token: 'text' } },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'heading', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 14,
  shadow: { x: 0, y: 18, blur: 44, color: { value: '#05060a', alpha: 0.55 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    SURFACE,
    {
      // The glow of a screen in a dark room, from the corner of the end side.
      fill: { kind: 'solid', color: { token: 'bg' } },
      overlay: {
        kind: 'radial',
        center: { x: 0, y: 0 },
        stops: [
          { color: { token: 'secondary', alpha: 0.1 }, at: 0 },
          { color: { token: 'secondary', alpha: 0 }, at: 0.7 },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// The colours of the drawings

const GREEN = '#7ee787';
const VIOLET = '#c3a6ff';
const AMBER = '#ffb86b';
const INK = '#e9e7f3';
const MUTED = '#a3a1ba';
const BG = '#15161e';
const PANEL = '#1e2030';
/** Syntax colours the theme has no token for: they stay themselves on every variant. */
const PINK = '#ff7ab6';
const BLUE = '#82aaff';
const COMMENT = '#7d8099';
const RED = '#ff6b6b';

const PAINT = {
  [GREEN]: token('primary'),
  [VIOLET]: token('secondary'),
  [AMBER]: token('accent'),
  [INK]: token('text'),
  [MUTED]: token('muted'),
  [BG]: token('bg'),
  [PANEL]: token('surface'),
};

const MONO = 'font-family="\'JetBrains Mono\', ui-monospace, monospace"';

/**
 * The drawings that hold letters: the mirror of a left-to-right deck turns them back, and takes
 * the drawing for that direction where one is given (an icon before its name, not after it).
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

/** One line of code: runs of text and colour, set in the mono face. */
type Token = [text: string, color: string];

function codeLines(lines: Token[][], size: number, step: number, x = 0, y0 = 0): string {
  return lines
    .map((line, i) => {
      const spans = line
        .map(([t, c]) => `<tspan fill="${c}">${esc(t).replace(/ /g, '&#160;')}</tspan>`)
        .join('');
      return `<text x="${x}" y="${y0 + (i + 1) * step}" ${MONO} font-size="${size}">${spans}</text>`;
    })
    .join('');
}

// ---------------------------------------------------------------------------------------------
// What the layouts share

const PANEL_FILL = solid(token('surface'));
const GROUND = solid(token('bg'));
const GREEN_FILL = solid(token('primary'));
const HAIR = solid(token('text', 0.08));
const LINE_TINT = solid(token('text', 0.045));

/** The start of the text column, past the gutter, and the end margin. */
const START = 128;
const END = 96;
const WIDTH = 1920 - START - END;

/** Where text starts after a glyph of its own: a comment's slashes, a prompt. */
const AFTER = START + 48;

/** Where the terminal panel of a content slide begins. */
const TERMINAL = 924;

/** The bar of tabs along the top: the window's lights, an open file and a second one. */
function tabs(name: string, file = 'slides.tsx', other = 'notes.md'): Element[] {
  const lights = svg(
    76,
    20,
    // Drawn for a right-to-left slide: the red light at the outer edge, which the mirror keeps.
    `<circle cx="66" cy="10" r="9" fill="${RED}"/><circle cx="38" cy="10" r="9" fill="#f6c453"/>` +
      `<circle cx="10" cy="10" r="9" fill="#5fd37a"/>`,
  );
  const tabMark = (fileName: string, color: string, ink: string, w: number) => (dir: Dir) =>
    dir === 'rtl'
      ? svg(
          w,
          28,
          `<rect x="${w - 22}" y="5" width="18" height="18" rx="4" fill="${color}" fill-opacity=".9"/>` +
            `<text x="${w - 32}" y="21" text-anchor="end" ${MONO} font-size="19" fill="${ink}">${fileName}</text>`,
        )
      : svg(
          w,
          28,
          `<rect x="4" y="5" width="18" height="18" rx="4" fill="${color}" fill-opacity=".9"/>` +
            `<text x="32" y="21" ${MONO} font-size="19" fill="${ink}">${fileName}</text>`,
        );
  return [
    rect(`d_kod_${name}_tabbar`, at(0, 0, 1920, 64), PANEL_FILL),
    rect(`d_kod_${name}_tabline`, at(0, 63, 1920, 1), HAIR),
    drawing(`d_kod_${name}_lights`, at(28, 22, 76, 20), lights, PAINT),
    rect(`d_kod_${name}_tab`, at(128, 0, 300, 64), GROUND),
    rect(`d_kod_${name}_tab_top`, at(128, 0, 300, 3), GREEN_FILL),
    lettered(`d_kod_${name}_tab_name`, at(148, 18, 260, 28), tabMark(file, BLUE, INK, 260)),
    lettered(`d_kod_${name}_tab2_name`, at(452, 18, 220, 28), tabMark(other, AMBER, MUTED, 220)),
    // The run and split buttons at the far end.
    // A play button points right in both directions: kept unflipped like the letters.
    lettered(
      `d_kod_${name}_tools`,
      atEnd(32, 20, 88, 24),
      svg(
        88,
        24,
        `<path d="M4 3l14 9-14 9z" fill="${GREEN}"/>` +
          `<rect x="34" y="3" width="20" height="18" rx="3" stroke="${MUTED}" stroke-width="2"/><path d="M44 3v18" stroke="${MUTED}" stroke-width="2"/>` +
          `<circle cx="70" cy="12" r="2.2" fill="${MUTED}"/><circle cx="77" cy="12" r="2.2" fill="${MUTED}"/><circle cx="84" cy="12" r="2.2" fill="${MUTED}"/>`,
      ),
    ),
  ];
}

/**
 * The gutter: line numbers down the start side, one every 66 pixels from the line of the
 * kicker. `current` is the line the cursor is on, drawn bright.
 */
function gutter(name: string, current = 1, count = 13, top = 64): Element[] {
  const first = 117 - top;
  const numbers = Array.from({ length: count }, (_, i) => {
    const y = first + i * 66 + 8;
    const on = i === current;
    return `<text x="52" y="${y}" text-anchor="end" ${MONO} font-size="21" fill="${on ? INK : MUTED}" fill-opacity="${on ? 1 : 0.42}">${i + 1}</text>`;
  }).join('');
  return [
    rect(`d_kod_${name}_gutter_rule`, at(80, 64, 1, TERMINAL - 64), HAIR),
    lettered(`d_kod_${name}_gutter`, at(8, top, 64, count * 66), svg(64, count * 66, numbers)),
  ];
}

/** The `//` of a comment, before a kicker. */
const slashes = (id: string, start: number, top: number, color = COMMENT) =>
  lettered(id, at(start, top, 40, 34), (dir) =>
    svg(
      40,
      34,
      `<text x="${dir === 'rtl' ? 40 : 0}" y="26" text-anchor="${dir === 'rtl' ? 'end' : 'start'}" ${MONO} font-size="26" fill="${color}">//</text>`,
    ),
  );

/** The prompt of the terminal, pointing the way the line reads (drawn for right to left). */
const PROMPT = svg(
  24,
  34,
  `<path d="M18 9 6 17l12 8" stroke="${GREEN}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
);
const prompt = (id: string, top: number, start = START + 10) =>
  drawing(id, at(start, top, 24, 34), PROMPT, PAINT);

/**
 * The kicker as a comment and the title on the cursor's line: a faint band the width of the
 * editor and the caret at its start.
 */
function head(name: string, width = 1480, lines = 1) {
  const h = 68 * lines;
  return {
    placeholders: [
      place('p_kicker', 'caption', at(AFTER, 100, Math.min(900, width), 34), 'caption'),
      place('p_title', 'title', at(START + 14, 146, width, h), 'title'),
    ],
    decorations: [
      slashes(`d_kod_${name}_slashes`, START, 100),
      rect(`d_kod_${name}_cursorline`, at(81, 140, 1920 - 81, h + 12), LINE_TINT),
      rect(`d_kod_${name}_caret`, at(START - 4, 150, 5, 58), GREEN_FILL),
    ],
  };
}

const mark = (id: string, frame: Frame) =>
  drawing(
    id,
    frame,
    svg(
      44,
      44,
      `<rect x="1" y="1" width="42" height="42" rx="11" fill="${GREEN}"/>` +
        `<path d="M17 14 9 22l8 8M27 14l8 8-8 8" stroke="${BG}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    ),
    PAINT,
    { role: 'logo', name: 'logo' },
  );

/** The status bar along the very foot: the branch, the checks, the encoding. */
function statusBar(name: string): Element[] {
  return [
    rect(`d_kod_${name}_status`, at(0, 1040, 1920, 40), solid(token('secondary', 0.16))),
    rect(`d_kod_${name}_status_mode`, at(0, 1040, 112, 40), solid(token('secondary', 0.55))),
    lettered(`d_kod_${name}_status_left`, at(132, 1046, 420, 28), (dir) =>
      // A branch and its name, then the count of problems: none.
      dir === 'rtl'
        ? svg(
            420,
            28,
            `<g stroke="${INK}" stroke-width="2" fill="none"><circle cx="410" cy="7" r="3.2"/><circle cx="410" cy="22" r="3.2"/><circle cx="398" cy="11" r="3.2"/><path d="M410 10v9M398 14c0 4-4 5-9 6"/></g>` +
              `<text x="382" y="21" text-anchor="end" ${MONO} font-size="18" fill="${INK}">main</text>` +
              `<circle cx="312" cy="14" r="7" stroke="${INK}" stroke-width="2"/><path d="M309 14l2 2 4-4" stroke="${INK}" stroke-width="2"/>` +
              `<text x="298" y="21" text-anchor="end" ${MONO} font-size="18" fill="${INK}">0 problems</text>`,
          )
        : svg(
            420,
            28,
            `<g stroke="${INK}" stroke-width="2" fill="none"><circle cx="10" cy="7" r="3.2"/><circle cx="10" cy="22" r="3.2"/><circle cx="22" cy="11" r="3.2"/><path d="M10 10v9M22 14c0 4 4 5 9 6"/></g>` +
              `<text x="38" y="21" ${MONO} font-size="18" fill="${INK}">main</text>` +
              `<circle cx="108" cy="14" r="7" stroke="${INK}" stroke-width="2"/><path d="M105 14l2 2 4-4" stroke="${INK}" stroke-width="2"/>` +
              `<text x="122" y="21" ${MONO} font-size="18" fill="${INK}">0 problems</text>`,
          ),
    ),
    lettered(
      `d_kod_${name}_status_right`,
      atEnd(24, 1046, 300, 28),
      word(
        300,
        28,
        21,
        18,
        'UTF-8&#160;&#160;&#160;LF&#160;&#160;&#160;TypeScript',
        'end',
        `fill="${INK}" fill-opacity=".8"`,
      ),
    ),
  ];
}

/**
 * The foot of a content slide: the terminal panel, with the mark, a prompt and the deck's name,
 * and the slide's number on a green chip at the end (SLD-04); the status bar under it.
 */
function foot(name: string) {
  return {
    placeholders: [place('p_footer', 'footer', at(START + 118, 958, 980, 34), 'caption')],
    decorations: [
      rect(`d_kod_${name}_terminal`, at(0, TERMINAL, 1920, 116), PANEL_FILL),
      rect(`d_kod_${name}_terminal_rule`, at(0, TERMINAL, 1920, 1), HAIR),
      mark(`d_kod_${name}_mark`, at(START, 953, 44, 44)),
      prompt(`d_kod_${name}_prompt`, 958, START + 80),
      rect(`d_kod_${name}_folio`, atEnd(END, 951, 104, 48), GREEN_FILL, {
        effects: { radius: 10 },
      }),
      pageNumber(`d_kod_${name}_number`, atEnd(END, 958, 104, 34), 'caption', {
        color: token('bg'),
        weight: 700,
        align: 'center',
      }),
      lettered(
        `d_kod_${name}_ln`,
        atEnd(END + 118, 958, 60, 34),
        word(60, 34, 25, 22, 'Ln', 'end', `fill="${MUTED}"`),
      ),
      ...statusBar(name),
    ],
  };
}

/** A box with only its top corners round: the head of a panel. */
function capped(id: string, frame: Frame, fill: Fill, r = 14) {
  const { w, h } = frame;
  const d = `M0 ${h}V${r}Q0 0 ${r} 0H${w - r}Q${w} 0 ${w} ${r}V${h}Z`;
  return rect(id, frame, fill, { geometry: { kind: 'path', d, viewBox: { w, h } } });
}

/** A panel of the editor: the surface, its rounded corners and a hairline. */
const panel = (id: string, frame: Frame, fill: Fill = PANEL_FILL) =>
  rect(id, frame, fill, {
    stroke: { color: token('text', 0.07), width: 1 },
    effects: { radius: 14 },
  });

/** A square badge with a sign in it: `+` for what was added, `−` for what was taken out. */
function sign(
  id: string,
  frame: Frame,
  kind: '+' | '-' | 'check' | 'play',
  color: string,
): Element {
  const s = frame.w;
  const c = s / 2;
  const k = s * 0.22;
  const path =
    kind === '+'
      ? `<path d="M${c} ${c - k}v${2 * k}M${c - k} ${c}h${2 * k}" stroke="${color}" stroke-width="${s * 0.09}" stroke-linecap="round"/>`
      : kind === '-'
        ? `<path d="M${c - k} ${c}h${2 * k}" stroke="${color}" stroke-width="${s * 0.09}" stroke-linecap="round"/>`
        : kind === 'check'
          ? `<path d="M${c - k} ${c}l${k * 0.7} ${k * 0.7} ${k * 1.3}-${k * 1.4}" stroke="${color}" stroke-width="${s * 0.09}" stroke-linecap="round" stroke-linejoin="round"/>`
          : `<path d="M${c + k * 0.8} ${c - k}v${2 * k}l-${k * 1.7}-${k}z" fill="${color}"/>`;
  return drawing(
    id,
    frame,
    svg(
      s,
      s,
      `<rect x="1" y="1" width="${s - 2}" height="${s - 2}" rx="${s * 0.24}" fill="${color}" fill-opacity=".14" stroke="${color}" stroke-opacity=".5" stroke-width="1.5"/>${path}`,
    ),
    PAINT,
  );
}

// ---------------------------------------------------------------------------------------------
// The drawings of the opening and the closing slides

/** The code on the opening slide: a talk, as a function. */
const KEYNOTE: Token[][] = [
  [
    ['import', PINK],
    [' { community } ', INK],
    ['from', PINK],
    [' "./people"', GREEN],
    [';', INK],
  ],
  [],
  [
    ['export ', PINK],
    ['async ', PINK],
    ['function ', VIOLET],
    ['talk', BLUE],
    ['(idea) {', INK],
  ],
  [
    ['  const', PINK],
    [' draft ', INK],
    ['= await ', PINK],
    ['idea.', INK],
    ['build', BLUE],
    ['();', INK],
  ],
  [
    ['  for', PINK],
    [' (', INK],
    ['const', PINK],
    [' step ', INK],
    ['of', PINK],
    [' draft.steps) {', INK],
  ],
  [
    ['    step.', INK],
    ['measure', BLUE],
    ['({ ', INK],
    ['runs', INK],
    [': ', INK],
    ['200', AMBER],
    [' });', INK],
  ],
  [
    ['    step.', INK],
    ['ship', BLUE],
    ['();', INK],
  ],
  [['  }', INK]],
  [
    ['  return', PINK],
    [' community.', INK],
    ['share', BLUE],
    ['(draft);', INK],
  ],
  [['}', INK]],
];

function editorWindow(name: string, frame: Frame, code: Token[][], highlight: number): Element[] {
  const { w, h } = frame;
  const step = 46;
  const top = 92;
  const numbers = code
    .map(
      (_, i) =>
        `<text x="56" y="${top + (i + 1) * step}" text-anchor="end" ${MONO} font-size="22" fill="${i === highlight ? INK : MUTED}" fill-opacity="${i === highlight ? 0.95 : 0.45}">${i + 1}</text>`,
    )
    .join('');
  const hy = top + highlight * step + 12;
  const body =
    // The window's own bar: a file, and the lights at the other end.
    `<rect width="${w}" height="${h}" rx="18" fill="${PANEL}"/>` +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="18" stroke="${INK}" stroke-opacity=".08"/>` +
    `<path d="M0 56h${w}" stroke="${INK}" stroke-opacity=".08"/>` +
    `<circle cx="28" cy="28" r="7" fill="${RED}"/><circle cx="50" cy="28" r="7" fill="#f6c453"/><circle cx="72" cy="28" r="7" fill="#5fd37a"/>` +
    `<rect x="104" y="12" width="168" height="34" rx="8" fill="${BG}"/>` +
    `<text x="122" y="35" ${MONO} font-size="18" fill="${INK}">talk.ts</text>` +
    `<rect x="72" y="${hy}" width="${w - 72}" height="${step}" fill="${INK}" fill-opacity=".05"/>` +
    numbers +
    codeLines(code, 25, step, 84, top) +
    // The caret at the end of the highlighted line, and a minimap at the edge.
    `<rect x="${84 + 15 * 32 + 2}" y="${hy + 8}" width="3" height="30" fill="${GREEN}"/>` +
    Array.from({ length: 22 }, (_, i) => {
      const len = [
        38, 0, 52, 46, 50, 40, 22, 8, 44, 6, 30, 48, 36, 0, 50, 28, 42, 18, 46, 12, 34, 40,
      ][i]!;
      return len
        ? `<rect x="${w - 70}" y="${84 + i * 9}" width="${len}" height="4" rx="2" fill="${[PINK, BLUE, INK, GREEN][i % 4]}" fill-opacity=".45"/>`
        : '';
    }).join('');
  return [
    rect(`d_kod_${name}_window_shadow`, frame, GROUND, {
      effects: {
        radius: 18,
        shadow: { x: 0, y: 30, blur: 70, color: { value: '#000000', alpha: 0.5 } },
      },
    }),
    lettered(`d_kod_${name}_window`, frame, svg(w, h, body)),
  ];
}

/** A toast of the editor over the corner of a window: every check passed. */
function toast(name: string, frame: Frame, message: string): Element {
  const { w, h } = frame;
  return lettered(
    `d_kod_${name}_toast`,
    frame,
    svg(
      w,
      h,
      `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="14" fill="${BG}" stroke="${GREEN}" stroke-opacity=".6" stroke-width="2"/>` +
        `<circle cx="38" cy="${h / 2}" r="15" fill="${GREEN}"/><path d="M31 ${h / 2}l5 5 9-10" stroke="${BG}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
        `<text x="66" y="${h / 2 + 8}" ${MONO} font-size="22" fill="${INK}">${message}</text>`,
    ),
  );
}

/** The closing terminal: a commit, a push, and the prompt waiting. */
function terminalWindow(name: string, frame: Frame): Element[] {
  const { w, h } = frame;
  const lines: Token[][] = [
    [
      ['$ ', GREEN],
      ['git commit -m ', INK],
      ['"thank you"', AMBER],
    ],
    [['[main 4f2a9c1] thank you', MUTED]],
    [[' 1 file changed, 42 insertions(+)', MUTED]],
    [
      ['$ ', GREEN],
      ['git push origin main', INK],
    ],
    [['Enumerating objects: 9, done.', MUTED]],
    [['To github.com:team/talk.git', MUTED]],
    [['   9b1d2e0..4f2a9c1  main -> main', INK]],
    [
      ['✓ ', GREEN],
      ['deployed to production', GREEN],
    ],
    [['$ ', GREEN]],
  ];
  const body =
    `<rect width="${w}" height="${h}" rx="18" fill="#0e0f15"/>` +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="18" stroke="${INK}" stroke-opacity=".1"/>` +
    `<path d="M0 56h${w}" stroke="${INK}" stroke-opacity=".08"/>` +
    `<circle cx="28" cy="28" r="7" fill="${RED}"/><circle cx="50" cy="28" r="7" fill="#f6c453"/><circle cx="72" cy="28" r="7" fill="#5fd37a"/>` +
    `<text x="${w / 2}" y="35" text-anchor="middle" ${MONO} font-size="18" fill="${MUTED}">zsh — talk</text>` +
    codeLines(lines, 24, 50, 36, 64) +
    `<rect x="${36 + 14.4 * 2}" y="${64 + 9 * 50 - 22}" width="14" height="28" fill="${GREEN}"/>`;
  return [
    rect(`d_kod_${name}_terminal_shadow`, frame, GROUND, {
      effects: {
        radius: 18,
        shadow: { x: 0, y: 30, blur: 70, color: { value: '#000000', alpha: 0.55 } },
      },
    }),
    lettered(`d_kod_${name}_terminal_window`, frame, svg(w, h, body)),
  ];
}

/** The braces of a block, around the number of a part. */
function braces(name: string, frame: Frame): Element {
  const { w, h } = frame;
  const brace = (x: number, flip: boolean) => {
    const d = `M${x} 8c-34 0-46 16-46 44v${h / 2 - 96}c0 26-14 40-40 44 26 4 40 18 40 44v${h / 2 - 96}c0 28 12 44 46 44`;
    return `<path d="${d}" stroke="${VIOLET}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" transform="${flip ? `translate(${w} 0) scale(-1 1)` : ''}"/>`;
  };
  return drawing(
    `d_kod_${name}_braces`,
    frame,
    svg(w, h, brace(96, false) + brace(96, true)),
    PAINT,
  );
}

/** Dots of a grid behind a part's number. */
function grid(id: string, frame: Frame, gap = 32): Element {
  const { w, h } = frame;
  const cols = Math.floor(w / gap);
  const rows = Math.floor(h / gap);
  const dots = Array.from({ length: cols * rows }, (_, i) => {
    const x = (i % cols) * gap + gap / 2;
    const y = Math.floor(i / cols) * gap + gap / 2;
    return `<circle cx="${x}" cy="${y}" r="1.6"/>`;
  }).join('');
  return drawing(id, frame, svg(w, h, `<g fill="${MUTED}" fill-opacity=".22">${dots}</g>`), PAINT);
}

/** The git graph of the timeline: the main line, a branch that leaves and merges, and HEAD. */
function gitGraph(name: string, nodes: number[], y: number): Element[] {
  const x = (start: number) => 1920 - start - 22;
  const [a, b, c, d] = nodes.map(x) as [number, number, number, number];
  const left = Math.min(a, d) - 60;
  const width = Math.max(a, d) - left + 80;
  const top = y - 20;
  const h = 150;
  const ly = 22;
  const by = 118;
  // In slide coordinates, inside the box: the branch leaves after the first commit and comes
  // back before the last.
  const X = (v: number) => v - left;
  const branch =
    `<path d="M${X(a) - 40} ${ly}C${X(a) - 100} ${ly} ${X(a) - 120} ${by} ${X(a) - 190} ${by}H${X(d) + 190}C${X(d) + 120} ${by} ${X(d) + 100} ${ly} ${X(d) + 40} ${ly}" stroke="${VIOLET}" stroke-width="5" stroke-linecap="round"/>` +
    [X(b) + 70, X(c) - 70, (X(b) + X(c)) / 2]
      .map(
        (cx) =>
          `<circle cx="${cx}" cy="${by}" r="9" fill="${BG}" stroke="${VIOLET}" stroke-width="5"/>`,
      )
      .join('');
  const main = `<path d="M${X(Math.max(a, d)) + 60} ${ly}H${X(Math.min(a, d)) - 60}" stroke="${GREEN}" stroke-width="6" stroke-linecap="round"/>`;
  return [
    drawing(
      `d_kod_${name}_graph`,
      { x: left, y: top, w: width, h },
      svg(width, h, main + branch),
      PAINT,
    ),
    ...nodes.flatMap((start, i) => [
      dot(`d_kod_${name}_commit${i + 1}`, at(start, y - 20, 44, 44), GROUND, {
        stroke: { color: token(i === nodes.length - 1 ? 'accent' : 'primary'), width: 7 },
      }),
    ]),
  ];
}

/** A strip of a contributor's activity: weeks in columns, days in rows, in shades of green. */
function activity(id: string, frame: Frame, seed: number): Element {
  const cols = 26;
  const rows = 4;
  const cell = 11;
  const gap = 4;
  let s = seed;
  const next = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const cells = Array.from({ length: cols * rows }, (_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const level = Math.floor(next() * 5 * (0.55 + (col / cols) * 0.6));
    const alpha = [0.08, 0.28, 0.5, 0.75, 1][Math.min(level, 4)];
    return `<rect x="${col * (cell + gap)}" y="${row * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5" fill="${level === 0 ? INK : GREEN}" fill-opacity="${level === 0 ? 0.07 : alpha}"/>`;
  }).join('');
  return drawing(
    id,
    frame,
    svg(cols * (cell + gap) - gap, rows * (cell + gap) - gap, cells),
    PAINT,
  );
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const columns4 = [START, 562, 996, 1430];
const cards3 = [START, 706, 1284];
const steps5 = [START, 475, 822, 1169, 1516];
const rows3 = [304, 498, 692];
const stats3 = [262, 476, 690];
const lines3 = [520, 616, 712];

function layouts(): Layout[] {
  const textPhoto = atEnd(END + 16, 152, 668, 724);
  const textWindow = atEnd(END, 96, 700, 796);
  return [
    {
      id: 'l_kod_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        place('p_kicker', 'caption', at(AFTER, 272, 780, 34), 'caption'),
        place('p_title', 'title', at(START + 14, 326, 860, 240), 'display'),
        place('p_subtitle', 'subtitle', at(START + 14, 600, 800, 142), 'heading'),
        place('p_meta', 'caption', at(AFTER, 846, 760, 34), 'caption'),
      ],
      decorations: [
        ...tabs('hero', 'keynote.tsx', 'README.md'),
        ...gutter('hero', 4),
        slashes('d_kod_hero_slashes', START, 272),
        rect('d_kod_hero_cursorline', at(81, 326, 1000, 120), LINE_TINT),
        rect('d_kod_hero_caret', at(START - 4, 334, 5, 100), GREEN_FILL),
        prompt('d_kod_hero_prompt', 846),
        rect('d_kod_hero_meta_rule', at(START, 812, 820, 1), HAIR),
        ...editorWindow('hero', atEnd(END, 150, 780, 640), KEYNOTE, 5),
        toast('hero', atEnd(END + 330, 744, 470, 76), 'All checks passed'),
        ...statusBar('hero'),
      ],
    },
    {
      id: 'l_kod_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        place('p_number', 'number', atEnd(214, 370, 380, 220), 'display', {
          align: 'center',
          vAlign: 'middle',
          color: token('accent'),
        }),
        place('p_kicker', 'caption', at(AFTER, 352, 760, 34), 'caption'),
        place('p_title', 'title', at(START + 14, 404, 920, 240), 'display'),
        place('p_subtitle', 'subtitle', at(START + 14, 676, 940, 96), 'heading'),
      ],
      decorations: [
        ...tabs('section', 'part.tsx', 'slides.tsx'),
        ...gutter('section', 5),
        grid('d_kod_section_grid', atEnd(END, 150, 700, 740)),
        braces('section', atEnd(170, 250, 468, 460)),
        slashes('d_kod_section_slashes', START, 352),
        rect('d_kod_section_cursorline', at(81, 404, 1000, 120), LINE_TINT),
        rect('d_kod_section_caret', at(START - 4, 412, 5, 100), GREEN_FILL),
        ...statusBar('section'),
      ],
    },
    {
      id: 'l_kod_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head('big_number').placeholders,
        place('p_number', 'number', at(START + 14, 290, 900, 135), 'display', {
          color: token('accent'),
        }),
        place('p_label', 'subtitle', at(START + 14, 452, 900, 96), 'heading'),
        place('p_body', 'body', at(START + 14, 570, 860, 170), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(END + 40, top + 22, 520, 70), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', atEnd(END + 40, top + 100, 520, 68), 'caption'),
        ]),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        ...tabs('big_number'),
        ...gutter('big_number'),
        ...head('big_number').decorations,
        ...stats3.flatMap((top, i) => [
          panel(`d_kod_big_number_card${i + 1}`, atEnd(END, top, 600, 188)),
          rect(
            `d_kod_big_number_bar${i + 1}`,
            atEnd(END + 600 - 6, top + 28, 6, 132),
            solid(token((['primary', 'secondary', 'accent'] as const)[i]!)),
            { effects: { radius: 3 } },
          ),
        ]),
        ...foot('big_number').decorations,
      ],
    },
    {
      id: 'l_kod_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(START + 96, 236, 1440, 420), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(START + 250, 708, 1200, 53), 'heading'),
        place('p_caption', 'caption', at(START + 250, 772, 1200, 68), 'caption'),
        ...foot('quote').placeholders,
      ],
      decorations: [
        ...tabs('quote', 'CHANGELOG.md', 'slides.tsx'),
        ...gutter('quote', 3),
        lettered(
          'd_kod_quote_open',
          at(START, 100, 160, 110),
          word(160, 110, 92, 104, '/*', 'start', `font-weight="700" fill="${COMMENT}"`),
        ),
        // The asterisks down the side of a block comment.
        lettered(
          'd_kod_quote_stars',
          at(START + 22, 276, 40, 360),
          svg(
            40,
            360,
            [0, 1, 2, 3, 4]
              .map(
                (i) =>
                  `<text x="20" y="${44 + i * 76}" text-anchor="middle" ${MONO} font-size="34" fill="${COMMENT}" fill-opacity=".6">*</text>`,
              )
              .join(''),
          ),
        ),
        lettered(
          'd_kod_quote_close',
          atEnd(END, 780, 160, 110),
          word(160, 110, 92, 104, '*/', 'end', `font-weight="700" fill="${COMMENT}"`),
        ),
        lettered(
          'd_kod_quote_author',
          at(START + 96, 712, 140, 44),
          word(140, 44, 34, 30, '@author', 'start', `fill="${PINK}"`),
        ),
        rect('d_kod_quote_rule', at(START + 96, 684, 120, 4), GREEN_FILL, {
          effects: { radius: 2 },
        }),
        ...foot('quote').decorations,
      ],
    },
    {
      id: 'l_kod_text',
      name: 'Text',
      archetype: 'text',
      placeholders: [
        ...head('text').placeholders.filter((p) => p.role === 'title'),
        place('p_body', 'body', at(START + 14, 262, WIDTH - 14, 620), 'body'),
      ],
      decorations: [
        ...tabs('text', 'notes.md', 'slides.tsx'),
        ...gutter('text'),
        rect('d_kod_text_cursorline', at(81, 140, 1920 - 81, 80), LINE_TINT),
        rect('d_kod_text_caret', at(START - 4, 150, 5, 58), GREEN_FILL),
        ...foot('text').decorations,
      ],
    },
    {
      id: 'l_kod_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head('text_image', 900, 2).placeholders,
        place('p_image', 'image', textPhoto),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(START + 84, top + 2, 820, 53), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(START + 84, top + 58, 820, 128), 'body'),
        ]),
        ...foot('text_image').placeholders,
      ],
      decorations: [
        ...tabs('text_image'),
        ...gutter('text_image'),
        ...head('text_image', 900, 2).decorations,
        panel('d_kod_text_image_window', textWindow),
        drawing(
          'd_kod_text_image_window_lights',
          atEnd(END + 22, 118, 60, 16),
          svg(
            60,
            16,
            `<circle cx="8" cy="8" r="7" fill="${RED}"/><circle cx="30" cy="8" r="7" fill="#f6c453"/><circle cx="52" cy="8" r="7" fill="#5fd37a"/>`,
          ),
          PAINT,
        ),
        ...rows3.flatMap((top, i) => [
          sign(`d_kod_text_image_sign${i + 1}`, at(START + 14, top + 4, 48, 48), '+', GREEN),
        ]),
        ...foot('text_image').decorations,
      ],
    },
    {
      id: 'l_kod_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture fills the preview pane; the words are in the terminal under it, because
        // nothing of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 64, 1920, 596)),
        place('p_kicker', 'caption', at(AFTER, 700, 900, 34), 'caption'),
        place('p_title', 'title', at(START + 14, 748, 1060, 140), 'title'),
        place('p_body', 'body', atEnd(END, 744, 560, 180), 'body'),
      ],
      decorations: [
        ...tabs('full_image', 'preview.png', 'slides.tsx'),
        rect('d_kod_full_image_terminal', at(0, 660, 1920, 380), PANEL_FILL),
        rect('d_kod_full_image_rule', at(0, 660, 1920, 2), GREEN_FILL),
        prompt('d_kod_full_image_prompt', 700),
        rect('d_kod_full_image_divider', atEnd(END + 600, 748, 1, 160), HAIR),
        ...statusBar('full_image'),
      ],
    },
    {
      id: 'l_kod_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head('cards').placeholders,
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}_note`, 'caption', at(start + 64, 282, 440, 34), 'caption', {
            vAlign: 'middle',
          }),
          place(`p_card${i + 1}`, 'subtitle', at(start + 32, 358, 476, 96), 'heading'),
          place(`p_card${i + 1}_body`, 'body', at(start + 32, 462, 476, 210), 'body'),
        ]),
        place('p_takeaway', 'body', at(AFTER, 790, WIDTH - 48, 64), 'body', { vAlign: 'middle' }),
        ...foot('cards').placeholders,
      ],
      decorations: [
        ...tabs('cards'),
        ...gutter('cards'),
        ...head('cards').decorations,
        ...cards3.flatMap((start, i) => [
          panel(`d_kod_cards_card${i + 1}`, at(start, 262, 540, 448)),
          rect(`d_kod_cards_tabrule${i + 1}`, at(start, 336, 540, 1), HAIR),
          rect(
            `d_kod_cards_tabtop${i + 1}`,
            at(start + 14, 262, 160, 3),
            solid(token((['primary', 'secondary', 'accent'] as const)[i]!)),
          ),
          rect(
            `d_kod_cards_icon${i + 1}`,
            at(start + 28, 288, 22, 22),
            solid(token((['primary', 'secondary', 'accent'] as const)[i]!)),
            { effects: { radius: 5 } },
          ),
        ]),
        prompt('d_kod_cards_takeaway_prompt', 805),
        rect('d_kod_cards_rule', at(START, 750, WIDTH, 1), HAIR),
        ...foot('cards').decorations,
      ],
    },
    {
      id: 'l_kod_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head('timeline').placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 290, 394, 70), 'title', { vAlign: 'bottom' }),
          place(`p_what${i + 1}`, 'subtitle', at(start, 560, 380, 96), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start, 664, 380, 150), 'caption'),
        ]),
        place('p_note', 'caption', at(START, 850, WIDTH, 34), 'caption'),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        ...tabs('timeline', 'git log --graph', 'slides.tsx'),
        ...gutter('timeline'),
        ...head('timeline').decorations,
        ...gitGraph('timeline', columns4, 398),
        lettered(
          'd_kod_timeline_head',
          at(1530, 378, 120, 44),
          svg(
            120,
            44,
            `<rect x="1" y="1" width="118" height="42" rx="10" fill="${AMBER}" fill-opacity=".14" stroke="${AMBER}" stroke-opacity=".7" stroke-width="2"/><text x="60" y="30" text-anchor="middle" ${MONO} font-size="20" font-weight="700" fill="${AMBER}">HEAD</text>`,
          ),
        ),
        ...foot('timeline').decorations,
      ],
    },
    {
      id: 'l_kod_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head('process').placeholders,
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start + 24, 352, 260, 96), 'heading'),
          place(`p_step${i + 1}_body`, 'caption', at(start + 24, 456, 260, 102), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start + 24, 600, 260, 70), 'title', {
            color: token('accent'),
          }),
        ]),
        place('p_summary', 'body', at(AFTER, 806, WIDTH - 48, 64), 'body', { vAlign: 'middle' }),
        ...foot('process').placeholders,
      ],
      decorations: [
        ...tabs('process', 'ci.yml', 'slides.tsx'),
        ...gutter('process'),
        ...head('process').decorations,
        ...steps5.flatMap((start, i) => [
          panel(`d_kod_process_job${i + 1}`, at(start, 262, 308, 448)),
          sign(
            `d_kod_process_status${i + 1}`,
            at(start + 24, 286, 48, 48),
            i === 4 ? 'play' : 'check',
            i === 4 ? AMBER : GREEN,
          ),
          lettered(
            `d_kod_process_n${i + 1}`,
            atEnd(1920 - start - 308 + 20, 292, 80, 34),
            word(80, 34, 26, 22, `#${i + 1}`, 'end', `fill="${MUTED}" fill-opacity=".8"`),
          ),
          rect(`d_kod_process_rule${i + 1}`, at(start + 24, 580, 260, 1), HAIR),
          ...(i < 4
            ? [
                rect(
                  `d_kod_process_link${i + 1}`,
                  at(start + 308, 310, 39, 4),
                  solid(token('primary', 0.6)),
                ),
              ]
            : []),
        ]),
        prompt('d_kod_process_summary_prompt', 821),
        rect('d_kod_process_bar', at(START, 786, WIDTH, 1), HAIR),
        ...foot('process').decorations,
      ],
    },
    {
      id: 'l_kod_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head('comparison').placeholders,
        ...(
          [
            ['before', START],
            ['after', START + 868],
          ] as const
        ).flatMap(([side, start]) => [
          place(`p_${side}_tag`, 'caption', at(start + 84, 278, 700, 34), 'caption'),
          place(`p_${side}`, 'subtitle', at(start + 84, 354, 720, 53), 'heading'),
          place(`p_${side}_body`, 'body', at(start + 84, 436, 720, 420), 'body'),
        ]),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        ...tabs('comparison', 'diff --stat', 'slides.tsx'),
        ...gutter('comparison'),
        ...head('comparison').decorations,
        ...(
          [
            ['before', START, RED, '-'],
            ['after', START + 868, GREEN, '+'],
          ] as const
        ).flatMap(([side, start, color, s]) => [
          panel(`d_kod_comparison_${side}`, at(start, 262, 828, 630)),
          capped(
            `d_kod_comparison_${side}_head`,
            at(start, 262, 828, 66),
            solid({ value: color, alpha: 0.12 }),
          ),
          rect(
            `d_kod_comparison_${side}_gutter`,
            at(start, 330, 64, 562),
            solid({ value: color, alpha: 0.07 }),
          ),
          sign(`d_kod_comparison_${side}_sign`, at(start + 18, 278, 34, 34), s, color),
          lettered(
            `d_kod_comparison_${side}_marks`,
            at(start + 14, 436, 40, 420),
            // One sign a line of the body, on its rhythm: 28px type at a line height of 1.5.
            svg(
              40,
              420,
              Array.from(
                { length: 10 },
                (_, k) =>
                  `<text x="20" y="${31 + k * 42}" text-anchor="middle" ${MONO} font-size="26" font-weight="700" fill="${color}" fill-opacity="${Math.max(0.12, 0.9 - k * 0.09).toFixed(2)}">${s === '-' ? '−' : '+'}</text>`,
              ).join(''),
            ),
          ),
        ]),
        ...foot('comparison').decorations,
      ],
    },
    {
      id: 'l_kod_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head('chart').placeholders,
        place('p_chart', 'chart', at(START + 30, 336, 1080, 540)),
        place('p_stat1', 'number', atEnd(END, 262, 500, 120), 'display', {
          color: token('primary'),
        }),
        place('p_stat1_body', 'body', atEnd(END, 392, 500, 130), 'body'),
        place('p_stat2', 'number', atEnd(END, 560, 500, 120), 'display', {
          color: token('accent'),
        }),
        place('p_stat2_body', 'body', atEnd(END, 690, 500, 96), 'body'),
        place('p_source', 'caption', atEnd(END, 820, 500, 68), 'caption'),
        ...foot('chart').placeholders,
      ],
      decorations: [
        ...tabs('chart', 'metrics.json', 'slides.tsx'),
        ...gutter('chart'),
        ...head('chart').decorations,
        panel('d_kod_chart_panel', at(START, 262, 1140, 630)),
        rect('d_kod_chart_panel_rule', at(START, 318, 1140, 1), HAIR),
        drawing(
          'd_kod_chart_panel_icons',
          at(START + 24, 276, 120, 28),
          svg(
            120,
            28,
            `<path d="M100 22l6-8 6 4 6-12" stroke="${GREEN}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="14" r="2.4" fill="${MUTED}"/><circle cx="30" cy="14" r="2.4" fill="${MUTED}"/><circle cx="40" cy="14" r="2.4" fill="${MUTED}"/>`,
          ),
          PAINT,
        ),
        rect('d_kod_chart_divider', atEnd(END, 538, 500, 1), HAIR),
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_kod_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head('table').placeholders,
        // Room for the tables of other decks too: seven rows of two lines.
        place('p_table', 'table', at(START + 24, 254, WIDTH - 48, 610)),
        place('p_note', 'caption', at(START, 884, WIDTH, 34), 'caption'),
        ...foot('table').placeholders,
      ],
      decorations: [
        ...tabs('table', 'results.csv', 'slides.tsx'),
        ...gutter('table'),
        ...head('table').decorations,
        panel('d_kod_table_panel', at(START, 240, WIDTH, 636)),
        lettered(
          'd_kod_table_query',
          atEnd(END, 102, 520, 30),
          word(
            520,
            30,
            22,
            19,
            `<tspan fill="${PINK}">SELECT</tspan><tspan fill="${INK}">&#160;*&#160;</tspan><tspan fill="${PINK}">FROM</tspan><tspan fill="${INK}">&#160;results&#160;</tspan><tspan fill="${PINK}">LIMIT</tspan><tspan fill="${AMBER}">&#160;5</tspan>`,
            'end',
          ),
        ),
        ...foot('table').decorations,
      ],
    },
    {
      id: 'l_kod_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head('team').placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start, 262, 394, 330)),
          place(`p_person${i + 1}`, 'subtitle', at(start + 28, 612, 366, 53), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start, 668, 394, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start, 708, 394, 102), 'caption'),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: [
        ...tabs('team', 'CONTRIBUTORS', 'slides.tsx'),
        ...gutter('team'),
        ...head('team').decorations,
        ...columns4.flatMap((start, i) => [
          rect(`d_kod_team_frame${i + 1}`, at(start - 6, 256, 406, 342), NO_FILL, {
            stroke: { color: token(i % 2 === 0 ? 'primary' : 'secondary', 0.7), width: 2 },
            effects: { radius: 18 },
          }),
          dot(`d_kod_team_online${i + 1}`, at(start + 2, 628, 16, 16), GREEN_FILL),
          activity(`d_kod_team_activity${i + 1}`, at(start, 836, 386, 56), 17 + i * 31),
        ]),
        ...foot('team').decorations,
      ],
    },
    {
      id: 'l_kod_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(AFTER, 196, 760, 34), 'caption'),
        place('p_title', 'title', at(START + 14, 248, 880, 240), 'display'),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(AFTER, top - 2, 820, 86), 'body', {
            vAlign: 'middle',
          }),
        ),
        place('p_contact', 'caption', at(AFTER, 880, 820, 34), 'caption'),
      ],
      decorations: [
        ...tabs('closing', 'thanks.sh', 'slides.tsx'),
        ...gutter('closing', 2),
        slashes('d_kod_closing_slashes', START, 196),
        rect('d_kod_closing_cursorline', at(81, 248, 1000, 120), LINE_TINT),
        rect('d_kod_closing_caret', at(START - 4, 258, 5, 100), GREEN_FILL),
        ...lines3.flatMap((top, i) => [
          prompt(`d_kod_closing_prompt${i + 1}`, top + 23),
          rect(`d_kod_closing_rule${i + 1}`, at(START, top + 90, 860, 1), HAIR),
        ]),
        drawing(
          'd_kod_closing_mail',
          at(START + 4, 884, 34, 30),
          svg(
            34,
            30,
            `<rect x="2" y="4" width="30" height="22" rx="4" stroke="${GREEN}" stroke-width="2.4"/><path d="M3 6l14 11L31 6" stroke="${GREEN}" stroke-width="2.4" stroke-linejoin="round"/>`,
          ),
          PAINT,
        ),
        ...terminalWindow('closing', atEnd(END, 150, 720, 640)),
        ...statusBar('closing'),
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
        return ltr ? { ...rest, markup: ltr } : rest;
      }),
    };
  });
}

// ---------------------------------------------------------------------------------------------
// The sample: a platform team's talk at a meetup, on how they cut the time of CI tenfold

const pictures = {
  kodEditor: picture('kodEditor'),
  kodFarm: picture('kodFarm'),
  kodTeam1: picture('kodTeam1'),
  kodTeam2: picture('kodTeam2'),
  kodTeam3: picture('kodTeam3'),
  kodTeam4: picture('kodTeam4'),
};

const FOOTER_HE = text('Nivo Platform · מיטאפ מונוריפו תל אביב');
const FOOTER_EN = text('Nivo Platform · Monorepo Meetup TLV');
const TABLE_COLS = [418, 300, 300, 330, 300];
const TABLE_ROW = 82;
const MINUTES = [41, 39, 38, 22, 19, 16, 9, 7, 5, 4];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_kod_hero',
    name: 'פתיחה',
    content: {
      caption: [
        text('Platform Engineering · Nivo'),
        text('רוני אבידן · מיטאפ מונוריפו · 24.11.2026'),
      ],
      title: text('מ-40 דקות', 'ל-4 דקות'),
      subtitle: text('איך קיצרנו את ה-CI של 300 מפתחים'),
    },
  },
  {
    layout: 'l_kod_section',
    name: 'למה זה כאב',
    content: {
      number: text('01'),
      caption: text('חלק ראשון'),
      title: text('למה זה כאב'),
      subtitle: text('כל pull request חיכה 40 דקות, ואף אחד לא חיכה בשקט.'),
    },
  },
  {
    layout: 'l_kod_text',
    name: 'מה נראה היום',
    content: {
      title: text('מה נראה היום'),
      body: {
        paragraphs: [
          para('שלושה שינויים בתשתית, בלי לגעת בקוד של המוצר:'),
          ...bullets(
            'קאש מרוחק שמשותף לכל הצוותים',
            'פיצול הבדיקות ל-12 מכונות לפי זמן הריצה',
            'בנייה של החבילות שהשינוי באמת נוגע בהן, ותו לא',
          ).paragraphs,
        ],
      },
    },
  },
  {
    layout: 'l_kod_big_number',
    name: 'הבעיה במספרים',
    content: {
      caption: [
        text('הבעיה במספרים'),
        text('זמן ממוצע של pipeline בינואר'),
        text('ריצות CI בכל חודש'),
        text('מהחבילות נבנו בלי שום שינוי'),
      ],
      title: text('כמה עלה לנו לחכות'),
      number: [text('1,900'), text('40 דק׳'), text('2,800'), text('83%')],
      subtitle: text('שעות פיתוח בחודש הלכו על המתנה ל-CI'),
      body: text('רוב הזמן בנינו מחדש קוד שלא השתנה בכלל, ושילמנו על זה בשעות עבודה.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_kod_cards',
    name: 'מה שינינו',
    content: {
      caption: [text('מה שינינו'), text('cache.ts'), text('shards.ts'), text('affected.ts')],
      title: text('שלושה שינויים, אותו קוד'),
      subtitle: [text('קאש מרוחק'), text('בדיקות במקביל'), text('רק מה שהשתנה')],
      body: [
        text('כל תוצר נבנה פעם אחת ונשמר. הריצה הבאה מושכת אותו בשנייה.'),
        text('2,400 בדיקות מתחלקות ל-12 מכונות לפי זמן הריצה שלהן.'),
        text('גרף התלויות יודע אילו חבילות הושפעו, וכל השאר מדלגות.'),
        text('בלי לשכתב שורה אחת של קוד המוצר.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_kod_text_image',
    name: 'גרף התלויות',
    content: {
      caption: text('מתחת למכסה'),
      title: text('גרף התלויות', 'מחליט מה לבנות'),
      image: { assetId: pictures.kodEditor.id },
      subtitle: [text('מפה של 412 חבילות'), text('מפתח לכל קלט'), text('91% פגיעות בקאש')],
      body: [
        text('כל חבילה יודעת במה היא תלויה ומי תלוי בה.'),
        text('שינוי בקובץ מחליף מפתח רק לחבילות שהושפעו.'),
        text('רוב הריצות כמעט לא בונות שום דבר מחדש.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_kod_timeline',
    name: 'הדרך',
    content: {
      caption: [text('הדרך'), text('כל שלב עלה לכל הצוותים בבת אחת, מאחורי feature flag.')],
      title: text('ארבעה רבעונים, ארבע גרסאות'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [text('מודדים'), text('קאש מרוחק'), text('פיצול בדיקות'), text('בונים רק שינויים')],
      body: [
        text('זמן לכל שלב, לכל צוות.'),
        text('קאש לכל הענפים: 19 דקות.'),
        text('12 מכונות במקביל: 9 דקות.'),
        text('רק מה שהשינוי נוגע בו: 4 דקות.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_kod_process',
    name: 'ה-pipeline',
    content: {
      caption: [
        text('ה-pipeline החדש'),
        text('clone רדוד של הענף'),
        text('מושכים תוצרים מוכנים'),
        text('רק החבילות שהשתנו'),
        text('12 מכונות במקביל'),
        text('סביבה חיה לכל PR'),
      ],
      title: text('מה קורה בארבע הדקות'),
      subtitle: [text('Checkout'), text('קאש'), text('בנייה'), text('בדיקות'), text('Preview')],
      number: [text('0:12'), text('0:08'), text('1:40'), text('1:30'), text('0:30')],
      body: text('סך הכול 4 דקות, לעומת 40 לפני שנה.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_kod_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('לפני ואחרי'), text('ינואר 2026'), text('אוקטובר 2026')],
      title: text('אותו מונוריפו, CI אחר'),
      subtitle: [text('40 דקות לכל PR'), text('4 דקות לכל PR')],
      body: [
        bullets(
          'כל ריצה בונה את כל 412 החבילות',
          'הבדיקות רצות על מכונה אחת',
          'תור של 30 ריצות בשעות העומס',
        ),
        bullets(
          'בונים בממוצע 18 חבילות לריצה',
          '12 מכונות מריצות בדיקות במקביל',
          'אין תור, גם ביום חמישי בצהריים',
        ),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_kod_chart',
    name: 'התוצאות',
    content: {
      caption: [text('התוצאות'), text('נתוני ה-pipeline שלנו, ינואר עד אוקטובר 2026.')],
      title: text('זמן CI ממוצע, בדקות'),
      number: [text('−90%'), text('91%')],
      body: [text('בזמן הריצה הממוצע, מינואר ועד אוקטובר.'), text('מהבניות נשלפות היום מהקאש.')],
      footer: FOOTER_HE,
    },
    chart: {
      chartType: 'column',
      title: 'דקות לריצה, ממוצע חודשי',
      data: {
        categories: ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳'],
        series: [{ name: 'דקות', values: MINUTES }],
      },
    },
  },
  {
    layout: 'l_kod_table',
    name: 'מה בדקנו',
    content: {
      caption: [text('מה בדקנו'), text('200 ריצות לכל גישה, ספטמבר 2026.')],
      title: text('ארבע גישות, מספר אחד שקובע'),
      footer: FOOTER_HE,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['גישה', 'זמן ממוצע', 'עלות בחודש', 'מאמץ הטמעה', 'החלטה'],
        ['בנייה מלאה', '40 דק׳', '₪ 31,000', 'אין', 'נשאר מאחור'],
        ['קאש מקומי', '27 דק׳', '₪ 24,000', 'שבוע', 'לא מספיק'],
        ['קאש מרוחק', '9 דק׳', '₪ 12,000', 'חודש', 'אומץ'],
        ['קאש + רק שינויים', '4 דק׳', '₪ 7,500', 'רבעון', 'אומץ'],
      ],
    },
  },
  {
    layout: 'l_kod_full_image',
    name: 'חוות הבנייה',
    content: {
      image: { assetId: pictures.kodFarm.id },
      caption: text('חוות הבנייה'),
      title: text('12 מכונות,', 'אפס המתנה'),
      body: text('כל PR מקבל מכונות פנויות תוך שניות, והקאש משותף לכל הצוותים.'),
    },
  },
  {
    layout: 'l_kod_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'פעם פתחתי PR והלכתי להכין קפה. היום הבדיקות עוברות לפני שאני מסיימת לכתוב את התיאור.',
      ),
      attribution: text('מאיה לוי'),
      caption: text('מפתחת Frontend, צוות Payments'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_kod_team',
    name: 'הצוות',
    content: {
      caption: [text('הצוות'), text('Tech Lead'), text('Build Infra'), text('DevEx'), text('SRE')],
      title: text('מי בנה את זה'),
      image: [
        { assetId: pictures.kodTeam1.id },
        { assetId: pictures.kodTeam2.id },
        { assetId: pictures.kodTeam3.id },
        { assetId: pictures.kodTeam4.id },
      ],
      subtitle: [text('רוני אבידן'), text('עומר כץ'), text('דנה שגיא'), text('איתי קרמר')],
      body: [
        text('הובילה את המעבר, מהמדידה הראשונה ועד הגרסה הרביעית.'),
        text('בנה את שרת הקאש ואת חוות הבנייה.'),
        text('כתבה את גרף התלויות ואת הכלים למפתחים.'),
        text('דואג שהמכונות יעלו מהר וירדו בזמן.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_kod_closing',
    name: 'סיום',
    content: {
      caption: [text('מה הלאה'), text('roni@nivo.example · nivo.example/ci-talk')],
      title: text('תודה!'),
      body: [
        text('הכלי למדידת ה-pipeline פתוח ב-GitHub'),
        text('השקפים והנתונים זמינים בקישור למטה'),
        text('שאלות? נשארים כאן עד שהפיצה נגמרת'),
      ],
    },
  },
];

const sampleEn: SampleSlide[] = [
  {
    layout: 'l_kod_hero',
    name: 'Opening',
    content: {
      caption: [
        text('Platform Engineering · Nivo'),
        text('Roni Avidan · Monorepo Meetup TLV · 24 Nov 2026'),
      ],
      title: text('From 40 min', 'to 4 min'),
      subtitle: text('How we cut CI time for 300 engineers'),
    },
  },
  {
    layout: 'l_kod_section',
    name: 'Why it hurt',
    content: {
      number: text('01'),
      caption: text('Part one'),
      title: text('Why it hurt'),
      subtitle: text('Every pull request waited 40 minutes, and nobody waited quietly.'),
    },
  },
  {
    layout: 'l_kod_text',
    name: 'Today',
    content: {
      title: text('What we will see today'),
      body: {
        paragraphs: [
          para('Three changes to the infrastructure, none to the product code:'),
          ...bullets(
            'A remote cache shared by every team',
            'Tests split across 12 machines by their run time',
            'Builds of only the packages a change really touches',
          ).paragraphs,
        ],
      },
    },
  },
  {
    layout: 'l_kod_big_number',
    name: 'The problem in numbers',
    content: {
      caption: [
        text('The problem in numbers'),
        text('Average pipeline in January'),
        text('CI runs every month'),
        text('Of packages rebuilt with no change'),
      ],
      title: text('What waiting cost us'),
      number: [text('1,900'), text('40 min'), text('2,800'), text('83%')],
      subtitle: text('Hours a month spent waiting for CI'),
      body: text('Most of that time went into rebuilding code that had not changed at all.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_kod_cards',
    name: 'What we changed',
    content: {
      caption: [text('What we changed'), text('cache.ts'), text('shards.ts'), text('affected.ts')],
      title: text('Three changes, same code'),
      subtitle: [text('A remote cache'), text('Parallel tests'), text('Only what changed')],
      body: [
        text('Each artifact is built once and kept. The next run pulls it in a second.'),
        text('2,400 tests split across 12 machines by run time.'),
        text('The graph knows which packages a change affects. The rest skip.'),
        text('Not one line of product code was rewritten.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_kod_text_image',
    name: 'The dependency graph',
    content: {
      caption: text('Under the hood'),
      title: text('The dependency graph', 'decides what to build'),
      image: { assetId: pictures.kodEditor.id },
      subtitle: [
        text('A map of 412 packages'),
        text('A key for every input'),
        text('A 91% cache hit rate'),
      ],
      body: [
        text('Each package knows what it depends on, and what depends on it.'),
        text('A changed file changes the key of affected packages only.'),
        text('Most runs rebuild almost nothing at all.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_kod_timeline',
    name: 'The road',
    content: {
      caption: [text('The road'), text('Each stage reached every team at once, behind a flag.')],
      title: text('Four quarters, four releases'),
      number: [text('Q1'), text('Q2'), text('Q3'), text('Q4')],
      subtitle: [
        text('Measure'),
        text('Remote cache'),
        text('Split tests'),
        text('Build changes only'),
      ],
      body: [
        text('Timings for every step, per team.'),
        text('A cache for every branch: 19 minutes.'),
        text('Twelve machines at once: 9 minutes.'),
        text('Only what a change touches: 4 minutes.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_kod_process',
    name: 'The pipeline',
    content: {
      caption: [
        text('The new pipeline'),
        text('A shallow clone of the branch'),
        text('Pull ready artifacts'),
        text('Only changed packages'),
        text('Twelve machines at once'),
        text('A live environment per PR'),
      ],
      title: text('What happens in four minutes'),
      subtitle: [text('Checkout'), text('Cache'), text('Build'), text('Test'), text('Preview')],
      number: [text('0:12'), text('0:08'), text('1:40'), text('1:30'), text('0:30')],
      body: text('Four minutes in all, against forty a year ago.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_kod_comparison',
    name: 'Before and after',
    content: {
      caption: [text('Before and after'), text('January 2026'), text('October 2026')],
      title: text('Same code, different CI'),
      subtitle: [text('40 minutes per PR'), text('4 minutes per PR')],
      body: [
        bullets(
          'Every run builds all 412 packages',
          'Tests run on one machine',
          'A queue of 30 runs at peak',
        ),
        bullets(
          '18 packages built per run',
          'Twelve machines test in parallel',
          'No queue, even on Thursdays',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_kod_chart',
    name: 'Results',
    content: {
      caption: [text('Results'), text('Our pipeline data, January to October 2026.')],
      title: text('Average CI time, in minutes'),
      number: [text('−90%'), text('91%')],
      body: [
        text('In the average run time, from January to October.'),
        text('Of builds now come straight from the cache.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Minutes per run, monthly average',
      data: {
        categories: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
        series: [{ name: 'Minutes', values: MINUTES }],
      },
    },
  },
  {
    layout: 'l_kod_table',
    name: 'What we tried',
    content: {
      caption: [text('What we tried'), text('200 runs of each approach, September 2026.')],
      title: text('Four approaches, one deciding number'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['Approach', 'Average time', 'Monthly cost', 'Effort', 'Decision'],
        ['Full build', '40 min', '$8,400', 'None', 'Left behind'],
        ['Local cache', '27 min', '$6,500', 'A week', 'Not enough'],
        ['Remote cache', '9 min', '$3,300', 'A month', 'Adopted'],
        ['Cache + changes only', '4 min', '$2,000', 'A quarter', 'Adopted'],
      ],
    },
  },
  {
    layout: 'l_kod_full_image',
    name: 'The build farm',
    content: {
      image: { assetId: pictures.kodFarm.id },
      caption: text('The build farm'),
      title: text('Twelve machines,', 'zero waiting'),
      body: text(
        'Every PR gets free machines within seconds, and the cache is shared by every team.',
      ),
    },
  },
  {
    layout: 'l_kod_quote',
    name: 'Quote',
    content: {
      quote: text(
        'I used to open a PR and go make coffee. Now the checks pass before I finish writing the description.',
      ),
      attribution: text('Maya Levi'),
      caption: text('Frontend engineer, Payments team'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_kod_team',
    name: 'The team',
    content: {
      caption: [
        text('The team'),
        text('Tech Lead'),
        text('Build Infra'),
        text('DevEx'),
        text('SRE'),
      ],
      title: text('Who built it'),
      image: [
        { assetId: pictures.kodTeam1.id },
        { assetId: pictures.kodTeam2.id },
        { assetId: pictures.kodTeam3.id },
        { assetId: pictures.kodTeam4.id },
      ],
      subtitle: [text('Roni Avidan'), text('Omer Katz'), text('Dana Sagi'), text('Itai Kramer')],
      body: [
        text('Led the move, from first measurement to fourth release.'),
        text('Built the cache server and the build farm.'),
        text('Wrote the dependency graph and the tools.'),
        text('Keeps the machines fast to start and quick to stop.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_kod_closing',
    name: 'Closing',
    content: {
      caption: [text('What next'), text('roni@nivo.example · nivo.example/ci-talk')],
      title: text('Thank you!'),
      body: [
        text('Our pipeline timing tool is open on GitHub'),
        text('The slides and the data are at the link below'),
        text('Questions? We stay until the pizza runs out'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const kodSamples = { he: sampleHe, en: sampleEn };

/** The Kod template: the theme, its layouts for both directions, and its sample deck. */
export function kodTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(kodTheme),
    description:
      'Code editor: syntax colours on charcoal, a gutter of line numbers, a git graph and a terminal at the foot, for tech talks and engineering reviews.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.kodEditor,
      pictures.kodFarm,
      pictures.kodTeam1,
      pictures.kodTeam2,
      pictures.kodTeam3,
      pictures.kodTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}

export const entry = { id: 'kod', template: kodTemplate, samples: kodSamples };
