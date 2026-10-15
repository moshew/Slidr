import type { TFunction } from 'i18next';
import { isActionId } from '@slidr/prompts';
import type { EntryAction } from '../agent/transcript';
import type { Language } from '../i18n';
import { he } from './messages';

/*
 * An action in the user's words: what the chat shows in place of the message that was sent
 * (SPEC 4.3), and what the turn is called in the undo history.
 */

/** The languages an action can translate into, by the English name the agent is given. */
export const LANGUAGES = Object.keys(he.actions.languages) as (keyof typeof he.actions.languages)[];
export type LanguageName = (typeof LANGUAGES)[number];

/** Each UI language as a language to translate into. */
export const TRANSLATION_LANGUAGE: Record<Language, LanguageName> = {
  he: 'Hebrew',
  en: 'English',
  ar: 'Arabic',
  'zh-CN': 'Chinese',
  fr: 'French',
  de: 'German',
  hi: 'Hindi',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  'pt-BR': 'Portuguese',
  ru: 'Russian',
  es: 'Spanish',
  tr: 'Turkish',
  vi: 'Vietnamese',
};

/**
 * A choice in a list starts with a capital letter. The names of the languages and the tones are
 * written as they read inside a sentence ("Traduire en français"), lower case in many languages.
 */
export const listed = (word: string, lng: string): string =>
  word.charAt(0).toLocaleUpperCase(lng) + word.slice(1);

export const TONES = Object.keys(he.actions.tones) as (keyof typeof he.actions.tones)[];
export type ToneName = (typeof TONES)[number];

const known = <T extends string>(names: readonly T[], value: unknown): value is T =>
  names.includes(value as T);

/** The name of an action, with what the user chose in its form. */
export function actionLabel(t: TFunction<'ai'>, action: EntryAction): string {
  // An action of a later version of the app, read from a saved chat.
  if (!isActionId(action.id)) return t('action.other');
  const { language, tone, count, slideNumber, edited } = action.params ?? {};
  // An outline approved after the user changed it in its card says so (AID-03).
  const name = action.id === 'outline.approve' && edited ? 'outline.approveEdited' : action.id;
  return t(`action.${name}`, {
    language: known(LANGUAGES, language) ? t(`actions.languages.${language}`) : (language ?? ''),
    tone: known(TONES, tone) ? t(`actions.tones.${tone}`) : (tone ?? ''),
    count: count ?? '',
    n: slideNumber ?? '',
  });
}
