import type { AssetMeta } from '@slidr/model';
import type { DesignId } from './designs';

const sizes = JSON.parse(
  (await import('../../../../../Slidr-media/images/designs/sizes.json?raw')).default,
) as Record<string, number[] | undefined>;

/**
 * Bundled originals, by file name: `<id>.webp` is a design's picture, and `<id>-bg.webp` the
 * photographic backdrop a few designs lay under their subject. They are imported into the
 * document when a design is chosen. Where a design has a subject of its own (a person, a
 * product), the picture is the subject alone on a transparent ground, so it stays usable when
 * the background behind it is changed.
 */
const files = import.meta.glob<string>('../../../../../Slidr-media/images/designs/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});
const url = (name: string) => files[`../../../../../Slidr-media/images/designs/${name}.webp`];

export const previewAssetId = (id: DesignId) => `design-preview-${id}`;
export const previewBackdropId = (id: DesignId) => `design-preview-${id}-bg`;

/**
 * The record of a bundled picture, for the gallery. It carries the picture's size in pixels
 * (`scripts/design-asset-sizes.mjs`): a cropped picture cannot be drawn without it.
 */
function meta(id: string, name: string): AssetMeta {
  const size = sizes[name];
  const file = `${name}.webp`;
  return {
    id,
    file,
    mime: 'image/webp',
    kind: 'image',
    origin: 'import',
    bytes: 0,
    name: file,
    ...(size ? { width: size[0], height: size[1] } : {}),
  };
}

export const previewAsset = (id: DesignId) => meta(previewAssetId(id), id);

/** The preview record of a design's backdrop, when it has one. */
export function previewBackdrop(id: DesignId): AssetMeta | undefined {
  return url(`${id}-bg`) ? meta(previewBackdropId(id), `${id}-bg`) : undefined;
}

export function designAssetUrl(asset: AssetMeta): string | undefined {
  const name = asset.id.replace(/^design-preview-/, '');
  return name === asset.id ? undefined : url(name);
}

async function bundled(name: string): Promise<File> {
  const address = url(name);
  const response = address ? await fetch(address) : undefined;
  if (!response?.ok) throw new Error(`Could not load design image: ${name}.webp`);
  return new File([await response.blob()], `${name}.webp`, { type: 'image/webp' });
}

export const designAssetFile = (id: DesignId) => bundled(id);

/** The file of a design's backdrop, when it has one. */
export function designBackdropFile(id: DesignId): Promise<File> | undefined {
  return url(`${id}-bg`) ? bundled(`${id}-bg`) : undefined;
}
