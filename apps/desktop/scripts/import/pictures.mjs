// Development probe: saves every picture the fidelity guard takes during one judgement of an
// element of the loaded file, to see what it compares.
//   node scripts/import/pictures.mjs "<selector>" <out-dir> ["<js to run first>"]
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect } from './cdp.mjs';

const [selector, outDir, before] = process.argv.slice(2);
const { browser, importPage } = await connect();
const page = importPage();
if (!page) throw new Error('the import window is not open');
const ROOT = '/@fs/C:/Users/Moshe/Documents/Projects/Slidr-import/packages';
const out = await page.evaluate(
  async ({ selector, before, ROOT }) => {
    const { startConversion } = await import(`${ROOT}/html-import/src/engine.ts`);
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
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let s = '';
        for (let i = 0; i < bytes.length; i += 0x8000)
          s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        shots.push({ rect, data: btoa(s) });
        return blob;
      },
    };
    const conversion = await startConversion(root, {
      deck: await (
        await import('/scripts/import/in-page/deckWithFonts.js')
      ).deckWithFonts(root.ownerDocument, host),
      host: spy,
      foreign: true,
      behind: 'page',
      fontFaces: false,
    });
    const verdict = await conversion.judge();
    conversion.dispose();
    return {
      shots,
      faithful: verdict.faithful,
      bad: verdict.bad.length,
      dpr: devicePixelRatio,
      inner: [innerWidth, innerHeight],
    };
  },
  { selector, before, ROOT },
);
mkdirSync(outDir, { recursive: true });
out.shots.forEach((shot, i) =>
  writeFileSync(`${outDir}/shot-${i}.png`, Buffer.from(shot.data, 'base64')),
);
console.log(JSON.stringify({ ...out, shots: out.shots.map((s) => s.rect) }));
await browser.close();
