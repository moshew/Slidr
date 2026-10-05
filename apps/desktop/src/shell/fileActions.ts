import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import type { ReplaceGuard } from '../document/documentService';
import { describeFailure, describeMissingAssets } from '../document/failures';
import type { RecentFile, RecoverableWorkspace, SavedDeck } from '../document/storage';
import { currentLanguage, i18n } from '../i18n';
import { ask, tell } from './dialogs';
import type { Deck } from '@slidr/model';
import { newDeck, syncFileState, type Editor } from './editor';
import { WORKSPACE_KEY } from './startup';
import { setWelcome } from './store';

/*
 * The File menu flows (DOC-05) over `DocumentService` (ADR-007): new, open, save, save as,
 * recent files, the unsaved-changes question before anything replaces the document, and the
 * offer to recover what a crash left behind. Outside Tauri there is no storage; only "new" works
 * there.
 */

const EXTENSION = 'slidr';

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);

function filters() {
  return [{ name: t('file.filter'), extensions: [EXTENSION] }];
}

function baseName(path: string): string {
  const name = path.split(/[\\/]/).at(-1) ?? path;
  return name.toLowerCase().endsWith(`.${EXTENSION}`) ? name.slice(0, -EXTENSION.length - 1) : name;
}

/** The name the window shows: the file's, else the deck title, else "Untitled". */
export function documentName(path: string | null, title: string): string {
  if (path) return baseName(path);
  return title.trim() || t('app.untitled');
}

/**
 * Keeps the workspace id across a reload of the webview: Rust still holds the workspace as open,
 * so it is never offered for recovery, and the shell reopens it itself (ADR-007, "ל-WG3").
 */
function rememberWorkspace(editor: Editor): void {
  try {
    const id = editor.document?.workspace?.id;
    if (id) sessionStorage.setItem(WORKSPACE_KEY, id);
    else sessionStorage.removeItem(WORKSPACE_KEY);
  } catch {
    // Without sessionStorage a reload starts a new deck; nothing is lost on disk.
  }
}

/**
 * Tells the user that a file operation failed: what happened and what to do, in the language of
 * the interface (WG13-T03). The error's own text, which is English and names paths, is logged.
 */
async function report(title: string, error: unknown): Promise<void> {
  console.error(title, error);
  await tell(title, describeFailure(error));
}

/** Starts the window's document: reopens the workspace of this session, or creates one. */
export async function startDocument(editor: Editor): Promise<void> {
  const document = editor.document;
  if (!document) return;
  let previous: string | null = null;
  try {
    previous = sessionStorage.getItem(WORKSPACE_KEY);
  } catch {
    // As if there were none.
  }
  try {
    if (previous) {
      try {
        await document.recover(previous);
      } catch {
        await document.create(editor.bus.deck);
      }
    } else if (!(await offerRecovery(editor))) {
      await document.create(editor.bus.deck);
    }
  } catch (error) {
    await report(t('file.startFailed'), error);
  }
  rememberWorkspace(editor);
  syncFileState(editor);
}

/**
 * After a crash (DOC-03): workspaces with changes that never reached their file are offered one
 * by one, the latest first. True when one was recovered and is now the open document. "Not now"
 * keeps a leftover on disk, to be offered again at the next start.
 */
async function offerRecovery(editor: Editor): Promise<boolean> {
  const document = editor.document;
  if (!document) return false;
  let leftovers: RecoverableWorkspace[];
  try {
    leftovers = await document.listRecoverable();
  } catch (error) {
    console.error('Could not list recoverable workspaces', error);
    return false;
  }
  leftovers.sort((a, b) => (b.autosavedAt ?? '').localeCompare(a.autosavedAt ?? ''));
  for (const leftover of leftovers) {
    const time = leftover.autosavedAt
      ? new Date(leftover.autosavedAt).toLocaleString(currentLanguage())
      : null;
    const choice = await ask({
      title: t('file.recoverTitle', { name: documentName(leftover.sourcePath, leftover.title) }),
      body: time ? t('file.recoverBody', { time }) : t('file.recoverBodyNoTime'),
      actions: [
        { id: 'later', label: t('file.recoverLater'), variant: 'ghost' },
        { id: 'discard', label: t('file.recoverDiscard') },
        { id: 'recover', label: t('file.recover'), variant: 'primary' },
      ],
      cancelId: 'later',
    });
    if (choice === 'discard') {
      await document.discardRecoverable(leftover.id).catch((error: unknown) => {
        console.error('Could not discard the workspace', error);
      });
    } else if (choice === 'recover') {
      try {
        await document.recover(leftover.id);
        // The work that was recovered is what the user came back for: straight to it.
        setWelcome(false);
        return true;
      } catch (error) {
        // The leftover stays on disk: it is the only copy of that work.
        await report(t('file.recoverFailed'), error);
      }
    }
  }
  return false;
}

/**
 * Asks what to do with unsaved changes before they would be replaced. True when it is fine to
 * go on: there are none, or the user chose to drop them. After "Save" it looks again: a deck
 * that changed while it was being saved (the agent's turn does not wait for a save) has unsaved
 * changes once more, and they get the question too.
 */
export async function confirmDiscard(editor: Editor): Promise<boolean> {
  for (;;) {
    // The document service knows; the file state is its echo, and is all there is without one.
    if (!(editor.document?.dirty ?? editor.file.getState().dirty)) return true;
    const name = documentName(editor.file.getState().path, editor.bus.deck.meta.title);
    const choice = await ask({
      title: t('file.unsavedTitle', { name }),
      body: t('file.unsavedBody'),
      actions: [
        { id: 'cancel', label: t('file.cancel'), variant: 'ghost' },
        { id: 'discard', label: t('file.dontSave') },
        // Without storage (a plain browser) there is nowhere to save to.
        ...(editor.document
          ? [{ id: 'save', label: t('file.save'), variant: 'primary' as const }]
          : []),
      ],
      cancelId: 'cancel',
    });
    if (choice === 'discard') return true;
    if (choice !== 'save' || !(await saveDocument(editor))) return false;
  }
}

/**
 * The guard a flow hands to the document service once the user has answered for the deck as it
 * is now (DOC-05: unsaved work is never replaced without the question). The service asks it
 * when the new document is ready, which can be much later: the system's file dialog stops the
 * user and not the agent, whose turn goes on writing, and a large file takes time to unpack.
 * A deck that is no longer the one the user answered for gets the question again.
 */
function replaceGuard(editor: Editor): ReplaceGuard {
  let answered = editor.bus.deck;
  return async () => {
    if (editor.bus.deck === answered) return true;
    const go = await confirmDiscard(editor);
    answered = editor.bus.deck;
    return go;
  };
}

/**
 * A new document: the deck given (one that starts on a chosen template), or the one a new deck
 * starts as. False when the user kept the document that was open.
 */
export async function newDocument(editor: Editor, start?: Deck): Promise<boolean> {
  if (!(await confirmDiscard(editor))) return false;
  const deck = start ?? newDeck(currentLanguage());
  if (!editor.document) {
    // A document was chosen: from the welcome screen, on to the editor (DOC-05).
    setWelcome(false);
    editor.bus.reset(deck);
    return true;
  }
  let created = true;
  try {
    created = await editor.document.create(deck, replaceGuard(editor));
  } catch (error) {
    await report(t('file.newFailed'), error);
  }
  rememberWorkspace(editor);
  syncFileState(editor);
  if (created) setWelcome(false);
  return created;
}

/** Opens a `.slidr` file: the given one, or one the user picks. True when it is open. */
export async function openDocument(editor: Editor, path?: string): Promise<boolean> {
  const document = editor.document;
  if (!document) return false;
  if (!(await confirmDiscard(editor))) return false;
  const mayReplace = replaceGuard(editor);
  const chosen =
    path ?? (await openDialog({ multiple: false, directory: false, filters: filters() }));
  if (!chosen) return false;
  editor.file.setState({ busy: 'opening' });
  try {
    const { migratedFrom, kept } = await document.open(chosen, mayReplace);
    rememberWorkspace(editor);
    syncFileState(editor);
    if (kept) return false;
    setWelcome(false);
    if (migratedFrom !== undefined) await tell(t('file.migrated'));
    return true;
  } catch (error) {
    syncFileState(editor);
    await report(t('file.openFailed'), error);
    return false;
  }
}

/** Saves to the document's file, or asks for one. True when the deck was saved. */
export async function saveDocument(editor: Editor): Promise<boolean> {
  const document = editor.document;
  if (!document) return false;
  if (!document.path) return saveDocumentAs(editor);
  return write(editor, () => document.save());
}

export async function saveDocumentAs(editor: Editor): Promise<boolean> {
  const document = editor.document;
  if (!document) return false;
  const name = documentName(document.path, editor.bus.deck.meta.title);
  const chosen = await saveDialog({ defaultPath: `${name}.${EXTENSION}`, filters: filters() });
  if (!chosen) return false;
  const path = chosen.toLowerCase().endsWith(`.${EXTENSION}`) ? chosen : `${chosen}.${EXTENSION}`;
  return write(editor, () => document.saveAs(path));
}

async function write(editor: Editor, save: () => Promise<SavedDeck>): Promise<boolean> {
  editor.file.setState({ busy: 'saving' });
  let saved: SavedDeck;
  try {
    saved = await save();
  } catch (error) {
    syncFileState(editor);
    await report(t('file.saveFailed'), error);
    return false;
  }
  syncFileState(editor);
  await tellMissing(editor, saved.missingAssets);
  return true;
}

/**
 * The files the user was last told a save went without, and in which document. The storage
 * layer never fails a save over a picture it cannot find (ADR-007): it writes the file without
 * it and says which. Every later save of the same deck goes without the same files, so the
 * user is told once, and again when the list changes.
 */
const toldMissing = new WeakMap<Editor, { workspace: string | undefined; files: string }>();

/** Tells the user that the file just saved is without some of the deck's files. */
async function tellMissing(editor: Editor, files: readonly string[]): Promise<void> {
  if (files.length === 0) {
    toldMissing.delete(editor);
    return;
  }
  const now = { workspace: editor.document?.workspace?.id, files: [...files].sort().join('\n') };
  const before = toldMissing.get(editor);
  if (before && before.workspace === now.workspace && before.files === now.files) return;
  toldMissing.set(editor, now);
  const { title, body } = describeMissingAssets(editor.bus.deck, files);
  await tell(title, body);
}

export async function recentFiles(editor: Editor): Promise<RecentFile[]> {
  if (!editor.storage) return [];
  try {
    return await editor.storage.listRecents();
  } catch (error) {
    console.error('Could not list recent files', error);
    return [];
  }
}

/**
 * Before the window closes: settle unsaved changes, then let go of the workspace so it is not
 * left on disk. False when the user cancelled.
 */
export async function prepareToClose(editor: Editor): Promise<boolean> {
  if (!(await confirmDiscard(editor))) return false;
  try {
    await editor.document?.close();
  } catch (error) {
    console.error('Could not close the workspace', error);
  }
  return true;
}
