/*
 * Outlines between SVG path data, which the model keeps, and DrawingML's custom geometry. Both
 * ways go through the same few absolute commands: move, line, quadratic and cubic Bézier, close.
 * An SVG arc becomes cubic Béziers; a DrawingML arc becomes an SVG arc.
 */

export type Pt = [number, number];

export type Segment =
  | { type: 'M' | 'L'; pts: [Pt] }
  | { type: 'Q'; pts: [Pt, Pt] }
  | { type: 'C'; pts: [Pt, Pt, Pt] }
  | { type: 'Z'; pts: [] };

const ARGS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };

function tokens(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /([a-zA-Z])|([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
  for (const m of d.matchAll(re)) out.push(m[1] ?? Number(m[2]));
  return out;
}

/** An arc of SVG as cubic Béziers (the method of the SVG implementation notes, F.6). */
function arcToCubics(
  from: Pt,
  rx0: number,
  ry0: number,
  rotation: number,
  large: boolean,
  sweep: boolean,
  to: Pt,
): Segment[] {
  const [x1, y1] = from;
  const [x2, y2] = to;
  if (x1 === x2 && y1 === y2) return [];
  let rx = Math.abs(rx0);
  let ry = Math.abs(ry0);
  if (rx === 0 || ry === 0) return [{ type: 'L', pts: [to] }];
  const phi = (rotation * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = large === sweep ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * (rx * y1p)) / ry;
  const cyp = (coef * -(ry * x1p)) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const angleOf = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const theta1 = angleOf(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angleOf((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;
  const parts = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / parts;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): Pt => {
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy];
  };
  const derivative = (t: number): Pt => {
    const ex = -rx * Math.sin(t);
    const ey = ry * Math.cos(t);
    return [cos * ex - sin * ey, sin * ex + cos * ey];
  };
  const out: Segment[] = [];
  let t = theta1;
  for (let i = 0; i < parts; i++) {
    const t2 = t + step;
    const p1 = point(t);
    const p2 = point(t2);
    const d1 = derivative(t);
    const d2 = derivative(t2);
    out.push({
      type: 'C',
      pts: [
        [p1[0] + k * d1[0], p1[1] + k * d1[1]],
        [p2[0] - k * d2[0], p2[1] - k * d2[1]],
        i === parts - 1 ? to : p2,
      ],
    });
    t = t2;
  }
  return out;
}

/** SVG path data as absolute moves, lines, Béziers and closes. */
export function parseSvgPath(d: string): Segment[] {
  const list = tokens(d);
  const out: Segment[] = [];
  let i = 0;
  let command = '';
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  let lastControl: Pt | undefined;
  let lastQuad: Pt | undefined;
  while (i < list.length) {
    const token = list[i];
    if (typeof token === 'string') {
      command = token;
      i++;
      if (command === 'z' || command === 'Z') {
        out.push({ type: 'Z', pts: [] });
        cur = start;
        lastControl = lastQuad = undefined;
        continue;
      }
    }
    const lower = command.toLowerCase();
    const count = ARGS[lower];
    if (!count) {
      i++;
      continue;
    }
    const args = list.slice(i, i + count);
    if (args.length < count || args.some((a) => typeof a !== 'number')) break;
    i += count;
    const n = args as number[];
    const rel = command === lower;
    const ox = rel ? cur[0] : 0;
    const oy = rel ? cur[1] : 0;
    switch (lower) {
      case 'm': {
        cur = [n[0]! + ox, n[1]! + oy];
        start = cur;
        out.push({ type: 'M', pts: [cur] });
        // Further pairs after a move are lines.
        command = rel ? 'l' : 'L';
        lastControl = lastQuad = undefined;
        break;
      }
      case 'l':
        cur = [n[0]! + ox, n[1]! + oy];
        out.push({ type: 'L', pts: [cur] });
        lastControl = lastQuad = undefined;
        break;
      case 'h':
        cur = [n[0]! + ox, cur[1]];
        out.push({ type: 'L', pts: [cur] });
        lastControl = lastQuad = undefined;
        break;
      case 'v':
        cur = [cur[0], n[0]! + oy];
        out.push({ type: 'L', pts: [cur] });
        lastControl = lastQuad = undefined;
        break;
      case 'c': {
        const c1: Pt = [n[0]! + ox, n[1]! + oy];
        const c2: Pt = [n[2]! + ox, n[3]! + oy];
        cur = [n[4]! + ox, n[5]! + oy];
        out.push({ type: 'C', pts: [c1, c2, cur] });
        lastControl = c2;
        lastQuad = undefined;
        break;
      }
      case 's': {
        const c1: Pt = lastControl
          ? [2 * cur[0] - lastControl[0], 2 * cur[1] - lastControl[1]]
          : cur;
        const c2: Pt = [n[0]! + ox, n[1]! + oy];
        cur = [n[2]! + ox, n[3]! + oy];
        out.push({ type: 'C', pts: [c1, c2, cur] });
        lastControl = c2;
        lastQuad = undefined;
        break;
      }
      case 'q': {
        const c: Pt = [n[0]! + ox, n[1]! + oy];
        cur = [n[2]! + ox, n[3]! + oy];
        out.push({ type: 'Q', pts: [c, cur] });
        lastQuad = c;
        lastControl = undefined;
        break;
      }
      case 't': {
        const c: Pt = lastQuad ? [2 * cur[0] - lastQuad[0], 2 * cur[1] - lastQuad[1]] : cur;
        cur = [n[0]! + ox, n[1]! + oy];
        out.push({ type: 'Q', pts: [c, cur] });
        lastQuad = c;
        lastControl = undefined;
        break;
      }
      case 'a': {
        const to: Pt = [n[5]! + ox, n[6]! + oy];
        out.push(...arcToCubics(cur, n[0]!, n[1]!, n[2]!, n[3] !== 0, n[4] !== 0, to));
        cur = to;
        lastControl = lastQuad = undefined;
        break;
      }
    }
  }
  return out;
}

/** The box around every point of the segments, control points included. */
export function segmentBounds(segments: readonly Segment[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const segment of segments) {
    for (const [x, y] of segment.pts) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Moves and scales every point. */
export function mapSegments(segments: readonly Segment[], map: (p: Pt) => Pt): Segment[] {
  return segments.map((segment) => ({ ...segment, pts: segment.pts.map(map) }) as Segment);
}

const f = (v: number) => String(Math.round(v * 100) / 100);

/** Segments as SVG path data. */
export function segmentsToSvg(segments: readonly Segment[]): string {
  return segments
    .map((s) =>
      s.type === 'Z' ? 'Z' : `${s.type}${s.pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' ')}`,
    )
    .join(' ');
}

/* ---------------------------------------------------------------- DrawingML outlines */

/** A guide of DrawingML geometry: a name and its formula. */
export interface Guide {
  name: string;
  fmla: string;
}

const ANGLE = 60000;

/**
 * The values of a shape's guides: the built-in ones of its size (`w`, `h`, `ss`, `hc`, ...) and
 * those it defines (`avLst`, then `gdLst`), each formula reading the ones before it.
 */
export function evaluateGuides(
  w: number,
  h: number,
  ...lists: readonly (readonly Guide[])[]
): Map<string, number> {
  const ss = Math.min(w, h);
  const ls = Math.max(w, h);
  const values = new Map<string, number>([
    ['w', w],
    ['h', h],
    ['l', 0],
    ['t', 0],
    ['r', w],
    ['b', h],
    ['hc', w / 2],
    ['vc', h / 2],
    ['ss', ss],
    ['ls', ls],
    ['wd2', w / 2],
    ['hd2', h / 2],
    ['wd3', w / 3],
    ['hd3', h / 3],
    ['wd4', w / 4],
    ['hd4', h / 4],
    ['wd5', w / 5],
    ['hd5', h / 5],
    ['wd6', w / 6],
    ['hd6', h / 6],
    ['wd8', w / 8],
    ['hd8', h / 8],
    ['wd10', w / 10],
    ['hd10', h / 10],
    ['wd32', w / 32],
    ['ssd2', ss / 2],
    ['ssd4', ss / 4],
    ['ssd6', ss / 6],
    ['ssd8', ss / 8],
    ['ssd16', ss / 16],
    ['ssd32', ss / 32],
    ['cd2', 180 * ANGLE],
    ['cd4', 90 * ANGLE],
    ['cd8', 45 * ANGLE],
    ['3cd4', 270 * ANGLE],
    ['3cd8', 135 * ANGLE],
    ['5cd8', 225 * ANGLE],
    ['7cd8', 315 * ANGLE],
  ]);
  const value = (token: string): number => {
    const known = values.get(token);
    if (known !== undefined) return known;
    const n = Number(token);
    return Number.isFinite(n) ? n : 0;
  };
  for (const list of lists) {
    for (const { name, fmla } of list) {
      const [op = 'val', ...raw] = fmla.trim().split(/\s+/);
      const [x = 0, y = 0, z = 0] = raw.map(value);
      const rad = (a: number) => (a / ANGLE) * (Math.PI / 180);
      let result: number;
      switch (op) {
        case '*/':
          result = z === 0 ? 0 : (x * y) / z;
          break;
        case '+-':
          result = x + y - z;
          break;
        case '+/':
          result = z === 0 ? 0 : (x + y) / z;
          break;
        case '?:':
          result = x > 0 ? y : z;
          break;
        case 'abs':
          result = Math.abs(x);
          break;
        case 'at2':
          result = (Math.atan2(y, x) * 180 * ANGLE) / Math.PI;
          break;
        case 'cat2':
          result = x * Math.cos(Math.atan2(z, y));
          break;
        case 'cos':
          result = x * Math.cos(rad(y));
          break;
        case 'max':
          result = Math.max(x, y);
          break;
        case 'min':
          result = Math.min(x, y);
          break;
        case 'mod':
          result = Math.sqrt(x * x + y * y + z * z);
          break;
        case 'pin':
          result = y < x ? x : y > z ? z : y;
          break;
        case 'sat2':
          result = x * Math.sin(Math.atan2(z, y));
          break;
        case 'sin':
          result = x * Math.sin(rad(y));
          break;
        case 'sqrt':
          result = Math.sqrt(Math.max(0, x));
          break;
        case 'tan':
          result = x * Math.tan(rad(y));
          break;
        default:
          result = x;
      }
      values.set(name, Number.isFinite(result) ? result : 0);
    }
  }
  return values;
}

/** One command of a DrawingML path, with its points still as guide names or numbers. */
export interface PathCommand {
  name: 'moveTo' | 'lnTo' | 'arcTo' | 'quadBezTo' | 'cubicBezTo' | 'close';
  pts: { x: string; y: string }[];
  arc?: { wR: string; hR: string; stAng: string; swAng: string };
}

/** Where the start angle of an arc of DrawingML lies on its ellipse, as the parameter of it. */
function parametric(angleDeg: number, wR: number, hR: number): number {
  const a = (angleDeg * Math.PI) / 180;
  return Math.atan2(wR * Math.sin(a), hR * Math.cos(a));
}

/**
 * A DrawingML path as SVG segments in a box of `w` by `h`, from the path's own coordinate space
 * of `pathW` by `pathH` (or the box itself when the path names none).
 */
export function drawingPathToSegments(
  commands: readonly PathCommand[],
  guides: Map<string, number>,
  scaleX: number,
  scaleY: number,
): { segments: Segment[]; svg: string } {
  const value = (token: string) => {
    const known = guides.get(token);
    if (known !== undefined) return known;
    const n = Number(token);
    return Number.isFinite(n) ? n : 0;
  };
  const point = (p: { x: string; y: string }): Pt => [value(p.x) * scaleX, value(p.y) * scaleY];
  const segments: Segment[] = [];
  const svg: string[] = [];
  let cur: Pt = [0, 0];
  let start: Pt = [0, 0];
  for (const command of commands) {
    switch (command.name) {
      case 'moveTo': {
        cur = point(command.pts[0] ?? { x: '0', y: '0' });
        start = cur;
        segments.push({ type: 'M', pts: [cur] });
        svg.push(`M${f(cur[0])} ${f(cur[1])}`);
        break;
      }
      case 'lnTo': {
        cur = point(command.pts[0] ?? { x: '0', y: '0' });
        segments.push({ type: 'L', pts: [cur] });
        svg.push(`L${f(cur[0])} ${f(cur[1])}`);
        break;
      }
      case 'quadBezTo': {
        const [c, to] = command.pts.map(point) as [Pt, Pt];
        if (!c || !to) break;
        cur = to;
        segments.push({ type: 'Q', pts: [c, to] });
        svg.push(`Q${f(c[0])} ${f(c[1])} ${f(to[0])} ${f(to[1])}`);
        break;
      }
      case 'cubicBezTo': {
        const [c1, c2, to] = command.pts.map(point) as [Pt, Pt, Pt];
        if (!c1 || !c2 || !to) break;
        cur = to;
        segments.push({ type: 'C', pts: [c1, c2, to] });
        svg.push(`C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(to[0])} ${f(to[1])}`);
        break;
      }
      case 'arcTo': {
        const arc = command.arc;
        if (!arc) break;
        const wR = value(arc.wR) * scaleX;
        const hR = value(arc.hR) * scaleY;
        const st = value(arc.stAng) / ANGLE;
        const sw = value(arc.swAng) / ANGLE;
        if (wR <= 0 || hR <= 0 || sw === 0) break;
        const t1 = parametric(st, wR, hR);
        const t2 = parametric(st + sw, wR, hR);
        const cx = cur[0] - wR * Math.cos(t1);
        const cy = cur[1] - hR * Math.sin(t1);
        // A whole turn, or more, is two halves: an SVG arc cannot end where it starts.
        const pieces = Math.abs(sw) >= 359.99 ? 2 : 1;
        for (let k = 1; k <= pieces; k++) {
          const t = pieces === 1 ? t2 : k === 1 ? parametric(st + sw / 2, wR, hR) : t1;
          const end: Pt = [cx + wR * Math.cos(t), cy + hR * Math.sin(t)];
          const sweepPart = sw / pieces;
          const large = Math.abs(sweepPart) > 180 ? 1 : 0;
          const sweep = sweepPart > 0 ? 1 : 0;
          segments.push(...arcToCubics(cur, wR, hR, 0, large === 1, sweep === 1, end));
          svg.push(`A${f(wR)} ${f(hR)} 0 ${large} ${sweep} ${f(end[0])} ${f(end[1])}`);
          cur = end;
        }
        break;
      }
      case 'close':
        segments.push({ type: 'Z', pts: [] });
        svg.push('Z');
        cur = start;
        break;
    }
  }
  return { segments, svg: svg.join(' ') };
}
