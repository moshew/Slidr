import { richText, type RichText } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { HIGHLIGHT, markdownToRichText, paragraphDir, parseInline } from './markdown';

const he = (markdown: string, extra = {}) =>
  markdownToRichText(markdown, { deckDir: 'rtl', ...extra });

describe('parseInline', () => {
  it('reads bold, italic, strike, highlight and links', () => {
    expect(parseInline('a **b** *c* _d_ ~~e~~ ==f== [g](https://x.io)')).toEqual([
      { text: 'a ' },
      { text: 'b', marks: { weight: 700 } },
      { text: ' ' },
      { text: 'c', marks: { italic: true } },
      { text: ' ' },
      { text: 'd', marks: { italic: true } },
      { text: ' ' },
      { text: 'e', marks: { strike: true } },
      { text: ' ' },
      { text: 'f', marks: { highlight: HIGHLIGHT } },
      { text: ' ' },
      { text: 'g', marks: { link: 'https://x.io' } },
    ]);
  });

  it('nests marks', () => {
    expect(parseInline('***both*** and *it **bold** it*')).toEqual([
      { text: 'both', marks: { weight: 700, italic: true } },
      { text: ' and ' },
      { text: 'it ', marks: { italic: true } },
      { text: 'bold', marks: { italic: true, weight: 700 } },
      { text: ' it', marks: { italic: true } },
    ]);
    expect(parseInline('[**bold link**](u)')).toEqual([
      { text: 'bold link', marks: { link: 'u', weight: 700 } },
    ]);
  });

  it('keeps what is not markup as text', () => {
    expect(parseInline('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4' }]);
    expect(parseInline('snake_case_name and **open')).toEqual([
      { text: 'snake_case_name and **open' },
    ]);
    expect(parseInline('\\*not italic\\* and [no link]')).toEqual([
      { text: '*not italic* and [no link]' },
    ]);
  });

  it('starts from base marks and keeps Hebrew whole', () => {
    expect(parseInline('שלום **עולם**', { color: { token: 'bg' } })).toEqual([
      { text: 'שלום ', marks: { color: { token: 'bg' } } },
      { text: 'עולם', marks: { color: { token: 'bg' }, weight: 700 } },
    ]);
  });
});

describe('markdownToRichText', () => {
  it('makes one paragraph per line and drops blank lines', () => {
    const text = he('שורה ראשונה\n\nשורה שנייה\r\nשלישית');
    expect(text.paragraphs.map((p) => p.runs[0]?.text)).toEqual([
      'שורה ראשונה',
      'שורה שנייה',
      'שלישית',
    ]);
    expect(text.paragraphs.every((p) => p.dir === 'rtl' && p.align === 'start')).toBe(true);
  });

  it('continues a paragraph after a trailing backslash', () => {
    const text = he('שורה אחת\\\nעוד שורה\nפסקה חדשה');
    expect(text.paragraphs).toHaveLength(2);
    expect(text.paragraphs[0]!.runs[0]!.text).toBe('שורה אחת\nעוד שורה');
  });

  it('reads bullet and numbered lists with nesting', () => {
    const text = he(
      ['- one', '  - one.a', '    1. deep', '  - one.b', '- two', 'plain', '1) again'].join('\n'),
    );
    expect(text.paragraphs.map((p) => p.list && [p.list.kind, p.list.level])).toEqual([
      ['bullet', 0],
      ['bullet', 1],
      ['number', 2],
      ['bullet', 1],
      ['bullet', 0],
      undefined,
      ['number', 0],
    ]);
  });

  it('gives a paragraph without letters of the deck direction the other one', () => {
    expect(paragraphDir('Hello world', 'rtl')).toBe('ltr');
    expect(paragraphDir('API חדש עלה ל-production', 'rtl')).toBe('rtl');
    expect(paragraphDir('87%', 'rtl')).toBe('rtl');
    expect(paragraphDir('שלום', 'ltr')).toBe('rtl');
    expect(paragraphDir('Sprint 14 ended', 'ltr')).toBe('ltr');
    expect(he('Hello\nשלום').paragraphs.map((p) => p.dir)).toEqual(['ltr', 'rtl']);
    expect(he('Hello', { dir: 'auto' }).paragraphs[0]!.dir).toBe('auto');
  });

  it('keeps the formatting of the text it replaces', () => {
    const previous: RichText = {
      paragraphs: [
        {
          dir: 'rtl',
          align: 'center',
          styleRef: 'title',
          lineHeight: 1.1,
          runs: [
            { text: 'ישן ', marks: { color: { token: 'bg' }, weight: 800 } },
            { text: 'מאוד', marks: { color: { token: 'bg' }, italic: true } },
          ],
        },
        {
          dir: 'rtl',
          align: 'start',
          styleRef: 'body',
          list: { kind: 'bullet', level: 0, glyph: '•', color: { token: 'accent' } },
          runs: [{ text: 'פריט' }],
        },
      ],
    };
    const text = he('כותרת **חדשה**\n- נקודה', { previous });
    expect(text.paragraphs[0]).toEqual({
      dir: 'rtl',
      align: 'center',
      lineHeight: 1.1,
      styleRef: 'title',
      runs: [
        { text: 'כותרת ', marks: { color: { token: 'bg' } } },
        { text: 'חדשה', marks: { color: { token: 'bg' }, weight: 700 } },
      ],
    });
    expect(text.paragraphs[1]).toMatchObject({
      styleRef: 'body',
      list: { kind: 'bullet', level: 0, glyph: '•', color: { token: 'accent' } },
    });
  });

  it('lets the caller set style and alignment', () => {
    const text = he('a\nb', {
      previous: richText('x', { styleRef: 'body' }),
      styleRef: 'caption',
      align: 'end',
    });
    expect(text.paragraphs.every((p) => p.styleRef === 'caption' && p.align === 'end')).toBe(true);
  });

  it('gives an empty text no paragraphs', () => {
    expect(he('')).toEqual({ paragraphs: [] });
  });
});
