import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { en, he } from './messages';

/*
 * The design-system rules of `src/shell/designRules.test.ts` (DSN-01, SPEC 4.0 rule 7), held
 * over the AI panels: that test lists the folders it scans, and this folder is not on its list
 * yet. The patterns are the same ones; when the shell's list gains `src/ai`, this file can go.
 */

const dir = fileURLToPath(new URL('.', import.meta.url));
const files = readdirSync(dir).filter(
  (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name),
);

function violations(pattern: RegExp): string[] {
  return files.flatMap((file) =>
    readFileSync(join(dir, file), 'utf8')
      .split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => pattern.test(line) && !/^(?:\/\/|\/\*|\*)/.test(line.trim()))
      .map(({ line, i }) => `${file}:${i + 1}: ${line.trim()}`),
  );
}

describe('design rules in the AI panels', () => {
  it('scans the folder', () => {
    expect(files).toContain('Chat.tsx');
  });

  it('has no colour literals', () => {
    expect(violations(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/)).toEqual([]);
  });

  it('has no arbitrary Tailwind values', () => {
    expect(violations(/[\s'"`][a-z-]+-\[[^\]]*[\d#][^\]]*\](?!:)/)).toEqual([]);
  });

  it('has no literal values in inline styles', () => {
    expect(violations(/style=\{\{[^}]*:\s*['"#\d]/)).toEqual([]);
  });

  it('uses no OS controls and no OS tooltips', () => {
    expect(violations(/<select\b|type=["'](?:checkbox|radio|range|color|date)["']/)).toEqual([]);
    expect(violations(/<[a-z][a-z0-9]*\s[^<>]*\btitle=/)).toEqual([]);
  });

  it('uses logical properties, so the layout mirrors', () => {
    expect(
      violations(
        /[\s'"`](?:-?m[lr]|p[lr]|left|right|border-[lr]|rounded-[lr]|text-left|text-right)-/,
      ),
    ).toEqual([]);
  });
});

/** Every leaf of a message tree, as `a.b.c`. */
function keys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('the strings of the AI panels', () => {
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
