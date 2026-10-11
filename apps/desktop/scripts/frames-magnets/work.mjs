/*
 * The magnets of work events (`../frames-magnets.mjs`): an offsite, a product launch, a holiday
 * toast, an awards night, a retirement, a hackathon, a first day, a conference, the company's
 * birthday and a family day. The launch, the first day and the conference follow the deck's own
 * theme, as the company event of the first ten does: their colours are the theme's variables
 * and their words are set in the deck's fonts.
 */

/** @param kit What a magnet is drawn with (`kit.mjs`). */
export default function work(kit) {
  const { data, moved, scaled, smooth, around, random, box, inset, f } = kit;
  const { magnet, sticker, caption, label, art, picture, ground, onBorder, line, frameLine } = kit;
  const { sparkle, star, scattered, pick, cloud } = kit;

  /** A paint of the deck's theme, as the style of a part: the part follows the theme. */
  const themed = (property, token) => `${property}:var(--color-${token})`;

  /** The four corners of a box. */
  const cornersOf = ({ x, y, w, h }) => [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ];

  /**
   * A strip along the foot of the card, `tall` high: as wide as the card at any size, and as
   * tall as it is drawn. `body` is drawn in the coordinates of the card.
   */
  const alongFoot = (S, tall, body) =>
    `<svg y="100%" overflow="visible"><svg y="${-tall}" width="100%" height="${tall}" viewBox="0 ${S.h - tall} ${S.w} ${tall}" preserveAspectRatio="none">${body}</svg></svg>`;

  /* ---- an offsite: teal over a slope of sand, the word large at the right, peaks at its foot */
  function offsite() {
    const opening = box(40, 40, 620, 670);
    const next = random(4120);
    // The slope: from the right side of the card down behind the photograph. Beside the
    // photograph it keeps its place under the words at any size.
    const slope = (rise) => [
      [1050, 336 - rise, { x: 'end', y: 'start' }],
      [600, 551 - rise, { x: 'end', y: 'start' }],
      [60, 796 - rise, { x: 'start', y: 'end' }],
    ];
    const below = [[1050, 796, { x: 'end', y: 'end' }]];
    // Contour lines of a hill around a corner, as a map draws them.
    const hill = (cx, cy, reach, colour, opacity) => {
      const wobble = Array.from({ length: 9 }, () => 0.84 + next() * 0.32);
      return Array.from({ length: Math.floor(reach / 26) }, (_, ring) =>
        line(
          data(moved(scaled(smooth(around(9, 0, (i) => wobble[i])), 26 * (ring + 1)), cx, cy)),
          colour,
          1.5,
          ` stroke-opacity="${opacity}"`,
        ),
      ).join('');
    };
    const chip = art(
      'offsite-chip',
      300,
      54,
      '',
      `<rect width="300" height="54" rx="27" fill="#fbf1dc"/>` +
        `<path fill="#ef6a4c" d="M31 10.500c-7.500 0-13.500 5.800-13.500 13 0 9.400 13.500 20 13.500 20s13.500-10.600 13.500-20c0-7.200-6-13-13.500-13Z"/>` +
        `<circle cx="31" cy="23.500" r="5" fill="#fbf1dc"/>`,
    );
    return magnet(
      'magnet-offsite',
      'Offsite magnet',
      'מגנט לאופסייט',
      [1050, 750, 22],
      {
        opening,
        round: 10,
        draw: (S) => ({
          defs:
            `<linearGradient id="teal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#12636b"/><stop offset="1" stop-color="#0a444c"/></linearGradient>` +
            `<linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f7ead0"/><stop offset="1" stop-color="#efdcb6"/></linearGradient>`,
          body:
            ground(S, 'url(#teal)') +
            onBorder(
              S.pin(hill(1030, 20, 300, '#8fd0cf', 0.2), [1030, 20], { x: 'end', y: 'start' }),
              S.pin(hill(30, 720, 200, '#8fd0cf', 0.16), [30, 720], { x: 'start', y: 'end' }),
              S.shape([...slope(0), ...below], 'fill="url(#sand)"'),
              S.shape([...slope(30), ...slope(14).reverse()], 'fill="#ef6a4c"'),
              S.pin(hill(1040, 770, 230, '#d9bf8c', 0.55), [1040, 770], { x: 'end', y: 'end' }),
            ) +
            frameLine(S, 0, 10, '#fffaf0', 6),
        }),
        extras: [
          // Set to the right: only that end of the box holds the word, so the box may be wide.
          caption(
            664,
            46,
            348,
            148,
            { text: 'אופסייט', font: 'Karantina', size: 126, weight: 700 },
            { text: 'OFFSITE', font: 'Karantina', size: 126, weight: 700 },
            { color: '#fbf1dc', align: 'right' },
          ),
          label(chip, 712, 208, [
            caption(
              54,
              7,
              232,
              40,
              { text: 'הגליל העליון', font: 'Heebo', size: 28, weight: 700 },
              { text: 'UPPER GALILEE', font: 'Montserrat', size: 20, weight: 700, spacing: 1.5 },
              { color: '#0b4a52' },
            ),
          ]),
          // The peaks stand on the corner of the photograph, on the sand.
          sticker(picture('work-paper-2'), 590, 478, 236, { turn: -3 }),
          caption(
            664,
            688,
            348,
            36,
            { text: 'מתנתקים כדי להתחבר', font: 'Heebo', size: 26, weight: 500 },
            { text: 'Unplug to reconnect', font: 'DM Sans', size: 25, weight: 500 },
            { color: '#0b4a52', align: 'right' },
          ),
        ],
      },
      {
        en: 'event work team offsite retreat getaway outdoors mountains company',
        he: 'אירוע עבודה צוות אופסייט גיבוש נופש טבע הרים חברה',
      },
    );
  }

  /* ---- a product launch, in the deck's theme: a lower third from the left, a sash on the corner */
  function launch() {
    const opening = box(52, 52, 946, 576);
    // The lower third: a bar that comes in from the side of the card and ends on a slant, and
    // two slanted strokes after it.
    const third = art(
      'launch-third',
      630,
      132,
      '',
      `<path style="${themed('fill', 'primary')}" d="M0 0H570L530 132H0Z"/>` +
        `<path style="${themed('fill', 'bg')}" fill-opacity=".14" d="M0 0H570l-3 10H0Z"/>` +
        `<path style="${themed('fill', 'accent')}" d="M582 0h28l-40 132h-28Z"/>` +
        `<path style="${themed('fill', 'accent')}" fill-opacity=".45" d="M620 0h10l-40 132h-10Z"/>`,
    );
    // The sash: a band across the corner of the photograph, cut along the two edges it
    // crosses. Turned by 45 degrees, its long side runs from one edge to the other.
    const sash = art(
      'launch-sash',
      396,
      72,
      '',
      `<path style="${themed('fill', 'text')}" d="M0 72 72 0H324l72 72Z"/>` +
        `<path style="${themed('stroke', 'accent')}" fill="none" stroke-width="2.600" d="M67 9.500H329M12 62.500H384"/>`,
    );
    const rocket = art(
      'launch-rocket',
      100,
      160,
      '',
      `<path style="${themed('fill', 'accent')}" d="M36 116q14 30 14 42 0-12 14-42Z"/>` +
        `<path style="${themed('fill', 'accent')}" d="M29 82 8 124l26-12ZM71 82l21 42-26-12Z"/>` +
        `<path style="${themed('fill', 'primary')}" d="M50 3C29 25 24 62 29 112h42c5-50 0-87-21-109Z"/>` +
        `<path style="${themed('fill', 'bg')}" fill-opacity=".22" d="M50 3C29 25 24 62 29 112h10C35 62 38 25 50 3Z"/>` +
        `<rect x="35" y="108" width="30" height="11" rx="3" style="${themed('fill', 'text')}"/>` +
        `<circle cx="50" cy="56" r="13" style="${themed('fill', 'bg')};${themed('stroke', 'text')}" stroke-width="4.500"/>`,
    );
    return magnet(
      'magnet-launch',
      'Product launch magnet',
      'מגנט להשקת מוצר',
      [1050, 750, 14],
      {
        opening,
        draw: (S) => ({
          defs: `<pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="2" style="${themed('fill', 'text')}" fill-opacity=".28"/></pattern>`,
          body:
            S.whole('mask="url(#border)"', themed('fill', 'surface')) +
            onBorder(
              S.whole('fill="url(#grid)"'),
              // The way the rocket came: a line of dashes behind it.
              S.pin(
                `<path d="M664 722q150 14 240-66" fill="none" style="${themed('stroke', 'accent')}" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 13"/>`,
                [790, 700],
                { x: 'end', y: 'end' },
              ),
            ) +
            S.outline(opening, 0, 6, '', { paint: `${themed('stroke', 'bg')};` }),
        }),
        extras: [
          sticker(rocket, 902, 566, 104, { turn: 42 }),
          label(third, 0, 556, [
            caption(
              30,
              12,
              480,
              72,
              { text: 'יצאנו לדרך!', size: 60, weight: 800 },
              { text: 'We’re live!', size: 60, weight: 800 },
              { color: { token: 'bg' }, align: 'right' },
            ),
            caption(
              30,
              84,
              470,
              38,
              { text: 'השקת המוצר החדש', size: 27, weight: 500 },
              { text: 'NEW PRODUCT LAUNCH', size: 22, weight: 600, spacing: 2 },
              { color: { token: 'bg' }, align: 'right' },
            ),
          ]),
          label(
            sash,
            685.4,
            130.6,
            [
              caption(
                118,
                19,
                160,
                34,
                { text: 'חדש', size: 26, weight: 800, spacing: 2 },
                { text: 'NEW', size: 24, weight: 800, spacing: 3 },
                { color: { token: 'bg' } },
              ),
            ],
            { turn: 45 },
          ),
        ],
      },
      {
        en: 'event work product launch release startup new brand theme',
        he: 'אירוע עבודה השקה מוצר חדש סטארטאפ גרסה מותג',
      },
    );
  }

  /* ---- a holiday toast: a plaque of wine red and gold, glasses on its top, a tag below */
  function toast() {
    const opening = box(58, 184, 634, 566);
    const R = 42;
    const GOLD = '#dcbb6c';
    /** A disc on every corner of the photograph, which goes with that corner. */
    const discs = (S, r, attrs) =>
      cornersOf(opening)
        .map(([cx, cy]) =>
          S.pin(`<circle cx="${cx}" cy="${cy}" r="${r}" ${attrs}/>`, [cx, cy], {
            x: 'near',
            y: 'near',
          }),
        )
        .join('');
    /**
     * A line around the plaque, `by` away from it: straight along its sides, and around each
     * corner on the inside, as the plaque is cut. Each kind of part is masked by the other.
     */
    const plaque = (S, by, width, id) => ({
      defs:
        S.mask(`${id}-sides`, S.whole('fill="#fff"'), discs(S, R - by, 'fill="#000"')) +
        S.mask(`${id}-turns`, S.box(inset(opening, -by), 0, 'fill="#fff"'), ''),
      body:
        `<g mask="url(#${id}-sides)">${S.outline(inset(opening, -by), 0, width, `stroke="${GOLD}"`)}</g>` +
        `<g mask="url(#${id}-turns)">${discs(S, R - by, `fill="none" stroke="${GOLD}" stroke-width="${width}"`)}</g>`,
    });
    /**
     * A sprig of olive in line: a stem that bends, a leaf to either side at every step and an
     * olive here and there. It starts at its point and runs along `turn`.
     */
    const sprig = (x, y, turn, length, leaves, bend) => {
      const parts = [
        line(
          `M0 0Q${f(length / 2)} ${f(-2 * bend)} ${f(length)} 0`,
          GOLD,
          2,
          ' stroke-linecap="round"',
        ),
      ];
      for (let i = 1; i <= leaves; i++) {
        const t = i / (leaves + 0.4);
        const [px, py] = [length * t, -4 * bend * t * (1 - t)];
        const along = (Math.atan2(-4 * bend * (1 - 2 * t), length) * 180) / Math.PI;
        const side = i % 2 ? -1 : 1;
        const l = 34 * (1 - 0.4 * t);
        parts.push(
          `<path transform="translate(${f(px)} ${f(py)}) rotate(${f(along + side * 46)})" fill="${GOLD}" fill-opacity=".2" stroke="${GOLD}" stroke-width="1.700" d="M0 0C${f(l * 0.3)} ${f(-l * 0.3)} ${f(l * 0.8)} ${f(-l * 0.2)} ${f(l)} 0C${f(l * 0.8)} ${f(l * 0.2)} ${f(l * 0.3)} ${f(l * 0.3)} 0 0Z"/>`,
        );
        if (i % 3 === 0) {
          parts.push(
            `<circle cx="${f(px + side * 9)}" cy="${f(py - side * 15)}" r="5" fill="${GOLD}" fill-opacity=".85"/>`,
          );
        }
      }
      return `<g transform="translate(${x} ${y}) rotate(${turn})" stroke-opacity=".88">${parts.join('')}</g>`;
    };
    const next = random(915);
    // Bubbles of gold in the band above the photograph.
    const bubbles = (S) =>
      scattered(next, 26, 750, 176, [box(245, 0, 260, 176)], 30, 22)
        .map(([x, y]) =>
          S.pin(
            next() < 0.45
              ? `<path d="${sparkle(x, y, 5 + next() * 7)}" fill="#f1dca0" fill-opacity="${f(0.5 + next() * 0.5)}"/>`
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.6 + next() * 2.6)}" fill="#f1dca0" fill-opacity="${f(0.35 + next() * 0.5)}"/>`,
            [x, y],
            { x: x < 375 ? 'start' : 'end', y: 'start' },
          ),
        )
        .join('');
    // The tag: paper on a loop of gold thread, which hangs from a pin.
    const tag = art(
      'toast-tag',
      280,
      236,
      `<linearGradient id="tag-paper" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fbf5e4"/><stop offset="1" stop-color="#f1e5c8"/></linearGradient>`,
      line('M140 10C116 34 124 58 140 74M140 10C164 34 156 58 140 74', '#c9a14a', 2.2) +
        `<path fill="url(#tag-paper)" d="M52 52H228L270 96V224a10 10 0 0 1-10 10H20a10 10 0 0 1-10-10V96Z"/>` +
        line('M57 62H223L260 100V220a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V100Z', '#c9a14a', 1.6) +
        `<circle cx="140" cy="80" r="11" fill="#e6c477"/><circle cx="140" cy="80" r="5.500" fill="#5b1226"/>` +
        `<circle cx="140" cy="10" r="7" fill="#e6c477"/><circle cx="138" cy="8" r="2.400" fill="#fff6d8"/>` +
        line('M96 200H126M154 200H184', '#c9a14a', 1.6, ' stroke-linecap="round"') +
        `<path d="${sparkle(140, 200, 9, 0.3)}" fill="#c9a14a"/>`,
    );
    return magnet(
      'magnet-toast',
      'Holiday toast magnet',
      'מגנט להרמת כוסית',
      [750, 1050, 26],
      {
        opening,
        // The plaque: a box with its corners cut round, on the inside.
        window: (S) => S.box(inset(opening, 1), 0, 'fill="#000"') + discs(S, R + 1, 'fill="#fff"'),
        draw: (S) => {
          const [outer, inner] = [plaque(S, 9, 3, 'far'), plaque(S, 16, 1.2, 'near')];
          return {
            defs:
              `<linearGradient id="wine" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6a1730"/><stop offset="1" stop-color="#3c0a19"/></linearGradient>` +
              `<radialGradient id="warm" cx=".5" cy=".06" r=".6"><stop stop-color="#a3324e" stop-opacity=".75"/><stop offset="1" stop-color="#a3324e" stop-opacity="0"/></radialGradient>` +
              outer.defs +
              inner.defs,
            body:
              ground(S, 'url(#wine)') +
              onBorder(
                S.whole('fill="url(#warm)"'),
                bubbles(S),
                // Olive on either side of the glasses, and up from the two lower corners.
                S.pin(sprig(238, 112, 190, 176, 7, 26), [238, 112], { x: 'mid', y: 'start' }),
                S.pin(sprig(512, 112, -10, 176, 7, -26), [512, 112], { x: 'mid', y: 'start' }),
                S.pin(sprig(44, 1012, -62, 250, 9, -34), [44, 1012], { x: 'start', y: 'end' }),
                S.pin(sprig(706, 1012, -118, 250, 9, 34), [706, 1012], { x: 'end', y: 'end' }),
              ) +
              S.outline(box(14, 14, 722, 1022), 15, 1.6, `stroke="${GOLD}" stroke-opacity=".8"`) +
              outer.body +
              inner.body,
          };
        },
        extras: [
          sticker(picture('work-gold-2'), 272, 4, 206),
          label(
            tag,
            235,
            714,
            [
              caption(
                24,
                104,
                232,
                86,
                { text: 'לחיים!', font: 'Frank Ruhl Libre', size: 70, weight: 900 },
                { text: 'Cheers!', font: 'Playfair Display', size: 54, weight: 700, italic: true },
                { color: '#5b1226' },
              ),
            ],
            { turn: -4 },
          ),
          caption(
            75,
            972,
            600,
            46,
            {
              text: 'מרימים כוסית לחג',
              font: 'Frank Ruhl Libre',
              size: 36,
              weight: 500,
              spacing: 1,
            },
            { text: 'A HOLIDAY TOAST', font: 'Montserrat', size: 28, weight: 500, spacing: 7 },
            { color: '#ecd596' },
          ),
        ],
      },
      {
        en: 'event work holiday toast cheers wine champagne new year passover elegant gold',
        he: 'אירוע עבודה הרמת כוסית לחיים חג ראש השנה פסח יין שמפניה חגיגי זהב',
      },
    );
  }

  /* ---- an awards night: black and gold under a spotlight, a medal from the top, the name below */
  function awards() {
    const opening = box(36, 36, 820, 678);
    const next = random(7140);
    const dust = (S) =>
      scattered(next, 52, 1050, 750, [inset(opening, -10)], 20, 8)
        .map(([x, y]) =>
          S.pin(
            next() < 0.3
              ? `<path d="${sparkle(x, y, 4 + next() * 7)}" fill="#f6dc93" fill-opacity="${f(0.45 + next() * 0.5)}"/>`
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + next() * 2.2)}" fill="#e9c66b" fill-opacity="${f(0.3 + next() * 0.6)}"/>`,
            [x, y],
          ),
        )
        .join('');
    // The medal: a ribbon from the top of the card, a loop, and a disc of gold with a rim.
    const medal = art(
      'awards-medal',
      210,
      312,
      `<linearGradient id="medal-rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0b8"/><stop offset=".45" stop-color="#d9a93c"/><stop offset="1" stop-color="#8f6416"/></linearGradient>` +
        `<radialGradient id="medal-face" cx=".38" cy=".3" r=".85"><stop stop-color="#fbe7a2"/><stop offset=".7" stop-color="#e3b950"/><stop offset="1" stop-color="#c99a32"/></radialGradient>` +
        `<linearGradient id="medal-silk" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b3243b"/><stop offset="1" stop-color="#7c1226"/></linearGradient>`,
      `<path fill="url(#medal-silk)" d="M58 0H152V112L105 140 58 112Z"/>` +
        `<path fill="#f1d27a" d="M68 0h9V123l-9-5ZM133 0h9V118l-9 5Z"/>` +
        `<path fill="#000" fill-opacity=".22" d="M58 96 105 124l47-28v16l-47 28-47-28Z"/>` +
        `<rect x="92" y="116" width="26" height="20" rx="5" fill="none" stroke="url(#medal-rim)" stroke-width="5"/>` +
        `<circle cx="105" cy="208" r="98" fill="url(#medal-rim)"/>` +
        `<circle cx="105" cy="208" r="89" fill="#a87a1e"/>` +
        `<circle cx="105" cy="208" r="85" fill="url(#medal-face)"/>` +
        `<circle cx="105" cy="208" r="78" fill="none" stroke="#8f6416" stroke-opacity=".55" stroke-width="2" stroke-dasharray=".1 6.900" stroke-linecap="round"/>` +
        `<path d="${star(105, 147, 9)}" fill="#8f6416"/>` +
        `<path d="${star(105, 271, 6)}" fill="#8f6416" fill-opacity=".8"/>`,
    );
    // The plate of the name: dark, and thinning out to both ends, between two rules of gold.
    const plate = art(
      'awards-name',
      600,
      120,
      `<linearGradient id="name-dark" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#0a0907" stop-opacity="0"/><stop offset=".17" stop-color="#0a0907" stop-opacity=".86"/><stop offset=".83" stop-color="#0a0907" stop-opacity=".86"/><stop offset="1" stop-color="#0a0907" stop-opacity="0"/></linearGradient>` +
        `<linearGradient id="name-rule" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#e9c66b" stop-opacity="0"/><stop offset=".2" stop-color="#e9c66b"/><stop offset=".8" stop-color="#e9c66b"/><stop offset="1" stop-color="#e9c66b" stop-opacity="0"/></linearGradient>`,
      `<rect width="600" height="120" fill="url(#name-dark)"/>` +
        `<rect width="600" height="2.600" fill="url(#name-rule)"/>` +
        `<rect y="117.400" width="600" height="2.600" fill="url(#name-rule)"/>` +
        `<path d="${sparkle(300, 1.3, 8, 0.3)}" fill="#f6dc93"/><path d="${sparkle(300, 118.7, 8, 0.3)}" fill="#f6dc93"/>`,
    );
    return magnet(
      'magnet-awards',
      'Awards night magnet',
      'מגנט לערב הוקרה',
      [1050, 750, 18],
      {
        opening,
        round: 6,
        draw: (S) => ({
          defs:
            `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1a1610"/><stop offset="1" stop-color="#060505"/></linearGradient>` +
            `<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffe9a8" stop-opacity=".5"/><stop offset=".75" stop-color="#ffe9a8" stop-opacity=".06"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></linearGradient>` +
            `<radialGradient id="floor" cx=".5" cy=".5" r=".5"><stop stop-color="#e9c66b" stop-opacity=".5"/><stop offset="1" stop-color="#e9c66b" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, 'url(#night)') +
            onBorder(
              // Two beams of a spotlight down the side of the card, and the pool of light they
              // make at its foot.
              S.shape(
                [
                  [938, 0, { x: 'end', y: 'start' }],
                  [988, 0, { x: 'end', y: 'start' }],
                  [1120, 750, { x: 'end', y: 'end' }],
                  [800, 750, { x: 'end', y: 'end' }],
                ],
                'fill="url(#beam)"',
              ),
              S.shape(
                [
                  [1010, 0, { x: 'end', y: 'start' }],
                  [1040, 0, { x: 'end', y: 'start' }],
                  [1000, 750, { x: 'end', y: 'end' }],
                  [860, 750, { x: 'end', y: 'end' }],
                ],
                'fill="url(#beam)" opacity=".55"',
              ),
              S.ellipse(box(820, 668, 260, 110), 'fill="url(#floor)"', {
                ties: { x: 'end', y: 'end' },
              }),
              dust(S),
            ) +
            S.outline(box(12, 12, 1026, 726), 10, 1.4, 'stroke="#e9c66b" stroke-opacity=".7"') +
            frameLine(S, 0, 6, '#e9c66b', 3) +
            frameLine(S, 8, 12, '#e9c66b', 1, ' stroke-opacity=".6"'),
        }),
        extras: [
          sticker(picture('work-gold-1'), 806, 150, 226, { flip: true }),
          sticker(picture('work-gold-3'), 884, 500, 146),
          label(plate, 146, 582, [
            caption(
              40,
              8,
              520,
              70,
              { text: 'עומר שגיא', font: 'Frank Ruhl Libre', size: 58, weight: 700 },
              { text: 'Omer Sagi', font: 'Playfair Display', size: 54, weight: 700 },
              { color: '#f6dc93' },
            ),
            caption(
              40,
              78,
              520,
              32,
              {
                text: 'על מצוינות, מסירות ורוח צוות',
                font: 'Heebo',
                size: 24,
                weight: 400,
                spacing: 0.5,
              },
              {
                text: 'FOR EXCELLENCE AND TEAM SPIRIT',
                font: 'Montserrat',
                size: 20,
                weight: 500,
                spacing: 1.5,
              },
              { color: '#efe6cf' },
            ),
          ]),
          label(medal, 50, 0, [
            caption(
              20,
              162,
              170,
              52,
              { text: 'מצטיין', font: 'Frank Ruhl Libre', size: 40, weight: 900 },
              { text: 'MVP', font: 'DM Serif Display', size: 44 },
              { color: '#3a2606' },
            ),
            caption(
              20,
              214,
              170,
              38,
              { text: 'השנה', font: 'Frank Ruhl Libre', size: 32, weight: 700 },
              { text: 'OF THE YEAR', font: 'DM Sans', size: 20, weight: 700 },
              { color: '#3a2606' },
            ),
          ]),
        ],
      },
      {
        en: 'event work awards night ceremony recognition employee winner trophy gold gala',
        he: 'אירוע עבודה ערב הוקרה טקס פרס עובד מצטיין הצטיינות גביע זהב גאלה',
      },
    );
  }

  /* ---- a retirement: a postcard with an airmail edge, a stamp on its corner, thanks at its foot */
  function retirement() {
    const opening = box(52, 52, 946, 508);
    /** The outline of a stamp: a box with a bite out of its edge at every step. */
    const perforated = (w, h, r, count, down) => {
      const [dx, dy] = [w / count, h / down];
      let d = `M0 0`;
      for (let i = 1; i < count; i++) d += `H${f(dx * i - r)}A${r} ${r} 0 0 0 ${f(dx * i + r)} 0`;
      d += `H${w}`;
      for (let i = 1; i < down; i++) d += `V${f(dy * i - r)}A${r} ${r} 0 0 0 ${w} ${f(dy * i + r)}`;
      d += `V${h}`;
      for (let i = count - 1; i > 0; i--)
        d += `H${f(dx * i + r)}A${r} ${r} 0 0 0 ${f(dx * i - r)} ${h}`;
      d += `H0`;
      for (let i = down - 1; i > 0; i--)
        d += `V${f(dy * i + r)}A${r} ${r} 0 0 0 0 ${f(dy * i - r)}`;
      return `${d}Z`;
    };
    // The stamp: a sun that comes up over the sea, and the words under it.
    const rays = around(9, 0)
      .map(
        ([x, y]) => `M${f(104 + x * 48)} ${f(112 + y * 48)}L${f(104 + x * 72)} ${f(112 + y * 72)}`,
      )
      .join('');
    const stamp = art(
      'retire-stamp',
      212,
      279,
      `<clipPath id="stamp-view"><rect x="18" y="18" width="172" height="128" rx="4"/></clipPath>`,
      `<path fill="#1f3a5f" fill-opacity=".2" transform="translate(4 5)" d="${perforated(208, 274, 6.5, 10, 13)}"/>` +
        `<path fill="#fffdf6" d="${perforated(208, 274, 6.5, 10, 13)}"/>` +
        `<g clip-path="url(#stamp-view)"><rect x="18" y="18" width="172" height="128" fill="#1f3a5f"/>` +
        line(rays, '#f6b89f', 5, ' stroke-linecap="round" stroke-opacity=".9"') +
        `<circle cx="104" cy="112" r="38" fill="#ef6a4c"/>` +
        `<path fill="#fbf4e4" d="M18 116q22-12 43 0t43 0 43 0 43 0v30H18Z"/>` +
        `<path fill="#9ec3d6" d="M18 130q22-12 43 0t43 0 43 0 43 0v16H18Z"/></g>` +
        `<rect x="18" y="18" width="172" height="128" rx="4" fill="none" stroke="#1f3a5f" stroke-width="2"/>`,
    );
    // The postmark: a ring with a star, and the waves of the cancelling machine.
    const postmark = art(
      'retire-postmark',
      220,
      100,
      '',
      `<g fill="none" stroke="#1f3a5f" stroke-opacity=".78" stroke-linecap="round">` +
        `<circle cx="50" cy="50" r="44" stroke-width="3"/><circle cx="50" cy="50" r="34" stroke-width="1.600"/>` +
        `<path stroke-width="3" d="M100 22q15-12 30 0t30 0 30 0 28 0M100 41q15-12 30 0t30 0 30 0 28 0M100 60q15-12 30 0t30 0 30 0 28 0M100 79q15-12 30 0t30 0 30 0 28 0"/></g>` +
        `<path d="${star(50, 50, 17)}" fill="#1f3a5f" fill-opacity=".78"/>`,
    );
    return magnet(
      'magnet-retirement',
      'Retirement magnet',
      'מגנט לפרישה',
      [1050, 750, 16],
      {
        opening,
        round: 4,
        draw: (S) => ({
          defs:
            // The edge of an airmail envelope: slanted bars of two colours, as long as the card.
            `<pattern id="mail" width="56" height="56" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="56" height="56" fill="#fbf4e4"/><rect width="14" height="56" fill="#1f3a5f"/><rect x="28" width="14" height="56" fill="#e2573f"/></pattern>` +
            `<radialGradient id="paper" cx=".5" cy=".4" r=".8"><stop stop-color="#fdf8ec"/><stop offset="1" stop-color="#f4e8cf"/></radialGradient>`,
          body:
            ground(S, 'url(#mail)') +
            S.box(box(15, 15, 1020, 720), 6, 'fill="url(#paper)" mask="url(#border)"') +
            frameLine(S, 7, 8, '#1f3a5f', 1.5, ' stroke-opacity=".7"'),
        }),
        extras: [
          sticker(picture('work-paper-1'), 34, 532, 212, { turn: -5 }),
          label(
            stamp,
            22,
            18,
            [
              // Two lines on a turned plate: far enough apart that their boxes, turned, stay clear.
              caption(
                14,
                152,
                180,
                42,
                { text: 'הפרק הבא', font: 'Frank Ruhl Libre', size: 32, weight: 700 },
                {
                  text: 'Next chapter',
                  font: 'Playfair Display',
                  size: 24,
                  weight: 600,
                  italic: true,
                },
                { color: '#1f3a5f' },
              ),
              caption(
                14,
                205,
                180,
                44,
                { text: 'מתחיל', font: 'Frank Ruhl Libre', size: 36, weight: 900 },
                { text: 'BEGINS', font: 'Montserrat', size: 24, weight: 700, spacing: 6 },
                { color: '#c4472f' },
              ),
            ],
            { turn: -5 },
          ),
          sticker(postmark, 256, 598, 176, { turn: -9 }),
          caption(
            330,
            572,
            668,
            98,
            { text: 'תודה, רותי', font: 'Frank Ruhl Libre', size: 84, weight: 900 },
            {
              text: 'Thank you, Ruthie',
              font: 'Playfair Display',
              size: 64,
              weight: 700,
              italic: true,
            },
            { color: '#1f3a5f', align: 'right' },
          ),
          caption(
            330,
            674,
            668,
            40,
            { text: '32 שנים של לב ונשמה', font: 'Heebo', size: 28, weight: 500, spacing: 1 },
            {
              text: '32 YEARS OF HEART AND SOUL',
              font: 'Montserrat',
              size: 22,
              weight: 600,
              spacing: 3,
            },
            { color: '#b5412c', align: 'right' },
          ),
        ],
      },
      {
        en: 'event work retirement farewell goodbye thank you colleague postcard pension',
        he: 'אירוע עבודה פרישה פרידה תודה גמלאות פנסיה עמית גלויה',
      },
    );
  }

  /* ---- a hackathon: the photograph in a terminal window, a prompt under it, a tag on its bar */
  function hackathon() {
    const opening = box(40, 86, 970, 500);
    const pane = box(40, 40, 970, 546);
    const GREEN = '#39ff9c';
    const next = random(2424);
    // Lines of code as a map of a file shows them: bars of a few lengths and colours.
    const code = (S) => {
      const bars = [];
      for (const y of [690, 712]) {
        for (let x = 40; x < 600;) {
          const wide = 28 + Math.floor(next() * 5) * 22;
          const colour = pick(next, [GREEN, '#29e7ff', '#8b98a8', '#8b98a8']);
          bars.push(
            `<rect x="${x}" y="${y}" width="${wide}" height="9" rx="4.500" fill="${colour}" fill-opacity="${colour === '#8b98a8' ? 0.35 : 0.55}"/>`,
          );
          x += wide + 12;
        }
      }
      return S.pin(bars.join(''), [40, 700], { x: 'start', y: 'end' });
    };
    // The tag of a version: a plate with a point and a hole, as a tag of a release is drawn.
    const tag = art(
      'hack-tag',
      264,
      56,
      '',
      `<path fill="#0c1a18" stroke="#29e7ff" stroke-width="2.600" stroke-linejoin="round" d="M30 2H250a12 12 0 0 1 12 12V42a12 12 0 0 1-12 12H30L3 28Z"/>` +
        `<circle cx="31" cy="28" r="6" fill="none" stroke="#29e7ff" stroke-width="2.600"/>`,
    );
    return magnet(
      'magnet-hackathon',
      'Hackathon magnet',
      'מגנט להאקתון',
      [1050, 750, 20],
      {
        opening,
        // A window of a terminal: square under its bar, round at its foot.
        window: (S) => S.box(inset(opening, 1), [0, 0, 11, 11], 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<pattern id="mesh" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#29e7ff" stroke-opacity=".13" stroke-width="1"/></pattern>` +
            `<radialGradient id="lime" cx=".05" cy="1" r=".6"><stop stop-color="${GREEN}" stop-opacity=".2"/><stop offset="1" stop-color="${GREEN}" stop-opacity="0"/></radialGradient>` +
            `<radialGradient id="ice" cx="1" cy="0" r=".55"><stop stop-color="#29e7ff" stop-opacity=".2"/><stop offset="1" stop-color="#29e7ff" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, '#090d12') +
            onBorder(
              S.whole('fill="url(#mesh)"'),
              S.whole('fill="url(#lime)"'),
              S.whole('fill="url(#ice)"'),
              code(S),
              // The bar of the window, with its three buttons.
              S.box(box(40, 40, 970, 46), [12, 12, 0, 0], 'fill="#18202a"'),
              S.box(box(40, 84, 970, 2), 0, `fill="${GREEN}" fill-opacity=".35"`),
              S.pin(
                `<circle cx="68" cy="63" r="7.500" fill="#ff5f57"/><circle cx="92" cy="63" r="7.500" fill="#febc2e"/><circle cx="116" cy="63" r="7.500" fill="#28c840"/>`,
                [68, 63],
                { x: 'start', y: 'start' },
              ),
            ) +
            // The glow of the window: the same line three times, wider and fainter.
            S.outline(pane, 12, 9, `stroke="${GREEN}" stroke-opacity=".1"`) +
            S.outline(pane, 12, 5, `stroke="${GREEN}" stroke-opacity=".22"`) +
            S.outline(pane, 12, 2, `stroke="${GREEN}"`),
        }),
        extras: [
          sticker(picture('work-paper-4'), 796, 548, 232, { turn: -3 }),
          caption(
            40,
            610,
            640,
            52,
            {
              text: '> לילה אחד, רעיון אחד, המון קפה_',
              font: 'IBM Plex Sans Hebrew',
              size: 36,
              weight: 600,
            },
            { text: '> hackathon --team purple_', font: 'JetBrains Mono', size: 33, weight: 700 },
            { color: GREEN, align: 'left' },
          ),
          label(
            tag,
            752,
            58,
            [
              caption(
                48,
                9,
                204,
                38,
                { text: '24 שעות · v1.0', font: 'IBM Plex Sans Hebrew', size: 24, weight: 600 },
                { text: '24h · v1.0', font: 'JetBrains Mono', size: 24, weight: 700 },
                { color: '#8df3ff' },
              ),
            ],
            { turn: 4 },
          ),
        ],
      },
      {
        en: 'event work hackathon code developers tech terminal startup night pizza',
        he: 'אירוע עבודה האקתון האקאתון קוד מפתחים הייטק טרמינל סטארטאפ לילה פיצה',
      },
    );
  }

  /* ---- a first day, in the deck's theme: a name badge on its clip over the foot of the photograph */
  function welcome() {
    const opening = box(50, 50, 650, 690);
    const next = random(1101);
    // Dots of the theme's colours all over the card, but not under the line down its side.
    const confetti = (S) =>
      scattered(next, 84, 750, 1050, [inset(opening, -8), box(0, 150, 50, 500)], 34, 14)
        .map(([x, y]) => {
          const token = pick(next, ['primary', 'accent', 'secondary', 'bg', 'primary']);
          return S.pin(
            `<circle cx="${f(x)}" cy="${f(y)}" r="${f(4 + next() * 9)}" style="${themed('fill', token)}" fill-opacity="${token === 'bg' ? 0.9 : f(0.35 + next() * 0.6)}"/>`,
            [x, y],
          );
        })
        .join('');
    // The badge: the loop of its lanyard lies on the photograph, and goes through the slot
    // of the card.
    const loop = 'M200 142C130 92 152 9 200 9C248 9 270 92 200 142';
    const badge = art(
      'welcome-badge',
      400,
      380,
      `<clipPath id="badge-card"><rect y="126" width="400" height="254" rx="24"/></clipPath>`,
      `<path d="${loop}" fill="none" style="${themed('stroke', 'accent')}" stroke-width="18" stroke-linejoin="round"/>` +
        `<path d="${loop}" fill="none" style="${themed('stroke', 'text')}" stroke-opacity=".2" stroke-width="2" stroke-dasharray="7 6"/>` +
        `<g clip-path="url(#badge-card)"><rect y="126" width="400" height="254" style="${themed('fill', 'bg')}"/>` +
        `<rect y="126" width="400" height="88" style="${themed('fill', 'primary')}"/>` +
        `<rect y="366" width="400" height="14" style="${themed('fill', 'accent')}"/></g>` +
        `<rect x=".750" y="126.750" width="398.500" height="252.500" rx="23.300" fill="none" style="${themed('stroke', 'text')}" stroke-opacity=".22" stroke-width="1.500"/>` +
        `<rect x="166" y="136" width="68" height="14" rx="7" style="${themed('fill', 'text')}" fill-opacity=".6"/>` +
        `<path style="${themed('fill', 'accent')}" d="M186 118h28l-4 30h-20Z"/>` +
        `<rect x="183" y="112" width="34" height="13" rx="4" style="${themed('fill', 'muted')}"/>`,
    );
    return magnet(
      'magnet-welcome',
      'Welcome to the team magnet',
      'מגנט ליום הראשון בעבודה',
      [750, 1050, 22],
      {
        opening,
        round: 14,
        draw: (S) => ({
          body:
            // A tint of the theme's own colour, so that the card of the badge stands out on it.
            S.whole(
              'mask="url(#border)"',
              'fill:color-mix(in srgb, var(--color-primary) 13%, var(--color-bg))',
            ) +
            onBorder(confetti(S)) +
            S.outline(opening, 14, 5, '', { paint: `${themed('stroke', 'primary')};` }),
        }),
        extras: [
          // Down the side of the photograph, read from its foot.
          caption(
            -176,
            378,
            400,
            40,
            { text: 'היום הראשון שלי', size: 30, weight: 700, spacing: 2 },
            { text: 'MY FIRST DAY', size: 28, weight: 700, spacing: 6 },
            { color: { token: 'text' }, turn: -90 },
          ),
          label(
            badge,
            175,
            596,
            [
              caption(
                40,
                158,
                320,
                48,
                { text: 'שלום, אני', size: 34, weight: 700 },
                { text: 'HELLO, I’M', size: 30, weight: 700, spacing: 4 },
                { color: { token: 'bg' } },
              ),
              caption(
                30,
                228,
                340,
                136,
                { text: 'תמר', size: 110, weight: 800 },
                { text: 'Tamar', size: 86, weight: 800 },
                { color: { token: 'text' } },
              ),
            ],
            { turn: -5 },
          ),
        ],
      },
      {
        en: 'event work welcome new hire first day onboarding team badge name theme',
        he: 'אירוע עבודה ברוכים הבאים עובד חדש יום ראשון קליטה צוות תג שם',
      },
    );
  }

  /* ---- a conference, in the deck's theme: the pass on its strap as the right side of the card */
  function conference() {
    const opening = box(40, 40, 790, 580);
    const next = random(8080);
    const bars = () => {
      const out = [];
      for (let x = 34; x < 236;) {
        const wide = pick(next, [3, 3, 5, 8]);
        out.push(`<rect x="${x}" y="398" width="${wide}" height="50"/>`);
        x += wide + pick(next, [3, 4, 6]);
      }
      return out.join('');
    };
    const dots = Array.from({ length: 20 }, (_, i) => {
      const [col, row] = [i % 5, Math.floor(i / 5)];
      return `<circle cx="${816 + col * 22}" cy="${546 + row * 22}" r="3.600"/>`;
    }).join('');
    // The pass: a strap from the top of the card, a hook, and the card with its slot, its
    // band for the event, and a bar code at its foot.
    const pass = art(
      'conference-pass',
      270,
      500,
      `<clipPath id="pass-card"><rect y="104" width="270" height="396" rx="18"/></clipPath>`,
      `<rect x="117" y="0" width="36" height="112" style="${themed('fill', 'accent')}"/>` +
        `<path style="${themed('stroke', 'text')}" stroke-opacity=".22" stroke-width="2" d="M123 0V112M147 0V112"/>` +
        `<g clip-path="url(#pass-card)"><rect y="104" width="270" height="396" style="${themed('fill', 'bg')}"/>` +
        `<rect y="152" width="270" height="62" style="${themed('fill', 'primary')}"/>` +
        `<rect y="476" width="270" height="24" style="${themed('fill', 'accent')}"/>` +
        `<g style="${themed('fill', 'text')}">${bars()}</g></g>` +
        `<rect x="103" y="118" width="64" height="14" rx="7" style="${themed('fill', 'text')}" fill-opacity=".6"/>` +
        `<rect x="121" y="96" width="28" height="34" rx="5" fill="none" style="${themed('stroke', 'muted')}" stroke-width="5"/>` +
        `<path style="${themed('stroke', 'text')}" stroke-opacity=".16" stroke-width="1.500" d="M34 364H236"/>`,
    );
    return magnet(
      'magnet-conference',
      'Conference magnet',
      'מגנט לכנס ולמיטאפ',
      [1050, 750, 14],
      {
        opening,
        draw: (S) => ({
          body:
            S.whole('mask="url(#border)"', themed('fill', 'text')) +
            // Shapes in the colours of the theme at the foot of the pass, and a line of them
            // under the words.
            `<g mask="url(#border)">` +
            `<circle cx="100%" cy="100%" r="218" style="${themed('fill', 'primary')}"/>` +
            S.pin(
              `<circle cx="836" cy="700" r="54" fill="none" style="${themed('stroke', 'accent')}" stroke-width="16"/>` +
                `<g style="${themed('fill', 'bg')}" fill-opacity=".5">${dots}</g>`,
              [900, 650],
              { x: 'end', y: 'end' },
            ) +
            S.pin(
              `<rect x="40" y="716" width="150" height="8" style="${themed('fill', 'accent')}"/><rect x="198" y="716" width="46" height="8" style="${themed('fill', 'primary')}"/>`,
              [40, 716],
              { x: 'start', y: 'end' },
            ) +
            `</g>` +
            S.outline(opening, 0, 2, 'stroke-opacity=".3"', {
              paint: `${themed('stroke', 'bg')};`,
            }),
        }),
        extras: [
          caption(
            40,
            640,
            520,
            62,
            { text: '#כנס_המוצר', size: 48, weight: 800 },
            { text: '#ProductSummit', size: 44, weight: 800 },
            { color: { token: 'bg' }, align: 'left' },
          ),
          label(pass, 764, 0, [
            caption(
              14,
              160,
              242,
              46,
              { text: 'כנס המוצר השנתי', size: 23, weight: 700 },
              { text: 'Product Summit', size: 23, weight: 700 },
              { color: { token: 'bg' } },
            ),
            caption(
              14,
              232,
              242,
              66,
              { text: 'דנה לוי', size: 48, weight: 800 },
              { text: 'Dana Levi', size: 40, weight: 800 },
              { color: { token: 'text' } },
            ),
            caption(
              14,
              300,
              242,
              40,
              { text: 'מנהלת מוצר', size: 25, weight: 500 },
              { text: 'Product Lead', size: 24, weight: 500 },
              { color: { token: 'muted' } },
            ),
          ]),
        ],
      },
      {
        en: 'event work conference meetup summit pass badge speaker talk hashtag theme',
        he: 'אירוע עבודה כנס מיטאפ ועידה תג כניסה מרצה הרצאה האשטג',
      },
    );
  }

  /* ---- the company's birthday: navy and streamers, the years in a ring at the left, a cake under them */
  function companyBirthday() {
    const opening = box(350, 40, 660, 670);
    const next = random(1010);
    const brights = ['#ff5d73', '#2ed3c6', '#ffd166', '#ffffff', '#7aa2ff'];
    const confetti = (S) =>
      scattered(next, 70, 1050, 750, [inset(opening, -10), box(16, 26, 318, 404)], 26, 10)
        .map(([x, y]) => {
          const colour = pick(next, brights);
          const at = `transform="translate(${f(x)} ${f(y)}) rotate(${Math.round(next() * 180)})"`;
          const kind = next();
          return S.pin(
            kind < 0.4
              ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2.5 + next() * 3.5)}" fill="${colour}" fill-opacity=".9"/>`
              : kind < 0.75
                ? `<rect x="-8" y="-3" width="16" height="6" rx="2" fill="${colour}" ${at}/>`
                : `<path d="M0-7 6.500 5h-13Z" fill="${colour}" ${at}/>`,
            [x, y],
          );
        })
        .join('');
    // Streamers of gold: ribbons of paper that curl, one side lighter than the other.
    const streamer = (d) =>
      line(d, '#b98a2c', 8, ' stroke-linecap="round"') +
      line(d, '#f6d77a', 8, ' stroke-dasharray="19 15"');
    // The ring of the years: rays around a ring of gold, and a ribbon across its foot.
    const rays = around(40, 0)
      .map(([x, y], i) => {
        const [from, to] = i % 2 ? [128, 140] : [128, 148];
        // None behind the ribbon, where its end would show under the band.
        if (152 + y * to > 232) return '';
        return `M${f(150 + x * from)} ${f(152 + y * from)}L${f(150 + x * to)} ${f(152 + y * to)}`;
      })
      .join('');
    const ring = art(
      'anniversary-ring',
      300,
      388,
      `<linearGradient id="ring-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe9a8"/><stop offset=".5" stop-color="#e2b955"/><stop offset="1" stop-color="#f6dc93"/></linearGradient>` +
        `<linearGradient id="ring-band" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d9304f"/><stop offset="1" stop-color="#b81a3e"/></linearGradient>`,
      line(rays, '#f3cf6e', 3, ' stroke-linecap="round" stroke-opacity=".85"') +
        `<circle cx="150" cy="152" r="118" fill="#0d1840" fill-opacity=".55"/>` +
        `<circle cx="150" cy="152" r="118" fill="none" stroke="url(#ring-gold)" stroke-width="6"/>` +
        `<circle cx="150" cy="152" r="107" fill="none" stroke="#f3cf6e" stroke-opacity=".6" stroke-width="1.500"/>` +
        `<path fill="#8f1230" d="M0 252h54v62H0l20-31ZM300 252h-54v62h54l-20-31Z"/>` +
        `<path fill="#5e0a1f" d="M30 300h24v14ZM270 300h-24v14Z"/>` +
        `<rect x="30" y="238" width="240" height="62" rx="5" fill="url(#ring-band)"/>` +
        `<rect x="30" y="238" width="240" height="20" rx="5" fill="#ffffff" fill-opacity=".1"/>`,
    );
    return magnet(
      'magnet-company-birthday',
      'Company anniversary magnet',
      'מגנט ליום הולדת לחברה',
      [1050, 750, 24],
      {
        opening,
        round: 16,
        draw: (S) => ({
          defs:
            `<linearGradient id="navy" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#16276a"/><stop offset="1" stop-color="#0a1238"/></linearGradient>` +
            `<radialGradient id="halo" cx=".17" cy=".26" r=".42"><stop stop-color="#3d5bd0" stop-opacity=".7"/><stop offset="1" stop-color="#3d5bd0" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, 'url(#navy)') +
            onBorder(
              S.whole('fill="url(#halo)"'),
              confetti(S),
              S.pin(
                streamer('M34 462c44 30-12 78 22 116s46 50 16 100') +
                  streamer('M128 474c-28 26 20 54-6 86s-26 44 2 78') +
                  streamer('M60 750c-6-22 22-30 14-52'),
                [30, 700],
                { x: 'start', y: 'end' },
              ),
              S.pin(streamer('M960 0c24 10 38-12 60 6'), [1000, 0], { x: 'end', y: 'start' }),
              S.pin(streamer('M900 748c20-22 44 6 66-14s40-4 54-14'), [960, 740], {
                x: 'end',
                y: 'end',
              }),
            ) +
            frameLine(S, 0, 16, '#f3cf6e', 4),
        }),
        extras: [
          label(ring, 25, 34, [
            caption(
              40,
              62,
              220,
              170,
              { text: '10', font: 'Poppins', size: 140, weight: 800 },
              { text: '10', font: 'Poppins', size: 140, weight: 800 },
              { color: '#fff6dc' },
            ),
            caption(
              40,
              242,
              220,
              54,
              { text: 'שנים', font: 'Heebo', size: 44, weight: 900, spacing: 6 },
              { text: 'YEARS', font: 'Poppins', size: 40, weight: 800, spacing: 6 },
              { color: '#ffffff' },
            ),
            caption(
              4,
              334,
              292,
              46,
              { text: 'של חלומות גדולים', font: 'Heebo', size: 30, weight: 500 },
              { text: 'of dreaming big', font: 'Poppins', size: 28, weight: 500, italic: true },
              { color: '#dfe8ff' },
            ),
          ]),
          sticker(picture('work-gold-4'), 176, 500, 200),
        ],
      },
      {
        en: 'event work company birthday anniversary years decade celebration cake gold',
        he: 'אירוע עבודה חברה יום הולדת שנים עשור יובל חגיגה עוגה זהב',
      },
    );
  }

  /* ---- a family day: hills of cut paper under the sky, flags along the top, a ticket on the corner */
  function familyDay() {
    const opening = box(44, 64, 962, 506);
    // A string of flags, hung from both its ends: each flag hangs square to the string.
    const flags = ['#ef4b4b', '#ffd23f', '#3fae5a', '#ffffff', '#2f8fe0', '#ff8a3d'];
    const sag = (t) => [8 + 484 * t, 10 + 4 * 46 * t * (1 - t)];
    const pennants = Array.from({ length: 9 }, (_, i) => {
      const t = (i + 0.5) / 9;
      const [x, y] = sag(t);
      const lean = (Math.atan2(4 * 46 * (1 - 2 * t), 484) * 180) / Math.PI;
      return `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(lean)})" fill="${flags[i % flags.length]}" d="M-21-1H21L0 46Z"/>`;
    }).join('');
    const bunting = art(
      'family-bunting',
      500,
      112,
      '',
      pennants +
        line('M8 10Q250 102 492 10', '#7a5a3a', 3, ' stroke-linecap="round"') +
        `<circle cx="8" cy="10" r="6" fill="#7a5a3a"/><circle cx="492" cy="10" r="6" fill="#7a5a3a"/>`,
    );
    // The ticket: a stub and a body, bitten at the line between them and at both ends.
    const ticket = art(
      'family-ticket',
      420,
      140,
      '',
      `<path fill="#ffd23f" d="M12 0H84a10 10 0 0 0 20 0H408a12 12 0 0 1 12 12V54a16 16 0 0 0 0 32v42a12 12 0 0 1-12 12H104a10 10 0 0 0-20 0H12A12 12 0 0 1 0 128V86a16 16 0 0 0 0-32V12A12 12 0 0 1 12 0Z"/>` +
        line('M94 18V122', '#c8551f', 2.6, ' stroke-dasharray="1 9" stroke-linecap="round"') +
        `<rect x="112" y="10" width="292" height="120" rx="6" fill="none" stroke="#c8551f" stroke-width="2" stroke-opacity=".7"/>` +
        `<path d="${star(52, 70, 24)}" fill="#e2452f"/>` +
        `<circle cx="52" cy="26" r="4" fill="#e2452f"/><circle cx="52" cy="114" r="4" fill="#e2452f"/>`,
    );
    /** A hill of cut paper: its sheet, and the light along its edge. */
    const hillOf = (d, colour, edge) =>
      `<path d="${d}V750H0Z" fill="${colour}"/>` +
      line(d, edge, 3, ' vector-effect="non-scaling-stroke" stroke-opacity=".9"');
    // The sun behind the hills: a disc of paper with its rays.
    const sunRays = around(14, 0)
      .map(
        ([x, y]) =>
          `M${f(835 + x * 86)} ${f(640 + y * 86)}L${f(835 + x * 112)} ${f(640 + y * 112)}`,
      )
      .join('');
    return magnet(
      'magnet-family-day',
      'Family day magnet',
      'מגנט ליום משפחות',
      [1050, 750, 26],
      {
        opening,
        round: 18,
        draw: (S) => ({
          defs: `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#7cc8f7"/><stop offset="1" stop-color="#cdeeff"/></linearGradient>`,
          body:
            ground(S, 'url(#sky)') +
            onBorder(
              S.pin(cloud(40, 596, 0.5), [100, 620], { x: 'start', y: 'end' }),
              S.pin(cloud(560, 584, 0.42), [600, 600], { y: 'end' }),
              alongFoot(
                S,
                150,
                hillOf('M0 640C150 590 330 600 520 632S880 660 1050 612', '#a8de7e', '#c9efa5'),
              ),
              S.pin(
                line(sunRays, '#ffb800', 9, ' stroke-linecap="round"') +
                  `<circle cx="835" cy="640" r="72" fill="#ffd23f"/><circle cx="835" cy="640" r="72" fill="none" stroke="#fff3b0" stroke-width="3"/>`,
                [835, 640],
                { x: 'end', y: 'end' },
              ),
              alongFoot(
                S,
                150,
                hillOf('M0 690C200 640 380 668 560 690S860 650 1050 668', '#5fc163', '#8fdc86'),
              ),
              alongFoot(
                S,
                150,
                hillOf('M0 728C180 700 300 716 470 708S800 648 1050 640', '#1f7d3c', '#4fae62'),
              ),
            ) +
            frameLine(S, 0, 18, '#ffffff', 8),
        }),
        extras: [
          sticker(bunting, 20, 8, 500),
          sticker(bunting, 530, 8, 500, { flip: true }),
          sticker(picture('work-paper-3'), 16, 26, 184, { turn: -8 }),
          label(
            ticket,
            24,
            520,
            [
              caption(
                116,
                24,
                284,
                92,
                { text: 'יום משפחות', font: 'Karantina', size: 70, weight: 700 },
                { text: 'FAMILY DAY', font: 'Karantina', size: 66, weight: 700 },
                { color: '#1d3d6b' },
              ),
            ],
            { turn: -6 },
          ),
          caption(
            520,
            690,
            490,
            42,
            { text: 'הורים, ילדים והמון כיף', font: 'Rubik', size: 31, weight: 600 },
            { text: 'Parents, kids and loads of fun', font: 'Poppins', size: 27, weight: 600 },
            { color: '#ffffff', align: 'right' },
          ),
        ],
      },
      {
        en: 'event work family day picnic kids parents volunteering community outdoors balloons',
        he: 'אירוע עבודה יום משפחות משפחה פיקניק ילדים הורים התנדבות קהילה בלונים',
      },
    );
  }

  return [
    offsite(),
    launch(),
    toast(),
    awards(),
    retirement(),
    hackathon(),
    welcome(),
    conference(),
    companyBirthday(),
    familyDay(),
  ];
}
