import { expect, test } from '@playwright/test';
import {
  injectIntoPage,
  listenForProbe,
  probeMarkup,
  probeReports,
  violations,
  watchViolations,
} from './hardening-helpers';
import { addElement, onStage, openApp, pageProblems } from './objects-helpers';

// The content policy of the app's pages (SEC-05, WG13-T04, ADR-066), on the dev server's page,
// which is served under the policy the packaged app sends (build/csp.ts). The same checks run
// against the packaged app, with the core behind it, in packaged/security.spec.ts.

/** The same server under its other name: it answers, and it is not the page's origin. */
const outside = (baseURL: string | undefined) =>
  `${(baseURL ?? '').replace('localhost', '127.0.0.1')}/favicon.svg`;

test('the app page is served under a policy that names no server and no inline script', async ({
  page,
}) => {
  const response = await page.goto('/');
  const policy = response?.headers()['content-security-policy'] ?? '';
  const directives = new Map(
    policy.split(';').map((part) => {
      const [name, ...sources] = part.trim().split(/\s+/);
      return [name ?? '', sources] as const;
    }),
  );
  expect(directives.get('default-src')).toEqual(["'none'"]);
  expect(directives.get('object-src')).toEqual(["'none'"]);
  expect(directives.get('base-uri')).toEqual(["'none'"]);
  const scripts = directives.get('script-src') ?? [];
  expect(scripts).toContain("'self'");
  expect(scripts).not.toContain("'unsafe-inline'");
  expect(scripts).not.toContain("'unsafe-eval'");
  // The one nonce is the dev server's stand-in for the one the packaged app is served with.
  expect(scripts.filter((source) => source.startsWith("'nonce-"))).toHaveLength(1);
  // No directive lets the page reach a server: what is not the app itself is its own core
  // (`ipc`), its own files (`asset`), or made in the page (`data:`, `blob:`).
  const own =
    /^('self'|'none'|'unsafe-inline'|'wasm-unsafe-eval'|'nonce-[^']+'|data:|blob:|ipc:|asset:|http:\/\/(ipc|asset)\.localhost|ws:\/\/(localhost|127\.0\.0\.1):\d+)$/;
  for (const [name, sources] of directives) {
    for (const source of sources) expect(source, name).toMatch(own);
  }
  // The dev pages are not part of the app, and are served as they always were.
  const gallery = await page.request.get('/dev/gallery.html');
  expect(gallery.headers()['content-security-policy']).toBeUndefined();
});

test('a script that reaches the page as markup or as text does not run', async ({ page }) => {
  await openApp(page);
  await watchViolations(page);
  expect(await injectIntoPage(page)).toEqual([]);
  // Each was refused by name, not lost on the way: the handler, then the script address and the
  // script element. (The frame's script is refused in the frame, and compiling throws.)
  const refused = await violations(page);
  expect(refused.filter((v) => v.startsWith('script-src-attr'))).toHaveLength(1);
  expect(refused.filter((v) => v.startsWith('script-src-elem'))).toHaveLength(2);
});

test('the page cannot reach a server outside the app', async ({ page, baseURL }) => {
  await openApp(page);
  await watchViolations(page);
  const reached = await page.evaluate(async (url) => {
    const tried: Record<string, boolean> = {};
    tried.fetch = await fetch(url, { mode: 'no-cors' }).then(
      () => true,
      () => false,
    );
    tried.image = await new Promise<boolean>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = url;
    });
    tried.socket = await new Promise<boolean>((resolve) => {
      try {
        const socket = new WebSocket(url.replace(/^http/, 'ws').replace(/:\d+/, ':9'));
        socket.onopen = () => resolve(true);
        socket.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
    return tried;
  }, outside(baseURL));
  expect(reached).toEqual({ fetch: false, image: false, socket: false });
  const refused = await violations(page);
  expect(refused.some((v) => v.startsWith('connect-src'))).toBe(true);
  expect(refused.some((v) => v.startsWith('img-src'))).toBe(true);
});

test('a script inside an html object runs in its frame, and stays in it', async ({
  page,
  baseURL,
}) => {
  await openApp(page);
  await listenForProbe(page);
  await addElement(page, {
    id: 'e_probe',
    type: 'html',
    frame: { x: 400, y: 260, w: 400, h: 200 },
    markup: probeMarkup(outside(baseURL)),
    hasScripts: true,
    natural: { w: 400, h: 200 },
  });
  await expect(onStage(page, 'e_probe').locator('iframe')).toHaveAttribute(
    'sandbox',
    'allow-scripts',
  );
  // The Stage's frame ran the script; the filmstrip's thumbnail runs none.
  await expect.poll(() => probeReports(page)).toHaveLength(1);
  const [report] = await probeReports(page);
  expect(report).toMatchObject({
    ran: true,
    origin: 'null',
    parent: 'blocked',
    storage: 'blocked',
    outside: 'refused',
    // A handler attribute carries no nonce: it does not run inside the app. In a file the
    // deck was exported to, which has no policy, it does.
    handler: false,
  });
  // The page itself was never in play.
  expect(await page.evaluate(() => '__clicked' in window)).toBe(false);
  // The console says what the policy and the sandbox refused, which is the point of both.
  const unexpected = pageProblems(page).filter(
    (problem) =>
      !/Content Security Policy|sandboxed|Failed to load resource|Failed to read/.test(problem),
  );
  expect(unexpected).toEqual([]);
});
