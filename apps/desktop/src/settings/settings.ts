/**
 * The app's settings and keys as the webview sees them (WG3-T08, SEC-04, ADR-051).
 *
 * Settings are sections: one JSON value per area of the app, kept in `<app_data>/settings.json`
 * by the Rust core (`src-tauri/src/settings/`). An area owns the shape of its section; this
 * file knows none of them.
 *
 * Keys are another matter. A key goes to the core once, when the user enters it, and is kept in
 * the credential store of the operating system (`src-tauri/src/secrets/`). Nothing here can
 * read one back: the webview only learns whether a key is stored. So a key is never in this
 * page's memory after it was handed over, never in `localStorage`, and never in a deck.
 */

/** The keys the app keeps, in the order the settings screen shows them. */
export const SECRET_NAMES = ['openai-api', 'unsplash', 'pexels'] as const;

export type SecretName = (typeof SECRET_NAMES)[number];

/** Whether a key is stored. All the webview ever learns about one. */
export interface SecretStatus {
  name: SecretName;
  present: boolean;
}

export type SettingsErrorKind = 'invalid_input' | 'io' | 'internal';

/** A rejected call. `message` is English, for logs; the UI words the failure from `kind`. */
export class SettingsError extends Error {
  readonly kind: SettingsErrorKind;

  constructor(kind: SettingsErrorKind, message: string) {
    super(message);
    this.name = 'SettingsError';
    this.kind = kind;
  }
}

/** The settings file and the credential store. Every method rejects with `SettingsError`. */
export interface SettingsClient {
  /** Every section, as stored. */
  read(): Promise<Record<string, unknown>>;
  /** Replaces one section; `null` removes it. A value that holds a stored key is refused. */
  write(section: string, value: unknown): Promise<void>;
  /** Which keys are stored. */
  secrets(): Promise<SecretStatus[]>;
  /** Stores a key the user entered. `invalid_input` when the text cannot be a key. */
  setSecret(name: SecretName, value: string): Promise<void>;
  deleteSecret(name: SecretName): Promise<void>;
}
