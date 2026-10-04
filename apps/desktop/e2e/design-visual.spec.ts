import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createDeck, createElement, createSlide } from '@slidr/model';
import { checked, group, openCheck, panel, settle } from './design-helpers';

/*
 * Screenshots of the Design check panel, for the design gate (PLAN 1.2): both themes, both
 * directions and both target resolutions. They are written to test-results/design/ to be looked
 * at; nothing is compared.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/design/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = [
  { lang: 'he', dir: 'rtl' },
  { lang: 'en', dir: 'ltr' },
] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

for (const theme of themes) {
  for (const { lang, dir } of languages) {
    for (const viewport of viewports) {
      const name = `${theme}-${dir}-${viewport.width}`;

      test(`the panel over a deck with findings ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openCheck(page, { lang, theme });
        // One finding open: what it says to do, and what was measured.
        const overflow = group(page, 's_errors').locator('li[data-finding="L01"]');
        await overflow.getByRole('button').first().click();
        await overflow.locator('summary').click();
        await settle(page);
        await page.screenshot({ path: out(`check-${name}`) });
      });
    }
  }
}

const states = [
  { lang: 'he', theme: 'light', viewport: viewports[0], name: 'light-rtl-1920' },
  { lang: 'en', theme: 'dark', viewport: viewports[1], name: 'dark-ltr-1366' },
] as const;

for (const { lang, theme, viewport, name } of states) {
  test(`after "Fix all": what was fixed, and the note that is left ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openCheck(page, { lang, theme });
    await page.getByTestId('fix-all').click();
    await expect(page.getByTestId('fix-report')).toBeVisible();
    await checked(page);
    await settle(page);
    await page.screenshot({ path: out(`check-fixed-${name}`) });
  });

  test(`a deck with nothing to report ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openCheck(page, {
      lang,
      theme,
      deck: createDeck({
        lang: 'he',
        slides: [
          createSlide({
            id: 's_one',
            elements: [96, 688, 1280].map((x, i) =>
              createElement.shape({ id: `e_card${i}`, frame: { x, y: 120, w: 544, h: 840 } }),
            ),
          }),
        ],
      }),
    });
    await expect(panel(page)).toContainText(lang === 'he' ? 'אין ממצאי עיצוב' : 'No design issues');
    await settle(page);
    await page.screenshot({ path: out(`check-clean-${name}`) });
  });

  test(`the tooltip of a fix, and only errors and warnings ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openCheck(page, { lang, theme });
    await page.getByRole('radio').nth(1).click();
    await group(page, 's_arrange').locator('[data-fix="L10"]').hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: out(`check-tooltip-${name}`) });
  });
}
