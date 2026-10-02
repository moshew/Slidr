// WG0-S3 spike runner. One command runs everything:
//   pnpm spike            (headless Edge)
//   pnpm spike:headed     (visible Edge window; needed for the background-tab / minimised tests)
// Options: --only=images,timing,aopts,bopts,inactive,background   --warm=20   --cold=3
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { startServer } from './lib/server.mjs';
import { launch, openSlide, captureB, benchB, withTimeout, VIEWS } from './lib/browser.mjs';
import { decode, encode, compare, crop, hstack, nonBlankPct, box2 } from './lib/png.mjs';
import { stats } from './lib/stats.mjs';
import { writeTables } from './lib/report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const HEADED = !!args.headed;
const MODE = HEADED ? 'headed' : 'headless';
const WARM = Number(args.warm ?? 20); // warm captures per fresh context
const COLD = Number(args.cold ?? 3);
const ALL = ['images', 'timing', 'aopts', 'bopts', 'inactive', 'background'];
const ONLY = args.only ? String(args.only).split(',') : ALL;
const SLIDES = ['baseline', 'css', 'embedded', 'heavy'];
// 'text' is an extra slide used for fidelity only (no timing).
const FIDELITY_SLIDES = [...SLIDES, 'text'];
const SIZES = [960, 1920];

const OUT = path.join(ROOT, 'out', MODE);
const dirs = { img: path.join(OUT, 'img'), feat: path.join(OUT, 'features'), misc: path.join(OUT, 'misc') };
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });
const save = (dir, name, buf) => {
  fs.writeFileSync(path.join(dirs[dir], name), buf);
  return `out/${MODE}/${path.basename(dirs[dir])}/${name}`;
};
const log = (...a) => console.log(`[${((performance.now() - T0) / 1000).toFixed(1)}s]`, ...a);
const T0 = performance.now();

const resultsFile = path.join(OUT, 'results.json');
// Partial runs (--only) update the previous results instead of discarding them.
const results = args.only && fs.existsSync(resultsFile) ? JSON.parse(fs.readFileSync(resultsFile, 'utf8')) : {};

const server = await startServer(ROOT);
const origin = server.origin;
let browser;

// ---------------------------------------------------------------------------------------------
async function ensureAssets() {
  const dir = path.join(ROOT, 'assets');
  const need = ['photo.jpg', 'thumb-1.jpg', 'thumb-2.jpg', 'thumb-3.jpg', 'thumb-4.jpg', 'star.png', 'poster.png', 'clip.webm'];
  if (!args.regen && need.every((f) => fs.existsSync(path.join(dir, f)))) return;
  log('generating test assets with Edge (no network) ...');
  fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${origin}/src/page/gen-assets.html`);
  const files = await page.evaluate(() => window.genAssets());
  for (const [name, b64] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), Buffer.from(b64, 'base64'));
    log(`  assets/${name} ${Math.round(Buffer.from(b64, 'base64').length / 1024)} KB`);
  }
  await context.close();
}

async function environment() {
  const session = await browser.newBrowserCDPSession();
  const version = await session.send('Browser.getVersion');
  let gpu = {};
  try {
    const info = await session.send('SystemInfo.getInfo');
    const d = info.gpu.devices?.[0] ?? {};
    gpu = {
      device: `${d.vendorString ?? ''} ${d.deviceString ?? ''}`.trim(),
      driver: d.driverVersion,
      featureStatus: info.gpu.featureStatus,
    };
  } catch (e) {
    gpu = { error: String(e.message) };
  }
  const pkg = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', n, 'package.json'), 'utf8')).version;
  results.env = {
    mode: MODE,
    date: new Date().toISOString(),
    browser: version.product,
    userAgent: version.userAgent,
    os: `${os.type()} ${os.release()}`,
    cpu: `${os.cpus()[0].model} x${os.cpus().length}`,
    node: process.version,
    gpu,
    versions: {
      'html-to-image': pkg('html-to-image'),
      'playwright-core': pkg('playwright-core'),
      pixelmatch: pkg('pixelmatch'),
    },
    warmSamples: WARM,
    coldSamples: COLD,
  };
  log(`${version.product}, ${MODE}, gpu: ${gpu.device ?? gpu.error}`);
}

const A = (s, o) => s.page.evaluate((opts) => window.s3.captureA(opts), o);
const pngOf = (r) => decode(r.buf ?? Buffer.from(r.b64, 'base64'));
const cmp = (a, b, region) => {
  const c = compare(a, b, region);
  if (c.sizeMismatch) return c;
  const { diff, ...rest } = c;
  return { ...rest, diffPng: diff };
};
const strip = (c) => {
  if (!c) return c;
  const { diffPng, ...rest } = c;
  return rest;
};

// ---------------------------------------------------------------------------------------------
// 1. Reference images, fidelity of A against B, per-feature evidence.
async function sectionImages() {
  results.fidelity = {};
  results.features = {};
  results.slideInfo = {};
  for (const slide of FIDELITY_SLIDES) {
    log(`images: ${slide}`);
    const ed = await openSlide(browser, origin, { slide, view: 'editor' });
    const fu = await openSlide(browser, origin, { slide, view: 'full' });
    const info = await ed.page.evaluate(() => window.s3.info());
    results.slideInfo[slide] = {
      nodes: info.nodes,
      fontsLoaded: info.fontsLoaded,
      fontFacesDeclared: info.fontFacesDeclared,
      computedCssTextLength: info.computedCssTextLength,
      notes: info.notes,
      console: [...new Set([...ed.consoleLog, ...fu.consoleLog])],
    };

    const img = {};
    // Method B.
    img.B_editor_960 = pngOf(await captureB(ed, 960)); // exactly what the user sees
    img.B_editor_1920 = pngOf(await captureB(ed, 1920)); // clip.scale = 2 on the scaled-down slide
    img.B_full_1920 = pngOf(await captureB(fu, 1920)); // slide at 100%, 1:1
    img.B_full_1920_again = pngOf(await captureB(fu, 1920));
    img.B_full_960 = pngOf(await captureB(fu, 960)); // clip.scale = 0.5 on the 100% slide
    // Method A (warm it once first so the reference image is not a cold capture).
    await A(ed, { pixelRatio: 0.5 });
    await A(fu, { pixelRatio: 1 });
    img.A_editor_960 = pngOf(await A(ed, { pixelRatio: 0.5 }));
    img.A_editor_1920 = pngOf(await A(ed, { pixelRatio: 1 }));
    img.A_full_960 = pngOf(await A(fu, { pixelRatio: 0.5 }));
    img.A_full_1920 = pngOf(await A(fu, { pixelRatio: 1 }));
    // Diagnostic: the same library with its font-size adjustment switched off.
    const pe = await openSlide(browser, origin, { slide, view: 'editor', lib: 'patched' });
    await A(pe, { pixelRatio: 0.5 });
    img.Apatched_editor_960 = pngOf(await A(pe, { pixelRatio: 0.5 }));
    img.Apatched_editor_1920 = pngOf(await A(pe, { pixelRatio: 1 }));
    await pe.close();
    for (const [k, p] of Object.entries(img)) {
      if (!k.endsWith('again')) save('img', `${slide}-${k}.png`, encode(p));
    }
    // Derived images: a 2x2 box downsample of the 1920 captures.
    img.B_full_1920_box2 = box2(img.B_full_1920);
    img.A_editor_1920_box2 = box2(img.A_editor_1920);

    const pairs = {
      // A against B
      'A_vs_B_960': ['A_editor_960', 'B_editor_960'],
      'A_vs_B_1920': ['A_editor_1920', 'B_full_1920'],
      'A_vs_Bgrey_1920': ['A_editor_1920', 'B_editor_1920'],
      'Apatched_vs_B_960': ['Apatched_editor_960', 'B_editor_960'],
      'Apatched_vs_Bgrey_1920': ['Apatched_editor_1920', 'B_editor_1920'],
      'Apatched_vs_B_1920': ['Apatched_editor_1920', 'B_full_1920'],
      // Is the half-size output a fresh rasterisation or a scaled bitmap?
      'B_960_vs_box2_of_B_1920': ['B_full_960', 'B_full_1920_box2'],
      'A_960_vs_box2_of_A_1920': ['A_editor_960', 'A_editor_1920_box2'],
      // B against itself: noise floor and clip/scale consistency
      'B_noise_1920': ['B_full_1920', 'B_full_1920_again'],
      'B_clipScale2_vs_B_100pct_1920': ['B_editor_1920', 'B_full_1920'],
      'B_clipScaleHalf_vs_B_editor_960': ['B_full_960', 'B_editor_960'],
      // A against itself: does the displayed zoom change the output?
      'A_editor_vs_A_full_1920': ['A_editor_1920', 'A_full_1920'],
      'A_editor_vs_A_full_960': ['A_editor_960', 'A_full_960'],
    };
    results.fidelity[slide] = {};
    for (const [name, [a, b]] of Object.entries(pairs)) {
      const c = cmp(img[a], img[b]);
      results.fidelity[slide][name] = { a, b, ...strip(c) };
      if (c.diffPng && /^A(patched)?_vs_B/.test(name)) {
        results.fidelity[slide][name].diffImage = save('img', `${slide}-diff-${name}.png`, encode(c.diffPng));
      }
    }

    // Per-feature evidence at 1920 (A | B | diff). The B reference is the capture with greyscale text
    // (50% view, clip.scale 2), so LCD fringes do not pollute the per-feature numbers.
    results.features[slide] = [];
    const refB = img.B_editor_1920;
    const whole = cmp(img.A_editor_1920, refB);
    for (const f of info.features) {
      const c = cmp(img.A_editor_1920, refB, f.region);
      const cp = cmp(img.Apatched_editor_1920, refB, f.region);
      const cut = (p, k) => crop(p, f[k].x, f[k].y, f[k].w, f[k].h);
      results.features[slide].push({
        feature: f.name,
        pm: c.pm,
        hard: c.hard,
        mae: c.mae,
        pmPatched: cp.pm,
        hardPatched: cp.hard,
        nonBlankA: nonBlankPct(cut(img.A_editor_1920, 'region')),
        nonBlankB: nonBlankPct(cut(refB, 'region')),
        evidence: save(
          'feat',
          `${slide}-${f.name}.png`,
          encode(hstack([cut(img.A_editor_1920, 'crop'), cut(refB, 'crop'), cut(whole.diffPng, 'crop')])),
        ),
      });
    }
    await ed.close();
    await fu.close();
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Timing: slide x method x size. Cold = first capture in a fresh browser context;
// warm = the captures that follow it, pooled over all the fresh contexts.
async function sectionTiming() {
  results.timing = {};
  const methods = {
    'A default': { kind: 'A', view: 'editor', font: 'default' },
    'A fontEmbedCSS cached': { kind: 'A', view: 'editor', font: 'precomputed' },
    'B editor view': { kind: 'B', view: 'editor' },
    'B 100% view': { kind: 'B', view: 'full' },
    'B 100% view, optimizeForSpeed': { kind: 'B', view: 'full', fast: true },
  };
  for (const slide of SLIDES) {
    results.timing[slide] = {};
    for (const [mname, m] of Object.entries(methods)) {
      results.timing[slide][mname] = {};
      for (const size of SIZES) {
        const colds = [];
        const warm = [];
        const perContextMedian = [];
        let fontPrecompute = null;
        let bytes = null;
        for (let i = 0; i < COLD; i++) {
          const s = await openSlide(browser, origin, { slide, view: m.view });
          let times;
          if (m.kind === 'A') {
            const o = { pixelRatio: size / 1920, font: m.font };
            if (m.font === 'precomputed') {
              fontPrecompute = await s.page.evaluate(() => window.s3.fontEmbed('all'));
            }
            const first = await s.page.evaluate((opts) => window.s3.captureA(opts), o);
            colds.push(first.ms);
            const b = await s.page.evaluate(([opts, n]) => window.s3.benchA(opts, n), [o, WARM]);
            times = b.times;
            bytes = b.bytes;
          } else {
            const first = await captureB(s, size, { fast: m.fast });
            colds.push(first.ms);
            const b = await benchB(s, size, WARM, { fast: m.fast });
            times = b.times;
            bytes = b.buf.length;
          }
          warm.push(...times);
          perContextMedian.push(stats(times).median);
          await s.close();
        }
        const w = stats(warm);
        results.timing[slide][mname][size] = {
          cold: stats(colds).median,
          coldSamples: colds,
          median: w.median,
          p95: w.p95,
          min: w.min,
          max: w.max,
          n: w.n,
          perContextMedian,
          pngBytes: bytes,
          fontPrecompute,
        };
        log(
          `timing: ${slide} | ${mname} | ${size}: cold ${stats(colds).median.toFixed(0)} ms, ` +
            `median ${w.median.toFixed(0)} ms, p95 ${w.p95.toFixed(0)} ms (per context: ${perContextMedian.map((x) => x.toFixed(0)).join(', ')})`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 3. Method A: options, font-embedding cache, phase breakdown.
async function sectionAOptions() {
  results.aOptions = {};
  const variants = {
    'default (library embeds fonts on every call)': { font: 'default' },
    'preferredFontFormat: woff2': { font: 'woff2' },
    'fontEmbedCSS precomputed': { font: 'precomputed' },
    'fontEmbedCSS precomputed, woff2 only': { font: 'precomputed-woff2' },
    'skipFonts: true': { font: 'skip' },
    'cacheBust: true': { font: 'default', cacheBust: true },
  };
  for (const slide of SLIDES) {
    log(`aopts: ${slide}`);
    const r = (results.aOptions[slide] = { variants: {} });
    // Reference: B at 960 in the editor view.
    const ref = await openSlide(browser, origin, { slide, view: 'editor' });
    const refB = pngOf(await captureB(ref, 960));
    await ref.close();

    for (const [vname, v] of Object.entries(variants)) {
      const s = await openSlide(browser, origin, { slide, view: 'editor' });
      const o = { pixelRatio: 0.5, ...v };
      let embed = null;
      if (v.font === 'precomputed') embed = await s.page.evaluate(() => window.s3.fontEmbed('all'));
      if (v.font === 'precomputed-woff2') embed = await s.page.evaluate(() => window.s3.fontEmbed('woff2'));
      let first;
      try {
        first = await s.page.evaluate((opts) => window.s3.captureA(opts), o);
      } catch (e) {
        // The library rejects the whole capture when one resource fails (it rejects with a DOM Event).
        r.variants[vname] = { error: e.message.split('\n')[0].replace('page.evaluate: ', '') };
        await s.close();
        continue;
      }
      const b = await s.page.evaluate(([opts, n]) => window.s3.benchA(opts, n), [o, 20]);
      const w = stats(b.times);
      const last = decode(Buffer.from(b.b64, 'base64'));
      const firstPng = decode(Buffer.from(first.b64, 'base64'));
      const vsB = cmp(last, refB);
      const coldVsWarm = cmp(firstPng, last);
      r.variants[vname] = {
        cold: first.ms,
        median: w.median,
        p95: w.p95,
        fontEmbedMs: embed?.ms ?? null,
        fontEmbedChars: embed?.length ?? null,
        vsB: strip(vsB),
        coldVsWarm: strip(coldVsWarm),
      };
      const tag = `opt${Object.keys(variants).indexOf(vname)}-${v.font}${v.cacheBust ? '-cacheBust' : ''}`;
      save('misc', `${slide}-A-${tag}-960.png`, encode(last));
      if (vsB.diffPng) save('misc', `${slide}-A-${tag}-diff-vs-B-960.png`, encode(vsB.diffPng));
      if (vname.startsWith('default')) {
        // Phase breakdown and the end-to-end cost of getting the PNG out to Node.
        const phases = await s.page.evaluate((opts) => window.s3.phasesA(opts, 7), o);
        const med = (k) => stats(phases.map((p) => p[k])).median;
        r.phases960 = {
          toSvg: med('toSvg'),
          decode: med('decode'),
          draw: med('draw'),
          encode: med('encode'),
          svgChars: phases[0].svgChars,
        };
        const phases2 = await s.page.evaluate((opts) => window.s3.phasesA(opts, 7), { ...o, pixelRatio: 1 });
        const med2 = (k) => stats(phases2.map((p) => p[k])).median;
        r.phases1920 = {
          toSvg: med2('toSvg'),
          decode: med2('decode'),
          draw: med2('draw'),
          encode: med2('encode'),
          svgChars: phases2[0].svgChars,
        };
        const e2e = [];
        for (let i = 0; i < 10; i++) {
          const t0 = performance.now();
          await A(s, o);
          e2e.push(performance.now() - t0);
        }
        r.e2eToNode960 = stats(e2e).median;
      }
      await s.close();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// 4. Method B: flags, device pixel ratio, clip rounding, content beyond the viewport.
async function sectionBOptions() {
  const r = (results.bOptions = { flags: {}, dpr: {}, odd: {}, offscreen: {} });

  // 4a. captureBeyondViewport x fromSurface x optimizeForSpeed.
  for (const slide of ['baseline', 'heavy']) {
    r.flags[slide] = {};
    for (const view of ['editor', 'full']) {
      const s = await openSlide(browser, origin, { slide, view });
      for (const size of SIZES) {
        const ref = pngOf(await captureB(s, size));
        for (const cbv of [false, true]) {
          for (const fromSurface of [true, false]) {
            for (const fast of [false, true]) {
              const key = `${view} ${size} | cbv=${cbv} fromSurface=${fromSurface} optimizeForSpeed=${fast}`;
              try {
                const b = await withTimeout(benchB(s, size, 20, { cbv, fromSurface, fast }), 60000, key);
                const png = decode(b.buf);
                const c = cmp(png, ref);
                r.flags[slide][key] = {
                  view,
                  size,
                  cbv,
                  fromSurface,
                  fast,
                  median: stats(b.times).median,
                  p95: stats(b.times).p95,
                  pngBytes: b.buf.length,
                  dims: `${png.width}x${png.height}`,
                  vsDefault: strip(c),
                };
                if (c.sizeMismatch || c.hard > 0.5) save('misc', `${slide}-B-flags-${view}-${size}-cbv${+cbv}-surf${+fromSurface}-fast${+fast}.png`, b.buf);
              } catch (e) {
                r.flags[slide][key] = { view, size, cbv, fromSurface, fast, error: e.message.split('\n')[0] };
              }
            }
          }
        }
      }
      await s.close();
    }
    log(`bopts: flags ${slide} done`);
  }

  // 4a2. Text anti-aliasing. At 100% Chromium may draw text with LCD (sub-pixel, coloured) anti-aliasing,
  // while the editor shows the slide under transform: scale(), which gets greyscale anti-aliasing.
  {
    r.lcd = {};
    const chroma = (png) => {
      // Share of pixels inside the white card of the baseline slide whose channels disagree strongly:
      // a direct sign of coloured sub-pixel fringes on dark text.
      const k = png.width / 1920;
      const c = crop(png, 1030 * k, 760 * k, 760 * k, 200 * k);
      let n = 0;
      for (let i = 0; i < c.data.length; i += 4) {
        const mx = Math.max(c.data[i], c.data[i + 1], c.data[i + 2]);
        const mn = Math.min(c.data[i], c.data[i + 1], c.data[i + 2]);
        if (mx - mn > 60) n++;
      }
      return (100 * n) / (c.width * c.height);
    };
    const ed = await openSlide(browser, origin, { slide: 'baseline', view: 'editor' });
    const e960 = pngOf(await captureB(ed, 960));
    const e1920 = pngOf(await captureB(ed, 1920));
    await A(ed, { pixelRatio: 0.5 });
    const a960 = pngOf(await A(ed, { pixelRatio: 0.5 }));
    await ed.close();
    r.lcd['B editor view (50%, transform: scale)'] = { fringe960: chroma(e960), fringe1920: chroma(e1920) };
    r.lcd['A (any view)'] = { fringe960: chroma(a960) };
    const variants = {
      'B 100% view': {},
      'B 100% view, will-change: transform on the slide wrapper': { layer: true },
      'B 100% view, browser started with --disable-lcd-text': { args: ['--disable-lcd-text'] },
    };
    for (const [name, v] of Object.entries(variants)) {
      const b = v.args ? await launch({ headed: HEADED, args: v.args }) : browser;
      try {
        const s = await openSlide(b, origin, { slide: 'baseline', view: 'full', layer: v.layer });
        const p960 = pngOf(await captureB(s, 960));
        const p1920 = pngOf(await captureB(s, 1920));
        r.lcd[name] = {
          fringe960: chroma(p960),
          fringe1920: chroma(p1920),
          vsEditor960: strip(cmp(p960, e960)),
          vsEditor1920: strip(cmp(p1920, e1920)),
        };
        save('misc', `baseline-B-lcd-${Object.keys(variants).indexOf(name)}-960.png`, encode(p960));
        await s.close();
      } finally {
        if (v.args) await b.close();
      }
    }
  }

  // 4b. Device pixel ratio. Which clip.scale gives exactly 960x540: target / clipCssWidth, or that
  // divided by devicePixelRatio? Tested with an emulated DPR (what Playwright's deviceScaleFactor does)
  // and with a real one (browser started with --force-device-scale-factor, no emulation).
  const refS = await openSlide(browser, origin, { slide: 'baseline', view: 'editor' });
  const ref960 = pngOf(await captureB(refS, 960));
  await A(refS, { pixelRatio: 0.5 });
  const refA960 = pngOf(await A(refS, { pixelRatio: 0.5 }));
  await refS.close();
  r.dpr = [];
  for (const emulated of [true, false]) {
    for (const dpr of [1.25, 1.5, 2]) {
      const b = emulated
        ? browser
        : await launch({ headed: HEADED, args: [`--force-device-scale-factor=${dpr}`, '--window-size=1600,900'] });
      try {
        const s = await openSlide(b, origin, {
          slide: 'baseline',
          view: 'editor',
          dpr: emulated ? dpr : undefined,
          noEmulation: !emulated,
        });
        const info = await s.page.evaluate(() => window.s3.info());
        const w = s.clip.width;
        const naive = pngOf(await captureB(s, 960, { cbv: true, scale: 960 / w }));
        const divided = pngOf(await captureB(s, 960, { cbv: true, scale: 960 / (w * info.dpr) }));
        const exact = [naive, divided].find((p) => p.width === 960 && p.height === 540);
        await A(s, { pixelRatio: 0.5 });
        const aA = pngOf(await A(s, { pixelRatio: 0.5 }));
        r.dpr.push({
          kind: emulated ? 'emulated (Emulation.setDeviceMetricsOverride)' : 'real (--force-device-scale-factor)',
          dpr,
          pageDpr: info.dpr,
          viewport: info.viewport,
          naive: `${naive.width}x${naive.height}`,
          divided: `${divided.width}x${divided.height}`,
          exactVsDpr1: exact ? strip(cmp(exact, ref960)) : null,
          A960: `${aA.width}x${aA.height}`,
          A960vsDpr1: strip(cmp(aA, refA960)),
        });
        if (exact) save('misc', `baseline-B-${emulated ? 'emulated' : 'real'}-dpr${dpr}-960.png`, encode(exact));
        await s.close();
      } finally {
        if (!emulated) await b.close();
      }
    }
  }

  // 4c. Arbitrary editor zoom (0.613) at a fractional position: is the output exactly 960x540 / 1920x1080?
  for (const slide of ['baseline', 'css']) {
    const ed = await openSlide(browser, origin, { slide, view: 'editor' });
    const e960 = pngOf(await captureB(ed, 960));
    const e1920 = pngOf(await captureB(ed, 1920));
    await ed.close();
    const s = await openSlide(browser, origin, { slide, view: 'odd' });
    const info = await s.page.evaluate(() => window.s3.info());
    const naive960 = pngOf(await captureB(s, 960));
    const naive1920 = pngOf(await captureB(s, 1920));
    // Nudge the scale up by one part per million so that width * scale cannot land just below the integer.
    const a = pngOf(await captureB(s, 960, { scale: (960 / s.clip.width) * (1 + 1e-6) }));
    const b = pngOf(await captureB(s, 1920, { scale: (1920 / s.clip.width) * (1 + 1e-6) }));
    // Snap the clip to whole CSS pixels (the slide edge then falls up to half a pixel inside or outside it).
    const snap = { x: Math.round(s.clip.x), y: Math.round(s.clip.y), width: Math.round(s.clip.width), height: Math.round(s.clip.height) };
    const sn = pngOf(await captureB(s, 960, { clip: snap }));
    const cSnap = cmp(sn, e960);
    if (cSnap.diffPng) save('misc', `${slide}-B-oddzoom-snapped-960-diff-vs-50pct-view.png`, encode(cSnap.diffPng));
    save('misc', `${slide}-B-oddzoom-snapped-960.png`, encode(sn));
    const c960 = cmp(a, e960);
    const c1920 = cmp(b, e1920);
    r.odd[slide] = {
      snapped: { clip: snap, dims: `${sn.width}x${sn.height}`, vsEditor: strip(cSnap) },
      rect: info.rect,
      naive960: `${naive960.width}x${naive960.height}`,
      naive1920: `${naive1920.width}x${naive1920.height}`,
      B960: { dims: `${a.width}x${a.height}`, vsEditor: strip(c960) },
      B1920: { dims: `${b.width}x${b.height}`, vsEditor: strip(c1920) },
    };
    save('misc', `${slide}-B-oddzoom-960.png`, encode(a));
    if (c960.diffPng) save('misc', `${slide}-B-oddzoom-960-diff-vs-50pct-view.png`, encode(c960.diffPng));
    await s.close();
  }

  // 4d. Content outside the viewport.
  {
    const full = await openSlide(browser, origin, { slide: 'css', view: 'full' });
    const ref = pngOf(await captureB(full, 960));
    await full.close();
    const cases = [];
    // Slide at 100% in an 800x450 viewport (only the top-left 800x450 is on screen).
    const small = await openSlide(browser, origin, { slide: 'css', view: 'small' });
    for (const cbv of [false, true]) {
      const b = await benchB(small, 960, 10, { cbv });
      const png = decode(b.buf);
      const c = cmp(png, ref);
      cases.push({
        case: `slide at 100% in an 800x450 viewport, captureBeyondViewport=${cbv}`,
        dims: `${png.width}x${png.height}`,
        median: stats(b.times).median,
        vsRef: strip(c),
        image: save('misc', `css-B-smallviewport-cbv${+cbv}-960.png`, b.buf),
      });
    }
    await small.close();
    // A second slide rendered below / left of the visible page area of the editor page.
    for (const mode of ['below', 'left']) {
      const s = await openSlide(browser, origin, { slide: 'baseline', view: 'editor' });
      const off = await s.page.evaluate((m) => window.s3.renderOffscreen('css', m), mode);
      const clip = { x: off.rect.x, y: off.rect.y, width: 1920, height: 1080 };
      for (const cbv of [false, true]) {
        try {
          const b = await withTimeout(benchB(s, 960, 10, { cbv, clip }), 30000, 'offscreen capture');
          const png = decode(b.buf);
          const c = cmp(png, ref);
          cases.push({
            case: `other slide in the same page, container at (${clip.x}, ${clip.y}), captureBeyondViewport=${cbv}`,
            dims: `${png.width}x${png.height}`,
            buildMs: off.ms,
            median: stats(b.times).median,
            vsRef: strip(c),
            image: save('misc', `css-B-offscreen-${mode}-cbv${+cbv}-960.png`, b.buf),
          });
        } catch (e) {
          cases.push({ case: `other slide in the same page (${mode}), captureBeyondViewport=${cbv}`, error: e.message.split('\n')[0] });
        }
      }
      await s.close();
    }
    r.offscreen = cases;
  }
  log('bopts: done');
}

// ---------------------------------------------------------------------------------------------
// 5. Capturing a slide the user is not looking at, and the editor-overlay problem.
async function sectionInactive() {
  const r = (results.inactive = { A: [], B: {}, overlay: {} });

  for (const target of ['baseline', 'embedded', 'heavy']) {
    // References for the target slide.
    const refS = await openSlide(browser, origin, { slide: target, view: 'full' });
    const refB = pngOf(await captureB(refS, 960));
    await A(refS, { pixelRatio: 0.5 });
    const refA = pngOf(await A(refS, { pixelRatio: 0.5 }));
    await refS.close();

    // Method A: render the other slide into a container the user cannot see, in the editor page.
    for (const mode of ['left', 'hidden', 'none', 'detached']) {
      const s = await openSlide(browser, origin, { slide: 'css', view: 'editor' });
      const row = { slide: target, mode };
      try {
        const off = await withTimeout(
          s.page.evaluate(([n, m]) => window.s3.renderOffscreen(n, m), [target, mode]),
          30000,
          'renderOffscreen',
        );
        row.buildMs = off.ms;
        const first = await withTimeout(
          s.page.evaluate((m) => window.s3.captureA({ pixelRatio: 0.5, target: m }), mode),
          30000,
          'captureA',
        );
        row.firstCaptureMs = first.ms;
        const b = await s.page.evaluate((m) => window.s3.benchA({ pixelRatio: 0.5, target: m }, 10), mode);
        row.warmMedianMs = stats(b.times).median;
        const png = decode(Buffer.from(b.b64, 'base64'));
        const cA = cmp(png, refA);
        const cB = cmp(png, refB);
        row.vsA_normal = strip(cA);
        row.vsB = strip(cB);
        row.nonBlank = nonBlankPct(png);
        row.image = save('misc', `${target}-A-offscreen-${mode}-960.png`, encode(png));
        if (cA.diffPng && cA.pm > 0.05) save('misc', `${target}-A-offscreen-${mode}-960-diff-vs-A.png`, encode(cA.diffPng));
      } catch (e) {
        row.error = e.message.split('\n')[0];
      }
      r.A.push(row);
      await s.close();
    }
    log(`inactive: A ${target} done`);
  }

  // Method B: a second page dedicated to captures.
  {
    const refs = {};
    for (const slide of SLIDES) {
      const s = await openSlide(browser, origin, { slide, view: 'full' });
      refs[slide] = pngOf(await captureB(s, 960));
      await s.close();
    }
    // Cold: open a page for the slide, wait for fonts/images, capture.
    const cold = [];
    for (const slide of SLIDES) {
      const t0 = performance.now();
      const s = await openSlide(browser, origin, { slide, view: 'full' });
      const openMs = performance.now() - t0;
      const cap = await captureB(s, 960);
      cold.push({ slide, openMs, captureMs: cap.ms, vsRef: strip(cmp(pngOf(cap), refs[slide])) });
      await s.close();
    }
    // Warm: keep one capture page alive, swap the slide in it, capture.
    const s = await openSlide(browser, origin, { slide: 'baseline', view: 'full' });
    const warm = [];
    for (let i = 0; i < 12; i++) {
      const slide = SLIDES[(i + 1) % SLIDES.length];
      const swap = await s.page.evaluate((n) => window.s3.swapSlide(n), slide);
      const cap = await captureB(s, 960);
      warm.push({ slide, swapMs: swap.ms, captureMs: cap.ms, vsRef: strip(cmp(pngOf(cap), refs[slide])) });
    }
    await s.close();
    r.B = { cold, warm };
    log('inactive: B done');
  }

  // The editor overlay (selection handles) is composited on top of the slide.
  {
    const plain = await openSlide(browser, origin, { slide: 'baseline', view: 'editor' });
    const pB = pngOf(await captureB(plain, 960));
    await A(plain, { pixelRatio: 0.5 });
    const pA = pngOf(await A(plain, { pixelRatio: 0.5 }));
    await plain.close();
    const ov = await openSlide(browser, origin, { slide: 'baseline', view: 'editor', overlay: true });
    const oB = pngOf(await captureB(ov, 960));
    await A(ov, { pixelRatio: 0.5 });
    const oA = pngOf(await A(ov, { pixelRatio: 0.5 }));
    await ov.close();
    const cB = cmp(oB, pB);
    const cA = cmp(oA, pA);
    r.overlay = {
      B_withOverlay_vs_without: strip(cB),
      A_withOverlay_vs_without: strip(cA),
      imageB: save('misc', 'baseline-B-editor-with-selection-overlay-960.png', encode(oB)),
      imageA: save('misc', 'baseline-A-editor-with-selection-overlay-960.png', encode(oA)),
    };
  }
}

// ---------------------------------------------------------------------------------------------
// 6. Background (non-focused) page, and a minimised window when headed.
async function sectionBackground() {
  const r = (results.background = { states: [] });
  const refs = {};
  for (const slide of ['baseline', 'css', 'heavy']) {
    const s = await openSlide(browser, origin, { slide, view: 'full' });
    refs[slide] = pngOf(await captureB(s, 960));
    await s.close();
  }
  // Two separate browsers: one stock, one with the three "disable backgrounding" switches that
  // Playwright adds by default (--disable-backgrounding-occluded-windows, --disable-renderer-backgrounding,
  // --disable-background-timer-throttling).
  for (const stock of [true, false]) {
  const config = stock ? 'stock' : 'backgrounding switches off';
  const b2 = await launch({ headed: HEADED, stockBackgrounding: stock });

  // For one state of the capture page: captures of unchanged content, captures right after the
  // content changed (what a kept-alive capture page does for every request), and method A once.
  const measure = async (state, cap) => {
    const row = { config, state };
    Object.assign(
      row,
      await cap.page.evaluate(() => ({ visibility: document.visibilityState, hasFocus: document.hasFocus() })),
    );
    try {
      const b = await withTimeout(benchB(cap, 960, 20), 60000, 'capture');
      const c = cmp(decode(b.buf), refs.baseline);
      Object.assign(row, { median: stats(b.times).median, p95: stats(b.times).p95, vsRef: strip(c) });
      save('misc', `baseline-B-${(config + ' ' + state).replace(/[^a-z]+/gi, '-')}-960.png`, b.buf);
    } catch (e) {
      row.error = e.message.split('\n')[0];
    }
    try {
      const swaps = [];
      for (let i = 0; i < 6; i++) {
        const slide = ['css', 'heavy', 'baseline'][i % 3];
        const swap = await withTimeout(cap.page.evaluate((n) => window.s3.swapSlide(n), slide), 30000, 'swapSlide');
        const shot = await withTimeout(captureB(cap, 960), 30000, 'capture after content change');
        swaps.push({ slide, swapMs: swap.ms, captureMs: shot.ms, vsRef: strip(cmp(pngOf(shot), refs[slide])) });
      }
      row.swaps = swaps;
      row.swapMedian = stats(swaps.map((x) => x.swapMs)).median;
      row.captureAfterSwapMedian = stats(swaps.map((x) => x.captureMs)).median;
      row.captureAfterSwapMax = stats(swaps.map((x) => x.captureMs)).max;
      row.worstAfterSwap = swaps.reduce((w, x) => ((x.vsRef.pm ?? 100) > (w.pm ?? -1) ? x.vsRef : w), {});
    } catch (e) {
      row.swapError = e.message.split('\n')[0];
    }
    try {
      const a = await withTimeout(cap.page.evaluate(() => window.s3.captureA({ pixelRatio: 0.5 })), 20000, 'method A');
      row.methodA = a.ms;
    } catch (e) {
      row.methodAError = e.message.split('\n')[0].replace('page.evaluate: ', '');
    }
    r.states.push(row);
    log(`background: ${config} / ${state}: ${JSON.stringify({ ...row, swaps: undefined })}`);
  };

  try {
    const context = await b2.newContext({ viewport: VIEWS.full.viewport });
    const cap = await openSlide(b2, origin, { slide: 'baseline', view: 'full', context });
    await measure('foreground', cap);

    // A page in a second window (its own browser context) is opened and brought to the front.
    const other = await openSlide(b2, origin, { slide: 'heavy', view: 'full' });
    await other.page.bringToFront();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await measure('another window in front', cap);
    await other.close();

    // A second page (tab) in the same window is opened and brought to the front.
    const front = await openSlide(b2, origin, { slide: 'heavy', view: 'full', context });
    await front.page.bringToFront();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await measure('another tab of the same window in front', cap);

    // Minimised window (headed only; a headless browser has no real window state).
    if (HEADED) {
      await cap.page.bringToFront();
      const bs = await b2.newBrowserCDPSession();
      const { targetInfo } = await cap.cdp.send('Target.getTargetInfo');
      const { windowId } = await bs.send('Browser.getWindowForTarget', { targetId: targetInfo.targetId });
      await bs.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await measure('window minimised', cap);
      await bs.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } }).catch(() => {});
    }
  } finally {
    await b2.close();
  }
  }
}

// ---------------------------------------------------------------------------------------------
try {
  browser = await launch({ headed: HEADED });
  await ensureAssets();
  await environment();
  if (ONLY.includes('images')) await sectionImages();
  if (ONLY.includes('timing')) await sectionTiming();
  if (ONLY.includes('aopts')) await sectionAOptions();
  if (ONLY.includes('bopts')) await sectionBOptions();
  if (ONLY.includes('inactive')) await sectionInactive();
  if (ONLY.includes('background')) await sectionBackground();
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  const tables = writeTables(results);
  fs.writeFileSync(path.join(OUT, 'tables.md'), tables);
  log(`wrote out/${MODE}/results.json and out/${MODE}/tables.md`);
} finally {
  await browser?.close().catch(() => {});
  await server.close();
}
