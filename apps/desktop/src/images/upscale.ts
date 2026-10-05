import { findElementInDeck, type AssetMeta, type Command } from '@slidr/model';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { Editor } from '../shell/editor';
import { imagesOf, type AppImages } from './appImages';
import { ImageError } from './images';
import type { UpscaleStatus } from './upscaler';

/*
 * Upscaling the picture of an image element (AIO-04), for the app's own button in row B. The
 * work is done on this machine (see `upscaler.ts`); the element takes the larger picture as one
 * undo step, in the same frame and with the same crop, mask and adjustments, and the original
 * stays an asset of the deck for as long as undo can bring it back (IMG-12).
 */

/** What an upscale works with: the client, and the workspace it stores into. */
export type UpscaleImages = Pick<AppImages, 'upscaler' | 'workspaceId'>;

/** An upscale that is running: the job, and how many of the picture's tiles are done. */
export interface UpscaleWork {
  jobId: string;
  done: number;
  total: number;
}

/** The pictures that are being upscaled right now, by element id. */
const useWork = create<{ working: Record<string, UpscaleWork> }>(() => ({ working: {} }));

/** The upscale of an element that is running, if one is. */
export function useUpscaleWork(elementId: string): UpscaleWork | undefined {
  return useWork((state) => state.working[elementId]);
}

function setWork(elementId: string, work: UpscaleWork | null): void {
  useWork.setState((state) => {
    const { [elementId]: _gone, ...rest } = state.working;
    return { working: work ? { ...rest, [elementId]: work } : rest };
  });
}

/** The same, read once: outside a component. */
export const upscaleWorkOf = (elementId: string): UpscaleWork | undefined =>
  useWork.getState().working[elementId];

/** How far a job is, as a whole number of hundredths; 0 before its first tile is done. */
export function upscalePercent(work: Pick<UpscaleWork, 'done' | 'total'>): number {
  return work.total > 0 ? Math.round((work.done / work.total) * 100) : 0;
}

/** Whether the upscaling model is installed, and how far it goes; undefined until that is known. */
export function useUpscaleStatus(editor: Editor): UpscaleStatus | undefined {
  const [status, setStatus] = useState<UpscaleStatus>();
  useEffect(() => {
    let gone = false;
    imagesOf(editor)
      .upscaler.status()
      .then(
        (found) => !gone && setStatus(found),
        // A core that cannot say is one that cannot do it.
        () =>
          !gone &&
          setStatus({
            state: 'not_installed',
            model: null,
            path: null,
            place: null,
            installDir: null,
            supported: [],
            factors: [],
            maxSourcePixels: 0,
            maxResultPixels: 0,
          }),
      );
    return () => {
      gone = true;
    };
  }, [editor]);
  return status;
}

/**
 * Draws the picture of an image element again at `factor` times its size and puts the result in
 * its place: the new asset and the change of the element are one undo step. Only the picture
 * changes: the frame, the crop, the mask and the adjustments are the element's and stay.
 *
 * Resolves false when nothing was changed: there was no picture, a job was already running for
 * the element, the job was cancelled, or the element was deleted or given another picture
 * while the work ran. Rejects with the reason when the picture could not be upscaled.
 */
export async function upscaleImage(
  editor: Editor,
  elementId: string,
  factor: number,
  label: string,
  images: UpscaleImages = imagesOf(editor),
): Promise<boolean> {
  const before = findElementInDeck(editor.bus.deck, elementId);
  const assetId = before?.element.type === 'image' ? before.element.assetId : undefined;
  if (!before || !assetId || upscaleWorkOf(elementId)) return false;
  const { upscaler, workspaceId } = images;
  const workspace = workspaceId();
  if (!workspace) throw new ImageError('unknown_workspace', 'No document is open.');

  const jobId = crypto.randomUUID();
  /** Still this job, and not one the user stopped. */
  const mine = () => upscaleWorkOf(elementId)?.jobId === jobId;
  setWork(elementId, { jobId, done: 0, total: 0 });
  try {
    const made = await upscaler.run(jobId, workspace, assetId, factor, (progress) => {
      if (mine()) setWork(elementId, { jobId, ...progress });
    });
    const now = findElementInDeck(editor.bus.deck, elementId);
    if (!mine() || !now || now.element.type !== 'image' || now.element.assetId !== assetId) {
      return false;
    }
    // The same picture, larger: it is still what its source was, and whose.
    const source = editor.bus.deck.assets[assetId];
    const asset: AssetMeta = {
      ...made.asset,
      origin: source?.origin ?? 'upload',
      ...(source?.name ? { name: source.name } : {}),
      ...(source?.attribution ? { attribution: source.attribution } : {}),
      lineage: {
        ...(source?.lineage?.prompt ? { prompt: source.lineage.prompt } : {}),
        parentAssetId: assetId,
        provider: made.model,
      },
    };
    const commands: Command[] = [
      ...(asset.id in editor.bus.deck.assets ? [] : [{ type: 'asset.add', asset } as const]),
      {
        type: 'element.update',
        slideId: now.slide.id,
        elementId,
        patch: { assetId: asset.id },
      },
    ];
    editor.bus.batch(commands, { label });
    return true;
  } catch (error) {
    // Stopped by the user: not a failure anybody has to hear of.
    if (error instanceof ImageError && error.kind === 'cancelled') return false;
    throw error;
  } finally {
    if (mine()) setWork(elementId, null);
  }
}

/**
 * Stops the upscale of an element. The element is free at once; the work itself ends a moment
 * later, when the tiles in hand are done, and stores nothing.
 */
export function cancelUpscale(
  editor: Editor,
  elementId: string,
  images: UpscaleImages = imagesOf(editor),
): void {
  const work = upscaleWorkOf(elementId);
  if (!work) return;
  setWork(elementId, null);
  void images.upscaler.cancel(work.jobId).catch(() => undefined);
}
