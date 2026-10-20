// TEMPORARY review harness: sample slides moved between templates, judged by the real lint.
//   node scripts/zz-switch.mjs "<query>" [shot.png]
// The query is that of /dev/zz-switch.html (ids, dir, kinds, pairs, lang, fixtures, show).
// With a file name and `show=1`, the moved slides are drawn into it. Needs the dev server on
// :1420, and `zz-probe-templates.mjs` run first.
import { chromium } from '@playwright/test';

const [query = '', shot] = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.error(`page error: ${error.message}`));
await page.goto(`http://localhost:1420/dev/zz-switch.html?${query}`);
await page.waitForSelector('html[data-ready="true"]', { timeout: 2_400_000 });
await page.waitForTimeout(300);
const lines = await page.evaluate(() => window.__switch ?? []);
if (shot) await page.locator('#sheet').screenshot({ path: shot });
const errors = lines.filter((line) => / \(error\)/.test(line));
console.log(`${errors.length} errors, ${lines.length - errors.length} other findings`);
for (const line of errors) console.log(`  ERROR ${line}`);
await browser.close();
