import { expect, test, type Page } from '@playwright/test';
import { openApp } from './arrange-helpers';
import {
  addTable,
  expectSelection,
  oneUndoStep,
  selectCell,
  selectRange,
  settled,
  stage,
  steps,
  table,
  typingCell,
} from './table-helpers';

/*
 * The rules between the rows and the columns of a table, from the keyboard (WG13-T06, UI-06):
 * ADR-060 listed them as the pointer's alone. Among the cells, Ctrl with an arrow moves the rule
 * at the end of the active cell, the way the arrow points: the column's width, the row's height.
 */

const GRID = [
  ['a', 'b', 'c'],
  ['d', 'e', 'f'],
  ['g', 'h', 'i'],
];

async function open(page: Page, dir: 'ltr' | 'rtl' = 'ltr') {
  await openApp(page, { lang: 'en' });
  await addTable(page, { texts: GRID, dir, frame: { x: 360, y: 240, w: 1200, h: 240 } });
}

test('Ctrl and a side arrow moves the rule after the column, a burst being one undo step', async ({
  page,
}) => {
  await open(page);
  await selectCell(page, 'e_table', 1, 0);
  const after = await oneUndoStep(page, async () => {
    await page.keyboard.press('Control+ArrowRight');
    await page.keyboard.press('Control+ArrowRight');
    await page.keyboard.press('Control+Shift+ArrowRight');
  });
  // The column grew by twelve at the cost of the next one; the table kept its width.
  expect(after.cols).toEqual([412, 388, 400]);
  expect(after.frame.w).toBe(1200);
  // The cell selection stayed where it was: the key sized, and did not move.
  await expectSelection(page, 'e_table', [1, 0]);
  await expect(stage(page)).toBeFocused();

  // A pause ends the burst; back the other way is a step of its own.
  await page.waitForTimeout(900);
  const back = await oneUndoStep(page, () => page.keyboard.press('Control+Shift+ArrowLeft'));
  expect(back.cols).toEqual([402, 398, 400]);
});

test('the rule after the last column changes the width of the table', async ({ page }) => {
  await open(page);
  await selectCell(page, 'e_table', 0, 2);
  const after = await oneUndoStep(page, () => page.keyboard.press('Control+Shift+ArrowRight'));
  expect(after.cols).toEqual([400, 400, 410]);
  expect(after.frame).toMatchObject({ x: 360, w: 1210 });
});

test('Ctrl and Down or Up moves the rule under the row, and a row is not shorter than its text', async ({
  page,
}) => {
  await open(page);
  await selectCell(page, 'e_table', 1, 1);
  const taller = await oneUndoStep(page, async () => {
    await page.keyboard.press('Control+Shift+ArrowDown');
    await page.keyboard.press('Control+ArrowDown');
  });
  expect(taller.rows).toEqual([80, 91, 80]);
  expect(taller.frame.h).toBe(251);

  // Up, far past what the text needs: the row stops at its text, as it does under a drag, and
  // the model says the height the row is drawn at (which the font and the padding decide).
  const drawn = () =>
    page.evaluate(() => {
      const rows = document.querySelectorAll<HTMLElement>(
        '[data-testid="stage-frame"] [data-element-id="e_table"] > table > tbody > tr',
      );
      return [...rows].map((row) => row.offsetHeight);
    });
  await page.waitForTimeout(900);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Control+Shift+ArrowUp');
  await settled(page);
  const shorter = await table(page);
  // Twelve presses asked for 120 less than 91; the text kept the row well above that.
  expect(shorter.rows[1]).toBeLessThan(80);
  expect(shorter.rows[1]).toBeGreaterThan(40);
  expect(shorter.rows).toEqual(await drawn());
  expect(shorter.rows[0]).toBe(80);
  expect(shorter.frame.h).toBe(shorter.rows[0]! + shorter.rows[1]! + shorter.rows[2]!);

  // At the limit a press has nothing to change, and leaves no undo step that does nothing.
  await page.waitForTimeout(900);
  const before = await steps(page);
  await page.keyboard.press('Control+Shift+ArrowUp');
  await settled(page);
  expect((await table(page)).rows).toEqual(shorter.rows);
  expect(await steps(page)).toBe(before);
});

test('in a right-to-left table the rule after a column is on its left, and Left widens it', async ({
  page,
}) => {
  await open(page, 'rtl');
  await selectCell(page, 'e_table', 0, 0);
  const after = await oneUndoStep(page, () => page.keyboard.press('Control+Shift+ArrowLeft'));
  expect(after.cols).toEqual([410, 390, 400]);
  await page.waitForTimeout(900);
  const back = await oneUndoStep(page, () => page.keyboard.press('Control+Shift+ArrowRight'));
  expect(back.cols).toEqual([400, 400, 400]);
});

test('a merged cell is sized by the rule at its own end', async ({ page }) => {
  await open(page);
  // The first cell covers two columns and two rows, merged the way the app merges: from row B.
  await selectRange(page, 'e_table', [0, 0], [1, 1]);
  await page
    .getByTestId('top-tools-b')
    .getByRole('button', { name: 'Merge cells', exact: true })
    .click();
  await settled(page);
  await expectSelection(page, 'e_table', [0, 0]);
  await stage(page).focus();
  // Its four texts are four lines now, and its rows are as tall as those need: the sizes are
  // read as the merge left them, not assumed.
  const merged = await table(page);
  expect(merged.cells[0]![0]).toMatchObject({ rowSpan: 2, colSpan: 2 });

  const wider = await oneUndoStep(page, () => page.keyboard.press('Control+Shift+ArrowRight'));
  // The rule after the second column, which is where the merged cell ends.
  expect(wider.cols).toEqual([merged.cols[0], merged.cols[1]! + 10, merged.cols[2]! - 10]);
  await page.waitForTimeout(900);
  const taller = await oneUndoStep(page, () => page.keyboard.press('Control+Shift+ArrowDown'));
  // And the rule under the second row: the first row and the third are as they were.
  expect(taller.rows).toEqual([merged.rows[0], merged.rows[1]! + 10, merged.rows[2]]);
});

test('the plain arrows still go from cell to cell, and typing keeps Ctrl with an arrow', async ({
  page,
}) => {
  await open(page);
  await selectCell(page, 'e_table', 1, 1);
  await page.keyboard.press('ArrowRight');
  await expectSelection(page, 'e_table', [1, 2]);
  await page.keyboard.press('Shift+ArrowLeft');
  await expectSelection(page, 'e_table', [1, 1], [1, 2]);

  // While typing in a cell, Ctrl with an arrow is the text's: a word along, and no rule moves.
  await page.keyboard.press('Escape');
  await selectCell(page, 'e_table', 0, 0);
  await page.keyboard.press('Enter');
  await expect.poll(() => typingCell(page)).not.toBeNull();
  const before = await steps(page);
  await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('Control+ArrowLeft');
  expect((await table(page)).cols).toEqual([400, 400, 400]);
  expect(await steps(page)).toBe(before);
});
