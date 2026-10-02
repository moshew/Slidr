// Dev helper: source above converted, each scaled to a given width, in one PNG.
//   node dev-pair.mjs <dir> <slideId> [width]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
const [dir, id, width = '640'] = process.argv.slice(2);
const W = Number(width);
const imgs = ['source', 'converted'].map((n) => PNG.sync.read(readFileSync(join(dir, `${id}-${n}.png`))));
const f = imgs[0].width / W;
const H = Math.round(imgs[0].height / f);
const out = new PNG({ width: W, height: H * 2 + 4 });
out.data.fill(255);
imgs.forEach((img, n) => {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, c = 0;
    for (let j = 0; j < f; j++) for (let i = 0; i < f; i++) {
      const sx = Math.min(img.width - 1, Math.floor(x * f + i)), sy = Math.min(img.height - 1, Math.floor(y * f + j));
      const s = (sy * img.width + sx) * 4; r += img.data[s]; g += img.data[s + 1]; b += img.data[s + 2]; c++;
    }
    const d = ((n * (H + 4) + y) * W + x) * 4;
    out.data[d] = r / c; out.data[d + 1] = g / c; out.data[d + 2] = b / c; out.data[d + 3] = 255;
  }
});
writeFileSync(join(dir, `${id}-pair.png`), PNG.sync.write(out));
