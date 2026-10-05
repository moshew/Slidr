import { expect, test, type Page } from '@playwright/test';
import { openApp, pageProblems, row } from './objects-helpers';
import {
  addTable,
  cellCenter,
  expectSelection,
  oneUndoStep,
  selectCell,
  selectRange,
  settled,
  stage,
  table,
  texts,
  typeInCell,
  typingCell,
} from './table-helpers';

/*
 * What ADR-033 left undone for tables, built in ADR-069: Up and Down at the edge of a cell's
 * text go to the cell above and below while typing, the padding of the cells has a control, and
 * as many rows or columns go in as are selected.
 */

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

const GRID = [
  ['a', 'b', 'c'],
  ['d', 'e', 'f'],
  ['g', 'h', 'i'],
];

/** Presses an arrow in a cell's text, and waits for the editor of the cell it leads to. */
async function arrow(page: Page, key: 'ArrowUp' | 'ArrowDown', expected: string) {
  await page.keyboard.press(key);
  await expect.poll(() => typingCell(page)).toBe(expected);
  await expect(
    page.locator('[data-testid="stage-surface"] td[data-cell-editing] [data-text-editor]'),
  ).toBeFocused();
}

for (const { dir, lang } of [
  { dir: 'rtl', lang: 'he' },
  { dir: 'ltr', lang: 'en' },
] as const) {
  test(`Up and Down at the edge of the text go to the cell above and below, ${dir}`, async ({
    page,
  }) => {
    await openApp(page, { lang });
    const id = await addTable(page, { dir, texts: GRID });
    await typeInCell(page, id, 1, 1);
    await arrow(page, 'ArrowDown', '2,1');
    await arrow(page, 'ArrowUp', '1,1');
    await arrow(page, 'ArrowUp', '0,1');
    // At the top of the table the arrow stays in the cell.
    await page.keyboard.press('ArrowUp');
    await settled(page);
    expect(await typingCell(page)).toBe('0,1');

    // A cell of two lines: Down from the first stays in it, Down from the second leaves it.
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('x');
    await page.keyboard.press('ArrowUp');
    await settled(page);
    expect(await typingCell(page)).toBe('0,1');
    await page.keyboard.press('ArrowDown');
    await settled(page);
    expect(await typingCell(page)).toBe('0,1');
    await arrow(page, 'ArrowDown', '1,1');
    // What is typed goes into the cell the arrow led to.
    await page.keyboard.type('Z');
    await page.keyboard.press('Escape');
    await settled(page);
    const grid = await texts(page);
    expect(grid[1]![1]).toContain('Z');
    expect(grid[1]![1]!.replace('Z', '')).toBe('e');
  });
}

test('as many rows as are selected go in at once, as one undo step', async ({ page }) => {
  await openApp(page, { lang: 'he' });
  const id = await addTable(page, { dir: 'rtl', texts: GRID });
  await selectRange(page, id, [0, 0], [1, 0]);
  const before = await table(page);
  const after = await oneUndoStep(page, async () => {
    await row(page).getByRole('button', { name: 'שורות ועמודות', exact: true }).click();
    await page.getByRole('menuitem', { name: 'הוספת 2 שורות מעל', exact: true }).click();
  });
  expect(after.rows).toHaveLength(5);
  expect(after.frame.h).toBeCloseTo(before.frame.h + before.rows[0]! * 2, 1);
  const grid = await texts(page);
  expect(grid.slice(0, 2)).toEqual([
    ['', '', ''],
    ['', '', ''],
  ]);
  expect(grid.slice(2)).toEqual(GRID);
  // The cells that were selected still are, two rows down.
  await expectSelection(page, id, [2, 0], [3, 0]);
});

test('as many columns as are selected go in at once, from the right-click menu too', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { dir: 'ltr', texts: GRID });
  await selectRange(page, id, [1, 0], [1, 1]);
  const after = await oneUndoStep(page, async () => {
    const at = await cellCenter(page, id, 1, 1);
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await page
      .getByTestId('stage-menu')
      .getByRole('menuitem', { name: 'Insert 2 columns to the right', exact: true })
      .click();
  });
  expect(after.cols).toHaveLength(5);
  const grid = await texts(page);
  expect(grid.map((line) => line.slice(2, 4))).toEqual([
    ['', ''],
    ['', ''],
    ['', ''],
  ]);
  // One cell selected: one column, with the words for one.
  await selectCell(page, id, 0, 0);
  await row(page).getByRole('button', { name: 'Rows and columns', exact: true }).click();
  await expect(
    page.getByRole('menuitem', { name: 'Insert column to the right', exact: true }),
  ).toBeVisible();
});

test('the padding of the selected cells is set across and down, each one undo step', async ({
  page,
}) => {
  await openApp(page, { lang: 'he' });
  const id = await addTable(page, { dir: 'rtl', texts: GRID });
  await selectRange(page, id, [1, 0], [1, 2]);
  const tool = row(page).getByRole('button', { name: 'ריפוד התאים', exact: true });
  await tool.click();
  const across = page.getByRole('textbox', { name: 'לרוחב', exact: true });
  const down = page.getByRole('textbox', { name: 'לגובה', exact: true });
  // A cell without padding of its own shows what it is drawn with.
  await expect(across).toHaveValue('20');
  await expect(down).toHaveValue('12');

  const wide = await oneUndoStep(page, async () => {
    await across.fill('40');
    await across.press('Enter');
  });
  expect(wide.cells[1]!.map((c) => c.padding)).toEqual(
    Array.from({ length: 3 }, () => ({ top: 12, right: 40, bottom: 12, left: 40 })),
  );
  expect(wide.cells[0]![0]!.padding).toBeUndefined();

  // Padding taller than the row makes it grow, in the same step.
  const rowBefore = wide.rows[1]!;
  const tall = await oneUndoStep(page, async () => {
    await down.fill('60');
    await down.press('Enter');
  });
  expect(tall.cells[1]![1]!.padding).toEqual({ top: 60, right: 40, bottom: 60, left: 40 });
  expect(tall.rows[1]!).toBeGreaterThan(rowBefore);
  await page.keyboard.press('Escape');

  // Cells that differ show no number.
  await selectRange(page, id, [0, 0], [1, 0]);
  await tool.click();
  await expect(page.getByRole('textbox', { name: 'לרוחב', exact: true })).toHaveValue('');
  await expect(stage(page)).toBeVisible();
});

test('row B of a table keeps every tool on the screen at 1366, the padding too', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page, { lang: 'he' });
  const id = await addTable(page, { dir: 'rtl', texts: GRID });
  for (const typing of [false, true]) {
    if (typing) await typeInCell(page, id, 1, 1);
    else await selectCell(page, id, 1, 1);
    await expect(row(page).getByRole('button', { name: 'ריפוד התאים', exact: true })).toBeVisible();
    const outside = await row(page).evaluate((bar) => {
      const box = bar.getBoundingClientRect();
      return [...bar.querySelectorAll('button')]
        .filter((button) => {
          const b = button.getBoundingClientRect();
          return b.width > 0 && (b.left < box.left - 0.5 || b.right > box.right + 0.5);
        })
        .map((button) => button.getAttribute('aria-label') ?? button.textContent);
    });
    expect(outside).toEqual([]);
    await page.keyboard.press('Escape');
  }
});
