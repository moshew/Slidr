import type { Direction, Paragraph } from '@slidr/model';

/*
 * The direction of text, where Slidr has to know it itself (WG4-T07, TXT-14). The browser lays
 * the text out and moves the caret; this is only for what the browser cannot tell us: which way a
 * `dir: auto` paragraph resolves, for the toolbar, for flipping a paragraph, and for list markers.
 */

/** Scripts written right to left: Hebrew, Arabic, Syriac, Thaana, N'Ko and their presentation forms. */
const RTL_LETTER =
  /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;
const LETTER = /\p{L}/u;
const HEBREW_LETTER = /[\u05D0-\u05EA]/;
const LATIN_LETTER = /[A-Za-z\u00C0-\u024F]/;

const RLM = '\u200F';
const ALM = '\u061C';
const LRM = '\u200E';

/**
 * The direction of the first strong character, as `dir="auto"` resolves it: letters are strong,
 * digits, punctuation, spaces and emoji are not. Undefined when the text has no strong character.
 */
export function firstStrong(text: string): Direction | undefined {
  for (const char of text) {
    if (char === RLM || char === ALM) return 'rtl';
    if (char === LRM) return 'ltr';
    if (LETTER.test(char)) return RTL_LETTER.test(char) ? 'rtl' : 'ltr';
  }
  return undefined;
}

/**
 * The direction a paragraph is laid out in. `auto` follows the first strong character; text
 * without one is laid out as the browser lays out `dir="auto"`, which is from the left. A line with
 * no text at all has nothing to go by and takes `emptyDir`, the deck's direction, so that the
 * caret of a new Hebrew text box starts on the right.
 */
export function resolveDirection(
  dir: Paragraph['dir'],
  text: string,
  emptyDir: Direction,
): Direction {
  if (dir !== 'auto') return dir;
  return firstStrong(text) ?? (text === '' ? emptyDir : 'ltr');
}

/** The script a font is wanted for: Hebrew when the text has Hebrew letters, Latin when it has only Latin. */
export function scriptOf(text: string): 'he' | 'latin' | undefined {
  if (HEBREW_LETTER.test(text)) return 'he';
  if (LATIN_LETTER.test(text)) return 'latin';
  return undefined;
}
