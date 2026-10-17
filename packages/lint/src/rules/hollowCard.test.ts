import { createElement, richText, type Element, type Frame, type Layout } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { check } from '../testing';
import { emptyHeight } from './hollowCard';

/** A line icon, as the conversion draws one. */
const icon = (id: string, frame: Frame) =>
  createElement.svg({ id, frame, markup: '<svg viewBox="0 0 24 24"/>' });

const words = (id: string, frame: Frame, text = 'Volatility') =>
  createElement.text({ id, frame, content: richText(text) });

/**
 * A card as the conversion makes one (ADR-073): a group whose bottom element is the box, with
 * an icon and a heading over it. Frames inside the group are its own.
 */
function card(n: number, frame: Frame, inside: Element[] = []): Element {
  return createElement.group({
    id: `e_card${n}`,
    frame,
    children: [
      createElement.shape({ id: `e_box${n}`, frame: { x: 0, y: 0, w: frame.w, h: frame.h } }),
      icon(`e_icon${n}`, { x: frame.w - 144, y: 80, w: 96, h: 96 }),
      words(`e_text${n}`, { x: 48, y: 240, w: frame.w - 96, h: 196 }),
      ...inside,
    ],
  });
}

/** Three cards in a row under a title, as tall as the slide's own layout asked. */
const row = (h: number) => [1272, 684, 96].map((x, i) => card(i + 1, { x, y: 240, w: 552, h }));

describe('L18: a card taller than what it holds', () => {
  it('reports cards stretched to the bottom margin, with the height their content needs', () => {
    // The icon starts 80px down; the text ends 436px down: 284px under it, 80 of them padding.
    expect(check('L18', row(720))).toEqual([
      {
        rule: 'L18',
        severity: 'warning',
        slideId: 's_1',
        elementIds: ['e_box1', 'e_box2', 'e_box3'],
        message:
          '3 cards are taller than what they hold: e_box1 is 720px tall and what it holds needs about 516px with its padding (204px, 28%, empty); e_box2 is 720px tall and what it holds needs about 516px with its padding (204px, 28%, empty); e_box3 is 720px tall and what it holds needs about 516px with its padding (204px, 28%, empty). Do not stretch cards to fill the slide: give each the height of its content and padding, then fill the room that frees with content: larger type or icons, a picture or a key figure in each card, a second row, a visual beside the cards, or the row centred under the title. If each card holds only a line or two, the points may read better without boxes.',
      },
    ]);
  });

  it('leaves cards as tall as their content and padding, and a little more', () => {
    expect(check('L18', row(516))).toEqual([]);
    // A fifth of a card may be room: 128px of 644 is, 129px of 645 is not.
    expect(check('L18', row(644))).toEqual([]);
    expect(check('L18', row(645))[0]?.elementIds).toEqual(['e_box1', 'e_box2', 'e_box3']);
    // And 119px always may: a text 48px down a card of 500, with 48 under it and 119 more.
    const plain = (h: number) =>
      createElement.group({
        id: 'e_plain',
        frame: { x: 96, y: 240, w: 552, h: 500 },
        children: [
          createElement.shape({ id: 'e_plain_box', frame: { x: 0, y: 0, w: 552, h: 500 } }),
          words('e_plain_text', { x: 48, y: 48, w: 456, h }),
        ],
      });
    expect(check('L18', [plain(500 - 96 - 119)])).toEqual([]);
    expect(check('L18', [plain(500 - 96 - 120)])).toHaveLength(1);
  });

  it('counts the empty room at the ends of a card, not between the parts of its content', () => {
    // A label at the top and a headline at the foot: a composition.
    const tile = createElement.group({
      id: 'e_tile',
      frame: { x: 96, y: 240, w: 800, h: 700 },
      children: [
        createElement.shape({ id: 'e_tile_box', frame: { x: 0, y: 0, w: 800, h: 700 } }),
        words('e_label', { x: 48, y: 48, w: 704, h: 32 }, 'PART ONE'),
        words('e_head', { x: 48, y: 540, w: 704, h: 112 }, 'In numbers'),
      ],
    });
    expect(check('L18', [tile])).toEqual([]);
    expect(emptyHeight({ x: 0, y: 0, w: 800, h: 700 }, [{ x: 48, y: 48, w: 704, h: 32 }])).toBe(
      620 - 48,
    );
  });

  it('counts content centred in a card twice its height as leaving it empty', () => {
    // 200px of text in the middle of 600: 200 above and below, 96 of each a padding.
    expect(emptyHeight({ x: 0, y: 0, w: 500, h: 600 }, [{ x: 40, y: 200, w: 420, h: 200 }])).toBe(
      208,
    );
    const centred = createElement.group({
      id: 'e_quote',
      frame: { x: 96, y: 240, w: 500, h: 600 },
      children: [
        createElement.shape({ id: 'e_quote_box', frame: { x: 0, y: 0, w: 500, h: 600 } }),
        words('e_quote_text', { x: 40, y: 200, w: 420, h: 200 }),
      ],
    });
    expect(check('L18', [centred])[0]?.message).toMatch(
      /^A card is taller than what it holds: e_quote_box is 600px tall and what it holds needs about 392px/,
    );
  });

  it('judges only a box grouped with what lies on it', () => {
    // The columns of a schedule: rectangles with a label at the top, and nothing grouped.
    const columns = [96, 400].flatMap((x, i) => [
      createElement.shape({ id: `e_col${i}`, frame: { x, y: 240, w: 280, h: 700 } }),
      words(`e_day${i}`, { x: x + 24, y: 264, w: 232, h: 40 }, 'Aug 1–7'),
    ]);
    expect(check('L18', columns)).toEqual([]);
    // A group whose bottom element is not the box of the whole: a badge and a caption.
    const badge = createElement.group({
      id: 'e_badge',
      frame: { x: 96, y: 240, w: 600, h: 700 },
      children: [
        createElement.shape({ id: 'e_dot', frame: { x: 0, y: 0, w: 300, h: 300 } }),
        words('e_caption', { x: 0, y: 660, w: 600, h: 40 }),
      ],
    });
    expect(check('L18', [badge])).toEqual([]);
  });

  it('leaves out what is not a card: a field that bleeds, an outline with nothing drawn, a picture', () => {
    const field = createElement.group({
      id: 'e_field',
      frame: { x: 0, y: 0, w: 640, h: 1080 },
      children: [
        createElement.shape({ id: 'e_field_box', frame: { x: 0, y: 0, w: 640, h: 1080 } }),
        words('e_field_text', { x: 96, y: 96, w: 448, h: 120 }),
      ],
    });
    const blank = card(1, { x: 1272, y: 240, w: 552, h: 720 });
    const box = (blank as { children: Element[] }).children[0]!;
    Object.assign(box, { fill: { kind: 'none' } });
    const photo = card(2, { x: 684, y: 240, w: 552, h: 720 });
    Object.assign((photo as { children: Element[] }).children[0]!, {
      fill: { kind: 'image', assetId: 'c'.repeat(64), fit: 'cover' },
    });
    expect(check('L18', [field, blank, photo])).toEqual([]);
  });

  it("leaves the cards of the slide's layout to the template that sized them (ADR-094)", () => {
    const object = card(9, { x: 96, y: 240, w: 552, h: 720 });
    const layout: Layout = {
      id: 'l_1',
      name: 'Cards',
      archetype: 'cards',
      placeholders: [],
      decorations: [],
      objects: [object],
    };
    // The slide's copy, named after the slide and the object, as `layoutObjects` names it.
    const copy = card(9, { x: 96, y: 240, w: 552, h: 720 });
    const rename = (element: Element): Element => ({
      ...element,
      id: `s_1_${element.id}`,
      ...(element.type === 'group' ? { children: element.children.map(rename) } : {}),
    });
    const options = { slide: { layoutId: 'l_1' }, deck: { layouts: [layout] } };
    expect(check('L18', [rename(copy)], {}, options)).toEqual([]);
    // A card the agent drew on the same slide is still judged.
    expect(
      check('L18', [rename(copy), card(1, { x: 1272, y: 240, w: 552, h: 720 })], {}, options),
    ).toHaveLength(1);
  });
});
