// The pictures of the samples of the templates authored here: `pictures/<template>.json`, which
// `tools/pictures.py` writes as it puts each file into `pictures/`.
import type { AssetMeta } from '@slidr/model';

const files = import.meta.glob<Record<string, AssetMeta>>('./pictures/*.json', {
  eager: true,
  import: 'default',
});

export const techPictures: Record<string, AssetMeta> = Object.assign(
  {},
  ...Object.values(files),
) as Record<string, AssetMeta>;

/** A picture by its key (`ananCity` for `anan-city.webp`). */
export function picture(key: string): AssetMeta {
  const asset = techPictures[key];
  if (!asset) throw new Error(`No picture "${key}" in pictures/*.json`);
  return asset;
}
