import { createElement, Layout, richText, type Background, type Element } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { nightTemplate, paperTemplate } from './fixtures';
import { mirrorBackground, mirrorElement, mirrorFrame, mirrorLayout } from './mirror';

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });

describe('mirrorFrame', () => {
  it('moves a frame to the other side of the slide, or of the box it is given', () => {
    expect(mirrorFrame(box(96, 80, 860, 160))).toEqual(box(964, 80, 860, 160));
    expect(mirrorFrame(box(0, 0, 1920, 1080))).toEqual(box(0, 0, 1920, 1080));
    expect(mirrorFrame(box(10, 5, 30, 20), 100)).toEqual(box(60, 5, 30, 20));
  });

  it('gives fractions back exactly when mirrored twice', () => {
    for (const frame of [
      box(0.1, 0, 0.2, 10),
      box(123.457, 0, 0.001, 1),
      box(-40.5, 3, 2000.25, 1),
    ]) {
      const there = mirrorFrame(frame);
      expect(Object.is(there.x, -0)).toBe(false);
      expect(mirrorFrame(there)).toEqual(frame);
    }
  });
});

describe('mirrorElement', () => {
  it('flips what is drawn and turns its rotation the other way', () => {
    const shape = createElement.shape({ id: 'e1', frame: box(100, 0, 200, 200), rotation: 15 });
    const there = mirrorElement(shape);
    expect(there).toMatchObject({ frame: box(1620, 0, 200, 200), rotation: -15, flipH: true });
    expect(mirrorElement(there)).toEqual(shape);

    const line = createElement.line({
      id: 'e2',
      frame: box(0, 0, 400, 0),
      points: [
        { x: 0, y: 0 },
        { x: 400, y: 0 },
      ],
      endHead: 'arrow',
      flipH: true,
    });
    // An arrow that was already flipped points the first way again.
    expect(mirrorElement(line).flipH).toBeUndefined();
    expect(mirrorElement(line).rotation).toBe(0);
  });

  it('moves text and pictures without flipping them, and a logo whatever it is made of', () => {
    const text = createElement.text({
      id: 'e1',
      frame: box(96, 0, 500, 100),
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      content: richText('Title'),
    });
    expect(mirrorElement(text)).toEqual({
      ...text,
      frame: box(1324, 0, 500, 100),
      padding: { top: 1, right: 4, bottom: 3, left: 2 },
    });

    const image = createElement.image({ id: 'e2', frame: box(0, 0, 640, 1080) });
    expect(mirrorElement(image)).toEqual({ ...image, frame: box(1280, 0, 640, 1080) });

    const logo = createElement.svg({
      id: 'e3',
      role: 'logo',
      frame: box(96, 96, 200, 80),
      markup: '<svg viewBox="0 0 10 4"><path d="M0 0h10v4z"/></svg>',
    });
    expect(mirrorElement(logo).flipH).toBeUndefined();
    const blob = { ...logo, role: undefined };
    expect(mirrorElement(blob).flipH).toBe(true);
  });

  it('mirrors the children of a group inside it, and leaves the group itself unflipped', () => {
    const group = createElement.group({
      id: 'g',
      frame: box(100, 100, 400, 200),
      rotation: 30,
      children: [
        createElement.text({ id: 't', frame: box(20, 20, 100, 40), content: richText('01') }),
        createElement.shape({ id: 's', frame: box(300, 0, 100, 200) }),
      ],
    });
    const there = mirrorElement(group) as Extract<Element, { type: 'group' }>;
    expect(there).toMatchObject({ frame: box(1420, 100, 400, 200), rotation: -30 });
    expect(there.flipH).toBeUndefined();
    expect(there.children.map((c) => [c.frame.x, c.flipH])).toEqual([
      [280, undefined],
      [0, true],
    ]);
    expect(mirrorElement(there)).toEqual(group);
  });
});

describe('mirrorBackground', () => {
  it('turns gradients round and leaves the rest', () => {
    const stops = [
      { color: { token: 'bg' as const }, at: 0 },
      { color: { token: 'surface' as const }, at: 0.3 },
      { color: { token: 'primary' as const }, at: 1 },
    ];
    const linear: Background = { fill: { kind: 'linear', angle: 90, stops } };
    expect(mirrorBackground(linear).fill).toEqual({ kind: 'linear', angle: -90, stops });

    const radial: Background = {
      fill: { kind: 'radial', center: { x: 0.8, y: 0.3 }, stops },
      overlay: { kind: 'linear', angle: 0, stops },
    };
    expect(mirrorBackground(radial)).toEqual({
      fill: { kind: 'radial', center: { x: 0.2, y: 0.3 }, stops },
      overlay: { kind: 'linear', angle: 0, stops },
    });

    const conic: Background = { fill: { kind: 'conic', angle: 30, stops } };
    expect(mirrorBackground(conic).fill).toEqual({
      kind: 'conic',
      angle: -30,
      stops: [
        { color: { token: 'primary' }, at: 0 },
        { color: { token: 'surface' }, at: 0.7 },
        { color: { token: 'bg' }, at: 1 },
      ],
    });

    const photo: Background = { fill: { kind: 'image', assetId: 'a', fit: 'cover' }, dim: 0.3 };
    const free: Background = { fill: { kind: 'css', value: 'linear-gradient(90deg, red, blue)' } };
    for (const background of [linear, radial, conic, photo, free]) {
      expect(mirrorBackground(mirrorBackground(background))).toEqual(background);
    }
    expect(mirrorBackground(photo)).toEqual(photo);
    expect(mirrorBackground(free)).toEqual(free);
  });
});

describe('mirrorLayout', () => {
  const layouts = () => {
    const night = nightTemplate();
    return [...paperTemplate().layouts, ...night.layouts, ...(night.flipped ?? [])];
  };

  it('is its own inverse on every fixture layout', () => {
    for (const layout of layouts()) {
      const there = mirrorLayout(layout);
      expect(Layout.safeParse(there).success).toBe(true);
      expect(mirrorLayout(there)).toEqual(layout);
    }
  });

  it('puts the text on the other side and keeps ids, roles, styles and alignment', () => {
    const hero = paperTemplate().layouts.find((l) => l.id === 'l_paper_hero')!;
    const there = mirrorLayout(hero);
    expect(there.id).toBe(hero.id);
    expect(there.placeholders).toEqual([
      { ...hero.placeholders[0], frame: box(724, 320, 1100, 260) },
      { ...hero.placeholders[1], frame: box(724, 610, 1100, 120) },
      { ...hero.placeholders[2], frame: box(0, 0, 640, 1080) },
    ]);
    // The bar, and the tilted square with its gradient, are flipped; the background gradient turns.
    expect(there.decorations.map((d) => [d.frame.x, d.rotation, d.flipH])).toEqual([
      [1664, 0, true],
      [540, -15, true],
    ]);
    expect(there.background?.fill).toMatchObject({ kind: 'linear', angle: -90 });
  });

  it('leaves a layout without sides as it is', () => {
    const section = nightTemplate().layouts.find((l) => l.id === 'l_night_section')!;
    expect(mirrorLayout(section)).toEqual(section);
  });
});
