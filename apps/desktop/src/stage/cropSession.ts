import { createStore } from 'zustand/vanilla';

/**
 * What crop mode remembers besides the model, shared by the Stage (which drags the handles) and
 * the crop tools of Top Tools row B (which pick the proportions). It starts again with every
 * image that enters crop mode.
 */
export interface CropSession {
  /** Width over height the crop handles keep; null leaves them free. */
  ratio: number | null;
  /** Which preset set the ratio, for the tool that shows it. */
  preset: CropPreset;
}

export type CropPreset = 'free' | 'original' | '1:1' | '4:3' | '16:9';

export const cropSession = createStore<CropSession>(() => ({ ratio: null, preset: 'free' }));

export function resetCropSession(): void {
  cropSession.setState({ ratio: null, preset: 'free' });
}

/**
 * The proportions the handles keep for a frame: the ones a preset set, for as long as the frame
 * still has them. The session is not part of undo, so an undo can leave a frame of other
 * proportions behind; the lock is then off, rather than snapping the frame at the next drag.
 */
export function heldRatio(ratio: number | null, frame: { w: number; h: number }): number | null {
  // Frames are in whole pixels, so the proportions hold to about a pixel.
  return ratio !== null && Math.abs(frame.w - frame.h * ratio) <= 1.5 ? ratio : null;
}
