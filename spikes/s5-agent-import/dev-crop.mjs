// Dev helper: crop a region out of several PNGs, enlarge it, and stack the crops into one image.
//   node dev-crop.mjs <out.png> <x> <y> <w> <h> <zoom> <in1.png> [in2.png ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const [out, x, y, w, h, zoom, ...inputs] = process.argv.slice(2);
const [X, Y, Wd, Ht, Z] = [x, y, w, h, zoom].map(Number);
const result = new PNG({ width: Wd * Z, height: (Ht * Z + 6) * inputs.length });
result.data.fill(255);
inputs.forEach((file, n) => {
  const img = PNG.sync.read(readFileSync(file));
  for (let j = 0; j < Ht * Z; j++) for (let i = 0; i < Wd * Z; i++) {
    const sx = X + Math.floor(i / Z), sy = Y + Math.floor(j / Z);
    if (sx >= img.width || sy >= img.height) continue;
    const s = (sy * img.width + sx) * 4, d = ((n * (Ht * Z + 6) + j) * result.width + i) * 4;
    img.data.copy(result.data, d, s, s + 4);
  }
});
writeFileSync(out, PNG.sync.write(result));
