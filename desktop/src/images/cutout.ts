import type { ImageOperation } from '@slidr/agent-tools';
import { findElementInDeck, type Command } from '@slidr/model';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { Editor } from '../shell/editor';
import { imagesOf } from './appImages';
import type { ProcessStatus } from './process';

/*
 * Removing the background of a picture on the slide (GEN-06, GEN-07), for the app's own buttons:
 * row B of an image, and the AI tool of the object. The work is done on this machine (see
 * `process.ts`); the picture on the slide changes to the cut-out as one undo step, and the
 * original stays an asset of the deck, so undo brings it back (IMG-12).
 */

/** The pictures whose background is being removed right now, by element id. */
const useWork = create<{ working: Record<string, true> }>(() => ({ working: {} }));

/** Whether an element's background is being removed right now. */
export function useCutoutWorking(elementId: string): boolean {
  return useWork((state) => Boolean(state.working[elementId]));
}

function setWorking(elementId: string, on: boolean): void {
  useWork.setState((state) => {
    const { [elementId]: _gone, ...rest } = state.working;
    return { working: on ? { ...rest, [elementId]: true } : rest };
  });
}

/** Whether the model of the background removal is installed; undefined until that is known. */
export function useCutoutStatus(editor: Editor): ProcessStatus | undefined {
  const [status, setStatus] = useState<ProcessStatus>();
  useEffect(() => {
    let gone = false;
    imagesOf(editor)
      .processor.status()
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
          }),
      );
    return () => {
      gone = true;
    };
  }, [editor]);
  return status;
}

/**
 * Removes the background of the picture in an image element and puts the cut-out in its place:
 * the new asset and the change of the element are one undo step. An element that was deleted,
 * or given another picture, while the work ran is left as it is. Rejects with the reason when
 * the picture could not be processed.
 */
export async function removeBackground(
  editor: Editor,
  elementId: string,
  operation: ImageOperation,
  label: string,
): Promise<boolean> {
  const before = findElementInDeck(editor.bus.deck, elementId);
  const assetId = before?.element.type === 'image' ? before.element.assetId : undefined;
  if (!before || !assetId) return false;
  setWorking(elementId, true);
  try {
    const { asset } = await imagesOf(editor).service.process({ assetId, operation });
    const now = findElementInDeck(editor.bus.deck, elementId);
    if (!now || now.element.type !== 'image' || now.element.assetId !== assetId) return false;
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
  } finally {
    setWorking(elementId, false);
  }
}
