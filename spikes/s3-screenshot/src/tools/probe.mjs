// Ad-hoc probe: phase timings of method A for one slide across several fresh contexts.
//   node src/tools/probe.mjs <slide> <font: default|precomputed|precomputed-woff2|skip> <pixelRatio> [contexts]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../lib/server.mjs';
import { launch, openSlide } from '../lib/browser.mjs';
import { stats } from '../lib/stats.mjs';

const [slide = 'css', font = 'default', pr = '0.5', contexts = '4'] = process.argv.slice(2);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const server = await startServer(ROOT);
const browser = await launch({ headed: process.argv.includes('--headed') });
try {
  for (let i = 0; i < Number(contexts); i++) {
    const s = await openSlide(browser, server.origin, { slide, view: 'editor' });
    let embed = null;
    if (font.startsWith('precomputed')) {
      embed = await s.page.evaluate((k) => window.s3.fontEmbed(k), font === 'precomputed' ? 'all' : 'woff2');
    }
    const o = { pixelRatio: Number(pr), font };
    const bench = await s.page.evaluate(([opts, n]) => window.s3.benchA(opts, n), [o, 12]);
    const ph = await s.page.evaluate(([opts, n]) => window.s3.phasesA(opts, n), [o, 12]);
    const med = (k) => stats(ph.map((p) => p[k])).median.toFixed(0);
    console.log(
      `ctx ${i}: toBlob median ${stats(bench.times).median.toFixed(0)} ms [${bench.times.map((t) => t.toFixed(0)).join(' ')}] | ` +
        `toSvg ${med('toSvg')} decode ${med('decode')} draw ${med('draw')} encode ${med('encode')} | svg ${(ph[0].svgChars / 1e6).toFixed(2)}M` +
        (embed ? ` | fontEmbed ${embed.ms.toFixed(0)} ms ${(embed.length / 1024).toFixed(0)} KB` : ''),
    );
    await s.close();
  }
} finally {
  await browser.close();
  await server.close();
}
