import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  expect,
  firefox,
  test,
  webkit,
  type Browser,
  type BrowserType,
  type Page,
} from '@playwright/test';
import { differingShare, openDeck, type ShowWindow } from './runtime-helpers';

// The exported file in the other browser engines (the acceptance of WG9: "opens in Chrome, Edge,
// Firefox and Safari without a network, with animations"). The reference deck is exported by the
// app's own engine (Edge), written to disk, and opened from the disk in Playwright's Firefox and
// WebKit builds; WebKit is the engine of Safari, not Safari itself.
//
// The browsers are not part of the repository's set-up: `pnpm exec playwright install firefox
// webkit` (about 510 MB). A browser that is not installed skips its tests.

const OUT = fileURLToPath(new URL('../../../packages/html-export/test-results/', import.meta.url));
const SHOTS = fileURLToPath(new URL('../test-results/present/browsers/', import.meta.url));
const SLIDES = 9;
const VIEW = { width: 1920, height: 1080 };

const engines: [string, BrowserType][] = [
  ['firefox', firefox],
  ['webkit', webkit],
];

interface Probe {
  lang: string;
  dir: string;
  slides: number;
  headings: number;
  /** Elements with a shadow root: `html` elements without scripts are declarative shadow DOM. */
  shadowRoots: number;
  /** Text inside those shadow roots: empty when the browser did not attach them. */
  shadowText: number;
  fontsLoaded: number;
}

const probe = (page: Page): Promise<Probe> =>
  page.evaluate(async () => {
    await document.fonts.ready;
    const hosts = Array.from(document.querySelectorAll('.slidr-stage *')).filter(
      (el) => el.shadowRoot,
    );
    return {
      lang: document.documentElement.lang,
      dir: document.documentElement.dir,
      slides: document.querySelectorAll('.slidr-stage > section.slide').length,
      headings: document.querySelectorAll('section.slide h1, section.slide h2').length,
      shadowRoots: hosts.length,
      shadowText: hosts.reduce((n, el) => n + (el.shadowRoot?.textContent?.trim().length ?? 0), 0),
      fontsLoaded: Array.from(document.fonts).filter((f) => f.status === 'loaded').length,
    };
  });

/** The box of every element of a slide, in slide pixels, by element id. */
const boxes = (page: Page, slide: number): Promise<Record<string, number[]>> =>
  page.evaluate((index) => {
    const section = document.querySelectorAll<HTMLElement>('section.slide')[index];
    const root = section?.querySelector('[data-slide-id]');
    if (!section || !root) return {};
    const origin = root.getBoundingClientRect();
    const scale = origin.width / 1920;
    const out: Record<string, number[]> = {};
    for (const el of Array.from(section.querySelectorAll<HTMLElement>('[data-element-id]'))) {
      const r = el.getBoundingClientRect();
      out[el.dataset.elementId ?? ''] = [
        (r.left - origin.left) / scale,
        (r.top - origin.top) / scale,
        r.width / scale,
        r.height / scale,
      ].map((n) => Math.round(n));
    }
    return out;
  }, slide);

const setState = (page: Page, slide: number, step: number) =>
  page.evaluate(
    (state) => {
      (window as ShowWindow).slidr?.setState(state);
    },
    { slide, step },
  );

/** One step forward, and what it started: which elements animate, when and for how long. */
const stepped = (page: Page) =>
  page.evaluate(() => {
    (window as ShowWindow).slidr?.next();
    return document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => {
        const effect = a.effect as KeyframeEffect;
        const owner = effect.target?.closest('[data-element-id], [data-slide]');
        return [
          owner?.getAttribute('data-element-id') ?? owner?.getAttribute('data-slide') ?? '',
          Number(effect.getTiming().delay),
          Number(effect.getTiming().duration),
          effect.getKeyframes().length,
        ].join(' ');
      })
      .sort();
  });

async function settled(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
}

test.describe('the exported file in other browsers', () => {
  test.describe.configure({ mode: 'serial' });
  let url: string;
  let reference: Page;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await openDeck(page, 'reference');
    const html = await page.evaluate(async () => {
      const dev = (window as ShowWindow).slidrDev;
      if (!dev) throw new Error('the dev page is not ready');
      return (await dev.exportDeck()).html;
    });
    await page.close();
    mkdirSync(OUT, { recursive: true });
    mkdirSync(SHOTS, { recursive: true });
    const file = join(OUT, 'reference-deck-browsers.html');
    writeFileSync(file, html);
    url = pathToFileURL(file).href;
    // The same file in the engine that wrote it: what the others are held against.
    const context = await browser.newContext({ viewport: VIEW });
    reference = await context.newPage();
    await reference.goto(url);
    await reference.waitForSelector('html.slidr-ready');
    await settled(reference);
  });

  test.afterAll(async () => {
    await reference?.context().close();
  });

  for (const [name, type] of engines) {
    test(`${name}: opens from the disk, without the network, and plays`, async () => {
      test.slow();
      let engine: Browser;
      try {
        // Not the channel of the config: that one names the app's engine, Edge.
        engine = await type.launch({ channel: undefined });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Anything but a missing browser is a failure of the test, not a reason to skip it.
        expect(message).toMatch(/Executable doesn't exist|playwright install/);
        test.skip(true, `${name} is not installed: pnpm exec playwright install ${name}`);
        return;
      }
      const page = await engine.newPage({ viewport: VIEW });
      const errors: string[] = [];
      const outside: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => {
        if (!/^(file|data|blob|about):/.test(request.url())) outside.push(request.url());
      });
      await page.goto(url);
      await page.waitForSelector('html.slidr-ready');
      await settled(page);

      // The document: its language, its slides, real headings, and the content of `html`
      // elements, which is declarative shadow DOM.
      const here = await probe(page);
      const there = await probe(reference);
      expect(here).toMatchObject({
        lang: there.lang,
        dir: there.dir,
        slides: SLIDES,
        headings: there.headings,
        shadowRoots: there.shadowRoots,
        shadowText: there.shadowText,
      });
      expect(here.fontsLoaded).toBeGreaterThan(0);

      // Keys and steps, and the same animations as in the engine that wrote the file.
      await setState(page, 0, 0);
      await setState(reference, 0, 0);
      await page.keyboard.press('ArrowRight');
      expect(await page.evaluate(() => (window as ShowWindow).slidr?.state)).toEqual({
        slide: 0,
        step: 1,
      });
      for (const [slide, step] of [
        [1, 1],
        [0, 2],
      ] as const) {
        await setState(page, slide, step);
        await setState(reference, slide, step);
        const played = await stepped(page);
        expect(played.length).toBeGreaterThan(1);
        expect(played).toEqual(await stepped(reference));
      }

      // Every slide at its end: laid out as in the engine that wrote it, and a picture to look at.
      const report: Record<string, { moved: string[]; differing: string }> = {};
      for (let slide = 0; slide < SLIDES; slide++) {
        await setState(page, slide, 999);
        await setState(reference, slide, 999);
        await settled(page);
        await settled(reference);
        const mine = await boxes(page, slide);
        const theirs = await boxes(reference, slide);
        const moved = Object.keys(theirs).filter((id) => {
          const a = mine[id];
          const b = theirs[id];
          return !a || !b || a.some((n, i) => Math.abs(n - (b[i] ?? 0)) > 2);
        });
        const picture = await page.locator('.slidr-stage').screenshot();
        writeFileSync(join(SHOTS, `${name}-slide-${slide + 1}.png`), picture);
        const original = await reference.locator('.slidr-stage').screenshot();
        if (name === engines[0]?.[0]) {
          writeFileSync(join(SHOTS, `edge-slide-${slide + 1}.png`), original);
        }
        const differing = await differingShare(reference, original, picture);
        report[`slide ${slide + 1}`] = { moved, differing: `${(differing * 100).toFixed(2)}%` };
        // Not a pixel match: each engine draws text and curves its own way. A slide that lost its
        // text, its pictures or its `html` elements differs in far more than this.
        expect(differing, `slide ${slide + 1}`).toBeLessThan(0.1);
        expect(moved, `slide ${slide + 1}`).toEqual([]);
      }
      console.log(`${name} ${engine.version()}: ${JSON.stringify(report)}`);
      expect(outside).toEqual([]);
      expect(errors).toEqual([]);
      await engine.close();
    });
  }
});
