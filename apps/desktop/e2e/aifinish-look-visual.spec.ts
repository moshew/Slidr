import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import {
  fontCard,
  openLook,
  paletteCard,
  previewLabel,
  scrollTo,
  settle,
  templateCard,
} from './aifinish-look-helpers';

/*
 * Screenshots of the deck's look in the Actions tab of the deck tool for the design gate
 * (PLAN 1.2): both themes, both directions and both target resolutions. They are written to
 * test-results/ai-finish/ to be looked at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/ai-finish/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;
// What the window of a maximized app gives at 1920 × 1080, and the smallest supported screen.
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`the look of the deck in the deck tool ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openLook(page, { lang, theme });
        // The gallery and the palettes, from the top of the gallery.
        await scrollTo(page, 'template');
        await expect(templateCard(page, 'tzuk').locator('img').first()).toBeVisible();
        await settle(page);
        await page.screenshot({ path: out(`look-${name}`) });
        // The font pairs are further down the tab.
        await scrollTo(page, 'fonts');
        await settle(page);
        await page.screenshot({ path: out(`look-${name}-fonts`) });
      });
    }
  }
}

test.describe('states', () => {
  test('a template that is hovered shows on the Stage', async ({ page }) => {
    await openLook(page);
    await scrollTo(page, 'template');
    await templateCard(page, 'shvil').hover();
    await expect(previewLabel(page)).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out('look-template-hovered') });
  });

  test('the narrowest panel and the widest one', async ({ page }) => {
    // The splitter keeps the panel between a quarter and 45% of the window (UI-01).
    await page.setViewportSize({ width: 1366, height: 768 });
    await openLook(page);
    await page.getByTestId('panel-splitter').focus();
    await page.keyboard.press('Home');
    await scrollTo(page, 'template');
    await settle(page);
    await page.screenshot({ path: out('look-narrowest-1366') });

    await page.setViewportSize({ width: 1920, height: 1032 });
    await page.getByTestId('panel-splitter').focus();
    await page.keyboard.press('End');
    await scrollTo(page, 'template');
    await settle(page);
    await page.screenshot({ path: out('look-widest-1920') });
  });

  test('a palette and a font pair that are tried, and the deck after both were applied', async ({
    page,
  }) => {
    await openLook(page, { lang: 'en', theme: 'dark' });
    await scrollTo(page, 'palette');
    await paletteCard(page, 'rose').hover();
    await expect(previewLabel(page)).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out('look-palette-hovered') });
    await paletteCard(page, 'rose').click();

    // Reached with the keyboard, so the focus ring shows where the look comes from.
    const serif = fontCard(page, 'Noto Serif Hebrew|Playfair Display|Noto Sans Hebrew|DM Sans');
    await fontCard(page, 'Assistant|Montserrat|Assistant|Open Sans').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(serif).toBeFocused();
    await expect(previewLabel(page)).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out('look-fonts-focused') });
    await page.keyboard.press('Enter');
    await expect(serif).toHaveAttribute('data-current', 'true');
    await settle(page);
    await page.screenshot({ path: out('look-applied') });
  });
});
