/**
 * Whether the webview can draw a picture file, asked of a real browser: the asset store goes by
 * what the bytes say, and calls a file a picture that this engine has no decoder for.
 */
import { expect, it } from 'vitest';
import { canDraw } from './takeIn';

async function canvasFile(type: string): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 48;
  canvas.getContext('2d')!.fillRect(0, 0, 64, 48);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob!), type));
}

it('says yes to the formats the engine draws', async () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
    expect(await canDraw(await canvasFile(type)), type).toBe(true);
  }
});

it('says no to a file the store calls a picture and the engine cannot draw', async () => {
  // A little-endian TIFF header with an IFD that states 640 by 480: a scan.
  const tiff = new Uint8Array([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x01, 0x03, 0x00, 0x01, 0x00,
    0x00, 0x00, 0x80, 0x02, 0x00, 0x00, 0x01, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0xe0, 0x01,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  expect(await canDraw(new Blob([tiff], { type: 'image/tiff' }))).toBe(false);
  // The `ftyp` box of a photo straight from an iPhone.
  const heic = new TextEncoder().encode('\0\0\0\x18ftypheic\0\0\0\0mif1heic\0\0\0\0');
  expect(await canDraw(new Blob([heic], { type: 'image/heic' }))).toBe(false);
  // A file named like a picture with nothing in it, and a picture cut short.
  expect(await canDraw(new Blob([], { type: 'image/png' }))).toBe(false);
  const png = new Uint8Array(await (await canvasFile('image/png')).arrayBuffer());
  expect(await canDraw(new Blob([png.slice(0, 24)], { type: 'image/png' }))).toBe(false);
});
