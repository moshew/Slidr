import { describe, expect, it } from 'vitest';
import cases from '../assetFileNames.cases.json';
import { CommandBus } from '../bus';
import { createDeck, createElement, createSlide, plainText, richText } from '../factories';
import { allElementsDeck, hebrewDeck } from '../fixtures';
import { findElement, findSlide, isAssetFileName } from '../queries';
import type { Deck, Element, GroupElement, Layout } from '../schema';
import {
  commandDefs,
  CommandError,
  updateElement,
  type Command,
  type CommandOf,
  type CommandType,
} from './index';

const covered = new Set<CommandType>();

/**
 * Applies a command, checks the result, then checks that undo restores the deck exactly and
 * redo brings the result back (definition of done: an undo/redo test for every command).
 */
function check(deck: Deck, command: Command, verify: (after: Deck, before: Deck) => void): Deck {
  const bus = new CommandBus(deck, { validate: true });
  const before = bus.deck;
  bus.dispatch(command);
  const after = bus.deck;
  expect(after).not.toBe(before);
  verify(after, before);
  expect(bus.undo()).toBe(true);
  expect(bus.deck).toEqual(before);
  expect(bus.redo()).toBe(true);
  expect(bus.deck).toEqual(after);
  covered.add(command.type);
  return after;
}

function rejects(deck: Deck, command: Command, code: CommandError['code']): void {
  const bus = new CommandBus(deck, { validate: true });
  const before = bus.deck;
  let error: unknown;
  try {
    bus.dispatch(command);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(CommandError);
  expect((error as CommandError).code).toBe(code);
  expect(bus.deck).toBe(before);
  expect(bus.canUndo).toBe(false);
}

const box = (x: number, y: number, w = 100, h = 100) => ({ x, y, w, h });

/** A deck with one slide holding the given elements. */
function deckWith(...elements: Element[]): Deck {
  return createDeck({ slides: [createSlide({ id: 's1', elements })] });
}

const rect = (id: string, frame = box(0, 0)) => createElement.shape({ id, frame });

function ids(deck: Deck, slideId = 's1'): string[] {
  return findSlide(deck, slideId)!.elements.map((e) => e.id);
}

const elementOf = (deck: Deck, id: string, slideId = 's_all') =>
  findElement(findSlide(deck, slideId)!, id)!;

describe('deck and theme commands', () => {
  it('deck.setMeta changes and clears fields', () => {
    const start = hebrewDeck();
    check(start, { type: 'deck.setMeta', patch: { title: 'New', imageStyle: 'flat' } }, (d) => {
      expect(d.meta.title).toBe('New');
      expect(d.meta.imageStyle).toBe('flat');
    });
    const withStyle = { ...start, meta: { ...start.meta, imageStyle: 'flat' } };
    check(withStyle, { type: 'deck.setMeta', patch: { imageStyle: null } }, (d) => {
      expect('imageStyle' in d.meta).toBe(false);
    });
  });

  it('theme.update merges colours, fonts and text styles key by key', () => {
    const start = hebrewDeck();
    check(
      start,
      {
        type: 'theme.update',
        patch: {
          colors: { primary: '#ff0000' },
          fonts: { heading: { he: 'Rubik', latin: 'Poppins' } },
          textStyles: { body: { ...start.theme.textStyles.body, size: 32 } },
          radius: 4,
        },
      },
      (d, before) => {
        expect(d.theme.colors.primary).toBe('#ff0000');
        expect(d.theme.colors.accent).toBe(before.theme.colors.accent);
        expect(d.theme.fonts.heading.he).toBe('Rubik');
        expect(d.theme.fonts.body).toEqual(before.theme.fonts.body);
        expect(d.theme.textStyles.body.size).toBe(32);
        expect(d.theme.textStyles.title).toEqual(before.theme.textStyles.title);
        expect(d.theme.radius).toBe(4);
      },
    );
  });

  it('theme.replace swaps the whole theme', () => {
    const start = hebrewDeck();
    const theme = { ...start.theme, id: 'other', name: 'Other' };
    check(start, { type: 'theme.replace', theme }, (d) => expect(d.theme.id).toBe('other'));
  });

  it('asset.add registers an asset once', () => {
    const start = hebrewDeck();
    const asset = {
      id: 'f'.repeat(64),
      file: `${'f'.repeat(64)}.png`,
      mime: 'image/png',
      kind: 'image' as const,
      bytes: 10,
      origin: 'upload' as const,
    };
    const after = check(start, { type: 'asset.add', asset }, (d) => {
      expect(d.assets[asset.id]).toEqual(asset);
    });
    const bus = new CommandBus(after);
    bus.dispatch({ type: 'asset.add', asset: { ...asset, name: 'other' } });
    expect(bus.canUndo).toBe(false);
  });

  it('asset.add refuses a file that is a path or an address, and says what it wants', () => {
    const asset = {
      id: 'logo',
      mime: 'image/png',
      kind: 'image' as const,
      bytes: 10,
      origin: 'upload' as const,
    };
    // What a model writes when it wants a picture from the web, or from the disk, on a slide:
    // the storage layer can never put such an asset in the file.
    for (const file of ['https://example.com/logo.png', 'C:\\Users\\me\\logo.png', 'img/a.png']) {
      rejects(hebrewDeck(), { type: 'asset.add', asset: { ...asset, file } }, 'invalid_payload');
    }
    const bus = new CommandBus(hebrewDeck());
    expect(() =>
      bus.dispatch({ type: 'asset.add', asset: { ...asset, file: 'https://example.com/a.png' } }),
    ).toThrow(/"file" must be the name of a file .* "https:\/\/example\.com\/a\.png"/);
    // One bad asset refuses the batch it came in: no element is left pointing at it.
    const slideId = bus.deck.slides[0]!.id;
    expect(() =>
      bus.batch([
        { type: 'asset.add', asset: { ...asset, file: '../deck.json' } },
        {
          type: 'element.add',
          slideId,
          element: createElement.image({
            id: 'e_logo',
            frame: { x: 0, y: 0, w: 10, h: 10 },
            assetId: 'logo',
          }),
        },
      ]),
    ).toThrow(CommandError);
    expect(findElement(findSlide(bus.deck, slideId)!, 'e_logo')).toBeUndefined();
  });
});

describe('isAssetFileName', () => {
  // The list the storage layer's `is_plain_file_name` is tested against too (storage/deck.rs).
  it.each(cases.fileNames)('takes %j', (name) => {
    expect(isAssetFileName(name)).toBe(true);
  });

  it.each(cases.notFileNames)('refuses %j', (name) => {
    expect(isAssetFileName(name)).toBe(false);
  });
});

describe('asset.remove', () => {
  const asset = (id: string, kind: 'image' | 'font' = 'image') => ({
    id,
    file: `${id}.png`,
    mime: 'image/png',
    kind,
    bytes: 10,
    origin: 'upload' as const,
  });
  /** A deck with three assets: one an image of the first slide shows, one free, one a font. */
  function withAssets(): Deck {
    const deck = hebrewDeck();
    const [used, free, font] = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
    const bus = new CommandBus(deck);
    bus.batch([
      { type: 'asset.add', asset: asset(used) },
      { type: 'asset.add', asset: asset(free) },
      { type: 'asset.add', asset: asset(font, 'font') },
      {
        type: 'element.add',
        slideId: deck.slides[0]!.id,
        element: createElement.image({
          id: 'e_picture',
          frame: { x: 0, y: 0, w: 100, h: 100 },
          assetId: used,
        }),
      },
    ]);
    return bus.deck;
  }

  it('takes an asset nothing uses out of the table, and undo brings it back', () => {
    const start = withAssets();
    check(start, { type: 'asset.remove', assetIds: ['b'.repeat(64)] }, (after, before) => {
      expect(after.assets['b'.repeat(64)]).toBeUndefined();
      expect(Object.keys(after.assets)).toHaveLength(Object.keys(before.assets).length - 1);
      expect(after.slides).toBe(before.slides);
    });
  });

  it('refuses an asset a slide still uses, a font, and one that is not there', () => {
    const start = withAssets();
    rejects(start, { type: 'asset.remove', assetIds: ['a'.repeat(64)] }, 'invalid_state');
    rejects(start, { type: 'asset.remove', assetIds: ['c'.repeat(64)] }, 'invalid_state');
    rejects(start, { type: 'asset.remove', assetIds: ['d'.repeat(64)] }, 'not_found');
    // All or nothing: the free one stays when another in the same command is refused.
    rejects(
      start,
      { type: 'asset.remove', assetIds: ['b'.repeat(64), 'a'.repeat(64)] },
      'invalid_state',
    );
  });
});

describe('layout commands', () => {
  const layout: Layout = {
    id: 'l_new',
    name: 'New',
    archetype: 'hero',
    placeholders: [{ id: 'p1', role: 'title', frame: box(0, 0) }],
    decorations: [],
  };

  it('layout.add, rejecting a taken id', () => {
    const start = allElementsDeck();
    check(start, { type: 'layout.add', layout, index: 0 }, (d) => {
      expect(d.layouts.map((l) => l.id)).toEqual(['l_new', 'l_text_image']);
    });
    rejects(start, { type: 'layout.add', layout: { ...layout, id: 'l_text_image' } }, 'conflict');
  });

  it('layout.update replaces fields', () => {
    check(
      allElementsDeck(),
      {
        type: 'layout.update',
        layoutId: 'l_text_image',
        patch: { name: 'Renamed', decorations: [] },
      },
      (d) => {
        expect(d.layouts[0]!.name).toBe('Renamed');
        expect(d.layouts[0]!.decorations).toEqual([]);
      },
    );
    rejects(allElementsDeck(), { type: 'layout.update', layoutId: 'nope', patch: {} }, 'not_found');
  });

  it('layout.remove unlinks the slides that used it', () => {
    check(allElementsDeck(), { type: 'layout.remove', layoutId: 'l_text_image' }, (d) => {
      expect(d.layouts).toEqual([]);
      expect(findSlide(d, 's_all')!.layoutId).toBeUndefined();
      expect(findSlide(d, 's_all')!.elements.length).toBeGreaterThan(0);
    });
  });
});

describe('slide commands', () => {
  it('slide.add inserts at an index, or at the end', () => {
    const start = hebrewDeck();
    check(start, { type: 'slide.add', slide: createSlide({ id: 's_new' }), index: 1 }, (d) => {
      expect(d.slides.map((s) => s.id)).toEqual([
        's_he_hero',
        's_new',
        's_he_goals',
        's_he_number',
      ]);
    });
    check(start, { type: 'slide.add', slide: createSlide({ id: 's_new' }) }, (d) => {
      expect(d.slides.at(-1)!.id).toBe('s_new');
    });
  });

  it('slide.add rejects ids already in use and dangling references', () => {
    const start = hebrewDeck();
    rejects(start, { type: 'slide.add', slide: createSlide({ id: 's_he_hero' }) }, 'conflict');
    const clash = createSlide({ id: 's_x', elements: [rect('e_he_hero_title')] });
    rejects(start, { type: 'slide.add', slide: clash }, 'conflict');
    const twice = createSlide({ id: 's_x', elements: [rect('e_a'), rect('e_a')] });
    rejects(start, { type: 'slide.add', slide: twice }, 'conflict');
    rejects(
      start,
      { type: 'slide.add', slide: createSlide({ id: 's_x', layoutId: 'l_x' }) },
      'not_found',
    );
    const step = {
      id: 'a1',
      elementId: 'e_missing',
      trigger: 'onClick' as const,
      category: 'entrance' as const,
      preset: 'fade',
      duration: 1,
      delay: 0,
      easing: 'linear',
    };
    rejects(
      start,
      { type: 'slide.add', slide: createSlide({ id: 's_x', timeline: [step] }) },
      'not_found',
    );
  });

  it('slide.remove removes several slides', () => {
    check(hebrewDeck(), { type: 'slide.remove', slideIds: ['s_he_hero', 's_he_number'] }, (d) => {
      expect(d.slides.map((s) => s.id)).toEqual(['s_he_goals']);
    });
    rejects(hebrewDeck(), { type: 'slide.remove', slideIds: ['s_gone'] }, 'not_found');
  });

  it('slide.move keeps the deck order of the moved slides', () => {
    check(
      hebrewDeck(),
      { type: 'slide.move', slideIds: ['s_he_number', 's_he_hero'], toIndex: 1 },
      (d) => {
        expect(d.slides.map((s) => s.id)).toEqual(['s_he_goals', 's_he_hero', 's_he_number']);
      },
    );
    const bus = new CommandBus(hebrewDeck());
    bus.dispatch({ type: 'slide.move', slideIds: ['s_he_hero'], toIndex: 0 });
    expect(bus.canUndo).toBe(false);
  });

  it('slide.update sets and clears fields', () => {
    const after = check(
      hebrewDeck(),
      {
        type: 'slide.update',
        slideId: 's_he_goals',
        patch: { hidden: true, notes: richText('הערה'), css: '' },
      },
      (d) => {
        const slide = findSlide(d, 's_he_goals')!;
        expect(slide.hidden).toBe(true);
        expect(plainText(slide.notes!)).toBe('הערה');
      },
    );
    check(
      after,
      { type: 'slide.update', slideId: 's_he_goals', patch: { hidden: null, notes: null } },
      (d) => {
        const slide = findSlide(d, 's_he_goals')!;
        expect('hidden' in slide).toBe(false);
        expect('notes' in slide).toBe(false);
      },
    );
    rejects(
      hebrewDeck(),
      { type: 'slide.update', slideId: 's_he_goals', patch: { layoutId: 'l_x' } },
      'not_found',
    );
  });

  it('slide.setTimeline replaces the timeline and checks its targets', () => {
    const step = {
      id: 'a_new',
      elementId: 'e_group_text',
      trigger: 'onClick' as const,
      category: 'emphasis' as const,
      preset: 'pulse',
      duration: 300,
      delay: 0,
      easing: 'ease',
    };
    check(
      allElementsDeck(),
      { type: 'slide.setTimeline', slideId: 's_all', timeline: [step] },
      (d) => {
        expect(findSlide(d, 's_all')!.timeline).toEqual([step]);
      },
    );
    rejects(
      allElementsDeck(),
      {
        type: 'slide.setTimeline',
        slideId: 's_all',
        timeline: [{ ...step, elementId: 'e_he_hero_title' }],
      },
      'not_found',
    );
    rejects(
      allElementsDeck(),
      { type: 'slide.setTimeline', slideId: 's_all', timeline: [step, step] },
      'conflict',
    );
  });
});

describe('element commands', () => {
  it('element.add adds on top, at an index, or inside a group', () => {
    const start = deckWith(rect('a'), rect('b'));
    check(start, { type: 'element.add', slideId: 's1', element: rect('c') }, (d) => {
      expect(ids(d)).toEqual(['a', 'b', 'c']);
    });
    check(start, { type: 'element.add', slideId: 's1', element: rect('c'), index: 0 }, (d) => {
      expect(ids(d)).toEqual(['c', 'a', 'b']);
    });
    check(
      allElementsDeck(),
      { type: 'element.add', slideId: 's_all', element: rect('c'), parentId: 'e_group' },
      (d) => {
        const group = elementOf(d, 'e_group') as GroupElement;
        expect(group.children.map((c) => c.id)).toEqual(['e_group_bg', 'e_group_text', 'c']);
      },
    );
  });

  it('element.add keeps element ids unique across the deck', () => {
    const start = createDeck({
      slides: [createSlide({ id: 's1', elements: [rect('a')] }), createSlide({ id: 's2' })],
    });
    rejects(start, { type: 'element.add', slideId: 's2', element: rect('a') }, 'conflict');
    rejects(start, { type: 'element.add', slideId: 's9', element: rect('b') }, 'not_found');
    rejects(
      start,
      { type: 'element.add', slideId: 's1', element: rect('b'), parentId: 'a' },
      'invalid_state',
    );
  });

  it('element.add validates the element', () => {
    const broken = { ...rect('x'), opacity: 2 };
    rejects(deckWith(), { type: 'element.add', slideId: 's1', element: broken }, 'invalid_payload');
  });

  it('element.remove drops the animation steps of what it removes', () => {
    check(
      allElementsDeck(),
      { type: 'element.remove', slideId: 's_all', elementIds: ['e_group', 'e_line'] },
      (d) => {
        const slide = findSlide(d, 's_all')!;
        expect(findElement(slide, 'e_group_text')).toBeUndefined();
        expect(findElement(slide, 'e_line')).toBeUndefined();
        expect(slide.timeline.map((s) => s.id)).toEqual(['a_title']);
      },
    );
  });

  it('element.remove removes a group that it leaves empty', () => {
    check(
      allElementsDeck(),
      { type: 'element.remove', slideId: 's_all', elementIds: ['e_group_bg', 'e_group_text'] },
      (d) => {
        expect(findElement(findSlide(d, 's_all')!, 'e_group')).toBeUndefined();
        expect(findSlide(d, 's_all')!.timeline.map((s) => s.id)).toEqual(['a_title']);
      },
    );
  });

  it('element.remove tells the agent clearly that an element is gone (CMD-07)', () => {
    const bus = new CommandBus(deckWith(rect('a')));
    bus.dispatch({ type: 'element.remove', slideId: 's1', elementIds: ['a'] });
    expect(() => bus.dispatch(updateElement('s1', 'a', { opacity: 0.5 }))).toThrow(
      /may have been deleted/,
    );
  });

  it('element.update replaces fields and clears them with null', () => {
    const start = allElementsDeck();
    check(
      start,
      updateElement('s_all', 'e_image', { frame: box(10, 20, 30, 40), mask: null }),
      (d) => {
        const image = elementOf(d, 'e_image');
        expect(image.frame).toEqual(box(10, 20, 30, 40));
        expect('mask' in image).toBe(false);
      },
    );
    check(start, updateElement('s_all', 'e_group_text', { opacity: 0.5 }), (d) => {
      expect(elementOf(d, 'e_group_text').opacity).toBe(0.5);
    });
  });

  it('element.update leaves untouched parts as the same objects', () => {
    const bus = new CommandBus(allElementsDeck());
    const before = elementOf(bus.deck, 'e_text');
    const neighbour = elementOf(bus.deck, 'e_image');
    const otherSlide = findSlide(bus.deck, 's_empty');
    bus.dispatch(updateElement('s_all', 'e_text', { frame: box(1, 2, 3, 4) }));
    const after = elementOf(bus.deck, 'e_text');
    expect(after).not.toBe(before);
    expect(
      after.type === 'text' && before.type === 'text' && after.content === before.content,
    ).toBe(true);
    expect(elementOf(bus.deck, 'e_image')).toBe(neighbour);
    expect(findSlide(bus.deck, 's_empty')).toBe(otherSlide);
  });

  it('element.update rejects a result that is not a valid element', () => {
    const start = allElementsDeck();
    // The typed builder already refuses this; the agent sends raw JSON, so the bus checks too.
    rejects(
      start,
      { type: 'element.update', slideId: 's_all', elementId: 'e_text', patch: { autoFit: null } },
      'invalid_payload',
    );
    rejects(
      start,
      { type: 'element.update', slideId: 's_all', elementId: 'e_text', patch: { colour: 'red' } },
      'invalid_payload',
    );
    rejects(
      start,
      { type: 'element.update', slideId: 's_all', elementId: 'e_text', patch: { type: 'image' } },
      'invalid_payload',
    );
    rejects(
      start,
      { type: 'element.update', slideId: 's_all', elementId: 'e_text', patch: { id: 'x' } },
      'invalid_payload',
    );
    rejects(start, updateElement('s_all', 'e_svg_inline', { assetId: 'a' }), 'invalid_payload');
  });

  describe('element.reorder', () => {
    const start = () => deckWith(rect('a'), rect('b'), rect('c'), rect('d'));
    const cases: [string[], CommandOf<'element.reorder'>['to'], string[]][] = [
      [['a'], 'forward', ['b', 'a', 'c', 'd']],
      [['a', 'b'], 'forward', ['c', 'a', 'b', 'd']],
      [['a', 'c'], 'forward', ['b', 'a', 'd', 'c']],
      [['d'], 'backward', ['a', 'b', 'd', 'c']],
      [['a'], 'front', ['b', 'c', 'd', 'a']],
      [['c', 'd'], 'back', ['c', 'd', 'a', 'b']],
      [['d'], { index: 1 }, ['a', 'd', 'b', 'c']],
    ];
    it.each(cases)('%j %j', (elementIds, to, expected) => {
      check(start(), { type: 'element.reorder', slideId: 's1', elementIds, to }, (d) => {
        expect(ids(d)).toEqual(expected);
      });
    });

    it('does nothing when nothing would move', () => {
      const bus = new CommandBus(start());
      bus.dispatch({ type: 'element.reorder', slideId: 's1', elementIds: ['d'], to: 'forward' });
      bus.dispatch({ type: 'element.reorder', slideId: 's1', elementIds: ['a', 'b'], to: 'back' });
      expect(bus.canUndo).toBe(false);
    });

    it('needs the elements to share a parent', () => {
      rejects(
        allElementsDeck(),
        {
          type: 'element.reorder',
          slideId: 's_all',
          elementIds: ['e_text', 'e_group_bg'],
          to: 'front',
        },
        'invalid_state',
      );
    });
  });

  it('element.group wraps elements at the position of the topmost one', () => {
    const start = deckWith(
      rect('a', box(100, 100)),
      rect('x'),
      rect('b', box(300, 200, 100, 50)),
      rect('y'),
    );
    check(
      start,
      { type: 'element.group', slideId: 's1', elementIds: ['b', 'a'], groupId: 'g', name: 'pair' },
      (d) => {
        expect(ids(d)).toEqual(['x', 'g', 'y']);
        const group = findElement(findSlide(d, 's1')!, 'g') as GroupElement;
        expect(group.name).toBe('pair');
        expect(group.frame).toEqual(box(100, 100, 300, 150));
        expect(group.children.map((c) => [c.id, c.frame])).toEqual([
          ['a', box(0, 0)],
          ['b', box(200, 100, 100, 50)],
        ]);
      },
    );
    rejects(
      start,
      { type: 'element.group', slideId: 's1', elementIds: ['a'], groupId: 'x' },
      'conflict',
    );
  });

  it('element.group bounds rotated elements by their rotated box', () => {
    const tilted = { ...rect('a', box(0, 0, 200, 100)), rotation: 90 };
    check(
      deckWith(tilted, rect('b', box(400, 400))),
      { type: 'element.group', slideId: 's1', elementIds: ['a', 'b'], groupId: 'g' },
      (d) => {
        const group = findElement(findSlide(d, 's1')!, 'g')!;
        expect(group.frame).toEqual(box(50, -50, 450, 550));
      },
    );
  });

  it('element.ungroup puts the children back where they were', () => {
    const start = deckWith(rect('a', box(100, 100)), rect('b', box(300, 200, 100, 50)), rect('z'));
    const bus = new CommandBus(start, { validate: true });
    bus.dispatch({ type: 'element.group', slideId: 's1', elementIds: ['a', 'b'], groupId: 'g' });
    check(bus.deck, { type: 'element.ungroup', slideId: 's1', groupId: 'g' }, (d) => {
      expect(findSlide(d, 's1')!.elements).toEqual(start.slides[0]!.elements);
    });
  });

  it('element.ungroup folds the group rotation, mirroring and opacity into the children', () => {
    const child = { ...rect('c', box(0, 0, 50, 50)), rotation: 30 };
    const group = (extra: Partial<GroupElement>) =>
      createElement.group({
        id: 'g',
        frame: box(100, 100, 200, 100),
        children: [child],
        opacity: 0.5,
        ...extra,
      });

    check(
      deckWith(group({ rotation: 90 })),
      { type: 'element.ungroup', slideId: 's1', groupId: 'g' },
      (d) => {
        const c = findElement(findSlide(d, 's1')!, 'c')!;
        expect(c.frame.x).toBeCloseTo(200);
        expect(c.frame.y).toBeCloseTo(50);
        expect(c.rotation).toBeCloseTo(120);
        expect(c.opacity).toBe(0.5);
      },
    );
    check(
      deckWith(group({ flipH: true, hidden: true })),
      { type: 'element.ungroup', slideId: 's1', groupId: 'g' },
      (d) => {
        const c = findElement(findSlide(d, 's1')!, 'c')!;
        expect(c.frame).toEqual(box(250, 100, 50, 50));
        expect(c.rotation).toBeCloseTo(330);
        expect(c.flipH).toBe(true);
        expect(c.hidden).toBe(true);
      },
    );
  });

  it('element.ungroup drops the animation steps of the group', () => {
    check(
      allElementsDeck(),
      { type: 'element.ungroup', slideId: 's_all', groupId: 'e_group' },
      (d) => {
        const slide = findSlide(d, 's_all')!;
        expect(findElement(slide, 'e_group')).toBeUndefined();
        expect(slide.elements.some((e) => e.id === 'e_group_text')).toBe(true);
        expect(slide.timeline.map((s) => s.id)).toEqual(['a_title']);
      },
    );
    rejects(
      allElementsDeck(),
      { type: 'element.ungroup', slideId: 's_all', groupId: 'e_text' },
      'invalid_state',
    );
  });

  it('text.set writes a text box, a shape and a table cell', () => {
    const start = allElementsDeck();
    const content = richText('חדש');
    check(start, { type: 'text.set', slideId: 's_all', elementId: 'e_text', content }, (d) => {
      const e = elementOf(d, 'e_text');
      expect(e.type === 'text' && plainText(e.content)).toBe('חדש');
    });
    check(start, { type: 'text.set', slideId: 's_all', elementId: 'e_shape', content }, (d) => {
      const e = elementOf(d, 'e_shape');
      expect(e.type === 'shape' && e.content && plainText(e.content)).toBe('חדש');
    });
    check(
      start,
      {
        type: 'text.set',
        slideId: 's_all',
        elementId: 'e_table',
        content,
        cell: { row: 2, col: 1 },
      },
      (d) => {
        const e = elementOf(d, 'e_table');
        expect(e.type === 'table' && plainText(e.cells[2]![1]!.content)).toBe('חדש');
      },
    );
    rejects(
      start,
      { type: 'text.set', slideId: 's_all', elementId: 'e_table', content },
      'invalid_payload',
    );
    rejects(
      start,
      {
        type: 'text.set',
        slideId: 's_all',
        elementId: 'e_table',
        content,
        cell: { row: 9, col: 0 },
      },
      'not_found',
    );
    rejects(
      start,
      { type: 'text.set', slideId: 's_all', elementId: 'e_image', content },
      'invalid_state',
    );
  });
});

describe('the command catalogue', () => {
  it('rejects unknown commands and malformed payloads', () => {
    rejects(hebrewDeck(), { type: 'slide.explode' } as unknown as Command, 'unknown_command');
    rejects(hebrewDeck(), { type: 'toString' } as unknown as Command, 'unknown_command');
    rejects(hebrewDeck(), { type: 'slide.remove', slideIds: [] }, 'invalid_payload');
    rejects(
      hebrewDeck(),
      { type: 'slide.move', slideIds: ['s_he_hero'], toIndex: -1 },
      'invalid_payload',
    );
    const extra = { type: 'slide.remove', slideIds: ['s_he_hero'], extra: 1 };
    rejects(hebrewDeck(), extra as unknown as Command, 'invalid_payload');
  });

  it('names each command by the key it is registered under', () => {
    for (const [type, def] of Object.entries(commandDefs)) {
      expect(def.schema.shape.type.value).toBe(type);
    }
  });

  // Keep this last: it checks that every command above had an undo/redo test.
  it('has an undo/redo test for every command', () => {
    expect([...covered].sort()).toEqual(Object.keys(commandDefs).sort());
  });
});
