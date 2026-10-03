// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { countParts, paragraphsOf, sameFlow, splitText } from './text';

// happy-dom has no layout: every rectangle is empty, so a split always passes its own check and
// the parts are boxes. Whether real text keeps its lines is tested in a browser (e2e).

let element: HTMLElement;

function render(html: string): HTMLElement {
  element = document.createElement('div');
  element.innerHTML = html;
  document.body.replaceChildren(element);
  return element;
}

const partTexts = (el: HTMLElement) =>
  Array.from(el.querySelectorAll('[data-slidr-part]'), (p) => p.textContent);

beforeEach(() => document.body.replaceChildren());

describe('paragraphsOf', () => {
  it('finds paragraphs, list items and headings, and skips empty ones', () => {
    render('<h1>Title</h1><p>One</p><p><br></p><ul><li>Two</li><li> </li></ul>');
    expect(paragraphsOf(element).map((p) => p.textContent)).toEqual(['Title', 'One', 'Two']);
  });
});

describe('splitText', () => {
  it('wraps every word and leaves the spaces between them', () => {
    render('<p>one two  three</p>');
    const split = splitText(element, 'word');
    expect(split.parts.map((p) => p.node.textContent)).toEqual(['one', 'two', 'three']);
    expect(element.textContent).toBe('one two  three');
    expect(split.parts.every((p) => p.box)).toBe(true);
  });

  it('makes inline parts when no boxes are asked for', () => {
    render('<p>one two</p>');
    const split = splitText(element, 'word', false);
    expect(split.parts.map((p) => p.box)).toEqual([false, false]);
    expect(split.parts.map((p) => p.node.style.display)).toEqual(['', '']);
    expect(split.parts[0]?.node.style.position).toBe('relative');
  });

  it('wraps every character inside an unbreakable word', () => {
    render('<p>ab cd</p>');
    const split = splitText(element, 'char');
    expect(split.parts.map((p) => p.node.textContent)).toEqual(['a', 'b', 'c', 'd']);
    const words = Array.from(element.querySelectorAll('p > span'));
    expect(words.map((w) => w.textContent)).toEqual(['ab', 'cd']);
  });

  it('keeps a letter and its marks together', () => {
    render('<p>שָׁלוֹם</p>');
    expect(splitText(element, 'char').parts.map((p) => p.node.textContent)).toEqual([
      'שָׁ',
      'ל',
      'וֹ',
      'ם',
    ]);
  });

  it('gives every part of a marked run a copy of the run, spaces included', () => {
    render('<p>plain <span style="text-decoration-line: underline">two words</span> end</p>');
    const split = splitText(element, 'word');
    expect(partTexts(element)).toEqual(['plain', 'two ', 'words', 'end']);
    const second = split.parts[1]?.node;
    expect(second?.firstElementChild?.getAttribute('style')).toContain('underline');
    // The run itself is out of the document while its words are animated.
    expect(element.querySelectorAll('p > span[style*="underline"]')).toHaveLength(0);
    expect(element.textContent).toBe('plain two words end');
  });

  it('takes the list marker as the first part of its paragraph', () => {
    render('<ul><li><span data-slidr-marker>•</span>first item</li></ul>');
    const split = splitText(element, 'word');
    expect(split.parts.map((p) => p.node.textContent)).toEqual(['•', 'first', 'item']);
    expect(element.querySelectorAll('[data-slidr-part]')).toHaveLength(2);
  });

  it('puts the very same nodes back', () => {
    render('<p>one <a href="#x">two three</a> four</p><p>five</p>');
    const before = element.innerHTML;
    const link = element.querySelector('a');
    const text = element.querySelector('p')?.firstChild;
    const split = splitText(element, 'char');
    expect(element.innerHTML).not.toBe(before);
    split.restore();
    expect(element.innerHTML).toBe(before);
    expect(element.querySelector('a')).toBe(link);
    expect(element.querySelector('p')?.firstChild).toBe(text);
  });

  it('counts the parts it would make without touching the document', () => {
    render('<ul><li><span data-slidr-marker>1.</span>ab cd</li></ul><p>e <b>f g</b></p>');
    const before = element.innerHTML;
    expect(countParts(element, 'word')).toBe(6);
    expect(countParts(element, 'char')).toBe(8);
    expect(element.innerHTML).toBe(before);
    expect(splitText(element, 'word').parts).toHaveLength(6);
  });
});

describe('sameFlow', () => {
  const at = (left: number, top: number) => ({ left, top, height: 20 });

  it('accepts parts that only shifted a little', () => {
    expect(sameFlow([at(0, 0), at(50, 0), at(0, 30)], [at(0, 0), at(52, 0), at(1, 30)])).toBe(true);
  });

  it('rejects a part that moved to another line', () => {
    expect(sameFlow([at(0, 0), at(50, 0)], [at(0, 0), at(0, 30)])).toBe(false);
  });

  it('rejects neighbours that swapped, as English words do inside a Hebrew line', () => {
    expect(sameFlow([at(100, 0), at(110, 0)], [at(110, 0), at(100, 0)])).toBe(false);
  });

  it('rejects a part that drifted far along its line', () => {
    expect(sameFlow([at(0, 0), at(50, 0)], [at(0, 0), at(90, 0)])).toBe(false);
  });
});
