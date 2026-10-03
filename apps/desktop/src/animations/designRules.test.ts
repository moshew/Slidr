import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The design-system rules of `src/shell/designRules.test.ts`, over the three areas of present
 * mode, animations and export: colours, sizes and radii from tokens only, no OS control, logical
 * properties. That test lists the folders it scans and belongs to the shell; when these three
 * are added to its list, this file can go.
 *
 * Exempt, like `src/stage`: the show itself, which draws on the screen in the slide's own terms
 * (black around the slide).
 */

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const scanned = [
  'apps/desktop/src/animations',
  'apps/desktop/src/present',
  'apps/desktop/src/export',
].filter((dir) => existsSync(join(root, dir)));

const onScreen = new Set(['apps/desktop/src/present/Show.tsx']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const posix = (file: string) => relative(root, file).replaceAll('\\', '/');

const files = scanned
  .flatMap((dir) => sources(join(root, dir)))
  .filter((file) => !onScreen.has(posix(file)));

function violations(pattern: RegExp): string[] {
  return files.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => pattern.test(line) && !/^(?:\/\/|\/\*|\*)/.test(line.trim()))
      .map(({ line, i }) => `${relative(root, file)}:${i + 1}: ${line.trim()}`),
  );
}

describe('design rules of present mode, animations and export', () => {
  it('scans the three areas', () => {
    expect(scanned.length).toBeGreaterThanOrEqual(2);
    expect(files.length).toBeGreaterThan(8);
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
