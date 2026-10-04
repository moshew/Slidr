import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { invoke, launchApp, windowPage, workspaces, type RunningApp } from './app';

/*
 * The import window (SPEC 13.3, SEC-03, ADR-036) in the packaged app, where two things meet that
 * a development run never shows together: the content policy Tauri sends with every page it
 * serves (ADR-066), and a page that runs a stranger's file and needs what that policy refuses.
 * The import page has a policy of its own; this suite checks that it is the one in force there,
 * that a file is imported under it, and that the window is as closed as it is in development:
 * to the app's commands, and to the network.
 *
 * The jobs are sent as the editor sends them (`import_open`, `import_run_job`); no agent is
 * involved. "A server outside the app" is one the test starts on this computer.
 */

let app: RunningApp;
let files: string;
let server: Server;
let outside: string;
const hits: string[] = [];

const job = <T>(page: Page, body: Record<string, unknown>) =>
  invoke<T>(page, 'import_run_job', { job: body, timeoutMs: 60_000 });

/** A file as people's decks are: its content is made by its own scripts, inline. */
const deckHtml = (server: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Imported</title>
    <style>
      body { margin: 0; }
      section { width: 1920px; height: 1080px; background: #fff; }
      h1 { font: 700 96px sans-serif; color: #123; margin: 0; padding: 120px; }
    </style>
  </head>
  <body>
    <section id="one">
      <h1 id="title">before the script</h1>
      <button id="press" onclick="document.getElementById('title').dataset.pressed = 'yes'">x</button>
    </section>
    <script>
      document.getElementById('title').textContent = 'written by the file';
      window.computed = eval('6 * 7');
      document.getElementById('press').click();
      // What a file from the web does on its way up: it asks its servers for things.
      fetch('${server}/fetch').catch(() => {});
      new Image().src = '${server}/image.png';
      const sheet = document.createElement('link');
      sheet.rel = 'stylesheet';
      sheet.href = '${server}/style.css';
      document.head.append(sheet);
    </script>
  </body>
</html>
`;

test.beforeAll(async () => {
  files = mkdtempSync(join(tmpdir(), 'slidr-import-'));
  server = createServer((request, response) => {
    hits.push(`${request.method} ${request.url}`);
    response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' });
    response.end('reached');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  outside = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  app = await launchApp();
});

test.afterAll(async () => {
  if (app) {
    await invoke(app.page, 'import_close').catch(() => undefined);
    await app.kill();
  }
  await new Promise((resolve) => server.close(resolve));
  rmSync(files, { recursive: true, force: true });
});

test.describe.configure({ mode: 'serial' });

test('a file is loaded in the import window, and its own scripts make its content', async () => {
  const { page } = app;
  const file = join(files, 'deck.html');
  writeFileSync(file, deckHtml(outside));
  const [workspace] = workspaces();
  expect(workspace).toBeTruthy();

  // The editor names the session's folder after its deck; any name of that shape will do.
  const opened = await invoke<{ file: string; bytes: number }>(page, 'import_open', {
    path: file,
    thread: 'packaged-suite/import',
    workspaceId: workspace!.id,
  });
  expect(opened.bytes).toBeGreaterThan(500);
  await job(page, { kind: 'load' });

  // The file ran: an inline script wrote the heading, `eval` worked, an inline handler fired.
  // All three are what the app's own pages are refused.
  const state = await job<string>(page, {
    kind: 'evaluate',
    code: `const title = document.getElementById('title');
return { text: title.textContent, pressed: title.dataset.pressed ?? null, computed: window.computed };`,
  });
  expect(JSON.parse(state)).toEqual({ text: 'written by the file', pressed: 'yes', computed: 42 });

  // The engine reads the page and takes its picture, through the window's own commands.
  const outline = await job<string>(page, { kind: 'inspect', request: {} });
  expect(outline).toContain('written by the file');
  const shot = await job<{ data: string; width: number; height: number }>(page, {
    kind: 'screenshot',
    request: { maxWidth: 480 },
  });
  expect(shot.width).toBe(480);
  expect(Buffer.from(shot.data, 'base64').subarray(1, 4).toString('latin1')).toBe('PNG');
});

test('the import page is served under its own policy, not the app pages', async () => {
  const found = await windowPage('/import.html');
  try {
    const policies = await found.page.evaluate(async () => {
      const response = await fetch(location.href);
      const meta = document.querySelector<HTMLMetaElement>(
        'meta[http-equiv="Content-Security-Policy"]',
      );
      return { header: response.headers.get('content-security-policy'), own: meta?.content ?? '' };
    });
    // One policy, the page's own: a second one over it would leave only what both allow.
    expect(policies.header).toBeNull();
    expect(policies.own).toContain("default-src 'none'");
    // And it names no server: what the file asks of the network has nowhere to go.
    expect(policies.own).not.toMatch(/https?:\/\/(?!ipc\.localhost)/);
  } finally {
    await found.close();
  }
  // The app's own page still has the app's policy.
  const main = await app.page.evaluate(async () =>
    (await fetch('/')).headers.get('content-security-policy'),
  );
  expect(main).toContain("default-src 'none'");
  expect(main).not.toContain("'unsafe-eval'");
});

test('the import window may call its own commands, and no other (the gate)', async () => {
  const found = await windowPage('/import.html');
  try {
    const call = (command: string, args: Record<string, unknown> = {}) =>
      found.page.evaluate(
        async ({ command, args }) => {
          const tauri = (
            window as unknown as {
              __TAURI_INTERNALS__: { invoke(c: string, a: unknown): Promise<unknown> };
            }
          ).__TAURI_INTERNALS__;
          try {
            await tauri.invoke(command, args);
            return 'answered';
          } catch (error) {
            return typeof error === 'string' ? error : JSON.stringify(error);
          }
        },
        { command, args },
      );
    const before = workspaces().length;
    for (const command of [
      'storage_new',
      'recents_list',
      'settings_read',
      'secret_status',
      'agent_harnesses',
      'tool_bridge_connect',
      'import_open',
      'import_run_job',
      // The two this track added to the app (ADR-066): the agent's log is not the file's to read.
      'agent_diagnostics_read',
      'agent_diagnostics_clear',
      // The ones that write beside an exported file and run the local image model (ADR-057).
      'export_copy_media',
      'image_process',
      'image_process_status',
    ]) {
      expect(await call(command), command).toContain('may not call');
    }
    // No capability names this window, so a plugin's command is refused before the gate.
    for (const command of ['plugin:dialog|open', 'plugin:event|listen']) {
      expect(await call(command, { options: {} }), command).not.toBe('answered');
    }
    expect(workspaces().length).toBe(before);
    // What it may call is answered for what it asks, not refused for who asks.
    expect(await call('import_job_take', { id: 999_999 })).toContain('not waiting');
  } finally {
    await found.close();
  }
});

test('what the file asked of the network went nowhere, and was written down', async () => {
  const { page } = app;
  expect(hits).toEqual([]);
  const refused = await job<string[]>(page, { kind: 'refused' });
  const blocked = await invoke<string[]>(page, 'import_blocked');
  const noted = [...refused, ...blocked].filter((url) => url.startsWith(outside));
  expect(noted.some((url) => url.endsWith('/fetch'))).toBe(true);
  expect(noted.some((url) => url.endsWith('/image.png'))).toBe(true);
  expect(noted.some((url) => url.endsWith('/style.css'))).toBe(true);
});
