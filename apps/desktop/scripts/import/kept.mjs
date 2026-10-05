// Proof, in the real windows of the running app and with no agent, that an import is kept with
// its deck and goes on after it was cut (IMP-07, IMP-09): the source file and the record in the
// workspace and in the saved file, through "save as" and reopening; the source closed to the
// editor's own page; the import back when the deck is opened; the page again from the kept
// source; and the same after the app was killed.
//   node scripts/import/kept.mjs <file.html> <folder for the saved decks>          the whole round
//   node scripts/import/kept.mjs <file.html> <folder> --phase before-crash         then kill the app,
//   node scripts/import/kept.mjs <file.html> <folder> --phase after-crash          start it, and run this
// The file is a deck of six `section` slides shown by `show(n)`, as e2e/import-set/handwritten.html
// is. The deck that is open is replaced. The captures are asked for as the agent's tool asks.
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { connect } from './cdp.mjs';

const args = process.argv.slice(2);
const phaseAt = args.indexOf('--phase');
const phase = phaseAt < 0 ? 'all' : args[phaseAt + 1];
const [file, folder] = args.filter(
  (arg, i) => !arg.startsWith('--') && (phaseAt < 0 || i !== phaseAt + 1),
);
if (!file || !folder) throw new Error('usage: kept.mjs <file.html> <folder> [--phase …]');
const source = resolve(file);
const out = resolve(folder);
mkdirSync(out, { recursive: true });

const { browser, main, importPage } = await connect();
const page = main();
if (!page) throw new Error('the app window was not found');

const rows = [];
const note = (what, result, ok) => {
  rows.push({ what, result: String(result).slice(0, 150), ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}: ${String(result).slice(0, 150)}`);
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

const slide = (n, first) => ({
  js: `document.querySelectorAll('section')[${n}]`,
  before: `${first ? "counter.style.display = 'none'; " : ''}show(${n});`,
  name: `Slide ${n + 1}`,
});

/** The session and the deck, as the app holds them. */
const read = () =>
  page.evaluate(() => {
    const state = window.slidrImport.state.getState();
    const editor = window.slidr;
    return {
      file: state.file,
      open: state.open,
      kept: state.kept,
      phase: state.phase,
      planned: state.planned,
      records: Object.keys(state.records).length,
      slides: editor.bus.deck.slides.map((s) => s.name ?? null),
      workspace: editor.document?.workspace ?? null,
      banner: document.querySelector('[data-testid="import-cut"]')?.textContent ?? null,
      count: document.querySelector('[data-testid="import-count"]')?.textContent ?? null,
    };
  });
const call = (name, input) =>
  page.evaluate(({ name, input }) => window.slidrImport.call(name, input), { name, input });
const capture = async (from, to, total) => {
  const slides = [];
  for (let n = from; n < to; n++) slides.push(slide(n, n === from));
  const viewport = await call('import_set_viewport', { width: 1280, height: 720 });
  if (!viewport.ok) return viewport;
  return call('import_capture', { ...(total ? { total } : {}), slides });
};
/** What the workspace has on the disk of the source and of the record. */
const onDisk = (dir) => {
  const kept = join(dir, 'source', 'import.html');
  const record = join(dir, 'source', 'import.json');
  return {
    source: existsSync(kept) ? readFileSync(kept) : null,
    record: existsSync(record) ? JSON.parse(readFileSync(record, 'utf8')) : null,
  };
};
const original = readFileSync(source);

async function start() {
  await page.evaluate(async () => {
    const { newDeck, syncFileState } = await import('/src/shell/editor.tsx');
    await window.slidr.document.create(newDeck('he'));
    syncFileState(window.slidr);
  });
  const opened = await page.evaluate(
    (path) => window.slidrImport.open({ path }).catch((error) => `FAILED ${error?.message}`),
    source,
  );
  note('a session opens on the file', opened, !String(opened).startsWith('FAILED'));
  const first = await capture(0, 3, 6);
  note(
    'three of six slides are captured',
    first.ok ? `${first.data.captured.length} captured` : JSON.stringify(first.error),
    first.ok && first.data.captured.length === 3 && first.data.captured.every((s) => s.slideId),
  );
  // The record is written as each slide comes in, and the deck is flushed after it.
  await sleep(800);
  return read();
}

function checkDisk(label, dir, slides) {
  const disk = onDisk(dir);
  note(
    `${label}: source/import.html is the file, byte for byte`,
    disk.source ? `${disk.source.length} bytes` : 'missing',
    Boolean(disk.source) && disk.source.equals(original),
  );
  const records = Object.values(disk.record?.records ?? {});
  note(
    `${label}: source/import.json has the slides, what each came from, and the plan`,
    disk.record
      ? `${records.length} records, planned ${disk.record.planned}, phase ${disk.record.phase}, from ${JSON.stringify(records[0]?.from ?? null)}`
      : 'missing',
    records.length === slides && disk.record.planned === 6 && records.every((r) => r.from?.js),
  );
  const deckFile = join(dir, 'deck.json');
  const deck = existsSync(deckFile) ? JSON.parse(readFileSync(deckFile, 'utf8')) : null;
  note(
    `${label}: deck.json in the workspace has the slides the record names`,
    deck ? `${deck.slides.length} slides` : 'no deck.json',
    Boolean(deck) &&
      Object.keys(disk.record?.records ?? {}).every((id) => deck.slides.some((s) => s.id === id)),
  );
}

async function finish(label) {
  const reopened = await page.evaluate(() =>
    window.slidrImport.reopen().then(
      () => 'reopened',
      (error) => `FAILED ${error?.message}`,
    ),
  );
  note(
    `${label}: the isolated page opens again from the kept source`,
    reopened,
    reopened === 'reopened',
  );
  note(
    `${label}: the import window is there again`,
    importPage()?.url() ?? 'none',
    Boolean(importPage()),
  );
  // Before any call of the agent's reaches the new page: what its turn is told.
  const told = await page.evaluate(() => window.slidrImport.brief(true));
  note(
    `${label}: the turn that goes on is told what was captured, and that the page is a new one`,
    told.split('\n').filter((line) => line.startsWith('captured: ')).length + ' captured lines',
    told.includes('captured_slides: 3') && /The isolated page was closed\./.test(told),
  );
  const sections = await call('import_eval', {
    code: 'return document.querySelectorAll("section").length',
  });
  note(
    `${label}: the file runs in it`,
    sections.ok ? sections.data.result : JSON.stringify(sections.error),
    sections.ok && sections.data.result === '6',
  );
  const rest = await capture(3, 6);
  note(
    `${label}: the three slides that were missing are captured`,
    rest.ok
      ? `${rest.data.captured.length} captured, ${rest.data.slidesInDeck} in the deck`
      : JSON.stringify(rest.error),
    rest.ok && rest.data.captured.length === 3 && rest.data.slidesInDeck === 6,
  );
  await page.evaluate(() => window.slidrImport.turnEnded(true));
  await sleep(500);
  const after = await read();
  note(
    `${label}: six slides in the order of the file, none twice, and nothing left to continue`,
    `${after.slides.join(', ')} | phase ${after.phase} | ${after.count}`,
    after.slides.join() === [1, 2, 3, 4, 5, 6].map((n) => `Slide ${n}`).join() &&
      after.phase === 'idle' &&
      after.banner === null,
  );
}

if (phase === 'all') {
  const begun = await start();
  note(
    'the import is at work',
    `phase ${begun.phase}, ${begun.records} records`,
    begun.phase === 'working',
  );
  checkDisk('workspace', begun.workspace.dir, 3);

  // The editor's own page cannot load the source: the asset protocol serves the workspace's
  // files, and is closed to `source/`.
  const served = await page.evaluate(async (dir) => {
    const url = (path) => window.__TAURI_INTERNALS__.convertFileSrc(path);
    const status = async (path) => {
      try {
        return (await fetch(url(path))).status;
      } catch (error) {
        return `threw ${error?.name}`;
      }
    };
    return {
      deck: await status(`${dir}\\deck.json`),
      source: await status(`${dir}\\source\\import.html`),
      record: await status(`${dir}\\source\\import.json`),
    };
  }, begun.workspace.dir);
  note(
    "the editor's page is refused the source by the asset protocol, and served the deck",
    JSON.stringify(served),
    served.deck === 200 && served.source !== 200 && served.record !== 200,
  );

  // Save, and "save as": the same workspace packed into another file, after the record moved on.
  const first = join(out, 'kept-first.slidr');
  const second = join(out, 'kept-second.slidr');
  for (const path of [first, second]) rmSync(path, { force: true });
  const saved = await page.evaluate(
    async ([a, b]) => {
      const document = window.slidr.document;
      await document.saveAs(a);
      await document.saveAs(b);
      return document.path;
    },
    [first, second],
  );
  note(
    'the deck is saved, and saved as another file',
    saved,
    saved === second && existsSync(first),
  );

  // Another document takes the window: the session and its window go.
  await page.evaluate(async () => {
    const { newDeck, syncFileState } = await import('/src/shell/editor.tsx');
    await window.slidr.document.create(newDeck('he'));
    syncFileState(window.slidr);
  });
  await sleep(800);
  const away = await read();
  note(
    'another document: no import, and no import window',
    `file ${away.file}, window ${importPage()?.url() ?? 'none'}`,
    away.file === null && !importPage(),
  );

  for (const [label, path] of [
    ['the first file', first],
    ['the file of "save as"', second],
  ]) {
    await page.evaluate(async (path) => {
      const { syncFileState } = await import('/src/shell/editor.tsx');
      await window.slidr.document.open(path);
      syncFileState(window.slidr);
    }, path);
    await sleep(1200);
    const back = await read();
    note(
      `${label}, opened again: the import is back, cut where it stood, with no page`,
      `file ${back.file}, ${back.records} records, planned ${back.planned}, phase ${back.phase}, open ${back.open}, ${back.slides.length} slides`,
      back.file !== null &&
        back.records === 3 &&
        back.planned === 6 &&
        back.phase === 'cut' &&
        !back.open &&
        back.kept,
    );
    note(
      `${label}: the panel is open on it and offers to continue`,
      `${back.banner} | ${back.count}`,
      Boolean(back.banner) && /3/.test(back.count ?? ''),
    );
    checkDisk(`${label}, unpacked`, back.workspace.dir, 3);
    if (path === second) {
      await finish(label);
      const copy = join(out, 'kept-copy.html');
      rmSync(copy, { force: true });
      const exported = await page.evaluate(
        ([workspaceId, path]) =>
          window.__TAURI_INTERNALS__.invoke('import_source_export', { workspaceId, path }).then(
            (bytes) => `${bytes} bytes`,
            (error) => `FAILED ${JSON.stringify(error)}`,
          ),
        [back.workspace.id, copy],
      );
      note(
        'a copy of the source is written where the user says, byte for byte',
        exported,
        existsSync(copy) && readFileSync(copy).equals(original),
      );
    }
  }
} else if (phase === 'before-crash') {
  const begun = await start();
  checkDisk('workspace', begun.workspace.dir, 3);
  console.log(
    `workspace ${begun.workspace.id}: kill the app now, start it again, and run --phase after-crash`,
  );
} else if (phase === 'after-crash') {
  // The workspace the crash left is offered for recovery: the third button recovers.
  for (let i = 0; i < 40; i++) {
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
    if ((await dialog.count()) > 0) {
      await dialog.locator('button').nth(2).click();
      break;
    }
    if ((await read()).file) break;
    await sleep(500);
  }
  await sleep(1500);
  const back = await read();
  note(
    'recovered after the crash: the import is back, cut, with what was captured',
    `file ${back.file}, ${back.records} records, phase ${back.phase}, ${back.slides.length} slides, open ${back.open}`,
    back.file !== null &&
      back.records === 3 &&
      back.slides.length === 3 &&
      back.phase === 'cut' &&
      !back.open,
  );
  note(
    'the panel is open on it and offers to continue',
    `${back.banner} | ${back.count}`,
    Boolean(back.banner),
  );
  checkDisk('the recovered workspace', back.workspace.dir, 3);
  await finish('after the crash');
} else {
  throw new Error(`unknown phase ${phase}`);
}

const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length} of ${rows.length} as expected`);
await browser.close();
process.exit(failed.length > 0 ? 1 : 0);
