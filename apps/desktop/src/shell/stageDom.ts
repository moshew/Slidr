/*
 * The Stage in the DOM, for areas that are not the Stage: after a toolbar action the keyboard
 * should be back on the slide, and some actions need to know where an element is drawn. The
 * Stage itself is `src/stage/Stage.tsx`; this is the one place that knows how to find it.
 */

const SURFACE = '[data-testid="stage-surface"]';

/** Gives the keyboard to the Stage, so Delete, the arrows and Enter act on the selection. */
export function focusStage(): void {
  document.querySelector<HTMLElement>(SURFACE)?.focus({ preventScroll: true });
}

/** The rendered box of an element of the current slide, or null when it is not on the Stage. */
export function stageElement(elementId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `${SURFACE} [data-element-id="${CSS.escape(elementId)}"]`,
  );
}
