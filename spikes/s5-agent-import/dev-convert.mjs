// Spike S5 development harness: exercises the capture engine WITHOUT the agent, with capture
// targets written by hand for the two synthetic fixtures. It exists to debug the converter and
// the fidelity guard cheaply; it is not part of the import design (the agent finds the slides).
//   node dev-convert.mjs handwritten|reveal
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ImportEnv } from './lib/engine.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const which = process.argv[2] || 'handwritten';

const plans = {
  handwritten: Array.from({ length: 6 }, (_, i) => ({ before: `show(${i})`, js: `document.querySelectorAll('.slide')[${i}]` })),
  // What an agent has to work out for this deck: the slide is the whole stage, not the <section>
  // (which is only as tall as its content); the navigation chrome must be switched off; fragments
  // must be shown.
  reveal: [[0, 0], [1, 0], [2, 0], [2, 1], [3, 0], [4, 0], [5, 0]].map(([h, v]) => ({
    before: `Reveal.configure({ controls: false, progress: false }); Reveal.slide(${h}, ${v}); Reveal.getCurrentSlide().querySelectorAll('.fragment').forEach((f) => f.classList.add('visible'));`,
    js: "document.querySelector('.reveal .slides')",
    waitMs: 900,
  })),
  // The same deck captured from the outer stage, as the agent chose to do in its first run: the
  // slides sit inside an element that the player scales to fit the window.
  'reveal-stage': [[0, 0], [1, 0], [2, 0], [2, 1], [3, 0], [4, 0], [5, 0]].map(([h, v]) => ({
    before: `Reveal.configure({ controls: false, progress: false }); Reveal.slide(${h}, ${v}); Reveal.getCurrentSlide().querySelectorAll('.fragment').forEach((f) => f.classList.add('visible'));`,
    selector: '.reveal',
    waitMs: 900,
  })),
  // The real third-party deck, with the targets the agent found in its run (out/example/run.log).
  example: Array.from({ length: 35 }, (_, i) => ({
    before: `const ds = document.querySelector('deck-stage'); ds.shadowRoot.querySelectorAll('.rail,.rail-resize,.overlay').forEach((e) => (e.style.display = 'none')); ds._go(${i});`,
    js: `document.querySelector('deck-stage').children[${i}]`,
    waitMs: 300,
  })),
};

const env = await ImportEnv.open(join(here, 'fixtures', which === 'example' ? '../../../examples/E-CIX NG - standalone.html' : `${which.split('-')[0]}.html`), join(here, 'out', `dev-${which}`));
console.log((await env.inspect({ depth: 2, maxNodes: 30 })).slice(0, 1500));
for (const step of plans[which]) {
  const slide = await env.capture(step);
  const m = slide.metrics;
  console.log(
    `${slide.id}: faithful=${m.faithful} diff=${m.diffPct}% (${m.diffPx}px) rounds=${m.rounds} editability=${m.editability}% text=${m.textEditability}% ` +
      `[${Object.entries(m.counts).filter(([, n]) => n).map(([t, n]) => `${n} ${t}`).join(', ')}] bg=${JSON.stringify(slide.background).slice(0, 60)} ${m.ms}ms`,
  );
  for (const f of m.fallbacks) console.log(`     fallback -> html ${f.as}${f.deep ? ' (subtree)' : ' (own box)'}: ${f.reason}`);
  for (const e of slide.elements.filter((x) => x.type === 'html' && !m.fallbacks.some((f) => f.as === x.name))) console.log(`     html ${e.name}: ${e.reason}`);
}
env.save();
await env.close();
