import { useEffect } from 'react';
import type { Editor } from './editor';
import { useShell } from './store';
import { shortcutsOn, userKeysReady } from './userKeys';

/** Text fields keep their own undo and their own Ctrl+A, Ctrl+Z and so on. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches('input, textarea, select');
}

/** Keys that are the same key on every layout, by their physical place. */
const PHYSICAL: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Slash: '/',
  Backslash: '\\',
  Equal: '=',
  Minus: '-',
};

/**
 * The key of a shortcut. With a Hebrew layout `event.key` is a Hebrew letter (and the brackets
 * swap), so the physical key decides; with a Latin layout the letter itself does (Ctrl+Z on
 * AZERTY too).
 */
function shortcutKey(event: KeyboardEvent): string {
  const physical = PHYSICAL[event.code];
  if (physical) return physical;
  // The space bar reports a space, which a combination cannot be written with.
  if (event.code === 'Space') return 'space';
  const key = event.key.toLowerCase();
  if (/^[a-z0-9]$/.test(key)) return key;
  const letter = /^(?:Key|Digit)(.)$/.exec(event.code)?.[1];
  return letter ? letter.toLowerCase() : key;
}

/** The combination as the registry writes it: `ctrl+shift+g`. */
export function eventKeys(event: KeyboardEvent): string {
  return [
    ...(event.ctrlKey ? ['ctrl'] : []),
    ...(event.altKey ? ['alt'] : []),
    ...(event.shiftKey ? ['shift'] : []),
    shortcutKey(event),
  ].join('+');
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

/** How long the shortcuts wait for the settings file before they go on with their own keys. */
const KEYS_WAIT_MS = 3000;

/**
 * Keyboard shortcuts (SPEC Appendix A). Every one of them is registered with `registerShortcut`,
 * the shell's own among them (`register.tsx`), so the shortcut map can list them (UI-06). A
 * shortcut answers to the key the user gave it (`userKeys.ts`), else to the one it was
 * registered with. The latest registration of a combination is asked first; one that returns
 * false passes the key on to the next. A shortcut without `inText` stays out of text fields and
 * of the slide's text editor, where the keys type.
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
      const editable = isEditable(event.target);
      const keys = eventKeys(event);
      // On the welcome screen there is no editor to act on: only the File commands answer.
      const welcome = useShell.getState().welcome;
      let owned = false;
      let handled = false;
      for (const shortcut of known ? shortcutsOn(keys) : []) {
        if (editable && !shortcut.inText) continue;
        if (welcome && shortcut.section !== 'file') continue;
        owned = true;
        if (shortcut.run(editor, event) !== false) {
          handled = true;
          break;
        }
      }
      // A combination with Ctrl or Alt is the app's even when there is nothing to act on right
      // now (Ctrl+D without a selection): the webview must not run its own command for it. A
      // plain key that nobody took goes its usual way: Enter still presses the focused button.
      const combination = event.ctrlKey || event.altKey;
      if (handled || (owned && combination) || (!import.meta.env.DEV && BROWSER_KEYS.has(keys))) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(waited);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [editor]);
}
