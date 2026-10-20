import { SECRET_NAMES, SettingsError, type SecretName, type SettingsClient } from './settings';

/** Longest key the app accepts; the Rust core has the same limit. */
const MAX_KEY = 512;

export interface MemorySettings extends SettingsClient {
  /** For the stand-ins of the services that need a key (see `memoryStock`): is one stored. */
  hasSecret(name: SecretName): boolean;
}

/**
 * The settings without the Rust core: in a plain browser (the Vite page, Playwright), sections
 * and keys kept in memory and gone with the page. It applies the rules of the core, so the
 * settings screen behaves the same here: a key is trimmed and checked, never returned, and a
 * section that holds a stored key is refused.
 */
export function memorySettings(initial: Record<string, unknown> = {}): MemorySettings {
  const sections = new Map<string, unknown>(Object.entries(initial));
  const keys = new Map<SecretName, string>();

  return {
    read: () => Promise.resolve(Object.fromEntries(sections)),

    write: (section, value) => {
      if (!/^[a-z0-9-]{1,40}$/.test(section)) {
        return Promise.reject(
          new SettingsError('invalid_input', `invalid settings section "${section}"`),
        );
      }
      const text = JSON.stringify(value ?? null);
      if ([...keys.values()].some((key) => text.includes(key))) {
        return Promise.reject(
          new SettingsError(
            'invalid_input',
            'a settings value holds an API key; keys are kept in the credential store only',
          ),
        );
      }
      if (value === null || value === undefined) sections.delete(section);
      else sections.set(section, JSON.parse(text) as unknown);
      return Promise.resolve();
    },

    secrets: () => Promise.resolve(SECRET_NAMES.map((name) => ({ name, present: keys.has(name) }))),

    setSecret: (name, value) => {
      const key = value.trim();
      const reject = (message: string) =>
        Promise.reject(new SettingsError('invalid_input', message));
      if (!key) return reject('the key is empty');
      if (key.length > MAX_KEY) return reject(`the key is longer than ${MAX_KEY} characters`);
      if (/\s/.test(key)) return reject('the key has white space inside; paste the key alone');
      keys.set(name, key);
      return Promise.resolve();
    },

    deleteSecret: (name) => {
      keys.delete(name);
      return Promise.resolve();
    },

    hasSecret: (name) => keys.has(name),
  };
}
