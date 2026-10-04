// The fonts of a reference deck, embedded in the file so it opens by double-click with no network.
// A deck names its fonts through the theme variables (`--font-heading`, `--font-body`), in the
// order the renderer's `fontStack` gives them: the Hebrew-only face of the Hebrew family, then
// the Latin family. The files come from the same @fontsource packages the app registers
// (SPEC appendix B), under the same family names.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const modules = join(repo, 'apps', 'desktop', 'node_modules');

/** The family name decks and templates use -> its @fontsource package: the built-in library. */
const PACKAGES = {
  Heebo: '@fontsource-variable/heebo',
  Rubik: '@fontsource-variable/rubik',
  Assistant: '@fontsource-variable/assistant',
  'Noto Sans Hebrew': '@fontsource-variable/noto-sans-hebrew',
  'IBM Plex Sans Hebrew': '@fontsource/ibm-plex-sans-hebrew',
  'Open Sans': '@fontsource-variable/open-sans',
  Alef: '@fontsource/alef',
  'Varela Round': '@fontsource/varela-round',
  'Frank Ruhl Libre': '@fontsource-variable/frank-ruhl-libre',
  'David Libre': '@fontsource/david-libre',
  'Noto Serif Hebrew': '@fontsource-variable/noto-serif-hebrew',
  'Secular One': '@fontsource/secular-one',
  'Suez One': '@fontsource/suez-one',
  Karantina: '@fontsource/karantina',
  Inter: '@fontsource-variable/inter',
  Poppins: '@fontsource/poppins',
  Montserrat: '@fontsource-variable/montserrat',
  Manrope: '@fontsource-variable/manrope',
  'DM Sans': '@fontsource-variable/dm-sans',
  'Space Grotesk': '@fontsource-variable/space-grotesk',
  'Playfair Display': '@fontsource-variable/playfair-display',
  'DM Serif Display': '@fontsource/dm-serif-display',
  'JetBrains Mono': '@fontsource-variable/jetbrains-mono',
};

/** The Hebrew letters, as the renderer's Hebrew-only faces cover them (`hebrewFaces`). */
const HEBREW_RANGE = 'U+0590-05FF,U+20AA,U+FB1D-FB4F';
/** Static packages carry a file per weight; these are the weights slides are set in. */
const WEIGHTS = new Set(['400', '500', '600', '700', '800']);
/** The templates also set type light and black: the index page embeds those weights too. */
export const ALL_WEIGHTS = new Set(['300', '400', '500', '600', '700', '800', '900']);

/** The faces of one subset of a family: weight, unicode range and the file. */
function faces(family, subset, weights) {
  const pkg = PACKAGES[family];
  if (!pkg) throw new Error(`"${family}" is not a font the reference decks know`);
  const dir = join(modules, ...pkg.split('/'));
  const variable = pkg.startsWith('@fontsource-variable/');
  const sheets = variable
    ? ['index.css']
    : readdirSync(dir).filter((f) => /^\d{3}\.css$/.test(f) && weights.has(f.slice(0, 3)));
  const found = [];
  for (const sheet of sheets) {
    const css = readFileSync(join(dir, sheet), 'utf8');
    for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
      const get = (prop) => new RegExp(`${prop}:\\s*([^;]+);`).exec(block)?.[1].trim();
      const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1];
      if (!file || !new RegExp(`-${subset}-(wght|\\d{3})-normal\\.woff2$`).test(file)) continue;
      if (!existsSync(join(dir, 'files', file))) continue;
      found.push({
        weight: get('font-weight') ?? '400',
        range: get('unicode-range'),
        data: readFileSync(join(dir, 'files', file)).toString('base64'),
      });
    }
  }
  return found;
}

function rule(name, face, range) {
  return [
    '@font-face {',
    `font-family: "${name}";`,
    'font-style: normal;',
    `font-weight: ${face.weight};`,
    'font-display: block;',
    `src: url(data:font/woff2;base64,${face.data}) format("woff2");`,
    `unicode-range: ${range ?? face.range};`,
    '}',
  ].join(' ');
}

/** The families a font stack names, in order, without the generic keyword at its end. */
function families(stack) {
  return [...stack.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/**
 * `@font-face` rules for the font stacks of a deck's theme block. `"X::hebrew"` gets the Hebrew
 * letters of X and nothing else; a plain family gets its Latin subset, and its Hebrew one as
 * well when no Hebrew-only face stands before it in the stack (a pair of one family).
 */
export function fontFaces(themeCss, weights = WEIGHTS) {
  const rules = new Map();
  for (const [, stack] of themeCss.matchAll(/--font-(?:heading|body):\s*([^;]+);/g)) {
    const names = families(stack);
    const paired = names.some((name) => name.endsWith('::hebrew'));
    for (const name of names) {
      if (name.endsWith('::hebrew')) {
        const family = name.slice(0, -'::hebrew'.length);
        faces(family, 'hebrew', weights).forEach((face) =>
          rules.set(`${name}/${face.weight}`, rule(name, face, HEBREW_RANGE)),
        );
      } else if (!paired || names.indexOf(name) === 1) {
        faces(name, 'latin', weights).forEach((face) =>
          rules.set(`${name}/latin/${face.weight}`, rule(name, face)),
        );
        if (!paired) {
          faces(name, 'hebrew', weights).forEach((face) =>
            rules.set(`${name}/hebrew/${face.weight}`, rule(name, face)),
          );
        }
      }
    }
  }
  return [...rules.values()].join('\n');
}
