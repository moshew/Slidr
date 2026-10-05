import type { AssetMeta, ImageElement } from '@slidr/model';
import { tell, type Editor } from '../shell';
import { IMAGE_FILES, isPicture, pickFiles } from './insert';
import type { Target } from './target';

/** The automatic alt text of a picture: its file name without the extension (see `stage/insert`). */
const baseName = (name: string | undefined) => name?.replace(/\.[^.]+$/, '');

/**
 * Puts a picture in the frame of another: the crop, the fit, the mask, the adjustments and every
 * style stay, and only the file changes (IMG-09). One undo step, the asset with it when the deck
 * does not have it yet. Whoever replaces a picture goes through here: row B, the Stage's menu,
 * and a tile of the media panel.
 */
export function replaceWith(
  { bus }: Pick<Editor, 'bus'>,
  target: Target<ImageElement>,
  asset: AssetMeta,
  label: string,
): void {
  const { element } = target;
  const previous = element.assetId ? bus.deck.assets[element.assetId] : undefined;
  // An alt text that was only the old file's name follows the new file; one the user wrote stays.
  const automatic = element.alt === undefined || element.alt === baseName(previous?.name);
  const alt = baseName(asset.name);
  target.update({ assetId: asset.id, ...(automatic && alt ? { alt } : {}) }, { label }, [
    { type: 'asset.add', asset },
  ]);
}

/**
 * Another picture in the same frame, from a file the user picks. Row B's button and the Stage's
 * menu both call this. `labels` are in the objects area's language.
 */
export async function replaceImage(
  { assets, bus }: Pick<Editor, 'assets' | 'bus'>,
  target: Target<ImageElement>,
  labels: { history: string; failed: string },
): Promise<void> {
  const [file] = await pickFiles(IMAGE_FILES);
  if (!file) return;
  try {
    const asset = await assets.import(file);
    if (!isPicture(asset)) return;
    replaceWith({ bus }, target, asset, labels.history);
  } catch (error) {
    await tell(labels.failed, error instanceof Error ? error.message : undefined);
  }
}
