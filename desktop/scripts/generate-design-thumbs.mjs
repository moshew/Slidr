// Makes the pictures of the designs that the galleries show (ADR-109):
// `Slidr-media/images/designs/thumbs/<width>/<language>/<design>.webp`, of every design in every
// language it is drawn in, at the widths of `WIDTHS`, with `images/designs/thumbs/index.json`,
// which says the widths and the word of the design each picture was drawn from.
//
// A design is a whole slide with a large picture, and a gallery that draws a screen of them live
// reads and decodes their full pictures and lays out their text. So the gallery shows a picture of
// each, taken here of the renderer's own drawing: the page `dev/design-thumbs.html` draws them, a
// batch at a time, and a browser takes the picture of each at every width. The word of a design
// (`elements/designs/revs.json`) is written on publishing, of its slide and its pictures; a design
// whose word is not its picture's is drawn live by the galleries until this script runs again.
// Run it after a design or its picture changed, and before publishing; it draws again only what
// changed (`--all` draws everything). A change to how the renderer draws, or to a font, is not in
// the words: then run it with `--all`, after raising `DESIGN_DRAWING` in `build/media.ts`.
//
//   node scripts/generate-design-thumbs.mjs                   draw the copy beside the repository
//   node scripts/generate-design-thumbs.mjs --from <dir>      draw another copy, and write into it
//   node scripts/generate-design-thumbs.mjs --out <dir>       write the pictures there instead
//   node scripts/generate-design-thumbs.mjs --lang he,en      only these languages
//   node scripts/generate-design-thumbs.mjs --all             draw every design again
//
// It reads the copy as publishing would stage it (`libraryFiles`), so the words are the ones the
// next publication writes, and serves it to a dev server of its own, which reloads nothing while
// the pictures are taken and leaves the cache of the server a session works with alone. The
// pictures are written once all of them were taken, so the library is never left with some of a
// run.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { contentType, libraryFiles, libraryPath, manifestOf, MEDIA_PATH } from '../build/media.ts';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(name);
  return at === -1 ? undefined : args[at + 1];
};
const from = resolve(
  flag('--from') ?? fileURLToPath(new URL('../../../Slidr-media/', import.meta.url)),
);
const out = resolve(flag('--out') ?? join(from, 'images', 'designs', 'thumbs'));
const only = flag('--lang')?.split(',');
const again = args.includes('--all');

/** The widths of the pictures: a tile of the app's panel, and a card of Slidr Library. */
const WIDTHS = [320, 640];
/** How good a picture is, of a hundred: photographs and type, at a few kilobytes. */
const QUALITY = 85;
/** How many designs a page draws at once, and how many pages draw at once. */
const BATCH = 16;
const PAGES = 4;
/** How long a page may take to start, a batch to be drawn, and the browser to take one picture. */
const READY_MS = 180_000;
const DRAWN_MS = 120_000;
const TAKEN_MS = 30_000;

/** What a promise gives, or an error when it has not come in time. */
const inTime = (promise, ms, what) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${what} did not come`)), ms)),
  ]);

if (!existsSync(join(from, 'elements', 'designs'))) {
  console.error(`No designs in ${from}: name the library with --from <dir>.`);
  process.exit(1);
}
const files = libraryFiles(from);
const manifest = Buffer.from(JSON.stringify(manifestOf(files, new Date().toISOString())));
const revs = JSON.parse(files.get('elements/designs/revs.json')?.toString('utf8') ?? '{}');
const words = revs.designs ?? {};
const languages = Object.keys(words).filter((lang) => !only || only.includes(lang));

const indexFile = join(out, 'index.json');
const before = existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')) : {};
const sameWidths = JSON.stringify(before.widths) === JSON.stringify(WIDTHS);
const pictureOf = (width, lang, id) => join(out, String(width), lang, `${id}.webp`);
/** Whether a design has its pictures already, of the design as it is. */
const kept = (lang, id) =>
  !again &&
  sameWidths &&
  before.designs?.[lang]?.[id] === words[lang]?.[id] &&
  WIDTHS.every((width) => existsSync(pictureOf(width, lang, id)));

/** The library as it would be published, at the place the dev server serves it. */
const library = {
  name: 'design-thumbs:library',
  enforce: 'pre',
  configureServer(server) {
    server.middlewares.use(MEDIA_PATH, (request, response) => {
      const path = libraryPath((request.url ?? '').split('?')[0] ?? '');
      const body = path === 'manifest.json' ? manifest : path && files.get(path);
      response.statusCode = body ? 200 : 404;
      response.setHeader('Content-Type', body ? contentType(path) : 'text/plain');
      response.setHeader('Cache-Control', 'no-store');
      response.end(body);
    });
  },
};

const server = await createServer({
  root: desktop,
  logLevel: 'error',
  plugins: [library],
  // Apart from the cache of the server a session works with, which is not to be written over.
  cacheDir: join(desktop, 'node_modules', '.vite-design-thumbs'),
  server: { port: 1438, strictPort: false, hmr: false, watch: null },
});
await server.listen();
const origin = server.resolvedUrls.local[0];

const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const pictures = [];
const drawn = {};
const failed = [];
try {
  const queue = [...languages];
  const work = async () => {
    for (let lang = queue.shift(); lang; lang = queue.shift()) {
      const page = await browser.newPage({
        viewport: { width: 640 * 4, height: 360 * Math.ceil(BATCH / 4) },
        deviceScaleFactor: 1,
      });
      try {
        const ready = () => page.waitForSelector('html[data-ready="true"]', { timeout: READY_MS });
        await page.goto(new URL(`/dev/design-thumbs.html?lang=${lang}`, origin).href);
        // A server that has just started may find a package it has not prepared, and the page is
        // then to be loaded again.
        await ready().catch(() => page.reload().then(ready));
        const ids = await page.evaluate(() => globalThis.__designs);
        const width = await page.evaluate(() => globalThis.__width);
        drawn[lang] = Object.fromEntries(ids.map((id) => [id, words[lang]?.[id]]));
        const wanted = ids.filter((id) => words[lang]?.[id] && !kept(lang, id));
        const client = await page.context().newCDPSession(page);
        for (let at = 0; at < wanted.length; at += BATCH) {
          const batch = wanted.slice(at, at + BATCH);
          let places;
          try {
            places = await inTime(
              page.evaluate((ids) => globalThis.__draw(ids), batch),
              DRAWN_MS,
              `The designs ${batch.join(', ')} (${lang})`,
            );
          } catch (error) {
            failed.push(`${lang}: ${batch.join(', ')}: ${error.message.split('\n')[0]}`);
            for (const id of batch) delete drawn[lang][id];
            continue;
          }
          for (const { id, clip } of places) {
            for (const target of WIDTHS) {
              const { data } = await inTime(
                client.send('Page.captureScreenshot', {
                  format: 'webp',
                  quality: QUALITY,
                  clip: { ...clip, scale: target / width },
                }),
                TAKEN_MS,
                `The picture of ${id} (${lang}, ${target})`,
              );
              pictures.push({ width: target, lang, id, bytes: Buffer.from(data, 'base64') });
            }
          }
        }
        console.log(`${lang}: ${ids.length} designs, ${wanted.length} drawn`);
      } finally {
        await page.close();
      }
    }
  };
  await Promise.all(Array.from({ length: PAGES }, work));

  for (const { width, lang, id, bytes } of pictures) {
    const file = pictureOf(width, lang, id);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, bytes);
  }
  // A picture of a design no longer drawn in its language goes: it would be published for nothing.
  for (const width of WIDTHS) {
    for (const lang of languages) {
      const dir = join(out, String(width), lang);
      if (!existsSync(dir)) continue;
      for (const file of readdirSync(dir)) {
        if (file.endsWith('.webp') && !drawn[lang]?.[file.slice(0, -'.webp'.length)]) {
          rmSync(join(dir, file));
        }
      }
    }
  }
  const designs = { ...(sameWidths ? before.designs : {}), ...drawn };
  writeFileSync(indexFile, `${JSON.stringify({ widths: WIDTHS, designs }, null, 2)}\n`);
  const kB = Math.round(pictures.reduce((sum, { bytes }) => sum + bytes.length, 0) / 1024);
  console.log(`${pictures.length} pictures, ${kB} kB, written to ${out}`);
  if (failed.length > 0) {
    console.error(`Not drawn, and left to be drawn live:\n  ${failed.join('\n  ')}`);
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await server.close();
}
