// Runs one HTML import in the app this working tree runs (see cdp.mjs), with the real agent,
// and writes what the app measured: the report the import panel shows, built from the app's
// own record, plus the calls the agent made.
//   node scripts/import/run-import.mjs <file.html> <out.json> [--model sonnet] [--confirm]
// The deck that is open is replaced by a new one. Costs usage on the signed-in account.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : (args[at + 1] ?? '');
};
const [file, outFile] = args;
const model = flag('model') ?? 'haiku';
const confirm = args.includes('--confirm');
const LIMIT_MS = 25 * 60 * 1000;

const { browser, main } = await connect();
const page = main();
if (!page) throw new Error('the app window was not found');
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300));
});

await page.evaluate(
  async (settings) => {
    localStorage.setItem('slidr.agent', JSON.stringify(settings));
    const { newDeck, syncFileState } = await import('/src/shell/editor.tsx');
    await window.slidr.document.create(newDeck('he'));
    syncFileState(window.slidr);
  },
  { model, webAccess: false },
);

const started = Date.now();
const startedOk = await page.evaluate(
  async ({ path, confirm }) => {
    try {
      return { ok: await window.slidrImport.start(window.slidr, { path }, { confirm }) };
    } catch (error) {
      return { error: String(error?.message ?? error) };
    }
  },
  { path: resolve(file), confirm },
);
if (!startedOk.ok) throw new Error(`the import did not start: ${JSON.stringify(startedOk)}`);

/** The state of the import chat and of the app's record, read from the page. */
const read = () =>
  page.evaluate(async () => {
    const handle = window.slidrImport;
    const chat = handle.thread().store.getState();
    const report = await handle.report();
    const deck = window.slidr.bus.deck;
    const records = handle.state.getState().records;
    const turns = chat.entries
      .filter((e) => e.type === 'assistant')
      .map((e) => ({
        outcome: e.outcome ?? null,
        problem: e.problem ?? null,
        costUsd: e.costUsd ?? null,
        durationMs: e.durationMs ?? null,
        usage: e.usage ?? null,
        tools: e.parts.filter((p) => p.type === 'tool').map((p) => `${p.name}:${p.state}`),
        text: e.parts
          .filter((p) => p.type === 'text')
          .map((p) => p.text)
          .join('\n')
          .slice(0, 4000),
      }));
    return {
      busy: chat.busy,
      activity: chat.activity,
      turns,
      report,
      deck: {
        title: deck.meta.title,
        lang: deck.meta.lang,
        dir: deck.meta.dir,
        slides: deck.slides.map((s, i) => ({
          number: i + 1,
          id: s.id,
          name: s.name ?? null,
          notes: s.notes
            ? s.notes.paragraphs
                .map((p) => p.runs.map((r) => r.text).join(''))
                .join(' / ')
                .slice(0, 120)
            : null,
          elements: s.elements.reduce(
            (acc, e) => ((acc[e.type] = (acc[e.type] ?? 0) + 1), acc),
            {},
          ),
          imported: Boolean(records[s.id]),
        })),
        assets: Object.values(deck.assets).reduce(
          (acc, a) => ((acc[a.kind] = (acc[a.kind] ?? 0) + 1), acc),
          {},
        ),
        fonts: Object.values(deck.assets)
          .filter((a) => a.kind === 'font')
          .map((a) => `${a.font?.family} ${a.font?.weight} ${a.font?.style}`),
      },
    };
  });

let approved = false;
let last = '';
for (;;) {
  await new Promise((r) => setTimeout(r, 3000));
  const now = await read();
  const line = `${now.busy ? 'busy' : 'idle'} turns:${now.turns.length} slides:${now.report.rows.length} ${JSON.stringify(now.activity ?? '')}`;
  if (line !== last) console.log(`[${Math.round((Date.now() - started) / 1000)}s]`, line);
  last = line;
  const done = !now.busy && now.turns.length > 0 && now.turns.at(-1).outcome !== null;
  if (
    done &&
    confirm &&
    !approved &&
    now.report.rows.length === 0 &&
    now.turns.at(-1).outcome === 'completed'
  ) {
    // The plan is on the table: approve it, as the panel's button does.
    approved = true;
    await page.evaluate(async () => {
      const { i18n } = await import('/src/i18n/index.ts');
      void window.slidrImport.thread().send(i18n.t('message.approve', { ns: 'import' }));
    });
    continue;
  }
  if (done || Date.now() - started > LIMIT_MS) {
    const result = { file, model, confirm, wallMs: Date.now() - started, timedOut: !done, ...now };
    writeFileSync(outFile, JSON.stringify(result, null, 1));
    const r = now.report;
    console.log(
      JSON.stringify({
        slides: r.rows.length,
        faithful: r.faithful,
        approximate: r.approximate,
        medianEditability: r.medianEditability,
        medianText: r.medianTextEditability,
        wholeHtml: r.wholeHtml,
        agentMs: r.durationMs,
        costUsd: r.costUsd,
        turns: r.turns,
        blocked: r.blocked.length,
        outcome: now.turns.at(-1)?.outcome,
        problem: now.turns.at(-1)?.problem,
      }),
    );
    break;
  }
}
await browser.close();
