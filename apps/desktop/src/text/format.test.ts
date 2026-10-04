import { createBaseTheme, type Paragraph, type RichText } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  boldChange,
  clearMarks,
  flippedDirection,
  levelChange,
  listChange,
  listStyleChange,
  mapMarks,
  mapParagraphs,
  matchStyle,
  MIXED,
  paintMarks,
  paintParagraph,
  patchMarks,
  patchParagraph,
  pickFormat,
  readFormat,
  sampleRichText,
  styleChange,
  type FormatContext,
} from './format';

const theme = createBaseTheme();
const ctx: FormatContext = { theme, dir: 'rtl' };

const p = (runs: Paragraph['runs'], extra: Partial<Paragraph> = {}): Paragraph => ({
  dir: 'auto',
  align: 'start',
  runs,
  ...extra,
});
const text = (...paragraphs: Paragraph[]): RichText => ({ paragraphs });
const read = (rich: RichText, context = ctx) => readFormat(sampleRichText(rich), context);

describe('changing marks', () => {
  it('sets marks on every run and removes the ones given as null', () => {
    const rich = text(
      p([{ text: 'שלום ' }, { text: 'world', marks: { italic: true, size: 40 } }]),
      p([{ text: 'second', marks: { color: { token: 'primary' } } }]),
    );
    const out = mapMarks(rich, patchMarks({ size: 60, italic: null }));
    expect(out).toEqual(
      text(
        // The two runs now have the same marks: they are one run.
        p([{ text: 'שלום world', marks: { size: 60 } }]),
        p([{ text: 'second', marks: { color: { token: 'primary' }, size: 60 } }]),
      ),
    );
    // The input is not touched.
    expect(rich.paragraphs[0]?.runs).toHaveLength(2);
  });

  it('removing the last mark leaves a run without marks', () => {
    const rich = text(p([{ text: 'a', marks: { underline: true } }]));
    expect(mapMarks(rich, patchMarks({ underline: null }))).toEqual(text(p([{ text: 'a' }])));
  });

  it('an empty line keeps the marks on an empty run, and loses the run with the last mark', () => {
    const formatted = mapMarks(text(p([])), patchMarks({ size: 60 }));
    expect(formatted).toEqual(text(p([{ text: '', marks: { size: 60 } }])));
    expect(mapMarks(formatted, patchMarks({ size: null }))).toEqual(text(p([])));
  });

  it('keeps the logical order of mixed text', () => {
    const rich = text(p([{ text: 'מחיר: 100 ₪ (כולל VAT), ' }, { text: 'בתוקף עד 12.10.' }]));
    const out = mapMarks(rich, patchMarks({ weight: 700 }));
    expect(out.paragraphs[0]?.runs).toEqual([
      { text: 'מחיר: 100 ₪ (כולל VAT), בתוקף עד 12.10.', marks: { weight: 700 } },
    ]);
  });
});

describe('bold against a numeric weight', () => {
  const body = text(p([{ text: 'a' }]));
  const title = text(p([{ text: 'a' }], { styleRef: 'title' }));

  it('on a regular style: bold is weight 700, and not bold is no mark at all', () => {
    const bold = mapMarks(body, boldChange(true, ctx));
    expect(bold.paragraphs[0]?.runs).toEqual([{ text: 'a', marks: { weight: 700 } }]);
    expect(mapMarks(bold, boldChange(false, ctx))).toEqual(body);
  });

  it('on a style that is bold already: not bold is 400, and bold is the style itself', () => {
    // The title style of the basic theme is 700.
    const regular = mapMarks(title, boldChange(false, ctx));
    expect(regular.paragraphs[0]?.runs).toEqual([{ text: 'a', marks: { weight: 400 } }]);
    expect(mapMarks(regular, boldChange(true, ctx))).toEqual(title);
  });

  it('replaces any other weight and keeps the other marks', () => {
    const light = text(p([{ text: 'a', marks: { weight: 300, italic: true } }]));
    expect(mapMarks(light, boldChange(true, ctx)).paragraphs[0]?.runs).toEqual([
      { text: 'a', marks: { weight: 700, italic: true } },
    ]);
    expect(mapMarks(light, boldChange(false, ctx)).paragraphs[0]?.runs).toEqual([
      { text: 'a', marks: { italic: true } },
    ]);
  });

  it('reads as bold from weight 600 up, whether the weight is a mark or the style', () => {
    expect(read(body).bold).toBe(false);
    expect(read(title).bold).toBe(true);
    expect(read(text(p([{ text: 'a', marks: { weight: 600 } }]))).bold).toBe(true);
    expect(read(text(p([{ text: 'a', marks: { weight: 500 } }]))).bold).toBe(false);
    // One part that is not bold: the text is not bold.
    expect(read(text(p([{ text: 'a', marks: { weight: 700 } }, { text: 'b' }]))).bold).toBe(false);
  });
});

describe('changing paragraphs', () => {
  const rich = text(p([{ text: 'a' }], { spaceBefore: 8 }), p([{ text: 'b' }], { dir: 'rtl' }));

  it('sets fields on every paragraph and removes the ones given as null', () => {
    const out = mapParagraphs(rich, patchParagraph({ align: 'center', spaceBefore: null }));
    expect(out).toEqual(
      text(
        p([{ text: 'a' }], { align: 'center' }),
        p([{ text: 'b' }], { dir: 'rtl', align: 'center' }),
      ),
    );
  });

  it('turns lists on and off; a change of kind keeps the level and the colour, not the bullet', () => {
    const bullets = mapParagraphs(rich, listChange('bullet', true));
    expect(bullets.paragraphs.map((x) => x.list)).toEqual([
      { kind: 'bullet', level: 0 },
      { kind: 'bullet', level: 0 },
    ]);
    const styled = mapParagraphs(
      mapParagraphs(bullets, levelChange(2)),
      listStyleChange({ glyph: '★', color: { token: 'accent' } }),
    );
    expect(styled.paragraphs[0]?.list).toEqual({
      kind: 'bullet',
      level: 2,
      glyph: '★',
      color: { token: 'accent' },
    });
    const numbers = mapParagraphs(styled, listChange('number', true));
    expect(numbers.paragraphs[0]?.list).toEqual({
      kind: 'number',
      level: 2,
      color: { token: 'accent' },
    });
    expect(mapParagraphs(numbers, listChange('number', false))).toEqual(rich);
  });

  it('keeps list levels between 0 and 8, and leaves plain paragraphs alone', () => {
    const plain = text(p([{ text: 'a' }]), p([{ text: 'b' }]));
    const mixed = text(
      p([{ text: 'a' }], { list: { kind: 'bullet', level: 7 } }),
      p([{ text: 'b' }]),
    );
    const deeper = mapParagraphs(mixed, levelChange(5));
    expect(deeper.paragraphs.map((x) => x.list?.level)).toEqual([8, undefined]);
    expect(mapParagraphs(deeper, levelChange(-20)).paragraphs[0]?.list?.level).toBe(0);
    expect(mapParagraphs(plain, listStyleChange({ glyph: '–' }))).toEqual(plain);
    expect(mapParagraphs(plain, levelChange(1))).toEqual(plain);
  });

  it('the default bullet and the default marker colour are the absence of the field', () => {
    const custom = text(
      p([{ text: 'a' }], {
        list: { kind: 'bullet', level: 0, glyph: '★', color: { value: '#f00' } },
      }),
    );
    expect(
      mapParagraphs(custom, listStyleChange({ glyph: null, color: null })).paragraphs[0]?.list,
    ).toEqual({ kind: 'bullet', level: 0 });
  });
});

describe('reading the format', () => {
  it('shows the values of the text style when no mark is set', () => {
    const format = read(text(p([{ text: 'שלום' }])));
    expect(format).toMatchObject({
      font: 'Heebo',
      fontFromStyle: true,
      size: 30,
      weight: 400,
      bold: false,
      italic: false,
      color: { token: 'text' },
      highlight: null,
      script: null,
      case: null,
      letterSpacing: 0,
      align: 'start',
      dir: 'auto',
      lineHeight: 1.45,
      spaceBefore: 0,
      spaceAfter: 0,
      indent: 0,
      list: null,
      level: 0,
    });
    // The caption style has its own size and colour.
    expect(read(text(p([{ text: 'x' }], { styleRef: 'caption' })))).toMatchObject({
      size: 22,
      color: { token: 'muted' },
    });
  });

  it('shows the font of the script the text is in: a theme has a face per script', () => {
    // Heebo for Hebrew and Inter for Latin, in the basic theme.
    expect(read(text(p([{ text: 'שלום world' }]))).font).toBe('Heebo');
    expect(read(text(p([{ text: 'Hello' }]))).font).toBe('Inter');
    // Text without letters: the deck's direction decides.
    expect(read(text(p([{ text: '2026' }]))).font).toBe('Heebo');
    expect(read(text(p([{ text: '2026' }])), { theme, dir: 'ltr' }).font).toBe('Inter');
  });

  it('a mark wins over the style', () => {
    const format = read(
      text(
        p(
          [
            {
              text: 'a',
              marks: {
                font: 'Rubik',
                size: 44,
                weight: 800,
                italic: true,
                underline: true,
                strike: true,
                color: { value: '#ff0000' },
                highlight: { token: 'accent', alpha: 0.5 },
                script: 'sup',
                case: 'upper',
                letterSpacing: 2,
              },
            },
          ],
          { lineHeight: 1.1, spaceBefore: 4, spaceAfter: 8, indent: 12, align: 'end', dir: 'ltr' },
        ),
      ),
    );
    expect(format).toMatchObject({
      font: 'Rubik',
      fontFromStyle: false,
      size: 44,
      weight: 800,
      bold: true,
      italic: true,
      underline: true,
      strike: true,
      color: { value: '#ff0000' },
      highlight: { token: 'accent', alpha: 0.5 },
      script: 'sup',
      case: 'upper',
      letterSpacing: 2,
      lineHeight: 1.1,
      spaceBefore: 4,
      spaceAfter: 8,
      indent: 12,
      align: 'end',
      dir: 'ltr',
    });
  });

  it('is mixed when the effective values differ, and only then', () => {
    const format = read(
      text(
        p([
          { text: 'a', marks: { size: 30, italic: true } },
          { text: 'b', marks: { font: 'Rubik' } },
        ]),
        p([{ text: 'c' }], {
          styleRef: 'title',
          align: 'center',
          list: { kind: 'number', level: 1 },
        }),
      ),
    );
    // 30 as a mark and 30 from the body style are the same size; the title is 72.
    expect(format.size).toBe(MIXED);
    expect(format.font).toBe(MIXED);
    expect(format.weight).toBe(MIXED);
    expect(format.italic).toBe(false);
    expect(format.align).toBe(MIXED);
    expect(format.list).toBe(MIXED);
    expect(format.lineHeight).toBe(MIXED);
    // What is the same everywhere is not mixed.
    expect(format.color).toEqual({ token: 'text' });
    expect(format.dir).toBe('auto');
    // The level is of the list items alone.
    expect(format.level).toBe(1);

    const same = read(text(p([{ text: 'a', marks: { size: 30 } }, { text: 'b' }])));
    expect(same.size).toBe(30);
  });

  it('reads an empty line from its empty run, and an empty text as one plain paragraph', () => {
    expect(read(text(p([{ text: '', marks: { size: 60 } }]))).size).toBe(60);
    expect(read({ paragraphs: [] })).toMatchObject({ size: 30, align: 'start', dir: 'auto' });
  });

  it('resolves the direction of the first paragraph, for the side that start is on', () => {
    expect(read(text(p([{ text: 'שלום world' }]))).direction).toBe('rtl');
    expect(read(text(p([{ text: 'Hello עולם' }]))).direction).toBe('ltr');
    expect(read(text(p([{ text: 'Hello' }], { dir: 'rtl' }))).direction).toBe('rtl');
    // No text yet: the deck's direction.
    expect(read(text(p([]))).direction).toBe('rtl');
    expect(read(text(p([])), { theme, dir: 'ltr' }).direction).toBe('ltr');
  });

  it('Ctrl+Shift+X flips to the opposite of how the text is laid out now', () => {
    expect(flippedDirection(sampleRichText(text(p([{ text: 'שלום' }]))), ctx)).toBe('ltr');
    expect(flippedDirection(sampleRichText(text(p([{ text: 'Hello' }]))), ctx)).toBe('rtl');
    expect(flippedDirection(sampleRichText(text(p([{ text: 'שלום' }], { dir: 'ltr' }))), ctx)).toBe(
      'rtl',
    );
  });
});

describe('text styles of the theme', () => {
  const rich = text(
    p(
      [
        { text: 'כותרת ', marks: { size: 44, weight: 700, color: { token: 'accent' } } },
        { text: 'נטויה', marks: { size: 44, weight: 700, italic: true, font: 'Rubik' } },
        { text: ' link', marks: { link: 'https://example.com/', underline: true, case: 'upper' } },
      ],
      { lineHeight: 1.1, spaceAfter: 12, align: 'center' },
    ),
  );

  it('reads the style of the paragraphs: the default one when none is named', () => {
    expect(read(rich).styleRef).toBe('body');
    expect(read(text(p([{ text: 'a' }], { styleRef: 'title' }))).styleRef).toBe('title');
    expect(read(text(p([{ text: 'a' }], { styleRef: 'title' }), p([{ text: 'b' }]))).styleRef).toBe(
      MIXED,
    );
    expect(read(text(p([{ text: 'a' }])), { ...ctx, styleRef: 'caption' }).styleRef).toBe(
      'caption',
    );
  });

  it('applying a style drops what the style defines, so the style shows; the rest stays', () => {
    const change = styleChange('title');
    const out = mapParagraphs(mapMarks(rich, change.marks), change.paragraphs);
    expect(out).toEqual(
      text(
        p(
          [
            { text: 'כותרת ' },
            { text: 'נטויה', marks: { italic: true } },
            { text: ' link', marks: { link: 'https://example.com/', underline: true } },
          ],
          { styleRef: 'title', spaceAfter: 12, align: 'center' },
        ),
      ),
    );
    // What the toolbar then shows is the style's own.
    const title = theme.textStyles.title;
    expect(read(out)).toMatchObject({
      styleRef: 'title',
      size: title.size,
      weight: title.weight,
      lineHeight: title.lineHeight,
    });
  });

  it('"update the style to match" takes what the text has, and the marks that then repeat it', () => {
    const body = theme.textStyles.body;
    const big = text(
      p(
        [
          { text: 'גדול ', marks: { size: 44, weight: 700, color: { token: 'accent' } } },
          {
            text: 'אחר',
            marks: { size: 44, weight: 700, color: { token: 'accent' }, italic: true },
          },
        ],
        { lineHeight: 1.1 },
      ),
    );
    const match = matchStyle(read(big), body);
    expect(match?.style).toEqual({
      ...body,
      size: 44,
      weight: 700,
      color: { token: 'accent' },
      lineHeight: 1.1,
    });
    // The font is a role of the theme, not a family: it is not taken.
    expect(match?.style.font).toBe(body.font);
    const out = mapParagraphs(mapMarks(big, match!.marks), match!.paragraphs);
    expect(out).toEqual(text(p([{ text: 'גדול ' }, { text: 'אחר', marks: { italic: true } }])));
  });

  it('a value the text has more than one of is left as the style has it, and its marks stay', () => {
    const body = theme.textStyles.body;
    const mixed = text(
      p([
        { text: 'a', marks: { size: 44, letterSpacing: 2 } },
        { text: 'b', marks: { size: 60, letterSpacing: 2 } },
      ]),
    );
    const match = matchStyle(read(mixed), body);
    expect(match?.style).toEqual({ ...body, letterSpacing: 2 });
    expect(mapMarks(mixed, match!.marks).paragraphs[0]?.runs).toEqual([
      { text: 'a', marks: { size: 44 } },
      { text: 'b', marks: { size: 60 } },
    ]);
  });

  it('a mark that says something else than the new style stays, in the rest of the paragraph', () => {
    // The selection was "a" alone; the paragraph also holds "b", at another size.
    const match = matchStyle(
      read(text(p([{ text: 'a', marks: { size: 44 } }]))),
      theme.textStyles.body,
    );
    const whole = text(
      p([
        { text: 'a', marks: { size: 44 } },
        { text: 'b', marks: { size: 20 } },
      ]),
    );
    expect(mapMarks(whole, match!.marks).paragraphs[0]?.runs).toEqual([
      { text: 'a' },
      { text: 'b', marks: { size: 20 } },
    ]);
  });

  it('removes the letter spacing and the case of a style when the text has none', () => {
    const spaced = { ...theme.textStyles.caption, letterSpacing: 3, case: 'upper' as const };
    const plain = text(
      p([{ text: 'a', marks: { letterSpacing: 0.5, case: 'lower' } }], { styleRef: 'caption' }),
    );
    const lower = matchStyle(read(plain), spaced);
    expect(lower?.style).toMatchObject({ letterSpacing: 0.5, case: 'lower' });
    // Text that shows the style as it is has nothing to update.
    expect(matchStyle(read(text(p([{ text: 'a' }]))), theme.textStyles.body)).toBeNull();
  });
});

describe('clear formatting', () => {
  it('removes every character mark and leaves the paragraph fields', () => {
    const rich = text(
      p(
        [
          { text: 'גדול ', marks: { size: 60, weight: 700, color: { token: 'accent' } } },
          { text: 'H', marks: { italic: true, underline: true, highlight: { value: '#ff0' } } },
          { text: '2', marks: { script: 'sub', font: 'Rubik', case: 'upper', letterSpacing: 2 } },
          { text: 'O', marks: { strike: true } },
        ],
        { align: 'center', lineHeight: 1.2, styleRef: 'title', list: { kind: 'bullet', level: 1 } },
      ),
    );
    expect(mapMarks(rich, clearMarks)).toEqual(
      text(
        p([{ text: 'גדול H2O' }], {
          align: 'center',
          lineHeight: 1.2,
          styleRef: 'title',
          list: { kind: 'bullet', level: 1 },
        }),
      ),
    );
  });

  it('keeps a link, and the underline that shows it', () => {
    const link = 'https://example.com/';
    const rich = text(
      p([
        { text: 'ראו ', marks: { underline: true, size: 40 } },
        { text: 'כאן', marks: { link, underline: true, weight: 700 } },
        { text: ' וגם ', marks: { italic: true } },
        { text: 'שם', marks: { link: '#slide=s_2', color: { token: 'primary' } } },
      ]),
    );
    expect(mapMarks(rich, clearMarks).paragraphs[0]?.runs).toEqual([
      { text: 'ראו ' },
      { text: 'כאן', marks: { link, underline: true } },
      { text: ' וגם ' },
      { text: 'שם', marks: { link: '#slide=s_2' } },
    ]);
  });

  it('takes the formatting of an empty line too', () => {
    expect(mapMarks(text(p([{ text: '', marks: { size: 60 } }])), clearMarks)).toEqual(text(p([])));
  });
});

describe('the format painter', () => {
  const source = text(
    p(
      [
        { text: 'מקור', marks: { size: 48, weight: 700, link: 'https://example.com/' } },
        { text: ' אחר', marks: { italic: true } },
      ],
      { dir: 'rtl', align: 'center', lineHeight: 1.1, styleRef: 'heading' },
    ),
    p([{ text: 'second' }], { align: 'end' }),
  );
  const picked = pickFormat(sampleRichText(source));

  it('picks up the marks and the paragraph format at the start, without the link or the direction', () => {
    expect(picked).toEqual({
      marks: { size: 48, weight: 700 },
      paragraph: { align: 'center', lineHeight: 1.1, styleRef: 'heading' },
    });
    // Plain text has a format too: no marks, and the paragraph as it is.
    expect(pickFormat(sampleRichText(text(p([{ text: 'a' }]))))).toEqual({
      marks: {},
      paragraph: { align: 'start' },
    });
    expect(pickFormat(sampleRichText({ paragraphs: [] }))).toEqual({
      marks: {},
      paragraph: { align: 'start' },
    });
  });

  it('replaces the marks of the text it paints, and keeps its links', () => {
    const target = text(
      p([
        { text: 'a', marks: { color: { token: 'accent' }, strike: true } },
        { text: 'b', marks: { link: '#slide=s_1', underline: true, size: 20 } },
      ]),
    );
    expect(mapMarks(target, paintMarks(picked)).paragraphs[0]?.runs).toEqual([
      { text: 'a', marks: { size: 48, weight: 700 } },
      { text: 'b', marks: { size: 48, weight: 700, link: '#slide=s_1', underline: true } },
    ]);
  });

  it('replaces the paragraph format, and leaves each paragraph its direction', () => {
    const target = text(
      p([{ text: 'English' }], { dir: 'ltr', spaceAfter: 20, list: { kind: 'number', level: 0 } }),
      p([{ text: 'אוטומטי' }], { indent: 40 }),
    );
    expect(mapParagraphs(target, paintParagraph(picked))).toEqual(
      text(
        p([{ text: 'English' }], {
          dir: 'ltr',
          align: 'center',
          lineHeight: 1.1,
          styleRef: 'heading',
        }),
        p([{ text: 'אוטומטי' }], { align: 'center', lineHeight: 1.1, styleRef: 'heading' }),
      ),
    );
  });

  it('carries a list with the rest of the paragraph format', () => {
    const bullets = pickFormat(
      sampleRichText(
        text(p([{ text: 'item' }], { list: { kind: 'bullet', level: 2, glyph: '–' } })),
      ),
    );
    expect(
      mapParagraphs(text(p([{ text: 'plain' }])), paintParagraph(bullets)).paragraphs[0]?.list,
    ).toEqual({ kind: 'bullet', level: 2, glyph: '–' });
  });
});
