import { createElement, richText, type Frame } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { check, text } from '../testing';

const box = (id: string, frame: Frame, words = 'Three goals') =>
  createElement.text({ id, frame, content: richText(words) });

describe('L06: overlapping text boxes', () => {
  it('reports the two elements and where their text collides', () => {
    const a = box('e_title', { x: 160, y: 140, w: 800, h: 400 });
    const b = box('e_body', { x: 160, y: 500, w: 300, h: 300 }, 'שלוש המטרות');
    expect(check('L06', [a, b])).toEqual([
      {
        rule: 'L06',
        severity: 'error',
        slideId: 's_1',
        elementIds: ['e_title', 'e_body'],
        message:
          'The text of "e_title" and the text of "e_body" are drawn over each other in a 300x40px area (x 160..460, y 500..540). Move or resize one of them so the texts are apart.',
      },
    ]);
  });

  it('looks at the glyphs: frames may overlap while the text stays apart', () => {
    const a = box('e_title', { x: 160, y: 140, w: 1600, h: 400 });
    const b = box('e_body', { x: 160, y: 300, w: 1600, h: 600 });
    expect(
      check('L06', [a, b], {
        e_title: { box: a.frame, text: text({ x: 160, y: 140, w: 700, h: 80 }) },
        e_body: { box: b.frame, text: text({ x: 160, y: 300, w: 900, h: 200 }) },
      }),
    ).toEqual([]);
  });

  it('needs more than two pixels on both axes', () => {
    const a = box('e_a', { x: 100, y: 100, w: 400, h: 100 });
    expect(check('L06', [a, box('e_b', { x: 100, y: 200, w: 400, h: 100 })])).toEqual([]);
    expect(check('L06', [a, box('e_b', { x: 100, y: 198, w: 400, h: 100 })])).toEqual([]);
    expect(check('L06', [a, box('e_b', { x: 498, y: 100, w: 400, h: 100 })])).toEqual([]);
    expect(check('L06', [a, box('e_b', { x: 100, y: 197, w: 400, h: 100 })])).toHaveLength(1);
  });

  it('counts the text inside a shape, and not a shape without text', () => {
    const card = createElement.shape({
      id: 'e_card',
      frame: { x: 100, y: 100, w: 600, h: 300 },
      content: richText('Card'),
    });
    const panel = createElement.shape({ id: 'e_panel', frame: { x: 0, y: 0, w: 900, h: 600 } });
    const label = box('e_label', { x: 300, y: 200, w: 300, h: 60 });
    expect(check('L06', [panel, card, label]).map((f) => f.elementIds)).toEqual([
      ['e_card', 'e_label'],
    ]);
  });

  it('reports every pair', () => {
    const frame = { x: 100, y: 100, w: 400, h: 100 };
    const findings = check('L06', [box('e_a', frame), box('e_b', frame), box('e_c', frame)]);
    expect(findings.map((f) => f.elementIds)).toEqual([
      ['e_a', 'e_b'],
      ['e_a', 'e_c'],
      ['e_b', 'e_c'],
    ]);
  });

  it('ignores an empty text box and a hidden one', () => {
    const frame = { x: 100, y: 100, w: 400, h: 100 };
    const empty = createElement.text({ id: 'e_empty', frame, content: richText('') });
    const hidden = { ...box('e_hidden', frame), hidden: true };
    expect(check('L06', [box('e_a', frame), empty, hidden])).toEqual([]);
  });
});
