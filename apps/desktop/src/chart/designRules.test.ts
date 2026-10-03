import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The design-system rules of `shell/designRules.test.ts` (DSN-01, SPEC 4.0 rule 7), over the
 * chart area: its UI is built from the tokens and the components of `@slidr/ui` only. That test
 * lists the folders it scans and belongs to the shell; this one keeps the same rules for this
 * folder, as `table/designRules.test.ts` does for the table area. Nothing here is exempt: the
 * chart itself is drawn by the renderer, and this folder draws only the app's chrome.
 */

const dir = fileURLToPath(new URL('.', import.meta.url));

const files = readdirSync(dir).filter(
  (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name),
);

function violations(pattern: RegExp): string[] {
  return files.flatMap((name) =>
    readFileSync(join(dir, name), 'utf8')
      .split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => pattern.test(line) && !/^(?:\/\/|\/\*|\*)/.test(line.trim()))
      .map(({ line, i }) => `${name}:${i + 1}: ${line.trim()}`),
  );
}

describe('design rules of the chart area', () => {
  it('scans the chart tools', () => {
    expect(files).toEqual(
      expect.arrayContaining(['tools.tsx', 'DataEditor.tsx', 'ChartInsert.tsx', 'icons.ts']),
    );
  });

  it('has no colour literals', () => {
    expect(violations(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/)).toEqual([]);
  });

  it('has no arbitrary Tailwind values (a size, colour or radius that is not a token)', () => {
    expect(violations(/[\s'"`][a-z-]+-\[[^\]]*[\d#][^\]]*\](?!:)/)).toEqual([]);
  });

  it('has no literal values in inline styles', () => {
    expect(violations(/style=\{\{[^}]*:\s*['"#\d]/)).toEqual([]);
  });

  it('uses no OS controls and no OS tooltips', () => {
    expect(violations(/<select\b|type=["'](?:checkbox|radio|range|color|date)["']/)).toEqual([]);
    expect(violations(/<[a-z][a-z0-9]*\s[^<>]*\btitle=/)).toEqual([]);
  });

  it('uses logical properties, so the layout mirrors (ml/mr/pl/pr/left/right)', () => {
    expect(
      violations(
        /[\s'"`](?:-?m[lr]|p[lr]|left|right|border-[lr]|rounded-[lr]|text-left|text-right)-/,
      ),
    ).toEqual([]);
  });
});
