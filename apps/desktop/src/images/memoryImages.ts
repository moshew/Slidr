import type { AssetService } from '../document/assets';
import {
  ImageError,
  type ImageClient,
  type ImageErrorKind,
  type ImageEvent,
  type ImageJobResult,
  type ImageOutcome,
  type ImageProviderDescriptor,
} from './images';

/** A placeholder picture to paint: its size, and what sets its colours. */
export interface Placeholder {
  width: number;
  height: number;
  seed: number;
}

export interface MemoryImagesOptions {
  /** How long an image takes; each takes up to three quarters more. Default 1500. */
  delayMs?: number;
  /** Paints a placeholder. The default draws a gradient on a canvas, which tests do not have. */
  paint?: (placeholder: Placeholder) => Promise<Blob>;
}

const DESCRIPTOR: ImageProviderDescriptor = {
  id: 'mock',
  name: 'Mock images',
  capabilities: { edit: 'exact', mask: true, transparent: false, maxParallel: 4 },
};

/** The longer side of a placeholder, in pixels. */
const LONG_SIDE = 640;
const MAX_COUNT = 8;

/** The words that make the Rust mock provider fail make this one fail the same way. */
const FAILURES: [string, ImageErrorKind][] = [
  ['mock:quota', 'quota'],
  ['mock:not_logged_in', 'not_logged_in'],
  ['mock:not_installed', 'not_installed'],
  ['mock:timeout', 'timeout'],
  ['mock:fail', 'generation_failed'],
];

const hue = (seed: number, turn: number) => (seed * 47 + turn * 151) % 360;

async function paintGradient({ width, height, seed }: Placeholder): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no 2d canvas');
  const gradient = g.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue(seed, 0)} 65% 55%)`);
  gradient.addColorStop(1, `hsl(${hue(seed, 1)} 70% 35%)`);
  g.fillStyle = gradient;
  g.fillRect(0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no image'))), 'image/png');
  });
}

function sizeOf(width: number, height: number): { width: number; height: number } {
  const scale = LONG_SIDE / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * The image providers without the Rust core: in a plain browser (the Vite page, Playwright), one
 * provider that paints placeholder pictures and stores them through the page's `AssetService`.
 * The browser's counterpart of the Rust mock provider: each image is a gradient of the requested
 * shape, different from the others, and the same words in the prompt pick a failure
 * (`mock:quota`, `mock:not_logged_in`, `mock:not_installed`, `mock:timeout`, `mock:fail`,
 * `mock:flaky` for every third image, `mock:hang` for one only a cancel ends).
 */
export function memoryImages(assets: AssetService, options: MemoryImagesOptions = {}): ImageClient {
  const delayMs = options.delayMs ?? 1500;
  const paint = options.paint ?? paintGradient;
  /** The running jobs, each with what cancels it. */
  const jobs = new Map<string, AbortController>();
  let made = 0;

  /** Waits, unless the job is cancelled first. */
  const wait = (ms: number, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const cancelled = () => reject(new ImageError('cancelled', 'the job was cancelled'));
      if (signal.aborted) return cancelled();
      const timer = setTimeout(resolve, ms);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        cancelled();
      });
    });

  async function one(text: string, size: Placeholder, signal: AbortSignal): Promise<ImageOutcome> {
    const serial = made++;
    const began = Date.now();
    try {
      await wait(
        text.includes('mock:hang') ? 2 ** 31 - 1 : delayMs * (1 + (serial % 4) / 4),
        signal,
      );
      const flaky = text.includes('mock:flaky') && serial % 3 === 2;
      const failure = FAILURES.find(([word]) => text.includes(word)) ?? (flaky && FAILURES[4]);
      if (failure) {
        throw new ImageError(failure[1], `the mock provider was asked to fail (${failure[0]})`);
      }
      const blob = await paint({ ...size, seed: size.seed + serial });
      const file = new File([blob], `mock-${serial + 1}.png`, { type: blob.type || 'image/png' });
      const asset = await assets.import(file, 'ai');
      return { status: 'stored', asset, durationMs: Date.now() - began };
    } catch (error) {
      const failed =
        error instanceof ImageError
          ? { kind: error.kind, message: error.message }
          : { kind: 'internal' as const, message: String(error) };
      return { status: 'failed', error: failed };
    }
  }

  async function run(
    jobId: string,
    text: string,
    count: number,
    size: { width: number; height: number },
    onEvent?: (event: ImageEvent) => void,
  ): Promise<ImageJobResult> {
    if (!text.trim()) throw new ImageError('invalid_input', 'the prompt is empty');
    if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
      throw new ImageError('invalid_input', `count must be between 1 and ${MAX_COUNT}`);
    }
    if (jobs.has(jobId)) {
      throw new ImageError('invalid_input', `a job with the id ${jobId} is already running`);
    }
    const job = new AbortController();
    jobs.set(jobId, job);
    const seed = [...text].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 9973, 7);
    try {
      const images = await Promise.all(
        Array.from({ length: count }, async (_, index) => {
          onEvent?.({ type: 'started', index });
          const outcome = await one(text, { ...size, seed }, job.signal);
          onEvent?.({ type: 'finished', index, outcome });
          return outcome;
        }),
      );
      return { provider: DESCRIPTOR.id, images };
    } finally {
      jobs.delete(jobId);
    }
  }

  return {
    providers: () => Promise.resolve([DESCRIPTOR]),
    probe: () => Promise.resolve({ state: 'ready', version: null, account: null, detail: null }),
    defaultProvider: () => Promise.resolve(DESCRIPTOR.id),
    setDefaultProvider: (providerId) =>
      providerId === DESCRIPTOR.id
        ? Promise.resolve()
        : Promise.reject(
            new ImageError('unknown_provider', `unknown image provider: ${providerId}`),
          ),
    generate: (jobId, _workspaceId, job, onEvent) => {
      const [width, height] = job.aspect.split(':').map(Number) as [number, number];
      return run(jobId, job.prompt, job.count, sizeOf(width, height), onEvent);
    },
    // The source is not read: the placeholder is wide whatever the source was.
    edit: (jobId, _workspaceId, job, onEvent) =>
      run(jobId, job.instruction, job.count, sizeOf(16, 9), onEvent),
    cancel: (jobId) => {
      jobs.get(jobId)?.abort();
      return Promise.resolve();
    },
  };
}
