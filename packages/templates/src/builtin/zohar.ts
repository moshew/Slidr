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
  solid,
  SURFACE,
  text,
  token,
  type SampleSlide,
} from './kit';
import { pictures } from './pictures.generated';

/**
 * Zohar: the launch template. A ground of vivid gradients, deep violet through pink to a warm
 * orange; content on panels of violet glass; suns, rings and glows as the decoration. Text is
 * light everywhere, so every frame sits on glass or on the violet end of its ground.
 *
 * The three strong colours are light enough to carry the dark ground colour as text (a table's
 * header row is filled with `primary` and written in `bg`), which is why the ground's own
 * gradient runs from `bg` to `surface` and the strong colours come in as glows.
 */
export const zoharTheme: Theme = {
  id: 'zohar',
  name: 'Zohar',
  colors: {
    bg: '#1c0a52',
    surface: '#3f1ab0',
    text: '#ffffff',
    muted: '#e0d5ff',
    primary: '#ff5fa2',
    secondary: '#9d7bff',
    accent: '#ffa24a',
    chart: ['#ff5fa2', '#ffa24a', '#9d7bff', '#ffd76a', '#ff8f7a', '#e0d5ff'],
  },
  fonts: {
    heading: { he: 'Heebo', latin: 'Poppins' },
    body: { he: 'Assistant', latin: 'Manrope' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 116,
      weight: 700,
      lineHeight: 1.06,
      color: { token: 'text' },
    },
    title: { font: 'heading', size: 64, weight: 700, lineHeight: 1.15, color: { token: 'text' } },
    heading: { font: 'heading', size: 40, weight: 600, lineHeight: 1.2, color: { token: 'text' } },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 600, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 30,
  shadow: { x: 0, y: 24, blur: 60, color: { value: '#1c0a52', alpha: 0.5 } },
  // A slide without a layout keeps the plain ground: text in any of the theme's colours reads
  // on it. The gradient of the two ground colours is the variant, and every layout carries its
  // own. The one that ran on to pink and orange is not offered: the white text of a slide is
  // lost on its lower third (see `SURFACE` in the kit).
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    {
      fill: {
        kind: 'linear',
        angle: 180,
        stops: [
          { color: { token: 'bg' }, at: 0 },
          { color: { token: 'surface' }, at: 1 },
        ],
      },
    },
    SURFACE,
  ],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

/** The literal colours of the drawings, and the tokens they stand for. */
const PAINT = {
  '#ffffff': token('text'),
  '#ff5fa2': token('primary'),
  '#ffa24a': token('accent'),
  '#1c0a52': token('bg'),
};

const linear = (angle: number, ...stops: [color: Color, at: number][]): Fill => ({
  kind: 'linear',
  angle,
  stops: stops.map(([color, stop]) => ({ color, at: stop })),
});

/**
 * The ground of a content slide: violet, deep at the top of the start side, with an aura of
 * pink in the far upper corner, where only the end of a long title can reach. Both are the
 * model's own gradients, so the mirror turns them; the rest of the colour comes from the glows.
 */
const ground = (): Background => ({
  fill: linear(225, [token('bg'), 0], [token('surface'), 0.8]),
  overlay: {
    kind: 'radial',
    center: { x: 0, y: 0 },
    stops: [
      { color: token('primary', 0.5), at: 0 },
      { color: token('primary', 0), at: 0.45 },
    ],
  },
});

/**
 * The ground of a poster slide: the whole spectrum, from the deep violet to the orange. Light
 * text reads on its first half only, so `angle` decides where the text of the slide can stand.
 */
const spectrum = (angle: number): Background => ({
  fill: linear(
    angle,
    [token('bg'), 0],
    [token('surface'), 0.46],
    [token('primary'), 0.82],
    [token('accent'), 1],
  ),
});

const ELLIPSE = { kind: 'preset', preset: 'ellipse' } as const;

/** A disc; with `halo`, it glows in that colour. */
const disc = (id: string, frame: Frame, fill: Fill, halo?: Color, blur = 24): Element =>
  rect(id, frame, fill, {
    geometry: ELLIPSE,
    ...(halo ? { effects: { shadow: { x: 0, y: 0, blur, color: halo } } } : {}),
  });

/** A frame around a point given from the end side (the left of a right-to-left slide). */
const around = (x: number, y: number, r: number): Frame => atEnd(x - r, y - r, 2 * r, 2 * r);

/** A soft glow: colour that fades to nothing before the edge of its box. */
const glow = (id: string, frame: Frame, color: 'primary' | 'accent', strength: number): Element =>
  rect(
    id,
    frame,
    {
      kind: 'radial',
      stops: [
        { color: token(color, strength), at: 0 },
        { color: token(color, 0), at: 0.7 },
      ],
    },
    { geometry: ELLIPSE },
  );

/** The sun of the poster slides: white where the light falls, pink at its far side. */
const sun = (id: string, frame: Frame): Element =>
  disc(
    id,
    frame,
    linear(200, [token('text'), 0], [token('accent'), 0.45], [token('primary'), 1]),
    token('accent', 0.7),
    90,
  );

const WARM = linear(200, [token('accent'), 0], [token('primary'), 1]);

/** A small sun: the bullet of the template, and the seat of a step's number. */
const orb = (id: string, frame: Frame): Element => disc(id, frame, WARM, token('primary', 0.6));

/** The short bar of pink and orange that opens a block of text. */
const bar = (id: string, frame: Frame): Element =>
  rect(id, frame, linear(270, [token('primary'), 0], [token('accent'), 1]), {
    effects: { radius: frame.h / 2 },
  });

/** Rings around a point (from the end side), fainter as they widen: the orbit of a sun. */
function rings(id: string, x: number, y: number, radii: readonly number[]): Element {
  const r = Math.max(...radii) + 4;
  const circles = radii
    .map(
      (radius, i) =>
        `<circle cx="${r}" cy="${r}" r="${radius}" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="${[0.46, 0.3, 0.18][i] ?? 0.12}"/>`,
    )
    .join('');
  return drawing(
    id,
    around(x, y, r),
    `<svg viewBox="0 0 ${2 * r} ${2 * r}">${circles}</svg>`,
    PAINT,
  );
}

/**
 * A panel of glass: the surface colour, let through; a light edge; a shadow that falls outside
 * it only. `hot` is the panel a slide singles out.
 */
function glass(
  id: string,
  frame: Frame,
  rest: { alpha?: number; radius?: number; hot?: boolean } = {},
): Element {
  const { alpha = 0.5, radius = 30, hot = false } = rest;
  return rect(id, frame, solid(token('surface', alpha)), {
    stroke: hot
      ? { color: token('primary', 0.9), width: 2.5 }
      : { color: token('text', 0.22), width: 1.5 },
    effects: { radius, shadow: { x: 0, y: 24, blur: 60, spread: -14, color: token('bg', 0.5) } },
  });
}

/**
 * Rings that spread from the far lower corner of a panel, with a small sun on the middle one:
 * the orbit of the poster slides, seen in a corner. The drawing ends at the panel's edges.
 */
function ripples(id: string, panel: Frame, size: number): Element {
  const radii = [0.44, 0.7, 0.96].map((share) => Math.round(share * size));
  const circles = radii
    .map(
      (radius, i) =>
        `<circle cx="0" cy="${size}" r="${radius}" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="${[0.34, 0.22, 0.12][i]}"/>`,
    )
    .join('');
  const orbit = radii[1] ?? size;
  const planet = `<circle cx="${Math.round(orbit * 0.62)}" cy="${Math.round(size - orbit * 0.78)}" r="${Math.round(size * 0.04)}" fill="#ffa24a"/>`;
  return drawing(
    id,
    { x: panel.x, y: panel.y + panel.h - size, w: size, h: size },
    `<svg viewBox="0 0 ${size} ${size}">${circles}${planet}</svg>`,
    PAINT,
  );
}

const HAIR = solid(token('text', 0.18));

const MARK =
  '<svg viewBox="0 0 40 40"><circle cx="17" cy="23" r="13" fill="none" stroke="#ffffff" stroke-width="4"/><circle cx="30" cy="10" r="8" fill="#ffa24a"/></svg>';

/** The mark of the template: a ring and the sun that rises on it. A deck replaces it with its logo. */
const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** An arrow from what was to what is, drawn for a right-to-left slide: the mirror turns it. */
const ARROW =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#1c0a52" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';

/** The quotation mark of each direction. They are two marks, not one mark and its mirror. */
const QUOTE_RTL =
  '<svg viewBox="0 0 66 52"><path fill="#1c0a52" d="M66 0v22c0 18-9 28-26 30V42c8-2 12-7 12-16H40V0h26ZM26 0v22C26 40 17 50 0 52V42c8-2 12-7 12-16H0V0h26Z"/></svg>';
const QUOTE_LTR =
  '<svg viewBox="0 0 66 52"><path fill="#1c0a52" d="M0 52V30C0 12 9 2 26 0v10c-8 2-12 7-12 16h12v26H0Zm40 0V30C40 12 49 2 66 0v10c-8 2-12 7-12 16h12v26H40Z"/></svg>';

const quoteGlyph = (frame: Frame, markup: string) =>
  drawing('d_zohar_quote_glyph', frame, markup, PAINT);

/** The number of a step, written on its orb. Centred, so it stays there when the layout turns. */
const stepNumber = (id: string, frame: Frame, n: number) =>
  label(id, frame, String(n), 'body', {
    color: token('bg'),
    weight: 700,
    dir: 'auto',
    align: 'center',
    vAlign: 'middle',
  });

/** The line over a title and the title itself, as every content slide has them. */
const head = (width = 1728, lines = 1) => [
  place('p_kicker', 'caption', at(136, 80, Math.min(900, width - 40), 34), 'caption'),
  place('p_title', 'title', at(96, 122, width, 74 * lines), 'title'),
];

/**
 * What frames a content slide besides its head: the small sun before the line over the title,
 * and the foot, a hairline with the mark at the start, and at the end the deck's name with the
 * slide's number beyond it (SLD-04). The mark stands alone at its side, which leaves a logo of
 * any width room to replace it.
 */
function frameOf(
  name: string,
  width = 1728,
): { placeholders: Layout['placeholders']; decorations: Element[] } {
  return {
    placeholders: [
      place('p_footer', 'footer', at(96 + width - 900, 956, 828, 34), 'caption', { align: 'end' }),
    ],
    decorations: [
      orb(`d_zohar_${name}_spark`, at(96, 86, 22, 22)),
      rect(`d_zohar_${name}_rule`, at(96, 936, width, 1.5), HAIR),
      mark(`d_zohar_${name}_mark`, at(96, 952, 40, 40)),
      pageNumber(`d_zohar_${name}_number`, at(96 + width - 60, 956, 60, 34)),
    ],
  };
}

/** A line of glass with a small sun at its start, for one sentence: a takeaway, a next step. */
function pill(id: string, top: number, height: number, width = 1728): Element[] {
  return [
    glass(`${id}_pill`, at(96, top, width, height)),
    orb(`${id}_dot`, at(128, top + height / 2 - 11, 22, 22)),
  ];
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

const columns4 = [96, 540, 984, 1428];
const cards3 = [96, 688, 1280];
const steps5 = [96, 450, 804, 1158, 1512];
const rows3 = [300, 502, 704];
const lines3 = [420, 548, 676];
const stats3 = [236, 464, 692];
const chartStats = [236, 540];

function layouts(): Layout[] {
  return [
    {
      id: 'l_zohar_hero',
      name: 'Hero',
      archetype: 'hero',
      background: spectrum(262),
      placeholders: [
        place('p_kicker', 'caption', at(96, 300, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 346, 1040, 250), 'display'),
        place('p_subtitle', 'subtitle', at(96, 626, 1000, 100), 'heading'),
        place('p_meta', 'caption', at(96, 956, 900, 34), 'caption'),
      ],
      decorations: [
        // The sun stands where the ground is brightest; the text, at its violet end.
        glow('d_zohar_hero_halo', around(360, 540, 600), 'accent', 0.5),
        rings('d_zohar_hero_rings', 360, 540, [330, 430, 540]),
        sun('d_zohar_hero_sun', around(360, 540, 220)),
        orb('d_zohar_hero_moon', around(636, 211, 28)),
        disc('d_zohar_hero_star', around(742, 844, 12), solid(token('text'))),
        mark('d_zohar_hero_mark', at(96, 80, 56, 56)),
        bar('d_zohar_hero_bar', at(96, 268, 96, 6)),
      ],
    },
    {
      id: 'l_zohar_section',
      name: 'Section',
      archetype: 'section',
      background: spectrum(315),
      placeholders: [
        place('p_number', 'number', at(160, 212, 1012, 126), 'display'),
        place('p_kicker', 'caption', at(160, 168, 900, 34), 'caption'),
        place('p_title', 'title', at(160, 470, 1012, 250), 'display', { vAlign: 'bottom' }),
        place('p_subtitle', 'subtitle', at(160, 744, 1012, 150), 'heading'),
      ],
      decorations: [
        glow('d_zohar_section_halo', around(300, 250, 560), 'accent', 0.45),
        rings('d_zohar_section_rings', 300, 250, [300, 400, 520]),
        sun('d_zohar_section_sun', around(300, 250, 230)),
        orb('d_zohar_section_moon', around(560, 596, 26)),
        // All the text is on one sheet of glass: the ground under it runs to pink.
        glass('d_zohar_section_panel', at(96, 120, 1140, 840)),
        bar('d_zohar_section_bar', at(160, 362, 96, 6)),
      ],
    },
    {
      id: 'l_zohar_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      background: ground(),
      placeholders: [
        ...head(),
        place('p_number', 'number', at(136, 332, 1028, 126), 'display'),
        place('p_label', 'subtitle', at(136, 512, 1028, 100), 'heading'),
        place('p_body', 'body', at(136, 632, 1028, 172), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(136, top + 28, 500, 76), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', atEnd(136, top + 110, 500, 68), 'caption'),
        ]),
        ...frameOf('big_number').placeholders,
      ],
      decorations: [
        glow('d_zohar_big_number_glow1', at(360, 220, 1100, 700), 'primary', 0.7),
        glow('d_zohar_big_number_glow2', atEnd(-160, 240, 900, 680), 'accent', 0.6),
        glass('d_zohar_big_number_panel', at(96, 236, 1108, 664)),
        ripples('d_zohar_big_number_ripples', at(96, 236, 1108, 664), 190),
        bar('d_zohar_big_number_bar', at(136, 482, 96, 6)),
        ...stats3.map((top, i) =>
          glass(`d_zohar_big_number_stat${i + 1}`, atEnd(96, top, 580, 208)),
        ),
        ...frameOf('big_number').decorations,
      ],
    },
    {
      id: 'l_zohar_quote',
      name: 'Quote',
      archetype: 'quote',
      background: ground(),
      placeholders: [
        place('p_quote', 'quote', at(152, 226, 1128, 380), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(152, 660, 1128, 50), 'heading'),
        place('p_caption', 'caption', at(152, 718, 1128, 68), 'caption'),
        ...frameOf('quote').placeholders,
      ],
      decorations: [
        glow('d_zohar_quote_glow1', at(160, 210, 1200, 700), 'primary', 0.7),
        glow('d_zohar_quote_glow2', atEnd(-100, 200, 880, 700), 'accent', 0.6),
        rings('d_zohar_quote_rings', 340, 510, [230, 300]),
        sun('d_zohar_quote_sun', around(340, 510, 170)),
        quoteGlyph(atEnd(265, 451, 150, 118), QUOTE_RTL),
        glass('d_zohar_quote_panel', at(96, 170, 1240, 680)),
        bar('d_zohar_quote_bar', at(152, 632, 96, 6)),
        ...frameOf('quote').decorations.filter((d) => d.id !== 'd_zohar_quote_spark'),
      ],
    },
    {
      id: 'l_zohar_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      background: ground(),
      placeholders: [
        ...head(1040, 2),
        place('p_image', 'image', atEnd(96, 80, 600, 820)),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(196, top + 4, 908, 50), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(196, top + 58, 908, 130), 'body'),
        ]),
        ...frameOf('text_image', 1040).placeholders,
      ],
      decorations: [
        glow('d_zohar_text_image_glow1', atEnd(-160, 230, 800, 700), 'accent', 0.65),
        glow('d_zohar_text_image_glow2', at(120, 290, 1040, 630), 'primary', 0.7),
        // The picture is set in a slab of glass: a placeholder cannot round its own corners.
        glass('d_zohar_text_image_slab', atEnd(72, 56, 648, 868)),
        glass('d_zohar_text_image_panel', at(96, 286, 1040, 614)),
        ...rows3.flatMap((top, i) => [
          orb(`d_zohar_text_image_orb${i + 1}`, at(128, top + 6, 48, 48)),
          stepNumber(`d_zohar_text_image_n${i + 1}`, at(128, top + 6, 48, 48), i + 1),
        ]),
        ...rows3
          .slice(1)
          .map((top, i) =>
            rect(`d_zohar_text_image_rule${i + 1}`, at(128, top - 9, 976, 1.5), HAIR),
          ),
        ...frameOf('text_image', 1040).decorations,
      ],
    },
    {
      id: 'l_zohar_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      background: ground(),
      placeholders: [
        // The picture runs from edge to edge; the text has a band of its own under it, because
        // nothing of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 620)),
        place('p_kicker', 'caption', at(136, 706, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 750, 1060, 148), 'title'),
        place('p_body', 'body', atEnd(132, 728, 528, 172), 'body'),
      ],
      decorations: [
        // The pane of the text is lit from behind, like the screen of the stage above it.
        glow('d_zohar_full_image_glow', atEnd(-140, 640, 1000, 480), 'primary', 0.65),
        // The horizon: a line of light where the picture meets the ground.
        rect(
          'd_zohar_full_image_horizon',
          atEnd(0, 620, 1920, 8),
          linear(270, [token('primary'), 0], [token('accent'), 1]),
        ),
        orb('d_zohar_full_image_spark', at(96, 712, 22, 22)),
        glass('d_zohar_full_image_panel', atEnd(96, 704, 600, 220)),
        ripples('d_zohar_full_image_ripples', atEnd(96, 704, 600, 220), 120),
      ],
    },
    {
      id: 'l_zohar_cards',
      name: 'Cards',
      archetype: 'cards',
      background: ground(),
      placeholders: [
        ...head(),
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}`, 'subtitle', at(start + 40, 362, 464, 98), 'heading'),
          place(`p_card${i + 1}_body`, 'body', at(start + 40, 476, 464, 212), 'body'),
          place(`p_card${i + 1}_note`, 'caption', at(start + 40, 288, 464, 68), 'caption', {
            vAlign: 'bottom',
          }),
        ]),
        place('p_takeaway', 'body', at(176, 776, 1608, 84), 'body', { vAlign: 'middle' }),
        ...frameOf('cards').placeholders,
      ],
      decorations: [
        glow('d_zohar_cards_glow1', at(380, 210, 1100, 640), 'primary', 0.7),
        glow('d_zohar_cards_glow2', atEnd(-160, 280, 860, 640), 'accent', 0.6),
        ...cards3.flatMap((start, i) => [
          glass(`d_zohar_cards_card${i + 1}`, at(start, 236, 544, 490)),
          ripples(`d_zohar_cards_ripples${i + 1}`, at(start, 236, 544, 490), 170),
          bar(`d_zohar_cards_bar${i + 1}`, at(start + 40, 270, 64, 6)),
        ]),
        ...pill('d_zohar_cards', 752, 132),
        ...frameOf('cards').decorations,
      ],
    },
    {
      id: 'l_zohar_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      background: ground(),
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 236, 396, 80), 'title', {
            vAlign: 'bottom',
          }),
          place(`p_what${i + 1}`, 'subtitle', at(start + 28, 414, 340, 98), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start + 28, 520, 340, 238), 'caption'),
        ]),
        place('p_note', 'caption', at(96, 828, 1728, 68), 'caption'),
        ...frameOf('timeline').placeholders,
      ],
      decorations: [
        glow('d_zohar_timeline_glow1', at(240, 370, 1200, 540), 'primary', 0.7),
        glow('d_zohar_timeline_glow2', atEnd(-160, 370, 860, 520), 'accent', 0.6),
        // The track of the year: a line of light, and a white-hot point where each stop begins.
        bar('d_zohar_timeline_track', at(96, 338, 1728, 6)),
        ...columns4.flatMap((start, i) => [
          disc(
            `d_zohar_timeline_node${i + 1}`,
            at(start, 326, 30, 30),
            solid(token('text')),
            token('primary', 0.9),
          ),
          glass(`d_zohar_timeline_card${i + 1}`, at(start, 388, 396, 416)),
          ripples(`d_zohar_timeline_ripples${i + 1}`, at(start, 388, 396, 416), 150),
        ]),
        ...frameOf('timeline').decorations,
      ],
    },
    {
      id: 'l_zohar_process',
      name: 'Process',
      archetype: 'process',
      background: ground(),
      placeholders: [
        ...head(),
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start + 24, 330, 264, 98), 'heading'),
          place(`p_step${i + 1}_body`, 'caption', at(start + 24, 436, 264, 170), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start + 24, 634, 272, 76), 'title'),
        ]),
        place('p_summary', 'body', at(176, 776, 1608, 84), 'body', { vAlign: 'middle' }),
        ...frameOf('process').placeholders,
      ],
      decorations: [
        glow('d_zohar_process_glow1', at(400, 210, 1100, 600), 'primary', 0.7),
        glow('d_zohar_process_glow2', atEnd(-160, 240, 860, 600), 'accent', 0.6),
        // One line of light runs behind the five panes, and shows between them.
        bar('d_zohar_process_track', at(96, 286, 1728, 4)),
        ...steps5.flatMap((start, i) => [
          glass(`d_zohar_process_card${i + 1}`, at(start, 236, 312, 490)),
          orb(`d_zohar_process_orb${i + 1}`, at(start + 24, 260, 56, 56)),
          stepNumber(`d_zohar_process_n${i + 1}`, at(start + 24, 260, 56, 56), i + 1),
          rect(`d_zohar_process_rule${i + 1}`, at(start + 24, 620, 264, 1.5), HAIR),
        ]),
        ...pill('d_zohar_process', 752, 132),
        ...frameOf('process').decorations,
      ],
    },
    {
      id: 'l_zohar_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      background: ground(),
      placeholders: [
        ...head(),
        place('p_before_tag', 'caption', at(136, 268, 760, 34), 'caption'),
        place('p_before', 'subtitle', at(136, 310, 760, 98), 'heading'),
        place('p_before_body', 'body', at(136, 446, 760, 420), 'body'),
        place('p_after_tag', 'caption', atEnd(136, 268, 760, 34), 'caption'),
        place('p_after', 'subtitle', atEnd(136, 310, 760, 98), 'heading'),
        place('p_after_body', 'body', atEnd(136, 446, 760, 420), 'body'),
        ...frameOf('comparison').placeholders,
      ],
      decorations: [
        // What was stands on plain glass; what is, on glass that is lit from behind.
        glow('d_zohar_comparison_glow1', atEnd(-40, 220, 1100, 700), 'primary', 0.7),
        glow('d_zohar_comparison_glow2', atEnd(-200, 400, 760, 520), 'accent', 0.5),
        glass('d_zohar_comparison_before', at(96, 236, 840, 664)),
        glass('d_zohar_comparison_after', atEnd(96, 236, 840, 664), { hot: true }),
        ripples('d_zohar_comparison_ripples1', at(96, 236, 840, 664), 240),
        ripples('d_zohar_comparison_ripples2', atEnd(96, 236, 840, 664), 240),
        rect('d_zohar_comparison_rule1', at(136, 424, 760, 1.5), HAIR),
        bar('d_zohar_comparison_rule2', atEnd(136, 423, 760, 4)),
        orb('d_zohar_comparison_orb', at(924, 532, 72, 72)),
        drawing('d_zohar_comparison_arrow', at(942, 550, 36, 36), ARROW, PAINT),
        ...frameOf('comparison').decorations,
      ],
    },
    {
      id: 'l_zohar_chart',
      name: 'Chart',
      archetype: 'chart',
      background: ground(),
      placeholders: [
        ...head(),
        place('p_chart', 'chart', at(124, 260, 1092, 616)),
        ...chartStats.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(132, top + 14, 468, 126), 'display'),
          place(`p_stat${i + 1}_body`, 'body', atEnd(132, top + 144, 468, 130), 'body'),
        ]),
        place('p_source', 'caption', atEnd(96, 836, 540, 68), 'caption'),
        ...frameOf('chart').placeholders,
      ],
      decorations: [
        glow('d_zohar_chart_glow1', atEnd(-180, 200, 900, 700), 'accent', 0.6),
        glow('d_zohar_chart_glow2', at(-60, 380, 1000, 540), 'primary', 0.55),
        glass('d_zohar_chart_panel', at(96, 236, 1148, 664)),
        ...chartStats.map((top, i) =>
          glass(`d_zohar_chart_stat${i + 1}`, atEnd(96, top, 540, 284)),
        ),
        ...frameOf('chart').decorations,
      ],
    },
    {
      id: 'l_zohar_table',
      name: 'Table',
      archetype: 'table',
      background: ground(),
      placeholders: [
        ...head(),
        place('p_table', 'table', at(124, 226, 1672, 612)),
        place('p_note', 'caption', at(96, 866, 1728, 68), 'caption'),
        ...frameOf('table').placeholders,
      ],
      decorations: [
        glow('d_zohar_table_glow1', atEnd(-100, 280, 1100, 620), 'primary', 0.65),
        glow('d_zohar_table_glow2', at(-160, 220, 860, 600), 'accent', 0.5),
        glass('d_zohar_table_panel', at(96, 206, 1728, 652)),
        ...frameOf('table').decorations,
      ],
    },
    {
      id: 'l_zohar_team',
      name: 'Team',
      archetype: 'team',
      background: ground(),
      placeholders: [
        ...head(),
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start + 18, 254, 360, 340)),
          place(`p_person${i + 1}`, 'subtitle', at(start + 28, 612, 340, 50), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start + 28, 664, 340, 68), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start + 28, 740, 340, 136), 'caption'),
        ]),
        ...frameOf('team').placeholders,
      ],
      decorations: [
        glow('d_zohar_team_glow1', at(240, 260, 1200, 660), 'primary', 0.7),
        glow('d_zohar_team_glow2', atEnd(-160, 280, 860, 640), 'accent', 0.6),
        ...columns4.map((start, i) => glass(`d_zohar_team_card${i + 1}`, at(start, 236, 396, 664))),
        ...frameOf('team').decorations,
      ],
    },
    {
      id: 'l_zohar_closing',
      name: 'Closing',
      archetype: 'closing',
      background: spectrum(262),
      placeholders: [
        place('p_kicker', 'caption', at(136, 80, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 128, 1100, 250), 'display'),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(176, top + 14, 1000, 84), 'body', {
            vAlign: 'middle',
          }),
        ),
        place('p_contact', 'caption', at(96, 956, 900, 34), 'caption'),
      ],
      decorations: [
        // The sun of the opening slide, setting: half of it is under the edge.
        glow('d_zohar_closing_halo', around(300, 1040, 640), 'accent', 0.5),
        rings('d_zohar_closing_rings', 300, 1080, [520, 640, 780]),
        sun('d_zohar_closing_sun', around(300, 1080, 420)),
        orb('d_zohar_closing_moon', around(560, 440, 26)),
        orb('d_zohar_closing_spark', at(96, 86, 22, 22)),
        ...lines3.flatMap((top, i) => pill(`d_zohar_closing_line${i + 1}`, top, 112, 1100)),
        mark('d_zohar_closing_mark', at(96, 836, 56, 56)),
      ],
    },
  ];
}

/**
 * The layouts the mirror gets wrong for a left-to-right deck. Only the quote: its mark is a
 * glyph of the direction, and a mirrored closing mark is not an opening one. The grounds are
 * the model's own gradients, which the mirror turns.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  const quote = drawn.find((layout) => layout.id === 'l_zohar_quote');
  if (!quote) return [];
  const mirrored = mirrorLayout(quote);
  return [
    {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) =>
        decoration.id === 'd_zohar_quote_glyph'
          ? quoteGlyph(decoration.frame, QUOTE_LTR)
          : decoration,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: the launch of an invented live-streaming studio, slide by slide

const FOOTER = text('HILA 3 · LAUNCH 2027');
const QUARTERS = ['Q4 2025', 'Q1 2026', 'Q2 2026', 'Q3 2026', 'Q4 2026', 'Q1 2027'];
const LIVE = [3.1, 4.2, 5.6, 7.4, 9.9, 12.9];
const RECORDED = [5.2, 5.6, 6.1, 6.6, 7.2, 7.9];
const TABLE_COLS = [652, 340, 340, 340];
const TABLE_ROW = 66;
const TEAM = [
  { assetId: pictures.zoharTeam1.id },
  { assetId: pictures.zoharTeam2.id },
  { assetId: pictures.zoharTeam3.id },
  { assetId: pictures.zoharTeam4.id },
];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_zohar_hero',
    name: 'פתיחה',
    content: {
      caption: [text('LAUNCH EVENT · 2027'), text('אירוע ההשקה · נמל תל אביב · 9 במרץ 2027')],
      title: text('Hila 3', 'עולה לאוויר'),
      subtitle: text('אולפן שידור חי שלם, בתוך הדפדפן'),
    },
  },
  {
    layout: 'l_zohar_section',
    name: 'מה חדש',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('מה חדש'),
      subtitle: text('שלושה דברים שביקשתם, ואחד שלא ציפיתם לו.'),
    },
  },
  {
    layout: 'l_zohar_big_number',
    name: 'השהיה',
    content: {
      caption: [
        text('LATENCY'),
        text('איכות שידור מלאה, גם ברשת סלולרית'),
        text('צופים בו-זמנית בשידור אחד'),
        text('שפות בכתוביות חיות'),
      ],
      title: text('כמעט בלי השהיה'),
      number: [text('0.4'), text('4K'), text('250K'), text('38')],
      subtitle: text('שניות, מהמצלמה ועד מסך הצופה'),
      body: text(
        'ב-Hila 2 ההשהיה עמדה על 2.8 שניות. המנוע החדש מקודד את הווידאו בקצה הרשת, קרוב לצופה, ולכן שיחה עם הקהל מרגישה כמו שיחה.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_cards',
    name: 'שלושה כלים',
    content: {
      caption: [
        text('WHAT’S NEW'),
        text('STUDIO · אולפן בענן'),
        text('STAGE · במה משותפת'),
        text('CLIPS · קטעים אוטומטיים'),
      ],
      title: text('שלושה כלים חדשים, מסך אחד'),
      subtitle: [text('בלי להתקין כלום'), text('עד 12 אורחים'), text('קליפ מוכן בדקה')],
      body: [
        text('מיקסר, גרפיקה וכתוביות רצים בדפדפן. פותחים קישור ומתחילים לשדר, מכל מחשב.'),
        text('כל אורח מצטרף מהטלפון או מהמחשב, עם ערוץ שמע נפרד וחדר המתנה לפני השידור.'),
        text('המערכת מזהה את הרגעים החזקים וחותכת מהם קליפים אנכיים עם כתוביות, לרשתות.'),
        text('והרביעי: כתוביות חיות ב-38 שפות, כלולות בכל תוכנית בתשלום.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_text_image',
    name: 'הבמה',
    content: {
      caption: text('THE STAGE'),
      title: text('במה אחת, קהל בכל מקום'),
      image: { assetId: pictures.zoharScene.id },
      subtitle: [text('הקהל חלק מהשידור'), text('תאורה שמגיבה לתוכן'), text('שידור אחד, 38 שפות')],
      body: [
        text('שאלות, הצבעות ותגובות עולות למסך בזמן אמת, בלי מפיק נוסף.'),
        text('צבעי הבמה והגרפיקה מסתנכרנים אוטומטית עם מה שקורה בשידור.'),
        text('כל צופה בוחר שפה לכתוביות, והתרגום מופיע באותה שנייה.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_chart',
    name: 'צמיחה',
    content: {
      caption: [text('GROWTH'), text('מקור: נתוני הפלטפורמה, מיליוני שעות צפייה ברבעון.')],
      title: text('שעות הצפייה הוכפלו בתוך שנה'),
      number: [text('+112%'), text('62%')],
      body: [text('שעות צפייה ברבעון, לעומת Q1 2026.'), text('מהצפייה כבר מגיעה משידורים חיים.')],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'שעות צפייה לפי רבעון, מיליונים',
      data: {
        categories: QUARTERS,
        series: [
          { name: 'שידור חי', values: LIVE },
          { name: 'הקלטות', values: RECORDED },
        ],
      },
    },
  },
  {
    layout: 'l_zohar_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('BEFORE AND AFTER'), text('עד היום · Hila 2'), text('מהיום · Hila 3')],
      title: text('מה משתנה ביום ההשקה'),
      subtitle: [text('אולפן שמותקן על המחשב'), text('אולפן בענן, בכל מכשיר')],
      body: [
        bullets(
          'השהיה של 2.8 שניות',
          'עד 4 אורחים בשידור',
          'כתוביות רק אחרי השידור',
          'קליפים בעריכה ידנית',
        ),
        bullets(
          'השהיה של 0.4 שניות',
          'עד 12 אורחים, כל אחד בערוץ שמע משלו',
          'כתוביות חיות ב-38 שפות',
          'קליפים אוטומטיים, דקה אחרי הרגע עצמו',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_table',
    name: 'תוכניות',
    content: {
      caption: [
        text('PLANS'),
        text('המחירים בשקלים לחודש, בחיוב שנתי. אפשר לעבור בין התוכניות בכל רגע.'),
      ],
      title: text('שלוש תוכניות, בלי אותיות קטנות'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['מה כלול', 'Solo', 'Creator', 'Studio'],
        ['מחיר לחודש', '₪0', '₪59', '₪189'],
        ['אורחים בשידור', '2', '6', '12'],
        ['איכות שידור', '1080p', '4K', '4K HDR'],
        ['כתוביות חיות', '—', '12 שפות', '38 שפות'],
        ['קליפים אוטומטיים', '3 בחודש', '40 בחודש', 'ללא הגבלה'],
        ['אחסון הקלטות', '10 שעות', '200 שעות', '2,000 שעות'],
        ['במות במקביל', '1', '2', '8'],
        ['תמיכה', 'מרכז עזרה', 'צ׳אט', 'מנהל לקוח אישי'],
      ],
    },
  },
  {
    layout: 'l_zohar_process',
    name: 'עולים לאוויר',
    content: {
      caption: [
        text('GO LIVE'),
        text('בוחרים שם לשידור, תמונת שער ושעת התחלה.'),
        text('שולחים קישור אחד בוואטסאפ, בלי הרשמה ובלי התקנה.'),
        text('המערכת בודקת מצלמה ומיקרופון לכל אורח.'),
        text('לחיצה אחת, והקהל כבר רואה ושומע אתכם.'),
        text('הרגעים החזקים נחתכים ונשלחים אליכם לטלפון.'),
      ],
      title: text('מרעיון לשידור חי בחמישה צעדים'),
      subtitle: [
        text('פותחים במה'),
        text('מזמינים אורחים'),
        text('בודקים סאונד'),
        text('עולים לאוויר'),
        text('משתפים קליפים'),
      ],
      number: [text('1 דק׳'), text('2 דק׳'), text('30 שנ׳'), text('0.4 שנ׳'), text('1 דק׳')],
      body: text('פחות מחמש דקות מהרגע שפתחתם את הדפדפן ועד שהקהל רואה אתכם.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_section',
    name: 'מה הלאה',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('מה הלאה'),
      subtitle: text('מפת הדרכים ל-2027, והאנשים שבונים אותה.'),
    },
  },
  {
    layout: 'l_zohar_timeline',
    name: 'מפת דרכים',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text('התאריכים הם יעדים. עדכונים שוטפים מתפרסמים ב-hila.example/roadmap.'),
      ],
      title: text('ארבע תחנות עד סוף השנה'),
      number: [text('מרץ'), text('יוני'), text('ספט׳'), text('דצמ׳')],
      subtitle: [
        text('Hila 3 לכולם'),
        text('אפליקציה לנייד'),
        text('חנות תוספים'),
        text('שידור ב-8K'),
      ],
      body: [
        text('כל המשתמשים עוברים למנוע החדש, בלי לשנות דבר בהגדרות ובלי הפסקה בשידור.'),
        text('ניהול במה שלמה מהטלפון, כולל מיקסר, מעבר בין מצלמות ואישור אורחים.'),
        text('גרפיקה, אפקטים ומשחקים לקהל, ממפתחים עצמאיים שמקבלים 80% מההכנסה.'),
        text('למנויי Studio, עם אותה השהיה של 0.4 שניות ובלי ציוד נוסף.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_full_image',
    name: 'ערב ההשקה',
    content: {
      image: { assetId: pictures.zoharScene.id },
      caption: text('ON STAGE'),
      title: text('גם ערב ההשקה משודר', 'ב-Hila 3, כמובן'),
      body: text(
        'שלוש מצלמות, מפיקה אחת ודפדפן אחד. כל מה שתראו הערב נבנה בכלים שתקבלו מחר בבוקר.',
      ),
    },
  },
  {
    layout: 'l_zohar_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'עברנו ל-Hila 3 שבוע לפני גמר העונה. 180 אלף צופים, אפס תקלות, והצ׳אט הרגיש כמו אולם מלא.',
      ),
      attribution: text('תמר אלון'),
      caption: text('מפיקה ראשית, ליגת הסטנדאפ הפתוחה · משדרת ב-Hila מאז 2024'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_team',
    name: 'הצוות',
    content: {
      caption: [
        text('THE TEAM'),
        text('מנהלת המוצר'),
        text('ראש צוות הווידאו'),
        text('מהנדס אמינות'),
        text('מעצבת ראשית'),
      ],
      title: text('האנשים שמאחורי Hila 3'),
      image: TEAM,
      subtitle: [text('מאיה שגיא'), text('עידו רונן'), text('יונתן פרץ'), text('נטע לביא')],
      body: [
        text('הובילה את Hila מהגרסה הראשונה, ואת המעבר לענן.'),
        text('בנה את מנוע הקידוד שמוריד את ההשהיה ל-0.4 שניות.'),
        text('דואג ש-250 אלף צופים יראו את אותו שידור בלי תקלה.'),
        text('עיצבה אולפן שאפשר להפעיל בלי מדריך למשתמש.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_closing',
    name: 'סיום',
    content: {
      caption: [text('GET STARTED'), text('hello@hila.example · hila.example/3')],
      title: text('נתראה', 'בשידור'),
      body: [
        text('Hila 3 נפתחת לכל המשתמשים ב-16 במרץ'),
        text('מנויי Studio מקבלים גישה מוקדמת כבר הערב'),
        text('מדריך המעבר מ-Hila 2 מחכה במרכז העזרה'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_zohar_hero',
    name: 'Cover',
    content: {
      caption: [text('LAUNCH EVENT · 2027'), text('Launch night · Tel Aviv Port · 9 March 2027')],
      title: text('Hila 3', 'goes live'),
      subtitle: text('A complete live studio, inside the browser'),
    },
  },
  {
    layout: 'l_zohar_section',
    name: 'What’s new',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('What’s new'),
      subtitle: text('Three things you asked for, and one you did not expect.'),
    },
  },
  {
    layout: 'l_zohar_big_number',
    name: 'Latency',
    content: {
      caption: [
        text('LATENCY'),
        text('full quality, even on mobile data'),
        text('viewers at once on one stream'),
        text('languages in live captions'),
      ],
      title: text('Almost no delay'),
      number: [text('0.4'), text('4K'), text('250K'), text('38')],
      subtitle: text('seconds, from camera to screen'),
      body: text(
        'In Hila 2 the delay was 2.8 seconds. The new engine encodes video at the edge of the network, close to the viewer, so talking with the audience feels like talking.',
      ),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_cards',
    name: 'Three tools',
    content: {
      caption: [
        text('WHAT’S NEW'),
        text('STUDIO · In the cloud'),
        text('STAGE · Shared with guests'),
        text('CLIPS · Cut automatically'),
      ],
      title: text('Three new tools, one screen'),
      subtitle: [text('Nothing to install'), text('Up to 12 guests'), text('A clip in a minute')],
      body: [
        text('Mixer, graphics and captions run in the browser. Open a link and go live.'),
        text('Each guest joins from a phone or a laptop, on an audio channel of their own.'),
        text('The system finds the strong moments and cuts vertical clips for social.'),
        text('And the fourth: live captions in 38 languages, included in every paid plan.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_text_image',
    name: 'The stage',
    content: {
      caption: text('THE STAGE'),
      title: text('One stage, an audience anywhere'),
      image: { assetId: pictures.zoharScene.id },
      subtitle: [
        text('The audience is in the show'),
        text('Light that follows the content'),
        text('One stream, 38 languages'),
      ],
      body: [
        text('Questions, polls and reactions reach the screen in real time, with no extra crew.'),
        text('Stage colours and graphics stay in step with what happens on the stream.'),
        text('Each viewer picks a caption language, and the translation lands that second.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_chart',
    name: 'Growth',
    content: {
      caption: [text('GROWTH'), text('Source: platform data, millions of hours per quarter.')],
      title: text('Watch time doubled within a year'),
      number: [text('+112%'), text('62%')],
      body: [
        text('Hours watched per quarter, against Q1 2026.'),
        text('of watch time now comes from live streams.'),
      ],
      footer: FOOTER,
    },
    chart: {
      chartType: 'column',
      title: 'Hours watched by quarter, millions',
      data: {
        categories: QUARTERS,
        series: [
          { name: 'Live', values: LIVE },
          { name: 'Recorded', values: RECORDED },
        ],
      },
    },
  },
  {
    layout: 'l_zohar_comparison',
    name: 'Before and after',
    content: {
      caption: [
        text('BEFORE AND AFTER'),
        text('Until today · Hila 2'),
        text('From today · Hila 3'),
      ],
      title: text('What changes on launch day'),
      subtitle: [text('A studio on your computer'), text('A studio in the cloud')],
      body: [
        bullets(
          'A delay of 2.8 seconds',
          'Up to 4 guests on a stream',
          'Captions only after the stream',
          'Clips edited by hand',
        ),
        bullets(
          'A delay of 0.4 seconds',
          'Up to 12 guests, each on an audio channel of their own',
          'Live captions in 38 languages',
          'Automatic clips, a minute after the moment itself',
        ),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_table',
    name: 'Plans',
    content: {
      caption: [
        text('PLANS'),
        text('Prices in shekels per month, billed yearly. You can change plans at any time.'),
      ],
      title: text('Three plans, no small print'),
      footer: FOOTER,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['What you get', 'Solo', 'Creator', 'Studio'],
        ['Price per month', '₪0', '₪59', '₪189'],
        ['Guests on a stream', '2', '6', '12'],
        ['Stream quality', '1080p', '4K', '4K HDR'],
        ['Live captions', '—', '12 languages', '38 languages'],
        ['Automatic clips', '3 a month', '40 a month', 'Unlimited'],
        ['Recording storage', '10 hours', '200 hours', '2,000 hours'],
        ['Stages at once', '1', '2', '8'],
        ['Support', 'Help centre', 'Chat', 'A named manager'],
      ],
    },
  },
  {
    layout: 'l_zohar_process',
    name: 'Going live',
    content: {
      caption: [
        text('GO LIVE'),
        text('A name, a cover image and a start time.'),
        text('One link by message, no sign-up.'),
        text('A camera and mic check for every guest.'),
        text('One click, and the audience sees you.'),
        text('The strong moments are cut and sent to you.'),
      ],
      title: text('From an idea to a live stream in five steps'),
      subtitle: [
        text('Open a stage'),
        text('Invite guests'),
        text('Check sound'),
        text('Go live'),
        text('Share clips'),
      ],
      number: [text('1 min'), text('2 min'), text('30 sec'), text('0.4 sec'), text('1 min')],
      body: text('Under five minutes from opening the browser to the audience seeing you.'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_section',
    name: 'What’s next',
    content: {
      number: text('02'),
      caption: text('PART TWO'),
      title: text('What’s next'),
      subtitle: text('The roadmap for 2027, and the people building it.'),
    },
  },
  {
    layout: 'l_zohar_timeline',
    name: 'Roadmap',
    content: {
      caption: [
        text('ROADMAP 2027'),
        text('Dates are targets. Updates are published at hila.example/roadmap.'),
      ],
      title: text('Four stops before the year ends'),
      number: [text('Mar'), text('Jun'), text('Sep'), text('Dec')],
      subtitle: [
        text('Hila 3 for all'),
        text('The mobile app'),
        text('Add-on store'),
        text('8K streaming'),
      ],
      body: [
        text('Every user moves to the new engine, with nothing to change in settings.'),
        text('A whole stage run from a phone: mixer, camera switching, guest approval.'),
        text('Graphics, effects and audience games from independent developers.'),
        text('For Studio subscribers, with the same delay of 0.4 seconds.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_full_image',
    name: 'Launch night',
    content: {
      image: { assetId: pictures.zoharScene.id },
      caption: text('ON STAGE'),
      title: text('Launch night is streamed', 'on Hila 3, of course'),
      body: text(
        'Three cameras, one producer and one browser. Everything you see tonight was built with the tools you get tomorrow morning.',
      ),
    },
  },
  {
    layout: 'l_zohar_quote',
    name: 'Quote',
    content: {
      quote: text(
        'We moved to Hila 3 a week before the season finale. 180 thousand viewers, zero faults, and the chat felt like a full hall.',
      ),
      attribution: text('Tamar Alon'),
      caption: text('Executive producer, The Open Stand-up League · streaming on Hila since 2024'),
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_team',
    name: 'The team',
    content: {
      caption: [
        text('THE TEAM'),
        text('Head of product'),
        text('Video team lead'),
        text('Reliability engineer'),
        text('Lead designer'),
      ],
      title: text('The people behind Hila 3'),
      image: TEAM,
      subtitle: [text('Maya Sagi'), text('Ido Ronen'), text('Yonatan Peretz'), text('Neta Lavi')],
      body: [
        text('Has led Hila since its first version, and the move to the cloud.'),
        text('Built the encoder that brings the delay down to 0.4 seconds.'),
        text('Makes sure 250 thousand viewers see one stream without a fault.'),
        text('Designed a studio you can run without a manual.'),
      ],
      footer: FOOTER,
    },
  },
  {
    layout: 'l_zohar_closing',
    name: 'Closing',
    content: {
      caption: [text('GET STARTED'), text('hello@hila.example · hila.example/3')],
      title: text('See you', 'live'),
      body: [
        text('Hila 3 opens to every user on 16 March'),
        text('Studio subscribers get early access tonight'),
        text('The Hila 2 migration guide is in the help centre'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const zoharSamples = { he: sampleHe, en: sampleEn };

/** The Zohar template: the theme, fourteen layouts for both directions, and its sample deck. */
export function zoharTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(zoharTheme),
    description: 'Launch: vivid gradients, panels of glass and glow, for launches and keynotes.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.zoharScene,
      pictures.zoharTeam1,
      pictures.zoharTeam2,
      pictures.zoharTeam3,
      pictures.zoharTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
