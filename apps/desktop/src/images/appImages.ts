import type { AssetMeta } from '@slidr/model';
import type { AssetService } from '../document/assets';
import type { DocumentService } from '../document/documentService';
import { pageSettings } from '../settings/store';
import type { Editor } from '../shell/editor';
import { createImageService, type AgentImageService } from './imageService';
import type { ImageClient, ImageEvent } from './images';
import { memoryImages } from './memoryImages';
import { previewOf } from './preview';
import { memoryProcess, tauriProcess, type ImageProcessClient } from './process';
import { tauriImages } from './tauriImages';

export interface AppImages {
  /** The providers, jobs with progress, and cancel: what an image gallery works with. */
  client: ImageClient;
  /** The Deck API's `images` service, for the agent's tools. */
  service: AgentImageService;
  /** Local processing: background removal, and whether its model is installed. */
  processor: ImageProcessClient;
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
  /** An asset of the open deck, by id. */
  asset: (assetId: string) => AssetMeta | undefined = () => undefined,
): AppImages {
  // The page's own settings hold the choice of provider, so every client of a page agrees on it.
  const client = document ? tauriImages : memoryImages(assets, { settings: pageSettings });
  // In memory there is one store and no workspace; the id only has to be there.
  const workspaceId = () => (document ? (document.workspace?.id ?? null) : 'memory');
  const processor = document ? tauriProcess : memoryProcess(assets, asset);
  const service = createImageService({
    client,
    workspaceId,
    processor,
    asset,
    preview: (asset) => {
      const url = assets.url(asset);
      return url ? previewOf(url) : Promise.reject(new Error('The asset has no file at hand.'));
    },
    ...(onEvent ? { onEvent } : {}),
  });
  return { client, service, processor, workspaceId };
}

const ofEditor = new WeakMap<Editor, AppImages>();

/**
 * The images of an editing window, for the app's own screens: the settings, the media panel.
 * The agent's tools have a service of their own, which reports its jobs to the gallery.
 */
export function imagesOf(editor: Editor): AppImages {
  let images = ofEditor.get(editor);
  if (!images) {
    images = createAppImages(
      editor.document,
      editor.assets,
      undefined,
      (id) => editor.bus.deck.assets[id],
    );
    ofEditor.set(editor, images);
  }
  return images;
}
