import { createDeckApi, startTurn, type ToolResult } from '@slidr/agent-tools';
import { CommandBus, type AssetMeta, type Deck } from '@slidr/model';
import { deckFromTemplate, layoutsFor } from '@slidr/templates';
import { nightTemplate, paperTemplate } from '@slidr/templates/fixtures';
import { describe, expect, it } from 'vitest';
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

    // There and back is the deck that was; one undo is the deck that was, too.
    await ok(call('template_apply', { templateId: 'test_paper' }));
    expect(bus.deck).toEqual(deck);
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(bus.deck).toEqual(deck);
  });

  it('reports an unknown template, and that drafting and saving are not built yet', async () => {
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
    expect(draft.message).toContain('WG7-T11a');
    const save = await failed(call('template_save', { name: 'Mine' }));
    expect(save).toMatchObject({ code: 'unavailable' });
    expect(save.message).toContain('WG7-T09');
    expect(bus.undoStack).toHaveLength(0);
  });
});
