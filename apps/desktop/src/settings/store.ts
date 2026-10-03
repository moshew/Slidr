import { isTauri } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { memorySettings, type MemorySettings } from './memorySettings';
import { SECRET_NAMES, type SecretName, type SettingsClient } from './settings';
import { tauriSettings } from './tauriSettings';

/**
 * The settings of a plain browser page (the Vite page, Playwright): kept in memory, like the
 * page's assets. The stand-ins of the services that need a key ask it whether one is stored.
 */
export const pageSettings: MemorySettings = memorySettings();

/** The settings of this window: the Rust core's in the app, the page's own in a browser. */
export function settingsClient(): SettingsClient {
  return isTauri() ? tauriSettings : pageSettings;
}

interface SettingsState {
  /** The sections as last read or written; empty until `loadSettings` resolves. */
  sections: Record<string, unknown>;
  /** Which keys are stored. */
  keys: Record<SecretName, boolean>;
  loaded: boolean;
  /** Goes up with every change, for what must look again: a provider's status, a source's. */
  revision: number;
}

const noKeys = () =>
  Object.fromEntries(SECRET_NAMES.map((name) => [name, false])) as Record<SecretName, boolean>;

export const useSettings = create<SettingsState>(() => ({
  sections: {},
  keys: noKeys(),
  loaded: false,
  revision: 0,
}));

async function read(): Promise<void> {
  const client = settingsClient();
  const [sections, secrets] = await Promise.all([client.read(), client.secrets()]);
  const keys = noKeys();
  for (const { name, present } of secrets) keys[name] = present;
  useSettings.setState((state) => ({
    sections,
    keys,
    loaded: true,
    revision: state.revision + 1,
  }));
}

let loading: Promise<void> | null = null;

/** Reads the settings once. Nothing reads them before a screen that needs them asks. */
export function loadSettings(): Promise<void> {
  loading ??= read().catch((error: unknown) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** Reads the settings again: the core writes some of them itself (the default image provider). */
export function refreshSettings(): Promise<void> {
  loading = read();
  return loading;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One section, as an object; empty when it is absent or is not one. */
export function sectionOf(
  sections: Record<string, unknown>,
  name: string,
): Record<string, unknown> {
  const value = sections[name];
  return isRecord(value) ? value : {};
}

/** Changes fields of one section and keeps the rest of it. A field set to `undefined` is removed. */
export async function updateSection(name: string, patch: Record<string, unknown>): Promise<void> {
  await loadSettings();
  // What the core holds now, so a field it wrote itself is not lost.
  const stored = sectionOf(await settingsClient().read(), name);
  const next = { ...stored, ...patch };
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  await settingsClient().write(name, next);
  useSettings.setState((state) => ({
    sections: { ...state.sections, [name]: next },
    revision: state.revision + 1,
  }));
}

/** Hands a key the user entered to the credential store. The text is not kept here. */
export async function saveSecret(name: SecretName, value: string): Promise<void> {
  await settingsClient().setSecret(name, value);
  useSettings.setState((state) => ({
    keys: { ...state.keys, [name]: true },
    revision: state.revision + 1,
  }));
}

export async function removeSecret(name: SecretName): Promise<void> {
  await settingsClient().deleteSecret(name);
  useSettings.setState((state) => ({
    keys: { ...state.keys, [name]: false },
    revision: state.revision + 1,
  }));
}

/** A section of the settings, for a component; re-renders when it changes. */
export function useSection(name: string): Record<string, unknown> {
  // `sectionOf` makes a new object for an absent section: select the stored value itself.
  const value = useSettings((state) => state.sections[name]);
  return isRecord(value) ? value : EMPTY;
}

const EMPTY: Record<string, unknown> = Object.freeze({});
