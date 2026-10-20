import { isTauri } from '@tauri-apps/api/core';

/** Where `fileActions.ts` keeps the workspace of this window across a reload of the webview. */
export const WORKSPACE_KEY = 'slidr.workspace';

/** `off` keeps the app in the editor at start, for runs that drive the real window. */
export const WELCOME_KEY = 'slidr.welcome';

export interface StartEnvironment {
  /** Inside the app, where there are files; not a plain browser page. */
  app: boolean;
  /** The query of the address the page was opened with. */
  search: string;
  /** The workspace this window had before a reload, if it had one. */
  workspace: string | null;
  /** The value of `slidr.welcome` in `localStorage`. */
  preference: string | null;
}

function read(storage: () => Storage, key: string): string | null {
  try {
    return storage().getItem(key);
  } catch {
    // Storage can be unavailable; as if nothing were kept.
    return null;
  }
}

function environment(): StartEnvironment {
  return {
    app: isTauri(),
    // A unit test may run without a window: there is no address to read.
    search: typeof window === 'undefined' ? '' : window.location.search,
    workspace: read(() => sessionStorage, WORKSPACE_KEY),
    preference: read(() => localStorage, WELCOME_KEY),
  };
}

/**
 * Whether the window opens on the welcome screen (DOC-05) or in the editor.
 *
 * The app opens on it, except when the webview is reloaded over a document it already had: the
 * session remembers that workspace, and the editor comes back to it. A plain browser page (the
 * Vite page, Playwright) has no files to welcome anyone to and starts in the editor, which is
 * also where every test of the editor starts. `?welcome` in the address shows the screen there;
 * `?editor`, or `slidr.welcome` set to `off`, keeps the app itself in the editor, for a run that
 * drives the real window.
 */
export function startsOnWelcome(env: StartEnvironment = environment()): boolean {
  const query = new URLSearchParams(env.search);
  if (query.has('editor')) return false;
  if (query.has('welcome')) return true;
  if (!env.app || env.preference === 'off') return false;
  return env.workspace === null;
}
