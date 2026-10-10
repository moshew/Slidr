import type { Theme } from '@slidr/model';
import source from '../../../../../Slidr-media/templates/catalog.json?raw';
import type { Template } from '../template';
import { sampleDeck, type SampleSlide } from './kit';
import { pictures } from './pictures.generated';

/** The authored template layouts and sample content live in the external media library. */
const catalog = JSON.parse(source) as {
  templates: Template[];
  samples: Record<string, { he: SampleSlide[]; en: SampleSlide[] }>;
  originals: Record<string, Template>;
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export { contractGaps, OPTIONAL, ROLE_CONTRACT } from './contract';
export { pictures, sampleDeck, type SampleSlide };

export const builtInThemes: Record<string, Theme> = Object.fromEntries(
  catalog.templates.map((template) => [template.theme.id, template.theme]),
);

export function builtInTemplates(): Template[] {
  return copy(catalog.templates);
}

export const builtInSamples = catalog.samples;

/** Original, pre-standard-layout variants used by template composition checks. */
export const zeremTemplate = (): Template => copy(catalog.originals.zerem!);
export const tzukTemplate = (): Template => copy(catalog.originals.tzuk!);
export const mifgashTemplate = (): Template => copy(catalog.originals.mifgash!);
