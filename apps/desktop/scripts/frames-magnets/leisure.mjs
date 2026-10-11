/*
 * Ten magnets of leisure and the seasons (`../frames-magnets.mjs`): a pool party, a day at the
 * beach, a night of camping, a music festival, a sports day, a ski trip, a barbecue, a road
 * trip, a picnic among the anemones and a race. The card of each is ground only; whatever reads
 * as an object (a float, a sign, a medal, a pass on its lanyard) is an element beside the picture.
 */

/** @param kit What a magnet is drawn with (`kit.mjs`). */
export default function leisure(kit) {
  const { random, box, inset, f } = kit;
  const { magnet, sticker, caption, label, art, picture, tile } = kit;
  const { ground, onBorder, line, frameLine, stretched, scattered, sparkle, star } = kit;

  /**
   * Fine grit over a ground, as a pattern: grains of two tones, `light` and `dark`, strewn over
   * a tile so that no row of them shows.
   */
  const grit = (id, light, dark, seed = 7) => {
    const next = random(seed);
    const grains = Array.from(
      { length: 34 },
      (_, i) =>
        `<circle cx="${f(next() * 72)}" cy="${f(next() * 72)}" r="${f(0.6 + next() * 0.8)}" fill="${i % 2 ? light : dark}"/>`,
    ).join('');
    return `<pattern id="${id}" width="72" height="72" patternUnits="userSpaceOnUse">${grains}</pattern>`;
  };

  /** The head of a screw, seen from above. */
  const screw = (cx, cy, r = 6) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#c3ccd3"/><circle cx="${cx}" cy="${cy}" r="${r - 0.75}" fill="none" stroke="#7d8a94" stroke-width="1.500"/>` +
    `<path d="M${f(cx - r * 0.55)} ${f(cy + r * 0.55)}L${f(cx + r * 0.55)} ${f(cy - r * 0.55)}" stroke="#7d8a94" stroke-width="1.600" stroke-linecap="round"/>`;

  /**
   * An extra moved so that its box, turned as it is, stands so far from two sides of a card of
   * `w` by `h`: `left` or `right`, and `top` or `bottom`. A turned plate is placed by the box
   * it reaches, which is what must stay on the card.
   */
  const tucked = (extra, [w, h], { left, right, top, bottom }) => {
    const turn = ((extra.rotation ?? 0) * Math.PI) / 180;
    const [c, s] = [Math.abs(Math.cos(turn)), Math.abs(Math.sin(turn))];
    const [bw, bh] = [extra.w * c + extra.h * s, extra.w * s + extra.h * c];
    const cx = left !== undefined ? left + bw / 2 : w - right - bw / 2;
    const cy = top !== undefined ? top + bh / 2 : h - bottom - bh / 2;
    return { ...extra, x: Math.round(cx - extra.w / 2), y: Math.round(cy - extra.h / 2) };
  };

  /**
   * A strip along the foot of the card, `high` tall, drawn in the coordinates of the card: as
   * tall at any size, and stretched along the card, so a hill is a hill on a wider card too.
   */
  const footStrip = (S, high, body) =>
    `<svg y="100%" overflow="visible"><svg y="${-high}" width="100%" height="${high}" viewBox="0 ${S.h - high} ${S.w} ${high}" preserveAspectRatio="none">${body}</svg></svg>`;

  /**
   * A row that repeats along the foot of the card: the pattern `id`, whose tile is `high` tall
   * and stands on the foot. A wider card has more of the row, none of it stretched.
   */
  const footRow = (S, id, high) =>
    S.pin(
      `<rect x="-3000" y="${S.h - high}" width="9000" height="${high}" fill="url(#${id})"/>`,
      [0, S.h],
      { x: 'start', y: 'end' },
    );

  /* ---- a pool party: water with light on it, a rim of mosaic, a float, a ring and a sign */
  function pool() {
    const opening = box(40, 40, 970, 570);
    // A lifebuoy with a band of cloth across it: the ring is open, the band carries the day.
    const ring = art(
      'pool-ring',
      240,
      200,
      `<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff" stop-opacity=".6"/><stop offset=".45" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#4a0b16" stop-opacity=".3"/></linearGradient>` +
        `<linearGradient id="band" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#1a6fc0"/><stop offset="1" stop-color="#0c4687"/></linearGradient>`,
      `<circle cx="120" cy="100" r="96" fill="none" stroke="#f6eed8" stroke-width="5" stroke-dasharray="5 3"/>` +
        `<circle cx="120" cy="100" r="68" fill="none" stroke="#ffffff" stroke-width="52"/>` +
        `<circle cx="120" cy="100" r="68" fill="none" stroke="#e5383b" stroke-width="52" stroke-dasharray="53.400 53.410" transform="rotate(22.500 120 100)"/>` +
        `<circle cx="120" cy="100" r="68" fill="none" stroke="url(#sheen)" stroke-width="52"/>` +
        `<circle cx="120" cy="100" r="93.500" fill="none" stroke="#7a1420" stroke-opacity=".25" stroke-width="1.500"/>` +
        `<circle cx="120" cy="100" r="42.500" fill="none" stroke="#7a1420" stroke-opacity=".3" stroke-width="2"/>` +
        // The band: its two tails behind, the folds that carry them, the cloth in front.
        `<path fill="#0a3565" d="M0 124h46v50H0l17-25Z"/><path fill="#0a3565" d="M240 124h-46v50h46l-17-25Z"/>` +
        `<path fill="#05203f" d="M26 160h20v14Z"/><path fill="#05203f" d="M214 160h-20v14Z"/>` +
        `<rect x="26" y="108" width="188" height="52" rx="5" fill="url(#band)"/>` +
        `<rect x="26" y="108" width="188" height="18" rx="5" fill="#ffffff" fill-opacity=".12"/>` +
        line(
          'M36 115H204M36 153H204',
          '#ffffff',
          2,
          ' stroke-opacity=".55" stroke-dasharray=".1 6" stroke-linecap="round"',
        ),
    );
    // The sign at the side of a pool: white enamel, a blue line around, a screw in each corner.
    const sign = art(
      'pool-sign',
      500,
      150,
      `<linearGradient id="enamel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#e4eef5"/></linearGradient>`,
      `<rect x="1" y="1" width="498" height="148" rx="20" fill="#0d5ea6"/>` +
        `<rect x="6" y="6" width="488" height="138" rx="15" fill="url(#enamel)"/>` +
        `<rect x="13" y="13" width="474" height="124" rx="9" fill="none" stroke="#0d5ea6" stroke-width="2"/>` +
        [
          [28, 28],
          [472, 28],
          [28, 122],
          [472, 122],
        ]
          .map(([x, y]) => screw(x, y, 5))
          .join('') +
        line(
          'M175 95q12.500-9 25 0t25 0 25 0 25 0 25 0 25 0',
          '#18b0d6',
          3.5,
          ' stroke-linecap="round"',
        ),
    );
    return magnet(
      'magnet-pool',
      'Pool party magnet',
      'מגנט למסיבת בריכה',
      [1050, 750, 30],
      {
        opening,
        round: 22,
        draw: (S) => ({
          defs:
            tile('water', 'leisure-pool-water', 400) +
            `<linearGradient id="depth" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0a6fb0" stop-opacity="0"/><stop offset="1" stop-color="#0a4f9a" stop-opacity=".5"/></linearGradient>` +
            // Small tiles in four blues, with white joints between them.
            `<pattern id="mosaic" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#f4fbff"/>` +
            `<rect x="1" y="1" width="10.500" height="10.500" rx="1.500" fill="#1287c8"/><rect x="13" y="1" width="10.500" height="10.500" rx="1.500" fill="#49c3e6"/>` +
            `<rect x="1" y="13" width="10.500" height="10.500" rx="1.500" fill="#0b5fa8"/><rect x="13" y="13" width="10.500" height="10.500" rx="1.500" fill="#1aa3d9"/></pattern>`,
          body:
            ground(S, 'url(#water)') +
            onBorder(
              S.whole('fill="url(#depth)"'),
              S.outline(box(9, 9, 1032, 732), 21, 18, 'stroke="url(#mosaic)"'),
              S.outline(
                box(19.5, 19.5, 1011, 711),
                12,
                2.5,
                'stroke="#ffffff" stroke-opacity=".9"',
              ),
            ) +
            // The coping of the pool around the photograph.
            frameLine(S, 0, 22, '#ffffff', 9) +
            frameLine(S, 8, 30, '#0a5fa0', 2, ' stroke-opacity=".45"'),
        }),
        extras: [
          sticker(picture('leisure-palms'), 196, 492, 248, { turn: -6 }),
          tucked(
            label(
              ring,
              0,
              0,
              [
                caption(
                  34,
                  110,
                  172,
                  48,
                  { text: '15 באוגוסט', font: 'Rubik', size: 27, weight: 700 },
                  { text: 'AUGUST 15', font: 'Poppins', size: 24, weight: 700, spacing: 1 },
                  { color: '#ffffff' },
                ),
              ],
              { turn: 8 },
            ),
            [1050, 750],
            { right: 4, top: 8 },
          ),
          tucked(
            label(
              sign,
              0,
              0,
              [
                caption(
                  40,
                  22,
                  420,
                  64,
                  { text: 'מסיבת בריכה אצל גל', font: 'Secular One', size: 42 },
                  { text: 'Pool Party at Gal’s', font: 'Poppins', size: 36, weight: 800 },
                  { color: '#0b4f8f' },
                ),
                caption(
                  44,
                  104,
                  412,
                  32,
                  { text: 'מביאים בגד ים ומצב רוח טוב', font: 'Heebo', size: 23, weight: 700 },
                  {
                    text: 'BRING A TOWEL AND A SMILE',
                    font: 'Poppins',
                    size: 20,
                    weight: 600,
                    spacing: 1,
                  },
                  { color: '#b81c3a' },
                ),
              ],
              {
                turn: -2,
                // Two clear strips flank the wave: it stays centred, and the four screws
                // and rounded border keep their size when the sign is wider or taller.
                stretch: {
                  x: [
                    [60, 160],
                    [340, 440],
                  ],
                  y: [[70, 88]],
                },
              },
            ),
            [1050, 750],
            { right: 22, bottom: 14 },
          ),
          sticker(picture('leisure-flamingo'), 16, 468, 320, { turn: -4 }),
        ],
      },
      {
        en: 'event pool party summer swimming water flamingo float',
        he: 'אירוע בריכה מסיבה מסיבת קיץ שחייה מים פלמינגו מצוף',
      },
    );
  }

  /* ---- a day at the beach: sand, the sea coming in below, a surfboard stood up on the right */
  function beach() {
    const opening = box(40, 46, 556, 800);
    // The board lies as it is drawn, nose to the right, and is stood on its tail by a turn.
    const deck =
      'M14 75C14 46 40 20 120 13C300-2 600 4 800 40Q870 54 892 75Q870 96 800 110C600 146 300 152 120 137C40 130 14 104 14 75Z';
    const board = art(
      'beach-surfboard',
      900,
      150,
      `<clipPath id="deck"><path d="${deck}"/></clipPath>` +
        `<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity=".75"/><stop offset=".35" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#8a5a2b" stop-opacity=".28"/></linearGradient>`,
      `<path d="${deck}" fill="#fff5df"/>` +
        `<g clip-path="url(#deck)">` +
        `<rect x="706" width="194" height="150" fill="#ff6b57"/><rect x="682" width="12" height="150" fill="#11a3a8"/><rect x="664" width="6" height="150" fill="#11a3a8"/>` +
        `<rect width="138" height="150" fill="#11a3a8"/><rect x="150" width="12" height="150" fill="#ffc94d"/><rect x="174" width="6" height="150" fill="#ff6b57"/>` +
        line('M0 75H900', '#e2cda4', 2.5) +
        `<path d="${deck}" fill="url(#gloss)"/></g>` +
        `<path d="${deck}" fill="none" stroke="#0e5f66" stroke-opacity=".4" stroke-width="2"/>` +
        // The fin, seen through the board at its tail.
        `<path d="M58 75q26-22 60-16-22 8-28 16Z" fill="#0b6f75" fill-opacity=".55"/>`,
    );
    const shore = (dy) =>
      `M0 ${886 + dy}C90 ${868 + dy} 170 ${898 + dy} 260 ${882 + dy}S430 ${864 + dy} 520 ${886 + dy}S680 ${874 + dy} 750 ${890 + dy}`;
    return magnet(
      'magnet-beach',
      'Beach day magnet',
      'מגנט ליום ים',
      [750, 1050, 22],
      {
        opening,
        round: 6,
        draw: (S) => ({
          defs:
            grit('sand', 'rgba(255,255,255,.6)', 'rgba(150,108,56,.3)', 21) +
            // The wind leaves ripples in the sand.
            `<pattern id="ripples" width="160" height="52" patternUnits="userSpaceOnUse"><g fill="none" stroke="#b58a48" stroke-opacity=".17" stroke-width="2" stroke-linecap="round"><path d="M0 12q20-7 40 0t40 0 40 0 40 0"/><path d="M-20 38q20-7 40 0t40 0 40 0 40 0 40 0"/></g></pattern>` +
            `<linearGradient id="dune" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f7e6bf"/><stop offset="1" stop-color="#ecd29d"/></linearGradient>` +
            `<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2bb0bd"/><stop offset=".25" stop-color="#0b7f9c"/><stop offset="1" stop-color="#065478"/></linearGradient>`,
          body:
            ground(S, 'url(#dune)') +
            onBorder(
              S.whole('fill="url(#ripples)"'),
              S.whole('fill="url(#sand)"'),
              // The sea comes in along the foot of the card: wet sand, foam, then the water.
              footStrip(
                S,
                200,
                `<path fill="#dcbf87" d="${shore(-22)}V1050H0Z"/>` +
                  `<path fill="#ffffff" d="${shore(-6)}V1050H0Z"/>` +
                  `<path fill="url(#sea)" d="${shore(8)}V1050H0Z"/>` +
                  line(
                    shore(40),
                    '#ffffff',
                    3,
                    ' stroke-opacity=".45" stroke-linecap="round" vector-effect="non-scaling-stroke"',
                  ) +
                  line(
                    shore(84),
                    '#ffffff',
                    2.5,
                    ' stroke-opacity=".28" stroke-linecap="round" vector-effect="non-scaling-stroke"',
                  ) +
                  line(
                    shore(126),
                    '#ffffff',
                    2,
                    ' stroke-opacity=".2" stroke-linecap="round" vector-effect="non-scaling-stroke"',
                  ),
              ),
            ) +
            frameLine(S, 0, 6, '#ffffff', 11),
        }),
        extras: [
          tucked(
            label(
              board,
              0,
              0,
              [
                caption(
                  196,
                  18,
                  450,
                  116,
                  { text: 'יום ים', font: 'Karantina', size: 100, weight: 700, spacing: 3 },
                  { text: 'BEACH DAY', font: 'Karantina', size: 96, weight: 700, spacing: 4 },
                  { color: '#0c5661' },
                ),
              ],
              { turn: -90 },
            ),
            [750, 1050],
            { right: 14, top: 56 },
          ),
          sticker(picture('leisure-shells'), 12, 800, 250, { turn: -6 }),
          caption(
            270,
            926,
            304,
            58,
            { text: 'משפחת דרור', font: 'Rubik', size: 44, weight: 800 },
            { text: 'The Drors', font: 'Poppins', size: 44, weight: 800 },
            { color: '#ffffff', align: 'left' },
          ),
          caption(
            270,
            984,
            304,
            46,
            { text: 'חוף דור · יולי', font: 'Heebo', size: 30, weight: 500 },
            { text: 'Dor Beach, July', font: 'Poppins', size: 28, weight: 500 },
            { color: '#d9f6f6', align: 'left' },
          ),
          tucked(sticker(picture('leisure-shades'), 0, 0, 216, { turn: -14 }), [750, 1050], {
            left: 6,
            top: 6,
          }),
        ],
      },
      {
        en: 'event beach sea summer surf sand vacation family',
        he: 'אירוע ים חוף קיץ גלישה גלשן חול חופשה משפחה',
      },
    );
  }

  /* ---- a night of camping: a forest under stars, lights on a string, the camp along the foot */
  function camping() {
    const opening = box(40, 52, 970, 520);
    const next = random(1907);
    const stars = (S) =>
      scattered(next, 54, 1050, 750, [inset(opening, -8)], 26, 12)
        .map(([x, y]) =>
          S.pin(
            next() < 0.35
              ? `<path d="${sparkle(x, y, 4 + next() * 6)}" fill="#fff2c9" fill-opacity="${f(0.55 + next() * 0.45)}"/>`
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + next() * 1.6)}" fill="#e9f6f4" fill-opacity="${f(0.45 + next() * 0.5)}"/>`,
            [x, y],
          ),
        )
        .join('');
    /** A pine as a shape of its own: three tiers on a trunk, standing on `base`. */
    const pine = (cx, base, h, w) =>
      `M${f(cx)} ${f(base - h)}L${f(cx + w * 0.3)} ${f(base - h * 0.6)}H${f(cx + w * 0.17)}L${f(cx + w * 0.42)} ${f(base - h * 0.3)}H${f(cx + w * 0.26)}L${f(cx + w * 0.5)} ${f(base - h * 0.05)}H${f(cx + w * 0.07)}V${base}H${f(cx - w * 0.07)}V${f(base - h * 0.05)}H${f(cx - w * 0.5)}L${f(cx - w * 0.26)} ${f(base - h * 0.3)}H${f(cx - w * 0.42)}L${f(cx - w * 0.17)} ${f(base - h * 0.6)}H${f(cx - w * 0.3)}Z`;
    // A string of lights from one fixing to the next: the wire sags, and each bulb has its glow.
    const lights = art(
      'camp-lights',
      500,
      120,
      `<radialGradient id="halo"><stop stop-color="#ffd27a" stop-opacity=".6"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>`,
      line('M0 12Q250 122 500 12', '#1b1512', 3, ' stroke-linecap="round"') +
        [0.07, 0.19, 0.31, 0.44, 0.56, 0.69, 0.81, 0.93]
          .map((t, i) => {
            const [x, y] = [500 * t, 12 + 220 * t * (1 - t)];
            const colour = ['#ffd166', '#fff3c4', '#ff9f5a'][i % 3];
            return (
              `<circle cx="${f(x)}" cy="${f(y + 18)}" r="27" fill="url(#halo)"/>` +
              `<rect x="${f(x - 4.5)}" y="${f(y - 1)}" width="9" height="9" rx="2" fill="#1b1512"/>` +
              `<path d="M${f(x - 8)} ${f(y + 17)}a8 9.500 0 1 0 16 0c0-5-4-7-4-9h-8c0 2-4 4-4 9Z" fill="${colour}"/>` +
              `<circle cx="${f(x - 2.6)}" cy="${f(y + 15)}" r="2.400" fill="#ffffff" fill-opacity=".85"/>`
            );
          })
          .join(''),
    );
    // A signpost: an arrow of bare wood for the name, and a painted board under it.
    const signpost = art(
      'camp-signpost',
      470,
      176,
      `<linearGradient id="wood" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#9a6332"/><stop offset="1" stop-color="#7a4a22"/></linearGradient>` +
        `<linearGradient id="post" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#5a3a1e"/><stop offset=".5" stop-color="#7a5230"/><stop offset="1" stop-color="#4a2e16"/></linearGradient>` +
        `<linearGradient id="paint" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#356b59"/><stop offset="1" stop-color="#27503f"/></linearGradient>`,
      `<rect x="222" width="24" height="176" rx="3" fill="url(#post)"/>` +
        `<path d="M4 52 44 14H462a4 4 0 0 1 4 4V86a4 4 0 0 1-4 4H44Z" fill="url(#wood)"/>` +
        `<path d="M4 52 44 14H462a4 4 0 0 1 4 4V86a4 4 0 0 1-4 4H44Z" fill="none" stroke="#4a2a10" stroke-opacity=".6" stroke-width="2"/>` +
        line(
          'M40 30q110-7 210 0t200-3M30 52q130 6 240 0t190 3M44 74q100-6 200 0t210-2',
          '#4a2a10',
          1.6,
          ' stroke-opacity=".28" stroke-linecap="round"',
        ) +
        line('M48 19H458', '#ffe1ae', 1.6, ' stroke-opacity=".35" stroke-linecap="round"') +
        `<path d="M466 132 438 106H40a4 4 0 0 0-4 4v44a4 4 0 0 0 4 4H438Z" fill="url(#paint)"/>` +
        `<path d="M466 132 438 106H40a4 4 0 0 0-4 4v44a4 4 0 0 0 4 4H438Z" fill="none" stroke="#10271d" stroke-opacity=".6" stroke-width="2"/>` +
        [
          [234, 24],
          [234, 80],
          [234, 116],
          [234, 148],
        ]
          .map(
            ([x, y]) =>
              `<circle cx="${x}" cy="${y}" r="3.400" fill="#2a1a0e"/><circle cx="${x - 1}" cy="${y - 1}" r="1.100" fill="#c9a377"/>`,
          )
          .join(''),
    );
    return magnet(
      'magnet-camping',
      'Camping magnet',
      'מגנט לקמפינג',
      [1050, 750, 24],
      {
        opening,
        round: 14,
        draw: (S) => {
          const sky = stars(S);
          return {
            defs:
              `<linearGradient id="night" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0b2733"/><stop offset=".7" stop-color="#11414d"/><stop offset="1" stop-color="#1a5a5e"/></linearGradient>` +
              `<radialGradient id="fire"><stop stop-color="#ff9a3d" stop-opacity=".5"/><stop offset="1" stop-color="#ff9a3d" stop-opacity="0"/></radialGradient>` +
              `<pattern id="far" y="600" width="176" height="150" patternUnits="userSpaceOnUse"><path fill="#17505a" d="${pine(30, 150, 128, 62)}${pine(88, 150, 96, 52)}${pine(142, 150, 142, 64)}"/></pattern>` +
              `<pattern id="near" x="40" y="646" width="132" height="104" patternUnits="userSpaceOnUse"><path fill="#06222a" d="${pine(34, 104, 98, 56)}${pine(98, 104, 72, 48)}M0 92H132V104H0Z"/></pattern>`,
            body:
              ground(S, 'url(#night)') +
              onBorder(
                sky,
                footRow(S, 'far', 150),
                S.pin(`<circle cx="230" cy="690" r="270" fill="url(#fire)"/>`, [230, 690], {
                  x: 'start',
                  y: 'end',
                }),
                footRow(S, 'near', 104),
              ) +
              frameLine(S, 0, 14, '#f4e9cf', 6),
          };
        },
        extras: [
          sticker(lights, 22, 14, 500),
          sticker(lights, 528, 14, 500, { flip: true }),
          sticker(picture('leisure-tent'), 16, 494, 300),
          tucked(
            label(
              signpost,
              0,
              0,
              [
                caption(
                  52,
                  18,
                  402,
                  68,
                  { text: 'לילה תחת הכוכבים', font: 'Karantina', size: 58, weight: 700 },
                  { text: 'Under the Stars', font: 'Karantina', size: 58, weight: 700, spacing: 1 },
                  { color: '#fff1d2' },
                ),
                caption(
                  50,
                  110,
                  380,
                  44,
                  { text: 'מדורה · גיטרה · מרשמלו', font: 'Heebo', size: 25, weight: 700 },
                  {
                    text: 'FIRE · GUITAR · S’MORES',
                    font: 'Poppins',
                    size: 20,
                    weight: 600,
                    spacing: 1.5,
                  },
                  { color: '#f3ecd2' },
                ),
              ],
              { turn: -3 },
            ),
            [1050, 750],
            { right: 30, bottom: 8 },
          ),
          sticker(picture('leisure-lantern'), 438, 596, 80, { turn: 4 }),
          sticker(picture('leisure-campfire'), 262, 590, 156),
        ],
      },
      {
        en: 'event camping night forest tent campfire stars outdoors scouts',
        he: 'אירוע קמפינג לילה יער אוהל מדורה כוכבים טבע צופים לינת שטח',
      },
    );
  }

  /* ---- a music festival: dusk over the crowd, the name above, a wristband across a corner */
  function festival() {
    const opening = box(44, 168, 662, 690);
    // A wristband of woven cloth, with the clasp that locks it.
    const band = art(
      'festival-wristband',
      440,
      104,
      `<linearGradient id="cloth" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#007680"/><stop offset="1" stop-color="#00565f"/></linearGradient>` +
        `<pattern id="zig" width="12" height="16" patternUnits="userSpaceOnUse"><path d="M1 0 11 8 1 16" fill="none" stroke="#ff7ab6" stroke-width="2.400"/></pattern>` +
        `<linearGradient id="clasp" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#1c2748"/><stop offset=".5" stop-color="#33416e"/><stop offset="1" stop-color="#141c36"/></linearGradient>`,
      `<rect y="6" width="440" height="92" rx="5" fill="url(#cloth)"/>` +
        `<rect y="6" width="440" height="7" rx="3" fill="#ffd23f"/><rect y="91" width="440" height="7" rx="3" fill="#ffd23f"/>` +
        // The weave shows at the two ends only: the word lies on plain cloth.
        `<rect x="6" y="20" width="24" height="64" fill="url(#zig)"/><rect x="338" y="20" width="24" height="64" fill="url(#zig)"/>` +
        `<rect x="398" y="6" width="42" height="92" fill="#00353b" fill-opacity=".35"/>` +
        `<rect x="368" width="32" height="104" rx="9" fill="url(#clasp)"/>` +
        `<rect x="378" y="12" width="12" height="80" rx="6" fill="#0b1126"/>` +
        line('M373 8V96', '#ffffff', 1.6, ' stroke-opacity=".3" stroke-linecap="round"'),
    );
    // A ticket with its stub: the tear between them is a line of holes.
    const ticket = art(
      'festival-ticket',
      330,
      150,
      `<clipPath id="paper"><path d="M10 0H224a12 12 0 0 0 24 0H320a10 10 0 0 1 10 10V140a10 10 0 0 1-10 10H248a12 12 0 0 0-24 0H10A10 10 0 0 1 0 140V10A10 10 0 0 1 10 0Z"/></clipPath>`,
      `<g clip-path="url(#paper)"><rect width="330" height="150" fill="#fff4dc"/><rect x="236" width="94" height="150" fill="#ffd23f"/>` +
        `<rect x="8" y="8" width="220" height="134" rx="6" fill="none" stroke="#b0185f" stroke-width="2.400"/>` +
        `<rect x="244" y="8" width="78" height="134" rx="6" fill="none" stroke="#7a1244" stroke-width="2.400"/></g>` +
        line('M236 16V134', '#7a1244', 2.4, ' stroke-dasharray=".1 7" stroke-linecap="round"') +
        `<path d="${star(283, 75, 26, 0, 0.5)}" fill="#b0185f"/>`,
    );
    const bunting = ['#ffd23f', '#00a3ad', '#fff4dc', '#ff4f9a']
      .map((colour, i) => `<path d="M${6 + i * 34} 0h28l-14 26Z" fill="${colour}"/>`)
      .join('');
    // The crowd before the stage: three heads to a tile, arms in the air.
    const crowd =
      `<g fill="#2a0b3d" stroke="#2a0b3d" stroke-width="9" stroke-linecap="round">` +
      `<circle cx="28" cy="50" r="13" stroke="none"/><path stroke="none" d="M6 96V78c0-11 10-15 22-15s22 4 22 15v18Z"/><path d="M44 70 60 30" fill="none"/>` +
      `<circle cx="88" cy="38" r="14" stroke="none"/><path stroke="none" d="M64 96V68c0-11 11-16 24-16s24 5 24 16v28Z"/><path d="M68 62 56 12M108 62 122 16" fill="none"/>` +
      `<circle cx="138" cy="58" r="12" stroke="none"/><path stroke="none" d="M118 96V84c0-10 9-14 20-14s20 4 20 14v12Z"/><path d="M122 78 108 44" fill="none"/></g>`;
    return magnet(
      'magnet-festival',
      'Music festival magnet',
      'מגנט לפסטיבל',
      [750, 1050, 26],
      {
        opening,
        round: 14,
        draw: (S) => ({
          defs:
            `<linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#4f1787"/><stop offset=".34" stop-color="#b3175f"/><stop offset=".78" stop-color="#f4582a"/><stop offset="1" stop-color="#ffab40"/></linearGradient>` +
            `<radialGradient id="sun"><stop stop-color="#fff1a8"/><stop offset=".55" stop-color="#ffd24a" stop-opacity=".85"/><stop offset="1" stop-color="#ffb02e" stop-opacity="0"/></radialGradient>` +
            `<pattern id="flags" width="136" height="28" patternUnits="userSpaceOnUse">${bunting}</pattern>` +
            `<pattern id="crowd" y="954" width="160" height="96" patternUnits="userSpaceOnUse">${crowd}</pattern>` +
            // The rows behind: the same heads, smaller and further off.
            `<pattern id="rows" x="70" y="938" width="128" height="77" patternUnits="userSpaceOnUse"><g transform="scale(.8)" opacity=".5">${crowd}</g></pattern>`,
          body:
            ground(S, 'url(#dusk)') +
            onBorder(
              // The lights of the stage, up from the foot of the card.
              stretched(
                S,
                box(0, 0, 750, 1050),
                `<g fill="#ffffff" fill-opacity=".09"><path d="M375 1050-70 0H70Z"/><path d="M375 1050 232 0H330Z"/><path d="M375 1050 452 0H560Z"/><path d="M375 1050 700 0H850Z"/></g>`,
              ),
              S.pin(`<circle cx="375" cy="1058" r="230" fill="url(#sun)"/>`, [375, 1058], {
                x: 'mid',
                y: 'end',
              }),
              S.pin(
                `<rect x="-3000" y="938" width="9000" height="77" fill="url(#rows)"/>`,
                [0, 1050],
                { x: 'start', y: 'end' },
              ),
              footRow(S, 'crowd', 96),
              `<rect width="100%" height="28" fill="url(#flags)"/>` +
                `<rect width="100%" height="3" fill="#2a0b3d"/>`,
            ) +
            frameLine(S, 0, 14, '#fff4dc', 6),
        }),
        extras: [
          caption(
            46,
            30,
            350,
            96,
            { text: 'צלילי מדבר', font: 'Karantina', size: 82, weight: 700 },
            { text: 'DESERT BEAT', font: 'Karantina', size: 73, weight: 700, spacing: 1 },
            { color: '#ffffff', align: 'left' },
          ),
          caption(
            48,
            120,
            350,
            44,
            { text: 'שלושה ימים של מוזיקה', font: 'Heebo', size: 28, weight: 700 },
            { text: '3 DAYS OF MUSIC', font: 'DM Sans', size: 28, weight: 700 },
            { color: '#ffe08a', align: 'left' },
          ),
          tucked(
            label(
              ticket,
              0,
              0,
              [
                caption(
                  12,
                  12,
                  212,
                  42,
                  { text: 'כרטיס כניסה', font: 'Heebo', size: 28, weight: 800 },
                  { text: 'ADMIT ONE', font: 'Space Grotesk', size: 28, weight: 700 },
                  { color: '#b0185f' },
                ),
                caption(
                  12,
                  62,
                  212,
                  76,
                  { text: 'במה מרכזית', font: 'Karantina', size: 54, weight: 700 },
                  { text: 'MAIN STAGE', font: 'Karantina', size: 48, weight: 700 },
                  { color: '#3a0f3f' },
                ),
              ],
              { turn: 4 },
            ),
            [750, 1050],
            { right: 10, top: 12 },
          ),
          caption(
            466,
            884,
            240,
            56,
            { text: 'רוקדים עד הזריחה', font: 'Karantina', size: 38, weight: 700 },
            { text: 'DANCE TILL SUNRISE', font: 'Karantina', size: 32, weight: 700 },
            { color: '#2a0b3d', align: 'right' },
          ),
          tucked(
            label(
              band,
              0,
              0,
              [
                caption(
                  36,
                  20,
                  296,
                  64,
                  { text: 'פסטיבל', font: 'Karantina', size: 54, weight: 700, spacing: 3 },
                  { text: 'FESTIVAL', font: 'Karantina', size: 54, weight: 700, spacing: 4 },
                  { color: '#ffffff' },
                ),
              ],
              { turn: -8 },
            ),
            [750, 1050],
            { left: 8, bottom: 96 },
          ),
        ],
      },
      {
        en: 'event music festival concert live stage crowd summer dance',
        he: 'אירוע פסטיבל מוזיקה הופעה במה קהל קיץ ריקודים מסיבה',
      },
    );
  }

  /* ---- a sports day: the bend of a running track, a medal on its ribbon, the cup */
  function sportsDay() {
    const opening = box(150, 40, 860, 512);
    /** How wide a lane of the track is. */
    const LANE = 98;
    // A line of the track: down the left of the card, around the bend, along its foot. The
    // box it is the outline of leaves the card above and on the right.
    const laneLine = (S, n, width, attrs = 'stroke="#ffffff"') =>
      S.outline(
        box(opening.x - n * LANE, -400, 2400, 400 + opening.y + opening.h + n * LANE),
        40 + n * LANE,
        width,
        attrs,
        { ties: { l: 'start', r: 'end', t: 'start', b: 'end' } },
      );
    // The numbers of the lanes, as they are painted on a track with a stencil, each behind
    // its starting line.
    const digit = (d, x, y) =>
      `<path d="${d}" transform="translate(${x} ${y})" fill="none" stroke="#ffffff" stroke-opacity=".92" stroke-width="12"/>`;
    const numbers = (S) =>
      S.pin(
        line('M288 556V646', '#ffffff', 8) +
          digit('M8 18 23 4V62', 308, 568) +
          line('M246 654V750', '#ffffff', 8) +
          digit('M6 19C6-1 36-1 36 19 36 34 6 43 6 62H38', 264, 668),
        [288, 650],
        { x: 'start', y: 'end' },
      );
    // The finishing line: two files of squares across the lanes, at the end of the card.
    const finish = (S) =>
      S.pin(`<rect x="1010" y="556" width="32" height="200" fill="url(#checks)"/>`, [1010, 556], {
        x: 'end',
        y: 'end',
      });
    // A gold medal on a ribbon that hangs from the head of the card. Its number is a caption.
    const medal = art(
      'sports-medal-gold',
      170,
      262,
      `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0b3"/><stop offset=".45" stop-color="#f5c542"/><stop offset="1" stop-color="#c98a12"/></linearGradient>` +
        `<linearGradient id="face" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe184"/><stop offset="1" stop-color="#e9a91f"/></linearGradient>` +
        `<linearGradient id="strap" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#12396b"/><stop offset=".5" stop-color="#1d5aa6"/><stop offset="1" stop-color="#12396b"/></linearGradient>`,
      // The two straps of the ribbon meet behind the ring of the medal.
      `<path fill="url(#strap)" d="M14 0h46l42 122-34 22Z"/><path fill="#ffffff" d="M30 0h14l41 132-11 7Z"/>` +
        `<path fill="url(#strap)" d="M156 0h-46L68 122l34 22Z"/><path fill="#ffffff" d="M140 0h-14L85 132l11 7Z"/>` +
        `<path fill="#0b2647" fill-opacity=".35" d="M68 122l17-12 17 12-17 22Z"/>` +
        `<circle cx="85" cy="130" r="13" fill="none" stroke="url(#gold)" stroke-width="6"/>` +
        `<circle cx="85" cy="184" r="74" fill="url(#gold)"/>` +
        `<circle cx="85" cy="184" r="73" fill="none" stroke="#a66d08" stroke-opacity=".55" stroke-width="2"/>` +
        `<circle cx="85" cy="184" r="58" fill="url(#face)"/>` +
        `<circle cx="85" cy="184" r="58" fill="none" stroke="#b47a0c" stroke-opacity=".6" stroke-width="2"/>` +
        `<circle cx="85" cy="184" r="65.500" fill="none" stroke="#fff6d0" stroke-width="3" stroke-dasharray=".1 9.250" stroke-linecap="round"/>` +
        `<path d="M40 150a56 56 0 0 1 62-20" fill="none" stroke="#ffffff" stroke-opacity=".7" stroke-width="5" stroke-linecap="round"/>`,
    );
    return magnet(
      'magnet-sports-day',
      'Sports day magnet',
      'מגנט ליום ספורט',
      [1050, 750, 28],
      {
        opening,
        round: 40,
        draw: (S) => ({
          defs:
            `<linearGradient id="track" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#c2533a"/><stop offset="1" stop-color="#9f3a25"/></linearGradient>` +
            grit('grit', 'rgba(255,255,255,.2)', 'rgba(70,18,8,.3)', 33) +
            `<radialGradient id="glare" cx=".72" cy="1" r=".62"><stop stop-color="#ffcf9e" stop-opacity=".22"/><stop offset="1" stop-color="#ffcf9e" stop-opacity="0"/></radialGradient>` +
            `<pattern id="checks" x="1010" y="556" width="32" height="32" patternUnits="userSpaceOnUse"><rect width="32" height="32" fill="#2b1612"/><rect width="16" height="16" fill="#ffffff"/><rect x="16" y="16" width="16" height="16" fill="#ffffff"/></pattern>`,
          body:
            ground(S, 'url(#track)') +
            onBorder(
              // The lanes differ by a shade, as on a track that has been run on.
              laneLine(S, 0.5, LANE, 'stroke="#ffd9b0" stroke-opacity=".1"'),
              laneLine(S, 1.5, LANE, 'stroke="#4a1006" stroke-opacity=".2"'),
              S.whole('fill="url(#grit)"'),
              S.whole('fill="url(#glare)"'),
              laneLine(S, 1, 5),
              laneLine(S, 2, 5),
              numbers(S),
              finish(S),
            ) +
            frameLine(S, 0, 40, '#ffffff', 8),
        }),
        extras: [
          tucked(sticker('trophy', 0, 0, 190, { turn: -8 }), [1050, 750], { left: 4, bottom: 14 }),
          sticker('soccer-ball', 146, 640, 96, { turn: 14 }),
          caption(
            400,
            555,
            596,
            96,
            { text: 'יום ספורט', font: 'Karantina', size: 83, weight: 700, spacing: 3 },
            { text: 'SPORTS DAY', font: 'Karantina', size: 83, weight: 700, spacing: 4 },
            { color: '#ffffff', align: 'right' },
          ),
          caption(
            400,
            668,
            596,
            62,
            { text: 'מהר יותר · גבוה יותר · ביחד', font: 'Heebo', size: 30, weight: 700 },
            {
              text: 'FASTER · HIGHER · TOGETHER',
              font: 'Montserrat',
              size: 26,
              weight: 700,
              spacing: 3,
            },
            { color: '#fff6e8', align: 'right' },
          ),
          label(
            medal,
            46,
            12,
            [
              caption(
                38,
                134,
                94,
                100,
                { text: '1', font: 'Secular One', size: 80 },
                { text: '1', font: 'DM Serif Display', size: 84 },
                { color: '#8a5600' },
              ),
            ],
            { turn: -5 },
          ),
        ],
      },
      {
        en: 'event sport tournament running track medal trophy competition team',
        he: 'אירוע ספורט יום טורניר ריצה מסלול מדליה גביע תחרות אליפות קבוצה',
      },
    );
  }

  /* ---- a ski trip: a cold sky, peaks on the right, a lift pass on its lanyard */
  function ski() {
    const opening = box(40, 40, 970, 524);
    const next = random(1202);
    // Snowflakes: six arms, each with a pair of barbs.
    const flake = (x, y, r, opacity) =>
      `<g transform="translate(${f(x)} ${f(y)}) rotate(${Math.round(next() * 60)})" stroke="#ffffff" stroke-opacity="${opacity}" stroke-width="${f(Math.max(1.6, r / 5))}" stroke-linecap="round" fill="none">` +
      [0, 60, 120]
        .map(
          (turn) =>
            `<path transform="rotate(${turn})" d="M0 ${f(-r)}V${f(r)}M${f(-r * 0.3)} ${f(-r * 0.72)}L0 ${f(-r * 0.48)}L${f(r * 0.3)} ${f(-r * 0.72)}M${f(-r * 0.3)} ${f(r * 0.72)}L0 ${f(r * 0.48)}L${f(r * 0.3)} ${f(r * 0.72)}"/>`,
        )
        .join('') +
      `</g>`;
    const flakes = (S) =>
      scattered(next, 40, 1050, 750, [inset(opening, -10), box(170, 580, 520, 150)], 34, 16)
        .map(([x, y]) =>
          S.pin(
            next() < 0.6
              ? flake(x, y, 6 + next() * 8, f(0.65 + next() * 0.35))
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.6 + next() * 2)}" fill="#ffffff" fill-opacity=".9"/>`,
            [x, y],
          ),
        )
        .join('');
    // The bars of the pass, read at the gate of the lift.
    const bars = (() => {
      let x = 24;
      const drawn = [];
      while (x < 164) {
        const wide = 1.5 + Math.floor(next() * 3) * 1.5;
        drawn.push(`<rect x="${f(x)}" y="298" width="${f(wide)}" height="28"/>`);
        x += wide + 2 + Math.floor(next() * 2) * 2;
      }
      return `<g fill="#143a66">${drawn.join('')}</g>`;
    })();
    // A lift pass on its lanyard: two straps down to a clip, the card under it.
    const pass = art(
      'ski-pass',
      190,
      340,
      `<linearGradient id="strap" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#b9241b"/><stop offset=".5" stop-color="#e0433a"/><stop offset="1" stop-color="#b9241b"/></linearGradient>` +
        `<linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#eaf2f9"/></linearGradient>` +
        `<linearGradient id="clip" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e6ebf0"/><stop offset="1" stop-color="#8f9ba7"/></linearGradient>`,
      `<path fill="url(#strap)" d="M26 0H54L100 110H80Z"/><path fill="url(#strap)" d="M164 0H136L90 110H110Z"/>` +
        line(
          'M40 0 90 110M150 0 100 110',
          '#ffffff',
          3,
          ' stroke-opacity=".8" stroke-dasharray="7 9"',
        ) +
        `<rect x="82" y="102" width="26" height="26" rx="6" fill="url(#clip)"/><rect x="89" y="120" width="12" height="22" rx="5" fill="none" stroke="url(#clip)" stroke-width="4"/>` +
        `<rect x="10" y="130" width="170" height="206" rx="14" fill="url(#card)"/>` +
        `<rect x="10.750" y="130.750" width="168.500" height="204.500" rx="13.500" fill="none" stroke="#a8bccd" stroke-width="1.500"/>` +
        `<rect x="76" y="138" width="38" height="9" rx="4.500" fill="#7f97ad"/>` +
        `<path d="M10 154H180V210H10Z" fill="#d8352a"/>` +
        // Two peaks at the side of the header.
        `<path d="M10 210 44 172l14 16 12-12 30 34Z" fill="#ffffff" fill-opacity=".16"/>` +
        bars,
    );
    return magnet(
      'magnet-ski',
      'Ski trip magnet',
      'מגנט לחופשת סקי',
      [1050, 750, 26],
      {
        opening,
        round: 14,
        draw: (S) => {
          const snow = flakes(S);
          return {
            defs: `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#5aa5dd"/><stop offset=".72" stop-color="#cfe8f8"/><stop offset="1" stop-color="#e8f5fd"/></linearGradient>`,
            body:
              ground(S, 'url(#sky)') +
              onBorder(
                // The range rises to the right, under the pass; the slope in front runs the
                // whole foot of the card.
                footStrip(
                  S,
                  200,
                  `<path fill="#8fc0e6" d="M430 750 520 700 580 716 650 640 700 672 770 596 840 660 900 618 960 668 1010 630 1050 650V750Z"/>` +
                    `<path fill="#ffffff" d="M770 596 794 624 780 620 770 634 758 620 744 626ZM650 640 668 662 656 660 648 672 636 658ZM900 618 918 640 906 638 898 650 886 636Z"/>` +
                    `<path fill="#4f8fc6" d="M560 750 640 708 700 724 790 640 850 700 930 628 1000 690 1050 660V750Z"/>` +
                    `<path fill="#ffffff" d="M790 640 816 670 800 666 790 682 776 664 762 668ZM930 628 954 656 940 652 930 666 916 650 904 654Z"/>` +
                    `<path fill="#ffffff" d="M0 716C150 698 320 722 500 712S820 694 1050 716V750H0Z"/>` +
                    `<path fill="#dcedf9" d="M0 738C200 724 420 744 640 734S900 728 1050 738V750H0Z"/>`,
                ),
                snow,
              ) +
              frameLine(S, 0, 14, '#ffffff', 9) +
              frameLine(S, 9, 23, '#143a66', 1.6, ' stroke-opacity=".35"'),
          };
        },
        extras: [
          caption(
            196,
            586,
            500,
            78,
            { text: 'חופשת הסקי שלנו', font: 'Suez One', size: 54 },
            { text: 'Our Ski Trip', font: 'DM Serif Display', size: 62 },
            { color: '#143a66', align: 'left' },
          ),
          caption(
            198,
            664,
            500,
            40,
            { text: 'שלג, שוקו חם ומדרונות', font: 'Heebo', size: 27, weight: 700 },
            {
              text: 'SNOW · COCOA · SLOPES',
              font: 'Montserrat',
              size: 22,
              weight: 700,
              spacing: 3,
            },
            { color: '#c12a20', align: 'left' },
          ),
          tucked(
            label(
              pass,
              0,
              0,
              [
                caption(
                  18,
                  156,
                  154,
                  52,
                  { text: 'סקי פס', font: 'Karantina', size: 44, weight: 700, spacing: 2 },
                  { text: 'SKI PASS', font: 'Karantina', size: 42, weight: 700, spacing: 2 },
                  { color: '#ffffff' },
                ),
                caption(
                  18,
                  214,
                  154,
                  38,
                  { text: 'משפחת שגיא', font: 'Heebo', size: 21, weight: 800 },
                  { text: 'Team Sagi', font: 'Poppins', size: 23, weight: 700 },
                  { color: '#143a66' },
                ),
                caption(
                  18,
                  258,
                  154,
                  32,
                  { text: 'יום מלא', font: 'Heebo', size: 22, weight: 700 },
                  { text: 'FULL DAY', font: 'Poppins', size: 20, weight: 700, spacing: 2 },
                  { color: '#c12a20' },
                ),
              ],
              { turn: 3 },
            ),
            [1050, 750],
            { right: 26, top: 0 },
          ),
          sticker(picture('leisure-skis'), 22, 506, 168, { turn: -6 }),
        ],
      },
      {
        en: 'event ski snow winter mountain vacation snowboard slopes',
        he: 'אירוע סקי שלג חורף הר חופשה סנובורד חרמון מדרון',
      },
    );
  }

  /* ---- a barbecue: a checked tablecloth, the grill, the name burnt into a cutting board */
  function bbq() {
    const opening = box(44, 44, 962, 540);
    // A cutting board with its handle and the groove that keeps the juice in.
    const boardShape =
      'M26 8H374a26 26 0 0 1 26 26V58h44a26 26 0 0 1 0 54H400v24a26 26 0 0 1-26 26H26A26 26 0 0 1 0 136V34A26 26 0 0 1 26 8ZM442 74a11 11 0 1 0 .01 0Z';
    const board = art(
      'bbq-board',
      470,
      170,
      `<linearGradient id="maple" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e6bd86"/><stop offset="1" stop-color="#cc965a"/></linearGradient>` +
        `<clipPath id="plank"><path clip-rule="evenodd" d="${boardShape}"/></clipPath>`,
      `<path d="${boardShape}" fill-rule="evenodd" fill="url(#maple)"/>` +
        `<g clip-path="url(#plank)">` +
        line(
          'M0 34q120-10 230 0t240-4M0 62q140 9 250 0t220 5M0 96q110-8 220 0t250-3M0 128q130 8 240 0t230 4M0 150q120-6 240 0',
          '#8a5a2b',
          1.8,
          ' stroke-opacity=".3" stroke-linecap="round"',
        ) +
        `<ellipse cx="96" cy="118" rx="26" ry="9" fill="none" stroke="#8a5a2b" stroke-opacity=".28" stroke-width="1.600"/>` +
        `</g>` +
        `<rect x="14" y="22" width="372" height="126" rx="16" fill="none" stroke="#9a6a38" stroke-opacity=".6" stroke-width="3"/>` +
        `<path d="${boardShape}" fill="none" stroke="#8a5a2b" stroke-width="2.400"/>` +
        `<circle cx="442" cy="85" r="13" fill="none" stroke="#f1d3a3" stroke-opacity=".5" stroke-width="1.500"/>`,
    );
    // A slate on a string, written on with chalk.
    const slate = art(
      'bbq-slate',
      230,
      124,
      `<linearGradient id="stone" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#3a4044"/><stop offset="1" stop-color="#23272a"/></linearGradient>`,
      line('M38 32 115 6 192 32', '#d9b780', 3, ' stroke-linecap="round" stroke-linejoin="round"') +
        `<circle cx="115" cy="6" r="4.500" fill="#7d8a94"/>` +
        `<rect x="3" y="26" width="224" height="96" rx="9" fill="#a8733f"/>` +
        `<rect x="9" y="32" width="212" height="84" rx="5" fill="url(#stone)"/>` +
        `<ellipse cx="70" cy="60" rx="46" ry="12" fill="#ffffff" fill-opacity=".05"/><ellipse cx="160" cy="92" rx="40" ry="10" fill="#ffffff" fill-opacity=".04"/>` +
        line('M66 104q26-7 50-2t50-4', '#ffffff', 3, ' stroke-opacity=".8" stroke-linecap="round"'),
    );
    return magnet(
      'magnet-bbq',
      'Barbecue magnet',
      'מגנט למנגל',
      [1050, 750, 22],
      {
        opening,
        round: 12,
        draw: (S) => ({
          defs:
            // The checks of the cloth: two bands of red that cross, and the weave over them.
            `<pattern id="checks" width="56" height="56" patternUnits="userSpaceOnUse"><rect width="56" height="56" fill="#fff7f0"/>` +
            `<rect width="28" height="56" fill="#d42b2b" fill-opacity=".58"/><rect width="56" height="28" fill="#d42b2b" fill-opacity=".58"/></pattern>` +
            `<pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 6 0" stroke="#ffffff" stroke-opacity=".16" stroke-width="1.200"/></pattern>` +
            `<radialGradient id="shade" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#5a0d0d" stop-opacity="0"/><stop offset="1" stop-color="#5a0d0d" stop-opacity=".3"/></radialGradient>`,
          body:
            ground(S, 'url(#checks)') +
            onBorder(S.whole('fill="url(#weave)"'), S.whole('fill="url(#shade)"')) +
            frameLine(S, 0, 12, '#ffffff', 10) +
            frameLine(
              S,
              11,
              22,
              '#ffffff',
              2.4,
              ' stroke-dasharray="9 7" stroke-linecap="round" stroke-opacity=".9"',
            ),
        }),
        extras: [
          tucked(
            label(
              slate,
              0,
              0,
              [
                caption(
                  16,
                  40,
                  198,
                  60,
                  { text: 'המנגל פתוח!', font: 'Karantina', size: 48, weight: 700 },
                  { text: 'GRILL’S ON!', font: 'Karantina', size: 46, weight: 700, spacing: 1 },
                  { color: '#ffffff' },
                ),
              ],
              { turn: 7 },
            ),
            [1050, 750],
            { right: 14, top: 10 },
          ),
          sticker(picture('leisure-grill'), 18, 476, 166),
          tucked(
            label(
              board,
              0,
              0,
              [
                caption(
                  22,
                  30,
                  356,
                  62,
                  { text: 'על האש של אבא', font: 'Suez One', size: 44 },
                  { text: 'Dad’s Famous BBQ', font: 'DM Serif Display', size: 36 },
                  { color: '#4a2610' },
                ),
                caption(
                  22,
                  100,
                  356,
                  36,
                  { text: 'שישי בצהריים · בחצר', font: 'Heebo', size: 24, weight: 700 },
                  {
                    text: 'FRIDAY NOON · BACKYARD',
                    font: 'Poppins',
                    size: 20,
                    weight: 600,
                    spacing: 1,
                  },
                  { color: '#3f1f08' },
                ),
              ],
              { turn: -3 },
            ),
            [1050, 750],
            { right: 14, bottom: 6 },
          ),
          tucked(sticker(picture('leisure-skewers'), 0, 0, 180, { turn: -8 }), [1050, 750], {
            left: 128,
            bottom: 6,
          }),
        ],
      },
      {
        en: 'event barbecue bbq grill cookout picnic meat family independence day',
        he: 'אירוע מנגל על האש ברביקיו גריל בשר שיפודים משפחה יום העצמאות',
      },
    );
  }

  /* ---- a road trip: a postcard in teal, orange and cream, the road along its foot */
  function roadtrip() {
    const opening = box(46, 70, 958, 500);
    // The shield of a road, its number a caption.
    const crest =
      'M75 6C60 14 40 16 22 10L10 30c8 14 6 30 0 46-6 34 20 64 65 78 45-14 71-44 65-78-6-16-8-32 0-46L128 10C110 16 90 14 75 6Z';
    const shield = art(
      'road-shield',
      150,
      160,
      `<linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffaf0"/><stop offset="1" stop-color="#f1e3c6"/></linearGradient>`,
      `<path d="${crest}" fill="#123c42"/>` +
        `<path d="${crest}" fill="url(#plate)" transform="translate(7.500 8) scale(.9)"/>` +
        `<path d="${crest}" fill="none" stroke="#e0672b" stroke-width="2.600" transform="translate(13.500 14.400) scale(.82)"/>`,
    );
    // A luggage tag on its string.
    const tagShape = 'M76 6H316a8 8 0 0 1 8 8V136a8 8 0 0 1-8 8H76L44 110V40Z';
    const tag = art(
      'road-tag',
      330,
      150,
      `<linearGradient id="card" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f2c160"/><stop offset="1" stop-color="#e3a53c"/></linearGradient>`,
      line(
        'M68 75C40 56 18 44 6 14M68 75C40 84 20 78 4 50',
        '#7a4a22',
        3,
        ' stroke-linecap="round"',
      ) +
        `<path d="${tagShape}" fill="url(#card)"/>` +
        `<path d="${tagShape}" fill="none" stroke="#9a6418" stroke-opacity=".7" stroke-width="2"/>` +
        `<rect x="92" y="18" width="220" height="114" rx="6" fill="#fff6e0"/>` +
        `<rect x="92" y="18" width="220" height="114" rx="6" fill="none" stroke="#123c42" stroke-opacity=".5" stroke-width="1.600"/>` +
        line('M106 56H298', '#e0672b', 2.4) +
        `<circle cx="68" cy="75" r="11" fill="#fff6e0"/><circle cx="68" cy="75" r="11" fill="none" stroke="#9a6418" stroke-width="2.400"/><circle cx="68" cy="75" r="5" fill="#7a4a22"/>`,
    );
    return magnet(
      'magnet-roadtrip',
      'Road trip magnet',
      'מגנט לטיול דרכים',
      [1050, 750, 16],
      {
        opening,
        round: 8,
        draw: (S) => ({
          defs:
            grit('paper', 'rgba(255,255,255,.7)', 'rgba(140,104,50,.2)', 90) +
            `<linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f7ecd2"/><stop offset="1" stop-color="#f6dfb0"/></linearGradient>`,
          body:
            ground(S, 'url(#dusk)') +
            onBorder(
              S.whole('fill="url(#paper)"'),
              S.outline(box(12, 12, 1026, 726), 8, 2.4, 'stroke="#1d6b72"'),
              S.outline(box(19, 19, 1012, 712), 4, 1.2, 'stroke="#e0672b"'),
              // The sun goes down behind the hills, and the road runs level under the van
              // before it climbs away to the right.
              S.pin(
                `<g fill="#e9a23b" fill-opacity=".35">${[-64, -38, -12, 12, 38, 64]
                  .map(
                    (turn) =>
                      `<path transform="rotate(${turn} 640 668)" d="M632 668 620 520H660L648 668Z"/>`,
                  )
                  .join('')}</g>` +
                  `<circle cx="640" cy="668" r="62" fill="#e8552d"/><circle cx="640" cy="668" r="62" fill="none" stroke="#f6dfb0" stroke-width="4"/>`,
                [640, 668],
                { y: 'end' },
              ),
              footStrip(
                S,
                180,
                `<path fill="#e9b44c" d="M0 660C120 626 240 652 360 636S600 606 760 640S960 616 1050 646V750H0Z"/>` +
                  `<path fill="#e0672b" d="M0 688C150 664 300 700 450 672S800 644 1050 676V750H0Z"/>` +
                  `<path fill="#1d6b72" d="M0 700C200 690 420 706 640 690S900 684 1050 696V750H0Z"/>` +
                  `<path fill="#2b3a40" d="M0 706H430C520 706 566 692 606 668C622 658 640 652 660 648L668 653C644 660 626 674 606 692C566 728 520 740 430 740H0Z"/>` +
                  line(
                    'M0 723H430C520 723 572 704 612 674',
                    '#f7ecd2',
                    3,
                    ' stroke-dasharray="20 15" vector-effect="non-scaling-stroke"',
                  ),
              ),
            ) +
            frameLine(S, 0, 8, '#fffaf0', 8),
        }),
        extras: [
          caption(
            240,
            24,
            570,
            42,
            { text: 'דרישת שלום מהדרך', font: 'Suez One', size: 31, spacing: 2 },
            {
              text: 'GREETINGS FROM THE ROAD',
              font: 'Montserrat',
              size: 22,
              weight: 700,
              spacing: 4,
            },
            { color: '#123c42' },
          ),
          tucked(
            label(
              tag,
              0,
              0,
              [
                caption(
                  100,
                  20,
                  204,
                  32,
                  { text: 'התחנה הבאה', font: 'Heebo', size: 23, weight: 700 },
                  { text: 'NEXT STOP', font: 'Montserrat', size: 20, weight: 700, spacing: 3 },
                  { color: '#b64a16' },
                ),
                caption(
                  100,
                  62,
                  204,
                  66,
                  { text: 'אילת', font: 'Suez One', size: 54 },
                  { text: 'Eilat', font: 'DM Serif Display', size: 52 },
                  { color: '#123c42' },
                ),
              ],
              { turn: 3 },
            ),
            [1050, 750],
            { right: 16, bottom: 22 },
          ),
          sticker(picture('leisure-van'), 40, 586, 250),
          tucked(
            label(
              shield,
              0,
              0,
              [
                caption(
                  25,
                  22,
                  100,
                  30,
                  { text: 'כביש', font: 'Rubik', size: 23, weight: 800 },
                  { text: 'ROUTE', font: 'Rubik', size: 20, weight: 800, spacing: 2 },
                  { color: '#b64a16' },
                ),
                caption(
                  22,
                  60,
                  106,
                  70,
                  { text: '90', font: 'Rubik', size: 58, weight: 800 },
                  { text: '90', font: 'Rubik', size: 58, weight: 800 },
                  { color: '#123c42' },
                ),
              ],
              { turn: -4 },
            ),
            [1050, 750],
            { left: 62, top: 14 },
          ),
        ],
      },
      {
        en: 'event road trip travel car van journey vacation retro postcard',
        he: 'אירוע טיול דרכים כבישים רואד טריפ מסע רכב ואן חופשה גלויה רטרו',
      },
    );
  }

  /* ---- a picnic in the bloom: spring greens, anemones over the foot of the photograph */
  function picnic() {
    const opening = box(40, 40, 970, 560);
    // A tag of brown paper on a string, stitched around.
    const tagShape = 'M34 4H372a6 6 0 0 1 6 6V130a6 6 0 0 1-6 6H34L4 104V36Z';
    const tag = art(
      'picnic-tag',
      380,
      140,
      `<linearGradient id="kraft" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e2c598"/><stop offset="1" stop-color="#cfa974"/></linearGradient>`,
      `<path d="${tagShape}" fill="url(#kraft)"/>` +
        line(
          'M60 18h30M140 126h26M250 14h18M320 122h22M96 70h10M300 66h14M200 100h16',
          '#8a6a3c',
          1.2,
          ' stroke-opacity=".3" stroke-linecap="round"',
        ) +
        `<path d="M40 14H366V126H40L16 100V40Z" fill="none" stroke="#7a5a30" stroke-width="1.800" stroke-dasharray="7 5" stroke-linecap="round"/>` +
        `<path d="${tagShape}" fill="none" stroke="#9a7848" stroke-width="1.500"/>` +
        `<circle cx="32" cy="70" r="9" fill="#f7f1df"/><circle cx="32" cy="70" r="9" fill="none" stroke="#7a5a30" stroke-width="2.400"/>` +
        line(
          'M32 70C18 52 12 30 20 4M32 70C22 56 26 30 40 8',
          '#b08a55',
          2.6,
          ' stroke-linecap="round"',
        ) +
        line('M150 93H310', '#c0392b', 2, ' stroke-linecap="round"'),
    );
    // Blades of grass, a tile of them: the meadow goes on past the flowers.
    const next = random(418);
    const blades = Array.from({ length: 16 }, (_, i) => {
      const x = 8 + i * 5.2 + next() * 2;
      const h = 44 + next() * 52;
      const lean = (next() - 0.5) * 14;
      const colour = ['#5e9b33', '#79b445', '#4c8a2b', '#8fc257'][i % 4];
      return `<path d="M${f(x - 3)} 100Q${f(x + lean * 0.4)} ${f(100 - h * 0.5)} ${f(x + lean)} ${f(100 - h)}Q${f(x + lean * 0.5 + 3)} ${f(100 - h * 0.5)} ${f(x + 4)} 100Z" fill="${colour}"/>`;
    }).join('');
    const meadow = sticker(picture('leisure-meadow-1'), 34, 0, 982);
    return magnet(
      'magnet-picnic',
      'Picnic in bloom magnet',
      'מגנט לפיקניק בפריחה',
      [1050, 750, 26],
      {
        opening,
        round: 18,
        draw: (S) => ({
          defs:
            `<linearGradient id="spring" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#eaf5d3"/><stop offset=".7" stop-color="#cfe6a4"/><stop offset="1" stop-color="#9fcb62"/></linearGradient>` +
            `<radialGradient id="light"><stop stop-color="#ffffff" stop-opacity=".7"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>` +
            `<pattern id="grass" y="650" width="96" height="100" patternUnits="userSpaceOnUse"><rect y="76" width="96" height="24" fill="#5e9b33"/>${blades}</pattern>`,
          body:
            ground(S, 'url(#spring)') +
            onBorder(
              S.pin(`<circle cx="60" cy="40" r="220" fill="url(#light)"/>`, [60, 40], {
                x: 'start',
                y: 'start',
              }),
              S.pin(`<circle cx="1000" cy="120" r="180" fill="url(#light)"/>`, [1000, 120], {
                x: 'end',
                y: 'start',
              }),
              footRow(S, 'grass', 100),
            ) +
            frameLine(S, 0, 18, '#ffffff', 9) +
            frameLine(S, 9, 27, '#5e9b33', 1.6, ' stroke-opacity=".5"'),
        }),
        extras: [
          { ...meadow, y: 742 - meadow.h },
          sticker(picture('leisure-butterflies'), 800, 22, 210, { turn: -10 }),
          tucked(
            label(
              tag,
              0,
              0,
              [
                caption(
                  46,
                  20,
                  318,
                  64,
                  { text: 'פיקניק בפריחה', font: 'Frank Ruhl Libre', size: 44, weight: 700 },
                  {
                    text: 'Picnic in Bloom',
                    font: 'Playfair Display',
                    size: 37,
                    weight: 700,
                    italic: true,
                  },
                  { color: '#2f4a1e' },
                ),
                caption(
                  46,
                  96,
                  318,
                  32,
                  { text: 'שבת בבוקר בשדה', font: 'Heebo', size: 24, weight: 500 },
                  {
                    text: 'SATURDAY IN THE FIELD',
                    font: 'Poppins',
                    size: 20,
                    weight: 600,
                    spacing: 1,
                  },
                  { color: '#641c10' },
                ),
              ],
              { turn: -4 },
            ),
            [1050, 750],
            { right: 12, bottom: 8 },
          ),
          sticker(picture('leisure-basket'), 26, 556, 236, { turn: -3 }),
        ],
      },
      {
        en: 'event picnic spring flowers anemones nature basket meadow outdoors',
        he: 'אירוע פיקניק אביב פריחה פרחים כלניות טבע סל שדה דרום אדום',
      },
    );
  }

  /* ---- a race: electric blue at speed, the bib over the photograph, the tape at the line */
  function run() {
    const opening = box(44, 44, 662, 760);
    // The bib of a runner: paper with a hole in each corner, the race, the number, the name.
    const bib = art(
      'run-bib',
      400,
      286,
      `<linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#e9edf5"/></linearGradient>`,
      `<rect width="400" height="286" rx="14" fill="url(#paper)"/>` +
        // The four holes for the pins.
        [
          [22, 22],
          [378, 22],
          [22, 264],
          [378, 264],
        ]
          .map(
            ([x, y]) =>
              `<circle cx="${x}" cy="${y}" r="7" fill="#1b2a6b"/><circle cx="${x}" cy="${y}" r="8" fill="none" stroke="#aab4cc" stroke-width="1.500"/>`,
          )
          .join('') +
        `<rect x="44" y="10" width="312" height="48" rx="8" fill="#e4ff3a"/>` +
        `<rect x="44" y="272" width="312" height="5" rx="2.500" fill="#1447e6"/>` +
        line('M70 220H330', '#c5cde0', 1.6, ' stroke-dasharray="3 5"'),
    );
    // The tape at the finishing line, with warning stripes at its two ends.
    const tape = art(
      'run-tape',
      380,
      96,
      `<pattern id="hazard" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)"><rect width="13" height="26" fill="#0b1437"/></pattern>` +
        `<linearGradient id="fold" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity=".4"/><stop offset=".45" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".16"/></linearGradient>`,
      `<rect y="6" width="380" height="84" fill="#e4ff3a"/>` +
        `<rect y="6" width="56" height="84" fill="url(#hazard)"/><rect x="324" y="6" width="56" height="84" fill="url(#hazard)"/>` +
        `<rect y="6" width="380" height="84" fill="url(#fold)"/>` +
        line('M0 6H380M0 90H380', '#0b1437', 2.6),
    );
    // A seal with rays around it, for how far the race was.
    const seal = art(
      'run-seal',
      170,
      170,
      `<linearGradient id="lime" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4ff8a"/><stop offset="1" stop-color="#cfe82a"/></linearGradient>`,
      `<path d="M${Array.from({ length: 40 }, (_, i) => {
        const a = ((i + 0.5) * Math.PI) / 20;
        const r = i % 2 ? 73 : 84;
        return `${f(85 + r * Math.sin(a))} ${f(85 - r * Math.cos(a))}`;
      }).join('L')}Z" fill="url(#lime)"/>` +
        `<circle cx="85" cy="85" r="65" fill="none" stroke="#0b1437" stroke-width="2.400"/>`,
    );
    return magnet(
      'magnet-run',
      'Race day magnet',
      'מגנט למרוץ',
      [750, 1050, 24],
      {
        opening,
        round: 12,
        draw: (S) => ({
          defs:
            `<linearGradient id="volt" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1d55ff"/><stop offset=".6" stop-color="#1238c9"/><stop offset="1" stop-color="#0a1f8a"/></linearGradient>` +
            // Stripes that lean forward, as a runner does.
            `<pattern id="speed" width="150" height="150" patternUnits="userSpaceOnUse" patternTransform="skewX(-28)"><rect width="40" height="150" fill="#ffffff" fill-opacity=".07"/><rect x="60" width="12" height="150" fill="#ffffff" fill-opacity=".1"/><rect x="104" width="5" height="150" fill="#e4ff3a" fill-opacity=".6"/></pattern>` +
            `<linearGradient id="deep" x1="0" y1="0" x2="0" y2="1"><stop offset=".6" stop-color="#050e4a" stop-opacity="0"/><stop offset="1" stop-color="#050e4a" stop-opacity=".55"/></linearGradient>`,
          body:
            ground(S, 'url(#volt)') +
            onBorder(S.whole('fill="url(#speed)"'), S.whole('fill="url(#deep)"')) +
            frameLine(S, 0, 12, '#ffffff', 7) +
            frameLine(S, 9, 21, '#e4ff3a', 2.4),
        }),
        extras: [
          tucked(
            label(
              tape,
              0,
              0,
              [
                caption(
                  66,
                  16,
                  248,
                  64,
                  { text: 'קו הסיום', font: 'Karantina', size: 46, weight: 700, spacing: 2 },
                  { text: 'FINISH', font: 'Karantina', size: 46, weight: 700, spacing: 6 },
                  { color: '#0b1437' },
                ),
              ],
              { turn: 10 },
            ),
            [750, 1050],
            { right: 4, top: 10 },
          ),
          tucked(
            label(seal, 0, 0, [
              caption(
                30,
                24,
                110,
                72,
                { text: '10', font: 'Rubik', size: 58, weight: 800 },
                { text: '10', font: 'Rubik', size: 58, weight: 800 },
                { color: '#0b1437' },
              ),
              caption(
                38,
                96,
                94,
                40,
                { text: 'ק״מ', font: 'Rubik', size: 28, weight: 800 },
                { text: 'KM', font: 'Rubik', size: 28, weight: 800, spacing: 2 },
                { color: '#0b1437' },
              ),
            ]),
            [750, 1050],
            { right: 114, bottom: 114 },
          ),
          tucked(sticker('running-shoe', 0, 0, 150, { turn: -10 }), [750, 1050], {
            right: 14,
            bottom: 8,
          }),
          tucked(
            label(
              bib,
              0,
              0,
              [
                caption(
                  52,
                  12,
                  296,
                  44,
                  { text: 'מרוץ הלילה', font: 'Rubik', size: 32, weight: 800 },
                  { text: 'CITY NIGHT RUN', font: 'Rubik', size: 28, weight: 800, spacing: 1 },
                  { color: '#0b1437' },
                ),
                caption(
                  30,
                  68,
                  340,
                  146,
                  { text: '248', font: 'Rubik', size: 116, weight: 900 },
                  { text: '248', font: 'Rubik', size: 116, weight: 900 },
                  { color: '#0b1437' },
                ),
                caption(
                  60,
                  226,
                  280,
                  44,
                  { text: 'עומר', font: 'Rubik', size: 34, weight: 800 },
                  { text: 'OMER', font: 'Rubik', size: 32, weight: 800, spacing: 4 },
                  { color: '#1238c9' },
                ),
              ],
              { turn: -3 },
            ),
            [750, 1050],
            { left: 26, bottom: 16 },
          ),
        ],
      },
      {
        en: 'event race run marathon running finish line medal sport',
        he: 'אירוע מרוץ ריצה מרתון קו הסיום רצים ספורט תחרות',
      },
    );
  }

  return [
    pool(),
    beach(),
    camping(),
    festival(),
    sportsDay(),
    ski(),
    bbq(),
    roadtrip(),
    picnic(),
    run(),
  ];
}
