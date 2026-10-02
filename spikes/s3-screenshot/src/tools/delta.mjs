// Inspection helper: where and how large are the channel differences between two PNGs?
//   node src/tools/delta.mjs a.png b.png [out-amplified.png]
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { decode, encode } from '../lib/png.mjs';

const [fa, fb, out] = process.argv.slice(2);
const a = decode(fs.readFileSync(fa));
const b = decode(fs.readFileSync(fb));
if (a.width !== b.width || a.height !== b.height) throw new Error('size mismatch');
const hist = new Array(8).fill(0); // 0, 1-2, 3-4, 5-8, 9-16, 17-32, 33-64, 65+
const bucket = (d) => (d === 0 ? 0 : d <= 2 ? 1 : d <= 4 ? 2 : d <= 8 ? 3 : d <= 16 ? 4 : d <= 32 ? 5 : d <= 64 ? 6 : 7);
const amp = new PNG({ width: a.width, height: a.height });
const grid = 8;
const cells = Array.from({ length: grid }, () => new Array(grid).fill(0));
for (let y = 0; y < a.height; y++) {
  for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4;
    const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
    hist[bucket(d)]++;
    if (d > 8) cells[Math.floor((y * grid) / a.height)][Math.floor((x * grid) / a.width)]++;
    for (let c = 0; c < 3; c++) amp.data[i + c] = Math.min(255, Math.abs(a.data[i + c] - b.data[i + c]) * 8);
    amp.data[i + 3] = 255;
  }
}
const total = a.width * a.height;
const names = ['0', '1-2', '3-4', '5-8', '9-16', '17-32', '33-64', '65+'];
console.log('max channel delta histogram (% of pixels):');
hist.forEach((n, i) => console.log(`  ${names[i].padStart(6)}: ${((100 * n) / total).toFixed(3)}%`));
console.log(`pixels with delta > 8, per ${grid}x${grid} grid cell (rows top to bottom):`);
for (const row of cells) console.log('  ' + row.map((n) => String(n).padStart(6)).join(' '));
if (out) {
  fs.writeFileSync(out, encode(amp));
  console.log(`wrote ${out} (differences x8)`);
}
