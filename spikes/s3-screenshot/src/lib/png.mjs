// PNG helpers: decode, compare (pixelmatch), crop, and stack evidence images.
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const decode = (buf) => PNG.sync.read(buf);
export const encode = (png) => PNG.sync.write(png);

/**
 * Compare two same-size PNGs.
 * - pm: percent of pixels pixelmatch reports as different (threshold 0.1, anti-aliased pixels excluded)
 * - pmAA: same threshold but anti-aliased pixels counted
 * - hard: percent of pixels where some channel differs by more than 32/255 (a plain, non-perceptual count)
 * - mae: mean absolute channel error over RGB, 0..255
 */
export function compare(a, b, region) {
  if (a.width !== b.width || a.height !== b.height) {
    return { sizeMismatch: `${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  if (region) {
    a = crop(a, region.x, region.y, region.w, region.h);
    b = crop(b, region.x, region.y, region.w, region.h);
  }
  const { width, height } = a;
  const total = width * height;
  const diff = new PNG({ width, height });
  const n = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 });
  const nAA = pixelmatch(a.data, b.data, null, width, height, { threshold: 0.1, includeAA: true });
  let hard = 0;
  let sum = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    sum += dr + dg + db;
    if (dr > 32 || dg > 32 || db > 32) hard++;
  }
  return {
    pm: (100 * n) / total,
    pmAA: (100 * nAA) / total,
    hard: (100 * hard) / total,
    mae: sum / (total * 3),
    diff,
  };
}

export function crop(png, x, y, w, h) {
  x = Math.max(0, Math.round(x));
  y = Math.max(0, Math.round(y));
  w = Math.min(png.width - x, Math.round(w));
  h = Math.min(png.height - y, Math.round(h));
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, x, y, w, h, 0, 0);
  return out;
}

/** Halve an image with a 2x2 box filter (used to tell re-rasterising from bitmap scaling). */
export function box2(png) {
  const w = png.width >> 1;
  const h = png.height >> 1;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        const i = (y * 2 * png.width + x * 2) * 4 + c;
        const j = i + png.width * 4;
        out.data[(y * w + x) * 4 + c] = (png.data[i] + png.data[i + 4] + png.data[j] + png.data[j + 4] + 2) >> 2;
      }
    }
  }
  return out;
}

/** Put images side by side (left to right) on a mid-grey background. */
export function hstack(pngs, gap = 12, pad = 12) {
  const width = pngs.reduce((s, p) => s + p.width, 0) + gap * (pngs.length - 1) + pad * 2;
  const height = Math.max(...pngs.map((p) => p.height)) + pad * 2;
  const out = new PNG({ width, height });
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 96;
    out.data[i + 1] = 96;
    out.data[i + 2] = 96;
    out.data[i + 3] = 255;
  }
  let x = pad;
  for (const p of pngs) {
    PNG.bitblt(p, out, 0, 0, p.width, p.height, x, pad);
    x += p.width + gap;
  }
  return out;
}

/** Fraction of pixels that are not (near) one flat colour: a cheap "is it blank" test. */
export function nonBlankPct(png) {
  const d = png.data;
  const r0 = d[0];
  const g0 = d[1];
  const b0 = d[2];
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i] - r0) > 6 || Math.abs(d[i + 1] - g0) > 6 || Math.abs(d[i + 2] - b0) > 6) n++;
  }
  return (100 * n) / (png.width * png.height);
}
