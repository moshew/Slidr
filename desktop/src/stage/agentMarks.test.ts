import { describe, expect, it } from 'vitest';
import { createDeck, createElement, createSlide, type ChangeEvent } from '@slidr/model';
import { createAgentMarks } from './agentMarks';

/** Timers the test runs by hand. */
function timers() {
  let next = 1;
  const pending = new Map<number, () => void>();
  return {
    setTimer: (run: () => void) => {
      pending.set(next, run);
      return next++;
    },
    clearTimer: (timer: unknown) => {
      pending.delete(timer as number);
    },
    /** Lets every pending timer fire. */
    flush: () => {
      for (const [id, run] of [...pending]) {
        pending.delete(id);
        run();
      }
    },
    count: () => pending.size,
  };
}

const element = (id: string) => createElement.shape({ id, frame: { x: 0, y: 0, w: 10, h: 10 } });
const one = createDeck({ slides: [createSlide({ id: 's_1', elements: [element('e_a')] })] });

/** A change of the agent to an element of the one slide, unless said otherwise. */
const change = (extra: Partial<ChangeEvent>): ChangeEvent =>
  ({
    kind: 'apply',
    actor: 'agent:s1:t1',
    affected: { elements: ['e_a'], slides: ['s_1'] },
    deck: one,
    previous: one,
    ...extra,
  }) as ChangeEvent;

describe('the marks of what the agent is changing (STG-11)', () => {
  it('marks what the agent changed, for a moment', () => {
    const clock = timers();
    const marks = createAgentMarks(clock);
    marks.noteChange(change({}));
    expect(marks.store.getState().ids).toEqual(['e_a']);
    clock.flush();
    expect(marks.store.getState().ids).toEqual([]);
  });

  it('keeps a mark up while the changes go on', () => {
    const clock = timers();
    const marks = createAgentMarks(clock);
    marks.touch(['e_a']);
    marks.touch(['e_a', 'e_b']);
    // One timer for each element, not one for each change.
    expect(clock.count()).toBe(2);
    expect([...marks.store.getState().ids].sort()).toEqual(['e_a', 'e_b']);
  });

  it('does not mark what the user changed, nor an undo of what the agent did', () => {
    const marks = createAgentMarks(timers());
    marks.noteChange(change({ actor: 'user' }));
    marks.noteChange(change({ kind: 'undo' }));
    marks.noteChange(change({ kind: 'redo' }));
    expect(marks.store.getState().ids).toEqual([]);
  });

  it('holds the mark of a running tool call until the call ends, and a moment more', () => {
    const clock = timers();
    const marks = createAgentMarks(clock);
    const release = marks.hold(['e_img']);
    clock.flush();
    expect(marks.store.getState().ids).toEqual(['e_img']);
    release();
    expect(marks.store.getState().ids).toEqual(['e_img']);
    clock.flush();
    expect(marks.store.getState().ids).toEqual([]);
    // Releasing twice takes nothing away from another call.
    const other = marks.hold(['e_img']);
    release();
    clock.flush();
    expect(marks.store.getState().ids).toEqual(['e_img']);
    other();
  });

  it('marks the slide when a change names no element of it', () => {
    const marks = createAgentMarks(timers());
    marks.noteChange(change({ affected: { elements: [], slides: ['s_1'] } as never }));
    expect(marks.store.getState().ids).toEqual(['s_1']);
  });

  it('marks a slide the agent made as one slide, not as each of its elements', () => {
    const marks = createAgentMarks(timers());
    const made = createSlide({ id: 's_new', elements: [element('e_x'), element('e_y')] });
    marks.noteChange(
      change({
        affected: { elements: ['e_x', 'e_y', 'e_a'], slides: ['s_new', 's_1'] } as never,
        deck: { ...one, slides: [...one.slides, made] },
      }),
    );
    // The new slide, and the element of the old slide that the same change touched.
    expect([...marks.store.getState().ids].sort()).toEqual(['e_a', 's_new']);
  });

  it('gives the same list while the set is the same, so the Stage draws once', () => {
    const marks = createAgentMarks(timers());
    marks.touch(['e_a']);
    const first = marks.store.getState().ids;
    marks.touch(['e_a']);
    expect(marks.store.getState().ids).toBe(first);
  });
});
