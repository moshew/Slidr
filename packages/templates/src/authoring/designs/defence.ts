// Ready-made slides of the `defence` topic (דיפנס־טק), second set: five slides of five kinds, all
// on protective, civil-facing technology. A product with its concept drawn round it (m-antijam), a
// scene through the product's own eyes (m-thermal), a system on a map (m-meshradio), an event
// invitation (m-cyberrange) and a training product (m-simtraining). Each picture is a render of
// its own: `artwork/<id>.html`, rendered by `artwork/defence-pictures.sh`.
import type { Element, Frame, ImageElement, Slide } from '@slidr/model';
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
  type Line,
  type Look,
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
const mono = looks('JetBrains Mono');
/** The picture, turned round for the Hebrew slide when its composition is mirrored. */
const flipped = (lang: Lang, image: ImageElement): ImageElement => (lang === 'he' ? { ...image, flipH: true } : image);
/** An SVG drawing; `ltr` keeps its Latin letters in order on a Hebrew slide. */
const svg = (w: number, h: number, body: string, ltr = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"${
    ltr ? ' direction="ltr" unicode-bidi="isolate"' : ''
  }>${body}</svg>`;
/** The same SVG body, mirrored for Hebrew (only for drawings without letters). */
const mirrored = (lang: Lang, w: number, body: string) =>
  lang === 'he' ? `<g transform="translate(${w} 0) scale(-1 1)">${body}</g>` : body;

/** A row of key figures: a thin rule, the figure, and what it counts. */
function figures(
  lang: Lang,
  items: [value: string, label: string][],
  o: { x: number; y: number; w: number; gap: number; value: Look; label: Look; rule: string; ruleAlpha?: number },
): Element[] {
  const out: Element[] = [];
  items.forEach(([value, label], i) => {
    const x = o.x + i * (o.w + o.gap);
    const f = at(lang, x, o.y, o.w, 0);
    const latin = /^[\x20-\x7E×−–°<>·]+$/.test(value);
    out.push(
      rule([f.x, o.y], [f.x + o.w, o.y], { color: { value: o.rule, ...(o.ruleAlpha !== undefined ? { alpha: o.ruleAlpha } : {}) }, width: 2 }),
      textBox({
        frame: at(lang, x, o.y + 18, o.w, Math.round(o.value.size * 1.25)),
        lines: [value],
        look: o.value,
        lang,
        ...(lang === 'he' && latin ? { dir: 'ltr' as const, align: 'end' as const } : {}),
      }),
      textBox({
        frame: at(lang, x, o.y + 22 + Math.round(o.value.size * 1.25), o.w, 40),
        lines: [label],
        look: o.label,
        lang,
      }),
    );
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// m-thermal: a scene through the product's eyes. A rescue drone's thermal camera looks down on a
// forest at night; one hiker, seated against a boulder with an arm raised, burns white in the
// ironbow palette. The headline sits in the cold dark, a reticle and a reading mark the find, and
// the palette's own scale runs down the far edge.
function thermal(lang: Lang): Slide {
  const he = lang === 'he';
  const t = looks(he ? 'Rubik' : 'Montserrat');
  const ink = '#07050A';
  const amber = '#FFB547';
  const copy = he
    ? {
        kicker: 'EMBER T640  ·  מצלמה תרמית לחיפוש והצלה',
        title: ['החושך מסתיר.', 'החום מגלה.'],
        lead: ['מצלמה תרמית לרחפני חילוץ שמאתרת אדם', 'מתחת לעצים או בתוך עשן, ממרחק 1.2 ק״מ.'],
        figures: [
          ['1.2 km', 'לאיתור אדם'],
          ['640×512', 'פיקסלים תרמיים'],
          ['<40 mK', 'רגישות לחום'],
        ] as [string, string][],
        button: 'לתיאום הדגמת לילה',
        note: 'הדגמות לילה מ־14.1.2027',
        found: 'אדם',
      }
    : {
        kicker: 'EMBER T640  ·  THERMAL SEARCH CAMERA',
        title: ['Darkness hides.', 'Heat doesn’t.'],
        lead: ['A thermal camera for rescue drones. It finds', 'a person under trees or in smoke, 1.2 km away.'],
        figures: [
          ['1.2 km', 'to spot a person'],
          ['640×512', 'thermal pixels'],
          ['<40 mK', 'sensitivity'],
        ] as [string, string][],
        button: 'Book a night demo',
        note: 'Night demos from 14.1.2027',
        found: 'PERSON',
      };
  // the reticle round the hiker (English slide), and its reading
  const box = { x: 1282, y: 580, w: 182, h: 290 };
  const corner = (cx: number, cy: number, d: string) =>
    art(at(lang, cx, cy, 40, 40), svg(40, 40, mirrored(lang, 40, `<path d="${d}" fill="none" stroke="${amber}" stroke-width="4" stroke-linecap="square"/>`)));
  const ironbow: [string, number][] = [
    ['#000008', 0],
    ['#1C0554', 0.14],
    ['#73048F', 0.32],
    ['#C91F6B', 0.48],
    ['#F5611A', 0.63],
    ['#FFB81A', 0.77],
    ['#FFF28C', 0.9],
    ['#FFFFF7', 1],
  ];
  const scaleX = 1790;
  return slide({ fill: fill(ink) }, [
    // the picture is drawn a quarter larger than the slide, so the hiker is big enough to find
    flipped(lang, picture(at(lang, -240, -135, 2400, 1350), 'A hiker found at night in a forest clearing, seen through a thermal camera')),
    shape({
      frame: at(lang, 0, 0, 1150, 1080),
      fill: linear(he ? 270 : 90, [ink, 0, 0.96], [ink, 0.52, 0.84], [ink, 1, 0]),
    }),
    shape({ frame: { x: 0, y: 860, w: 1920, h: 220 }, fill: linear(180, [ink, 0, 0], [ink, 1, 0.55]) }),
    textBox({ frame: at(lang, 120, 150, 1000, 40), lines: [copy.kicker], look: t(24, 700, amber, he ? undefined : 4), lang }),
    textBox({
      frame: at(lang, 120, 204, 1000, 222),
      lines: [copy.title[0]!, [[copy.title[1]!, t(96, 800, amber)]]],
      look: t(96, 800, '#FFFFFF'),
      lang,
      lineHeight: 1.12,
    }),
    textBox({ frame: at(lang, 120, 456, 900, 92), lines: copy.lead, look: t(30, 400, '#D6CCD9'), lang, lineHeight: 1.45 }),
    ...figures(lang, copy.figures, {
      x: 120,
      y: 612,
      w: 250,
      gap: 40,
      value: t(50, 700, '#FFFFFF'),
      label: t(24, 400, '#ADA1B4'),
      rule: '#FFFFFF',
      ruleAlpha: 0.28,
    }),
    shape({
      frame: at(lang, 120, 818, 360, 72),
      fill: fill(amber),
      round: 0.5,
      label: { text: copy.button, look: t(26, 700, '#1A0D05'), lang },
    }),
    textBox({ frame: at(lang, 512, 818, 460, 72), lines: [copy.note], look: t(24, 400, '#ADA1B4'), lang }),
    // the find
    corner(box.x, box.y, 'M2 38V2h36'),
    corner(box.x + box.w - 40, box.y, 'M2 2h36v36'),
    corner(box.x, box.y + box.h - 40, 'M2 2v36h36'),
    corner(box.x + box.w - 40, box.y + box.h - 40, 'M38 2v36H2'),
    rule(
      [X(lang, box.x + box.w, 0), box.y],
      [X(lang, box.x + box.w + 44, 0), box.y - 30],
      { color: { value: amber }, width: 3 },
    ),
    shape({ frame: at(lang, box.x + box.w + 44, box.y - 56, 248, 52), fill: fill(amber), round: 0.18 }),
    textBox({
      frame: at(lang, box.x + box.w + 44, box.y - 56, 248, 52),
      lines: [[[copy.found, he ? t(24, 700, '#1A0D05') : mono(24, 700, '#1A0D05')], ['  36.4°C', mono(24, 700, '#1A0D05')]]],
      look: mono(24, 700, '#1A0D05'),
      lang,
      align: 'center',
    }),
    // the palette's scale
    shape({
      frame: at(lang, scaleX, 330, 18, 420),
      fill: linear(0, ...ironbow.map(([c, s]): [string, number] => [c, s])),
      round: 0.5,
    }),
    textBox({
      frame: at(lang, scaleX - 150, 312, 136, 36),
      lines: ['36°C'],
      look: mono(24, 700, '#FFFFFF'),
      lang,
      dir: 'ltr',
      align: he ? 'start' : 'end',
    }),
    textBox({
      frame: at(lang, scaleX - 150, 732, 136, 36),
      lines: ['−2°C'],
      look: mono(24, 700, '#ADA1B4'),
      lang,
      dir: 'ltr',
      align: he ? 'start' : 'end',
    }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-antijam: a product with its idea drawn round it. The antenna in an exploded view (radome,
// seven-element array, machined base) floats over its own reception pattern, whose three nulls
// point at three jammers. A datasheet column of specs and a button sit on the cool grey ground.
function antijamPattern(lang: Lang): string {
  const S = 1060, c = S / 2;
  const flip = lang === 'he' ? -1 : 1;
  const pt = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return [c + flip * r * Math.sin(a), c - r * Math.cos(a)] as const;
  };
  const xy = ([x, y]: readonly [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const jammers = [40, 150, 258];
  const parts: string[] = [];
  for (const r of [240, 340, 440]) parts.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#C6CED6" stroke-width="1.5"/>`);
  parts.push(`<circle cx="${c}" cy="${c}" r="510" fill="none" stroke="#C6CED6" stroke-width="1.5" stroke-dasharray="3 7"/>`);
  for (let d = 0; d < 360; d += 5) {
    const [x1, y1] = pt(d, d % 30 ? 500 : 488), [x2, y2] = pt(d, 510);
    parts.push(`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#AEB7C0" stroke-width="1.5"/>`);
  }
  // what the antenna hears: everything round it, except three narrow wedges aimed at the jammers
  const ring: string[] = [];
  for (let d = 0; d <= 360; d += 1) {
    let r = 452;
    for (const j of jammers) {
      const dd = Math.min(Math.abs(d - j), 360 - Math.abs(d - j));
      if (dd < 9) r = Math.min(r, 150 + (dd / 9) ** 2.4 * 302);
    }
    ring.push(xy(pt(d, r)));
  }
  parts.push(
    `<defs><radialGradient id="cover" cx="50%" cy="50%" r="50%"><stop offset="0.3" stop-color="#E8551A" stop-opacity="0.2"/><stop offset="0.86" stop-color="#E8551A" stop-opacity="0.05"/></radialGradient></defs>`,
    `<polygon points="${ring.join(' ')}" fill="url(#cover)" stroke="#E8551A" stroke-opacity="0.75" stroke-width="2" stroke-linejoin="round"/>`,
  );
  // the jammers, each sitting in its wedge
  jammers.forEach((j) => {
    const [mx, my] = pt(j, 470);
    parts.push(
      `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="30" fill="#FFFFFF" stroke="#E8551A" stroke-width="3"/>`,
      `<circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="4.5" fill="#E8551A"/>`,
      `<path d="M${(mx - 10).toFixed(1)} ${(my - 10).toFixed(1)}a14 14 0 0 0 0 20M${(mx + 10).toFixed(1)} ${(my - 10).toFixed(1)}a14 14 0 0 1 0 20M${(mx - 16).toFixed(1)} ${(my - 16).toFixed(1)}a22 22 0 0 0 0 32M${(mx + 16).toFixed(1)} ${(my - 16).toFixed(1)}a22 22 0 0 1 0 32" fill="none" stroke="#E8551A" stroke-width="2.6" stroke-linecap="round"/>`,
    );
  });
  return svg(S, S, parts.join(''));
}

function antijam(lang: Lang): Slide {
  const he = lang === 'he';
  const t = looks(he ? 'IBM Plex Sans Hebrew' : 'Inter');
  const ink = '#101820';
  const body = '#46515C';
  const muted = '#59636E';
  const orange = '#D9480F';
  const rust = '#B83A0A';
  const copy = he
    ? {
        kicker: 'ANCHOR A7  ·  אנטנת GNSS נגד שיבוש',
        title: ['ה־GPS משובש.', 'הניווט ממשיך.'],
        lead: [
          'שבעה אלמנטים מפנים את הנקודות העיוורות',
          'שלהם אל המשבשים, וכך ספינות, מטוסים ורשתות',
          'חשמל שומרים על המיקום ועל השעון.',
        ],
        specs: [
          ['6', 'משבשים מנוטרלים יחד'],
          ['40 dB', 'הגנה נוספת'],
          ['4', 'מערכות לוויינים'],
          ['1.2 kg', 'אטום, בתקן IP67'],
        ] as [string, string][],
        button: 'להורדת דף המוצר',
      }
    : {
        kicker: 'ANCHOR A7  ·  ANTI-JAM GNSS ANTENNA',
        title: ['GPS jammed.', 'Still on course.'],
        lead: [
          'Seven elements turn their blind spots toward',
          'jammers, so ships, aircraft and power grids',
          'keep both their position and their clock.',
        ],
        specs: [
          ['6', 'jammers nulled at once'],
          ['40 dB', 'added protection'],
          ['4', 'satellite systems'],
          ['1.2 kg', 'sealed to IP67'],
        ] as [string, string][],
        button: 'Get the datasheet',
      };
  const cx = 1390, cy = 545;
  const specs: Element[] = [];
  copy.specs.forEach(([value, label], i) => {
    const x = 120 + (i % 2) * 380, y = 626 + Math.floor(i / 2) * 128;
    const latin = /^[\x20-\x7E×−°]+$/.test(value);
    specs.push(
      rule([X(lang, x, 340), y], [X(lang, x, 340) + 340, y], { color: { value: '#C3CBD3' }, width: 2 }),
      textBox({
        frame: at(lang, x, y + 14, 340, 58),
        lines: [value],
        look: t(46, 700, ink),
        lang,
        ...(he && latin ? { dir: 'ltr' as const, align: 'end' as const } : {}),
      }),
      textBox({ frame: at(lang, x, y + 74, 340, 40), lines: [label], look: t(24, 400, muted), lang }),
    );
  });
  return slide({ fill: radial(he ? 0.28 : 0.72, 0.5, ['#FAFBFC', 0], ['#E4E8EC', 0.78]) }, [
    art(at(lang, cx - 530, cy - 530, 1060, 1060), antijamPattern(lang), 'Reception pattern'),
    flipped(lang, picture(at(lang, 1020, 216, 740, 760), 'An anti-jam GNSS antenna in an exploded view: radome, seven-element array and base')),
    textBox({ frame: at(lang, 120, 156, 760, 40), lines: [copy.kicker], look: t(24, 700, rust, he ? undefined : 3), lang }),
    textBox({
      frame: at(lang, 120, 208, 800, 196),
      lines: [copy.title[0]!, [[copy.title[1]!, t(84, 700, orange)]]],
      look: t(84, he ? 700 : 800, ink),
      lang,
      lineHeight: 1.12,
    }),
    textBox({ frame: at(lang, 120, 428, 780, 136), lines: copy.lead, look: t(30, 400, body), lang, lineHeight: 1.45 }),
    ...specs,
    shape({
      frame: at(lang, 120, 906, 330, 70),
      fill: fill(ink),
      round: 0.14,
      label: { text: copy.button, look: t(26, 600, '#FFFFFF'), lang },
    }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-meshradio: a system on a map. A block of terrain, cut out like a museum relief: a ridge
// between two valleys, a river and a village, and the radios of a rescue operation linked in a
// mesh that hops over the ridge to a team out of sight. Three labels tell the story.
function meshradio(lang: Lang): Slide {
  const he = lang === 'he';
  const t = looks(he ? 'Assistant' : 'DM Sans');
  const ink = '#17221C';
  const body = '#48524B';
  const muted = '#5A635D';
  const cobalt = '#2156E8';
  const copy = he
    ? {
        kicker: 'MESHLINK R4  ·  רשת קשר לצוותי חילוץ',
        title: ['כל מכשיר', 'הוא ממסר.'],
        lead: ['כשאנטנות הסלולר קורסות, מכשירי הצוות', 'מתחברים זה לזה ומעבירים כל שיחה', 'מעל הרכס, ממכשיר למכשיר.'],
        figures: [
          ['64', 'מכשירים ברשת'],
          ['12 km', 'בין שני מכשירים'],
          ['2 s', 'למציאת מסלול'],
        ] as [string, string][],
        button: 'לתיאום ניסוי שטח',
        note: 'במלאי ממרץ 2027',
        tags: ['מחנה בסיס', 'רחפן ממסר', 'צוות מאחורי הרכס'],
      }
    : {
        kicker: 'MESHLINK R4  ·  RESCUE MESH RADIO',
        title: ['Every radio', 'is a tower.'],
        lead: ['When cell towers are down, the team’s', 'radios link up on their own and pass', 'every call over the ridge.'],
        figures: [
          ['64', 'radios per mesh'],
          ['12 km', 'between radios'],
          ['2 s', 'to reroute'],
        ] as [string, string][],
        button: 'Plan a field test',
        note: 'Shipping March 2027',
        tags: ['Base camp', 'Drone relay', 'Team behind the ridge'],
      };
  // the labels, beside the radios they name (English slide)
  const tag = (x: number, y: number, w: number, text: string) => [
    shape({
      frame: at(lang, x, y, w, 46),
      fill: fill('#FFFFFF'),
      round: 0.5,
      shadow: { x: 0, y: 6, blur: 18, color: '#2B2A20', alpha: 0.18 },
    }),
    shape({ frame: at(lang, x + 16, y + 17, 12, 12), fill: fill(cobalt), preset: 'ellipse' }),
    textBox({ frame: at(lang, x + 38, y, w - 52, 46), lines: [text], look: t(24, 600, ink), lang }),
  ];
  return slide({ fill: linear(180, ['#F6F3EC', 0], ['#ECE7DC', 1]) }, [
    flipped(lang, picture(at(lang, 40, 170, 1100, 767), 'A relief model of a ridge and two valleys with a mesh of rescue radios linked over it')),
    ...tag(636, 576, 196, copy.tags[0]!),
    ...tag(580, 184, 210, copy.tags[1]!),
    ...tag(770, 338, 322, copy.tags[2]!),
    textBox({ frame: at(lang, 1200, 196, 620, 40), lines: [copy.kicker], look: t(24, 700, cobalt, he ? undefined : 3), lang }),
    textBox({
      frame: at(lang, 1200, 244, 620, 224),
      lines: [copy.title[0]!, [[copy.title[1]!, t(92, 700, cobalt)]]],
      look: t(92, 700, ink),
      lang,
      lineHeight: 1.12,
    }),
    textBox({ frame: at(lang, 1200, 484, 620, 136), lines: copy.lead, look: t(30, 400, body), lang, lineHeight: 1.45 }),
    ...figures(lang, copy.figures, {
      x: 1200,
      y: 664,
      w: 190,
      gap: 15,
      value: t(52, 700, ink),
      label: t(24, 400, muted),
      rule: '#C9C2B3',
    }),
    shape({
      frame: at(lang, 1200, 867, 300, 70),
      fill: fill(cobalt),
      round: 0.5,
      label: { text: copy.button, look: t(26, 700, '#FFFFFF'), lang },
    }),
    textBox({ frame: at(lang, 1530, 867, 290, 70), lines: [copy.note], look: t(24, 400, muted), lang }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-cyberrange: an invitation. A two-day red team / blue team exercise on a replica of a city's
// water and power networks. The headline, the date and the button sit centred over the exercise
// console, which leans back in perspective and runs off the bottom of the slide.
function cyberrange(lang: Lang): Slide {
  const he = lang === 'he';
  const t = looks(he ? 'Heebo' : 'Space Grotesk');
  const red = '#FF5A5A';
  const blue = '#5C9BFF';
  const white = '#FFFFFF';
  const muted = '#A9ADBF';
  const title: Line[] = he
    ? [
        [['תוקפים', t(88, 800, red)], [' עיר.', t(88, 800, white)]],
        [['ולומדים ', t(88, 800, white)], ['להגן', t(88, 800, blue)], [' עליה.', t(88, 800, white)]],
      ]
    : [
        [['Attack', t(88, 700, red)], [' a city.', t(88, 700, white)]],
        [['Learn to ', t(88, 700, white)], ['defend', t(88, 700, blue)], [' one.', t(88, 700, white)]],
      ];
  const kicker: Line[] = he
    ? [[['RANGE 27  ·  ', t(24, 700, muted)], ['צוות אדום', t(24, 700, red)], ['  מול  ', t(24, 700, muted)], ['צוות כחול', t(24, 700, blue)]]]
    : [[['RANGE 27  ·  ', t(24, 700, muted, 4)], ['RED TEAM', t(24, 700, red, 4)], ['  VS  ', t(24, 700, muted, 4)], ['BLUE TEAM', t(24, 700, blue, 4)]]];
  const copy = he
    ? {
        lead: ['48 שעות על העתק מלא של רשתות המים והחשמל של עיר.', 'חמישה מגינים בכל צוות, מול צוות אדום שלא ישן.'],
        when: '10-11.3.2027  ·  באר שבע', // a hyphen keeps the range in order inside right-to-left text
        button: 'לרישום צוות',
      }
    : {
        lead: ['48 hours on a full replica of a city’s water and power networks.', 'Five defenders a team, against a red team that never sleeps.'],
        when: '10–11.3.2027  ·  Beersheba',
        button: 'Register a team',
      };
  return slide({ fill: fill('#0D0E12') }, [
    shape({ frame: { x: -260, y: 300, w: 1200, h: 980 }, fill: radial(0.5, 0.5, ['#FF3B3B', 0, 0.2], ['#FF3B3B', 0.7, 0]), preset: 'ellipse' }),
    shape({ frame: { x: 980, y: 300, w: 1200, h: 980 }, fill: radial(0.5, 0.5, ['#3D7BFF', 0, 0.22], ['#3D7BFF', 0.7, 0]), preset: 'ellipse' }),
    art(
      { x: 0, y: 0, w: 1920, h: 560 },
      svg(
        1920,
        560,
        `<defs><radialGradient id="f" cx="50%" cy="0%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="m"><rect width="1920" height="560" fill="url(#f)"/></mask><pattern id="p" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#3A3D4C"/></pattern></defs><rect width="1920" height="560" fill="url(#p)" mask="url(#m)"/>`,
      ),
      'Dot grid',
    ),
    picture({ x: 180, y: 548, w: 1560, h: 640 }, 'The console of a red team and blue team exercise on a replica of a city’s networks'),
    textBox({ frame: { x: 260, y: 88, w: 1400, h: 40 }, lines: kicker, look: t(24, 700, muted), lang, align: 'center' }),
    textBox({ frame: { x: 160, y: 126, w: 1600, h: 228 }, lines: title, look: t(88, 700, white), lang, align: 'center', lineHeight: 1.1 }),
    textBox({ frame: { x: 260, y: 356, w: 1400, h: 92 }, lines: copy.lead, look: t(28, 400, muted), lang, align: 'center', lineHeight: 1.45 }),
    textBox({ frame: at(lang, 500, 466, 440, 64), lines: [copy.when], look: t(28, 600, white), lang, align: 'end' }),
    shape({
      frame: at(lang, 980, 466, 300, 64),
      fill: fill(white),
      round: 0.5,
      label: { text: copy.button, look: t(26, 700, '#0D0E12'), lang },
    }),
  ]);
}

// ---------------------------------------------------------------------------------------------
// m-simtraining: a training product at dusk. A full-motion simulator, a white cockpit on six
// actuators, stands on a hangar floor against a warm evening sky; the serif headline, the lead,
// three figures and the button sit in the darker sky on the left.
function simtraining(lang: Lang): Slide {
  const he = lang === 'he';
  const t = looks(he ? 'Assistant' : 'Inter');
  const d = looks(he ? 'Frank Ruhl Libre' : 'DM Serif Display');
  const peach = '#FFC48A';
  const copy = he
    ? {
        kicker: 'SKYRIG H6  ·  סימולטור טיסה בתנועה מלאה',
        title: ['טסים בסערה.', 'נשארים על הקרקע.'],
        lead: ['תא טייס על במת תנועה לצוותי מסוקי חילוץ:', 'חילוץ בכננה בלילה, חילוץ מהים ותקלת מנוע.'],
        figures: [
          ['6 DOF', 'תנועה מלאה'],
          ['220°', 'שדה ראייה'],
          ['300+', 'תרחישי חילוץ'],
        ] as [string, string][],
        button: 'לתיאום יום אימון',
        note: 'מרכז האימונים בחיפה, מפברואר 2027',
      }
    : {
        kicker: 'SKYRIG H6  ·  FULL-MOTION SIMULATOR',
        title: ['Fly the storm.', 'Stay grounded.'],
        lead: ['A full-motion cockpit for rescue helicopter crews:', 'night hoists, sea rescues and engine failures.'],
        figures: [
          ['6 DOF', 'full motion'],
          ['220°', 'field of view'],
          ['300+', 'rescue scenarios'],
        ] as [string, string][],
        button: 'Book a training day',
        note: 'Haifa training centre, from February 2027',
      };
  return slide(
    { fill: radial(he ? 0.28 : 0.72, 0.76, ['#F6AA70', 0], ['#C8605C', 0.2], ['#5A3758', 0.44], ['#211B37', 0.9]) },
    [
      shape({ frame: { x: 0, y: 768, w: 1920, h: 312 }, fill: linear(180, ['#3A2734', 0], ['#140F17', 1]) }),
      shape({ frame: at(lang, 780, 700, 1200, 330), fill: radial(0.5, 0.42, ['#F2A06C', 0, 0.28], ['#F2A06C', 0.62, 0]), preset: 'ellipse' }),
      rule([0, 768], [1920, 768], { color: { value: '#F4B183', alpha: 0.45 }, width: 2 }),
      flipped(lang, picture(at(lang, 880, 300, 1000, 649), 'A full-motion flight simulator: a white cockpit pod on a six-actuator motion platform')),
      textBox({ frame: at(lang, 120, 150, 760, 40), lines: [copy.kicker], look: t(24, 700, peach, he ? undefined : 3), lang }),
      textBox({
        frame: at(lang, 120, 190, 860, 252),
        lines: [copy.title[0]!, [[copy.title[1]!, d(he ? 96 : 104, he ? 700 : 400, peach)]]],
        look: d(he ? 96 : 104, he ? 700 : 400, '#FFFFFF'),
        lang,
        lineHeight: 1.08,
      }),
      textBox({ frame: at(lang, 120, 458, 820, 92), lines: copy.lead, look: t(30, 400, '#EBDCE3'), lang, lineHeight: 1.45 }),
      ...figures(lang, copy.figures, {
        x: 120,
        y: 598,
        w: 220,
        gap: 36,
        value: d(he ? 54 : 58, he ? 700 : 400, '#FFFFFF'),
        label: t(24, 400, '#F3E9EE'),
        rule: '#FFFFFF',
        ruleAlpha: 0.3,
      }),
      shape({
        frame: at(lang, 120, 846, 340, 70),
        fill: fill(peach),
        round: 0.5,
        label: { text: copy.button, look: t(26, 700, '#2A1622'), lang },
      }),
      textBox({ frame: at(lang, 120, 930, 760, 40), lines: [copy.note], look: t(24, 400, '#C9B3C0'), lang }),
    ],
  );
}

export const designs: DesignEntry[] = [
  {
    id: 'm-thermal',
    group: 'defence',
    name: { he: 'מצלמה תרמית לחילוץ', en: 'Thermal search camera' },
    subject: [1372, 727],
    he: thermal('he'),
    en: thermal('en'),
  },
  {
    id: 'm-antijam',
    group: 'defence',
    name: { he: 'אנטנה נגד שיבוש', en: 'Anti-jam antenna' },
    subject: [1390, 545],
    he: antijam('he'),
    en: antijam('en'),
  },
  {
    id: 'm-meshradio',
    group: 'defence',
    name: { he: 'רשת קשר לחילוץ', en: 'Rescue mesh radio' },
    subject: [560, 430],
    he: meshradio('he'),
    en: meshradio('en'),
  },
  {
    id: 'm-cyberrange',
    group: 'defence',
    name: { he: 'תרגיל סייבר', en: 'Cyber range exercise' },
    subject: [960, 800],
    he: cyberrange('he'),
    en: cyberrange('en'),
  },
  {
    id: 'm-simtraining',
    group: 'defence',
    name: { he: 'סימולטור טיסה', en: 'Flight simulator' },
    subject: [1213, 478],
    he: simtraining('he'),
    en: simtraining('en'),
  },
];
