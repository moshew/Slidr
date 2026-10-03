import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The design-system rules that a reader can miss and a scan cannot (DSN-01, SPEC 4.0 rule 7):
 * components take colours, spacing and radii from tokens only, and use no OS control.
 * Checked over the design system, the shell and every area that draws app UI. Exempt: dev pages
 * (the gallery), and what is drawn on the slide itself, in slide or screen pixels rather than in
 * tokens (`src/stage`, the in-place text editor).
 */

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const scanned = [
  'packages/ui/src',
  'apps/desktop/src/shell',
  'apps/desktop/src/controls',
  'apps/desktop/src/text',
  'apps/desktop/src/objects',
  'apps/desktop/src/arrange',
].filter((dir) => existsSync(join(root, dir)));

/** Drawn on the slide, not in the app's chrome. */
const onSlide = new Set([
  'apps/desktop/src/text/TextEditor.tsx',
  'apps/desktop/src/text/schema.ts',
]);
/** The colour picker's maths: the one place that writes colours (see the file). */
const colourMaths = 'packages/ui/src/color.ts';

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
  .filter((file) => !onSlide.has(posix(file)));

function violations(pattern: RegExp, exempt?: string): string[] {
  return files
    .filter((file) => posix(file) !== exempt)
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => pattern.test(line) && !/^(?:\/\/|\/\*|\*)/.test(line.trim()))
        .map(({ line, i }) => `${relative(root, file)}:${i + 1}: ${line.trim()}`),
    );
}

describe('design rules', () => {
  it('scans the design system and the shell', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no colour literals in components', () => {
    expect(violations(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/, colourMaths)).toEqual(
      [],
    );
  });

  it('has no arbitrary Tailwind values (a size, colour or radius that is not a token)', () => {
    // `w-[13px]`, `bg-[#fff]`, `rounded-[6px]`. Variants (`data-[state=on]:`) and property
    // lists (`transition-[width]`) carry no value and are fine.
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
