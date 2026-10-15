// Makes the small pictures of the event magnets that the Elements panel shows:
// `Slidr-media/images/frames/<language>/<frame>.webp`, in Hebrew and in English, with
// `Slidr-media/images/frames/index.json`, which says what each was drawn from.
//
// A magnet is a whole design, and a hundred of them drawn live took seconds each time the group
// was opened. So the panel shows a picture of each, taken here of the renderer's own drawing:
// the page `dev/frame-thumbs.html` draws every frame that has one (`picturedAhead` in
// `src/elements/frames.ts`) and a browser takes its picture, with what is behind the frame left
// clear. A frame whose drawing changes after its picture was made is drawn live by the panel
// until this script runs again (`frameRev`), and `src/elements/frames.test.ts` fails meanwhile.
//
//   node scripts/generate-frames-thumbs.mjs               write the pictures into the media library
//   node scripts/generate-frames-thumbs.mjs --out <dir>   write them there, and leave the library alone
//   node scripts/generate-frames-thumbs.mjs --url <url>   draw with a dev server that is running
//
// Run it after `generate-frames-catalog.mjs`, from apps/desktop. It starts a dev server of its
// own, which reloads nothing while the pictures are taken: a page of the server a session works
// with is loaded again whenever a file is saved, and a picture that is being taken then never
// comes. The pictures are written once all of them were taken, so the library is never left
// with some of a run.
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const media = resolve(desktop, '..', '..', '..', 'Slidr-media');

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const out = resolve(flag('--out') ?? join(media, 'images', 'frames'));

/** The languages a frame says its words in. */
const LANGUAGES = ['he', 'en'];
/** How good a picture is, of a hundred: the ground of a card stays smooth, the type sharp. */
const QUALITY = 88;
/** How long the page may take to draw the frames, and the browser to take one picture. */
const DRAWN_MS = 180_000;
const TAKEN_MS = 30_000;

let server;
let origin = flag('--url');
if (!origin) {
  server = await createServer({
    root: desktop,
    logLevel: 'error',
    // Apart from the cache of the server a session works with, which is not to be written over.
    cacheDir: join(desktop, 'node_modules', '.vite-thumbs'),
    server: { port: 1437, strictPort: false, hmr: false, watch: null },
  });
  await server.listen();
  origin = server.resolvedUrls.local[0];
}

/** What a promise gives, or an error when it has not come in time. */
const inTime = (promise, ms, what) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} did not come`)), ms)),
  ]);

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const frames = {};
  const pictures = [];
  let geometry;
  for (const lang of LANGUAGES) {
    const page = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
    });
    const address = new URL(`/dev/frame-thumbs.html?lang=${lang}`, origin).href;
    const drawnAll = () => page.waitForSelector('html[data-ready="true"]', { timeout: DRAWN_MS });
    await page.goto(address);
    // A server that has just started may find a package it has not prepared, and the page is
    // then to be loaded again.
    await drawnAll().catch(() => page.reload().then(drawnAll));
    // The whole page in view, so a picture is taken of what is drawn already.
    const whole = await page.evaluate(() => ({
      width: globalThis.document.documentElement.scrollWidth,
      height: globalThis.document.documentElement.scrollHeight,
    }));
    await page.setViewportSize({ width: Math.max(1920, whole.width), height: whole.height });
    geometry = await page.evaluate(() => globalThis.__thumbs);
    const drawn = await page.evaluate(() =>
      Array.from(globalThis.document.querySelectorAll('[data-thumb]'), (el) => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return { name: el.dataset.thumb, rev: el.dataset.rev, clip: { x, y, width, height } };
      }),
    );
    if (drawn.length === 0) throw new Error('The page drew no frame');

    const client = await page.context().newCDPSession(page);
    await client.send('Emulation.setDefaultBackgroundColorOverride', {
      color: { r: 0, g: 0, b: 0, a: 0 },
    });
    for (const { name, rev, clip } of drawn) {
      const { data } = await inTime(
        client.send('Page.captureScreenshot', {
          format: 'webp',
          quality: QUALITY,
          clip: { ...clip, scale: 1 },
        }),
        TAKEN_MS,
        `The picture of ${name} (${lang})`,
      );
      pictures.push({ lang, name, bytes: Buffer.from(data, 'base64') });
      frames[name] = rev;
    }
    await page.close();
    console.log(`${lang}: ${drawn.length} pictures`);
  }

  for (const lang of LANGUAGES) {
    mkdirSync(join(out, lang), { recursive: true });
    const ofLang = pictures.filter((picture) => picture.lang === lang);
    for (const { name, bytes } of ofLang) writeFileSync(join(out, lang, `${name}.webp`), bytes);
    // A picture of a frame that is no longer one of them goes: it would be packaged for nothing.
    const names = new Set(ofLang.map(({ name }) => `${name}.webp`));
    for (const file of readdirSync(join(out, lang))) {
      if (file.endsWith('.webp') && !names.has(file)) rmSync(join(out, lang, file));
    }
  }
  writeFileSync(join(out, 'index.json'), `${JSON.stringify({ ...geometry, frames }, null, 2)}\n`);
  const kB = Math.round(pictures.reduce((sum, { bytes }) => sum + bytes.length, 0) / 1024);
  console.log(`${pictures.length} pictures, ${kB} kB, written to ${out}`);
} finally {
  await browser.close();
  await server?.close();
}
