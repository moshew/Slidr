import { describe, expect, it } from 'vitest';
import { schedule, type Timed } from './schedule';

const effect = (trigger: Timed['trigger'], span: number, delay = 0): Timed => ({
  trigger,
  span,
  delay,
});

describe('schedule', () => {
  it('has an empty lead-in when the timeline opens with a click', () => {
    const groups = schedule([effect('onClick', 300)]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toEqual({ slots: [], duration: 0 });
    expect(groups[1]).toEqual({ slots: [{ index: 0, start: 0, end: 300 }], duration: 300 });
  });

  it('puts everything before the first click in the lead-in', () => {
    const groups = schedule([
      effect('afterPrevious', 200),
      effect('withPrevious', 100),
      effect('onClick', 300),
    ]);
    expect(groups.map((g) => g.slots.map((s) => s.index))).toEqual([[0, 1], [2]]);
    expect(groups[0]?.slots[1]).toEqual({ index: 1, start: 0, end: 100 });
  });

  it('starts withPrevious together with the effect before it, and adds its own delay', () => {
    const [, group] = schedule([effect('onClick', 500, 100), effect('withPrevious', 200, 50)]);
    expect(group?.slots).toEqual([
      { index: 0, start: 100, end: 600 },
      { index: 1, start: 50, end: 250 },
    ]);
    expect(group?.duration).toBe(600);
  });

  it('starts afterPrevious when everything that started together has ended', () => {
    const [, group] = schedule([
      effect('onClick', 500),
      effect('withPrevious', 200),
      effect('afterPrevious', 100, 50),
      effect('afterPrevious', 100),
    ]);
    expect(group?.slots.slice(2)).toEqual([
      { index: 2, start: 550, end: 650 },
      { index: 3, start: 650, end: 750 },
    ]);
  });

  it('opens a group for every click', () => {
    const groups = schedule([
      effect('onClick', 100),
      effect('onClick', 100),
      effect('afterPrevious', 100),
      effect('onClick', 100),
    ]);
    expect(groups.map((g) => g.slots.length)).toEqual([0, 1, 2, 1]);
    expect(groups[2]?.duration).toBe(200);
  });
});
