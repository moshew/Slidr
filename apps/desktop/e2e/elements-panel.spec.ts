import { expect, test } from '@playwright/test';
import {
  currentSlide,
  onStage,
  openApp,
  pageProblems,
  selected,
  undoDepth,
} from './objects-helpers';
import type { ChartElement, ShapeElement, SvgElement, TableElement } from '@slidr/model';

/*
 * Elements: the collections of everything that goes on a slide. The first screen offers them by
 * kind; a collection opens in its place, and what it holds lands in the middle of the slide,
 * selected, as one undo step.
 */

const COLLECTIONS = ['shapes', 'graphics', 'emoji', 'icons', 'photos', 'clips', 'tables', 'charts'];

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

async function openElements(page: Parameters<typeof openApp>[0], lang: 'he' | 'en' = 'en') {
  await openApp(page, { lang });
  await page.getByTestId('top-tools-a').locator('[data-tool="insert.elements"]').click();
  const panel = page.getByTestId('elements-panel');
  await expect(panel).toBeVisible();
  return panel;
}

test('the first screen offers the collections by kind, each with a name', async ({ page }) => {
  const panel = await openElements(page);
  const tiles = panel.locator('[data-collection]');
  await expect(tiles).toHaveCount(COLLECTIONS.length);
  expect(
    await tiles.evaluateAll((all) => all.map((tile) => tile.getAttribute('data-collection'))),
  ).toEqual(COLLECTIONS);
  for (const name of ['Shapes', 'Graphics', 'Emoji', 'Icons', 'Photos', 'Tables', 'Charts']) {
    await expect(panel.getByRole('button', { name, exact: true })).toBeVisible();
  }
  // Nothing was used yet, so nothing is offered again.
  await expect(panel.getByTestId('elements-recent')).toHaveCount(0);
});

test('graphics are one collection, in three styles, and a click adds one', async ({ page }) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="graphics"]').click();
  for (const style of ['glossy', 'illustrated', 'outlined']) {
    await expect(panel.locator(`[data-group="${style}"] [data-sticker]`).first()).toBeVisible();
  }

  const before = await undoDepth(page);
  await panel.locator('[data-sticker="graphic:glossy:trophy-48"]').click();
  const graphic = await selected<SvgElement>(page);
  expect(graphic.type).toBe('svg');
  expect(graphic.name).toBe('graphic:glossy:trophy-48');
  expect(graphic.markup).toMatch(
    /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 48 48">/,
  );
  await expect(onStage(page, graphic.id)).toBeVisible();
  expect(await undoDepth(page)).toBe(before + 1);

  // One style in full: more of it comes as the list is scrolled.
  await panel.getByRole('radio', { name: 'Outlined' }).click();
  const results = panel.getByTestId('graphic-results').locator('[data-sticker]');
  await expect(results.first()).toBeVisible();
  const shown = await results.count();
  expect(shown).toBeLessThan(400);
  await results.last().scrollIntoViewIfNeeded();
  await expect.poll(() => results.count()).toBeGreaterThan(shown);

  // The search looks in the style that is shown.
  await panel.getByTestId('graphics-query').fill('trophy');
  await expect(panel.locator('[data-sticker="graphic:outlined:award-trophy-1"]')).toBeVisible();
  await expect(panel.locator('[data-sticker^="graphic:glossy:"]')).toHaveCount(0);
  await panel.getByTestId('graphics-query').fill('qqqzzz');
  await expect(panel.getByText('Nothing found')).toBeVisible();
});

test('every emoji is in one list by group, found in Hebrew, and added with a click', async ({
  page,
}) => {
  const panel = await openElements(page, 'he');
  await panel.locator('[data-collection="emoji"]').click();
  await expect(panel.locator('[data-group]')).toHaveCount(9);
  await expect(panel.locator('[data-sticker="emoji:grinning-face"]')).toBeVisible();

  // A group far down the list is drawn once it is reached.
  await expect(panel.locator('[data-sticker="emoji:flag-israel"]')).toHaveCount(0);
  await panel.getByRole('button', { name: 'דגלים' }).click();
  await expect(panel.locator('[data-sticker="emoji:flag-israel"]')).toBeVisible();

  await panel.getByTestId('emoji-query').fill('טיל');
  const rocket = panel.locator('[data-sticker="emoji:rocket"]');
  await expect(rocket).toHaveAccessibleName('הוספת טיל לשקף');
  await rocket.click();
  const emoji = await selected<SvgElement>(page);
  expect(emoji.name).toBe('emoji:rocket');
  expect(emoji.markup).toContain('viewBox="0 0 36 36"');
  await expect(onStage(page, emoji.id)).toBeVisible();
});

test('what was used is offered again on the first screen', async ({ page }) => {
  const panel = await openElements(page);
  await panel.locator('[data-collection="emoji"]').click();
  await panel.locator('[data-sticker="emoji:grinning-face"]').click();
  await panel.getByRole('button', { name: 'Back to collections' }).click();
  await panel.locator('[data-collection="graphics"]').click();
  await panel.locator('[data-sticker="graphic:glossy:trophy-48"]').click();
  await panel.getByRole('button', { name: 'Back to collections' }).click();

  const recent = panel.getByTestId('elements-recent').locator('[data-sticker]');
  expect(
    await recent.evaluateAll((all) => all.map((one) => one.getAttribute('data-sticker'))),
  ).toEqual(['graphic:glossy:trophy-48', 'emoji:grinning-face']);
  await recent.last().click();
  expect((await selected<SvgElement>(page)).name).toBe('emoji:grinning-face');
  expect((await currentSlide(page)).elements).toHaveLength(3);
});

test('one search on the first screen finds graphics, emoji and icons', async ({ page }) => {
  const panel = await openElements(page, 'he');
  await panel.getByTestId('elements-query').fill('לב');
  const found = panel.getByTestId('elements-found');
  await expect(found.locator('[data-group="graphics"] [data-sticker]').first()).toBeVisible();
  await expect(
    found.locator('[data-group="emoji"] [data-sticker="emoji:red-heart"]'),
  ).toBeVisible();
  await expect(found.locator('[data-group="icons"] [data-icon="lucide:heart"]')).toBeVisible();

  await found.locator('[data-icon="lucide:heart"]').click();
  expect((await selected<SvgElement>(page)).name).toBe('lucide:heart');

  await panel.getByTestId('elements-query').fill('');
  await expect(panel.locator('[data-collection]')).toHaveCount(COLLECTIONS.length);
});

test('shapes, icons, tables and charts are added from their collections', async ({ page }) => {
  const panel = await openElements(page);
  const back = () => panel.getByRole('button', { name: 'Back to collections' }).click();

  await panel.locator('[data-collection="shapes"]').click();
  await panel.locator('[data-preset="ellipse"]').click();
  expect((await selected<ShapeElement>(page)).geometry).toEqual({
    kind: 'preset',
    preset: 'ellipse',
  });
  await expect(panel.getByRole('group', { name: 'Lines' }).locator('[data-line]')).toHaveCount(5);

  await back();
  await panel.locator('[data-collection="icons"]').click();
  await expect(panel.getByTestId('elements-icons')).toBeVisible();
  await panel.getByTestId('icon-query').fill('rocket');
  await panel.locator('[data-icon="lucide:rocket"]').click();
  expect((await selected<SvgElement>(page)).name).toBe('lucide:rocket');

  await back();
  await panel.locator('[data-collection="charts"]').click();
  await expect(panel.locator('[data-chart-type]')).toHaveCount(8);
  await panel.locator('[data-chart-type="pie"]').click();
  expect((await selected<ChartElement>(page)).chartType).toBe('pie');

  await back();
  await panel.locator('[data-collection="tables"]').click();
  await panel.getByRole('button', { name: '3 rows by 4 columns' }).click();
  const table = (await currentSlide(page)).elements.find(
    (element): element is TableElement => element.type === 'table',
  );
  expect(table?.rows).toHaveLength(3);
  expect(table?.cols).toHaveLength(4);

  await back();
  await panel.locator('[data-collection="photos"]').click();
  await expect(page.getByTestId('media-stock')).toBeVisible();
  await back();
  await panel.locator('[data-collection="clips"]').click();
  await expect(panel.getByTestId('elements-clips')).toBeVisible();
});
