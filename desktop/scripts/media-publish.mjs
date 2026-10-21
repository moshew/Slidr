// Publishes the media library (docs/media-library.md) from an author's copy, where the app reads it
// while it runs:
//
//   pnpm media:publish                      the copy beside the repository, ../Slidr-media
//   pnpm media:publish --from <dir>         another copy
//   pnpm media:publish --dry-run            say what would change, and no more
//   pnpm media:publish --report <file>      also write what it found to <file>, as JSON
//   pnpm media:publish --site <url>         the library as another site serves it, as a dev server
//                                           of Slidr Library does at http://127.0.0.1:5176/media/
//
// Once the library lives in the bucket of Slidr Library's Worker (its README, "Publishing the
// uploads"; the site says so in every answer), a publication goes through that library's API: it
// sends only the files the author changed since the copy was pulled (`pnpm media:pull`, which
// keeps the manifest it pulled in the copy), each with the hash it was changed from, and the
// library writes them unless it changed one of them meanwhile, as a published upload. Nothing is
// deployed. It needs LIBRARY_KEY, a key of the Worker's LIBRARY_KEYS; --library <url> names
// another library than https://library.slidr.workers.dev. A copy without the manifest it was
// pulled with is published only with --force, as a whole: then every file it has that differs
// from the library's is written.
//
// Before that, the copy is staged as a site and deployed to Cloudflare Pages, as it always was:
//
//   pnpm media:publish --branch preview     a preview deployment, not the published library
//   pnpm media:publish --out <dir>          stage the site there (with --dry-run, a library of
//                                           your own, served by any static server)
//
// with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment; wrangler is run
// through npx at a fixed version.
//
// The report is written once the changes are known, before anything below can stop the
// publication: the files and bytes staged, the paths added, changed and removed, and `blocked`,
// the reason it stops without --force (else null). A publication that would leave the library
// empty, or take away most of it, stops unless --force is given: a copy that is not all there
// (another machine, a folder not yet pulled) would otherwise empty the app's library.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changes, libraryFiles, manifestOf, publishedUrl, stageLibrary } from '../build/media.ts';
import {
  BASE_FILE,
  LIBRARY_URL,
  LIVE_HEADER,
  authorChanges,
  nextBase,
  summary,
} from '../build/mediaApi.ts';

const PROJECT = 'slidr-media';
const WRANGLER = 'wrangler@4.151.0';

const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const flag = (name) => args.includes(name);

const source = resolve(
  option('--from') ?? fileURLToPath(new URL('../../../Slidr-media/', import.meta.url)),
);
const branch = option('--branch') ?? 'main';
// The site the library is read at: the published one, unless named (a dev server of the library).
const site = option('--site');
const siteUrl = (path) => (site ? publishedUrl(path, site) : publishedUrl(path));

if (!existsSync(source)) {
  console.error(`There is no media library at ${source}. Name one with --from <dir>.`);
  process.exit(1);
}

// What is published now, and where: from the bucket of the library's Worker, or a Pages site.
const answer = await fetch(siteUrl('manifest.json'), {
  headers: { 'Cache-Control': 'no-cache' },
}).catch(() => undefined);
const live = answer?.headers.get(LIVE_HEADER) === 'live' && branch === 'main';
const before = answer?.ok ? await answer.json().catch(() => undefined) : undefined;
const published = Object.keys(before?.files ?? {}).length;

/** Writes the report, when one was asked for. */
function report(found) {
  const file = option('--report');
  if (!file) return;
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(
    resolve(file),
    `${JSON.stringify({ ...found, dryRun: flag('--dry-run') }, null, 2)}\n`,
  );
  console.log(`Report written to ${resolve(file)}`);
}

function list({ added, changed, removed }) {
  for (const [sign, paths] of [
    ['+', added],
    ['~', changed],
    ['-', removed],
  ]) {
    for (const path of paths.slice(0, 20)) console.log(`  ${sign} ${path}`);
    if (paths.length > 20) console.log(`  … and ${paths.length - 20} more`);
  }
}

// From here on the script sets its exit code and ends rather than calling process.exit(): after
// a fetch, process.exit() aborts Node 24 on Windows while the connection is closing
// ("Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)", exit code 0xC0000409).
process.exitCode = live && !option('--out') ? await throughTheApi() : toPages();

/* ---------------------------------------------------------------- through the library's API */

async function throughTheApi() {
  const files = libraryFiles(source);
  const copy = manifestOf(files, new Date().toISOString());
  const baseFile = join(source, BASE_FILE);
  const pulled = existsSync(baseFile) ? JSON.parse(readFileSync(baseFile, 'utf8')) : undefined;
  const base = pulled ?? before ?? { version: 1, published: '', files: {} };
  const changed = authorChanges(base, copy);
  const found = summary(changed);
  console.log(
    `The library is published through ${option('--library') ?? LIBRARY_URL}. Against the copy as it was pulled` +
      `${pulled ? ` (${pulled.published})` : ' (unknown: the library as it is now)'}: ` +
      `${found.added.length} added, ${found.changed.length} changed, ${found.removed.length} removed.`,
  );
  list(found);
  const blocked = flag('--force')
    ? null
    : !pulled
      ? `${source} has no ${BASE_FILE}: it was not pulled, so what its author changed is not known. Run pnpm media:pull first, which puts the published bytes back over every file that differs, and make the changes after it; or publish the whole copy with --force.`
      : Object.keys(copy.files).length === 0
        ? `${source} holds no files of the library. Nothing is published.`
        : found.removed.length > published / 2
          ? `This would take away ${found.removed.length} of the ${published} published files. Nothing is published; --force publishes it as it is.`
          : null;
  report({
    source,
    through: 'api',
    files: Object.keys(copy.files).length,
    before: published,
    ...found,
    blocked,
  });
  if (blocked) {
    console.error(blocked);
    return 1;
  }
  if (Object.keys(changed).length === 0) {
    console.log('Nothing to publish.');
    return 0;
  }
  if (flag('--dry-run')) {
    console.log('Dry run: nothing is published.');
    return 0;
  }
  const key = process.env.LIBRARY_KEY;
  if (!key) {
    console.error('LIBRARY_KEY is not set: a key of the library Worker’s LIBRARY_KEYS.');
    return 1;
  }
  const library = (option('--library') ?? LIBRARY_URL).replace(/\/+$/, '');
  const auth = { Authorization: `Bearer ${key}` };

  // Each file to be written goes first, by its hash; one the library has already, as it is, not.
  const sending = Object.entries(changed).filter(
    ([path, change]) => change.to && before?.files?.[path]?.sha256 !== change.to.sha256,
  );
  let sent = 0;
  for (let at = 0; at < sending.length; at += 4) {
    const failed = await Promise.all(
      sending.slice(at, at + 4).map(async ([path, change]) => {
        const response = await fetch(`${library}/api/library/staged/${change.to.sha256}`, {
          method: 'PUT',
          headers: { ...auth, 'Content-Type': 'application/octet-stream' },
          body: files.get(path),
        }).catch((error) => ({ ok: false, status: String(error) }));
        if (response.ok) return undefined;
        return `${path}: ${response.status} ${(await response.text?.().catch(() => '')) ?? ''}`;
      }),
    );
    for (const failure of failed.filter(Boolean)) console.error(`  ${failure}`);
    if (failed.some(Boolean)) return 1;
    sent += Math.min(4, sending.length - at);
  }
  if (sent > 0) console.log(`Sent ${sent} files.`);

  const response = await fetch(`${library}/api/library/files`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: changed }),
  });
  const done = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`${response.status} ${done.error ?? ''}: ${done.message ?? response.statusText}`);
    for (const issue of done.issues ?? []) console.error(`  ${issue.path}`);
    return 1;
  }
  console.log(
    `Published ${done.published}: ${done.added.length} added, ${done.changed.length} changed, ` +
      `${done.removed.length} removed, ${done.same.length} as the library had them.`,
  );
  // What the copy now holds as the library holds it: the base of the next publication.
  const now = await fetch(siteUrl('manifest.json'), { headers: { 'Cache-Control': 'no-cache' } })
    .then((one) => (one.ok ? one.json() : undefined))
    .catch(() => undefined);
  if (now?.files) {
    writeFileSync(baseFile, `${JSON.stringify(nextBase(base, copy, now), null, 2)}\n`);
  } else {
    console.warn(
      `The manifest could not be read back: run pnpm media:pull before the next publication.`,
    );
  }
  return 0;
}

/* ---------------------------------------------------------------- to Cloudflare Pages */

function toPages() {
  if (live && option('--out')) {
    console.log(
      'The library is published through its API: this stages a site of the copy, and deploys nothing.',
    );
  }
  const target = resolve(option('--out') ?? join(tmpdir(), 'slidr-media-site'));
  const manifest = stageLibrary(source, target);
  const paths = Object.keys(manifest.files);
  const bytes = Object.values(manifest.files).reduce((sum, file) => sum + file.size, 0);
  console.log(`Staged ${paths.length} files (${(bytes / 1024 / 1024).toFixed(1)} MB) in ${target}`);

  const found = changes(before, manifest);
  console.log(
    `Against the published library: ${found.added.length} added, ${found.changed.length} changed, ${found.removed.length} removed.`,
  );
  list(found);

  const blocked =
    flag('--force') || (paths.length > 0 && found.removed.length <= published / 2)
      ? null
      : paths.length === 0
        ? `${source} holds no files of the library. Nothing is published; --force publishes an empty library.`
        : `This would take away ${found.removed.length} of the ${published} published files. Nothing is published; --force publishes it as it is.`;
  report({
    source,
    target,
    files: paths.length,
    bytes,
    published: manifest.published,
    before: published,
    ...found,
    blocked,
  });

  if (blocked) {
    console.error(blocked);
    return 1;
  }
  if (flag('--dry-run') || live) {
    console.log('Dry run: nothing is published.');
    return 0;
  }

  for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (!process.env[name]) {
      console.error(`${name} is not set: Cloudflare cannot be reached.`);
      return 1;
    }
  }

  // npx is a script on Windows, which only a shell runs; the shell takes the words apart again.
  const windows = process.platform === 'win32';
  const quoted = (arg) =>
    windows && /[\s"&|<>^]/.test(arg) ? `"${arg.replaceAll('"', '""')}"` : arg;
  const deploy = spawnSync(
    'npx',
    [
      '--yes',
      WRANGLER,
      'pages',
      'deploy',
      target,
      '--project-name',
      PROJECT,
      '--branch',
      branch,
      '--commit-dirty=true',
      '--commit-message',
      `Media library ${manifest.published}`,
    ].map(quoted),
    { stdio: 'inherit', shell: windows },
  );
  return deploy.status ?? 1;
}
