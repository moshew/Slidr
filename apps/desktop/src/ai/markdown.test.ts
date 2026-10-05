import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown, type Block } from './markdown';

const text = (value: string) => ({ type: 'text', text: value });

describe('inline Markdown', () => {
  it('marks emphasis, code and links, nested', () => {
    expect(parseInline('a **b *c* d** `e*f` ~~g~~ [h](https://x.test/y)')).toEqual([
      text('a '),
      {
        type: 'strong',
        children: [text('b '), { type: 'em', children: [text('c')] }, text(' d')],
      },
      text(' '),
      { type: 'code', text: 'e*f' },
      text(' '),
      { type: 'del', children: [text('g')] },
      text(' '),
      { type: 'link', href: 'https://x.test/y', children: [text('h')] },
    ]);
  });

  it('reads a run of three marks by what is open: bold italic, and an emphasis that ends a bold', () => {
    const strong = (...children: unknown[]) => ({ type: 'strong', children });
    const em = (...children: unknown[]) => ({ type: 'em', children });
    // The bug hunt's `ai-ui.md`, finding 18: this was bold "*bold italic" and a stray "*".
    expect(parseInline('***bold italic***')).toEqual([strong(em(text('bold italic')))]);
    expect(parseInline('___bold italic___')).toEqual([strong(em(text('bold italic')))]);
    expect(parseInline('**Note: *important***')).toEqual([
      strong(text('Note: '), em(text('important'))),
    ]);
    expect(parseInline('*a **b***')).toEqual([em(text('a '), strong(text('b')))]);
    // With no emphasis open, the first two marks of the run close and the third opens.
    expect(parseInline('**a***b*')).toEqual([strong(text('a')), em(text('b'))]);
    // A star that stands alone inside bold text opens nothing.
    expect(parseInline('**2 * 3 = 6**')).toEqual([strong(text('2 * 3 = 6'))]);
    // And half of it, as a reply that is still streaming has, is text.
    expect(parseInline('***bold ita')).toEqual([text('***bold ita')]);
  });

  it('leaves what is not markup alone', () => {
    expect(parseInline('snake_case_name and 2 * 3 * 4')).toEqual([
      text('snake_case_name and 2 * 3 * 4'),
    ]);
    expect(parseInline('\\*not emphasis\\*')).toEqual([text('*not emphasis*')]);
    expect(parseInline('<b onclick="x()">raw</b>')).toEqual([text('<b onclick="x()">raw</b>')]);
  });

  it('reads half a construct as text, as a reply that is still streaming has', () => {
    expect(parseInline('שלום **עול')).toEqual([text('שלום **עול')]);
    expect(parseInline('see `code')).toEqual([text('see `code')]);
    expect(parseInline('a [link](http')).toEqual([text('a [link](http')]);
  });

  it('keeps a line break inside a paragraph', () => {
    expect(parseInline('one\ntwo')).toEqual([text('one'), { type: 'break' }, text('two')]);
  });
});

describe('Markdown blocks', () => {
  it('splits paragraphs, headings, rules and quotes', () => {
    expect(parseMarkdown('# כותרת\n\nפסקה אחת\nשורה שנייה\n\n---\n> ציטוט\n> ממשיך')).toEqual([
      { type: 'heading', level: 1, children: [text('כותרת')] },
      { type: 'paragraph', children: [text('פסקה אחת'), { type: 'break' }, text('שורה שנייה')] },
      { type: 'rule' },
      {
        type: 'quote',
        children: [
          { type: 'paragraph', children: [text('ציטוט'), { type: 'break' }, text('ממשיך')] },
        ],
      },
    ]);
  });

  it('reads lists, with their numbers and what is nested under an item', () => {
    const blocks = parseMarkdown(
      'Intro:\n\n3. first\n4. second\n   - inner a\n   - inner b\n\nAfter',
    );
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'list', 'paragraph']);
    const list = blocks[1]!;
    if (list.type !== 'list') throw new Error('not a list');
    expect(list).toMatchObject({ ordered: true, start: 3 });
    expect(list.items).toHaveLength(2);
    expect(list.items[1]!.children).toEqual([
      { type: 'paragraph', children: [text('second')] },
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          { children: [{ type: 'paragraph', children: [text('inner a')] }] },
          { children: [{ type: 'paragraph', children: [text('inner b')] }] },
        ],
      },
    ]);
  });

  it('keeps code as it is, also when the fence is not closed yet', () => {
    expect(parseMarkdown('```html\n<div>**x**</div>\n```\nafter')).toEqual([
      { type: 'code', text: '<div>**x**</div>' },
      { type: 'paragraph', children: [text('after')] },
    ]);
    expect(parseMarkdown('```\nstill coming')).toEqual([{ type: 'code', text: 'still coming' }]);
  });

  it('reads a table', () => {
    expect(parseMarkdown('| שקף | מצב |\n|---|:-:|\n| 1 | **מוכן** |\n| 2 | חסר |')).toEqual([
      {
        type: 'table',
        head: [[text('שקף')], [text('מצב')]],
        rows: [
          [[text('1')], [{ type: 'strong', children: [text('מוכן')] }]],
          [[text('2')], [text('חסר')]],
        ],
      },
    ]);
  });

  it('never loops or throws on odd input', () => {
    for (const odd of [
      '',
      '\n\n',
      '-',
      '- ',
      '1.',
      '>',
      '|',
      '#',
      '***',
      '`',
      '  - x\n- y',
      '\r\n',
    ]) {
      expect(() => parseMarkdown(odd)).not.toThrow();
    }
  });

  it('closes a heading with a run of "#" only where a space comes before it', () => {
    const heading = (line: string) => parseMarkdown(line)[0];
    expect(heading('## Plan ##')).toEqual({ type: 'heading', level: 2, children: [text('Plan')] });
    expect(heading('# Plan #   ')).toEqual({ type: 'heading', level: 1, children: [text('Plan')] });
    // The bug hunt's `ai-ui.md`, finding 18: the sign of a name was taken for the closing run.
    expect(heading('## Using C#')).toEqual({
      type: 'heading',
      level: 2,
      children: [text('Using C#')],
    });
    expect(heading('# F# and C#')).toMatchObject({ children: [text('F# and C#')] });
    // A heading of nothing, and a line that only looks like one.
    expect(heading('# ##')).toEqual({ type: 'heading', level: 1, children: [] });
    expect(heading('#Plan')).toMatchObject({ type: 'paragraph' });
  });
});

describe('a line of a reply costs no more than its length', () => {
  const time = (run: () => void): number => {
    const start = performance.now();
    run();
    return performance.now() - start;
  };

  // The bug hunt's `ai-ui.md`, finding 9: the pattern of a heading tried every way to share a
  // run of spaces between its optional parts, in the cube of the run. 2,400 spaces took one to
  // five seconds on the UI thread, and 5,000 took a minute.
  it('a heading with a long run of spaces in it', () => {
    const run = ' '.repeat(2400);
    expect(time(() => parseMarkdown(`# a${run}b`))).toBeLessThan(200);
    expect(parseMarkdown(`# a${run}b ##${run}`)).toEqual([
      { type: 'heading', level: 1, children: [text(`a${run}b`)] },
    ]);
  });

  // The same fault, in the square of the run: 64,000 spaces took about two seconds.
  it('the line under what may be the head of a table', () => {
    const run = ' '.repeat(64_000);
    for (const under of [`${run}x`, `---${run}x`, `|---${run}x`, `|---|${run}---${run}x`]) {
      expect(time(() => parseMarkdown(`| a | b |\n${under}`))).toBeLessThan(300);
    }
    // And such a line is still read as what it is.
    expect(parseMarkdown(`| a |\n  |${run}:--${run}|  \n| 1 |`)).toMatchObject([
      { type: 'table', rows: [[[text('1')]]] },
    ]);
  });
});

describe('nesting in a reply', () => {
  /** How many quotes are one inside the other at the start of a text. */
  const quotes = (blocks: Block[]): number =>
    blocks[0]?.type === 'quote' ? 1 + quotes(blocks[0].children) : 0;

  it('is read as it is written, as deep as a reply goes', () => {
    expect(quotes(parseMarkdown('> > > > > five deep'))).toBe(5);
    const list = parseMarkdown('- a\n  - b\n    - c\n      - d')[0];
    expect(JSON.stringify(list).match(/"type":"list"/g)).toHaveLength(4);
  });

  // 8,000 quotes on a line ran the parser out of stack, and the app has no boundary that would
  // catch the throw: whatever is drawn from a reply must come back from any text.
  it('stops at a depth no reply has, and what is deeper is plain text', () => {
    const deep = parseMarkdown(`${'>'.repeat(20_000)} **x**`);
    expect(quotes(deep)).toBe(25);
    let inner = deep;
    while (inner[0]?.type === 'quote') inner = inner[0].children;
    expect(inner).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: `${'>'.repeat(19_975)} **x**` }] },
    ]);
    // The same for a list inside a list inside a list.
    const steps = Array.from({ length: 400 }, (_, i) => `${'  '.repeat(i)}- item`).join('\n');
    expect(() => parseMarkdown(steps)).not.toThrow();
    expect(JSON.stringify(parseMarkdown(steps)).match(/"type":"list"/g)).toHaveLength(25);
  });
});
