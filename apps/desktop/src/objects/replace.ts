import type { ImageElement } from '@slidr/model';
import { tell, type Editor } from '../shell';
import { IMAGE_FILES, isPicture, pickFiles } from './insert';
import type { Target } from './target';

/** The automatic alt text of a picture: its file name without the extension (see `stage/insert`). */
const baseName = (name: string | undefined) => name?.replace(/\.[^.]+$/, '');

/**
 * Another picture in the same frame: the crop, the fit and every style stay (IMG-09). Row B's
 * button and the Stage's menu both call this. `labels` are in the objects area's language.
 */
export async function replaceImage(
  { assets, bus }: Pick<Editor, 'assets' | 'bus'>,
  target: Target<ImageElement>,
  labels: { history: string; failed: string },
): Promise<void> {
  const { element } = target;
  const [file] = await pickFiles(IMAGE_FILES);
  if (!file) return;
  try {
    const asset = await assets.import(file);
    if (!isPicture(asset)) return;
    const previous = element.assetId ? bus.deck.assets[element.assetId] : undefined;
    // An alt text that was only the old file's name follows the new file; one the user wrote stays.
    const automatic = element.alt === undefined || element.alt === baseName(previous?.name);
    const alt = baseName(asset.name);
    target.update(
      { assetId: asset.id, ...(automatic && alt ? { alt } : {}) },
      { label: labels.history },
      [{ type: 'asset.add', asset }],
    );
  } catch (error) {
    await tell(labels.failed, error instanceof Error ? error.message : undefined);
  }
}
