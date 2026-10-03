import type { Deck } from '@slidr/model';

/**
 * The capture page draws the slide at 50%, 960×540 CSS px, and Rust scales the screenshot up to
 * the width asked for: untransformed text would be drawn with LCD anti-aliasing, which the editor
 * never shows (ADR-003 condition 6). Must match `SURFACE_WIDTH` in `src-tauri/src/capture`.
 */
export const SURFACE_WIDTH = 960;

/** What Rust hands the capture page, through `window.__slidrCapture(id, request)`. */
export interface PageRequest {
  /** The deck with `slides` holding the one slide to draw. */
  deck: Deck;
  /** The workspace's `assets/` folder, for the asset protocol; null when there is none. */
  assetsDir: string | null;
}

declare global {
  interface Window {
    __slidrCapture?: (id: number, request: PageRequest) => void;
  }
}
