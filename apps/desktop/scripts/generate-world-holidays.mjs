// Original vector illustrations and editable bilingual designs. No remote assets.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const media = fileURLToPath(new URL('../../../../Slidr-media/', import.meta.url));
const circle = (x, y, r, c, extra = '') =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" ${extra}/>`;
const path = (d, c, extra = '') => `<path d="${d}" fill="${c}" ${extra}/>`;
const rect = (x, y, w, h, c, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}" ${extra}/>`;
const line = (x, y, X, Y, c, w = 3) =>
  `<path d="M${x} ${y}L${X} ${Y}" stroke="${c}" stroke-width="${w}" fill="none"/>`;
const group = (x, y, s, body, angle = 0) =>
  `<g transform="translate(${x} ${y}) scale(${s}) rotate(${angle})">${body}</g>`;
const star = (x, y, r, c) =>
  path(
    `M${x} ${y - r}L${x + r * 0.26} ${y - r * 0.26}L${x + r} ${y}L${x + r * 0.26} ${y + r * 0.26}L${x} ${y + r}L${x - r * 0.26} ${y + r * 0.26}L${x - r} ${y}L${x - r * 0.26} ${y - r * 0.26}Z`,
    c,
  );
const stars = (color) =>
  Array.from({ length: 55 }, (_, i) =>
    star(1030 + ((i * 137) % 810), 70 + ((i * 173) % 860), i % 4 === 0 ? 7 : 3, color),
  ).join('');
const leaf = (x, y, s, c, a = 0) =>
  group(
    x,
    y,
    s,
    path('M0 0Q-65 -65 0 -155Q65 -65 0 0', c) + line(0, 0, 0, -127, '#ffffff55', 2),
    a,
  );
const sprig = (x, y, s, a = 0) =>
  group(
    x,
    y,
    s,
    line(0, 0, 0, -250, '#91aa8a', 5) +
      Array.from(
        { length: 9 },
        (_, i) =>
          line(0, -i * 25, -65 + i * 4, -i * 25 - 65, '#416f58', 7) +
          line(0, -i * 25, 65 - i * 4, -i * 25 - 65, '#608c65', 6),
      ).join(''),
    a,
  );
const gift = (x, y, s, c) =>
  group(
    x,
    y,
    s,
    rect(0, 0, 175, 150, c) +
      rect(72, 0, 27, 150, '#f6d79c') +
      rect(-8, -12, 191, 30, c) +
      path(
        'M85 -10C-20 -75 18 -110 85 -20C160 -110 210 -66 85 -10Z',
        'none',
        'stroke="#f6d79c" stroke-width="12"',
      ),
  );
const tree = (x, y, s) =>
  group(
    x,
    y,
    s,
    rect(-17, 0, 34, 65, '#8a563e') +
      path(
        'M0 -520L120 -300H75L185 -140H130L250 35H-250L-130 -140H-185L-75 -300H-120Z',
        '#285d4d',
      ) +
      path('M0 -520L30 -300H0L75 -140H40L120 35H-250L-130 -140H-185L-75 -300H-120Z', '#397760') +
      Array.from({ length: 18 }, (_, i) =>
        circle((i % 2 ? 1 : -1) * (22 + i * 8), -360 + i * 20, 9, i % 3 ? '#ecd297' : '#dc6753'),
      ).join('') +
      star(0, -540, 36, '#ffe3a3'),
  );
const pumpkin = (x, y, s, face = false) =>
  group(
    x,
    y,
    s,
    path('M-14 -92Q-20 -145 18 -155L32 -139Q7 -116 12 -88', '#576545') +
      [-65, 65, -32, 32, 0]
        .map(
          (a, i) =>
            `<ellipse cx="${a}" cy="0" rx="${i === 4 ? 45 : 56}" ry="102" fill="${['#c45c2b', '#bf5229', '#e88239', '#de7530', '#f69a43'][i]}"/>`,
        )
        .join('') +
      (face
        ? path(
            'M-62 -30L-26 -50L-21 -8ZM62 -30L26 -50L21 -8ZM-63 25Q0 105 63 25L33 39L20 27L0 48L-20 27L-33 39Z',
            '#3b2438',
          )
        : ''),
  );
const egg = (x, y, s, c, rot = 0) =>
  group(
    x,
    y,
    s,
    path('M0 -140C65 -140 112 -20 107 40C100 140 -100 140 -107 40C-112 -20 -65 -140 0 -140Z', c) +
      path('M-95 0Q0 40 95 0M-102 48Q0 88 102 48', 'none', 'stroke="#fff5d5" stroke-width="12"') +
      [-50, 0, 50].map((a) => star(a, -48, 10, '#fff5d5')).join(''),
    rot,
  );
const lantern = (x, y, s) =>
  group(
    x,
    y,
    s,
    line(0, -330, 0, -150, '#eac57d', 3) +
      rect(-61, -145, 122, 24, '#e5b967') +
      `<ellipse cy="0" rx="115" ry="142" fill="#d94c39"/><ellipse cy="0" rx="75" ry="142" fill="#ec6d43"/><ellipse cy="0" rx="32" ry="142" fill="#f2834c"/>` +
      rect(-61, 121, 122, 24, '#e5b967') +
      line(0, 145, 0, 237, '#eac57d', 8) +
      Array.from({ length: 7 }, (_, i) =>
        line(-18 + i * 6, 214, -18 + i * 6, 277, '#eac57d', 3),
      ).join(''),
  );
const flower = (x, y, s, c) =>
  group(
    x,
    y,
    s,
    Array.from(
      { length: 8 },
      (_, i) => `<ellipse cy="-30" rx="18" ry="33" fill="${c}" transform="rotate(${i * 45})"/>`,
    ).join('') + circle(0, 0, 18, '#f0b642'),
  );
const diya = (x, y, s) =>
  group(
    x,
    y,
    s,
    `<ellipse cy="20" rx="180" ry="50" fill="#f2a651"/>` +
      path('M-180 20Q0 245 180 20Q0 90 -180 20', '#bb493d') +
      path('M-151 54Q0 170 151 54', 'none', 'stroke="#efb85c" stroke-width="7"') +
      path('M0 0C-75 -80 10 -122 0 -198C100 -98 69 -29 0 0', '#ffd16d') +
      path('M0 -10Q-20 -57 17 -100Q47 -35 0 -10', '#fff5bf') +
      Array.from({ length: 11 }, (_, i) =>
        circle(-125 + i * 25, 76 + Math.sin((i / 10) * Math.PI) * 40, 4, '#ffd18a'),
      ).join(''),
  );
const scenes = {};
scenes.christmasEvergreen =
  stars('#c8d5ad') +
  circle(1455, 524, 362, '#d7b574', 'opacity=".09"') +
  Array.from({ length: 12 }, (_, i) => sprig(1490, 590, 1.35, i * 30)).join('') +
  tree(1430, 830, 1.1) +
  gift(1170, 866, 0.76, '#bd514b') +
  gift(1580, 850, 0.9, '#ad8551');
scenes.christmasVillage =
  path('M0 810Q450 730 910 840T1920 770V1080H0Z', '#d6e6ea') +
  path('M0 953Q700 785 1920 909V1080H0Z', '#fffdfa') +
  Array.from({ length: 7 }, (_, i) => {
    const x = 50 + i * 282,
      y = 780 + (i % 3) * 42;
    return group(
      x,
      y,
      1,
      rect(0, 0, 190, 170, ['#b54841', '#bb8270', '#608b91'][i % 3]) +
        path('M-20 0L95 -117L210 0', '#fffdfa') +
        rect(68, 73, 54, 97, '#764739') +
        [25, 125]
          .map(
            (a) =>
              rect(a, 25, 40, 47, '#ffdc8c') +
              line(a + 20, 25, a + 20, 72, '#97614a') +
              line(a, 48, a + 40, 48, '#97614a'),
          )
          .join('') +
        rect(30, -100, 24, 60, '#a55143'),
    );
  }).join('') +
  Array.from({ length: 65 }, (_, i) => {
    const x = (i * 277) % 1920,
      y = (i * 127) % 730;
    return x > 220 && x < 1700 && y > 90 ? '' : circle(x, y, 2 + (i % 3), '#fff');
  }).join('') +
  tree(65, 905, 0.42) +
  tree(1860, 900, 0.55);
scenes.midnightToast =
  stars('#cbae78') +
  [
    [1410, 270, 170],
    [1770, 300, 90],
    [1120, 105, 65],
  ]
    .map(([x, y, r]) =>
      Array.from({ length: 28 }, (_, i) => {
        const a = (i * Math.PI) / 14;
        return line(
          x + Math.cos(a) * r * 0.3,
          y + Math.sin(a) * r * 0.3,
          x + Math.cos(a) * r,
          y + Math.sin(a) * r,
          '#e4bf7c',
          3,
        );
      }).join(''),
    )
    .join('') +
  [
    [-13, 1270, 690],
    [14, 1570, 700],
  ]
    .map(([a, x, y]) =>
      group(
        x,
        y,
        1,
        path(
          'M-75 -250H75L60 -67Q0 38 -60 -67Z',
          '#f7e3b51c',
          'stroke="#efd5a1" stroke-width="5"',
        ) +
          path('M-65 -180H65L53 -64Q0 20 -53 -64Z', '#d8ac63aa') +
          line(0, 5, 0, 185, '#efd5a1', 5) +
          path('M-74 195Q0 160 74 195', 'none', 'stroke="#efd5a1" stroke-width="5"'),
        a,
      ),
    )
    .join('');
scenes.halloweenMoon =
  circle(1450, 340, 233, '#f8cb7f') +
  circle(1512, 288, 30, '#eab779') +
  circle(1356, 398, 49, '#eab779') +
  path('M980 980L1080 675L1140 738L1170 523L1255 604L1300 878L1380 754L1470 980Z', '#30233f') +
  Array.from({ length: 8 }, (_, i) =>
    group(
      1050 + i * 108,
      195 + (i % 3) * 125,
      0.6,
      path(
        'M-65 0Q-30 -25 -15 5L0 -10L15 5Q30 -25 65 0L39 13L24 40L0 20L-24 40L-39 13Z',
        '#34243e',
      ),
      i * 7,
    ),
  ).join('') +
  pumpkin(1430, 874, 1.65, true) +
  pumpkin(1730, 935, 0.85, true) +
  path('M960 1080Q1430 963 1920 1030V1080Z', '#1a1829');
scenes.easterGarden =
  circle(1460, 570, 400, '#ebe9cf') +
  [
    [-20, 1180],
    [20, 1730],
  ]
    .map(([a, x]) => leaf(x, 970, 2.4, '#769780', a))
    .join('') +
  egg(1300, 780, 1.15, '#b692ba', -19) +
  egg(1580, 730, 1.4, '#dfaa68', 14) +
  egg(1760, 883, 0.77, '#789caa', 23) +
  flower(1150, 630, 0.8, '#faf5df') +
  flower(1720, 440, 1.15, '#fff9e8') +
  flower(1400, 998, 0.65, '#c897ab') +
  leaf(1100, 840, 1.25, '#a9b79a', -43);
scenes.diwaliLights =
  Array.from({ length: 36 }, (_, i) =>
    group(
      1470,
      540,
      1,
      `<ellipse cy="-265" rx="36" ry="140" fill="none" stroke="#ba7850" stroke-width="2" transform="rotate(${i * 10})"/>`,
    ),
  ).join('') +
  circle(1470, 540, 382, 'none', 'stroke="#cc9359" stroke-width="3"') +
  circle(1470, 540, 400, 'none', 'stroke="#cc9359" stroke-width="2" stroke-dasharray="3 14"') +
  diya(1490, 660, 1.25) +
  diya(1130, 880, 0.55) +
  diya(1800, 850, 0.62) +
  stars('#f9c875');
scenes.lunarLanterns =
  lantern(1330, 275, 1.12) +
  lantern(1730, 180, 0.75) +
  lantern(1640, 728, 0.65) +
  path(
    'M1050 1050Q1250 770 1890 820M1600 865Q1540 670 1790 515',
    'none',
    'stroke="#ad8d64" stroke-width="12"',
  ) +
  [
    [1150, 951],
    [1320, 857],
    [1600, 802],
    [1780, 828],
    [1650, 647],
    [1750, 555],
  ]
    .map(([x, y], i) => flower(x, y, 0.45 + (i % 2) * 0.15, '#f4c4a2'))
    .join('') +
  path('M1000 990Q1400 990 1910 1000', 'none', 'stroke="#d4a364" stroke-width="3"');
scenes.eidGathering =
  path('M1040 1080V430Q1040 235 1460 73Q1880 235 1880 430V1080Z', '#235f65') +
  path(
    'M1070 1080V430Q1070 257 1460 115Q1850 257 1850 430V1080',
    'none',
    'stroke="#d2b47d" stroke-width="3"',
  ) +
  circle(1460, 352, 120, '#f1d49a') +
  circle(1500, 320, 110, '#235f65') +
  stars('#e9cb93') +
  `<ellipse cx="1460" cy="906" rx="332" ry="87" fill="#d9bf89"/><ellipse cx="1460" cy="890" rx="315" ry="76" fill="#efe0b5"/>` +
  Array.from({ length: 9 }, (_, i) =>
    group(
      1290 + (i % 3) * 125,
      830 + Math.floor(i / 3) * 48,
      1,
      rect(0, 0, 90, 42, '#bc8952', 'rx="10"') +
        rect(5, 3, 80, 13, '#e3bb77', 'rx="5"') +
        circle(46, 9, 5, '#668359'),
    ),
  ).join('') +
  group(
    1720,
    735,
    0.8,
    path('M-62 -58H62L50 70H-50Z', '#f3ddad') +
      path('M62 -37C140 -56 140 65 54 46', 'none', 'stroke="#f3ddad" stroke-width="13"') +
      line(-52, 0, 52, 0, '#b68a47', 4),
  );
scenes.thanksgivingTable =
  circle(1475, 570, 377, '#eadac1') +
  circle(1475, 570, 320, '#fff9eb', 'stroke="#9b7651" stroke-width="4"') +
  circle(1475, 570, 279, 'none', 'stroke="#d1b893" stroke-width="3"') +
  Array.from({ length: 9 }, (_, i) =>
    leaf(1180 + i * 67, 945, 1.4, ['#a55234', '#cf9650', '#6e7751'][i % 3], -65 + i * 16),
  ).join('') +
  pumpkin(1460, 690, 1.5) +
  pumpkin(1760, 850, 0.65) +
  line(1050, 355, 1050, 777, '#9c7754', 8) +
  [1024, 1042, 1060, 1078].map((x) => line(x, 355, x, 490, '#9c7754', 6)).join('') +
  path('M1870 350Q1790 500 1860 570V780H1880V350Z', '#9c7754');
scenes.valentineLetter =
  circle(1470, 500, 384, '#f0c8c4') +
  group(
    1110,
    406,
    1,
    rect(0, 0, 670, 470, '#b94255') +
      path('M0 0L335 268L670 0', '#d7727b') +
      group(
        90,
        -133,
        1,
        rect(0, 0, 500, 418, '#fff4df') +
          Array.from({ length: 5 }, (_, i) =>
            line(67, 85 + i * 43, 420 - (i % 2) * 80, 85 + i * 43, '#cbaa97', 3),
          ).join(''),
        -7,
      ) +
      path('M0 470V0L335 268L670 0V470Z', '#c85969') +
      path('M0 470L335 227L670 470', '#de7b85') +
      circle(335, 291, 47, '#9d304d') +
      path('M335 311C272 275 318 248 335 272C352 248 398 275 335 311', '#f7d6b5'),
  ) +
  leaf(1710, 994, 1.7, '#687d63', -28) +
  flower(1770, 755, 0.9, '#ab3d58');

// Copy is deliberately evergreen: these are reusable greetings and invitations.
const specs = [
  [
    'christmasEvergreen',
    'חג המולד · ירוק וזהב',
    'Christmas · Evergreen',
    'חג מולד\nמלא אור',
    'Christmas,\nwrapped in joy',
    'רגעים של יחד, ריח אורנים\nושמחה שנשארת גם אחרי החג.',
    'Pine-scented evenings, familiar faces,\nand joy that lasts beyond the season.',
    'מאחלים לכם חג מולד שמח',
    'WISHING YOU A MERRY CHRISTMAS',
    '#123e35',
    '#fff0d2',
    '#e8c382',
    'serif',
  ],
  [
    'christmasVillage',
    'חג המולד · כפר חורפי',
    'Christmas · Winter village',
    'נפגשים\nבכפר של חג',
    'Meet me at the\nChristmas market',
    'שוק חג המולד · שוקו חם, מתנות בעבודת יד ומוזיקה ברחבה',
    'Christmas market · Hot cocoa, handmade gifts & music in the square',
    'קסם קטן בכל פינה',
    'A LITTLE WONDER ON EVERY CORNER',
    '#e1edf0',
    '#345866',
    '#a64d43',
    'center',
  ],
  [
    'midnightToast',
    'ראש השנה האזרחית · לחיים',
    'New Year · Midnight toast',
    'לחיי התחלות\nחדשות',
    'Here’s to\nnew beginnings',
    'מוזיקה טובה, אנשים אהובים\nוספירה אחת לאחור — ביחד.',
    'Good music, favourite people,\nand one countdown together.',
    'מסיבת ערב השנה החדשה',
    'A NEW YEAR’S EVE CELEBRATION',
    '#191e32',
    '#fff0cf',
    '#d7b375',
    'serif',
  ],
  [
    'halloweenMoon',
    'ליל כל הקדושים · מסיבת ירח',
    'Halloween · Moonlit party',
    'לילה של\nקסם ואימה',
    'A little fright.\nA lot of fun.',
    'תחפושות, ממתקים וסיפורים\nשכדאי לשמוע כשהאור דולק.',
    'Costumes, candy and stories\nbest told with the lights on.',
    'מסיבת ליל כל הקדושים',
    'THE HALLOWEEN NIGHT OUT',
    '#241c36',
    '#ffe5b8',
    '#efa56a',
    'bold',
  ],
  [
    'easterGarden',
    'פסחא · גן אביבי',
    'Easter · Spring garden',
    'אביב פורח,\nפסחא שמח',
    'Fresh blooms.\nHappy Easter.',
    'ממלאים את הסל בצבע\nואת היום ברגעים מתוקים.',
    'Fill your basket with colour\nand your day with something sweet.',
    'חוגגים פסחא בגינה',
    'AN EASTER GARDEN GATHERING',
    '#f8f4e8',
    '#496257',
    '#a45e81',
    'serif',
  ],
  [
    'diwaliLights',
    'דיוואלי · מעגלי אור',
    'Diwali · Circles of light',
    'אור בבית,\nשמחה בלב',
    'Light at home.\nJoy at heart.',
    'מאחלים לכם דיוואלי שמח,\nמלא חברות, מתיקות ותקווה.',
    'Wishing you a joyful Diwali,\nfull of friendship, sweetness and hope.',
    'דיוואלי · חג האורות',
    'DIWALI · THE FESTIVAL OF LIGHTS',
    '#44243f',
    '#ffe9c2',
    '#eeb571',
    'serif',
  ],
  [
    'lunarLanterns',
    'ראש השנה הירחי · פנסים',
    'Lunar New Year · Lanterns',
    'שנה של\nמזל ושמחה',
    'A bright year\nbegins together',
    'פנסים מאירים, שולחן חגיגי\nומקום לכל מי שאוהבים.',
    'Glowing lanterns, a festive table,\nand room for everyone you love.',
    'חוגגים את ראש השנה הירחי',
    'HAPPY LUNAR NEW YEAR',
    '#7e272c',
    '#ffe8bf',
    '#f3bc79',
    'bold',
  ],
  [
    'eidGathering',
    'עיד אל־פיטר · שולחן מתוק',
    'Eid al-Fitr · Sweet gathering',
    'עיד שמח,\nלב פתוח',
    'Eid Mubarak,\nfrom the heart',
    'נפגשים לקפה, למתוקים\nולשמחה שטוב לחלוק יחד.',
    'Gather for coffee, sweet treats\nand the joy of being together.',
    'עיד אל־פיטר · חג של יחד',
    'EID AL-FITR · A TIME TO SHARE',
    '#eff0df',
    '#24575b',
    '#916932',
    'serif',
  ],
  [
    'thanksgivingTable',
    'חג ההודיה · סביב השולחן',
    'Thanksgiving · At the table',
    'יש על מה\nלהגיד תודה',
    'So much to\nbe thankful for',
    'על הבית, על החברים\nועל עוד מקום סביב השולחן.',
    'For home, for friends,\nand one more place at the table.',
    'חג הודיה שמח',
    'HAPPY THANKSGIVING',
    '#f6ecd9',
    '#6e3e2f',
    '#9b643b',
    'serif',
  ],
  [
    'valentineLetter',
    'ולנטיין · מכתב אהבה',
    'Valentine · Love letter',
    'כמה מילים,\nהמון אהבה',
    'A little note.\nA lot of love.',
    'לעצור לרגע, לכתוב מהלב\nולהזכיר למישהו כמה הוא יקר.',
    'Pause for a moment, write from the heart,\nand tell someone how much they mean.',
    'יום ולנטיין שמח',
    'HAPPY VALENTINE’S DAY',
    '#f8e3dc',
    '#912f4b',
    '#b24b62',
    'serif',
  ],
];
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage();
mkdirSync(`${media}elements/source/world-holidays`, { recursive: true });
for (const [id, , , , , , , , , bg] of specs) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">${rect(0, 0, 1920, 1080, bg)}${scenes[id]}</svg>`;
  writeFileSync(`${media}elements/source/world-holidays/${id}.svg`, svg);
  const base64 = await page.evaluate(async (svg) => {
    const im = new globalThis.Image();
    im.src = 'data:image/svg+xml;base64,' + btoa(svg);
    await im.decode();
    const c = globalThis.document.createElement('canvas');
    c.width = 1920;
    c.height = 1080;
    c.getContext('2d').drawImage(im, 0, 0);
    return c.toDataURL('image/webp', 0.96).split(',')[1];
  }, svg);
  writeFileSync(`${media}images/designs/${id}.webp`, Buffer.from(base64, 'base64'));
}
await browser.close();
const records = specs.map(
  ([
    id,
    heName,
    enName,
    heTitle,
    enTitle,
    heBody,
    enBody,
    heKicker,
    enKicker,
    bg,
    fg,
    accent,
    style,
  ]) => ({
    id,
    heName,
    enName,
    heTitle,
    enTitle,
    heBody,
    enBody,
    heKicker,
    enKicker,
    bg,
    fg,
    accent,
    style,
  }),
);
const source = `import { copy, photo, words, rule, solid, type Design } from '../designKit';
const records = ${JSON.stringify(records, null, 2)};
export const worldHolidays: Record<string, Design> = Object.fromEntries(records.map(d => [d.id, {
 faces: ['Heebo', 'DM Sans'], ground: () => solid(d.bg), subject: d.style === 'center' ? [1480, 900] : [1470, 690],
 compose: (he: boolean, assetId: string) => {
  const centered = d.style === 'center';
  const x = centered ? 220 : 125, w = centered ? 1480 : 880;
  const align = centered ? 'center' as const : 'start' as const;
  return [photo(assetId, he, { alt: copy(he, d.heName, d.enName) }),
   words(copy(he,d.heKicker,d.enKicker),[x,centered?96:151,w,64],he,{size:25,weight:700,color:d.accent,align,spacing:he?0:2}),
   words(copy(he,d.heTitle,d.enTitle),[x,centered?205:292,w,310],he,{size:centered?104:he?112:96,weight:d.style==='bold'?800:500,color:d.fg,align,font:d.style==='serif'?(he?'Frank Ruhl Libre':'Playfair Display'):he?'Heebo':'DM Sans',leading:1.06}),
   rule([centered?865:x,centered?554:654,190,4],he,d.accent),
   words(copy(he,d.heBody,d.enBody),[x,centered?593:704,w,132],he,{size:centered?30:33,color:d.fg,align,leading:1.5}),
  ];
 }
} satisfies Design]));
`;
writeFileSync(`${media}elements/source/design-packs/worldHolidays.ts`, source);
// Add only this pack's names; preserve every existing translation and unrelated local edit.
const messages = fileURLToPath(new URL('../src/elements/messages.ts', import.meta.url));
let text = readFileSync(messages, 'utf8');
let occurrence = 0;
for (const d of records) text = text.replace(new RegExp(`      ${d.id}: .*\\r?\\n`, 'g'), '');
text = text.replace(/ {4}name: \{\r?\n/g, (match) => {
  const at = occurrence++;
  if (at !== 0 && at !== 2) return match;
  const lang = at === 0 ? 'heName' : 'enName';
  return match + records.map((d) => `      ${d.id}: ${JSON.stringify(d[lang])},\n`).join('');
});
writeFileSync(messages, text);
console.log('Created ten original illustrations and bilingual slide source.');
