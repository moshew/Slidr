import type { AssetMeta } from '@slidr/model';
import conference from './design-assets/conference.webp?url';
import momentum from './design-assets/momentum.webp?url';
import possibility from './design-assets/possibility.webp?url';
import product from './design-assets/product.webp?url';
import sale from './design-assets/sale.webp?url';
import testimonial from './design-assets/testimonial.webp?url';
import thumbnail from './design-assets/thumbnail.webp?url';
import webinar from './design-assets/webinar.webp?url';
import wedding from './design-assets/wedding.webp?url';
import workshop from './design-assets/workshop.webp?url';
import type { DesignId } from './designs';

/** Bundled originals. They are imported into the document when a design is chosen. */
const urls: Record<DesignId, string> = {
  possibility,
  momentum,
  wedding,
  webinar,
  conference,
  workshop,
  product,
  sale,
  testimonial,
  thumbnail,
};

export const previewAssetId = (id: DesignId) => `design-preview-${id}`;

export function previewAsset(id: DesignId): AssetMeta {
  return {
    id: previewAssetId(id),
    file: `${id}.webp`,
    mime: 'image/webp',
    kind: 'image',
    origin: 'import',
    bytes: 0,
    name: `${id}.webp`,
  };
}

export function designAssetUrl(asset: AssetMeta): string | undefined {
  const id = asset.id.replace(/^design-preview-/, '') as DesignId;
  return asset.id === previewAssetId(id) ? urls[id] : undefined;
}

export async function designAssetFile(id: DesignId): Promise<File> {
  const response = await fetch(urls[id]);
  if (!response.ok) throw new Error(`Could not load design image: ${id}`);
  return new File([await response.blob()], `${id}.webp`, { type: 'image/webp' });
}
