/**
 * The image provider contract as the webview sees it (ADR-025). Rust implements it in
 * `src-tauri/src/image_providers/`; `tauriImages` is the IPC client; in a plain browser
 * `memoryImages` stands in for it; tests can use a fake `ImageClient`.
 *
 * The shapes mirror the Rust serde output exactly: fields camelCase, enum values snake_case.
 * `src-tauri/src/image_providers/fixtures/contract.json` pins them, and both sides test against
 * it. Nothing here names a particular provider: the UI knows descriptors, jobs and outcomes only.
 */
import type { ImportedAsset } from '../document/storage';

/** The shape of the picture (GEN-05). A provider gets as close as it can. */
export const IMAGE_ASPECTS = ['16:9', '4:3', '1:1', '3:4', '9:16'] as const;

export type ImageAspect = (typeof IMAGE_ASPECTS)[number];

/**
 * How a provider edits. `regenerate`: a new image drawn after the source, similar to it, with
 * none of its pixels kept. `exact`: the source with only what the instruction asks changed.
 */
export type EditSupport = 'none' | 'regenerate' | 'exact';

/** Feature flags; the UI hides what a provider does not support. */
export interface ImageCapabilities {
  edit: EditSupport;
  /** `edit` can be confined to a mask. Without it, a job with a mask is rejected. */
  mask: boolean;
  /** Images can have a transparent background. */
  transparent: boolean;
  /** How many images the provider makes at once; the rest of a job waits its turn. */
  maxParallel: number;
}

export interface ImageProviderDescriptor {
  /** Stable id, used in settings, in jobs and in an asset's `lineage.provider`. */
  id: string;
  name: string;
  capabilities: ImageCapabilities;
}

export type ImageProviderState = 'ready' | 'not_installed' | 'not_logged_in' | 'unavailable';

export interface ImageProviderStatus {
  state: ImageProviderState;
  version: string | null;
  /** How the provider is signed in, as it describes it. */
  account: string | null;
  /** English guidance or error text. */
  detail: string | null;
}

/** Closed set of failure categories, for both rejected calls and failed images. */
export const IMAGE_ERROR_KINDS = [
  /** No provider with that id. */
  'unknown_provider',
  /** The workspace is not open, or no document is. */
  'unknown_workspace',
  /** The asset to edit is not in the workspace. */
  'not_found',
  /** A malformed argument: empty prompt, count out of range, job id. */
  'invalid_input',
  /** The provider cannot do this: edit at all, or edit inside a mask. */
  'unsupported',
  /** The provider's program is not installed. */
  'not_installed',
  /** The provider is installed but not signed in, or its sign-in has expired. */
  'not_logged_in',
  /** A usage limit was reached. */
  'quota',
  /** The provider did not finish in time and was stopped. */
  'timeout',
  /** The job was cancelled. */
  'cancelled',
  /** The provider ran and produced no usable image; the message says what it reported. */
  'generation_failed',
  /** Reading or writing a file failed. */
  'io',
  /** A bug on the Rust side. */
  'internal',
] as const;

export type ImageErrorKind = (typeof IMAGE_ERROR_KINDS)[number];

/**
 * A rejected call, or a failed image raised as one. `message` is English; it may reach the agent
 * as the result of its tool call, so it says what to do next where there is something to do.
 */
export class ImageError extends Error {
  readonly kind: ImageErrorKind;

  constructor(kind: ImageErrorKind, message: string) {
    super(message);
    this.name = 'ImageError';
    this.kind = kind;
  }
}

/** `count` images from one prompt. */
export interface GenerateJob {
  prompt: string;
  /** 1 to 8. Each image is generated on its own. */
  count: number;
  aspect: ImageAspect;
  /** A provider id; the default provider when absent. */
  provider?: string | null;
}

/** `count` new images made from an asset of the workspace; the asset stays. */
export interface EditJob {
  assetId: string;
  instruction: string;
  /** An image asset whose transparent area is where the edit may happen. */
  maskAssetId?: string | null;
  count: number;
  provider?: string | null;
}

/** How one image of a job ended. `durationMs` is the provider's time. */
export type ImageOutcome =
  | { status: 'stored'; asset: ImportedAsset; durationMs: number }
  | { status: 'failed'; error: { kind: ImageErrorKind; message: string } };

/**
 * Progress of one image of a job. Per image: `started` once (not at all when the job is
 * cancelled while the image waits for a free slot of its provider), then `finished` once.
 * Providers report nothing in between, so the UI shows a skeleton.
 */
export type ImageEvent =
  { type: 'started'; index: number } | { type: 'finished'; index: number; outcome: ImageOutcome };

/** What a job returns: one outcome per image, in order. The events were only its progress. */
export interface ImageJobResult {
  /** The provider that ran the job. */
  provider: string;
  images: ImageOutcome[];
}

/** The image providers over IPC. Every method rejects with `ImageError`. */
export interface ImageClient {
  /** The registered providers, in display order. */
  providers(): Promise<ImageProviderDescriptor[]>;
  /** Installed? Which version? Signed in? */
  probe(providerId: string): Promise<ImageProviderStatus>;
  /** The id of the provider a job uses when it names none. */
  defaultProvider(): Promise<string>;
  /** The user's choice of default, kept across runs. */
  setDefaultProvider(providerId: string): Promise<void>;
  /**
   * Generates `job.count` images in parallel and stores each as an asset of the workspace.
   * Resolves when every image is settled; an image that fails does not fail the others.
   * `jobId` is the caller's (letters, digits, `-`, `_`), so that it can cancel the job.
   */
  generate(
    jobId: string,
    workspaceId: string,
    job: GenerateJob,
    onEvent?: (event: ImageEvent) => void,
  ): Promise<ImageJobResult>;
  /** As `generate`, from an asset of the workspace. What "edit" means is `capabilities.edit`. */
  edit(
    jobId: string,
    workspaceId: string,
    job: EditJob,
    onEvent?: (event: ImageEvent) => void,
  ): Promise<ImageJobResult>;
  /** Ends the unfinished images of a job as `cancelled`. Images already stored stay. */
  cancel(jobId: string): Promise<void>;
}
