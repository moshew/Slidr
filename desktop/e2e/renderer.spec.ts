import { expect, test } from '@playwright/test';

// Visual regression of the renderer (WG2-T11, RND-01): every reference slide at 1920x1080.
// The pages are /dev/slides.html?deck=..&slide=..; baselines live next to this file.
const SLIDES: Record<string, number> = {
  reference: 9,
  hebrew: 3,
  english: 3,
  mixed: 2,
  'all-elements': 1,
};

test.use({ viewport: { width: 1920, height: 1080 } });

for (const [deck, count] of Object.entries(SLIDES)) {
  for (let i = 0; i < count; i++) {
    test(`${deck} slide ${i}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`/dev/slides.html?deck=${deck}&slide=${i}`);
      await page.waitForSelector('html[data-ready="true"]');
      const slide = page.locator('.slidr-slide');
      await slide.screenshot({ path: `test-results/renderer/${deck}-${i}.png` });
      await expect(slide).toHaveScreenshot(`${deck}-${i}.png`, { maxDiffPixels: 200 });
      expect(errors).toEqual([]);
    });
  }
}
