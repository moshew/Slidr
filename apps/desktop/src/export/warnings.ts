import type { TFunction } from 'i18next';
import { ltr } from './exportDeck';

/**
 * A warning of the export in the language of the UI. `@slidr/html-export` has no strings of its
 * own: it reports what happened in English, for logs. The ones a user can act on are said here in
 * both languages; any other is shown as the package wrote it.
 */
const KNOWN: [RegExp, key: string][] = [
  [/^Asset (.+) could not be read$/, 'warning.assetUnreadable'],
  [/^Font (.+) could not be read\b/, 'warning.fontUnreadable'],
  [/^Font (.+) (?:could not be subset|went in whole)\b/, 'warning.fontWhole'],
  [/^This browser cannot write shadow roots\b/, 'warning.noShadowRoots'],
];

export function warningText(t: TFunction<'export'>, warning: string): string {
  for (const [pattern, key] of KNOWN) {
    const match = pattern.exec(warning);
    // A file or a font name reads left to right inside the sentence.
    if (match) return t(key, { name: match[1] ? ltr(match[1]) : '' });
  }
  return warning;
}
