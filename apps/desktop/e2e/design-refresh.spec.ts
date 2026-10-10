import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { expectNoFaults } from './a11y-helpers';
import { elements, openApp, select } from './arrange-helpers';
import { loadDeck } from './runtime-app-helpers';
import { addText, para } from './text-helpers';

const OUT = fileURLToPath(new URL('../test-results/design-refresh/', import.meta.url));
const header = (page: Page) => page.getByTestId('title-bar');
const context = (page: Page) => page.getByTestId('top-tools-b');
const creation = context;
const stage = (page: Page) => page.getByTestId('stage-surface');

// Each layout also audits the header, toolbar and Activity Bar and captures a screenshot.
test.setTimeout(60_000);

for (const lang of ['he', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of [
      { width: 1920, height: 1032 },
      { width: 1366, height: 768 },
    ]) {
      test(`workspace layout and accessible tools: ${lang}-${theme}-${viewport.width}`, async ({
        page,
      }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });
        await loadDeck(page, 'reference');
        const names =
          lang === 'he'
            ? { file: 'קובץ', text: 'תיבת טקסט', shape: 'צורה' }
            : { file: 'File', text: 'Text box', shape: 'Shape' };
        await expect(
          header(page).getByRole('button', { name: names.file, exact: true }),
        ).toBeVisible();
        await expect(header(page).getByTestId('present-button')).toBeInViewport({ ratio: 1 });
        await expect(page.getByTestId('top-tools-a')).toHaveCount(0);
        await expect(page.getByTestId('editor').getByRole('toolbar')).toHaveCount(1);
        await expect(creation(page).locator('[data-tool]')).toHaveCount(7);
        await expect(
          creation(page).getByRole('button', { name: names.text, exact: true }),
        ).toHaveText('');
        expect(
          await creation(page)
            .locator('[data-tool] svg')
            .evaluateAll((nodes) =>
              nodes.every((node) => node.getBoundingClientRect().width === 18),
            ),
        ).toBe(true);
        expect(
          await context(page).evaluate((node) => Boolean(node.closest('[data-testid="stage"]'))),
        ).toBe(true);
        const bar = (await context(page).boundingBox())!;
        expect(bar.height).toBe(44);
        const frame = (await page.getByTestId('stage-frame').boundingBox())!;
        expect(frame.y).toBeGreaterThanOrEqual(bar.y + bar.height);
        expect(await context(page).evaluate((node) => getComputedStyle(node).borderRadius)).toBe(
          '18px',
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
          viewport.width,
        );
        for (const within of [
          '[data-testid="title-bar"]',
          '[data-testid="top-tools-b"]',
          '[data-testid="activity-bar"]',
        ]) {
          await expectNoFaults(page, { within });
        }
        await header(page).getByTestId('present-button').locator('button').first().hover();
        await expectNoFaults(page, { within: '[data-testid="title-bar"]' });
        await page.mouse.move(0, 0);
        mkdirSync(OUT, { recursive: true });
        await page.screenshot({ path: `${OUT}${lang}-${theme}-${viewport.width}.png` });

        // The largest panel still leaves the last creation and text tools reachable.
        await page.getByTestId('panel-splitter').focus();
        await page.keyboard.press('End');
        await creation(page).locator('[data-tool="insert.media"]').focus();
        await expect(creation(page).locator('[data-tool="insert.media"]')).toBeInViewport({
          ratio: 1,
        });
        await addText(page, 'e_refresh', [para('Refresh')], {
          frame: { x: 100, y: 600, w: 700, h: 150 },
        });
        await select(page, ['e_refresh']);
        await expect(context(page)).toHaveAttribute('data-selection', 'text');
        await expect(context(page).locator('[data-tool]')).toHaveCount(0);
        await page.getByTestId('arrange-menu').focus();
        await expect(page.getByTestId('arrange-menu')).toBeInViewport({ ratio: 1 });
        const wideBar = (await context(page).boundingBox())!;
        expect(wideBar.height).toBe(44);
        const wideFrame = (await page.getByTestId('stage-frame').boundingBox())!;
        expect(wideFrame.y).toBeGreaterThanOrEqual(wideBar.y + wideBar.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
          viewport.width,
        );
        await select(page, []);
        await expect(context(page)).toHaveAttribute('data-selection', 'none');
        await expect(context(page).locator('[data-tool]')).toHaveCount(7);
      });
    }
  }

  test(`creation, undo, menus, zoom and presentation still work: ${lang}`, async ({ page }) => {
    await openApp(page, { lang });
    const names =
      lang === 'he'
        ? {
            text: 'תיבת טקסט',
            undo: 'ביטול פעולה',
            shape: 'צורה',
            zoom: 'זום',
            from: 'מאיפה להתחיל',
            current: 'הצגה מהשקף הנוכחי',
            export: 'ייצוא HTML…',
          }
        : {
            text: 'Text box',
            undo: 'Undo',
            shape: 'Shape',
            zoom: 'Zoom',
            from: 'Start from',
            current: 'Present from the current slide',
            export: 'Export HTML…',
          };
    const before = (await elements(page)).length;
    await creation(page).getByRole('button', { name: names.text, exact: true }).click();
    await expect.poll(async () => (await elements(page)).length).toBe(before + 1);
    await header(page).getByRole('button', { name: names.undo, exact: true }).click();
    await expect.poll(async () => (await elements(page)).length).toBe(before);
    await expect(stage(page)).toBeFocused();

    const shape = creation(page).getByRole('button', { name: names.shape, exact: true });
    await page.keyboard.press('F6');
    await shape.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(shape).toBeFocused();

    await page.getByTestId('file-menu-trigger').click();
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(stage(page)).toBeFocused();
    await page.getByTestId('status-bar').getByRole('button', { name: names.zoom }).click();
    await page.getByRole('menuitemradio', { name: '100%', exact: true }).click();
    await expect(page.getByTestId('status-zoom')).toHaveText('100%');
    await expect(stage(page)).toBeFocused();

    await header(page).getByRole('button', { name: names.from, exact: true }).click();
    await page.getByRole('menuitem', { name: names.current }).click();
    await expect(page.getByTestId('present')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('present')).toHaveCount(0);
    await page.getByTestId('file-menu-trigger').click();
    await page.getByRole('menuitem', { name: names.export, exact: true }).click();
    await expect(page.getByTestId('export-dialog')).toBeVisible();
  });
}

test('document actions respect startup, welcome, drag regions and F6', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  expect(
    await page
      .getByTestId('file-menu-trigger')
      .evaluate((node) => Boolean(node.closest('[data-tauri-drag-region]'))),
  ).toBe(false);
  const setStarting = (starting: boolean) =>
    page.evaluate((value) => {
      window.slidr!.file.setState({ starting: value });
    }, starting);
  await setStarting(true);
  expect(
    await page
      .getByTestId('file-menu-trigger')
      .evaluate((node) => Boolean(node.closest('[inert]'))),
  ).toBe(true);
  expect(
    await page.getByTestId('window-controls').evaluate((node) => Boolean(node.closest('[inert]'))),
  ).toBe(false);
  await setStarting(false);
  await page.getByTestId('status-bar').getByRole('button', { name: 'Zoom' }).focus();
  await page.keyboard.press('F6');
  await expect(page.getByTestId('file-menu-trigger')).toBeFocused();
  await page.getByTestId('file-menu-trigger').click();
  await page.getByRole('menuitem', { name: 'Welcome screen' }).click();
  await expect(page.getByTestId('welcome')).toBeVisible();
  await expect(page.getByTestId('file-menu-trigger')).toHaveCount(0);
  await expect(header(page).getByTestId('present-button')).toHaveCount(0);
});

test('the creation tools are as strong as the slide tools beside them', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const color = (name: string) =>
    context(page)
      .getByRole('button', { name, exact: true })
      .evaluate((node) => getComputedStyle(node).color);
  expect(await color('Text box')).toBe(await color('Background'));
  expect(await color('Chart')).toBe(await color('Background'));
});
