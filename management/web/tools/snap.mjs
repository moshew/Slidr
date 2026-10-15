// Converts and renders one variant of a design in a headless browser, through the studio's render
// page (render.html), and keeps what it drew:
//
//   node management/web/tools/snap.mjs --url <render page URL> --out <folder> [--channel msedge]
//
//   <folder>/he-full.png en-full.png     the slide at 1920×1080
//   <folder>/he-thumb.png en-thumb.png   the gallery's thumbnail, 384 px wide
//   <folder>/result.json                 the slides, findings, conversion notes, subject point
//
// The page's conversion engine compares its result with the HTML it converts, by pictures of the
// page: this script gives it real ones (`window.__slidrCapture`), as the app's capture window
// does, so a part that would not look the same stays `html` here exactly as in the app.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const url = option('--url');
const out = resolve(option('--out', '.'));
const channel = option('--channel', 'msedge');
// --blank: the engine gets blank pictures and accepts what it measured (as in a plain browser).
// --debug: every picture the engine asked for is kept as capture-<n>.png.
const blank = args.includes('--blank');
const debug = args.includes('--debug');
let captures = 0;
if (!url) {
  console.error('usage: snap.mjs --url <render page> --out <folder> [--channel msedge]');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel, headless: true });
let failed = false;
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (error) => console.error(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(`console: ${message.text()}`);
  });
  if (!blank) {
    await page.exposeFunction('__slidrCapture', async (rect) => {
      const picture = await page.screenshot({
        clip: {
          x: rect.x,
          y: rect.y,
          width: Math.max(1, rect.width),
          height: Math.max(1, rect.height),
        },
        animations: 'disabled',
      });
      if (debug) writeFileSync(join(out, `capture-${(captures += 1)}.png`), picture);
      return picture.toString('base64');
    });
  }
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__snap?.done === true, null, { timeout: 200_000 });
  const snap = await page.evaluate(() => window.__snap);
  if (snap.error || !snap.result) {
    console.error(snap.error ?? 'The render page gave no result.');
    failed = true;
  } else {
    for (const name of ['he-full', 'he-thumb', 'en-full', 'en-thumb']) {
      const view = page.locator(`[data-snap="${name}"]`);
      if ((await view.count()) === 0) continue;
      await view.screenshot({ path: join(out, `${name}.png`), animations: 'disabled' });
    }
    writeFileSync(join(out, 'result.json'), JSON.stringify(snap.result));
    const { langs, publishable } = snap.result;
    console.log(
      `rendered: publishable=${publishable}, he ${langs.he.findings.length} findings, en ${langs.en.findings.length} findings`,
    );
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
