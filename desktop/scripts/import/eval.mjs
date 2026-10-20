// Development helper: evaluates an async function body in the app's main window.
//   node scripts/import/eval.mjs "<body of an async function>"
import { connect } from './cdp.mjs';
const { browser, main } = await connect();
const page = main();
if (!page) throw new Error('the app window was not found');
const out = await page.evaluate(async (body) => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  try {
    return await new Function('invoke', `return (async () => {${body}})()`)(invoke);
  } catch (e) {
    return { error: e?.message ?? String(e), raw: JSON.stringify(e) };
  }
}, process.argv[2]);
console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
await browser.close();
