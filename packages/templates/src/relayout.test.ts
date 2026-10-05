import { createElement, type Paragraph, type Placeholder } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { followPatch } from './relayout';

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
