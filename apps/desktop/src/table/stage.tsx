import {
  anchorOf,
  cellAt,
  cellBox,
  clearCells,
  findElementInDeck,
  fullRange,
  insertRows,
  neighbourCell,
  newId,
  nextCell,
  plainText,
  rangeCells,
  resizeColumn,
  resizeRow,
  tableSizes,
  unionBounds,
  type CellRef,
  type CommandBus,
  type Frame,
  type Point,
  type SelectionStore,
  type Slide,
  type TableElement,
  type Theme,
} from '@slidr/model';
import type { CellSlot } from '@slidr/renderer';
import { TextSelection } from '@tiptap/pm/state';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { useStore } from 'zustand';
import type { StageView } from '../stage/overlays';
import {
  apply,
  applyVector,
  elementMatrix,
  invert,
  screenTransform,
  type Located,
  type Matrix,
} from '../stage/space';
import { editorFor } from '../text/activeEditor';
import { onCellsWritten } from '../text/cellScope';
import { TextEditor } from '../text/TextEditor';
import { fitRows, writeTable } from './fit';
import {
  enterTable,
  selectCells,
  selectedRange,
  sessionCell,
  stopTyping,
  tableSession,
  typeIn,
  type Caret,
  type TableSession,
} from './session';

/*
 * The table on the Stage (WG6): what the Stage adds for a table, kept out of `Stage.tsx`.
 *
 * - A selected table is an object like any other: the Stage moves, resizes and rotates it. Over it
 *   lie the lines between its rows and columns, to drag (TBL-02).
 * - A double-click, or Enter, goes into the table (`selection.editingElementId`): its cells are
 *   then selected, by click, drag, Shift and the arrows, and a click types in a cell with the
 *   text editor of a text box (TBL-01). Tab and Shift+Tab move through the cells in reading
 *   order, which in a right-to-left table runs from the right.
 *
 * Everything drawn here is in screen pixels over the slide (RND-02), placed by the table's own map
 * to the slide, so it follows a table that is rotated or inside a group. Every change is one
 * `element.update`, and a drag is one transaction (ADR-007).
 */

type TableLocated = Located & { element: TableElement };

const isTable = (located: Located | undefined): located is TableLocated =>
  located?.element.type === 'table';

/*
 * The names of the undo steps made here, in English like the Stage's own ("Move", "Resize"): the
 * Stage is a component of its own and does not load the app's strings (ADR-012).
 */
const LABELS = {
  insertRow: 'Insert row',
  resizeColumn: 'Resize column',
  resizeRow: 'Resize row',
  clear: 'Clear cells',
};
const label = (key: keyof typeof LABELS) => LABELS[key];

// Text that was typed or formatted in cells may have made a row taller: the model follows.
onCellsWritten(fitRows);

const ACCENT = 'var(--color-ui-accent)';
const TINT = 'color-mix(in oklab, var(--color-ui-accent) 14%, transparent)';
/** How wide the area that grabs a line is, in screen pixels. */
const GRIP_PX = 8;

/* ---------------------------------------------------------------- the text editor in a cell */

interface CellEditorProps {
  bus: CommandBus;
  slideId: string;
  table: TableElement;
  cell: CellRef;
  theme: Theme;
  caret: Caret;
  onExit: () => void;
}

/**
 * The text editor of a text box, in a cell (TBL-01). Tab goes on to the next cell, and from the
 * last cell to a new row. A press on the cell beside its text puts the caret at the nearest place
 * in the text: the cell is larger than its text, and all of it is the cell's.
 */
function CellEditor({ bus, slideId, table, cell, theme, caret, onExit }: CellEditorProps) {
  const marker = useRef<HTMLSpanElement>(null);
  const tableId = table.id;
  const { row, col } = cell;

  useEffect(() => {
    const td = marker.current?.closest('td');
    if (!td) return;
    // Tells the Stage that a press here belongs to the editor (see `isInEditor`).
    td.setAttribute('data-cell-editing', '');
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-text-editor]')) return;
      const view = editorFor(tableId)?.editor.view;
      if (!view) return;
      event.preventDefault();
      const box = view.dom.getBoundingClientRect();
      const at = view.posAtCoords({
        left: Math.min(box.right - 1, Math.max(box.left + 1, event.clientX)),
        top: Math.min(box.bottom - 1, Math.max(box.top + 1, event.clientY)),
      });
      if (at) {
        const selection = TextSelection.near(view.state.doc.resolve(at.pos));
        view.dispatch(view.state.tr.setSelection(selection));
      }
      view.focus();
    };
    td.addEventListener('pointerdown', onPointerDown);
    return () => {
      td.removeAttribute('data-cell-editing');
      td.removeEventListener('pointerdown', onPointerDown);
    };
  }, [tableId]);

  const keys = useMemo(() => {
    const step = (by: 1 | -1): boolean => {
      const found = findElementInDeck(bus.deck, tableId);
      if (found?.element.type !== 'table') return true;
      const live = found.element;
      const next = nextCell(live, { row, col }, by);
      if (next) typeIn(next, 'all');
      else if (by === 1) {
        // Tab in the last cell goes on to a new row, like the row before it.
        const last = live.rows.length - 1;
        writeTable(bus, slideId, tableId, insertRows(live, last + 1, 1, last), {
          label: label('insertRow'),
        });
        typeIn({ row: last + 1, col: 0 }, 'all');
      }
      return true;
    };
    return { Tab: () => step(1), 'Shift-Tab': () => step(-1) };
  }, [bus, slideId, tableId, row, col]);

  return (
    <>
      <span ref={marker} hidden />
      <TextEditor
        bus={bus}
        slideId={slideId}
        element={table}
        cell={cell}
        theme={theme}
        caretAt={typeof caret === 'object' ? caret : undefined}
        select={caret === 'all' ? 'all' : 'end'}
        keys={keys}
        onExit={onExit}
      />
    </>
  );
}

/* ---------------------------------------------------------------- the overlay */

/** The drag of a line between rows or columns that is under way. One at a time. */
interface LineDrag {
  bus: CommandBus;
  kind: 'col' | 'row';
  index: number;
  txId: string;
  start: Point;
  /** The table, and the way from the slide to its own axes, as they were when the drag began. */
  table: TableElement;
  inverse: Matrix;
}

let lineDrag: LineDrag | null = null;

/** The handlers of the overlay set the drag through this: a component assigns to nothing outside it. */
function setLineDrag(drag: LineDrag | null): void {
  lineDrag = drag;
}

const sameCell = (a: CellRef, b: CellRef) => a.row === b.row && a.col === b.col;

function screenBox(box: Frame, scale: number): CSSProperties {
  return {
    position: 'absolute',
    left: box.x * scale,
    top: box.y * scale,
    width: box.w * scale,
    height: box.h * scale,
  };
}

interface TableOverlayProps {
  bus: CommandBus;
  slideId: string;
  located: TableLocated;
  view: StageView;
  /** `object`: the table is selected. `cells`: the user is working inside it. */
  mode: 'object' | 'cells';
  session: TableSession;
  toSlide: (clientX: number, clientY: number) => Point;
  focus: () => void;
}

function TableOverlay({
  bus,
  slideId,
  located,
  view,
  mode,
  session,
  toSlide,
  focus,
}: TableOverlayProps) {
  const table = located.element;
  const { scale } = view;
  const matrix = elementMatrix(located);
  const rtl = table.dir === 'rtl';
  const cells = mode === 'cells';
  const press = useRef<{ cell: CellRef; dragged: boolean } | null>(null);
  const frame = useRef<number | undefined>(undefined);

  /** The cell under the pointer, by where the model says the cells are. */
  const cellUnder = (event: PointerEvent): CellRef =>
    cellAt(table, apply(invert(matrix), toSlide(event.clientX, event.clientY)));

  // ---- Cells: a click types, a drag selects, Shift reaches from where the selection began.

  const onCellDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    const cell = cellUnder(event);
    if (event.shiftKey) {
      // Read from the store, not from the last render: events can come faster than renders.
      const { anchor } = tableSession.getState();
      selectCells(anchor, cell);
      press.current = { cell: anchor, dragged: true };
    } else {
      selectCells(cell);
      press.current = { cell, dragged: false };
    }
  };
  const onCellMove = (event: PointerEvent) => {
    const pressed = press.current;
    if (!pressed) return;
    event.stopPropagation();
    const cell = cellUnder(event);
    if (!pressed.dragged && sameCell(cell, pressed.cell)) return;
    pressed.dragged = true;
    if (!sameCell(cell, tableSession.getState().focus)) selectCells(pressed.cell, cell);
  };
  const onCellUp = (event: PointerEvent) => {
    const pressed = press.current;
    press.current = null;
    if (!pressed) return;
    event.stopPropagation();
    if (pressed.dragged) focus();
    else typeIn(pressed.cell, { x: event.clientX, y: event.clientY });
  };

  // ---- Lines: dragging one changes the column before it, or the row above it.

  const onLineDown = (event: PointerEvent, kind: 'col' | 'row', index: number) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setLineDrag({
      bus,
      kind,
      index,
      txId: newId('tx'),
      start: toSlide(event.clientX, event.clientY),
      table,
      inverse: invert(matrix),
    });
  };
  const onLineMove = (event: PointerEvent) => {
    const drag = lineDrag;
    if (!drag) return;
    event.stopPropagation();
    const p = toSlide(event.clientX, event.clientY);
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      if (lineDrag !== drag) return;
      // The pointer's way in the axes of the table, and along its reading direction.
      const way = applyVector(drag.inverse, { x: p.x - drag.start.x, y: p.y - drag.start.y });
      const patch =
        drag.kind === 'col'
          ? resizeColumn(
              drag.table,
              drag.index,
              Math.round(drag.table.dir === 'rtl' ? -way.x : way.x),
            )
          : resizeRow(drag.table, drag.index, Math.round(way.y));
      writeTable(bus, slideId, drag.table.id, patch, {
        txId: drag.txId,
        label: label(drag.kind === 'col' ? 'resizeColumn' : 'resizeRow'),
      });
    });
  };
  const onLineUp = (event: PointerEvent) => {
    const drag = lineDrag;
    if (!drag) return;
    event.stopPropagation();
    setLineDrag(null);
    // A narrower column wraps its text, and a row cannot be shorter than its text.
    fitRows(bus, drag.table.id, drag.txId);
    focus();
  };

  const sizes = tableSizes(table);
  const lines: ReactNode[] = [];
  const line = (kind: 'col' | 'row', index: number, at: number) => (
    <div
      key={`${kind}${index}`}
      {...(kind === 'col' ? { 'data-col-line': index } : { 'data-row-line': index })}
      onPointerDown={(event) => onLineDown(event, kind, index)}
      onPointerMove={onLineMove}
      onPointerUp={onLineUp}
      onPointerCancel={onLineUp}
      onDoubleClick={(event) => event.stopPropagation()}
      style={{
        position: 'absolute',
        ...(kind === 'col'
          ? { left: at * scale - GRIP_PX / 2, top: 0, width: GRIP_PX, height: '100%' }
          : { top: at * scale - GRIP_PX / 2, left: 0, height: GRIP_PX, width: '100%' }),
        cursor: kind === 'col' ? 'col-resize' : 'row-resize',
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
    />
  );
  // The outer edges of a table that is selected as an object are the Stage's: its handles.
  let x = 0;
  sizes.cols.forEach((width, i) => {
    x += width;
    if (i < sizes.cols.length - 1 || cells) lines.push(line('col', i, rtl ? table.frame.w - x : x));
  });
  let y = 0;
  sizes.rows.forEach((height, i) => {
    y += height;
    if (i < sizes.rows.length - 1 || cells) lines.push(line('row', i, y));
  });

  let selected: ReactNode = null;
  let targets: ReactNode = null;
  if (cells) {
    const range = selectedRange(table, session, table.id);
    const typingAt = session.typing
      ? anchorOf(table, sessionCell(table, session.focus))
      : undefined;
    const box = unionBounds([
      cellBox(table, { row: range.row0, col: range.col0 }),
      cellBox(table, anchorOf(table, { row: range.row1, col: range.col1 })),
    ]);
    selected = (
      <div
        {...(typingAt ? { 'data-table-typing': '' } : { 'data-table-selection': '' })}
        style={{
          ...screenBox(box, scale),
          boxSizing: 'border-box',
          border: `${typingAt ? 1.5 : 2}px solid ${ACCENT}`,
          background: typingAt ? undefined : TINT,
        }}
      />
    );
    targets = (
      <div
        onPointerDown={onCellDown}
        onPointerMove={onCellMove}
        onPointerUp={onCellUp}
        onPointerCancel={onCellUp}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        {rangeCells(table, fullRange(table)).map((cell) =>
          // The cell being typed in is the text editor's: nothing lies over it.
          typingAt && sameCell(cell, typingAt) ? null : (
            <div
              key={`${cell.row},${cell.col}`}
              data-table-cell={`${cell.row},${cell.col}`}
              style={{
                ...screenBox(cellBox(table, cell), scale),
                cursor: 'text',
                pointerEvents: 'auto',
                touchAction: 'none',
              }}
            />
          ),
        )}
      </div>
    );
  }

  return (
    <div
      data-table-overlay={table.id}
      data-mode={mode}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: table.frame.w * scale,
        height: table.frame.h * scale,
        transformOrigin: '0 0',
        transform: screenTransform(matrix, view.origin, scale),
      }}
    >
      {targets}
      {selected}
      {lines}
    </div>
  );
}

/* ---------------------------------------------------------------- the Stage's side */

export interface TableStageOptions {
  bus: CommandBus;
  selection: SelectionStore;
  slide: Slide | undefined;
  theme: Theme;
  /** Every element of the slide, with where it sits (`indexElements`). */
  index: ReadonlyMap<string, Located>;
  /** The one selected element, when exactly one is selected. */
  single: Located | undefined;
  editingId: string | null;
  view: StageView;
  /** From a point of the window to slide pixels. */
  toSlide: (clientX: number, clientY: number) => Point;
  /** Gives the keyboard back to the Stage. */
  focus: () => void;
}

export interface TableStage {
  /** For `SlideRenderer`: the text editor in the cell that is typed in. Undefined when none is. */
  cellSlot: CellSlot | undefined;
  /** Drawn with the Stage's other overlays, under its handles. */
  overlay: ReactNode;
  /** A key pressed on the Stage. True when it was the table's. */
  onKeyDown: (event: KeyboardEvent) => boolean;
  /** A double-click on an element. True when it was a table, and the user is now inside it. */
  onDoubleClick: (located: Located, event: MouseEvent) => boolean;
}

const FIRST: CellRef = { row: 0, col: 0 };

const ARROWS: Record<string, 'left' | 'right' | 'up' | 'down' | undefined> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

/** What the Stage needs for tables: see the top of this file. */
export function useTableStage({
  bus,
  selection,
  slide,
  theme,
  index,
  single,
  editingId,
  view,
  toSlide,
  focus,
}: TableStageOptions): TableStage {
  const session = useStore(tableSession);
  const editing = editingId ? index.get(editingId) : undefined;
  const entered = isTable(editing) && !editing.locked ? editing : undefined;
  const enteredId = entered?.element.id;

  useEffect(() => {
    // A locked table is not edited.
    if (isTable(editing) && editing.locked) selection.getState().stopEditing();
    // Something else started the editing (another area, a test): it begins at the first cell.
    else if (enteredId && tableSession.getState().elementId !== enteredId) {
      tableSession.setState({ elementId: enteredId, anchor: FIRST, focus: FIRST, typing: false });
    }
  }, [editing, enteredId, selection]);

  const inside = entered && session.elementId === enteredId ? entered : undefined;
  const typing = inside && session.typing ? inside.element : undefined;
  const typingAt = typing ? anchorOf(typing, sessionCell(typing, session.focus)) : undefined;
  const typingId = typing?.id;
  const typingRow = typingAt?.row;
  const typingCol = typingAt?.col;
  const slideId = slide?.id;
  const { caret } = session;

  const exit = useCallback(() => {
    stopTyping();
    focus();
  }, [focus]);

  const cellSlot = useMemo<CellSlot | undefined>(() => {
    if (!typingId || !slideId) return undefined;
    return (table, row, col) =>
      table.id === typingId && row === typingRow && col === typingCol ? (
        <CellEditor
          bus={bus}
          slideId={slideId}
          table={table}
          cell={{ row, col }}
          theme={theme}
          caret={caret}
          onExit={exit}
        />
      ) : undefined;
  }, [typingId, typingRow, typingCol, slideId, bus, theme, caret, exit]);

  // A table that is selected and nothing more shows its lines; inside it, its cells too.
  const shown = inside ?? (isTable(single) && !single.locked && !editingId ? single : undefined);
  const overlay =
    shown && slideId ? (
      <TableOverlay
        key={shown.element.id}
        bus={bus}
        slideId={slideId}
        located={shown}
        view={view}
        mode={inside ? 'cells' : 'object'}
        session={session}
        toSlide={toSlide}
        focus={focus}
      />
    ) : null;

  const onKeyDown = (event: KeyboardEvent): boolean => {
    if (lineDrag) {
      // Esc takes back the drag of a line, and nothing else.
      if (event.key !== 'Escape') return false;
      event.preventDefault();
      lineDrag.bus.rollback(lineDrag.txId);
      setLineDrag(null);
      return true;
    }
    if (!inside) {
      if (event.key !== 'Enter' || !isTable(single) || single.locked || editingId) return false;
      event.preventDefault();
      enterTable(selection, single.element.id, FIRST, 'all');
      return true;
    }
    // The session as it is now, not as it was drawn: keys can come faster than the Stage renders,
    // and each one moves on from where the one before it arrived.
    const now = tableSession.getState();
    if (now.typing || !slideId) return false;
    const table = inside.element;
    const at = anchorOf(table, sessionCell(table, now.focus));
    const side = ARROWS[event.key];
    let taken = true;
    if (side) {
      // The arrows are screen directions: in a right-to-left table "left" is the next column.
      const next = neighbourCell(table, at, side);
      if (next) selectCells(event.shiftKey ? now.anchor : next, next);
    } else if (event.key === 'Tab') {
      const next = nextCell(table, at, event.shiftKey ? -1 : 1);
      if (next) selectCells(next);
    } else if (event.key === 'Enter' || event.key === 'F2') {
      typeIn(at, 'end');
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      const cells = rangeCells(table, selectedRange(table, now, editingId));
      const hasText = cells.some((c) => plainText(table.cells[c.row]![c.col]!.content) !== '');
      if (hasText) {
        writeTable(bus, slideId, table.id, clearCells(table, cells), { label: label('clear') });
      }
    } else if (event.key === 'Escape') {
      // Out of the table: it stays selected, as an object.
      selection.getState().stopEditing();
    } else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyA') {
      const all = fullRange(table);
      selectCells({ row: all.row0, col: all.col0 }, { row: all.row1, col: all.col1 });
    } else taken = false;
    if (taken) event.preventDefault();
    return taken;
  };

  const onDoubleClick = (located: Located, event: MouseEvent): boolean => {
    if (!isTable(located) || located.locked) return false;
    const at = apply(invert(elementMatrix(located)), toSlide(event.clientX, event.clientY));
    enterTable(selection, located.element.id, cellAt(located.element, at), {
      x: event.clientX,
      y: event.clientY,
    });
    return true;
  };

  return { cellSlot, overlay, onKeyDown, onDoubleClick };
}
