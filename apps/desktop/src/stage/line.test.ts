import { createElement, type LineElement, type Point } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  constrainAngle,
  distanceToLine,
  fitLine,
  insertLinePoint,
  linePoints,
  lineStretches,
  moveLinePoint,
  neighbourIndex,
  removeLinePoint,
} from './line';

const near = (a: Point, b: Point, digits = 3) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
};

const diagonal = (extra: Partial<LineElement> = {}) =>
  createElement.line({
    frame: { x: 100, y: 200, w: 300, h: 100 },
    points: [
      { x: 0, y: 100 },
      { x: 300, y: 0 },
    ],
    stroke: { color: { token: 'text' }, width: 4 },
    ...extra,
  });

describe('moveLinePoint', () => {
  it('moves one end, keeps the other, and refits the frame to the points', () => {
    const line = diagonal();
    const out = moveLinePoint(line, 1, { x: 500, y: 450 });
    expect(out.frame).toEqual({ x: 100, y: 300, w: 400, h: 150 });
    expect(out.points).toEqual([
      { x: 0, y: 0 },
      { x: 400, y: 150 },
    ]);
    near(linePoints({ ...line, ...out })[0]!, { x: 100, y: 300 });
  });

  it('gives a flat frame to a horizontal line', () => {
    const out = moveLinePoint(diagonal(), 1, { x: 400, y: 300 });
    expect(out.frame).toEqual({ x: 100, y: 300, w: 300, h: 0 });
  });

  it.each([
    { rotation: 0, flipH: true },
    { rotation: -10, flipH: true },
    { rotation: 75, flipV: true },
    { rotation: 200, flipH: true, flipV: true },
    { rotation: 33 },
  ])('holds the other points on the slide for %o', (transform) => {
    const line = diagonal({
      ...transform,
      points: [
        { x: 0, y: 100 },
        { x: 120, y: 30 },
        { x: 300, y: 0 },
      ],
    });
    const before = linePoints(line);
    const to = { x: 640, y: 80 };
    const out = moveLinePoint(line, 2, to);
    const after = linePoints({ ...line, ...out });
    // To the thousandth of a pixel the model keeps.
    near(after[0]!, before[0]!, 2);
    near(after[1]!, before[1]!, 2);
    near(after[2]!, to, 2);
    // The frame is the box around the points.
    expect(Math.min(...out.points.map((p) => p.x))).toBeCloseTo(0, 3);
    expect(Math.min(...out.points.map((p) => p.y))).toBeCloseTo(0, 3);
    expect(Math.max(...out.points.map((p) => p.x))).toBeCloseTo(out.frame.w, 3);
    expect(Math.max(...out.points.map((p) => p.y))).toBeCloseTo(out.frame.h, 3);
  });

  it('puts a line back where it was when its positions did not change', () => {
    const line = diagonal({ rotation: 20, flipV: true });
    const out = fitLine(line, linePoints(line));
    near({ x: out.frame.x, y: out.frame.y }, { x: line.frame.x, y: line.frame.y });
    out.points.forEach((p, i) => near(p, line.points[i]!));
  });
});

describe('constrainAngle', () => {
  const anchor = { x: 100, y: 100 };
  it('lands on multiples of 15 degrees', () => {
    near(constrainAngle(anchor, { x: 300, y: 104 }), { x: 300, y: 100 });
    near(constrainAngle(anchor, { x: 96, y: 300 }), { x: 100, y: 300 });
    const p = constrainAngle(anchor, { x: 200, y: 190 });
    expect(p.x - anchor.x).toBeCloseTo(p.y - anchor.y, 6);
    const q = constrainAngle(anchor, { x: 300, y: 150 });
    const angle = (Math.atan2(q.y - anchor.y, q.x - anchor.x) * 180) / Math.PI;
    expect(angle).toBeCloseTo(15, 6);
  });

  it('measures from the neighbour of the dragged point', () => {
    expect(neighbourIndex(2, 0)).toBe(1);
    expect(neighbourIndex(2, 1)).toBe(0);
    expect(neighbourIndex(5, 4)).toBe(3);
    expect(neighbourIndex(5, 2)).toBe(1);
  });
});

describe('distanceToLine', () => {
  it('is zero on the stroke and grows away from it, whatever the frame box is', () => {
    const line = diagonal();
    // The middle of the diagonal.
    expect(distanceToLine(line, { x: 250, y: 250 })).toBe(0);
    // The corner of the frame box that the line does not pass through.
    expect(distanceToLine(line, { x: 100, y: 200 })).toBeGreaterThan(40);
    // Next to a flat line, which has no box at all.
    const flat = diagonal({
      frame: { x: 0, y: 50, w: 200, h: 0 },
      points: [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
      ],
    });
    expect(distanceToLine(flat, { x: 100, y: 55 })).toBe(3);
    expect(distanceToLine(flat, { x: 100, y: 51 })).toBe(0);
    expect(distanceToLine(flat, { x: 210, y: 50 })).toBe(8);
  });

  it('follows rotation and mirroring', () => {
    const line = diagonal({ flipH: true });
    // Mirrored, the diagonal runs from the top-left to the bottom-right of the frame.
    expect(distanceToLine(line, { x: 100, y: 200 })).toBeLessThan(1);
    expect(distanceToLine(line, { x: 400, y: 200 })).toBeGreaterThan(40);
    const turned = diagonal({ rotation: 90 });
    const ends = linePoints(turned);
    expect(distanceToLine(turned, ends[0]!)).toBe(0);
  });

  it('follows the elbow and the curve the renderer draws', () => {
    const elbow = diagonal({ curve: 'elbow' });
    // The elbow turns at the middle of the width: a vertical stretch at x = 250.
    expect(distanceToLine(elbow, { x: 250, y: 220 })).toBe(0);
    expect(distanceToLine(elbow, { x: 175, y: 300 })).toBe(0);
    expect(distanceToLine(elbow, { x: 175, y: 250 })).toBeGreaterThan(40);
    const curved = diagonal({ curve: 'curved' });
    expect(distanceToLine(curved, { x: 250, y: 250 })).toBeLessThan(1);
    expect(distanceToLine(curved, { x: 120, y: 300 })).toBeLessThan(1);
    expect(distanceToLine(curved, { x: 175, y: 250 })).toBeGreaterThan(20);
  });

  it('flattens the path into one stretch per pair of points', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 100, y: 50 },
      { x: 200, y: 0 },
    ];
    expect(lineStretches(points, 'straight')).toHaveLength(2);
    expect(lineStretches(points, 'elbow')[0]).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
    ]);
    const curved = lineStretches(points, 'curved');
    expect(curved).toHaveLength(2);
    near(curved[0]!.at(-1)!, points[1]!);
  });
});

describe('insertLinePoint and removeLinePoint', () => {
  it('adds a point on the path, between the right neighbours', () => {
    const line = diagonal({
      points: [
        { x: 0, y: 100 },
        { x: 150, y: 100 },
        { x: 300, y: 0 },
      ],
    });
    const before = linePoints(line);
    const out = insertLinePoint(line, { x: 330, y: 248 });
    expect(out.index).toBe(2);
    expect(out.points).toHaveLength(4);
    const after = linePoints({ ...line, ...out });
    near(after[0]!, before[0]!);
    near(after[1]!, before[1]!);
    near(after[3]!, before[2]!);
    // The new point is on the old path, not under the pointer.
    expect(distanceToLine(line, after[2]!)).toBe(0);
  });

  it('removes a point but never one of the last two', () => {
    const line = diagonal({
      points: [
        { x: 0, y: 100 },
        { x: 150, y: 400 },
        { x: 300, y: 0 },
      ],
    });
    const out = removeLinePoint(line, 1)!;
    expect(out.points).toEqual([
      { x: 0, y: 100 },
      { x: 300, y: 0 },
    ]);
    expect(out.frame).toEqual({ x: 100, y: 200, w: 300, h: 100 });
    expect(removeLinePoint({ ...line, ...out }, 0)).toBeUndefined();
  });
});
