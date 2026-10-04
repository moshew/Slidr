import { registerMessages } from '../i18n';
import { registerShortcut, registerStageLayer, type Editor } from '../shell';
import { FindBar } from './FindBar';
import './highlight.css';
import { en, he } from './messages';
import { findSession, openFind, step } from './session';

/*
 * Find and replace across the deck (WG4-T09, TXT-12): the bar over the Stage and its shortcuts.
 * What is searched and how a match is replaced are `search.ts` and `replace.ts`; the marks on the
 * Stage are `highlight.ts`.
 */

registerMessages('find', { he, en });

registerStageLayer({ id: 'find.bar', render: FindBar });

/* ---------------------------------------------------------------- shortcuts */

/** F3 and Shift+F3. With the bar closed they open it, and go on with what was looked for last. */
function findNext(editor: Editor, direction: 1 | -1): void {
  if (!findSession.getState().open) openFind(editor);
  if (findSession.getState().query) step(editor, direction);
}

/*
 * All four work while text is typed, in a field or on the slide: the search is the deck's. A
 * registered shortcut owns its key, so the webview's own find never opens.
 */
registerShortcut({
  id: 'find.open',
  keys: 'Ctrl+F',
  inText: true,
  label: 'find:shortcut.open',
  section: 'edit',
  run: (editor) => openFind(editor),
});
registerShortcut({
  id: 'find.replace',
  keys: 'Ctrl+H',
  inText: true,
  label: 'find:shortcut.replace',
  section: 'edit',
  run: (editor) => openFind(editor, true),
});
registerShortcut({
  id: 'find.next',
  keys: 'F3',
  inText: true,
  label: 'find:shortcut.next',
  section: 'edit',
  run: (editor) => findNext(editor, 1),
});
registerShortcut({
  id: 'find.previous',
  keys: 'Shift+F3',
  inText: true,
  label: 'find:shortcut.previous',
  section: 'edit',
  run: (editor) => findNext(editor, -1),
});
