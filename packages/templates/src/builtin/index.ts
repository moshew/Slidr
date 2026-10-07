// The templates Slidr ships with (THM-01, WG7-T04, WG7-T10). The first three are each derived
// from a reference deck under `docs/reference-decks/`: the deck set the design, the template is
// what of it a theme and fourteen layouts can carry. The seven after them were drawn as
// templates from the start (ADR-063), and so were the five after them, each after a style of
// slide design the first ten have none of (ADR-070). The last, `shidur`, is drawn after a webinar
// deck: slanted slabs of royal blue and hot pink accents on white.
import type { Theme } from '@slidr/model';
import type { Template } from '../template';
import type { SampleSlide } from './kit';
import { ariachSamples, ariachTemplate, ariachTheme } from './ariach';
import { boletSamples, boletTemplate, boletTheme } from './bolet';
import { defusSamples, defusTemplate, defusTheme } from './defus';
import { ganSamples, ganTemplate, ganTheme } from './gan';
import { hodSamples, hodTemplate, hodTheme } from './hod';
import { lavanSamples, lavanTemplate, lavanTheme } from './lavan';
import { laylaSamples, laylaTemplate, laylaTheme } from './layla';
import { migdalSamples, migdalTemplate, migdalTheme } from './migdal';
import { nofSamples, nofTemplate, nofTheme } from './nof';
import { shidurSamples, shidurTemplate, shidurTheme } from './shidur';
import { shvilSamples, shvilTemplate, shvilTheme } from './shvil';
import { sirtutSamples, sirtutTemplate, sirtutTheme } from './sirtut';
import { tzukSamples, tzukTemplate, tzukTheme } from './tzuk';
import { zeremSamples, zeremTemplate, zeremTheme } from './zerem';
import { zivSamples, zivTemplate, zivTheme } from './ziv';
import { zoharSamples, zoharTemplate, zoharTheme } from './zohar';

export { contractGaps, OPTIONAL, ROLE_CONTRACT } from './contract';
export { pictures } from './pictures.generated';
export { sampleDeck, type SampleSlide } from './kit';
export { zeremTemplate };

/** The themes of the built-in templates, by template id. */
export const builtInThemes: Record<string, Theme> = {
  zerem: zeremTheme,
  shvil: shvilTheme,
  tzuk: tzukTheme,
  lavan: lavanTheme,
  layla: laylaTheme,
  zohar: zoharTheme,
  migdal: migdalTheme,
  gan: ganTheme,
  nof: nofTheme,
  defus: defusTheme,
  ariach: ariachTheme,
  bolet: boletTheme,
  hod: hodTheme,
  sirtut: sirtutTheme,
  ziv: zivTheme,
  shidur: shidurTheme,
};

/** The built-in templates, in the order the library shows them. */
export function builtInTemplates(): Template[] {
  return [
    zeremTemplate(),
    shvilTemplate(),
    tzukTemplate(),
    lavanTemplate(),
    laylaTemplate(),
    zoharTemplate(),
    migdalTemplate(),
    ganTemplate(),
    nofTemplate(),
    defusTemplate(),
    ariachTemplate(),
    boletTemplate(),
    hodTemplate(),
    sirtutTemplate(),
    zivTemplate(),
    shidurTemplate(),
  ];
}

/**
 * The sample deck of each built-in template in Hebrew and in English, as content for its
 * layouts: for the first three, the reference deck the template was derived from, rebuilt on
 * the template.
 */
export const builtInSamples: Record<string, { he: SampleSlide[]; en: SampleSlide[] }> = {
  zerem: zeremSamples,
  shvil: shvilSamples,
  tzuk: tzukSamples,
  lavan: lavanSamples,
  layla: laylaSamples,
  zohar: zoharSamples,
  migdal: migdalSamples,
  gan: ganSamples,
  nof: nofSamples,
  defus: defusSamples,
  ariach: ariachSamples,
  bolet: boletSamples,
  hod: hodSamples,
  sirtut: sirtutSamples,
  ziv: zivSamples,
  shidur: shidurSamples,
};
