import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { card, openTemplates, panel, settle } from './templates-helpers';

/*
 * Screenshots of the Templates panel and of what it does to a deck, for the design gate
 * (PLAN 1.2): both themes, both directions and both target resolutions. They are written to
 * test-results/templates/ to be looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/templates/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`the panel over a deck on a template ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openTemplates(page, { lang, theme, defaultTemplate: 'zerem' });
        await expect(card(page, 'zerem')).toHaveAttribute('data-current', 'true');
        await settle(page);
        await page.screenshot({ path: out(`panel-${name}`) });
        // The lower half: fonts, text styles, logo, saving.
        await panel(page)
          .getByRole('button', { name: /לוגו|logo/i })
          .first()
          .scrollIntoViewIfNeeded();
        await settle(page);
        await page.screenshot({ path: out(`panel-lower-${name}`) });
      });
    }
  }
}
