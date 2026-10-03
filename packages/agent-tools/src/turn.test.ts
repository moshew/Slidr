import { ChangeDigest, findElementInDeck, updateElement, type Deck } from '@slidr/model';
import { allElementsDeck, hebrewDeck } from '@slidr/model/fixtures';
import { describe, expect, it } from 'vitest';
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
});
