import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { openApp, pageProblems, row } from './objects-helpers';
import { addClip, mediaLoaded, STAGE_VIDEO, testMedia } from './video-helpers';

/*
 * Screenshots of the video and audio tools for the design gate (DSN-09): row B for a video and
 * for a sound, and the open popovers, in both themes, both directions and both target
 * resolutions. Written to test-results/objects/ to be looked at; nothing is compared. The one
 * thing that is checked is that the row fits its toolbar: nothing of it is cut off.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/objects/${name}.png`, import.meta.url));

const themes = ['light', 'dark'] as const;
const languages = ['he', 'en'] as const;
const viewports = [
  { width: 1920, height: 1032 },
  { width: 1366, height: 768 },
] as const;

const names = {
  he: { trim: 'חיתוך', poster: 'תמונת פתיחה', volume: 'עוצמת הקול' },
  en: { trim: 'Trim', poster: 'Poster', volume: 'Volume' },
} as const;

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

/** Whether everything in row B lies inside it: a row that is too wide is cut off at its end. */
async function rowFits(page: Page): Promise<boolean> {
  return row(page).evaluate((toolbar) => {
    const bounds = toolbar.getBoundingClientRect();
    return Array.from(toolbar.children).every((child) => {
      const box = child.getBoundingClientRect();
      return box.width === 0 || (box.left >= bounds.left - 0.5 && box.right <= bounds.right + 0.5);
    });
  });
}

for (const theme of themes) {
  for (const lang of languages) {
    for (const viewport of viewports) {
      const tag = `${theme}-${lang}-${viewport.width}`;

      test(`row B for a video, ${tag}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });
        const media = await testMedia(page);
        await addClip(page, 'video', media.video, {
          trim: { startMs: 500, endMs: 2500 },
          poster: { timeMs: 1750 },
        });
        await mediaLoaded(page, STAGE_VIDEO);
        await settle(page);
        await expect(row(page)).toHaveAttribute('data-selection', 'media');
        expect(await rowFits(page)).toBe(true);
        await page.screenshot({ path: out(`media-video-row-${tag}`) });

        const label = names[lang];
        await row(page).getByRole('button', { name: label.trim, exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.screenshot({ path: out(`media-video-trim-${tag}`) });
        await page.keyboard.press('Escape');

        await row(page).getByRole('button', { name: label.poster, exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.screenshot({ path: out(`media-video-poster-${tag}`) });
        await page.keyboard.press('Escape');

        await row(page).getByRole('button', { name: label.volume, exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.screenshot({ path: out(`media-video-volume-${tag}`) });
        await page.keyboard.press('Escape');

        // Playing: the button is a pause, and the time runs.
        await page.getByTestId('clip-play').click();
        await expect(page.getByTestId('clip-play')).toHaveAttribute('data-playing', 'true');
        await page.screenshot({ path: out(`media-video-playing-${tag}`) });
        expect(pageProblems(page)).toEqual([]);
      });

      test(`row B for a sound, ${tag}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await openApp(page, { lang, theme });
        const media = await testMedia(page);
        await addClip(page, 'audio', media.sound);
        await settle(page);
        await expect(row(page)).toHaveAttribute('data-selection', 'media');
        await expect(page.getByTestId('clip-time')).toHaveText('0:00 / 0:01');
        expect(await rowFits(page)).toBe(true);
        await page.screenshot({ path: out(`media-audio-row-${tag}`) });

        await row(page).getByRole('button', { name: names[lang].trim, exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.screenshot({ path: out(`media-audio-trim-${tag}`) });
        expect(pageProblems(page)).toEqual([]);
      });
    }
  }
}
