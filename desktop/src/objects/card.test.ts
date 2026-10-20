import {
  CommandBus,
  createBaseTheme,
  createDeck,
  createElement,
  createSlide,
  Element,
  richText,
  type GroupElement,
  type ShapeElement,
  type TextElement,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { cardBox, newCard } from './card';
import { en, he } from './messages';

const slide = { w: 1920, h: 1080 };
const theme = createBaseTheme();
const words = { heading: 'כותרת', body: 'כמה מילים' };

const frame = { x: 300, y: 200, w: 400, h: 240 };
const box = (extra: Partial<Parameters<typeof createElement.shape>[0]> = {}) =>
  createElement.shape({
    frame: { x: 0, y: 0, w: 400, h: 240 },
    geometry: { kind: 'preset', preset: 'rect' },
    ...extra,
  });
const label = () =>
  createElement.text({ frame: { x: 24, y: 24, w: 352, h: 60 }, content: richText('שלום') });
const group = (children: GroupElement['children'], at = frame) =>
  createElement.group({ frame: at, children });

describe('cardBox', () => {
  it('is the first child of a group, when it is a box that takes the whole of the group', () => {
    const first = box();
    expect(cardBox(group([first, label()]))).toBe(first);
    for (const preset of ['roundRect', 'ellipse']) {
      const other = box({ geometry: { kind: 'preset', preset } });
      expect(cardBox(group([other, label()])), preset).toBe(other);
    }
  });

  it('allows the box a pixel of the group, as a converted slide leaves', () => {
    const off = box({ frame: { x: 0.4, y: 0.015625, w: 399.2, h: 239.6 } });
    expect(cardBox(group([off, label()]))).toBe(off);
    const short = box({ frame: { x: 0, y: 0, w: 398, h: 240 } });
    expect(cardBox(group([short, label()]))).toBeUndefined();
  });

  it('is not a box that is only a part of the group', () => {
    // A badge that hangs over the corner makes the group larger than the box.
    const badge = createElement.shape({
      frame: { x: 380, y: -20, w: 60, h: 60 },
      geometry: { kind: 'preset', preset: 'ellipse' },
    });
    const wide = { x: 300, y: 180, w: 440, h: 260 };
    const inside = box({ frame: { x: 0, y: 20, w: 400, h: 240 } });
    expect(cardBox(group([inside, label(), badge], wide))).toBeUndefined();
  });

  it('is not a box that lies over the rest, a shape without sides, or a turned box', () => {
    expect(cardBox(group([label(), box()]))).toBeUndefined();
    const star = box({ geometry: { kind: 'preset', preset: 'star5' } });
    expect(cardBox(group([star, label()]))).toBeUndefined();
    expect(cardBox(group([box({ rotation: 90 }), label()]))).toBeUndefined();
  });

  it('is nothing for an element that is not a group, and for an empty group', () => {
    expect(cardBox(box())).toBeUndefined();
    expect(cardBox(label())).toBeUndefined();
    expect(cardBox(group([]))).toBeUndefined();
  });
});

describe('newCard', () => {
  const card = newCard(slide, theme, words);
  const [first, second] = card.children as [ShapeElement, TextElement];

  it('is a valid group of a box and one text box, which the model takes as one element', () => {
    expect(Element.safeParse(card).success).toBe(true);
    expect(card.children.map((child) => child.type)).toEqual(['shape', 'text']);
    const ids = [card.id, ...card.children.map((child) => child.id)];
    expect(new Set(ids).size).toBe(3);

    const bus = new CommandBus(createDeck({ slides: [createSlide({ id: 's1' })] }), {
      validate: true,
    });
    bus.dispatch({ type: 'element.add', slideId: 's1', element: card });
    expect(bus.deck.slides[0]?.elements).toEqual([card]);
    // One step puts it there, and one undo takes all of it away.
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck.slides[0]?.elements).toEqual([]);
  });

  it('is a card: the box is the first child and takes the frame of the group', () => {
    expect(cardBox(card)).toBe(first);
    expect(first.frame).toEqual({ x: 0, y: 0, w: card.frame.w, h: card.frame.h });
    expect(card).toMatchObject({ rotation: 0, opacity: 1 });
  });

  it('lands in the middle of the slide, and steps aside from one that is already there', () => {
    const { x, y, w, h } = card.frame;
    expect(Math.abs(x + w / 2 - 960)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(y + h / 2 - 540)).toBeLessThanOrEqual(0.5);
    const next = newCard(slide, theme, words, [card.frame]);
    expect(next.frame).toMatchObject({ x: x + 24, y: y + 24, w, h });
    // The children count from the corner of the group, wherever the group is.
    expect(next.children.map((child) => child.frame)).toEqual(
      card.children.map((child) => child.frame),
    );
  });

  it('paints the box in the theme: surface, a thin outline, its corners, a primary top', () => {
    expect(first.geometry).toEqual({ kind: 'preset', preset: 'rect' });
    expect(first.fill).toEqual({ kind: 'solid', color: { token: 'surface' } });
    expect(first.stroke).toEqual({ color: { token: 'text', alpha: 0.16 }, width: 2 });
    expect(first.effects).toEqual({ radius: theme.radius });
    expect(first.accent).toEqual({
      side: 'top',
      size: 8,
      fill: { kind: 'solid', color: { token: 'primary' } },
    });
    // A theme of square corners gets a square card, with no empty effects on it.
    const square = newCard(slide, { ...theme, radius: 0 }, words);
    expect(square.children[0]).not.toHaveProperty('effects');
  });

  it('holds a heading and a paragraph in the theme styles, starting where the text starts', () => {
    expect(second.content.paragraphs).toEqual([
      {
        dir: 'auto',
        align: 'start',
        styleRef: 'heading',
        spaceAfter: 12,
        runs: [{ text: 'כותרת' }],
      },
      { dir: 'auto', align: 'start', styleRef: 'body', runs: [{ text: 'כמה מילים' }] },
    ]);
    expect(second).toMatchObject({ vAlign: 'top', autoFit: 'none' });
  });

  it('leaves the same margin around the text on every side, under the accent', () => {
    const { x, y, w, h } = second.frame;
    const accent = first.accent!.size;
    const margins = [x, y - accent, card.frame.w - (x + w), card.frame.h - (y + h)];
    expect(margins).toEqual([40, 40, 40, 40]);
  });

  it('is as tall as its lines are in the theme it is made for', () => {
    const { heading, body } = theme.textStyles;
    const lines = heading.size * heading.lineHeight + 12 + 2 * body.size * body.lineHeight;
    expect(second.frame.h).toBe(Math.ceil(lines));
    const large = {
      ...theme,
      textStyles: { ...theme.textStyles, body: { ...body, size: 48 } },
    };
    expect(newCard(slide, large, words).frame.h).toBeGreaterThan(card.frame.h);
  });
});

describe('the words of a new card', () => {
  it('are there in both languages, each in its own', () => {
    const hebrew = /\p{Script=Hebrew}/u;
    for (const key of ['title', 'heading', 'body'] as const) {
      expect(he.card[key], key).toMatch(hebrew);
      expect(en.card[key], key).not.toMatch(hebrew);
      expect(en.card[key], key).not.toBe('');
    }
    expect(he.library.cards).toMatch(hebrew);
    expect(en.library.cards).not.toMatch(hebrew);
  });
});
