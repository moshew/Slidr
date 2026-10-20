import {
  cellRange,
  expandRange,
  fullRange,
  type CellRange,
  type CellRef,
  type SelectionStore,
  type TableElement,
} from '@slidr/model';
import { createStore } from 'zustand/vanilla';
import { cellScope } from '../text/cellScope';

/*
 * Working inside a table (WG6): which cells are selected, and whether the text of one of them is
 * being typed. The table being worked in is `selection.editingElementId`, like the text box being
 * edited or the image being cropped (ADR-016); this store adds what only a table has. It is not
 * part of the document and not of undo (CMD-05).
 */

/**
 * How the text editor opens in a cell: with the caret at a point of the screen or at the end of
 * the text, with all the text selected, or with a character that was typed on the selected cell,
 * which starts the cell's text over.
 */
export type Caret = { x: number; y: number } | { typed: string } | 'all' | 'end';

export interface TableSession {
  /** The table this is about. It counts only while that table is `editingElementId`. */
  elementId: string | null;
  /** The cell the selection began at, and the cell it reaches: the range between them is selected. */
  anchor: CellRef;
  focus: CellRef;
  /** The text editor is open in the `focus` cell. */
  typing: boolean;
  caret: Caret;
}

const FIRST: CellRef = { row: 0, col: 0 };

export const tableSession = createStore<TableSession>(() => ({
  elementId: null,
  anchor: FIRST,
  focus: FIRST,
  typing: false,
  caret: 'end',
}));

// The text tools format the text of the selected cells (see `text/cellScope.ts`).
tableSession.subscribe(({ elementId, anchor, focus }) => {
  cellScope.setState({ scope: elementId ? { elementId, range: cellRange(anchor, focus) } : null });
});

/** Goes into a table: one cell is selected, and with `caret` its text is typed. */
export function enterTable(
  selection: SelectionStore,
  elementId: string,
  cell: CellRef = FIRST,
  caret?: Caret,
): void {
  tableSession.setState({
    elementId,
    anchor: cell,
    focus: cell,
    typing: caret !== undefined,
    caret: caret ?? 'end',
  });
  selection.getState().startEditing(elementId);
}

/** Selects the cells from `anchor` to `focus`; no text is typed. */
export function selectCells(anchor: CellRef, focus: CellRef = anchor): void {
  tableSession.setState({ anchor, focus, typing: false });
}

/** Opens the text editor in a cell. */
export function typeIn(cell: CellRef, caret: Caret): void {
  tableSession.setState({ anchor: cell, focus: cell, typing: true, caret });
}

/** Closes the text editor; its cell stays selected. */
export function stopTyping(): void {
  tableSession.setState({ typing: false });
}

function inside(table: TableElement, cell: CellRef): CellRef {
  return {
    row: Math.max(0, Math.min(cell.row, table.rows.length - 1)),
    col: Math.max(0, Math.min(cell.col, table.cols.length - 1)),
  };
}

/** A cell of the session as it is now: an undo may have taken its row or column away. */
export function sessionCell(table: TableElement, cell: CellRef): CellRef {
  return inside(table, cell);
}

/**
 * The selected cells of a table: the session's range, inside the table and around whole merged
 * cells. For a table that is not being worked in it is the whole table, which is what its tools
 * act on when it is selected as an object.
 */
export function selectedRange(
  table: TableElement,
  session: TableSession,
  editingElementId: string | null,
): CellRange {
  if (session.elementId !== table.id || editingElementId !== table.id) return fullRange(table);
  return expandRange(table, cellRange(inside(table, session.anchor), inside(table, session.focus)));
}
