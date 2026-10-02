// Turns results.json into markdown tables (out/<mode>/tables.md).
import { r0, r1, pct } from './stats.mjs';

const table = (head, rows) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

const fid = (c) => (!c ? 'n/a' : c.sizeMismatch ? `size ${c.sizeMismatch}` : `${pct(c.pm)}% / ${pct(c.hard)}%`);

export function writeTables(R) {
  const out = [];
  const h = (s) => out.push(`\n## ${s}\n`);
  const e = R.env ?? {};
  out.push(`# S3 measurements (${e.mode})`);
  out.push(
    `\nGenerated ${e.date}. ${e.browser}, ${e.os}, ${e.cpu}, Node ${e.node}. ` +
      `GPU: ${e.gpu?.device ?? e.gpu?.error}; gpu_compositing=${e.gpu?.featureStatus?.gpu_compositing}, ` +
      `canvas=${e.gpu?.featureStatus?.['2d_canvas']}, rasterization=${e.gpu?.featureStatus?.rasterization}. ` +
      `html-to-image ${e.versions?.['html-to-image']}, playwright-core ${e.versions?.['playwright-core']}. ` +
      `Warm samples per cell: ${e.warmSamples}; cold = median of ${e.coldSamples} fresh browser contexts.`,
  );

  if (R.timing) {
    h('Timing (ms): slide x method x size');
    const rows = [];
    for (const [slide, methods] of Object.entries(R.timing)) {
      for (const [m, sizes] of Object.entries(methods)) {
        for (const [size, t] of Object.entries(sizes)) {
          rows.push([
            slide,
            m,
            `${size}x${(size * 9) / 16}`,
            r0(t.cold),
            r0(t.median),
            r0(t.p95),
            r0(t.max),
            `${Math.round(t.pngBytes / 1024)} KB`,
          ]);
        }
      }
    }
    out.push(table(['slide', 'method', 'size', 'cold', 'warm median', 'warm p95', 'warm max', 'PNG'], rows));
    const pre = [];
    for (const [slide, methods] of Object.entries(R.timing)) {
      const f = methods['A fontEmbedCSS cached']?.[960]?.fontPrecompute;
      if (f) pre.push([slide, r0(f.ms), `${Math.round(f.length / 1024)} KB`]);
    }
    if (pre.length) {
      out.push('\nOne-off cost of `getFontEmbedCSS()` (not included in the "A fontEmbedCSS cached" rows):\n');
      out.push(table(['slide', 'getFontEmbedCSS ms', 'CSS size'], pre));
    }
  }

  if (R.fidelity) {
    h('Fidelity: percent of differing pixels');
    out.push(
      'Each cell is `pixelmatch % / hard %`: pixelmatch at threshold 0.1 with anti-aliased pixels excluded, ' +
        'and the plain share of pixels where any channel differs by more than 32/255.\n',
    );
    const cols = [
      ['A_vs_B_960', 'A vs B, 960x540'],
      ['A_vs_Bgrey_1920', 'A vs B, 1920x1080 (B: 50% view, clip.scale 2)'],
      ['A_vs_B_1920', 'A vs B, 1920x1080 (B: 100% view, LCD text)'],
      ['Apatched_vs_B_960', 'A with font-size line patched vs B, 960x540'],
      ['Apatched_vs_Bgrey_1920', 'A patched vs B, 1920x1080 (B: 50% view, clip.scale 2)'],
    ];
    const cols2 = [
      ['B_noise_1920', 'B vs B repeat (noise floor)'],
      ['B_clipScale2_vs_B_100pct_1920', 'B 1920: 50% view x clip.scale 2 vs 100% view'],
      ['B_clipScaleHalf_vs_B_editor_960', 'B 960: 100% view x clip.scale 0.5 vs 50% view'],
      ['B_960_vs_box2_of_B_1920', 'B 960 (clip.scale 0.5) vs 2x2 box downsample of B 1920'],
      ['A_editor_vs_A_full_1920', 'A 1920: from 50% view vs from 100% view'],
      ['A_editor_vs_A_full_960', 'A 960: from 50% view vs from 100% view'],
    ];
    out.push(
      table(
        ['slide', ...cols.map((c) => c[1])],
        Object.entries(R.fidelity).map(([slide, f]) => [slide, ...cols.map((c) => fid(f[c[0]]))]),
      ),
    );
    out.push('\nSelf-consistency of each method (same content, different route to the same output size):\n');
    out.push(
      table(
        ['slide', ...cols2.map((c) => c[1])],
        Object.entries(R.fidelity).map(([slide, f]) => [slide, ...cols2.map((c) => fid(f[c[0]]))]),
      ),
    );
  }

  if (R.features) {
    h('Method A per feature (1920x1080, measured inside the feature area only)');
    out.push(
      'Reference: B with greyscale text (50% view, clip.scale 2). "patched" is html-to-image with its font-size ' +
        'adjustment switched off, which removes the text drift and leaves only real feature differences.\n',
    );
    const rows = [];
    for (const [slide, list] of Object.entries(R.features)) {
      for (const f of list) {
        rows.push([
          slide,
          f.feature,
          `${pct(f.pm)}% / ${pct(f.hard)}%`,
          `${pct(f.pmPatched)}% / ${pct(f.hardPatched)}%`,
          r1(f.mae),
          `${r0(f.nonBlankA)} / ${r0(f.nonBlankB)}`,
          f.evidence,
        ]);
      }
    }
    out.push(table(['slide', 'feature', 'A vs B', 'A patched vs B', 'mean abs err', 'non-flat % A / B', 'evidence (A, B, diff)'], rows));
  }

  if (R.aOptions) {
    h('Method A options (960x540, editor view)');
    const rows = [];
    for (const [slide, r] of Object.entries(R.aOptions)) {
      for (const [v, t] of Object.entries(r.variants)) {
        if (t.error) {
          rows.push([slide, v, `ERROR: ${t.error}`, '', '', '', '', '']);
          continue;
        }
        rows.push([
          slide,
          v,
          r0(t.cold),
          r0(t.median),
          r0(t.p95),
          t.fontEmbedMs == null ? '' : `${r0(t.fontEmbedMs)} ms, ${Math.round(t.fontEmbedChars / 1024)} KB`,
          fid(t.vsB),
          fid(t.coldVsWarm),
        ]);
      }
    }
    out.push(table(['slide', 'options', 'first', 'warm median', 'warm p95', 'one-off getFontEmbedCSS', 'vs B', 'first capture vs warm capture'], rows));
    out.push('\nPhase breakdown of method A, default options (median of 7, ms):\n');
    const prow = [];
    for (const [slide, r] of Object.entries(R.aOptions)) {
      for (const [k, label] of [
        ['phases960', '960x540'],
        ['phases1920', '1920x1080'],
      ]) {
        const p = r[k];
        if (p) prow.push([slide, label, r0(p.toSvg), r0(p.decode), r0(p.draw), r0(p.encode), `${(p.svgChars / 1e6).toFixed(2)} M chars`]);
      }
    }
    out.push(table(['slide', 'size', 'clone + embed + serialise', 'SVG decode', 'drawImage', 'PNG encode', 'SVG data URL'], prow));
    out.push('\nMethod A measured from Node (page.evaluate round trip including the base64 PNG), 960x540, median of 10:\n');
    out.push(table(['slide', 'ms'], Object.entries(R.aOptions).map(([s, r]) => [s, r0(r.e2eToNode960)])));
  }

  if (R.bOptions) {
    const B = R.bOptions;
    h('Method B flags (20 captures each)');
    const rows = [];
    for (const [slide, f] of Object.entries(B.flags)) {
      for (const t of Object.values(f)) {
        rows.push([
          slide,
          t.view,
          t.size,
          t.cbv,
          t.fromSurface,
          t.fast,
          t.error ? `ERROR: ${t.error}` : r0(t.median),
          t.error ? '' : r0(t.p95),
          t.error ? '' : `${Math.round(t.pngBytes / 1024)} KB`,
          t.error ? '' : t.dims,
          t.error ? '' : fid(t.vsDefault),
        ]);
      }
    }
    out.push(table(['slide', 'view', 'width', 'captureBeyondViewport', 'fromSurface', 'optimizeForSpeed', 'median', 'p95', 'PNG', 'dims', 'vs default flags'], rows));

    if (B.lcd) {
      h('Text anti-aliasing in method B (baseline slide)');
      out.push(
        '"Coloured fringe" is the share of pixels in the white card whose RGB channels differ by more than 60: ' +
          'near zero means greyscale anti-aliasing, a few percent means LCD sub-pixel anti-aliasing.\n',
      );
      out.push(
        table(
          ['capture', 'coloured fringe % at 960', 'at 1920', 'vs B editor view, 960', 'vs B editor view, 1920'],
          Object.entries(B.lcd).map(([k, v]) => [k, pct(v.fringe960), v.fringe1920 == null ? '' : pct(v.fringe1920), v.vsEditor960 ? fid(v.vsEditor960) : '', v.vsEditor1920 ? fid(v.vsEditor1920) : '']),
        ),
      );
    }

    h('Device pixel ratio and output size (baseline slide, editor view, target 960x540)');
    out.push(
      table(
        ['DPR source', 'DPR', 'page devicePixelRatio', 'viewport', 'B, clip.scale = 960 / clipWidth', 'B, clip.scale = 960 / (clipWidth x DPR)', 'exact-size B vs B at DPR 1', 'A, pixelRatio 0.5', 'A vs A at DPR 1'],
        B.dpr.map((t) => [t.kind, t.dpr, t.pageDpr, t.viewport, t.naive, t.divided, fid(t.exactVsDpr1), t.A960, fid(t.A960vsDpr1)]),
      ),
    );

    h('Method B at an arbitrary editor zoom (scale 0.613, fractional position)');
    out.push(
      table(
        ['slide', 'on-screen rect', 'dims with scale = target / width', 'dims with scale x (1 + 1e-6)', 'clip snapped to whole px: dims', 'snapped 960 vs B 50% view'],
        Object.entries(B.odd).map(([s, t]) => [
          s,
          `${t.rect.x},${t.rect.y} ${r1(t.rect.width)}x${r1(t.rect.height)}`,
          `${t.naive960}, ${t.naive1920}`,
          `${t.B960.dims}, ${t.B1920.dims}`,
          t.snapped ? `${t.snapped.dims} (clip ${t.snapped.clip.x},${t.snapped.clip.y} ${t.snapped.clip.width}x${t.snapped.clip.height})` : '',
          t.snapped ? fid(t.snapped.vsEditor) : '',
        ]),
      ),
    );

    h('Method B on content outside the viewport (css slide, 960x540)');
    out.push(
      table(
        ['case', 'dims', 'median ms', 'vs reference', 'image'],
        B.offscreen.map((c) => [c.case, c.dims ?? '', c.error ? `ERROR: ${c.error}` : r0(c.median), fid(c.vsRef), c.image ?? '']),
      ),
    );
  }

  if (R.inactive) {
    const I = R.inactive;
    h('Capturing a slide that is not the visible one: method A');
    out.push(
      table(
        ['slide', 'container', 'build + fonts/images ms', 'first capture ms', 'warm median ms', 'vs A of the visible slide', 'vs B', 'non-flat %', 'image'],
        I.A.map((r) =>
          r.error
            ? [r.slide, r.mode, r0(r.buildMs), `ERROR: ${r.error}`, '', '', '', '', '']
            : [r.slide, r.mode, r0(r.buildMs), r0(r.firstCaptureMs), r0(r.warmMedianMs), fid(r.vsA_normal), fid(r.vsB), r0(r.nonBlank), r.image],
        ),
      ),
    );
    h('Capturing a slide that is not the visible one: method B with a second page');
    out.push('Cold (open a new page for the slide, wait for fonts and images, capture):\n');
    out.push(table(['slide', 'open + ready ms', 'capture ms', 'vs reference'], I.B.cold.map((c) => [c.slide, r0(c.openMs), r0(c.captureMs), fid(c.vsRef)])));
    out.push('\nWarm (capture page kept alive; swap the slide, wait for fonts and images, capture):\n');
    out.push(table(['slide', 'swap + ready ms', 'capture ms', 'vs reference'], I.B.warm.map((c) => [c.slide, r0(c.swapMs), r0(c.captureMs), fid(c.vsRef)])));
    h('Editor selection overlay');
    out.push(
      table(
        ['method', 'capture with overlay vs without', 'image'],
        [
          ['B (clip of the visible editor stage)', fid(I.overlay.B_withOverlay_vs_without), I.overlay.imageB],
          ['A (slide subtree only)', fid(I.overlay.A_withOverlay_vs_without), I.overlay.imageA],
        ],
      ),
    );
  }

  if (R.background?.states) {
    h('Method B (and A) when the captured page is not the focused one');
    out.push(
      '"stock" = browser launched without the three "disable backgrounding" switches that Playwright normally adds. "After content change" = swap the slide ' +
        'in the page, wait for fonts and images, then capture; this is what a kept-alive capture page does per request.\n',
    );
    out.push(
      table(
        ['browser', 'state of the captured page', 'visibilityState', 'hasFocus', 'unchanged content: median / p95 ms', 'vs reference', 'after content change: swap ms', 'capture median / max ms', 'worst vs reference', 'method A in that page, ms'],
        R.background.states.map((t) => [
          t.config,
          t.state,
          t.visibility,
          t.hasFocus,
          t.error ? `ERROR: ${t.error}` : `${r0(t.median)} / ${r0(t.p95)}`,
          fid(t.vsRef),
          t.swapError ? `ERROR: ${t.swapError}` : r0(t.swapMedian),
          t.swapError ? '' : `${r0(t.captureAfterSwapMedian)} / ${r0(t.captureAfterSwapMax)}`,
          t.swapError ? '' : fid(t.worstAfterSwap),
          t.methodAError ? `ERROR: ${t.methodAError}` : r0(t.methodA),
        ]),
      ),
    );
  }

  if (R.slideInfo) {
    h('Slide facts');
    out.push(
      table(
        ['slide', 'DOM elements in slide', 'font faces declared / loaded', 'getComputedStyle().cssText length', 'notes', 'console'],
        Object.entries(R.slideInfo).map(([s, i]) => [
          s,
          i.nodes,
          `${i.fontFacesDeclared} / ${i.fontsLoaded.length}`,
          i.computedCssTextLength,
          JSON.stringify(i.notes),
          i.console.length ? i.console.join('; ').slice(0, 300) : 'none',
        ]),
      ),
    );
  }
  return out.join('\n') + '\n';
}
