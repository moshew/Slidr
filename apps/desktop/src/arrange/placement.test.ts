import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  findElement,
  type Element,
  type Frame,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { frameWith, keepsAspect, placementCommands, shownRotation, sizable } from './numeric';
import { pasteStyleCommands, stylePatch } from './style';

const box = (x: number, y: number, w = 200, h = 100): Frame => ({ x, y, w, h });
const rect = (id: string, frame: Frame, extra: Record<string, unknown> = {}) =>
  createElement.shape({ id, frame, ...extra });
const image = (id: string, frame: Frame, extra: Record<string, unknown> = {}) =>
  createElement.image({ id, frame, assetId: 'a1', fit: 'cover', ...extra });
const line = (id: string, extra: Record<string, unknown> = {}) =>
  createElement.line({
    id,
    frame: box(0, 0, 300, 100),
    points: [
      { x: 0, y: 0 },
      { x: 300, y: 100 },
    ],
    ...extra,
  });

function busWith(...elements: Element[]) {
  const bus = new CommandBus(createDeck({ slides: [createSlide({ id: 's1', elements })] }), {
    validate: true,
  });
  const slide = () => bus.deck.slides[0]!;
  const at = (id: string) => findElement(slide(), id)!;
  return { bus, slide, at };
}

describe('position, size and rotation as numbers (ARR-07)', () => {
  it('moves, as one undo step', () => {
    const { bus, slide, at } = busWith(rect('a', box(100, 100)));
    bus.batch(placementCommands(slide(), 'a', 'x', 640.4));
    expect(at('a').frame).toEqual(box(640, 100));
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(at('a').frame).toEqual(box(100, 100));
    bus.redo();
    expect(at('a').frame).toEqual(box(640, 100));
  });

  it('sizes one side, or both when width and height are tied', () => {
    expect(frameWith(box(0, 0), 'w', 400, false)).toEqual(box(0, 0, 400, 100));
    expect(frameWith(box(0, 0), 'w', 400, true)).toEqual(box(0, 0, 400, 200));
    expect(frameWith(box(0, 0), 'h', 50, true)).toEqual(box(0, 0, 100, 50));
    // Never smaller than a pixel, whatever is typed.
    expect(frameWith(box(0, 0), 'w', -30, false)).toEqual(box(0, 0, 1, 100));
    const { bus, slide, at } = busWith(image('p', box(0, 0, 400, 200)));
    bus.batch(placementCommands(slide(), 'p', 'h', 100, keepsAspect(at('p'))));
    expect(at('p').frame).toEqual(box(0, 0, 200, 100));
  });

  it('turns, and shows a turn to the left as one', () => {
    const { bus, slide, at } = busWith(rect('a', box(0, 0)));
    bus.batch(placementCommands(slide(), 'a', 'rotation', -30));
    expect(at('a').rotation).toBe(330);
    expect(shownRotation(330)).toBe(-30);
    expect(shownRotation(180)).toBe(180);
    expect(shownRotation(45.04)).toBe(45);
    bus.undo();
    expect(at('a').rotation).toBe(0);
  });

  it('stretches what is in a group with it, and fits the group around a child that moved', () => {
    const group = createElement.group({
      id: 'g',
      frame: box(100, 100, 400, 200),
      children: [rect('g1', box(0, 0, 200, 200)), rect('g2', box(200, 0, 200, 200))],
    });
    const { bus, slide, at } = busWith(group);
    bus.batch(placementCommands(slide(), 'g', 'w', 800));
    expect(at('g').frame).toEqual(box(100, 100, 800, 200));
    expect(at('g2').frame).toEqual(box(400, 0, 400, 200));
    expect(bus.undoStack).toHaveLength(1);

    // A child moved by a number: the group grows to hold it.
    bus.batch(placementCommands(slide(), 'g2', 'x', 1000));
    expect(at('g').frame.w).toBe(1400);
    bus.undo();
    bus.undo();
    expect(at('g').frame).toEqual(box(100, 100, 400, 200));
    expect(at('g2').frame).toEqual(box(200, 0, 200, 200));
  });

  it('changes nothing for a locked element, the number it already has, or the size of a line', () => {
    const { slide } = busWith(
      rect('a', box(100, 100)),
      rect('locked', box(0, 0), { locked: true }),
      line('l'),
    );
    expect(placementCommands(slide(), 'a', 'x', 100)).toEqual([]);
    expect(placementCommands(slide(), 'locked', 'x', 500)).toEqual([]);
    expect(placementCommands(slide(), 'l', 'w', 500)).toEqual([]);
    expect(placementCommands(slide(), 'l', 'x', 500)).toHaveLength(1);
    expect(placementCommands(slide(), 'gone', 'x', 500)).toEqual([]);
    expect(placementCommands(slide(), 'a', 'x', Number.NaN)).toEqual([]);
    expect(sizable(line('m'))).toBe(false);
  });
});

describe('paste style only (ARR-06)', () => {
  const styled = rect('src', box(0, 0), {
    opacity: 0.6,
    effects: { shadow: { x: 0, y: 8, blur: 24, color: { token: 'text', alpha: 0.3 } }, radius: 16 },
    fill: { kind: 'solid', color: { token: 'accent' } },
    stroke: { color: { token: 'text' }, width: 6, dash: 'dashed' },
  });

  it('gives a shape the fill, outline, effects and opacity of another, and leaves its place', () => {
    const { bus, slide, at } = busWith(styled, rect('a', box(500, 400, 300, 300)));
    bus.batch(pasteStyleCommands(slide(), ['a'], styled));
    expect(at('a')).toMatchObject({
      frame: box(500, 400, 300, 300),
      opacity: 0.6,
      fill: styled.fill,
      stroke: styled.stroke,
      effects: styled.effects,
    });
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(at('a').opacity).toBe(1);
    expect(at('a')).not.toHaveProperty('stroke');
    bus.redo();
    expect(at('a')).toMatchObject({ stroke: styled.stroke });
  });

  it('gives each type what it can show: an outline becomes the border of an image', () => {
    const picture = image('p', box(0, 0), { crop: { x: 0, y: 0, w: 0.5, h: 1 } });
    const patch = stylePatch(styled, picture)!;
    expect(patch).toEqual({ opacity: 0.6, effects: styled.effects, border: styled.stroke });
    // Nothing of what the image holds or where it is.
    expect(Object.keys(patch)).not.toEqual(expect.arrayContaining(['assetId', 'crop', 'frame']));
    // An ellipse has no corners to round: the radius is not taken.
    const ellipse = rect('e', box(0, 0), { geometry: { kind: 'preset', preset: 'ellipse' } });
    expect(stylePatch(styled, ellipse)!.effects).toEqual({ shadow: styled.effects!.shadow });
  });

  it('carries the look of an image to another image, and of a line to another line', () => {
    const from = image('p1', box(0, 0), {
      mask: { kind: 'ellipse' },
      adjust: { contrast: 1.2 },
      filterPreset: 'duotone:primary:bg',
    });
    expect(stylePatch(from, image('p2', box(0, 0)))).toEqual({
      mask: { kind: 'ellipse' },
      adjust: { contrast: 1.2 },
      filterPreset: 'duotone:primary:bg',
    });
    const arrow = line('l1', {
      endHead: 'triangle',
      curve: 'curved',
      stroke: { color: { token: 'primary' }, width: 8 },
    });
    expect(stylePatch(arrow, line('l2'))).toEqual({
      endHead: 'triangle',
      curve: 'curved',
      stroke: arrow.stroke,
    });
    // A shape without an outline does not take a line's stroke away.
    expect(stylePatch(rect('plain', box(0, 0)), arrow)).toBeUndefined();
  });

  it('takes a look away as well as giving one', () => {
    const plain = image('plain', box(0, 0));
    const masked = image('masked', box(0, 0), { mask: { kind: 'ellipse' }, filterPreset: 'noir' });
    expect(stylePatch(plain, masked)).toEqual({ mask: null, filterPreset: null });
  });

  it('skips the source itself, locked elements, and what already looks like it', () => {
    const { slide } = busWith(
      styled,
      rect('same', box(0, 0), {
        opacity: 0.6,
        effects: styled.effects,
        fill: styled.fill,
        stroke: styled.stroke,
      }),
      rect('locked', box(0, 0), { locked: true }),
    );
    expect(pasteStyleCommands(slide(), ['src', 'same', 'locked', 'gone'], styled)).toEqual([]);
  });
});
