import {
  CommandBus,
  createBaseTheme,
  createElement,
  createSlide as blankSlide,
  Deck,
  plainText,
  richText,
  type AssetMeta,
  type Element,
} from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { applyTemplate, deckFromTemplate } from './deck';
import { draftTemplate, layoutFromSlide, sampleDeckOf, themeFrom, type DrawnLayout } from './draft';
import { nightTemplate, paperTemplate } from './fixtures';
import { showSlideNumber, slideNumberHidden, slideNumberLayouts } from './master';
import { layoutsFor, Template } from './template';

const LOGO: AssetMeta = {
  id: 'b'.repeat(64),
  file: `${'b'.repeat(64)}.png`,
  mime: 'image/png',
  kind: 'image',
  bytes: 512,
  origin: 'upload',
};

const theme = createBaseTheme();

/** A cards layout as the conversion hands it over: boxes, texts with roles, a logo. */
function cards(): DrawnLayout {
  const card = (i: number): Element[] => [
    createElement.shape({ id: `e_card${i}`, frame: { x: 96 + i * 592, y: 300, w: 544, h: 520 } }),
    createElement.text({
      id: `e_head${i}`,
      role: 'subtitle',
      frame: { x: 136 + i * 592, y: 340, w: 464, h: 60 },
      content: richText(`Card ${i + 1}`, { dir: 'ltr', styleRef: 'heading' }),
    }),
    createElement.text({
      id: `e_body${i}`,
      role: 'body',
      frame: { x: 136 + i * 592, y: 420, w: 464, h: 360 },
      vAlign: 'top',
      content: {
        paragraphs: [
          {
            dir: 'ltr',
            align: 'center',
            runs: [{ text: `What card ${i + 1} says`, marks: { size: 30, weight: 700 } }],
          },
        ],
      },
    }),
  ];
  return {
    name: 'Cards',
    archetype: 'cards',
    slide: blankSlide({
      id: 's_cards',
      background: { fill: { kind: 'solid', color: { token: 'surface' } } },
      elements: [
        createElement.text({
          id: 'e_title',
          role: 'title',
          frame: { x: 96, y: 96, w: 1728, h: 160 },
          vAlign: 'bottom',
          content: richText('Three things', { dir: 'ltr', styleRef: 'title' }),
        }),
        ...[0, 1, 2].flatMap(card),
        createElement.image({
          id: 'e_logo',
          role: 'logo',
          frame: { x: 96, y: 960, w: 120, h: 40 },
          assetId: LOGO.id,
        }),
      ],
    }),
  };
}

describe('layoutFromSlide', () => {
  it('makes placeholders of the elements with a role and decorations of the rest', () => {
    const { layout, fills, notes } = layoutFromSlide(cards(), { id: 'l_x_1', theme });
    expect(layout).toMatchObject({
      id: 'l_x_1',
      name: 'Cards',
      archetype: 'cards',
      background: { fill: { kind: 'solid', color: { token: 'surface' } } },
    });
    expect(layout.placeholders.map((p) => [p.role, p.styleRef, p.align, p.vAlign])).toEqual([
      ['title', 'title', 'start', 'bottom'],
      ['subtitle', 'heading', 'start', 'top'],
      // Drawn at 30px with no style named: `body` is 30px in this theme.
      ['body', 'body', 'center', 'top'],
      ['subtitle', 'heading', 'start', 'top'],
      ['body', 'body', 'center', 'top'],
      ['subtitle', 'heading', 'start', 'top'],
      ['body', 'body', 'center', 'top'],
    ]);
    expect(layout.placeholders[0]!.frame).toEqual({ x: 96, y: 96, w: 1728, h: 160 });
    // The three cards and the logo, which keeps its role so the deck's own logo can replace it.
    expect(layout.decorations.map((d) => [d.type, d.role])).toEqual([
      ['shape', undefined],
      ['shape', undefined],
      ['shape', undefined],
      ['image', 'logo'],
    ]);
    expect(new Set(layout.decorations.map((d) => d.id)).size).toBe(4);
    expect(layout.decorations.every((d) => d.id.startsWith('l_x_1_d'))).toBe(true);
    // The sample is the words, without the look they were drawn with.
    expect(fills).toHaveLength(7);
    expect(fills[2]).toEqual({
      paragraphs: [{ dir: 'ltr', align: 'start', runs: [{ text: 'What card 1 says' }] }],
    });
    expect(notes).toEqual([]);
  });

  it('gives text drawn at a size of its own the nearest style, and says so', () => {
    const drawn: DrawnLayout = {
      name: 'Hero',
      archetype: 'hero',
      slide: blankSlide({
        elements: [
          createElement.text({
            id: 'e_title',
            role: 'title',
            frame: { x: 96, y: 300, w: 1200, h: 300 },
            content: {
              paragraphs: [
                { dir: 'rtl', align: 'start', runs: [{ text: 'פתיחה', marks: { size: 96 } }] },
              ],
            },
          }),
        ],
      }),
    };
    const { layout, notes } = layoutFromSlide(drawn, { id: 'l_x_1', theme });
    // 96 is nearer to `display` (112) than to `title` (72).
    expect(layout.placeholders[0]!.styleRef).toBe('display');
    expect(notes).toEqual([
      'Layout "Hero": the title text is drawn at 96px. A placeholder takes one of the theme\'s text styles, so it was given "display" (112px): set that size in the theme\'s text styles, or draw the text at the size of a style.',
    ]);
  });

  it('takes a group apart when it holds a placeholder, and keeps one that does not', () => {
    const drawn: DrawnLayout = {
      name: 'Quote',
      archetype: 'quote',
      slide: blankSlide({
        elements: [
          createElement.group({
            id: 'e_marks',
            frame: { x: 100, y: 100, w: 200, h: 100 },
            children: [
              createElement.shape({ id: 'e_m1', frame: { x: 0, y: 0, w: 80, h: 100 } }),
              createElement.shape({ id: 'e_m2', frame: { x: 120, y: 0, w: 80, h: 100 } }),
            ],
          }),
          createElement.group({
            id: 'e_block',
            frame: { x: 200, y: 300, w: 1500, h: 500 },
            children: [
              createElement.shape({ id: 'e_bar', frame: { x: 0, y: 0, w: 8, h: 500 } }),
              createElement.text({
                id: 'e_quote',
                role: 'quote',
                frame: { x: 40, y: 20, w: 1400, h: 300 },
                content: richText('A sentence worth a slide', { dir: 'ltr', styleRef: 'title' }),
              }),
            ],
          }),
        ],
      }),
    };
    const { layout } = layoutFromSlide(drawn, { id: 'l_x_1', theme });
    expect(layout.placeholders).toHaveLength(1);
    // On the slide, not inside the group it was drawn in.
    expect(layout.placeholders[0]!.frame).toEqual({ x: 240, y: 320, w: 1400, h: 300 });
    expect(layout.decorations.map((d) => [d.type, d.frame.x, d.frame.y])).toEqual([
      ['group', 100, 100],
      ['shape', 200, 300],
    ]);
  });

  it('says what a layout cannot keep', () => {
    const drawn: DrawnLayout = {
      name: 'Photo',
      archetype: 'fullImage',
      slide: blankSlide({
        css: '.x { color: red }',
        elements: [
          createElement.image({
            id: 'e_photo',
            role: 'image',
            frame: { x: 0, y: 0, w: 1920, h: 1080 },
            prompt: 'A harbour at dawn',
          }),
          createElement.shape({
            id: 'e_scrim',
            name: 'scrim',
            frame: { x: 0, y: 600, w: 1920, h: 480 },
          }),
          createElement.shape({
            id: 'e_chip',
            role: 'caption',
            frame: { x: 96, y: 700, w: 300, h: 60 },
            content: richText('Chip'),
          }),
          createElement.html({
            id: 'e_html',
            frame: { x: 96, y: 800, w: 400, h: 100 },
            markup: '<canvas></canvas>',
          }),
        ],
      }),
    };
    const { layout, fills, notes } = layoutFromSlide(drawn, { id: 'l_x_1', theme });
    expect(layout.placeholders.map((p) => p.role)).toEqual(['image', 'caption']);
    expect(fills[0]).toEqual({ imagePrompt: 'A harbour at dawn' });
    expect(notes.map((note) => note.slice(0, 70))).toEqual([
      'Layout "Photo": data-role="caption" is on a shape element, not on text',
      'Layout "Photo": a layout draws its decorations under the content of th',
      'Layout "Photo": 1 part stayed HTML and is drawn as it was written; it ',
      'Layout "Photo": slide-level CSS is not carried by a layout and was dro',
    ]);
    expect(
      layoutFromSlide({ ...drawn, slide: blankSlide() }, { id: 'l_x_2', theme }).notes,
    ).toEqual([
      'Layout "Photo": no element carries a data-role, so a slide made from it has nothing to fill in.',
    ]);
  });
});

describe('the slide number of a drawn layout', () => {
  const title = createElement.text({
    id: 'e_title',
    role: 'title',
    frame: { x: 96, y: 100, w: 800, h: 80 },
    content: richText('A title', { dir: 'ltr', styleRef: 'title' }),
  });
  const number = createElement.text({
    id: 'e_n',
    role: 'slideNumber',
    name: 'page',
    frame: { x: 1700, y: 980, w: 124, h: 40 },
    content: richText('7', { dir: 'ltr', align: 'end', marks: { size: 20, weight: 700 } }),
  });
  const drawn = (elements: Element[]): DrawnLayout => ({
    name: 'Title',
    archetype: 'hero',
    slide: blankSlide({ id: 's_a', elements }),
  });

  it('is what the layout draws on every slide, not a place a deck fills in', () => {
    const made = layoutFromSlide(drawn([title, number]), { id: 'l_x_1', theme });
    // As a placeholder it gave a slide no element, and nothing drew the number.
    expect(made.layout.placeholders.map((p) => p.role)).toEqual(['title']);
    expect(made.fills).toHaveLength(1);
    expect(made.notes).toEqual([]);
    // The text as it was drawn, with its role and its look: the renderer writes the number in it.
    expect(made.layout.decorations).toEqual([{ ...number, id: 'l_x_1_d1' }]);
  });

  it('makes a template whose decks number their slides, and can hide the number', () => {
    const { template } = draftTemplate({
      id: 'draft_x',
      name: 'X',
      theme,
      dir: 'ltr',
      layouts: [drawn([title, number])],
    });
    for (const lang of ['en', 'he']) {
      const deck = deckFromTemplate(template, { lang });
      expect(slideNumberLayouts(deck).map((l) => l.id)).toEqual([template.layouts[0]!.id]);
      const bus = new CommandBus(deck, { validate: true });
      bus.batch(showSlideNumber(bus.deck, false));
      expect(slideNumberHidden(bus.deck)).toBe(true);
    }
  });

  it('comes out of a group it was drawn in, to stand with the other master components', () => {
    const foot: Element = {
      id: 'e_foot',
      type: 'group',
      frame: { x: 96, y: 960, w: 1728, h: 60 },
      rotation: 0,
      opacity: 1,
      children: [
        createElement.shape({ id: 'e_rule', frame: { x: 0, y: 0, w: 1728, h: 2 } }),
        { ...number, frame: { x: 1604, y: 20, w: 124, h: 40 } },
      ],
    };
    const { layout } = layoutFromSlide(drawn([title, foot]), { id: 'l_x_1', theme });
    expect(layout.decorations.map((d) => [d.type, d.role, d.frame.x, d.frame.y])).toEqual([
      ['shape', undefined, 96, 960],
      ['text', 'slideNumber', 1700, 980],
    ]);
  });

  it('stays a plain drawing, with a note, when the role is not on text', () => {
    const badge = createElement.shape({
      id: 'e_badge',
      role: 'slideNumber',
      frame: { x: 1700, y: 980, w: 124, h: 40 },
      content: richText('7'),
    });
    const { layout, notes } = layoutFromSlide(drawn([title, badge]), { id: 'l_x_1', theme });
    expect(layout.placeholders.map((p) => p.role)).toEqual(['title']);
    expect(layout.decorations.map((d) => [d.type, d.role])).toEqual([['shape', undefined]]);
    expect(notes.map((note) => note.slice(0, 75))).toEqual([
      'Layout "Title": data-role="slideNumber" is on a shape element, not on text,',
    ]);
  });
});

describe('the room of a placeholder', () => {
  // A converted text is as tall as its words. The box it was drawn in says how much room the
  // designer left: that is the placeholder.
  const text = (id: string, role: 'title' | 'body' | 'caption', frame: Element['frame']) =>
    createElement.text({ id, role, frame, content: richText('One line', { styleRef: 'body' }) });
  const drawn = (elements: Element[], boxes: DrawnLayout['boxes']): DrawnLayout => ({
    name: 'Card',
    archetype: 'cards',
    slide: blankSlide({ elements }),
    ...(boxes ? { boxes } : {}),
  });
  const frames = (layout: DrawnLayout) =>
    layoutFromSlide(layout, { id: 'l_x_1', theme }).layout.placeholders.map((p) => [
      p.role,
      p.frame,
      p.vAlign,
    ]);

  it('is the box the text was drawn in, with the text seated where it sat', () => {
    const elements = [
      text('e_top', 'body', { x: 136, y: 450, w: 472, h: 48 }),
      text('e_mid', 'title', { x: 96, y: 500.2, w: 900, h: 88 }),
      text('e_low', 'caption', { x: 96, y: 969, w: 900, h: 31 }),
    ];
    expect(
      frames(
        drawn(elements, [
          { role: 'body', frame: { x: 136, y: 450, w: 472, h: 360 } },
          { role: 'title', frame: { x: 96, y: 400, w: 900, h: 288.4 } },
          { role: 'caption', frame: { x: 96, y: 900, w: 900, h: 100 } },
        ]),
      ),
    ).toEqual([
      ['body', { x: 136, y: 450, w: 472, h: 360 }, 'top'],
      ['title', { x: 96, y: 400, w: 900, h: 288 }, 'middle'],
      ['caption', { x: 96, y: 900, w: 900, h: 100 }, 'bottom'],
    ]);
  });

  it('starts at the text when the box holds it under a padding', () => {
    const elements = [text('e_body', 'body', { x: 136, y: 490, w: 472, h: 48 })];
    expect(
      frames(drawn(elements, [{ role: 'body', frame: { x: 136, y: 450, w: 472, h: 360 } }])),
    ).toEqual([['body', { x: 136, y: 490, w: 472, h: 320 }, 'top']]);
  });

  it('stays the converted frame when no box of its role holds it, and uses each box once', () => {
    const elements = [
      text('e_a', 'body', { x: 136, y: 450, w: 472, h: 48 }),
      text('e_b', 'body', { x: 724, y: 450, w: 472, h: 48 }),
      text('e_c', 'body', { x: 1312, y: 450, w: 472, h: 48 }),
    ];
    const boxes = [
      // In the order of the drawing, which need not be the order of the elements.
      { role: 'body', frame: { x: 724, y: 450, w: 472, h: 300 } },
      { role: 'body', frame: { x: 136, y: 450, w: 472, h: 360 } },
      // Another column: nobody's box. And a box of another role in the right place.
      { role: 'body', frame: { x: 0, y: 0, w: 472, h: 360 } },
      { role: 'title', frame: { x: 1312, y: 450, w: 472, h: 360 } },
    ];
    expect(frames(drawn(elements, boxes))).toEqual([
      ['body', { x: 136, y: 450, w: 472, h: 360 }, 'top'],
      ['body', { x: 724, y: 450, w: 472, h: 300 }, 'top'],
      ['body', { x: 1312, y: 450, w: 472, h: 48 }, 'top'],
    ]);
    // Without boxes every placeholder is the converted frame, as before.
    expect(
      frames(drawn(elements, undefined)).map(([, frame]) => (frame as Element['frame']).h),
    ).toEqual([48, 48, 48]);
  });
});

describe('themeFrom', () => {
  it('merges a patch as theme.update does, and takes the id and the name', () => {
    const made = themeFrom(
      theme,
      { colors: { primary: '#b4552d' }, radius: 24 },
      { id: 'draft_1', name: 'Clay' },
    );
    expect(made).toMatchObject({ id: 'draft_1', name: 'Clay', radius: 24 });
    expect(made.colors).toEqual({ ...theme.colors, primary: '#b4552d' });
    expect(made.textStyles).toEqual(theme.textStyles);
    // The base is not changed.
    expect(theme.colors.primary).not.toBe('#b4552d');
  });
});

describe('draftTemplate', () => {
  const made = () =>
    draftTemplate({
      id: 'draft_1',
      name: 'Clay',
      theme: themeFrom(theme, {}, { id: 'draft_1', name: 'Clay' }),
      dir: 'ltr',
      layouts: [cards()],
      assets: { [LOGO.id]: LOGO, ['c'.repeat(64)]: { ...LOGO, id: 'c'.repeat(64) } },
    });

  it('is a valid template that carries only the assets its layouts draw', () => {
    const { template, fills } = made();
    expect(Template.safeParse(template).error?.issues).toBeUndefined();
    expect(template.theme).toMatchObject({ id: 'draft_1', name: 'Clay' });
    expect(template.layouts.map((l) => l.id)).toEqual(['l_draft_1_1']);
    expect(Object.keys(template.assets ?? {})).toEqual([LOGO.id]);
    expect(Object.keys(fills)).toEqual(['l_draft_1_1']);
  });

  it('gives a deck its layouts in both directions, and takes a deck as one undo step', () => {
    const { template } = made();
    for (const lang of ['en', 'he']) {
      const deck = deckFromTemplate(template, { lang });
      expect(Deck.safeParse(deck).error?.issues).toBeUndefined();
      expect(deck.layouts).toEqual(layoutsFor(template, deck.meta.dir));
    }
    const before = deckFromTemplate(paperTemplate(), { lang: 'en', sample: true });
    const bus = new CommandBus(before, { validate: true });
    bus.batch(applyTemplate(before, template));
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.deck.theme.id).toBe('draft_1');
    bus.undo();
    expect(bus.deck).toEqual(before);
  });

  it('starts as a copy of another template: a drawn layout replaces the one of its archetype', () => {
    const base = paperTemplate();
    const { template, fills, notes } = draftTemplate({
      id: 'draft_2',
      name: 'Paper, warmer',
      theme: themeFrom(
        base.theme,
        { colors: { primary: '#b4552d' } },
        { id: 'draft_2', name: 'x' },
      ),
      dir: base.dir,
      // Paper has one hero layout and two cards layouts: the name decides between the two.
      layouts: [
        { ...cards(), name: 'Hero', archetype: 'hero' },
        { ...cards(), name: base.layouts.filter((l) => l.archetype === 'cards')[1]!.name },
        { ...cards(), name: 'Agenda', archetype: 'timeline' },
      ],
      base,
    });
    expect(Template.safeParse(template).error?.issues).toBeUndefined();
    expect(template.theme.colors.primary).toBe('#b4552d');
    expect(template.theme.name).toBe('Paper, warmer');
    const second = base.layouts.filter((l) => l.archetype === 'cards')[1]!;
    const ids = template.layouts.map((l) => l.id);
    // The layouts of the base in their order, the two replaced under their own ids.
    expect(ids.slice(0, base.layouts.length)).toEqual(base.layouts.map((l) => l.id));
    expect(template.layouts.find((l) => l.id === 'l_paper_hero')!.placeholders).toHaveLength(7);
    expect(template.layouts.find((l) => l.id === second.id)!.placeholders).toHaveLength(7);
    // A timeline is new to paper... unless paper has one, in which case it was replaced.
    const hadTimeline = base.layouts.some((l) => l.archetype === 'timeline');
    expect(template.layouts).toHaveLength(base.layouts.length + (hadTimeline ? 0 : 1));
    expect(Object.keys(fills)).toHaveLength(3);
    expect(notes).toEqual([]);
  });

  it('turns a base drawn for the other direction, so every deck gets the layouts it got before', () => {
    const night = nightTemplate();
    const other = night.dir === 'rtl' ? 'ltr' : 'rtl';
    const { template } = draftTemplate({
      id: 'draft_3',
      name: 'Night',
      theme: themeFrom(night.theme, {}, { id: 'draft_3', name: 'Night' }),
      dir: other,
      layouts: [],
      base: night,
    });
    expect(Template.safeParse(template).error?.issues).toBeUndefined();
    expect(template.dir).toBe(other);
    // Night draws one layout by hand for the other direction: both directions keep theirs.
    expect(night.flipped).toHaveLength(1);
    expect(template.flipped?.map((l) => l.id)).toEqual(night.flipped!.map((l) => l.id));
    for (const dir of ['rtl', 'ltr'] as const) {
      expect(layoutsFor(template, dir)).toEqual(layoutsFor(night, dir));
    }
  });
});

describe('sampleDeckOf', () => {
  const { template, fills } = draftTemplate({
    id: 'draft_1',
    name: 'Clay',
    theme: themeFrom(theme, {}, { id: 'draft_1', name: 'Clay' }),
    dir: 'ltr',
    layouts: [
      cards(),
      {
        name: 'Photo',
        archetype: 'fullImage',
        slide: blankSlide({
          elements: [
            createElement.image({
              id: 'e_photo',
              role: 'image',
              frame: { x: 0, y: 0, w: 1920, h: 640 },
              assetId: 'd'.repeat(64),
            }),
            createElement.text({
              id: 'e_caption',
              role: 'caption',
              frame: { x: 96, y: 700, w: 900, h: 60 },
              content: richText(''),
            }),
          ],
        }),
      },
    ],
    assets: { [LOGO.id]: LOGO },
  });

  it('shows every layout with what it was drawn with, in either direction', () => {
    for (const [lang, dir] of [
      ['en', 'ltr'],
      ['he', 'rtl'],
    ] as const) {
      const deck = sampleDeckOf(template, fills, { lang, dir });
      expect(Deck.safeParse(deck).error?.issues).toBeUndefined();
      expect(deck.slides.map((s) => [s.layoutId, s.name])).toEqual([
        ['l_draft_1_1', 'Cards'],
        ['l_draft_1_2', 'Photo'],
      ]);
      const [title, , body] = deck.slides[0]!.elements;
      expect(title).toMatchObject({ role: 'title', type: 'text' });
      expect(title?.type === 'text' && plainText(title.content)).toBe('Three things');
      // The layout's look, not the drawing's: the bold 30px of the drawing is gone.
      expect(body?.type === 'text' && body.content.paragraphs[0]).toMatchObject({
        styleRef: 'body',
        runs: [{ text: 'What card 1 says' }],
      });
      // Mirrored for the other direction.
      expect(title?.frame.x).toBe(96);
      expect(deck.slides[0]!.elements[1]?.frame.x).toBe(dir === 'ltr' ? 136 : 1320);
    }
  });

  it('leaves out a picture the deck does not have, and fills empty text when given words', () => {
    const deck = sampleDeckOf(template, fills, {
      lang: 'en',
      dir: 'ltr',
      fallback: (role) => (role === 'caption' ? 'A caption' : undefined),
    });
    const [photo, caption] = deck.slides[1]!.elements;
    expect(photo).toMatchObject({ type: 'image', role: 'image' });
    expect(photo?.type === 'image' && photo.assetId).toBeUndefined();
    expect(caption?.type === 'text' && plainText(caption.content)).toBe('A caption');
    // With the asset known, the picture is there.
    const withAsset = sampleDeckOf(template, fills, {
      lang: 'en',
      dir: 'ltr',
      assets: { ['d'.repeat(64)]: { ...LOGO, id: 'd'.repeat(64) } },
    });
    const [shown] = withAsset.slides[1]!.elements;
    expect(shown?.type === 'image' && shown.assetId).toBe('d'.repeat(64));
  });
});
