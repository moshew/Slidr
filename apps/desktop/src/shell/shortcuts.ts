import { useEffect } from 'react';
import type { Editor } from './editor';
import { newDocument, openDocument, saveDocument, saveDocumentAs } from './fileActions';
import { PanelId, shortcutsFor } from './registry';
import { openPanel, setZoom } from './store';

/** Text fields keep their own undo and their own Ctrl+A, Ctrl+Z and so on. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches('input, textarea, select');
}

const BRACKETS: Record<string, string> = { BracketLeft: '[', BracketRight: ']' };

/**
 * The key of a shortcut. With a Hebrew layout `event.key` is a Hebrew letter (and the brackets
 * swap), so the physical key decides; with a Latin layout the letter itself does (Ctrl+Z on
 * AZERTY too).
 */
function shortcutKey(event: KeyboardEvent): string {
  const bracket = BRACKETS[event.code];
  if (bracket) return bracket;
  const key = event.key.toLowerCase();
  if (/^[a-z0-9]$/.test(key)) return key;
  const physical = /^(?:Key|Digit)(.)$/.exec(event.code)?.[1];
  return physical ? physical.toLowerCase() : key;
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

/** The shell's own shortcuts: undo / redo, the File commands, fit zoom, and the three AI tools. */
function runBuiltin(editor: Editor, event: KeyboardEvent, editable: boolean): boolean {
  if (!event.ctrlKey || event.altKey) return false;
  const key = shortcutKey(event);
  if (key === 'z' && !event.shiftKey && !editable) editor.bus.undo();
  else if ((key === 'y' || (key === 'z' && event.shiftKey)) && !editable) editor.bus.redo();
  else if (key === 's' && event.shiftKey) void saveDocumentAs(editor);
  else if (key === 's') void saveDocument(editor);
  else if (key === 'o') void openDocument(editor);
  else if (key === 'n') void newDocument(editor);
  else if (key === '0') setZoom('fit');
  else if (key === '1') openPanel(PanelId.aiDeck);
  else if (key === '2') openPanel(PanelId.aiSlide);
  else if (key === '3') openPanel(PanelId.aiObject);
  else return false;
  return true;
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
 * Keyboard shortcuts (SPEC Appendix A): the shell's own, then the ones other areas registered
 * with `registerShortcut`. A shortcut without `inText` stays out of text fields and of the slide's
 * text editor, where the keys type. WG3-T07 adds the shortcut map and rebinding on top of this.
 */
export function useShellShortcuts(editor: Editor): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.defaultPrevented) return;
      const editable = isEditable(event.target);
      // Also keeps the webview's own Ctrl+S, Ctrl+O and Ctrl+N from running.
      if (runBuiltin(editor, event, editable)) return event.preventDefault();
      const keys = eventKeys(event);
      let owned = false;
      for (const shortcut of shortcutsFor(keys)) {
        if (editable && !shortcut.inText) continue;
        // The key is the app's even when there is nothing to act on right now (Ctrl+D without a
        // selection): the webview must not run its own command for it.
        owned = true;
        if (shortcut.run(editor, event) !== false) break;
      }
      if (owned || (!import.meta.env.DEV && BROWSER_KEYS.has(keys))) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);
}
