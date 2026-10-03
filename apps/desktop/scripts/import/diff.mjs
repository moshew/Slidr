// Development probe: for an element of the loaded file, one judgement of the fidelity guard, and
// for each item it calls different a picture: source | converted | difference, enlarged.
//   node scripts/import/diff.mjs "<selector>" <out-dir> ["<js to run first>"]
import { mkdirSync, writeFileSync } from 'node:fs';
import { connect } from './cdp.mjs';

// [pair]: "a,b" compares picture a with picture b instead of the source with the last.
const [selector, outDir, before, skip, pair] = process.argv.slice(2);
const { browser, importPage } = await connect();
const page = importPage();
if (!page) throw new Error('the import window is not open');
const ROOT = '/@fs/C:/Users/Moshe/Documents/Projects/Slidr-import/packages';
const out = await page.evaluate(
  async ({ selector, before, skip, pair, ROOT }) => {
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
        shots.push(blob);
        return blob;
      },
    };
    let conversion;
    try {
      conversion = await startConversion(root, {
        deck: await (
          await import('/scripts/import/in-page/deckWithFonts.js')
        ).deckWithFonts(root.ownerDocument, host),
        host: spy,
        foreign: true,
        behind: 'page',
        fontFaces: false,
      });
    } catch (error) {
      return { failed: error?.message ?? JSON.stringify(error), crops: [] };
    }
    const verdict = await conversion.judge();
    // Two pictures of what is behind the element come first, then the element itself.
    const [a, b] = pair ? pair.split(',').map(Number) : [2, shots.length - 1];
    const source = await createImageBitmap(shots[a]);
    const converted = await createImageBitmap(shots[b]);
    const crops = [];
    for (const { item, why } of verdict.bad.slice(Number(skip) || 0, (Number(skip) || 0) + 6)) {
      const r = item.region;
      const pad = 6;
      const x = Math.max(0, Math.floor(r.x - pad)),
        y = Math.max(0, Math.floor(r.y - pad));
      const w = Math.ceil(r.w + 2 * pad),
        h = Math.ceil(r.h + 2 * pad);
      const k = Math.max(1, Math.min(4, Math.floor(900 / w)));
      const canvas = new OffscreenCanvas(w * k, h * k * 3 + 8);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(source, x, y, w, h, 0, 0, w * k, h * k);
      ctx.drawImage(converted, x, y, w, h, 0, h * k + 4, w * k, h * k);
      const a = new OffscreenCanvas(w, h);
      const actx = a.getContext('2d');
      actx.drawImage(source, x, y, w, h, 0, 0, w, h);
      const b = new OffscreenCanvas(w, h);
      const bctx = b.getContext('2d');
      bctx.drawImage(converted, x, y, w, h, 0, 0, w, h);
      const da = actx.getImageData(0, 0, w, h),
        db = bctx.getImageData(0, 0, w, h);
      let worst = 0;
      let over = 0;
      for (let i = 0; i < da.data.length; i += 4) {
        const d = Math.max(
          Math.abs(da.data[i] - db.data[i]),
          Math.abs(da.data[i + 1] - db.data[i + 1]),
          Math.abs(da.data[i + 2] - db.data[i + 2]),
        );
        if (d > worst) worst = d;
        if (d > 7) over++;
        const v = d > 7 ? 255 : Math.min(255, d * 20);
        da.data[i] = v;
        da.data[i + 1] = v;
        da.data[i + 2] = v;
        da.data[i + 3] = 255;
      }
      actx.putImageData(da, 0, 0);
      ctx.drawImage(a, 0, 0, w, h, 0, 2 * (h * k + 4), w * k, h * k);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const e = item.element;
      crops.push({
        why,
        worst,
        over,
        node:
          item.node.localName +
          '.' +
          String(item.node.className).slice(0, 30) +
          (item.pseudo ?? ''),
        type: e.type,
        text: (item.node.textContent ?? '').trim().slice(0, 60),
        frame: e.frame,
        element: e.type === 'text' ? JSON.stringify(e).slice(0, 900) : undefined,
        srcStyle: (() => {
          const cs = frame.contentWindow.getComputedStyle(item.node);
          return {
            font: cs.font,
            ls: cs.letterSpacing,
            color: cs.color,
            ts: cs.textShadow,
            fk: cs.fontKerning,
            tr: cs.textRendering,
            fs: cs.fontSmooth,
            w: cs.width,
            lh: cs.lineHeight,
            fv: cs.fontVariationSettings,
            opacity: cs.opacity,
            bgclip: cs.backgroundClip,
            fill: cs.webkitTextFillColor,
            display: cs.display,
            ta: cs.textAlign,
          };
        })(),
        data: btoa(s),
      });
    }
    // For the first item: how many of its pixels each picture taken differs from the source in.
    const against = [];
    if (verdict.bad[0]) {
      const r = verdict.bad[0].item.region;
      const pixels = async (blob) => {
        const bitmap = await createImageBitmap(blob);
        const canvas = new OffscreenCanvas(Math.ceil(r.w), Math.ceil(r.h));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, -Math.floor(r.x), -Math.floor(r.y));
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const base = await pixels(shots[2]);
      for (const shot of shots) {
        const data = await pixels(shot);
        let over = 0;
        for (let i = 0; i < data.length; i += 4) {
          const d = Math.max(
            Math.abs(data[i] - base[i]),
            Math.abs(data[i + 1] - base[i + 1]),
            Math.abs(data[i + 2] - base[i + 2]),
          );
          if (d > 7) over++;
        }
        against.push(over);
      }
    }
    conversion.dispose();
    return {
      against,
      faithful: verdict.faithful,
      bad: verdict.bad.map(
        (b) =>
          b.item.element.type +
          ' ' +
          b.item.node.localName +
          '.' +
          String(b.item.node.className).slice(0, 24) +
          (b.item.pseudo ?? '') +
          ': ' +
          b.why,
      ),
      crops,
    };
  },
  { selector, before, skip, pair, ROOT },
);
mkdirSync(outDir, { recursive: true });
out.crops.forEach((crop, i) => {
  writeFileSync(`${outDir}/bad-${i}.png`, Buffer.from(crop.data, 'base64'));
  delete crop.data;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
