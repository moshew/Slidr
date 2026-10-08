/*
 * The pane key (WG13-T06, UI-06): F6 and Shift+F6 move the keyboard from one region of the window
 * to the next, and what is selected on the slide stays selected. Tab cannot do this from the
 * Stage: there it walks the elements of the slide, and past the last one the selection is
 * cleared, so the tools of row B, which are the tools of the selection, were out of the
 * keyboard's reach.
 *
 * A region says it is one with `data-pane="<name>"`. The keyboard arrives where it last was in
 * that region, or at the region's first control: for the Stage that is the slide itself, for the
 * Filmstrip the strip. A region that has nothing to take the keyboard right now (a collapsed
 * panel) is passed over.
 */

/** The regions in the order of the key, which is the order they are laid out in. */
export const PANES = [
  'document',
  'activity',
  'panel',
  'context',
  'stage',
  'filmstrip',
  'status',
] as const;
export type Pane = (typeof PANES)[number];

const TABBABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex^="-"])',
  '[contenteditable="true"]',
].join(',');

const paneNode = (pane: Pane) => document.querySelector<HTMLElement>(`[data-pane="${pane}"]`);

/**
 * Drawn, and not shut off from the keyboard: by a region that is collapsed, by a dialog that
 * hides the window behind it, or by the window not being ready (`inert`, while its first document
 * is on its way).
 */
export function takesKeyboard(node: HTMLElement): boolean {
  if (!node.isConnected || node.closest('[inert], [aria-hidden="true"]')) return false;
  if (node.getClientRects().length === 0) return false;
  return getComputedStyle(node).visibility !== 'hidden';
}

/**
 * Something lies over the region that is no part of it and is not a small thing floating by a
 * control (a tooltip, a popover): the show, the welcome screen, the scrim of a dialog. The
 * keyboard does not go under it.
 */
function covered(node: HTMLElement): boolean {
  const box = node.getBoundingClientRect();
  const over = document
    .elementsFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    .find((hit) => !hit.closest('[data-radix-popper-content-wrapper]'));
  return over !== undefined && !node.contains(over);
}

/** Where the keyboard was last in each region, for as long as that control is still there. */
const last = new Map<Pane, HTMLElement>();
/** The region of what took the keyboard last; none when that was in a layer of its own. */
let latest: Pane | undefined;

function paneOf(node: Element | null): Pane | undefined {
  const name = node?.closest<HTMLElement>('[data-pane]')?.dataset.pane;
  return PANES.find((pane) => pane === name);
}

/**
 * The region the keyboard is in, as it was when it arrived there: it is still the answer while
 * the control that had it is being taken out of the document.
 */
export function paneNow(): Pane | undefined {
  return latest;
}

/** Notes where the keyboard is as it moves, so a region is come back to where it was left. */
export function rememberPanes(): () => void {
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    const pane = paneOf(target);
    latest = pane;
    if (target && pane) last.set(pane, target);
  };
  document.addEventListener('focusin', onFocusIn);
  return () => document.removeEventListener('focusin', onFocusIn);
}

/** The control of a region that takes the keyboard when the pane key arrives there. */
export function paneTarget(pane: Pane): HTMLElement | undefined {
  const node = paneNode(pane);
  if (!node || !takesKeyboard(node) || covered(node)) return undefined;
  const remembered = last.get(pane);
  if (remembered && remembered.closest('[data-pane]') === node && remembered.matches(TABBABLE)) {
    if (takesKeyboard(remembered)) return remembered;
  }
  // Context tools are now inside the Stage region. Each pane owns only its own controls;
  // entering the Stage must reach the slide, rather than a button of the nested context pane.
  const controls = [...node.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (control) => control.closest('[data-pane]') === node && takesKeyboard(control),
  );
  // Among the buttons of the Activity Bar, the one of the open panel.
  const open =
    pane === 'activity'
      ? controls.find((control) => control.getAttribute('aria-pressed') === 'true')
      : undefined;
  return open ?? controls[0];
}

/**
 * Moves the keyboard to the next region, or to the one before. From nowhere (nothing has the
 * keyboard) it goes to the Stage. False when the keyboard is in a layer of its own, which is not
 * a region: a dialog, a menu, a popover, the show. The key does nothing there.
 */
export function movePane(step: 1 | -1): boolean {
  const active = document.activeElement;
  const from = paneOf(active);
  if (!from) {
    if (active && active !== document.body) return false;
    const stage = paneTarget('stage');
    stage?.focus({ preventScroll: true });
    return Boolean(stage);
  }
  const at = PANES.indexOf(from);
  for (let n = 1; n < PANES.length; n++) {
    const pane = PANES[(at + step * n + PANES.length * n) % PANES.length];
    const target = pane ? paneTarget(pane) : undefined;
    if (target) {
      target.focus({ preventScroll: true });
      return true;
    }
  }
  return false;
}
