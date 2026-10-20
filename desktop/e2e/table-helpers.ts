import { expect, type Locator, type Page } from '@playwright/test';
import type { TableCell, TableElement } from '@slidr/model';

/* Shared by the table specs (WG6): a table on the app's first slide, and the table as the model has it. */

interface Harness {
  bus: {
    deck: {
      size: { w: number; h: number };
      slides: { id: string; elements: { id: string; type: string }[] }[];
    };
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

export const undo = (page: Page) =>
  page.evaluate(() => (window as unknown as { slidr: Harness }).slidr.bus.undo());

export const redo = (page: Page) =>
  page.evaluate(() => (window as unknown as { slidr: Harness }).slidr.bus.redo());

/* ---------------------------------------------------------------- the selected cells */

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The Stage marks exactly the cells from `from` to `to` as selected (one cell when `to` is left
 * out). It draws the mark a frame after the key or the click, so this waits for it.
 */
export async function expectSelection(
  page: Page,
  id: string,
  from: [number, number],
  to: [number, number] = from,
): Promise<void> {
  await expect(async () => {
    const mark: Box = await stage(page)
      .locator('[data-table-selection]')
      .evaluate((el) => {
        const box = el.getBoundingClientRect();
        return { left: box.left, top: box.top, width: box.width, height: box.height };
      });
    const boxes = await Promise.all(
      [from, to].map(([r, c]) => cellOnStage(page, id, r, c).boundingBox()),
    );
    const left = Math.min(...boxes.map((b) => b!.x));
    const top = Math.min(...boxes.map((b) => b!.y));
    const right = Math.max(...boxes.map((b) => b!.x + b!.width));
    const bottom = Math.max(...boxes.map((b) => b!.y + b!.height));
    const cells: Box = { left, top, width: right - left, height: bottom - top };
    // The mark is placed by the model, the cells by the browser: a pixel is rounding.
    for (const key of ['left', 'top', 'width', 'height'] as const) {
      expect(Math.abs(mark[key] - cells[key]), key).toBeLessThan(1.5);
    }
  }).toPass({ timeout: 3000 });
}

/** Goes into a table and selects one cell, without typing in it: a double-click, then Esc. */
export async function selectCell(page: Page, id: string, row: number, col: number): Promise<void> {
  await typeInCell(page, id, row, col);
  await page.keyboard.press('Escape');
  await expect(stage(page).locator('[data-table-selection]')).toBeVisible();
}

/** Leaves a table whose cells are selected: Esc. The table stays selected, as an object. */
export async function leaveTable(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect.poll(() => editingId(page)).toBeNull();
  await expect(stage(page).locator('[data-table-overlay]')).toHaveAttribute('data-mode', 'object');
}

/** Selects the cells from one to another: into the first, then Shift+click on the second. */
export async function selectRange(
  page: Page,
  id: string,
  from: [number, number],
  to: [number, number],
): Promise<void> {
  await selectCell(page, id, from[0], from[1]);
  const at = await cellCenter(page, id, to[0], to[1]);
  await page.keyboard.down('Shift');
  await page.mouse.click(at.x, at.y);
  await page.keyboard.up('Shift');
  await expectSelection(page, id, from, to);
}

/* ---------------------------------------------------------------- the pointer */

export interface ScreenPoint {
  x: number;
  y: number;
}

/**
 * Presses at a point and moves to another in steps, as a hand would, and leaves the button down:
 * a test then presses Esc, or lets go with `page.mouse.up()`. The table follows a drag once a
 * frame, so the last step waits for one.
 */
export async function dragTo(page: Page, from: ScreenPoint, to: ScreenPoint): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const count = 6;
  for (let i = 1; i <= count; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / count,
      from.y + ((to.y - from.y) * i) / count,
    );
    await page.waitForTimeout(20);
  }
  await settled(page);
}

/** A whole drag: press, move, let go. */
export async function drag(page: Page, from: ScreenPoint, to: ScreenPoint): Promise<void> {
  await dragTo(page, from, to);
  await page.mouse.up();
}

/** The middle of what a locator shows, on the screen. */
export async function centerOf(target: Locator): Promise<ScreenPoint> {
  const box = await target.boundingBox();
  if (!box) throw new Error('Nothing is drawn there');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** The line after a column or below a row, which a drag moves. */
export const lineOf = (page: Page, kind: 'col' | 'row', index: number): Locator =>
  stage(page).locator(`[data-${kind}-line="${index}"]`);

/** How many screen pixels a slide pixel is on the Stage now. */
export async function stageScale(page: Page): Promise<number> {
  const box = await page.getByTestId('stage-frame').boundingBox();
  const width = await page.evaluate(
    () => (window as unknown as { slidr: Harness }).slidr.bus.deck.size.w,
  );
  return box!.width / width;
}

/* ---------------------------------------------------------------- the clipboard */

export interface Clip {
  /** Clipboard formats and their text: `text/html`, `text/plain`. */
  data: Record<string, string>;
  /** Also a picture file, as Excel puts a picture of the copied range next to its text. */
  picture?: boolean;
}

/**
 * Sends a `paste` event to the focused element, as Ctrl+V would. The event carries its own data,
 * so the clipboard of the machine, which every test and every other program shares, is not
 * involved. False when the app took the paste (it prevents the default).
 */
export function paste(page: Page, clip: Clip): Promise<boolean> {
  return page.evaluate(async ({ data, picture }) => {
    const clipboardData = new DataTransfer();
    for (const [type, text] of Object.entries(data)) clipboardData.setData(type, text);
    if (picture) {
      // A real PNG: if it were taken for an image, an image is what would appear.
      const canvas = document.createElement('canvas');
      [canvas.width, canvas.height] = [240, 120];
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#2f5bea';
      context.fillRect(0, 0, 240, 120);
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/png'),
      );
      clipboardData.items.add(new File([blob], 'image.png', { type: 'image/png' }));
    }
    const target = document.activeElement ?? document.body;
    return target.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    );
  }, clip);
}

/** Sends a `copy` or `cut` event to the focused element, and returns what the app put on it. */
export function copy(page: Page, type: 'copy' | 'cut' = 'copy'): Promise<Record<string, string>> {
  return page.evaluate((eventType) => {
    const clipboardData = new DataTransfer();
    const target = document.activeElement ?? document.body;
    target.dispatchEvent(
      new ClipboardEvent(eventType, { clipboardData, bubbles: true, cancelable: true }),
    );
    return Object.fromEntries(clipboardData.types.map((t) => [t, clipboardData.getData(t)]));
  }, type);
}

void harness;
