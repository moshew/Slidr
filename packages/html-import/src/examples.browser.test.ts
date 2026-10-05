/**
 * The engine on the decks under `examples/`: a tool for looking, not a test with claims. The
 * folder is not in git (a deck in it is somebody's own), so nothing here runs unless a deck is
 * asked for by name:
 *
 *   VITE_EXAMPLE=dapflow pnpm vitest run --config vitest.browser.config.ts packages/html-import/src/examples
 *   VITE_EXAMPLE=dapflow VITE_SLIDES=2,4 …    only those slides, counted from 0
 *   VITE_EXAMPLE=marp VITE_SELECTOR=section …  the slides are these elements (default `.slide`)
 *   VITE_EXAMPLE=devops VITE_REVEAL=visible …  a class the page's script would have given what it shows
 *
 * Each slide is converted where it stands, and what came out is written under
 * `test-results/examples/`: the tree of elements with what the guard put back as HTML, the
 * slide as JSON, and a picture of the source beside one of the converted slide.
 *
 * The page is loaded without its scripts, so this stands in for the little a script does to
 * show a slide: one slide gets the class `active` at a time and is scrolled to, and what a
 * page draws over its slides (navigation, a counter) is hidden. A deck that lays its slides
 * out by script, or unpacks itself with one, cannot be run here; the import in the app can.
 */
import { createDeck, plainText, type Element } from '@slidr/model';
import { beforeAll, describe, it } from 'vitest';
import { commands, page } from 'vitest/browser';
import { convertSubtree, freezeAnimations, mountSlide } from './engine';
import { foreignFrame, testHost, withAssets } from './testing';

/** Vite's own additions to `import.meta`, which this package's types do not know. */
interface ViteMeta {
  glob(pattern: string, options: object): Record<string, () => Promise<string>>;
  env: Record<string, string | undefined>;
}
const files = (import.meta as unknown as ViteMeta).glob('../../../examples/*.html', {
  query: '?raw',
  import: 'default',
});
const env = (import.meta as unknown as ViteMeta).env;
const ONLY = env.VITE_EXAMPLE;
const SLIDES = (env.VITE_SLIDES ?? '').split(',').filter(Boolean).map(Number);
const SELECTOR = env.VITE_SELECTOR ?? '.slide';
const REVEAL = env.VITE_REVEAL;
const SIZE = { w: 1920, h: 1080 };
const OUT = 'test-results/examples';

/** The tree of a slide, a line for each element: what it is, where, and what it holds. */
function outline(elements: readonly Element[], depth = 0): string[] {
  const lines: string[] = [];
  for (const e of elements) {
    const f = e.frame;
    const at = `${f.x.toFixed(1)},${f.y.toFixed(1)} ${f.w.toFixed(1)}x${f.h.toFixed(1)}`;
    let what = '';
    if (e.type === 'text') {
      what = `${e.content.paragraphs.length}p ${JSON.stringify(plainText(e.content).slice(0, 60))}`;
    } else if (e.type === 'shape') {
      what = [
        e.geometry.kind === 'preset' ? e.geometry.preset : 'path',
        e.fill.kind,
        e.stroke ? `stroke ${e.stroke.width}` : '',
        e.accent ? `accent ${e.accent.side} ${e.accent.size}` : '',
        e.css ? `css{${Object.keys(e.css).join(',')}}` : '',
        e.content ? `text ${JSON.stringify(plainText(e.content).slice(0, 40))}` : '',
      ]
        .filter(Boolean)
        .join(' ');
    } else if (e.type === 'html') what = `${e.markup.length} chars`;
    lines.push(`${'  '.repeat(depth)}${e.type} ${e.name ?? ''} [${at}] ${what}`);
    if (e.type === 'group') lines.push(...outline(e.children, depth + 1));
  }
  return lines;
}

function count(elements: readonly Element[], into: Record<string, number> = {}) {
  for (const e of elements) {
    into[e.type] = (into[e.type] ?? 0) + 1;
    if (e.type === 'group') count(e.children, into);
  }
  return into;
}

const twoFrames = () =>
  new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

beforeAll(async () => {
  await page.viewport(SIZE.w, SIZE.h);
});

describe.skipIf(!ONLY)('the decks under examples/', () => {
  const asked = Object.entries(files).filter(([path]) => ONLY && path.includes(ONLY));
  it.skipIf(asked.length > 0)('finds the deck that was asked for', () => {
    throw new Error(`No file under examples/ has "${ONLY}" in its name.`);
  });
  for (const [path, load] of asked) {
    const name = path.split('/').pop()!.replace('.html', '');
    it(name, { timeout: 600_000 }, async () => {
      const host = testHost();
      const frame = await foreignFrame(await load(), SIZE);
      const summary: string[] = [];
      try {
        const doc = frame.document;
        const slides = Array.from(doc.querySelectorAll<HTMLElement>(SELECTOR));
        for (const el of Array.from(doc.body.querySelectorAll<HTMLElement>('*'))) {
          if (slides.some((s) => s.contains(el) || el.contains(s))) continue;
          const position = doc.defaultView!.getComputedStyle(el).position;
          if (position === 'fixed' || position === 'absolute')
            el.style.setProperty('display', 'none', 'important');
        }
        for (const [index, slide] of slides.entries()) {
          if (SLIDES.length > 0 && !SLIDES.includes(index)) continue;
          for (const other of slides) other.classList.toggle('active', other === slide);
          if (REVEAL)
            for (const el of Array.from(slide.querySelectorAll('*'))) el.classList.add(REVEAL);
          slide.scrollIntoView({ block: 'start', behavior: 'instant' });
          await twoFrames();
          freezeAnimations(doc);
          await twoFrames();
          const id = `${name.replace(/[^a-z0-9]+/gi, '-')}-${String(index).padStart(2, '0')}`;
          const started = performance.now();
          const deck = createDeck({ lang: 'he' });
          const r = await convertSubtree(slide, { deck, host, foreign: true, behind: 'page' });
          const ms = Math.round(performance.now() - started);
          const counts = Object.entries(count(r.slide.elements))
            .map(([type, n]) => `${n} ${type}`)
            .join(', ');
          const head = `${id}: editability ${(r.editability * 100).toFixed(0)}%, text ${(r.textEditability * 100).toFixed(0)}%, faithful ${r.guard.faithful}, rounds ${r.guard.rounds}, ${ms} ms, ${counts}`;
          summary.push(head);
          await commands.writeFile(
            `${OUT}/${id}.txt`,
            [
              head,
              '',
              ...r.guard.fallbacks.map((f) => `fallback: ${f.reason} (${f.copy})`),
              ...r.notes.map((n) => `note: ${n}`),
              '',
              ...outline(r.slide.elements),
            ].join('\n'),
          );
          await commands.writeFile(`${OUT}/${id}.json`, JSON.stringify(r.slide, null, 1));
          await page.screenshot({ path: `../../../${OUT}/${id}-source.png` });
          const shown = await mountSlide(withAssets(deck, r.assets), r.slide, host, {
            origin: { x: 0, y: 0 },
            viewScale: 1,
            k: 1,
            offX: 0,
            offY: 0,
          });
          try {
            await twoFrames();
            await page.screenshot({ path: `../../../${OUT}/${id}-converted.png` });
          } finally {
            shown.dispose();
          }
        }
      } finally {
        frame.dispose();
        await commands.writeFile(`${OUT}/${name}-summary.txt`, summary.join('\n'));
      }
    });
  }
});
