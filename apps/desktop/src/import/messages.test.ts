import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en, he } from './messages';

/*
 * The strings of the import panel. The design-system rules over the panel are the shell's
 * (`src/shell/designRules.test.ts` scans every folder of the app).
 */

const dir = fileURLToPath(new URL('.', import.meta.url));
/** The panel's sources, which ask for the strings. */
const files = readdirSync(dir).filter(
  (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name),
);

/** Every leaf of a message tree, as `a.b.c`. */
function keys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('the strings of the import panel', () => {
  it('exist in both languages, with the same placeholders', () => {
    expect(keys(en)).toEqual(keys(he));
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();
    const read = (tree: object, path: string) =>
      path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], tree);
    for (const key of keys(he)) {
      expect(placeholders(read(en, key) as string), key).toEqual(
        placeholders(read(he, key) as string),
      );
    }
  });

  it('are all there for every static key the components ask for', () => {
    const known = new Set(keys(he));
    const asked = files.flatMap((file) =>
      [...readFileSync(join(dir, file), 'utf8').matchAll(/\bt\('([\w.]+)'/g)].map((m) => m[1]!),
    );
    expect(asked.length).toBeGreaterThan(20);
    expect(asked.filter((key) => !known.has(key))).toEqual([]);
  });
});
