// Ready-made slides of the `techproduct` topic (מוצר טכנולוגי): five products, each in a slide of
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
const at = (lang: Lang, x: number, y: number, w: number, h: number): Frame => ({ x: X(lang, x, w), y, w, h });
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
  { top: [560, 285], rings: [[561, 744, 198, 58], [562, 750, 298, 88], [562, 758, 410, 122]] },
  { top: [281, 238], rings: [[290, 646, 176, 46], [290, 649, 264, 69], [290, 655, 364, 96]] },
  { top: [867, 216], rings: [[860, 600, 166, 40], [860, 603, 249, 61], [860, 607, 344, 85]] },
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
  const cards = he
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
      rule([cx, y + cardH], [cx, ty - 8], { color: { value: blue, alpha: 0.55 }, width: 2, dash: 'dotted', cap: 'round' }, { end: 'circle' }),
      shape({
        frame: { x, y, w: cardW, h: cardH },
        fill: fill('#FFFFFF', 0.92),
        round: 0.22,
        stroke: { color: { value: '#FFFFFF' }, width: 1.5 },
        shadow: { x: 0, y: 14, blur: 34, color: '#1E3A6B', alpha: 0.16 },
      }),
      shape({ frame: { x: he ? x + cardW - pad - 12 : x + pad, y: y + 26, w: 12, h: 12 }, preset: 'ellipse', fill: fill('#38BDF8'), shadow: { x: 0, y: 0, blur: 10, color: '#38BDF8', alpha: 0.9 } }),
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
  const figures = he
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
      ...(i > 0 ? [shape({ frame: at(lang, x - 27, 704, 2, 96), fill: fill('#9FB3CC', 0.6) })] : []),
      textBox({ frame: at(lang, x, 690, w, 68), lines: [value], look: t(52, 700, ink), lang, dir: he && i > 0 ? 'ltr' : undefined, align: he && i > 0 ? 'end' : 'start' }),
      textBox({ frame: at(lang, x, 760, w, 40), lines: [label], look: t(24, 400, grey), lang }),
    ];
  });
  return slide({ fill: radial(0.7, 0.58, ['#FFFFFF', 0], ['#EEF3F8', 0.5], ['#D8E2EC', 1]) }, [
    shape({ frame: at(lang, 1010, 160, 900, 820), preset: 'ellipse', fill: radial(0.5, 0.5, ['#FFFFFF', 0, 0.9], ['#FFFFFF', 0.7, 0]) }),
    art(
      { x: pic.x, y: pic.y, w: pic.w, h: pic.h },
      // The rings fade out toward the copy, on the left in English and on the right in Hebrew.
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MESH_PIC.w} ${MESH_PIC.h}" width="${MESH_PIC.w}" height="${MESH_PIC.h}"><defs><linearGradient id="f" x1="${he ? 1 : 0}" x2="${he ? 0 : 1}" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="${he ? 0.26 : 0.2}" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="${MESH_PIC.w}" height="${MESH_PIC.h}"><rect width="${MESH_PIC.w}" height="${MESH_PIC.h}" fill="url(#f)"/></mask></defs><g mask="url(#m)">${rings.join('')}</g></svg>`,
      'Signal rings',
    ),
    picture(pic, he ? 'שלוש יחידות רשת Wi-Fi לבנות' : 'Three white mesh Wi-Fi nodes', { fit: 'contain' }),
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
        ? ['שלוש יחידות קטנות חולקות רשת אחת,', 'כך שגם החדר הרחוק בבית מקבל', 'את המהירות של הראוטר.']
        : ['Three small nodes share one network,', 'so the far bedroom gets the same', 'speed as the router.'],
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
      lines: he ? ['שידור חי מהבמה', '19.1.2027  ·  19:00'] : ['Live from the stage', '19.1.2027  ·  19:00'],
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
  const nowV = 62 * (1 / (1 + Math.exp(-(21.67 - 18.4) * 2.4))) * (1 - 0.18 * Math.max(0, (21.67 - 22) / 8));
  const grid = [12, 18, 24]
    .map((h) => `<line x1="${x(h)}" y1="12" x2="${x(h)}" y2="${base}" stroke="#FFFFFF" stroke-opacity=".08" stroke-width="2"/>`)
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
  const pic = at(lang, BATTERY_PIC.x, BATTERY_PIC.y, BATTERY_PIC.w, BATTERY_PIC.h);
  const col = 1000;
  const chartY = 560;
  // The chart reads left to right in both languages, as time does on a clock face.
  const chartX = X(lang, col, 800);
  const hours = ['06:00', '12:00', '18:00', '24:00', '06:00'];
  const hourEls = hours.map((h, i) =>
    textBox({
      frame: { x: chartX + i * 200 - (i === 0 ? 0 : i === 4 ? 120 : 60), y: chartY + 214, w: 120, h: 36 },
      lines: [h],
      look: t(24, 400, muted),
      lang,
      dir: 'ltr',
      align: i === 0 ? 'start' : i === 4 ? 'end' : 'center',
    }),
  );
  const tag = (text: string, x: number, y: number, color: string) =>
    textBox({ frame: { x: chartX + x, y: chartY + y, w: 180, h: 36 }, lines: [text], look: t(24, 600, color), lang, dir: he ? 'rtl' : 'ltr', align: 'center' });
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
    shape({ frame: at(lang, -260, -200, 1300, 1400), preset: 'ellipse', fill: radial(0.5, 0.5, ['#3A4C7A', 0, 0.45], ['#3A4C7A', 0.7, 0]) }),
    shape({ frame: at(lang, 190, 120, 760, 920), preset: 'ellipse', fill: radial(0.5, 0.5, ['#FF9A3C', 0, 0.34], ['#FF9A3C', 0.4, 0.12], ['#FF9A3C', 0.7, 0]) }),
    picture(pic, he ? 'סוללה ביתית תלויה על הקיר, עם פס אור כתום' : 'A wall-mounted home battery with an amber light bar', { fit: 'contain' }),
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
    art({ x: chartX, y: chartY, w: 800, h: 210 }, energyChart(), 'A day of energy'),
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
const KEYBOARD_PIC = { x: 300, y: 270, w: 1610, h: 1035 };

function keyboard(lang: Lang) {
  const he = lang === 'he';
  const t = looks(he ? 'Assistant' : 'Poppins');
  const display = looks(he ? 'Secular One' : 'Poppins');
  const white = '#FFFFFF';
  const peach = '#FFC2A0';
  const soft = '#DCE3FF';
  const cobalt = '#2342E8';
  const pic = at(lang, KEYBOARD_PIC.x, KEYBOARD_PIC.y, KEYBOARD_PIC.w, KEYBOARD_PIC.h);
  const chips = he
    ? ['75%  ·  84 מקשים', 'מתגים טקטיליים שקטים', 'החלפת מתגים בלי הלחמה', 'Bluetooth + 2.4 GHz']
    : ['75%  ·  84 keys', 'Silent tactile switches', 'Hot-swap sockets', 'Bluetooth + 2.4 GHz'];
  const chipEls = chips.map((text, i) =>
    shape({
      frame: at(lang, 120, 640 + i * 78, 316, 60),
      fill: fill('#FFFFFF', 0.08),
      round: 0.5,
      stroke: { color: { value: '#FFFFFF', alpha: 0.42 }, width: 2 },
      label: { text, look: t(24, 600, white), lang },
    }),
  );
  return slide({ fill: linear(155, ['#3858FF', 0], ['#2342E8', 0.5], ['#182DB8', 1]) }, [
    shape({ frame: at(lang, 420, 360, 1500, 760), preset: 'ellipse', fill: radial(0.5, 0.5, ['#FFFFFF', 0, 0.2], ['#FFFFFF', 0.65, 0]) }),
    picture(pic, he ? 'מקלדת מכנית בגוף אלומיניום, שלושה מקשים מורמים מעל המתגים' : 'A mechanical keyboard in aluminium, three keycaps lifted off their switches', { fit: 'contain' }),
    textBox({
      frame: at(lang, 120, 100, 800, 44),
      lines: [he ? 'FERRO 75  ·  בהזמנה מוקדמת' : 'FERRO 75  ·  PRE-ORDER'],
      look: t(26, 700, peach, he ? 1 : 4),
      lang,
    }),
    textBox({
      frame: at(lang, 120, 146, 1000, 250),
      lines: he
        ? [[piece('מקשים שקטים,', display(112, 400, white))], [piece('רעיונות רועשים.', display(112, 400, peach))]]
        : [[piece('Quiet keys,', display(104, 700, white))], [piece('loud ideas.', display(104, 700, peach))]],
      look: display(104, 700, white),
      lang,
      lineHeight: he ? 1.0 : 1.04,
    }),
    textBox({
      frame: at(lang, 120, 412, 780, 96),
      lines: he
        ? ['מקלדת אלומיניום על תושבת גומי, עם מתגים', 'טקטיליים שקטים. כל הרעיונות, בלי הרעש.']
        : ['An aluminium board on soft gaskets, with silent', 'tactile switches. All the ideas, none of the clatter.'],
      look: t(30, 400, soft),
      lang,
      lineHeight: 1.45,
    }),
    textBox({
      frame: at(lang, 1420, 92, 380, 116),
      lines: [he ? '₪690' : '$189'],
      look: display(96, he ? 400 : 700, white),
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
];
