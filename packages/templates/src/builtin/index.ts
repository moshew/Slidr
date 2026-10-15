import { readMediaJson } from '@slidr/media-library';
import { languagesOf, type Localized, type Theme } from '@slidr/model';
import type { Template } from '../template';
import { withoutTitleLayout } from '../standardLayouts';
import { sampleDeck, type SampleSlide } from './kit';
import { pictures } from './pictures.generated';

interface Catalog {
  templates: Template[];
  /** In Hebrew and in English, and in any other language the template's author wrote them. */
  samples: Record<string, Localized<SampleSlide[]> | undefined>;
  originals: Record<string, Template | undefined>;
}

/**
 * The authored template layouts and sample content: the catalog of the media library
 * (`templates/catalog.json`), read as this module is imported. Without it (no network, no
 * library, an empty one) there are no built-in templates, and `builtInAvailable` says so.
 */
const read = await readMediaJson<Partial<Catalog>>('templates/catalog.json');
const catalog: Catalog = {
  templates: Array.isArray(read?.templates) ? read.templates : [],
  samples: read?.samples ?? {},
  originals: read?.originals ?? {},
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export { contractGaps, OPTIONAL, ROLE_CONTRACT } from './contract';
export { pictures, sampleDeck, type SampleSlide };

/** Whether the media library's catalog of templates was read: the tests of its content need it. */
export const builtInAvailable = catalog.templates.length > 0;

export const builtInThemes: Record<string, Theme> = Object.fromEntries(
  catalog.templates.map((template) => [template.theme.id, template.theme]),
);

export function builtInTemplates(): Template[] {
  return copy(catalog.templates).map(withoutTitleLayout);
}

export const builtInSamples: Record<string, Localized<SampleSlide[]>> = Object.fromEntries(
  builtInTemplates().map((template) => {
    const ids = new Set(template.layouts.map((layout) => layout.id));
    const samples = catalog.samples[template.theme.id] ?? { he: [], en: [] };
    const shown = (slides: SampleSlide[] = []) => slides.filter((slide) => ids.has(slide.layout));
    return [
      template.theme.id,
      {
        he: shown(samples.he),
        en: shown(samples.en),
        ...Object.fromEntries(
          languagesOf(samples)
            .filter((lang) => lang !== 'he' && lang !== 'en')
            .map((lang) => [lang, shown(samples[lang])]),
        ),
      },
    ];
  }),
);

function original(id: string): Template {
  const template = catalog.originals[id];
  if (!template) throw new Error(`The media library has no original of the template "${id}".`);
  return copy(template);
}

/** Original, pre-standard-layout variants used by template composition checks. */
export const zeremTemplate = (): Template => original('zerem');
export const tzukTemplate = (): Template => original('tzuk');
export const mifgashTemplate = (): Template => original('mifgash');
