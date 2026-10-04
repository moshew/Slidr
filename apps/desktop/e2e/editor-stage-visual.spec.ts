import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { addBoxes, openApp, select } from './arrange-helpers';
import { addTable, cellTarget } from './table-helpers';
import { addText, para } from './text-helpers';

/*
 * Screenshots for the design gate (DSN-09) of the Stage's right-click menu (STG-06) and of the
 * toolbar beside the selection (STG-05), in both themes, both directions and both target
 * resolutions. Written to test-results/editor/ to be looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/editor/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = ['he', 'en'] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

const text = {
  he: { title: 'תוכנית הרבעון', card: 'יעדים', order: 'סדר שכבות', cells: 'עריכת התאים' },
  en: { title: 'Quarterly plan', card: 'Goals', order: 'Layer order', cells: 'Edit cells' },
};

async function populate(page: Page, lang: 'he' | 'en') {
  await addText(page, 'e_title', [para(text[lang].title, { styleRef: 'title' })], {
    frame: { x: 160, y: 120, w: 1200, h: 140 },
  });
  await addBoxes(page, [
    { id: 'e_a', x: 200, y: 380, w: 420, h: 260, token: 'primary', text: text[lang].card },
    { id: 'e_b', x: 760, y: 420, w: 360, h: 200, token: 'secondary' },
    { id: 'e_c', x: 1320, y: 340, w: 360, h: 320, token: 'accent' },
  ]);
}

const menu = (page: Page) => page.getByTestId('stage-menu');
const onStage = (page: Page, id: string) =>
  page.getByTestId('stage-frame').locator(`[data-element-id="${id}"]`);

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

for (const theme of themes) {
  for (const lang of languages) {
    for (const viewport of viewports) {
      const tag = `${lang}-${theme}-${viewport.width}`;

      test(`the Stage menu and the selection toolbar: ${tag}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });
        await populate(page, lang);

        // The toolbar beside one element.
        await select(page, ['e_a']);
        await expect(page.getByTestId('selection-toolbar')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`stage-toolbar-${tag}`) });

        // The menu of a shape, with the layer order open.
        await onStage(page, 'e_b').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
        await menu(page).getByRole('menuitem').filter({ hasText: text[lang].order }).hover();
        await expect(page.getByTestId('stage-menu-order')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`stage-menu-shape-${tag}`) });
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');

        // The menu of several elements.
        await select(page, ['e_a', 'e_b', 'e_c']);
        await onStage(page, 'e_c').click({ button: 'right' });
        await expect(menu(page)).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`stage-menu-multiple-${tag}`) });
        await page.keyboard.press('Escape');

        // The menu of the slide itself.
        const frame = (await page.getByTestId('stage-frame').boundingBox())!;
        await page.mouse.click(frame.x + frame.width / 2, frame.y + frame.height - 30, {
          button: 'right',
        });
        await expect(menu(page)).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`stage-menu-slide-${tag}`) });
        await page.keyboard.press('Escape');
      });
    }
  }
}

test('the menu of the cells of a table', async ({ page }) => {
  for (const lang of languages) {
    await openApp(page, { lang, theme: 'light' });
    await addTable(page, {
      dir: lang === 'he' ? 'rtl' : 'ltr',
      frame: { x: 360, y: 300, w: 1200, h: 320 },
      texts:
        lang === 'he'
          ? [
              ['רבעון', 'הכנסות', 'צמיחה'],
              ['Q1', '120', '+4%'],
              ['Q2', '138', '+15%'],
            ]
          : [
              ['Quarter', 'Revenue', 'Growth'],
              ['Q1', '120', '+4%'],
              ['Q2', '138', '+15%'],
            ],
    });
    await page.getByTestId('stage-frame').locator('[data-element-id="e_table"]').dblclick();
    await page.keyboard.press('Escape');
    await cellTarget(page, 1, 1).click({ button: 'right' });
    await expect(menu(page)).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out(`stage-menu-cells-${lang}`) });
    await page.keyboard.press('Escape');
  }
});
