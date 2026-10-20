import { SLIDE_HEIGHT, SLIDE_WIDTH } from '@slidr/model';

/*
 * The numbers of SPEC 4.1 that the layout computes with. The fixed region heights (title bar,
 * Top Tools, Filmstrip, status bar) are CSS tokens in @slidr/ui; these are the ones that move.
 */

/** Compact Tool Panel width in a maximized FHD window (1920 wide). */
export const PANEL_WIDTH = 360;
/** Tool Panel width at the minimum supported resolution, 1366 × 768. */
export const PANEL_WIDTH_SMALL = 320;
const WIDE = 1920;
const NARROW = 1366;
/** The fixed minimum keeps the panel compact on wide displays. */
export const PANEL_MIN_WIDTH = 280;
/** The splitter still allows a wide panel for dense tools. */
export const PANEL_MAX_SHARE = 0.45;
/** Space around the slide when it is fitted to the Stage. */
export const STAGE_MARGIN = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The Tool Panel's width before the user drags the splitter: 360 at 1920, 320 at 1366. */
export function defaultPanelWidth(windowWidth: number): number {
  const t = (windowWidth - NARROW) / (WIDE - NARROW);
  const width = PANEL_WIDTH_SMALL + clamp(t, 0, 1) * (PANEL_WIDTH - PANEL_WIDTH_SMALL);
  return Math.round(width);
}

export function panelLimits(windowWidth: number): { min: number; max: number } {
  return {
    min: PANEL_MIN_WIDTH,
    max: Math.floor(windowWidth * PANEL_MAX_SHARE),
  };
}

/**
 * The Tool Panel's width. `share` is the width the user chose, as a share of the window, so the
 * panel keeps its proportion when the window is resized; null means the default.
 */
export function panelWidth(windowWidth: number, share: number | null): number {
  const { min, max } = panelLimits(windowWidth);
  const wanted = share === null ? defaultPanelWidth(windowWidth) : share * windowWidth;
  return Math.round(clamp(wanted, min, max));
}

export interface SlideFit {
  /** Slide pixels to screen pixels. */
  scale: number;
  width: number;
  height: number;
}

/**
 * "Fit to window" (UI-03): the largest 16:9 slide that fits the Stage with `margin` on every
 * side. A 1280 × 748 Stage, the FHD layout, gives 1232 × 693.
 */
export function fitSlide(stageWidth: number, stageHeight: number, margin = STAGE_MARGIN): SlideFit {
  const scale = Math.max(
    0,
    Math.min((stageWidth - 2 * margin) / SLIDE_WIDTH, (stageHeight - 2 * margin) / SLIDE_HEIGHT),
  );
  return { scale, width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale };
}
