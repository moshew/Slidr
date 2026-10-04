import {
  createElement,
  type AssetMeta,
  type Command,
  type Element,
  type Point,
} from '@slidr/model';

/**
 * Elements for assets dropped or pasted on the Stage (STG-09, IMG-01, MED-01). The import itself
 * (bytes -> asset in the workspace) is the host's: Tauri in the app, memory on the dev page.
 */

/** A new picture takes at most this share of the slide on each axis. */
const MAX_SHARE = 0.6;
/** Several dropped files fan out by this much, so none hides another. */
const CASCADE = 40;

/**
 * The element that shows an asset, or undefined for assets that are not pictures, video or sound.
 * `svgMarkup` is the cleaned markup of an SVG file: with it the element holds the markup itself,
 * so its colours can be replaced (SHP-06), and needs no asset.
 */
export function elementForAsset(
  asset: AssetMeta,
  slide: { w: number; h: number },
  center: Point,
  svgMarkup?: string,
): Element | undefined {
  const natural = { w: asset.width ?? slide.w * 0.4, h: asset.height ?? slide.h * 0.4 };
  const scale = Math.min(1, (slide.w * MAX_SHARE) / natural.w, (slide.h * MAX_SHARE) / natural.h);
  const w = Math.round(natural.w * scale);
  const h = Math.round(natural.h * scale);
  // Keep the whole element on the slide.
  const x = Math.round(Math.min(Math.max(center.x - w / 2, 0), slide.w - w));
  const y = Math.round(Math.min(Math.max(center.y - h / 2, 0), slide.h - h));
  const name = asset.name?.replace(/\.[^.]+$/, '');
  const base = { frame: { x, y, w, h }, ...(name ? { name } : {}) };
  switch (asset.kind) {
    case 'image':
      return createElement.image({
        ...base,
        assetId: asset.id,
        fit: 'cover',
        ...(name ? { alt: name } : {}),
      });
    case 'svg':
      return createElement.svg(
        svgMarkup ? { ...base, markup: svgMarkup } : { ...base, assetId: asset.id },
      );
    case 'video':
      return createElement.video({ ...base, assetId: asset.id });
    case 'audio':
      return createElement.audio({ ...base, frame: { x, y, w: 320, h: 80 }, assetId: asset.id });
    default:
      return undefined;
  }
}

/**
 * The commands that register the assets and place them around a point, as one batch: dropping
 * several files is one undo step. Returns the new element ids too, to select them.
 *
 * `svgMarkup` holds the cleaned markup of the SVG files among them, by asset id; such an element
 * carries its markup and its asset is not registered.
 */
export function insertAssetsCommands(
  slideId: string,
  assets: readonly AssetMeta[],
  slide: { w: number; h: number },
  at: Point,
  known: (assetId: string) => boolean,
  svgMarkup?: ReadonlyMap<string, string>,
): { commands: Command[]; elementIds: string[] } {
  const commands: Command[] = [];
  const elementIds: string[] = [];
  assets.forEach((asset, i) => {
    const markup = svgMarkup?.get(asset.id);
    const element = elementForAsset(
      asset,
      slide,
      { x: at.x + i * CASCADE, y: at.y + i * CASCADE },
      markup,
    );
    if (!element) return;
    if (!markup && !known(asset.id)) commands.push({ type: 'asset.add', asset });
    commands.push({ type: 'element.add', slideId, element });
    elementIds.push(element.id);
  });
  return { commands, elementIds };
}
