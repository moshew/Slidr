// @vitest-environment happy-dom
import { createDeck, createSlide, type Deck } from '@slidr/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../document/register';
import type { OpenedDeck, RecoverableWorkspace, Storage, Workspace } from '../document/storage';
import { answer, pendingDialog } from './dialogs';
import { createEditor, type Editor } from './editor';
import {
  confirmDiscard,
  newDocument,
  openDocument,
  prepareToClose,
  saveDocument,
  startDocument,
} from './fileActions';

const dialog = vi.hoisted(() => ({
  open: vi.fn<() => Promise<string | null>>(),
  save: vi.fn<() => Promise<string | null>>(),
}));
vi.mock('@tauri-apps/plugin-dialog', () => dialog);

/** Just enough storage: workspaces and files in memory, and a log of what was asked. */
function fakeStorage() {
  const files = new Map<string, string>();
  const workspaces = new Map<string, { sourcePath: string | null; deckJson: string }>();
  const log: string[] = [];
  /** What a crash left behind, as `listRecoverable` reports it. */
  const leftovers: RecoverableWorkspace[] = [];
  let next = 1;
  const workspace = (id: string): Workspace => ({
    id,
    dir: `/ws/${id}`,
    sourcePath: workspaces.get(id)?.sourcePath ?? null,
  });
  const storage: Storage = {
    create: () => {
      const id = `w${next++}`;
      workspaces.set(id, { sourcePath: null, deckJson: '' });
      log.push(`create ${id}`);
      return Promise.resolve(workspace(id));
    },
    open: (path) => {
      const id = `w${next++}`;
      workspaces.set(id, { sourcePath: path, deckJson: files.get(path) ?? '' });
      log.push(`open ${path}`);
      return Promise.resolve({
        workspace: workspace(id),
        deckJson: files.get(path) ?? '',
        metaJson: null,
      });
    },
    writeDeck: (id, deckJson) => {
      workspaces.set(id, { ...workspaces.get(id)!, deckJson });
      return Promise.resolve();
    },
    save: (id, path, deckJson) => {
      files.set(path, deckJson);
      workspaces.set(id, { sourcePath: path, deckJson });
      log.push(`save ${path}`);
      return Promise.resolve({ path, missingAssets: [] });
    },
    close: (id) => {
      workspaces.delete(id);
      log.push(`close ${id}`);
      return Promise.resolve();
    },
    listRecoverable: () => Promise.resolve(leftovers.filter((l) => workspaces.has(l.id))),
    recover: (id): Promise<OpenedDeck> => {
      log.push(`recover ${id}`);
      const ws = workspaces.get(id);
      if (!ws) return Promise.reject(new Error('unknown workspace'));
      return Promise.resolve({ workspace: workspace(id), deckJson: ws.deckJson, metaJson: null });
    },
    backup: () => Promise.resolve(''),
    importAssetFile: () => Promise.reject(new Error('not used')),
    importAssetBytes: () => Promise.reject(new Error('not used')),
    listRecents: () => Promise.resolve([]),
    removeRecent: () => Promise.resolve(),
  };
  return { storage, files, workspaces, log, leftovers };
}

function edit(editor: Editor): void {
  editor.bus.dispatch({ type: 'slide.add', slide: createSlide() });
}

/**
 * Holds a call of the storage until `release`: the time a real one takes, in which the deck
 * may change. `called` resolves when the call has arrived.
 */
function hold<A extends unknown[], R>(target: (...args: A) => Promise<R>) {
  let release = (): void => undefined;
  let arrived = (): void => undefined;
  const called = new Promise<void>((resolve) => (arrived = resolve));
  const held = (...args: A) =>
    new Promise<R>((resolve) => {
      release = () => resolve(target(...args));
      arrived();
    });
  return { held, called, release: () => release() };
}

/** Waits for the dialog the flow opens, then presses one of its buttons. */
async function press(id: string): Promise<void> {
  await vi.waitFor(() => expect(pendingDialog()).not.toBeNull());
  answer(id);
}

beforeEach(() => {
  sessionStorage.clear();
  dialog.open.mockReset();
  dialog.save.mockReset();
});

describe('without storage (a plain browser)', () => {
  it('asks before a new deck replaces unsaved changes', async () => {
    const editor = createEditor({ lang: 'he', storage: null });
    edit(editor);
    expect(editor.bus.deck.slides).toHaveLength(2);
    expect(editor.file.getState().dirty).toBe(true);

    const cancelled = newDocument(editor);
    await press('cancel');
    await cancelled;
    expect(editor.bus.deck.slides).toHaveLength(2);

    const discarded = newDocument(editor);
    await press('discard');
    await discarded;
    expect(editor.bus.deck.slides).toHaveLength(1);
    expect(editor.file.getState().dirty).toBe(false);
  });

  it('does not ask when nothing changed', async () => {
    const editor = createEditor({ lang: 'he', storage: null });
    expect(await confirmDiscard(editor)).toBe(true);
    expect(pendingDialog()).toBeNull();
  });
});

describe('with storage', () => {
  it('starts a workspace and reopens it after a reload of the webview', async () => {
    const { storage, log } = fakeStorage();
    const editor = createEditor({ lang: 'he', storage });
    await startDocument(editor);
    expect(log).toEqual(['create w1']);
    edit(editor);
    await editor.document?.flush();

    const reloaded = createEditor({ lang: 'he', storage });
    await startDocument(reloaded);
    expect(log).toEqual(['create w1', 'recover w1']);
    expect(reloaded.document?.workspace?.id).toBe('w1');
    expect(reloaded.bus.deck.slides).toHaveLength(2);
  });

  it('saves a new deck through Save As, adding the extension', async () => {
    const { storage, files } = fakeStorage();
    const editor = createEditor({ lang: 'he', storage });
    await startDocument(editor);
    edit(editor);
    dialog.save.mockResolvedValue('C:\\decks\\talk');

    expect(await saveDocument(editor)).toBe(true);
    expect([...files.keys()]).toEqual(['C:\\decks\\talk.slidr']);
    expect(editor.file.getState()).toMatchObject({
      path: 'C:\\decks\\talk.slidr',
      dirty: false,
      busy: null,
    });

    // The next save goes to the same file without asking.
    edit(editor);
    expect(await saveDocument(editor)).toBe(true);
    expect(dialog.save).toHaveBeenCalledTimes(1);
  });

  it('saves first when the user picks Save in the unsaved-changes question', async () => {
    const { storage, log, files } = fakeStorage();
    const editor = createEditor({ lang: 'he', storage });
    await startDocument(editor);
    files.set('C:\\decks\\b.slidr', JSON.stringify(editor.bus.deck));
    edit(editor);
    dialog.save.mockResolvedValue('C:\\decks\\a.slidr');
    dialog.open.mockResolvedValue('C:\\decks\\b.slidr');

    const opening = openDocument(editor);
    await press('save');
    await opening;
    // The old workspace goes once the new file is open.
    expect(log).toEqual([
      'create w1',
      'save C:\\decks\\a.slidr',
      'open C:\\decks\\b.slidr',
      'close w1',
    ]);
  });

  /*
   * DOC-05: unsaved work is never replaced without the question. The question is asked before
   * the file dialog, and the deck goes on changing after it: the dialog stops the user, not the
   * agent's turn.
   */
  describe('when the deck changes while another document is on its way', () => {
    const MINE = 'C:\\decks\\mine.slidr';
    const OTHER = 'C:\\decks\\other.slidr';

    /** A deck saved to its file, so that Open asks nothing, and another file beside it. */
    async function savedDeck() {
      const fake = fakeStorage();
      const editor = createEditor({ lang: 'he', storage: fake.storage });
      await startDocument(editor);
      fake.files.set(OTHER, JSON.stringify(createDeck({ title: 'Other' })));
      editor.bus.dispatch({ type: 'slide.add', slide: createSlide({ id: 's_mine' }) });
      dialog.save.mockResolvedValue(MINE);
      expect(await saveDocument(editor)).toBe(true);
      expect(editor.file.getState().dirty).toBe(false);
      return { ...fake, editor };
    }

    /** The turn of the agent, which was running, writes a slide. */
    function agentWrites(editor: Editor, id: string): void {
      editor.bus.dispatch(
        { type: 'slide.add', slide: createSlide({ id }) },
        { actor: 'agent:session:turn', txId: 'tx_turn' },
      );
    }

    const slidesIn = (json: string | undefined) =>
      (JSON.parse(json ?? '{"slides":[]}') as Deck).slides.map((slide) => slide.id);

    /** File > Open, with the system's file dialog up until `pick` is called. */
    async function openWithDialogUp(editor: Editor) {
      let pick = (_path: string | null): void => undefined;
      dialog.open.mockReturnValue(new Promise((resolve) => (pick = resolve)));
      const opening = openDocument(editor);
      await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());
      return { opening, pick };
    }

    it('asks once the file is chosen, and keeps the document when the user cancels', async () => {
      const { editor, log, files } = await savedDeck();
      const { opening, pick } = await openWithDialogUp(editor);
      expect(pendingDialog()).toBeNull();
      agentWrites(editor, 's_agent');
      pick(OTHER);

      await press('cancel');
      expect(await opening).toBe(false);
      expect(editor.bus.deck.slides.map((slide) => slide.id)).toContain('s_agent');
      expect(editor.document?.workspace?.id).toBe('w1');
      expect(editor.file.getState()).toMatchObject({ path: MINE, dirty: true, busy: null });
      // The file that was unpacked for nothing leaves no workspace behind.
      expect(log).toEqual(['create w1', `save ${MINE}`, `open ${OTHER}`, 'close w2']);
      expect(slidesIn(files.get(MINE))).not.toContain('s_agent');
    });

    it('saves what was written meanwhile when the user says so, then opens the file', async () => {
      const { editor, log, files } = await savedDeck();
      const { opening, pick } = await openWithDialogUp(editor);
      agentWrites(editor, 's_agent');
      pick(OTHER);

      await press('save');
      expect(await opening).toBe(true);
      expect(slidesIn(files.get(MINE))).toContain('s_agent');
      expect(editor.bus.deck.meta.title).toBe('Other');
      expect(editor.file.getState()).toMatchObject({ path: OTHER, dirty: false, busy: null });
      // The question comes when the file is ready, so the save is after its unpacking.
      expect(log.slice(-3)).toEqual([`open ${OTHER}`, `save ${MINE}`, 'close w1']);
    });

    it('asks about what was written while the file was being unpacked', async () => {
      const { editor, storage } = await savedDeck();
      const unpacking = hold(storage.open.bind(storage));
      storage.open = unpacking.held;
      const opening = openDocument(editor, OTHER);
      await unpacking.called;
      agentWrites(editor, 's_agent');
      unpacking.release();

      await press('discard');
      expect(await opening).toBe(true);
      expect(editor.bus.deck.meta.title).toBe('Other');
    });

    it('does not ask a second time about changes the user chose to drop', async () => {
      const { editor } = await savedDeck();
      edit(editor);
      let pick = (_path: string | null): void => undefined;
      dialog.open.mockReturnValue(new Promise((resolve) => (pick = resolve)));
      const opening = openDocument(editor);
      await press('discard');
      await vi.waitFor(() => expect(dialog.open).toHaveBeenCalled());
      pick(OTHER);
      expect(await opening).toBe(true);
      expect(pendingDialog()).toBeNull();
      expect(editor.bus.deck.meta.title).toBe('Other');
    });

    it('asks about what was written while the workspace of a new deck was being made', async () => {
      const { editor, storage, log } = await savedDeck();
      const making = hold(storage.create.bind(storage));
      storage.create = making.held;
      const starting = newDocument(editor);
      await making.called;
      agentWrites(editor, 's_agent');
      making.release();

      await press('cancel');
      expect(await starting).toBe(false);
      expect(editor.bus.deck.slides.map((slide) => slide.id)).toContain('s_agent');
      expect(editor.document?.workspace?.id).toBe('w1');
      expect(log.slice(-2)).toEqual(['create w2', 'close w2']);
    });

    it('asks again about a deck that changed while it was being saved', async () => {
      const { editor, storage, files } = await savedDeck();
      edit(editor);
      const saving = hold(storage.save.bind(storage));
      storage.save = saving.held;
      const settled = confirmDiscard(editor);
      await press('save');
      await saving.called;
      agentWrites(editor, 's_agent');
      saving.release();

      // What the save wrote is without the slide: the user has not answered for it yet.
      await vi.waitFor(() => expect(pendingDialog()).not.toBeNull());
      expect(slidesIn(files.get(MINE))).not.toContain('s_agent');
      answer('cancel');
      expect(await settled).toBe(false);
    });
  });

  /*
   * The storage layer does not fail a save over a file it cannot find: it writes the deck
   * without it and says which (ADR-007). Someone has to pass that on.
   */
  describe('a save that went through without some of the deck files', () => {
    const picture = (id: string, name?: string) => ({
      id,
      file: `${id}.png`,
      mime: 'image/png',
      kind: 'image' as const,
      bytes: 1,
      origin: 'upload' as const,
      ...(name ? { name } : {}),
    });

    /** A saved document with two pictures, and a storage whose saves leave `out.files` out. */
    async function withPictures() {
      const fake = fakeStorage();
      const out = { files: [] as string[] };
      const save = fake.storage.save.bind(fake.storage);
      fake.storage.save = async (...args) => ({
        ...(await save(...args)),
        missingAssets: out.files,
      });
      const editor = createEditor({ lang: 'he', storage: fake.storage });
      await startDocument(editor);
      editor.bus.batch([
        { type: 'asset.add', asset: picture('logo', 'logo.png') },
        { type: 'asset.add', asset: picture('hero') },
      ]);
      dialog.save.mockResolvedValue('C:\\decks\\a.slidr');
      return { editor, out };
    }

    it('tells the user how many files, and their names where the deck knows them', async () => {
      const { editor, out } = await withPictures();
      out.files = ['logo.png', 'hero.png'];
      const saving = saveDocument(editor);
      await vi.waitFor(() => expect(pendingDialog()).not.toBeNull());
      expect(pendingDialog()?.title).toBe('המצגת נשמרה, אבל לא כל הקבצים שלה בקובץ');
      expect(pendingDialog()?.body).toContain('שני קבצים');
      expect(pendingDialog()?.body).toContain('ביניהם: logo.png.');
      // The deck is saved all the same.
      expect(editor.file.getState()).toMatchObject({ dirty: false, busy: null });
      answer('ok');
      expect(await saving).toBe(true);
    });

    it('says it once for a document, and again when the list changes', async () => {
      const { editor, out } = await withPictures();
      out.files = ['logo.png', 'hero.png'];
      const first = saveDocument(editor);
      await press('ok');
      expect(await first).toBe(true);

      // The same files are left out of every save that follows: nothing new to say.
      edit(editor);
      expect(await saveDocument(editor)).toBe(true);
      expect(pendingDialog()).toBeNull();

      out.files = ['hero.png'];
      edit(editor);
      const changed = saveDocument(editor);
      await vi.waitFor(() => expect(pendingDialog()?.body).toContain('קובץ אחד'));
      answer('ok');
      expect(await changed).toBe(true);

      // A whole save in between, and the next one that is not whole is news again.
      out.files = [];
      expect(await saveDocument(editor)).toBe(true);
      expect(pendingDialog()).toBeNull();
      out.files = ['hero.png'];
      const again = saveDocument(editor);
      await press('ok');
      expect(await again).toBe(true);
    });
  });

  describe('after a crash (DOC-03)', () => {
    /** A storage where an earlier run left two workspaces with unsaved changes. */
    function crashed() {
      const fake = fakeStorage();
      const before = createEditor({ lang: 'he', storage: fake.storage });
      for (const [id, autosavedAt] of [
        ['old', '2026-10-01T08:00:00Z'],
        ['new', '2026-10-02T08:00:00Z'],
      ] as const) {
        edit(before);
        fake.workspaces.set(id, { sourcePath: null, deckJson: JSON.stringify(before.bus.deck) });
        fake.leftovers.push({ id, sourcePath: null, title: id, autosavedAt });
      }
      sessionStorage.clear();
      return fake;
    }

    it('offers the latest leftover first and recovers it as unsaved work', async () => {
      const { storage, log, workspaces } = crashed();
      const editor = createEditor({ lang: 'he', storage });
      const starting = startDocument(editor);
      await vi.waitFor(() => expect(pendingDialog()?.title).toContain('new'));
      answer('recover');
      await starting;
      expect(log).toEqual(['recover new']);
      expect(editor.document?.workspace?.id).toBe('new');
      expect(editor.bus.deck.slides).toHaveLength(3);
      expect(editor.file.getState().dirty).toBe(true);
      // The older one was not asked about: it waits for the next start.
      expect(workspaces.has('old')).toBe(true);
    });

    it('deletes what the user discards, keeps what is put off, then starts a new deck', async () => {
      const { storage, log, workspaces } = crashed();
      const editor = createEditor({ lang: 'he', storage });
      const starting = startDocument(editor);
      await vi.waitFor(() => expect(pendingDialog()?.title).toContain('new'));
      answer('discard');
      await vi.waitFor(() => expect(pendingDialog()?.title).toContain('old'));
      answer('later');
      await starting;
      expect(log).toEqual(['close new', 'create w1']);
      expect(workspaces.has('old')).toBe(true);
      expect(editor.bus.deck.slides).toHaveLength(1);
      expect(editor.file.getState().dirty).toBe(false);
    });
  });

  it('lets go of the workspace when the window closes', async () => {
    const { storage, workspaces } = fakeStorage();
    const editor = createEditor({ lang: 'he', storage });
    await startDocument(editor);
    expect(await prepareToClose(editor)).toBe(true);
    expect(workspaces.size).toBe(0);
  });
});
