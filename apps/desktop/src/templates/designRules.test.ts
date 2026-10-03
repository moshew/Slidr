import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The design-system rules of `src/shell/designRules.test.ts`, over the templates area: colours,
 * sizes and radii from tokens only, no OS control, logical properties. That test lists the
 * folders it scans and belongs to the shell; when this folder is added to its list, this file
 * can go.
 */

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const dir = join(root, 'apps/desktop/src/templates');

/** The panel's own sources: what draws app UI. Tests and data modules are not scanned. */
const files = readdirSync(dir)
  .map((name) => join(dir, name))
  .filter((path) => statSync(path).isFile() && /\.tsx$/.test(path) && !/\.test\.tsx$/.test(path));

function violations(pattern: RegExp): string[] {
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => pattern.test(line) && !/^(?:\/\/|\/\*|\*)/.test(line.trim()))
      .map(({ line, i }) => `${relative(root, file)}:${i + 1}: ${line.trim()}`),
  );
}

describe('design rules of the templates area', () => {
  it('scans the panel', () => {
    expect(files.map((file) => relative(dir, file))).toContain('TemplatesPanel.tsx');
  });

  it('has no colour literals in components', () => {
    expect(violations(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/)).toEqual([]);
  });

  it('has no arbitrary Tailwind values (a size, colour or radius that is not a token)', () => {
    expect(violations(/[\s'"`][a-z-]+-\[[^\]]*[\d#][^\]]*\](?!:)/)).toEqual([]);
  });

  it('has no literal values in inline styles', () => {
    expect(violations(/style=\{\{[^}]*:\s*['"#\d]/)).toEqual([]);
  });

  it('uses no OS controls: select, native checkbox, radio, range or colour inputs', () => {
    expect(violations(/<select\b|type=["'](?:checkbox|radio|range|color|date)["']/)).toEqual([]);
  });

  it('uses no OS tooltips (the title attribute on an element)', () => {
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
