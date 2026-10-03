import { describe, expect, it } from 'vitest';
import { CommandBus } from '../bus';
import { updateElement } from '../commands';
import { createDeck, createSlide, plainText, richText } from '../factories';
import { frameCenter, rotateVector } from '../geometry';
import { findElement } from '../queries';
import {
  TableElement,
  type Direction,
  type Frame,
  type Point,
  type Stroke,
  type TableCell,
} from '../schema';
import {
  anchorOf,
  canMerge,
  canSplit,
  cellAt,
  cellBox,
  cellRange,
  cellText,
  clearCells,
  deleteCols,
  deleteRows,
  distributeCols,
  distributeRows,
  expandRange,
  flipDirection,
  fullRange,
  insertCols,
  insertRows,
  mergeCells,
  MIN_COL,
  MIN_ROW,
  neighbourCell,
  newTable,
  nextCell,
  pasteGrid,
  rangeCells,
  resizeColumn,
  resizedFrame,
  resizeRow,
  setBorders,
  spanOf,
  splitCells,
  tableFromGrid,
  tableSizes,
  tableText,
  updateCells,
  withRowHeights,
  type BorderEdges,
  type CellRange,
  type CellRef,
  type TablePatch,
} from './index';

const FRAME: Frame = { x: 100, y: 200, w: 600, h: 300 };
const STROKE: Stroke = { color: { token: 'text' }, width: 2 };
const EMPTY: TableCell = { content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [] }] } };

/** Frozen all the way down, like everything in a deck that a bus holds. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** A frozen table that fills its frame, whose cells hold their place as text: "r0c0", "r0c1"... */
function grid(
  rows: number,
  cols: number,
  options: { dir?: Direction; frame?: Frame; rotation?: number } = {},
): TableElement {
  const table = newTable({
    rows,
    cols,
    frame: options.frame ?? FRAME,
    dir: options.dir ?? 'ltr',
    id: 'e_table',
  });
  return deepFreeze({
    ...table,
    rotation: options.rotation ?? 0,
    cells: table.cells.map((row, r) => row.map((_, c) => ({ content: richText(`r${r}c${c}`) }))),
  });
}

/** What every table must be: a rows x cols grid in which each cell is drawn by exactly one cell. */
function checkGrid(table: TableElement): void {
  expect(table.cells).toHaveLength(table.rows.length);
  const drawnBy = table.cells.map((row) => {
    expect(row).toHaveLength(table.cols.length);
    return row.map(() => 0);
  });
  table.cells.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell.merged) {
        // A covered cell has no span of its own.
        expect(cell.rowSpan).toBeUndefined();
        expect(cell.colSpan).toBeUndefined();
        return;
      }
      const rows = cell.rowSpan ?? 1;
      const cols = cell.colSpan ?? 1;
      // A span never leaves the grid.
      expect(r + rows).toBeLessThanOrEqual(table.rows.length);
      expect(c + cols).toBeLessThanOrEqual(table.cols.length);
      for (let i = r; i < r + rows; i++) {
        for (let j = c; j < c + cols; j++) {
          drawnBy[i]![j]! += 1;
          // An anchor covers only itself and `merged` cells.
          if (i !== r || j !== c) expect(table.cells[i]![j]!.merged).toBe(true);
        }
      }
    });
  });
  // No two spans overlap, and no `merged` cell is left without an anchor.
  expect(drawnBy.flat().every((count) => count === 1)).toBe(true);
}

/** The table after a patch: valid by the schema, a sound grid, and frozen again. */
function applied(table: TableElement, patch: TablePatch | undefined): TableElement {
  expect(patch).toBeDefined();
  const next = { ...table, ...patch };
  expect(TableElement.parse(next)).toEqual(next);
  checkGrid(next);
  return deepFreeze(next);
}

const at = (row: number, col: number): CellRef => ({ row, col });
const area = (row0: number, col0: number, row1: number, col1: number): CellRange => ({
  row0,
  col0,
  row1,
  col1,
});
const cell = (table: TableElement, row: number, col: number): TableCell => table.cells[row]![col]!;
const texts = (table: TableElement) => tableText(table, fullRange(table));
const total = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);
/** Sizes, give or take the noise of floating point. */
const near = (values: number[]) => values.map((value) => expect.closeTo(value, 6) as number);
/** Which cells of each row are covered. */
const covered = (table: TableElement) =>
  table.cells.map((row) => row.map((c) => Boolean(c.merged)));

function fillsFrame(table: TableElement): void {
  expect(total(table.rows)).toBeCloseTo(table.frame.h, 9);
  expect(total(table.cols)).toBeCloseTo(table.frame.w, 9);
}

/** Where a corner of a frame is on the slide, when the frame is turned around its centre. */
function corner(frame: Frame, rotation: number, x: 0 | 1, y: 0 | 1): Point {
  const center = frameCenter(frame);
  const offset = rotateVector({ x: (x - 0.5) * frame.w, y: (y - 0.5) * frame.h }, rotation);
  return { x: center.x + offset.x, y: center.y + offset.y };
}

function sameCorner(a: Frame, b: Frame, rotation: number, x: 0 | 1, y: 0 | 1): void {
  const before = corner(a, rotation, x, y);
  const after = corner(b, rotation, x, y);
  expect(after.x).toBeCloseTo(before.x, 9);
  expect(after.y).toBeCloseTo(before.y, 9);
}

/**
 * A 4 x 4 table with two merged areas:
 *
 *   A A . .
 *   A A . .
 *   . B B B
 *   . . . .
 */
function withAreas(dir: Direction = 'ltr'): TableElement {
  const base = grid(4, 4, { dir });
  const first = applied(base, mergeCells(base, area(0, 0, 1, 1)));
  return applied(first, mergeCells(first, area(2, 1, 2, 3)));
}

describe('newTable and tableSizes', () => {
  it('makes an even grid of empty cells that fills the frame', () => {
    const table = newTable({ rows: 2, cols: 3, frame: { x: 5, y: 6, w: 100, h: 50 }, dir: 'rtl' });
    expect(TableElement.parse(table)).toEqual(table);
    checkGrid(table);
    expect(table.id).toMatch(/^e_/);
    expect(table.frame).toEqual({ x: 5, y: 6, w: 100, h: 50 });
    expect(table.rows).toEqual([25, 25]);
    // To 2 decimals, and the last one takes the rest.
    expect(table.cols).toEqual(near([33.33, 33.33, 33.34]));
    fillsFrame(table);
    expect(table.dir).toBe('rtl');
    expect(table.style).toEqual({ headerRow: true, bandedRows: false, firstColumn: false });
    expect(table.cells.flat()).toHaveLength(6);
    for (const made of table.cells.flat()) expect(made).toEqual(EMPTY);
  });

  it('takes an id and a style', () => {
    const table = newTable({
      rows: 1,
      cols: 1,
      frame: FRAME,
      dir: 'ltr',
      id: 'e_mine',
      style: { headerRow: false, bandedRows: true },
    });
    expect(table).toMatchObject({
      id: 'e_mine',
      rows: [300],
      cols: [600],
      style: { headerRow: false, bandedRows: true, firstColumn: false },
    });
  });

  it('gives the sizes as drawn when the frame is not the sum of the rows and columns', () => {
    const scaled = deepFreeze({
      ...grid(2, 2),
      rows: [10, 30],
      cols: [100, 300],
      frame: { x: 0, y: 0, w: 800, h: 200 },
    });
    expect(tableSizes(scaled)).toEqual({ rows: [50, 150], cols: [200, 600] });
    // A table that fills its frame gives its own numbers.
    expect(tableSizes(grid(2, 2))).toEqual({ rows: [150, 150], cols: [300, 300] });
  });
});

describe('cells and ranges', () => {
  it('normalises a range, and knows the whole table', () => {
    expect(cellRange(at(2, 3), at(0, 1))).toEqual(area(0, 1, 2, 3));
    expect(cellRange(at(1, 1), at(1, 1))).toEqual(area(1, 1, 1, 1));
    expect(fullRange(grid(3, 5))).toEqual(area(0, 0, 2, 4));
  });

  it('finds the cell that draws at a position, and its span', () => {
    const table = withAreas();
    expect(anchorOf(table, at(1, 1))).toEqual(at(0, 0));
    expect(anchorOf(table, at(0, 0))).toEqual(at(0, 0));
    expect(anchorOf(table, at(2, 3))).toEqual(at(2, 1));
    expect(anchorOf(table, at(3, 3))).toEqual(at(3, 3));
    expect(spanOf(table, at(0, 0))).toEqual({ rows: 2, cols: 2 });
    expect(spanOf(table, at(2, 1))).toEqual({ rows: 1, cols: 3 });
    expect(spanOf(table, at(3, 0))).toEqual({ rows: 1, cols: 1 });
    // A covered cell has no span.
    expect(spanOf(table, at(1, 1))).toEqual({ rows: 1, cols: 1 });
  });

  it('grows a range until it cuts through no merged area', () => {
    const table = withAreas();
    expect(expandRange(table, area(1, 1, 1, 2))).toEqual(area(0, 0, 1, 2));
    // One area brings in the next.
    expect(expandRange(table, area(1, 1, 2, 1))).toEqual(area(0, 0, 2, 3));
    expect(expandRange(table, area(3, 0, 3, 3))).toEqual(area(3, 0, 3, 3));
    // What lies outside the table is cut off.
    expect(expandRange(table, area(-5, 2, 0, 99))).toEqual(area(0, 2, 0, 3));
    // A range given backwards is the same range.
    expect(expandRange(table, area(3, 3, 2, 2))).toEqual(area(2, 1, 3, 3));
  });

  it('lists the anchor cells of a range in reading order', () => {
    const table = withAreas();
    expect(rangeCells(table, fullRange(table))).toEqual([
      at(0, 0),
      at(0, 2),
      at(0, 3),
      at(1, 2),
      at(1, 3),
      at(2, 0),
      at(2, 1),
      at(3, 0),
      at(3, 1),
      at(3, 2),
      at(3, 3),
    ]);
    expect(rangeCells(table, area(1, 0, 2, 1))).toEqual([at(2, 0), at(2, 1)]);
  });

  it('steps to the next and the previous cell, as Tab does', () => {
    const table = withAreas();
    expect(nextCell(table, at(0, 0), 1)).toEqual(at(0, 2));
    expect(nextCell(table, at(0, 3), 1)).toEqual(at(1, 2));
    expect(nextCell(table, at(2, 1), 1)).toEqual(at(3, 0));
    expect(nextCell(table, at(3, 3), 1)).toBeUndefined();
    expect(nextCell(table, at(1, 2), -1)).toEqual(at(0, 3));
    expect(nextCell(table, at(3, 0), -1)).toEqual(at(2, 1));
    expect(nextCell(table, at(0, 0), -1)).toBeUndefined();
  });

  it('finds the neighbour on a side of the screen, past the cell own span', () => {
    const table = withAreas();
    expect(neighbourCell(table, at(0, 0), 'right')).toEqual(at(0, 2));
    expect(neighbourCell(table, at(0, 0), 'down')).toEqual(at(2, 0));
    expect(neighbourCell(table, at(0, 0), 'left')).toBeUndefined();
    expect(neighbourCell(table, at(0, 0), 'up')).toBeUndefined();
    expect(neighbourCell(table, at(2, 0), 'right')).toEqual(at(2, 1));
    expect(neighbourCell(table, at(2, 1), 'right')).toBeUndefined();
    expect(neighbourCell(table, at(2, 1), 'down')).toEqual(at(3, 1));
    // Into a merged area: its anchor.
    expect(neighbourCell(table, at(2, 1), 'up')).toEqual(at(0, 0));
    expect(neighbourCell(table, at(3, 3), 'up')).toEqual(at(2, 1));
    expect(neighbourCell(table, at(3, 3), 'down')).toBeUndefined();
  });

  it('takes left and right the other way round in an rtl table', () => {
    const table = withAreas('rtl');
    // Column 0 is drawn at the right.
    expect(neighbourCell(table, at(0, 0), 'left')).toEqual(at(0, 2));
    expect(neighbourCell(table, at(0, 0), 'right')).toBeUndefined();
    expect(neighbourCell(table, at(0, 3), 'right')).toEqual(at(0, 2));
    expect(neighbourCell(table, at(0, 3), 'left')).toBeUndefined();
    expect(neighbourCell(table, at(2, 1), 'right')).toEqual(at(2, 0));
    // Up and down do not depend on the direction.
    expect(neighbourCell(table, at(0, 0), 'down')).toEqual(at(2, 0));
  });
});

describe('cellBox and cellAt', () => {
  it('gives the box of a cell from the top-left corner of the frame', () => {
    const table = grid(2, 3);
    expect(cellBox(table, at(0, 0))).toEqual({ x: 0, y: 0, w: 200, h: 150 });
    expect(cellBox(table, at(1, 2))).toEqual({ x: 400, y: 150, w: 200, h: 150 });
  });

  it('draws column 0 at the right in an rtl table', () => {
    const table = grid(2, 3, { dir: 'rtl' });
    expect(cellBox(table, at(0, 0))).toEqual({ x: 400, y: 0, w: 200, h: 150 });
    expect(cellBox(table, at(1, 2))).toEqual({ x: 0, y: 150, w: 200, h: 150 });
    // A merged area of columns 0-1: the right two thirds.
    const merged = applied(table, mergeCells(table, area(0, 0, 1, 1)));
    expect(cellBox(merged, at(0, 0))).toEqual({ x: 200, y: 0, w: 400, h: 300 });
    // A covered cell is drawn by its area.
    expect(cellBox(merged, at(1, 1))).toEqual({ x: 200, y: 0, w: 400, h: 300 });
  });

  it('uses the sizes as drawn', () => {
    const scaled = deepFreeze({ ...grid(2, 3), frame: { x: 0, y: 0, w: 1200, h: 150 } });
    expect(cellBox(scaled, at(1, 1))).toEqual({ x: 400, y: 75, w: 400, h: 75 });
    expect(cellAt(scaled, { x: 1100, y: 100 })).toEqual(at(1, 2));
  });

  it('finds the cell under a point, and the nearest one for a point outside', () => {
    const table = grid(2, 3);
    expect(cellAt(table, { x: 10, y: 10 })).toEqual(at(0, 0));
    expect(cellAt(table, { x: 450, y: 200 })).toEqual(at(1, 2));
    expect(cellAt(table, { x: -50, y: 999 })).toEqual(at(1, 0));
    expect(cellAt(table, { x: 5000, y: -1 })).toEqual(at(0, 2));

    const rtl = grid(2, 3, { dir: 'rtl' });
    expect(cellAt(rtl, { x: 10, y: 10 })).toEqual(at(0, 2));
    expect(cellAt(rtl, { x: 590, y: 200 })).toEqual(at(1, 0));
    expect(cellAt(rtl, { x: -50, y: 10 })).toEqual(at(0, 2));
    // A point over a covered cell gives the anchor.
    const merged = applied(rtl, mergeCells(rtl, area(0, 0, 0, 1)));
    expect(cellAt(merged, { x: 250, y: 10 })).toEqual(at(0, 0));
  });

  it('agrees with itself: the middle of every box is in its cell', () => {
    for (const table of [withAreas('ltr'), withAreas('rtl')]) {
      for (const ref of rangeCells(table, fullRange(table))) {
        const box = cellBox(table, ref);
        expect(cellAt(table, { x: box.x + box.w / 2, y: box.y + box.h / 2 })).toEqual(ref);
      }
    }
  });
});

describe('insertRows and insertCols', () => {
  const look = {
    fill: { kind: 'solid', color: { token: 'surface' } },
    borders: { bottom: STROKE },
    vAlign: 'top',
    padding: { top: 4, right: 8, bottom: 4, left: 8 },
  } satisfies Partial<TableCell>;

  it('adds rows that look like their model, and grows the frame downwards', () => {
    const base = grid(3, 2);
    const styled = deepFreeze({
      ...base,
      cells: base.cells.map((row, r) =>
        r === 1
          ? row.map(() => ({
              ...look,
              content: richText('מחיר', {
                dir: 'rtl',
                align: 'center',
                marks: { weight: 700, size: 28 },
              }),
            }))
          : row,
      ),
    });
    const next = applied(styled, insertRows(styled, 2, 2, 1));
    expect(next.rows).toEqual([100, 100, 100, 100, 100]);
    expect(next.frame).toEqual({ ...FRAME, h: 500 });
    expect(next.cols).toEqual(styled.cols);
    expect(texts(next)).toEqual([
      ['r0c0', 'r0c1'],
      ['מחיר', 'מחיר'],
      ['', ''],
      ['', ''],
      ['r2c0', 'r2c1'],
    ]);
    // The look, and the formatting of the text without the text.
    expect(cell(next, 2, 0)).toEqual({
      ...look,
      content: {
        paragraphs: [
          { dir: 'rtl', align: 'center', runs: [{ text: '', marks: { weight: 700, size: 28 } }] },
        ],
      },
    });
    expect(cell(next, 3, 1)).toEqual(cell(next, 2, 0));
  });

  it('adds rows at the top and at the bottom', () => {
    const base = grid(2, 2);
    const top = applied(base, insertRows(base, 0, 1, 0));
    expect(texts(top)).toEqual([
      ['', ''],
      ['r0c0', 'r0c1'],
      ['r1c0', 'r1c1'],
    ]);
    // Text without formatting leaves an empty paragraph, which keeps the row a line tall.
    expect(cell(top, 0, 0)).toEqual(EMPTY);
    const bottom = applied(base, insertRows(base, 2, 1, 1));
    expect(texts(bottom).at(-1)).toEqual(['', '']);
    expect(bottom.frame).toEqual({ ...FRAME, h: 450 });
    expect(insertRows(base, 1, 0, 0)).toEqual({});
  });

  it('grows a merged area that the new rows cut through', () => {
    const base = grid(3, 3);
    const tall = applied(base, mergeCells(base, area(0, 1, 1, 2)));
    const next = applied(tall, insertRows(tall, 1, 2, 0));
    expect(cell(next, 0, 1)).toMatchObject({ rowSpan: 4, colSpan: 2 });
    expect(covered(next)).toEqual([
      [false, false, true],
      [false, true, true],
      [false, true, true],
      [false, true, true],
      [false, false, false],
    ]);
    // The new cells outside the area are cells of their own.
    expect(cell(next, 1, 0)).toEqual(EMPTY);
  });

  it('leaves a merged area alone when the new rows are at its edge', () => {
    const base = grid(3, 3);
    const tall = applied(base, mergeCells(base, area(0, 1, 1, 2)));
    const above = applied(tall, insertRows(tall, 0, 1, 0));
    expect(cell(above, 1, 1)).toMatchObject({ rowSpan: 2, colSpan: 2 });
    expect(covered(above)[0]).toEqual([false, false, false]);
    const below = applied(tall, insertRows(tall, 2, 1, 1));
    expect(cell(below, 0, 1)).toMatchObject({ rowSpan: 2, colSpan: 2 });
    expect(covered(below)[2]).toEqual([false, false, false]);
  });

  it('adds columns inside the same width', () => {
    const base = grid(2, 3);
    const patch = insertCols(base, 1, 1, 0);
    expect(patch.frame).toBeUndefined();
    const next = applied(base, patch);
    expect(next.cols).toEqual([150, 150, 150, 150]);
    expect(next.rows).toEqual(base.rows);
    expect(texts(next)).toEqual([
      ['r0c0', '', 'r0c1', 'r0c2'],
      ['r1c0', '', 'r1c1', 'r1c2'],
    ]);
    // A new column is as wide as its model, before all of them are scaled back.
    const uneven = deepFreeze({ ...base, cols: [300, 150, 150] });
    expect(applied(uneven, insertCols(uneven, 3, 1, 0)).cols).toEqual([200, 100, 100, 200]);
  });

  it('grows a merged area that the new columns cut through', () => {
    const base = grid(2, 3);
    const wide = applied(base, mergeCells(base, area(0, 0, 0, 1)));
    const next = applied(wide, insertCols(wide, 1, 2, 0));
    expect(cell(next, 0, 0).colSpan).toBe(4);
    expect(cell(next, 0, 0).rowSpan).toBeUndefined();
    expect(covered(next)).toEqual([
      [false, true, true, true, false],
      [false, false, false, false, false],
    ]);
    fillsFrame(next);
  });
});

describe('deleteRows and deleteCols', () => {
  it('removes rows and shrinks the frame', () => {
    const base = grid(4, 2);
    const next = applied(base, deleteRows(base, [1, 2, 2]));
    expect(next.rows).toEqual([75, 75]);
    expect(next.frame).toEqual({ ...FRAME, h: 150 });
    expect(texts(next)).toEqual([
      ['r0c0', 'r0c1'],
      ['r3c0', 'r3c1'],
    ]);
  });

  it('refuses to remove every row or every column', () => {
    const base = grid(2, 3);
    expect(deleteRows(base, [0, 1])).toBeUndefined();
    expect(deleteCols(base, [2, 0, 1])).toBeUndefined();
    // Rows that are not there are no rows to remove.
    expect(deleteRows(base, [7, -1])).toEqual({});
    expect(deleteCols(base, [3])).toEqual({});
  });

  it('hands a merged area to the first row that stays when its anchor row goes', () => {
    const base = grid(4, 3);
    const tall = applied(base, mergeCells(base, area(1, 0, 3, 1)));
    const next = applied(tall, deleteRows(tall, [1]));
    // The content and the look move down with the anchor.
    expect(cell(next, 1, 0)).toEqual({ ...cell(tall, 1, 0), rowSpan: 2 });
    expect(covered(next)).toEqual([
      [false, false, false],
      [false, true, false],
      [true, true, false],
    ]);
    expect(texts(next)[1]![2]).toBe('r2c2');
  });

  it('shortens a merged area whose anchor stays, and drops one that goes whole', () => {
    const base = grid(4, 3);
    const tall = applied(base, mergeCells(base, area(1, 0, 3, 1)));
    const shorter = applied(tall, deleteRows(tall, [2, 3]));
    expect(cell(shorter, 1, 0).rowSpan).toBeUndefined();
    expect(cell(shorter, 1, 0).colSpan).toBe(2);
    expect(cell(shorter, 1, 0).content).toEqual(cell(tall, 1, 0).content);
    const none = applied(tall, deleteRows(tall, [1, 2, 3]));
    expect(none.cells).toEqual([tall.cells[0]]);
    // A row out of its middle.
    const middle = applied(tall, deleteRows(tall, [2]));
    expect(cell(middle, 1, 0)).toEqual({ ...cell(tall, 1, 0), rowSpan: 2 });
    expect(covered(middle)[2]).toEqual([true, true, false]);
  });

  it('gives the table back when the rows or columns that were inserted are removed', () => {
    const table = withAreas();
    const rows = applied(table, insertRows(table, 1, 2, 0));
    expect(spanOf(rows, at(0, 0))).toEqual({ rows: 4, cols: 2 });
    expect(applied(rows, deleteRows(rows, [1, 2]))).toEqual(table);
    const cols = applied(table, insertCols(table, 2, 1, 1));
    expect(spanOf(cols, at(2, 1))).toEqual({ rows: 1, cols: 4 });
    expect(applied(cols, deleteCols(cols, [2]))).toEqual(table);
    // Widths that do not divide evenly come back to within the rounding (2 decimals).
    const three = applied(table, insertCols(table, 2, 3, 1));
    const back = applied(three, deleteCols(three, [2, 3, 4]));
    expect(back.cells).toEqual(table.cells);
    for (const width of back.cols) expect(width).toBeCloseTo(150, 1);
    fillsFrame(back);
  });

  it('removes columns inside the same width', () => {
    const base = grid(2, 4);
    const patch = deleteCols(base, [1]);
    expect(patch?.frame).toBeUndefined();
    const next = applied(base, patch);
    expect(next.cols).toEqual([200, 200, 200]);
    expect(texts(next)).toEqual([
      ['r0c0', 'r0c2', 'r0c3'],
      ['r1c0', 'r1c2', 'r1c3'],
    ]);
  });

  it('hands a merged area to the first column that stays when its anchor column goes', () => {
    const base = grid(2, 4);
    const wide = applied(base, mergeCells(base, area(0, 1, 1, 2)));
    const next = applied(wide, deleteCols(wide, [1]));
    const { colSpan: _colSpan, ...anchor } = cell(wide, 0, 1);
    expect(cell(next, 0, 1)).toEqual(anchor);
    expect(covered(next)).toEqual([
      [false, false, false],
      [false, true, false],
    ]);
    // Both of its columns: nothing is left of it.
    const none = applied(wide, deleteCols(wide, [1, 2]));
    expect(none.cells.flat().some((c) => c.merged || c.rowSpan || c.colSpan)).toBe(false);
    expect(texts(none)).toEqual([
      ['r0c0', 'r0c3'],
      ['r1c0', 'r1c3'],
    ]);
  });
});

describe('resizing rows and columns', () => {
  it('moves an inner line between two columns, and stops at the minimum width', () => {
    const base = grid(2, 3);
    expect(resizeColumn(base, 0, 50)).toEqual({ cols: [250, 150, 200] });
    expect(resizeColumn(base, 0, -500)).toEqual({ cols: [MIN_COL, 400 - MIN_COL, 200] });
    expect(resizeColumn(base, 1, 500)).toEqual({ cols: [200, 400 - MIN_COL, MIN_COL] });
    applied(base, resizeColumn(base, 1, -33.337));
    expect(resizeColumn(base, 9, 10)).toEqual({});
  });

  it('moves the last line with the frame, keeping the start edge of the table', () => {
    const ltr = grid(2, 3);
    expect(resizeColumn(ltr, 2, 40)).toEqual({
      cols: [200, 200, 240],
      frame: { ...FRAME, w: 640 },
    });
    // In an rtl table the last column is at the left: the right edge stays, and the frame's x moves.
    const rtl = grid(2, 3, { dir: 'rtl' });
    expect(resizeColumn(rtl, 2, 40)).toEqual({
      cols: [200, 200, 240],
      frame: { ...FRAME, x: 60, w: 640 },
    });
    expect(resizeColumn(rtl, 2, -1000)).toEqual({
      cols: [200, 200, MIN_COL],
      frame: { ...FRAME, x: 300 - MIN_COL, w: 400 + MIN_COL },
    });
    applied(rtl, resizeColumn(rtl, 2, 40));
  });

  it('changes the height of a row and of the frame', () => {
    const base = grid(3, 2);
    expect(resizeRow(base, 0, 30)).toEqual({
      rows: [130, 100, 100],
      frame: { ...FRAME, h: 330 },
    });
    expect(resizeRow(base, 1, -500)).toEqual({
      rows: [100, MIN_ROW, 100],
      frame: { ...FRAME, h: 200 + MIN_ROW },
    });
    applied(base, resizeRow(base, 2, 12.5));
    expect(resizeRow(base, 3, 10)).toEqual({});
  });

  it('does not make a row or a column that is under the minimum grow', () => {
    const small = grid(2, 2, { frame: { x: 0, y: 0, w: 30, h: 20 } });
    // They cannot shrink, and nothing else changes: an empty patch.
    expect(resizeColumn(small, 0, -5)).toEqual({});
    expect(resizeColumn(small, 1, -5)).toEqual({});
    expect(resizeRow(small, 0, -5)).toEqual({});
    expect(resizeRow(small, 0, 5)).toEqual({
      rows: [15, 10],
      frame: { x: 0, y: 0, w: 30, h: 25 },
    });
  });

  it('gives an empty patch for a change of size that changes nothing', () => {
    const base = grid(3, 3);
    expect(resizeColumn(base, 0, 0)).toEqual({});
    expect(resizeColumn(base, 2, 0)).toEqual({});
    expect(resizeRow(base, 1, 0)).toEqual({});
    expect(distributeRows(base, fullRange(base))).toEqual({});
    expect(distributeCols(base, fullRange(base))).toEqual({});
  });

  it('evens the rows and the columns of a range, keeping their total', () => {
    const base = deepFreeze({ ...grid(3, 4), rows: [50, 150, 100], cols: [100, 300, 50, 150] });
    expect(distributeRows(base, area(0, 0, 1, 0))).toEqual({ rows: [100, 100, 100] });
    const patch = distributeCols(base, area(0, 1, 0, 3));
    expect(patch.cols).toEqual(near([100, 166.67, 166.67, 166.66]));
    fillsFrame(applied(base, patch));
    expect(Object.keys(patch)).toEqual(['cols']);
  });

  it('takes measured row heights, and the frame follows', () => {
    const base = grid(3, 2);
    // Drawn at these heights already: nothing to change.
    expect(withRowHeights(base, [100, 100, 100])).toEqual({});
    const patch = withRowHeights(base, [100, 164.239, 100]);
    expect(patch).toEqual({ rows: near([100, 164.24, 100]), frame: { ...FRAME, h: 364.24 } });
    fillsFrame(applied(base, patch));
  });

  it('stores sizes that add up to the frame, also for a table whose frame was resized alone', () => {
    // Drawn: rows of 100, 200 and 300, and three columns of a third of 1000.
    const scaled = deepFreeze({
      ...grid(3, 3),
      rows: [10, 20, 30],
      cols: [1, 1, 1],
      frame: { x: 0, y: 0, w: 1000, h: 600 },
    });
    const wider = applied(scaled, resizeColumn(scaled, 0, 100));
    expect(wider.cols).toEqual(near([433.33, 233.33, 333.34]));
    // The rows are not touched by the drag, and come along so that they add up too.
    expect(wider.rows).toEqual(near([100, 200, 300]));
    expect(wider.frame).toBe(scaled.frame);
    const last = applied(scaled, resizeColumn(scaled, 2, 100));
    expect(last.cols).toEqual(near([333.33, 333.33, 433.34]));
    expect(last.frame.w).toBe(1100);
    const taller = applied(scaled, resizeRow(scaled, 0, 50));
    expect(taller.rows).toEqual(near([150, 200, 300]));
    expect(taller.frame.h).toBe(650);
    const more = applied(scaled, insertRows(scaled, 3, 1, 2));
    expect(more.rows).toEqual(near([100, 200, 300, 300]));
    expect(more.frame.h).toBe(900);
    const fewer = applied(scaled, deleteRows(scaled, [0]));
    expect(fewer.rows).toEqual(near([200, 300]));
    expect(fewer.frame.h).toBe(500);
    const added = applied(scaled, insertCols(scaled, 0, 1, 0));
    expect(added.cols).toEqual(near([250, 250, 250, 250]));
    const removed = applied(scaled, deleteCols(scaled, [0]));
    expect(removed.cols).toEqual(near([500, 500]));
    const evened = applied(scaled, distributeRows(scaled, fullRange(scaled)));
    expect(evened.rows).toEqual(near([200, 200, 200]));
    const measured = applied(scaled, withRowHeights(scaled, [100, 250, 300]));
    expect(measured.rows).toEqual(near([100, 250, 300]));
    for (const table of [wider, last, taller, more, fewer, added, removed, evened, measured]) {
      fillsFrame(table);
    }
  });
});

describe('resizedFrame', () => {
  const corners = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ] as const;

  it.each([0, 90, 30, -135, 360])(
    'keeps the anchored corner where it is on the slide at %i degrees',
    (rotation) => {
      for (const anchor of corners) {
        const next = resizedFrame(FRAME, rotation, { w: 740, h: 220 }, anchor);
        expect(next).toMatchObject({ w: 740, h: 220 });
        sameCorner(FRAME, next, rotation, anchor.x, anchor.y);
      }
    },
  );

  it('is exact for a frame that is not rotated', () => {
    expect(resizedFrame(FRAME, 0, { w: 740, h: 220 }, { x: 0, y: 0 })).toEqual({
      x: 100,
      y: 200,
      w: 740,
      h: 220,
    });
    expect(resizedFrame(FRAME, 0, { w: 740, h: 220 }, { x: 1, y: 1 })).toEqual({
      x: -40,
      y: 280,
      w: 740,
      h: 220,
    });
    // A side that keeps its length does not move, whatever the numbers.
    const odd = { x: 0.1, y: 0.2, w: 480, h: 0.3 };
    expect(resizedFrame(odd, 0, { w: 480, h: 0.7 }, { x: 1, y: 0 })).toEqual({ ...odd, h: 0.7 });
  });

  it('moves the frame of a table rotated by 90 degrees so that its corner stays', () => {
    // Turned a quarter: the top-left corner of the table is at the top right of what is seen.
    const turned = grid(3, 2, { rotation: 90 });
    const taller = applied(turned, insertRows(turned, 3, 1, 2));
    expect(taller.frame).toMatchObject({ w: 600, h: 400 });
    sameCorner(turned.frame, taller.frame, 90, 0, 0);
    // The frame did move: growing "down" is growing to the left on the slide.
    expect(taller.frame.x).not.toBeCloseTo(turned.frame.x, 3);

    const rtl = grid(2, 3, { dir: 'rtl', rotation: 90 });
    const wider = applied(rtl, resizeColumn(rtl, 2, 60));
    expect(wider.frame.w).toBe(660);
    // The start edge of an rtl table is its right edge.
    sameCorner(rtl.frame, wider.frame, 90, 1, 0);
    sameCorner(rtl.frame, wider.frame, 90, 1, 1);
  });

  it('does the same at 30 degrees, for every change of size', () => {
    const tilted = grid(3, 3, { rotation: 30 });
    const patches = [
      insertRows(tilted, 1, 2, 0),
      deleteRows(tilted, [0]),
      resizeRow(tilted, 1, 44),
      withRowHeights(tilted, [100, 180, 100]),
      resizeColumn(tilted, 2, -70),
    ];
    for (const patch of patches) {
      const next = applied(tilted, patch);
      expect(next.frame).not.toEqual(tilted.frame);
      sameCorner(tilted.frame, next.frame, 30, 0, 0);
    }
    const rtl = grid(3, 3, { dir: 'rtl', rotation: 30 });
    sameCorner(rtl.frame, applied(rtl, resizeColumn(rtl, 2, -70)).frame, 30, 1, 0);
  });

  it('keeps the start edge of a mirrored table, which is drawn at the other side', () => {
    const mirrored = deepFreeze({ ...grid(2, 3), flipH: true });
    expect(resizeColumn(mirrored, 2, 40).frame).toEqual({ ...FRAME, x: 60, w: 640 });
    const upsideDown = deepFreeze({ ...grid(2, 3), flipV: true });
    expect(resizeRow(upsideDown, 0, 40).frame).toEqual({ ...FRAME, y: 160, h: 340 });
  });
});

describe('mergeCells and splitCells', () => {
  it('merges a range into its first cell and keeps the texts in reading order', () => {
    const base = grid(3, 3);
    // A cell without text adds no empty line.
    const cleared = applied(base, clearCells(base, [at(0, 1)]));
    const next = applied(cleared, mergeCells(cleared, area(0, 0, 1, 1)));
    expect(cell(next, 0, 0)).toMatchObject({ rowSpan: 2, colSpan: 2 });
    expect(plainText(cell(next, 0, 0).content)).toBe('r0c0\nr1c0\nr1c1');
    expect(covered(next)).toEqual([
      [false, true, false],
      [true, true, false],
      [false, false, false],
    ]);
    expect(texts(next)).toEqual([
      ['r0c0\nr1c0\nr1c1', '', 'r0c2'],
      ['', '', 'r1c2'],
      ['r2c0', 'r2c1', 'r2c2'],
    ]);
  });

  it('keeps the look of the first cell, and each text in its own formatting', () => {
    const base = grid(1, 2);
    const fill = { kind: 'solid', color: { token: 'accent' } } as const;
    const bold = richText('מודגש', { dir: 'rtl', marks: { weight: 700 } });
    const styled = deepFreeze({
      ...base,
      cells: [
        [
          { content: richText(''), fill, vAlign: 'bottom' as const },
          { content: bold, fill: { kind: 'none' as const } },
        ],
      ],
    });
    const next = applied(styled, mergeCells(styled, fullRange(styled)));
    expect(cell(next, 0, 0)).toEqual({ content: bold, fill, vAlign: 'bottom', colSpan: 2 });
    // With no text at all, the first cell keeps its own (empty) text.
    const blank = applied(styled, clearCells(styled, [at(0, 1)]));
    expect(cell(applied(blank, mergeCells(blank, fullRange(blank))), 0, 0).content).toEqual(
      richText(''),
    );
  });

  it('takes in the whole of a merged area that the range touches', () => {
    const table = withAreas();
    // From a covered cell of A down to the anchor of B: all of both.
    const next = applied(table, mergeCells(table, area(1, 1, 2, 1)));
    expect(cell(next, 0, 0)).toMatchObject({ rowSpan: 3, colSpan: 4 });
    expect(rangeCells(next, area(0, 0, 2, 3))).toEqual([at(0, 0)]);
    expect(plainText(cell(next, 0, 0).content).split('\n')).toEqual([
      'r0c0',
      'r0c1',
      'r1c0',
      'r1c1',
      'r0c2',
      'r0c3',
      'r1c2',
      'r1c3',
      'r2c0',
      'r2c1',
      'r2c2',
      'r2c3',
    ]);
  });

  it('says when there is something to merge or to split', () => {
    const table = withAreas();
    expect(canMerge(table, area(3, 0, 3, 0))).toBe(false);
    expect(canMerge(table, area(3, 0, 3, 1))).toBe(true);
    // One merged area alone is one cell.
    expect(canMerge(table, area(0, 0, 1, 1))).toBe(false);
    expect(canMerge(table, area(0, 0, 0, 2))).toBe(true);
    expect(canSplit(table, area(3, 0, 3, 3))).toBe(false);
    expect(canSplit(table, area(0, 0, 0, 0))).toBe(true);
    // Through a covered cell too.
    expect(canSplit(table, area(2, 3, 3, 3))).toBe(true);
    expect(mergeCells(table, area(3, 0, 3, 0))).toBeUndefined();
    expect(mergeCells(table, area(0, 0, 1, 1))).toBeUndefined();
    expect(splitCells(table, area(3, 0, 3, 3))).toBeUndefined();
  });

  it('splits merged areas: the anchor keeps its content, the others take its look', () => {
    const base = grid(2, 3);
    const fill = { kind: 'solid', color: { token: 'accent' } } as const;
    const styled = applied(
      base,
      updateCells(base, [at(0, 0)], (c) => ({
        ...c,
        fill,
        content: richText('ראשון', { align: 'center', marks: { size: 40 } }),
      })),
    );
    const merged = applied(styled, mergeCells(styled, area(0, 0, 1, 1)));
    const next = applied(merged, splitCells(merged, area(1, 1, 1, 1)));
    const { rowSpan: _rowSpan, colSpan: _colSpan, ...anchor } = cell(merged, 0, 0);
    expect(cell(next, 0, 0)).toEqual(anchor);
    const blank = {
      fill,
      content: {
        paragraphs: [{ dir: 'auto', align: 'center', runs: [{ text: '', marks: { size: 40 } }] }],
      },
    };
    expect([cell(next, 0, 1), cell(next, 1, 0), cell(next, 1, 1)]).toEqual([blank, blank, blank]);
    expect(cell(next, 0, 2)).toBe(cell(merged, 0, 2));
    expect(canSplit(next, fullRange(next))).toBe(false);
  });
});

describe('cell properties', () => {
  it('changes the cells a function changes, and leaves the others as they are', () => {
    const base = grid(2, 2);
    const fill = { kind: 'solid', color: { token: 'accent' } } as const;
    const seen: CellRef[] = [];
    const patch = updateCells(base, [at(0, 0), at(1, 1), at(5, 5)], (c, where) => {
      seen.push(where);
      return where.row === 0 ? { ...c, fill } : c;
    });
    expect(seen).toEqual([at(0, 0), at(1, 1)]);
    const next = applied(base, patch);
    expect(cell(next, 0, 0)).toEqual({ ...cell(base, 0, 0), fill });
    expect(cell(next, 1, 1)).toBe(cell(base, 1, 1));
    expect(updateCells(base, [at(0, 0)], (c) => c)).toEqual({});
  });

  it('empties cells and keeps the formatting of their text', () => {
    const base = grid(2, 2);
    const fill = { kind: 'solid', color: { token: 'accent' } } as const;
    const styled = applied(
      base,
      updateCells(base, [at(0, 0)], () => ({
        fill,
        content: richText('כותרת\nשנייה', {
          dir: 'rtl',
          align: 'center',
          styleRef: 'heading',
          marks: { weight: 700, link: 'https://slidr.dev' },
        }),
      })),
    );
    const next = applied(styled, clearCells(styled, [at(0, 0), at(0, 1)]));
    // One paragraph, its fields and the marks; a link was that text's, and goes with it.
    expect(cell(next, 0, 0)).toEqual({
      fill,
      content: {
        paragraphs: [
          {
            dir: 'rtl',
            align: 'center',
            styleRef: 'heading',
            runs: [{ text: '', marks: { weight: 700 } }],
          },
        ],
      },
    });
    expect(cell(next, 0, 1)).toEqual(EMPTY);
    expect(texts(next)).toEqual([
      ['', ''],
      ['r1c0', 'r1c1'],
    ]);
    // Nothing to empty: nothing to change.
    expect(clearCells(next, [at(0, 0), at(0, 1)])).toEqual({});
  });

  it('mirrors the table: its direction, and the left and right of every cell', () => {
    const base = grid(2, 2);
    const lopsided = applied(
      base,
      updateCells(base, [at(0, 0)], (c) => ({
        ...c,
        borders: { left: STROKE, top: STROKE },
        padding: { top: 1, right: 2, bottom: 3, left: 4 },
      })),
    );
    const flipped = applied(lopsided, flipDirection(lopsided));
    expect(flipped.dir).toBe('rtl');
    expect(cell(flipped, 0, 0).borders).toEqual({ right: STROKE, top: STROKE });
    expect(cell(flipped, 0, 0).padding).toEqual({ top: 1, right: 4, bottom: 3, left: 2 });
    expect(cell(flipped, 0, 0).content).toBe(cell(lopsided, 0, 0).content);
    expect(cell(flipped, 1, 1)).toBe(cell(lopsided, 1, 1));
    // Twice is the table it was.
    expect(applied(flipped, flipDirection(flipped))).toEqual(lopsided);
    // With nothing to mirror, only the direction changes.
    expect(flipDirection(base)).toEqual({ dir: 'rtl' });
    expect(flipDirection(grid(1, 1, { dir: 'rtl' }))).toEqual({ dir: 'ltr' });
  });
});

describe('setBorders', () => {
  const ALL = { top: STROKE, right: STROKE, bottom: STROKE, left: STROKE };
  /** The sides that each cell has a border on, e.g. "bottom left". */
  const sides = (table: TableElement) =>
    table.cells.map((row) =>
      row.map((c) =>
        Object.keys(c.borders ?? {})
          .sort()
          .join(' '),
      ),
    );

  it('writes a line on both cells that share it, also outside the range', () => {
    const base = grid(3, 3);
    const next = applied(base, setBorders(base, area(1, 1, 1, 1), 'outer', STROKE));
    expect(cell(next, 1, 1).borders).toEqual(ALL);
    expect(cell(next, 0, 1).borders).toEqual({ bottom: STROKE });
    expect(cell(next, 2, 1).borders).toEqual({ top: STROKE });
    expect(cell(next, 1, 0).borders).toEqual({ right: STROKE });
    expect(cell(next, 1, 2).borders).toEqual({ left: STROKE });
    // The corners share no line with the cell.
    expect(cell(next, 0, 0)).toBe(cell(base, 0, 0));
    expect(cell(next, 2, 2)).toBe(cell(base, 2, 2));
  });

  it('tells the outline of a range from the lines inside it', () => {
    const base = grid(3, 3);
    const on = (edges: BorderEdges) =>
      sides(applied(base, setBorders(base, area(0, 0, 1, 1), edges, STROKE)));
    expect(on('outer')).toEqual([
      ['left top', 'right top', 'left'],
      ['bottom left', 'bottom right', 'left'],
      ['top', 'top', ''],
    ]);
    expect(on('inner')).toEqual([
      ['bottom right', 'bottom left', ''],
      ['right top', 'left top', ''],
      ['', '', ''],
    ]);
    expect(on('innerHorizontal')).toEqual([
      ['bottom', 'bottom', ''],
      ['top', 'top', ''],
      ['', '', ''],
    ]);
    expect(on('innerVertical')).toEqual([
      ['right', 'left', ''],
      ['right', 'left', ''],
      ['', '', ''],
    ]);
    expect(on('all')).toEqual([
      ['bottom left right top', 'bottom left right top', 'left'],
      ['bottom left right top', 'bottom left right top', 'left'],
      ['top', 'top', ''],
    ]);
    expect(on('top')).toEqual([
      ['top', 'top', ''],
      ['', '', ''],
      ['', '', ''],
    ]);
    expect(on('bottom')).toEqual([
      ['', '', ''],
      ['bottom', 'bottom', ''],
      ['top', 'top', ''],
    ]);
    expect(on('left')).toEqual([
      ['left', '', ''],
      ['left', '', ''],
      ['', '', ''],
    ]);
    expect(on('right')).toEqual([
      ['', 'right', 'left'],
      ['', 'right', 'left'],
      ['', '', ''],
    ]);
    // A single cell has no lines inside it.
    expect(setBorders(base, area(1, 1, 1, 1), 'inner', STROKE)).toEqual({});
  });

  it('takes left and right as sides of the screen in an rtl table', () => {
    const rtl = grid(2, 3, { dir: 'rtl' });
    // Columns 0-1 are the right two: their left edge is the far side of column 1.
    const left = applied(rtl, setBorders(rtl, area(0, 0, 0, 1), 'left', STROKE));
    expect(sides(left)).toEqual([
      ['', 'left', 'right'],
      ['', '', ''],
    ]);
    const right = applied(rtl, setBorders(rtl, area(0, 0, 0, 1), 'right', STROKE));
    expect(sides(right)).toEqual([
      ['right', '', ''],
      ['', '', ''],
    ]);
    // The line between the two columns: the left of column 0, the right of column 1.
    const inner = applied(rtl, setBorders(rtl, area(0, 0, 0, 1), 'innerVertical', STROKE));
    expect(sides(inner)).toEqual([
      ['left', 'right', ''],
      ['', '', ''],
    ]);
  });

  it('gives a cell the borders of its table style before it changes one of them', () => {
    const base = grid(2, 2);
    const rule: Stroke = { color: { token: 'muted' }, width: 1 };
    const asked: CellRef[] = [];
    const next = applied(
      base,
      setBorders(base, area(0, 0, 0, 0), 'bottom', STROKE, (c, where) => {
        expect(c).toBe(cell(base, where.row, where.col));
        asked.push(where);
        return { bottom: rule, left: rule };
      }),
    );
    // The cell and the neighbour under it were changed, each from what it showed.
    expect(asked).toEqual([at(0, 0), at(1, 0)]);
    expect(cell(next, 0, 0).borders).toEqual({ bottom: STROKE, left: rule });
    expect(cell(next, 1, 0).borders).toEqual({ top: STROKE, bottom: rule, left: rule });
    // Without a style to ask, a cell shows no borders.
    const plain = applied(base, setBorders(base, area(0, 0, 0, 0), 'top', STROKE));
    expect(cell(plain, 0, 0).borders).toEqual({ top: STROKE });
    // Borders that are already written are what the cell shows; the style is not asked.
    const again = setBorders(next, area(0, 0, 0, 0), 'top', STROKE, () => {
      throw new Error('not asked');
    });
    expect(cell(applied(next, again), 0, 0).borders).toEqual({
      top: STROKE,
      bottom: STROKE,
      left: rule,
    });
  });

  it('removes a line from both cells that share it', () => {
    const base = grid(2, 2);
    const lined = applied(base, setBorders(base, fullRange(base), 'all', STROKE));
    expect(lined.cells.flat().map((c) => c.borders)).toEqual([ALL, ALL, ALL, ALL]);
    const cut = applied(lined, setBorders(lined, area(0, 0, 0, 0), 'right', null));
    expect(sides(cut)).toEqual([
      ['bottom left top', 'bottom right top'],
      ['bottom left right top', 'bottom left right top'],
    ]);
  });

  it("removes every border in and around the range for 'none', whatever the stroke", () => {
    const base = grid(2, 2);
    const lined = applied(base, setBorders(base, fullRange(base), 'all', STROKE));
    const bare = applied(lined, setBorders(lined, area(0, 0, 0, 0), 'none', STROKE));
    // An empty `borders` is no border at all, not "ask the style".
    expect(cell(bare, 0, 0).borders).toEqual({});
    expect(sides(bare)).toEqual([
      ['', 'bottom right top'],
      ['bottom left right', 'bottom left right top'],
    ]);
  });

  it('takes a merged area as one cell with the edges of its whole span', () => {
    const base = grid(3, 3);
    const merged = applied(base, mergeCells(base, area(0, 0, 1, 1)));
    // A range that cuts through the area is the area.
    const next = applied(merged, setBorders(merged, area(1, 1, 1, 1), 'outer', STROKE));
    expect(sides(next)).toEqual([
      ['bottom left right top', '', 'left'],
      ['', '', 'left'],
      ['top', 'top', ''],
    ]);
    // There is no line inside it.
    expect(setBorders(merged, area(0, 0, 1, 1), 'inner', STROKE)).toEqual({});
    expect(sides(applied(merged, setBorders(merged, area(0, 0, 1, 2), 'inner', STROKE)))).toEqual([
      ['right', '', 'bottom left'],
      ['', '', 'left top'],
      ['', '', ''],
    ]);
  });

  it('writes on a merged neighbour only when its whole side lies along the range', () => {
    const base = grid(3, 3);
    const merged = applied(base, mergeCells(base, area(0, 0, 1, 1)));
    // The area above is two columns wide: a line over one column cannot be half of its side.
    const half = applied(merged, setBorders(merged, area(2, 0, 2, 0), 'top', STROKE));
    expect(sides(half)).toEqual([
      ['', '', ''],
      ['', '', ''],
      ['top', '', ''],
    ]);
    const whole = applied(merged, setBorders(merged, area(2, 0, 2, 1), 'top', STROKE));
    expect(sides(whole)).toEqual([
      ['bottom', '', ''],
      ['', '', ''],
      ['top', 'top', ''],
    ]);
  });
});

describe('text in and out', () => {
  it('gives text the formatting of the content it replaces', () => {
    const like = richText('ישן\nעוד', {
      dir: 'rtl',
      align: 'end',
      marks: { size: 24, link: 'https://slidr.dev' },
    });
    expect(cellText(like, 'חדש\n\nשורה')).toEqual({
      paragraphs: [
        { dir: 'rtl', align: 'end', runs: [{ text: 'חדש', marks: { size: 24 } }] },
        { dir: 'rtl', align: 'end', runs: [{ text: '', marks: { size: 24 } }] },
        { dir: 'rtl', align: 'end', runs: [{ text: 'שורה', marks: { size: 24 } }] },
      ],
    });
    // Without anything to follow: plain paragraphs, one per line, with any kind of line break.
    expect(cellText(undefined, 'a\r\nb\rc')).toEqual(richText('a\nb\nc'));
    expect(cellText({ paragraphs: [] }, '')).toEqual(EMPTY.content);
  });

  it('writes a grid of texts from a cell on, in the formatting of the cells', () => {
    const base = grid(3, 3);
    const big = applied(
      base,
      updateCells(base, [at(1, 1)], (c) => ({
        ...c,
        content: richText('ישן', { marks: { size: 40 } }),
      })),
    );
    const { patch, range } = pasteGrid(big, at(1, 1), [
      ['a', 'b'],
      ['c', 'd\ne'],
    ]);
    expect(range).toEqual(area(1, 1, 2, 2));
    expect(Object.keys(patch)).toEqual(['cells']);
    const next = applied(big, patch);
    expect(texts(next)).toEqual([
      ['r0c0', 'r0c1', 'r0c2'],
      ['r1c0', 'a', 'b'],
      ['r2c0', 'c', 'd\ne'],
    ]);
    expect(cell(next, 1, 1).content.paragraphs[0]?.runs).toEqual([
      { text: 'a', marks: { size: 40 } },
    ]);
    expect(cell(next, 2, 2).content.paragraphs).toHaveLength(2);
    expect(cell(next, 0, 0)).toBe(cell(big, 0, 0));
  });

  it('grows the table by the rows and columns the grid needs', () => {
    const base = grid(2, 2);
    const { patch, range } = pasteGrid(base, at(1, 1), [
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
      ['g', 'h', 'i'],
    ]);
    expect(range).toEqual(area(1, 1, 3, 3));
    const next = applied(base, patch);
    // Rows are added under the table; columns inside its width.
    expect(next.rows).toEqual([150, 150, 150, 150]);
    expect(next.frame).toEqual({ ...FRAME, h: 600 });
    expect(next.cols).toEqual([150, 150, 150, 150]);
    expect(texts(next)).toEqual([
      ['r0c0', 'r0c1', '', ''],
      ['r1c0', 'a', 'b', 'c'],
      ['', 'd', 'e', 'f'],
      ['', 'g', 'h', 'i'],
    ]);
    fillsFrame(next);
  });

  it('splits the merged areas the grid lands on', () => {
    const base = grid(3, 3);
    const merged = applied(base, mergeCells(base, area(0, 0, 1, 1)));
    const { patch, range } = pasteGrid(merged, at(1, 1), [['x', 'y']]);
    expect(range).toEqual(area(1, 1, 1, 2));
    const next = applied(merged, patch);
    expect(next.cells.flat().some((c) => c.merged || c.rowSpan || c.colSpan)).toBe(false);
    expect(texts(next)).toEqual([
      ['r0c0\nr0c1\nr1c0\nr1c1', '', 'r0c2'],
      ['', 'x', 'y'],
      ['r2c0', 'r2c1', 'r2c2'],
    ]);
  });

  it('leaves the table alone for an empty grid, and the cells past the end of a short row', () => {
    const base = grid(2, 2);
    expect(pasteGrid(base, at(1, 0), [])).toEqual({ patch: {}, range: area(1, 0, 1, 0) });
    expect(pasteGrid(base, at(1, 0), [[]])).toEqual({ patch: {}, range: area(1, 0, 1, 0) });
    const { patch, range } = pasteGrid(base, at(0, 0), [['a', 'b'], ['c']]);
    expect(range).toEqual(area(0, 0, 1, 1));
    expect(texts(applied(base, patch))).toEqual([
      ['a', 'b'],
      ['c', 'r1c1'],
    ]);
  });

  it('lays a grid of texts out as a table, with columns by the length of their text', () => {
    const long = 'טקסט ארוך מאוד שמבקש עמודה רחבה הרבה יותר מהאחרות';
    const table = tableFromGrid([['שם', 'תיאור'], ['א', long], ['ב']], {
      frame: { x: 10, y: 20, w: 900, h: 300 },
      dir: 'rtl',
      id: 'e_new',
    });
    expect(TableElement.parse(table)).toEqual(table);
    checkGrid(table);
    fillsFrame(table);
    expect(table).toMatchObject({
      id: 'e_new',
      dir: 'rtl',
      frame: { x: 10, y: 20, w: 900, h: 300 },
      rows: [100, 100, 100],
      style: { headerRow: true, bandedRows: false, firstColumn: false },
    });
    // The short column is not squeezed under 60% of the average width.
    expect(table.cols).toEqual(near([270, 630]));
    expect(texts(table)).toEqual([
      ['שם', 'תיאור'],
      ['א', long],
      ['ב', ''],
    ]);
    expect(cell(table, 0, 0)).toEqual({ content: richText('שם') });
    expect(cell(table, 2, 1)).toEqual(EMPTY);
  });

  it('keeps every column between 60% and 240% of the average width', () => {
    const table = tableFromGrid([['x'.repeat(400), 'a', 'b', 'c', 'd', 'e']], {
      frame: { x: 0, y: 0, w: 1200, h: 100 },
      dir: 'ltr',
      headerRow: false,
    });
    expect(table.style.headerRow).toBe(false);
    // The average is 200: the long column gets 480, and the others share the rest.
    expect(table.cols).toEqual(near([480, 144, 144, 144, 144, 144]));
    // Equal texts, equal columns; no text at all is one empty cell.
    expect(tableFromGrid([['ab', 'cd', 'ef']], { frame: FRAME, dir: 'ltr' }).cols).toEqual([
      200, 200, 200,
    ]);
    const empty = tableFromGrid([], { frame: FRAME, dir: 'ltr' });
    expect(empty).toMatchObject({ rows: [300], cols: [600], cells: [[EMPTY]] });
  });

  it('gives the texts of a range, with nothing for covered cells', () => {
    const base = grid(2, 3);
    const merged = applied(base, mergeCells(base, area(0, 0, 0, 1)));
    expect(tableText(merged, fullRange(merged))).toEqual([
      ['r0c0\nr0c1', '', 'r0c2'],
      ['r1c0', 'r1c1', 'r1c2'],
    ]);
    expect(tableText(merged, area(1, 1, 9, 9))).toEqual([['r1c1', 'r1c2']]);
  });
});

describe('on the command bus', () => {
  it('applies every operation as one element.update, which is one undo step', () => {
    const table = deepFreeze({ ...withAreas('rtl'), cols: [100, 200, 150, 150] });
    const deck = createDeck({ slides: [createSlide({ id: 's1', elements: [table] })] });
    const patches: (TablePatch | undefined)[] = [
      insertRows(table, 1, 2, 0),
      insertCols(table, 2, 1, 3),
      deleteRows(table, [0]),
      deleteCols(table, [1, 2]),
      resizeColumn(table, 3, 80),
      resizeRow(table, 2, -20),
      distributeCols(table, fullRange(table)),
      withRowHeights(table, [75, 120, 75, 75]),
      mergeCells(table, area(1, 1, 3, 2)),
      splitCells(table, fullRange(table)),
      setBorders(table, area(2, 0, 3, 1), 'all', STROKE),
      clearCells(table, rangeCells(table, fullRange(table))),
      flipDirection(table),
      pasteGrid(table, at(3, 3), [
        ['a', 'b'],
        ['c', 'd'],
      ]).patch,
    ];
    for (const patch of patches) {
      const bus = new CommandBus(deck, { validate: true });
      expect(patch).toBeDefined();
      bus.dispatch(updateElement('s1', table.id, patch!));
      expect(bus.undoStack).toHaveLength(1);
      const changed = findElement(bus.deck.slides[0]!, table.id) as TableElement;
      expect(changed).toEqual({ ...table, ...patch });
      expect(changed).not.toEqual(table);
      checkGrid(changed);

      expect(bus.undo()).toBe(true);
      expect(findElement(bus.deck.slides[0]!, table.id)).toEqual(table);
      expect(bus.deck).toEqual(deck);
      expect(bus.canUndo).toBe(false);
    }
  });

  it('changes nothing for an empty patch', () => {
    const table = grid(2, 2);
    const deck = createDeck({ slides: [createSlide({ id: 's1', elements: [table] })] });
    const bus = new CommandBus(deck);
    bus.dispatch(updateElement('s1', table.id, withRowHeights(table, [150, 150])));
    expect(bus.canUndo).toBe(false);
  });
});

describe('a frozen table', () => {
  it('is never changed by an operation', () => {
    // Everything above ran on frozen tables too; this spells it out for one of each kind.
    const table = withAreas();
    const copy = JSON.stringify(table);
    const everywhere = rangeCells(table, fullRange(table));
    tableSizes(table);
    expandRange(table, area(1, 1, 2, 1));
    insertRows(table, 1, 1, 0);
    insertCols(table, 1, 1, 0);
    deleteRows(table, [0, 2]);
    deleteCols(table, [0, 2]);
    resizeColumn(table, 0, 10);
    resizeColumn(table, 3, 10);
    resizeRow(table, 0, 10);
    distributeRows(table, fullRange(table));
    distributeCols(table, fullRange(table));
    withRowHeights(table, [10, 20, 30, 40]);
    mergeCells(table, fullRange(table));
    splitCells(table, fullRange(table));
    updateCells(table, everywhere, (c) => ({ ...c, vAlign: 'bottom' }));
    setBorders(table, fullRange(table), 'all', STROKE);
    setBorders(table, fullRange(table), 'none', null);
    clearCells(table, everywhere);
    flipDirection(table);
    pasteGrid(table, at(0, 0), [['a', 'b', 'c', 'd', 'e']]);
    tableText(table, fullRange(table));
    expect(JSON.stringify(table)).toBe(copy);
  });
});
