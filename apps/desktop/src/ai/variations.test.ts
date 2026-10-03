import type { ConversionService, SessionScope } from '@slidr/agent-tools';
import {
  CommandBus,
  createDeck,
  createElement,
  createSelectionStore,
  createSlide,
  findElement,
  plainText,
  richText,
  type AssetMeta,
  type Deck,
} from '@slidr/model';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageEvent } from '../images/images';
import { stagePreview } from '../stage/preview';
import { createGallery } from './variations';

/*
 * The variations gallery without a panel: what `ui_present_options` shows, what a hover puts on
 * the Stage, and what a pick does to the deck and to the undo history.
 */

const asset = (id: string): AssetMeta => ({
  id,
  file: `${id}.png`,
  mime: 'image/png',
  kind: 'image',
  bytes: 10,
  width: 640,
  height: 400,
  origin: 'upload',
});
const FIRST = 'a'.repeat(64);
const SECOND = 'b'.repeat(64);
const THIRD = 'c'.repeat(64);

function setup(conversion?: ConversionService) {
  const deck = createDeck({
    slides: [
      createSlide({
        id: 's_1',
        name: 'Goals',
        elements: [
          createElement.text({
            id: 'e_title',
            role: 'title',
            frame: { x: 160, y: 120, w: 1600, h: 200 },
            content: richText('Work plan 2027', { styleRef: 'heading', align: 'center' }),
          }),
          createElement.image({
            id: 'e_picture',
            frame: { x: 200, y: 400, w: 800, h: 500 },
            assetId: FIRST,
            fit: 'cover',
            crop: { x: 0.1, y: 0.2, w: 0.8, h: 0.6 },
          }),
        ],
      }),
      createSlide({ id: 's_2' }),
    ],
  });
  const bus = new CommandBus(
    { ...deck, assets: { [FIRST]: asset(FIRST), [SECOND]: asset(SECOND) } },
    {
      validate: true,
    },
  );
  const selection = createSelectionStore(bus);
  const gallery = createGallery({ bus, selection, ...(conversion ? { conversion } : {}) });
  const sets = () => gallery.store.getState().sets;
  return { bus, selection, gallery, sets };
}

const TITLE = { slideId: 's_1', elementId: 'e_title' };
const PICTURE = { slideId: 's_1', elementId: 'e_picture' };
const OBJECT: SessionScope = { kind: 'object', slideId: 's_1', elementIds: ['e_picture'] };

const titleOf = (deck: Deck) => {
  const element = findElement(deck.slides[0]!, 'e_title');
  return element?.type === 'text' ? element.content : undefined;
};
const pictureOf = (deck: Deck) => findElement(deck.slides[0]!, 'e_picture');

beforeEach(() => stagePreview.setState({ deck: null }));

describe('text options', () => {
  const options = [
    { label: 'Direct', text: 'Our plan for 2027' },
    { label: 'Question', text: 'Where are we going in **2027**?' },
  ];

  it('are shown as cards, and change nothing', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({ kind: 'text', target: TITLE, prompt: 'Two titles', options });
    expect(sets()).toMatchObject([
      {
        kind: 'text',
        target: TITLE,
        prompt: 'Two titles',
        live: false,
        cards: [
          { label: 'Direct', state: 'ready', text: 'Our plan for 2027' },
          { label: 'Question', state: 'ready' },
        ],
      },
    ]);
    expect(plainText(titleOf(bus.deck)!)).toBe('Work plan 2027');
    expect(bus.undoStack).toHaveLength(0);
  });

  it('are tried on the Stage without touching the deck or its history', async () => {
    const { bus, gallery, selection, sets } = setup();
    await gallery.service.present({ kind: 'text', target: TITLE, options });
    const before = bus.deck;
    const [set] = sets();

    gallery.preview(set!.id, 0);
    const shown = stagePreview.getState().deck!;
    expect(plainText(titleOf(shown)!)).toBe('Our plan for 2027');
    expect(bus.deck).toBe(before);
    expect(bus.undoStack).toHaveLength(0);

    gallery.preview(set!.id, null);
    expect(stagePreview.getState().deck).toBeNull();

    // The Stage shows one slide: an option for another one has nowhere to be tried.
    selection.getState().setCurrentSlide('s_2');
    gallery.preview(set!.id, 0);
    expect(stagePreview.getState().deck).toBeNull();
  });

  it('a pick is one undo step, in the formatting of the text it replaces', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({ kind: 'text', target: TITLE, options });
    const [set] = sets();
    gallery.preview(set!.id, 1);

    expect(gallery.pick(set!.id, 1, 'Pick an option')).toBe(true);
    expect(stagePreview.getState().deck).toBeNull();
    const content = titleOf(bus.deck)!;
    expect(plainText(content)).toBe('Where are we going in 2027?');
    // The style and the alignment are the old title's; the emphasis is the option's.
    expect(content.paragraphs[0]).toMatchObject({ styleRef: 'heading', align: 'center' });
    expect(content.paragraphs[0]!.runs).toContainEqual({ text: '2027', marks: { weight: 700 } });
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]).toMatchObject({ actor: 'user', label: 'Pick an option' });
    expect(sets()[0]!.picked).toEqual({ index: 1, txId: bus.undoStack[0]!.txId });

    expect(bus.undo()).toBe(true);
    expect(plainText(titleOf(bus.deck)!)).toBe('Work plan 2027');
    expect(bus.redo()).toBe(true);
    expect(plainText(titleOf(bus.deck)!)).toBe('Where are we going in 2027?');

    // Another pick is another step.
    gallery.pick(set!.id, 0, 'Pick an option');
    expect(plainText(titleOf(bus.deck)!)).toBe('Our plan for 2027');
    expect(bus.undoStack).toHaveLength(2);
  });

  it('need an element that holds text, and say which option cannot be shown', async () => {
    const { gallery, sets } = setup();
    await expect(
      gallery.service.present({ kind: 'text', target: { slideId: 's_1' }, options }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(
      gallery.service.present({ kind: 'text', target: PICTURE, options }),
    ).rejects.toMatchObject({ code: 'invalid_input', message: /No option could be shown/ });
    expect(sets()).toEqual([]);

    await gallery.service.present({
      kind: 'text',
      target: TITLE,
      options: [{ label: 'Empty' }, options[0]!],
    });
    expect(sets()[0]!.cards).toMatchObject([
      { label: 'Empty', state: 'failed', problem: 'it has no `text`.' },
      { label: 'Direct', state: 'ready' },
    ]);
    expect(gallery.pick(sets()[0]!.id, 0, 'Pick')).toBe(false);
  });

  it('go with the element they were for', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({ kind: 'text', target: TITLE, options });
    bus.dispatch({ type: 'element.remove', slideId: 's_1', elementIds: ['e_title'] });
    const steps = bus.undoStack.length;
    expect(gallery.pick(sets()[0]!.id, 0, 'Pick')).toBe(false);
    expect(sets()).toEqual([]);
    expect(bus.undoStack).toHaveLength(steps);
  });

  it('replace the options the element had, and can be dismissed', async () => {
    const { gallery, sets } = setup();
    await gallery.service.present({ kind: 'text', target: TITLE, options });
    const first = sets()[0]!.id;
    await gallery.service.present({ kind: 'text', target: TITLE, options: [...options].reverse() });
    expect(sets()).toHaveLength(1);
    expect(sets()[0]!.id).not.toBe(first);
    expect(sets()[0]!.cards[0]!.label).toBe('Question');
    gallery.dismiss(sets()[0]!.id);
    expect(sets()).toEqual([]);
  });

  it('belong to the tool whose session offered them', async () => {
    const { gallery, sets } = setup();
    gallery.noteToolCall({ kind: 'slide', slideId: 's_1' }, 'ui_present_options', {});
    await gallery.service.present({ kind: 'text', target: TITLE, options });
    expect(sets()[0]!.from).toBe('slide');
    gallery.noteToolCall(OBJECT, 'ui_present_options', {});
    await gallery.service.present({ kind: 'text', target: TITLE, options });
    expect(sets()[0]!.from).toBe('object');
  });
});

describe('image options', () => {
  it('a pick replaces the image and keeps its frame and crop, as one undo step', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({
      kind: 'image',
      target: PICTURE,
      options: [
        { label: 'Harbour', assetId: SECOND },
        { label: 'Missing', assetId: THIRD },
      ],
    });
    expect(sets()[0]!.cards).toMatchObject([
      { label: 'Harbour', state: 'ready', asset: { id: SECOND } },
      { label: 'Missing', state: 'failed' },
    ]);
    const before = pictureOf(bus.deck);

    gallery.preview(sets()[0]!.id, 0);
    expect(pictureOf(stagePreview.getState().deck!)).toMatchObject({ assetId: SECOND });
    expect(pictureOf(bus.deck)).toBe(before);

    expect(gallery.pick(sets()[0]!.id, 0, 'Pick')).toBe(true);
    expect(pictureOf(bus.deck)).toEqual({ ...before, assetId: SECOND });
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(pictureOf(bus.deck)).toEqual(before);
    bus.redo();
    expect(pictureOf(bus.deck)).toMatchObject({ assetId: SECOND });
  });

  it('are for an image element', async () => {
    const { gallery } = setup();
    await expect(
      gallery.service.present({
        kind: 'image',
        target: TITLE,
        options: [{ label: 'x', assetId: SECOND }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
  });
});

describe('images as they are made', () => {
  const stored = (index: number, id: string): ImageEvent => ({
    type: 'finished',
    index,
    outcome: { status: 'stored', asset: asset(id), durationMs: 1000 },
  });

  it('fill their cards one by one, and one can be picked before its call has returned', () => {
    const { bus, gallery, sets } = setup();
    gallery.noteToolCall(OBJECT, 'image_generate', { prompt: 'a harbour at dawn', count: 3 });
    expect(sets()).toEqual([]);

    gallery.imageEvent('job-1', { type: 'started', index: 0 });
    expect(sets()).toMatchObject([
      {
        kind: 'image',
        from: 'object',
        target: PICTURE,
        live: true,
        cards: [{ state: 'pending' }, { state: 'pending' }, { state: 'pending' }],
      },
    ]);
    gallery.imageEvent('job-1', { type: 'started', index: 1 });
    gallery.imageEvent('job-1', stored(1, THIRD));
    expect(sets()[0]!.cards.map((card) => card.state)).toEqual(['pending', 'ready', 'pending']);
    expect(sets()[0]!.cards[1]!.asset).toMatchObject({
      id: THIRD,
      origin: 'ai',
      lineage: { prompt: 'a harbour at dawn' },
    });

    // The asset is not in the deck yet: the pick brings it, in the same undo step.
    expect(bus.deck.assets[THIRD]).toBeUndefined();
    expect(gallery.pick(sets()[0]!.id, 1, 'Pick')).toBe(true);
    expect(bus.deck.assets[THIRD]).toMatchObject({ origin: 'ai' });
    expect(pictureOf(bus.deck)).toMatchObject({
      assetId: THIRD,
      crop: { x: 0.1, y: 0.2, w: 0.8, h: 0.6 },
    });
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck.assets[THIRD]).toBeUndefined();
    expect(pictureOf(bus.deck)).toMatchObject({ assetId: FIRST });

    gallery.imageEvent('job-1', {
      type: 'finished',
      index: 0,
      outcome: { status: 'failed', error: { kind: 'quota', message: 'usage limit reached' } },
    });
    gallery.imageEvent('job-1', stored(2, SECOND));
    expect(sets()[0]).toMatchObject({
      live: false,
      cards: [
        { state: 'failed', problemKind: 'quota', problem: 'usage limit reached' },
        { state: 'ready' },
        { state: 'ready' },
      ],
    });
  });

  it('are a gallery only for the image an object session works on', () => {
    const { gallery, sets } = setup();
    // Into the element itself: the first image is placed, and there is nothing to pick.
    gallery.noteToolCall(OBJECT, 'image_generate', {
      prompt: 'x',
      count: 2,
      elementId: 'e_picture',
    });
    gallery.imageEvent('job-1', { type: 'started', index: 0 });
    // A deck session building slides, and an object session on a text.
    gallery.noteToolCall({ kind: 'deck' }, 'image_generate', { prompt: 'x', count: 2 });
    gallery.imageEvent('job-2', { type: 'started', index: 0 });
    gallery.noteToolCall(
      { kind: 'object', slideId: 's_1', elementIds: ['e_title'] },
      'image_generate',
      { prompt: 'x', count: 2 },
    );
    gallery.imageEvent('job-3', { type: 'started', index: 0 });
    expect(sets()).toEqual([]);
  });

  it('give way to the options the agent presents for the same image', async () => {
    const { gallery, sets } = setup();
    gallery.noteToolCall(OBJECT, 'image_generate', { prompt: 'x', count: 1 });
    gallery.imageEvent('job-1', stored(0, SECOND));
    expect(sets()[0]!.cards[0]!.label).toBe('');
    await gallery.service.present({
      kind: 'image',
      target: PICTURE,
      options: [{ label: 'Harbour', assetId: SECOND }],
    });
    expect(sets()).toHaveLength(1);
    expect(sets()[0]).toMatchObject({ live: false, cards: [{ label: 'Harbour', state: 'ready' }] });
  });
});

describe('design options', () => {
  /** A stand-in for the conversion engine: a slide with one text, or a failure for "bad". */
  const conversion: ConversionService = {
    htmlToSlide: (_deck, { html }) =>
      html === 'bad'
        ? Promise.reject(new Error('the slide could not be converted'))
        : Promise.resolve({
            slide: createSlide({
              id: 's_new',
              css: '.x{}',
              background: { fill: { kind: 'solid', color: { token: 'primary' } } },
              elements: [
                createElement.text({
                  id: `e_${html}`,
                  frame: { x: 100, y: 100, w: 800, h: 200 },
                  content: richText(html),
                }),
              ],
            }),
            assets: [asset(THIRD)],
            editability: 1,
            notes: [],
          }),
    convertElement: () => Promise.reject(new Error('not here')),
  };
  const options = [
    { label: 'Split', html: 'split' },
    { label: 'Broken', html: 'bad' },
    { label: 'Cards', html: 'cards' },
  ];
  const SLIDE = { slideId: 's_1' };

  it('are converted to slides, and a pick replaces what is on the slide in one undo step', async () => {
    const { bus, gallery, sets } = setup(conversion);
    const before = bus.deck.slides[0]!;
    await gallery.service.present({ kind: 'layout', target: SLIDE, options });
    expect(sets()[0]!.cards).toMatchObject([
      { label: 'Split', state: 'ready', slide: { elements: [{ id: 'e_split' }] } },
      { label: 'Broken', state: 'failed', problem: 'the slide could not be converted' },
      { label: 'Cards', state: 'ready' },
    ]);
    expect(bus.deck.slides[0]).toBe(before);

    gallery.preview(sets()[0]!.id, 2);
    expect(stagePreview.getState().deck!.slides[0]!.elements.map((e) => e.id)).toEqual(['e_cards']);
    expect(bus.deck.slides[0]).toBe(before);

    expect(gallery.pick(sets()[0]!.id, 0, 'Pick')).toBe(true);
    const after = bus.deck.slides[0]!;
    // The slide keeps its id, name and place; its content is the design's.
    expect(after).toMatchObject({ id: 's_1', name: 'Goals', css: '.x{}' });
    expect(after.elements.map((e) => e.id)).toEqual(['e_split']);
    expect(after.background).toEqual({ fill: { kind: 'solid', color: { token: 'primary' } } });
    expect(bus.deck.assets[THIRD]).toBeDefined();
    expect(bus.undoStack).toHaveLength(1);

    bus.undo();
    expect(bus.deck.slides[0]).toEqual(before);
    expect(bus.deck.assets[THIRD]).toBeUndefined();
    bus.redo();
    expect(bus.deck.slides[0]).toEqual(after);

    // A second pick replaces the first design, not the original slide.
    gallery.pick(sets()[0]!.id, 2, 'Pick');
    expect(bus.deck.slides[0]!.elements.map((e) => e.id)).toEqual(['e_cards']);
    expect(bus.undoStack).toHaveLength(2);
  });

  it('are refused when none converts, or when there is nothing to convert with', async () => {
    const { gallery, sets } = setup(conversion);
    await expect(
      gallery.service.present({
        kind: 'layout',
        target: SLIDE,
        options: [options[1]!, options[1]!],
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(sets()).toEqual([]);
    await expect(
      setup().gallery.service.present({ kind: 'layout', target: SLIDE, options }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });
});
