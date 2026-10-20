/*
 * Ten magnets that are styles, with no event (`../frames-magnets.mjs`): a minimal card, black
 * and gold, a frame of film, the seventies, pop art, kraft paper and twine, a ticket, the cover
 * of a magazine, a neon sign on a brick wall and a botanical card. Structure, material and type
 * carry them: they are shown in the set of styles.
 */

/** @param kit What a magnet is drawn with (`kit.mjs`). */
export default function styles(kit) {
  const { random, around, box, inset, f } = kit;
  const { magnet, sticker, caption, label, art, picture, tile } = kit;
  const { ground, onBorder, line, frameLine, star } = kit;

  /* ---- minimal: a white card, the photograph high and to the right, one hairline, small type */
  function minimal() {
    const opening = box(120, 40, 890, 520);
    const ink = '#16181d';
    // The pill of the place and the day: an outline only, as light as the hairline.
    const pill = art(
      'pill-hairline',
      250,
      52,
      '',
      `<rect x="1" y="1" width="248" height="50" rx="25" fill="none" stroke="${ink}" stroke-width="1.5"/>`,
    );
    return magnet(
      'magnet-minimal',
      'Minimal magnet',
      'מגנט מינימליסטי',
      [1050, 750, 6],
      {
        opening,
        draw: (S) => ({
          body:
            ground(S, '#ffffff') +
            // The one hairline: the outline of the photograph, slipped down and to the left,
            // so it shows on two sides of it only.
            onBorder(
              S.outline(
                box(opening.x - 16, opening.y + 16, opening.w, opening.h),
                0,
                1.2,
                `stroke="${ink}"`,
              ),
            ) +
            // A short rule between the two lines of words.
            S.pin(`<rect x="120" y="664" width="56" height="2" fill="${ink}"/>`, [120, 664], {
              x: 'start',
              y: 'end',
            }),
        }),
        extras: [
          caption(
            120,
            606,
            560,
            44,
            { text: 'הרגעים שלנו', font: 'Heebo', size: 32, weight: 500, spacing: 8 },
            { text: 'OUR MOMENTS', font: 'Montserrat', size: 27, weight: 600, spacing: 10 },
            { color: ink, align: 'left' },
          ),
          caption(
            120,
            680,
            560,
            34,
            { text: 'אלבום משפחת לביא', font: 'Heebo', size: 22, weight: 400, spacing: 2 },
            {
              text: 'THE LAVIE FAMILY ALBUM',
              font: 'Montserrat',
              size: 20,
              weight: 500,
              spacing: 4,
            },
            { color: '#6b7078', align: 'left' },
          ),
          label(pill, 760, 602, [
            caption(
              20,
              9,
              210,
              34,
              { text: 'יפו · 12.6', font: 'Heebo', size: 23, weight: 500, spacing: 3 },
              { text: 'JAFFA · 12.6', font: 'Montserrat', size: 20, weight: 600, spacing: 4 },
              { color: ink },
            ),
          ]),
        ],
      },
      {
        en: 'style minimal clean white simple modern hairline quiet',
        he: 'סגנון מינימליסטי מינימלי נקי לבן פשוט מודרני שקט',
      },
    );
  }

  /* ---- black and gold: lines of gold foil on black, a window with its corners cut, a plaque */
  function blackGold() {
    const [W, H] = [750, 1050];
    const opening = box(64, 64, 622, 770);
    const [CUT, GROW] = [56, 2 - Math.SQRT2];
    /**
     * The window with its corners cut, `by` further out all around: a cut is as long at any
     * size, and grows with the distance so that the lines around the window stay parallel.
     */
    const cutBox = (by) => {
      const { x, y, w, h } = inset(opening, -by);
      const c = CUT + GROW * by;
      return [
        [x + c, y],
        [x + w - c, y],
        [x + w, y + c],
        [x + w, y + h - c],
        [x + w - c, y + h],
        [x + c, y + h],
        [x, y + h - c],
        [x, y + c],
      ].map(([px, py]) => [px, py, { x: 'near', y: 'near' }]);
    };
    /** A line around the window as a mask: the shape a little larger, less a little smaller. */
    const ring = (S, id, by, width) =>
      S.mask(
        id,
        S.shape(cutBox(by + width / 2), 'fill="#fff"'),
        S.shape(cutBox(by - width / 2), 'fill="#000"'),
      );
    const foil = 'fill="url(#foil)"';
    // In each cut corner: a wedge of foil, and a line that follows its long side.
    const wedge = `<path ${foil} d="M34 34h52L34 86Z"/>` + line('M96 34 34 96', 'url(#foil)', 1.6);
    const corner = (S, sx, sy) =>
      S.pin(
        `<g transform="translate(${sx < 0 ? W : 0} ${sy < 0 ? opening.y * 2 + opening.h : 0}) scale(${sx} ${sy})">${wedge}</g>`,
        [sx < 0 ? W - 34 : 34, sy < 0 ? opening.y + opening.h + 30 : 34],
        { x: sx < 0 ? 'end' : 'start', y: sy < 0 ? 'end' : 'start' },
      );
    // A rising sun at the foot of the card: every other ray of nine is foil.
    const [cx, cy] = [375, 1030];
    const rays = Array.from({ length: 5 }, (_, i) => {
      const at = (deg, r) => {
        const a = (deg * Math.PI) / 180;
        return `${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
      };
      const [from, to] = [180 + i * 40, 200 + i * 40];
      return `M${at(from, 18)}L${at(from, 62)}A62 62 0 0 1 ${at(to, 62)}L${at(to, 18)}A18 18 0 0 0 ${at(from, 18)}Z`;
    }).join('');
    const sun =
      `<path ${foil} d="${rays}"/>` +
      line(`M${cx - 72} ${cy}a72 72 0 0 1 144 0`, 'url(#foil)', 1.6) +
      `<path ${foil} d="M${cx - 9} ${cy}a9 9 0 0 1 18 0Z"/>`;
    // Three lines step out from the sun to each side, and go as far as the card is wide.
    const wings = (S) =>
      [0, 1, 2]
        .map((i) => {
          const [y, step] = [1022 - i * 9, 64 + i * 38];
          return (
            S.box(box(step, y, 293 - step, 2), 0, foil, { ties: { l: 'start', r: 'mid' } }) +
            S.box(box(457, y, 293 - step, 2), 0, foil, { ties: { l: 'mid', r: 'end' } })
          );
        })
        .join('');
    const gem = (x, y) => `<path ${foil} d="M${x} ${y - 11}l7 11-7 11-7-11Z"/>`;
    // The plaque of the name: foil with steps for corners, and a hairline inside its edge.
    const stepped = (by) => {
      const [w, h, s] = [520 - by, 84 - by, 8];
      return `M${by + 2 * s} ${by}H${w - 2 * s}v${s}h${s}v${s}h${s}V${h - 2 * s}h${-s}v${s}h${-s}v${s}H${by + 2 * s}v${-s}h${-s}v${-s}h${-s}V${by + 2 * s}h${s}v${-s}h${s}Z`;
    };
    const plaque = art(
      'plaque-gold',
      520,
      84,
      tile('foil', 'styles-gold-foil', 260) +
        `<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff6d0" stop-opacity=".45"/><stop offset=".45" stop-color="#fff6d0" stop-opacity="0"/><stop offset="1" stop-color="#4a2f00" stop-opacity=".4"/></linearGradient>`,
      `<path ${foil} d="${stepped(0)}"/><path fill="url(#sheen)" d="${stepped(0)}"/>` +
        line(stepped(6), '#2b1c05', 1.3, ' stroke-opacity=".75"'),
    );
    return magnet(
      'magnet-black-gold',
      'Black and gold magnet',
      'מגנט שחור וזהב',
      [W, H, 12],
      {
        opening,
        window: (S) => S.shape(cutBox(-1), 'fill="#000"'),
        draw: (S) => ({
          defs:
            tile('foil', 'styles-gold-foil', 260) +
            `<radialGradient id="depth" cx=".5" cy=".4" r=".75"><stop stop-color="#2a2a30"/><stop offset="1" stop-color="#09090b"/></radialGradient>` +
            ring(S, 'near', 10, 3.2) +
            ring(S, 'far', 20, 1.3),
          body:
            ground(S, 'url(#depth)') +
            S.outline(box(20, 20, W - 40, H - 40), 0, 1.6, 'stroke="url(#foil)"') +
            S.whole(`${foil} mask="url(#near)"`) +
            S.whole(`${foil} mask="url(#far)"`) +
            [
              [1, 1],
              [-1, 1],
              [1, -1],
              [-1, -1],
            ]
              .map(([sx, sy]) => corner(S, sx, sy))
              .join('') +
            S.pin(gem(20, 525), [20, 525], { x: 'start', y: 'mid' }) +
            S.pin(gem(730, 525), [730, 525], { x: 'end', y: 'mid' }) +
            S.pin(gem(375, 20), [375, 20], { x: 'mid', y: 'start' }) +
            wings(S) +
            S.pin(sun, [cx, cy], { x: 'mid', y: 'end' }),
        }),
        extras: [
          caption(
            95,
            892,
            560,
            48,
            { text: 'רגעים של זהב', font: 'Heebo', size: 30, weight: 400, spacing: 8 },
            { text: 'GOLDEN MOMENTS', font: 'Montserrat', size: 28, weight: 500, spacing: 9 },
            { color: '#ecc96f' },
          ),
          label(plaque, 115, 792, [
            caption(
              25,
              12,
              470,
              60,
              { text: 'משפחת שגיא', font: 'Frank Ruhl Libre', size: 46, weight: 700 },
              {
                text: 'THE SAGI FAMILY',
                font: 'Playfair Display',
                size: 30,
                weight: 700,
                spacing: 4,
              },
              { color: '#1f1503' },
            ),
          ]),
        ],
      },
      {
        en: 'style black gold foil elegant deco luxury festive',
        he: 'סגנון שחור זהב מוזהב אלגנטי יוקרתי חגיגי דקו',
      },
    );
  }

  /* ---- a frame of 35mm film: holes along both edges, amber marks, a mark in red pencil */
  function film() {
    const [W, H] = [1050, 750];
    const opening = box(44, 100, 962, 550);
    const amber = '#f3a63b';
    /** The holes of the film: as large and as far apart at any size, one in the very middle. */
    const PERF = { w: 36, h: 26, pitch: 62, top: 56, bottom: 668 };
    const holes = (S, y, tie) =>
      S.pin(
        `<rect x="-3000" y="${y}" width="7050" height="${PERF.h}" fill="url(#holes)"/>`,
        [W / 2, y],
        { x: 'mid', y: tie },
      );
    // What a film has printed on its edge, drawn as lines: an arrow, then the figures.
    const FIGURES = {
      2: 'M1 4Q1 0 5 0T9 4Q9 7.500 1 16H9.500',
      4: 'M7.500 16V0L.500 11H10',
      A: 'M0 16 5 0 10 16M2 10.500H8',
    };
    const edgeMark = (x, y, figures) =>
      `<path d="M${x} ${y + 4}l10 6.500-10 6.500Z" fill="${amber}"/>` +
      [...figures]
        .map((figure, i) =>
          line(
            FIGURES[figure],
            amber,
            1.9,
            ` stroke-linecap="round" stroke-linejoin="round" transform="translate(${x + 20 + i * 17} ${y}) scale(1.25)"`,
          ),
        )
        .join('');
    // The code a camera reads off the edge: blocks, thick and thin.
    const next = random(2435);
    const code = (x, y, length) => {
      const blocks = [];
      for (let at = x; at < x + length;) {
        const wide = [5, 5, 9, 14][Math.floor(next() * 4)];
        blocks.push(`<rect x="${at}" y="${y}" width="${wide}" height="15"/>`);
        at += wide + [5, 9][Math.floor(next() * 2)];
      }
      return `<g fill="${amber}" fill-opacity=".8">${blocks.join('')}</g>`;
    };
    // The label of the roll: paper with a double line of red, as on a box of slides.
    const roll = art(
      'film-label',
      300,
      86,
      '',
      `<rect width="300" height="86" rx="5" fill="#f6efdd"/>` +
        `<rect x="6" y="6" width="288" height="74" rx="2" fill="none" stroke="#c6352b" stroke-width="2.200"/>` +
        `<rect x="11.500" y="11.500" width="277" height="63" rx="1" fill="none" stroke="#c6352b" stroke-width=".9"/>`,
    );
    // The tick of an editor's red pencil: two passes of wax, with the grain of the paper in it.
    const tick = art(
      'pencil-tick',
      190,
      160,
      `<pattern id="grain" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(31)"><rect width="13" height="13" fill="#fff"/><path d="M1 3h4M8 7h3M4 11h2.500M10 1.500h2" stroke="#000" stroke-width="1.100" stroke-opacity=".6"/></pattern>` +
        `<mask id="wax"><rect width="190" height="160" fill="url(#grain)"/></mask>`,
      `<g mask="url(#wax)" fill="none" stroke="#dd2a1f" stroke-linecap="round" stroke-linejoin="round">` +
        `<path stroke-width="13" d="M20 86C38 97 52 116 64 140 86 90 124 46 170 16"/>` +
        `<path stroke-width="6" stroke-opacity=".6" d="M27 80C43 95 56 112 67 131 92 84 128 50 163 24"/>` +
        `</g>`,
    );
    return magnet(
      'magnet-film',
      'Film frame magnet',
      'מגנט בסגנון פילם',
      [W, H, 4],
      {
        opening,
        round: 6,
        // The holes are holes: the slide shows through them.
        card: (S) =>
          S.box(box(0, 0, W, H), 4, 'fill="#fff"') +
          holes(S, PERF.top, 'start') +
          holes(S, PERF.bottom, 'end'),
        draw: (S) => ({
          defs:
            `<pattern id="holes" x="${W / 2 - PERF.w / 2}" y="${PERF.top}" width="${PERF.pitch}" height="${PERF.bottom - PERF.top}" patternUnits="userSpaceOnUse"><rect width="${PERF.w}" height="${PERF.h}" rx="6"/></pattern>` +
            `<linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1d1815"/><stop offset=".5" stop-color="#120f0d"/><stop offset="1" stop-color="#1b1613"/></linearGradient>` +
            `<linearGradient id="beside" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#3a2d24"/><stop offset="1" stop-color="#211a15"/></linearGradient>`,
          body:
            ground(S, 'url(#base)') +
            onBorder(
              // The frames before and after: a sliver of each at the two ends of the card.
              S.box(box(0, 100, 20, 550), [0, 6, 6, 0], 'fill="url(#beside)"'),
              S.box(box(1030, 100, 20, 550), [6, 0, 0, 6], 'fill="url(#beside)"'),
              S.pin(`<path d="M44 20l12 7.500-12 7.500Z" fill="${amber}"/>`, [44, 20], {
                x: 'start',
                y: 'start',
              }),
              S.pin(code(660, 19, 150), [735, 19], { x: 'end', y: 'start' }),
              S.pin(edgeMark(60, 712, '24'), [60, 712], { x: 'start', y: 'end' }),
              S.pin(code(826, 715, 170), [910, 715], { x: 'end', y: 'end' }),
            ) +
            frameLine(S, 0, 6, '#3b302a', 1.2),
        }),
        extras: [
          caption(
            68,
            6,
            520,
            42,
            {
              text: '24A · הקיץ שלנו',
              font: 'IBM Plex Sans Hebrew',
              size: 25,
              weight: 600,
              spacing: 1,
            },
            { text: '24A · OUR SUMMER', font: 'JetBrains Mono', size: 23, weight: 600, spacing: 2 },
            { color: amber, align: 'left' },
          ),
          label(
            roll,
            26,
            598,
            [
              caption(
                16,
                20,
                268,
                46,
                { text: 'פילם 07 · כנרת', font: 'IBM Plex Sans Hebrew', size: 25, weight: 500 },
                { text: 'ROLL 07 · KINNERET', font: 'JetBrains Mono', size: 21, weight: 500 },
                { color: '#2b2622' },
              ),
            ],
            { turn: -4 },
          ),
          sticker(tick, 846, 60, 180, { turn: 6 }),
        ],
      },
      {
        en: 'style film 35mm analog negative photography cinema camera roll',
        he: 'סגנון פילם סרט צילום אנלוגי נגטיב קולנוע מצלמה',
      },
    );
  }

  /* ---- the seventies: stripes that sweep around a corner, big words, a badge like a sun */
  function retro() {
    const [W, H] = [1050, 750];
    const opening = box(40, 40, 900, 530);
    const [brown, cream] = ['#3b2216', '#f6e6c5'];
    /** The stripes, from the photograph outwards: each `T` thick, around a turn at `C`. */
    const bands = [cream, '#ebb23a', '#e2742d', '#b9442a'];
    const [T, C, first] = [14, { x: 904, y: 612 }, 71];
    const stripes = (S) =>
      bands
        .map((colour, i) => {
          const r = first + i * T;
          const paint = `fill="${colour}"`;
          return (
            // Along the foot of the card, up its side, and the turn between the two.
            S.box(box(0, C.y + r - T / 2, C.x + 0.5, T + (i < 3 ? 0.6 : 0)), 0, paint) +
            S.box(box(C.x + r - T / 2, 0, T + (i < 3 ? 0.6 : 0), C.y + 0.5), 0, paint) +
            S.pin(
              line(
                `M${C.x} ${C.y + r}A${r} ${r} 0 0 0 ${C.x + r} ${C.y}`,
                colour,
                T + (i < 3 ? 1.2 : 0),
              ),
              [C.x, C.y],
              { x: 'end', y: 'end' },
            )
          );
        })
        .reverse()
        .join('');
    // A badge like a sun: rays, a disc, a ring of stitches.
    const rays = (r, inner, count) =>
      `M${around(count * 2, 0, (i) => (i % 2 ? inner / r : 1))
        .map(([x, y]) => `${f(98 + x * r)} ${f(98 + y * r)}`)
        .join('L')}Z`;
    const badge = art(
      'sun-badge',
      196,
      196,
      '',
      `<path fill="#e2742d" d="${rays(97, 80, 24)}"/>` +
        `<circle cx="98" cy="98" r="78" fill="${brown}"/>` +
        `<circle cx="98" cy="98" r="72" fill="#ebb23a"/>` +
        `<circle cx="98" cy="98" r="64" fill="none" stroke="${brown}" stroke-width="2" stroke-dasharray=".1 6.600" stroke-linecap="round"/>`,
    );
    return magnet(
      'magnet-retro',
      'Retro seventies magnet',
      'מגנט רטרו',
      [W, H, 30],
      {
        opening,
        round: 56,
        draw: (S) => ({
          defs:
            // The grain of an old print: a few specks, lighter and darker.
            `<pattern id="specks" width="90" height="90" patternUnits="userSpaceOnUse"><g fill="#fff" fill-opacity=".05"><circle cx="12" cy="20" r="1.300"/><circle cx="58" cy="9" r="1"/><circle cx="74" cy="52" r="1.500"/><circle cx="33" cy="66" r="1.100"/></g><g fill="#000" fill-opacity=".12"><circle cx="40" cy="30" r="1.200"/><circle cx="82" cy="80" r="1"/><circle cx="8" cy="78" r="1.300"/><circle cx="62" cy="40" r=".9"/></g></pattern>` +
            `<radialGradient id="warm" cx=".2" cy="1" r=".9"><stop stop-color="#5a3320"/><stop offset="1" stop-color="#5a3320" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, brown) +
            onBorder(S.whole('fill="url(#warm)"'), S.whole('fill="url(#specks)"'), stripes(S)) +
            frameLine(S, 0, 56, cream, 7),
        }),
        extras: [
          caption(
            44,
            576,
            560,
            96,
            { text: 'קיץ בלי סוף', font: 'Suez One', size: 78 },
            { text: 'Endless Summer', font: 'DM Serif Display', size: 66, italic: true },
            { color: cream, align: 'left' },
          ),
          caption(
            580,
            616,
            360,
            42,
            { text: 'אוגוסט · חוף דור', font: 'Heebo', size: 24, weight: 500, spacing: 3 },
            { text: 'AUGUST · DOR BEACH', font: 'Poppins', size: 20, weight: 500, spacing: 4 },
            { color: '#ebb23a', align: 'right' },
          ),
          label(badge, 838, 16, [
            caption(
              34,
              42,
              128,
              52,
              { text: 'ימים', font: 'Suez One', size: 44 },
              { text: 'GOOD', font: 'Poppins', size: 33, weight: 800, spacing: 1 },
              { color: brown },
            ),
            caption(
              34,
              100,
              128,
              52,
              { text: 'טובים', font: 'Suez One', size: 44 },
              { text: 'TIMES', font: 'Poppins', size: 33, weight: 800, spacing: 1 },
              { color: brown },
            ),
          ]),
        ],
      },
      {
        en: 'style retro seventies 70s vintage groovy stripes sun warm',
        he: 'סגנון רטרו וינטג׳ שנות השבעים פסים שמש חם נוסטלגיה',
      },
    );
  }

  /* ---- a ticket: the card is cut as one, with a stub behind a line of holes */
  function ticket() {
    const [W, H] = [1050, 750];
    /** Where the stub is torn off: it is as wide at any size. */
    const tear = 854;
    const opening = box(48, 48, 758, 452);
    const [stock, red, ink] = ['#f6ecd6', '#bf3429', '#2a2320'];
    // The bars of the code: thick and thin, the same on every run.
    const next = random(731);
    let at = 560;
    const bars = [];
    while (at < 800) {
      const wide = [2, 2, 3, 5, 7][Math.floor(next() * 5)];
      if (at + wide > 806) break;
      bars.push(`<rect x="${at}" y="622" width="${wide}" height="76"/>`);
      at += wide + [3, 3, 4, 6][Math.floor(next() * 4)];
    }
    // A box of the ticket: what it counts on a strip of red, and the number under it.
    const chip = art(
      'ticket-box',
      108,
      92,
      '',
      `<rect x="1.500" y="1.500" width="105" height="89" rx="9" fill="#fffaf0" stroke="${red}" stroke-width="3"/>` +
        `<path fill="${red}" d="M1.500 34V10.500a9 9 0 0 1 9-9h87a9 9 0 0 1 9 9V34Z"/>`,
    );
    const counted = (x, he, en, number) =>
      label(chip, x, 616, [
        caption(
          4,
          1,
          100,
          33,
          { text: he, font: 'Heebo', size: 21, weight: 700 },
          { text: en, font: 'Poppins', size: 20, weight: 600, spacing: 3 },
          { color: '#fffaf0' },
        ),
        caption(
          4,
          36,
          100,
          52,
          { text: number, font: 'Poppins', size: 40, weight: 700 },
          { text: number, font: 'Poppins', size: 40, weight: 700 },
          { color: ink },
        ),
      ]);
    const medal = art(
      'ticket-star',
      80,
      80,
      '',
      `<circle cx="40" cy="40" r="37" fill="none" stroke="${stock}" stroke-width="2.500"/>` +
        `<circle cx="40" cy="40" r="31" fill="none" stroke="${stock}" stroke-width="1.200" stroke-dasharray=".1 5" stroke-linecap="round"/>` +
        `<path d="${star(40, 41, 22)}" fill="${stock}"/>`,
    );
    return magnet(
      'magnet-ticket',
      'Ticket magnet',
      'מגנט בסגנון כרטיס כניסה',
      [W, H, 22],
      {
        opening,
        round: 4,
        // The ticket: a bite out of each side, a notch at each end of the tear, and the holes
        // of the tear itself. Through all of them the slide shows.
        card: (S) =>
          S.box(box(0, 0, W, H), 22, 'fill="#fff"') +
          `<circle cx="0" cy="50%" r="30"/><circle cx="100%" cy="50%" r="30"/>` +
          S.pin(
            `<circle cx="${tear}" cy="0" r="15"/>` +
              line(`M${tear} 8V5000`, '#000', 6, ' stroke-dasharray="0 16" stroke-linecap="round"'),
            [tear, 0],
            { x: 'end', y: 'start' },
          ) +
          S.pin(`<circle cx="${tear}" cy="${H}" r="15"/>`, [tear, H], { x: 'end', y: 'end' }),
        draw: (S) => ({
          defs:
            // The fine lines a ticket is printed over: two waves that cross.
            `<pattern id="waves" width="48" height="22" patternUnits="userSpaceOnUse">` +
            line('M0 11q12-13 24 0t24 0', red, 1.1, ' stroke-opacity=".16"') +
            line('M0 11q12 13 24 0t24 0', red, 1.1, ' stroke-opacity=".16"') +
            `</pattern>`,
          body:
            ground(S, stock) +
            onBorder(
              S.whole('fill="url(#waves)"'),
              S.box(box(tear, 0, W - tear, H), 0, `fill="${red}"`),
              // The stub's own frame, and a line of stitches inside it.
              S.outline(box(tear + 22, 22, W - tear - 44, H - 44), 10, 2, `stroke="${stock}"`),
              S.pin(`<g fill="${ink}">${bars.join('')}</g>`, [806, 698], { x: 'end', y: 'end' }),
              S.pin(
                `<path fill="${red}" d="${star(404, 662, 13)}${star(444, 662, 9)}${star(364, 662, 9)}"/>`,
                [404, 662],
                { x: 'mid', y: 'end' },
              ),
            ) +
            frameLine(S, 7, 9, red, 2.4) +
            frameLine(S, 13, 14, red, 0.9),
        }),
        extras: [
          caption(
            48,
            526,
            758,
            70,
            { text: 'יום שלא נשכח', font: 'Suez One', size: 56 },
            { text: 'A Day to Remember', font: 'DM Serif Display', size: 54 },
            { color: ink, align: 'left' },
          ),
          counted(48, 'שורה', 'ROW', '7'),
          counted(168, 'מושב', 'SEAT', '12'),
          sticker(medal, 912, 48, 80),
          caption(
            717,
            352,
            470,
            86,
            { text: 'כניסה אחת', font: 'Secular One', size: 64, spacing: 6 },
            { text: 'ADMIT ONE', font: 'Poppins', size: 58, weight: 800, spacing: 8 },
            { color: stock, turn: 90 },
          ),
          caption(
            882,
            662,
            140,
            40,
            { text: 'מס׳ 0731', font: 'IBM Plex Sans Hebrew', size: 24, weight: 500 },
            { text: 'No. 0731', font: 'JetBrains Mono', size: 22, weight: 500 },
            { color: stock },
          ),
        ],
      },
      {
        en: 'style ticket admit one cinema show stub pass retro',
        he: 'סגנון כרטיס כניסה קולנוע הופעה הצגה ספח רטרו',
      },
    );
  }

  /* ---- pop art: halftone, thick black lines, a speech bubble and a narration box */
  function pop() {
    const [W, H] = [1050, 750];
    const opening = box(60, 92, 880, 540);
    const [yellow, pink, cyan, ink] = ['#ffd91c', '#ff3e8e', '#19c3f2', '#141414'];
    /**
     * Halftone out of a corner: rows of dots at half a right angle, each row one dashed line,
     * the dots smaller the further the row is from the corner. `into` is +1 where the card
     * lies below the corner and -1 where it lies above it.
     */
    const halftone = (colour, rows, largest, pitch, into) =>
      Array.from({ length: rows }, (_, k) =>
        line(
          `M-1500 ${f(into * k * pitch * 0.866)}H1500`,
          colour,
          f(largest * (1 - k / rows) ** 0.8),
          ` stroke-dasharray="0 ${pitch}" stroke-linecap="round"${k % 2 ? ` stroke-dashoffset="${pitch / 2}"` : ''}`,
        ),
      ).join('');
    // The block behind the photograph, set off down and to the right.
    const behind = box(opening.x + 20, opening.y + 20, opening.w, opening.h);
    const shadowed = (d, fill, by = 7) =>
      `<path d="${d}" fill="${ink}" transform="translate(${by} ${by})"/>` +
      `<path d="${d}" fill="${fill}" stroke="${ink}" stroke-width="5.500" stroke-linejoin="round"/>`;
    const narration = art('pop-narration', 404, 84, '', shadowed('M3 3H393V73H3Z', '#fff8dc'));
    const bubble = art(
      'pop-bubble',
      340,
      226,
      '',
      shadowed(
        'M78 4H252a74 74 0 0 1 74 74v6a74 74 0 0 1-74 74H150L44 212l32-54A74 74 0 0 1 4 84v-6A74 74 0 0 1 78 4Z',
        '#ffffff',
      ),
    );
    const points = (cx, cy, r, inner, count, turn = 0) =>
      `M${around(count * 2, turn, (i) => (i % 2 ? inner / r : 1))
        .map(([x, y]) => `${f(cx + x * r)} ${f(cy + y * r)}`)
        .join('L')}Z`;
    const pow = art(
      'pop-burst',
      184,
      184,
      '',
      shadowed(points(88, 88, 84, 56, 14), pink, 6) +
        `<path d="${points(88, 88, 52, 36, 14, 12)}" fill="${yellow}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>` +
        `<path fill="${ink}" d="M79 60h18l-4.500 34h-9Z"/><circle cx="88" cy="106" r="7" fill="${ink}"/>`,
    );
    const strip = art(
      'pop-continued',
      306,
      62,
      '',
      `<path d="M21 6H306L291 62H6Z" fill="${pink}"/><path d="M15 0H300L285 56H0Z" fill="${ink}"/>`,
    );
    const comic = (he, en, color, more = {}) => [
      { text: he.text, font: 'Rubik', size: he.size, weight: 800, italic: true },
      { text: en.text, font: 'Rubik', size: en.size, weight: 800, italic: true },
      { color, ...more },
    ];
    return magnet(
      'magnet-pop',
      'Pop art magnet',
      'מגנט פופ ארט',
      [W, H, 10],
      {
        opening,
        draw: (S) => ({
          body:
            ground(S, yellow) +
            onBorder(
              `<g transform="rotate(-45)">${halftone(cyan, 13, 15, 19, 1)}</g>`,
              S.pin(
                `<g transform="translate(${W} ${H}) rotate(-45)">${halftone(pink, 26, 19, 21, -1)}</g>`,
                [W, H],
                { x: 'end', y: 'end' },
              ),
              S.box(behind, 0, `fill="${cyan}"`),
              S.outline(behind, 0, 6, `stroke="${ink}"`),
            ) +
            S.outline(box(8, 8, W - 16, H - 16), 4, 6, `stroke="${ink}"`) +
            frameLine(S, 0, 0, ink, 9),
        }),
        extras: [
          sticker(pow, 18, 548, 184, { turn: -8 }),
          label(strip, 716, 670, [
            caption(
              20,
              6,
              262,
              44,
              ...comic(
                { text: 'המשך יבוא…', size: 27 },
                { text: 'TO BE CONTINUED…', size: 21 },
                yellow,
              ),
            ),
          ]),
          label(
            narration,
            26,
            30,
            [
              caption(
                16,
                10,
                364,
                56,
                ...comic(
                  { text: 'בינתיים, אי שם בצפון…', size: 28 },
                  { text: 'MEANWHILE, UP NORTH…', size: 24 },
                  ink,
                ),
              ),
            ],
            { turn: -2.5 },
          ),
          label(
            bubble,
            694,
            14,
            [
              caption(
                24,
                30,
                282,
                104,
                { text: 'איזה יום!', font: 'Karantina', size: 88, weight: 700 },
                { text: 'WHAT A DAY!', font: 'Karantina', size: 60, weight: 700 },
                { color: ink },
              ),
            ],
            { turn: 4 },
          ),
        ],
      },
      {
        en: 'style pop art comic halftone speech bubble bold colourful',
        he: 'סגנון פופ ארט קומיקס בועת דיבור נקודות צבעוני נועז',
      },
    );
  }

  /* ---- kraft and twine: a card of kraft paper smaller than the box, a print taped to it */
  function kraft() {
    const [W, H] = [750, 1050];
    /** The card of kraft: the box of the frame is bare to its right and below it. */
    const sheet = box(34, 34, 640, 940);
    const opening = box(98, 214, 512, 548);
    const print = inset(opening, -16);
    const [rope, twist, inked] = ['#efe6d2', '#b2946a', '#1c110a'];
    /** Twine along a path: the cord, and the lighter turns of its twist. */
    const twine = (d, width = 7) =>
      line(d, '#5e4124', width + 2.4, ' stroke-opacity=".4" stroke-linecap="round"') +
      line(d, rope, width, ' stroke-linecap="round"') +
      line(d, twist, width, ` stroke-dasharray="2 ${f(width * 0.8)}"`);
    const bow = art(
      'twine-bow',
      210,
      140,
      '',
      twine('M105 62C84 96 66 112 52 132') +
        twine('M105 62C122 98 140 112 158 130') +
        twine('M105 60C74 14 12 10 16 50S76 86 105 62') +
        twine('M105 60C136 14 198 10 194 50S134 86 105 62') +
        `<ellipse cx="105" cy="61" rx="12" ry="10" fill="${rope}" stroke="#5e4124" stroke-opacity=".45" stroke-width="1.400"/>` +
        line('M97 56q8 5 16 0M97 63q8 5 16 0', twist, 1.8, ' stroke-linecap="round"'),
    );
    // Washi tape: thin paper that lets the print show through, torn at both ends.
    const torn =
      'M3 0H157l3 5.500-3 5.500 3 5.500-3 5.500 3 5.500-3 5.500 3 5.500-3 5.500H3l-3-5.500 3-5.500-3-5.500 3-5.500-3-5.500 3-5.500-3-5.500 3-5.500Z';
    const tape = (name, colour, printed) =>
      art(
        name,
        160,
        44,
        `<pattern id="print" width="16" height="16" patternUnits="userSpaceOnUse">${printed}</pattern>`,
        `<path d="${torn}" fill="${colour}" fill-opacity=".88"/><path d="${torn}" fill="url(#print)"/>`,
      );
    const sage = tape(
      'washi-sage',
      '#9db8a2',
      `<circle cx="4" cy="4" r="2" fill="#fff" fill-opacity=".75"/><circle cx="12" cy="12" r="2" fill="#fff" fill-opacity=".75"/>`,
    );
    const clay = tape(
      'washi-clay',
      '#d99a7c',
      `<path d="M0 16 16 0M-4 4 4-4M12 20l8-8" stroke="#fff" stroke-opacity=".6" stroke-width="2.400"/>`,
    );
    // A postmark: the rings of the stamp, the bars of its date, the waves that cancel.
    const postmark = art(
      'postmark',
      222,
      150,
      '',
      `<g fill="none" stroke="${inked}" stroke-opacity=".82" stroke-linecap="round">` +
        `<circle cx="75" cy="75" r="71" stroke-width="2.600"/><circle cx="75" cy="75" r="64.500" stroke-width="1"/>` +
        `<circle cx="75" cy="75" r="55" stroke-width="2.400" stroke-dasharray=".1 7.200"/>` +
        `<path stroke-width="1.800" d="M30 54H120M30 96H120"/>` +
        `<path stroke-width="2.200" d="${[40, 58, 76, 94, 112].map((y) => `M150 ${y}q9-8 18 0t18 0 18 0 16 0`).join('')}"/>` +
        `</g>` +
        `<path d="${star(75, 37, 8)}${star(75, 114, 8)}" fill="${inked}" fill-opacity=".82"/>`,
    );
    // The tag of the words: card with its corners cut at the hole, and the twine it hangs by.
    const tag = art(
      'paper-tag',
      384,
      140,
      '',
      twine('M36 72C14 54 10 26 34 6', 4.4) +
        twine('M36 72C30 46 46 22 74 10', 4.4) +
        `<path d="M44 8H376a4 4 0 0 1 4 4V132a4 4 0 0 1-4 4H44L8 104V40Z" fill="#fbf7ee" stroke="#d8cbb3" stroke-width="1.400"/>` +
        `<circle cx="36" cy="72" r="14" fill="none" stroke="#d2c3a6" stroke-width="5"/>` +
        `<circle cx="36" cy="72" r="8" fill="#b88c57"/>` +
        twine('M36 72C24 62 16 50 14 38', 4.4),
    );
    return magnet(
      'magnet-kraft',
      'Kraft and twine magnet',
      'מגנט קראפט',
      [W, H, 8],
      {
        opening,
        card: (S) => S.box(sheet, 8, 'fill="#fff"'),
        draw: (S) => ({
          defs:
            tile('kraft', 'kraft-paper', 300) +
            `<pattern id="twist" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(58)"><rect width="8" height="8" fill="${rope}"/><rect width="2.400" height="8" fill="${twist}"/></pattern>`,
          body:
            ground(S, 'url(#kraft)') +
            onBorder(
              S.outline(inset(sheet, 1), 7, 2, 'stroke="#7a5630" stroke-opacity=".35"'),
              // The twine goes twice around the card, under the bow.
              ...[117, 129].flatMap((y) => [
                S.box(box(sheet.x, y - 1.2, sheet.w, 9.4), 0, 'fill="#5e4124" fill-opacity=".4"'),
                S.box(box(sheet.x, y, sheet.w, 7), 0, 'fill="url(#twist)"'),
              ]),
              // The print: its white edge, and the line where it lies on the kraft.
              S.outline(inset(print, -1), 3, 2, 'stroke="#6b4a26" stroke-opacity=".28"'),
              S.box(print, 2, 'fill="#fdfbf5"'),
            ),
        }),
        extras: [
          sticker(picture('wc-florals-4'), 452, 822, 298, { flip: true, turn: 180, under: true }),
          sticker(sage, 10, 180, 160, { turn: -38 }),
          sticker(clay, 548, 178, 160, { turn: 36 }),
          sticker(bow, 249, 62, 210),
          label(
            postmark,
            440,
            806,
            [
              caption(
                27,
                55,
                96,
                40,
                { text: '24.8', font: 'JetBrains Mono', size: 30, weight: 600 },
                { text: '24.8', font: 'JetBrains Mono', size: 30, weight: 600 },
                { color: inked },
              ),
            ],
            { turn: -9 },
          ),
          label(
            tag,
            46,
            806,
            [
              caption(
                70,
                16,
                296,
                58,
                { text: 'רגעים קטנים', font: 'David Libre', size: 46, weight: 700 },
                {
                  text: 'little moments',
                  font: 'Playfair Display',
                  size: 40,
                  weight: 600,
                  italic: true,
                },
                { color: '#3a2c1e' },
              ),
              caption(
                70,
                90,
                296,
                40,
                { text: 'משפחת ברק', font: 'Heebo', size: 28, weight: 400, spacing: 3 },
                { text: 'THE BARAKS', font: 'Montserrat', size: 28, weight: 500, spacing: 5 },
                { color: '#7d5f3c' },
              ),
            ],
            { turn: -4 },
          ),
        ],
      },
      {
        en: 'style kraft paper twine rustic natural handmade craft tag washi',
        he: 'סגנון קראפט נייר חום חבל כפרי טבעי עבודת יד תגית',
      },
    );
  }

  /* ---- the cover of a magazine: a masthead, the photograph nearly whole, lines of cover */
  function magazine() {
    const [W, H] = [750, 1050];
    const opening = box(20, 178, 710, 852);
    const [ink, red, sun] = ['#111111', '#e02228', '#ffd400'];
    const strip = (name, w, h, fill) =>
      art(name, w, h, '', `<rect width="${w}" height="${h}" fill="${fill}"/>`);
    const first = strip('cover-line-sun', 500, 70, sun);
    const second = strip('cover-line-ink', 404, 56, ink);
    const third = strip('cover-line-red', 384, 54, red);
    // The bars of a price code, on its white patch.
    const next = random(77);
    const bars = [];
    for (let at = 16; at < 132;) {
      const wide = [2, 2, 3, 4, 6][Math.floor(next() * 5)];
      if (at + wide > 134) break;
      const guard = at < 22 || at > 124 || (at > 70 && at < 78);
      bars.push(`<rect x="${at}" y="12" width="${wide}" height="${guard ? 76 : 66}"/>`);
      at += wide + [2, 3, 3, 5][Math.floor(next() * 4)];
    }
    const code = art(
      'cover-barcode',
      150,
      100,
      '',
      `<rect width="150" height="100" fill="#ffffff"/><g fill="${ink}">${bars.join('')}</g>`,
    );
    const issue = art(
      'cover-issue',
      132,
      132,
      '',
      `<circle cx="66" cy="66" r="66" fill="${red}"/>` +
        `<circle cx="66" cy="66" r="58" fill="none" stroke="#ffffff" stroke-width="1.600" stroke-opacity=".85"/>`,
    );
    return magnet(
      'magnet-magazine',
      'Magazine cover magnet',
      'מגנט שער מגזין',
      [W, H, 4],
      {
        opening,
        draw: (S) => ({
          body: ground(S, '#ffffff') + frameLine(S, 0, 0, ink, 1.5),
        }),
        extras: [
          caption(
            20,
            4,
            710,
            174,
            { text: 'רגעים', font: 'Frank Ruhl Libre', size: 150, weight: 900, spacing: 10 },
            { text: 'MOMENTS', font: 'Playfair Display', size: 104, weight: 900, spacing: 3 },
            { color: ink },
          ),
          sticker(code, 582, 926, 134),
          label(first, 0, 792, [
            caption(
              36,
              5,
              440,
              60,
              { text: 'הקיץ הכי יפה שלנו', font: 'Heebo', size: 43, weight: 900 },
              { text: 'BEST SUMMER EVER', font: 'Montserrat', size: 33, weight: 900 },
              { color: ink, align: 'left' },
            ),
          ]),
          label(second, 0, 868, [
            caption(
              36,
              4,
              350,
              48,
              { text: 'חיוכים, ים ושקיעות', font: 'Frank Ruhl Libre', size: 34, weight: 500 },
              {
                text: 'Smiles, sea & sunsets',
                font: 'Playfair Display',
                size: 30,
                weight: 600,
                italic: true,
              },
              { color: '#ffffff', align: 'left' },
            ),
          ]),
          label(third, 0, 930, [
            caption(
              36,
              5,
              324,
              44,
              { text: 'הסיפור המלא בפנים', font: 'Heebo', size: 28, weight: 700 },
              { text: 'THE FULL STORY', font: 'Montserrat', size: 28, weight: 700, spacing: 1 },
              { color: '#ffffff', align: 'left' },
            ),
          ]),
          label(issue, 592, 150, [
            caption(
              4,
              24,
              124,
              40,
              { text: 'גיליון', font: 'Heebo', size: 28, weight: 700 },
              { text: 'ISSUE', font: 'Montserrat', size: 28, weight: 700, spacing: 1 },
              { color: '#ffffff' },
            ),
            caption(
              10,
              62,
              112,
              54,
              { text: '07', font: 'Playfair Display', size: 46, weight: 800 },
              { text: '07', font: 'Playfair Display', size: 46, weight: 800 },
              { color: '#ffffff' },
            ),
          ]),
        ],
      },
      {
        en: 'style magazine cover editorial fashion masthead headline press',
        he: 'סגנון מגזין שער עיתון אופנה כותרת עיתונות',
      },
    );
  }

  /* ---- a neon sign on a wall of dark brick, and an arrow of tubes that points at the picture */
  function neon() {
    const [W, H] = [1050, 750];
    const opening = box(50, 46, 950, 596);
    const [pink, cyan] = ['#ff4fa8', '#3fe3ff'];
    const glow = (w, h) =>
      `<filter id="glow" filterUnits="userSpaceOnUse" x="-20" y="-20" width="${w + 40}" height="${h + 40}"><feGaussianBlur stdDeviation="6"/></filter>`;
    /** A tube of neon along a path: its glow, the glass, and the light inside it. */
    const tube = (d, colour, width = 5) => {
      const round = ' stroke-linecap="round" stroke-linejoin="round"';
      return (
        line(d, colour, width * 2.8, `${round} stroke-opacity=".75" filter="url(#glow)"`) +
        line(d, colour, width, round) +
        line(d, '#ffffff', width * 0.34, `${round} stroke-opacity=".9"`)
      );
    };
    // The sign: a dark plate on four screws, a tube around its edge, and light behind the words.
    const sign = art(
      'neon-sign',
      520,
      176,
      glow(520, 176),
      `<rect x="3" y="3" width="514" height="170" rx="22" fill="#0d0a14" fill-opacity=".95"/>` +
        `<rect x="3.800" y="3.800" width="512.400" height="168.400" rx="21" fill="none" stroke="#3a3350" stroke-width="1.600"/>` +
        `<ellipse cx="260" cy="76" rx="190" ry="34" fill="${pink}" fill-opacity=".3" filter="url(#glow)"/>` +
        tube(
          'M38 18H482a20 20 0 0 1 20 20V138a20 20 0 0 1-20 20H38a20 20 0 0 1-20-20V38a20 20 0 0 1 20-20Z',
          pink,
          4.6,
        ) +
        tube('M52 135H118', cyan, 3.4) +
        tube('M402 135H468', cyan, 3.4) +
        [
          [36, 36],
          [484, 36],
          [36, 140],
          [484, 140],
        ]
          .map(
            ([x, y]) =>
              `<circle cx="${x}" cy="${y}" r="4.200" fill="#565070"/><path d="M${x - 2.4} ${y - 2.4}l4.800 4.800" stroke="#14111d" stroke-width="1.200"/>`,
          )
          .join(''),
    );
    const arrow = art(
      'neon-arrow',
      240,
      176,
      glow(240, 176),
      tube('M26 88 98 24V62H214V114H98V152Z', cyan, 6.6) +
        tube('M70 88 108 54V76H196V100H108V122Z', pink, 4),
    );
    return magnet(
      'magnet-neon',
      'Neon sign magnet',
      'מגנט שלט ניאון',
      [W, H, 14],
      {
        opening,
        round: 6,
        draw: (S) => ({
          defs:
            tile('brick', 'styles-brick', 300) +
            `<radialGradient id="rose" cx=".22" cy=".92" r=".55"><stop stop-color="${pink}" stop-opacity=".5"/><stop offset="1" stop-color="${pink}" stop-opacity="0"/></radialGradient>` +
            `<radialGradient id="ice" cx=".9" cy=".1" r=".5"><stop stop-color="${cyan}" stop-opacity=".4"/><stop offset="1" stop-color="${cyan}" stop-opacity="0"/></radialGradient>` +
            `<linearGradient id="dusk" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#05040a" stop-opacity=".05"/><stop offset=".6" stop-color="#05040a" stop-opacity=".38"/><stop offset="1" stop-color="#05040a" stop-opacity=".1"/></linearGradient>`,
          body:
            ground(S, 'url(#brick)') +
            onBorder(
              S.whole('fill="url(#dusk)"'),
              S.whole('fill="url(#rose)"'),
              S.whole('fill="url(#ice)"'),
            ) +
            // The photograph hangs on the wall in a thin frame of black metal.
            frameLine(S, 4, 9, '#08070c', 8) +
            frameLine(S, 8.5, 13, '#4a4660', 1.2),
        }),
        extras: [
          sticker(arrow, 800, 50, 216, { turn: -30 }),
          label(
            sign,
            32,
            538,
            [
              caption(
                40,
                32,
                440,
                80,
                { text: 'הלילה עוד צעיר', font: 'Varela Round', size: 54 },
                { text: 'The Night Is Young', font: 'Varela Round', size: 41 },
                { color: '#ffe1f1' },
              ),
              caption(
                130,
                116,
                260,
                38,
                { text: 'פתוח כל הלילה', font: 'Heebo', size: 22, weight: 500, spacing: 3 },
                { text: 'OPEN ALL NIGHT', font: 'Poppins', size: 20, weight: 500, spacing: 3 },
                { color: '#9bf1ff' },
              ),
            ],
            { turn: -4 },
          ),
        ],
      },
      {
        en: 'style neon sign night bar brick wall glow urban',
        he: 'סגנון ניאון שלט לילה בר קיר לבנים זוהר אורבני',
      },
    );
  }

  /* ---- botanical: watercolour greenery on cream paper, heavy at one corner and light at another */
  function botanical() {
    const [W, H] = [1050, 750];
    const opening = box(64, 62, 922, 526);
    const [leaf, deep] = ['#4f6b4a', '#2c4633'];
    return magnet(
      'magnet-botanical',
      'Botanical magnet',
      'מגנט בוטני',
      [W, H, 12],
      {
        opening,
        round: 3,
        draw: (S) => ({
          defs:
            tile('paper', 'styles-paper', 320) +
            `<radialGradient id="wash" cx=".5" cy=".5" r=".5"><stop stop-color="#b9cbb0" stop-opacity=".55"/><stop offset=".6" stop-color="#b9cbb0" stop-opacity=".25"/><stop offset="1" stop-color="#b9cbb0" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, 'url(#paper)') +
            onBorder(
              // Two washes of green, where the leaves are: one to each corner.
              S.pin(
                `<ellipse cx="150" cy="640" rx="330" ry="230" fill="url(#wash)"/>`,
                [150, 640],
                { x: 'start', y: 'end' },
              ),
              S.pin(`<ellipse cx="900" cy="70" rx="300" ry="170" fill="url(#wash)"/>`, [900, 70], {
                x: 'end',
                y: 'start',
              }),
              S.pin(
                `<rect x="906" y="681" width="80" height="1.600" fill="${leaf}"/>`,
                [986, 681],
                { x: 'end', y: 'end' },
              ),
            ) +
            frameLine(S, 8, 3, leaf, 1.8) +
            frameLine(S, 14, 3, leaf, 0.8),
        }),
        extras: [
          sticker(picture('styles-greenery-2'), 664, 2, 380),
          sticker(picture('styles-greenery-1'), 4, 448, 352),
          caption(
            420,
            596,
            566,
            80,
            { text: 'רגעים יפים', font: 'Frank Ruhl Libre', size: 66, weight: 500 },
            {
              text: 'Beautiful Moments',
              font: 'Playfair Display',
              size: 54,
              weight: 500,
              italic: true,
            },
            { color: deep, align: 'right' },
          ),
          caption(
            420,
            692,
            566,
            38,
            { text: 'משפחת אורן · אביב', font: 'Heebo', size: 23, weight: 400, spacing: 4 },
            {
              text: 'THE OREN FAMILY · SPRING',
              font: 'Montserrat',
              size: 20,
              weight: 500,
              spacing: 5,
            },
            { color: leaf, align: 'right' },
          ),
        ],
      },
      {
        en: 'style botanical greenery leaves watercolour nature garden fern',
        he: 'סגנון בוטני ירוק עלים צבעי מים טבע גן שרך צמחים',
      },
    );
  }

  return [
    minimal(),
    blackGold(),
    film(),
    retro(),
    pop(),
    kraft(),
    ticket(),
    magazine(),
    neon(),
    botanical(),
  ];
}
