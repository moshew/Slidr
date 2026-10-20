import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { createDeck, createElement, createSlide } from '@slidr/model';
import { openCheck, panel, settle } from './design-helpers';

/* Screenshots of the compact design check in both themes, languages and window sizes. */
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
      test(`design findings ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openCheck(page, { lang, theme });
        await expect(panel(page).locator('li[data-finding]')).toHaveCount(6);
        await settle(page);
        await page.screenshot({ path: out(`check-${name}`) });
      });
    }
  }
}

for (const { lang, theme, viewport, name } of [
  { lang: 'he', theme: 'light', viewport: viewports[0], name: 'light-rtl-1920' },
  { lang: 'en', theme: 'dark', viewport: viewports[1], name: 'dark-ltr-1366' },
] as const) {
  test(`clean deck ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openCheck(page, {
      lang,
      theme,
      deck: createDeck({
        lang,
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
}
