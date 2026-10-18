// Starts a release of Slidr: tags the version and pushes the tag, which runs
// .github/workflows/release.yml (the installer, its signatures, a draft GitHub release).
//
//   node release.mjs              releases the version the app has now
//   node release.mjs --bump       raises it by 0.1.0 first (0.1.0 → 0.2.0), in a commit of its own
//   node release.mjs --dry-run    says what it would do, and does nothing
//
// The version is in three files, and they must agree: apps/desktop/package.json,
// apps/desktop/src-tauri/tauri.conf.json and apps/desktop/src-tauri/Cargo.toml (and Cargo.lock
// with it). The release is made from `main` as it is on GitHub, so the tree must be clean and
// level with origin/main: commit what belongs in the release first.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const bump = args.includes('--bump');
const dryRun = args.includes('--dry-run');
const unknown = args.filter((arg) => !['--bump', '--dry-run'].includes(arg));
if (unknown.length > 0) fail(`Unknown option: ${unknown.join(' ')}`);

const FILES = {
  package: 'apps/desktop/package.json',
  tauri: 'apps/desktop/src-tauri/tauri.conf.json',
  cargo: 'apps/desktop/src-tauri/Cargo.toml',
  lock: 'Cargo.lock',
};

function fail(message) {
  console.error(`release: ${message}`);
  process.exit(1);
}

function git(...rest) {
  return execFileSync('git', rest, { encoding: 'utf8' }).trim();
}

function run(...rest) {
  console.log(`  git ${rest.join(' ')}`);
  if (!dryRun) execFileSync('git', rest, { stdio: 'inherit' });
}

const read = (file) => readFileSync(file, 'utf8');

/** Replaces the one match of `pattern` in `file` with `version`, between the groups around it. */
function setVersion(file, pattern, version) {
  const text = read(file);
  if (!pattern.test(text)) fail(`No version found in ${file}`);
  if (!dryRun) writeFileSync(file, text.replace(pattern, `$1${version}$2`));
}

const CARGO = /^(version = ")[^"]+(")/m;
const LOCK = /(\[\[package\]\]\nname = "slidr"\nversion = ")[^"]+(")/;
const JSON_VERSION = /^(\s*"version": ")[^"]+(")/m;

// The three files agree.
const versions = {
  [FILES.package]: JSON.parse(read(FILES.package)).version,
  [FILES.tauri]: JSON.parse(read(FILES.tauri)).version,
  [FILES.cargo]: read(FILES.cargo).match(CARGO)?.[0].split('"')[1],
};
const current = versions[FILES.package];
if (Object.values(versions).some((version) => version !== current)) {
  fail(
    `The versions differ:\n${Object.entries(versions)
      .map(([file, version]) => `  ${file}: ${version}`)
      .join('\n')}`,
  );
}
const parts = current.split('.').map(Number);
if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) {
  fail(`Not a version of three numbers: ${current}`);
}

// On main, clean, level with GitHub.
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') fail(`On ${branch}; a release is made from main`);
if (git('status', '--porcelain') !== '') {
  fail('The tree has changes that are not committed. Commit or stash them first.');
}
git('fetch', '--quiet', '--tags', 'origin', 'main');
const [behind, ahead] = git('rev-list', '--left-right', '--count', 'origin/main...HEAD')
  .split(/\s+/)
  .map(Number);
if (behind > 0) fail(`main is ${behind} commit(s) behind origin/main. Pull first.`);

const version = bump ? `${parts[0]}.${parts[1] + 1}.0` : current;
const tag = `v${version}`;
if (git('tag', '--list', tag) !== '') fail(`The tag ${tag} exists already`);
if (git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`) !== '') {
  fail(`The tag ${tag} exists on GitHub already`);
}

console.log(
  `${dryRun ? 'Would release' : 'Releasing'} Slidr ${version}` +
    (bump ? ` (from ${current})` : '') +
    (ahead > 0 ? `, with ${ahead} commit(s) not yet on GitHub` : ''),
);

if (bump) {
  console.log(`  version ${current} → ${version} in ${Object.values(FILES).join(', ')}`);
  setVersion(FILES.package, JSON_VERSION, version);
  setVersion(FILES.tauri, JSON_VERSION, version);
  setVersion(FILES.cargo, CARGO, version);
  setVersion(FILES.lock, LOCK, version);
  run('add', ...Object.values(FILES));
  run('commit', '-m', `release: Slidr ${version}`);
}
run('tag', '-a', tag, '-m', `Slidr ${version}`);
run('push', '--atomic', 'origin', 'main', tag);

console.log(
  dryRun
    ? 'Nothing was changed.'
    : `Pushed ${tag}. The build runs in GitHub Actions; publish the draft release when it is ready:\n` +
        '  https://github.com/moshew/Slidr/releases',
);
