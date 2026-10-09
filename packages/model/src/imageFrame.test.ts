import { describe, expect, it } from 'vitest';
import { createElement } from './factories';
import { imageOpening, imageOpeningFrame } from './imageFrame';
import { ImageElement, type SmartImageFrame } from './schema';

/** An instant photo: a card of 400 by 480 with the photograph in a square near its top. */
const card = (opening = { x: 26, y: 26, w: 348, h: 348 }): SmartImageFrame => ({
  viewBox: { w: 400, h: 480 },
  opening,
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
