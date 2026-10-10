// The pixel sizes of the pictures of Elements → Designs, written beside them:
//   node scripts/design-asset-sizes.mjs
// A design is drawn in the gallery from its bundled file, before any deck has imported it, and
// a picture that is cropped (one face of a sheet of four) can only be drawn from a record that
// knows its size. `designs.test.ts` fails when a picture and this table disagree: run this again
// after adding or replacing a picture.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const assetsDir = fileURLToPath(new URL('../../../../Slidr-media/images/designs/', import.meta.url));
export const sizesFile = join(assetsDir, 'sizes.json');

/** The width and height of a WebP file, read from its header. */
export function webpSize(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP') {
    throw new Error('not a WebP file');
  }
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
  }
  if (chunk === 'VP8 ') {
    return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  }
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)];
  }
  throw new Error(`unknown WebP chunk "${chunk}"`);
}

/** Every picture of the folder by its name without `.webp`, in the order of the names. */
export function measure() {
  return Object.fromEntries(
    readdirSync(assetsDir)
      .filter((name) => name.endsWith('.webp'))
      .sort()
      .map((name) => [name.slice(0, -5), webpSize(readFileSync(join(assetsDir, name)))]),
  );
}

const run = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// `--check` writes nothing: it fails when the table is not what the pictures measure.
if (run && process.argv.includes('--check')) {
  const table = JSON.parse(readFileSync(sizesFile, 'utf8'));
  const sizes = measure();
  const wrong = [...new Set([...Object.keys(table), ...Object.keys(sizes)])].filter(
    (name) => String(table[name]) !== String(sizes[name]),
  );
  if (wrong.length) {
    console.error(
      `sizes.json is stale for: ${wrong.join(', ')}. Run scripts/design-asset-sizes.mjs`,
    );
    process.exit(1);
  }
} else if (run) {
  const sizes = measure();
  const rows = Object.entries(sizes).map(
    ([name, size]) => `  ${JSON.stringify(name)}: [${size.join(', ')}]`,
  );
  writeFileSync(sizesFile, `{\n${rows.join(',\n')}\n}\n`);
  console.log(`${rows.length} pictures measured: ${sizesFile}`);
}
