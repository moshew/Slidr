import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out = fileURLToPath(new URL('../../../test-results/world-holidays/', import.meta.url));
mkdirSync(out, { recursive: true });
const catalog = JSON.parse(
  readFileSync(
    new URL('../../../../Slidr-media/elements/designs/index.json', import.meta.url),
    'utf8',
  ),
);
const ids = catalog.groupIds.holidays.slice(-10);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const report = [];
for (const lang of ['he', 'en']) {
  for (const id of ids) {
    await page.goto(`http://localhost:1420/dev/designs-review.html?id=${id}&lang=${lang}&w=1920`);
    await page.waitForSelector('html[data-ready="true"]');
    await page.screenshot({ path: `${out}${id}-${lang}.png` });
    report.push({
      id,
      lang,
      lines: await page.evaluate(() => globalThis.__lines()),
      subject: await page.evaluate(() => globalThis.__subject()),
    });
  }
  await page.goto(
    `http://localhost:1420/dev/designs-review.html?pack=holidays&sheet=1&from=20&count=10&cols=2&lang=${lang}&w=400`,
  );
  await page.waitForSelector('html[data-ready="true"]');
  await page.locator('#root > div').screenshot({ path: `${out}gallery-${lang}.png` });
}
writeFileSync(`${out}report.json`, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    report.map((r) => ({
      id: r.id,
      lang: r.lang,
      issues: r.lines.filter((l) => l.outX > 1 || l.outY > 1 || l.zoom < 0.95),
      missing: r.subject.missing,
    })),
    null,
    2,
  ),
);
await browser.close();
