// @vitest-environment happy-dom
import { RichText, type Paragraph } from '@slidr/model';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  htmlToSourceText,
  keepSource,
  pastedText,
  sourceFontSize,
  withoutLook,
  type ClipboardText,
  type Destination,
  type SourceContext,
} from './paste';

/*
 * Pasting from outside with a choice (TXT-13): what "keep the source's formatting" reads, and
 * what each kind of paste puts into the text. The reader is given the fonts and the colours as
 * the app would give them (`pasteSource.ts`); how a stylesheet of the source is read is tested in
 * a real browser (`pasteSource.browser.test.ts`).
 */

// As in `paste.test.ts`: a parsed clipboard document is inert in a browser; happy-dom is told.
beforeAll(() => {
  const settings = (window as unknown as { happyDOM?: { settings: Record<string, unknown> } })
    .happyDOM?.settings;
  if (!settings) return;
  settings.disableJavaScriptFileLoading = true;
  settings.disableJavaScriptEvaluation = true;
  settings.disableCSSFileLoading = true;
});

const KNOWN = ['Rubik', 'Arial', 'Frank Ruhl Libre'];

/** A deck that can be drawn in three fonts, and takes hex colours as they are. */
const source: SourceContext = {
  scale: 1.5,
  font: (families) => {
    for (const family of families) {
      const own = KNOWN.find((known) => known.toLowerCase() === family.toLowerCase());
      if (own) return own;
    }
    return undefined;
  },
  color: (css) => (/^#[0-9a-f]{6}$/.test(css) ? { value: css } : undefined),
};

const read = (html: string) => htmlToSourceText(html, source).paragraphs;
const runs = (html: string) => read(html).flatMap((paragraph) => paragraph.runs);

const here: Destination = {
  paragraph: { dir: 'auto', align: 'start' },
  marks: undefined,
  dir: 'rtl',
};

const p = (paragraphRuns: Paragraph['runs'], extra: Partial<Paragraph> = {}): Paragraph => ({
  dir: 'auto',
  align: 'start',
  runs: paragraphRuns,
  ...extra,
});

describe('a size of the source', () => {
  it('is read in every absolute unit, as the pixels a browser draws it in', () => {
    expect(sourceFontSize('16px', 16)).toBe(16);
    expect(sourceFontSize('12pt', 16)).toBe(16);
    expect(sourceFontSize('14.0pt', 16)).toBeCloseTo(18.67, 2);
    expect(sourceFontSize('1in', 16)).toBe(96);
    expect(sourceFontSize('1pc', 16)).toBe(16);
    expect(sourceFontSize('2.54cm', 16)).toBeCloseTo(96, 5);
  });

  it('is relative to the size around it when it says so', () => {
    expect(sourceFontSize('2em', 20)).toBe(40);
    expect(sourceFontSize('150%', 20)).toBe(30);
    expect(sourceFontSize('1.5rem', 20)).toBe(24);
    expect(sourceFontSize('larger', 20)).toBe(24);
    expect(sourceFontSize('smaller', 24)).toBe(20);
    expect(sourceFontSize('x-large', 20)).toBe(24);
  });

  it('is nothing for what is no size', () => {
    for (const value of ['', 'inherit', '0', '-4px', 'calc(1em + 2px)', 'big'])
      expect(sourceFontSize(value, 16)).toBeUndefined();
  });
});

describe('what the source states is kept', () => {
  it('keeps the font, the size, the weight and the colour of a run', () => {
    expect(
      runs(
        '<p><span style="font-family:\'Rubik\',sans-serif; font-size:14pt; font-weight:600; color:#c00000">text</span></p>',
      ),
    ).toEqual([
      // 14pt is 18.67 pixels of a page, and 28 of a slide.
      {
        text: 'text',
        marks: { font: 'Rubik', size: 28, weight: 600, color: { value: '#c00000' } },
      },
    ]);
  });

  it('takes the first family of a list that the deck can be drawn in, by its own name', () => {
    expect(
      runs('<span style="font-family: \'Google Sans\', roboto, ARIAL, sans-serif">a</span>'),
    ).toEqual([{ text: 'a', marks: { font: 'Arial' } }]);
    // None of them: the text takes the font of where it lands.
    expect(runs('<span style="font-family: Calibri, sans-serif">a</span>')).toEqual([
      { text: 'a' },
    ]);
    // A family named around the text is not kept under one that cannot be drawn.
    expect(
      runs('<div style="font-family: Rubik"><span style="font-family: Calibri">a</span></div>'),
    ).toEqual([{ text: 'a' }]);
  });

  it('passes what an element states on to the text inside it, and a nearer statement wins', () => {
    expect(
      runs(
        '<div style="font-size:20px; color:#112233">one <b>two</b> <span style="font-size:150%; color:#445566">three</span></div>',
      ),
    ).toEqual([
      { text: 'one ', marks: { size: 30, color: { value: '#112233' } } },
      { text: 'two', marks: { size: 30, color: { value: '#112233' }, weight: 700 } },
      { text: ' ', marks: { size: 30, color: { value: '#112233' } } },
      { text: 'three', marks: { size: 45, color: { value: '#445566' } } },
    ]);
  });

  it('reads a copy from a browser, which states everything on one span and marks it important', () => {
    expect(
      runs(
        '<meta charset="utf-8"><span style="color: #202124 !important; font-family: Arial, sans-serif; ' +
          'font-size: 14px !important; font-style: normal; font-weight: 400; letter-spacing: normal; ' +
          'text-align: start; background-color: rgb(255, 255, 255); display: inline !important; float: none;">' +
          'From a page</span>',
      ),
    ).toEqual([
      {
        text: 'From a page',
        marks: { font: 'Arial', size: 21, weight: 400, color: { value: '#202124' } },
      },
    ]);
  });

  it('says a weight that is not bold out loud, so that it stays light in a bold line', () => {
    expect(runs('<span style="font-weight: normal">a</span>')).toEqual([
      { text: 'a', marks: { weight: 400 } },
    ]);
    expect(runs('<span style="font-weight: 300">a</span>')).toEqual([
      { text: 'a', marks: { weight: 300 } },
    ]);
  });

  it('gives a heading the size and the weight a browser gives it', () => {
    expect(read('<h1>Title</h1><p>text</p><h3>Small</h3>')).toEqual([
      { runs: [{ text: 'Title', marks: { size: 48, weight: 700 } }] },
      { runs: [{ text: 'text' }] },
      { runs: [{ text: 'Small', marks: { size: 28.1, weight: 700 } }] },
    ]);
  });

  it('keeps the alignment and the direction a paragraph states', () => {
    expect(
      read(
        '<p style="text-align:center">a</p><p dir="RTL" style="text-align:right">ב</p>' +
          '<div style="direction:ltr; text-align:justify"><p>c</p></div><p>d</p>',
      ),
    ).toEqual([
      { runs: [{ text: 'a' }], align: 'center' },
      { runs: [{ text: 'ב' }], align: 'right', dir: 'rtl' },
      { runs: [{ text: 'c' }], align: 'justify', dir: 'ltr' },
      { runs: [{ text: 'd' }] },
    ]);
  });

  it('still keeps what the default paste keeps: emphasis, links, lists', () => {
    expect(
      read('<ul><li><i>one</i></li><li><a href="https://slidr.dev">two</a></li></ul>'),
    ).toEqual([
      { runs: [{ text: 'one', marks: { italic: true } }], list: { kind: 'bullet', level: 0 } },
      {
        runs: [{ text: 'two', marks: { link: 'https://slidr.dev' } }],
        list: { kind: 'bullet', level: 0 },
      },
    ]);
  });

  it('does not read the colour behind the text, which may be the page it came from', () => {
    expect(runs('<span style="background-color: #ffffff; background: #ffff00">a</span>')).toEqual([
      { text: 'a' },
    ]);
  });

  it('reads no more of the markup than the default paste does', () => {
    const html =
      '<p onclick="evil()" style="color:#ff0000; background:url(https://x.test/a.png)">Hello' +
      '<script>alert(1)</script><style>@import url(https://x.test/a.css); p { color: #00ff00 }</style>' +
      '<img src="https://x.test/b.png" onerror="alert(2)"><object data="https://x.test/c">object</object> world</p>';
    const out = read(html);
    expect(out.map((paragraph) => paragraph.runs.map((run) => run.text).join(''))).toEqual([
      'Hello world',
    ]);
    expect(JSON.stringify(out)).not.toMatch(/alert|evil|onclick|script|x\.test|import|url/);
  });
});

describe('text that keeps its source formatting, in its destination', () => {
  it('has what the source states over what the destination gives', () => {
    const text = htmlToSourceText(
      '<p style="text-align:center"><span style="font-size:12pt">a </span><b>b</b></p>',
      source,
    );
    const out = keepSource(text, {
      paragraph: { dir: 'auto', align: 'start', styleRef: 'title', lineHeight: 1.1 },
      marks: { color: { token: 'accent' }, size: 80, link: 'https://x.dev' },
      dir: 'ltr',
    });
    expect(RichText.parse(out)).toEqual(out);
    expect(out.paragraphs).toEqual([
      p(
        [
          { text: 'a ', marks: { color: { token: 'accent' }, size: 24 } },
          { text: 'b', marks: { color: { token: 'accent' }, size: 80, weight: 700 } },
        ],
        { align: 'center', styleRef: 'title', lineHeight: 1.1 },
      ),
    ]);
  });

  it('turns left and right into the start and the end of the line the paragraph reads in', () => {
    const align = (html: string, destination: Destination = here) =>
      keepSource(htmlToSourceText(html, source), destination).paragraphs.map((x) => x.align);
    // Hebrew text reads from the right: its right is its start.
    expect(align('<p style="text-align:right">שלום</p>')).toEqual(['start']);
    expect(align('<p style="text-align:left">שלום</p>')).toEqual(['end']);
    expect(align('<p style="text-align:right">Hello</p>')).toEqual(['end']);
    // A paragraph without letters reads the way the deck does.
    expect(align('<p style="text-align:right">2026</p>')).toEqual(['start']);
    expect(align('<p style="text-align:right">2026</p>', { ...here, dir: 'ltr' })).toEqual(['end']);
    // The direction the source states decides, whatever the letters are.
    expect(align('<p dir="ltr" style="text-align:left">שלום</p>')).toEqual(['start']);
    // And where the source states none, the one the destination paragraph has.
    expect(
      align('<p style="text-align:left">שלום</p>', {
        ...here,
        paragraph: { dir: 'ltr', align: 'start' },
      }),
    ).toEqual(['start']);
  });
});

describe("Slidr's own text, taking the formatting of where it lands", () => {
  it('loses its look and keeps what it is', () => {
    const own = {
      paragraphs: [
        p(
          [
            {
              text: 'a',
              marks: {
                font: 'Rubik',
                size: 60,
                weight: 800,
                color: { token: 'accent' as const },
                highlight: { value: '#ffff00' },
                letterSpacing: 2,
                case: 'upper' as const,
                italic: true,
              },
            },
            { text: 'b', marks: { weight: 300, link: 'https://slidr.dev', underline: true } },
          ],
          { align: 'center', dir: 'ltr', styleRef: 'title', list: { kind: 'number', level: 1 } },
        ),
      ],
    };
    expect(withoutLook(own).paragraphs).toEqual([
      p(
        [
          { text: 'a', marks: { weight: 700, italic: true } },
          { text: 'b', marks: { link: 'https://slidr.dev', underline: true } },
        ],
        { list: { kind: 'number', level: 1 } },
      ),
    ]);
  });
});

describe('the kinds of paste', () => {
  const own = { paragraphs: [p([{ text: 'own', marks: { size: 60, weight: 700 } }])] };
  const outside: ClipboardText = {
    html: '<p><span style="font-size:20px; color:#aa0000"><b>out</b>side</span></p>',
    text: 'outside',
    slidr: '',
  };
  const fromSlidr: ClipboardText = { html: '<p>own</p>', text: 'own', slidr: JSON.stringify(own) };
  const at: Destination = {
    paragraph: { dir: 'rtl', align: 'end' },
    marks: { size: 44 },
    dir: 'rtl',
  };
  const pasted = (data: ClipboardText, mode: Parameters<typeof pastedText>[1]) =>
    pastedText(data, mode, source)?.(at).paragraphs;

  it('Ctrl+V: text from outside takes the formatting of where it lands, with its emphasis', () => {
    expect(pasted(outside, 'auto')).toEqual([
      p(
        [
          { text: 'out', marks: { size: 44, weight: 700 } },
          { text: 'side', marks: { size: 44 } },
        ],
        {
          dir: 'rtl',
          align: 'end',
        },
      ),
    ]);
    expect(pasted(outside, 'match')).toEqual(pasted(outside, 'auto'));
  });

  it("Ctrl+V: Slidr's own text keeps its formatting", () => {
    expect(pasted(fromSlidr, 'auto')).toEqual(own.paragraphs);
    expect(pasted(fromSlidr, 'source')).toEqual(own.paragraphs);
  });

  it('keeping the source: the size and the colour of the source, in the paragraph of the caret', () => {
    expect(pasted(outside, 'source')).toEqual([
      p(
        [
          { text: 'out', marks: { size: 30, color: { value: '#aa0000' }, weight: 700 } },
          { text: 'side', marks: { size: 30, color: { value: '#aa0000' } } },
        ],
        { dir: 'rtl', align: 'end' },
      ),
    ]);
  });

  it("matching the destination: Slidr's own text too takes the formatting of where it lands", () => {
    expect(pasted(fromSlidr, 'match')).toEqual([
      p([{ text: 'own', marks: { size: 44, weight: 700 } }], { dir: 'rtl', align: 'end' }),
    ]);
  });

  it('text only: neither the markup nor the copied formatting is read', () => {
    expect(pasted(outside, 'plain')).toEqual([
      p([{ text: 'outside', marks: { size: 44 } }], { dir: 'rtl', align: 'end' }),
    ]);
    expect(pasted(fromSlidr, 'plain')).toEqual([
      p([{ text: 'own', marks: { size: 44 } }], { dir: 'rtl', align: 'end' }),
    ]);
  });

  it('falls back to the plain text when the markup has no text, and to nothing when neither has', () => {
    expect(pasted({ html: '<img src="x">', text: 'caption', slidr: '' }, 'source')).toEqual([
      p([{ text: 'caption', marks: { size: 44 } }], { dir: 'rtl', align: 'end' }),
    ]);
    expect(
      pastedText({ html: '<img src="x">', text: '', slidr: '' }, 'auto', source),
    ).toBeUndefined();
    expect(pastedText({ html: '', text: '\n', slidr: '' }, 'plain', source)).toBeUndefined();
  });

  it('always gives a valid rich text, whatever the kind', () => {
    for (const mode of ['auto', 'match', 'source', 'plain'] as const) {
      for (const data of [outside, fromSlidr]) {
        const rich = pastedText(data, mode, source)?.(at);
        expect(RichText.parse(rich)).toEqual(rich);
      }
    }
  });
});
