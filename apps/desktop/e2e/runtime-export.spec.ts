import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import type { ExportResult } from '../../../packages/html-export/src';
import {
  differingShare,
  element,
  idle,
  isVisible,
  openDeck,
  setState,
  stateOf,
  stepAndRead,
  watchErrors,
  type ShowWindow,
} from './runtime-helpers';

// The HTML export (WG9-T07, T08, T10, T11): decks are exported from the dev page, written to
// disk, and opened as files, with no server behind them.
//
// The files stay in packages/html-export/test-results (ignored by git). `reference-deck.html` is
// the review file: the reference deck with its transitions and animations.

const OUT = fileURLToPath(new URL('../../../packages/html-export/test-results/', import.meta.url));

interface Exported {
  result: ExportResult;
  file: string;
  url: string;
}

async function exportDeck(browser: Browser, deck: string, name: string): Promise<Exported> {
  const page = await browser.newPage();
  try {
    await openDeck(page, deck);
    const result = await page.evaluate(() => {
      const dev = (window as ShowWindow).slidrDev;
      if (!dev) throw new Error('the dev page is not ready');
      return dev.exportDeck();
    });
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, name);
    writeFileSync(file, result.html);
    return { result, file, url: pathToFileURL(file).href };
  } finally {
    await page.close();
  }
}

/** Opens an exported file and waits for its player. Returns the requests that left the file. */
async function openFile(page: Page, url: string): Promise<string[]> {
  const outside: string[] = [];
  page.on('request', (request) => {
    if (!/^(file|data|blob|about):/.test(request.url())) outside.push(request.url());
  });
  await page.goto(url);
  await page.waitForSelector('html.slidr-ready');
  return outside;
}

test.describe('the reference deck', () => {
  test.describe.configure({ mode: 'serial' });
  let exported: Exported;

  test.beforeAll(async ({ browser }) => {
    exported = await exportDeck(browser, 'reference', 'reference-deck.html');
  });

  test('is one file with everything inside', async ({ page }) => {
    const noErrors = watchErrors(page);
    const { result } = exported;
    expect(result.slides).toBe(9);
    // The deck's video has no file behind it in the fixtures; nothing else is missing.
    expect(result.warnings).toEqual(['Asset clip.mp4 could not be read']);
    expect(result.html).not.toMatch(/blob:|https?:\/\/localhost/);
    expect(result.html).not.toMatch(/<link\b|<script[^>]+src=/);
    expect(result.bytes).toBeLessThan(4 * 1024 * 1024);

    const outside = await openFile(page, exported.url);
    await idle(page);
    expect(outside).toEqual([]);
    expect(await stateOf(page)).toEqual({ slide: 0, step: 0 });
    const doc = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      title: document.title,
      slides: document.querySelectorAll('.slidr-stage > section.slide').length,
      fonts: Array.from(document.fonts).filter((f) => f.status === 'loaded').length,
    }));
    expect(doc).toMatchObject({ lang: 'en', dir: 'ltr', slides: 9 });
    expect(doc.title).toContain('reference deck');
    expect(doc.fonts).toBeGreaterThan(0);
    noErrors();
  });

  test('pictures are WebP at the size they are shown', () => {
    const images = exported.result.assets.filter((a) => a.width);
    expect(images.map((a) => a.mime)).toEqual(['image/webp', 'image/webp', 'image/webp']);
    for (const image of images) expect(image.bytes).toBeLessThan(image.originalBytes);
    const widths = images.map((a) => a.width).sort((a, b) => (a ?? 0) - (b ?? 0));
    // The portrait is 1200 wide and shown 400 wide at most: two pixels per slide pixel are kept.
    // The landscape is shown cropped to a quarter, so it needs every pixel it has.
    expect(widths).toEqual([800, 1440, 2400]);
  });

  test('text is real text: headings, lists, and the right direction', async ({ page }) => {
    await openFile(page, exported.url);
    const text = await page.evaluate(() => {
      const slides = document.querySelectorAll('section.slide');
      const en = slides[2];
      const he = slides[3];
      return {
        h1: en?.querySelector('h1')?.textContent,
        style: en?.querySelector('h1')?.getAttribute('style')?.includes('font-size: 72px'),
        items: en?.querySelectorAll('li').length,
        lists: en?.querySelectorAll('ul, ol').length,
        heDir: he?.querySelector('h1')?.getAttribute('dir'),
        label: en?.getAttribute('aria-label'),
      };
    });
    expect(text).toEqual({
      h1: 'Text rendering: styles, marks and lists',
      style: true,
      items: 8,
      lists: 1,
      heDir: 'rtl',
      label: 'Text',
    });
  });

  test('every slide looks as it does in the editor', async ({ browser }) => {
    test.slow();
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const still = await context.newPage();
    const live = await context.newPage();
    const file = await context.newPage();
    await openDeck(live, 'reference', '&bare');
    await openFile(file, exported.url);
    const settled = async (page: Page) => {
      await page.bringToFront();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
    };
    const shoot = async (page: Page, slide: number, step: number, stage: string) => {
      await setState(page, slide, step);
      await settled(page);
      return page.locator(stage).screenshot();
    };
    const shares: Record<string, number> = {};
    for (let slide = 0; slide < 9; slide++) {
      // The end of the slide, exits included: the file against the same player on live slides.
      const a = await shoot(live, slide, 999, '[data-testid="viewport"] > div');
      const b = await shoot(file, slide, 999, '.slidr-stage');
      shares[`${slide} played`] = await differingShare(file, a, b);

      // Everything in and nothing out yet: the file against the slide as the renderer draws it,
      // with no runtime near it (RND-01). In this deck the exits are the last click of a slide.
      const entered = await file.evaluate((index) => {
        const section = document.querySelectorAll<HTMLElement>('section.slide')[index];
        const timeline = JSON.parse(section?.dataset.timeline ?? '[]') as { category: string }[];
        const clicks = (window as ShowWindow).slidr?.steps(index) ?? 0;
        return timeline.some((s) => s.category === 'exit') ? clicks - 1 : clicks;
      }, slide);
      await still.goto(`/dev/slides.html?deck=reference&slide=${slide}&mode=present`);
      await still.waitForSelector('html[data-ready="true"]');
      await settled(still);
      const c = await still.locator('.slidr-slide').screenshot();
      const d = await shoot(file, slide, entered, '.slidr-stage');
      shares[`${slide} drawn`] = await differingShare(file, c, d);
    }
    // Re-encoded pictures differ in a few pixels; anything misplaced or missing differs in many.
    // (Measured: at most 0.012% of the pixels. A blank 400x200 frame is 1.6%.)
    for (const [name, share] of Object.entries(shares)) {
      expect(share, `slide ${name}`).toBeLessThan(0.001);
    }
    await context.close();
  });

  test('keys, steps and the address work in the file', async ({ page }) => {
    const noErrors = watchErrors(page);
    await openFile(page, exported.url);
    await idle(page);
    const steps = await page.evaluate(() => (window as ShowWindow).slidr?.steps());
    expect(steps).toBe(2);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    expect(await stateOf(page)).toEqual({ slide: 0, step: 2 });
    await page.keyboard.press('ArrowRight');
    expect(await stateOf(page)).toEqual({ slide: 1, step: 0 });
    expect(new URL(page.url()).hash).toBe('#2');
    await page.keyboard.press('End');
    expect(await stateOf(page)).toEqual({ slide: 8, step: 0 });
    await page.keyboard.press('Home');
    expect(await stateOf(page)).toEqual({ slide: 0, step: 0 });
    await page.goto(`${exported.url}#4`);
    await page.waitForSelector('html.slidr-ready');
    expect(await stateOf(page)).toEqual({ slide: 3, step: 0 });
    await page.locator('.slidr-viewport').click({ position: { x: 400, y: 600 } });
    expect(await stateOf(page)).toEqual({ slide: 3, step: 1 });
    noErrors();
  });

  test('the file plays the same animations as the editor', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const live = await context.newPage();
    const file = await context.newPage();
    await openDeck(live, 'reference', '&bare');
    await openFile(file, exported.url);
    // A step with a wipe, fly-ins and a rise; then the push into the next slide.
    for (const [slide, step] of [
      [1, 1],
      [0, 2],
    ] as const) {
      await setState(live, slide, step);
      await setState(file, slide, step);
      const inEditor = await stepAndRead(live);
      const inFile = await stepAndRead(file);
      expect(inFile.length).toBeGreaterThan(1);
      expect(inFile).toEqual(inEditor);
    }
    await context.close();
  });

  test('without scripts the slides are a page to scroll', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(exported.url);
    const shown = await page
      .locator('section.slide')
      .evaluateAll((slides) => slides.filter((s) => getComputedStyle(s).display !== 'none').length);
    expect(shown).toBe(9);
    await expect(page.locator('section.slide h1').first()).toBeVisible();
    await context.close();
  });
});

test('an RTL deck exports as RTL, without its hidden slide', async ({ browser, page }) => {
  const noErrors = watchErrors(page);
  const exported = await exportDeck(browser, 'probe-rtl', 'probe-rtl.html');
  expect(exported.result.slides).toBe(3);
  await openFile(page, exported.url);
  await idle(page);
  const doc = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    slides: Array.from(document.querySelectorAll('section.slide'), (s) =>
      s.getAttribute('data-slide'),
    ),
  }));
  expect(doc).toEqual({
    lang: 'he',
    dir: 'rtl',
    slides: ['s_probe_a', 's_probe_b', 's_probe_c'],
  });
  // `start` is rightwards here: the box that flies towards the start comes from the left.
  const boxes = await stepAndRead(page);
  const box = boxes.find((a) => a.id === 'p_box1');
  expect(parseFloat(String(box?.keyframes[0]?.translate))).toBeLessThan(0);
  await idle(page);
  expect(await isVisible(page, element('p_box1'))).toBe(true);
  // The link to the first slide works in the file too.
  await setState(page, 2, 0);
  await page.locator(element('r_home')).click();
  expect(await stateOf(page)).toEqual({ slide: 0, step: 0 });
  noErrors();
});

test('the review files: the reference deck in both directions', async ({ browser, page }) => {
  // The RTL twin of the review file, for looking at how start and end turn around.
  const exported = await exportDeck(browser, 'reference-rtl', 'reference-deck-rtl.html');
  expect(exported.result.slides).toBe(9);
  await openFile(page, exported.url);
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
});
