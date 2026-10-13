/**
 * The preview of a template, as the library opens it under the template's card: a deck whose
 * slides show the template, and where its pictures load from.
 *
 * A built-in template is shown by its sample deck. A personal one carries no sample: it is
 * shown by one slide for each of its layouts, with the app's own words for each role.
 */
import type { AssetMeta, Deck } from '@slidr/model';
import { sampleDeckOf } from '@slidr/templates';
import { i18n } from '../i18n';
import { coverAsset } from './covers';
import type { LibraryEntry } from './library';

export interface TemplatePreview {
  deck: Deck;
  resolveAsset: (asset: AssetMeta) => string | undefined;
}

/** One slide for each layout of a template, in the language and direction of `like`. */
function layoutsDeck({ template }: LibraryEntry, like: Deck): Deck {
  return sampleDeckOf(
    template,
    {},
    {
      lang: like.meta.lang,
      dir: like.meta.dir,
      assets: template.assets ?? {},
      fallback: (role) => {
        const key = `templates:sample.${role}`;
        return i18n.exists(key) ? i18n.t(key, { lng: like.meta.lang }) : undefined;
      },
    },
  );
}

export async function previewOf(entry: LibraryEntry, like: Deck): Promise<TemplatePreview> {
  if (!entry.personal) {
    try {
      const { builtInSampleDeck, pictureUrl } = await import('./samples');
      const deck = await builtInSampleDeck(entry.template, like);
      if (deck) return { deck, resolveAsset: (asset) => pictureUrl(asset) ?? coverAsset(asset) };
    } catch (error) {
      console.error(
        `The sample of the template "${entry.template.theme.id}" could not be read`,
        error,
      );
    }
  }
  return { deck: layoutsDeck(entry, like), resolveAsset: coverAsset };
}
