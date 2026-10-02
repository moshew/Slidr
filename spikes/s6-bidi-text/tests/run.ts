/**
 * WG0-S6 measurement runner.
 *
 *   pnpm measure                      full matrix (builds the page, serves it on a free port, drives installed Edge)
 *   pnpm measure --only click,coords  subset (results are merged into out/results.json)
 *   pnpm measure --modes transform --scales 0.64
 *   pnpm measure --headed             show the browser window
 *
 * Output: out/results.json (raw), out/summary.md (tables), out/*.png (screenshots).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { build, preview } from 'vite';

import {
  mBubble,
  mCaretPaint,
  mClick,
  mClickPaced,
  mCoords,
  mDragDrop,
  mEndOfTextblock,
  mIme,
  mKeyboard,
  mLines,
  mFocusHeuristic,
  mListDir,
  mScrollIntoView,
  mSelection,
  mTrailingNode,
  mTyping,
  mUndo,
} from './measures.ts';
import type { Ctx, PageOpts } from './measures.ts';
import { writeSummary } from './summary.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'out');
fs.mkdirSync(outDir, { recursive: true });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const ALL = ['click', 'coords', 'selection', 'keyboard', 'typing', 'ime', 'undo', 'bubble', 'caret', 'lines', 'listdir', 'scroll', 'eotb', 'dnd', 'focus', 'trailing', 'dsf'];
const only = (arg('only')?.split(',') ?? ALL).filter((x) => ALL.includes(x));
const modes = (arg('modes')?.split(',') ?? ['transform', 'zoom', 'plain']) as PageOpts['mode'][];
const scales = arg('scales')?.split(',').map(Number) ?? [0.25, 0.64, 1, 2];
/** beyond the requested set: Slidr's zoom range is 10%..400% */
const extremes = arg('scales') ? [] : [0.1, 4];

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const resultsPath = path.join(outDir, 'results.json');
const results: Json = fs.existsSync(resultsPath) && process.argv.length > 2 ? JSON.parse(fs.readFileSync(resultsPath, 'utf8')) : {};

function put(pathKeys: (string | number)[], value: unknown) {
  let o = results;
  for (const k of pathKeys.slice(0, -1)) o = o[String(k)] ??= {};
  o[String(pathKeys[pathKeys.length - 1])] = value;
}

const t0 = Date.now();
const log = (msg: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s] ${msg}`);

if (!flag('no-build')) {
  log('building page');
  await build({ root, logLevel: 'error' });
}
const server = await preview({ root, preview: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
const addr = server.httpServer.address();
if (!addr || typeof addr !== 'object') throw new Error('preview server did not start');
const base = `http://127.0.0.1:${addr.port}`;
log(`serving ${base}`);

const browser = await chromium.launch({ channel: 'msedge', headless: !flag('headed') });
const ctx: Ctx = { browser, base, outDir, dsf: 1 };

try {
  put(['meta'], {
    date: new Date().toISOString(),
    browser: `msedge ${browser.version()}`,
    headless: !flag('headed'),
    node: process.version,
    viewport: '1920x1080',
    deviceScaleFactor: 1,
    packages: Object.fromEntries(
      ['@tiptap/core', '@tiptap/react', '@tiptap/pm', 'prosemirror-view', '@floating-ui/dom', 'react', 'playwright-core', 'typescript', 'vite'].map((p) => {
        try {
          const dir = p === 'prosemirror-view' ? path.join(root, 'node_modules/.pnpm/node_modules', p) : path.join(root, 'node_modules', p);
          return [p, JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')).version];
        } catch {
          return [p, '?'];
        }
      }),
    ),
  });

  const matrix: PageOpts[] = modes.flatMap((mode) => scales.map((s) => ({ mode, s })));

  if (only.includes('lines')) {
    for (const o of matrix) put(['lines', o.mode, o.s], await mLines(ctx, o));
    log('lines done');
  }
  if (only.includes('click')) {
    for (const o of matrix) {
      const r = await mClick(ctx, o);
      put(['click', o.mode, o.s], r);
      log(`click ${o.mode} ${o.s}: strict ${r.total.ok}/${r.total.n}, visual ${r.total.visualOk}/${r.total.n}`);
    }
    for (const s of scales) {
      const r = await mClickPaced(ctx, { mode: 'transform', s });
      put(['clickPaced', 'transform', s], r);
      log(`click paced control transform ${s}: ${r.ok}/${r.n}`);
    }
    for (const s of extremes) {
      const r = await mClick(ctx, { mode: 'transform', s });
      put(['click', 'transform', s], r);
      log(`click transform ${s} (extreme): strict ${r.total.ok}/${r.total.n}, visual ${r.total.visualOk}/${r.total.n}`);
    }
  }
  if (only.includes('coords')) {
    for (const o of [...matrix, ...extremes.map((s) => ({ mode: 'transform' as const, s }))]) {
      put(['coords', o.mode, o.s], await mCoords(ctx, o));
      log(`coords ${o.mode} ${o.s}`);
    }
  }
  if (only.includes('selection')) {
    for (const o of matrix) {
      const r = await mSelection(ctx, o, true);
      put(['selection', o.mode, o.s], r);
      log(`selection ${o.mode} ${o.s}: drags ${r.drags.filter((d) => d.ok).length}/${r.drags.length}, dbl ${r.dbl.filter((d) => d.ok).length}/${r.dbl.length}, triple ${r.triple.filter((d) => d.ok).length}/${r.triple.length}`);
    }
  }
  if (only.includes('keyboard')) {
    put(['keyboard', 'native', 1], await mKeyboard(ctx, { mode: 'plain', s: 1, native: true }));
    log('keyboard native reference');
    for (const o of matrix) {
      put(['keyboard', o.mode, o.s], await mKeyboard(ctx, o));
      log(`keyboard ${o.mode} ${o.s}`);
    }
    put(['keyboard', 'transform-norot', 0.64], await mKeyboard(ctx, { mode: 'transform', s: 0.64, norot: true }));
    put(['keyboard', 'native-norot', 1], await mKeyboard(ctx, { mode: 'plain', s: 1, native: true, norot: true }));
  }
  if (only.includes('typing')) {
    for (const o of matrix) {
      const r = await mTyping(ctx, o);
      put(['typing', o.mode, o.s], r);
      log(`typing ${o.mode} ${o.s}: ${r.filter((x) => x.ok).length}/${r.length}`);
    }
  }
  if (only.includes('ime')) {
    for (const o of matrix) {
      const r = await mIme(ctx, o, true);
      put(['ime', o.mode, o.s], r);
      log(`ime ${o.mode} ${o.s}: ${r.filter((x) => x.ok).length}/${r.length}`);
    }
  }
  if (only.includes('undo')) {
    for (const hist of ['tiptap', 'external', 'none'] as const) {
      put(['undo', hist], await mUndo(ctx, { mode: 'transform', s: 0.64, hist }));
      log(`undo hist=${hist}`);
    }
  }
  if (only.includes('bubble')) {
    for (const o of matrix)
      for (const bubble of ['inside', 'body'] as const) {
        put(['bubble', o.mode, o.s, bubble], await mBubble(ctx, { ...o, bubble }, true));
        log(`bubble ${o.mode} ${o.s} ${bubble}`);
      }
  }
  if (only.includes('caret')) {
    for (const o of matrix) {
      put(['caret', o.mode, o.s], await mCaretPaint(ctx, o));
      log(`caret ${o.mode} ${o.s}`);
    }
  }
  if (only.includes('listdir')) {
    put(['listdir'], await mListDir(ctx, { mode: 'transform', s: 0.64 }));
    log('listdir');
  }
  if (only.includes('scroll')) {
    for (const mode of modes) put(['scroll', mode, 2], await mScrollIntoView(ctx, { mode, s: 2 }));
    log('scroll');
  }
  if (only.includes('eotb')) {
    put(['eotb', 'transform', 0.64], await mEndOfTextblock(ctx, { mode: 'transform', s: 0.64 }));
    put(['eotb', 'transform-norot', 0.64], await mEndOfTextblock(ctx, { mode: 'transform', s: 0.64, norot: true }));
    put(['eotb', 'plain', 1], await mEndOfTextblock(ctx, { mode: 'plain', s: 1 }));
    log('eotb');
  }
  if (only.includes('dnd')) {
    for (const o of matrix) {
      const r = await mDragDrop(ctx, o);
      put(['dnd', o.mode, o.s], r);
      log(`dnd ${o.mode} ${o.s}: ${r.ok}`);
    }
  }
  if (only.includes('focus')) {
    put(['focusHeuristic', 'tiptap transform 0.64'], await mFocusHeuristic(ctx, { mode: 'transform', s: 0.64 }));
    put(['focusHeuristic', 'tiptap unscaled'], await mFocusHeuristic(ctx, { mode: 'plain', s: 1 }));
    put(['focusHeuristic', 'bare contenteditable unscaled'], await mFocusHeuristic(ctx, { mode: 'plain', s: 1, native: true }));
    log('focus heuristic');
  }
  if (only.includes('trailing')) {
    put(['trailing'], await mTrailingNode(ctx));
    log('trailing');
  }
  if (only.includes('dsf')) {
    // Windows display scaling 150%: same checks with deviceScaleFactor 1.5
    const ctx15: Ctx = { ...ctx, dsf: 1.5 };
    for (const s of scales) {
      const r = await mClick(ctx15, { mode: 'transform', s });
      put(['dsf15', 'click', s], r);
      put(['dsf15', 'coords', s], await mCoords(ctx15, { mode: 'transform', s }));
      put(['dsf15', 'caret', s], await mCaretPaint(ctx15, { mode: 'transform', s }));
      log(`dsf 1.5 transform ${s}: click strict ${r.total.ok}/${r.total.n}, visual ${r.total.visualOk}/${r.total.n}`);
    }
  }
} finally {
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 1));
  await browser.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
}

writeSummary(results, path.join(outDir, 'summary.md'));
log(`wrote ${path.relative(root, resultsPath)} and out/summary.md`);
process.exit(0);
