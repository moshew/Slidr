// Puts built-in templates into the catalog the app reads: `Slidr-media/templates/catalog.json`,
// beside the repository (docs/media-library.md).
//
// A template is written as a TypeScript file that draws its theme, its layouts and its sample
// deck with the helpers of `packages/templates/src/builtin/kit.ts`, and exports `<id>Theme`,
// `<id>Samples` and `<id>Template`. The files are generator inputs and live beside those of the
// first eighteen, in `Slidr-media/archive/templates-source/`. The catalog holds what they draw:
// each template with the standard text layout and its Hebrew sample slides, and its sample deck
// as content in Hebrew and in English, and in any other language `<id>Samples` writes or the
// catalog already holds (the management studio writes translations into the catalog itself): a
// language the file does not write is kept, and checked against the layouts as they are now.
//
//   node scripts/export-templates.mjs <id> ...            write the templates into the catalog
//   node scripts/export-templates.mjs --check <id> ...    compare, and write nothing
//   node scripts/export-templates.mjs --source <dir> ...  a folder other than templates-source
//
// A template that is new is added after the others, in the order of the arguments; one that is
// there already is replaced in place. The records of the pictures (`images/templates/*.webp`)
// are written again first, so a sample may name a picture that was just added. The installed
// files (`templates/index.json`, `templates/<id>/template.json`) are written with the catalog.
//
// To add a template: write it in `templates-source/<id>.ts`, put its pictures in
// `Slidr-media/images/templates/` as `<id>-<name>.webp` (docs/reference-decks/scripts/picture.mjs),
// run this script, and give it a name and a tagline in both languages in
// `src/templates/messages.ts`. Run from apps/desktop.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { writePictures } from '../../../docs/reference-decks/scripts/pictures.mjs';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(desktop, '..', '..');
const media = resolve(repo, '..', 'Slidr-media');
const templatesDir = join(media, 'templates');
const catalogFile = join(templatesDir, 'catalog.json');
const builtin = join(repo, 'packages', 'templates', 'src', 'builtin');

const args = process.argv.slice(2);
const check = args.includes('--check');
const sourceAt = args.indexOf('--source');
const source =
  sourceAt === -1 ? join(media, 'archive', 'templates-source') : resolve(args[sourceAt + 1]);
const ids = args.filter(
  (arg, at) => !arg.startsWith('--') && (sourceAt === -1 || at !== sourceAt + 1),
);
if (ids.length === 0) {
  console.error('usage: export-templates.mjs [--check] [--source <dir>] <id> ...');
  process.exit(2);
}

/** What the kit, the contract and the pictures were called beside a template's file. */
const BESIDE = new Set(['./kit', './contract', './pictures.generated']);

/*
 * The files are TypeScript, written as if they stood in `packages/templates/src/builtin/`: a
 * name they import from there (`./kit`, `../template`) is answered from the package, a
 * template beside them (`./gan`) from their own folder, and a package by its name as if a file
 * of the app had imported it.
 */
const server = await createServer({
  configFile: false,
  root: desktop,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null, fs: { strict: false } },
  optimizeDeps: { noDiscovery: true, include: [] },
  ssr: { noExternal: [/^@slidr\//] },
  plugins: [
    {
      name: 'names-from-the-package',
      enforce: 'pre',
      async resolveId(id, importer, options) {
        if (!importer || id.startsWith('\0')) return null;
        const from = importer.split('?')[0].split('/').join(sep);
        if (!from.startsWith(source + sep)) return null;
        if (BESIDE.has(id)) return join(builtin, `${id.slice(2)}.ts`);
        if (id.startsWith('../')) return join(builtin, '..', `${id.slice(3)}.ts`);
        if (/^[./]/.test(id) || /^[a-zA-Z]:[\\/]/.test(id)) return null;
        return this.resolve(id, join(desktop, 'src', 'main.tsx'), { ...options, skipSelf: true });
      },
    },
  ],
});

/** The archetypes a built-in template draws, in the order the library shows them. */
const DRAWN = [
  'hero',
  'section',
  'bigNumber',
  'quote',
  'text',
  'textImage',
  'fullImage',
  'cards',
  'timeline',
  'process',
  'comparison',
  'chart',
  'table',
  'team',
  'closing',
];

let failed = 0;
try {
  // `--check` writes nothing: the records of the pictures too are written only by an export.
  if (!check) console.log(writePictures());
  const kit = await server.ssrLoadModule(join(builtin, 'kit.ts'));
  const { contractGaps } = await server.ssrLoadModule(join(builtin, 'contract.ts'));
  const { withStandardLayouts } = await server.ssrLoadModule(
    join(builtin, '..', 'standardLayouts.ts'),
  );
  const { Template } = await server.ssrLoadModule(join(builtin, '..', 'template.ts'));
  const { CONTENT_LANGUAGES, languageDir } = await server.ssrLoadModule('@slidr/model');

  /** The sample of the text layout every template has: the app's own words. */
  const textSample = (template, lang) => {
    const title = lang === 'he' ? 'כותרת השקף' : 'Slide title';
    const lead =
      lang === 'he'
        ? 'כאן אפשר להציג את הרעיון המרכזי ולפרט אותו בכמה שורות.'
        : 'Present the main idea here and explain it in a few lines.';
    const points =
      lang === 'he'
        ? [
            'נקודה ראשונה שתומכת ברעיון',
            'נקודה שנייה, עם דוגמה או מספר',
            'נקודה שלישית שמובילה הלאה',
          ]
        : [
            'A first point that supports the idea',
            'A second point, with an example or a figure',
            'A third point that leads on',
          ];
    return {
      layout: template.layouts.find((layout) => layout.archetype === 'text').id,
      name: title,
      content: {
        title: kit.text(title),
        body: { paragraphs: [kit.para(lead), ...kit.bullets(...points).paragraphs] },
      },
    };
  };
  /** Puts a slide among the others where its layout stands among the layouts. */
  const inLayoutOrder = (template, shown, added, layoutOf) => {
    const order = (id) => template.layouts.findIndex((layout) => layout.id === id);
    const at = shown.findIndex((item) => order(layoutOf(item)) > order(layoutOf(added)));
    shown.splice(at < 0 ? shown.length : at, 0, added);
  };

  const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
  let added = 0;
  let replaced = 0;
  for (const id of ids) {
    const file = join(source, `${id}.ts`);
    if (!existsSync(file)) throw new Error(`no template file: ${file}`);
    const module = await server.ssrLoadModule(file);
    const make = module[`${id}Template`];
    const samples = module[`${id}Samples`];
    if (!make || !samples) throw new Error(`${file} does not export ${id}Template, ${id}Samples`);

    const original = make();
    const template = withStandardLayouts(original);
    const shown = [...(original.sample ?? [])];
    const standard = textSample(template, 'he');
    if (!shown.some((slide) => slide.layoutId === standard.layout)) {
      const [slide] = kit.sampleSlides(template, [standard], { seed: 7301 });
      inLayoutOrder(template, shown, slide, (item) => item.layoutId);
    }
    template.sample = shown;
    const content = Object.fromEntries(
      ['he', 'en'].map((lang) => {
        const slides = [...samples[lang]];
        const text = textSample(template, lang);
        if (!slides.some((slide) => slide.layout === text.layout)) {
          inLayoutOrder(template, slides, text, (item) => item.layout);
        }
        return [lang, slides];
      }),
    );
    // The other languages: those the file writes, else those the catalog holds (the management
    // studio writes translations straight into it), so exporting a template again keeps them.
    const held = catalog.samples[id] ?? {};
    for (const lang of CONTENT_LANGUAGES) {
      if (lang === 'he' || lang === 'en') continue;
      const slides = samples[lang] ?? held[lang];
      if (slides) content[lang] = slides;
    }

    // What `builtin.test.ts` holds a template to, said here before anything is written.
    const problems = [];
    const parsed = Template.safeParse(template);
    if (!parsed.success) problems.push(`not a template: ${parsed.error.issues[0]?.message}`);
    if (template.theme.id !== id) problems.push(`its theme is "${template.theme.id}"`);
    if (template.layouts.map((layout) => layout.archetype).join() !== DRAWN.join()) {
      problems.push(`its layouts are ${template.layouts.map((l) => l.archetype).join(', ')}`);
    }
    problems.push(...template.layouts.flatMap(contractGaps));
    for (const lang of ['he', 'en']) {
      const has = new Set(content[lang].map((slide) => slide.layout));
      const missing = template.layouts.filter((layout) => !has.has(layout.id));
      if (missing.length) {
        problems.push(`the ${lang} sample shows no ${missing.map((l) => l.id).join(', ')}`);
      }
      // A sample that the layouts cannot seat throws here, not in the app.
      kit.sampleSlides(template, content[lang], { dir: lang === 'he' ? 'rtl' : 'ltr', lang });
    }
    // A language kept from the catalog has to fit the layouts as they are drawn now.
    for (const lang of Object.keys(content).filter((code) => code !== 'he' && code !== 'en')) {
      try {
        kit.sampleSlides(template, content[lang], { dir: languageDir(lang), lang });
      } catch (error) {
        problems.push(`the ${lang} sample no longer fits: ${error.message}`);
      }
    }
    if (problems.length) {
      failed += problems.length;
      console.error(`${id}:\n  ${problems.join('\n  ')}`);
      continue;
    }

    const at = catalog.templates.findIndex((held) => held.theme.id === id);
    if (check) {
      const same =
        at >= 0 &&
        JSON.stringify(catalog.templates[at]) === JSON.stringify(template) &&
        JSON.stringify(catalog.samples[id]) === JSON.stringify(content);
      if (!same) failed += 1;
      console.log(`${id}: ${same ? 'as the catalog holds it' : 'differs from the catalog'}`);
      continue;
    }
    if (at >= 0) {
      catalog.templates[at] = template;
      replaced += 1;
    } else {
      catalog.templates.push(template);
      added += 1;
    }
    catalog.samples[id] = content;
    console.log(`${id}: ${template.layouts.length} layouts, ${content.he.length} sample slides`);
  }

  if (!check && failed === 0) {
    // The samples in the order of the templates, as the file has always had them.
    catalog.samples = Object.fromEntries(
      catalog.templates.map(({ theme }) => [theme.id, catalog.samples[theme.id]]),
    );
    writeFileSync(catalogFile, JSON.stringify(catalog));
    // The installed files, as a build writes them (`templateFiles` in build/media.ts).
    const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
    writeFileSync(
      join(templatesDir, 'index.json'),
      json(catalog.templates.map(({ theme }) => theme.id)),
    );
    for (const held of catalog.templates) {
      if (!ids.includes(held.theme.id)) continue;
      // A template is installed as a deck takes it: without its sample and their pictures.
      const installed = Object.fromEntries(
        Object.entries(held).filter(([key]) => key !== 'sample' && key !== 'assets'),
      );
      mkdirSync(join(templatesDir, held.theme.id), { recursive: true });
      writeFileSync(join(templatesDir, held.theme.id, 'template.json'), json(installed));
    }
    console.log(
      `${added} added, ${replaced} replaced: ${catalog.templates.length} templates, ${catalogFile}`,
    );
  } else if (!check) {
    console.error('nothing was written');
  }
} finally {
  await server.close();
}
process.exit(failed ? 1 : 0);
