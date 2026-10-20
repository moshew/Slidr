// Ready-made slides written in every language of the app: a night market of the world's
// kitchens (m-nightmarket, `food`) and a panorama train across the Alps (m-paneltrain,
// `tourism`). Each slide is drawn once, for left-to-right languages, and mirrored for Hebrew and
// Arabic, its picture turned round with it; every run names a family with the letters of its
// language (Japanese, Korean and Chinese fall back to the system's faces behind it). The pictures
// were made for them with the Codex CLI, as Slidr Studio makes its pictures.
import {
  CONTENT_LANGUAGES,
  languageDir,
  type ContentLanguage,
  type Frame,
  type ImageElement,
  type Slide,
} from '@slidr/model';
import {
  art,
  fill,
  linear,
  picture,
  shape,
  slide,
  textBox,
  type DesignEntry,
  type Lang,
  type Look,
} from './kit';

const rtl = (lang: Lang) => languageDir(lang) === 'rtl';
/** A frame of the left-to-right composition, mirrored for a right-to-left language. */
const at = (lang: Lang, x: number, y: number, w: number, h: number): Frame => ({
  x: rtl(lang) ? 1920 - x - w : x,
  y,
  w,
  h,
});
/** The picture, turned round where the composition is mirrored. */
const turned = (lang: Lang, image: ImageElement): ImageElement =>
  rtl(lang) ? { ...image, flipH: true } : image;
/** An SVG drawing without letters, mirrored with the slide. */
const drawn = (lang: Lang, w: number, h: number, body: string) =>
  `<svg viewBox="0 0 ${w} ${h}" fill="none">${
    rtl(lang) ? `<g transform="translate(${w} 0) scale(-1 1)">${body}</g>` : body
  }</svg>`;

type Script = 'he' | 'ar' | 'latin' | 'hi' | 'cjk';
const scriptOf = (lang: Lang): Script =>
  lang === 'he'
    ? 'he'
    : lang === 'ar'
      ? 'ar'
      : lang === 'hi'
        ? 'hi'
        : lang === 'ja' || lang === 'ko' || lang === 'zh-CN'
          ? 'cjk'
          : 'latin';

/** The width a line takes, roughly, at a size: enough to size a chip or a button around it. */
function measure(text: string, size: number): number {
  let width = 0;
  for (const char of text) {
    const c = char.codePointAt(0)!;
    const wide =
      (c >= 0x1100 && c <= 0x11ff) ||
      (c >= 0x2e80 && c <= 0xa4cf) ||
      (c >= 0xac00 && c <= 0xd7a3) ||
      (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xff00 && c <= 0xffef);
    width += size * (wide ? 1 : char === ' ' ? 0.3 : 0.58);
  }
  return Math.ceil(width);
}

const looks =
  (font: string) =>
  (size: number, weight: number, color: string, letterSpacing?: number): Look => ({
    font,
    size,
    weight,
    color,
    ...(letterSpacing !== undefined ? { letterSpacing } : {}),
  });

// ---------------------------------------------------------------------------------------------
// m-nightmarket: the picture fills the slide, a market under paper lanterns at blue hour; over
// the calm water a scrim of night, and on it the invitation: a serif title in lantern light, the
// dates on a cream ticket with its stub, the dishes as tags, and an amber button.

interface NightCopy {
  kicker: string;
  title: string[];
  subtitle: string[];
  /** The stub of the ticket: the month, the days, the year. */
  month: string;
  days: string;
  year: string;
  /** When, where, and what it costs. */
  info: [string, string, string];
  dishes: string[];
  cta: string;
  alt: string;
}

const NIGHT: Record<ContentLanguage, NightCopy> = {
  en: {
    kicker: 'Saturdays in June · Harbour Square',
    title: ['The night market', 'of the world’s', 'kitchens'],
    subtitle: ['Forty stalls, fourteen cuisines', 'and one long table by the sea.'],
    month: 'June',
    days: '5–26',
    year: '2027',
    info: [
      'Every Saturday, 18:00 to midnight',
      'Harbour Square, by the lighthouse',
      'Free entry, children welcome',
    ],
    dishes: ['Mezze', 'Paella', 'Dumplings', 'Tacos', 'Baklava'],
    cta: 'Come hungry',
    alt: 'A night food market on a harbour square under paper lanterns',
  },
  he: {
    kicker: 'מוצאי שבת ביוני · כיכר הנמל',
    title: ['שוק הלילה', 'של מטבחי', 'העולם'],
    subtitle: ['ארבעים דוכנים, ארבעה־עשר מטבחים', 'ושולחן אחד ארוך על שפת הים.'],
    month: 'יוני',
    days: '5–26',
    year: '2027',
    info: [
      'כל מוצאי שבת, מ־18:00 עד חצות',
      'כיכר הנמל, ליד המגדלור',
      'הכניסה חופשית, ילדים מוזמנים',
    ],
    dishes: ['מזטים', 'פאייה', 'כופתאות', 'טאקו', 'בקלאווה'],
    cta: 'בואו רעבים',
    alt: 'שוק אוכל לילי בכיכר הנמל תחת פנסי נייר',
  },
  ar: {
    kicker: 'أيام السبت في يونيو · ساحة الميناء',
    title: ['سوق الليل', 'لمطابخ', 'العالم'],
    subtitle: ['أربعون كشكًا، أربعة عشر مطبخًا', 'وطاولة واحدة طويلة على البحر.'],
    month: 'يونيو',
    days: '5–26',
    year: '2027',
    info: [
      'كل سبت، من 18:00 حتى منتصف الليل',
      'ساحة الميناء، قرب المنارة',
      'الدخول مجاني، والأطفال مرحَّب بهم',
    ],
    dishes: ['مازة', 'باييا', 'شيش برك', 'تاكو', 'بقلاوة'],
    cta: 'تعالوا جائعين',
    alt: 'سوق طعام ليلي في ساحة الميناء تحت فوانيس ورقية',
  },
  de: {
    kicker: 'Samstags im Juni · Hafenplatz',
    title: ['Der Nachtmarkt', 'der Küchen', 'der Welt'],
    subtitle: ['Vierzig Stände, vierzehn Küchen', 'und eine lange Tafel am Meer.'],
    month: 'Juni',
    days: '5.–26.',
    year: '2027',
    info: [
      'Samstags, 18 bis 24 Uhr',
      'Hafenplatz, beim Leuchtturm',
      'Eintritt frei, Kinder willkommen',
    ],
    dishes: ['Mezze', 'Paella', 'Teigtaschen', 'Tacos', 'Baklava'],
    cta: 'Hungrig kommen',
    alt: 'Ein nächtlicher Essensmarkt auf einem Hafenplatz unter Papierlaternen',
  },
  es: {
    kicker: 'Sábados de junio · Plaza del Puerto',
    title: ['El mercado', 'nocturno de', 'los sabores'],
    subtitle: ['Cuarenta puestos, catorce cocinas', 'y una larga mesa junto al mar.'],
    month: 'junio',
    days: '5–26',
    year: '2027',
    info: [
      'Cada sábado, de 18:00 a medianoche',
      'Plaza del Puerto, junto al faro',
      'Entrada libre, niños bienvenidos',
    ],
    dishes: ['Mezze', 'Paella', 'Empanadillas', 'Tacos', 'Baklava'],
    cta: 'Ven con hambre',
    alt: 'Un mercado nocturno de comida en una plaza del puerto bajo farolillos de papel',
  },
  fr: {
    kicker: 'Les samedis de juin · Place du Port',
    title: ['Le marché', 'de nuit des', 'cuisines du monde'],
    subtitle: ['Quarante stands, quatorze cuisines', 'et une grande tablée face à la mer.'],
    month: 'juin',
    days: '5–26',
    year: '2027',
    info: [
      'Chaque samedi, de 18 h à minuit',
      'Place du Port, près du phare',
      'Entrée libre, enfants bienvenus',
    ],
    dishes: ['Mezzé', 'Paella', 'Raviolis', 'Tacos', 'Baklava'],
    cta: 'Venez affamés',
    alt: 'Un marché de nuit sur une place du port, sous des lanternes en papier',
  },
  it: {
    kicker: 'I sabati di giugno · Piazza del Porto',
    title: ['Il mercato', 'notturno delle', 'cucine del mondo'],
    subtitle: ['Quaranta banchi, quattordici cucine', 'e una lunga tavolata sul mare.'],
    month: 'giugno',
    days: '5–26',
    year: '2027',
    info: [
      'Ogni sabato, dalle 18 a mezzanotte',
      'Piazza del Porto, vicino al faro',
      'Ingresso libero, bambini benvenuti',
    ],
    dishes: ['Mezze', 'Paella', 'Ravioli', 'Tacos', 'Baklava'],
    cta: 'Venite affamati',
    alt: 'Un mercato notturno del cibo in una piazza del porto sotto lanterne di carta',
  },
  'pt-BR': {
    kicker: 'Sábados de junho · Praça do Porto',
    title: ['A feira noturna', 'das cozinhas', 'do mundo'],
    subtitle: ['Quarenta barracas, catorze cozinhas', 'e uma mesa comprida à beira-mar.'],
    month: 'junho',
    days: '5–26',
    year: '2027',
    info: [
      'Todo sábado, das 18h à meia-noite',
      'Praça do Porto, perto do farol',
      'Entrada gratuita, crianças bem-vindas',
    ],
    dishes: ['Mezze', 'Paella', 'Guioza', 'Tacos', 'Baklava'],
    cta: 'Venha com fome',
    alt: 'Uma feira noturna de comida numa praça do porto, sob lanternas de papel',
  },
  ru: {
    kicker: 'По субботам в июне · Портовая площадь',
    title: ['Ночной рынок', 'кухонь', 'мира'],
    subtitle: ['Сорок прилавков, четырнадцать кухонь', 'и один длинный стол у моря.'],
    month: 'июнь',
    days: '5–26',
    year: '2027',
    info: [
      'Каждую субботу, с 18:00 до полуночи',
      'Портовая площадь, у маяка',
      'Вход свободный, детям рады',
    ],
    dishes: ['Мезе', 'Паэлья', 'Пельмени', 'Тако', 'Пахлава'],
    cta: 'Приходите голодными',
    alt: 'Ночной гастрономический рынок на портовой площади под бумажными фонариками',
  },
  tr: {
    kicker: 'Haziran cumartesileri · Liman Meydanı',
    title: ['Dünya', 'mutfaklarının', 'gece pazarı'],
    subtitle: ['Kırk tezgâh, on dört mutfak', 've denize karşı uzun bir sofra.'],
    month: 'Haziran',
    days: '5–26',
    year: '2027',
    info: [
      'Her cumartesi, 18.00 – gece yarısı',
      'Liman Meydanı, deniz fenerinin yanı',
      'Giriş ücretsiz, çocuklar da gelsin',
    ],
    dishes: ['Meze', 'Paella', 'Mantı', 'Tako', 'Baklava'],
    cta: 'Aç gelin',
    alt: 'Kâğıt fenerlerin altında, liman meydanında bir gece yemek pazarı',
  },
  vi: {
    kicker: 'Tối thứ Bảy tháng Sáu · Quảng trường Cảng',
    title: ['Chợ đêm', 'ẩm thực', 'thế giới'],
    subtitle: ['Bốn mươi gian hàng, mười bốn nền ẩm thực', 'và một bàn dài bên bờ biển.'],
    month: 'Tháng 6',
    days: '5–26',
    year: '2027',
    info: [
      'Mỗi thứ Bảy, 18:00 đến nửa đêm',
      'Quảng trường Cảng, cạnh hải đăng',
      'Vào cửa tự do, chào đón trẻ em',
    ],
    dishes: ['Mezze', 'Paella', 'Há cảo', 'Tacos', 'Baklava'],
    cta: 'Hãy đến khi đói',
    alt: 'Một chợ đêm ẩm thực trên quảng trường cảng dưới những chiếc đèn lồng giấy',
  },
  id: {
    kicker: 'Sabtu malam di bulan Juni · Alun-alun Pelabuhan',
    title: ['Pasar malam', 'dapur', 'dunia'],
    subtitle: ['Empat puluh lapak, empat belas masakan', 'dan satu meja panjang di tepi laut.'],
    month: 'Juni',
    days: '5–26',
    year: '2027',
    info: [
      'Tiap Sabtu, 18.00 – tengah malam',
      'Alun-alun Pelabuhan, dekat mercusuar',
      'Masuk gratis, anak-anak dipersilakan',
    ],
    dishes: ['Meze', 'Paella', 'Pangsit', 'Taco', 'Baklava'],
    cta: 'Datang lapar',
    alt: 'Pasar makanan malam di alun-alun pelabuhan di bawah lampion kertas',
  },
  hi: {
    kicker: 'जून के शनिवार · हार्बर स्क्वायर',
    title: ['दुनिया की', 'रसोइयों का', 'रात्रि बाज़ार'],
    subtitle: ['चालीस स्टॉल, चौदह तरह के व्यंजन', 'और समंदर किनारे एक लंबी मेज़।'],
    month: 'जून',
    days: '5–26',
    year: '2027',
    info: [
      'हर शनिवार, शाम 6 से आधी रात तक',
      'हार्बर स्क्वायर, लाइटहाउस के पास',
      'प्रवेश निःशुल्क, बच्चों का स्वागत',
    ],
    dishes: ['मेज़े', 'पाएया', 'मोमो', 'टाको', 'बकलावा'],
    cta: 'भूखे आइए',
    alt: 'कागज़ की लालटेनों के नीचे बंदरगाह के चौक पर रात का खाने का बाज़ार',
  },
  ja: {
    kicker: '6月の毎週土曜 · ハーバー広場',
    title: ['世界の台所', 'ナイト', 'マーケット'],
    subtitle: ['40の屋台、14の国の味、', '海辺に続く長いテーブル。'],
    month: '6月',
    days: '5–26',
    year: '2027',
    info: ['毎週土曜 18:00〜深夜0時', 'ハーバー広場（灯台そば）', '入場無料・お子さまも歓迎'],
    dishes: ['メゼ', 'パエリア', '餃子', 'タコス', 'バクラヴァ'],
    cta: 'おなかをすかせて',
    alt: '紙の提灯が灯る港の広場のナイトマーケット',
  },
  ko: {
    kicker: '6월 매주 토요일 · 하버 광장',
    title: ['세계의', '부엌', '야시장'],
    subtitle: ['40개의 노점, 14개 나라의 맛,', '바닷가의 긴 식탁 하나.'],
    month: '6월',
    days: '5–26',
    year: '2027',
    info: ['매주 토요일 18:00~자정', '하버 광장, 등대 옆', '무료 입장, 어린이 환영'],
    dishes: ['메제', '파에야', '만두', '타코', '바클라바'],
    cta: '배고픈 채로 오세요',
    alt: '종이 등불 아래 항구 광장의 야시장',
  },
  'zh-CN': {
    kicker: '六月每周六 · 港口广场',
    title: ['世界厨房', '夜市'],
    subtitle: ['四十个摊位，十四种风味，', '还有一张临海长桌。'],
    month: '6月',
    days: '5–26',
    year: '2027',
    info: ['每周六 18:00 至午夜', '港口广场，灯塔旁', '免费入场，欢迎带孩子来'],
    dishes: ['开胃小菜', '海鲜饭', '饺子', '塔可', '果仁蜜饼'],
    cta: '空着肚子来',
    alt: '纸灯笼下港口广场上的夜市',
  },
};

/** Where the picture's subject is in the left-to-right slide: the stalls under the lanterns. */
const NIGHT_SUBJECT: [number, number] = [470, 700];

function nightmarket(lang: Lang): Slide {
  const copy = NIGHT[lang];
  const script = scriptOf(lang);
  const serif = looks(
    {
      he: 'Frank Ruhl Libre',
      ar: 'Rubik',
      hi: 'Poppins',
      cjk: 'Playfair Display',
      latin: 'Playfair Display',
    }[script],
  );
  const sans = looks(
    { he: 'Rubik', ar: 'Rubik', hi: 'Poppins', cjk: 'Inter', latin: 'Inter' }[script],
  );
  const NAVY = '#0B1630';
  const AMBER = '#F2A541';
  const CREAM = '#FFF4E0';
  const MIST = '#E6DCCB';
  const RUST = '#9A4A16';
  const x0 = 1010;
  const width = 830;
  // The title's size and leading for the letters it is set in: Arabic, Devanagari and the
  // stacked marks of Vietnamese want more room between lines than Latin display type.
  const titleSize = { he: 92, ar: 80, hi: 72, cjk: 84, latin: lang === 'vi' ? 86 : 92 }[script];
  const titleLeading = {
    he: 1.06,
    ar: 1.2,
    hi: 1.3,
    cjk: 1.12,
    latin: lang === 'vi' ? 1.16 : 1.06,
  }[script];
  const subLeading = script === 'hi' ? 1.55 : 1.4;
  // The column, from the kicker down: each part where the one above it ends.
  const titleTop = 186;
  const titleH = Math.round(copy.title.length * titleSize * titleLeading) + 18;
  const subTop = titleTop + titleH + 6;
  const subH = Math.round(copy.subtitle.length * 30 * subLeading) + 10;

  // The dishes as tags, one after another along the line the slide reads.
  let cursor = x0;
  const chips = copy.dishes.map((dish) => {
    const w = measure(dish, 24) + 44;
    const frame = at(lang, cursor, 862, w, 50);
    cursor += w + 12;
    return shape({
      frame,
      fill: fill(NAVY, 0.35),
      round: 0.5,
      stroke: { color: { value: AMBER, alpha: 0.85 }, width: 1.5 },
      label: { text: dish, look: sans(24, 500, CREAM), lang },
    });
  });

  const icons = [
    // A clock, a pin, a ticket: when, where, and that it is free.
    `<circle cx="16" cy="16" r="12" stroke="${NAVY}" stroke-width="2.4"/><path d="M16 9V16L21 19" stroke="${NAVY}" stroke-width="2.4" stroke-linecap="round"/>`,
    `<path d="M16 29C16 29 6 19.5 6 12.5A10 10 0 0 1 26 12.5C26 19.5 16 29 16 29Z" stroke="${NAVY}" stroke-width="2.4"/><circle cx="16" cy="12.5" r="3.6" fill="${RUST}"/>`,
    `<path d="M4 9H28V13A3 3 0 0 0 28 19V23H4V19A3 3 0 0 0 4 13Z" stroke="${NAVY}" stroke-width="2.4" stroke-linejoin="round"/><path d="M19 9V23" stroke="${NAVY}" stroke-width="2" stroke-dasharray="2 3"/>`,
  ];
  const stubW = 190;
  const ticket = { x: x0, y: Math.max(622, subTop + subH + 18), w: width, h: 214 };
  const stubX = ticket.x + ticket.w - stubW;

  return slide({ fill: fill(NAVY) }, [
    turned(lang, picture({ x: 0, y: 0, w: 1920, h: 1080 }, copy.alt)),
    // Night falls over the side of the market the words stand on, so they read on it.
    shape({
      frame: at(lang, 820, 0, 1100, 1080),
      fill: linear(
        rtl(lang) ? 270 : 90,
        [NAVY, 0, 0],
        [NAVY, 0.2, 0.8],
        [NAVY, 0.42, 0.9],
        [NAVY, 1, 0.95],
      ),
    }),
    art(
      at(lang, x0, 112, 120, 8),
      drawn(
        lang,
        120,
        8,
        `<path d="M4 4H116" stroke="${AMBER}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 9"/>`,
      ),
    ),
    textBox({
      frame: at(lang, x0, 132, width, 40),
      lines: [copy.kicker],
      look: sans(26, 600, AMBER, script === 'latin' ? 0.6 : 0),
      lang,
    }),
    textBox({
      frame: at(lang, x0, titleTop, width + 40, titleH),
      lines: copy.title,
      look: serif(titleSize, 700, CREAM, script === 'latin' ? -1 : 0),
      lang,
      lineHeight: titleLeading,
      vAlign: 'top',
    }),
    textBox({
      frame: at(lang, x0, subTop, width, subH),
      lines: copy.subtitle,
      look: sans(30, 400, MIST),
      lang,
      lineHeight: subLeading,
      vAlign: 'top',
    }),
    // The ticket: three lines on its body, the dates on its stub.
    shape({
      frame: at(lang, ticket.x, ticket.y, ticket.w, ticket.h),
      fill: fill(CREAM),
      round: 0.06,
      shadow: { x: 0, y: 18, blur: 40, color: '#000000', alpha: 0.35 },
    }),
    art(
      at(lang, stubX - 2, ticket.y + 14, 4, ticket.h - 28),
      drawn(
        lang,
        4,
        ticket.h - 28,
        `<path d="M2 2V${ticket.h - 30}" stroke="${NAVY}" stroke-opacity=".35" stroke-width="2" stroke-dasharray="4 6"/>`,
      ),
    ),
    ...copy.info.flatMap((line, i) => [
      art(at(lang, ticket.x + 32, ticket.y + 34 + i * 60, 32, 32), drawn(lang, 32, 32, icons[i]!)),
      textBox({
        frame: at(lang, ticket.x + 80, ticket.y + 28 + i * 60, stubX - ticket.x - 100, 44),
        lines: [line],
        look: sans(26, 500, NAVY),
        lang,
      }),
    ]),
    textBox({
      frame: at(lang, stubX, ticket.y + 30, stubW, 36),
      lines: [copy.month],
      look: sans(24, 700, RUST, script === 'latin' ? 1 : 0),
      lang,
      align: 'center',
    }),
    textBox({
      frame: at(lang, stubX, ticket.y + 70, stubW, 80),
      lines: [copy.days],
      look: serif(copy.days.length > 5 ? 50 : 58, 700, NAVY),
      lang,
      align: 'center',
      dir: 'ltr',
    }),
    textBox({
      frame: at(lang, stubX, ticket.y + 154, stubW, 36),
      lines: [copy.year],
      look: sans(24, 600, NAVY),
      lang,
      align: 'center',
      dir: 'ltr',
    }),
    ...chips,
    shape({
      frame: at(lang, x0, 932, measure(copy.cta, 26) + 76, 62),
      fill: fill(AMBER),
      round: 0.5,
      shadow: { x: 0, y: 10, blur: 24, color: '#000000', alpha: 0.3 },
      label: { text: copy.cta, look: sans(26, 700, NAVY), lang },
    }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-paneltrain: a travel poster. On the cream of an alpine timetable, the photograph framed as
// the window of the carriage, the red train on its viaduct; beside it the offer in a heavy
// geometric face, and along the foot the route itself as a profile of the climb, from the valley
// to the glacier, each station with its time and its height.

interface TrainCopy {
  kicker: string;
  title: string[];
  body: string[];
  price: [label: string, amount: string];
  note: string;
  cta: string;
  stations: [time: string, height: string, name: string][];
  alt: string;
}

const TRAIN: Record<ContentLanguage, TrainCopy> = {
  en: {
    kicker: 'Summer timetable 2027',
    title: ['Four hours', 'across', 'the Alps'],
    body: [
      'A panoramic train climbs from the',
      'valley to the glacier lakes: 196 bridges,',
      '55 tunnels and a window seat',
      'for every passenger.',
    ],
    price: ['Return fare from', '€89'],
    note: 'Daily from 1 June to 30 September',
    cta: 'Book a window seat',
    stations: [
      ['08:10', '585 m', 'Valley station'],
      ['09:05', '1,123 m', 'Stone viaduct'],
      ['10:40', '1,820 m', 'Lake plateau'],
      ['12:05', '2,253 m', 'Glacier summit'],
    ],
    alt: 'A red panoramic train crossing a curved stone viaduct in the Alps',
  },
  he: {
    kicker: 'לוח הזמנים לקיץ 2027',
    title: ['ארבע שעות', 'בלב', 'האלפים'],
    body: [
      'רכבת פנורמית מטפסת מן העמק',
      'אל אגמי הקרחון: 196 גשרים,',
      '55 מנהרות ומושב ליד החלון',
      'לכל נוסע ונוסעת.',
    ],
    price: ['הלוך ושוב, החל מ־', '€89'],
    note: 'בכל יום, מ־1 ביוני עד 30 בספטמבר',
    cta: 'הזמינו מושב ליד החלון',
    stations: [
      ['08:10', '585 מ׳', 'תחנת העמק'],
      ['09:05', '1,123 מ׳', 'גשר האבן'],
      ['10:40', '1,820 מ׳', 'רמת האגמים'],
      ['12:05', '2,253 מ׳', 'פסגת הקרחון'],
    ],
    alt: 'רכבת פנורמית אדומה חוצה גשר אבן מקושת באלפים',
  },
  ar: {
    kicker: 'جدول رحلات صيف 2027',
    title: ['أربع ساعات', 'عبر', 'جبال الألب'],
    body: [
      'قطار بانورامي يصعد من الوادي',
      'إلى بحيرات الجليد: 196 جسرًا',
      'و55 نفقًا، ومقعد بجوار النافذة',
      'لكل راكب.',
    ],
    price: ['ذهابًا وإيابًا ابتداءً من', '89 €'],
    note: 'يوميًا من 1 يونيو حتى 30 سبتمبر',
    cta: 'احجز مقعدًا بجوار النافذة',
    stations: [
      ['08:10', '585 م', 'محطة الوادي'],
      ['09:05', '1123 م', 'الجسر الحجري'],
      ['10:40', '1820 م', 'هضبة البحيرات'],
      ['12:05', '2253 م', 'قمة الجليد'],
    ],
    alt: 'قطار بانورامي أحمر يعبر جسرًا حجريًا منحنيًا في جبال الألب',
  },
  de: {
    kicker: 'Sommerfahrplan 2027',
    title: ['Vier Stunden', 'quer durch', 'die Alpen'],
    body: [
      'Ein Panoramazug fährt vom Tal',
      'hinauf zu den Gletscherseen:',
      '196 Brücken, 55 Tunnel und',
      'für jeden ein Fensterplatz.',
    ],
    price: ['Hin und zurück ab', '89 €'],
    note: 'Täglich vom 1. Juni bis 30. September',
    cta: 'Fensterplatz buchen',
    stations: [
      ['08:10', '585 m', 'Talstation'],
      ['09:05', '1.123 m', 'Steinviadukt'],
      ['10:40', '1.820 m', 'Seenplateau'],
      ['12:05', '2.253 m', 'Gletschergipfel'],
    ],
    alt: 'Ein roter Panoramazug auf einem gebogenen Steinviadukt in den Alpen',
  },
  es: {
    kicker: 'Horario de verano 2027',
    title: ['Cuatro horas', 'a través de', 'los Alpes'],
    body: [
      'Un tren panorámico sube del valle',
      'a los lagos del glaciar: 196 puentes,',
      '55 túneles y un asiento junto',
      'a la ventana para cada viajero.',
    ],
    price: ['Ida y vuelta desde', '89 €'],
    note: 'Todos los días, del 1 de junio al 30 de septiembre',
    cta: 'Reserva tu ventanilla',
    stations: [
      ['08:10', '585 m', 'Estación del valle'],
      ['09:05', '1123 m', 'Viaducto de piedra'],
      ['10:40', '1820 m', 'Meseta de los lagos'],
      ['12:05', '2253 m', 'Cumbre del glaciar'],
    ],
    alt: 'Un tren panorámico rojo cruza un viaducto curvo de piedra en los Alpes',
  },
  fr: {
    kicker: 'Horaires d’été 2027',
    title: ['Quatre heures', 'à travers', 'les Alpes'],
    body: [
      'Un train panoramique monte',
      'de la vallée aux lacs glaciaires :',
      '196 ponts, 55 tunnels et',
      'une place côté fenêtre pour tous.',
    ],
    price: ['Aller-retour dès', '89 €'],
    note: 'Tous les jours, du 1er juin au 30 septembre',
    cta: 'Réservez côté fenêtre',
    stations: [
      ['8 h 10', '585 m', 'Gare de la vallée'],
      ['9 h 05', '1 123 m', 'Viaduc de pierre'],
      ['10 h 40', '1 820 m', 'Plateau des lacs'],
      ['12 h 05', '2 253 m', 'Sommet du glacier'],
    ],
    alt: 'Un train panoramique rouge sur un viaduc de pierre courbe dans les Alpes',
  },
  it: {
    kicker: 'Orario estivo 2027',
    title: ['Quattro ore', 'attraverso', 'le Alpi'],
    body: [
      'Un treno panoramico sale',
      'dalla valle ai laghi glaciali:',
      '196 ponti, 55 gallerie e',
      'un posto al finestrino per tutti.',
    ],
    price: ['Andata e ritorno da', '89 €'],
    note: 'Ogni giorno dal 1° giugno al 30 settembre',
    cta: 'Prenota il finestrino',
    stations: [
      ['08:10', '585 m', 'Stazione a valle'],
      ['09:05', '1.123 m', 'Viadotto di pietra'],
      ['10:40', '1.820 m', 'Altopiano dei laghi'],
      ['12:05', '2.253 m', 'Vetta del ghiacciaio'],
    ],
    alt: 'Un treno panoramico rosso su un viadotto curvo di pietra nelle Alpi',
  },
  'pt-BR': {
    kicker: 'Horário de verão 2027',
    title: ['Quatro horas', 'cruzando', 'os Alpes'],
    body: [
      'Um trem panorâmico sobe do vale',
      'até os lagos glaciais: 196 pontes,',
      '55 túneis e um lugar na janela',
      'para cada passageiro.',
    ],
    price: ['Ida e volta a partir de', '€ 89'],
    note: 'Todos os dias, de 1º de junho a 30 de setembro',
    cta: 'Reserve a janela',
    stations: [
      ['08:10', '585 m', 'Estação do vale'],
      ['09:05', '1.123 m', 'Viaduto de pedra'],
      ['10:40', '1.820 m', 'Planalto dos lagos'],
      ['12:05', '2.253 m', 'Cume da geleira'],
    ],
    alt: 'Um trem panorâmico vermelho cruza um viaduto curvo de pedra nos Alpes',
  },
  ru: {
    kicker: 'Летнее расписание 2027',
    title: ['Четыре часа', 'через', 'Альпы'],
    body: [
      'Панорамный поезд поднимается',
      'из долины к ледниковым озёрам:',
      '196 мостов, 55 тоннелей',
      'и место у окна для каждого.',
    ],
    price: ['Туда и обратно от', '89 €'],
    note: 'Ежедневно с 1 июня по 30 сентября',
    cta: 'Место у окна',
    stations: [
      ['08:10', '585 м', 'Станция в долине'],
      ['09:05', '1123 м', 'Каменный виадук'],
      ['10:40', '1820 м', 'Плато озёр'],
      ['12:05', '2253 м', 'Вершина ледника'],
    ],
    alt: 'Красный панорамный поезд на каменном изогнутом виадуке в Альпах',
  },
  tr: {
    kicker: '2027 Yaz Tarifesi',
    title: ['Dört saatte', 'Alpleri', 'boydan boya'],
    body: [
      'Panoramik bir tren vadiden',
      'buzul göllerine tırmanıyor:',
      '196 köprü, 55 tünel ve',
      'herkese pencere kenarı.',
    ],
    price: ['Gidiş-dönüş, başlangıç fiyatı', '89 €'],
    note: 'Her gün, 1 Haziran – 30 Eylül',
    cta: 'Pencere kenarı ayırt',
    stations: [
      ['08.10', '585 m', 'Vadi istasyonu'],
      ['09.05', '1.123 m', 'Taş viyadük'],
      ['10.40', '1.820 m', 'Göller platosu'],
      ['12.05', '2.253 m', 'Buzul zirvesi'],
    ],
    alt: 'Alplerde kıvrımlı taş bir viyadükten geçen kırmızı panoramik tren',
  },
  vi: {
    kicker: 'Lịch chạy mùa hè 2027',
    title: ['Bốn giờ', 'băng qua', 'dãy Alps'],
    body: [
      'Đoàn tàu toàn cảnh leo từ thung lũng',
      'lên những hồ băng: 196 cây cầu,',
      '55 đường hầm và một chỗ ngồi',
      'cạnh cửa sổ cho mỗi hành khách.',
    ],
    price: ['Vé khứ hồi chỉ từ', '89 €'],
    note: 'Hằng ngày từ 1/6 đến 30/9',
    cta: 'Đặt chỗ cạnh cửa sổ',
    stations: [
      ['08:10', '585 m', 'Ga thung lũng'],
      ['09:05', '1.123 m', 'Cầu cạn đá'],
      ['10:40', '1.820 m', 'Cao nguyên hồ'],
      ['12:05', '2.253 m', 'Đỉnh sông băng'],
    ],
    alt: 'Đoàn tàu toàn cảnh màu đỏ chạy qua cầu cạn đá cong trên dãy Alps',
  },
  id: {
    kicker: 'Jadwal musim panas 2027',
    title: ['Empat jam', 'menembus', 'Alpen'],
    body: [
      'Kereta panorama mendaki dari',
      'lembah ke danau gletser:',
      '196 jembatan, 55 terowongan,',
      'dan kursi jendela untuk semua.',
    ],
    price: ['Pulang-pergi mulai', '€89'],
    note: 'Setiap hari, 1 Juni – 30 September',
    cta: 'Pesan kursi jendela',
    stations: [
      ['08.10', '585 m', 'Stasiun lembah'],
      ['09.05', '1.123 m', 'Viaduk batu'],
      ['10.40', '1.820 m', 'Dataran danau'],
      ['12.05', '2.253 m', 'Puncak gletser'],
    ],
    alt: 'Kereta panorama merah melintasi viaduk batu melengkung di Pegunungan Alpen',
  },
  hi: {
    kicker: 'गर्मियों की समय-सारिणी 2027',
    title: ['चार घंटे', 'आल्प्स के', 'आर-पार'],
    body: [
      'एक पैनोरमिक ट्रेन घाटी से',
      'ग्लेशियर झीलों तक चढ़ती है:',
      '196 पुल, 55 सुरंगें और',
      'हर यात्री को खिड़की वाली सीट।',
    ],
    price: ['आने-जाने का किराया', '€89 से'],
    note: 'रोज़, 1 जून से 30 सितंबर तक',
    cta: 'खिड़की वाली सीट बुक करें',
    stations: [
      ['08:10', '585 मी', 'घाटी स्टेशन'],
      ['09:05', '1,123 मी', 'पत्थर का पुल'],
      ['10:40', '1,820 मी', 'झीलों का पठार'],
      ['12:05', '2,253 मी', 'ग्लेशियर शिखर'],
    ],
    alt: 'आल्प्स में घुमावदार पत्थर के पुल से गुज़रती लाल पैनोरमिक ट्रेन',
  },
  ja: {
    kicker: '2027年 夏ダイヤ',
    title: ['4時間で', 'アルプスを', '越える旅'],
    body: [
      'パノラマ列車が谷から',
      '氷河湖まで登ります。',
      '橋は196、トンネルは55、',
      '全席が窓側の特等席です。',
    ],
    price: ['往復運賃', '€89〜'],
    note: '6月1日〜9月30日 毎日運行',
    cta: '窓側の席を予約する',
    stations: [
      ['08:10', '585 m', '谷の駅'],
      ['09:05', '1,123 m', '石の高架橋'],
      ['10:40', '1,820 m', '湖の高原'],
      ['12:05', '2,253 m', '氷河の頂'],
    ],
    alt: 'アルプスの石造りの高架橋を渡る赤いパノラマ列車',
  },
  ko: {
    kicker: '2027 여름 시간표',
    title: ['4시간 동안', '알프스를', '가로지르다'],
    body: [
      '파노라마 열차가 계곡에서',
      '빙하 호수까지 오릅니다.',
      '다리 196개, 터널 55개,',
      '모든 승객에게 창가 좌석.',
    ],
    price: ['왕복 요금', '€89부터'],
    note: '6월 1일~9월 30일 매일 운행',
    cta: '창가 좌석 예약하기',
    stations: [
      ['08:10', '585m', '계곡역'],
      ['09:05', '1,123m', '돌 고가교'],
      ['10:40', '1,820m', '호수 고원'],
      ['12:05', '2,253m', '빙하 정상'],
    ],
    alt: '알프스의 곡선 돌 고가교를 건너는 빨간 파노라마 열차',
  },
  'zh-CN': {
    kicker: '2027 夏季时刻表',
    title: ['四小时', '穿越', '阿尔卑斯'],
    body: [
      '全景列车从山谷出发，',
      '一路攀升到冰川湖畔：',
      '196 座桥、55 条隧道，',
      '每位乘客都有靠窗座位。',
    ],
    price: ['往返票价', '€89 起'],
    note: '6 月 1 日至 9 月 30 日每日开行',
    cta: '预订靠窗座位',
    stations: [
      ['08:10', '585 米', '山谷站'],
      ['09:05', '1123 米', '石拱高架桥'],
      ['10:40', '1820 米', '湖泊高原'],
      ['12:05', '2253 米', '冰川之巅'],
    ],
    alt: '一列红色全景列车驶过阿尔卑斯山中弯曲的石拱高架桥',
  },
};

/** The window of the carriage, and where the train is in it, in the left-to-right slide. */
const WINDOW = { x: 792, y: 64, w: 1064, h: 680 };
const TRAIN_SUBJECT: [number, number] = [1690, 490];

/** The climb: the stations' places along the slide and their heights, from 585 m to 2,253 m. */
const STOPS = [
  { x: 200, m: 585 },
  { x: 620, m: 1123 },
  { x: 1060, m: 1820 },
  { x: 1500, m: 2253 },
];
const yOf = (m: number) => 1030 - ((m - 400) / (2400 - 400)) * 170;

function paneltrain(lang: Lang): Slide {
  const copy = TRAIN[lang];
  const script = scriptOf(lang);
  const head = looks(
    { he: 'Rubik', ar: 'Rubik', hi: 'Poppins', cjk: 'Montserrat', latin: 'Montserrat' }[script],
  );
  const sans = looks(
    { he: 'Rubik', ar: 'Rubik', hi: 'Poppins', cjk: 'Inter', latin: 'Inter' }[script],
  );
  const CREAM = '#F4EFE6';
  const FOREST = '#16382B';
  const PINE = '#2F5D47';
  const INK = '#2B3A33';
  const STONE = '#4C5852';
  const RED = '#B3122B';
  const titleSize = { he: 72, ar: 64, hi: 60, cjk: 70, latin: lang === 'vi' ? 68 : 72 }[script];
  const titleLeading = {
    he: 1.04,
    ar: 1.22,
    hi: 1.32,
    cjk: 1.1,
    latin: lang === 'vi' ? 1.14 : 1.04,
  }[script];
  const bodyLeading = script === 'hi' ? 1.6 : 1.45;
  // The column, from the kicker down: each part where the one above it ends.
  const titleH = Math.round(3 * titleSize * titleLeading) + 16;
  const bodyTop = 150 + titleH + 12;
  const bodyH = Math.round(4 * 28 * bodyLeading) + 22;
  const priceTop = bodyTop + bodyH + 16;

  // The profile of the climb: the ground under the line, the line, the track a little above it.
  const ground = (() => {
    const pts: [number, number][] = [[0, yOf(470)]];
    for (const stop of STOPS) pts.push([stop.x, yOf(stop.m)]);
    pts.push([1920, yOf(2380)]);
    return pts;
  })();
  const line = ground.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${Math.round(y)}`).join('');
  const ridge = `${line}L1920 1080L0 1080Z`;
  const peaks =
    'M0 1000L120 930L190 960L330 880L430 930L560 860L700 910L820 840L960 900L1080 830L1210 880L1330 820L1470 870L1600 800L1720 850L1830 790L1920 830V1080H0Z';

  return slide({ fill: fill(CREAM) }, [
    // Far mountains, faint, behind the profile of the line.
    art(
      { x: 0, y: 760, w: 1920, h: 320 },
      drawn(
        lang,
        1920,
        320,
        `<path d="${peaks}" transform="translate(0 -760)" fill="${PINE}" fill-opacity=".07"/>`,
      ),
    ),
    art(
      { x: 0, y: 820, w: 1920, h: 260 },
      drawn(
        lang,
        1920,
        260,
        `<g transform="translate(0 -820)"><path d="${ridge}" fill="${PINE}" fill-opacity=".14"/>` +
          `<path d="${line}" stroke="${FOREST}" stroke-width="3" stroke-linejoin="round"/>` +
          `<path d="${line}" transform="translate(0 -14)" stroke="${RED}" stroke-width="3" stroke-dasharray="14 8" stroke-linejoin="round"/></g>`,
      ),
    ),
    // The window: its dark frame, the picture, and a glint across the glass.
    shape({
      frame: at(lang, WINDOW.x - 14, WINDOW.y - 14, WINDOW.w + 28, WINDOW.h + 28),
      fill: fill(FOREST),
      round: 0.08,
      shadow: { x: 0, y: 24, blur: 48, color: '#16382B', alpha: 0.28 },
    }),
    turned(
      lang,
      picture(at(lang, WINDOW.x, WINDOW.y, WINDOW.w, WINDOW.h), copy.alt, {
        mask: { kind: 'rounded', radius: 46 },
      }),
    ),
    art(
      at(lang, WINDOW.x + 30, WINDOW.y + 26, 300, 220),
      drawn(
        lang,
        300,
        220,
        `<path d="M40 0L0 60V96L104 0Z" fill="#FFFFFF" fill-opacity=".16"/><path d="M150 0L0 150V176L176 0Z" fill="#FFFFFF" fill-opacity=".09"/>`,
      ),
    ),
    textBox({
      frame: at(lang, 104, 96, 640, 40),
      lines: [copy.kicker],
      look: sans(26, 700, RED, script === 'latin' ? 0.6 : 0),
      lang,
    }),
    textBox({
      frame: at(lang, 104, 150, 660, titleH),
      lines: copy.title,
      look: head(titleSize, 800, FOREST, script === 'latin' ? -1.2 : 0),
      lang,
      lineHeight: titleLeading,
      vAlign: 'top',
    }),
    textBox({
      frame: at(lang, 104, bodyTop, 640, bodyH),
      lines: copy.body,
      look: sans(28, 400, INK),
      lang,
      lineHeight: bodyLeading,
      vAlign: 'top',
    }),
    textBox({
      frame: at(lang, 104, priceTop, 640, 40),
      lines: [copy.price[0]],
      look: sans(24, 500, STONE),
      lang,
    }),
    textBox({
      frame: at(lang, 104, priceTop + 42, 420, 88),
      lines: [copy.price[1]],
      look: head(68, 800, RED),
      lang,
    }),
    textBox({
      frame: at(lang, 104, priceTop + 130, 640, 40),
      lines: [copy.note],
      look: sans(24, 500, STONE),
      lang,
    }),
    shape({
      frame: at(lang, 104, priceTop + 184, Math.max(300, measure(copy.cta, 24) + 72), 60),
      fill: fill(FOREST),
      round: 0.5,
      label: { text: copy.cta, look: sans(24, 700, CREAM), lang },
    }),
    // The stations on the line: a marker, the time and height, the name above.
    ...STOPS.flatMap((stop, i) => {
      const [time, height, name] = copy.stations[i]!;
      const y = Math.round(yOf(stop.m));
      const top = i === STOPS.length - 1;
      const labelX = stop.x + 24;
      return [
        shape({
          frame: at(lang, stop.x - 13, y - 13, 26, 26),
          preset: 'ellipse',
          fill: fill(top ? RED : CREAM),
          stroke: { color: { value: top ? RED : FOREST }, width: 4 },
        }),
        textBox({
          frame: at(lang, labelX, y - 102, 306, 40),
          lines: [name],
          look: sans(24, 700, FOREST),
          lang,
        }),
        textBox({
          frame: at(lang, labelX, y - 64, 306, 38),
          lines: [`${time} · ${height}`],
          look: sans(24, 500, STONE),
          lang,
        }),
      ];
    }),
  ]);
}

// ---------------------------------------------------------------------------------------------

type Draw = (lang: Lang) => Slide;

/** A design in every language: Hebrew and English, and the rest as `more`. */
function everywhere(draw: Draw): Pick<DesignEntry, 'he' | 'en' | 'more'> {
  const more: DesignEntry['more'] = {};
  for (const lang of CONTENT_LANGUAGES) {
    if (lang === 'he' || lang === 'en') continue;
    more[lang] = draw(lang);
  }
  return { he: draw('he'), en: draw('en'), more };
}

export const designs: DesignEntry[] = [
  {
    id: 'm-nightmarket',
    group: 'food',
    name: { he: 'שוק לילה של מטבחי העולם', en: 'World kitchens night market' },
    subject: NIGHT_SUBJECT,
    ...everywhere(nightmarket),
  },
  {
    id: 'm-paneltrain',
    group: 'tourism',
    name: { he: 'רכבת פנורמית באלפים', en: 'Alpine panorama train' },
    subject: TRAIN_SUBJECT,
    ...everywhere(paneltrain),
  },
];
