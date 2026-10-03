import { expect, test, type Page } from '@playwright/test';
import type { TableElement } from '@slidr/model';
import { openApp, pageProblems, row } from './objects-helpers';
import {
  addTable,
  cellOnStage,
  cellTarget,
  centerOf,
  drag,
  dragTo,
  editingId,
  expectSelection,
  leaveTable,
  lineOf,
  oneUndoStep,
  selectCell,
  selectRange,
  selectTable,
  settled,
  stage,
  stageScale,
  steps,
  tab,
  table,
  tableOnStage,
  texts,
  typeInCell,
  typingCell,
} from './table-helpers';

// The structure of a table (WG6-T02, TBL-02 and TBL-03): rows and columns added and removed from
// row B, sizes made even, cells merged and split, and the lines between rows and columns dragged
// on the Stage. Every action is one undo step, and so is a whole drag.

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

const GRID = [
  ['a', 'b', 'c'],
  ['d', 'e', 'f'],
  ['g', 'h', 'i'],
];

/** A right-to-left table is worked on in the Hebrew UI, a left-to-right one in the English. */
const SETUPS = [
  { dir: 'rtl', lang: 'he' },
  { dir: 'ltr', lang: 'en' },
] as const;
type Lang = (typeof SETUPS)[number]['lang'];

const NAMES = {
  he: {
    structure: 'שורות ועמודות',
    rowAbove: 'הוספת שורה מעל',
    rowBelow: 'הוספת שורה מתחת',
    colRight: 'הוספת עמודה מימין',
    colLeft: 'הוספת עמודה משמאל',
    deleteRow: 'מחיקת השורה',
    deleteRows: 'מחיקת השורות',
    deleteCol: 'מחיקת העמודה',
    deleteCols: 'מחיקת העמודות',
    evenRows: 'גובה שווה לשורות',
    evenCols: 'רוחב שווה לעמודות',
    merge: 'מיזוג תאים',
    split: 'פיצול תאים',
  },
  en: {
    structure: 'Rows and columns',
    rowAbove: 'Insert row above',
    rowBelow: 'Insert row below',
    colRight: 'Insert column to the right',
    colLeft: 'Insert column to the left',
    deleteRow: 'Delete row',
    deleteRows: 'Delete rows',
    deleteCol: 'Delete column',
    deleteCols: 'Delete columns',
    evenRows: 'Make rows the same height',
    evenCols: 'Make columns the same width',
    merge: 'Merge cells',
    split: 'Split cells',
  },
};
type Item = Exclude<keyof (typeof NAMES)['en'], 'structure' | 'merge' | 'split'>;

/** Opens the "Rows and columns" menu of row B. */
async function openMenu(page: Page, lang: Lang) {
  await row(page).getByRole('button', { name: NAMES[lang].structure, exact: true }).click();
  await expect(page.getByRole('menu')).toBeVisible();
}

const item = (page: Page, lang: Lang, name: Item) =>
  page.getByRole('menuitem', { name: NAMES[lang][name], exact: true });

/** Picks an item of the "Rows and columns" menu. */
async function choose(page: Page, lang: Lang, name: Item) {
  await openMenu(page, lang);
  await item(page, lang, name).click();
  await expect(page.getByRole('menu')).toBeHidden();
}

const tool = (page: Page, lang: Lang, name: 'merge' | 'split') =>
  row(page).getByRole('button', { name: NAMES[lang][name], exact: true });

const sum = (values: readonly number[]) => values.reduce((a, b) => a + b, 0);

/** Where a text is in the table: its logical row and column. */
function find(grid: string[][], text: string): [number, number] {
  for (const [r, line] of grid.entries()) {
    const c = line.indexOf(text);
    if (c >= 0) return [r, c];
  }
  throw new Error(`No cell says ${text}`);
}

/** The rows and the columns of a table add up to its frame, as after every operation. */
function expectWhole(t: TableElement) {
  expect(sum(t.rows)).toBeCloseTo(t.frame.h, 1);
  expect(sum(t.cols)).toBeCloseTo(t.frame.w, 1);
  expect(t.cells).toHaveLength(t.rows.length);
  for (const line of t.cells) expect(line).toHaveLength(t.cols.length);
}

/** The heights of the rows as the Stage draws them, in slide pixels. */
function drawnRows(page: Page, id: string): Promise<number[]> {
  return tableOnStage(page, id).evaluate((root) =>
    Array.from(root.querySelectorAll<HTMLElement>(':scope > table > tbody > tr'), (tr) => {
      return tr.offsetHeight;
    }),
  );
}

const drawnHeight = (page: Page, id: string) =>
  tableOnStage(page, id).evaluate(
    (root) => (root.querySelector('table') as HTMLElement).offsetHeight,
  );

/* ---------------------------------------------------------------- rows and columns */

for (const { dir, lang } of SETUPS) {
  for (const where of ['rowAbove', 'rowBelow'] as const) {
    test(`"${NAMES.en[where]}" adds a row there, ${dir}`, async ({ page }) => {
      await openApp(page, { lang });
      const id = await addTable(page, { dir, texts: GRID });
      await selectCell(page, id, 1, 1);
      const before = await table(page);

      const after = await oneUndoStep(page, () => choose(page, lang, where));
      expectWhole(after);
      const grid = await texts(page);
      const added = where === 'rowAbove' ? 1 : 2;
      expect(grid[added]).toEqual(['', '', '']);
      // The other cells say what they said.
      expect(grid.filter((_, r) => r !== added)).toEqual(GRID);
      // The table is taller by the new row, which is as tall as the row it was added beside.
      expect(after.rows).toHaveLength(4);
      expect(after.frame).toEqual({ ...before.frame, h: before.frame.h + before.rows[1]! });
      expect(after.cols).toEqual(before.cols);

      // On the screen the new row is on the side that was asked for, right next to the cell.
      const [r, c] = find(grid, 'e');
      const cell = (await cellOnStage(page, id, r, c).boundingBox())!;
      const fresh = (await cellOnStage(page, id, added, c).boundingBox())!;
      if (where === 'rowAbove') expect(fresh.y + fresh.height).toBeCloseTo(cell.y, 0);
      else expect(fresh.y).toBeCloseTo(cell.y + cell.height, 0);
      // The same cell is still the selected one.
      await expectSelection(page, id, [r, c]);
      expect(await editingId(page)).toBe(id);
    });
  }

  for (const where of ['colRight', 'colLeft'] as const) {
    test(`"${NAMES.en[where]}" adds a column on that side of the screen, ${dir}`, async ({
      page,
    }) => {
      await openApp(page, { lang });
      const id = await addTable(page, { dir, texts: GRID });
      await selectCell(page, id, 1, 1);
      const before = await table(page);

      const after = await oneUndoStep(page, () => choose(page, lang, where));
      expectWhole(after);
      // The table is as wide as it was: the columns gave the new one its room.
      expect(after.frame).toEqual(before.frame);
      expect(after.rows).toEqual(before.rows);
      expect(after.cols).toHaveLength(4);
      for (const width of after.cols) expect(width).toBeCloseTo(before.frame.w / 4, 1);

      const grid = await texts(page);
      const [r, c] = find(grid, 'e');
      const added = grid[0]!.findIndex((_, col) => grid.every((line) => line[col] === ''));
      expect(added).toBeGreaterThanOrEqual(0);
      expect(grid.map((line) => line.filter((_, col) => col !== added))).toEqual(GRID);

      // On the screen: right next to the selected cell, on the side the menu named.
      const cell = (await cellOnStage(page, id, r, c).boundingBox())!;
      const fresh = (await cellOnStage(page, id, r, added).boundingBox())!;
      if (where === 'colRight') expect(fresh.x).toBeCloseTo(cell.x + cell.width, 0);
      else expect(fresh.x + fresh.width).toBeCloseTo(cell.x, 0);
      // In the model that side is before the cell or after it, by the direction of the table.
      expect(added).toBe((where === 'colRight') === (dir === 'rtl') ? c - 1 : c + 1);
      await expectSelection(page, id, [r, c]);
    });
  }
}

const SIXTEEN = Array.from({ length: 4 }, (_, r) =>
  Array.from({ length: 4 }, (_, c) => `r${r}c${c}`),
);

test('"Delete rows" removes the rows of the selected cells', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: SIXTEEN });
  await selectRange(page, id, [1, 1], [2, 2]);
  const before = await table(page);

  const after = await oneUndoStep(page, () => choose(page, 'en', 'deleteRows'));
  expectWhole(after);
  expect(await texts(page)).toEqual([SIXTEEN[0], SIXTEEN[3]]);
  expect(after.frame).toEqual({ ...before.frame, h: before.frame.h / 2 });
  expect(after.cols).toEqual(before.cols);
  // The cell that took the place of the first one removed is selected.
  await expectSelection(page, id, [1, 1]);
});

test('"Delete columns" removes the columns of the selected cells, in a right-to-left table', async ({
  page,
}) => {
  await openApp(page);
  const id = await addTable(page, { dir: 'rtl', texts: SIXTEEN });
  await selectRange(page, id, [1, 1], [2, 2]);
  const before = await table(page);

  const after = await oneUndoStep(page, () => choose(page, 'he', 'deleteCols'));
  expectWhole(after);
  expect(await texts(page)).toEqual(SIXTEEN.map((line) => [line[0], line[3]]));
  // The table keeps its width: the columns that stay share it.
  expect(after.frame).toEqual(before.frame);
  expect(after.cols).toEqual([600, 600]);
  await expectSelection(page, id, [1, 1]);
});

test('a row or a column cannot be deleted when the selection covers all of them', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: SIXTEEN });

  // A whole column: its rows are all the rows.
  await selectRange(page, id, [0, 1], [3, 1]);
  await openMenu(page, 'en');
  await expect(item(page, 'en', 'deleteRows')).toHaveAttribute('aria-disabled', 'true');
  await expect(item(page, 'en', 'deleteCol')).not.toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  // A whole row.
  await leaveTable(page);
  await page.keyboard.press('Escape');
  await selectRange(page, id, [2, 0], [2, 3]);
  await openMenu(page, 'en');
  await expect(item(page, 'en', 'deleteRow')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(item(page, 'en', 'deleteCols')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  // The table selected as an object is all of its cells.
  await leaveTable(page);
  await openMenu(page, 'en');
  await expect(item(page, 'en', 'deleteRows')).toHaveAttribute('aria-disabled', 'true');
  await expect(item(page, 'en', 'deleteCols')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  expect(await steps(page)).toBe(1);
  expect(await texts(page)).toEqual(SIXTEEN);
});

test('"Make rows the same height" evens the rows of a selected table', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const frame = { x: 360, y: 240, w: 1200, h: 420 };
  const id = await addTable(page, { texts: GRID, frame, rows: [80, 120, 220] });
  await selectTable(page, id);

  const after = await oneUndoStep(page, () => choose(page, 'en', 'evenRows'));
  expect(after.rows).toEqual([140, 140, 140]);
  expect(after.frame).toEqual(frame);
  for (const height of await drawnRows(page, id)) expect(height).toBeCloseTo(140, 0);
});

test('"Make columns the same width" evens the columns of the selected cells only', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const frame = { x: 360, y: 240, w: 1200, h: 240 };
  const id = await addTable(page, { texts: GRID, frame, cols: [200, 400, 600] });
  await selectRange(page, id, [1, 0], [1, 1]);

  const after = await oneUndoStep(page, () => choose(page, 'en', 'evenCols'));
  expect(after.cols).toEqual([300, 300, 600]);
  expect(after.frame).toEqual(frame);
  const first = (await cellOnStage(page, id, 0, 0).boundingBox())!;
  const second = (await cellOnStage(page, id, 0, 1).boundingBox())!;
  expect(first.width).toBeCloseTo(second.width, 0);

  // The whole table: all three.
  await leaveTable(page);
  const even = await oneUndoStep(page, () => choose(page, 'en', 'evenCols'));
  expect(even.cols).toEqual([400, 400, 400]);
});

/* ---------------------------------------------------------------- merge and split */

test('merging a range makes one cell of it, with the texts in reading order', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: GRID });
  // Nothing to merge in a table that is selected as an object, or in one cell.
  await selectTable(page, id);
  await expect(tool(page, 'en', 'merge')).toBeDisabled();
  await selectCell(page, id, 0, 0);
  await expect(tool(page, 'en', 'merge')).toBeDisabled();
  await expect(tool(page, 'en', 'split')).toBeDisabled();
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');
  await expectSelection(page, id, [0, 0], [1, 1]);
  const whole = (await cellOnStage(page, id, 0, 0).boundingBox())!;
  const corner = (await cellOnStage(page, id, 1, 1).boundingBox())!;

  const after = await oneUndoStep(page, () => tool(page, 'en', 'merge').click());
  expectWhole(after);
  expect(after.cells[0]![0]).toMatchObject({ rowSpan: 2, colSpan: 2 });
  for (const [r, c] of [
    [0, 1],
    [1, 0],
    [1, 1],
  ] as const) {
    expect(after.cells[r]![c]).toEqual({ content: { paragraphs: [] }, merged: true });
  }
  expect(await texts(page)).toEqual([
    ['a\nb\nd\ne', '', 'c'],
    ['', '', 'f'],
    ['g', 'h', 'i'],
  ]);

  // One cell is drawn, over the place of the four, and it is the selected one.
  const merged = cellOnStage(page, id, 0, 0);
  await expect(merged).toHaveAttribute('rowspan', '2');
  await expect(merged).toHaveAttribute('colspan', '2');
  await expect(tableOnStage(page, id).locator('td')).toHaveCount(6);
  const box = (await merged.boundingBox())!;
  expect(box.x).toBeCloseTo(whole.x, 0);
  expect(box.width).toBeCloseTo(corner.x + corner.width - whole.x, 0);
  await expectSelection(page, id, [0, 0]);
  await expect(tool(page, 'en', 'merge')).toBeDisabled();
  await expect(tool(page, 'en', 'split')).toBeEnabled();
  await page.screenshot({ path: 'test-results/table/merged.png' });
});

test('merging in a right-to-left table joins the texts from the right', async ({ page }) => {
  await openApp(page);
  const id = await addTable(page, {
    dir: 'rtl',
    texts: [
      ['שם', 'רבעון ראשון', 'רבעון שני'],
      ['צפון', '120', '140'],
      ['דרום', '90', '95'],
    ],
  });
  await selectRange(page, id, [0, 1], [0, 2]);
  const left = (await cellOnStage(page, id, 0, 2).boundingBox())!;
  const right = (await cellOnStage(page, id, 0, 1).boundingBox())!;
  const after = await oneUndoStep(page, () => tool(page, 'he', 'merge').click());
  expect(after.cells[0]![1]).toMatchObject({ colSpan: 2 });
  expect(after.cells[0]![1]).not.toHaveProperty('rowSpan');
  expect((await texts(page))[0]).toEqual(['שם', 'רבעון ראשון\nרבעון שני', '']);
  // The merged cell lies where the two were: from the left edge of the one on the left.
  const box = (await cellOnStage(page, id, 0, 1).boundingBox())!;
  expect(box.x).toBeCloseTo(left.x, 0);
  expect(box.x + box.width).toBeCloseTo(right.x + right.width, 0);
  await page.screenshot({ path: 'test-results/table/merged-hebrew.png' });
});

test('splitting a merged cell gives its cells back, with the text in the first', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: GRID });
  await selectRange(page, id, [0, 0], [1, 1]);
  await tool(page, 'en', 'merge').click();
  await settled(page);
  await expectSelection(page, id, [0, 0]);

  const after = await oneUndoStep(page, () => tool(page, 'en', 'split').click());
  expectWhole(after);
  for (const line of after.cells) {
    for (const cell of line) {
      expect(cell).not.toHaveProperty('merged');
      expect(cell).not.toHaveProperty('rowSpan');
      expect(cell).not.toHaveProperty('colSpan');
    }
  }
  expect(await texts(page)).toEqual([
    ['a\nb\nd\ne', '', 'c'],
    ['', '', 'f'],
    ['g', 'h', 'i'],
  ]);
  await expect(tableOnStage(page, id).locator('td')).toHaveCount(9);
  await expect(tool(page, 'en', 'split')).toBeDisabled();
});

test('a merged cell is typed in, and Tab skips the cells it covers', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: GRID });
  await selectRange(page, id, [0, 0], [1, 1]);
  await tool(page, 'en', 'merge').click();
  await settled(page);
  await expectSelection(page, id, [0, 0]);

  // A click anywhere on the merged cell, also where a covered cell was.
  const box = (await cellOnStage(page, id, 0, 0).boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await expect.poll(() => typingCell(page)).toBe('0,0');
  await expect(stage(page).locator('[data-text-editor]')).toBeFocused();
  await page.waitForTimeout(250);
  await page.keyboard.press('Control+End');
  await page.keyboard.type('!');
  expect((await texts(page))[0]![0]).toBe('a\nb\nd\ne!');

  await tab(page, '0,2');
  await tab(page, '1,2');
  await tab(page, '2,0');
  await tab(page, '1,2', true);
  await tab(page, '0,2', true);
  await tab(page, '0,0', true);
  // The arrows walk around it the same way.
  await page.keyboard.press('Escape');
  await expectSelection(page, id, [0, 0]);
  await page.keyboard.press('ArrowDown');
  await expectSelection(page, id, [2, 0]);
  await page.keyboard.press('ArrowUp');
  await expectSelection(page, id, [0, 0]);
  await page.keyboard.press('ArrowRight');
  await expectSelection(page, id, [0, 2]);
});

/* ---------------------------------------------------------------- the lines on the Stage */

test('dragging the line between two columns moves it, in one undo step', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: GRID });
  await selectTable(page, id);
  // A table that is selected as an object shows only its inner lines.
  await expect(stage(page).locator(`[data-table-overlay="${id}"]`)).toHaveAttribute(
    'data-mode',
    'object',
  );
  await expect(stage(page).locator('[data-col-line]')).toHaveCount(2);
  await expect(stage(page).locator('[data-row-line]')).toHaveCount(2);
  const scale = await stageScale(page);
  const before = await table(page);
  const from = await centerOf(lineOf(page, 'col', 0));

  const after = await oneUndoStep(page, () => drag(page, from, { x: from.x + 90, y: from.y + 25 }));
  expectWhole(after);
  const by = 90 / scale;
  expect(Math.abs(after.cols[0]! - (400 + by))).toBeLessThan(1.5);
  expect(Math.abs(after.cols[1]! - (400 - by))).toBeLessThan(1.5);
  expect(after.cols[2]).toBe(400);
  expect(after.frame).toEqual(before.frame);
  expect(after.rows).toEqual(before.rows);
  // The line is where the pointer left it.
  const line = await centerOf(lineOf(page, 'col', 0));
  expect(line.x).toBeCloseTo(from.x + 90, 0);
});

test('Esc during the drag of a line puts everything back and leaves nothing to undo', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: GRID });
  await selectTable(page, id);
  const before = await table(page);
  const stepsBefore = await steps(page);
  const from = await centerOf(lineOf(page, 'col', 1));

  await dragTo(page, from, { x: from.x - 120, y: from.y });
  // The drag is live: the column is narrower while the button is down.
  expect((await table(page)).cols[1]).toBeLessThan(before.cols[1]! - 100);
  await page.keyboard.press('Escape');
  expect(await table(page)).toEqual(before);
  // The rest of the gesture does nothing.
  await page.mouse.move(from.x - 200, from.y, { steps: 3 });
  await page.mouse.up();
  await settled(page);
  expect(await table(page)).toEqual(before);
  expect(await steps(page)).toBe(stepsBefore);
  // The table is still selected, and its lines can be dragged again.
  await expect(stage(page).locator('[data-handle="se"]')).toBeVisible();
  const again = await oneUndoStep(page, () => drag(page, from, { x: from.x - 60, y: from.y }));
  expect(again.cols[1]).toBeLessThan(before.cols[1]!);
});

test('in a right-to-left table, dragging a line to the left widens the column on its right', async ({
  page,
}) => {
  await openApp(page);
  const id = await addTable(page, { dir: 'rtl', texts: GRID });
  await selectTable(page, id);
  const scale = await stageScale(page);
  const before = await table(page);
  // The line after the first column is at the left edge of that column, which is on the right.
  const first = (await cellOnStage(page, id, 0, 0).boundingBox())!;
  const from = await centerOf(lineOf(page, 'col', 0));
  expect(from.x).toBeCloseTo(first.x, 0);

  const after = await oneUndoStep(page, () => drag(page, from, { x: from.x - 80, y: from.y }));
  expectWhole(after);
  const by = 80 / scale;
  expect(Math.abs(after.cols[0]! - (400 + by))).toBeLessThan(1.5);
  expect(Math.abs(after.cols[1]! - (400 - by))).toBeLessThan(1.5);
  expect(after.frame).toEqual(before.frame);
  const wider = (await cellOnStage(page, id, 0, 0).boundingBox())!;
  expect(wider.width).toBeCloseTo(first.width + 80, 0);
  expect(wider.x + wider.width).toBeCloseTo(first.x + first.width, 0);
});

test('inside the table, the line of the last column makes the table wider', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: GRID });
  await selectCell(page, id, 1, 1);
  await expect(stage(page).locator(`[data-table-overlay="${id}"]`)).toHaveAttribute(
    'data-mode',
    'cells',
  );
  // Inside the table the outer lines are there too.
  await expect(stage(page).locator('[data-col-line]')).toHaveCount(3);
  await expect(stage(page).locator('[data-row-line]')).toHaveCount(3);
  const scale = await stageScale(page);
  const before = await table(page);
  const from = await centerOf(lineOf(page, 'col', 2));

  const after = await oneUndoStep(page, () => drag(page, from, { x: from.x + 70, y: from.y }));
  expectWhole(after);
  const by = 70 / scale;
  expect(Math.abs(after.cols[2]! - (400 + by))).toBeLessThan(1.5);
  expect(after.cols.slice(0, 2)).toEqual([400, 400]);
  expect(after.frame).toEqual({ ...before.frame, w: sum(after.cols) });
  // The user is still inside the table, on the same cell.
  expect(await editingId(page)).toBe(id);
  await expectSelection(page, id, [1, 1]);
});

test('in a right-to-left table that line is at the left edge, and the right edge stays', async ({
  page,
}) => {
  await openApp(page);
  const id = await addTable(page, { dir: 'rtl', texts: GRID });
  await selectCell(page, id, 1, 1);
  const scale = await stageScale(page);
  const before = await table(page);
  const box = (await tableOnStage(page, id).boundingBox())!;
  const from = await centerOf(lineOf(page, 'col', 2));
  expect(from.x).toBeCloseTo(box.x, 0);

  const after = await oneUndoStep(page, () => drag(page, from, { x: from.x - 70, y: from.y }));
  expectWhole(after);
  const by = 70 / scale;
  expect(Math.abs(after.cols[2]! - (400 + by))).toBeLessThan(1.5);
  expect(after.frame.w).toBe(sum(after.cols));
  expect(after.frame.x).toBeCloseTo(before.frame.x - (after.frame.w - before.frame.w), 5);
  expect(after.frame.x + after.frame.w).toBeCloseTo(before.frame.x + before.frame.w, 5);
  const wider = (await tableOnStage(page, id).boundingBox())!;
  expect(wider.x).toBeCloseTo(box.x - 70, 0);
  expect(wider.x + wider.width).toBeCloseTo(box.x + box.width, 0);
});

test('dragging the line below a row down makes the row and the table taller', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: GRID });
  await selectTable(page, id);
  const scale = await stageScale(page);
  const before = await table(page);
  const from = await centerOf(lineOf(page, 'row', 0));

  const after = await oneUndoStep(page, () => drag(page, from, { x: from.x + 10, y: from.y + 60 }));
  expectWhole(after);
  const by = 60 / scale;
  expect(Math.abs(after.rows[0]! - (80 + by))).toBeLessThan(1.5);
  expect(after.rows.slice(1)).toEqual([80, 80]);
  expect(after.frame).toEqual({ ...before.frame, h: sum(after.rows) });
  expect(after.cols).toEqual(before.cols);
  expect(Math.abs((await drawnHeight(page, id)) - after.frame.h)).toBeLessThan(1);
});

test('a row cannot be dragged shorter than its text', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, {
    texts: [
      ['a', 'b', 'c'],
      ['two lines\nin this cell', 'e', 'f'],
      ['g', 'h', 'i'],
    ],
    frame: { x: 360, y: 200, w: 1200, h: 480 },
  });
  await selectTable(page, id);
  const before = await table(page);
  const from = await centerOf(lineOf(page, 'row', 1));

  // Up, to above the row itself.
  const after = await oneUndoStep(page, () => drag(page, from, { x: from.x, y: from.y - 200 }));
  expectWhole(after);
  const drawn = await drawnRows(page, id);
  // The row is as tall as its two lines of text, and the model says what is drawn.
  expect(after.rows[1]).toBeLessThan(before.rows[1]!);
  expect(after.rows[1]).toBeGreaterThan(90);
  after.rows.forEach((height, r) =>
    expect(Math.abs(height - drawn[r]!), `row ${r}`).toBeLessThan(1),
  );
  expect(Math.abs((await drawnHeight(page, id)) - after.frame.h)).toBeLessThan(1);
  expect(after.rows[0]).toBe(before.rows[0]);
  expect(after.rows[2]).toBe(before.rows[2]);
  // The handles of the table are on the table that is drawn.
  const box = (await tableOnStage(page, id).boundingBox())!;
  const south = await centerOf(stage(page).locator('[data-handle="s"]'));
  expect(south.y).toBeCloseTo(box.y + box.height, 0);
});

test('a table resized to less than its text needs is as tall as it is drawn', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  // Four columns: the line in the middle of the table ends under the handle.
  const id = await addTable(page, {
    texts: [
      ['a', 'b', 'c', 'd'],
      ['e', 'f', 'g', 'h'],
      ['i', 'j', 'k', 'l'],
    ],
    frame: { x: 360, y: 240, w: 1200, h: 480 },
  });
  await selectTable(page, id);
  const scale = await stageScale(page);
  const before = await table(page);
  const from = await centerOf(stage(page).locator('[data-handle="s"]'));

  // Up by 420 slide pixels: 60 would be left for three rows of text.
  const after = await oneUndoStep(page, () =>
    drag(page, from, { x: from.x, y: from.y - 420 * scale }),
  );
  expectWhole(after);
  expect(after.frame.h).toBeLessThan(before.frame.h);
  expect(after.frame.h).toBeGreaterThan(150);
  expect(Math.abs((await drawnHeight(page, id)) - after.frame.h)).toBeLessThan(1);
  const drawn = await drawnRows(page, id);
  after.rows.forEach((height, r) =>
    expect(Math.abs(height - drawn[r]!), `row ${r}`).toBeLessThan(1),
  );
  expect({ ...after.frame, h: 0 }).toEqual({ ...before.frame, h: 0 });
  expect(after.cols).toEqual(before.cols);
  // The handle is at the bottom of the table that is drawn.
  const box = (await tableOnStage(page, id).boundingBox())!;
  const south = await centerOf(stage(page).locator('[data-handle="s"]'));
  expect(south.y).toBeCloseTo(box.y + box.height, 0);
});

const NOTES = [
  ['Quarter', 'Notes', 'Owner'],
  ['Q1', 'A note that fits on one line at this width', 'Dana'],
];

test('a column dragged narrower wraps its text, and the row grows in the same undo step', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const frame = { x: 360, y: 240, w: 1200, h: 160 };
  const id = await addTable(page, { texts: NOTES, frame, cols: [200, 800, 200] });
  await selectTable(page, id);
  const scale = await stageScale(page);
  // In the first row: in the middle of this table the line crosses the line between its rows.
  const line = (await lineOf(page, 'col', 1).boundingBox())!;
  const from = { x: line.x + line.width / 2, y: line.y + line.height / 4 };

  // The line after the wide column, to the left by 500 slide pixels.
  const after = await oneUndoStep(page, () =>
    drag(page, from, { x: from.x - 500 * scale, y: from.y }),
  );
  expectWhole(after);
  expect(Math.abs(after.cols[1]! - 300)).toBeLessThan(1.5);
  expect(Math.abs(after.cols[2]! - 700)).toBeLessThan(1.5);
  // The row of the note is taller, and the table with it; its top left corner stayed.
  expect(after.rows[0]).toBe(80);
  expect(after.rows[1]).toBeGreaterThan(110);
  expect(after.frame).toEqual({ ...frame, h: sum(after.rows) });
  const drawn = await drawnRows(page, id);
  after.rows.forEach((height, r) =>
    expect(Math.abs(height - drawn[r]!), `row ${r}`).toBeLessThan(1),
  );
});

test('a table made narrower by its handle wraps its text, and grows in the same undo step', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const frame = { x: 360, y: 240, w: 1200, h: 160 };
  const id = await addTable(page, { texts: NOTES, frame, cols: [200, 800, 200] });
  await selectTable(page, id);
  const scale = await stageScale(page);
  const from = await centerOf(stage(page).locator('[data-handle="e"]'));

  const after = await oneUndoStep(page, () =>
    drag(page, from, { x: from.x - 600 * scale, y: from.y }),
  );
  expectWhole(after);
  expect(Math.abs(after.frame.w - 600)).toBeLessThan(1.5);
  expect(after.frame.x).toBe(frame.x);
  expect(after.frame.y).toBe(frame.y);
  // The columns keep their shares of the width.
  expect(after.cols[1]! / after.cols[0]!).toBeCloseTo(4, 1);
  expect(after.rows[1]).toBeGreaterThan(110);
  expect(Math.abs((await drawnHeight(page, id)) - after.frame.h)).toBeLessThan(1);
  const box = (await tableOnStage(page, id).boundingBox())!;
  const south = await centerOf(stage(page).locator('[data-handle="s"]'));
  expect(south.y).toBeCloseTo(box.y + box.height, 0);
});

test('inside the table, the line of the last row makes the table taller', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: GRID });
  await selectCell(page, id, 0, 0);
  const scale = await stageScale(page);
  const before = await table(page);
  const from = await centerOf(lineOf(page, 'row', 2));
  const bottom = (await tableOnStage(page, id).boundingBox())!;
  expect(from.y).toBeCloseTo(bottom.y + bottom.height, 0);

  const after = await oneUndoStep(page, () => drag(page, from, { x: from.x, y: from.y + 50 }));
  expectWhole(after);
  expect(Math.abs(after.rows[2]! - (80 + 50 / scale))).toBeLessThan(1.5);
  expect(after.rows.slice(0, 2)).toEqual([80, 80]);
  expect(after.frame).toEqual({ ...before.frame, h: sum(after.rows) });
  await expectSelection(page, id, [0, 0]);
});

test('a line dragged while a cell is typed in keeps what was typed', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: GRID });
  await typeInCell(page, id, 1, 1);
  await page.keyboard.press('End');
  await page.keyboard.type(' typed');
  await settled(page);
  const from = await centerOf(lineOf(page, 'col', 0));

  const after = await oneUndoStep(page, () => drag(page, from, { x: from.x + 60, y: from.y }));
  expectWhole(after);
  expect(after.cols[0]).toBeGreaterThan(400);
  expect((await texts(page))[1]).toEqual(['d', 'e typed', 'f']);
  // The cell is still being typed in, and its editor still has the keyboard: Backspace takes a
  // letter, not the table.
  expect(await typingCell(page)).toBe('1,1');
  await expect(cellOnStage(page, id, 1, 1).locator('[data-text-editor]')).toBeFocused();
  await page.keyboard.press('Backspace');
  await page.keyboard.type('ing');
  expect((await texts(page))[1]).toEqual(['d', 'e typeing', 'f']);
  // Esc leaves the text, and the cell stays selected.
  await page.keyboard.press('Escape');
  expect(await editingId(page)).toBe(id);
  await expectSelection(page, id, [1, 1]);
});

test('a change of the structure while a cell is typed in keeps what was typed', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: GRID });
  await typeInCell(page, id, 1, 1);
  await page.keyboard.press('End');
  await page.keyboard.type(' typed');
  await settled(page);

  const after = await oneUndoStep(page, () => choose(page, 'en', 'rowAbove'));
  expect(after.rows).toHaveLength(4);
  expect(await texts(page)).toEqual([
    ['a', 'b', 'c'],
    ['', '', ''],
    ['d', 'e typed', 'f'],
    ['g', 'h', 'i'],
  ]);
  // The typing ended; the cell that was typed in is selected, and the keyboard is on the cells.
  expect(await typingCell(page)).toBeNull();
  await expectSelection(page, id, [2, 1]);
  await page.keyboard.press('ArrowUp');
  await expectSelection(page, id, [1, 1]);
});

/* ---------------------------------------------------------------- a rotated table */

test.describe('a rotated table', () => {
  const frame = { x: 510, y: 390, w: 900, h: 300 };
  const turn = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };

  test('a double-click types in the cell under the pointer', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: GRID, frame, extra: { rotation: 30 } });
    // The corners of the table, which are far from where they would be without the rotation.
    for (const [r, c] of [
      [0, 2],
      [2, 0],
    ] as const) {
      await typeInCell(page, id, r, c);
      expect(await typingCell(page)).toBe(`${r},${c}`);
      await page.keyboard.press('Escape');
      await expectSelection(page, id, [r, c]);
      await page.keyboard.press('Escape');
      expect(await editingId(page)).toBeNull();
    }
    // Inside the table a click on another cell goes there.
    await typeInCell(page, id, 1, 1);
    await cellTarget(page, 0, 0).click();
    await expect.poll(() => typingCell(page)).toBe('0,0');
    await page.screenshot({ path: 'test-results/table/rotated.png' });
    await settled(page);
    expect(await steps(page)).toBe(1);
  });

  test('dragging a line changes the widths along the axis of the table', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: GRID, frame, extra: { rotation: 30 } });
    await selectTable(page, id);
    const scale = await stageScale(page);
    const before = await table(page);
    const from = await centerOf(lineOf(page, 'col', 0));

    // Along the rows of the table: 30 degrees down from the horizontal.
    const after = await oneUndoStep(page, () =>
      drag(page, from, { x: from.x + 80 * turn.x, y: from.y + 80 * turn.y }),
    );
    expectWhole(after);
    const by = 80 / scale;
    expect(Math.abs(after.cols[0]! - (300 + by))).toBeLessThan(1.5);
    expect(Math.abs(after.cols[1]! - (300 - by))).toBeLessThan(1.5);
    expect(after.frame).toEqual(before.frame);

    // Across them the line does not move: nothing changes, and nothing is left to undo.
    const stepsBefore = await steps(page);
    const line = await centerOf(lineOf(page, 'col', 1));
    await drag(page, line, { x: line.x - 60 * turn.y, y: line.y + 60 * turn.x });
    await settled(page);
    expect(await table(page)).toEqual(after);
    expect(await steps(page)).toBe(stepsBefore);
  });

  test('the line of the last column keeps the first column where it is on the slide', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: GRID, frame, extra: { rotation: 30 } });
    await selectCell(page, id, 1, 1);
    const scale = await stageScale(page);
    const corner = (await cellOnStage(page, id, 0, 0).boundingBox())!;
    const from = await centerOf(lineOf(page, 'col', 2));

    const after = await oneUndoStep(page, () =>
      drag(page, from, { x: from.x + 90 * turn.x, y: from.y + 90 * turn.y }),
    );
    expectWhole(after);
    expect(Math.abs(after.cols[2]! - (300 + 90 / scale))).toBeLessThan(1.5);
    expect(after.frame.w).toBeGreaterThan(frame.w + 50);
    // The first cell did not move on the screen.
    const still = (await cellOnStage(page, id, 0, 0).boundingBox())!;
    expect(still.x).toBeCloseTo(corner.x, 0);
    expect(still.y).toBeCloseTo(corner.y, 0);
  });
});

/* ---------------------------------------------------------------- a table in a group */

test('a table in a turned group is typed in and resized where it is drawn', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = 'e_inner';
  const paragraph = (text: string) => ({ dir: 'auto', align: 'start', runs: [{ text }] });
  await page.evaluate(
    ({ id, cells }) => {
      const { bus, selection } = window.slidr!;
      const base = { rotation: 0, opacity: 1 };
      const group = {
        ...base,
        id: 'e_group',
        type: 'group',
        rotation: 20,
        frame: { x: 460, y: 300, w: 1000, h: 400 },
        children: [
          {
            ...base,
            id: 'e_card',
            type: 'shape',
            frame: { x: 0, y: 0, w: 1000, h: 400 },
            geometry: { kind: 'preset', preset: 'rect' },
            fill: { kind: 'solid', color: { token: 'surface' } },
          },
          {
            ...base,
            id,
            type: 'table',
            frame: { x: 50, y: 80, w: 900, h: 240 },
            rows: [80, 80, 80],
            cols: [300, 300, 300],
            dir: 'ltr',
            style: { headerRow: true, bandedRows: false, firstColumn: false },
            cells,
          },
        ],
      };
      bus.dispatch({
        type: 'element.add',
        slideId: selection.getState().currentSlideId ?? '',
        element: group as never,
      });
    },
    {
      id,
      cells: GRID.map((line) =>
        line.map((text) => ({ content: { paragraphs: [paragraph(text)] } })),
      ),
    },
  );
  await tableOnStage(page, id).waitFor();
  const inner = async () =>
    ((await table(page, 'e_group')) as unknown as { children: TableElement[] }).children[1]!;

  // One double-click goes into the group, the next into the table, at the cell under the pointer.
  const at = await centerOf(cellOnStage(page, id, 2, 2));
  await page.mouse.dblclick(at.x, at.y);
  await expect(stage(page).locator(`[data-table-overlay="${id}"]`)).toHaveAttribute(
    'data-mode',
    'object',
  );
  await typeInCell(page, id, 2, 2);
  expect(await typingCell(page)).toBe('2,2');
  await page.keyboard.type('!');
  expect((await inner()).cells[2]![2]!.content.paragraphs[0]!.runs).toEqual([{ text: 'i!' }]);
  await page.keyboard.press('Escape');
  await expectSelection(page, id, [2, 2]);
  await settled(page);

  // The line of the last column, along the rows of the table: 20 degrees down.
  const scale = await stageScale(page);
  const turn = { x: Math.cos(Math.PI / 9), y: Math.sin(Math.PI / 9) };
  const corner = (await cellOnStage(page, id, 0, 0).boundingBox())!;
  const from = await centerOf(lineOf(page, 'col', 2));
  const group = await oneUndoStep(
    page,
    () => drag(page, from, { x: from.x + 100 * turn.x, y: from.y + 100 * turn.y }),
    'e_group',
  );
  const grown = await inner();
  expectWhole(grown);
  expect(Math.abs(grown.cols[2]! - (300 + 100 / scale))).toBeLessThan(1.5);
  // The group is fitted around the wider table, in the same undo step.
  expect(group.frame.w).toBeGreaterThan(1000);
  // The first cell did not move on the screen.
  const still = (await cellOnStage(page, id, 0, 0).boundingBox())!;
  expect(still.x).toBeCloseTo(corner.x, 0);
  expect(still.y).toBeCloseTo(corner.y, 0);
  await expectSelection(page, id, [2, 2]);
  await page.screenshot({ path: 'test-results/table/in-group.png' });
});
