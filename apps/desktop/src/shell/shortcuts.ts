import { useEffect } from 'react';
import type { Editor } from './editor';
import { eventKeys } from './eventKeys';
import { modalOpen, overlayOf } from './overlay';
import { useShell } from './store';
import { shortcutsOn, userKeysReady } from './userKeys';

export { eventKeys };

/**
 * Text fields keep their own undo and their own Ctrl+A, Ctrl+Z and so on. So does text that a
 * stylesheet makes editable and no attribute: the text of an `html` element that is edited where
 * it stands (`text/htmlEditing.ts`), which `isContentEditable` does not know of.
 */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.matches('input, textarea, select')) return true;
  return getComputedStyle(target).getPropertyValue('-webkit-user-modify').startsWith('read-write');
}

/**
 * What was pressed, as the one it was pressed in sees it. The content of an `html` element is in
 * a tree of its own, and the window is told only of the element around it: a key typed into that
 * content would look like a key on something that takes no text.
 */
function pressedOn(event: KeyboardEvent): EventTarget | null {
  return event.composedPath()[0] ?? event.target;
}

/** A control that Enter or the space bar presses, opens or chooses: there the key is its own. */
const PRESSED_BY_KEY =
  'button, a[href], summary, [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="tab"], [role="checkbox"], [role="switch"], [role="radio"], [role="combobox"]';

/**
 * Whose a key is, by where it was pressed. The shortcuts are the window's: they act on the deck
 * and on the editor as a whole. A key that was pressed inside something that stands over the
 * window belongs to that thing first:
 *   - in a menu or a floating list every key is its own (a letter is typeahead), and behind a
 *     modal dialog the window is out of reach altogether: no shortcut answers;
 *   - in a popover the plain keys are its own (Enter, Esc, a letter), and a combination with Ctrl
 *     or Alt is still the window's: Ctrl+Z after a drag of a slider in it undoes the drag;
 *   - anywhere, Enter and the space bar on a control they press are that control's.
 */
function belongsElsewhere(event: KeyboardEvent, target: EventTarget | null): boolean {
  if (modalOpen()) return true;
  const overlay = overlayOf(target);
  if (overlay === 'menu' || overlay === 'modal') return true;
  if (event.ctrlKey || event.altKey) return false;
  if (overlay === 'popover') return true;
  const presses = event.key === 'Enter' || event.key === ' ';
  return presses && target instanceof Element && target.closest(PRESSED_BY_KEY) !== null;
}

/**
 * Keys the webview would act on itself: find, print, reload, downloads, view source, caret
 * browsing. A desktop app has none of those (SPEC 4.0, rule 7). Left alone in development, where
 * reload is wanted.
 */
const BROWSER_KEYS = new Set([
  'ctrl+f',
  'ctrl+g',
  'ctrl+shift+g',
  'f3',
  'ctrl+p',
  'ctrl+r',
  'ctrl+shift+r',
  'f5',
  'ctrl+f5',
  'ctrl+j',
  'ctrl+u',
  'f7',
]);

/**
 * Keys the webview acts on itself in text that can be edited: its own undo and redo, and its own
 * bold, italic and underline. In the slide's text editor they would change the text behind the
 * editor's back: the history there is the deck's, and the formatting is the model's. The editor
 * takes these keys while its commands are on them (`text/editorKeys.ts`); once the user moved a
 * command to another key, the key it left must not fall to the webview. A field of the interface
 * keeps them: its own undo is the right one for it.
 */
const BROWSER_TEXT_KEYS = new Set([
  'ctrl+z',
  'ctrl+y',
  'ctrl+shift+z',
  'ctrl+b',
  'ctrl+i',
  'ctrl+u',
]);

const inSlideText = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[data-text-editor]') !== null;

/** How long the shortcuts wait for the settings file before they go on with their own keys. */
const KEYS_WAIT_MS = 3000;

/**
 * Keyboard shortcuts (SPEC Appendix A). Every one of them is registered with `registerShortcut`,
 * the shell's own among them (`register.tsx`), so the shortcut map can list them (UI-06). A
 * shortcut answers to the key the user gave it (`userKeys.ts`), else to the one it was
 * registered with. The latest registration of a combination is asked first; one that returns
 * false passes the key on to the next. A shortcut without `inText` stays out of text fields and
 * of the slide's text editor, where the keys type; and none answers a key that belongs to a
 * menu, a popover or a dialog it was pressed in (`belongsElsewhere`).
 *
 * No shortcut answers until the user's keys were read from the settings file, so a key pressed
 * while the window comes up never acts by a combination the user had moved elsewhere.
 */
export function useShellShortcuts(editor: Editor): void {
  useEffect(() => {
    let known = false;
    const know = () => {
      known = true;
    };
    void userKeysReady().then(know);
    // A settings file that never answers must not leave the app without its keys.
    const waited = setTimeout(know, KEYS_WAIT_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.defaultPrevented) return;
      // A character typed with AltGr is text. On Windows the key reports Ctrl and Alt both, and
      // would answer to a Ctrl+Alt shortcut: AltGr+C is a letter on a Polish layout.
      if (event.getModifierState('AltGraph')) return;
      const target = pressedOn(event);
      const editable = isEditable(target);
      const keys = eventKeys(event);
      // On the welcome screen there is no editor to act on: only the File commands answer.
      const welcome = useShell.getState().welcome;
      const elsewhere = belongsElsewhere(event, target);
      let owned = false;
      let handled = false;
      for (const shortcut of known ? shortcutsOn(keys) : []) {
        if (editable && shortcut.inText !== true) continue;
        if (welcome && shortcut.section !== 'file') continue;
        owned = true;
        if (elsewhere) continue;
        if (shortcut.run(editor, event) !== false) {
          handled = true;
          break;
        }
      }
      // A combination with Ctrl or Alt is the app's even when there is nothing to act on right
      // now (Ctrl+D without a selection, Ctrl+S behind a dialog): the webview must not run its
      // own command for it. A plain key that nobody took goes its usual way: Enter still presses
      // the focused button.
      const combination = event.ctrlKey || event.altKey;
      const browsers =
        (!import.meta.env.DEV && BROWSER_KEYS.has(keys)) ||
        (BROWSER_TEXT_KEYS.has(keys) && inSlideText(target));
      if (handled || (owned && combination) || browsers) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(waited);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [editor]);
}
