// Adds the technology templates and ready-made slides of this package to an author's copy of the
// media library (docs/media-library.md), as `pnpm media:publish` then publishes it:
//
//   node merge-into-library.mjs <library> [--dry-run]       e.g. node merge-into-library.mjs ../Slidr-media
//
// It reads the folder it sits in:
//   templates/catalog.tech.json         templates, their samples and the pictures of the samples
//   images/templates/*.webp             those pictures
//   elements/designs/managed.tech.json  ready-made slides, by topic
//   images/designs/*.webp               their pictures
// and merges them into the library's `templates/catalog.json` and `elements/designs/managed.json`:
// a template or a design with an id the library has already is replaced in place, a new one is
// added after the others of its kind. Running it twice changes nothing more. Nothing else of the
// library is touched.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const library = args.find((arg) => !arg.startsWith('--'));
if (!library) {
  console.error('usage: node merge-into-library.mjs <library folder> [--dry-run]');
  process.exit(2);
}
const root = resolve(library);
if (!existsSync(join(root, 'templates')) && !existsSync(join(root, 'elements'))) {
  console.error(
    `${root} does not look like a copy of the media library (no templates/ or elements/).`,
  );
  process.exit(1);
}

const read = (file, fallback) =>
  existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
const write = (file, value, { compact = false } = {}) => {
  if (dry) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, compact ? JSON.stringify(value) : `${JSON.stringify(value, null, 2)}\n`);
};
const copyAll = (from, to) => {
  if (!existsSync(from)) return 0;
  const names = readdirSync(from).filter((name) => name.endsWith('.webp'));
  if (!dry) mkdirSync(to, { recursive: true });
  for (const name of names) if (!dry) copyFileSync(join(from, name), join(to, name));
  return names.length;
};

// ---- templates
const tech = read(join(here, 'templates', 'catalog.tech.json'), undefined);
if (tech) {
  const file = join(root, 'templates', 'catalog.json');
  const catalog = read(file, { templates: [], samples: {}, originals: {}, pictures: {} });
  catalog.templates ??= [];
  catalog.samples ??= {};
  catalog.pictures ??= {};
  const added = [];
  const replaced = [];
  for (const template of tech.templates) {
    const id = template.theme.id;
    const at = catalog.templates.findIndex((t) => t.theme.id === id);
    if (at >= 0) {
      catalog.templates[at] = template;
      replaced.push(id);
    } else {
      catalog.templates.push(template);
      added.push(id);
    }
    catalog.samples[id] = tech.samples[id];
  }
  Object.assign(catalog.pictures, tech.pictures);
  // As export-templates.mjs writes it: indented, the catalog would pass the 25 MB Pages serves.
  write(file, catalog, { compact: true });
  const pictures = copyAll(join(here, 'images', 'templates'), join(root, 'images', 'templates'));
  console.log(
    `templates/catalog.json: ${added.length} added (${added.join(', ') || '-'}), ` +
      `${replaced.length} replaced (${replaced.join(', ') || '-'}); ${pictures} pictures copied.`,
  );
}

// ---- ready-made slides
const designs = read(join(here, 'elements', 'designs', 'managed.tech.json'), undefined);
if (designs) {
  const file = join(root, 'elements', 'designs', 'managed.json');
  const managed = read(file, {
    version: 1,
    groups: [],
    groupNames: {},
    groupIds: {},
    slides: {},
    subjects: {},
    names: {},
    sizes: {},
  });
  // The names of the topics, should the library not have one of them yet.
  const TOPICS = {
    hitech: { he: 'הייטק', en: 'High-tech' },
    techproduct: { he: 'מוצר טכנולוגי', en: 'Tech products' },
    defense: { he: 'דיפנס־טק', en: 'Defence tech' },
    food: { he: 'אוכל ומסעדות', en: 'Food & restaurants' },
    tourism: { he: 'טיולים ותיירות', en: 'Travel & tourism' },
  };
  let count = 0;
  for (const [group, ids] of Object.entries(designs.groupIds)) {
    if (!managed.groups.includes(group)) managed.groups.push(group);
    managed.groupNames[group] ??= TOPICS[group] ?? { he: group, en: group };
    managed.groupIds[group] ??= [];
    for (const id of ids) {
      if (!managed.groupIds[group].includes(id)) managed.groupIds[group].push(id);
      managed.slides[id] = designs.slides[id];
      managed.subjects[id] = designs.subjects[id];
      managed.names[id] = designs.names[id];
      if (designs.sizes[id]) managed.sizes[id] = designs.sizes[id];
      count += 1;
    }
  }
  write(file, managed);
  const pictures = copyAll(join(here, 'images', 'designs'), join(root, 'images', 'designs'));
  console.log(
    `elements/designs/managed.json: ${count} designs merged; ${pictures} pictures copied.`,
  );
}

console.log(dry ? 'Dry run: nothing was written.' : 'Done. Publish with: pnpm media:publish');
