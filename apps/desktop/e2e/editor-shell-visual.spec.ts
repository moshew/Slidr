import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openApp } from './arrange-helpers';

/*
 * Screenshots for the design gate (DSN-09) of the shell's P1 screens: the welcome screen (DOC-05),
 * the shortcut map (UI-06), the speaker notes panel and the split Present button, in both themes,
 * both directions and both target resolutions. Written to test-results/editor/ to be looked at;
 * nothing is compared.
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
  he: { start: 'מאיפה להתחיל', notes: 'לפתוח בשאלה לקהל\nשלוש נקודות, לא יותר\nלסיים במספר' },
  en: {
    start: 'Start from',
    notes: 'Open with a question\nThree points, no more\nEnd on the number',
  },
};

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
}

for (const theme of themes) {
  for (const lang of languages) {
    for (const viewport of viewports) {
      const tag = `${lang}-${theme}-${viewport.width}`;

      test(`the welcome screen: ${tag}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
        await page.addInitScript((l) => localStorage.setItem('slidr.language', l), lang);
        await page.goto('/?welcome');
        await expect(page.getByTestId('welcome')).toBeVisible();
        // The first row of templates; the covers are drawn before the picture is taken.
        await expect(page.locator('[data-welcome-template]')).toHaveCount(4);
        await settle(page);
        await page.screenshot({ path: out(`welcome-${tag}`) });
      });

      test(`the shortcut map, the notes and the Present menu: ${tag}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });

        await page.getByTestId('stage-surface').focus();
        await page.keyboard.press('Control+/');
        await expect(page.getByTestId('shortcut-map')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`shortcuts-${tag}`) });
        await page.keyboard.press('Escape');

        await page.getByTestId('activity-bar').locator('[data-panel="notes"]').click();
        await page.getByTestId('notes-field').fill(text[lang].notes);
        await settle(page);
        await page.screenshot({ path: out(`notes-${tag}`) });

        await page
          .getByTestId('present-button')
          .getByRole('button', { name: text[lang].start })
          .click();
        await expect(page.getByTestId('present-menu')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`present-menu-${tag}`) });
      });
    }
  }
}

/*
 * The welcome screen as it is when it was opened over a document, from the File menu: with the
 * way back to that document at its top. Written to test-results/fix-editing/.
 */
const fixed = (name: string) =>
  fileURLToPath(new URL(`../test-results/fix-editing/${name}.png`, import.meta.url));

for (const theme of themes) {
  for (const lang of languages) {
    test(`the welcome screen over a document, with the way back: ${lang}-${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewports[1]);
      await openApp(page, { lang, theme });
      await page
        .getByTestId('top-tools-a')
        .getByRole('button', { name: lang === 'he' ? 'קובץ' : 'File' })
        .click();
      await page
        .getByRole('menuitem')
        .filter({ hasText: lang === 'he' ? 'מסך הפתיחה' : 'Welcome screen' })
        .click();
      await expect(page.getByTestId('welcome-back')).toBeVisible();
      await settle(page);
      await page.screenshot({ path: fixed(`welcome-back-${lang}-${theme}`) });
    });
  }
}
