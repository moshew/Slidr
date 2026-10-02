// Browser plumbing: launch installed Edge through Playwright, open a harness page, and call
// method B (CDP Page.captureScreenshot) directly on a CDP session.
import { chromium } from 'playwright-core';
import { performance } from 'node:perf_hooks';

/** How the slide is displayed in the page. */
export const VIEWS = {
  // Editor-like: 1920x1080 slide shown at 50% in a 1600x900 window, centred.
  editor: { viewport: { width: 1600, height: 900 }, scale: 0.5, x: 320, y: 180 },
  // Capture-page-like: the slide at 100% filling a 1920x1080 viewport (what a hidden webview would show).
  full: { viewport: { width: 1920, height: 1080 }, scale: 1, x: 0, y: 0 },
  // Editor at an arbitrary fit-to-window zoom and a fractional position.
  odd: { viewport: { width: 1600, height: 900 }, scale: 0.613, x: 211.5, y: 97.25 },
  // Viewport smaller than the slide shown at 100%.
  small: { viewport: { width: 800, height: 450 }, scale: 1, x: 0, y: 0 },
};

export async function launch({ headed = false, stockBackgrounding = false, args = [] } = {}) {
  return chromium.launch({
    channel: 'msedge',
    headless: !headed,
    args,
    // Playwright normally disables Chromium's background throttling. For the background-page
    // test we remove those switches so the browser behaves like a stock one.
    ignoreDefaultArgs: stockBackgrounding
      ? [
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-timer-throttling',
        ]
      : undefined,
  });
}

export async function openSlide(browser, origin, { slide, view = 'editor', dpr = 1, overlay = false, lib, layer = false, noEmulation = false, context } = {}) {
  const v = VIEWS[view];
  const ownContext = !context;
  // noEmulation: no viewport / DPR override at all, so the page runs at the window's real scale factor.
  context ??= await browser.newContext(noEmulation ? { viewport: null } : { viewport: v.viewport, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const consoleLog = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleLog.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => consoleLog.push(`pageerror: ${e.message}`));
  const t0 = performance.now();
  await page.goto(
    `${origin}/src/page/harness.html?slide=${slide}&scale=${v.scale}&x=${v.x}&y=${v.y}${overlay ? '&overlay=1' : ''}${lib ? `&lib=${lib}` : ''}${layer ? '&layer=1' : ''}`,
  );
  await page.evaluate(() => window.s3.ready);
  const loadMs = performance.now() - t0;
  const cdp = await context.newCDPSession(page);
  return {
    context,
    page,
    cdp,
    dpr,
    loadMs,
    consoleLog,
    clip: { x: v.x, y: v.y, width: 1920 * v.scale, height: 1080 * v.scale },
    close: () => (ownContext ? context.close() : page.close()),
  };
}

/**
 * Method B. `outWidth` is the wanted PNG width in pixels. By default clip.scale = outWidth / clip width
 * in CSS px; pass o.scale to override (see the device-pixel-ratio test for when that is needed).
 */
export async function captureB(s, outWidth, o = {}) {
  const clip = o.clip ?? s.clip;
  const params = {
    format: 'png',
    clip: { ...clip, scale: o.scale ?? outWidth / clip.width },
    captureBeyondViewport: o.cbv ?? false,
    fromSurface: o.fromSurface ?? true,
    optimizeForSpeed: o.fast ?? false,
  };
  const t0 = performance.now();
  const { data } = await s.cdp.send('Page.captureScreenshot', params);
  const ms = performance.now() - t0;
  return { ms, buf: Buffer.from(data, 'base64') };
}

export async function benchB(s, outWidth, n, o = {}) {
  const times = [];
  let last;
  for (let i = 0; i < n; i++) {
    last = await captureB(s, outWidth, o);
    times.push(last.ms);
  }
  return { times, buf: last.buf };
}

export function withTimeout(promise, ms, label = 'operation') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
