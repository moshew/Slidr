import type { PngImage, StockService, StoredImage } from '@slidr/agent-tools';
import type { AssetMeta } from '@slidr/model';
import { BLANK_PREVIEW, previewOf } from '../images/preview';
import { pageSettings } from '../settings';
import type { Editor } from '../shell/editor';
import { memoryStock } from './memoryStock';
import { stockAsset, StockError, type StockClient } from './stock';
import { tauriStock } from './tauriStock';

export interface AppStock {
  /** The libraries, searches, thumbnails and imports: what the media panel works with. */
  client: StockClient;
  /** The workspace an import stores into; null while no document is open. */
  workspaceId: () => string | null;
}

const ofEditor = new WeakMap<Editor, AppStock>();

/**
 * The stock photos of an editing window, wired the way its images are: in the app, through IPC
 * into the document's workspace; in a plain browser (the Vite page, Playwright), drawn and kept
 * in memory.
 */
export function stockOf(editor: Editor): AppStock {
  let stock = ofEditor.get(editor);
  if (!stock) {
    const { document, assets } = editor;
    stock = {
      client: document ? tauriStock : memoryStock(assets, { settings: pageSettings }),
      workspaceId: () => (document ? (document.workspace?.id ?? null) : 'memory'),
    };
    ofEditor.set(editor, stock);
  }
  return stock;
}

export interface StockServiceOptions {
  client: StockClient;
  workspaceId: () => string | null;
  /** A small PNG of a stored photo, for the agent to look at. */
  preview: (asset: AssetMeta) => Promise<PngImage>;
}

/**
 * The Deck API's stock service (`stock_search`) over the photo libraries (ADR-051): the best
 * matches of a search are taken into the deck's assets, each with its credit, and returned with
 * a preview. A photo that cannot be fetched is left out; when none can be, the call rejects with
 * the first failure, whose message is what the agent reads.
 */
export function createStockService(options: StockServiceOptions): StockService {
  const { client } = options;
  return {
    async search({ query, count, orientation }): Promise<StoredImage[]> {
      const workspaceId = options.workspaceId();
      if (!workspaceId) throw new StockError('unknown_workspace', 'No document is open.');
      const results = await client.search(null, {
        query,
        perPage: count,
        ...(orientation ? { orientation } : {}),
      });
      const taken = await Promise.allSettled(
        results.photos
          .slice(0, count)
          .map((photo) => client.import(workspaceId, photo.source, photo.id)),
      );
      const stored = taken.flatMap((outcome) =>
        outcome.status === 'fulfilled' ? [stockAsset(outcome.value)] : [],
      );
      const [failure] = taken.flatMap((outcome) =>
        outcome.status === 'rejected' ? [outcome.reason as unknown] : [],
      );
      if (stored.length === 0 && failure !== undefined) {
        throw failure instanceof Error
          ? failure
          : new StockError('failed', 'The photo could not be taken into the deck.');
      }
      return Promise.all(
        stored.map(async (asset) => ({
          asset,
          // The photo is in the deck; a preview that fails must not turn that into an error.
          preview: await options.preview(asset).catch(() => BLANK_PREVIEW),
        })),
      );
    },
  };
}

/** The stock service of an editing window, for the agent's tools. */
export function stockServiceOf(editor: Editor): StockService {
  const { client, workspaceId } = stockOf(editor);
  return createStockService({
    client,
    workspaceId,
    preview: (asset) => {
      const url = editor.assets.url(asset);
      return url ? previewOf(url) : Promise.reject(new Error('The asset has no file at hand.'));
    },
  });
}
