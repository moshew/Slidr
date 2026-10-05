import { CommandBus, createDeck, createSlide } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { createUndoneTurns } from './undone';

/*
 * Which turns of the agent were undone: what "Changes undone" under a turn goes by. The bug
 * hunt's `ai-ui.md`, finding 5: it went by the turn having left the undo history, which also
 * happens to a turn nobody undid.
 */

const TURN = 'tx_turn';

function setup() {
  const bus = new CommandBus(createDeck({ slides: [createSlide({ id: 's_1' })] }));
  const undone = createUndoneTurns(bus);
  /** A write of the agent's turn: a slide it adds. */
  const write = (id: string) =>
    bus.dispatch(
      { type: 'slide.add', slide: createSlide({ id }) },
      { actor: 'agent:k:t', txId: TURN },
    );
  /** An edit of the user's, a step of its own. */
  const edit = (title: string) => bus.dispatch({ type: 'deck.setMeta', patch: { title } });
  return { bus, write, edit, isUndone: () => undone.getState().turns.has(TURN) };
}

describe('a turn of the agent is undone', () => {
  it('when its changes are undone, and no longer once they are redone', () => {
    const { bus, write, isUndone } = setup();
    write('s_made');
    expect(isUndone()).toBe(false);
    bus.undoTransaction(TURN);
    expect(bus.deck.slides.map((slide) => slide.id)).toEqual(['s_1']);
    expect(isUndone()).toBe(true);
    bus.redo();
    expect(isUndone()).toBe(false);
    // Ctrl+Z is an undo like the button's.
    bus.undo();
    expect(isUndone()).toBe(true);
  });

  it('not when later steps push it out of the history', () => {
    const { bus, write, edit, isUndone } = setup();
    write('s_made');
    // The history keeps 200 steps.
    for (let i = 0; i < 200; i++) edit(`title ${i}`);
    expect(bus.transactionInfo(TURN)).toBeUndefined();
    expect(bus.deck.slides.map((slide) => slide.id)).toEqual(['s_1', 's_made']);
    expect(isUndone()).toBe(false);
  });

  it('not when another deck is opened, or the same one again, also after a real undo', () => {
    const { bus, write, isUndone } = setup();
    write('s_made');
    bus.reset(bus.deck);
    expect(bus.transactionInfo(TURN)).toBeUndefined();
    expect(isUndone()).toBe(false);

    write('s_again');
    bus.undo();
    expect(isUndone()).toBe(true);
    // The deck that is opened has no turn of this window undone in it.
    bus.reset(bus.deck);
    expect(isUndone()).toBe(false);
  });

  it('only once all of it is: a turn may be several steps, with an edit of the user between', () => {
    const { bus, write, edit, isUndone } = setup();
    write('s_first');
    edit('In between');
    write('s_second');
    expect(bus.transactionInfo(TURN)).toEqual({ steps: 3, otherEdits: 1 });
    bus.undo();
    expect(isUndone()).toBe(false);
    bus.undo();
    bus.undo();
    expect(isUndone()).toBe(true);
    bus.redo();
    expect(isUndone()).toBe(false);
  });
});
