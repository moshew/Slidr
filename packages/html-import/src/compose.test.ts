import { createDeck, createElement, type Paragraph, type TextElement } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { elementsOf, settle, type Made, type Part } from './compose';
import type { Item } from './convert';
import type { Line } from './css';

// The parts of the composition that need no page: holding a composed text to the lines it
// drew, and nesting elements into groups. What is put together, and when, is measured on real
// pages in `compose.browser.test.ts`.

const theme = createDeck({ lang: 'en' }).theme;

function item(element: Item['element']): Item {
  return {
    element,
    node: undefined as unknown as Element,
    covers: 'subtree',
    region: { x: 0, y: 0, w: 0, h: 0 },
    scaled: false,
    units: 1,
    chars: 0,
    z: { path: [], seq: 0 },
    emitted: 0,
    inheritedOpacity: 1,
    parentScale: 1,
  };
}

const paragraph = (text: string, more: Partial<Paragraph> = {}): Paragraph => ({
  dir: 'ltr',
  align: 'start',
  lineHeight: 1.2,
  runs: [{ text, marks: { size: 40 } }],
  ...more,
});

const line = (top: number, left = 100, right = 500): Line => ({
  left,
  right,
  top,
  bottom: top + 46,
});

/** A text box of two joined texts: one line each, the second 20px under the box of the first. */
function joined() {
  const element = createElement.text({
    id: 'e_joined',
    frame: { x: 100, y: 200, w: 600, h: 116 },
    content: { paragraphs: [paragraph('First'), paragraph('Second', { spaceBefore: 20 })] },
  });
  const how: Made = {
    kind: 'text',
    of: [],
    lines: [line(201), line(269)],
    starts: [
      { line: 0, paragraph: 0 },
      { line: 1, paragraph: 1 },
    ],
  };
  return { made: item(element), element, how };
}

describe('settle', () => {
  it('leaves a text whose lines are where they were', () => {
    const { made, how, element } = joined();
    expect(settle(made, how, how.lines, theme)).toBe('settled');
    expect(element.frame.y).toBe(200);
    expect(element.content.paragraphs[1]!.spaceBefore).toBe(20);
  });

  it('moves the box when every line is off by the same', () => {
    const { made, how, element } = joined();
    expect(settle(made, how, [line(202.5), line(270.5)], theme)).toBe('moved');
    expect(element.frame.y).toBe(198.5);
    expect(element.content.paragraphs[1]!.spaceBefore).toBe(20);
  });

  it('takes the space before a paragraph that starts too low, and gives it to one too high', () => {
    const low = joined();
    expect(settle(low.made, low.how, [line(201), line(272)], theme)).toBe('moved');
    expect(low.element.content.paragraphs[1]!.spaceBefore).toBe(17);
    expect(low.element.frame.y).toBe(200);
    const high = joined();
    expect(settle(high.made, high.how, [line(201), line(264.5)], theme)).toBe('moved');
    expect(high.element.content.paragraphs[1]!.spaceBefore).toBe(24.5);
  });

  it('makes the one line above lower when there is no space left to take, and keeps its text in place', () => {
    const { made, how, element } = joined();
    // 26px too low with 20px of space before it: 6px have to come out of the line above.
    expect(settle(made, how, [line(201), line(295)], theme)).toBe('moved');
    const [first, second] = element.content.paragraphs;
    expect(second!.spaceBefore).toBeUndefined();
    // Its box loses twice what was over (40 * 1.2 = 48, less 12), and goes down by what was
    // over: half of what a line box loses is above its text.
    expect(first!.lineHeight).toBeCloseTo(36 / 40, 4);
    expect(element.frame.y).toBe(206);
  });

  it('refuses a text that is laid out another way', () => {
    const wrapped = joined();
    expect(settle(wrapped.made, wrapped.how, [line(201), line(269), line(315)], theme)).toBe(
      'refused',
    );
    const aside = joined();
    expect(settle(aside.made, aside.how, [line(201), line(269, 103, 503)], theme)).toBe('refused');
    const wider = joined();
    expect(settle(wider.made, wider.how, [line(201), line(269, 100, 520)], theme)).toBe('refused');
    // A text of several lines whose own lines are spaced differently has nothing to give.
    const paced = joined();
    paced.how.starts = [{ line: 0, paragraph: 0 }];
    expect(settle(paced.made, paced.how, [line(201), line(272)], theme)).toBe('refused');
  });

  it('leans the text of a shape through the room around it', () => {
    const shape = createElement.shape({
      id: 'e_label',
      frame: { x: 100, y: 100, w: 200, h: 100 },
      content: { paragraphs: [paragraph('7', { align: 'center' })] },
      padding: { top: 10, right: 20, bottom: 10, left: 20 },
    });
    const how: Made = {
      kind: 'label',
      of: [],
      lines: [line(127, 190, 210)],
      starts: [{ line: 0, paragraph: 0 }],
    };
    const made = item(shape);
    // Two pixels low, and one to the right of where it was.
    expect(settle(made, how, [line(129, 191, 211)], theme)).toBe('moved');
    expect(shape.padding).toEqual({ top: 8, right: 21, bottom: 12, left: 19 });
    expect(settle(made, how, how.lines, theme)).toBe('settled');
  });

  it('gives the room on one side only where the other has none left', () => {
    const shape = createElement.shape({
      id: 'e_tight',
      frame: { x: 100, y: 100, w: 200, h: 60 },
      content: { paragraphs: [paragraph('7', { align: 'center' })] },
      padding: { top: 1, right: 0, bottom: 1, left: 0 },
    });
    const how: Made = {
      kind: 'label',
      of: [],
      lines: [line(107, 190, 210)],
      starts: [{ line: 0, paragraph: 0 }],
    };
    expect(settle(item(shape), how, [line(110, 190, 210)], theme)).toBe('moved');
    expect(shape.padding).toEqual({ top: 0, right: 0, bottom: 6, left: 0 });
  });
});

describe('elementsOf', () => {
  const box = createElement.shape({
    id: 'e_box',
    name: 'pricing',
    frame: { x: 300.37, y: 200.5, w: 400, h: 240 },
  });
  const words = createElement.text({
    id: 'e_words',
    frame: { x: 340.37, y: 236.2, w: 320, h: 80 },
    content: { paragraphs: [paragraph('On the card')] },
  });
  const chip = createElement.shape({
    id: 'e_chip',
    frame: { x: 340.37, y: 380, w: 90, h: 30 },
    content: { paragraphs: [paragraph('New')] },
  });
  const parts: Part[] = [
    {
      item: item(
        createElement.text({ ...words, id: 'e_title', frame: { x: 0, y: 0, w: 9, h: 9 } }),
      ),
    },
    {
      item: item(box),
      group: { id: 'e_card', parts: [{ item: item(words) }, { item: item(chip) }] },
    },
  ];

  it('nests what lies on a box in a group, counted from the corner of the group', () => {
    const [title, card] = elementsOf(parts);
    expect(title!.id).toBe('e_title');
    expect(card).toMatchObject({ id: 'e_card', type: 'group', name: 'pricing' });
    const children = card!.type === 'group' ? card.children : [];
    expect(children.map((c) => c.id)).toEqual(['e_box', 'e_words', 'e_chip']);
    // The name the page gave the box is the group's, and no longer the box's.
    expect(children[0]!.name).toBeUndefined();
    for (const [index, child] of [box, words, chip].entries()) {
      expect(card!.frame.x + children[index]!.frame.x).toBeCloseTo(child.frame.x, 9);
      expect(card!.frame.y + children[index]!.frame.y).toBeCloseTo(child.frame.y, 9);
      expect(children[index]!.frame.w).toBe(child.frame.w);
    }
    expect((children[1] as TextElement).content).toBe(words.content);
  });

  it('puts the corner of a group on the grid a browser lays boxes out on', () => {
    const [, card] = elementsOf(parts);
    // 300.37 is not a 64th of a pixel; the corner is the 64th at or before it.
    expect((card!.frame.x * 64) % 1).toBe(0);
    expect(card!.frame.x).toBeLessThanOrEqual(300.37);
    expect(300.37 - card!.frame.x).toBeLessThan(1 / 64);
    expect(card!.frame.y).toBe(200.5);
    // And the group still reaches the far edges of what is in it.
    expect(card!.frame.x + card!.frame.w).toBeCloseTo(700.37, 9);
    expect(card!.frame.y + card!.frame.h).toBeCloseTo(440.5, 9);
  });
});
