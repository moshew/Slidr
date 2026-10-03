import { describe, expect, it } from 'vitest';
import { CommandBus } from '../bus';
import { CommandError, type Command } from '../commands';
import { createDeck, createElement, createSlide } from '../factories';
import { allElementsDeck, hebrewDeck } from '../fixtures';
import { rotatedBounds } from '../geometry';
import { allElementIds, findElement, findSlide, walkElements } from '../queries';
import type { Deck, Element, Frame } from '../schema';
import {
  alignElements,
  distributeElements,
  duplicateElements,
  duplicateSlide,
  groupElements,
  reorderElements,
} from './index';

const box = (x: number, y: number, w = 100, h = 100): Frame => ({ x, y, w, h });
const rect = (id: string, frame: Frame, extra: Partial<Element> = {}) =>
  createElement.shape({ id, frame, ...extra });

function deckWith(...elements: Element[]): Deck {
  return createDeck({ slides: [createSlide({ id: 's1', elements })] });
}

/** Applies commands through a validating bus and returns the resulting deck. */
function apply(deck: Deck, commands: Command[]): Deck {
  const bus = new CommandBus(deck, { validate: true });
  bus.batch(commands);
  return bus.deck;
}

const frameOf = (deck: Deck, id: string) => findElement(deck.slides[0]!, id)!.frame;

describe('duplicateSlide', () => {
  it('copies a slide with new ids for the slide, its elements and its steps', () => {
    const deck = allElementsDeck();
    const command = duplicateSlide(deck, 's_all');
    expect(command.index).toBe(1);
    const after = apply(deck, [command]);
    const copy = after.slides[1]!;
    expect(copy.id).not.toBe('s_all');
    expect(copy.name).toBe('All element types');

    const oldIds = allElementIds(deck);
    const newIds = [...walkElements(copy.elements)].map((e) => e.id);
    expect(newIds).toHaveLength([...walkElements(deck.slides[0]!.elements)].length);
    for (const id of newIds) expect(oldIds.has(id)).toBe(false);

    const titleCopy = copy.elements[0]!.id;
    expect(copy.timeline[0]).toMatchObject({ elementId: titleCopy, preset: 'rise' });
    expect(copy.timeline.map((s) => s.id)).not.toContain('a_title');
    // The original is untouched.
    expect(after.slides[0]).toEqual(deck.slides[0]);
  });

  it('renames element ids in the slide CSS, whole words only', () => {
    const deck = createDeck({
      slides: [
        createSlide({
          id: 's1',
          elements: [rect('e_a', box(0, 0)), rect('e_ab', box(0, 0))],
          css: '[data-element-id="e_a"] { color: red } [data-element-id="e_ab"] { color: blue }',
        }),
      ],
    });
    const { slide } = duplicateSlide(deck, 's1');
    const [a, ab] = slide.elements.map((e) => e.id);
    expect(slide.css).toBe(
      `[data-element-id="${a}"] { color: red } [data-element-id="${ab}"] { color: blue }`,
    );
  });

  it('takes a position and reports a missing slide', () => {
    const deck = hebrewDeck();
    expect(duplicateSlide(deck, 's_he_number', { index: 0 }).index).toBe(0);
    expect(() => duplicateSlide(deck, 's_gone')).toThrow(/may have been deleted/);
  });
});

describe('duplicateElements', () => {
  it('copies on top, in z-order, with an offset, and keeps nested copies in their group', () => {
    const deck = allElementsDeck();
    const commands = duplicateElements(deck, 's_all', ['e_group_text', 'e_shape', 'e_text'], {
      offset: { x: 20, y: 20 },
    });
    expect(commands.map((c) => c.parentId)).toEqual([undefined, undefined, 'e_group']);
    expect(commands[0]!.element.frame).toEqual({ x: 100, y: 80, w: 900, h: 120 });
    const after = apply(deck, commands);
    const top = after.slides[0]!.elements;
    expect(top.at(-2)!.id).toBe(commands[0]!.element.id);
    expect(top.at(-1)!.id).toBe(commands[1]!.element.id);
    expect(after.slides[0]!.timeline).toEqual(deck.slides[0]!.timeline);
  });

  it('copies a group once, with new ids inside, and to another slide at its slide position', () => {
    const deck = allElementsDeck();
    const [command] = duplicateElements(deck, 's_all', ['e_group', 'e_group_bg']);
    expect(command!.element.id).not.toBe('e_group');
    const inner = (command!.element as Extract<Element, { type: 'group' }>).children;
    expect(inner.map((c) => c.id)).not.toContain('e_group_bg');

    const [moved] = duplicateElements(deck, 's_all', ['e_group_text'], { toSlideId: 's_empty' });
    expect(moved).toMatchObject({ slideId: 's_empty', element: { frame: { x: 104, y: 484 } } });
    expect(moved!.parentId).toBeUndefined();
    apply(deck, [command!, moved!]);
  });

  it('reports an element that is gone', () => {
    expect(() => duplicateElements(allElementsDeck(), 's_all', ['e_gone'])).toThrow(CommandError);
  });
});

describe('alignElements', () => {
  const deck = deckWith(rect('a', box(100, 100)), rect('b', box(300, 250, 200, 50)));

  it.each([
    ['left', { a: 100, b: 100 }, 'x'],
    ['right', { a: 400, b: 300 }, 'x'],
    ['center', { a: 250, b: 200 }, 'x'],
    ['top', { a: 100, b: 100 }, 'y'],
    ['bottom', { a: 200, b: 250 }, 'y'],
    ['middle', { a: 150, b: 175 }, 'y'],
  ] as const)('aligns to the %s of the selection', (edge, expected, axis) => {
    const after = apply(deck, alignElements(deck.slides[0]!, ['a', 'b'], edge));
    expect(frameOf(after, 'a')[axis]).toBe(expected.a);
    expect(frameOf(after, 'b')[axis]).toBe(expected.b);
  });

  it('produces nothing for elements already in place', () => {
    expect(alignElements(deck.slides[0]!, ['a', 'b'], 'left').map((c) => c.elementId)).toEqual([
      'b',
    ]);
  });

  it('aligns a single element to the slide by default', () => {
    const after = apply(deck, alignElements(deck.slides[0]!, ['b'], 'center'));
    expect(frameOf(after, 'b').x).toBe(860);
  });

  it('aligns a rotated element by the box it covers on screen', () => {
    const rotated = deckWith(rect('r', box(500, 500, 200, 100), { rotation: 90 }));
    const after = apply(rotated, alignElements(rotated.slides[0]!, ['r'], 'left', 'slide'));
    const shown = rotatedBounds(frameOf(after, 'r'), 90);
    expect(shown.x).toBeCloseTo(0);
  });

  it('aligns inside a group against the slide, in the group coordinates', () => {
    const grouped = deckWith(
      createElement.group({
        id: 'g',
        frame: box(400, 300, 300, 300),
        children: [rect('c1', box(10, 10)), rect('c2', box(100, 100))],
      }),
    );
    const after = apply(grouped, alignElements(grouped.slides[0]!, ['c1'], 'top', 'slide'));
    expect(findElement(after.slides[0]!, 'c1')!.frame.y).toBe(-300);
  });

  it('refuses elements of different parents, and moves no locked element', () => {
    const slide = allElementsDeck().slides[0]!;
    expect(() => alignElements(slide, ['e_text', 'e_group_text'], 'left')).toThrow(
      /not in the same group/,
    );
    const locked = deckWith(rect('a', box(0, 0)), rect('b', box(50, 50), { locked: true }));
    expect(alignElements(locked.slides[0]!, ['a', 'b'], 'right').map((c) => c.elementId)).toEqual([
      'a',
    ]);
  });
});

describe('distributeElements', () => {
  const deck = deckWith(
    rect('a', box(0, 0, 100)),
    rect('c', box(900, 0, 100)),
    rect('b', box(150, 0, 200)),
  );

  it('evens the gaps between the outermost elements', () => {
    const after = apply(deck, distributeElements(deck.slides[0]!, ['a', 'b', 'c'], 'horizontal'));
    expect(frameOf(after, 'a').x).toBe(0);
    expect(frameOf(after, 'b').x).toBe(400);
    expect(frameOf(after, 'c').x).toBe(900);
  });

  it('spreads against the slide edges', () => {
    const after = apply(
      deck,
      distributeElements(deck.slides[0]!, ['a', 'c'], 'horizontal', 'slide'),
    );
    expect(frameOf(after, 'a').x).toBe(0);
    expect(frameOf(after, 'c').x).toBe(1820);
    const one = apply(deck, distributeElements(deck.slides[0]!, ['b'], 'vertical', 'slide'));
    expect(frameOf(one, 'b').y).toBe(490);
  });

  it('needs three elements against the selection', () => {
    expect(() => distributeElements(deck.slides[0]!, ['a', 'b'], 'vertical')).toThrow(
      /at least three/,
    );
  });
});

describe('reorderElements and groupElements', () => {
  it('reorders within each parent', () => {
    const deck = allElementsDeck();
    const commands = reorderElements(deck.slides[0]!, ['e_text', 'e_group_bg'], 'front');
    expect(commands).toHaveLength(2);
    const after = apply(deck, commands);
    const slide = findSlide(after, 's_all')!;
    expect(slide.elements.at(-1)!.id).toBe('e_text');
    const group = findElement(slide, 'e_group') as Extract<Element, { type: 'group' }>;
    expect(group.children.at(-1)!.id).toBe('e_group_bg');
  });

  it('groups with a fresh id', () => {
    const deck = allElementsDeck();
    const command = groupElements(deck, 's_all', ['e_shape', 'e_line'], { name: 'pair' });
    expect(allElementIds(deck).has(command.groupId)).toBe(false);
    const after = apply(deck, [command]);
    expect(findElement(after.slides[0]!, command.groupId)).toMatchObject({ name: 'pair' });
  });
});
