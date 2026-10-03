// Builds the two third-party decks of the import test set into <repo>/examples/ (git-ignored,
// because the output embeds third-party code):
//
//   reveal-demo.html   reveal-demo.src.html with reveal.js, its CSS and its theme inlined
//   marp-demo.html     Marp CLI's HTML export (bespoke template) of marp-demo.md
//
//   node apps/desktop/e2e/import-set/third-party/build.mjs [--packages DIR]
//
// DIR is a folder whose node_modules holds reveal.js and @marp-team/marp-cli. Without --packages
// the script installs the pinned versions with npm into a folder under the system temp directory.
// Nothing is added to a package.json of this repository.
/* global process, console, Buffer */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REVEAL_VERSION = '6.0.2';
const MARP_CLI_VERSION = '4.5.1';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '../../../../../examples');

function packagesDir() {
  const at = process.argv.indexOf('--packages');
  if (at !== -1) return resolve(process.argv[at + 1]);
  const dir = join(tmpdir(), 'slidr-import-set');
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, 'package.json')))
    writeFileSync(join(dir, 'package.json'), '{ "private": true }\n');
  execSync(
    `npm install --no-audit --no-fund reveal.js@${REVEAL_VERSION} @marp-team/marp-cli@${MARP_CLI_VERSION}`,
    {
      cwd: dir,
      stdio: 'inherit',
    },
  );
  return dir;
}

const versionOf = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;

/** Addresses the page would fetch from the network: there must be none. */
function externalResources(html) {
  const patterns = [
    /(?:src|href|poster|action)\s*=\s*["']?\s*(?:https?:)?\/\/[^"'\s>]+/gi,
    /url\(\s*["']?\s*(?:https?:)?\/\/[^)]+\)/gi,
    /@import\s+(?:url\()?\s*["'][^"']+["']/gi,
  ];
  return patterns.flatMap((p) => html.match(p) ?? []);
}

function write(name, html) {
  const found = externalResources(html);
  if (found.length)
    throw new Error(`${name} refers to external resources:\n  ${found.join('\n  ')}`);
  const file = join(outDir, name);
  writeFileSync(file, html, 'utf8');
  console.log(`${file}: ${Buffer.byteLength(html)} bytes`);
}

const packages = packagesDir();
mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------------------------------------
// reveal.js: put every dist/ file the source links to inside the page.
// ---------------------------------------------------------------------------------------------
{
  const root = join(packages, 'node_modules/reveal.js');
  const version = versionOf(root);
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const html = readFileSync(join(here, 'reveal-demo.src.html'), 'utf8')
    .replace(
      /<link rel="stylesheet" href="(dist\/[^"]+)"\s*\/>/g,
      (_, path) =>
        `<style>\n/* reveal.js ${version}: ${path} */\n${read(path).replace(/<\/style/gi, '<\\/style')}\n</style>`,
    )
    .replace(
      /<script src="(dist\/[^"]+)"><\/script>/g,
      (_, path) =>
        `<script>\n/* reveal.js ${version}: ${path} */\n${read(path).replace(/<\/script/gi, '<\\/script')}\n</script>`,
    )
    .replace(
      '<!DOCTYPE html>',
      `<!DOCTYPE html>\n<!-- Built from reveal-demo.src.html with reveal.js ${version} (MIT license, copyright Hakim El Hattab). -->`,
    );
  if (/(?:href|src)="dist\//.test(html))
    throw new Error('reveal-demo.src.html still links to a dist/ file');
  write('reveal-demo.html', html);
  console.log(`reveal.js ${version}`);
}

// ---------------------------------------------------------------------------------------------
// Marp: the CLI's default HTML export is one self-contained file.
// ---------------------------------------------------------------------------------------------
{
  const root = join(packages, 'node_modules/@marp-team/marp-cli');
  const target = join(outDir, 'marp-demo.html');
  execFileSync(
    process.execPath,
    [join(root, 'marp-cli.js'), join(here, 'marp-demo.md'), '--no-stdin', '-o', target],
    {
      stdio: 'inherit',
    },
  );
  write('marp-demo.html', readFileSync(target, 'utf8'));
  console.log(
    `Marp CLI ${versionOf(root)}, Marp Core ${versionOf(join(packages, 'node_modules/@marp-team/marp-core'))}`,
  );
}
