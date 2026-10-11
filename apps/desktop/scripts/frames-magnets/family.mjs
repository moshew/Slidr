/*
 * Ten magnets of family celebrations (`../frames-magnets.mjs`): an engagement, a henna, an
 * anniversary, a golden wedding, a baby shower, a brit, a bat mitzvah, a first haircut, a
 * housewarming and a bachelorette party. The card of each is ground only; what reads as an
 * object stands beside the picture: a seal on the photograph's edge, a plate over its foot, a
 * sash across a corner, a tag on a thread.
 */

/** @param kit What a magnet is drawn with (`kit.mjs`). */
export default function family(kit) {
  const { around, random, box, inset, f } = kit;
  const { magnet, sticker, caption, label, art, picture, tile } = kit;
  const { ground, onBorder, line, frameLine, sparkle, scattered, pick, cloud } = kit;

  /**
   * The shared watercolours of flowers: the corner of peonies is 1, the roses 3, the olive
   * branch 4.
   */
  const FLORALS = 'wc-florals';

  /** A gradient of gold from the upper left to the lower right, by the name `id`. */
  const gold = (id, [light, mid, deep] = ['#ecd9a4', '#c39d4f', '#dcbf7c']) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset=".5" stop-color="${mid}"/><stop offset="1" stop-color="${deep}"/></linearGradient>`;
  /** A gradient from top to bottom, by the name `id`. */
  const fall = (id, ...colours) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${colours
      .map((colour, i) => `<stop offset="${f(i / (colours.length - 1))}" stop-color="${colour}"/>`)
      .join('')}</linearGradient>`;
  /** Points as the data of a path. */
  const through = (points) => points.map(([x, y]) => `${f(x)} ${f(y)}`).join('L');
  /** A star of `points` rays around a centre: every other corner is `inner` of the way out. */
  const rays = (cx, cy, r, points, inner, turn = 0) =>
    `M${through(around(points * 2, turn, (i) => (i % 2 ? inner : 1)).map(([x, y]) => [cx + x * r, cy + y * r]))}Z`;

  /* ---- an engagement: a round photograph left of the middle, rings of gold that widen around
     it, and the names set to the right */
  function engagement() {
    const opening = box(48, 55, 640, 640);
    // Rings around the photograph, each `by` further out: the far ones fade into the card.
    const rings = (S) =>
      [
        [10, 2.6, 1],
        [21, 1.1, 0.9],
        [64, 1.1, 0.5],
        [122, 1, 0.34],
        [196, 1, 0.22],
      ]
        .map(([by, width, opacity]) =>
          S.ellipse(
            inset(opening, -by),
            `fill="none" stroke="url(#gold)" stroke-width="${width}" stroke-opacity="${opacity}"`,
          ),
        )
        .join('');
    // A few sparks of gold in the column of the names: each keeps its corner of the card.
    const sparks = (S) =>
      [
        [752, 92, 9, 'start'],
        [986, 70, 6, 'start'],
        [1012, 548, 8, 'end'],
        [884, 662, 11, 'end'],
        [776, 706, 5, 'end'],
        [968, 618, 4, 'end'],
      ]
        .map(([x, y, r, tie]) =>
          S.pin(`<path d="${sparkle(x, y, r, 0.26)}" fill="url(#gold)"/>`, [x, y], {
            x: 'end',
            y: tie,
          }),
        )
        .join('');
    // The names, the word of the evening on a pill of rose, and a line under it: one lockup, so
    // on a taller magnet its lines stay as close to each other as they are set.
    const lockup = art(
      'lockup-engaged',
      292,
      346,
      fall('rose', '#a94a65', '#8b3049'),
      `<g transform="translate(72 230)"><rect width="220" height="58" rx="29" fill="url(#rose)"/>` +
        `<rect x="4.500" y="4.500" width="211" height="49" rx="24.500" fill="none" stroke="#f6dcc0" stroke-opacity=".8" stroke-width="1.200"/></g>`,
    );
    const names = { color: '#6d3847', align: 'right' };
    return magnet(
      'magnet-engagement',
      'Engagement magnet',
      'מגנט לאירוסין',
      [1050, 750, 28],
      {
        opening,
        window: (S) => S.ellipse(inset(opening, 1), 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="blush" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbe6e0"/><stop offset=".55" stop-color="#f8e2d8"/><stop offset="1" stop-color="#f3e3c9"/></linearGradient>` +
            `<radialGradient id="light" cx=".84" cy=".36" r=".46"><stop stop-color="#ffffff" stop-opacity=".85"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
            gold('gold'),
          body:
            ground(S, 'url(#blush)') +
            onBorder(S.whole('fill="url(#light)"'), rings(S), sparks(S)) +
            S.ellipse(opening, 'fill="none" stroke="#ffffff" stroke-width="6"'),
        }),
        extras: [
          sticker(picture(`${FLORALS}-1`), 14, 14, 326, { turn: -3 }),
          // The rings lie on the edge of the photograph, towards the names.
          sticker(picture('family-baby-4'), 546, 560, 196, { turn: -7 }),
          label(lockup, 716, 138, [
            caption(
              0,
              0,
              292,
              106,
              { text: 'תמר', font: 'Frank Ruhl Libre', size: 90, weight: 700 },
              { text: 'Tamar', font: 'Playfair Display', size: 74, weight: 600, italic: true },
              names,
            ),
            caption(
              0,
              102,
              292,
              106,
              { text: 'ויואב', font: 'Frank Ruhl Libre', size: 90, weight: 700 },
              { text: '& Yoav', font: 'Playfair Display', size: 74, weight: 600, italic: true },
              names,
            ),
            caption(
              88,
              236,
              188,
              46,
              { text: 'מאורסים!', font: 'Heebo', size: 30, weight: 700 },
              { text: 'ENGAGED!', font: 'Montserrat', size: 22, weight: 700, spacing: 3 },
              { color: '#ffffff' },
            ),
            caption(
              0,
              304,
              292,
              40,
              { text: 'היא אמרה כן', font: 'Heebo', size: 25, weight: 500, spacing: 3 },
              { text: 'SHE SAID YES', font: 'Montserrat', size: 21, weight: 600, spacing: 4 },
              { color: '#8a6426', align: 'right' },
            ),
          ]),
        ],
      },
      {
        en: 'event engagement engaged proposal ring couple love party',
        he: 'אירוע אירוסין אירוסים מאורסים הצעת נישואין טבעת זוג אהבה מסיבה',
      },
    );
  }

  /* ---- a henna: zellige of teal and magenta, brackets of gold on the corners, the names on a
     cartouche over the top of the photograph, a lantern and tea at its foot */
  function henna() {
    const opening = box(52, 84, 946, 548);
    // One tile of zellige: a star of eight points joined to its neighbours, and a diamond of
    // magenta where four tiles meet. A larger card has more tiles of the same size.
    const T = 76;
    const zellige =
      `<pattern id="zellige" x="26" y="42" width="${T}" height="${T}" patternUnits="userSpaceOnUse">` +
      `<path d="${rays(38, 38, 29, 8, 0.7654)}" fill="#1c8284" fill-opacity=".5" stroke="#e7c36b" stroke-opacity=".55" stroke-width="1.200" stroke-linejoin="round"/>` +
      line(
        'M38 0V9M38 67V76M0 38H9M67 38H76M17.500 17.500 6.400 6.400M58.500 17.500 69.600 6.400M17.500 58.500 6.400 69.600M58.500 58.500 69.600 69.600',
        '#e7c36b',
        1.2,
        ' stroke-opacity=".4"',
      ) +
      [
        [0, 0],
        [T, 0],
        [0, T],
        [T, T],
      ]
        .map(([x, y]) => `<path d="${rays(x, y, 9, 2, 1)}" fill="#c2247a"/>`)
        .join('') +
      `<circle cx="38" cy="38" r="9" fill="none" stroke="#e7c36b" stroke-opacity=".55" stroke-width="1.100"/><circle cx="38" cy="38" r="3.200" fill="#e7c36b"/>` +
      `</pattern>`;
    const metal = gold('gold', ['#fbe9ae', '#d9a842', '#f3d588']);
    // A bracket for a corner of the photograph, the same on both sides of its diagonal, so a
    // quarter turn makes it the bracket of the next corner.
    const bracket = art(
      'bracket-gold',
      130,
      130,
      metal,
      `<g fill="none" stroke="url(#gold)" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M10 120V30Q10 10 30 10H120" stroke-width="6"/>` +
        `<path d="M24 108V42Q24 24 42 24H108" stroke-width="1.800"/>` +
        `<path d="M24 94C54 94 94 54 94 24" stroke-width="2.400"/>` +
        `<path d="M24 68C44 68 68 44 68 24" stroke-width="1.600"/></g>` +
        `<path d="${rays(47, 47, 12, 8, 0.6)}" fill="url(#gold)"/>` +
        `<circle cx="10" cy="120" r="6" fill="url(#gold)"/><circle cx="120" cy="10" r="6" fill="url(#gold)"/>` +
        `<path d="${rays(24, 116, 6, 2, 1)}${rays(116, 24, 6, 2, 1)}" fill="url(#gold)"/>`,
    );
    // The cartouche: a plate of magenta with pointed ends, lined twice with gold.
    const outline =
      'M56 5H524C538 5 541 17 553 22L575 50 553 78C541 83 538 95 524 95H56C42 95 39 83 27 78L5 50 27 22C39 17 42 5 56 5Z';
    const cartouche = art(
      'cartouche-magenta',
      580,
      100,
      metal + fall('magenta', '#c7287f', '#8d0f56'),
      `<path d="${outline}" fill="url(#magenta)" stroke="url(#gold)" stroke-width="3.500" stroke-linejoin="round"/>` +
        `<path d="${outline}" transform="translate(290 50) scale(.952 .800) translate(-290 -50)" fill="none" stroke="#f6d98c" stroke-opacity=".8" stroke-width="1.200" vector-effect="non-scaling-stroke"/>` +
        `<path d="${rays(44, 50, 9, 4, 0.36)}${rays(536, 50, 9, 4, 0.36)}" fill="url(#gold)"/>`,
    );
    // The line at the foot on a slip of dark teal, a star of gold at its start.
    const slip = art(
      'slip-teal',
      440,
      58,
      metal,
      `<rect x="1.500" y="1.500" width="437" height="55" rx="12" fill="#06323a" fill-opacity=".94" stroke="url(#gold)" stroke-width="1.800"/>` +
        `<path d="${rays(32, 29, 11, 8, 0.6)}" fill="url(#gold)"/>`,
    );
    return magnet(
      'magnet-henna',
      'Henna magnet',
      'מגנט לחינה',
      [1050, 750, 22],
      {
        opening,
        round: 8,
        draw: (S) => ({
          defs:
            `<linearGradient id="teal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#12666b"/><stop offset="1" stop-color="#0a4148"/></linearGradient>` +
            `<radialGradient id="deep" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#042a30" stop-opacity="0"/><stop offset="1" stop-color="#042a30" stop-opacity=".55"/></radialGradient>` +
            metal +
            zellige,
          body:
            ground(S, 'url(#teal)') +
            onBorder(S.whole('fill="url(#zellige)"'), S.whole('fill="url(#deep)"')) +
            S.outline(box(9, 9, 1032, 732), 15, 1.6, 'stroke="url(#gold)" stroke-opacity=".85"') +
            frameLine(S, 4, 11, 'url(#gold)', 4) +
            frameLine(S, 12, 18, '#f6d98c', 1.1, ' stroke-opacity=".8"'),
        }),
        extras: [
          sticker(bracket, 38, 70, 130),
          sticker(bracket, 882, 70, 130, { turn: 90 }),
          sticker(bracket, 38, 516, 130, { turn: -90 }),
          label(cartouche, 235, 30, [
            caption(
              66,
              20,
              448,
              60,
              { text: 'החינה של ליאור ועדן', font: 'Suez One', size: 38 },
              { text: 'Lior & Eden’s Henna', font: 'DM Serif Display', size: 42 },
              { color: '#ffe9b3' },
            ),
          ]),
          // The lantern stands behind the teapot, over the corner of the photograph.
          sticker(picture('family-henna-1'), 706, 462, 122),
          sticker(picture('family-henna-2'), 776, 512, 256),
          label(slip, 40, 664, [
            caption(
              58,
              6,
              364,
              46,
              { text: 'בסימן טוב ובמזל טוב', font: 'Heebo', size: 30, weight: 500 },
              { text: 'SIMAN TOV & MAZAL TOV', font: 'DM Sans', size: 21, weight: 600, spacing: 2 },
              { color: '#f6dfa6', align: 'left' },
            ),
          ]),
        ],
      },
      {
        en: 'event henna hina moroccan wedding bride groom lantern tea oriental',
        he: 'אירוע חינה חתונה כלה חתן מרוקאי מזרחי פנס תה מסורת',
      },
    );
  }

  /* ---- an anniversary: a seal with the years on the corner of the photograph, and the names
     on a plate of wine over its foot, roses on the plate's end */
  function anniversary() {
    const opening = box(44, 44, 662, 886);
    // The seal: scallops around a disc, two rings of cream, and room for a number and a word.
    const SEAL = 228;
    const seal = art(
      'seal-wine',
      SEAL,
      SEAL,
      `<radialGradient id="wine" cx=".4" cy=".34" r=".8"><stop stop-color="#98243f"/><stop offset="1" stop-color="#650f26"/></radialGradient>` +
        `<clipPath id="scallops"><circle cx="114" cy="114" r="100"/>${around(22)
          .map(([x, y]) => `<circle cx="${f(114 + x * 99)}" cy="${f(114 + y * 99)}" r="15"/>`)
          .join('')}</clipPath>`,
      `<rect width="${SEAL}" height="${SEAL}" fill="url(#wine)" clip-path="url(#scallops)"/>` +
        `<circle cx="114" cy="114" r="91" fill="none" stroke="#f8e3d3" stroke-width="1.500"/>` +
        `<circle cx="114" cy="114" r="86" fill="none" stroke="#f8e3d3" stroke-opacity=".6" stroke-width="1.600" stroke-dasharray=".1 6" stroke-linecap="round"/>` +
        `<path d="M114 40c-6-8-16.500-2-11 5.500 3 4 7.500 6.500 11 9.500 3.500-3 8-5.500 11-9.500 5.500-7.500-5-13.500-11-5.500Z" fill="#f8e3d3"/>`,
    );
    // The plate: a band of wine with a line of cream inside its edge, and roses over its start.
    // The roses are the shared watercolour, without the leaf of another bunch in its corner;
    // they are of the plate, so on a magnet of any size the two stay together.
    const plate = art(
      'plate-wine',
      724,
      230,
      `<linearGradient id="wine" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#6c1128"/><stop offset=".55" stop-color="#8b1d39"/><stop offset="1" stop-color="#9e2a47"/></linearGradient>` +
        tile('roses', `${FLORALS}-3`, 262) +
        `<clipPath id="bunch"><path d="M42 0H262V212H0V32H42Z"/></clipPath>`,
      `<g transform="translate(22 50)"><rect width="702" height="152" rx="9" fill="url(#wine)"/>` +
        `<rect x="8.500" y="8.500" width="685" height="135" rx="4" fill="none" stroke="#f8e3d3" stroke-opacity=".7" stroke-width="1.300"/>` +
        `<rect x="13" y="13" width="676" height="126" rx="2" fill="none" stroke="#f8e3d3" stroke-opacity=".35" stroke-width=".800"/></g>` +
        `<g transform="translate(10 10) rotate(-4 131 106)"><rect width="262" height="212" fill="url(#roses)" clip-path="url(#bunch)"/></g>`,
    );
    const next = random(1010);
    // Small hearts of blush in the margins of the card.
    const hearts = (S) =>
      scattered(next, 30, 750, 1050, [inset(opening, -14)], 46, 16)
        .map(([x, y]) => {
          const s = f(0.55 + next() * 0.5);
          return S.pin(
            `<path transform="translate(${f(x)} ${f(y)}) rotate(${Math.round(next() * 50 - 25)}) scale(${s})" d="M0 9C-13-1-6-12 0-5 6-12 13-1 0 9Z" fill="#e7b3b0" fill-opacity="${f(0.45 + next() * 0.4)}"/>`,
            [x, y],
          );
        })
        .join('');
    return magnet(
      'magnet-anniversary',
      'Anniversary magnet',
      'מגנט ליום נישואין',
      [750, 1050, 22],
      {
        opening,
        round: 6,
        draw: (S) => ({
          defs:
            fall('cream', '#fcf5ec', '#f8e4dc') +
            `<radialGradient id="blush" cx="1" cy="0" r=".7"><stop stop-color="#f3cfc9" stop-opacity=".8"/><stop offset="1" stop-color="#f3cfc9" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, 'url(#cream)') +
            onBorder(S.whole('fill="url(#blush)"'), hearts(S)) +
            S.outline(box(11, 11, 728, 1028), 13, 1.2, 'stroke="#8b1d39" stroke-opacity=".55"') +
            frameLine(S, 4, 9, '#8b1d39', 2.4) +
            frameLine(S, 10, 14, '#8b1d39', 0.9, ' stroke-opacity=".6"'),
        }),
        extras: [
          label(plate, 2, 808, [
            caption(
              274,
              70,
              420,
              78,
              { text: 'רונית ואבי', font: 'Frank Ruhl Libre', size: 64, weight: 700 },
              {
                text: 'Ronit & Avi',
                font: 'Playfair Display',
                size: 58,
                weight: 600,
                italic: true,
              },
              { color: '#fff3e6', align: 'right' },
            ),
            caption(
              274,
              144,
              420,
              48,
              { text: 'ועדיין מאוהבים', font: 'Heebo', size: 30, weight: 400, spacing: 3 },
              { text: 'STILL IN LOVE', font: 'Montserrat', size: 28, weight: 500, spacing: 5 },
              { color: '#f3cdbd', align: 'right' },
            ),
          ]),
          label(
            seal,
            17,
            17,
            [
              caption(
                52,
                48,
                124,
                92,
                { text: '10', font: 'Frank Ruhl Libre', size: 72, weight: 700 },
                { text: '10', font: 'Playfair Display', size: 72, weight: 700 },
                { color: '#fff3e6' },
              ),
              caption(
                34,
                145,
                160,
                46,
                { text: 'שנים יחד', font: 'Heebo', size: 29, weight: 500 },
                { text: 'YEARS', font: 'Montserrat', size: 28, weight: 600, spacing: 3 },
                { color: '#fff6ee' },
              ),
            ],
            { turn: -8 },
          ),
        ],
      },
      {
        en: 'event anniversary wedding years together couple love roses',
        he: 'אירוע יום נישואין נישואים שנים יחד זוג אהבה ורדים חתונה',
      },
    );
  }

  /* ---- a golden wedding: an oval of gold foil on ivory, an olive branch at each side, and the
     years on a ribbon over its foot */
  function golden() {
    const opening = box(180, 102, 690, 542);
    // The corners of the card are gilded, as the corners of an album.
    const gilded = (S) =>
      [
        ['M22 22h86L22 108Z', [22, 22]],
        ['M1028 22h-86l86 86Z', [1028, 22]],
        ['M22 728h86L22 642Z', [22, 728]],
        ['M1028 728h-86l86-86Z', [1028, 728]],
      ]
        .map(([d, at]) => S.pin(`<path d="${d}" fill="url(#foil)"/>`, at, { x: 'near', y: 'near' }))
        .join('');
    // The ribbon: two tails behind, the folds that carry them, the band in front.
    const ribbon = art(
      'ribbon-gold',
      640,
      104,
      `<linearGradient id="band" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#d9b45c"/><stop offset=".22" stop-color="#f4e1a0"/><stop offset=".5" stop-color="#dcb65d"/><stop offset=".78" stop-color="#f1dc97"/><stop offset="1" stop-color="#cfa54a"/></linearGradient>`,
      `<path fill="#b88d36" d="M0 28h96v76H0l30-38Z"/><path fill="#b88d36" d="M640 28H544v76h96l-30-38Z"/>` +
        `<path fill="#7d5c18" d="M60 84h36v20Z"/><path fill="#7d5c18" d="M580 84h-36v20Z"/>` +
        `<rect x="60" width="520" height="84" rx="5" fill="url(#band)"/>` +
        `<rect x="60" width="520" height="26" rx="5" fill="#ffffff" fill-opacity=".18"/>` +
        line('M74 9.500H566M74 74.500H566', '#8a6a22', 1.4, ' stroke-opacity=".7"'),
    );
    return magnet(
      'magnet-golden',
      'Golden wedding magnet',
      'מגנט לחתונת זהב',
      [1050, 750, 26],
      {
        opening,
        window: (S) => S.ellipse(inset(opening, 1), 'fill="#000"'),
        draw: (S) => ({
          defs:
            tile('foil', 'family-gold-foil', 230) +
            `<radialGradient id="warm" cx=".5" cy=".48" r=".62"><stop offset=".55" stop-color="#f3e6c6" stop-opacity="0"/><stop offset="1" stop-color="#ecd9ab" stop-opacity=".6"/></radialGradient>`,
          body:
            ground(S, '#fbf7ec') +
            onBorder(S.whole('fill="url(#warm)"'), gilded(S)) +
            S.outline(box(11, 11, 1028, 728), 20, 8, 'stroke="url(#foil)"') +
            S.outline(box(22, 22, 1006, 706), 11, 1.2, 'stroke="#a9832f"') +
            S.ellipse(inset(opening, -8), 'fill="none" stroke="url(#foil)" stroke-width="9"') +
            S.ellipse(inset(opening, -20), 'fill="none" stroke="#a9832f" stroke-width="1.300"') +
            S.ellipse(opening, 'fill="none" stroke="#ffffff" stroke-width="3"'),
        }),
        extras: [
          // The branches rise from under the ends of the ribbon, along the sides of the oval.
          sticker(picture(`${FLORALS}-4`), 92, 382, 310, { flip: true, turn: 24 }),
          sticker(picture(`${FLORALS}-4`), 648, 382, 310, { turn: -24 }),
          label(ribbon, 205, 590, [
            caption(
              80,
              10,
              480,
              64,
              { text: '50 שנות אהבה', font: 'Frank Ruhl Libre', size: 52, weight: 700 },
              { text: '50 Years of Love', font: 'Playfair Display', size: 46, weight: 700 },
              { color: '#4a300c' },
            ),
          ]),
          caption(
            150,
            29,
            750,
            46,
            { text: 'חתונת הזהב של אסתר ודוד', font: 'Heebo', size: 27, weight: 500, spacing: 4 },
            {
              text: 'ESTHER & DAVID · GOLDEN WEDDING',
              font: 'Montserrat',
              size: 21,
              weight: 600,
              spacing: 5,
            },
            { color: '#7d5f1c' },
          ),
        ],
      },
      {
        en: 'event golden wedding anniversary fifty years grandparents gold elegant',
        he: 'אירוע חתונת זהב חתונה יום נישואין חמישים שנה סבא סבתא אלגנטי',
      },
    );
  }

  /* ---- a baby shower: bunting along the top of the photograph, a balloon over its side, and
     the news on a cloud */
  function babyshower() {
    const opening = box(46, 64, 958, 548);
    // The bunting: flags on a thread that sags between its two ends.
    const bunting = (() => {
      const [p0, p1, p2] = [
        [12, 16],
        [460, 92],
        [908, 16],
      ];
      const at = (t) =>
        [0, 1].map((k) => (1 - t) ** 2 * p0[k] + 2 * t * (1 - t) * p1[k] + t * t * p2[k]);
      const colours = ['#9db79a', '#f6b99c', '#fffaf0', '#e8957d', '#7f9c7d', '#f9d7b8'];
      const flags = Array.from({ length: 11 }, (_, i) => {
        const t = (i + 0.5) / 11;
        const [a, c] = [at(t - 0.037), at(t + 0.037)];
        const [dx, dy] = [c[0] - a[0], c[1] - a[1]];
        const long = Math.hypot(dx, dy);
        const tip = [(a[0] + c[0]) / 2 - (dy / long) * 78, (a[1] + c[1]) / 2 + (dx / long) * 78];
        const towards = (p, q, share) => [
          p[0] + (q[0] - p[0]) * share,
          p[1] + (q[1] - p[1]) * share,
        ];
        const middle = towards(towards(a, c, 0.5), tip, 0.36);
        const inner = [a, c, tip].map((p) => towards(p, middle, 0.36));
        return (
          `<path d="M${through([a, c, tip])}Z" fill="${colours[i % colours.length]}"/>` +
          `<path d="M${through(inner)}Z" fill="none" stroke="#ffffff" stroke-opacity="${i % 6 === 2 ? 0 : 0.55}" stroke-width="1.600" stroke-linejoin="round"/>` +
          (i % 6 === 2
            ? `<path d="M${through(inner)}Z" fill="none" stroke="#9db79a" stroke-width="1.600" stroke-linejoin="round"/>`
            : '')
        );
      }).join('');
      return art(
        'bunting-sage',
        920,
        136,
        '',
        flags +
          line('M12 16Q460 92 908 16', '#b3916a', 3.2, ' stroke-linecap="round"') +
          `<circle cx="12" cy="16" r="6.500" fill="#b3916a"/><circle cx="908" cy="16" r="6.500" fill="#b3916a"/>`,
      );
    })();
    // The cloud: round tops on a flat foot, and its own tone of sage under it.
    const puffs =
      `<rect x="20" y="72" width="364" height="88" rx="44"/><circle cx="94" cy="80" r="50"/>` +
      `<circle cx="178" cy="60" r="56"/><circle cx="264" cy="64" r="50"/><circle cx="330" cy="92" r="42"/>`;
    const cloudPlate = art(
      'cloud-news',
      404,
      170,
      '',
      `<g transform="translate(0 7)" fill="#c9d8c4">${puffs}</g><g fill="#ffffff">${puffs}</g>`,
    );
    const next = random(307);
    // Dots of sage and peach in the margins, as a printed paper has them.
    const dots = (S) =>
      scattered(next, 54, 1050, 750, [inset(opening, -10), box(430, 640, 470, 80)], 38, 14)
        .map(([x, y]) =>
          S.pin(
            `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2.5 + next() * 3.5)}" fill="${pick(next, ['#b9cdb5', '#f6c9ae', '#ffffff', '#e9b7a0'])}" fill-opacity="${f(0.6 + next() * 0.4)}"/>`,
            [x, y],
          ),
        )
        .join('');
    return magnet(
      'magnet-babyshower',
      'Baby shower magnet',
      'מגנט למסיבת לידה',
      [1050, 750, 34],
      {
        opening,
        round: 28,
        draw: (S) => ({
          defs:
            `<radialGradient id="sage" cx="0" cy="0" r=".8"><stop stop-color="#d5e2cf"/><stop offset="1" stop-color="#d5e2cf" stop-opacity="0"/></radialGradient>` +
            `<radialGradient id="peach" cx="1" cy="1" r=".8"><stop stop-color="#fbd5bf"/><stop offset="1" stop-color="#fbd5bf" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, '#fbf4e6') +
            onBorder(S.whole('fill="url(#sage)"'), S.whole('fill="url(#peach)"'), dots(S)) +
            frameLine(S, 0, 28, '#ffffff', 8),
        }),
        extras: [
          sticker(bunting, 65, 12, 920),
          sticker(picture('family-baby-1'), 862, 150, 172, { turn: 6 }),
          label(cloudPlate, 22, 564, [
            caption(
              44,
              66,
              316,
              80,
              { text: 'תינוק בדרך!', font: 'Varela Round', size: 52 },
              { text: 'Oh, baby!', font: 'Varela Round', size: 54 },
              { color: '#4f6d4d' },
            ),
          ]),
          caption(
            440,
            654,
            450,
            52,
            { text: 'מסיבת הלידה של יעל', font: 'Heebo', size: 30, weight: 500 },
            { text: 'YAEL’S BABY SHOWER', font: 'Montserrat', size: 22, weight: 600, spacing: 3 },
            { color: '#48603f', align: 'left' },
          ),
        ],
      },
      {
        en: 'event baby shower pregnancy newborn bunting balloon cloud expecting',
        he: 'אירוע מסיבת לידה מסיבה תינוק תינוקת היריון הריון בדרך דגלונים כדור פורח ענן',
      },
    );
  }

  /* ---- a brit or a britah: a print smaller than its box, an olive branch behind its top,
     tape over its edge, and a tag that hangs on a thread */
  function brit() {
    // The print: the box is bare above it and to its right, where the branch shows.
    const print = box(34, 104, 664, 922);
    const opening = box(64, 134, 604, 772);
    // The olive branch of the shared watercolours, laid flat (it is painted on a diagonal) and
    // cut a little under its stem: the print hides the rest, so the branch can lie high.
    const olive = art(
      'olive-peeking',
      570,
      142,
      tile('olive', `${FLORALS}-4`, 442),
      `<g transform="translate(195 -160) rotate(34)"><rect width="442" height="336" fill="url(#olive)"/></g>`,
    );
    // Tape of paper over the top of the print: torn at both ends, striped with light.
    const teeth = (x, y, dx, dy, count) =>
      Array.from({ length: count }, (_, i) => `${x + (i % 2 ? 0 : dx)} ${y + (i + 1) * dy}`).join(
        'L',
      );
    const tape = art(
      'tape-champagne',
      210,
      56,
      `<pattern id="stripes" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="7" height="16" fill="#ffffff" fill-opacity=".34"/></pattern>` +
        `<clipPath id="strip"><path d="M6 0H204L${teeth(204, 0, 6, 7, 8)}H6L${teeth(6, 56, -6, -7, 8)}Z"/></clipPath>`,
      `<g clip-path="url(#strip)"><rect width="210" height="56" fill="#e6cf9c" fill-opacity=".92"/><rect width="210" height="56" fill="url(#stripes)"/>` +
        `<rect width="210" height="4" fill="#ffffff" fill-opacity=".3"/><rect y="52" width="210" height="4" fill="#a98a4a" fill-opacity=".22"/></g>`,
    );
    // The tag: a card with its upper corners cut, an eyelet of gold, and a thread tied in a bow.
    const tag = art(
      'tag-welcome',
      250,
      318,
      fall('card', '#ffffff', '#eff3f6') + gold('gold', ['#f0dfae', '#c7a257', '#e0c684']),
      `<path fill-rule="evenodd" d="M52 70H198L238 110V302a12 12 0 0 1-12 12H24a12 12 0 0 1-12-12V110ZM125 96a8 8 0 1 0 .010 0Z" fill="url(#card)"/>` +
        `<path d="M56 79.500H194L228.500 114V298.500a6 6 0 0 1-6 6H27.500a6 6 0 0 1-6-6V114Z" fill="none" stroke="url(#gold)" stroke-width="1.600"/>` +
        `<circle cx="125" cy="104" r="10.500" fill="none" stroke="url(#gold)" stroke-width="5"/>` +
        // The thread: up through the eyelet to a knot, two loops and two ends that fall aside.
        `<g fill="none" stroke="#b08d4c" stroke-width="3.200" stroke-linecap="round">` +
        `<path d="M125 104C116 86 116 62 125 44"/><path d="M125 104C134 86 134 62 125 44"/>` +
        `<path d="M125 44C104 20 66 10 60 28S98 50 125 44"/><path d="M125 44C146 20 184 10 190 28S152 50 125 44"/>` +
        `<path d="M122 46C108 52 96 58 88 68"/><path d="M128 46C142 52 154 58 162 68"/></g>` +
        `<circle cx="125" cy="44" r="6" fill="#b08d4c"/>` +
        line('M78 196H172', '#c7a257', 1.4, ' stroke-linecap="round"') +
        `<path d="${sparkle(125, 196, 8, 0.3)}" fill="url(#gold)"/>`,
    );
    return magnet(
      'magnet-brit',
      'Brit and britah magnet',
      'מגנט לברית ולבריתה',
      [750, 1050, 10],
      {
        opening,
        round: 4,
        card: (S) => S.box(print, 8, 'fill="#fff"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eef3f7"/><stop offset="1" stop-color="#dbe5ed"/></linearGradient>` +
            `<radialGradient id="light" cx=".5" cy="1" r=".6"><stop stop-color="#ffffff" stop-opacity=".8"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
            `<pattern id="weave" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="3.500" cy="3.500" r="1.200" fill="#ffffff" fill-opacity=".8"/><circle cx="10.500" cy="10.500" r="1.200" fill="#ffffff" fill-opacity=".8"/></pattern>` +
            gold('gold'),
          body:
            ground(S, 'url(#paper)') +
            onBorder(S.whole('fill="url(#weave)"'), S.whole('fill="url(#light)"')) +
            S.outline(inset(print, 11), 3, 1.3, 'stroke="url(#gold)"') +
            frameLine(S, 3, 6, '#ffffff', 6) +
            // Two sparks of gold beside the line at the foot: they keep to its middle.
            [-292, 292]
              .map((dx) =>
                S.pin(
                  `<path d="${sparkle(375 + dx, 966, 9, 0.28)}" fill="url(#gold)"/>`,
                  [375 + dx, 966],
                  { x: 'mid', y: 'end' },
                ),
              )
              .join(''),
        }),
        extras: [
          sticker(olive, 306, 12, 436, { turn: -3, under: true }),
          sticker(tape, 268, 76, 210, { turn: -3 }),
          label(
            tag,
            24,
            30,
            [
              caption(
                23,
                130,
                204,
                52,
                { text: 'ברוך הבא', font: 'Heebo', size: 33, weight: 500, spacing: 1 },
                { text: 'WELCOME', font: 'Montserrat', size: 28, weight: 600, spacing: 2 },
                { color: '#5b7288' },
              ),
              caption(
                23,
                208,
                204,
                84,
                { text: 'אריאל', font: 'Frank Ruhl Libre', size: 58, weight: 700 },
                { text: 'Ariel', font: 'Playfair Display', size: 60, weight: 700 },
                { color: '#2f4459' },
              ),
            ],
            { turn: -7 },
          ),
          caption(
            104,
            938,
            542,
            56,
            { text: 'שמחה גדולה במשפחה', font: 'Heebo', size: 34, weight: 500, spacing: 2 },
            { text: 'OUR FAMILY JUST GREW', font: 'Montserrat', size: 28, weight: 600, spacing: 4 },
            { color: '#3f566c' },
          ),
        ],
      },
      {
        en: 'event brit milah britah baby naming newborn boy girl family welcome',
        he: 'אירוע ברית מילה בריתה זבד הבת תינוק תינוקת לידה משפחה ברוך הבא',
      },
    );
  }

  /* ---- a bat mitzvah: the photograph to the edge of a rim of rose gold, the name on a glossy
     plate over its foot, a tiara on its top and the age on a seal */
  function batmitzvah() {
    const opening = box(16, 16, 1018, 718);
    // The plate: a tab of white for the occasion, and a band from violet to rose for the name.
    const band = 'M10 40H504l50 104H10a10 10 0 0 1-10-10V50a10 10 0 0 1 10-10Z';
    const plate = art(
      'lower-third-violet',
      560,
      144,
      `<linearGradient id="glow" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#5d2f9b"/><stop offset=".6" stop-color="#9a3d9a"/><stop offset="1" stop-color="#cf4d8e"/></linearGradient>` +
        gold('rosegold', ['#fde0d3', '#e2a091', '#f7cdb6']) +
        `<clipPath id="band"><path d="${band}"/></clipPath>`,
      `<path d="${band}" fill="url(#glow)"/>` +
        `<g clip-path="url(#band)"><rect y="40" width="560" height="44" fill="#ffffff" fill-opacity=".13"/>` +
        `<path d="M430 40h46l50 104h-46Z" fill="#ffffff" fill-opacity=".1"/></g>` +
        line('M0 141H552', '#f7cdb6', 3) +
        `<rect x="26" width="300" height="48" rx="9" fill="#ffffff"/>` +
        `<rect x="26" y="44.500" width="300" height="3.500" fill="url(#rosegold)"/>`,
    );
    // The seal: a burst of rose gold around a disc of white.
    const seal = art(
      'seal-rosegold',
      146,
      146,
      gold('rosegold', ['#fde0d3', '#dc978a', '#f7cdb6']),
      `<path d="${rays(73, 73, 72, 22, 0.88)}" fill="url(#rosegold)"/>` +
        `<circle cx="73" cy="73" r="54" fill="#ffffff"/>` +
        `<circle cx="73" cy="73" r="48.500" fill="none" stroke="#7d3fa6" stroke-opacity=".7" stroke-width="1.300" stroke-dasharray=".1 5" stroke-linecap="round"/>`,
    );
    // Sparks of light for the far corner.
    const sparks = art(
      'sparks-rose',
      130,
      130,
      `<radialGradient id="shine" cx=".5" cy=".5" r=".5"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#fbd9cd"/></radialGradient>`,
      `<g fill="url(#shine)" stroke="#d98f86" stroke-opacity=".7" stroke-width="1.200" stroke-linejoin="round">` +
        `<path d="${sparkle(52, 62, 44, 0.2)}"/><path d="${sparkle(104, 28, 18, 0.24)}"/><path d="${sparkle(100, 104, 13, 0.24)}"/></g>`,
    );
    return magnet(
      'magnet-batmitzvah',
      'Bat mitzvah magnet',
      'מגנט לבת מצווה',
      [1050, 750, 22],
      {
        opening,
        round: 12,
        draw: (S) => ({
          defs: tile('foil', 'family-gold-foil', 200),
          body:
            ground(S, 'url(#foil)') +
            // Rose over the gold makes rose gold; lilac at the two far corners.
            onBorder(S.whole('fill="#f29aa9" fill-opacity=".42"')) +
            frameLine(S, 1.5, 13, '#ffffff', 3, ' stroke-opacity=".9"') +
            S.outline(box(1.5, 1.5, 1047, 747), 21, 3, 'stroke="#b98fd6" stroke-opacity=".8"'),
        }),
        extras: [
          sticker(sparks, 30, 28, 112, { turn: -8 }),
          sticker(picture('family-henna-4'), 800, 14, 236, { turn: 6 }),
          label(plate, 36, 556, [
            caption(
              34,
              1,
              284,
              44,
              { text: 'בת מצווה', font: 'Heebo', size: 25, weight: 700, spacing: 6 },
              { text: 'BAT MITZVAH', font: 'Montserrat', size: 21, weight: 700, spacing: 5 },
              { color: '#5d2f9b' },
            ),
            caption(
              28,
              50,
              456,
              88,
              { text: 'אביגיל', font: 'Suez One', size: 72 },
              { text: 'Abigail', font: 'DM Serif Display', size: 76 },
              { color: '#ffffff', align: 'left' },
            ),
          ]),
          label(
            seal,
            878,
            578,
            [
              caption(
                26,
                32,
                94,
                82,
                { text: '12', font: 'Frank Ruhl Libre', size: 66, weight: 700 },
                { text: '12', font: 'DM Serif Display', size: 66 },
                { color: '#5d2f9b' },
              ),
            ],
            { turn: 10 },
          ),
        ],
      },
      {
        en: 'event bat mitzvah girl twelve tiara rose gold glam party jewish',
        he: 'אירוע בת מצווה מצוה ילדה שתים עשרה כתר נזר רוז גולד זהב ורוד מסיבה',
      },
    );
  }

  /* ---- a first haircut at three: a sky with a band of sun down its side for the name, the
     age in a speech bubble, scissors and a comb */
  function halake() {
    const opening = box(126, 42, 880, 596);
    const band = box(0, 0, 108, 750);
    // The bubble: its tail points into the photograph, at the child.
    const shape = `<rect x="10" y="10" width="330" height="138" rx="60"/><path d="M78 132 44 196 150 140Z"/>`;
    const bubble = art(
      'bubble-age',
      360,
      212,
      '',
      `<g transform="translate(8 8)" fill="#ffc21a" stroke="#ffc21a" stroke-width="9" stroke-linejoin="round">${shape}</g>` +
        `<g fill="#e5383b" stroke="#e5383b" stroke-width="9" stroke-linejoin="round">${shape}</g>` +
        `<g fill="#ffffff">${shape}</g>`,
    );
    // Scissors, open: two blades of steel that cross on a screw, and two rings of red.
    const blade = `<path d="M30 8 100 96 80 114Q44 66 30 8Z" fill="url(#steel)" stroke="#8496a8" stroke-width="1.600" stroke-linejoin="round"/><path d="M33 16 92 92" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="2.500" stroke-linecap="round"/>`;
    const grip =
      `<path d="M90 108 116 140" fill="none" stroke="url(#red)" stroke-width="16" stroke-linecap="round"/>` +
      `<ellipse cx="132" cy="158" rx="22" ry="25" transform="rotate(-38 132 158)" fill="none" stroke="url(#red)" stroke-width="13"/>` +
      `<path d="M117 143a22 25 -38 0 1 24-9" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width="3.500" stroke-linecap="round"/>`;
    const scissors = art(
      'scissors-red',
      170,
      192,
      `<linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4f7fa"/><stop offset="1" stop-color="#aebdcd"/></linearGradient>` +
        fall('red', '#f4595b', '#d3262b'),
      `<g transform="translate(170 0) scale(-1 1)">${blade}${grip}</g>${blade}${grip}` +
        `<circle cx="85" cy="103" r="8" fill="#51606f"/><circle cx="83" cy="101" r="2.600" fill="#ffffff" fill-opacity=".7"/>`,
    );
    // A comb of yellow: a back and a row of teeth.
    const comb = art(
      'comb-yellow',
      190,
      96,
      fall('sun', '#ffe066', '#ffb703'),
      Array.from(
        { length: 14 },
        (_, i) =>
          `<rect x="${f(12 + i * 12.6)}" y="26" width="6.600" height="${i < 2 || i > 11 ? 58 : 66}" rx="3.300" fill="url(#sun)"/>`,
      ).join('') +
        `<rect x="4" y="4" width="182" height="38" rx="15" fill="url(#sun)"/>` +
        `<rect x="14" y="10" width="162" height="6" rx="3" fill="#ffffff" fill-opacity=".5"/>` +
        `<rect x="6" y="36" width="178" height="6" rx="3" fill="#e69500" fill-opacity=".35"/>`,
    );
    const next = random(303);
    // Confetti of the three colours at the foot of the card.
    const confetti = (S) =>
      scattered(
        next,
        26,
        1050,
        750,
        [box(0, 0, 1050, 650), box(0, 0, 130, 750), box(140, 650, 560, 76)],
        34,
        14,
      )
        .map(([x, y]) => {
          const colour = pick(next, ['#ffffff', '#ffd23f', '#e5383b', '#ffffff']);
          const at = `transform="translate(${f(x)} ${f(y)}) rotate(${Math.round(next() * 180)})"`;
          return S.pin(
            next() < 0.5
              ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(3 + next() * 3)}" fill="${colour}"/>`
              : `<rect x="-9" y="-3.500" width="18" height="7" rx="3.500" fill="${colour}" ${at}/>`,
            [x, y],
          );
        })
        .join('');
    return magnet(
      'magnet-halake',
      'First haircut magnet',
      'מגנט לחלאקה',
      [1050, 750, 34],
      {
        opening,
        round: 30,
        draw: (S) => ({
          defs:
            fall('sky', '#a9dbfa', '#d3eefd') +
            fall('sun', '#ffd84d', '#ffc21a') +
            `<pattern id="spots" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="6" cy="6" r="3" fill="#ffffff" fill-opacity=".55"/></pattern>` +
            // The edge of the band is pinked: teeth of the same size at any height of the card.
            `<pattern id="pinked" x="${band.w}" width="14" height="28" patternUnits="userSpaceOnUse"><path d="M0 0 14 14 0 28Z" fill="#ffcd33"/></pattern>`,
          body:
            ground(S, 'url(#sky)') +
            onBorder(
              S.pin(cloud(612, 606, 0.86), [712, 700], { y: 'end' }),
              S.pin(cloud(318, -18, 0.56), [380, 20], { y: 'start' }),
              confetti(S),
              S.box(band, 0, 'fill="url(#sun)"'),
              S.box(band, 0, 'fill="url(#spots)"'),
              `<rect x="${band.w}" width="14" height="100%" fill="url(#pinked)"/>`,
            ) +
            frameLine(S, 0, 30, '#ffffff', 8),
        }),
        extras: [
          caption(
            -246,
            327,
            600,
            96,
            { text: 'נתנאל', font: 'Rubik', size: 78, weight: 800 },
            { text: 'Netanel', font: 'Rubik', size: 74, weight: 800 },
            { color: '#1a4f93', turn: -90 },
          ),
          sticker(comb, 716, 630, 182, { turn: 12 }),
          sticker(scissors, 856, 530, 172, { turn: -14 }),
          label(
            bubble,
            670,
            20,
            [
              caption(
                32,
                36,
                286,
                86,
                { text: 'כבר בן 3!', font: 'Rubik', size: 54, weight: 800 },
                { text: 'I’m 3 now!', font: 'Rubik', size: 46, weight: 800 },
                { color: '#d92b2f' },
              ),
            ],
            { turn: 5 },
          ),
          caption(
            146,
            660,
            540,
            54,
            { text: 'חלאקה · התספורת הראשונה', font: 'Rubik', size: 30, weight: 500 },
            {
              text: 'UPSHERIN · THE FIRST HAIRCUT',
              font: 'Poppins',
              size: 23,
              weight: 600,
              spacing: 2,
            },
            { color: '#1a4f93', align: 'left' },
          ),
        ],
      },
      {
        en: 'event upsherin halake first haircut three boy scissors lag baomer meron',
        he: 'אירוע חלאקה חלקה תספורת ראשונה גיל שלוש ילד מספריים ל״ג בעומר מירון',
      },
    );
  }

  /* ---- a housewarming: the window is a house under a roof of tiles, a sign on its wall and
     plants at its door */
  function housewarming() {
    const [left, right, peak, eave, floor] = [96, 954, 70, 256, 654];
    const opening = box(left, peak, right - left, floor - peak);
    const slope = (eave - peak) / (525 - left);
    /**
     * The house, `by` wider than the photograph all around: its walls keep their distance from
     * the sides of the card, the ridge stays in the middle, and the roof is as high at any size.
     */
    const house = (S, by, attrs) =>
      S.shape(
        [
          [left - by, eave - by * 0.65, { x: 'start', y: 'start' }],
          [525, peak - by * 1.1, { x: 'mid', y: 'start' }],
          [right + by, eave - by * 0.65, { x: 'end', y: 'start' }],
          [right + by, floor + by, { x: 'end', y: 'end' }],
          [left - by, floor + by, { x: 'start', y: 'end' }],
        ],
        attrs,
      );
    // The roof: `thick` from its upper line straight down, reaching `over` past the walls. Its
    // lower line is the window's own, since the roof is drawn on the card only.
    const [thick, over] = [42, 58];
    const tip = eave + slope * over;
    const roof = (S) =>
      S.shape(
        [
          [left - over, tip - thick, { x: 'start', y: 'start' }],
          [525, peak - thick, { x: 'mid', y: 'start' }],
          [right + over, tip - thick, { x: 'end', y: 'start' }],
          [right + over, tip, { x: 'end', y: 'start' }],
          [right, eave + 4, { x: 'end', y: 'start' }],
          [left, eave + 4, { x: 'start', y: 'start' }],
          [left - over, tip, { x: 'start', y: 'start' }],
        ],
        'fill="url(#tiles)"',
      );
    const chimney =
      `<rect x="722" y="56" width="62" height="150" fill="#b5573a"/>` +
      line(
        'M722 84H784M722 112H784M753 56V84M738 84V112M768 84V112',
        '#8f3f27',
        1.6,
        ' stroke-opacity=".7"',
      ) +
      `<rect x="712" y="42" width="82" height="20" rx="5" fill="#f6ead6"/>`;
    // The sign: a board of cream on two threads from a nail.
    const sign = art(
      'door-sign',
      268,
      228,
      fall('board', '#fdf6e8', '#f5e7cf'),
      // The twine is light on a dark line, so it shows on any photograph.
      line('M134 17 44 86M134 17 224 86', '#4f3b27', 6.5, ' stroke-linecap="round"') +
        line('M134 17 44 86M134 17 224 86', '#f1dfba', 3.2, ' stroke-linecap="round"') +
        `<circle cx="134" cy="16" r="11" fill="#4f3b27"/><circle cx="134" cy="16" r="7.500" fill="#d8b98f"/><circle cx="131.500" cy="13.500" r="2.600" fill="#ffffff" fill-opacity=".75"/>` +
        `<rect x="8" y="70" width="252" height="150" rx="18" fill="url(#board)" stroke="#c9673f" stroke-width="4"/>` +
        `<rect x="18" y="80" width="232" height="130" rx="11" fill="none" stroke="#c9673f" stroke-opacity=".55" stroke-width="1.300" stroke-dasharray="7 5"/>` +
        `<circle cx="44" cy="87" r="5" fill="#4f3b27"/><circle cx="224" cy="87" r="5" fill="#4f3b27"/>`,
    );
    const next = random(1206);
    // Sprigs of two leaves on the sage of the card.
    const sprigs = (S) =>
      scattered(
        next,
        44,
        1050,
        750,
        [box(38, 0, 974, 300), box(80, 240, 890, 430), box(90, 668, 580, 70)],
        56,
        20,
      )
        .map(([x, y]) =>
          S.pin(
            `<path transform="translate(${f(x)} ${f(y)}) rotate(${Math.round(next() * 360)})" d="M0 0C-9-4-11-13-4-18 2-13 3-5 0 0ZM0 0C9-2 15 4 13 12 5 12 0 7 0 0Z" fill="#f4eedb" fill-opacity="${f(0.35 + next() * 0.3)}"/>`,
            [x, y],
          ),
        )
        .join('');
    return magnet(
      'magnet-housewarming',
      'Housewarming magnet',
      'מגנט לחנוכת בית',
      [1050, 750, 26],
      {
        opening,
        window: (S) => house(S, -1, 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="sage" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b9c8a8"/><stop offset="1" stop-color="#9fb18d"/></linearGradient>` +
            `<pattern id="tiles" width="30" height="22" patternUnits="userSpaceOnUse"><rect width="30" height="22" fill="#c9673f"/>` +
            line(
              'M0 0a15 11 0 0 0 30 0M-15 11a15 11 0 0 0 30 0M15 11a15 11 0 0 0 30 0',
              '#9f4a2a',
              1.7,
            ) +
            `<path d="M4 2a11 8 0 0 0 10 6" fill="none" stroke="#e58a62" stroke-width="1.500" stroke-linecap="round" stroke-opacity=".7"/></pattern>` +
            // The line of the walls: the house a little larger, less the house.
            S.mask('rim', house(S, 9, 'fill="#fff"'), house(S, 0, 'fill="#000"')),
          body:
            ground(S, 'url(#sage)') +
            onBorder(sprigs(S), S.pin(chimney, [753, 56], { x: 'end', y: 'start' }), roof(S)) +
            S.whole('fill="#fbf3e2" mask="url(#rim)"'),
        }),
        extras: [
          label(
            sign,
            14,
            288,
            [
              caption(
                24,
                82,
                220,
                42,
                { text: 'הבית החדש', font: 'Suez One', size: 32 },
                { text: 'Our New', font: 'DM Serif Display', size: 32 },
                { color: '#3c4f37' },
              ),
              caption(
                24,
                140,
                220,
                72,
                { text: 'שלנו', font: 'Suez One', size: 52 },
                { text: 'Home', font: 'DM Serif Display', size: 54 },
                { color: '#a8451f' },
              ),
            ],
            { turn: -5 },
          ),
          sticker(picture('family-home-1'), 812, 458, 222),
          sticker(picture('family-home-3'), 664, 548, 196),
          caption(
            100,
            676,
            560,
            50,
            { text: 'משפחת שגיא · חנוכת בית', font: 'Heebo', size: 30, weight: 600 },
            {
              text: 'THE SAGI FAMILY · NEW HOME',
              font: 'Montserrat',
              size: 22,
              weight: 700,
              spacing: 3,
            },
            { color: '#2f4a2c', align: 'left' },
          ),
        ],
      },
      {
        en: 'event housewarming new home house moving keys plants family',
        he: 'אירוע חנוכת בית דירה חדשה בית חדש מעבר דירה מפתחות עציצים משפחה',
      },
    );
  }

  /* ---- a bachelorette party: a print with a thick white edge on a block of yellow, a sash
     across its corner, a mirror ball and a cocktail at its foot */
  function bachelorette() {
    const opening = box(66, 88, 590, 724);
    const print = inset(opening, -14);
    /*
     * The sash crosses the upper left corner of the print at `LEAN` degrees. Its two ends are
     * cut along the print's own edges, the left one upright and the upper one level, so it
     * reads as a sash worn by the print; and it is short enough for its middle to lie in the
     * first third of the card, so on a larger magnet it stays on that corner.
     */
    const LEAN = 35;
    const [long, tall] = [520, 88];
    const [sin, cos] = [Math.sin((LEAN * Math.PI) / 180), Math.cos((LEAN * Math.PI) / 180)];
    const cuts = { left: (tall * sin) / cos, right: (tall * cos) / sin };
    const sashShape = `M${f(cuts.left)} 0H${f(long - cuts.right)}L${long} ${tall}H0Z`;
    // White satin with a trim of pink, as the sash a bride is given: the light falls along it.
    const sash = art(
      'sash-satin',
      long,
      tall,
      fall('satin', '#efe2f3', '#ffffff', '#ffffff', '#e9d9ee') +
        `<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#d9c2e2" stop-opacity=".5"/><stop offset=".3" stop-color="#ffffff" stop-opacity="0"/><stop offset=".72" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#d9c2e2" stop-opacity=".55"/></linearGradient>` +
        `<clipPath id="sash"><path d="${sashShape}"/></clipPath>`,
      `<path d="${sashShape}" fill="url(#satin)"/><path d="${sashShape}" fill="url(#sheen)"/>` +
        `<g clip-path="url(#sash)">` +
        line(`M0 7.500H${long}M0 ${tall - 7.5}H${long}`, '#ff2d8a', 3.4) +
        line(`M0 13.500H${long}M0 ${tall - 13.5}H${long}`, '#e3a82b', 1.1) +
        `<path d="M0 9C-13-1-6-12 0-5 6-12 13-1 0 9Z" transform="translate(56 46) scale(1.150)" fill="#ff2d8a"/>` +
        `<path d="M0 9C-13-1-6-12 0-5 6-12 13-1 0 9Z" transform="translate(${long - 86} 46) scale(1.150)" fill="#ff2d8a"/></g>`,
    );
    // Where the sash is put so that its cut ends lie on the print's left and upper edges.
    const turned = { w: long * cos + tall * sin, h: long * sin + tall * cos };
    const sashAt = {
      x: print.x - tall * sin + turned.w / 2 - long / 2,
      y: print.y - tall * cos + turned.h / 2 - tall / 2,
    };
    const next = random(808);
    // Sparks of a mirror ball over the card.
    const glints = (S) =>
      scattered(next, 34, 750, 1050, [inset(opening, -44), box(30, 860, 500, 170)], 44, 16)
        .map(([x, y]) =>
          S.pin(
            next() < 0.6
              ? `<path d="${sparkle(x, y, 5 + next() * 9, 0.2)}" fill="#ffffff" fill-opacity="${f(0.55 + next() * 0.45)}"/>`
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2 + next() * 3)}" fill="#fff3a8" fill-opacity=".8"/>`,
            [x, y],
          ),
        )
        .join('');
    return magnet(
      'magnet-bachelorette',
      'Bachelorette party magnet',
      'מגנט למסיבת רווקות',
      [750, 1050, 26],
      {
        opening,
        round: 2,
        draw: (S) => ({
          defs:
            `<linearGradient id="heat" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff2d8a"/><stop offset=".55" stop-color="#ff4f6e"/><stop offset="1" stop-color="#ff8a2a"/></linearGradient>` +
            `<pattern id="halftone" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="5" cy="5" r="2.600" fill="#ffffff" fill-opacity=".2"/></pattern>` +
            `<radialGradient id="flash" cx=".1" cy="1" r=".6"><stop stop-color="#ffe14d" stop-opacity=".55"/><stop offset="1" stop-color="#ffe14d" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, 'url(#heat)') +
            onBorder(
              S.whole('fill="url(#halftone)"'),
              S.whole('fill="url(#flash)"'),
              glints(S),
              // The block behind the print, down and to the right of it.
              S.box({ ...print, x: print.x + 26, y: print.y + 26 }, 4, 'fill="#ffd60a"'),
              S.box(print, 4, 'fill="#ffffff"'),
            ),
        }),
        extras: [
          label(
            sash,
            sashAt.x,
            sashAt.y,
            [
              caption(
                69,
                15,
                350,
                58,
                { text: 'הכלה בדרך!', font: 'Secular One', size: 46 },
                { text: 'BRIDE TO BE', font: 'Poppins', size: 34, weight: 800, spacing: 2 },
                { color: '#2a0d5c' },
              ),
            ],
            { turn: -LEAN },
          ),
          sticker('mirror-ball', 524, 770, 204, { turn: 8 }),
          sticker('cocktail-glass', 470, 886, 148, { turn: -10 }),
          sticker('kiss-mark', 640, 944, 92, { turn: 14 }),
          caption(
            38,
            872,
            460,
            106,
            { text: 'הרווקות של דנה', font: 'Karantina', size: 84, weight: 700 },
            { text: 'DANA’S BACHELORETTE', font: 'Karantina', size: 56, weight: 700 },
            { color: '#2a0d5c', align: 'left' },
          ),
          caption(
            40,
            976,
            430,
            44,
            { text: 'רק בנות · רק הלילה', font: 'Rubik', size: 30, weight: 500 },
            { text: 'GIRLS ONLY · TONIGHT', font: 'Poppins', size: 28, weight: 600, spacing: 1 },
            { color: '#2a0d5c', align: 'left' },
          ),
        ],
      },
      {
        en: 'event bachelorette hen party bride to be girls night disco cocktail',
        he: 'אירוע מסיבת רווקות מסיבה רווקה כלה בנות לילה דיסקו קוקטייל חתונה',
      },
    );
  }

  return [
    engagement(),
    henna(),
    anniversary(),
    golden(),
    babyshower(),
    brit(),
    batmitzvah(),
    halake(),
    housewarming(),
    bachelorette(),
  ];
}
