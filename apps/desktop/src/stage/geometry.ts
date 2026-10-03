import {
  frameCenter,
  normalizeAngle,
  rotatedBounds,
  rotateVector,
  type Frame,
  type Point,
} from '@slidr/model';

/**
 * The Stage's geometry (WG2-T03..T06), as pure functions in slide pixels. The pointer handling
 * calls these and turns the results into `element.update` commands.
 */

/** Margin around the slide when it is fitted to the Stage (SPEC 4.1). */
export const FIT_MARGIN = 24;
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

/** The zoom at which the slide fits the Stage with a margin on every side (UI-03). */
export function fitZoom(
  stage: { w: number; h: number },
  slide: { w: number; h: number },
  margin = FIT_MARGIN,
): number {
  const zoom = Math.min((stage.w - 2 * margin) / slide.w, (stage.h - 2 * margin) / slide.h);
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** A resize handle: which edges of the box it moves. -1 is the start (left/top), 1 the end. */
export interface Handle {
  x: -1 | 0 | 1;
  y: -1 | 0 | 1;
}

export const HANDLES = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
} as const satisfies Record<string, Handle>;

export interface ResizeOptions {
  /** Keep the proportions (Shift, STG-03; the default for images). */
  keepAspect?: boolean;
  /** Resize around the centre instead of the opposite handle (Alt). */
  fromCenter?: boolean;
  /** Smallest width and height, in slide pixels. */
  min?: number;
}

/**
 * The frame after dragging a handle by `delta` (slide pixels, screen axes). Works in the element's
 * own rotated axes, and keeps the opposite handle (or the centre) where it was on the slide.
 */
export function resizeFrame(
  frame: Frame,
  rotation: number,
  handle: Handle,
  delta: Point,
  options: ResizeOptions = {},
): Frame {
  const min = options.min ?? 1;
  const local = rotateVector(delta, -rotation);
  const k = options.fromCenter ? 2 : 1;
  let w = handle.x ? frame.w + handle.x * local.x * k : frame.w;
  let h = handle.y ? frame.h + handle.y * local.y * k : frame.h;
  if (options.keepAspect && frame.w > 0 && frame.h > 0) {
    const sx = w / frame.w;
    const sy = h / frame.h;
    // A corner follows whichever axis moved more; an edge drags the other side along.
    const s =
      handle.x && handle.y ? (Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy) : handle.x ? sx : sy;
    w = frame.w * s;
    h = frame.h * s;
  }
  const ratio = frame.h > 0 ? frame.w / frame.h : 1;
  if (w < min) {
    w = min;
    if (options.keepAspect) h = min / ratio;
  }
  if (h < min) {
    h = min;
    if (options.keepAspect) w = min * ratio;
  }
  const c = frameCenter(frame);
  let center: Point;
  if (options.fromCenter) center = c;
  else {
    // The anchor is the opposite handle; on an edge handle's other axis it is the middle.
    const anchor = rotateVector(
      { x: (-handle.x * frame.w) / 2, y: (-handle.y * frame.h) / 2 },
      rotation,
    );
    const back = rotateVector({ x: (handle.x * w) / 2, y: (handle.y * h) / 2 }, rotation);
    // An edge handle under keepAspect grows the other axis around its middle.
    center = { x: c.x + anchor.x + back.x, y: c.y + anchor.y + back.y };
  }
  return { x: center.x - w / 2, y: center.y - h / 2, w, h };
}

/**
 * The rotation that puts the top handle under the pointer, given where the drag started. With
 * `snap` it lands on multiples of 15° (STG-08).
 */
export function rotationAt(
  center: Point,
  start: Point,
  pointer: Point,
  startRotation: number,
  snap = false,
): number {
  const angle = (p: Point) => (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
  let r = startRotation + angle(pointer) - angle(start);
  if (snap) r = Math.round(r / 15) * 15;
  r = normalizeAngle(r);
  return Math.round(r * 100) / 100;
}

// ---------------------------------------------------------------------------------------------
// Snapping (STG-04)

export interface SnapTargets {
  /** Boxes of the other elements on the slide, already rotated (their bounds). */
  boxes: Frame[];
  slide: { w: number; h: number };
  /** Safe margin from the slide edges, in slide pixels. */
  safeMargin?: number;
  /** Column count of the layout grid inside the safe area. */
  columns?: number;
  /** Gap between grid columns. */
  gutter?: number;
}

export interface Guide {
  axis: 'x' | 'y';
  /** The snapped line: an x for vertical guides, a y for horizontal ones. */
  at: number;
  /** Extent of the guide along the other axis. */
  from: number;
  to: number;
  kind: 'edge' | 'center' | 'slide' | 'margin' | 'grid' | 'spacing';
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

interface Line {
  at: number;
  kind: Guide['kind'];
  /** Extent of the source along the other axis, so the guide spans both boxes. */
  from: number;
  to: number;
}

function targetLines(targets: SnapTargets, axis: 'x' | 'y'): Line[] {
  const { slide } = targets;
  const size = axis === 'x' ? slide.w : slide.h;
  const cross = axis === 'x' ? slide.h : slide.w;
  const lines: Line[] = [
    { at: 0, kind: 'slide', from: 0, to: cross },
    { at: size / 2, kind: 'slide', from: 0, to: cross },
    { at: size, kind: 'slide', from: 0, to: cross },
  ];
  const margin = targets.safeMargin ?? 0;
  if (margin > 0) {
    lines.push(
      { at: margin, kind: 'margin', from: 0, to: cross },
      { at: size - margin, kind: 'margin', from: 0, to: cross },
    );
  }
  const columns = targets.columns ?? 0;
  if (axis === 'x' && columns > 1) {
    const gutter = targets.gutter ?? 0;
    const inner = size - 2 * margin;
    const col = (inner - gutter * (columns - 1)) / columns;
    for (let i = 1; i < columns; i++) {
      const start = margin + i * (col + gutter);
      lines.push({ at: start - gutter, kind: 'grid', from: 0, to: cross });
      if (gutter > 0) lines.push({ at: start, kind: 'grid', from: 0, to: cross });
    }
  }
  for (const b of targets.boxes) {
    const [lo, len, clo, clen] = axis === 'x' ? [b.x, b.w, b.y, b.h] : [b.y, b.h, b.x, b.w];
    lines.push(
      { at: lo, kind: 'edge', from: clo, to: clo + clen },
      { at: lo + len / 2, kind: 'center', from: clo, to: clo + clen },
      { at: lo + len, kind: 'edge', from: clo, to: clo + clen },
    );
  }
  return lines;
}

/** Positions that make the gap to the neighbours on both sides equal, or equal to a gap already on the slide. */
function spacingCandidates(
  box: Frame,
  boxes: Frame[],
  axis: 'x' | 'y',
): { pos: number; guide: Guide[] }[] {
  const lo = (b: Frame) => (axis === 'x' ? b.x : b.y);
  const len = (b: Frame) => (axis === 'x' ? b.w : b.h);
  const cLo = (b: Frame) => (axis === 'x' ? b.y : b.x);
  const cLen = (b: Frame) => (axis === 'x' ? b.h : b.w);
  // Neighbours in the same band: they overlap the box on the other axis.
  const band = boxes.filter((b) => cLo(b) < cLo(box) + cLen(box) && cLo(b) + cLen(b) > cLo(box));
  const before = band
    .filter((b) => lo(b) + len(b) <= lo(box) + len(box) / 2)
    .sort((a, b) => lo(b) + len(b) - (lo(a) + len(a)))[0];
  const after = band
    .filter((b) => lo(b) >= lo(box) + len(box) / 2)
    .sort((a, b) => lo(a) - lo(b))[0];
  const out: { pos: number; guide: Guide[] }[] = [];
  const mid = cLo(box) + cLen(box) / 2;
  const gapGuide = (a: number, b: number): Guide => ({
    axis: axis === 'x' ? 'y' : 'x',
    at: mid,
    from: a,
    to: b,
    kind: 'spacing',
  });
  if (before && after) {
    const gap = (lo(after) - (lo(before) + len(before)) - len(box)) / 2;
    if (gap >= 0) {
      const pos = lo(before) + len(before) + gap;
      out.push({
        pos,
        guide: [gapGuide(lo(before) + len(before), pos), gapGuide(pos + len(box), lo(after))],
      });
    }
  }
  // Gaps between pairs of neighbours already in the band.
  const sorted = [...band].sort((a, b) => lo(a) - lo(b));
  for (let i = 0; i + 1 < sorted.length; i++) {
    const a = sorted[i] as Frame;
    const b = sorted[i + 1] as Frame;
    const gap = lo(b) - (lo(a) + len(a));
    if (gap <= 0) continue;
    if (before) {
      const pos = lo(before) + len(before) + gap;
      out.push({
        pos,
        guide: [gapGuide(lo(a) + len(a), lo(b)), gapGuide(lo(before) + len(before), pos)],
      });
    }
    if (after) {
      const pos = lo(after) - gap - len(box);
      out.push({
        pos,
        guide: [gapGuide(lo(a) + len(a), lo(b)), gapGuide(pos + len(box), lo(after))],
      });
    }
  }
  return out;
}

function snapAxis(
  box: Frame,
  targets: SnapTargets,
  axis: 'x' | 'y',
  threshold: number,
): { d: number; guides: Guide[] } {
  const lo = axis === 'x' ? box.x : box.y;
  const len = axis === 'x' ? box.w : box.h;
  const own = [lo, lo + len / 2, lo + len];
  let best: { d: number; guides: Guide[] } | undefined;
  let bestDist = threshold;
  for (const line of targetLines(targets, axis)) {
    for (const value of own) {
      const dist = Math.abs(line.at - value);
      if (dist > bestDist + 1e-9) continue;
      const d = line.at - value;
      const cLo = axis === 'x' ? box.y : box.x;
      const cLen = axis === 'x' ? box.h : box.w;
      const guide: Guide = {
        axis: axis === 'x' ? 'x' : 'y',
        at: line.at,
        from: Math.min(line.from, cLo),
        to: Math.max(line.to, cLo + cLen),
        kind: line.kind,
      };
      if (best && Math.abs(dist - bestDist) < 1e-9 && Math.abs(best.d - d) < 1e-9)
        best.guides.push(guide);
      else {
        best = { d, guides: [guide] };
        bestDist = dist;
      }
    }
  }
  for (const c of spacingCandidates(box, targets.boxes, axis)) {
    const d = c.pos - lo;
    if (Math.abs(d) < bestDist - 1e-9) {
      best = { d, guides: c.guide };
      bestDist = Math.abs(d);
    }
  }
  return best ?? { d: 0, guides: [] };
}

/**
 * Where a moving box snaps: to the edges and centres of the other elements, the slide's edges and
 * centre, the safe margins, the column grid, and equal spacing (STG-04). `threshold` is in slide
 * pixels: divide the screen distance by the zoom.
 */
export function snapMove(box: Frame, targets: SnapTargets, threshold: number): SnapResult {
  const x = snapAxis(box, targets, 'x', threshold);
  const y = snapAxis(box, targets, 'y', threshold);
  return { dx: x.d, dy: y.d, guides: [...x.guides, ...y.guides] };
}

/** The boxes snapping compares against: every other element's rotated bounds. */
export function snapBoxes(
  elements: readonly { id: string; frame: Frame; rotation: number; hidden?: boolean }[],
  exclude: ReadonlySet<string>,
): Frame[] {
  return elements
    .filter((e) => !exclude.has(e.id) && !e.hidden)
    .map((e) => rotatedBounds(e.frame, e.rotation));
}
