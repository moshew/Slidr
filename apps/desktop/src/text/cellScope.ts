import type { CellRange, CommandBus } from '@slidr/model';
import { createStore } from 'zustand/vanilla';

/*
 * Text in table cells, for the text tools (WG6). A table has no text of its own: its cells have.
 * The table area says which cells are selected; the text tools then format their text as they
 * format the text of a text box, and the text editor edits one of them. This file is where the
 * two areas meet, so that neither imports the other's state.
 */

export interface CellScope {
  /** The table the cells belong to. */
  elementId: string;
  /** The cells the text tools act on: the ones selected in the table. */
  range: CellRange;
}

/** The selected cells of the table being worked in, or null. Set by the table area. */
export const cellScope = createStore<{ scope: CellScope | null }>(() => ({ scope: null }));

type Written = (bus: CommandBus, elementId: string, txId: string) => void;

let written: Written | undefined;

/**
 * Registers what happens after the text of cells was written to the model: the table area fits
 * the rows to their text, in the undo step of the change (`txId`).
 */
export function onCellsWritten(listener: Written): void {
  written = listener;
}

/** Tells that the text of cells of a table was written in this transaction. */
export function cellsWritten(bus: CommandBus, elementId: string, txId: string): void {
  written?.(bus, elementId, txId);
}
