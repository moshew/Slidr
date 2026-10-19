/**
 * Adds the fourteen translated samples to an existing library catalog without replacing its
 * templates, base samples, other translations or pictures. All variants are checked before writing.
 * From packages/templates:
 *   node src/authoring/tools/run-ts.mjs src/authoring/technology/export.ts <catalog.json> [<out.json>]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { CONTENT_LANGUAGES, languageDir } from '@slidr/model';
import { sampleSlides } from '../../builtin/kit';
import { Template } from '../../template';
import { entry as anan } from '../anan';
import { entry as mutzar } from '../mutzar';
import { entry as shvav } from '../shvav';

export default function exportSamples(file: string, out = file) {
  if (!file)
    throw new Error('Pass the library’s templates/catalog.json and optionally an output file.');
  const catalog = JSON.parse(readFileSync(file, 'utf8')) as {
    templates: Template[];
    samples: Record<string, typeof anan.samples>;
  };
  for (const entry of [anan, shvav, mutzar]) {
    const template = Template.parse(catalog.templates.find((t) => t.theme.id === entry.id));
    const held = catalog.samples[entry.id];
    if (!held?.he || !held.en) throw new Error(`${entry.id}: the base samples are missing`);
    for (const lang of CONTENT_LANGUAGES) {
      if (lang === 'he' || lang === 'en') continue;
      const sample = entry.samples[lang]!;
      sampleSlides(template, sample, { lang, dir: languageDir(lang) });
      held[lang] = sample;
    }
    console.log(
      `${entry.id}: ${CONTENT_LANGUAGES.length} languages, ${held.en.length} slides each`,
    );
  }
  writeFileSync(out, `${JSON.stringify(catalog)}\n`);
  console.log(out);
}
