import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NONCE_PLACEHOLDER, policyHeader, type Policy } from './csp.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const config = JSON.parse(read('../src-tauri/tauri.conf.json')) as {
  app: {
    security: { csp: Policy; dangerousDisableAssetCspModification: string[] | boolean };
  };
};
const policy = config.app.security.csp;

describe('the policy of tauri.conf.json (SEC-05)', () => {
  it('starts from nothing, and lets no script in but the files of the app', () => {
    expect(policy['default-src']).toBe("'none'");
    expect(policy['object-src']).toBe("'none'");
    expect(policy['base-uri']).toBe("'none'");
    expect(policy['form-action']).toBe("'none'");
    // `'wasm-unsafe-eval'` compiles WebAssembly (the font subsetter); it compiles no text.
    expect(policy['script-src']).toBe("'self' 'wasm-unsafe-eval'");
    expect(policy['worker-src']).toBe("'self'");
  });

  it('names no server: only the app, its core, its files, and what the page makes itself', () => {
    const own =
      /^('self'|'none'|'unsafe-inline'|'wasm-unsafe-eval'|data:|blob:|ipc:|asset:|http:\/\/(ipc|asset)\.localhost)$/;
    for (const [directive, sources] of Object.entries(policy)) {
      for (const source of String(sources).split(/\s+/)) {
        expect(source, directive).toMatch(own);
      }
    }
    // Inline is allowed for styles alone: a slide's own style attributes and sheets.
    const inline = Object.entries(policy)
      .filter(([, sources]) => String(sources).includes("'unsafe-inline'"))
      .map(([directive]) => directive);
    expect(inline).toEqual(['style-src']);
  });

  it('leaves the script sources to Tauri, which adds the nonce of each load', () => {
    // Styles are not Tauri's to change: a nonce there would switch `'unsafe-inline'` off, and
    // with it every style attribute a slide carries.
    expect(config.app.security.dangerousDisableAssetCspModification).toEqual(['style-src']);
  });

  it('is asked for a nonce by both pages of the app, through one placeholder each', () => {
    for (const page of ['../index.html', '../capture.html']) {
      const html = read(page);
      expect(html.split(NONCE_PLACEHOLDER), page).toHaveLength(2);
      expect(html, page).toContain(
        `<meta name="slidr-script-nonce" content="${NONCE_PLACEHOLDER}" />`,
      );
      // A script of a page is a file; one written into the page would need the policy loosened.
      expect(html.match(/<script\b[^>]*>/g), page).toHaveLength(1);
      expect(html, page).toMatch(/<script type="module" src="\/src\/[^"]+"><\/script>/);
    }
  });
});

describe('the header the dev server sends', () => {
  it('is the policy, with what development adds after what each directive had', () => {
    const header = policyHeader(
      { 'default-src': "'none'", 'script-src': "'self'", 'img-src': ['data:', 'blob:'] },
      { 'script-src': "'nonce-abc'", 'connect-src': ['ws://localhost:1'] },
    );
    expect(header).toBe(
      "default-src 'none'; script-src 'self' 'nonce-abc'; img-src data: blob:; connect-src ws://localhost:1",
    );
  });

  it('is what Tauri would send for the same policy, directive by directive', () => {
    const header = policyHeader(policy);
    for (const [directive, sources] of Object.entries(policy)) {
      expect(header).toContain(`${directive} ${String(sources)}`);
    }
    expect(header.split('; ')).toHaveLength(Object.keys(policy).length);
  });
});
