import {
  findElement,
  findSlide,
  type CellRef,
  type Deck,
  type Element,
  type Paragraph,
  type RichText,
  type Slide,
} from '@slidr/model';

/*
 * Finding text across the deck (TXT-12). What is searched is the model: the text of text boxes
 * and of shapes, the cells of tables, at any depth inside groups, and the speaker notes, on every
 * slide, hidden ones too. A match is a substring of one paragraph, whatever runs it crosses.
 *
 * Not searched: `html` elements (their text is markup), the titles and labels of charts, the names
 * of elements, and the decorations a layout draws on its slides.
 */

export interface FindOptions {
  /** Off by default: "Slidr" finds "SLIDR". */
  matchCase: boolean;
  /** The match is not part of a longer word. */
  wholeWord: boolean;
}

/** A stretch of a paragraph's text, in UTF-16 units of its runs joined together. */
export interface TextRange {
  start: number;
  end: number;
}

export interface Match extends TextRange {
  slideId: string;
  /** The element whose text it is in; without one the match is in the slide's speaker notes. */
  elementId?: string;
  /** For a table: the cell. */
  cell?: CellRef;
  /** The paragraph of that text. */
  paragraph: number;
  /** The element, or a group around it, is locked: the match is found and never changed. */
  locked: boolean;
  /** The element, or a group around it, is hidden: nothing of the match is drawn. */
  hidden: boolean;
  /** Where the match is in the order of the search: the index of its slide ... */
  slide: number;
  /** ... and of its text among the texts of that slide. */
  text: number;
}

export const paragraphText = (paragraph: Paragraph): string =>
  paragraph.runs.map((run) => run.text).join('');

/* ---------------------------------------------------------------- one paragraph */

const foldedChars = new Map<string, string>();

/**
 * One character with its case folded, as near to Unicode's full case folding as JavaScript gets:
 * lower, upper and lower again, so that "ß" and "ẞ" both become "ss", and the two small sigmas of
 * Greek become one. Each character is folded on its own, because lower-casing a whole string
 * depends on what stands around a letter.
 */
function foldChar(char: string): string {
  let folded = foldedChars.get(char);
  if (folded === undefined) {
    folded = char.toLowerCase().toUpperCase().toLowerCase();
    foldedChars.set(char, folded);
  }
  return folded;
}

const foldText = (text: string): string => Array.from(text, foldChar).join('');

interface Folded {
  text: string;
  /** For a unit of `text` that begins a character of the original: where that character starts. */
  starts: number[];
  /** For a unit of `text` that ends a character of the original: where that character ends. */
  ends: number[];
}

/**
 * A text with its case folded, and the way back. Folding can change the length ("İ" becomes two
 * characters, "ß" becomes "ss"), so a place in the folded text is not a place in the original.
 */
function fold(text: string): Folded {
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let at = 0;
  for (const char of text) {
    const part = foldChar(char);
    for (let i = 0; i < part.length; i++) {
      starts.push(i === 0 ? at : -1);
      ends.push(i === part.length - 1 ? at + char.length : -1);
    }
    folded += part;
    at += char.length;
  }
  return { text: folded, starts, ends };
}

/**
 * What a word is made of: letters, digits, the marks that sit on letters (Hebrew points), and the
 * underscore. By Unicode class, since `\b` and `\w` know Latin letters only.
 */
const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;

function charAt(text: string, index: number): string | undefined {
  const code = text.codePointAt(index);
  return code === undefined ? undefined : String.fromCodePoint(code);
}

/** The character that ends at `index`. */
function charBefore(text: string, index: number): string | undefined {
  if (index <= 0) return undefined;
  const low = text.charCodeAt(index - 1);
  const pair = low >= 0xdc00 && low <= 0xdfff && index >= 2;
  return charAt(text, pair ? index - 2 : index - 1);
}

const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && WORD_CHAR.test(char);

/**
 * True when the range is not a piece of a longer word. An end of the range is checked only where
 * the range itself ends in a word character: "C++" is a whole word in "C++ and C#".
 */
function isWholeWord(text: string, { start, end }: TextRange): boolean {
  const joinsBefore = isWordChar(charAt(text, start)) && isWordChar(charBefore(text, start));
  const joinsAfter = isWordChar(charBefore(text, end)) && isWordChar(charAt(text, end));
  return !joinsBefore && !joinsAfter;
}

/**
 * Where `query` occurs in a text, in order and without overlap. Without `matchCase` both are
 * compared with their case folded, and a match covers whole characters of the text: "s" does not
 * find half of a "ß".
 */
export function findInText(text: string, query: string, options: FindOptions): TextRange[] {
  if (!query || !text) return [];
  const hay: Folded | undefined = options.matchCase ? undefined : fold(text);
  const haystack = hay ? hay.text : text;
  const needle = hay ? foldText(query) : query;
  const out: TextRange[] = [];
  let from = 0;
  for (;;) {
    const found = haystack.indexOf(needle, from);
    if (found < 0) return out;
    const last = found + needle.length - 1;
    const range: TextRange = hay
      ? { start: hay.starts[found] ?? -1, end: hay.ends[last] ?? -1 }
      : { start: found, end: found + needle.length };
    const whole = range.start >= 0 && range.end >= 0;
    if (whole && (!options.wholeWord || isWholeWord(text, range))) {
      out.push(range);
      from = found + needle.length;
    } else {
      from = found + 1;
    }
  }
}

/* ---------------------------------------------------------------- the deck */

/** A rich text of a slide, and whose it is. */
export interface SlideText {
  elementId?: string;
  cell?: CellRef;
  content: RichText;
  locked: boolean;
  hidden: boolean;
}

function* elementTexts(
  elements: readonly Element[],
  locked: boolean,
  hidden: boolean,
): Generator<SlideText> {
  for (const element of elements) {
    // A group hands its lock and its visibility down to what is in it, as the Stage reads them.
    const state = {
      locked: locked || Boolean(element.locked),
      hidden: hidden || Boolean(element.hidden),
    };
    if (element.type === 'text') {
      yield { elementId: element.id, content: element.content, ...state };
    } else if (element.type === 'shape') {
      if (element.content) yield { elementId: element.id, content: element.content, ...state };
    } else if (element.type === 'table') {
      for (const [row, cells] of element.cells.entries()) {
        for (const [col, cell] of cells.entries()) {
          // A cell under another cell's span is not drawn, and nothing can be typed in it.
          if (cell.merged) continue;
          yield { elementId: element.id, cell: { row, col }, content: cell.content, ...state };
        }
      }
    } else if (element.type === 'group') {
      yield* elementTexts(element.children, state.locked, state.hidden);
    }
  }
}

/**
 * The texts of a slide in the order they are searched: the elements from the bottom one up, a
 * group's children where the group stands, the cells of a table row by row, and the speaker notes
 * last.
 */
export function* slideTexts(slide: Pick<Slide, 'elements' | 'notes'>): Generator<SlideText> {
  yield* elementTexts(slide.elements, false, false);
  if (slide.notes) yield { content: slide.notes, locked: false, hidden: false };
}

/** Every match of `query` in the deck, in the order of the slides and of `slideTexts`. */
export function findMatches(deck: Deck, query: string, options: FindOptions): Match[] {
  const out: Match[] = [];
  if (!query) return out;
  for (const [slide, { id: slideId, ...rest }] of deck.slides.entries()) {
    let text = 0;
    for (const { content, ...holder } of slideTexts(rest)) {
      for (const [paragraph, p] of content.paragraphs.entries()) {
        for (const range of findInText(paragraphText(p), query, options)) {
          out.push({ slideId, ...holder, paragraph, ...range, slide, text });
        }
      }
      text++;
    }
  }
  return out;
}

/** The rich text a match is in, as the deck has it now. */
export function matchText(deck: Deck, match: Match): RichText | undefined {
  const slide = findSlide(deck, match.slideId);
  if (!slide) return undefined;
  if (!match.elementId) return slide.notes;
  const element = findElement(slide, match.elementId);
  if (element?.type === 'text' || element?.type === 'shape') return element.content;
  if (element?.type === 'table' && match.cell) {
    return element.cells[match.cell.row]?.[match.cell.col]?.content;
  }
  return undefined;
}

/**
 * The match a step lands on. From the match the bar stands on it is the next or the previous
 * one, around the ends of the deck. When that place is no longer a match (the text or the query
 * changed under it), the step goes on from where it was; and when the bar stands nowhere yet,
 * from the slide on the Stage, given by its index.
 */
export function stepFrom(
  matches: readonly Match[],
  current: Match | null,
  direction: 1 | -1,
  slide: number,
): Match | undefined {
  const count = matches.length;
  if (count === 0) return undefined;
  if (!current) {
    if (direction > 0) return matches.find((m) => m.slide >= slide) ?? matches[0];
    return matches.findLast((m) => m.slide <= slide) ?? matches[count - 1];
  }
  const index = matches.findIndex((m) => sameMatch(m, current));
  if (index >= 0) return matches[(index + direction + count) % count];
  const after = matches.findIndex((m) => compareMatches(m, current) >= 0);
  if (direction > 0) return matches[Math.max(after, 0)];
  return matches[((after < 0 ? count : after) - 1 + count) % count];
}

/** The same place in the same text. The order fields are left out: slides can move. */
export function sameMatch(a: Match, b: Match): boolean {
  return (
    a.slideId === b.slideId &&
    a.elementId === b.elementId &&
    a.cell?.row === b.cell?.row &&
    a.cell?.col === b.cell?.col &&
    a.paragraph === b.paragraph &&
    a.start === b.start &&
    a.end === b.end
  );
}

/** Negative when `a` comes before `b` in the order of the search. */
export function compareMatches(a: Match, b: Match): number {
  return a.slide - b.slide || a.text - b.text || a.paragraph - b.paragraph || a.start - b.start;
}
