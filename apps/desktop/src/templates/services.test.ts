import {
  createDeckApi,
  startTurn,
  type ConversionService,
  type LintFinding,
  type ToolResult,
} from '@slidr/agent-tools';
import {
  CommandBus,
  createDeck,
  createElement,
  createSlide as blankSlide,
  plainText,
  richText,
  type AssetMeta,
  type Deck,
  type Element,
} from '@slidr/model';
import { deckFromTemplate, layoutsFor, Template } from '@slidr/templates';
import { nightTemplate, paperTemplate } from '@slidr/templates/fixtures';
import { describe, expect, it } from 'vitest';
import { TemplateDrafts } from './drafts';
import { createLayoutService } from './layoutService';
import { createTemplateService } from './templateService';

/** The real Deck API over a bus, with the two services under test and the fixture templates. */
function setup(deck: Deck) {
  const bus = new CommandBus(deck, { validate: true });
  const api = createDeckApi(bus, {
    layouts: createLayoutService(),
    templates: createTemplateService({
      builtIn: [paperTemplate()],
      personal: () => [nightTemplate()],
    }),
  });
  const turn = startTurn('sess', { kind: 'deck' });
  return { bus, call: (name: string, input: unknown = {}) => api.call(turn, name, input) };
}

async function ok(pending: Promise<ToolResult>): Promise<Record<string, unknown>> {
  const result = await pending;
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.data;
}

async function failed(pending: Promise<ToolResult>) {
  const result = await pending;
  if (result.ok) throw new Error(`Expected a failure, got ${JSON.stringify(result.data)}`);
  return result.error;
}

const PHOTO: AssetMeta = {
  id: 'a'.repeat(64),
  file: `${'a'.repeat(64)}.jpg`,
  mime: 'image/jpeg',
  kind: 'image',
  bytes: 1024,
  origin: 'upload',
};

describe('slide_create over the layout service', () => {
  it("turns the Markdown of each role into text in the deck's direction", async () => {
    const deck = deckFromTemplate(paperTemplate(), { lang: 'he' });
    deck.assets[PHOTO.id] = PHOTO;
    const { bus, call } = setup(deck);
    const data = await ok(
      call('slide_create', {
        layoutId: 'l_paper_text_image',
        name: 'מטרות',
        content: {
          title: 'שלוש **מטרות**',
          body: '- להשיק את העורך\n- Ship it\n- אלף משתמשים',
          image: { assetId: PHOTO.id },
        },
      }),
    );
    const slide = bus.deck.slides.at(-1)!;
    expect(data.slideId).toBe(slide.id);
    expect(slide).toMatchObject({ name: 'מטרות', layoutId: 'l_paper_text_image' });
    const [title, body, image] = slide.elements;
    // The layout of a Hebrew deck has its text on the right and its picture on the left.
    expect(title).toMatchObject({
      frame: { x: 964, y: 80, w: 860, h: 160 },
      content: {
        paragraphs: [
          {
            dir: 'rtl',
            styleRef: 'title',
            runs: [{ text: 'שלוש ' }, { text: 'מטרות', marks: { weight: 700 } }],
          },
        ],
      },
    });
    expect(body).toMatchObject({
      content: {
        paragraphs: [
          { dir: 'rtl', styleRef: 'body', list: { kind: 'bullet', level: 0 } },
          { dir: 'ltr', styleRef: 'body', runs: [{ text: 'Ship it' }] },
          { dir: 'rtl' },
        ],
      },
    });
    expect(image).toMatchObject({ frame: { x: 96, y: 80, w: 768, h: 920 }, assetId: PHOTO.id });

    // The slide is one step of the turn.
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck.slides).toHaveLength(0);
  });

  it('adds after a slide, and makes a placeholder to generate from an image prompt', async () => {
    const deck = deckFromTemplate(paperTemplate(), { lang: 'en', sample: true });
    const { bus, call } = setup(deck);
    const first = deck.slides[0]!.id;
    await ok(
      call('slide_create', {
        layoutId: 'l_paper_hero',
        afterSlideId: first,
        content: { title: 'Next', image: { imagePrompt: 'A calm sea' } },
      }),
    );
    expect(bus.deck.slides[1]).toMatchObject({
      layoutId: 'l_paper_hero',
      elements: [{ role: 'title' }, { role: 'subtitle' }, { role: 'image', prompt: 'A calm sea' }],
    });
  });

  it('fills every placeholder of a role that repeats from a list', async () => {
    const deck = deckFromTemplate(paperTemplate(), { lang: 'en' });
    const { bus, call } = setup(deck);
    await ok(
      call('slide_create', {
        layoutId: 'l_paper_cards3',
        content: { title: 'How it works', body: ['Plan', '**Build**', 'Ship'] },
      }),
    );
    const [, ...cards] = bus.deck.slides.at(-1)!.elements;
    expect(cards.map((card) => (card.type === 'text' ? plainText(card.content) : ''))).toEqual([
      'Plan',
      'Build',
      'Ship',
    ]);
    // One step for the whole slide, whatever the number of values.
    expect(bus.undoStack).toHaveLength(1);

    const tooMany = await failed(
      call('slide_create', {
        layoutId: 'l_paper_cards3',
        content: { body: ['One', 'Two', 'Three', 'Four'] },
      }),
    );
    expect(tooMany.message).toContain('no place for the content of: body');
  });

  it('refuses content the layout has no place for, and says what the layout has', async () => {
    const deck = deckFromTemplate(paperTemplate(), { lang: 'en' });
    const { bus, call } = setup(deck);
    const error = await failed(
      call('slide_create', {
        layoutId: 'l_paper_cards3',
        content: { title: 'How it works', quote: 'It just works.', image: { imagePrompt: 'x' } },
      }),
    );
    expect(error.code).toBe('invalid_input');
    expect(error.message).toContain('no place for the content of: quote, image');
    expect(error.message).toContain('Its placeholders: title, body ×3.');
    expect(bus.deck.slides).toHaveLength(0);
    expect(bus.undoStack).toHaveLength(0);

    const missing = await failed(
      call('slide_create', { layoutId: 'l_paper_hero', content: { image: { assetId: 'nope' } } }),
    );
    expect(missing).toMatchObject({ code: 'not_found' });
  });
});

describe('template tools over the template service', () => {
  it('deck_get_theme lists the library, built-in and personal', async () => {
    const { call } = setup(deckFromTemplate(paperTemplate(), { lang: 'en' }));
    expect((await ok(call('deck_get_theme'))).templates).toEqual([
      {
        id: 'test_paper',
        name: 'Test · Paper',
        description: 'Test fixture: light, drawn left-to-right.',
        personal: false,
      },
      {
        id: 'test_night',
        name: 'Test · Night',
        description: 'Test fixture: dark, drawn right-to-left.',
        personal: true,
      },
    ]);
  });

  it('template_apply switches the deck as one undo step', async () => {
    const deck = deckFromTemplate(paperTemplate(), { lang: 'he', sample: true });
    const { bus, call } = setup(deck);
    const data = await ok(call('template_apply', { templateId: 'test_night' }));
    expect(data.deck).toEqual(expect.arrayContaining(['theme', 'layouts']));

    const night = nightTemplate();
    expect(bus.deck.theme).toEqual(night.theme);
    expect(bus.deck.layouts.slice(0, night.layouts.length)).toEqual(layoutsFor(night, 'rtl'));
    expect(bus.deck.slides[0]!.layoutId).toBe('l_night_hero');
    expect(bus.undoStack).toHaveLength(1);

    // There and back is the deck that was, but for one line. The sample of `paper` is English,
    // and in this Hebrew deck each of its lines has the alignment of its seat as it is: the far
    // side of the box. The quote, which `night` centres, comes back on the side its seat means.
    await ok(call('template_apply', { templateId: 'test_paper' }));
    const back = structuredClone(deck);
    for (const element of back.slides.flatMap((slide) => slide.elements)) {
      if (element.type === 'text' && plainText(element.content) === 'It just works.') {
        element.content.paragraphs[0]!.align = 'end';
      }
    }
    expect(bus.deck).toEqual(back);
    expect(bus.deck).not.toEqual(deck);
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck).toEqual(deck);
  });

  it('reports an unknown template, and says so where the app cannot draft or save', async () => {
    const { bus, call } = setup(deckFromTemplate(paperTemplate(), { lang: 'en' }));
    const unknown = await failed(call('template_apply', { templateId: 'midnight' }));
    expect(unknown).toMatchObject({ code: 'not_found' });
    expect(unknown.message).toContain('deck_get_theme lists the templates');

    const draft = await failed(
      call('template_create', {
        name: 'Mine',
        theme: {},
        layouts: [{ name: 'Hero', archetype: 'hero', html: '<div data-role="title"></div>' }],
      }),
    );
    expect(draft).toMatchObject({ code: 'unavailable' });
    expect(draft.message).toContain('the HTML conversion');
    const save = await failed(call('template_save', { name: 'Mine' }));
    expect(save).toMatchObject({ code: 'unavailable' });
    expect(bus.undoStack).toHaveLength(0);
  });
});

describe('drafting a template (WG7-T11a)', () => {
  /** The drawn layouts of the test, by the HTML that stands for them: a stand-in for the conversion. */
  const drawn: Record<string, Element[]> = {
    hero: [
      createElement.shape({ id: 'e_field', frame: { x: 1280, y: 0, w: 640, h: 1080 } }),
      createElement.text({
        id: 'e_title',
        role: 'title',
        frame: { x: 96, y: 320, w: 1100, h: 260 },
        content: richText('The year ahead', { dir: 'ltr', styleRef: 'display' }),
      }),
      createElement.image({
        id: 'e_logo',
        role: 'logo',
        frame: { x: 96, y: 96, w: 160, h: 48 },
        assetId: PHOTO.id,
      }),
    ],
    cards: [
      createElement.text({
        id: 'e_title',
        role: 'title',
        frame: { x: 96, y: 96, w: 1728, h: 120 },
        content: richText('Three moves', { dir: 'ltr', styleRef: 'title' }),
      }),
      ...[0, 1, 2].map((i) =>
        createElement.text({
          id: `e_body${i}`,
          role: 'body',
          frame: { x: 96 + i * 592, y: 320, w: 544, h: 400 },
          content: richText(`Move ${i + 1}`, { dir: 'ltr', styleRef: 'body' }),
        }),
      ),
    ],
  };

  function drafting(deck: Deck) {
    const bus = new CommandBus(deck, { validate: true });
    const drafts = new TemplateDrafts();
    const linted: string[] = [];
    const saved: { id: string; name: string; setDefault: boolean }[] = [];
    const conversion: ConversionService = {
      htmlToSlide: (_scratch, { html, name }) => {
        const elements = drawn[html];
        if (!elements) return Promise.reject(new Error(`no drawing for ${html}`));
        return Promise.resolve({
          slide: blankSlide({ elements: structuredClone(elements), ...(name ? { name } : {}) }),
          assets: [],
          editability: html === 'cards' ? 0.75 : 1,
          notes: html === 'cards' ? ['a ring stayed HTML'] : [],
        });
      },
      convertElement: () => Promise.reject(new Error('not used')),
    };
    const api = createDeckApi(bus, {
      templates: createTemplateService({
        builtIn: [paperTemplate()],
        drafting: {
          drafts,
          conversion,
          lint: {
            lint: (tried, slideIds) => {
              linted.push(`${tried.meta.dir}:${slideIds.length}`);
              const first = slideIds[0]!;
              // The app's own word where the sample's was: the layout is tried with other text.
              const [title] = tried.slides[0]!.elements;
              const other = title?.type === 'text' && plainText(title.content) === 'Title';
              return Promise.resolve<LintFinding[]>([
                {
                  rule: 'L01',
                  severity: 'error',
                  slideId: first,
                  elementIds: [],
                  message: 'overflows',
                },
                {
                  rule: 'L13',
                  severity: 'warning',
                  slideId: first,
                  elementIds: [],
                  message: 'wordy',
                },
                ...(other && tried.meta.dir === 'ltr'
                  ? [
                      {
                        rule: 'L05',
                        severity: 'error' as const,
                        slideId: first,
                        elementIds: [],
                        message: 'unreadable',
                      },
                    ]
                  : []),
              ]);
            },
          },
          capture: {
            renderSlide: () => Promise.reject(new Error('not used')),
            renderContactSheet: (_deck, slideIds) =>
              Promise.resolve({ mimeType: 'image/png', data: `sheet-of-${slideIds.length}` }),
          },
          // The room the designer left in each card, which the converted text does not show.
          measure: (html) =>
            Promise.resolve(
              html === 'cards'
                ? [0, 1, 2].map((i) => ({
                    role: 'body',
                    frame: { x: 96 + i * 592, y: 320, w: 544, h: 520 },
                  }))
                : [],
            ),
          sampleText: (role) => (role === 'title' ? 'Title' : undefined),
          save: (draft, request) => {
            saved.push({ id: draft.id, ...request });
            drafts.markSaved(draft.id, 'personal_1');
            return Promise.resolve('personal_1');
          },
        },
      }),
    });
    const turn = startTurn('sess', { kind: 'deck' });
    const call = (name: string, input: unknown = {}) => api.call(turn, name, input);
    return { bus, drafts, linted, saved, call };
  }

  const layouts = [
    { name: 'Opening', archetype: 'hero', html: 'hero' },
    { name: 'Cards', archetype: 'cards', html: 'cards' },
  ];

  it('makes a draft from layouts in HTML: placeholders, a sample, findings and a sheet', async () => {
    const deck = createDeck({ lang: 'en' });
    deck.assets[PHOTO.id] = PHOTO;
    const { bus, drafts, linted, call } = drafting(deck);
    const result = await call('template_create', {
      name: 'Clay',
      theme: { colors: { primary: '#b4552d' } },
      layouts,
    });
    if (!result.ok) throw new Error(result.error.message);
    const { templateId } = result.data as { templateId: string };
    expect(templateId).toMatch(/^draft_[0-9a-z]+$/);
    expect(result.data.layouts).toEqual([
      {
        id: `l_${templateId}_1`,
        name: 'Opening',
        archetype: 'hero',
        placeholders: 'title',
        editability: 1,
      },
      {
        id: `l_${templateId}_2`,
        name: 'Cards',
        archetype: 'cards',
        placeholders: 'title, body ×3',
        editability: 0.75,
      },
    ]);
    // The lint ran on the sample as drawn and mirrored, and on the app's own words in Hebrew and
    // in English. The rule about how much a slide says is left out, and what the sample already
    // showed of a layout is said once.
    expect(linted).toEqual(['ltr:2', 'rtl:2', 'rtl:2', 'ltr:2']);
    const overflows = { layout: 'Opening', rule: 'L01', severity: 'error', message: 'overflows' };
    expect(result.data.findings).toEqual([
      { ...overflows, dir: 'ltr', text: 'sample' },
      { ...overflows, dir: 'rtl', text: 'sample' },
      {
        layout: 'Opening',
        dir: 'ltr',
        text: 'other',
        rule: 'L05',
        severity: 'error',
        message: 'unreadable',
      },
    ]);
    expect(result.data.notes).toEqual(['Layout "Cards": a ring stayed HTML']);
    expect(result.images).toEqual([{ mimeType: 'image/png', data: 'sheet-of-2' }]);

    // Nothing is saved and the deck is as it was; the draft is there for the user to see.
    expect(bus.undoStack).toHaveLength(0);
    const draft = drafts.get(templateId)!;
    expect(drafts.state.getState().shown).toBe(templateId);
    expect(Template.safeParse(draft.template).error?.issues).toBeUndefined();
    expect(draft.template.theme).toMatchObject({ id: templateId, name: 'Clay' });
    expect(draft.template.theme.colors.primary).toBe('#b4552d');
    expect(draft.template.dir).toBe('ltr');
    // The logo is drawn by the layout, under its role, and its asset travels with the template.
    expect(draft.template.layouts[0]!.decorations.map((d) => d.role)).toEqual([undefined, 'logo']);
    expect(Object.keys(draft.template.assets ?? {})).toEqual([PHOTO.id]);
    expect(draft.sample.slides.map((slide) => slide.name)).toEqual(['Opening', 'Cards']);
    // A placeholder is as tall as the box it was drawn in, not as its one line of sample.
    expect(draft.template.layouts[1]!.placeholders.map((p) => p.frame.h)).toEqual([
      120, 520, 520, 520,
    ]);
    const [title] = draft.sample.slides[0]!.elements;
    expect(title?.type === 'text' && plainText(title.content)).toBe('The year ahead');
  });

  it('revises a draft, or a template of the library, with only what changes', async () => {
    const { drafts, call } = drafting(createDeck({ lang: 'en' }));
    const first = await ok(call('template_create', { name: 'Clay', theme: {}, layouts }));
    const second = await ok(
      call('template_create', {
        name: 'Clay',
        theme: { radius: 4 },
        layouts: [{ name: 'Opening', archetype: 'hero', html: 'cards' }],
        basedOn: first.templateId,
      }),
    );
    const revised = drafts.get(second.templateId as string)!;
    expect(revised.template.theme.radius).toBe(4);
    // The opening was redrawn under its id; the cards layout and its sample came along.
    expect(revised.template.layouts.map((l) => [l.name, l.placeholders.length])).toEqual([
      ['Opening', 4],
      ['Cards', 4],
    ]);
    const cards = revised.sample.slides[1]!.elements[1];
    expect(cards?.type === 'text' && plainText(cards.content)).toBe('Move 1');

    // Over a template of the library: its theme, its layouts, and one layout more or redrawn.
    const paper = paperTemplate();
    const third = await ok(
      call('template_create', { name: 'Paper II', theme: {}, layouts: [], basedOn: 'test_paper' }),
    );
    const copy = drafts.get(third.templateId as string)!;
    expect(copy.template.layouts.map((l) => l.id)).toEqual(paper.layouts.map((l) => l.id));
    expect(copy.template.theme.colors).toEqual(paper.theme.colors);
    // A layout with no sample of its own shows the words the app has for its roles.
    const hero = copy.sample.slides[0]!.elements.find((e) => e.role === 'title');
    expect(hero?.type === 'text' && plainText(hero.content)).toBe('Title');
  });

  it('refuses what it cannot make a draft of', async () => {
    const { call } = drafting(createDeck({ lang: 'en' }));
    expect(
      await failed(call('template_create', { name: 'x', theme: {}, layouts: [] })),
    ).toMatchObject({ code: 'invalid_input' });
    expect(
      await failed(call('template_create', { name: 'x', theme: {}, layouts, basedOn: 'nope' })),
    ).toMatchObject({ code: 'not_found' });
    const tokens = await failed(
      call('template_create', { name: 'x', theme: { colors: { primary: '' } }, layouts }),
    );
    expect(tokens.code).toBe('invalid_input');
  });

  it('template_save keeps a draft in the library once, and knows no other id', async () => {
    const { bus, saved, call } = drafting(createDeck({ lang: 'en' }));
    const { templateId } = await ok(call('template_create', { name: 'Clay', theme: {}, layouts }));
    expect(await ok(call('template_save', { templateId, name: 'Clay', setDefault: true }))).toEqual(
      {
        templateId: 'personal_1',
      },
    );
    expect(await ok(call('template_save', { templateId, name: 'Clay again' }))).toEqual({
      templateId: 'personal_1',
    });
    expect(saved).toEqual([{ id: templateId, name: 'Clay', setDefault: true }]);
    expect(await failed(call('template_save', { templateId: 'draft_x', name: 'x' }))).toMatchObject(
      {
        code: 'not_found',
      },
    );
    expect(bus.undoStack).toHaveLength(0);
  });
});
