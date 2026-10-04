// A look at a running copy of the app over its DevTools port, for working out a test by hand:
//
//   node packaged/scripts/probe.mjs shot <name>        a screenshot into test-results/hardening/
//   node packaged/scripts/probe.mjs eval <file.js>     runs the file's body in the main window
//   node packaged/scripts/probe.mjs buttons            the names of the buttons on screen
//
// The app must have been started with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS set to
// --remote-debugging-port=9371 (SLIDR_CDP_PORT names another port).
/* global document */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const port = process.env.SLIDR_CDP_PORT ?? '9371';
const out = new URL('../../test-results/hardening/', import.meta.url);
mkdirSync(out, { recursive: true });

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
const pages = browser.contexts()[0].pages();
const page = pages.find((p) => !p.url().includes('capture.html')) ?? pages[0];
const [what, arg] = process.argv.slice(2);

if (what === 'shot') {
  writeFileSync(new URL(`${arg ?? 'probe'}.png`, out), await page.screenshot());
  console.log(`wrote ${arg ?? 'probe'}.png`);
} else if (what === 'eval') {
  const body = readFileSync(arg, 'utf8');
  const result = await page.evaluate(`(async () => { ${body} })()`);
  console.log(JSON.stringify(result, null, 2));
} else if (what === 'buttons') {
  const names = await page.evaluate(() =>
    [...document.querySelectorAll('button, [role="button"], [role="tab"], [role="menuitem"]')]
      .filter((el) => el.getClientRects().length > 0)
      .map((el) => {
        const region = el.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim() ?? '';
        const id = el.getAttribute('data-testid');
        return `${region.padEnd(16)} ${name}${id ? `  [${id}]` : ''}`;
      }),
  );
  console.log(names.join('\n'));
} else {
  console.log(pages.map((p) => p.url()).join('\n'));
}

await browser.close();
