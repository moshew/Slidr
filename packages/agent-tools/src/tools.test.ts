import {
  CommandBus,
  createElement,
  createSelectionStore,
  findElement,
  findElementInDeck,
  findSlide,
  plainText,
  type ChartElement,
  type Deck,
  type TableElement,
  type TextElement,
} from '@slidr/model';
import { allElementsDeck, englishDeck, hebrewDeck } from '@slidr/model/fixtures';
import { describe, expect, it } from 'vitest';
import { createDeckApi } from './registry';
import type { UiPort } from './services';
import { failed, ok, setup } from './testing';
import { startTurn } from './tool';

const element = <T>(deck: Deck, id: string) => findElementInDeck(deck, id)!.element as T;

describe('read tools', () => {
  it('deck_get_outline lists the slides with numbers, titles and archetypes', async () => {
    const { call } = setup(allElementsDeck());
    const outline = await ok(call('deck_get_outline'));
    expect(outline).toMatchObject({ title: 'All element types', dir: 'rtl', slideCount: 2 });
    expect(outline.slides).toEqual([
      {
        number: 1,
        id: 's_all',
        name: 'All element types',
        title: 'כל סוגי האובייקטים',
        layoutId: 'l_text_image',
        archetype: 'textImage',
        elements: 13,
      },
      { number: 2, id: 's_empty', name: 'Empty', elements: 0, hidden: true },
    ]);
  });

  it('a slide without a layout carries its own archetype', async () => {
    const { call, bus } = setup(allElementsDeck());
    await ok(call('slide_update', { slideId: 's_empty', archetype: 'quote' }));
    const outline = await ok(call('deck_get_outline'));
    expect((outline.slides as unknown[])[1]).toMatchObject({ id: 's_empty', archetype: 'quote' });

    await ok(call('slide_update', { slideId: 's_empty', archetype: null }));
    expect(findSlide(bus.deck, 's_empty')!.archetype).toBeUndefined();
  });

  it('deck_get_theme gives the theme and the layouts with their placeholders', async () => {
    const { call } = setup(allElementsDeck());
    const theme = await ok(call('deck_get_theme'));
    expect(theme).toMatchObject({ theme: { name: 'Basic' } });
    expect(theme.layouts).toEqual([
      expect.objectContaining({ id: 'l_text_image', archetype: 'textImage' }),
    ]);
    expect((theme.layouts as { placeholders: unknown[] }[])[0]!.placeholders).toHaveLength(3);
  });

  it('slide_get and element_get return the model', async () => {
    const { call, bus } = setup(allElementsDeck());
    expect(await ok(call('slide_get', { slideId: 's_empty' }))).toEqual({
      number: 2,
      slide: bus.deck.slides[1],
    });
    expect(await ok(call('element_get', { elementId: 'e_group_text' }))).toMatchObject({
      slideId: 's_all',
      parentId: 'e_group',
      element: { id: 'e_group_text', type: 'text' },
    });
  });

  it('says a missing id may have been deleted, and where an element really is', async () => {
    const { call } = setup(allElementsDeck());
    const gone = await failed(call('element_get', { elementId: 'e_gone' }));
    expect(gone.code).toBe('not_found');
    expect(gone.message).toMatch(/may have been deleted/);
    expect((await failed(call('slide_get', { slideId: 's_gone' }))).message).toMatch(
      /may have been deleted/,
    );
    const wrong = await failed(call('element_get', { elementId: 'e_text', slideId: 's_empty' }));
    expect(wrong.message).toMatch(/is on slide "s_all"/);
  });

  it('selection_get and ui_navigate go through the UI port', async () => {
    const bus = new CommandBus(hebrewDeck());
    const selection = createSelectionStore(bus);
    const ui: UiPort = {
      selection: () => selection.getState(),
      navigate: ({ slideId, elementIds }) => {
        selection.getState().setCurrentSlide(slideId);
        if (elementIds) selection.getState().selectElements([...elementIds]);
      },
    };
    const api = createDeckApi(bus, { ui });
    const turn = startTurn('sess', { kind: 'deck' });
    await ok(
      api.call(turn, 'ui_navigate', { slideId: 's_he_goals', elementIds: ['e_he_goals_body'] }),
    );
    expect(await ok(api.call(turn, 'selection_get', {}))).toEqual({
      currentSlide: { id: 's_he_goals', number: 2, name: 'שלוש המטרות' },
      selectedSlideIds: ['s_he_goals'],
      selectedElements: [{ id: 'e_he_goals_body', type: 'text', role: 'body' }],
      editingElementId: null,
    });
    const stray = await failed(
      api.call(turn, 'ui_navigate', { slideId: 's_he_goals', elementIds: ['e_x'] }),
    );
    expect(stray.code).toBe('not_found');
    expect(bus.canUndo).toBe(false);
  });
});

describe('slide tools', () => {
  it('slide_update replaces fields, reads notes as Markdown, and removes with null', async () => {
    const { call, bus } = setup(allElementsDeck());
    const data = await ok(
      call('slide_update', {
        slideId: 's_all',
        name: 'Renamed',
        background: null,
        notes: 'להזכיר **שני** דברים\n- ראשון\n- שני',
      }),
    );
    expect(data).toMatchObject({ created: [], changed: ['s_all'], removed: [], slides: ['s_all'] });
    const slide = findSlide(bus.deck, 's_all')!;
    expect(slide.name).toBe('Renamed');
    expect(slide.background).toBeUndefined();
    expect(slide.notes!.paragraphs).toHaveLength(3);
    expect(slide.notes!.paragraphs[1]!.list).toEqual({ kind: 'bullet', level: 0 });
    expect((await failed(call('slide_update', { slideId: 's_all' }))).code).toBe('invalid_input');
  });

  it('slide_update takes only the transitions the runtime can play', async () => {
    const { call, bus } = setup(allElementsDeck());
    const transition = (type: string) => ({
      type,
      duration: 600,
      easing: 'ease-in-out',
      advance: { onClick: true },
    });
    const refused = await failed(
      call('slide_update', { slideId: 's_all', transition: transition('swirl') }),
    );
    expect(refused.code).toBe('invalid_input');
    expect(refused.message).toMatch(/Unknown transition type "swirl". Use one of: .*fade/);
    await ok(call('slide_update', { slideId: 's_all', transition: transition('fade') }));
    expect(findSlide(bus.deck, 's_all')!.transition?.type).toBe('fade');
    await ok(call('slide_update', { slideId: 's_all', transition: null }));
    expect(findSlide(bus.deck, 's_all')!.transition).toBeUndefined();
  });

  it('slide_delete removes slides and reports their elements', async () => {
    const { call, bus } = setup(hebrewDeck());
    const data = await ok(call('slide_delete', { slideIds: ['s_he_goals'] }));
    expect(data.removed).toEqual(['s_he_goals', 'e_he_goals_title', 'e_he_goals_body']);
    expect(bus.deck.slides.map((s) => s.id)).toEqual(['s_he_hero', 's_he_number']);
  });

  it('slide_duplicate copies with new ids, after the original by default', async () => {
    const { call, bus } = setup(hebrewDeck());
    const data = await ok(call('slide_duplicate', { slideId: 's_he_hero' }));
    const copyId = data.slideId as string;
    expect(bus.deck.slides[1]!.id).toBe(copyId);
    expect(data.created).toHaveLength(3);
    expect(data.created).toContain(copyId);
    const first = await ok(call('slide_duplicate', { slideId: 's_he_number', afterSlideId: null }));
    expect(bus.deck.slides[0]!.id).toBe(first.slideId);
  });

  it('slides_reorder moves slides after another one, or to the start', async () => {
    const { call } = setup(englishDeck());
    const moved = await ok(
      call('slides_reorder', { slideIds: ['s_en_hero'], afterSlideId: 's_en_risks' }),
    );
    expect(moved.order).toEqual(['s_en_goals', 's_en_risks', 's_en_hero']);
    expect(moved.deck).toEqual(['slideOrder']);
    const back = await ok(call('slides_reorder', { slideIds: ['s_en_hero'], afterSlideId: null }));
    expect(back.order).toEqual(['s_en_hero', 's_en_goals', 's_en_risks']);
    const self = await failed(
      call('slides_reorder', { slideIds: ['s_en_hero'], afterSlideId: 's_en_hero' }),
    );
    expect(self.code).toBe('invalid_input');
  });
});

describe('element tools', () => {
  const box = { x: 100, y: 100, w: 400, h: 200 };

  it('element_add adds a full element and reports a taken id or a bad field', async () => {
    const { call, bus } = setup(allElementsDeck());
    const shape = createElement.shape({ id: 'e_new00001', frame: box });
    const data = await ok(call('element_add', { slideId: 's_empty', element: shape }));
    expect(data).toMatchObject({
      elementId: 'e_new00001',
      created: ['e_new00001'],
      slides: ['s_empty'],
    });
    expect(findElement(findSlide(bus.deck, 's_empty')!, 'e_new00001')).toEqual(shape);

    const taken = await failed(call('element_add', { slideId: 's_empty', element: shape }));
    expect(taken).toMatchObject({ code: 'conflict' });
    const bad = await failed(
      call('element_add', {
        slideId: 's_empty',
        element: { ...shape, id: 'e_new00002', frame: { ...box, w: -1 } },
      }),
    );
    expect(bad.code).toBe('invalid_input');
    expect(bad.message).toContain('element.frame.w');
    const kind = await failed(
      call('element_add', { slideId: 's_empty', element: { type: 'blob', id: 'e_x' } }),
    );
    expect(kind.message).toMatch(/element\.type: must be one of "text", .*"group"/);
  });

  it('element_update merges a partial frame and replaces other fields whole', async () => {
    const { call, bus } = setup(allElementsDeck());
    const data = await ok(
      call('element_update', {
        elementId: 'e_image',
        patch: { frame: { x: 0 }, alt: null, opacity: 0.5 },
      }),
    );
    expect(data).toMatchObject({ changed: ['e_image'], slides: ['s_all'] });
    const image = element<{ frame: object; alt?: string; opacity: number }>(bus.deck, 'e_image');
    expect(image.frame).toEqual({ x: 0, y: 60, w: 800, h: 450 });
    expect(image.alt).toBeUndefined();
    expect(image.opacity).toBe(0.5);

    const fixed = await failed(
      call('element_update', { elementId: 'e_image', patch: { type: 'text' } }),
    );
    expect(fixed).toMatchObject({ code: 'invalid_input' });
    expect(fixed.message).toMatch(/cannot be changed/);
    const gone = await failed(
      call('element_update', { elementId: 'e_gone', patch: { opacity: 1 } }),
    );
    expect(gone.message).toMatch(/may have been deleted/);
  });

  it('element_delete removes elements of several slides in one step', async () => {
    const { call, bus } = setup(englishDeck());
    const data = await ok(
      call('element_delete', { elementIds: ['e_en_goals_title', 'e_en_risks_body'] }),
    );
    expect(data.removed).toEqual(['e_en_goals_title', 'e_en_risks_body']);
    expect(bus.undoStack).toHaveLength(1);
  });

  it('elements_arrange aligns, orders, groups and ungroups', async () => {
    const { call, bus } = setup(allElementsDeck());
    await ok(
      call('elements_arrange', {
        action: 'align',
        elementIds: ['e_text', 'e_shape'],
        edge: 'left',
      }),
    );
    expect(element<TextElement>(bus.deck, 'e_shape').frame.x).toBe(80);

    await ok(call('elements_arrange', { action: 'back', elementIds: ['e_html'] }));
    expect(findSlide(bus.deck, 's_all')!.elements[0]!.id).toBe('e_html');

    const grouped = await ok(
      call('elements_arrange', {
        action: 'group',
        elementIds: ['e_line', 'e_svg_inline'],
        name: 'pair',
      }),
    );
    const groupId = grouped.groupId as string;
    expect(grouped.created).toEqual([groupId]);
    expect(element<{ name: string }>(bus.deck, groupId).name).toBe('pair');

    const ungrouped = await ok(
      call('elements_arrange', { action: 'ungroup', elementIds: [groupId] }),
    );
    expect(ungrouped.removed).toEqual([groupId]);

    const missing = await failed(
      call('elements_arrange', { action: 'distribute', elementIds: ['e_text'] }),
    );
    expect(missing.message).toMatch(/needs `axis`/);
    const mixed = await failed(
      call('elements_arrange', {
        action: 'align',
        edge: 'top',
        elementIds: ['e_text', 'e_group_text'],
      }),
    );
    expect(mixed.code).toBe('invalid_state');
  });
});

describe('content tools', () => {
  it('text_set writes Markdown and keeps the look of the old text', async () => {
    const { call, bus } = setup(hebrewDeck());
    await ok(call('text_set', { elementId: 'e_he_hero_title', markdown: 'כותרת **חדשה**' }));
    const title = element<TextElement>(bus.deck, 'e_he_hero_title');
    expect(title.content.paragraphs).toEqual([
      {
        dir: 'rtl',
        align: 'start',
        styleRef: 'display',
        runs: [
          { text: 'כותרת ', marks: { color: { token: 'bg' } } },
          { text: 'חדשה', marks: { color: { token: 'bg' }, weight: 700 } },
        ],
      },
    ]);
  });

  it('text_set lets a one-line box from HTML wrap once its text is longer', async () => {
    const session = setup(hebrewDeck());
    const { call, bus } = session;
    const id = 'e_he_hero_title';
    const title = () => element<TextElement>(bus.deck, id);
    await ok(call('element_update', { elementId: id, patch: { wrap: false } }));

    // Shorter text still fits the box that was measured to the old one.
    await ok(call('text_set', { elementId: id, markdown: 'קצר' }));
    expect(title().wrap).toBe(false);

    const turn = session.nextTurn();
    await ok(call('text_set', { elementId: id, markdown: 'כותרת ארוכה בהרבה מזו שנמדדה לתיבה' }));
    expect(title().wrap).toBe(true);
    // The text and the wrapping are one change: one undo takes both back, one redo brings both.
    expect(bus.undoTransaction(turn.txId)).toBe(true);
    expect(title().wrap).toBe(false);
    expect(plainText(title().content)).toBe('קצר');
    expect(bus.redo()).toBe(true);
    expect(title().wrap).toBe(true);
    expect(plainText(title().content)).toBe('כותרת ארוכה בהרבה מזו שנמדדה לתיבה');
  });

  it('text_set takes RichText, a table cell, and refuses what holds no text', async () => {
    const { call, bus } = setup(allElementsDeck());
    const content = { paragraphs: [{ dir: 'ltr', align: 'center', runs: [{ text: 'Raw' }] }] };
    await ok(call('text_set', { elementId: 'e_text', richText: content }));
    expect(element<TextElement>(bus.deck, 'e_text').content).toEqual(content);

    await ok(
      call('text_set', { elementId: 'e_table', cell: { row: 2, col: 1 }, markdown: '2.1M' }),
    );
    expect(plainText(element<TableElement>(bus.deck, 'e_table').cells[2]![1]!.content)).toBe(
      '2.1M',
    );

    expect((await failed(call('text_set', { elementId: 'e_image', markdown: 'x' }))).code).toBe(
      'invalid_state',
    );
    expect(
      (await failed(call('text_set', { elementId: 'e_text', markdown: 'x', richText: content })))
        .code,
    ).toBe('invalid_input');
    expect(
      (await failed(call('text_set', { elementId: 'e_table', markdown: 'x' }))).message,
    ).toMatch(/cell/);
  });

  it('table_set changes the grid and creates a table', async () => {
    const { call, bus } = setup(allElementsDeck());
    await ok(
      call('table_set', {
        elementId: 'e_table',
        cells: [
          ['רבעון', 'הכנסות', 'רווח'],
          ['Q4', '1.6M', '**0.4M**'],
        ],
        bandedRows: true,
      }),
    );
    const table = element<TableElement>(bus.deck, 'e_table');
    expect(table.rows).toEqual([120, 120]);
    expect(table.cols).toEqual([160, 160, 160]);
    expect(table.frame).toMatchObject({ w: 480, h: 240 });
    expect(table.style).toMatchObject({ headerRow: true, bandedRows: true });
    expect(table.cells[1]![2]!.content.paragraphs[0]!.runs[0]!.marks).toEqual({ weight: 700 });

    const created = await ok(
      call('table_set', {
        slideId: 's_empty',
        frame: { x: 0, y: 0, w: 600, h: 200 },
        cells: [['a', 'b']],
      }),
    );
    const fresh = element<TableElement>(bus.deck, created.elementId as string);
    expect(fresh).toMatchObject({ dir: 'rtl', cols: [300, 300], rows: [200] });
    expect(
      (await failed(call('table_set', { elementId: 'e_table', cells: [['a'], ['b', 'c']] }))).code,
    ).toBe('invalid_input');
  });

  it('table_set sizes new columns by their text, takes a style, and leaves alignment to the table', async () => {
    const { call, bus } = setup(allElementsDeck());
    const created = await ok(
      call('table_set', {
        slideId: 's_empty',
        frame: { x: 96, y: 200, w: 1200, h: 300 },
        cells: [
          ['מדד', 'Q2', 'Q3'],
          ['הכנסה חודשית חוזרת באלפי דולרים', '412', '468'],
          ['', '37', '52'],
        ],
        styleId: 'lines',
      }),
    );
    const table = element<TableElement>(bus.deck, created.elementId as string);
    expect(table.style).toEqual({
      headerRow: true,
      bandedRows: false,
      firstColumn: false,
      styleId: 'lines',
    });
    // The column of the long label is the widest, and the table is as wide as its frame.
    expect(table.cols[0]).toBeGreaterThan(table.cols[1]! * 2);
    expect(table.cols.reduce((a, b) => a + b, 0)).toBeCloseTo(1200, 5);
    // "Q2" in a Hebrew table: `auto`, so the renderer aligns it by the table, not to the left.
    const dirs = table.cells.flat().flatMap((cell) => cell.content.paragraphs.map((p) => p.dir));
    expect(new Set(dirs)).toEqual(new Set(['auto']));
    // An empty cell keeps a paragraph, so its row keeps a line of height.
    expect(table.cells[2]![0]!.content.paragraphs).toHaveLength(1);

    await ok(call('text_set', { elementId: table.id, cell: { row: 1, col: 1 }, markdown: '415' }));
    const cell = element<TableElement>(bus.deck, table.id).cells[1]![1]!;
    expect(cell.content.paragraphs[0]).toMatchObject({ dir: 'auto', runs: [{ text: '415' }] });

    expect((await failed(call('table_set', { elementId: table.id, styleId: 'zebra' }))).code).toBe(
      'invalid_input',
    );
  });

  it('table_set keeps merged cells and the frame when rows are added', async () => {
    const { call, bus } = setup(allElementsDeck());
    const created = await ok(
      call('table_set', {
        slideId: 's_empty',
        frame: { x: 0, y: 0, w: 600, h: 200 },
        cells: [
          ['a', 'b'],
          ['c', 'd'],
        ],
      }),
    );
    const id = created.elementId as string;
    const before = element<TableElement>(bus.deck, id);
    // The header spans both columns, as the user would merge it in the editor.
    const merged = before.cells.map((row, r) =>
      r === 0
        ? [
            { ...row[0]!, colSpan: 2 },
            { content: { paragraphs: [] }, merged: true },
          ]
        : row,
    );
    await ok(call('element_update', { elementId: id, patch: { cells: merged } }));

    await ok(
      call('table_set', {
        elementId: id,
        cells: [
          ['title', 'ignored'],
          ['c', 'd'],
          ['e', 'f'],
        ],
      }),
    );
    const table = element<TableElement>(bus.deck, id);
    expect(table.frame).toMatchObject({ w: 600, h: 200 });
    expect(table.rows).toHaveLength(3);
    expect(table.rows.reduce((a, b) => a + b, 0)).toBeCloseTo(200, 5);
    expect(table.cells[0]![0]).toMatchObject({ colSpan: 2 });
    expect(plainText(table.cells[0]![0]!.content)).toBe('title');
    expect(table.cells[0]![1]).toMatchObject({ merged: true, content: { paragraphs: [] } });
    expect(plainText(table.cells[2]![1]!.content)).toBe('f');
  });

  it('chart_set merges options, checks series lengths, and creates a chart', async () => {
    const { call, bus } = setup(allElementsDeck());
    await ok(
      call('chart_set', {
        elementId: 'e_chart',
        series: [{ name: '2027', values: [1, 2, 3, 4] }],
        title: 'Revenue',
        labels: true,
      }),
    );
    const chart = element<ChartElement>(bus.deck, 'e_chart');
    expect(chart.data.categories).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
    expect(chart.options).toMatchObject({ title: 'Revenue', labels: true, legend: { show: true } });

    const short = await failed(
      call('chart_set', { elementId: 'e_chart', series: [{ name: 'x', values: [1] }] }),
    );
    expect(short.message).toMatch(/1 values for 4 categories/);

    const created = await ok(
      call('chart_set', {
        slideId: 's_empty',
        frame: { x: 0, y: 0, w: 800, h: 400 },
        chartType: 'pie',
        categories: ['a', 'b'],
        series: [{ name: 's', values: [1, 2] }],
      }),
    );
    expect(element<ChartElement>(bus.deck, created.elementId as string).chartType).toBe('pie');
  });

  it('animation_set replaces the timeline, or only the steps of some elements', async () => {
    const { call, bus } = setup(allElementsDeck());
    const only = await ok(
      call('animation_set', {
        slideId: 's_all',
        elementIds: ['e_text'],
        steps: [{ elementId: 'e_text', preset: 'fade' }],
      }),
    );
    const timeline = findSlide(bus.deck, 's_all')!.timeline;
    expect(timeline.map((s) => [s.elementId, s.preset])).toEqual([
      ['e_text', 'fade'],
      ['e_group', 'fade'],
    ]);
    expect(timeline[0]).toMatchObject({
      trigger: 'onClick',
      category: 'entrance',
      duration: 500,
      id: (only.stepIds as string[])[0],
    });

    await ok(call('animation_set', { slideId: 's_all', steps: [] }));
    expect(findSlide(bus.deck, 's_all')!.timeline).toEqual([]);
    const stray = await failed(
      call('animation_set', { slideId: 's_all', steps: [{ elementId: 'e_x', preset: 'fade' }] }),
    );
    expect(stray.code).toBe('not_found');
  });

  it('animation_set takes only the presets the runtime can play', async () => {
    const { call, bus } = setup(allElementsDeck());
    const before = findSlide(bus.deck, 's_all')!.timeline;
    const unknown = await failed(
      call('animation_set', {
        slideId: 's_all',
        steps: [{ elementId: 'e_text', preset: 'swoosh' }],
      }),
    );
    expect(unknown.code).toBe('invalid_input');
    expect(unknown.message).toMatch(/Unknown entrance preset "swoosh"\. Use one of: appear, fade,/);
    // A name of another category is not a name of this one.
    const wrongCategory = await failed(
      call('animation_set', {
        slideId: 's_all',
        steps: [{ elementId: 'e_text', category: 'emphasis', preset: 'flyIn' }],
      }),
    );
    expect(wrongCategory.message).toMatch(/Unknown emphasis preset "flyIn"\. Use one of: pulse,/);
    const motion = await failed(
      call('animation_set', {
        slideId: 's_all',
        steps: [{ elementId: 'e_text', category: 'motion', preset: 'path' }],
      }),
    );
    expect(motion.message).toMatch(/Motion paths cannot be played yet/);
    expect(findSlide(bus.deck, 's_all')!.timeline).toBe(before);

    await ok(
      call('animation_set', {
        slideId: 's_all',
        steps: [
          { elementId: 'e_text', preset: 'wipe', direction: 'end' },
          { elementId: 'e_text', category: 'exit', preset: 'flyOut', trigger: 'afterPrevious' },
        ],
      }),
    );
    expect(findSlide(bus.deck, 's_all')!.timeline.map((s) => s.preset)).toEqual(['wipe', 'flyOut']);
  });

  it('animation_set sets the transition into the slide, and checks its type', async () => {
    const { call, bus } = setup(allElementsDeck());
    const timeline = findSlide(bus.deck, 's_all')!.timeline;
    const data = await ok(
      call('animation_set', { slideId: 's_all', transition: { type: 'push', direction: 'up' } }),
    );
    expect(data.stepIds).toEqual([]);
    const slide = findSlide(bus.deck, 's_all')!;
    expect(slide.transition).toEqual({
      type: 'push',
      direction: 'up',
      duration: 600,
      easing: 'ease-in-out',
      advance: { onClick: true },
    });
    // Steps that were not given stay.
    expect(slide.timeline).toBe(timeline);

    const unknown = await failed(
      call('animation_set', { slideId: 's_all', transition: { type: 'morph' } }),
    );
    expect(unknown.code).toBe('invalid_input');
    expect(unknown.message).toMatch(/Unknown transition type "morph"\. Use one of: none, fade,/);

    // Both at once are one undo step.
    await ok(
      call('animation_set', {
        slideId: 's_all',
        steps: [{ elementId: 'e_text', preset: 'rise' }],
        transition: null,
      }),
    );
    expect(findSlide(bus.deck, 's_all')!.transition).toBeUndefined();
    bus.undo();
    expect(findSlide(bus.deck, 's_all')!.transition?.type).toBe('push');
    expect(findSlide(bus.deck, 's_all')!.timeline).toEqual(timeline);

    const nothing = await failed(call('animation_set', { slideId: 's_all' }));
    expect(nothing.message).toMatch(/Nothing to change/);
  });
});

describe('deck tools', () => {
  it('theme_update merges tokens and reports the theme', async () => {
    const { call, bus } = setup(hebrewDeck());
    const data = await ok(call('theme_update', { colors: { primary: '#ff0000' } }));
    expect(data).toMatchObject({ created: [], changed: [], deck: ['theme'] });
    expect(bus.deck.theme.colors).toMatchObject({ primary: '#ff0000', accent: '#f59e0b' });
  });

  it('deck_apply_ops applies all commands or none', async () => {
    const { call, bus } = setup(hebrewDeck());
    const before = bus.deck;
    const bad = await failed(
      call('deck_apply_ops', {
        ops: [
          { type: 'slide.update', slideId: 's_he_hero', patch: { name: 'x' } },
          { type: 'element.remove', slideId: 's_he_hero', elementIds: ['e_gone'] },
        ],
      }),
    );
    expect(bad.code).toBe('not_found');
    expect(bus.deck).toBe(before);

    const data = await ok(
      call('deck_apply_ops', {
        ops: [
          { type: 'slide.update', slideId: 's_he_hero', patch: { name: 'x' } },
          { type: 'element.remove', slideId: 's_he_number', elementIds: ['e_he_number_caption'] },
        ],
      }),
    );
    expect(data).toMatchObject({ changed: ['s_he_hero'], removed: ['e_he_number_caption'] });
    expect(bus.undoStack).toHaveLength(1);
    const unknown = await failed(call('deck_apply_ops', { ops: [{ type: 'slide.explode' }] }));
    expect(unknown.code).toBe('invalid_input');
    const field = await failed(
      call('deck_apply_ops', {
        ops: [
          { type: 'slide.update', slideId: 's_he_hero', patch: { name: 'ok' } },
          { type: 'slide.update', slideId: 's_he_hero', patch: { hidden: 'yes' } },
        ],
      }),
    );
    expect(field.message).toMatch(/ops\[1\]\.patch\.hidden: /);
  });

  it('deck_apply_ops does not take asset.add, and says how a picture gets into the deck', async () => {
    const { call, bus, api } = setup(hebrewDeck());
    const before = bus.deck;
    // What a model sends when it is asked for "the logo from this link": the address as the
    // file. The deck would hold a picture that is never drawn and that no save can pack.
    for (const file of ['https://example.com/logo.png', 'C:\\Users\\me\\logo.png', 'logo.png']) {
      const refused = await failed(
        call('deck_apply_ops', {
          ops: [
            { type: 'slide.update', slideId: 's_he_hero', patch: { name: 'x' } },
            {
              type: 'asset.add',
              asset: {
                id: 'logo',
                file,
                mime: 'image/png',
                kind: 'image',
                bytes: 1,
                origin: 'upload',
              },
            },
            {
              type: 'element.add',
              slideId: 's_he_hero',
              element: createElement.image({
                id: 'e_logo',
                frame: { x: 100, y: 100, w: 300, h: 200 },
                assetId: 'logo',
              }),
            },
          ],
        }),
      );
      expect(refused.code).toBe('invalid_input');
      expect(refused.message).toMatch(/ops\[1\]: asset\.add is not available to you\./);
      expect(refused.message).toMatch(/ask the user to insert it/);
    }
    expect(bus.deck).toBe(before);
    // Nor is it among the commands the tool describes.
    const tool = api.list('deck').find((t) => t.name === 'deck_apply_ops')!;
    expect(JSON.stringify(tool.inputSchema.properties)).not.toMatch(/asset\.add \{/);
  });

  it('deck_apply_ops completes a partial frame from the element as earlier ops left it', async () => {
    const { call, bus } = setup(hebrewDeck());
    const before = element<TextElement>(bus.deck, 'e_he_hero_title').frame;
    await ok(
      call('deck_apply_ops', {
        ops: [
          {
            type: 'element.update',
            slideId: 's_he_hero',
            elementId: 'e_he_hero_title',
            patch: { frame: { x: 100 } },
          },
          {
            type: 'element.update',
            slideId: 's_he_hero',
            elementId: 'e_he_hero_title',
            patch: { frame: { w: 640 } },
          },
        ],
      }),
    );
    expect(element<TextElement>(bus.deck, 'e_he_hero_title').frame).toEqual({
      ...before,
      x: 100,
      w: 640,
    });
    // One step, and undo brings the frame back whole.
    expect(bus.undoStack).toHaveLength(1);
    bus.undo();
    expect(element<TextElement>(bus.deck, 'e_he_hero_title').frame).toEqual(before);
    bus.redo();
    expect(element<TextElement>(bus.deck, 'e_he_hero_title').frame).toMatchObject({ x: 100 });

    // An element added earlier in the same batch is completed from what was added.
    const box = {
      ...element<TextElement>(bus.deck, 'e_he_hero_subtitle'),
      id: 'e_added',
      frame: { x: 10, y: 20, w: 300, h: 80 },
    };
    await ok(
      call('deck_apply_ops', {
        ops: [
          { type: 'element.add', slideId: 's_he_hero', element: box },
          {
            type: 'element.update',
            slideId: 's_he_hero',
            elementId: 'e_added',
            patch: { frame: { y: 500 } },
          },
        ],
      }),
    );
    expect(element<TextElement>(bus.deck, 'e_added').frame).toEqual({
      x: 10,
      y: 500,
      w: 300,
      h: 80,
    });

    // A frame that is not an object is still refused, with the path of the op.
    const bad = await failed(
      call('deck_apply_ops', {
        ops: [
          {
            type: 'element.update',
            slideId: 's_he_hero',
            elementId: 'e_he_hero_title',
            patch: { frame: { x: 'left' } },
          },
        ],
      }),
    );
    expect(bad.code).toBe('invalid_input');
  });
});
