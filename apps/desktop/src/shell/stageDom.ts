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

/** Takes the keyboard for what is edited in place on the slide; false when nothing of its is. */
type KeyboardHome = () => boolean;

const homes = new Set<KeyboardHome>();

/**
 * An area whose editing in place holds the keyboard (the text editor of a text box, of a shape,
 * of a table cell) says how it takes the keyboard back. Returns the function that withdraws it.
 */
export function registerKeyboardHome(take: KeyboardHome): () => void {
  homes.add(take);
  return () => {
    homes.delete(take);
  };
}

/**
 * Gives the keyboard back to where it works on the slide: to what is being edited in place, with
 * its caret and its selection, and to the Stage otherwise.
 */
export function returnKeyboard(): void {
  for (const take of homes) if (take()) return;
  focusStage();
}

/**
 * The slide as the Stage draws it: the root the renderer made, in slide pixels under the Stage's
 * zoom. For an area that plays something on the slide in place, such as the preview of an
 * animation. Null when no slide is shown.
 */
export function stageSlide(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`${SURFACE} [data-testid="stage-frame"] .slidr-slide`);
}

/** The rendered box of an element of the current slide, or null when it is not on the Stage. */
export function stageElement(elementId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `${SURFACE} [data-element-id="${CSS.escape(elementId)}"]`,
  );
}
