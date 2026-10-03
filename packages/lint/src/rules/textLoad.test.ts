import { createElement, richText, type Paragraph } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { check } from '../testing';
import { countWords } from '../text';

const frame = { x: 160, y: 340, w: 1600, h: 600 };
const words = (n: number, word: string) => Array.from({ length: n }, () => word).join(' ');
const prose = (id: string, content: string) =>
  createElement.text({ id, frame, content: richText(content) });

function list(items: string[], level = 0): Paragraph[] {
  return items.map((item) => ({
    dir: 'auto',
    align: 'start',
    list: { kind: 'bullet', level },
    runs: [{ text: item }],
  }));
}
const bullets = (id: string, paragraphs: Paragraph[]) =>
  createElement.text({ id, frame, content: { paragraphs } });

describe('countWords', () => {
  it('counts words in English, in Hebrew and in a mix of both', () => {
    expect(countWords('Ship the new editor')).toBe(4);
    expect(countWords('להשיק את העורך החדש')).toBe(4);
    expect(countWords('ה-API החדש עלה ל-production ב-12.10.')).toBe(5);
    expect(countWords('זמן התגובה ירד מ-480ms ל-190ms (‎-60%).')).toBe(6);
  });

  it('counts a URL once and punctuation not at all', () => {
    expect(countWords('See https://docs.example.com/api/v2 — now')).toBe(3);
    expect(countWords(' •  —  ... ')).toBe(0);
    expect(countWords('')).toBe(0);
    expect(countWords('87%')).toBe(1);
  });
});

describe('L13: too much text', () => {
  it('draws the line after 60 words, in English and in Hebrew', () => {
    expect(check('L13', [prose('e_body', words(60, 'word'))])).toEqual([]);
    expect(check('L13', [prose('e_body', words(60, 'מילה'))])).toEqual([]);
    expect(check('L13', [prose('e_body', words(61, 'מילה'))])).toEqual([
      {
        rule: 'L13',
        severity: 'warning',
        slideId: 's_1',
        elementIds: ['e_body'],
        message:
          'The slide has 61 words (the limit is 60). Split it into two slides, or turn part of the text into a visual.',
      },
    ]);
  });

  it('adds up every text on the slide, the heaviest first', () => {
    const elements = [
      prose('e_title', words(5, 'title')),
      prose('e_body', words(40, 'body')),
      createElement.shape({ id: 'e_card', frame, content: richText(words(20, 'card')) }),
    ];
    const [finding] = check('L13', elements);
    expect(finding?.elementIds).toEqual(['e_body', 'e_card', 'e_title']);
    expect(finding?.message).toMatch(/^The slide has 65 words/);
  });

  it('draws the line after 6 bullets, at any level and across boxes', () => {
    const six = list(['one', 'two', 'three', 'four', 'five', 'six']);
    expect(check('L13', [bullets('e_list', six)])).toEqual([]);
    const [finding] = check('L13', [bullets('e_list', six), bullets('e_more', list(['שבע'], 1))]);
    expect(finding?.message).toBe(
      'The slide has 7 bullets (the limit is 6). Split it into two slides, or turn part of the text into a visual.',
    );
  });

  it('does not count an empty bullet or a plain paragraph', () => {
    const paragraphs = [
      ...list(['one', 'two', 'three', 'four', 'five', 'six', '', '  ']),
      ...richText('A closing line').paragraphs,
    ];
    expect(check('L13', [bullets('e_list', paragraphs)])).toEqual([]);
  });

  it('reports words and bullets together', () => {
    const many = list(Array.from({ length: 8 }, () => words(10, 'מילה')));
    expect(check('L13', [bullets('e_list', many)])[0]?.message).toMatch(
      /^The slide has 80 words \(the limit is 60\) and 8 bullets \(the limit is 6\)\./,
    );
  });

  it('counts the text of free HTML, and not table cells, hidden elements or notes', () => {
    const html = createElement.html({
      id: 'e_html',
      frame,
      markup: `<style>.a { color: red }</style><p class="a">${words(30, 'html')}</p><b>שלום&nbsp;עולם</b>`,
    });
    const table = createElement.table({
      id: 'e_table',
      frame,
      rows: [100],
      cols: [800, 800],
      dir: 'ltr',
      cells: [[{ content: richText(words(50, 'cell')) }, { content: richText('x') }]],
    });
    const hidden = { ...prose('e_hidden', words(50, 'hidden')), hidden: true };
    const elements = [html, table, hidden, prose('e_body', words(28, 'body'))];
    const notes = richText(words(100, 'note'));
    expect(check('L13', elements, {}, { slide: { notes } })).toEqual([]);
    expect(check('L13', [...elements, prose('e_one', 'more')])[0]?.message).toMatch(/61 words/);
  });
});
