/**
 * The turns of the agent that were undone (CHT-U04): what "Changes undone" under a turn goes
 * by. It is taken from the undo itself, as the bus reports it, and not from the turn being
 * absent from the undo history: a turn leaves the history also when two hundred later steps
 * push it out, and when the deck is opened again, and neither undid anything.
 */
import type { CommandBus } from '@slidr/model';
import { createStore, type StoreApi } from 'zustand/vanilla';

export interface UndoneTurns {
  /** The transactions of turns whose changes are undone now. */
  turns: ReadonlySet<string>;
}

export function createUndoneTurns(bus: CommandBus): StoreApi<UndoneTurns> {
  const store = createStore<UndoneTurns>(() => ({ turns: new Set() }));
  const set = (change: (turns: Set<string>) => void) => {
    const turns = new Set(store.getState().turns);
    change(turns);
    store.setState({ turns });
  };
  bus.subscribe(({ kind, txId }) => {
    const { turns } = store.getState();
    if (kind === 'reset') {
      // Another deck, with a history of its own: nothing in it was undone here.
      if (turns.size > 0) store.setState({ turns: new Set() });
    } else if (kind === 'undo' && txId !== undefined) {
      // A turn may be several steps of the history, with the user's own between them: it is
      // undone once the last of them is.
      if (!turns.has(txId) && !bus.transactionInfo(txId)) set((all) => all.add(txId));
    } else if (kind === 'redo' && txId !== undefined) {
      if (turns.has(txId)) set((all) => all.delete(txId));
    }
  });
  return store;
}
