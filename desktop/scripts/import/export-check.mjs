// SPEC 13.5, criterion 7: the deck that is open in the app (after an import) is exported to one
// HTML file, the file is opened in a browser of its own, and every slide of it is pictured next
// to the same slide as the editor draws it. Prints, per slide, the share of pixels that differ,
// and saves the pairs side by side.
//   node scripts/import/export-check.mjs <out-dir>
// The editor's slide was compared with the source by the fidelity guard when it was captured;
// this compares the export with the editor's slide.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { connect } from './cdp.mjs';

const [outDir] = process.argv.slice(2);
if (!outDir) throw new Error('usage: export-check.mjs <out-dir>');
mkdirSync(outDir, { recursive: true });
const WIDTH = 960;
const HEIGHT = 540;

const { browser, main } = await connect();
const page = main();
if (!page) throw new Error('the app window was not found');
const exported = await page.evaluate(async (width) => {
  const { exportDeck } = await import('/src/export/exportDeck.ts');
  const { captureSlide } = await import('/src/capture/client.ts');
  const editor = window.slidr;
  const deck = editor.bus.deck;
  const result = await exportDeck(editor, deck, { range: null, animations: false });
  const pictures = [];
  for (const slide of deck.slides) {
    const png = await captureSlide(deck, slide.id, {
      width,
      fast: true,
      workspaceId: editor.document.workspace?.id ?? null,
    });
    let binary = '';
    for (let i = 0; i < png.length; i += 0x8000) {
      binary += String.fromCharCode(...png.subarray(i, i + 0x8000));
    }
    pictures.push(btoa(binary));
  }
  return {
    html: result.html,
    bytes: result.bytes,
    slides: result.slides,
    fonts: result.fonts.map((font) => `${font.family} ${font.weight ?? ''}`.trim()),
    warnings: result.warnings,
    title: deck.meta.title,
    pictures,
  };
}, WIDTH);
await browser.close();

const file = resolve(outDir, 'export.html');
writeFileSync(file, exported.html);
console.log(
  JSON.stringify({
    title: exported.title,
    slides: exported.slides,
    bytes: exported.bytes,
    fonts: exported.fonts.length,
    warnings: exported.warnings,
  }),
);

// The browser the E2E suites use: installed Edge, a profile of its own.
const own = await chromium.launch({ channel: 'msedge' });
const context = await own.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
});
const requests = [];
const view = await context.newPage();
view.on('request', (request) => {
  if (!request.url().startsWith('file:') && !request.url().startsWith('data:')) {
    requests.push(request.url());
  }
});
const shares = [];
for (let n = 1; n <= exported.slides; n++) {
  await view.goto(`${pathToFileURL(file).href}#${n}`);
  await view.waitForSelector('html.slidr-ready');
  await view.evaluate(() => document.fonts.ready);
  await view.waitForTimeout(300);
  const shot = (await view.screenshot({ type: 'png' })).toString('base64');
  // Both pictures side by side, and how much of them differs, worked out in the page.
  const compared = await view.evaluate(
    async ({ a, b, width, height }) => {
      const load = async (data) => {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();
        return image;
      };
      const [editor, exportedShot] = [await load(a), await load(b)];
      const canvas = document.createElement('canvas');
      canvas.width = width * 2 + 8;
      canvas.height = height;
      const g = canvas.getContext('2d');
      g.fillStyle = '#f0f';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.drawImage(editor, 0, 0, width, height);
      g.drawImage(exportedShot, width + 8, 0, width, height);
      const left = g.getImageData(0, 0, width, height).data;
      const right = g.getImageData(width + 8, 0, width, height).data;
      let differing = 0;
      for (let i = 0; i < left.length; i += 4) {
        const d = Math.max(
          Math.abs(left[i] - right[i]),
          Math.abs(left[i + 1] - right[i + 1]),
          Math.abs(left[i + 2] - right[i + 2]),
        );
        if (d > 48) differing++;
      }
      return { share: differing / (width * height), pair: canvas.toDataURL('image/png') };
    },
    { a: exported.pictures[n - 1], b: shot, width: WIDTH, height: HEIGHT },
  );
  shares.push(compared.share);
  writeFileSync(
    resolve(outDir, `slide-${String(n).padStart(2, '0')}.png`),
    Buffer.from(compared.pair.split(',')[1], 'base64'),
  );
  console.log(`slide ${n}: ${(compared.share * 100).toFixed(2)}% of the pixels differ`);
}
await own.close();
const worst = Math.max(...shares);
console.log(
  `worst slide: ${(worst * 100).toFixed(2)}%; requests the exported file made: ${requests.length}`,
);
