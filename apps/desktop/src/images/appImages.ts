import type { AssetService } from '../document/assets';
import type { DocumentService } from '../document/documentService';
import { createImageService, type AgentImageService } from './imageService';
import type { ImageClient, ImageEvent } from './images';
import { memoryImages } from './memoryImages';
import { previewOf } from './preview';
import { tauriImages } from './tauriImages';

export interface AppImages {
  /** The providers, jobs with progress, and cancel: what an image gallery works with. */
  client: ImageClient;
  /** The Deck API's `images` service, for the agent's tools. */
  service: AgentImageService;
  /** The workspace jobs of `client` store into; null while no document is open. */
  workspaceId: () => string | null;
}

/**
 * The images of the open document, wired the way its assets are (`document/assets.ts`): in the
 * app, through IPC into the document's workspace; in a plain browser (the Vite page, Playwright),
 * where there is no document service, painted and kept in memory.
 */
export function createAppImages(
  document: DocumentService | null,
  assets: AssetService,
  onEvent?: (jobId: string, event: ImageEvent) => void,
): AppImages {
  const client = document ? tauriImages : memoryImages(assets);
  // In memory there is one store and no workspace; the id only has to be there.
  const workspaceId = () => (document ? (document.workspace?.id ?? null) : 'memory');
  const service = createImageService({
    client,
    workspaceId,
    preview: (asset) => {
      const url = assets.url(asset);
      return url ? previewOf(url) : Promise.reject(new Error('The asset has no file at hand.'));
    },
    ...(onEvent ? { onEvent } : {}),
  });
  return { client, service, workspaceId };
}
