import { keyboardInUse } from '@slidr/ui';
import { paneNow, paneTarget, takesKeyboard, type Pane } from './panes';

/*
 * The keyboard is never nowhere (WG13-T06, DSN-08). The focus falls to the page itself, which is
 * nowhere, whenever what had it stops having it and nothing else takes it: a press of the
 * pointer on a part of the window that is no control, a control that goes away once it has done
 * its work (the row it removed, the button of a step that ended), a layer that closes with
 * nobody to give the keyboard back to. From nowhere the Stage hears no arrow, and Tab starts
 * again at the top of the window.
 *
 *   - What the Stage had, the Stage gets back, however it was lost: a press on the status bar or
 *     on the ground of a panel does not take the keyboard from the slide. The text that is
 *     edited on the slide gets it back when it is still open, with its caret. The same for the
 *     Filmstrip, the other surface that is worked with keys.
 *   - While the keyboard is what the user works with, losing it anywhere puts it on the nearest
 *     thing that is left: the region the lost control was in, at its first control, when the
 *     control is gone; the slide when the control is still there and was left on purpose (a field
 *     that Enter commits), or when it was in a layer that closed.
 *   - A layer that is still open keeps the keyboard that was lost inside it: a popover, a
 *     dialog. On the slide behind it the keyboard would be outside the layer, which a popover
 *     takes as a press outside it: it closes, and every popover it was opened from with it.
 *
 * A press of the pointer away from a field of a panel leaves the keyboard nowhere as before:
 * that is what the press asked for, and every key that needs no focus works from there.
 *
 * Whoever means to put the keyboard somewhere does so first: a dialog gives it back to what
 * opened it, a tool to the slide. This only acts when, a moment later, nobody has.
 */

/** After the timers on which a closing layer gives the focus back. */
const A_MOMENT = 20;

/**
 * The ground of a panel. The panel of a tab is a stop of Tab, so a press of the pointer between
 * its controls gives the focus to the panel as a whole. That press is one on a part of the window
 * that is no control, as a press on the status bar is, and is taken as one.
 */
const GROUND = '[role="tabpanel"]';

/**
 * A layer of its own over the window: a popover beside its button, a dialog. It takes the focus
 * as a whole, as it does when it opens with no control of its own to give it to.
 */
const LAYER = '[role="dialog"], [role="alertdialog"]';

export function keepKeyboard(): () => void {
  let waiting: ReturnType<typeof setTimeout> | undefined;

  const settle = (
    from: HTMLElement,
    pane: Pane | undefined,
    ground: Element | null,
    layer: HTMLElement | null,
  ) => {
    waiting = undefined;
    const active = document.activeElement;
    // Somebody has it; or the window itself is not where the user is.
    const nobody = !active || active === document.body || active === ground;
    if (!nobody || !document.hasFocus()) return;
    const still = takesKeyboard(from);
    if (pane === 'stage' || pane === 'filmstrip') {
      // The two surfaces the document is worked on: the slide, and the strip of slides.
      const surface = paneTarget(pane);
      if (surface) (still ? from : surface).focus({ preventScroll: true });
      return;
    }
    if (!keyboardInUse()) return;
    // Lost inside a layer that is still open (the code of a colour that Enter commits, in the
    // picker): the keyboard stays in the layer.
    if (layer && takesKeyboard(layer)) {
      layer.focus({ preventScroll: true });
      return;
    }
    const near = pane && !still ? paneTarget(pane) : undefined;
    (near ?? paneTarget('stage'))?.focus({ preventScroll: true });
  };

  const onFocusOut = (event: FocusEvent) => {
    if (!(event.target instanceof HTMLElement)) return;
    const to = event.relatedTarget;
    const ground = !keyboardInUse() && to instanceof Element && to.matches(GROUND) ? to : null;
    // With a next owner the keyboard is not lost.
    if (to && !ground) return;
    const from = event.target;
    const pane = paneNow();
    // Read now: a control that is being taken out of the document is still in its layer.
    const layer = from.closest<HTMLElement>(LAYER);
    clearTimeout(waiting);
    waiting = setTimeout(() => settle(from, pane, ground, layer), A_MOMENT);
  };

  document.addEventListener('focusout', onFocusOut);
  return () => {
    document.removeEventListener('focusout', onFocusOut);
    clearTimeout(waiting);
  };
}
