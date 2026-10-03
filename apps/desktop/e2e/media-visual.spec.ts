import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  addPlaceholders,
  enterKey,
  openApp,
  openMedia,
  openPanel,
  type OpenOptions,
} from './media-helpers';

/*
 * Screenshots of the settings screen and the media panel for the design gate (PLAN 1.2): both
 * themes, both directions and both target resolutions. They are written to test-results/media/
 * to be looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/media/${name}.png`, import.meta.url));

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

async function open(page: Page, options: OpenOptions) {
  await openApp(page, options);
  // Something on the slide, so the panel is seen next to real content.
  await page.evaluate(() => {
    const editor = window.slidr!;
    const slideId = editor.selection.getState().currentSlideId ?? '';
    editor.bus.dispatch({
      type: 'element.add',
      slideId,
      element: {
        id: 'e_title',
        type: 'text',
        role: 'title',
        frame: { x: 160, y: 120, w: 1600, h: 160 },
        rotation: 0,
        opacity: 1,
        autoFit: 'none',
        vAlign: 'top',
        content: {
          paragraphs: [
            {
              dir: 'rtl',
              align: 'start',
              styleRef: 'heading',
              runs: [{ text: 'יוצאים לדרך', marks: { color: { token: 'primary' } } }],
            },
          ],
        },
      } as never,
    });
  });
}

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`the settings screen ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, { lang, theme });
        await openPanel(page, 'settings');
        await page.locator('[data-provider="mock-api"]').click();
        await enterKey(page, 'unsplash', 'unsplash-key-0123456789');
        await expect(page.locator('[data-provider="mock-api"]')).toHaveAttribute(
          'data-state',
          'needs_key',
        );
        await settle(page);
        await page.screenshot({ path: out(`settings-${name}`) });
      });

      test(`stock photos ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, { lang, theme });
        await openMedia(page, 'stock');
        await page.getByTestId('stock-query').fill(lang === 'he' ? 'נמל בזריחה' : 'harbour');
        await page.keyboard.press('Enter');
        const tiles = page.getByTestId('stock-results').locator('button');
        await expect(tiles).toHaveCount(20);
        await tiles.first().click();
        await expect(page.getByTestId('stock-credits')).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`stock-${name}`) });
      });

      test(`icons ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, { lang, theme });
        await openMedia(page, 'icons');
        await page.getByTestId('icon-query').fill(lang === 'he' ? 'חץ' : 'arrow');
        const tiles = page.getByTestId('icon-results').locator('button');
        await expect(tiles.first()).toHaveAttribute('data-icon', /arrow/);
        await page.getByTestId('icon-query').fill(lang === 'he' ? 'רקטה' : 'rocket');
        await expect(tiles.first()).toHaveAttribute('data-icon', 'lucide:rocket');
        await tiles.first().click();
        await page.getByTestId('icon-query').fill(lang === 'he' ? 'חץ' : 'arrow');
        await expect(tiles.first()).toHaveAttribute('data-icon', /arrow/);
        await settle(page);
        await page.screenshot({ path: out(`icons-${name}`) });
      });

      test(`AI images ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await open(page, { lang, theme });
        const ids = await addPlaceholders(page, [
          'נמל דייגים קטן בזריחה, צילום רחב',
          'A lighthouse at dusk, seen from the sea',
          'מגדלור על צוק',
        ]);
        await openMedia(page, 'ai');
        const style = page.getByTestId('image-style');
        await style.fill(
          lang === 'he'
            ? 'איור וקטורי שטוח, צבעים רכים, בלי אנשים'
            : 'Flat vector illustration, soft colours, no people',
        );
        await style.blur();
        // One image made, one being made, one waiting.
        await page.locator(`[data-placeholder="${ids[0]}"]`).getByRole('button').last().click();
        await expect(page.locator(`[data-placeholder="${ids[0]}"]`)).toHaveCount(0);
        await page.locator(`[data-placeholder="${ids[1]}"]`).getByRole('button').last().click();
        await expect(page.locator(`[data-placeholder="${ids[1]}"]`)).toHaveAttribute(
          'data-state',
          'working',
        );
        await page.screenshot({ path: out(`ai-${name}`) });
      });
    }
  }
}

test('the states of the panel: nothing yet, no key, a failed search', async ({ page }) => {
  await openApp(page);
  await openMedia(page, 'uploads');
  await settle(page);
  await page.screenshot({ path: out('state-uploads-empty') });

  await openMedia(page, 'stock');
  await page.getByTestId('stock-query').fill('mock:rate_limit');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('state-stock-failed') });

  await openMedia(page, 'icons');
  await page.getByRole('radio', { name: 'מלא' }).click();
  await expect(page.getByTestId('icon-results').locator('button').first()).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('state-icons-filled') });

  await openPanel(page, 'settings');
  await page.locator('[data-provider="mock-api"]').click();
  const field = page.getByTestId('key-openai-api');
  await field.locator('input').fill('not a key');
  await field.getByRole('button').first().click();
  await expect(field.getByRole('alert')).toBeVisible();
  await settle(page);
  await page.screenshot({ path: out('state-key-rejected') });
});
