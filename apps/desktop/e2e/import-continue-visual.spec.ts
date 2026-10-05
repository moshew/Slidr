import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { importUntilCut, openImportPanel, reopenDeck } from './import-helpers';

/*
 * Screenshots for the design gate (PLAN 1.2) of what the import panel shows since an import is
 * kept with its deck and continued (IMP-07, IMP-09, IMP-11): the size of the plan while slides
 * come in, the import that was cut with the way on, and the report of a deck that was opened
 * again, with its source file. Both themes and both directions, at the editor's size, and the
 * narrowest window once. Written to test-results/import/ to be looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/import/continue-${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    const name = `${theme}-${dir}`;

    test(`an import that was cut, and its report after the deck is opened again ${name}`, async ({
      page,
    }) => {
      await openImportPanel(page, { script: 'import-cut', speed: 1, lang, theme });
      await importUntilCut(page, { stop: true });
      await settle(page);
      await page.screenshot({ path: out(`cut-${name}`) });

      await reopenDeck(page);
      await expect(page.getByTestId('import-cut')).toBeVisible();
      await page.getByTestId('import-report-tab').click();
      await expect(page.getByTestId('import-source')).toBeVisible();
      await settle(page);
      await page.screenshot({ path: out(`report-${name}`) });
    });
  }
}

test('the size of the plan while the slides come in', async ({ page }) => {
  await openImportPanel(page, { script: 'import-cut', speed: 1 });
  await page
    .getByTestId('import-file')
    .setInputFiles(fileURLToPath(new URL('./import-set/handwritten.html', import.meta.url)));
  await page.getByTestId('import-approve').getByRole('button').click();
  await expect(page.getByTestId('import-count')).toContainText('3');
  await expect(page.getByTestId('chat-working')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('progress-light-rtl') });
  await page.getByTestId('chat-stop').click();
  await expect(page.getByTestId('import-cut')).toBeVisible();
});

test('an import that was cut, in the narrowest window', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openImportPanel(page, { script: 'import-cut', speed: 1, theme: 'dark' });
  await importUntilCut(page, { stop: true });
  await settle(page);
  await page.screenshot({ path: out('cut-dark-rtl-1366') });
});
