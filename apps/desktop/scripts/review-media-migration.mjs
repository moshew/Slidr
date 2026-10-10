/* global document, window */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const catalog = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../Slidr-media/elements/designs/index.json', import.meta.url)),
    'utf8',
  ),
);
const ids = catalog.groups.flatMap((group) => catalog.groupIds[group] ?? []);
const dir = join(tmpdir(), 'slidr-media-review');
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 2500, height: 1400 } });
const findings = [];
const base = 'http://localhost:1420/dev/designs-review.html';

async function visit(query) {
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(`${base}?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.documentElement.dataset.ready, null, {
      timeout: 60_000,
    });
    const ready = await page.locator('html').getAttribute('data-ready');
    if (ready === 'true') break;
    if (attempt === 1)
      throw new Error(`Review page failed: ${query}: ${await page.locator('body').innerText()}`);
  }
  await page.evaluate(() => document.fonts.ready);
  const failed = await page
    .locator('img')
    .evaluateAll((images) =>
      images
        .filter((image) => !image.complete || image.naturalWidth === 0)
        .map((image) => image.getAttribute('src')),
    );
  if (failed.length) findings.push({ query, missingImages: failed });
}

try {
  for (const lang of ['he', 'en']) {
    for (let from = 0; from < ids.length; from += 25) {
      await visit(`sheet=1&lang=${lang}&w=460&cols=5&from=${from}&count=25`);
      await page.screenshot({ path: join(dir, `sheet-${lang}-${from}.png`), fullPage: true });
    }
    for (let index = 0; index < ids.length; index++) {
      const id = ids[index];
      await visit(`id=${encodeURIComponent(id)}&lang=${lang}&w=1920`);
      // The screenshot forces a full-size paint; keep a representative frame from each group.
      const group = catalog.groups.find((name) => (catalog.groupIds[name] ?? []).includes(id));
      const first = catalog.groupIds[group]?.[0] === id;
      const screenshot = await page.screenshot();
      if (first) writeFileSync(join(dir, `full-${lang}-${id}.png`), screenshot);
      const lines = await page.evaluate(() => window.__lines());
      // Fonts and rotated labels may paint a few pixels outside their model frames. Flag ink
      // that reaches beyond the slide or extends far enough to risk a visible collision.
      const overflow = lines.filter((line) => {
        const [x, y, w, h] = line.ink;
        return line.outX > 60 || line.outY > 60 || x < -3 || y < -3 || x + w > 1923 || y + h > 1083;
      });
      if (overflow.length) findings.push({ id, lang, overflow });
      const subject = await page.evaluate(() => window.__subject());
      if (subject.missing?.length) findings.push({ id, lang, missingAssets: subject.missing });
      if ((index + 1) % 25 === 0) process.stdout.write(`${lang}: ${index + 1}/${ids.length}\n`);
    }
  }
} finally {
  await browser.close();
}
writeFileSync(join(dir, 'findings.json'), JSON.stringify(findings, null, 2));
process.stdout.write(
  `Reviewed ${ids.length} designs in Hebrew and English at gallery and full size. Findings: ${findings.length}\n`,
);
if (findings.length) process.exitCode = 1;
