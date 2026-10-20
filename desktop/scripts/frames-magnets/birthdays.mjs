/*
 * The magnets of birthdays (`../frames-magnets.mjs`): a first birthday, a child's birthday with
 * an age, a teenager's, the eighteenth, the thirtieth, the fortieth, the fiftieth, the sixtieth
 * and up, a surprise party and a birthday in the garden. The age of each is a line of words of
 * its own, so it is typed over.
 */

/** @param kit What a magnet is drawn with (`kit.mjs`). */
export default function birthdays(kit) {
  const { around, random, box, inset, f } = kit;
  const { magnet, sticker, caption, label, art, picture, ground, onBorder, line, frameLine } = kit;
  const { sparkle, star, scattered, pick } = kit;

  const rad = (turn) => (turn * Math.PI) / 180;
  /** Circles of radius `r`, `count` of them around a circle of radius `at`. */
  const beads = (cx, cy, at, count, r, attrs, turn = 0) =>
    Array.from({ length: count }, (_, i) => {
      const a = rad(turn + (i * 360) / count);
      return `<circle cx="${f(cx + at * Math.cos(a))}" cy="${f(cy + at * Math.sin(a))}" r="${r}" ${attrs}/>`;
    }).join('');
  /**
   * A burst of `points` rays around a centre, `rx` wide and `ry` high: the notches between the
   * rays lie at `inner` of the way out, and `reach` may make a ray shorter than the others.
   */
  const burst = (cx, cy, points, rx, ry, inner, turn = 0, reach = () => 1) =>
    `M${around(points * 2, turn, (i) => (i % 2 ? inner : reach(i / 2)))
      .map(([x, y]) => `${f(cx + x * rx)} ${f(cy + y * ry)}`)
      .join('L')}Z`;
  /**
   * The corners of a box turned by `turn` degrees clockwise about a point, from the top left
   * around: a print that lies a little askew on its card.
   */
  const askew = ({ x, y, w, h }, turn, [cx, cy]) => {
    const [c, s] = [Math.cos(rad(turn)), Math.sin(rad(turn))];
    return [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ].map(([px, py]) => [cx + (px - cx) * c - (py - cy) * s, cy + (px - cx) * s + (py - cy) * c]);
  };
  /** A corner of such a print keeps its distance from the corner of the card it is at. */
  const cornered = (points, dx = 0, dy = 0) =>
    points.map(([x, y]) => [x + dx, y + dy, { x: 'near', y: 'near' }]);
  /** The box that holds points. */
  const held = (points) => {
    const xs = points.map(([x]) => x);
    const ys = points.map(([, y]) => y);
    const [x0, y0] = [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys))];
    return box(x0, y0, Math.ceil(Math.max(...xs)) - x0, Math.ceil(Math.max(...ys)) - y0);
  };
  /** A drawing with the white edge of a sticker cut out of its sheet around it. */
  const cutOut = (d, edge, attrs) =>
    `<path d="${d}" fill="#fff" stroke="#fff" stroke-width="${edge}" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<path d="${d}" stroke-linejoin="round" stroke-linecap="round" ${attrs}/>`;
  /**
   * A tube of neon along a path: its light around it, the tube, and the white of its core. The
   * light is wider lines that fade, so nothing is blurred when the card changes its size.
   */
  const neon = (d, colour, width = 4) =>
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" stroke="${colour}" stroke-opacity=".1" stroke-width="${f(width * 4.6)}"/>` +
    `<path d="${d}" stroke="${colour}" stroke-opacity=".22" stroke-width="${f(width * 2.6)}"/>` +
    `<path d="${d}" stroke="${colour}" stroke-width="${width}"/>` +
    `<path d="${d}" stroke="#ffffff" stroke-opacity=".85" stroke-width="${f(width * 0.32)}"/></g>`;

  /* ---- a first birthday: gingham in mint, bunting, a rosette with the one, the first cake */
  function firstBirthday() {
    const opening = box(40, 92, 970, 512);
    // The bunting: a string that sags between two bows, and nine flags that hang from it.
    const sag = (x) => 14 + 136 * ((x - 6) / 768) * (1 - (x - 6) / 768);
    const flags = [
      '#8ddcc0',
      '#ffb49a',
      '#fffdf6',
      '#ffe39a',
      '#5fbfa6',
      '#ffb49a',
      '#fffdf6',
      '#8ddcc0',
      '#ffe39a',
    ]
      .map((colour, i) => {
        const [x0, x1] = [38 + i * 80, 108 + i * 80];
        const [y0, y1] = [sag(x0), sag(x1)];
        const length = Math.hypot(x1 - x0, y1 - y0);
        // The flag hangs square to the string.
        const [nx, ny] = [-(y1 - y0) / length, (x1 - x0) / length];
        const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
        const tip = [mx + nx * 80, my + ny * 80];
        const fold = [
          [x0 + nx * 11 + (x1 - x0) * 0.07, y0 + ny * 11 + (y1 - y0) * 0.07],
          [x1 + nx * 11 - (x1 - x0) * 0.07, y1 + ny * 11 - (y1 - y0) * 0.07],
        ];
        const dot = (along, down, r) =>
          `<circle cx="${f(x0 + (x1 - x0) * along + nx * down)}" cy="${f(y0 + (y1 - y0) * along + ny * down)}" r="${r}"/>`;
        const pale = colour === '#fffdf6';
        return (
          `<path d="M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}L${f(tip[0])} ${f(tip[1])}Z" fill="${colour}"/>` +
          `<path d="M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}L${f(fold[1][0])} ${f(fold[1][1])}L${f(fold[0][0])} ${f(fold[0][1])}Z" fill="#1c6b60" fill-opacity=".16"/>` +
          `<g fill="${pale ? '#8ddcc0' : '#ffffff'}" fill-opacity="${pale ? 1 : 0.75}">${dot(0.5, 26, 5)}${dot(0.34, 40, 3.6)}${dot(0.66, 40, 3.6)}${dot(0.5, 54, 3)}</g>`
        );
      })
      .join('');
    const bow = (x, y) =>
      `<g transform="translate(${x} ${y})"><path fill="#ff8f73" d="M0 0C-9-13-24-11-22 1S-8 10 0 0ZM0 0C9-13 24-11 22 1S8 10 0 0Z"/>` +
      `<path fill="none" stroke="#ff8f73" stroke-width="4" stroke-linecap="round" d="M-2 3-9 20M2 3 9 20"/><circle r="5" fill="#f26f52"/></g>`;
    const bunting = art(
      'bd-bunting-pastel',
      780,
      132,
      '',
      flags +
        line('M6 14Q390 150 774 14', '#3f8f82', 3.6, ' stroke-linecap="round"') +
        bow(10, 15) +
        bow(770, 15),
    );
    // The rosette: a scalloped edge of peach, a white face with a ring of dots.
    const rosette = art(
      'bd-rosette-one',
      196,
      196,
      `<radialGradient id="face" cx=".4" cy=".3" r=".8"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#fff3e4"/></radialGradient>`,
      beads(98, 98, 80, 18, 17, 'fill="#ffb49a"') +
        `<circle cx="98" cy="98" r="84" fill="#ffb49a"/><circle cx="98" cy="98" r="77" fill="#ff9d80"/>` +
        `<circle cx="98" cy="98" r="72" fill="url(#face)"/>` +
        `<circle cx="98" cy="98" r="65" fill="none" stroke="#8ddcc0" stroke-width="4" stroke-dasharray=".1 9.720" stroke-linecap="round"/>`,
    );
    return magnet(
      'magnet-first-birthday',
      'First birthday magnet',
      'מגנט ליום הולדת שנה',
      [1050, 750, 30],
      {
        opening,
        round: 26,
        draw: (S) => ({
          defs:
            `<pattern id="gingham" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="36" height="18" fill="#a9e3cf" fill-opacity=".5"/><rect width="18" height="36" fill="#a9e3cf" fill-opacity=".5"/></pattern>` +
            `<radialGradient id="peach" cx="1" cy="1" r=".7"><stop stop-color="#ffd9c7"/><stop offset="1" stop-color="#ffd9c7" stop-opacity="0"/></radialGradient>` +
            `<linearGradient id="calm" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#fff9ee" stop-opacity=".94"/><stop offset=".6" stop-color="#fff9ee" stop-opacity=".8"/><stop offset="1" stop-color="#fff9ee" stop-opacity="0"/></linearGradient>`,
          body:
            ground(S, '#fff9ee') +
            onBorder(
              S.whole('fill="url(#gingham)"'),
              S.whole('fill="url(#peach)"'),
              // The cloth is calmer where the words lie on it.
              S.box(box(0, 612, 860, 138), 0, 'fill="url(#calm)"'),
            ) +
            frameLine(S, 7, 32, '#ff9d80', 2.6) +
            frameLine(S, 0, 26, '#ffffff', 9),
        }),
        extras: [
          sticker(bunting, 226, 2, 780),
          label(
            rosette,
            16,
            16,
            [
              caption(
                28,
                22,
                140,
                96,
                { text: '1', font: 'Rubik', size: 82, weight: 800 },
                { text: '1', font: 'Rubik', size: 82, weight: 800 },
                { color: '#1c6b60' },
              ),
              caption(
                38,
                126,
                120,
                32,
                { text: 'שנה', font: 'Rubik', size: 26, weight: 700, spacing: 2 },
                { text: 'YEAR', font: 'Poppins', size: 21, weight: 700, spacing: 4 },
                { color: '#a8431f' },
              ),
            ],
            { turn: -6 },
          ),
          sticker(picture('birthdays-party-1'), 832, 484, 196, { turn: 4 }),
          caption(
            58,
            616,
            740,
            72,
            { text: 'העוגה הראשונה של עלמה', font: 'Rubik', size: 54, weight: 800 },
            { text: 'Alma’s very first cake', font: 'Poppins', size: 48, weight: 800 },
            { color: '#1c6b60', align: 'left' },
          ),
          caption(
            60,
            688,
            740,
            38,
            { text: 'שנה של חיוכים, חיבוקים ולילות לבנים', font: 'Heebo', size: 26, weight: 500 },
            {
              text: 'A year of smiles, cuddles and sleepless nights',
              font: 'DM Sans',
              size: 24,
              weight: 500,
            },
            { color: '#a8431f', align: 'left' },
          ),
        ],
      },
      {
        en: 'event party baby one year old first cake smash pastel bunting',
        he: 'אירוע יום הולדת יומולדת מסיבה תינוק תינוקת שנה ראשון ראשונה עוגה פסטל דגלונים בן בת',
      },
    );
  }

  /* ---- a child's birthday: stripes of blue, a banner of pennants on top, the age in a burst */
  function cakeDay() {
    const opening = box(40, 96, 970, 614);
    const next = random(707);
    // Small stars on the stripes, white and yellow, all around the photograph.
    const stars = (S) =>
      scattered(next, 24, 1050, 750, [inset(opening, -16), box(120, 0, 810, 110)], 52, 13)
        .map(([x, y]) =>
          S.pin(
            `<path d="${star(x, y, 6 + next() * 4, next() * 72)}" fill="${pick(next, ['#ffffff', '#ffd43b', '#ffffff'])}" fill-opacity="${f(0.7 + next() * 0.3)}"/>`,
            [x, y],
          ),
        )
        .join('');
    const pennants = Array.from(
      { length: 10 },
      (_, i) => `<path d="M${42 + 70 * i} 78h70l-35 54Z" fill="${i % 2 ? '#ffffff' : '#ffd43b'}"/>`,
    ).join('');
    // The banner: a band with a notch at each end, and a row of pennants that hang under it.
    const banner = art(
      'bd-banner-pennants',
      784,
      136,
      `<linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fb5252"/><stop offset="1" stop-color="#d92626"/></linearGradient>`,
      pennants +
        `<path d="M0 6H784L756 49 784 92H0L28 49Z" fill="url(#red)"/>` +
        `<path d="M0 6H784L776.200 18H7.800Z" fill="#ffffff" fill-opacity=".14"/>` +
        line(
          'M44 18H740M44 80H740',
          '#ffffff',
          2.6,
          ' stroke-opacity=".7" stroke-dasharray=".1 9" stroke-linecap="round"',
        ) +
        `<path d="${star(66, 50, 15)}" fill="#ffd43b"/><path d="${star(718, 50, 15)}" fill="#ffd43b"/>`,
    );
    // The burst the age is in: a ring of rays in yellow on a rim of white.
    const age = art(
      'bd-burst-age',
      220,
      220,
      `<radialGradient id="sun" cx=".5" cy=".45" r=".55"><stop offset=".35" stop-color="#fff0a3"/><stop offset="1" stop-color="#ffcf2e"/></radialGradient>`,
      `<path d="${burst(114, 116, 20, 100, 100, 0.84)}" fill="#143a9e" fill-opacity=".45"/>` +
        `<path d="${burst(110, 110, 20, 104, 104, 0.84)}" fill="#ffffff"/>` +
        `<path d="${burst(110, 110, 20, 95, 95, 0.83)}" fill="url(#sun)"/>` +
        `<path d="${star(48, 124, 9)}" fill="#e03131"/><path d="${star(172, 124, 9)}" fill="#e03131"/>`,
    );
    return magnet(
      'magnet-cake-day',
      'Child’s birthday magnet',
      'מגנט ליום הולדת עם גיל',
      [1050, 750, 28],
      {
        opening,
        round: 22,
        draw: (S) => ({
          defs:
            `<linearGradient id="blue" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3d7bff"/><stop offset="1" stop-color="#2457d6"/></linearGradient>` +
            `<pattern id="stripes" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="22" height="44" fill="#ffffff" fill-opacity=".17"/></pattern>`,
          body:
            ground(S, 'url(#blue)') +
            onBorder(S.whole('fill="url(#stripes)"'), stars(S)) +
            frameLine(S, 9, 30, '#ffd43b', 3.4) +
            frameLine(S, 0, 22, '#ffffff', 9),
        }),
        extras: [
          sticker(picture('birthdays-party-2'), 12, 534, 192, { turn: -3 }),
          label(banner, 133, 8, [
            caption(
              86,
              11,
              612,
              76,
              { text: 'מזל טוב ליובל!', font: 'Secular One', size: 64 },
              { text: 'Happy Birthday, Yuval!', font: 'Poppins', size: 42, weight: 800 },
              { color: '#ffffff' },
            ),
          ]),
          label(
            age,
            815,
            515,
            [
              caption(
                46,
                40,
                128,
                32,
                { text: 'חוגגים', font: 'Rubik', size: 22, weight: 700 },
                { text: 'TURNING', font: 'Poppins', size: 20, weight: 700, spacing: 1 },
                { color: '#102c80' },
              ),
              caption(
                60,
                84,
                100,
                96,
                { text: '7', font: 'Rubik', size: 82, weight: 900 },
                { text: '7', font: 'Rubik', size: 82, weight: 900 },
                { color: '#d92626' },
              ),
            ],
            { turn: 8 },
          ),
        ],
      },
      {
        en: 'event party kid kids boy girl age number cake presents gifts banner primary colours',
        he: 'אירוע יום הולדת יומולדת מסיבה ילד ילדה גיל מספר עוגה מתנות דגלים צבעוני מזל טוב',
      },
    );
  }

  /* ---- a teenager's birthday: a print askew on lilac, stickers cut out in white, two strips */
  function teen() {
    // The photograph, and the paper it is printed on: both turned about the same point.
    const about = [375, 430];
    const turn = -3;
    const seen = askew(box(96, 111, 558, 638), turn, about);
    const paper = askew(box(74, 89, 602, 690), turn, about);
    const opening = held(askew(box(95, 110, 560, 640), turn, about));
    const strip = (name, w, colour, edge) =>
      art(
        name,
        w,
        106,
        '',
        `<rect x="9" y="10" width="${w - 9}" height="96" fill="#111014"/>` +
          `<rect x="2.500" y="2.500" width="${w - 14}" height="91" fill="${colour}" stroke="${edge}" stroke-width="5"/>`,
      );
    const smiley = art(
      'bd-teen-smiley',
      140,
      140,
      '',
      `<circle cx="70" cy="70" r="68" fill="#fff"/>` +
        `<circle cx="70" cy="70" r="56" fill="#c8ff3e" stroke="#111014" stroke-width="6"/>` +
        `<ellipse cx="50" cy="56" rx="7.500" ry="11" fill="#111014"/>` +
        line('M80 58q9-10 18 0M42 82q28 34 56 0', '#111014', 6.5, ' stroke-linecap="round"'),
    );
    const bolt = art(
      'bd-teen-bolt',
      116,
      156,
      '',
      cutOut(
        'M76 14 24 86h30L40 142 94 64H62L84 14Z',
        20,
        'fill="#111014" stroke="#111014" stroke-width="5"',
      ) + line('M70 26 40 74h22', '#c8ff3e', 5, ' stroke-linecap="round" stroke-linejoin="round"'),
    );
    const heart = art(
      'bd-teen-heart',
      140,
      130,
      '',
      cutOut(
        'M70 112C32 86 18 64 18 46 18 30 30 20 44 20c11 0 20 6 26 15 6-9 15-15 26-15 14 0 26 10 26 26 0 18-14 40-52 66Z',
        20,
        'fill="#6a3df0" stroke="#111014" stroke-width="6"',
      ) + line('M34 46c0-8 5-13 12-14', '#ffffff', 6, ' stroke-linecap="round"'),
    );
    const cutStar = art(
      'bd-teen-star',
      150,
      150,
      '',
      cutOut(star(75, 79, 58), 20, 'fill="#ffffff" stroke="#111014" stroke-width="6"') +
        `<path d="${star(75, 79, 30)}" fill="#c8ff3e" stroke="#111014" stroke-width="4" stroke-linejoin="round"/>`,
    );
    const petals = beads(70, 70, 33, 6, 23, '');
    const flower = art(
      'bd-teen-flower',
      140,
      140,
      '',
      `<g fill="#fff" stroke="#fff" stroke-width="18">${petals}</g><g fill="#111014">${petals}<circle cx="70" cy="70" r="30"/></g>` +
        `<circle cx="70" cy="70" r="19" fill="#c8ff3e"/>` +
        line('M61 72q9 9 18 0', '#111014', 4.5, ' stroke-linecap="round"') +
        `<circle cx="63" cy="64" r="3.200" fill="#111014"/><circle cx="77" cy="64" r="3.200" fill="#111014"/>`,
    );
    return magnet(
      'magnet-teen',
      'Teen birthday magnet',
      'מגנט ליום הולדת לנוער',
      [750, 1050, 26],
      {
        opening,
        window: (S) => S.shape(cornered(seen), 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="lilac" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d6c6ff"/><stop offset="1" stop-color="#b094ff"/></linearGradient>` +
            `<pattern id="plus" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M25 17v16M17 25h16" fill="none" stroke="#8f6ff0" stroke-width="4" stroke-linecap="round"/></pattern>` +
            `<pattern id="check" width="44" height="44" patternUnits="userSpaceOnUse"><rect width="22" height="22" fill="#111014"/><rect x="22" y="22" width="22" height="22" fill="#111014"/></pattern>`,
          body:
            ground(S, 'url(#lilac)') +
            onBorder(
              S.whole('fill="url(#plus)"'),
              S.pin(`<circle cx="706" cy="52" r="150" fill="#c8ff3e"/>`, [706, 52], {
                x: 'end',
                y: 'start',
              }),
              // A strip of checks along the foot, as many as the card is wide.
              S.pin(
                `<rect x="-4000" y="1006" width="8750" height="44" fill="url(#check)"/>`,
                [0, 1006],
                {
                  x: 'start',
                  y: 'end',
                },
              ),
              S.shape(cornered(paper, 12, 14), 'fill="#111014"'),
              S.shape(cornered(paper), 'fill="#ffffff"'),
            ),
        }),
        extras: [
          sticker(smiley, 20, 26, 156, { turn: -12 }),
          sticker(bolt, 600, 20, 122, { turn: 10 }),
          sticker(flower, 12, 548, 118, { turn: -10 }),
          sticker(heart, 600, 640, 132, { turn: 14 }),
          label(
            strip('bd-teen-strip-lime', 470, '#c8ff3e', '#111014'),
            30,
            792,
            [
              caption(
                16,
                4,
                424,
                88,
                { text: 'יום הולדת 15', font: 'Karantina', size: 76, weight: 700 },
                { text: '15TH BIRTHDAY', font: 'Karantina', size: 76, weight: 700 },
                { color: '#111014' },
              ),
            ],
            { turn: -5 },
          ),
          label(
            strip('bd-teen-strip-black', 330, '#111014', '#c8ff3e'),
            150,
            894,
            [
              caption(
                16,
                4,
                284,
                88,
                { text: 'רוני חוגגת', font: 'Karantina', size: 70, weight: 700 },
                { text: 'RONI’S DAY', font: 'Karantina', size: 70, weight: 700 },
                { color: '#c8ff3e' },
              ),
            ],
            { turn: -5 },
          ),
          sticker(cutStar, 566, 846, 160, { turn: 12 }),
        ],
      },
      {
        en: 'event party teenager youth stickers cool lilac lime fifteen sixteen',
        he: 'אירוע יום הולדת יומולדת מסיבה נוער נער נערה מדבקות לילך ליים צעיר צעירה בת בן',
      },
    );
  }

  /* ---- the eighteenth: a column of night at the right, the age in neon, glasses that clink */
  function eighteen() {
    const opening = box(36, 36, 700, 678);
    const glass = 'M-20 0-14 68Q0 86 14 68L20 0ZM0 80V126M-19 128H19M-16 30H16';
    const cheers = art(
      'bd-neon-cheers',
      220,
      216,
      '',
      `<g transform="translate(91 64) rotate(20)">${neon(glass, '#ff4fb0', 4)}</g>` +
        `<g transform="translate(129 64) rotate(-20)">${neon(glass, '#3df2ff', 4)}</g>` +
        neon('M110 46V20M92 50 78 30M128 50l14-20', '#ffe45c', 3.4) +
        `<g fill="#ffe45c"><circle cx="58" cy="26" r="3.400"/><circle cx="164" cy="22" r="3"/><circle cx="110" cy="6" r="3"/></g>`,
    );
    // The sign under the age: a pill of neon for the shout, and a short tube under the line of
    // words below it. One label, so the two lines stay together at any size of the card.
    const pill = (attrs) => `<rect x="28" y="8" width="220" height="56" rx="28" ${attrs}/>`;
    const sign = art(
      'bd-sign-neon',
      276,
      138,
      '',
      pill('fill="#0c1136"') +
        ['.1 16', '.24 9', '1 3.200']
          .map((look) => {
            const [opacity, width] = look.split(' ');
            return pill(
              `fill="none" stroke="#3df2ff" stroke-opacity="${opacity}" stroke-width="${width}"`,
            );
          })
          .join('') +
        pill('fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width="1"') +
        neon('M106 128H170', '#ff4fb0', 3),
    );
    /** A tube of neon around the photograph, `by` away from it. */
    const tube = (S, by, radius, colour, width) =>
      frameLine(S, by, radius, colour, width * 4.6, ' stroke-opacity=".1"') +
      frameLine(S, by, radius, colour, width * 2.6, ' stroke-opacity=".22"') +
      frameLine(S, by, radius, colour, width) +
      frameLine(S, by, radius, '#ffffff', width * 0.32, ' stroke-opacity=".85"');
    return magnet(
      'magnet-eighteen',
      'Eighteenth birthday magnet',
      'מגנט ליום הולדת 18',
      [1050, 750, 24],
      {
        opening,
        round: 16,
        draw: (S) => ({
          defs:
            `<linearGradient id="night" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#161d5c"/><stop offset="1" stop-color="#060820"/></linearGradient>` +
            `<radialGradient id="pink"><stop stop-color="#ff3ea5" stop-opacity=".5"/><stop offset="1" stop-color="#ff3ea5" stop-opacity="0"/></radialGradient>` +
            `<radialGradient id="cyan"><stop stop-color="#1ee3f7" stop-opacity=".34"/><stop offset="1" stop-color="#1ee3f7" stop-opacity="0"/></radialGradient>` +
            `<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.500" fill="#ffffff" fill-opacity=".16"/></pattern>`,
          body:
            ground(S, 'url(#night)') +
            onBorder(
              S.box(box(752, 0, 298, 750), 0, 'fill="url(#dots)"'),
              // The light of the age on the wall behind it, and of the glasses at the foot.
              S.pin(`<circle cx="895" cy="184" r="230" fill="url(#pink)"/>`, [895, 184], {
                x: 'end',
                y: 'start',
              }),
              S.pin(`<circle cx="895" cy="630" r="190" fill="url(#cyan)"/>`, [895, 630], {
                x: 'end',
                y: 'end',
              }),
              tube(S, 9, 24, '#3df2ff', 3.4),
              S.pin(neon('M17 110V42Q17 17 42 17H110', '#ff4fb0', 3.4), [17, 17], {
                x: 'start',
                y: 'start',
              }),
              S.pin(neon('M755 640V708Q755 733 730 733H662', '#ff4fb0', 3.4), [755, 733], {
                x: 'end',
                y: 'end',
              }),
            ),
        }),
        extras: [
          caption(
            752,
            8,
            286,
            350,
            { text: '18', font: 'Karantina', size: 300, weight: 700 },
            { text: '18', font: 'Karantina', size: 300, weight: 700 },
            { color: '#ff5cb8' },
          ),
          label(
            sign,
            757,
            344,
            [
              caption(
                44,
                14,
                188,
                44,
                { text: 'סוף סוף!', font: 'Rubik', size: 34, weight: 800 },
                { text: 'FINALLY!', font: 'Space Grotesk', size: 30, weight: 700, spacing: 3 },
                { color: '#8df8ff' },
              ),
              caption(
                0,
                78,
                276,
                40,
                { text: 'הלילה של עומר', font: 'Heebo', size: 28, weight: 600 },
                { text: 'OMER’S BIG NIGHT', font: 'Poppins', size: 20, weight: 600, spacing: 2 },
                { color: '#ffffff' },
              ),
            ],
            { turn: -6 },
          ),
          sticker(cheers, 785, 502, 220),
        ],
      },
      {
        en: 'event party eighteen 18 adult neon night toast cheers coming of age',
        he: 'אירוע יום הולדת יומולדת מסיבה שמונה עשרה 18 בגרות ניאון לילה לחיים כוסות צעיר צעירה',
      },
    );
  }

  /* ---- the thirtieth: an arch on cream, a block of terracotta behind it, type set to the left */
  function thirty() {
    const opening = box(84, 60, 582, 690);
    /** Where the round part of the arch ends and its foot begins, from the foot of the card. */
    const FOOT = 330;
    /** An arch around the photograph, `by` away from it, as the arch of the wedding is built. */
    const arch = (S, by, attrs) => {
      const around = inset(opening, -by);
      const tall = S.geometry({ ...around, h: around.h + 2 * S.h });
      return (
        `<rect ${attrs} clip-path="url(#above)" style="${tall};rx:calc(50% - ${f(around.x)}px)"/>` +
        `<rect ${attrs} clip-path="url(#foot)" style="${S.geometry(around)}"/>`
      );
    };
    const seal = art(
      'bd-seal-thirty',
      164,
      164,
      '',
      `<circle cx="82" cy="82" r="80" fill="#1d1b19"/>` +
        `<circle cx="82" cy="82" r="71" fill="none" stroke="#f3eadb" stroke-width="1.600"/>` +
        `<circle cx="82" cy="82" r="75.500" fill="none" stroke="#d98a5f" stroke-width="2.400" stroke-dasharray=".1 7.900" stroke-linecap="round"/>` +
        `<path d="${sparkle(82, 27, 8, 0.3)}" fill="#d98a5f"/><path d="${sparkle(82, 137, 8, 0.3)}" fill="#d98a5f"/>`,
    );
    return magnet(
      'magnet-thirty',
      'Thirtieth birthday magnet',
      'מגנט ליום הולדת 30',
      [750, 1050, 22],
      {
        opening,
        window: (S) => arch(S, -1, 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f6eee0"/><stop offset="1" stop-color="#efe3d0"/></linearGradient>` +
            `<clipPath id="above"><rect width="100%" style="height:calc(100% - ${FOOT - 1}px)"/></clipPath>` +
            `<clipPath id="foot"><rect width="100%" height="100%" style="y:calc(100% - ${FOOT}px)"/></clipPath>`,
          body:
            ground(S, 'url(#paper)') +
            onBorder(
              // A sun behind the shoulder of the arch, and the arch again in terracotta, a step away.
              S.pin(`<circle cx="96" cy="100" r="86" fill="#ecc3a6"/>`, [96, 100], {
                x: 'start',
                y: 'start',
              }),
              `<g transform="translate(16 14)">${arch(S, 0, 'fill="#c8643c"')}</g>`,
              S.pin(line('M70 921H178', '#1d1b19', 2.4), [70, 921], { x: 'start', y: 'end' }),
              S.pin(`<circle cx="186" cy="921" r="4" fill="#c8643c"/>`, [186, 921], {
                x: 'start',
                y: 'end',
              }),
            ) +
            arch(S, 0, 'fill="none" stroke="#1d1b19" stroke-width="2.400"'),
        }),
        extras: [
          sticker(picture('birthdays-botanic-1'), 480, 700, 254),
          label(
            seal,
            512,
            62,
            [
              caption(
                22,
                36,
                120,
                92,
                { text: '30', font: 'DM Serif Display', size: 80 },
                { text: '30', font: 'DM Serif Display', size: 80 },
                { color: '#f6eee0' },
              ),
            ],
            { turn: -8 },
          ),
          caption(
            66,
            754,
            480,
            104,
            { text: 'שלושים,', font: 'Frank Ruhl Libre', size: 90, weight: 900 },
            { text: 'Thirty,', font: 'Playfair Display', size: 88, weight: 800 },
            { color: '#1d1b19', align: 'left' },
          ),
          caption(
            68,
            858,
            480,
            54,
            { text: 'וזה רק מתחיל', font: 'Frank Ruhl Libre', size: 46, weight: 500 },
            {
              text: 'and just getting started',
              font: 'Playfair Display',
              size: 36,
              weight: 500,
              italic: true,
            },
            { color: '#a34724', align: 'left' },
          ),
          caption(
            68,
            930,
            620,
            46,
            { text: 'חוגגים את טל', font: 'Heebo', size: 32, weight: 800, spacing: 2 },
            { text: 'CELEBRATING TAL', font: 'Montserrat', size: 28, weight: 700, spacing: 5 },
            { color: '#1d1b19', align: 'left' },
          ),
          caption(
            68,
            976,
            620,
            42,
            {
              text: 'ארוחת ערב · חברים · יין טוב',
              font: 'Heebo',
              size: 28,
              weight: 400,
              spacing: 1,
            },
            {
              text: 'DINNER · FRIENDS · GOOD WINE',
              font: 'Montserrat',
              size: 28,
              weight: 400,
              spacing: 1,
            },
            { color: '#5c5247', align: 'left' },
          ),
        ],
      },
      {
        en: 'event party thirty 30 arch boho terracotta dried flowers editorial dinner',
        he: 'אירוע יום הולדת יומולדת מסיבה שלושים 30 קשת בוהו טרקוטה פרחים מיובשים ארוחה חברים',
      },
    );
  }

  /* ---- the fortieth: a column of black at the left, the age in gold, balloons over the corner */
  function forty() {
    const opening = box(352, 34, 664, 682);
    const next = random(4040);
    const golds = ['#f6e3a1', '#e2b955', '#c8962e'];
    // Flecks of gold: sparks in the column and at its foot, and dust all over the card.
    const flecks = (S) =>
      scattered(next, 34, 1050, 750, [inset(opening, -14), box(24, 96, 304, 470)], 34, 16)
        .map(([x, y]) =>
          S.pin(
            `<path d="${sparkle(x, y, 4 + next() * 9)}" fill="${pick(next, golds)}" fill-opacity="${f(0.55 + next() * 0.45)}"/>`,
            [x, y],
          ),
        )
        .join('') +
      scattered(next, 56, 1050, 750, [inset(opening, -6)], 20, 10)
        .map(([x, y]) =>
          S.pin(
            `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + next() * 1.8)}" fill="${pick(next, golds)}" fill-opacity="${f(0.35 + next() * 0.55)}"/>`,
            [x, y],
          ),
        )
        .join('');
    // The age and what it says of her, set between rules of gold: a rule with a jewel under the
    // age, and a short one that closes the lines. One label, so "40 and fabulous" stays one
    // phrase when the card is made taller.
    const lockup = art(
      'bd-gold-lockup',
      320,
      430,
      '',
      line('M64 282H138M182 282H256', '#e2b955', 1.8, ' stroke-linecap="round"') +
        `<path d="${sparkle(160, 282, 10, 0.3)}" fill="#f6e3a1"/><circle cx="138" cy="282" r="2.600" fill="#e2b955"/><circle cx="182" cy="282" r="2.600" fill="#e2b955"/>` +
        line('M126 418H194', '#e2b955', 1.4, ' stroke-linecap="round" stroke-opacity=".8"'),
    );
    return magnet(
      'magnet-forty',
      'Fortieth birthday magnet',
      'מגנט ליום הולדת 40',
      [1050, 750, 22],
      {
        opening,
        round: 12,
        draw: (S) => ({
          defs:
            `<linearGradient id="black" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1c1813"/><stop offset="1" stop-color="#0a0908"/></linearGradient>` +
            `<radialGradient id="warm"><stop stop-color="#8a6420" stop-opacity=".5"/><stop offset="1" stop-color="#8a6420" stop-opacity="0"/></radialGradient>` +
            `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbeab0"/><stop offset=".5" stop-color="#d9ab45"/><stop offset="1" stop-color="#f6dc93"/></linearGradient>`,
          body:
            ground(S, 'url(#black)') +
            onBorder(
              S.pin(`<circle cx="60" cy="720" r="330" fill="url(#warm)"/>`, [60, 720], {
                x: 'start',
                y: 'end',
              }),
              flecks(S),
            ) +
            S.outline(box(12, 12, 1026, 726), 12, 1.4, 'stroke="url(#gold)" stroke-opacity=".8"') +
            frameLine(S, 9, 20, 'url(#gold)', 1.3) +
            frameLine(S, 0, 12, 'url(#gold)', 4),
        }),
        extras: [
          label(lockup, 16, 94, [
            caption(
              0,
              0,
              320,
              270,
              { text: '40', font: 'DM Serif Display', size: 232 },
              { text: '40', font: 'DM Serif Display', size: 232 },
              { color: '#e8c66a' },
            ),
            caption(
              8,
              298,
              304,
              60,
              { text: 'ומהממת', font: 'Frank Ruhl Libre', size: 48, weight: 700, spacing: 2 },
              { text: '& FABULOUS', font: 'Playfair Display', size: 34, weight: 700, spacing: 3 },
              { color: '#f6ecd2' },
            ),
            caption(
              8,
              364,
              304,
              40,
              { text: 'ליאת חוגגת יום הולדת', font: 'Heebo', size: 25, weight: 500, spacing: 1 },
              { text: 'A NIGHT FOR LIAT', font: 'Montserrat', size: 20, weight: 600, spacing: 4 },
              { color: '#d9b65c' },
            ),
          ]),
          sticker(picture('birthdays-party-4'), 812, 8, 226),
        ],
      },
      {
        en: 'event party forty 40 black gold glamorous elegant balloons fabulous',
        he: 'אירוע יום הולדת יומולדת מסיבה ארבעים 40 שחור זהב נוצץ אלגנטי יוקרתי בלונים',
      },
    );
  }

  /* ---- the fiftieth: deep green and gold, a seal between laurels above, a plaque below */
  function fifty() {
    const opening = box(52, 88, 946, 554);
    // A sprig of laurel from the seal outwards: leaves in pairs along a stem, smaller to its tip.
    const sprig = (() => {
      const [p0, p1, p2] = [
        [186, 70],
        [108, 92],
        [22, 26],
      ];
      const at = (t) =>
        [0, 1].map((k) => (1 - t) ** 2 * p0[k] + 2 * t * (1 - t) * p1[k] + t * t * p2[k]);
      const way = (t) => {
        const [dx, dy] = [0, 1].map((k) => 2 * (1 - t) * (p1[k] - p0[k]) + 2 * t * (p2[k] - p1[k]));
        return (Math.atan2(dy, dx) * 180) / Math.PI;
      };
      const leaf = ([x, y], turn, long) =>
        `<path transform="translate(${f(x)} ${f(y)}) rotate(${f(turn)})" d="M0 0Q${f(long / 2)} ${f(-long * 0.36)} ${long} 0Q${f(long / 2)} ${f(long * 0.36)} 0 0Z"/>`;
      const leaves = Array.from({ length: 8 }, (_, i) => {
        const t = 0.14 + i * 0.112;
        const long = 36 - i * 2;
        return leaf(at(t), way(t) - 36, long) + leaf(at(t), way(t) + 36, long);
      }).join('');
      return (
        line(
          `M${p0.join(' ')}Q${p1.join(' ')} ${p2.join(' ')}`,
          '#e2b955',
          2.6,
          ' stroke-linecap="round"',
        ) + `<g fill="url(#gold)">${leaves}${leaf(at(0.97), way(1), 22)}</g>`
      );
    })();
    const GOLD = `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbeab0"/><stop offset=".5" stop-color="#d4a640"/><stop offset="1" stop-color="#f6dc93"/></linearGradient>`;
    const crest = art(
      'bd-crest-fifty',
      500,
      152,
      GOLD +
        `<radialGradient id="face" cx=".4" cy=".3" r=".9"><stop stop-color="#1c5a48"/><stop offset="1" stop-color="#0b2e25"/></radialGradient>`,
      sprig +
        `<g transform="translate(500 0) scale(-1 1)">${sprig}</g>` +
        `<circle cx="250" cy="80" r="70" fill="url(#gold)"/><circle cx="250" cy="80" r="64" fill="url(#face)"/>` +
        `<circle cx="250" cy="80" r="55" fill="none" stroke="url(#gold)" stroke-width="1.600"/>` +
        beads(250, 80, 59.5, 40, 1.4, 'fill="#f6dc93"'),
    );
    // The plaque: cream, its corners bitten out, two rims of gold.
    const plate = (x, y, w, h, bite) =>
      `M${x + bite} ${y}H${x + w - bite}A${bite} ${bite} 0 0 0 ${x + w} ${y + bite}V${y + h - bite}A${bite} ${bite} 0 0 0 ${x + w - bite} ${y + h}H${x + bite}A${bite} ${bite} 0 0 0 ${x} ${y + h - bite}V${y + bite}A${bite} ${bite} 0 0 0 ${x + bite} ${y}Z`;
    const plaque = art(
      'bd-plaque-cream',
      664,
      132,
      GOLD +
        `<linearGradient id="cream" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffaf0"/><stop offset="1" stop-color="#f4e8cf"/></linearGradient>`,
      `<path d="${plate(2, 2, 660, 128, 16)}" fill="url(#gold)"/>` +
        `<path d="${plate(7, 7, 650, 118, 14)}" fill="url(#cream)"/>` +
        `<path d="${plate(13, 13, 638, 106, 12)}" fill="none" stroke="#c39a3c" stroke-width="1.300"/>` +
        `<path d="${sparkle(36, 66, 9, 0.3)}" fill="#c39a3c"/><path d="${sparkle(628, 66, 9, 0.3)}" fill="#c39a3c"/>`,
    );
    // A flourish in each corner of the card: two arcs and a bead.
    const flourish = (S, x, y, sx, sy) =>
      S.pin(
        `<g transform="translate(${x} ${y}) scale(${sx} ${sy})" fill="none" stroke="url(#gold)" stroke-width="1.500" stroke-linecap="round"><path d="M0 34V10Q0 0 10 0H34"/><path d="M8 26V14Q8 8 14 8H26"/><circle cx="17" cy="17" r="2" fill="#f6dc93" stroke="none"/></g>`,
        [x, y],
      );
    return magnet(
      'magnet-fifty',
      'Fiftieth birthday magnet',
      'מגנט ליום הולדת 50',
      [1050, 750, 20],
      {
        opening,
        round: 8,
        draw: (S) => ({
          defs:
            GOLD +
            `<linearGradient id="green" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#16503f"/><stop offset="1" stop-color="#0a2b22"/></linearGradient>` +
            `<pattern id="lattice" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M17 0 34 17 17 34 0 17Z" fill="none" stroke="#e2b955" stroke-opacity=".16" stroke-width="1"/><circle cx="17" cy="17" r="1.300" fill="#e2b955" fill-opacity=".3"/></pattern>`,
          body:
            ground(S, 'url(#green)') +
            onBorder(S.whole('fill="url(#lattice)"')) +
            S.outline(box(11, 11, 1028, 728), 11, 1.5, 'stroke="url(#gold)" stroke-opacity=".9"') +
            flourish(S, 20, 20, 1, 1) +
            flourish(S, 1030, 20, -1, 1) +
            flourish(S, 20, 730, 1, -1) +
            flourish(S, 1030, 730, -1, -1) +
            frameLine(S, 9, 15, 'url(#gold)', 1.3) +
            frameLine(S, 0, 8, 'url(#gold)', 4.5),
        }),
        extras: [
          label(crest, 275, 4, [
            caption(
              195,
              38,
              110,
              84,
              { text: '50', font: 'DM Serif Display', size: 70 },
              { text: '50', font: 'DM Serif Display', size: 70 },
              { color: '#f6dc93' },
            ),
          ]),
          label(plaque, 193, 598, [
            caption(
              50,
              12,
              564,
              68,
              { text: 'חוגגים 50 לדני', font: 'Frank Ruhl Libre', size: 58, weight: 800 },
              { text: 'Celebrating Danny’s 50th', font: 'DM Serif Display', size: 42 },
              { color: '#123f33' },
            ),
            caption(
              50,
              82,
              564,
              36,
              { text: 'באהבה, מכל המשפחה', font: 'Heebo', size: 25, weight: 500, spacing: 2 },
              {
                text: 'WITH LOVE FROM THE WHOLE FAMILY',
                font: 'Montserrat',
                size: 20,
                weight: 600,
                spacing: 2,
              },
              { color: '#7a5a12' },
            ),
          ]),
        ],
      },
      {
        en: 'event party fifty 50 jubilee green gold classic laurel elegant',
        he: 'אירוע יום הולדת יומולדת מסיבה חמישים 50 יובל ירוק זהב קלאסי זר דפנה חגיגי',
      },
    );
  }

  /* ---- the sixtieth and up: a page of the album, corners that hold the print, a stamp */
  function sixty() {
    const opening = box(88, 190, 574, 586);
    const print = inset(opening, -16);
    const next = random(6060);
    // The fibres of the paper: one tile of short hairs, which the page repeats.
    const fibres = Array.from({ length: 26 }, () => {
      const [x, y, turn] = [next() * 160, next() * 160, next() * 180];
      return `<path d="M${f(x)} ${f(y)}q${f(4 + next() * 6)} ${f(next() * 4 - 2)} ${f(9 + next() * 9)} 0" transform="rotate(${f(turn)} ${f(x)} ${f(y)})"/>`;
    }).join('');
    // A corner that holds the print: a pocket of dark paper with a pressed line.
    const corner = art(
      'bd-photo-corner',
      84,
      84,
      '',
      `<path d="M0 0H84L0 84Z" fill="#2a231d"/><path d="M0 0H84L72 12H12V72L0 84Z" fill="#40352b"/>` +
        line('M16 58 58 16', '#d9c49a', 1.4, ' stroke-opacity=".55" stroke-linecap="round"') +
        line('M12 46 46 12', '#d9c49a', 1, ' stroke-opacity=".35" stroke-linecap="round"'),
    );
    // The stamp: a scalloped edge, a field of brick red, and the waves of the postmark over it.
    const stamp = art(
      'bd-stamp-age',
      262,
      206,
      '',
      `<rect x="100" y="12" width="150" height="182" fill="#fbf3df" stroke="#fbf3df" stroke-width="11" stroke-dasharray=".1 13.280" stroke-linecap="round"/>` +
        `<rect x="100" y="12" width="150" height="182" fill="#fbf3df"/>` +
        `<rect x="111" y="23" width="128" height="160" fill="#a8412c"/>` +
        `<rect x="117" y="29" width="116" height="148" fill="none" stroke="#fbf3df" stroke-opacity=".7" stroke-width="1.400"/>` +
        `<g fill="none" stroke="#3b332b" stroke-opacity=".62" stroke-width="2.600" stroke-linecap="round">` +
        `<path d="M4 58q14-12 28 0t28 0 28 0 28 0 28 0"/><path d="M4 78q14-12 28 0t28 0 28 0 28 0 28 0"/><path d="M4 98q14-12 28 0t28 0 28 0 28 0 28 0"/><path d="M4 118q14-12 28 0t28 0 28 0 28 0 28 0"/>` +
        `<path d="M52 160a40 40 0 0 1 72-28" /><path d="M60 162a31 31 0 0 1 56-22"/></g>`,
    );
    return magnet(
      'magnet-sixty',
      'Sixtieth birthday magnet',
      'מגנט ליום הולדת 60 ומעלה',
      [750, 1050, 18],
      {
        opening,
        round: 3,
        draw: (S) => ({
          defs:
            `<linearGradient id="page" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4ead3"/><stop offset="1" stop-color="#e9dabb"/></linearGradient>` +
            `<radialGradient id="aged" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#a07a3c" stop-opacity="0"/><stop offset="1" stop-color="#a07a3c" stop-opacity=".3"/></radialGradient>` +
            `<pattern id="fibres" width="160" height="160" patternUnits="userSpaceOnUse"><g fill="none" stroke="#8a6a3a" stroke-opacity=".15" stroke-width="1" stroke-linecap="round">${fibres}</g></pattern>`,
          body:
            ground(S, 'url(#page)') +
            onBorder(
              S.whole('fill="url(#fibres)"'),
              S.whole('fill="url(#aged)"'),
              S.outline(box(22, 22, 706, 1006), 6, 1.4, 'stroke="#8a6a3a" stroke-opacity=".5"'),
              S.outline(box(29, 29, 692, 992), 3, 0.8, 'stroke="#8a6a3a" stroke-opacity=".4"'),
              // The print: white paper around the photograph, and the line of its edge.
              S.box(print, 2, 'fill="#fffdf8"'),
              S.outline(print, 2, 1.2, 'stroke="#6f5632" stroke-opacity=".4"'),
              // The lines the page leaves to write on, and the rule under its heading.
              S.pin(
                line(
                  'M70 884H470M70 956H470',
                  '#8a6a3a',
                  1.4,
                  ' stroke-opacity=".45" stroke-dasharray="1 7" stroke-linecap="round"',
                ),
                [70, 884],
                { x: 'start', y: 'end' },
              ),
              S.pin(
                line('M70 134H292', '#8a6a3a', 1.4, ' stroke-opacity=".6"') +
                  `<path d="${sparkle(304, 134, 6, 0.3)}" fill="#8a6a3a" fill-opacity=".7"/>`,
                [70, 134],
                { x: 'start', y: 'start' },
              ),
            ),
        }),
        extras: [
          sticker(corner, 64, 166, 84),
          sticker(corner, 602, 166, 84, { turn: 90 }),
          sticker(corner, 602, 716, 84, { turn: 180 }),
          sticker(corner, 64, 716, 84, { turn: 270 }),
          sticker(picture('birthdays-botanic-2'), 520, 776, 216, { turn: 8 }),
          label(
            stamp,
            334,
            34,
            [
              caption(
                111,
                24,
                128,
                98,
                { text: '60', font: 'DM Serif Display', size: 84 },
                { text: '60', font: 'DM Serif Display', size: 84 },
                { color: '#fbf3df' },
              ),
              caption(
                111,
                134,
                128,
                44,
                { text: 'שנה', font: 'Frank Ruhl Libre', size: 32, weight: 700, spacing: 3 },
                { text: 'YEARS', font: 'Playfair Display', size: 28, weight: 700, spacing: 2 },
                { color: '#fbf3df' },
              ),
            ],
            { turn: 7 },
          ),
          caption(
            70,
            84,
            290,
            44,
            { text: 'אלבום המשפחה', font: 'David Libre', size: 30, weight: 500, spacing: 2 },
            { text: 'FAMILY ALBUM', font: 'Playfair Display', size: 28, weight: 500, spacing: 3 },
            { color: '#6b5433', align: 'left' },
          ),
          caption(
            66,
            812,
            480,
            74,
            { text: 'עד מאה ועשרים,', font: 'David Libre', size: 60, weight: 700 },
            {
              text: 'Many happy returns,',
              font: 'Playfair Display',
              size: 42,
              weight: 700,
              italic: true,
            },
            { color: '#3a2f25', align: 'left' },
          ),
          caption(
            66,
            886,
            480,
            72,
            { text: 'סבתא רחל', font: 'David Libre', size: 60, weight: 700 },
            {
              text: 'Grandma Rachel',
              font: 'Playfair Display',
              size: 48,
              weight: 700,
              italic: true,
            },
            { color: '#3a2f25', align: 'left' },
          ),
          caption(
            68,
            962,
            480,
            48,
            { text: 'באהבה, כל הנכדים', font: 'David Libre', size: 34, weight: 500 },
            {
              text: 'Love, all your grandchildren',
              font: 'Playfair Display',
              size: 28,
              weight: 500,
            },
            { color: '#8a3a26', align: 'left' },
          ),
        ],
      },
      {
        en: 'event party sixty seventy eighty 60 70 80 grandma grandpa album vintage stamp pressed flowers',
        he: 'אירוע יום הולדת יומולדת מסיבה שישים שבעים שמונים 60 70 80 סבתא סבא אלבום וינטג׳ בול פרחים מיובשים',
      },
    );
  }

  /* ---- a surprise party: dots of a comic on yellow, a burst that shouts, poppers that fire */
  function surprise() {
    const opening = box(42, 64, 966, 568);
    const next = random(999);
    // The rays of the shout are not alike: every other one is a little shorter.
    const reach = Array.from({ length: 16 }, (_, i) => (i % 2 ? 0.86 + next() * 0.06 : 1));
    const shout = (cx, cy, rx, ry) => burst(cx, cy, 16, rx, ry, 0.7, 6, (i) => reach[i]);
    const boom = art(
      'bd-burst-shout',
      316,
      228,
      '',
      `<path d="${shout(163, 119, 148, 104)}" fill="#111111"/>` +
        `<path d="${shout(154, 110, 148, 104)}" fill="#ffffff" stroke="#111111" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="${shout(154, 110, 133, 91)}" fill="#e5202a" stroke="#111111" stroke-width="4" stroke-linejoin="round"/>`,
    );
    const strip = art(
      'bd-strip-comic',
      470,
      96,
      '',
      `<path d="M26 14H470L452 96H8Z" fill="#e5202a"/>` +
        `<path d="M19 4H461L443 84H2Z" fill="#111111" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>`,
    );
    /** The dots of a print that fade away from a corner of the card. */
    const halftone = (S, cx, cy, sx, sy, ties) =>
      S.pin(
        `<g fill="#111111">${Array.from({ length: 40 }, (_, i) => {
          const [col, row] = [i % 8, Math.floor(i / 8)];
          const r = 9.5 - (col + row * 1.5) * 1.05;
          return r > 0.8
            ? `<circle cx="${cx + sx * (12 + col * 24 + (row % 2) * 12)}" cy="${cy + sy * (12 + row * 21)}" r="${f(r)}"/>`
            : '';
        }).join('')}</g>`,
        [cx, cy],
        ties,
      );
    return magnet(
      'magnet-surprise',
      'Surprise party magnet',
      'מגנט למסיבת הפתעה',
      [1050, 750, 26],
      {
        opening,
        round: 14,
        draw: (S) => ({
          defs:
            `<pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="10" cy="10" r="4.200" fill="#ff9f0a" fill-opacity=".55"/></pattern>` +
            `<linearGradient id="fade" x1="0" y1="0" x2="1" y2="1"><stop offset=".15" stop-color="#ffd60a"/><stop offset=".7" stop-color="#ffd60a" stop-opacity="0"/></linearGradient>`,
          body:
            ground(S, '#ffd60a') +
            onBorder(
              S.whole('fill="url(#dots)"'),
              S.whole('fill="url(#fade)"'),
              halftone(S, 1050, 0, -1, 1, { x: 'end', y: 'start' }),
              halftone(S, 0, 750, 1, -1, { x: 'start', y: 'end' }),
            ) +
            frameLine(S, 4, 18, '#111111', 9) +
            frameLine(S, 0, 14, '#ffffff', 3),
        }),
        extras: [
          sticker(picture('birthdays-party-3'), 12, 524, 206),
          label(
            strip,
            404,
            640,
            [
              caption(
                32,
                12,
                400,
                64,
                { text: 'לא ציפית לזה, אורי!', font: 'Rubik', size: 40, weight: 800 },
                {
                  text: 'Didn’t see it coming, Uri!',
                  font: 'Poppins',
                  size: 26,
                  weight: 800,
                  italic: true,
                },
                { color: '#ffd60a' },
              ),
            ],
            { turn: -3 },
          ),
          sticker(picture('birthdays-party-3'), 832, 524, 206, { flip: true }),
          label(
            boom,
            22,
            30,
            [
              caption(
                44,
                60,
                220,
                100,
                { text: 'הפתעה!', font: 'Karantina', size: 84, weight: 700 },
                { text: 'SURPRISE!', font: 'Karantina', size: 62, weight: 700 },
                { color: '#ffffff' },
              ),
            ],
            { turn: -10 },
          ),
        ],
      },
      {
        en: 'event party surprise birthday comic pop yellow red loud confetti poppers',
        he: 'אירוע יום הולדת יומולדת מסיבה הפתעה קומיקס צהוב אדום קונפטי חגיגה מזל טוב',
      },
    );
  }

  /* ---- a birthday in the garden: a print with a garland behind it, lights above, a tag */
  function garden() {
    const opening = box(56, 136, 938, 484);
    const print = box(30, 110, 990, 626);
    // The lights: a wire in three sags, and bulbs that hang from it, each in its own glow.
    const sags = [
      [
        [6, 14],
        [172, 96],
        [338, 28],
      ],
      [
        [338, 28],
        [505, 104],
        [672, 28],
      ],
      [
        [672, 28],
        [838, 96],
        [1004, 14],
      ],
    ];
    const bulbs = sags
      .flatMap(([p0, p1, p2]) =>
        [0.14, 0.32, 0.5, 0.68, 0.86].map((t) =>
          [0, 1].map((k) => (1 - t) ** 2 * p0[k] + 2 * t * (1 - t) * p1[k] + t * t * p2[k]),
        ),
      )
      .map(
        ([x, y], i) =>
          `<g transform="translate(${f(x)} ${f(y)}) rotate(${[-7, 5, -3, 8, -5][i % 5]})"><circle cy="19" r="24" fill="url(#glow)"/>` +
          `<rect x="-5" y="1" width="10" height="9" rx="2" fill="#5d6b57"/><path d="M-9 20C-9 13-5.500 10 0 10S9 13 9 20 4.500 33 0 33-9 27-9 20Z" fill="url(#bulb)"/>` +
          `<path d="M-4.500 18c0-3 1.500-4.500 3.500-5" fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width="1.600" stroke-linecap="round"/></g>`,
      )
      .join('');
    const lights = art(
      'bd-string-lights',
      1010,
      104,
      `<radialGradient id="glow"><stop stop-color="#ffe9a8" stop-opacity=".75"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>` +
        `<linearGradient id="bulb" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff6d6"/><stop offset="1" stop-color="#ffc861"/></linearGradient>`,
      line(
        `M${sags.map(([p0, p1, p2], i) => `${i ? '' : p0.join(' ')}Q${p1.join(' ')} ${p2.join(' ')}`).join('')}`,
        '#4d5a48',
        2.6,
        ' stroke-linecap="round"',
      ) + bulbs,
    );
    // The tag: paper with a point and an eyelet, on a loop of twine from a pin. The pin stands on
    // the edge of the print, so the tag hangs from the print at any size of the card.
    const tag = art(
      'bd-tag-garden',
      212,
      226,
      `<linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffaf0"/><stop offset="1" stop-color="#f2e6cf"/></linearGradient>` +
        `<radialGradient id="pin" cx=".35" cy=".3" r=".8"><stop stop-color="#e79a78"/><stop offset="1" stop-color="#b5532d"/></radialGradient>`,
      `<path d="M106 38 190 80V208a10 10 0 0 1-10 10H32a10 10 0 0 1-10-10V80Z" fill="url(#card)" stroke="#c96f4a" stroke-width="2"/>` +
        `<path d="M106 52 178 88V200a6 6 0 0 1-6 6H40a6 6 0 0 1-6-6V88Z" fill="none" stroke="#c96f4a" stroke-width="1.300" stroke-dasharray="5 5"/>` +
        `<circle cx="106" cy="70" r="9" fill="#c96f4a"/><circle cx="106" cy="70" r="4.500" fill="#5d6b57"/>` +
        line(
          'M106 70C95 52 97 30 106 13M106 70C117 52 115 30 106 13',
          '#8a6a4a',
          2.2,
          ' stroke-linecap="round"',
        ) +
        `<circle cx="106" cy="12" r="9.500" fill="url(#pin)"/><circle cx="103" cy="9" r="2.600" fill="#ffffff" fill-opacity=".6"/>`,
    );
    return magnet(
      'magnet-birthday-garden',
      'Garden birthday magnet',
      'מגנט ליום הולדת בגינה',
      [1050, 750, 0],
      {
        opening,
        round: 8,
        card: (S) => S.box(print, 14, 'fill="#fff"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="cream" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fbf6ea"/><stop offset="1" stop-color="#f1e8d4"/></linearGradient>` +
            `<radialGradient id="sage" cx="0" cy="1" r=".6"><stop stop-color="#b9c9ad" stop-opacity=".8"/><stop offset="1" stop-color="#b9c9ad" stop-opacity="0"/></radialGradient>` +
            `<radialGradient id="clay" cx="1" cy="1" r=".5"><stop stop-color="#e8b79c" stop-opacity=".6"/><stop offset="1" stop-color="#e8b79c" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, 'url(#cream)') +
            onBorder(S.whole('fill="url(#sage)"'), S.whole('fill="url(#clay)"')) +
            frameLine(S, 8, 14, '#8fa283', 1.6) +
            frameLine(S, 0, 8, '#ffffff', 5),
        }),
        extras: [
          // Upside down, the garland arches over the print, and its flowers stand above the edge.
          // It starts a unit below the top: a half turn leaves a rounding error at the very edge.
          sticker(picture('birthdays-garland'), 75, 1, 900, { turn: 180, under: true }),
          sticker(lights, 20, 4, 1010),
          sticker(picture('birthdays-botanic-3'), 4, 550, 196),
          sticker(picture('birthdays-botanic-4'), 836, 546, 206),
          label(
            tag,
            796,
            106,
            [
              caption(
                22,
                88,
                168,
                34,
                { text: 'מזל טוב', font: 'Heebo', size: 24, weight: 600, spacing: 2 },
                {
                  text: 'happy birthday',
                  font: 'Playfair Display',
                  size: 20,
                  weight: 500,
                  italic: true,
                },
                { color: '#55664d' },
              ),
              caption(
                26,
                134,
                160,
                76,
                { text: 'שירה', font: 'Frank Ruhl Libre', size: 62, weight: 800 },
                { text: 'Shira', font: 'Playfair Display', size: 52, weight: 700, italic: true },
                { color: '#b5532d' },
              ),
            ],
            { turn: 5 },
          ),
          caption(
            212,
            638,
            616,
            52,
            {
              text: 'חוגגים בגינה, עם כל מי שאוהבים',
              font: 'Frank Ruhl Libre',
              size: 40,
              weight: 700,
            },
            {
              text: 'A garden party with everyone we love',
              font: 'Playfair Display',
              size: 31,
              weight: 600,
              italic: true,
            },
            { color: '#4d5f47' },
          ),
          caption(
            212,
            690,
            616,
            36,
            { text: 'פרחים · אורות · עוגה', font: 'Heebo', size: 24, weight: 500, spacing: 3 },
            {
              text: 'FLOWERS · FAIRY LIGHTS · CAKE',
              font: 'Montserrat',
              size: 20,
              weight: 600,
              spacing: 4,
            },
            { color: '#9c4322' },
          ),
        ],
      },
      {
        en: 'event party garden outdoor picnic flowers fairy lights rustic greenery',
        he: 'אירוע יום הולדת יומולדת מסיבה גינה חצר טבע פיקניק פרחים אורות ירוק כפרי',
      },
    );
  }

  return [
    firstBirthday(),
    cakeDay(),
    teen(),
    eighteen(),
    thirty(),
    forty(),
    fifty(),
    sixty(),
    surprise(),
    garden(),
  ];
}
