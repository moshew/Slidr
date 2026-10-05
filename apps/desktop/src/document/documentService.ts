import {
  loadDeck,
  migrations,
  prepareForSave,
  type AssetMeta,
  type CommandBus,
  type Deck,
  type LoadedDeck,
  type Migration,
} from '@slidr/model';
import type {
  ImportedAsset,
  OpenedDeck,
  RecoverableWorkspace,
  SavedDeck,
  Storage,
  Workspace,
} from './storage';

export interface DocumentServiceOptions {
  /** Quiet time after the last change before the workspace is written (DOC-03). */
  autosaveDelayMs?: number;
  /**
   * An autosave that failed. The deck in memory is intact, and the write is tried again: with
   * the next change, or after `autosaveRetryMs` without one.
   */
  onAutosaveError?: (error: unknown) => void;
  /** The workspace has the deck again: an autosave, or a save, went through. */
  onAutosaved?: () => void;
  /** How long after a failed autosave the next try comes, when no change brings one sooner. */
  autosaveRetryMs?: number;
  /** Schema migrations; the model's own by default. */
  migrations?: Record<number, Migration>;
}

/**
 * Asked at the last moment before a document replaces the open one: false keeps the open one.
 * Getting a document ready takes time (a workspace is made, a file is unpacked), and the deck
 * goes on changing through it: the agent's turn does not wait. Nothing is awaited between the
 * answer and the replacement, so the deck that was answered for is the deck that is replaced.
 */
export type ReplaceGuard = () => Promise<boolean>;

/**
 * The open document: which file and workspace the deck in the bus belongs to, whether it has
 * unsaved changes, and the new / open / save / save-as / recover flows (DOC-01..05). It knows
 * nothing of menus and dialogs; the shell asks for paths and calls in.
 */
export class DocumentService {
  readonly bus: CommandBus;
  readonly #storage: Storage;
  readonly #autosaveDelayMs: number;
  readonly #onAutosaveError: (error: unknown) => void;
  readonly #onAutosaved: () => void;
  readonly #autosaveRetryMs: number;
  readonly #migrations: Record<number, Migration>;
  #workspace: Workspace | null = null;
  #revision = 0;
  #savedRevision = 0;
  #autosavedRevision = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** Storage calls run one at a time, so an older autosave never lands after a newer save. */
  #queue: Promise<void> = Promise.resolve();

  constructor(storage: Storage, bus: CommandBus, options: DocumentServiceOptions = {}) {
    this.#storage = storage;
    this.bus = bus;
    this.#autosaveDelayMs = options.autosaveDelayMs ?? 3000;
    this.#onAutosaveError = options.onAutosaveError ?? ((error) => console.error(error));
    this.#onAutosaved = options.onAutosaved ?? (() => undefined);
    this.#autosaveRetryMs = options.autosaveRetryMs ?? 15_000;
    this.#migrations = options.migrations ?? migrations;
    bus.subscribe((event) => {
      if (event.kind === 'reset') return;
      this.#revision++;
      this.#scheduleAutosave();
    });
  }

  get workspace(): Workspace | null {
    return this.#workspace;
  }

  /** The `.slidr` file, or null for a deck that was never saved. */
  get path(): string | null {
    return this.#workspace?.sourcePath ?? null;
  }

  /** There are changes that are not in the `.slidr` file. */
  get dirty(): boolean {
    return this.#revision !== this.#savedRevision;
  }

  /**
   * Starts a new, unsaved document with the given deck. False when `mayReplace` kept the open
   * document instead.
   */
  async create(deck: Deck, mayReplace?: ReplaceGuard): Promise<boolean> {
    const workspace = await this.#storage.create();
    if (mayReplace && !(await mayReplace())) {
      await this.#discard(workspace.id);
      return false;
    }
    this.#replace(workspace, deck, false);
    return true;
  }

  /**
   * Opens a `.slidr` file. A file from an older version is migrated, after a copy of the
   * original is put aside (DOC-04). `kept` when `mayReplace` kept the open document instead.
   */
  async open(
    path: string,
    mayReplace?: ReplaceGuard,
  ): Promise<{ migratedFrom?: number; kept?: true }> {
    const opened = await this.#storage.open(path);
    // The file itself is untouched, so a workspace that fails to load can simply go.
    const loaded = await this.#load(opened, true);
    if (loaded.migratedFrom !== undefined) {
      try {
        await this.#storage.backup(path, `v${loaded.migratedFrom}`);
      } catch (error) {
        // Without the copy the file is not migrated, and its workspace has no document.
        await this.#discard(opened.workspace.id);
        throw error;
      }
    }
    if (mayReplace && !(await mayReplace())) {
      await this.#discard(opened.workspace.id);
      return { kept: true };
    }
    this.#replace(opened.workspace, loaded.deck, false);
    return loaded.migratedFrom === undefined ? {} : { migratedFrom: loaded.migratedFrom };
  }

  /** Workspaces with unsaved changes that a crash left behind. */
  listRecoverable(): Promise<RecoverableWorkspace[]> {
    return this.#storage.listRecoverable();
  }

  /** Reopens a workspace a crash left behind. Its changes count as unsaved. */
  async recover(workspaceId: string): Promise<void> {
    const opened = await this.#storage.recover(workspaceId);
    // A leftover that fails to load is the only copy of that work: never delete it here.
    const { deck } = await this.#load(opened, false);
    this.#replace(opened.workspace, deck, true);
  }

  /** Discards a workspace a crash left behind. */
  discardRecoverable(workspaceId: string): Promise<void> {
    return this.#storage.close(workspaceId);
  }

  /** Saves to the document's file. A deck that was never saved needs `saveAs`. */
  save(): Promise<SavedDeck> {
    const path = this.path;
    if (!path) return Promise.reject(new Error('The deck has no file yet; use saveAs.'));
    return this.saveAs(path);
  }

  /**
   * Saves to a file, which becomes the document's file. The result lists assets the deck refers
   * to that the workspace does not have; the file is written without them.
   */
  async saveAs(path: string): Promise<SavedDeck> {
    const workspace = this.#requireWorkspace();
    this.#cancelAutosave();
    const revision = this.#revision;
    const deck = prepareForSave(this.bus.deck);
    const deckJson = JSON.stringify(deck);
    let saved: SavedDeck;
    try {
      saved = await this.#enqueue(() =>
        this.#storage.save(workspace.id, path, deckJson, deck.meta.title),
      );
    } catch (error) {
      // The save was to write the workspace as well, so the autosave was put off for it. A save
      // that is refused before it got there (a full disk) leaves the change in memory alone:
      // the autosave is owed again, and reports for itself if it cannot write either.
      if (this.#workspace?.id === workspace.id && this.#revision !== this.#autosavedRevision) {
        this.#scheduleAutosave();
      }
      throw error;
    }
    if (this.#workspace?.id === workspace.id) {
      this.#workspace = { ...this.#workspace, sourcePath: saved.path };
      this.#savedRevision = revision;
      this.#autosavedRevision = Math.max(this.#autosavedRevision, revision);
      // A save writes the workspace first: whatever kept the autosave from writing is over.
      this.#onAutosaved();
    }
    return saved;
  }

  /** Writes pending changes to the workspace now instead of after the quiet time. */
  async flush(): Promise<void> {
    this.#cancelAutosave();
    const workspace = this.#workspace;
    if (!workspace || this.#revision === this.#autosavedRevision) return;
    const revision = this.#revision;
    const deck = this.bus.deck;
    await this.#enqueue(() =>
      this.#storage.writeDeck(workspace.id, JSON.stringify(deck), deck.meta.title),
    );
    if (this.#workspace?.id === workspace.id) {
      this.#autosavedRevision = Math.max(this.#autosavedRevision, revision);
    }
  }

  /** Closes the document and deletes its workspace. Unsaved changes are lost: ask first. */
  async close(): Promise<void> {
    this.#cancelAutosave();
    const workspace = this.#workspace;
    this.#workspace = null;
    if (workspace) await this.#enqueue(() => this.#storage.close(workspace.id));
  }

  /**
   * Stores a file in the workspace and returns its entry for the asset table. The caller
   * dispatches `asset.add` in the same transaction as the element that uses it.
   */
  async importAssetFile(path: string, origin: AssetMeta['origin'] = 'upload'): Promise<AssetMeta> {
    const workspace = this.#requireWorkspace();
    const imported = await this.#storage.importAssetFile(workspace.id, path);
    return toAssetMeta(imported, origin, path.split(/[\\/]/).at(-1));
  }

  async importAssetBytes(
    name: string,
    bytes: Uint8Array,
    origin: AssetMeta['origin'] = 'upload',
  ): Promise<AssetMeta> {
    const workspace = this.#requireWorkspace();
    const imported = await this.#storage.importAssetBytes(workspace.id, name, bytes);
    return toAssetMeta(imported, origin, name);
  }

  async #load(opened: OpenedDeck, discardOnFailure: boolean): Promise<LoadedDeck> {
    try {
      return loadDeck(JSON.parse(opened.deckJson), this.#migrations);
    } catch (error) {
      if (discardOnFailure) await this.#discard(opened.workspace.id);
      throw error;
    }
  }

  /**
   * Deletes a workspace the window has no more use for: one made for a document that did not
   * come to be, or the one of the document that was just replaced. A folder that cannot be
   * deleted now (Windows still holds a file of it) is nothing to the open deck, and nothing
   * the user can act on: it is logged, and the next start sweeps it.
   */
  async #discard(workspaceId: string): Promise<void> {
    try {
      await this.#storage.close(workspaceId);
    } catch (error) {
      console.warn('A workspace that is no longer needed could not be deleted', error);
    }
  }

  #replace(workspace: Workspace, deck: Deck, unsaved: boolean): void {
    const previous = this.#workspace;
    this.#cancelAutosave();
    this.#workspace = workspace;
    this.bus.reset(deck);
    this.#revision = unsaved ? 1 : 0;
    this.#savedRevision = 0;
    this.#autosavedRevision = this.#revision;
    if (previous && previous.id !== workspace.id) {
      // In the queue, after whatever was still being written to it. Not through the autosave's
      // error: that one tells the user the deck in front of them is not being kept.
      void this.#enqueue(() => this.#discard(previous.id));
    }
  }

  #requireWorkspace(): Workspace {
    if (!this.#workspace) throw new Error('No document is open.');
    return this.#workspace;
  }

  #scheduleAutosave(delayMs: number = this.#autosaveDelayMs): void {
    if (!this.#workspace) return;
    this.#cancelAutosave();
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.flush().then(this.#onAutosaved, (error: unknown) => {
        this.#onAutosaveError(error);
        // The change is still in memory alone, and a disk that was full may have room by now:
        // the write is tried again without waiting for the user to change something.
        this.#scheduleAutosave(this.#autosaveRetryMs);
      });
    }, delayMs);
  }

  #cancelAutosave(): void {
    if (this.#timer !== undefined) clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(task, task);
    this.#queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function toAssetMeta(
  imported: ImportedAsset,
  origin: AssetMeta['origin'],
  name: string | undefined,
): AssetMeta {
  return { ...imported, origin, ...(name ? { name } : {}) };
}
