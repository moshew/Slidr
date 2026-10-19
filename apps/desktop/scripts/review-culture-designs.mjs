/* global document, window */
// Render the fifteen culture slides in every language, using the app's renderer and fonts.
// All files stay under --out. Missing media is fetched from the published library into its cache.
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const measureOnly = args.includes('--measure-only');
const boardsOnly = args.includes('--boards-only');
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at < 0 ? fallback : args[at + 1];
};
const catalogFile = resolve(option('--catalog', 'test-results/culture-localization/index.json'));
const output = resolve(option('--out', 'test-results/culture-localization'));
const fontsFile = resolve(option('--fonts', join(output, 'fonts.json')));
const sizesFile = resolve(option('--sizes', join(output, 'sizes.json')));
const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
const ids = catalog.groupIds.culture;
const reviewCatalog = JSON.stringify({
  ...catalog,
  groups: ['culture'],
  groupIds: { culture: ids },
  slides: Object.fromEntries(ids.map((id) => [id, catalog.slides[id]])),
});
const languages = Object.keys(catalog.slides[ids[0]]);
const requested = option('--languages');
const drawnLanguages = requested ? requested.split(',') : languages;
const selectedIds = option('--ids');
const capturedIds = selectedIds ? selectedIds.split(',') : ids;
if (capturedIds.some((id) => !ids.includes(id))) throw new Error('--ids names an unknown design');
const media = resolve(desktop, '..', '..', '..', 'Slidr-media');
const priorCache = join(desktop, 'node_modules', '.cache', 'slidr-media');
const cache = join(output, 'media');
const fitsFile = join(desktop, 'scripts', 'design-locales', 'culture', 'fit.json');
const fits = JSON.parse(readFileSync(fitsFile, 'utf8'));
const prior = (name) =>
  (requested || selectedIds) && existsSync(join(output, name))
    ? JSON.parse(readFileSync(join(output, name), 'utf8')).filter(
        (entry) => !drawnLanguages.includes(entry.lang) || !capturedIds.includes(entry.id),
      )
    : [];
const findings = prior('findings.json');
const measurements = prior('measurements.json');
const errors = [];
const mime = {
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
};
mkdirSync(cache, { recursive: true });
for (const dir of ['full', 'thumbnails', 'sheets', 'boards']) {
  mkdirSync(join(output, dir), { recursive: true });
}

// An isolated review server: the live app and its media cache are never changed.
const server = await createServer({
  configFile: join(desktop, 'vite.config.ts'),
  root: desktop,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 1427, strictPort: true, open: false },
  plugins: [
    {
      name: 'culture-review-media',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use('/media-library/', (req, res) => {
          const path = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
          if (path.split('/').some((part) => part === '..') || path.includes('\\')) {
            res.statusCode = 400;
            res.end();
            return;
          }
          const answer = (bytes) => {
            res.setHeader('Content-Type', mime[extname(path)] ?? 'application/octet-stream');
            res.setHeader('Cache-Control', 'no-store');
            res.end(bytes);
          };
          if (path === 'elements/designs/index.json') return answer(reviewCatalog);
          if (path === 'fonts/catalog.json') return answer(readFileSync(fontsFile));
          if (path === 'images/designs/sizes.json') return answer(readFileSync(sizesFile));
          if (path === 'manifest.json') {
            const files = Object.fromEntries(
              [
                'elements/designs/index.json',
                'elements/designs/managed.json',
                'fonts/catalog.json',
                'images/designs/sizes.json',
                ...ids.flatMap((id) => [
                  `images/designs/${id}.webp`,
                  ...(catalog.slides[id].en.elements.some((e) => e.assetId === '__backdrop__')
                    ? [`images/designs/${id}-bg.webp`]
                    : []),
                ]),
              ].map((path) => [path, {}]),
            );
            return answer(JSON.stringify({ version: 1, files }));
          }
          // This review isolates the authored culture group from unrelated managed slides.
          if (path === 'elements/designs/managed.json') return answer('{}');
          const saved = join(cache, path);
          const existing = [saved, join(priorCache, path), join(media, path)].find(existsSync);
          if (existing) return answer(readFileSync(existing));
          void fetch(`https://slidr-media.pages.dev/${path}`, {
            signal: AbortSignal.timeout(30_000),
          })
            .then(async (response) => {
              if (!response.ok) throw new Error(`${response.status}: ${path}`);
              const bytes = Buffer.from(await response.arrayBuffer());
              mkdirSync(dirname(saved), { recursive: true });
              writeFileSync(saved, bytes);
              answer(bytes);
            })
            .catch((error) => {
              errors.push(String(error));
              res.statusCode = 404;
              res.end();
            });
        });
        server.middlewares.use('/culture-captures/', (req, res) => {
          const path = decodeURIComponent((req.url ?? '').split('?')[0]);
          if (path.includes('..') || path.includes('\\')) {
            res.statusCode = 400;
            res.end();
            return;
          }
          const file = join(output, path);
          if (!existsSync(file)) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
          res.end(readFileSync(file));
        });
      },
    },
  ],
});

let browser;
try {
  process.stdout.write('Starting isolated review server and browser...\n');
  await server.listen();
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  const base = 'http://127.0.0.1:1427';
  await page.goto(`${base}/dev/designs-review.html?id=${ids[0]}&lang=he&w=1920`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  await page.waitForFunction(() => document.documentElement.dataset.ready === 'true', null, {
    timeout: 60_000,
  });
  process.stdout.write('Renderer ready.\n');
  const visit = async (query) => {
    const q = new URLSearchParams(query);
    await page.evaluate(
      async ({ ids, lang, width, columns }) => {
        let timer;
        try {
          await Promise.race([
            window.__draw({ ids, lang, width, columns }),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error('Rendering did not settle within 45 seconds')),
                45_000,
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      },
      {
        ids: q.has('sheet') ? ids : [q.get('id')],
        lang: q.get('lang'),
        width: Number(q.get('w')),
        columns: Number(q.get('cols') ?? 4),
      },
    );
    if ((await page.locator('html').getAttribute('data-ready')) !== 'true') {
      throw new Error(await page.locator('body').innerText());
    }
    await page.evaluate(() => document.fonts.ready);
    await page
      .locator('img')
      .evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
    const bad = await page
      .locator('img')
      .evaluateAll((images) =>
        images.filter((img) => !img.complete || !img.naturalWidth).map((img) => img.src),
      );
    if (bad.length) throw new Error(`Missing pictures: ${bad.join(', ')}`);
    if (errors.length) throw new Error(errors.join('\n'));
  };

  for (const lang of boardsOnly ? [] : drawnLanguages) {
    mkdirSync(join(output, 'full', lang), { recursive: true });
    mkdirSync(join(output, 'thumbnails', lang), { recursive: true });
    for (const id of capturedIds) {
      process.stdout.write(`  ${lang}/${id}\n`);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await visit(`id=${id}&lang=${lang}&w=1920`);
      const lines = await page.evaluate(() => window.__lines());
      const boxes = catalog.slides[id][lang].elements.filter(
        (element) => element.content?.paragraphs,
      );
      if (lines.length !== boxes.length)
        throw new Error(`${id}/${lang}: text measurement count differs`);
      lines.forEach((line, at) => {
        measurements.push({ lang, id, at, ...line });
        // Rotated poster text is measured along its vertical axis. Text inside shapes needs
        // breathing room for the badge's padding, unlike an ordinary text frame.
        const limit = line.type === 'shape' ? 0.84 : 0.96;
        const ratioX = line.turned ? line.box[3] / line.ink[3] : line.box[2] / line.ink[2];
        const ratioY = line.turned ? line.box[2] / line.ink[2] : line.box[3] / line.ink[3];
        const factor = Math.min(1, limit * ratioX, 0.96 * ratioY);
        if (factor < 0.99 || line.zoom < 0.8) {
          findings.push({ lang, id, at, factor, ...line });
          if (args.includes('--fit') && !['he', 'en'].includes(lang) && factor < 0.99) {
            const entry = ((fits[lang] ??= {})[id] ??= {});
            entry[at] = Math.floor((entry[at] ?? 1) * factor * 10_000) / 10_000;
          }
        }
      });
      if (!measureOnly) {
        await page.screenshot({ path: join(output, 'full', lang, `${id}.png`) });
        await page.setViewportSize({ width: 264, height: 149 });
        await visit(`id=${id}&lang=${lang}&w=264`);
        await page.screenshot({ path: join(output, 'thumbnails', lang, `${id}.png`) });
      }
    }
    if (args.includes('--fit')) writeFileSync(fitsFile, `${JSON.stringify(fits, null, 2)}\n`);
    writeFileSync(join(output, 'findings.json'), JSON.stringify(findings, null, 2));
    process.stdout.write(
      `${lang}: ${capturedIds.length} slides ${measureOnly ? 'measured' : 'captured at both sizes'}\n`,
    );
  }

  // Four 960px views of the actual full-size captures per board for detailed visual review.
  const boardPage = await browser.newPage({ viewport: { width: 1920, height: 1140 } });
  if (!measureOnly) {
    for (const lang of drawnLanguages) {
      await boardPage.setViewportSize({ width: 1404, height: 581 });
      await boardPage.setContent(`<style>body{margin:0;background:#d9dce1;font:15px sans-serif}
        main{display:grid;grid-template-columns:repeat(5,264px);gap:14px;padding:14px}
        figure{margin:0}img{display:block;width:264px;height:149px}figcaption{height:26px;padding-top:4px;box-sizing:border-box}</style>
        <main>${ids.map((id) => `<figure><img src="${base}/culture-captures/thumbnails/${lang}/${id}.png"><figcaption>${id}</figcaption></figure>`).join('')}</main>`);
      await boardPage
        .locator('img')
        .evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
      await boardPage.screenshot({ path: join(output, 'sheets', `${lang}.png`), fullPage: true });
    }
    await boardPage.setViewportSize({ width: 1920, height: 1140 });
  }
  for (const id of measureOnly ? [] : capturedIds) {
    for (let from = 0; from < drawnLanguages.length; from += 4) {
      const group = drawnLanguages.slice(from, from + 4);
      await boardPage.setContent(`<style>body{margin:0;background:#ddd;font:18px sans-serif}
        main{display:grid;grid-template-columns:960px 960px}figure{margin:0}img{display:block;width:960px}
        figcaption{height:30px;box-sizing:border-box;padding:4px 12px}</style><main>${group
          .map(
            (lang) =>
              `<figure><figcaption>${id} · ${lang}</figcaption><img src="${base}/culture-captures/full/${lang}/${id}.png"></figure>`,
          )
          .join('')}</main>`);
      await boardPage
        .locator('img')
        .evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
      await boardPage.screenshot({
        path: join(output, 'boards', `${id}-${group.join('-')}.png`),
        fullPage: true,
      });
    }
  }
  await boardPage.close();
  if (args.includes('--fit')) writeFileSync(fitsFile, `${JSON.stringify(fits, null, 2)}\n`);
  if (!boardsOnly) {
    writeFileSync(join(output, 'measurements.json'), JSON.stringify(measurements, null, 2));
    writeFileSync(join(output, 'findings.json'), JSON.stringify(findings, null, 2));
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Culture slides · 16 languages</title>
    <style>body{font:16px system-ui;margin:30px;background:#eee}nav{display:flex;gap:12px;flex-wrap:wrap}
    section{margin-top:32px}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
    img{width:100%;display:block}figure{margin:0}figcaption{padding:6px;background:white}</style>
    <h1>15 culture and leisure slides · 16 languages</h1><p>Click a slide for the 1920 × 1080 original.
    Gallery captures are in thumbnails/. Full-size captures are in full/.</p>
    <nav>${languages.map((lang) => `<a href="#${lang}">${lang}</a>`).join('')}</nav>
    ${languages
      .map(
        (lang) =>
          `<section id="${lang}"><h2>${lang}</h2><main>${ids
            .map(
              (id) =>
                `<figure><a href="full/${lang}/${id}.png"><img loading="lazy" src="full/${lang}/${id}.png"></a><figcaption>${id}</figcaption></figure>`,
            )
            .join('')}</main></section>`,
      )
      .join('')}`;
  writeFileSync(join(output, 'gallery.html'), html);
  process.stdout.write(
    `${measurements.length} text boxes measured; ${findings.length} fit findings\n${output}\n`,
  );
} catch (error) {
  process.exitCode = 1;
  console.error(error);
  throw error;
} finally {
  const closing = setTimeout(() => process.exit(process.exitCode ?? 0), 10_000);
  closing.unref();
  await browser?.close();
  await server.close();
  clearTimeout(closing);
}
