// TEMPORARY review harness: /dev/zz-tpl.html as PNG files.
//   node scripts/zz-shot.mjs <outDir> <id> <lang> [slide numbers, 1-based ...] [--dir <probe>] [--tag <name>]
// With no slide numbers, the sheet of every finished sample slide.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const [outDir, id, lang, ...slides] = args.filter(
  (arg, i) => !arg.startsWith('--') && !(args[i - 1] ?? '').startsWith('--'),
);
const dir = option('--dir') ?? 'zz-probe';
const tag = option('--tag') ?? '';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (error) => console.error(`page error: ${error.message}`));
const open = async (query) => {
  await page.goto(`http://localhost:1420/dev/zz-tpl.html?id=${id}&lang=${lang}&dir=${dir}${query}`);
  await page.waitForSelector('html[data-ready="true"]', { timeout: 60_000 });
  await page.waitForTimeout(250);
};
if (slides.length === 0) {
  await open('');
  const file = join(outDir, `${id}-${lang}${tag}-sheet.png`);
  await page.locator('#sheet').screenshot({ path: file });
  console.log(file);
}
for (const slide of slides) {
  await open(`&slide=${slide}`);
  const file = join(outDir, `${id}-${lang}${tag}-${slide}.png`);
  await page.screenshot({ path: file, clip: { x: 0, y: 0, width: 1920, height: 1080 } });
  console.log(file);
}
await browser.close();
