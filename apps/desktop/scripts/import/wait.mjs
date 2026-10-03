// Development helper: waits until the app's main window is up and has a workspace. A workspace
// left by a killed run is offered for recovery first; the dialog is answered with "discard".
import { connect } from './cdp.mjs';

const deadline = Date.now() + 120_000;
for (;;) {
  try {
    const { browser, main } = await connect();
    const page = main();
    if (page) {
      for (let i = 0; i < 20; i++) {
        const state = await page.evaluate(() => ({
          ws: window.slidr?.document?.workspace?.id ?? null,
          dialog:
            document
              .querySelector('[role="alertdialog"], [role="dialog"]')
              ?.textContent?.slice(0, 80) ?? null,
        }));
        if (state.ws) {
          console.log('ready', state.ws);
          await browser.close();
          process.exit(0);
        }
        if (state.dialog) {
          const discard = page
            .locator('[role="alertdialog"] button, [role="dialog"] button')
            .nth(1);
          await discard.click().catch(() => undefined);
        }
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    await browser.close();
  } catch {
    // not up yet
  }
  if (Date.now() > deadline) throw new Error('the app did not come up');
  await new Promise((r) => setTimeout(r, 2000));
}
