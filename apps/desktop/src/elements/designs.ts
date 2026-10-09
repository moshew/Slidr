import {
  createDeck,
  createElement,
  createSlide,
  richText,
  type AssetMeta,
  type Command,
  type CommandBus,
  type Element,
  type Fill,
  type SelectionStore,
  type Slide,
} from '@slidr/model';
import { designAssetUrl, previewAsset, previewAssetId } from './designAssets';

/** Complete, image-led compositions. Text and framing remain native, editable elements. */
export const DESIGN_IDS = [
  'possibility',
  'momentum',
  'wedding',
  'webinar',
  'conference',
  'workshop',
  'product',
  'sale',
  'testimonial',
  'thumbnail',
] as const;
export type DesignId = (typeof DESIGN_IDS)[number];

type Box = [x: number, y: number, w: number, h: number];
const frame = ([x, y, w, h]: Box) => ({ x, y, w, h });
const mirror = (box: Box, he: boolean): Box =>
  he ? [1920 - box[0] - box[2], box[1], box[2], box[3]] : box;
const ink = (value: string) => ({ value });
const solid = (value: string): Fill => ({ kind: 'solid', color: ink(value) });
const copy = (he: boolean, hebrew: string, english: string) => (he ? hebrew : english);

function shape(
  box: Box,
  value: string | Fill,
  options: {
    he?: boolean;
    radius?: number;
    opacity?: number;
    stroke?: string;
    strokeWidth?: number;
    rotation?: number;
    shadow?: { x: number; y: number; blur: number; color: string; alpha: number };
  } = {},
) {
  return createElement.shape({
    frame: frame(mirror(box, options.he ?? false)),
    geometry: { kind: 'preset', preset: options.radius ? 'roundRect' : 'rect' },
    fill: typeof value === 'string' ? solid(value) : value,
    ...(options.opacity ? { opacity: options.opacity } : {}),
    ...(options.rotation ? { rotation: options.rotation } : {}),
    ...(options.radius || options.shadow
      ? {
          effects: {
            ...(options.radius ? { radius: options.radius } : {}),
            ...(options.shadow
              ? {
                  shadow: {
                    x: options.shadow.x,
                    y: options.shadow.y,
                    blur: options.shadow.blur,
                    color: { value: options.shadow.color, alpha: options.shadow.alpha },
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(options.stroke
      ? { stroke: { color: ink(options.stroke), width: options.strokeWidth ?? 2 } }
      : {}),
  });
}

function gradient(he: boolean, color: string, strong = 0.96) {
  return shape([0, 0, 1920, 1080], {
    kind: 'css',
    value: `linear-gradient(${he ? 270 : 90}deg, rgba(${color},${strong}) 0%, rgba(${color},.86) 32%, rgba(${color},.18) 67%, transparent 88%)`,
  });
}

function words(
  content: string,
  box: Box,
  he: boolean,
  options: {
    size: number;
    weight?: number;
    color?: string;
    align?: 'start' | 'center' | 'end';
    font?: string;
    spacing?: number;
    italic?: boolean;
    rotation?: number;
    opacity?: number;
  },
) {
  return createElement.text({
    frame: frame(mirror(box, he)),
    autoFit: 'shrink',
    vAlign: 'middle',
    wrap: false,
    ...(options.rotation ? { rotation: options.rotation } : {}),
    ...(options.opacity ? { opacity: options.opacity } : {}),
    content: richText(content, {
      dir: he ? 'rtl' : 'ltr',
      align: options.align ?? 'start',
      marks: {
        size: options.size,
        weight: options.weight ?? 400,
        color: ink(options.color ?? '#172323'),
        ...(options.font ? { font: options.font } : {}),
        ...(options.spacing ? { letterSpacing: options.spacing } : {}),
        ...(options.italic ? { italic: true } : {}),
      },
    }),
  });
}

function photo(
  assetId: string,
  he: boolean,
  options: { flip?: boolean; box?: Box; contain?: boolean } = {},
) {
  return createElement.image({
    frame: frame(options.box ? mirror(options.box, he) : [0, 0, 1920, 1080]),
    assetId,
    fit: options.contain ? 'contain' : 'cover',
    ...((options.flip ?? he) ? { flipH: true } : {}),
    alt: 'Original editorial image for a designed slide',
  });
}

function rule(box: Box, he: boolean, color: string, opacity = 1) {
  return shape(box, color, { he, opacity });
}

function art(markup: string, he: boolean) {
  return createElement.svg({
    frame: frame([0, 0, 1920, 1080]),
    markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><g${he ? ' transform="translate(1920 0) scale(-1 1)"' : ''}>${markup}</g></svg>`,
  });
}

const burst = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><defs><radialGradient id="g" cx="51%" cy="50%" r="73%"><stop stop-color="#60d6f6"/><stop offset=".52" stop-color="#2c9bda"/><stop offset="1" stop-color="#2662b5"/></radialGradient><pattern id="dots" width="33" height="33" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="5" fill="#183b93" opacity=".48"/></pattern></defs><rect width="1920" height="1080" fill="url(#g)"/>${Array.from(
  { length: 40 },
  (_, i) => {
    const a = (i * Math.PI * 2) / 40;
    const b = a + Math.PI / 40;
    const x1 = Math.round(950 + 2300 * Math.cos(a));
    const y1 = Math.round(535 + 2300 * Math.sin(a));
    const x2 = Math.round(950 + 2300 * Math.cos(b));
    const y2 = Math.round(535 + 2300 * Math.sin(b));
    return `<path d="M950 535 ${x1} ${y1} ${x2} ${y2}Z" fill="${i % 3 === 0 ? '#134c9d' : '#b6effa'}" opacity="${i % 3 === 0 ? '.36' : '.1'}"/>`;
  },
).join(
  '',
)}<path d="M1010 0h910v310H1300zM0 875l390 205H0z" fill="url(#dots)"/><g stroke="#173b8e" stroke-width="7" opacity=".62"><path d="M5 30 600 341M0 190l590 250M0 318l430 154M1495 0l-293 300M1675 0l-351 310M1910 80l-400 247M1920 978l-440-230M1920 852l-376-165M1920 715l-330-91"/></g><g fill="#ffca14"><path d="m109 184 13 26 30 10-30 11-13 26-11-26-30-11 30-10z"/><path d="m1810 873 9 18 20 7-20 7-9 19-8-19-21-7 21-7z"/><path d="m1275 73 7 13 15 5-15 5-7 14-6-14-16-5 16-5z"/></g><g fill="#fff" opacity=".9"><path d="m1710 442 6 12 13 5-13 4-6 13-5-13-14-4 14-5z"/><circle cx="1053" cy="884" r="6"/><circle cx="1100" cy="922" r="4"/></g></svg>`;

function composition(id: DesignId, he: boolean, assetId: string): Element[] {
  switch (id) {
    case 'possibility':
      return [
        photo(assetId, he),
        gradient(he, '10,24,39', 0.96),
        art(
          '<path d="M102 96h1005M102 96v839M1110 970H102" fill="none" stroke="#f7e8d2" stroke-width="3" opacity=".48"/><path d="M1515 150a184 184 0 1 1-1 0M1515 104v75m-38-38h75" fill="none" stroke="#fff1d2" stroke-width="4" opacity=".55"/><path d="m1300 610 55-70 74 0" fill="none" stroke="#f5dca9" stroke-width="4"/><circle cx="1300" cy="610" r="11" fill="#e5b879"/>',
          he,
        ),
        rule([130, 120, 7, 142], he, '#e5b879'),
        words(
          copy(he, 'מחשבה לדרך  /  01', 'A THOUGHT FOR TODAY  /  01'),
          [164, 132, 870, 72],
          he,
          { size: 32, weight: 700, color: '#f1cf9e', spacing: 3 },
        ),
        words(
          copy(he, 'רעיונות גדולים\nמתחילים בקטן.', 'BIG IDEAS\nBEGIN SMALL.'),
          [130, 318, 1120, 352],
          he,
          { size: 116, weight: 800, color: '#ffffff' },
        ),
        words(
          copy(
            he,
            'הצעד הראשון לא צריך להיות מושלם.\nהוא רק צריך לקרות.',
            'The first step does not need to be perfect.\nIt only needs to happen.',
          ),
          [136, 740, 960, 145],
          he,
          { size: 41, color: '#f0f2ed' },
        ),
        rule([136, 955, 920, 2], he, '#d5c2a8', 0.8),
        words(
          copy(he, 'להתחיל היום  •  לגלות מחר', 'START TODAY  •  DISCOVER TOMORROW'),
          [136, 972, 960, 59],
          he,
          { size: 27, weight: 700, color: '#e5b879', spacing: 2 },
        ),
        words('01 / 10', [1520, 954, 280, 68], he, {
          size: 34,
          weight: 800,
          color: '#ffe9c6',
          align: 'center',
          spacing: 4,
        }),
      ];

    case 'momentum':
      return [
        photo(assetId, he),
        gradient(he, '248,243,232', 0.98),
        art(
          '<path d="M1113 155c-159 50-219 194-185 305M984 382l-58 82-57-67" fill="none" stroke="#8a551d" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/><circle cx="947" cy="225" r="12" fill="#b97933"/><circle cx="1005" cy="225" r="12" fill="#d9a569"/><circle cx="1063" cy="225" r="12" fill="#e7cba4"/><path d="M1080 871h668M1080 899h450" stroke="#9c612b" stroke-width="3" opacity=".45"/>',
          he,
        ),
        rule([128, 120, 6, 815], he, '#b97933'),
        words(copy(he, 'מחברת רעיונות  /  02', 'FIELD NOTES  /  02'), [165, 123, 810, 72], he, {
          size: 31,
          weight: 700,
          color: '#935a29',
          spacing: 3,
        }),
        words(copy(he, 'להעז.\nלנוע.\nלצמוח.', 'DARE.\nMOVE.\nGROW.'), [165, 292, 890, 420], he, {
          size: 124,
          weight: 800,
          color: '#35271d',
          font: he ? undefined : 'Georgia',
        }),
        words(
          copy(
            he,
            'כל שינוי גדול מתחיל ברגע אחד\nשל אומץ קטן.',
            'Every meaningful change begins\nwith one small moment of courage.',
          ),
          [166, 772, 820, 115],
          he,
          { size: 36, color: '#6b5546' },
        ),
        words(copy(he, 'עוד צעד אחד ←', 'ONE STEP FURTHER →'), [166, 944, 720, 63], he, {
          size: 28,
          weight: 800,
          color: '#935a29',
          spacing: 2,
        }),
        words('02', [1300, 708, 505, 305], he, {
          size: 295,
          weight: 700,
          color: '#fff1db',
          align: 'center',
          opacity: 0.66,
          font: 'Georgia',
        }),
      ];

    case 'wedding':
      return [
        photo(assetId, he),
        gradient(he, '249,245,237', 0.38),
        shape([120, 89, 835, 902], '#fbf8f2', {
          he,
          opacity: 0.93,
          radius: 10,
          stroke: '#c7ae8c',
          strokeWidth: 2,
        }),
        shape([143, 112, 789, 856], { kind: 'none' }, { he, stroke: '#d7c5a8', strokeWidth: 2 }),
        art(
          '<path d="M247 195c38-48 82-27 107-3m-106 0c-18-48-55-55-79-41m641 44c-38-48-82-27-107-3m106 0c18-48 55-55 79-41M429 579h-58m333 0h-58" fill="none" stroke="#af9470" stroke-width="3" opacity=".7"/><path d="M240 189c13-17 29-25 48-24-4 20-20 32-48 24zm596 0c-13-17-29-25-48-24 4 20 20 32 48 24z" fill="#a4ad91" opacity=".65"/><circle cx="538" cy="580" r="7" fill="#b49263"/>',
          he,
        ),
        words('✦', [447, 172, 180, 86], he, { size: 62, color: '#b49263', align: 'center' }),
        words(
          copy(he, 'בשמחה ובהתרגשות מזמינים אתכם', 'JOYFULLY INVITING YOU TO CELEBRATE'),
          [210, 270, 665, 66],
          he,
          { size: 28, weight: 600, color: '#857057', align: 'center', spacing: 2 },
        ),
        words(copy(he, 'נועה ויונתן', 'MAYA  &  DANIEL'), [173, 383, 730, 155], he, {
          size: he ? 84 : 88,
          weight: he ? 600 : 500,
          color: '#314938',
          align: 'center',
          font: he ? undefined : 'Georgia',
        }),
        rule([340, 584, 380, 2], he, '#c0a37f'),
        words(
          copy(he, 'יום חמישי  •  17 ביוני 2027', 'THURSDAY  •  JUNE 17, 2027'),
          [210, 641, 665, 78],
          he,
          { size: 34, weight: 700, color: '#314938', align: 'center' },
        ),
        words(
          copy(
            he,
            'קבלת פנים 19:30  |  בית על הים, תל אביב',
            '7:30 PM  |  THE GARDEN HOUSE, TEL AVIV',
          ),
          [188, 730, 710, 72],
          he,
          { size: 29, color: '#806d5c', align: 'center' },
        ),
        words(copy(he, 'נשמח לראותכם איתנו', 'WE CAN’T WAIT TO SEE YOU'), [250, 864, 585, 62], he, {
          size: 27,
          color: '#a28461',
          align: 'center',
          spacing: 2,
        }),
        words(copy(he, 'נ  ✦  י', 'M  ✦  D'), [404, 913, 270, 42], he, {
          size: 21,
          weight: 700,
          color: '#9d8565',
          align: 'center',
          spacing: 3,
        }),
      ];

    case 'webinar':
      return [
        photo(assetId, he),
        gradient(he, '9,23,49', 0.99),
        art(
          '<path d="M102 274h7v390h-7z" fill="#f6a64f"/><path d="M130 229h140m-140 19h88" stroke="#f6a64f" stroke-width="4" opacity=".64"/><circle cx="1710" cy="805" r="13" fill="#f6a64f"/><circle cx="1757" cy="805" r="7" fill="#f6a64f" opacity=".7"/><circle cx="1796" cy="805" r="4" fill="#f6a64f" opacity=".5"/>',
          he,
        ),
        shape([130, 119, 360, 67], '#f6a64f', { he, radius: 12 }),
        words(copy(he, 'וובינר בשידור חי', 'LIVE WEBINAR'), [149, 125, 322, 56], he, {
          size: 31,
          weight: 900,
          color: '#152944',
          align: 'center',
        }),
        words(
          copy(he, 'מותג שנשאר\nבתודעה.', 'A BRAND THAT\nSTAYS WITH YOU.'),
          [122, 292, 1020, 310],
          he,
          { size: he ? 111 : 100, weight: 900, color: '#ffffff' },
        ),
        words(
          copy(
            he,
            'שיחה מעשית על סיפור, זהות\nונוכחות דיגיטלית שנזכרת.',
            'A practical conversation about story, identity\nand a digital presence people remember.',
          ),
          [133, 677, 990, 123],
          he,
          { size: 39, color: '#d9e6f6' },
        ),
        rule([133, 867, 1000, 3], he, '#6f93bc'),
        words(
          copy(he, '14 באוקטובר  •  20:00', 'OCTOBER 14  •  8:00 PM'),
          [133, 894, 560, 72],
          he,
          { size: 35, weight: 800, color: '#f6a64f' },
        ),
        words(copy(he, 'בהנחיית דנה לוי', 'WITH DANA LEVI'), [710, 896, 420, 70], he, {
          size: 30,
          color: '#e5edf7',
        }),
      ];

    case 'conference':
      return [
        photo(assetId, he),
        gradient(he, '7,24,43', 0.99),
        art(
          '<path d="M92 262h7v418h-7z" fill="#4ae0cd"/><circle cx="1570" cy="445" r="268" fill="none" stroke="#56e6d6" stroke-width="3" opacity=".37"/><circle cx="1570" cy="445" r="205" fill="none" stroke="#56e6d6" stroke-width="2" opacity=".27"/><path d="M1570 173v545M1299 445h542" stroke="#56e6d6" stroke-width="2" opacity=".25"/><path d="m1663 180 12-27 12 27 27 12-27 12-12 27-12-27-27-12z" fill="#4ae0cd" opacity=".9"/>',
          he,
        ),
        rule([127, 109, 980, 3], he, '#4ae0cd'),
        words(copy(he, 'כנס העתיד  /  2026', 'FUTURE FORUM  /  2026'), [128, 139, 975, 71], he, {
          size: 34,
          weight: 800,
          color: '#56e6d6',
          spacing: 3,
        }),
        words(
          copy(he, 'העתיד נבנה\nביחד.', 'THE FUTURE\nIS OURS TO BUILD.'),
          [119, 295, 1100, 322],
          he,
          { size: he ? 112 : 99, weight: 900, color: '#ffffff' },
        ),
        words(
          copy(he, 'חדשנות  /  אנשים  /  השפעה', 'INNOVATION  /  PEOPLE  /  IMPACT'),
          [130, 690, 990, 73],
          he,
          { size: 37, color: '#c3d5e6', spacing: 1 },
        ),
        shape([130, 841, 470, 113], '#48d9cb', { he, radius: 14 }),
        words(copy(he, '21 באוקטובר 2026', 'OCTOBER 21, 2026'), [155, 854, 420, 80], he, {
          size: 35,
          weight: 900,
          color: '#09283a',
          align: 'center',
        }),
        words(copy(he, 'תל אביב  •  09:00', 'TEL AVIV  •  9:00 AM'), [635, 862, 485, 69], he, {
          size: 32,
          weight: 700,
          color: '#ffffff',
        }),
      ];

    case 'workshop':
      return [
        photo(assetId, he),
        gradient(he, '249,244,234', 0.98),
        art(
          '<path d="M1110 218c127 44 190 13 231-50M1294 160l56 4-31 49" fill="none" stroke="#2456a2" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" opacity=".78"/><path d="m1092 755 36-47 38 47-38 47z" fill="#e7a22d" opacity=".92"/><circle cx="1179" cy="822" r="18" fill="#c25841"/><path d="m962 146 10 23 25 10-25 10-10 23-10-23-25-10 25-10z" fill="#e7a22d"/>',
          he,
        ),
        shape([130, 126, 405, 68], '#2456a2', { he, radius: 12 }),
        words(copy(he, 'סדנה מעשית', 'HANDS-ON WORKSHOP'), [148, 133, 368, 54], he, {
          size: 28,
          weight: 900,
          color: '#ffffff',
          align: 'center',
          spacing: 2,
        }),
        words(copy(he, 'רעיונות\nשמקבלים צורה.', 'IDEAS\nTAKE SHAPE.'), [124, 293, 985, 350], he, {
          size: he ? 105 : 119,
          weight: 900,
          color: '#192f47',
        }),
        words(
          copy(
            he,
            'שעתיים של יצירה, כלים חדשים\nואנשים טובים סביב השולחן.',
            'Two hours of making, fresh tools and\ngood people around the table.',
          ),
          [135, 702, 945, 125],
          he,
          { size: 38, color: '#536375' },
        ),
        rule([135, 891, 965, 3], he, '#bd8e78'),
        words(
          copy(he, 'שלישי  •  17:00  •  סטודיו העיר', 'TUESDAY  •  5 PM  •  CITY STUDIO'),
          [135, 917, 970, 80],
          he,
          { size: 33, weight: 800, color: '#c25841' },
        ),
      ];

    case 'product':
      return [
        photo(assetId, he),
        gradient(he, '249,246,239', 0.97),
        art(
          '<path d="M1160 103h650v864h-650v-154m0-594v-116" fill="none" stroke="#d9c4a6" stroke-width="3" opacity=".8"/><path d="M1225 175h128M1289 111v128" stroke="#a7b4be" stroke-width="4" opacity=".75"/><circle cx="1543" cy="567" r="315" fill="none" stroke="#fff9ec" stroke-width="5" opacity=".7"/><path d="M1600 150h172m-86-86v172" stroke="#bdc5c7" stroke-width="3" opacity=".67"/>',
          he,
        ),
        words(copy(he, 'NOVA  /  סדרת אור', 'NOVA  /  THE LIGHT SERIES'), [130, 118, 880, 71], he, {
          size: 32,
          weight: 800,
          color: '#57697a',
          spacing: 3,
        }),
        words(
          copy(he, 'אור חדש\nלכל רגע.', 'A BRIGHTER\nWAY TO LIVE.'),
          [122, 297, 1010, 315],
          he,
          { size: he ? 116 : 103, weight: 900, color: '#182d42' },
        ),
        words(
          copy(
            he,
            'עיצוב שמכניס הביתה\nבדיוק את האווירה הנכונה.',
            'Thoughtful design that brings\nthe right atmosphere home.',
          ),
          [132, 678, 875, 126],
          he,
          { size: 39, color: '#536373' },
        ),
        shape([132, 884, 410, 89], '#182d42', { he, radius: 15 }),
        words(copy(he, 'להכיר את NOVA', 'MEET NOVA'), [156, 895, 363, 66], he, {
          size: 36,
          weight: 900,
          color: '#ffffff',
          align: 'center',
        }),
        words(
          copy(he, 'אור  •  עיצוב  •  בית', 'LIGHT  •  DESIGN  •  HOME'),
          [596, 895, 540, 67],
          he,
          { size: 29, color: '#556778', spacing: 2 },
        ),
        shape([1559, 112, 234, 96], '#182d42', {
          he,
          radius: 48,
          shadow: { x: 0, y: 10, blur: 16, color: '#192d42', alpha: 0.25 },
        }),
        words(copy(he, 'חדש', 'NEW / 01'), [1576, 126, 200, 66], he, {
          size: 30,
          weight: 800,
          color: '#fff9ed',
          align: 'center',
          spacing: 2,
        }),
      ];

    case 'sale':
      return [
        photo(assetId, he),
        gradient(he, '124,25,22', 0.42),
        art(
          '<path d="M99 99h871M99 99v867" fill="none" stroke="#ffd8ad" stroke-width="3" opacity=".65"/><path d="m1110 145 24 37 43-20 11 43 47-4-6 46 44 15-25 39 31 35-34 34 24 40-44 15 6 47-47-5-12 44-43-20-24 37-24-37-43 20-12-44-47 5 6-47-44-15 24-40-34-34 31-35-25-39 44-15-6-46 47 4 11-43 43 20z" fill="#ffce57"/>',
          he,
        ),
        words(copy(he, 'סוף שבוע של צבע', 'A WEEKEND IN COLOR'), [122, 109, 860, 73], he, {
          size: 34,
          weight: 800,
          color: '#ffe7ca',
          spacing: 3,
        }),
        words('40%', [105, 252, 940, 285], he, { size: 260, weight: 900, color: '#ffffff' }),
        words(copy(he, 'הנחה', 'OFF'), [122, 548, 850, 143], he, {
          size: 131,
          weight: 900,
          color: '#ffcf69',
        }),
        words(
          copy(he, 'פריטים שמשמחים את הבית', 'A BRIGHTER HOME STARTS HERE'),
          [133, 733, 790, 107],
          he,
          { size: 39, weight: 700, color: '#ffffff' },
        ),
        rule([133, 879, 800, 3], he, '#ffd9c9'),
        words(
          copy(he, 'חמישי–שבת  •  אונליין ובחנויות', 'THURSDAY–SATURDAY  •  ONLINE & IN STORE'),
          [133, 911, 850, 82],
          he,
          { size: 31, weight: 700, color: '#ffe5cb' },
        ),
        words(copy(he, '3 ימים בלבד', 'ONLY 3 DAYS'), [958, 266, 304, 110], he, {
          size: 43,
          weight: 900,
          color: '#8f2c20',
          align: 'center',
          rotation: -6,
        }),
      ];

    case 'testimonial':
      return [
        photo(assetId, he, { flip: !he }),
        gradient(he, '250,248,242', 0.96),
        art(
          '<path d="M99 91h974M99 91v884h974M1250 99v883" fill="none" stroke="#759d83" stroke-width="3" opacity=".42"/>',
          he,
        ),
        words(copy(he, 'סיפורים אמיתיים  /  01', 'REAL STORIES  /  01'), [130, 115, 880, 72], he, {
          size: 32,
          weight: 800,
          color: '#326c53',
          spacing: 3,
        }),
        words('“', [112, 219, 150, 150], he, {
          size: 164,
          weight: 700,
          color: '#76a88d',
          font: 'Georgia',
        }),
        words(
          copy(he, 'פתאום הכול\nמרגיש אפשרי.', 'SUDDENLY, IT ALL\nFEELS POSSIBLE.'),
          [130, 320, 1020, 335],
          he,
          { size: he ? 105 : 94, weight: 800, color: '#1a3c31' },
        ),
        words(
          copy(
            he,
            '״מצאנו דרך לעבוד יחד בלי לאבד\nאת הסגנון של כל אחד מאיתנו.״',
            '“We found a way to work together without\nlosing what makes each of us unique.”',
          ),
          [137, 697, 1030, 135],
          he,
          { size: 38, color: '#476456' },
        ),
        rule([137, 878, 970, 3], he, '#95b7a2'),
        words(
          copy(he, 'דנה לוי  •  מייסדת סטודיו צפון', 'DANA LEVI  •  FOUNDER, NORTH STUDIO'),
          [137, 902, 970, 70],
          he,
          { size: 31, weight: 800, color: '#2a6149' },
        ),
        words('★★★★★', [137, 644, 508, 62], he, {
          size: 38,
          color: '#be9452',
          spacing: 9,
        }),
      ];

    case 'thumbnail':
      return [
        createElement.svg({ frame: frame([0, 0, 1920, 1080]), markup: burst }),
        createElement.image({
          frame: frame(mirror([-70, -18, 1020, 1122], he)),
          assetId,
          fit: 'cover',
          ...(he ? { flipH: true } : {}),
          effects: { shadow: { x: 10, y: 7, blur: 18, color: { value: '#ffffff', alpha: 0.95 } } },
          alt: 'Surprised person reacting to the headline',
        }),
        art(
          '<path d="M1090 47C960 31 855 49 824 112M773 79l43 69 62-63" fill="none" stroke="#fff" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/><path d="M1605 902c121 29 178-45 192-138" fill="none" stroke="#092f13" stroke-width="24" stroke-linecap="round"/><path d="m1731 794 68-63 34 90" fill="none" stroke="#092f13" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/>',
          he,
        ),
        shape([809, 149, 930, 155], '#103919', {
          he,
          radius: 34,
          rotation: -3,
          shadow: { x: 9, y: 15, blur: 20, color: '#073457', alpha: 0.55 },
        }),
        words(copy(he, '5 טעויות', '5 BIG MISTAKES'), [846, 160, 860, 132], he, {
          size: he ? 113 : 135,
          weight: 900,
          color: '#ffffff',
          align: 'center',
          font: he ? 'Heebo' : 'Impact',
          italic: !he,
          rotation: -3,
        }),
        shape([776, 380, 1055, 188], '#ffffff', {
          he,
          radius: 33,
          rotation: 2,
          shadow: { x: 10, y: 18, blur: 24, color: '#05274c', alpha: 0.48 },
        }),
        words(copy(he, 'נחשפות!', 'REVEALED'), [800, 398, 1002, 152], he, {
          size: he ? 162 : 185,
          weight: 900,
          color: '#11361b',
          align: 'center',
          font: he ? 'Heebo' : 'Impact',
          italic: !he,
          rotation: 2,
        }),
        shape([997, 657, 770, 159], '#ffc916', {
          he,
          radius: 30,
          rotation: -3,
          shadow: { x: 9, y: 14, blur: 19, color: '#0b3b61', alpha: 0.48 },
        }),
        words(copy(he, 'השלישית מפתיעה!', 'DON’T MISS #3!'), [1024, 676, 713, 125], he, {
          size: he ? 76 : 116,
          weight: 900,
          color: '#142f16',
          align: 'center',
          font: he ? 'Heebo' : 'Impact',
          italic: !he,
          rotation: -3,
        }),
        words(copy(he, 'בואו נבדוק ←', 'LET’S FIND OUT →'), [1025, 891, 565, 67], he, {
          size: 36,
          weight: 900,
          color: '#ffffff',
          align: 'center',
          spacing: 2,
        }),
      ];
  }
}

/** Each call makes fresh element IDs; the image is supplied by the preview or document asset. */
export function designSlide(id: DesignId, lang: string, assetId: string): Slide {
  return createSlide({ name: id, elements: composition(id, lang.startsWith('he'), assetId) });
}

/** The gallery renders the same slide model using its bundled image URL. */
export function designPreview(id: DesignId, lang: string) {
  const asset = previewAsset(id);
  const slide = designSlide(id, lang, previewAssetId(id));
  const deck = createDeck({ lang, slides: [slide] });
  deck.assets[asset.id] = asset;
  return { slide, deck, resolveAsset: designAssetUrl };
}

/** Adds the imported image and a fresh slide together, in one undo step. */
export function insertDesign(
  bus: CommandBus,
  selection: SelectionStore,
  id: DesignId,
  name: string,
  historyLabel: string,
  asset: AssetMeta,
): Slide {
  const current = selection.getState().currentSlideId;
  const position = bus.deck.slides.findIndex((candidate) => candidate.id === current);
  const added = designSlide(id, bus.deck.meta.lang, asset.id);
  added.name = name;
  const commands: Command[] = [
    ...(bus.deck.assets[asset.id] ? [] : [{ type: 'asset.add' as const, asset }]),
    {
      type: 'slide.add',
      slide: added,
      index: position < 0 ? bus.deck.slides.length : position + 1,
    },
  ];
  bus.batch(commands, { label: historyLabel });
  selection.getState().setCurrentSlide(added.id);
  return added;
}
