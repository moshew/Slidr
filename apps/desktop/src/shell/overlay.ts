/*
 * The floating layers of the window, as a key press or a focus meets them: a menu, a list of
 * options, a popover beside its button, a modal dialog. The shortcuts ask which of them a key was
 * pressed in (`shortcuts.ts`), and the rows of Top Tools ask whether the keyboard is inside what
 * a tool opened (`toolFocus.ts`).
 */

/** What places a menu, a list of options or a popover beside its button. */
const FLOATING = '[data-radix-popper-content-wrapper]';
const MENU = '[role="menu"], [role="listbox"]';
const DIALOG = '[role="dialog"], [role="alertdialog"]';

/**
 * - `menu`: a menu or a floating list of options. Every key in it is its own: a letter is
 *   typeahead, the arrows walk it, Enter chooses.
 * - `popover`: a floating panel beside its button, with controls of its own.
 * - `modal`: a dialog over a scrim; the window behind it is out of reach until it is answered.
 */
export type Overlay = 'menu' | 'popover' | 'modal';

/** The layer a node is in, the innermost one; null for the window itself. */
export function overlayOf(node: EventTarget | null): Overlay | null {
  if (!(node instanceof Element)) return null;
  const floating = node.closest(FLOATING);
  if (floating) {
    // A list that is part of the window (the Filmstrip is a listbox) is not a floating one.
    const menu = node.closest(MENU);
    return menu && floating.contains(menu) ? 'menu' : 'popover';
  }
  return node.closest(DIALOG) ? 'modal' : null;
}

/** A modal dialog is on the screen: the window behind it takes no keys and no presses. */
export function modalOpen(): boolean {
  for (const dialog of document.querySelectorAll(DIALOG)) {
    if (!dialog.closest(FLOATING)) return true;
  }
  return false;
}
