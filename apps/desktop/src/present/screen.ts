import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Full screen for the show (PRS-01), on the screen the window is on. In the app it is the window
 * that goes full screen (`core:window:allow-set-fullscreen`); in a plain browser (the Vite page,
 * Playwright) the show's element does, through the browser.
 */
export interface Screen {
  /** Whether the show fills the screen now. */
  readonly full: boolean;
  /** Goes full screen, or back. Resolves to what it is afterwards: a refusal leaves it as it was. */
  set: (full: boolean) => Promise<boolean>;
  /** Calls back when full screen ended from outside: the browser ends it on Esc by itself. */
  onLeft: (listener: () => void) => () => void;
}

function windowScreen(): Screen {
  let full = false;
  return {
    get full() {
      return full;
    },
    set: async (next) => {
      try {
        await getCurrentWindow().setFullscreen(next);
        full = next;
      } catch (error) {
        // Without the permission the show still runs, in the window as it is.
        console.error('Could not change full screen', error);
      }
      return full;
    },
    // The window leaves full screen only when the show asks it to.
    onLeft: () => () => undefined,
  };
}

function elementScreen(element: HTMLElement): Screen {
  const doc = element.ownerDocument;
  const isFull = () => doc.fullscreenElement === element;
  return {
    get full() {
      return isFull();
    },
    set: async (next) => {
      try {
        if (next && !isFull()) await element.requestFullscreen();
        else if (!next && isFull()) await doc.exitFullscreen();
      } catch {
        // Refused without a user gesture: the show runs in the page as it is.
      }
      return isFull();
    },
    onLeft: (listener) => {
      let was = isFull();
      const onChange = () => {
        const now = isFull();
        if (was && !now) listener();
        was = now;
      };
      doc.addEventListener('fullscreenchange', onChange);
      return () => doc.removeEventListener('fullscreenchange', onChange);
    },
  };
}

/** The screen of a show drawn in `element`. */
export function showScreen(element: HTMLElement): Screen {
  return isTauri() ? windowScreen() : elementScreen(element);
}
