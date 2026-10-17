// Sets the text of every design of Elements in a language other than Hebrew and English in the
// families of that language (src/elements/designFonts.ts): each run in the family its English
// slide sets it in (its Hebrew one for a right-to-left language), where that family is one of the
// language's, and else in its counterpart in the font catalog, the family of the language's letters
// closest to it in character. Run it after writing a design in another language, and after the
// font catalog changes (scripts/gen-builtin-fonts.mjs):
//
//   node apps/desktop/scripts/design-fonts.mjs           write the authored and managed catalogs
//   node apps/desktop/scripts/design-fonts.mjs --check   report what would change, write nothing
//
// It reads the fonts and writes the designs of `../Slidr-media`, or of SLIDR_MEDIA_DIR.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const media = process.env.SLIDR_MEDIA_DIR
  ? resolve(process.env.SLIDR_MEDIA_DIR)
  : resolve(desktop, '..', '..', '..', 'Slidr-media');
const check = process.argv.includes('--check');

const server = await createServer({
  configFile: false,
  root: desktop,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null, fs: { strict: false } },
  optimizeDeps: { noDiscovery: true, include: [] },
  ssr: { noExternal: [/^@slidr\//] },
});

try {
  const { fontShelf, setInLanguage } = await server.ssrLoadModule(
    join(desktop, 'src', 'elements', 'designFonts.ts'),
  );
  const { BASE_LANGUAGES, languageDir } = await server.ssrLoadModule('@slidr/model');
  const shelf = fontShelf(JSON.parse(readFileSync(join(media, 'fonts', 'catalog.json'), 'utf8')));

  for (const name of ['index.json', 'managed.json']) {
    const file = join(media, 'elements', 'designs', name);
    if (!existsSync(file)) continue;
    const catalog = JSON.parse(readFileSync(file, 'utf8'));
    /** `from → to` in each language, and how many runs. */
    const report = new Map();
    let changed = 0;
    for (const [id, variants] of Object.entries(catalog.slides)) {
      for (const [lang, slide] of Object.entries(variants)) {
        if (BASE_LANGUAGES.includes(lang)) continue;
        const source = variants[languageDir(lang) === 'rtl' ? 'he' : 'en'];
        const result = setInLanguage(slide, source, lang, shelf);
        if (result.changes.length === 0) continue;
        variants[lang] = result.slide;
        changed++;
        for (const { from, to } of result.changes) {
          const key = `${lang}: ${from} → ${to}`;
          report.set(key, (report.get(key) ?? 0) + 1);
        }
        if (process.argv.includes('--verbose'))
          console.log(`  ${id}/${lang}: ${result.changes.length}`);
      }
    }
    console.log(`${name}: ${changed} slides`);
    for (const [key, count] of [...report].sort()) console.log(`  ${key} (${count})`);
    if (!check && changed > 0) writeFileSync(file, JSON.stringify(catalog));
  }
} finally {
  await server.close();
}
