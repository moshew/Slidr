import { invoke, type InvokeArgs } from '@tauri-apps/api/core';
import {
  STOCK_ERROR_KINDS,
  StockError,
  type ImportedPhoto,
  type StockClient,
  type StockErrorKind,
  type StockResults,
  type StockSource,
} from './stock';

const KINDS = new Set<string>(STOCK_ERROR_KINDS);

/** Rust rejects with `{ kind, message }`; anything else is a bug on one side of the bridge. */
function toStockError(error: unknown): StockError {
  if (typeof error === 'object' && error !== null && 'kind' in error && 'message' in error) {
    const { kind, message } = error;
    if (typeof kind === 'string' && KINDS.has(kind)) {
      return new StockError(kind as StockErrorKind, String(message));
    }
  }
  return new StockError('internal', error instanceof Error ? error.message : String(error));
}

async function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toStockError(error);
  }
}

/** The type a picture's bytes say they are; the libraries serve JPEG, the mock PNG. */
function pictureType(bytes: Uint8Array): string {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0x52 && bytes[1] === 0x49) return 'image/webp';
  return 'image/jpeg';
}

/** The photo libraries over Tauri IPC (the commands in `src-tauri/src/stock/ipc.rs`). */
export const tauriStock: StockClient = {
  sources: () => call<StockSource[]>('stock_sources'),
  defaultSource: () => call<string>('stock_default_source'),
  search: (source, query) => call<StockResults>('stock_search', { source, query }),
  thumbnail: async (source, id) => {
    const bytes = new Uint8Array(await call<ArrayBuffer>('stock_thumbnail', { source, id }));
    return new Blob([bytes], { type: pictureType(bytes) });
  },
  import: (workspaceId, source, id) =>
    call<ImportedPhoto>('stock_import', { workspaceId, source, id }),
};
