// Development probe: how the text of the source and of the converted slide is anti-aliased, and
// how far apart the two pictures are, for the first text the guard calls different.
//   node scripts/import/aa.mjs "<selector>" ["<js to run first>"]
import { connect } from './cdp.mjs';

const [selector, before] = process.argv.slice(2);
const { browser, importPage } = await connect();
const page = importPage();
if (!page) throw new Error('the import window is not open');
const ROOT = '/@fs/C:/Users/Moshe/Documents/Projects/Slidr-import/packages';
const out = await page.evaluate(
  async ({ selector, before, ROOT }) => {
    const { startConversion } = await import(`${ROOT}/html-import/src/engine.ts`);
    const { deckWithFonts } = await import('/scripts/import/in-page/deckWithFonts.js');
    const { host, page } = window.__slidrImport;
    if (!document.querySelector('iframe[data-slidr-import]')) await page.load();
    const frame = document.querySelector('iframe[data-slidr-import]');
    if (before) await new frame.contentWindow.Function(`return (async () => {${before}})()`)();
    await new Promise((r) => setTimeout(r, 400));
    const root = frame.contentDocument.querySelector(selector);
    const shots = [];
    const spy = {
      ...host,
      capture: async (rect) => {
        const blob = await host.capture(rect);
        shots.push(blob);
        return blob;
      },
    };
    const conversion = await startConversion(root, {
      deck: await deckWithFonts(root.ownerDocument, host),
      host: spy,
      foreign: true,
      behind: 'page',
      fontFaces: false,
    });
    const verdict = await conversion.judge();
    const pixels = async (blob, r) => {
      const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
      const canvas = new OffscreenCanvas(Math.ceil(r.w), Math.ceil(r.h));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(
        bitmap,
        Math.floor(r.x),
        Math.floor(r.y),
        canvas.width,
        canvas.height,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      return ctx.getImageData(0, 0, canvas.width, canvas.height);
    };
    const results = [];
    for (const { item, why } of verdict.bad.slice(0, 3)) {
      const a = await pixels(shots[1], item.region);
      const b = await pixels(shots[shots.length - 1], item.region);
      const fringes = (d) => {
        let n = 0;
        for (let i = 0; i < d.data.length; i += 4)
          if (Math.abs(d.data[i] - d.data[i + 2]) > 10) n++;
        return n;
      };
      // The shift, in whole pixels, at which the two pictures agree best.
      const cost = (dx, dy) => {
        let sum = 0;
        let count = 0;
        for (let y = 4; y < a.height - 4; y += 2) {
          for (let x = 4; x < a.width - 4; x += 2) {
            const i = (y * a.width + x) * 4;
            const j = ((y + dy) * a.width + (x + dx)) * 4;
            sum += Math.abs(a.data[i + 1] - b.data[j + 1]);
            count++;
          }
        }
        return Math.round((sum / count) * 100) / 100;
      };
      const costs = {};
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        costs[`${dx},${dy}`] = cost(dx, dy);
      results.push({
        why,
        text: (item.node.textContent ?? '').trim().slice(0, 30),
        region: item.region,
        sourceFringes: fringes(a),
        convertedFringes: fringes(b),
        meanDiffByShift: costs,
      });
    }
    conversion.dispose();
    return { dpr: devicePixelRatio, results };
  },
  { selector, before, ROOT },
);
console.log(JSON.stringify(out, null, 1));
await browser.close();
