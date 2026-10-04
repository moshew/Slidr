/**
 * Local image processing as the webview sees it (GEN-06, GEN-07): removing the background of a
 * picture with a model that runs on this machine, and keying out a flat background colour. Rust
 * does it in `src-tauri/src/image_process/`; `tauriProcess` is the IPC client; in a plain browser
 * `memoryProcess` stands in for it.
 *
 * The shapes mirror the Rust serde output: fields camelCase, enum values snake_case.
 * `src-tauri/src/image_process/fixtures/contract.json` pins them, and both sides test against it.
 * Nothing is sent anywhere: both operations read a file of the workspace and write another.
 */
import type { AssetMeta } from '@slidr/model';
import { invoke, type InvokeArgs } from '@tauri-apps/api/core';
import type { AssetService } from '../document/assets';
import type { ImportedAsset } from '../document/storage';
import { IMAGE_ERROR_KINDS, ImageError, type ImageErrorKind } from './images';

/** What is done to the picture. The original asset stays as it is (IMG-12). */
export type ProcessOperation =
  /** The subject is kept and everything behind it becomes transparent; needs the model. */
  | { type: 'remove_background' }
  /**
   * A flat background colour becomes transparent. Without `color` it is read off the border of
   * the picture. `tolerance` is 0..1; `contiguous` keeps the colour where the subject encloses it.
   */
  | { type: 'chroma_key'; color?: string; tolerance?: number; contiguous?: boolean };

/** A model the background removal can run on. */
export interface ProcessModel {
  id: string;
  name: string;
  /** The file the model is looked for under. */
  file: string;
  license: string;
  bytes: number;
}

/**
 * Whether background removal can run. `not_installed`: no model file was found in the places
 * the app looks in; `installDir` is where the user may put one. The app never fetches a model
 * by itself.
 */
export interface ProcessStatus {
  state: 'ready' | 'not_installed';
  model: ProcessModel | null;
  path: string | null;
  place: string | null;
  installDir: string | null;
  supported: ProcessModel[];
}

export interface ProcessResult {
  /** The new picture: a PNG with transparency, at the size of the original. */
  asset: ImportedAsset;
  durationMs: number;
  /** The id of the model that made the matte. */
  model?: string;
  /** The colour that was keyed out. */
  keyColor?: string;
}

/** Local image processing. Every method rejects with `ImageError`. */
export interface ImageProcessClient {
  status(): Promise<ProcessStatus>;
  run(workspaceId: string, assetId: string, operation: ProcessOperation): Promise<ProcessResult>;
}

const KINDS = new Set<string>(IMAGE_ERROR_KINDS);

function toImageError(error: unknown): ImageError {
  if (typeof error === 'object' && error !== null && 'kind' in error && 'message' in error) {
    const { kind, message } = error;
    if (typeof kind === 'string' && KINDS.has(kind)) {
      return new ImageError(kind as ImageErrorKind, String(message));
    }
  }
  return new ImageError('internal', error instanceof Error ? error.message : String(error));
}

async function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toImageError(error);
  }
}

/** Local image processing over Tauri IPC (`src-tauri/src/image_process/ipc.rs`). */
export const tauriProcess: ImageProcessClient = {
  status: () => call<ProcessStatus>('image_process_status'),
  run: (workspaceId, assetId, operation) =>
    call<ProcessResult>('image_process', { workspaceId, assetId, operation }),
};

/* ---------------------------------------------------------------- the plain browser's stand-in */

const PAGE_MODEL: ProcessModel = {
  id: 'page',
  name: 'Border colour (development)',
  file: '',
  license: '',
  bytes: 0,
};

function hexOf(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Makes the colour of the picture's border transparent, from the border inwards: every pixel
 * that is close to the colour of the top-left corner and reaches the border through such pixels.
 * Returns the colour it took out.
 */
export function clearBorderColour(image: ImageData, tolerance = 0.12): string {
  const { width, height, data } = image;
  const [r0 = 0, g0 = 0, b0 = 0] = data;
  // The distance in colour that still counts as the background, squared over three channels.
  const limit = 3 * (tolerance * 255) ** 2;
  const near = (at: number) => {
    const dr = data[at]! - r0;
    const dg = data[at + 1]! - g0;
    const db = data[at + 2]! - b0;
    return dr * dr + dg * dg + db * db <= limit;
  };
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = y * width + x;
    if (seen[index]) return;
    seen[index] = 1;
    if (near(index * 4)) queue.push(index);
  };
  for (let x = 0; x < width; x++) {
    visit(x, 0);
    visit(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    visit(0, y);
    visit(width - 1, y);
  }
  while (queue.length) {
    const index = queue.pop()!;
    data[index * 4 + 3] = 0;
    const x = index % width;
    const y = (index - x) / width;
    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }
  return hexOf(r0, g0, b0);
}

/**
 * Local image processing without the Rust core, for the Vite page and Playwright: both
 * operations take the colour of the picture's border out, from the border inwards, on a canvas.
 * It is no matte of a subject, but it turns a picture into another with transparency, stored
 * like the real one, which is what the app around it needs to be tried.
 */
export function memoryProcess(
  assets: AssetService,
  asset: (assetId: string) => AssetMeta | undefined,
): ImageProcessClient {
  return {
    status: () =>
      Promise.resolve({
        state: 'ready',
        model: PAGE_MODEL,
        path: null,
        place: null,
        installDir: null,
        supported: [PAGE_MODEL],
      }),
    run: async (_workspaceId, assetId, operation) => {
      const began = Date.now();
      const meta = asset(assetId);
      const url = meta ? assets.url(meta) : undefined;
      if (!meta || !url) throw new ImageError('not_found', `asset ${assetId} is not in the deck`);
      if (meta.kind !== 'image') {
        throw new ImageError('invalid_input', `asset ${assetId} is a ${meta.kind}, not an image`);
      }
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const g = canvas.getContext('2d', { willReadFrequently: true });
      if (!g) throw new ImageError('internal', 'no 2d canvas');
      g.drawImage(bitmap, 0, 0);
      bitmap.close();
      const pixels = g.getImageData(0, 0, canvas.width, canvas.height);
      const keyColor = clearBorderColour(
        pixels,
        operation.type === 'chroma_key' ? operation.tolerance : undefined,
      );
      g.putImageData(pixels, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (made) => (made ? resolve(made) : reject(new ImageError('internal', 'no picture'))),
          'image/png',
        );
      });
      const name = `${(meta.name ?? 'image').replace(/\.[^.]+$/, '')}-cutout.png`;
      const stored = await assets.import(
        new File([blob], name, { type: 'image/png' }),
        meta.origin,
      );
      return {
        asset: stored,
        durationMs: Date.now() - began,
        ...(operation.type === 'remove_background' ? { model: PAGE_MODEL.id } : { keyColor }),
      };
    },
  };
}
