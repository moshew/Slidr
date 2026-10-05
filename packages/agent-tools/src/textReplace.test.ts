import { describe, expect, it } from 'vitest';
import { appearances, occurrenceAt, replaceInText } from './textReplace';

describe('a stretch of text', () => {
  it('is counted left to right, each search after the last match', () => {
    expect(appearances('a b a b a', 'a')).toEqual([0, 4, 8]);
    expect(appearances('aaa', 'aa')).toEqual([0]);
    expect(appearances('abc', '')).toEqual([]);
  });

  it('is the appearance that starts at the selection, or the last one before it', () => {
    const text = 'two one two\nthree two';
    expect(occurrenceAt(text, 'two', 0)).toBe(1);
    expect(occurrenceAt(text, 'two', 8)).toBe(2);
    expect(occurrenceAt(text, 'two', 18)).toBe(3);
    // A selection inside an overlapping appearance counts as the one it overlaps.
    expect(occurrenceAt('aaa', 'aa', 1)).toBe(1);
  });

  it('is changed in its paragraph, with the line breaks of the model', () => {
    const content = {
      paragraphs: [
        { dir: 'ltr' as const, align: 'start' as const, runs: [{ text: 'first' }] },
        { dir: 'ltr' as const, align: 'start' as const, runs: [{ text: 'a\nb a' }] },
      ],
    };
    const outcome = replaceInText(content, 'a', 2, { replace: 'c\nd' });
    expect(outcome).toEqual({
      ok: true,
      content: {
        paragraphs: [
          content.paragraphs[0],
          { ...content.paragraphs[1], runs: [{ text: 'a\nb c\nd' }] },
        ],
      },
    });
    expect(replaceInText(content, 'first\na', 1, { replace: 'x' })).toEqual({
      ok: false,
      reason: 'paragraphs',
    });
    expect(replaceInText(content, 'z', 1, { replace: 'x' })).toEqual({
      ok: false,
      reason: 'missing',
      found: 0,
    });
  });
});
