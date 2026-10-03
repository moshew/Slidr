import { invoke, type InvokeArgs } from '@tauri-apps/api/core';
import {
  SettingsError,
  type SecretStatus,
  type SettingsClient,
  type SettingsErrorKind,
} from './settings';

const KINDS = new Set<string>(['invalid_input', 'io', 'internal']);

/** Rust rejects with `{ kind, message }`; anything else is a bug on one side of the bridge. */
function toSettingsError(error: unknown): SettingsError {
  if (typeof error === 'object' && error !== null && 'kind' in error && 'message' in error) {
    const { kind, message } = error;
    if (typeof kind === 'string' && KINDS.has(kind)) {
      return new SettingsError(kind as SettingsErrorKind, String(message));
    }
  }
  return new SettingsError('internal', error instanceof Error ? error.message : String(error));
}

async function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toSettingsError(error);
  }
}

/**
 * The settings and the keys over Tauri IPC (`src-tauri/src/settings/ipc.rs`,
 * `src-tauri/src/secrets/ipc.rs`). There is no command that returns a key.
 */
export const tauriSettings: SettingsClient = {
  read: () => call<Record<string, unknown>>('settings_read'),
  write: async (section, value) => {
    await call('settings_write', { section, value: value ?? null });
  },
  secrets: () => call<SecretStatus[]>('secret_status'),
  setSecret: async (name, value) => {
    await call('secret_set', { name, value });
  },
  deleteSecret: async (name) => {
    await call('secret_delete', { name });
  },
};
