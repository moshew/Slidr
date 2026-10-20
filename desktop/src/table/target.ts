import {
  findElement,
  newId,
  rangeCells,
  type CellRange,
  type CellRef,
  type DispatchOptions,
  type Slide,
  type TableElement,
  type TablePatch,
} from '@slidr/model';
import { useMemo } from 'react';
import { useStore } from 'zustand';
import { useDeck, useEditor, useSelection, type Editor } from '../shell';
import { fitRows, writeTable } from './fit';
import { selectedRange, tableSession } from './session';

/** What a table tool acts on: the one selected table, and its selected cells. */
export interface TableTarget {
  slideId: string;
  table: TableElement;
  /** The user is working inside the table: `range` is what they selected there. */
  inside: boolean;
  /** The text of a cell is being typed. */
  typing: boolean;
  /** The selected cells; the whole table when it is selected as an object. */
  range: CellRange;
  /** The cells of the range that are drawn: a merged area is its one anchor cell. */
  cells: CellRef[];
  /**
   * Writes a change of the table: one undo step, or a step of the gesture `txId`. With `fit` the
   * rows are then measured, for a change that can make text taller (see `fit.ts`).
   */
  write: (patch: TablePatch | undefined, options: DispatchOptions & { fit?: boolean }) => void;
}

function currentSlide({ bus, selection }: Editor): Slide | undefined {
  const { currentSlideId } = selection.getState();
  return currentSlideId ? bus.deck.slides.find((s) => s.id === currentSlideId) : undefined;
}

/** The table tools' target as it is now, for code that is not a component (the clipboard). */
export function tableTarget(editor: Editor): TableTarget | undefined {
  const { bus, selection } = editor;
  const { selectedElementIds, editingElementId } = selection.getState();
  const slide = currentSlide(editor);
  const id = selectedElementIds.length === 1 ? selectedElementIds[0] : undefined;
  const table = slide && id ? findElement(slide, id) : undefined;
  if (!slide || table?.type !== 'table') return undefined;
  const session = tableSession.getState();
  const inside = editingElementId === table.id && session.elementId === table.id;
  const range = selectedRange(table, session, editingElementId);
  const slideId = slide.id;
  return {
    slideId,
    table,
    inside,
    typing: inside && session.typing,
    range,
    cells: rangeCells(table, range),
    write: (patch, { fit, ...options }) => {
      if (!patch) return;
      const txId = options.txId ?? newId('tx');
      writeTable(bus, slideId, table.id, patch, { ...options, txId });
      if (fit) fitRows(bus, table.id, txId);
    },
  };
}

/**
 * The target of the table tools of row B. A tool gets only the kind of the selection: it reads
 * the table here, and follows the deck, the selection and the cells selected in the table.
 */
export function useTableTarget(): TableTarget | undefined {
  const editor = useEditor();
  const deck = useDeck((s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const selected = useSelection((s) => s.selectedElementIds);
  const editingId = useSelection((s) => s.editingElementId);
  const session = useStore(tableSession);
  // Each of these changes what the target is.
  return useMemo(
    () => tableTarget(editor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor, deck, slideId, selected, editingId, session],
  );
}
