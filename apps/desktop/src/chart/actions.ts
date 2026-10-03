import {
  findElement,
  findSlide,
  updateElement,
  type ChartType,
  type CommandBus,
} from '@slidr/model';
import { i18n } from '../i18n';
import {
  changeType,
  chartGrid,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  isValidCell,
  parseNumber,
  pasteCells,
  replaceData,
  setCell,
  type GridCell,
} from './data';
import { seriesNames } from './insert';
import { chartSession, moveTo } from './session';
import { chartTarget, type ChartEditor } from './target';

/*
 * What the data editor, the clipboard and the type gallery do to the selected chart (WG6-T06,
 * T07). Each action reads the chart from the bus when it runs, never from a render that may be a
 * change behind, and writes one `element.update`: one undo step. The options of a chart are
 * written by its tools of row B (`tools.tsx`), through the same `write`.
 */

const label = (key: string) => i18n.t(`chart:history.${key}`);

/** The cell of the session, kept inside the grid: an undo may have taken its row or column away. */
export function cellInside(grid: readonly (readonly string[])[], cell: GridCell): GridCell {
  return {
    row: Math.max(0, Math.min(cell.row, grid.length - 1)),
    col: Math.max(0, Math.min(cell.col, (grid[0]?.length ?? 1) - 1)),
  };
}

/** A chart by where it is, not by the selection. */
export interface ChartRef {
  slideId: string;
  elementId: string;
}

/**
 * Sets the text of one cell of a chart. `invalid` when a value cell was given text that is no
 * number: the value stays as it was, and the editor marks the cell. The chart is named, not taken
 * from the selection: a click on the slide ends the typing in a cell after it changed the
 * selection, and what was typed is still written.
 */
export function editCell(
  bus: CommandBus,
  at: ChartRef,
  cell: GridCell,
  text: string,
): 'done' | 'invalid' {
  const slide = findSlide(bus.deck, at.slideId);
  const chart = slide ? findElement(slide, at.elementId) : undefined;
  if (chart?.type !== 'chart') return 'done';
  if (!isValidCell(cell, text)) return 'invalid';
  const patch = setCell(chart, cell, text);
  if (patch) bus.dispatch(updateElement(at.slideId, chart.id, patch), { label: label('cell') });
  return 'done';
}

/**
 * Pastes a grid of texts into the data editor, from the cell the keyboard is on. At the corner of
 * the grid it replaces the whole data. One undo step.
 */
export function pasteInGrid(editor: ChartEditor, cells: readonly (readonly string[])[]): boolean {
  const target = chartTarget(editor);
  if (!target) return false;
  const { chart } = target;
  const at = cellInside(chartGrid(chart), chartSession.getState().cell);
  const names = seriesNames(editor.bus.deck.meta.lang);
  const [first] = cells;
  // One text is as if it was typed in the cell: a value cell that is given text keeps its value.
  // A grid overlays what is there, and a text of it that is no number is a gap.
  const patch =
    cells.length === 1 && first?.length === 1
      ? setCell(chart, at, first[0] ?? '')
      : pasteCells(chart, at, cells, names);
  return target.write(patch, { label: label('paste') });
}

/**
 * Pastes a grid of texts onto the chart that is selected on the Stage: it becomes the data of the
 * chart, its first row the names of the series and its first column the categories. One undo step.
 */
export function pasteOnChart(editor: ChartEditor, cells: readonly (readonly string[])[]): boolean {
  const target = chartTarget(editor);
  if (!target) return false;
  const names = seriesNames(editor.bus.deck.meta.lang);
  return target.write(replaceData(target.chart, cells, names), { label: label('paste') });
}

/**
 * What a copy in the data editor takes: the text of the cell the keyboard is on. At the corner it
 * is the whole grid, as a paste there is the whole data.
 */
export function copiedCells(editor: ChartEditor): string[][] | undefined {
  const target = chartTarget(editor);
  if (!target) return undefined;
  const grid = chartGrid(target.chart);
  const at = cellInside(grid, chartSession.getState().cell);
  return at.row === 0 && at.col === 0 ? grid : [[grid[at.row]?.[at.col] ?? '']];
}

/** Empties the cell the keyboard is on, after a cut. The corner is the whole grid, and stays. */
export function cutCell(editor: ChartEditor): boolean {
  const target = chartTarget(editor);
  if (!target) return false;
  const at = cellInside(chartGrid(target.chart), chartSession.getState().cell);
  return target.write(setCell(target.chart, at, ''), { label: label('cut') });
}

/**
 * The x value of a row that is added to a scatter chart: one more than the largest, when the
 * rows have numbers. With an empty x the renderer would read every row as 1, 2, 3 until the new
 * one was filled, and the points would jump.
 */
function nextX(grid: readonly (readonly string[])[]): string {
  const xs = grid.slice(1).map((row) => parseNumber(row[0] ?? ''));
  const numbers = xs.filter((x): x is number => x !== null);
  return numbers.length > 0 && numbers.length === xs.length ? String(Math.max(...numbers) + 1) : '';
}

/** Adds a category under the row the keyboard is on, and moves the keyboard to it. */
export function addRow(editor: ChartEditor): boolean {
  const target = chartTarget(editor);
  if (!target) return false;
  const { chart } = target;
  const grid = chartGrid(chart);
  const at = cellInside(grid, chartSession.getState().cell);
  const category = chart.chartType === 'scatter' ? nextX(grid) : '';
  target.write(insertRow(chart, at.row + 1, category), { label: label('insertRow') });
  moveTo({ row: at.row + 1, col: at.col });
  return true;
}

/** Adds a series after the column the keyboard is on, and moves the keyboard to it. */
export function addColumn(editor: ChartEditor): boolean {
  const target = chartTarget(editor);
  if (!target) return false;
  const { chart } = target;
  const grid = chartGrid(chart);
  const at = cellInside(grid, chartSession.getState().cell);
  const name = seriesNames(editor.bus.deck.meta.lang)(grid[0]?.length ?? 1);
  target.write(insertColumn(chart, at.col + 1, name), { label: label('insertColumn') });
  moveTo({ row: at.row, col: at.col + 1 });
  return true;
}

/** Whether the row and the column the keyboard is on can be removed: not the last of their kind. */
export function canRemove(
  grid: readonly (readonly string[])[],
  cell: GridCell,
): { row: boolean; column: boolean } {
  return {
    row: cell.row > 0 && grid.length > 2,
    column: cell.col > 0 && (grid[0]?.length ?? 0) > 2,
  };
}

/** Removes the category of the row the keyboard is on. */
export function removeRow(editor: ChartEditor): boolean {
  const target = chartTarget(editor);
  if (!target) return false;
  const grid = chartGrid(target.chart);
  const at = cellInside(grid, chartSession.getState().cell);
  if (!target.write(deleteRow(target.chart, at.row), { label: label('deleteRow') })) return false;
  // The row that took its place, or the one before it when it was the last.
  moveTo({ row: Math.min(at.row, grid.length - 2), col: at.col });
  return true;
}

/** Removes the series of the column the keyboard is on. */
export function removeColumn(editor: ChartEditor): boolean {
  const target = chartTarget(editor);
  if (!target) return false;
  const grid = chartGrid(target.chart);
  const at = cellInside(grid, chartSession.getState().cell);
  if (!target.write(deleteColumn(target.chart, at.col), { label: label('deleteColumn') })) {
    return false;
  }
  moveTo({ row: at.row, col: Math.min(at.col, (grid[0]?.length ?? 2) - 2) });
  return true;
}

/** Draws the selected chart as another type, with the data it has (CHT-05). */
export function setType(editor: ChartEditor, chartType: ChartType): boolean {
  const target = chartTarget(editor);
  if (!target) return false;
  return target.write(changeType(target.chart, chartType), { label: label('type') });
}
