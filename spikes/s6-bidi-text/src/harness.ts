/**
 * In-page measurement harness, exposed as `window.__s6` and driven by tests/run.ts through Playwright.
 * Everything here reads real browser geometry (Range.getClientRects, ProseMirror coordsAtPos / posAtCoords,
 * the DOM selection); nothing is assumed.
 */
import { posToDOMRect } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { redoDepth, undoDepth } from '@tiptap/pm/history';
import type { EditorView } from '@tiptap/pm/view';

import { BOXES } from './boxes.ts';
import type { BoxSpec, PageConfig } from './boxes.ts';
import type { ExternalHistoryStorage } from './extensions.ts';

export type CharCat = 'he' | 'lat' | 'digit' | 'neutral';

export interface CharInfo {
  /** ProseMirror position before the character; the character occupies [pos, pos + 1] */
  pos: number;
  ch: string;
  /** textblock index inside the editor, and character offset inside that textblock */
  para: number;
  off: number;
  cat: CharCat;
  /** resolved visual direction of the glyph (see resolveRtl) */
  rtl: boolean | null;
  /** a logical neighbour of this glyph runs in the other direction */
  boundary: boolean;
  /** axis-aligned bounding box of the glyph quad, viewport px */
  x: number;
  y: number;
  w: number;
  h: number;
  /** glyph centre (viewport px) and glyph size along the box's own axes (viewport px, rotation removed) */
  cx: number;
  cy: number;
  lw: number;
  lh: number;
  /** visual line index inside the textblock */
  line: number;
}

interface Pt {
  x: number;
  y: number;
}

const editors: Record<string, Editor> = {};
const eventLog: Record<string, { type: string; data: string | null; inputType?: string; isComposing?: boolean; key?: string }[]> =
  {};
let cfg: PageConfig;

const HEB = /[֐-׿יִ-ﭏ]/;
const LAT = /[A-Za-zÀ-ɏ]/;
const DIG = /[0-9]/;

function spec(id: string): BoxSpec {
  const s = BOXES.find((b) => b.id === id);
  if (!s) throw new Error(`unknown box ${id}`);
  return s;
}

function theta(id: string): number {
  return cfg.norot ? 0 : (spec(id).rot * Math.PI) / 180;
}

function ed(id: string): Editor {
  const e = editors[id];
  if (!e) throw new Error(`no editor ${id}`);
  return e;
}

function rootEl(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-box="${id}"] .ProseMirror`);
  if (!el) throw new Error(`no root for ${id}`);
  return el;
}

function stage(): HTMLElement {
  return document.getElementById('stage')!;
}

/** Scroll the stage so a viewport point is comfortably inside the window. Returns true when it scrolled. */
function ensureVisible(x: number, y: number, margin = 80): boolean {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (x >= margin && x <= vw - margin && y >= margin && y <= vh - margin) return false;
  const st = stage();
  const beforeX = st.scrollLeft;
  const beforeY = st.scrollTop;
  st.scrollBy({ left: x - vw / 2, top: y - vh / 2, behavior: 'instant' });
  return st.scrollLeft !== beforeX || st.scrollTop !== beforeY;
}

type BidiType = 'L' | 'R' | 'EN' | 'ES' | 'ET' | 'CS' | 'WS' | 'ON';

function bidiType(ch: string): BidiType {
  if (HEB.test(ch)) return 'R';
  if (LAT.test(ch)) return 'L';
  if (DIG.test(ch)) return 'EN';
  if (ch === '+' || ch === '-') return 'ES';
  if ('#$%'.includes(ch)) return 'ET';
  if (',.:/'.includes(ch)) return 'CS';
  if (/\s/.test(ch)) return 'WS';
  return 'ON';
}

/**
 * Visual direction of every character of one paragraph: a small subset of UAX#9 (rules W4-W7, N1, N2; no explicit
 * embeddings, no Arabic, no N0 bracket pairing - not needed for the fixtures). The result is not trusted blindly:
 * dirSelfTest() checks it against the real layout.
 */
function resolveRtl(text: string, paraRtl: boolean): boolean[] {
  const t = Array.from(text, bidiType);
  const n = t.length;
  for (let i = 1; i < n - 1; i++) if ((t[i] === 'ES' || t[i] === 'CS') && t[i - 1] === 'EN' && t[i + 1] === 'EN') t[i] = 'EN'; // W4
  for (let i = 0; i < n; i++) {
    if (t[i] !== 'ET') continue;
    let j = i;
    while (j < n && t[j] === 'ET') j++;
    if ((i > 0 && t[i - 1] === 'EN') || (j < n && t[j] === 'EN')) for (let k = i; k < j; k++) t[k] = 'EN'; // W5
    i = j - 1;
  }
  for (let i = 0; i < n; i++) if (t[i] === 'ES' || t[i] === 'ET' || t[i] === 'CS') t[i] = 'ON'; // W6
  let strong: 'L' | 'R' = paraRtl ? 'R' : 'L';
  const enIsL: boolean[] = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (t[i] === 'L' || t[i] === 'R') strong = t[i] as 'L' | 'R';
    else if (t[i] === 'EN' && strong === 'L') enIsL[i] = true; // W7
  }
  const side = (i: number): 'L' | 'R' => {
    if (i < 0 || i >= n) return paraRtl ? 'R' : 'L';
    if (t[i] === 'EN') return enIsL[i] ? 'L' : 'R';
    return t[i] as 'L' | 'R';
  };
  const isNi = (x: BidiType | undefined) => x === 'ON' || x === 'WS';
  const out: boolean[] = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (!isNi(t[i])) {
      out[i] = t[i] === 'R';
      continue;
    }
    let j = i;
    while (j < n && isNi(t[j])) j++;
    const before = side(i - 1);
    const after = side(j);
    const dir = before === after ? before : paraRtl ? 'R' : 'L'; // N1 / N2
    for (let k = i; k < j; k++) out[k] = dir === 'R';
    i = j - 1;
  }
  return out;
}

function classify(ch: string): CharCat {
  if (HEB.test(ch)) return 'he';
  if (LAT.test(ch)) return 'lat';
  if (DIG.test(ch)) return 'digit';
  return 'neutral';
}

/** DOM text node + offset holding the character that starts at PM position `pos`. */
function textNodeAt(view: EditorView, pos: number): { node: Text; offset: number } | null {
  let { node, offset } = view.domAtPos(pos, 1);
  let guard = 0;
  while (node.nodeType !== Node.TEXT_NODE && guard++ < 12) {
    const child = node.childNodes[offset];
    if (!child) return null;
    node = child;
    offset = 0;
  }
  if (node.nodeType !== Node.TEXT_NODE) return null;
  if (offset >= (node.nodeValue ?? '').length) {
    const walker = document.createTreeWalker(view.dom, NodeFilter.SHOW_TEXT);
    walker.currentNode = node;
    const next = walker.nextNode();
    if (!next) return null;
    return { node: next as Text, offset: 0 };
  }
  return { node: node as Text, offset };
}

function glyphRect(view: EditorView, pos: number): DOMRect | null {
  const t = textNodeAt(view, pos);
  if (!t) return null;
  const r = document.createRange();
  r.setStart(t.node, t.offset);
  r.setEnd(t.node, t.offset + 1);
  const rects = Array.from(r.getClientRects());
  if (!rects.length) return null;
  let best = rects[0]!;
  for (const rc of rects) if (rc.width > best.width) best = rc;
  return best;
}

/** All characters of an editor with their on-screen geometry. */
function chars(id: string): CharInfo[] {
  const view = ed(id).view;
  const th = theta(id);
  const c = Math.cos(th);
  const s = Math.sin(th);
  const out: CharInfo[] = [];
  let para = -1;
  view.state.doc.descendants((node, nodePos) => {
    if (!node.isTextblock) return true;
    para += 1;
    const text = node.textBetween(0, node.content.size, undefined, '￼');
    const paraChars: CharInfo[] = [];
    for (let i = 0; i < text.length; i++) {
      const pos = nodePos + 1 + i;
      const ch = text[i]!;
      const rc = glyphRect(view, pos);
      const W = rc?.width ?? 0;
      const H = rc?.height ?? 0;
      let lw = W;
      let lh = H;
      if (th !== 0) {
        const d = c * c - s * s;
        lw = (W * c - H * s) / d;
        lh = (H * c - W * s) / d;
      }
      paraChars.push({
        pos,
        ch,
        para,
        off: i,
        cat: classify(ch),
        rtl: null,
        boundary: false,
        x: rc?.left ?? NaN,
        y: rc?.top ?? NaN,
        w: W,
        h: H,
        cx: rc ? rc.left + W / 2 : NaN,
        cy: rc ? rc.top + H / 2 : NaN,
        lw,
        lh,
        line: 0,
      });
    }
    // direction + boundary (a glyph whose logical neighbour runs the other way)
    const paraEl = view.nodeDOM(nodePos) as HTMLElement | null;
    const paraRtl = paraEl ? getComputedStyle(paraEl).direction === 'rtl' : false;
    const dirs = resolveRtl(text, paraRtl);
    paraChars.forEach((ci, i) => {
      ci.rtl = dirs[i]!;
      ci.boundary = (i > 0 && dirs[i - 1] !== dirs[i]) || (i < paraChars.length - 1 && dirs[i + 1] !== dirs[i]);
    });
    // visual lines: project the glyph centre on the box's own y axis
    let line = 0;
    let lineY: number | null = null;
    for (const ci of paraChars) {
      if (Number.isNaN(ci.cx)) {
        ci.line = line;
        continue;
      }
      const ly = -ci.cx * s + ci.cy * c;
      if (lineY === null) lineY = ly;
      else if (Math.abs(ly - lineY) > ci.lh * 0.5) {
        line += 1;
        lineY = ly;
      }
      ci.line = line;
    }
    out.push(...paraChars);
    return false;
  });
  return out;
}

/**
 * Checks resolveRtl() against the real layout: two logically adjacent glyphs on one line that were resolved to the
 * same direction must be laid out in that order. Returns the number of pairs checked and the violations.
 */
function dirSelfTest(id: string): { pairs: number; violations: string[] } {
  const th = theta(id);
  const cs = chars(id);
  let pairs = 0;
  const violations: string[] = [];
  for (let i = 0; i + 1 < cs.length; i++) {
    const a = cs[i]!;
    const b = cs[i + 1]!;
    if (a.para !== b.para || a.line !== b.line || a.rtl !== b.rtl || a.w === 0 || b.w === 0) continue;
    pairs += 1;
    // position along the box's own x axis
    const ax = a.cx * Math.cos(th) + a.cy * Math.sin(th);
    const bx = b.cx * Math.cos(th) + b.cy * Math.sin(th);
    if (a.rtl ? bx >= ax : bx <= ax) violations.push(`${id}:${a.pos}"${a.ch}${b.ch}"`);
  }
  return { pairs, violations };
}

/** Per textblock: the character offsets at which each visual line starts. Used to compare line breaking between modes. */
function lines(id: string): number[][] {
  const res: number[][] = [];
  for (const ci of chars(id)) {
    const arr = (res[ci.para] ??= []);
    if (arr.length <= ci.line) arr[ci.line] = ci.off;
  }
  return res;
}

/** Where the caret should be drawn for the logical start / end edge of a glyph (viewport px, glyph vertical centre). */
function caretPoint(id: string, ci: CharInfo, edge: 'start' | 'end'): Pt {
  const th = theta(id);
  const sign = (edge === 'start') === (ci.rtl === true) ? 1 : -1;
  return { x: ci.cx + sign * (ci.lw / 2) * Math.cos(th), y: ci.cy + sign * (ci.lw / 2) * Math.sin(th) };
}

/** Geometry of the single glyph that starts at `pos` (same maths as chars(), without walking the whole document). */
function glyph(id: string, pos: number) {
  const rc = glyphRect(ed(id).view, pos);
  if (!rc) return null;
  const th = theta(id);
  const c = Math.cos(th);
  const s = Math.sin(th);
  let lw = rc.width;
  let lh = rc.height;
  if (th !== 0) {
    const d = c * c - s * s;
    lw = (rc.width * c - rc.height * s) / d;
    lh = (rc.height * c - rc.width * s) / d;
  }
  return { cx: rc.left + rc.width / 2, cy: rc.top + rc.height / 2, lw, lh, c, s };
}

/**
 * Click target inside one glyph: `frac` is the position across the glyph, left to right in the box's own axes.
 * Expected caret: the glyph edge nearest to the click, expressed as a logical position.
 */
function clickTarget(id: string, pos: number, frac: number, rtl: boolean, scroll = true, resetClickChain = true) {
  // ProseMirror keeps its own click chain: two mousedowns < 500 ms and < 10 px apart become a double click, three a
  // triple click (which selects the paragraph), whatever event.detail says. Automated clicks on neighbouring glyphs
  // are that fast, so the chain is cleared between test clicks. tests/measures.ts also runs a paced sample without this.
  if (resetClickChain) (ed(id).view as unknown as { input: { lastClick: { time: number } } }).input.lastClick.time = 0;
  let g = glyph(id, pos);
  if (!g) throw new Error(`no glyph at ${pos}`);
  if (scroll && ensureVisible(g.cx, g.cy)) g = glyph(id, pos)!;
  const d = (frac - 0.5) * g.lw;
  const leftHalf = frac < 0.5;
  const expected = rtl ? (leftHalf ? pos + 1 : pos) : leftHalf ? pos : pos + 1;
  const e = ((leftHalf ? -1 : 1) * g.lw) / 2;
  return {
    x: g.cx + d * g.c,
    y: g.cy + d * g.s,
    /** the simple logical answer: this glyph's own start / end position */
    expected,
    /** the glyph edge nearest to the click: where the caret should be drawn */
    edge: { x: g.cx + e * g.c, y: g.cy + e * g.s },
    lw: g.lw,
  };
}

/** Distance from a viewport point to where the current caret is drawn according to coordsAtPos (best of both sides). */
function caretDistanceTo(id: string, pt: Pt): number {
  const view = ed(id).view;
  let best = Infinity;
  for (const side of [1, -1] as const) {
    const c = view.coordsAtPos(view.state.selection.head, side);
    best = Math.min(best, Math.hypot((c.left + c.right) / 2 - pt.x, (c.top + c.bottom) / 2 - pt.y));
  }
  return best;
}

/** Smallest on-screen distance between the carets of two logical positions (either side). 0 = drawn at the same place. */
function visualDist(id: string, a: number, b: number): number {
  const view = ed(id).view;
  let best = Infinity;
  for (const sa of [1, -1] as const)
    for (const sb of [1, -1] as const) {
      const ca = view.coordsAtPos(a, sa);
      const cb = view.coordsAtPos(b, sb);
      best = Math.min(best, Math.hypot((ca.left + ca.right - cb.left - cb.right) / 2, (ca.top + ca.bottom - cb.top - cb.bottom) / 2));
    }
  return best;
}

function domSelPm(view: EditorView): { anchor: number; head: number } | null {
  const sel = document.getSelection();
  if (!sel || !sel.anchorNode || !sel.focusNode) return null;
  if (!view.dom.contains(sel.anchorNode) || !view.dom.contains(sel.focusNode)) return null;
  try {
    return { anchor: view.posAtDOM(sel.anchorNode, sel.anchorOffset), head: view.posAtDOM(sel.focusNode, sel.focusOffset) };
  } catch {
    return null;
  }
}

/** ProseMirror selection, after giving PM the chance to read the DOM selection (selectionchange is async). */
async function sel(id: string) {
  const e = ed(id);
  const view = e.view;
  const t0 = performance.now();
  let lagged = false;
  for (;;) {
    await new Promise<void>((r) => setTimeout(r, 0));
    const d = domSelPm(view);
    const s = view.state.selection;
    if (!d || (d.anchor === s.anchor && d.head === s.head)) break;
    if (performance.now() - t0 > 150) {
      lagged = true;
      break;
    }
  }
  const s = view.state.selection;
  return {
    from: s.from,
    to: s.to,
    anchor: s.anchor,
    head: s.head,
    empty: s.empty,
    focused: view.hasFocus(),
    text: view.state.doc.textBetween(s.from, s.to, '\n'),
    dom: domSelPm(view),
    lagged,
  };
}

function setSel(id: string, anchor: number, head?: number, keepFocusHeuristic = false) {
  const e = ed(id);
  e.commands.setTextSelection(head === undefined ? anchor : { from: Math.min(anchor, head), to: Math.max(anchor, head) });
  e.view.focus();
  // ProseMirror heuristic (domobserver.flush): for 200 ms after the editor gains focus without a click, a selection
  // change that lands on the start of the document is treated as a browser focus artefact and reverted. A test that
  // focuses programmatically and presses Home right away would trip it; mFocusHeuristic measures it on purpose.
  if (!keepFocusHeuristic) (e.view as unknown as { input: { lastFocus: number } }).input.lastFocus = 0;
  const s = e.state.selection;
  return { anchor: s.anchor, head: s.head };
}

interface CoordSample {
  pos: number;
  side: 1 | -1;
  /** he / en = between two glyphs of that script; boundary = between glyphs of opposite direction; edge = paragraph start/end; other */
  group: 'he' | 'en' | 'boundary' | 'other';
  /**
   * Distance (px) from the centre of the coordsAtPos rect to the glyph edge that `side` names:
   * side 1 -> logical start edge of the glyph after pos, side -1 -> logical end edge of the glyph before pos.
   */
  errPrimary: number;
  /** Distance to the nearer of the two glyph edges that are logically adjacent to pos. */
  errEither: number;
  /** the two sides of this position are drawn in different places: 'wrap' (different lines), 'bidi' (same line) */
  ambiguous: 'no' | 'wrap' | 'bidi';
  /** |coords.left - x of the matched edge|: what a consumer reading `left` gets (differs from errEither only when rotated) */
  errLeft: number;
  errTop: number;
  errBottom: number;
  width: number;
  height: number;
}

/**
 * Measurement 2a: view.coordsAtPos against glyph rects, for both sides of every caret position.
 * A caret position between glyph a and glyph b may legitimately be drawn at the end edge of a or at the start edge
 * of b; these coincide inside a directional run and differ at bidi boundaries and soft wraps.
 */
function coordsReport(id: string): { samples: CoordSample[] } {
  const view = ed(id).view;
  const byPos = new Map<number, CharInfo>();
  for (const ci of chars(id)) byPos.set(ci.pos, ci);
  const samples: CoordSample[] = [];
  const usable = (ci: CharInfo | undefined): ci is CharInfo => !!ci && ci.rtl !== null && ci.w > 0;
  view.state.doc.descendants((node, nodePos) => {
    if (!node.isTextblock) return true;
    const start = nodePos + 1;
    const end = start + node.content.size;
    for (let p = start; p <= end; p++) {
      const after = p < end ? byPos.get(p) : undefined;
      const before = p > start ? byPos.get(p - 1) : undefined;
      const A = usable(after) ? { pt: caretPoint(id, after, 'start'), ci: after } : null;
      const B = usable(before) ? { pt: caretPoint(id, before, 'end'), ci: before } : null;
      if (!A && !B) continue;
      let group: CoordSample['group'] = 'other';
      if (A && B && A.ci.rtl !== B.ci.rtl) group = 'boundary';
      else if ((!A || A.ci.cat === 'he') && (!B || B.ci.cat === 'he')) group = 'he';
      else if ((!A || A.ci.cat === 'lat') && (!B || B.ci.cat === 'lat')) group = 'en';
      const c1 = view.coordsAtPos(p, 1);
      const c2 = view.coordsAtPos(p, -1);
      const sep = Math.hypot((c1.left + c1.right - c2.left - c2.right) / 2, (c1.top + c1.bottom - c2.top - c2.bottom) / 2);
      const lineH = (A ?? B)!.ci.lh;
      const ambiguous: CoordSample['ambiguous'] = sep <= 1 ? 'no' : A && B && A.ci.line !== B.ci.line ? 'wrap' : sep > lineH * 0.9 && !(A && B) ? 'wrap' : 'bidi';
      for (const side of [1, -1] as const) {
        const c = side === 1 ? c1 : c2;
        const mx = (c.left + c.right) / 2;
        const my = (c.top + c.bottom) / 2;
        const dist = (x: { pt: Pt } | null) => (x ? Math.hypot(mx - x.pt.x, my - x.pt.y) : Infinity);
        const primary = side === 1 ? (A ?? B)! : (B ?? A)!;
        const near = dist(A) <= dist(B) ? A! : B!;
        samples.push({
          pos: p,
          side,
          group,
          errPrimary: dist(primary),
          errEither: dist(near),
          ambiguous,
          errLeft: Math.abs(c.left - near.pt.x),
          errTop: Math.abs(c.top - near.ci.y),
          errBottom: Math.abs(c.bottom - (near.ci.y + near.ci.h)),
          width: c.right - c.left,
          height: c.bottom - c.top,
        });
      }
    }
    return false;
  });
  return { samples };
}

interface RoundTrip {
  pos: number;
  got: number;
  result: 'exact' | 'equivalent' | 'mismatch' | 'null';
  dist: number;
}

/**
 * Measurement 2b: posAtCoords(coordsAtPos(p)) for every caret position.
 * "equivalent" = a different logical position that is drawn at the same place (inherent at bidi boundaries and soft wraps).
 */
function roundTrip(id: string): RoundTrip[] {
  const view = ed(id).view;
  const out: RoundTrip[] = [];
  view.state.doc.descendants((node, nodePos) => {
    if (!node.isTextblock) return true;
    for (let p = nodePos + 1; p <= nodePos + 1 + node.content.size; p++) {
      let c = view.coordsAtPos(p, 1);
      if (ensureVisible((c.left + c.right) / 2, (c.top + c.bottom) / 2)) c = view.coordsAtPos(p, 1);
      const q = { left: (c.left + c.right) / 2, top: (c.top + c.bottom) / 2 };
      const r = view.posAtCoords(q);
      if (!r) {
        out.push({ pos: p, got: -1, result: 'null', dist: NaN });
        continue;
      }
      if (r.pos === p) {
        out.push({ pos: p, got: r.pos, result: 'exact', dist: 0 });
        continue;
      }
      let best = Infinity;
      for (const side of [1, -1] as const) {
        const c2 = view.coordsAtPos(r.pos, side);
        best = Math.min(best, Math.hypot((c2.left + c2.right) / 2 - q.left, (c2.top + c2.bottom) / 2 - q.top));
      }
      out.push({ pos: p, got: r.pos, result: best <= 1 ? 'equivalent' : 'mismatch', dist: best });
    }
    return false;
  });
  return out;
}

// ---- DOM-level caret addressing that works for ProseMirror and for the native contenteditable control ----

function paragraphs(id: string): HTMLElement[] {
  return Array.from(rootEl(id).querySelectorAll<HTMLElement>('p'));
}

function domPointToParaOff(id: string, node: Node, offset: number): { p: number; off: number } | null {
  const ps = paragraphs(id);
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  const pEl = el?.closest('p');
  if (!pEl) return null;
  const p = ps.indexOf(pEl as HTMLElement);
  if (p < 0) return null;
  const r = document.createRange();
  r.selectNodeContents(pEl);
  r.setEnd(node, offset);
  return { p, off: r.toString().length };
}

function paraOffToDomPoint(id: string, p: number, off: number): { node: Node; offset: number } {
  const pEl = paragraphs(id)[p];
  if (!pEl) throw new Error(`no paragraph ${p} in ${id}`);
  const walker = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT);
  let remaining = off;
  let last: Text | null = null;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const len = (n.nodeValue ?? '').length;
    last = n as Text;
    if (remaining <= len) return { node: n, offset: remaining };
    remaining -= len;
  }
  if (last) return { node: last, offset: (last.nodeValue ?? '').length };
  return { node: pEl, offset: 0 };
}

/** Caret as (paragraph index, character offset), read from the DOM selection. */
function domCaret(id: string) {
  const s = document.getSelection();
  if (!s || !s.focusNode || !s.anchorNode) return null;
  const f = domPointToParaOff(id, s.focusNode, s.focusOffset);
  const a = domPointToParaOff(id, s.anchorNode, s.anchorOffset);
  if (!f || !a) return null;
  return { p: f.p, off: f.off, ap: a.p, aoff: a.off, text: s.toString() };
}

function setDomCaret(id: string, p: number, off: number, keepFocusHeuristic = false) {
  const pt = paraOffToDomPoint(id, p, off);
  if (cfg.native) {
    const root = rootEl(id);
    root.focus();
    document.getSelection()!.collapse(pt.node, pt.offset);
  } else {
    const view = ed(id).view;
    setSel(id, view.posAtDOM(pt.node, pt.offset), undefined, keepFocusHeuristic);
  }
  return domCaret(id);
}

function paraText(id: string): string[] {
  return paragraphs(id).map((p) => p.textContent ?? '');
}

function paraInfo(id: string) {
  return paragraphs(id).map((p) => {
    const holder = p.parentElement?.tagName === 'LI' ? p.parentElement : p;
    const cs = getComputedStyle(p);
    return {
      text: p.textContent ?? '',
      dirAttr: holder.getAttribute('dir'),
      pDirAttr: p.getAttribute('dir'),
      direction: cs.direction,
      holderDirection: getComputedStyle(holder).direction,
      textAlign: cs.textAlign,
    };
  });
}

function selRects(): { x: number; y: number; w: number; h: number }[] {
  const s = document.getSelection();
  if (!s || s.rangeCount === 0) return [];
  return Array.from(s.getRangeAt(0).getClientRects()).map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height }));
}

function boxRect(id: string) {
  const r = document.querySelector<HTMLElement>(`[data-box="${id}"]`)!.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function showBox(id: string) {
  const r = boxRect(id);
  ensureVisible(r.x + r.w / 2, r.y + r.h / 2, Math.max(r.w, r.h) / 2 + 20);
  // if the box is larger than the window the call above still centres it
  return boxRect(id);
}

function caretCoords(id: string) {
  const view = ed(id).view;
  const c = view.coordsAtPos(view.state.selection.head, 1);
  const b = view.coordsAtPos(view.state.selection.head, -1);
  return { left: c.left, right: c.right, top: c.top, bottom: c.bottom, before: { left: b.left, right: b.right, top: b.top, bottom: b.bottom } };
}

function blurAll() {
  (document.activeElement as HTMLElement | null)?.blur?.();
  document.getSelection()?.removeAllRanges();
}

/** Measurement 8: where the bubble menu landed relative to what it is anchored to. */
function bubble(id: string) {
  const e = ed(id);
  const menu = document.querySelector<HTMLElement>(`[data-bubble="${id}"]`);
  const s = e.state.selection;
  const ref = posToDOMRect(e.view, s.from, s.to);
  if (!menu) return null;
  const m = menu.getBoundingClientRect();
  return {
    visible: getComputedStyle(menu).visibility !== 'hidden' && menu.isConnected,
    parent: menu.parentElement === document.body ? 'body' : (menu.parentElement?.className ?? '?'),
    menu: { x: m.left, y: m.top, w: m.width, h: m.height },
    layoutSize: { w: menu.offsetWidth, h: menu.offsetHeight },
    ref: { x: ref.left, y: ref.top, w: ref.width, h: ref.height },
  };
}

function history(id: string) {
  const e = ed(id);
  const ext = (e.storage as unknown as Record<string, unknown>)['externalHistory'] as ExternalHistoryStorage | undefined;
  let undo: number | null = null;
  let redo: number | null = null;
  if (cfg.hist === 'tiptap') {
    undo = undoDepth(e.state);
    redo = redoDepth(e.state);
  }
  return {
    undoDepth: undo,
    redoDepth: redo,
    external: ext ? ext.entries.map((x) => ({ transactions: x.transactions, ms: x.lastAt - x.startedAt })) : null,
  };
}

function attachLog(id: string, dom: HTMLElement) {
  const log = (eventLog[id] ??= []);
  for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'beforeinput', 'input', 'keydown'] as const) {
    dom.addEventListener(
      type,
      (ev) => {
        const ie = ev as InputEvent;
        log.push({
          type,
          data: 'data' in ev ? ((ev as CompositionEvent).data ?? null) : null,
          inputType: ie.inputType,
          isComposing: ie.isComposing,
          key: (ev as KeyboardEvent).key,
        });
      },
      true,
    );
  }
}

export function registerEditor(id: string, editor: Editor) {
  editors[id] = editor;
  attachLog(id, editor.view.dom);
}

async function ready() {
  const wanted: [string, string][] = [
    ['400 40px Heebo', 'שלום abc 123'],
    ['700 40px Heebo', 'שלום abc 123'],
    ['400 40px Inter', 'Hello 123'],
    ['700 40px Inter', 'Hello 123'],
  ];
  for (const [font, text] of wanted) await document.fonts.load(font, text);
  await document.fonts.ready;
  if (!cfg.native) {
    const t0 = performance.now();
    while (Object.keys(editors).length < BOXES.length && performance.now() - t0 < 5000) {
      await new Promise((r) => setTimeout(r, 20));
    }
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return {
    config: cfg,
    editors: Object.keys(editors),
    fonts: wanted.map(([font, text]) => ({ font, ok: document.fonts.check(font, text) })),
    loadedFaces: Array.from(document.fonts)
      .filter((f) => f.status === 'loaded')
      .map((f) => `${f.family} ${f.weight} ${f.unicodeRange.slice(0, 16)}`),
    ua: navigator.userAgent,
    dpr: window.devicePixelRatio,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    slide: (() => {
      const r = document.getElementById('slide')!.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    })(),
  };
}

const api = {
  ready,
  chars,
  dirSelfTest,
  lines,
  clickTarget,
  caretDistanceTo,
  visualDist,
  sel,
  setSel,
  coordsReport,
  roundTrip,
  domCaret,
  setDomCaret,
  paraText,
  paraInfo,
  selRects,
  boxRect,
  showBox,
  caretCoords,
  blurAll,
  bubble,
  history,
  ensureVisible,
  text: (id: string) => ed(id).state.doc.textBetween(0, ed(id).state.doc.content.size, '\n'),
  html: (id: string) => ed(id).getHTML(),
  json: (id: string) => ed(id).getJSON(),
  composing: (id: string) => ed(id).view.composing,
  events: (id: string) => eventLog[id] ?? [],
  clearEvents: (id: string) => {
    (eventLog[id] ??= []).length = 0;
  },
  endOfTextblock: (id: string, dir: 'up' | 'down' | 'left' | 'right' | 'forward' | 'backward') => ed(id).view.endOfTextblock(dir),
  setContent: (id: string, html: string) => {
    ed(id).commands.setContent(html);
  },
  setDir: (id: string, dir: 'rtl' | 'ltr' | 'auto' | null) => ed(id).commands.setParagraphDir(dir),
  focusedEditor: (): Editor | null => Object.values(editors).find((e) => e.isFocused) ?? null,
  scrollStage: (dx: number, dy: number) => stage().scrollBy({ left: dx, top: dy, behavior: 'instant' }),
  editor: (id: string) => ed(id),
};

export type S6Api = typeof api;

declare global {
  interface Window {
    __s6: S6Api;
  }
}

export function installHarness(config: PageConfig) {
  cfg = config;
  window.__s6 = api;
}
