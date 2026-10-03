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
 * Screenshots of the three AI tools and the variations gallery for the design gate (PLAN 1.2):
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

      test(`text variations in the object tool ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, { script: 'text-variations', lang, theme });
        await addTitle(page);
        await openTool(page, 'ai.object', 'chat');
        await say(page, 'תן לי ארבעה ניסוחים אחרים לכותרת');
        await expect(cards(page)).toHaveCount(4);
        await cards(page).nth(1).hover();
        await expect(page.getByTestId('stage-preview')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`variations-${name}`) });
      });

      test(`designs of a slide in the slide tool ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, { script: 'slide-redesign', lang, theme });
        await addTitle(page, 'שלושת היעדים של 2027');
        await openTool(page, 'ai.slide', 'actions');
        await runAction(page, 'slide.redesign');
        await expect(cards(page)).toHaveCount(3);
        await cards(page).nth(1).hover();
        await settle(page);
        await page.screenshot({ path: out(`designs-${name}`) });
      });

      test(`the actions of the three tools ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, { script: 'text-variations', lang, theme });
        await openTool(page, 'ai.deck', 'actions');
        await settle(page);
        await page.screenshot({ path: out(`actions-deck-${name}`) });
        await openTool(page, 'ai.slide', 'actions');
        await settle(page);
        await page.screenshot({ path: out(`actions-slide-${name}`) });
        await addTitle(page);
        await openTool(page, 'ai.object', 'actions');
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
    await openTool(page, 'ai.object', 'actions');
    await page.locator('[data-action="image.alternatives"]').click();
    await expect(cards(page).first()).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
    await settle(page);
    await page.screenshot({ path: out('state-images-arriving') });
    await expect(cards(page).first()).toContainText('נמל בזריחה', { timeout: 30_000 });
    await cards(page).nth(2).click();
    await settle(page);
    await page.screenshot({ path: out('state-image-picked') });
  });

  test('the empty chats of the slide tool and the object tool, and no selection', async ({
    page,
  }) => {
    await openApp(page, { script: 'text-variations' });
    await openTool(page, 'ai.slide', 'chat');
    await settle(page);
    await page.screenshot({ path: out('state-slide-empty') });
    await openTool(page, 'ai.object', 'chat');
    await settle(page);
    await page.screenshot({ path: out('state-object-no-selection') });
    await addTitle(page);
    await settle(page);
    await page.screenshot({ path: out('state-object-empty') });
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
