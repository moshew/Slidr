// Puts ready-made slides of Elements → Designs into the catalog the app reads:
// `Slidr-media/elements/designs/index.json`, beside the repository (docs/media-library.md).
//
// A design is written as a `Design` record in a pack file, a TypeScript object of designs by id
// that draws its slide with the helpers of `designKit.ts`. The pack files and the kit are
// generator inputs and live in `Slidr-media/elements/source/` (`designKit.ts`,
// `design-packs/<pack>.ts`); the files of the first 125 are in `Slidr-media/archive/elements-source/`.
// The catalog holds what they draw: each design's slide in Hebrew and in English, with the
// picture named `__subject__` (and `__backdrop__` where a photograph lies under a cut-out), the
// point on its picture's subject, and the groups of the gallery in the order they are shown.
//
//   node scripts/export-designs.mjs <pack>[=<group>] ...        write the packs into the catalog
//   node scripts/export-designs.mjs --check <pack>[=<group>] ... compare, and write nothing
//   node scripts/export-designs.mjs --source <dir> ...          a folder other than elements/source
//   node scripts/export-designs.mjs --order a,b,c ...           the gallery's order of groups
//
// A pack joins the group of its own name unless one is given (`talk=deck`). A group that is not
// in the catalog yet is added after the others, in the order of the arguments; a design that is
// new is added after its group's others, and one that is there already is replaced in place.
// So a batch is landed by one call that names its packs, and a design that was changed in its
// pack file is landed again by naming its pack. `--order` names every group of the catalog as
// the gallery should show them, the new ones among them.
//
// To add a design: write it in a pack file, put its picture in `Slidr-media/images/designs/`
// as `<id>.webp` (and `<id>-bg.webp`), run this script, then `node scripts/design-asset-sizes.mjs`,
// and give it a name in both `designs.name` blocks of `src/elements/messages.ts` (and its group
// one in `designs.group`, if the group is new). `src/elements/designs.test.ts` counts the designs
// and the groups. Run from apps/desktop.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const media = resolve(desktop, '..', '..', '..', 'Slidr-media');
const catalogFile = join(media, 'elements', 'designs', 'index.json');
const pictures = join(media, 'images', 'designs');

const args = process.argv.slice(2);
const check = args.includes('--check');
const sourceAt = args.indexOf('--source');
const source = sourceAt === -1 ? join(media, 'elements', 'source') : resolve(args[sourceAt + 1]);
const orderAt = args.indexOf('--order');
const order = orderAt === -1 ? undefined : args[orderAt + 1].split(',');
const packs = args
  .filter(
    (arg, at) =>
      !arg.startsWith('--') &&
      (sourceAt === -1 || at !== sourceAt + 1) &&
      (orderAt === -1 || at !== orderAt + 1),
  )
  .map((arg) => {
    const [pack, group = pack] = arg.split('=');
    return { pack, group };
  });
if (packs.length === 0) {
  console.error('usage: export-designs.mjs [--check] [--source <dir>] <pack>[=<group>] ...');
  process.exit(2);
}

/*
 * The pack files are TypeScript and import the app's packages by name, from a folder that has
 * no packages of its own: Vite loads them, and a name they import is looked up as if a file of
 * the app had imported it.
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
      name: 'names-from-the-app',
      enforce: 'pre',
      async resolveId(id, importer, options) {
        if (!importer || /^[./]/.test(id) || /^[a-zA-Z]:[\\/]/.test(id) || id.startsWith('\0')) {
          return null;
        }
        const from = importer.split('?')[0].split('/').join(sep);
        if (from.startsWith(desktop + sep) || from.includes(`${sep}node_modules${sep}`))
          return null;
        return this.resolve(id, join(desktop, 'src', 'main.tsx'), { ...options, skipSelf: true });
      },
    },
  ],
});

/** Everything but the ids a slide and its elements are given when they are made. */
function withoutIds(value) {
  if (Array.isArray(value)) return value.map(withoutIds);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'id')
      .map(([key, inner]) => [key, withoutIds(inner)]),
  );
}

let failed = 0;
try {
  const kit = await server.ssrLoadModule(join(source, 'designKit.ts'));
  const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
  let added = 0;
  let replaced = 0;
  for (const { pack, group } of packs) {
    const file = join(source, 'design-packs', `${pack}.ts`);
    if (!existsSync(file)) throw new Error(`no pack file: ${file}`);
    const designs = (await server.ssrLoadModule(file))[pack];
    if (!designs) throw new Error(`${file} does not export "${pack}"`);
    const differ = [];
    for (const [id, design] of Object.entries(designs)) {
      const slides = {
        he: kit.drawDesign(id, design, 'he', '__subject__', '__backdrop__'),
        en: kit.drawDesign(id, design, 'en', '__subject__', '__backdrop__'),
      };
      // A slide that names a backdrop needs its file, and a file that is there must be named.
      const named = new Set(
        [...slides.he.elements, ...slides.en.elements].flatMap((element) =>
          element.type === 'image' ? [element.assetId] : [],
        ),
      );
      if (!existsSync(join(pictures, `${id}.webp`))) {
        console.error(`  ${id}: no picture ${id}.webp in ${pictures}`);
        failed += 1;
      }
      if (named.has('__backdrop__') !== existsSync(join(pictures, `${id}-bg.webp`))) {
        console.error(`  ${id}: the slide and the folder disagree about a backdrop, ${id}-bg.webp`);
        failed += 1;
      }
      if (check) {
        const held = catalog.slides[id];
        const same =
          held &&
          JSON.stringify(withoutIds(held)) === JSON.stringify(withoutIds(slides)) &&
          JSON.stringify(catalog.subjects[id]) === JSON.stringify(design.subject) &&
          (catalog.groupIds[group] ?? []).includes(id);
        if (!same) differ.push(id);
        continue;
      }
      if (!catalog.groups.includes(group)) catalog.groups.push(group);
      const ids = (catalog.groupIds[group] ??= []);
      // A design has one group: it leaves any other it was filed under.
      for (const [other, others] of Object.entries(catalog.groupIds)) {
        if (other !== group && others.includes(id)) others.splice(others.indexOf(id), 1);
      }
      if (ids.includes(id)) replaced += 1;
      else {
        ids.push(id);
        added += 1;
      }
      catalog.slides[id] = slides;
      catalog.subjects[id] = design.subject;
    }
    const count = Object.keys(designs).length;
    if (check) {
      failed += differ.length;
      console.log(
        `${pack} → ${group}: ${count} designs, ${differ.length ? `${differ.length} differ from the catalog: ${differ.join(' ')}` : 'as the catalog holds them'}`,
      );
    } else {
      console.log(`${pack} → ${group}: ${count} designs`);
    }
  }
  if (!check && order) {
    const same =
      order.length === catalog.groups.length &&
      [...order].sort().join() === [...catalog.groups].sort().join();
    if (same) catalog.groups = order;
    else {
      console.error(`--order must name each group once: ${catalog.groups.join(',')}`);
      failed += 1;
    }
  }
  if (!check && failed === 0) {
    // The groups' lists in the order of the groups, as the file has always had them.
    catalog.groupIds = Object.fromEntries(
      catalog.groups.map((name) => [name, catalog.groupIds[name]]),
    );
    writeFileSync(catalogFile, JSON.stringify(catalog));
    const total = catalog.groups.reduce((sum, name) => sum + catalog.groupIds[name].length, 0);
    console.log(
      `${added} added, ${replaced} replaced: ${total} designs in ${catalog.groups.length} groups, ${catalogFile}`,
    );
  } else if (!check) {
    console.error('nothing was written');
  }
} finally {
  await server.close();
}
process.exit(failed ? 1 : 0);
