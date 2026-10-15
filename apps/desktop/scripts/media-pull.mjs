// Copies the published media library (docs/media-library.md) into an author's folder, so it can
// be changed and published again with `pnpm media:publish`:
//
//   pnpm media:pull                 into the folder beside the repository, ../Slidr-media
//   pnpm media:pull --to <dir>      into another folder
//
// A file already there with the published bytes is left as it is; every file is checked against
// the manifest. Nothing is removed from the folder.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishedUrl } from '../build/media.ts';

const args = process.argv.slice(2);
const at = args.indexOf('--to');
const target = resolve(
  at >= 0 ? args[at + 1] : fileURLToPath(new URL('../../../../Slidr-media/', import.meta.url)),
);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const response = await fetch(publishedUrl('manifest.json'));
if (!response.ok) {
  console.error(`The published library has no manifest (${response.status}).`);
  process.exit(1);
}
const manifest = await response.json();
const entries = Object.entries(manifest.files);
let fetched = 0;
let failed = 0;
for (const [path, { sha256: hash }] of entries) {
  const file = join(target, ...path.split('/'));
  if (existsSync(file) && sha256(readFileSync(file)) === hash) continue;
  const answer = await fetch(publishedUrl(path)).catch(() => undefined);
  const bytes = answer?.ok ? Buffer.from(await answer.arrayBuffer()) : undefined;
  if (!bytes || sha256(bytes) !== hash) {
    console.error(`  could not read ${path}`);
    failed += 1;
    continue;
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  fetched += 1;
}
console.log(
  `${entries.length} files published on ${manifest.published}: ${fetched} copied into ${target}, ` +
    `${entries.length - fetched - failed} there already, ${failed} failed.`,
);
process.exit(failed > 0 ? 1 : 0);
