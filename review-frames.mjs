import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const out = 'apps/desktop/test-results/frames-wide';
const browser = await chromium.launch({channel:'msedge'});
const page = await browser.newPage({viewport:{width:1340,height:1000}});
page.on('pageerror', e => console.log('ERROR',e.message));
for (const lang of ['he','en']) {
 for (let from=0,total=1;from<total;from+=24) {
  for (const width of [1920,320]) {
   await page.goto(`http://localhost:1421/dev/frames-review.html?lang=${lang}&w=${width}&from=${from}&count=24&cols=4`);
   await page.waitForSelector('html[data-ready="true"]');
   await page.evaluate(()=>document.fonts.ready);
   total = await page.evaluate(()=>window.__count);
   await page.screenshot({path:`${out}/${lang}-${from}-${width}.png`,fullPage:true});
  }
  console.log(lang,from,total);
 }
}
await browser.close();
