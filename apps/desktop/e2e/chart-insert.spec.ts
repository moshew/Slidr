import { expect, test, type Page } from '@playwright/test';
import type { ChartElement } from '@slidr/model';
import {
  chartSvg,
  chartText,
  dataEditor,
  elements,
  lastLabel,
  redo,
  selectedIds,
  stage,
  steps,
  undo,
} from './chart-helpers';
import { openApp, pageProblems, row } from './objects-helpers';

/*
 * The "Chart" button of row A (WG6-T06, CHT-01): a gallery of the eight chart types; a click
 * inserts a chart of that type in the middle of the slide, with sample data, and selects it.
 */

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

const TYPES = ['column', 'bar', 'line', 'area', 'pie', 'donut', 'scatter', 'radar'] as const;

const insertButton = (page: Page, name: string) =>
  page.getByTestId('top-tools-a').getByRole('button', { name, exact: true });

test('the Chart button opens a gallery of the eight types, named in Hebrew', async ({ page }) => {
  await openApp(page);
  await insertButton(page, 'גרף').click();
  const gallery = page.getByRole('group', { name: 'סוגי גרפים' });
  await expect(gallery).toBeVisible();
  await expect(gallery.getByRole('button')).toHaveText([
    'עמודות',
    'עמודות אופקיות',
    'קו',
    'שטח',
    'עוגה',
    'דונאט',
    'פיזור',
    'רדאר',
  ]);
  // Each has its icon.
  await expect(gallery.locator('button svg')).toHaveCount(8);
  await page.keyboard.press('Escape');
  await expect(gallery).toBeHidden();
  expect(await elements(page)).toEqual([]);
});

test('the gallery is named in English in the English UI', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await insertButton(page, 'Chart').click();
  await expect(page.getByRole('group', { name: 'Chart types' }).getByRole('button')).toHaveText([
    'Column',
    'Bar',
    'Line',
    'Area',
    'Pie',
    'Donut',
    'Scatter',
    'Radar',
  ]);
});

test('a click inserts a chart in the middle of the slide, selected, as one undo step', async ({
  page,
}) => {
  await openApp(page);
  const before = await steps(page);
  await insertButton(page, 'גרף').click();
  await page.locator('[data-chart-type="column"]').click();

  // The gallery closed, and the chart is on the slide, drawn.
  await expect(page.getByRole('group', { name: 'סוגי גרפים' })).toBeHidden();
  const all = await elements(page);
  expect(all.map((e) => e.type)).toEqual(['chart']);
  const chart = all[0] as ChartElement;
  await expect(chartSvg(page, chart.id)).toBeVisible();
  expect(chart.chartType).toBe('column');
  expect(chart.frame).toEqual({ x: 410, y: 230, w: 1100, h: 620 });
  expect(await selectedIds(page)).toEqual([chart.id]);
  await expect(row(page)).toHaveAttribute('data-selection', 'chart');
  await expect(stage(page).locator('[data-handle="se"]')).toBeVisible();

  // A Hebrew deck: the sample data is labelled in Hebrew, and the chart shows it.
  expect(chart.data.categories).toEqual(['קטגוריה 1', 'קטגוריה 2', 'קטגוריה 3', 'קטגוריה 4']);
  expect(chart.data.series.map((s) => s.name)).toEqual(['סדרה 1', 'סדרה 2']);
  await expect.poll(() => chartText(page, chart.id)).toContain('סדרה 1');
  expect(await chartText(page, chart.id)).toContain('קטגוריה 4');

  // One undo step, with a name in the history.
  expect(await steps(page)).toBe(before + 1);
  expect(await lastLabel(page)).toBe('הוספת גרף');
  await undo(page);
  expect(await elements(page)).toEqual([]);
  expect(await steps(page)).toBe(before);
  await redo(page);
  expect(await elements(page)).toEqual([chart]);
});

test('Ctrl+Z after inserting takes the chart away, and Ctrl+Y brings it back', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await insertButton(page, 'Chart').click();
  await page.locator('[data-chart-type="line"]').click();
  await expect.poll(async () => (await elements(page)).length).toBe(1);
  const [chart] = await elements(page);
  // The keyboard is on the Stage, not on the button of row A.
  await expect(stage(page)).toBeFocused();
  await page.keyboard.press('Control+z');
  expect(await elements(page)).toEqual([]);
  await page.keyboard.press('Control+y');
  expect(await elements(page)).toEqual([chart]);
});

test('in an English deck the sample data is labelled in English', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await insertButton(page, 'Chart').click();
  await page.locator('[data-chart-type="bar"]').click();
  await expect.poll(async () => (await elements(page)).length).toBe(1);
  const chart = (await elements(page))[0] as ChartElement;
  expect(chart.data.categories).toEqual(['Category 1', 'Category 2', 'Category 3', 'Category 4']);
  expect(chart.data.series.map((s) => s.name)).toEqual(['Series 1', 'Series 2']);
  await expect.poll(() => chartText(page, chart.id)).toContain('Series 2');
});

test('every type of the gallery inserts a chart of that type, and it is drawn', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  for (const type of TYPES) {
    await insertButton(page, 'Chart').click();
    await page.locator(`[data-chart-type="${type}"]`).click();
    await expect.poll(async () => (await elements(page)).length).toBe(1);
    const chart = (await elements(page))[0] as ChartElement;
    expect(chart.chartType).toBe(type);
    await expect(chartSvg(page, chart.id)).toBeVisible();
    // The chart has marks, not only a frame: the library drew paths for the data.
    await expect.poll(() => chartSvg(page, chart.id).locator('path').count()).toBeGreaterThan(3);
    await undo(page);
    expect(await elements(page)).toEqual([]);
  }
});

test('a second chart does not hide the first', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  for (const type of ['column', 'pie']) {
    await insertButton(page, 'Chart').click();
    await page.locator(`[data-chart-type="${type}"]`).click();
  }
  await expect.poll(async () => (await elements(page)).length).toBe(2);
  const [first, second] = await elements(page);
  expect(second!.frame).toMatchObject({ x: first!.frame.x + 32, y: first!.frame.y + 32 });
  // The new one is the selected one.
  expect(await selectedIds(page)).toEqual([second!.id]);
});

test('Enter right after inserting opens the data of the new chart', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await insertButton(page, 'Chart').click();
  await page.locator('[data-chart-type="column"]').click();
  await expect(stage(page)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dataEditor(page)).toBeVisible();
  // The gallery did not open again.
  await expect(page.getByRole('group', { name: 'Chart types' })).toBeHidden();
});
