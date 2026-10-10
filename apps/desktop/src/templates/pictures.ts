/**
 * The pictures of the built-in templates' sample decks. The files are the reference decks'
 * (`Slidr-media/images/templates`); the asset records come from `@slidr/templates/builtin`,
 * where the samples name them by id.
 */
import type { AssetMeta } from '@slidr/model';
import { pictures } from '@slidr/templates/builtin';

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

/** The pictures as assets of a deck, by id. */
export const pictureAssets: Record<string, AssetMeta> = Object.fromEntries(
  Object.values(pictures).map((picture) => [picture.id, picture]),
);

/** Where a picture of the built-in samples loads from; undefined for any other asset. */
export function pictureUrl(asset: AssetMeta): string | undefined {
  return urls.get(asset.id);
}
