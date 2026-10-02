// Spike S5: does the fidelity guard catch real errors? The thresholds were tuned to tolerate
// raster noise; this checks the other side. One slide is converted, then damaged in ways a
// converter bug could damage it, and the guard must reject each damaged copy.
//   S5_ROUNDS=1 node dev-guard-check.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImportEnv } from './lib/engine.mjs';

if (process.env.S5_ROUNDS !== '1') {
  console.error('run with S5_ROUNDS=1 (judge only, no fallback)');
  process.exit(2);
}
const here = dirname(fileURLToPath(import.meta.url));

const cases = [
  { file: 'handwritten.html', before: 'show(2)', js: "document.querySelectorAll('.slide')[2]", label: 'handwritten slide 3 (text + image, 1280 design)' },
  { file: 'reveal.html', before: 'Reveal.configure({controls:false,progress:false}); Reveal.slide(2,0)', selector: '.reveal', label: 'reveal slide 3 (cards, scaled stage)' },
];

const damages = [
  ['text colour a little lighter', (s) => { const t = firstText(s); t.runs.forEach((r) => (r.marks.color = lighten(r.marks.color))); }],
  ['text weight 400 <-> 700', (s) => { const t = firstText(s); t.runs.forEach((r) => (r.marks.weight = r.marks.weight >= 600 ? 400 : 700)); }],
  ['text 4% larger', (s) => { const t = firstText(s); t.runs.forEach((r) => (r.marks.size *= 1.04)); t.base.size *= 1.04; }],
  ['text moved 3px down', (s) => { firstText(s).frame.y += 3 * s.k; }],
  ['text box 12% narrower (rewrap)', (s) => { const t = longestText(s); t.frame.w *= 0.88; t.nowrap = false; }],
  ['one text element missing', (s) => { s.elements.splice(s.elements.indexOf(firstText(s)), 1); }],
  ['last character of a text dropped', (s) => { const t = longestText(s); const r = t.runs[t.runs.length - 1]; r.text = r.text.slice(0, -1); }],
  ['box moved 4px right', (s) => { const e = firstOf(s, ['shape', 'image']); if (e) e.frame.x += 4 * s.k; else return 'skip'; }],
  ['box fill slightly different', (s) => { const e = firstOf(s, ['shape']); if (e?.fill?.color) e.fill.color = lighten(e.fill.color); else return 'skip'; }],
  ['box shadow removed', (s) => { const e = s.elements.find((x) => x.shadow); if (e) delete e.shadow; else return 'skip'; }],
  ['corner radius removed', (s) => { const e = s.elements.find((x) => x.radius); if (e) delete e.radius; else return 'skip'; }],
  ['image missing', (s) => { const e = firstOf(s, ['image']); if (e) s.elements.splice(s.elements.indexOf(e), 1); else return 'skip'; }],
  ['background colour slightly different', (s) => { if (s.background?.color) s.background.color = lighten(s.background.color); else return 'skip'; }],
];

const firstText = (s) => s.elements.find((e) => e.type === 'text');
const longestText = (s) => s.elements.filter((e) => e.type === 'text').sort((a, b) => b.runs.map((r) => r.text).join('').length - a.runs.map((r) => r.text).join('').length)[0];
const firstOf = (s, types) => s.elements.find((e) => types.includes(e.type));
function lighten(color) {
  const m = color.match(/[\d.]+/g).map(Number);
  // +10 per channel (of 255), away from the nearer end
  const shift = (v) => (v > 128 ? v - 10 : v + 10);
  return `rgb(${shift(m[0])}, ${shift(m[1])}, ${shift(m[2])})`;
}

let caught = 0;
let total = 0;
for (const c of cases) {
  const env = await ImportEnv.open(join(here, 'fixtures', c.file), join(here, 'out', 'dev-guard'));
  const slide = await env.capture({ before: c.before, js: c.js, selector: c.selector, waitMs: 800 });
  const sourcePng = readFileSync(join(env.outDir, `${slide.id}-source.png`));
  console.log(`\n${c.label}: undamaged -> ${slide.metrics.faithful ? 'accepted' : 'REJECTED (unexpected)'}`);
  for (const [name, damage] of damages) {
    const copy = structuredClone(slide);
    if (damage(copy) === 'skip') continue;
    const verdict = await env.guard(copy, sourcePng);
    total++;
    if (!verdict.faithful) caught++;
    console.log(`  ${verdict.faithful ? 'MISSED ' : 'caught '} ${name}`);
  }
  await env.close();
}
console.log(`\nguard caught ${caught} of ${total} injected errors`);
