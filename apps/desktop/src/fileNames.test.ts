import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

/*
 * Two modules of one folder are never told apart by the case of their names alone: on Windows
 * `./ThemeLook` and `./themeLook` are one file to the bundler and to the compiler, whichever
 * extension each has. A branch built on Linux brought such a pair in, and the app did not
 * typecheck on Windows (ADR-070). It happened twice before (`gallery.ts` beside `Gallery.tsx`,
 * `welcome.ts` beside `Welcome.tsx`).
 */

const root = fileURLToPath(new URL('../../../', import.meta.url));
const scanned = ['apps/desktop/src', 'apps/desktop/e2e', 'apps/desktop/packaged', 'packages'];
const MODULE = /\.(tsx?|mjs|jsx?)$/;

function clashes(dir: string): string[][] {
  const names = readdirSync(dir).filter((name) => name !== 'node_modules' && name !== 'dist');
  const folders = names.filter((name) => statSync(join(dir, name)).isDirectory());
  const byName = new Map<string, string[]>();
  for (const name of names.filter((n) => MODULE.test(n))) {
    // `a.test.ts` is imported by nobody, and `a.ts` beside `a.tsx` is the same name.
    const key = name.replace(MODULE, '').toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), name]);
  }
  const here = [...byName.values()]
    .filter((group) => new Set(group.map((name) => name.replace(MODULE, ''))).size > 1)
    .map((group) => group.map((name) => relative(root, join(dir, name))));
  return [...here, ...folders.flatMap((name) => clashes(join(dir, name)))];
}

it('has no two modules in a folder whose names differ only in case', () => {
  expect(scanned.flatMap((dir) => clashes(join(root, dir)))).toEqual([]);
});
