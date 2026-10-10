// Generates the media font catalog from the installed @fontsource packages.
// (SPEC appendix B, RND-05). Each face is registered under its plain family name ("Inter", not
// "Inter Variable"), which is the name decks store. Run after adding or updating a font package:
//   node apps/desktop/scripts/gen-builtin-fonts.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** family: the name decks use; pkg: the fontsource package; scripts: what the face covers. */
const HE = ['he', 'latin'];
const LATIN = ['latin'];
const FONTS = [
  // Hebrew and Latin.
  { family: 'Heebo', pkg: '@fontsource-variable/heebo', scripts: HE },
  { family: 'Rubik', pkg: '@fontsource-variable/rubik', scripts: HE },
  { family: 'Assistant', pkg: '@fontsource-variable/assistant', scripts: HE },
  { family: 'Noto Sans Hebrew', pkg: '@fontsource-variable/noto-sans-hebrew', scripts: HE },
  { family: 'IBM Plex Sans Hebrew', pkg: '@fontsource/ibm-plex-sans-hebrew', scripts: HE },
  { family: 'Open Sans', pkg: '@fontsource-variable/open-sans', scripts: HE },
  { family: 'Alef', pkg: '@fontsource/alef', scripts: HE },
  { family: 'Varela Round', pkg: '@fontsource/varela-round', scripts: HE },
  { family: 'Frank Ruhl Libre', pkg: '@fontsource-variable/frank-ruhl-libre', scripts: HE },
  { family: 'David Libre', pkg: '@fontsource/david-libre', scripts: HE },
  { family: 'Noto Serif Hebrew', pkg: '@fontsource-variable/noto-serif-hebrew', scripts: HE },
  { family: 'Secular One', pkg: '@fontsource/secular-one', scripts: HE },
  { family: 'Suez One', pkg: '@fontsource/suez-one', scripts: HE },
  { family: 'Karantina', pkg: '@fontsource/karantina', scripts: HE },
  // Latin only.
  { family: 'Inter', pkg: '@fontsource-variable/inter', scripts: LATIN },
  { family: 'Poppins', pkg: '@fontsource/poppins', scripts: LATIN },
  { family: 'Montserrat', pkg: '@fontsource-variable/montserrat', scripts: LATIN },
  { family: 'Manrope', pkg: '@fontsource-variable/manrope', scripts: LATIN },
  { family: 'DM Sans', pkg: '@fontsource-variable/dm-sans', scripts: LATIN },
  { family: 'Space Grotesk', pkg: '@fontsource-variable/space-grotesk', scripts: LATIN },
  { family: 'Playfair Display', pkg: '@fontsource-variable/playfair-display', scripts: LATIN },
  { family: 'DM Serif Display', pkg: '@fontsource/dm-serif-display', scripts: LATIN },
  { family: 'JetBrains Mono', pkg: '@fontsource-variable/jetbrains-mono', scripts: LATIN },
];

/** Subsets worth shipping: the scripts Slidr supports, plus symbols and maths where a face has them. */
const SUBSETS = /-(latin|latin-ext|hebrew|symbols|math)-/;

function parseFaces(css) {
  const faces = [];
  for (const block of css.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const get = (prop) => new RegExp(`${prop}:\\s*([^;]+);`).exec(block)?.[1].trim();
    const src = /url\(\.\/files\/([^)]+)\)/.exec(block)?.[1];
    if (!src || !SUBSETS.test(src)) continue;
    faces.push({
      style: get('font-style') ?? 'normal',
      weight: get('font-weight') ?? '400',
      unicodeRange: get('unicode-range'),
      file: src,
    });
  }
  return faces;
}

const entries = [];
for (const font of FONTS) {
  const dir = join(root, 'node_modules', ...font.pkg.split('/'));
  // Variable packages: one face per subset (index.css) plus italics. Static packages: one CSS file
  // per weight and style.
  const cssFiles = font.pkg.startsWith('@fontsource-variable/')
    ? ['index.css', 'wght-italic.css'].filter((f) => existsSync(join(dir, f)))
    : readdirSync(dir).filter((f) => /^\d{3}(-italic)?\.css$/.test(f));
  if (!cssFiles.length) throw new Error(`no CSS in ${font.pkg}`);
  for (const cssFile of cssFiles) {
    for (const face of parseFaces(readFileSync(join(dir, cssFile), 'utf8'))) {
      entries.push(
        {
          family: font.family,
          style: face.style,
          weight: face.weight,
          path: `fonts/${font.pkg.split('/').at(-1)}/${face.file}`,
          ...(face.unicodeRange ? { unicodeRange: face.unicodeRange } : {}),
        },
      );
    }
  }
}

const out = {
  families: FONTS.map(({ family, scripts }) => ({ family, scripts })),
  faces: entries,
};
writeFileSync(
  new URL('../../../../Slidr-media/fonts/catalog.json', import.meta.url),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(`${entries.length} faces from ${FONTS.length} families`);
