/**
 * The cover of a template, as the library and the deck tool's gallery draw it: one slide that
 * shows the template, and where its pictures load from.
 *
 * The photograph on the cover of a built-in template is the one the opening slide of its sample
 * deck shows. Only these files are part of the app; the other pictures of the samples stay with
 * the external media library (`Slidr-media/images/templates`).
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
import { createSlide, deckFromTemplate, type Template } from '@slidr/templates';
// The pictures alone: the templates' own code is not part of a packaged app (see `./builtIn`).
import { pictures } from '@slidr/templates/builtin/pictures';
import { library } from './app';

const files = import.meta.glob<string>(
  [
    '../../../../../Slidr-media/images/templates/shvil-ridge.webp',
    '../../../../../Slidr-media/images/templates/tzuk-warehouse.webp',
    '../../../../../Slidr-media/images/templates/lavan-chair-1.webp',
    '../../../../../Slidr-media/images/templates/nof-view-2.webp',
    '../../../../../Slidr-media/images/templates/defus-street-1.webp',
    '../../../../../Slidr-media/images/templates/migdal-team-2.webp',
    '../../../../../Slidr-media/images/templates/mifgash-call.webp',
  ],
  { eager: true, query: '?url', import: 'default' },
);

const urlOf = (picture: AssetMeta): string | undefined =>
  Object.entries(files).find(([path]) => path.endsWith(`/${picture.name}`))?.[1];

/** The cover photograph of each built-in template that opens with one, by template id. */
const covers: Record<string, AssetMeta> = {
  shvil: pictures.shvilRidge!,
  tzuk: pictures.tzukWarehouse!,
  lavan: pictures.lavanChair1!,
  nof: pictures.nofView2!,
  defus: pictures.defusStreet1!,
  shidur: pictures.migdalTeam2!,
  mifgash: pictures.mifgashCall!,
};

/** The photograph of a template's cover; undefined when the template opens without one. */
export function coverPicture(templateId: string): AssetMeta | undefined {
  const picture = covers[templateId];
  return picture && urlOf(picture) ? picture : undefined;
}

/** Where a cover photograph loads from; undefined for any other asset. */
export function coverUrl(asset: AssetMeta): string | undefined {
  return Object.values(covers).some((picture) => picture.id === asset.id)
    ? urlOf(asset)
    : undefined;
}

/** Where a cover loads a picture from: the app's own file, or a personal template's. */
export const coverAsset = (asset: AssetMeta) => coverUrl(asset) ?? library.assetUrl(asset);

/**
 * One slide that shows a template: its opening layout with the template's name on it, and the
 * photograph of a built-in template that opens with one.
 */
export function coverOf(template: Template, like: Deck): { deck: Deck; slide: Slide } {
  const deck = deckFromTemplate(template, { lang: like.meta.lang, dir: like.meta.dir });
  const first = deck.layouts[0];
  if (first) {
    const title = richText(template.theme.name, { dir: 'auto' });
    const has = (role: string) => first.placeholders.some((p) => p.role === role);
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
        content: richText(template.theme.name, { align: 'center', styleRef: 'display' }),
      }),
    ],
  });
  return { deck: plain, slide };
}
