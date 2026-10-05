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
import { createImageService } from '../images/imageService';
import type { ImageClient, ImageEvent } from '../images/images';
import { stagePreview } from '../stage/preview';
import { createGallery, EARLIER, historyOf } from './variations';

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
  type Listener = (event: ImageEvent) => void;
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

  it('are a gallery for the image the deck chat names in optionsFor (ADR-072)', () => {
    const { gallery, sets } = setup();
    gallery.noteToolCall({ kind: 'deck' }, 'image_generate', {
      prompt: 'x',
      count: 2,
      optionsFor: 'e_picture',
    });
    gallery.imageEvent('job-1', stored(0, SECOND));
    expect(sets()).toMatchObject([
      { kind: 'image', target: PICTURE, live: true, cards: [{ state: 'ready' }, {}] },
    ]);
    // Images being made for it are not asked for a second time.
    const again = { prompt: 'x', count: 2, optionsFor: 'e_picture' };
    expect(gallery.refusal({ kind: 'deck' }, 'image_generate', again)).toMatch(
      /do not generate again/,
    );
  });

  it('are a gallery only for an image element: named, or the one an object session works on', () => {
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
    // Options named for an element that is not a picture.
    gallery.noteToolCall({ kind: 'deck' }, 'image_generate', {
      prompt: 'x',
      count: 2,
      optionsFor: 'e_title',
    });
    gallery.imageEvent('job-4', { type: 'started', index: 0 });
    expect(sets()).toEqual([]);
  });

  it('take the labels of the options the agent presents, and keep what it did not present', async () => {
    const { gallery, sets } = setup();
    gallery.noteToolCall(OBJECT, 'image_generate', { prompt: 'x', count: 3 });
    gallery.imageEvent('job-1', stored(0, SECOND));
    gallery.imageEvent('job-1', stored(1, THIRD));
    expect(sets()[0]!.cards[0]!.label).toBe('');
    const id = sets()[0]!.id;
    // The agent presents the one image it knows; another arrived, and a third is on its way.
    await gallery.service.present({
      kind: 'image',
      target: PICTURE,
      options: [{ label: 'Harbour', assetId: SECOND }],
    });
    expect(sets()).toHaveLength(1);
    expect(sets()[0]).toMatchObject({
      id,
      live: true,
      cards: [
        { label: 'Harbour', state: 'ready', asset: { id: SECOND } },
        { label: '', state: 'ready', asset: { id: THIRD } },
        { label: '', state: 'pending' },
      ],
    });
    // The image that was on its way still finds its card.
    gallery.imageEvent('job-1', stored(2, FIRST));
    expect(sets()[0]).toMatchObject({ live: false, cards: [{}, {}, { state: 'ready' }] });
  });

  it('keep the images that arrived when more are asked for, and refuse to make them twice', () => {
    const { bus, gallery, sets } = setup();
    const input = { prompt: 'a harbour at dawn', count: 2 };
    expect(gallery.refusal(OBJECT, 'image_generate', input)).toBeUndefined();
    gallery.noteToolCall(OBJECT, 'image_generate', input);
    gallery.imageEvent('job-1', { type: 'started', index: 0 });
    gallery.imageEvent('job-1', stored(0, SECOND));

    // The call timed out for the agent while an image is still being made: asking again is
    // turned back, with words for the agent. Other calls are not its business.
    expect(gallery.refusal(OBJECT, 'image_generate', input)).toMatch(/do not generate again/);
    expect(gallery.refusal(OBJECT, 'text_set', {})).toBeUndefined();
    expect(gallery.refusal({ kind: 'deck' }, 'image_generate', input)).toBeUndefined();
    expect(
      gallery.refusal(OBJECT, 'image_generate', { ...input, elementId: 'e_picture' }),
    ).toBeUndefined();

    gallery.imageEvent('job-1', {
      type: 'finished',
      index: 1,
      outcome: { status: 'failed', error: { kind: 'timeout', message: 'took too long' } },
    });
    expect(sets()[0]).toMatchObject({ live: false });
    expect(gallery.refusal(OBJECT, 'image_generate', input)).toBeUndefined();

    // A later call for more: its cards join the image that was made; the failed one makes room.
    const id = sets()[0]!.id;
    gallery.noteToolCall(OBJECT, 'image_generate', input);
    gallery.imageEvent('job-2', { type: 'started', index: 0 });
    expect(sets()).toHaveLength(1);
    expect(sets()[0]).toMatchObject({
      id,
      live: true,
      cards: [
        { state: 'ready', asset: { id: SECOND } },
        { state: 'pending' },
        { state: 'pending' },
      ],
    });
    gallery.imageEvent('job-2', stored(1, THIRD));
    expect(sets()[0]!.cards.map((card) => card.state)).toEqual(['ready', 'pending', 'ready']);
    // The first image is still there to pick.
    expect(gallery.pick(id, 0, 'Pick')).toBe(true);
    expect(pictureOf(bus.deck)).toMatchObject({ assetId: SECOND });
  });

  // The bug hunt's `ai-ui.md`, finding 14: the call was noted before the Deck API had looked at
  // it, and its cards were handed to the job of the call after it.
  it('are not expected of a call that returned without a job: it was refused, or failed first', () => {
    const { gallery, sets } = setup();
    // The agent asks for ten images, which is more than the tool takes: the call is refused,
    // and returns. Then it asks for two, and a job runs.
    const refused = gallery.noteToolCall(OBJECT, 'image_generate', { prompt: 'x', count: 10 });
    refused();
    const made = gallery.noteToolCall(OBJECT, 'image_generate', { prompt: 'x', count: 2 });
    gallery.imageEvent('job-1', { type: 'started', index: 0 });
    expect(sets()[0]!.cards).toHaveLength(2);
    gallery.imageEvent('job-1', stored(0, SECOND));
    gallery.imageEvent('job-1', stored(1, THIRD));
    // A call that returns after its job took its cards changes nothing; nor does a second word.
    made();
    made();
    expect(sets()[0]).toMatchObject({
      live: false,
      cards: [{ state: 'ready' }, { state: 'ready' }],
    });
    // So more images can be asked for: nothing is "still being made".
    expect(gallery.refusal(OBJECT, 'image_generate', { prompt: 'more' })).toBeUndefined();

    // Of two calls on their way, the one that returned empty-handed leaves the other its job.
    const { gallery: other, sets: others } = setup();
    const first = other.noteToolCall(OBJECT, 'image_generate', { prompt: 'x', count: 4 });
    other.noteToolCall(OBJECT, 'image_generate', { prompt: 'y', count: 1 });
    first();
    other.imageEvent('job-2', stored(0, SECOND));
    expect(others()[0]).toMatchObject({ live: false, cards: [{ asset: { id: SECOND } }] });
    expect(others()[0]!.cards[0]!.asset?.lineage).toEqual({ prompt: 'y' });
    // A call that announces no cards has nothing to take back.
    expect(() => other.noteToolCall(OBJECT, 'text_set', {})()).not.toThrow();
  });

  // The bug hunt's `ai-ui.md`, finding 13: an image asked for with a transparent background
  // is drawn on flat magenta and keyed out, and the card showed the picture from before the key.
  it('are offered as the cut-out the tool returns, when a transparent background was asked for', async () => {
    const { gallery, sets } = setup();
    const drawn = asset(SECOND);
    const cut = asset(THIRD);
    const outcome = { status: 'stored', asset: drawn, durationMs: 1 } as const;
    const client = {
      // The provider draws on the flat colour, and reports the image as it lands.
      generate: (_job: string, _workspace: string, _request: unknown, onEvent?: Listener) => {
        onEvent?.({ type: 'started', index: 0 });
        onEvent?.({ type: 'finished', index: 0, outcome });
        return Promise.resolve({ provider: 'example', images: [outcome] });
      },
    } as unknown as ImageClient;
    const images = createImageService({
      client,
      workspaceId: () => 'w',
      preview: () => Promise.reject(new Error('no canvas here')),
      onEvent: gallery.imageEvent,
      processor: {
        status: () => Promise.reject(new Error('unused')),
        run: () => Promise.resolve({ asset: cut, durationMs: 1, keyColor: '#ff00ff' }),
      },
    });

    // What the runtime does around the agent's call: the gallery hears of it first.
    const returned = gallery.noteToolCall(OBJECT, 'image_generate', {
      prompt: 'our product',
      count: 1,
      transparent: true,
    });
    const made = await images
      .generate({ prompt: 'our product', count: 1, aspect: '1:1', transparent: true })
      .finally(returned);
    expect(made.map((image) => image.asset.id)).toEqual([THIRD]);
    // The one card holds what the tool returned, so presenting it adds no second card.
    expect(sets()[0]!.cards.map((card) => [card.state, card.asset?.id])).toEqual([
      ['ready', THIRD],
    ]);
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

describe('the history of a target (AIO-09)', () => {
  const first = [
    { label: 'Direct', text: 'Our plan for 2027' },
    { label: 'Question', text: 'Where are we going in **2027**?' },
  ];
  const second = [{ label: 'Short', text: 'Plan 2027' }];
  const earlier = (gallery: ReturnType<typeof setup>['gallery']) =>
    gallery.store.getState().earlier;
  const stored = (index: number, id: string): ImageEvent => ({
    type: 'finished',
    index,
    outcome: { status: 'stored', asset: asset(id), durationMs: 1000 },
  });

  it('keeps the set a target had, and a card of it is tried and picked as one undo step', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({ kind: 'text', target: TITLE, options: first });
    const old = sets()[0]!.id;
    await gallery.service.present({ kind: 'text', target: TITLE, options: second });
    const newest = sets()[0]!;
    expect(earlier(gallery).map((set) => set.id)).toEqual([old]);
    expect(historyOf(gallery.store.getState(), newest).map((set) => set.id)).toEqual([
      old,
      newest.id,
    ]);

    gallery.preview(old, 1);
    expect(plainText(titleOf(stagePreview.getState().deck!)!)).toBe('Where are we going in 2027?');
    expect(bus.undoStack).toHaveLength(0);

    expect(gallery.pick(old, 1, 'Pick')).toBe(true);
    expect(plainText(titleOf(bus.deck)!)).toBe('Where are we going in 2027?');
    expect(bus.undoStack).toHaveLength(1);
    expect(earlier(gallery)[0]!.picked).toMatchObject({ index: 1 });
    // The newest set is still the one shown first, and has no pick of its own.
    expect(sets()[0]).toMatchObject({ id: newest.id });
    expect(sets()[0]!.picked).toBeUndefined();
    bus.undo();
    expect(plainText(titleOf(bus.deck)!)).toBe('Work plan 2027');
    bus.redo();
    expect(plainText(titleOf(bus.deck)!)).toBe('Where are we going in 2027?');
  });

  it('is of one target, and keeps the newest sets of each', async () => {
    const { gallery, sets } = setup();
    for (let i = 0; i < EARLIER + 3; i++) {
      await gallery.service.present({ kind: 'text', target: TITLE, options: first });
    }
    gallery.noteToolCall(OBJECT, 'image_generate', { prompt: 'x', count: 1 });
    gallery.imageEvent('job-1', stored(0, SECOND));
    expect(earlier(gallery)).toHaveLength(EARLIER);
    const title = sets().find((set) => set.kind === 'text')!;
    const picture = sets().find((set) => set.kind === 'image')!;
    expect(historyOf(gallery.store.getState(), title)).toHaveLength(EARLIER + 1);
    expect(historyOf(gallery.store.getState(), picture)).toEqual([picture]);
  });

  it('leaves out a set with nothing to pick', async () => {
    const { gallery, sets } = setup();
    gallery.noteToolCall(OBJECT, 'image_generate', { prompt: 'x', count: 1 });
    gallery.imageEvent('job-1', {
      type: 'finished',
      index: 0,
      outcome: { status: 'failed', error: { kind: 'timeout', message: 'took too long' } },
    });
    expect(sets()[0]!.cards[0]!.state).toBe('failed');
    await gallery.service.present({
      kind: 'image',
      target: PICTURE,
      options: [{ label: 'Harbour', assetId: SECOND }],
    });
    // Image sets of an element grow in place; text sets replace one another.
    expect(earlier(gallery)).toEqual([]);
  });

  it('ends when the gallery of the target is closed, from any of its sets', async () => {
    const { gallery, sets } = setup();
    await gallery.service.present({ kind: 'text', target: TITLE, options: first });
    const old = sets()[0]!.id;
    await gallery.service.present({ kind: 'text', target: TITLE, options: second });
    gallery.dismiss(old);
    expect(sets()).toEqual([]);
    expect(earlier(gallery)).toEqual([]);
  });

  it('goes with the element it was for', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({ kind: 'text', target: TITLE, options: first });
    const old = sets()[0]!.id;
    await gallery.service.present({ kind: 'text', target: TITLE, options: second });
    bus.dispatch({ type: 'element.remove', slideId: 's_1', elementIds: ['e_title'] });
    expect(gallery.pick(old, 0, 'Pick')).toBe(false);
    expect(sets()).toEqual([]);
    expect(earlier(gallery)).toEqual([]);
  });

  it('gives the designs a slide had back when none of a new set converts', async () => {
    const conversion: ConversionService = {
      htmlToSlide: (_deck, { html }) =>
        html === 'bad'
          ? Promise.reject(new Error('no'))
          : Promise.resolve({
              slide: createSlide({ id: 's_new' }),
              assets: [],
              editability: 1,
              notes: [],
            }),
      convertElement: () => Promise.reject(new Error('not here')),
    };
    const { gallery, sets } = setup(conversion);
    const SLIDE = { slideId: 's_1' };
    await gallery.service.present({
      kind: 'layout',
      target: SLIDE,
      options: [{ label: 'Plain', html: 'plain' }],
    });
    const old = sets()[0]!.id;
    await expect(
      gallery.service.present({
        kind: 'layout',
        target: SLIDE,
        options: [{ label: 'Broken', html: 'bad' }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
    expect(sets().map((set) => set.id)).toEqual([old]);
    expect(earlier(gallery)).toEqual([]);
  });
});

describe('another document in the window', () => {
  const stored = (index: number, id: string): ImageEvent => ({
    type: 'finished',
    index,
    outcome: { status: 'stored', asset: asset(id), durationMs: 1000 },
  });

  it('ends the options of the one before, whose cards hold what the new one does not have', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({
      kind: 'text',
      target: TITLE,
      options: [{ label: 'Direct', text: 'Our plan for 2027' }],
    });
    gallery.noteToolCall(OBJECT, 'image_generate', { prompt: 'x', count: 2 });
    gallery.imageEvent('job-1', stored(0, THIRD));
    gallery.preview(sets()[0]!.id, 0);
    expect(sets()).toHaveLength(2);
    expect(stagePreview.getState().deck).not.toBeNull();

    // The same file is opened again: its elements carry the ids they had, and the pictures of
    // the cards are files of the workspace that was closed.
    bus.reset(bus.deck);
    expect(gallery.store.getState()).toEqual({ sets: [], earlier: [] });
    expect(stagePreview.getState().deck).toBeNull();

    // An image of the old document's job that lands now fills no card, and takes none from a
    // call of the new document that waits for its own job.
    gallery.noteToolCall(OBJECT, 'image_generate', { prompt: 'y', count: 1 });
    gallery.imageEvent('job-1', stored(1, SECOND));
    expect(sets()).toEqual([]);
    gallery.imageEvent('job-2', { type: 'started', index: 0 });
    expect(sets()).toMatchObject([{ live: true, cards: [{ state: 'pending' }] }]);
  });
});
