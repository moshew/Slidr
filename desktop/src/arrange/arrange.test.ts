import { describe, expect, it } from 'vitest';
import {
  CommandBus,
  createDeck,
  createElement,
  createSlide,
  richText,
  walkElements,
  type AssetMeta,
  type Deck,
  type Element,
  type Frame,
} from '@slidr/model';
import { fixtureDecks } from '@slidr/model/fixtures';
import { abilities } from './abilities';
import {
  clipElements,
  clipSlides,
  clipText,
  parseClip,
  pasteCommands,
  pasteOffset,
  PASTE_STEP,
  textBoxFor,
  type Clip,
} from './clip';
import { layerRows, layerSnippet, rowRange } from './layers';

const box = (x: number, y: number, w = 100, h = 100): Frame => ({ x, y, w, h });
const rect = (id: string, frame: Frame, extra: Partial<Element> = {}) =>
  createElement.shape({ id, frame, ...extra });

function deckWith(...elements: Element[]): Deck {
  return createDeck({ slides: [createSlide({ id: 's1', elements })] });
}

/** Applies a paste through a validating bus and returns the deck it leaves. */
function applied(deck: Deck, clip: Clip, slideId: string | null): Deck {
  const bus = new CommandBus(deck, { validate: true });
  bus.batch(pasteCommands(deck, clip, { slideId }).commands);
  return bus.deck;
}

describe('abilities', () => {
  const group = createElement.group({
    id: 'g',
    frame: box(500, 500, 300, 300),
    children: [rect('g1', box(0, 0)), rect('g2', box(150, 150))],
  });
  const slide = deckWith(
    rect('a', box(0, 0)),
    rect('b', box(200, 0)),
    rect('c', box(400, 0), { locked: true }),
    group,
    rect('d', box(900, 0)),
  ).slides[0]!;

  it('offers nothing without a selection, or for ids that are not on the slide', () => {
    for (const can of [
      abilities(slide, []),
      abilities(slide, ['gone']),
      abilities(undefined, ['a']),
    ]) {
      expect(can.count).toBe(0);
      expect(Object.values(can.order)).toEqual([false, false, false, false]);
      expect([can.align, can.distribute, can.toSlide, can.group, can.ungroup, can.remove]).toEqual([
        false,
        false,
        false,
        false,
        false,
        false,
      ]);
    }
  });

  it('aligns two and distributes three, of one parent', () => {
    expect(abilities(slide, ['a'])).toMatchObject({
      align: false,
      distribute: false,
      group: false,
    });
    expect(abilities(slide, ['a'])).toMatchObject({ toSlide: true, remove: true });
    expect(abilities(slide, ['a', 'b'])).toMatchObject({ align: true, distribute: false });
    expect(abilities(slide, ['a', 'b', 'd'])).toMatchObject({ align: true, distribute: true });
    // An element of a group and one of the slide have no common ground.
    expect(abilities(slide, ['a', 'g1'])).toMatchObject({
      count: 2,
      align: false,
      toSlide: false,
      group: false,
    });
    expect(abilities(slide, ['g1', 'g2'])).toMatchObject({ align: true, group: true });
  });

  it('leaves locked elements where they are', () => {
    // A locked element counts for the bounds, but three movable ones are needed to distribute.
    expect(abilities(slide, ['a', 'b', 'c'])).toMatchObject({ align: true, distribute: false });
    expect(abilities(slide, ['c'])).toMatchObject({
      allLocked: true,
      toSlide: false,
      remove: false,
    });
    expect(abilities(slide, ['a', 'c'])).toMatchObject({ allLocked: false, remove: true });
  });

  it('offers ungroup for a group, and the z-order moves that would change something', () => {
    expect(abilities(slide, ['g']).ungroup).toBe(true);
    expect(abilities(slide, ['a', 'g']).ungroup).toBe(true);
    expect(abilities(slide, ['a']).ungroup).toBe(false);
    expect(abilities(slide, ['a']).order).toEqual({
      front: true,
      forward: true,
      backward: false,
      back: false,
    });
    expect(abilities(slide, ['d']).order).toEqual({
      front: false,
      forward: false,
      backward: true,
      back: true,
    });
  });
});

describe('the clip', () => {
  const deck = fixtureDecks.allElementsDeck();

  it('holds elements as the slide shows them, with the assets they use', () => {
    const clip = clipElements(deck, 's_all', ['e_group_text', 'e_image', 'e_text'])!;
    expect(clip).toMatchObject({ slidr: 1, kind: 'elements', cut: false, slideId: 's_all' });
    expect(clip.deckId).toBe(deck.id);
    expect(clip.elements.map((e) => e.id)).toEqual(['e_text', 'e_image', 'e_group_text']);
    expect(clip.elements[2]!.frame).toMatchObject({ x: 104, y: 484 });
    expect(clip.assets.map((a) => a.name)).toEqual(['mountain.jpg']);
    expect(clipElements(deck, 's_all', ['e_gone'])).toBeUndefined();
    expect(clipElements(deck, 's_gone', ['e_text'])).toBeUndefined();
    // Two copies are two clips.
    expect(clipElements(deck, 's_all', ['e_text'])!.id).not.toBe(clip.id);
  });

  it('holds slides in deck order, with their layouts and assets', () => {
    const clip = clipSlides(deck, ['s_empty', 's_all'], true)!;
    expect(clip).toMatchObject({ kind: 'slides', cut: true });
    expect(clip.slides.map((s) => s.id)).toEqual(['s_all', 's_empty']);
    expect(clip.layouts.map((l) => l.id)).toEqual(['l_text_image']);
    // The background picture too; the font and the unused picture are not referred to.
    expect(clip.assets).toHaveLength(5);
    // A copy, not the deck's own objects.
    expect(clip.slides[0]).not.toBe(deck.slides[0]);
    expect(clip.slides[0]).toEqual(deck.slides[0]);
    expect(clipSlides(deck, ['s_gone'])).toBeUndefined();
  });

  it('survives the clipboard: JSON out, the same clip back', () => {
    for (const clip of [
      clipElements(deck, 's_all', ['e_text', 'e_group', 'e_table', 'e_chart', 'e_html'])!,
      clipSlides(deck, ['s_all', 's_empty'])!,
    ]) {
      expect(parseClip(JSON.stringify(clip))).toEqual(clip);
    }
  });

  it('turns down what is not a clip', () => {
    const clip = clipElements(deck, 's_all', ['e_text'])!;
    const tampered = (change: (raw: Record<string, unknown>) => void) => {
      const raw = JSON.parse(JSON.stringify(clip)) as Record<string, unknown>;
      change(raw);
      return parseClip(JSON.stringify(raw));
    };
    expect(parseClip('not json')).toBeUndefined();
    expect(parseClip('"a string"')).toBeUndefined();
    expect(parseClip('[]')).toBeUndefined();
    expect(tampered((raw) => (raw.slidr = 2))).toBeUndefined();
    expect(tampered((raw) => (raw.kind = 'layouts'))).toBeUndefined();
    expect(tampered((raw) => (raw.elements = []))).toBeUndefined();
    expect(tampered((raw) => delete raw.slideId)).toBeUndefined();
    expect(tampered((raw) => (raw.assets = [{ id: 'x' }]))).toBeUndefined();
    expect(
      tampered((raw) => ((raw.elements as Record<string, unknown>[])[0]!.type = 'widget')),
    ).toBeUndefined();
    expect(
      tampered((raw) => ((raw.elements as Record<string, unknown>[])[0]!.onclick = 'x')),
    ).toBeUndefined();
    expect(tampered(() => undefined)).toEqual(clip);
  });

  it('gives the text of what was copied', () => {
    expect(clipText(clipElements(deck, 's_all', ['e_text', 'e_shape', 'e_image'])!)).toBe(
      'כל סוגי האובייקטים\nShape',
    );
    expect(clipText(clipElements(deck, 's_all', ['e_group', 'e_table'])!)).toBe(
      'Inside a group\nרבעון\tהכנסות\nQ3\t1.2M\nQ4\t1.6M',
    );
    expect(clipText(clipElements(deck, 's_all', ['e_image'])!)).toBe('');
    const hebrew = fixtureDecks.hebrewDeck();
    expect(clipText(clipSlides(hebrew, ['s_he_hero', 's_he_number'])!)).toBe(
      'תוכנית עבודה לרבעון הרביעי\nמה נבנה, מתי, ומי אחראי\n\n87%\nמהלקוחות חידשו את המנוי',
    );
  });
});

describe('pasting a clip', () => {
  const deck = fixtureDecks.allElementsDeck();

  it('steps aside on the slide the copy came from, and keeps the place elsewhere', () => {
    const copy = clipElements(deck, 's_all', ['e_text'])!;
    const cut = clipElements(deck, 's_all', ['e_text'], true)!;
    const at = (steps: number) => ({ x: steps * PASTE_STEP, y: steps * PASTE_STEP });
    expect(pasteOffset(copy, deck.id, 's_all', 0)).toEqual(at(1));
    expect(pasteOffset(copy, deck.id, 's_all', 2)).toEqual(at(3));
    expect(pasteOffset(copy, deck.id, 's_empty', 0)).toEqual(at(0));
    expect(pasteOffset(copy, deck.id, 's_empty', 1)).toEqual(at(1));
    // A slide of another deck can carry the same id.
    expect(pasteOffset(copy, 'another-deck', 's_all', 0)).toEqual(at(0));
    expect(pasteOffset(cut, deck.id, 's_all', 0)).toEqual(at(0));
    expect(pasteOffset(cut, deck.id, 's_all', 1)).toEqual(at(1));
  });

  it('adds elements to the slide shown, and nothing when there is no slide', () => {
    const clip = clipElements(deck, 's_all', ['e_shape', 'e_group'])!;
    const result = pasteCommands(deck, clip, { slideId: 's_empty', offset: { x: 24, y: 24 } });
    expect(result.commands.map((c) => c.type)).toEqual(['element.add', 'element.add']);
    expect(result.slideIds).toEqual([]);
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(result.commands);
    const pasted = bus.deck.slides[1]!.elements;
    expect(pasted.map((e) => e.id)).toEqual(result.elementIds);
    expect(pasted[0]!.frame).toMatchObject({ x: 104, y: 244 });
    expect(pasteCommands(deck, clip, { slideId: null }).commands).toEqual([]);
    expect(pasteCommands(deck, clip, { slideId: 's_gone' }).commands).toEqual([]);
  });

  it('registers the assets a deck lacks, once, together with the elements', () => {
    const clip = clipElements(deck, 's_all', ['e_image', 'e_video'])!;
    expect(pasteCommands(deck, clip, { slideId: 's_all' }).commands.map((c) => c.type)).toEqual([
      'element.add',
      'element.add',
    ]);

    const other = deckWith();
    const { commands } = pasteCommands(other, clip, { slideId: 's1' });
    expect(commands.map((c) => c.type)).toEqual([
      'asset.add',
      'asset.add',
      'asset.add',
      'element.add',
      'element.add',
    ]);
    const after = applied(other, clip, 's1');
    expect(Object.keys(after.assets)).toHaveLength(3);

    // The caller's entries (of the files it imported) take the place of the clip's.
    const imported = { ...clip.assets[0]!, file: 'imported.jpg' };
    const given = pasteCommands(other, clip, { slideId: 's1', assets: [imported] });
    expect(given.commands.filter((c) => c.type === 'asset.add')).toEqual([
      { type: 'asset.add', asset: imported },
    ]);
  });

  it('leaves out an asset whose file is not the name of a file, and pastes the rest', () => {
    // A deck made elsewhere can carry such an asset: it is never drawn, and `asset.add` refuses
    // it. A clip copied from that deck must not be refused whole with it.
    const far: AssetMeta = {
      id: 'a_far',
      file: 'https://example.com/far.png',
      mime: 'image/png',
      kind: 'image',
      bytes: 1200,
      origin: 'import',
    };
    const source = deckWith(
      createElement.image({ id: 'e_far', frame: box(0, 0), assetId: far.id }),
      rect('e_box', box(200, 0)),
    );
    source.assets = { [far.id]: far };
    const clip = clipElements(source, 's1', ['e_far', 'e_box'])!;
    expect(clip.assets).toEqual([far]);

    const other = deckWith();
    const { commands } = pasteCommands(other, clip, { slideId: 's1' });
    expect(commands.map((c) => c.type)).toEqual(['element.add', 'element.add']);
    const after = applied(other, clip, 's1');
    expect(after.assets).toEqual({});
    // The picture comes as it was in its own deck: a frame that names a file nobody has.
    expect(after.slides[0]!.elements.map((e) => e.type)).toEqual(['image', 'shape']);
    // Handed over by a caller that could not import the file, it is left out all the same.
    expect(pasteCommands(other, clip, { slideId: 's1', assets: [far] }).commands).toHaveLength(2);
  });

  it('adds slides after the slide shown, with new ids, into this deck or another', () => {
    const clip = clipSlides(deck, ['s_all'])!;
    const same = pasteCommands(deck, clip, { slideId: 's_all' });
    expect(same.commands.map((c) => c.type)).toEqual(['slide.add']);
    const bus = new CommandBus(deck, { validate: true });
    bus.batch(same.commands);
    const after = bus.deck;
    expect(after.slides.map((s) => s.id)).toEqual(['s_all', same.slideIds[0], 's_empty']);
    const ids = [...walkElements(after.slides.flatMap((s) => s.elements))].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);

    const other = fixtureDecks.hebrewDeck();
    const moved = applied(other, clip, 's_he_goals');
    expect(moved.slides.map((s) => s.name)[2]).toBe('All element types');
    expect(moved.slides[2]!.layoutId).toBe('l_text_image');
    expect(moved.layouts.map((l) => l.id)).toEqual(['l_text_image']);
    expect(Object.keys(moved.assets)).toHaveLength(5);
    // A deck without slides takes them at the start.
    expect(applied(createDeck(), clip, null).slides).toHaveLength(1);
  });
});

describe('textBoxFor', () => {
  it('makes a box in the middle of the slide that grows with its text', () => {
    const deck = createDeck();
    const element = textBoxFor('first\r\nsecond\n\n', deck)!;
    expect(element).toMatchObject({ type: 'text', autoFit: 'growHeight' });
    expect(
      element.type === 'text' && element.content.paragraphs.map((p) => p.runs[0]?.text),
    ).toEqual(['first', 'second']);
    expect(element.frame.x + element.frame.w / 2).toBe(960);
    expect(Math.abs(element.frame.y + element.frame.h / 2 - 540)).toBeLessThan(1);
    expect(textBoxFor('  \n ', deck)).toBeUndefined();
    expect(textBoxFor('', deck)).toBeUndefined();
  });
});

describe('the rows of the Layers panel', () => {
  const slide = fixtureDecks.allElementsDeck().slides[0]!;

  it('lists the topmost first, each group followed by its children', () => {
    const rows = layerRows(slide.elements);
    expect(rows[0]!.element.id).toBe('e_html');
    expect(rows.at(-1)!.element.id).toBe('e_text');
    const at = rows.findIndex((r) => r.element.id === 'e_group');
    expect(rows.slice(at, at + 3).map((r) => [r.element.id, r.depth])).toEqual([
      ['e_group', 0],
      ['e_group_text', 1],
      ['e_group_bg', 1],
    ]);
    expect(rows).toHaveLength([...walkElements(slide.elements)].length);
  });

  it('hands a group’s lock and visibility down to its children', () => {
    const group = createElement.group({
      id: 'g',
      frame: box(0, 0, 300, 300),
      hidden: true,
      children: [
        rect('c1', box(0, 0)),
        createElement.group({
          id: 'inner',
          frame: box(0, 0),
          locked: true,
          children: [rect('c2', box(0, 0))],
        }),
      ],
    });
    const rows = layerRows([group]);
    expect(rows.map((r) => [r.element.id, r.depth, r.hiddenByGroup, r.lockedByGroup])).toEqual([
      ['g', 0, false, false],
      ['inner', 1, true, false],
      ['c2', 2, true, true],
      ['c1', 1, true, false],
    ]);
  });

  it('names an unnamed element by the beginning of its text', () => {
    const text = (content: string) =>
      createElement.text({ frame: box(0, 0), content: richText(content) });
    expect(layerSnippet(text('\n  שלום עולם  \nשורה שנייה'))).toBe('שלום עולם');
    expect(layerSnippet(text('x'.repeat(60)))).toBe(`${'x'.repeat(40)}…`);
    expect(layerSnippet(text(''))).toBeUndefined();
    expect(layerSnippet(rect('r', box(0, 0)))).toBeUndefined();
    expect(layerSnippet(rect('r', box(0, 0), { content: richText('In a shape') }))).toBe(
      'In a shape',
    );
    expect(layerSnippet(createElement.image({ frame: box(0, 0), alt: 'A mountain' }))).toBe(
      'A mountain',
    );
  });

  it('gives the rows between two rows, whichever comes first', () => {
    const rows = layerRows(slide.elements);
    const ids = rows.map((r) => r.element.id);
    expect(rowRange(rows, ids[1]!, ids[3]!)).toEqual(ids.slice(1, 4));
    expect(rowRange(rows, ids[3]!, ids[1]!)).toEqual(ids.slice(1, 4));
    expect(rowRange(rows, ids[2]!, ids[2]!)).toEqual([ids[2]]);
    // An anchor that is gone leaves the row that was clicked.
    expect(rowRange(rows, 'gone', ids[2]!)).toEqual([ids[2]]);
    expect(rowRange(rows, ids[2]!, 'gone')).toEqual([]);
  });
});
