import { fileURLToPath } from 'node:url';
import { test, type Page } from '@playwright/test';
import { chooseFile, openForImport, turnsDone } from './import-helpers';

/*
 * Screenshots of the HTML import in the AI chat for the design gate (PLAN 1.2): both themes,
 * both directions and both target resolutions. They are written to test-results/import/ to be
 * looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/import/${name}.png`, import.meta.url));

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
  await page.waitForTimeout(250);
}

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`the plan, waiting for approval ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openForImport(page, { lang, theme });
        await chooseFile(page);
        await turnsDone(page, 1);
        await settle(page);
        await page.screenshot({ path: out(`plan-${name}`) });
      });

      test(`imported, chat and report ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openForImport(page, { lang, theme });
        await chooseFile(page);
        await turnsDone(page, 1);
        await page.getByTestId('import-approve').getByRole('button').click();
        await turnsDone(page, 2);
        await settle(page);
        await page.screenshot({ path: out(`imported-${name}`) });
        await page.getByTestId('import-report-toggle').click();
        await page.getByTestId('import-source').scrollIntoViewIfNeeded();
        await settle(page);
        await page.screenshot({ path: out(`report-${name}`) });
      });
    }
  }
}

test('the slides coming in, at the pace of a real session', async ({ page }) => {
  await openForImport(page, { speed: 1 });
  await chooseFile(page);
  await turnsDone(page, 1);
  await page.getByTestId('import-approve').getByRole('button').click();
  await page.getByTestId('chat-working').waitFor();
  await settle(page);
  await page.screenshot({ path: out('state-working-light-rtl') });
  await turnsDone(page, 2);
});
