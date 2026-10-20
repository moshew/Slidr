import { describe, expect, it } from 'vitest';
import type { Paragraph, RichText } from '@slidr/model';
import { notesFromText, notesText } from './notes';

const p = (text: string, extra: Partial<Paragraph> = {}): Paragraph => ({
  dir: 'auto',
  align: 'start',
  runs: text ? [{ text }] : [],
  ...extra,
});

/** Notes as the agent writes them: a line with emphasis, and a list. */
const written: RichText = {
  paragraphs: [
    {
      dir: 'rtl',
      align: 'start',
      runs: [{ text: 'לפתוח ב' }, { text: 'מספר', marks: { weight: 700 } }],
    },
    p('שלוש נקודות:', { dir: 'rtl' }),
    p('מחיר', { dir: 'rtl', list: { kind: 'bullet', level: 0 } }),
    p('זמן', { dir: 'rtl', list: { kind: 'bullet', level: 0 } }),
  ],
};

describe('speaker notes as text', () => {
  it('shows a line for each paragraph', () => {
    expect(notesText(written)).toBe('לפתוח במספר\nשלוש נקודות:\nמחיר\nזמן');
    expect(notesText(undefined)).toBe('');
  });

  it('reads a break inside a paragraph as a space', () => {
    expect(notesText({ paragraphs: [p('one\ntwo')] })).toBe('one two');
  });

  it('gives no notes for an empty field', () => {
    expect(notesFromText('', written)).toBeNull();
    expect(notesFromText('  \n ', undefined)).toBeNull();
  });

  it('writes typed lines as plain paragraphs', () => {
    expect(notesFromText('first\n\nthird', undefined)).toEqual({
      paragraphs: [p('first'), p(''), p('third')],
    });
  });

  it('keeps the runs and marks of the lines that were not touched', () => {
    const next = notesFromText('לפתוח במספר\nשלוש נקודות חשובות:\nמחיר\nזמן', written)!;
    expect(next.paragraphs[0]).toBe(written.paragraphs[0]);
    expect(next.paragraphs[2]).toBe(written.paragraphs[2]);
    expect(next.paragraphs[3]).toBe(written.paragraphs[3]);
    // The changed line is plain text in the format it had.
    expect(next.paragraphs[1]).toEqual(p('שלוש נקודות חשובות:', { dir: 'rtl' }));
  });

  it('gives a line added to a list the format of the list', () => {
    const next = notesFromText('לפתוח במספר\nשלוש נקודות:\nמחיר\nאיכות\nזמן', written)!;
    expect(next.paragraphs).toHaveLength(5);
    expect(next.paragraphs[3]).toEqual(
      p('איכות', { dir: 'rtl', list: { kind: 'bullet', level: 0 } }),
    );
    expect(next.paragraphs[4]).toBe(written.paragraphs[3]);
  });

  it('drops the lines that were deleted and keeps the rest', () => {
    const next = notesFromText('לפתוח במספר\nזמן', written)!;
    expect(next.paragraphs).toEqual([written.paragraphs[0], written.paragraphs[3]]);
  });

  it('gives back the text it was made from', () => {
    for (const text of ['a', 'a\nb', 'a\n\nb\n', '\nשלום']) {
      expect(notesText(notesFromText(text, written) ?? undefined)).toBe(text);
    }
  });
});
