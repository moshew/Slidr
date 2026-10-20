/*
 * Ten more magnets (`../frames-magnets.mjs`): four more holidays, which say their set (New
 * Year's Eve, a day of love, Christmas, Eid al-Fitr), and six styles with no event (a scrapbook
 * page, a front page, a postcard, a boarding pass, a record sleeve, a soft gradient).
 */

/** @param kit What a magnet is drawn with (`kit.mjs`). */
export default function more(kit) {
  const { random, box, inset, f } = kit;
  const { magnet, sticker, caption, label, art, picture, tile } = kit;
  const { ground, onBorder, line, frameLine, sparkle, star, scattered, pick } = kit;

  /** A heart around a point, `r` to each side of it and below it. */
  const heart = (cx, cy, r) => {
    const p = (x, y) => `${f(cx + x * r)} ${f(cy + y * r)}`;
    return (
      `M${p(0, -0.35)}C${p(-0.25, -0.85)} ${p(-1, -0.75)} ${p(-1, -0.2)}` +
      `C${p(-1, 0.3)} ${p(-0.45, 0.6)} ${p(0, 1)}C${p(0.45, 0.6)} ${p(1, 0.3)} ${p(1, -0.2)}` +
      `C${p(1, -0.75)} ${p(0.25, -0.85)} ${p(0, -0.35)}Z`
    );
  };

  /**
   * A strip across the whole card that keeps its height and goes with the foot of the card:
   * `body` is drawn in the coordinates of the card, from `y` down for `h`, and is stretched
   * sideways only.
   */
  const footStrip = (S, y, h, body) =>
    `<svg y="100%" overflow="visible"><svg y="${f(y - S.h)}" width="100%" height="${h}" viewBox="0 ${y} ${S.w} ${h}" preserveAspectRatio="none">${body}</svg></svg>`;

  const GOLD = `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0bf"/><stop offset=".45" stop-color="#e2b955"/><stop offset="1" stop-color="#b98a2a"/></linearGradient>`;

  /* ---- New Year's Eve: midnight on a clock over the photograph, fireworks, a bottle that pops */
  function newYear() {
    // The head of the card is tall enough to carry most of the clock: over a photograph with a
    // head framed high in the middle, a clock that reaches further in sits on that head.
    const opening = box(36, 100, 978, 500);
    const next = random(3112);
    /** A firework: rays around a point, long and short in turn, a spark beyond each. */
    const firework = (cx, cy, r, rays, colour, opacity) => {
      let drawn = '';
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * 2 * Math.PI + 0.2;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        const [near, far] = [r * 0.3, r * (i % 2 ? 0.7 : 1)];
        drawn +=
          `<path d="M${f(cx + near * c)} ${f(cy + near * s)}L${f(cx + far * c)} ${f(cy + far * s)}"/>` +
          `<circle cx="${f(cx + (far + 8) * c)}" cy="${f(cy + (far + 8) * s)}" r="${i % 2 ? 1.5 : 2.3}" fill="${colour}" stroke="none"/>`;
      }
      return `<g fill="none" stroke="${colour}" stroke-width="1.700" stroke-linecap="round" opacity="${opacity}">${drawn}</g>`;
    };
    // The fireworks go off behind the photograph: each with the side of the card it is at.
    const show = (S) =>
      [
        [148, 26, 92, 18, '#f0cf7a', 0.8, { x: 'start', y: 'start' }],
        [344, 46, 40, 12, '#fff3cf', 0.6, { x: 'start', y: 'start' }],
        [724, 30, 60, 16, '#f0cf7a', 0.7, { x: 'end', y: 'start' }],
        [1042, 318, 72, 16, '#fff3cf', 0.55, { x: 'end' }],
        [10, 300, 66, 16, '#f0cf7a', 0.6, { x: 'start' }],
        [336, 722, 54, 14, '#fff3cf', 0.5, { x: 'start', y: 'end' }],
      ]
        .map(([cx, cy, r, rays, colour, opacity, ties]) =>
          S.pin(firework(cx, cy, r, rays, colour, opacity), [cx, cy], ties),
        )
        .join('');
    const sparks = (S) =>
      scattered(
        next,
        50,
        1050,
        750,
        [inset(opening, -12), box(400, 600, 630, 140), box(440, 0, 170, 104)],
        30,
        14,
      )
        .map(([x, y]) =>
          S.pin(
            next() < 0.5
              ? `<path d="${sparkle(x, y, 4 + next() * 8)}" fill="#f3d98f" fill-opacity="${f(0.4 + next() * 0.6)}"/>`
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.2 + next() * 1.8)}" fill="#fff3cf" fill-opacity="${f(0.4 + next() * 0.5)}"/>`,
            [x, y],
          ),
        )
        .join('');
    // The face of a clock: sixty ticks, and both hands on twelve.
    const ticks = Array.from({ length: 60 }, (_, i) => {
      const a = (i * Math.PI) / 30;
      const [c, s] = [Math.sin(a), -Math.cos(a)];
      const hour = i % 5 === 0;
      const from = hour ? 63 : 69;
      return `<path d="M${f(90 + from * c)} ${f(90 + from * s)}L${f(90 + 75 * c)} ${f(90 + 75 * s)}" stroke-width="${hour ? 3 : 1.2}"/>`;
    }).join('');
    // Drawn 180 across and set 160 across on the card.
    const clock = art(
      'newyear-clock',
      160,
      160,
      GOLD +
        `<radialGradient id="face" cx=".5" cy=".35" r=".8"><stop stop-color="#22357a"/><stop offset="1" stop-color="#080e28"/></radialGradient>`,
      `<g transform="scale(${f(160 / 180)})"><circle cx="90" cy="90" r="88" fill="url(#gold)"/>` +
        `<circle cx="90" cy="90" r="80.500" fill="url(#face)"/>` +
        `<circle cx="90" cy="90" r="80.500" fill="none" stroke="#7a5a16" stroke-width="1.5"/>` +
        `<g stroke="#f0cf7a" stroke-linecap="round">${ticks}</g>` +
        `<path d="M90 94 84 62 90 36 96 62Z" fill="url(#gold)"/>` +
        line('M90 98V22', '#fff3cf', 2.6, ' stroke-linecap="round"') +
        `<circle cx="90" cy="90" r="6.500" fill="url(#gold)"/><circle cx="90" cy="90" r="2.200" fill="#080e28"/></g>`,
    );
    return magnet(
      'magnet-new-year',
      'New Year’s Eve magnet',
      'מגנט לערב השנה האזרחית',
      [1050, 750, 24],
      {
        set: 'holidays',
        opening,
        round: 16,
        draw: (S) => ({
          defs:
            GOLD +
            `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#14245a"/><stop offset="1" stop-color="#070c22"/></linearGradient>` +
            `<radialGradient id="glow" cx=".78" cy="1" r=".6"><stop stop-color="#3a4fae" stop-opacity=".6"/><stop offset="1" stop-color="#3a4fae" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, 'url(#night)') +
            onBorder(S.whole('fill="url(#glow)"'), show(S), sparks(S)) +
            S.outline(box(12, 12, 1026, 726), 14, 1.4, 'stroke="url(#gold)" stroke-opacity=".7"') +
            frameLine(S, 0, 16, 'url(#gold)', 4) +
            frameLine(S, 9, 25, '#f0cf7a', 1.2, ' stroke-opacity=".7"'),
        }),
        extras: [
          sticker(picture('more-nye-3'), 848, 8, 194),
          sticker(picture('more-nye-1'), 12, 500, 256),
          label(clock, 445, 4, [
            caption(
              23,
              91,
              114,
              36,
              { text: '00:00', font: 'Space Grotesk', size: 28, weight: 600, spacing: 1 },
              { text: '00:00', font: 'Space Grotesk', size: 28, weight: 600, spacing: 1 },
              { color: '#fff3cf' },
            ),
          ]),
          caption(
            320,
            604,
            694,
            86,
            { text: 'שנה אזרחית טובה', font: 'Frank Ruhl Libre', size: 72, weight: 700 },
            {
              text: 'Happy New Year',
              font: 'Playfair Display',
              size: 68,
              weight: 700,
              italic: true,
            },
            { color: '#f3d98f', align: 'right' },
          ),
          caption(
            320,
            692,
            692,
            40,
            { text: 'לחיים ולהתחלות חדשות', font: 'Heebo', size: 27, weight: 400, spacing: 3 },
            {
              text: 'CHEERS TO NEW BEGINNINGS',
              font: 'Montserrat',
              size: 21,
              weight: 500,
              spacing: 5,
            },
            { color: '#d5dcf5', align: 'right' },
          ),
        ],
      },
      {
        en: 'event new year eve sylvester novy god midnight champagne countdown party',
        he: 'אירוע שנה אזרחית חדשה סילבסטר נובי גוד חצות שמפניה מסיבה',
      },
    );
  }

  /* ---- a day of love: a letter in its envelope on a red hill, hearts over the photograph */
  function love() {
    const opening = box(54, 162, 642, 578);
    // The hearts: one of each kind, a drawing 100 wide.
    const hearts = {
      red: art(
        'love-heart-red',
        100,
        92,
        `<linearGradient id="fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6577"/><stop offset="1" stop-color="#c40f2f"/></linearGradient>`,
        `<path d="${heart(50, 44, 46)}" fill="url(#fill)"/>` +
          line(
            'M17 34c2-10 9-16 19-15',
            '#ffffff',
            5,
            ' stroke-opacity=".55" stroke-linecap="round"',
          ),
      ),
      blush: art(
        'love-heart-blush',
        100,
        92,
        `<linearGradient id="fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffd3d6"/><stop offset="1" stop-color="#f48da1"/></linearGradient>`,
        `<path d="${heart(50, 44, 46)}" fill="url(#fill)"/>` +
          line(
            'M17 34c2-10 9-16 19-15',
            '#ffffff',
            5,
            ' stroke-opacity=".7" stroke-linecap="round"',
          ),
      ),
      line: art(
        'love-heart-line',
        100,
        92,
        '',
        `<path d="${heart(50, 44, 43)}" fill="none" stroke="#d7263d" stroke-width="6" stroke-linejoin="round"/>`,
      ),
      striped: art(
        'love-heart-striped',
        100,
        92,
        `<clipPath id="in"><path d="${heart(50, 44, 44)}"/></clipPath>`,
        `<path d="${heart(50, 44, 44)}" fill="#fff4ec"/>` +
          `<g clip-path="url(#in)" stroke="#e23c53" stroke-width="7">${Array.from({ length: 9 }, (_, i) => `<path d="M${-40 + i * 18} 100 ${20 + i * 18} -10"/>`).join('')}</g>` +
          `<path d="${heart(50, 44, 44)}" fill="none" stroke="#d7263d" stroke-width="4" stroke-linejoin="round"/>`,
      ),
    };
    // The letter stands in its envelope: the open flap behind it, the pocket in front with its
    // folds, and a seal of wax on the point of the pocket.
    const envelope = art(
      'love-envelope',
      460,
      300,
      `<linearGradient id="front" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f9bcc5"/><stop offset="1" stop-color="#ee8a9d"/></linearGradient>` +
        `<linearGradient id="wax" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ee3d57"/><stop offset="1" stop-color="#a00c26"/></linearGradient>`,
      `<path fill="#d4627a" d="M6 128 230 2 454 128Z"/>` +
        `<rect x="42" y="14" width="376" height="214" rx="7" fill="#fffaf3"/>` +
        `<rect x="51" y="23" width="358" height="196" rx="3" fill="none" stroke="#f3c9c6" stroke-width="1.500"/>` +
        line('M150 120h52M258 120h52', '#e9a3ab', 2, ' stroke-linecap="round"') +
        `<path d="${heart(230, 119, 8)}" fill="#e9a3ab"/>` +
        `<path fill="url(#front)" d="M0 126 230 214 460 126V290a10 10 0 0 1-10 10H10A10 10 0 0 1 0 290Z"/>` +
        `<path fill="#ffffff" fill-opacity=".2" d="M4 298 230 190 456 298Z"/>` +
        line(
          'M0 126 230 214 460 126',
          '#ffffff',
          2.5,
          ' stroke-opacity=".6" stroke-linejoin="round"',
        ) +
        `<circle cx="230" cy="216" r="37" fill="url(#wax)"/>` +
        `<circle cx="230" cy="216" r="29.500" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="1.600"/>` +
        `<path d="${heart(230, 215, 15)}" fill="#ffd9de"/>`,
    );
    const hill = { ties: { l: 'start', r: 'end', t: 'end', b: 'end' } };
    return magnet(
      'magnet-love',
      'Day of love magnet',
      'מגנט ליום האהבה',
      [750, 1050, 28],
      {
        set: 'holidays',
        opening,
        round: 22,
        draw: (S) => ({
          defs: `<pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="1.700" fill="#e58a98" fill-opacity=".55"/></pattern>`,
          body:
            ground(S, '#fff4ec') +
            onBorder(
              S.whole('fill="url(#dots)"'),
              // A blush sun behind the corner of the photograph, and a red hill at the foot.
              S.pin(
                `<circle cx="640" cy="104" r="226" fill="#f9d2cd"/>` +
                  `<circle cx="640" cy="104" r="250" fill="none" stroke="#ef8fa0" stroke-width="2"/>`,
                [640, 104],
                { x: 'end', y: 'start' },
              ),
              S.ellipse(box(-360, 812, 1010, 600), 'fill="#d7263d"', hill),
              S.ellipse(
                box(-378, 794, 1046, 636),
                'fill="none" stroke="#ef8fa0" stroke-width="2"',
                hill,
              ),
              S.pin(
                line('M58 140h118', '#d7263d', 3, ' stroke-linecap="round"') +
                  `<path d="${heart(196, 139, 9)}" fill="#d7263d"/>`,
                [58, 140],
                { x: 'start', y: 'start' },
              ),
            ) +
            frameLine(S, 0, 22, '#ffffff', 8) +
            frameLine(S, 10, 31, '#d7263d', 2),
        }),
        extras: [
          caption(
            56,
            42,
            560,
            84,
            { text: 'פשוט אוהבים', font: 'Frank Ruhl Libre', size: 68, weight: 700 },
            {
              text: 'Simply in love',
              font: 'Playfair Display',
              size: 62,
              weight: 600,
              italic: true,
            },
            { color: '#a3122b', align: 'left' },
          ),
          label(
            envelope,
            30,
            720,
            [
              caption(
                62,
                34,
                336,
                72,
                { text: 'באהבה, לתמיד', font: 'Frank Ruhl Libre', size: 46, weight: 700 },
                {
                  text: 'With love, always',
                  font: 'Playfair Display',
                  size: 36,
                  weight: 600,
                  italic: true,
                },
                { color: '#a3122b' },
              ),
            ],
            { turn: -7 },
          ),
          // The hearts gather over the lower right corner of the photograph, and one drifts up.
          sticker(hearts.blush, 498, 652, 104, { turn: -16 }),
          sticker(hearts.red, 544, 682, 178, { turn: 12 }),
          sticker(hearts.striped, 640, 588, 84, { turn: 18 }),
          sticker(hearts.line, 566, 868, 70, { turn: -12 }),
          sticker(hearts.red, 668, 500, 46, { turn: -8 }),
        ],
      },
      {
        en: 'event love valentine tu b’av couple heart romance anniversary',
        he: 'אירוע אהבה ט״ו באב טו ולנטיין זוג זוגי לב רומנטי יום נישואין',
      },
    );
  }

  /* ---- Christmas: a garland of pine over the head of the photograph, baubles, a gift tag */
  function christmas() {
    // The head of the card is as tall as the garland nearly is: over photographs with heads
    // framed high, a garland that dips further into the picture lies on their hair.
    const opening = box(40, 146, 970, 478);
    const next = random(2512);
    const snow = (S) =>
      scattered(next, 74, 1050, 750, [inset(opening, -8)], 26, 10)
        .map(([x, y]) =>
          S.pin(
            `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.6 + next() * 3.6)}" fill="#ffffff" fill-opacity="${f(0.35 + next() * 0.6)}"/>`,
            [x, y],
          ),
        )
        .join('');
    /** A fir on the snow: three boughs on a trunk, snow on each. */
    const fir = (x, y, s) =>
      `<g transform="translate(${x} ${y}) scale(${s})">` +
      `<rect x="-3" y="-8" width="6" height="12" fill="#5a3b22"/>` +
      `<path fill="#0c4a37" d="M0-70 17-42H9L24-22H13L30-4H-30L-13-22H-24L-9-42H-17Z"/>` +
      `<path fill="#ffffff" fill-opacity=".85" d="M0-70 9-55Q3-58 0-53-3-58-9-55ZM-9-42Q-4-38 0-41 4-38 9-42L3-50H-3ZM-13-22Q-6-17 0-21 6-17 13-22L6-30H-6Z"/>` +
      `</g>`;
    /** A leaf of holly from its stalk, 48 long, turned around the stalk. */
    const holly = (x, y, turn) =>
      `<g transform="translate(${x} ${y}) rotate(${turn})">` +
      `<path fill="url(#leaf)" d="M0 0Q8-4 10-12 16-7 22-13 27-7 34-11 37-5 48 0 37 5 34 11 27 7 22 13 16 7 10 12 8 4 0 0Z"/>` +
      line('M3 0H44', '#bfe3c8', 1.2, ' stroke-opacity=".7" stroke-linecap="round"') +
      `</g>`;
    // The tag of a gift: a card with a point, an eyelet through it and a twine of two colours.
    const tagShape = 'M66 30H436a12 12 0 0 1 12 12V162a12 12 0 0 1-12 12H66L17 106a7 7 0 0 1 0-8Z';
    const twine = 'M52 102C28 91 14 62 36 42S92 30 84 6';
    const tag = art(
      'christmas-tag',
      458,
      184,
      `<linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fdf7e8"/><stop offset="1" stop-color="#f0e2c2"/></linearGradient>` +
        `<linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#3a9c66"/><stop offset="1" stop-color="#12573a"/></linearGradient>` +
        `<mask id="eye"><rect width="458" height="184" fill="#fff"/><circle cx="52" cy="102" r="7" fill="#000"/></mask>`,
      `<g mask="url(#eye)"><path d="${tagShape}" fill="url(#card)"/>` +
        `<path d="M70 40H434a4 4 0 0 1 4 4V160a4 4 0 0 1-4 4H70L29 104.500a4 4 0 0 1 0-5Z" fill="none" stroke="#b3202a" stroke-width="1.800"/>` +
        `<circle cx="52" cy="102" r="12" fill="none" stroke="#c79a3a" stroke-width="5"/></g>` +
        line(twine, '#c2242f', 4.6, ' stroke-linecap="round"') +
        line(twine, '#ffffff', 4.6, ' stroke-dasharray="5 7"') +
        holly(420, 42, -150) +
        holly(420, 42, -86) +
        `<circle cx="425" cy="46" r="7" fill="#d42a35"/><circle cx="436" cy="39" r="6" fill="#b81f2a"/><circle cx="434" cy="53" r="5.500" fill="#e2414b"/>` +
        `<circle cx="423" cy="44" r="1.800" fill="#ffffff" fill-opacity=".7"/>`,
    );
    return magnet(
      'magnet-christmas',
      'Christmas magnet',
      'מגנט לחג המולד',
      [1050, 750, 24],
      {
        set: 'holidays',
        opening,
        round: 14,
        draw: (S) => ({
          defs:
            `<linearGradient id="pine" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#14573f"/><stop offset="1" stop-color="#0a3528"/></linearGradient>` +
            `<radialGradient id="warm" cx=".5" cy="0" r=".7"><stop stop-color="#2f8a60" stop-opacity=".55"/><stop offset="1" stop-color="#2f8a60" stop-opacity="0"/></radialGradient>` +
            // The lights of the cord: one tile of them, as far apart at any size.
            `<pattern id="lights" y="45" width="78" height="30" patternUnits="userSpaceOnUse"><rect x="36.500" y="1" width="5" height="6" rx="1.500" fill="#caa24a"/><circle cx="39" cy="14" r="11" fill="#ffd98a" fill-opacity=".22"/><circle cx="39" cy="13" r="5.500" fill="#ffe3a6"/></pattern>`,
          body:
            ground(S, 'url(#pine)') +
            onBorder(
              S.whole('fill="url(#warm)"'),
              snow(S),
              // A cord of lights under the garland: it shows where a wider card parts the boughs.
              S.box(box(0, 44, 1050, 2.4), 0, 'fill="#caa24a"'),
              S.box(box(0, 45, 1050, 30), 0, 'fill="url(#lights)"'),
              // Snow at the foot of the card, in two drifts, and three firs on it.
              footStrip(
                S,
                650,
                100,
                `<path fill="#bfdccf" fill-opacity=".55" d="M0 700C170 668 330 706 520 690S880 652 1050 690V750H0Z"/>` +
                  `<path fill="#f4faf6" d="M0 722C150 694 300 690 470 712S820 742 1050 700V750H0Z"/>`,
              ),
              S.pin(fir(880, 716, 0.9) + fir(934, 712, 1.25) + fir(992, 708, 0.8), [934, 712], {
                x: 'end',
                y: 'end',
              }),
            ) +
            frameLine(S, 0, 14, '#f6ecd4', 6) +
            frameLine(S, 9, 22, '#d8b25a', 1.6),
        }),
        extras: [
          // The baubles hang from under the garland, on threads of three lengths.
          sticker(picture('more-xmasb-2'), 836, 108, 190),
          sticker(picture('more-xmas-1'), 0, 0, 532),
          sticker(picture('more-xmas-1'), 518, 0, 532, { flip: true }),
          label(
            tag,
            22,
            548,
            [
              caption(
                80,
                46,
                330,
                58,
                { text: 'חג מולד שמח', font: 'Suez One', size: 49 },
                {
                  text: 'Merry Christmas',
                  font: 'Playfair Display',
                  size: 36,
                  weight: 700,
                  italic: true,
                },
                { color: '#b3202a' },
              ),
              caption(
                80,
                126,
                330,
                34,
                { text: 'ושנה טובה ומבורכת', font: 'Heebo', size: 26, weight: 500, spacing: 1 },
                {
                  text: 'and a happy new year',
                  font: 'Playfair Display',
                  size: 26,
                  weight: 500,
                  italic: true,
                },
                { color: '#17553e' },
              ),
            ],
            { turn: -4 },
          ),
        ],
      },
      {
        en: 'event christmas xmas holiday pine garland baubles winter snow',
        he: 'אירוע חג המולד כריסמס חג אורן קישוטים חורף שלג עץ אשוח',
      },
    );
  }

  /* ---- Eid al-Fitr: a pointed arch on emerald, lanterns and a crescent hung over its shoulders */
  function eid() {
    // The arch: its sides, where its head springs from them, how high the head rises, its foot.
    const [SIDE, SPRING, RISE, FOOT] = [64, 430, 330, 800];
    const opening = box(SIDE, 144, 750 - 2 * SIDE, FOOT - 144);
    /**
     * One side of the head of the arch, `by` out from the window: an ellipse around the foot of
     * the other side, as wide as the arch at any size and always as high. The head is what the
     * two sides share, above the line they spring from: a pointed arch whose rise stays.
     */
    const curve = (by, at) =>
      `cx:${at};cy:${SPRING}px;rx:calc(100% - ${f(2 * SIDE - by)}px);ry:${f(RISE + by)}px`;
    const offsets = { window: -1, mat: 6, in: 10, out: 14, fine: 21, finer: 22.6 };
    const clips =
      `<clipPath id="head"><rect width="100%" height="${SPRING}"/></clipPath>` +
      Object.entries(offsets)
        .map(
          ([id, by]) =>
            `<clipPath id="side-${id}"><ellipse style="${curve(by, `${SIDE}px`)}"/></clipPath>`,
        )
        .join('');
    const arch = (S, id, attrs) => {
      const by = offsets[id];
      return (
        `<g clip-path="url(#head)"><ellipse ${attrs} clip-path="url(#side-${id})" style="${curve(by, `calc(100% - ${SIDE}px)`)}"/></g>` +
        S.box(
          // The foot reaches a little into the head, where the head is as wide: no seam shows.
          box(SIDE - by, SPRING - 8, 750 - 2 * SIDE + 2 * by, FOOT - SPRING + by + 8),
          [0, 0, 8 + by, 8 + by],
          attrs,
          { ties: { t: 'start', b: 'end' } },
        )
      );
    };
    /**
     * A generated ornament on a chain of gold, as one sticker that hangs from the head of the
     * card: `chain` long, the ring of the ornament `ring` of the way across it.
     */
    const hung = (name, source, wide, chain, ring = 0.5) => {
      const picture = tile('ornament', source, wide);
      const tall = Number(/height="(\d+)"/.exec(picture)[1]);
      const links = `M${f(wide * ring)} 0V${chain + 10}`;
      return art(
        name,
        wide,
        chain + tall,
        picture,
        line(links, '#a87a22', 3.6, ' stroke-dasharray="7 3.500" stroke-linecap="round"') +
          line(links, '#f6dc93', 1.3, ' stroke-dasharray="7 3.500" stroke-linecap="round"') +
          `<g transform="translate(0 ${chain})"><rect width="${wide}" height="${tall}" fill="url(#ornament)"/></g>`,
      );
    };
    // A star of two squares on its chain, drawn: the fourth thing that hangs.
    const hungStar = art(
      'eid-star',
      68,
      196,
      GOLD,
      line('M34 0V132', '#a87a22', 3.6, ' stroke-dasharray="7 3.500" stroke-linecap="round"') +
        line('M34 0V132', '#f6dc93', 1.3, ' stroke-dasharray="7 3.500" stroke-linecap="round"') +
        `<circle cx="34" cy="132" r="5" fill="none" stroke="url(#gold)" stroke-width="2.600"/>` +
        `<g transform="translate(34 164)"><rect x="-22" y="-22" width="44" height="44" fill="url(#gold)"/><rect x="-22" y="-22" width="44" height="44" fill="url(#gold)" transform="rotate(45)"/>` +
        `<rect x="-12" y="-12" width="24" height="24" fill="none" stroke="#7a5a16" stroke-width="1.400"/><rect x="-12" y="-12" width="24" height="24" fill="none" stroke="#7a5a16" stroke-width="1.400" transform="rotate(45)"/>` +
        `<circle r="4" fill="#0b5746"/></g>`,
    );
    // The cartouche: a plaque of gold with pointed ends, a line of emerald inside it.
    const cartouche = art(
      'eid-cartouche',
      500,
      124,
      GOLD +
        `<linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity=".45"/><stop offset=".5" stop-color="#ffffff" stop-opacity="0"/></linearGradient>`,
      `<path fill="url(#gold)" d="M70 4H430c16 0 22 12 30 24l32 34-32 34c-8 12-14 24-30 24H70c-16 0-22-12-30-24L8 62l32-34C48 16 54 4 70 4Z"/>` +
        `<path fill="url(#shine)" d="M70 4H430c16 0 22 12 30 24l32 34H8l32-34C48 16 54 4 70 4Z"/>` +
        `<path fill="none" stroke="#0b5746" stroke-width="1.800" d="M72 13H428c11 0 16 9 23 19l27 30-27 30c-7 10-12 19-23 19H72c-11 0-16-9-23-19L22 62l27-30c7-10 12-19 23-19Z"/>` +
        `<path fill="#0b5746" d="M44 53l6.500 9-6.500 9-6.500-9ZM456 53l6.500 9-6.500 9-6.500-9Z"/>`,
    );
    const jewel =
      line('M255 1006H345M405 1006H495', '#e2b955', 1.6, ' stroke-linecap="round"') +
      `<g transform="translate(375 1006)" fill="#e2b955"><rect x="-9" y="-9" width="18" height="18"/><rect x="-9" y="-9" width="18" height="18" transform="rotate(45)"/></g>` +
      `<circle cx="375" cy="1006" r="3.500" fill="#0b5746"/>` +
      `<circle cx="345" cy="1006" r="3" fill="#e2b955"/><circle cx="405" cy="1006" r="3" fill="#e2b955"/>`;
    return magnet(
      'magnet-eid',
      'Eid al-Fitr magnet',
      'מגנט לעיד אל־פיטר',
      [750, 1050, 24],
      {
        set: 'holidays',
        opening,
        window: (S) => arch(S, 'window', 'fill="#000"'),
        draw: (S) => ({
          defs:
            GOLD +
            clips +
            `<linearGradient id="emerald" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0f6b57"/><stop offset="1" stop-color="#06382f"/></linearGradient>` +
            `<radialGradient id="lamp" cx=".5" cy="0" r=".75"><stop stop-color="#3fb08f" stop-opacity=".5"/><stop offset="1" stop-color="#3fb08f" stop-opacity="0"/></radialGradient>` +
            // A lattice of eight-pointed stars: two squares, and the lines that join them.
            `<pattern id="lattice" width="64" height="64" patternUnits="userSpaceOnUse"><g fill="none" stroke="#ecd9a0" stroke-opacity=".26" stroke-width="1.200"><rect x="18" y="18" width="28" height="28"/><rect x="18" y="18" width="28" height="28" transform="rotate(45 32 32)"/><path d="M0 32h12.200M51.800 32H64M32 0v12.200M32 51.800V64"/><circle cx="0" cy="0" r="5"/><circle cx="64" cy="0" r="5"/><circle cx="0" cy="64" r="5"/><circle cx="64" cy="64" r="5"/></g></pattern>` +
            S.mask('eid-mat', arch(S, 'mat', 'fill="#fff"'), arch(S, 'window', 'fill="#000"')) +
            S.mask('eid-line', arch(S, 'out', 'fill="#fff"'), arch(S, 'in', 'fill="#000"')) +
            S.mask('eid-fine', arch(S, 'finer', 'fill="#fff"'), arch(S, 'fine', 'fill="#000"')),
          body:
            ground(S, 'url(#emerald)') +
            onBorder(
              S.whole('fill="url(#lamp)"'),
              S.whole('fill="url(#lattice)"'),
              S.pin(jewel, [375, 1006], { x: 'mid', y: 'end' }),
            ) +
            S.outline(box(14, 14, 722, 1022), 14, 1.6, 'stroke="url(#gold)" stroke-opacity=".8"') +
            S.whole('fill="#f8f1de" mask="url(#eid-mat)"') +
            S.whole('fill="url(#gold)" mask="url(#eid-line)"') +
            S.whole('fill="#e2b955" mask="url(#eid-fine)"'),
        }),
        extras: [
          sticker(hungStar, 178, 0, 68),
          sticker(hung('eid-lantern-tall', 'more-eid-1', 126, 62), 38, 0, 126),
          sticker(hung('eid-lantern-round', 'more-eid-2', 104, 52), 496, 0, 104),
          sticker(hung('eid-crescent', 'more-eid-3', 124, 168, 0.45), 600, 0, 124),
          label(cartouche, 125, 770, [
            caption(
              78,
              22,
              344,
              80,
              { text: 'עיד מבארכ', font: 'Frank Ruhl Libre', size: 62, weight: 800 },
              { text: 'Eid Mubarak', font: 'Playfair Display', size: 48, weight: 700 },
              { color: '#063a31' },
            ),
          ]),
          caption(
            95,
            912,
            560,
            48,
            { text: 'חג שמח ומבורך', font: 'Frank Ruhl Libre', size: 36, weight: 500, spacing: 1 },
            {
              text: 'A blessed and joyful Eid',
              font: 'Playfair Display',
              size: 34,
              weight: 500,
              italic: true,
            },
            { color: '#f1dfa8' },
          ),
        ],
      },
      {
        en: 'event eid al-fitr mubarak ramadan adha lantern crescent holiday',
        he: 'אירוע עיד אל פיטר אל־פיטר מבארכ מובארכ רמדאן אל־אדחא פנס סהר חג',
      },
    );
  }

  /* ---- a scrapbook page: a print taped askew on grid paper, a note, a stamp, doodles */
  function scrapbook() {
    const opening = box(52, 64, 700, 540);
    const near = { x: 'near', y: 'near' };
    // The print turns three degrees on the page: its window, and its white edge 18 around it.
    const window = [
      [81, 65],
      [751, 101],
      [723, 603],
      [53, 567],
    ].map(([x, y]) => [x, y, near]);
    const print = [
      [63, 45],
      [771, 83],
      [741, 623],
      [33, 585],
    ];
    const sheetOf = (dx, dy) => print.map(([x, y]) => [x + dx, y + dy, near]);
    const next = random(1206);
    // A strip of paper tape with a pinked end, 190 by 48: stripes on one, dots on the other.
    const strip =
      'M6 0 0 6 6 12 0 18 6 24 0 30 6 36 0 42 6 48H184l6-6-6-6 6-6-6-6 6-6-6-6 6-6-6-6Z';
    const tapes = {
      striped: art(
        'scrapbook-tape-striped',
        190,
        48,
        `<clipPath id="in"><path d="${strip}"/></clipPath>`,
        `<path d="${strip}" fill="#f2836b" fill-opacity=".9"/>` +
          `<g clip-path="url(#in)" stroke="#ffffff" stroke-opacity=".6" stroke-width="7">${Array.from({ length: 12 }, (_, i) => `<path d="M${-30 + i * 22} 54 ${10 + i * 22} -6"/>`).join('')}</g>`,
      ),
      dotted: art(
        'scrapbook-tape-dotted',
        190,
        48,
        `<clipPath id="in"><path d="${strip}"/></clipPath>`,
        `<path d="${strip}" fill="#7cc8b4" fill-opacity=".9"/>` +
          `<g clip-path="url(#in)" fill="#ffffff" fill-opacity=".7">${Array.from({ length: 20 }, (_, i) => `<circle cx="${14 + Math.floor(i / 2) * 18 + (i % 2) * 9}" cy="${i % 2 ? 34 : 14}" r="4"/>`).join('')}</g>`,
      ),
    };
    // A note torn from a pad: ruled, its lower edge ragged, held by a bit of tape.
    let ragged = 'M8 16H342V158';
    for (let x = 342; x > 8; x -= 11) {
      ragged += `L${f(Math.max(8, x - 5.5))} ${f(159 + next() * 12)}L${f(Math.max(8, x - 11))} ${f(152 + next() * 8)}`;
    }
    const note = art(
      'scrapbook-note',
      350,
      180,
      '',
      `<path d="${ragged}Z" fill="#000000" fill-opacity=".12" transform="translate(3 4)"/>` +
        `<path d="${ragged}Z" fill="#fff3b5"/>` +
        line('M8 50H342M8 134H342', '#8fb0d9', 1.4, ' stroke-opacity=".7"') +
        line('M40 16V150', '#f08a8a', 1.4, ' stroke-opacity=".7"') +
        `<rect x="132" y="2" width="86" height="28" rx="2" fill="#f2836b" fill-opacity=".82" transform="rotate(-4 175 16)"/>`,
    );
    // A date stamped in ink: two lines around it, the outer one worn.
    const stamp = art(
      'scrapbook-stamp',
      210,
      78,
      '',
      `<g fill="none" stroke="#a12a23" stroke-opacity=".9"><rect x="4" y="4" width="202" height="70" rx="9" stroke-width="4" stroke-dasharray="46 3 88 2 30 4"/><rect x="12" y="12" width="186" height="54" rx="4" stroke-width="1.500"/></g>`,
    );
    const arrow = art(
      'scrapbook-arrow',
      150,
      120,
      '',
      `<g fill="none" stroke="#2b2f3a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M140 16C100 2 42 26 22 92"/><path d="M6 62 22 94 52 76"/></g>`,
    );
    const stars = art(
      'scrapbook-stars',
      150,
      112,
      '',
      `<g fill="#ffd84d" stroke="#2b2f3a" stroke-width="4" stroke-linejoin="round"><path d="${star(52, 58, 44, -8)}"/><path d="${star(118, 30, 22, 14)}"/><path d="${star(124, 88, 15, -20)}"/></g>`,
    );
    return magnet(
      'magnet-scrapbook',
      'Scrapbook magnet',
      'מגנט בסגנון אלבום הדבקות',
      [1050, 750, 12],
      {
        opening,
        window: (S) => S.shape(window, 'fill="#000"'),
        draw: (S) => ({
          defs:
            tile('paper', 'more-newsprint', 384) +
            `<pattern id="grid" width="150" height="150" patternUnits="userSpaceOnUse"><path d="M30 0V150M60 0V150M90 0V150M120 0V150M0 30H150M0 60H150M0 90H150M0 120H150" fill="none" stroke="#8fb9e0" stroke-opacity=".55" stroke-width="1"/><path d="M0 0V150M0 0H150" fill="none" stroke="#6fa3d6" stroke-opacity=".8" stroke-width="1.600"/></pattern>`,
          body:
            ground(S, 'url(#paper)') +
            onBorder(
              S.whole('fill="#fdfbf4" fill-opacity=".55"'),
              S.whole('fill="url(#grid)"'),
              // The print lies on the page: its shadow in three steps, then its white edge.
              S.shape(sheetOf(2, 3), 'fill="#000000" fill-opacity=".07"'),
              S.shape(sheetOf(4, 6), 'fill="#000000" fill-opacity=".06"'),
              S.shape(sheetOf(7, 10), 'fill="#000000" fill-opacity=".05"'),
              S.shape(sheetOf(0, 0), 'fill="#fffdf8"'),
            ),
        }),
        extras: [
          caption(
            66,
            650,
            560,
            62,
            { text: 'רגעים שרוצים לזכור', font: 'Varela Round', size: 44 },
            { text: 'Moments worth keeping', font: 'Varela Round', size: 40 },
            { color: '#2f4b8f', align: 'left', turn: 3 },
          ),
          sticker(tapes.striped, 0, 54, 190, { turn: -38 }),
          sticker(tapes.dotted, 672, 62, 190, { turn: 40 }),
          sticker(stars, 880, 22, 140, { turn: 6 }),
          label(
            stamp,
            816,
            150,
            [
              caption(
                16,
                15,
                178,
                48,
                {
                  text: '12 ביוני',
                  font: 'IBM Plex Sans Hebrew',
                  size: 36,
                  weight: 700,
                  spacing: 2,
                },
                { text: 'JUNE 12', font: 'JetBrains Mono', size: 32, weight: 800, spacing: 2 },
                { color: '#a12a23' },
              ),
            ],
            { turn: -8 },
          ),
          sticker(arrow, 800, 286, 150),
          label(
            note,
            690,
            436,
            [
              caption(
                48,
                58,
                284,
                70,
                { text: 'איזה יום מושלם!', font: 'Karantina', size: 54, weight: 700 },
                { text: 'Best day ever!', font: 'Karantina', size: 53, weight: 700 },
                { color: '#2b2f3a' },
              ),
            ],
            { turn: 5 },
          ),
        ],
      },
      {
        en: 'style scrapbook album journal memories tape note doodle handmade',
        he: 'סגנון אלבום הדבקות זיכרונות יומן נייר דבק פתק קישקוש עבודת יד',
      },
    );
  }

  /* ---- a front page: a masthead, rules, a headline under the photograph, a stamp in red */
  function newspaper() {
    const opening = box(40, 228, 670, 456);
    const stamp = art(
      'newspaper-stamp',
      280,
      108,
      '',
      `<rect x="2" y="2" width="276" height="104" rx="10" fill="#a50f17"/>` +
        `<rect x="10" y="10" width="260" height="88" rx="5" fill="none" stroke="#fff4e2" stroke-width="2.400"/>` +
        `<path d="${star(27, 54, 7)}M${star(253, 54, 7).slice(1)}" fill="#fff4e2"/>`,
    );
    const ink = '#1d1b1a';
    return magnet(
      'magnet-newspaper',
      'Front page magnet',
      'מגנט בסגנון עמוד ראשון',
      [750, 1050, 6],
      {
        opening,
        draw: (S) => ({
          defs:
            tile('newsprint', 'more-newsprint', 384) +
            // A column of print: lines of grey, as close at any size.
            `<pattern id="print" y="904" width="24" height="15" patternUnits="userSpaceOnUse"><rect width="24" height="6.500" fill="#4b4744" fill-opacity=".42"/></pattern>`,
          body:
            ground(S, 'url(#newsprint)') +
            onBorder(
              S.whole('fill="#efe9dc" fill-opacity=".35"'),
              // Rules over and under the masthead, and around the line of the edition.
              S.box(box(40, 26, 670, 3), 0, `fill="${ink}"`),
              S.box(box(40, 150, 670, 5), 0, `fill="${ink}"`),
              S.box(box(40, 159, 670, 1.5), 0, `fill="${ink}"`),
              S.box(box(40, 208, 670, 1.5), 0, `fill="${ink}"`),
              // Under the headline: a rule, and three columns of print with a gap between them.
              S.box(box(40, 884, 670, 2.5), 0, `fill="${ink}"`),
              // The columns share the width between the margins, 20 apart, and go with the foot.
              `<svg y="100%" overflow="visible"><g transform="translate(0 -1050)">${[0, 1, 2]
                .map(
                  (column) =>
                    `<rect y="904" height="112" fill="url(#print)" style="x:calc(${f((column * 100) / 3)}% + ${40 - column * 20}px);width:calc(33.3% - 40px)"/>`,
                )
                .join('')}</g></svg>`,
              S.box(box(40, 1024, 670, 1.5), 0, `fill="${ink}"`),
            ) +
            frameLine(S, 0, 0, ink, 2),
        }),
        extras: [
          caption(
            40,
            34,
            670,
            114,
            { text: 'חדשות המשפחה', font: 'Frank Ruhl Libre', size: 90, weight: 900 },
            { text: 'The Family Times', font: 'Playfair Display', size: 67, weight: 900 },
            { color: ink },
          ),
          caption(
            40,
            164,
            670,
            42,
            {
              text: 'מהדורה חגיגית  ·  מחיר: חיוך אחד',
              font: 'Frank Ruhl Libre',
              size: 28,
              weight: 500,
            },
            {
              text: 'Special edition  ·  Price: one smile',
              font: 'Playfair Display',
              size: 28,
              weight: 500,
              italic: true,
            },
            { color: ink },
          ),
          caption(
            40,
            700,
            670,
            88,
            { text: 'התמונה שכולם', font: 'Frank Ruhl Libre', size: 76, weight: 900 },
            { text: 'The photo everyone', font: 'Playfair Display', size: 60, weight: 900 },
            { color: ink },
          ),
          caption(
            40,
            786,
            670,
            88,
            { text: 'מדברים עליה', font: 'Frank Ruhl Libre', size: 76, weight: 900 },
            { text: 'is talking about', font: 'Playfair Display', size: 60, weight: 900 },
            { color: ink },
          ),
          label(
            stamp,
            456,
            244,
            [
              caption(
                40,
                16,
                200,
                76,
                { text: 'מיוחד!', font: 'Secular One', size: 57 },
                { text: 'EXTRA!', font: 'Poppins', size: 42, weight: 900, italic: true },
                { color: '#fffaf0' },
              ),
            ],
            { turn: 10 },
          ),
        ],
      },
      {
        en: 'style newspaper front page headline news press print vintage',
        he: 'סגנון עיתון עמוד ראשון כותרת חדשות עיתונות דפוס וינטג׳',
      },
    );
  }

  /* ---- a postcard: an airmail edge, a stamp and its postmark, the name of the place very large */
  function postcard() {
    const opening = box(46, 46, 958, 484);
    // A stamp: a toothed edge, and in it the red hills over the gulf, a sun and a palm.
    const teeth = [];
    for (let x = 9; x <= 141; x += 12) teeth.push([x, 0], [x, 186]);
    for (let y = 9; y <= 177; y += 12) teeth.push([0, y], [150, y]);
    const stampArt = art(
      'postcard-stamp',
      150,
      186,
      `<mask id="teeth"><rect width="150" height="186" fill="#fff"/>${teeth.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.300" fill="#000"/>`).join('')}</mask>` +
        `<clipPath id="view"><rect x="14" y="14" width="122" height="158" rx="2"/></clipPath>` +
        `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6fc3ee"/><stop offset=".62" stop-color="#fde6b4"/></linearGradient>` +
        `<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2aa3d6"/><stop offset="1" stop-color="#0f5f96"/></linearGradient>`,
      `<rect width="150" height="186" fill="#fffdf6" mask="url(#teeth)"/>` +
        `<g clip-path="url(#view)"><rect x="14" y="14" width="122" height="158" fill="url(#sky)"/>` +
        `<circle cx="100" cy="54" r="26" fill="#ffe08a" fill-opacity=".5"/><circle cx="100" cy="54" r="17" fill="#ffc93c"/>` +
        `<path fill="#d0694b" d="M14 112 36 78 52 96 76 64 98 98 118 80 136 104V130H14Z"/>` +
        `<path fill="#a8412f" d="M14 120 32 100 50 112 72 92 94 116 136 98V132H14Z"/>` +
        `<rect x="14" y="124" width="122" height="48" fill="url(#sea)"/>` +
        line(
          'M22 138q6-4 12 0t12 0M70 150q6-4 12 0t12 0M98 136q6-4 12 0t12 0M30 160q6-4 12 0t12 0',
          '#ffffff',
          1.6,
          ' stroke-opacity=".6" stroke-linecap="round"',
        ) +
        line('M40 172C38 150 40 124 48 104', '#6b4a2b', 5, ' stroke-linecap="round"') +
        `<g fill="none" stroke="#1f7a4d" stroke-width="5" stroke-linecap="round"><path d="M48 104C38 96 28 96 20 102"/><path d="M48 104C42 90 34 84 24 84"/><path d="M48 104C50 90 58 82 68 82"/><path d="M48 104C58 98 68 100 74 108"/><path d="M48 104C54 94 52 86 48 80"/></g></g>` +
        `<rect x="14" y="14" width="122" height="158" rx="2" fill="none" stroke="#1d2a4d" stroke-opacity=".35" stroke-width="1.200"/>`,
    );
    // The postmark: the ring of the office, and the waves that cancel the stamp.
    const waves = [22, 40, 58, 76, 94]
      .map((y) => `M4 ${y}q11.800-9 23.700 0t23.700 0 23.700 0 23.700 0 23.700 0 23.700 0`)
      .join('');
    const postmark = art(
      'postcard-postmark',
      256,
      116,
      '',
      `<g fill="none" stroke="#1d2a4d" stroke-opacity=".8" stroke-linecap="round">` +
        `<path d="${waves}" stroke-width="3"/>` +
        `<circle cx="200" cy="58" r="52" stroke-width="3"/><circle cx="200" cy="58" r="37" stroke-width="1.500"/>` +
        `<circle cx="200" cy="58" r="44.500" stroke-width="2.400" stroke-dasharray=".1 11.550"/></g>` +
        `<path d="${star(200, 58, 15)}" fill="#1d2a4d" fill-opacity=".8"/>`,
    );
    const banner = art(
      'postcard-banner',
      350,
      64,
      `<linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cf3630"/><stop offset="1" stop-color="#b32424"/></linearGradient>`,
      `<path fill="#a52222" d="M0 14h52v50H0l16-25Z"/><path fill="#a52222" d="M350 14h-52v50h52l-16-25Z"/>` +
        `<path fill="#6d1414" d="M34 50h18v14Z"/><path fill="#6d1414" d="M316 50h-18v14Z"/>` +
        `<rect x="34" width="282" height="50" rx="4" fill="url(#band)"/>` +
        line(
          'M46 7H304M46 43H304',
          '#ffffff',
          1.6,
          ' stroke-opacity=".55" stroke-dasharray=".1 6" stroke-linecap="round"',
        ),
    );
    const edge = box(0, 0, 1050, 750);
    return magnet(
      'magnet-postcard',
      'Postcard magnet',
      'מגנט בסגנון גלויה',
      [1050, 750, 10],
      {
        opening,
        round: 4,
        draw: (S) => ({
          defs:
            // The edge of an airmail letter: slants of red and blue.
            `<pattern id="airmail" width="52" height="52" patternUnits="userSpaceOnUse" patternTransform="skewX(-35)"><rect width="13" height="52" fill="#d8352f"/><rect x="26" width="13" height="52" fill="#2456a6"/></pattern>` +
            S.mask(
              'postcard-edge',
              S.box(edge, 10, 'fill="#fff"'),
              S.box(inset(edge, 15), 3, 'fill="#000"'),
            ) +
            `<radialGradient id="sun" cx="0" cy="1" r=".7"><stop stop-color="#ffe2a8" stop-opacity=".8"/><stop offset="1" stop-color="#ffe2a8" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, '#fbf3e0') +
            onBorder(
              S.whole('fill="url(#sun)"'),
              // The side of the address: a line down the card, and three lines to write on.
              S.box(box(672, 560, 2, 150), 0, 'fill="#1d2a4d" fill-opacity=".35"', {
                ties: { x: 'end', y: 'end' },
              }),
              ...[612, 656, 700].map((y) =>
                S.box(box(700, y, 300, 1.6), 0, 'fill="#1d2a4d" fill-opacity=".4"', {
                  ties: { x: 'end', y: 'end' },
                }),
              ),
            ) +
            S.whole('fill="url(#airmail)" mask="url(#postcard-edge)"') +
            frameLine(S, 0, 4, '#ffffff', 6) +
            frameLine(S, 4, 7, '#1d2a4d', 1.2, ' stroke-opacity=".4"'),
        }),
        extras: [
          caption(
            704,
            564,
            292,
            48,
            { text: 'חבל שאתם לא פה!', font: 'Frank Ruhl Libre', size: 32, weight: 500 },
            {
              text: 'Wish you were here!',
              font: 'Playfair Display',
              size: 28,
              weight: 500,
              italic: true,
            },
            { color: '#27408b' },
          ),
          caption(
            52,
            556,
            580,
            176,
            { text: 'אילת', font: 'Karantina', size: 152, weight: 700, spacing: 4 },
            { text: 'EILAT', font: 'Poppins', size: 128, weight: 900, spacing: 2 },
            {
              color: '#d6441f',
              colors: ['#d6441f', '#14806f', '#2456a6', '#c22a3a', '#7d4aa0'],
              align: 'left',
            },
          ),
          label(
            banner,
            40,
            500,
            [
              caption(
                44,
                4,
                262,
                42,
                { text: 'דרישת שלום מ…', font: 'Secular One', size: 28 },
                { text: 'GREETINGS FROM', font: 'Poppins', size: 20, weight: 700, spacing: 1.5 },
                { color: '#fff7e6' },
              ),
            ],
            { turn: -4 },
          ),
          sticker(stampArt, 872, 24, 150, { turn: 5 }),
          sticker(postmark, 726, 70, 226, { turn: -8 }),
        ],
      },
      {
        en: 'style postcard travel greetings airmail stamp vacation eilat sea',
        he: 'סגנון גלויה טיול דרישת שלום דואר אוויר בול חופשה אילת ים',
      },
    );
  }

  /* ---- a boarding pass: a band of the airline, the route under the photograph, a stub */
  function boarding() {
    const opening = box(34, 122, 722, 408);
    /** Where the stub is torn off, from the left of the card. */
    const TEAR = 790;
    const plane =
      'M44 24c0-2-3-3.600-7-3.600H28L17 4h-5l5 16.400H9l-4-5H1.500L4 24l-2.500 8.600H5l4-5h8L12 44h5l11-16.400h9c4 0 7-1.600 7-3.600Z';
    // The route: a line of dashes from one airport to the other, the aeroplane half way.
    const route = art(
      'boarding-route',
      140,
      44,
      '',
      line('M14 22H46M96 22H126', '#0c3d7a', 3, ' stroke-dasharray=".1 8" stroke-linecap="round"') +
        `<circle cx="6" cy="22" r="4.500" fill="none" stroke="#0c3d7a" stroke-width="2.600"/><circle cx="134" cy="22" r="4.500" fill="#0c3d7a"/>` +
        `<path d="${plane}" fill="#ff6b3d" transform="translate(50 2.200) scale(.9)"/>`,
    );
    // A stamp of the border control: two rings in ink, the aeroplane between stars.
    const visa = art(
      'boarding-visa',
      130,
      130,
      '',
      `<g fill="none" stroke="#e0492a" stroke-opacity=".88"><circle cx="65" cy="65" r="60" stroke-width="4" stroke-dasharray="120 4 70 3 60 5"/><circle cx="65" cy="65" r="50" stroke-width="1.500"/><circle cx="65" cy="65" r="31" stroke-width="1.500" stroke-dasharray="3 4"/></g>` +
        `<g fill="#e0492a" fill-opacity=".88"><path d="${plane}" transform="translate(41 41)"/>` +
        `<path d="${star(65, 24.5, 5)}"/><path d="${star(65, 105.5, 5)}"/><path d="${star(24.5, 65, 5)}"/><path d="${star(105.5, 65, 5)}"/></g>`,
    );
    /** A field of the stub: a chip with a head for the name of the field. */
    const chip = (name) =>
      art(
        name,
        200,
        112,
        '',
        `<rect x="1" y="1" width="198" height="110" rx="14" fill="#ffffff" stroke="#0c3d7a" stroke-width="2"/>` +
          `<path fill="#0c3d7a" d="M1 15a14 14 0 0 1 14-14h170a14 14 0 0 1 14 14v25H1Z"/>`,
      );
    const field = (he, en) =>
      caption(
        14,
        5,
        172,
        32,
        { text: he, font: 'Heebo', size: 22, weight: 600, spacing: 2 },
        { text: en, font: 'Space Grotesk', size: 20, weight: 600, spacing: 4 },
        { color: '#ffffff' },
      );
    const value = (he, en = he) =>
      caption(
        14,
        44,
        172,
        62,
        { text: he, font: 'JetBrains Mono', size: 50, weight: 800 },
        { text: en, font: 'JetBrains Mono', size: 50, weight: 800 },
        { color: '#0c3d7a' },
      );
    const next = random(790);
    // The bar code of the stub: bars of four widths, one tile of them.
    let bars = '';
    for (let x = 0; x < 196;) {
      const wide = pick(next, [2, 2, 3, 5, 7]);
      bars += `<rect x="${x}" width="${wide}" height="80"/>`;
      x += wide + pick(next, [2, 3, 4]);
    }
    return magnet(
      'magnet-boarding',
      'Boarding pass magnet',
      'מגנט בסגנון כרטיס עלייה למטוס',
      [1050, 750, 26],
      {
        opening,
        round: 12,
        // The pass with a bite out of its head and its foot, where the stub tears off.
        card: (S) =>
          S.box(box(0, 0, 1050, 750), 26, 'fill="#fff"') +
          S.pin(`<circle cx="${TEAR}" cy="0" r="22" fill="#000"/>`, [TEAR, 0], {
            x: 'end',
            y: 'start',
          }) +
          S.pin(`<circle cx="${TEAR}" cy="750" r="22" fill="#000"/>`, [TEAR, 750], {
            x: 'end',
            y: 'end',
          }),
        draw: (S) => ({
          defs:
            `<linearGradient id="sky" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#0c3d7a"/><stop offset="1" stop-color="#1560b0"/></linearGradient>` +
            // Fine waves over the paper, as a pass is printed against forgery.
            `<pattern id="guilloche" width="60" height="18" patternUnits="userSpaceOnUse"><path d="M0 9q15-9 30 0t30 0" fill="none" stroke="#1560b0" stroke-opacity=".12" stroke-width="1.200"/></pattern>` +
            `<pattern id="perforation" y="30" width="4" height="15" patternUnits="userSpaceOnUse"><rect width="3" height="8" rx="1.500" fill="#0c3d7a" fill-opacity=".45"/></pattern>` +
            `<pattern id="barcode" x="826" y="620" width="198" height="80" patternUnits="userSpaceOnUse"><g fill="#16233f">${bars}</g></pattern>`,
          body:
            ground(S, '#fbfaf5') +
            onBorder(
              S.whole('fill="url(#guilloche)"'),
              S.box(box(0, 0, 1050, 98), 0, 'fill="url(#sky)"'),
              S.box(box(TEAR, 0, 260, 98), 0, 'fill="#ff6b3d"', { ties: { l: 'end' } }),
              S.box(box(0, 98, 1050, 5), 0, 'fill="#ff6b3d"'),
              // The mark of the airline: an aeroplane climbing in a ring.
              S.pin(
                `<circle cx="74" cy="49" r="29" fill="none" stroke="#ffffff" stroke-opacity=".85" stroke-width="2.400"/>` +
                  `<path d="${plane}" fill="#ffffff" transform="translate(51 26) rotate(-28 23 23)"/>`,
                [74, 49],
                { x: 'start', y: 'start' },
              ),
              S.pin(
                `<path d="${plane}" fill="#ffffff" transform="translate(896 25)"/>`,
                [920, 49],
                { x: 'end', y: 'start' },
              ),
              S.box(box(TEAR - 1.5, 30, 3, 690), 0, 'fill="url(#perforation)"', {
                ties: { x: 'end' },
              }),
              // Between the route and the passenger: a line down the foot of the pass.
              // It goes with the passenger beside it, as the words do when the pass is made wider
              // (`besideAt` of the Stage): 20 before a place in the middle third of the pass.
              `<rect fill="#0c3d7a" fill-opacity=".3" style="x:calc(${f(((506 - 350) / 350) * 100)}% + ${f(350 * (1 - (2 * (506 - 350)) / 350) - 20)}px);y:calc(100% - 194px);width:1.6px;height:160px"/>`,
              S.box(box(826, 620, 198, 80), 0, 'fill="url(#barcode)"', {
                ties: { x: 'end', y: 'end' },
              }),
            ) +
            frameLine(S, 0, 12, '#0c3d7a', 2),
        }),
        extras: [
          caption(
            118,
            18,
            402,
            62,
            { text: 'נתיבי חופשה', font: 'Rubik', size: 46, weight: 800 },
            { text: 'HOLIDAY AIRWAYS', font: 'Space Grotesk', size: 34, weight: 700, spacing: 3 },
            { color: '#ffffff', align: 'left' },
          ),
          caption(
            524,
            32,
            240,
            36,
            { text: 'כרטיס עלייה למטוס', font: 'Heebo', size: 22, weight: 500, spacing: 0.5 },
            { text: 'BOARDING PASS', font: 'Space Grotesk', size: 21, weight: 500, spacing: 3 },
            { color: '#d9e8fb', align: 'right' },
          ),
          caption(
            36,
            580,
            150,
            92,
            { text: 'TLV', font: 'JetBrains Mono', size: 70, weight: 800 },
            { text: 'TLV', font: 'JetBrains Mono', size: 70, weight: 800 },
            { color: '#0c3d7a', align: 'left' },
          ),
          sticker(route, 186, 604, 140),
          caption(
            336,
            580,
            150,
            92,
            { text: 'BCN', font: 'JetBrains Mono', size: 70, weight: 800 },
            { text: 'BCN', font: 'JetBrains Mono', size: 70, weight: 800 },
            { color: '#0c3d7a', align: 'left' },
          ),
          caption(
            506,
            566,
            250,
            32,
            { text: 'נוסעים', font: 'Heebo', size: 22, weight: 600, spacing: 2 },
            { text: 'PASSENGERS', font: 'Space Grotesk', size: 20, weight: 600, spacing: 4 },
            { color: '#c2410c', align: 'left' },
          ),
          caption(
            506,
            604,
            250,
            58,
            { text: 'משפחת אלון', font: 'IBM Plex Sans Hebrew', size: 38, weight: 700 },
            { text: 'ALON FAMILY', font: 'JetBrains Mono', size: 28, weight: 800 },
            { color: '#16233f', align: 'left' },
          ),
          caption(
            506,
            668,
            250,
            34,
            { text: 'טיסה נעימה!', font: 'Heebo', size: 24, weight: 400 },
            { text: 'Have a great flight!', font: 'Space Grotesk', size: 22, weight: 400 },
            { color: '#4a5a7a', align: 'left' },
          ),
          sticker(visa, 622, 130, 126, { turn: 14 }),
          label(chip('boarding-gate'), 820, 128, [field('שער', 'GATE'), value('B12')]),
          label(chip('boarding-seat'), 820, 262, [field('מושב', 'SEAT'), value('A23', '23A')]),
        ],
      },
      {
        en: 'style boarding pass flight ticket travel airport plane trip vacation',
        he: 'סגנון כרטיס עלייה למטוס טיסה כרטיס טיול שדה תעופה מטוס חופשה חו״ל',
      },
    );
  }

  /* ---- a record sleeve: the record slides out from under it, stripes on the corner */
  function vinyl() {
    const sleeve = box(0, 25, 700, 700);
    const opening = box(44, 69, 612, 404);
    const grooves = Array.from({ length: 24 }, (_, i) => {
      const gap = i % 6 === 5;
      return `<circle cx="330" cy="330" r="${128 + i * 8}" fill="none" stroke="#ffffff" stroke-opacity="${gap ? '.16' : '.07'}" stroke-width="${gap ? 2.2 : 1}"/>`;
    }).join('');
    /** A wedge of light across the grooves, around the angle `at`, `half` to each side. */
    const sheen = (at, half) => {
      const point = (deg) =>
        `${f(330 + 326 * Math.cos((deg * Math.PI) / 180))} ${f(330 + 326 * Math.sin((deg * Math.PI) / 180))}`;
      return `<path d="M330 330 ${point(at - half)}A326 326 0 0 1 ${point(at + half)}Z" fill="url(#sheen)"/>`;
    };
    const record = art(
      'vinyl-record',
      660,
      660,
      `<radialGradient id="disc" cx=".5" cy=".5" r=".5"><stop offset=".3" stop-color="#1c1c20"/><stop offset=".72" stop-color="#0c0c0f"/><stop offset="1" stop-color="#1e1e23"/></radialGradient>` +
        `<radialGradient id="sheen" gradientUnits="userSpaceOnUse" cx="330" cy="330" r="326"><stop offset=".34" stop-color="#ffffff" stop-opacity="0"/><stop offset=".6" stop-color="#ffffff" stop-opacity=".09"/><stop offset="1" stop-color="#ffffff" stop-opacity=".03"/></radialGradient>` +
        `<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f6814c"/><stop offset="1" stop-color="#e0502a"/></linearGradient>`,
      `<circle cx="330" cy="330" r="328" fill="url(#disc)"/>` +
        grooves +
        [-52, 128].map((at) => sheen(at, 20) + sheen(at, 12) + sheen(at, 5)).join('') +
        `<circle cx="330" cy="330" r="328" fill="none" stroke="#000000" stroke-opacity=".5" stroke-width="3"/>` +
        `<circle cx="330" cy="330" r="112" fill="url(#paper)"/>` +
        `<circle cx="330" cy="330" r="100" fill="none" stroke="#f6ead7" stroke-width="2"/>` +
        `<circle cx="330" cy="330" r="62" fill="none" stroke="#f2b134" stroke-width="12"/>` +
        `<circle cx="330" cy="330" r="38" fill="#f6ead7"/>` +
        `<circle cx="330" cy="330" r="10" fill="#131316"/>`,
    );
    // A sticker of the shop on the corner of the sleeve: a seal with a toothed edge.
    const teeth = Array.from({ length: 40 }, (_, i) => {
      const a = (i * Math.PI) / 20;
      const r = i % 2 ? 76 : 84;
      return `${f(85 + r * Math.cos(a))} ${f(85 + r * Math.sin(a))}`;
    }).join('L');
    const seal = art(
      'vinyl-seal',
      170,
      170,
      '',
      `<path d="M${teeth}Z" fill="#f2b134"/>` +
        `<circle cx="85" cy="85" r="66" fill="none" stroke="#082730" stroke-width="2"/>` +
        `<circle cx="85" cy="85" r="60" fill="none" stroke="#082730" stroke-width="1" stroke-dasharray="1.500 5" stroke-linecap="round"/>` +
        line('M52 56h66M52 115h66', '#082730', 2, ' stroke-linecap="round"'),
    );
    const stripes = ['#f6ead7', '#f2b134', '#f26b38', '#d93b2b', '#7a1f3d'];
    return magnet(
      'magnet-vinyl',
      'Record sleeve magnet',
      'מגנט בסגנון עטיפת תקליט',
      [1050, 750, 6],
      {
        opening,
        round: 2,
        card: (S) => S.box(sleeve, 6, 'fill="#fff"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="teal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#14596a"/><stop offset="1" stop-color="#0c3a47"/></linearGradient>` +
            `<linearGradient id="edge" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".32"/></linearGradient>`,
          body:
            ground(S, 'url(#teal)') +
            onBorder(
              // The ring an old sleeve wears where the record lies in it.
              S.ellipse(
                inset(sleeve, 34),
                'fill="none" stroke="#ffffff" stroke-opacity=".05" stroke-width="16"',
              ),
              // Stripes around the corner of the sleeve, as wide at any size.
              S.pin(
                stripes
                  .map(
                    (colour, i) =>
                      `<circle cx="700" cy="725" r="${82 + i * 30}" fill="none" stroke="${colour}" stroke-width="30.600"/>`,
                  )
                  .join(''),
                [700, 725],
                { x: 'end', y: 'end' },
              ),
              S.pin(
                `<rect x="46" y="662" width="96" height="5" rx="2.500" fill="#f2b134"/>`,
                [46, 662],
                {
                  x: 'start',
                  y: 'end',
                },
              ),
              // The mouth of the sleeve, where the record goes in.
              S.box(box(676, 25, 24, 700), 0, 'fill="url(#edge)"'),
            ) +
            frameLine(S, 0, 2, '#f6ead7', 6),
        }),
        extras: [
          sticker(record, 385, 45, 660, { under: true }),
          caption(
            44,
            494,
            500,
            100,
            { text: 'הלהיטים של הקיץ', font: 'Karantina', size: 84, weight: 700 },
            { text: 'Summer Hits', font: 'Playfair Display', size: 66, weight: 900, italic: true },
            { color: '#f6ead7', align: 'left' },
          ),
          caption(
            46,
            602,
            480,
            42,
            { text: 'צד א׳  ·  אוסף הזהב', font: 'Heebo', size: 26, weight: 500, spacing: 3 },
            {
              text: 'SIDE A  ·  GOLD COLLECTION',
              font: 'Montserrat',
              size: 21,
              weight: 600,
              spacing: 3,
            },
            { color: '#f2b134', align: 'left' },
          ),
          label(
            seal,
            20,
            30,
            [
              caption(
                14,
                61,
                142,
                48,
                { text: 'סטריאו', font: 'Secular One', size: 34 },
                { text: 'STEREO', font: 'Poppins', size: 25, weight: 800, spacing: 1 },
                { color: '#082730' },
              ),
            ],
            { turn: -14 },
          ),
        ],
      },
      {
        en: 'style vinyl record album cover music retro lp sleeve playlist',
        he: 'סגנון תקליט ויניל אלבום עטיפה מוזיקה רטרו פלייליסט שירים',
      },
    );
  }

  /* ---- a soft gradient: lights of peach, lilac and sky, and labels of frosted glass */
  function aura() {
    // The head of the card carries half of the pill: set wholly inside the photograph, it lay
    // on a head that is framed high at the left.
    const opening = box(40, 66, 970, 522);
    const frost = `<linearGradient id="frost" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity=".92"/><stop offset="1" stop-color="#ffffff" stop-opacity=".74"/></linearGradient>`;
    // A pill of frosted glass, a spark at its head.
    const pill = art(
      'aura-pill',
      330,
      78,
      frost +
        `<linearGradient id="spark" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff9f8a"/><stop offset="1" stop-color="#9b7bff"/></linearGradient>`,
      `<rect x="2" y="2" width="326" height="74" rx="37" fill="url(#frost)"/>` +
        `<rect x="2" y="2" width="326" height="74" rx="37" fill="none" stroke="#ffffff" stroke-width="2.400"/>` +
        `<circle cx="40" cy="39" r="22" fill="url(#spark)" fill-opacity=".18"/>` +
        `<path d="${sparkle(40, 39, 15, 0.26)}" fill="url(#spark)"/>`,
    );
    // A round of the same glass, a heart at its head.
    const round = art(
      'aura-round',
      176,
      176,
      frost +
        `<linearGradient id="heart" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff8fa3"/><stop offset="1" stop-color="#a77bff"/></linearGradient>`,
      `<circle cx="88" cy="88" r="85" fill="url(#frost)"/>` +
        `<circle cx="88" cy="88" r="85" fill="none" stroke="#ffffff" stroke-width="2.400"/>` +
        `<circle cx="88" cy="88" r="74" fill="none" stroke="#b9a3ea" stroke-opacity=".5" stroke-width="1.200" stroke-dasharray="1 6" stroke-linecap="round"/>` +
        `<path d="${heart(88, 56, 21)}" fill="url(#heart)"/>`,
    );
    // Three lights that float over the corner of the photograph.
    const orbs = art(
      'aura-orbs',
      200,
      170,
      `<radialGradient id="peach" cx=".35" cy=".3" r=".8"><stop stop-color="#fff1e6" stop-opacity=".95"/><stop offset="1" stop-color="#ff9f8a" stop-opacity=".75"/></radialGradient>` +
        `<radialGradient id="lilac" cx=".35" cy=".3" r=".8"><stop stop-color="#f6efff" stop-opacity=".95"/><stop offset="1" stop-color="#a98bff" stop-opacity=".72"/></radialGradient>` +
        `<radialGradient id="sky" cx=".35" cy=".3" r=".8"><stop stop-color="#effaff" stop-opacity=".95"/><stop offset="1" stop-color="#6cc4f5" stop-opacity=".72"/></radialGradient>`,
      `<circle cx="120" cy="72" r="68" fill="url(#lilac)"/><circle cx="120" cy="72" r="67" fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width="2"/>` +
        `<circle cx="52" cy="110" r="44" fill="url(#peach)"/><circle cx="52" cy="110" r="43" fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width="2"/>` +
        `<circle cx="164" cy="140" r="24" fill="url(#sky)"/><circle cx="164" cy="140" r="23" fill="none" stroke="#ffffff" stroke-opacity=".8" stroke-width="2"/>`,
    );
    /** A light of one colour on the card, around a point of it given as shares. */
    const light = (id, cx, cy, r, colour, opacity) =>
      `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"><stop stop-color="${colour}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${colour}" stop-opacity="0"/></radialGradient>`;
    return magnet(
      'magnet-aura',
      'Soft gradient magnet',
      'מגנט בגרדיאנט רך',
      [1050, 750, 44],
      {
        opening,
        round: 34,
        draw: (S) => ({
          defs:
            light('aura-peach', 0.08, 0.1, 0.75, '#ffb39a', 0.95) +
            light('aura-lilac', 0.95, 0.95, 0.8, '#b79cff', 0.9) +
            light('aura-sky', 0.98, 0.02, 0.6, '#8fd6ff', 0.9) +
            light('aura-rose', 0.3, 1.05, 0.55, '#ff9ec4', 0.75) +
            light('aura-sun', 0.55, 0.45, 0.5, '#fff6d8', 0.7),
          body:
            ground(S, '#fbf1f4') +
            onBorder(
              S.whole('fill="url(#aura-peach)"'),
              S.whole('fill="url(#aura-lilac)"'),
              S.whole('fill="url(#aura-sky)"'),
              S.whole('fill="url(#aura-rose)"'),
              S.whole('fill="url(#aura-sun)"'),
              S.pin(
                `<path d="${sparkle(950, 700, 13, 0.24)}" fill="#ffffff"/><path d="${sparkle(978, 672, 6, 0.24)}" fill="#ffffff" fill-opacity=".85"/>`,
                [950, 700],
                { x: 'end', y: 'end' },
              ),
            ) +
            frameLine(S, 0, 34, '#ffffff', 5) +
            frameLine(S, 10, 44, '#ffffff', 1.4, ' stroke-opacity=".75"'),
        }),
        extras: [
          sticker(orbs, 834, 18, 200, { turn: 8 }),
          caption(
            54,
            602,
            760,
            84,
            { text: 'רגעים קטנים, אושר גדול', font: 'Assistant', size: 66, weight: 300 },
            { text: 'small moments, big joy', font: 'Manrope', size: 58, weight: 300 },
            { color: '#3a2a5c', align: 'left' },
          ),
          caption(
            56,
            692,
            620,
            38,
            { text: 'אוסף של רגעים טובים', font: 'Heebo', size: 25, weight: 400, spacing: 4 },
            {
              text: 'A COLLECTION OF GOOD DAYS',
              font: 'DM Sans',
              size: 20,
              weight: 500,
              spacing: 5,
            },
            { color: '#5b4a80', align: 'left' },
          ),
          label(
            pill,
            12,
            30,
            [
              caption(
                70,
                14,
                240,
                50,
                { text: 'רגע של אושר', font: 'Assistant', size: 34, weight: 700 },
                { text: 'a moment of joy', font: 'Manrope', size: 26, weight: 700 },
                { color: '#3a2a5c' },
              ),
            ],
            { turn: -5 },
          ),
          label(
            round,
            846,
            498,
            [
              caption(
                24,
                88,
                128,
                50,
                { text: 'באהבה', font: 'Assistant', size: 38, weight: 700 },
                { text: 'with love', font: 'Manrope', size: 24, weight: 700 },
                { color: '#3a2a5c' },
              ),
            ],
            { turn: 7 },
          ),
        ],
      },
      {
        en: 'style soft gradient pastel aura glass modern calm aesthetic',
        he: 'סגנון גרדיאנט רך פסטל הילה זכוכית מודרני רגוע עדין',
      },
    );
  }

  return [
    newYear(),
    love(),
    christmas(),
    eid(),
    scrapbook(),
    newspaper(),
    postcard(),
    boarding(),
    vinyl(),
    aura(),
  ];
}
