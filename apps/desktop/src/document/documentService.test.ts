// @vitest-environment happy-dom
import {
  CommandBus,
  createDeck,
  DeckLoadError,
  SCHEMA_VERSION,
  updateElement,
  type Deck,
} from '@slidr/model';
import { allElementsDeck, hebrewDeck } from '@slidr/model/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentService } from './documentService';
import { failureKind } from './failures';
import { StorageError, type OpenedDeck, type Storage, type Workspace } from './storage';

const titleIn = (deckJson: string | null | undefined) =>
  (JSON.parse(deckJson ?? 'null') as Deck).meta.title;

/** The storage contract in memory: files are strings, a workspace remembers its deck. */
class FakeStorage implements Storage {
  files = new Map<string, string>();
  workspaces = new Map<
    string,
    Workspace & { deckJson: string | null; dirty: boolean; title: string }
  >();
  backups: string[] = [];
  log: string[] = [];
  #next = 1;

  create() {
    const id = `w${this.#next++}`;
    const workspace = { id, dir: `/app/workspaces/${id}`, sourcePath: null };
    this.workspaces.set(id, { ...workspace, deckJson: null, dirty: false, title: '' });
    this.log.push(`create ${id}`);
    return Promise.resolve(workspace);
  }

  async open(path: string): Promise<OpenedDeck> {
    const deckJson = this.files.get(path);
    if (deckJson === undefined) throw new StorageError('not_found', path);
    const { id, dir } = await this.create();
    this.workspaces.set(id, { id, dir, sourcePath: path, deckJson, dirty: false, title: '' });
    this.log.push(`open ${path}`);
    return { workspace: { id, dir, sourcePath: path }, deckJson, metaJson: null };
  }

  writeDeck(workspaceId: string, deckJson: string, title: string) {
    const ws = this.#ws(workspaceId);
    Object.assign(ws, { deckJson, title, dirty: true });
    this.log.push(`write ${workspaceId}`);
    return Promise.resolve();
  }

  save(workspaceId: string, path: string, deckJson: string, title: string) {
    const ws = this.#ws(workspaceId);
    Object.assign(ws, { deckJson, title, dirty: false, sourcePath: path });
    this.files.set(path, deckJson);
    this.log.push(`save ${workspaceId} ${path}`);
    return Promise.resolve({ path, missingAssets: [] });
  }

  close(workspaceId: string) {
    this.workspaces.delete(workspaceId);
    this.log.push(`close ${workspaceId}`);
    return Promise.resolve();
  }

  listRecoverable() {
    return Promise.resolve(
      [...this.workspaces.values()]
        .filter((w) => w.dirty)
        .map((w) => ({ id: w.id, sourcePath: w.sourcePath, title: w.title, autosavedAt: null })),
    );
  }

  recover(workspaceId: string) {
    const ws = this.#ws(workspaceId);
    return Promise.resolve({
      workspace: { id: ws.id, dir: ws.dir, sourcePath: ws.sourcePath },
      deckJson: ws.deckJson ?? '',
      metaJson: null,
    });
  }

  backup(path: string, tag: string) {
    const copy = `${path}.${tag}.bak`;
    this.backups.push(copy);
    return Promise.resolve(copy);
  }

  importAssetFile() {
    return Promise.resolve({
      id: 'a'.repeat(64),
      file: `${'a'.repeat(64)}.png`,
      mime: 'image/png',
      kind: 'image' as const,
      bytes: 3,
      width: 2,
      height: 1,
    });
  }

  importAssetBytes() {
    return this.importAssetFile();
  }

  listRecents() {
    return Promise.resolve([]);
  }

  removeRecent() {
    return Promise.resolve();
  }

  #ws(id: string) {
    const ws = this.workspaces.get(id);
    if (!ws) throw new StorageError('unknown_workspace', id);
    return ws;
  }
}

const rename = (title: string) => ({ type: 'deck.setMeta' as const, patch: { title } });

describe('DocumentService', () => {
  let storage: FakeStorage;
  let service: DocumentService;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = new FakeStorage();
    service = new DocumentService(storage, new CommandBus(createDeck()), { autosaveDelayMs: 1000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an unsaved document that needs a path to save', async () => {
    await service.create(hebrewDeck());
    expect(service.bus.deck).toEqual(hebrewDeck());
    expect(service.path).toBeNull();
    expect(service.dirty).toBe(false);
    await expect(service.save()).rejects.toThrow(/saveAs/);
  });

  it('saves, then opens the same deck again (DOC-01)', async () => {
    await service.create(allElementsDeck());
    service.bus.dispatch(rename('Saved'));
    expect(service.dirty).toBe(true);
    await service.saveAs('C:/decks/a.slidr');
    expect(service.dirty).toBe(false);
    expect(service.path).toBe('C:/decks/a.slidr');

    const other = new DocumentService(storage, new CommandBus(createDeck()));
    await other.open('C:/decks/a.slidr');
    const { assets: savedAssets, meta: savedMeta, ...saved } = other.bus.deck;
    const { assets, meta, ...current } = service.bus.deck;
    expect(saved).toEqual(current);
    expect(savedMeta.title).toBe('Saved');
    // The unused asset is not written to the file.
    expect(Object.keys(savedAssets).length).toBe(Object.keys(assets).length - 1);
    expect(meta.title).toBe('Saved');
  });

  it('writes the workspace a few seconds after the last change (DOC-03)', async () => {
    await service.create(hebrewDeck());
    const id = service.workspace!.id;
    service.bus.dispatch(rename('1'));
    await vi.advanceTimersByTimeAsync(500);
    service.bus.dispatch(rename('2'));
    await vi.advanceTimersByTimeAsync(900);
    expect(storage.log.filter((l) => l.startsWith('write'))).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(storage.log.filter((l) => l.startsWith('write'))).toEqual([`write ${id}`]);
    expect(titleIn(storage.workspaces.get(id)?.deckJson)).toBe('2');
    // Autosave keeps the work safe but does not save the file.
    expect(service.dirty).toBe(true);
  });

  it('does not autosave a deck that has not changed', async () => {
    await service.create(hebrewDeck());
    await vi.advanceTimersByTimeAsync(5000);
    await service.flush();
    expect(storage.log.some((l) => l.startsWith('write'))).toBe(false);
  });

  it('recovers a workspace that a crash left with unsaved changes', async () => {
    await service.create(hebrewDeck());
    service.bus.dispatch(updateElement('s_he_hero', 'e_he_hero_title', { opacity: 0.5 }));
    await vi.advanceTimersByTimeAsync(1000);
    // The app dies here: the workspace stays on disk, marked dirty.

    const restarted = new DocumentService(storage, new CommandBus(createDeck()));
    const [left] = await restarted.listRecoverable();
    expect(left).toBeDefined();
    await restarted.recover(left!.id);
    expect(restarted.bus.deck).toEqual(service.bus.deck);
    expect(restarted.dirty).toBe(true);
  });

  it('closes the previous workspace when another document opens', async () => {
    storage.files.set('C:/b.slidr', JSON.stringify(hebrewDeck()));
    await service.create(hebrewDeck());
    const first = service.workspace!.id;
    await service.open('C:/b.slidr');
    await service.flush();
    expect(storage.workspaces.has(first)).toBe(false);
    expect(service.bus.canUndo).toBe(false);
  });

  it('migrates an old file after putting a copy aside (DOC-04)', async () => {
    const old = SCHEMA_VERSION - 1;
    storage.files.set('C:/old.slidr', JSON.stringify({ ...hebrewDeck(), schemaVersion: old }));
    const migrating = new DocumentService(storage, new CommandBus(createDeck()), {
      migrations: { [old]: (deck) => deck },
    });
    expect(await migrating.open('C:/old.slidr')).toEqual({ migratedFrom: old });
    expect(storage.backups).toEqual([`C:/old.slidr.v${old}.bak`]);
    expect(migrating.bus.deck).toEqual(hebrewDeck());

    // Without the migration the file is refused, and no workspace is left behind.
    await expect(service.open('C:/old.slidr')).rejects.toBeInstanceOf(DeckLoadError);
    expect([...storage.workspaces.values()].map((w) => w.sourcePath)).toEqual(['C:/old.slidr']);
  });

  it('refuses a file that is not a deck and cleans up after itself', async () => {
    storage.files.set('C:/bad.slidr', '{"hello": 1}');
    await expect(service.open('C:/bad.slidr')).rejects.toBeInstanceOf(DeckLoadError);
    expect(storage.workspaces.size).toBe(0);
  });

  it('leaves no workspace behind when the copy before a migration cannot be made', async () => {
    const old = SCHEMA_VERSION - 1;
    storage.files.set('C:/old.slidr', JSON.stringify({ ...hebrewDeck(), schemaVersion: old }));
    const migrating = new DocumentService(storage, new CommandBus(createDeck()), {
      migrations: { [old]: (deck) => deck },
    });
    storage.backup = () => Promise.reject(new StorageError('io', 'the folder is read-only'));
    await expect(migrating.open('C:/old.slidr')).rejects.toMatchObject({ kind: 'io' });
    expect(storage.workspaces.size).toBe(0);
    expect(migrating.workspace).toBeNull();
  });

  it('asks the guard when the new document is ready, and keeps the open one on a no', async () => {
    storage.files.set('C:/b.slidr', JSON.stringify(hebrewDeck()));
    await service.create(createDeck());
    const first = service.workspace!.id;
    service.bus.dispatch(rename('Still unsaved'));
    const readyAt: (string | undefined)[] = [];
    const no = () => {
      readyAt.push(storage.log.at(-1));
      return Promise.resolve(false);
    };

    expect(await service.open('C:/b.slidr', no)).toEqual({ kept: true });
    expect(await service.create(hebrewDeck(), no)).toBe(false);
    // Asked after the file was unpacked and the workspace made: at the last moment.
    expect(readyAt).toEqual(['open C:/b.slidr', 'create w3']);
    expect(service.workspace?.id).toBe(first);
    expect(service.bus.deck.meta.title).toBe('Still unsaved');
    expect(service.dirty).toBe(true);
    // What was made for the documents that did not come to be is gone.
    expect([...storage.workspaces.keys()]).toEqual([first]);

    expect(await service.open('C:/b.slidr', () => Promise.resolve(true))).toEqual({});
    expect(service.bus.deck).toEqual(hebrewDeck());
  });

  it('never deletes a crash leftover that fails to load', async () => {
    const { id } = await storage.create();
    await storage.writeDeck(id, '{"schemaVersion": 99}', 'From the future');
    await expect(service.recover(id)).rejects.toBeInstanceOf(DeckLoadError);
    expect(storage.workspaces.has(id)).toBe(true);
  });

  it('keeps changes made during a save as unsaved', async () => {
    await service.create(hebrewDeck());
    service.bus.dispatch(rename('a'));
    const saving = service.saveAs('C:/x.slidr');
    service.bus.dispatch(rename('b'));
    await saving;
    expect(service.dirty).toBe(true);
    expect(titleIn(storage.files.get('C:/x.slidr'))).toBe('a');
  });

  it('turns an imported file into an asset table entry', async () => {
    await service.create(hebrewDeck());
    const asset = await service.importAssetFile('C:\\photos\\cat.png');
    expect(asset).toMatchObject({ origin: 'upload', name: 'cat.png', kind: 'image', width: 2 });
    service.bus.dispatch({ type: 'asset.add', asset });
    expect(service.bus.deck.assets[asset.id]).toEqual(asset);
  });

  describe('when the disk refuses (WG13-T03)', () => {
    it('reports an autosave that failed, tries again without a change, and says when it is over', async () => {
      const failed: unknown[] = [];
      let saved = 0;
      const guarded = new DocumentService(storage, new CommandBus(createDeck()), {
        autosaveDelayMs: 1000,
        autosaveRetryMs: 5000,
        onAutosaveError: (error) => failed.push(error),
        onAutosaved: () => saved++,
      });
      await guarded.create(hebrewDeck());
      const id = guarded.workspace!.id;
      const write = storage.writeDeck.bind(storage);
      let full = true;
      storage.writeDeck = (...args) =>
        full
          ? Promise.reject(new StorageError('disk_full', 'could not write deck.json'))
          : write(...args);

      guarded.bus.dispatch(rename('Kept in memory'));
      await vi.advanceTimersByTimeAsync(1000);
      expect(failed).toHaveLength(1);
      expect(failureKind(failed[0])).toBe('disk_full');
      expect(saved).toBe(0);
      // Nothing is lost: the deck in memory has the change, and the document is still unsaved.
      expect(guarded.bus.deck.meta.title).toBe('Kept in memory');
      expect(guarded.dirty).toBe(true);

      // With no change from the user, it is tried again, and fails again while the disk is full.
      await vi.advanceTimersByTimeAsync(5000);
      expect(failed).toHaveLength(2);
      full = false;
      await vi.advanceTimersByTimeAsync(5000);
      expect(failed).toHaveLength(2);
      expect(saved).toBe(1);
      expect(titleIn(storage.workspaces.get(id)?.deckJson)).toBe('Kept in memory');
      // And then it rests: nothing is written while nothing changes.
      await vi.advanceTimersByTimeAsync(20_000);
      expect(storage.log.filter((l) => l.startsWith('write'))).toEqual([`write ${id}`]);
    });

    it('keeps the deck and the document as they were when a save fails', async () => {
      await service.create(hebrewDeck());
      await service.saveAs('C:/decks/a.slidr');
      service.bus.dispatch(rename('Newer'));
      storage.save = () => Promise.reject(new StorageError('disk_full', 'could not write'));
      await expect(service.save()).rejects.toMatchObject({ kind: 'disk_full' });
      expect(service.dirty).toBe(true);
      expect(service.path).toBe('C:/decks/a.slidr');
      expect(service.bus.deck.meta.title).toBe('Newer');
      expect(titleIn(storage.files.get('C:/decks/a.slidr'))).not.toBe('Newer');
    });

    it('still autosaves a change whose save was refused before the workspace was written', async () => {
      const failed: unknown[] = [];
      const guarded = new DocumentService(storage, new CommandBus(createDeck()), {
        autosaveDelayMs: 1000,
        autosaveRetryMs: 5000,
        onAutosaveError: (error) => failed.push(error),
      });
      await guarded.create(hebrewDeck());
      const id = guarded.workspace!.id;
      // Refused before anything is stored: a full disk.
      storage.save = () => Promise.reject(new StorageError('disk_full', 'could not write'));

      // Ctrl+S inside the quiet time of the change: the save takes the place of its autosave.
      guarded.bus.dispatch(rename('Typed a moment before Ctrl+S'));
      await vi.advanceTimersByTimeAsync(500);
      await expect(guarded.saveAs('C:/decks/a.slidr')).rejects.toMatchObject({ kind: 'disk_full' });
      expect(storage.workspaces.get(id)?.deckJson).toBeNull();

      // With no further change from the user, the change still reaches the workspace: a crash
      // from here on loses nothing.
      await vi.advanceTimersByTimeAsync(1000);
      expect(titleIn(storage.workspaces.get(id)?.deckJson)).toBe('Typed a moment before Ctrl+S');
      expect(failed).toEqual([]);

      // And a workspace that cannot be written either raises the alert the autosave has.
      const full = new StorageError('disk_full', 'could not write deck.json');
      storage.writeDeck = () => Promise.reject(full);
      guarded.bus.dispatch(rename('Next'));
      await expect(guarded.saveAs('C:/decks/a.slidr')).rejects.toMatchObject({ kind: 'disk_full' });
      await vi.advanceTimersByTimeAsync(1000);
      expect(failed).toEqual([full]);
    });

    it('refuses a file whose deck was cut short, and cleans up after itself', async () => {
      const whole = JSON.stringify(hebrewDeck());
      storage.files.set('C:/cut.slidr', whole.slice(0, whole.length / 2));
      const refused = await service.open('C:/cut.slidr').catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(SyntaxError);
      expect(failureKind(refused)).toBe('damaged');
      expect(storage.workspaces.size).toBe(0);
    });
  });
});
