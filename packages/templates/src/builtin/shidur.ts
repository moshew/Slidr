import type { Element, Fill, Frame, Layout, ShapeElement, Theme } from '@slidr/model';
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
  NO_FILL,
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
 * Shidur (broadcast): the webinar template. White slides cut by slabs of royal blue whose inner
 * edge leans, a hot pink that only ever draws (stripes along the slant, the line around a
 * photograph, a badge), grids of dots in the corners, and bold geometric headings. For webinars,
 * online events, courses and business talks.
 *
 * Text never stands on the blue: every text style is dark on white, and what the blue carries is
 * drawn by the layout (a figure in a circle, the mark, a quotation mark). The pink is deep enough
 * for a white figure on it (4.6:1), which the slide number's chip uses.
 */
export const shidurTheme: Theme = {
  id: 'shidur',
  name: 'Shidur',
  colors: {
    bg: '#ffffff',
    surface: '#f3f4ff',
    text: '#14185a',
    muted: '#5b5f80',
    primary: '#2a2fd6',
    secondary: '#171a8c',
    accent: '#e01672',
    chart: ['#2a2fd6', '#e01672', '#171a8c', '#7a80f0', '#f59e0b', '#9aa0c0'],
  },
  fonts: {
    heading: { he: 'Heebo', latin: 'Poppins' },
    body: { he: 'Heebo', latin: 'Inter' },
  },
  textStyles: {
    display: {
      font: 'heading',
      size: 120,
      weight: 800,
      lineHeight: 1.05,
      letterSpacing: -2,
      color: { token: 'primary' },
    },
    title: { font: 'heading', size: 64, weight: 700, lineHeight: 1.12, color: { token: 'text' } },
    heading: { font: 'heading', size: 40, weight: 600, lineHeight: 1.2, color: { token: 'text' } },
    body: { font: 'body', size: 28, weight: 400, lineHeight: 1.5, color: { token: 'text' } },
    caption: { font: 'body', size: 24, weight: 500, lineHeight: 1.4, color: { token: 'muted' } },
  },
  radius: 24,
  shadow: { x: 0, y: 16, blur: 40, color: { value: '#2a2fd6', alpha: 0.14 } },
  background: { fill: { kind: 'solid', color: { token: 'bg' } } },
  backgroundVariants: [
    SURFACE,
    {
      // A wash of the blue from the lower corner of the end side, as a studio light would fall.
      fill: { kind: 'solid', color: { token: 'bg' } },
      overlay: {
        kind: 'radial',
        center: { x: 0, y: 1 },
        stops: [
          { color: { token: 'primary', alpha: 0.1 }, at: 0 },
          { color: { token: 'primary', alpha: 0 }, at: 0.6 },
        ],
      },
    },
  ],
};

// ---------------------------------------------------------------------------------------------
// What the layouts share

const BLUE = solid(token('primary'));
const DEEP = solid(token('secondary'));
const PINK = solid(token('accent'));
const WHITE = solid(token('bg'));
const TINT = solid(token('primary', 0.07));
const HAIR = solid(token('text', 0.12));

const SOFT = { x: 0, y: 16, blur: 40, color: token('primary', 0.12) };
const CARD_EDGE = { color: token('primary', 0.08), width: 1 };

/** The literal colours of the drawings, and the tokens they stand for. */
const PAINT = {
  '#2a2fd6': token('primary'),
  '#171a8c': token('secondary'),
  '#e01672': token('accent'),
  '#ffffff': token('bg'),
};

/** A point of the slide as a right-to-left slide is drawn: x from the left (the end side). */
type Point = readonly [x: number, y: number];

const round1 = (n: number) => Math.round(n * 10) / 10;

/** A polygon given in the slide's own coordinates, as a shape in the box around it. */
function polygon(id: string, points: readonly Point[], fill: Fill): ShapeElement {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  const [w, h] = [Math.max(...xs) - x, Math.max(...ys) - y];
  const d =
    points
      .map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${round1(px - x)} ${round1(py - y)}`)
      .join('') + 'Z';
  return rect(id, { x, y, w, h }, fill, { geometry: { kind: 'path', d, viewBox: { w, h } } });
}

/**
 * The slab: a field of the blue at the end side of the slide, from its top to its foot, whose
 * inner edge leans: `top` wide at the top, `bottom` wide at the foot. The mirror moves it to the
 * other side and leans it the other way.
 */
interface Slab {
  top: number;
  bottom: number;
}

const slab = (id: string, { top, bottom }: Slab) =>
  polygon(
    id,
    [
      [0, 0],
      [top, 0],
      [bottom, 1080],
      [0, 1080],
    ],
    BLUE,
  );

/** Where the inner edge of a slab is, at a height. */
const edgeAt = ({ top, bottom }: Slab, y: number) => top + ((bottom - top) * y) / 1080;

/** A stripe that runs beside the slanted edge of a slab, `gap` off it, from `from` to `to`. */
function stripe(
  id: string,
  edge: Slab,
  from: number,
  to: number,
  gap: number,
  width: number,
  fill: Fill = PINK,
): ShapeElement {
  const [a, b] = [edgeAt(edge, from) + gap, edgeAt(edge, to) + gap];
  return polygon(
    id,
    [
      [a, from],
      [a + width, from],
      [b + width, to],
      [b, to],
    ],
    fill,
  );
}

/** The deep blue corner over the foot of a slab: a right triangle `size` on a side. */
const shade = (id: string, size: number) =>
  polygon(
    id,
    [
      [0, 1080 - size],
      [size, 1080],
      [0, 1080],
    ],
    DEEP,
  );

/** A grid of dots, white on the blue or a pale blue on the white. `x`, `y` from the top left. */
function dots(
  id: string,
  x: number,
  y: number,
  cols: number,
  rows: number,
  on: 'blue' | 'white' = 'blue',
): Element {
  const [gap, r] = [26, 4];
  const [w, h] = [(cols - 1) * gap + 2 * r, (rows - 1) * gap + 2 * r];
  const fill = on === 'blue' ? '#ffffff' : '#2a2fd6';
  const opacity = on === 'blue' ? 0.55 : 0.3;
  const circles = Array.from({ length: cols * rows }, (_, i) => {
    const [cx, cy] = [r + (i % cols) * gap, r + Math.floor(i / cols) * gap];
    return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;
  }).join('');
  const markup = `<svg viewBox="0 0 ${w} ${h}"><g fill="${fill}" fill-opacity="${opacity}">${circles}</g></svg>`;
  return drawing(id, { x, y, w, h }, markup, PAINT);
}

/** A box grown on every side. */
const grow = (frame: Frame, by: number): Frame => ({
  x: frame.x - by,
  y: frame.y - by,
  w: frame.w + 2 * by,
  h: frame.h + 2 * by,
});

/**
 * The frame of a photograph: a white mat with a soft shadow, and behind it a pink line of the
 * same size, set off towards the end side and down, so it shows along two edges. The picture
 * itself is the placeholder's, laid on the mat.
 */
function framed(name: string, photo: Frame, mat = 16, by = 28): Element[] {
  const card = grow(photo, mat);
  return [
    rect(`${name}_line`, { ...card, x: card.x - by, y: card.y + by }, NO_FILL, {
      stroke: { color: token('accent'), width: 5 },
      effects: { radius: 28 },
    }),
    rect(`${name}_mat`, card, WHITE, { effects: { radius: 24, shadow: SOFT } }),
  ];
}

/** The broadcast sign: a dot and two arcs on each side of it. The same both ways round. */
const BROADCAST =
  '<svg viewBox="0 0 40 40" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round">' +
  '<circle cx="20" cy="20" r="3.5" fill="#ffffff" stroke="none"/>' +
  '<path d="M15 15a7 7 0 0 0 0 10M25 15a7 7 0 0 1 0 10M11.5 11.5a12 12 0 0 0 0 17M28.5 11.5a12 12 0 0 1 0 17"/></svg>';

/** The mark: the broadcast sign on a blue tile, with a pink light. A deck replaces it with its logo. */
const MARK =
  '<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="11" fill="#2a2fd6"/>' +
  '<g fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round">' +
  '<path d="M15.5 17a6 6 0 0 0 0 9M24.5 17a6 6 0 0 1 0 9M12 13.5a11 11 0 0 0 0 16M28 13.5a11 11 0 0 1 0 16"/></g>' +
  '<circle cx="20" cy="21.5" r="3" fill="#ffffff"/><circle cx="32" cy="8" r="4.5" fill="#e01672"/></svg>';

const mark = (id: string, frame: Frame) =>
  drawing(id, frame, MARK, PAINT, { role: 'logo', name: 'logo' });

/** A badge of the broadcast: a pink disc in a white ring, with the sign on it. */
const badge = (id: string, frame: Frame): Element[] => [
  dot(id, frame, PINK, { stroke: { color: token('bg'), width: 8 } }),
  drawing(`${id}_sign`, grow(frame, -frame.w * 0.24), BROADCAST, PAINT),
];

/** A calendar, in the blue. */
const CALENDAR =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#2a2fd6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

/** An arrow in the direction of reading, drawn for a right-to-left slide: the mirror turns it. */
const ARROW =
  '<svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';

/** The quotation mark of each direction, in white on the blue: two marks, not one and its mirror. */
const QUOTE_RTL =
  '<svg viewBox="0 0 66 52"><path fill="#ffffff" d="M66 0v22c0 18-9 28-26 30V42c8-2 12-7 12-16H40V0h26ZM26 0v22C26 40 17 50 0 52V42c8-2 12-7 12-16H0V0h26Z"/></svg>';
const QUOTE_LTR =
  '<svg viewBox="0 0 66 52"><path fill="#ffffff" d="M0 52V30C0 12 9 2 26 0v10c-8 2-12 7-12 16h12v26H0Zm40 0V30C40 12 49 2 66 0v10c-8 2-12 7-12 16h12v26H40Z"/></svg>';

const quoteGlyph = (frame: Frame, markup: string) =>
  drawing('d_shidur_quote_glyph', frame, markup, PAINT);

/** A figure on a disc or a tile: white, centred, so it stays in place when the layout turns. */
const figure = (id: string, frame: Frame, n: number) =>
  label(id, frame, String(n).padStart(2, '0'), 'heading', {
    color: token('bg'),
    weight: 700,
    dir: 'auto',
    align: 'center',
    vAlign: 'middle',
  });

/** The short pink rule that opens the line over a title. */
const tick = (id: string, start: number, top: number) =>
  rect(id, at(start, top, 48, 6), PINK, { effects: { radius: 3 } });

/** The line over a title and the title itself, as every content slide has them. */
function head(name: string, width = 1300, lines = 1) {
  return {
    placeholders: [
      place('p_kicker', 'caption', at(164, 92, Math.min(800, width - 68), 34), 'caption'),
      place('p_title', 'title', at(96, 136, width, 74 * lines), 'title'),
    ],
    decorations: [tick(`d_shidur_${name}_tick`, 96, 106)],
  };
}

/**
 * The corner of a content slide: a small slab of the blue in the top corner of the end side, a
 * pink stripe beside its slant, and dots on it. A title of a content slide stops short of it.
 */
function corner(name: string): Element[] {
  const edge: Slab = { top: 520, bottom: 520 - (120 * 1080) / 190 };
  return [
    polygon(
      `d_shidur_${name}_corner`,
      [
        [0, 0],
        [520, 0],
        [400, 190],
        [0, 190],
      ],
      BLUE,
    ),
    stripe(`d_shidur_${name}_corner_stripe`, edge, 0, 120, 28, 30),
    dots(`d_shidur_${name}_corner_dots`, 56, 44, 5, 3),
  ];
}

/**
 * The foot of a content slide: the mark at the start with the deck's name beside it, and at the
 * end the slide's number, white in a pink chip (SLD-04).
 */
function foot(name: string) {
  return {
    placeholders: [place('p_footer', 'footer', at(160, 960, 900, 34), 'caption')],
    decorations: [
      mark(`d_shidur_${name}_mark`, at(96, 954, 44, 44)),
      dot(`d_shidur_${name}_folio`, atEnd(96, 948, 58, 58), PINK),
      pageNumber(`d_shidur_${name}_number`, atEnd(96, 960, 58, 34), 'caption', {
        color: token('bg'),
        weight: 700,
        align: 'center',
      }),
    ],
  };
}

/** A white card on the white, lifted by a soft blue shadow. */
const card = (id: string, frame: Frame) =>
  rect(id, frame, WHITE, { stroke: CARD_EDGE, effects: { radius: 24, shadow: SOFT } });

/** A pale band of the blue that holds one line of text, with a pink dot at its start. */
function band(name: string, top: number): Element[] {
  return [
    rect(`d_shidur_${name}_band`, at(96, top, 1728, 100), TINT, { effects: { radius: 50 } }),
    dot(`d_shidur_${name}_band_dot`, at(132, top + 41, 18, 18), PINK),
  ];
}

/** A chevron pointing the way the slide reads, drawn for a right-to-left slide. */
function chevron(id: string, frame: Frame, fill: Fill): ShapeElement {
  const { x, y, w, h } = frame;
  return polygon(
    id,
    [
      [x, y + h / 2],
      [x + 36, y],
      [x + w, y],
      [x + w - 36, y + h / 2],
      [x + w, y + h],
      [x + 36, y + h],
    ],
    fill,
  );
}

// ---------------------------------------------------------------------------------------------
// The layouts, drawn right-to-left

/** The slab of the opening and the closing slides. */
const WIDE: Slab = { top: 860, bottom: 700 };
const SECTION: Slab = { top: 1000, bottom: 820 };
const QUOTE: Slab = { top: 700, bottom: 560 };
const NARROW: Slab = { top: 420, bottom: 300 };

const columns4 = [96, 540, 984, 1428];
const cards3 = [96, 688, 1280];
const steps5 = [96, 450, 804, 1158, 1512];
const rows3 = [340, 524, 708];
const stats3 = [262, 486, 710];
const lines3 = [540, 660, 780];
const sides = { before: 96, after: 1004 };

function layouts(): Layout[] {
  const heroPhoto = atEnd(150, 190, 560, 660);
  const textPhoto = atEnd(150, 150, 600, 740);
  return [
    {
      id: 'l_shidur_hero',
      name: 'Hero',
      archetype: 'hero',
      placeholders: [
        place('p_kicker', 'caption', at(164, 286, 752, 34), 'caption'),
        place('p_title', 'title', at(96, 334, 820, 262), 'display'),
        place('p_subtitle', 'subtitle', at(96, 620, 820, 106), 'heading'),
        place('p_meta', 'caption', at(172, 889, 604, 34), 'caption'),
        place('p_image', 'image', heroPhoto),
      ],
      decorations: [
        slab('d_shidur_hero_slab', WIDE),
        shade('d_shidur_hero_shade', 380),
        stripe('d_shidur_hero_stripe', WIDE, 0, 260, 36, 30),
        stripe('d_shidur_hero_line', WIDE, 120, 380, 84, 12, BLUE),
        stripe('d_shidur_hero_stripe2', WIDE, 860, 1080, 36, 30),
        dots('d_shidur_hero_dots', 96, 80, 6, 4),
        ...framed('d_shidur_hero_photo', heroPhoto),
        ...badge('d_shidur_hero_badge', atEnd(738, 248, 104, 104)),
        mark('d_shidur_hero_mark', at(96, 80, 56, 56)),
        tick('d_shidur_hero_tick', 96, 300),
        // The date and the hour of the session, on a pale pill with a calendar.
        rect('d_shidur_hero_pill', at(96, 872, 700, 68), TINT, { effects: { radius: 34 } }),
        drawing('d_shidur_hero_calendar', at(116, 886, 40, 40), CALENDAR, PAINT),
      ],
    },
    {
      id: 'l_shidur_section',
      name: 'Section',
      archetype: 'section',
      placeholders: [
        place('p_number', 'number', atEnd(260, 450, 360, 180), 'display', {
          align: 'center',
          vAlign: 'middle',
        }),
        place('p_kicker', 'caption', at(164, 380, 680, 34), 'caption'),
        place('p_title', 'title', at(96, 430, 744, 262), 'display'),
        place('p_subtitle', 'subtitle', at(96, 716, 744, 106), 'heading'),
      ],
      decorations: [
        slab('d_shidur_section_slab', SECTION),
        shade('d_shidur_section_shade', 460),
        stripe('d_shidur_section_stripe', SECTION, 760, 1080, 36, 30),
        stripe('d_shidur_section_line', SECTION, 820, 1080, 84, 12, BLUE),
        dots('d_shidur_section_dots', 96, 80, 6, 4),
        // The number of the part on a white disc in a pink ring, as a speaker in a frame.
        dot('d_shidur_section_ring', atEnd(220, 320, 440, 440), NO_FILL, {
          stroke: { color: token('accent'), width: 6 },
        }),
        dot('d_shidur_section_disc', atEnd(260, 360, 360, 360), WHITE),
        mark('d_shidur_section_mark', at(96, 80, 56, 56)),
        tick('d_shidur_section_tick', 96, 394),
      ],
    },
    {
      id: 'l_shidur_big_number',
      name: 'Big number',
      archetype: 'bigNumber',
      placeholders: [
        ...head('big_number').placeholders,
        place('p_number', 'number', at(96, 290, 1000, 135), 'display'),
        place('p_label', 'subtitle', at(96, 476, 1000, 53), 'heading'),
        place('p_body', 'body', at(96, 550, 900, 135), 'body'),
        ...stats3.flatMap((top, i) => [
          place(`p_stat${i + 1}`, 'number', atEnd(136, top + 26, 500, 79), 'title'),
          place(`p_stat${i + 1}_label`, 'caption', atEnd(136, top + 110, 500, 68), 'caption'),
        ]),
        ...foot('big_number').placeholders,
      ],
      decorations: [
        ...corner('big_number'),
        ...head('big_number').decorations,
        rect('d_shidur_big_number_bar', at(96, 446, 120, 8), PINK, { effects: { radius: 4 } }),
        ...stats3.flatMap((top, i) => [
          card(`d_shidur_big_number_card${i + 1}`, atEnd(96, top, 600, 190)),
          rect(`d_shidur_big_number_rule${i + 1}`, atEnd(660, top + 40, 8, 110), BLUE, {
            effects: { radius: 4 },
          }),
        ]),
        ...foot('big_number').decorations,
      ],
    },
    {
      id: 'l_shidur_quote',
      name: 'Quote',
      archetype: 'quote',
      placeholders: [
        place('p_quote', 'quote', at(96, 230, 1060, 400), 'title', { vAlign: 'middle' }),
        place('p_attribution', 'attribution', at(96, 712, 1060, 53), 'heading'),
        place('p_caption', 'caption', at(96, 774, 1060, 68), 'caption'),
        ...foot('quote').placeholders,
      ],
      decorations: [
        slab('d_shidur_quote_slab', QUOTE),
        shade('d_shidur_quote_shade', 320),
        stripe('d_shidur_quote_stripe', QUOTE, 0, 300, 36, 30),
        dots('d_shidur_quote_dots', 96, 80, 6, 4),
        quoteGlyph(atEnd(170, 420, 280, 221), QUOTE_RTL),
        rect('d_shidur_quote_bar', at(96, 676, 120, 8), PINK, { effects: { radius: 4 } }),
        ...foot('quote').decorations,
      ],
    },
    {
      id: 'l_shidur_text_image',
      name: 'Text and image',
      archetype: 'textImage',
      placeholders: [
        ...head('text_image', 964, 2).placeholders,
        place('p_image', 'image', textPhoto),
        ...rows3.flatMap((top, i) => [
          place(`p_point${i + 1}`, 'subtitle', at(180, top + 2, 880, 53), 'heading'),
          place(`p_point${i + 1}_body`, 'body', at(180, top + 60, 880, 110), 'body'),
        ]),
        ...foot('text_image').placeholders,
      ],
      decorations: [
        slab('d_shidur_text_image_slab', NARROW),
        stripe('d_shidur_text_image_stripe', NARROW, 860, 1080, 30, 26),
        dots('d_shidur_text_image_dots', 40, 40, 6, 3),
        ...framed('d_shidur_text_image_photo', textPhoto),
        ...head('text_image', 964, 2).decorations,
        ...rows3.flatMap((top, i) => [
          dot(`d_shidur_text_image_disc${i + 1}`, at(96, top, 60, 60), i === 1 ? PINK : BLUE),
          figure(`d_shidur_text_image_n${i + 1}`, at(96, top, 60, 60), i + 1),
        ]),
        ...foot('text_image').decorations,
      ],
    },
    {
      id: 'l_shidur_full_image',
      name: 'Full image',
      archetype: 'fullImage',
      placeholders: [
        // The picture runs from edge to edge; the text has a band of its own under it, because
        // nothing of a layout can be drawn between a picture and the text over it.
        place('p_image', 'image', atEnd(0, 0, 1920, 620)),
        place('p_kicker', 'caption', at(164, 696, 900, 34), 'caption'),
        place('p_title', 'title', at(96, 740, 1060, 148), 'title'),
        place('p_body', 'body', atEnd(96, 744, 560, 180), 'body'),
      ],
      decorations: [
        polygon(
          'd_shidur_full_image_band',
          [
            [0, 620],
            [1180, 620],
            [1150, 652],
            [0, 652],
          ],
          BLUE,
        ),
        polygon(
          'd_shidur_full_image_stripe',
          [
            [1200, 620],
            [1260, 620],
            [1230, 652],
            [1170, 652],
          ],
          PINK,
        ),
        tick('d_shidur_full_image_tick', 96, 710),
        rect('d_shidur_full_image_column', atEnd(704, 744, 2, 150), solid(token('primary', 0.2))),
        dots('d_shidur_full_image_dots', 96, 940, 8, 2, 'white'),
      ],
    },
    {
      id: 'l_shidur_cards',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [
        ...head('cards').placeholders,
        ...cards3.flatMap((start, i) => [
          place(`p_card${i + 1}_note`, 'caption', at(start + 136, 302, 368, 76), 'caption', {
            vAlign: 'middle',
          }),
          place(`p_card${i + 1}`, 'subtitle', at(start + 40, 410, 464, 106), 'heading'),
          place(`p_card${i + 1}_body`, 'body', at(start + 40, 530, 464, 210), 'body'),
        ]),
        place('p_takeaway', 'body', at(176, 805, 1600, 90), 'body', { vAlign: 'middle' }),
        ...foot('cards').placeholders,
      ],
      decorations: [
        ...corner('cards'),
        ...head('cards').decorations,
        ...cards3.flatMap((start, i) => [
          card(`d_shidur_cards_card${i + 1}`, at(start, 262, 544, 500)),
          rect(`d_shidur_cards_tile${i + 1}`, at(start + 40, 302, 76, 76), i === 1 ? PINK : BLUE, {
            effects: { radius: 20 },
          }),
          figure(`d_shidur_cards_n${i + 1}`, at(start + 40, 302, 76, 76), i + 1),
        ]),
        ...band('cards', 800),
        ...foot('cards').decorations,
      ],
    },
    {
      id: 'l_shidur_timeline',
      name: 'Timeline',
      archetype: 'timeline',
      placeholders: [
        ...head('timeline').placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_when${i + 1}`, 'number', at(start, 360, 396, 79), 'title', {
            vAlign: 'bottom',
          }),
          place(`p_what${i + 1}`, 'subtitle', at(start + 28, 556, 340, 106), 'heading'),
          place(`p_what${i + 1}_body`, 'body', at(start + 28, 670, 340, 170), 'caption'),
        ]),
        place('p_note', 'caption', at(96, 884, 1728, 34), 'caption'),
        ...foot('timeline').placeholders,
      ],
      decorations: [
        ...corner('timeline'),
        ...head('timeline').decorations,
        rect('d_shidur_timeline_line', at(96, 478, 1728, 6), BLUE, { effects: { radius: 3 } }),
        ...columns4.flatMap((start, i) => [
          dot(`d_shidur_timeline_node${i + 1}`, at(start, 459, 44, 44), WHITE, {
            stroke: { color: token('primary'), width: 8 },
          }),
          dot(`d_shidur_timeline_light${i + 1}`, at(start + 14, 473, 16, 16), PINK),
          card(`d_shidur_timeline_card${i + 1}`, at(start, 530, 396, 330)),
        ]),
        ...foot('timeline').decorations,
      ],
    },
    {
      id: 'l_shidur_process',
      name: 'Process',
      archetype: 'process',
      placeholders: [
        ...head('process').placeholders,
        ...steps5.flatMap((start, i) => [
          place(`p_step${i + 1}`, 'subtitle', at(start, 392, 312, 106), 'heading'),
          place(`p_step${i + 1}_body`, 'caption', at(start, 506, 304, 136), 'caption'),
          place(`p_step${i + 1}_number`, 'number', at(start, 680, 312, 79), 'title'),
        ]),
        place('p_summary', 'body', at(176, 805, 1600, 90), 'body', { vAlign: 'middle' }),
        ...foot('process').placeholders,
      ],
      decorations: [
        ...corner('process'),
        ...head('process').decorations,
        ...steps5.flatMap((start, i) => {
          const column = at(start, 262, 312, 96);
          const fill = i === 4 ? PINK : i % 2 === 0 ? BLUE : DEEP;
          return [
            chevron(`d_shidur_process_step${i + 1}`, { ...column, x: column.x - 24, w: 336 }, fill),
            figure(`d_shidur_process_n${i + 1}`, column, i + 1),
            tick(`d_shidur_process_tick${i + 1}`, start, 660),
          ];
        }),
        ...band('process', 800),
        ...foot('process').decorations,
      ],
    },
    {
      id: 'l_shidur_comparison',
      name: 'Comparison',
      archetype: 'comparison',
      placeholders: [
        ...head('comparison').placeholders,
        ...(['before', 'after'] as const).flatMap((side) => {
          const start = sides[side];
          return [
            place(`p_${side}_tag`, 'caption', at(start + 66, 302, 714, 34), 'caption'),
            place(`p_${side}`, 'subtitle', at(start + 40, 350, 740, 106), 'heading'),
            place(`p_${side}_body`, 'body', at(start + 40, 500, 740, 350), 'body'),
          ];
        }),
        ...foot('comparison').placeholders,
      ],
      decorations: [
        ...corner('comparison'),
        ...head('comparison').decorations,
        // What was stands plain; what is, lifted, in the pink frame of the photographs.
        rect('d_shidur_comparison_before', at(sides.before, 262, 820, 620), WHITE, {
          stroke: { color: token('text', 0.14), width: 2 },
          effects: { radius: 24 },
        }),
        rect(
          'd_shidur_comparison_line',
          { ...at(sides.after, 262, 820, 620), x: 72, y: 286 },
          NO_FILL,
          { stroke: { color: token('accent'), width: 5 }, effects: { radius: 28 } },
        ),
        card('d_shidur_comparison_after', at(sides.after, 262, 820, 620)),
        ...(['before', 'after'] as const).flatMap((side) => {
          const start = sides[side];
          return [
            dot(
              `d_shidur_comparison_${side}_dot`,
              at(start + 40, 312, 14, 14),
              side === 'before' ? solid(token('muted')) : PINK,
            ),
            rect(
              `d_shidur_comparison_${side}_rule`,
              at(start + 40, 474, 740, 2),
              side === 'before' ? HAIR : solid(token('primary', 0.3)),
            ),
          ];
        }),
        dot('d_shidur_comparison_badge', at(912, 524, 96, 96), BLUE, {
          stroke: { color: token('bg'), width: 6 },
        }),
        drawing('d_shidur_comparison_arrow', at(936, 548, 48, 48), ARROW, PAINT),
        ...foot('comparison').decorations,
      ],
    },
    {
      id: 'l_shidur_chart',
      name: 'Chart',
      archetype: 'chart',
      placeholders: [
        ...head('chart').placeholders,
        place('p_chart', 'chart', at(126, 280, 1100, 600)),
        place('p_stat1', 'number', atEnd(96, 262, 520, 135), 'display'),
        place('p_stat1_body', 'body', atEnd(96, 400, 520, 135), 'body'),
        place('p_stat2', 'number', atEnd(96, 582, 520, 135), 'display'),
        place('p_stat2_body', 'body', atEnd(96, 720, 520, 92), 'body'),
        place('p_source', 'caption', atEnd(96, 830, 520, 68), 'caption'),
        ...foot('chart').placeholders,
      ],
      decorations: [
        ...corner('chart'),
        ...head('chart').decorations,
        card('d_shidur_chart_card', at(96, 250, 1160, 660)),
        rect('d_shidur_chart_divider', atEnd(96, 556, 520, 2), solid(token('primary', 0.15))),
        ...foot('chart').decorations,
      ],
    },
    {
      id: 'l_shidur_table',
      name: 'Table',
      archetype: 'table',
      placeholders: [
        ...head('table').placeholders,
        place('p_table', 'table', at(96, 250, 1728, 610)),
        place('p_note', 'caption', at(96, 880, 1728, 34), 'caption'),
        ...foot('table').placeholders,
      ],
      decorations: [...corner('table'), ...head('table').decorations, ...foot('table').decorations],
    },
    {
      id: 'l_shidur_team',
      name: 'Team',
      archetype: 'team',
      placeholders: [
        ...head('team').placeholders,
        ...columns4.flatMap((start, i) => [
          place(`p_person${i + 1}_photo`, 'image', at(start, 262, 396, 396)),
          place(`p_person${i + 1}`, 'subtitle', at(start, 706, 396, 53), 'heading'),
          place(`p_person${i + 1}_role`, 'caption', at(start, 762, 396, 34), 'caption'),
          place(`p_person${i + 1}_body`, 'body', at(start, 802, 396, 102), 'caption'),
        ]),
        ...foot('team').placeholders,
      ],
      decorations: [
        ...corner('team'),
        ...head('team').decorations,
        ...columns4.map((start, i) =>
          rect(`d_shidur_team_line${i + 1}`, at(start + 22, 284, 396, 396), NO_FILL, {
            stroke: { color: token(i % 2 === 0 ? 'accent' : 'primary'), width: 4 },
            effects: { radius: 24 },
          }),
        ),
        ...foot('team').decorations,
      ],
    },
    {
      id: 'l_shidur_closing',
      name: 'Closing',
      archetype: 'closing',
      placeholders: [
        place('p_kicker', 'caption', at(164, 186, 752, 34), 'caption'),
        place('p_title', 'title', at(96, 236, 820, 262), 'display'),
        ...lines3.map((top, i) =>
          place(`p_line${i + 1}`, 'body', at(176, top, 740, 92), 'body', { vAlign: 'middle' }),
        ),
        place('p_contact', 'caption', at(96, 930, 820, 34), 'caption'),
      ],
      decorations: [
        slab('d_shidur_closing_slab', WIDE),
        shade('d_shidur_closing_shade', 380),
        stripe('d_shidur_closing_stripe', WIDE, 0, 260, 36, 30),
        stripe('d_shidur_closing_line', WIDE, 120, 380, 84, 12, BLUE),
        stripe('d_shidur_closing_stripe2', WIDE, 860, 1080, 36, 30),
        dots('d_shidur_closing_dots', 96, 80, 6, 4),
        // The deck's logo on a white disc in a pink ring, where the opening slide had its speaker.
        dot('d_shidur_closing_ring', atEnd(150, 310, 460, 460), NO_FILL, {
          stroke: { color: token('accent'), width: 6 },
        }),
        rect('d_shidur_closing_disc', atEnd(190, 350, 380, 380), WHITE, {
          geometry: { kind: 'preset', preset: 'ellipse' },
          effects: { shadow: SOFT },
        }),
        mark('d_shidur_closing_mark', atEnd(280, 440, 200, 200)),
        tick('d_shidur_closing_tick', 96, 200),
        ...lines3.flatMap((top, i) => [
          dot(`d_shidur_closing_disc${i + 1}`, at(96, top + 18, 56, 56), i === 1 ? PINK : BLUE),
          drawing(`d_shidur_closing_arrow${i + 1}`, at(108, top + 30, 32, 32), ARROW, PAINT),
          rect(`d_shidur_closing_rule${i + 1}`, at(96, top + 106, 820, 1), HAIR),
        ]),
      ],
    },
  ];
}

/**
 * The layouts the mirror gets wrong for a left-to-right deck. Only the quote: its mark is a
 * glyph of the direction, and a mirrored closing mark is not an opening one.
 */
function flipped(drawn: readonly Layout[]): Layout[] {
  const quote = drawn.find((layout) => layout.id === 'l_shidur_quote');
  if (!quote) return [];
  const mirrored = mirrorLayout(quote);
  return [
    {
      ...mirrored,
      decorations: mirrored.decorations.map((decoration) =>
        decoration.id === 'd_shidur_quote_glyph'
          ? quoteGlyph(decoration.frame, QUOTE_LTR)
          : decoration,
      ),
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// The sample: a webinar of a business school, slide by slide, on the layouts

const FOOTER_HE = text('נתיב, בית ספר לעסקים · וובינר נובמבר 2026');
const FOOTER_EN = text('Nativ Business School · November 2026 webinar');
const TABLE_COLS = [260, 828, 400, 240];
const TABLE_ROW = 92;
const REGISTERED = [420, 480, 530, 580, 640, 690];
const ATTENDED = [172, 211, 254, 302, 358, 400];

const sampleHe: SampleSlide[] = [
  {
    layout: 'l_shidur_hero',
    name: 'פתיחה',
    content: {
      caption: [text('וובינר בשידור חי'), text('יום שלישי, 17 בנובמבר 2026 · 18:00 · בזום')],
      title: text('וובינר', 'עסקי'),
      subtitle: text('איך עסק קטן בונה מכירות אונליין שעובדות'),
      image: { assetId: pictures.migdalTeam2.id },
    },
  },
  {
    layout: 'l_shidur_section',
    name: 'למה עכשיו',
    content: {
      number: text('01'),
      caption: text('חלק ראשון'),
      title: text('למה עכשיו'),
      subtitle: text('מה השתנה בשנתיים האחרונות בדרך שבה לקוחות עסקיים קונים.'),
    },
  },
  {
    layout: 'l_shidur_big_number',
    name: 'במספרים',
    content: {
      caption: [
        text('במספרים'),
        text('מהקונים מעדיפים לברר לבד, בלי איש מכירות'),
        text('מהמשתתפים בוובינר משאירים פרטים לשיחה'),
        text('ימים, בממוצע, מהוובינר ועד פגישת מכירה'),
      ],
      title: text('הלקוחות כבר אונליין'),
      number: [text('73%'), text('61%'), text('38%'), text('9')],
      subtitle: text('מהקונים העסקיים מתחילים בחיפוש ובתוכן'),
      body: text(
        'עד שהם פונים אליכם, רוב ההחלטה כבר התקבלה. מי שלא נמצא שם עם תוכן טוב לא נכנס לרשימה הקצרה.',
      ),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shidur_cards',
    name: 'מה תיקחו',
    content: {
      caption: [text('מה תיקחו מהמפגש'), text('אסטרטגיה'), text('תוכן'), text('מדידה')],
      title: text('שלושה כלים לעבודה כבר מחר'),
      subtitle: [
        text('קהל אחד, הבטחה אחת'),
        text('וובינר שמוכר בלי למכור'),
        text('שלושה מספרים בשבוע'),
      ],
      body: [
        text('בוחרים לקוח אחד שכואב לו, ומנסחים משפט אחד שהוא לא יכול להתעלם ממנו.'),
        text('ארבעים דקות של ערך אמיתי, הצעה אחת ברורה בסוף, ותזכורת למחרת.'),
        text('נרשמים, משתתפים ופגישות. כל השאר רעש שמסיח את הדעת.'),
        text('כל הכלים מהמפגש מחכים לכם בקובץ אחד, יחד עם ההקלטה.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shidur_text_image',
    name: 'על נתיב',
    content: {
      caption: text('מי אנחנו'),
      title: text('בית ספר לעסקים', 'שמלמד מהשטח'),
      image: { assetId: pictures.migdalHalf2.id },
      subtitle: [
        text('12 שנים של ליווי עסקים'),
        text('4,800 בוגרים'),
        text('מנטורים שעדיין מוכרים'),
      ],
      body: [
        text('מאז 2014 ליווינו עסקים קטנים ובינוניים מהרעיון ועד הלקוח המאה.'),
        text('בעלי עסקים, מנהלי שיווק ואנשי מכירות, מאילת ועד קריית שמונה.'),
        text('כל מנחה אצלנו מנהל היום צוות מכירות, ומביא למפגש מקרים מהשבוע.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shidur_timeline',
    name: 'סדר היום',
    content: {
      caption: [text('סדר היום'), text('ההקלטה והמצגת יישלחו לכל הנרשמים למחרת.')],
      title: text('תשעים דקות, ארבע תחנות'),
      number: [text('18:00'), text('18:20'), text('18:50'), text('19:15')],
      subtitle: [
        text('פתיחה והיכרות'),
        text('בונים משפך אונליין'),
        text('סדנה: הוובינר הראשון'),
        text('שאלות ותשובות'),
      ],
      body: [
        text('מי בחדר, מה כל אחד רוצה לקחת מהערב, ומה נעשה בו.'),
        text('ממודעה ועד פגישה: איפה הלקוחות נושרים, ואיך עוצרים את זה.'),
        text('כותבים יחד כותרת, מבנה והצעה לוובינר הראשון שלכם.'),
        text('כל שאלה, כולל אלה שלא נעים לשאול. נישאר עד שייגמרו.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shidur_process',
    name: 'מליד ללקוח',
    content: {
      caption: [
        text('המשפך'),
        text('דף נחיתה קצר, טופס של שלושה שדות.'),
        text('מייל ביום שלפני, הודעה שעה לפני.'),
        text('ארבעים דקות של ערך והצעה אחת.'),
        text('ההקלטה, וקישור לקביעת שיחה.'),
        text('שיחה של עשרים דקות עם מי שביקש.'),
      ],
      title: text('מליד ללקוח בחמישה צעדים'),
      subtitle: [text('הרשמה'), text('תזכורת'), text('המפגש'), text('מעקב'), text('פגישה')],
      number: [text('יום 0'), text('יום 6'), text('יום 7'), text('יום 8'), text('יום 14')],
      body: text('שבועיים מההרשמה ועד פגישת מכירה, בלי שיחה קרה אחת.'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shidur_comparison',
    name: 'לפני ואחרי',
    content: {
      caption: [text('לפני ואחרי'), text('שיחות קרות'), text('וובינר אחד בחודש')],
      title: text('מה השתנה אצל הבוגרים שלנו'),
      subtitle: [text('200 שיחות בשבוע, 6 פגישות'), text('מפגש אחד בחודש, 25 פגישות')],
      body: [
        bullets(
          'שני אנשי מכירות על הטלפון כל היום',
          'רוב השיחות נגמרות בפחות מדקה',
          'הלקוח לא מכיר אתכם כשאתם מתקשרים',
          'עלות של כ-900 ₪ לפגישה',
        ),
        bullets(
          'מנחה אחד ושעתיים הכנה בחודש',
          'הלקוחות מגיעים לשיחה אחרי שהקשיבו לכם שעה',
          'הם אלה שמבקשים את הפגישה',
          'עלות של כ-180 ₪ לפגישה',
        ),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shidur_chart',
    name: 'נרשמים ומשתתפים',
    content: {
      caption: [text('נרשמים ומשתתפים'), text('סדרת הוובינרים של נתיב, ינואר עד אוקטובר 2026.')],
      title: text('יותר נרשמים, ויותר מהם מגיעים'),
      number: [text('+64%'), text('58%')],
      body: [
        text('גידול במספר הנרשמים למפגש, מינואר ועד אוקטובר.'),
        text('מהנרשמים הגיעו באוקטובר, לעומת 41% בינואר.'),
      ],
      footer: FOOTER_HE,
    },
    chart: {
      chartType: 'column',
      title: 'נרשמים ומשתתפים למפגש',
      data: {
        categories: ['ינואר', 'מרץ', 'מאי', 'יולי', 'ספטמבר', 'אוקטובר'],
        series: [
          { name: 'נרשמים', values: REGISTERED },
          { name: 'משתתפים', values: ATTENDED },
        ],
      },
    },
  },
  {
    layout: 'l_shidur_table',
    name: 'תוכנית הסדרה',
    content: {
      caption: [
        text('תוכנית הסדרה'),
        text('כל המפגשים בזום, בין 18:00 ל-19:30. ההשתתפות חינם, בהרשמה מראש.'),
      ],
      title: text('הסדרה המלאה: חמישה מפגשים'),
      footer: FOOTER_HE,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['תאריך', 'נושא', 'מנחה', 'משך'],
        ['17 בנובמבר', 'איך עסק קטן בונה מכירות אונליין', 'אורי לביא', '90 דק׳'],
        ['1 בדצמבר', 'וובינר שמוכר: מבנה, כותרת והצעה', 'מאיה כהן', '75 דק׳'],
        ['15 בדצמבר', 'מליד לפגישה: המעקב שאחרי המפגש', 'עידו פרץ', '60 דק׳'],
        ['5 בינואר', 'שלושה מספרים שמנהלים את המשפך', 'רונית שגיא', '60 דק׳'],
        ['19 בינואר', 'מפגש שאלות פתוח עם כל המנחים', 'כל הצוות', '90 דק׳'],
      ],
    },
  },
  {
    layout: 'l_shidur_full_image',
    name: 'מאחורי הקלעים',
    content: {
      image: { assetId: pictures.migdalScene.id },
      caption: text('מאחורי הקלעים'),
      title: text('כל וובינר נבנה כאן,', 'שבוע לפני שהוא עולה'),
      body: text('צוות של ארבעה כותב, מעצב ומתרגל, כדי שתשעים דקות ירגישו כמו עשרים.'),
    },
  },
  {
    layout: 'l_shidur_quote',
    name: 'ציטוט',
    content: {
      quote: text(
        'אחרי שלושה וובינרים היומן של צוות המכירות שלנו התמלא, ואף אחד לא הרים טלפון קר.',
      ),
      attribution: text('נועה ברק'),
      caption: text('מנכ״לית, סטודיו ברק לעיצוב פנים · בוגרת המחזור של אביב 2026'),
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shidur_team',
    name: 'המנחים',
    content: {
      caption: [
        text('המנחים'),
        text('מייסד ומנחה ראשי'),
        text('שיווק בתוכן'),
        text('מכירות B2B'),
        text('דאטה ומדידה'),
      ],
      title: text('מי מנחה את הסדרה'),
      image: [
        { assetId: pictures.migdalTeam1.id },
        { assetId: pictures.migdalTeam2.id },
        { assetId: pictures.migdalTeam3.id },
        { assetId: pictures.migdalTeam4.id },
      ],
      subtitle: [text('אורי לביא'), text('מאיה כהן'), text('עידו פרץ'), text('רונית שגיא')],
      body: [
        text('הקים את נתיב ב-2014, אחרי עשרים שנה בניהול מכירות.'),
        text('בנתה את סדרת הוובינרים מאפס, ל-690 נרשמים במפגש.'),
        text('מנהל צוות מכירות של 14 איש בחברת תוכנה.'),
        text('אחראית למדידה, ולשלושת המספרים שבודקים כל שבוע.'),
      ],
      footer: FOOTER_HE,
    },
  },
  {
    layout: 'l_shidur_closing',
    name: 'סיום',
    content: {
      caption: [text('הצעד הבא'), text('שאלות? webinar@nativ.example · nativ.example/live')],
      title: text('תודה', 'שהצטרפתם'),
      body: [
        text('ההקלטה והמצגת יגיעו אליכם במייל עד מחר בבוקר'),
        text('המפגש הבא: 1 בדצמבר, "וובינר שמוכר"'),
        text('עשרה מקומות לליווי אישי פתוחים להרשמה השבוע'),
      ],
    },
  },
];

/** The same deck in English, for the layouts as a left-to-right deck holds them. */
const sampleEn: SampleSlide[] = [
  {
    layout: 'l_shidur_hero',
    name: 'Cover',
    content: {
      caption: [text('LIVE WEBINAR'), text('Tuesday, 17 November 2026 · 6 pm · on Zoom')],
      title: text('Business', 'Webinar'),
      subtitle: text('How a small business builds online sales that work'),
      image: { assetId: pictures.migdalTeam2.id },
    },
  },
  {
    layout: 'l_shidur_section',
    name: 'Why now',
    content: {
      number: text('01'),
      caption: text('PART ONE'),
      title: text('Why now'),
      subtitle: text('What two years have changed in the way business customers buy.'),
    },
  },
  {
    layout: 'l_shidur_big_number',
    name: 'By the numbers',
    content: {
      caption: [
        text('BY THE NUMBERS'),
        text('of buyers would rather research alone, without a salesperson'),
        text('of webinar attendees leave details for a call'),
        text('days on average from the webinar to a sales meeting'),
      ],
      title: text('Your customers are already online'),
      number: [text('73%'), text('61%'), text('38%'), text('9')],
      subtitle: text('of business buyers start with search and content'),
      body: text(
        'By the time they reach you, most of the decision is made. Without good content where they look, you are not on the shortlist.',
      ),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shidur_cards',
    name: 'Takeaways',
    content: {
      caption: [
        text('WHAT YOU WILL TAKE AWAY'),
        text('Strategy'),
        text('Content'),
        text('Measurement'),
      ],
      title: text('Three tools to use tomorrow'),
      subtitle: [
        text('One audience, one promise'),
        text('A webinar that sells without selling'),
        text('Three numbers a week'),
      ],
      body: [
        text('Pick one customer with a real pain, and write one sentence they cannot ignore.'),
        text('Forty minutes of real value, one clear offer at the end, a reminder the next day.'),
        text('Sign-ups, attendees and meetings. Everything else is noise.'),
        text('Every tool from tonight waits for you in one file, with the recording.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shidur_text_image',
    name: 'About Nativ',
    content: {
      caption: text('WHO WE ARE'),
      title: text('A business school', 'that teaches from the field'),
      image: { assetId: pictures.migdalHalf2.id },
      subtitle: [
        text('12 years of coaching'),
        text('4,800 graduates'),
        text('Mentors who still sell'),
      ],
      body: [
        text('Since 2014 we have taken small businesses from the idea to the hundredth customer.'),
        text('Owners, marketing managers and salespeople, from Eilat to Kiryat Shmona.'),
        text('Every mentor runs a sales team today, and brings this week’s cases.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shidur_timeline',
    name: 'Agenda',
    content: {
      caption: [
        text('AGENDA'),
        text('The recording and the slides go to everyone registered the next day.'),
      ],
      title: text('Ninety minutes, four stops'),
      number: [text('6:00'), text('6:20'), text('6:50'), text('7:15')],
      subtitle: [
        text('Welcome and intros'),
        text('Building an online funnel'),
        text('Workshop: your first webinar'),
        text('Questions and answers'),
      ],
      body: [
        text('Who is here, what each of you wants from tonight, and the plan.'),
        text('From ad to meeting: where customers drop off, and how to stop it.'),
        text('Together we write a title, an outline and an offer for yours.'),
        text('Any question, including the awkward ones. We stay until they run out.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shidur_process',
    name: 'Lead to customer',
    content: {
      caption: [
        text('THE FUNNEL'),
        text('A short landing page, a three-field form.'),
        text('An email the day before, a text an hour before.'),
        text('Forty minutes of value and one offer.'),
        text('The recording, and a link to book a call.'),
        text('A twenty-minute call with whoever asked.'),
      ],
      title: text('From lead to customer in five steps'),
      subtitle: [
        text('Sign-up'),
        text('Reminder'),
        text('The session'),
        text('Follow-up'),
        text('Meeting'),
      ],
      number: [text('Day 0'), text('Day 6'), text('Day 7'), text('Day 8'), text('Day 14')],
      body: text('Two weeks from sign-up to a sales meeting, without a single cold call.'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shidur_comparison',
    name: 'Before and after',
    content: {
      caption: [text('BEFORE AND AFTER'), text('Cold calls'), text('One webinar a month')],
      title: text('What changed for our graduates'),
      subtitle: [text('200 calls a week, 6 meetings'), text('One session a month, 25 meetings')],
      body: [
        bullets(
          'Two salespeople on the phone all day',
          'Most calls end in under a minute',
          'The customer has never heard of you',
          'About NIS 900 per meeting',
        ),
        bullets(
          'One host and two hours of preparation a month',
          'Customers come to the call after an hour with you',
          'They are the ones who ask for the meeting',
          'About NIS 180 per meeting',
        ),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shidur_chart',
    name: 'Sign-ups and attendance',
    content: {
      caption: [
        text('SIGN-UPS AND ATTENDANCE'),
        text('The Nativ webinar series, January to October 2026.'),
      ],
      title: text('More sign-ups, and more show up'),
      number: [text('+64%'), text('58%')],
      body: [
        text('Growth in sign-ups per session, from January to October.'),
        text('of those registered came in October, up from 41% in January.'),
      ],
      footer: FOOTER_EN,
    },
    chart: {
      chartType: 'column',
      title: 'Sign-ups and attendees per session',
      data: {
        categories: ['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Oct'],
        series: [
          { name: 'Signed up', values: REGISTERED },
          { name: 'Attended', values: ATTENDED },
        ],
      },
    },
  },
  {
    layout: 'l_shidur_table',
    name: 'The series',
    content: {
      caption: [
        text('THE SERIES'),
        text('All sessions on Zoom, 6 to 7:30 pm. Free to attend, registration required.'),
      ],
      title: text('The full series: five sessions'),
      footer: FOOTER_EN,
    },
    table: {
      cols: TABLE_COLS,
      rowHeight: TABLE_ROW,
      rows: [
        ['Date', 'Topic', 'Host', 'Length'],
        ['17 Nov', 'How a small business builds online sales', 'Uri Lavi', '90 min'],
        ['1 Dec', 'A webinar that sells: outline, title, offer', 'Maya Cohen', '75 min'],
        ['15 Dec', 'From lead to meeting: the follow-up', 'Ido Peretz', '60 min'],
        ['5 Jan', 'Three numbers that run the funnel', 'Ronit Sagi', '60 min'],
        ['19 Jan', 'Open questions with all the hosts', 'The whole team', '90 min'],
      ],
    },
  },
  {
    layout: 'l_shidur_full_image',
    name: 'Behind the scenes',
    content: {
      image: { assetId: pictures.migdalScene.id },
      caption: text('BEHIND THE SCENES'),
      title: text('Every webinar is built here,', 'a week before it goes live'),
      body: text(
        'A team of four writes, designs and rehearses, so ninety minutes feel like twenty.',
      ),
    },
  },
  {
    layout: 'l_shidur_quote',
    name: 'Quote',
    content: {
      quote: text(
        'Three webinars in, our sales team’s calendar was full, and nobody had made a single cold call.',
      ),
      attribution: text('Noa Barak'),
      caption: text('CEO, Barak Interior Studio · graduate of the spring 2026 class'),
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shidur_team',
    name: 'The hosts',
    content: {
      caption: [
        text('THE HOSTS'),
        text('Founder and lead host'),
        text('Content marketing'),
        text('B2B sales'),
        text('Data and measurement'),
      ],
      title: text('Who hosts the series'),
      image: [
        { assetId: pictures.migdalTeam1.id },
        { assetId: pictures.migdalTeam2.id },
        { assetId: pictures.migdalTeam3.id },
        { assetId: pictures.migdalTeam4.id },
      ],
      subtitle: [text('Uri Lavi'), text('Maya Cohen'), text('Ido Peretz'), text('Ronit Sagi')],
      body: [
        text('Founded Nativ in 2014, after twenty years running sales.'),
        text('Built the webinar series from zero to 690 sign-ups a session.'),
        text('Runs a sales team of 14 at a software company.'),
        text('Owns the measurement, and the three numbers checked every week.'),
      ],
      footer: FOOTER_EN,
    },
  },
  {
    layout: 'l_shidur_closing',
    name: 'Closing',
    content: {
      caption: [text('WHAT’S NEXT'), text('Questions? webinar@nativ.example · nativ.example/live')],
      title: text('Thank', 'you'),
      body: [
        text('The recording and the slides reach your inbox by tomorrow morning'),
        text('Next session: 1 December, “A webinar that sells”'),
        text('Ten places for one-to-one coaching open this week'),
      ],
    },
  },
];

/** The sample decks of the template, by language. */
export const shidurSamples = { he: sampleHe, en: sampleEn };

/** The Shidur template: the theme, fourteen layouts for both directions, and its sample deck. */
export function shidurTemplate(): Template {
  const drawn = layouts();
  const template: Template = {
    theme: copyJson(shidurTheme),
    description:
      'Webinar: royal blue slabs and hot pink accents on white, for online events, courses and business talks.',
    dir: 'rtl',
    layouts: drawn,
    flipped: flipped(drawn),
    assets: assetTable([
      pictures.migdalTeam2,
      pictures.migdalHalf2,
      pictures.migdalScene,
      pictures.migdalTeam1,
      pictures.migdalTeam3,
      pictures.migdalTeam4,
    ]),
  };
  template.sample = sampleSlides(template, sampleHe);
  return template;
}
