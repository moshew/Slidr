// Copies the published media library (docs/media-library.md) into an author's folder, so it can
// be changed and published again with `pnpm media:publish`:
//
//   pnpm media:pull                 into the folder beside the repository, ../Slidr-media
//   pnpm media:pull --to <dir>      into another folder
//   pnpm media:pull --site <url>    from another site than the published library
//
// A file already there with the published bytes is left as it is; every file is checked against
// the manifest. Nothing is removed from the folder. Once every file is there, the manifest pulled is
// kept in the folder (.published-manifest.json): `pnpm media:publish` sends the library only the
// files changed since, so it never writes over what was published meanwhile (an upload).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishedUrl } from '../build/media.ts';
import { BASE_FILE } from '../build/mediaApi.ts';

const args = process.argv.slice(2);
const at = args.indexOf('--to');
const target = resolve(
  at >= 0 ? args[at + 1] : fileURLToPath(new URL('../../../Slidr-media/', import.meta.url)),
);

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const from = args.indexOf('--site');
const site = from >= 0 ? args[from + 1] : undefined;
const siteUrl = (path) => (site ? publishedUrl(path, site) : publishedUrl(path));

const response = await fetch(siteUrl('manifest.json'), {
  headers: { 'Cache-Control': 'no-cache' },
});
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
  const answer = await fetch(siteUrl(path)).catch(() => undefined);
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
if (failed === 0)
  writeFileSync(
    join(target, BASE_FILE),
    `${JSON.stringify(manifest, null, 2)}
`,
  );
console.log(
  `${entries.length} files published on ${manifest.published}: ${fetched} copied into ${target}, ` +
    `${entries.length - fetched - failed} there already, ${failed} failed.`,
);
// Not process.exit(): after a fetch it aborts Node 24 on Windows (media-publish.mjs).
process.exitCode = failed > 0 ? 1 : 0;
