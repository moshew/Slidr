/*
 * The magnets of the holidays (`../frames-magnets.mjs`): Rosh Hashanah, Sukkot, Hanukkah, Tu
 * BiShvat, Purim, Pesach, Independence Day, Lag BaOmer, Shavuot and the Mimouna. Each lives on
 * the things of its holiday, which are painted pictures (one sheet a holiday, all in one hand)
 * laid over the edge of the photograph, and on a plate of its own that carries the greeting.
 */

/** @param kit What a magnet is drawn with (`kit.mjs`). */
export default function holidays(kit) {
  const { around, random, box, inset, f, percent } = kit;
  const { magnet, sticker, caption, label, art, picture, tile, ground, onBorder, line } = kit;
  const { frameLine, sparkle, scattered, pick } = kit;

  const deg = (radians) => (radians * 180) / Math.PI;

  /** A closed outline through points around a centre: `M…L…Z`. */
  const outline = (points, cx = 0, cy = 0, r = 1) =>
    `M${points.map(([x, y]) => `${f(cx + x * r)} ${f(cy + y * r)}`).join('L')}Z`;
  /** A ring of `count` points that go out to `r` and in to `inner` of it: a seal, a ruffle. */
  const rays = (cx, cy, r, count, inner, turn = 0) =>
    outline(
      around(count * 2, turn, (i) => (i % 2 ? inner : 1)),
      cx,
      cy,
      r,
    );
  /** A hexagon that stands on a point. */
  const hexagon = (cx, cy, r) => outline(around(6), cx, cy, r);

  /**
   * A strip of the card that is as high at any size and as wide a share of the card: `body` is
   * drawn in the box given, which keeps its distance from the foot of the card and is stretched
   * along it.
   */
  const strip = (S, { x, y, w, h }, body) =>
    `<svg y="100%" overflow="visible">` +
    `<svg x="${percent(x / S.w)}" y="${f(y - S.h)}" width="${percent(w / S.w)}" height="${f(h)}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="none" overflow="visible">${body}</svg></svg>`;

  /**
   * A generated picture inside a drawing of the magnets' own, `size` wide from the corner of
   * the drawing: for a plate that is a painted thing. The kit gives a picture as a sticker of
   * its own size or as a pattern, so the picture is taken out of the pattern.
   */
  const pictured = (name, size) => /<image[^>]*\/>/.exec(tile('picture', name, size))[0];

  /**
   * A line around a window whose corners are not all as round: a box of the colour that is
   * `by` larger than the photograph. It is drawn on the card only, so it shows as a line.
   */
  const rim = (S, by, radii, fill) =>
    S.box(
      inset(S.opening, -by),
      radii.map((r) => r + by),
      `fill="${fill}"`,
    );

  /* ---- Rosh Hashanah: a honeycomb on cream, a pomegranate branch over the corner, honey and an apple */
  function roshHashana() {
    const opening = box(40, 40, 970, 524);
    // The comb: hexagons that stand on a point, in a pattern that starts at the foot of the card
    // on its left, where the cells full of honey are.
    const R = 24;
    const [across, down] = [Math.sqrt(3) * R, 3 * R];
    const comb =
      `M${f(across / 2)} 0L${f(across)} ${f(R / 2)}V${f(1.5 * R)}L${f(across / 2)} ${f(2 * R)}` +
      `L0 ${f(1.5 * R)}V${f(R / 2)}ZM${f(across / 2)} ${f(2 * R)}V${f(down)}`;
    /** The middle of a cell of the comb: `row` counts up from the foot, `col` from the left. */
    const cell = (col, row) =>
      row % 2
        ? [across / 2 + col * across, R - ((row + 1) / 2) * down]
        : [col * across, 2.5 * R - (row / 2 + 1) * down];
    const next = random(1801);
    const full = [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [6, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [4, 1],
      [1, 2],
      [2, 2],
      [3, 2],
      [0, 3],
      [2, 3],
      [7, 1],
      [9, 0],
    ]
      .map(([col, row]) => {
        const [x, y] = cell(col, row);
        return `<path d="${hexagon(x, y, R - 3)}" fill="url(#honey)" fill-opacity="${f(0.35 + next() * 0.55)}"/>`;
      })
      .join('');
    // A few sparks of gold beside the words.
    const sparks = (S) =>
      [
        [560, 590, 9],
        [1022, 664, 7],
        [468, 716, 6],
        [24, 22, 7],
        [1030, 300, 6],
      ]
        .map(([x, y, r]) =>
          S.pin(`<path d="${sparkle(x, y, r, 0.26)}" fill="#d9a23a" fill-opacity=".8"/>`, [x, y]),
        )
        .join('');
    // The chip: a cell of the comb in the red of the pomegranate, with a line of cream inside.
    const chip = art(
      'holidays-comb-chip',
      148,
      168,
      `<linearGradient id="red" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c22a3a"/><stop offset="1" stop-color="#8a1323"/></linearGradient>`,
      `<path d="${hexagon(74, 84, 82)}" fill="url(#red)" stroke="url(#red)" stroke-width="4" stroke-linejoin="round"/>` +
        `<path d="${hexagon(74, 84, 70)}" fill="none" stroke="#f9e2b0" stroke-width="2" stroke-linejoin="round" stroke-dasharray=".1 6" stroke-linecap="round"/>` +
        `<path d="${sparkle(74, 30, 7, 0.3)}" fill="#f6cf74"/><path d="${sparkle(74, 138, 7, 0.3)}" fill="#f6cf74"/>`,
    );
    return magnet(
      'magnet-rosh-hashana',
      'Rosh Hashanah magnet',
      'מגנט לראש השנה',
      [1050, 750, 28],
      {
        opening,
        round: 20,
        draw: (S) => ({
          defs:
            `<linearGradient id="cream" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fdf6e4"/><stop offset="1" stop-color="#f7e3b4"/></linearGradient>` +
            `<radialGradient id="warm" cx=".06" cy="1" r=".6"><stop stop-color="#f3c35a" stop-opacity=".75"/><stop offset="1" stop-color="#f3c35a" stop-opacity="0"/></radialGradient>` +
            `<linearGradient id="honey" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7c948"/><stop offset="1" stop-color="#e0911c"/></linearGradient>` +
            `<pattern id="comb" width="${f(across)}" height="${f(down)}" patternUnits="userSpaceOnUse"><path d="${comb}" fill="none" stroke="#d9a441" stroke-opacity=".42" stroke-width="1.6"/></pattern>`,
          body:
            ground(S, 'url(#cream)') +
            onBorder(
              S.whole('fill="url(#warm)"'),
              `<svg y="100%" overflow="visible"><rect y="-6000" width="9000" height="6000" fill="url(#comb)"/>${full}</svg>`,
              sparks(S),
            ) +
            frameLine(S, 9, 28, '#c8922e', 1.6) +
            frameLine(S, 0, 20, '#fffaf0', 7),
        }),
        extras: [
          sticker(picture('holidays-rosh-1'), 742, 8, 296),
          sticker(picture('holidays-rosh-2'), 50, 440, 152, { turn: -4 }),
          sticker(picture('holidays-rosh-3'), 116, 578, 218),
          label(
            chip,
            322,
            484,
            [
              caption(
                14,
                38,
                120,
                42,
                { text: 'חג', font: 'Suez One', size: 34 },
                { text: 'Shana', font: 'DM Serif Display', size: 30 },
                { color: '#fff3d6' },
              ),
              caption(
                14,
                88,
                120,
                42,
                { text: 'שמח', font: 'Suez One', size: 34 },
                { text: 'Tova', font: 'DM Serif Display', size: 30 },
                { color: '#fff3d6' },
              ),
            ],
            { turn: -6 },
          ),
          caption(
            478,
            584,
            534,
            86,
            { text: 'שנה טובה ומתוקה', font: 'Frank Ruhl Libre', size: 68, weight: 800 },
            {
              text: 'A Sweet New Year',
              font: 'Playfair Display',
              size: 56,
              weight: 700,
              italic: true,
            },
            { color: '#8f1626', align: 'right' },
          ),
          caption(
            478,
            676,
            534,
            40,
            { text: 'באהבה, משפחת שגיא', font: 'Assistant', size: 30, weight: 600, spacing: 1 },
            {
              text: 'WITH LOVE, THE SAGI FAMILY',
              font: 'Montserrat',
              size: 22,
              weight: 600,
              spacing: 3,
            },
            { color: '#7a5510', align: 'right' },
          ),
        ],
      },
      {
        en: 'holiday jewish new year rosh hashanah honey apple pomegranate shana tova',
        he: 'חג חגים ראש השנה שנה טובה דבש תפוח רימון תשרי הרמת כוסית',
      },
    );
  }

  /* ---- Sukkot: the frame is a sukkah of boards, with thatch over the top and paper chains under it */
  function sukkot() {
    const opening = box(46, 116, 958, 454);
    // The paper chain: links along three swags, one seen from the front and the next from its side.
    const hooks = [
      [12, 16],
      [292, 12],
      [566, 18],
      [818, 12],
    ];
    const sags = [44, 38, 42];
    const papers = ['#e5484d', '#f7b529', '#35b56f', '#3f8cf0', '#a35bf0', '#f0569a'];
    const course = hooks.slice(0, -1).flatMap(([x0, y0], i) => {
      const [x1, y1] = hooks[i + 1];
      return Array.from({ length: 200 }, (_, n) => {
        const t = n / 200;
        return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sags[i] * 4 * t * (1 - t)];
      });
    });
    const links = [];
    for (let i = 1, travelled = 0, at = 6; i < course.length; i++) {
      const [[ax, ay], [bx, by]] = [course[i - 1], course[i]];
      const step = Math.hypot(bx - ax, by - ay);
      for (; travelled + step >= at; at += 21) {
        const t = (at - travelled) / step;
        const colour = papers[links.length % papers.length];
        const where = `transform="translate(${f(ax + (bx - ax) * t)} ${f(ay + (by - ay) * t)}) rotate(${f(deg(Math.atan2(by - ay, bx - ax)))})"`;
        links.push(
          links.length % 2
            ? `<g ${where}><rect x="-4.500" y="-11" width="9" height="22" rx="4.500" fill="${colour}"/><rect x="-4.500" y="-11" width="4" height="22" rx="2" fill="#000000" fill-opacity=".16"/></g>`
            : `<g ${where}><ellipse rx="16" ry="10.500" fill="none" stroke="${colour}" stroke-width="7"/><path d="M-13-6.500A16 10.500 0 0 1 13-6.500" fill="none" stroke="#ffffff" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/></g>`,
        );
      }
      travelled += step;
    }
    const chain = art('holidays-paper-chain', 830, 82, '', links.join(''));
    // A lantern of folded paper on a string, as children cut and hang in a sukkah: two bands,
    // between them the strips that bulge when the paper is pushed together, and a fringe.
    const strips = [-3, -2, -1, 0, 1, 2, 3]
      .map((k) => {
        const [band, belly] = [45 + k * 8, 45 + k * 13.4];
        return (
          `<path d="M${band - 4} 124Q${f(belly - 6.7)} 170 ${band - 4} 216h8Q${f(belly + 6.7)} 170 ${band + 4} 124Z" ` +
          `fill="${k % 2 ? '#14a39e' : '#2bc9c2'}" stroke="#0a6e6d" stroke-opacity=".45" stroke-width="1"/>`
        );
      })
      .join('');
    const fringe = [24, 34.5, 45, 55.5, 66]
      .map((x, i) =>
        line(
          `M${x} 230v${i % 2 ? 13 : 17}`,
          i % 2 ? '#ffd257' : '#f0569a',
          5.5,
          ' stroke-linecap="round"',
        ),
      )
      .join('');
    const lantern = art(
      'holidays-paper-lantern',
      90,
      252,
      `<linearGradient id="band" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#f29d0e"/><stop offset=".4" stop-color="#ffd257"/><stop offset="1" stop-color="#e88a00"/></linearGradient>`,
      line('M45 0V92', '#8a6a3c', 2.6, ' stroke-linecap="round"') +
        line('M22 112Q45 68 68 112', '#f29d0e', 6, ' stroke-linecap="round"') +
        fringe +
        strips +
        `<path d="M25 132Q8 170 25 208" fill="none" stroke="#ffffff" stroke-opacity=".4" stroke-width="3.5" stroke-linecap="round"/>` +
        `<rect x="15" y="108" width="60" height="17" rx="4" fill="url(#band)"/><rect x="15" y="215" width="60" height="17" rx="4" fill="url(#band)"/>`,
    );
    // The sign: a board of pale wood on four nails, its ends sawn a little out of true.
    const plank = art(
      'holidays-plank-sukkah',
      580,
      132,
      `<linearGradient id="board" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fcefd2"/><stop offset="1" stop-color="#eed3a0"/></linearGradient>`,
      `<path d="M9 7 572 4l5 60-6 64L7 128 3 66Z" fill="url(#board)" stroke="#7a4a1f" stroke-width="3" stroke-linejoin="round"/>` +
        line(
          'M20 30q90-9 180 0t180 0 180-2M18 104q110 8 220 0t320 2M40 66q60-5 120 0M430 70q50 5 110 0',
          '#b88b4f',
          1.6,
          ' stroke-opacity=".55" stroke-linecap="round"',
        ) +
        [
          [24, 24],
          [556, 22],
          [24, 110],
          [556, 110],
        ]
          .map(
            ([x, y]) =>
              `<circle cx="${x}" cy="${y}" r="5.500" fill="#5a3a1c"/><circle cx="${x - 1.5}" cy="${y - 1.5}" r="1.800" fill="#c9a877"/>`,
          )
          .join(''),
    );
    return magnet(
      'magnet-sukkot',
      'Sukkot magnet',
      'מגנט לסוכות',
      [1050, 750, 16],
      {
        opening,
        round: 8,
        draw: (S) => ({
          defs:
            `<linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#c9955a"/><stop offset="1" stop-color="#a9733c"/></linearGradient>` +
            `<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#9c6b37"/><stop offset="1" stop-color="#7f5429"/></linearGradient>` +
            `<linearGradient id="post" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#a87841"/><stop offset=".5" stop-color="#bd894d"/><stop offset="1" stop-color="#96673a"/></linearGradient>` +
            `<radialGradient id="dusk" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#3a2110" stop-opacity="0"/><stop offset="1" stop-color="#3a2110" stop-opacity=".4"/></radialGradient>` +
            `<pattern id="grain" width="320" height="60" patternUnits="userSpaceOnUse"><path d="M0 9q80-8 160 0t160 0M0 29q80 7 160 0t160 0M0 49q60-6 120-2t200 2" fill="none" stroke="#7a4a1f" stroke-opacity=".24" stroke-width="1.6"/></pattern>` +
            `<pattern id="upright" width="46" height="300" patternUnits="userSpaceOnUse"><path d="M10 0q-6 75 0 150t0 150M27 0q7 75 0 150t0 150M38 0q-4 60 0 130t0 170" fill="none" stroke="#7a4a1f" stroke-opacity=".24" stroke-width="1.6"/></pattern>`,
          body:
            ground(S, 'url(#wood)') +
            onBorder(
              S.whole('fill="url(#grain)"'),
              // The boards of the wall at the foot: a seam and the light on the board under it.
              ...[630, 690].map(
                (y) =>
                  S.box(box(0, y, 1050, 3), 0, 'fill="#7a4a1f" fill-opacity=".6"') +
                  S.box(box(0, y + 3, 1050, 2), 0, 'fill="#f3d7a6" fill-opacity=".5"'),
              ),
              // The two posts and the beam that the thatch lies on.
              S.box(box(0, 0, 46, 750), 0, 'fill="url(#post)"'),
              S.box(box(0, 0, 46, 750), 0, 'fill="url(#upright)"'),
              S.box(box(1004, 0, 46, 750), 0, 'fill="url(#post)"'),
              S.box(box(1004, 0, 46, 750), 0, 'fill="url(#upright)"'),
              S.box(box(0, 0, 1050, 116), 0, 'fill="url(#beam)"'),
              S.box(box(0, 0, 1050, 116), 0, 'fill="url(#grain)"'),
              S.box(box(0, 113, 1050, 3), 0, 'fill="#4a2c12" fill-opacity=".6"'),
              // The corners of the sukkah are in shade.
              S.whole('fill="url(#dusk)"'),
            ) +
            frameLine(S, 7, 13, '#5a3719', 2.4) +
            frameLine(S, 0, 8, '#fff1d6', 6),
        }),
        extras: [
          // Hung from the beam, under the thatch: the chain, the lantern and a pomegranate.
          sticker(chain, 110, 100, 830),
          sticker(lantern, 136, 48, 76),
          sticker(picture('holidays-sukkot-pomegranate'), 838, 78, 100),
          sticker(picture('holidays-sukkot-schach'), 150, 0, 750),
          sticker(picture('holidays-sukkot-lulav'), 850, 412, 170, { turn: 8 }),
          label(
            plank,
            60,
            598,
            [
              caption(
                60,
                8,
                460,
                34,
                { text: 'חג סוכות שמח', font: 'Heebo', size: 24, weight: 700, spacing: 4 },
                { text: 'HAPPY SUKKOT', font: 'Montserrat', size: 22, weight: 700, spacing: 6 },
                { color: '#7a3d0c' },
              ),
              caption(
                40,
                50,
                500,
                68,
                { text: 'הסוכה של משפחת לוי', font: 'Secular One', size: 46 },
                { text: 'The Levi Family Sukkah', font: 'DM Serif Display', size: 40 },
                { color: '#4a2a10' },
              ),
            ],
            { turn: -2 },
          ),
        ],
      },
      {
        en: 'holiday sukkot sukkah tabernacles lulav etrog thatch wood autumn',
        he: 'חג חגים סוכות סוכה לולב אתרוג סכך קישוטים שרשרת תשרי',
      },
    );
  }

  /* ---- Hanukkah: a night-blue card with a window like a gate, the lit hanukkiah at its foot */
  function hanukkah() {
    const opening = box(54, 138, 642, 610);
    const radii = [140, 140, 18, 18];
    const next = random(2512);
    const lights = (S) =>
      scattered(
        next,
        44,
        750,
        1050,
        [inset(opening, -22), box(100, 30, 550, 140), box(40, 984, 670, 66)],
        36,
        16,
      )
        .map(([x, y]) => {
          const opacity = f(0.4 + next() * 0.6);
          return S.pin(
            next() < 0.5
              ? `<path d="${sparkle(x, y, 5 + next() * 9)}" fill="#f3d27a" fill-opacity="${opacity}"/>`
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.5 + next() * 2)}" fill="#fbeab0" fill-opacity="${opacity}"/>`,
            [x, y],
          );
        })
        .join('');
    // The cartouche: a plate of night blue in a frame of gold, its corners cut inward.
    const cut = (x, y, w, h, r) =>
      `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 0 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 0 ${x + w - r} ${y + h}` +
      `H${x + r}A${r} ${r} 0 0 0 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 0 ${x + r} ${y}Z`;
    const cartouche = art(
      'holidays-cartouche-gilt',
      540,
      124,
      `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbeab0"/><stop offset=".5" stop-color="#d9a941"/><stop offset="1" stop-color="#f6dc93"/></linearGradient>` +
        `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#22357f"/><stop offset="1" stop-color="#0f1a4a"/></linearGradient>`,
      `<path d="${cut(2, 2, 536, 120, 24)}" fill="url(#gold)"/>` +
        `<path d="${cut(8, 8, 524, 108, 22)}" fill="url(#night)"/>` +
        `<path d="${cut(15, 15, 510, 94, 20)}" fill="none" stroke="url(#gold)" stroke-width="1.6"/>` +
        `<path d="${sparkle(40, 62, 10, 0.3)}" fill="url(#gold)"/><path d="${sparkle(500, 62, 10, 0.3)}" fill="url(#gold)"/>`,
    );
    return magnet(
      'magnet-hanukkah',
      'Hanukkah magnet',
      'מגנט לחנוכה',
      [750, 1050, 28],
      {
        opening,
        window: (S) =>
          S.box(
            inset(opening, 1),
            radii.map((r) => r - 1),
            'fill="#000"',
          ),
        draw: (S) => ({
          defs:
            `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1a2a6e"/><stop offset=".7" stop-color="#0d1642"/><stop offset="1" stop-color="#1b1330"/></linearGradient>` +
            `<radialGradient id="glow" cx=".5" cy=".85" r=".5"><stop stop-color="#f7b23b" stop-opacity=".78"/><stop offset=".45" stop-color="#e98a2b" stop-opacity=".3"/><stop offset="1" stop-color="#e98a2b" stop-opacity="0"/></radialGradient>` +
            `<linearGradient id="foot" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0d0a22" stop-opacity="0"/><stop offset=".55" stop-color="#0d0a22" stop-opacity=".85"/><stop offset="1" stop-color="#0d0a22" stop-opacity=".95"/></linearGradient>` +
            `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbeab0"/><stop offset=".5" stop-color="#e2b955"/><stop offset="1" stop-color="#f6dc93"/></linearGradient>`,
          body:
            ground(S, 'url(#night)') +
            onBorder(
              // A thin line of gold around the gate, and a thicker one on its edge.
              rim(S, 14, radii, 'url(#gold)'),
              rim(S, 12.4, radii, 'url(#night)'),
              S.whole('fill="url(#glow)"'),
              // The foot of the card is dark again, under the line of words.
              strip(
                S,
                box(0, 940, 750, 110),
                `<rect y="940" width="750" height="110" fill="url(#foot)"/>`,
              ),
              lights(S),
              rim(S, 5, radii, 'url(#gold)'),
            ),
        }),
        extras: [
          sticker(picture('holidays-hanukkah-2'), 24, 838, 196),
          sticker(picture('holidays-hanukkah-1'), 208, 612, 334),
          sticker(picture('holidays-hanukkah-3'), 574, 796, 126, { turn: 14 }),
          label(cartouche, 105, 38, [
            caption(
              60,
              22,
              420,
              80,
              { text: 'חנוכה שמח', font: 'Suez One', size: 66 },
              { text: 'Happy Hanukkah', font: 'Playfair Display', size: 43, weight: 800 },
              { color: '#fbeab0' },
            ),
          ]),
          caption(
            75,
            1000,
            600,
            44,
            { text: 'נס גדול היה פה', font: 'Heebo', size: 30, weight: 500, spacing: 4 },
            { text: 'A FESTIVAL OF LIGHTS', font: 'Montserrat', size: 28, weight: 600, spacing: 5 },
            { color: '#f6dc93' },
          ),
        ],
      },
      {
        en: 'holiday hanukkah chanukah menorah candles dreidel doughnut lights',
        he: 'חג חגים חנוכה חנוכייה נרות סביבון סופגנייה אור כסלו',
      },
    );
  }

  /* ---- Tu BiShvat: an almond branch in bloom across the top, a sapling with its marker */
  function tuBishvat() {
    const opening = box(44, 44, 962, 512);
    const next = random(1502);
    // Petals that the wind took off the branch.
    const petals = (S) =>
      scattered(next, 22, 1050, 750, [inset(opening, -8), box(40, 570, 600, 140)], 44, 12)
        .map(([x, y]) =>
          S.pin(
            `<path d="M0-8C6-4 6 5 0 9C-6 5-6-4 0-8Z" fill="${pick(next, ['#f7b3c8', '#fbd0dc', '#ffffff'])}" transform="translate(${f(x)} ${f(y)}) rotate(${Math.round(next() * 360)})"/>`,
            [x, y],
          ),
        )
        .join('');
    // The marker: a tag on a stake, as it is pushed into the soil beside a sapling.
    const marker = art(
      'holidays-plant-marker',
      270,
      226,
      `<linearGradient id="stake" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#e3c48c"/><stop offset="1" stop-color="#c39a5c"/></linearGradient>`,
      `<path d="M126 70h18v132l-9 22-9-22Z" fill="url(#stake)" stroke="#8a6332" stroke-width="1.6" stroke-linejoin="round"/>` +
        `<rect x="3" y="3" width="264" height="82" rx="16" fill="#fffdf2" stroke="#3d8b4f" stroke-width="4"/>` +
        `<rect x="11" y="11" width="248" height="66" rx="10" fill="none" stroke="#3d8b4f" stroke-opacity=".5" stroke-width="1.6" stroke-dasharray="6 5"/>`,
    );
    return magnet(
      'magnet-tu-bishvat',
      'Tu BiShvat magnet',
      'מגנט לט״ו בשבט',
      [1050, 750, 30],
      {
        opening,
        round: 24,
        draw: (S) => ({
          defs: `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d3ecfb"/><stop offset=".72" stop-color="#fdeaf0"/><stop offset="1" stop-color="#fbdde7"/></linearGradient>`,
          body:
            ground(S, 'url(#sky)') +
            onBorder(
              // Two hills of young green along the foot.
              strip(
                S,
                box(0, 640, 1050, 110),
                `<path d="M0 712C200 676 380 704 560 692S900 668 1050 704V750H0Z" fill="#cfe9bd"/>` +
                  `<path d="M0 734C180 712 330 732 520 724S860 704 1050 728V750H0Z" fill="#a8d68d"/>`,
              ),
              petals(S),
            ) +
            frameLine(S, 9, 32, '#e58fb0', 1.6) +
            frameLine(S, 0, 24, '#ffffff', 8),
        }),
        extras: [
          sticker(picture('holidays-tubishvat-branch'), 4, 22, 730, { turn: 3 }),
          // The marker stands behind the watering can, its stake in the soil.
          label(
            marker,
            664,
            462,
            [
              caption(
                15,
                20,
                240,
                48,
                { text: 'נוטעים יחד', font: 'Varela Round', size: 38 },
                { text: 'Planting together', font: 'Varela Round', size: 24 },
                { color: '#2c6e3c' },
              ),
            ],
            { turn: -8 },
          ),
          sticker(picture('holidays-tubishvat-sapling'), 880, 474, 164),
          sticker(picture('holidays-tubishvat-can'), 716, 612, 176),
          caption(
            60,
            572,
            560,
            84,
            { text: 'ט״ו בשבט שמח', font: 'Rubik', size: 64, weight: 800 },
            { text: 'Happy Tu BiShvat', font: 'Rubik', size: 52, weight: 800 },
            { color: '#b0336a', align: 'left' },
          ),
          caption(
            62,
            660,
            560,
            40,
            { text: 'יום נטיעות עם ילדי גן שקד', font: 'Assistant', size: 30, weight: 700 },
            {
              text: 'TREE PLANTING DAY · GAN SHAKED',
              font: 'Manrope',
              size: 22,
              weight: 700,
              spacing: 2,
            },
            { color: '#2f6b3a', align: 'left' },
          ),
        ],
      },
      {
        en: 'holiday tu bishvat trees planting almond blossom sapling nature spring',
        he: 'חג חגים ט״ו בשבט טו בשבט אילנות נטיעות שקדייה שתיל עץ טבע',
      },
    );
  }

  /* ---- Purim: a carnival of harlequin diamonds, a print laid askew, a mask over its corner */
  function purim() {
    const opening = box(46, 40, 958, 542);
    /** The print, turned a little against the card: its four corners, `by` further out. */
    const print = (by) => [
      [46 - by, 62 - by, { x: 'start', y: 'start' }],
      [992 + by, 40 - by, { x: 'end', y: 'start' }],
      [1004 + by, 560 + by, { x: 'end', y: 'end' }],
      [58 - by, 582 + by, { x: 'start', y: 'end' }],
    ];
    // A second sheet under the print, turned the other way.
    const under = [
      [28, 26, { x: 'start', y: 'start' }],
      [1020, 46, { x: 'end', y: 'start' }],
      [1010, 598, { x: 'end', y: 'end' }],
      [38, 576, { x: 'start', y: 'end' }],
    ];
    const next = random(1403);
    const gay = ['#19c3c0', '#ffd23f', '#ff4f9a', '#ffffff'];
    // Streamers and confetti on the ground of the card.
    const streamers = (S) =>
      scattered(next, 30, 1050, 750, [inset(opening, -10)], 46, 14)
        .map(([x, y]) => {
          const colour = pick(next, gay);
          const at = `transform="translate(${f(x)} ${f(y)}) rotate(${Math.round(next() * 180)})"`;
          const kind = next();
          return S.pin(
            kind < 0.45
              ? `<path d="M-22 0q5.500-12 11 0t11 0 11 0 11 0" fill="none" stroke="${colour}" stroke-width="5" stroke-linecap="round" ${at}/>`
              : kind < 0.75
                ? `<circle cx="${f(x)}" cy="${f(y)}" r="${f(4 + next() * 4)}" fill="${colour}"/>`
                : `<path d="M0-9 8 6H-8Z" fill="${colour}" ${at}/>`,
            [x, y],
          );
        })
        .join('');
    // The banner: a band of cream with folded ends of yellow, and a pill for the small line.
    const banner = art(
      'holidays-banner-purim',
      600,
      166,
      `<linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffdf5"/><stop offset="1" stop-color="#ffefc9"/></linearGradient>`,
      `<path d="M0 34h78v88H0l26-44Z" fill="#ffc21a"/><path d="M600 34h-78v88h78l-26-44Z" fill="#ffc21a"/>` +
        `<path d="M48 104h30v18Z" fill="#b97f00"/><path d="M552 104h-30v18Z" fill="#b97f00"/>` +
        `<rect x="48" y="4" width="504" height="100" rx="8" fill="url(#band)"/>` +
        line(
          'M62 13H538M62 95H538',
          '#12a6a4',
          3,
          ' stroke-linecap="round" stroke-dasharray="14 8"',
        ) +
        `<rect x="100" y="116" width="400" height="46" rx="23" fill="#cf166a"/>` +
        `<rect x="105" y="121" width="390" height="36" rx="18" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.4" stroke-dasharray=".1 5" stroke-linecap="round"/>`,
    );
    return magnet(
      'magnet-purim',
      'Purim magnet',
      'מגנט לפורים',
      [1050, 750, 26],
      {
        opening,
        window: (S) => S.shape(print(-1), 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="violet" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#7a35cf"/><stop offset="1" stop-color="#4f1c9c"/></linearGradient>` +
            `<pattern id="harlequin" width="56" height="88" patternUnits="userSpaceOnUse"><path d="M28 0 56 44 28 88 0 44Z" fill="#ffffff" fill-opacity=".1"/>` +
            `<circle cx="28" cy="0" r="3" fill="#ffd23f"/><circle cx="28" cy="88" r="3" fill="#ffd23f"/><circle cx="0" cy="44" r="3" fill="#ffd23f"/><circle cx="56" cy="44" r="3" fill="#ffd23f"/></pattern>`,
          body:
            ground(S, 'url(#violet)') +
            onBorder(
              S.whole('fill="url(#harlequin)"'),
              streamers(S),
              S.shape(under, 'fill="#19c3c0"'),
              S.shape(print(10), 'fill="#ffffff"'),
            ),
        }),
        extras: [
          sticker(picture('holidays-purim-3'), 846, 428, 180, { turn: 12 }),
          sticker(picture('holidays-purim-2'), 792, 562, 234),
          sticker(picture('holidays-purim-1'), 18, 30, 290, { turn: -12 }),
          label(
            banner,
            70,
            554,
            [
              caption(
                70,
                4,
                460,
                100,
                { text: 'פורים שמח!', font: 'Karantina', size: 86, weight: 700 },
                { text: 'Happy Purim!', font: 'Karantina', size: 86, weight: 700 },
                {
                  color: '#7c3aed',
                  colors: ['#7c3aed', '#0b7f7d', '#d9166b', '#c2410c', '#2563eb'],
                },
              ),
              caption(
                110,
                121,
                380,
                36,
                { text: 'מסיבת התחפושות של גן דקל', font: 'Heebo', size: 24, weight: 700 },
                {
                  text: 'GAN DEKEL IN COSTUME',
                  font: 'Montserrat',
                  size: 20,
                  weight: 700,
                  spacing: 2,
                },
                { color: '#ffffff' },
              ),
            ],
            { turn: -3 },
          ),
        ],
      },
      {
        en: 'holiday purim carnival costume mask hamantaschen gragger party',
        he: 'חג חגים פורים תחפושות מסכה אוזני המן רעשן עדלאידע משלוח מנות אדר',
      },
    );
  }

  /* ---- Pesach: spring green and cream, a window like a leaf, the greeting on a matzah */
  function pesach() {
    const opening = box(44, 86, 962, 500);
    const radii = [110, 16, 110, 16];
    /** A sprig: a stem with three pairs of leaves, from its foot upward. */
    const sprig = (colour) =>
      `<g fill="${colour}"><path d="M0 0V-44" fill="none" stroke="${colour}" stroke-width="1.8" stroke-linecap="round"/>` +
      [-10, -24, -38]
        .map(
          (y) =>
            `<path d="M0 ${y}c6-9 16-10 20-6-4 8-14 9-20 6Z"/><path d="M0 ${y}c-6-9-16-10-20-6 4 8 14 9 20 6Z"/>`,
        )
        .join('') +
      `</g>`;
    /** A line that ends in two leaves, from `x` toward the words: `way` is 1 to the right, -1 to the left. */
    const flourish = (x, y, way) =>
      `<g transform="translate(${x} ${y}) scale(${way} 1)" fill="#7fa85a">` +
      line('M0 0H58', '#7fa85a', 1.8, ' stroke-linecap="round"') +
      `<path d="M56 0c8-13 22-15 30-9-7 11-20 13-30 9Z"/><path d="M56 0c8 13 22 15 30 9-7-11-20-13-30-9Z"/><circle cx="-7" cy="0" r="2.600"/></g>`;
    // The matzah, with the light on it turned up a little so that words can be read on it.
    const matzah = art(
      'holidays-matzah-plate',
      240,
      242,
      '',
      pictured('holidays-pesach-3', 240) +
        `<rect x="26" y="30" width="188" height="182" rx="40" fill="#fff6dc" fill-opacity=".5"/>`,
    );
    return magnet(
      'magnet-pesach',
      'Passover magnet',
      'מגנט לפסח',
      [1050, 750, 26],
      {
        opening,
        window: (S) =>
          S.box(
            inset(opening, 1),
            radii.map((r) => r - 1),
            'fill="#000"',
          ),
        draw: (S) => ({
          defs:
            `<linearGradient id="cream" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fdfaef"/><stop offset="1" stop-color="#f3f0d9"/></linearGradient>` +
            `<pattern id="sprigs" width="132" height="120" patternUnits="userSpaceOnUse">` +
            `<g transform="translate(30 62) rotate(-24) scale(.6)">${sprig('#cfe2b3')}</g><g transform="translate(98 116) rotate(28) scale(.6)">${sprig('#dbe9c4')}</g></pattern>`,
          body:
            ground(S, 'url(#cream)') +
            onBorder(
              S.whole('fill="url(#sprigs)"'),
              // A meadow comes up along the foot.
              strip(
                S,
                box(0, 640, 1050, 110),
                `<path d="M0 700C210 664 420 716 640 690S930 676 1050 700V750H0Z" fill="#dcebc4"/>` +
                  `<path d="M0 728C240 700 400 738 640 722S940 708 1050 726V750H0Z" fill="#c3dba3"/>`,
              ),
              // The line of words at the top lies on clear cream, between two sprigs.
              S.box(box(56, 18, 938, 54), 27, 'fill="url(#cream)"'),
              S.pin(flourish(88, 46, 1), [88, 46], {
                x: 'start',
                y: 'start',
              }),
              S.pin(flourish(962, 46, -1), [962, 46], {
                x: 'end',
                y: 'start',
              }),
              rim(S, 13, radii, '#a9c98a'),
              rim(S, 11.4, radii, 'url(#cream)'),
              rim(S, 5, radii, '#5f8f3e'),
            ),
        }),
        extras: [
          caption(
            190,
            26,
            670,
            40,
            { text: 'ליל הסדר אצל משפחת רוזנטל', font: 'Heebo', size: 28, weight: 500, spacing: 4 },
            {
              text: 'SEDER NIGHT AT THE ROSENTHALS',
              font: 'Montserrat',
              size: 22,
              weight: 600,
              spacing: 5,
            },
            { color: '#3f6b2f' },
          ),
          sticker(picture('holidays-pesach-2'), 26, 470, 230, { turn: -10 }),
          sticker(picture('holidays-pesach-1'), 204, 446, 146),
          label(
            matzah,
            776,
            476,
            [
              caption(
                20,
                48,
                200,
                68,
                { text: 'חג פסח', font: 'Suez One', size: 56 },
                { text: 'Happy', font: 'DM Serif Display', size: 50 },
                { color: '#4a2408' },
              ),
              caption(
                20,
                126,
                200,
                68,
                { text: 'שמח', font: 'Suez One', size: 56 },
                { text: 'Passover', font: 'DM Serif Display', size: 42 },
                { color: '#4a2408' },
              ),
            ],
            { turn: 4 },
          ),
        ],
      },
      {
        en: 'holiday passover pesach seder matzah spring kiddush cup flowers',
        he: 'חג חגים פסח ליל הסדר מצה אביב גביע קידוש פרחים חירות ניסן',
      },
    );
  }

  /* ---- Independence Day: blue and white, bunting along the top, a rosette, a pinwheel */
  function independence() {
    const opening = box(40, 84, 970, 482);
    /** A Star of David in outline: two triangles. */
    const magen = (cx, cy, r, colour, width) =>
      `<g fill="none" stroke="${colour}" stroke-width="${width}" stroke-linejoin="round">` +
      `<path d="${outline(around(3), cx, cy, r)}"/><path d="${outline(around(3, 180), cx, cy, r)}"/></g>`;
    // The bunting: a string in two swags, and pennants that hang from it at its own slope.
    const swags = [
      { x0: 6, y0: 12, x1: 528, y1: 22, sag: 34 },
      { x0: 528, y0: 22, x1: 984, y1: 10, sag: 28 },
    ];
    const hung = (x) => {
      const s = swags.find((one) => x <= one.x1) ?? swags[1];
      const t = (x - s.x0) / (s.x1 - s.x0);
      return {
        y: s.y0 + (s.y1 - s.y0) * t + s.sag * 4 * t * (1 - t),
        turn: deg(Math.atan((s.y1 - s.y0 + s.sag * 4 * (1 - 2 * t)) / (s.x1 - s.x0))),
      };
    };
    const cloth = 'M-27 0H27L0 72Z';
    const pennants = Array.from({ length: 14 }, (_, i) => {
      const x = 42 + i * 69.7;
      const { y, turn } = hung(x);
      const kind = i % 3;
      const drawn =
        kind === 0
          ? `<path d="${cloth}" fill="url(#deep)"/>` +
            (i % 2 ? '' : magen(0, 25, 12, '#ffffff', 2.2))
          : kind === 1
            ? `<path d="${cloth}" fill="#ffffff" stroke="#aac3f2" stroke-width="1.4" stroke-linejoin="round"/>` +
              magen(0, 25, 12, '#1b46c2', 2.2)
            : `<path d="${cloth}" fill="url(#sky)"/>`;
      return (
        `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(turn - (i % 2 ? 3 : -2))})">${drawn}` +
        `<path d="M-27 0H-8L0 72Z" fill="#ffffff" fill-opacity="${kind === 1 ? 0 : 0.14}"/>` +
        `<path d="M-27 0H27L24.500 7H-24.500Z" fill="#0b2470" fill-opacity="${kind === 1 ? 0.12 : 0.22}"/></g>`
      );
    }).join('');
    const bunting = art(
      'holidays-bunting-blue',
      990,
      134,
      `<linearGradient id="deep" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2a5be0"/><stop offset="1" stop-color="#0f2f96"/></linearGradient>` +
        `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#a9c8ff"/><stop offset="1" stop-color="#6f9cf0"/></linearGradient>`,
      pennants +
        line(
          swags
            .map(
              (s) =>
                `M${s.x0} ${s.y0}Q${(s.x0 + s.x1) / 2} ${(s.y0 + s.y1) / 2 + 2 * s.sag} ${s.x1} ${s.y1}`,
            )
            .join(''),
          '#122c78',
          3,
          ' stroke-linecap="round"',
        ) +
        `<circle cx="6" cy="12" r="5" fill="#122c78"/><circle cx="984" cy="10" r="5" fill="#122c78"/><circle cx="528" cy="22" r="4" fill="#122c78"/>`,
    );
    // The rosette: two tails, two ruffles of pleats, and a disc of white for the words.
    const pleats = (r0, r1, count, colour, opacity) =>
      line(
        around(count)
          .map(
            ([x, y]) =>
              `M${f(110 + x * r0)} ${f(110 + y * r0)}L${f(110 + x * r1)} ${f(110 + y * r1)}`,
          )
          .join(''),
        colour,
        2,
        ` stroke-opacity="${opacity}" stroke-linecap="round"`,
      );
    const rosette = art(
      'holidays-rosette-blue',
      220,
      290,
      `<linearGradient id="deep" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2f62e6"/><stop offset="1" stop-color="#0f2f96"/></linearGradient>` +
        `<linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b9d3ff"/><stop offset="1" stop-color="#7ba6f3"/></linearGradient>`,
      `<g transform="rotate(15 110 110)"><path d="M80 110h60v170l-30-27-30 27Z" fill="url(#deep)"/><path d="M103 110h14v150l-7-6-7 6Z" fill="#ffffff" fill-opacity=".9"/></g>` +
        `<g transform="rotate(-15 110 110)"><path d="M80 110h60v170l-30-27-30 27Z" fill="url(#sky)"/><path d="M103 110h14v150l-7-6-7 6Z" fill="#ffffff" fill-opacity=".9"/></g>` +
        `<path d="${rays(110, 110, 108, 26, 0.9)}" fill="url(#deep)" stroke="#0f2f96" stroke-width="1" stroke-linejoin="round"/>` +
        pleats(78, 102, 26, '#ffffff', 0.3) +
        `<path d="${rays(110, 110, 90, 26, 0.9, 360 / 52)}" fill="url(#sky)" stroke-linejoin="round"/>` +
        pleats(72, 86, 26, '#1b46c2', 0.35) +
        `<circle cx="110" cy="110" r="73" fill="#ffffff"/>` +
        `<circle cx="110" cy="110" r="66" fill="none" stroke="#1b46c2" stroke-width="2.4"/>` +
        `<circle cx="110" cy="110" r="60" fill="none" stroke="#7ba6f3" stroke-width="1.6" stroke-dasharray=".1 6" stroke-linecap="round"/>` +
        // Between the two words: a small star on a line.
        line('M78 110H98M122 110H142', '#7ba6f3', 1.8, ' stroke-linecap="round"') +
        `<path d="${sparkle(110, 110, 7, 0.3)}" fill="#1b46c2"/>`,
    );
    // The pinwheel: four sails of blue, each with its tip folded to the pin, on a striped stick.
    const sails = [0, 90, 180, 270]
      .map(
        (turn, i) =>
          `<g transform="rotate(${turn} 90 90)"><path d="M90 90V6L174 6Z" fill="url(#${i % 2 ? 'sky' : 'deep'})"/>` +
          `<path d="M90 90V6L48 48Z" fill="#ffffff" stroke="#aac3f2" stroke-width="1.2" stroke-linejoin="round"/>` +
          `<path d="M90 90V6L72 40Z" fill="#dbe7ff"/></g>`,
      )
      .join('');
    const pinwheel = art(
      'holidays-pinwheel-blue',
      180,
      300,
      `<linearGradient id="deep" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2f62e6"/><stop offset="1" stop-color="#0f2f96"/></linearGradient>` +
        `<linearGradient id="sky" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b9d3ff"/><stop offset="1" stop-color="#6f9cf0"/></linearGradient>` +
        `<pattern id="twist" width="12" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)"><rect width="12" height="22" fill="#ffffff"/><rect width="12" height="10" fill="#2f62e6"/></pattern>`,
      `<rect x="84.500" y="90" width="11" height="206" rx="5.500" fill="url(#twist)" stroke="#9db7ee" stroke-width="1"/>` +
        sails +
        `<circle cx="90" cy="90" r="11" fill="#ffffff" stroke="#0f2f96" stroke-width="3"/><circle cx="90" cy="90" r="4" fill="#0f2f96"/>`,
    );
    /** A burst of fireworks: rays, every second one short, and a dot at the end of the long ones. */
    const burst = (cx, cy, r, count, colour, opacity) =>
      `<g stroke="${colour}" fill="${colour}" stroke-width="2.4" stroke-linecap="round" opacity="${opacity}">` +
      around(count)
        .map(([x, y], i) => {
          const far = i % 2 ? 0.7 : 1;
          return (
            `<path d="M${f(cx + x * r * 0.34)} ${f(cy + y * r * 0.34)}L${f(cx + x * r * far * 0.86)} ${f(cy + y * r * far * 0.86)}"/>` +
            (i % 2
              ? ''
              : `<circle cx="${f(cx + x * r)}" cy="${f(cy + y * r)}" r="2.2" stroke="none"/>`)
          );
        })
        .join('') +
      `</g>`;
    const sky = (S) =>
      [
        [270, 704, 40, 14, '#ffffff', 0.34],
        [1004, 652, 34, 12, '#ffffff', 0.3],
        [884, 724, 20, 10, '#ffffff', 0.26],
        [86, 610, 22, 10, '#6f9cf0', 0.55],
        [20, 330, 16, 10, '#6f9cf0', 0.5],
        [1030, 230, 15, 10, '#6f9cf0', 0.5],
      ]
        .map(([x, y, ...rest]) => S.pin(burst(x, y, ...rest), [x, y]))
        .join('');
    const wave = 'M0 676C150 668 250 600 420 598S860 614 1050 582V750H0Z';
    return magnet(
      'magnet-independence',
      'Independence Day magnet',
      'מגנט ליום העצמאות',
      [1050, 750, 26],
      {
        opening,
        round: 16,
        draw: (S) => ({
          defs:
            `<linearGradient id="air" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#e3edff"/></linearGradient>` +
            `<linearGradient id="deep" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1f50d6"/><stop offset="1" stop-color="#0a2478"/></linearGradient>`,
          body:
            ground(S, 'url(#air)') +
            onBorder(
              // The blue comes up from the foot along a wave, with a rim of lighter blue on it.
              strip(
                S,
                box(0, 560, 1050, 190),
                `<path d="${wave}" fill="#8fb4f7" transform="translate(0 -12)"/><path d="${wave}" fill="url(#deep)"/>`,
              ),
              sky(S),
            ) +
            frameLine(S, 8, 24, '#1b46c2', 1.6) +
            frameLine(S, 0, 16, '#ffffff', 7),
        }),
        extras: [
          sticker(bunting, 30, 6, 990),
          label(
            rosette,
            44,
            438,
            [
              caption(
                40,
                64,
                140,
                42,
                { text: 'כחול', font: 'Rubik', size: 36, weight: 800 },
                { text: 'BLUE &', font: 'Poppins', size: 26, weight: 800 },
                { color: '#12349e' },
              ),
              caption(
                40,
                114,
                140,
                42,
                { text: 'לבן', font: 'Rubik', size: 36, weight: 800 },
                { text: 'WHITE', font: 'Poppins', size: 26, weight: 800 },
                { color: '#12349e' },
              ),
            ],
            { turn: -6 },
          ),
          sticker(pinwheel, 834, 436, 180, { turn: 10 }),
          caption(
            250,
            604,
            556,
            80,
            { text: 'חג עצמאות שמח!', font: 'Heebo', size: 60, weight: 900 },
            { text: 'Happy Independence Day!', font: 'Poppins', size: 34, weight: 800 },
            { color: '#ffffff', align: 'right' },
          ),
          caption(
            250,
            686,
            556,
            40,
            { text: 'מנגל, דגלים וזיקוקים ברחוב הגפן', font: 'Heebo', size: 26, weight: 500 },
            {
              text: 'GRILL, FLAGS & FIREWORKS',
              font: 'Montserrat',
              size: 22,
              weight: 600,
              spacing: 3,
            },
            { color: '#d5e3ff', align: 'right' },
          ),
        ],
      },
      {
        en: 'holiday israel independence day blue white bunting fireworks barbecue',
        he: 'חג חגים יום העצמאות עצמאות כחול לבן דגלים זיקוקים מנגל על האש אייר',
      },
    );
  }

  /* ---- Lag BaOmer: a night that warms toward the fire, a bonfire over the foot of the photograph */
  function lagBaomer() {
    const opening = box(50, 56, 650, 660);
    const next = random(1805);
    // Stars above, and sparks that rise from the fire.
    const stars = (S) =>
      scattered(next, 26, 750, 520, [inset(opening, -14)], 30, 12)
        .map(([x, y]) =>
          S.pin(
            next() < 0.4
              ? `<path d="${sparkle(x, y, 4 + next() * 7)}" fill="#fff6d6" fill-opacity="${f(0.5 + next() * 0.5)}"/>`
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.4 + next() * 1.8)}" fill="#ffffff" fill-opacity="${f(0.45 + next() * 0.5)}"/>`,
            [x, y],
          ),
        )
        .join('');
    const sparks = (S) =>
      scattered(next, 46, 750, 1050, [inset(opening, -10), box(0, 0, 750, 520)], 26, 10)
        .map(([x, y]) => {
          const r = 1.6 + next() * 3.2;
          return S.pin(
            `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${pick(next, ['#ffb347', '#ffd76a', '#ff7a2f'])}" fill-opacity="${f(0.45 + next() * 0.55)}"/>`,
            [x, y],
          );
        })
        .join('');
    // The sign: a board the fire has blackened, with embers in its cracks.
    const board = art(
      'holidays-plank-charred',
      600,
      150,
      `<linearGradient id="char" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#43302a"/><stop offset="1" stop-color="#1c1310"/></linearGradient>` +
        `<linearGradient id="ember" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#ff7a2f"/><stop offset=".5" stop-color="#ffc24a"/><stop offset="1" stop-color="#ff7a2f"/></linearGradient>`,
      `<path d="M8 12 60 6l80 5 96-6 110 6 96-5 90 6 54-4 8 62-6 70-60 6-92-5-100 6-104-6-96 5-84-5-46 3-4-70Z" fill="url(#char)" stroke="#0e0907" stroke-width="2.4" stroke-linejoin="round"/>` +
        line(
          'M24 34q120-9 250 0t300-2M22 118q160 8 300 0t256 2',
          '#6a4e42',
          1.6,
          ' stroke-opacity=".7" stroke-linecap="round"',
        ) +
        line(
          'M30 140l34-14 18 8M540 12l-22 16 10 12M566 132l-30-10M70 12l16 14',
          'url(#ember)',
          2.6,
          ' stroke-linecap="round" stroke-linejoin="round"',
        ) +
        `<path d="M6 138 54 142l92-5 104 6 100-6 92 5 60-6 84 4" fill="none" stroke="#ff8a2f" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`,
    );
    return magnet(
      'magnet-lag-baomer',
      'Lag BaOmer magnet',
      'מגנט לל״ג בעומר',
      [750, 1050, 26],
      {
        opening,
        round: 18,
        draw: (S) => ({
          defs:
            `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#141a4c"/><stop offset=".6" stop-color="#241a50"/><stop offset=".86" stop-color="#5a2340"/><stop offset="1" stop-color="#8f3320"/></linearGradient>` +
            `<radialGradient id="fire" cx=".28" cy=".9" r=".5"><stop stop-color="#ff9a2f" stop-opacity=".85"/><stop offset=".5" stop-color="#f0641f" stop-opacity=".35"/><stop offset="1" stop-color="#f0641f" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, 'url(#night)') +
            onBorder(S.whole('fill="url(#fire)"'), stars(S), sparks(S)) +
            frameLine(S, 8, 26, '#ffb347', 1.6, ' stroke-opacity=".8"') +
            frameLine(S, 0, 18, '#fff3d6', 6),
        }),
        extras: [
          sticker(picture('holidays-lagbaomer-1'), 36, 566, 330),
          sticker(picture('holidays-lagbaomer-2'), 340, 664, 250, { flip: true }),
          sticker(picture('holidays-lagbaomer-3'), 520, 730, 200),
          label(
            board,
            75,
            878,
            [
              caption(
                40,
                16,
                520,
                62,
                { text: 'המדורה של השכונה', font: 'Rubik', size: 48, weight: 800 },
                { text: "Our Street's Bonfire", font: 'Space Grotesk', size: 46, weight: 700 },
                { color: '#fff1d6' },
              ),
              caption(
                60,
                96,
                480,
                40,
                { text: 'ל״ג בעומר ברחוב התאנה', font: 'Rubik', size: 30, weight: 500 },
                {
                  text: 'LAG BAOMER NIGHT',
                  font: 'Space Grotesk',
                  size: 28,
                  weight: 600,
                  spacing: 5,
                },
                { color: '#ffb347' },
              ),
            ],
            { turn: -3 },
          ),
        ],
      },
      {
        en: 'holiday lag baomer bonfire campfire night marshmallow potatoes scouts',
        he: 'חג חגים ל״ג בעומר לג בעומר מדורה קומזיץ לילה מרשמלו תפוחי אדמה צופים',
      },
    );
  }

  /* ---- Shavuot: a white print with wheat behind it, a wreath of flowers laid over its top edge */
  function shavuot() {
    const opening = box(52, 78, 816, 496);
    const print = box(20, 46, 880, 690);
    const next = random(605);
    /** An ear of wheat, from its foot upward: a stalk and grains to both sides. */
    const ear = (x, y, turn, s) =>
      `<g transform="translate(${f(x)} ${f(y)}) rotate(${turn}) scale(${s})" fill="#ecdba4" stroke="#dcc27a" stroke-width="1">` +
      `<path d="M0 0V-58" fill="none" stroke-width="1.6" stroke-linecap="round"/>` +
      [-18, -29, -40, -51]
        .map(
          (at) =>
            `<path d="M0 ${at}c7-3 10-10 8-15-6 2-9 8-8 15Z"/><path d="M0 ${at}c-7-3-10-10-8-15 6 2 9 8 8 15Z"/>`,
        )
        .join('') +
      `<path d="M0-55c4-5 4-11 0-16-4 5-4 11 0 16Z"/></g>`;
    const ears = (S) =>
      scattered(
        next,
        9,
        1050,
        750,
        [box(0, 0, 1050, 600), box(0, 600, 548, 150), box(736, 500, 314, 250)],
        38,
        40,
      )
        .map(([x, y]) => S.pin(ear(x, y + 22, Math.round(next() * 50 - 25), 0.72), [x, y]))
        .join('');
    // The ribbon: a band of linen with two tails, stitched along its edges.
    const ribbon = art(
      'holidays-ribbon-linen',
      520,
      112,
      `<pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 3H6M3 0V6" stroke="#cdbd9c" stroke-opacity=".5" stroke-width="1"/></pattern>` +
        `<linearGradient id="linen" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f6efdd"/><stop offset="1" stop-color="#e6dabd"/></linearGradient>`,
      `<path d="M0 28h84v84H0l28-42Z" fill="#d8caa6"/><path d="M520 28h-84v84h84l-28-42Z" fill="#d8caa6"/>` +
        `<path d="M52 88h32v24Z" fill="#a8996f"/><path d="M468 88h-32v24Z" fill="#a8996f"/>` +
        `<rect x="52" width="416" height="88" rx="6" fill="url(#linen)"/><rect x="52" width="416" height="88" rx="6" fill="url(#weave)"/>` +
        line(
          'M66 10H454M66 78H454',
          '#8f7f52',
          2,
          ' stroke-opacity=".8" stroke-dasharray="7 5" stroke-linecap="round"',
        ),
    );
    return magnet(
      'magnet-shavuot',
      'Shavuot magnet',
      'מגנט לשבועות',
      [1050, 750, 0],
      {
        opening,
        round: 10,
        // The print is smaller than the box: the wheat lies under it and shows beside it.
        card: (S) => S.box(print, 20, 'fill="#fff"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="paper" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#f8f1dc"/></linearGradient>` +
            `<linearGradient id="field" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e6eed3" stop-opacity="0"/><stop offset=".3" stop-color="#e6eed3"/><stop offset="1" stop-color="#d9e6bf"/></linearGradient>`,
          body:
            ground(S, 'url(#paper)') +
            onBorder(
              // The foot of the print is a field of young green.
              strip(
                S,
                box(0, 580, 1050, 170),
                `<rect y="580" width="1050" height="170" fill="url(#field)"/>`,
              ),
              ears(S),
            ) +
            S.outline(inset(print, 1), 19, 2, 'stroke="#dcc98f"') +
            frameLine(S, 8, 18, '#c9a23f', 1.6) +
            frameLine(S, 0, 10, '#f3e7c2', 5),
        }),
        extras: [
          // The sheaf lies under the print, and its ears fan out past the edge.
          sticker(picture('holidays-shavuot-2'), 720, 236, 280, { turn: 68, under: true }),
          // The wreath hangs on a corner of the print, where no face is.
          sticker(picture('holidays-shavuot-1'), 4, 4, 210),
          sticker(picture('holidays-shavuot-3'), 756, 540, 270),
          label(
            ribbon,
            4,
            552,
            [
              caption(
                70,
                12,
                380,
                66,
                { text: 'חג שבועות שמח', font: 'Frank Ruhl Libre', size: 50, weight: 800 },
                {
                  text: 'Happy Shavuot',
                  font: 'Playfair Display',
                  size: 44,
                  weight: 700,
                  italic: true,
                },
                { color: '#3c6a3a' },
              ),
            ],
            { turn: -3 },
          ),
          caption(
            60,
            688,
            470,
            38,
            {
              text: 'טקס הביכורים של גן רקפת',
              font: 'Assistant',
              size: 28,
              weight: 600,
              spacing: 1,
            },
            {
              text: 'FIRST FRUITS · GAN RAKEFET',
              font: 'Montserrat',
              size: 21,
              weight: 600,
              spacing: 3,
            },
            { color: '#5f4a12' },
          ),
        ],
      },
      {
        en: 'holiday shavuot harvest wheat first fruits flowers wreath basket white',
        he: 'חג חגים שבועות ביכורים חיטה שיבולים זר פרחים טנא קציר סיוון',
      },
    );
  }

  /* ---- Mimouna: a table in daylight, turquoise and saffron, the blessing in a horseshoe arch */
  function mimouna() {
    const opening = box(40, 40, 970, 536);
    // The cloth of the table: stars of saffron on cream, with magenta and turquoise between them.
    const cloth =
      `<rect width="64" height="61" fill="#fff8ea"/>` +
      `<path d="${rays(32, 30.5, 21, 8, 0.7)}" fill="#f4a51c"/><circle cx="32" cy="30.500" r="6.500" fill="#d81b72"/>` +
      [
        [0, 0],
        [64, 0],
        [0, 61],
        [64, 61],
      ]
        .map(([x, y]) => `<path d="M${x} ${y - 11}l11 11-11 11-11-11Z" fill="#17a2a4"/>`)
        .join('') +
      `<path d="M32-4.500l5 5-5 5-5-5ZM32 56.500l5 5-5 5-5-5ZM0 25.500l5 5-5 5-5-5ZM64 25.500l5 5-5 5-5-5Z" fill="#d81b72"/>`;
    // The arch: a horseshoe on two straight sides, in magenta with lines of gold.
    const arch = art(
      'holidays-arch-mimouna',
      270,
      300,
      `<linearGradient id="rose" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#cf1a6e"/><stop offset="1" stop-color="#96104a"/></linearGradient>` +
        `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbeab0"/><stop offset=".5" stop-color="#e9b949"/><stop offset="1" stop-color="#f6dc93"/></linearGradient>`,
      `<path d="M39 298V217.700A128 128 0 1 1 231 217.700V298Z" fill="url(#gold)"/>` +
        `<path d="M44 293V215.800A123 123 0 1 1 226 215.800V293Z" fill="url(#rose)"/>` +
        `<path d="M53 284V212.200A114 114 0 1 1 217 212.200V284Z" fill="none" stroke="url(#gold)" stroke-width="1.8"/>` +
        `<path d="${rays(135, 46, 13, 8, 0.5)}" fill="url(#gold)"/>` +
        line('M90 236H180', '#f6dc93', 1.8, ' stroke-linecap="round" stroke-dasharray=".1 6"'),
    );
    return magnet(
      'magnet-mimouna',
      'Mimouna magnet',
      'מגנט למימונה',
      [1050, 750, 22],
      {
        opening,
        round: 14,
        draw: (S) => ({
          defs:
            `<linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#27c0b8"/><stop offset="1" stop-color="#0f9499"/></linearGradient>` +
            `<pattern id="zellige" width="60" height="60" patternUnits="userSpaceOnUse"><path d="${rays(30, 30, 20, 8, 0.6)}" fill="none" stroke="#ffffff" stroke-opacity=".2" stroke-width="1.6"/><circle cx="0" cy="0" r="3" fill="#ffffff" fill-opacity=".22"/><circle cx="60" cy="0" r="3" fill="#ffffff" fill-opacity=".22"/><circle cx="0" cy="60" r="3" fill="#ffffff" fill-opacity=".22"/><circle cx="60" cy="60" r="3" fill="#ffffff" fill-opacity=".22"/></pattern>` +
            `<pattern id="cloth" width="64" height="61" patternUnits="userSpaceOnUse">${cloth}</pattern>` +
            `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbeab0"/><stop offset=".5" stop-color="#e9b949"/><stop offset="1" stop-color="#f6dc93"/></linearGradient>`,
          body:
            ground(S, 'url(#sea)') +
            onBorder(
              S.whole('fill="url(#zellige)"'),
              // The cloth lies along the foot, as many stars high at any size, under a hem of gold.
              `<svg y="100%" overflow="visible"><rect y="-122" width="9000" height="122" fill="url(#cloth)"/>` +
                `<rect y="-130" width="9000" height="8" fill="url(#gold)"/><rect y="-133" width="9000" height="3" fill="#a3134f"/></svg>`,
            ) +
            frameLine(S, 9, 22, '#f6dc93', 1.6) +
            frameLine(S, 0, 14, '#fffaf0', 7),
        }),
        extras: [
          sticker(picture('holidays-mimouna-4'), 70, 0, 124),
          sticker(picture('holidays-mimouna-2'), 770, 410, 264),
          sticker(picture('holidays-mimouna-1'), 590, 566, 300),
          label(arch, 46, 438, [
            caption(
              40,
              66,
              190,
              32,
              { text: 'מימונה שמחה', font: 'Heebo', size: 22, weight: 700, spacing: 1 },
              { text: 'MIMOUNA', font: 'Manrope', size: 21, weight: 800, spacing: 5 },
              { color: '#ffffff' },
            ),
            caption(
              25,
              102,
              220,
              58,
              { text: 'תרבחו', font: 'Suez One', size: 48 },
              { text: 'Tirbechu', font: 'DM Serif Display', size: 42 },
              { color: '#ffffff' },
            ),
            caption(
              25,
              162,
              220,
              58,
              { text: 'ותסעדו', font: 'Suez One', size: 48 },
              { text: 'Utis’adu', font: 'DM Serif Display', size: 42 },
              { color: '#ffffff' },
            ),
            caption(
              45,
              246,
              180,
              32,
              { text: 'משפחת אוחיון', font: 'Heebo', size: 22, weight: 500 },
              { text: 'THE OHAYONS', font: 'Manrope', size: 20, weight: 700, spacing: 1 },
              { color: '#ffffff' },
            ),
          ]),
        ],
      },
      {
        en: 'holiday mimouna moroccan mufleta tea sweets table passover end',
        he: 'חג חגים מימונה מופלטה תה מתוקים מרוקאי תרבחו ותסעדו שולחן',
      },
    );
  }

  return [
    roshHashana(),
    sukkot(),
    hanukkah(),
    tuBishvat(),
    purim(),
    pesach(),
    independence(),
    lagBaomer(),
    shavuot(),
    mimouna(),
  ];
}
