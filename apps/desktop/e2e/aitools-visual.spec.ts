import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  addBody,
  addImage,
  addTitle,
  cards,
  openApp,
  openTool,
  runAction,
  say,
  type OpenOptions,
} from './aitools-helpers';

/*
 * Screenshots of the AI chat (ADR-072) and the variations gallery for the design gate (PLAN 1.2):
 * both themes, both directions and both target resolutions. They are written to
 * test-results/ai-tools/ to be looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/ai-tools/${name}.png`, import.meta.url));

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

const BODY = 'להשיק את העורך החדש, לקצר את זמן הטעינה בחצי, ולהגיע לאלף משתמשים פעילים.';

async function open(page: Page, options: OpenOptions) {
  await openApp(page, options);
  await addBody(page, BODY);
}

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`text variations of a selected title ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, { script: 'text-variations', lang, theme });
        await addTitle(page);
        await openTool(page, 'chat');
        await say(page, 'תן לי ארבעה ניסוחים אחרים לכותרת');
        await expect(cards(page)).toHaveCount(4);
        await cards(page).nth(1).hover();
        await expect(page.getByTestId('stage-preview')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`variations-${name}`) });
      });

      test(`designs of the slide on the Stage ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, { script: 'slide-redesign', lang, theme });
        await addTitle(page, 'שלושת היעדים של 2027');
        await openTool(page, 'actions');
        await runAction(page, 'slide.redesign');
        await expect(cards(page)).toHaveCount(3);
        await cards(page).nth(1).hover();
        await settle(page);
        await page.screenshot({ path: out(`designs-${name}`) });
      });

      test(`the actions of the slide, of a text and of an image ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, { script: 'text-variations', lang, theme });
        await openTool(page, 'actions');
        await settle(page);
        await page.screenshot({ path: out(`actions-slide-${name}`) });
        await addTitle(page);
        await openTool(page, 'actions');
        await settle(page);
        await page.screenshot({ path: out(`actions-text-${name}`) });
        await addImage(page);
        await settle(page);
        await page.screenshot({ path: out(`actions-image-${name}`) });
      });
    }
  }
}

test.describe('states', () => {
  test('images on their way, and an image picked', async ({ page }) => {
    await openApp(page, { script: 'image-alternatives', speed: 0.2 });
    await addTitle(page);
    await addImage(page);
    await openTool(page, 'actions');
    await page.locator('[data-action="image.alternatives"]').click();
    await expect(cards(page).first()).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
    await settle(page);
    await page.screenshot({ path: out('state-images-arriving') });
    await expect(cards(page).first()).toContainText('נמל בזריחה', { timeout: 30_000 });
    await cards(page).nth(2).click();
    await settle(page);
    await page.screenshot({ path: out('state-image-picked') });
  });

  test('the empty chat about the slide, about a selection, and about words selected in a text', async ({
    page,
  }) => {
    await openApp(page, { script: 'text-variations' });
    await openTool(page, 'chat');
    await settle(page);
    await page.screenshot({ path: out('state-slide-empty') });
    await addTitle(page);
    await settle(page);
    await page.screenshot({ path: out('state-object-empty') });
    await page.getByTestId('stage-frame').locator('[data-element-id="e_title"]').dblclick();
    await page.keyboard.press('Control+a');
    await page.getByTestId('chat-input').click();
    await expect(page.getByTestId('focus-chip')).toHaveAttribute('data-focus', 'text');
    await settle(page);
    await page.screenshot({ path: out('state-text-selected') });
  });

  test('the right-click menu of the Stage', async ({ page }) => {
    await openApp(page, { script: 'text-variations' });
    await addTitle(page);
    await page.getByTestId('stage-frame').locator('[data-element-id="e_title"]').click({
      button: 'right',
    });
    await expect(page.getByTestId('stage-menu')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out('state-stage-menu') });
  });
});
