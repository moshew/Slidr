// Generates the media font catalog from the installed @fontsource packages.
// (SPEC appendix B, RND-05). Each face is registered under its plain family name ("Inter", not
// "Inter Variable"), which is the name decks store. Beside each family's files it writes the
// family's notice, `fonts/<family>/<family>.notice.json`: the app lists it among its licences
// (src/about/notices.ts), and copies the font files the catalog names into the library. Each
// family is tagged with the scripts of the subsets it ships (`he`, `latin`, `arabic`, `cyrillic`,
// `vietnamese`, `devanagari`): the letters of the languages decks are written in
// (packages/model/src/languages.ts). Run after adding or updating a font package:
//   node apps/desktop/scripts/gen-builtin-fonts.mjs        (SLIDR_MEDIA_DIR names another copy)
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** family: the name decks use; pkg: the fontsource package. */
const FONTS = [
  // With Hebrew letters; Rubik also has Arabic and Cyrillic, Open Sans Cyrillic.
  { family: 'Heebo', pkg: '@fontsource-variable/heebo' },
  { family: 'Rubik', pkg: '@fontsource-variable/rubik' },
  { family: 'Assistant', pkg: '@fontsource-variable/assistant' },
  { family: 'Noto Sans Hebrew', pkg: '@fontsource-variable/noto-sans-hebrew' },
  { family: 'IBM Plex Sans Hebrew', pkg: '@fontsource/ibm-plex-sans-hebrew' },
  { family: 'Open Sans', pkg: '@fontsource-variable/open-sans' },
  { family: 'Alef', pkg: '@fontsource/alef' },
  { family: 'Varela Round', pkg: '@fontsource/varela-round' },
  { family: 'Frank Ruhl Libre', pkg: '@fontsource-variable/frank-ruhl-libre' },
  { family: 'David Libre', pkg: '@fontsource/david-libre' },
  { family: 'Noto Serif Hebrew', pkg: '@fontsource-variable/noto-serif-hebrew' },
  { family: 'Secular One', pkg: '@fontsource/secular-one' },
  { family: 'Suez One', pkg: '@fontsource/suez-one' },
  { family: 'Karantina', pkg: '@fontsource/karantina' },
  // Without Hebrew letters; Poppins has Devanagari, and several have Cyrillic.
  { family: 'Inter', pkg: '@fontsource-variable/inter' },
  { family: 'Poppins', pkg: '@fontsource/poppins' },
  { family: 'Montserrat', pkg: '@fontsource-variable/montserrat' },
  { family: 'Manrope', pkg: '@fontsource-variable/manrope' },
  { family: 'DM Sans', pkg: '@fontsource-variable/dm-sans' },
  { family: 'Space Grotesk', pkg: '@fontsource-variable/space-grotesk' },
  { family: 'Playfair Display', pkg: '@fontsource-variable/playfair-display' },
  { family: 'DM Serif Display', pkg: '@fontsource/dm-serif-display' },
  { family: 'JetBrains Mono', pkg: '@fontsource-variable/jetbrains-mono' },
];

/**
 * The subsets worth shipping, by the script tag each gives its family: the letters of the
 * languages decks are written in, plus symbols and maths where a face has them. Greek is no
 * language of Slidr's.
 */
const SUBSETS = {
  latin: 'latin',
  'latin-ext': 'latin',
  hebrew: 'he',
  arabic: 'arabic',
  cyrillic: 'cyrillic',
  'cyrillic-ext': undefined,
  vietnamese: 'vietnamese',
  devanagari: 'devanagari',
  symbols: undefined,
  math: undefined,
};
/** The order of a family's tags. */
const SCRIPTS = ['he', 'latin', 'arabic', 'cyrillic', 'vietnamese', 'devanagari'];

/** The subset of a file of a package: `rubik-arabic-wght-normal.woff2` -> `arabic`. */
function subsetOf(folder, file) {
  const rest = file.startsWith(`${folder}-`) ? file.slice(folder.length + 1) : '';
  return Object.keys(SUBSETS)
    .sort((a, b) => b.length - a.length)
    .find((subset) => rest.startsWith(`${subset}-`));
}

function parseFaces(css, folder) {
  const faces = [];
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const get = (prop) => new RegExp(`${prop}:\\s*([^;]+);`).exec(block)?.[1].trim();
    const src = /url\(\.\/files\/([^)]+)\)/.exec(block)?.[1];
    const subset = src && subsetOf(folder, src);
    if (!subset) continue;
    faces.push({
      subset,
      style: get('font-style') ?? 'normal',
      weight: get('font-weight') ?? '400',
      unicodeRange: get('unicode-range'),
      file: src,
    });
  }
  return faces;
}

const media = process.env.SLIDR_MEDIA_DIR
  ? pathToFileURL(`${join(resolve(process.env.SLIDR_MEDIA_DIR), 'fonts')}/`)
  : new URL('../../../../Slidr-media/fonts/', import.meta.url);

/** The notice of a family: its package, its licence, and the licence's text with the copyright. */
function writeNotice(font, dir) {
  const { version, license, author, homepage } = JSON.parse(
    readFileSync(join(dir, 'package.json'), 'utf8'),
  );
  const folder = font.pkg.split('/').at(-1);
  const target = new URL(`${folder}/`, media);
  mkdirSync(target, { recursive: true });
  writeFileSync(
    new URL(`${folder}.notice.json`, target),
    `${JSON.stringify(
      {
        name: font.pkg,
        version,
        license,
        ...(author ? { author: typeof author === 'string' ? author : author.name } : {}),
        ...(homepage ? { homepage } : {}),
        text: readFileSync(join(dir, 'LICENSE'), 'utf8'),
      },
      null,
      2,
    )}
`,
  );
}

const entries = [];
const families = [];
for (const font of FONTS) {
  const dir = join(root, 'node_modules', ...font.pkg.split('/'));
  const folder = font.pkg.split('/').at(-1);
  writeNotice(font, dir);
  const scripts = new Set();
  // Variable packages: one face per subset (index.css) plus italics. Static packages: one CSS file
  // per weight and style.
  const cssFiles = font.pkg.startsWith('@fontsource-variable/')
    ? ['index.css', 'wght-italic.css'].filter((f) => existsSync(join(dir, f)))
    : readdirSync(dir).filter((f) => /^\d{3}(-italic)?\.css$/.test(f));
  if (!cssFiles.length) throw new Error(`no CSS in ${font.pkg}`);
  for (const cssFile of cssFiles) {
    for (const face of parseFaces(readFileSync(join(dir, cssFile), 'utf8'), folder)) {
      if (SUBSETS[face.subset]) scripts.add(SUBSETS[face.subset]);
      const target = new URL(`${folder}/${face.file}`, media);
      if (!existsSync(target)) copyFileSync(join(dir, 'files', face.file), target);
      entries.push({
        family: font.family,
        style: face.style,
        weight: face.weight,
        path: `fonts/${folder}/${face.file}`,
        ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
      });
    }
  }
  families.push({ family: font.family, scripts: SCRIPTS.filter((s) => scripts.has(s)) });
}

const out = { families, faces: entries };
writeFileSync(new URL('catalog.json', media), `${JSON.stringify(out, null, 2)}\n`);
console.log(`${entries.length} faces from ${FONTS.length} families`);
