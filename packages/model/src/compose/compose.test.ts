import { describe, expect, it } from 'vitest';
import { CommandBus } from '../bus';
import { CommandError, type Command } from '../commands';
import { createDeck, createElement, createSlide } from '../factories';
import { allElementsDeck, hebrewDeck } from '../fixtures';
import { rotatedBounds } from '../geometry';
import { allElementIds, findElement, findSlide, walkElements } from '../queries';
import type { Deck, Element, Frame } from '../schema';
import {
  alignElements,
  assetsUsedBy,
  canReorder,
  detachElements,
  distributeElements,
  duplicateElements,
  duplicateSlide,
  groupElements,
  pasteElements,
  pasteSlides,
  reorderElements,
  slideFromLayout,
} from './index';

const box = (x: number, y: number, w = 100, h = 100): Frame => ({ x, y, w, h });
const rect = (id: string, frame: Frame, extra: Partial<Element> = {}) =>
  createElement.shape({ id, frame, ...extra });

function deckWith(...elements: Element[]): Deck {
  return createDeck({ slides: [createSlide({ id: 's1', elements })] });
}

/** Applies commands through a validating bus and returns the resulting deck. */
function apply(deck: Deck, commands: Command[]): Deck {
  const bus = new CommandBus(deck, { validate: true });
  bus.batch(commands);
  return bus.deck;
}

const frameOf = (deck: Deck, id: string) => findElement(deck.slides[0]!, id)!.frame;

describe('duplicateSlide', () => {
  it('copies a slide with new ids for the slide, its elements and its steps', () => {
    const deck = allElementsDeck();
    const command = duplicateSlide(deck, 's_all');
    expect(command.index).toBe(1);
    const after = apply(deck, [command]);
    const copy = after.slides[1]!;
    expect(copy.id).not.toBe('s_all');
    expect(copy.name).toBe('All element types');

    const oldIds = allElementIds(deck);
    const newIds = [...walkElements(copy.elements)].map((e) => e.id);
    expect(newIds).toHaveLength([...walkElements(deck.slides[0]!.elements)].length);
    for (const id of newIds) expect(oldIds.has(id)).toBe(false);

    const titleCopy = copy.elements[0]!.id;
    expect(copy.timeline[0]).toMatchObject({ elementId: titleCopy, preset: 'rise' });
    expect(copy.timeline.map((s) => s.id)).not.toContain('a_title');
    // The original is untouched.
    expect(after.slides[0]).toEqual(deck.slides[0]);
  });

  it('renames element ids in the slide CSS, whole words only', () => {
    const deck = createDeck({
      slides: [
        createSlide({
          id: 's1',
          elements: [rect('e_a', box(0, 0)), rect('e_ab', box(0, 0))],
          css: '[data-element-id="e_a"] { color: red } [data-element-id="e_ab"] { color: blue }',
        }),
      ],
    });
    const { slide } = duplicateSlide(deck, 's1');
    const [a, ab] = slide.elements.map((e) => e.id);
    expect(slide.css).toBe(
      `[data-element-id="${a}"] { color: red } [data-element-id="${ab}"] { color: blue }`,
    );
  });

  it('takes a position and reports a missing slide', () => {
    const deck = hebrewDeck();
    expect(duplicateSlide(deck, 's_he_number', { index: 0 }).index).toBe(0);
    expect(() => duplicateSlide(deck, 's_gone')).toThrow(/may have been deleted/);
  });
});

describe('duplicateElements', () => {
  it('copies on top, in z-order, with an offset, and keeps nested copies in their group', () => {
    const deck = allElementsDeck();
    const commands = duplicateElements(deck, 's_all', ['e_group_text', 'e_shape', 'e_text'], {
      offset: { x: 20, y: 20 },
    });
    expect(commands.map((c) => c.parentId)).toEqual([undefined, undefined, 'e_group']);
    expect(commands[0]!.element.frame).toEqual({ x: 100, y: 80, w: 900, h: 120 });
    const after = apply(deck, commands);
    const top = after.slides[0]!.elements;
    expect(top.at(-2)!.id).toBe(commands[0]!.element.id);
    expect(top.at(-1)!.id).toBe(commands[1]!.element.id);
    expect(after.slides[0]!.timeline).toEqual(deck.slides[0]!.timeline);
  });

  it('copies a group once, with new ids inside, and to another slide at its slide position', () => {
    const deck = allElementsDeck();
    const [command] = duplicateElements(deck, 's_all', ['e_group', 'e_group_bg']);
    expect(command!.element.id).not.toBe('e_group');
    const inner = (command!.element as Extract<Element, { type: 'group' }>).children;
    expect(inner.map((c) => c.id)).not.toContain('e_group_bg');

    const [moved] = duplicateElements(deck, 's_all', ['e_group_text'], { toSlideId: 's_empty' });
    expect(moved).toMatchObject({ slideId: 's_empty', element: { frame: { x: 104, y: 484 } } });
    expect(moved!.parentId).toBeUndefined();
    apply(deck, [command!, moved!]);
  });

  it('reports an element that is gone', () => {
    expect(() => duplicateElements(allElementsDeck(), 's_all', ['e_gone'])).toThrow(CommandError);
  });
});

describe('alignElements', () => {
  const deck = deckWith(rect('a', box(100, 100)), rect('b', box(300, 250, 200, 50)));

  it.each([
    ['left', { a: 100, b: 100 }, 'x'],
    ['right', { a: 400, b: 300 }, 'x'],
    ['center', { a: 250, b: 200 }, 'x'],
    ['top', { a: 100, b: 100 }, 'y'],
    ['bottom', { a: 200, b: 250 }, 'y'],
    ['middle', { a: 150, b: 175 }, 'y'],
  ] as const)('aligns to the %s of the selection', (edge, expected, axis) => {
    const after = apply(deck, alignElements(deck.slides[0]!, ['a', 'b'], edge));
    expect(frameOf(after, 'a')[axis]).toBe(expected.a);
    expect(frameOf(after, 'b')[axis]).toBe(expected.b);
  });

  it('produces nothing for elements already in place', () => {
    expect(alignElements(deck.slides[0]!, ['a', 'b'], 'left').map((c) => c.elementId)).toEqual([
      'b',
    ]);
  });

  it('aligns a single element to the slide by default', () => {
    const after = apply(deck, alignElements(deck.slides[0]!, ['b'], 'center'));
    expect(frameOf(after, 'b').x).toBe(860);
  });

  it('aligns a rotated element by the box it covers on screen', () => {
    const rotated = deckWith(rect('r', box(500, 500, 200, 100), { rotation: 90 }));
    const after = apply(rotated, alignElements(rotated.slides[0]!, ['r'], 'left', 'slide'));
    const shown = rotatedBounds(frameOf(after, 'r'), 90);
    expect(shown.x).toBeCloseTo(0);
  });

  it('aligns inside a group against the slide, in the group coordinates', () => {
    const grouped = deckWith(
      createElement.group({
        id: 'g',
        frame: box(400, 300, 300, 300),
        children: [rect('c1', box(10, 10)), rect('c2', box(100, 100))],
      }),
    );
    const after = apply(grouped, alignElements(grouped.slides[0]!, ['c1'], 'top', 'slide'));
    expect(findElement(after.slides[0]!, 'c1')!.frame.y).toBe(-300);
  });

  it('refuses elements of different parents, and moves no locked element', () => {
    const slide = allElementsDeck().slides[0]!;
    expect(() => alignElements(slide, ['e_text', 'e_group_text'], 'left')).toThrow(
      /not in the same group/,
    );
    const locked = deckWith(rect('a', box(0, 0)), rect('b', box(50, 50), { locked: true }));
    expect(alignElements(locked.slides[0]!, ['a', 'b'], 'right').map((c) => c.elementId)).toEqual([
      'a',
    ]);
  });
});

describe('distributeElements', () => {
  const deck = deckWith(
    rect('a', box(0, 0, 100)),
    rect('c', box(900, 0, 100)),
    rect('b', box(150, 0, 200)),
  );

  it('evens the gaps between the outermost elements', () => {
    const after = apply(deck, distributeElements(deck.slides[0]!, ['a', 'b', 'c'], 'horizontal'));
    expect(frameOf(after, 'a').x).toBe(0);
    expect(frameOf(after, 'b').x).toBe(400);
    expect(frameOf(after, 'c').x).toBe(900);
  });

  it('spreads against the slide edges', () => {
    const after = apply(
      deck,
      distributeElements(deck.slides[0]!, ['a', 'c'], 'horizontal', 'slide'),
    );
    expect(frameOf(after, 'a').x).toBe(0);
    expect(frameOf(after, 'c').x).toBe(1820);
    const one = apply(deck, distributeElements(deck.slides[0]!, ['b'], 'vertical', 'slide'));
    expect(frameOf(one, 'b').y).toBe(490);
  });

  it('needs three elements against the selection', () => {
    expect(() => distributeElements(deck.slides[0]!, ['a', 'b'], 'vertical')).toThrow(
      /at least three/,
    );
  });
});

describe('reorderElements and groupElements', () => {
  it('reorders within each parent', () => {
    const deck = allElementsDeck();
    const commands = reorderElements(deck.slides[0]!, ['e_text', 'e_group_bg'], 'front');
    expect(commands).toHaveLength(2);
    const after = apply(deck, commands);
    const slide = findSlide(after, 's_all')!;
    expect(slide.elements.at(-1)!.id).toBe('e_text');
    const group = findElement(slide, 'e_group') as Extract<Element, { type: 'group' }>;
    expect(group.children.at(-1)!.id).toBe('e_group_bg');
  });

  it('groups with a fresh id', () => {
    const deck = allElementsDeck();
    const command = groupElements(deck, 's_all', ['e_shape', 'e_line'], { name: 'pair' });
    expect(allElementIds(deck).has(command.groupId)).toBe(false);
    const after = apply(deck, [command]);
    expect(findElement(after.slides[0]!, command.groupId)).toMatchObject({ name: 'pair' });
  });

  it('knows when a z-order move would change nothing', () => {
    const slide = deckWith(rect('a', box(0, 0)), rect('b', box(0, 0)), rect('c', box(0, 0)))
      .slides[0]!;
    // Bottom to top: a, b, c.
    expect(canReorder(slide, ['c'], 'front')).toBe(false);
    expect(canReorder(slide, ['c'], 'forward')).toBe(false);
    expect(canReorder(slide, ['c'], 'backward')).toBe(true);
    expect(canReorder(slide, ['a'], 'back')).toBe(false);
    expect(canReorder(slide, ['a'], 'front')).toBe(true);
    expect(canReorder(slide, ['b', 'c'], 'front')).toBe(false);
    expect(canReorder(slide, ['a', 'c'], 'forward')).toBe(true);
    expect(canReorder(slide, ['a', 'c'], 'back')).toBe(true);
    expect(canReorder(slide, ['a', 'b', 'c'], 'back')).toBe(false);
    expect(canReorder(slide, ['gone'], 'front')).toBe(false);

    // Each parent on its own: the group is on top of nothing else here, its child is not.
    const nested = allElementsDeck().slides[0]!;
    expect(canReorder(nested, ['e_group_text'], 'front')).toBe(false);
    expect(canReorder(nested, ['e_group_text', 'e_text'], 'front')).toBe(true);
    // What it says is what the command does.
    for (const to of ['front', 'forward', 'backward', 'back'] as const) {
      for (const ids of [['a'], ['b'], ['c'], ['a', 'c'], ['b', 'c']]) {
        const deck = deckWith(rect('a', box(0, 0)), rect('b', box(0, 0)), rect('c', box(0, 0)));
        const after = apply(deck, reorderElements(deck.slides[0]!, ids, to));
        const moved =
          after.slides[0]!.elements.map((e) => e.id).join() !==
          deck.slides[0]!.elements.map((e) => e.id).join();
        expect(canReorder(deck.slides[0]!, ids, to)).toBe(moved);
      }
    }
  });
});

describe('detachElements and pasteElements', () => {
  it('takes elements out of their groups, at their place on the slide, in z-order', () => {
    const slide = allElementsDeck().slides[0]!;
    const taken = detachElements(slide, ['e_group_text', 'e_text', 'e_gone']);
    expect(taken.map((e) => e.id)).toEqual(['e_text', 'e_group_text']);
    expect(taken[1]!.frame).toEqual({ x: 104, y: 484, w: 352, h: 192 });
    // Copies: the slide is untouched (it is frozen in a bus, and stays as it was here).
    expect(findElement(slide, 'e_group_text')!.frame.x).toBe(24);
    // A child of a group that is taken comes with the group, once.
    const withGroup = detachElements(slide, ['e_group', 'e_group_bg']);
    expect(withGroup.map((e) => e.id)).toEqual(['e_group']);
  });

  it('pastes on top with new ids and an offset, also into another deck', () => {
    const source = allElementsDeck();
    const clip = detachElements(source.slides[0]!, ['e_shape', 'e_group']);

    const same = pasteElements(source, 's_all', clip, { offset: { x: 24, y: 24 } });
    expect(same.map((c) => c.element.frame.x)).toEqual([104, 104]);
    const after = apply(source, same);
    const top = after.slides[0]!.elements.slice(-2);
    expect(top.map((e) => e.type)).toEqual(['shape', 'group']);
    const ids = [...walkElements(top)].map((e) => e.id);
    expect(ids).toHaveLength(4);
    for (const id of ids) expect(allElementIds(source).has(id)).toBe(false);
    expect(after.slides[0]!.timeline).toEqual(source.slides[0]!.timeline);

    const other = deckWith(rect('e_shape', box(0, 0)));
    const pasted = apply(other, pasteElements(other, 's1', clip));
    expect(pasted.slides[0]!.elements).toHaveLength(3);
    expect(pasted.slides[0]!.elements[1]!.frame).toEqual(clip[0]!.frame);
    // Pasting the same clipboard twice clashes with nothing.
    apply(pasted, pasteElements(pasted, 's1', clip));
    expect(() => pasteElements(other, 's_gone', clip)).toThrow(/may have been deleted/);
  });
});

describe('pasteSlides', () => {
  it('adds copies as a block, with ids that are new across all of them', () => {
    const deck = hebrewDeck();
    const commands = pasteSlides(deck, [deck.slides[0]!, deck.slides[1]!, deck.slides[0]!], {
      index: 1,
    });
    const after = apply(deck, commands);
    expect(after.slides).toHaveLength(6);
    expect(after.slides.slice(1, 4).map((s) => s.name)).toEqual([
      deck.slides[0]!.name,
      deck.slides[1]!.name,
      deck.slides[0]!.name,
    ]);
    expect(new Set(after.slides.map((s) => s.id)).size).toBe(6);
    expect(allElementIds(after).size).toBe(
      [...deck.slides, deck.slides[0]!, deck.slides[1]!, deck.slides[0]!].reduce(
        (n, s) => n + [...walkElements(s.elements)].length,
        0,
      ),
    );
  });

  it('brings a missing layout along when it is given, and lets go of it otherwise', () => {
    const source = allElementsDeck();
    const slide = source.slides[0]!;
    const target = hebrewDeck();

    const kept = pasteSlides(target, [slide, slide], { layouts: source.layouts });
    expect(kept.map((c) => c.type)).toEqual(['layout.add', 'slide.add', 'slide.add']);
    const after = apply(target, kept);
    expect(after.layouts.map((l) => l.id)).toEqual(['l_text_image']);
    expect(after.slides.at(-1)!.layoutId).toBe('l_text_image');
    // The timeline and the CSS follow the new ids, as in duplicateSlide.
    expect(after.slides.at(-1)!.timeline[0]!.elementId).toBe(after.slides.at(-1)!.elements[0]!.id);

    const dropped = pasteSlides(target, [slide]);
    expect(dropped).toHaveLength(1);
    const added = dropped[0]!;
    expect(added.type === 'slide.add' ? added.slide.layoutId : 'not a slide').toBeUndefined();
    apply(target, dropped);

    // A deck that has the layout keeps using its own.
    expect(pasteSlides(source, [slide], { layouts: source.layouts }).map((c) => c.type)).toEqual([
      'slide.add',
    ]);
  });
});

describe('assetsUsedBy', () => {
  it('finds the assets a part of the deck refers to, wherever the id is written', () => {
    const deck = allElementsDeck();
    const slide = deck.slides[0]!;
    const names = (part: unknown) =>
      assetsUsedBy(deck, part)
        .map((a) => a.file.split('.')[1])
        .sort();
    expect(names(detachElements(slide, ['e_image']))).toEqual(['jpg']);
    expect(names(detachElements(slide, ['e_video', 'e_text']))).toEqual(['mp4', 'png']);
    expect(names(detachElements(slide, ['e_text']))).toEqual([]);
    // The whole slide: also its background image, but not the font or the unused picture.
    expect(names(slide)).toEqual(['jpg', 'mp3', 'mp4', 'png', 'svg']);
    const html = createElement.html({
      frame: box(0, 0),
      markup: `<img data-asset="${'2'.repeat(64)}">`,
    });
    expect(names([html])).toEqual(['svg']);
  });
});

describe('slideFromLayout', () => {
  it('makes a slide of the layout with an empty element per text or picture placeholder', () => {
    const deck = allElementsDeck();
    const command = slideFromLayout(deck, 'l_text_image', { index: 1 });
    expect(command.index).toBe(1);
    const { slide } = command;
    expect(slide.layoutId).toBe('l_text_image');
    expect(slide.elements.map((e) => [e.type, e.role])).toEqual([
      ['text', 'title'],
      ['text', 'body'],
      ['image', 'image'],
    ]);
    const [title, , image] = slide.elements;
    expect(title).toMatchObject({
      frame: { x: 160, y: 140, w: 760, h: 160 },
      vAlign: 'top',
      content: { paragraphs: [{ styleRef: 'title', align: 'start', runs: [] }] },
    });
    expect(image).toMatchObject({ frame: { x: 1000, y: 0, w: 920, h: 1080 } });
    // The decorations stay with the layout: the renderer draws them for a slide that points at it.
    expect(slide.elements.some((e) => e.id === 'e_layout_bar')).toBe(false);
    const after = apply(deck, [command]);
    expect(after.slides[1]!.id).toBe(slide.id);
  });

  it('gives the text of a placeholder the colour the placeholder names, as a copy of its own', () => {
    const ink = { token: 'bg' } as const;
    const deck = createDeck({
      layouts: [
        {
          id: 'l_card',
          name: 'Card',
          archetype: 'cards',
          placeholders: [
            { id: 'p_title', role: 'title', frame: box(96, 80, 800, 80), styleRef: 'title' },
            { id: 'p_body', role: 'body', frame: box(96, 200, 800, 200), color: ink },
          ],
          decorations: [],
        },
      ],
    });
    const [title, body] = slideFromLayout(deck, 'l_card').slide.elements;
    // Without a colour of the placeholder's, the text has its text style's.
    expect(title).not.toHaveProperty('color');
    const given = body?.type === 'text' ? body.color : undefined;
    expect(given).toEqual(ink);
    expect(given).not.toBe(deck.layouts[0]!.placeholders[1]!.color);
  });

  it('gives a chart and a table their elements, skips the slide number, and reports a missing layout', () => {
    const deck = createDeck({
      lang: 'he',
      layouts: [
        {
          id: 'l_chart',
          name: 'Chart',
          archetype: 'chart',
          placeholders: [
            {
              id: 'p_title',
              role: 'title',
              frame: box(0, 0, 800, 100),
              align: 'center',
              vAlign: 'middle',
            },
            { id: 'p_chart', role: 'chart', frame: box(0, 200, 800, 600) },
            { id: 'p_table', role: 'table', frame: box(900, 200, 900, 600) },
            { id: 'p_number', role: 'slideNumber', frame: box(0, 900, 100, 50) },
            { id: 'p_logo', role: 'logo', frame: box(1700, 900, 120, 60) },
          ],
          decorations: [],
        },
      ],
    });
    const { slide, index } = slideFromLayout(deck, 'l_chart');
    expect(index).toBeUndefined();
    // One element per placeholder, in their order; nothing shows a slide number yet.
    expect(slide.elements.map((e) => [e.type, e.role])).toEqual([
      ['text', 'title'],
      ['chart', 'chart'],
      ['table', 'table'],
      ['image', 'logo'],
    ]);
    expect(slide.elements[0]).toMatchObject({
      vAlign: 'middle',
      content: { paragraphs: [{ align: 'center' }] },
    });
    expect(slide.elements[1]).toMatchObject({
      frame: box(0, 200, 800, 600),
      data: { categories: [], series: [] },
    });
    // An empty grid that fills the placeholder, with its columns in the deck's direction.
    expect(slide.elements[2]).toMatchObject({
      frame: box(900, 200, 900, 600),
      rows: [200, 200, 200],
      cols: [300, 300, 300],
      dir: 'rtl',
    });
    apply(deck, [{ type: 'slide.add', slide }]);
    expect(() => slideFromLayout(deck, 'l_gone')).toThrow(CommandError);
  });
});
