// Pictures of the reference decks, for review (not kept in git):
//   node docs/reference-decks/scripts/shots.mjs [deck ...]      the decks
//   node docs/reference-decks/scripts/shots.mjs index [deck ...] the index page, deck by deck
// Each slide at 1920x1080 and one contact sheet per deck, under
// apps/desktop/test-results/templates/reference/.
/* global document */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { deckFiles, readDeck, root } from './decks.mjs';

const out = join(root, '..', '..', 'apps', 'desktop', 'test-results', 'templates', 'reference');
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2);
const index = args[0] === 'index';
const wanted = index ? args.slice(1) : args;
const files = deckFiles().filter((file) => wanted.length === 0 || wanted.includes(readDeck(file).id));

const browser = await chromium.launch({ channel: 'msedge' });

if (index) {
  // The index page as the user sees it: originals and rebuilt slides side by side.
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1200 },
    deviceScaleFactor: 2,
  });
  await page.goto(pathToFileURL(join(root, 'index.html')).href);
  await page.evaluate(() => document.fonts.ready);
  for (const file of files) {
    const deck = readDeck(file);
    const section = page.locator(`section.deck-${deck.id.replace(/\W/g, '-')}`);
    if ((await section.count()) === 0) continue;
    // Pair by pair at twice the size, so that a rebuilt slide can be read next to its original.
    const pairs = section.locator('.pair');
    const count = await pairs.count();
    mkdirSync(join(out, `index-${deck.id}`), { recursive: true });
    for (let i = 0; i < count; i++) {
      const name = String(i + 1).padStart(2, '0');
      await pairs.nth(i).screenshot({ path: join(out, `index-${deck.id}`, `${name}.png`) });
    }
    console.log(`index: ${deck.id}, ${count} pairs`);
  }
  await browser.close();
  process.exit(0);
}

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
