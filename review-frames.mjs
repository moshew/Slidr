/* global console, window, process */
// Run from the repository root with the desktop dev server running.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const base = process.env.SLIDR_REVIEW_URL ?? 'http://localhost:1421';
const out = 'apps/desktop/test-results/frames-wide';
await mkdir(`${out}/full`, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
try {
  const page = await browser.newPage({ viewport: { width: 1944, height: 1140 } });
  page.on('pageerror', (error) => {
    throw error;
  });
  for (const lang of ['he', 'en']) {
    for (let from = 0, total = 1; from < total; from += 24) {
      for (const width of [1920, 320]) {
        const cols = width === 1920 ? 1 : 4;
        await page.goto(
          `${base}/dev/frames-review.html?lang=${lang}&w=${width}&from=${from}&count=24&cols=${cols}`,
        );
        await page.waitForSelector('html[data-ready="true"]');
        total = await page.evaluate(() => window.__count);
        if (width === 1920) {
          // Capture each slide in the viewport: huge page screenshots can omit filtered SVG layers.
          const cards = page.locator('[data-frame]');
          for (let i = 0; i < (await cards.count()); i++) {
            const card = cards.nth(i);
            await card.scrollIntoViewIfNeeded();
            await card.screenshot({ path: `${out}/full/${lang}-${from + i}.png` });
          }
        } else {
          await page.screenshot({ path: `${out}/${lang}-${from}-320.png`, fullPage: true });
        }
      }
      console.log(lang, from, total);
    }
  }
} finally {
  await browser.close();
}
