/*
 * The magnets of school and of the army (`../frames-magnets.mjs`): the first day of first grade,
 * the end of kindergarten, a class photograph, a prom, a university graduation, a class reunion,
 * an enlistment party, a discharge party, the end of a course and a summer camp.
 */

/** @param kit What a magnet is drawn with (`kit.mjs`). */
export default function school(kit) {
  const { data, moved, scaled, smooth, around, random, box, f } = kit;
  const { magnet, sticker, caption, label, art, picture, tile } = kit;
  const { ground, onBorder, line, frameLine, sparkle, star } = kit;

  const rad = (degrees) => (degrees * Math.PI) / 180;
  /** A point turned by degrees clockwise around the corner of the card. */
  const spun = (x, y, turn) => [
    x * Math.cos(rad(turn)) - y * Math.sin(rad(turn)),
    x * Math.sin(rad(turn)) + y * Math.cos(rad(turn)),
  ];
  /** The corners of a box of `w` by `h` around a centre, turned by degrees clockwise. */
  const quad = (cx, cy, w, h, turn = 0) =>
    [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([x, y]) => {
      const [dx, dy] = spun(x, y, turn);
      return [cx + dx, cy + dy];
    });
  /** The box that holds points. */
  const boxOf = (points) => {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const [x, y] = [Math.min(...xs), Math.min(...ys)];
    return box(x, y, Math.max(...xs) - x, Math.max(...ys) - y);
  };
  /** Points that each keep their distance from the sides of the card they are nearer to. */
  const tied = (points, ties = { x: 'near', y: 'near' }) => points.map(([x, y]) => [x, y, ties]);
  const shifted = (points, dx, dy) => points.map(([x, y]) => [x + dx, y + dy]);
  const points = (list) => list.map(([x, y]) => `${f(x)} ${f(y)}`).join(' ');
  /**
   * A part at the foot of the card that is as wide a share of it at any size, and as tall as it
   * is drawn: `body` is drawn in the box given, which reaches the foot of the card.
   */
  const footed = (S, { x, y, w, h }, body) =>
    `<svg y="100%" overflow="visible"><svg x="${f((x / S.w) * 100)}%" y="${f(y - S.h)}" width="${f((w / S.w) * 100)}%" height="${f(h)}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="none">${body}</svg></svg>`;
  /** A blob of paint: a closed curve through points around a middle, each as far out as said. */
  const blob = (cx, cy, rx, ry, reach, turn = 0) =>
    data(moved(scaled(smooth(around(reach.length, turn, (i) => reach[i])), rx, ry), cx, cy));

  /* ---- first grade: a page of a notebook, a pencil across its corner, a name label */
  function firstGrade() {
    const opening = box(64, 58, 922, 500);
    const paper = '#fffdf6';
    // A pencil: an eraser in its ferrule, three faces of yellow, the wood and the lead.
    const pencil = art(
      'school-pencil',
      480,
      52,
      `<linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f9e1bc"/><stop offset="1" stop-color="#dfb07a"/></linearGradient>` +
        `<linearGradient id="metal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f4f6f9"/><stop offset=".45" stop-color="#c2c9d4"/><stop offset="1" stop-color="#8b94a3"/></linearGradient>` +
        `<linearGradient id="rubber" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffa9b8"/><stop offset="1" stop-color="#ee6f88"/></linearGradient>`,
      `<path fill="url(#rubber)" d="M16 3h30v46H16C7 49 1 43 1 34V18C1 9 7 3 16 3Z"/>` +
        `<rect x="42" y="1" width="42" height="50" rx="3" fill="url(#metal)"/>` +
        line('M53 2v48M63 2v48M73 2v48', '#7a8392', 2.2, ' stroke-opacity=".55"') +
        `<rect x="84" y="3" width="304" height="16" fill="#ffdc57"/>` +
        `<rect x="84" y="19" width="304" height="15" fill="#fbbe17"/>` +
        `<rect x="84" y="34" width="304" height="15" fill="#e39c00"/>` +
        `<rect x="84" y="7" width="304" height="3" fill="#ffffff" fill-opacity=".5"/>` +
        `<path fill="url(#wood)" d="M386 3 474 23.500v5L386 49Z"/>` +
        // The paint ends in three bays where the sharpener cut it.
        `<path fill="#ffdc57" d="M384 3h6q14 8 0 16h-6Z"/><path fill="#fbbe17" d="M384 19h6q16 7.500 0 15h-6Z"/><path fill="#e39c00" d="M384 34h6q14 7.500 0 15h-6Z"/>` +
        `<path fill="#3b404b" d="M446 17.200 476.500 24.300q2.500 1.700 0 3.400L446 34.800Z"/>`,
    );
    // The label of a notebook: a red rim, a dotted line inside it, two lines to write on.
    const nameTag = art(
      'school-name-tag',
      280,
      160,
      '',
      `<rect x="2" y="2" width="276" height="156" rx="18" fill="#ffffff"/>` +
        `<rect x="4" y="4" width="272" height="152" rx="16" fill="none" stroke="#e5484d" stroke-width="5"/>` +
        `<rect x="13" y="13" width="254" height="134" rx="9" fill="none" stroke="#2f6fd0" stroke-width="2" stroke-dasharray=".1 6.500" stroke-linecap="round"/>` +
        line('M34 75H246M34 133H246', '#9db6dd', 1.8, ' stroke-dasharray="3 5"'),
    );
    // What a child draws in the corner of a page, in crayon.
    const crayon = (d, colour, x, y, turn = 0) =>
      `<path d="${d}" transform="translate(${x} ${y}) rotate(${turn})" fill="none" stroke="${colour}" stroke-width="4.500" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".9"/>`;
    return magnet(
      'magnet-first-grade',
      'First grade magnet',
      'מגנט ליום הראשון בבית הספר',
      [1050, 750, 12],
      {
        opening,
        round: 4,
        draw: (S) => ({
          defs:
            `<pattern id="rules" width="40" height="44" patternUnits="userSpaceOnUse"><rect y="26" width="40" height="1.800" fill="#a9cdee"/></pattern>` +
            `<pattern id="holes" x="6" width="38" height="46" patternUnits="userSpaceOnUse"><rect x="12" y="13" width="14" height="19" rx="5" fill="#d3dbe8"/><rect x="12" y="13" width="14" height="7" rx="3.500" fill="#aab6cb"/></pattern>`,
          body:
            ground(S, paper) +
            onBorder(
              // The lines are ruled from the foot of the page, where the words stand on them.
              S.pin(
                `<rect x="0" y="-2250" width="100%" height="3000" fill="url(#rules)"/>`,
                [0, 750],
                { x: 'start', y: 'end' },
              ),
              S.box(box(0, 0, 1050, 50), 0, `fill="${paper}"`),
              S.box(box(0, 0, 1050, 46), 0, 'fill="url(#holes)"'),
              S.box(box(1016, 0, 2.2, 750), 0, 'fill="#f0808c"'),
              S.box(box(1022, 0, 1.4, 750), 0, 'fill="#f0808c" fill-opacity=".7"'),
              S.pin(
                crayon(star(0, 0, 17), '#f08c00', 60, 706, -12) +
                  crayon('M0 12C-17-1-8-14 0-5 8-14 17-1 0 12Z', '#e5484d', 128, 668, 10) +
                  crayon('M-16 0q5.300-11 10.700 0t10.600 0 10.700 0', '#2f9e44', 208, 716, -6),
                [60, 706],
                { x: 'start', y: 'end' },
              ),
            ) +
            frameLine(S, 7, 9, '#c7d2e0', 1.6) +
            frameLine(S, 0, 4, '#ffffff', 12),
        }),
        extras: [
          // The pencil has just written the words: its lead points at the end of the line.
          sticker(pencil, -20, 553, 480, { turn: 35 }),
          label(
            nameTag,
            752,
            14,
            [
              caption(
                24,
                26,
                232,
                46,
                { text: 'שם: עומר', font: 'Varela Round', size: 32 },
                { text: 'Name: Omer', font: 'Varela Round', size: 31 },
                { color: '#1d3f96' },
              ),
              caption(
                24,
                84,
                232,
                46,
                { text: 'כיתה: א׳2', font: 'Varela Round', size: 32 },
                { text: 'Class: 1B', font: 'Varela Round', size: 31 },
                { color: '#1d3f96' },
              ),
            ],
            { turn: 5 },
          ),
          caption(
            430,
            618,
            580,
            86,
            { text: 'שלום כיתה א׳!', font: 'Rubik', size: 74, weight: 800 },
            { text: 'Hello, First Grade!', font: 'Rubik', size: 54, weight: 800 },
            {
              color: '#1971c2',
              colors: ['#e03131', '#d9480f', '#2b8a3e', '#1971c2', '#6741d9', '#c2255c'],
              align: 'right',
            },
          ),
          caption(
            430,
            702,
            580,
            38,
            { text: 'היום הראשון שלי בבית הספר', font: 'Heebo', size: 27, weight: 500 },
            { text: 'My very first day of school', font: 'DM Sans', size: 26, weight: 500 },
            { color: '#5b6b82', align: 'right' },
          ),
        ],
      },
      {
        en: 'event school first grade first day september pencil notebook kids',
        he: 'אירוע בית ספר כיתה א ראשון בספטמבר שנה חדשה מחברת עיפרון ילדים שלום',
      },
    );
  }

  /* ---- the end of kindergarten: a print that a bunch of balloons lifts, clouds behind it */
  function ganEnd() {
    const turn = -2;
    const print = quad(440, 436, 780, 500, turn);
    // The photograph in the print: a rim at the sides and above, and a wider foot for a line.
    const [ox, oy] = spun(0, -21, turn);
    const pane = quad(440 + ox, 436 + oy, 716, 394, turn);
    const opening = boxOf(pane);
    /** A cloud of circles on a flat foot, with a rim of sky blue that is wider below. */
    const cloudy = (name, w, h, foot, puffs) => {
      const shape = (attrs) =>
        `<g ${attrs}><rect x="${foot[0]}" y="${foot[1]}" width="${foot[2]}" height="${foot[3]}" rx="${foot[3] / 2}"/>` +
        puffs.map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`).join('') +
        `</g>`;
      return art(
        name,
        w,
        h,
        '',
        shape(
          'fill="#bfdcf3" stroke="#bfdcf3" stroke-width="9" stroke-linejoin="round" transform="translate(0 3)"',
        ) + shape('fill="#ffffff"'),
      );
    };
    const cloud = cloudy(
      'school-cloud',
      250,
      136,
      [14, 64, 222, 60],
      [
        [78, 68, 42],
        [138, 58, 50],
        [190, 80, 36],
      ],
    );
    const plate = cloudy(
      'school-cloud-plate',
      320,
      210,
      [14, 102, 292, 94],
      [
        [92, 102, 60],
        [175, 82, 73],
        [247, 119, 53],
      ],
    );
    // A sun in poster paint, which comes up behind the card.
    const rays = Array.from({ length: 14 }, (_, i) => {
      const [c, s] = [Math.cos(rad((i * 360) / 14)), Math.sin(rad((i * 360) / 14))];
      return `M${f(140 + 104 * c)} ${f(140 + 104 * s)}L${f(140 + 128 * c)} ${f(140 + 128 * s)}`;
    }).join('');
    const sun = art(
      'school-paint-sun',
      280,
      280,
      '',
      line(rays, '#ffb703', 15, ' stroke-linecap="round"') +
        `<circle cx="140" cy="140" r="88" fill="#ffd43b"/>` +
        `<path fill="#ffe680" d="${blob(122, 118, 50, 44, [1, 0.9, 1.05, 0.92, 1, 0.88], 20)}"/>`,
    );
    // The card stands lower than its box: the sun, a cloud and the balloons rise over its edge.
    const sky = box(12, 104, 1026, 634);
    const next = random(613);
    const specks = Array.from({ length: 22 }, () => {
      const [x, y] = [860 + next() * 160, 330 + next() * 250];
      const colour = ['#ffffff', '#ffe27a', '#ff9eb5', '#ffffff'][Math.floor(next() * 4)];
      return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(3 + next() * 5)}" fill="${colour}" fill-opacity=".85"/>`;
    }).join('');
    return magnet(
      'magnet-gan-end',
      'End of kindergarten magnet',
      'מגנט למסיבת סיום גן',
      [1050, 750, 0],
      {
        opening,
        window: (S) => S.shape(tied(pane), 'fill="#000"'),
        card: (S) => S.box(sky, 46, 'fill="#fff"'),
        draw: (S) => ({
          defs: `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6ec6f3"/><stop offset="1" stop-color="#bfe8fb"/></linearGradient>`,
          body:
            ground(S, 'url(#sky)') +
            onBorder(
              // Paint laid on thick: lighter sky, a blot of yellow, a blot of pink.
              S.pin(
                `<path fill="#ffffff" fill-opacity=".3" d="${blob(190, 220, 260, 150, [1, 0.86, 1.05, 0.9, 1.04, 0.88, 1, 0.9], 12)}"/>`,
                [190, 220],
                { x: 'start', y: 'start' },
              ),
              S.pin(
                `<path fill="#ffe27a" d="${blob(962, 676, 150, 104, [1, 0.88, 1.05, 0.9, 1.04, 0.9, 1, 0.86], 30)}"/>` +
                  `<path fill="#fff3b8" d="${blob(940, 664, 76, 46, [1, 0.9, 1.06, 0.9, 1, 0.9], 10)}"/>`,
                [962, 676],
                { x: 'end', y: 'end' },
              ),
              S.pin(
                `<path fill="#ff9eb5" fill-opacity=".9" d="${blob(40, 560, 90, 150, [1, 0.9, 1.05, 0.88, 1.04, 0.92, 1, 0.9], 30)}"/>`,
                [40, 560],
                { x: 'start', y: 'end' },
              ),
              S.pin(kit.cloud(846, 470, 0.78) + specks, [940, 500], { x: 'end', y: 'mid' }),
              S.shape(tied(shifted(print, 4, 7)), 'fill="#1b5f8f" fill-opacity=".18"'),
              S.shape(tied(print), 'fill="#ffffff"'),
            ),
        }),
        extras: [
          sticker(sun, 26, 4, 280, { under: true }),
          sticker(cloud, 420, 34, 250, { under: true }),
          // The knot of the balloons lies on the rim of the print, by its upper corner.
          sticker(picture('school-kit-1'), 735, 32, 240, { turn: 16 }),
          label(
            plate,
            18,
            528,
            [
              caption(
                62,
                50,
                196,
                44,
                { text: 'עולים', font: 'Varela Round', size: 34 },
                { text: 'Off to', font: 'Varela Round', size: 34 },
                { color: '#1c64b8' },
              ),
              caption(
                22,
                100,
                276,
                64,
                { text: 'לכיתה א׳!', font: 'Varela Round', size: 46 },
                { text: 'First Grade!', font: 'Varela Round', size: 40 },
                {
                  color: '#c2410c',
                  colors: ['#d6282f', '#c2410c', '#23803a', '#1971c2', '#6741d9', '#c2255c'],
                },
              ),
            ],
            { turn: -4 },
          ),
          caption(
            384,
            624,
            440,
            40,
            { text: 'גן רימון · מסיבת סיום', font: 'Varela Round', size: 28 },
            { text: 'Rimon Kindergarten · Class Party', font: 'Varela Round', size: 23 },
            { color: '#2f62a8', turn },
          ),
        ],
      },
      {
        en: 'event kindergarten preschool end of year party balloons clouds kids graduation',
        he: 'אירוע גן ילדים מסיבת סיום סוף שנה עולים לכיתה א בלונים עננים גננת',
      },
    );
  }

  /* ---- a class photograph: a print pinned to a cork board, notes and tape around it */
  function classPhoto() {
    const print = quad(424, 366, 736, 536, -1.5);
    const pane = quad(424, 366, 688, 488, -1.5);
    const opening = boxOf(pane);
    // A sticky note: its foot curls up at one corner.
    const note = (name, light, deep, fold) =>
      art(
        name,
        210,
        210,
        `<linearGradient id="sheet" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${deep}"/></linearGradient>`,
        `<path fill="url(#sheet)" d="M0 0H210V172L172 210H0Z"/>` +
          `<rect width="210" height="30" fill="#000000" fill-opacity=".05"/>` +
          `<path fill="${fold}" d="M210 172 172 210 178 178Z"/>`,
      );
    const yellow = note('school-note-yellow', '#fff3a3', '#ffe45c', '#e6c532');
    const pink = note('school-note-pink', '#ffc9de', '#ff9cc2', '#e07aa3');
    // A push-pin seen from above: its foot, its head, a light on it.
    const pin = (name, light, deep) =>
      art(
        name,
        64,
        64,
        `<radialGradient id="foot" cx=".4" cy=".35" r=".7"><stop stop-color="${light}"/><stop offset="1" stop-color="${deep}"/></radialGradient>` +
          `<radialGradient id="head" cx=".35" cy=".3" r=".75"><stop stop-color="#ffffff" stop-opacity=".55"/><stop offset=".5" stop-color="${light}"/><stop offset="1" stop-color="${deep}"/></radialGradient>`,
        `<ellipse cx="36" cy="40" rx="21" ry="19" fill="#2a1505" fill-opacity=".3"/>` +
          `<circle cx="30" cy="30" r="22" fill="url(#foot)"/>` +
          `<circle cx="30" cy="30" r="22" fill="none" stroke="${deep}" stroke-width="1.500"/>` +
          `<circle cx="28" cy="27" r="13.500" fill="url(#head)"/>` +
          `<ellipse cx="23.500" cy="21.500" rx="5" ry="3" fill="#ffffff" fill-opacity=".8" transform="rotate(-35 23.500 21.500)"/>`,
      );
    const redPin = pin('school-pin-red', '#ff6b6b', '#c92a2a');
    const bluePin = pin('school-pin-blue', '#5aa9ff', '#1c5fc4');
    // A strip of washi tape: thin paper with stripes, torn at both ends.
    const washi = art(
      'school-washi',
      190,
      46,
      `<pattern id="stripes" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="16" fill="#ffffff" fill-opacity=".55"/></pattern>` +
        `<clipPath id="strip"><path d="M5 0H185l5 6-5 6 5 6-5 5 5 6-5 6 5 6-5 5H5l-5-5 5-6-5-6 5-6-5-5 5-6-5-6Z"/></clipPath>`,
      `<g clip-path="url(#strip)"><rect width="190" height="46" fill="#38c6ad" fill-opacity=".88"/><rect width="190" height="46" fill="url(#stripes)"/></g>`,
    );
    // Masking tape with the name of the school written on it in marker.
    const tape = art(
      'school-masking-tape',
      430,
      66,
      `<linearGradient id="crepe" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f6ebc8"/><stop offset="1" stop-color="#ead9a6"/></linearGradient>`,
      `<path fill="url(#crepe)" fill-opacity=".96" d="M6 0H424l6 8-5 8 5 9-6 8 6 8-5 9 5 8-6 8H6l-6-8 5-8-5-9 6-8-6-8 5-9-5-8Z"/>` +
        line('M60 0v66M150 0v66M236 0v66M330 0v66M392 0v66', '#c9b579', 1, ' stroke-opacity=".35"'),
    );
    // A paper clip of steel wire.
    const clip = art(
      'school-paper-clip',
      44,
      112,
      `<linearGradient id="wire" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#e9edf2"/><stop offset=".5" stop-color="#9aa4b2"/><stop offset="1" stop-color="#cfd6de"/></linearGradient>`,
      line(
        'M31 34V84a12 12 0 0 1-24 0V22a17 17 0 0 1 34 0V90',
        'url(#wire)',
        5,
        ' stroke-linecap="round"',
      ) +
        line(
          'M31 34V84a12 12 0 0 1-24 0V22',
          '#ffffff',
          1.2,
          ' stroke-opacity=".6" stroke-linecap="round"',
        ),
    );
    return magnet(
      'magnet-class-photo',
      'Class photo magnet',
      'מגנט לתמונה כיתתית',
      [1050, 750, 14],
      {
        opening,
        window: (S) => S.shape(tied(pane), 'fill="#000"'),
        draw: (S) => ({
          defs:
            tile('cork', 'school-cork', 300) +
            `<radialGradient id="lit" cx=".4" cy=".35" r=".85"><stop offset=".45" stop-color="#3b1d04" stop-opacity="0"/><stop offset="1" stop-color="#3b1d04" stop-opacity=".34"/></radialGradient>`,
          body:
            ground(S, 'url(#cork)') +
            onBorder(
              S.whole('fill="url(#lit)"'),
              // The shadow of the print on the cork: two steps of it, none of it on the photograph.
              S.shape(tied(shifted(print, 3, 5)), 'fill="#2a1505" fill-opacity=".2"'),
              S.shape(tied(shifted(print, 6, 9)), 'fill="#2a1505" fill-opacity=".16"'),
              S.shape(tied(print), 'fill="#fdfcf8"'),
            ) +
            S.outline(box(4, 4, 1042, 742), 11, 8, 'stroke="#6b4423" stroke-opacity=".5"'),
        }),
        extras: [
          sticker(washi, 112, 78, 190, { turn: -9 }),
          label(
            yellow,
            812,
            78,
            [
              caption(
                8,
                54,
                194,
                62,
                { text: 'כיתה ד׳3', font: 'Secular One', size: 44 },
                { text: 'Class 4C', font: 'Secular One', size: 42 },
                { color: '#27324d' },
              ),
              caption(
                8,
                120,
                194,
                36,
                { text: 'עם המורה רונית', font: 'Rubik', size: 23, weight: 500 },
                { text: 'with Ms. Ronit', font: 'Rubik', size: 23, weight: 500 },
                { color: '#4a5676' },
              ),
            ],
            { turn: 5 },
          ),
          label(
            pink,
            772,
            474,
            [
              caption(
                8,
                64,
                194,
                64,
                { text: 'היה כיף!', font: 'Secular One', size: 46 },
                { text: 'So fun!', font: 'Secular One', size: 48 },
                { color: '#7a1846' },
              ),
            ],
            { turn: -6 },
          ),
          sticker(clip, 800, 458, 36, { turn: 14 }),
          sticker(redPin, 738, 86, 54),
          sticker(bluePin, 74, 600, 54),
          label(
            tape,
            120,
            648,
            [
              caption(
                30,
                10,
                370,
                46,
                { text: 'בית הספר אלונים', font: 'Rubik', size: 34, weight: 700 },
                { text: 'Alonim Elementary', font: 'Rubik', size: 32, weight: 700 },
                { color: '#4b3a22' },
              ),
            ],
            { turn: -2 },
          ),
        ],
      },
      {
        en: 'event school class photo end of year cork board notes teacher',
        he: 'אירוע בית ספר כיתה תמונה כיתתית סוף שנה לוח שעם פתקים מורה מחנכת',
      },
    );
  }

  /* ---- a prom: black and gold, a window with stepped corners, a sign with lamps */
  function prom() {
    const [x0, y0, x1, y1, step] = [66, 100, 684, 800, 28];
    const opening = box(x0, y0, x1 - x0, y1 - y0);
    /** The window with two steps cut into each corner, `by` larger all around. */
    const stepped = (by) => {
      const [l, t, r, b] = [x0 - by, y0 - by, x1 + by, y1 + by];
      const s = step;
      return tied([
        [l, t + 2 * s],
        [l + s, t + 2 * s],
        [l + s, t + s],
        [l + 2 * s, t + s],
        [l + 2 * s, t],
        [r - 2 * s, t],
        [r - 2 * s, t + s],
        [r - s, t + s],
        [r - s, t + 2 * s],
        [r, t + 2 * s],
        [r, b - 2 * s],
        [r - s, b - 2 * s],
        [r - s, b - s],
        [r - 2 * s, b - s],
        [r - 2 * s, b],
        [l + 2 * s, b],
        [l + 2 * s, b - s],
        [l + s, b - s],
        [l + s, b - 2 * s],
        [l, b - 2 * s],
      ]);
    };
    // A fan of light from the foot of the card: wedges of a lighter black, a line of gold on each.
    const fan = Array.from({ length: 13 }, (_, i) => {
      const [from, to] = [-84 + i * 14, -84 + i * 14 + 7].map((turn) => spun(0, -1900, turn));
      return (
        `<path fill="#1d1c22" d="M375 1050 ${f(375 + from[0])} ${f(1050 + from[1])} ${f(375 + to[0])} ${f(1050 + to[1])}Z"/>` +
        line(
          `M375 1050 ${f(375 + from[0])} ${f(1050 + from[1])}`,
          '#d9b45a',
          1.2,
          ' stroke-opacity=".5"',
        )
      );
    }).join('');
    const crest =
      `<path d="M375 26 391 48 375 70 359 48Z" fill="url(#gold)"/>` +
      line(
        'M232 48H343M407 48H518M262 38H337M413 38H488M262 58H337M413 58H488',
        '#d9b45a',
        1.8,
        ' stroke-linecap="round"',
      );
    const foot =
      `<path d="M375 1000l9 12-9 12-9-12Z" fill="url(#gold)"/>` +
      `<path d="M345 1006l5 6-5 6-5-6ZM405 1006l5 6-5 6-5-6Z" fill="#d9b45a"/>` +
      line('M200 1012H326M424 1012H550', '#d9b45a', 1.4, ' stroke-linecap="round"');
    // The sign of a theatre: a black board in a rim of gold, a row of lamps all around it.
    const lamps = [
      ...Array.from({ length: 18 }, (_, i) => [42 + i * 29.8, 17]),
      ...Array.from({ length: 18 }, (_, i) => [42 + i * 29.8, 167]),
      ...Array.from({ length: 4 }, (_, i) => [17, 47 + i * 30]),
      ...Array.from({ length: 4 }, (_, i) => [573, 47 + i * 30]),
    ]
      .map(
        ([x, y]) =>
          `<circle cx="${f(x)}" cy="${y}" r="10" fill="#ffcf70" fill-opacity=".22"/><circle cx="${f(x)}" cy="${y}" r="5.600" fill="url(#lamp)"/>`,
      )
      .join('');
    const sign = art(
      'school-marquee',
      590,
      184,
      `<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7e3a1"/><stop offset=".5" stop-color="#c9992e"/><stop offset="1" stop-color="#f1d98c"/></linearGradient>` +
        `<radialGradient id="lamp" cx=".4" cy=".35" r=".7"><stop stop-color="#fffdf2"/><stop offset=".6" stop-color="#ffe29a"/><stop offset="1" stop-color="#f0a92e"/></radialGradient>` +
        `<linearGradient id="board" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1c1a20"/><stop offset="1" stop-color="#0c0b0f"/></linearGradient>`,
      `<rect x="3" y="3" width="584" height="178" rx="24" fill="#0a090c"/>` +
        `<rect x="3" y="3" width="584" height="178" rx="24" fill="none" stroke="url(#rim)" stroke-width="5"/>` +
        `<rect x="32" y="32" width="526" height="120" rx="9" fill="url(#board)"/>` +
        `<rect x="32" y="32" width="526" height="120" rx="9" fill="none" stroke="url(#rim)" stroke-width="2"/>` +
        lamps,
    );
    const sparks = art(
      'school-gold-sparks',
      120,
      120,
      `<linearGradient id="spark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff3c4"/><stop offset=".5" stop-color="#e2b955"/><stop offset="1" stop-color="#f6dc93"/></linearGradient>`,
      `<path d="${sparkle(48, 54, 44, 0.16)}" fill="url(#spark)"/>` +
        `<path d="${sparkle(96, 26, 20, 0.18)}" fill="url(#spark)"/>` +
        `<path d="${sparkle(92, 98, 14, 0.2)}" fill="#f6dc93"/>`,
    );
    return magnet(
      'magnet-prom',
      'Prom magnet',
      'מגנט לנשף סיום',
      [750, 1050, 18],
      {
        opening,
        window: (S) => S.shape(stepped(-1), 'fill="#000"'),
        draw: (S) => ({
          defs:
            tile('glitter', 'school-glitter', 210) +
            `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#17161b"/><stop offset="1" stop-color="#09090c"/></linearGradient>` +
            `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7e3a1"/><stop offset=".5" stop-color="#c9992e"/><stop offset="1" stop-color="#f1d98c"/></linearGradient>` +
            // Two rims around the window, each the window a little larger less a smaller one.
            S.mask(
              'band',
              S.shape(stepped(14), 'fill="#fff"'),
              S.shape(stepped(3), 'fill="#000"'),
            ) +
            S.mask(
              'hair',
              S.shape(stepped(22), 'fill="#fff"'),
              S.shape(stepped(20), 'fill="#000"'),
            ),
          body:
            ground(S, 'url(#night)') +
            onBorder(
              S.pin(fan, [375, 1050], { x: 'mid', y: 'end' }),
              S.pin(crest, [375, 48], { x: 'mid', y: 'start' }),
              S.pin(foot, [375, 1012], { x: 'mid', y: 'end' }),
            ) +
            S.outline(box(13, 13, 724, 1024), 8, 2, 'stroke="url(#gold)"') +
            S.whole('fill="url(#glitter)" mask="url(#band)"') +
            S.whole('fill="#e7c873" mask="url(#hair)"'),
        }),
        extras: [
          sticker(sparks, 574, 62, 112, { turn: 8 }),
          // The sign stands on the foot of the photograph, half on it and half on the card.
          label(sign, 80, 722, [
            caption(
              40,
              34,
              510,
              116,
              { text: 'נשף י״ב', font: 'Karantina', size: 98, weight: 700, spacing: 3 },
              { text: 'PROM NIGHT', font: 'Karantina', size: 98, weight: 700, spacing: 4 },
              { color: '#f6dc93' },
            ),
          ]),
          caption(
            50,
            922,
            650,
            48,
            { text: 'תיכון אורנים · מחזור נ״ב', font: 'Heebo', size: 31, weight: 500, spacing: 3 },
            { text: 'ORANIM HIGH SCHOOL', font: 'Montserrat', size: 28, weight: 600, spacing: 7 },
            { color: '#ecd48b' },
          ),
        ],
      },
      {
        en: 'event prom high school ball seniors gold black gala dance night',
        he: 'אירוע נשף סיום תיכון יב שכבה זהב שחור גאלה ריקודים ערב',
      },
    );
  }

  /* ---- a university graduation: a navy column with a line down it, a seal, the name below */
  function degree() {
    const opening = box(178, 34, 838, 516);
    const [navy, cream, gilt] = ['#14244d', '#f7f0dd', '#b8923c'];
    // The seal of a diploma: beads around a disc of gold, two tails of ribbon below it.
    const seal = art(
      'school-seal',
      190,
      250,
      `<radialGradient id="disc" cx=".38" cy=".32" r=".8"><stop stop-color="#fbeab0"/><stop offset=".55" stop-color="#e2b955"/><stop offset="1" stop-color="#b98a2a"/></radialGradient>` +
        `<linearGradient id="tail" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#1d3470"/><stop offset=".5" stop-color="#14244d"/><stop offset="1" stop-color="#1d3470"/></linearGradient>`,
      `<path fill="url(#tail)" d="M52 130h46l-8 116-25-22-27 20Z"/><path fill="url(#tail)" d="M92 130h46l14 114-27-20-25 22Z"/>` +
        line('M60 134 48 232M130 134l12 98', '#e2b955', 2, ' stroke-opacity=".8"') +
        `<circle cx="95" cy="92" r="85" fill="none" stroke="#c9992e" stroke-width="11" stroke-dasharray="0 14.830" stroke-linecap="round"/>` +
        `<circle cx="95" cy="92" r="84" fill="url(#disc)"/>` +
        `<circle cx="95" cy="92" r="72" fill="none" stroke="#9a7420" stroke-width="1.600"/>` +
        `<circle cx="95" cy="92" r="67" fill="none" stroke="#fff6d2" stroke-opacity=".8" stroke-width="1.200" stroke-dasharray="1.500 5"/>` +
        `<path d="${star(95, 52, 11)}" fill="${navy}"/>` +
        `<path d="${sparkle(64, 132, 6, 0.3)}${sparkle(95, 138, 8, 0.3)}${sparkle(126, 132, 6, 0.3)}" fill="${navy}"/>`,
    );
    return magnet(
      'magnet-degree',
      'University graduation magnet',
      'מגנט לטקס סיום תואר',
      [1050, 750, 10],
      {
        opening,
        draw: (S) => ({
          defs:
            // The fine net of a diploma's paper.
            `<pattern id="net" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M0 11H22M11 0V22" fill="none" stroke="${gilt}" stroke-width=".7" stroke-opacity=".28"/></pattern>` +
            `<linearGradient id="column" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#0f1c3f"/><stop offset=".5" stop-color="#1a2f63"/><stop offset="1" stop-color="#0f1c3f"/></linearGradient>` +
            `<pattern id="pins" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="7" cy="7" r=".9" fill="#e2b955" fill-opacity=".35"/></pattern>`,
          body:
            ground(S, cream) +
            onBorder(
              S.whole('fill="url(#net)"'),
              S.box(box(0, 0, 150, 750), 0, 'fill="url(#column)"'),
              S.box(box(0, 0, 150, 750), 0, 'fill="url(#pins)"'),
              S.box(box(150, 0, 5, 750), 0, 'fill="#c9992e"'),
            ) +
            S.outline(box(12, 12, 126, 726), 4, 1.4, 'stroke="#e2b955" stroke-opacity=".7"') +
            S.outline(box(166, 12, 872, 726), 4, 1.6, `stroke="${gilt}"`) +
            S.outline(
              box(172, 18, 860, 714),
              2,
              1,
              `stroke="${gilt}" stroke-opacity=".7" stroke-dasharray="1 4"`,
            ) +
            frameLine(S, 5, 0, gilt, 1.4) +
            frameLine(S, 0, 0, navy, 3) +
            // A rule of gold over the name, with a jewel at its end.
            S.pin(
              line('M560 588H806', gilt, 1.6, ' stroke-linecap="round"') +
                `<path d="${sparkle(820, 588, 9, 0.3)}" fill="${gilt}"/>`,
              [820, 588],
              { x: 'end', y: 'end' },
            ) +
            // The mark of the school, pressed faintly into the foot of the paper.
            S.pin(
              `<g fill="none" stroke="${gilt}" stroke-opacity=".45"><circle cx="262" cy="652" r="62" stroke-width="1.600"/><circle cx="262" cy="652" r="55" stroke-width=".8"/>` +
                `<circle cx="262" cy="652" r="44" stroke-width="1.400" stroke-dasharray=".1 6" stroke-linecap="round"/></g>` +
                `<path d="${star(262, 652, 24)}" fill="${gilt}" fill-opacity=".3"/>` +
                `<path d="${sparkle(262, 602, 4, 0.3)}${sparkle(262, 702, 4, 0.3)}${sparkle(212, 652, 4, 0.3)}${sparkle(312, 652, 4, 0.3)}" fill="${gilt}" fill-opacity=".5"/>`,
              [262, 652],
              { x: 'start', y: 'end' },
            ) +
            S.pin(
              `<path d="${sparkle(75, 690, 12, 0.3)}" fill="#e2b955"/>` +
                `<path d="${sparkle(48, 690, 5, 0.3)}${sparkle(102, 690, 5, 0.3)}" fill="#e2b955" fill-opacity=".8"/>`,
              [75, 690],
              { x: 'start', y: 'end' },
            ),
        }),
        extras: [
          sticker(picture('school-kit-4'), 6, 26, 196),
          caption(
            -145,
            400,
            440,
            50,
            {
              text: 'טקס הענקת תארים',
              font: 'Frank Ruhl Libre',
              size: 36,
              weight: 500,
              spacing: 4,
            },
            { text: 'COMMENCEMENT', font: 'Montserrat', size: 27, weight: 600, spacing: 9 },
            { color: '#f1dfa8', turn: -90 },
          ),
          sticker('graduation-cap', 878, 22, 150, { turn: 18 }),
          caption(
            250,
            598,
            580,
            84,
            { text: 'שירה אלון', font: 'Frank Ruhl Libre', size: 68, weight: 700 },
            { text: 'Shira Alon', font: 'Playfair Display', size: 62, weight: 700 },
            { color: navy, align: 'right' },
          ),
          caption(
            250,
            684,
            580,
            40,
            { text: 'בוגרת תואר ראשון במדעי המחשב', font: 'Heebo', size: 27, weight: 500 },
            {
              text: 'B.Sc. in Computer Science',
              font: 'Montserrat',
              size: 24,
              weight: 600,
              spacing: 2,
            },
            { color: '#7a5d1c', align: 'right' },
          ),
          // The seal hangs on the corner of the photograph, at the end of the name.
          label(
            seal,
            842,
            438,
            [
              caption(
                14,
                70,
                162,
                44,
                { text: 'בהצטיינות', font: 'Frank Ruhl Libre', size: 28, weight: 700 },
                {
                  text: 'Cum Laude',
                  font: 'Playfair Display',
                  size: 26,
                  weight: 700,
                  italic: true,
                },
                { color: navy },
              ),
            ],
            { turn: 8 },
          ),
        ],
      },
      {
        en: 'event university college graduation degree diploma ceremony academic cap',
        he: 'אירוע אוניברסיטה מכללה טקס סיום תואר בוגרים דיפלומה תעודה אקדמיה סטודנט',
      },
    );
  }

  /* ---- a class reunion: a page of the yearbook, a tilted print in photo corners, a stamp */
  function reunion() {
    const print = quad(548, 322, 786, 506, 2);
    const pane = quad(548, 322, 754, 474, 2);
    const opening = boxOf(pane);
    const [mustard, teal, brick, ink] = ['#e0a526', '#1f7a7a', '#a8391f', '#23292e'];
    // The four corners that hold the print: a triangle over each of its corners.
    const corners = (S) =>
      print
        .map((corner, i) => {
          const towards = ([x, y], length) => {
            const [dx, dy] = [x - corner[0], y - corner[1]];
            const far = Math.hypot(dx, dy);
            return [(dx / far) * length, (dy / far) * length];
          };
          const [a, b] = [towards(print[(i + 3) % 4], 1), towards(print[(i + 1) % 4], 1)];
          const tip = [corner[0] - (a[0] + b[0]) * 5, corner[1] - (a[1] + b[1]) * 5];
          const mount = [
            tip,
            [tip[0] + a[0] * 62, tip[1] + a[1] * 62],
            [tip[0] + b[0] * 62, tip[1] + b[1] * 62],
          ];
          const inner = [
            [tip[0] + (a[0] + b[0]) * 9, tip[1] + (a[1] + b[1]) * 9],
            [tip[0] + a[0] * 40 + b[0] * 9, tip[1] + a[1] * 40 + b[1] * 9],
            [tip[0] + b[0] * 40 + a[0] * 9, tip[1] + b[1] * 40 + a[1] * 9],
          ];
          return S.shape(tied(mount), `fill="${ink}"`) + S.shape(tied(inner), 'fill="#39434a"');
        })
        .join('');
    // A felt pennant on its tape: the hoist at the left, the point at the right.
    const pennant = art(
      'school-pennant',
      440,
      176,
      `<linearGradient id="felt" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#c9502f"/><stop offset="1" stop-color="#a73a22"/></linearGradient>`,
      `<path fill="url(#felt)" d="M14 4 436 88 14 172Z"/>` +
        `<path fill="none" stroke="#f6e3b0" stroke-width="2" stroke-dasharray="7 5" d="M48 22 388 88 48 154Z"/>` +
        `<rect x="2" y="2" width="34" height="172" rx="3" fill="${mustard}"/>` +
        line('M19 14v148', '#fff3cf', 1.6, ' stroke-dasharray="5 5" stroke-opacity=".8"'),
    );
    // A round rubber stamp: two rings of ink that did not take everywhere.
    const stamp = art(
      'school-stamp',
      190,
      190,
      `<mask id="worn"><rect width="190" height="190" fill="#fff"/>` +
        line(
          'M17 55 83 26M26 130l52 22M112 169l55-34M130 19l40 35M60 28l14-5M150 150l12 6',
          '#000',
          2.6,
          ' stroke-linecap="round"',
        ) +
        `<circle cx="50" cy="150" r="2.600"/><circle cx="147" cy="130" r="3.500"/><circle cx="102" cy="35" r="2.200"/><circle cx="83" cy="162" r="2.600"/></mask>`,
      `<g mask="url(#worn)" fill="none" stroke="${brick}">` +
        `<circle cx="95" cy="95" r="89" stroke-width="6"/>` +
        `<circle cx="95" cy="95" r="79.500" stroke-width="1.800"/>` +
        `<path d="M22 64.500H168M22 125.500H168" stroke-width="1.800"/>` +
        `<g fill="${brick}" stroke="none"><path d="${star(95, 40, 11)}"/><path d="${star(62, 46, 6)}${star(128, 46, 6)}"/><path d="${star(95, 150, 11)}"/><path d="${star(62, 144, 6)}${star(128, 144, 6)}"/></g>` +
        `</g>`,
    );
    return magnet(
      'magnet-reunion',
      'Class reunion magnet',
      'מגנט לפגישת מחזור',
      [1050, 750, 8],
      {
        opening,
        window: (S) => S.shape(tied(pane), 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<pattern id="grain" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(28)"><circle cx="4.500" cy="4.500" r="1" fill="#c9b47c" fill-opacity=".45"/></pattern>` +
            `<radialGradient id="aged" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#b68a3c" stop-opacity="0"/><stop offset="1" stop-color="#b68a3c" stop-opacity=".3"/></radialGradient>`,
          body:
            ground(S, '#f3e7c6') +
            onBorder(
              S.whole('fill="url(#grain)"'),
              S.whole('fill="url(#aged)"'),
              // The rings of the seventies come in from the upper corner.
              S.pin(
                [
                  [262, teal],
                  [222, mustard],
                  [182, brick],
                ]
                  .map(
                    ([r, colour]) =>
                      `<circle cx="1050" cy="0" r="${r}" fill="none" stroke="${colour}" stroke-width="27"/>`,
                  )
                  .join(''),
                [1050, 0],
                { x: 'end', y: 'start' },
              ),
              S.box(box(30, 0, 22, 750), 0, `fill="${mustard}"`),
              S.box(box(58, 0, 5, 750), 0, `fill="${teal}"`),
              S.shape(tied(shifted(print, 4, 6)), 'fill="#5a431c" fill-opacity=".22"'),
              S.shape(tied(print), 'fill="#fffdf6"'),
            ) +
            corners(S),
        }),
        extras: [
          label(
            pennant,
            20,
            28,
            [
              caption(
                50,
                50,
                270,
                76,
                { text: 'מחזור ל״ה', font: 'Suez One', size: 46 },
                { text: 'CLASS 35', font: 'Suez One', size: 44 },
                { color: '#fff3cf' },
              ),
            ],
            { turn: -7 },
          ),
          caption(
            92,
            628,
            640,
            62,
            { text: '20 שנה אחרי', font: 'David Libre', size: 52, weight: 700 },
            { text: '20 YEARS LATER', font: 'JetBrains Mono', size: 42, weight: 700 },
            { color: ink, align: 'left' },
          ),
          caption(
            92,
            692,
            640,
            38,
            { text: 'נפגשים שוב, כאילו לא עבר יום', font: 'David Libre', size: 28, weight: 500 },
            {
              text: 'Together again, like no time has passed',
              font: 'JetBrains Mono',
              size: 21,
              weight: 500,
            },
            { color: '#6b5a33', align: 'left' },
          ),
          // The stamp is on the paper: only its ring runs over the corner of the print.
          label(
            stamp,
            705,
            539,
            [
              caption(
                20,
                68,
                150,
                54,
                { text: 'אז והיום', font: 'Karantina', size: 46, weight: 700 },
                { text: 'THEN & NOW', font: 'Karantina', size: 34, weight: 700 },
                { color: brick },
              ),
            ],
            { turn: -13 },
          ),
        ],
      },
      {
        en: 'event class reunion alumni yearbook high school retro then and now',
        he: 'אירוע פגישת מחזור כנס בוגרים ספר מחזור תיכון רטרו אז והיום',
      },
    );
  }

  /* ---- an enlistment party: camouflage, dog tags over a corner, a sash across another */
  function enlistment() {
    const opening = box(36, 36, 978, 562);
    /** A dog tag: a plate with round ends and a hole for the chain. */
    const plateOf =
      'M124 96h142a30 30 0 0 1 30 30v58a30 30 0 0 1-30 30H124a30 30 0 0 1-30-30v-58a30 30 0 0 1 30-30ZM118 146a9 9 0 1 0 0 18 9 9 0 1 0 0-18Z';
    const tags = art(
      'school-dog-tags',
      240,
      252,
      `<linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f3f5f8"/><stop offset=".5" stop-color="#c5ccd6"/><stop offset="1" stop-color="#e3e7ec"/></linearGradient>` +
        `<linearGradient id="dull" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#c9d0d9"/><stop offset="1" stop-color="#8f98a5"/></linearGradient>`,
      // The tag behind, turned on the chain it shares with the one in front.
      `<g transform="translate(-76 -14)"><g transform="rotate(15 118 155)"><path fill-rule="evenodd" fill="url(#dull)" d="${plateOf}"/><path fill="none" stroke="#6f7884" stroke-width="2" d="M124 96h142a30 30 0 0 1 30 30v58a30 30 0 0 1-30 30H124a30 30 0 0 1-30-30v-58a30 30 0 0 1 30-30Z"/></g>` +
        `<path fill-rule="evenodd" fill="url(#steel)" d="${plateOf}"/>` +
        `<path fill="none" stroke="#7b8490" stroke-width="2" d="M124 96h142a30 30 0 0 1 30 30v58a30 30 0 0 1-30 30H124a30 30 0 0 1-30-30v-58a30 30 0 0 1 30-30Z"/>` +
        `<rect x="102" y="104" width="186" height="102" rx="23" fill="none" stroke="#ffffff" stroke-opacity=".75" stroke-width="2"/>` +
        `<rect x="104" y="106" width="182" height="98" rx="21" fill="none" stroke="#8d96a3" stroke-opacity=".7" stroke-width="1.200"/></g>` +
        // The ball chain: a line of beads from the hole up to the edge it hangs on.
        line('M42 141C34 100 26 50 22 4M42 141C50 98 58 48 62 3', '#7f8894', 1.6) +
        line(
          'M42 141C34 100 26 50 22 4M42 141C50 98 58 48 62 3',
          '#b9c1cb',
          8,
          ' stroke-dasharray=".1 10.500" stroke-linecap="round"',
        ) +
        line(
          'M40.500 139.500C32.500 98.500 24.500 48.500 20.500 2.500M40.500 139.500C48.500 96.500 56.500 46.500 60.500 1.500',
          '#ffffff',
          2.6,
          ' stroke-dasharray=".1 10.500" stroke-linecap="round" stroke-opacity=".8"',
        ),
    );
    // A sash of canvas with its two ends cut to a fork, the words stencilled on it.
    const sash = art(
      'school-sash',
      520,
      100,
      `<linearGradient id="canvas" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e6dab2"/><stop offset="1" stop-color="#cdbd8b"/></linearGradient>` +
        `<pattern id="weave" width="5" height="5" patternUnits="userSpaceOnUse"><path d="M0 2.500H5M2.500 0V5" stroke="#8c7d4e" stroke-width=".6" stroke-opacity=".3"/></pattern>`,
      `<path fill="url(#canvas)" d="M0 3H520L494 50 520 97H0L26 50Z"/>` +
        `<path fill="url(#weave)" d="M0 3H520L494 50 520 97H0L26 50Z"/>` +
        line('M7 11H513M7 89H513', '#a89a66', 5) +
        line('M14 19H506M14 81H506', '#fffbe8', 1.6, ' stroke-dasharray="7 5" stroke-opacity=".9"'),
    );
    return magnet(
      'magnet-enlistment',
      'Enlistment party magnet',
      'מגנט למסיבת גיוס',
      [1050, 750, 16],
      {
        opening,
        round: 6,
        draw: (S) => ({
          defs:
            tile('camo', 'school-camo', 400) +
            `<linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#10160a" stop-opacity=".1"/><stop offset="1" stop-color="#10160a" stop-opacity=".45"/></linearGradient>`,
          body:
            ground(S, 'url(#camo)') +
            onBorder(
              S.whole('fill="url(#dusk)"'),
              // A strap of webbing along the foot, stitched at both edges.
              S.box(box(0, 618, 1050, 114), 0, 'fill="#2c381d" fill-opacity=".93"'),
              S.pin(
                `<line x1="0" x2="100%" y1="629" y2="629" stroke="#c9bb8a" stroke-width="2" stroke-dasharray="9 6" stroke-opacity=".8"/>` +
                  `<line x1="0" x2="100%" y1="721" y2="721" stroke="#c9bb8a" stroke-width="2" stroke-dasharray="9 6" stroke-opacity=".8"/>`,
                [0, 750],
                { x: 'start', y: 'end' },
              ),
            ) +
            frameLine(S, 0, 6, '#e6dcb6', 5) +
            frameLine(S, 8, 12, '#1d2612', 2, ' stroke-opacity=".6"'),
        }),
        extras: [
          label(
            tags,
            36,
            15,
            [
              caption(
                58,
                88,
                152,
                56,
                { text: 'עידו', font: 'Karantina', size: 48, weight: 700, spacing: 2 },
                { text: 'IDO', font: 'Karantina', size: 48, weight: 700, spacing: 4 },
                { color: '#343b45' },
              ),
              caption(
                58,
                144,
                152,
                44,
                { text: 'מתגייס!', font: 'Karantina', size: 34, weight: 700, spacing: 1 },
                { text: 'ENLISTING!', font: 'Karantina', size: 32, weight: 700, spacing: 1 },
                { color: '#4b5460' },
              ),
            ],
            { turn: -7 },
          ),
          sticker(picture('school-kit-2'), 34, 540, 172),
          caption(
            226,
            634,
            284,
            50,
            { text: 'גיוס אוגוסט', font: 'Karantina', size: 42, weight: 700, spacing: 2 },
            { text: 'AUGUST DRAFT', font: 'Karantina', size: 42, weight: 700, spacing: 2 },
            { color: '#e6dcb6', align: 'left' },
          ),
          caption(
            226,
            682,
            284,
            36,
            { text: 'גאים בך ומחכים לך בבית', font: 'Heebo', size: 22, weight: 500 },
            { text: 'So proud of you!', font: 'DM Sans', size: 22, weight: 500 },
            { color: '#cfc79f', align: 'left' },
          ),
          // The sash lies across the corner, from the foot of the card up over the photograph. It
          // is wide for its words and not steep: the design check reads what is around them too.
          label(
            sash,
            522,
            580,
            [
              caption(
                50,
                12,
                420,
                76,
                { text: 'בהצלחה, חייל!', font: 'Karantina', size: 58, weight: 700, spacing: 3 },
                {
                  text: 'GOOD LUCK, SOLDIER!',
                  font: 'Karantina',
                  size: 50,
                  weight: 700,
                  spacing: 1,
                },
                { color: '#2f3a1f' },
              ),
            ],
            { turn: -15 },
          ),
        ],
      },
      {
        en: 'event army enlistment draft soldier military service party khaki',
        he: 'אירוע צבא מסיבת גיוס מתגייס חייל חיילת צהל שירות בקום חאקי',
      },
    );
  }

  /* ---- a discharge party: sunrise, a window torn open at the top, the big trip packed */
  function discharge() {
    const opening = box(44, 150, 662, 606);
    const next = random(1809);
    // The torn edge: where the card was ripped open over the photograph.
    const tear = Array.from({ length: 34 }, (_, i) => {
      const x = opening.x + (opening.w * i) / 33;
      const y = i % 33 === 0 ? opening.y + 12 : opening.y + (i % 2 ? 0 : 12) + next() * 22;
      return [x, i === 7 ? opening.y : y];
    });
    const torn = (by) => tear.map(([x, y]) => [x, y + by, { y: 'start' }]);
    const pane = [
      ...torn(0),
      ...tied([
        [706, 756],
        [44, 756],
      ]),
    ];
    // The white of the paper shows along the tear, a little further down than the card ends.
    const fibre = [
      ...torn(0),
      ...tear.map(([x, y], i) => [x, y + 5 + ((i * 7) % 5), { y: 'start' }]).reverse(),
    ];
    // Days counted on a wall: four strokes and one across them.
    const tally = (x, lean) =>
      line(
        `M${x} ${10 + lean}v38M${x + 11} ${8 - lean}v40M${x + 22} ${11 + lean}v37M${x + 33} ${9}v${39 + lean}M${x - 7} ${42 - lean}L${x + 41} ${14 + lean}`,
        '#ffffff',
        3.6,
        ' stroke-linecap="round" stroke-opacity=".5"',
      );
    // A strip torn from a sheet of paper, with a piece of tape at each end.
    const edge = (x, side) =>
      Array.from({ length: 9 }, (_, i) => [
        x + side * (i % 2 ? 9 : 2) + side * next() * 5,
        6 + i * 13.25,
      ]);
    const strip = art(
      'school-torn-strip',
      470,
      118,
      `<linearGradient id="sheet" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#f4ecdb"/></linearGradient>`,
      `<path fill="url(#sheet)" d="M${points([...edge(14, -1), ...edge(456, 1).reverse()])}Z"/>` +
        `<rect x="-4" y="38" width="58" height="34" fill="#ffd166" fill-opacity=".82" transform="rotate(-18 25 55)"/>` +
        `<rect x="416" y="46" width="58" height="34" fill="#ffd166" fill-opacity=".82" transform="rotate(-14 445 63)"/>`,
    );
    return magnet(
      'magnet-discharge',
      'Discharge party magnet',
      'מגנט למסיבת שחרור',
      [750, 1050, 22],
      {
        opening,
        window: (S) => S.shape(pane, 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e23e6d"/><stop offset=".5" stop-color="#ff7550"/><stop offset=".86" stop-color="#ffb347"/><stop offset="1" stop-color="#ffd76a"/></linearGradient>` +
            `<pattern id="tally" width="196" height="62" patternUnits="userSpaceOnUse">${tally(14, 0)}${tally(78, 2)}${tally(144, -1)}</pattern>` +
            `<radialGradient id="halo" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#fff3b0" stop-opacity=".55"/><stop offset="1" stop-color="#fff3b0" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, 'url(#dawn)') +
            onBorder(
              S.box(box(0, 0, 750, 124), 0, 'fill="url(#tally)"'),
              // The sun comes up behind the hills, where the trip waits.
              S.pin(
                `<circle cx="462" cy="884" r="210" fill="url(#halo)"/><circle cx="462" cy="884" r="112" fill="#fff0a8"/><circle cx="462" cy="884" r="96" fill="#ffe066"/>`,
                [462, 884],
                { x: 'end', y: 'end' },
              ),
              footed(
                S,
                box(0, 760, 750, 290),
                `<path fill="#6a1b4a" d="M0 826C140 786 300 800 430 858S650 922 750 892V1050H0Z"/>` +
                  `<path fill="#4c1136" d="M0 912C150 872 330 908 470 950S680 996 750 978V1050H0Z"/>`,
              ),
            ) +
            S.shape(fibre, 'fill="#fffaf0"'),
        }),
        extras: [
          label(
            strip,
            140,
            74,
            [
              caption(
                44,
                8,
                382,
                102,
                { text: 'משתחרר!', font: 'Karantina', size: 86, weight: 700, spacing: 2 },
                { text: 'FREE AT LAST!', font: 'Karantina', size: 70, weight: 700, spacing: 2 },
                { color: '#26141f' },
              ),
            ],
            { turn: -5 },
          ),
          sticker('palm-tree', 548, 656, 190, { turn: 6 }),
          sticker(picture('school-kit-3'), 478, 794, 240),
          sticker('airplane', 384, 700, 128, { turn: -8, flip: true }),
          caption(
            44,
            838,
            440,
            44,
            { text: 'סוף סוף אזרח', font: 'Heebo', size: 32, weight: 700, spacing: 1 },
            { text: 'FINALLY A CIVILIAN', font: 'Montserrat', size: 28, weight: 700, spacing: 3 },
            { color: '#ffd76a', align: 'left' },
          ),
          caption(
            44,
            880,
            400,
            112,
            { text: 'אורי', font: 'Secular One', size: 96 },
            { text: 'Uri', font: 'Secular One', size: 96 },
            { color: '#ffffff', align: 'left' },
          ),
          caption(
            44,
            990,
            400,
            42,
            { text: 'הטיול הגדול מתחיל', font: 'Heebo', size: 30, weight: 500 },
            { text: 'The big trip starts now', font: 'DM Sans', size: 28, weight: 500 },
            { color: '#ffe9d6', align: 'left' },
          ),
        ],
      },
      {
        en: 'event army discharge release soldier freedom big trip backpack travel party',
        he: 'אירוע צבא מסיבת שחרור משתחרר חייל משוחרר אזרח הטיול הגדול תרמיל חופש',
      },
    );
  }

  /* ---- the end of a course: deep blue and silver, a rosette, a plaque across the foot */
  function course() {
    const opening = box(40, 40, 970, 592);
    const silver = '#c9d3e3';
    // Fine rings around the lower corner, as on a certificate.
    const rings = Array.from(
      { length: 14 },
      (_, i) =>
        `<circle cx="1050" cy="750" r="${70 + i * 15}" fill="none" stroke="${silver}" stroke-width="1" stroke-opacity="${f(0.34 - i * 0.018)}"/>`,
    ).join('');
    // An award rosette: a pleated ring of ribbon, a disc of silver, two tails.
    const pleats = Array.from({ length: 30 }, (_, i) => {
      const [c, s] = [Math.cos(rad(i * 12)), Math.sin(rad(i * 12))];
      return `M${f(90 + 58 * c)} ${f(88 + 58 * s)}L${f(90 + 82 * c)} ${f(88 + 82 * s)}`;
    }).join('');
    const rosette = art(
      'school-rosette',
      194,
      270,
      `<linearGradient id="silk" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#3f6fe0"/><stop offset="1" stop-color="#1b3f9c"/></linearGradient>` +
        `<radialGradient id="coin" cx=".38" cy=".32" r=".8"><stop stop-color="#ffffff"/><stop offset=".6" stop-color="#d5dce8"/><stop offset="1" stop-color="#9aa6b8"/></radialGradient>`,
      `<g transform="scale(1.080)"><path fill="#1b3f9c" d="M50 126h44l-10 118-22-24-26 18Z"/><path fill="#2a55c0" d="M86 126h44l16 116-26-18-22 24Z"/>` +
        line('M60 132 50 228M122 132l12 96', silver, 2, ' stroke-opacity=".85"') +
        `<circle cx="90" cy="88" r="80" fill="none" stroke="#2a55c0" stroke-width="12" stroke-dasharray="0 13.960" stroke-linecap="round"/>` +
        `<circle cx="90" cy="88" r="80" fill="url(#silk)"/>` +
        line(pleats, '#0f2a70', 1.6, ' stroke-opacity=".55"') +
        `<circle cx="90" cy="88" r="58" fill="url(#coin)"/>` +
        `<circle cx="90" cy="88" r="58" fill="none" stroke="#7f8ba0" stroke-width="1.600"/>` +
        `<circle cx="90" cy="88" r="51" fill="none" stroke="#1b3f9c" stroke-width="1.200" stroke-dasharray="1.500 4.500"/>` +
        `<path d="${star(90, 58, 10)}" fill="#1b3f9c"/>` +
        `<path d="${sparkle(70, 118, 5, 0.3)}${sparkle(90, 122, 6, 0.3)}${sparkle(110, 118, 5, 0.3)}" fill="#1b3f9c"/></g>`,
    );
    // A plaque of brushed steel, screwed on at its four corners.
    const screws = [
      [24, 24],
      [596, 24],
      [24, 110],
      [596, 110],
    ]
      .map(
        ([x, y], i) =>
          `<circle cx="${x}" cy="${y}" r="6" fill="#aab3c2" stroke="#6f7a8c" stroke-width="1.200"/>` +
          line(
            `M${x - 4} ${y}h8`,
            '#5d6779',
            1.6,
            ` transform="rotate(${[30, -20, 60, 10][i]} ${x} ${y})"`,
          ),
      )
      .join('');
    const plaque = art(
      'school-plaque',
      620,
      134,
      `<linearGradient id="steel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fbfcfd"/><stop offset=".5" stop-color="#d3dae4"/><stop offset="1" stop-color="#eef1f5"/></linearGradient>` +
        `<pattern id="brushed" width="120" height="4" patternUnits="userSpaceOnUse"><rect width="120" height="1" fill="#ffffff" fill-opacity=".5"/><rect y="2" width="70" height="1" fill="#8d97a8" fill-opacity=".14"/></pattern>`,
      `<rect x="2" y="2" width="616" height="130" rx="9" fill="url(#steel)"/>` +
        `<rect x="2" y="2" width="616" height="130" rx="9" fill="url(#brushed)"/>` +
        `<rect x="2" y="2" width="616" height="130" rx="9" fill="none" stroke="#7d8798" stroke-width="2"/>` +
        `<rect x="10" y="10" width="600" height="114" rx="5" fill="none" stroke="#ffffff" stroke-opacity=".85" stroke-width="1.500"/>` +
        `<rect x="12" y="12" width="596" height="110" rx="4" fill="none" stroke="#8d97a8" stroke-opacity=".6" stroke-width="1"/>` +
        screws,
    );
    return magnet(
      'magnet-course',
      'Course graduation magnet',
      'מגנט לסיום קורס',
      [1050, 750, 12],
      {
        opening,
        round: 4,
        draw: (S) => ({
          defs:
            `<linearGradient id="deep" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#16306b"/><stop offset="1" stop-color="#0a1736"/></linearGradient>` +
            `<pattern id="pinstripe" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1" height="12" fill="${silver}" fill-opacity=".1"/></pattern>`,
          body:
            ground(S, 'url(#deep)') +
            onBorder(
              S.whole('fill="url(#pinstripe)"'),
              S.pin(rings, [1050, 750], { x: 'end', y: 'end' }),
            ) +
            S.outline(box(12, 12, 1026, 726), 6, 1.2, `stroke="${silver}" stroke-opacity=".7"`) +
            frameLine(S, 9, 9, silver, 1, ' stroke-opacity=".6"') +
            frameLine(S, 2, 5, '#e9eef6', 4) +
            // A rule with a jewel over the small line at the foot.
            S.pin(
              line('M770 668H1004', silver, 1.2, ' stroke-opacity=".8"') +
                `<path d="${sparkle(756, 668, 7, 0.3)}" fill="${silver}"/>`,
              [1004, 668],
              { x: 'end', y: 'end' },
            ),
        }),
        extras: [
          label(
            rosette,
            16,
            16,
            [
              caption(
                37,
                75,
                120,
                40,
                { text: 'מצטיין', font: 'Frank Ruhl Libre', size: 33, weight: 700 },
                { text: 'HONORS', font: 'Montserrat', size: 20, weight: 800 },
                { color: '#14275c' },
              ),
            ],
            { turn: -6 },
          ),
          // The plaque is the lower third of the photograph: half on it, half on the card.
          label(plaque, 34, 566, [
            caption(
              50,
              16,
              520,
              66,
              { text: 'קורס מדריכים', font: 'Frank Ruhl Libre', size: 54, weight: 700 },
              { text: 'Instructors Course', font: 'Playfair Display', size: 46, weight: 700 },
              { color: '#10214a' },
            ),
            caption(
              50,
              82,
              520,
              38,
              { text: 'מחזור אביב', font: 'Heebo', size: 28, weight: 500, spacing: 4 },
              { text: 'SPRING CLASS', font: 'Montserrat', size: 23, weight: 600, spacing: 6 },
              { color: '#3c4c72' },
            ),
          ]),
          caption(
            606,
            678,
            400,
            42,
            { text: 'טקס סיום הקורס', font: 'Heebo', size: 28, weight: 500, spacing: 2 },
            { text: 'GRADUATION CEREMONY', font: 'Montserrat', size: 20, weight: 600, spacing: 3 },
            { color: '#dbe3f0', align: 'right' },
          ),
        ],
      },
      {
        en: 'event course graduation ceremony cadets officers training army award certificate',
        he: 'אירוע סיום קורס טקס מדריכים קצינים מפקדים צבא הכשרה מצטיין תעודה',
      },
    );
  }

  /* ---- a summer camp: rays of sun, a bracelet along the foot, a column of sewn patches */
  function camp() {
    const opening = box(40, 40, 850, 556);
    const threads = ['#19b5b0', '#ff6b57', '#ffc93c', '#7b5ad6', '#7ccf3a'];
    // The rays of the sun, from behind the photograph out to the edges of the card.
    const rays = Array.from({ length: 16 }, (_, i) => {
      const [a, b] = [spun(0, -1900, i * 22.5), spun(0, -1900, i * 22.5 + 11.25)];
      return `M465 318 ${f(465 + a[0])} ${f(318 + a[1])} ${f(465 + b[0])} ${f(318 + b[1])}Z`;
    }).join('');
    // A friendship bracelet: arrowheads of thread, one colour after the other.
    const knots = threads
      .map(
        (colour, i) =>
          `<path fill="${colour}" d="M${i * 14} 0h14l15 17-15 17h-14l15-17Z"/><path fill="${colour}" d="M${i * 14 - 70} 0h14l15 17-15 17h-14l15-17Z"/>`,
      )
      .join('');
    /** A round patch: a rim of thick thread, a field, a line of stitches, the thread's grain. */
    const patch = (name, rim, field, motif) =>
      art(
        name,
        160,
        160,
        `<pattern id="thread" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="1.400" height="4" fill="#ffffff" fill-opacity=".17"/></pattern>` +
          `<pattern id="whip" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-50)"><rect width="1.600" height="5" fill="#000000" fill-opacity=".2"/></pattern>`,
        `<circle cx="80" cy="80" r="78" fill="${rim}"/>` +
          `<circle cx="80" cy="80" r="78" fill="url(#whip)"/>` +
          `<circle cx="80" cy="80" r="66" fill="${field}"/>` +
          motif +
          `<circle cx="80" cy="80" r="66" fill="url(#thread)"/>` +
          `<circle cx="80" cy="80" r="60" fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width="2" stroke-dasharray="6 5" stroke-linecap="round"/>`,
      );
    const tent = patch(
      'school-patch-tent',
      '#0d6e73',
      '#19b5b0',
      `<circle cx="112" cy="50" r="11" fill="#ffe066"/>` +
        `<path fill="#0d6e73" d="M26 110h108v8a60 60 0 0 1-108 0Z" fill-opacity=".55"/>` +
        `<path fill="#ff6b57" d="M80 42 40 110H120Z"/><path fill="#ffa08f" d="M80 42 40 110H62Z"/>` +
        `<path fill="#5c1f14" d="M80 66 66 110H94Z"/>` +
        line('M80 42 76 34M80 42l4-8', '#5c1f14', 3, ' stroke-linecap="round"') +
        line('M34 110H126', '#ffffff', 3.5, ' stroke-linecap="round"'),
    );
    const fire = patch(
      'school-patch-fire',
      '#3a2a78',
      '#5a43b8',
      `<path d="${sparkle(44, 56, 6, 0.3)}${sparkle(116, 48, 7, 0.3)}${sparkle(104, 76, 4, 0.3)}" fill="#ffe9a6"/>` +
        `<path fill="#ff7a2f" d="M80 34C98 54 110 68 107 88A27 27 0 0 1 53 88C51 75 60 68 64 57 70 63 73 68 75 71 73 58 76 46 80 34Z"/>` +
        `<path fill="#ffd43b" d="M80 62C89 73 94 80 93 90A13 13 0 0 1 67 90C67 81 73 74 80 62Z"/>` +
        `<rect x="48" y="102" width="64" height="12" rx="6" fill="#a8693a" transform="rotate(13 80 108)"/>` +
        `<rect x="48" y="102" width="64" height="12" rx="6" fill="#8a5330" transform="rotate(-13 80 108)"/>`,
    );
    const rose = patch(
      'school-patch-compass',
      '#c2410c',
      '#ffc93c',
      `<circle cx="80" cy="80" r="44" fill="#fff7e0"/>` +
        `<circle cx="80" cy="80" r="44" fill="none" stroke="#1b3a5b" stroke-width="4"/>` +
        `<g transform="rotate(45 80 80)" fill="#e9b949"><path d="M80 54 86 80H74Z"/><path d="M80 106 86 80H74Z"/><path d="M106 80 80 74V86Z"/><path d="M54 80 80 74V86Z"/></g>` +
        `<path fill="#e5484d" d="M80 40 89 80H71Z"/><path fill="#1b3a5b" d="M80 120 89 80H71Z"/>` +
        `<path fill="#1b3a5b" d="M120 80 80 71V89Z"/><path fill="#1b3a5b" d="M40 80 80 71V89Z"/>` +
        `<circle cx="80" cy="80" r="6" fill="#fff7e0" stroke="#1b3a5b" stroke-width="2.500"/>`,
    );
    // A signpost of dark wood, cut to an arrow, with the words painted on it.
    const board = art(
      'school-wood-sign',
      430,
      132,
      `<linearGradient id="plank" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#8e5a2b"/><stop offset="1" stop-color="#6a3e1a"/></linearGradient>`,
      `<path fill="url(#plank)" d="M12 8H366l56 58-56 58H12a6 6 0 0 1-6-6V14a6 6 0 0 1 6-6Z"/>` +
        line(
          'M22 34q90-8 170 0t170-2M20 62q110 9 210 0t168 4M22 94q80-7 160 0t190-2',
          '#4d2b10',
          1.6,
          ' stroke-opacity=".5" stroke-linecap="round"',
        ) +
        line('M14 12H364l50 54', '#c08a55', 2, ' stroke-opacity=".7" stroke-linecap="round"') +
        `<circle cx="28" cy="28" r="5" fill="#3a2110"/><circle cx="28" cy="104" r="5" fill="#3a2110"/>` +
        `<circle cx="27" cy="27" r="1.800" fill="#c9a37a"/><circle cx="27" cy="103" r="1.800" fill="#c9a37a"/>`,
    );
    return magnet(
      'magnet-camp',
      'Summer camp magnet',
      'מגנט לקייטנה ולמחנה קיץ',
      [1050, 750, 20],
      {
        opening,
        round: 12,
        draw: (S) => ({
          defs: `<pattern id="bracelet" width="70" height="34" patternUnits="userSpaceOnUse">${knots}</pattern>`,
          body:
            ground(S, '#fff6dc') +
            onBorder(
              S.pin(`<path fill="#ffe08a" fill-opacity=".8" d="${rays}"/>`, [465, 318], {
                x: 'mid',
                y: 'mid',
              }),
              // The bracelet is tied along the foot: a longer card has more of its knots.
              S.pin(
                `<rect x="0" y="708" width="100%" height="34" fill="url(#bracelet)"/>` +
                  `<rect x="0" y="704" width="100%" height="4" fill="#0d6e73"/><rect x="0" y="742" width="100%" height="8" fill="#0d6e73"/>`,
                [0, 750],
                { x: 'start', y: 'end' },
              ),
            ) +
            frameLine(S, 0, 12, '#ffffff', 8) +
            frameLine(S, 7, 18, '#0d6e73', 2),
        }),
        extras: [
          // The patches are sewn down the edge of the photograph, evenly at any height.
          sticker(tent, 846, 62, 164, { turn: -8 }),
          sticker(fire, 866, 293, 164, { turn: 6 }),
          sticker(rose, 846, 524, 164, { turn: -5 }),
          label(
            board,
            26,
            548,
            [
              caption(
                26,
                28,
                340,
                76,
                { text: 'מחנה קיץ', font: 'Suez One', size: 60 },
                { text: 'SUMMER CAMP', font: 'Suez One', size: 37 },
                { color: '#fff3d6' },
              ),
            ],
            { turn: -4 },
          ),
          caption(
            470,
            646,
            370,
            44,
            { text: 'שבט כרמל · שכבת ו׳', font: 'Rubik', size: 30, weight: 600 },
            { text: 'Carmel Troop · Grade 6', font: 'Rubik', size: 28, weight: 600 },
            { color: '#0d5f66' },
          ),
        ],
      },
      {
        en: 'event summer camp scouts youth movement patches tent campfire kids vacation',
        he: 'אירוע קייטנה מחנה קיץ תנועת נוער צופים שבט טלאים אוהל מדורה חופש גדול',
      },
    );
  }

  return [
    firstGrade(),
    ganEnd(),
    classPhoto(),
    prom(),
    degree(),
    reunion(),
    enlistment(),
    discharge(),
    course(),
    camp(),
  ];
}
