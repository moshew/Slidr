/*
 * The first ten magnets of events (`../frames-magnets.mjs`): a team day in summer, a birthday, a
 * wedding, a bar or bat mitzvah, a new baby, the end of a school year, a company event, a party
 * at night, a trip and a children's party. Each says which set of the panel it is shown in.
 */

/** @param kit What a magnet is drawn with (`kit.mjs`). */
export default function first(kit) {
  const { data, moved, scaled, smooth, around, random, box, inset, f, percent } = kit;
  const { magnet, sticker, caption, label, art, ground, onBorder, line, frameLine, stretched } =
    kit;
  const { sparkle, star, scattered, pick, cloud } = kit;

  /* ---- a summer day out: two pastels, a sun in sunglasses, cold drinks */
  function summer() {
    const opening = box(38, 38, 974, 592);
    return magnet(
      'magnet-summer',
      'Team day magnet',
      'מגנט ליום גיבוש',
      [1050, 750, 30],
      {
        set: 'work',
        opening,
        round: 24,
        draw: (S) => ({
          defs: `<pattern id="dots" width="30" height="30" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><circle cx="7" cy="7" r="3.200" fill="#fff"/></pattern>`,
          body:
            ground(S, '#ffe49a') +
            onBorder(
              // The sky comes in from the right along a wave, with a rim of light on it: over
              // as large a share of the card at any size.
              stretched(
                S,
                box(474, 0, 576, 750),
                `<path fill="#b7e3f7" d="M612 0C548 120 676 262 596 410S474 620 556 750H1050V0Z"/>` +
                  `<path fill="#fff" fill-opacity=".55" d="M612 0C548 120 676 262 596 410S474 620 556 750h16C492 620 612 558 612 410S564 120 630 0Z"/>`,
              ),
              S.whole('fill="url(#dots)" opacity=".5"'),
              S.pin(`<circle cx="86" cy="704" r="62" fill="#fff" fill-opacity=".3"/>`, [86, 704], {
                x: 'start',
                y: 'end',
              }),
              S.pin(
                `<circle cx="318" cy="742" r="40" fill="#ffc85a" fill-opacity=".45"/>`,
                [318, 742],
              ),
              S.pin(
                `<circle cx="1004" cy="676" r="74" fill="#fff" fill-opacity=".32"/>`,
                [1004, 676],
                { x: 'end', y: 'end' },
              ),
              S.pin(
                `<circle cx="820" cy="752" r="46" fill="#8fd3f1" fill-opacity=".55"/>`,
                [820, 752],
              ),
            ) +
            frameLine(S, 0, 24, '#ffffff', 7),
        }),
        extras: [
          sticker('sun-shades', 848, 16, 184, { turn: 8 }),
          sticker('tropical-drink', 22, 532, 192, { turn: -8 }),
          sticker('cocktail-glass', 168, 572, 156, { turn: 7 }),
          caption(
            330,
            631,
            670,
            117,
            { text: 'יום הגיבוש שלנו', font: 'Karantina', size: 100, weight: 700 },
            { text: 'Our Team Day', font: 'Poppins', size: 66, weight: 800 },
            { color: '#17508f' },
          ),
        ],
      },
      {
        en: 'event summer beach sun company fun day',
        he: 'אירוע קיץ ים שמש חברה יום כיף גיבוש צוות',
      },
    );
  }

  /* ---- a birthday: confetti on a sunny card, balloons, and the name on a ribbon of its own */
  function birthday() {
    const opening = box(44, 44, 962, 560);
    const next = random(412);
    const colours = ['#ffffff', '#ff4f8b', '#7c4dff', '#12b5c4', '#ff7a2f'];
    // The confetti is the ground of the whole card: under the ribbon too, which may be moved.
    const confetti = (S) =>
      scattered(next, 104, 1050, 750, [inset(opening, -8)], 24, 12)
        .map(([x, y]) => {
          const colour = pick(next, colours);
          const turn = Math.round(next() * 180);
          const kind = next();
          const at = `transform="translate(${f(x)} ${f(y)}) rotate(${turn})"`;
          const piece =
            kind < 0.3
              ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(4 + next() * 4)}" fill="${colour}"/>`
              : kind < 0.62
                ? `<rect x="-10" y="-3.500" width="20" height="7" rx="3.500" fill="${colour}" ${at}/>`
                : kind < 0.8
                  ? `<path d="M0-8 7.500 5.500h-15Z" fill="${colour}" ${at}/>`
                  : `<path d="M-12 0q4-9 8 0t8 0 8 0" fill="none" stroke="${colour}" stroke-width="4" stroke-linecap="round" ${at}/>`;
          return S.pin(piece, [x, y]);
        })
        .join('');
    // The ribbon, a label of its own: its two tails behind, the folds that carry them, the
    // band in front with a line of stitches along each edge.
    const ribbon = art(
      'ribbon-rose',
      750,
      112,
      `<linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e62d72"/><stop offset="1" stop-color="#c81558"/></linearGradient>`,
      `<path fill="#a51049" d="M0 28h110v84H0l34-42Z"/><path fill="#a51049" d="M750 28H640v84h110l-34-42Z"/>` +
        `<path fill="#6f0a31" d="M68 88h42v24Z"/><path fill="#6f0a31" d="M682 88h-42v24Z"/>` +
        `<rect x="68" width="614" height="88" rx="7" fill="url(#band)"/>` +
        `<rect x="68" width="614" height="30" rx="7" fill="#ffffff" fill-opacity=".1"/>` +
        line(
          'M86 11.500H664M86 76.500H664',
          '#ffffff',
          2.4,
          ' stroke-opacity=".6" stroke-dasharray=".1 8" stroke-linecap="round"',
        ),
    );
    return magnet(
      'magnet-birthday',
      'Birthday magnet',
      'מגנט ליום הולדת',
      [1050, 750, 30],
      {
        set: 'birthdays',
        opening,
        round: 28,
        draw: (S) => ({
          defs: `<linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffd257"/><stop offset="1" stop-color="#ffbe2e"/></linearGradient>`,
          body: ground(S, 'url(#sun)') + onBorder(confetti(S)) + frameLine(S, 0, 28, '#ffffff', 8),
        }),
        extras: [
          sticker('balloons', 16, 16, 286, { turn: -6 }),
          sticker('wrapped-gift', 20, 588, 144, { turn: -8 }),
          // The popper fires from behind the end of the ribbon, over the corner of the photograph.
          sticker('party-popper', 868, 468, 164, { flip: true }),
          label(
            ribbon,
            178,
            606,
            [
              caption(
                90,
                12,
                570,
                64,
                { text: 'יום הולדת שמח, נועה!', font: 'Secular One', size: 50 },
                { text: 'Happy Birthday, Noa!', font: 'Poppins', size: 42, weight: 800 },
                { color: '#ffffff' },
              ),
            ],
            { turn: -3 },
          ),
        ],
      },
      {
        en: 'event party celebration cake balloons',
        he: 'אירוע יומולדת מסיבה חגיגה עוגה בלונים מזל טוב',
      },
    );
  }

  /* ---- a wedding: an arch on ivory, lines of gold, the names below */
  function wedding() {
    const opening = box(70, 64, 610, 716);
    /** Where the round part of an arch ends and its foot begins, from the foot of the card. */
    const FOOT = 290;
    /**
     * An arch around the photograph, `by` away from it: half a circle above, as wide as the
     * arch is at any size, straight sides, and a flat foot. Above the foot it is a box with
     * round corners that is too tall for its lower corners to show; the foot is a plain box.
     * The two share a line of the card, so no seam shows between them.
     */
    const arch = (S, by, attrs) => {
      const around = inset(opening, -by);
      const tall = S.geometry({ ...around, h: around.h + 2 * S.h });
      return (
        `<rect ${attrs} clip-path="url(#above)" style="${tall};rx:calc(50% - ${f(around.x)}px)"/>` +
        `<rect ${attrs} clip-path="url(#foot)" style="${S.geometry(around)}"/>`
      );
    };
    const next = random(77);
    // Sparks of gold in the corners the arch leaves free.
    const sparks = (S) =>
      [
        [112, 104, 15],
        [66, 168, 8],
        [176, 62, 7],
        [640, 96, 14],
        [690, 170, 8],
        [584, 58, 6],
      ]
        .map(([x, y, r]) =>
          S.pin(
            `<path d="${sparkle(x, y, r)}" fill="#c9a557" fill-opacity="${f(0.55 + next() * 0.4)}"/>`,
            [x, y],
            { x: x < 375 ? 'start' : 'end', y: 'start' },
          ),
        )
        .join('');
    // Between the flowers and the glasses: a small jewel on a line.
    const jewel =
      line('M262 842H346M404 842H488', '#c39d4f', 1.6, ' stroke-linecap="round"') +
      `<path d="${sparkle(375, 842, 17, 0.3)}" fill="url(#gold)"/>` +
      `<circle cx="346" cy="842" r="3" fill="#c39d4f"/><circle cx="404" cy="842" r="3" fill="#c39d4f"/>`;
    return magnet(
      'magnet-wedding',
      'Wedding magnet',
      'מגנט לחתונה',
      [750, 1050, 24],
      {
        set: 'family',
        opening,
        window: (S) => arch(S, -1, 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<radialGradient id="blush" cx="0" cy="1" r=".9"><stop stop-color="#f4d8cd" stop-opacity=".9"/><stop offset="1" stop-color="#f4d8cd" stop-opacity="0"/></radialGradient>` +
            `<radialGradient id="sage" cx="1" cy="0" r=".8"><stop stop-color="#dfe8d8" stop-opacity=".95"/><stop offset="1" stop-color="#dfe8d8" stop-opacity="0"/></radialGradient>` +
            `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e3c98c"/><stop offset=".5" stop-color="#c39d4f"/><stop offset="1" stop-color="#dcbf7c"/></linearGradient>` +
            `<clipPath id="above"><rect width="100%" style="height:calc(100% - ${FOOT - 1}px)"/></clipPath>` +
            `<clipPath id="foot"><rect width="100%" height="100%" style="y:calc(100% - ${FOOT}px)"/></clipPath>`,
          body:
            ground(S, '#fbf6ec') +
            onBorder(S.whole('fill="url(#blush)"'), S.whole('fill="url(#sage)"'), sparks(S)) +
            S.outline(box(16, 16, 718, 1018), 13, 2, 'stroke="url(#gold)"') +
            arch(S, 12, 'fill="none" stroke="url(#gold)" stroke-width="3"') +
            arch(S, 23, 'fill="none" stroke="url(#gold)" stroke-width="1.3"') +
            S.pin(jewel, [375, 842], { x: 'mid', y: 'end' }),
        }),
        extras: [
          sticker('dove', 26, 26, 122, { turn: -6 }),
          sticker('bouquet', 26, 722, 164, { turn: -4 }),
          sticker('clinking-glasses', 566, 724, 158, { turn: 4 }),
          caption(
            75,
            880,
            600,
            92,
            { text: 'מאיה ויונתן', font: 'Frank Ruhl Libre', size: 76, weight: 700 },
            {
              text: 'Maya & Jonathan',
              font: 'Playfair Display',
              size: 60,
              weight: 600,
              italic: true,
            },
            { color: '#4d6650' },
          ),
          caption(
            95,
            970,
            560,
            46,
            { text: 'תודה שחגגתם איתנו', font: 'Heebo', size: 32, weight: 500, spacing: 2 },
            { text: 'THANK YOU FOR COMING', font: 'Montserrat', size: 28, weight: 600, spacing: 3 },
            { color: '#7d6126' },
          ),
        ],
      },
      {
        en: 'event marriage bride groom love elegant',
        he: 'אירוע חתונה נישואין חתן כלה אהבה אלגנטי',
      },
    );
  }

  /* ---- a bar or bat mitzvah: night blue, gold lines and sparks, a star in a medallion */
  function mitzvah() {
    const opening = box(46, 46, 958, 556);
    const next = random(1813);
    const sparks = (S) =>
      scattered(next, 64, 1050, 750, [inset(opening, -22), box(180, 618, 690, 112)], 30, 20)
        .map(([x, y]) => {
          const opacity = f(0.45 + next() * 0.55);
          return S.pin(
            next() < 0.55
              ? `<path d="${sparkle(x, y, 5 + next() * 9)}" fill="#f3d27a" fill-opacity="${opacity}"/>`
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.4 + next() * 1.8)}" fill="#fbeab0" fill-opacity="${opacity}"/>`,
            [x, y],
          );
        })
        .join('');
    // A fan of three arcs in each corner of the band.
    const fan = (cx) =>
      [38, 54, 70]
        .map(
          (r) =>
            `<circle cx="${cx}" cy="100%" r="${r}" fill="none" stroke="url(#gold)" stroke-width="2" stroke-opacity=".8"/>`,
        )
        .join('');
    return magnet(
      'magnet-mitzvah',
      'Bar and bat mitzvah magnet',
      'מגנט לבר ובת מצווה',
      [1050, 750, 26],
      {
        set: 'family',
        opening,
        round: 16,
        draw: (S) => ({
          defs:
            `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#182a66"/><stop offset="1" stop-color="#0a1230"/></linearGradient>` +
            `<radialGradient id="glow" cx=".5" cy=".9" r=".5"><stop stop-color="#3355b8" stop-opacity=".7"/><stop offset="1" stop-color="#3355b8" stop-opacity="0"/></radialGradient>` +
            `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbeab0"/><stop offset=".5" stop-color="#e2b955"/><stop offset="1" stop-color="#f6dc93"/></linearGradient>`,
          body:
            ground(S, 'url(#night)') +
            onBorder(S.whole('fill="url(#glow)"'), sparks(S), fan('0'), fan('100%')) +
            S.outline(box(13, 13, 1024, 724), 15, 1.6, 'stroke="url(#gold)" stroke-opacity=".85"') +
            frameLine(S, 7, 22, 'url(#gold)', 4) +
            frameLine(S, 15, 29, 'url(#gold)', 1.4),
        }),
        extras: [
          sticker('star-of-david', 892, 10, 148),
          sticker('glowing-star', 22, 588, 132, { turn: -10 }),
          sticker('sparkles', 924, 610, 104, { turn: 8 }),
          caption(
            190,
            626,
            670,
            96,
            { text: 'בר המצווה של איתמר', font: 'Suez One', size: 62 },
            { text: 'Itamar’s Bar Mitzvah', font: 'DM Serif Display', size: 62 },
            { color: '#f6dc93' },
          ),
        ],
      },
      {
        en: 'event bar bat mitzvah gold festive jewish',
        he: 'אירוע בר בת מצווה זהב חגיגי עלייה לתורה',
      },
    );
  }

  /* ---- a new baby: a window with a scalloped edge, clouds, a bear and the moon */
  function baby() {
    const bump = 21.5;
    const opening = box(52, 44, 44 * bump, 26 * bump);
    // The scallops stand on a box as far inside the opening as they are round.
    const inner = inset(opening, bump);
    const [W, H] = [1050, 750];
    /**
     * A length of that box at any size of the card: what the card leaves it, down to a whole
     * number of scallops, so a scallop stands on every corner. A browser that cannot round a
     * length gives the box all the card leaves it (`plain`).
     */
    const fits = (left) => ({
      plain: `calc(100% - ${f(left)}px)`,
      whole: `round(down, 100% - ${f(left - 0.5)}px, ${f(2 * bump)}px)`,
    });
    const [across, down] = [fits(W - inner.w), fits(H - inner.h)];
    /**
     * A box with a scalloped edge: half circles of radius `r`, as large and as far apart at
     * any size, around the box the scallops stand on, which lies in the middle of what the
     * card leaves it. The box itself is filled `by` further in than its scallops reach.
     */
    const scalloped = (r, colour) => {
      const by = bump - r - 1;
      const box = (wide, high, grow) =>
        `x:calc((100% - ${wide}) / 2 + ${f(inner.x - (W - inner.w) / 2 + grow)}px);` +
        `y:calc((100% - ${f(H - inner.h)}px - ${high}) / 2 + ${f(inner.y + grow)}px);` +
        `width:calc(${wide} - ${f(2 * grow)}px);height:calc(${high} - ${f(2 * grow)}px)`;
      const style = (grow) =>
        `${box(across.plain, down.plain, grow)};${box(across.whole, down.whole, grow)}`;
      return (
        `<rect fill="${colour}" style="${style(by)}"/>` +
        `<rect fill="none" stroke="${colour}" stroke-width="${f(2 * r)}" stroke-linecap="round" stroke-dasharray="0 ${f(2 * bump)}" style="${style(0)}"/>`
      );
    };
    const next = random(905);
    const twinkles = (S) =>
      scattered(next, 46, 1050, 750, [inset(opening, -6), box(205, 618, 680, 104)], 34, 16)
        .map(([x, y]) =>
          S.pin(
            next() < 0.5
              ? `<path d="${sparkle(x, y, 5 + next() * 7, 0.3)}" fill="${pick(next, ['#ffffff', '#ffe9a6'])}"/>`
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2 + next() * 2.5)}" fill="#ffffff" fill-opacity=".85"/>`,
            [x, y],
          ),
        )
        .join('');
    return magnet(
      'magnet-baby',
      'New baby magnet',
      'מגנט ללידה ולברית',
      [1050, 750, 34],
      {
        set: 'family',
        opening,
        window: () => scalloped(bump - 1, '#000'),
        draw: (S) => ({
          defs:
            `<linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#cdeee4"/><stop offset="1" stop-color="#c9e0fa"/></linearGradient>` +
            `<radialGradient id="peach" cx=".08" cy="1" r=".55"><stop stop-color="#ffdccb"/><stop offset="1" stop-color="#ffdccb" stop-opacity="0"/></radialGradient>` +
            // The rim of the window: the window a little larger, less the window a little smaller.
            S.mask('rim', scalloped(bump + 2, '#fff'), scalloped(bump - 4, '#000')),
          body:
            ground(S, 'url(#sky)') +
            onBorder(
              S.whole('fill="url(#peach)"'),
              twinkles(S),
              S.pin(cloud(742, 668, 1.15), [874, 720], { x: 'end', y: 'end' }),
              S.pin(cloud(180, 706, 0.62), [250, 730], { x: 'start', y: 'end' }),
            ) +
            S.whole('fill="#ffffff" mask="url(#rim)"'),
        }),
        extras: [
          sticker('teddy-bear', 26, 556, 172, { turn: -6 }),
          sticker('crescent-moon', 904, 14, 128, { turn: 10 }),
          sticker('star', 846, 12, 56, { turn: -14 }),
          sticker('baby-bottle', 902, 596, 122, { turn: 12 }),
          caption(
            215,
            622,
            660,
            98,
            { text: 'ברוכה הבאה, מיקה', font: 'Varela Round', size: 66 },
            { text: 'Welcome, baby Mika', font: 'Varela Round', size: 56 },
            { color: '#3b4f86' },
          ),
        ],
      },
      {
        en: 'event birth newborn brit shower boy girl',
        he: 'אירוע תינוק תינוקת לידה ברית בריתה זבד הבת',
      },
    );
  }

  /* ---- the end of a school year: a blackboard in a wooden frame, drawn on with chalk */
  function graduation() {
    const opening = box(78, 78, 894, 500);
    const board = box(30, 30, 990, 690);
    const next = random(2606);
    const chalks = ['#fdfdf6', '#ffe27a', '#ffb3c7', '#a9e1f5'];
    // Small things a class draws: a star, a plus, a ring, a wave, a triangle.
    const doodles = (S) =>
      scattered(
        next,
        40,
        1050,
        750,
        [
          inset(opening, -14),
          box(190, 592, 670, 140),
          box(0, 0, 200, 190),
          box(860, 560, 190, 190),
          box(0, 570, 180, 180),
        ],
        52,
        46,
      )
        .map(([x, y]) => {
          const colour = pick(next, chalks);
          const turn = Math.round(next() * 60 - 30);
          const at = `transform="translate(${f(x)} ${f(y)}) rotate(${turn})"`;
          const kind = Math.floor(next() * 5);
          const d = [
            star(0, 0, 13),
            'M-10 0H10M0-10V10',
            'M-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0',
            'M-15 0q5-10 10 0t10 0 10 0',
            'M0-11 11 8H-11Z',
          ][kind];
          return S.pin(
            `<path d="${d}" ${at} fill="none" stroke="${colour}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-opacity=".85"/>`,
            [x, y],
          );
        })
        .join('');
    // The grain of the wood: short lines along the four sides of the frame.
    const grain = (S) =>
      Array.from({ length: 16 }, (_, i) => {
        const along = 60 + next() * 900;
        const run = 60 + next() * 160;
        const off = 6 + next() * 18;
        const [x, y, d] = [
          [along, off, `h${f(run)}`],
          [along, 750 - off, `h${f(run)}`],
          [off, along * 0.68, `v${f(run * 0.7)}`],
          [1050 - off, along * 0.68, `v${f(run * 0.7)}`],
        ][i % 4];
        return S.pin(
          line(
            `M${f(x)} ${f(y)}${d}`,
            '#7a4a1f',
            1.6,
            ' stroke-opacity=".35" stroke-linecap="round"',
          ),
          [x, y],
        );
      }).join('');
    // A line of chalk under the words.
    const underline = line(
      'M300 708q110-14 225-6t225-6',
      '#ffe27a',
      4,
      ' stroke-linecap="round" stroke-opacity=".9"',
    );
    return magnet(
      'magnet-graduation',
      'Graduation magnet',
      'מגנט למסיבת סיום',
      [1050, 750, 14],
      {
        set: 'school',
        opening,
        round: 10,
        draw: (S) => {
          // The doodles are scattered before the grain is laid, as they always were.
          const drawn = doodles(S);
          return {
            defs:
              `<linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#cf9a5c"/><stop offset=".5" stop-color="#b27a41"/><stop offset="1" stop-color="#c48d50"/></linearGradient>` +
              `<radialGradient id="dust" cx=".3" cy=".9" r=".6"><stop stop-color="#3f7462" stop-opacity=".8"/><stop offset="1" stop-color="#3f7462" stop-opacity="0"/></radialGradient>`,
            body:
              ground(S, 'url(#wood)') +
              grain(S) +
              S.outline(box(5, 5, 1040, 740), 10, 2, 'stroke="#e6bd86" stroke-opacity=".8"') +
              onBorder(
                S.box(board, 6, 'fill="#234f40"'),
                S.box(board, 6, 'fill="url(#dust)"'),
                drawn,
                S.pin(underline, [525, 708], { x: 'mid', y: 'end' }),
              ) +
              S.outline(board, 6, 4, 'stroke="#6f431b"') +
              frameLine(S, 5, 14, '#fdfdf6', 3.2, ' stroke-opacity=".9"') +
              frameLine(
                S,
                9,
                18,
                '#fdfdf6',
                1.2,
                ' stroke-opacity=".45" stroke-dasharray="14 5 3 5"',
              ),
          };
        },
        extras: [
          sticker('graduation-cap', 22, 20, 168, { turn: -14 }),
          sticker('trophy', 884, 566, 150, { turn: 8 }),
          sticker('backpack', 30, 588, 136, { turn: -8 }),
          caption(
            200,
            592,
            650,
            108,
            { text: 'סיימנו את כיתה ו׳!', font: 'Karantina', size: 92, weight: 700 },
            { text: 'We did it, Class 6B!', font: 'Karantina', size: 92, weight: 700 },
            { color: '#fdfdf6' },
          ),
        ],
      },
      {
        en: 'event school class teacher blackboard chalk end of year',
        he: 'אירוע מסיבה סיום בית ספר כיתה מורה לוח גיר סוף שנה מחזור',
      },
    );
  }

  /* ---- a company event: the colours of the deck's own theme, and nothing playful */
  function company() {
    const opening = box(30, 30, 990, 556);
    const dots = Array.from({ length: 24 }, (_, i) => {
      const [col, row] = [i % 6, Math.floor(i / 6)];
      return `<circle cx="${896 + col * 22}" cy="${634 + row * 22}" r="3.600"/>`;
    }).join('');
    return magnet(
      'magnet-company',
      'Company event magnet',
      'מגנט לאירוע חברה',
      [1050, 750, 10],
      {
        set: 'work',
        opening,
        draw: (S) => ({
          body:
            S.whole('mask="url(#border)"', 'fill:var(--color-primary)') +
            // A tab of the accent colour on the corner of the photograph, and a line under it.
            `<path style="fill:var(--color-accent)" d="M30 30h168L30 198Z"/>` +
            `<path style="fill:var(--color-bg)" fill-opacity=".28" d="M30 30h84L30 114Z"/>` +
            S.box(box(30, 582, 990, 9), 0, '', { paint: 'fill:var(--color-accent);' }) +
            S.pin(`<g style="fill:var(--color-bg)" fill-opacity=".4">${dots}</g>`, [951, 667], {
              x: 'end',
              y: 'end',
            }) +
            S.pin(
              `<g style="stroke:var(--color-accent)" stroke-width="9" stroke-linecap="round"><path d="M50 716 86 634M88 716l36-82M126 716l36-82"/></g>`,
              [50, 716],
              { x: 'start', y: 'end' },
            ),
        }),
        extras: [
          caption(
            200,
            606,
            650,
            74,
            { text: 'כנס החברה השנתי', size: 60, weight: 800 },
            { text: 'Annual Company Summit', size: 42, weight: 800 },
            { color: { token: 'bg' } },
          ),
          caption(
            200,
            682,
            650,
            44,
            { text: 'מתחברים · חושבים · חוגגים', size: 28, weight: 500 },
            { text: 'Connect · Think · Celebrate', size: 28, weight: 500 },
            { color: { token: 'bg' } },
          ),
        ],
      },
      {
        en: 'event business conference brand corporate clean',
        he: 'אירוע עסקי כנס מותג ארגון נקי עבודה',
      },
    );
  }

  /* ---- a party at night: tubes of neon around the photograph, a mirror ball, the beat below */
  function party() {
    const opening = box(48, 48, 654, 760);
    const next = random(2330);
    const lights = (S) =>
      scattered(next, 30, 750, 1050, [inset(opening, -30), box(50, 834, 650, 170)], 40, 18)
        .map(([x, y]) =>
          S.pin(
            next() < 0.4
              ? `<path d="${sparkle(x, y, 5 + next() * 8)}" fill="#ffffff" fill-opacity="${f(0.5 + next() * 0.5)}"/>`
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2 + next() * 5)}" fill="${pick(next, ['#ff3ea5', '#29e7ff', '#ffe14d'])}" fill-opacity="${f(0.35 + next() * 0.4)}"/>`,
            [x, y],
          ),
        )
        .join('');
    // The bars of an equaliser along the foot of the card: one tile of them, in the box of
    // the foot. A wider card has the beat go on, with bars as wide as they were.
    const BARS = { count: 35, pitch: 17.8, x: 66, y: 992, h: 40 };
    const bars = () =>
      Array.from({ length: BARS.count }, (_, i) => {
        const tall = 6 + Math.abs(Math.sin(i * 0.9) * 15 + Math.sin(i * 2.3) * 8) + next() * 5;
        return `<rect x="${f(i * BARS.pitch)}" y="${f(BARS.h - tall)}" width="10" height="${f(tall)}" rx="5"/>`;
      }).join('');
    const foot = box(BARS.x - 4, BARS.y, BARS.count * BARS.pitch + 2, BARS.h);
    const tube = (S, by, radius, colour, width) =>
      frameLine(S, by, radius, colour, width * 3.2, ' stroke-opacity=".55" filter="url(#blur)"') +
      frameLine(S, by, radius, colour, width) +
      frameLine(S, by, radius, '#ffffff', width * 0.3, ' stroke-opacity=".8"');
    return magnet(
      'magnet-party',
      'Party night magnet',
      'מגנט למסיבה',
      [750, 1050, 26],
      {
        set: 'leisure',
        opening,
        round: 20,
        draw: (S) => {
          // The lights are scattered before the bars are cut, as they always were.
          const lit = lights(S);
          return {
            defs:
              `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1a0d38"/><stop offset="1" stop-color="#09051a"/></linearGradient>` +
              `<radialGradient id="pink" cx=".1" cy=".95" r=".6"><stop stop-color="#ff2e97" stop-opacity=".5"/><stop offset="1" stop-color="#ff2e97" stop-opacity="0"/></radialGradient>` +
              `<radialGradient id="cyan" cx=".95" cy=".9" r=".55"><stop stop-color="#1ee3f7" stop-opacity=".4"/><stop offset="1" stop-color="#1ee3f7" stop-opacity="0"/></radialGradient>` +
              `<linearGradient id="beat" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#ff3ea5"/><stop offset=".5" stop-color="#b56bff"/><stop offset="1" stop-color="#29e7ff"/></linearGradient>` +
              `<filter id="blur" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="7"/></filter>` +
              `<pattern id="bars" x="${BARS.x}" y="${BARS.y}" width="${f(BARS.count * BARS.pitch)}" height="${BARS.h}" patternUnits="userSpaceOnUse"><g fill="url(#beat)">${bars()}</g></pattern>` +
              `<clipPath id="foot"><rect style="${S.geometry(foot)}"/></clipPath>`,
            body:
              ground(S, 'url(#night)') +
              onBorder(
                S.whole('fill="url(#pink)"'),
                S.whole('fill="url(#cyan)"'),
                lit,
                `<g clip-path="url(#foot)">${S.pin(
                  `<rect x="-4000" y="${BARS.y}" width="8750" height="${BARS.h}" fill="url(#bars)"/>`,
                  [375, BARS.y],
                  { x: 'mid', y: 'end' },
                )}</g>`,
                tube(S, 10, 28, '#ff3ea5', 5),
                tube(S, 22, 40, '#29e7ff', 3.2),
              ),
          };
        },
        extras: [
          sticker('mirror-ball', 18, 14, 150, { turn: -6 }),
          sticker('bottle-with-popping-cork', 590, 22, 136, { turn: 6 }),
          sticker('clinking-glasses', 574, 716, 150, { turn: 6 }),
          caption(
            55,
            820,
            640,
            130,
            { text: 'לילה שלא נשכח', font: 'Karantina', size: 112, weight: 700 },
            { text: 'A Night to Remember', font: 'Karantina', size: 82, weight: 700 },
            { color: '#ffffff' },
          ),
          caption(
            105,
            950,
            540,
            46,
            { text: 'רוקדים עד הבוקר', font: 'Heebo', size: 32, weight: 500, spacing: 4 },
            { text: 'DANCING TILL DAWN', font: 'Poppins', size: 28, weight: 600, spacing: 6 },
            { color: '#7df1ff' },
          ),
        ],
      },
      {
        en: 'event night club dance music disco neon',
        he: 'אירוע מסיבה לילה מועדון ריקודים מוזיקה דיסקו ניאון',
      },
    );
  }

  /* ---- a trip: a card the colour of sand, the lines of a map, a trail to the camp */
  function trip() {
    const opening = box(44, 44, 962, 552);
    const next = random(64);
    // Contour lines: rings of a hill around a few tops, as a map draws them. A hill goes
    // with the corner or the side of the card it is at.
    const contours = (S) =>
      [
        [120, 700, 170, { x: 'start', y: 'end' }],
        [972, 86, 150, { x: 'end', y: 'start' }],
        [700, 760, 130, { y: 'end' }],
        [20, 150, 120, { x: 'start', y: 'start' }],
        [1010, 520, 110, { x: 'end' }],
      ]
        .map(([cx, cy, reach, ties]) => {
          const wobble = Array.from({ length: 9 }, () => 0.82 + next() * 0.36);
          const rings = Array.from({ length: Math.floor(reach / 22) }, (_, ring) => {
            const r = 22 * (ring + 1);
            return line(
              data(
                moved(
                  scaled(smooth(around(9, 0, (i) => wobble[i] * (1 + ring * 0.02))), r),
                  cx,
                  cy,
                ),
              ),
              '#cdb78a',
              1.6,
              ' stroke-opacity=".8"',
            );
          });
          return S.pin(rings.join(''), [cx, cy], ties);
        })
        .join('');
    // The trail: from the camp, around the words, to a cross where the boots stand. It is as
    // long a share of the card at any size, and its dots stay as they are.
    const trail = (S) =>
      `<svg y="100%" overflow="visible">` +
      `<svg x="${percent(196 / S.w)}" y="-74" width="${percent(672 / S.w)}" height="80" viewBox="196 676 672 80" preserveAspectRatio="none" overflow="visible">` +
      line(
        'M196 716c70 18 120-34 196-22s130 34 214 26 150-40 262-22',
        '#d9713c',
        4.5,
        ' stroke-dasharray="1 12" stroke-linecap="round" vector-effect="non-scaling-stroke"',
      ) +
      `</svg></svg>`;
    return magnet(
      'magnet-trip',
      'Trip magnet',
      'מגנט לטיול',
      [1050, 750, 18],
      {
        set: 'leisure',
        opening,
        round: 10,
        draw: (S) => ({
          body:
            ground(S, '#f1e4c8') +
            onBorder(contours(S)) +
            S.outline(box(12, 12, 1026, 726), 9, 2.4, 'stroke="#2f5d50"') +
            S.outline(
              box(20, 20, 1010, 710),
              5,
              1.4,
              'stroke="#2f5d50" stroke-dasharray="7 6" stroke-opacity=".7"',
            ) +
            frameLine(S, 0, 10, '#fffaf0', 7) +
            trail(S) +
            S.pin(
              line('M858 690l20 20M878 690l-20 20', '#d9713c', 5, ' stroke-linecap="round"'),
              [868, 700],
              { x: 'part', y: 'end' },
            ),
        }),
        extras: [
          sticker('camping', 26, 572, 170, { turn: -4 }),
          sticker('compass', 880, 16, 150, { turn: 12 }),
          sticker('hiking-boot', 896, 602, 128, { turn: -8 }),
          caption(
            215,
            606,
            660,
            92,
            { text: 'הטיול השנתי שלנו', font: 'Rubik', size: 64, weight: 800 },
            { text: 'Our Annual Hike', font: 'Montserrat', size: 62, weight: 800 },
            { color: '#2a5446' },
          ),
        ],
      },
      {
        en: 'event hike nature camping travel map outdoors',
        he: 'אירוע טיול טבע מסלול קמפינג מחנה מפה שטח צופים',
      },
    );
  }

  /* ---- a children's party: a rainbow behind the photograph, clouds, crayons, a kite */
  function kids() {
    const opening = box(50, 50, 950, 548);
    const bands = ['#ff5a5f', '#ff9f43', '#ffd43b', '#3ccb7f', '#3d8bfd', '#8e6cef'];
    /** A rainbow around the lower left corner of the card: its bands from `reach` inwards. */
    const rainbow = (reach, thick) =>
      bands
        .map(
          (colour, i) =>
            `<circle cx="0" cy="100%" r="${reach - thick * (i + 0.5)}" fill="none" stroke="${colour}" stroke-width="${thick + 0.6}"/>`,
        )
        .join('');
    const next = random(3105);
    const drawnOn = (S) =>
      scattered(
        next,
        26,
        1050,
        750,
        [
          inset(opening, -12),
          box(250, 608, 600, 124),
          box(0, 520, 300, 230),
          box(880, 0, 170, 170),
          box(860, 580, 190, 170),
          box(0, 0, 190, 190),
        ],
        58,
        26,
      )
        .map(([x, y]) => {
          const colour = pick(next, ['#ff5a5f', '#ff9f43', '#3ccb7f', '#3d8bfd', '#8e6cef']);
          const at = `transform="translate(${f(x)} ${f(y)}) rotate(${Math.round(next() * 50 - 25)})"`;
          const d = [
            star(0, 0, 13),
            'M0 11C-16-1-7-13 0-5 7-13 16-1 0 11Z',
            'M-14 0q4.700-10 9.300 0t9.300 0 9.400 0',
          ][Math.floor(next() * 3)];
          return S.pin(
            `<path d="${d}" ${at} fill="none" stroke="${colour}" stroke-width="4.500" stroke-linecap="round" stroke-linejoin="round"/>`,
            [x, y],
          );
        })
        .join('');
    return magnet(
      'magnet-kids',
      'Kids party magnet',
      'מגנט למסיבת ילדים',
      [1050, 750, 36],
      {
        set: 'kids',
        opening,
        round: 40,
        draw: (S) => ({
          defs: `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cfeaff"/><stop offset="1" stop-color="#eaf7ff"/></linearGradient>`,
          body:
            ground(S, 'url(#sky)') +
            onBorder(
              rainbow(262, 22),
              drawnOn(S),
              S.pin(cloud(196, 676, 0.72), [280, 710], { x: 'start', y: 'end' }),
              S.pin(cloud(742, 14, 0.5), [800, 40], { x: 'end', y: 'start' }),
            ) +
            frameLine(S, 0, 40, '#ffffff', 9),
        }),
        extras: [
          sticker('kite', 20, 18, 150, { turn: -8 }),
          sticker('crayons', 868, 584, 164, { turn: 4 }),
          sticker('lollipop', 906, 20, 118, { turn: 14 }),
          caption(
            240,
            618,
            610,
            104,
            { text: 'חוגגים בגן שלנו', font: 'Rubik', size: 70, weight: 800 },
            { text: 'Kindergarten Party', font: 'Rubik', size: 50, weight: 800 },
            { color: '#1c6fe0', colors: ['#e5383b', '#e8590c', '#178a4c', '#1c6fe0', '#7048e8'] },
          ),
        ],
      },
      {
        en: 'event children kindergarten school rainbow play',
        he: 'אירוע מסיבה ילדים גן בית ספר קשת משחק',
      },
    );
  }

  return [
    summer(),
    birthday(),
    wedding(),
    mitzvah(),
    baby(),
    graduation(),
    company(),
    party(),
    trip(),
    kids(),
  ];
}
