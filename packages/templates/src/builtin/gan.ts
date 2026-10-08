import type { ColorToken, Element, Frame, Layout, Theme } from '@slidr/model';
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
  label,
  pageNumber,
  place,
  rect,
  sampleSlides,
  solid,
  SURFACE,
  text,
  token,
  type SampleSlide,
} from './kit';
import { pictures } from './pictures.generated';

/**
 * Gan: the playful template. A warm white ground, three bright colours used as large round
 * shapes and as stickers, doodles drawn by hand, and a rounded face. For a school, a workshop,
 * a youth programme, a children's museum.
 *
 * The blue is the strong colour because a table's header row is filled with `primary` and
 * written in the ground's colour: of the three, only the blue is dark enough for that. The
 * text of a placeholder is always ink, so ink has to read on whatever a layout puts under it:
 * the yellow, the tomato and the pale tints do; the blue is kept away from text.
 */
export const ganTheme: Theme = {
  id: 'gan',
  name: 'Gan',
  colors: {
    bg: '#fffaf0',
    surface: '#ffffff',
    text: '#1f1d47',
    muted: '#504f76',
    primary: '#1f62d6',
    secondary: '#ff5a4a',
    accent: '#ffc93c',
    chart: ['#1f62d6', '#ff5a4a', '#ffc93c', '#2fb67c', '#8a63d2', '#1f1d47'],
  },
  fonts: {
    // One family for both scripts in the headings: a Latin term inside a Hebrew title keeps
    // the weight and the rounded corners of the letters around it.
    heading: { he: 'Rubik', latin: 'Rubik' },
    body: { he: 'Varela Round', latin: 'Varela Round' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 116,
      weight: 800,
      lineHeight: 1.05,
      color: { token: 'text' },
    },
    title: { font: 'heading', size: 66, weight: 800, lineHeight: 1.14, color: { token: 'text' } },
    heading: { font: 'heading', size: 42, weight: 700, lineHeight: 1.2, color: { token: 'text' } },
    // The body face ships in one weight.
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 400, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 36,
  shadow: { x: 0, y: 12, blur: 28, color: { value: '#1f1d47', alpha: 0.12 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [SURFACE, { fill: { kind: 'solid', color: { token: 'accent' } } }],
};

// ---------------------------------------------------------------------------------------------
// The colours and the pen

/** The literal colours of the drawings. Each stands for a token of the theme (`PAINT`). */
const C = {
  blue: '#1f62d6',
  tomato: '#ff5a4a',
  sun: '#ffc93c',
  ink: '#1f1d47',
  white: '#ffffff',
} as const;

type Hue = keyof typeof C;
/** The three bright colours. */
type Bright = 'blue' | 'tomato' | 'sun';

const TOKEN: Record<Hue, ColorToken> = {
  blue: 'primary',
  tomato: 'secondary',
  sun: 'accent',
  ink: 'text',
  white: 'surface',
};

const PAINT = {
  [C.blue]: token('primary'),
  [C.tomato]: token('secondary'),
  [C.sun]: token('accent'),
  [C.ink]: token('text'),
  [C.white]: token('surface'),
};

const fillOf = (hue: Hue, alpha?: number) => solid(token(TOKEN[hue], alpha));

/** What reads on a bright colour: white on the blue, ink on the yellow and on the tomato. */
const onHue = (hue: Bright): Hue => (hue === 'blue' ? 'white' : 'ink');

/** How strong each bright colour is as the tint of a card. */
const SOFT: Record<Bright, number> = { blue: 0.12, tomato: 0.14, sun: 0.3 };

const round = (n: number) => Math.round(n * 10) / 10;

const svg = (w: number, h: number, ...parts: string[]) =>
  `<svg viewBox="0 0 ${w} ${h}" fill="none">${parts.join('')}</svg>`;

/** A round-tipped pen. */
const pen = (hue: Hue, width: number, opacity = 1) =>
  `fill="none" stroke="${C[hue]}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"${
    opacity < 1 ? ` stroke-opacity="${opacity}"` : ''
  }`;

const disc = (cx: number, cy: number, r: number, hue: Hue) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C[hue]}"/>`;

/** A ring of dots around a shape. */
const ring = (cx: number, cy: number, r: number, hue: Hue, width = 6) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" ${pen(hue, width)} stroke-dasharray="0.1 ${width * 3}"/>`;

/** A four-pointed star with soft sides, in a box of 100. */
const SPARK = 'M50 4C53 31 69 47 96 50C69 53 53 69 50 96C47 69 31 53 4 50C31 47 47 31 50 4Z';

const sparkle = (cx: number, cy: number, size: number, hue: Hue) =>
  `<path transform="translate(${round(cx - size / 2)} ${round(cy - size / 2)}) scale(${size / 100})" d="${SPARK}" fill="${C[hue]}"/>`;

/** The path of a wavy line: `length` to the right of a point, half a wave at a time. */
function wavy(x: number, y: number, length: number, period: number, rise: number): string {
  const half = period / 2;
  const halves = Math.max(1, Math.round(length / half));
  const step = round(length / halves);
  return `M${x} ${y}q${round(step / 2)} ${-rise} ${step} 0${`t${step} 0`.repeat(halves - 1)}`;
}

const squiggle = (
  x: number,
  y: number,
  length: number,
  hue: Hue,
  look: { width?: number; period?: number; rise?: number; opacity?: number } = {},
) =>
  `<path d="${wavy(x, y, length, look.period ?? 56, look.rise ?? 11)}" ${pen(hue, look.width ?? 8, look.opacity)}/>`;

/** A small grid of dots. */
const dots = (x: number, y: number, columns: number, rows: number, hue: Hue, gap = 26) =>
  Array.from({ length: columns * rows }, (_, i) =>
    disc(x + (i % columns) * gap, y + Math.floor(i / columns) * gap, 5, hue),
  ).join('');

/** A star of many points with rounded tips: the edge of a sticker. */
function burst(cx: number, cy: number, outer: number, inner: number, points: number, hue: Hue) {
  const corners = Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    return `${round(cx + r * Math.cos(angle))},${round(cy + r * Math.sin(angle))}`;
  });
  return `<polygon points="${corners.join(' ')}" fill="${C[hue]}" stroke="${C[hue]}" stroke-width="8" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------------------------------------
// What the layouts share

/** The mark of the template: a sprout in a rounded square. A deck replaces it with its logo. */
const MARK = `<svg viewBox="0 0 48 48"><rect width="48" height="48" rx="15" fill="${C.blue}"/><path d="M24 39V23" fill="none" stroke="${C.white}" stroke-width="4" stroke-linecap="round"/><path d="M24 27C24 19 18 14 10 14c0 8 6 13 14 13Z" fill="${C.sun}"/><path d="M24 23C24 15 30 10 38 10c0 8-6 13-14 13Z" fill="${C.white}"/></svg>`;

const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** A four-pointed star by itself: before the line over a title, and as a bullet. */
const spark = (id: string, frame: Frame, hue: Hue) =>
  drawing(id, frame, svg(100, 100, `<path d="${SPARK}" fill="${C[hue]}"/>`), PAINT);

const grown = (frame: Frame, by: number): Frame => ({
  x: frame.x - by,
  y: frame.y - by,
  w: frame.w + 2 * by,
  h: frame.h + 2 * by,
});

/**
 * A card in a pale tint of one of the bright colours. The tint lies on white, not on the cream
 * of the slide: blue over cream turns grey.
 */
const tint = (id: string, frame: Frame, hue: Bright, radius = 36): Element[] => [
  rect(id, frame, fillOf('white'), { effects: { radius } }),
  rect(`${id}_tint`, frame, fillOf(hue, SOFT[hue]), { effects: { radius } }),
];

/** A round sticker with a figure on it, set by the layout: the number of a step. */
const sticker = (id: string, frame: Frame, hue: Bright, figure: string): Element[] => [
  dot(`${id}_rim`, grown(frame, 6), fillOf('white')),
  dot(id, frame, fillOf(hue)),
  label(`${id}_figure`, frame, figure, 'heading', {
    dir: 'auto',
    align: 'center',
    vAlign: 'middle',
    color: token(TOKEN[onHue(hue)]),
    weight: 800,
  }),
];

/** A bead on a line: a bright dot with a white rim and a white heart. */
const bead = (id: string, frame: Frame, hue: Bright): Element[] => [
  dot(`${id}_rim`, grown(frame, 7), fillOf('white')),
  dot(id, frame, fillOf(hue)),
  dot(`${id}_heart`, grown(frame, -19), fillOf('white')),
];

/** A round sticker with a small drawing on it, stuck a little askew on the edge of a card. */
function badge(
  id: string,
  frame: Frame,
  hue: Bright,
  glyph: 'spark' | 'flower' | 'swirl',
  turn: number,
): Element {
  const on = onHue(hue);
  const petals = [0, 1, 2, 3, 4].map((k) => {
    const angle = (k * 2 * Math.PI) / 5 - Math.PI / 2;
    return disc(round(40 + 14 * Math.cos(angle)), round(40 + 14 * Math.sin(angle)), 8.5, on);
  });
  const inside =
    glyph === 'spark'
      ? sparkle(40, 40, 46, on)
      : glyph === 'flower'
        ? petals.join('') + disc(40, 40, 6.5, hue)
        : `<path d="M41 41c0-5 7-5 7 1c0 9-15 9-15-2c0-13 23-13 23 3c0 15-29 17-31-3" ${pen(on, 5)}/>`;
  return {
    ...drawing(
      id,
      frame,
      svg(80, 80, disc(40, 40, 40, 'white'), disc(40, 40, 34, hue), inside),
      PAINT,
    ),
    rotation: turn,
  };
}

/** A long pill with a star at its start: the line that sums a slide up sits in it. */
const notePill = (id: string, frame: Frame): Element[] => [
  ...tint(id, frame, 'sun', frame.h / 2),
  spark(
    `${id}_spark`,
    { x: frame.x + frame.w - 26 - 36, y: frame.y + (frame.h - 36) / 2, w: 36, h: 36 },
    'tomato',
  ),
];

/**
 * A cluster of shapes in the corner over the end of the title: one large shape that runs off
 * the slide and two small doodles. Each layout has its own, in its own leading colour; the
 * title's frame stops short of it.
 */
function corner(
  name: string,
  kind: 'half' | 'quarter' | 'ball',
  [lead, second, third]: [Hue, Hue, Hue],
  scale = 1,
): Element {
  const parts =
    kind === 'half'
      ? [disc(214, -6, 138, lead), sparkle(86, 168, 68, second), dots(292, 178, 3, 2, third)]
      : kind === 'quarter'
        ? [disc(0, 0, 214, lead), ring(0, 0, 252, third), sparkle(318, 92, 64, second)]
        : [disc(128, 62, 108, lead), squiggle(206, 208, 140, second), disc(318, 96, 24, third)];
  return drawing(
    `d_gan_${name}_corner`,
    atEnd(0, 0, 400 * scale, 280 * scale),
    svg(400, 280, ...parts),
    PAINT,
  );
}

/** The line over a title and the title itself, as every content slide has them. */
const head = (width = 1400, lines = 2) => [
  place('p_kicker', 'caption', at(136, 82, Math.min(900, width - 40), 34), 'caption'),
  place('p_title', 'title', at(96, 124, width, 76 * lines), 'title'),
];

/**
 * What frames a content slide besides its head: the star before the line over the title, in
 * the layout's leading colour, and the foot. The mark stands alone at the start, which leaves a
 * logo of any width room to replace it; at the end is the deck's name, and beyond it the
 * slide's number on a yellow dot (SLD-04).
 */
function frameOf(
  name: string,
  lead: Hue | undefined,
  width = 1728,
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  const number = at(96 + width - 48, 946, 48, 48);
  return {
    placeholders: [
      place('p_footer', 'footer', at(96 + width - 64 - 828, 953, 828, 34), 'caption', {
        align: 'end',
      }),
    ],
    decorations: [
      ...(lead ? [spark(`d_gan_${name}_spark`, at(96, 83, 32, 32), lead)] : []),
      mark(`d_gan_${name}_mark`, at(96, 948, 44, 44)),
      dot(`d_gan_${name}_page`, number, fillOf('sun')),
      pageNumber(`d_gan_${name}_number`, number, 'caption', {
        align: 'center',
        vAlign: 'middle',
        color: token('text'),
      }),
    ],
  };
}

/** The garden of the opening slide: a sun in a ring of dots, an arch, a ball and doodles. */
const garden = (id: string) =>
  drawing(
    id,
    atEnd(0, 0, 760, 1080),
    svg(
      760,
      1080,
      ring(250, 262, 268, 'ink'),
      disc(250, 262, 222, 'sun'),
      `<path d="M70 1080V790a200 200 0 0 1 400 0v290Z" fill="${C.blue}"/>`,
      squiggle(150, 900, 240, 'white', { width: 10, period: 60, rise: 13 }),
      disc(606, 940, 150, 'tomato'),
      sparkle(628, 150, 120, 'tomato'),
      disc(520, 560, 38, 'blue'),
      dots(488, 664, 3, 3, 'ink'),
    ),
    PAINT,
  );

/** The speech bubble of the quote: a pale blue sheet with its tail at the start. */
const BUBBLE =
  'M64 0H1356a64 64 0 0 1 64 64V456a64 64 0 0 1-64 64H1290c-6 30-26 56-62 74c14-24 18-50 14-74H64a64 64 0 0 1-64-64V64A64 64 0 0 1 64 0Z';

const bubble = (id: string, frame: Frame) =>
  drawing(
    id,
    frame,
    svg(
      1420,
      600,
      `<path d="${BUBBLE}" fill="${C.white}"/>`,
      `<path d="${BUBBLE}" fill="${C.blue}" fill-opacity="0.12"/>`,
    ),
    PAINT,
  );

/**
 * The sticker on the corner of the bubble. The marks of the two directions are two marks, not
 * one and its mirror: the one that opens a Hebrew quote, turned half a circle, opens a Latin one.
 */
function quoteSticker(frame: Frame, dir: 'rtl' | 'ltr'): Element {
  const one = (dx: number) =>
    `<circle cx="${16 + dx}" cy="16" r="13" fill="${C.white}"/><path d="M${27 + dx} 18c0 14-6 24-18 28" ${pen('white', 8)}/>`;
  const turn = dir === 'ltr' ? ' transform="rotate(180 62 62)"' : '';
  const marks = `<g${turn}><g transform="translate(26 36)">${one(0)}${one(38)}</g></g>`;
  return {
    ...drawing('d_gan_quote_glyph', frame, svg(124, 124, disc(62, 62, 62, 'tomato'), marks), PAINT),
    rotation: dir === 'rtl' ? -8 : 8,
  };
}

/** A row of half discs under the lower edge of a picture: the picture hides their upper half. */
const scallops = (id: string, frame: Frame) =>
  drawing(
    id,
    frame,
    svg(1920, 80, ...Array.from({ length: 24 }, (_, i) => disc(40 + 80 * i, 40, 40, 'sun'))),
    PAINT,
  );

/** An arrow drawn by hand, towards the end side. The mirror turns it. */
const ARROW = svg(
  76,
  40,
  `<path d="M70 12C52 4 30 8 10 24" ${pen('ink', 5)}/>`,
  `<path d="M24 8L8 25l19 5" ${pen('ink', 5)}/>`,
);

/** The dotted arrow from one step to the next. */
const STEP_ARROW = svg(
  224,
  32,
  `<path d="M218 16C160 4 96 28 22 16" ${pen('ink', 5, 0.5)} stroke-dasharray="0.1 13"/>`,
  `<path d="M26 5L8 16l18 11" ${pen('ink', 5, 0.5)}/>`,
);

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const cards3 = [96, 688, 1280];
const columns4 = [96, 540, 984, 1428];
const steps5 = [96, 448, 800, 1152, 1504];
const points3 = [300, 506, 712];
const stats3 = [304, 482, 660];
const lines3 = [516, 608, 700];

/** The bright colours in the order a row of three, four or five takes them. */
const hueOf = (i: number, order: readonly Bright[]): Bright => order[i % order.length] ?? 'sun';
const CARDS: readonly Bright[] = ['sun', 'blue', 'tomato'];
const STEPS: readonly Bright[] = ['blue', 'sun', 'tomato'];
const BEADS: readonly Bright[] = ['tomato', 'sun', 'blue'];

function layouts(): Layout[] {
  return [
    {
      id: 'l_gan_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        // The line over the title stands under the mark, which leaves a logo of any width
        // room to replace it; the title stands on the subtitle, whether it takes one line or
        // three.
        place('p_kicker', 'caption', at(96, 162, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 262, 1240, 366), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 652, 1100, 101), 'heading'),
        place('p_meta', 'caption', at(96, 940, 1000, 34), 'caption'),
      ],
      decorations: [
        garden('d_gan_hero_garden'),
        mark('d_gan_hero_mark', at(96, 80, 64, 64)),
        drawing(
          'd_gan_hero_wave',
          at(96, 788, 220, 28),
          svg(220, 28, squiggle(6, 14, 208, 'tomato')),
          PAINT,
        ),
      ],
    },
    {
      id: 'l_gan_section',
      name: 'Section',
      archetype: 'section',
      background: { fill: solid(token('accent')) },
      placeholders: [
        // The number stands on a white disc, a sticker on the yellow.
        place('p_number', 'number', atEnd(190, 442, 400, 156), 'display', {
          align: 'center',
          vAlign: 'middle',
        }),
        place('p_kicker', 'caption', at(136, 82, 800, 34), 'caption'),
        place('p_title', 'title', at(96, 300, 1060, 366), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(96, 690, 1060, 152), 'heading'),
      ],
      decorations: [
        drawing(
          'd_gan_section_shapes',
          atEnd(0, 0, 760, 1080),
          svg(
            760,
            1080,
            disc(120, 1010, 290, 'blue'),
            disc(600, 40, 150, 'tomato'),
            ring(390, 520, 262, 'ink'),
            squiggle(430, 936, 250, 'ink'),
            sparkle(664, 806, 84, 'white'),
          ),
          PAINT,
        ),
        dot('d_gan_section_disc', atEnd(170, 300, 440, 440), fillOf('white')),
        spark('d_gan_section_spark', at(96, 83, 32, 32), 'tomato'),
      ],
    },
    {
      id: 'l_gan_title',
      name: 'Title',
      archetype: 'title',
      placeholders: [place('p_title', 'title', at(96, 124, 1400, 76), 'title')],
      decorations: [
        corner('title', 'ball', ['sun', 'blue', 'tomato']),
        ...frameOf('title', 'sun').decorations,
      ],
    },
    {
      id: 'l_gan_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head(),
        // The figure, what it counts and what it means share one yellow panel.
        place('p_number', 'number', at(152, 336, 868, 128), 'display'),
        place('p_label', 'subtitle', at(152, 478, 868, 104), 'heading'),
        place('p_body', 'body', at(152, 604, 868, 172), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', at(1160, top + 42, 264, 76), 'title', {
            vAlign: 'middle',
          }),
          place(`p_stat${i + 1}_label`, 'caption', at(1440, top + 29, 348, 102), 'caption', {
            vAlign: 'middle',
          }),
        ]),
        ...frameOf('big_number', 'blue').placeholders,
      ],
      decorations: [
        corner('big_number', 'half', ['blue', 'tomato', 'ink']),
        rect('d_gan_big_number_panel', at(96, 304, 980, 516), fillOf('sun'), {
          effects: { radius: 44 },
        }),
        {
          ...spark('d_gan_big_number_star', at(1036, 270, 80, 80), 'tomato'),
          rotation: 12,
        },
        ...stats3.flatMap((top, i) =>
          tint(
            `d_gan_big_number_stat${i + 1}`,
            at(1124, top, 700, 160),
            hueOf(i, ['blue', 'tomato', 'blue']),
            40,
          ),
        ),
        ...frameOf('big_number', 'blue').decorations,
      ],
    },
    {
      id: 'l_gan_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(172, 160, 1268, 400), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(96, 742, 1100, 53), 'heading'),
        place('p_caption', 'caption', at(96, 800, 1200, 68), 'caption'),
        ...frameOf('quote', undefined).placeholders,
      ],
      decorations: [
        drawing(
          'd_gan_quote_shapes',
          atEnd(0, 60, 400, 880),
          svg(
            400,
            880,
            ring(190, 200, 172, 'ink'),
            disc(190, 200, 138, 'sun'),
            sparkle(268, 458, 112, 'blue'),
            disc(138, 690, 84, 'tomato'),
            squiggle(214, 604, 150, 'ink'),
          ),
          PAINT,
        ),
        bubble('d_gan_quote_bubble', at(96, 100, 1420, 600)),
        quoteSticker(at(48, 52, 124, 124), 'rtl'),
        ...frameOf('quote', undefined).decorations,
      ],
    },
    {
      id: 'l_gan_text',
      name: 'Text',
      archetype: 'text',
      placeholders: [
        place('p_title', 'title', at(96, 124, 1400, 76), 'title'),
        // The body stops short of the corner, as the title does.
        place('p_body', 'body', at(96, 248, 1400, 652), 'body'),
      ],
      decorations: [
        corner('text', 'half', ['tomato', 'sun', 'blue']),
        ...frameOf('text', 'tomato').decorations,
      ],
    },
    {
      id: 'l_gan_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head(1040),
        // The picture is a print on a white mat: a placeholder cannot round its corners, the
        // mat around it can.
        place('p_image', 'image', atEnd(116, 108, 552, 784)),
        ...points3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(180, top + 2, 956, 53), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(180, top + 58, 956, 130), 'body'),
        ]),
        ...frameOf('text_image', 'blue', 1040).placeholders,
      ],
      decorations: [
        // Shapes behind the mat, showing at its corners.
        drawing(
          'd_gan_text_image_shapes',
          atEnd(0, 0, 760, 1080),
          svg(
            760,
            1080,
            disc(112, 104, 124, 'sun'),
            disc(668, 902, 72, 'blue'),
            sparkle(704, 96, 92, 'tomato'),
          ),
          PAINT,
        ),
        rect('d_gan_text_image_mat', atEnd(96, 88, 592, 824), fillOf('white'), {
          effects: { radius: 40 },
        }),
        ...points3.flatMap((top, i) =>
          sticker(`d_gan_text_image_n${i + 1}`, at(96, top, 60, 60), hueOf(i, STEPS), `${i + 1}`),
        ),
        ...frameOf('text_image', 'blue', 1040).decorations,
      ],
    },
    {
      id: 'l_gan_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture runs from edge to edge; the text has a band of its own under it, because
        // nothing of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 620)),
        place('p_kicker', 'caption', at(136, 712, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 754, 1060, 152), 'title'),
        place('p_body', 'body', atEnd(96, 760, 560, 210), 'body'),
      ],
      decorations: [
        scallops('d_gan_full_image_scallops', atEnd(0, 580, 1920, 80)),
        spark('d_gan_full_image_spark', at(96, 713, 32, 32), 'tomato'),
        drawing('d_gan_full_image_arrow', atEnd(672, 808, 76, 40), ARROW, PAINT),
      ],
    },
    {
      id: 'l_gan_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head(),
        ...cards3.flatMap((start, i) => [
          // The name stands on the note under it, whether it takes one line or two.
          place(`p_card${i + 1}`, 'subtitle', at(start + 40, 380, 464, 101), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_card${i + 1}_body`, 'body', at(start + 40, 570, 464, 178), 'body'),
          place(`p_card${i + 1}_note`, 'caption', at(start + 40, 488, 464, 68), 'caption'),
        ]),
        place('p_takeaway', 'body', at(176, 822, 1608, 84), 'body', { vAlign: 'middle' }),
        ...frameOf('cards', 'tomato').placeholders,
      ],
      decorations: [
        corner('cards', 'ball', ['tomato', 'ink', 'sun']),
        ...cards3.flatMap((start, i) => [
          ...tint(`d_gan_cards_card${i + 1}`, at(start, 316, 544, 480), hueOf(i, CARDS)),
          badge(
            `d_gan_cards_badge${i + 1}`,
            at(start + 424, 276, 80, 80),
            hueOf(i, ['tomato', 'sun', 'blue']),
            (['spark', 'flower', 'swirl'] as const)[i] ?? 'spark',
            i === 1 ? 8 : -8,
          ),
        ]),
        ...notePill('d_gan_cards_takeaway', at(96, 818, 1728, 92)),
        ...frameOf('cards', 'tomato').decorations,
      ],
    },
    {
      id: 'l_gan_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start + 28, 292, 368, 76), 'title'),
          place(`p_what${i + 1}`, 'subtitle', at(start + 28, 482, 340, 101), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_what${i + 1}_body`, 'body', at(start + 28, 592, 340, 214), 'body'),
        ]),
        place('p_note', 'caption', at(96, 848, 1728, 68), 'caption'),
        ...frameOf('timeline', 'sun').placeholders,
      ],
      decorations: [
        corner('timeline', 'quarter', ['sun', 'tomato', 'ink']),
        // The year is a wavy line that runs on beyond the slide at both ends, with a bead where
        // each stop is and the stop's card, in the bead's colour, under it.
        drawing(
          'd_gan_timeline_wave',
          atEnd(0, 388, 1920, 40),
          svg(
            1920,
            40,
            squiggle(0, 20, 1920, 'ink', { width: 6, period: 80, rise: 10, opacity: 0.3 }),
          ),
          PAINT,
        ),
        ...columns4.flatMap((start, i) => [
          ...bead(`d_gan_timeline_bead${i + 1}`, at(start + 28, 380, 56, 56), hueOf(i, BEADS)),
          ...tint(`d_gan_timeline_card${i + 1}`, at(start, 462, 396, 366), hueOf(i, BEADS)),
        ]),
        ...frameOf('timeline', 'sun').decorations,
      ],
    },
    {
      id: 'l_gan_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start, 396, 320, 101), 'heading', {
            vAlign: 'bottom',
          }),
          place(`p_step${i + 1}_body`, 'caption', at(start, 505, 312, 135), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start, 652, 320, 76), 'title'),
        ]),
        place('p_summary', 'body', at(176, 786, 1608, 84), 'body', { vAlign: 'middle' }),
        ...frameOf('process', 'blue').placeholders,
      ],
      decorations: [
        corner('process', 'ball', ['blue', 'tomato', 'sun']),
        ...steps5.flatMap((start, i) => [
          ...sticker(
            `d_gan_process_n${i + 1}`,
            at(start, 300, 84, 84),
            hueOf(i, STEPS),
            `${i + 1}`,
          ),
          // A stroke of a marker under what the step takes.
          rect(`d_gan_process_bar${i + 1}`, at(start, 736, 88, 10), fillOf(hueOf(i, STEPS)), {
            effects: { radius: 5 },
          }),
        ]),
        ...steps5
          .slice(0, 4)
          .map((start, i) =>
            drawing(
              `d_gan_process_arrow${i + 1}`,
              at(start + 106, 326, 224, 32),
              STEP_ARROW,
              PAINT,
            ),
          ),
        ...notePill('d_gan_process_summary', at(96, 782, 1728, 92)),
        ...frameOf('process', 'blue').decorations,
      ],
    },
    {
      id: 'l_gan_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head(),
        place('p_before_tag', 'caption', at(136, 350, 760, 34), 'caption'),
        place('p_before', 'subtitle', at(136, 390, 760, 101), 'heading'),
        place('p_before_body', 'body', at(136, 546, 760, 296), 'body'),
        place('p_after_tag', 'caption', atEnd(136, 350, 760, 34), 'caption'),
        place('p_after', 'subtitle', atEnd(136, 390, 760, 101), 'heading'),
        place('p_after_body', 'body', atEnd(136, 546, 760, 296), 'body'),
        ...frameOf('comparison', 'tomato').placeholders,
      ],
      decorations: [
        // What was is a sheet with a dashed edge; what is now is yellow, with a sticker on it.
        rect('d_gan_comparison_before', at(96, 316, 840, 548), fillOf('white'), {
          stroke: { color: token('muted', 0.55), width: 3, dash: 'dashed' },
          effects: { radius: 40 },
        }),
        ...tint('d_gan_comparison_after', atEnd(96, 316, 840, 548), 'sun', 40),
        drawing(
          'd_gan_comparison_rule1',
          at(136, 506, 136, 22),
          svg(
            136,
            22,
            squiggle(5, 11, 126, 'ink', { width: 6, period: 36, rise: 7, opacity: 0.35 }),
          ),
          PAINT,
        ),
        drawing(
          'd_gan_comparison_rule2',
          atEnd(760, 506, 136, 22),
          svg(136, 22, squiggle(5, 11, 126, 'tomato', { width: 6, period: 36, rise: 7 })),
          PAINT,
        ),
        {
          ...drawing(
            'd_gan_comparison_star',
            atEnd(40, 258, 120, 120),
            svg(120, 120, burst(60, 60, 54, 44, 12, 'tomato'), sparkle(60, 60, 56, 'white')),
            PAINT,
          ),
          rotation: -10,
        },
        ...frameOf('comparison', 'tomato').decorations,
      ],
    },
    {
      id: 'l_gan_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head(),
        place('p_chart', 'chart', atEnd(128, 328, 1072, 544)),
        place('p_stat1', 'number', at(136, 322, 464, 76), 'title'),
        place('p_stat1_body', 'body', at(136, 402, 464, 130), 'body'),
        place('p_stat2', 'number', at(136, 572, 464, 76), 'title'),
        place('p_stat2_body', 'body', at(136, 652, 464, 130), 'body'),
        place('p_source', 'caption', at(96, 810, 544, 102), 'caption'),
        ...frameOf('chart', 'sun').placeholders,
      ],
      decorations: [
        corner('chart', 'half', ['sun', 'blue', 'tomato']),
        rect('d_gan_chart_card', atEnd(96, 300, 1136, 600), fillOf('white'), {
          effects: { radius: 40 },
        }),
        ...tint('d_gan_chart_stat1', at(96, 300, 544, 240), 'sun'),
        ...tint('d_gan_chart_stat2', at(96, 550, 544, 240), 'blue'),
        ...frameOf('chart', 'sun').decorations,
      ],
    },
    {
      id: 'l_gan_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head(1480, 1),
        place('p_table', 'table', at(96, 226, 1728, 620)),
        place('p_note', 'caption', at(96, 862, 1480, 68), 'caption'),
        ...frameOf('table', 'tomato').placeholders,
      ],
      decorations: [
        corner('table', 'quarter', ['tomato', 'sun', 'ink'], 0.72),
        drawing(
          'd_gan_table_wave',
          atEnd(96, 868, 190, 28),
          svg(190, 28, squiggle(6, 14, 178, 'blue')),
          PAINT,
        ),
        ...frameOf('table', 'tomato').decorations,
      ],
    },
    {
      id: 'l_gan_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start + 16, 316, 364, 348)),
          place(`p_person${i + 1}`, 'subtitle', at(start, 696, 396, 53), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start, 750, 396, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start, 790, 396, 135), 'caption'),
        ]),
        ...frameOf('team', 'blue').placeholders,
      ],
      decorations: [
        corner('team', 'quarter', ['blue', 'sun', 'ink']),
        // Each portrait on a mat of its own colour.
        ...columns4.map((start, i) =>
          rect(`d_gan_team_mat${i + 1}`, at(start, 300, 396, 380), fillOf(hueOf(i, CARDS)), {
            effects: { radius: 36 },
          }),
        ),
        ...frameOf('team', 'blue').decorations,
      ],
    },
    {
      id: 'l_gan_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(136, 82, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 126, 1320, 366), 'display', { vAlign: 'bottom' }),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(164, top, 1116, 84), 'body', { vAlign: 'middle' }),
        ),
        // The mark stands alone over the contact line, so a wide logo can replace it.
        place('p_contact', 'caption', at(96, 894, 1100, 68), 'caption'),
      ],
      decorations: [
        drawing(
          'd_gan_closing_shapes',
          atEnd(0, 0, 520, 1080),
          svg(
            520,
            1080,
            `<rect x="40" y="64" width="150" height="380" rx="75" fill="${C.blue}"/>`,
            ring(330, 330, 172, 'ink'),
            disc(330, 330, 140, 'sun'),
            disc(170, 890, 330, 'tomato'),
            squiggle(40, 900, 300, 'white', { width: 10, period: 60, rise: 13 }),
            sparkle(436, 600, 76, 'blue'),
          ),
          PAINT,
        ),
        spark('d_gan_closing_spark', at(96, 83, 32, 32), 'tomato'),
        ...lines3.map((top, i) =>
          spark(
            `d_gan_closing_bullet${i + 1}`,
            at(96, top + 22, 40, 40),
            hueOf(i, ['tomato', 'blue', 'sun']),
          ),
        ),
        mark('d_gan_closing_mark', at(96, 824, 52, 52)),
      ],
    },
  ];
}

/**
 * The layouts the mirror gets wrong for a left-to-right deck. Only the quote: the marks on its
 * sticker are of the direction, and mirrored Hebrew marks do not open a Latin quote.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  const quote = drawn.find((layout) => layout.id === 'l_gan_quote');
  if (!quote) return [];
  const mirrored = mirrorLayout(quote);
  return [
    {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) =>
        decoration.id === 'd_gan_quote_glyph' ? quoteSticker(decoration.frame, 'ltr') : decoration,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: a year of a neighbourhood makers' workshop for children

const FOOTER = text('גן היוצרים · סיכום 2026');
const FOOTER_EN = text('The Makers’ Garden · 2026');
const REGULAR = [64, 78, 92, 120, 96, 88];
const OPEN = [22, 31, 48, 94, 52, 41];
const TABLE_COLS = [560, 250, 250, 300, 368];
const TABLE_ROW = 70;
const TEAM = [
  { assetId: pictures.ganTeam3.id },
  { assetId: pictures.ganTeam2.id },
  { assetId: pictures.ganTeam1.id },
  { assetId: pictures.ganTeam4.id },
];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_gan_hero',
    name: 'פתיחה',
    content: {
      caption: [text('סיכום שנה · 2026'), text('מוצג להורים, לשותפים ולעירייה · 14 בדצמבר 2026')],
      title: text('שנה בגן', 'היוצרים'),
      subtitle: text('מה בנינו השנה, ומה נבנה ב-2027'),
    },
  },
  {
    layout: 'l_gan_section',
    name: 'השנה שהייתה',
    content: {
      number: text('01'),
      caption: text('חלק ראשון מתוך שניים'),
      title: text('השנה שהייתה'),
      subtitle: text('כמה ילדים הגיעו, מה הם בנו, ומה למדנו מהם בדרך.'),
    },
  },
  {
    layout: 'l_gan_big_number',
    name: 'השנה במספרים',
    content: {
      caption: [
        text('השנה במספרים'),
        text('סדנאות לאורך השנה'),
        text('מהילדים חזרו לסדנה נוספת'),
        text('מתנדבים, רובם הורים וסבים'),
      ],
      title: text('שנה של ידיים עסוקות'),
      number: [text('1,240'), text('86'), text('72%'), text('34')],
      subtitle: text('ילדים ובני נוער יצרו איתנו ב-2026'),
      body: text('כמעט פי שניים מ-2025. רובם גרים בשכונה, ואחד מכל ארבעה הביא איתו חבר או אחות.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_gan_cards',
    name: 'המסלולים',
    content: {
      caption: [
        text('המסלולים'),
        text('גילאי 6-9 · ימי ראשון'),
        text('גילאי 9-13 · ימי שלישי'),
        text('גילאי 12-16 · ימי חמישי'),
      ],
      title: text('שלושה מסלולים, גן אחד'),
      subtitle: [text('נייר וקרטון'), text('מדע בידיים'), text('Maker Space')],
      body: [
        text('חותכים, מקפלים ובונים ערים שלמות מקרטון.'),
        text('ניסויים קטנים בחשמל, במים ובאור, ושאלה אחת גדולה.'),
        text('מדפסת 3D, עץ ואלקטרוניקה. כל קבוצה בונה מוצר אחד.'),
        text('מי שסיים מסלול חוזר אליו כעוזר מדריך.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_gan_chart',
    name: 'משתתפים לפי חודש',
    content: {
      caption: [text('משתתפים לפי חודש'), text('מקור: רישום הנוכחות של הגן, 2026.')],
      title: text('בקיץ הגן מתמלא'),
      number: [text('214'), text('+38%')],
      body: [text('משתתפים ביולי, חודש השיא של השנה.'), text('בסדנאות הפתוחות, לעומת 2025.')],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'משתתפים בחודש, לפי סוג הסדנה',
      data: {
        categories: ['ינואר', 'מרץ', 'מאי', 'יולי', 'ספטמבר', 'נובמבר'],
        series: [
          { name: 'סדנאות קבועות', values: REGULAR },
          { name: 'סדנאות פתוחות', values: OPEN },
        ],
      },
    },
  },
  {
    layout: 'l_gan_table',
    name: 'תוכנית הסדנאות',
    content: {
      caption: [
        text('תוכנית הסדנאות'),
        text('שביעות הרצון נמדדה בשאלון להורים בסוף כל מחזור, בסולם של 1 עד 5.'),
      ],
      title: text('שבע סדנאות, שבוע אחד'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['סדנה', 'גילאים', 'יום', 'משתתפים', 'שביעות רצון'],
        ['עיר מקרטון', '6-9', 'ראשון', '212', '4.8'],
        ['תיאטרון צלליות', '6-9', 'שני', '148', '4.6'],
        ['מעבדת מים ואור', '9-13', 'שלישי', '196', '4.7'],
        ['מעגלים מנייר', '9-13', 'רביעי', '164', '4.9'],
        ['Maker Space לנוער', '12-16', 'חמישי', '238', '4.8'],
        ['נגרייה קטנה', '12-16', 'חמישי', '126', '4.5'],
        ['סדנה פתוחה למשפחות', 'כל הגילאים', 'שישי', '156', '4.7'],
      ],
    },
  },
  {
    layout: 'l_gan_text_image',
    name: 'הסדנה מבפנים',
    content: {
      caption: text('הסדנה מבפנים'),
      title: text('שולחן אחד, עשרים רעיונות'),
      image: { assetId: pictures.ganTable2.id },
      subtitle: [text('חומרים פשוטים'), text('קבוצות קטנות'), text('בלי ציונים')],
      body: [
        text('קרטון, נייר, דבק וצבע. מה שיש בכל בית.'),
        text('שמונה ילדים ומדריכה אחת, כדי שכל אחד יקבל תשומת לב.'),
        text('בסוף המפגש מציגים מה נבנה, וגם מה התפרק בדרך.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_gan_comparison',
    name: 'חוג או גן',
    content: {
      caption: [text('חוג או גן'), text('חוג רגיל'), text('גן היוצרים')],
      title: text('מה שונה אצלנו'),
      subtitle: [text('כולם בונים אותו דבר'), text('כל ילד בונה רעיון משלו')],
      body: [
        bullets(
          'המדריך מדגים, והילדים חוזרים אחריו',
          'התוצר נקבע מראש',
          'מפגש של 45 דקות, בלי זמן לטעות',
        ),
        bullets(
          'המדריכה שואלת, והילדים מחפשים דרך',
          'התוצר מפתיע גם אותנו',
          'מפגש של שעתיים, ו-Demo Day בסוף המחזור',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_gan_process',
    name: 'מפגש בגן',
    content: {
      caption: [
        text('מבנה המפגש'),
        text('מעגל, ושאלת היום.'),
        text('כל ילד משרטט רעיון אחד.'),
        text('בונים בזוגות, ממה שיש על השולחן.'),
        text('בודקים מה עובד ומתקנים.'),
        text('כל זוג מציג, והקבוצה מוחאת כפיים.'),
      ],
      title: text('כך נראה מפגש בגן'),
      subtitle: [text('מעגל פתיחה'), text('סקיצה'), text('בנייה'), text('ניסוי'), text('מציגים')],
      number: [text('10 דק׳'), text('15 דק׳'), text('50 דק׳'), text('25 דק׳'), text('20 דק׳')],
      body: text('בסך הכול שעתיים, וברוב הזמן הידיים עובדות, לא האוזניים.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_gan_section',
    name: 'השנה שתבוא',
    content: {
      number: text('02'),
      caption: text('חלק שני מתוך שניים'),
      title: text('השנה שתבוא'),
      subtitle: text('גן שני, מסלול חדש לנוער, וקיץ שלם של בנייה.'),
    },
  },
  {
    layout: 'l_gan_timeline',
    name: 'תוכנית 2027',
    content: {
      caption: [text('תוכנית 2027'), text('התוכנית כפופה לאישור תקציב העירייה בינואר.')],
      title: text('ארבע תחנות ב-2027'),
      number: [text('חורף'), text('אביב'), text('קיץ'), text('סתיו')],
      subtitle: [
        text('גן שני נפתח'),
        text('מסלול לנוער'),
        text('קיץ של בנייה'),
        text('יריד היוצרים'),
      ],
      body: [
        text('סדנה חדשה במרכז הקהילתי של שכונת הפארק.'),
        text('מסלול ערב לגילאי 14 עד 17, עם פרויקט גמר.'),
        text('שישה שבועות של קייטנה, 60 ילדים בכל שבוע.'),
        text('יום פתוח שבו הילדים מלמדים את ההורים.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_gan_full_image',
    name: 'על השולחן',
    content: {
      image: { assetId: pictures.ganScene.id },
      caption: text('על השולחן'),
      title: text('כל מה שצריך', 'כבר על השולחן'),
      body: text('נייר, קרטון, צבע וזוג ידיים. את השאר הילדים ממציאים בעצמם.'),
    },
  },
  {
    layout: 'l_gan_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'בבית הוא מפרק כל צעצוע. בגן גילינו שהוא פשוט רוצה להבין איך דברים עובדים, ועכשיו הוא גם מרכיב אותם בחזרה.',
      ),
      attribution: text('רונית אבידן'),
      caption: text('אמא של יואב, בן 9 · במסלול מדע בידיים מאז פברואר 2026'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_gan_team',
    name: 'הצוות',
    content: {
      caption: [
        text('הצוות'),
        text('מנהלת הגן ומייסדת'),
        text('מדריך מדע'),
        text('מדריכת יצירה'),
        text('רכז מתנדבים'),
      ],
      title: text('האנשים שמאחורי השולחן'),
      image: TEAM,
      subtitle: [text('נועה שגב'), text('אורי לביא'), text('תמר חדד'), text('יונתן פרץ')],
      body: [
        text('הקימה את הגן ב-2022, אחרי עשרים שנה כמורה לאמנות.'),
        text('מהנדס חשמל שמלמד ילדים לבנות מעגלים מנייר.'),
        text('מעצבת תפאורה, אחראית לכל מה שעשוי מקרטון.'),
        text('סטודנט לחינוך, מחבר בין הורים, סבים וסדנאות.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_gan_closing',
    name: 'סיום',
    content: {
      caption: [
        text('מה עכשיו'),
        text('גן היוצרים · המרכז הקהילתי רמות · shalom@gan-hayotzrim.example'),
      ],
      title: text('בואו לבנות', 'איתנו'),
      body: [
        text('ההרשמה למחזור החורף נפתחת ב-1 בינואר'),
        text('מחפשים עשרה מתנדבים נוספים לימי שלישי'),
        text('Demo Day הבא: 26 בפברואר, והכניסה חופשית'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_gan_hero',
    name: 'Opening',
    content: {
      caption: [
        text('2026 in review'),
        text('For parents, partners and the city · 14 December 2026'),
      ],
      title: text('A year in', 'the Garden'),
      subtitle: text('What we built this year, and what comes in 2027'),
    },
  },
  {
    layout: 'l_gan_section',
    name: 'This year',
    content: {
      number: text('01'),
      caption: text('Part one of two'),
      title: text('This year'),
      subtitle: text('How many children came, what they built, and what they taught us.'),
    },
  },
  {
    layout: 'l_gan_big_number',
    name: 'The year in numbers',
    content: {
      caption: [
        text('The year in numbers'),
        text('workshops through the year'),
        text('of the children came back for more'),
        text('volunteers, mostly parents'),
      ],
      title: text('A year of busy hands'),
      number: [text('1,240'), text('86'), text('72%'), text('34')],
      subtitle: text('children made things with us'),
      body: text(
        'Almost twice as many as in 2025. Most live in the neighbourhood, and one in four brought a friend or a sister.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_gan_cards',
    name: 'The tracks',
    content: {
      caption: [
        text('The tracks'),
        text('Ages 6-9 · Sundays'),
        text('Ages 9-13 · Tuesdays'),
        text('Ages 12-16 · Thursdays'),
      ],
      title: text('Three tracks, one Garden'),
      subtitle: [text('Paper and card'), text('Hands-on science'), text('Maker Space')],
      body: [
        text('Cutting, folding and building whole cities from cardboard.'),
        text('Small experiments with electricity, water and light.'),
        text('A 3D printer, wood and simple electronics.'),
        text('Whoever finishes a track comes back to it as a guide’s helper.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_gan_chart',
    name: 'Participants by month',
    content: {
      caption: [
        text('Participants by month'),
        text('Source: the Garden’s attendance register, 2026.'),
      ],
      title: text('In summer the Garden fills up'),
      number: [text('214'), text('+38%')],
      body: [
        text('participants in July, the peak of the year.'),
        text('in the open workshops, on 2025.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Participants a month, by kind of workshop',
      data: {
        categories: ['January', 'March', 'May', 'July', 'September', 'November'],
        series: [
          { name: 'Regular workshops', values: REGULAR },
          { name: 'Open workshops', values: OPEN },
        ],
      },
    },
  },
  {
    layout: 'l_gan_table',
    name: 'The programme',
    content: {
      caption: [
        text('The programme'),
        text('Satisfaction: a parents’ survey at the end of each cycle, on a scale of 1 to 5.'),
      ],
      title: text('Seven workshops, one week'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['Workshop', 'Ages', 'Day', 'Participants', 'Satisfaction'],
        ['Cardboard city', '6-9', 'Sunday', '212', '4.8'],
        ['Shadow theatre', '6-9', 'Monday', '148', '4.6'],
        ['Water and light lab', '9-13', 'Tuesday', '196', '4.7'],
        ['Paper circuits', '9-13', 'Wednesday', '164', '4.9'],
        ['Maker Space for teens', '12-16', 'Thursday', '238', '4.8'],
        ['Small woodshop', '12-16', 'Thursday', '126', '4.5'],
        ['Open family workshop', 'All ages', 'Friday', '156', '4.7'],
      ],
    },
  },
  {
    layout: 'l_gan_text_image',
    name: 'Inside the workshop',
    content: {
      caption: text('Inside the workshop'),
      title: text('One table, twenty ideas'),
      image: { assetId: pictures.ganTable2.id },
      subtitle: [text('Simple materials'), text('Small groups'), text('No grades')],
      body: [
        text('Cardboard, paper, glue and paint. What every home has.'),
        text('Eight children and one guide, so everyone gets attention.'),
        text('At the end we show what was built, and what fell apart on the way.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_gan_comparison',
    name: 'A class or a garden',
    content: {
      caption: [text('Class or garden'), text('An ordinary class'), text('The Makers’ Garden')],
      title: text('What is different here'),
      subtitle: [text('Everyone builds the same'), text('Each child builds an idea')],
      body: [
        bullets(
          'The teacher shows, children repeat',
          'A result set in advance',
          '45 minutes, no room for mistakes',
        ),
        bullets(
          'The guide asks, children find a way',
          'A result that surprises us',
          'Two hours, then a Demo Day',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_gan_process',
    name: 'A session',
    content: {
      caption: [
        text('A session'),
        text('A circle and a question.'),
        text('One idea, on paper.'),
        text('In pairs, at the table.'),
        text('Try it, then fix it.'),
        text('Each pair presents.'),
      ],
      title: text('What a session looks like'),
      subtitle: [text('Opening'), text('Sketch'), text('Build'), text('Test'), text('Show')],
      number: [text('10 min'), text('15 min'), text('50 min'), text('25 min'), text('20 min')],
      body: text('Two hours, and the hands are busy for most of them.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_gan_section',
    name: 'Next year',
    content: {
      number: text('02'),
      caption: text('Part two of two'),
      title: text('Next year'),
      subtitle: text('A second Garden, a new track for teens, and a whole summer of building.'),
    },
  },
  {
    layout: 'l_gan_timeline',
    name: 'Plan for 2027',
    content: {
      caption: [text('Plan for 2027'), text('Subject to the city’s budget approval in January.')],
      title: text('Four stops in 2027'),
      number: [text('Winter'), text('Spring'), text('Summer'), text('Autumn')],
      subtitle: [
        text('A second Garden'),
        text('A teen track'),
        text('Summer of building'),
        text('The Makers’ Fair'),
      ],
      body: [
        text('A workshop in the Park quarter.'),
        text('Evenings for ages 14-17, with a final project.'),
        text('Six weeks of day camp.'),
        text('Children teach their parents.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_gan_full_image',
    name: 'On the table',
    content: {
      image: { assetId: pictures.ganScene.id },
      caption: text('On the table'),
      title: text('All we need is', 'already on the table'),
      body: text('Paper, cardboard, paint and a pair of hands. The children invent the rest.'),
    },
  },
  {
    layout: 'l_gan_quote',
    name: 'Quote',
    content: {
      quote: text(
        'At home he takes every toy apart. At the Garden we found out he just wants to know how things work, and now he puts them back together.',
      ),
      attribution: text('Ronit Avidan'),
      caption: text('Mother of Yoav, 9 · in Hands-on science since February 2026'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_gan_team',
    name: 'The team',
    content: {
      caption: [
        text('The team'),
        text('Director and founder'),
        text('Science guide'),
        text('Craft guide'),
        text('Volunteer coordinator'),
      ],
      title: text('The people behind the table'),
      image: TEAM,
      subtitle: [text('Noa Segev'), text('Uri Lavie'), text('Tamar Hadad'), text('Yonatan Peretz')],
      body: [
        text('Founded the Garden in 2022, after years of teaching art.'),
        text('An engineer who builds circuits out of paper.'),
        text('A set designer who loves cardboard.'),
        text('A student who links parents and workshops.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_gan_closing',
    name: 'Closing',
    content: {
      caption: [text('What now'), text('Ramot Community Centre · shalom@gan-hayotzrim.example')],
      title: text('Come build', 'with us'),
      body: [
        text('Registration for the winter cycle opens on 1 January'),
        text('We are looking for ten more volunteers for Tuesdays'),
        text('The next Demo Day: 26 February, and entry is free'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const ganSamples = { he: sampleHe, en: sampleEn };

/** The Gan template: the theme, sixteen layouts for both directions, and its sample deck. */
export function ganTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(ganTheme),
    description:
      'Playful: a warm white ground, bright round shapes, stickers and doodles, for schools, workshops and community projects.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.ganScene,
      pictures.ganTable2,
      pictures.ganTeam1,
      pictures.ganTeam2,
      pictures.ganTeam3,
      pictures.ganTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
