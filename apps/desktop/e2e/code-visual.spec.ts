import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { card, codePanel, dialog, openCode, openDecompose } from './code-helpers';
import { addElement, openApp } from './objects-helpers';

/*
 * Screenshots of the code panel and of the decompose dialog for the design gate (PLAN 1.2): both
 * themes, both directions and both target resolutions. They are written to test-results/objects/
 * to be looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/objects/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

/** A card whose second line is text the model lays out differently: there is a difference to show. */
const differing = () =>
  card({
    markup: [
      '<div class="card">',
      '<h2>Quarterly results</h2>',
      '<pre>Q1\t12%\nQ2\t17%</pre>',
      '</div>',
    ].join(''),
    styles: [
      '.card { box-sizing: border-box; width: 900px; height: 420px; padding: 40px; background: #1e3a8a;',
      '  border-radius: 24px; font: 30px/1.4 Arial, sans-serif; color: #ffffff; }',
      'h2 { margin: 0 0 16px; font-size: 56px; line-height: 1.2; }',
      'pre { margin: 0; font: 40px/1.3 Consolas, monospace; color: #fbbf24; }',
    ].join('\n'),
  });

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`the code panel ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });
        await addElement(page, card());
        await openCode(page);
        await expect(codePanel(page).getByTestId('code-html')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`code-panel-${name}`) });
      });

      test(`the decompose dialog ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });
        await addElement(page, differing());
        await openDecompose(page);
        await expect(dialog(page).getByTestId('decompose-differences')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`decompose-${name}`) });
        if (viewport.width === 1920 && lang === 'he') {
          await dialog(page).getByRole('radio').nth(2).click();
          await settle(page);
          await page.screenshot({ path: out(`decompose-state-diff-${theme}`) });
        }
      });
    }
  }
}

test('the decompose dialog: after, and a result that looks the same', async ({ page }) => {
  await openApp(page, { lang: 'he', theme: 'light' });
  await addElement(page, card());
  await openDecompose(page);
  await settle(page);
  await page.screenshot({ path: out('decompose-state-same') });
});

test('the code panel: the CSS tab, and an element with scripts', async ({ page }) => {
  await openApp(page, { lang: 'he', theme: 'light' });
  await addElement(page, card());
  await openCode(page);
  await codePanel(page).getByRole('radio', { name: 'CSS' }).click();
  await expect(codePanel(page).getByTestId('code-css')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('code-panel-state-css') });

  await addElement(
    page,
    card({
      id: 'e_scripted',
      markup: '<canvas id="c"></canvas><script>document.title = "x"</script>',
      hasScripts: true,
    }),
  );
  await expect(codePanel(page).getByTestId('code-scripts')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('code-panel-state-scripts') });
});
