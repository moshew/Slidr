// Add all fourteen additional languages to an existing design collection.
// Defaults to design-locales/culture; --locales selects another reviewed collection.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const localesAt = args.indexOf('--locales');
const copyDir =
  localesAt < 0
    ? join(desktop, 'scripts', 'design-locales', 'culture')
    : resolve(args[localesAt + 1]);
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
const artFile = join(copyDir, 'art.json');
const art = existsSync(artFile) ? read(artFile) : {};
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
  if (ids.length === 0 || ids.some((id) => !catalog.slides[id])) {
    throw new Error('source.json must name existing designs.');
  }
  if (localesAt < 0 && JSON.stringify(ids) !== JSON.stringify(catalog.groupIds.culture)) {
    throw new Error('The culture group must contain the designs of source.json in order.');
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
    // Legacy shell encodings can silently replace translated letters with question marks.
    const assertCopy = (value) => {
      if (typeof value === 'string') {
        if (/\?{2,}|\p{L}\?\p{L}|\ufffd/u.test(value)) {
          throw new Error(`${lang}: damaged translation encoding: ${value}`);
        }
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(assertCopy);
      }
    };
    assertCopy(translated);
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
        const original = element.content.paragraphs;
        // Explicit runs retain emphasis, or give an age's unit a smaller size beside its numeral.
        const segments = strings[at]?.runs;
        if (segments !== undefined) {
          if (
            original.length !== 1 ||
            !Array.isArray(segments) ||
            segments.length === 0 ||
            (original[0].runs.length !== 1 && segments.length !== original[0].runs.length) ||
            segments.some((segment) => {
              const text = typeof segment === 'string' ? segment : segment?.text;
              return (
                typeof text !== 'string' ||
                !text.trim() ||
                (typeof segment !== 'string' && !(segment.scale > 0 && segment.scale <= 1))
              );
            })
          ) {
            throw new Error(`${id}/${lang}/${at}: translated runs do not match the source`);
          }
          const styles = original[0].runs;
          original[0].runs = segments.map((segment, r) => {
            const run = structuredClone(styles[Math.min(r, styles.length - 1)]);
            run.text = typeof segment === 'string' ? segment : segment.text;
            if (typeof segment !== 'string') run.marks.size *= segment.scale;
            return run;
          });
          return;
        }
        if (typeof strings[at] !== 'string' || !strings[at].trim()) {
          throw new Error(`${id}/${lang}/${at}: empty translation`);
        }
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
            // Connected scripts do not take the source's Latin display tracking.
            if (
              ['ar', 'hi'].includes(lang) &&
              /[\p{Script=Arabic}\p{Script=Devanagari}]/u.test(run.text)
            ) {
              run.marks.letterSpacing = 0;
            }
            if (factor !== 1) run.marks.size = Math.floor(run.marks.size * factor * 10) / 10;
            const family = run.marks.font;
            if (familyIn(shelf, family, lang, run.text) !== family) {
              throw new Error(`${id}/${lang}: font lacks letters: ${family}`);
            }
          }
        }
      });
      // Authored SVG adjustments keep decorations clear of translated text. Picture assets
      // and text boxes are deliberately outside this override's scope.
      for (const patch of art[lang]?.[id] ?? []) {
        const element = localized.elements[patch.at];
        if (element?.type !== 'svg' || element.id !== patch.id) {
          throw new Error(`${id}/${lang}: artwork source changed`);
        }
        element.frame = patch.frame;
        element.markup = patch.markup;
      }
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
