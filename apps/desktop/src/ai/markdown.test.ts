import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

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
});
