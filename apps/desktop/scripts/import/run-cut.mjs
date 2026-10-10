// Runs one HTML import in the app this working tree runs (see cdp.mjs), with the real agent,
// cuts it in the middle and continues it (IMP-09), and writes what the app held at each point.
//   node scripts/import/run-cut.mjs <file.html> <out.json> --cut stop|kill|app [--after 2] [--model sonnet]
//   node scripts/import/run-cut.mjs <file.html> <out.json> --continue
// `stop` presses Stop, as the chat's button does. `kill` kills the agent's process: the children
// of this app's own process that are not its webviews. Either is done once `--after` slides have
// been captured, while the capture is still going, and then the import is continued as the
// panel's button continues it. `app` kills the app itself and ends there: start the app again and
// run `--continue`, which recovers the workspace the crash left and continues the import in it.
// The deck that is open is replaced.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? undefined : (args[at + 1] ?? '');
};
const [file, outFile] = args;
const model = flag('model') ?? 'sonnet';
const continuing = args.includes('--continue');
const cut = continuing ? 'app' : (flag('cut') ?? 'stop');
const after = Number(flag('after') ?? 2);
const LIMIT_MS = 20 * 60 * 1000;
if (!['stop', 'kill', 'app'].includes(cut)) throw new Error('--cut is stop, kill or app');

const { browser, main } = await connect();
const page = main();
if (!page) throw new Error('the app window was not found');
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console]', m.text().slice(0, 300));
});
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const began = Date.now();
const at = () => `[${((Date.now() - began) / 1000).toFixed(1)}s]`;

/** The chat, the record and the deck, as the app holds them now. */
const read = () =>
  page.evaluate(async () => {
    const handle = window.slidrImport;
    const state = handle.state.getState();
    const chat = handle.thread()?.store.getState() ?? { busy: false, entries: [] };
    const deck = window.slidr.bus.deck;
    const report = await handle.report();
    return {
      file: state.file,
      busy: chat.busy,
      phase: state.phase,
      open: state.open,
      planned: state.planned,
      records: Object.keys(state.records).length,
      banner: document.querySelector('[data-testid="import-cut"]')?.textContent ?? null,
      workspace: window.slidr.document?.workspace ?? null,
      turns: chat.entries
        .filter((e) => e.type === 'assistant')
        .map((e) => ({
          outcome: e.outcome ?? null,
          problem: e.problem ?? null,
          tools: e.parts.filter((p) => p.type === 'tool').map((p) => `${p.name}:${p.state}`),
          text: e.parts
            .filter((p) => p.type === 'text')
            .map((p) => p.text)
            .join('\n')
            .slice(0, 1500),
        })),
      users: chat.entries.filter((e) => e.type === 'user').map((e) => e.text),
      slides: deck.slides.map((s, i) => ({
        number: i + 1,
        id: s.id,
        name: s.name ?? null,
        elements: s.elements.reduce((acc, e) => ((acc[e.type] = (acc[e.type] ?? 0) + 1), acc), {}),
        from: state.records[s.id]?.from ?? null,
      })),
      report: report && {
        slides: report.rows.length,
        faithful: report.faithful,
        measured: report.measured,
        medianEditability: report.medianEditability,
        medianTextEditability: report.medianTextEditability,
        wholeHtml: report.wholeHtml,
      },
    };
  });

/** The session of the harness that the deck's chat index names, to see whether it was resumed. */
const nativeSession = (workspace) => {
  const index = workspace && join(workspace.dir, 'chat', 'threads.json');
  if (!index || !existsSync(index)) return null;
  return JSON.parse(readFileSync(index, 'utf8')).threads?.import?.nativeSessionId ?? null;
};

/** Where this working tree builds its app: only that app, and its agent, are killed. */
const TARGET = fileURLToPath(new URL('../../../../target', import.meta.url));

/** Kills this app (`app`), or what it started apart from its webviews: the agent. */
function kill(what) {
  const victims =
    what === 'app'
      ? '$kids = $app'
      : `$kids = @()
    foreach ($a in $app) {
      $kids += Get-CimInstance Win32_Process -Filter "ParentProcessId=$($a.ProcessId)" |
        Where-Object { $_.Name -ne 'msedgewebview2.exe' }
    }`;
  const script = `
    $app = Get-CimInstance Win32_Process -Filter "Name='slidr.exe'" |
      Where-Object { $_.ExecutablePath -like "$env:SLIDR_TARGET\\*" }
    ${victims}
    foreach ($k in $kids) {
      "$($k.Name) $($k.ProcessId)"
      taskkill /PID $k.ProcessId /T /F | Out-Null
    }
  `;
  return execFileSync('powershell', ['-NoProfile', '-Command', script], {
    encoding: 'utf8',
    env: { ...process.env, SLIDR_TARGET: TARGET },
  })
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
}

const result = continuing ? JSON.parse(readFileSync(outFile, 'utf8')) : { file, model, cut, after };
let stage = 'importing';

if (continuing) {
  // The workspace the crash left is offered for recovery: the third button recovers.
  for (let i = 0; i < 40 && !(await read()).file; i++) {
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
    if ((await dialog.count()) > 0) await dialog.locator('button').nth(2).click();
    await sleep(750);
  }
  stage = 'cut';
} else {
  await page.evaluate(
    async (settings) => {
      localStorage.setItem('slidr.agent', JSON.stringify(settings));
      const { newDeck, syncFileState } = await import('/src/shell/editor.tsx');
      await window.slidr.document.create(newDeck('he'));
      syncFileState(window.slidr);
    },
    { model, webAccess: false },
  );
  const started = await page.evaluate(
    (path) =>
      window.slidrImport.start(window.slidr, { path }, { confirm: false }).then(
        (ok) => ({ ok }),
        (error) => ({ error: String(error?.message ?? error) }),
      ),
    resolve(file),
  );
  if (!started.ok) throw new Error(`the import did not start: ${JSON.stringify(started)}`);
}

let last = '';
for (;;) {
  await sleep(stage === 'importing' ? 300 : 2000);
  const now = await read();
  const line = `${stage} ${now.busy ? 'busy' : 'idle'} turns:${now.turns.length} records:${now.records} planned:${now.planned} phase:${now.phase}`;
  if (line !== last) console.log(at(), line);
  last = line;

  if (stage === 'importing' && now.busy && now.records >= after) {
    result.sessionBefore = nativeSession(now.workspace);
    if (cut === 'stop') {
      await page.evaluate(() => void window.slidrImport.thread().stop());
      console.log(at(), `Stop pressed with ${now.records} slides captured`);
    } else {
      result.whenKilled = now;
      result.killed = kill(cut === 'app' ? 'app' : 'agent');
      console.log(at(), `killed with ${now.records} slides captured:`, result.killed.join(', '));
      if (cut === 'app') {
        writeFileSync(outFile, JSON.stringify(result, null, 1));
        console.log(`workspace ${now.workspace.dir}: start the app again and run --continue`);
        process.exit(0);
      }
    }
    stage = 'cut';
    continue;
  }
  if (stage === 'importing' && !now.busy && now.turns.at(-1)?.outcome) {
    // The import ended before it could be cut: nothing to continue.
    result.uncut = now;
    console.log(at(), 'the import ended before the cut');
    break;
  }
  if (stage === 'cut' && !now.busy) {
    // A slide the page was still working on must not come in behind the turn.
    if (!continuing) await sleep(6000);
    const settled = await read();
    result.atCut = settled;
    result.told = await page.evaluate(() => window.slidrImport.brief(false));
    console.log(
      at(),
      `cut: outcome ${settled.turns.at(-1)?.outcome}, ${settled.records} records (${now.records} when the turn ended), ${settled.slides.length} slides, phase ${settled.phase}, open ${settled.open}, banner: ${settled.banner}`,
    );
    const resumed = await page.evaluate(() =>
      window.slidrImport.resume().then(
        () => 'sent',
        (error) => `FAILED ${error?.message}`,
      ),
    );
    console.log(at(), 'continue:', resumed);
    stage = 'continuing';
    continue;
  }
  if (stage === 'continuing' && !now.busy && now.turns.at(-1)?.outcome) {
    result.atEnd = now;
    result.sessionAfter = nativeSession(now.workspace);
    break;
  }
  if (Date.now() - began > LIMIT_MS) {
    result.timedOut = now;
    break;
  }
}

result.wallMs = Date.now() - began;
writeFileSync(outFile, JSON.stringify(result, null, 1));
const end = result.atEnd ?? result.uncut ?? result.timedOut;
console.log(
  JSON.stringify(
    {
      cutAt: result.atCut && {
        slides: result.atCut.slides.length,
        records: result.atCut.records,
        outcome: result.atCut.turns.at(-1)?.outcome,
        problem: result.atCut.turns.at(-1)?.problem?.kind,
      },
      end: end && {
        slides: end.slides.map((s) => s.name),
        report: end.report,
        outcomes: end.turns.map((t) => t.outcome),
        phase: end.phase,
        banner: end.banner,
      },
      sameSession: result.sessionBefore && result.sessionBefore === result.sessionAfter,
      sessions: [result.sessionBefore, result.sessionAfter],
    },
    null,
    1,
  ),
);
await browser.close();
