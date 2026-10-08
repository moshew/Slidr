import { createElement, richText, type Element, type GroupElement, type Point } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  refitAll,
  refitGroups,
  refitPatches,
  resizeGroup,
  resizeTogether,
  type Placement,
} from './groups';
import {
  apply,
  applyVector,
  boxMatrix,
  corners,
  elementMatrix,
  IDENTITY,
  indexElements,
  invert,
  isTranslation,
  multiply,
  resolveHit,
  resolvePress,
  screenTransform,
  slideBounds,
  snapCandidates,
  validScope,
} from './space';

const near = (a: Point, b: Point, digits = 6) => {
  expect(a.x).toBeCloseTo(b.x, digits);
  expect(a.y).toBeCloseTo(b.y, digits);
};

const rect = (id: string, x: number, y: number, w: number, h: number, rotation = 0) =>
  createElement.shape({ id, frame: { x, y, w, h }, rotation });

/** A group in a group: the outer one rotated and mirrored, the inner one rotated. */
function nested(): Element[] {
  const inner = createElement.group({
    id: 'inner',
    frame: { x: 200, y: 40, w: 200, h: 120 },
    rotation: 30,
    children: [rect('a', 0, 0, 80, 60), rect('b', 120, 60, 80, 60, 45)],
  });
  const outer = createElement.group({
    id: 'outer',
    frame: { x: 300, y: 200, w: 400, h: 200 },
    rotation: -20,
    flipH: true,
    children: [rect('c', 0, 0, 100, 200), inner],
  });
  return [rect('top', 10, 10, 50, 50), outer];
}

/** Where every corner of every leaf is on the slide. */
function leafCorners(elements: Element[]): Record<string, Point[]> {
  const out: Record<string, Point[]> = {};
  for (const [id, located] of indexElements(elements)) {
    if (located.element.type === 'group') continue;
    const { w, h } = located.element.frame;
    out[id] = corners(elementMatrix(located), w, h);
  }
  return out;
}

function applyPlacements(
  elements: Element[],
  placements: Map<string, Placement | null>,
): Element[] {
  return elements
    .filter((e) => placements.get(e.id) !== null)
    .map((e) => {
      const next = { ...e, ...placements.get(e.id) };
      if (next.type === 'group') next.children = applyPlacements(next.children, placements);
      return next;
    });
}

describe('matrices', () => {
  it('inverts and composes', () => {
    const m = boxMatrix({ frame: { x: 10, y: 20, w: 100, h: 50 }, rotation: 37, flipH: true });
    const p = { x: 13, y: -4 };
    near(apply(invert(m), apply(m, p)), p);
    near(apply(multiply(m, invert(m)), p), p);
    expect(isTranslation(multiply(m, invert(m)))).toBe(true);
    expect(isTranslation(m)).toBe(false);
  });

  it('turns a box around its centre, after mirroring inside it', () => {
    const frame = { x: 100, y: 100, w: 200, h: 100 };
    // The centre never moves.
    for (const rotation of [0, 30, 90, 215]) {
      near(apply(boxMatrix({ frame, rotation, flipH: true, flipV: true }), { x: 100, y: 50 }), {
        x: 200,
        y: 150,
      });
    }
    // A quarter turn clockwise takes the top-left corner to the top-right of the turned box.
    near(apply(boxMatrix({ frame, rotation: 90 }), { x: 0, y: 0 }), { x: 250, y: 50 });
    // Mirrored horizontally, the left edge is drawn on the right.
    near(apply(boxMatrix({ frame, rotation: 0, flipH: true }), { x: 0, y: 0 }), { x: 300, y: 100 });
    // The outline of a mirrored box is not mirrored.
    near(apply(boxMatrix({ frame, rotation: 0, flipH: true }, false), { x: 0, y: 0 }), {
      x: 100,
      y: 100,
    });
    near(applyVector(boxMatrix({ frame, rotation: 90 }), { x: 1, y: 0 }), { x: 0, y: 1 });
  });

  it('writes the CSS transform of a box at a zoom', () => {
    expect(screenTransform({ ...IDENTITY, e: 100, f: 50 }, { x: 20, y: 10 }, 0.5)).toBe(
      'matrix(1, 0, 0, 1, 70, 35)',
    );
  });
});

describe('indexElements', () => {
  it('finds nested elements, with their groups, paint order and space', () => {
    const index = indexElements(nested());
    expect([...index.keys()]).toEqual(['top', 'outer', 'c', 'inner', 'a', 'b']);
    const a = index.get('a')!;
    expect(a.path.map((g) => g.id)).toEqual(['outer', 'inner']);
    expect(a.order).toBeGreaterThan(index.get('inner')!.order);
    expect(isTranslation(index.get('top')!.space)).toBe(true);
    // The space of a child is its group's box, mirroring included.
    const outer = index.get('outer')!.element;
    near(apply(index.get('c')!.space, { x: 200, y: 100 }), { x: 500, y: 300 });
    near(apply(index.get('c')!.space, { x: 0, y: 0 }), apply(boxMatrix(outer), { x: 0, y: 0 }));
  });

  it('passes hidden and locked down from a group', () => {
    const group = createElement.group({
      id: 'g',
      frame: { x: 0, y: 0, w: 10, h: 10 },
      locked: true,
      children: [rect('child', 0, 0, 10, 10)],
    });
    const index = indexElements([group]);
    expect(index.get('child')!.locked).toBe(true);
    expect(index.get('child')!.hidden).toBe(false);
  });

  it('bounds a nested element on the slide', () => {
    const group = createElement.group({
      id: 'g',
      frame: { x: 100, y: 100, w: 200, h: 100 },
      rotation: 90,
      children: [rect('child', 0, 0, 200, 100)],
    });
    const b = slideBounds(indexElements([group]).get('child')!);
    expect(b.x).toBeCloseTo(150, 6);
    expect(b.y).toBeCloseTo(50, 6);
    expect(b.w).toBeCloseTo(100, 6);
    expect(b.h).toBeCloseTo(200, 6);
  });
});

describe('resolveHit', () => {
  it('picks the top-level element when no group is entered', () => {
    expect(resolveHit(['outer', 'inner', 'a'], [])).toEqual({ scope: [], id: 'outer' });
    expect(resolveHit([], [])).toEqual({ scope: [], id: undefined });
  });

  it('picks one level inside the entered group', () => {
    expect(resolveHit(['outer', 'inner', 'a'], ['outer'])).toEqual({
      scope: ['outer'],
      id: 'inner',
    });
    expect(resolveHit(['outer', 'inner', 'a'], ['outer', 'inner'])).toEqual({
      scope: ['outer', 'inner'],
      id: 'a',
    });
    // On the group's own box, between its children: still inside, nothing picked.
    expect(resolveHit(['outer'], ['outer'])).toEqual({ scope: ['outer'], id: undefined });
  });

  it('leaves the groups the pointer is not in', () => {
    expect(resolveHit(['top'], ['outer', 'inner'])).toEqual({ scope: [], id: 'top' });
    expect(resolveHit(['outer', 'c'], ['outer', 'inner'])).toEqual({ scope: ['outer'], id: 'c' });
    expect(resolveHit([], ['outer'])).toEqual({ scope: [], id: undefined });
  });

  it('keeps only the entered groups that still exist', () => {
    const index = indexElements(nested());
    expect(validScope(['outer', 'inner'], index)).toEqual(['outer', 'inner']);
    expect(validScope(['outer', 'gone'], index)).toEqual(['outer']);
    expect(validScope(['inner'], index)).toEqual([]);
    expect(validScope(['top'], index)).toEqual([]);
  });
});

describe('resolvePress', () => {
  /**
   * A card in a group, as a converted slide has it: a background, a title, a chip (a shape with
   * text), and a row that is a group of its own with a tag and an icon. Beside it a group that
   * is locked, and a text box and a chip that are in no group.
   */
  type Flags = { locked?: boolean; hidden?: boolean };
  const text = (id: string, flags: Flags = {}): Element => ({
    ...createElement.text({ id, frame: { x: 0, y: 0, w: 200, h: 40 }, content: richText(id) }),
    ...flags,
  });
  const chip = (id: string, label: string): Element =>
    createElement.shape({ id, frame: { x: 0, y: 60, w: 120, h: 40 }, content: richText(label) });
  const group = (id: string, children: Element[], flags: Flags = {}): Element => ({
    ...createElement.group({ id, frame: { x: 0, y: 0, w: 400, h: 300 }, children }),
    ...flags,
  });
  const index = indexElements([
    group('card', [
      rect('bg', 0, 0, 400, 300),
      text('title'),
      chip('chip', 'New'),
      chip('blank', ''),
      text('fixed', { locked: true }),
      text('unseen', { hidden: true }),
      group('row', [chip('tag', 'Beta'), rect('icon', 140, 0, 40, 40)]),
      createElement.svg({
        id: 'svgIcon',
        frame: { x: 230, y: 60, w: 40, h: 40 },
        markup: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
      }),
      createElement.image({ id: 'photo', frame: { x: 280, y: 60, w: 40, h: 40 } }),
    ]),
    group('shut', [text('kept')], { locked: true }),
    text('solo'),
    chip('label', 'Alone'),
  ]);
  const onText = () => true;
  const offText = () => false;
  const press = (chain: string[], scope: string[] = [], selected: string[] = [], on = onText) =>
    resolvePress(chain, scope, index, selected, on);

  it('takes what resolveHit picks, whatever a click then does', () => {
    for (const [chain, scope] of [
      [['card', 'title'], []],
      [['card', 'row', 'tag'], ['card']],
      [['card', 'row', 'icon'], []],
      [['solo'], ['card', 'row']],
      [[], ['card']],
    ] as [string[], string[]][]) {
      const { inside: _inside, ...taken } = press(chain, scope, ['card']);
      expect(taken).toEqual(resolveHit(chain, scope));
    }
  });

  it('goes straight into a text box inside a group, anywhere on its frame', () => {
    const inside = { scope: ['card'], id: 'title', edit: true };
    expect(press(['card', 'title'])).toEqual({ scope: [], id: 'card', inside });
    // Whether the pointer is on the letters is a question for shapes only.
    expect(press(['card', 'title'], [], [], offText).inside).toEqual(inside);
    // The group being selected already changes nothing: the text comes before the child.
    expect(press(['card', 'title'], [], ['card']).inside).toEqual(inside);
  });

  it('goes into the text of a shape only where its text is', () => {
    expect(press(['card', 'chip']).inside).toEqual({ scope: ['card'], id: 'chip', edit: true });
    expect(press(['card', 'chip'], [], [], offText).inside).toEqual({
      scope: ['card'],
      id: 'chip',
      edit: false,
    });
    // A shape without text is still directly selectable as a card object.
    expect(press(['card', 'bg']).inside).toBeUndefined();
    expect(press(['card', 'blank']).inside).toEqual({
      scope: ['card'],
      id: 'blank',
      edit: false,
    });
    // The same inside the group the shape is in: off its text, a click selects it.
    expect(press(['card', 'chip'], ['card'], [], offText)).toEqual({
      scope: ['card'],
      id: 'chip',
      inside: { scope: ['card'], id: 'chip', edit: false },
    });
    expect(press(['card', 'bg'], ['card']).inside).toBeUndefined();
  });

  it('reaches a text at any depth, from wherever the user has entered', () => {
    const inside = { scope: ['card', 'row'], id: 'tag', edit: true };
    expect(press(['card', 'row', 'tag'])).toEqual({ scope: [], id: 'card', inside });
    expect(press(['card', 'row', 'tag'], ['card'])).toEqual({
      scope: ['card'],
      id: 'row',
      inside,
    });
    expect(press(['card', 'row', 'tag'], ['card', 'row'])).toEqual({
      scope: ['card', 'row'],
      id: 'tag',
      inside,
    });
  });

  it('goes into a text of the group that was entered, where the press takes the text itself', () => {
    const inside = { scope: ['card'], id: 'title', edit: true };
    // The press takes the text box, so a drag moves it alone; a click goes on into its text.
    expect(press(['card', 'title'], ['card'])).toEqual({ scope: ['card'], id: 'title', inside });
    // Also when it is the selection already, or another child of the group is.
    expect(press(['card', 'title'], ['card'], ['title']).inside).toEqual(inside);
    expect(press(['card', 'title'], ['card'], ['chip']).inside).toEqual(inside);
    expect(press(['card', 'chip'], ['card'], ['title']).inside).toEqual({
      scope: ['card'],
      id: 'chip',
      edit: true,
    });
  });

  it('edits text on a standalone shape where it is drawn, but leaves a text box to double-click', () => {
    expect(press(['solo'])).toEqual({ scope: [], id: 'solo' });
    expect(press(['solo'], [], ['solo'])).toEqual({ scope: [], id: 'solo' });
    expect(press(['label'])).toEqual({
      scope: [],
      id: 'label',
      inside: { scope: [], id: 'label', edit: true },
    });
    expect(press(['label'], [], ['label']).inside).toEqual({ scope: [], id: 'label', edit: true });
    expect(press(['label'], [], [], offText)).toEqual({ scope: [], id: 'label' });
    // Also on the way out of a group that was entered.
    expect(press(['solo'], ['card', 'row'])).toEqual({ scope: [], id: 'solo' });
  });

  it('does not go into what is locked or hidden', () => {
    expect(press(['card', 'fixed']).inside).toBeUndefined();
    expect(press(['card', 'unseen']).inside).toBeUndefined();
    expect(press(['card', 'fixed'], ['card'])).toEqual({ scope: ['card'], id: 'fixed' });
    expect(press(['shut', 'kept'])).toEqual({ scope: [], id: 'shut' });
    expect(press(['shut', 'kept'], [], ['shut']).inside).toBeUndefined();
  });

  it('picks foreground objects on a card directly, including nested and SVG objects', () => {
    const child = (id: string, scope: string[]) => ({ scope, id, edit: false });
    expect(press(['card', 'row', 'icon']).inside).toEqual(child('icon', ['card', 'row']));
    expect(press(['card', 'svgIcon']).inside).toEqual(child('svgIcon', ['card']));
    expect(press(['card', 'photo']).inside).toEqual(child('photo', ['card']));
    expect(press(['card', 'row', 'icon'], ['card']).inside).toEqual(child('icon', ['card', 'row']));
    expect(press(['card', 'row', 'icon'], [], ['card']).inside).toEqual(
      child('icon', ['card', 'row']),
    );
    expect(press(['card', 'bg']).inside).toBeUndefined();
  });

  it('picks a background child only on a second click on the selected card', () => {
    const child = (id: string, scope: string[]) => ({ scope, id, edit: false });
    expect(press(['card', 'bg'], [], ['card']).inside).toEqual(child('bg', ['card']));
  });

  it('stays on the group when it was not the whole selection, or has no child to pick', () => {
    expect(press(['card', 'bg']).inside).toBeUndefined();
    expect(press(['card', 'bg'], [], ['card', 'solo']).inside).toBeUndefined();
    expect(press(['card', 'bg'], [], ['solo']).inside).toBeUndefined();
    // Between the children, on the group's own box.
    expect(press(['card'], [], ['card']).inside).toBeUndefined();
    expect(press(['card', 'fixed'], [], ['card']).inside).toBeUndefined();
  });
});

describe('refitGroups', () => {
  const pathOf = (elements: Element[], id: string): GroupElement[] =>
    indexElements(elements).get(id)!.path;

  it('makes the group bound its children again without moving anything on the slide', () => {
    const elements = nested();
    const before = leafCorners(elements);
    // Move `a` up and to the left of its group, in the group's own axes.
    const frame = { x: -50, y: -30, w: 80, h: 60 };
    const placements = refitGroups(pathOf(elements, 'a'), new Map([['a', { frame }]]));
    const after = applyPlacements(elements, placements);
    const index = indexElements(after);

    // The other leaves did not move; `a` moved by (-50, -30) in its group's axes.
    const now = leafCorners(after);
    for (const id of ['top', 'b', 'c']) now[id]!.forEach((p, i) => near(p, before[id]![i]!, 2));
    const space = indexElements(elements).get('a')!.space;
    const shift = applyVector(space, { x: -50, y: -30 });
    now.a!.forEach((p, i) =>
      near(p, { x: before.a![i]!.x + shift.x, y: before.a![i]!.y + shift.y }, 2),
    );

    // Each group's frame is the box around its children: they start at 0, 0 and fill it.
    for (const id of ['inner', 'outer']) {
      const group = index.get(id)!.element as GroupElement;
      const boxes = group.children.map((c) => slideBoundsInParent(c));
      expect(Math.min(...boxes.map((b) => b.x))).toBeCloseTo(0, 2);
      expect(Math.min(...boxes.map((b) => b.y))).toBeCloseTo(0, 2);
      expect(Math.max(...boxes.map((b) => b.x + b.w))).toBeCloseTo(group.frame.w, 2);
      expect(Math.max(...boxes.map((b) => b.y + b.h))).toBeCloseTo(group.frame.h, 2);
    }
    // The siblings of `a` shifted the other way.
    expect(placements.get('b')?.frame).toMatchObject({ x: 170, y: 90 });
  });

  it('changes nothing when the children still fill the group', () => {
    const group = createElement.group({
      id: 'g',
      frame: { x: 0, y: 0, w: 300, h: 100 },
      children: [
        rect('a', 0, 0, 100, 100),
        rect('b', 100, 20, 50, 50),
        rect('c', 200, 0, 100, 100),
      ],
    });
    const frame = { x: 120, y: 30, w: 50, h: 50 };
    const placements = refitGroups([group], new Map([['b', { frame }]]));
    expect([...placements]).toEqual([['b', { frame }]]);
  });

  it('follows a rotation of a child, and keeps the rotation in its placement', () => {
    const group = createElement.group({
      id: 'g',
      frame: { x: 100, y: 100, w: 100, h: 50 },
      children: [rect('a', 0, 0, 100, 50)],
    });
    const before = leafCorners([{ ...group, children: [{ ...group.children[0]!, rotation: 90 }] }]);
    const placements = refitGroups([group], new Map([['a', { rotation: 90 }]]));
    expect(placements.get('a')).toEqual({ rotation: 90, frame: { x: -25, y: 25, w: 100, h: 50 } });
    expect(placements.get('g')).toEqual({ frame: { x: 125, y: 75, w: 50, h: 100 } });
    const after = leafCorners(applyPlacements([group], placements));
    after.a!.forEach((p, i) => near(p, before.a![i]!, 2));
  });

  it('shrinks around what is left when a child is removed, and goes with its last child', () => {
    const elements = nested();
    const before = leafCorners(elements);
    const placements = refitGroups(pathOf(elements, 'a'), new Map([['a', null]]));
    expect(placements.get('a')).toBeNull();
    const after = leafCorners(applyPlacements(elements, placements));
    for (const id of ['top', 'b', 'c']) after[id]!.forEach((p, i) => near(p, before[id]![i]!, 2));
    const inner = placements.get('inner')?.frame;
    // What is left is `b`, 80 x 60 turned by 45 degrees.
    expect(inner?.w).toBeCloseTo(140 / Math.SQRT2, 2);

    const gone = refitGroups(
      pathOf(elements, 'a'),
      new Map([
        ['a', null],
        ['b', null],
      ]),
    );
    expect(gone.get('inner')).toBeNull();
    expect(gone.get('outer')?.frame).toMatchObject({ w: 100, h: 200 });
  });

  it('adds the frames of the groups to the patches of a gesture', () => {
    const group = createElement.group({
      id: 'g',
      frame: { x: 10, y: 10, w: 100, h: 100 },
      children: [rect('a', 0, 0, 100, 100), rect('b', 20, 20, 10, 10)],
    });
    const patches = new Map([['b', { frame: { x: -20, y: 20, w: 10, h: 10 }, name: 'kept' }]]);
    const out = refitPatches([group], patches);
    expect(out.get('b')).toEqual({ frame: { x: 0, y: 20, w: 10, h: 10 }, name: 'kept' });
    expect(out.get('a')).toEqual({ frame: { x: 20, y: 0, w: 100, h: 100 } });
    expect(out.get('g')).toEqual({ frame: { x: -10, y: 10, w: 120, h: 100 } });
    // At the top level of the slide there is nothing to fit.
    expect(refitPatches([], patches)).toEqual(patches);
  });

  it('fits every group of a tree, innermost first', () => {
    const inner = createElement.group({
      id: 'inner',
      // Too small for its child, which hangs out by 50 on the right.
      frame: { x: 100, y: 0, w: 50, h: 50 },
      children: [rect('a', 0, 0, 100, 50)],
    });
    const outer = createElement.group({
      id: 'outer',
      frame: { x: 0, y: 0, w: 150, h: 50 },
      children: [rect('b', 0, 0, 50, 50), inner],
    });
    const before = leafCorners([outer]);
    const fixes = refitAll([outer]);
    expect(fixes.get('inner')).toEqual({ frame: { x: 100, y: 0, w: 100, h: 50 } });
    expect(fixes.get('outer')).toEqual({ frame: { x: 0, y: 0, w: 200, h: 50 } });
    const after = leafCorners(applyPlacements([outer], fixes));
    for (const id of ['a', 'b']) after[id]!.forEach((p, i) => near(p, before[id]![i]!, 2));
    // A tree that is already fitted needs nothing.
    expect(refitAll(applyPlacements([outer], fixes)).size).toBe(0);
  });
});

describe('snapCandidates', () => {
  it('offers what stays put next to the moving elements, not the groups around them', () => {
    const index = indexElements(nested());
    const ids = (moving: string[]) => {
      const boxes = snapCandidates(index, new Set(moving));
      return [...index.values()]
        .filter((l) => boxes.some((b) => JSON.stringify(b) === JSON.stringify(slideBounds(l))))
        .map((l) => l.element.id);
    };
    expect(ids(['top'])).toEqual(['outer']);
    expect(ids(['outer'])).toEqual(['top']);
    // A child of the inner group: its sibling, and the siblings of the groups around it.
    expect(ids(['a'])).toEqual(['top', 'c', 'b']);
  });
});

describe('resizeGroup', () => {
  const group = () =>
    createElement.group({
      id: 'g',
      frame: { x: 100, y: 100, w: 200, h: 100 },
      children: [
        rect('a', 0, 0, 100, 100),
        createElement.line({
          id: 'l',
          frame: { x: 100, y: 0, w: 100, h: 50 },
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 0 },
          ],
        }),
        createElement.group({
          id: 'inner',
          frame: { x: 100, y: 50, w: 100, h: 50 },
          children: [rect('b', 0, 0, 40, 50), rect('c', 60, 10, 40, 40)],
        }),
      ],
    });

  it('stretches everything in the group with its frame, at any depth', () => {
    const frame = { x: 100, y: 100, w: 400, h: 300 };
    const out = resizeGroup(group(), frame);
    expect(out.get('g')).toEqual({ frame });
    expect(out.get('a')).toEqual({ frame: { x: 0, y: 0, w: 200, h: 300 } });
    expect(out.get('l')).toEqual({
      frame: { x: 200, y: 0, w: 200, h: 150 },
      points: [
        { x: 0, y: 150 },
        { x: 200, y: 0 },
      ],
    });
    expect(out.get('inner')).toEqual({ frame: { x: 200, y: 150, w: 200, h: 150 } });
    expect(out.get('b')).toEqual({ frame: { x: 0, y: 0, w: 80, h: 150 } });
    expect(out.get('c')).toEqual({ frame: { x: 120, y: 30, w: 80, h: 120 } });
  });

  it('sizes a child turned by a quarter along the other axis', () => {
    const turned = createElement.group({
      id: 'g',
      frame: { x: 0, y: 0, w: 100, h: 200 },
      children: [rect('a', -50, 50, 200, 100, 90)],
    });
    const out = resizeGroup(turned, { x: 0, y: 0, w: 300, h: 200 });
    // Drawn 100 wide and 200 high; three times as wide now.
    expect(out.get('a')).toEqual({ frame: { x: 50, y: -50, w: 200, h: 300 } });
    expect(out.get('g')).toEqual({ frame: { x: 0, y: 0, w: 300, h: 200 } });
  });

  it('keeps a turned child exact when the group grows evenly, and fits the group otherwise', () => {
    const turned = createElement.group({
      id: 'g',
      frame: { x: 0, y: 0, w: 100, h: 100 },
      children: [rect('a', 0, 0, 100, 100), rect('b', 20, 30, 40, 20, 30)],
    });
    const even = resizeGroup(turned, { x: 0, y: 0, w: 200, h: 200 });
    expect(even.get('b')).toEqual({ frame: { x: 40, y: 60, w: 80, h: 40 } });
    expect(even.get('g')).toEqual({ frame: { x: 0, y: 0, w: 200, h: 200 } });
    // Stretched one way only, the box of a turned child is an approximation, and the group is
    // whatever box its children come to.
    const lone = createElement.group({
      id: 'g',
      frame: { x: 0, y: 0, w: 100, h: 100 },
      children: [rect('b', 0, 0, 100, 100, 45)],
    });
    const wide = resizeGroup(lone, { x: 0, y: 0, w: 200, h: 100 });
    const after = applyPlacements([lone], wide)[0] as GroupElement;
    const b = slideBoundsInParent(after.children[0]!);
    expect(b.x).toBeCloseTo(0, 2);
    expect(b.w).toBeCloseTo(after.frame.w, 2);
    expect(b.h).toBeCloseTo(after.frame.h, 2);
  });

  it('resizes several elements together, around the box they share', () => {
    const elements = [rect('solo', 100, 100, 100, 50), group()];
    // `solo` and the group `g` (at 100, 100, 200 x 100) fill 100, 100, 200 x 100 between them.
    const from = { x: 100, y: 100, w: 200, h: 100 };
    const out = resizeTogether(elements, from, { x: 50, y: 100, w: 400, h: 100 });
    expect(out.get('solo')).toEqual({ frame: { x: 50, y: 100, w: 200, h: 50 } });
    expect(out.get('g')).toEqual({ frame: { x: 50, y: 100, w: 400, h: 100 } });
    // What is inside the group is in the group's own coordinates: stretched, not moved.
    expect(out.get('inner')).toEqual({ frame: { x: 200, y: 50, w: 200, h: 50 } });
    expect(out.get('c')).toEqual({ frame: { x: 120, y: 10, w: 80, h: 40 } });
  });
});

/** The rotated bounds of an element in its parent's coordinates. */
function slideBoundsInParent(element: Element) {
  return slideBounds({
    element,
    path: [],
    order: 0,
    space: IDENTITY,
    hidden: false,
    locked: false,
  });
}
