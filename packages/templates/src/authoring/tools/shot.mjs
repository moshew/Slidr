// Screenshots of the review page (apps/desktop/dev/review.html) on the dev server:
//   node tools/shot.mjs <out.png> "<query>" [<out.png> "<query>" ...]
// With SLIDR_CHECK=1 it also writes <out>.json: text that leaves its box, the design check's
// findings, and for designs what covers their subject. `CHROMIUM_PATH` names a browser other than
// Playwright's; `SLIDR_REVIEW_URL` a dev server other than the one on port 1420.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const pw = await import(
  createRequire(new URL('../../../../../package.json', import.meta.url)).resolve('playwright')
);
const chromium = pw.chromium ?? pw.default.chromium;
const jobs = [];
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i += 2) jobs.push([args[i], args[i + 1]]);
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const REVIEW = process.env.SLIDR_REVIEW_URL ?? 'http://localhost:1420/dev/review.html';
try {
  for (const [out, query] of jobs) {
    const params = new URLSearchParams(query);
    const w = Number(params.get('w') ?? 1920);
    const sheet =
      params.has('sheet') ||
      (!params.has('slide') && params.has('t')) ||
      (params.get('d') ?? '').includes(',') ||
      params.get('d') === 'all' ||
      (params.get('d') ?? '').startsWith('group:');
    const cols = Number(params.get('cols') ?? 4);
    const viewport = sheet
      ? { width: cols * (w + 12) + 12, height: 1000 }
      : { width: w, height: Math.round((w * 1080) / 1920) };
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${REVIEW}?${query}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForFunction(() => document.documentElement.dataset.ready, null, {
      timeout: 120_000,
    });
    if ((await page.locator('html').getAttribute('data-ready')) !== 'true') {
      console.log(out, 'FAILED', (await page.locator('body').innerText()).slice(0, 2000));
      continue;
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(300);
    await page.screenshot({ path: out, fullPage: sheet });
    if (process.env.SLIDR_CHECK) {
      const lines = await page.evaluate(() => window.__lines());
      const over = lines.filter((l) => l.outX > 4 || l.outY > 4 || l.zoom < 1);
      const lint = await page.evaluate(() => window.__lint());
      const bad = lint.filter((f) => f.severity !== 'info');
      const subjects = params.has('d') ? await page.evaluate(() => window.__subject()) : [];
      const covered = subjects.filter(
        (s) => (s.top && s.top !== 'image') || s.bare?.length || s.images !== 1,
      );
      writeFileSync(
        out.replace(/\.png$/, '.json'),
        JSON.stringify({ over, lint: bad, errors, covered }, null, 1),
      );
      if (covered.length) console.log(out, 'SUBJECT/FONT ISSUES', JSON.stringify(covered));
      console.log(out, `overflow ${over.length}, lint ${bad.length}`, errors.length ? errors : '');
    } else console.log(out, errors.length ? errors : 'ok');
    await page.close();
  }
} finally {
  await browser.close();
}
