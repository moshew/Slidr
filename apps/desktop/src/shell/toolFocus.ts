import { overlayOf } from './overlay';
import { returnKeyboard } from './stageDom';

/*
 * Where the keyboard is after a tool of Top Tools was used (ADR-013, "focus"): one rule for both
 * rows and for the tools of every area, kept here so that no tool has to keep it itself.
 *
 *   - A tool that is used with the pointer never keeps the keyboard. A press on a plain button
 *     of the rows, or on the room between the tools, leaves the focus where it was: in the text
 *     that is being edited, on the Stage, in a field elsewhere. A button that opens a menu or a
 *     popover may hold the focus while that is open; once it closes (a choice, Esc, a press
 *     outside it or on the button again) the keyboard goes back to where it works on the slide
 *     (`returnKeyboard`: the text that is edited, else the Stage), and not onto the button. The
 *     same when a choice in such a menu opened a dialog, and the dialog closes.
 *   - A tool that was reached with the keyboard keeps it. Tab, or the key that goes from one
 *     region of the window to the next, brought the focus into a row, and there it stays: on the
 *     button that was pressed, and on the button of a menu or a popover once that closes, so the
 *     next Tab goes on to the next tool.
 *
 * A field of the rows (the font size, a slider) takes the keyboard when it is pressed, as a
 * field must; its tool gives the keyboard back when the user is done in it.
 */

/** A control that takes the keyboard to be typed or dragged in: a press on it moves the focus. */
const FIELD =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="slider"], [role="textbox"], [role="spinbutton"]';

/**
 * A button that opens something: a menu, a popover, a list of options. It takes the focus as a
 * press of the pointer gives it, without the look of a focus the keyboard brought. What it opens
 * hands the focus on to its first control, which takes that look from where the focus was: left
 * on the text or on the Stage after typing, the control would show a focus ring and its tooltip
 * to a user who only pressed a button.
 */
const OPENER = '[aria-haspopup], [aria-expanded], [role="combobox"]';

/**
 * How the rows were used last: a tool was pressed with the pointer, or a key was pressed while
 * the focus was in them. Null when the keyboard has since been used elsewhere in the window; the
 * keys pressed inside what a tool opened (a menu, a popover, a dialog) leave it as it is.
 */
let way: 'pointer' | 'keys' | null = null;
/** With `keys`: the control of the rows the key was pressed on. */
let keyAt: HTMLElement | null = null;
/** The pointer is down on a tool of the rows: the focus that moves now is the press's own. */
let pressing = false;

const within = (node: EventTarget | null, selector: string) =>
  node instanceof Element && node.closest(selector) !== null;

function nowhere(): boolean {
  const active = document.activeElement;
  return !active || active === document.body;
}

/** The focus is where a closing tool leaves it when nobody takes it: nowhere, or on a button of a toolbar. */
function adrift(): boolean {
  const active = document.activeElement;
  return (
    nowhere() ||
    (active instanceof HTMLButtonElement && Boolean(active.closest('[role="toolbar"]')))
  );
}

/**
 * For `onCloseAutoFocus` of a menu or a popover of the rows that decides where the focus goes
 * itself: by the rule above, back to where the keyboard works on the slide, or to the button the
 * keyboard was on. Not when the user has already put the focus somewhere else: a popover that
 * closed because of a click into the text, into a field or into another popover leaves it there.
 */
export function toolClosed(event: Event): void {
  event.preventDefault();
  if (!adrift()) return;
  if (way === 'keys' && keyAt?.isConnected) keyAt.focus({ preventScroll: true });
  else returnKeyboard();
}

/**
 * Keeps the rule for the rows inside `rows`. Returns the function that stops. The listeners are
 * the DOM's own, by where things are in the document: a menu or a popover is drawn outside the
 * rows, so what happens inside it does not count as happening in them.
 */
export function watchToolFocus(rows: HTMLElement): () => void {
  const inRows = (node: EventTarget | null): node is HTMLElement =>
    node instanceof HTMLElement && rows.contains(node);
  /** On a control of the rows that is no field and has nothing open: a tool that is done. */
  const onIdleTool = (): boolean => {
    const active = document.activeElement;
    return (
      inRows(active) && !within(active, FIELD) && active.getAttribute('aria-expanded') !== 'true'
    );
  };

  const onPointerDown = () => {
    way = 'pointer';
    keyAt = null;
    pressing = true;
  };
  const onPointerEnd = () => {
    pressing = false;
  };
  const onMouseDown = (event: MouseEvent) => {
    if (within(event.target, FIELD) || within(event.target, OPENER)) return;
    event.preventDefault();
    if (nowhere()) returnKeyboard();
  };
  const onFocusIn = (event: FocusEvent) => {
    // Not the focus the press itself gives a button: the one a menu, a popover or a dialog
    // hands back to its button as it closes, after a press of the pointer opened it.
    if (pressing || way !== 'pointer') return;
    if (!inRows(event.target) || within(event.target, FIELD)) return;
    // What the tool started may have taken the keyboard meanwhile: the show that "Present"
    // begins, a dialog that a choice of a menu opened. The focus is then taken from there to
    // the button, and it goes back there, not to the slide behind it.
    const from = event.relatedTarget;
    const taken =
      from instanceof HTMLElement &&
      from.isConnected &&
      !rows.contains(from) &&
      overlayOf(from) !== 'menu' &&
      overlayOf(from) !== 'popover' &&
      // On the slide itself the keyboard is given back the slide's own way: to the text that is
      // edited with its caret, else to the Stage.
      from.closest('[data-testid="stage-surface"]') === null;
    if (taken) from.focus({ preventScroll: true });
    else returnKeyboard();
  };
  const onClick = () => {
    pressing = false;
    // Once the click has done its work and what it closed is gone: a popover that is closed by
    // a press on its own button leaves the focus on that button, or nowhere.
    requestAnimationFrame(() =>
      setTimeout(() => {
        if (way === 'pointer' && (nowhere() || onIdleTool())) returnKeyboard();
      }),
    );
  };
  const onKeyDown = (event: KeyboardEvent) => {
    // The keys of a menu, a popover or a dialog belong to the use of the tool that opened it.
    if (overlayOf(event.target)) return;
    way = inRows(event.target) ? 'keys' : null;
    keyAt = inRows(event.target) ? event.target : null;
  };

  rows.addEventListener('pointerdown', onPointerDown, true);
  rows.addEventListener('mousedown', onMouseDown, true);
  rows.addEventListener('click', onClick);
  document.addEventListener('pointerup', onPointerEnd, true);
  document.addEventListener('pointercancel', onPointerEnd, true);
  // On the document, so that the button has heard of its focus before it loses it again: its
  // tooltip opens on the focus and closes on the blur, and would stay open if the blur came first.
  document.addEventListener('focusin', onFocusIn);
  window.addEventListener('keydown', onKeyDown, true);
  return () => {
    rows.removeEventListener('pointerdown', onPointerDown, true);
    rows.removeEventListener('mousedown', onMouseDown, true);
    rows.removeEventListener('click', onClick);
    document.removeEventListener('pointerup', onPointerEnd, true);
    document.removeEventListener('pointercancel', onPointerEnd, true);
    document.removeEventListener('focusin', onFocusIn);
    window.removeEventListener('keydown', onKeyDown, true);
    way = null;
    keyAt = null;
    pressing = false;
  };
}
