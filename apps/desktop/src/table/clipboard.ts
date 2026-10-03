import {
  clearCells,
  mergeCells,
  newId,
  pasteGrid,
  tableFromGrid,
  tableText,
  type TableElement,
} from '@slidr/model';
import { SLIDR_MIME } from '../arrange/clip';
import { i18n } from '../i18n';
import { focusStage, getEditor, type Editor } from '../shell';
import { SLIDR_TEXT_MIME } from '../text/paste';
import { fitRows } from './fit';
import { tableFrame } from './insert';
import { clipboardGrid, gridToClipboard, type PastedGrid } from './paste';
import { selectCells, stopTyping } from './session';
import { tableTarget } from './target';

/*
 * Tables on the clipboard (TBL-06). A range copied in Excel or Google Sheets, a table copied from
 * Word or from a web page, and delimited text (TSV, CSV) are read into a grid of texts
 * (`paste.ts`) and pasted:
 * - into the selected table, from its selected cell, growing the table when the grid is larger;
 * - as a new table, when no table is selected.
 * The cells selected inside a table are copied out the same way: as TSV and as an HTML table.
 *
 * The listeners run in the capture phase of the window, so they see a paste before the Stage and
 * the arrange area do. Excel puts a picture of the range on the clipboard next to its text; left
 * to them, that picture would be pasted as an image.
 */

const label = (key: string) => i18n.t(`table:history.${key}`);

/** A text field, or the in-place text editor: they paste text themselves. */
function isTextTarget(node: EventTarget | null): node is HTMLElement {
  if (!(node instanceof HTMLElement)) return false;
  return (
    node.isContentEditable ||
    node.matches('input, textarea, select') ||
    Boolean(node.closest('[data-text-editor]'))
  );
}

const inCellEditor = (node: EventTarget | null) =>
  node instanceof Element && Boolean(node.closest('[data-cell-editing]'));

const inFilmstrip = (node: EventTarget | null) =>
  node instanceof Element && Boolean(node.closest('[data-filmstrip]'));

const cellCount = (grid: PastedGrid) => grid.cells.length * (grid.cells[0]?.length ?? 0);

/** A new table for a pasted grid, in the middle of the slide, with the merged cells of its source. */
export function tableForGrid(editor: Editor, grid: PastedGrid): TableElement {
  const { deck } = editor.bus;
  const frame = tableFrame(deck, grid.cells.length, grid.cells[0]?.length ?? 1);
  let table = tableFromGrid(grid.cells, { frame, dir: grid.dir ?? deck.meta.dir });
  for (const range of grid.merges) table = { ...table, ...mergeCells(table, range) };
  return table;
}

/** Pastes a grid: into the selected table, or as a new one. One undo step. */
export function pasteTable(editor: Editor, grid: PastedGrid): void {
  const { bus, selection } = editor;
  const target = tableTarget(editor);
  if (target) {
    if (target.typing) stopTyping();
    const at = target.inside ? { row: target.range.row0, col: target.range.col0 } : undefined;
    const { patch, range } = pasteGrid(target.table, at ?? { row: 0, col: 0 }, grid.cells);
    target.write(patch, { label: label('paste'), fit: true });
    if (target.inside) {
      selectCells({ row: range.row0, col: range.col0 }, { row: range.row1, col: range.col1 });
    }
    focusStage();
    return;
  }
  const slideId = selection.getState().currentSlideId;
  if (!slideId) return;
  const table = tableForGrid(editor, grid);
  const txId = newId('tx');
  bus.dispatch({ type: 'element.add', slideId, element: table }, { txId, label: label('paste') });
  selection.getState().selectElements([table.id]);
  // The rows are as tall as the text that was pasted into them.
  fitRows(bus, table.id, txId);
  focusStage();
}

function onPaste(event: ClipboardEvent): void {
  const data = event.clipboardData;
  if (!data || event.defaultPrevented) return;
  // Elements and slides copied in Slidr are the arrange area's; text copied in Slidr is text.
  if (data.getData(SLIDR_MIME) || inFilmstrip(event.target)) return;
  const typing = inCellEditor(event.target);
  if (!typing && isTextTarget(event.target)) return;
  const editor = getEditor();
  const target = tableTarget(editor);
  // Another element is being edited in place (the text of an `html` element, the crop of an
  // image): what is pasted there is not a table for the slide.
  if (editor.selection.getState().editingElementId && !target?.inside) return;
  const grid = clipboardGrid(
    { html: data.getData('text/html'), text: data.getData('text/plain') },
    // In a selected table every delimited text is meant for its cells.
    { force: Boolean(target) && !typing },
  );
  if (!grid) return;
  const many = cellCount(grid) > 1;
  // In a cell's text one cell of text is text: the editor pastes it at the caret.
  if (typing && (!many || data.getData(SLIDR_TEXT_MIME))) return;
  // On the slide one cell is not a table: it becomes a text box, as plain text does.
  if (!target && !many) return;
  event.preventDefault();
  event.stopPropagation();
  pasteTable(editor, grid);
}

function onCopy(event: ClipboardEvent, cut: boolean): void {
  if (event.defaultPrevented || !event.clipboardData || isTextTarget(event.target)) return;
  const target = tableTarget(getEditor());
  // A table that is selected as an object is copied as an element, by the arrange area.
  if (!target?.inside || target.typing) return;
  const { text, html } = gridToClipboard(tableText(target.table, target.range), target.table.dir);
  event.clipboardData.setData('text/plain', text);
  event.clipboardData.setData('text/html', html);
  event.preventDefault();
  event.stopPropagation();
  if (cut) target.write(clearCells(target.table, target.cells), { label: label('cut') });
}

/** Starts listening to the window's clipboard events. Returns a function that stops. */
export function installTableClipboard(): () => void {
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
