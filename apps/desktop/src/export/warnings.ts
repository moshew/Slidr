import type { ExportWarning, ExportWarningCode } from '@slidr/html-export';
import type { TFunction } from 'i18next';
import { ltr } from './exportDeck';

/**
 * A warning of the export in the language of the UI. `@slidr/html-export` has no strings of its
 * own: it says what happened by a code, and in English for a log. Every code has a string here,
 * in both languages: a code without one does not compile.
 */
const KEYS: Record<ExportWarningCode, string> = {
  'asset-unreadable': 'warning.assetUnreadable',
  'font-unreadable': 'warning.fontUnreadable',
  'font-whole': 'warning.fontWhole',
  'fonts-whole': 'warning.fontsWhole',
  'shadow-roots': 'warning.noShadowRoots',
  'markup-unstable': 'warning.markupUnstable',
};

export function warningText(t: TFunction<'export'>, warning: ExportWarning): string {
  // A file or a font name reads left to right inside the sentence.
  return t(KEYS[warning.code], { name: warning.subject ? ltr(warning.subject) : '' });
}
