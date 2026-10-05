import {
  createDeck,
  createElement,
  createSlide,
  findElementInDeck,
  findSlide,
  newId,
  type AssetMeta,
  type Command,
  type Deck,
  type Element,
} from '@slidr/model';
import { allElementsDeck, hebrewDeck } from '@slidr/model/fixtures';
import { describe, expect, it, vi } from 'vitest';
import { checkWrite } from './scope';
import type {
  CaptureService,
  ConversionService,
  ImageService,
  LayoutService,
  LintService,
  OptionsService,
  PngImage,
  TemplateService,
} from './services';
import { failed, ok, PIXEL, setup } from './testing';

const png: PngImage = { mimeType: 'image/png', data: PIXEL, width: 1, height: 1 };

const renderSlide = vi.fn(() => Promise.resolve(png));
const capture: CaptureService = {
  renderSlide,
  renderContactSheet: () => Promise.resolve(png),
};

function asset(n: string): AssetMeta {
  const id = n.repeat(64);
  return {
    id,
    file: `${id}.png`,
    mime: 'image/png',
    kind: 'image',
    bytes: 10,
    origin: 'ai',
    width: 1024,
    height: 576,
  };
}

/** Converts any HTML into a slide with one text box, as the real engine would with new ids. */
const conversion: ConversionService = {
  htmlToSlide: (_deck, { name }) =>
    Promise.resolve({
      slide: createSlide({
        id: newId('s'),
        ...(name ? { name } : {}),
        css: '@keyframes x {}',
        elements: [
          createElement.text({ frame: { x: 0, y: 0, w: 100, h: 50 }, content: { paragraphs: [] } }),
        ],
      }),
      assets: [asset('a')],
      editability: 0.9,
      notes: ['kept one svg as html'],
    }),
  convertElement: () =>
    Promise.resolve({
      elements: [
        createElement.shape({ frame: { x: 0, y: 0, w: 10, h: 10 } }),
        createElement.shape({ frame: { x: 20, y: 0, w: 10, h: 10 } }),
      ],
      assets: [],
      editability: 1,
      notes: [],
    }),
};

describe('service registration', () => {
  it('registers a tool only with its service, and says so when it is missing', async () => {
    const without = setup(hebrewDeck());
    expect(without.api.tools.map((t) => t.name)).not.toContain('slide_render');
    expect(await failed(without.call('slide_render', { slideId: 's_he_hero' }))).toEqual({
      code: 'unavailable',
      message: 'slide_render is not available in this version of the app.',
    });
    expect((await failed(without.call('slide_explode'))).code).toBe('unknown_tool');

    const withCapture = setup(hebrewDeck(), { capture });
    expect(withCapture.api.tools.map((t) => t.name)).toContain('slide_render');
  });
});

describe('capture', () => {
  it('slide_render returns the image of the slide as the deck is now', async () => {
    const { call, bus } = setup(hebrewDeck(), { capture });
    const result = await call('slide_render', { slideId: 's_he_goals' });
    expect(result).toEqual({ ok: true, data: { slideId: 's_he_goals', number: 2 }, images: [png] });
    expect(renderSlide).toHaveBeenCalledWith(bus.deck, 's_he_goals', { width: 1280 });
  });

  it('deck_render_contact_sheet shows every slide by default', async () => {
    const { call } = setup(hebrewDeck(), { capture });
    const data = await ok(call('deck_render_contact_sheet'));
    expect(data.slideIds).toEqual(['s_he_hero', 's_he_goals', 's_he_number']);
  });
});

describe('lint after writes (LNT-04)', () => {
  it('returns the findings of the slides a write touched', async () => {
    const lintSlides = vi.fn((_deck: Deck, slideIds: readonly string[]) =>
      Promise.resolve(
        slideIds.map((slideId) => ({
          rule: 'L01',
          severity: 'error' as const,
          slideId,
          elementIds: [],
          message: 'Text overflows its box.',
        })),
      ),
    );
    const lint: LintService = { lint: lintSlides };
    const { call } = setup(hebrewDeck(), { lint });
    const data = await ok(call('text_set', { elementId: 'e_he_goals_body', markdown: 'ארוך' }));
    expect(data.lint).toEqual([expect.objectContaining({ rule: 'L01', slideId: 's_he_goals' })]);
    expect(lintSlides).toHaveBeenLastCalledWith(expect.anything(), ['s_he_goals'], 'agent');

    const read = await ok(call('slide_get', { slideId: 's_he_goals' }));
    expect(read.lint).toBeUndefined();
    const all = await ok(call('deck_lint'));
    expect(all.findings).toHaveLength(3);
  });

  it('keeps the write when lint fails', async () => {
    const lint: LintService = { lint: () => Promise.reject(new Error('measuring failed')) };
    const { call, bus } = setup(hebrewDeck(), { lint });
    const data = await ok(call('slide_update', { slideId: 's_he_hero', name: 'x' }));
    expect(data.lintError).toBe('measuring failed');
    expect(bus.deck.slides[0]!.name).toBe('x');
  });
});

describe('conversion', () => {
  it('slide_create_from_html adds the slide and its assets, with a render', async () => {
    const { call, bus } = setup(hebrewDeck(), { conversion, capture });
    const result = await call('slide_create_from_html', {
      html: '<div>x</div>',
      name: 'New',
      afterSlideId: 's_he_hero',
    });
    if (!result.ok) throw new Error(result.error.message);
    const slideId = result.data.slideId as string;
    expect(bus.deck.slides[1]!.id).toBe(slideId);
    expect(result.data).toMatchObject({
      editability: 0.9,
      notes: ['kept one svg as html'],
      deck: ['assets'],
    });
    expect(result.data.created).toHaveLength(2);
    expect(bus.deck.assets['a'.repeat(64)]).toBeDefined();
    expect(result.images).toEqual([png]);
  });

  it('an HTML write names the image placeholders it left, for image_generate', async () => {
    const frame = { x: 0, y: 0, w: 800, h: 600 };
    const withImages: ConversionService = {
      ...conversion,
      htmlToSlide: () =>
        Promise.resolve({
          slide: createSlide({
            id: newId('s'),
            elements: [
              createElement.text({ id: 'e_title', frame, content: { paragraphs: [] } }),
              createElement.image({ id: 'e_photo', frame, prompt: 'a clinic reception' }),
              // An image that already has its picture is not waiting for one.
              createElement.image({ id: 'e_logo', frame, assetId: 'a'.repeat(64) }),
            ],
          }),
          assets: [asset('a')],
          editability: 1,
          notes: [],
        }),
    };
    const { call } = setup(hebrewDeck(), { conversion: withImages });
    const created = await ok(call('slide_create_from_html', { html: '<div>x</div>' }));
    expect(created.imagePlaceholders).toEqual([
      { elementId: 'e_photo', prompt: 'a clinic reception' },
    ]);
    // A slide without placeholders says nothing of them.
    const plain = setup(hebrewDeck(), { conversion });
    expect(
      await ok(plain.call('slide_create_from_html', { html: '<div>x</div>' })),
    ).not.toHaveProperty('imagePlaceholders');
  });

  it('slide_replace_from_html replaces the content and keeps the slide', async () => {
    const { call, bus } = setup(
      allElementsDeck(),
      { conversion },
      { kind: 'slide', slideId: 's_all' },
    );
    const data = await ok(call('slide_replace_from_html', { slideId: 's_all', html: '<div/>' }));
    const slide = findSlide(bus.deck, 's_all')!;
    expect(slide.elements).toHaveLength(1);
    expect(slide).toMatchObject({
      name: 'All element types',
      css: '@keyframes x {}',
      timeline: [],
    });
    expect(slide.layoutId).toBeUndefined();
    expect(slide.notes).toBeDefined();
    expect(data.removed).toContain('e_group_text');
    expect(bus.undoStack).toHaveLength(1);

    const other = await failed(
      call('slide_replace_from_html', { slideId: 's_empty', html: '<div/>' }),
    );
    expect(other.code).toBe('out_of_scope');
  });

  it('slide_replace_from_html gives the slide the archetype of its new design', async () => {
    const drawn = (archetype?: 'section'): ConversionService => ({
      ...conversion,
      htmlToSlide: () =>
        Promise.resolve({
          slide: createSlide({ id: newId('s'), ...(archetype ? { archetype } : {}) }),
          assets: [],
          editability: 1,
          notes: [],
        }),
    });
    const deck = hebrewDeck();
    const slideId = deck.slides[0]!.id;
    deck.slides[0]!.archetype = 'hero';
    // A design that names its kind: the slide is of that kind now, which the lint reads.
    const named = setup(deck, { conversion: drawn('section') });
    await ok(named.call('slide_replace_from_html', { slideId, html: '<div/>' }));
    expect(findSlide(named.bus.deck, slideId)!.archetype).toBe('section');
    // A design that names none: the kind of the design that is gone goes with it.
    const bare = setup(deck, { conversion: drawn() });
    await ok(bare.call('slide_replace_from_html', { slideId, html: '<div/>' }));
    expect(findSlide(bare.bus.deck, slideId)!.archetype).toBeUndefined();
  });

  it('element_convert puts the replacements where the element was', async () => {
    const { call, bus } = setup(allElementsDeck(), { conversion });
    const data = await ok(call('element_convert', { elementId: 'e_html', to: 'elements' }));
    const ids = data.elementIds as string[];
    const slide = findSlide(bus.deck, 's_all')!;
    expect(slide.elements.slice(-2).map((e) => e.id)).toEqual(ids);
    expect(data.removed).toEqual(['e_html']);
  });

  it('element_convert in an object session keeps one element under the same id', async () => {
    const scope = { kind: 'object', slideId: 's_all', elementIds: ['e_html'] } as const;
    const { call, bus } = setup(allElementsDeck(), { conversion }, scope);
    const before = findSlide(bus.deck, 's_all')!.elements.map((e) => e.id);
    const data = await ok(call('element_convert', { elementId: 'e_html', to: 'elements' }));

    // Two replacements: a group that takes the element's id and place, holding both.
    expect(data.elementIds).toEqual(['e_html']);
    const slide = findSlide(bus.deck, 's_all')!;
    expect(slide.elements.map((e) => e.id)).toEqual(before);
    const group = slide.elements.at(-1)!;
    expect(group).toMatchObject({
      id: 'e_html',
      type: 'group',
      frame: { x: 0, y: 0, w: 30, h: 10 },
    });
    if (group.type !== 'group') throw new Error('not a group');
    expect(group.children.map((c) => c.frame.x)).toEqual([0, 20]);
    expect(data.changed).toEqual(['e_html']);
    expect(data.created).toEqual(group.children.map((c) => c.id));

    // The session goes on working on it, and on what is now inside it.
    await ok(call('element_update', { elementId: 'e_html', patch: { opacity: 0.5 } }));
    await ok(call('element_update', { elementId: group.children[0]!.id, patch: { opacity: 0.5 } }));
    // One undo step for the turn, as for any other write.
    expect(bus.undoStack).toHaveLength(1);
  });

  it('element_convert in an object session gives a single replacement the id', async () => {
    const one: ConversionService = {
      ...conversion,
      convertElement: () =>
        Promise.resolve({
          elements: [createElement.shape({ frame: { x: 5, y: 5, w: 10, h: 10 } })],
          assets: [],
          editability: 1,
          notes: [],
        }),
    };
    const scope = { kind: 'object', slideId: 's_all', elementIds: ['e_html'] } as const;
    const { call, bus } = setup(allElementsDeck(), { conversion: one }, scope);
    await ok(call('element_convert', { elementId: 'e_html', to: 'elements' }));
    expect(findElementInDeck(bus.deck, 'e_html')?.element).toMatchObject({
      type: 'shape',
      frame: { x: 5, y: 5, w: 10, h: 10 },
    });
    // Another element of the slide is still out of reach.
    const error = await failed(call('element_convert', { elementId: 'e_text', to: 'html' }));
    expect(error.code).toBe('out_of_scope');
  });

  describe('element_convert of an element that is the only child of its group', () => {
    const frame = { x: 0, y: 0, w: 400, h: 300 };
    const alone = () =>
      createDeck({
        slides: [
          createSlide({
            id: 's_1',
            elements: [
              createElement.shape({ id: 'e_under', frame }),
              createElement.group({
                id: 'e_group',
                frame: { x: 100, y: 100, w: 400, h: 300 },
                children: [createElement.html({ id: 'e_html', frame, markup: '<p>hello</p>' })],
              }),
            ],
          }),
        ],
      });
    const converts = (...ids: string[]): ConversionService => ({
      ...conversion,
      convertElement: () =>
        Promise.resolve({
          elements: ids.map((id) => createElement.shape({ id, frame })),
          assets: [],
          editability: 1,
          notes: [],
        }),
    });
    const inGroup = (deck: Deck) => {
      const group = findElementInDeck(deck, 'e_group')?.element;
      return group?.type === 'group' ? group.children.map((child) => child.id) : undefined;
    };

    it('puts the replacements inside the group, which stays where it was', async () => {
      const { call, bus } = setup(alone(), { conversion: converts('e_one', 'e_two') });
      const data = await ok(call('element_convert', { elementId: 'e_html', to: 'elements' }));
      expect(data.elementIds).toEqual(['e_one', 'e_two']);
      expect(inGroup(bus.deck)).toEqual(['e_one', 'e_two']);
      expect(bus.deck.slides[0]!.elements.map((e) => e.id)).toEqual(['e_under', 'e_group']);
      expect(data).toMatchObject({ removed: ['e_html'], created: ['e_one', 'e_two'] });
      bus.undo();
      expect(inGroup(bus.deck)).toEqual(['e_html']);
    });

    it('in an object session too, where the replacement keeps the id', async () => {
      const scope = { kind: 'object', slideId: 's_1', elementIds: ['e_html'] } as const;
      const { call, bus } = setup(alone(), { conversion: converts('e_one') }, scope);
      const data = await ok(call('element_convert', { elementId: 'e_html', to: 'elements' }));
      expect(data.elementIds).toEqual(['e_html']);
      expect(inGroup(bus.deck)).toEqual(['e_html']);
      expect(findElementInDeck(bus.deck, 'e_html')?.element.type).toBe('shape');
    });
  });

  it('lets an object session replace its element only by one element that keeps the id', () => {
    const scope = { kind: 'object', slideId: 's_all', elementIds: ['e_html'] } as const;
    const shape = (id: string) => createElement.shape({ id, frame: { x: 0, y: 0, w: 9, h: 9 } });
    const replace = (elementId: string, ...elements: Element[]): Command[] => [
      { type: 'element.replace', slideId: 's_all', elementId, elements },
    ];
    const deck = allElementsDeck();
    expect(checkWrite(scope, replace('e_html', shape('e_html')), deck)).toBeUndefined();
    expect(checkWrite(scope, replace('e_html', shape('e_else')), deck)).toMatch(
      /only by one element that keeps its id/,
    );
    expect(checkWrite(scope, replace('e_html', shape('e_html'), shape('e_more')), deck)).toMatch(
      /only by one element that keeps its id/,
    );
    expect(checkWrite(scope, replace('e_text', shape('e_text')), deck)).toMatch(
      /replace element "e_text", which is outside/,
    );
    // A slide session may replace anything on its slide, and nothing on another.
    const slide = { kind: 'slide', slideId: 's_all' } as const;
    expect(checkWrite(slide, replace('e_text', shape('e_a'), shape('e_b')), deck)).toBeUndefined();
    expect(
      checkWrite({ kind: 'slide', slideId: 's_x' }, replace('e_text', shape('e_a')), deck),
    ).toMatch(/outside a slide session/);
  });
});

describe('layouts, templates, images, options', () => {
  it('slide_create builds from a layout and adds at the end by default', async () => {
    const layouts: LayoutService = {
      createSlide: vi.fn((_deck: Deck, request: { layoutId: string }) =>
        Promise.resolve(createSlide({ id: 's_from_layout', layoutId: request.layoutId })),
      ),
    };
    const { call, bus } = setup(allElementsDeck(), { layouts });
    const data = await ok(
      call('slide_create', { layoutId: 'l_text_image', content: { title: 'שלום' } }),
    );
    expect(data.slideId).toBe('s_from_layout');
    expect(bus.deck.slides.at(-1)!.id).toBe('s_from_layout');
    expect((await failed(call('slide_create', { layoutId: 'l_none', content: {} }))).code).toBe(
      'not_found',
    );
  });

  it('template_apply writes the commands of the template as one step', async () => {
    const templates: TemplateService = {
      list: () => Promise.resolve([{ id: 'midnight', name: 'Midnight', personal: false }]),
      applyCommands: () => Promise.resolve([{ type: 'theme.update', patch: { name: 'Midnight' } }]),
      create: () => Promise.reject(new Error('unused')),
      save: () => Promise.resolve({ templateId: 'mine' }),
    };
    const { call, bus } = setup(hebrewDeck(), { templates });
    expect((await ok(call('deck_get_theme'))).templates).toEqual([
      { id: 'midnight', name: 'Midnight', personal: false },
    ]);
    await ok(call('template_apply', { templateId: 'midnight' }));
    expect(bus.deck.theme.name).toBe('Midnight');
    expect(await ok(call('template_save', { name: 'Mine' }))).toEqual({ templateId: 'mine' });
    const broken = await failed(
      call('template_create', {
        name: 'x',
        theme: {},
        layouts: [{ name: 'a', archetype: 'hero', html: '<div/>' }],
      }),
    );
    expect(broken).toEqual({ code: 'failed', message: 'unused' });
  });

  it('image_generate fills an image placeholder with the first result', async () => {
    const images: ImageService = {
      generate: vi.fn(({ count }: { count: number }) =>
        Promise.resolve(['b', 'c'].slice(0, count).map((n) => ({ asset: asset(n), preview: png }))),
      ),
      edit: () => Promise.resolve([]),
      process: () => Promise.reject(new Error('unused')),
    };
    const { call, bus } = setup(
      allElementsDeck(),
      { images },
      {
        kind: 'object',
        slideId: 's_all',
        elementIds: ['e_image_pending'],
      },
    );
    const result = await call('image_generate', {
      prompt: 'blue',
      count: 2,
      elementId: 'e_image_pending',
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.images).toHaveLength(2);
    expect(result.data.assets).toEqual([
      { assetId: 'b'.repeat(64), width: 1024, height: 576 },
      { assetId: 'c'.repeat(64), width: 1024, height: 576 },
    ]);
    const placed = findElementInDeck(bus.deck, 'e_image_pending')!.element;
    expect(placed).toMatchObject({ assetId: 'b'.repeat(64) });
    expect(placed).not.toHaveProperty('prompt');

    const empty = await failed(
      call('image_edit', { elementId: 'e_image_pending', instruction: 'x' }),
    );
    expect(empty.message).toMatch(/returned no image/);
  });

  it('image_generate takes prompt and shape from a placeholder, and adds the deck style', async () => {
    const generate = vi.fn((_request: { prompt: string; count: number; aspect: string }) =>
      Promise.resolve([{ asset: asset('b'), preview: png }]),
    );
    const images: ImageService = {
      generate,
      edit: () => Promise.resolve([]),
      process: () => Promise.reject(new Error('unused')),
    };
    const deck = allElementsDeck();
    deck.meta.imageStyle = 'Flat vector illustration, soft light.';
    const { call, bus } = setup(deck, { images });

    // No prompt: the placeholder's own. No aspect: the frame's (380 by 214 is nearest to 16:9).
    await ok(call('image_generate', { elementId: 'e_image_pending' }));
    const sent = generate.mock.calls[0]![0];
    expect(sent.prompt.split('\n')[0]).toBe('An abstract blue gradient, soft light');
    expect(sent.prompt).toContain(
      'Style, shared by every image of this presentation: Flat vector illustration, soft light.',
    );
    expect(sent.prompt).toContain(`primary ${deck.theme.colors.primary.toUpperCase()}`);
    expect(sent).toMatchObject({ count: 1, aspect: '16:9' });
    expect(findElementInDeck(bus.deck, 'e_image_pending')!.element).toMatchObject({
      assetId: 'b'.repeat(64),
    });

    // A prompt that already quotes the style is not given it twice; a given aspect stands.
    await ok(
      call('image_generate', {
        prompt: 'A harbour. Flat vector illustration, soft light.',
        aspect: '1:1',
      }),
    );
    const second = generate.mock.calls[1]![0];
    expect(second.prompt).not.toContain('Style, shared');
    expect(second.aspect).toBe('1:1');

    // Neither a prompt nor an element that carries one.
    expect((await failed(call('image_generate', {}))).code).toBe('invalid_input');
    expect(
      (await failed(call('image_generate', { elementId: 'e_image_pending' }))).message,
    ).toMatch(/carries no image prompt/);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('image_fill_placeholders fills every placeholder that carries a prompt, as one change', async () => {
    const deck = allElementsDeck();
    // A second placeholder on another slide, a tall one, and one without a prompt.
    deck.slides.push(
      createSlide({
        id: 's_more',
        elements: [
          createElement.image({
            id: 'e_tall',
            frame: { x: 0, y: 0, w: 400, h: 900 },
            prompt: 'A lighthouse at dusk',
          }),
          createElement.image({ id: 'e_bare', frame: { x: 500, y: 0, w: 400, h: 300 } }),
        ],
      }),
    );
    /** Ids for the images made, clear of the ids the fixture deck already has. */
    const MADE = 'pqrstuvwxyz';
    let made = 0;
    const generate = vi.fn((request: { prompt: string; aspect: string }) => {
      if (request.prompt.includes('lighthouse') && made > 5) {
        return Promise.reject(new Error('The usage limit was reached.'));
      }
      made += 1;
      return Promise.resolve([{ asset: asset(MADE[made - 1]!), preview: png }]);
    });
    const images: ImageService = {
      generate,
      edit: () => Promise.resolve([]),
      process: () => Promise.reject(new Error('unused')),
    };
    const session = setup(deck, { images });
    const { call, bus } = session;
    const before = bus.undoStack.length;

    const result = await call('image_fill_placeholders');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.filled).toEqual([
      { slideId: 's_all', elementId: 'e_image_pending', assetId: 'p'.repeat(64) },
      { slideId: 's_more', elementId: 'e_tall', assetId: 'q'.repeat(64) },
    ]);
    expect(result.data).toMatchObject({ failed: [], remaining: 0 });
    expect(result.images).toHaveLength(2);
    // Each from its own prompt, at the shape of its frame.
    expect(generate.mock.calls.map(([r]) => [r.prompt.split('\n')[0], r.aspect])).toEqual([
      ['An abstract blue gradient, soft light', '16:9'],
      ['A lighthouse at dusk', '9:16'],
    ]);
    expect(findElementInDeck(bus.deck, 'e_tall')!.element).toMatchObject({
      assetId: 'q'.repeat(64),
    });
    expect(findElementInDeck(bus.deck, 'e_bare')!.element).not.toHaveProperty('assetId');
    // One undo step for the turn.
    expect(bus.undoStack.length).toBe(before + 1);
    bus.undo();
    expect(findElementInDeck(bus.deck, 'e_tall')!.element).toMatchObject({
      prompt: 'A lighthouse at dusk',
    });
    expect(bus.deck.assets).not.toHaveProperty('q'.repeat(64));

    // Nothing waits: nothing is generated. One slide only: only its placeholders.
    bus.redo();
    session.nextTurn();
    expect(await ok(call('image_fill_placeholders'))).toMatchObject({ filled: [], remaining: 0 });
    bus.undo();
    session.nextTurn();
    const one = await ok(call('image_fill_placeholders', { slideId: 's_more' }));
    expect(one.filled).toEqual([
      { slideId: 's_more', elementId: 'e_tall', assetId: 'r'.repeat(64) },
    ]);
    expect((await failed(call('image_fill_placeholders', { slideId: 's_none' }))).code).toBe(
      'not_found',
    );

    // A slide session fills its own slide; an image that fails is reported and the rest stand.
    made = 6;
    session.nextTurn({ kind: 'slide', slideId: 's_all' });
    const own = await ok(call('image_fill_placeholders'));
    expect(own.filled).toEqual([
      { slideId: 's_all', elementId: 'e_image_pending', assetId: 'v'.repeat(64) },
    ]);
  });

  it('image_fill_placeholders fails when no image could be made', async () => {
    const images: ImageService = {
      generate: () => Promise.reject(new Error('Codex is not signed in.')),
      edit: () => Promise.resolve([]),
      process: () => Promise.reject(new Error('unused')),
    };
    const { call, bus } = setup(allElementsDeck(), { images });
    const before = bus.deck;
    expect(await failed(call('image_fill_placeholders'))).toEqual({
      code: 'failed',
      message: 'Codex is not signed in.',
    });
    expect(bus.deck).toBe(before);
  });

  it('image_edit says which kind of edit the provider in use made', async () => {
    const edit = vi.fn(() => Promise.resolve([{ asset: asset('d'), preview: png }]));
    const images: ImageService = {
      generate: () => Promise.resolve([]),
      edit,
      process: () => Promise.reject(new Error('unused')),
      describe: () => Promise.resolve({ name: 'Redrawing', edit: 'regenerate', mask: false }),
    };
    const { call } = setup(allElementsDeck(), { images });
    const data = await ok(
      call('image_edit', { elementId: 'e_image', instruction: 'make it night' }),
    );
    expect(data).toMatchObject({ provider: 'Redrawing', edit: 'regenerate' });
    expect(data.assets).toEqual([{ assetId: 'd'.repeat(64), width: 1024, height: 576 }]);

    // A service that cannot say leaves the result as it was.
    const silent: ImageService = { ...images, describe: undefined };
    const quiet = setup(allElementsDeck(), { images: silent });
    const bare = await ok(quiet.call('image_edit', { elementId: 'e_image', instruction: 'x' }));
    expect(bare).not.toHaveProperty('edit');
  });

  it('ui_present_options targets the session element', async () => {
    const present = vi.fn(() => Promise.resolve());
    const options: OptionsService = { present };
    const { call } = setup(
      allElementsDeck(),
      { options },
      {
        kind: 'object',
        slideId: 's_all',
        elementIds: ['e_text'],
      },
    );
    const data = await ok(
      call('ui_present_options', {
        kind: 'text',
        options: [
          { label: 'A', text: 'one' },
          { label: 'B', text: 'two' },
        ],
      }),
    );
    expect(data).toEqual({ shown: 2 });
    expect(present).toHaveBeenCalledWith(
      expect.objectContaining({ target: { slideId: 's_all', elementId: 'e_text' } }),
    );
    const deckSession = setup(allElementsDeck(), { options });
    expect(
      (await failed(deckSession.call('ui_present_options', { kind: 'text', options: [] }))).code,
    ).toBe('out_of_scope');
  });
});

describe('image_process and transparent images', () => {
  it('processes the picture of an element on this machine and puts the result in it', async () => {
    const process = vi.fn<ImageService['process']>(() =>
      Promise.resolve({ asset: asset('k'), preview: png }),
    );
    const images: ImageService = {
      generate: () => Promise.resolve([]),
      edit: () => Promise.resolve([]),
      process,
    };
    const { call, bus } = setup(allElementsDeck(), { images });
    const before = findElementInDeck(bus.deck, 'e_image')!.element;
    const source = before.type === 'image' ? before.assetId : undefined;
    const steps = bus.undoStack.length;

    const data = await ok(
      call('image_process', { elementId: 'e_image', operation: 'keyOutBackground' }),
    );
    expect(process).toHaveBeenCalledWith({ assetId: source, operation: 'keyOutBackground' });
    expect(data.assets).toEqual([{ assetId: 'k'.repeat(64), width: 1024, height: 576 }]);
    expect(findElementInDeck(bus.deck, 'e_image')!.element).toMatchObject({
      assetId: 'k'.repeat(64),
      frame: before.frame,
    });
    // The original stays an asset of the deck, and one undo brings it back to the element.
    expect(bus.deck.assets[source!]).toBeDefined();
    expect(bus.undoStack).toHaveLength(steps + 1);
    bus.undo();
    expect(findElementInDeck(bus.deck, 'e_image')!.element).toMatchObject({ assetId: source });

    expect(
      (await failed(call('image_process', { elementId: 'e_image', operation: 'sharpen' }))).code,
    ).toBe('invalid_input');
  });

  it('asks for a transparent image only when the agent does', async () => {
    const generate = vi.fn<ImageService['generate']>(() =>
      Promise.resolve([{ asset: asset('t'), preview: png }]),
    );
    const images: ImageService = {
      generate,
      edit: () => Promise.resolve([]),
      process: () => Promise.reject(new Error('unused')),
    };
    const { call } = setup(allElementsDeck(), { images });
    await ok(call('image_generate', { prompt: 'a red bicycle', transparent: true }));
    await ok(call('image_generate', { prompt: 'a harbour at dawn' }));
    expect(generate.mock.calls[0]![0]).toMatchObject({ transparent: true });
    expect(generate.mock.calls[1]![0]).not.toHaveProperty('transparent');
  });
});
