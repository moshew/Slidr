import type { AssetMeta } from '@slidr/model';
import { drawPng } from './png';

/*
 * For the tests: a store of assets in memory, as the app's own keeps them (content-addressed),
 * and pictures to put in a deck.
 */

const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

export interface MemoryStore {
  store: (file: { name: string; mime: string; bytes: Uint8Array }) => Promise<AssetMeta>;
  bytes: Map<string, Uint8Array>;
}

/** A store that keeps each file under the hash of its content. */
export function memoryStore(): MemoryStore {
  const bytes = new Map<string, Uint8Array>();
  return {
    bytes,
    async store({ name, mime, bytes: data }) {
      const id = hex(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>));
      bytes.set(id, data);
      const kind: AssetMeta['kind'] =
        mime === 'image/svg+xml'
          ? 'svg'
          : mime.startsWith('image/')
            ? 'image'
            : mime.startsWith('video/')
              ? 'video'
              : mime.startsWith('audio/')
                ? 'audio'
                : 'other';
      const extension = name.split('.').at(-1) ?? 'bin';
      return {
        id,
        file: `${id}.${extension}`,
        mime,
        kind,
        bytes: data.length,
        origin: 'import',
        name,
      };
    },
  };
}

/** A picture whose corners are marked, red at the top left and green at the top right. */
export function markedPicture(w: number, h: number): Promise<Uint8Array<ArrayBuffer>> {
  return drawPng(w, h, (x, y) => {
    if (x < w * 0.1 && y < h * 0.1) return { color: [220, 40, 40], alpha: 1 };
    if (x > w * 0.9 && y < h * 0.1) return { color: [40, 160, 40], alpha: 1 };
    return { color: [120, 170, Math.round(255 - (y / h) * 120)], alpha: 1 };
  });
}
