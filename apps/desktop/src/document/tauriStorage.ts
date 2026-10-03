import { invoke, type InvokeArgs } from '@tauri-apps/api/core';
import {
  StorageError,
  type ImportedAsset,
  type OpenedDeck,
  type RecentFile,
  type RecoverableWorkspace,
  type SavedDeck,
  type Storage,
  type StorageErrorKind,
  type Workspace,
} from './storage';

const KINDS = new Set<StorageErrorKind>([
  'not_found',
  'invalid_file',
  'invalid_input',
  'io',
  'unknown_workspace',
  'internal',
]);

/** Rust rejects with `{ kind, message }`; anything else is a bug on one side of the bridge. */
function toStorageError(error: unknown): StorageError {
  if (typeof error === 'object' && error !== null && 'kind' in error && 'message' in error) {
    const { kind, message } = error;
    if (KINDS.has(kind as StorageErrorKind)) {
      return new StorageError(kind as StorageErrorKind, String(message));
    }
  }
  return new StorageError('internal', error instanceof Error ? error.message : String(error));
}

async function call<T>(command: string, args?: InvokeArgs, headers?: Record<string, string>) {
  try {
    return await invoke<T>(command, args, headers ? { headers } : undefined);
  } catch (error) {
    throw toStorageError(error);
  }
}

/** The storage contract over Tauri IPC (the commands in `src-tauri/src/commands.rs`). */
export const tauriStorage: Storage = {
  create: () => call<Workspace>('storage_new'),
  open: (path) => call<OpenedDeck>('storage_open', { path }),
  writeDeck: async (workspaceId, deckJson, title) => {
    await call('storage_write_deck', { workspaceId, deckJson, title });
  },
  save: (workspaceId, path, deckJson, title) =>
    call<SavedDeck>('storage_save', { workspaceId, path, deckJson, title }),
  close: async (workspaceId) => {
    await call('storage_close', { workspaceId });
  },
  listRecoverable: () => call<RecoverableWorkspace[]>('storage_list_recoverable'),
  recover: (workspaceId) => call<OpenedDeck>('storage_recover', { workspaceId }),
  backup: (path, tag) => call<string>('storage_backup', { path, tag }),
  importAssetFile: (workspaceId, path) =>
    call<ImportedAsset>('asset_import_file', { workspaceId, path }),
  // The bytes go as the raw request body, not as a JSON array of numbers.
  importAssetBytes: (workspaceId, name, bytes) =>
    call<ImportedAsset>('asset_import_bytes', bytes, {
      'x-workspace-id': workspaceId,
      'x-file-name': encodeURIComponent(name),
    }),
  listRecents: () => call<RecentFile[]>('recents_list'),
  removeRecent: async (path) => {
    await call('recents_remove', { path });
  },
};
