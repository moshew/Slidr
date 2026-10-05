import { isTauri } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { memorySettings, type MemorySettings } from './memorySettings';
import { SECRET_NAMES, type SecretName, type SecretStatus, type SettingsClient } from './settings';
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

/** The writes of `replaceSection`, one after another: the file ends as the last of them left it. */
let writing: Promise<void> = Promise.resolve();

async function read(): Promise<void> {
  const client = settingsClient();
  let sections: Record<string, unknown>;
  let secrets: SecretStatus[];
  // A section replaced while the file was being read is not in what was read: read again, so
  // the store never goes back to a value the user has already changed.
  for (;;) {
    const before = writing;
    await before;
    [sections, secrets] = await Promise.all([client.read(), client.secrets()]);
    if (writing === before) break;
  }
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

/**
 * Reads the settings once. The shell asks at startup, for the user's shortcuts and the agent's
 * settings; a screen that shows settings asks again and gets the same answer.
 */
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

/**
 * Replaces one section at once, for what is read without waiting: a key press reads the user's
 * shortcuts, a session the agent's settings. The store holds the new value when this returns;
 * the promise is the file's, which gets the value after the writes before it. `null` removes
 * the section. A write the file refused leaves the store with the value, until the next read.
 */
export function replaceSection(name: string, value: Record<string, unknown> | null): Promise<void> {
  useSettings.setState((state) => {
    const rest = Object.fromEntries(
      Object.entries(state.sections).filter(([section]) => section !== name),
    );
    return {
      sections: value === null ? rest : { ...rest, [name]: value },
      revision: state.revision + 1,
    };
  });
  const run = writing.then(() => settingsClient().write(name, value));
  writing = run.catch(() => undefined);
  return run;
}

/** Changes fields of one section and keeps the rest of it. A field set to `undefined` is removed. */
export async function updateSection(name: string, patch: Record<string, unknown>): Promise<void> {
  await loadSettings();
  await writing;
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
