import {
  createElement,
  richText,
  type Element,
  type GroupElement,
  type SvgElement,
  type TextElement,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { resizeGroup, resizeOne, resizeTogether, type Patch } from './groups';

const label = () =>
  createElement.group({
    id: 'label',
    frame: { x: 100, y: 100, w: 500, h: 150 },
    rotation: -2,
    children: [
      createElement.svg({
        id: 'plate',
        frame: { x: 0, y: 0, w: 500, h: 150 },
        markup: '<svg viewBox="0 0 500 150"/>',
        stretch: {
          viewBox: { w: 500, h: 150 },
          scale: 1,
          x: [
            [60, 160],
            [340, 440],
          ],
          y: [[70, 88]],
        },
      }),
      createElement.text({
        id: 'words',
        frame: { x: 40, y: 22, w: 420, h: 64 },
        content: richText('מסיבת בריכה אצל גל', { marks: { size: 42 } }),
      }),
    ],
  });

const apply = <T extends Element>(element: T, patches: Map<string, Patch>): T => ({
  ...element,
  ...patches.get(element.id),
  ...(element.type === 'group'
    ? { children: element.children.map((child) => apply(child, patches)) }
    : {}),
});

describe('resizing a text background', () => {
  it('makes a tilted label wider with constant padding, height and editable type', () => {
    const old = label();
    const after = apply(old, resizeGroup(old, { ...old.frame, w: 800 }));
    expect(after.frame).toEqual({ ...old.frame, w: 800 });
    expect(after.rotation).toBe(-2);
    expect(after.children[0]!.frame).toEqual({ x: 0, y: 0, w: 800, h: 150 });
    expect(after.children[1]!.frame).toEqual({ x: 40, y: 22, w: 720, h: 64 });
    expect((after.children[1] as TextElement).content).toEqual(
      (old.children[1] as TextElement).content,
    );
  });

  it('resizes the upper edge without changing width and restores the text boxes after shrinking back', () => {
    const old = label();
    const tall = apply(old, resizeOne(old, { frame: { ...old.frame, y: 0, h: 250 } }));
    expect(tall.frame).toEqual({ x: 100, y: 0, w: 500, h: 250 });
    expect(tall.children[0]!.frame).toEqual({ x: 0, y: 0, w: 500, h: 250 });
    const restored = apply(tall, resizeGroup(tall, old.frame));
    expect(restored.children[1]!.frame).toEqual(old.children[1]!.frame);
    expect((restored.children[1] as TextElement).content).toEqual(
      (old.children[1] as TextElement).content,
    );
  });

  it('works inside a larger selection as well as after ungrouping the plate', () => {
    const old = { ...label(), rotation: 0 };
    const after = apply(old, resizeTogether([old], old.frame, { ...old.frame, w: 800 }));
    expect(after.children[1]!.frame.w).toBe(720);
    const plate = old.children[0] as SvgElement;
    expect(apply(plate, resizeOne(plate, { frame: { ...plate.frame, w: 800 } })).stretch).toEqual(
      plate.stretch,
    );
  });

  it('follows the local axes of a vertical sign on the side of a magnet', () => {
    const sign = { ...label(), frame: { x: 675, y: 300, w: 500, h: 150 }, rotation: 90 };
    const magnet = createElement.group({
      id: 'magnet',
      name: 'frame:test',
      frame: { x: 0, y: 0, w: 1050, h: 800 },
      children: [
        createElement.image({
          frame: { x: 0, y: 0, w: 1050, h: 800 },
          smartFrame: {
            viewBox: { w: 1050, h: 800 },
            opening: { x: 40, y: 40, w: 970, h: 700 },
            scale: 1,
            decorations: [],
          },
        }),
        sign,
      ],
    });
    const wide = apply(magnet, resizeGroup(magnet, { ...magnet.frame, w: 1785 }));
    const fixed = wide.children[1] as GroupElement;
    expect([fixed.frame.w, fixed.frame.h]).toEqual([500, 150]);
    expect(fixed.frame.x - sign.frame.x).toBe(735);
    expect(wide.frame.h).toBe(800);
    const tall = apply(magnet, resizeGroup(magnet, { ...magnet.frame, h: 1360 }));
    const extended = tall.children[1] as GroupElement;
    expect([extended.frame.w, extended.frame.h]).toEqual([1060, 150]);
    expect(tall.frame.w).toBe(1050);
  });

  it('lengthens a magnet label, keeps its height and stickers, and scales everything when the artwork shrinks', () => {
    const sign = { ...label(), frame: { x: 300, y: 600, w: 500, h: 150 } };
    const magnet = createElement.group({
      id: 'magnet',
      name: 'frame:test',
      frame: { x: 0, y: 0, w: 1050, h: 800 },
      children: [
        createElement.image({
          id: 'photo',
          frame: { x: 0, y: 0, w: 1050, h: 800 },
          smartFrame: {
            viewBox: { w: 1050, h: 800 },
            opening: { x: 40, y: 40, w: 970, h: 500 },
            scale: 1,
            decorations: [],
          },
        }),
        createElement.svg({
          id: 'sticker',
          frame: { x: 20, y: 20, w: 100, h: 100 },
          markup: '<svg/>',
        }),
        sign,
      ],
    });
    const wide = apply(magnet, resizeGroup(magnet, { ...magnet.frame, w: 1550 }));
    const changed = wide.children[2] as GroupElement;
    expect(wide.frame.h).toBe(800);
    expect(changed.frame.w).toBeCloseTo(500 + 500 / Math.cos((2 * Math.PI) / 180), 2);
    expect(changed.frame.h).toBe(150);
    expect(wide.children[1]!.frame).toEqual(magnet.children[1]!.frame);
    expect((changed.children[1] as TextElement).content).toEqual(
      (sign.children[1] as TextElement).content,
    );
    const half = apply(magnet, resizeGroup(magnet, { ...magnet.frame, w: 525, h: 400 }));
    const smaller = half.children[2] as GroupElement;
    expect(smaller.frame.w).toBe(250);
    expect(smaller.frame.h).toBe(75);
    expect((smaller.children[0] as SvgElement).stretch!.scale).toBe(0.5);
    expect(smaller.children[1]!.frame).toEqual({ x: 20, y: 11, w: 210, h: 32 });
    expect((smaller.children[1] as TextElement).content.paragraphs[0]!.runs[0]!.marks!.size).toBe(
      21,
    );
  });
});
