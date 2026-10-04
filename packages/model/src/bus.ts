import { enablePatches, freeze, produce, produceWithPatches, type Patch } from 'immer';
import { z } from 'zod';
import {
  commandDefs,
  CommandError,
  mergeAffected,
  Touched,
  type Actor,
  type Affected,
  type Command,
  type CommandType,
} from './commands';
import { Deck } from './schema';

enablePatches();

export interface DispatchOptions {
  /** Who is making the change. Defaults to the user. */
  actor?: Actor;
  /**
   * Changes that share a transaction id are one undo step (CMD-03): a drag, a burst of typing,
   * a whole agent turn. Take a fresh id from `newId('tx')` for each such unit.
   */
  txId?: string;
  /** Shown in the history list. */
  label?: string;
}

/** One undo step. */
export interface HistoryEntry {
  readonly id: number;
  readonly actor: Actor;
  readonly txId?: string;
  readonly label?: string;
  readonly commands: readonly CommandType[];
  readonly affected: Affected;
  /** Time of the last change in the step, in epoch milliseconds. */
  readonly at: number;
  readonly patches: readonly Patch[];
  readonly inversePatches: readonly Patch[];
}

interface Entry extends HistoryEntry {
  commands: CommandType[];
  affected: Affected;
  at: number;
  patches: Patch[];
  inversePatches: Patch[];
}

export interface ChangeEvent {
  /** `rollback` is an undo that leaves nothing to redo. `reset` is a different deck altogether. */
  kind: 'apply' | 'undo' | 'redo' | 'rollback' | 'reset';
  deck: Deck;
  previous: Deck;
  /** The patches that turn `previous` into `deck`. Empty for `reset`. */
  patches: readonly Patch[];
  affected: Affected;
  actor: Actor;
  txId?: string;
}

export type ChangeListener = (event: ChangeEvent) => void;

export interface CommandBusOptions {
  /** Undo steps kept. Older ones are dropped. */
  historyLimit?: number;
  /** Re-validates the whole deck after every change. For tests: it is slow on a large deck. */
  validate?: boolean;
  /** Receives what a subscriber throws. By default it surfaces as an unhandled rejection. */
  onListenerError?: (error: unknown) => void;
}

type Apply = (deck: Deck, command: Command, touched: Touched) => void;

/** A node of the deck on the way to where a patch applies: an object, or a list. */
type Node = Record<string | number, unknown>;

/**
 * Applies the patches of a history entry: what immer's `applyPatches` does, without copying
 * the values. immer copies every value a patch carries, deeply, in case it is changed later.
 * The values here are parts of earlier states of the deck, which are frozen, so they are put
 * back as they are. That matters where a list shifts: a slide added in the middle of a deck is
 * a patch for every slide after it, and copying them made undo in a deck of 200 slides take
 * 12 ms and hand the editor 200 slides it had never seen (NFR-03, ADR-066). Shared, each slide
 * that did not change is the object it was.
 */
function applyHistoryPatches(deck: Deck, patches: readonly Patch[]): Deck {
  return produce(deck, (draft) => {
    for (const patch of patches) {
      const { op, path } = patch;
      const value: unknown = patch.value;
      const key = path.at(-1);
      // The command bus never replaces the deck itself, so every patch has a place inside it.
      if (key === undefined) throw new Error('A history patch must point inside the deck.');
      let parent = draft as unknown as Node;
      for (const step of path.slice(0, -1)) parent = parent[step] as Node;
      if (Array.isArray(parent)) {
        const list = parent as unknown[];
        if (op === 'remove') list.splice(Number(key), 1);
        else if (op === 'add' && key === '-') list.push(value);
        else if (op === 'add') list.splice(Number(key), 0, value);
        // `length` too: that is how a list that got shorter is written.
        else parent[key] = value;
      } else if (op === 'remove') {
        delete parent[key];
      } else {
        parent[key] = value;
      }
    }
  });
}

function parseCommand(input: Command): Command {
  const type: unknown = (input as { type?: unknown } | null)?.type;
  if (typeof type !== 'string' || !Object.hasOwn(commandDefs, type)) {
    throw new CommandError('unknown_command', `Unknown command type: ${JSON.stringify(type)}.`);
  }
  const parsed = commandDefs[type as CommandType].schema.safeParse(input);
  if (!parsed.success) {
    throw new CommandError('invalid_payload', `${type}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/**
 * The only way to change a deck (SPEC ch. 6). Validates each command, applies it, records an
 * undo step and tells the subscribers. The deck it holds is immutable: every change makes a
 * new one that shares the untouched parts.
 */
export class CommandBus {
  #deck: Deck;
  #undo: Entry[] = [];
  #redo: Entry[] = [];
  #nextEntryId = 1;
  readonly #listeners = new Set<ChangeListener>();
  readonly #historyLimit: number;
  readonly #validate: boolean;
  readonly #onListenerError: (error: unknown) => void;

  constructor(deck: Deck, options: CommandBusOptions = {}) {
    this.#deck = freeze(deck, true);
    this.#historyLimit = options.historyLimit ?? 200;
    this.#validate = options.validate ?? false;
    this.#onListenerError =
      options.onListenerError ??
      ((error) => {
        void Promise.reject(error instanceof Error ? error : new Error(String(error)));
      });
  }

  get deck(): Deck {
    return this.#deck;
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  /** Oldest first: the last entry is the next one to undo. */
  get undoStack(): readonly HistoryEntry[] {
    return this.#undo;
  }

  /** The last entry is the next one to redo. */
  get redoStack(): readonly HistoryEntry[] {
    return this.#redo;
  }

  /** Applies one command. Throws `CommandError`, leaving the deck as it was. */
  dispatch(command: Command, options: DispatchOptions = {}): Affected {
    return this.batch([command], options);
  }

  /** Applies several commands as one change: all of them, or none if one is rejected. */
  batch(commands: readonly Command[], options: DispatchOptions = {}): Affected {
    let deck = this.#deck;
    const patches: Patch[] = [];
    const inversePatches: Patch[] = [];
    const types: CommandType[] = [];
    const touched = new Touched();

    for (const input of commands) {
      const command = parseCommand(input);
      const apply = commandDefs[command.type].apply as Apply;
      const [next, forward, backward] = produceWithPatches(deck, (draft) => {
        apply(draft, command, touched);
      });
      deck = next;
      patches.push(...forward);
      inversePatches.unshift(...backward);
      types.push(command.type);
    }

    const affected = touched.toAffected();
    if (patches.length === 0) return affected;
    if (this.#validate) {
      const check = Deck.safeParse(deck);
      if (!check.success) {
        throw new CommandError(
          'invalid_payload',
          `${types.join(', ')} left the deck invalid:\n${z.prettifyError(check.error)}`,
        );
      }
    }

    const actor = options.actor ?? 'user';
    const top = this.#undo.at(-1);
    if (options.txId !== undefined && top?.txId === options.txId && top.actor === actor) {
      top.patches.push(...patches);
      top.inversePatches.unshift(...inversePatches);
      top.commands.push(...types);
      top.affected = mergeAffected(top.affected, affected);
      top.at = Date.now();
    } else {
      this.#undo.push({
        id: this.#nextEntryId++,
        actor,
        txId: options.txId,
        label: options.label,
        commands: types,
        affected,
        at: Date.now(),
        patches,
        inversePatches,
      });
      if (this.#undo.length > this.#historyLimit) this.#undo.shift();
    }
    this.#redo = [];

    this.#commit('apply', deck, patches, affected, actor, options.txId);
    return affected;
  }

  /** Undoes the last step. Returns false when there is nothing to undo. */
  undo(): boolean {
    const entry = this.#undo.pop();
    if (!entry) return false;
    this.#redo.push(entry);
    this.#revert('undo', entry, 'user');
    return true;
  }

  /** Redoes the step undone last. A new change empties the redo stack. */
  redo(): boolean {
    const entry = this.#redo.pop();
    if (!entry) return false;
    this.#undo.push(entry);
    const deck = applyHistoryPatches(this.#deck, entry.patches);
    this.#commit('redo', deck, entry.patches, entry.affected, 'user', entry.txId);
    return true;
  }

  /**
   * Abandons a transaction: reverts its changes and leaves no trace in the history. Works
   * while the transaction is the latest change (a cancelled drag); returns false otherwise.
   */
  rollback(txId: string): boolean {
    let reverted = false;
    for (;;) {
      const entry = this.#undo.at(-1);
      if (entry?.txId !== txId) return reverted;
      this.#undo.pop();
      this.#revert('rollback', entry, entry.actor);
      reverted = true;
    }
  }

  /**
   * What undoing a whole transaction would take (CMD-06): `steps` undo steps, of which
   * `otherEdits` are changes made outside the transaction since it began. Undefined when the
   * transaction is not on the undo stack.
   */
  transactionInfo(txId: string): { steps: number; otherEdits: number } | undefined {
    const first = this.#undo.findIndex((e) => e.txId === txId);
    if (first < 0) return undefined;
    const steps = this.#undo.slice(first);
    return { steps: steps.length, otherEdits: steps.filter((e) => e.txId !== txId).length };
  }

  /**
   * Undoes a transaction and everything done after it began, e.g. a whole agent turn. The
   * steps go to the redo stack. Returns false when the transaction is not on the undo stack.
   */
  undoTransaction(txId: string): boolean {
    const first = this.#undo.findIndex((e) => e.txId === txId);
    if (first < 0) return false;
    while (this.#undo.length > first) this.undo();
    return true;
  }

  /** Replaces the deck, e.g. after opening a file. The history starts empty. */
  reset(deck: Deck): void {
    this.#undo = [];
    this.#redo = [];
    const affected = new Touched().toAffected();
    this.#commit('reset', freeze(deck, true), [], affected, 'user', undefined);
  }

  subscribe(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #revert(kind: 'undo' | 'rollback', entry: Entry, actor: Actor): void {
    const deck = applyHistoryPatches(this.#deck, entry.inversePatches);
    this.#commit(kind, deck, entry.inversePatches, entry.affected, actor, entry.txId);
  }

  #commit(
    kind: ChangeEvent['kind'],
    deck: Deck,
    patches: readonly Patch[],
    affected: Affected,
    actor: Actor,
    txId: string | undefined,
  ): void {
    const previous = this.#deck;
    this.#deck = deck;
    const event: ChangeEvent = { kind, deck, previous, patches, affected, actor, txId };
    for (const listener of [...this.#listeners]) {
      try {
        listener(event);
      } catch (error) {
        // The change is already made; a failing subscriber must not look like a failed command.
        this.#onListenerError(error);
      }
    }
  }
}
