import {
  createElement,
  createSlide,
  findElementInDeck,
  findSlide,
  newId,
  type AssetMeta,
  type Deck,
} from '@slidr/model';
import { allElementsDeck, hebrewDeck } from '@slidr/model/fixtures';
import { describe, expect, it, vi } from 'vitest';
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
