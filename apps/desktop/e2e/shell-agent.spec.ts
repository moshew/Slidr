import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { agentSettings, chat, openApp, say } from './aifinish-helpers';

/*
 * The agent's settings in the settings file (AGT-04): what an earlier version kept in
 * `localStorage` is carried over, the choice of the settings screen is the default of every
 * conversation, and the picker of a chat chooses for its conversation alone. The agent is the
 * scripted mock, whose "models" are its scripts: a turn shows which one played it.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/shell/${name}.png`, import.meta.url));

const picker = (page: Page) => page.getByTestId('model-picker');
const thread = (page: Page) => chat(page).getAttribute('data-thread');

async function pick(page: Page, name: string | RegExp) {
  await picker(page).click();
  await page.getByRole('menuitemradio', { name }).first().click();
}

async function showPanel(page: Page, id: string) {
  await page.getByTestId('activity-bar').locator(`[data-panel="${id}"]`).click();
}

/** The agent's part of the settings screen, open. */
async function settingsSection(page: Page) {
  await showPanel(page, 'settings');
  const section = page.locator('[data-settings-section="agent"]');
  await expect(section.getByTestId('settings-agent')).toBeVisible();
  return section;
}

test('what was kept in localStorage is carried into the settings, and is not kept there', async ({
  page,
}) => {
  await openApp(page, { script: 'deck-build', settings: { qualityGate: false, outline: 'build' } });
  await expect(picker(page)).toHaveAttribute('data-model', 'deck-build');
  expect(await agentSettings(page)).toEqual({
    harnessId: 'mock',
    model: 'deck-build',
    mockSpeed: 0,
    qualityGate: false,
    outline: 'build',
  });
  expect(await page.evaluate(() => localStorage.getItem('slidr.agent'))).toBeNull();

  // The settings screen shows what was carried.
  const section = await settingsSection(page);
  await expect(section.getByRole('switch', { name: 'בדיקת עיצוב בסוף כל תור' })).not.toBeChecked();
  await expect(section.getByRole('switch', { name: 'מתווה לפני בניית מצגת' })).not.toBeChecked();
  await expect(section.getByRole('combobox', { name: 'מודל' })).toContainText('deck-build');
});

test("the picker chooses for its conversation alone, and the app's choice is the default", async ({
  page,
}) => {
  await openApp(page, { script: 'deck-build' });
  const first = await thread(page);
  await expect(picker(page)).toHaveAttribute('data-own', 'false');

  // This conversation moves to another model.
  await pick(page, 'slide-chat');
  await expect(picker(page)).toHaveAttribute('data-model', 'slide-chat');
  await expect(picker(page)).toHaveAttribute('data-own', 'true');
  expect((await agentSettings(page)).model).toBe('deck-build');
  const turn = await say(page, 'שלום');
  await expect(turn).toContainText("I'll build an opening slide");

  // A new conversation of the same tool starts on the app's model.
  await page.getByTestId('conversation-new').click();
  await expect.poll(() => thread(page)).not.toBe(first);
  await expect(picker(page)).toHaveAttribute('data-model', 'deck-build');
  await expect(picker(page)).toHaveAttribute('data-own', 'false');
  const other = await say(page, 'בנה שקף פתיחה');
  await expect(other).toContainText('בונה שקף פתיחה');

  // Back in the first one, its own choice is still there.
  await page.getByTestId('conversations').click();
  await page.locator(`[data-conversation="${first}"]`).click();
  await expect.poll(() => thread(page)).toBe(first);
  await expect(picker(page)).toHaveAttribute('data-model', 'slide-chat');
  await expect(picker(page)).toHaveAttribute('data-own', 'true');
});

test('the default changed in the settings reaches a conversation that chose nothing', async ({
  page,
}) => {
  await openApp(page, { script: 'deck-build' });
  const first = await thread(page);
  await pick(page, 'slide-chat');
  await say(page, 'שלום');
  await page.getByTestId('conversation-new').click();
  await expect.poll(() => thread(page)).not.toBe(first);
  const second = await thread(page);

  // The app's model, in the settings screen.
  const section = await settingsSection(page);
  await section.getByRole('combobox', { name: 'מודל' }).click();
  await page.getByRole('option', { name: 'outline', exact: true }).click();
  expect((await agentSettings(page)).model).toBe('outline');
  await expect(section).toContainText('ברירת המחדל של כל שיחה');

  // The conversation that chose nothing follows; the one with a choice of its own does not.
  await showPanel(page, 'ai.deck');
  await expect.poll(() => thread(page)).toBe(second);
  await expect(picker(page)).toHaveAttribute('data-model', 'outline');
  await page.getByTestId('conversations').click();
  await page.locator(`[data-conversation="${first}"]`).click();
  await expect(picker(page)).toHaveAttribute('data-model', 'slide-chat');

  // Its menu names the default it would go back to, and says where the default is set.
  await picker(page).click();
  await expect(page.getByRole('menuitemradio', { name: 'ברירת המחדל · outline' })).toBeVisible();
  await expect(page.getByRole('menu')).toContainText('לשיחה הזאת בלבד');
  await page.getByRole('menuitemradio', { name: 'ברירת המחדל · outline' }).click();
  await expect(picker(page)).toHaveAttribute('data-model', 'outline');
  await expect(picker(page)).toHaveAttribute('data-own', 'false');
});

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`the picker of a conversation with a model of its own: ${lang}, ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await openApp(page, { script: 'deck-build', lang, theme });
      await pick(page, 'slide-chat');
      await picker(page).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      await page.screenshot({ path: out(`agent-picker-${lang}-${theme}`) });
    });
  }
}
