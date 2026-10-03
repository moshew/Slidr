import type { Direction, Paragraph } from '@slidr/model';

const RTL_LETTER =
  /[\p{Script=Hebrew}\p{Script=Arabic}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Adlam}]/u;
const LETTER = /\p{L}/u;

/**
 * The direction a paragraph reads in: its own, and for `auto` that of its first letter, as the
 * renderer finds it. Text without a letter (a figure, an empty line) reads in the deck's.
 */
export function readingDirection(paragraph: Paragraph, deckDir: Direction): Direction {
  if (paragraph.dir !== 'auto') return paragraph.dir;
  for (const run of paragraph.runs) {
    for (const char of run.text) {
      if (LETTER.test(char)) return RTL_LETTER.test(char) ? 'rtl' : 'ltr';
    }
  }
  return deckDir;
}

/**
 * The alignment that puts a paragraph on the side a placeholder means. A layout says `start`
 * and `end` for the deck's direction, and a paragraph's alignment is counted in its own: an
 * English line in a Hebrew deck is `end` where the layout says `start`, so that it sits on the
 * right with the Hebrew lines around it.
 */
export function seatAlign(
  align: Paragraph['align'],
  paragraph: Paragraph,
  deckDir: Direction,
): Paragraph['align'] {
  if (readingDirection(paragraph, deckDir) === deckDir) return align;
  return align === 'start' ? 'end' : align === 'end' ? 'start' : align;
}
