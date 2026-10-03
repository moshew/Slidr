// @vitest-environment happy-dom
import { createSlide } from '@slidr/model';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
