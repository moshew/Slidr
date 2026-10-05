/**
 * Starting an import from the panel (SPEC 13.3 steps 1 to 3, WG9-T18): a new deck unless the
 * open one is still blank, the file in the isolated page, and the first message to the agent.
 * And going on with one that was cut (IMP-09): the page again, from the source the deck keeps,
 * and a message that asks the agent to continue.
 */
import { createDeck, createSlide, type Deck } from '@slidr/model';
import type { ChatThread } from '../agent/agentService';
import { aiOf } from '../ai/runtime';
import { currentLanguage, i18n } from '../i18n';
import type { Editor } from '../shell';
import { newDocument } from '../shell/fileActions';
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
 * The chat of the import of the open deck. Its turns are followed from the first time anyone
 * asks for it, which is before any of them can run: a turn that is stopped stops the capture
 * call it left running, and a turn that ends tells the session how it ended, so that an import
 * that was cut is known to be (IMP-09).
 *
 * Through the panels' sessions: the chat is known to them while it is still idle, so its work
 * shows in the status bar, and the panel that draws it finds it there instead of registering a
 * chat that is already at work.
 */
export function importThread(editor: Editor, file: string): ChatThread {
  const thread = aiOf(editor).sessions.thread({ kind: 'import', file });
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
  const file = await openImport(editor, source);
  const t = (key: string) => i18n.t(key, { ns: 'import', file });
  const thread = importThread(editor, file);
  void thread.send(
    `${t('message.import')} ${t(options.confirm ? 'message.confirm' : 'message.direct')}`,
  );
  return true;
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
  await importThread(editor, file).send(i18n.t('message.continue', { ns: 'import' }));
}
