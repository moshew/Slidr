import { describe, expect, it } from 'vitest';
import { createElement } from './factories';
import { frameLayout, imageOpening, imageOpeningFrame, placedInFrame } from './imageFrame';
import { ImageElement, type SmartImageFrame } from './schema';

/**
 * An instant photo: a card of 400 by 480 with the photograph in a square near its top, drawn
 * at twice its size.
 */
const card = (opening = { x: 26, y: 26, w: 348, h: 348 }): SmartImageFrame => ({
  viewBox: { w: 400, h: 480 },
  opening,
  scale: 2,
  decorations: [
    createElement.shape({
      id: 'e_card',
      frame: { x: 0, y: 0, w: 400, h: 480 },
      geometry: { kind: 'path', d: 'M0 0L400 0L400 480L0 480Z', viewBox: { w: 400, h: 480 } },
      fill: { kind: 'solid', color: { value: '#ffffff' } },
    }),
  ],
});

const picture = (more: Partial<ImageElement> = {}) =>
  createElement.image({ id: 'e_photo', frame: { x: 100, y: 200, w: 800, h: 960 }, ...more });

describe('the opening of a picture', () => {
  it('is the whole picture when nothing is drawn around it', () => {
    expect(imageOpening(picture())).toEqual({ x: 0, y: 0, w: 800, h: 960 });
    expect(imageOpeningFrame(picture())).toEqual({ x: 100, y: 200, w: 800, h: 960 });
  });

  it('is the opening of its artwork, at the size the picture is drawn', () => {
    const framed = picture({ smartFrame: card() });
    // The artwork is drawn at twice its own size.
    expect(imageOpening(framed)).toEqual({ x: 52, y: 52, w: 696, h: 696 });
    expect(imageOpeningFrame(framed)).toEqual({ x: 152, y: 252, w: 696, h: 696 });
  });

  it('follows the picture when it is mirrored or turned', () => {
    // The opening is above the middle of the card: upside down, it is below it.
    const flipped = imageOpeningFrame(picture({ smartFrame: card(), flipV: true }));
    expect(flipped).toEqual({ x: 152, y: 412, w: 696, h: 696 });
    // A quarter turn clockwise takes what was above the middle to the right of it.
    const turned = imageOpeningFrame(picture({ smartFrame: card(), rotation: 90 }));
    expect(turned.x).toBeCloseTo(232);
    expect(turned.y).toBeCloseTo(332);
  });
});

describe('the artwork of a picture that changes its size', () => {
  const at = (w: number, h: number, design = card()) => frameLayout(design, { w, h });

  it('is drawn as it was when the picture is made larger: the opening takes up the change', () => {
    // Twice as wide and half as high again: the margins of the card are what they were.
    const layout = at(1600, 1440);
    expect(layout.scale).toEqual({ x: 2, y: 2 });
    expect(layout.box).toEqual({ w: 800, h: 720 });
    expect(layout.opening).toEqual({ x: 26, y: 26, w: 748, h: 588 });
    const opening = imageOpening(
      picture({ smartFrame: card(), frame: { x: 0, y: 0, w: 1600, h: 1440 } }),
    );
    expect(opening).toEqual({ x: 52, y: 52, w: 1496, h: 1176 });
    // To the right of the opening and below it the card is as wide as it was: 52 and 212.
    expect([1600 - opening.x - opening.w, 1440 - opening.y - opening.h]).toEqual([52, 212]);
  });

  it('is drawn smaller, whole, in a picture that is too small for it', () => {
    // Half as wide: the artwork is drawn at half its size, and the height left is the opening's.
    const layout = at(400, 960);
    expect(layout.scale).toEqual({ x: 1, y: 1 });
    expect(layout.box).toEqual({ w: 400, h: 960 });
    expect(layout.opening).toEqual({ x: 26, y: 26, w: 348, h: 828 });
    // An opening is never narrower or lower than the artwork was drawn around.
    expect(at(40, 48).opening).toEqual({ x: 26, y: 26, w: 348, h: 348 });
  });

  it('is stretched with the picture when the artwork says no scale', () => {
    const { scale: _scale, ...plain } = card();
    // Three times as wide and twice as high: the artwork, and its opening with it.
    const layout = at(1200, 960, plain);
    expect(layout.scale).toEqual({ x: 3, y: 2 });
    expect(layout.box).toEqual({ w: 400, h: 480 });
    expect(layout.opening).toEqual(plain.opening);
    const stretched = picture({ smartFrame: plain, frame: { x: 0, y: 0, w: 1200, h: 960 } });
    expect(imageOpening(stretched)).toEqual({ x: 78, y: 52, w: 1044, h: 696 });
  });

  it('has its parts where they were beside the opening, and stretched where they span it', () => {
    const design = card();
    const layout = at(1600, 1440);
    const placed = (x: number, y: number, w: number, h: number) =>
      placedInFrame(design, layout, { x, y, w, h });
    // The card itself reaches from margin to margin: it grows with the opening.
    expect(placed(0, 0, 400, 480)).toEqual({ x: 0, y: 0, w: 800, h: 720 });
    // A mark in a corner keeps its size and its distance from that corner.
    expect(placed(4, 4, 16, 16)).toEqual({ x: 4, y: 4, w: 16, h: 16 });
    expect(placed(380, 460, 16, 16)).toEqual({ x: 780, y: 700, w: 16, h: 16 });
    // A label under the middle of the opening stays under its middle, as large as it was.
    expect(placed(150, 400, 100, 40)).toEqual({ x: 350, y: 640, w: 100, h: 40 });
  });
});

describe('a picture with artwork around it', () => {
  it('is an image element like any other, with or without a photograph', () => {
    const outline = { kind: 'path', d: 'M0 0L100 0L50 100Z', viewBox: { w: 100, h: 100 } } as const;
    expect(ImageElement.safeParse(picture({ smartFrame: card(), mask: outline })).success).toBe(
      true,
    );
    expect(
      ImageElement.safeParse(picture({ smartFrame: card(), assetId: 'a_photo' })).success,
    ).toBe(true);
  });

  it('keeps its opening inside the artwork', () => {
    const outside = picture({ smartFrame: card({ x: 26, y: 26, w: 400, h: 348 }) });
    expect(ImageElement.safeParse(outside).success).toBe(false);
    const empty = picture({ smartFrame: card({ x: 26, y: 26, w: 0, h: 348 }) });
    expect(ImageElement.safeParse(empty).success).toBe(false);
  });
});
