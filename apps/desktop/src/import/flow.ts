/**
 * Starting an import (SPEC 13.3 steps 1 to 3, WG9-T18): the system's dialog asks for the file,
 * then a new deck unless the open one is still blank, the file in the isolated page, and the
 * first message to the agent, which is a request in the AI chat like one the user typed. And
 * going on with one that was cut (IMP-09): the page again, from the source the deck keeps, and
 * a message that asks the agent to continue.
 */
import type { SessionScope } from '@slidr/agent-tools';
import { createDeck, createSlide, type Deck } from '@slidr/model';
import { isTauri } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { createStore } from 'zustand/vanilla';
import type { ChatThread } from '../agent/agentService';
import { aiOf } from '../ai/runtime';
import { currentLanguage, i18n } from '../i18n';
import { pickFiles } from '../objects/insert';
import type { Editor } from '../shell';
import { tell } from '../shell/dialogs';
import { newDocument } from '../shell/fileActions';
import { PanelId } from '../shell/registry';
import { openPanel, setWelcome } from '../shell/store';
import {
  importState,
  interruptImport,
  openImport,
  reopenImport,
  turnEnded,
  type ImportSource,
} from './session';

/**
 * The deck an import fills: one empty slide and nothing of a template. The slides of the file
 * bring their own design, and the agent reads the theme off the file (SPEC 13.3 step 6).
 */
function plainDeck(): Deck {
  return createDeck({ lang: currentLanguage(), slides: [createSlide()] });
}

/**
 * The open deck is such a deck, and nobody has put anything into it. A deck that started on the
 * user's default template (THM-08) is not: its first slide holds the placeholders of a layout,
 * which the first imported slide would not take the place of.
 */
function blank(editor: Editor): boolean {
  const { slides, layouts } = editor.bus.deck;
  const only = slides[0];
  return (
    slides.length === 1 &&
    only !== undefined &&
    only.elements.length === 0 &&
    only.layoutId === undefined &&
    layouts.length === 0 &&
    !editor.file.getState().dirty &&
    editor.file.getState().path === null
  );
}

const watched = new WeakSet<ChatThread>();

/**
 * Follows the turns of a conversation of an import, from the first time anyone asks for it,
 * which is before any of them can run: a turn that is stopped stops the capture call it left
 * running, and a turn that ends tells the session how it ended, so that an import that was cut
 * is known to be (IMP-09). Returns the conversation.
 */
export function followImport(thread: ChatThread): ChatThread {
  if (!watched.has(thread)) {
    watched.add(thread);
    let { busy, stopping } = thread.store.getState();
    thread.store.subscribe((state) => {
      if (state.stopping && !stopping) interruptImport();
      stopping = state.stopping;
      if (state.busy === busy) return;
      busy = state.busy;
      if (busy) return;
      const last = state.entries.at(-1);
      turnEnded(last?.type === 'assistant' && last.outcome === 'completed');
    });
  }
  return thread;
}

/**
 * The chat of the import of the open deck, with its turns followed.
 *
 * Through the panels' sessions: the chat is known to them while it is still idle, so its work
 * shows in the status bar, and the AI chat that draws it finds it there instead of registering
 * a chat that is already at work.
 */
export function importThread(editor: Editor, file: string): ChatThread {
  return followImport(aiOf(editor).sessions.thread({ kind: 'import', file }));
}

/**
 * The file that was chosen is loading in the isolated page: the AI chat says so, until the
 * request is in it.
 */
export const importOpening = createStore<boolean>(() => false);

/** Shows the conversation of the open deck's import in the AI chat. */
function showImportChat(editor: Editor): void {
  aiOf(editor).sessions.chat.setState('import', true);
  openPanel(PanelId.ai, 'chat');
}

/**
 * Imports a file as a deck. False when the user kept the document they had. Throws when the
 * file could not be opened or loaded.
 */
export async function startImport(
  editor: Editor,
  source: ImportSource,
  options: { confirm: boolean },
): Promise<boolean> {
  if (!blank(editor)) {
    // Asks about unsaved changes first, like File > New. The new document is a plain one,
    // whatever new decks otherwise start as: with a default template set, the deck File > New
    // makes is never blank, and an import that waited for a blank one never started.
    const deck = plainDeck();
    if (!(await newDocument(editor, deck))) return false;
    // The user was told when the new document could not be made; the one they had stays.
    if (editor.bus.deck.id !== deck.id) return false;
  }
  // From here the import is what the window shows: the editor, with the AI chat open.
  setWelcome(false);
  openPanel(PanelId.ai, 'chat');
  importOpening.setState(true, true);
  let file: string;
  try {
    file = await openImport(editor, source);
  } finally {
    importOpening.setState(false, true);
  }
  const t = (key: string) => i18n.t(key, { ns: 'import', file });
  const thread = importThread(editor, file);
  // The request is the first message of a conversation of the AI chat, like one the user typed.
  showImportChat(editor);
  void thread.send(
    `${t('message.import')} ${t(options.confirm ? 'message.confirm' : 'message.direct')}`,
  );
  return true;
}

/** Asks for the file with the system's dialog. Null when the dialog was cancelled. */
async function chooseSource(): Promise<ImportSource | null> {
  if (!isTauri()) {
    // A plain browser has no file dialog of the app's; the page's own picker stands in.
    const [file] = await pickFiles('.html,.htm,text/html');
    return file ? { file } : null;
  }
  const path = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: i18n.t('filter', { ns: 'import' }), extensions: ['html', 'htm'] }],
  });
  return path ? { path } : null;
}

/**
 * "Import HTML" of the File menu and of the welcome screen: the dialog for the file, and the
 * import of the one that was chosen, with the agent's plan shown for approval first (SPEC 13.3
 * step 3). A file that could not be opened or loaded is said in a dialog, like a document that
 * could not be opened.
 */
export async function importFile(editor: Editor): Promise<void> {
  // One at a time: a file that is still loading is the import that was asked for.
  if (importOpening.getState()) return;
  const source = await chooseSource();
  if (!source) return;
  try {
    await startImport(editor, source, { confirm: true });
  } catch (error) {
    await tell(
      i18n.t('failed', { ns: 'import' }),
      error instanceof Error ? error.message : String(error),
    );
  }
}

/**
 * A deck that was imported is open again (IMP-07): the AI chat takes up the conversation of the
 * import when that is the one the deck's chat was last written in. An import that was cut is
 * shown with the chat open, where going on with it is offered (IMP-09): the user who comes back
 * after a crash should not have to know where to look.
 */
export async function importRestored(editor: Editor): Promise<void> {
  const { file, deckId, phase } = importState.getState();
  if (!file) return;
  if (phase === 'cut') return showImportChat(editor);
  const { agent, sessions } = aiOf(editor);
  const written = async (scope: SessionScope) =>
    (await agent.conversations(scope)).find((one) => one.updatedAt)?.updatedAt ?? '';
  const [ofDeck, ofImport] = await Promise.all([
    written({ kind: 'deck' }),
    written({ kind: 'import', file }),
  ]);
  // Another document was opened while the conversations were read.
  if (importState.getState().deckId !== deckId || editor.bus.deck.id !== deckId) return;
  if (ofImport && ofImport >= ofDeck) sessions.chat.setState('import', true);
}

/**
 * Goes on with an import that was cut (IMP-09). The page is opened first, from the source the
 * deck keeps, so that a source that cannot be opened is the user's to hear about and not the
 * agent's to stumble on. The message is the user's, in the language of the UI; what the app
 * knows of the import so far goes with the turn (`progress.ts`). Throws when the page could not
 * be opened.
 */
export async function continueImport(editor: Editor): Promise<void> {
  const { file, open, kept } = importState.getState();
  if (!file) return;
  if (!open && kept) await reopenImport(editor);
  aiOf(editor).sessions.chat.setState('import', true);
  await importThread(editor, file).send(i18n.t('message.continue', { ns: 'import' }));
}
