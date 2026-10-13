/**
 * The sample decks of the built-in templates, as the library draws them under a template: the
 * slides the template was authored with, and where their pictures load from.
 *
 * The samples are read from the catalog of the media library when a template is first opened,
 * not with the app: the catalog holds every template with its samples, in both languages. So
 * nothing here imports `@slidr/templates/builtin`, whose catalog is read as it is imported.
 */
import type { AssetMeta, Deck } from '@slidr/model';
import type { Template } from '@slidr/templates';
import { sampleDeck, type SampleSlide } from '@slidr/templates/builtin/kit';
import { pictures } from '@slidr/templates/builtin/pictures';
import catalogUrl from '../../../../../Slidr-media/templates/catalog.json?url';

const files = import.meta.glob<string>('../../../../../Slidr-media/images/templates/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

const urls = new Map<string, string>();
for (const picture of Object.values(pictures)) {
  const path = Object.keys(files).find((file) => file.endsWith(`/${picture.name}`));
  if (path) urls.set(picture.id, files[path]!);
}

const pictureAssets: Record<string, AssetMeta> = Object.fromEntries(
  Object.values(pictures).map((picture) => [picture.id, picture]),
);

/** Where a picture of the built-in samples loads from; undefined for any other asset. */
export function pictureUrl(asset: AssetMeta): string | undefined {
  return urls.get(asset.id);
}

type Samples = Record<string, { he: SampleSlide[]; en: SampleSlide[] }>;

let read: Promise<Samples> | undefined;

/** The samples of the catalog, by template id. Read once; a failed read is tried again. */
function samples(): Promise<Samples> {
  read ??= fetch(catalogUrl)
    .then(async (response) => {
      if (!response.ok) throw new Error(`The catalog of the templates: ${response.status}`);
      return ((await response.json()) as { samples: Samples }).samples;
    })
    .catch((error: unknown) => {
      read = undefined;
      throw error;
    });
  return read;
}

/** The layouts every template has for a slide of words alone: their samples are the app's own words. */
const PLAIN = new Set(['title', 'text']);

/**
 * Whether a sample slide shows the template as a finished slide. Not one of a layout the
 * library's template does not keep, which has nothing to be drawn on; not one of the plain
 * layouts, whose sample is "Slide title" and no more; and not one whose picture is only
 * described, which would be drawn as an empty frame.
 */
function finished(slide: SampleSlide, template: Template): boolean {
  const layout = template.layouts.find((candidate) => candidate.id === slide.layout);
  if (!layout || PLAIN.has(layout.archetype)) return false;
  return !Object.values(slide.content)
    .flat()
    .some((fill) => 'imagePrompt' in fill);
}

/**
 * The sample deck of a built-in template in the language and direction of `like`; undefined
 * when the catalog has no sample for it. `template` is the one the library holds, which comes
 * without the pictures of its sample.
 */
export async function builtInSampleDeck(template: Template, like: Deck): Promise<Deck | undefined> {
  const mine = (await samples())[template.theme.id];
  if (!mine) return undefined;
  const slides = (like.meta.lang === 'he' ? mine.he : mine.en).filter((slide) =>
    finished(slide, template),
  );
  if (slides.length === 0) return undefined;
  const assets = { ...pictureAssets, ...template.assets };
  return sampleDeck({ ...template, assets }, slides, {
    lang: like.meta.lang,
    dir: like.meta.dir,
  });
}
