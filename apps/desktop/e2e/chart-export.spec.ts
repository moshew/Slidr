import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Browser, type Page } from '@playwright/test';
import type { ExportResult } from '@slidr/html-export';
import { openApp, setCurrentSlide, show } from './runtime-app-helpers';
import {
  idle,
  isVisible,
  openDeck,
  element,
  watchErrors,
  type ShowWindow,
} from './runtime-helpers';

// Live charts in a show and in the exported file (WG6-T08, CHT-07, CHT-08, EXP-12, EXP-13): the
// chart deck is played on the dev page and exported from it, and the file is opened from the
// disk with the network off.
//
// The files stay in test-results/charts/export (ignored by git).

const OUT = fileURLToPath(new URL('../test-results/charts/export/', import.meta.url));
const VIEW = { width: 1280, height: 720 } as const;

test.use({ viewport: VIEW });

/** The chart deck's slides, by what they are for (packages/renderer/src/fixtures/chartDeck.ts). */
const STEPPED = 2;
const PLAIN = 3;

type Result = Omit<ExportResult, 'html'> & { html: string };

async function exportDeck(page: Page, deck: string, name: string) {
  await openDeck(page, deck);
  const result: Result = await page.evaluate(() => {
    const dev = (window as ShowWindow).slidrDev;
    if (!dev) throw new Error('the dev page is not ready');
    return dev.exportDeck();
  });
  mkdirSync(OUT, { recursive: true });
  const file = join(OUT, name);
  writeFileSync(file, result.html);
  return { result, file, url: pathToFileURL(file).href };
}

/** A page with the network off, and the list of what it asked for outside its own file. */
async function offlinePage(browser: Browser, options: { javaScriptEnabled?: boolean } = {}) {
  const context = await browser.newContext({ viewport: VIEW, offline: true, ...options });
  const page = await context.newPage();
  const outside: string[] = [];
  page.on('request', (request) => {
    if (!/^(file|data|blob|about):/.test(request.url())) outside.push(request.url());
  });
  return { page, outside, close: () => context.close() };
}

const player = (page: Page) =>
  page.evaluate(() => {
    const w = window as ShowWindow;
    return Boolean(w.slidrDev?.player ?? w.slidr);
  });

const goTo = (page: Page, slide: number) =>
  page.evaluate((index) => {
    const w = window as ShowWindow;
    (w.slidrDev?.player ?? w.slidr)!.goTo(index);
  }, slide);

const next = (page: Page) =>
  page.evaluate(() => {
    const w = window as ShowWindow;
    (w.slidrDev?.player ?? w.slidr)!.next();
  });

/** The heights of the columns of a column chart, in slide pixels, as they are drawn right now. */
const columnHeights = (page: Page, id: string) =>
  page.evaluate((selector) => {
    const svg = document.querySelector(`${selector} [data-slidr-chart-box] svg`);
    if (!svg) return [];
    const blue = Array.from(svg.querySelectorAll('path')).filter(
      (path) => path.getAttribute('fill') === '#2f5bea',
    );
    // The legend's mark is a small square; the columns are the tall ones.
    return blue
      .map((path) => (path as SVGGraphicsElement).getBBox())
      .filter((box) => box.width > 30)
      .map((box) => Math.round(box.height));
  }, element(id));

/** Every chart of the page is drawn by the library, not by the picture an export left. */
const chartsAreLive = (page: Page) =>
  page.waitForFunction(() =>
    Array.from(document.querySelectorAll('[data-slidr-chart]')).every((node) =>
      node.querySelector('[data-slidr-chart-box][_echarts_instance_]'),
    ),
  );

// ---------------------------------------------------------------------------------------------

test.describe('a chart in a show', () => {
  test('waits for its click, builds on it, and stands whole when the step is cut short', async ({
    page,
  }) => {
    const noErrors = watchErrors(page);
    await openDeck(page, 'charts', '&bare');
    await goTo(page, STEPPED);
    await idle(page);
    expect(await isVisible(page, element('e_chart_step'))).toBe(false);

    await next(page);
    await expect.poll(() => isVisible(page, element('e_chart_step'))).toBe(true);
    // The step is 800 ms long: a quarter of the way in the columns are not yet at full height.
    await page.waitForTimeout(200);
    const growing = await columnHeights(page, 'e_chart_step');
    await idle(page);
    await page.waitForTimeout(100);
    const whole = await columnHeights(page, 'e_chart_step');
    expect(whole).toHaveLength(4);
    expect(growing).toHaveLength(4);
    expect(Math.max(...growing)).toBeLessThan(Math.max(...whole));

    // A second click while the next chart builds ends the build: the chart is whole at once.
    await next(page);
    await next(page);
    await page.waitForTimeout(50);
    await expect.poll(() => isVisible(page, element('e_chart_step_pie'))).toBe(true);
    noErrors();
  });

  test('builds with its slide when nothing brings it in, and is whole on the way back', async ({
    page,
  }) => {
    await openDeck(page, 'charts', '&bare');
    const drawn = () =>
      page.evaluate((selector) => {
        const line = Array.from(
          document.querySelectorAll<SVGPathElement>(`${selector} [data-slidr-chart-box] svg path`),
        ).find(
          (path) =>
            path.getAttribute('stroke') === '#2f5bea' && path.getAttribute('fill') === 'none',
        );
        const clip = line?.closest('[clip-path]')?.getAttribute('clip-path');
        const id = clip ? /#([^)"]+)/.exec(clip)?.[1] : undefined;
        const rect = id ? document.getElementById(id)?.querySelector('path, rect') : null;
        return rect ? Math.round((rect as SVGGraphicsElement).getBBox().width) : -1;
      }, element('e_chart_plain'));
    await goTo(page, PLAIN);
    await page.waitForTimeout(200);
    const growing = await drawn();
    await idle(page);
    await page.waitForTimeout(100);
    const whole = await drawn();
    // The line is revealed from its start: the window on it widens as the chart builds.
    expect(whole).toBeGreaterThan(0);
    expect(growing).toBeLessThan(whole);

    // Back to the slide before, and on again without animation: the chart is whole.
    await page.evaluate(() => {
      const w = window as ShowWindow;
      (w.slidrDev?.player ?? w.slidr)!.setState({ slide: 3, step: 0 });
    });
    await page.waitForTimeout(50);
    expect(await drawn()).toBe(whole);
  });

  test('answers the pointer with a tooltip, in the direction of the deck', async ({ page }) => {
    for (const [deck, dir, name] of [
      ['charts', 'ltr', 'Revenue'],
      ['charts-rtl', 'rtl', 'הכנסות'],
    ] as const) {
      await openDeck(page, deck, '&bare');
      await goTo(page, 0);
      await idle(page);
      await page.waitForTimeout(1100);
      const box = await page.locator(element('e_chart_column')).boundingBox();
      if (!box) throw new Error('the chart is not on the screen');
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
      const tooltip = page
        .locator(`${element('e_chart_column')} [data-slidr-chart-box] > div`)
        .last();
      await expect(tooltip).toContainText(name);
      await expect(tooltip).toHaveCSS('direction', dir);
      // The tooltip is inside the chart, at the pointer: the slide is scaled, and so is it.
      const tip = await tooltip.boundingBox();
      expect(tip && tip.x >= box.x - 1 && tip.x + tip.width <= box.x + box.width + 1).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------------

test.describe('the exported file of a deck with charts', () => {
  test.describe.configure({ mode: 'serial' });
  let exported: Awaited<ReturnType<typeof exportDeck>>;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    exported = await exportDeck(page, 'charts-rtl', 'charts-rtl.html');
    await page.close();
  });

  test('carries the chart library once, with its notices, and nothing from outside', () => {
    const { result } = exported;
    expect(result.charts.count).toBe(11);
    expect(result.charts.bytes).toBeGreaterThan(300_000);
    expect(result.charts.bytes).toBeLessThan(700_000);
    expect(result.warnings).toEqual([]);
    expect(result.html.match(/<script data-slidr-charts>/g)).toHaveLength(1);
    expect(result.html).toContain('Apache ECharts');
    expect(result.html).toContain('BSD 3-Clause');
    expect(result.html).not.toMatch(
      /<script[^>]+src=|<link\b|https?:\/\/(?!www\.apache\.org|github\.com|www\.w3\.org)/,
    );
    expect(result.html).not.toContain('localhost');
    expect(result.html).not.toContain('blob:');
    console.log(
      `charts-rtl.html: ${(result.bytes / 1024).toFixed(0)} kB, of them the chart library ${(result.charts.bytes / 1024).toFixed(0)} kB`,
    );
  });

  test('draws its charts from the data, opened from the disk with the network off', async ({
    browser,
  }) => {
    const { page, outside, close } = await offlinePage(browser);
    const noErrors = watchErrors(page);
    await page.goto(exported.url);
    await page.waitForSelector('html.slidr-ready');
    expect(await player(page)).toBe(true);
    await chartsAreLive(page);
    // Each chart is drawn once: the picture the export wrote has given way.
    const boxes = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-slidr-chart]')).map(
        (node) => node.querySelectorAll('[data-slidr-chart-box]').length,
      ),
    );
    expect(boxes).toEqual(Array.from({ length: 11 }, () => 1));
    expect(outside).toEqual([]);
    noErrors();
    await close();
  });

  test('plays the chart step, and shows a tooltip in fonts the file carries', async ({
    browser,
  }) => {
    const { page, close } = await offlinePage(browser);
    await page.goto(exported.url);
    await page.waitForSelector('html.slidr-ready');
    await chartsAreLive(page);
    await goTo(page, STEPPED);
    await idle(page);
    expect(await isVisible(page, element('e_chart_step'))).toBe(false);
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => isVisible(page, element('e_chart_step'))).toBe(true);
    await page.waitForTimeout(200);
    const growing = await columnHeights(page, 'e_chart_step');
    await idle(page);
    await page.waitForTimeout(100);
    const whole = await columnHeights(page, 'e_chart_step');
    expect(whole).toHaveLength(4);
    expect(Math.max(...growing)).toBeLessThan(Math.max(...whole));

    const box = await page.locator(element('e_chart_step')).boundingBox();
    if (!box) throw new Error('the chart is not on the screen');
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6);
    const tooltip = page.locator(`${element('e_chart_step')} [data-slidr-chart-box] > div`).last();
    await expect(tooltip).toContainText('הכנסות');
    await expect(tooltip).toHaveCSS('direction', 'rtl');
    await page.screenshot({ path: join(OUT, 'charts-rtl-tooltip.png') });

    // Every glyph of the tooltip comes from a font of the file: its digits were kept for it,
    // though no label on the slide shows them all (ADR-032 cuts fonts to the signs in use).
    const session = await page.context().newCDPSession(page);
    await session.send('DOM.enable');
    await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument', { depth: 0 });
    const { nodeIds } = await session.send('DOM.querySelectorAll', {
      nodeId: root.nodeId,
      selector: `${element('e_chart_step')} [data-slidr-chart-box] > div:last-child, ${element('e_chart_step')} [data-slidr-chart-box] > div:last-child *`,
    });
    const used: Record<string, boolean> = {};
    for (const nodeId of nodeIds) {
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
      for (const font of fonts) used[font.familyName] = font.isCustomFont;
    }
    expect(Object.keys(used).length).toBeGreaterThan(0);
    expect(Object.entries(used).filter(([, ofFile]) => !ofFile)).toEqual([]);
    await close();
  });

  test('shows its charts without JavaScript, as the pictures the editor drew', async ({
    browser,
  }) => {
    const { page, outside, close } = await offlinePage(browser, { javaScriptEnabled: false });
    await page.goto(exported.url);
    const charts = page.locator('[data-slidr-chart] [data-slidr-chart-box] svg');
    await expect(charts).toHaveCount(11);
    await expect(charts.first()).toBeVisible();
    expect(await charts.first().locator('path').count()).toBeGreaterThan(3);
    expect(outside).toEqual([]);
    await close();
  });
});

// ---------------------------------------------------------------------------------------------

test.describe('what an export does with the chart library', () => {
  test('a deck without charts is exported without a byte of it, and without loading it', async ({
    page,
  }) => {
    const asked: string[] = [];
    page.on('request', (request) => {
      if (/echarts|zrender|\/chart\/(engine|bundle\.generated)/.test(request.url())) {
        asked.push(request.url());
      }
    });
    const { result } = await exportDeck(page, 'probe', 'probe.html');
    expect(result.charts).toEqual({ count: 0, bytes: 0 });
    expect(result.html).not.toContain('data-slidr-charts');
    expect(result.html).not.toMatch(/echarts|zrender|ECharts|ZRender/);
    expect(result.html.match(/<script/g)).toHaveLength(1);
    expect(asked).toEqual([]);
  });

  test('without animations the charts are whole from the start', async ({ page, browser }) => {
    await openDeck(page, 'charts');
    const html = await page.evaluate(async () => {
      // Through Vite, like every module of the page; not paths the compiler should resolve.
      const paths = { decks: '/src/dev/runtime/decks.ts', exporter: '/@id/@slidr/html-export' };
      const decks = (await import(/* @vite-ignore */ paths.decks)) as {
        deckByName: (name: string) => unknown;
      };
      const exporter = (await import(/* @vite-ignore */ paths.exporter)) as {
        exportHtml: (deck: unknown, options: unknown) => Promise<{ html: string }>;
      };
      const out = await exporter.exportHtml(decks.deckByName('charts'), {
        loadAsset: () => Promise.resolve(undefined),
        animations: false,
      });
      return out.html;
    });
    mkdirSync(OUT, { recursive: true });
    const file = join(OUT, 'charts-still.html');
    writeFileSync(file, html);

    const { page: filePage, close } = await offlinePage(browser);
    await filePage.goto(pathToFileURL(file).href);
    await filePage.waitForSelector('html.slidr-ready');
    await chartsAreLive(filePage);
    // Every chart of the file is marked as still: the player leaves them alone.
    await expect(filePage.locator('[data-slidr-chart][data-slidr-chart-still]')).toHaveCount(11);
    await goTo(filePage, STEPPED);
    // No step to wait for, and no build: the columns are at their height at once.
    await filePage.waitForTimeout(100);
    await expect.poll(() => isVisible(filePage, element('e_chart_step'))).toBe(true);
    const now = await columnHeights(filePage, 'e_chart_step');
    await filePage.waitForTimeout(1200);
    expect(await columnHeights(filePage, 'e_chart_step')).toEqual(now);
    expect(now).toHaveLength(4);
    await close();
  });
});

// ---------------------------------------------------------------------------------------------

test.describe('a chart in the app', () => {
  test.use({ viewport: { width: 1920, height: 1032 } });

  test('present mode draws the charts, and a chart on a step waits for its key', async ({
    page,
  }) => {
    const noErrors = watchErrors(page);
    await openApp(page, { deck: 'charts-rtl', lang: 'he' });
    await setCurrentSlide(page, 's_chart_stepped');
    await page.keyboard.press('Shift+F5');
    const view = await show(page);
    const chart = view.locator(`${element('e_chart_step')} [data-slidr-chart-box] svg`);
    await expect(chart).toHaveCount(1);
    // Before its step the chart is not there, though its slide is.
    const visible = () =>
      page.evaluate(
        (selector) => getComputedStyle(document.querySelector(selector)!).visibility === 'visible',
        `[data-testid="present"] ${element('e_chart_step')}`,
      );
    expect(await visible()).toBe(false);
    await page.keyboard.press('ArrowRight');
    await expect.poll(visible).toBe(true);
    await idle(page);
    // The show is the app's own page, with its stylesheet around the slide: the chart is whole.
    const columns = await page.evaluate(
      (selector) => {
        const svg = document.querySelector(`${selector} [data-slidr-chart-box] svg`);
        return Array.from(svg?.querySelectorAll('path') ?? []).filter(
          (path) => path.getAttribute('fill') === '#2f5bea',
        ).length;
      },
      `[data-testid="present"] ${element('e_chart_step')}`,
    );
    expect(columns).toBeGreaterThanOrEqual(4);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('present')).toHaveCount(0);
    noErrors();
  });

  test('the Stage redraws a chart when its data, its type or the theme changes, and not when it moves', async ({
    page,
  }) => {
    await openApp(page, { deck: 'charts', lang: 'en' });
    const onStage = page
      .getByTestId('stage-frame')
      .locator(`${element('e_chart_column')} [data-slidr-chart-box] svg`);
    await expect(onStage).toHaveCount(1);
    const drawing = () => onStage.evaluate((svg) => svg.outerHTML);
    const stamp = () =>
      onStage.evaluate((svg) => ((svg as { stamp?: number }).stamp ??= Math.random()));
    const before = await drawing();
    const node = await stamp();

    const update = (patch: Record<string, unknown>) =>
      page.evaluate((p) => {
        const { bus, selection } = window.slidr!;
        const slideId = selection.getState().currentSlideId!;
        bus.dispatch({ type: 'element.update', slideId, elementId: 'e_chart_column', patch: p });
      }, patch);

    // A move is not another picture: the same node holds the same drawing.
    await update({ frame: { x: 60, y: 60, w: 888, h: 484 } });
    await page.waitForTimeout(150);
    expect(await drawing()).toBe(before);
    expect(await stamp()).toBe(node);

    // Another type draws other marks, in the same chart instance.
    await update({ chartType: 'line' });
    await expect.poll(drawing).not.toBe(before);
    const asLine = await drawing();
    expect(asLine).toContain('stroke="#2f5bea"');

    // The theme's palette reaches a chart only by a redraw: its colours are literals.
    await page.evaluate(() => {
      const { bus } = window.slidr!;
      bus.dispatch({
        type: 'theme.update',
        patch: { colors: { ...bus.deck.theme.colors, chart: ['#aa0000', '#00aa00'] } },
      });
    });
    await expect.poll(drawing).toContain('stroke="#aa0000"');

    // Each of the three changes is one step back.
    await page.evaluate(() => window.slidr!.bus.undo());
    await expect.poll(drawing).toBe(asLine);
  });
});
