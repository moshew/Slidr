import type { CDPSession, Page } from 'playwright-core';
import { PNG } from 'pngjs';

export interface Stats {
  n: number;
  mean: number;
  p95: number;
  max: number;
}

export function stats(values: number[]): Stats {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, mean: NaN, p95: NaN, max: NaN };
  const sum = v.reduce((a, b) => a + b, 0);
  return {
    n: v.length,
    mean: round(sum / v.length, 3),
    p95: round(v[Math.min(v.length - 1, Math.floor(v.length * 0.95))]!, 3),
    max: round(v[v.length - 1]!, 3),
  };
}

export function round(x: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Standard Israeli Hebrew keyboard layout (SI-1452): character -> physical key.
 * Hebrew letters are sent as real key events (keydown carrying the Hebrew `key`/`text` on the physical `code`),
 * which is what Windows delivers when the Hebrew layout is active. This exercises the keydown -> beforeinput path
 * instead of Playwright's fallback for non-US characters (Input.insertText, which sends no key events).
 */
const HEBREW_KEYS: Record<string, [code: string, vk: number]> = {
  ק: ['KeyE', 69],
  ר: ['KeyR', 82],
  א: ['KeyT', 84],
  ט: ['KeyY', 89],
  ו: ['KeyU', 85],
  ן: ['KeyI', 73],
  ם: ['KeyO', 79],
  פ: ['KeyP', 80],
  ש: ['KeyA', 65],
  ד: ['KeyS', 83],
  ג: ['KeyD', 68],
  כ: ['KeyF', 70],
  ע: ['KeyG', 71],
  י: ['KeyH', 72],
  ח: ['KeyJ', 74],
  ל: ['KeyK', 75],
  ך: ['KeyL', 76],
  ף: ['Semicolon', 186],
  ז: ['KeyZ', 90],
  ס: ['KeyX', 88],
  ב: ['KeyC', 67],
  ה: ['KeyV', 86],
  נ: ['KeyB', 66],
  מ: ['KeyN', 78],
  צ: ['KeyM', 77],
  ת: ['Comma', 188],
  ץ: ['Period', 190],
};

export async function typeText(page: Page, cdp: CDPSession, text: string, delay = 15): Promise<void> {
  for (const ch of text) {
    const heb = HEBREW_KEYS[ch];
    if (heb) {
      const [code, vk] = heb;
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: ch,
        code,
        windowsVirtualKeyCode: vk,
        nativeVirtualKeyCode: vk,
        text: ch,
        unmodifiedText: ch,
      });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    } else if (ch === '\n') {
      await page.keyboard.press('Enter');
    } else {
      await page.keyboard.type(ch);
    }
    if (delay) await sleep(delay);
  }
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiffResult {
  width: number;
  height: number;
  /** changed pixels */
  count: number;
  /** bounding box of changed pixels in image px, or null */
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
  /** largest per-channel difference seen */
  peak: number;
  mask: Uint8Array;
  /** per column: number of changed pixels */
  cols: number[];
}

/** Pixel difference between two same-size PNG buffers. */
export function diffPng(a: Buffer, b: Buffer, threshold = 24): DiffResult {
  const A = PNG.sync.read(a);
  const B = PNG.sync.read(b);
  if (A.width !== B.width || A.height !== B.height) throw new Error(`size mismatch ${A.width}x${A.height} vs ${B.width}x${B.height}`);
  const { width, height } = A;
  const mask = new Uint8Array(width * height);
  const cols = new Array<number>(width).fill(0);
  let count = 0;
  let peak = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const d = Math.max(
        Math.abs(A.data[i]! - B.data[i]!),
        Math.abs(A.data[i + 1]! - B.data[i + 1]!),
        Math.abs(A.data[i + 2]! - B.data[i + 2]!),
      );
      if (d > peak) peak = d;
      if (d > threshold) {
        mask[y * width + x] = 1;
        cols[x]! += 1;
        count += 1;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
  }
  return { width, height, count, bbox: count ? { x0, y0, x1, y1 } : null, peak, mask, cols };
}

/**
 * Compare a painted-difference mask against rectangles (image px = CSS px * dsf, origin = clip origin).
 * inside  = share of changed pixels that fall inside the rects (grown by `grow` px)
 * covered = share of the rects' pixels that changed
 */
export function maskVsRects(d: DiffResult, rects: Rect[], origin: { x: number; y: number }, dsf: number, grow = 1) {
  const inRect = new Uint8Array(d.width * d.height);
  const inGrown = new Uint8Array(d.width * d.height);
  const paint = (target: Uint8Array, g: number, snapIn: boolean) => {
    for (const r of rects) {
      const fx0 = (r.x - origin.x) * dsf;
      const fy0 = (r.y - origin.y) * dsf;
      const fx1 = (r.x + r.w - origin.x) * dsf;
      const fy1 = (r.y + r.h - origin.y) * dsf;
      const X0 = Math.max(0, (snapIn ? Math.ceil(fx0) : Math.floor(fx0)) - g);
      const Y0 = Math.max(0, (snapIn ? Math.ceil(fy0) : Math.floor(fy0)) - g);
      const X1 = Math.min(d.width, (snapIn ? Math.floor(fx1) : Math.ceil(fx1)) + g);
      const Y1 = Math.min(d.height, (snapIn ? Math.floor(fy1) : Math.ceil(fy1)) + g);
      for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) target[y * d.width + x] = 1;
    }
  };
  paint(inRect, 0, true);
  paint(inGrown, grow, false);
  let changedInside = 0;
  let rectPx = 0;
  let rectChanged = 0;
  for (let i = 0; i < d.mask.length; i++) {
    if (d.mask[i] && inGrown[i]) changedInside += 1;
    if (inRect[i]) {
      rectPx += 1;
      if (d.mask[i]) rectChanged += 1;
    }
  }
  return {
    inside: d.count ? round(changedInside / d.count, 4) : NaN,
    covered: rectPx ? round(rectChanged / rectPx, 4) : NaN,
    changedPx: d.count,
    rectPx,
  };
}

export function mdTable(headers: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

export function pct(ok: number, n: number): string {
  if (!n) return 'n/a';
  return `${ok}/${n} (${round((100 * ok) / n, 1)}%)`;
}
