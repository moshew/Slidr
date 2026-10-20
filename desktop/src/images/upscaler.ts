/**
 * Upscaling as the webview sees it (AIO-04): a picture drawn again at two or four times its size
 * by a model that runs on this machine. Rust does it in `src-tauri/src/image_process/upscale.rs`;
 * `tauriUpscaler` is the IPC client; in a plain browser `memoryUpscaler` stands in for it.
 *
 * It is a job, not a call like the other local operations (`process.ts`): it takes seconds to a
 * minute, so it says how far it is and can be stopped. The shapes mirror the Rust serde output,
 * pinned by `src-tauri/src/image_process/fixtures/contract.json` under `upscale`.
 */
import type { AssetMeta } from '@slidr/model';
import { Channel, invoke, type InvokeArgs } from '@tauri-apps/api/core';
import type { AssetService } from '../document/assets';
import type { ImportedAsset } from '../document/storage';
import { IMAGE_ERROR_KINDS, ImageError, type ImageErrorKind } from './images';
import type { ProcessModel } from './process';

/**
 * Whether a picture can be upscaled, and how far. `not_installed`: no model file was found in
 * the places the app looks in; `installDir` is where the user may put one. The app never
 * fetches a model by itself.
 */
export interface UpscaleStatus {
  state: 'ready' | 'not_installed';
  model: ProcessModel | null;
  path: string | null;
  place: string | null;
  installDir: string | null;
  supported: ProcessModel[];
  /** How many times its size a picture can be asked for. Empty without a model. */
  factors: number[];
  /** The largest picture that is upscaled, in pixels. */
  maxSourcePixels: number;
  /** The largest result, in pixels: what decides whether a picture can go four times. */
  maxResultPixels: number;
}

export interface UpscaleResult {
  /** The new picture, `factor` times the size of its source and in the source's format. */
  asset: ImportedAsset;
  durationMs: number;
  /** The id of the model that drew it. */
  model: string;
  factor: number;
}

/** How far a job is: the picture goes through the model in tiles. */
export interface UpscaleProgress {
  done: number;
  total: number;
}

/** Upscaling. Every method rejects with `ImageError`; a stopped job with the kind `cancelled`. */
export interface ImageUpscaler {
  status(): Promise<UpscaleStatus>;
  /**
   * Upscales an image asset of the workspace and stores the result as a new asset; the source
   * stays (IMG-12). `jobId` is the caller's (letters, digits, `-`, `_`), so that it can cancel.
   */
  run(
    jobId: string,
    workspaceId: string,
    assetId: string,
    factor: number,
    onProgress?: (progress: UpscaleProgress) => void,
  ): Promise<UpscaleResult>;
  /** Stops a job: its `run` rejects as `cancelled`, and nothing is stored. */
  cancel(jobId: string): Promise<void>;
}

/** Why a picture cannot be upscaled a number of times; undefined when it can. */
export type UpscaleRefusal = 'not_installed' | 'too_large';

/**
 * Whether a picture of this size can be upscaled `factor` times, by the limits the status
 * gives: the same check Rust makes, made here so that the choice can say so before it is taken.
 */
export function upscaleRefusal(
  status: UpscaleStatus,
  size: { width: number; height: number },
  factor: number,
): UpscaleRefusal | undefined {
  if (status.state !== 'ready' || !status.factors.includes(factor)) return 'not_installed';
  const pixels = size.width * size.height;
  if (pixels > status.maxSourcePixels || pixels * factor * factor > status.maxResultPixels) {
    return 'too_large';
  }
  return undefined;
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

/** Upscaling over Tauri IPC (`src-tauri/src/image_process/ipc.rs`). */
export const tauriUpscaler: ImageUpscaler = {
  status: () => call<UpscaleStatus>('image_upscale_status'),
  // One channel per job, for its progress. The result is what the call returns.
  run: (jobId, workspaceId, assetId, factor, onProgress) =>
    call<UpscaleResult>('image_upscale', {
      jobId,
      workspaceId,
      assetId,
      factor,
      onProgress: new Channel<UpscaleProgress>(onProgress),
    }),
  cancel: async (jobId) => {
    await call('image_upscale_cancel', { jobId });
  },
};

/* ---------------------------------------------------------------- the plain browser's stand-in */

const PAGE_MODEL: ProcessModel = {
  id: 'page',
  name: 'Canvas resampling (development)',
  file: '',
  license: '',
  bytes: 0,
};

/** How the stand-in behaves: the states of the real one, for whoever tries the app around it. */
export interface MemoryUpscaling {
  /** Whether a model is "installed". */
  installed: boolean;
  /** How many tiles a job counts through, and how long each takes, in milliseconds. */
  tiles: number;
  tileMs: number;
}

/** The stand-in of the page, as it is unless a test turns its knobs. */
export const pageUpscaling: MemoryUpscaling = { installed: true, tiles: 4, tileMs: 30 };

/**
 * Upscaling without the Rust core, for the Vite page and Playwright. It adds no detail: the
 * picture is resampled on a canvas, which is exactly what the real thing is not. What it gives
 * the app around it is the job: a larger picture stored as a new asset, progress on the way,
 * and a job that stops when it is told to.
 */
export function memoryUpscaler(
  assets: AssetService,
  asset: (assetId: string) => AssetMeta | undefined,
  knobs: MemoryUpscaling = pageUpscaling,
): ImageUpscaler {
  const cancelled = new Set<string>();
  const limits = { maxSourcePixels: 4_194_304, maxResultPixels: 40_000_000 };
  const status = (): UpscaleStatus => {
    const { installed } = knobs;
    return {
      state: installed ? 'ready' : 'not_installed',
      model: installed ? PAGE_MODEL : null,
      path: null,
      place: null,
      installDir: null,
      supported: [PAGE_MODEL],
      factors: installed ? [2, 4] : [],
      ...limits,
    };
  };
  return {
    status: () => Promise.resolve(status()),
    run: async (jobId, _workspaceId, assetId, factor, onProgress) => {
      const began = Date.now();
      const now = status();
      if (now.state !== 'ready') {
        throw new ImageError('not_installed', 'no upscaling model is installed');
      }
      const meta = asset(assetId);
      const url = meta ? assets.url(meta) : undefined;
      if (!meta || !url) throw new ImageError('not_found', `asset ${assetId} is not in the deck`);
      if (meta.kind !== 'image') {
        throw new ImageError('invalid_input', `asset ${assetId} is a ${meta.kind}, not an image`);
      }
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      try {
        const size = { width: bitmap.width, height: bitmap.height };
        if (upscaleRefusal(now, size, factor)) {
          throw new ImageError('invalid_input', 'the picture is too large to upscale here');
        }
        const { tiles, tileMs } = knobs;
        onProgress?.({ done: 0, total: tiles });
        for (let done = 1; done <= tiles; done++) {
          await new Promise((resolve) => setTimeout(resolve, tileMs));
          if (cancelled.has(jobId)) throw new ImageError('cancelled', 'the job was cancelled');
          onProgress?.({ done, total: tiles });
        }
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width * factor;
        canvas.height = bitmap.height * factor;
        const g = canvas.getContext('2d');
        if (!g) throw new ImageError('internal', 'no 2d canvas');
        g.imageSmoothingQuality = 'high';
        g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        // A photograph stays a photograph, as in the real one.
        const type = meta.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png';
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (made) => (made ? resolve(made) : reject(new ImageError('internal', 'no picture'))),
            type,
            0.92,
          );
        });
        const base = (meta.name ?? 'image').replace(/\.[^.]+$/, '');
        const name = `${base}-${factor}x.${type === 'image/jpeg' ? 'jpg' : 'png'}`;
        const stored = await assets.import(new File([blob], name, { type }), meta.origin);
        return { asset: stored, durationMs: Date.now() - began, model: PAGE_MODEL.id, factor };
      } finally {
        bitmap.close();
        cancelled.delete(jobId);
      }
    },
    cancel: (jobId) => {
      cancelled.add(jobId);
      return Promise.resolve();
    },
  };
}
