/**
 * Starting an import from the panel (SPEC 13.3 steps 1 to 3, WG9-T18): a new deck unless the
 * open one is still blank, the file in the isolated page, and the first message to the agent.
 */
import { aiOf } from '../ai/runtime';
import { i18n } from '../i18n';
import type { Editor } from '../shell';
import { newDocument } from '../shell/fileActions';
import { openImport, type ImportSource } from './session';

/** The deck nobody has put anything into: what a new document starts as. */
function blank(editor: Editor): boolean {
  const { slides } = editor.bus.deck;
  const only = slides[0];
  return (
    slides.length === 1 &&
    only !== undefined &&
    only.elements.length === 0 &&
    !editor.file.getState().dirty &&
    editor.file.getState().path === null
  );
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
    // Asks about unsaved changes first, like File > New.
    await newDocument(editor);
    if (!blank(editor)) return false;
  }
  const file = await openImport(editor, source);
  const t = (key: string) => i18n.t(key, { ns: 'import', file });
  // Through the panels' sessions, and before the first message: the chat is known to them
  // while it is still idle, so its work shows in the status bar, and the panel that draws it a
  // moment later finds it there instead of registering a chat that is already at work.
  const thread = aiOf(editor).sessions.thread({ kind: 'import', file });
  void thread.send(
    `${t('message.import')} ${t(options.confirm ? 'message.confirm' : 'message.direct')}`,
  );
  return true;
}
