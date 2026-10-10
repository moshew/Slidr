import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/*
 * The design-system rules that a reader can miss and a scan cannot (DSN-01, SPEC 4.0 rule 7):
 * components take colours, spacing and radii from tokens only, and use no OS control.
 * Checked over the design system and over all of the app's source: whatever area there is under
 * `apps/desktop/src`, so a folder created tomorrow is checked without an edit here. What is not
 * checked is in `exempt`, each entry with its reason.
 */

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const designSystem = 'packages/ui/src';
const app = 'apps/desktop/src';

/**
 * What the rules do not hold for: a folder (the entry ends with `/`) or one file. An entry is
 * for code that does not draw the app's chrome. App UI that breaks a rule is fixed, not listed.
 */
const exempt: Record<string, string> = {
  // The dev pages: served by the dev server only, and free to show whatever a check needs.
  'apps/desktop/src/dev/': 'the gallery and the harness pages of the renderer and the runtime',

  // Drawn on the slide or over it, in slide pixels or screen pixels rather than in tokens. The
  // rest of `src/stage` is app UI (the right-click menu, the selection toolbar, the crop tools)
  // and is checked like any other.
  'apps/desktop/src/stage/Stage.tsx': 'the Stage: the slide at its zoom, and what lies over it',
  'apps/desktop/src/stage/overlays.tsx': 'the handles, the outlines and the marks over the slide',
  'apps/desktop/src/stage/Filmstrip.tsx': 'the Filmstrip: slides at the size of a thumbnail',
  'apps/desktop/src/stage/PlaceholderHint.tsx': 'the words of an empty placeholder, on the slide',
  'apps/desktop/src/text/TextEditor.tsx': 'the text editor inside a text box of the slide',
  'apps/desktop/src/text/schema.ts':
    'the styles of the text being edited, which are the deck theme',
  'apps/desktop/src/table/stage.tsx':
    'the selection and the handles of a table on the Stage (ADR-033)',
  'apps/desktop/src/present/Show.tsx': 'the show: black around the slide, on the screen (ADR-030)',
  'apps/desktop/src/capture/deckCapture.ts':
    'the contact sheet an agent gets: a picture on a canvas',
  'apps/desktop/src/templates/acceptance.ts':
    'the contact sheet a template is accepted on: a picture on a canvas (ADR-063)',

  // The stand-ins of a plain browser page, which paint the pictures that a provider or a photo
  // library would return.
  'apps/desktop/src/images/memoryImages.ts': 'paints what an image provider would return',
  'apps/desktop/src/media/memoryStock.ts': 'paints what a photo library would return',

  // Colours of decks, kept as data: what a slide is drawn in, not what the app is drawn in.
  'apps/desktop/src/templates/curated.ts': 'the palettes a deck can take',
  'apps/desktop/src/elements/designs.ts': 'the ready-made slides of Elements, in their own colours',
  'apps/desktop/src/elements/cardSets.ts': 'the card sets of Elements, in their own colours',

  // Pictures, drawn in their own colours as a photo would be; the tiles around them are tokens.
  'apps/desktop/src/elements/tiles.tsx': 'the pictures of the collections of Elements',
  'apps/desktop/src/elements/shapeArt.tsx': 'the pictures of the shapes, the lines and the card',
  'apps/desktop/src/animations/effectArt.tsx':
    'the pictures of the transitions and of the animation presets',
};
/** The colour picker's maths: the one file of the design system that writes colours. */
const colourMaths = 'packages/ui/src/color.ts';

const isExempt = (path: string) =>
  Object.keys(exempt).some((entry) =>
    entry.endsWith('/') ? path.startsWith(entry) : path === entry,
  );

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const posix = (file: string) => relative(root, file).replaceAll('\\', '/');

const files = [designSystem, app]
  .flatMap((dir) => sources(join(root, dir)))
  .filter((file) => !isExempt(posix(file)));

function violations(pattern: RegExp, except?: string): string[] {
  return files
    .filter((file) => posix(file) !== except)
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => pattern.test(line) && !/^(?:\/\/|\/\*|\*)/.test(line.trim()))
        .map(({ line, i }) => `${relative(root, file)}:${i + 1}: ${line.trim()}`),
    );
}

describe('what the design rules are checked over', () => {
  /** The folders directly under the app's source: its areas. */
  const areas = readdirSync(join(root, app)).filter((name) =>
    statSync(join(root, app, name)).isDirectory(),
  );
  const scanned = (area: string) => files.some((file) => posix(file).startsWith(`${app}/${area}/`));

  it('the design system, and every area of the app but those exempt as a whole', () => {
    expect(files.some((file) => posix(file).startsWith(`${designSystem}/`))).toBe(true);
    // No area is named here: whatever folder is found is scanned.
    expect(areas.length).toBeGreaterThan(15);
    // A folder inside an area can be exempt too; it does not make its area unscanned.
    expect(areas.filter((area) => !scanned(area)).map((area) => `${app}/${area}/`)).toEqual(
      Object.keys(exempt).filter((entry) => areas.some((area) => entry === `${app}/${area}/`)),
    );
    expect(files.length).toBeGreaterThan(200);
  });

  it('exempts only what is there, so the list does not outlive what it names', () => {
    for (const entry of [...Object.keys(exempt), colourMaths]) {
      expect(existsSync(join(root, entry)), entry).toBe(true);
    }
  });
});

describe('design rules', () => {
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
