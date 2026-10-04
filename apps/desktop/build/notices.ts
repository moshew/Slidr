import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import type { Plugin } from 'vite';

/*
 * The third-party notices that ship with the app (WG13-T05): `THIRD-PARTY-NOTICES.txt`, written
 * into the build's output, so it is inside the app and can be shown from its settings screen.
 *
 * It is made from what the build contains, not from a list kept by hand: every package a module
 * of the bundle came from (libraries, the icon sets, the built-in fonts, the chart library, the
 * font subsetting), and every crate the core links for this platform. A dependency that joins
 * the app joins the file with the next build.
 */

export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.txt';

interface Notice {
  name: string;
  version: string;
  license: string;
  homepage?: string;
  /** The licence and notice files the package carries, as text. */
  texts: string[];
}

interface Manifest {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: { type?: string }[];
  homepage?: string;
  repository?: string | { url?: string };
}

const LICENCE_FILE = /^(licen[cs]e|copying|notice|ofl)(\.|-|$)/i;

function licenceTexts(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => LICENCE_FILE.test(name))
      .sort()
      .map((name) => readFileSync(join(dir, name), 'utf8').replaceAll('\r\n', '\n').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** The package a file of `node_modules` belongs to: the nearest folder with a named manifest. */
function packageOf(file: string): { dir: string; manifest: Manifest } | undefined {
  let dir = dirname(file);
  while (dir.includes(`${sep}node_modules${sep}`)) {
    const path = join(dir, 'package.json');
    if (existsSync(path)) {
      const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
      // A nested manifest that only sets the module type is not the package's own.
      if (manifest.name && manifest.version) return { dir, manifest };
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function licenceOf(manifest: Manifest): string {
  if (typeof manifest.license === 'string') return manifest.license;
  const named = manifest.license?.type ?? manifest.licenses?.map((l) => l.type).join(' OR ');
  return named || 'see the licence text';
}

function homepageOf(manifest: Manifest): string | undefined {
  const repository =
    typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
  return manifest.homepage ?? repository?.replace(/^git\+/, '').replace(/\.git$/, '');
}

/** The packages the modules of a bundle came from. */
export function bundledPackages(moduleIds: Iterable<string>): Notice[] {
  const found = new Map<string, Notice>();
  for (const id of moduleIds) {
    // A module id may carry a query (`?url`) or a virtual-module prefix.
    const file = id.replace(/^\0+/, '').split('?')[0]!.split('/').join(sep);
    if (!file.includes(`${sep}node_modules${sep}`)) continue;
    const owner = packageOf(file);
    if (!owner) continue;
    const { name, version } = owner.manifest;
    const key = `${name}@${version}`;
    if (found.has(key)) continue;
    const homepage = homepageOf(owner.manifest);
    found.set(key, {
      name: name!,
      version: version!,
      license: licenceOf(owner.manifest),
      ...(homepage ? { homepage } : {}),
      texts: licenceTexts(owner.dir),
    });
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

interface CargoPackage {
  name: string;
  version: string;
  license: string | null;
  repository: string | null;
  manifest_path: string;
  source: string | null;
}

/**
 * The crates the core links on this platform, from Cargo itself. Undefined when Cargo cannot be
 * run (a build of the interface alone): the file then says so, instead of listing none.
 */
export function linkedCrates(cwd: string): Notice[] | undefined {
  const run = (args: string[]) =>
    execFileSync('cargo', args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  try {
    // Normal dependencies only: what is compiled into the binary, not build scripts or tests.
    const tree = run([
      'tree',
      '--package',
      'slidr',
      '--edges',
      'normal',
      '--target',
      'x86_64-pc-windows-msvc',
      '--prefix',
      'none',
      '--format',
      '{p}',
    ]);
    const linked = new Set(
      tree
        .split('\n')
        .map((line) => /^(\S+) v(\S+)/.exec(line))
        .filter((match) => match !== null)
        .map((match) => `${match[1]}@${match[2]}`),
    );
    const metadata = JSON.parse(run(['metadata', '--format-version', '1', '--locked'])) as {
      packages: CargoPackage[];
    };
    return metadata.packages
      .filter((crate) => crate.source !== null && linked.has(`${crate.name}@${crate.version}`))
      .map((crate) => ({
        name: crate.name,
        version: crate.version,
        license: crate.license ?? 'see the licence text',
        ...(crate.repository ? { homepage: crate.repository } : {}),
        texts: licenceTexts(dirname(crate.manifest_path)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return undefined;
  }
}

function table(notices: readonly Notice[]): string {
  return notices
    .map(({ name, version, license, homepage }) =>
      [`${name} ${version}`, license, homepage].filter(Boolean).join('  |  '),
    )
    .join('\n');
}

/** The file: who is in the app and under which licence, then every licence text once. */
export function noticesText(
  app: { name: string; version: string },
  packages: readonly Notice[],
  crates: readonly Notice[] | undefined,
): string {
  // One text serves every package that carries the same words.
  const texts = new Map<string, { text: string; users: string[] }>();
  for (const notice of [...packages, ...(crates ?? [])]) {
    for (const text of notice.texts) {
      const key = createHash('sha256').update(text.replace(/\s+/g, ' ')).digest('hex');
      const entry = texts.get(key) ?? { text, users: [] };
      entry.users.push(`${notice.name} ${notice.version}`);
      texts.set(key, entry);
    }
  }
  const rule = '='.repeat(78);
  return [
    `${app.name} ${app.version}: third-party notices`,
    '',
    `${app.name} is built from the software, fonts and icons listed here. Each is used under`,
    'the licence named beside it; the licence texts follow the two lists.',
    '',
    rule,
    `In the interface: libraries, fonts and icons (${packages.length})`,
    rule,
    table(packages),
    '',
    rule,
    crates
      ? `In the core: Rust crates (${crates.length})`
      : 'In the core: Rust crates (not listed: Cargo was not available to this build)',
    rule,
    crates ? table(crates) : '',
    '',
    rule,
    'Licence texts',
    rule,
    ...[...texts.values()].flatMap(({ text, users }) => [
      '',
      `----- ${users.join(', ')} -----`,
      '',
      text,
    ]),
    '',
  ].join('\n');
}

/** Writes the notices of a build into its output. */
export function thirdPartyNotices(options: { app: string; version: string; root: string }): Plugin {
  return {
    name: 'slidr:third-party-notices',
    apply: 'build',
    generateBundle(_options, bundle) {
      const ids = new Set<string>();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type === 'chunk') for (const id of Object.keys(chunk.modules)) ids.add(id);
      }
      // A stylesheet that is imported for its side effect (a font's) is a module of the graph
      // and of no chunk.
      for (const id of this.getModuleIds()) ids.add(id);
      const packages = bundledPackages(ids);
      const crates = linkedCrates(options.root);
      if (!crates) this.warn('Cargo could not be run: the notices list no Rust crates.');
      this.emitFile({
        type: 'asset',
        fileName: NOTICES_FILE,
        source: noticesText({ name: options.app, version: options.version }, packages, crates),
      });
    },
  };
}
