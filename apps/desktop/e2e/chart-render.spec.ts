import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import type { Deck } from '@slidr/model';
import { openApp, setCurrentSlide } from './runtime-app-helpers';
import { openDeck, type ShowWindow } from './runtime-helpers';

// How a chart is drawn (WG6-T05, CHT-01, CHT-04, CHT-06, RND-01): the eight chart types in a
// left-to-right and in a right-to-left deck, the same chart in the five uses of the renderer, and
// the chart library staying out of a deck that has no chart.
//
// The pictures of the comparison are kept in test-results/charts/uses, outside Playwright's folder.

const OUT = fileURLToPath(new URL('../test-results/charts/uses/', import.meta.url));
const FULL = { width: 1920, height: 1080 } as const;

/** The chart deck's slides that hold the eight types (packages/renderer/src/fixtures/chartDeck.ts). */
const SLIDES = [
  { id: 's_chart_cartesian', index: 0, charts: 4 },
  { id: 's_chart_round', index: 1, charts: 4 },
] as const;

const chartBoxes = (root: Locator) => root.locator('[data-slidr-chart] [data-slidr-chart-box] svg');

/** The reference: one slide in the editor's mode at its logical size. */
async function openSlide(page: Page, deck: string, index: number, mode = 'edit'): Promise<Locator> {
  await page.goto(`/dev/slides.html?deck=${deck}&slide=${index}&mode=${mode}`);
  await page.waitForSelector('html[data-ready="true"]');
  return page.locator('[data-slide-id]');
}

interface Picture {
  png: Buffer;
  /** What every chart of the slide is drawn from: its SVG, without the ids of the instance. */
  drawn: string[];
}

/**
 * A picture of a slide wherever it is shown, `width` device pixels wide: the page is opened once
 * to learn how wide the slide is on the screen, and again at the device scale that makes it
 * `width`. A chart is vectors, so every use can be pictured at one size and compared.
 */
async function picture(
  browser: Browser,
  open: (page: Page) => Promise<Locator>,
  width: number,
  viewport: { width: number; height: number } = FULL,
): Promise<Picture> {
  const probe = await browser.newPage({ viewport });
  const shown = (await (await open(probe)).boundingBox())?.width;
  await probe.close();
  if (!shown) throw new Error('the slide is not on the screen');
  const context = await browser.newContext({ viewport, deviceScaleFactor: width / shown });
  try {
    const page = await context.newPage();
    const slide = await open(page);
    await expect(chartBoxes(slide).first()).toBeVisible();
    const drawn = await chartBoxes(slide).evaluateAll((svgs) =>
      // The library numbers its clip paths by instance: `zr12-c0` in one, `zr3-c0` in another.
      svgs.map((svg) => svg.outerHTML.replace(/zr[0-9]+-/g, 'zr-')),
    );
    return { png: await slide.screenshot(), drawn };
  } finally {
    await context.close();
  }
}

/**
 * How far two pictures of one slide are from each other, over the area they share (a picture of
 * a scaled box may be a pixel larger):
 *
 * - `share`: the pixels that differ clearly at the same place;
 * - `soft`: the same after both pictures were blurred over seven pixels. A scaled box does not
 *   sit on whole pixels, and text under a scale is smoothed another way, so in a sharp picture
 *   every edge and every letter may differ; blurred, only what is missing, misplaced or in
 *   another colour still does;
 * - `ink`: the pixels of the first picture that are not white.
 */
async function compare(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([first, second]) => {
      const load = async (base64: string) => {
        const image = new Image();
        image.src = `data:image/png;base64,${base64}`;
        await image.decode();
        return image;
      };
      const [x, y] = [await load(first ?? ''), await load(second ?? '')];
      const w = Math.min(x.naturalWidth, y.naturalWidth);
      const h = Math.min(x.naturalHeight, y.naturalHeight);
      const data = (image: HTMLImageElement, blur: number) => {
        const context = new OffscreenCanvas(w, h).getContext('2d');
        if (!context) throw new Error('no 2d context');
        // White behind the picture, so that a blur at the edge mixes with paper, not with nothing.
        context.fillStyle = '#fff';
        context.fillRect(0, 0, w, h);
        if (blur) context.filter = `blur(${blur}px)`;
        context.drawImage(image, 0, 0);
        return context.getImageData(0, 0, w, h).data;
      };
      const differing = (p: Uint8ClampedArray, q: Uint8ClampedArray, limit: number) => {
        let count = 0;
        for (let i = 0; i < p.length; i += 4) {
          const delta =
            Math.abs((p[i] ?? 0) - (q[i] ?? 0)) +
            Math.abs((p[i + 1] ?? 0) - (q[i + 1] ?? 0)) +
            Math.abs((p[i + 2] ?? 0) - (q[i + 2] ?? 0));
          if (delta > limit) count++;
        }
        return count / (w * h);
      };
      const sharp = data(x, 0);
      let ink = 0;
      for (let i = 0; i < sharp.length; i += 4) {
        if ((sharp[i] ?? 0) + (sharp[i + 1] ?? 0) + (sharp[i + 2] ?? 0) < 720) ink++;
      }
      return {
        share: differing(sharp, data(y, 0), 96),
        soft: differing(data(x, 3.5), data(y, 3.5), 96),
        ink: ink / (w * h),
      };
    },
    [a.toString('base64'), b.toString('base64')],
  );
}

function keep(name: string, png: Buffer): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.png`), png);
}

// ---------------------------------------------------------------------------------------------

test.describe('the eight chart types', () => {
  test.use({ viewport: FULL });

  for (const deck of ['charts', 'charts-rtl']) {
    for (const slide of SLIDES) {
      test(`${deck}, ${slide.id}`, async ({ page }) => {
        const root = await openSlide(page, deck, slide.index);
        await expect(chartBoxes(root)).toHaveCount(slide.charts);
        // Nothing is left to draw: no chart reports a failure, and every one has marks in it.
        await expect(root.locator('[data-slidr-chart-error]')).toHaveCount(0);
        for (const svg of await chartBoxes(root).all()) {
          expect(await svg.locator('path').count()).toBeGreaterThan(3);
        }
        await expect(root).toHaveScreenshot(`${deck}-${slide.id}.png`, { maxDiffPixels: 200 });
      });
    }
  }

  test('a right-to-left deck starts its categories on the right and reads the values there', async ({
    page,
  }) => {
    const texts = async (deck: string) => {
      const root = await openSlide(page, deck, 0);
      const column = root.locator('[data-element-id="e_chart_column"] svg text');
      return column.evaluateAll((nodes) =>
        nodes.map((node) => ({
          text: Array.from(node.textContent ?? '')
            .filter((char) => {
              const code = char.codePointAt(0) ?? 0;
              // The isolates around a right-to-left label are not part of what it says.
              return code < 0x2066 || code > 0x2069;
            })
            .join(''),
          x: node.getBoundingClientRect().x,
        })),
      );
    };
    const ltr = await texts('charts');
    const rtl = await texts('charts-rtl');
    const at = (all: typeof ltr, text: string) => all.find((t) => t.text === text)?.x ?? NaN;
    // Q1 before Q3 in the reading direction; the axis numbers on the side the reading starts.
    expect(at(ltr, 'Q1')).toBeLessThan(at(ltr, 'Q3'));
    expect(at(rtl, 'Q1')).toBeGreaterThan(at(rtl, 'Q3'));
    expect(at(ltr, '25')).toBeLessThan(at(ltr, 'Q1'));
    expect(at(rtl, '25')).toBeGreaterThan(at(rtl, 'Q1'));
  });
});

// ---------------------------------------------------------------------------------------------

test.describe('one chart, five uses (RND-01)', () => {
  test.describe.configure({ mode: 'serial' });
  // Every use is opened twice, some of them the whole app.
  test.setTimeout(180_000);

  for (const deck of ['charts', 'charts-rtl']) {
    for (const slide of SLIDES) {
      test(`${deck}, ${slide.id}: Stage, thumbnail, capture, show and exported file`, async ({
        browser,
        page,
      }) => {
        const name = `${deck}-${slide.id}`;
        const reference = await picture(browser, (p) => openSlide(p, deck, slide.index), 1920);
        keep(`${name}-0-reference`, reference.png);
        // A thumbnail is too small to bring to 1920: it is compared at a quarter of that.
        const small = await picture(browser, (p) => openSlide(p, deck, slide.index), 480);

        const inApp = async (p: Page) => {
          await openApp(p, { deck, lang: 'en' });
          await setCurrentSlide(p, slide.id);
          // Nothing selected, and the pointer off the slide: only the slide is in the picture.
          await p.evaluate(() => window.slidr!.selection.getState().selectElements([]));
          await p.mouse.move(2, 2);
        };
        const uses: Record<string, { picture: Picture; against: Picture }> = {};

        uses.stage = {
          against: reference,
          picture: await picture(
            browser,
            async (p) => {
              await inApp(p);
              return p
                .getByTestId('stage-frame')
                .locator(`.slidr-slide[data-slide-id="${slide.id}"]`);
            },
            1920,
            { width: 1920, height: 1032 },
          ),
        };

        uses.thumbnail = {
          against: small,
          picture: await picture(
            browser,
            async (p) => {
              await inApp(p);
              return p
                .getByTestId('filmstrip')
                .locator(`.slidr-slide[data-slide-id="${slide.id}"]`);
            },
            480,
            { width: 1920, height: 1032 },
          ),
        };

        // The capture window (ADR-003): the page Rust screenshots, with its calls to Rust recorded.
        // It is handed the deck as data, as Rust hands it: the fixture, read off a page of the app.
        await openSlide(page, deck, slide.index);
        const fixture = await page.evaluate(
          async (dir) => {
            const path = `${location.origin}/@id/@slidr/renderer/fixtures`;
            const { chartDeck } = (await import(/* @vite-ignore */ path)) as {
              chartDeck: (dir: string) => unknown;
            };
            return chartDeck(dir);
          },
          deck.endsWith('-rtl') ? 'rtl' : 'ltr',
        );
        const one = (fixture as Deck).slides.find((s) => s.id === slide.id);
        uses.capture = {
          against: reference,
          picture: await picture(
            browser,
            async (p) => {
              await p.addInitScript(() => {
                const calls: { cmd: string; args: unknown }[] = [];
                Object.assign(window, {
                  captureCalls: calls,
                  __TAURI_INTERNALS__: {
                    invoke: (cmd: string, args: unknown) => {
                      calls.push({ cmd, args });
                      return Promise.resolve(null);
                    },
                    convertFileSrc: (path: string) => path,
                    transformCallback: () => 0,
                  },
                });
              });
              await p.goto('/capture.html');
              const calls = () =>
                p.evaluate(
                  () =>
                    (window as unknown as { captureCalls: { cmd: string; args: unknown }[] })
                      .captureCalls,
                );
              await expect
                .poll(async () => (await calls()).map((c) => c.cmd))
                .toContain('capture_page_loaded');
              await p.evaluate((request) => window.__slidrCapture!(1, request as never), {
                deck: { ...(fixture as Deck), slides: [one] },
                assetsDir: null,
              });
              // `capture_ready` is when Rust takes the picture: the chart has to be there by then.
              await expect
                .poll(async () => (await calls()).find((c) => c.cmd === 'capture_ready')?.args, {
                  timeout: 20_000,
                })
                .toMatchObject({ id: 1, error: null });
              return p.locator('[data-slide-id]');
            },
            1920,
            { width: 960, height: 540 },
          ),
        };

        const atRest = async (p: Page) => {
          await p.evaluate((index) => {
            const w = window as ShowWindow;
            (w.slidrDev?.player ?? w.slidr)!.setState({ slide: index, step: 0 });
          }, slide.index);
          return p.locator(`.slidr-slide[data-slide-id="${slide.id}"]`);
        };

        uses.show = {
          against: reference,
          picture: await picture(
            browser,
            async (p) => {
              await openDeck(p, deck, '&bare');
              return atRest(p);
            },
            1920,
          ),
        };

        // The exported file, from the disk.
        await openDeck(page, deck);
        const html = await page.evaluate(async () => {
          const dev = (window as ShowWindow).slidrDev;
          if (!dev) throw new Error('the dev page is not ready');
          return (await dev.exportDeck()).html;
        });
        mkdirSync(OUT, { recursive: true });
        const file = join(OUT, `${deck}.html`);
        writeFileSync(file, html);
        uses.file = {
          against: reference,
          picture: await picture(
            browser,
            async (p) => {
              await p.goto(pathToFileURL(file).href);
              await p.waitForSelector('html.slidr-ready');
              // The live chart has taken the place of the picture the export wrote.
              await p.waitForFunction(() =>
                Array.from(document.querySelectorAll('[data-slidr-chart]')).every((node) =>
                  node.querySelector('[data-slidr-chart-box][_echarts_instance_]'),
                ),
              );
              return atRest(p);
            },
            1920,
          ),
        };

        const shares: Record<string, { share: number; soft: number }> = {};
        for (const [use, { picture: shown, against }] of Object.entries(uses)) {
          keep(`${name}-${use}`, shown.png);
          // Every use draws the charts from the same instructions, to the last digit.
          expect(shown.drawn, use).toHaveLength(slide.charts);
          expect(shown.drawn, use).toEqual(reference.drawn);
          const result = await compare(page, against.png, shown.png);
          // The reference is not an empty slide: a good part of it is ink.
          expect(result.ink, `${use}: the reference`).toBeGreaterThan(0.03);
          shares[use] = { share: result.share, soft: result.soft };
        }
        console.log(`${name}: differing pixels by use`, JSON.stringify(shares));
        // The same page at the same place: the pictures are one, pixel for pixel.
        expect(shares.show?.share).toBeLessThan(0.0005);
        expect(shares.file?.share).toBeLessThan(0.0005);
        // A scaled box does not sit on whole pixels and its text is smoothed another way, so its
        // edges and letters differ by a pixel. Nothing is missing, misplaced or in another colour.
        for (const use of ['stage', 'thumbnail', 'capture']) {
          expect(shares[use]?.soft, use).toBeLessThan(0.001);
          expect(shares[use]?.share, use).toBeLessThan(0.03);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------------------------

test.describe('the chart library is loaded by the first chart', () => {
  const ofLibrary = (url: string) =>
    /echarts|zrender|\/chart\/(engine|bundle\.generated)/.test(url);

  test('a deck without a chart never asks for it; a chart on a slide does', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (request) => {
      if (ofLibrary(request.url())) asked.push(request.url());
    });
    // The app with a deck that has every element type but no chart on the slide shown.
    await openApp(page, { deck: 'probe', lang: 'en' });
    await page.waitForTimeout(500);
    expect(asked).toEqual([]);

    await openApp(page, { deck: 'charts', lang: 'en' });
    await expect(
      chartBoxes(page.getByTestId('stage-frame').locator('.slidr-slide')).first(),
    ).toBeVisible();
    expect(asked.some((url) => /chart\/engine/.test(url))).toBe(true);
    // The script of an exported file is another matter: the editor never loads it to draw.
    expect(asked.some((url) => /chart\/bundle\.generated/.test(url))).toBe(false);
  });
});
