// Add all fourteen additional languages to the fifteen existing culture designs.
// See design-locales/culture/README.md. No network calls; only --out is written.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const copyDir = join(desktop, 'scripts', 'design-locales', 'culture');
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  if (at < 0 || !args[at + 1]) throw new Error(`Missing ${name} <file>`);
  return resolve(args[at + 1]);
};
const read = (file) => JSON.parse(readFileSync(file, 'utf8'));
const catalog = read(option('--catalog'));
const fonts = read(option('--fonts'));
const out = option('--out');
const expected = read(join(copyDir, 'source.json'));
const fits = read(join(copyDir, 'fit.json'));
const textElements = (slide) => slide.elements.filter((element) => element.content?.paragraphs);
const plain = (element) =>
  element.content.paragraphs.map((p) => p.runs.map((r) => r.text).join('')).join('\n');

const server = await createServer({
  configFile: false,
  root: desktop,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  ssr: { noExternal: [/^@slidr\//] },
});
try {
  const { CONTENT_LANGUAGES, Slide } = await server.ssrLoadModule('@slidr/model');
  const { fontShelf, setInLanguage, familyIn } = await server.ssrLoadModule(
    join(desktop, 'src', 'elements', 'designFonts.ts'),
  );
  const shelf = fontShelf(fonts);
  const ids = Object.keys(expected);
  if (ids.length !== 15 || JSON.stringify(ids) !== JSON.stringify(catalog.groupIds.culture)) {
    throw new Error('The culture group must contain the fifteen designs of source.json in order.');
  }
  for (const id of ids) {
    const english = textElements(catalog.slides[id].en).map(plain);
    if (JSON.stringify(english) !== JSON.stringify(expected[id])) {
      throw new Error(
        `English source changed: ${id}. Review the translations before regenerating.`,
      );
    }
  }
  let count = 0;
  for (const lang of CONTENT_LANGUAGES.filter((lang) => !['he', 'en'].includes(lang))) {
    const translated = read(join(copyDir, `${lang}.json`));
    if (JSON.stringify(Object.keys(translated).sort()) !== JSON.stringify([...ids].sort())) {
      throw new Error(`${lang}: missing or unexpected designs`);
    }
    for (const id of ids) {
      const source = catalog.slides[id][lang === 'ar' ? 'he' : 'en'];
      const slide = structuredClone(source);
      const boxes = textElements(slide);
      const strings = translated[id];
      if (strings.length !== boxes.length) throw new Error(`${id}/${lang}: wrong text count`);
      boxes.forEach((element, at) => {
        if (typeof strings[at] !== 'string' || !strings[at].trim()) {
          throw new Error(`${id}/${lang}/${at}: empty translation`);
        }
        const original = element.content.paragraphs;
        element.content.paragraphs = strings[at].split('\n').map((text, p) => {
          const paragraph = structuredClone(original[Math.min(p, original.length - 1)]);
          if (paragraph.runs.length !== 1) throw new Error(`${id}: review styled multi-run text`);
          paragraph.runs[0].text = text;
          return paragraph;
        });
      });
      const localized = setInLanguage(slide, source, lang, shelf).slide;
      // Tight Latin display leading does not leave room for Vietnamese accents, Arabic
      // descenders or full-height Asian glyphs. Preserve the faces, with room between lines.
      if (['ar', 'vi', 'hi', 'ja', 'ko', 'zh-CN'].includes(lang)) {
        const leading = lang === 'hi' ? 1.5 : lang === 'vi' ? 1.4 : 1.2;
        for (const element of textElements(localized)) {
          if (element.content.paragraphs.length < 2) continue;
          for (const paragraph of element.content.paragraphs) {
            paragraph.lineHeight = Math.max(paragraph.lineHeight ?? leading, leading);
          }
        }
      }
      textElements(localized).forEach((element, at) => {
        const factor = fits[lang]?.[id]?.[at] ?? 1;
        if (!(factor > 0 && factor <= 1)) throw new Error(`${id}/${lang}/${at}: invalid fit`);
        for (const p of element.content.paragraphs) {
          for (const run of p.runs) {
            if (factor !== 1) run.marks.size = Math.floor(run.marks.size * factor * 10) / 10;
            const family = run.marks.font;
            if (familyIn(shelf, family, lang, run.text) !== family) {
              throw new Error(`${id}/${lang}: font lacks letters: ${family}`);
            }
          }
        }
      });
      Slide.parse(localized);
      catalog.slides[id][lang] = localized;
      count++;
    }
  }
  writeFileSync(out, JSON.stringify(catalog));
  console.log(
    `${ids.length} designs × ${CONTENT_LANGUAGES.length} languages; ${count} localized slides → ${out}`,
  );
} finally {
  await server.close();
}
