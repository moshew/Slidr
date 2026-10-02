// Dev helper: whole-element HTML snapshot fidelity, without the converter.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { ImportEnv } from './lib/engine.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const [file, before, js] = process.argv.slice(2);
const env = await ImportEnv.open(join(here, 'fixtures', file), join(here, 'out', 'dev-snap'));
if (before) await env.evaluate(before);
await env.page.waitForTimeout(500);
const root = await env.resolveTarget({ js });
const sourcePng = await root.screenshot();
// (dev-snap predates slide.origin: it compares at the element box)
const model = await root.evaluate(async (el) => {
  const m = await window.__slidrImport.captureSlide(el, {});
  const S = window.__slidrImport.state;
  const node = S.nodes.push({ el, deep: true }) - 1;
  const { html, fontFaces } = await window.__slidrImport.fallback(node, true, 'dev');
  return { source: m.source, k: m.k, dir: m.dir, html, fontFaces };
});
const slide = { id: 'snap', k: model.k, dir: model.dir, background: { color: '#fff' }, elements: [model.html], fontFaces: model.fontFaces, source: model.source };
const png = await env.renderSlide(slide);
writeFileSync(join(env.outDir, 'source.png'), sourcePng);
writeFileSync(join(env.outDir, 'snapshot.png'), png);
const r = env.compare(sourcePng, png);
console.log(`snapshot vs source: fine ${r.fine.count}/${r.fine.w * r.fine.h} coarse ${r.coarse.count}/${r.coarse.w * r.coarse.h}, markup ${model.html.markup.length} bytes`);
console.log(model.html.markup.slice(0, Number(process.argv[5] || 900)));
await env.close();
