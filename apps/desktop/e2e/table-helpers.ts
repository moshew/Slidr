import { expect, type Locator, type Page } from '@playwright/test';
import type { TableCell, TableElement } from '@slidr/model';

/* Shared by the table specs (WG6): a table on the app's first slide, and the table as the model has it. */

interface Harness {
  bus: {
    deck: { slides: { id: string; elements: { id: string; type: string }[] }[] };
    undoStack: unknown[];
    dispatch(command: unknown, options?: unknown): unknown;
    undo(): boolean;
    redo(): boolean;
  };
  selection: {
    getState(): {
      currentSlideId: string | null;
      selectedElementIds: string[];
      editingElementId: string | null;
      selectElements(ids: string[]): void;
      startEditing(id: string): void;
      stopEditing(): void;
    };
  };
}

declare global {
  interface Window {
    slidrTest?: Harness;
  }
}

const harness = () => (window as unknown as { slidr: Harness }).slidr;

export const stage = (page: Page) => page.getByTestId('stage-surface');

/** A table as the Stage draws it. */
export const tableOnStage = (page: Page, id: string): Locator =>
  page.getByTestId('stage-frame').locator(`[data-element-id="${id}"]`);

/** A cell of a table on the Stage: the `<td>` of the slide. */
export const cellOnStage = (page: Page, id: string, row: number, col: number): Locator =>
  tableOnStage(page, id).locator(`td[data-row="${row}"][data-col="${col}"]`);

/** What lies over a table while the user is inside it: its cells, to click. */
export const cellTarget = (page: Page, row: number, col: number): Locator =>
  stage(page).locator(`[data-table-cell="${row},${col}"]`);

const paragraph = (text: string) => ({
  dir: 'auto',
  align: 'start',
  runs: text ? [{ text }] : [],
});

export const cell = (text = '', extra: Partial<TableCell> = {}): TableCell =>
  ({ content: { paragraphs: text.split('\n').map(paragraph) }, ...extra }) as TableCell;

export interface TableInit {
  id?: string;
  frame?: { x: number; y: number; w: number; h: number };
  dir?: 'rtl' | 'ltr';
  texts: string[][];
  rows?: number[];
  cols?: number[];
  style?: Partial<TableElement['style']>;
  extra?: Record<string, unknown>;
}

/** Adds a table to the current slide: a grid of texts, even rows and columns unless given. */
export async function addTable(page: Page, init: TableInit): Promise<string> {
  const id = init.id ?? 'e_table';
  const frame = init.frame ?? { x: 360, y: 240, w: 1200, h: init.texts.length * 80 };
  const rowCount = init.texts.length;
  const colCount = init.texts[0]?.length ?? 0;
  const element = {
    id,
    type: 'table',
    frame,
    rotation: 0,
    opacity: 1,
    rows: init.rows ?? Array.from({ length: rowCount }, () => frame.h / rowCount),
    cols: init.cols ?? Array.from({ length: colCount }, () => frame.w / colCount),
    dir: init.dir ?? 'ltr',
    style: { headerRow: true, bandedRows: false, firstColumn: false, ...init.style },
    cells: init.texts.map((row) => row.map((text) => cell(text))),
    ...init.extra,
  };
  await page.evaluate((el) => {
    const { bus, selection } = (window as unknown as { slidr: Harness }).slidr;
    bus.dispatch({
      type: 'element.add',
      slideId: selection.getState().currentSlideId,
      element: el,
    });
  }, element);
  await tableOnStage(page, id).waitFor();
  return id;
}

/** The table as the model has it now. */
export function table(page: Page, id = 'e_table'): Promise<TableElement> {
  return page.evaluate((elementId) => {
    const { bus } = (window as unknown as { slidr: Harness }).slidr;
    for (const slide of bus.deck.slides) {
      const found = slide.elements.find((e) => e.id === elementId);
      if (found) return found as unknown as TableElement;
    }
    throw new Error(`No table ${elementId}`);
  }, id);
}

const textOf = (c: TableCell) =>
  c.content.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');

/** The texts of the cells, row by row. */
export async function texts(page: Page, id = 'e_table'): Promise<string[][]> {
  return (await table(page, id)).cells.map((row) => row.map(textOf));
}

export function steps(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { slidr: Harness }).slidr.bus.undoStack.length);
}

export function editingId(page: Page): Promise<string | null> {
  return page.evaluate(
    () => (window as unknown as { slidr: Harness }).slidr.selection.getState().editingElementId,
  );
}

/** Selects a table as an object, with the keyboard on the Stage. */
export async function selectTable(page: Page, id = 'e_table'): Promise<void> {
  await page.evaluate((elementId) => {
    (window as unknown as { slidr: Harness }).slidr.selection
      .getState()
      .selectElements([elementId]);
  }, id);
  await stage(page).focus();
}

/** Where the middle of a cell is on the screen. */
export async function cellCenter(
  page: Page,
  id: string,
  row: number,
  col: number,
): Promise<{ x: number; y: number }> {
  const box = await cellOnStage(page, id, row, col).boundingBox();
  if (!box) throw new Error(`Cell ${row},${col} is not drawn`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Goes into a table by double-clicking a cell: the text editor opens there. */
export async function typeInCell(page: Page, id: string, row: number, col: number): Promise<void> {
  const at = await cellCenter(page, id, row, col);
  await page.mouse.dblclick(at.x, at.y);
  await expect(cellOnStage(page, id, row, col).locator('[data-text-editor]')).toBeFocused();
  // ProseMirror ignores Home / End within 200ms of a programmatic focus (ADR-006 rule 6).
  await page.waitForTimeout(250);
}

/** The cell the text editor is open in, as "row,col", or null. */
export function typingCell(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const td = document.querySelector('[data-testid="stage-surface"] td[data-cell-editing]');
    return td ? `${td.getAttribute('data-row')},${td.getAttribute('data-col')}` : null;
  });
}

/**
 * Presses Tab (or Shift+Tab) in a cell's text, and waits until the editor of the cell it leads to
 * has the keyboard. The editor of the next cell is a new one and takes the focus a moment after
 * it is drawn; a key sent by a machine in that moment would go nowhere. A person is never that
 * fast.
 */
export async function tab(page: Page, expected: string, back = false): Promise<void> {
  await page.keyboard.press(back ? 'Shift+Tab' : 'Tab');
  await expect.poll(() => typingCell(page)).toBe(expected);
  await expect(
    page.locator('[data-testid="stage-surface"] td[data-cell-editing] [data-text-editor]'),
  ).toBeFocused();
}

/** Waits for the frames in which a table is measured and its rows written (`fitRows`). */
export async function settled(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))),
      ),
  );
}

/**
 * Runs an action that must be exactly one undo step, and checks that Ctrl+Z takes the table back
 * to what it was and Ctrl+Y brings the change back. Returns the table as the action left it.
 */
export async function oneUndoStep(
  page: Page,
  action: () => Promise<void>,
  id = 'e_table',
): Promise<TableElement> {
  const before = await table(page, id);
  const stepsBefore = await steps(page);
  await action();
  await settled(page);
  await expect.poll(() => steps(page)).toBe(stepsBefore + 1);
  const after = await table(page, id);
  expect(after).not.toEqual(before);
  await page.evaluate(() => (window as unknown as { slidr: Harness }).slidr.bus.undo());
  expect(await table(page, id)).toEqual(before);
  expect(await steps(page)).toBe(stepsBefore);
  await page.evaluate(() => (window as unknown as { slidr: Harness }).slidr.bus.redo());
  expect(await table(page, id)).toEqual(after);
  return after;
}

void harness;
