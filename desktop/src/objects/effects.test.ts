import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  richText,
  updateElement,
  type Element,
  type Shadow,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  effectsPatch,
  radiusControl,
  shadowPatch,
  shapeHasFill,
  strokeHasCapAndJoin,
  supportsSpread,
} from './effects';

const frame = { x: 0, y: 0, w: 400, h: 200 };
const shadow: Shadow = { x: 0, y: 12, blur: 32, color: { value: 'black', alpha: 0.2 } };

const shape = (preset: string, extra: Partial<Parameters<typeof createElement.shape>[0]> = {}) =>
  createElement.shape({ frame, geometry: { kind: 'preset', preset }, ...extra });
const image = createElement.image({ frame, assetId: 'a1' });
const text = createElement.text({ frame, content: richText('x') });
const line = createElement.line({
  frame,
  points: [
    { x: 0, y: 0 },
    { x: 400, y: 200 },
  ],
});
const html = createElement.html({ frame, markup: '<p>x</p>' });
const video = createElement.video({ frame, assetId: 'v1' });
const group = createElement.group({ frame, children: [] });

/** Applies a patch through the real command, so an invalid one fails the test. */
function apply<T extends Element>(element: T, patch: ReturnType<typeof effectsPatch>): T {
  const slide = createSlide({ id: 's1', elements: [element] });
  const bus = new CommandBus(createDeck({ slides: [slide] }), { validate: true });
  bus.dispatch(updateElement('s1', element.id, patch));
  return bus.deck.slides[0]?.elements[0] as T;
}

describe('effectsPatch', () => {
  it('changes one effect and carries the others along', () => {
    const rounded = shape('rect', { effects: { radius: 8, blur: 2 } });
    expect(apply(rounded, shadowPatch(rounded, shadow)).effects).toEqual({
      radius: 8,
      blur: 2,
      shadow,
    });
    expect(apply(rounded, effectsPatch(rounded, { radius: null })).effects).toEqual({ blur: 2 });
  });

  it('removes the field itself when no effect is left', () => {
    const shadowed = shape('rect', { effects: { shadow } });
    const patch = shadowPatch(shadowed, null);
    expect(patch).toEqual({ effects: null });
    expect(apply(shadowed, patch)).not.toHaveProperty('effects');
  });
});

describe('radiusControl', () => {
  it('rounds a rectangle in pixels of `effects.radius`, up to half its shorter side', () => {
    const rect = shape('rect');
    const control = radiusControl(rect);
    expect(control).toMatchObject({ unit: 'px', value: 0, max: 100 });
    expect(apply(rect, control!.patch(24)).effects).toEqual({ radius: 24 });
    // Zero is no radius at all.
    const rounded = shape('rect', { effects: { radius: 24 } });
    expect(radiusControl(rounded)?.value).toBe(24);
    expect(apply(rounded, radiusControl(rounded)!.patch(0))).not.toHaveProperty('effects');
  });

  it('rounds a rounded rectangle through its geometry, as a share of the way to a pill', () => {
    const round = shape('roundRect');
    const control = radiusControl(round);
    // The renderer's default corner is a sixth of the shorter side: a third of the way.
    expect(control).toMatchObject({ unit: '%', value: 33, max: 100 });
    expect(apply(round, control!.patch(100)).geometry).toEqual({
      kind: 'preset',
      preset: 'roundRect',
      adjust: [0.5],
    });
    expect(apply(round, control!.patch(50)).geometry).toMatchObject({ adjust: [0.25] });
    expect(apply(round, control!.patch(0)).geometry).toMatchObject({ adjust: [0] });
    const pill = shape('roundRect');
    pill.geometry = { kind: 'preset', preset: 'roundRect', adjust: [0.9] };
    expect(radiusControl(pill)?.value).toBe(100);
  });

  it('offers corners only where the renderer rounds them', () => {
    expect(radiusControl(image)?.unit).toBe('px');
    expect(radiusControl(html)?.unit).toBe('px');
    expect(radiusControl(video)?.unit).toBe('px');
    const masked = createElement.image({ frame, assetId: 'a1', mask: { kind: 'ellipse' } });
    for (const element of [shape('ellipse'), shape('star5'), masked, text, line, group]) {
      expect(radiusControl(element), element.type).toBeUndefined();
    }
    const path = createElement.shape({
      frame,
      geometry: { kind: 'path', d: 'M0 0 L10 0 L10 10 Z', viewBox: { w: 10, h: 10 } },
    });
    expect(radiusControl(path)).toBeUndefined();
  });
});

describe('supportsSpread', () => {
  it('is for elements whose box is their picture', () => {
    for (const element of [shape('rect'), image, html, video]) {
      expect(supportsSpread(element), element.type).toBe(true);
    }
    const masked = createElement.image({ frame, assetId: 'a1', mask: { kind: 'ellipse' } });
    for (const element of [shape('roundRect'), shape('ellipse'), masked, text, line, group]) {
      expect(supportsSpread(element), element.type).toBe(false);
    }
  });
});

describe('strokes and fills', () => {
  it('has line ends and joins on lines and drawn shapes, not on boxes or image borders', () => {
    expect(strokeHasCapAndJoin(line)).toBe(true);
    expect(strokeHasCapAndJoin(shape('star5'))).toBe(true);
    expect(strokeHasCapAndJoin(shape('leftBracket'))).toBe(true);
    for (const preset of ['rect', 'roundRect', 'ellipse']) {
      expect(strokeHasCapAndJoin(shape(preset)), preset).toBe(false);
    }
    expect(strokeHasCapAndJoin(image)).toBe(false);
  });

  it('has nothing to fill in an open outline', () => {
    expect(shapeHasFill(shape('rect'))).toBe(true);
    expect(shapeHasFill(shape('donut'))).toBe(true);
    expect(shapeHasFill(shape('leftBrace'))).toBe(false);
    const open = createElement.shape({
      frame,
      geometry: { kind: 'path', d: 'M0 0 L10 10', viewBox: { w: 10, h: 10 } },
    });
    const closed = createElement.shape({
      frame,
      geometry: { kind: 'path', d: 'M0 0 L10 0 L10 10 z', viewBox: { w: 10, h: 10 } },
    });
    expect(shapeHasFill(open)).toBe(false);
    expect(shapeHasFill(closed)).toBe(true);
  });
});
