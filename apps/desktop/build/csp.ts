import { randomBytes } from 'node:crypto';
import type { Plugin } from 'vite';

/*
 * The content policy of the app's pages, in development (SEC-05, ADR-066).
 *
 * In the packaged app Tauri serves the pages and sends the policy of `tauri.conf.json` with
 * them. In development the pages come from this dev server, and Tauri sends nothing. This
 * plugin sends the same policy from here, so `tauri dev` and the E2E suites, which open the dev
 * server's page in a browser, run under the policy the user's build runs under: code that the
 * policy would break breaks before it is packaged.
 *
 * Two things are added to it, and only here: the socket of hot reload, and a nonce for the
 * inline scripts the dev server itself puts in a page.
 */

/** A policy as `tauri.conf.json` writes it: one entry per directive. */
export type Policy = Record<string, string | string[]>;

/**
 * What a page is served with in place of the nonce of its load. It is Tauri's own placeholder:
 * in the packaged app Tauri replaces it with a random number and adds that number to
 * `script-src` (see `set_csp` in the `tauri` crate); here the plugin does both.
 */
export const NONCE_PLACEHOLDER = '__TAURI_SCRIPT_NONCE__';

/** The policy as the value of a `Content-Security-Policy` header. */
export function policyHeader(policy: Policy, added: Policy = {}): string {
  const sources = (value: string | string[] | undefined) =>
    value === undefined ? [] : Array.isArray(value) ? value : [value];
  return Object.keys({ ...policy, ...added })
    .map((directive) =>
      [directive, ...sources(policy[directive]), ...sources(added[directive])].join(' '),
    )
    .join('; ');
}

/**
 * A page asked for with this in its address is served with what an imported file needs, in
 * place of the app pages' script rules. Outside the app (a plain browser: the E2E suites, the
 * Vite page) there is no import window, and the import runs the file in a frame of the editor's
 * own page (`src/import/session.ts`). The app's policy refuses that frame, which is what it is
 * for; the stand-in is given what the import page allows itself (`import.html`), and no network
 * either. Development only: the packaged app has no such address, and imports in a window of
 * its own.
 */
export const IMPORT_IN_PAGE = 'import-in-page';

/** The header the dev server sends with a page of the app. */
export function devPolicyHeader(
  policy: Policy,
  { nonce, port, importInPage }: { nonce: string; port: number; importInPage: boolean },
): string {
  const socket = [`ws://localhost:${port}`, `ws://127.0.0.1:${port}`];
  if (!importInPage) {
    return policyHeader(policy, { 'script-src': `'nonce-${nonce}'`, 'connect-src': socket });
  }
  // No nonce here: beside one, a browser does not count `'unsafe-inline'`, and the file's
  // scripts are its own, written into it.
  return policyHeader(policy, {
    'script-src': ["'unsafe-inline'", "'unsafe-eval'", 'data:', 'blob:'],
    'frame-src': ['data:', 'blob:'],
    'worker-src': ['data:', 'blob:'],
    'connect-src': socket,
  });
}

export interface DevPolicyOptions {
  policy: Policy;
  /** The pages of the app, by path: the ones the packaged app has. Dev pages get no policy. */
  pages: readonly string[];
}

export function devContentPolicy({ policy, pages }: DevPolicyOptions): Plugin {
  // One for the life of the server: every page it serves is the developer's own.
  const nonce = randomBytes(16).toString('base64');
  return {
    name: 'slidr:dev-content-policy',
    apply: 'serve',
    // The dev server stamps the tags it adds to a page (the fast-refresh preamble) with it.
    config: () => ({ html: { cspNonce: nonce } }),
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replaceAll(NONCE_PLACEHOLDER, nonce),
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const [path, query = ''] = (request.url ?? '').split('#')[0]!.split('?');
        if (path !== undefined && pages.includes(path)) {
          const address = server.httpServer?.address();
          const port =
            typeof address === 'object' && address ? address.port : server.config.server.port;
          const importInPage = new URLSearchParams(query).has(IMPORT_IN_PAGE);
          response.setHeader(
            'Content-Security-Policy',
            devPolicyHeader(policy, { nonce, port, importInPage }),
          );
        }
        next();
      });
    },
  };
}
