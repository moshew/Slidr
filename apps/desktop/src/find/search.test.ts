import { describe, expect, it } from 'vitest';
import {
  createDeck,
  createElement,
  createSlide,
  richText,
  type Deck,
  type Frame,
  type Paragraph,
  type Run,
  type TableElement,
} from '@slidr/model';
import {
  compareMatches,
  findInText,
  findMatches,
  matchText,
  paragraphText,
  sameMatch,
  stepFrom,
  type FindOptions,
  type Match,
} from './search';

const PLAIN: FindOptions = { matchCase: false, wholeWord: false };
const CASE: FindOptions = { matchCase: true, wholeWord: false };
const WORD: FindOptions = { matchCase: false, wholeWord: true };

/** Where a query is found in a text, as `[start, end]` pairs. */
const ranges = (text: string, query: string, options = PLAIN) =>
  findInText(text, query, options).map(({ start, end }) => [start, end]);

/** What is found, as the text itself has it. */
const found = (text: string, query: string, options = PLAIN) =>
  findInText(text, query, options).map(({ start, end }) => text.slice(start, end));

describe('findInText', () => {
  it('finds every occurrence, in order and without overlap', () => {
    expect(ranges('one two one', 'one')).toEqual([
      [0, 3],
      [8, 11],
    ]);
    expect(ranges('banana', 'ana')).toEqual([[1, 4]]);
    expect(ranges('aaaaa', 'aa')).toEqual([
      [0, 2],
      [2, 4],
    ]);
    expect(ranges('שלום עולם, שלום', 'שלום')).toEqual([
      [0, 4],
      [11, 15],
    ]);
  });

  it('finds nothing for an empty query or in an empty text', () => {
    expect(ranges('text', '')).toEqual([]);
    expect(ranges('', 'text')).toEqual([]);
    expect(ranges('text', 'texts')).toEqual([]);
  });

  it('ignores case unless asked to match it', () => {
    const text = 'Slidr, SLIDR and slidr';
    expect(found(text, 'slidr')).toEqual(['Slidr', 'SLIDR', 'slidr']);
    expect(found(text, 'SLIDR')).toEqual(['Slidr', 'SLIDR', 'slidr']);
    expect(found(text, 'slidr', CASE)).toEqual(['slidr']);
    expect(found(text, 'Slidr', CASE)).toEqual(['Slidr']);
  });

  it('keeps the place in the text when folding the case changes its length', () => {
    // "İ" folds to two characters, so everything after it sits two places further in the folded
    // text than in the text itself.
    const text = 'İİ izmir';
    expect(text.toLowerCase().length).toBe(text.length + 2);
    expect(ranges(text, 'IZMIR')).toEqual([[3, 8]]);
    expect(found('İstanbul', 'İSTANBUL')).toEqual(['İstanbul']);
  });

  it('folds the case fully: sharp s, the two small sigmas', () => {
    expect(found('Die Straße', 'STRASSE')).toEqual(['Straße']);
    expect(found('die strasse', 'Straße')).toEqual(['strasse']);
    expect(found('GROẞ und groß', 'gross')).toEqual(['GROẞ', 'groß']);
    expect(found('ΟΔΟΣ, οδος', 'οδος')).toEqual(['ΟΔΟΣ', 'οδος']);
    // With the case matched nothing is folded.
    expect(found('Die Straße', 'strasse', CASE)).toEqual([]);
  });

  it('never finds a part of a character', () => {
    // "ß" folds to "ss": one "s" is half of it.
    expect(ranges('ß', 's')).toEqual([]);
    expect(found('Maße', 'ss')).toEqual(['ß']);
    expect(found('Maße', 'sse')).toEqual(['ße']);
  });

  it('finds whole words in Latin text', () => {
    const text = 'cat concat cat. (cat) cat_1 Cat';
    expect(found(text, 'cat')).toHaveLength(6);
    expect(ranges(text, 'cat', WORD)).toEqual([
      [0, 3],
      [11, 14],
      [17, 20],
      [28, 31],
    ]);
    expect(ranges(text, 'cat', { matchCase: true, wholeWord: true })).toHaveLength(3);
  });

  it('finds whole words in Hebrew, where a regex word boundary sees no letters', () => {
    const text = 'של שלום, של! (של) בשל שלי';
    expect(found(text, 'של')).toHaveLength(6);
    expect(ranges(text, 'של', WORD)).toEqual([
      [0, 2],
      [9, 11],
      [14, 16],
    ]);
    // A prefix letter makes another word of it.
    expect(ranges('המצגת והמצגת', 'המצגת', WORD)).toEqual([[0, 5]]);
  });

  it('takes the points of a Hebrew letter as part of its word', () => {
    const pointed = 'שָׁלוֹם עולם';
    expect(found(pointed, 'ש')).toEqual(['ש']);
    expect(found(pointed, 'ש', WORD)).toEqual([]);
    expect(found(pointed, 'שָׁלוֹם', WORD)).toEqual(['שָׁלוֹם']);
  });

  it('finds whole words in mixed text, next to punctuation and digits', () => {
    const text = 'Slidr בעברית, גרסת Slidr2 ו-Slidr.';
    expect(found(text, 'slidr')).toHaveLength(3);
    expect(ranges(text, 'slidr', WORD)).toEqual([
      [0, 5],
      [28, 33],
    ]);
    // A Hebrew letter right before a Latin word joins it; `\b` would call this a boundary.
    expect(found('הSlidr', 'slidr', WORD)).toEqual([]);
    expect(found('ה-Slidr', 'slidr', WORD)).toEqual(['Slidr']);
    expect(found('2024 12024 2024.', '2024', WORD)).toHaveLength(2);
    expect(found('שנת 2024 ושנת2024', '2024', WORD)).toHaveLength(1);
    expect(found('שורה ראשונה\nשנייה', 'ראשונה', WORD)).toEqual(['ראשונה']);
  });

  it('checks an end of a whole word only where the query ends in a letter or a digit', () => {
    expect(found('a C++ b, xC++', 'C++', WORD)).toEqual(['C++']);
    expect(found('(א) ו(א)', '(א)', WORD)).toHaveLength(2);
  });

  it('reads a character outside the basic plane as one character', () => {
    const letter = String.fromCodePoint(0x1d49c); // a mathematical script A: a letter
    const emoji = String.fromCodePoint(0x1f600);
    expect(found(`${letter}cat`, 'cat', WORD)).toEqual([]);
    expect(found(`cat${letter}`, 'cat', WORD)).toEqual([]);
    expect(found(`${emoji}cat${emoji}`, 'cat', WORD)).toEqual(['cat']);
    expect(ranges(`${emoji} cat`, 'CAT')).toEqual([[3, 6]]);
  });
});

/* ---------------------------------------------------------------- the deck */

const box: Frame = { x: 0, y: 0, w: 400, h: 200 };
const bold = { weight: 700 };

const para = (...runs: Run[]): Paragraph => ({ dir: 'auto', align: 'start', runs });

const text = (id: string, content: string, extra: { locked?: boolean; hidden?: boolean } = {}) =>
  createElement.text({ id, frame: box, content: richText(content), ...extra });

const cell = (content: string, extra: Partial<TableElement['cells'][number][number]> = {}) => ({
  content: richText(content),
  ...extra,
});

/**
 * A deck with "world" in every kind of place: across the runs of a text box, in a shape, deep in
 * groups, in table cells, in speaker notes; on a hidden slide, in locked and in hidden elements;
 * and in an `html` element, where it is not looked for.
 */
function worldDeck(): Deck {
  const first = createSlide({
    id: 's_one',
    elements: [
      createElement.text({
        id: 'e_title',
        frame: box,
        content: {
          paragraphs: [
            para({ text: 'no match here' }),
            para({ text: 'Hello ' }, { text: 'wor', marks: bold }, { text: 'ld, world!' }),
          ],
        },
      }),
      createElement.shape({ id: 'e_shape', frame: box, content: richText('A WORLD of shapes') }),
      createElement.shape({ id: 'e_bare', frame: box }),
      createElement.group({
        id: 'e_group',
        frame: box,
        children: [
          createElement.group({
            id: 'e_inner',
            frame: box,
            children: [text('e_deep', 'deep world')],
          }),
        ],
      }),
      createElement.table({
        id: 'e_table',
        frame: box,
        rows: [100, 100],
        cols: [200, 200],
        dir: 'ltr',
        cells: [
          [cell('world', { colSpan: 2 }), cell('world under a span', { merged: true })],
          [cell(''), cell('the world')],
        ],
      }),
      createElement.html({ id: 'e_html', frame: box, markup: '<p>world</p>' }),
    ],
    notes: richText('say hello\nto the world'),
  });
  const second = createSlide({
    id: 's_two',
    hidden: true,
    elements: [
      text('e_locked', 'locked world', { locked: true }),
      text('e_unseen', 'unseen world', { hidden: true }),
      createElement.group({
        id: 'e_shut',
        frame: box,
        locked: true,
        hidden: true,
        children: [text('e_child', 'child world')],
      }),
    ],
  });
  return createDeck({ lang: 'en', slides: [first, second] });
}

/** A match as the tests read it: where it is, and the text it covers. */
function summary(deck: Deck, match: Match): string {
  const { slideId, elementId, cell: at, paragraph, start, end } = match;
  const p = matchText(deck, match)?.paragraphs[paragraph];
  const where = elementId ? `${elementId}${at ? `[${at.row},${at.col}]` : ''}` : 'notes';
  return `${slideId} ${where} p${paragraph} "${p ? paragraphText(p).slice(start, end) : '?'}"`;
}

describe('findMatches', () => {
  const deck = worldDeck();
  const matches = findMatches(deck, 'world', PLAIN);

  it('searches text boxes, shapes, groups at any depth, table cells and notes, on every slide', () => {
    expect(matches.map((m) => summary(deck, m))).toEqual([
      's_one e_title p1 "world"',
      's_one e_title p1 "world"',
      's_one e_shape p0 "WORLD"',
      's_one e_deep p0 "world"',
      's_one e_table[0,0] p0 "world"',
      's_one e_table[1,1] p0 "world"',
      's_one notes p1 "world"',
      's_two e_locked p0 "world"',
      's_two e_unseen p0 "world"',
      's_two e_child p0 "world"',
    ]);
  });

  it('finds a match that spans runs, as a place in the text of the paragraph', () => {
    expect(matches[0]).toMatchObject({ elementId: 'e_title', paragraph: 1, start: 6, end: 11 });
    expect(matches[1]).toMatchObject({ elementId: 'e_title', paragraph: 1, start: 13, end: 18 });
  });

  it('leaves out html elements and the cells under a span', () => {
    expect(matches.some((m) => m.elementId === 'e_html')).toBe(false);
    expect(matches.filter((m) => m.elementId === 'e_table').map((m) => m.cell)).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ]);
  });

  it('says which matches are in a locked or a hidden element, its own or a group around it', () => {
    const state = (id: string) => {
      const match = matches.find((m) => m.elementId === id)!;
      return { locked: match.locked, hidden: match.hidden };
    };
    expect(state('e_title')).toEqual({ locked: false, hidden: false });
    expect(state('e_deep')).toEqual({ locked: false, hidden: false });
    expect(state('e_locked')).toEqual({ locked: true, hidden: false });
    expect(state('e_unseen')).toEqual({ locked: false, hidden: true });
    expect(state('e_child')).toEqual({ locked: true, hidden: true });
    // Speaker notes are neither.
    expect(matches[6]).toMatchObject({ locked: false, hidden: false });
    expect(matches[6]?.elementId).toBeUndefined();
  });

  it('applies the options to every text', () => {
    expect(findMatches(deck, 'world', CASE)).toHaveLength(9);
    expect(findMatches(deck, 'WORLD', CASE).map((m) => m.elementId)).toEqual(['e_shape']);
    expect(findMatches(deck, 'wor', WORD)).toEqual([]);
    expect(findMatches(deck, '', PLAIN)).toEqual([]);
  });

  it('gives the matches in an order that can be compared', () => {
    for (let i = 1; i < matches.length; i++) {
      expect(compareMatches(matches[i - 1]!, matches[i]!)).toBeLessThan(0);
    }
    // The slide, and the text among the slide's texts: the empty cell of the table is the fifth.
    expect(matches.map((m) => `${m.slide}.${m.text}`)).toEqual([
      '0.0',
      '0.0',
      '0.1',
      '0.2',
      '0.3',
      '0.5',
      '0.6',
      '1.0',
      '1.1',
      '1.2',
    ]);
  });
});

describe('stepFrom', () => {
  const deck = worldDeck();
  const matches = findMatches(deck, 'world', PLAIN);
  const at = (match: Match | undefined) => (match ? matches.indexOf(match) : -1);

  it('starts from the slide on the Stage when the bar stands nowhere', () => {
    expect(at(stepFrom(matches, null, 1, 0))).toBe(0);
    expect(at(stepFrom(matches, null, 1, 1))).toBe(7);
    // Backwards: the last match up to that slide.
    expect(at(stepFrom(matches, null, -1, 0))).toBe(6);
    expect(at(stepFrom(matches, null, -1, 1))).toBe(9);
    // No slide: the ends of the deck.
    expect(at(stepFrom(matches, null, 1, -1))).toBe(0);
    expect(at(stepFrom(matches, null, -1, -1))).toBe(9);
  });

  it('goes to the next and the previous match, around the ends of the deck', () => {
    expect(at(stepFrom(matches, matches[0]!, 1, 0))).toBe(1);
    expect(at(stepFrom(matches, matches[6]!, 1, 0))).toBe(7);
    expect(at(stepFrom(matches, matches[9]!, 1, 1))).toBe(0);
    expect(at(stepFrom(matches, matches[0]!, -1, 0))).toBe(9);
    expect(at(stepFrom(matches, matches[7]!, -1, 1))).toBe(6);
  });

  it('knows a match again after the deck changed elsewhere', () => {
    const again = findMatches(deck, 'world', PLAIN);
    expect(again[3]).not.toBe(matches[3]);
    expect(sameMatch(again[3]!, matches[3]!)).toBe(true);
    expect(sameMatch(again[3]!, matches[4]!)).toBe(false);
    expect(sameMatch(again[4]!, again[5]!)).toBe(false);
    expect(at(stepFrom(matches, again[3]!, 1, 0))).toBe(4);
  });

  it('goes on from a place that is no longer a match', () => {
    // Right after the first "world" of the title: where a replacement left the search.
    const place: Match = { ...matches[0]!, start: 11, end: 11 };
    expect(at(stepFrom(matches, place, 1, 0))).toBe(1);
    expect(at(stepFrom(matches, place, -1, 0))).toBe(0);
    // After the last match of the deck, and before the first.
    const end: Match = { ...matches[9]!, start: 99, end: 99 };
    expect(at(stepFrom(matches, end, 1, 1))).toBe(0);
    expect(at(stepFrom(matches, end, -1, 1))).toBe(9);
    const start: Match = { ...matches[0]!, paragraph: 0, start: 0, end: 0 };
    expect(at(stepFrom(matches, start, 1, 0))).toBe(0);
    expect(at(stepFrom(matches, start, -1, 0))).toBe(9);
  });

  it('has nowhere to go without matches', () => {
    expect(stepFrom([], null, 1, 0)).toBeUndefined();
    expect(stepFrom([], matches[0]!, -1, 0)).toBeUndefined();
  });
});
