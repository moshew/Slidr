import { registerMessages } from '../i18n';
import { registerShortcut } from '../shell';
import { en, he } from './messages';
import { keepKeyboard } from './keep';
import { movePane, rememberPanes } from './panes';

/*
 * The keyboard's way round the window (WG13-T06, UI-06): the pane key. F6 goes to the next
 * region and Shift+F6 to the one before, as in Windows' own programs, and what is selected on
 * the slide stays selected. See `panes.ts`. And the keyboard is never left nowhere: `keep.ts`.
 */

registerMessages('a11y', { he, en });

const forget = rememberPanes();
const release = keepKeyboard();
import.meta.hot?.dispose(() => {
  forget();
  release();
});

/*
 * Also while text is typed, in a field or on the slide: from the text of a text box the key
 * reaches the text tools of row B, and comes back to the caret. The key is taken whether or not
 * there was somewhere to go, so the webview never acts on it itself.
 */
registerShortcut({
  id: 'a11y.pane.next',
  keys: 'F6',
  inText: true,
  label: 'a11y:keys.nextPane',
  section: 'view',
  run: () => void movePane(1),
});
registerShortcut({
  id: 'a11y.pane.previous',
  keys: 'Shift+F6',
  inText: true,
  label: 'a11y:keys.previousPane',
  section: 'view',
  run: () => void movePane(-1),
});
