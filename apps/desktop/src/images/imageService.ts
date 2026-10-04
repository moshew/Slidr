import type { ImageOperation, ImageService, PngImage, StoredImage } from '@slidr/agent-tools';
import type { AssetMeta } from '@slidr/model';
import { ImageError, type ImageClient, type ImageEvent, type ImageJobResult } from './images';
import { BLANK_PREVIEW } from './preview';
import type { ImageProcessClient, ProcessOperation } from './process';

export interface ImageServiceOptions {
  client: ImageClient;
  /** The workspace of the open document: where the images are stored. */
  workspaceId: () => string | null;
  /** A small PNG of a stored image, for the agent to look at (see `previewOf`). */
  preview: (asset: AssetMeta) => Promise<PngImage>;
  /** Progress of the service's jobs, for whoever shows it. */
  onEvent?: (jobId: string, event: ImageEvent) => void;
  /** Local processing (background removal). Without it `process` rejects as `unsupported`. */
  processor?: ImageProcessClient;
  /** An asset of the open deck: a processed picture carries on what its source was. */
  asset?: (assetId: string) => AssetMeta | undefined;
}

/**
 * What a prompt is given when the image has to end up with a transparent background: a colour
 * that the key can tell from the subject. Magenta, since few subjects are.
 */
const FLAT_BACKGROUND =
  'Background: the subject alone, whole and uncropped, on one flat, even, pure magenta background (red 255, green 0, blue 255) that reaches every edge of the picture. No shadow, gradient, texture, floor or horizon on the background, and no magenta on the subject.';

/** What the agent is told when background removal has no model to run on. */
const NO_MODEL =
  'No background-removal model is installed on this machine, so removeBackground cannot run: say so to the user. A picture on a flat background colour can still be cut out, with keyOutBackground.';

/** The operation of the Deck API as the processing client takes it. */
const OPERATIONS: Record<ImageOperation, ProcessOperation> = {
  removeBackground: { type: 'remove_background' },
  keyOutBackground: { type: 'chroma_key' },
};

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
 * - `process` runs on this machine and calls no provider. Its picture is the source with a
 *   transparent background, so it keeps the source's origin, name and attribution: a stock photo
 *   that was cut out is still that photographer's.
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
    generate: async ({ prompt, count, aspect, transparent }) => {
      const { processor } = options;
      // No provider draws transparency through this contract (ADR-051), so a transparent image
      // is drawn on a flat colour and the colour is keyed out here (GEN-07).
      const keyed = Boolean(transparent && processor);
      const asked = keyed ? [prompt, FLAT_BACKGROUND].join('\n\n') : prompt;
      const made = await run(
        (jobId, workspaceId, onEvent) =>
          client.generate(jobId, workspaceId, { prompt: asked, count, aspect }, onEvent),
        { prompt },
      );
      if (!keyed || !processor) return made;
      const workspaceId = options.workspaceId();
      if (!workspaceId) return made;
      return Promise.all(
        made.map(async (image) => {
          try {
            const cut = await processor.run(workspaceId, image.asset.id, { type: 'chroma_key' });
            const asset: AssetMeta = {
              ...cut.asset,
              origin: 'ai',
              lineage: { ...image.asset.lineage, parentAssetId: image.asset.id },
            };
            return { asset, preview: await options.preview(asset).catch(() => BLANK_PREVIEW) };
          } catch {
            // The image was made and paid for: it is kept on its colour rather than lost.
            return image;
          }
        }),
      );
    },

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

    process: async ({ assetId, operation }) => {
      const { processor } = options;
      if (!processor) {
        throw new ImageError(
          'unsupported',
          `Local image processing (${operation}) is not available here.`,
        );
      }
      const workspaceId = options.workspaceId();
      if (!workspaceId) throw new ImageError('unknown_workspace', 'No document is open.');
      const made = await processor
        .run(workspaceId, assetId, OPERATIONS[operation])
        .catch((error: unknown) => {
          // Rust says where to put the file and names the other operation its own way; the
          // agent is told what it can do about it, in the words of its tool.
          if (error instanceof ImageError && error.kind === 'not_installed') {
            throw new ImageError('not_installed', NO_MODEL);
          }
          throw error;
        });
      const source = options.asset?.(assetId);
      const asset: AssetMeta = {
        ...made.asset,
        origin: source?.origin ?? 'upload',
        ...(source?.name ? { name: source.name } : {}),
        ...(source?.attribution ? { attribution: source.attribution } : {}),
        lineage: { parentAssetId: assetId, provider: made.model ?? 'local' },
      };
      const preview = await options.preview(asset).catch(() => BLANK_PREVIEW);
      return { asset, preview };
    },

    // What a call goes to now: read every time, since the user can change it between calls.
    describe: async () => {
      const [id, providers] = await Promise.all([client.defaultProvider(), client.providers()]);
      const provider = providers.find((p) => p.id === id);
      if (!provider) throw new ImageError('unknown_provider', `unknown image provider: ${id}`);
      const { edit, mask } = provider.capabilities;
      return { name: provider.name, edit, mask };
    },

    cancel: async () => {
      await Promise.all([...running].map((jobId) => client.cancel(jobId)));
    },
  };
}
