import { readFileSync, writeFileSync } from 'node:fs';

/*
 * Writes `src/elements/frames-catalog.json`: the photo frames of the Elements panel, group by
 * group. A frame is a picture waiting for its photograph: most of them cut it to an outline (a
 * shape, a letter, a brush stroke), and the decorated ones draw artwork around an opening (an
 * instant photo, a phone, a picture frame).
 *
 * Every outline is made here, from geometry, from seeded noise, or from the glyphs of Rubik at
 * its heaviest, which the app already ships. The catalogue is checked in, so a frame keeps its
 * outline when a package updates.
 */

/* ---------------------------------------------------------------- paths */

/*
 * A path is a list of closed outlines; an outline is where it starts and its segments, lines
 * (`L`) and cubic curves (`C`) in absolute coordinates. Outlines run clockwise on the screen. A
 * picture is cut by the non-zero rule: clockwise outlines add up, and one that runs the other
 * way (`reversed`) is a hole.
 */

const rad = (deg) => (deg * Math.PI) / 180;
const deg = (radians) => (radians * 180) / Math.PI;

/** Draws one outline: lines, curves and arcs, from point to point. */
function pen(x, y) {
  const outline = { start: [x, y], segs: [] };
  let at = [x, y];
  const api = {
    line(px, py) {
      if (Math.abs(px - at[0]) > 1e-6 || Math.abs(py - at[1]) > 1e-6) {
        outline.segs.push(['L', px, py]);
        at = [px, py];
      }
      return api;
    },
    curve(x1, y1, x2, y2, px, py) {
      outline.segs.push(['C', x1, y1, x2, y2, px, py]);
      at = [px, py];
      return api;
    },
    /**
     * An arc of an ellipse between two angles in degrees: 0 is to the right and 90 is down, so
     * an arc whose angle grows runs clockwise. A line joins it to where the pen is.
     */
    arc(cx, cy, rx, ry, from, to) {
      const steps = Math.max(1, Math.ceil(Math.abs(to - from) / 90));
      const step = rad(to - from) / steps;
      const k = (4 / 3) * Math.tan(step / 4);
      let a = rad(from);
      api.line(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
      if (rx === 0 && ry === 0) return api;
      for (let i = 0; i < steps; i++) {
        const b = a + step;
        api.curve(
          cx + rx * (Math.cos(a) - k * Math.sin(a)),
          cy + ry * (Math.sin(a) + k * Math.cos(a)),
          cx + rx * (Math.cos(b) + k * Math.sin(b)),
          cy + ry * (Math.sin(b) - k * Math.cos(b)),
          cx + rx * Math.cos(b),
          cy + ry * Math.sin(b),
        );
        a = b;
      }
      return api;
    },
    done: () => [outline],
  };
  return api;
}

const area = (points) =>
  points.reduce((sum, [x, y], i) => {
    const [nx, ny] = points[(i + 1) % points.length];
    return sum + x * ny - nx * y;
  }, 0) / 2;

const clockwise = (points) => (area(points) < 0 ? [...points].reverse() : points);

function polygon(points) {
  const [start, ...rest] = clockwise(points);
  return [{ start, segs: rest.map(([x, y]) => ['L', x, y]) }];
}

const rect = (x, y, w, h) =>
  polygon([
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]);

/** A rectangle with round corners: one radius, or four from the top left corner clockwise. */
function roundRect(x, y, w, h, radius) {
  const [tl, tr, br, bl] = (Array.isArray(radius) ? radius : Array(4).fill(radius)).map((r) =>
    Math.min(r, w / 2, h / 2),
  );
  return pen(x + tl, y)
    .arc(x + w - tr, y + tr, tr, tr, -90, 0)
    .arc(x + w - br, y + h - br, br, br, 0, 90)
    .arc(x + bl, y + h - bl, bl, bl, 90, 180)
    .arc(x + tl, y + tl, tl, tl, 180, 270)
    .done();
}

const ellipse = (cx, cy, rx, ry) =>
  pen(cx + rx, cy)
    .arc(cx, cy, rx, ry, 0, 360)
    .done();
const circle = (cx, cy, r) => ellipse(cx, cy, r, r);

/** The part of a circle that a straight cut leaves: from one angle around to another. */
const segment = (cx, cy, r, from, to) =>
  pen(cx + r * Math.cos(rad(from)), cy + r * Math.sin(rad(from)))
    .arc(cx, cy, r, r, from, to)
    .done();

/** The same outlines the other way round: holes in whatever they are joined to. */
function reversed(path) {
  return path.map(({ start, segs }) => {
    const points = [start, ...segs.map((seg) => seg.slice(-2))];
    const back = [];
    for (let i = segs.length - 1; i >= 0; i--) {
      const seg = segs[i];
      back.push(
        seg[0] === 'C' ? ['C', seg[3], seg[4], seg[1], seg[2], ...points[i]] : ['L', ...points[i]],
      );
    }
    return { start: points[points.length - 1], segs: back };
  });
}

const cutOut = (outer, ...holes) => [...outer, ...holes.flatMap(reversed)];

function mapped(path, to) {
  return path.map(({ start, segs }) => ({
    start: to(start),
    segs: segs.map(([command, ...values]) => {
      const out = [command];
      for (let i = 0; i < values.length; i += 2) out.push(...to([values[i], values[i + 1]]));
      return out;
    }),
  }));
}

const moved = (path, dx, dy) => mapped(path, ([x, y]) => [x + dx, y + dy]);
const scaled = (path, sx, sy = sx) => mapped(path, ([x, y]) => [x * sx, y * sy]);

const spin =
  (turn, cx = 0, cy = 0) =>
  ([x, y]) => {
    const c = Math.cos(rad(turn));
    const s = Math.sin(rad(turn));
    return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
  };

const turned = (path, turn, cx, cy) => mapped(path, spin(turn, cx, cy));

const bezier = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

/** Where along a curve one of its coordinates turns back. */
function turns(p0, p1, p2, p3) {
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const roots = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) roots.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) roots.push((-b + Math.sqrt(disc)) / (2 * a), (-b - Math.sqrt(disc)) / (2 * a));
  }
  return roots.filter((t) => t > 0 && t < 1);
}

/** The box that holds a path, curves and all. */
function bounds(path) {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x, y) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const { start, segs } of path) {
    let at = start;
    add(...at);
    for (const seg of segs) {
      if (seg[0] === 'C') {
        const [, ax, ay, bx, by, px, py] = seg;
        for (const t of [...turns(at[0], ax, bx, px), ...turns(at[1], ay, by, py)]) {
          add(bezier(at[0], ax, bx, px, t), bezier(at[1], ay, by, py, t));
        }
      }
      at = seg.slice(-2);
      add(...at);
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** The path stretched so that it fills a box exactly. */
function fitted(path, w, h) {
  const b = bounds(path);
  return mapped(path, ([x, y]) => [((x - b.x) * w) / (b.w || 1), ((y - b.y) * h) / (b.h || 1)]);
}

const number = (value) => String(Math.round(value * 10) / 10 + 0);

/** Path data, to a tenth of a pixel. */
const data = (path) =>
  path
    .map(
      ({ start, segs }) =>
        `M${number(start[0])} ${number(start[1])}${segs
          .map(([command, ...values]) => `${command}${values.map(number).join(' ')}`)
          .join('')}Z`,
    )
    .join('');

/** A closed curve through points, as a hand would draw it. */
function smooth(points) {
  const p = clockwise(points);
  const at = (i) => p[(i + p.length) % p.length];
  return [
    {
      start: p[0],
      segs: p.map((_, i) => {
        const [a, b, c, e] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
        return [
          'C',
          b[0] + (c[0] - a[0]) / 6,
          b[1] + (c[1] - a[1]) / 6,
          c[0] - (e[0] - b[0]) / 6,
          c[1] - (e[1] - b[1]) / 6,
          c[0],
          c[1],
        ];
      }),
    },
  ];
}

/** A polygon with its corners rounded: each is cut `by` along its two sides and curved. */
function rounded(points, by) {
  const p = clockwise(points);
  const corners = p.map((v, i) => {
    const towards = (other) => {
      const length = Math.hypot(other[0] - v[0], other[1] - v[1]);
      const t = Math.min(by, length / 2) / length;
      return [v[0] + (other[0] - v[0]) * t, v[1] + (other[1] - v[1]) * t];
    };
    return {
      v,
      enter: towards(p[(i + p.length - 1) % p.length]),
      leave: towards(p[(i + 1) % p.length]),
    };
  });
  const shape = pen(...corners[0].enter);
  for (const { v, enter, leave } of corners) {
    shape
      .line(...enter)
      .curve(
        enter[0] + ((v[0] - enter[0]) * 2) / 3,
        enter[1] + ((v[1] - enter[1]) * 2) / 3,
        leave[0] + ((v[0] - leave[0]) * 2) / 3,
        leave[1] + ((v[1] - leave[1]) * 2) / 3,
        ...leave,
      );
  }
  return shape.done();
}

/** Points around a circle of radius 1, the first straight up; `radius` may differ by point. */
const around = (count, turn = 0, radius = () => 1) =>
  Array.from({ length: count }, (_, i) => {
    const a = rad(-90 + turn + (i * 360) / count);
    const r = radius(i);
    return [r * Math.cos(a), r * Math.sin(a)];
  });

const starPoints = (points, inner, turn = 0) =>
  around(points * 2, turn, (i) => (i % 2 ? inner : 1));

/** The end angle of an arc from `from` that passes `via` on its way to `to`. */
function through(from, via, to) {
  const turn = (a) => ((a % 360) + 360) % 360;
  const up = turn(to - from);
  return turn(via - from) <= up ? from + up : from + up - 360;
}

/**
 * The outline of circles of radius `r` set around a circle of radius `at`: a flower, a clover,
 * the scalloped edge of a seal.
 */
function petals(count, at, r, turn = 0) {
  const step = 360 / count;
  const half = at * Math.sin(rad(step / 2));
  const reach = at * Math.cos(rad(step / 2)) + Math.sqrt(r * r - half * half);
  const cross = (angle) => [reach * Math.cos(rad(angle)), reach * Math.sin(rad(angle))];
  let shape;
  for (let i = 0; i < count; i++) {
    const mid = -90 + turn + i * step;
    const [cx, cy] = [at * Math.cos(rad(mid)), at * Math.sin(rad(mid))];
    const [a, b] = [cross(mid - step / 2), cross(mid + step / 2)];
    const from = deg(Math.atan2(a[1] - cy, a[0] - cx));
    const to = deg(Math.atan2(b[1] - cy, b[0] - cx));
    shape ??= pen(...a);
    // Around the far side of the circle, from one neighbour to the next.
    const via = through(from, mid, mid);
    shape.arc(cx, cy, r, r, from, via).arc(cx, cy, r, r, via, through(via, to, to));
  }
  return shape.done();
}

/** What is left of one circle when another is taken out of it. */
function crescent([x1, y1, r1], [x2, y2, r2]) {
  const [dx, dy] = [x2 - x1, y2 - y1];
  const dist = Math.hypot(dx, dy);
  const along = (r1 * r1 - r2 * r2 + dist * dist) / (2 * dist);
  const off = Math.sqrt(r1 * r1 - along * along);
  const [px, py] = [x1 + (dx * along) / dist, y1 + (dy * along) / dist];
  const a = [px - (dy * off) / dist, py + (dx * off) / dist];
  const b = [px + (dy * off) / dist, py - (dx * off) / dist];
  const angle = ([x, y], cx, cy) => deg(Math.atan2(y - cy, x - cx));
  // Both arcs pass the side that faces away from the second circle.
  const away = deg(Math.atan2(-dy, -dx));
  const [a1, b1, b2, a2] = [angle(a, x1, y1), angle(b, x1, y1), angle(b, x2, y2), angle(a, x2, y2)];
  return pen(...a)
    .arc(x1, y1, r1, r1, a1, through(a1, away, b1))
    .arc(x2, y2, r2, r2, b2, through(b2, away, a2))
    .done();
}

/** The part of a polygon where `keep` is not negative; `keep` is linear in the point. */
function kept(points, keep) {
  const out = [];
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length];
    const [kp, kq] = [keep(p), keep(q)];
    if (kp >= 0) out.push(p);
    if (kp < 0 !== kq < 0) {
      const t = kp / (kp - kq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  });
  return out;
}

/** What shows of a convex polygon that lies under a box: the pieces around the box. */
function showing(points, { x, y, w, h }) {
  const beside = kept(
    kept(points, ([, py]) => py - y),
    ([, py]) => y + h - py,
  );
  return [
    kept(points, ([, py]) => y - py),
    kept(points, ([, py]) => py - (y + h)),
    kept(beside, ([px]) => x - px),
    kept(beside, ([px]) => px - (x + w)),
  ]
    .filter((piece) => piece.length > 2 && Math.abs(area(piece)) > 1)
    .flatMap(polygon);
}

/** Numbers that look random and are the same on every run. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- entries */

/** The longer side of a frame on the slide, in slide pixels, unless it says otherwise. */
const SIDE = 480;

const words = (tags) => (tags ? { tags } : {});

/** A plain picture box: nothing is cut. */
const plain = (id, en, he, w, h, tags) => ({ id, en, he, w, h, ...words(tags) });

/** A frame cut by a mask the model has a kind for: an ellipse, round corners, a library shape. */
const masked = (id, en, he, w, h, mask, tags) => ({ id, en, he, w, h, mask, ...words(tags) });

const preset = (id, en, he, name, w, h, tags) =>
  masked(id, en, he, w, h, { kind: 'shape', preset: name }, tags);

/** A frame cut by an outline. `size` is its longer side on the slide, or its whole box. */
function cut(id, en, he, path, size = SIDE, tags) {
  const b = bounds(path);
  const scale = typeof size === 'number' ? size / Math.max(b.w, b.h) : 1;
  const { w, h } =
    typeof size === 'number' ? { w: Math.round(b.w * scale), h: Math.round(b.h * scale) } : size;
  return { id, en, he, w, h, d: data(fitted(path, w, h)), ...words(tags) };
}

const SHADOW = { x: 0, y: 8, blur: 22, color: { value: '#000000', alpha: 0.24 } };

const ink = (value, alpha) => ({
  kind: 'solid',
  color: alpha === undefined ? { value } : { value, alpha },
});
/** A colour of the deck's theme: the artwork follows the theme. */
const theme = (token) => ({ kind: 'solid', color: { token } });

const layer = (path, fill, shadow) => ({ d: data(path), fill, ...(shadow ? { shadow } : {}) });

const box = (x, y, w, h) => ({ x, y, w, h });
const inset = ({ x, y, w, h }, by) => ({ x: x + by, y: y + by, w: w - 2 * by, h: h - 2 * by });
const boxPath = ({ x, y, w, h }, radius = 0) => roundRect(x, y, w, h, radius);

/**
 * The window a card has for its photograph: a pixel inside the opening all around, so the edge
 * of the card lies over the edge of the photograph and no line of the slide shows between them.
 */
const windowOf = (opening, radius = 0) =>
  boxPath(
    inset(opening, 1),
    (Array.isArray(radius) ? radius : Array(4).fill(radius)).map((r) => Math.max(0, r - 1)),
  );

const cornersOf = ({ x, y, w, h }) => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/**
 * A decorated frame: artwork in a box of `w` by `h`, drawn over the photograph, which shows
 * through `opening`. `clip` cuts the photograph inside the opening, in the opening's own box.
 */
function art(id, en, he, w, h, { opening, clip, layers }, tags) {
  return {
    id,
    en,
    he,
    w,
    h,
    art: { opening, ...(clip ? { clip: data(clip) } : {}), layers },
    ...words(tags),
  };
}

/* ---------------------------------------------------------------- shapes */

const heart = () => {
  const r = Math.SQRT1_2;
  return pen(0, 1)
    .line(-1, 0)
    .arc(-0.5, -0.5, r, r, 135, 315)
    .arc(0.5, -0.5, r, r, 225, 405)
    .done();
};

const drop = () => {
  const tip = 2.3;
  const lean = deg(Math.acos(1 / tip));
  return pen(0, -tip)
    .arc(0, 0, 1, 1, -90 + lean, 270 - lean)
    .done();
};

const arch = (w, h, x = 0, y = 0) =>
  pen(x, y + h)
    .arc(x + w / 2, y + w / 2, w / 2, w / 2, 180, 360)
    .line(x + w, y + h)
    .done();

function basic() {
  const triangle = [
    [240, 0],
    [480, 416],
    [0, 416],
  ];
  const squircle = around(40).map(([x, y]) => [
    Math.sign(x) * Math.sqrt(Math.abs(x)),
    Math.sign(y) * Math.sqrt(Math.abs(y)),
  ]);
  const egg = around(40).map(([x, y]) => [x * (0.74 + 0.08 * y), y]);
  const dome = segment(1, 1, 1, 180, 360);
  const quarter = pen(0, 1).line(0, 0).arc(0, 1, 1, 1, 270, 360).done();
  const shield = pen(0, 0)
    .line(1, 0)
    .line(1, 0.55)
    .curve(1, 0.9, 0.75, 1.08, 0.5, 1.2)
    .curve(0.25, 1.08, 0, 0.9, 0, 0.55)
    .done();
  return [
    masked(
      'circle',
      'Circle',
      'עיגול',
      SIDE,
      SIDE,
      { kind: 'ellipse' },
      { en: 'round', he: 'עגול' },
    ),
    plain('square', 'Square', 'ריבוע', SIDE, SIDE),
    masked('rounded-square', 'Rounded square', 'ריבוע מעוגל', SIDE, SIDE, {
      kind: 'rounded',
      radius: 72,
    }),
    cut('squircle', 'Squircle', 'ריבוע רך', smooth(squircle)),
    plain('landscape', 'Landscape rectangle', 'מלבן לרוחב', 640, 480),
    plain('wide', 'Wide rectangle', 'מלבן רחב', 640, 360),
    plain('portrait', 'Portrait rectangle', 'מלבן לגובה', 420, 560),
    masked('rounded-landscape', 'Rounded rectangle', 'מלבן מעוגל', 640, 480, {
      kind: 'rounded',
      radius: 56,
    }),
    masked('rounded-portrait', 'Tall rounded rectangle', 'מלבן מעוגל לגובה', 420, 560, {
      kind: 'rounded',
      radius: 56,
    }),
    masked('oval', 'Oval', 'אליפסה', 620, 420, { kind: 'ellipse' }),
    masked('oval-tall', 'Tall oval', 'אליפסה לגובה', 400, 560, { kind: 'ellipse' }),
    cut('pill', 'Pill', 'גלולה', roundRect(0, 0, 640, 300, 150), 640, {
      en: 'capsule',
      he: 'קפסולה',
    }),
    cut('pill-tall', 'Tall pill', 'גלולה לגובה', roundRect(0, 0, 300, 600, 150), 600),
    preset('triangle', 'Triangle', 'משולש', 'triangle', 480, 416),
    cut('triangle-down', 'Inverted triangle', 'משולש הפוך', scaled(polygon(triangle), 1, -1)),
    preset('right-triangle', 'Right triangle', 'משולש ישר זווית', 'rightTriangle', 480, 400),
    cut('rounded-triangle', 'Rounded triangle', 'משולש מעוגל', rounded(triangle, 76)),
    preset('diamond', 'Diamond', 'מעוין', 'diamond', 420, 480),
    preset('pentagon', 'Pentagon', 'מחומש', 'pentagon', 480, 457),
    preset('hexagon', 'Hexagon', 'משושה', 'hexagon', 416, 480),
    cut('hexagon-flat', 'Flat hexagon', 'משושה שוכב', polygon(around(6, 30))),
    cut('rounded-hexagon', 'Rounded hexagon', 'משושה מעוגל', rounded(around(6), 0.24)),
    preset('octagon', 'Octagon', 'מתומן', 'octagon', 480, 480),
    preset('parallelogram', 'Parallelogram', 'מקבילית', 'parallelogram', 560, 360),
    cut(
      'parallelogram-back',
      'Parallelogram, leaning back',
      'מקבילית הפוכה',
      polygon([
        [0, 0],
        [420, 0],
        [560, 360],
        [140, 360],
      ]),
      560,
    ),
    preset('trapezoid', 'Trapezoid', 'טרפז', 'trapezoid', 560, 360),
    cut(
      'trapezoid-down',
      'Inverted trapezoid',
      'טרפז הפוך',
      polygon([
        [0, 0],
        [560, 0],
        [420, 360],
        [140, 360],
      ]),
      560,
    ),
    preset('plus', 'Plus', 'פלוס', 'plus', 480, 480, { en: 'cross', he: 'צלב' }),
    cut('heart', 'Heart', 'לב', heart(), SIDE, { en: 'love', he: 'אהבה' }),
    preset('star-4', 'Four-point star', 'כוכב ארבעה קודקודים', 'star4', 480, 480),
    preset('star-5', 'Star', 'כוכב', 'star5', 480, 457),
    preset('star-6', 'Six-point star', 'כוכב שישה קודקודים', 'star6', 416, 480),
    preset('star-8', 'Eight-point star', 'כוכב שמונה קודקודים', 'star8', 480, 480),
    cut('rounded-star', 'Rounded star', 'כוכב מעוגל', rounded(starPoints(5, 0.52), 0.13)),
    cut('seal', 'Scalloped circle', 'עיגול מסולסל', petals(16, 1, 0.205), SIDE, {
      en: 'badge seal',
      he: 'חותמת תג',
    }),
    cut('burst', 'Burst', 'פיצוץ', polygon(starPoints(18, 0.84)), SIDE, { en: 'sun', he: 'שמש' }),
    cut('semicircle-top', 'Semicircle', 'חצי עיגול', dome),
    cut('semicircle-bottom', 'Semicircle, round side down', 'חצי עיגול הפוך', turned(dome, 180)),
    cut('semicircle-left', 'Semicircle, round side left', 'חצי עיגול שמאלי', turned(dome, -90)),
    cut('semicircle-right', 'Semicircle, round side right', 'חצי עיגול ימני', turned(dome, 90)),
    cut('quarter-1', 'Quarter circle', 'רבע עיגול', quarter),
    cut('quarter-2', 'Quarter circle, turned once', 'רבע עיגול מסובב', turned(quarter, 90)),
    cut('quarter-3', 'Quarter circle, turned twice', 'רבע עיגול הפוך', turned(quarter, 180)),
    cut('quarter-4', 'Quarter circle, turned back', 'רבע עיגול מסובב לאחור', turned(quarter, 270)),
    cut('petal', 'Petal', 'עלה כותרת', roundRect(0, 0, SIDE, SIDE, [240, 0, 240, 0])),
    cut(
      'petal-back',
      'Petal, the other way',
      'עלה כותרת הפוך',
      roundRect(0, 0, SIDE, SIDE, [0, 240, 0, 240]),
    ),
    cut('drop', 'Drop', 'טיפה', drop(), 540),
    cut('egg', 'Egg', 'ביצה', smooth(egg), 540),
    cut('ring', 'Ring', 'טבעת', cutOut(circle(1, 1, 1), circle(1, 1, 0.56)), SIDE, {
      en: 'donut',
      he: 'דונאט',
    }),
    cut('shield', 'Shield', 'מגן', shield, 520),
  ];
}

function arches() {
  const gothic = (w, h) => {
    const rise = w * Math.sin(rad(60));
    return pen(0, h).arc(w, rise, w, w, 180, 240).arc(0, rise, w, w, 300, 360).line(w, h).done();
  };
  /** A round shape of radius `r` as panes around a cross of bars `gap` wide. */
  const panes = (r, gap, turns) => {
    const half = gap / 2;
    const lean = deg(Math.asin(half / r));
    const corner = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    return turns.flatMap((quarter) => {
      const [sx, sy] = corner[quarter];
      return pen(r + sx * half, r + sy * half)
        .arc(r, r, r, r, 180 + quarter * 90 + lean, 270 + quarter * 90 - lean)
        .done();
    });
  };
  const window = (w, h, gap) => [
    ...panes(w / 2, gap, [0, 1]),
    ...rect(0, w / 2 + gap / 2, w / 2 - gap / 2, h - w / 2 - gap / 2),
    ...rect(w / 2 + gap / 2, w / 2 + gap / 2, w / 2 - gap / 2, h - w / 2 - gap / 2),
  ];
  const rainbow = pen(0, 280)
    .arc(280, 280, 280, 280, 180, 360)
    .arc(280, 280, 150, 150, 360, 180)
    .done();
  return [
    cut('arch', 'Arch', 'קשת', arch(400, 540), 540, { en: 'window door', he: 'חלון דלת' }),
    cut('arch-tall', 'Tall arch', 'קשת גבוהה', arch(280, 600), 600),
    cut('arch-wide', 'Wide arch', 'קשת רחבה', arch(560, 420), 560),
    cut('arch-down', 'Inverted arch', 'קשת הפוכה', scaled(arch(400, 540), 1, -1), 540),
    cut('arch-pointed', 'Pointed arch', 'קשת מחודדת', gothic(400, 580), 580),
    cut('arch-double', 'Two arches', 'שתי קשתות', [...arch(230, 540), ...arch(230, 540, 260)], 540),
    cut(
      'arch-triple',
      'Three arches',
      'שלוש קשתות',
      [...arch(170, 440, 0, 120), ...arch(200, 560, 190), ...arch(170, 440, 410, 120)],
      580,
    ),
    cut('arch-window', 'Arched window', 'חלון מקושת', window(400, 560, 18), 560),
    cut('round-window', 'Round window', 'חלון עגול', panes(240, 18, [0, 1, 2, 3])),
    cut('rainbow', 'Rainbow', 'קשת בענן', rainbow, 560),
  ];
}

function organic() {
  const blob = (seed, points, wobble, stretch = 1) => {
    const next = random(seed);
    const turn = next() * 360;
    return scaled(smooth(around(points, turn, () => 1 + (next() - 0.5) * 2 * wobble)), stretch, 1);
  };
  const wavy = (waves, depth) =>
    smooth(around(waves * 8, 0, (i) => 1 + depth * Math.sin((i / 8) * 2 * Math.PI)));
  const blobs = [
    [11, 6, 0.2],
    [23, 7, 0.26],
    [37, 5, 0.22],
    [41, 8, 0.24],
    [58, 6, 0.3],
    [64, 9, 0.2],
    [79, 7, 0.32],
    [83, 5, 0.28],
    [97, 8, 0.3],
    [105, 6, 0.24, 1.35],
    [118, 7, 0.22, 1.4],
    [126, 8, 0.26, 1.3],
    [131, 6, 0.26, 0.72],
    [149, 7, 0.24, 0.75],
    [152, 9, 0.28],
    [167, 10, 0.22],
  ];
  return [
    ...blobs.map(([seed, points, wobble, stretch], i) =>
      cut(
        `blob-${i + 1}`,
        `Blob ${i + 1}`,
        `כתם ${i + 1}`,
        blob(seed, points, wobble, stretch),
        SIDE,
        {
          en: 'organic',
          he: 'אורגני',
        },
      ),
    ),
    cut('wavy-8', 'Wavy circle', 'עיגול גלי', wavy(8, 0.07)),
    cut('wavy-12', 'Finely wavy circle', 'עיגול גלי עדין', wavy(12, 0.045)),
  ];
}

function brush() {
  /**
   * A stroke of a dry brush: a band whose edges waver, whose ends break into bristles, and
   * which runs dry in streaks. `taper` thins it towards its ends.
   */
  const stroke = (seed, length, height, { taper = 0, streaks = 3 } = {}) => {
    const next = random(seed);
    const waver = (amount) => (next() - 0.5) * 2 * amount;
    const columns = Math.round(length / 20);
    const bristles = Math.max(3, Math.round(height / 24));
    const [phaseA, phaseB] = [next() * 6, next() * 6];
    const half = (u) => (height / 2) * (1 - taper * (1 - Math.sin(Math.PI * (0.12 + 0.76 * u))));
    const edge = (side, phase) =>
      Array.from({ length: columns - 1 }, (_, i) => {
        const u = (i + 1) / columns;
        const wave = Math.sin(u * 5 + phase) * height * 0.035;
        return [u * length, height / 2 + side * half(u) + wave + waver(height * 0.022)];
      });
    const end = (x, out, u) =>
      Array.from({ length: bristles + 1 }, (_, j) => {
        const reach = j % 2 ? -(8 + next() * 46) : 6 + next() * 40;
        return [x + out * reach, height / 2 + (-1 + (2 * j) / bristles) * half(u)];
      });
    const outline = [
      ...edge(-1, phaseA),
      ...end(length, 1, 1),
      ...edge(1, phaseB).reverse(),
      ...end(0, -1, 0).reverse(),
    ];
    const dry = Array.from({ length: streaks }, () => {
      const run = 50 + next() * 110;
      const x = next() < 0.5 ? 30 + next() * 60 : length - run - 30 - next() * 60;
      const y = height * (0.22 + next() * 0.56);
      const t = 2 + next() * 3;
      return polygon([
        [x, y],
        [x + run / 2, y - t],
        [x + run, y],
        [x + run / 2, y + t],
      ]);
    });
    return cutOut(rounded(outline, 5), ...dry);
  };
  /** Strokes laid one under the other, each over the edge of the one before. */
  const block = (seed, length, height, rows) => {
    const next = random(seed);
    return Array.from({ length: rows }, (_, i) =>
      moved(
        stroke(seed + i * 7, length, height, { streaks: 2 }),
        (next() - 0.5) * 50,
        i * height * 0.78,
      ),
    ).flat();
  };
  const dab = (seed) => {
    const next = random(seed);
    const [a, b] = [next() * 6, next() * 6];
    return rounded(
      around(84, 0, (i) => {
        const t = (i / 84) * 2 * Math.PI;
        return 1 + 0.05 * Math.sin(t * 3 + a) + 0.03 * Math.sin(t * 7 + b) + (next() - 0.5) * 0.07;
      }),
      0.02,
    );
  };
  /** Paper torn along the sides named: `t`, `r`, `b`, `l`. */
  const torn = (seed, w, h, sides) => {
    const next = random(seed);
    const corners = cornersOf(box(0, 0, w, h));
    return polygon(
      ['t', 'r', 'b', 'l'].flatMap((side, i) => {
        const [from, to] = [corners[i], corners[(i + 1) % 4]];
        if (!sides.includes(side)) return [from];
        const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
        const count = Math.round(length / 10);
        const [nx, ny] = [(to[1] - from[1]) / length, -(to[0] - from[0]) / length];
        let drift = 0;
        return Array.from({ length: count }, (_, k) => {
          drift = drift * 0.72 + (next() - 0.5) * 10;
          // The corners stay where they are; the tear is between them.
          const off = k === 0 ? 0 : drift + (next() - 0.5) * 5;
          const t = k / count;
          return [
            from[0] + (to[0] - from[0]) * t + nx * off,
            from[1] + (to[1] - from[1]) * t + ny * off,
          ];
        });
      }),
    );
  };
  const splat = (seed) => {
    const next = random(seed);
    const arms = Array.from({ length: 9 + Math.floor(next() * 4) }, () => ({
      at: next() * 360,
      reach: 0.2 + next() * 0.7,
      width: 6 + next() * 7,
    }));
    const body = around(120, 0, (i) => {
      const angle = -90 + i * 3;
      let r = 1 + 0.05 * Math.sin(rad(angle * 3 + 40));
      for (const arm of arms) {
        const off = Math.abs(((angle - arm.at + 540) % 360) - 180);
        r += arm.reach * Math.exp(-((off / arm.width) ** 2));
      }
      return r;
    });
    const drops = arms
      .filter((arm) => arm.reach > 0.5)
      .map((arm) => {
        const far = 1 + arm.reach + 0.24;
        return circle(
          far * Math.cos(rad(arm.at)),
          far * Math.sin(rad(arm.at)),
          0.07 + next() * 0.06,
        );
      });
    return [...smooth(body), ...drops.flat()];
  };
  /** A marker going back and forth: every pass a thick line with round ends. */
  const scribble = (w, h, passes, thick) => {
    const points = Array.from({ length: passes + 1 }, (_, i) => [
      i % 2 ? w - thick / 2 : thick / 2,
      thick / 2 + (i * (h - thick)) / passes,
    ]);
    return points.slice(1).flatMap(([x, y], i) => {
      const [px, py] = points[i];
      const length = Math.hypot(x - px, y - py);
      return turned(
        roundRect(px - thick / 2, py - thick / 2, length + thick, thick, thick / 2),
        deg(Math.atan2(y - py, x - px)),
        px,
        py,
      );
    });
  };
  return [
    cut('stroke-1', 'Brush stroke 1', 'משיכת מכחול 1', stroke(7, 620, 210), 620),
    cut('stroke-2', 'Brush stroke 2', 'משיכת מכחול 2', stroke(19, 640, 150, { taper: 0.5 }), 640),
    cut(
      'stroke-3',
      'Brush stroke 3',
      'משיכת מכחול 3',
      turned(stroke(31, 600, 170, { taper: 0.3 }), -12),
      620,
    ),
    cut('stroke-4', 'Brush stroke 4', 'משיכת מכחול 4', stroke(43, 560, 300, { streaks: 5 }), 580),
    cut('strokes-3', 'Painted block', 'משטח צבוע', block(53, 560, 150, 3), 600),
    cut('strokes-5', 'Tall painted block', 'משטח צבוע גבוה', block(67, 460, 130, 5), 560),
    cut(
      'strokes-slant',
      'Slanted painted block',
      'משטח צבוע נטוי',
      turned(block(71, 520, 140, 3), -8),
      600,
    ),
    cut('dab-1', 'Paint dab', 'כתם צבע', dab(3)),
    cut('dab-2', 'Wide paint dab', 'כתם צבע רחב', scaled(dab(9), 1.4, 1), 580),
    cut('splat-1', 'Ink splat 1', 'כתם דיו 1', splat(5)),
    cut('splat-2', 'Ink splat 2', 'כתם דיו 2', splat(27)),
    cut('scribble', 'Marker scribble', 'שרבוט טוש', scribble(580, 420, 6, 62), 580),
    cut('torn', 'Torn paper', 'נייר קרוע', torn(13, 580, 420, 'trbl'), 580),
    cut(
      'torn-ends',
      'Paper torn above and below',
      'נייר קרוע למעלה ולמטה',
      torn(29, 580, 400, 'tb'),
      580,
    ),
    cut('torn-bottom', 'Paper torn below', 'נייר קרוע למטה', torn(47, 520, 460, 'b'), 520),
    cut('torn-side', 'Paper torn at the side', 'נייר קרוע בצד', torn(59, 460, 540, 'r'), 540),
  ];
}

function composed() {
  const S = SIDE;
  const columns = (count, gap, draw) => {
    const w = (S - gap * (count - 1)) / count;
    return Array.from({ length: count }, (_, i) => draw(i * (w + gap), w, i)).flat();
  };
  const grid = (cols, rows, w, h, gap, draw) => {
    const [cw, ch] = [(w - gap * (cols - 1)) / cols, (h - gap * (rows - 1)) / rows];
    return Array.from({ length: cols * rows }, (_, i) =>
      draw((i % cols) * (cw + gap), Math.floor(i / cols) * (ch + gap), cw, ch, i),
    ).flat();
  };
  const slanted = (count, lean, gap) => {
    const w = (S - lean - gap * (count - 1)) / count;
    return Array.from({ length: count }, (_, i) => {
      const x = i * (w + gap);
      return polygon([
        [x + lean, 0],
        [x + lean + w, 0],
        [x + w, S],
        [x, S],
      ]);
    }).flat();
  };
  const hexagons = () => {
    const r = 92;
    const step = Math.sqrt(3) * r + 14;
    const centres = [[0, 0], ...around(6, 30).map(([x, y]) => [x * step, y * step])];
    return centres.flatMap(([cx, cy]) =>
      polygon(around(6).map(([x, y]) => [cx + x * r, cy + y * r])),
    );
  };
  const triangles = (gap) => {
    const m = S / 2;
    return [
      [
        [gap, 0],
        [S - gap, 0],
        [m, m - gap],
      ],
      [
        [S, gap],
        [S, S - gap],
        [m + gap, m],
      ],
      [
        [S - gap, S],
        [gap, S],
        [m, m + gap],
      ],
      [
        [0, S - gap],
        [0, gap],
        [m - gap, m],
      ],
    ].flatMap(polygon);
  };
  const halves = (gap) => {
    const lean = deg(Math.asin(gap / 2 / 240));
    return [
      ...segment(240, 240, 240, 90 + lean, 270 - lean),
      ...segment(240, 240, 240, 270 + lean, 450 - lean),
    ];
  };
  /** A quarter circle in each cell, each turned a quarter on from the one before. */
  const pinwheel = (gap) => {
    const c = (S - gap) / 2;
    const quarter = (x, y, turn) =>
      moved(
        turned(pen(0, c).line(0, 0).arc(0, c, c, c, 270, 360).done(), turn, c / 2, c / 2),
        x,
        y,
      );
    return [
      ...quarter(0, 0, 0),
      ...quarter(c + gap, 0, 90),
      ...quarter(c + gap, c + gap, 180),
      ...quarter(0, c + gap, 270),
    ];
  };
  const leaves = (gap) => {
    const c = (S - gap) / 2;
    return [
      ...roundRect(0, 0, c, c, [0, c, 0, c]),
      ...roundRect(c + gap, 0, c, c, [c, 0, c, 0]),
      ...roundRect(c + gap, c + gap, c, c, [0, c, 0, c]),
      ...roundRect(0, c + gap, c, c, [c, 0, c, 0]),
    ];
  };
  const waves = (bands, w, h) => {
    const thick = (h / bands) * 0.72;
    const swell = (h / bands) * 0.2;
    const line = (y, back) => {
      const points = Array.from({ length: 31 }, (_, i) => [
        (i * w) / 30,
        y + swell * Math.sin((i / 30) * Math.PI * 4),
      ]);
      return back ? points.reverse() : points;
    };
    return Array.from({ length: bands }, (_, i) => {
      const y = swell + (i * (h - 2 * swell - thick)) / (bands - 1);
      return polygon([...line(y, false), ...line(y + thick, true)]);
    }).flat();
  };
  const mosaic = [
    rect(0, 0, 300, 300),
    rect(320, 0, 160, 140),
    rect(320, 160, 160, 140),
    rect(0, 320, 140, 160),
    rect(160, 320, 320, 160),
  ].flat();
  return [
    cut(
      'bars-3',
      'Three bars',
      'שלושה פסים',
      columns(3, 20, (x, w) => rect(x, 0, w, S)),
    ),
    cut(
      'bars-4',
      'Four bars',
      'ארבעה פסים',
      columns(4, 16, (x, w) => rect(x, 0, w, S)),
    ),
    cut(
      'bars-5',
      'Five bars',
      'חמישה פסים',
      columns(5, 14, (x, w) => rect(x, 0, w, S)),
    ),
    cut(
      'rows-3',
      'Three rows',
      'שלוש רצועות',
      columns(3, 20, (y, h) => rect(0, y, S, h)),
    ),
    cut(
      'rows-4',
      'Four rows',
      'ארבע רצועות',
      columns(4, 16, (y, h) => rect(0, y, S, h)),
    ),
    cut('slants-3', 'Three slanted bars', 'שלושה פסים נטויים', slanted(3, 90, 20)),
    cut('slants-4', 'Four slanted bars', 'ארבעה פסים נטויים', slanted(4, 80, 16)),
    cut(
      'pills-3',
      'Three pills',
      'שלוש גלולות',
      columns(3, 20, (x, w) => roundRect(x, 0, w, S, w / 2)),
    ),
    cut(
      'pills-stagger',
      'Staggered pills',
      'גלולות מדורגות',
      columns(3, 20, (x, w, i) => roundRect(x, [0, 110, 40][i], w, 410, w / 2)),
      520,
    ),
    cut(
      'steps',
      'Rising bars',
      'עמודות עולות',
      columns(4, 16, (x, w, i) => roundRect(x, S * (0.6 - i * 0.2), w, S * (0.4 + i * 0.2), 14)),
    ),
    cut(
      'grid-4',
      'Four squares',
      'ארבעה ריבועים',
      grid(2, 2, S, S, 20, (x, y, w, h) => roundRect(x, y, w, h, 26)),
    ),
    cut(
      'grid-9',
      'Nine squares',
      'תשעה ריבועים',
      grid(3, 3, S, S, 14, (x, y, w, h) => roundRect(x, y, w, h, 12)),
    ),
    cut(
      'windows-6',
      'Six windows',
      'שישה חלונות',
      grid(3, 2, 600, 400, 16, (x, y, w, h) => roundRect(x, y, w, h, 20)),
      600,
    ),
    cut(
      'dots-4',
      'Four circles',
      'ארבעה עיגולים',
      grid(2, 2, S, S, 16, (x, y, w, h) => ellipse(x + w / 2, y + h / 2, w / 2, h / 2)),
    ),
    cut(
      'dots-9',
      'Nine circles',
      'תשעה עיגולים',
      grid(3, 3, S, S, 12, (x, y, w, h) => ellipse(x + w / 2, y + h / 2, w / 2, h / 2)),
    ),
    cut(
      'dots-row',
      'Three circles in a row',
      'שלושה עיגולים בשורה',
      grid(3, 1, 720, 228, 18, (x, y, w, h) => ellipse(x + w / 2, y + h / 2, w / 2, h / 2)),
      720,
    ),
    cut(
      'checker',
      'Checkerboard',
      'לוח שחמט',
      grid(3, 3, S, S, 0, (x, y, w, h, i) => (i % 2 ? [] : rect(x, y, w, h))),
    ),
    cut('honeycomb', 'Honeycomb', 'חלת דבש', hexagons(), 520),
    cut('triangles-4', 'Four triangles', 'ארבעה משולשים', triangles(12)),
    cut('halves', 'Split circle', 'עיגול חצוי', halves(18)),
    cut(
      'diagonal',
      'Split square',
      'ריבוע חצוי באלכסון',
      [
        polygon([
          [0, 0],
          [S - 26, 0],
          [0, S - 26],
        ]),
        polygon([
          [S, 26],
          [S, S],
          [26, S],
        ]),
      ].flat(),
    ),
    cut('pinwheel', 'Pinwheel', 'שבשבת', pinwheel(16)),
    cut('leaves-4', 'Four leaves', 'ארבעה עלים', leaves(16), SIDE, {
      en: 'flower clover',
      he: 'פרח תלתן',
    }),
    cut('bullseye', 'Bullseye', 'מטרה', [
      ...cutOut(circle(240, 240, 240), circle(240, 240, 168)),
      ...circle(240, 240, 112),
    ]),
    cut(
      'circles-2',
      'Two circles',
      'שני עיגולים',
      [...circle(200, 200, 200), ...circle(480, 200, 200)],
      680,
    ),
    cut('waves', 'Waves', 'גלים', waves(3, 560, 420), 560),
    cut('mosaic', 'Mosaic', 'מוזאיקה', mosaic),
  ];
}

function nature() {
  const moon = crescent([0, 0, 1], [0.48, -0.12, 0.86]);
  const leaf = pen(0, 1).curve(0, 0.35, 0.35, 0, 1, 0).curve(1, 0.65, 0.65, 1, 0, 1).done();
  const bolt = [
    [0.62, 0],
    [0.1, 0.56],
    [0.42, 0.56],
    [0.28, 1],
    [0.9, 0.4],
    [0.56, 0.4],
    [0.8, 0],
  ].map(([x, y]) => [x * 380, y * 540]);
  const tree = [
    polygon([
      [0.5, 0],
      [0.82, 0.36],
      [0.18, 0.36],
    ]),
    polygon([
      [0.5, 0.18],
      [0.92, 0.64],
      [0.08, 0.64],
    ]),
    polygon([
      [0.5, 0.4],
      [1, 0.88],
      [0, 0.88],
    ]),
    rect(0.42, 0.88, 0.16, 0.12),
  ].flat();
  const mountains = [
    [0, 1],
    [0.3, 0.28],
    [0.46, 0.58],
    [0.68, 0],
    [1, 1],
  ].map(([x, y]) => [x * 620, y * 380]);
  const cloud = [
    roundRect(0, 150, 600, 170, 85),
    circle(190, 150, 110),
    circle(340, 120, 120),
    circle(450, 190, 90),
  ].flat();
  const paw = [
    ellipse(0, 0.36, 0.52, 0.42),
    circle(-0.64, -0.14, 0.2),
    circle(-0.25, -0.52, 0.22),
    circle(0.25, -0.52, 0.22),
    circle(0.64, -0.14, 0.2),
  ].flat();
  return [
    cut('flower-5', 'Flower', 'פרח', petals(5, 0.56, 0.44), SIDE, { en: 'blossom', he: 'פריחה' }),
    cut('flower-6', 'Six-petal flower', 'פרח שישה עלים', petals(6, 0.6, 0.4)),
    cut('flower-8', 'Eight-petal flower', 'פרח שמונה עלים', petals(8, 0.66, 0.34)),
    cut('clover', 'Clover', 'תלתן', petals(4, 0.5, 0.5, 45), SIDE, { en: 'luck', he: 'מזל' }),
    cut('trefoil', 'Trefoil', 'תלתן שלושה עלים', petals(3, 0.48, 0.52)),
    cut('cloud', 'Cloud', 'ענן', cloud, 600, { en: 'sky weather', he: 'שמיים מזג אוויר' }),
    cut('sun', 'Sun', 'שמש', polygon(starPoints(12, 0.64))),
    cut('moon', 'Crescent moon', 'סהר', moon, SIDE, { en: 'night', he: 'ירח לילה' }),
    cut('leaf', 'Leaf', 'עלה', leaf),
    cut('bolt', 'Lightning bolt', 'ברק', rounded(bolt, 12), 540, {
      en: 'flash energy',
      he: 'אנרגיה',
    }),
    cut('tree', 'Pine tree', 'עץ אורן', tree, 540, { en: 'fir forest', he: 'אשוח יער' }),
    cut('mountains', 'Mountains', 'הרים', rounded(mountains, 18), 620),
    cut('paw', 'Paw print', 'כף רגל', paw, SIDE, { en: 'pet dog cat', he: 'חיה כלב חתול' }),
  ];
}

function bubbles() {
  const mirror = (path) => scaled(path, -1, 1);
  const oval = [
    ellipse(290, 200, 290, 200),
    polygon([
      [120, 340],
      [260, 392],
      [70, 480],
    ]),
  ].flat();
  const boxed = [
    roundRect(0, 0, 580, 360, 52),
    polygon([
      [80, 350],
      [220, 350],
      [70, 470],
    ]),
  ].flat();
  const thought = [
    ellipse(310, 190, 215, 130),
    ...around(9).map(([x, y]) => circle(310 + x * 215, 190 + y * 125, 78)),
    circle(96, 392, 36),
    circle(40, 452, 22),
  ].flat();
  const next = random(17);
  const shout = polygon(
    around(28, 0, (i) => (i % 2 ? 0.62 + next() * 0.1 : 0.86 + next() * 0.14)).map(([x, y]) => [
      x * 320,
      y * 230,
    ]),
  );
  return [
    cut('speech', 'Speech bubble', 'בועת דיבור', oval, 580, { en: 'talk chat', he: 'שיחה דיבור' }),
    cut(
      'speech-back',
      'Speech bubble, tail on the other side',
      'בועת דיבור הפוכה',
      mirror(oval),
      580,
    ),
    cut('speech-box', 'Square speech bubble', 'בועת דיבור מרובעת', boxed, 580),
    cut(
      'speech-box-back',
      'Square speech bubble, tail on the other side',
      'בועת דיבור מרובעת הפוכה',
      mirror(boxed),
      580,
    ),
    cut('thought', 'Thought bubble', 'בועת מחשבה', thought, 600, {
      en: 'think dream',
      he: 'חלום רעיון',
    }),
    cut('shout', 'Shout bubble', 'בועת צעקה', shout, 620, { en: 'comic bang', he: 'קומיקס' }),
    cut(
      'message',
      'Message bubble',
      'בועת הודעה',
      roundRect(0, 0, 580, 380, [56, 56, 56, 8]),
      580,
      { en: 'chat', he: "צ'אט" },
    ),
    cut(
      'message-back',
      'Message bubble, the other side',
      'בועת הודעה הפוכה',
      roundRect(0, 0, 580, 380, [56, 56, 8, 56]),
      580,
    ),
  ];
}

/** A rectangle with half circles bitten out of every side, as a postage stamp has. */
function perforated(w, h, bite, pitch) {
  const centres = (length) => {
    const count = Math.floor(length / pitch);
    return Array.from({ length: count }, (_, k) => ((k + 0.5) * length) / count);
  };
  const [across, down] = [centres(w), centres(h)];
  const shape = pen(0, 0);
  for (const x of across) shape.arc(x, 0, bite, bite, 180, 0);
  shape.line(w, 0);
  for (const y of down) shape.arc(w, y, bite, bite, 270, 90);
  shape.line(w, h);
  for (const x of [...across].reverse()) shape.arc(x, h, bite, bite, 360, 180);
  shape.line(0, h);
  for (const y of [...down].reverse()) shape.arc(0, y, bite, bite, 90, -90);
  return shape.done();
}

function labels() {
  const ticket = pen(0, 0)
    .line(600, 0)
    .arc(600, 160, 38, 38, 270, 90)
    .line(600, 320)
    .line(0, 320)
    .arc(0, 160, 38, 38, 90, -90)
    .done();
  const stub = pen(24, 0)
    .arc(430, 0, 26, 26, 180, 0)
    .arc(576, 24, 24, 24, -90, 0)
    .arc(576, 276, 24, 24, 0, 90)
    .arc(430, 300, 26, 26, 360, 180)
    .arc(24, 276, 24, 24, 90, 180)
    .arc(24, 24, 24, 24, 180, 270)
    .done();
  const tag = cutOut(
    rounded(
      [
        [0, 160],
        [130, 0],
        [600, 0],
        [600, 320],
        [130, 320],
      ],
      28,
    ),
    circle(120, 160, 26),
  );
  /** A box with an edge of half circles, `columns` across and `rows` down. */
  const scalloped = (columns, rows) => {
    const [w, h] = [columns * 2, rows * 2];
    const shape = pen(1, 2);
    for (let k = 0; k < columns; k++)
      shape.arc(1 + 2 * k, 1, 1, 1, k ? 180 : 90, k === columns - 1 ? 450 : 360);
    for (let k = 1; k < rows; k++)
      shape.arc(w - 1, 1 + 2 * k, 1, 1, 270, k === rows - 1 ? 540 : 450);
    for (let k = 1; k < columns; k++)
      shape.arc(w - 1 - 2 * k, h - 1, 1, 1, 0, k === columns - 1 ? 270 : 180);
    for (let k = 1; k < rows - 1; k++) shape.arc(1, h - 1 - 2 * k, 1, 1, 90, 270);
    return shape.done();
  };
  const plaque = pen(48, 0)
    .arc(600, 0, 48, 48, 180, 90)
    .arc(600, 400, 48, 48, 270, 180)
    .arc(0, 400, 48, 48, 360, 270)
    .arc(0, 0, 48, 48, 90, 0)
    .done();
  const receipt = [
    [0, 0],
    [420, 0],
    ...Array.from({ length: 15 }, (_, k) => [420 - k * 30, k % 2 ? 560 : 536]),
  ];
  const waveEdge = [
    [0, 0],
    [580, 0],
    ...Array.from({ length: 59 }, (_, k) => [
      580 - k * 10,
      400 + 22 * Math.sin((k / 58) * Math.PI * 6),
    ]),
  ];
  const tail = [
    [70, 330],
    [210, 392],
    [140, 590],
    [112, 498],
    [18, 528],
  ];
  const award = [
    circle(200, 200, 200),
    polygon(tail),
    polygon(tail.map(([x, y]) => [400 - x, y])),
  ].flat();
  return [
    cut('ticket', 'Ticket', 'כרטיס', ticket, 600, { en: 'coupon', he: 'קופון שובר' }),
    cut('ticket-stub', 'Ticket with a stub', 'כרטיס עם ספח', stub, 600),
    cut('tag', 'Tag', 'תווית', tag, 600, { en: 'label price', he: 'תג מחיר' }),
    cut(
      'bookmark',
      'Bookmark',
      'סימנייה',
      polygon([
        [0, 0],
        [360, 0],
        [360, 560],
        [180, 462],
        [0, 560],
      ]),
      560,
    ),
    cut(
      'banner',
      'Ribbon banner',
      'סרט',
      polygon([
        [0, 0],
        [640, 0],
        [562, 130],
        [640, 260],
        [0, 260],
        [78, 130],
      ]),
      640,
    ),
    cut(
      'pennant',
      'Pennant',
      'דגלון',
      polygon([
        [0, 0],
        [600, 170],
        [0, 340],
      ]),
      600,
      { en: 'flag', he: 'דגל' },
    ),
    cut('award', 'Award ribbon', 'עיטור', award, 580, { en: 'medal prize', he: 'מדליה פרס' }),
    cut('stamp-edge', 'Stamp edge', 'שולי בול', perforated(440, 560, 11, 36), 560, {
      en: 'postage',
      he: 'דואר',
    }),
    cut('scalloped', 'Scalloped rectangle', 'מלבן מסולסל', scalloped(9, 7), 580),
    cut('plaque', 'Plaque', 'שלט', plaque, 600),
    cut(
      'bevelled',
      'Bevelled rectangle',
      'מלבן קטום',
      polygon([
        [60, 0],
        [540, 0],
        [600, 60],
        [600, 380],
        [540, 440],
        [60, 440],
        [0, 380],
        [0, 60],
      ]),
      600,
    ),
    cut('receipt', 'Receipt', 'קבלה', polygon(receipt), 560),
    cut('wave-edge', 'Rectangle with a wavy edge', 'מלבן עם שוליים גליים', polygon(waveEdge), 580),
    cut(
      'house',
      'House',
      'בית',
      polygon([
        [300, 0],
        [600, 230],
        [600, 540],
        [0, 540],
        [0, 230],
      ]),
      600,
      { en: 'home', he: 'דירה' },
    ),
    preset('arrow-right', 'Right arrow', 'חץ ימינה', 'arrowRight', 520, 260),
    preset('arrow-left', 'Left arrow', 'חץ שמאלה', 'arrowLeft', 520, 260),
    preset('arrow-up', 'Up arrow', 'חץ למעלה', 'arrowUp', 260, 520),
    preset('arrow-down', 'Down arrow', 'חץ למטה', 'arrowDown', 260, 520),
    preset('arrow-both', 'Two-way arrow', 'חץ דו-כיווני', 'arrowLeftRight', 600, 260),
    preset('chevron', 'Chevron', 'שברון', 'chevron', 440, 300),
    preset('arrow-box', 'Arrow box', 'מלבן חץ', 'homePlate', 520, 260),
  ];
}

/* ---------------------------------------------------------------- letters */

const tools = new URL('../../../packages/html-export/node_modules/', import.meta.url);
const hb = await import(new URL('harfbuzzjs/dist/index.mjs', tools).href);
const woff2 = await import(new URL('woff2-encoder/dist/index.js', tools).href);

/** A face of Rubik at its heaviest: letters wide enough for a photograph to show through. */
async function rubik(file) {
  const bytes = readFileSync(
    new URL(`../node_modules/@fontsource-variable/rubik/files/${file}`, import.meta.url),
  );
  const font = new hb.Font(new hb.Face(new hb.Blob(await woff2.decompress(bytes))));
  font.setVariations([new hb.Variation('wght', 900)]);
  return font;
}

/** The outline of a character, the right way up, in the units of its font. */
function glyph(font, char) {
  const id = font.nominalGlyph(char.codePointAt(0));
  if (!id) throw new Error(`Rubik has no glyph for U+${char.codePointAt(0).toString(16)}`);
  const path = [];
  let at = [0, 0];
  for (const { type, values: v } of font.glyphToJson(id)) {
    const outline = path[path.length - 1];
    if (type === 'M') path.push({ start: [v[0], -v[1]], segs: [] });
    else if (type === 'L') outline.segs.push(['L', v[0], -v[1]]);
    else if (type === 'C') outline.segs.push(['C', v[0], -v[1], v[2], -v[3], v[4], -v[5]]);
    else if (type === 'Q') {
      outline.segs.push([
        'C',
        at[0] + ((v[0] - at[0]) * 2) / 3,
        at[1] + ((-v[1] - at[1]) * 2) / 3,
        v[2] + ((v[0] - v[2]) * 2) / 3,
        -v[3] + ((-v[1] + v[3]) * 2) / 3,
        v[2],
        -v[3],
      ]);
    }
    if (type !== 'Z') at = [v[v.length - 2], -v[v.length - 1]];
  }
  return path;
}

/** A character as a frame. Those of one face share a scale, so they stand together as they are set. */
function character(font, id, en, he, char, scale, tags) {
  const path = glyph(font, char);
  const b = bounds(path);
  return cut(id, en, he, path, { w: Math.round(b.w * scale), h: Math.round(b.h * scale) }, tags);
}

const HEBREW = [
  ['alef', 'א'],
  ['bet', 'ב'],
  ['gimel', 'ג'],
  ['dalet', 'ד'],
  ['he', 'ה'],
  ['vav', 'ו'],
  ['zayin', 'ז'],
  ['het', 'ח'],
  ['tet', 'ט'],
  ['yod', 'י'],
  ['kaf', 'כ'],
  ['final-kaf', 'ך'],
  ['lamed', 'ל'],
  ['mem', 'מ'],
  ['final-mem', 'ם'],
  ['nun', 'נ'],
  ['final-nun', 'ן'],
  ['samekh', 'ס'],
  ['ayin', 'ע'],
  ['pe', 'פ'],
  ['final-pe', 'ף'],
  ['tsadi', 'צ'],
  ['final-tsadi', 'ץ'],
  ['qof', 'ק'],
  ['resh', 'ר'],
  ['shin', 'ש'],
  ['tav', 'ת'],
];

const SYMBOLS = [
  ['ampersand', 'Ampersand', 'אמפרסנד', '&'],
  ['question', 'Question mark', 'סימן שאלה', '?'],
  ['exclamation', 'Exclamation mark', 'סימן קריאה', '!'],
  ['hash', 'Hash', 'סולמית', '#'],
  ['at', 'At sign', 'שטרודל', '@'],
  ['percent', 'Percent', 'אחוז', '%'],
  ['dollar', 'Dollar', 'דולר', '$'],
];

async function letters() {
  const latin = await rubik('rubik-latin-wght-normal.woff2');
  const hebrew = await rubik('rubik-hebrew-wght-normal.woff2');
  const heightOf = (font, char) => bounds(glyph(font, char)).h;
  const latinScale = SIDE / heightOf(latin, 'H');
  // Hebrew letters are as tall as Latin small letters; drawn to the height of the capitals.
  const hebrewScale = SIDE / heightOf(hebrew, 'ה');
  const name = (id) => id.replace('final-', 'final ').replace(/^./, (c) => c.toUpperCase());
  return {
    hebrew: HEBREW.map(([id, char]) =>
      character(
        hebrew,
        `he-${id}`,
        `Hebrew letter ${name(id)}`,
        id.startsWith('final-') ? `האות ${char} סופית` : `האות ${char}`,
        char,
        hebrewScale,
        { en: 'hebrew letter', he: `${char} אות` },
      ),
    ),
    latin: Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).map((char) =>
      character(
        latin,
        `letter-${char.toLowerCase()}`,
        `Letter ${char}`,
        `האות ${char}`,
        char,
        latinScale,
        {
          en: 'letter',
          he: 'אות אנגלית',
        },
      ),
    ),
    digits: [
      ...Array.from({ length: 10 }, (_, i) => String(i)).map((char) =>
        character(latin, `digit-${char}`, `Number ${char}`, `הספרה ${char}`, char, latinScale, {
          en: 'digit number',
          he: 'ספרה מספר',
        }),
      ),
      ...SYMBOLS.map(([id, en, he, char]) =>
        character(latin, `sign-${id}`, en, he, char, latinScale, {
          en: `sign ${char}`,
          he: 'סימן',
        }),
      ),
      character(hebrew, 'sign-shekel', 'Shekel', 'שקל', '₪', latinScale, {
        en: 'sign money',
        he: 'סימן כסף ₪',
      }),
    ],
  };
}

/* ---------------------------------------------------------------- decorated frames */

const WHITE = '#ffffff';

function photo() {
  /** A card with the photograph in a window of it. */
  const card = (outline, opening, colour = WHITE) =>
    layer(cutOut(outline, windowOf(opening)), ink(colour), SHADOW);
  const tape = (cx, cy, turn, length = 132) =>
    layer(turned(rect(cx - length / 2, cy - 19, length, 38), turn, cx, cy), ink('#f3d27a', 0.82));
  const instant = box(26, 26, 348, 348);
  const wideInstant = box(26, 26, 468, 320);
  const print = inset(box(0, 0, 540, 400), 22);
  const tallPrint = inset(box(0, 0, 400, 540), 22);
  const taped = box(26, 48, 348, 348);
  const corners = box(10, 16, 540, 392);
  const stack = box(40, 44, 480, 372);
  const under = (turn, colour) =>
    layer(showing(cornersOf(stack).map(spin(turn, 280, 230)), stack), ink(colour));
  const strip = box(34, 64, 572, 292);
  const holes = [20, 374].flatMap((y) =>
    Array.from({ length: 11 }, (_, i) => roundRect(22 + i * 56, y, 36, 26, 5)),
  );
  const mount = box(72, 120, 336, 240);
  const stamp = box(40, 40, 360, 480);
  return [
    art(
      'instant',
      'Instant photo',
      'תצלום מיידי',
      400,
      480,
      {
        opening: instant,
        layers: [card(roundRect(0, 0, 400, 480, 6), instant)],
      },
      { en: 'polaroid', he: 'פולרואיד' },
    ),
    art(
      'instant-wide',
      'Wide instant photo',
      'תצלום מיידי רחב',
      520,
      440,
      {
        opening: wideInstant,
        layers: [card(roundRect(0, 0, 520, 440, 6), wideInstant)],
      },
      { en: 'polaroid', he: 'פולרואיד' },
    ),
    art(
      'instant-taped',
      'Taped instant photo',
      'תצלום מיידי עם נייר דבק',
      400,
      502,
      {
        opening: taped,
        layers: [card(roundRect(0, 22, 400, 480, 6), taped), tape(200, 22, -4)],
      },
      { en: 'polaroid tape', he: 'פולרואיד סלוטייפ' },
    ),
    art(
      'print',
      'Photo print',
      'תצלום מודפס',
      540,
      400,
      {
        opening: print,
        layers: [card(rect(0, 0, 540, 400), print)],
      },
      { en: 'border', he: 'שוליים לבנים' },
    ),
    art('print-tall', 'Tall photo print', 'תצלום מודפס לגובה', 400, 540, {
      opening: tallPrint,
      layers: [card(rect(0, 0, 400, 540), tallPrint)],
    }),
    art(
      'print-taped',
      'Taped photo print',
      'תצלום מודבק',
      560,
      420,
      {
        opening: inset(corners, 20),
        layers: [
          card(boxPath(corners), inset(corners, 20)),
          tape(44, 44, -42, 124),
          tape(516, 44, 42, 124),
        ],
      },
      { en: 'tape scrapbook', he: 'סלוטייפ אלבום' },
    ),
    art(
      'stack',
      'Stack of prints',
      'ערימת תצלומים',
      560,
      460,
      {
        opening: inset(stack, 20),
        layers: [under(7, '#e4e4e7'), under(-5, '#f1f1f3'), card(boxPath(stack), inset(stack, 20))],
      },
      { en: 'pile photos', he: 'אלבום' },
    ),
    art(
      'film',
      'Film frame',
      'פריים של סרט צילום',
      640,
      420,
      {
        opening: strip,
        layers: [layer(cutOut(rect(0, 0, 640, 420), windowOf(strip), ...holes), ink('#18181b'))],
      },
      { en: 'cinema movie negative', he: 'קולנוע נגטיב' },
    ),
    art(
      'slide-mount',
      'Slide mount',
      'שקופית צילום',
      480,
      480,
      {
        opening: mount,
        clip: roundRect(0, 0, mount.w, mount.h, 10),
        layers: [
          layer(
            cutOut(roundRect(0, 0, 480, 480, 30), boxPath(inset(mount, -8), 16)),
            ink('#f4f4f5'),
            SHADOW,
          ),
          layer(cutOut(boxPath(inset(mount, -8), 16), windowOf(mount, 10)), ink('#d4d4d8')),
        ],
      },
      { en: 'retro', he: 'רטרו' },
    ),
    art(
      'stamp',
      'Postage stamp',
      'בול',
      440,
      560,
      {
        opening: stamp,
        layers: [card(perforated(440, 560, 11, 36), stamp)],
      },
      { en: 'post mail', he: 'דואר' },
    ),
  ];
}

function devices() {
  const BODY = '#1c1c1e';
  const phone = box(14, 14, 272, 582);
  const tablet = box(24, 24, 592, 422);
  const laptop = box(96, 16, 568, 360);
  const monitor = box(16, 16, 648, 372);
  const browser = box(2, 54, 676, 424);
  const watch = box(48, 128, 224, 264);
  const tv = box(10, 10, 700, 394);
  const leg = [
    [140, 420],
    [176, 420],
    [152, 468],
    [126, 468],
  ];
  return [
    art(
      'phone',
      'Phone',
      'טלפון',
      300,
      610,
      {
        opening: phone,
        clip: roundRect(0, 0, phone.w, phone.h, 36),
        layers: [
          layer(cutOut(roundRect(0, 0, 300, 610, 48), windowOf(phone, 36)), ink(BODY), SHADOW),
          layer(roundRect(105, 28, 90, 26, 13), ink(BODY)),
        ],
      },
      { en: 'mobile smartphone screen', he: 'נייד סמארטפון מסך' },
    ),
    art(
      'tablet',
      'Tablet',
      'טאבלט',
      640,
      470,
      {
        opening: tablet,
        clip: roundRect(0, 0, tablet.w, tablet.h, 10),
        layers: [
          layer(cutOut(roundRect(0, 0, 640, 470, 30), windowOf(tablet, 10)), ink(BODY), SHADOW),
          layer(circle(320, 12, 4), ink('#3f3f46')),
        ],
      },
      { en: 'screen', he: 'מסך' },
    ),
    art(
      'laptop',
      'Laptop',
      'מחשב נייד',
      760,
      440,
      {
        opening: laptop,
        clip: roundRect(0, 0, laptop.w, laptop.h, 6),
        layers: [
          layer(cutOut(roundRect(80, 0, 600, 404, [20, 20, 0, 0]), windowOf(laptop, 6)), ink(BODY)),
          layer(roundRect(0, 404, 760, 28, [4, 4, 16, 16]), ink('#d4d4d8'), SHADOW),
          layer(roundRect(320, 404, 120, 10, [0, 0, 8, 8]), ink('#a1a1aa')),
        ],
      },
      { en: 'computer screen', he: 'לפטופ מסך' },
    ),
    art(
      'monitor',
      'Desktop screen',
      'מסך מחשב',
      680,
      544,
      {
        opening: monitor,
        clip: roundRect(0, 0, monitor.w, monitor.h, 6),
        layers: [
          layer(
            polygon([
              [292, 416],
              [388, 416],
              [408, 522],
              [272, 522],
            ]),
            ink('#a1a1aa'),
          ),
          layer(roundRect(206, 518, 268, 26, 13), ink('#d4d4d8'), SHADOW),
          layer(cutOut(roundRect(0, 0, 680, 420, 18), windowOf(monitor, 6)), ink(BODY)),
        ],
      },
      { en: 'computer display', he: 'מחשב שולחני צג' },
    ),
    art(
      'browser',
      'Browser window',
      'חלון דפדפן',
      680,
      480,
      {
        opening: browser,
        clip: roundRect(0, 0, browser.w, browser.h, [0, 0, 12, 12]),
        layers: [
          layer(
            cutOut(roundRect(0, 0, 680, 480, 14), windowOf(browser, [0, 0, 12, 12])),
            ink('#e4e4e7'),
            SHADOW,
          ),
          layer(circle(28, 27, 7), ink('#f87171')),
          layer(circle(52, 27, 7), ink('#fbbf24')),
          layer(circle(76, 27, 7), ink('#34d399')),
          layer(roundRect(112, 13, 456, 28, 14), ink(WHITE)),
        ],
      },
      { en: 'website web', he: 'אתר אינטרנט' },
    ),
    art(
      'watch',
      'Smart watch',
      'שעון חכם',
      320,
      520,
      {
        opening: watch,
        clip: roundRect(0, 0, watch.w, watch.h, 48),
        layers: [
          layer(roundRect(72, 0, 176, 120, [28, 28, 0, 0]), ink('#3f3f46')),
          layer(roundRect(72, 400, 176, 120, [0, 0, 28, 28]), ink('#3f3f46')),
          layer(roundRect(288, 220, 18, 60, 8), ink('#52525b')),
          layer(cutOut(roundRect(30, 110, 260, 300, 66), windowOf(watch, 48)), ink(BODY), SHADOW),
        ],
      },
      { en: 'clock', he: 'שעון יד' },
    ),
    art(
      'tv',
      'Television',
      'טלוויזיה',
      720,
      470,
      {
        opening: tv,
        clip: roundRect(0, 0, tv.w, tv.h, 4),
        layers: [
          layer(polygon(leg), ink('#3f3f46')),
          layer(polygon(leg.map(([x, y]) => [720 - x, y])), ink('#3f3f46')),
          layer(cutOut(roundRect(0, 0, 720, 420, 10), windowOf(tv, 4)), ink('#18181b'), SHADOW),
        ],
      },
      { en: 'screen', he: 'מסך' },
    ),
  ];
}

function framed() {
  /** A band between two boxes: a border. */
  const band = (outer, inner, radius = 0, innerRadius = radius) =>
    cutOut(boxPath(outer, radius), boxPath(inner, innerRadius));
  const wide = box(0, 0, 560, 440);
  const tall = box(0, 0, 440, 560);
  /** A dark frame and a white mount around the photograph, as in a gallery. */
  const gallery = (outer) => {
    const opening = inset(outer, 72);
    return {
      opening,
      layers: [
        layer(band(inset(outer, 16), opening), ink(WHITE)),
        layer(band(inset(opening, -3), inset(opening, 1)), ink('#e7e5e4')),
        layer(band(outer, inset(outer, 16)), ink('#1c1917'), SHADOW),
      ],
    };
  };
  /** A moulded frame: its body, a line of light near the outside, a lip of shade inside. */
  const moulded = (body, light, shade) => ({
    opening: inset(wide, 34),
    layers: [
      layer(band(wide, inset(wide, 34)), ink(body), SHADOW),
      layer(band(inset(wide, 6), inset(wide, 11)), ink(light)),
      layer(band(inset(wide, 27), inset(wide, 35)), ink(shade)),
    ],
  });
  const line = box(0, 0, 520, 400);
  const corner = [
    [0, 0],
    [74, 0],
    [74, 9],
    [9, 9],
    [9, 74],
    [0, 74],
  ];
  const cornersAt = (w, h) =>
    [
      ([x, y]) => [x, y],
      ([x, y]) => [w - x, y],
      ([x, y]) => [w - x, h - y],
      ([x, y]) => [x, h - y],
    ].flatMap((to) => polygon(corner.map(to)));
  const shifted = box(0, 0, 500, 380);
  const round = box(36, 36, 408, 408);
  const disc = box(0, 0, 440, 440);
  const dotted = box(40, 20, 440, 440);
  const dots = Array.from({ length: 25 }, (_, i) => [
    12 + (i % 5) * 28,
    376 + Math.floor(i / 5) * 28,
  ])
    .filter(([x, y]) => Math.hypot(x - 260, y - 240) > 236)
    .flatMap(([x, y]) => circle(x, y, 7));
  const arched = box(21, 21, 398, 518);
  const soft = box(0, 0, 520, 400);
  const tilted = box(40, 40, 440, 340);
  return [
    art('gallery', 'Gallery frame', 'מסגרת גלריה', 560, 440, gallery(wide), {
      en: 'mount passe-partout',
      he: 'פספרטו',
    }),
    art('gallery-tall', 'Tall gallery frame', 'מסגרת גלריה לגובה', 440, 560, gallery(tall)),
    art('wood', 'Wooden frame', 'מסגרת עץ', 560, 440, moulded('#8b5a2b', '#b9834c', '#5c3a1a')),
    art('gold', 'Gold frame', 'מסגרת זהב', 560, 440, moulded('#d4a94a', '#f4dc94', '#a67c23'), {
      en: 'classic',
      he: 'קלאסי',
    }),
    art(
      'line',
      'Line frame',
      'מסגרת קו',
      520,
      400,
      {
        opening: inset(line, 22),
        layers: [layer(band(line, inset(line, 4)), theme('text'))],
      },
      { en: 'outline', he: 'קו מתאר' },
    ),
    art('line-double', 'Double line frame', 'מסגרת קו כפול', 520, 400, {
      opening: inset(line, 30),
      layers: [
        layer(band(line, inset(line, 5)), theme('primary')),
        layer(band(inset(line, 13), inset(line, 15)), theme('primary')),
      ],
    }),
    art(
      'corners',
      'Corner marks',
      'פינות',
      520,
      400,
      {
        opening: inset(line, 26),
        layers: [layer(cornersAt(520, 400), theme('primary'))],
      },
      { en: 'brackets', he: 'סוגריים' },
    ),
    art(
      'block-behind',
      'Block behind',
      'בלוק מאחור',
      540,
      420,
      {
        opening: shifted,
        layers: [
          layer(
            polygon([
              [500, 40],
              [540, 40],
              [540, 420],
              [40, 420],
              [40, 380],
              [500, 380],
            ]),
            theme('primary'),
          ),
        ],
      },
      { en: 'offset shadow', he: 'צל מוסט' },
    ),
    art(
      'outline-behind',
      'Outline behind',
      'קו מתאר מאחור',
      540,
      420,
      {
        opening: shifted,
        layers: [
          layer(
            [
              rect(534, 40, 6, 380),
              rect(40, 414, 500, 6),
              rect(500, 40, 40, 6),
              rect(40, 380, 6, 40),
            ].flat(),
            theme('primary'),
          ),
        ],
      },
      { en: 'offset', he: 'מוסט' },
    ),
    art('tilted-behind', 'Tilted block behind', 'בלוק מוטה מאחור', 520, 420, {
      opening: tilted,
      layers: [layer(showing(cornersOf(tilted).map(spin(7, 260, 210)), tilted), theme('accent'))],
    }),
    art('round-ring', 'Circle in a ring', 'עיגול בטבעת', 480, 480, {
      opening: round,
      clip: ellipse(round.w / 2, round.h / 2, round.w / 2, round.h / 2),
      layers: [layer(cutOut(circle(240, 240, 240), circle(240, 240, 228)), theme('primary'))],
    }),
    art('round-behind', 'Circle with a circle behind', 'עיגול עם עיגול מאחור', 500, 480, {
      opening: disc,
      clip: ellipse(disc.w / 2, disc.h / 2, disc.w / 2, disc.h / 2),
      layers: [layer(crescent([280, 260, 220], [220, 220, 220]), theme('accent'))],
    }),
    art('round-dots', 'Circle with dots', 'עיגול עם נקודות', 520, 500, {
      opening: dotted,
      clip: ellipse(dotted.w / 2, dotted.h / 2, dotted.w / 2, dotted.h / 2),
      layers: [
        layer(dots, theme('primary')),
        layer(cutOut(circle(476, 44, 36), circle(476, 44, 27)), theme('accent')),
      ],
    }),
    art('arch-line', 'Arch in an outline', 'קשת בקו מתאר', 440, 560, {
      opening: arched,
      clip: arch(arched.w, arched.h),
      layers: [layer(cutOut(arch(440, 560), arch(430, 550, 5, 5)), theme('primary'))],
    }),
    art('soft-line', 'Rounded outline', 'קו מתאר מעוגל', 520, 400, {
      opening: inset(soft, 20),
      clip: roundRect(0, 0, 480, 360, 24),
      layers: [layer(band(soft, inset(soft, 5), 42, 37), theme('primary'))],
    }),
  ];
}

/* ---------------------------------------------------------------- the catalogue */

const { hebrew, latin, digits } = await letters();

/** The frames shown first: twenty of the best, plain ones and special ones together. */
const featured = [
  'circle',
  'rounded-square',
  'arch',
  'pill',
  'hexagon',
  'heart',
  'star-5',
  'blob-2',
  'instant',
  'stack',
  'film',
  'stamp',
  'phone',
  'laptop',
  'browser',
  'gallery',
  'round-behind',
  'block-behind',
  'stroke-1',
  'torn',
];

const groups = [
  { id: 'basic', frames: basic() },
  { id: 'photo', frames: photo() },
  { id: 'framed', frames: framed() },
  { id: 'devices', frames: devices() },
  { id: 'arches', frames: arches() },
  { id: 'organic', frames: organic() },
  { id: 'brush', frames: brush() },
  { id: 'composed', frames: composed() },
  { id: 'hebrew', frames: hebrew },
  { id: 'latin', frames: latin },
  { id: 'digits', frames: digits },
  { id: 'nature', frames: nature() },
  { id: 'bubbles', frames: bubbles() },
  { id: 'labels', frames: labels() },
];

const ids = groups.flatMap(({ frames }) => frames.map(({ id }) => id));
const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
if (twice.length > 0) throw new Error(`Two frames are called ${twice.join(', ')}`);
const unknown = featured.filter((id) => !ids.includes(id));
if (unknown.length > 0) throw new Error(`No frame is called ${unknown.join(', ')}`);
const broken = groups
  .flatMap(({ frames }) => frames)
  .filter((frame) => /NaN|Infinity/.test(JSON.stringify(frame)) || !(frame.w > 0 && frame.h > 0));
if (broken.length > 0) throw new Error(`Not drawn: ${broken.map(({ id }) => id).join(', ')}`);

const json = `${JSON.stringify({ featured, groups }, null, 2)}\n`;
writeFileSync(new URL('../src/elements/frames-catalog.json', import.meta.url), json);
console.log(
  `${groups.map(({ id, frames }) => `${id}: ${frames.length}`).join(', ')}; ${ids.length} frames, ${Math.round(json.length / 1024)} kB`,
);
