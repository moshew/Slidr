import {
  ChangeDigest,
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  findElementInDeck,
  updateElement,
  type Deck,
} from '@slidr/model';
import { allElementsDeck, hebrewDeck } from '@slidr/model/fixtures';
import { describe, expect, it, vi } from 'vitest';
import { createDeckApi } from './registry';
import type { ConversionService, HtmlImportService } from './services';
import { failed, ok, setup } from './testing';
import { startTurn } from './tool';

const opacityOf = (deck: Deck, id: string) =>
  (findElementInDeck(deck, id)!.element as { opacity: number }).opacity;

describe('a turn is one transaction (D8)', () => {
  it('names the actor after the session and the turn, with a fresh transaction id', () => {
    const turn = startTurn('s1', { kind: 'deck' }, { turnId: 't7', label: 'make a title' });
    expect(turn).toMatchObject({ actor: 'agent:s1:t7', label: 'make a title' });
    expect(turn.txId).toMatch(/^tx_/);
    expect(startTurn('s1', { kind: 'deck' }).txId).not.toBe(turn.txId);
    const plain = startTurn('s1', { kind: 'deck' });
    expect(plain.actor).toBe(`agent:s1:${plain.txId}`);
  });

  it('records every write of a turn as one undo step, undone in one go', async () => {
    const { bus, call, turn } = setup(hebrewDeck());
    const original = bus.deck;
    await ok(call('text_set', { elementId: 'e_he_hero_title', markdown: 'כותרת חדשה' }));
    await ok(call('slide_duplicate', { slideId: 's_he_goals' }));
    await ok(call('element_update', { elementId: 'e_he_number_value', patch: { opacity: 0.5 } }));
    await ok(call('deck_apply_ops', { ops: [{ type: 'deck.setMeta', patch: { title: 'חדש' } }] }));

    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]).toMatchObject({ actor: turn.actor, txId: turn.txId });
    expect(bus.undoStack[0]!.commands).toEqual([
      'text.set',
      'slide.add',
      'element.update',
      'deck.setMeta',
    ]);
    expect(bus.transactionInfo(turn.txId)).toEqual({ steps: 1, otherEdits: 0 });

    expect(bus.undoTransaction(turn.txId)).toBe(true);
    expect(bus.deck).toEqual(original);
    expect(bus.canUndo).toBe(false);
    bus.redo();
    expect(bus.deck.slides).toHaveLength(4);
  });

  it('keeps separate turns as separate steps', async () => {
    const harness = setup(hebrewDeck());
    await ok(harness.call('slide_update', { slideId: 's_he_hero', name: 'one' }));
    const first = harness.turn;
    harness.nextTurn();
    await ok(harness.call('slide_update', { slideId: 's_he_hero', name: 'two' }));
    expect(harness.bus.undoStack.map((e) => e.txId)).toEqual([first.txId, harness.turn.txId]);
    harness.bus.undoTransaction(harness.turn.txId);
    expect(harness.bus.deck.slides[0]!.name).toBe('one');
  });

  it('interleaves a user edit in time order, and undoing the turn undoes it too (ADR-007)', async () => {
    const { bus, call, turn } = setup(allElementsDeck());
    const original = bus.deck;
    await ok(call('element_update', { elementId: 'e_text', patch: { opacity: 0.9 } }));
    bus.dispatch(updateElement('s_all', 'e_image', { opacity: 0.3 }));
    await ok(call('element_update', { elementId: 'e_shape', patch: { opacity: 0.8 } }));

    expect(bus.undoStack.map((e) => e.actor)).toEqual([turn.actor, 'user', turn.actor]);
    // CMD-06: the warning says one edit of the user's goes too.
    expect(bus.transactionInfo(turn.txId)).toEqual({ steps: 3, otherEdits: 1 });
    // Ctrl+Z undoes the latest part of the turn only.
    bus.undo();
    expect(opacityOf(bus.deck, 'e_shape')).toBe(1);
    expect(opacityOf(bus.deck, 'e_image')).toBe(0.3);
    bus.redo();
    bus.undoTransaction(turn.txId);
    expect(bus.deck).toEqual(original);
    expect(bus.redoStack).toHaveLength(3);
  });

  it('sees a user deletion during the turn as a clear error, and keeps the turn intact', async () => {
    const { bus, call, turn } = setup(allElementsDeck());
    await ok(call('element_update', { elementId: 'e_text', patch: { opacity: 0.9 } }));
    bus.dispatch({ type: 'element.remove', slideId: 's_all', elementIds: ['e_image'] });
    const gone = await failed(
      call('element_update', { elementId: 'e_image', patch: { opacity: 0.5 } }),
    );
    expect(gone).toMatchObject({ code: 'not_found' });
    expect(gone.message).toMatch(/may have been deleted/);
    expect(bus.transactionInfo(turn.txId)).toEqual({ steps: 2, otherEdits: 1 });
  });

  it('leaves the deck alone when a call fails, so the turn stays one step', async () => {
    const { bus, call, turn } = setup(hebrewDeck());
    await ok(call('slide_update', { slideId: 's_he_hero', name: 'one' }));
    await failed(
      call('element_update', { elementId: 'e_he_hero_title', patch: { frame: { w: -5 } } }),
    );
    await ok(call('slide_update', { slideId: 's_he_goals', name: 'two' }));
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.transactionInfo(turn.txId)).toEqual({ steps: 1, otherEdits: 0 });
  });

  it("reports the user's edits to the session, not its own (CMD-08)", async () => {
    const { bus, call, turn } = setup(allElementsDeck());
    const digest = new ChangeDigest(bus);
    digest.track(turn.sessionId);
    await ok(call('element_update', { elementId: 'e_text', patch: { opacity: 0.9 } }));
    bus.dispatch(updateElement('s_all', 'e_image', { opacity: 0.3 }));
    expect(digest.take(turn.sessionId).elements).toEqual(['e_image']);
  });

  it('takes what the app adds to a write into the same step, and into the result', async () => {
    const bus = new CommandBus(hebrewDeck(), { validate: true });
    const asked: string[] = [];
    // An app that has something to do when the deck is turned: here, it renames a slide.
    const api = createDeckApi(
      bus,
      {},
      {
        follow: ({ deck, previous }) => {
          asked.push(`${previous.meta.dir} to ${deck.meta.dir}`);
          if (deck.meta.dir === previous.meta.dir) return [];
          return [
            { type: 'slide.update', slideId: 's_he_hero', patch: { name: `now ${deck.meta.dir}` } },
          ];
        },
      },
    );
    const turn = startTurn('sess', { kind: 'deck' });
    const data = await ok(
      api.call(turn, 'deck_apply_ops', { ops: [{ type: 'deck.setMeta', patch: { dir: 'ltr' } }] }),
    );
    expect(bus.deck.slides[0]!.name).toBe('now ltr');
    expect(data).toMatchObject({ changed: ['s_he_hero'], deck: ['meta'] });
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]!.commands).toEqual(['deck.setMeta', 'slide.update']);

    // It is asked about the write alone. The user turns the deck back while a call is on its
    // way: that is not the call's doing, and the write that comes after it turned nothing.
    bus.dispatch({ type: 'deck.setMeta', patch: { dir: 'rtl' } });
    await ok(api.call(turn, 'slide_update', { slideId: 's_he_goals', name: 'goals' }));
    await ok(api.call(turn, 'deck_get_outline', {}));
    expect(asked).toEqual(['rtl to ltr', 'rtl to rtl']);
    expect(bus.deck.slides[0]!.name).toBe('now ltr');
  });

  it('fits a group to its children after a write, in the same step, and says what it moved', async () => {
    const group = createElement.group({
      id: 'g',
      frame: { x: 200, y: 200, w: 300, h: 100 },
      children: [
        createElement.shape({ id: 'a', frame: { x: 0, y: 0, w: 100, h: 100 } }),
        createElement.shape({ id: 'b', frame: { x: 200, y: 0, w: 100, h: 100 } }),
      ],
    });
    const deck = createDeck({ slides: [createSlide({ id: 's_1', elements: [group] })] });
    const { bus, call, turn } = setup(deck);
    const frame = (id: string) => findElementInDeck(bus.deck, id)!.element.frame;
    const onSlide = (id: string) => frame('g').x + frame(id).x;

    // The agent read the slide: `a` at 0 and `b` at 200 inside a group at 200. It moves `a`
    // 50 to the left, which puts it outside the group's box.
    const first = await ok(
      call('element_update', { elementId: 'a', patch: { frame: { x: -50 } } }),
    );
    // The group took the child in: it moved, and with it the frame of every child, `b` too.
    expect(frame('g')).toMatchObject({ x: 150, w: 350 });
    expect(frame('a').x).toBe(0);
    expect(frame('b').x).toBe(250);
    // The result names all three, with the frames they have now: `b` is not where it was read.
    expect(first.changed).toEqual(['a', 'b', 'g']);
    expect(first.refitted).toEqual({
      g: { x: 150, y: 200, w: 350, h: 100 },
      a: { x: 0, y: 0, w: 100, h: 100 },
      b: { x: 250, y: 0, w: 100, h: 100 },
    });
    // One step of the turn, and nothing left for a fit that comes afterwards to do.
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.transactionInfo(turn.txId)).toEqual({ steps: 1, otherEdits: 0 });

    // From the frames it was given, the agent puts `b` where it means it: at 500 on the slide.
    const g = (first.refitted as Record<string, { x: number }>).g!;
    await ok(call('element_update', { elementId: 'b', patch: { frame: { x: 500 - g.x } } }));
    expect(onSlide('b')).toBe(500);

    // A write that leaves every group fitted reports no frames.
    const plain = await ok(call('element_update', { elementId: 'a', patch: { opacity: 0.5 } }));
    expect(plain).not.toHaveProperty('refitted');
    bus.undoTransaction(turn.txId);
    expect(bus.deck).toEqual(deck);
  });
});

describe('a turn belongs to the document it began on, and has an end', () => {
  /** A conversion that takes as long as the test says: the capture window at work. */
  function slowConversion() {
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const conversion: ConversionService = {
      async htmlToSlide() {
        calls++;
        await waiting;
        return { slide: createSlide({ id: 's_made' }), assets: [], editability: 1, notes: [] };
      },
      convertElement: () => Promise.reject(new Error('not in this test')),
    };
    return { conversion, release, calls: () => calls };
  }
  const anotherFile = () => createDeck({ slides: [createSlide({ id: 's_other' })] });

  it('a call that was running when another document was opened writes nothing into it', async () => {
    const slow = slowConversion();
    const { bus, call } = setup(hebrewDeck(), { conversion: slow.conversion });
    const pending = call('slide_create_from_html', { html: '<section>hello</section>' });
    await vi.waitFor(() => expect(slow.calls()).toBe(1));

    // File > New or Open: the bus now holds another deck.
    const other = anotherFile();
    bus.reset(other);
    slow.release();

    const refused = await failed(pending);
    expect(refused.code).toBe('invalid_state');
    expect(refused.message).toMatch(/^Nothing was written: the turn .* is over/);
    // The other file is exactly what was opened: no slide, and no step of a turn it never had.
    expect(bus.deck).toBe(other);
    expect(bus.undoStack).toEqual([]);
  });

  it('stays with its document: a later call of the turn is not run on the next one', async () => {
    const harness = setup(hebrewDeck());
    const { bus, call } = harness;
    await ok(call('slide_update', { slideId: 's_he_hero', name: 'one' }));
    // The same file opened again: the same ids, and still another document.
    const again = hebrewDeck();
    bus.reset(again);
    const write = await failed(call('slide_update', { slideId: 's_he_hero', name: 'two' }));
    expect(write.message).toMatch(/^slide_update was not run: the turn .* is over/);
    expect((await failed(call('deck_get_outline'))).code).toBe('invalid_state');
    expect(bus.deck).toBe(again);
    // A turn that begins on the new document is that document's.
    harness.nextTurn();
    await ok(call('slide_update', { slideId: 's_he_hero', name: 'two' }));
    expect(bus.deck.slides[0]!.name).toBe('two');
  });

  it('writes nothing once it has ended, also from a call that was already running', async () => {
    const slow = slowConversion();
    const { bus, api } = setup(hebrewDeck(), { conversion: slow.conversion });
    const ended = { aborted: false };
    const turn = startTurn('sess', { kind: 'deck' }, { ended });
    await ok(api.call(turn, 'slide_update', { slideId: 's_he_hero', name: 'one' }));
    const pending = api.call(turn, 'slide_create_from_html', { html: '<section>hi</section>' });
    await vi.waitFor(() => expect(slow.calls()).toBe(1));
    const before = bus.deck;

    // The user stops the turn; the harness gives the call up and the app goes on converting.
    ended.aborted = true;
    slow.release();

    expect((await failed(pending)).message).toMatch(/^Nothing was written/);
    expect(bus.deck).toBe(before);
    // What the turn wrote while it ran is still its one undo step.
    expect(bus.undoStack.map((entry) => entry.commands)).toEqual([['slide.update']]);
    expect((await failed(api.call(turn, 'deck_get_outline', {}))).message).toMatch(/was not run/);
  });

  it('tells a tool that works in pieces that it was given up', async () => {
    let release!: () => void;
    const captured = new Promise<void>((resolve) => {
      release = resolve;
    });
    let captures = 0;
    const importer: HtmlImportService = {
      inspect: () => Promise.resolve(''),
      evaluate: () => Promise.resolve(''),
      screenshot: () => Promise.reject(new Error('not in this test')),
      setViewport: () => Promise.resolve(''),
      capture: async () => {
        captures++;
        await captured;
        return {
          slide: createSlide({ id: `s_captured_${captures}` }),
          assets: [],
          editability: 1,
          textEditability: 1,
          faithful: true,
          exact: true,
          wholeSlideHtml: false,
          source: { width: 1920, height: 1080 },
          notes: [],
        };
      },
    };
    const scope = { kind: 'import', file: 'deck.html' } as const;
    const { bus, api } = setup(hebrewDeck(), { importer }, scope);
    const ended = { aborted: false };
    const turn = startTurn('sess', scope, { ended });
    const pending = api.call(turn, 'import_capture', {
      slides: [{ selector: '#one' }, { selector: '#two' }, { selector: '#three' }],
    });
    await vi.waitFor(() => expect(captures).toBe(1));
    const before = bus.deck;
    ended.aborted = true;
    release();

    // An importer that has no signal of its own stops all the same: the slide the page was
    // working on stays out, and no further one is started.
    const data = await ok(pending);
    expect(data.notCaptured).toMatch(/The turn was stopped: the last 3 of this call/);
    expect(captures).toBe(1);
    expect(bus.deck).toBe(before);
  });
});
