/**
 * The measurements of spike WG0-S6. Each function opens a fresh page for one (mode, scale) and returns raw numbers.
 * Nothing here decides pass/fail by itself; tests/run.ts aggregates and prints.
 */
import path from 'node:path';
import type { Browser, CDPSession, Page } from 'playwright-core';

import { BOXES } from '../src/boxes.ts';
import { diffPng, maskVsRects, round, sleep, stats, typeText } from './util.ts';
import type { Rect } from './util.ts';

export interface Ctx {
  browser: Browser;
  base: string;
  outDir: string;
  dsf: number;
}

export interface PageOpts {
  mode: 'transform' | 'zoom' | 'plain';
  s: number;
  bubble?: 'inside' | 'body';
  hist?: 'tiptap' | 'external' | 'none';
  native?: boolean;
  tiptapDir?: boolean;
  norot?: boolean;
}

export const IDS = ['en', 'he', 'mixed', 'list', 'rot'] as const;
const VIEW = { width: 1920, height: 1080 };

function tag(o: PageOpts): string {
  return `${o.mode}-${o.s}`;
}

export async function open(ctx: Ctx, o: PageOpts): Promise<{ page: Page; cdp: CDPSession; close: () => Promise<void>; info: unknown }> {
  const context = await ctx.browser.newContext({ viewport: VIEW, deviceScaleFactor: ctx.dsf });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const q = new URLSearchParams({ mode: o.mode, s: String(o.s), hud: '0' });
  if (o.bubble) q.set('bubble', o.bubble);
  if (o.hist) q.set('hist', o.hist);
  if (o.native) q.set('native', '1');
  if (o.tiptapDir) q.set('tiptapDir', '1');
  if (o.norot) q.set('norot', '1');
  await page.goto(`${ctx.base}/?${q.toString()}`);
  const info = await page.evaluate(() => window.__s6.ready());
  if (info.fonts.some((f) => !f.ok)) throw new Error(`fonts not loaded: ${JSON.stringify(info.fonts)}`);
  const cdp = await context.newCDPSession(page);
  return {
    page,
    cdp,
    info,
    close: async () => {
      if (errors.length) console.warn(`  [page errors ${tag(o)}]`, errors.slice(0, 3));
      await context.close();
    },
  };
}

function originalHtml(id: string): string {
  return BOXES.find((b) => b.id === id)!.html;
}

// ------------------------------------------------------------------------------------------------------------
// 1. Click-to-caret accuracy
// ------------------------------------------------------------------------------------------------------------

export interface ClickRow {
  id: string;
  pos: number;
  ch: string;
  frac: number;
  group: 'he' | 'en' | 'boundary' | 'other' | 'rot';
  boundary: boolean;
  expected: number;
  got: number;
  /** strict: the selection is collapsed at this glyph's own start / end position */
  ok: boolean;
  /** distance (px) between the glyph edge nearest to the click and the caret as coordsAtPos reports it (nearer side) */
  edgeDist: number;
  /** only for strict misses: is a caret really painted at the glyph edge nearest to the click (screenshot difference) */
  painted: boolean | null;
  /** strict hit, or strict miss whose caret is painted at the clicked glyph edge */
  visualOk: boolean;
  lw: number;
}

/**
 * Looks for a painted caret in a small window around a viewport point. The caret is made red, a screenshot is taken,
 * then the caret is made transparent and the difference is located. Returns the centre of the painted pixels.
 */
async function paintedCaretNear(page: Page, pt: { x: number; y: number }, halfW: number, halfH: number, dsf: number) {
  const clip = clipFor({ x: pt.x - halfW, y: pt.y - halfH, w: halfW * 2, h: halfH * 2 }, 0);
  await page.evaluate(() => {
    document.body.classList.add('caret-off');
    document.body.classList.remove('caret-probe');
  });
  const base = await page.screenshot({ clip, caret: 'initial' });
  await page.evaluate(() => {
    document.body.classList.remove('caret-off');
    document.body.classList.add('caret-probe');
  });
  // the caret blinks (500 ms on / 500 ms off): sample across more than one period, stop at the first frame that shows it
  let best: ReturnType<typeof diffPng> | null = null;
  for (let i = 0; i < 12; i++) {
    const d = diffPng(base, await page.screenshot({ clip, caret: 'initial' }), 8);
    if (d.count > 0) {
      best = d;
      break;
    }
    await sleep(90);
  }
  await page.evaluate(() => document.body.classList.remove('caret-probe'));
  if (!best || !best.bbox) return null;
  const b = best.bbox;
  return {
    left: clip.x + b.x0 / dsf,
    right: clip.x + (b.x1 + 1) / dsf,
    top: clip.y + b.y0 / dsf,
    bottom: clip.y + (b.y1 + 1) / dsf,
    cx: clip.x + (b.x0 + b.x1 + 1) / 2 / dsf,
    cy: clip.y + (b.y0 + b.y1 + 1) / 2 / dsf,
    peak: best.peak,
    px: best.count,
  };
}

export async function mClick(ctx: Ctx, o: PageOpts) {
  const { page, close } = await open(ctx, o);
  const rows: ClickRow[] = [];
  const selfTest: Record<string, unknown> = {};
  for (const id of IDS) {
    selfTest[id] = await page.evaluate((id) => window.__s6.dirSelfTest(id), id);
    const cs = await page.evaluate(
      (id) =>
        window.__s6
          .chars(id)
          .filter((c) => c.w > 0)
          .map((c) => ({ pos: c.pos, ch: c.ch, cat: c.cat, rtl: c.rtl === true, boundary: c.boundary })),
      id,
    );
    for (const c of cs) {
      for (const frac of [0.25, 0.75]) {
        const t = await page.evaluate((a) => window.__s6.clickTarget(a.id, a.pos, a.frac, a.rtl), { id, pos: c.pos, frac, rtl: c.rtl });
        await page.mouse.click(t.x, t.y);
        const s = await page.evaluate((id) => window.__s6.sel(id), id);
        const ok = s.empty && s.head === t.expected && s.focused;
        const edgeDist = await page.evaluate((a) => window.__s6.caretDistanceTo(a.id, a.edge), { id, edge: t.edge });
        let painted: boolean | null = null;
        if (!ok && s.empty && s.focused) {
          await page.mouse.move(5, 1075);
          // the edge the click was nearest to; after a possible scroll its coordinates are unchanged (no scroll happens here)
          const p = await paintedCaretNear(page, t.edge, Math.max(6, t.lw * 0.45), Math.max(8, t.lw * 2), ctx.dsf);
          painted = !!p && Math.hypot(p.cx - t.edge.x, p.cy - t.edge.y) <= 2;
        }
        const group: ClickRow['group'] =
          id === 'rot' ? 'rot' : c.boundary ? 'boundary' : c.cat === 'he' ? 'he' : c.cat === 'lat' ? 'en' : 'other';
        rows.push({ id, pos: c.pos, ch: c.ch, frac, group, boundary: c.boundary, expected: t.expected, got: s.head, ok, edgeDist: round(edgeDist, 3), painted, visualOk: ok || painted === true, lw: round(t.lw) });
      }
    }
  }
  await close();
  const groups = ['he', 'en', 'boundary', 'other', 'rot'] as const;
  const tally = (r: ClickRow[]) => ({ n: r.length, ok: r.filter((x) => x.ok).length, visualOk: r.filter((x) => x.visualOk).length });
  const by = Object.fromEntries(groups.map((g) => [g, tally(rows.filter((x) => x.group === g))]));
  const strictMiss = rows.filter((x) => !x.ok);
  return {
    total: tally(rows),
    by,
    rotBoundary: tally(rows.filter((x) => x.group === 'rot' && x.boundary)),
    /** strict hits: caret (coordsAtPos) to clicked glyph edge */
    edgeDistStrictHitsPx: stats(rows.filter((x) => x.ok).map((x) => x.edgeDist)),
    glyphWidthPx: stats(rows.map((x) => x.lw)),
    strictMisses: {
      n: strictMiss.length,
      /** all of them sit next to a direction change */
      atBoundary: strictMiss.filter((x) => x.boundary).length,
      paintedAtClickedEdge: strictMiss.filter((x) => x.painted === true).length,
      /** coordsAtPos (either side) agrees with the painted caret */
      coordsAtPosAgrees: strictMiss.filter((x) => x.edgeDist <= 1).length,
      list: strictMiss.map((x) => `${x.id}:${x.pos}${x.frac < 0.5 ? 'L' : 'R'}(${x.ch})->${x.got}${x.painted ? '' : '!'}`),
    },
    visualMisses: rows.filter((x) => !x.visualOk).slice(0, 40),
    dirSelfTest: selfTest,
  };
}

/**
 * Control for the click-chain reset used by mClick: every `step`-th target, 520 ms apart, ProseMirror untouched.
 */
export async function mClickPaced(ctx: Ctx, o: PageOpts, step = 23) {
  const { page, close } = await open(ctx, o);
  let n = 0;
  let ok = 0;
  const misses: unknown[] = [];
  for (const id of IDS) {
    const cs = await page.evaluate(
      (id) =>
        window.__s6
          .chars(id)
          .filter((c) => c.w > 0)
          .map((c) => ({ pos: c.pos, ch: c.ch, rtl: c.rtl === true })),
      id,
    );
    for (let i = 0; i < cs.length; i += step) {
      const c = cs[i]!;
      const frac = (i / step) % 2 === 0 ? 0.25 : 0.75;
      const t = await page.evaluate((a) => window.__s6.clickTarget(a.id, a.pos, a.frac, a.rtl, true, false), { id, pos: c.pos, frac, rtl: c.rtl });
      await sleep(520);
      await page.mouse.click(t.x, t.y);
      const s = await page.evaluate((id) => window.__s6.sel(id), id);
      n += 1;
      if (s.empty && s.head === t.expected && s.focused) ok += 1;
      else misses.push({ id, ch: c.ch, pos: c.pos, frac, expected: t.expected, got: s.head });
    }
  }
  await close();
  return { n, ok, misses };
}

// ------------------------------------------------------------------------------------------------------------
// 2. Caret geometry: coordsAtPos vs glyph rects, posAtCoords round trip
// ------------------------------------------------------------------------------------------------------------

export async function mCoords(ctx: Ctx, o: PageOpts) {
  const { page, close } = await open(ctx, o);
  type Sample = Awaited<ReturnType<typeof window.__s6.coordsReport>>['samples'][number] & { id: string };
  const all: Sample[] = [];
  const rt: { id: string; result: string; pos: number; got: number; dist: number }[] = [];
  for (const id of IDS) {
    await page.evaluate((id) => window.__s6.showBox(id), id);
    const rep = await page.evaluate((id) => window.__s6.coordsReport(id), id);
    for (const s of rep.samples) all.push({ id, ...s });
    const r = await page.evaluate((id) => window.__s6.roundTrip(id), id);
    for (const x of r) rt.push({ id, ...x });
  }
  await close();
  const sub = (rows: Sample[]) => {
    const decided = rows;
    return {
      n: decided.length,
      /** caret positions (not samples) whose two sides are drawn in different places */
      ambiguousBidi: rows.filter((x) => x.side === 1 && x.ambiguous === 'bidi').length,
      ambiguousWrap: rows.filter((x) => x.side === 1 && x.ambiguous === 'wrap').length,
      /** caret at one of the two logically adjacent glyph edges */
      errEither: stats(decided.map((x) => x.errEither)),
      /** caret at the edge that `side` asks for */
      errPrimary: stats(decided.map((x) => x.errPrimary)),
      primaryHits: decided.filter((x) => x.errPrimary <= 0.5).length,
      errLeft: stats(decided.map((x) => x.errLeft)),
      errTop: stats(decided.map((x) => x.errTop)),
      errBottom: stats(decided.map((x) => x.errBottom)),
      rectWidth: stats(decided.map((x) => x.width)),
    };
  };
  const flat = all.filter((x) => x.id !== 'rot');
  const count = (rows: typeof rt) => ({
    n: rows.length,
    exact: rows.filter((x) => x.result === 'exact').length,
    equivalent: rows.filter((x) => x.result === 'equivalent').length,
    mismatch: rows.filter((x) => x.result === 'mismatch').length,
    null: rows.filter((x) => x.result === 'null').length,
  });
  return {
    unrotated: {
      all: sub(flat),
      he: sub(flat.filter((x) => x.group === 'he')),
      en: sub(flat.filter((x) => x.group === 'en')),
      boundary: sub(flat.filter((x) => x.group === 'boundary')),
    },
    rotated: sub(all.filter((x) => x.id === 'rot')),
    roundTrip: { unrotated: count(rt.filter((x) => x.id !== 'rot')), rotated: count(rt.filter((x) => x.id === 'rot')) },
    roundTripMismatches: rt.filter((x) => x.result === 'mismatch' || x.result === 'null').slice(0, 30),
  };
}

// ------------------------------------------------------------------------------------------------------------
// 3. Selection: mouse drag, double / triple click, painted highlight
// ------------------------------------------------------------------------------------------------------------

interface CharRef {
  find?: string;
  d: number;
  frac: number;
}

interface DragCase {
  name: string;
  id: string;
  para: number;
  a: CharRef;
  paraB?: number;
  b: CharRef;
}

const DRAG_CASES: DragCase[] = [
  { name: 'he-to-en', id: 'mixed', para: 0, a: { find: 'של', d: 0, frac: 0.75 }, b: { find: 'Slidr', d: 3, frac: 0.75 } },
  { name: 'en-to-he-backward', id: 'mixed', para: 0, a: { find: 'Slidr', d: 3, frac: 0.75 }, b: { find: 'של', d: 0, frac: 0.75 } },
  { name: 'he-num-paren', id: 'mixed', para: 0, a: { find: 'גרסה', d: 0, frac: 0.75 }, b: { find: 'beta', d: 2, frac: 0.75 } },
  { name: 'wrap-into-url', id: 'mixed', para: 0, a: { find: 'זמינה', d: 1, frac: 0.75 }, b: { find: 'slidr.app', d: 3, frac: 0.75 } },
  { name: 'ltr-para-into-he', id: 'mixed', para: 2, a: { find: 'word', d: 1, frac: 0.25 }, b: { find: 'שלום', d: 2, frac: 0.25 } },
  { name: 'he-3-lines', id: 'he', para: 1, a: { d: 5, frac: 0.75 }, b: { d: 70, frac: 0.25 } },
  { name: 'en-3-lines', id: 'en', para: 1, a: { d: 5, frac: 0.25 }, b: { d: 70, frac: 0.75 } },
  { name: 'rotated', id: 'rot', para: 0, a: { find: 'מסובב', d: 1, frac: 0.75 }, b: { find: 'English', d: 4, frac: 0.75 } },
  { name: 'list-cross-item', id: 'list', para: 0, a: { d: 3, frac: 0.75 }, paraB: 1, b: { find: 'API', d: 1, frac: 0.75 } },
];

const DBL_CASES: { id: string; para: number; word: string; d: number }[] = [
  { id: 'mixed', para: 0, word: 'זמינה', d: 2 },
  { id: 'mixed', para: 0, word: 'Slidr', d: 2 },
  { id: 'mixed', para: 0, word: 'beta', d: 1 },
  { id: 'mixed', para: 0, word: 'גרסה', d: 1 },
  { id: 'mixed', para: 2, word: 'שלום', d: 1 },
  { id: 'mixed', para: 2, word: 'peace', d: 2 },
  { id: 'he', para: 1, word: 'ארוכה', d: 2 },
  { id: 'en', para: 1, word: 'paragraph', d: 3 },
  { id: 'rot', para: 0, word: 'English', d: 3 },
  { id: 'rot', para: 0, word: 'מסובב', d: 2 },
];

type CharLite = { pos: number; ch: string; para: number; off: number; rtl: boolean | null };

async function charList(page: Page, id: string): Promise<CharLite[]> {
  return page.evaluate((id) => window.__s6.chars(id).map((c) => ({ pos: c.pos, ch: c.ch, para: c.para, off: c.off, rtl: c.rtl })), id);
}

function resolveChar(cs: CharLite[], para: number, ref: { find?: string; d: number }): CharLite {
  const pcs = cs.filter((c) => c.para === para);
  const text = pcs.map((c) => c.ch).join('');
  const base = ref.find ? text.indexOf(ref.find) : 0;
  if (base < 0) throw new Error(`text "${ref.find}" not found in paragraph ${para}`);
  const c = pcs[base + ref.d];
  if (!c) throw new Error(`no char at ${base + ref.d}`);
  return c;
}

async function clearSelection(page: Page) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    document.getSelection()?.removeAllRanges();
  });
  await page.mouse.move(5, 1075);
}

function clipFor(r: Rect, pad = 12): { x: number; y: number; width: number; height: number } {
  const x = Math.max(0, Math.floor(r.x - pad));
  const y = Math.max(0, Math.floor(r.y - pad));
  const x1 = Math.min(VIEW.width, Math.ceil(r.x + r.w + pad));
  const y1 = Math.min(VIEW.height, Math.ceil(r.y + r.h + pad));
  return { x, y, width: Math.max(1, x1 - x), height: Math.max(1, y1 - y) };
}

export async function mSelection(ctx: Ctx, o: PageOpts, saveShots: boolean) {
  const { page, close } = await open(ctx, o);
  const drags: Record<string, unknown>[] = [];
  for (const dc of DRAG_CASES) {
    const box = await page.evaluate((id) => window.__s6.showBox(id), dc.id);
    const cs = await charList(page, dc.id);
    const ca = resolveChar(cs, dc.para, dc.a);
    const cb = resolveChar(cs, dc.paraB ?? dc.para, dc.b);
    const ta = await page.evaluate((a) => window.__s6.clickTarget(a.id, a.pos, a.frac, a.rtl, false), { id: dc.id, pos: ca.pos, frac: dc.a.frac, rtl: ca.rtl === true });
    const tb = await page.evaluate((a) => window.__s6.clickTarget(a.id, a.pos, a.frac, a.rtl, false), { id: dc.id, pos: cb.pos, frac: dc.b.frac, rtl: cb.rtl === true });
    await clearSelection(page);
    const clip = clipFor(box);
    const before = await page.screenshot({ clip });
    await page.mouse.move(ta.x, ta.y);
    await page.mouse.down();
    await page.mouse.move(tb.x, tb.y, { steps: 12 });
    await page.mouse.up();
    const s = await page.evaluate((id) => window.__s6.sel(id), dc.id);
    const expectedText = await page.evaluate(
      (a) => {
        const d = window.__s6.editor(a.id).state.doc;
        return d.textBetween(Math.min(a.x, a.y), Math.max(a.x, a.y), '\n');
      },
      { id: dc.id, x: ta.expected, y: tb.expected },
    );
    const rects = await page.evaluate(() => window.__s6.selRects());
    await page.mouse.move(5, 1075);
    const after = await page.screenshot({ clip, ...(saveShots ? { path: path.join(ctx.outDir, `sel-${tag(o)}-${dc.name}.png`) } : {}) });
    const d = diffPng(before, after, 24);
    const paint = maskVsRects(d, rects, { x: clip.x, y: clip.y }, ctx.dsf, 1);
    drags.push({
      name: dc.name,
      id: dc.id,
      ok: s.anchor === ta.expected && s.head === tb.expected && s.text === expectedText,
      expected: { anchor: ta.expected, head: tb.expected, text: expectedText },
      got: { anchor: s.anchor, head: s.head, text: s.text },
      rects: rects.length,
      paint,
    });
  }

  const dbl: Record<string, unknown>[] = [];
  for (const c of DBL_CASES) {
    await page.evaluate((id) => window.__s6.showBox(id), c.id);
    const cs = await charList(page, c.id);
    const ch = resolveChar(cs, c.para, { find: c.word, d: c.d });
    const t = await page.evaluate((a) => window.__s6.clickTarget(a.id, a.pos, 0.5, a.rtl, false), { id: c.id, pos: ch.pos, rtl: ch.rtl === true });
    await clearSelection(page);
    await page.mouse.dblclick(t.x, t.y);
    const s = await page.evaluate((id) => window.__s6.sel(id), c.id);
    dbl.push({ id: c.id, word: c.word, got: s.text, ok: s.text.trim() === c.word, exact: s.text === c.word });
  }

  const triple: Record<string, unknown>[] = [];
  for (const c of [
    { id: 'mixed', para: 0, find: 'Slidr', d: 2 },
    { id: 'he', para: 1, find: 'ארוכה', d: 2 },
    { id: 'rot', para: 0, find: 'English', d: 3 },
  ]) {
    await page.evaluate((id) => window.__s6.showBox(id), c.id);
    const cs = await charList(page, c.id);
    const ch = resolveChar(cs, c.para, c);
    const paraText = cs
      .filter((x) => x.para === c.para)
      .map((x) => x.ch)
      .join('');
    const t = await page.evaluate((a) => window.__s6.clickTarget(a.id, a.pos, 0.5, a.rtl, false), { id: c.id, pos: ch.pos, rtl: ch.rtl === true });
    await clearSelection(page);
    await page.mouse.click(t.x, t.y, { clickCount: 3 });
    const s = await page.evaluate((id) => window.__s6.sel(id), c.id);
    triple.push({ id: c.id, ok: s.text === paraText, gotLength: s.text.length, expectedLength: paraText.length });
  }
  await close();
  return { drags, dbl, triple };
}

// ------------------------------------------------------------------------------------------------------------
// 4. Keyboard movement. Positions are (paragraph index : character offset), read from the DOM selection, so the
//    same scenarios run against ProseMirror and against a bare contenteditable.
// ------------------------------------------------------------------------------------------------------------

interface KeyScenario {
  name: string;
  id: string;
  /** start caret: paragraph, then `find` (searched in the paragraph text) + d, or the paragraph end */
  p: number;
  find?: string;
  d: number | 'end';
  /** keys to press; a number n means "press it (paragraph length + n) times" */
  keys: string[] | { key: string; lenPlus: number };
  /** depends on where lines wrap (differs between modes when the text reflows) */
  wrapDependent?: boolean;
}

const rep = (key: string, n: number) => new Array<string>(n).fill(key);
const VERT = ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp', 'ArrowUp', 'ArrowUp'];

export const KEY_SCENARIOS: KeyScenario[] = [
  { name: 'ArrowLeft through RTL mixed paragraph (from logical start)', id: 'mixed', p: 0, d: 0, keys: { key: 'ArrowLeft', lenPlus: 0 } },
  { name: 'ArrowRight through RTL mixed paragraph (from logical end)', id: 'mixed', p: 0, d: 'end', keys: { key: 'ArrowRight', lenPlus: 0 } },
  { name: 'ArrowRight through LTR paragraph with Hebrew', id: 'mixed', p: 2, d: 0, keys: { key: 'ArrowRight', lenPlus: 0 } },
  { name: 'ArrowLeft through LTR paragraph with Hebrew', id: 'mixed', p: 2, d: 'end', keys: { key: 'ArrowLeft', lenPlus: 0 } },
  { name: 'ArrowRight through dir=auto paragraph with bold run', id: 'mixed', p: 1, d: 0, keys: { key: 'ArrowRight', lenPlus: 0 } },
  { name: 'ArrowLeft through pure Hebrew paragraph', id: 'he', p: 0, d: 0, keys: { key: 'ArrowLeft', lenPlus: 0 } },
  { name: 'ArrowRight through pure English paragraph', id: 'en', p: 0, d: 0, keys: { key: 'ArrowRight', lenPlus: 0 } },
  { name: 'Home/End on wrapped Hebrew line', id: 'he', p: 1, d: 40, keys: ['Home', 'End', 'Home', 'Control+End', 'Control+Home'], wrapDependent: true },
  { name: 'Home/End on RTL mixed line 1', id: 'mixed', p: 0, d: 20, keys: ['Home', 'End', 'Home'], wrapDependent: true },
  { name: 'Home/End on RTL mixed line 2 (URL)', id: 'mixed', p: 0, d: 60, keys: ['Home', 'End', 'Home'], wrapDependent: true },
  { name: 'Home/End on English wrapped line', id: 'en', p: 1, d: 40, keys: ['Home', 'End', 'Home'], wrapDependent: true },
  { name: 'Home/End from run edge (before English word)', id: 'mixed', p: 0, find: 'Slidr', d: 0, keys: ['Home', 'End'], wrapDependent: true },
  { name: 'End/Home from run edge (after English word)', id: 'mixed', p: 0, find: 'Slidr', d: 5, keys: ['End', 'Home'], wrapDependent: true },
  { name: 'Ctrl+ArrowLeft words, RTL mixed', id: 'mixed', p: 0, d: 0, keys: rep('Control+ArrowLeft', 18) },
  { name: 'Ctrl+ArrowRight words, RTL mixed', id: 'mixed', p: 0, d: 'end', keys: rep('Control+ArrowRight', 18) },
  { name: 'Ctrl+ArrowRight words, LTR with Hebrew', id: 'mixed', p: 2, d: 0, keys: rep('Control+ArrowRight', 12) },
  { name: 'Shift+ArrowLeft across he->en boundary', id: 'mixed', p: 0, find: 'Slidr', d: -4, keys: rep('Shift+ArrowLeft', 14) },
  { name: 'Shift+ArrowRight across en->he boundary', id: 'mixed', p: 0, find: 'Slidr', d: 8, keys: rep('Shift+ArrowRight', 14) },
  { name: 'Shift+Ctrl+ArrowLeft words across boundary', id: 'mixed', p: 0, find: 'Slidr', d: -3, keys: rep('Shift+Control+ArrowLeft', 5) },
  { name: 'Shift+Home / Shift+End', id: 'mixed', p: 0, d: 20, keys: ['Shift+Home', 'Shift+End'], wrapDependent: true },
  { name: 'ArrowDown/Up in Hebrew 3-line paragraph', id: 'he', p: 1, d: 10, keys: VERT, wrapDependent: true },
  { name: 'ArrowDown/Up in English 3-line paragraph', id: 'en', p: 1, d: 10, keys: VERT, wrapDependent: true },
  { name: 'ArrowDown through mixed paragraphs', id: 'mixed', p: 0, d: 20, keys: ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp'], wrapDependent: true },
  { name: 'ArrowDown/Up in rotated box', id: 'rot', p: 0, d: 10, keys: ['ArrowDown', 'ArrowUp', 'ArrowDown', 'End', 'Home'], wrapDependent: true },
  { name: 'Arrow across paragraph break (Hebrew)', id: 'he', p: 0, d: 'end', keys: ['ArrowLeft', 'ArrowLeft', 'ArrowRight', 'ArrowRight', 'ArrowRight'] },
  { name: 'Arrow across list items', id: 'list', p: 0, d: 'end', keys: ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'] },
];

export async function mKeyboard(ctx: Ctx, o: PageOpts) {
  const { page, close } = await open(ctx, o);
  const results: Record<string, { seq: string[]; pmConsistent: boolean | null }> = {};
  for (const sc of KEY_SCENARIOS) {
    await page.evaluate((id) => window.__s6.showBox(id), sc.id);
    const texts = await page.evaluate((id) => window.__s6.paraText(id), sc.id);
    const len = texts[sc.p]!.length;
    const base = sc.find ? texts[sc.p]!.indexOf(sc.find) : 0;
    const off = sc.d === 'end' ? len : base + sc.d;
    await page.evaluate((a) => window.__s6.setDomCaret(a.id, a.p, a.off), { id: sc.id, p: sc.p, off });
    const keys = Array.isArray(sc.keys) ? sc.keys : rep(sc.keys.key, len + sc.keys.lenPlus);
    const seq: string[] = [];
    let pmConsistent: boolean | null = o.native ? null : true;
    for (const key of keys) {
      await page.keyboard.press(key);
      const c = await page.evaluate((id) => window.__s6.domCaret(id), sc.id);
      if (!c) {
        seq.push('lost');
        continue;
      }
      seq.push(c.ap === c.p && c.aoff === c.off ? `${c.p}:${c.off}` : `${c.ap}:${c.aoff}>${c.p}:${c.off}`);
      if (!o.native) {
        const s = await page.evaluate((id) => window.__s6.sel(id), sc.id);
        if (!s.dom || s.dom.head !== s.head || s.dom.anchor !== s.anchor || s.lagged) pmConsistent = false;
      }
    }
    results[sc.name] = { seq, pmConsistent };
  }
  await close();
  return results;
}

// ------------------------------------------------------------------------------------------------------------
// 5. Typing
// ------------------------------------------------------------------------------------------------------------

export async function mTyping(ctx: Ctx, o: PageOpts) {
  const { page, cdp, close } = await open(ctx, o);
  const out: Record<string, unknown>[] = [];
  const S6 = {
    text: (id: string) => page.evaluate((id) => window.__s6.paraText(id), id),
    info: (id: string) => page.evaluate((id) => window.__s6.paraInfo(id), id),
    reset: (id: string, html = originalHtml(id)) => page.evaluate((a) => window.__s6.setContent(a.id, a.html), { id, html }),
    caret: (id: string, p: number, off: number) => page.evaluate((a) => window.__s6.setDomCaret(a.id, a.p, a.off), { id, p, off }),
  };

  // T1 / T2: dir=auto follows the first strong character
  for (const [name, typed, dir] of [
    ['auto paragraph, Hebrew first', 'שלום world 123, (test) זה.', 'rtl'],
    ['auto paragraph, English first', 'Hello שלום 42!', 'ltr'],
    ['auto paragraph, digits then Hebrew', '2024 היא שנה טובה.', 'rtl'],
  ] as const) {
    await S6.reset('he', '<p dir="auto"></p>');
    await S6.caret('he', 0, 0);
    await page.evaluate(() => window.__s6.clearEvents('he'));
    await typeText(page, cdp, typed);
    const ev = await page.evaluate(() => window.__s6.events('he'));
    const info = await S6.info('he');
    out.push({
      name,
      typed,
      got: info[0]?.text,
      direction: info[0]?.direction,
      ok: info[0]?.text === typed && info[0]?.direction === dir && info.length === 1,
      keydowns: ev.filter((e) => e.type === 'keydown').length,
      insertTextInputs: ev.filter((e) => e.type === 'beforeinput' && e.inputType === 'insertText').length,
    });
  }

  // T3: insert at bidi boundaries inside existing text
  {
    await S6.reset('mixed');
    const before = (await S6.text('mixed'))[0]!;
    const at = before.indexOf('Slidr');
    await S6.caret('mixed', 0, at);
    await typeText(page, cdp, '12');
    await typeText(page, cdp, 'אב');
    await typeText(page, cdp, 'xy,');
    const got = (await S6.text('mixed'))[0]!;
    const expected = `${before.slice(0, at)}12אבxy,${before.slice(at)}`;
    out.push({ name: 'insert digits/Hebrew/Latin/comma before embedded English word', ok: got === expected, got, expected });
  }
  {
    await S6.reset('mixed');
    const before = (await S6.text('mixed'))[0]!;
    const at = before.indexOf('Slidr') + 5;
    await S6.caret('mixed', 0, at);
    await typeText(page, cdp, '!');
    await typeText(page, cdp, 'גד');
    await typeText(page, cdp, ' 7');
    const got = (await S6.text('mixed'))[0]!;
    const expected = `${before.slice(0, at)}!גד 7${before.slice(at)}`;
    out.push({ name: 'insert punctuation/Hebrew/digit after embedded English word', ok: got === expected, got, expected });
  }

  // T4: Enter splits the paragraph and keeps dir
  {
    await S6.reset('he');
    const before = (await S6.text('he'))[0]!;
    await S6.caret('he', 0, 10);
    await page.keyboard.press('Enter');
    await typeText(page, cdp, 'abc');
    const info = await S6.info('he');
    out.push({
      name: 'Enter in the middle of an RTL paragraph, then type',
      ok: info.length === 3 && info[0]!.text === before.slice(0, 10) && info[1]!.text === `abc${before.slice(10)}` && info[1]!.dirAttr === 'rtl' && info[1]!.direction === 'rtl',
      got: info.slice(0, 2).map((i) => `${i.dirAttr}/${i.direction}: ${i.text}`),
    });
  }

  // T5: Backspace / Delete at a boundary are logical
  {
    await S6.reset('mixed');
    const before = (await S6.text('mixed'))[0]!;
    const at = before.indexOf('Slidr') + 5;
    await S6.caret('mixed', 0, at);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
    const got1 = (await S6.text('mixed'))[0]!;
    const exp1 = before.slice(0, at - 3) + before.slice(at);
    const at2 = before.indexOf('Slidr');
    await S6.caret('mixed', 0, at2 - 2);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Delete');
    const got2 = (await S6.text('mixed'))[0]!;
    const exp2 = exp1.slice(0, at2 - 2) + exp1.slice(at2 + 1);
    out.push({ name: 'Backspace x3 after English word, Delete x3 across he->en boundary', ok: got1 === exp1 && got2 === exp2, got: [got1, got2], expected: [exp1, exp2] });
  }

  // T6: dir=auto flips when the first strong character changes
  {
    await S6.reset('he', '<p dir="auto"></p>');
    await S6.caret('he', 0, 0);
    await typeText(page, cdp, 'abc');
    const d1 = (await S6.info('he'))[0]!.direction;
    await page.keyboard.press('Home');
    await typeText(page, cdp, 'ש');
    const i2 = (await S6.info('he'))[0]!;
    out.push({ name: 'dir=auto flips ltr -> rtl when Hebrew is typed at the start', ok: d1 === 'ltr' && i2.direction === 'rtl' && i2.text === 'שabc', got: [d1, i2.direction, i2.text] });
  }

  // T7: rotated box
  {
    await S6.reset('rot');
    await page.evaluate(() => window.__s6.showBox('rot'));
    const before = (await S6.text('rot'))[0]!;
    await S6.caret('rot', 0, before.length);
    await typeText(page, cdp, ' סוף end 9');
    const got = (await S6.text('rot'))[0]!;
    out.push({ name: 'type at the end of the rotated box', ok: got === `${before} סוף end 9`, got });
  }

  // T8: list item split keeps dir=auto on the <li>
  {
    await S6.reset('list');
    await page.evaluate(() => window.__s6.showBox('list'));
    const before = await S6.text('list');
    await S6.caret('list', 2, before[2]!.length);
    await page.keyboard.press('Enter');
    await typeText(page, cdp, 'חדש new');
    const info = await S6.info('list');
    out.push({
      name: 'Enter at end of a list item, type Hebrew-first text',
      ok: info.length === 4 && info[3]!.text === 'חדש new' && info[3]!.dirAttr === 'auto' && info[3]!.direction === 'rtl',
      got: info.map((i) => `${i.dirAttr}/${i.direction}: ${i.text}`),
    });
  }

  // T9: setParagraphDir command (rtl / ltr / auto) on one paragraph only
  {
    await S6.reset('mixed');
    await S6.caret('mixed', 1, 3);
    const seq: string[] = [];
    for (const d of ['rtl', 'ltr', 'auto'] as const) {
      await page.evaluate((d) => window.__s6.setDir('mixed', d), d);
      const info = await S6.info('mixed');
      seq.push(`${info[1]!.dirAttr}/${info[1]!.direction}/${info[1]!.textAlign} others:${info[0]!.dirAttr},${info[2]!.dirAttr}`);
    }
    out.push({
      name: 'setParagraphDir rtl/ltr/auto changes only the target paragraph',
      ok: seq.join('|') === 'rtl/rtl/start others:rtl,ltr|ltr/ltr/start others:rtl,ltr|auto/ltr/start others:rtl,ltr',
      got: seq,
    });
  }
  await close();
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// 6. IME composition through CDP
// ------------------------------------------------------------------------------------------------------------

const JP_STEPS = ['k', 'か', 'かn', 'かん', 'かんj', 'かんじ', '漢字'];
const HE_STEPS = ['ש', 'של', 'שלו', 'שלום'];

async function compose(cdp: CDPSession, steps: string[]) {
  for (const t of steps) {
    await cdp.send('Input.imeSetComposition', { text: t, selectionStart: t.length, selectionEnd: t.length });
    await sleep(25);
  }
}

export async function mIme(ctx: Ctx, o: PageOpts, saveShots: boolean) {
  const { page, cdp, close } = await open(ctx, o);
  const out: Record<string, unknown>[] = [];
  const cases: { name: string; id: string; p: number; find?: string; d: number; steps: string[]; commit: string | null; selectLen?: number; shot?: boolean }[] = [
    { name: 'inside a Hebrew word', id: 'he', p: 0, find: 'עולם', d: 2, steps: JP_STEPS, commit: '漢字' },
    { name: 'at he->en boundary (before English word)', id: 'mixed', p: 0, find: 'Slidr', d: 0, steps: JP_STEPS, commit: '漢字', shot: true },
    { name: 'at en->he boundary (after English word)', id: 'mixed', p: 0, find: 'Slidr', d: 5, steps: JP_STEPS, commit: '漢字' },
    { name: 'rotated box', id: 'rot', p: 0, find: 'English', d: 3, steps: JP_STEPS, commit: '漢字', shot: true },
    { name: 'end of list item', id: 'list', p: 1, d: 20, steps: JP_STEPS, commit: '漢字' },
    { name: 'cancelled composition', id: 'en', p: 0, d: 12, steps: JP_STEPS, commit: null },
    { name: 'Hebrew composition inside English', id: 'en', p: 0, d: 12, steps: HE_STEPS, commit: 'שלום' },
    { name: 'composition replaces a selection', id: 'mixed', p: 0, find: 'Slidr', d: 0, steps: JP_STEPS, commit: '漢字', selectLen: 5 },
  ];
  for (const c of cases) {
    await page.evaluate((a) => window.__s6.setContent(a.id, a.html), { id: c.id, html: originalHtml(c.id) });
    const box = await page.evaluate((id) => window.__s6.showBox(id), c.id);
    const texts = await page.evaluate((id) => window.__s6.paraText(id), c.id);
    const before = texts[c.p]!;
    const off = (c.find ? before.indexOf(c.find) : 0) + c.d;
    const pcs = (await charList(page, c.id)).filter((x) => x.para === c.p);
    const pos = off < pcs.length ? pcs[off]!.pos : pcs[pcs.length - 1]!.pos + 1;
    await page.evaluate((a) => window.__s6.setSel(a.id, a.from, a.to), { id: c.id, from: pos, to: pos + (c.selectLen ?? 0) });
    const selText = c.selectLen ? (await page.evaluate((id) => window.__s6.sel(id), c.id)).text : '';
    await page.evaluate((id) => window.__s6.clearEvents(id), c.id);
    await compose(cdp, c.steps);
    const last = c.steps[c.steps.length - 1]!;
    const mid = (await page.evaluate((id) => window.__s6.paraText(id), c.id))[c.p]!;
    const composing = await page.evaluate((id) => window.__s6.composing(id), c.id);
    const removed = selText.length;
    const midExpected = before.slice(0, off) + last + before.slice(off + removed);
    if (saveShots && c.shot) await page.screenshot({ clip: clipFor(box), path: path.join(ctx.outDir, `ime-${tag(o)}-${c.id}.png`) });
    if (c.commit !== null) await cdp.send('Input.insertText', { text: c.commit });
    else await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    await sleep(60);
    const after = (await page.evaluate((id) => window.__s6.paraText(id), c.id))[c.p]!;
    const caret = await page.evaluate((id) => window.__s6.domCaret(id), c.id);
    const s = await page.evaluate((id) => window.__s6.sel(id), c.id);
    const ev = await page.evaluate((id) => window.__s6.events(id), c.id);
    const expected = before.slice(0, off) + (c.commit ?? '') + before.slice(off + removed);
    const expectedOff = off + (c.commit ?? '').length;
    const starts = ev.filter((e) => e.type === 'compositionstart').length;
    const ends = ev.filter((e) => e.type === 'compositionend').length;
    out.push({
      name: c.name,
      id: c.id,
      ok: after === expected && mid === midExpected && composing === true && caret?.off === expectedOff && caret?.p === c.p && s.empty && !s.lagged && starts === 1 && ends === 1,
      textOk: after === expected,
      midOk: mid === midExpected,
      composingFlag: composing,
      caretOk: caret?.off === expectedOff && caret?.p === c.p,
      pmSelectionInSync: !s.lagged && s.dom?.head === s.head,
      events: { start: starts, update: ev.filter((e) => e.type === 'compositionupdate').length, end: ends },
      ...(after === expected ? {} : { got: after, expected }),
    });
  }
  await close();
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// 7. Undo granularity
// ------------------------------------------------------------------------------------------------------------

export async function mUndo(ctx: Ctx, o: PageOpts) {
  const { page, cdp, close } = await open(ctx, o);
  const out: Record<string, unknown>[] = [];
  type Step = { type: string; delay?: number } | { key: string } | { wait: number } | { ime: string };
  const scenarios: { name: string; id: string; steps: Step[] }[] = [
    { name: '20 chars, 30 ms apart', id: 'en', steps: [{ type: 'abcdefghijklmnopqrst', delay: 30 }] },
    { name: '12 chars, 200 ms apart', id: 'en', steps: [{ type: 'abcdefghijkl', delay: 200 }] },
    { name: '4 chars, 650 ms apart', id: 'en', steps: [{ type: 'abcd', delay: 650 }] },
    { name: '10 chars, pause 700 ms, 10 chars', id: 'en', steps: [{ type: 'abcdefghij', delay: 30 }, { wait: 700 }, { type: 'klmnopqrst', delay: 30 }] },
    { name: 'three words with spaces, fast', id: 'en', steps: [{ type: ' one two three', delay: 30 }] },
    { name: '5 chars, ArrowLeft x3, 5 chars (fast)', id: 'en', steps: [{ type: 'abcde', delay: 30 }, { key: 'ArrowLeft' }, { key: 'ArrowLeft' }, { key: 'ArrowLeft' }, { type: 'fghij', delay: 30 }] },
    { name: '5 chars, Enter, 5 chars (fast)', id: 'en', steps: [{ type: 'abcde', delay: 30 }, { key: 'Enter' }, { type: 'fghij', delay: 30 }] },
    { name: '5 chars, Backspace x2, 3 chars (fast)', id: 'en', steps: [{ type: 'abcde', delay: 30 }, { key: 'Backspace' }, { key: 'Backspace' }, { type: 'fgh', delay: 30 }] },
    { name: '3 chars, Ctrl+B, 3 chars (fast)', id: 'en', steps: [{ type: 'abc', delay: 30 }, { key: 'Control+b' }, { type: 'def', delay: 30 }] },
    { name: '3 chars then IME commit (fast)', id: 'en', steps: [{ type: 'abc', delay: 30 }, { ime: '漢字' }] },
    { name: '10 Hebrew chars, 30 ms apart', id: 'he', steps: [{ type: 'שלוםעולםאב', delay: 30 }] },
  ];
  for (const sc of scenarios) {
    await page.evaluate((a) => window.__s6.setContent(a.id, a.html), { id: sc.id, html: originalHtml(sc.id) });
    await sleep(650); // let any open history group close
    const original = await page.evaluate((id) => window.__s6.text(id), sc.id);
    const len = (await page.evaluate((id) => window.__s6.paraText(id), sc.id))[0]!.length;
    await page.evaluate((a) => window.__s6.setDomCaret(a.id, 0, a.len), { id: sc.id, len });
    const h0 = await page.evaluate((id) => window.__s6.history(id), sc.id);
    for (const st of sc.steps) {
      if ('type' in st) await typeText(page, cdp, st.type, st.delay ?? 30);
      else if ('key' in st) await page.keyboard.press(st.key);
      else if ('wait' in st) await sleep(st.wait);
      else {
        await compose(cdp, JP_STEPS);
        await cdp.send('Input.insertText', { text: st.ime });
      }
    }
    await sleep(50);
    const typedText = await page.evaluate((id) => window.__s6.text(id), sc.id);
    const h1 = await page.evaluate((id) => window.__s6.history(id), sc.id);
    let presses = 0;
    const trail: number[] = [];
    while (presses < 12) {
      const t = await page.evaluate((id) => window.__s6.text(id), sc.id);
      if (t === original) break;
      await page.keyboard.press('Control+z');
      presses += 1;
      trail.push((await page.evaluate((id) => window.__s6.text(id), sc.id)).length);
    }
    const restored = (await page.evaluate((id) => window.__s6.text(id), sc.id)) === original;
    const domMatchesState = await page.evaluate((id) => window.__s6.paraText(id).join('\n') === window.__s6.text(id), sc.id);
    out.push({
      name: sc.name,
      changed: typedText !== original,
      undoGroups: h0.undoDepth !== null && h1.undoDepth !== null ? h1.undoDepth - h0.undoDepth : null,
      externalEntries: h0.external && h1.external ? h1.external.length - h0.external.length : null,
      externalTransactions: h1.external && h0.external ? h1.external.slice(h0.external.length).map((e) => e.transactions) : null,
      ctrlZToRestore: restored ? presses : `not restored after ${presses}`,
      docLengthAfterEachCtrlZ: trail,
      domMatchesState,
    });
  }
  await close();
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// 8. Bubble menu / floating UI anchored to the selection
// ------------------------------------------------------------------------------------------------------------

export async function mBubble(ctx: Ctx, o: PageOpts, saveShots: boolean) {
  const { page, close } = await open(ctx, o);
  const out: Record<string, unknown>[] = [];
  const cases = [
    { id: 'en', p: 1, word: 'paragraph' },
    { id: 'he', p: 1, word: 'ארוכה' },
    { id: 'mixed', p: 0, word: 'Slidr' },
    { id: 'rot', p: 0, word: 'English' },
  ];
  for (const c of cases) {
    await page.evaluate((id) => window.__s6.showBox(id), c.id);
    const cs = await charList(page, c.id);
    const a = resolveChar(cs, c.p, { find: c.word, d: 0 });
    await page.evaluate((x) => window.__s6.setSel(x.id, x.from, x.to), { id: c.id, from: a.pos, to: a.pos + c.word.length });
    await sleep(600);
    const measure = async () => {
      const b = await page.evaluate((id) => window.__s6.bubble(id), c.id);
      if (!b) return null;
      return {
        visible: b.visible,
        parent: b.parent,
        /** menu centre minus selection centre, horizontally (0 = centred above the selection) */
        dx: round(b.menu.x + b.menu.w / 2 - (b.ref.x + b.ref.w / 2)),
        /** vertical gap between the bottom of the menu and the top of the selection (configured offset: 8) */
        gap: round(b.ref.y - (b.menu.y + b.menu.h)),
        menuW: round(b.menu.w),
        menuH: round(b.menu.h),
        layoutW: b.layoutSize.w,
        layoutH: b.layoutSize.h,
        ref: b.ref,
        menu: b.menu,
      };
    };
    const first = await measure();
    if (saveShots && first) {
      const u = {
        x: Math.min(first.menu.x, first.ref.x) - 60,
        y: Math.min(first.menu.y, first.ref.y) - 30,
        w: Math.max(first.menu.x + first.menu.w, first.ref.x + first.ref.w) - Math.min(first.menu.x, first.ref.x) + 120,
        h: Math.max(first.menu.y + first.menu.h, first.ref.y + first.ref.h) - Math.min(first.menu.y, first.ref.y) + 60,
      };
      await page.screenshot({ clip: clipFor(u, 0), path: path.join(ctx.outDir, `bubble-${tag(o)}-${o.bubble}-${c.id}.png`) });
    }
    // does it follow when the stage scrolls (only possible when the slide is larger than the window)
    let afterScroll = null;
    const scrolled = await page.evaluate(() => {
      const st = document.getElementById('stage')!;
      const x = st.scrollLeft;
      const y = st.scrollTop;
      window.__s6.scrollStage(60, 40);
      if (st.scrollLeft === x && st.scrollTop === y) window.__s6.scrollStage(-60, -40);
      return { dx: st.scrollLeft - x, dy: st.scrollTop - y };
    });
    if (scrolled.dx !== 0 || scrolled.dy !== 0) {
      await sleep(500);
      afterScroll = { scrolled, ...(await measure()) };
    }
    out.push({ id: c.id, first, afterScroll });
  }
  await close();
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// 9. Painted caret: is it where coordsAtPos says, and is it visible at all
// ------------------------------------------------------------------------------------------------------------

export async function mCaretPaint(ctx: Ctx, o: PageOpts) {
  const { page, close } = await open(ctx, o);
  const out: Record<string, unknown>[] = [];
  /** click: place the caret with a real mouse click at `frac` across the glyph instead of programmatically */
  const cases: { name: string; id: string; p: number; find?: string; d: number; click?: number }[] = [
    { name: 'set: English', id: 'en', p: 0, d: 6 },
    { name: 'set: Hebrew', id: 'he', p: 0, d: 6 },
    { name: 'set: rotated', id: 'rot', p: 0, d: 6 },
    { name: 'click: Hebrew glyph, right half', id: 'he', p: 0, d: 8, click: 0.75 },
    { name: 'click: English glyph, left half', id: 'en', p: 0, d: 8, click: 0.25 },
    { name: 'click: Hebrew glyph inside LTR paragraph', id: 'mixed', p: 2, find: 'שלום', d: 1, click: 0.75 },
    { name: 'click: left half of S in Slidr (run edge)', id: 'mixed', p: 0, find: 'Slidr', d: 0, click: 0.25 },
    { name: 'click: right half of r in Slidr (run edge)', id: 'mixed', p: 0, find: 'Slidr', d: 4, click: 0.75 },
    { name: 'click: right half of last URL char (line starts with LTR run)', id: 'mixed', p: 0, find: 'v=2', d: 2, click: 0.75 },
    { name: 'click: rotated, left half of E in English (run edge)', id: 'rot', p: 0, find: 'English', d: 0, click: 0.25 },
  ];
  for (const c of cases) {
    const box = await page.evaluate((id) => window.__s6.showBox(id), c.id);
    const texts = await page.evaluate((id) => window.__s6.paraText(id), c.id);
    const off = (c.find ? texts[c.p]!.indexOf(c.find) : 0) + c.d;
    let edge: { x: number; y: number } | null = null;
    if (c.click === undefined) {
      await page.evaluate((a) => window.__s6.setDomCaret(a.id, a.p, a.off), { id: c.id, p: c.p, off });
    } else {
      const ch = (await charList(page, c.id)).filter((x) => x.para === c.p)[off]!;
      const t = await page.evaluate((a) => window.__s6.clickTarget(a.id, a.pos, a.frac, a.rtl, false), { id: c.id, pos: ch.pos, frac: c.click, rtl: ch.rtl === true });
      await page.mouse.click(t.x, t.y);
      await page.evaluate((id) => window.__s6.sel(id), c.id);
      await page.mouse.move(5, 1075);
      edge = t.edge;
    }
    const co = await page.evaluate((id) => window.__s6.caretCoords(id), c.id);
    // search the whole box, so a caret painted somewhere unexpected is still found
    const p = await paintedCaretNear(page, { x: box.x + box.w / 2, y: box.y + box.h / 2 }, box.w / 2 + 8, box.h / 2 + 8, ctx.dsf);
    const mid = (r: { left: number; right: number; top: number; bottom: number }) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
    const d = (a: { x: number; y: number } | null) => (p && a ? round(Math.hypot(p.cx - a.x, p.cy - a.y)) : null);
    out.push({
      name: c.name,
      id: c.id,
      painted: !!p,
      /** painted caret size (bounding box of changed pixels), CSS px */
      widthPx: p ? round(p.right - p.left) : 0,
      heightPx: p ? round(p.bottom - p.top) : 0,
      /** strongest colour change against the page without a caret, 0..255 (255 = a fully opaque red pixel on white) */
      peak: p?.peak ?? 0,
      /** distance from the centre of the painted caret to: coordsAtPos(head, 1), coordsAtPos(head, -1), the clicked glyph edge */
      toCoordsSide1: d(mid(co)),
      toCoordsSideMinus1: d(mid(co.before)),
      toClickedEdge: d(edge),
      coordsHeight: round(co.bottom - co.top),
    });
  }
  await close();
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// 11. Line breaking per mode (does the text reflow when the scaling technique changes)
// ------------------------------------------------------------------------------------------------------------

export async function mLines(ctx: Ctx, o: PageOpts) {
  const { page, close } = await open(ctx, o);
  const res: Record<string, number[][]> = {};
  for (const id of IDS) res[id] = await page.evaluate((id) => window.__s6.lines(id), id);
  await close();
  return res;
}

// ------------------------------------------------------------------------------------------------------------
// 12. List item direction variants
// ------------------------------------------------------------------------------------------------------------

export async function mListDir(ctx: Ctx, o: PageOpts) {
  const out: Record<string, unknown> = {};
  const items = ['פריט ראשון בעברית', 'פריט עם API ומספר 42', 'English item with עברית'];
  const variants: { name: string; opts: PageOpts; html?: string }[] = [
    { name: 'dir=auto on <li>, none on inner <p> (spike default)', opts: o },
    { name: 'dir=auto on inner <p> only', opts: o, html: `<ul>${items.map((t) => `<li><p dir="auto">${t}</p></li>`).join('')}</ul>` },
    { name: 'TipTap built-in textDirection: auto (dir=auto on every node)', opts: { ...o, tiptapDir: true }, html: `<ul>${items.map((t) => `<li><p>${t}</p></li>`).join('')}</ul>` },
  ];
  let i = 0;
  for (const v of variants) {
    const { page, close } = await open(ctx, v.opts);
    if (v.html) await page.evaluate((html) => window.__s6.setContent('list', html), v.html);
    const box = await page.evaluate(() => window.__s6.showBox('list'));
    const info = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-box="list"] li')).map((li) => {
        const p = li.querySelector('p')!;
        return {
          liDirAttr: li.getAttribute('dir'),
          pDirAttr: p.getAttribute('dir'),
          liDirection: getComputedStyle(li).direction,
          pDirection: getComputedStyle(p).direction,
          ulDirection: getComputedStyle(li.parentElement!).direction,
        };
      }),
    );
    i += 1;
    await page.screenshot({ clip: clipFor(box, 40), path: path.join(ctx.outDir, `list-dir-${i}.png`) });
    out[v.name] = info.map((x) => `li:${x.liDirAttr ?? '-'}/${x.liDirection} p:${x.pDirAttr ?? '-'}/${x.pDirection} ul:${x.ulDirection}`);
    await close();
  }
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// 13. scrollIntoView when typing in a box that is off screen (slide larger than the window)
// ------------------------------------------------------------------------------------------------------------

export async function mScrollIntoView(ctx: Ctx, o: PageOpts) {
  const { page, close } = await open(ctx, o);
  await page.evaluate(() => document.getElementById('stage')!.scrollTo({ left: 0, top: 0, behavior: 'instant' }));
  const before = await page.evaluate(() => {
    window.__s6.setSel('rot', 12);
    return { caret: window.__s6.caretCoords('rot'), scroll: [document.getElementById('stage')!.scrollLeft, document.getElementById('stage')!.scrollTop] };
  });
  await page.keyboard.type('x');
  await sleep(150);
  const after = await page.evaluate(() => ({
    caret: window.__s6.caretCoords('rot'),
    scroll: [document.getElementById('stage')!.scrollLeft, document.getElementById('stage')!.scrollTop],
    text: window.__s6.paraText('rot')[0],
  }));
  await close();
  const inView = (c: { left: number; top: number; bottom: number }) => c.left >= 0 && c.left <= VIEW.width && c.top >= 0 && c.bottom <= VIEW.height;
  return {
    caretInViewBefore: inView(before.caret),
    caretInViewAfter: inView(after.caret),
    caretAfter: { left: round(after.caret.left), top: round(after.caret.top) },
    stageScrollAfter: after.scroll,
    typed: after.text?.includes('x'),
  };
}

// ------------------------------------------------------------------------------------------------------------
// 14. view.endOfTextblock (used by ProseMirror for vertical arrow handling) in a rotated box
// ------------------------------------------------------------------------------------------------------------

export async function mEndOfTextblock(ctx: Ctx, o: PageOpts) {
  const { page, close } = await open(ctx, o);
  const out: Record<string, unknown>[] = [];
  for (const id of ['he', 'rot'] as const) {
    const p = id === 'he' ? 1 : 0;
    const ls = (await page.evaluate((id) => window.__s6.lines(id), id))[p]!;
    for (let line = 0; line < ls.length; line++) {
      const off = ls[line]! + 4;
      const r = await page.evaluate(
        (a) => {
          window.__s6.setDomCaret(a.id, a.p, a.off);
          return { up: window.__s6.endOfTextblock(a.id, 'up'), down: window.__s6.endOfTextblock(a.id, 'down') };
        },
        { id, p, off },
      );
      const expUp = line === 0;
      const expDown = line === ls.length - 1;
      out.push({ id, line, of: ls.length, up: r.up, down: r.down, ok: r.up === expUp && r.down === expDown });
    }
  }
  await close();
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// 15. Drag-and-drop of selected text (ProseMirror computes the drop position with posAtCoords)
// ------------------------------------------------------------------------------------------------------------

export async function mDragDrop(ctx: Ctx, o: PageOpts) {
  const { page, close } = await open(ctx, o);
  await page.evaluate(() => window.__s6.showBox('en'));
  const cs = await charList(page, 'en');
  const before = await page.evaluate(() => window.__s6.paraText('en'));
  const w = resolveChar(cs, 0, { find: 'world', d: 0 });
  await page.evaluate((a) => window.__s6.setSel('en', a.from, a.to), { from: w.pos, to: w.pos + 5 });
  const src = await page.evaluate((a) => window.__s6.clickTarget('en', a.pos, 0.5, false, false), { pos: w.pos + 2 });
  const dstChar = resolveChar(cs, 1, { find: 'second', d: 0 });
  const dst = await page.evaluate((a) => window.__s6.clickTarget('en', a.pos, 0.25, false, false), { pos: dstChar.pos });
  await page.mouse.move(src.x, src.y);
  await page.mouse.down();
  await page.mouse.move((src.x + dst.x) / 2, (src.y + dst.y) / 2, { steps: 6 });
  await page.mouse.move(dst.x, dst.y, { steps: 6 });
  await page.mouse.up();
  await sleep(100);
  const after = await page.evaluate(() => window.__s6.paraText('en'));
  await close();
  const expected0 = before[0]!.replace('world', '');
  const expected1 = before[1]!.replace('second', 'worldsecond');
  return { ok: after[0] === expected0 && after[1] === expected1, before, after, expected: [expected0, expected1] };
}

// ------------------------------------------------------------------------------------------------------------
// 16. ProseMirror focus heuristic: Home to the document start shortly after a programmatic focus
// ------------------------------------------------------------------------------------------------------------

export async function mFocusHeuristic(ctx: Ctx, o: PageOpts) {
  const { page, close } = await open(ctx, o);
  const out: Record<string, unknown>[] = [];
  const setup = async () => {
    await page.evaluate(() => window.__s6.blurAll());
    if (o.native) {
      await page.evaluate(() => {
        document.querySelector('[data-box="he"] .ProseMirror')!.innerHTML = '<p dir="auto">abc</p>';
      });
    } else {
      await page.evaluate(() => window.__s6.setContent('he', '<p dir="auto">abc</p>'));
    }
    await sleep(350);
  };
  for (const delay of [30, 120, 250, 400]) {
    await setup();
    await page.evaluate(() => window.__s6.setDomCaret('he', 0, 3, true));
    await sleep(delay);
    await page.keyboard.press('Home');
    await sleep(80);
    const c = await page.evaluate(() => window.__s6.domCaret('he'));
    out.push({ focus: 'programmatic', msAfterFocus: delay, caretOffsetAfterHome: c?.off ?? null, ok: c?.off === 0 });
  }
  if (!o.native) {
    await setup();
    const t = await page.evaluate(() => {
      const c = window.__s6.chars('he')[2]!;
      return window.__s6.clickTarget('he', c.pos, 0.75, false, false);
    });
    await page.mouse.click(t.x, t.y);
    await sleep(30);
    await page.keyboard.press('Home');
    await sleep(80);
    const c = await page.evaluate(() => window.__s6.domCaret('he'));
    out.push({ focus: 'mouse click', msAfterFocus: 30, caretOffsetAfterHome: c?.off ?? null, ok: c?.off === 0 });
  }
  await close();
  return out;
}

// ------------------------------------------------------------------------------------------------------------
// 17. StarterKit's TrailingNode: what it does to a text box that ends with a list
// ------------------------------------------------------------------------------------------------------------

export async function mTrailingNode(ctx: Ctx) {
  const res: Record<string, unknown> = {};
  for (const trailing of [true, false]) {
    const context = await ctx.browser.newContext({ viewport: VIEW });
    const page = await context.newPage();
    await page.goto(`${ctx.base}/?mode=transform&s=0.64&hud=0${trailing ? '&trailing=1' : ''}`);
    await page.evaluate(() => window.__s6.ready());
    const before = await page.evaluate(() => window.__s6.html('list'));
    await page.evaluate(() => window.__s6.setDomCaret('list', 2, 3));
    await page.keyboard.type('x');
    await sleep(50);
    const after = await page.evaluate(() => window.__s6.html('list'));
    res[trailing ? 'StarterKit default' : 'trailingNode: false'] = {
      endsWithEmptyParagraphOnLoad: /<\/ul><p[^>]*><\/p>$/.test(before),
      endsWithEmptyParagraphAfterTyping: /<\/ul><p[^>]*><\/p>$/.test(after),
      tail: after.slice(-40),
    };
    await context.close();
  }
  return res;
}
