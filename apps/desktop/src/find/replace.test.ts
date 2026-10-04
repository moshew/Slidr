import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  findElementInDeck,
  plainText,
  richText,
  type Deck,
  type Frame,
  type Marks,
  type Paragraph,
  type Run,
} from '@slidr/model';
import { replaceCommands, replaceInParagraph } from './replace';
import { findInText, findMatches, paragraphText, type FindOptions } from './search';

const PLAIN: FindOptions = { matchCase: false, wholeWord: false };
const bold: Marks = { weight: 700 };
const italic: Marks = { italic: true };

const para = (...runs: Run[]): Paragraph => ({ dir: 'auto', align: 'start', runs });

/** Replaces every match of `query` in a paragraph. */
function replaced(paragraph: Paragraph, query: string, replacement: string): Paragraph {
  const ranges = findInText(paragraphText(paragraph), query, PLAIN);
  return replaceInParagraph(paragraph, ranges, replacement);
}

describe('replaceInParagraph', () => {
  it('gives the replacement the marks of the first character it replaces', () => {
    const p = para(
      { text: 'Hello ' },
      { text: 'wor', marks: bold },
      { text: 'ld!', marks: italic },
    );
    expect(replaced(p, 'world', 'there').runs).toEqual([
      { text: 'Hello ' },
      { text: 'there', marks: bold },
      { text: '!', marks: italic },
    ]);
  });

  it('writes a match that begins inside a run into that run', () => {
    const p = para({ text: 'ab' }, { text: 'cd', marks: bold });
    expect(replaced(p, 'bc', 'X').runs).toEqual([{ text: 'aX' }, { text: 'd', marks: bold }]);
    // The same in Hebrew, where the first character is the one on the right.
    const he = para({ text: 'שלום ' }, { text: 'עו', marks: bold }, { text: 'לם' });
    expect(replaced(he, 'עולם', 'לכולם').runs).toEqual([
      { text: 'שלום ' },
      { text: 'לכולם', marks: bold },
    ]);
  });

  it('leaves the runs no match touches as they are, the very same objects', () => {
    const p = para({ text: 'x ' }, { text: 'a-a-a', marks: bold }, { text: ' y', marks: italic });
    const out = replaced(p, 'a', 'bb');
    expect(out.runs).toEqual([
      { text: 'x ' },
      { text: 'bb-bb-bb', marks: bold },
      { text: ' y', marks: italic },
    ]);
    expect(out.runs[0]).toBe(p.runs[0]);
    expect(out.runs[2]).toBe(p.runs[2]);
    expect(p.runs[1]?.text).toBe('a-a-a');
  });

  it('drops a run that a match takes whole, and the runs a match passes through', () => {
    const p = para(
      { text: 'a ' },
      { text: 'b', marks: bold },
      { text: 'i', marks: italic },
      { text: 'g', marks: bold },
      { text: ' cat' },
    );
    expect(replaced(p, 'big', 'small').runs).toEqual([
      { text: 'a ' },
      { text: 'small', marks: bold },
      { text: ' cat' },
    ]);
    expect(replaced(p, 'big ', '').runs).toEqual([{ text: 'a ' }, { text: 'cat' }]);
  });

  it('keeps the formatting of a line the replacement leaves empty', () => {
    expect(replaced(para({ text: 'big', marks: bold }), 'big', '').runs).toEqual([
      { text: '', marks: bold },
    ]);
    expect(replaced(para({ text: 'big' }), 'big', '').runs).toEqual([]);
  });

  it('keeps everything else of the paragraph', () => {
    const p: Paragraph = {
      dir: 'rtl',
      align: 'center',
      lineHeight: 1.2,
      list: { kind: 'bullet', level: 1 },
      styleRef: 'heading',
      runs: [{ text: 'כותרת ישנה' }],
    };
    expect(replaced(p, 'ישנה', 'חדשה')).toEqual({ ...p, runs: [{ text: 'כותרת חדשה' }] });
  });

  it('replaces by a longer, a shorter and an equal text, several times in a paragraph', () => {
    const p = para({ text: 'one two one two one' });
    expect(paragraphText(replaced(p, 'one', '1'))).toBe('1 two 1 two 1');
    expect(paragraphText(replaced(p, 'one', 'eleven'))).toBe('eleven two eleven two eleven');
    expect(paragraphText(replaced(p, 'two', 'six'))).toBe('one six one six one');
    // A replacement that holds what was looked for is written once.
    expect(paragraphText(replaced(p, 'one', 'one one'))).toBe('one one two one one two one one');
  });
});

/* ---------------------------------------------------------------- the deck */

const box: Frame = { x: 0, y: 0, w: 400, h: 200 };

const text = (id: string, content: string, extra: { locked?: boolean } = {}) =>
  createElement.text({ id, frame: box, content: richText(content), ...extra });

function deckWithOld(): Deck {
  const first = createSlide({
    id: 's_one',
    elements: [
      createElement.text({
        id: 'e_title',
        frame: box,
        content: {
          paragraphs: [
            para({ text: 'the ' }, { text: 'ol', marks: bold }, { text: 'd title' }),
            para({ text: 'untouched' }),
            para({ text: 'old and old' }),
          ],
        },
      }),
      createElement.shape({ id: 'e_shape', frame: box, content: richText('an old shape') }),
      createElement.group({
        id: 'e_group',
        frame: box,
        children: [text('e_child', 'old in a group')],
      }),
      createElement.table({
        id: 'e_table',
        frame: box,
        rows: [100, 100],
        cols: [200, 200],
        dir: 'rtl',
        cells: [
          [{ content: richText('old') }, { content: richText('new') }],
          [{ content: richText('') }, { content: richText('Old, old') }],
        ],
      }),
      text('e_locked', 'old and locked', { locked: true }),
      createElement.group({
        id: 'e_shut',
        frame: box,
        locked: true,
        children: [text('e_inside', 'old in a locked group')],
      }),
    ],
    notes: richText('an old note'),
  });
  const second = createSlide({
    id: 's_two',
    hidden: true,
    elements: [text('e_far', 'old on a hidden slide')],
  });
  return createDeck({ lang: 'en', slides: [first, second, createSlide({ id: 's_three' })] });
}

/** The plain text of an element, of a table cell, or of a slide's notes. */
function read(deck: Deck, id: string, at?: { row: number; col: number }): string {
  const slide = deck.slides.find((s) => s.id === id);
  if (slide) return slide.notes ? plainText(slide.notes) : '';
  const element = findElementInDeck(deck, id)?.element;
  if (element?.type === 'table') return plainText(element.cells[at!.row]![at!.col]!.content);
  if (element?.type === 'text' || element?.type === 'shape') return plainText(element.content!);
  throw new Error(`No text in ${id}`);
}

describe('replaceCommands', () => {
  const deck = deckWithOld();
  const matches = findMatches(deck, 'old', PLAIN);

  it('writes one command for every text that changes, and none for a locked element', () => {
    const { commands, replaced: count, skipped } = replaceCommands(deck, matches, 'new');
    expect(matches).toHaveLength(12);
    expect(count).toBe(10);
    expect(skipped).toBe(2);
    expect(commands.map((c) => [c.type, 'elementId' in c ? c.elementId : c.type])).toEqual([
      ['text.set', 'e_title'],
      ['text.set', 'e_shape'],
      ['text.set', 'e_child'],
      ['text.set', 'e_table'],
      ['text.set', 'e_table'],
      ['slide.update', 'slide.update'],
      ['text.set', 'e_far'],
    ]);
    // A table is written cell by cell.
    const cells = commands.flatMap((c) => (c.type === 'text.set' && c.cell ? [c.cell] : []));
    expect(cells).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 1 },
    ]);
  });

  it('replaces in text boxes, shapes, groups, table cells and notes, on every slide', () => {
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(replaceCommands(deck, matches, 'new').commands);
    const after = bus.deck;
    expect(read(after, 'e_title')).toBe('the new title\nuntouched\nnew and new');
    expect(read(after, 'e_shape')).toBe('an new shape');
    expect(read(after, 'e_child')).toBe('new in a group');
    expect(read(after, 'e_table', { row: 0, col: 0 })).toBe('new');
    expect(read(after, 'e_table', { row: 0, col: 1 })).toBe('new');
    expect(read(after, 'e_table', { row: 1, col: 1 })).toBe('new, new');
    expect(read(after, 's_one')).toBe('an new note');
    expect(read(after, 'e_far')).toBe('new on a hidden slide');
    // Locked: its own lock, and the lock of a group around it.
    expect(read(after, 'e_locked')).toBe('old and locked');
    expect(read(after, 'e_inside')).toBe('old in a locked group');
    expect(findMatches(after, 'old', PLAIN).map((m) => m.elementId)).toEqual([
      'e_locked',
      'e_inside',
    ]);
  });

  it('keeps the marks around a match, and the paragraphs without one', () => {
    const [command] = replaceCommands(deck, matches, 'new').commands;
    const before = findElementInDeck(deck, 'e_title')!.element;
    if (command?.type !== 'text.set' || before.type !== 'text') throw new Error('not a text box');
    expect(command.content.paragraphs[0]?.runs).toEqual([
      { text: 'the ' },
      { text: 'new', marks: bold },
      { text: ' title' },
    ]);
    expect(command.content.paragraphs[1]).toBe(before.content.paragraphs[1]);
  });

  it('is one undo step for the whole deck when sent as one batch', () => {
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(replaceCommands(deck, matches, 'new').commands);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.deck).not.toEqual(deck);
    expect(bus.undo()).toBe(true);
    expect(bus.deck).toEqual(deck);
    expect(bus.canUndo).toBe(false);
  });

  it('replaces one match and leaves the others of its text', () => {
    const bus = new CommandBus(deck, { validate: true });
    const second = matches.filter((m) => m.elementId === 'e_title')[2]!;
    const { commands, replaced: count } = replaceCommands(deck, [second], 'new');
    expect(count).toBe(1);
    bus.batch(commands);
    expect(read(bus.deck, 'e_title')).toBe('the old title\nuntouched\nold and new');
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck).toEqual(deck);
  });

  it('has nothing to do for a locked match, or for none', () => {
    const locked = matches.filter((m) => m.locked);
    expect(replaceCommands(deck, locked, 'new')).toEqual({ commands: [], replaced: 0, skipped: 2 });
    expect(replaceCommands(deck, [], 'new')).toEqual({ commands: [], replaced: 0, skipped: 0 });
  });
});
