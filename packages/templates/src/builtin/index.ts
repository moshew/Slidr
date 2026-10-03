// The templates Slidr ships with (THM-01, WG7-T04). Each is derived from a reference deck under
// `docs/reference-decks/`: the deck set the design, the template is what of it a theme and
// fourteen layouts can carry.
import type { Theme } from '@slidr/model';
import type { Template } from '../template';
import type { SampleSlide } from './kit';
import { shvilSamples, shvilTemplate, shvilTheme } from './shvil';
import { tzukSamples, tzukTemplate, tzukTheme } from './tzuk';
import { zeremSamples, zeremTemplate, zeremTheme } from './zerem';

export { pictures } from './pictures.generated';
export { sampleDeck, type SampleSlide } from './kit';
export { zeremTemplate };

/** The themes of the built-in templates, by template id. */
export const builtInThemes: Record<string, Theme> = {
  zerem: zeremTheme,
  shvil: shvilTheme,
  tzuk: tzukTheme,
};

/** The built-in templates, in the order the library shows them. */
export function builtInTemplates(): Template[] {
  return [zeremTemplate(), shvilTemplate(), tzukTemplate()];
}

/**
 * The sample deck of each built-in template in Hebrew and in English, as content for its
 * layouts: the reference deck the template was derived from, rebuilt on the template.
 */
export const builtInSamples: Record<string, { he: SampleSlide[]; en: SampleSlide[] }> = {
  zerem: zeremSamples,
  shvil: shvilSamples,
  tzuk: tzukSamples,
};
