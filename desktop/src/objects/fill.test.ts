import { Fill, type Color } from '@slidr/model';
import { parseHex } from '@slidr/ui';
import { describe, expect, it } from 'vitest';
import {
  addStop,
  colorAt,
  convertFill,
  fillKind,
  gradientFrom,
  mixRgba,
  moveStop,
  normalizeAngle,
  rememberFill,
  removeStop,
  setGradientType,
  setStopColor,
  type GradientFill,
  type GradientStop,
  type ResolveColor,
} from './fill';

const primary: Color = { token: 'primary' };
const red: Color = { value: '#ff0000' };
const blue: Color = { value: '#0000ff' };

/** Explicit colours are read as hex; tokens cannot be read here, as in a theme that lacks them. */
const resolve: ResolveColor = (color) => ('value' in color ? parseHex(color.value) : undefined);

const stops = (...at: number[]): GradientStop[] =>
  at.map((position, i) => ({ color: { value: `#00000${i}` }, at: position }));
const positions = (list: readonly GradientStop[]) => list.map((stop) => stop.at);
const values = (list: readonly GradientStop[]) =>
  list.map((stop) => ('value' in stop.color ? stop.color.value : stop.color.token));

const linear: GradientFill = {
  kind: 'linear',
  angle: 45,
  stops: [
    { color: red, at: 0 },
    { color: blue, at: 1 },
  ],
};

describe('fill kinds', () => {
  it('counts the three gradient types as one kind, and keeps `css` apart', () => {
    expect(fillKind({ kind: 'none' })).toBe('none');
    expect(fillKind({ kind: 'solid', color: primary })).toBe('solid');
    expect(fillKind(linear)).toBe('gradient');
    expect(fillKind({ kind: 'radial', stops: linear.stops })).toBe('gradient');
    expect(fillKind({ kind: 'conic', angle: 0, stops: linear.stops })).toBe('gradient');
    expect(fillKind({ kind: 'image', assetId: 'a', fit: 'cover' })).toBe('image');
    expect(fillKind({ kind: 'css', value: 'paint(x)' })).toBe('css');
  });
});

describe('convertFill', () => {
  it('leaves a fill of the wanted kind as it is', () => {
    const solid: Fill = { kind: 'solid', color: red };
    expect(convertFill(solid, 'solid', {}, primary)).toBe(solid);
    expect(convertFill(linear, 'gradient', {}, primary)).toBe(linear);
  });

  it('makes the solid colour the first stop of a new gradient', () => {
    const next = convertFill({ kind: 'solid', color: red }, 'gradient', {}, primary);
    expect(next).toEqual({
      kind: 'linear',
      angle: 90,
      stops: [
        { color: red, at: 0 },
        { color: primary, at: 1 },
      ],
    });
    expect(Fill.safeParse(next).success).toBe(true);
  });

  it('ends a gradient that starts at `primary` at another theme colour', () => {
    expect(gradientFrom(primary).stops.map((s) => s.color)).toEqual([
      primary,
      { token: 'secondary' },
    ]);
  });

  it('takes the first stop of a gradient as the solid colour', () => {
    expect(convertFill(linear, 'solid', {}, primary)).toEqual({ kind: 'solid', color: red });
  });

  it('restores a gradient after a look at its solid colour, unless the colour was changed', () => {
    const memory = rememberFill({}, linear);
    const solid = convertFill(linear, 'solid', memory, primary) as Fill;
    expect(convertFill(solid, 'gradient', memory, primary)).toBe(linear);

    const recoloured: Fill = { kind: 'solid', color: blue };
    const fresh = convertFill(recoloured, 'gradient', memory, primary) as GradientFill;
    expect(fresh.stops[0]?.color).toEqual(blue);
    expect(fresh.stops).toHaveLength(2);
  });

  it('starts from the default colour when there is nothing to carry over', () => {
    expect(convertFill({ kind: 'none' }, 'solid', {}, primary)).toEqual({
      kind: 'solid',
      color: primary,
    });
    const gradient = convertFill({ kind: 'none' }, 'gradient', {}, red) as GradientFill;
    expect(gradient.stops[0]?.color).toEqual(red);
  });

  it('comes back from "none" to the fill that was there', () => {
    const solid: Fill = { kind: 'solid', color: red };
    const memory = rememberFill({}, solid);
    expect(convertFill({ kind: 'none' }, 'solid', memory, primary)).toBe(solid);
  });

  it('needs a picture before it can be an image fill, and remembers one', () => {
    expect(convertFill({ kind: 'solid', color: red }, 'image', {}, primary)).toBeUndefined();
    const image: Fill = { kind: 'image', assetId: 'a1', fit: 'contain', opacity: 0.5 };
    const memory = rememberFill({}, image);
    expect(convertFill({ kind: 'none' }, 'image', memory, primary)).toBe(image);
  });

  it('replaces an imported `css` fill by any kind', () => {
    const css: Fill = { kind: 'css', value: 'repeating-linear-gradient(red, blue 4px)' };
    expect(convertFill(css, 'none', {}, primary)).toEqual({ kind: 'none' });
    expect(convertFill(css, 'solid', {}, primary)).toEqual({ kind: 'solid', color: primary });
  });
});

describe('setGradientType', () => {
  it('keeps the stops, and the angle and centre where they apply', () => {
    const radial = setGradientType(linear, 'radial');
    expect(radial).toEqual({ kind: 'radial', stops: linear.stops });
    expect(radial.stops).toBe(linear.stops);

    const conic = setGradientType(linear, 'conic');
    expect(conic).toEqual({ kind: 'conic', angle: 45, stops: linear.stops });

    const centred: GradientFill = {
      kind: 'radial',
      stops: linear.stops,
      center: { x: 0.2, y: 0.8 },
    };
    expect(setGradientType(centred, 'conic')).toEqual({
      kind: 'conic',
      angle: 0,
      stops: linear.stops,
      center: { x: 0.2, y: 0.8 },
    });
    // A linear gradient has no centre; it gets the default angle back.
    expect(setGradientType(centred, 'linear')).toEqual({
      kind: 'linear',
      angle: 90,
      stops: linear.stops,
    });
    expect(setGradientType(linear, 'linear')).toBe(linear);
  });

  it('gives valid fills', () => {
    for (const type of ['linear', 'radial', 'conic'] as const) {
      expect(Fill.safeParse(setGradientType(linear, type)).success).toBe(true);
    }
  });
});

describe('gradient stops', () => {
  it('moves a stop, clamped to the strip and kept to a tenth of a percent', () => {
    expect(positions(moveStop(stops(0, 0.5, 1), 1, 0.33333).stops)).toEqual([0, 0.333, 1]);
    expect(positions(moveStop(stops(0, 0.5, 1), 1, 7).stops)).toEqual([0, 1, 1]);
    expect(positions(moveStop(stops(0, 0.5, 1), 1, -2).stops)).toEqual([0, 0, 1]);
  });

  it('keeps the stops in order when one passes another, and follows the moved stop', () => {
    const edit = moveStop(stops(0, 0.5, 0.9), 0, 0.8);
    expect(positions(edit.stops)).toEqual([0.5, 0.8, 0.9]);
    expect(values(edit.stops)).toEqual(['#000001', '#000000', '#000002']);
    expect(edit.index).toBe(1);

    // Dragging on, it passes the last one too.
    const further = moveStop(edit.stops, edit.index, 1);
    expect(further.index).toBe(2);
    expect(values(further.stops)).toEqual(['#000001', '#000002', '#000000']);
  });

  it('does not pass a stop it only reaches: at the same position the order stays', () => {
    const edit = moveStop(stops(0, 0.5, 1), 1, 1);
    expect(edit.index).toBe(1);
    expect(values(edit.stops)).toEqual(['#000000', '#000001', '#000002']);
  });

  it('does not touch the stops it was given', () => {
    const before = stops(0, 1);
    moveStop(before, 0, 0.4);
    expect(positions(before)).toEqual([0, 1]);
  });

  it('recolours one stop', () => {
    const next = setStopColor(stops(0, 1), 1, red);
    expect(next[1]).toEqual({ color: red, at: 1 });
    expect(next[0]).toEqual({ color: { value: '#000000' }, at: 0 });
  });

  it('removes a stop, but never one of the last two', () => {
    const edit = removeStop(stops(0, 0.5, 1), 1);
    expect(positions(edit?.stops ?? [])).toEqual([0, 1]);
    expect(edit?.index).toBe(0);
    expect(removeStop(stops(0, 1), 0)).toBeUndefined();
    expect(removeStop(stops(0, 0.5, 1), 5)).toBeUndefined();
  });

  it('adds a stop in the colour the gradient has there, and puts it in order', () => {
    const edit = addStop(linear.stops, 0.5, resolve);
    expect(edit.index).toBe(1);
    expect(positions(edit.stops)).toEqual([0, 0.5, 1]);
    expect(edit.stops[1]?.color).toEqual({ value: '#800080' });
    expect(Fill.safeParse({ ...linear, stops: edit.stops }).success).toBe(true);
  });

  it('copies the end colour for a stop added past the ends', () => {
    const inner = [
      { color: red, at: 0.2 },
      { color: blue, at: 0.8 },
    ];
    expect(colorAt(inner, 0.1, resolve)).toEqual(red);
    expect(colorAt(inner, 0.9, resolve)).toEqual(blue);
  });

  it('keeps a theme token between two stops of that token', () => {
    const themed = [
      { color: primary, at: 0 },
      { color: primary, at: 1 },
    ];
    expect(colorAt(themed, 0.5, resolve)).toEqual(primary);
  });

  it('falls back to the stop before when a colour cannot be read', () => {
    const mixed = [
      { color: primary, at: 0 },
      { color: red, at: 1 },
    ];
    expect(colorAt(mixed, 0.5, resolve)).toEqual(primary);
  });

  it('mixes with the alpha premultiplied, as a CSS gradient does', () => {
    const clear = { r: 0, g: 0, b: 255, a: 0 };
    const solid = { r: 255, g: 0, b: 0, a: 1 };
    // Halfway to a transparent blue the colour is still red, only fainter: no purple fringe.
    expect(mixRgba(solid, clear, 0.5)).toEqual({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(mixRgba(solid, clear, 1)).toEqual({ r: 255, g: 0, b: 0, a: 0 });
    const translucent = colorAt(
      [
        { color: red, at: 0 },
        { color: { value: '#0000ff', alpha: 0 }, at: 1 },
      ],
      0.5,
      (color) => {
        const rgba = 'value' in color ? parseHex(color.value) : undefined;
        return rgba && { ...rgba, a: color.alpha ?? 1 };
      },
    );
    expect(translucent).toEqual({ value: '#ff0000', alpha: 0.5 });
  });
});

describe('normalizeAngle', () => {
  it('brings an angle into one turn', () => {
    expect(normalizeAngle(450)).toBe(90);
    expect(normalizeAngle(-90)).toBe(270);
    expect(normalizeAngle(359.6)).toBe(0);
  });
});
