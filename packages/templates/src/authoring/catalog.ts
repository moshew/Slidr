/**
 * Writes what is authored here as the media library holds it, into a folder laid out like the
 * library (docs/media-library.md), for `merge-into-library.mjs` to add to an author's copy:
 *
 *   templates/catalog.tech.json      { templates, samples, pictures } of the templates authored here
 *   images/templates/<name>.webp     the pictures of their samples
 *   elements/designs/managed.tech.json  { groups, groupIds, slides, subjects, names, sizes }
 *   images/designs/<id>.webp         the pictures of the ready-made slides
 *
 * Run through Vite: `node tools/run-ts.mjs src/authoring/catalog.ts <out>`.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AssetMeta } from '@slidr/model';
import { Template } from '../template';
import { techPictures } from './pictures';
import { authored } from './registry';
import { newDesigns } from './designs/registry';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** The order the library shows them in: after the templates it has. */
const ORDER = ['anan', 'shvav', 'mutzar', 'atlas'];

export default function build(out: string, only?: string) {
  const ids = Object.keys(authored)
    .filter((id) => !only || only.split(',').includes(id))
    .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const templates = ids.map((id) => {
    const template = authored[id]!.template();
    const parsed = Template.safeParse(template);
    if (!parsed.success) throw new Error(`${id}: ${parsed.error.issues[0]?.message}`);
    return template;
  });
  const samples = Object.fromEntries(ids.map((id) => [id, authored[id]!.samples]));
  const used = new Set(templates.flatMap((template) => Object.keys(template.assets ?? {})));
  const pictures: Record<string, AssetMeta> = Object.fromEntries(
    Object.entries(techPictures).filter(([, asset]) => used.has(asset.id)),
  );

  mkdirSync(join(out, 'templates'), { recursive: true });
  mkdirSync(join(out, 'images', 'templates'), { recursive: true });
  writeFileSync(
    join(out, 'templates', 'catalog.tech.json'),
    `${JSON.stringify({ templates, samples, pictures }, null, 1)}\n`,
  );
  for (const asset of Object.values(pictures)) {
    const name = asset.name ?? asset.file;
    copyFileSync(join(HERE, 'pictures', name), join(out, 'images', 'templates', name));
  }

  const designs = newDesigns();
  const designIds = Object.values(designs.groupIds).flat();
  mkdirSync(join(out, 'elements', 'designs'), { recursive: true });
  mkdirSync(join(out, 'images', 'designs'), { recursive: true });
  writeFileSync(
    join(out, 'elements', 'designs', 'managed.tech.json'),
    `${JSON.stringify({ version: 1, groups: Object.keys(designs.groupIds), ...designs }, null, 1)}\n`,
  );
  for (const id of designIds) {
    copyFileSync(
      join(HERE, 'pictures', 'designs', `${id}.webp`),
      join(out, 'images', 'designs', `${id}.webp`),
    );
  }
  console.log(
    `${templates.length} templates (${ids.join(', ')}), ${Object.keys(pictures).length} pictures; ` +
      `${designIds.length} designs -> ${out}`,
  );
}
