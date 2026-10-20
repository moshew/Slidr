import { Channel, invoke, type InvokeArgs } from '@tauri-apps/api/core';
import {
  IMAGE_ERROR_KINDS,
  ImageError,
  type ImageClient,
  type ImageErrorKind,
  type ImageEvent,
  type ImageJobResult,
  type ImageProviderDescriptor,
  type ImageProviderStatus,
} from './images';

const KINDS = new Set<string>(IMAGE_ERROR_KINDS);

/** Rust rejects with `{ kind, message }`; anything else is a bug on one side of the bridge. */
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

/** The image providers over Tauri IPC (the commands in `src-tauri/src/image_providers/ipc.rs`). */
export const tauriImages: ImageClient = {
  providers: () => call<ImageProviderDescriptor[]>('image_providers'),
  probe: (providerId) => call<ImageProviderStatus>('image_probe', { providerId }),
  defaultProvider: () => call<string>('image_default_provider'),
  setDefaultProvider: async (providerId) => {
    await call('image_set_default_provider', { providerId });
  },
  // One channel per job, for its progress. The result is what the call returns.
  generate: (jobId, workspaceId, job, onEvent) =>
    call<ImageJobResult>('image_generate', {
      jobId,
      workspaceId,
      job,
      onEvent: new Channel<ImageEvent>(onEvent),
    }),
  edit: (jobId, workspaceId, job, onEvent) =>
    call<ImageJobResult>('image_edit', {
      jobId,
      workspaceId,
      job,
      onEvent: new Channel<ImageEvent>(onEvent),
    }),
  cancel: async (jobId) => {
    await call('image_cancel', { jobId });
  },
};
