// Development probe: one capture through the real job path of the import window (fonts as
// assets, overlay check, validation left out), for the file that is loaded there.
//   node scripts/import/capture.mjs "<selector>" ["<before>"] [width height]
import { connect } from './cdp.mjs';

const [selector, before, width, height] = process.argv.slice(2);
const { browser, main } = await connect();
const page = main();
const out = await page.evaluate(
  async ({ selector, before, width, height }) => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    const { sourceDeck } = await import('/src/import/session.ts');
    const deck = sourceDeck(window.slidr.bus.deck);
    try {
      if (width) {
        await invoke('import_run_job', {
          job: { kind: 'viewport', size: { width: Number(width), height: Number(height) } },
        });
      }
      const target = selector.startsWith('js:') ? { js: selector.slice(3) } : { selector };
      const r = await invoke('import_run_job', {
        job: {
          kind: 'capture',
          request: { ...target, before: before || undefined, deck, takenIds: [] },
        },
        timeoutMs: 120000,
      });
      const types = {};
      for (const e of r.slide.elements) types[e.type] = (types[e.type] ?? 0) + 1;
      return {
        guard: r.guard,
        editability: r.editability,
        text: r.textEditability,
        source: r.source,
        elements: types,
        assets: r.assets.map((a) =>
          a.kind === 'font' ? `font:${a.font.family} ${a.font.weight}` : a.kind,
        ),
        background: r.slide.background
          ? Object.keys(r.slide.background).join('+') + ':' + r.slide.background.fill.kind
          : null,
        notes: r.notes.slice(0, 12),
        ms: r.ms,
      };
    } catch (error) {
      return { error: error?.message ?? JSON.stringify(error) };
    }
  },
  { selector, before, width, height },
);
console.log(JSON.stringify(out, null, 1));
await browser.close();
