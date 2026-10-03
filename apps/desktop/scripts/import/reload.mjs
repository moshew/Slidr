// Development helper: reloads the app's main window and prints what its console says.
import { connect } from './cdp.mjs';
const { browser, main } = await connect();
const page = main();
page.on('console', (m) => console.log(`[${m.type()}]`, m.text().slice(0, 500)));
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 800)));
await page.reload();
await new Promise((r) => setTimeout(r, 6000));
console.log(
  await page.evaluate(() => ({
    slidr: typeof window.slidr,
    ws: window.slidr?.document?.workspace?.id ?? null,
    dialog:
      document.querySelector('[role="alertdialog"],[role="dialog"]')?.textContent?.slice(0, 120) ??
      null,
  })),
);
await browser.close();
