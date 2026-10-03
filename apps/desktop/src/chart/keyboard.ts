import { getEditor } from '../shell';
import { openData } from './session';
import { chartTarget } from './target';

/*
 * Enter on a selected chart opens its data editor, as Enter goes into a table or into the text of
 * a text box. The Stage handles Enter for the kinds it edits in place and marks the key as done;
 * a chart it leaves alone, and the key comes up to the window.
 *
 * This is a listener of its own and not a shortcut of the shell's registry: the shell treats a
 * registered key as the app's even when the shortcut had nothing to act on, and prevents its
 * default. For Enter that would be the click of whatever button has the focus, anywhere in the app.
 */

const STAGE = '[data-testid="stage-surface"]';
/** The selected cell of the data grid, while the data editor is open. */
const OPEN_CELL = '[data-chart-grid] [data-chart-cell][tabindex="0"]';

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || event.defaultPrevented || event.isComposing) return;
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
  // Only with the keyboard on the Stage: Enter on a button or in a field is theirs.
  if (!(event.target instanceof Element) || !event.target.closest(STAGE)) return;
  const target = chartTarget(getEditor());
  // A locked chart is left as it is, like a locked text box.
  if (!target || target.chart.locked) return;
  event.preventDefault();
  openData(target.chart.id);
  // The editor takes the keyboard as it opens. One that is open already is given it here.
  document.querySelector<HTMLElement>(OPEN_CELL)?.focus();
}

/** Starts listening to the window's keys. Returns a function that stops. */
export function installChartKeyboard(): () => void {
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
