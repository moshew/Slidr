import type { AssetMeta, ImageElement } from '@slidr/model';
import { framedPicture } from '../elements/frames';
import { i18n } from '../i18n';
import { replaceWith } from '../objects/replace';
import { useTargetIn, type Target } from '../objects/target';
import { focusStage, type Editor } from '../shell';

/*
 * "Replace the selected picture" from the media panel (WG5-T13): with a picture selected on the
 * Stage, a tile of the panel offers to put its picture in that one's place. It is the same
 * replacement as row B's and the Stage menu's (`objects/replace.ts`): only the file changes, the
 * frame, the crop, the mask and the adjustments stay, and it is one undo step.
 */

/**
 * The picture selected on the Stage: the one element that is selected, when it is an image, or
 * the picture of the selected group when a frame made the group (a magnet with its stickers
 * and its caption, ADR-083): a picture chosen in a panel goes into the frame.
 */
export function useSelectedPicture(): Target<ImageElement> | undefined {
  return useTargetIn(framedPicture);
}

/**
 * Whether a tile offers its picture in place of the selected one: there is one selected, and
 * it does not already show this picture.
 */
export function offersReplace(
  picture: Target<ImageElement> | undefined,
  assetId: string | undefined,
): picture is Target<ImageElement> {
  return picture !== undefined && picture.element.assetId !== assetId;
}

/** Puts an asset in the selected picture's frame, and gives the keyboard back to the Stage. */
export function replaceSelected(
  editor: Pick<Editor, 'bus'>,
  picture: Target<ImageElement>,
  asset: AssetMeta,
): void {
  replaceWith(editor, picture, asset, i18n.t('media:history.replace'));
  focusStage();
}
