import { firstStrong, paragraphDirection } from '@slidr/renderer';

/*
 * The direction of text, where Slidr has to know it itself (WG4-T07, TXT-14). The browser lays
 * the text out and moves the caret; which way a `dir: auto` paragraph goes is the renderer's rule
 * (`paragraphDirection`), and the editor, the toolbar and the list markers follow the same one:
 * the first strong character of the paragraph, and the deck's direction when it has none (a
 * figure, an empty line), so the caret of a new Hebrew text box starts on the right and stays
 * there while a number is typed.
 */

const HEBREW_LETTER = /[\u05D0-\u05EA]/;
const LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;

export { firstStrong };

/** The direction a paragraph is laid out in; `deckDir` is for text without letters. */
export const resolveDirection = paragraphDirection;

/** The script a font is wanted for: Hebrew when the text has Hebrew letters, Latin when it has only Latin. */
export function scriptOf(text: string): 'he' | 'latin' | undefined {
  if (HEBREW_LETTER.test(text)) return 'he';
  if (LATIN_LETTER.test(text)) return 'latin';
  return undefined;
}
