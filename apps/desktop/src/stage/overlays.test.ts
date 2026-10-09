import { describe, expect, it } from 'vitest';
import { HANDLES } from './geometry';
import { besidePosition, handleSize } from './overlays';

describe('handleSize', () => {
  it('draws a dot on a corner and a bar along an edge', () => {
    expect(handleSize(HANDLES.nw, 300, 200)).toEqual({ w: 12, h: 12 });
    expect(handleSize(HANDLES.n, 300, 200)).toEqual({ w: 16, h: 6 });
    expect(handleSize(HANDLES.e, 300, 200)).toEqual({ w: 6, h: 16 });
  });

  it('shortens the bar on a short edge, and leaves it out where the dots leave no room', () => {
    // A line of text: its sides are short, its top and bottom are not.
    expect(handleSize(HANDLES.w, 300, 30)).toEqual({ w: 6, h: 10 });
    expect(handleSize(HANDLES.s, 300, 30)).toEqual({ w: 16, h: 6 });
    expect(handleSize(HANDLES.w, 300, 27)).toBeUndefined();
    expect(handleSize(HANDLES.n, 20, 200)).toBeUndefined();
    // A corner always has its dot.
    expect(handleSize(HANDLES.se, 4, 4)).toEqual({ w: 12, h: 12 });
  });
});

/* Where the toolbar goes beside the selection (STG-05), in screen pixels of the Stage. */

const stage = { w: 1000, h: 600 };
const own = { w: 200, h: 40 };

describe('besidePosition', () => {
  it('centres the toolbar above the box, clear of the rotation handle', () => {
    const at = besidePosition({ x: 400, y: 300, w: 100, h: 80 }, own, stage, 40);
    expect(at).toEqual({ x: 350, y: 300 - 40 - 12 - 40 });
  });

  it('goes below the box when there is no room above', () => {
    const at = besidePosition({ x: 400, y: 30, w: 100, h: 80 }, own, stage, 40);
    expect(at).toEqual({ x: 350, y: 30 + 80 + 12 });
  });

  it('stays inside the Stage when the box fills it', () => {
    const at = besidePosition({ x: -50, y: -50, w: 1100, h: 700 }, own, stage, 40);
    expect(at).toEqual({ x: 400, y: 8 });
  });

  it('keeps to the sides of the Stage for a box at its edge', () => {
    expect(besidePosition({ x: 0, y: 300, w: 40, h: 40 }, own, stage, 0).x).toBe(8);
    expect(besidePosition({ x: 960, y: 300, w: 40, h: 40 }, own, stage, 0).x).toBe(792);
  });

  it('needs no room for a handle that is not there', () => {
    const at = besidePosition({ x: 400, y: 70, w: 100, h: 80 }, own, stage, 0);
    expect(at.y).toBe(70 - 12 - 40);
  });
});
