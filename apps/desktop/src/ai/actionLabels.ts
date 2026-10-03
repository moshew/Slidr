import type { TFunction } from 'i18next';
import { isActionId } from '@slidr/prompts';
import type { EntryAction } from '../agent/transcript';
import { he } from './messages';

/*
 * An action in the user's words: what the chat shows in place of the message that was sent
 * (SPEC 4.3), and what the turn is called in the undo history.
 */

/** The languages an action can translate into, by the English name the agent is given. */
export const LANGUAGES = Object.keys(he.actions.languages) as (keyof typeof he.actions.languages)[];
export type LanguageName = (typeof LANGUAGES)[number];

export const TONES = Object.keys(he.actions.tones) as (keyof typeof he.actions.tones)[];
export type ToneName = (typeof TONES)[number];

const known = <T extends string>(names: readonly T[], value: unknown): value is T =>
  names.includes(value as T);

/** The name of an action, with what the user chose in its form. */
export function actionLabel(t: TFunction<'ai'>, action: EntryAction): string {
  // An action of a later version of the app, read from a saved chat.
  if (!isActionId(action.id)) return t('action.other');
  const { language, tone, count, slideNumber } = action.params ?? {};
  return t(`action.${action.id}`, {
    language: known(LANGUAGES, language) ? t(`actions.languages.${language}`) : (language ?? ''),
    tone: known(TONES, tone) ? t(`actions.tones.${tone}`) : (tone ?? ''),
    count: count ?? '',
    n: slideNumber ?? '',
  });
}
