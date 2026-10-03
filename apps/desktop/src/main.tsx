import '@fontsource-variable/inter';
import '@fontsource-variable/heebo';
import './app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import { App } from './App';
import { tauriStorage } from './document/tauriStorage';
import { registerBuiltinFonts } from './fonts';
import { currentLanguage } from './i18n';
import { createEditor, type Editor } from './shell/editor';
import { startDocument } from './shell/fileActions';
import './shell/plugins';
import { syncTheme } from './shell/store';

syncTheme();
blockNativeContextMenu();
// The fonts decks are set in (ADR-009): without them the Stage draws every slide in a fallback
// font, while the capture window, which registers them, shows the agent the real one.
registerBuiltinFonts();

const editor = createEditor({
  lang: currentLanguage(),
  // In a plain browser (the Vite page, Playwright) there is no Tauri core and so no files.
  storage: isTauri() ? tauriStorage : null,
});
void startDocument(editor);

declare global {
  interface Window {
    /** The editor, for the devtools console and for E2E tests. Development builds only. */
    slidr?: Editor;
  }
}
if (import.meta.env.DEV) window.slidr = editor;

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App editor={editor} />
  </StrictMode>,
);

/**
 * The webview's own right-click menu (Back, Reload, Inspect) is an OS control (SPEC 4.0, rule 7).
 * Text fields keep theirs for now; in development Shift+right-click still opens it, for Inspect.
 */
function blockNativeContextMenu(): void {
  window.addEventListener('contextmenu', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    if (import.meta.env.DEV && event.shiftKey) return;
    event.preventDefault();
  });
}
