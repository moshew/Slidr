// Renders an artwork page to a picture: node tools/render-art.mjs <page.html> <out.png> <w> <h> [scale]
// A page that draws late sets `document.documentElement.dataset.wait = 'true'`, and `.ready = 'true'`
// once it has drawn; its fonts are waited for. Pages are opened as files, with module imports from
// files allowed and WebGL on SwiftShader. `CHROMIUM_PATH` names a browser other than Playwright's.
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../../../package.json', import.meta.url));
const pw = await import(require.resolve('playwright'));
const chromium = pw.chromium ?? pw.default.chromium;
const [page, out, w, h, scale = '1'] = process.argv.slice(2);
const browser = await chromium.launch({
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    '--allow-file-access-from-files',
  ],
});
try {
  const tab = await browser.newPage({
    viewport: { width: Number(w), height: Number(h) },
    deviceScaleFactor: Number(scale),
  });
  tab.on('console', (m) => console.log('console:', m.text()));
  tab.on('pageerror', (e) => console.log('pageerror:', String(e)));
  await tab.goto('file://' + page);
  await tab.evaluate(() => document.fonts.ready);
  await tab.waitForFunction(
    () =>
      !document.documentElement.dataset.wait || document.documentElement.dataset.ready === 'true',
    null,
    { timeout: 60000 },
  );
  await tab.waitForTimeout(200);
  await tab.screenshot({ path: out, omitBackground: true });
} finally {
  await browser.close();
}
