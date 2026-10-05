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

  it('drops the redo steps that were made on top of a transaction it rolls back', () => {
    const bus = new CommandBus(freshDeck());
    bus.dispatch({ type: 'element.add', slideId: 's1', element: rect('c') }, { txId: 'new' });
    bus.dispatch(move('c', 5));
    // The move of the new element is undone, and waits to be redone.
    bus.undo();
    expect(bus.canRedo).toBe(true);
    // The element itself is abandoned: the move has nothing to be redone on.
    expect(bus.rollback('new')).toBe(true);
    expect(findElement(bus.deck.slides[0]!, 'c')).toBeUndefined();
    expect(bus.canRedo).toBe(false);
    expect(bus.redo()).toBe(false);
    expect(bus.deck.slides[0]!.elements.map((e) => e.id)).toEqual(['a', 'b']);
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

  it('redoes a step whose later changes go into what its earlier ones added', () => {
    const bus = new CommandBus(freshDeck(), { validate: true });
    const before = bus.deck;
    // One step, as an agent's turn is: an element is added, then changed, then a slide is added
    // and an element put on it and moved.
    bus.dispatch({ type: 'element.add', slideId: 's1', element: rect('c') }, { txId: 'turn' });
    bus.dispatch(updateElement('s1', 'c', { opacity: 0.5 }), { txId: 'turn' });
    bus.dispatch({ type: 'slide.add', slide: createSlide({ id: 's2' }) }, { txId: 'turn' });
    bus.dispatch({ type: 'element.add', slideId: 's2', element: rect('d') }, { txId: 'turn' });
    bus.dispatch(
      { type: 'element.update', slideId: 's2', elementId: 'd', patch: { opacity: 0.25 } },
      { txId: 'turn' },
    );
    const after = bus.deck;
    expect(bus.undoStack).toHaveLength(1);

    // Three times round: what a redo puts back is not what the next redo starts from.
    for (let round = 0; round < 3; round++) {
      bus.undo();
      expect(bus.deck).toEqual(before);
      bus.redo();
      expect(bus.deck).toEqual(after);
      expect(Object.isFrozen(findElement(bus.deck.slides[1]!, 'd'))).toBe(true);
    }
    // The first slide's untouched element is the object it was all along.
    expect(bus.deck.slides[0]!.elements[0]).toBe(before.slides[0]!.elements[0]);
  });

  describe('a change that shifts the slides of a large deck (NFR-03)', () => {
    const large = () =>
      createDeck({
        slides: Array.from({ length: 200 }, (_, s) =>
          createSlide({
            id: `s${s}`,
            elements: Array.from({ length: 30 }, (_, e) => rect(`e${s}_${e}`)),
          }),
        ),
      });
    const changes: [string, Command][] = [
      // Every slide after the place of the change moves by one: a patch for each.
      [
        'a slide added near the start',
        { type: 'slide.add', slide: createSlide({ id: 'new' }), index: 1 },
      ],
      ['a slide removed near the start', { type: 'slide.remove', slideIds: ['s1'] }],
      ['a slide moved to the far end', { type: 'slide.move', slideIds: ['s2'], toIndex: 199 }],
    ];

    it.each(changes)('%s is undone and redone quickly', (_name, command) => {
      const bus = new CommandBus(large());
      bus.dispatch(command);
      const start = Date.now();
      for (let i = 0; i < 50; i++) {
        bus.undo();
        bus.redo();
      }
      // The whole key press has 16 ms; the model's part of it is a small one.
      expect((Date.now() - start) / 100).toBeLessThan(4);
    });

    it.each(changes)(
      '%s keeps every slide it did not touch as the object it was',
      (_name, command) => {
        const bus = new CommandBus(large());
        const before = bus.deck;
        bus.dispatch(command);
        const after = bus.deck;
        const sameSlides = (deck: typeof before, as: typeof before) => {
          expect(deck).toEqual(as);
          const known = new Map(as.slides.map((slide) => [slide.id, slide]));
          for (const slide of deck.slides) expect(slide).toBe(known.get(slide.id));
        };

        bus.undo();
        // Equal to what it was, and made of the same slides: nothing was copied on the way back.
        sameSlides(bus.deck, before);
        expect(Object.isFrozen(bus.deck.slides)).toBe(true);
        bus.redo();
        sameSlides(bus.deck, after);
        bus.undo();
        bus.redo();
        bus.undo();
        sameSlides(bus.deck, before);
        // The history is as good as it was: the entry was not changed by being applied.
        bus.redo();
        sameSlides(bus.deck, after);
        expect(bus.undoStack).toHaveLength(1);
      },
    );
  });

  /*
   * A gesture on the Stage is one batch a frame, one `element.update` an element, under one
   * transaction id, for as long as the gesture lasts. The step it makes is undone in the time
   * of what it changed, not of how long the user took to change it (NFR-03).
   */
  describe('a step that many batches joined (NFR-03)', () => {
    const ELEMENTS = 100;
    const ids = Array.from({ length: ELEMENTS }, (_, i) => `e${i}`);
    const crowded = () =>
      createDeck({
        slides: [
          createSlide({
            id: 's',
            elements: ids.map((id, i) =>
              createElement.shape({ id, frame: { x: i * 10, y: 0, w: 50, h: 50 } }),
            ),
          }),
        ],
      });
    const frame = (bus: CommandBus, at: number, txId = 'drag') =>
      bus.batch(
        ids.map((id, i) =>
          updateElement('s', id, { frame: { x: i * 10 + at, y: at, w: 50, h: 50 } }),
        ),
        { txId },
      );

    /** Two and a half seconds of a drag: enough for the old history to miss the budget. */
    const FRAMES = 150;

    it('keeps what the gesture changed, not every frame of it', () => {
      const bus = new CommandBus(crowded());
      const before = bus.deck;
      for (let at = 1; at <= FRAMES; at++) frame(bus, at);
      const after = bus.deck;

      const [entry] = bus.undoStack;
      expect(bus.undoStack).toHaveLength(1);
      // The first frame, and one more patch for each element however many frames followed.
      expect(entry!.patches.length).toBeLessThanOrEqual(2 * ELEMENTS);
      expect(entry!.inversePatches).toHaveLength(entry!.patches.length);
      // What the step says it did is unchanged: every command, every element.
      expect(entry!.commands).toHaveLength(FRAMES * ELEMENTS);
      expect(entry!.affected.elements).toHaveLength(ELEMENTS);

      const start = Date.now();
      for (let round = 0; round < 10; round++) {
        bus.undo();
        // Put back, not copied: the frame is the object it was before the gesture.
        expect(bus.deck.slides[0]!.elements[7]!.frame).toBe(before.slides[0]!.elements[7]!.frame);
        bus.redo();
      }
      // The whole key press has 16 ms. Before, this step alone took most of it (14 ms each
      // way, and four times that for a drag of ten seconds); now it takes 0.4 ms.
      expect((Date.now() - start) / 20).toBeLessThan(8);

      bus.undo();
      expect(bus.deck).toEqual(before);
      bus.redo();
      expect(bus.deck).toEqual(after);
      expect(Object.isFrozen(bus.deck.slides[0]!.elements[7]!.frame)).toBe(true);
      // The gesture itself is fifteen thousand commands: time for them on a busy machine.
    }, 30_000);

    it('goes on from where a redo left it, and rolls back to where it began', () => {
      const bus = new CommandBus(crowded());
      const before = bus.deck;
      for (let at = 1; at <= 5; at++) frame(bus, at);
      bus.undo();
      bus.redo();
      for (let at = 6; at <= 10; at++) frame(bus, at);
      const after = bus.deck;
      expect(bus.undoStack).toHaveLength(1);
      expect(after.slides[0]!.elements[3]!.frame).toMatchObject({ x: 40, y: 10 });

      bus.undo();
      expect(bus.deck).toEqual(before);
      bus.redo();
      expect(bus.deck).toEqual(after);
      // Esc in the middle of a drag: as if it never began.
      expect(bus.rollback('drag')).toBe(true);
      expect(bus.deck).toEqual(before);
      expect(bus.canUndo).toBe(false);
      expect(bus.canRedo).toBe(false);
    });

    it('never changes a patch its subscribers were handed', () => {
      const bus = new CommandBus(freshDeck());
      const seen: { patch: ChangeEvent['patches'][number]; value: unknown }[] = [];
      bus.subscribe((event) => {
        for (const patch of event.patches) seen.push({ patch, value: patch.value as unknown });
      });
      for (let x = 1; x <= 20; x++) bus.dispatch(move('a', x), { txId: 'drag' });
      expect(seen).toHaveLength(20);
      for (const [i, { patch, value }] of seen.entries()) {
        expect(patch.value).toBe(value);
        expect(patch.value).toMatchObject({ x: i + 1 });
      }
    });

    /*
     * The order of two changes matters when one is inside the other, or when a list changed
     * between them. Steps made of every kind of change, in every order a seed gives, must come
     * back to the deck they started from and go forward to the one they ended at.
     */
    it('undoes and redoes whatever its batches were, in any order', () => {
      const random = (seed: number) => () => {
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      let joined = 0;
      for (let seed = 1; seed <= 60; seed++) {
        const next = random(seed);
        const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!;
        const whole = (max: number) => Math.floor(next() * max);
        const bus = new CommandBus(
          createDeck({
            slides: [createSlide({ id: 's1', elements: ['a', 'b', 'c', 'd'].map(rect) })],
          }),
          { validate: true },
        );
        let added = 0;
        let emitted = 0;
        bus.subscribe((event) => {
          if (event.kind === 'apply' && event.txId === 'tx') emitted += event.patches.length;
        });
        const any = (): Command => {
          const live = bus.deck.slides[0]!.elements.map((element) => element.id);
          const id = pick(live.length > 0 ? live : ['a']);
          const kinds: (() => Command)[] = [
            // The same place again and again: what a drag is.
            () => move(id, whole(500)),
            () => move(id, whole(500)),
            () => updateElement('s1', id, { opacity: next() }),
            () => updateElement('s1', id, { name: `n${whole(9)}` }),
            // A place above those: the element itself changes its seat in the list.
            () => ({
              type: 'element.reorder',
              slideId: 's1',
              elementIds: [id],
              to: pick(['front', 'back', 'forward', 'backward'] as const),
            }),
            // The list grows and shrinks: an index names another element afterwards.
            () => ({ type: 'element.add', slideId: 's1', element: rect(`x${seed}_${added++}`) }),
            () => ({ type: 'element.remove', slideId: 's1', elementIds: [id] }),
            // A place inside the theme, and the theme whole.
            () => ({
              type: 'theme.update',
              patch: { colors: { primary: `#0000${10 + whole(89)}` } },
            }),
            () => ({ type: 'theme.update', patch: { radius: whole(20) } }),
            () => ({ type: 'theme.replace', theme: { ...bus.deck.theme, radius: whole(20) } }),
            () => ({ type: 'deck.setMeta', patch: { title: `t${whole(9)}` } }),
            () => ({ type: 'slide.update', slideId: 's1', patch: { name: `s${whole(9)}` } }),
          ];
          return pick(kinds)();
        };
        /** Up to `count` batches under one transaction; the ones a command refuses are skipped. */
        const run = (count: number) => {
          for (let i = 0; i < count; i++) {
            const commands = Array.from({ length: 1 + whole(3) }, any);
            try {
              bus.batch(commands, { txId: 'tx' });
            } catch (error) {
              expect(error).toBeInstanceOf(CommandError);
            }
          }
        };

        bus.dispatch(move('a', 1));
        const before = bus.deck;
        run(30);
        if (bus.deck === before) continue;
        const middle = bus.deck;
        expect(bus.undoStack).toHaveLength(2);
        const round = (to: typeof before) => {
          bus.undo();
          expect(bus.deck, `seed ${seed}`).toEqual(before);
          bus.redo();
          expect(bus.deck, `seed ${seed}`).toEqual(to);
        };
        round(middle);
        round(middle);
        // More batches join the step after the redo, and it is still one step.
        run(15);
        const after = bus.deck;
        expect(bus.undoStack).toHaveLength(2);
        round(after);
        joined += emitted - bus.undoStack[1]!.patches.length;
        expect(bus.rollback('tx')).toBe(true);
        expect(bus.deck, `seed ${seed}`).toEqual(before);
      }
      // The test means something only if places really were replaced more than once.
      expect(joined).toBeGreaterThan(100);
      // Every batch is checked against the schema: slow, and slower on a busy machine.
    }, 30_000);
  });
});
