// Proof, in the real windows of the running app, of what the import window may and may not do
// (SPEC 13.3): which commands it can call, what it can load, and what it shares with the app.
// An import session must be open (run an import first, or probe.mjs).
//   node scripts/import/isolation.mjs
import { connect } from './cdp.mjs';

const { browser, main, importPage, pages } = await connect();
const editor = main();
const page = importPage();
if (!editor || !page) throw new Error('both windows must be open: start an import first');

const rows = [];
const note = (what, result, ok) => rows.push({ what, result: String(result).slice(0, 110), ok });

/* ---- commands, called from the import window's page (where the file's scripts live) ---- */
const call = (command, args) =>
  page.evaluate(
    async ({ command, args }) => {
      try {
        const value = await window.__TAURI_INTERNALS__.invoke(command, args);
        return { ok: true, value: JSON.stringify(value)?.slice(0, 80) };
      } catch (error) {
        return { ok: false, error: typeof error === 'string' ? error : JSON.stringify(error) };
      }
    },
    { command, args },
  );

for (const [command, args] of [
  ['storage_new', {}],
  ['storage_list_recoverable', {}],
  ['recents_list', {}],
  ['asset_import_file', { workspaceId: 'x', path: 'C:/Windows/win.ini' }],
  ['export_write_file', {}],
  ['agent_harnesses', {}],
  ['agent_start', { harnessId: 'mock', thread: 'a/b', config: {} }],
  ['agent_chat_read', { workspaceId: 'x', name: 'deck.jsonl' }],
  ['tool_bridge_connect', {}],
  ['image_providers', {}],
  // The keys and the settings (ADR-051): what a hostile file would reach for first. The ones
  // that write are asked without their arguments, so a gate that let them through would still
  // change nothing.
  ['settings_read', {}],
  ['settings_write', {}],
  ['secret_status', {}],
  ['secret_set', {}],
  ['secret_delete', {}],
  ['stock_search', {}],
  ['stock_import', {}],
  // The commands of ADR-057: one copies assets to a folder beside a file, one reads an asset
  // and stores another.
  ['export_copy_media', {}],
  ['image_process', {}],
  ['image_process_status', {}],
  // Upscaling: it reads an asset and stores another, for as long as a minute of every core.
  ['image_upscale', {}],
  ['image_upscale_cancel', {}],
  ['image_upscale_status', {}],
  ['capture_slide', { request: { deck: { slides: [] } } }],
  ['capture_run_job', { job: {} }],
  ['import_open', { path: 'C:/x.html', thread: 'a/b', workspaceId: 'x' }],
  ['import_run_job', { job: {} }],
  ['import_blocked', {}],
  ['import_close', {}],
  // The source a deck keeps and the record of its import (IMP-07, IMP-09) are the main
  // window's: a file may not open itself again, read or rewrite what the report says of it, or
  // have a copy of the source written somewhere. Asked for a workspace that does not exist, so
  // a gate that let them through would still do nothing.
  ['import_reopen', { file: 'x.html', thread: 'a/b', workspaceId: 'x' }],
  ['import_record_read', { workspaceId: 'x' }],
  ['import_record_write', { workspaceId: 'x', text: '{}' }],
  ['import_source_export', { workspaceId: 'x', path: 'C:/x.html' }],
  ['import_source_remove', { workspaceId: 'x' }],
  ['a_command_that_does_not_exist', {}],
]) {
  const answer = await call(command, args);
  const refused = !answer.ok && /may not call/.test(answer.error);
  note(`app command ${command}`, answer.ok ? `ANSWERED ${answer.value}` : answer.error, refused);
}
for (const [command, args] of [
  ['plugin:dialog|open', { options: {} }],
  ['plugin:path|resolve_directory', { directory: 14 }],
  ['plugin:event|listen', { event: 'x', target: { kind: 'Any' }, handler: 1 }],
  ['plugin:window|get_all_windows', {}],
  ['plugin:webview|create_webview_window', { options: { label: 'x' } }],
]) {
  const answer = await call(command, args);
  note(
    `plugin command ${command}`,
    answer.ok ? `ANSWERED ${answer.value}` : answer.error,
    !answer.ok,
  );
}
// What it may call still answers: a job that is not waiting is refused for that reason, not for
// who asked.
const allowed = await call('import_job_take', { id: 999999 });
note(
  'allowed: import_job_take',
  allowed.ok ? allowed.value : allowed.error,
  /not waiting/.test(allowed.error ?? ''),
);
const clip = await page.evaluate(async () => {
  const png = await window.__TAURI_INTERNALS__.invoke('capture_clip', {
    rect: { x: 0, y: 0, width: 4, height: 4 },
    dpr: devicePixelRatio,
  });
  return png.byteLength;
});
note('allowed: capture_clip', `${clip} bytes of PNG`, clip > 0);

/* ---- network, asked for from inside the frame the imported file runs in ---- */
const tried = await page.evaluate(async () => {
  if (!document.querySelector('iframe[data-slidr-import]')) await window.__slidrImport.page.load();
  const frame = document.querySelector('iframe[data-slidr-import]');
  const view = frame.contentWindow;
  const doc = frame.contentDocument;
  const out = {};
  const stamp = Date.now();
  const attempt = async (name, work) => {
    try {
      out[name] = await Promise.race([
        work(),
        new Promise((r) => setTimeout(() => r('no answer in 4 s'), 4000)),
      ]);
    } catch (error) {
      out[name] = `threw ${error?.name ?? ''}: ${error?.message ?? error}`;
    }
  };
  const status = async (url) => `status ${(await view.fetch(url)).status}`;
  await attempt('fetch https', () => status(`https://example.com/?slidr-probe=${stamp}`));
  await attempt('fetch http', () => status(`http://example.com/?slidr-probe=${stamp}`));
  await attempt('fetch another local port', () => status('http://localhost:1420/'));
  await attempt('fetch asset protocol', () =>
    status('http://asset.localhost/C%3A%5CWindows%5Cwin.ini'),
  );
  const element = (tag, attribute, url, parent) =>
    new Promise((resolve) => {
      const el = doc.createElement(tag);
      if (tag === 'link') el.rel = 'stylesheet';
      el.onload = () => resolve('LOADED');
      el.onerror = () => resolve('error event');
      el[attribute] = url;
      if (parent) parent.append(el);
    });
  await attempt('img', () => element('img', 'src', `https://www.example.com/probe-${stamp}.png`));
  await attempt('script', () =>
    element('script', 'src', `https://unpkg.com/slidr-probe-${stamp}.js`, doc.head),
  );
  await attempt('stylesheet', () =>
    element(
      'link',
      'href',
      `https://fonts.googleapis.com/css2?family=Heebo&probe=${stamp}`,
      doc.head,
    ),
  );
  await attempt(
    'nested frame',
    () =>
      new Promise((resolve) => {
        const inner = doc.createElement('iframe');
        inner.onload = () => {
          let text = 'a document that cannot be read';
          try {
            text = `a document of ${inner.contentDocument.body.textContent.length} characters`;
          } catch {
            // Another origin: the error page of a refused request.
          }
          resolve(text);
        };
        inner.src = `https://example.org/?slidr-probe=${stamp}`;
        doc.body.append(inner);
        setTimeout(() => inner.remove(), 3500);
      }),
  );
  await attempt(
    'websocket',
    () =>
      new Promise((resolve) => {
        let socket;
        try {
          socket = new view.WebSocket('wss://echo.websocket.org/');
        } catch (error) {
          resolve(`threw ${error.name}`);
          return;
        }
        socket.onopen = () => resolve('OPENED');
        socket.onerror = () => resolve('error event');
      }),
  );
  await attempt(
    'sendBeacon',
    async () => `queued: ${view.navigator.sendBeacon(`https://example.com/beacon-${stamp}`, 'x')}`,
  );
  await attempt('window.open', async () => `returned ${view.open('https://example.com/')}`);
  await attempt('top navigation', async () => {
    try {
      view.top.location.href = `https://example.net/?slidr-probe=${stamp}`;
    } catch (error) {
      return `threw ${error.name}`;
    }
    await new Promise((r) => setTimeout(r, 1500));
    return `still at ${location.pathname}`;
  });
  await attempt(
    'localStorage of the app',
    async () =>
      `slidr.shell = ${localStorage.getItem('slidr.shell')}, keys = ${localStorage.length}`,
  );
  return out;
});
const blockedBy = {
  'fetch https': /threw|status 403/,
  'fetch http': /threw|status 403/,
  'fetch another local port': /threw|status 403/,
  'fetch asset protocol': /threw|status 403/,
  img: /error event/,
  script: /error event/,
  stylesheet: /error event/,
  'nested frame': /cannot be read|of 0 characters|no answer/,
  websocket: /threw|error event/,
  sendBeacon: /./,
  'window.open': /returned null/,
  'top navigation': /still at \/import\.html/,
  'localStorage of the app': /slidr\.shell = null/,
};
for (const [name, result] of Object.entries(tried)) {
  note(`from the file: ${name}`, result, blockedBy[name].test(result));
}

/* ---- what the editor itself keeps, to compare, and what Rust wrote down ---- */
const kept = await editor.evaluate(async () => ({
  // The layout of the shell: the editor keeps it there (the agent's settings are in the settings
  // file now, and no longer a key of this storage).
  shell: localStorage.getItem('slidr.shell'),
  blocked: await window.__TAURI_INTERNALS__.invoke('import_blocked'),
  // What the page's policy stopped before Rust was asked, as the browser reported it.
  refused: await window.__TAURI_INTERNALS__.invoke('import_run_job', { job: { kind: 'refused' } }),
}));
note('the editor window: localStorage slidr.shell', kept.shell, kept.shell !== null);
// The editor's own window may no longer ask the core for the list of windows (ADR-066 left it
// the permissions it uses, and this is not one): the browser's own list of pages says it.
const windows = pages().map((open) => new URL(open.url()).pathname);
note('windows of the app', windows.join(', '), windows.includes('/import.html'));
const isProbe = (url) =>
  /probe|beacon|echo\.websocket|asset\.localhost|localhost:1420|example\./.test(url);
const probes = kept.blocked.filter(isProbe);
const stopped = kept.refused.filter(isProbe);
note(
  'refused requests that were written down',
  `${stopped.length} by the page's policy, ${probes.length} by Rust`,
  new Set([...stopped, ...probes]).size >= 7,
);
const alive = await page.evaluate(() =>
  Boolean(document.querySelector('iframe[data-slidr-import]')?.contentDocument),
);
note('the import page after all that', alive ? 'alive, the file still loaded' : 'GONE', alive);

for (const row of rows) console.log(`${row.ok ? 'ok  ' : 'FAIL'} ${row.what} -> ${row.result}`);
console.log("\nrefused by the page's policy, as the browser reported them:");
for (const url of stopped) console.log(`  ${url}`);
console.log('\nrefused, as Rust recorded them:');
for (const url of probes) console.log(`  ${url}`);
const failed = rows.filter((row) => !row.ok);
console.log(`\n${rows.length - failed.length} of ${rows.length} as expected`);
await browser.close();
process.exit(failed.length ? 1 : 0);
