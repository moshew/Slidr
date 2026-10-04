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

const PNG_LOGO = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAABCAYAAAD5PA/NAAAAEElEQVR42mNk+M9QzwAEAAmGAYCF+yOnAAAAAElFTkSuQmCC',
  'base64',
);

const states = [
  { lang: 'he', theme: 'light', viewport: viewports[0], name: 'light-rtl-1920' },
  { lang: 'en', theme: 'dark', viewport: viewports[1], name: 'dark-ltr-1366' },
] as const;

for (const { lang, theme, viewport, name } of states) {
  test(`the layouts of "New slide" ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openTemplates(page, { lang, theme, defaultTemplate: 'zerem' });
    await page.getByTestId('new-slide').click();
    await expect(page.getByTestId('layout-choices')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out(`layouts-${name}`) });
  });

  test(`the colour picker of the theme ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openTemplates(page, { lang, theme, defaultTemplate: 'zerem' });
    await panel(page).locator('[data-theme-color="primary"]').click();
    await settle(page);
    await page.screenshot({ path: out(`color-${name}`) });
  });

  test(`a personal template with a logo, and deleting it ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openTemplates(page, { lang, theme, defaultTemplate: 'zerem' });
    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('logo-choose').click();
    await (await chooser).setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG_LOGO });
    await expect(page.getByTestId('logo-preview').locator('img')).toHaveCount(1);
    await panel(page)
      .getByRole('textbox')
      .last()
      .fill(lang === 'he' ? 'התבנית של החברה' : 'Company template');
    await panel(page).getByRole('button').last().click();
    await expect(panel(page).locator('[data-template^="personal_"]')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out(`saved-${name}`) });
    await panel(page).locator('[data-template^="personal_"]').scrollIntoViewIfNeeded();
    await settle(page);
    await page.screenshot({ path: out(`personal-${name}`) });
    await panel(page)
      .locator('[data-template^="personal_"]')
      .getByRole('button', { name: lang === 'he' ? 'מחיקת התבנית' : 'Delete the template' })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out(`delete-${name}`) });
  });
}
