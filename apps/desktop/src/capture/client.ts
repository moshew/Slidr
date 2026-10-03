import type { Deck } from '@slidr/model';
import { invoke } from '@tauri-apps/api/core';

/** RND-04: 960×540 for the agent; 1920×1080 for export and the thumbnails kept in the deck. */
export const CAPTURE_WIDTH = { agent: 960, export: 1920, thumbnail: 1920 } as const;

export interface CaptureOptions {
  /** Output width in pixels (16–3840); the height is 9/16 of it. Default: `CAPTURE_WIDTH.agent`. */
  width?: number;
  /**
   * `optimizeForSpeed`: the same pixels, 1.3–3.5× faster, a 15–50% larger PNG (ADR-003). For
   * the agent; not for `thumbs/` or export, which are kept.
   */
  fast?: boolean;
  /** The open workspace whose `assets/` folder holds the deck's asset files. */
  workspaceId?: string | null;
}

export type CaptureErrorKind =
  | 'invalid_input'
  | 'unknown_workspace'
  /** Not Windows: the capture is WebView2's. */
  | 'unsupported'
  /** The capture page did not load (20 s, cold start) or the slide did not settle (10 s). */
  | 'timeout'
  | 'render_failed'
  | 'capture_failed'
  | 'internal';

const KINDS = new Set<string>([
  'invalid_input',
  'unknown_workspace',
  'unsupported',
  'timeout',
  'render_failed',
  'capture_failed',
  'internal',
] satisfies CaptureErrorKind[]);

export class CaptureError extends Error {
  readonly kind: CaptureErrorKind;

  constructor(kind: CaptureErrorKind, message: string) {
    super(message);
    this.name = 'CaptureError';
    this.kind = kind;
  }
}

/** Rust rejects with `{ kind, message }`; anything else is a bug on one side of the bridge. */
function toCaptureError(error: unknown): CaptureError {
  if (typeof error === 'object' && error !== null && 'kind' in error && 'message' in error) {
    const { kind, message } = error;
    if (typeof kind === 'string' && KINDS.has(kind)) {
      return new CaptureError(kind as CaptureErrorKind, String(message));
    }
  }
  return new CaptureError('internal', error instanceof Error ? error.message : String(error));
}

/**
 * The slide as a PNG, drawn by the hidden capture window and taken by WebView2 (ADR-003). Only
 * the slide travels, with the parts of the deck it renders from; the other slides stay behind.
 * Captures run one at a time. Rejects with `CaptureError`.
 */
export async function captureSlide(
  deck: Deck,
  slideId: string,
  options: CaptureOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const slide = deck.slides.find((s) => s.id === slideId);
  if (!slide) throw new CaptureError('invalid_input', `no slide ${slideId} in the deck`);
  const request = { deck: { ...deck, slides: [slide] }, workspaceId: options.workspaceId ?? null };
  try {
    // The answer is the raw PNG bytes, not JSON.
    const png = await invoke<ArrayBuffer>('capture_slide', {
      request,
      width: options.width ?? CAPTURE_WIDTH.agent,
      fast: options.fast ?? false,
    });
    return new Uint8Array(png);
  } catch (error) {
    throw toCaptureError(error);
  }
}

/** A captured PNG as a Blob, for an `<img>` or a file. */
export function pngBlob(png: Uint8Array<ArrayBuffer>): Blob {
  return new Blob([png], { type: 'image/png' });
}
