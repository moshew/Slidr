import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  richText,
  type AnimationStep,
  type Deck,
  type Transition,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  applyTransitionToAll,
  arrowOf,
  dropTarget,
  elementSnippet,
  flowOf,
  hasText,
  moveStep,
  nudgeTarget,
  newSteps,
  opensTheShow,
  patchStep,
  removeStep,
  scheduledGroups,
  shownTransition,
  slideBefore,
  storedTransition,
  timelineList,
  withCategory,
  withPreset,
  withType,
} from './model';

const frame = { x: 0, y: 0, w: 400, h: 200 };

function deck(): Deck {
  return createDeck({
    title: 'Animations',
    lang: 'he',
    slides: [
      createSlide({ id: 's_hidden', hidden: true }),
      createSlide({
        id: 's_a',
        elements: [
          createElement.text({ id: 'e_title', frame, content: richText('כותרת ארוכה מאוד') }),
          createElement.shape({ id: 'e_box', frame }),
          createElement.shape({ id: 'e_label', frame, content: richText('תווית') }),
        ],
      }),
      createSlide({ id: 's_b' }),
      createSlide({ id: 's_c' }),
    ],
  });
}

const step = (id: string, init: Partial<AnimationStep> = {}): AnimationStep => ({
  id,
  elementId: 'e_box',
  trigger: 'onClick',
  category: 'entrance',
  preset: 'fade',
  duration: 500,
  delay: 0,
  easing: 'ease-out',
  ...init,
});

const push: Transition = {
  type: 'push',
  direction: 'start',
  duration: 600,
  easing: 'ease-in-out',
  advance: { onClick: true },
};

describe('steps', () => {
  it('new steps for several elements enter together on one click', () => {
    const slide = deck().slides[1]!;
    const steps = newSteps(slide, ['e_title', 'e_box'], 'entrance', 'rise');
    expect(steps.map((s) => [s.elementId, s.trigger, s.preset])).toEqual([
      ['e_title', 'onClick', 'rise'],
      ['e_box', 'withPrevious', 'rise'],
    ]);
    expect(steps[0]).toMatchObject({ duration: 500, delay: 0, easing: 'ease-out' });
    expect(new Set(steps.map((s) => s.id)).size).toBe(2);
  });

  it('a patch changes one step, and an undefined field is removed', () => {
    const timeline = [step('a', { direction: 'up', textBy: 'word' }), step('b')];
    const next = patchStep(timeline, 'a', { duration: 900, textBy: undefined });
    expect(next[0]).toEqual(step('a', { direction: 'up', duration: 900 }));
    expect('textBy' in next[0]!).toBe(false);
    expect(next[1]).toBe(timeline[1]);
  });

  it('another category keeps a preset both have, and drops a direction that means nothing', () => {
    const wipe = step('a', { preset: 'wipe', direction: 'start' });
    expect(withCategory(wipe, 'exit')).toMatchObject({
      category: 'exit',
      preset: 'wipe',
      direction: 'start',
    });
    const emphasis = withCategory(wipe, 'emphasis');
    expect(emphasis).toMatchObject({ category: 'emphasis', preset: 'pulse' });
    expect('direction' in emphasis).toBe(false);
    expect('direction' in withPreset(wipe, 'zoom')).toBe(false);
    expect(withPreset(wipe, 'flyIn').direction).toBe('start');
  });

  it('moves a step before another, or to the end', () => {
    const timeline = [step('a'), step('b'), step('c')];
    const ids = (list: readonly AnimationStep[]) => list.map((s) => s.id).join('');
    expect(ids(moveStep(timeline, 'c', 'a'))).toBe('cab');
    expect(ids(moveStep(timeline, 'a', undefined))).toBe('bca');
    expect(ids(moveStep(timeline, 'a', 'c'))).toBe('bac');
    // Where it already is: the same array, so nothing is dispatched.
    expect(moveStep(timeline, 'a', 'b')).toBe(timeline);
    expect(moveStep(timeline, 'c', undefined)).toBe(timeline);
    expect(moveStep(timeline, 'a', 'a')).toBe(timeline);
    expect(moveStep(timeline, 'x', 'a')).toBe(timeline);
    expect(ids(removeStep(timeline, 'b'))).toBe('ac');
  });

  it('moves a step with Alt and an arrow past the steps that do not play (ADR-069, finding 14)', () => {
    const path = step('p', { category: 'motion' });
    const timeline = [step('a'), path, step('b'), step('c')];
    const ids = (list: readonly AnimationStep[]) => list.map((s) => s.id).join('');
    const nudged = (id: string, by: 1 | -1) => {
      const target = nudgeTarget(timeline, [path], id, by);
      return target ? ids(moveStep(timeline, id, target.before)) : null;
    };
    expect(nudged('a', 1)).toBe('pbac');
    expect(nudged('b', -1)).toBe('bapc');
    expect(nudged('b', 1)).toBe('apcb');
    // At either end there is nowhere to go.
    expect(nudged('a', -1)).toBeNull();
    expect(nudged('c', 1)).toBeNull();
  });
});

describe('the list', () => {
  const timeline = [
    step('title', { trigger: 'afterPrevious', duration: 200 }),
    step('box', { delay: 100 }),
    step('with', { trigger: 'withPrevious' }),
    step('exit', { category: 'exit', duration: 300 }),
    step('path', { category: 'motion', preset: 'arc' }),
  ];

  it('groups by click when there is no slide to ask the runtime about', () => {
    const groups = scheduledGroups(timeline);
    expect(groups.map((g) => g.parts.map((p) => p.stepId))).toEqual([
      ['title'],
      ['box', 'with'],
      ['exit'],
    ]);
    expect(groups.map((g) => g.duration)).toEqual([200, 600, 300]);
    const list = timelineList(timeline, groups);
    expect(list.groups.map((g) => [g.index, g.rows.map((r) => r.key)])).toEqual([
      [0, ['0:title']],
      [1, ['1:box', '1:with']],
      [2, ['2:exit']],
    ]);
    expect(list.groups[1]?.rows[0]).toMatchObject({ start: 100, end: 600 });
    // A motion path has no player: it is listed apart.
    expect(list.unplayed.map((s) => s.id)).toEqual(['path']);
  });

  it('leaves an empty lead-in out, and joins the parts of a step inside one group', () => {
    const steps = [step('list', { textBy: 'paragraph' }), step('after')];
    // As the runtime reports a step by paragraph: a part per paragraph, each on its own click.
    const byClick = timelineList(steps, [
      { duration: 0, parts: [] },
      { duration: 500, parts: [{ stepId: 'list', start: 0, end: 500 }] },
      { duration: 500, parts: [{ stepId: 'list', start: 0, end: 500 }] },
      { duration: 500, parts: [{ stepId: 'after', start: 0, end: 500 }] },
    ]);
    expect(byClick.groups.map((g) => g.index)).toEqual([1, 2, 3]);
    expect(byClick.groups[0]?.rows[0]?.part).toEqual({ n: 1, total: 2 });
    expect(byClick.groups[1]?.rows[0]?.part).toEqual({ n: 2, total: 2 });
    expect(byClick.groups[2]?.rows[0]?.part).toBeUndefined();

    // After the previous one: the paragraphs follow each other inside one group, as one row.
    const inOne = timelineList(steps, [
      { duration: 0, parts: [] },
      {
        duration: 1500,
        parts: [
          { stepId: 'list', start: 0, end: 500 },
          { stepId: 'list', start: 500, end: 1000 },
          { stepId: 'after', start: 1000, end: 1500 },
        ],
      },
    ]);
    expect(inOne.groups[0]?.rows).toMatchObject([
      { key: '1:list', start: 0, end: 1000 },
      { key: '1:after', start: 1000, end: 1500 },
    ]);
    expect(inOne.groups[0]?.rows[0]?.part).toBeUndefined();
  });

  it('a dragged row lands before the step under the gap', () => {
    const steps = [step('list', { textBy: 'paragraph' }), step('after')];
    const { groups } = timelineList(steps, [
      { duration: 0, parts: [] },
      { duration: 500, parts: [{ stepId: 'list', start: 0, end: 500 }] },
      { duration: 500, parts: [{ stepId: 'list', start: 0, end: 500 }] },
      { duration: 500, parts: [{ stepId: 'after', start: 0, end: 500 }] },
    ]);
    const [first, second, after] = groups.flatMap((g) => g.rows);
    expect(dropTarget(steps, undefined, first)).toBe('list');
    // Between the two paragraphs of one step is not a place: it lands after the step.
    expect(dropTarget(steps, first, second)).toBe('after');
    expect(dropTarget(steps, second, after)).toBe('after');
    expect(dropTarget(steps, after, undefined)).toBeUndefined();
  });
});

describe('elements', () => {
  it('names an element by the words it starts with', () => {
    const slide = deck().slides[1]!;
    expect(elementSnippet(slide.elements[0]!)).toBe('כותרת ארוכה מאוד');
    expect(elementSnippet(slide.elements[1]!)).toBeUndefined();
    expect(elementSnippet(createElement.text({ frame, content: richText('א'.repeat(50)) }))).toBe(
      `${'א'.repeat(32)}…`,
    );
  });

  it('knows which elements have text to bring in by parts', () => {
    const slide = deck().slides[1]!;
    expect(hasText(slide, 'e_title')).toBe(true);
    expect(hasText(slide, 'e_box')).toBe(false);
    expect(hasText(slide, 'e_label')).toBe(true);
    expect(hasText(slide, 'e_gone')).toBe(false);
  });
});

describe('direction', () => {
  it('start and end are left and right by the way the deck reads', () => {
    expect(arrowOf('start', 'ltr')).toBe('left');
    expect(arrowOf('start', 'rtl')).toBe('right');
    expect(arrowOf('end', 'rtl')).toBe('left');
    expect(arrowOf('up', 'rtl')).toBe('up');
    for (const dir of ['ltr', 'rtl'] as const) {
      for (const direction of ['up', 'down', 'start', 'end'] as const) {
        expect(flowOf(arrowOf(direction, dir), dir)).toBe(direction);
      }
    }
  });
});

describe('the transition', () => {
  it('"none" that leaves on a click is stored as no transition', () => {
    const none = withType(push, 'none', false);
    expect('direction' in none).toBe(false);
    expect(storedTransition(none)).toBeNull();
    // With a timer it still says something: the slide moves on by itself.
    const timed = { ...none, advance: { onClick: true, afterMs: 3000 } };
    expect(storedTransition(timed)).toBe(timed);
    expect(storedTransition(push)).toBe(push);
    expect(shownTransition(createSlide())).toMatchObject({ type: 'none', duration: 600 });
  });

  it('knows the slide a show opens on, and the one a transition comes from', () => {
    const d = deck();
    expect(opensTheShow(d, 's_a')).toBe(true);
    expect(opensTheShow(d, 's_hidden')).toBe(false);
    // The hidden slide is not shown, so nothing comes from it.
    expect(slideBefore(d, 's_a')).toBeUndefined();
    expect(slideBefore(d, 's_b')?.id).toBe('s_a');
  });

  it('applies to all slides in one undo step', () => {
    const bus = new CommandBus(deck());
    bus.dispatch({ type: 'slide.update', slideId: 's_b', patch: { transition: push } });
    const before = bus.deck;
    const commands = applyTransitionToAll(bus.deck, 's_b');
    expect(commands).toHaveLength(3);
    bus.batch(commands);
    expect(bus.deck.slides.map((s) => s.transition?.type)).toEqual([
      'push',
      'push',
      'push',
      'push',
    ]);
    expect(applyTransitionToAll(bus.deck, 's_b')).toEqual([]);
    // The same transition with its keys in another order is the same transition.
    const reordered = createDeck({
      slides: [
        createSlide({ id: 's_1', transition: push }),
        createSlide({
          id: 's_2',
          transition: {
            advance: { onClick: true },
            easing: 'ease-in-out',
            duration: 600,
            direction: 'start',
            type: 'push',
          },
        }),
      ],
    });
    expect(applyTransitionToAll(reordered, 's_1')).toEqual([]);
    bus.undo();
    expect(bus.deck).toEqual(before);
    bus.redo();
    expect(bus.deck.slides[3]?.transition).toEqual(push);

    // No transition applies to all too: every slide loses its own.
    bus.dispatch({ type: 'slide.update', slideId: 's_c', patch: { transition: null } });
    bus.batch(applyTransitionToAll(bus.deck, 's_c'));
    expect(bus.deck.slides.every((s) => s.transition === undefined)).toBe(true);
  });
});

describe('writing through the commands', () => {
  it('a timeline change is one undo step, and undo brings the old timeline back', () => {
    const bus = new CommandBus(deck());
    const slide = bus.deck.slides[1]!;
    const added = newSteps(slide, ['e_title', 'e_box'], 'entrance', 'fade');
    bus.dispatch({ type: 'slide.setTimeline', slideId: 's_a', timeline: added });
    const moved = moveStep(bus.deck.slides[1]!.timeline, added[1]!.id, added[0]!.id);
    bus.dispatch({ type: 'slide.setTimeline', slideId: 's_a', timeline: [...moved] });
    expect(bus.deck.slides[1]!.timeline.map((s) => s.elementId)).toEqual(['e_box', 'e_title']);
    bus.undo();
    expect(bus.deck.slides[1]!.timeline).toEqual(added);
    bus.undo();
    expect(bus.deck.slides[1]!.timeline).toEqual([]);
    bus.redo();
    bus.redo();
    expect(bus.deck.slides[1]!.timeline.map((s) => s.elementId)).toEqual(['e_box', 'e_title']);
  });
});
