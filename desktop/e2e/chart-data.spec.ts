import { expect, test, type Page } from '@playwright/test';
import {
  activeCell,
  addChart,
  chart,
  chartOnStage,
  chartText,
  clickCell,
  dataEditor,
  elements,
  gridCell,
  gridTexts,
  lastLabel,
  NAMES,
  oneUndoStep,
  openDataEditor,
  popover,
  SALES,
  selectChart,
  selectedIds,
  stage,
  steps,
  tool,
} from './chart-helpers';
import { openApp, pageProblems } from './objects-helpers';

/*
 * The data editor of a chart (WG6-T06, CHT-02): the data as a grid that works like a spreadsheet.
 * The arrows, Tab and Enter move between the cells, typing replaces, and each cell that is written
 * is one undo step. The chart on the slide follows.
 */

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

const en = NAMES.en;

/** A chart on the slide, selected, with its data editor open. */
async function openEditor(page: Page, init: Parameters<typeof addChart>[1] = {}): Promise<void> {
  await openApp(page, { lang: 'en' });
  await addChart(page, init);
  await selectChart(page);
  await openDataEditor(page);
}

const input = (page: Page) => dataEditor(page).locator('[data-chart-cell] input');
const status = (page: Page) => dataEditor(page).getByRole('status');
const dataButton = (page: Page, name: string) =>
  dataEditor(page).getByRole('button', { name, exact: true });

/** A point of the slide that no element and no popover covers: its bottom corner, far from the tools. */
async function emptySlidePoint(page: Page): Promise<{ x: number; y: number }> {
  const frame = (await page.getByTestId('stage-frame').boundingBox())!;
  return { x: frame.x + frame.width - 30, y: frame.y + frame.height - 30 };
}

async function chartCenter(page: Page): Promise<{ x: number; y: number }> {
  const box = (await chartOnStage(page).boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/* ---------------------------------------------------------------- the grid */

test('the Edit data button opens the data of the chart as a grid', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  const before = await steps(page);

  await tool(page, en.data).click();
  await expect(dataEditor(page)).toBeVisible();
  await expect(dataEditor(page)).toHaveAccessibleName(en.panel);
  expect(await gridTexts(page)).toEqual([
    ['', 'Apples', 'Pears'],
    ['Q1', '10', '1'],
    ['Q2', '20', ''],
    ['Q3', '30', '3'],
  ]);
  // The keyboard is on the corner of the grid, where a pasted range is the whole data.
  expect(await activeCell(page)).toBe('0,0');
  await expect(gridCell(page, 0, 0)).toBeFocused();
  await expect(dataEditor(page).getByRole('grid', { name: en.panel })).toBeVisible();
  await expect(status(page)).toHaveText('A range copied in Excel can be pasted here');
  // Opening it changes nothing, and the chart is still selected and in sight.
  expect(await steps(page)).toBe(before);
  expect(await selectedIds(page)).toEqual(['e_chart']);
  await expect(chartOnStage(page)).toBeInViewport({ ratio: 1 });
  // The editor opens away from the chart: it does not cover it.
  const editorBox = (await dataEditor(page).boundingBox())!;
  const chartBox = (await chartOnStage(page).boundingBox())!;
  expect(editorBox.x + editorBox.width).toBeLessThanOrEqual(chartBox.x);
});

test('typing on a cell replaces its value: one undo step, and the chart follows', async ({
  page,
}) => {
  await openEditor(page, { options: { labels: true } });
  expect(await chartText(page)).not.toContain('45');

  const after = await oneUndoStep(page, async () => {
    await clickCell(page, 1, 1);
    await page.keyboard.type('45');
    await expect(input(page)).toHaveValue('45');
    // Nothing is written while the cell is being typed in.
    expect((await chart(page)).data.series[0]?.values[0]).toBe(10);
    await page.keyboard.press('Enter');
  });
  expect(after.data.series[0]?.values).toEqual([45, 20, 30]);
  expect(await lastLabel(page)).toBe('Edit data');
  // Enter moved the keyboard a row down, as in a spreadsheet.
  expect(await activeCell(page)).toBe('2,1');
  await expect(gridCell(page, 2, 1)).toBeFocused();
  await expect(input(page)).toHaveCount(0);
  expect((await gridTexts(page))[1]).toEqual(['Q1', '45', '1']);
  // The chart on the slide shows the new value in its labels.
  await expect.poll(() => chartText(page)).toContain('45');
});

test('Ctrl+Z in the grid undoes the cell that was written, and Ctrl+Y writes it again', async ({
  page,
}) => {
  await openEditor(page);
  await clickCell(page, 1, 1);
  await page.keyboard.type('45');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await chart(page)).data.series[0]?.values[0]).toBe(45);
  // The keyboard is on a cell of the grid, not on the Stage.
  await expect(gridCell(page, 2, 1)).toBeFocused();
  await page.keyboard.press('Control+z');
  expect((await chart(page)).data).toEqual(SALES);
  expect((await gridTexts(page))[1]).toEqual(['Q1', '10', '1']);
  await page.keyboard.press('Control+y');
  expect((await chart(page)).data.series[0]?.values[0]).toBe(45);
  expect((await gridTexts(page))[1]).toEqual(['Q1', '45', '1']);
  await expect(dataEditor(page)).toBeVisible();
});

test('the arrows, Tab and Enter move between the cells', async ({ page }) => {
  await openEditor(page);
  const before = await steps(page);
  await clickCell(page, 1, 1);
  const moves: [string, string][] = [
    ['ArrowRight', '1,2'],
    // The grid ends there.
    ['ArrowRight', '1,2'],
    ['ArrowDown', '2,2'],
    ['ArrowLeft', '2,1'],
    ['ArrowUp', '1,1'],
    ['ArrowUp', '0,1'],
    ['ArrowUp', '0,1'],
    ['Tab', '0,2'],
    // Past the end of a row, Tab goes to the start of the next.
    ['Tab', '1,0'],
    ['Shift+Tab', '0,2'],
    ['Enter', '1,2'],
    ['Enter', '2,2'],
    ['Shift+Enter', '1,2'],
    ['Home', '1,0'],
    ['End', '1,2'],
  ];
  for (const [key, cell] of moves) {
    await page.keyboard.press(key);
    expect(await activeCell(page), `after ${key}`).toBe(cell);
    const [r, c] = cell.split(',').map(Number) as [number, number];
    await expect(gridCell(page, r, c)).toBeFocused();
  }
  // Moving writes nothing.
  expect(await steps(page)).toBe(before);
  expect((await chart(page)).data).toEqual(SALES);
});

test('Tab past the last cell leaves the grid, as it leaves any control', async ({ page }) => {
  await openEditor(page);
  await clickCell(page, 3, 2);
  await page.keyboard.press('Tab');
  expect(await activeCell(page)).toBe('3,2');
  await expect(gridCell(page, 3, 2)).not.toBeFocused();
});

test('in a right-to-left deck the grid reads from the right, and the arrows follow the screen', async ({
  page,
}) => {
  await openApp(page);
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page, 'he');
  await expect(dataEditor(page).locator('[data-chart-grid]')).toHaveAttribute('dir', 'rtl');
  // The categories are on the right, the series go to the left.
  const categories = (await gridCell(page, 1, 0).boundingBox())!;
  const first = (await gridCell(page, 1, 1).boundingBox())!;
  const second = (await gridCell(page, 1, 2).boundingBox())!;
  expect(categories.x).toBeGreaterThan(first.x);
  expect(first.x).toBeGreaterThan(second.x);
  // A number reads left to right also there.
  await expect(gridCell(page, 1, 1)).toHaveAttribute('dir', 'ltr');
  await expect(gridCell(page, 1, 1)).toHaveCSS('text-align', 'end');

  await clickCell(page, 1, 1);
  await page.keyboard.press('ArrowLeft');
  expect(await activeCell(page)).toBe('1,2');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await activeCell(page)).toBe('1,0');
  // Tab goes on in reading order: to the left, then to the next row.
  await page.keyboard.press('Tab');
  expect(await activeCell(page)).toBe('1,1');
});

test('the grid follows the direction of the deck, not of the UI', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  // A Hebrew deck in the English UI.
  await page.evaluate(() => {
    window.slidr!.bus.dispatch({ type: 'deck.setMeta', patch: { lang: 'he', dir: 'rtl' } });
  });
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(dataEditor(page).locator('[data-chart-grid]')).toHaveAttribute('dir', 'rtl');
  const categories = (await gridCell(page, 1, 0).boundingBox())!;
  const first = (await gridCell(page, 1, 1).boundingBox())!;
  expect(categories.x).toBeGreaterThan(first.x);
  // A series the editor adds is named in the language of the deck.
  await clickCell(page, 1, 2);
  await dataButton(page, en.addColumn).click();
  expect((await chart(page)).data.series.map((s) => s.name)).toEqual(['Apples', 'Pears', 'סדרה 3']);
});

/* ---------------------------------------------------------------- typing */

test('F2 and a double click edit what the cell holds, and Esc drops the typing', async ({
  page,
}) => {
  await openEditor(page);
  const before = await steps(page);
  await clickCell(page, 1, 1);
  await page.keyboard.press('F2');
  await expect(input(page)).toBeFocused();
  await expect(input(page)).toHaveValue('10');
  await page.keyboard.type('5');
  await expect(input(page)).toHaveValue('105');
  // Esc is the cell's: the typing goes, and the editor stays open.
  await page.keyboard.press('Escape');
  await expect(input(page)).toHaveCount(0);
  await expect(dataEditor(page)).toBeVisible();
  await expect(gridCell(page, 1, 1)).toBeFocused();
  expect((await gridTexts(page))[1]).toEqual(['Q1', '10', '1']);
  expect(await steps(page)).toBe(before);

  // A double click opens the cell with its value, and Tab writes it.
  const after = await oneUndoStep(page, async () => {
    await gridCell(page, 3, 2).dblclick();
    await expect(input(page)).toHaveValue('3');
    await page.keyboard.type('3');
    await page.keyboard.press('Tab');
  });
  expect(after.data.series[1]?.values).toEqual([1, null, 33]);
  await expect(input(page)).toHaveCount(0);
});

test('while a cell is edited the arrows move the caret; typed over, they leave the cell', async ({
  page,
}) => {
  await openEditor(page);
  // Edited with F2: the left arrow is the caret's.
  await clickCell(page, 1, 1);
  await page.keyboard.press('F2');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('5');
  await expect(input(page)).toHaveValue('150');
  await page.keyboard.press('Enter');
  expect((await chart(page)).data.series[0]?.values[0]).toBe(150);

  // Typed over: an arrow writes the cell and moves on, as in Excel.
  await clickCell(page, 1, 1);
  await page.keyboard.type('7');
  await page.keyboard.press('ArrowRight');
  expect(await activeCell(page)).toBe('1,2');
  await expect(input(page)).toHaveCount(0);
  expect((await chart(page)).data.series[0]?.values[0]).toBe(7);
  await page.keyboard.type('8');
  await page.keyboard.press('ArrowDown');
  expect(await activeCell(page)).toBe('2,2');
  expect((await chart(page)).data.series[1]?.values[0]).toBe(8);
});

test('numbers are read as people write them', async ({ page }) => {
  await openEditor(page);
  const typed: [string, number][] = [
    ['1,234.5', 1234.5],
    ['1,5', 1.5],
    ['(20)', -20],
    ['12%', 12],
    ['$3,000', 3000],
  ];
  for (const [text, value] of typed) {
    await clickCell(page, 1, 1);
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await chart(page)).data.series[0]?.values[0], text).toBe(value);
  }
  // The grid shows the number, not what was typed.
  expect((await gridTexts(page))[1]?.[1]).toBe('3000');
});

test('text in a value cell keeps the old value, and the cell is marked', async ({ page }) => {
  await openEditor(page);
  const before = await steps(page);
  await clickCell(page, 1, 1);
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  // The typing goes on in the same cell, marked, and the message says why.
  await expect(input(page)).toBeFocused();
  await expect(input(page)).toHaveAttribute('aria-invalid', 'true');
  expect(await activeCell(page)).toBe('1,1');
  await expect(status(page)).toHaveText('"abc" is not a number; the value was kept');
  expect(await steps(page)).toBe(before);
  expect((await chart(page)).data).toEqual(SALES);

  // Tab does not leave it either.
  await page.keyboard.press('Tab');
  await expect(input(page)).toBeFocused();
  expect(await steps(page)).toBe(before);

  // A number is taken, and the mark goes.
  await page.keyboard.press('Control+a');
  await page.keyboard.type('12');
  await expect(input(page)).not.toHaveAttribute('aria-invalid', 'true');
  await page.keyboard.press('Enter');
  expect((await chart(page)).data.series[0]?.values[0]).toBe(12);
  await expect(status(page)).toHaveText('A range copied in Excel can be pasted here');
  expect(await steps(page)).toBe(before + 1);
});

test('text left in a value cell is dropped when the cell is left, and the cell stays marked', async ({
  page,
}) => {
  await openEditor(page);
  const before = await steps(page);
  await clickCell(page, 2, 1);
  await page.keyboard.type('n/a');
  await gridCell(page, 3, 2).click();
  await expect(input(page)).toHaveCount(0);
  await expect(gridCell(page, 2, 1)).toHaveAttribute('aria-invalid', 'true');
  await expect(gridCell(page, 2, 1)).toHaveText('20');
  await expect(status(page)).toContainText('n/a');
  expect(await activeCell(page)).toBe('3,2');
  expect(await steps(page)).toBe(before);
  expect((await chart(page)).data).toEqual(SALES);
  // The mark goes with the next thing that is typed.
  await page.keyboard.type('4');
  await expect(gridCell(page, 2, 1)).not.toHaveAttribute('aria-invalid', 'true');
});

test('a series and a category are named with any text, also in Hebrew', async ({ page }) => {
  await openEditor(page);
  let after = await oneUndoStep(page, async () => {
    await clickCell(page, 0, 1);
    // A Hebrew letter typed on the cell, as a Hebrew keyboard sends it. (Playwright has no
    // Hebrew layout: it would put the letter in as text, with no key at all.)
    await gridCell(page, 0, 1).dispatchEvent('keydown', { key: 'ת', bubbles: true });
    await expect(input(page)).toHaveValue('ת');
    await expect(input(page)).toBeFocused();
    await page.keyboard.type('פוחים 2026');
    await page.keyboard.press('Enter');
  });
  expect(after.data.series[0]?.name).toBe('תפוחים 2026');
  after = await oneUndoStep(page, async () => {
    await clickCell(page, 2, 0);
    await page.keyboard.type('Second quarter');
    await page.keyboard.press('Enter');
  });
  expect(after.data.categories).toEqual(['Q1', 'Second quarter', 'Q3']);
  await expect.poll(() => chartText(page)).toContain('Second quarter');
  // A name is not a number cell: it reads the way its text does.
  await expect(gridCell(page, 0, 1)).not.toHaveAttribute('dir', 'ltr');
});

test('Delete empties a cell, as one undo step', async ({ page }) => {
  await openEditor(page);
  const after = await oneUndoStep(page, async () => {
    await clickCell(page, 3, 1);
    await page.keyboard.press('Delete');
  });
  expect(after.data.series[0]?.values).toEqual([10, 20, null]);
  expect((await gridTexts(page))[3]).toEqual(['Q3', '', '3']);
  await expect(gridCell(page, 3, 1)).toBeFocused();
});

test('typing on the grid is not a shortcut of the app', async ({ page }) => {
  await openEditor(page);
  await clickCell(page, 0, 1);
  // "T" adds a text box when the keyboard is on the slide.
  await page.keyboard.type('t');
  await expect(input(page)).toHaveValue('t');
  expect((await elements(page)).map((e) => e.type)).toEqual(['chart']);
  await page.keyboard.press('Escape');
  // Nothing is typed in the corner, and nothing else happens.
  await clickCell(page, 0, 0);
  await page.keyboard.type('t');
  await expect(input(page)).toHaveCount(0);
  expect((await elements(page)).map((e) => e.type)).toEqual(['chart']);
  // Delete on a cell does not delete the chart.
  await page.keyboard.press('Delete');
  expect((await elements(page)).map((e) => e.type)).toEqual(['chart']);
});

/* ---------------------------------------------------------------- rows and columns */

test('the buttons add a row under the cell and a column after it', async ({ page }) => {
  await openEditor(page);
  await clickCell(page, 2, 1);
  let after = await oneUndoStep(page, () => dataButton(page, en.addRow).click());
  expect(after.data.categories).toEqual(['Q1', 'Q2', '', 'Q3']);
  expect(after.data.series[0]?.values).toEqual([10, 20, null, 30]);
  expect(await lastLabel(page)).toBe('Insert row');
  // The keyboard is on the new row, ready to type.
  expect(await activeCell(page)).toBe('3,1');
  await expect(gridCell(page, 3, 1)).toBeFocused();
  await page.keyboard.type('25');
  await page.keyboard.press('Enter');
  expect((await chart(page)).data.series[0]?.values).toEqual([10, 20, 25, 30]);

  await clickCell(page, 1, 1);
  after = await oneUndoStep(page, () => dataButton(page, en.addColumn).click());
  expect(after.data.series.map((s) => s.name)).toEqual(['Apples', 'Series 3', 'Pears']);
  expect(after.data.series[1]?.values).toEqual([null, null, null, null]);
  expect(await activeCell(page)).toBe('1,2');
  await expect(gridCell(page, 1, 2)).toBeFocused();
  expect((await gridTexts(page))[0]).toEqual(['', 'Apples', 'Series 3', 'Pears']);
});

test('the buttons delete the row and the column of the cell, but never the last', async ({
  page,
}) => {
  await openEditor(page);
  // At the corner there is no row and no column to delete.
  await expect(dataButton(page, en.deleteRow)).toBeDisabled();
  await expect(dataButton(page, en.deleteColumn)).toBeDisabled();

  await clickCell(page, 2, 2);
  let after = await oneUndoStep(page, () => dataButton(page, en.deleteRow).click());
  expect(after.data).toEqual({
    categories: ['Q1', 'Q3'],
    series: [
      { name: 'Apples', values: [10, 30] },
      { name: 'Pears', values: [1, 3] },
    ],
  });
  expect(await activeCell(page)).toBe('2,2');
  await expect(gridCell(page, 2, 2)).toBeFocused();

  after = await oneUndoStep(page, () => dataButton(page, en.deleteColumn).click());
  expect(after.data.series).toEqual([{ name: 'Apples', values: [10, 30] }]);
  expect(await activeCell(page)).toBe('2,1');
  // One series is left: it stays.
  await expect(dataButton(page, en.deleteColumn)).toBeDisabled();
  await oneUndoStep(page, () => dataButton(page, en.deleteRow).click());
  await expect(dataButton(page, en.deleteRow)).toBeDisabled();
  expect((await gridTexts(page)).length).toBe(2);
});

test('an undo that takes a row away leaves the keyboard on a cell that exists', async ({
  page,
}) => {
  await openEditor(page);
  await clickCell(page, 3, 2);
  await dataButton(page, en.addRow).click();
  expect(await activeCell(page)).toBe('4,2');
  await page.keyboard.press('Control+z');
  expect(await gridTexts(page)).toHaveLength(4);
  expect(await activeCell(page)).toBe('3,2');
});

/* ---------------------------------------------------------------- open and closed */

test('the editor stays open while the user works elsewhere', async ({ page }) => {
  await openEditor(page);
  // Another tool of the row: its popover opens next to the editor, and closes alone.
  await tool(page, en.legend).click();
  await expect(popover(page)).toBeVisible();
  await expect(dataEditor(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(popover(page)).toBeHidden();
  await expect(dataEditor(page)).toBeVisible();

  // A click on the chart: it stays selected, and its data stays open.
  const at = await chartCenter(page);
  await page.mouse.click(at.x, at.y);
  expect(await selectedIds(page)).toEqual(['e_chart']);
  await expect(dataEditor(page)).toBeVisible();
  // An arrow on the Stage moves the chart, and the editor is still there.
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await chart(page)).frame.x).toBe(411);
  await expect(dataEditor(page)).toBeVisible();
});

test('the editor closes with its button, with the Edit data button, and with Esc', async ({
  page,
}) => {
  await openEditor(page);
  await dataButton(page, en.close).click();
  await expect(dataEditor(page)).toBeHidden();
  // The keyboard is back on the Stage, and the chart is still selected.
  await expect(stage(page)).toBeFocused();
  expect(await selectedIds(page)).toEqual(['e_chart']);

  await openDataEditor(page);
  await tool(page, en.data).click();
  await expect(dataEditor(page)).toBeHidden();

  await openDataEditor(page);
  await clickCell(page, 1, 1);
  await page.keyboard.press('Escape');
  await expect(dataEditor(page)).toBeHidden();
  await expect(stage(page)).toBeFocused();
  // Esc closed the editor and nothing more.
  expect(await selectedIds(page)).toEqual(['e_chart']);
  await page.keyboard.press('Escape');
  expect(await selectedIds(page)).toEqual([]);
});

test('the editor goes when the chart is no longer what is selected', async ({ page }) => {
  await openEditor(page);
  const at = await emptySlidePoint(page);
  await page.mouse.click(at.x, at.y);
  expect(await selectedIds(page)).toEqual([]);
  await expect(dataEditor(page)).toBeHidden();
  // Selected again, the chart is an object: its data is not opened behind the user's back.
  await selectChart(page);
  await expect(dataEditor(page)).toBeHidden();

  // An undo that removes the chart takes its editor with it.
  await openDataEditor(page);
  await page.evaluate(() => window.slidr!.bus.undo());
  expect(await elements(page)).toEqual([]);
  await expect(dataEditor(page)).toBeHidden();
});

test('the editor of one chart is not the editor of another', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addChart(page, { frame: { x: 100, y: 500, w: 700, h: 450 } });
  await addChart(page, {
    id: 'e_other',
    frame: { x: 1000, y: 500, w: 700, h: 450 },
    data: { categories: ['a'], series: [{ name: 'Only', values: [5] }] },
  });
  await selectChart(page);
  await openDataEditor(page);
  expect((await gridTexts(page))[0]).toEqual(['', 'Apples', 'Pears']);
  // The other chart is selected: the editor of the first closes.
  const box = (await chartOnStage(page, 'e_other').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  expect(await selectedIds(page)).toEqual(['e_other']);
  await expect(dataEditor(page)).toBeHidden();
  await openDataEditor(page);
  expect(await gridTexts(page)).toEqual([
    ['', 'Only'],
    ['a', '5'],
  ]);
});

test('what is typed in a cell is written when the user clicks the slide', async ({ page }) => {
  await openEditor(page);
  // On the chart: it stays selected, and the editor open.
  await clickCell(page, 1, 1);
  await page.keyboard.type('77');
  const before = await steps(page);
  const chartAt = await chartCenter(page);
  await page.mouse.click(chartAt.x, chartAt.y);
  await expect.poll(async () => (await chart(page)).data.series[0]?.values[0]).toBe(77);
  expect(await steps(page)).toBe(before + 1);
  await expect(dataEditor(page)).toBeVisible();
  await expect(input(page)).toHaveCount(0);
  // The keyboard went where the click was: the grid did not take it back.
  await expect(stage(page)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await chart(page)).frame.y).toBe(231);
  // And into another tool of the row: its field keeps the keyboard while a cell is left behind.
  await clickCell(page, 3, 1);
  await page.keyboard.type('99');
  await tool(page, en.title).click();
  const title = popover(page).getByRole('textbox', { name: en.titleField });
  await title.click();
  await expect(title).toBeFocused();
  expect((await chart(page)).data.series[0]?.values).toEqual([77, 20, 99]);
  await page.keyboard.press('Escape');
  await expect(popover(page)).toBeHidden();
  await page.evaluate(() => window.slidr!.bus.undo());

  // On the empty slide: the selection goes and the editor with it, and the value is still written.
  await clickCell(page, 2, 1);
  await page.keyboard.type('88');
  const empty = await emptySlidePoint(page);
  await page.mouse.click(empty.x, empty.y);
  await expect(dataEditor(page)).toBeHidden();
  expect((await chart(page)).data.series[0]?.values).toEqual([77, 88, 30]);
  // The two cells that were written, and the move of the chart.
  expect(await steps(page)).toBe(before + 3);
});

/* ---------------------------------------------------------------- scatter */

test('a scatter chart: the first column holds the x values, and its points become rows', async ({
  page,
}) => {
  await openEditor(page, {
    chartType: 'scatter',
    data: {
      categories: [],
      series: [
        {
          name: 'A',
          values: [],
          points: [
            { x: 1, y: 10 },
            { x: 2.5, y: 20 },
          ],
        },
        { name: 'B', values: [], points: [{ x: 2.5, y: 7 }] },
      ],
    },
  });
  expect(await gridTexts(page)).toEqual([
    ['', 'A', 'B'],
    ['1', '10', ''],
    ['2.5', '20', '7'],
  ]);
  // The x values are numbers: they read left to right.
  await expect(gridCell(page, 1, 0)).toHaveAttribute('dir', 'ltr');

  // The first edit turns the points into a table, in the same undo step.
  const after = await oneUndoStep(page, async () => {
    await clickCell(page, 1, 2);
    await page.keyboard.type('3');
    await page.keyboard.press('Enter');
  });
  expect(after.data).toEqual({
    categories: ['1', '2.5'],
    series: [
      { name: 'A', values: [10, 20] },
      { name: 'B', values: [3, 7] },
    ],
  });

  // A new row takes the next x, so the points that are there stay where they are.
  await clickCell(page, 2, 1);
  await dataButton(page, en.addRow).click();
  expect((await chart(page)).data.categories).toEqual(['1', '2.5', '3.5']);
});
