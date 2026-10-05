import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  injectIntoPage,
  listenForProbe,
  probeReports,
  violations,
  watchViolations,
} from '../e2e/hardening-helpers';
import { invoke, launchApp, showPanel, workspaces, type RunningApp } from './app';
import { hostileDeck, openDeckFile, writeDeckFile } from './decks';

/*
 * The security pass (WG13-T04, SEC-01, SEC-03, SEC-05, SEC-06), against the packaged app: the
 * policy as Tauri sends it, with the core behind the page. What can only be seen here is what a
 * script could do with the core in reach: the dev server's page, where the same checks run
 * (e2e/hardening-policy.spec.ts), has none.
 *
 * "A server outside the app" is one the test starts on this computer. It answers anything, and
 * writes down what asked: the app must never be on its list.
 */

let app: RunningApp;
let files: string;
let server: Server;
let outside: string;
const hits: string[] = [];

test.beforeAll(async () => {
  files = mkdtempSync(join(tmpdir(), 'slidr-security-'));
  server = createServer((request, response) => {
    hits.push(`${request.method} ${request.url}`);
    response.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' });
    response.end('reached');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  outside = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // The scripted harness, so a session can be opened on the tool bridge without a CLI.
  app = await launchApp({ env: { SLIDR_AGENT_MOCK: '1' } });
});

test.afterAll(async () => {
  await app?.kill();
  await new Promise((resolve) => server.close(resolve));
  rmSync(files, { recursive: true, force: true });
});

test.describe.configure({ mode: 'serial' });

test('the app is served under its policy, with a nonce of this load', async () => {
  const { page } = app;
  const served = await page.evaluate(async () => {
    const response = await fetch('/');
    const meta = document.querySelector<HTMLMetaElement>('meta[name="slidr-script-nonce"]');
    return { policy: response.headers.get('content-security-policy') ?? '', nonce: meta?.content };
  });
  const directives = new Map(
    served.policy.split(';').map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name ?? '', sources] as const;
    }),
  );
  expect(directives.get('default-src')).toEqual(["'none'"]);
  const scripts = directives.get('script-src') ?? [];
  expect(scripts).not.toContain("'unsafe-inline'");
  expect(scripts).not.toContain("'unsafe-eval'");
  // Tauri wrote a number of this load into the page, and the same number into the policy of
  // the answer that carried the page. (This answer is another load, with another number.)
  expect(served.nonce).toMatch(/^\d{6,}$/);
  expect(scripts.filter((source) => /^'nonce-\d+'$/.test(source))).toHaveLength(1);
  expect(directives.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  expect(directives.get('connect-src')).toEqual(
    expect.arrayContaining(['ipc:', 'http://ipc.localhost', 'http://asset.localhost']),
  );
  for (const [name, sources] of directives) {
    for (const source of sources)
      expect(source, name).not.toMatch(/^https?:\/\/(?!(ipc|asset)\.localhost$)/);
  }
});

test('a script that reaches the page as markup or as text does not run', async () => {
  const { page } = app;
  await watchViolations(page);
  expect(await injectIntoPage(page)).toEqual([]);
  const refused = await violations(page);
  expect(refused.filter((v) => v.startsWith('script-src-attr'))).toHaveLength(1);
  expect(refused.filter((v) => v.startsWith('script-src-elem'))).toHaveLength(2);
});

test('the page reaches no server outside the app', async () => {
  const { page } = app;
  const reached = await page.evaluate(async (url) => {
    const tried: Record<string, boolean> = {};
    tried.fetch = await fetch(`${url}/fetch`, { mode: 'no-cors' }).then(
      () => true,
      () => false,
    );
    tried.image = await new Promise<boolean>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = `${url}/image.png`;
    });
    navigator.sendBeacon(`${url}/beacon`, 'x');
    tried.socket = await new Promise<boolean>((resolve) => {
      try {
        const socket = new WebSocket(`${url.replace('http', 'ws')}/socket`);
        socket.onopen = () => resolve(true);
        socket.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = `${url}/style.css`;
    document.head.append(style);
    await new Promise((resolve) => setTimeout(resolve, 500));
    style.remove();
    return tried;
  }, outside);
  expect(reached).toEqual({ fetch: false, image: false, socket: false });
  expect(hits).toEqual([]);
});

test('a hostile deck: its script stays in its frame, and its markup is cleaned', async () => {
  const { page } = app;
  const file = join(files, 'hostile.slidr');
  await writeDeckFile(page, file, hostileDeck(outside));
  const before = workspaces().length;
  await listenForProbe(page);
  await openDeckFile(page, file);
  await expect(page.getByTestId('document-name')).toHaveText('hostile');
  const stage = page.getByTestId('stage-frame');
  await expect(stage.locator('[data-element-id="e_probe"] iframe')).toHaveAttribute(
    'sandbox',
    'allow-scripts',
  );

  // The script ran, in the frame of the Stage, and found every way out closed.
  await expect.poll(() => probeReports(page), { timeout: 15_000 }).toHaveLength(1);
  const [report] = await probeReports(page);
  expect(report).toMatchObject({
    ran: true,
    origin: 'null',
    parent: 'blocked',
    storage: 'blocked',
    outside: 'refused',
    handler: false,
  });
  // Tauri puts what a page calls the core with into every frame, a sandboxed one too. What
  // keeps this script from the core is on the core's side, and both doors are closed:
  // a request from a frame without an origin is refused, by name;
  expect(report).toMatchObject({ internals: 'object', ipc: 'object' });
  expect(report!.invoke).toBe('refused: Origin header is not a valid URL');
  expect(report!.command).not.toBe('answered 200');
  // and a message from a frame is not listened to: with requests made to fail, the page's own
  // `invoke` falls back to messages, and never hears back.
  expect(report!.fallback).toBe('no answer');
  // The command was `storage_new`, which makes a workspace: none was made by either way.
  // (Opening the file made one workspace, and closed the one before it.)
  await expect.poll(() => workspaces().length).toBeLessThanOrEqual(before + 1);
  expect(workspaces().filter((w) => w.deck === null)).toHaveLength(0);

  // The object without scripts and the SVG were drawn, without what could run or call out.
  const cleaned = await page.evaluate(() => {
    const stageFrame = document.querySelector('[data-testid="stage-frame"]')!;
    const shadow = stageFrame.querySelector(
      '[data-element-id="e_handlers"] [data-slidr-html]',
    )?.shadowRoot;
    // The picture of an `svg` element is in a shadow root of its own, like the `html` content.
    const svg = stageFrame.querySelector('[data-element-id="e_svg"] [data-slidr-svg]')?.shadowRoot;
    const roots = [shadow, svg].filter((root): root is ShadowRoot => Boolean(root));
    const all = roots.flatMap((root) => [...root.querySelectorAll('*')]);
    const link = shadow?.querySelector<HTMLAnchorElement>('#link');
    link?.click();
    shadow?.querySelector<HTMLElement>('div')?.click();
    svg?.querySelector('circle')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return {
      drawn: { text: shadow?.textContent ?? '', circle: Boolean(svg?.querySelector('circle')) },
      elements: all
        .map((el) => el.localName)
        .filter((name) =>
          ['script', 'iframe', 'object', 'embed', 'base', 'meta', 'foreignobject'].includes(
            name.toLowerCase(),
          ),
        ),
      handlers: all.flatMap((el) => el.getAttributeNames().filter((name) => name.startsWith('on'))),
      scriptUrls: all.flatMap((el) =>
        ['href', 'action', 'formaction', 'src']
          .map((name) => el.getAttribute(name) ?? '')
          .filter((value) => value.trim().toLowerCase().startsWith('javascript:')),
      ),
      pwned: (window as unknown as { __pwned?: string }).__pwned ?? null,
    };
  });
  expect(cleaned.drawn.text).toContain('text of the object');
  expect(cleaned.drawn.circle).toBe(true);
  // `foreignObject` stays (it only draws); the frame inside it does not.
  expect(cleaned.elements.filter((name) => name.toLowerCase() !== 'foreignobject')).toEqual([]);
  expect(cleaned.handlers).toEqual([]);
  expect(cleaned.scriptUrls).toEqual([]);
  expect(cleaned.pwned).toBeNull();

  // The same in the show, where the content takes the pointer and frames run their scripts.
  await page.getByTestId('top-tools-a').getByRole('button', { name: 'הצגה', exact: true }).click();
  await expect(page.getByTestId('present')).toHaveAttribute('data-ready', 'true');
  await expect.poll(() => probeReports(page), { timeout: 15_000 }).toHaveLength(2);
  expect((await probeReports(page))[1]).toMatchObject({
    parent: 'blocked',
    invoke: 'refused: Origin header is not a valid URL',
    fallback: 'no answer',
    outside: 'refused',
  });
  expect(workspaces().filter((w) => w.deck === null)).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('present')).toHaveCount(0);
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: string }).__pwned ?? null),
  ).toBeNull();

  // Nothing the deck named was asked of the server: not a picture, a stylesheet, a form.
  expect(hits).toEqual([]);
});

test('pasted HTML arrives as text, without what it carried', async () => {
  const { page } = app;
  await page
    .getByTestId('top-tools-a')
    .getByRole('button', { name: 'תיבת טקסט', exact: true })
    .click();
  const editor = page.locator('[data-text-editor]');
  await expect(editor).toBeFocused();
  await editor.evaluate((el, url) => {
    const data = new DataTransfer();
    data.setData(
      'text/html',
      `<p onclick="window.__pasted = 1">שלום <b>עולם</b><img src="${url}/pasted.png" onerror="window.__pasted = 2">` +
        `<script>window.__pasted = 3</scr` +
        `ipt><a href="javascript:window.__pasted = 4">link</a><iframe src="${url}/frame"></iframe></p>`,
    );
    data.setData('text/plain', 'שלום עולם link');
    el.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, outside);
  await expect(editor).toContainText('שלום עולם');
  const pasted = await editor.evaluate((el) => ({
    elements: [...el.querySelectorAll('img, script, iframe, a, object')].map((e) => e.localName),
    handlers: [...el.querySelectorAll('*')].flatMap((e) =>
      e.getAttributeNames().filter((name) => name.startsWith('on')),
    ),
    ran: (window as unknown as { __pasted?: number }).__pasted ?? null,
  }));
  expect(pasted).toEqual({ elements: [], handlers: [], ran: null });
  await page.keyboard.press('Escape');
  expect(hits).toEqual([]);
});

test('the tool bridge listens on this computer alone, and each session has its own token', async () => {
  const { page } = app;
  interface Endpoint {
    sessionKey: string;
    url: string;
    token: string;
  }
  // The app connects its side of the bridge with the first agent session: a scripted turn.
  await page.evaluate(() =>
    localStorage.setItem('slidr.agent', JSON.stringify({ harnessId: 'mock', model: 'slide-chat' })),
  );
  await showPanel(page, 'ai.deck');
  await page.getByTestId('chat-input').fill('שלום');
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-assistant').first()).toHaveAttribute('data-outcome', /.+/, {
    timeout: 60_000,
  });

  const one = await invoke<Endpoint>(page, 'tool_bridge_open', { tools: [] });
  const two = await invoke<Endpoint>(page, 'tool_bridge_open', { tools: [] });
  const address = new URL(one.url);
  expect(address.hostname).toBe('127.0.0.1');
  expect(new URL(two.url).port).toBe(address.port);
  expect(one.token).toMatch(/^[0-9a-f]{32}$/);
  expect(one.token).not.toBe(two.token);
  expect(one.sessionKey).not.toBe(two.sessionKey);

  // What the operating system says the port is bound to: the loopback address, and no other.
  const bound = execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `(Get-NetTCPConnection -State Listen -LocalPort ${address.port}).LocalAddress -join ','`,
    ],
    { encoding: 'utf8' },
  ).trim();
  expect(bound).toBe('127.0.0.1');

  const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
  const ask = (url: string, token?: string) =>
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(list),
    }).then(
      (response) => response.status,
      () => 'unreachable' as const,
    );
  expect(await ask(one.url, one.token)).toBe(200);
  expect(await ask(one.url)).toBe(401);
  expect(await ask(one.url, 'not-the-token')).toBe(401);
  // The token of one session opens no other.
  expect(await ask(one.url, two.token)).toBe(401);
  expect(await ask(two.url, one.token)).toBe(401);
  expect(await ask(one.url.replace(one.sessionKey, 'f'.repeat(32)), one.token)).toBe(401);

  // From another address of this computer the port does not answer at all.
  const lan = Object.values(networkInterfaces())
    .flat()
    .find((net) => net && net.family === 'IPv4' && !net.internal)?.address;
  test.info().annotations.push({ type: 'lan address', description: lan ?? 'none' });
  if (lan) expect(await ask(one.url.replace('127.0.0.1', lan), one.token)).toBe('unreachable');

  // A closed session's token is worth nothing.
  await invoke(page, 'tool_bridge_close', { sessionKey: one.sessionKey });
  expect(await ask(one.url, one.token)).toBe(401);
  await invoke(page, 'tool_bridge_close', { sessionKey: two.sessionKey });
});
