// Dev helper: capture one target and print the first-round model next to the per-element diff.
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImportEnv } from './lib/engine.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const [file, before, js] = process.argv.slice(2);
process.env.S5_DEBUG = '1';
const env = await ImportEnv.open(join(here, 'fixtures', file), join(here, 'out', 'dev-dump'));
const slide = await env.capture({ before, js, waitMs: 600 });
console.log('source', JSON.stringify(slide.source), 'k', slide.k, 'bg', JSON.stringify(slide.background).slice(0, 100));
for (const e of slide.elements) {
  const extra = e.type === 'text' ? ` "${e.runs.map((r) => r.text).join('|').slice(0, 40)}" size=${e.runs[0].marks.size} lh=${e.lineHeight} align=${e.align}${e.nowrap ? ' nowrap' : ''}${e.list ? ' list' : ''}` : e.type === 'html' ? ` ${e.deep ? 'deep' : 'own'} ${e.markup.length}b reason=${e.reason}` : '';
  console.log(`${e.type.padEnd(6)} ${e.name.slice(0, 28).padEnd(28)} frame=${JSON.stringify(e.frame)} src=${JSON.stringify(e._src)}${extra}`);
}
console.log(JSON.stringify(slide.metrics, null, 1).slice(0, 1500));
await env.close();
