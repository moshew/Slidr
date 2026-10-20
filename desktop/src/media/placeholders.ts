import {
  closestAspect,
  imagePlaceholders,
  styledPrompt,
  type ImagePlaceholder,
} from '@slidr/agent-tools';
import { updateElement, type AssetMeta, type Command } from '@slidr/model';
import { i18n } from '../i18n';
import { imagesOf, type AppImages } from '../images/appImages';
import type { Editor } from '../shell';
import { setJob, useMedia } from './store';

/*
 * Filling the image placeholders that carry a prompt (WG12-T04): the frames `<img
 * data-image-prompt>` leaves on a slide. The user asks for one image or for all of them; each
 * is made by the image provider chosen in the settings, from the placeholder's own prompt with
 * the deck's image style, at the shape of its frame, and lands in its placeholder as it arrives.
 * The agent does the same through its tools (`image_generate`, `image_fill_placeholders`).
 */

/** The image providers a fill works with: the client, and the workspace it stores into. */
export type FillImages = Pick<AppImages, 'client' | 'workspaceId'>;

/**
 * Makes the image of one placeholder and puts it in. One change on the bus, so one undo step:
 * the asset and the element's new image together. A placeholder that was deleted or filled
 * while the image was being made is left alone, and the image stays among the deck's assets.
 */
export async function fillPlaceholder(
  editor: Editor,
  placeholder: ImagePlaceholder,
  images: FillImages = imagesOf(editor),
): Promise<void> {
  const { client, workspaceId } = images;
  const { elementId, slideId } = placeholder;
  if (useMedia.getState().jobs[elementId]?.state === 'working') return;
  const workspace = workspaceId();
  if (!workspace) {
    setJob(elementId, { state: 'failed', error: 'No document is open.' });
    return;
  }
  const jobId = crypto.randomUUID();
  setJob(elementId, { jobId, state: 'working' });
  try {
    const result = await client.generate(jobId, workspace, {
      prompt: styledPrompt(editor.bus.deck, placeholder.prompt),
      count: 1,
      aspect: closestAspect(placeholder.frame),
    });
    const [outcome] = result.images;
    if (!outcome || outcome.status === 'failed') {
      // A job the user stopped leaves no trace; any other failure says why.
      const error = outcome?.error;
      setJob(
        elementId,
        error?.kind === 'cancelled'
          ? null
          : { state: 'failed', error: error?.message ?? 'The provider returned no image.' },
      );
      return;
    }
    const asset: AssetMeta = {
      ...outcome.asset,
      origin: 'ai',
      lineage: { provider: result.provider, prompt: placeholder.prompt },
    };
    const waiting = imagePlaceholders(editor.bus.deck).some((p) => p.elementId === elementId);
    const commands: Command[] = [{ type: 'asset.add', asset }];
    if (waiting) {
      commands.push(updateElement(slideId, elementId, { assetId: asset.id, prompt: null }));
    }
    editor.bus.batch(commands, { label: i18n.t('media:history.fill') });
    setJob(elementId, null);
  } catch (error) {
    setJob(elementId, {
      state: 'failed',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Fills several placeholders side by side; the provider makes as many at once as it can. */
export async function fillPlaceholders(
  editor: Editor,
  placeholders: readonly ImagePlaceholder[],
  images: FillImages = imagesOf(editor),
): Promise<void> {
  await Promise.all(
    placeholders.map((placeholder) => fillPlaceholder(editor, placeholder, images)),
  );
}

/** Stops the images that are being made: all of them, or the one of a placeholder. */
export async function cancelFill(
  editor: Editor,
  elementId?: string,
  images: FillImages = imagesOf(editor),
): Promise<void> {
  const { client } = images;
  const jobIds = Object.entries(useMedia.getState().jobs).flatMap(([id, job]) =>
    job.jobId && (!elementId || id === elementId) ? [job.jobId] : [],
  );
  await Promise.all(jobIds.map((jobId) => client.cancel(jobId)));
}
