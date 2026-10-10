import { readFileSync } from 'node:fs';
import { sheet, svg as artwork } from '../frames-art.mjs';

/*
 * What the magnets of events are drawn with (`../frames-magnets.mjs`). A magnet is a card with a
 * window for the photograph, drawn as one SVG that lays itself out in the frame's box at any size
 * (`frames-art.mjs`). The card is ground only: its fill, its pattern or texture, the line around
 * the window. Whatever reads as an object is not part of the card. It goes onto the slide as an
 * element of its own beside the picture, which is moved, turned, typed over or deleted:
 *
 * - a sticker (`sticker`): a drawing of Fluent Emoji, one drawn here (`art`) or a generated
 *   picture (`picture`);
 * - a caption (`caption`): a line of words;
 * - a label (`label`): a plate that carries words, a ribbon, a badge, a tag. The plate and its
 *   words are one group on the slide, moved as one.
 *
 * The stickers of Fluent Emoji (MIT), which the app ships a part of already, are copied into the
 * catalogue, so a magnet does not wait for an art set.
 */

const emoji = JSON.parse(
  readFileSync(
    new URL('../../node_modules/@iconify-json/fluent-emoji/icons.json', import.meta.url),
    'utf8',
  ),
);

const f = (value) => String(Math.round(value * 10) / 10 + 0);
const percent = (share) => `${f(share * 100)}%`;

/** The drawing of an emoji: the inside of an `<svg>` 32 wide and high. */
function drawn(name) {
  const icon = emoji.icons[name];
  if (!icon) throw new Error(`Fluent Emoji does not draw ${name}`);
  return icon.body;
}

const svg = (w, h, defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

/**
 * A filter that turns the hues of a drawing, which keeps its shading. A hue that comes out
 * darker than the drawing was is made lighter by `gain`.
 */
const hue = (id, turn, gain = 1) =>
  `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="hueRotate" values="${turn}"/>` +
  (gain === 1
    ? ''
    : `<feComponentTransfer>${['R', 'G', 'B'].map((c) => `<feFunc${c} type="linear" slope="${gain}"/>`).join('')}</feComponentTransfer>`) +
  `</filter>`;

/** The stickers that are composed or drawn for more than one magnet, by name: a whole SVG each. */
const SHARED = {
  // A sun that wears sunglasses: two drawings and a smile.
  'sun-shades': svg(
    32,
    32,
    '',
    `${drawn('sun')}<g transform="translate(6.1 5.6) scale(.62)">${drawn('sunglasses')}</g>` +
      `<path d="M12.4 20.3c.9 1.3 2.1 1.9 3.6 1.9s2.7-.6 3.6-1.9" fill="none" stroke="#a04a00" stroke-width="1.15" stroke-linecap="round"/>`,
  ),
  balloons: svg(
    56,
    48,
    hue('blue', 215, 1.45) + hue('violet', 285, 1.15),
    `<g transform="translate(0 12) rotate(-16 16 16)" filter="url(#blue)">${drawn('balloon')}</g>` +
      `<g transform="translate(24 12) rotate(16 16 16)" filter="url(#violet)">${drawn('balloon')}</g>` +
      `<g transform="translate(12 0)">${drawn('balloon')}</g>`,
  ),
  crayons: svg(
    40,
    34,
    hue('red', 250) + hue('blue', 95),
    `<g transform="translate(40 2) scale(-1 1)" filter="url(#blue)">${drawn('crayon')}</g>` +
      `<g transform="translate(0 1)" filter="url(#red)">${drawn('crayon')}</g>`,
  ),
  // A gold Star of David on a disc of night blue.
  'star-of-david': svg(
    120,
    120,
    `<radialGradient id="night" cx=".4" cy=".3" r=".9"><stop stop-color="#2a4290"/><stop offset="1" stop-color="#0c1638"/></radialGradient>` +
      `<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbeab0"/><stop offset=".5" stop-color="#e9c46a"/><stop offset="1" stop-color="#c8962e"/></linearGradient>`,
    `<circle cx="60" cy="60" r="56" fill="url(#night)"/>` +
      `<circle cx="60" cy="60" r="55.5" fill="none" stroke="url(#gold)" stroke-width="5"/>` +
      `<circle cx="60" cy="60" r="46.500" fill="none" stroke="#f3d27a" stroke-opacity=".6" stroke-width="1.6" stroke-dasharray=".1 5.2" stroke-linecap="round"/>` +
      `<g fill="none" stroke="url(#gold)" stroke-width="5.4" stroke-linejoin="round"><path d="M60 25 90.300 77.500H29.700Z"/><path d="M60 95 29.700 42.500h60.600Z"/></g>`,
  ),
};

/** Where the generated pictures of the magnets are kept: beside the project, in the media library. */
const PICTURES = new URL(
  '../../../../../Slidr-media/elements/source/frames/pictures/',
  import.meta.url,
);

/** The height of a caption's line, as a multiple of its size (`CAPTION_LEADING` in `frames.ts`). */
const LEADING = 1.15;

/** How many pixels wide and high a WebP file is, from its header. */
function webpSize(bytes) {
  const kind = bytes.toString('latin1', 12, 16);
  if (kind === 'VP8X')
    return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (kind === 'VP8 ') {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (kind === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  throw new Error('Not a WebP picture');
}

/**
 * @param base The paths and the entries of the catalogue script: one way of drawing for all
 *   the frames.
 */
export function magnetKit(base) {
  const { box, inset, SHADOW, words, around } = base;

  /** Every sticker that was asked for, by name. An emoji is a sticker by its own name. */
  const stickers = new Map(Object.entries(SHARED));
  const used = new Set();
  const stickerOf = (name) => {
    if (!stickers.has(name)) {
      if (!emoji.icons[name]) throw new Error(`No sticker is called ${name}`);
      stickers.set(name, svg(32, 32, '', drawn(name)));
    }
    return stickers.get(name);
  };
  /** How wide and how tall a sticker is drawn, in the units of its own drawing. */
  const drawnSize = (name) => {
    const [, , across, down] = /viewBox="([\d. ]+)"/.exec(stickerOf(name))[1].split(' ');
    return { across: Number(across), down: Number(down) };
  };

  /**
   * A drawing of the magnets' own as a sticker: `w` by `h`, its `<defs>` and its body. The ids
   * of its `<defs>` are its own: on a slide every sticker is drawn apart from the others.
   */
  const art = (name, w, h, defs, body) => {
    const markup = svg(w, h, defs, body);
    if (emoji.icons[name] || (stickers.has(name) && stickers.get(name) !== markup)) {
      throw new Error(`Two stickers are called ${name}`);
    }
    stickers.set(name, markup);
    return name;
  };

  /**
   * A generated picture, as the data an `<image>` holds, and its size in pixels. The pictures
   * are in the media library with the other sources of Elements, not in the project tree.
   */
  const pictures = new Map();
  const raster = (name) => {
    if (!pictures.has(name)) {
      const bytes = readFileSync(new URL(`${name}.webp`, PICTURES));
      pictures.set(name, {
        ...webpSize(bytes),
        href: `data:image/webp;base64,${bytes.toString('base64')}`,
      });
    }
    return pictures.get(name);
  };
  /**
   * A generated picture as a sticker: a cut-out on a transparent ground, which no drawing gives
   * (flowers in watercolour, a garland, an object no emoji draws). It is carried in the markup,
   * so the magnet needs no file beside the deck.
   */
  const picture = (name) => {
    if (!stickers.has(name)) {
      const { width, height, href } = raster(name);
      art(name, width, height, '', `<image width="${width}" height="${height}" href="${href}"/>`);
    }
    return name;
  };
  /**
   * A generated picture as a pattern of the card, `size` units wide: a texture (paper, wood,
   * linen) that repeats, so a larger card has more of it and none of it is stretched.
   */
  const tile = (id, name, size) => {
    const { width, height, href } = raster(name);
    const high = Math.round((size * height) / width);
    return (
      `<pattern id="${id}" width="${size}" height="${high}" patternUnits="userSpaceOnUse">` +
      `<image width="${size}" height="${high}" preserveAspectRatio="none" href="${href}"/></pattern>`
    );
  };

  /** How an extra stands: turned by degrees clockwise, mirrored, or under the picture. */
  const stands = ({ turn = 0, flip = false, under = false }) => ({
    ...(turn ? { rotation: turn } : {}),
    ...(flip ? { flip: true } : {}),
    ...(under ? { under: true } : {}),
  });

  /**
   * A sticker beside the picture, in the frame's box: as wide as `size`, and as tall as its
   * drawing makes it. `under`, it lies under the picture, and shows where the card leaves the
   * box of the frame bare.
   */
  const sticker = (name, x, y, size, options = {}) => {
    const { across, down } = drawnSize(name);
    used.add(name);
    return {
      kind: 'sticker',
      art: name,
      x,
      y,
      w: size,
      h: Math.round((size * down) / across),
      ...stands(options),
    };
  };
  /**
   * A line of words beside the picture, in the frame's box: what it says and how it is set in
   * Hebrew and in English (`{ text, size, font, weight, spacing, italic }`), and its colour.
   * `align` sets it to the `left` or the `right` of its box in both languages; otherwise it is
   * in the middle. `colors` paints its letters one after the other, in turn.
   */
  const caption = (x, y, w, h, he, en, { color, colors, align, turn = 0 }) => ({
    kind: 'caption',
    x,
    y,
    w,
    h,
    ...stands({ turn }),
    he,
    en,
    color: typeof color === 'string' ? { value: color } : color,
    ...(colors ? { colors } : {}),
    ...(align ? { align } : {}),
  });
  /**
   * A plate with words on it: a ribbon, a badge, a tag, a speech bubble. `plate` is a sticker
   * drawn in the units of the card (`art`), put with its corner at `x`, `y`; `lines` are
   * captions whose boxes are written from the corner of the plate. On the slide the plate and
   * its words are one group, so they are moved, turned and deleted as one.
   */
  const label = (plate, x, y, lines, options = {}) => {
    const { across, down } = drawnSize(plate);
    used.add(plate);
    // Keep the ends and the outer border; only the middle of a text plate lengthens. A
    // drawing can pick several clear strips to keep an ornament between them intact.
    const end = Math.min(across / 4, down);
    const stretch = options.stretch ?? {
      x: [[end, across - end]],
      y: [[down / 3, (2 * down) / 3]],
    };
    return {
      kind: 'label',
      art: plate,
      x,
      y,
      w: across,
      h: down,
      ...stands(options),
      stretch,
      lines,
    };
  };

  /** The box an extra takes up when it is turned, in the frame's box. */
  const reach = (extra) => {
    const turn = ((extra.rotation ?? 0) * Math.PI) / 180;
    const [c, s] = [Math.abs(Math.cos(turn)), Math.abs(Math.sin(turn))];
    const [bw, bh] = [extra.w * c + extra.h * s, extra.w * s + extra.h * c];
    const [cx, cy] = [extra.x + extra.w / 2, extra.y + extra.h / 2];
    return { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh };
  };
  const called = (extra) => extra.art ?? extra.en.text;

  /** What the app counts on in every magnet: thrown here, where the magnet is drawn. */
  function checked(id, extra, w, h, opening) {
    // A caption is set with the line as tall as `LEADING` of its size: its box holds the line.
    for (const line of extra.kind === 'label'
      ? extra.lines
      : extra.kind === 'caption'
        ? [extra]
        : []) {
      if (line.h < LEADING * Math.max(line.he.size, line.en.size)) {
        throw new Error(`${id}: the box of "${line.en.text}" is lower than its line`);
      }
      if (extra.kind !== 'label') continue;
      if (line.rotation)
        throw new Error(`${id}: "${line.en.text}" turns with its plate, not on it`);
      if (line.x < 0 || line.y < 0 || line.x + line.w > extra.w || line.y + line.h > extra.h) {
        throw new Error(`${id}: "${line.en.text}" reaches outside its plate`);
      }
    }
    // What turns keeps inside the box of the frame, so the group is as large as the card.
    const at = reach(extra);
    if (at.x < 0 || at.y < 0 || at.x + at.w > w || at.y + at.h > h) {
      throw new Error(`${id}: ${called(extra)} reaches outside the card`);
    }
    // A click on the middle of the photograph reaches the photograph.
    const [mx, my] = [opening.x + opening.w / 2, opening.y + opening.h / 2];
    if (!extra.under && mx > at.x && mx < at.x + at.w && my > at.y && my < at.y + at.h) {
      throw new Error(`${id}: ${called(extra)} lies over the middle of the photograph`);
    }
  }

  /**
   * A magnet: a card of `w` by `h` with round corners, and the photograph in `opening`, seen
   * through a window of the card: one with corners rounded by `round`, or the one `window`
   * writes on the sheet, in black. `draw` writes the card on its sheet (`frames-art.mjs`) and
   * returns the `<defs>` and the body of the drawing: the card keeps its size when the magnet
   * is made larger, and the window takes up the change. The card lies over the photograph all
   * around the window, so the photograph itself is not cut.
   *
   * A card that is not the whole box of the frame (a print with things behind it, a shape cut
   * out) says what it is with `card`, which writes it on the sheet in white; the rest of the
   * box is bare, and shows what lies under the picture. `set` is the set of the panel the
   * magnet is shown in, when it is not the one of its file.
   */
  function magnet(
    id,
    en,
    he,
    [w, h, radius],
    { opening, round = 0, window, card, draw, extras, set },
    tags,
  ) {
    const S = sheet(w, h, opening);
    // The window lies a pixel inside the opening all around, as the window of a card does.
    const hole = window
      ? window(S)
      : S.box(inset(opening, 1), Math.max(0, round - 1), 'fill="#000"');
    const border = S.mask(
      'border',
      card ? card(S) : S.box(box(0, 0, w, h), radius, 'fill="#fff"'),
      hole,
    );
    const { defs = '', body } = draw(S);
    for (const extra of extras) checked(id, extra, w, h, opening);
    // The shadow is the whole magnet's, the photograph included: none of it falls on the picture.
    return {
      id,
      en,
      he,
      w,
      h,
      art: { opening, drawing: artwork(border + defs, body) },
      extras,
      shadow: SHADOW,
      ...(set ? { set } : {}),
      ...words(tags),
    };
  }

  /** The card filled, and what is drawn on it kept off the photograph. */
  const ground = (S, fill) => S.whole(`fill="${fill}" mask="url(#border)"`);
  const onBorder = (...parts) => `<g mask="url(#border)">${parts.join('')}</g>`;
  const line = (d, colour, width, more = '') =>
    `<path d="${d}" fill="none" stroke="${colour}" stroke-width="${width}"${more}/>`;
  /** A line around the photograph, `by` away from it, with corners of `radius`. */
  const frameLine = (S, by, radius, colour, width, more = '') =>
    S.outline(inset(S.opening, -by), radius, width, `stroke="${colour}"${more}`);
  /**
   * A part of the card that is stretched with it: `body` is drawn in the box given, which is
   * as large a share of the card at any size.
   */
  const stretched = (S, { x, y, w, h }, body) =>
    `<svg x="${percent(x / S.w)}" y="${percent(y / S.h)}" width="${percent(w / S.w)}" height="${percent(h / S.h)}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="none">${body}</svg>`;

  /** A four-point sparkle around a centre. */
  const sparkle = (cx, cy, r, k = 0.22) =>
    `M${f(cx)} ${f(cy - r)}Q${f(cx + r * k)} ${f(cy - r * k)} ${f(cx + r)} ${f(cy)}` +
    `Q${f(cx + r * k)} ${f(cy + r * k)} ${f(cx)} ${f(cy + r)}` +
    `Q${f(cx - r * k)} ${f(cy + r * k)} ${f(cx - r)} ${f(cy)}` +
    `Q${f(cx - r * k)} ${f(cy - r * k)} ${f(cx)} ${f(cy - r)}Z`;
  const star = (cx, cy, r, turn = 0, inner = 0.46) =>
    `M${around(10, turn, (i) => (i % 2 ? inner : 1))
      .map(([x, y]) => `${f(cx + x * r)} ${f(cy + y * r)}`)
      .join('L')}Z`;

  /**
   * Points on a card for small ornaments: `gap` apart from each other, and out of the boxes
   * that are to stay clear (the photograph, the caption). An ornament goes with its point
   * (`pin`): beside the photograph it keeps its distance from that side of the card, and
   * along the photograph its place along it, so the ornaments spread as the card grows.
   */
  function scattered(next, count, w, h, clear, gap, edge = 14) {
    const points = [];
    for (let tries = 0; points.length < count && tries < count * 80; tries++) {
      const [x, y] = [edge + next() * (w - 2 * edge), edge + next() * (h - 2 * edge)];
      if (clear.some((b) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h)) continue;
      if (points.some(([px, py]) => Math.hypot(px - x, py - y) < gap)) continue;
      points.push([x, y]);
    }
    return points;
  }

  const pick = (next, list) => list[Math.floor(next() * list.length)];

  /** A cloud lying on a line: circles on a flat foot. */
  const cloud = (x, y, s) =>
    `<g transform="translate(${x} ${y}) scale(${s})" fill="#ffffff"><rect x="0" y="52" width="230" height="64" rx="32"/><circle cx="70" cy="58" r="44"/><circle cx="132" cy="44" r="52"/><circle cx="182" cy="70" r="36"/></g>`;

  return {
    ...base,
    f,
    percent,
    drawn,
    hue,
    art,
    picture,
    tile,
    sticker,
    caption,
    label,
    magnet,
    ground,
    onBorder,
    line,
    frameLine,
    stretched,
    sparkle,
    star,
    scattered,
    pick,
    cloud,
    /** The stickers the magnets drawn so far have, by name. */
    stickers: () => Object.fromEntries([...used].sort().map((name) => [name, stickers.get(name)])),
  };
}
