import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type * as Settings from '../src/settings';
import { openApp } from './arrange-helpers';

/*
 * The agent's section of the settings screen (WG3-T08, WG11-T11): the model, the effort, web
 * access, the design check and the outline. In a plain browser the harness is the scripted mock,
 * so what is checked is the screen and what it writes where the agent reads its settings.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/editor/${name}.png`, import.meta.url));

async function openSettings(page: Page) {
  await page.getByTestId('activity-bar').locator('[data-panel="settings"]').click();
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

test('the agent has its section, before the image providers', async ({ page }) => {
  await openApp(page);
  await openSettings(page);
  const sections = await page
    .locator('[data-settings-section]')
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-settings-section')));
  expect(sections.slice(0, 2)).toEqual(['agent', 'images']);
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
  await expect(options.first()).toHaveText('ברירת המחדל');
  const second = options.nth(1);
  const label = (await second.textContent())!;
  await second.click();
  const model = (await stored(page)).model as string;
  expect(model).toBeTruthy();

  // The picker of the chat reads the same setting.
  await page.getByTestId('activity-bar').locator('[data-panel="ai"]').click();
  await expect(page.getByTestId('model-picker')).toHaveAttribute('data-model', model);
  await expect(page.getByTestId('model-picker')).toContainText(label);
});

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`the section in ${lang}, ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await openApp(page, { lang, theme });
      await openSettings(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      await page.screenshot({ path: out(`settings-agent-${lang}-${theme}-1366`) });
    });
  }
}
