// Inspection helper: crop the same region out of one or more PNGs, enlarge it with
// nearest-neighbour (so individual pixels stay visible) and put the crops side by side.
//   node src/tools/zoom.mjs <out.png> <x> <y> <w> <h> <factor> <a.png> [b.png ...]
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { decode, encode, crop, hstack } from '../lib/png.mjs';

const [out, x, y, w, h, factor, ...files] = process.argv.slice(2);
const f = Number(factor);
const crops = files.map((file) => {
  const c = crop(decode(fs.readFileSync(file)), Number(x), Number(y), Number(w), Number(h));
  const big = new PNG({ width: c.width * f, height: c.height * f });
  for (let yy = 0; yy < big.height; yy++) {
    for (let xx = 0; xx < big.width; xx++) {
      const si = ((Math.floor(yy / f) * c.width + Math.floor(xx / f)) << 2);
      const di = (yy * big.width + xx) << 2;
      big.data[di] = c.data[si];
      big.data[di + 1] = c.data[si + 1];
      big.data[di + 2] = c.data[si + 2];
      big.data[di + 3] = c.data[si + 3];
    }
  }
  return big;
});
fs.writeFileSync(out, encode(hstack(crops)));
console.log(`wrote ${out}`);
