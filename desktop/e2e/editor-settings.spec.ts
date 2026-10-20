import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type * as Settings from '../src/settings';
import { openApp } from './arrange-helpers';
import { openMedia } from './media-helpers';

/*
 * The settings screen (WG3-T08, WG11-T11): a tab for each topic, and the agent's tab: the model,
 * the effort, web access, the design check and the outline. In a plain browser the harness is the
 * scripted mock, so what is checked is the screen and what it writes where the agent reads its
 * settings.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/editor/${name}.png`, import.meta.url));

async function openSettings(page: Page) {
  await page.getByTestId('activity-bar').locator('[data-panel="settings"]').click();
  await page.locator('[data-settings-tab="agent"]').click();
  const section = page.locator('[data-settings-section="agent"]');
  await expect(section.getByTestId('settings-agent')).toBeVisible();
  return section;
}

/** The agent's settings as they are kept: the section `agent` of the settings. */
const stored = (page: Page) =>
  page.evaluate(async (path) => {
    const { pageSettings } = (await import(/* @vite-ignore */ path)) as typeof Settings;
    return ((await pageSettings.read()).agent ?? {}) as Record<string, unknown>;
  }, '/src/settings/index.ts');

/** The sections the open tab shows. */
const shown = (page: Page) =>
  page
    .locator('[data-settings-section]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-settings-section')));

const TABS = ['general', 'agent', 'media', 'fonts', 'about'] as const;

test('the settings are a tab for each topic, and a tab shows only its own sections', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('activity-bar').locator('[data-panel="settings"]').click();
  const tabs = page.getByRole('tablist', { name: 'נושאי ההגדרות' }).getByRole('tab');
  await expect(tabs).toHaveText(['כללי', 'Agent', 'תמונות', 'גופנים', 'אודות']);
  // The screen opens on its first topic: the theme and the language.
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  expect(await shown(page)).toEqual(['appearance', 'language']);

  const sections = {
    agent: ['agent'],
    media: ['images', 'stock'],
    fonts: ['fonts'],
    about: ['about'],
  };
  for (const [tab, ids] of Object.entries(sections)) {
    await page.locator(`[data-settings-tab="${tab}"]`).click();
    await expect(page.locator(`[data-settings-tab="${tab}"]`)).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect.poll(() => shown(page)).toEqual(ids);
  }

  // The arrow keys move between the tabs, in the direction of the UI: left is next in Hebrew.
  await page.locator('[data-settings-tab="about"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-settings-tab="fonts"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('a way in from elsewhere opens the settings on the tab it needs', async ({ page }) => {
  await openApp(page);
  // An image provider that needs a key, chosen; then the settings are left on another tab.
  await page.getByTestId('activity-bar').locator('[data-panel="settings"]').click();
  await page.locator('[data-settings-tab="media"]').click();
  await page.locator('[data-provider="mock-api"]').click();
  await page.locator('[data-settings-tab="general"]').click();

  // The AI images of the media panel say the provider is not ready, and lead to its tab.
  await openMedia(page, 'ai');
  await page.getByTestId('ai-provider-state').getByRole('button').click();
  await expect(page.getByTestId('tool-panel').locator('[data-panel="settings"]')).toBeVisible();
  await expect(page.locator('[data-settings-tab="media"]')).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.locator('[data-provider="mock-api"]')).toHaveAttribute('aria-checked', 'true');
});

test('the three switches write what a session reads, and a default is not written', async ({
  page,
}) => {
  await openApp(page);
  const section = await openSettings(page);
  const web = section.getByRole('switch', { name: 'חיפוש וקריאה ברשת' });
  const gate = section.getByRole('switch', { name: 'בדיקת עיצוב בסוף כל תור' });
  const outline = section.getByRole('switch', { name: 'מתווה לפני בניית מצגת' });
  // All three are on until turned off.
  for (const control of [web, gate, outline]) await expect(control).toBeChecked();

  await web.click();
  await expect(web).not.toBeChecked();
  expect(await stored(page)).toMatchObject({ webAccess: false });
  await web.click();
  expect(await stored(page)).not.toHaveProperty('webAccess');

  await gate.click();
  expect(await stored(page)).toMatchObject({ qualityGate: false });

  await outline.click();
  expect(await stored(page)).toMatchObject({ outline: 'build' });
  await outline.click();
  expect(await stored(page)).toMatchObject({ outline: 'first' });
});

test('the model chosen in the settings is the one the chat shows', async ({ page }) => {
  await openApp(page);
  const section = await openSettings(page);
  await section.getByRole('combobox', { name: 'מודל' }).click();
  const options = page.getByRole('option');
  await expect(options.first()).not.toHaveText('ברירת המחדל');
  const first = options.first();
  const label = (await first.textContent())!;
  await first.click();
  const model = (await stored(page)).model as string;
  expect(model).toBeTruthy();

  // The picker of the chat reads the same setting.
  await page.getByTestId('activity-bar').locator('[data-panel="ai"]').click();
  await expect(page.getByTestId('model-picker')).toHaveAttribute('data-model', model);
  await expect(page.getByTestId('model-picker')).toContainText(label);
});

// The design gate (PLAN 1.2): every tab in both languages and both themes, at the smallest
// supported window, written to test-results/editor/ to be looked at. Nothing is compared.
for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`every tab in ${lang}, ${theme}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 1366, height: 768 });
      await openApp(page, { lang, theme });
      await page.getByTestId('activity-bar').locator('[data-panel="settings"]').click();
      for (const tab of TABS) {
        await page.locator(`[data-settings-tab="${tab}"]`).click();
        if (tab === 'agent') await expect(page.getByTestId('harness-connection')).toBeVisible();
        if (tab === 'media') await expect(page.getByTestId('image-providers')).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(250);
        await page.screenshot({ path: out(`settings-${tab}-${lang}-${theme}-1366`) });
      }
    });
  }
}
