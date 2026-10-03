import { createStore } from 'zustand/vanilla';
import type { GridCell } from './data';

/*
 * The data editor of a chart (WG6-T06): which chart it is open for, and the cell of its grid the
 * keyboard is on. It is not part of the document and not of undo (CMD-05), like the cells
 * selected in a table (`table/session.ts`).
 */

export interface ChartSession {
  /** The chart whose data editor is open, or null when it is closed. */
  elementId: string | null;
  /** The cell the keyboard is on: row 0 holds the series names, column 0 the categories. */
  cell: GridCell;
}

/** The corner of the grid: a range pasted there is the whole data (`pasteCells`). */
const CORNER: GridCell = { row: 0, col: 0 };

export const chartSession = createStore<ChartSession>(() => ({ elementId: null, cell: CORNER }));

/** Opens the data editor of a chart, on the corner of its grid. */
export function openData(elementId: string): void {
  if (chartSession.getState().elementId !== elementId) {
    chartSession.setState({ elementId, cell: CORNER });
  }
}

export function closeData(): void {
  if (chartSession.getState().elementId !== null) chartSession.setState({ elementId: null });
}

/** Moves the keyboard to a cell of the grid. */
export function moveTo(cell: GridCell): void {
  const at = chartSession.getState().cell;
  if (at.row !== cell.row || at.col !== cell.col) chartSession.setState({ cell });
}
