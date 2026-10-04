import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

/*
 * A comment that sends the reader to a decision record names a file that is there: two named
 * records that never existed under those names (ADR-060).
 */

const root = fileURLToPath(new URL('../../../', import.meta.url));
const scanned = [
  'apps/desktop/src',
  'apps/desktop/src-tauri/src',
  'apps/desktop/scripts',
  'packages',
];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === 'dist') return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(tsx?|mjs|rs)$/.test(name) ? [path] : [];
  });
}

it('names only decision records that exist', () => {
  const named = scanned
    .flatMap((dir) => sources(join(root, dir)))
    .flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/ADR-\d{3}-[\w-]+\.md/g)].map((m) => ({
        file: relative(root, file),
        record: m[0],
      })),
    );
  expect(named.length).toBeGreaterThan(10);
  const missing = named.filter(({ record }) => !existsSync(join(root, 'docs/adr', record)));
  expect(missing).toEqual([]);
});
