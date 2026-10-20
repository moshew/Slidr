import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  findElement,
  updateElement,
  type ImageElement,
} from '@slidr/model';
import { duotoneTokens } from '@slidr/renderer';
import { describe, expect, it } from 'vitest';
import {
  ADJUSTMENTS,
  adjustPatch,
  adjustValue,
  asBackgroundCommands,
  defaultMaskRadius,
  duotoneNames,
  isAdjusted,
  maskChoice,
  maskPatch,
  maskShapes,
  maxMaskRadius,
} from './imageLook';

const image = (extra: Partial<ImageElement> = {}): ImageElement =>
  createElement.image({
    id: 'i1',
    frame: { x: 200, y: 100, w: 800, h: 400 },
    assetId: 'a1',
    fit: 'cover',
    ...extra,
  });

function busWith(element: ImageElement) {
  const bus = new CommandBus(
    createDeck({ slides: [createSlide({ id: 's1', elements: [element] })] }),
    { validate: true },
  );
  const now = () => findElement(bus.deck.slides[0]!, 'i1') as ImageElement | undefined;
  return { bus, now };
}

const control = (key: string) => ADJUSTMENTS.find((c) => c.key === key)!;

describe('the mask of a picture', () => {
  it('reads as the choice the picker shows', () => {
    expect(maskChoice(image())).toBe('none');
    expect(maskChoice(image({ mask: { kind: 'ellipse' } }))).toBe('ellipse');
    expect(maskChoice(image({ mask: { kind: 'rounded', radius: 20 } }))).toBe('rounded');
    expect(maskChoice(image({ mask: { kind: 'shape', preset: 'star5' } }))).toBe('shape:star5');
  });

  it('is written and taken away as one undo step each', () => {
    const { bus, now } = busWith(image());
    bus.dispatch(updateElement('s1', 'i1', maskPatch(now()!, 'shape:hexagon')));
    expect(now()!.mask).toEqual({ kind: 'shape', preset: 'hexagon' });
    bus.dispatch(updateElement('s1', 'i1', maskPatch(now()!, 'ellipse')));
    expect(now()!.mask).toEqual({ kind: 'ellipse' });
    bus.dispatch(updateElement('s1', 'i1', maskPatch(now()!, 'none')));
    expect(now()!.mask).toBeUndefined();
    expect(bus.undoStack).toHaveLength(3);
    bus.undo();
    expect(now()!.mask).toEqual({ kind: 'ellipse' });
    bus.redo();
    expect(now()!.mask).toBeUndefined();
  });

  it('starts rounded corners at an eighth of the shorter side, and keeps a radius already set', () => {
    expect(defaultMaskRadius(image())).toBe(50);
    expect(maxMaskRadius(image())).toBe(200);
    expect(maskPatch(image(), 'rounded')).toEqual({ mask: { kind: 'rounded', radius: 50 } });
    expect(maskPatch(image({ mask: { kind: 'rounded', radius: 12 } }), 'rounded')).toEqual({
      mask: { kind: 'rounded', radius: 12 },
    });
  });

  it('offers the closed shapes of the library, without the three it has as masks of their own', () => {
    const shapes = maskShapes();
    expect(shapes).toContain('star5');
    expect(shapes).toContain('heart');
    for (const preset of ['rect', 'roundRect', 'ellipse', 'donut', 'frame', 'leftBracket']) {
      expect(shapes, preset).not.toContain(preset);
    }
  });
});

describe('the adjustments of a picture', () => {
  it('show the resting value for a picture that has none', () => {
    expect(ADJUSTMENTS.map((c) => adjustValue(image(), c))).toEqual([100, 100, 100, 0, 0, 0, 0]);
    expect(isAdjusted(image())).toBe(false);
  });

  it('are kept in the units of the model, and shown in the units of the slider', () => {
    const element = image({ adjust: { brightness: 1.25, temperature: -0.4, grayscale: 1 } });
    expect(adjustValue(element, control('brightness'))).toBe(125);
    expect(adjustValue(element, control('temperature'))).toBe(-40);
    expect(adjustValue(element, control('grayscale'))).toBe(100);
    expect(adjustPatch(image(), control('contrast'), 150)).toEqual({ adjust: { contrast: 1.5 } });
    expect(adjustPatch(image(), control('hue'), -30)).toEqual({ adjust: { hue: -30 } });
    expect(adjustPatch(image(), control('blur'), 500)).toEqual({ adjust: { blur: 40 } });
  });

  it('are not stored at rest: the last one back at rest removes the field', () => {
    const element = image({ adjust: { brightness: 1.2, hue: 10 } });
    expect(adjustPatch(element, control('hue'), 0)).toEqual({ adjust: { brightness: 1.2 } });
    expect(adjustPatch(image({ adjust: { hue: 10 } }), control('hue'), 0)).toEqual({
      adjust: null,
    });
  });

  it('a drag of a slider is one undo step', () => {
    const { bus, now } = busWith(image());
    for (const value of [110, 130, 150]) {
      bus.dispatch(updateElement('s1', 'i1', adjustPatch(now()!, control('brightness'), value)), {
        txId: 'drag',
      });
    }
    expect(now()!.adjust).toEqual({ brightness: 1.5 });
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(now()!.adjust).toBeUndefined();
    bus.redo();
    expect(now()!.adjust).toEqual({ brightness: 1.5 });
  });
});

describe('the duotones', () => {
  it('are pairs of theme tokens the renderer knows', () => {
    expect(duotoneNames.length).toBeGreaterThan(3);
    for (const name of duotoneNames) expect(duotoneTokens(name), name).toBeDefined();
    expect(new Set(duotoneNames).size).toBe(duotoneNames.length);
  });
});

describe('a picture as the background of its slide', () => {
  it('moves the file to the background and takes the element away, as one undo step', () => {
    const { bus, now } = busWith(image({ crop: { x: 0.1, y: 0, w: 0.8, h: 1 } }));
    bus.batch(asBackgroundCommands('s1', now()!));
    const [slide] = bus.deck.slides;
    expect(slide!.elements).toEqual([]);
    expect(slide!.background).toEqual({ fill: { kind: 'image', assetId: 'a1', fit: 'cover' } });
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck.slides[0]!.background).toBeUndefined();
    expect(now()!.crop).toEqual({ x: 0.1, y: 0, w: 0.8, h: 1 });
    bus.redo();
    expect(bus.deck.slides[0]!.elements).toEqual([]);
  });

  it('is nothing for a picture that has no file yet', () => {
    const waiting = image({ prompt: 'a harbour at dawn' });
    delete waiting.assetId;
    expect(asBackgroundCommands('s1', waiting)).toEqual([]);
  });
});
