// @vitest-environment happy-dom
import { RichText, type Paragraph } from '@slidr/model';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  hasText,
  htmlToRichText,
  matchDestination,
  parseCopiedText,
  plainTextToRichText,
  linkedSlide,
  safeLink,
  slideLink,
  typedLink,
} from './paste';

// In a browser a parsed clipboard document is inert: it has no window, so it loads nothing and
// runs nothing (the Playwright spec checks that, frames included). happy-dom would run and fetch
// its scripts; that is switched off here.
beforeAll(() => {
  const settings = (window as unknown as { happyDOM?: { settings: Record<string, unknown> } })
    .happyDOM?.settings;
  if (!settings) return;
  settings.disableJavaScriptFileLoading = true;
  settings.disableJavaScriptEvaluation = true;
  settings.disableCSSFileLoading = true;
});

const p = (runs: Paragraph['runs'], extra: Partial<Paragraph> = {}): Paragraph => ({
  dir: 'auto',
  align: 'start',
  runs,
  ...extra,
});

/** The paragraphs of pasted HTML; the result is always a valid `RichText` and nothing else. */
function paste(html: string): Paragraph[] {
  const rich = htmlToRichText(html);
  // The strict schema of the model: a field that is not of `RichText` would fail here.
  expect(RichText.parse(rich)).toEqual(rich);
  return rich.paragraphs;
}

const lines = (html: string) =>
  paste(html).map((paragraph) => paragraph.runs.map((run) => run.text).join(''));

describe('HTML from the clipboard becomes rich text', () => {
  it('keeps paragraphs and line breaks', () => {
    expect(paste('<p>First</p><p>Second<br>line</p><div>Third</div>')).toEqual([
      p([{ text: 'First' }]),
      p([{ text: 'Second\nline' }]),
      p([{ text: 'Third' }]),
    ]);
    // Inline content without a block around it is one paragraph.
    expect(lines('Hello <span>big</span> world')).toEqual(['Hello big world']);
    expect(lines('<h1>Title</h1>text<blockquote>quote</blockquote>')).toEqual([
      'Title',
      'text',
      'quote',
    ]);
  });

  it('keeps bold, italic, underline, strike, sub and superscript', () => {
    expect(
      paste(
        '<p>a <b>b</b> <strong>c</strong> <i>d</i> <em>e</em> <u>f</u> <s>g</s> <del>h</del> x<sup>2</sup> H<sub>2</sub>O</p>',
      )[0]?.runs,
    ).toEqual([
      { text: 'a ' },
      { text: 'b', marks: { weight: 700 } },
      { text: ' ' },
      { text: 'c', marks: { weight: 700 } },
      { text: ' ' },
      { text: 'd', marks: { italic: true } },
      { text: ' ' },
      { text: 'e', marks: { italic: true } },
      { text: ' ' },
      { text: 'f', marks: { underline: true } },
      { text: ' ' },
      { text: 'g', marks: { strike: true } },
      { text: ' ' },
      { text: 'h', marks: { strike: true } },
      { text: ' x' },
      { text: '2', marks: { script: 'sup' } },
      { text: ' H' },
      { text: '2', marks: { script: 'sub' } },
      { text: 'O' },
    ]);
    // Nested marks add up.
    expect(paste('<b><i>both</i></b>')[0]?.runs).toEqual([
      { text: 'both', marks: { weight: 700, italic: true } },
    ]);
  });

  it('reads the same marks from inline styles, and a style wins over its tag', () => {
    expect(
      paste(
        '<span style="font-weight: 700">a</span><span style="font-style:italic">b</span>' +
          '<span style="text-decoration: underline line-through">c</span>' +
          '<span style="vertical-align: super">d</span><span style="font-weight:600">e</span>',
      )[0]?.runs,
    ).toEqual([
      { text: 'a', marks: { weight: 700 } },
      { text: 'b', marks: { italic: true } },
      { text: 'c', marks: { underline: true, strike: true } },
      { text: 'd', marks: { script: 'sup' } },
      { text: 'e', marks: { weight: 700 } },
    ]);
    // Google Docs wraps every copy in a <b> that is not bold.
    expect(
      paste(
        '<b style="font-weight:normal" id="docs-internal-guid-1"><p><span style="font-weight:400">plain </span><span style="font-weight:700">bold</span></p></b>',
      )[0]?.runs,
    ).toEqual([{ text: 'plain ' }, { text: 'bold', marks: { weight: 700 } }]);
  });

  it('drops fonts, sizes, colours and alignment: the text takes the style of where it lands', () => {
    expect(
      paste(
        '<p style="text-align:center; line-height: 3" dir="ltr" class="x"><font face="Arial" size="7" color="red">' +
          '<span style="font-family: Comic Sans MS; font-size: 40px; color: #f00; background-color: yellow; letter-spacing: 4px">text</span></font></p>',
      ),
    ).toEqual([p([{ text: 'text' }])]);
  });

  it('leaves out scripts, styles, event handlers and embedded content', () => {
    const html =
      '<p onclick="evil()" onmouseover="evil()">Hello<script>alert(1)</script>' +
      '<style>p { color: red }</style><img src="x" onerror="alert(2)">' +
      '<object>object</object><embed>' +
      '<svg onload="alert(3)"><text>svg</text></svg> world</p>' +
      '<noscript>no</noscript><template><p>tpl</p></template><meta charset="utf-8">';
    const out = paste(html);
    expect(out).toEqual([p([{ text: 'Hello world' }])]);
    expect(JSON.stringify(out)).not.toMatch(/alert|evil|onclick|script|frame|object/);
  });

  it('keeps a link only when it opens a page or writes a mail', () => {
    expect(paste('<a href="https://slidr.dev/docs">docs</a>')[0]?.runs).toEqual([
      { text: 'docs', marks: { link: 'https://slidr.dev/docs' } },
    ]);
    expect(paste('<a href="mailto:hi@slidr.dev">mail</a>')[0]?.runs[0]?.marks).toEqual({
      link: 'mailto:hi@slidr.dev',
    });
    // The text of any other link stays; the link does not.
    for (const href of [
      'javascript:alert(1)',
      ' JaVa\tScRiPt:alert(1)',
      'vbscript:x',
      'data:text/html,<script>alert(1)</script>',
      'file:///C:/secret.txt',
      '/relative/page',
      '#anchor',
    ]) {
      expect(paste(`<a href="${href}">click</a>`)).toEqual([p([{ text: 'click' }])]);
    }
  });

  it('keeps lists, their kind and their levels', () => {
    expect(
      paste(
        '<ul><li>One</li><li>Two<ol><li>Two A</li><li>Two B<ul><li>Deep</li></ul></li></ol></li><li><p>Three</p></li></ul><p>After</p>',
      ),
    ).toEqual([
      p([{ text: 'One' }], { list: { kind: 'bullet', level: 0 } }),
      p([{ text: 'Two' }], { list: { kind: 'bullet', level: 0 } }),
      p([{ text: 'Two A' }], { list: { kind: 'number', level: 1 } }),
      p([{ text: 'Two B' }], { list: { kind: 'number', level: 1 } }),
      p([{ text: 'Deep' }], { list: { kind: 'bullet', level: 2 } }),
      p([{ text: 'Three' }], { list: { kind: 'bullet', level: 0 } }),
      p([{ text: 'After' }]),
    ]);
  });

  it('caps the list level at the 8 the model allows', () => {
    const deep = '<ul><li>'.repeat(12) + 'bottom' + '</li></ul>'.repeat(12);
    expect(paste(deep).at(-1)).toEqual(
      p([{ text: 'bottom' }], { list: { kind: 'bullet', level: 8 } }),
    );
  });

  it('collapses white space as a browser draws it, and keeps it where it is kept', () => {
    expect(lines('<p>  a \n   b\t c  </p>\n\n  <p>\n d </p>')).toEqual(['a b c', 'd']);
    // A non-breaking space is a space.
    expect(lines('<p>a&nbsp;&nbsp;b</p>')).toEqual(['a b']);
    expect(lines('<pre>  two  spaces\n  kept</pre>')).toEqual(['  two  spaces\n  kept']);
    expect(lines('<span style="white-space: pre-wrap">a   b</span>')).toEqual(['a   b']);
    // Spaces across inline elements do not double.
    expect(lines('<p>a <b> b</b> <i>c </i> d</p>')).toEqual(['a b c d']);
  });

  it('keeps empty lines between paragraphs, and not at the edges', () => {
    expect(lines('<p><br></p><p>a</p><p><br></p><p>&nbsp;</p><p>b</p><p>&nbsp;</p>')).toEqual([
      'a',
      '',
      '',
      'b',
    ]);
    expect(lines('<div>a<br></div><div><br></div><div>b</div>')).toEqual(['a', '', 'b']);
    // An element with nothing in it draws nothing.
    expect(lines('<p></p><p>a</p><div></div>')).toEqual(['a']);
  });

  it('puts the cells of a table row on one line, a tab apart', () => {
    expect(
      lines(`<table>
        <tr><th>Name</th> <th>Qty</th></tr>
        <tr><td>Apples</td><td>3</td></tr>
      </table>`),
    ).toEqual(['Name\tQty', 'Apples\t3']);
  });

  it('skips what is hidden', () => {
    expect(lines('<p>a<span style="display:none">secret</span><span hidden>x</span>b</p>')).toEqual(
      ['ab'],
    );
  });

  it('keeps mixed Hebrew and English in its logical order', () => {
    const text = 'ה-API החדש עלה ל-production ב-12.10 (גרסה 2.3).';
    expect(paste(`<p dir="rtl">${text}</p>`)).toEqual([p([{ text }])]);
    expect(lines('<p>שלום <b>world</b>, מה נשמע?</p>')).toEqual(['שלום world, מה נשמע?']);
  });

  it('reads the fragment a browser puts on the clipboard', () => {
    const html =
      '<html><body><!--StartFragment--><meta charset="utf-8"><span style="color: rgb(0, 0, 0); font-family: Arial;">copied <b>text</b></span><!--EndFragment--></body></html>';
    expect(paste(html)).toEqual([
      p([{ text: 'copied ' }, { text: 'text', marks: { weight: 700 } }]),
    ]);
  });

  it('gives nothing for markup without text', () => {
    expect(paste('<img src="a.png"><script>x</script>')).toEqual([]);
    expect(hasText(htmlToRichText('<p><br></p>'))).toBe(false);
  });
});

describe('plain text becomes paragraphs', () => {
  it('one paragraph per line, with any kind of line break', () => {
    expect(plainTextToRichText('a\nb\r\nc\rd').paragraphs).toEqual([
      p([{ text: 'a' }]),
      p([{ text: 'b' }]),
      p([{ text: 'c' }]),
      p([{ text: 'd' }]),
    ]);
  });

  it('keeps empty lines, and not the line break that ends the text', () => {
    expect(plainTextToRichText('a\n\nb\n').paragraphs).toEqual([
      p([{ text: 'a' }]),
      p([]),
      p([{ text: 'b' }]),
    ]);
    expect(plainTextToRichText('').paragraphs).toEqual([]);
  });

  it('takes markup as text', () => {
    expect(plainTextToRichText('<b>not bold</b>').paragraphs).toEqual([
      p([{ text: '<b>not bold</b>' }]),
    ]);
  });
});

describe("Slidr's own copied text", () => {
  const copied = {
    paragraphs: [
      p([{ text: 'גדול', marks: { size: 60, color: { token: 'primary' } } }], {
        dir: 'rtl',
        align: 'center',
        list: { kind: 'number', level: 1 },
      }),
    ],
  };

  it('comes back with all of its formatting', () => {
    expect(parseCopiedText(JSON.stringify(copied))).toEqual(copied);
  });

  it('is refused when it is not a rich text', () => {
    expect(parseCopiedText('')).toBeUndefined();
    expect(parseCopiedText('{not json')).toBeUndefined();
    expect(parseCopiedText('{"paragraphs":"x"}')).toBeUndefined();
    // The model's schema is strict: an unknown field is not let through.
    expect(
      parseCopiedText(
        JSON.stringify({
          paragraphs: [{ dir: 'auto', align: 'start', runs: [{ text: 'a', html: '<script>' }] }],
        }),
      ),
    ).toBeUndefined();
  });

  it('loses a link that could run code, and keeps the text', () => {
    const out = parseCopiedText(
      JSON.stringify({
        paragraphs: [
          p([
            { text: 'bad', marks: { link: 'javascript:alert(1)', italic: true } },
            { text: 'good', marks: { link: 'https://slidr.dev' } },
          ]),
        ],
      }),
    );
    expect(out?.paragraphs[0]?.runs).toEqual([
      { text: 'bad', marks: { italic: true } },
      { text: 'good', marks: { link: 'https://slidr.dev' } },
    ]);
  });
});

describe('matching the destination', () => {
  it('gives pasted paragraphs the fields of the paragraph at the caret', () => {
    const pasted = { paragraphs: [p([{ text: 'a' }]), p([{ text: 'b' }])] };
    const out = matchDestination(pasted, {
      paragraph: { dir: 'rtl', align: 'center', styleRef: 'heading', lineHeight: 1.2 },
      marks: undefined,
    });
    expect(out.paragraphs).toEqual([
      p([{ text: 'a' }], { dir: 'rtl', align: 'center', styleRef: 'heading', lineHeight: 1.2 }),
      p([{ text: 'b' }], { dir: 'rtl', align: 'center', styleRef: 'heading', lineHeight: 1.2 }),
    ]);
  });

  it('keeps a pasted list, and continues the list it lands in', () => {
    const pasted = {
      paragraphs: [p([{ text: 'a' }], { list: { kind: 'number', level: 2 } }), p([{ text: 'b' }])],
    };
    const out = matchDestination(pasted, {
      paragraph: { dir: 'auto', align: 'start', list: { kind: 'bullet', level: 0 } },
      marks: undefined,
    });
    expect(out.paragraphs.map((x) => x.list)).toEqual([
      { kind: 'number', level: 2 },
      { kind: 'bullet', level: 0 },
    ]);
  });

  it('gives pasted runs the marks at the caret, under their own', () => {
    const pasted = { paragraphs: [p([{ text: 'a ' }, { text: 'b', marks: { weight: 700 } }])] };
    const out = matchDestination(pasted, {
      paragraph: { dir: 'auto', align: 'start' },
      marks: { size: 60, weight: 300, color: { token: 'accent' }, link: 'https://x.dev' },
    });
    expect(out.paragraphs[0]?.runs).toEqual([
      // The link at the caret belongs to the text there, and is not passed on.
      { text: 'a ', marks: { size: 60, weight: 300, color: { token: 'accent' } } },
      { text: 'b', marks: { size: 60, weight: 700, color: { token: 'accent' } } },
    ]);
  });
});

describe('safe links', () => {
  it('lets web, mail and phone links through, and nothing else', () => {
    expect(safeLink('https://a.dev')).toBe('https://a.dev');
    expect(safeLink('HTTP://A.DEV')).toBe('HTTP://A.DEV');
    expect(safeLink('mailto:a@b.dev')).toBe('mailto:a@b.dev');
    expect(safeLink('tel:+972501234567')).toBe('tel:+972501234567');
    expect(safeLink('javascript:alert(1)')).toBeUndefined();
    expect(safeLink('  java\nscript:alert(1)')).toBeUndefined();
    expect(safeLink('data:text/html,x')).toBeUndefined();
    expect(safeLink('page.html')).toBeUndefined();
    expect(safeLink('')).toBeUndefined();
    expect(safeLink(null)).toBeUndefined();
  });

  it('lets a link to a slide through, in exactly its own form', () => {
    expect(safeLink('#slide=s_k3x9a2bq')).toBe('#slide=s_k3x9a2bq');
    expect(safeLink(slideLink('s_probe_a'))).toBe('#slide=s_probe_a');
    expect(linkedSlide('#slide=s_probe_a')).toBe('s_probe_a');
    // Anything else that starts with a hash is an address of some page, and is refused.
    expect(safeLink('#slide=')).toBeUndefined();
    expect(safeLink('#slide=a b')).toBe('#slide=ab');
    expect(safeLink('#slide=a"onclick="x')).toBeUndefined();
    expect(safeLink('#Slide=s_1')).toBeUndefined();
    expect(safeLink('#top')).toBeUndefined();
    expect(safeLink('page.html#slide=s_1')).toBeUndefined();
    expect(linkedSlide('https://a.dev/#slide=s_1')).toBeUndefined();
    expect(linkedSlide(undefined)).toBeUndefined();
  });

  it('a slide link survives a copy and a paste inside Slidr', () => {
    const copied = {
      paragraphs: [
        {
          dir: 'auto',
          align: 'start',
          runs: [{ text: 'next', marks: { link: '#slide=s_2', underline: true } }],
        },
      ],
    };
    expect(parseCopiedText(JSON.stringify(copied))).toEqual(copied);
  });
});

describe('an address as it is typed', () => {
  it('gets https:// when no scheme was typed, and mailto: when it is a mail address', () => {
    expect(typedLink('example.com')).toBe('https://example.com');
    expect(typedLink('  www.example.com/a?b=1#c  ')).toBe('https://www.example.com/a?b=1#c');
    expect(typedLink('//example.com/x')).toBe('https://example.com/x');
    expect(typedLink('localhost:1420/dev')).toBe('https://localhost:1420/dev');
    expect(typedLink('name@example.com')).toBe('mailto:name@example.com');
  });

  it('keeps a scheme a slide may carry as it was typed', () => {
    expect(typedLink('http://example.com')).toBe('http://example.com');
    expect(typedLink('HTTPS://Example.com')).toBe('HTTPS://Example.com');
    expect(typedLink('mailto:a@b.dev')).toBe('mailto:a@b.dev');
    expect(typedLink('tel:035551234')).toBe('tel:035551234');
  });

  it('refuses what safeLink refuses, and what is no address', () => {
    expect(typedLink('javascript:alert(1)')).toBeUndefined();
    expect(typedLink('data:text/html,x')).toBeUndefined();
    expect(typedLink('file:///C:/x.html')).toBeUndefined();
    expect(typedLink('C:\\deck\\x.html')).toBeUndefined();
    expect(typedLink('')).toBeUndefined();
    expect(typedLink('   ')).toBeUndefined();
    // A link to a slide is picked from the list, not typed.
    expect(typedLink('#slide=s_1')).toBeUndefined();
  });
});
