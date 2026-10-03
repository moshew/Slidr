/**
 * The photograph on the cover of a built-in template in the library: the one the opening slide
 * of its sample deck shows. Only these files are part of the app; the other pictures of the
 * samples stay with the reference decks (`docs/reference-decks/images`).
 */
import type { AssetMeta } from '@slidr/model';
import { pictures } from '@slidr/templates/builtin';

const files = import.meta.glob<string>(
  [
    '../../../../docs/reference-decks/images/shvil-ridge.webp',
    '../../../../docs/reference-decks/images/tzuk-warehouse.webp',
  ],
  { eager: true, query: '?url', import: 'default' },
);

const urlOf = (picture: AssetMeta): string | undefined =>
  Object.entries(files).find(([path]) => path.endsWith(`/${picture.name}`))?.[1];

/** The cover photograph of each built-in template that opens with one, by template id. */
const covers: Record<string, AssetMeta> = {
  shvil: pictures.shvilRidge,
  tzuk: pictures.tzukWarehouse,
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
