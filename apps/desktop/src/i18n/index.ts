import i18n, { type Resource } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';
import { he, type Messages } from './he';

/**
 * UI language (UI-05). Strings live in namespaces: the shell's are `shell` (he.ts, en.ts);
 * another area adds its own with `registerMessages`. Hebrew and English are written by hand, the
 * other languages are translated from them into `locales/<code>.json`, one file per language
 * with every namespace in it. Changing the language re-renders every `useTranslation` and
 * mirrors the layout, with no reload. Until the user picks one, the UI is in the language of the
 * system, or in English when the app does not have it.
 */

/** The UI languages, in the order the picker lists them: each by its own name, Latin first. */
export const languages = [
  'id',
  'de',
  'en',
  'es',
  'fr',
  'it',
  'pt-BR',
  'vi',
  'tr',
  'ru',
  'he',
  'ar',
  'hi',
  'ko',
  'zh-CN',
  'ja',
] as const;
export type Language = (typeof languages)[number];

/** Each language by its own name, for the picker, and by its English one, for the agent. */
const names: Record<Language, { native: string; english: string }> = {
  id: { native: 'Bahasa Indonesia', english: 'Indonesian' },
  de: { native: 'Deutsch', english: 'German' },
  en: { native: 'English', english: 'English' },
  es: { native: 'Español', english: 'Spanish' },
  fr: { native: 'Français', english: 'French' },
  it: { native: 'Italiano', english: 'Italian' },
  'pt-BR': { native: 'Português (Brasil)', english: 'Brazilian Portuguese' },
  vi: { native: 'Tiếng Việt', english: 'Vietnamese' },
  tr: { native: 'Türkçe', english: 'Turkish' },
  ru: { native: 'Русский', english: 'Russian' },
  he: { native: 'עברית', english: 'Hebrew' },
  ar: { native: 'العربية', english: 'Arabic' },
  hi: { native: 'हिन्दी', english: 'Hindi' },
  ko: { native: '한국어', english: 'Korean' },
  'zh-CN': { native: '中文（简体）', english: 'Simplified Chinese' },
  ja: { native: '日本語', english: 'Japanese' },
};

/** A language as it calls itself: "Français", "עברית". */
export const nativeName = (language: Language): string => names[language].native;

/** A language in English, the way the agent is told which language to answer in. */
export const englishName = (language: Language): string => names[language].english;

const STORAGE_KEY = 'slidr.language';

function isLanguage(value: unknown): value is Language {
  return languages.includes(value as Language);
}

/** Old codes some systems still give, by the code of today. */
const RENAMED: Record<string, string> = { iw: 'he', in: 'id' };

/**
 * The UI language for a language tag, as a system, a browser or a deck gives it: "fr-CA" is
 * French, "pt-PT" Portuguese and "zh-Hans-SG" Simplified Chinese. Undefined for a language the
 * app does not have, Traditional Chinese among them.
 */
export function languageOf(tag: string): Language | undefined {
  const [first = '', ...rest] = tag.toLowerCase().split(/[-_]/);
  const base = RENAMED[first] ?? first;
  if (base === 'zh') {
    const traditional = rest.some((part) => ['hant', 'tw', 'hk', 'mo'].includes(part));
    return traditional ? undefined : 'zh-CN';
  }
  return languages.find((language) => language.split('-')[0]!.toLowerCase() === base);
}

/**
 * The language of words the app writes into a deck, such as the labels of a new chart: the
 * deck's when the app has it, else English.
 */
export const deckLanguage = (lang: string): Language => languageOf(lang) ?? 'en';

/** The first of the system's languages the app has, or English. */
export function systemLanguage(): Language {
  const tags =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language];
  for (const tag of tags) {
    const language = tag ? languageOf(tag) : undefined;
    if (language) return language;
  }
  return 'en';
}

function storedLanguage(): Language | undefined {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (isLanguage(value)) return value;
  } catch {
    // Storage can be unavailable; the system's language will do.
  }
  return undefined;
}

/** The document follows the language: `lang` for fonts and screen readers, `dir` for layout. */
function applyToDocument(language: string): void {
  document.documentElement.lang = language;
  document.documentElement.dir = i18n.dir(language);
}

/** The translated languages, every namespace of each in one file: `locales/fr.json`. */
const translated = import.meta.glob<Resource[string]>('./locales/*.json', {
  eager: true,
  import: 'default',
});

const resources: Resource = { he: { shell: he }, en: { shell: en } };
for (const [path, namespaces] of Object.entries(translated)) {
  const language = /\/([^/]+)\.json$/.exec(path)?.[1];
  if (language) resources[language] = namespaces;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLanguage() ?? systemLanguage(),
  // Hebrew and English have every string (the compiler sees to it), and a key missing in both
  // is a bug that is reported below. A translated language that lacks a string newer than its
  // translation shows the English one (the tests list what is missing).
  fallbackLng: (code) => (code === 'he' || code === 'en' ? [] : ['en']),
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
  return isLanguage(i18n.language) ? i18n.language : 'en';
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
 * Both languages are required, with the same keys; the translations come from `locales/`.
 */
export function registerMessages<T extends object>(
  namespace: string,
  messages: { he: T; en: Messages<NoInfer<T>> },
): void {
  i18n.addResourceBundle('he', namespace, messages.he, true, true);
  i18n.addResourceBundle('en', namespace, messages.en, true, true);
}

export { i18n };
