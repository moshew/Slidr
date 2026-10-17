// Generates the media font catalog from the installed @fontsource packages.
// (SPEC appendix B, RND-05). Each face is registered under its plain family name ("Inter", not
// "Inter Variable"), which is the name decks store. Beside each family's files it writes the
// family's notice, `fonts/<family>/<family>.notice.json`: the app lists it among its licences
// (src/about/notices.ts), and copies the font files the catalog names into the library. Each
// family is tagged with the scripts of the subsets it ships (`he`, `latin`, `arabic`, `cyrillic`,
// `vietnamese`, `devanagari`, `japanese`, `korean`, `chinese`): the letters of the languages
// decks are written in (packages/model/src/languages.ts). It also says which of them the family
// was made for (`for`: a Hebrew family carries Latin letters for the English words of a Hebrew
// text, and is no font for an English deck), and, for each script it has no letters of, the
// family of the library closest to it in character that has them (`counterparts`): the font a
// design written in English sets its Arabic or Japanese text in. A family of one face that looks
// bold says so (`looks: 700`). Run after adding or updating a font package:
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

/**
 * family: the name decks use; pkg: the fontsource package; for: the scripts it was made for;
 * kind: its character, which chooses its counterparts (`KINDS`); counterparts: those of its own,
 * where its kind's do not fit it; weights: of a static package whose every weight is a hundred
 * files (the Japanese, Korean and Chinese ones), those shipped. Every family is under the SIL Open
 * Font License.
 */
const FONTS = [
  // Made for Hebrew, with Latin letters beside; Rubik also has Arabic and Cyrillic.
  { family: 'Heebo', pkg: '@fontsource-variable/heebo', for: ['he'], kind: 'sans' },
  {
    family: 'Rubik',
    pkg: '@fontsource-variable/rubik',
    for: ['he', 'latin', 'arabic'],
    kind: 'soft',
  },
  { family: 'Assistant', pkg: '@fontsource-variable/assistant', for: ['he'], kind: 'humanist' },
  {
    family: 'Noto Sans Hebrew',
    pkg: '@fontsource-variable/noto-sans-hebrew',
    for: ['he'],
    kind: 'sans',
  },
  {
    family: 'IBM Plex Sans Hebrew',
    pkg: '@fontsource/ibm-plex-sans-hebrew',
    for: ['he'],
    kind: 'plex',
  },
  { family: 'Miriam Libre', pkg: '@fontsource-variable/miriam-libre', for: ['he'], kind: 'sans' },
  { family: 'Alef', pkg: '@fontsource/alef', for: ['he'], kind: 'humanist' },
  {
    family: 'Frank Ruhl Libre',
    pkg: '@fontsource-variable/frank-ruhl-libre',
    for: ['he'],
    kind: 'serif',
  },
  { family: 'David Libre', pkg: '@fontsource/david-libre', for: ['he'], kind: 'serif' },
  {
    family: 'Noto Serif Hebrew',
    pkg: '@fontsource-variable/noto-serif-hebrew',
    for: ['he'],
    kind: 'serif',
  },
  { family: 'Bellefair', pkg: '@fontsource/bellefair', for: ['he'], kind: 'display serif' },
  { family: 'Secular One', pkg: '@fontsource/secular-one', for: ['he'], kind: 'heavy' },
  { family: 'Suez One', pkg: '@fontsource/suez-one', for: ['he'], kind: 'heavy serif' },
  { family: 'Karantina', pkg: '@fontsource/karantina', for: ['he'], kind: 'condensed' },
  {
    family: 'Playpen Sans Hebrew',
    pkg: '@fontsource-variable/playpen-sans-hebrew',
    for: ['he'],
    kind: 'hand',
  },
  // Made for Latin letters, with Hebrew ones too.
  { family: 'Open Sans', pkg: '@fontsource-variable/open-sans', for: ['latin'], kind: 'humanist' },
  { family: 'Arimo', pkg: '@fontsource-variable/arimo', for: ['latin'], kind: 'sans' },
  {
    family: 'Varela Round',
    pkg: '@fontsource/varela-round',
    for: ['latin', 'he'],
    kind: 'rounded',
  },
  { family: 'Fredoka', pkg: '@fontsource-variable/fredoka', for: ['latin', 'he'], kind: 'rounded' },
  { family: 'Tinos', pkg: '@fontsource/tinos', for: ['latin'], kind: 'serif' },
  { family: 'Bona Nova', pkg: '@fontsource/bona-nova', for: ['latin'], kind: 'serif' },
  { family: 'Amatic SC', pkg: '@fontsource/amatic-sc', for: ['latin', 'he'], kind: 'hand' },
  { family: 'Cousine', pkg: '@fontsource/cousine', for: ['latin'], kind: 'mono' },
  // Made for Latin letters; several have Cyrillic and Vietnamese, Poppins Devanagari.
  { family: 'Inter', pkg: '@fontsource-variable/inter', for: ['latin'], kind: 'sans' },
  {
    family: 'Poppins',
    pkg: '@fontsource/poppins',
    for: ['latin', 'devanagari'],
    kind: 'geometric',
  },
  {
    family: 'Montserrat',
    pkg: '@fontsource-variable/montserrat',
    for: ['latin'],
    kind: 'geometric',
  },
  { family: 'Manrope', pkg: '@fontsource-variable/manrope', for: ['latin'], kind: 'sans' },
  // A geometric sans made for Vietnamese: the Vietnamese of Poppins, Montserrat and their kind.
  {
    family: 'Be Vietnam Pro',
    pkg: '@fontsource/be-vietnam-pro',
    for: ['latin', 'vietnamese'],
    kind: 'geometric',
    weights: ['300', '400', '500', '600', '700', '800'],
  },
  // Narrower than Poppins and Montserrat: its Cyrillic and Vietnamese are Manrope, of its width.
  {
    family: 'DM Sans',
    pkg: '@fontsource-variable/dm-sans',
    for: ['latin'],
    kind: 'geometric',
    counterparts: { cyrillic: 'Manrope', vietnamese: 'Manrope' },
  },
  {
    family: 'Space Grotesk',
    pkg: '@fontsource-variable/space-grotesk',
    for: ['latin'],
    kind: 'grotesk',
  },
  {
    family: 'Golos Text',
    pkg: '@fontsource-variable/golos-text',
    for: ['latin', 'cyrillic'],
    kind: 'sans',
  },
  {
    family: 'Unbounded',
    pkg: '@fontsource-variable/unbounded',
    for: ['latin', 'cyrillic'],
    kind: 'wide',
  },
  {
    family: 'Oswald',
    pkg: '@fontsource-variable/oswald',
    for: ['latin', 'cyrillic'],
    kind: 'condensed',
  },
  { family: 'Lora', pkg: '@fontsource-variable/lora', for: ['latin'], kind: 'serif' },
  {
    family: 'Playfair Display',
    pkg: '@fontsource-variable/playfair-display',
    for: ['latin'],
    kind: 'display serif',
  },
  {
    family: 'DM Serif Display',
    pkg: '@fontsource/dm-serif-display',
    for: ['latin'],
    kind: 'heavy serif',
  },
  {
    family: 'JetBrains Mono',
    pkg: '@fontsource-variable/jetbrains-mono',
    for: ['latin'],
    kind: 'mono',
  },
  // Made for Arabic.
  {
    family: 'IBM Plex Sans Arabic',
    pkg: '@fontsource/ibm-plex-sans-arabic',
    for: ['arabic'],
    kind: 'plex',
  },
  {
    family: 'Noto Kufi Arabic',
    pkg: '@fontsource-variable/noto-kufi-arabic',
    for: ['arabic'],
    kind: 'sans',
  },
  { family: 'Cairo', pkg: '@fontsource-variable/cairo', for: ['arabic'], kind: 'geometric' },
  { family: 'Tajawal', pkg: '@fontsource/tajawal', for: ['arabic'], kind: 'humanist' },
  {
    family: 'Readex Pro',
    pkg: '@fontsource-variable/readex-pro',
    for: ['arabic'],
    kind: 'grotesk',
  },
  { family: 'Alexandria', pkg: '@fontsource-variable/alexandria', for: ['arabic'], kind: 'wide' },
  {
    family: 'Noto Naskh Arabic',
    pkg: '@fontsource-variable/noto-naskh-arabic',
    for: ['arabic'],
    kind: 'serif',
  },
  { family: 'Amiri', pkg: '@fontsource/amiri', for: ['arabic'], kind: 'display serif' },
  {
    family: 'El Messiri',
    pkg: '@fontsource-variable/el-messiri',
    for: ['arabic'],
    kind: 'heavy serif',
  },
  {
    family: 'Reem Kufi',
    pkg: '@fontsource-variable/reem-kufi',
    for: ['arabic'],
    kind: 'condensed',
  },
  { family: 'Lalezar', pkg: '@fontsource/lalezar', for: ['arabic'], kind: 'heavy' },
  {
    family: 'Baloo Bhaijaan 2',
    pkg: '@fontsource-variable/baloo-bhaijaan-2',
    for: ['arabic'],
    kind: 'rounded',
  },
  {
    family: 'Playpen Sans Arabic',
    pkg: '@fontsource-variable/playpen-sans-arabic',
    for: ['arabic'],
    kind: 'hand',
  },
  // Made for Devanagari (Hindi).
  {
    family: 'Noto Sans Devanagari',
    pkg: '@fontsource-variable/noto-sans-devanagari',
    for: ['devanagari'],
    kind: 'sans',
  },
  {
    family: 'IBM Plex Sans Devanagari',
    pkg: '@fontsource/ibm-plex-sans-devanagari',
    for: ['devanagari'],
    kind: 'plex',
  },
  { family: 'Mukta', pkg: '@fontsource/mukta', for: ['devanagari'], kind: 'humanist' },
  { family: 'Hind', pkg: '@fontsource/hind', for: ['devanagari'], kind: 'soft' },
  { family: 'Rajdhani', pkg: '@fontsource/rajdhani', for: ['devanagari'], kind: 'grotesk' },
  { family: 'Teko', pkg: '@fontsource-variable/teko', for: ['devanagari'], kind: 'condensed' },
  {
    family: 'Noto Serif Devanagari',
    pkg: '@fontsource-variable/noto-serif-devanagari',
    for: ['devanagari'],
    kind: 'serif',
  },
  {
    family: 'Tiro Devanagari Hindi',
    pkg: '@fontsource/tiro-devanagari-hindi',
    for: ['devanagari'],
    kind: 'display serif',
  },
  { family: 'Yatra One', pkg: '@fontsource/yatra-one', for: ['devanagari'], kind: 'heavy serif' },
  { family: 'Baloo 2', pkg: '@fontsource-variable/baloo-2', for: ['devanagari'], kind: 'rounded' },
  {
    family: 'Playpen Sans Deva',
    pkg: '@fontsource-variable/playpen-sans-deva',
    for: ['devanagari'],
    kind: 'hand',
  },
  // Made for Japanese.
  {
    family: 'Noto Sans JP',
    pkg: '@fontsource-variable/noto-sans-jp',
    for: ['japanese'],
    kind: 'sans',
  },
  {
    family: 'Noto Serif JP',
    pkg: '@fontsource-variable/noto-serif-jp',
    for: ['japanese'],
    kind: 'serif',
  },
  {
    family: 'Zen Maru Gothic',
    pkg: '@fontsource/zen-maru-gothic',
    for: ['japanese'],
    kind: 'rounded',
    weights: ['400', '700'],
  },
  {
    family: 'Dela Gothic One',
    pkg: '@fontsource/dela-gothic-one',
    for: ['japanese'],
    kind: 'heavy',
  },
  {
    family: 'Klee One',
    pkg: '@fontsource/klee-one',
    for: ['japanese'],
    kind: 'hand',
    weights: ['600'],
  },
  // Made for Korean.
  {
    family: 'Noto Sans KR',
    pkg: '@fontsource-variable/noto-sans-kr',
    for: ['korean'],
    kind: 'sans',
  },
  {
    family: 'Noto Serif KR',
    pkg: '@fontsource-variable/noto-serif-kr',
    for: ['korean'],
    kind: 'serif',
  },
  { family: 'Black Han Sans', pkg: '@fontsource/black-han-sans', for: ['korean'], kind: 'heavy' },
  { family: 'Jua', pkg: '@fontsource/jua', for: ['korean'], kind: 'rounded' },
  {
    family: 'Gaegu',
    pkg: '@fontsource/gaegu',
    for: ['korean'],
    kind: 'hand',
    weights: ['400', '700'],
  },
  // Made for Simplified Chinese.
  {
    family: 'Noto Sans SC',
    pkg: '@fontsource-variable/noto-sans-sc',
    for: ['chinese'],
    kind: 'sans',
  },
  {
    family: 'Noto Serif SC',
    pkg: '@fontsource-variable/noto-serif-sc',
    for: ['chinese'],
    kind: 'serif',
  },
  {
    family: 'ZCOOL XiaoWei',
    pkg: '@fontsource/zcool-xiaowei',
    for: ['chinese'],
    kind: 'display serif',
  },
  { family: 'ZCOOL KuaiLe', pkg: '@fontsource/zcool-kuaile', for: ['chinese'], kind: 'rounded' },
  { family: 'Ma Shan Zheng', pkg: '@fontsource/ma-shan-zheng', for: ['chinese'], kind: 'hand' },
];

/**
 * The family of each script closest in character to a family of each kind: its counterpart, for
 * the scripts the family has no letters of. Where a family of the kind has the letters itself, the
 * row names it; the generator checks that each counterpart has them.
 */
const KINDS = {
  // Neutral grotesques. Their Arabic, and the humanists', is IBM Plex Sans Arabic, the one Arabic
  // sans no wider than the Rubik the Arabic designs were first set in: measured, Noto Kufi Arabic
  // runs 14–23% wider and Tajawal 6–8%, and both overflowed boxes and chips that do not wrap.
  sans: {
    he: 'Heebo',
    latin: 'Inter',
    arabic: 'IBM Plex Sans Arabic',
    cyrillic: 'Inter',
    vietnamese: 'Inter',
    devanagari: 'Noto Sans Devanagari',
    japanese: 'Noto Sans JP',
    korean: 'Noto Sans KR',
    chinese: 'Noto Sans SC',
  },
  // Open, calligraphic sans serifs.
  humanist: {
    he: 'Assistant',
    latin: 'Open Sans',
    arabic: 'IBM Plex Sans Arabic',
    cyrillic: 'Open Sans',
    vietnamese: 'Open Sans',
    devanagari: 'Mukta',
    japanese: 'Noto Sans JP',
    korean: 'Noto Sans KR',
    chinese: 'Noto Sans SC',
  },
  // IBM Plex: one superfamily across the scripts.
  plex: {
    he: 'IBM Plex Sans Hebrew',
    latin: 'Inter',
    arabic: 'IBM Plex Sans Arabic',
    cyrillic: 'Inter',
    vietnamese: 'Inter',
    devanagari: 'IBM Plex Sans Devanagari',
    japanese: 'Noto Sans JP',
    korean: 'Noto Sans KR',
    chinese: 'Noto Sans SC',
  },
  // Circles and straight lines.
  geometric: {
    he: 'Rubik',
    latin: 'Montserrat',
    arabic: 'Cairo',
    cyrillic: 'Montserrat',
    vietnamese: 'Be Vietnam Pro',
    devanagari: 'Poppins',
    japanese: 'Noto Sans JP',
    korean: 'Noto Sans KR',
    chinese: 'Noto Sans SC',
  },
  // Sans serifs with soft corners. Rubik has no Vietnamese letters: Manrope is of its width.
  soft: {
    he: 'Rubik',
    latin: 'Rubik',
    arabic: 'Rubik',
    cyrillic: 'Rubik',
    vietnamese: 'Manrope',
    devanagari: 'Hind',
    japanese: 'Zen Maru Gothic',
    korean: 'Noto Sans KR',
    chinese: 'Noto Sans SC',
  },
  // Technical grotesques with quirks.
  grotesk: {
    he: 'IBM Plex Sans Hebrew',
    latin: 'Space Grotesk',
    arabic: 'Readex Pro',
    cyrillic: 'Manrope',
    vietnamese: 'Space Grotesk',
    devanagari: 'IBM Plex Sans Devanagari',
    japanese: 'Noto Sans JP',
    korean: 'Noto Sans KR',
    chinese: 'Noto Sans SC',
  },
  // Wide, heavy display sans serifs.
  wide: {
    he: 'Secular One',
    latin: 'Unbounded',
    arabic: 'Alexandria',
    cyrillic: 'Unbounded',
    vietnamese: 'Unbounded',
    devanagari: 'Poppins',
    japanese: 'Dela Gothic One',
    korean: 'Black Han Sans',
    chinese: 'Noto Sans SC',
  },
  // Heavy display sans serifs.
  heavy: {
    he: 'Secular One',
    latin: 'Montserrat',
    arabic: 'Lalezar',
    cyrillic: 'Unbounded',
    vietnamese: 'Montserrat',
    devanagari: 'Poppins',
    japanese: 'Dela Gothic One',
    korean: 'Black Han Sans',
    chinese: 'Noto Sans SC',
  },
  // Narrow display sans serifs.
  condensed: {
    he: 'Karantina',
    latin: 'Oswald',
    arabic: 'Reem Kufi',
    cyrillic: 'Oswald',
    vietnamese: 'Oswald',
    devanagari: 'Teko',
    japanese: 'Noto Sans JP',
    korean: 'Black Han Sans',
    chinese: 'Noto Sans SC',
  },
  rounded: {
    he: 'Varela Round',
    latin: 'Varela Round',
    arabic: 'Baloo Bhaijaan 2',
    cyrillic: 'Rubik',
    vietnamese: 'Varela Round',
    devanagari: 'Baloo 2',
    japanese: 'Zen Maru Gothic',
    korean: 'Jua',
    chinese: 'ZCOOL KuaiLe',
  },
  // Serifs for text. Their Cyrillic and Vietnamese are Tinos, a classic text serif of Frank Ruhl
  // Libre's width: Lora runs 7% wider and broke Tzuk's titles onto another line.
  serif: {
    he: 'Frank Ruhl Libre',
    latin: 'Lora',
    arabic: 'Noto Naskh Arabic',
    cyrillic: 'Tinos',
    vietnamese: 'Tinos',
    devanagari: 'Noto Serif Devanagari',
    japanese: 'Noto Serif JP',
    korean: 'Noto Serif KR',
    chinese: 'Noto Serif SC',
  },
  // Serifs of high contrast for titles. Their counterparts have the bold weights titles are set
  // in: Tiro Devanagari Hindi and ZCOOL XiaoWei have only a regular one.
  'display serif': {
    he: 'Frank Ruhl Libre',
    latin: 'Playfair Display',
    arabic: 'Amiri',
    cyrillic: 'Playfair Display',
    vietnamese: 'Playfair Display',
    devanagari: 'Noto Serif Devanagari',
    japanese: 'Noto Serif JP',
    korean: 'Noto Serif KR',
    chinese: 'Noto Serif SC',
  },
  // Heavy serifs for titles.
  'heavy serif': {
    he: 'Suez One',
    latin: 'DM Serif Display',
    arabic: 'El Messiri',
    cyrillic: 'Playfair Display',
    vietnamese: 'Playfair Display',
    devanagari: 'Noto Serif Devanagari',
    japanese: 'Noto Serif JP',
    korean: 'Noto Serif KR',
    chinese: 'Noto Serif SC',
  },
  // Handwriting.
  hand: {
    he: 'Playpen Sans Hebrew',
    latin: 'Amatic SC',
    arabic: 'Playpen Sans Arabic',
    cyrillic: 'Amatic SC',
    vietnamese: 'Amatic SC',
    devanagari: 'Playpen Sans Deva',
    japanese: 'Klee One',
    korean: 'Gaegu',
    chinese: 'Ma Shan Zheng',
  },
  // Monospaced; no family of the library is monospaced in Arabic, Devanagari or East Asian letters.
  mono: {
    he: 'Cousine',
    latin: 'JetBrains Mono',
    arabic: 'IBM Plex Sans Arabic',
    cyrillic: 'JetBrains Mono',
    vietnamese: 'Cousine',
    devanagari: 'IBM Plex Sans Devanagari',
    japanese: 'Noto Sans JP',
    korean: 'Noto Sans KR',
    chinese: 'Noto Sans SC',
  },
};

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
/**
 * The families of one heavy face, regular by its number and bold to the eye: the catalog says
 * they look 700 (`looks`), so that their counterpart sets the same text bold.
 */
const LOOKS_BOLD = new Set([
  'Secular One',
  'Suez One',
  'DM Serif Display',
  'Lalezar',
  'Yatra One',
  'Dela Gothic One',
  'Black Han Sans',
]);

/** The order of a family's tags. */
const SCRIPTS = [
  'he',
  'latin',
  'arabic',
  'cyrillic',
  'vietnamese',
  'devanagari',
  'japanese',
  'korean',
  'chinese',
];

/**
 * The subset of a file of a package: `rubik-arabic-wght-normal.woff2` -> `arabic`. A Japanese,
 * Korean or Chinese face is cut into a hundred numbered slices (`noto-sans-jp-12-wght-normal`),
 * each a part of the letters of the script the family was made for.
 */
function subsetOf(folder, file) {
  const rest = file.startsWith(`${folder}-`) ? file.slice(folder.length + 1) : '';
  return (
    /^(\d+)-/.exec(rest)?.[1] ??
    Object.keys(SUBSETS)
      .sort((a, b) => b.length - a.length)
      .find((subset) => rest.startsWith(`${subset}-`))
  );
}

/** The script tag of a face of a family: its subset's, or a numbered slice's of the family's own. */
const tagOf = (font, subset) => (/^\d+$/.test(subset) ? font.for[0] : SUBSETS[subset]);

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
    : readdirSync(dir).filter(
        (f) =>
          /^\d{3}(-italic)?\.css$/.test(f) &&
          (!font.weights || font.weights.includes(f.slice(0, 3))),
      );
  if (!cssFiles.length) throw new Error(`no CSS in ${font.pkg}`);
  for (const cssFile of cssFiles) {
    for (const face of parseFaces(readFileSync(join(dir, cssFile), 'utf8'), folder)) {
      const tag = tagOf(font, face.subset);
      if (tag) scripts.add(tag);
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
  for (const own of font.for) {
    if (!scripts.has(own))
      throw new Error(`${font.family} is made for ${own} but has no such letters`);
  }
  families.push({
    family: font.family,
    scripts: SCRIPTS.filter((s) => scripts.has(s)),
    for: font.for,
    ...(LOOKS_BOLD.has(font.family) ? { looks: 700 } : {}),
  });
}

// The counterparts of each family, for the scripts it has no letters of.
const byName = new Map(families.map((entry) => [entry.family, entry]));
for (const entry of families) {
  const font = FONTS.find((each) => each.family === entry.family);
  if (!KINDS[font.kind]) throw new Error(`${entry.family}: no kind ${font.kind}`);
  // A family's own row, where its kind's would not fit it, goes over its kind's.
  const row = { ...KINDS[font.kind], ...font.counterparts };
  const counterparts = {};
  for (const script of SCRIPTS) {
    if (entry.scripts.includes(script)) continue;
    const other = byName.get(row[script]);
    if (!other?.scripts.includes(script)) {
      throw new Error(
        `${entry.family}: the ${script} counterpart ${row[script]} has no ${script} letters`,
      );
    }
    counterparts[script] = other.family;
  }
  if (Object.keys(counterparts).length > 0) entry.counterparts = counterparts;
}

const out = { families, faces: entries };
writeFileSync(new URL('catalog.json', media), `${JSON.stringify(out, null, 2)}\n`);
console.log(`${entries.length} faces from ${FONTS.length} families`);
