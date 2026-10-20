import { crc32 } from './zip';

/*
 * A PNG of pixels drawn here, for the few pictures a file needs and the deck has none of: the
 * still of a video that has no poster, the icon of a sound. No canvas is needed, so an export
 * makes them in a test too.
 */

async function zlib(data: Uint8Array): Promise<Uint8Array> {
  const piped = new Blob([data as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A PNG of RGBA pixels, row by row. */
export async function encodePng(
  width: number,
  height: number,
  rgba: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const header = new Uint8Array(13);
  const h = new DataView(header.buffer);
  h.setUint32(0, width);
  h.setUint32(4, height);
  header[8] = 8; // bits per channel
  header[9] = 6; // RGBA
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // no filter
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', await zlib(raw)),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

type Rgb = [number, number, number];

/** A picture of `width` by `height` in which `paint` says the colour and cover of each pixel. */
export function drawPng(
  width: number,
  height: number,
  paint: (x: number, y: number) => { color: Rgb; alpha: number },
): Promise<Uint8Array<ArrayBuffer>> {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { color, alpha } = paint(x + 0.5, y + 0.5);
      const at = (y * width + x) * 4;
      rgba[at] = color[0];
      rgba[at + 1] = color[1];
      rgba[at + 2] = color[2];
      rgba[at + 3] = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
    }
  }
  return encodePng(width, height, rgba);
}

/** Whether a point is inside a triangle. */
function inTriangle(x: number, y: number, a: Rgb, b: Rgb, c: Rgb): boolean {
  const side = (p: Rgb, q: Rgb) => (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
  const d1 = side(a, b);
  const d2 = side(b, c);
  const d3 = side(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

/** The still of a video without a poster: dark, with a play button. */
export function videoStill(): Promise<Uint8Array<ArrayBuffer>> {
  const w = 320;
  const h = 180;
  return drawPng(w, h, (x, y) => {
    const dx = x - w / 2;
    const dy = y - h / 2;
    const r = Math.hypot(dx, dy);
    const play = inTriangle(dx, dy, [-12, -18, 0], [20, 0, 0], [-12, 18, 0]);
    if (play) return { color: [32, 34, 38], alpha: 1 };
    if (r < 36) return { color: [245, 246, 248], alpha: 1 };
    return { color: [32, 34, 38], alpha: 1 };
  });
}

/** The icon of a sound: a speaker and its waves, as PowerPoint shows one. */
export function soundIcon(): Promise<Uint8Array<ArrayBuffer>> {
  const s = 96;
  const ink: Rgb = [64, 72, 84];
  return drawPng(s, s, (x, y) => {
    const box = x >= 14 && x <= 32 && y >= 36 && y <= 60;
    const cone = inTriangle(x, y, [30, 48, 0], [54, 18, 0], [54, 78, 0]);
    const r = Math.hypot(x - 54, y - 48);
    const wave =
      x > 58 && ((r > 14 && r < 20) || (r > 26 && r < 32)) && Math.abs(y - 48) < (x - 54) * 1.2;
    return box || cone || wave ? { color: ink, alpha: 1 } : { color: ink, alpha: 0 };
  });
}
