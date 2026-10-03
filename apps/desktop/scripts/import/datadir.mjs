// Before the app writes anything: where does this instance keep its data? Run while the window
// still shows /dev/gallery.html, which touches no storage. Then opens the app itself.
import { APP, connect } from './cdp.mjs';

const { browser, find } = await connect();
const page = find('/dev/gallery.html') ?? find(APP);
if (!page) throw new Error('the app window was not found over CDP');
const dirs = await page.evaluate(async () => {
  const invoke = window.__TAURI_INTERNALS__.invoke;
  // 14: AppData, 15: AppLocalData (BaseDirectory of @tauri-apps/api/path).
  const [data, local] = await Promise.all(
    [14, 15].map((directory) => invoke('plugin:path|resolve_directory', { directory })),
  );
  return { data, local };
});
console.log(JSON.stringify(dirs));
if (!/dev\.slidr\.app\.import$/.test(dirs.data)) {
  throw new Error(`refusing to go on: the data folder is ${dirs.data}`);
}
if (process.argv.includes('--open')) {
  await page.goto(`${APP}/`);
  await page.waitForFunction(() => window.slidr?.document?.workspace != null, null, {
    timeout: 30000,
  });
  console.log('app open, workspace', await page.evaluate(() => window.slidr.document.workspace.id));
}
await browser.close();
