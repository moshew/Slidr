// The pictures of the reference decks as the asset records a template carries: id (the sha256
// of the file), size and dimensions. The samples and app read these from media.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const target = fileURLToPath(new URL('../../../../Slidr-media/templates/catalog.json', import.meta.url));

/** Width and height of a WebP file, from its first chunk. */
function webpSize(bytes) {
  const kind = bytes.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  if (kind === 'VP8X') return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
  throw new Error(`not a WebP chunk: ${kind}`);
}

export function writePictures() {
  const dir = fileURLToPath(new URL('../../../../Slidr-media/images/templates/', import.meta.url));
  const entries = readdirSync(dir)
    .filter((file) => file.endsWith('.webp'))
    .sort()
    .map((file) => {
      const bytes = readFileSync(join(dir, file));
      const id = createHash('sha256').update(bytes).digest('hex');
      const [width, height] = webpSize(bytes);
      const key = file.replace(/\.webp$/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
      return [
        key,
        {
          id,
          file: `${id}.webp`,
          mime: 'image/webp',
          kind: 'image',
          bytes: bytes.length,
          width,
          height,
          origin: 'ai',
          name: file,
        },
      ];
    });
  const catalog = JSON.parse(readFileSync(target, 'utf8'));
  const before = JSON.stringify(catalog);
  catalog.pictures = Object.fromEntries(entries);
  const out = JSON.stringify(catalog);
  if (before !== out) writeFileSync(target, out);
  return `media pictures: ${entries.length} pictures${before === out ? ', up to date' : ', written'}`;
}
