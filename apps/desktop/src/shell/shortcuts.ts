import { useEffect } from 'react';
import type { Editor } from './editor';
import { newDocument, openDocument, saveDocument, saveDocumentAs } from './fileActions';
import { PanelId } from './registry';
import { openPanel, setZoom } from './store';

/** Text fields keep their own undo and their own Ctrl+A, Ctrl+Z and so on. */
function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.matches('input, textarea, select');
}

/**
 * The letter of a Ctrl shortcut. With a Hebrew layout `event.key` is a Hebrew letter, so the
 * physical key decides; with a Latin layout the letter itself does (Ctrl+Z on AZERTY too).
 */
function shortcutKey(event: KeyboardEvent): string {
  const key = event.key.toLowerCase();
  if (/^[a-z0-9]$/.test(key)) return key;
  const physical = /^(?:Key|Digit)(.)$/.exec(event.code)?.[1];
  return physical ? physical.toLowerCase() : key;
}

/**
 * The shell's keyboard shortcuts (SPEC Appendix A): undo / redo, the File commands, fit zoom,
 * and the three AI tools. WG3-T07 replaces this with the full shortcut system.
 */
export function useShellShortcuts(editor: Editor): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.altKey || event.metaKey) return;
      const key = shortcutKey(event);
      const editable = isEditable(event.target);
      let handled = true;
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
      else handled = false;
      // Also keeps the webview's own Ctrl+S, Ctrl+O and Ctrl+N from running.
      if (handled) event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor]);
}
