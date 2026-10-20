// Development probe: drives the import page of the running app without an agent.
//   node scripts/import/probe.mjs <file.html> [selector-or-js-for-capture]
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { connect } from './cdp.mjs';

const [file, target] = process.argv.slice(2);
const { browser, main, pages } = await connect();
const page = main();
if (!page) throw new Error('the app window was not found');
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[main console]', m.text().slice(0, 300));
});

const result = await page.evaluate(
  async ({ path, target }) => {
    const session = await import('/src/import/session.ts');
    const editor = window.slidr;
    window.__probeImporter ??= session.createImporter(editor);
    const importer = window.__probeImporter;
    const out = {};
    const t0 = performance.now();
    try {
      out.file = await session.openImport(editor, { path });
      out.loadMs = Math.round(performance.now() - t0);
      out.inspect = await importer.inspect({ depth: 3, maxNodes: 60 });
      out.eval = await importer.evaluate(
        'return { href: location.href, w: innerWidth, h: innerHeight, top: window.top === window, ls: typeof localStorage, vis: document.visibilityState }',
      );
      const shot = await importer.screenshot({ maxWidth: 800 });
      out.shot = { width: shot.width, height: shot.height, data: shot.data };
      if (target) {
        const t1 = performance.now();
        const request = target.startsWith('js:') ? { js: target.slice(3) } : { selector: target };
        const captured = await importer.capture(editor.bus.deck, request);
        out.captureMs = Math.round(performance.now() - t1);
        out.capture = {
          faithful: captured.faithful,
          exact: captured.exact,
          whole: captured.wholeSlideHtml,
          editability: captured.editability,
          text: captured.textEditability,
          elements: captured.slide.elements.map((e) => e.type).join(','),
          assets: captured.assets.map((a) => `${a.kind}:${a.font?.family ?? a.mime}`),
          notes: captured.notes,
          source: captured.source,
        };
      }
      out.blocked = await session.refreshBlocked();
    } catch (error) {
      out.error = String(error?.message ?? error);
    }
    return out;
  },
  { path: resolve(file), target },
);

if (result.shot?.data) {
  if (process.env.SHOT) writeFileSync(process.env.SHOT, Buffer.from(result.shot.data, 'base64'));
  result.shot.data = `(${result.shot.data.length} base64 chars)`;
}
console.log(JSON.stringify(result, null, 1));
console.log(
  'pages:',
  pages().map((p) => p.url()),
);
await browser.close();
