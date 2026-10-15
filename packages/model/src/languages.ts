import { isRtlLanguage } from './factories';
import type { Direction } from './schema';

/**
 * The languages ready-made content comes in: the sample deck of a template, a design of Elements.
 * Every piece is written in the two base languages, Hebrew and English; a piece may also be
 * written in any of the others. A deck gets a piece in its own language when the piece has it,
 * and otherwise the English one, as it was written: left to right, not mirrored for a
 * right-to-left deck. They are the languages of the interface (`apps/desktop/src/i18n`), which
 * `apps/desktop/src/templates/contentLanguages.test.ts` holds them to.
 */
export const CONTENT_LANGUAGES = [
  'he',
  'en',
  'ar',
  'de',
  'es',
  'fr',
  'it',
  'pt-BR',
  'ru',
  'tr',
  'vi',
  'id',
  'hi',
  'ja',
  'ko',
  'zh-CN',
] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

/** The languages every piece is written in. */
export const BASE_LANGUAGES = ['he', 'en'] as const;
export type BaseLanguage = (typeof BASE_LANGUAGES)[number];

/** Content written in both base languages, and in any other its author wrote it in. */
export type Localized<T> = Record<BaseLanguage, T> & Partial<Record<ContentLanguage, T>>;

/** Each language by its own name and by its English one. */
export const LANGUAGE_NAMES: Record<ContentLanguage, { native: string; english: string }> = {
  he: { native: 'עברית', english: 'Hebrew' },
  en: { native: 'English', english: 'English' },
  ar: { native: 'العربية', english: 'Arabic' },
  de: { native: 'Deutsch', english: 'German' },
  es: { native: 'Español', english: 'Spanish' },
  fr: { native: 'Français', english: 'French' },
  it: { native: 'Italiano', english: 'Italian' },
  'pt-BR': { native: 'Português (Brasil)', english: 'Brazilian Portuguese' },
  ru: { native: 'Русский', english: 'Russian' },
  tr: { native: 'Türkçe', english: 'Turkish' },
  vi: { native: 'Tiếng Việt', english: 'Vietnamese' },
  id: { native: 'Bahasa Indonesia', english: 'Indonesian' },
  hi: { native: 'हिन्दी', english: 'Hindi' },
  ja: { native: '日本語', english: 'Japanese' },
  ko: { native: '한국어', english: 'Korean' },
  'zh-CN': { native: '中文（简体）', english: 'Simplified Chinese' },
};

/**
 * The letters each language is written in, by the tag a family of the media library's fonts
 * carries for them (`fonts/catalog.json`). No family of the library has Japanese, Korean or
 * Chinese letters: those are set in the fonts of the system.
 */
export const LANGUAGE_SCRIPT: Record<ContentLanguage, string> = {
  he: 'he',
  en: 'latin',
  ar: 'arabic',
  de: 'latin',
  es: 'latin',
  fr: 'latin',
  it: 'latin',
  'pt-BR': 'latin',
  ru: 'cyrillic',
  tr: 'latin',
  vi: 'vietnamese',
  id: 'latin',
  hi: 'devanagari',
  ja: 'japanese',
  ko: 'korean',
  'zh-CN': 'chinese',
};

/** Old codes some systems still give, by the code of today. */
const RENAMED: Record<string, string> = { iw: 'he', in: 'id' };

/**
 * The content language of a language tag, as a deck stores it: "fr-CA" is French, "pt-PT"
 * Portuguese and "zh-Hans-SG" Simplified Chinese. Undefined for a language no content is written
 * in, Traditional Chinese among them.
 */
export function contentLanguageOf(tag: string): ContentLanguage | undefined {
  const [first = '', ...rest] = tag.toLowerCase().split(/[-_]/);
  const base = RENAMED[first] ?? first;
  if (base === 'zh') {
    return rest.some((part) => ['hant', 'tw', 'hk', 'mo'].includes(part)) ? undefined : 'zh-CN';
  }
  return CONTENT_LANGUAGES.find((lang) => lang.split('-')[0]!.toLowerCase() === base);
}

/** The direction a language is written in. */
export const languageDir = (lang: string): Direction => (isRtlLanguage(lang) ? 'rtl' : 'ltr');

/** The language of a deck in `lang` that a piece was written in, if the piece has it. */
export function writtenIn(
  variants: Partial<Record<string, unknown>>,
  lang: string,
): ContentLanguage | undefined {
  const own = contentLanguageOf(lang);
  return own && variants[own] !== undefined ? own : undefined;
}

/**
 * The language a deck in `lang` gets a piece in: its own when the piece was written in it, else
 * English, which is then drawn left to right as it was written.
 */
export const pieceLanguage = (variants: Partial<Record<string, unknown>>, lang: string) =>
  writtenIn(variants, lang) ?? 'en';

/** Of a piece written in several languages, the one a deck in `lang` gets (`pieceLanguage`). */
export function inLanguage<T>(variants: Localized<T>, lang: string): T {
  return variants[pieceLanguage(variants, lang)] ?? variants.en;
}

/** The languages a piece was written in, in the order of `CONTENT_LANGUAGES`. */
export function languagesOf(variants: Partial<Record<string, unknown>>): ContentLanguage[] {
  return CONTENT_LANGUAGES.filter((lang) => variants[lang] !== undefined);
}
