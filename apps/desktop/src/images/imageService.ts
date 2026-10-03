import type { ImageService, PngImage, StoredImage } from '@slidr/agent-tools';
import type { AssetMeta } from '@slidr/model';
import { ImageError, type ImageClient, type ImageEvent, type ImageJobResult } from './images';
import { BLANK_PREVIEW } from './preview';

export interface ImageServiceOptions {
  client: ImageClient;
  /** The workspace of the open document: where the images are stored. */
  workspaceId: () => string | null;
  /** A small PNG of a stored image, for the agent to look at (see `previewOf`). */
  preview: (asset: AssetMeta) => Promise<PngImage>;
  /** Progress of the service's jobs, for whoever shows it. */
  onEvent?: (jobId: string, event: ImageEvent) => void;
}

/** The Deck API's image service, and a way to stop what it has running. */
export interface AgentImageService extends ImageService {
  /**
   * Cancels the jobs still running; their calls reject with `cancelled`. For the stop button of
   * the agent's turn: a job left running makes its images, and spends their quota, unseen.
   */
  cancel(): Promise<void>;
}

/** Where an image came from, for the asset's `lineage`. */
interface Origin {
  prompt: string;
  parentAssetId?: string;
}

/**
 * The Deck API's image service (`image_generate`, `image_edit`, `image_process`) over the image
 * providers (ADR-025).
 *
 * - A job whose images partly failed returns the ones that were made. When none was made, the
 *   call rejects with the first failure, as an `ImageError`; its message is what the agent reads.
 * - `edit` is whatever the provider's `capabilities.edit` says. With the default provider it is a
 *   redraw after the source, not a pixel-preserving edit, and a mask is rejected as `unsupported`.
 * - `process` (background removal) is not built yet (WG12-T05) and rejects as `unsupported`.
 */
export function createImageService(options: ImageServiceOptions): AgentImageService {
  const { client } = options;
  const running = new Set<string>();

  async function run(
    start: (
      jobId: string,
      workspaceId: string,
      onEvent: (event: ImageEvent) => void,
    ) => Promise<ImageJobResult>,
    origin: Origin,
  ): Promise<StoredImage[]> {
    const workspaceId = options.workspaceId();
    if (!workspaceId) throw new ImageError('unknown_workspace', 'No document is open.');
    const jobId = crypto.randomUUID();
    running.add(jobId);
    let result: ImageJobResult;
    try {
      result = await start(jobId, workspaceId, (event) => options.onEvent?.(jobId, event));
    } finally {
      running.delete(jobId);
    }

    const failures = result.images.flatMap((o) => (o.status === 'failed' ? [o.error] : []));
    // A cancelled job is one the user no longer wants: nothing of it goes into the deck.
    const failure = failures.find((e) => e.kind === 'cancelled') ?? failures[0];
    const stored = result.images.flatMap((o) => (o.status === 'stored' ? [o.asset] : []));
    if (failure?.kind === 'cancelled' || stored.length === 0) {
      throw failure
        ? new ImageError(failure.kind, failure.message)
        : new ImageError('internal', 'The image job returned no images.');
    }
    return Promise.all(
      stored.map(async (imported) => {
        const asset: AssetMeta = {
          ...imported,
          origin: 'ai',
          lineage: { provider: result.provider, ...origin },
        };
        // The image is made and stored; a preview that fails must not turn that into an error.
        const preview = await options.preview(asset).catch(() => BLANK_PREVIEW);
        return { asset, preview };
      }),
    );
  }

  return {
    generate: ({ prompt, count, aspect }) =>
      run(
        (jobId, workspaceId, onEvent) =>
          client.generate(jobId, workspaceId, { prompt, count, aspect }, onEvent),
        { prompt },
      ),

    edit: ({ assetId, instruction, maskAssetId, count }) =>
      run(
        (jobId, workspaceId, onEvent) =>
          client.edit(
            jobId,
            workspaceId,
            { assetId, instruction, count, ...(maskAssetId ? { maskAssetId } : {}) },
            onEvent,
          ),
        { prompt: instruction, parentAssetId: assetId },
      ),

    process: ({ operation }) =>
      Promise.reject(
        new ImageError(
          'unsupported',
          `Local image processing (${operation}) is not available in this version.`,
        ),
      ),

    cancel: async () => {
      await Promise.all([...running].map((jobId) => client.cancel(jobId)));
    },
  };
}
