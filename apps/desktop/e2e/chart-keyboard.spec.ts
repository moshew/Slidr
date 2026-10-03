import { expect, test, type Page } from '@playwright/test';
import {
  addChart,
  chart,
  dataEditor,
  elements,
  gridCell,
  openDataEditor,
  selectChart,
  selectedIds,
  stage,
  steps,
  tool,
} from './chart-helpers';
import { addElement, openApp, pageProblems } from './objects-helpers';
import { addTable, editingId } from './table-helpers';

/*
 * Enter on a selected chart opens its data editor (WG6-T06), as Enter goes into a table or into
 * the text of a text box. The key stays what it is everywhere else: for the kinds the Stage edits
 * in place, for a button that has the focus, and for a field.
 */

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

const TEXT = {
  id: 'e_text',
  type: 'text',
  frame: { x: 160, y: 60, w: 800, h: 120 },
  autoFit: 'none',
  vAlign: 'top',
  content: { paragraphs: [{ dir: 'auto', align: 'start', runs: [{ text: 'Title' }] }] },
};

const select = (page: Page, id: string) =>
  page.evaluate((elementId) => {
    window.slidr!.selection.getState().selectElements([elementId]);
  }, id);

test('Enter on a selected chart opens its data editor, with the keyboard on the grid', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  const before = await steps(page);
  await page.keyboard.press('Enter');
  await expect(dataEditor(page)).toBeVisible();
  await expect(gridCell(page, 0, 0)).toBeFocused();
  // Opening the data is not a change of the deck.
  expect(await steps(page)).toBe(before);
  expect(await selectedIds(page)).toEqual(['e_chart']);

  // From the Stage again, with the editor open: the keyboard goes back into the grid.
  await stage(page).focus();
  await page.keyboard.press('Enter');
  await expect(dataEditor(page)).toBeVisible();
  await expect(gridCell(page, 0, 0)).toBeFocused();
  // And in the grid Enter is the grid's: it moves down a row.
  await page.keyboard.press('Enter');
  await expect(gridCell(page, 1, 0)).toBeFocused();
});

test('Enter in the Hebrew UI opens the data editor as well', async ({ page }) => {
  await openApp(page);
  await addChart(page);
  await selectChart(page);
  await page.keyboard.press('Enter');
  await expect(dataEditor(page)).toBeVisible();
  await expect(dataEditor(page)).toHaveAccessibleName('נתוני הגרף');
});

test('Enter leaves a locked chart alone, and does nothing with two charts selected', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page, { extra: { locked: true } });
  await selectChart(page);
  await page.keyboard.press('Enter');
  await expect(dataEditor(page)).toBeHidden();

  await addChart(page, { id: 'e_second', frame: { x: 100, y: 100, w: 500, h: 300 } });
  await page.evaluate(() => {
    window.slidr!.selection.getState().selectElements(['e_chart', 'e_second']);
  });
  await stage(page).focus();
  await page.keyboard.press('Enter');
  await expect(dataEditor(page)).toBeHidden();
});

test('Enter still edits the text of a text box and goes into a table', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await addElement(page, TEXT);
  await stage(page).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => editingId(page)).toBe('e_text');
  await expect(stage(page).locator('[data-text-editor]')).toBeFocused();
  await expect(dataEditor(page)).toBeHidden();
  // Enter in the text is a new line of the text.
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('more');
  await page.keyboard.press('Escape');
  const text = (await elements(page)).find((e) => e.id === 'e_text');
  expect(text?.type === 'text' && text.content.paragraphs).toHaveLength(2);

  const table = await addTable(page, {
    texts: [
      ['a', 'b'],
      ['c', 'd'],
    ],
    frame: { x: 160, y: 880, w: 800, h: 160 },
  });
  await select(page, table);
  await stage(page).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => editingId(page)).toBe(table);
  await expect(dataEditor(page)).toBeHidden();
  // The chart was touched by none of it.
  expect((await chart(page)).data.categories).toEqual(['Q1', 'Q2', 'Q3']);
});

test('Enter on a button that has the focus still presses it, also with a chart selected', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  // A click beside the slide closes a popover. (Esc would first close the tooltip that a button
  // shows when the keyboard is on it.)
  const besideTheSlide = async () => {
    const box = (await stage(page).boundingBox())!;
    await page.mouse.click(box.x + 6, box.y + box.height - 6);
  };
  // Without a chart: a button of row A, reached with the keyboard.
  const shape = page.getByTestId('top-tools-a').getByRole('button', { name: 'Shape', exact: true });
  await shape.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('shape-library')).toBeVisible();
  await besideTheSlide();
  await expect(page.getByTestId('shape-library')).toBeHidden();

  // With a chart selected: Enter on the button is the button's, not the chart's.
  await addChart(page);
  await selectChart(page);
  await shape.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('shape-library')).toBeVisible();
  await expect(dataEditor(page)).toBeHidden();
  // The same for a button of row B: Enter opens its popover, not the data of the chart.
  await besideTheSlide();
  await expect(page.getByTestId('shape-library')).toBeHidden();
  await selectChart(page);
  await tool(page, 'Legend').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radiogroup', { name: 'Position' })).toBeVisible();
  await expect(dataEditor(page)).toBeHidden();
});

test('Esc closes the data editor first, and then clears the selection', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page);
  // With the keyboard on the Stage, not in the editor.
  await stage(page).focus();
  await page.keyboard.press('Escape');
  await expect(dataEditor(page)).toBeHidden();
  expect(await selectedIds(page)).toEqual(['e_chart']);
  await page.keyboard.press('Escape');
  expect(await selectedIds(page)).toEqual([]);
});

test('Delete on the Stage still deletes the chart, and its editor goes with it', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await openDataEditor(page);
  await stage(page).focus();
  await page.keyboard.press('Delete');
  expect(await elements(page)).toEqual([]);
  await expect(dataEditor(page)).toBeHidden();
  // Undo brings the chart back, selected or not, with its editor closed.
  await page.keyboard.press('Control+z');
  expect((await elements(page)).map((e) => e.type)).toEqual(['chart']);
  await expect(dataEditor(page)).toBeHidden();
});
