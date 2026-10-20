import { expect, test, type Page } from '@playwright/test';
import {
  addChart,
  chart,
  chartText,
  clickCell,
  dataEditor,
  elements,
  excel,
  gridCell,
  gridTexts,
  lastLabel,
  oneUndoStep,
  openDataEditor,
  plain,
  SALES,
  selectChart,
  selectedIds,
  stage,
  steps,
} from './chart-helpers';
import { deck, openApp, pageProblems } from './objects-helpers';
import { copy, paste } from './table-helpers';

/*
 * Chart data on the clipboard (WG6-T06, CHT-02): a range copied in Excel, an HTML table and
 * delimited text are pasted onto a selected chart as its data, and into the data editor from the
 * selected cell. Each paste is one undo step.
 *
 * As in the table specs, the clipboard of the machine is not touched: the app is handed the
 * `paste`, `copy` and `cut` events a browser would send, with their own data. The Excel fixture is
 * written by hand in Excel's style; everything from the event on is the real path.
 */

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

const RANGE = [
  ['מוצר', 'Q1', 'Q2'],
  ['תפוחים', '1,200', '1,350'],
  ['אגסים', '980', '1,040'],
];

const RANGE_DATA = {
  categories: ['תפוחים', 'אגסים'],
  series: [
    { name: 'Q1', values: [1200, 980] },
    { name: 'Q2', values: [1350, 1040] },
  ],
};

/** Nothing was made of the pasted range but the data: no table, no picture, no text box. */
async function expectOnlyTheChart(page: Page): Promise<void> {
  // Importing a picture takes a moment: one that was taken would be on the slide by now.
  await page.waitForTimeout(400);
  expect((await elements(page)).map((e) => e.type)).toEqual(['chart']);
  expect(Object.keys((await deck(page)).assets)).toEqual([]);
}

/* ---------------------------------------------------------------- onto a selected chart */

test('a range copied in Excel, pasted onto a selected chart, becomes its data', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await expect(stage(page)).toBeFocused();

  const after = await oneUndoStep(page, async () => {
    // The app took the paste.
    expect(await paste(page, excel(RANGE))).toBe(false);
  });
  expect(after.data).toEqual(RANGE_DATA);
  expect(after.chartType).toBe('column');
  expect(await lastLabel(page)).toBe('Paste data');
  // Not a new table, and not the picture Excel puts next to the range.
  await expectOnlyTheChart(page);
  // The chart is still the selected object, and it shows the new data.
  expect(await selectedIds(page)).toEqual(['e_chart']);
  await expect.poll(() => chartText(page)).toContain('תפוחים');
  expect(await chartText(page)).toContain('Q2');
});

test('tab-separated text pasted onto a selected chart becomes its data', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addChart(page, { chartType: 'line' });
  await selectChart(page);
  const after = await oneUndoStep(page, async () => {
    expect(await paste(page, plain('\t2024\t2025\r\nNorth\t5\t7.5\r\nSouth\t-3\t\r\n'))).toBe(
      false,
    );
  });
  expect(after.data).toEqual({
    categories: ['North', 'South'],
    series: [
      { name: '2024', values: [5, -3] },
      { name: '2025', values: [7.5, null] },
    ],
  });
  await expectOnlyTheChart(page);
});

test('comma-separated text pasted onto a selected chart becomes its data', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  const after = await oneUndoStep(page, async () => {
    expect(await paste(page, plain('Region,Sales\n"Tel Aviv, centre","1,200"\nHaifa,800\n'))).toBe(
      false,
    );
  });
  expect(after.data).toEqual({
    categories: ['Tel Aviv, centre', 'Haifa'],
    series: [{ name: 'Sales', values: [1200, 800] }],
  });
  await expectOnlyTheChart(page);
});

test('a pasted range keeps the type and the options of the chart, and the colour of a series', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page, {
    chartType: 'bar',
    options: { title: 'Fruit', labels: true },
    data: {
      categories: ['a'],
      series: [{ name: 'One', values: [1], color: { token: 'accent' } }],
    },
  });
  await selectChart(page);
  const before = await chart(page);
  await paste(page, excel(RANGE));
  const after = await chart(page);
  expect(after.chartType).toBe('bar');
  expect(after.options).toEqual(before.options);
  expect(after.frame).toEqual(before.frame);
  // The series in the first column keeps the colour the first series had.
  expect(after.data.series[0]).toEqual({ ...RANGE_DATA.series[0], color: { token: 'accent' } });
});

test('one cell pasted on a selected chart is not data: it is text, as it was', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await paste(page, plain('Hello world'));
  await expect
    .poll(async () => (await elements(page)).map((e) => e.type))
    .toEqual(['chart', 'text']);
  expect((await chart(page)).data).toEqual(SALES);
});

test('without a selected chart a pasted range still becomes a table', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await stage(page).focus();
  expect(await selectedIds(page)).toEqual([]);
  expect(await paste(page, excel(RANGE))).toBe(false);
  await expect
    .poll(async () => (await elements(page)).map((e) => e.type))
    .toEqual(['chart', 'table']);
  expect((await chart(page)).data).toEqual(SALES);
});

test('a chart copied as an object is pasted as a second chart, not as data', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  const copied = await copy(page);
  expect(Object.keys(copied)).toContain('application/x-slidr+json');
  await paste(page, { data: copied });
  await expect
    .poll(async () => (await elements(page)).map((e) => e.type))
    .toEqual(['chart', 'chart']);
  expect((await chart(page)).data).toEqual(SALES);
});

/* ---------------------------------------------------------------- in the data editor */

test('in the data editor, a range pasted at the corner is the whole data', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page);
  await expect(gridCell(page, 0, 0)).toBeFocused();

  const after = await oneUndoStep(page, async () => {
    expect(await paste(page, excel(RANGE))).toBe(false);
  });
  expect(after.data).toEqual(RANGE_DATA);
  expect(await gridTexts(page)).toEqual([
    ['', 'Q1', 'Q2'],
    ['תפוחים', '1200', '1350'],
    ['אגסים', '980', '1040'],
  ]);
  await expectOnlyTheChart(page);
  // The editor is still open, with the keyboard on its corner.
  await expect(dataEditor(page)).toBeVisible();
  await expect(gridCell(page, 0, 0)).toBeFocused();
});

test('in the data editor, tab-separated text goes in from the selected cell, and the chart grows', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page);
  await clickCell(page, 2, 1);

  const after = await oneUndoStep(page, async () => {
    expect(await paste(page, plain('200\t2\t50\r\n300\t3\t60\r\n400\t4\t70\r\n'))).toBe(false);
  });
  expect(await gridTexts(page)).toEqual([
    ['', 'Apples', 'Pears', 'Series 3'],
    ['Q1', '10', '1', ''],
    ['Q2', '200', '2', '50'],
    ['Q3', '300', '3', '60'],
    ['', '400', '4', '70'],
  ]);
  expect(after.data.categories).toEqual(['Q1', 'Q2', 'Q3', '']);
  await expectOnlyTheChart(page);
  expect(await lastLabel(page)).toBe('Paste data');
  // The keyboard stays on the cell the paste began at.
  await expect(gridCell(page, 2, 1)).toBeFocused();
});

test('in the data editor, an HTML table pasted on the header row names the series', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page);
  await clickCell(page, 0, 1);
  const html =
    '<meta charset="utf-8"><table><tr><th>2025</th><th>2026</th></tr>' +
    '<tr><td>1.5</td><td><b>2.5</b></td></tr></table>';
  const after = await oneUndoStep(page, () =>
    paste(page, { data: { 'text/html': html, 'text/plain': '2025\t2026\n1.5\t2.5' } }),
  );
  expect(after.data).toEqual({
    categories: ['Q1', 'Q2', 'Q3'],
    series: [
      { name: '2025', values: [1.5, 20, 30] },
      { name: '2026', values: [2.5, null, 3] },
    ],
  });
});

test('in the data editor, one value pasted on a cell is the value of that cell', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page);
  await clickCell(page, 2, 2);
  const after = await oneUndoStep(page, async () => {
    expect(await paste(page, plain('1,5'))).toBe(false);
  });
  expect(after.data.series[1]?.values).toEqual([1, 1.5, 3]);

  // Text that is no number leaves the value as it is, and makes nothing on the slide.
  const before = await steps(page);
  expect(await paste(page, plain('Hello, world'))).toBe(false);
  expect(await steps(page)).toBe(before);
  expect((await chart(page)).data.series[1]?.values).toEqual([1, 1.5, 3]);
  // On the corner one text is not the data of a chart: nothing changes.
  await clickCell(page, 0, 0);
  expect(await paste(page, plain('Title'))).toBe(false);
  expect(await steps(page)).toBe(before);
  await expectOnlyTheChart(page);
});

test('in the data editor, a paste in a cell that is being typed in is left to its text field', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page);
  await clickCell(page, 1, 1);
  await page.keyboard.type('4');
  const before = await steps(page);
  // Not taken by the app: the browser pastes the text at the caret of the field.
  expect(await paste(page, excel(RANGE))).toBe(true);
  expect(await steps(page)).toBe(before);
  await expectOnlyTheChart(page);
  expect((await chart(page)).data).toEqual(SALES);
});

test('a copy in the data editor takes the cell, and at the corner the whole grid', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page);
  const before = await steps(page);

  // At the corner: the whole grid, as tab-separated text and as a table for Excel.
  const all = await copy(page);
  expect(all['text/plain']).toBe('\tApples\tPears\r\nQ1\t10\t1\r\nQ2\t20\t\r\nQ3\t30\t3');
  expect(all['text/html']).toContain('<table');
  // The chart itself was not copied as an element of the slide.
  expect(all).not.toHaveProperty('application/x-slidr+json');

  await clickCell(page, 3, 1);
  const one = await copy(page);
  expect(one).toEqual({ 'text/plain': '30' });
  expect(await steps(page)).toBe(before);

  // What was copied at the corner is pasted back there, to a chart that was changed since.
  await page.keyboard.press('Delete');
  expect((await chart(page)).data.series[0]?.values).toEqual([10, 20, null]);
  await clickCell(page, 0, 0);
  await paste(page, { data: all });
  expect((await chart(page)).data).toEqual(SALES);
});

test('a cut in the data editor empties the cell, and the chart stays on the slide', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page);
  await clickCell(page, 1, 2);
  let cut: Record<string, string> = {};
  const after = await oneUndoStep(page, async () => {
    cut = await copy(page, 'cut');
  });
  expect(cut).toEqual({ 'text/plain': '1' });
  expect(after.data.series[1]?.values).toEqual([null, null, 3]);
  expect(await lastLabel(page)).toBe('Cut');
  expect((await elements(page)).map((e) => e.type)).toEqual(['chart']);
  // At the corner a cut is a copy: the data is not emptied.
  await clickCell(page, 0, 0);
  const before = await steps(page);
  await copy(page, 'cut');
  expect(await steps(page)).toBe(before);
  expect((await elements(page)).map((e) => e.type)).toEqual(['chart']);
});

test('in a Hebrew deck a pasted range that adds a series names it in Hebrew', async ({ page }) => {
  await openApp(page);
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page, 'he');
  await clickCell(page, 1, 2);
  await paste(page, plain('5\t6\r\n7\t8\r\n'));
  await expect
    .poll(async () => (await chart(page)).data.series.map((s) => s.name))
    .toEqual(['Apples', 'Pears', 'סדרה 3']);
  expect(await lastLabel(page)).toBe('הדבקת נתונים');
});
