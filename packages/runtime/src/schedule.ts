import type { Trigger } from './types';

/** What the schedule needs to know of an effect. `span` is its whole length, stagger included. */
export interface Timed {
  trigger: Trigger;
  delay: number;
  span: number;
}

export interface Slot {
  /** Index of the effect in the list that was scheduled. */
  index: number;
  /** Milliseconds from the start of the group. */
  start: number;
  end: number;
}

export interface Group {
  slots: Slot[];
  duration: number;
}

/**
 * Splits a timeline into groups and times every effect inside its group.
 *
 * - Group 0 is the lead-in: the effects before the first `onClick`. It plays by itself when the
 *   slide is shown, and is empty when the timeline opens with a click.
 * - Every `onClick` effect opens a new group, which waits for a click.
 * - Inside a group, `withPrevious` starts together with the effect before it, and `afterPrevious`
 *   starts when that effect and everything that started with it have ended.
 * - `delay` is added to the start of the effect itself.
 */
export function schedule(effects: readonly Timed[]): Group[] {
  const groups: Group[] = [{ slots: [], duration: 0 }];
  let group = groups[0] as Group;
  let batchStart = 0;
  effects.forEach((effect, index) => {
    if (effect.trigger === 'onClick') {
      group = { slots: [], duration: 0 };
      groups.push(group);
      batchStart = 0;
    } else if (effect.trigger === 'afterPrevious') {
      batchStart = group.duration;
    }
    const start = batchStart + effect.delay;
    const end = start + effect.span;
    group.slots.push({ index, start, end });
    group.duration = Math.max(group.duration, end);
  });
  return groups;
}
