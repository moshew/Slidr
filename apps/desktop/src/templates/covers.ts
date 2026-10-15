/**
 * The cover of a template, as the library and the deck tool's gallery draw it: one slide that
 * shows the template, and where its pictures load from.
 *
 * The photograph on the cover of a built-in template is the one the opening slide of its sample
 * deck shows, from the media library (`images/templates`). Without the library, or without the
 * photograph in it, the cover is the template's opening layout without a picture.
 */
import {
  createDeck,
  createElement,
  createSlide as blankSlide,
  richText,
  type AssetMeta,
  type Deck,
  type Slide,
} from '@slidr/model';
import { mediaFiles, mediaUrl } from '@slidr/media-library';
import { createSlide, deckFromTemplate, type Template } from '@slidr/templates';
// The pictures alone: the templates' own code is not part of a packaged app (see `./builtIn`).
import { pictures } from '@slidr/templates/builtin/pictures';
import { library } from './app';
import { templateName } from './names';

const files = await mediaFiles();

const urlOf = (picture: AssetMeta): string | undefined => {
  const path = `images/templates/${picture.name}`;
  return files.has(path) ? mediaUrl(path) : undefined;
};

/** The cover photograph of each built-in template that opens with one, by template id. */
const covers: Record<string, AssetMeta | undefined> = {
  shvil: pictures.shvilRidge,
  tzuk: pictures.tzukWarehouse,
  lavan: pictures.lavanChair1,
  nof: pictures.nofView2,
  defus: pictures.defusStreet1,
  shidur: pictures.migdalTeam2,
  mifgash: pictures.mifgashCall,
};

/** The photograph of a template's cover; undefined when the template opens without one. */
export function coverPicture(templateId: string): AssetMeta | undefined {
  const picture = covers[templateId];
  return picture && urlOf(picture) ? picture : undefined;
}

/** Where a cover photograph loads from; undefined for any other asset. */
export function coverUrl(asset: AssetMeta): string | undefined {
  return Object.values(covers).some((picture) => picture?.id === asset.id)
    ? urlOf(asset)
    : undefined;
}

/** Where a cover loads a picture from: the app's own file, or a personal template's. */
export const coverAsset = (asset: AssetMeta) => coverUrl(asset) ?? library.assetUrl(asset);

/**
 * One slide that shows a template: its opening layout with the template's name on it, in the
 * language of the deck, and the photograph of a built-in template that opens with one.
 */
export function coverOf(
  template: Template,
  like: { meta: Pick<Deck['meta'], 'lang' | 'dir'> },
): { deck: Deck; slide: Slide } {
  const deck = deckFromTemplate(template, { lang: like.meta.lang, dir: like.meta.dir });
  const name = templateName(template.theme, like.meta.lang);
  const first = deck.layouts[0];
  if (first) {
    const has = (role: string) => first.placeholders.some((p) => p.role === role);
    const title = richText(name, { dir: 'auto' });
    const picture = has('image') ? coverPicture(template.theme.id) : undefined;
    if (picture) deck.assets[picture.id] = picture;
    const { slide } = createSlide(deck, {
      layoutId: first.id,
      content: {
        ...(has('title') ? { title } : {}),
        ...(picture ? { image: { assetId: picture.id } } : {}),
      },
    });
    return { deck, slide };
  }
  // A template without layouts (saved from a plain deck): its name in its own display style.
  const plain = createDeck({ lang: like.meta.lang, dir: like.meta.dir, theme: template.theme });
  const slide = blankSlide({
    elements: [
      createElement.text({
        frame: { x: 160, y: 380, w: 1600, h: 320 },
        vAlign: 'middle',
        content: richText(name, { align: 'center', styleRef: 'display' }),
      }),
    ],
  });
  return { deck: plain, slide };
}
