import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { CommandBus } from './bus';
import { updateElement } from './commands';
import { createDeck, createElement, createSlide } from './factories';
import { findElement, locateElement } from './queries';
import type { Deck, Element } from './schema';

const box = (id: string, x = 0): Element =>
  createElement.shape({ id, frame: { x, y: 0, w: 100, h: 100 } });

/** A slide of a box, a group of two, and another box: a, g (b, c), d. */
function deck(): Deck {
  return createDeck({
    slides: [
      createSlide({
        id: 's1',
        elements: [
          box('a'),
          createElement.group({
            id: 'g',
            frame: { x: 200, y: 0, w: 300, h: 100 },
            children: [box('b'), box('c', 200)],
          }),
          box('d', 600),
        ],
      }),
    ],
  });
}

const elementsOf = (bus: CommandBus) => bus.deck.slides[0]!.elements;

describe('locateElement', () => {
  it('finds an element where it sits, in a group or not', () => {
    const bus = new CommandBus(deck());
    const elements = elementsOf(bus);
    const group = elements[1] as Element & { type: 'group' };
    expect(locateElement(elements, 'c')).toEqual({
      element: group.children[1],
      siblings: group.children,
      index: 1,
      parent: group,
    });
    expect(locateElement(elements, 'd')).toMatchObject({ index: 2, parent: undefined });
    expect(locateElement(elements, 'gone')).toBeUndefined();
  });

  it('follows the elements through moves, reorders, removals and additions', () => {
    const bus = new CommandBus(deck());
    for (const id of ['a', 'b', 'c', 'd']) locateElement(elementsOf(bus), id);

    // Moved: new lists down to the element, the same places.
    bus.batch([
      updateElement('s1', 'b', { frame: { x: 10, y: 10, w: 100, h: 100 } }),
      updateElement('s1', 'd', { frame: { x: 610, y: 10, w: 100, h: 100 } }),
    ]);
    expect(locateElement(elementsOf(bus), 'b')?.element.frame.x).toBe(10);
    expect(locateElement(elementsOf(bus), 'd')).toMatchObject({ index: 2 });

    // Reordered: the places of before lead elsewhere.
    bus.dispatch({ type: 'element.reorder', slideId: 's1', elementIds: ['a'], to: 'front' });
    expect(locateElement(elementsOf(bus), 'a')).toMatchObject({ index: 2 });
    expect(locateElement(elementsOf(bus), 'd')).toMatchObject({ index: 1 });

    bus.dispatch({ type: 'element.remove', slideId: 's1', elementIds: ['d'] });
    expect(locateElement(elementsOf(bus), 'd')).toBeUndefined();
    expect(locateElement(elementsOf(bus), 'a')).toMatchObject({ index: 1 });

    bus.dispatch({ type: 'element.add', slideId: 's1', element: box('e'), parentId: 'g' });
    expect(locateElement(elementsOf(bus), 'e')).toMatchObject({ index: 2, parent: { id: 'g' } });

    while (bus.undo());
    expect(locateElement(elementsOf(bus), 'e')).toBeUndefined();
    expect(locateElement(elementsOf(bus), 'a')).toMatchObject({ index: 0 });
    expect(locateElement(elementsOf(bus), 'd')?.element.frame.x).toBe(600);
  });

  it("hands a command's draft its own nodes, also after the draft changed", () => {
    const bus = new CommandBus(deck());
    const base = bus.deck;
    locateElement(elementsOf(bus), 'c');
    const next = produce(base, (draft) => {
      const elements = draft.slides[0]!.elements;
      const c = locateElement(elements, 'c');
      if (c) c.element.name = 'renamed';
      elements.splice(0, 1);
      expect(locateElement(elements, 'd')).toMatchObject({ index: 1 });
      expect(locateElement(elements, 'a')).toBeUndefined();
    });
    expect(findElement(next.slides[0]!, 'c')?.name).toBe('renamed');
    expect(findElement(base.slides[0]!, 'c')?.name).toBeUndefined();
  });

  it('finds what was put into a list that is still being built', () => {
    const list = [box('a')];
    expect(locateElement(list, 'a')?.index).toBe(0);
    list.unshift(box('z'));
    expect(locateElement(list, 'z')?.index).toBe(0);
    expect(locateElement(list, 'a')?.index).toBe(1);
  });
});
