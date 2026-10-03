import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/*
 * Screenshots for the design gate (DSN-09): the shell and the component gallery in both themes,
 * both directions and both target resolutions. They are written to test-results/wg3/ to be
 * looked at; nothing is compared yet (the baselines come with WG13's visual regression).
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/wg3/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

async function prepare(page: Page, theme: 'light' | 'dark', lang: string) {
  await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });
  await page.addInitScript((language) => localStorage.setItem('slidr.language', language), lang);
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`shell ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await prepare(page, theme, lang);
        await page.goto('/');
        await expect(page.getByTestId('stage-frame')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`shell-${name}`) });
      });

      test(`gallery ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await prepare(page, theme, lang);
        await page.goto(`/dev/gallery.html?theme=${theme}&dir=${dir}`);
        await expect(page.getByTestId(`gallery-${theme}-${dir}`)).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`gallery-${name}`), fullPage: true });
      });
    }
  }
}

test('gallery, all four combinations on one page', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/dev/gallery.html');
  await expect(page.getByTestId('gallery-dark-ltr')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('gallery-all'), fullPage: true });
});

test.describe('shell states', () => {
  test('File menu with Open recent, Hebrew light', async ({ page }) => {
    await prepare(page, 'light', 'he');
    await page.goto('/');
    await page.getByRole('button', { name: 'קובץ' }).click();
    await page.getByRole('menuitem', { name: 'מצגת חדשה' }).hover();
    await settle(page);
    await page.screenshot({ path: out('state-file-menu-light-rtl') });
  });

  test('settings and a tooltip, English dark', async ({ page }) => {
    await prepare(page, 'dark', 'en');
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Layers' }).hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out('state-settings-dark-ltr') });
  });

  test('object AI with a selection, collapsed afterwards, Hebrew dark', async ({ page }) => {
    await prepare(page, 'dark', 'he');
    await page.goto('/');
    await page.evaluate(() => {
      const editor = window.slidr;
      if (!editor) throw new Error('window.slidr is missing');
      const slideId = editor.selection.getState().currentSlideId ?? '';
      editor.bus.dispatch({
        type: 'element.add',
        slideId,
        element: {
          id: 'e_hero0001',
          type: 'image',
          name: 'hero-image',
          frame: { x: 0, y: 0, w: 960, h: 1080 },
          rotation: 0,
          opacity: 1,
          fit: 'cover',
        },
      });
      editor.selection.getState().selectElements(['e_hero0001']);
    });
    await page.keyboard.press('Control+3');
    await settle(page);
    await page.screenshot({ path: out('state-object-ai-dark-rtl') });
    await page.getByTestId('panel-collapse').click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: out('state-collapsed-dark-rtl') });
  });

  test('unsaved-changes dialog, English light', async ({ page }) => {
    await prepare(page, 'light', 'en');
    await page.goto('/');
    await page.getByTestId('new-slide').click();
    await page.keyboard.press('Control+n');
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out('state-unsaved-dialog-light-ltr') });
  });
});
