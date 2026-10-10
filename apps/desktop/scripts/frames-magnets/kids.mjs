/*
 * Ten magnets for children's parties (`../frames-magnets.mjs`), by the themes a child asks for:
 * dinosaurs, space, unicorns, superheroes, princesses and knights, football, pirates, a safari,
 * the sea and racing cars. The characters are cut-outs painted in one hand (gouache, as in a
 * picture book); what carries words is a plate drawn here.
 */

/** @param kit What a magnet is drawn with (`kit.mjs`). */
export default function kids(kit) {
  const { random, box, inset, f, drawn } = kit;
  const { magnet, sticker, caption, label, art, picture, ground, onBorder, line, frameLine } = kit;
  const { stretched, sparkle, star, scattered, pick } = kit;

  /** A closed outline through points, straight from one to the next. */
  const outline = (points) => `M${points.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
  /**
   * A burst: `count` spikes around a centre, as far out as `rx` and `ry` and as far in as
   * `inner` of that, each a little unlike the next.
   */
  const burst = (next, cx, cy, rx, ry, count, inner) =>
    outline(
      Array.from({ length: count * 2 }, (_, i) => {
        const a = (i * Math.PI) / count - Math.PI / 2;
        const k = i % 2 ? inner * (0.92 + next() * 0.16) : 0.86 + next() * 0.14;
        return [cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)];
      }),
    );
  /**
   * One length of something that repeats along the card (the teeth of an edge, the dashes of a
   * road), as a pattern that starts at `x`, `y`: a wider card has more lengths of it, and none
   * is stretched. The tile is taller than what it draws, by a margin above and below: where the
   * foot of one tile met the head of the next, a hairline of the foot showed along the head.
   */
  const repeated = (id, x, y, wide, high, body) =>
    `<pattern id="${id}" x="${f(x)}" y="${f(y - 8)}" width="${f(wide)}" height="${f(high + 16)}" patternUnits="userSpaceOnUse"><g transform="translate(0 8)">${body}</g></pattern>`;
  /**
   * A strip across the whole card, `high` tall from `y`, that keeps its distance from the foot
   * of the card; what fills it keeps its place from the left.
   */
  const strip = (S, y, high, fill) =>
    S.pin(`<rect x="-3000" y="${f(y)}" width="8000" height="${f(high)}" fill="${fill}"/>`, [0, y], {
      x: 'start',
      y: 'end',
    });
  /** A leaf: a blade from its stalk at the origin up to its tip, with a rib of its own. */
  const blade = (x, y, turn, long, wide, colour, rib) =>
    `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(turn)})">` +
    `<path fill="${colour}" d="M0 0C${f(wide)} ${f(-long * 0.28)} ${f(wide * 0.9)} ${f(-long * 0.78)} 0 ${f(-long)}C${f(-wide * 0.9)} ${f(-long * 0.78)} ${f(-wide)} ${f(-long * 0.28)} 0 0Z"/>` +
    line(`M0 ${f(-long * 0.04)}V${f(-long * 0.94)}`, rib, 2.4, ' stroke-linecap="round"') +
    line(
      [0.24, 0.42, 0.6, 0.76]
        .map((t) => {
          const reach = wide * (t < 0.5 ? 0.62 : 0.5 - (t - 0.5) * 0.5);
          return `M${f(-reach)} ${f(-long * t - reach * 0.5)}L0 ${f(-long * t)}L${f(reach)} ${f(-long * t - reach * 0.5)}`;
        })
        .join(''),
      rib,
      1.6,
      ' stroke-linecap="round" stroke-opacity=".8"',
    ) +
    `</g>`;
  /** A frond: a stem with leaflets on both sides, smaller towards its tip. */
  const frond = (x, y, turn, long, colour) => {
    const pairs = Math.round(long / 22);
    const leaflets = Array.from({ length: pairs }, (_, i) => {
      const at = -18 - (i * (long - 26)) / pairs;
      const reach = (long / 3.4) * (1 - (i / pairs) * 0.72);
      return (
        `<path d="M0 ${f(at)}q${f(reach * 0.5)} ${f(-reach * 0.62)} ${f(reach)} ${f(-reach * 0.5)}q${f(-reach * 0.34)} ${f(reach * 0.5)} ${f(-reach)} ${f(reach * 0.5)}Z` +
        `M0 ${f(at)}q${f(-reach * 0.5)} ${f(-reach * 0.62)} ${f(-reach)} ${f(-reach * 0.5)}q${f(reach * 0.34)} ${f(reach * 0.5)} ${f(reach)} ${f(reach * 0.5)}Z"/>`
      );
    }).join('');
    return `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(turn)})" fill="${colour}"><path d="M-3 0h6L1.500-${long}h-3Z"/>${leaflets}</g>`;
  };
  /** Small stars and dots on a card, one at each of `points`, each pinned where it is. */
  const twinkles = (S, next, points, colours, most = 9) =>
    points
      .map(([x, y]) =>
        S.pin(
          next() < 0.55
            ? `<path d="${sparkle(x, y, 4 + next() * (most - 4), 0.26)}" fill="${pick(next, colours)}" fill-opacity="${f(0.6 + next() * 0.4)}"/>`
            : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1.4 + next() * 2)}" fill="${pick(next, colours)}" fill-opacity="${f(0.5 + next() * 0.5)}"/>`,
          [x, y],
        ),
      )
      .join('');

  /* ---- dinosaurs: the photograph in a cracked eggshell, a T-rex leaning in, words on a stone */
  function dino() {
    const opening = box(40, 40, 970, 560);
    const foot = opening.y + opening.h;
    /** How far the broken edge of the shell reaches up into the photograph. */
    const TOOTH = 38;
    // One length of the broken edge: teeth of unequal width and height, as a shell breaks. It
    // ends as high as it starts, so one length follows another at any width of the card.
    const edge = 'M-2 18H0L26 34 58 6 86 29 121 11 149 36 184 4 217 27 247 13 280 18H282';
    // The shell around the photograph: a rim on three sides, and a deeper one below its teeth.
    const shell = { x: opening.x - 12, y: opening.y - 12, w: opening.w + 24, h: opening.h + 36 };
    const next = random(6501);
    /** The print of a foot with three toes, walking towards `turn`. */
    const print = (x, y, turn) =>
      `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(turn)})" fill="#124a31" fill-opacity=".6"><ellipse cy="6" rx="6.500" ry="8"/><path d="M-3.500 1-12-15-6.500-16.500ZM0-1-3-19 3-19ZM3.500 1 12-15 6.500-16.500Z"/></g>`;
    // The prints walk along the top of the card and down its side, and across the band below.
    const prints = (S) =>
      [
        ...Array.from({ length: 12 }, (_, i) => [150 + i * 68, i % 2 ? 9 : 19, 90, { y: 'start' }]),
        ...Array.from({ length: 6 }, (_, i) => [i % 2 ? 9 : 19, 150 + i * 72, 0, { x: 'start' }]),
        ...Array.from({ length: 11 }, (_, i) => [
          130 + i * 82,
          i % 2 ? 684 : 720,
          82 + next() * 16,
          { y: 'end' },
        ]),
      ]
        .map(([x, y, turn, ties]) => S.pin(print(x, y, turn), [x, y], ties))
        .join('');
    // The slab of stone: its thickness below, its face, two cracks and the chips of the chisel.
    const slab = art(
      'kids-dino-slab',
      500,
      118,
      `<linearGradient id="slab-face" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e6dfcf"/><stop offset="1" stop-color="#c5bba5"/></linearGradient>`,
      `<path fill="#857b66" d="M16 30Q10 14 34 14L250 8l216 8q22 2 20 22l6 58q0 18-22 18l-230 6-212-8Q8 112 12 92Z"/>` +
        `<path fill="url(#slab-face)" d="M16 20Q10 4 34 4L250 0l216 6q22 2 20 22l6 58q0 18-22 18l-230 6-212-8Q8 102 12 82Z"/>` +
        `<path fill="#ffffff" fill-opacity=".5" d="M34 4 250 0l216 6q14 1 18 9-6-4-18-4L250 6 34 10q-12 0-17 6 2-12 17-12Z"/>` +
        line(
          'M70 3l-8 20 12 12-6 16',
          '#8d836d',
          2.2,
          ' stroke-linecap="round" stroke-linejoin="round"',
        ) +
        line(
          'M452 108l-10-22 8-12',
          '#8d836d',
          2.2,
          ' stroke-linecap="round" stroke-linejoin="round"',
        ) +
        `<g fill="#a79d87"><circle cx="34" cy="86" r="3.500"/><circle cx="46" cy="94" r="2"/><circle cx="470" cy="30" r="3"/><circle cx="458" cy="22" r="1.800"/><circle cx="250" cy="100" r="2.200"/></g>`,
    );
    return magnet(
      'magnet-dino',
      'Dinosaur party magnet',
      'מגנט למסיבת דינוזאורים',
      [1050, 750, 30],
      {
        opening,
        // The photograph down to its foot, less the teeth of the shell that stand up into it.
        window: (S) =>
          S.box(inset(opening, 1), [25, 25, 0, 0], 'fill="#000"') +
          strip(S, foot - TOOTH, TOOTH + 1, 'url(#teeth)'),
        draw: (S) => ({
          defs:
            `<linearGradient id="jungle" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2f8f5b"/><stop offset="1" stop-color="#1c6a45"/></linearGradient>` +
            `<pattern id="leaves" width="132" height="132" patternUnits="userSpaceOnUse">` +
            [
              [22, 30, -30, '#3da468'],
              [88, 22, 40, '#19603d'],
              [60, 84, -70, '#19603d'],
              [112, 100, 20, '#3da468'],
              [18, 112, 62, '#3da468'],
            ]
              .map(
                ([x, y, turn, colour]) =>
                  `<path transform="translate(${x} ${y}) rotate(${turn})" fill="${colour}" fill-opacity=".5" d="M0-24C13-11 13 10 0 24-13 10-13-11 0-24Z"/>`,
              )
              .join('') +
            `</pattern>` +
            repeated(
              'teeth',
              opening.x,
              foot - TOOTH,
              280,
              TOOTH + 1,
              `<path fill="#fff" d="${edge}V${TOOTH + 1}H-2Z"/>`,
            ) +
            `<pattern id="speck" width="58" height="46" patternUnits="userSpaceOnUse"><g fill="#d9c08f"><circle cx="9" cy="8" r="3.200"/><circle cx="36" cy="17" r="2.200"/><circle cx="20" cy="31" r="4"/><circle cx="49" cy="38" r="2.600"/></g></pattern>` +
            // The broken edge in a line of its own, and cracks that run down from where its
            // teeth meet.
            repeated(
              'cracks',
              opening.x,
              foot - TOOTH,
              280,
              TOOTH + 24,
              line(edge, '#d3bd8d', 3, ' stroke-linejoin="round"') +
                line(
                  'M26 34l-5 10 7 8-3 9M86 29l4 11-3 7M149 36l6 9-6 9 2 7M217 27l5 12-4 9 4 10',
                  '#c9b081',
                  2,
                  ' stroke-linecap="round" stroke-linejoin="round"',
                ),
            ) +
            `<clipPath id="rim"><rect style="${S.geometry(box(opening.x, foot - TOOTH, opening.w, TOOTH + 24))}"/></clipPath>`,
          body:
            ground(S, 'url(#jungle)') +
            onBorder(
              S.whole('fill="url(#leaves)"'),
              S.pin(frond(60, 770, 28, 190, '#48b274'), [60, 750], { x: 'start', y: 'end' }),
              S.pin(frond(10, 700, 62, 150, '#15573a'), [10, 700], { x: 'start', y: 'end' }),
              S.pin(frond(1010, 780, -34, 210, '#48b274'), [1010, 750], { x: 'end', y: 'end' }),
              S.pin(frond(1060, 690, -70, 150, '#15573a'), [1050, 690], { x: 'end', y: 'end' }),
              S.pin(frond(560, 790, 8, 120, '#15573a'), [560, 750], { y: 'end' }),
              prints(S),
              // The shell: cream, speckled, with a line of shade where it meets the card.
              S.box(
                { ...shell, h: shell.h + 5 },
                [36, 36, 20, 20],
                'fill="#0f4a30" fill-opacity=".4"',
              ),
              S.box(shell, [36, 36, 18, 18], 'fill="#fbf1d8"'),
              S.box(shell, [36, 36, 18, 18], 'fill="url(#speck)"'),
              `<g clip-path="url(#rim)">${strip(S, foot - TOOTH, TOOTH + 24, 'url(#cracks)')}</g>`,
            ),
        }),
        extras: [
          sticker(picture('kids-ptero'), 20, 20, 236, { turn: -8 }),
          sticker(picture('kids-hatchling'), 16, 540, 146, { turn: -6 }),
          label(
            slab,
            168,
            622,
            [
              caption(
                24,
                16,
                452,
                74,
                { text: 'דינו־מסיבה של אורי', font: 'Karantina', size: 58, weight: 700 },
                { text: 'Uri’s Dino Party', font: 'Karantina', size: 62, weight: 700 },
                { color: '#453b2c' },
              ),
            ],
            { turn: -2 },
          ),
          // The T-rex leans in over the right edge, in front of the end of the slab.
          sticker(picture('kids-trex'), 646, 470, 392),
        ],
      },
      {
        en: 'event kids birthday party dinosaur dino t-rex jungle egg',
        he: 'אירוע ילדים יום הולדת יומולדת מסיבה דינוזאור דינוזאורים דינו טי-רקס ג׳ונגל ביצה',
      },
    );
  }

  /* ---- space: a porthole in a ring of lights, a rocket on its trail, a planet, a mission patch.
     It is drawn for the wide slide: the porthole is a gentle oval left of the middle, and the
     space at its right holds the planet, the astronaut and the patch, one under the other. */
  function space() {
    const [W, H] = [1920, 1080];
    const opening = box(180, 90, 1100, 900);
    const [cx, cy] = [opening.x + opening.w / 2, opening.y + opening.h / 2];
    /** How wide the ring of the porthole is. */
    const RING = 38;
    /**
     * The porthole, `by` away from the photograph: a box whose four corners are the quarters of
     * the oval, each of a size of its own. At the size the magnet lands in the quarters meet and
     * the box is the oval. In a magnet made wider or taller they move apart and stay as round as
     * they are, so the porthole gets a straight run between its round ends, and never a lens.
     */
    const porthole = (S, by, attrs) =>
      `<rect ${attrs} style="${S.geometry(inset(opening, -by), opening.w / 2 + by)};ry:${f(opening.h / 2 + by)}px"/>`;
    /** How far out a point is, in the measure of the oval `by` away from the photograph. */
    const out = (x, y, by) =>
      Math.hypot((x - cx) / (opening.w / 2 + by), (y - cy) / (opening.h / 2 + by));
    // The lights of the ring: as far apart as puts a whole number of them around the oval.
    const LIGHTS = 56;
    const [a, b] = [opening.w / 2 + RING / 2, opening.h / 2 + RING / 2];
    const between = (Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)))) / LIGHTS;
    const next = random(4242);
    const colours = ['#ffffff', '#ffe9a8', '#c9c2ff'];
    // Stars all over the card, the corners between the porthole and its box too. Beside the
    // porthole a star keeps its side of the card; over or under it, in one of those corners, it
    // goes with that corner of the porthole, which stays as round as it is.
    const stars = (S) => {
      const points = scattered(next, 176, W, H, [], 40, 16).filter(
        ([x, y]) => out(x, y, RING + 22) > 1,
      );
      const cornered = ([x]) => x > opening.x && x < opening.x + opening.w;
      return (
        twinkles(
          S,
          next,
          points.filter((point) => !cornered(point)),
          colours,
          11,
        ) +
        points
          .filter(cornered)
          .map(([x, y]) =>
            S.pin(
              `<path d="${sparkle(x, y, 4 + next() * 7, 0.26)}" fill="${pick(next, colours)}" fill-opacity="${f(0.6 + next() * 0.4)}"/>`,
              [x, y],
              { x: x < cx ? 'start' : 'end', y: y < cy ? 'start' : 'end' },
            ),
          )
          .join('')
      );
    };
    // A constellation: a few stars joined by a thin line.
    const constellation = (points) =>
      line(
        `M${points.map(([x, y]) => `${x} ${y}`).join('L')}`,
        '#c9c2ff',
        1.6,
        ' stroke-opacity=".55"',
      ) + points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.800" fill="#ffffff"/>`).join('');
    // The patch of the mission: a rim of orange with stitches, a night of its own inside. It is
    // drawn 1.4 times as large as its own units.
    const patch = art(
      'kids-space-patch',
      420,
      420,
      `<radialGradient id="patch-deep" cx=".5" cy=".35" r=".75"><stop stop-color="#4a3bb8"/><stop offset="1" stop-color="#1b1a5c"/></radialGradient>`,
      `<g transform="scale(1.4)">` +
        `<circle cx="150" cy="150" r="148" fill="#11123f"/>` +
        `<circle cx="150" cy="150" r="136" fill="url(#patch-deep)" stroke="#ff7a3d" stroke-width="13"/>` +
        `<circle cx="150" cy="150" r="136" fill="none" stroke="#ffd9b0" stroke-width="2.200" stroke-dasharray="6 5.500"/>` +
        `<circle cx="150" cy="150" r="124" fill="none" stroke="#ffe9a8" stroke-opacity=".7" stroke-width="2" stroke-dasharray="1 7" stroke-linecap="round"/>` +
        `<ellipse cx="150" cy="148" rx="112" ry="34" fill="none" stroke="#9d92f5" stroke-opacity=".5" stroke-width="2.500" transform="rotate(-18 150 148)"/>` +
        `<g fill="#ffe9a8"><path d="${sparkle(58, 118, 9, 0.26)}"/><path d="${sparkle(244, 176, 11, 0.26)}"/><path d="${sparkle(226, 96, 6, 0.26)}"/><path d="${sparkle(70, 196, 6, 0.26)}"/><circle cx="92" cy="92" r="2.400"/><circle cx="212" cy="212" r="2.400"/><circle cx="250" cy="134" r="2"/><circle cx="46" cy="154" r="2"/></g>` +
        `</g>`,
    );
    return magnet(
      'magnet-space',
      'Space party magnet',
      'מגנט למסיבת חלל',
      [W, H, 30],
      {
        opening,
        window: (S) => porthole(S, -1, 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="night" x1="0" y1="0" x2=".4" y2="1"><stop stop-color="#141650"/><stop offset=".6" stop-color="#2b2082"/><stop offset="1" stop-color="#4a2a9a"/></linearGradient>` +
            `<radialGradient id="rose" cx=".05" cy=".78" r=".6"><stop stop-color="#ff5fa8" stop-opacity=".5"/><stop offset="1" stop-color="#ff5fa8" stop-opacity="0"/></radialGradient>` +
            `<radialGradient id="teal" cx="1" cy=".1" r=".55"><stop stop-color="#35d3d8" stop-opacity=".42"/><stop offset="1" stop-color="#35d3d8" stop-opacity="0"/></radialGradient>` +
            `<linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f1edff"/><stop offset=".45" stop-color="#a79af0"/><stop offset=".7" stop-color="#d9d2ff"/><stop offset="1" stop-color="#8d7fe0"/></linearGradient>`,
          body:
            ground(S, 'url(#night)') +
            onBorder(
              S.whole('fill="url(#rose)"'),
              S.whole('fill="url(#teal)"'),
              stars(S),
              // One constellation in the corner over the porthole, and two in the space at its
              // right: between the ring and the planet, and under the patch.
              S.pin(
                constellation([
                  [40, 148],
                  [84, 68],
                  [168, 44],
                  [226, 96],
                ]),
                [40, 40],
                { x: 'start', y: 'start' },
              ),
              S.pin(
                constellation([
                  [1296, 252],
                  [1340, 160],
                  [1412, 118],
                  [1472, 176],
                  [1444, 252],
                ]),
                [1412, 118],
                { x: 'end', y: 'start' },
              ),
              S.pin(
                constellation([
                  [1304, 884],
                  [1372, 944],
                  [1452, 914],
                  [1530, 970],
                  [1502, 1034],
                ]),
                [1452, 914],
                { x: 'end', y: 'end' },
              ),
              // The trail of the rocket, along the foot of the card under the porthole and up to
              // its flame.
              S.pin(
                line(
                  'M566 1048C404 1072 132 1078 50 1014',
                  '#ffffff',
                  5.5,
                  ' stroke-opacity=".85" stroke-dasharray=".1 17" stroke-linecap="round"',
                ),
                [50, 1048],
                { x: 'start', y: 'end' },
              ),
              // The ring of the porthole, a line of shade on each side of it, and its lights.
              porthole(S, RING / 2, `fill="none" stroke="url(#metal)" stroke-width="${RING}"`),
              porthole(
                S,
                RING + 1,
                'fill="none" stroke="#0d0e3a" stroke-opacity=".55" stroke-width="3"',
              ),
              porthole(S, 2, 'fill="none" stroke="#4b3fae" stroke-width="5"'),
              porthole(
                S,
                RING / 2,
                `fill="none" stroke="#fff6d6" stroke-width="11" stroke-linecap="round" stroke-dasharray="0 ${between.toFixed(3)}"`,
              ),
            ),
        }),
        extras: [
          sticker(picture('kids-planet'), 1508, 30, 384, { turn: -6 }),
          // The rocket flies in over the ring, its nose on the edge of the photograph.
          sticker(picture('kids-rocket'), 30, 780, 290),
          sticker(picture('kids-astronaut'), 1650, 770, 240, { turn: 8 }),
          // The patch stands at the middle of the porthole's side, over the edge of its ring.
          // When the magnet is made taller its box reaches from the top third of the card to
          // the last: the two strips that lengthen are the clear edges of its drawing, so the
          // patch itself stays round, in the middle of that box.
          label(
            patch,
            1284,
            330,
            [
              caption(
                91,
                64,
                238,
                59,
                { text: 'משימה', font: 'Rubik', size: 39, weight: 800, spacing: 7 },
                { text: 'MISSION', font: 'Space Grotesk', size: 39, weight: 700, spacing: 4 },
                { color: '#ffd9b0' },
              ),
              caption(
                126,
                123,
                168,
                171,
                { text: '6', font: 'Rubik', size: 146, weight: 900 },
                { text: '6', font: 'Space Grotesk', size: 146, weight: 700 },
                { color: '#ffd45c' },
              ),
              caption(
                70,
                294,
                280,
                59,
                { text: 'יום הולדת', font: 'Rubik', size: 42, weight: 800 },
                { text: 'BIRTHDAY', font: 'Space Grotesk', size: 39, weight: 700, spacing: 3 },
                { color: '#ffffff' },
              ),
            ],
            {
              stretch: {
                x: [
                  [0, 2],
                  [418, 420],
                ],
                y: [
                  [0, 2],
                  [418, 420],
                ],
              },
            },
          ),
        ],
      },
      {
        en: 'event kids birthday party space rocket planet astronaut stars galaxy mission',
        he: 'אירוע ילדים יום הולדת יומולדת מסיבה חלל חללית טיל כוכב כוכבים אסטרונאוט פלנטה גלקסיה משימה',
      },
    );
  }

  /* ---- unicorns: a print with a rainbow behind it, clouds under its foot, the name on a cloud */
  function unicorn() {
    // The print is smaller than the box: the rainbow and the clouds lie under it and peek out.
    const print = box(24, 76, 950, 630);
    const opening = box(52, 104, 894, 498);
    const next = random(1207);
    /** A cloud: puffs, on a flat foot when it has one, white with its shade below. */
    const cloud = (name, w, h, puffs, foot) => {
      const shape =
        (foot
          ? `<rect x="${foot[0]}" y="${foot[1]}" width="${foot[2]}" height="${foot[3]}" rx="${foot[3] / 2}"/>`
          : '') + puffs.map(([px, py, pr]) => `<circle cx="${px}" cy="${py}" r="${pr}"/>`).join('');
      return art(
        name,
        w,
        h,
        '',
        `<g fill="#d5c6f5">${shape}</g><g fill="#ffffff" transform="translate(0 -9)">${shape}</g>`,
      );
    };
    // A bank of cloud, round on every side: whatever part of it peeks out from under the print.
    const puff = cloud('kids-unicorn-cloud', 300, 146, [
      [50, 78, 44],
      [112, 92, 50],
      [184, 96, 46],
      [246, 80, 48],
      [150, 62, 50],
      [90, 56, 40],
      [214, 54, 38],
    ]);
    const nameCloud = cloud(
      'kids-unicorn-name-cloud',
      500,
      164,
      [
        [86, 88, 54],
        [176, 68, 50],
        [268, 60, 48],
        [360, 70, 52],
        [430, 94, 46],
      ],
      [6, 76, 488, 88],
    );
    // Three stars of gold, for the corner of the print.
    const stars = art(
      'kids-unicorn-stars',
      150,
      130,
      `<linearGradient id="stars-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe9a0"/><stop offset="1" stop-color="#f3b63f"/></linearGradient>`,
      `<path d="${star(56, 62, 52, -8, 0.5)}" fill="url(#stars-gold)" stroke="#ffffff" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="${star(118, 34, 26, 14, 0.5)}" fill="#ffc9de" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>` +
        `<path d="${star(120, 100, 20, -10, 0.5)}" fill="#c9b6ff" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>`,
    );
    const glitter = (S) =>
      scattered(next, 54, 1050, 750, [inset(opening, -10)], 30, 12)
        .filter(
          ([x, y]) =>
            x > print.x + 8 &&
            x < print.x + print.w - 8 &&
            y > print.y + 8 &&
            y < print.y + print.h - 8,
        )
        .map(([x, y]) =>
          S.pin(
            next() < 0.6
              ? `<path d="${sparkle(x, y, 5 + next() * 8, 0.24)}" fill="#ffffff" fill-opacity="${f(0.7 + next() * 0.3)}"/>`
              : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(2 + next() * 2.5)}" fill="#ffffff" fill-opacity=".85"/>`,
            [x, y],
          ),
        )
        .join('');
    return magnet(
      'magnet-unicorn',
      'Unicorn party magnet',
      'מגנט למסיבת חדי קרן',
      [1050, 750, 28],
      {
        opening,
        round: 18,
        card: (S) => S.box(print, 28, 'fill="#fff"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="pastel" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffc4dc"/><stop offset=".22" stop-color="#ffdcc0"/><stop offset=".42" stop-color="#fff1b8"/><stop offset=".62" stop-color="#c6f0da"/><stop offset=".82" stop-color="#c2e2ff"/><stop offset="1" stop-color="#d9c8ff"/></linearGradient>` +
            `<radialGradient id="glow" cx=".5" cy="1" r=".7"><stop stop-color="#ffffff" stop-opacity=".55"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>`,
          body:
            ground(S, 'url(#pastel)') +
            onBorder(S.whole('fill="url(#glow)"'), glitter(S)) +
            frameLine(S, 0, 18, '#ffffff', 7) +
            S.outline(
              inset(print, 9),
              20,
              2,
              'stroke="#ffffff" stroke-opacity=".8" stroke-dasharray="1 9" stroke-linecap="round"',
            ),
        }),
        extras: [
          // Under the print: the rainbow rises behind its corner and comes down on a cloud.
          sticker(picture('kids-rainbow'), 588, 6, 452, { under: true }),
          sticker(puff, 904, 190, 142, { under: true }),
          sticker(puff, 0, 602, 300, { under: true, flip: true }),
          sticker(puff, 792, 624, 254, { under: true }),
          sticker(stars, 10, 30, 132, { turn: -8 }),
          sticker(picture('kids-unicorn'), 6, 452, 252),
          label(nameCloud, 452, 584, [
            caption(
              50,
              44,
              400,
              66,
              { text: 'אלה חוגגת 5', font: 'Varela Round', size: 56 },
              { text: 'Ella turns 5', font: 'Varela Round', size: 56 },
              { color: '#7a45c0' },
            ),
            caption(
              50,
              110,
              400,
              34,
              { text: 'מסיבה קסומה במיוחד', font: 'Rubik', size: 24, weight: 500, spacing: 1 },
              { text: 'A TRULY MAGICAL PARTY', font: 'Poppins', size: 20, weight: 600, spacing: 3 },
              { color: '#b0307a' },
            ),
          ]),
        ],
      },
      {
        en: 'event kids birthday party unicorn rainbow magic cloud pastel girl',
        he: 'אירוע ילדים ילדות יום הולדת יומולדת מסיבה חד קרן חדי חד-קרן קשת ענן קסם פסטל',
      },
    );
  }

  /* ---- superheroes: a comic panel askew in a thick line, a burst, a bubble, a narration box */
  function superhero() {
    const opening = box(36, 40, 968, 572);
    // The panel: its four corners keep their distance from the corners of the card.
    const corners = [
      [58, 66, { x: 'start', y: 'start' }],
      [1004, 40, { x: 'end', y: 'start' }],
      [982, 588, { x: 'end', y: 'end' }],
      [36, 612, { x: 'start', y: 'end' }],
    ];
    /** The panel grown by `by` on every side, and moved. */
    const panel = (by, dx = 0, dy = 0) =>
      corners.map(([x, y, ties], i) => [
        x + (i === 0 || i === 3 ? -by : by) + dx,
        y + (i < 2 ? -by : by) + dy,
        ties,
      ]);
    // Rays from behind the photograph: over as large a share of the card at any size.
    const rays = Array.from({ length: 12 }, (_, i) => {
      const at = (turn) => {
        const a = ((i * 30 + turn) * Math.PI) / 180;
        return `${f(520 + 1400 * Math.cos(a))} ${f(326 + 1400 * Math.sin(a))}`;
      };
      return `M520 326L${at(-6)}L${at(6)}Z`;
    }).join('');
    /**
     * Dots of a halftone from a corner of the card into it (`sx`, `sy`): the largest in the
     * corner, smaller towards `reach`.
     */
    const halftone = (cx, cy, sx, sy, reach, gap, most) => {
      const dots = [];
      for (let row = 0; row * gap * 0.866 < reach; row++) {
        for (let col = 0; col * gap < reach + gap; col++) {
          const [dx, dy] = [col * gap + (row % 2 ? gap / 2 : 0), row * gap * 0.866];
          const far = Math.hypot(dx, dy) / reach;
          if (far < 1) {
            dots.push(
              `<circle cx="${f(cx + sx * dx)}" cy="${f(cy + sy * dy)}" r="${f(most * (1 - far))}"/>`,
            );
          }
        }
      }
      return dots.join('');
    };
    const INK = '#14141c';
    // The narration box: a yellow slip with its hard shadow.
    const narration = art(
      'kids-comic-narration',
      384,
      78,
      '',
      `<rect x="9" y="9" width="375" height="69" fill="${INK}"/>` +
        `<rect x="2.500" y="2.500" width="371" height="65" fill="#ffd60a" stroke="${INK}" stroke-width="5"/>`,
    );
    const next = random(8804);
    const spikes = burst(next, 128, 106, 121, 99, 13, 0.76);
    // The burst: yellow in a line of ink, on a red one turned behind it.
    const boom = art(
      'kids-comic-burst',
      264,
      220,
      '',
      `<path d="${spikes}" transform="translate(8 8)" fill="${INK}"/>` +
        `<path d="${spikes}" transform="rotate(13.800 128 106)" fill="#e3262e" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="${spikes}" transform="translate(128 106) scale(.86) translate(-128 -106)" fill="#ffd60a" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`,
    );
    const bubbleShape =
      'M47 33H100L84 3l66 30H365a44 44 0 0 1 44 44v64a44 44 0 0 1-44 44H47a44 44 0 0 1-44-44V77a44 44 0 0 1 44-44Z';
    // The speech bubble: its tail points up, at whoever is in the photograph.
    const bubble = art(
      'kids-comic-bubble',
      420,
      196,
      '',
      `<path d="${bubbleShape}" transform="translate(8 8)" fill="${INK}"/>` +
        `<path d="${bubbleShape}" fill="#ffffff" stroke="${INK}" stroke-width="5.500" stroke-linejoin="round"/>`,
    );
    const boltShape = 'M66 4 6 90H44L30 154 98 60H58Z';
    const bolt = art(
      'kids-comic-bolt',
      108,
      160,
      '',
      `<path d="${boltShape}" transform="translate(7 5)" fill="${INK}"/>` +
        `<path d="${boltShape}" fill="#ffd60a" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`,
    );
    // Stars of the comic, drawn into the card where it is bare.
    const pows = (S) =>
      [
        [662, 648, 15, '#ffffff', { y: 'end' }],
        [700, 708, 9, '#ffd60a', { y: 'end' }],
        [622, 716, 7, '#ffffff', { y: 'end' }],
        [500, 20, 9, '#ffd60a', { y: 'start' }],
        [560, 18, 6, '#ffffff', { y: 'start' }],
        [1028, 330, 9, '#ffd60a', { x: 'end' }],
        [18, 360, 8, '#ffffff', { x: 'start' }],
      ]
        .map(([x, y, r, colour, ties]) =>
          S.pin(
            `<path d="${sparkle(x, y, r, 0.2)}" fill="${colour}" stroke="${INK}" stroke-width="2.500" stroke-linejoin="round"/>`,
            [x, y],
            ties,
          ),
        )
        .join('');
    return magnet(
      'magnet-superhero',
      'Superhero party magnet',
      'מגנט למסיבת גיבורי על',
      [1050, 750, 16],
      {
        opening,
        window: (S) => S.shape(panel(-1), 'fill="#000"'),
        draw: (S) => ({
          defs: `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2468e6"/><stop offset="1" stop-color="#1546b8"/></linearGradient>`,
          body:
            ground(S, 'url(#sky)') +
            onBorder(
              stretched(S, box(0, 0, 1050, 750), `<path fill="#3a7df2" d="${rays}"/>`),
              S.pin(`<g fill="#ffd60a">${halftone(0, 750, 1, -1, 400, 30, 12)}</g>`, [0, 750], {
                x: 'start',
                y: 'end',
              }),
              S.pin(
                `<g fill="#e3262e">${halftone(1050, 750, -1, -1, 300, 30, 11)}</g>`,
                [1050, 750],
                { x: 'end', y: 'end' },
              ),
              S.pin(`<g fill="#0e2f86">${halftone(1050, 0, -1, 1, 230, 26, 8)}</g>`, [1050, 0], {
                x: 'end',
                y: 'start',
              }),
              pows(S),
              // The panel's hard shadow, and its line of ink.
              S.shape(panel(9, 11, 11), 'fill="#0b2470"'),
              S.shape(panel(9), `fill="${INK}"`),
            ),
        }),
        extras: [
          label(
            narration,
            16,
            11,
            [
              caption(
                14,
                11,
                348,
                46,
                { text: 'בינתיים, במסיבה…', font: 'Rubik', size: 32, weight: 800 },
                {
                  text: 'Meanwhile, at the party…',
                  font: 'Poppins',
                  size: 22,
                  weight: 700,
                  italic: true,
                },
                { color: INK },
              ),
            ],
            { turn: -3 },
          ),
          sticker(bolt, 908, 14, 104, { turn: 14 }),
          label(
            bubble,
            92,
            544,
            [
              caption(
                40,
                44,
                332,
                36,
                { text: 'גיבור־העל של היום', font: 'Rubik', size: 28, weight: 800 },
                {
                  text: 'TODAY’S SUPERHERO',
                  font: 'Poppins',
                  size: 23,
                  weight: 800,
                  spacing: 1.5,
                  italic: true,
                },
                { color: INK },
              ),
              caption(
                40,
                84,
                332,
                92,
                { text: 'עידו!', font: 'Karantina', size: 78, weight: 700 },
                { text: 'IDO!', font: 'Karantina', size: 78, weight: 700 },
                { color: '#d7141a' },
              ),
            ],
            { turn: -2 },
          ),
          label(
            boom,
            768,
            508,
            [
              caption(
                40,
                56,
                176,
                100,
                { text: 'בום!', font: 'Karantina', size: 84, weight: 700 },
                { text: 'BOOM!', font: 'Karantina', size: 68, weight: 700 },
                { color: '#d7141a' },
              ),
            ],
            { turn: 8 },
          ),
        ],
      },
      {
        en: 'event kids birthday party superhero hero comic comics boom',
        he: 'אירוע ילדים יום הולדת יומולדת מסיבה גיבור גיבורי גיבורים על סופר קומיקס בום',
      },
    );
  }

  /* ---- princesses and knights: the gate of a castle, a crown on its arch, a scroll over its
     foot. It is drawn for the wide slide: an arch of stones in the middle of a wall of bricks,
     and on the wall at each side a pennant that hangs from it, with the wand under the one and
     the shield under the other. */
  function kingdom() {
    const [W, H] = [1920, 1080];
    const opening = box(460, 130, 1000, 760);
    /** The middle of the arch, and the radius of the half circle on top of it. */
    const [mid, reach] = [opening.x + opening.w / 2, opening.w / 2];
    /** Where the round part of the arch ends and its foot begins, from the foot of the card. */
    const FOOT = H - (opening.y + reach);
    /**
     * An arch around the photograph, `by` away from it, built as the arch of the thirtieth is:
     * half a circle above, as wide as the arch is whatever the card leaves beside it, straight
     * sides and a flat foot. Above the foot it is a box with round corners, too tall for its
     * lower corners to show; the foot is a plain box. The round part is never taller than the
     * card leaves above the foot: in a magnet made much wider it is half an oval that still
     * comes down onto its sides, where half a circle would be cut short with a step.
     */
    const arch = (S, by, attrs) => {
      const around = inset(opening, -by);
      const tall = S.geometry({ ...around, h: around.h + 2 * S.h });
      const round = `rx:calc(50% - ${f((W - around.w) / 2)}px);ry:min(calc(100% - ${f(FOOT + around.y)}px), ${f(reach + by)}px)`;
      return (
        `<rect ${attrs} clip-path="url(#above)" style="${tall};${round}"/>` +
        `<rect ${attrs} clip-path="url(#foot)" style="${S.geometry(around)}"/>`
      );
    };
    /** Whether a point is on the wall, `by` clear of the arch. */
    const onWall = (x, y, by) =>
      y < opening.y + reach
        ? Math.hypot(x - mid, y - opening.y - reach) > reach + by
        : Math.abs(x - mid) > reach + by || y > opening.y + opening.h + by;
    const next = random(5150);
    const golds = ['#ffe39a', '#fff6d8', '#f6c453'];
    // Sparkles on the wall, the corners over the shoulders of the arch too, and none under what
    // stands on the wall. Beside the arch a sparkle keeps its side of the card; over a shoulder
    // it goes with that corner of the card, clear of the arch however wide the arch becomes.
    const sparks = (S) => {
      const points = scattered(
        next,
        84,
        W,
        H,
        [
          box(556, 790, 808, 250),
          box(810, 0, 300, 220),
          box(70, 20, 240, 420),
          box(1610, 20, 240, 420),
          box(190, 500, 290, 460),
          box(1440, 590, 300, 340),
        ],
        62,
        26,
      ).filter(([x, y]) => onWall(x, y, 64));
      const over = ([x, y]) => y < opening.y + reach && Math.abs(x - mid) < reach;
      return (
        twinkles(
          S,
          next,
          points.filter((point) => !over(point)),
          golds,
          13,
        ) +
        points
          .filter(over)
          .map(([x, y]) =>
            S.pin(
              `<path d="${sparkle(x, y, 5 + next() * 8, 0.26)}" fill="${pick(next, golds)}" fill-opacity="${f(0.6 + next() * 0.4)}"/>`,
              [x, y],
              { x: x < mid ? 'start' : 'end', y: 'start' },
            ),
          )
          .join('')
      );
    };
    // The scroll: parchment between two rolls, a line of gold along each edge. It is drawn 1.2
    // times as large as its own units.
    const scroll = art(
      'kids-kingdom-scroll',
      768,
      204,
      `<linearGradient id="scroll-paper" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fbf0d2"/><stop offset=".6" stop-color="#f3e0b0"/><stop offset="1" stop-color="#e6c98c"/></linearGradient>` +
        `<linearGradient id="scroll-roll" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#c79f58"/><stop offset=".35" stop-color="#f6e3b4"/><stop offset="1" stop-color="#b98c45"/></linearGradient>`,
      `<g transform="scale(1.2)">` +
        `<path fill="#a97f3d" fill-opacity=".45" d="M50 34Q320 22 590 34V160Q320 170 50 160Z"/>` +
        `<path fill="url(#scroll-paper)" d="M50 26Q320 14 590 26V150Q320 162 50 150Z"/>` +
        line(
          'M70 39Q320 28 570 39M70 137Q320 148 570 137',
          '#c9a04e',
          2,
          ' stroke-linecap="round"',
        ) +
        [0, 1]
          .map(
            (side) =>
              `<g${side ? ' transform="translate(640 0) scale(-1 1)"' : ''}>` +
              `<rect x="14" y="12" width="46" height="152" rx="22" fill="url(#scroll-roll)"/>` +
              `<ellipse cx="37" cy="18" rx="23" ry="9" fill="#f9ecc6"/><ellipse cx="37" cy="18" rx="12" ry="4.500" fill="#b98c45"/>` +
              `<ellipse cx="37" cy="158" rx="23" ry="9" fill="#a77b38"/>` +
              `<rect x="56" y="30" width="12" height="118" fill="#8a6428" fill-opacity=".22"/>` +
              `</g>`,
          )
          .join('') +
        `</g>`,
    );
    /**
     * A pennant that hangs on the wall from a nail: a rod of gold on two cords, and a cloth with
     * a swallow's tail, a band across its head, a line of stitches and an emblem.
     */
    const pennant = (name, [light, deep], band, emblem) =>
      art(
        name,
        170,
        340,
        `<linearGradient id="pennant-cloth" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${deep}"/></linearGradient>` +
          `<linearGradient id="pennant-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0b0"/><stop offset=".55" stop-color="#f3c14f"/><stop offset="1" stop-color="#d99a2b"/></linearGradient>`,
        line(
          'M16 44 85 12 154 44',
          '#d9a637',
          3,
          ' stroke-linecap="round" stroke-linejoin="round"',
        ) +
          `<path d="M24 46H146V318L85 270 24 318Z" transform="translate(5 7)" fill="#5a2a82" fill-opacity=".28"/>` +
          `<path d="M24 46H146V318L85 270 24 318Z" fill="url(#pennant-cloth)"/>` +
          `<path d="M24 46H146V88H24Z" fill="${band}"/>` +
          `<path d="M24 46H85V270L24 318Z" fill="#ffffff" fill-opacity=".12"/>` +
          line(
            'M35 98H135V297L85 258 35 297Z',
            '#fff0b0',
            2,
            ' stroke-opacity=".85" stroke-dasharray="5 5" stroke-linejoin="round"',
          ) +
          emblem +
          `<rect x="8" y="38" width="154" height="12" rx="6" fill="url(#pennant-gold)"/>` +
          `<rect x="16" y="40.500" width="138" height="3" rx="1.500" fill="#fff8dc" fill-opacity=".8"/>` +
          `<circle cx="8" cy="44" r="9" fill="url(#pennant-gold)"/><circle cx="162" cy="44" r="9" fill="url(#pennant-gold)"/>` +
          `<circle cx="85" cy="12" r="7" fill="url(#pennant-gold)"/><circle cx="83" cy="10" r="2.200" fill="#fff8dc"/>`,
      );
    const starPennant = pennant(
      'kids-kingdom-pennant-star',
      ['#8a63dc', '#5f36b0'],
      '#f29abd',
      `<path d="${star(85, 178, 44, 0, 0.5)}" fill="url(#pennant-gold)" stroke="#fff6d8" stroke-width="3.500" stroke-linejoin="round"/>` +
        `<path d="${star(85, 179, 20, 0, 0.5)}" fill="#fff6d8" fill-opacity=".85"/>` +
        `<path d="${sparkle(85, 67, 9, 0.3)}" fill="#fff6d8"/>`,
    );
    const heartPennant = pennant(
      'kids-kingdom-pennant-heart',
      ['#f8b6d1', '#e87fae'],
      '#7d55cf',
      `<path d="M85 222C52 199 39 180 39 162 39 147 50 137 63 137c9 0 17 5 22 13 5-8 13-13 22-13 13 0 24 10 24 25 0 18-13 37-46 60Z" fill="url(#pennant-gold)" stroke="#fff6d8" stroke-width="3.500" stroke-linejoin="round"/>` +
        line('M56 160c0-8 5-13 11-14', '#fff6d8', 4, ' stroke-linecap="round"') +
        `<path d="${sparkle(85, 67, 9, 0.3)}" fill="#fff6d8"/>`,
    );
    // The wand: a star of gold on a stick, two ribbons under the star.
    const wand = art(
      'kids-kingdom-wand',
      110,
      260,
      `<linearGradient id="wand-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0b0"/><stop offset=".55" stop-color="#f3c14f"/><stop offset="1" stop-color="#d99a2b"/></linearGradient>`,
      `<rect x="49.500" y="80" width="11" height="176" rx="5.500" fill="url(#wand-gold)"/>` +
        `<rect x="52" y="84" width="3" height="168" rx="1.500" fill="#fff8dc" fill-opacity=".8"/>` +
        `<path d="M52 96q-34 12-34 58 12-12 22-6-6-30 16-44Z" fill="#f29abd"/>` +
        `<path d="M58 96q34 14 30 66-10-14-20-10 8-32-14-48Z" fill="#b89cf0"/>` +
        `<path d="M55 96q-8 30-2 62 8-8 12-2 2-34-4-58Z" fill="#fbd0e0"/>` +
        `<path d="${star(55, 55, 52, 0, 0.5)}" fill="url(#wand-gold)" stroke="#fff6d8" stroke-width="4" stroke-linejoin="round"/>` +
        `<path d="${star(55, 56, 24, 0, 0.5)}" fill="#fff6d8" fill-opacity=".85"/>`,
    );
    return magnet(
      'magnet-kingdom',
      'Princess and knight party magnet',
      'מגנט למסיבת נסיכות ואבירים',
      [W, H, 26],
      {
        opening,
        window: (S) => arch(S, -1, 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="wall-tone" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cdb8f4"/><stop offset="1" stop-color="#a886e0"/></linearGradient>` +
            `<pattern id="wall" width="128" height="68" patternUnits="userSpaceOnUse"><path d="M0 1.500H128M0 35.500H128M1.500 0V34M65.500 34V68" stroke="#f1e9ff" stroke-opacity=".5" stroke-width="3" fill="none"/><rect x="67" y="37" width="61" height="31" fill="#ffffff" fill-opacity=".09"/><rect x="3" y="3" width="62" height="31" fill="#6f42c1" fill-opacity=".09"/></pattern>` +
            `<radialGradient id="rose" cx=".5" cy="1" r=".62"><stop stop-color="#ffb3d1" stop-opacity=".75"/><stop offset="1" stop-color="#ffb3d1" stop-opacity="0"/></radialGradient>` +
            `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff0b0"/><stop offset=".5" stop-color="#e8b74a"/><stop offset="1" stop-color="#f8dc8c"/></linearGradient>` +
            `<clipPath id="above"><rect width="100%" style="height:calc(100% - ${FOOT - 1}px)"/></clipPath>` +
            `<clipPath id="foot"><rect width="100%" height="100%" style="y:calc(100% - ${FOOT}px)"/></clipPath>`,
          body:
            ground(S, 'url(#wall-tone)') +
            onBorder(S.whole('fill="url(#wall)"'), S.whole('fill="url(#rose)"'), sparks(S)) +
            S.outline(box(14, 14, W - 28, H - 28), 14, 2.4, 'stroke="url(#gold)"') +
            // The stones of the arch: a band of cream, its joints, a line of gold on each side.
            // The joints are set so that each corner of the foot is one whole stone.
            arch(S, 25, 'fill="none" stroke="#7d5bc0" stroke-opacity=".5" stroke-width="58"') +
            arch(S, 23, 'fill="none" stroke="#fbf3e2" stroke-width="46"') +
            arch(
              S,
              23,
              'fill="none" stroke="#d6c4a2" stroke-width="46" stroke-dasharray="3 74" stroke-dashoffset="-25"',
            ) +
            arch(S, 47, 'fill="none" stroke="url(#gold)" stroke-width="3.500"') +
            arch(S, 1, 'fill="none" stroke="url(#gold)" stroke-width="3.500"'),
        }),
        extras: [
          sticker(starPennant, 96, 44, 190),
          sticker(heartPennant, 1634, 44, 190),
          sticker(picture('kids-crown'), 818, 4, 284),
          // The scroll lies over the foot of the gate, and lengthens with it when the magnet is
          // made wider: between its rolls, where the parchment is bare.
          label(
            scroll,
            576,
            810,
            [
              caption(
                96,
                34,
                576,
                53,
                { text: 'הוד מעלתה', font: 'Frank Ruhl Libre', size: 41, weight: 700, spacing: 7 },
                {
                  text: 'HER ROYAL HIGHNESS',
                  font: 'Playfair Display',
                  size: 34,
                  weight: 700,
                  spacing: 4,
                },
                { color: '#77520f' },
              ),
              caption(
                96,
                86,
                576,
                101,
                { text: 'תמר בת 5', font: 'Frank Ruhl Libre', size: 86, weight: 900 },
                { text: 'Tamar is 5', font: 'Playfair Display', size: 77, weight: 800 },
                { color: '#5a2a82' },
              ),
            ],
            {
              stretch: {
                x: [
                  [100, 180],
                  [588, 668],
                ],
                y: [[68, 136]],
              },
            },
          ),
          // The wand leans on the wall at one foot of the gate, and the shield hangs at the other.
          sticker(wand, 262, 524, 170, { turn: -18 }),
          sticker(picture('kids-shield'), 1474, 620, 232, { turn: 8 }),
        ],
      },
      {
        en: 'event kids birthday party princess knight castle crown royal queen king',
        he: 'אירוע ילדים ילדות יום הולדת יומולדת מסיבה נסיכה נסיכות אביר אבירים טירה ארמון כתר מלכה מלך',
      },
    );
  }

  /* ---- football: a pitch with its lines, a jersey with the name, a scoreboard, a ball */
  function football() {
    const opening = box(36, 70, 978, 572);
    // The jersey from behind: the name over the number.
    const shirt = 'M72 8Q110 36 148 8L204 30 220 88 180 100 172 80V204H48V80L40 100 0 88 16 30Z';
    const jersey = art(
      'kids-football-jersey',
      250,
      236,
      `<linearGradient id="jersey-kit" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#dc2c36"/><stop offset="1" stop-color="#b0131e"/></linearGradient>` +
        `<clipPath id="jersey-cut"><path d="${shirt}"/></clipPath>`,
      `<g transform="scale(1.136)">` +
        `<path d="${shirt}" fill="url(#jersey-kit)"/>` +
        `<g clip-path="url(#jersey-cut)">` +
        `<path d="M48 80h9V204H48ZM163 80h9V204h-9Z" fill="#8f0d18" fill-opacity=".55"/>` +
        `<path d="M-4 76l48 16-6 14-46-14ZM224 76l-48 16 6 14 46-14Z" fill="#ffffff"/>` +
        `<path d="M48 192H172V208H48Z" fill="#8f0d18" fill-opacity=".6"/>` +
        `</g>` +
        line('M72 8Q110 36 148 8', '#ffffff', 9, ' stroke-linecap="round"') +
        line(shirt, '#7d0a14', 2, ' stroke-opacity=".5" stroke-linejoin="round"') +
        `</g>`,
    );
    // A line of pennants, as a stadium hangs them: it sags from end to end.
    const sag = (t) => [6 + 508 * t, 8 + 96 * t * (1 - t)];
    const bunting = art(
      'kids-football-bunting',
      520,
      78,
      '',
      line('M6 8Q260 56 514 8', '#ffffff', 3, ' stroke-linecap="round"') +
        Array.from({ length: 10 }, (_, i) => {
          const [a, b] = [sag((i + 0.1) / 10), sag((i + 0.9) / 10)];
          const tip = [(a[0] + b[0]) / 2 + (a[1] - b[1]) * 0.9, (a[1] + b[1]) / 2 + 40];
          return `<path d="${outline([a, b, tip])}" fill="${['#dc2c36', '#ffffff', '#ffc531', '#1f5fd6'][i % 4]}" stroke="#0b3d1f" stroke-opacity=".25" stroke-width="1.500" stroke-linejoin="round"/>`;
        }).join(''),
    );
    // The scoreboard: a dark panel in a frame, a lamp at each end of its top line.
    const scoreboard = art(
      'kids-football-scoreboard',
      336,
      124,
      `<linearGradient id="board-panel" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#27303f"/><stop offset="1" stop-color="#10151f"/></linearGradient>`,
      `<rect x="2" y="6" width="332" height="116" rx="14" fill="#05070b" fill-opacity=".35"/>` +
        `<rect x="2" y="2" width="332" height="116" rx="14" fill="url(#board-panel)" stroke="#e9eef5" stroke-width="4"/>` +
        `<rect x="12" y="44" width="312" height="66" rx="8" fill="#05070b"/>` +
        `<circle cx="20" cy="24" r="4.500" fill="#ff5a4f"/><circle cx="316" cy="24" r="4.500" fill="#3ddc6b"/>`,
    );
    return magnet(
      'magnet-football',
      'Football party magnet',
      'מגנט למסיבת כדורגל',
      [1050, 750, 22],
      {
        opening,
        round: 6,
        draw: (S) => ({
          defs:
            `<pattern id="mown" width="156" height="20" patternUnits="userSpaceOnUse"><rect width="78" height="20" fill="#33a455"/><rect x="78" width="78" height="20" fill="#2a9349"/></pattern>` +
            `<linearGradient id="dusk" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity=".1"/><stop offset="1" stop-color="#0b3d1f" stop-opacity=".3"/></linearGradient>`,
          body:
            ground(S, 'url(#mown)') +
            onBorder(
              S.whole('fill="url(#dusk)"'),
              // The lines of the pitch: the touchline, an arc in each corner, the centre circle.
              S.outline(box(15, 15, 1020, 720), 0, 3.6, 'stroke="#ffffff" stroke-opacity=".92"'),
              ...[
                ['M43 15A28 28 0 0 1 15 43', [15, 15], { x: 'start', y: 'start' }],
                ['M1007 15A28 28 0 0 0 1035 43', [1035, 15], { x: 'end', y: 'start' }],
                ['M15 707A28 28 0 0 1 43 735', [15, 735], { x: 'start', y: 'end' }],
                ['M1035 707A28 28 0 0 0 1007 735', [1035, 735], { x: 'end', y: 'end' }],
              ].map(([d, at, ties]) =>
                S.pin(line(d, '#ffffff', 3.6, ' stroke-opacity=".92"'), at, ties),
              ),
              S.pin(
                line('M525 642V735', '#ffffff', 3.6, ' stroke-opacity=".92"') +
                  `<circle cx="525" cy="735" r="72" fill="none" stroke="#ffffff" stroke-opacity=".92" stroke-width="3.600"/>` +
                  `<circle cx="525" cy="690" r="6" fill="#ffffff"/>`,
                [525, 735],
                { x: 'mid', y: 'end' },
              ),
            ) +
            frameLine(S, 0, 6, '#ffffff', 6),
        }),
        extras: [
          label(
            scoreboard,
            20,
            8,
            [
              caption(
                26,
                6,
                284,
                36,
                { text: 'אליפות יום ההולדת', font: 'Rubik', size: 22, weight: 700, spacing: 1 },
                { text: 'THE BIRTHDAY CUP', font: 'Poppins', size: 20, weight: 700, spacing: 2 },
                { color: '#ffffff' },
              ),
              // No spaces around the colon: the score then reads the same way in Hebrew.
              caption(
                20,
                46,
                296,
                62,
                { text: '10:0', font: 'JetBrains Mono', size: 52, weight: 800, spacing: 8 },
                { text: '10:0', font: 'JetBrains Mono', size: 52, weight: 800, spacing: 8 },
                { color: '#ffc531' },
              ),
            ],
            { turn: -2 },
          ),
          sticker(bunting, 512, 8, 520),
          label(
            jersey,
            30,
            492,
            [
              caption(
                46,
                32,
                158,
                42,
                { text: 'יובל', font: 'Rubik', size: 34, weight: 800 },
                { text: 'YUVAL', font: 'Poppins', size: 28, weight: 800, spacing: 1 },
                { color: '#ffffff' },
              ),
              caption(
                46,
                94,
                158,
                118,
                { text: '10', font: 'Rubik', size: 100, weight: 900 },
                { text: '10', font: 'Poppins', size: 96, weight: 800 },
                { color: '#ffffff' },
              ),
            ],
            { turn: -8 },
          ),
          sticker('soccer-ball', 810, 512, 210, { turn: 14 }),
        ],
      },
      {
        en: 'event kids birthday party football soccer ball pitch goal team sport',
        he: 'אירוע ילדים יום הולדת יומולדת מסיבה כדורגל כדור מגרש שער קבוצה נבחרת ספורט',
      },
    );
  }

  /* ---- pirates: old parchment, a rope around the photograph, a ship, a chest, a nailed plank */
  function pirates() {
    const opening = box(44, 44, 962, 552);
    // The route to the treasure: as long a share of the card at any size, its dashes as they are.
    const route = (S) =>
      `<svg y="100%" overflow="visible">` +
      `<svg x="${f((236 / S.w) * 100)}%" y="-110" width="${f((736 / S.w) * 100)}%" height="100" viewBox="236 640 736 100" preserveAspectRatio="none" overflow="visible">` +
      line(
        'M236 716c60 22 120-40 190-30s110 44 200 36 150-56 230-40 90 20 116 4',
        '#7a4a1e',
        4.5,
        ' stroke-dasharray="11 10" stroke-linecap="round" vector-effect="non-scaling-stroke"',
      ) +
      `</svg></svg>`;
    // A rose of the winds, as an old map draws it.
    const rose =
      `<g fill="none" stroke="#7a4a1e" stroke-opacity=".6" stroke-width="2"><circle cx="352" cy="676" r="40"/><circle cx="352" cy="676" r="33" stroke-dasharray="2 5"/></g>` +
      `<path d="${star(352, 676, 46, 0, 0.2)}" fill="#7a4a1e" fill-opacity=".55" transform="rotate(-36 352 676)"/>` +
      `<path d="${sparkle(352, 676, 50, 0.16)}" fill="#7a4a1e" fill-opacity=".8"/>`;
    // The plank: a board with broken ends, its grain, a nail at each end.
    const board = 'M12 16 34 8 440 4 462 14 468 58 460 98 438 106 30 110 8 98 2 52Z';
    const plank = art(
      'kids-pirates-plank',
      470,
      120,
      `<linearGradient id="plank-wood" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#b98350"/><stop offset=".5" stop-color="#a26b3a"/><stop offset="1" stop-color="#8d5a2d"/></linearGradient>` +
        `<clipPath id="plank-cut"><path d="${board}"/></clipPath>`,
      `<path d="${board}" transform="translate(0 9)" fill="#4f2f14"/>` +
        `<path d="${board}" fill="url(#plank-wood)"/>` +
        `<g clip-path="url(#plank-cut)" fill="none" stroke="#6e431c" stroke-opacity=".5" stroke-width="2" stroke-linecap="round">` +
        `<path d="M0 30q120-10 230-2t240-6M0 84q110 8 240 0t230 6M60 56q60-6 110 0M300 60q70-8 140-2"/>` +
        `<path d="M0 10h470" stroke="#e2b684" stroke-opacity=".6" stroke-width="4"/>` +
        `</g>` +
        [34, 436]
          .map(
            (x) =>
              `<circle cx="${x}" cy="56" r="8" fill="#3b2412"/><circle cx="${x - 2}" cy="54" r="3" fill="#9c8a78"/>`,
          )
          .join(''),
    );
    return magnet(
      'magnet-pirates',
      'Pirate party magnet',
      'מגנט למסיבת שודדי ים',
      [1050, 750, 20],
      {
        opening,
        round: 20,
        draw: (S) => ({
          defs:
            `<linearGradient id="skin" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e0bd80"/><stop offset=".5" stop-color="#d3a868"/><stop offset="1" stop-color="#c4944f"/></linearGradient>` +
            `<radialGradient id="burnt" cx=".5" cy=".5" r=".72"><stop offset=".62" stop-color="#6b3f17" stop-opacity="0"/><stop offset="1" stop-color="#6b3f17" stop-opacity=".62"/></radialGradient>` +
            `<pattern id="twist" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)"><rect width="13" height="13" fill="#ecd3a2"/><rect width="5" height="13" fill="#a57b45"/></pattern>` +
            `<pattern id="fibre" width="90" height="70" patternUnits="userSpaceOnUse"><path d="M6 12q14-5 26 0M48 30q16 5 30 0M14 52q12-4 24 0M60 60q10 4 22 0M70 8q8-3 14 0" fill="none" stroke="#8a5a26" stroke-opacity=".28" stroke-width="1.500" stroke-linecap="round"/></pattern>`,
          body:
            ground(S, 'url(#skin)') +
            onBorder(
              S.whole('fill="url(#fibre)"'),
              // Stains of the years, in the corners that stay bare.
              S.pin(
                `<ellipse cx="560" cy="712" rx="120" ry="34" fill="#a8733a" fill-opacity=".22"/>`,
                [560, 712],
                { x: 'mid', y: 'end' },
              ),
              S.pin(`<circle cx="90" cy="60" r="70" fill="#a8733a" fill-opacity=".2"/>`, [90, 60], {
                x: 'start',
                y: 'start',
              }),
              S.whole('fill="url(#burnt)"'),
              route(S),
              S.pin(rose, [352, 676], { x: 'start', y: 'end' }),
              // The cross that marks the spot, in red.
              S.pin(
                line('M972 676l34 36M1006 676l-34 36', '#b3261e', 9, ' stroke-linecap="round"'),
                [990, 694],
                { x: 'end', y: 'end' },
              ),
            ) +
            S.outline(box(12, 12, 1026, 726), 10, 2, 'stroke="#7a4a1e" stroke-opacity=".7"') +
            // The rope: two strands twisted, in a line of shade.
            S.outline(inset(opening, -8), 26, 19, 'stroke="#5a3a1a"') +
            S.outline(inset(opening, -8), 26, 13.5, 'stroke="url(#twist)"'),
        }),
        extras: [
          sticker(picture('kids-ship'), 782, 12, 252, { turn: 5 }),
          sticker(picture('kids-chest'), 14, 536, 236),
          sticker(picture('kids-parrot'), 790, 500, 128),
          label(
            plank,
            468,
            606,
            [
              caption(
                48,
                22,
                374,
                68,
                { text: 'האוצר של נדב', font: 'Suez One', size: 50 },
                { text: 'Nadav’s Treasure', font: 'DM Serif Display', size: 40 },
                { color: '#fff1cf' },
              ),
            ],
            { turn: -4 },
          ),
        ],
      },
      {
        en: 'event kids birthday party pirate pirates ship treasure map parrot sea',
        he: 'אירוע ילדים יום הולדת יומולדת מסיבה פיראט פיראטים שודד שודדי ים ספינה אוצר מפה תוכי',
      },
    );
  }

  /* ---- a safari: animals lean in from the sides of the photograph, the name on a signpost. It
     is drawn for the wide slide: a wide window in its green line, a column at the right where
     the giraffe stands, and a band of sand under the window, the lion at one end of it and the
     signpost at the other, over the corner of the photograph. */
  function safari() {
    const [W, H] = [1920, 1080];
    const opening = box(64, 56, 1440, 810);
    /** How many units of the card a unit of the signpost's own drawing is. */
    const K = 1.4;
    // The signpost: a post, a plank that points one way and a smaller one that points the other.
    // The post goes on down to the foot of the card.
    const upper = 'M10 52 44 14H436L440 20V88L434 94H44Z';
    const lower = 'M36 112H396L430 150 396 190H36L30 184V118Z';
    const grain =
      'M60 36q70-7 150 0t150-4M70 72q90 8 170 0t130 4M70 136q80-6 150 0t130-2M80 170q70 6 140 0t110 2';
    const signpost = art(
      'kids-safari-signpost',
      625,
      328,
      `<linearGradient id="sign-plank" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#e2b274"/><stop offset="1" stop-color="#c48a48"/></linearGradient>` +
        `<linearGradient id="sign-post" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#8a5a2c"/><stop offset=".5" stop-color="#a87340"/><stop offset="1" stop-color="#7a4d24"/></linearGradient>`,
      `<g transform="scale(${K})">` +
        `<path d="M208 6Q208 0 214 0H232Q238 0 238 6V240H208Z" fill="url(#sign-post)"/>` +
        `<path d="${upper}" transform="translate(0 7)" fill="#6e4520"/><path d="${upper}" fill="url(#sign-plank)"/>` +
        `<path d="${lower}" transform="translate(0 7)" fill="#6e4520"/><path d="${lower}" fill="url(#sign-plank)"/>` +
        line(grain, '#9a6630', 2, ' stroke-opacity=".45" stroke-linecap="round"') +
        // Two nails a plank, above and below its line of words.
        [
          [223, 24],
          [223, 85],
          [223, 122],
          [223, 181],
        ]
          .map(
            ([x, y]) =>
              `<circle cx="${x}" cy="${y}" r="4.500" fill="#4a2f14"/><circle cx="${x - 1.5}" cy="${y - 1.5}" r="1.600" fill="#c9b08e"/>`,
          )
          .join('') +
        `</g>`,
    );
    // Big leaves grow in from the corners, up the side where the giraffe stands, and in two
    // tufts from the foot of the card, one beside the lion and one beside the signpost.
    const leaves = (S) =>
      [
        S.pin(
          blade(W - 2, -8, 214, 330, 82, '#2f8a4e', '#1d6639') +
            blade(W + 26, 78, 246, 290, 70, '#56ad6c', '#2f8a4e') +
            blade(W - 80, -24, 196, 220, 60, '#1f6e3f', '#3b9a5c'),
          [W, 0],
          { x: 'end', y: 'start' },
        ),
        S.pin(
          blade(W + 26, 424, 262, 240, 62, '#2f8a4e', '#1d6639') +
            blade(W + 24, 336, 286, 215, 55, '#56ad6c', '#2f8a4e'),
          [W, 380],
          { x: 'end' },
        ),
        S.pin(
          blade(-18, 26, 128, 260, 68, '#56ad6c', '#2f8a4e') +
            blade(39, -23, 162, 195, 57, '#1f6e3f', '#3b9a5c'),
          [0, 0],
          { x: 'start', y: 'start' },
        ),
        S.pin(
          blade(-21, H - 52, 52, 325, 83, '#2f8a4e', '#1d6639') +
            blade(78, H + 18, 22, 300, 75, '#56ad6c', '#2f8a4e') +
            blade(-13, H - 195, 74, 221, 60, '#1f6e3f', '#3b9a5c'),
          [0, H],
          { x: 'start', y: 'end' },
        ),
        S.pin(
          blade(W + 21, H - 52, -50, 338, 83, '#1f6e3f', '#3b9a5c') +
            blade(W - 65, H + 21, -18, 300, 75, '#2f8a4e', '#1d6639') +
            blade(W + 26, H - 221, -78, 234, 62, '#56ad6c', '#2f8a4e'),
          [W, H],
          { x: 'end', y: 'end' },
        ),
        S.pin(
          blade(398, H + 26, 8, 196, 56, '#56ad6c', '#2f8a4e') +
            blade(356, H + 22, -26, 168, 50, '#2f8a4e', '#1d6639'),
          [376, H],
          { x: 'start', y: 'end' },
        ),
        S.pin(
          blade(1180, H + 24, -12, 188, 54, '#2f8a4e', '#1d6639') +
            blade(1218, H + 22, 20, 156, 48, '#56ad6c', '#2f8a4e'),
          [1200, H],
          { x: 'end', y: 'end' },
        ),
      ].join('');
    // Spots of the savannah on the sand: the marks of a paw, `k` times as large as they are.
    const paw = (x, y, turn, k = 1) =>
      `<g transform="translate(${x} ${y}) rotate(${turn}) scale(${k})" fill="#b98a4a" fill-opacity=".5"><ellipse cy="5" rx="9" ry="7.500"/><circle cx="-10" cy="-5" r="3.800"/><circle cx="-3.500" cy="-10" r="3.800"/><circle cx="3.500" cy="-10" r="3.800"/><circle cx="10" cy="-5" r="3.800"/></g>`;
    // They walk along the top of the card and down its side, and across the band of sand from
    // the lion to the signpost: along the photograph they spread as the card grows.
    const paws = (S) =>
      [
        ...Array.from({ length: 8 }, (_, i) => [
          388 + i * 158,
          i % 2 ? 21 : 33,
          i % 2 ? 98 : 82,
          1,
          { y: 'start' },
        ]),
        [27, 420, 6, 1, { x: 'start' }],
        [23, 524, -10, 1, { x: 'start' }],
        [29, 628, 8, 1, { x: 'start' }],
        ...Array.from({ length: 6 }, (_, i) => [
          520 + i * 112,
          i % 2 ? 1016 : 962,
          i % 2 ? 100 : 78,
          1.5,
          { y: 'end' },
        ]),
      ]
        .map(([x, y, turn, k, ties]) => S.pin(paw(x, y, turn, k), [x, y], ties))
        .join('');
    return magnet(
      'magnet-safari',
      'Safari party magnet',
      'מגנט למסיבת ספארי',
      [W, H, 30],
      {
        opening,
        round: 26,
        draw: (S) => ({
          defs:
            `<linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#f6e6b8"/><stop offset="1" stop-color="#e8c98a"/></linearGradient>` +
            `<pattern id="grains" width="46" height="40" patternUnits="userSpaceOnUse"><g fill="#c79f5c" fill-opacity=".4"><circle cx="6" cy="8" r="1.600"/><circle cx="28" cy="4" r="1.200"/><circle cx="38" cy="22" r="1.700"/><circle cx="16" cy="28" r="1.300"/><circle cx="30" cy="36" r="1.100"/></g></pattern>`,
          body:
            ground(S, 'url(#sand)') +
            onBorder(S.whole('fill="url(#grains)"'), paws(S), leaves(S)) +
            frameLine(S, 3, 29, '#2f7a48', 14) +
            frameLine(S, 0, 26, '#fff8e4', 7),
        }),
        extras: [
          sticker(picture('kids-monkey'), 14, 0, 290),
          // The giraffe leans in over the side of the photograph, its neck behind the planks.
          sticker(picture('kids-giraffe'), 1436, 468, 326),
          sticker(picture('kids-lion'), 4, 778, 325),
          // The signpost stands in the last third of the card, so it keeps its size and its
          // distance from the corner when the magnet is made wider.
          label(
            signpost,
            1283,
            752,
            [
              caption(
                60,
                34,
                540,
                84,
                { text: 'הספארי של דניאל', font: 'Rubik', size: 52, weight: 800 },
                { text: 'Daniel’s Safari', font: 'Poppins', size: 52, weight: 800 },
                { color: '#4a2f14' },
              ),
              caption(
                62,
                176,
                484,
                74,
                { text: 'חוגגים 4!', font: 'Rubik', size: 56, weight: 700 },
                { text: 'Turning 4!', font: 'Poppins', size: 53, weight: 700 },
                { color: '#4a2f14' },
              ),
            ],
            // Lengthened by hand, the planks grow on both sides of the post, which keeps its
            // width; made taller, each plank grows through its line of words.
            {
              stretch: {
                x: [
                  [90, 270],
                  [350, 530],
                ],
                y: [
                  [44, 110],
                  [180, 244],
                ],
              },
            },
          ),
        ],
      },
      {
        en: 'event kids birthday party safari jungle zoo animals lion giraffe monkey',
        he: 'אירוע ילדים יום הולדת יומולדת מסיבה ספארי ג׳ונגל גן חיות חיות אריה ג׳ירפה קוף',
      },
    );
  }

  /* ---- under the sea: a wave for the foot of the photograph, a whale, an octopus, a lifebuoy */
  function sea() {
    const opening = box(40, 40, 970, 566);
    const foot = opening.y + opening.h;
    /** How high the waves stand along the foot of the photograph. */
    const TIDE = 24;
    const wave = 'M-60 13Q-30 31 0 13Q30-5 60 13T120 13T180 13';
    const next = random(3391);
    const bubbles = (S) =>
      scattered(next, 46, 1050, 750, [inset(opening, -16), box(180, 606, 520, 144)], 40, 12)
        .map(([x, y]) => {
          const r = 4 + next() * 10;
          return S.pin(
            `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#ffffff" fill-opacity=".16" stroke="#ffffff" stroke-opacity=".8" stroke-width="1.800"/>` +
              line(
                `M${f(x - r * 0.52)} ${f(y - r * 0.1)}a${f(r * 0.56)} ${f(r * 0.56)} 0 0 1 ${f(r * 0.38)}-${f(r * 0.46)}`,
                '#ffffff',
                1.6,
                ' stroke-linecap="round"',
              ),
            [x, y],
          );
        })
        .join('');
    /** A blade of seaweed growing up from the foot of the card. */
    const weed = (x, tall, colour, wide = 13) =>
      line(
        `M${x} 760q-${f(tall * 0.16)}-${f(tall * 0.25)} 0-${f(tall * 0.5)}t0-${f(tall * 0.5)}`,
        colour,
        wide,
        ' stroke-linecap="round"',
      );
    // The lifebuoy: red and white, a rope around it, the number in its middle.
    const buoy = art(
      'kids-sea-lifebuoy',
      190,
      190,
      `<radialGradient id="buoy-pool" cx=".5" cy=".4" r=".7"><stop stop-color="#1a7fb0"/><stop offset="1" stop-color="#0b4a70"/></radialGradient>`,
      `<circle cx="95" cy="95" r="91" fill="none" stroke="#d9b77a" stroke-width="4" stroke-dasharray="6 3"/>` +
        `<circle cx="95" cy="95" r="52" fill="url(#buoy-pool)"/>` +
        `<circle cx="95" cy="95" r="66" fill="none" stroke="#f04e4e" stroke-width="38"/>` +
        `<circle cx="95" cy="95" r="66" fill="none" stroke="#ffffff" stroke-width="38" stroke-dasharray="51.840 51.840" transform="rotate(22.500 95 95)"/>` +
        `<circle cx="95" cy="95" r="84" fill="none" stroke="#000000" stroke-opacity=".12" stroke-width="4"/>` +
        `<circle cx="95" cy="95" r="49" fill="none" stroke="#000000" stroke-opacity=".18" stroke-width="4"/>` +
        `<path d="M40 62A64 64 0 0 1 86 30" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="6" stroke-linecap="round"/>`,
    );
    // The plate of sand: a bank with a soft edge, a shell on one end and a starfish on the other.
    const bank =
      'M34 24Q70 6 140 14T280 10 430 18Q486 22 490 62 494 104 446 110 300 114 250 116 110 118 60 112Q6 106 8 64 8 36 34 24Z';
    const plate = art(
      'kids-sea-sand',
      500,
      128,
      `<linearGradient id="sand-dune" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fbeac4"/><stop offset="1" stop-color="#efd29c"/></linearGradient>`,
      `<path d="${bank}" transform="translate(0 8)" fill="#c9a468"/>` +
        `<path d="${bank}" fill="url(#sand-dune)"/>` +
        `<g fill="#d7b77c"><circle cx="46" cy="52" r="3"/><circle cx="62" cy="88" r="2.200"/><circle cx="452" cy="44" r="2.600"/><circle cx="438" cy="92" r="3"/><circle cx="250" cy="104" r="2"/><circle cx="150" cy="24" r="2"/><circle cx="360" cy="26" r="2.400"/></g>` +
        `<path d="M26 84q18-46 36 0Z" fill="#ffe1cf" stroke="#e3a184" stroke-width="2" stroke-linejoin="round"/>` +
        line(
          'M44 82V52M36 82l3-24M52 82l-3-24M30 82l5-14M58 82l-5-14',
          '#e3a184',
          1.5,
          ' stroke-linecap="round"',
        ) +
        `<path d="${star(458, 70, 24, 12, 0.46)}" fill="#ff8a5b" stroke="#e86a3c" stroke-width="2" stroke-linejoin="round"/>` +
        `<g fill="#ffd9c4"><circle cx="458" cy="70" r="2.200"/><circle cx="458" cy="58" r="1.600"/><circle cx="469" cy="66" r="1.600"/><circle cx="465" cy="80" r="1.600"/><circle cx="451" cy="80" r="1.600"/><circle cx="447" cy="66" r="1.600"/></g>`,
    );
    return magnet(
      'magnet-sea',
      'Under the sea party magnet',
      'מגנט למסיבת ים',
      [1050, 750, 34],
      {
        opening,
        // The photograph down to the water line, less the waves that rise into it.
        window: (S) =>
          S.box(inset(opening, 1), [39, 39, 0, 0], 'fill="#000"') +
          strip(S, foot - TIDE, TIDE + 1, 'url(#waves)'),
        draw: (S) => ({
          defs:
            `<linearGradient id="deep" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#49cbd8"/><stop offset=".55" stop-color="#1fa3c4"/><stop offset="1" stop-color="#0e6f9e"/></linearGradient>` +
            repeated(
              'waves',
              opening.x,
              foot - TIDE,
              120,
              TIDE + 1,
              `<path fill="#fff" d="${wave}V${TIDE + 1}H-60Z"/>`,
            ) +
            repeated('foam', opening.x, foot - TIDE, 120, TIDE + 1, line(wave, '#ffffff', 5.5)) +
            `<clipPath id="shore"><rect style="${S.geometry(box(opening.x, foot - TIDE - 2, opening.w, TIDE + 6))}"/></clipPath>` +
            `<clipPath id="dry"><rect style="${S.geometry(box(0, 0, 1050, foot - 14))}"/></clipPath>`,
          body:
            ground(S, 'url(#deep)') +
            onBorder(
              // Light falls in from above: over as large a share of the card at any size.
              stretched(
                S,
                box(0, 0, 1050, 750),
                `<g fill="#ffffff" fill-opacity=".08"><path d="M90 0h120L420 750H250Z"/><path d="M430 0h70L640 750H520Z"/><path d="M700 0h150L1010 750H800Z"/></g>`,
              ),
              S.pin(
                weed(34, 150, '#0b6088') +
                  weed(64, 104, '#128aa6', 11) +
                  weed(96, 70, '#0b6088', 10),
                [0, 750],
                { x: 'start', y: 'end' },
              ),
              S.pin(
                weed(1014, 140, '#0b6088') +
                  weed(984, 96, '#128aa6', 11) +
                  weed(950, 62, '#0b6088', 10),
                [1050, 750],
                { x: 'end', y: 'end' },
              ),
              bubbles(S),
            ) +
            // A line of white around the photograph, and foam on the waves at its foot.
            `<g clip-path="url(#dry)">${S.outline(
              { x: opening.x - 3.5, y: opening.y - 3.5, w: opening.w + 7, h: opening.h + 90 },
              42,
              7,
              'stroke="#ffffff"',
            )}</g>` +
            `<g clip-path="url(#shore)">${strip(S, foot - TIDE, TIDE + 1, 'url(#foam)')}</g>`,
        }),
        extras: [
          sticker(picture('kids-octopus'), 14, 14, 196, { turn: -8 }),
          sticker(picture('kids-reef'), 12, 592, 172),
          label(plate, 190, 612, [
            caption(
              66,
              28,
              372,
              62,
              { text: 'מסיבת הים של ליה', font: 'Varela Round', size: 38 },
              { text: 'Lia’s Sea Party', font: 'Varela Round', size: 46 },
              { color: '#0d4f73' },
            ),
          ]),
          sticker(picture('kids-whale'), 706, 536, 330),
          label(
            buoy,
            842,
            16,
            [
              caption(
                45,
                51,
                100,
                88,
                { text: '6', font: 'Rubik', size: 74, weight: 800 },
                { text: '6', font: 'Poppins', size: 72, weight: 800 },
                { color: '#ffffff' },
              ),
            ],
            { turn: 10 },
          ),
        ],
      },
      {
        en: 'event kids birthday party sea ocean underwater whale octopus fish mermaid pool',
        he: 'אירוע ילדים יום הולדת יומולדת מסיבה ים אוקיינוס מים לווייתן תמנון דג דגים בת הים בריכה',
      },
    );
  }

  /* ---- racing cars: a chequered corner, a road along the foot, a start number, a licence plate */
  function racing() {
    const opening = box(40, 40, 970, 554);
    const foot = opening.y + opening.h;
    /** How much of the photograph's corner the chequered band cuts off. */
    const CUT = 190;
    /** The window: the photograph less its top left corner, `by` larger on every side. */
    const pane = (by) => [
      [opening.x + CUT - by * 0.414, opening.y - by, { x: 'start', y: 'start' }],
      [opening.x + opening.w + by, opening.y - by, { x: 'end', y: 'start' }],
      [opening.x + opening.w + by, foot + by, { x: 'end', y: 'end' }],
      [opening.x - by, foot + by, { x: 'start', y: 'end' }],
      [opening.x - by, opening.y + CUT - by * 0.414, { x: 'start', y: 'start' }],
    ];
    // The racing car of Fluent Emoji, cut to its own box.
    const car = art(
      'kids-racing-car-side',
      37,
      14,
      '',
      `<g transform="translate(-2 -15.500)">${drawn('racing-car')}</g>` +
        // The lines of its speed, behind it.
        line(
          'M30 4.500h6M31 7.500h5M30 10.500h4',
          '#ffffff',
          0.9,
          ' stroke-linecap="round" stroke-opacity=".9"',
        ),
    );
    // The start number: a white disc in a black ring.
    const roundel = art(
      'kids-racing-roundel',
      170,
      170,
      '',
      `<circle cx="85" cy="89" r="80" fill="#000000" fill-opacity=".25"/>` +
        `<circle cx="85" cy="85" r="82" fill="#16161a"/>` +
        `<circle cx="85" cy="85" r="70" fill="#ffffff"/>` +
        `<circle cx="85" cy="85" r="63" fill="none" stroke="#e02a2a" stroke-width="3"/>`,
    );
    // The licence plate: yellow, embossed, a blue end with a wheel on it.
    const plate = art(
      'kids-racing-plate',
      400,
      100,
      `<linearGradient id="plate-tin" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffdf4a"/><stop offset="1" stop-color="#f6c416"/></linearGradient>` +
        `<clipPath id="plate-cut"><rect x="3" y="3" width="394" height="90" rx="13"/></clipPath>`,
      `<rect x="3" y="9" width="394" height="90" rx="13" fill="#000000" fill-opacity=".35"/>` +
        `<rect x="3" y="3" width="394" height="90" rx="13" fill="url(#plate-tin)"/>` +
        `<g clip-path="url(#plate-cut)"><rect x="0" y="0" width="56" height="100" fill="#1f4fb8"/>` +
        `<g fill="none" stroke="#ffffff" stroke-width="3.500"><circle cx="30" cy="48" r="15"/><path d="M30 48v15M30 48l-13-7M30 48l13-7"/></g><circle cx="30" cy="48" r="4" fill="#ffffff"/></g>` +
        `<rect x="3" y="3" width="394" height="90" rx="13" fill="none" stroke="#16161a" stroke-width="5"/>` +
        `<rect x="11" y="11" width="378" height="74" rx="7" fill="none" stroke="#16161a" stroke-opacity=".25" stroke-width="2"/>`,
    );
    return magnet(
      'magnet-racing',
      'Racing party magnet',
      'מגנט למסיבת מכוניות מרוץ',
      [1050, 750, 22],
      {
        opening,
        window: (S) => S.shape(pane(-1), 'fill="#000"'),
        draw: (S) => ({
          defs:
            `<linearGradient id="paint" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ea3030"/><stop offset="1" stop-color="#bd1c1c"/></linearGradient>` +
            `<pattern id="pinstripe" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="16" fill="#000000" fill-opacity=".08"/></pattern>` +
            `<pattern id="checks" width="44" height="44" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="44" height="44" fill="#ffffff"/><rect width="22" height="22" fill="#16161a"/><rect x="22" y="22" width="22" height="22" fill="#16161a"/></pattern>` +
            `<linearGradient id="asphalt" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#3a3d45"/><stop offset="1" stop-color="#23252b"/></linearGradient>` +
            repeated(
              'kerb',
              0,
              foot + 8,
              72,
              14,
              `<rect width="72" height="14" fill="#ffffff"/><rect width="36" height="14" fill="#e02a2a"/>`,
            ) +
            repeated(
              'dashes',
              20,
              682,
              120,
              9,
              `<rect width="70" height="9" rx="2" fill="#ffffff" fill-opacity=".92"/>`,
            ),
          body:
            ground(S, 'url(#paint)') +
            onBorder(
              S.whole('fill="url(#pinstripe)"'),
              S.outline(box(13, 13, 1024, 724), 12, 2.4, 'stroke="#ffffff" stroke-opacity=".55"'),
              // The chequered band across the corner, between two white lines.
              `<path d="M124.500 0H248.900L0 248.900V124.500Z" fill="url(#checks)"/>` +
                line('M124.500 0 0 124.500M248.900 0 0 248.900', '#ffffff', 5),
              // The road: its kerb, its asphalt, the dashes down its middle.
              S.box(box(0, foot + 20, 1050, 750 - foot - 20), 0, 'fill="url(#asphalt)"'),
              strip(S, foot + 8, 14, 'url(#kerb)'),
              strip(S, 682, 9, 'url(#dashes)'),
              S.box(box(0, 742, 1050, 8), 0, 'fill="#16161a"'),
              // The line of white around the photograph.
              S.shape(pane(7), 'fill="#ffffff"'),
            ),
        }),
        extras: [
          sticker(car, 16, 606, 340, { flip: true }),
          label(
            plate,
            616,
            632,
            [
              caption(
                66,
                16,
                320,
                64,
                { text: 'המרוץ של רועי', font: 'Rubik', size: 38, weight: 800 },
                { text: 'ROY’S RACE', font: 'Poppins', size: 38, weight: 800, spacing: 2 },
                { color: '#16161a' },
              ),
            ],
            { turn: -3 },
          ),
          label(
            roundel,
            864,
            12,
            [
              caption(
                25,
                24,
                120,
                122,
                { text: '5', font: 'Rubik', size: 104, weight: 900, italic: true },
                { text: '5', font: 'Poppins', size: 100, weight: 800, italic: true },
                { color: '#16161a' },
              ),
            ],
            { turn: 8 },
          ),
        ],
      },
      {
        en: 'event kids birthday party racing race car cars formula track speed',
        he: 'אירוע ילדים יום הולדת יומולדת מסיבה מרוץ מרוצים מכונית מכוניות פורמולה מסלול מהירות',
      },
    );
  }

  return [
    dino(),
    space(),
    unicorn(),
    superhero(),
    kingdom(),
    football(),
    pirates(),
    safari(),
    sea(),
    racing(),
  ];
}
