import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { collectErrors, openApp, openPanel } from './media-helpers';

/*
 * "About and diagnostics" in the settings screen (WG13-T05, AGT-08): the version, the licences
 * the build carries, and the agent's diagnostics log. In a plain browser the log is a stand-in
 * of a few entries and the licences are the dev server's note; the real ones are checked in the
 * packaged app (packaged/build.spec.ts, packaged/recovery.spec.ts).
 *
 * The second half is the design gate (PLAN 1.2): the section and its two dialogs in both
 * themes, both directions and both target resolutions, written to test-results/hardening/ to
 * be looked at. Nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/hardening/${name}.png`, import.meta.url));

async function openAbout(page: Page) {
  const settings = await openPanel(page, 'settings');
  const about = settings.locator('[data-settings-section="about"]');
  await about.scrollIntoViewIfNeeded();
  await expect(about.getByTestId('about')).toBeVisible();
  return about;
}

test('the section says which version this is', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page);
  const about = await openAbout(page);
  await expect(about.getByRole('heading')).toHaveText('אודות ואבחון');
  await expect(about.getByTestId('about-version')).toHaveText(/^Slidr · גרסה .?\d+\.\d+\.\d+.?$/);
  expect(errors).toEqual([]);
});

test('the diagnostics log opens from its end, an entry opens in full, and the log is cleared', async ({
  page,
  context,
}) => {
  const errors = collectErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page);
  const about = await openAbout(page);
  await expect(about.getByTestId('about-log-size')).toHaveText(/^גודל היומן: .*\d+ (B|kB).*$/);

  await about.getByTestId('about-log').click();
  const dialog = page.getByTestId('log-dialog');
  await expect(dialog).toBeVisible();
  const entries = dialog.getByTestId('log-entry');
  await expect(entries).toHaveCount(6);
  await expect(dialog.getByTestId('log-count')).toHaveText('רשומות: 6');
  // The log is the harness's own words, left to right whatever the interface is.
  await expect(dialog.getByTestId('log-entries')).toHaveAttribute('dir', 'ltr');
  await expect(entries.nth(0)).toContainText('claude-code · d_k3x9/deck · sonnet');
  await expect(entries.nth(2)).toContainText('system · api_retry');
  await expect(entries.nth(3)).toContainText('tool_call_started · slide_create_from_html');
  await expect(entries.last()).toContainText('idle');
  await expect(entries.last()).toBeInViewport();

  // An entry in full: the data as it was logged, Hebrew and all.
  await entries.nth(3).getByRole('button').click();
  await expect(entries.nth(3).locator('pre')).toContainText('"name": "פתיחה"');
  await entries.nth(3).getByRole('button').click();
  await expect(entries.nth(3).locator('pre')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'העתקת היומן' }).click();
  await expect(dialog.getByRole('button', { name: 'הועתק' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split('\n')).toHaveLength(6);
  expect(JSON.parse(copied.split('\n')[0]!)).toMatchObject({ kind: 'start' });

  await dialog.getByRole('button', { name: 'סגירה' }).last().click();
  await expect(dialog).toHaveCount(0);

  await about.getByTestId('about-log-clear').click();
  await expect(about.getByTestId('about-log-size')).toHaveText('היומן ריק.');
  await expect(about.getByTestId('about-log-clear')).toBeDisabled();
  await about.getByTestId('about-log').click();
  await expect(page.getByTestId('log-dialog')).toContainText('היומן ריק.');
  expect(errors).toEqual([]);
});

test('the licences open in a dialog, in English too', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, { lang: 'en' });
  const about = await openAbout(page);
  await expect(about.getByRole('heading')).toHaveText('About and diagnostics');
  await about.getByTestId('about-licenses').click();
  const dialog = page.getByTestId('licenses-dialog');
  await expect(dialog.getByRole('heading')).toHaveText('Open-source licences');
  await expect(dialog.getByTestId('licenses-text')).toContainText('third-party notices');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  expect(errors).toEqual([]);
});

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

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`about and diagnostics ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });
        const about = await openAbout(page);
        await settle(page);
        await page.screenshot({ path: out(`about-${name}`) });

        await about.getByTestId('about-log').click();
        const log = page.getByTestId('log-dialog');
        await log.getByTestId('log-entry').nth(3).getByRole('button').click();
        await settle(page);
        // The dialog fits the window, with its buttons, at both sizes.
        const box = (await log.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        await page.screenshot({ path: out(`log-${name}`) });
        await page.keyboard.press('Escape');

        await about.getByTestId('about-licenses').click();
        await expect(page.getByTestId('licenses-text')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`licenses-${name}`) });
      });

      test(`the autosave alert in the status bar ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });
        // What the document service reports when the disk is full (WG13-T03); the failure itself
        // is staged in the packaged app (packaged/recovery.spec.ts).
        await page.evaluate(() => {
          const editor = (
            window as unknown as {
              slidr: { file: { setState(state: { autosaveFailure: string }): void } };
            }
          ).slidr;
          editor.file.setState({ autosaveFailure: 'disk_full' });
        });
        const alert = page.getByTestId('status-save');
        await expect(alert).toHaveAttribute('role', 'alert');
        await expect(alert).toHaveText(
          lang === 'he'
            ? 'השמירה האוטומטית נכשלה: אין מקום בדיסק'
            : 'Autosave failed: the disk is full',
        );
        // The sentence fits the bar at both sizes: on one line, inside the window.
        const box = (await alert.boundingBox())!;
        const bar = (await page.getByTestId('status-bar').boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.height).toBeLessThanOrEqual(bar.height);
        await settle(page);
        await page.screenshot({ path: out(`autosave-${name}`) });
      });
    }
  }
}
