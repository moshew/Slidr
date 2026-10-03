// Pictures of the reference decks, for review (not kept in git):
//   node docs/reference-decks/scripts/shots.mjs [deck ...]
// Each slide at 1920x1080 and one contact sheet per deck, under
// apps/desktop/test-results/templates/reference/.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { deckFiles, readDeck, root } from './decks.mjs';

const out = join(root, '..', '..', 'apps', 'desktop', 'test-results', 'templates', 'reference');
const wanted = process.argv.slice(2);
const files = deckFiles().filter((file) => wanted.length === 0 || wanted.includes(readDeck(file).id));

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const file of files) {
  const deck = readDeck(file);
  const dir = join(out, deck.id);
  mkdirSync(dir, { recursive: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(pathToFileURL(join(root, file)).href);
  await page.evaluate(() => document.fonts.ready);
  const slides = page.locator('section.slide');
  const count = await slides.count();
  for (let i = 0; i < count; i++) {
    const slide = slides.nth(i);
    const id = (await slide.getAttribute('id')) ?? `s${i + 1}`;
    await slide.scrollIntoViewIfNeeded();
    await slide.screenshot({ path: join(dir, `${id}.png`) });
  }
  // The contact sheet: the deck page itself in a narrow window, three slides to a row.
  await page.setViewportSize({ width: 1980, height: 1200 });
  await page.addStyleTag({
    content:
      'body{display:grid;grid-template-columns:repeat(3,640px);gap:20px;padding:20px;width:1960px}' +
      '.frame{width:640px!important;margin:0!important}' +
      '.frame>.slide{transform:scale(0.333333)!important}',
  });
  await page.screenshot({ path: join(out, `${deck.id}.png`), fullPage: true });
  console.log(`${deck.id}: ${count} slides`);
}
await browser.close();
