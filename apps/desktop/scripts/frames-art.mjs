/*
 * The artwork of a decorated photo frame (`generate-frames-catalog.mjs`), as an SVG that lays
 * itself out. A frame on a slide is made larger and given other proportions, and its artwork
 * keeps its size: a border stays as thick as it is, a corner as round, a sticker as large, and
 * the opening for the photograph takes up the change. So the artwork is not a picture of one
 * size that is stretched. It is an SVG with no `viewBox`, in which a unit is a unit of the box
 * it is drawn in, and every part of it says where it stands in a box of any size: so far from
 * the start of the box, so far from its end, around its middle, or at its place along the
 * opening.
 *
 * A frame is drawn here as it is designed, in the coordinates of its own box (`w` by `h`, the
 * photograph in `opening`). `sheet` turns those coordinates into places that hold at any size.
 */

const number = (value) => String(Math.round(value * 100) / 100 + 0);

/** A place along the box: `p` of its length and `k` units more, as a CSS length. */
const css = ([p, k]) => {
  if (Math.abs(p) < 1e-9) return `${number(k)}px`;
  const share = `${number(p * 100)}%`;
  if (Math.abs(k) < 0.005) return share;
  return `calc(${share} ${k < 0 ? '-' : '+'} ${number(Math.abs(k))}px)`;
};

/**
 * One axis of a frame: `size` long, the opening from `from` for `length`. A coordinate is tied
 * to the box in one of these ways:
 *
 * - `start`: as far from the start of the box as it is drawn;
 * - `end`: as far from its end;
 * - `near`: as far from whichever of the two it is nearer to;
 * - `mid`: as far from its middle;
 * - `share`: at the same place along the opening;
 * - `part`: at the same place along the whole box;
 * - `of`: beside the opening it keeps its distance from that side, and over the opening its
 *   place along it.
 *
 * When nothing is said, the edge of a box is tied by `near` and a point by `of`.
 */
function axis(size, from, length) {
  const to = from + length;
  const ties = {
    start: (v) => [0, v],
    end: (v) => [1, v - size],
    mid: (v) => [0.5, v - size / 2],
    share: (v) => {
      const t = (v - from) / length;
      return [t, from - t * (size - length)];
    },
    part: (v) => [v / size, 0],
    near: (v) => (v <= size / 2 ? ties.start(v) : ties.end(v)),
    of: (v) => (v <= from ? ties.start(v) : v >= to ? ties.end(v) : ties.share(v)),
  };
  return (v, tie = 'of') => {
    if (!ties[tie]) throw new Error(`A coordinate is not tied by "${tie}"`);
    return ties[tie](v);
  };
}

export const svg = (defs, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

/**
 * The drawing sheet of a frame of `w` by `h` with the photograph in `opening`. What it returns
 * writes the parts of the artwork, each from coordinates of that box.
 *
 * `ties` say how a part follows the box, where its coordinates alone do not: `{ x, y }` for a
 * point, and for a box `{ l, t, r, b }` (its four edges) or `{ x, y }` (both edges of an axis).
 */
export function sheet(w, h, opening) {
  const along = { x: axis(w, opening.x, opening.w), y: axis(h, opening.y, opening.h) };
  const x = (v, tie) => css(along.x(v, tie));
  const y = (v, tie) => css(along.y(v, tie));

  /** The four edges of a box, each a place along its axis. */
  const edges = (rect, ties = {}) => ({
    l: along.x(rect.x, ties.l ?? ties.x ?? 'near'),
    r: along.x(rect.x + rect.w, ties.r ?? ties.x ?? 'near'),
    t: along.y(rect.y, ties.t ?? ties.y ?? 'near'),
    b: along.y(rect.y + rect.h, ties.b ?? ties.y ?? 'near'),
  });
  const span = ([p0, k0], [p1, k1]) => css([p1 - p0, k1 - k0]);
  const fromEnd = ([p, k]) => css([1 - p, -k]);

  /**
   * The geometry of a `<rect>` as a style: for a box with an outline, which a clip cannot
   * draw. `radius` rounds its corners.
   */
  const geometry = (rect, radius = 0, ties) => {
    const e = edges(rect, ties);
    return (
      `x:${css(e.l)};y:${css(e.t)};width:${span(e.l, e.r)};height:${span(e.t, e.b)}` +
      (radius ? `;rx:${number(radius)}px` : '')
    );
  };

  /** A box as a clip of whatever fills the whole frame: one radius, or four from the top left. */
  const inset = (rect, radius = 0, ties) => {
    const e = edges(rect, ties);
    const radii = (Array.isArray(radius) ? radius : [radius]).map((r) => `${number(r)}px`);
    const round = radii.some((r) => r !== '0px') ? ` round ${radii.join(' ')}` : '';
    return `inset(${css(e.t)} ${fromEnd(e.r)} ${fromEnd(e.b)} ${css(e.l)}${round})`;
  };

  /** A polygon as such a clip. A point is `[x, y]`, or `[x, y, { x, y }]` with its ties. */
  const polygon = (points) =>
    `polygon(${points.map(([px, py, ties = {}]) => `${x(px, ties.x)} ${y(py, ties.y)}`).join(',')})`;

  const whole = (attrs, style) =>
    `<rect width="100%" height="100%" ${attrs}${style ? ` style="${style}"` : ''}/>`;

  return {
    w,
    h,
    opening,
    x,
    y,
    geometry,
    inset,
    polygon,
    /** A filled box: `attrs` paint it (`fill="…"`, or a `style` given as `paint`). */
    box: (rect, radius, attrs, { ties, paint = '' } = {}) =>
      whole(attrs, `${paint}clip-path:${inset(rect, radius, ties)}`),
    /** A filled polygon. */
    shape: (points, attrs, paint = '') => whole(attrs, `${paint}clip-path:${polygon(points)}`),
    /** The outline of a box, `width` thick, centred on the box's edge. */
    outline: (rect, radius, width, attrs, { ties, paint = '' } = {}) =>
      `<rect fill="none" stroke-width="${number(width)}" ${attrs} style="${paint}${geometry(rect, radius, ties)}"/>`,
    /** An ellipse in a box: filled, or an outline when `attrs` say so. */
    ellipse: (rect, attrs, { ties, paint = '' } = {}) => {
      const e = edges(rect, ties);
      const mid = ([p0, k0], [p1, k1]) => css([(p0 + p1) / 2, (k0 + k1) / 2]);
      const half = ([p0, k0], [p1, k1]) => css([(p1 - p0) / 2, (k1 - k0) / 2]);
      return `<ellipse ${attrs} style="${paint}cx:${mid(e.l, e.r)};cy:${mid(e.t, e.b)};rx:${half(e.l, e.r)};ry:${half(e.t, e.b)}"/>`;
    },
    /**
     * A part that keeps its size: `body` is drawn in the coordinates of the frame's box, and
     * goes with the point `at` of it (`[x, y]`, tied as `ties` say).
     */
    pin: (body, [px, py], ties = {}) => {
      const [p, k] = along.x(px, ties.x);
      const [q, m] = along.y(py, ties.y);
      const move =
        Math.abs(k - px) < 0.005 && Math.abs(m - py) < 0.005
          ? body
          : `<g transform="translate(${number(k - px)} ${number(m - py)})">${body}</g>`;
      if (Math.abs(p) < 1e-9 && Math.abs(q) < 1e-9) return move;
      return `<svg x="${number(p * 100)}%" y="${number(q * 100)}%" overflow="visible">${move}</svg>`;
    },
    /** Everything the frame is as large as: for a ground, a glow, a pattern. */
    whole,
    /**
     * A mask that keeps what is on the card and off the photograph: `card` and `window` are
     * what `box` writes, in white and in black. A part drawn with `mask="url(#id)"` shows on
     * the card only.
     */
    mask: (id, card, window) =>
      `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="100%">${card}${window}</mask>`,
  };
}
