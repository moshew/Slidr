import { describe, expect, it, vi } from 'vitest';
import { CommandBus, type ChangeEvent } from './bus';
import { agentActor, CommandError, updateElement, type Command } from './commands';
import { createDeck, createElement, createSlide } from './factories';
import { hebrewDeck } from './fixtures';
import { findElement } from './queries';

const rect = (id: string) => createElement.shape({ id, frame: { x: 0, y: 0, w: 10, h: 10 } });
const freshDeck = () =>
  createDeck({ slides: [createSlide({ id: 's1', elements: [rect('a'), rect('b')] })] });
const move = (id: string, x: number) =>
  updateElement('s1', id, { frame: { x, y: 0, w: 10, h: 10 } });
const xOf = (bus: CommandBus, id: string) => findElement(bus.deck.slides[0]!, id)!.frame.x;

describe('CommandBus', () => {
  it('keeps the deck immutable', () => {
    const bus = new CommandBus(freshDeck());
    expect(Object.isFrozen(bus.deck)).toBe(true);
    expect(Object.isFrozen(bus.deck.slides[0]!.elements[0]!.frame)).toBe(true);
    bus.dispatch(move('a', 5));
    expect(Object.isFrozen(bus.deck.slides[0]!.elements[0]!.frame)).toBe(true);
  });

  it('records one undo step per command without a transaction', () => {
    const bus = new CommandBus(freshDeck());
    bus.dispatch(move('a', 1));
    bus.dispatch(move('a', 2));
    expect(bus.undoStack).toHaveLength(2);
    bus.undo();
    expect(xOf(bus, 'a')).toBe(1);
  });

  it('records a transaction as one undo step (CMD-03)', () => {
    const bus = new CommandBus(freshDeck());
    for (let x = 1; x <= 30; x++) bus.dispatch(move('a', x), { txId: 'drag' });
    bus.dispatch(move('b', 7), { txId: 'drag' });
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]!.commands).toHaveLength(31);
    expect(bus.undoStack[0]!.affected.elements.sort()).toEqual(['a', 'b']);
    bus.undo();
    expect(xOf(bus, 'a')).toBe(0);
    expect(xOf(bus, 'b')).toBe(0);
    bus.redo();
    expect(xOf(bus, 'a')).toBe(30);
    expect(xOf(bus, 'b')).toBe(7);
  });

  it('splits a transaction that someone else interleaves with, keeping undo in time order', () => {
    const bus = new CommandBus(freshDeck());
    const agent = agentActor('sess', 'turn1');
    bus.dispatch(move('a', 1), { actor: agent, txId: 'turn1' });
    bus.dispatch(move('b', 1));
    bus.dispatch(move('a', 2), { actor: agent, txId: 'turn1' });
    expect(bus.undoStack.map((e) => e.actor)).toEqual([agent, 'user', agent]);
    expect(bus.transactionInfo('turn1')).toEqual({ steps: 3, otherEdits: 1 });
  });

  it('applies a batch atomically', () => {
    const bus = new CommandBus(freshDeck());
    const before = bus.deck;
    expect(() => bus.batch([move('a', 5), move('missing', 5)])).toThrow(CommandError);
    expect(bus.deck).toBe(before);
    expect(bus.canUndo).toBe(false);

    bus.batch([move('a', 5), { type: 'element.remove', slideId: 's1', elementIds: ['b'] }]);
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck).toEqual(before);
  });

  it('lets later commands of a batch see the earlier ones', () => {
    const bus = new CommandBus(freshDeck(), { validate: true });
    bus.batch([{ type: 'element.add', slideId: 's1', element: rect('c') }, move('c', 3)]);
    expect(xOf(bus, 'c')).toBe(3);
    expect(() =>
      bus.batch([
        { type: 'element.add', slideId: 's1', element: rect('d') },
        { type: 'element.add', slideId: 's1', element: rect('d') },
      ]),
    ).toThrow(/already in use/);
  });

  it('records nothing for a command that changes nothing', () => {
    const bus = new CommandBus(freshDeck());
    const listener = vi.fn();
    bus.subscribe(listener);
    bus.dispatch({ type: 'slide.move', slideIds: ['s1'], toIndex: 0 });
    expect(bus.canUndo).toBe(false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('empties the redo stack on a new change', () => {
    const bus = new CommandBus(freshDeck());
    bus.dispatch(move('a', 1));
    bus.undo();
    expect(bus.canRedo).toBe(true);
    bus.dispatch(move('b', 1));
    expect(bus.canRedo).toBe(false);
    expect(bus.redo()).toBe(false);
  });

  it('caps the history', () => {
    const bus = new CommandBus(freshDeck(), { historyLimit: 3 });
    for (let x = 1; x <= 5; x++) bus.dispatch(move('a', x));
    expect(bus.undoStack).toHaveLength(3);
    while (bus.undo());
    expect(xOf(bus, 'a')).toBe(2);
  });

  it('rolls back a transaction without leaving a redo step', () => {
    const bus = new CommandBus(freshDeck());
    bus.dispatch(move('b', 9));
    bus.dispatch(move('a', 1), { txId: 'drag' });
    bus.dispatch(move('a', 2), { txId: 'drag' });
    expect(bus.rollback('drag')).toBe(true);
    expect(xOf(bus, 'a')).toBe(0);
    expect(xOf(bus, 'b')).toBe(9);
    expect(bus.canRedo).toBe(false);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.rollback('drag')).toBe(false);
  });

  it('does not roll back a transaction that is no longer the latest change', () => {
    const bus = new CommandBus(freshDeck());
    bus.dispatch(move('a', 1), { txId: 'drag' });
    bus.dispatch(move('b', 1));
    expect(bus.rollback('drag')).toBe(false);
    expect(xOf(bus, 'a')).toBe(1);
  });

  it('undoes a whole agent turn together with the edits made after it (CMD-06)', () => {
    const bus = new CommandBus(freshDeck());
    const before = bus.deck;
    const agent = agentActor('sess', 't1');
    bus.dispatch(move('a', 1), { actor: agent, txId: 't1' });
    bus.dispatch(move('a', 2), { actor: agent, txId: 't1' });
    bus.dispatch(move('b', 3));
    bus.dispatch(move('b', 4));
    expect(bus.transactionInfo('t1')).toEqual({ steps: 3, otherEdits: 2 });
    expect(bus.undoTransaction('t1')).toBe(true);
    expect(bus.deck).toEqual(before);
    expect(bus.transactionInfo('t1')).toBeUndefined();
    expect(bus.undoTransaction('t1')).toBe(false);
    // Nothing is lost: it can all be redone.
    while (bus.redo());
    expect(xOf(bus, 'a')).toBe(2);
    expect(xOf(bus, 'b')).toBe(4);
  });

  it('tells subscribers what changed, by whom, and how', () => {
    const bus = new CommandBus(freshDeck());
    const events: ChangeEvent[] = [];
    const unsubscribe = bus.subscribe((e) => events.push(e));
    const agent = agentActor('sess', 't1');
    bus.dispatch(move('a', 1), { actor: agent, txId: 't1' });
    bus.undo();
    bus.redo();
    bus.reset(hebrewDeck());
    unsubscribe();
    bus.dispatch({ type: 'deck.setMeta', patch: { title: 'x' } });

    expect(events.map((e) => [e.kind, e.actor, e.txId])).toEqual([
      ['apply', agent, 't1'],
      ['undo', 'user', 't1'],
      ['redo', 'user', 't1'],
      ['reset', 'user', undefined],
    ]);
    expect(events[0]!.affected.elements).toEqual(['a']);
    expect(events[0]!.patches.length).toBeGreaterThan(0);
    expect(events[1]!.previous).toBe(events[0]!.deck);
    expect(bus.canUndo).toBe(true);
  });

  it('keeps going when a subscriber throws', () => {
    const errors: unknown[] = [];
    const bus = new CommandBus(freshDeck(), { onListenerError: (e) => errors.push(e) });
    const after = vi.fn();
    bus.subscribe(() => {
      throw new Error('boom');
    });
    bus.subscribe(after);
    expect(() => bus.dispatch(move('a', 1))).not.toThrow();
    expect(after).toHaveBeenCalledOnce();
    expect(errors).toHaveLength(1);
    expect(xOf(bus, 'a')).toBe(1);
  });

  it('resets to another deck with an empty history', () => {
    const bus = new CommandBus(freshDeck());
    bus.dispatch(move('a', 1));
    const next = hebrewDeck();
    bus.reset(next);
    expect(bus.deck).toEqual(next);
    expect(bus.canUndo).toBe(false);
    expect(Object.isFrozen(bus.deck)).toBe(true);
  });

  it('undoes and redoes quickly on a large deck (NFR-03)', () => {
    const slides = Array.from({ length: 200 }, (_, s) =>
      createSlide({
        id: `s${s}`,
        elements: Array.from({ length: 30 }, (_, e) => rect(`e${s}_${e}`)),
      }),
    );
    const bus = new CommandBus(createDeck({ slides }));
    const command: Command = updateElement('s100', 'e100_15', { opacity: 0.5 });
    bus.dispatch(command);
    const start = Date.now();
    for (let i = 0; i < 50; i++) {
      bus.undo();
      bus.redo();
    }
    expect((Date.now() - start) / 100).toBeLessThan(16);
  });
});
