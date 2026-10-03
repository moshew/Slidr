import type { Color, Fill } from '@slidr/model';
import { toHex, type Rgba } from '@slidr/ui';

/*
 * The logic of the fill editor (SHP-02): what a fill becomes when its kind changes, and the
 * editing of gradient stops. Pure, so it is tested without a DOM.
 */

export type SolidFill = Extract<Fill, { kind: 'solid' }>;
export type ImageFill = Extract<Fill, { kind: 'image' }>;
export type GradientFill = Extract<Fill, { kind: 'linear' | 'radial' | 'conic' }>;
export type GradientType = GradientFill['kind'];
export type GradientStop = GradientFill['stops'][number];

/** The kinds the editor offers. The three gradient types are one kind with a type of its own. */
export type FillKind = 'none' | 'solid' | 'gradient' | 'image';

export function isGradient(fill: Fill): fill is GradientFill {
  return fill.kind === 'linear' || fill.kind === 'radial' || fill.kind === 'conic';
}

/** `css` is a fill kept verbatim from an import (SPEC 5.9): shown, and only replaced. */
export function fillKind(fill: Fill): FillKind | 'css' {
  return isGradient(fill) ? 'gradient' : fill.kind;
}

/** The last fill of each kind seen while the editor is open, so going back to a kind restores it. */
export interface FillMemory {
  solid?: SolidFill;
  gradient?: GradientFill;
  image?: ImageFill;
}

export function rememberFill(memory: FillMemory, fill: Fill): FillMemory {
  if (fill.kind === 'solid') return { ...memory, solid: fill };
  if (fill.kind === 'image') return { ...memory, image: fill };
  if (isGradient(fill)) return { ...memory, gradient: fill };
  return memory;
}

function sameColor(a: Color, b: Color): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The far end of a new gradient: a theme colour that is not the one it starts from. */
function secondColor(first: Color): Color {
  return 'token' in first && first.token === 'primary'
    ? { token: 'secondary' }
    : { token: 'primary' };
}

/** Left to right, as the stop strip shows it. Angles follow CSS: 0 points up, clockwise. */
export const DEFAULT_ANGLE = 90;

export function gradientFrom(color: Color): GradientFill {
  return {
    kind: 'linear',
    angle: DEFAULT_ANGLE,
    stops: [
      { color, at: 0 },
      { color: secondColor(color), at: 1 },
    ],
  };
}

/**
 * The fill after its kind is changed, carrying over what makes sense: a solid colour becomes the
 * first stop of the gradient, a gradient's first stop becomes the solid colour, and a kind that
 * was left a moment ago comes back as it was. Undefined for `image` when no image is known yet:
 * the caller has to ask for a file first.
 */
export function convertFill(
  fill: Fill,
  to: FillKind,
  memory: FillMemory,
  defaultColor: Color,
): Fill | undefined {
  if (fillKind(fill) === to) return fill;
  switch (to) {
    case 'none':
      return { kind: 'none' };
    case 'solid':
      if (isGradient(fill) && fill.stops[0]) return { kind: 'solid', color: fill.stops[0].color };
      return memory.solid ?? { kind: 'solid', color: defaultColor };
    case 'gradient': {
      const remembered = memory.gradient;
      if (fill.kind !== 'solid') {
        return remembered ?? gradientFrom(memory.solid?.color ?? defaultColor);
      }
      // The gradient this colour was taken from, unless the colour was changed since.
      const first = remembered?.stops[0];
      if (remembered && first && sameColor(first.color, fill.color)) return remembered;
      return gradientFrom(fill.color);
    }
    case 'image':
      return memory.image;
  }
}

/** Another gradient type with the same stops; the angle and the centre are kept where they apply. */
export function setGradientType(fill: GradientFill, type: GradientType): GradientFill {
  if (fill.kind === type) return fill;
  const { stops } = fill;
  const angle = 'angle' in fill ? fill.angle : undefined;
  const center = 'center' in fill && fill.center ? { center: fill.center } : {};
  switch (type) {
    case 'linear':
      return { kind: 'linear', angle: angle ?? DEFAULT_ANGLE, stops };
    case 'radial':
      return { kind: 'radial', stops, ...center };
    case 'conic':
      return { kind: 'conic', angle: angle ?? 0, stops, ...center };
  }
}

/** An angle in [0, 360). */
export function normalizeAngle(degrees: number): number {
  return ((Math.round(degrees) % 360) + 360) % 360;
}

/* ---------------------------------------------------------------- stops */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Positions are kept to a tenth of a percent. */
const roundAt = (at: number) => Math.round(clamp01(at) * 1000) / 1000;

export interface StopEdit {
  stops: GradientStop[];
  /** Where the edited stop is now: stops are kept in order of position. */
  index: number;
}

/** Stops in order of position; equal positions keep their order. */
function ordered(stops: readonly GradientStop[], tracked: number): StopEdit {
  const tagged = stops.map((stop, i) => ({ stop, i }));
  tagged.sort((a, b) => a.stop.at - b.stop.at || a.i - b.i);
  return {
    stops: tagged.map((t) => t.stop),
    index: Math.max(
      0,
      tagged.findIndex((t) => t.i === tracked),
    ),
  };
}

/** Moves a stop along the strip. It may pass its neighbours. */
export function moveStop(stops: readonly GradientStop[], index: number, at: number): StopEdit {
  const moved = stops.map((stop, i) => (i === index ? { ...stop, at: roundAt(at) } : stop));
  return ordered(moved, index);
}

export function setStopColor(
  stops: readonly GradientStop[],
  index: number,
  color: Color,
): GradientStop[] {
  return stops.map((stop, i) => (i === index ? { ...stop, color } : stop));
}

/** Removes a stop; a gradient keeps at least two. The stop before it becomes the edited one. */
export function removeStop(stops: readonly GradientStop[], index: number): StopEdit | undefined {
  if (stops.length <= 2 || !stops[index]) return undefined;
  return { stops: stops.filter((_, i) => i !== index), index: Math.max(0, index - 1) };
}

/** Channels of a colour, or undefined for one that cannot be read (then nothing is mixed). */
export type ResolveColor = (color: Color) => Rgba | undefined;

/** Mixes as a CSS gradient does: in sRGB, with the alpha premultiplied. */
export function mixRgba(a: Rgba, b: Rgba, t: number): Rgba {
  const alpha = a.a + (b.a - a.a) * t;
  if (alpha <= 0) return { r: a.r, g: a.g, b: a.b, a: 0 };
  const channel = (x: number, y: number) => Math.round((x * a.a * (1 - t) + y * b.a * t) / alpha);
  return {
    r: channel(a.r, b.r),
    g: channel(a.g, b.g),
    b: channel(a.b, b.b),
    a: Math.round(alpha * 100) / 100,
  };
}

/** The colour the gradient has at a position, so a stop added there changes nothing yet. */
export function colorAt(
  stops: readonly GradientStop[],
  at: number,
  resolve: ResolveColor,
): Color | undefined {
  const sorted = ordered(stops, 0).stops;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return undefined;
  if (at <= first.at) return first.color;
  if (at >= last.at) return last.color;
  const after = sorted.findIndex((stop) => stop.at >= at);
  const left = sorted[after - 1] ?? first;
  const right = sorted[after] ?? last;
  // Between two stops of one colour there is nothing to mix, and a theme token stays a token.
  if (sameColor(left.color, right.color)) return left.color;
  const a = resolve(left.color);
  const b = resolve(right.color);
  if (!a || !b) return left.color;
  const span = right.at - left.at;
  const mixed = mixRgba(a, b, span > 0 ? (at - left.at) / span : 0);
  const value = toHex(mixed, false);
  return mixed.a < 1 ? { value, alpha: mixed.a } : { value };
}

/** Adds a stop at a position, in the colour the gradient already has there. */
export function addStop(
  stops: readonly GradientStop[],
  at: number,
  resolve: ResolveColor,
): StopEdit {
  const position = roundAt(at);
  const color = colorAt(stops, position, resolve) ?? { token: 'primary' };
  return ordered([...stops, { color, at: position }], stops.length);
}
