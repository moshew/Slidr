import { frameCenter, rotateVector, type Frame } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  fitZoom,
  HANDLES,
  resizeFrame,
  rotationAt,
  snapBoxes,
  snapMove,
  snapResize,
} from './geometry';

const SLIDE = { w: 1920, h: 1080 };
const close = (a: Frame, b: Frame) => {
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(a[k]).toBeCloseTo(b[k], 6);
};

describe('fitZoom', () => {
  it('shows the slide at 1232x693 in the FHD Stage (SPEC 4.1)', () => {
    const zoom = fitZoom({ w: 1280, h: 748 }, SLIDE);
    expect(Math.round(SLIDE.w * zoom)).toBe(1232);
    expect(Math.round(SLIDE.h * zoom)).toBe(693);
  });

  it('stays within the zoom range', () => {
    expect(fitZoom({ w: 50, h: 50 }, SLIDE)).toBe(0.1);
    expect(fitZoom({ w: 20000, h: 20000 }, SLIDE)).toBe(4);
  });
});

describe('resizeFrame', () => {
  const frame = { x: 100, y: 100, w: 200, h: 100 };

  it('moves only the dragged edges when not rotated', () => {
    close(resizeFrame(frame, 0, HANDLES.se, { x: 50, y: 20 }), { x: 100, y: 100, w: 250, h: 120 });
    close(resizeFrame(frame, 0, HANDLES.nw, { x: 50, y: 20 }), { x: 150, y: 120, w: 150, h: 80 });
    close(resizeFrame(frame, 0, HANDLES.e, { x: 50, y: 999 }), { x: 100, y: 100, w: 250, h: 100 });
  });

  it('keeps the proportions, and grows around the centre with Alt', () => {
    close(resizeFrame(frame, 0, HANDLES.se, { x: 100, y: 0 }, { keepAspect: true }), {
      x: 100,
      y: 100,
      w: 300,
      h: 150,
    });
    close(resizeFrame(frame, 0, HANDLES.e, { x: 20, y: 0 }, { fromCenter: true }), {
      x: 80,
      y: 100,
      w: 240,
      h: 100,
    });
    // An edge with the proportions kept grows the other axis around its middle.
    close(resizeFrame(frame, 0, HANDLES.e, { x: 200, y: 0 }, { keepAspect: true }), {
      x: 100,
      y: 50,
      w: 400,
      h: 200,
    });
  });

  it('keeps the opposite corner fixed on the slide when the box is rotated', () => {
    const rotation = 30;
    const corner = (f: Frame, hx: number, hy: number) => {
      const c = frameCenter(f);
      const v = rotateVector({ x: (hx * f.w) / 2, y: (hy * f.h) / 2 }, rotation);
      return { x: c.x + v.x, y: c.y + v.y };
    };
    // Drag the bottom-right handle along the element's own x axis by 40.
    const delta = rotateVector({ x: 40, y: 0 }, rotation);
    const out = resizeFrame(frame, rotation, HANDLES.se, delta);
    expect(out.w).toBeCloseTo(240, 6);
    expect(out.h).toBeCloseTo(100, 6);
    const before = corner(frame, -1, -1);
    const after = corner(out, -1, -1);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('does not go below the minimum size', () => {
    const out = resizeFrame(frame, 0, HANDLES.se, { x: -500, y: -500 }, { min: 4 });
    expect(out.w).toBe(4);
    expect(out.h).toBe(4);
  });
});

describe('rotationAt', () => {
  const c = { x: 0, y: 0 };
  it('follows the pointer and snaps to 15 degrees', () => {
    expect(rotationAt(c, { x: 0, y: -10 }, { x: 10, y: 0 }, 0)).toBe(90);
    expect(rotationAt(c, { x: 0, y: -10 }, { x: 10, y: -9 }, 0, true)).toBe(45);
    expect(rotationAt(c, { x: 0, y: -10 }, { x: -10, y: 0 }, 10)).toBe(280);
  });
});

describe('snapMove', () => {
  const others: Frame[] = [{ x: 200, y: 200, w: 300, h: 200 }];

  it('snaps an edge to another element and reports the guide', () => {
    const r = snapMove({ x: 503, y: 600, w: 100, h: 100 }, { boxes: others, slide: SLIDE }, 6);
    expect(r.dx).toBe(-3);
    expect(r.guides[0]).toMatchObject({ axis: 'x', at: 500, kind: 'edge' });
  });

  it('snaps the centre to the slide centre', () => {
    const r = snapMove({ x: 912, y: 900, w: 100, h: 50 }, { boxes: [], slide: SLIDE }, 6);
    expect(r.dx).toBe(-2);
    expect(r.guides).toContainEqual(expect.objectContaining({ axis: 'x', at: 960, kind: 'slide' }));
  });

  it('snaps to equal spacing between two neighbours', () => {
    const row: Frame[] = [
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 500, y: 0, w: 100, h: 100 },
    ];
    // Equal gaps of 150 put the box at x 250.
    const r = snapMove(
      { x: 247, y: 10, w: 100, h: 50 },
      { boxes: row, slide: { w: 5000, h: 5000 } },
      6,
    );
    expect(r.dx).toBe(3);
    expect(r.guides.filter((g) => g.kind === 'spacing')).toHaveLength(2);
  });

  it('snaps to the safe margin and the column grid', () => {
    const targets = { boxes: [], slide: SLIDE, safeMargin: 96, columns: 12, gutter: 24 };
    expect(snapMove({ x: 99, y: 500, w: 10, h: 10 }, targets, 6).dx).toBe(-3);
    // The first column: (1920 - 192 - 11*24) / 12 = 122, so its end is at 96 + 122.
    expect(snapMove({ x: 220, y: 500, w: 10, h: 10 }, targets, 6).dx).toBe(-2);
  });

  it('leaves the box alone beyond the threshold', () => {
    expect(snapMove({ x: 1300, y: 700, w: 37, h: 41 }, { boxes: others, slide: SLIDE }, 6)).toEqual(
      { dx: 0, dy: 0, guides: [] },
    );
  });

  it('compares against the rotated bounds of the other visible elements', () => {
    const boxes = snapBoxes(
      [
        { id: 'a', frame: { x: 0, y: 0, w: 100, h: 100 }, rotation: 45 },
        { id: 'b', frame: { x: 0, y: 0, w: 10, h: 10 }, rotation: 0, hidden: true },
        { id: 'me', frame: { x: 0, y: 0, w: 10, h: 10 }, rotation: 0 },
      ],
      new Set(['me']),
    );
    expect(boxes).toHaveLength(1);
    expect(boxes[0]!.w).toBeCloseTo(141.42, 2);
  });
});

describe('snapResize', () => {
  const others: Frame[] = [{ x: 600, y: 400, w: 200, h: 200 }];
  const targets = { boxes: others, slide: SLIDE };
  const frame = { x: 100, y: 100, w: 497, h: 303 };

  it('snaps the edges the handle moves, and only those', () => {
    const r = snapResize(frame, HANDLES.se, targets, 6);
    // The right edge to the other box's left edge, the bottom edge to its top.
    close(r.frame, { x: 100, y: 100, w: 500, h: 300 });
    expect(r.guides.map((g) => g.axis).sort()).toEqual(['x', 'y']);
    expect(r.guides.find((g) => g.axis === 'x')).toMatchObject({ at: 600, kind: 'edge' });

    // The top-left handle moves the other two edges: this frame's are far from any line.
    close(snapResize(frame, HANDLES.nw, targets, 6).frame, frame);
    const near = { x: 97, y: 91, w: 300, h: 200 };
    // Near the safe margin: the left edge and the top edge both go to 96.
    const m = snapResize(near, HANDLES.nw, { ...targets, safeMargin: 96 }, 6);
    close(m.frame, { x: 96, y: 96, w: 301, h: 195 });
    expect(m.guides.every((g) => g.kind === 'margin')).toBe(true);
  });

  it('moves one edge for an edge handle', () => {
    close(snapResize(frame, HANDLES.e, targets, 6).frame, { ...frame, w: 500 });
    close(snapResize(frame, HANDLES.n, targets, 6).frame, frame);
  });

  it('with the proportions kept, the nearer snap decides and the other side follows', () => {
    const square = { x: 100, y: 100, w: 497, h: 497 };
    const r = snapResize(square, HANDLES.se, targets, 6, { keepAspect: true });
    close(r.frame, { x: 100, y: 100, w: 500, h: 500 });
    expect(r.guides).toHaveLength(1);
    // An edge handle grows the other axis around its middle.
    const e = snapResize(square, HANDLES.e, targets, 6, { keepAspect: true });
    close(e.frame, { x: 100, y: 98.5, w: 500, h: 500 });
  });

  it('leaves the frame alone beyond the threshold', () => {
    const far = { x: 100, y: 100, w: 380, h: 250 };
    const r = snapResize(far, HANDLES.se, targets, 6);
    close(r.frame, far);
    expect(r.guides).toEqual([]);
  });
});
