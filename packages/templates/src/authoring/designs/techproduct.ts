// Ready-made slides of the `techproduct` topic (tech products): five products, each in a slide of
// its own kind. A launch (m-meshwifi), a feature highlight (m-homebattery), a pre-order
// (m-keyboard), a comparison (m-passkey) and a spec sheet (m-ereader). Each picture is a render of
// its own, on a transparent ground: `artwork/<id>.html` with `artwork/techproduct-studio.js`.
import type { Frame } from '@slidr/model';
import {
  art,
  fill,
  linear,
  picture,
  radial,
  rule,
  shape,
  slide,
  textBox,
  type DesignEntry,
  type Lang,
  type Look,
  type Piece,
} from './kit';

/** The x of a frame drawn on the English slide, and its mirror on the Hebrew one. */
const X = (lang: Lang, x: number, w: number) => (lang === 'en' ? x : 1920 - x - w);
/** A frame of the English composition, mirrored for Hebrew. */
const at = (lang: Lang, x: number, y: number, w: number, h: number): Frame => ({
  x: X(lang, x, w),
  y,
  w,
  h,
});
/** Looks in one family, by size, weight and colour. */
const looks =
  (font: string) =>
  (size: number, weight: number, color: string, letterSpacing?: number): Look => ({
    font,
    size,
    weight,
    color,
    ...(letterSpacing !== undefined ? { letterSpacing } : {}),
  });
const piece = (text: string, look: Look): Piece => [text, look];

// ---------------------------------------------------------------------------------------------
// m-meshwifi: a launch. Three white mesh nodes stand on a pale sky; drawn signal rings spread on
// the floor around each of them, and a card above each names its room and the speed it gets.

/** Where the picture lies in the English slide; its drawing is 1160x920 page pixels. */
const MESH_PIC = { x: 760, y: 110, w: 1160, h: 920 };
/** The nodes in the picture: top centre, and the signal rings on the floor (cx, cy, rx, ry). */
const MESH_NODES = [
  {
    top: [560, 285],
    rings: [
      [561, 744, 198, 58],
      [562, 750, 298, 88],
      [562, 758, 410, 122],
    ],
  },
  {
    top: [281, 238],
    rings: [
      [290, 646, 176, 46],
      [290, 649, 264, 69],
      [290, 655, 364, 96],
    ],
  },
  {
    top: [867, 216],
    rings: [
      [860, 600, 166, 40],
      [860, 603, 249, 61],
      [860, 607, 344, 85],
    ],
  },
] as const;

function meshwifi(lang: Lang) {
  const he = lang === 'he';
  const t = looks(he ? 'Heebo' : 'DM Sans');
  const ink = '#0E1726';
  const blue = '#2563EB';
  const deep = '#1D4ED8';
  const grey = '#4E5D71';
  const pic = at(lang, MESH_PIC.x, MESH_PIC.y, MESH_PIC.w, MESH_PIC.h);
  const rings = MESH_NODES.flatMap(({ rings }) =>
    rings.map(
      ([cx, cy, rx, ry], i) =>
        `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#2F6FEB" stroke-opacity="${[0.42, 0.26, 0.13][i]}" stroke-width="${[2.5, 2, 2][i]}"/>`,
    ),
  );
  const cards: [string, string][] = he
    ? [
        ['סלון', '2.1 Gbps'],
        ['חדר עבודה', '2.0 Gbps'],
        ['חדר ילדים', '1.9 Gbps'],
      ]
    : [
        ['Living room', '2.1 Gbps'],
        ['Study', '2.0 Gbps'],
        ["Kids' room", '1.9 Gbps'],
      ];
  const cardW = 214;
  const cardH = 100;
  const cardY = 172;
  const cardEls = MESH_NODES.flatMap(({ top }, i) => {
    const cx = pic.x + top[0];
    const ty = pic.y + top[1];
    const x = cx - cardW / 2;
    const y = cardY;
    const [room, speed] = cards[i]!;
    const pad = 26;
    return [
      rule(
        [cx, y + cardH],
        [cx, ty - 8],
        { color: { value: blue, alpha: 0.55 }, width: 2, dash: 'dotted', cap: 'round' },
        { end: 'circle' },
      ),
      shape({
        frame: { x, y, w: cardW, h: cardH },
        fill: fill('#FFFFFF', 0.92),
        round: 0.22,
        stroke: { color: { value: '#FFFFFF' }, width: 1.5 },
        shadow: { x: 0, y: 14, blur: 34, color: '#1E3A6B', alpha: 0.16 },
      }),
      shape({
        frame: { x: he ? x + cardW - pad - 12 : x + pad, y: y + 26, w: 12, h: 12 },
        preset: 'ellipse',
        fill: fill('#38BDF8'),
        shadow: { x: 0, y: 0, blur: 10, color: '#38BDF8', alpha: 0.9 },
      }),
      textBox({
        frame: { x: he ? x + pad : x + pad + 22, y: y + 12, w: cardW - pad * 2 - 22, h: 38 },
        lines: [room],
        look: t(24, 500, grey),
        lang,
      }),
      textBox({
        frame: { x: x + pad, y: y + 50, w: cardW - pad * 2, h: 42 },
        lines: [speed],
        look: t(32, 700, ink),
        lang,
        dir: 'ltr',
        align: he ? 'end' : 'start',
      }),
    ];
  });
  const figures: [string, string][] = he
    ? [
        ['450 מ״ר', 'שטח כיסוי'],
        ['5.8 Gbps', 'מהירות שיא'],
        ['200', 'מכשירים במקביל'],
      ]
    : [
        ['450 m²', 'coverage'],
        ['5.8 Gbps', 'top speed'],
        ['200', 'devices at once'],
      ];
  const columns = [
    [120, 200],
    [372, 250],
    [674, 210],
  ] as const;
  const figureEls = figures.flatMap(([value, label], i) => {
    const [x, w] = columns[i]!;
    return [
      ...(i > 0
        ? [shape({ frame: at(lang, x - 27, 704, 2, 96), fill: fill('#9FB3CC', 0.6) })]
        : []),
      textBox({
        frame: at(lang, x, 690, w, 68),
        lines: [value],
        look: t(52, 700, ink),
        lang,
        dir: he && i > 0 ? 'ltr' : undefined,
        align: he && i > 0 ? 'end' : 'start',
      }),
      textBox({ frame: at(lang, x, 760, w, 40), lines: [label], look: t(24, 400, grey), lang }),
    ];
  });
  return slide({ fill: radial(0.7, 0.58, ['#FFFFFF', 0], ['#EEF3F8', 0.5], ['#D8E2EC', 1]) }, [
    shape({
      frame: at(lang, 1010, 160, 900, 820),
      preset: 'ellipse',
      fill: radial(0.5, 0.5, ['#FFFFFF', 0, 0.9], ['#FFFFFF', 0.7, 0]),
    }),
    art(
      { x: pic.x, y: pic.y, w: pic.w, h: pic.h },
      // The rings fade out toward the copy, on the left in English and on the right in Hebrew.
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MESH_PIC.w} ${MESH_PIC.h}" width="${MESH_PIC.w}" height="${MESH_PIC.h}"><defs><linearGradient id="f" x1="${he ? 1 : 0}" x2="${he ? 0 : 1}" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${he ? 0.26 : 0.2}" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${MESH_PIC.w}" height="${MESH_PIC.h}"><rect width="${MESH_PIC.w}" height="${MESH_PIC.h}" fill="url(#f)"/></mask></defs><g mask="url(#m)">${rings.join('')}</g></svg>`,
      'Signal rings',
    ),
    picture(pic, he ? 'שלוש יחידות רשת Wi-Fi לבנות' : 'Three white mesh Wi-Fi nodes', {
      fit: 'contain',
    }),
    ...cardEls,
    textBox({
      frame: at(lang, 120, 178, 640, 44),
      lines: [he ? 'CANOPY  ·  רשת Wi-Fi 7 לבית' : 'CANOPY MESH  ·  WI-FI 7'],
      look: t(26, 700, deep, he ? 1 : 4),
      lang,
    }),
    textBox({
      frame: at(lang, 120, 218, 720, 252),
      lines: he
        ? [[piece('קליטה מלאה', t(100, 800, ink))], [piece('בכל חדר בבית', t(100, 800, blue))]]
        : [[piece('Fast Wi-Fi', t(96, 700, ink))], [piece('in every room', t(96, 700, blue))]],
      look: t(96, 700, ink),
      lang,
      lineHeight: 1.04,
    }),
    textBox({
      frame: at(lang, 120, 484, 640, 136),
      lines: he
        ? [
            'שלוש יחידות קטנות חולקות רשת אחת,',
            'כך שגם החדר הרחוק בבית מקבל',
            'את המהירות של הראוטר.',
          ]
        : [
            'Three small nodes share one network,',
            'so the far bedroom gets the same',
            'speed as the router.',
          ],
      look: t(30, 400, grey),
      lang,
      lineHeight: 1.45,
    }),
    ...figureEls,
    shape({
      frame: at(lang, 120, 872, 300, 76),
      fill: fill(blue),
      round: 0.5,
      shadow: { x: 0, y: 12, blur: 28, color: blue, alpha: 0.3 },
      label: { text: he ? 'לצפייה בהשקה' : 'Watch the launch', look: t(28, 700, '#FFFFFF'), lang },
    }),
    textBox({
      frame: at(lang, 452, 868, 330, 84),
      lines: he
        ? ['שידור חי מהבמה', '19.1.2027  ·  19:00']
        : ['Live from the stage', '19.1.2027  ·  19:00'],
      look: t(24, 400, grey),
      lang,
      lineHeight: 1.3,
    }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-homebattery: a feature highlight. A wall battery glows on a night-blue wall; the copy and a
// drawn day of energy (the sun's curve by day, the battery's plateau by night) tell what it does.

/** Where the picture lies in the English slide; its drawing is 800x1040 page pixels, shown at 110%. */
const BATTERY_PIC = { x: 80, y: -40, w: 880, h: 1144 };
/** The top of the lit part of the light bar, in the picture (x) and on the slide (y). */
const CHARGE_X = 474;
const CHARGE_Y = 445;

/** The day of energy: hours 6..30 across 800, power up to 200. */
function energyChart(): string {
  const x = (h: number) => ((h - 6) / 24) * 800;
  const base = 196;
  const sun: string[] = [];
  for (let h = 6; h <= 19.5; h += 0.25) {
    const v = Math.exp(-(((h - 12.75) / 3.1) ** 2)) * 168;
    sun.push(`${x(h).toFixed(1)} ${(base - v).toFixed(1)}`);
  }
  const store: string[] = [];
  for (let h = 16.5; h <= 30; h += 0.25) {
    const rise = 1 / (1 + Math.exp(-(h - 18.4) * 2.4));
    const fall = 1 - 0.18 * Math.max(0, (h - 22) / 8);
    const v = 62 * rise * fall + (h > 22.5 && h < 24 ? 0 : 0);
    store.push(`${x(h).toFixed(1)} ${(base - v).toFixed(1)}`);
  }
  const now = x(21.67);
  const nowV =
    62 * (1 / (1 + Math.exp(-(21.67 - 18.4) * 2.4))) * (1 - 0.18 * Math.max(0, (21.67 - 22) / 8));
  const grid = [12, 18, 24]
    .map(
      (h) =>
        `<line x1="${x(h)}" y1="12" x2="${x(h)}" y2="${base}" stroke="#FFFFFF" stroke-opacity=".08" stroke-width="2"/>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 210" width="800" height="210">` +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD36B" stop-opacity=".42"/><stop offset="1" stop-color="#FFD36B" stop-opacity=".02"/></linearGradient>` +
    `<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FF8F3A" stop-opacity=".6"/><stop offset="1" stop-color="#FF8F3A" stop-opacity=".06"/></linearGradient></defs>` +
    grid +
    `<path d="M${sun[0]} L${sun.join(' L')} L${x(19.5)} ${base} Z" fill="url(#s)"/>` +
    `<path d="M${sun.join(' L')}" fill="none" stroke="#FFD36B" stroke-width="3.5" stroke-linecap="round"/>` +
    `<path d="M${store[0]} L${store.join(' L')} L800 ${base} L${x(16.5)} ${base} Z" fill="url(#b)"/>` +
    `<path d="M${store.join(' L')}" fill="none" stroke="#FF9A45" stroke-width="3.5" stroke-linecap="round"/>` +
    `<line x1="0" y1="${base}" x2="800" y2="${base}" stroke="#FFFFFF" stroke-opacity=".28" stroke-width="2"/>` +
    `<line x1="${now}" y1="20" x2="${now}" y2="${base}" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="2" stroke-dasharray="4 6"/>` +
    `<circle cx="${now}" cy="${base - nowV}" r="9" fill="#FF9A45" stroke="#0E1424" stroke-width="4"/>` +
    `</svg>`
  );
}

function homebattery(lang: Lang) {
  const he = lang === 'he';
  const t = looks(he ? 'Rubik' : 'Space Grotesk');
  const white = '#F5F3EE';
  const amber = '#FFB057';
  const muted = '#AEB6C9';
  // In Hebrew the unit moves 50px in from its mirrored place, to leave its callout room outside it.
  const shift = he ? -50 : 0;
  const pic = {
    ...at(lang, BATTERY_PIC.x, BATTERY_PIC.y, BATTERY_PIC.w, BATTERY_PIC.h),
    x: X(lang, BATTERY_PIC.x, BATTERY_PIC.w) + shift,
  };
  const col = 1000;
  const chartY = 560;
  // The chart reads left to right in both languages, as time does on a clock face.
  const chartX = X(lang, col, 800);
  const hours = ['06:00', '12:00', '18:00', '24:00', '06:00'];
  const hourEls = hours.map((h, i) =>
    textBox({
      frame: {
        x: chartX + i * 200 - (i === 0 ? 0 : i === 4 ? 120 : 60),
        y: chartY + 214,
        w: 120,
        h: 36,
      },
      lines: [h],
      look: t(24, 400, muted),
      lang,
      dir: 'ltr',
      align: i === 0 ? 'start' : i === 4 ? 'end' : 'center',
    }),
  );
  const tag = (text: string, x: number, y: number, color: string) =>
    textBox({
      frame: { x: chartX + x, y: chartY + y, w: 180, h: 36 },
      lines: [text],
      look: t(24, 600, color),
      lang,
      dir: he ? 'rtl' : 'ltr',
      align: 'center',
    });
  const figures: [string, string, string][] = he
    ? [
        ['13.5', ' קוט״ש', 'קיבולת'],
        ['7', ' קילוואט', 'הספק שיא'],
        ['92', '%', 'נצילות'],
        ['10', ' שנים', 'אחריות'],
      ]
    : [
        ['13.5', ' kWh', 'storage'],
        ['7', ' kW', 'peak power'],
        ['92', '%', 'efficiency'],
        ['10', ' yrs', 'warranty'],
      ];
  const figureEls = figures.flatMap(([value, unit, label], i) => {
    const x = col + i * 200;
    return [
      textBox({
        frame: at(lang, x, 870, 196, 64),
        lines: [[piece(value, t(48, 700, white)), piece(unit, t(26, 500, amber))]],
        look: t(48, 700, white),
        lang,
      }),
      textBox({ frame: at(lang, x, 934, 196, 40), lines: [label], look: t(24, 400, muted), lang }),
    ];
  });
  return slide({ fill: linear(160, ['#0A0F1D', 0], ['#111A30', 0.55], ['#17152A', 1]) }, [
    shape({
      frame: at(lang, -260, -200, 1300, 1400),
      preset: 'ellipse',
      fill: radial(0.5, 0.5, ['#3A4C7A', 0, 0.45], ['#3A4C7A', 0.7, 0]),
    }),
    shape({
      frame: { ...at(lang, 190, 120, 760, 920), x: X(lang, 190, 760) + shift },
      preset: 'ellipse',
      fill: radial(0.5, 0.5, ['#FF9A3C', 0, 0.34], ['#FF9A3C', 0.4, 0.12], ['#FF9A3C', 0.7, 0]),
    }),
    picture(
      pic,
      he
        ? 'סוללה ביתית תלויה על הקיר, עם פס אור כתום'
        : 'A wall-mounted home battery with an amber light bar',
      { fit: 'contain' },
    ),
    textBox({
      frame: at(lang, col, 112, 800, 44),
      lines: [he ? 'DUSK 13  ·  סוללה ביתית לסולארי' : 'DUSK 13  ·  HOME BATTERY'],
      look: t(26, 600, amber, he ? 1 : 4),
      lang,
    }),
    textBox({
      frame: at(lang, col, 160, 820, 240),
      lines: he
        ? [[piece('אור השמש,', t(100, 700, white))], [piece('גם אחרי השקיעה', t(100, 700, amber))]]
        : [[piece('Sunshine,', t(104, 700, white))], [piece('after dark', t(104, 700, amber))]],
      look: t(104, 700, white),
      lang,
      lineHeight: 1.04,
    }),
    textBox({
      frame: at(lang, col, 420, 800, 96),
      lines: he
        ? ['אוגרת את מה שהפאנלים מייצרים בצהריים', 'ומפעילה את הבית לאורך כל הלילה.']
        : ['Stores what your panels make at noon', 'and runs the house through the night.'],
      look: t(30, 400, muted),
      lang,
      lineHeight: 1.45,
    }),
    // The charge the light bar shows, called out beside the unit; the chart marks the same moment.
    // The picture is not mirrored, so the callout stands on the outer side of the unit in each.
    rule(
      he ? [1580, CHARGE_Y] : [332, CHARGE_Y],
      [pic.x + CHARGE_X, CHARGE_Y],
      { color: { value: amber, alpha: 0.85 }, width: 2 },
      { end: 'circle' },
    ),
    textBox({
      frame: he
        ? { x: 1592, y: CHARGE_Y - 42, w: 210, h: 84 }
        : { x: 110, y: CHARGE_Y - 42, w: 210, h: 84 },
      lines: ['82%'],
      look: t(64, 700, amber),
      lang,
      dir: 'ltr',
      align: he ? 'start' : 'end',
    }),
    textBox({
      frame: he
        ? { x: 1592, y: CHARGE_Y + 42, w: 210, h: 80 }
        : { x: 110, y: CHARGE_Y + 42, w: 210, h: 80 },
      lines: he ? ['עדיין בסוללה', 'ב־21:40'] : ['still stored', 'at 21:40'],
      look: t(24, 400, muted),
      lang,
      align: 'end',
      lineHeight: 1.3,
    }),
    art({ x: chartX, y: chartY, w: 800, h: 210 }, energyChart(), 'A day of energy'),
    textBox({
      frame: { x: chartX + 522 - 70, y: chartY - 26, w: 140, h: 36 },
      lines: ['21:40'],
      look: t(24, 600, white),
      lang,
      dir: 'ltr',
      align: 'center',
    }),
    tag(he ? 'שמש' : 'Solar', 255, 14, '#FFD36B'),
    tag(he ? 'סוללה' : 'Battery', 560, 88, '#FFB057'),
    ...hourEls,
    shape({ frame: at(lang, col, 846, 800, 2), fill: fill('#FFFFFF', 0.12) }),
    ...figureEls,
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-keyboard: a pre-order. A silver 75% keyboard with chalk, charcoal and orange keycaps lies on
// a cobalt field; three caps float off their switches. Headline top left, price and button top
// right, the board's main features as chips in the corner the board leaves free.

/** Where the picture lies in the English slide; its drawing is 1400x900 page pixels, at 115%. */
const KEYBOARD_PIC = { x: 340, y: 228, w: 1610, h: 1035 };

function keyboard(lang: Lang) {
  const he = lang === 'he';
  const t = looks(he ? 'Assistant' : 'Poppins');
  const display = looks(he ? 'Secular One' : 'Poppins');
  const white = '#FFFFFF';
  const peach = '#FFC7A8';
  const light = '#FFDCC8';
  const soft = '#E6EBFF';
  const cobalt = '#2342E8';
  const pic = at(lang, KEYBOARD_PIC.x, KEYBOARD_PIC.y, KEYBOARD_PIC.w, KEYBOARD_PIC.h);
  const chips = he
    ? ['75%  ·  84 מקשים', 'מתגים טקטיליים שקטים', 'החלפת מתגים בלי הלחמה', 'Bluetooth + 2.4 GHz']
    : ['75%  ·  84 keys', 'Silent tactile switches', 'Hot-swap sockets', 'Bluetooth + 2.4 GHz'];
  const chipEls = chips.map((text, i) =>
    shape({
      frame: at(lang, 120, 640 + i * 78, 300, 60),
      fill: fill('#FFFFFF', 0.08),
      round: 0.5,
      stroke: { color: { value: '#FFFFFF', alpha: 0.42 }, width: 2 },
      label: { text, look: t(24, 600, white), lang },
    }),
  );
  return slide({ fill: linear(155, ['#2C4AF2', 0], ['#2240E0', 0.5], ['#172BAE', 1]) }, [
    shape({
      frame: at(lang, 420, 360, 1500, 760),
      preset: 'ellipse',
      fill: radial(0.5, 0.5, ['#FFFFFF', 0, 0.2], ['#FFFFFF', 0.65, 0]),
    }),
    picture(
      pic,
      he
        ? 'מקלדת מכנית בגוף אלומיניום, שלושה מקשים מורמים מעל המתגים'
        : 'A mechanical keyboard in aluminium, three keycaps lifted off their switches',
      { fit: 'contain' },
    ),
    textBox({
      frame: at(lang, 120, 100, 800, 44),
      lines: [he ? 'FERRO 75  ·  בהזמנה מוקדמת' : 'FERRO 75  ·  PRE-ORDER'],
      look: t(26, 700, light, he ? 1 : 4),
      lang,
    }),
    textBox({
      frame: at(lang, 120, 140, 1000, 266),
      lines: he
        ? [
            [piece('מקשים שקטים,', display(112, 400, white))],
            [piece('רעיונות רועשים.', display(112, 400, peach))],
          ]
        : [
            [piece('Quiet keys,', display(104, 700, white))],
            [piece('loud ideas.', display(104, 700, peach))],
          ],
      look: display(104, 700, white),
      lang,
      lineHeight: he ? 1.0 : 1.04,
    }),
    // In Hebrew the lead keeps to three short lines, clear of the lifted key beside it.
    textBox({
      frame: he ? at(lang, 120, 404, 420, 138) : at(lang, 120, 412, 780, 96),
      lines: he
        ? ['גוף אלומיניום, תושבת גומי', 'ומתגים טקטיליים שקטים.', 'כל הרעיונות, בלי הרעש.']
        : [
            'An aluminium board on soft gaskets, with silent',
            'tactile switches. All the ideas, none of the clatter.',
          ],
      look: t(30, 400, soft),
      lang,
      lineHeight: 1.45,
    }),
    textBox({
      frame: at(lang, 1420, 84, 380, 132),
      lines: [he ? '₪690' : '$189'],
      look: he ? t(96, 800, white) : display(96, 700, white),
      lang,
      dir: 'ltr',
      align: he ? 'start' : 'end',
    }),
    textBox({
      frame: at(lang, 1420, 206, 380, 40),
      lines: [he ? 'משלוחים מ־3.3.2027' : 'Ships from 3.3.2027'],
      look: t(24, 400, soft),
      lang,
      align: 'end',
    }),
    shape({
      frame: at(lang, 1540, 266, 260, 76),
      fill: fill(white),
      round: 0.5,
      shadow: { x: 0, y: 14, blur: 30, color: '#0B1670', alpha: 0.35 },
      label: { text: he ? 'להזמנה מוקדמת' : 'Pre-order', look: t(28, 700, cobalt), lang },
    }),
    ...chipEls,
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-passkey: a comparison. A black security key and its ivory spare float on a pale ground; on
// the other side, a table sets the old way (a password and a text-message code) against the key,
// whose column is a solid green panel.

/** Where the picture lies in the English slide; its drawing is 900x1000 page pixels. */
const PASSKEY_PIC = { x: 40, y: 60, w: 900, h: 1000 };

const check = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" width="34" height="34"><circle cx="17" cy="17" r="16" fill="${color}"/><path d="M10 17.5l4.6 4.6L24.5 12" fill="none" stroke="#0F6B47" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const cross = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" width="34" height="34"><circle cx="17" cy="17" r="15.5" fill="none" stroke="#B4473A" stroke-width="2.5"/><path d="M12 12l10 10M22 12l-10 10" stroke="#B4473A" stroke-width="3" stroke-linecap="round"/></svg>`;

function passkey(lang: Lang) {
  const he = lang === 'he';
  const t = looks(he ? 'IBM Plex Sans Hebrew' : 'Inter');
  const ink = '#15171A';
  const green = '#0F6B47';
  const grey = '#565B61';
  const pic = at(lang, PASSKEY_PIC.x, PASSKEY_PIC.y, PASSKEY_PIC.w, PASSKEY_PIC.h);
  const labelX = 980;
  const colA = [1380, 230] as const;
  const colB = [1620, 180] as const;
  const top = 588;
  const rowH = 80;
  const rows: [string, string | null, string | null][] = he
    ? [
        ['חוסם פישינג', null, null],
        ['זמן התחברות', '25 שנ׳', '2 שנ׳'],
        ['מה צריך לזכור', '14 סיסמאות', 'כלום'],
        ['עובד בלי טלפון', null, null],
      ]
    : [
        ['Stops phishing', null, null],
        ['Sign-in time', '25 s', '2 s'],
        ['To remember', '14 passwords', 'Nothing'],
        ['Works with no phone', null, null],
      ];
  const cell = (x: number, w: number, y: number, value: string | null, good: boolean) =>
    value === null
      ? art(
          at(lang, x + w / 2 - 17, y + rowH / 2 - 17, 34, 34),
          good ? check('#FFFFFF') : cross,
          good ? 'Yes' : 'No',
        )
      : textBox({
          frame: at(lang, x, y + 16, w, 48),
          lines: [value],
          look: t(28, good ? 700 : 500, good ? '#FFFFFF' : grey),
          lang,
          align: 'center',
        });
  const rowEls = rows.flatMap(([label, a, b], i) => {
    const y = top + i * rowH;
    return [
      textBox({
        frame: at(lang, labelX, y + 16, 390, 48),
        lines: [label],
        look: t(28, 500, ink),
        lang,
      }),
      cell(colA[0], colA[1], y, a, false),
      cell(colB[0], colB[1], y, b, true),
      shape({
        frame: at(lang, labelX, y + rowH - 1, colA[0] + colA[1] - labelX, 2),
        fill: fill('#D3D6D2'),
      }),
      ...(i < rows.length - 1
        ? [
            shape({
              frame: at(lang, colB[0] + 18, y + rowH - 1, colB[1] - 36, 2),
              fill: fill('#FFFFFF', 0.18),
            }),
          ]
        : []),
    ];
  });
  return slide({ fill: linear(180, ['#F4F4F1', 0], ['#E9EAE6', 1]) }, [
    shape({
      frame: at(lang, 0, 80, 980, 900),
      preset: 'ellipse',
      fill: radial(0.5, 0.5, ['#FFFFFF', 0, 0.95], ['#FFFFFF', 0.68, 0]),
    }),
    picture(
      pic,
      he ? 'מפתח אבטחה שחור ומפתח גיבוי לבן' : 'A black security key and its ivory spare',
      { fit: 'contain' },
    ),
    textBox({
      frame: at(lang, PASSKEY_PIC.x + 150, 878, 600, 44),
      lines: [
        he ? 'שחור לצרור המפתחות, לבן למגירה.' : 'Black for your keyring, ivory for the drawer.',
      ],
      look: t(24, 400, grey),
      lang,
      align: 'center',
    }),
    textBox({
      frame: at(lang, labelX, 104, 820, 44),
      lines: [he ? 'SEAL K2  ·  מפתח כניסה פיזי' : 'SEAL K2  ·  HARDWARE PASSKEY'],
      look: t(26, 700, green, he ? 1 : 3),
      lang,
    }),
    textBox({
      frame: at(lang, labelX, 148, 840, 214),
      lines: he
        ? [[piece('נגיעה אחת', t(90, 700, ink))], [piece('מנצחת כל סיסמה', t(90, 700, green))]]
        : [
            [piece('One touch beats', t(84, 800, ink))],
            [piece('every password', t(84, 800, green))],
          ],
      look: t(84, 800, ink),
      lang,
      lineHeight: 1.08,
    }),
    textBox({
      frame: at(lang, labelX, 382, 820, 96),
      lines: he
        ? ['נוגעים ומתחברים. אין מה להקליד,', 'ואין מה לגנוב בדף התחברות מזויף.']
        : ['Tap to sign in. Nothing to type,', 'nothing for a fake page to steal.'],
      look: t(30, 400, grey),
      lang,
      lineHeight: 1.45,
    }),
    shape({
      frame: at(lang, colB[0], 506, colB[1], 412),
      fill: fill(green),
      round: 0.1,
      shadow: { x: 0, y: 18, blur: 40, color: green, alpha: 0.28 },
    }),
    textBox({
      frame: at(lang, colA[0], 524, colA[1], 48),
      lines: [he ? 'סיסמה + SMS' : 'Password + SMS'],
      look: t(24, 600, grey),
      lang,
      align: 'center',
    }),
    textBox({
      frame: at(lang, colB[0], 524, colB[1], 48),
      lines: ['SEAL K2'],
      look: t(24, 700, '#FFFFFF'),
      lang,
      align: 'center',
    }),
    ...rowEls,
    textBox({
      frame: at(lang, labelX, 940, 820, 44),
      lines: [
        he
          ? 'החל מ־₪149  ·  עובד עם יותר מ־1,200 אתרים ואפליקציות'
          : 'From $39  ·  works with 1,200+ apps',
      ],
      look: t(24, 500, grey),
      lang,
    }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-ereader: a spec sheet set like a book's title page. An ink-blue reader stands in the middle of
// warm paper, its screen open on an engraved chapter opener; six specs flank it in two columns,
// each with a hairline to the device, inside a thin double frame. Price and date sit under the
// columns, the price under the one read first.

/** Where the picture lies in both slides (the reader is centred); its drawing is 900x1000 page pixels, at 90%. */
const EREADER_PIC = { x: 555, y: 200, w: 810, h: 900 };
/** The reader's edges on the slide. */
const READER = { left: 699, right: 1220, top: 331, bottom: 1001 };

function ereader(lang: Lang) {
  const he = lang === 'he';
  const serif = looks(he ? 'Frank Ruhl Libre' : 'Playfair Display');
  const sans = looks(he ? 'Assistant' : 'Inter');
  const ink = '#1E2329';
  const rust = '#9C4426';
  const grey = '#5E5A52';
  const specs: [string, string][][] = he
    ? [
        [
          ['מסך', '7″ · 300 ppi'],
          ['מקשי דפדוף', '2, בצד האחיזה'],
          ['סוללה', '8 שבועות'],
        ],
        [
          ['משקל', '182 גרם'],
          ['עובי', '6.2 מ״מ'],
          ['עמידות במים', 'IPX8'],
        ],
      ]
    : [
        [
          ['SCREEN', '7″ · 300 ppi'],
          ['PAGE-TURN KEYS', '2, on the grip'],
          ['BATTERY', '8 weeks'],
        ],
        [
          ['WEIGHT', '182 g'],
          ['THICKNESS', '6.2 mm'],
          ['WATERPROOF', 'IPX8'],
        ],
      ];
  // The specs stand on the side of the reader they point to, in both languages (the picture is
  // not mirrored): the screen, the page-turn keys on the grip and the battery on its left, the
  // rest on its right. Each column is set toward the reader, and each hairline ends on it.
  const ends = [
    [820, READER.left + 40, READER.left + 16],
    [READER.right - 14, READER.right - 4, READER.right - 14],
  ];
  const rows = [418, 588, 758];
  const specEls = specs.flatMap((column, c) =>
    column.flatMap(([label, value], r) => {
      const x = c === 0 ? 120 : 1320;
      const toward = c === 0 ? (he ? 'start' : 'end') : he ? 'end' : 'start';
      const towardLtr = c === 0 ? 'end' : 'start';
      const lineY = rows[r]! + 78;
      return [
        textBox({
          frame: { x, y: rows[r]!, w: 480, h: 40 },
          lines: [label],
          look: sans(24, 600, rust, he ? 0 : 3),
          lang,
          align: toward,
        }),
        textBox({
          frame: { x, y: rows[r]! + 40, w: 480, h: 72 },
          lines: [value],
          look: serif(50, he ? 500 : 600, ink),
          lang,
          align: toward,
          ...(value.startsWith('7') || value === 'IPX8'
            ? { dir: 'ltr' as const, align: towardLtr }
            : {}),
        }),
        rule(
          [c === 0 ? 616 : 1304, lineY],
          [ends[c]![r]!, lineY],
          { color: { value: rust, alpha: 0.75 }, width: 2 },
          { end: 'circle' },
        ),
      ];
    }),
  );
  const frameRule = (inset: number, alpha: number, width: number) =>
    shape({
      frame: { x: inset, y: inset, w: 1920 - inset * 2, h: 1080 - inset * 2 },
      fill: fill('#FFFFFF', 0),
      stroke: { color: { value: ink, alpha }, width },
    });
  return slide({ fill: radial(0.5, 0.62, ['#F7F2E9', 0], ['#EFE7DA', 0.6], ['#E6DCCB', 1]) }, [
    frameRule(40, 0.5, 2),
    frameRule(52, 0.25, 1),
    shape({
      frame: { x: 555, y: 300, w: 810, h: 760 },
      preset: 'ellipse',
      fill: radial(0.5, 0.5, ['#FFFFFF', 0, 0.75], ['#FFFFFF', 0.7, 0]),
    }),
    picture(
      EREADER_PIC,
      he
        ? 'קורא ספרים אלקטרוני בכחול כהה, על מסכו פתיחת פרק עם מגדלור'
        : 'An ink-blue e-reader showing an engraved chapter opener with a lighthouse',
      { fit: 'contain' },
    ),
    textBox({
      frame: { x: 360, y: 92, w: 1200, h: 44 },
      lines: [he ? 'FOLIO 7  ·  מפרט טכני' : 'FOLIO 7  ·  TECH SPECS'],
      look: sans(26, 700, rust, he ? 1 : 5),
      lang,
      align: 'center',
    }),
    textBox({
      frame: { x: 160, y: 138, w: 1600, h: 120 },
      lines: he
        ? [[piece('ספרייה שלמה, ', serif(84, 700, ink)), piece('ב־182 גרם', serif(84, 400, rust))]]
        : [
            [
              piece('A whole library, ', serif(80, 600, ink)),
              piece('in 182 grams', { ...serif(80, 500, rust), italic: true }),
            ],
          ],
      look: serif(80, 600, ink),
      lang,
      align: 'center',
    }),
    ...specEls,
    textBox({
      frame: at(lang, 120, 900, 480, 84),
      lines: [he ? '₪590' : '$169'],
      look: serif(64, 700, ink),
      lang,
      dir: 'ltr',
      align: he ? 'start' : 'end',
    }),
    textBox({
      frame: at(lang, 1320, 912, 480, 64),
      lines: [he ? 'בחנויות מ־4.3.2027' : 'In stores 4.3.2027'],
      look: sans(28, 500, grey),
      lang,
    }),
  ]);
}

export const designs: DesignEntry[] = [
  {
    id: 'm-meshwifi',
    group: 'techproduct',
    name: { he: 'השקת רשת ביתית', en: 'Mesh Wi-Fi launch' },
    subject: [MESH_PIC.x + MESH_PIC.w / 2, MESH_PIC.y + 420],
    he: meshwifi('he'),
    en: meshwifi('en'),
  },
  {
    id: 'm-homebattery',
    group: 'techproduct',
    name: { he: 'סוללה ביתית לסולארי', en: 'Home solar battery' },
    subject: [BATTERY_PIC.x + BATTERY_PIC.w / 2, BATTERY_PIC.y + 600],
    he: homebattery('he'),
    en: homebattery('en'),
  },
  {
    id: 'm-keyboard',
    group: 'techproduct',
    name: { he: 'הזמנה מוקדמת למקלדת', en: 'Keyboard pre-order' },
    subject: [KEYBOARD_PIC.x + KEYBOARD_PIC.w / 2, KEYBOARD_PIC.y + 506],
    he: keyboard('he'),
    en: keyboard('en'),
  },
  {
    id: 'm-passkey',
    group: 'techproduct',
    name: { he: 'מפתח אבטחה מול סיסמה', en: 'Passkey vs password' },
    subject: [PASSKEY_PIC.x + PASSKEY_PIC.w / 2, PASSKEY_PIC.y + 440],
    he: passkey('he'),
    en: passkey('en'),
  },
  {
    id: 'm-ereader',
    group: 'techproduct',
    name: { he: 'מפרט קורא ספרים', en: 'E-reader spec sheet' },
    subject: [960, 660],
    he: ereader('he'),
    en: ereader('en'),
  },
];
