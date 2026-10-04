import { describe, expect, it } from 'vitest';
import { CommandBus } from '../bus';
import { createDeck, createElement, createSlide } from '../factories';
import type { Element, GroupElement } from '../schema';
import { alignElements } from './arrange';
import { batchFitted, refitAll, refitCommands } from './refit';

const box = (id: string, x: number, y: number, w = 100, h = 100): Element =>
  createElement.shape({ id, frame: { x, y, w, h } });

/** A group at (200, 200) of two boxes side by side, its frame around them. */
const group = (): GroupElement =>
  createElement.group({
    id: 'g',
    frame: { x: 200, y: 200, w: 300, h: 100 },
    children: [box('a', 0, 0), box('b', 200, 0)],
  });

function busWith(elements: Element[]): CommandBus {
  return new CommandBus(createDeck({ slides: [createSlide({ id: 's1', elements })] }));
}

const onSlide = (bus: CommandBus, id: string) => {
  const walk = (list: readonly Element[]): Element | undefined => {
    for (const e of list) {
      if (e.id === id) return e;
      const inside = e.type === 'group' ? walk(e.children) : undefined;
      if (inside) return inside;
    }
    return undefined;
  };
  return walk(bus.deck.slides[0]!.elements)!;
};

describe('refitCommands', () => {
  it('has nothing to say about a slide whose groups bound their children', () => {
    const bus = busWith([group(), box('c', 900, 900)]);
    expect(refitCommands(bus.deck.slides[0]!)).toEqual([]);
  });

  it('gives the group the bounds of its children and shifts them the other way', () => {
    const bus = busWith([group()]);
    // The child moves 50 to the left of the group's frame: outside it.
    bus.dispatch({
      type: 'element.update',
      slideId: 's1',
      elementId: 'a',
      patch: { frame: { x: -50, y: 0, w: 100, h: 100 } },
    });
    bus.batch(refitCommands(bus.deck.slides[0]!));
    expect(onSlide(bus, 'g').frame).toEqual({ x: 150, y: 200, w: 350, h: 100 });
    expect(onSlide(bus, 'a').frame).toEqual({ x: 0, y: 0, w: 100, h: 100 });
    expect(onSlide(bus, 'b').frame).toEqual({ x: 250, y: 0, w: 100, h: 100 });
    // Fitted now.
    expect(refitAll(bus.deck.slides[0]!.elements).size).toBe(0);
  });

  it('looks only at the groups around the named elements', () => {
    const other = createElement.group({
      id: 'h',
      // A frame that does not bound its child: nobody asked about it.
      frame: { x: 0, y: 600, w: 500, h: 500 },
      children: [box('c', 0, 0)],
    });
    const bus = busWith([group(), other]);
    expect(refitCommands(bus.deck.slides[0]!, ['a'])).toEqual([]);
    expect(refitCommands(bus.deck.slides[0]!, ['c']).length).toBeGreaterThan(0);
  });
});

describe('batchFitted', () => {
  it('fits the groups in the undo step of the change', () => {
    const bus = busWith([group()]);
    const before = bus.deck;
    // Aligning the two children to the left puts both at x 0: the group is 100 wide now.
    batchFitted(bus, alignElements(bus.deck.slides[0]!, ['a', 'b'], 'left', 'selection'));
    expect(onSlide(bus, 'g').frame).toEqual({ x: 200, y: 200, w: 100, h: 100 });
    expect(bus.undoStack.length).toBe(1);
    bus.undo();
    expect(bus.deck).toEqual(before);
  });

  it('joins the transaction it is given', () => {
    const bus = busWith([group()]);
    batchFitted(
      bus,
      [
        {
          type: 'element.update',
          slideId: 's1',
          elementId: 'b',
          patch: { frame: { x: 400, y: 0, w: 100, h: 100 } },
        },
      ],
      { txId: 'tx_1', actor: 'agent:s:t' },
    );
    expect(onSlide(bus, 'g').frame.w).toBe(500);
    expect(bus.undoStack.length).toBe(1);
    expect(bus.undoStack[0]!.actor).toBe('agent:s:t');
  });
});
