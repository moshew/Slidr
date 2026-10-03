import {
  findElement,
  newId,
  plainText,
  type AnimationStep,
  type Command,
  type Deck,
  type Element,
  type Slide,
  type Transition,
} from '@slidr/model';
import {
  animationPresets,
  describePreset,
  schedule,
  travel,
  type Category,
  type FlowDirection,
  type TimelineGroup,
} from '@slidr/runtime';

/*
 * The animation timeline and the transition of a slide as the panel edits them (WG8-T04, T05):
 * what a new step is, how steps move, and what the list shows. Pure, so it is tested without a
 * DOM. Everything here ends in `slide.setTimeline` or `slide.update`; there is no other way in.
 */

export type { Category };
export const CATEGORIES: readonly Category[] = ['entrance', 'emphasis', 'exit'];

/** What a new step starts as; the same numbers `animation_set` gives a step that names none. */
export const STEP_DEFAULTS = { duration: 500, delay: 0, easing: 'ease-out' } as const;

/** What choosing a transition starts as. */
export const TRANSITION_DEFAULTS = {
  duration: 600,
  easing: 'ease-in-out',
  advance: { onClick: true },
} as const;

/**
 * Whether two values of the model hold the same data. Not by their JSON text: a value that went
 * through a command has its keys in the order of the schema, and one that came with the deck may
 * not.
 */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const [x, y] = [a as Record<string, unknown>, b as Record<string, unknown>];
  const keys = Object.keys(x).filter((key) => x[key] !== undefined);
  if (keys.length !== Object.keys(y).filter((key) => y[key] !== undefined).length) return false;
  return keys.every((key) => same(x[key], y[key]));
}

/* ---------------------------------------------------------------- steps */

/**
 * Steps that animate the given elements, to add at the end of a slide's timeline: the first waits
 * for a click and the others come with it, so several elements selected together enter together.
 */
export function newSteps(
  slide: Slide,
  elementIds: readonly string[],
  category: Category,
  preset: string,
): AnimationStep[] {
  const taken = new Set(slide.timeline.map((step) => step.id));
  return elementIds.map((elementId, i) => {
    const id = newId('a', (candidate) => taken.has(candidate));
    taken.add(id);
    return {
      id,
      elementId,
      trigger: i === 0 ? 'onClick' : 'withPrevious',
      category,
      preset,
      ...STEP_DEFAULTS,
    };
  });
}

/** The timeline with one step changed. A field set to `undefined` is removed. */
export function patchStep(
  timeline: readonly AnimationStep[],
  stepId: string,
  patch: Partial<AnimationStep>,
): AnimationStep[] {
  return timeline.map((step) => {
    if (step.id !== stepId) return step;
    const next = { ...step, ...patch };
    for (const key of Object.keys(next) as (keyof AnimationStep)[]) {
      if (next[key] === undefined) delete next[key];
    }
    return next;
  });
}

/**
 * A step with another category: the preset it had if the category has one of that name, else the
 * first. A direction only stays where the new preset takes one.
 */
export function withCategory(step: AnimationStep, category: Category): AnimationStep {
  const names = animationPresets[category];
  const preset = names.includes(step.preset) ? step.preset : (names[0] ?? step.preset);
  return withPreset({ ...step, category }, preset);
}

export function withPreset(step: AnimationStep, preset: string): AnimationStep {
  const next: AnimationStep = { ...step, preset };
  const category = playable(step.category);
  if (!category || !describePreset(category, preset).directional) delete next.direction;
  return next;
}

/** The category as the runtime plays it, or undefined for one it does not (a motion path). */
export function playable(category: AnimationStep['category']): Category | undefined {
  return category === 'motion' ? undefined : category;
}

export function removeStep(timeline: readonly AnimationStep[], stepId: string): AnimationStep[] {
  return timeline.filter((step) => step.id !== stepId);
}

/**
 * The timeline with a step moved so that it sits before `beforeId`, or at the end when that is
 * undefined. The same array when nothing moves.
 */
export function moveStep(
  timeline: readonly AnimationStep[],
  stepId: string,
  beforeId: string | undefined,
): readonly AnimationStep[] {
  const moved = timeline.find((step) => step.id === stepId);
  if (!moved || beforeId === stepId) return timeline;
  const rest = timeline.filter((step) => step.id !== stepId);
  const at = beforeId === undefined ? rest.length : rest.findIndex((step) => step.id === beforeId);
  if (at < 0) return timeline;
  const next = [...rest.slice(0, at), moved, ...rest.slice(at)];
  return next.every((step, i) => step === timeline[i]) ? timeline : next;
}

/* ---------------------------------------------------------------- the list */

/** One line of the list: a step, or the share of a step that plays in one group. */
export interface Row {
  /** Unique in the list: a step animated by paragraph has a row in several groups. */
  key: string;
  step: AnimationStep;
  /** Milliseconds from the start of the group. */
  start: number;
  end: number;
  /** Which of the step's rows this is, when it has more than one: a paragraph per click. */
  part?: { n: number; total: number };
}

export interface RowGroup {
  /** 0 is the lead-in, which plays when the slide opens; `n` waits for the n-th click. */
  index: number;
  duration: number;
  rows: Row[];
}

export interface TimelineList {
  groups: RowGroup[];
  /** Steps the runtime does not play: their element is gone, or their category has no player. */
  unplayed: AnimationStep[];
}

/**
 * The groups of a timeline as the runtime's schedule has them when nothing is drawn to ask the
 * runtime itself (a test, a slide that is not on the Stage): by trigger alone, a step by
 * paragraph counted as one.
 */
export function scheduledGroups(steps: readonly AnimationStep[]): TimelineGroup[] {
  const played = steps.filter((step) => step.category !== 'motion');
  const timed = played.map((step) => ({
    trigger: step.trigger,
    delay: step.delay,
    span: step.duration,
  }));
  return schedule(timed).map((group) => ({
    duration: group.duration,
    parts: group.slots.map((slot) => ({
      stepId: played[slot.index]?.id ?? '',
      start: slot.start,
      end: slot.end,
    })),
  }));
}

/**
 * What the list shows: the runtime's groups, with the parts of one step inside a group joined
 * into one row. The lead-in is left out when nothing plays in it.
 */
export function timelineList(
  steps: readonly AnimationStep[],
  groups: readonly TimelineGroup[],
): TimelineList {
  const byId = new Map(steps.map((step) => [step.id, step]));
  const rowsOf = new Map<string, Row[]>();
  const list: RowGroup[] = [];
  groups.forEach((group, index) => {
    const rows: Row[] = [];
    for (const part of group.parts) {
      const step = byId.get(part.stepId);
      if (!step) continue;
      const last = rows.at(-1);
      if (last?.step === step) {
        last.start = Math.min(last.start, part.start);
        last.end = Math.max(last.end, part.end);
        continue;
      }
      const row: Row = { key: `${index}:${step.id}`, step, start: part.start, end: part.end };
      rows.push(row);
      const own = rowsOf.get(step.id);
      if (own) own.push(row);
      else rowsOf.set(step.id, [row]);
    }
    if (index > 0 || rows.length > 0) list.push({ index, duration: group.duration, rows });
  });
  for (const rows of rowsOf.values()) {
    if (rows.length < 2) continue;
    rows.forEach((row, i) => (row.part = { n: i + 1, total: rows.length }));
  }
  return { groups: list, unplayed: steps.filter((step) => !rowsOf.has(step.id)) };
}

/**
 * The row whose settings are open: a step, and which of its rows. Not the row's key, which names
 * its group: a change of the step's start moves it to another group, and its settings stay open.
 */
export interface OpenRow {
  stepId: string;
  n: number;
}

export const openRow = (row: Row): OpenRow => ({ stepId: row.step.id, n: row.part?.n ?? 1 });

export function isOpenRow(row: Row, open: OpenRow | null): boolean {
  if (open?.stepId !== row.step.id) return false;
  // A step that has fewer rows than it had keeps its settings open under the last of them.
  return !row.part || row.part.n === Math.min(open.n, row.part.total);
}

/** The step a dragged row lands before, given the rows above and below the gap it is dropped in. */
export function dropTarget(
  steps: readonly AnimationStep[],
  above: Row | undefined,
  below: Row | undefined,
): string | undefined {
  // Before the row below, when that row is where its step begins.
  if (below && (!below.part || below.part.n === 1)) return below.step.id;
  if (!above) return steps[0]?.id;
  const at = steps.findIndex((step) => step.id === above.step.id);
  return steps[at + 1]?.id;
}

/* ---------------------------------------------------------------- elements */

const SNIPPET = 32;

/** The words an element starts with, for a row of an element without a name. */
export function elementSnippet(element: Element): string | undefined {
  const text =
    element.type === 'text'
      ? plainText(element.content)
      : element.type === 'shape'
        ? element.content && plainText(element.content)
        : element.type === 'image'
          ? element.alt
          : undefined;
  const line = text
    ?.split('\n')
    .find((l) => l.trim() !== '')
    ?.trim();
  if (!line) return undefined;
  return line.length > SNIPPET ? `${line.slice(0, SNIPPET).trimEnd()}…` : line;
}

/** Whether an element has text the runtime can bring in by paragraph, word or character. */
export function hasText(slide: Slide, elementId: string): boolean {
  const element = findElement(slide, elementId);
  if (!element) return false;
  if (element.type === 'text' || element.type === 'table') return true;
  return element.type === 'shape' && Boolean(element.content && plainText(element.content).trim());
}

/* ---------------------------------------------------------------- direction */

/** A direction as it is on screen. The model's `start` and `end` depend on how the deck reads. */
export type Arrow = 'left' | 'right' | 'up' | 'down';

export function arrowOf(direction: FlowDirection, dir: 'ltr' | 'rtl'): Arrow {
  const v = travel(direction, dir);
  if (v.x !== 0) return v.x < 0 ? 'left' : 'right';
  return v.y < 0 ? 'up' : 'down';
}

export function flowOf(arrow: Arrow, dir: 'ltr' | 'rtl'): FlowDirection {
  if (arrow === 'up' || arrow === 'down') return arrow;
  return (arrow === 'left') === (dir === 'ltr') ? 'start' : 'end';
}

/* ---------------------------------------------------------------- transition */

/**
 * A transition as the model keeps it: "none" that also leaves the slide on a click is no
 * transition at all, and is stored as absent.
 */
export function storedTransition(transition: Transition): Transition | null {
  const { advance } = transition;
  const plain = advance.onClick && advance.afterMs === undefined;
  return transition.type === 'none' && plain ? null : transition;
}

/** The transition a slide has, or what its editor starts from when it has none. */
export function shownTransition(slide: Slide): Transition {
  return slide.transition ?? { type: 'none', ...TRANSITION_DEFAULTS };
}

/** The transition with another type; the direction goes when the type does not take one. */
export function withType(transition: Transition, type: string, directional: boolean): Transition {
  const next: Transition = { ...transition, type };
  if (!directional) delete next.direction;
  return next;
}

/**
 * "Apply to all slides": every other slide gets the transition of the given one. One batch, one
 * undo step. Empty when they all have it already.
 */
export function applyTransitionToAll(deck: Deck, slideId: string): Command[] {
  const source = deck.slides.find((slide) => slide.id === slideId);
  if (!source) return [];
  const transition = source.transition ?? null;
  return deck.slides
    .filter((slide) => slide.id !== slideId && !same(slide.transition ?? null, transition))
    .map((slide) => ({ type: 'slide.update', slideId: slide.id, patch: { transition } }));
}

/** The first slide of a show: the one a show opens on, whose transition never plays. */
export function opensTheShow(deck: Deck, slideId: string): boolean {
  return deck.slides.find((slide) => !slide.hidden)?.id === slideId;
}

/** The slide a transition comes from: the nearest one before that is not hidden. */
export function slideBefore(deck: Deck, slideId: string): Slide | undefined {
  const at = deck.slides.findIndex((slide) => slide.id === slideId);
  for (let i = at - 1; i >= 0; i--) {
    const slide = deck.slides[i];
    if (slide && !slide.hidden) return slide;
  }
  return undefined;
}
