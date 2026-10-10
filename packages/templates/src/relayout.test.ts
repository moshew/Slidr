import {
  createElement,
  createSlide,
  richText,
  type Layout,
  type Paragraph,
  type Placeholder,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { arrivalsOf, followPatch, relayout, sitsOn } from './relayout';

const frame = { x: 96, y: 80, w: 800, h: 100 };
const seat = (align: NonNullable<Placeholder['align']>): Placeholder => ({
  id: 'p',
  role: 'body',
  frame,
  align,
});
const text = (words: string, align: Paragraph['align']) =>
  createElement.text({
    frame,
    role: 'body',
    content: { paragraphs: [{ dir: 'auto', align, runs: [{ text: words }] }] },
  });
const aligned = (patch: Record<string, unknown>) =>
  (patch.content as { paragraphs: Paragraph[] } | undefined)?.paragraphs[0]!.align;

describe('the frame an element takes from its new placeholder', () => {
  const from: Placeholder = { id: 'p_from', role: 'body', frame };
  const to: Placeholder = { id: 'p_to', role: 'body', frame: { x: 200, y: 600, w: 1000, h: 60 } };
  const at = (own: Partial<typeof frame>) => ({
    ...text('שלום', 'start'),
    frame: { ...frame, ...own },
  });

  it('is the placeholder’s, for an element that sat on the old one', () => {
    expect(followPatch(at({}), { from, to }, 'rtl').frame).toEqual(to.frame);
    expect(sitsOn(at({}), from)).toBe(true);
  });

  it('keeps the height of a text box that grew to hold its text, and still goes with the seat', () => {
    // What the fix of an overflowing text leaves, or a pull on the foot of the box.
    const grown = at({ h: 180 });
    expect(sitsOn(grown, from)).toBe(true);
    const there = followPatch(grown, { from, to }, 'rtl');
    expect(there.frame).toEqual({ x: 200, y: 600, w: 1000, h: 180 });
    // There and back: the box it was.
    const moved = { ...grown, frame: there.frame as typeof frame };
    expect(followPatch(moved, { from: to, to: from }, 'rtl').frame).toEqual(grown.frame);
  });

  it('goes with the seat for a table that grew with its rows', () => {
    const table = createElement.table({
      role: 'table',
      frame: { ...frame, h: 340 },
      rows: [170, 170],
      cols: [800],
      dir: 'rtl',
      cells: [[{ content: richText('א') }], [{ content: richText('ב') }]],
    });
    expect(followPatch(table, { from, to }).frame).toEqual({ ...to.frame, h: 340 });
  });

  it('stays where it is for a box that was moved, or made wider', () => {
    for (const own of [{ x: 100 }, { y: 90 }, { w: 700 }, { y: 60, h: 120 }]) {
      expect(sitsOn(at(own), from)).toBe(false);
      expect(followPatch(at(own), { from, to }, 'rtl')).toEqual({});
    }
  });

  it('stays where it is for a picture whose height was changed: that is a resize by hand', () => {
    const picture = createElement.image({ role: 'image', frame: { ...frame, h: 180 } });
    expect(sitsOn(picture, from)).toBe(false);
    expect(followPatch(picture, { from, to })).toEqual({});
  });
});

describe('what a paragraph takes from its new placeholder', () => {
  it('follows the new alignment when it had the old one', () => {
    const move = { from: seat('start'), to: seat('center') };
    expect(aligned(followPatch(text('שלום', 'start'), move, 'rtl'))).toBe('center');
  });

  it('keeps an alignment that was set by hand', () => {
    const move = { from: seat('start'), to: seat('center') };
    expect(followPatch(text('שלום', 'end'), move, 'rtl')).toEqual({});
  });

  it('follows too when it reads against the deck, and its alignment was turned for the seat', () => {
    // An English line in a Hebrew deck sits on a `start` seat as `end`: on the right.
    const latin = text('Platform team', 'end');
    expect(aligned(followPatch(latin, { from: seat('start'), to: seat('center') }, 'rtl'))).toBe(
      'center',
    );
    // On an `end` seat it goes to the left with the Hebrew lines: `start` in its own direction.
    expect(aligned(followPatch(latin, { from: seat('start'), to: seat('end') }, 'rtl'))).toBe(
      'start',
    );
    // The same side on both: nothing to change.
    expect(followPatch(latin, { from: seat('start'), to: seat('start') }, 'rtl')).toEqual({});
    // Without the deck's direction it counts as set by hand, as before.
    expect(followPatch(latin, { from: seat('start'), to: seat('center') })).toEqual({});
  });

  it('lands on the side the new seat means when it comes from a centred seat', () => {
    // Centred, a line is centred whichever way it reads. On a `start` seat of a Hebrew deck the
    // English line is `end`, as it is when a slide is made with it.
    const latin = text('Steve Jobs, Apple', 'center');
    expect(aligned(followPatch(latin, { from: seat('center'), to: seat('start') }, 'rtl'))).toBe(
      'end',
    );
    expect(aligned(followPatch(latin, { from: seat('center'), to: seat('end') }, 'rtl'))).toBe(
      'start',
    );
    // A line that reads with the deck takes the seat's alignment as it is.
    const hebrew = text('עיצוב הוא איך שזה עובד', 'center');
    expect(aligned(followPatch(hebrew, { from: seat('center'), to: seat('start') }, 'rtl'))).toBe(
      'start',
    );
    // In an English deck it is the Hebrew line that is turned.
    expect(aligned(followPatch(hebrew, { from: seat('center'), to: seat('start') }, 'ltr'))).toBe(
      'end',
    );
    expect(aligned(followPatch(latin, { from: seat('center'), to: seat('start') }, 'ltr'))).toBe(
      'start',
    );
  });

  it('there and back through a centred seat gives a turned paragraph its alignment back', () => {
    const latin = text('I', 'end');
    const there = followPatch(latin, { from: seat('start'), to: seat('center') }, 'rtl');
    expect(aligned(there)).toBe('center');
    const centred = { ...latin, content: there.content as (typeof latin)['content'] };
    const back = followPatch(centred, { from: seat('center'), to: seat('start') }, 'rtl');
    expect(aligned(back)).toBe('end');
  });
});

describe('the colour a placeholder gives its text', () => {
  const ink = { token: 'bg' } as const;
  const second = { x: 96, y: 300, w: 800, h: 100 };
  const plain: Placeholder = { id: 'p_plain', role: 'body', frame };
  const onCard: Placeholder = { id: 'p_card', role: 'body', frame, color: ink };
  const layout = (id: string, placeholders: Placeholder[]): Layout => ({
    id,
    name: id,
    archetype: 'cards',
    placeholders,
    decorations: [],
  });

  it('comes with the seat, and goes with it', () => {
    const bare = text('שלום', 'start');
    expect(followPatch(bare, { from: plain, to: onCard }, 'rtl')).toEqual({ color: ink });
    const seated = { ...bare, color: ink };
    expect(followPatch(seated, { from: onCard, to: plain }, 'rtl')).toEqual({ color: null });
    expect(followPatch(seated, { from: onCard, to: onCard }, 'rtl')).toEqual({});
  });

  it('stays when the text did not take it from its seat', () => {
    const own = { ...text('שלום', 'start'), color: { token: 'accent' } as const };
    expect(followPatch(own, { from: onCard, to: plain }, 'rtl')).toEqual({});
    expect(followPatch(own, { from: plain, to: onCard }, 'rtl')).toEqual({});
  });

  it('is taken off text the new layout has no seat for, and back on text that stands on a seat', () => {
    const cards = layout('l_cards', [
      onCard,
      { id: 'p_card2', role: 'body', frame: second, color: ink },
    ]);
    const one = layout('l_text', [plain]);
    const first = { ...text('א', 'start'), id: 'e_a' };
    const other = { ...text('ב', 'start'), id: 'e_b', frame: second };
    const update = (elementId: string, color: unknown) => ({
      type: 'element.update',
      slideId: 's',
      elementId,
      patch: { color },
    });

    // The layout with one seat takes the first text. The second stays where its card was, and
    // the card is gone: its text is the slide's again.
    const onCards = createSlide({
      id: 's',
      layoutId: 'l_cards',
      elements: [
        { ...first, color: ink },
        { ...other, color: ink },
      ],
    });
    expect(relayout(onCards, cards, one, 'rtl')).toEqual([
      update('e_a', null),
      update('e_b', null),
    ]);

    // Back on the cards the first follows its seat, and the second already stands on the other.
    const onText = createSlide({ id: 's', layoutId: 'l_text', elements: [first, other] });
    expect(relayout(onText, one, cards, 'rtl')).toEqual([update('e_a', ink), update('e_b', ink)]);
    expect([...arrivalsOf(onText, one, cards)]).toEqual([['e_b', cards.placeholders[1]]]);
  });
});
