import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { he, type Messages } from './he';

/**
 * UI language (UI-05). Hebrew is the default. Strings live in namespaces: the shell's are
 * `shell` (he.ts, en.ts); another area adds its own with `registerMessages`. Changing the
 * language re-renders every `useTranslation` and mirrors the layout, with no reload.
 */

export const languages = ['he', 'en'] as const;
export type Language = (typeof languages)[number];

const STORAGE_KEY = 'slidr.language';

function isLanguage(value: unknown): value is Language {
  return languages.includes(value as Language);
}

function storedLanguage(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(value)) return value;
  } catch {
    // Storage can be unavailable; the default will do.
  }
  return 'he';
}

/** The document follows the language: `lang` for fonts and screen readers, `dir` for layout. */
function applyToDocument(language: string): void {
  document.documentElement.lang = language;
  document.documentElement.dir = i18n.dir(language);
}

void i18n.use(initReactI18next).init({
  resources: { he: { shell: he }, en: { shell: en } },
  lng: storedLanguage(),
  // No silent fallback: a missing string is a bug, and it is reported below.
  fallbackLng: false,
  ns: ['shell'],
  defaultNS: 'shell',
  interpolation: { escapeValue: false },
  initAsync: false,
  saveMissing: true,
  missingKeyHandler: (lngs, ns, key) => {
    console.error(`Missing ${lngs.join('/')} string: ${ns}:${key}`);
  },
});
applyToDocument(i18n.language);
i18n.on('languageChanged', applyToDocument);

export function currentLanguage(): Language {
  return isLanguage(i18n.language) ? i18n.language : 'he';
}

/** Switches the UI language live and remembers it. */
export async function setLanguage(language: Language): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not remembered, but still switched.
  }
  await i18n.changeLanguage(language);
}

/**
 * Adds an area's strings under its own namespace; read them with `useTranslation(namespace)`.
 * Both languages are required, with the same keys.
 */
export function registerMessages<T extends object>(
  namespace: string,
  messages: { he: T; en: Messages<NoInfer<T>> },
): void {
  i18n.addResourceBundle('he', namespace, messages.he, true, true);
  i18n.addResourceBundle('en', namespace, messages.en, true, true);
}

export { i18n };
