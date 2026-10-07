// The templates Slidr ships with (THM-01, WG7-T04, WG7-T10). The first three are each derived
// from a reference deck under `docs/reference-decks/`: the deck set the design, the template is
// what of it a theme and sixteen layouts can carry. The seven after them were drawn as
// templates from the start (ADR-063), and so were the five after them, each after a style of
// slide design the first ten have none of (ADR-070). The last, `shidur`, is drawn after a webinar
// deck: slanted slabs of royal blue and hot pink accents on white.
import type { Theme } from '@slidr/model';
import { withStandardLayouts } from '../standardLayouts';
import type { Template } from '../template';
import { sampleSlides, text, type SampleSlide } from './kit';
import { ariachSamples, ariachTemplate, ariachTheme } from './ariach';
import { binaSamples, binaTemplate, binaTheme } from './bina';
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
  bina: binaTheme,
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
    binaTemplate(),
  ].map((original) => {
    const template = withStandardLayouts(original);
    const samples = standardSamples(template, 'he').filter(
      (sample) => !original.sample?.some((slide) => slide.layoutId === sample.layout),
    );
    const added = sampleSlides(template, samples, { seed: 7301 });
    const shown = [...(original.sample ?? [])];
    for (const slide of added) insertInLayoutOrder(template, shown, slide, (item) => item.layoutId);
    template.sample = shown;
    return template;
  });
}

function insertInLayoutOrder<T>(
  template: Template,
  shown: T[],
  added: T,
  layoutId: (item: T) => string | undefined,
): void {
  const order = (id: string | undefined) =>
    template.layouts.findIndex((layout) => layout.id === id);
  const at = shown.findIndex((item) => order(layoutId(item)) > order(layoutId(added)));
  shown.splice(at < 0 ? shown.length : at, 0, added);
}

function standardSamples(template: Template, lang: 'he' | 'en'): [SampleSlide, SampleSlide] {
  const title = lang === 'he' ? 'כותרת השקף' : 'Slide title';
  const body =
    lang === 'he'
      ? 'כאן אפשר להציג את הרעיון המרכזי ולפרט אותו בכמה שורות.'
      : 'Present the main idea here and explain it in a few lines.';
  return [
    {
      layout: template.layouts.find((layout) => layout.archetype === 'title')!.id,
      name: title,
      content: { title: text(title) },
    },
    {
      layout: template.layouts.find((layout) => layout.archetype === 'text')!.id,
      name: title,
      content: { title: text(title), body: text(body) },
    },
  ];
}

function withStandardSamples(
  template: Template,
  lang: 'he' | 'en',
  slides: SampleSlide[],
): SampleSlide[] {
  const shown = [...slides];
  for (const sample of standardSamples(template, lang)) {
    if (!shown.some((slide) => slide.layout === sample.layout))
      insertInLayoutOrder(template, shown, sample, (item) => item.layout);
  }
  return shown;
}

/**
 * The sample deck of each built-in template in Hebrew and in English, as content for its
 * layouts: for the first three, the reference deck the template was derived from, rebuilt on
 * the template.
 */
const originalSamples: Record<string, { he: SampleSlide[]; en: SampleSlide[] }> = {
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
  bina: binaSamples,
};

const completeTemplates = Object.fromEntries(
  builtInTemplates().map((template) => [template.theme.id, template]),
) as Record<string, Template>;

export const builtInSamples: Record<string, { he: SampleSlide[]; en: SampleSlide[] }> =
  Object.fromEntries(
    Object.entries(originalSamples).map(([id, samples]) => [
      id,
      {
        he: withStandardSamples(completeTemplates[id]!, 'he', samples.he),
        en: withStandardSamples(completeTemplates[id]!, 'en', samples.en),
      },
    ]),
  );
