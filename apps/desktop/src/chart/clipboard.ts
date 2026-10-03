import { SLIDR_MIME } from '../arrange/clip';
import { getEditor } from '../shell';
import { clipboardGrid, gridToClipboard } from '../table/paste';
import { copiedCells, cutCell, pasteInGrid, pasteOnChart } from './actions';
import { chartTarget } from './target';

/*
 * Chart data on the clipboard (CHT-02). A range copied in Excel or Google Sheets, a table copied
 * from Word or from a web page, and delimited text (TSV, CSV) are read into a grid of texts by
 * the table area's reader (`table/paste.ts`) and pasted:
 * - in the data editor, from the cell the keyboard is on, growing the chart when the grid is
 *   larger; at the corner of the grid it replaces the whole data;
 * - onto a chart that is selected on the Stage, as its whole data.
 *
 * The listeners run in the capture phase of the window, and this area registers before the table
 * area does (the shell loads `src/<area>/register` in the order of the names): left to the table
 * area, a grid pasted while a chart is selected would become a new table on the slide, and one
 * copied in the data editor would be the chart itself.
 */

/** The popover of the data editor (`DataTool`). */
const EDITOR = '[data-chart-editor]';

/** Anywhere in the data editor: a cell of its grid, one of its buttons, or the panel itself. */
const inEditor = (node: EventTarget | null) =>
  node instanceof Element && Boolean(node.closest(EDITOR));

/** A text field, or the in-place text editor: they copy and paste text themselves. */
function isTextTarget(node: EventTarget | null): boolean {
  if (!(node instanceof HTMLElement)) return false;
  return (
    node.isContentEditable ||
    node.matches('input, textarea, select') ||
    Boolean(node.closest('[data-text-editor]'))
  );
}

const inFilmstrip = (node: EventTarget | null) =>
  node instanceof Element && Boolean(node.closest('[data-filmstrip]'));

/** Text that is no table, as the one cell it is: for a paste on a cell of the grid. */
function oneCell(text: string): string[][] | undefined {
  const cell = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  return cell.trim() === '' ? undefined : [[cell]];
}

function onPaste(event: ClipboardEvent): void {
  const data = event.clipboardData;
  // A text field pastes text at its caret: a field of a popover, and the cell being typed in.
  if (!data || event.defaultPrevented || isTextTarget(event.target)) return;
  // Elements and slides copied in Slidr are the arrange area's, and no data for a chart.
  const slidr = Boolean(data.getData(SLIDR_MIME));
  const text = data.getData('text/plain');
  const read = () => clipboardGrid({ html: data.getData('text/html'), text });

  if (inEditor(event.target)) {
    // Whatever is pasted in the data editor is for its grid, and never an element for the slide.
    event.preventDefault();
    event.stopPropagation();
    const cells = slidr ? undefined : (read()?.cells ?? oneCell(text));
    if (cells) pasteInGrid(getEditor(), cells);
    return;
  }

  if (slidr || inFilmstrip(event.target)) return;
  // The grid is the data of the chart that is selected. Without one it is the table area's.
  const editor = getEditor();
  if (!chartTarget(editor)) return;
  const grid = read();
  // One cell is not data for a chart: it goes on to become a text box, as plain text does.
  if (!grid || grid.cells.length * (grid.cells[0]?.length ?? 0) <= 1) return;
  event.preventDefault();
  event.stopPropagation();
  pasteOnChart(editor, grid.cells);
}

function onCopy(event: ClipboardEvent, cut: boolean): void {
  if (event.defaultPrevented || !event.clipboardData) return;
  // A chart that is selected on the Stage is copied as an element, by the arrange area.
  if (!inEditor(event.target) || isTextTarget(event.target)) return;
  event.preventDefault();
  event.stopPropagation();
  const editor = getEditor();
  const cells = copiedCells(editor);
  if (!cells) return;
  const { text, html } = gridToClipboard(cells, editor.bus.deck.meta.dir);
  event.clipboardData.setData('text/plain', text);
  // One cell is its text; the whole grid goes out as a table as well, for Excel.
  if (cells.length > 1) event.clipboardData.setData('text/html', html);
  else if (cut) cutCell(editor);
}

/** Starts listening to the window's clipboard events. Returns a function that stops. */
export function installChartClipboard(): () => void {
  const copy = (event: ClipboardEvent) => onCopy(event, false);
  const cut = (event: ClipboardEvent) => onCopy(event, true);
  window.addEventListener('paste', onPaste, true);
  window.addEventListener('copy', copy, true);
  window.addEventListener('cut', cut, true);
  return () => {
    window.removeEventListener('paste', onPaste, true);
    window.removeEventListener('copy', copy, true);
    window.removeEventListener('cut', cut, true);
  };
}
