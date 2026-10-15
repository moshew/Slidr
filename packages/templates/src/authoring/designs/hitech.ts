// Ready-made slides of the `hitech` topic (הייטק), second set: five slides of five kinds. An
// invitation (m-hackathon), a launch (m-apilaunch), a programme with a price list (m-bugbounty), a
// call for talks (m-cfp) and results (m-modelrelease). Each picture is a render of its own:
// `artwork/<id>.html`, the 3D ones with `artwork/hitech-render.js`.
import type { Frame, Slide } from '@slidr/model';
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
/** An SVG of the given size whose drawing is mirrored for Hebrew; `ltr` keeps Latin letters in order. */
const svg = (lang: Lang, w: number, h: number, body: string, ltr = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${
    ltr ? ' direction="ltr" unicode-bidi="isolate"' : ''
  }>${lang === 'he' ? `<g transform="translate(${w} 0) scale(-1 1)">${body}</g>` : body}</svg>`;

// ---------------------------------------------------------------------------------------------
// m-hackathon: an invitation. A cream split-flap clock reads 48:00 on a cobalt ground; the
// headline says what the hours are for, and the figures, the button and the dates sit under it.

/** The clock picture (1400x760 page pixels) in the English slide. */
const CLOCK_PIC = { x: 740, y: 246, w: 1260, h: 684 };

function hackathon(lang: Lang): Slide {
  const he = lang === 'he';
  const t = looks(he ? 'Rubik' : 'Space Grotesk');
  const white = '#FFFFFF';
  const soft = '#DCE1FF';
  const peach = '#FFB27D';
  const copy = he
    ? {
        kicker: 'האקתון  ·  מהדורה שלישית  ·  נמל יפו',
        title: ['48 שעות', 'מרעיון לדמו'],
        lead: ['מביאים צוות של עד ארבעה ורעיון חצי אפוי,', 'יוצאים עם דמו עובד ומשוב מהשופטים.'],
        figures: [
          ['320', 'משתתפים'],
          ['150 אלף ₪', 'בפרסים'],
          ['40', 'מנטורים'],
        ],
        button: 'רשמו צוות  ←',
        // the dates isolated left to right, or the bidi algorithm turns 21–23 around
        when: '\u206621–23.1.2027\u2069  ·  האנגר 11, נמל יפו',
      }
    : {
        kicker: 'HACKATHON  ·  3RD EDITION  ·  JAFFA PORT',
        title: ['48 hours', 'from idea to demo'],
        lead: ['Bring a team of up to four and a half-baked idea.', 'Leave with a working demo and a jury’s verdict.'],
        figures: [
          ['320', 'builders'],
          ['₪150K', 'in prizes'],
          ['40', 'mentors'],
        ],
        button: 'Register your team  →',
        when: '21–23.1.2027  ·  Hangar 11, Jaffa Port',
      };
  const columns = he
    ? ([
        [120, 170],
        [330, 300],
        [670, 170],
      ] as const)
    : ([
        [120, 170],
        [330, 240],
        [610, 170],
      ] as const);
  const figureEls = copy.figures.flatMap(([value, label], i) => {
    const [x, w] = columns[i]!;
    return [
      textBox({
        frame: at(lang, x, 652, w, 80),
        lines: [value!],
        look: t(62, 700, white, -1),
        lang,
      }),
      textBox({ frame: at(lang, x, 734, w, 40), lines: [label!], look: t(26, 400, soft), lang }),
    ];
  });
  const pic = at(lang, CLOCK_PIC.x, CLOCK_PIC.y, CLOCK_PIC.w, CLOCK_PIC.h);
  return slide({ fill: linear(he ? 200 : 160, ['#2C46F5', 0], ['#1B29C6', 1]) }, [
    // engineering paper: a faint grid of dots
    art(
      { x: 0, y: 0, w: 1920, h: 1080 },
      svg(
        lang,
        1920,
        1080,
        '<defs><pattern id="hk-dots" width="48" height="48" patternUnits="userSpaceOnUse"><circle cx="24" cy="24" r="2" fill="#FFFFFF" fill-opacity=".09"/></pattern></defs><rect width="1920" height="1080" fill="url(#hk-dots)"/>',
      ),
    ),
    shape({
      frame: at(lang, 860, 190, 1120, 860),
      preset: 'ellipse',
      fill: radial(0.5, 0.5, ['#7A90FF', 0, 0.5], ['#7A90FF', 0.72, 0]),
    }),
    picture(pic, 'A split-flap clock reading 48:00'),
    textBox({ frame: at(lang, 120, 100, 1100, 44), lines: [copy.kicker], look: t(26, 600, soft, he ? 1 : 4), lang }),
    textBox({
      frame: at(lang, 112, 140, 1320, 292),
      lines: [[piece(copy.title[0]!, t(128, 700, white, -2))], [piece(copy.title[1]!, t(128, 700, peach, -2))]],
      look: t(128, 700, white, -2),
      lang,
      lineHeight: 1.0,
    }),
    textBox({ frame: at(lang, 120, 466, 800, 100), lines: copy.lead, look: t(32, 400, '#DDE2FF'), lang, lineHeight: 1.4 }),
    shape({ frame: at(lang, 120, 620, 640, 2), fill: fill(white, 0.28) }),
    ...figureEls,
    shape({
      frame: at(lang, 120, 896, 360, 80),
      fill: fill('#FF6A2A'),
      round: 0.5,
      shadow: { x: 0, y: 14, blur: 30, color: '#0B124F', alpha: 0.35 },
      label: { text: copy.button, look: t(28, 700, '#0E1452'), lang },
    }),
    textBox({ frame: at(lang, 512, 896, 640, 80), lines: [copy.when], look: t(28, 600, white), lang }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-apilaunch: a launch. Glass and dark code cards float in coloured light on a pale ground: the
// SDK call, its response, the install line and the latency it now takes.

/** The cards picture (1200x1000 page pixels): in the English slide, and its x in the Hebrew one, where
 * it is not mirrored (code reads left to right) and sits a little further out. */
const API_PIC = { x: 760, y: 50, w: 1180, h: 983, heX: -80 };

function apilaunch(lang: Lang): Slide {
  const he = lang === 'he';
  const t = looks(he ? 'IBM Plex Sans Hebrew' : 'Manrope');
  const ink = '#14152A';
  const violet = '#5B3DF5';
  const grey = '#4A4F6A';
  const copy = he
    ? {
        chip: '●  באוויר עכשיו  ·  v3.0',
        title: ['API v3 באוויר', 'ומהיר פי שלושה'],
        lead: ['ערכות SDK עם טיפוסים בתשע שפות, וובהוקים', 'שאפשר לשדר מחדש ונקודת קצה אחת לכל אזור.'],
        figures: [
          ['38ms', 'זמן תגובה חציוני'],
          ['9', 'ערכות SDK רשמיות'],
          ['99.99%', 'זמינות מובטחת'],
        ],
        button: 'לתיעוד המלא  ←',
        note: ['v2 ממשיכה לעבוד', 'עד 1.9.2027'],
      }
    : {
        chip: '●  Live now  ·  v3.0',
        title: ['API v3 is live', 'and 3× faster'],
        lead: ['Typed SDKs in nine languages, webhooks you', 'can replay, and one endpoint for every region.'],
        figures: [
          ['38 ms', 'median latency'],
          ['9', 'official SDKs'],
          ['99.99%', 'uptime SLA'],
        ],
        button: 'Read the docs  →',
        note: ['v2 keeps running', 'until 1.9.2027'],
      };
  const columns = [
    [120, 200],
    [360, 200],
    [600, 230],
  ] as const;
  const figureEls = copy.figures.flatMap(([value, label], i) => {
    const [x, w] = columns[i]!;
    return [
      ...(i > 0 ? [shape({ frame: at(lang, x - 20, 668, 2, 92), fill: fill('#C9CBDD') })] : []),
      textBox({
        frame: at(lang, x, 650, w, 72),
        lines: [value!],
        look: t(54, 800, ink, -1),
        lang,
        dir: he ? 'ltr' : undefined,
        align: he ? 'end' : 'start',
      }),
      textBox({ frame: at(lang, x, 726, w, 40), lines: [label!], look: t(24, 500, grey), lang }),
    ];
  });
  return slide({ fill: linear(he ? 225 : 135, ['#FAFAFD', 0], ['#EEF0F7', 1]) }, [
    art(
      { x: 0, y: 0, w: 1920, h: 1080 },
      svg(
        lang,
        1920,
        1080,
        // a fine grid on the side of the code, fading toward the copy
        '<defs><pattern id="api-grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="#5B3DF5" stroke-opacity=".07" stroke-width="1.5"/></pattern><linearGradient id="api-fade" x1="0" x2="1"><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="api-mask"><rect width="1920" height="1080" fill="url(#api-fade)"/></mask></defs><rect width="1920" height="1080" fill="url(#api-grid)" mask="url(#api-mask)"/>',
      ),
    ),
    picture(
      { x: he ? API_PIC.heX : API_PIC.x, y: API_PIC.y, w: API_PIC.w, h: API_PIC.h },
      'Code cards of the SDK, its response and its latency, floating in light',
    ),
    shape({
      frame: at(lang, 120, 150, he ? 330 : 300, 52),
      fill: fill('#E3F6EA'),
      round: 0.5,
      label: { text: copy.chip, look: t(24, 700, '#0B6B3A'), lang },
    }),
    textBox({
      frame: at(lang, 112, 222, 900, 260),
      lines: [[piece(copy.title[0]!, t(108, 800, ink, -3))], [piece(copy.title[1]!, t(108, 800, violet, -3))]],
      look: t(108, 800, ink, -3),
      lang,
      lineHeight: 1.08,
    }),
    textBox({ frame: at(lang, 120, 508, 760, 100), lines: copy.lead, look: t(32, 500, grey), lang, lineHeight: 1.4 }),
    ...figureEls,
    shape({
      frame: at(lang, 120, 864, 330, 84),
      fill: fill(ink),
      round: 0.5,
      shadow: { x: 0, y: 16, blur: 36, color: '#2B1F8F', alpha: 0.28 },
      label: { text: copy.button, look: t(28, 700, '#FFFFFF'), lang },
    }),
    textBox({ frame: at(lang, 484, 864, 330, 84), lines: copy.note, look: t(24, 500, grey), lang, lineHeight: 1.3 }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-bugbounty: a programme with its price list. An emerald jewel beetle walks through a drawn
// sight on a black ground; beside it, what a report is worth at each severity.

/** The beetle picture (1000x1000 page pixels) in the English slide, and the centre of the sight. */
const BUG_PIC = { x: 40, y: 64, w: 960, h: 960 };
const SIGHT = { cx: 520, cy: 540, r: 400 };

function bugbounty(lang: Lang): Slide {
  const he = lang === 'he';
  const t = looks(he ? 'Heebo' : 'Montserrat');
  const mono = looks('JetBrains Mono');
  const lime = '#C6FF3D';
  const grey = '#A3A9B4';
  const copy = he
    ? {
        kicker: 'אבטחה  ·  תוכנית באג באונטי',
        title: ['מצאתם באג?', 'קבלו עליו כסף.'],
        lead: ['אנחנו משלמים לחוקרים שמדווחים באחריות', 'על חולשות באפליקציות, ב־API ובענן שלנו.'],
        head: ['חומרה', 'פרס, עד'],
        levels: ['קריטית', 'גבוהה', 'בינונית', 'נמוכה'],
        button: 'שלחו דיווח  ←',
        note: 'מענה ראשון תוך 48 שעות',
      }
    : {
        kicker: 'SECURITY  ·  BUG BOUNTY PROGRAM',
        title: ['Find a bug.', 'Get paid for it.'],
        lead: ['We pay researchers who responsibly report', 'flaws in our apps, our API and our cloud.'],
        head: ['SEVERITY', 'REWARD, UP TO'],
        levels: ['Critical', 'High', 'Medium', 'Low'],
        button: 'Submit a report  →',
        note: 'First reply within 48 hours',
      };
  // the column heads: small mono capitals in English, Heebo in Hebrew (the mono face has no Hebrew)
  const head = he ? t(24, 600, '#8A91A0') : mono(24, 600, '#7D8492', 2);
  const rows = [
    ['#FF4D4F', 1, '$40,000'],
    ['#FF9F1C', 0.62, '$12,000'],
    ['#FFD43B', 0.36, '$3,000'],
    ['#7FD8FF', 0.16, '$500'],
  ] as const;
  const left = 1080;
  const track = { x: 1290, w: 250 };
  const rowY = (i: number) => 600 + i * 72;
  const rowEls = rows.flatMap(([color, share, amount], i) => {
    const y = rowY(i);
    return [
      shape({ frame: at(lang, left, y + 72, 720, 1.5), fill: fill('#FFFFFF', 0.1) }),
      shape({
        frame: at(lang, left, y + 26, 20, 20),
        preset: 'ellipse',
        fill: fill(color),
        shadow: { x: 0, y: 0, blur: 14, color, alpha: 0.8 },
      }),
      textBox({ frame: at(lang, left + 40, y + 8, 180, 56), lines: [copy.levels[i]!], look: t(30, 600, '#FFFFFF'), lang }),
      shape({ frame: at(lang, track.x, y + 33, track.w, 6), fill: fill('#FFFFFF', 0.1), round: 0.5 }),
      shape({ frame: at(lang, track.x, y + 33, Math.round(track.w * share), 6), fill: fill(color), round: 0.5 }),
      textBox({
        frame: at(lang, 1580, y + 8, 220, 56),
        lines: [amount],
        look: mono(32, 700, '#FFFFFF'),
        lang,
        dir: 'ltr',
        align: he ? 'start' : 'end',
      }),
    ];
  });
  const { cx, cy, r } = SIGHT;
  const ticks = [0, 90, 180, 270]
    .map((a) => {
      const rad = (a * Math.PI) / 180;
      const [x1, y1] = [cx + Math.cos(rad) * (r - 18), cy + Math.sin(rad) * (r - 18)];
      const [x2, y2] = [cx + Math.cos(rad) * (r + 40), cy + Math.sin(rad) * (r + 40)];
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lime}" stroke-width="4" stroke-linecap="round"/>`;
    })
    .join('');
  const degrees = Array.from({ length: 72 }, (_, i) => {
    const rad = (i * 5 * Math.PI) / 180;
    const inner = r + (i % 6 === 0 ? 8 : 14);
    return `<line x1="${cx + Math.cos(rad) * inner}" y1="${cy + Math.sin(rad) * inner}" x2="${cx + Math.cos(rad) * (r + 22)}" y2="${cy + Math.sin(rad) * (r + 22)}"/>`;
  }).join('');
  const bracket = (x: number, y: number, dx: number, dy: number) =>
    `<path d="M${x} ${y + dy * 56}V${y}H${x + dx * 56}" fill="none" stroke="${lime}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const sight = [
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${lime}" stroke-opacity=".38" stroke-width="2"/>`,
    `<circle cx="${cx}" cy="${cy}" r="${r - 80}" fill="none" stroke="${lime}" stroke-opacity=".18" stroke-width="2" stroke-dasharray="4 14"/>`,
    `<g stroke="${lime}" stroke-opacity=".3" stroke-width="2">${degrees}</g>`,
    ticks,
    bracket(cx - r - 70, cy - r - 70, 1, 1),
    bracket(cx + r + 70, cy - r - 70, -1, 1),
    bracket(cx - r - 70, cy + r + 70, 1, -1),
    bracket(cx + r + 70, cy + r + 70, -1, -1),
  ].join('');
  return slide({ fill: fill('#0A0B0D') }, [
    shape({
      frame: at(lang, cx - 520, BUG_PIC.y, 1040, 960),
      preset: 'ellipse',
      fill: radial(0.5, 0.5, ['#3BD16F', 0, 0.2], ['#3BD16F', 0.7, 0]),
    }),
    art({ x: 0, y: 0, w: 1920, h: 1080 }, svg(lang, 1920, 1080, sight)),
    // the beetle has no letters, so the Hebrew slide turns it to walk the other way
    { ...picture(at(lang, BUG_PIC.x, BUG_PIC.y, BUG_PIC.w, BUG_PIC.h), 'An emerald jewel beetle seen from above'), ...(he ? { flipH: true } : {}) },
    textBox({ frame: at(lang, left, 104, 720, 44), lines: [copy.kicker], look: t(24, 700, lime, he ? 1 : 3), lang }),
    textBox({
      frame: at(lang, left - 8, 144, 760, 250),
      lines: [[piece(copy.title[0]!, t(98, 800, '#FFFFFF', -2))], [piece(copy.title[1]!, t(98, 800, lime, -2))]],
      look: t(98, 800, '#FFFFFF', -2),
      lang,
      lineHeight: 1.08,
    }),
    textBox({ frame: at(lang, left, 404, 720, 96), lines: copy.lead, look: t(30, 400, grey), lang, lineHeight: 1.4 }),
    textBox({ frame: at(lang, left, 552, 300, 40), lines: [copy.head[0]!], look: head, lang }),
    textBox({
      frame: at(lang, 1500, 552, 300, 40),
      lines: [copy.head[1]!],
      look: head,
      lang,
      align: 'end',
    }),
    shape({ frame: at(lang, left, 600, 720, 1.5), fill: fill('#FFFFFF', 0.1) }),
    ...rowEls,
    shape({
      frame: at(lang, left, 916, 330, 80),
      fill: fill(lime),
      round: 0.5,
      shadow: { x: 0, y: 0, blur: 40, color: lime, alpha: 0.35 },
      label: { text: copy.button, look: t(28, 700, '#0A0B0D'), lang },
    }),
    textBox({ frame: at(lang, left + 360, 916, 400, 80), lines: [copy.note], look: t(26, 500, grey), lang }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-cfp: a call for talks. An empty lectern waits in a spotlight on a round stage, on deep wine;
// a serif headline, the tracks as chips, the two dates that matter and the button.

/** The stage picture (1000x1100 page pixels) in the English slide; its beam falls from the top edge. */
const CFP_PIC = { x: 960, y: 0, w: 982, h: 1080 };

function cfp(lang: Lang): Slide {
  const he = lang === 'he';
  const serif = looks(he ? 'Frank Ruhl Libre' : 'Playfair Display');
  const t = looks(he ? 'Assistant' : 'DM Sans');
  const cream = '#F7ECDD';
  const peach = '#FFB48C';
  const rose = '#EBC7CC';
  const copy = he
    ? {
        kicker: 'DevShore 2027  ·  קול קורא להרצאות',
        title: ['הבמה', 'מחכה לכם.'],
        lead: ['מחפשים 40 הרצאות ממהנדסים שבנו משהו אמיתי', 'ולמדו בדרך משהו קשה.'],
        tracks: [
          ['AI בפרודקשן', 190],
          ['פלטפורמה ותשתיות', 250],
          ['אבטחה', 130],
          ['פרונטאנד בקנה מידה', 270],
        ] as const,
        dates: [
          ['20.12.2026', 'סגירת ההגשות'],
          ['9–10.3.2027', 'הכנס, חיפה'],
        ],
        button: 'הגישו הרצאה  ←',
      }
    : {
        kicker: 'DEVSHORE 2027  ·  CALL FOR PAPERS',
        title: ['Your talk', 'belongs here.'],
        lead: ['We’re looking for 40 talks from engineers who', 'built something real and learned something hard.'],
        tracks: [
          ['AI in production', 262],
          ['Platform & infra', 258],
          ['Security', 160],
          ['Frontend at scale', 272],
        ] as const,
        dates: [
          ['20.12.2026', 'submissions close'],
          ['9–10.3.2027', 'the conference, Haifa'],
        ],
        button: 'Submit a talk  →',
      };
  const chipEls = copy.tracks.map(([label, w], i) => {
    const row = i < 2 ? 0 : 1;
    const before = copy.tracks.slice(row * 2, i).reduce((sum, [, width]) => sum + width + 14, 0);
    return shape({
      frame: at(lang, 120 + before, 586 + row * 70, w, 56),
      fill: fill('#FFFFFF', 0.06),
      round: 0.5,
      stroke: { color: { value: cream, alpha: 0.4 }, width: 1.5 },
      label: { text: label, look: t(26, 500, cream), lang },
    });
  });
  const dateEls = copy.dates.flatMap(([value, label], i) => {
    const x = 120 + i * 330;
    return [
      ...(i > 0 ? [shape({ frame: at(lang, x - 34, 778, 1.5, 96), fill: fill(cream, 0.35) })] : []),
      textBox({
        frame: at(lang, x, 764, 300, 70),
        lines: [value!],
        look: serif(50, 700, cream),
        lang,
        dir: 'ltr',
        align: he ? 'end' : 'start',
      }),
      textBox({ frame: at(lang, x, 836, 300, 40), lines: [label!], look: t(24, 500, rose), lang }),
    ];
  });
  return slide({ fill: radial(he ? 0.27 : 0.73, 0.55, ['#6A1830', 0], ['#3E0B1A', 0.55], ['#24050E', 1]) }, [
    { ...picture(at(lang, CFP_PIC.x, CFP_PIC.y, CFP_PIC.w, CFP_PIC.h), 'An empty lectern in a spotlight on a round stage'), ...(he ? { flipH: true } : {}) },
    textBox({ frame: at(lang, 120, 108, 800, 40), lines: [copy.kicker], look: t(24, 700, peach, he ? 1 : 3), lang }),
    textBox({
      frame: at(lang, 112, 146, 860, 280),
      lines: [
        [piece(copy.title[0]!, serif(120, he ? 900 : 700, cream))],
        [piece(copy.title[1]!, { ...serif(120, he ? 900 : 700, peach), ...(he ? {} : { italic: true }) })],
      ],
      look: serif(120, 700, cream),
      lang,
      lineHeight: 1.05,
    }),
    textBox({ frame: at(lang, 120, 450, 800, 96), lines: copy.lead, look: t(30, 400, rose), lang, lineHeight: 1.45 }),
    ...chipEls,
    ...dateEls,
    shape({
      frame: at(lang, 120, 916, 320, 80),
      fill: fill(cream),
      round: 0.5,
      shadow: { x: 0, y: 14, blur: 34, color: '#12020A', alpha: 0.5 },
      label: { text: copy.button, look: t(28, 700, '#4A0D1F'), lang },
    }),
  ]);
}

export const designs: DesignEntry[] = [
  {
    id: 'm-hackathon',
    group: 'hitech',
    name: { he: 'הזמנה להאקתון', en: '48-hour hackathon' },
    subject: [1300, 660],
    he: hackathon('he'),
    en: hackathon('en'),
  },
  {
    id: 'm-apilaunch',
    group: 'hitech',
    name: { he: 'השקת API', en: 'API launch' },
    subject: [1380, 500],
    he: apilaunch('he'),
    en: apilaunch('en'),
  },
  {
    id: 'm-bugbounty',
    group: 'hitech',
    name: { he: 'תוכנית באג באונטי', en: 'Bug bounty program' },
    subject: [440, 550],
    he: bugbounty('he'),
    en: bugbounty('en'),
  },
  {
    id: 'm-cfp',
    group: 'hitech',
    name: { he: 'קול קורא להרצאות', en: 'Call for papers' },
    subject: [1440, 690],
    he: cfp('he'),
    en: cfp('en'),
  },
];
