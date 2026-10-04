import { describe, expect, it } from 'vitest';
import { createElement, rotatedBounds, unionBounds, type Element } from '@slidr/model';
import { rotateTogether } from './groups';

const box = (id: string, x: number, y: number, w: number, h: number, rotation = 0): Element =>
  createElement.shape({ id, frame: { x, y, w, h }, rotation });

/** The elements with the patches of a gesture applied. */
const turned = (elements: Element[], patches: ReadonlyMap<string, object>): Element[] =>
  elements.map((e) => ({ ...e, ...patches.get(e.id) }));

const centre = (e: Element) => ({ x: e.frame.x + e.frame.w / 2, y: e.frame.y + e.frame.h / 2 });

describe('rotateTogether', () => {
  // Two boxes side by side: their common box is 400 x 100 at (100, 100), its centre (300, 150).
  const elements = [box('a', 100, 100, 100, 100), box('b', 400, 100, 100, 100, 30)];
  const centreOfAll = { x: 300, y: 150 };

  it('turns each element by the angle, and carries its centre around the common centre', () => {
    const [a, b] = turned(elements, rotateTogether(elements, centreOfAll, 90));
    expect(a!.rotation).toBe(90);
    expect(b!.rotation).toBe(120);
    // A quarter turn clockwise: what was to the left of the centre is now above it.
    expect(centre(a!)).toEqual({ x: 300, y: 0 });
    expect(centre(b!)).toEqual({ x: 300, y: 300 });
    // Nothing changes size.
    expect([a!.frame.w, a!.frame.h, b!.frame.w, b!.frame.h]).toEqual([100, 100, 100, 100]);
  });

  it('leaves everything where it was after a full turn', () => {
    const after = turned(elements, rotateTogether(elements, centreOfAll, 360));
    expect(after.map((e) => e.frame)).toEqual(elements.map((e) => e.frame));
    expect(after.map((e) => e.rotation)).toEqual([0, 30]);
  });

  it('keeps the distances between the elements', () => {
    const [a, b] = turned(elements, rotateTogether(elements, centreOfAll, 37));
    const before = Math.hypot(300, 0);
    const now = Math.hypot(centre(b!).x - centre(a!).x, centre(b!).y - centre(a!).y);
    expect(now).toBeCloseTo(before, 2);
    // The common centre stays the centre of the two.
    expect((centre(a!).x + centre(b!).x) / 2).toBeCloseTo(300, 2);
    expect((centre(a!).y + centre(b!).y) / 2).toBeCloseTo(150, 2);
  });

  it('half a turn of an upright pair gives the box they started in', () => {
    const upright = [box('a', 100, 100, 100, 100), box('b', 400, 100, 100, 100)];
    const after = turned(upright, rotateTogether(upright, centreOfAll, 180));
    const bounds = (list: Element[]) =>
      unionBounds(list.map((e) => rotatedBounds(e.frame, e.rotation)));
    expect(bounds(after)).toEqual(bounds(upright));
    expect(after.map((e) => e.rotation)).toEqual([180, 180]);
  });
});
