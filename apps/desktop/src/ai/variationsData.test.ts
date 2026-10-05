import {
  CommandBus,
  createDeck,
  createElement,
  createSelectionStore,
  createSlide,
  findElement,
  richText,
  tableFromGrid,
  type ChartElement,
  type Deck,
  type TableElement,
} from '@slidr/model';
import { beforeEach, describe, expect, it } from 'vitest';
import { stagePreview } from '../stage/preview';
import { createGallery, tryOn } from './variations';

/*
 * The options of a chart and of a table (AIO-07, AIO-08): an option is the arguments of
 * `chart_set` or `table_set`. What is shown, what a hover puts on the Stage, and what a pick does
 * to the deck as it is then, as one undo step.
 */

const SALES = {
  categories: ['2024', '2025', '2026'],
  series: [{ name: 'Revenue', values: [120, 180, 260] }],
};

function setup() {
  const deck = createDeck({
    slides: [
      createSlide({
        id: 's_1',
        elements: [
          createElement.chart({
            id: 'e_chart',
            frame: { x: 200, y: 200, w: 1000, h: 600 },
            chartType: 'column',
            data: SALES,
          }),
          tableFromGrid(
            [
              ['Region', 'Revenue'],
              ['North', '120'],
              ['South', '180'],
            ],
            { id: 'e_table', frame: { x: 1250, y: 200, w: 600, h: 300 }, dir: 'ltr' },
          ),
          createElement.text({
            id: 'e_text',
            frame: { x: 200, y: 40, w: 800, h: 100 },
            content: richText('Sales'),
          }),
        ],
      }),
    ],
  });
  const bus = new CommandBus(deck, { validate: true });
  const selection = createSelectionStore(bus);
  const gallery = createGallery({ bus, selection });
  return { bus, gallery, sets: () => gallery.store.getState().sets };
}

const CHART = { slideId: 's_1', elementId: 'e_chart' };
const TABLE = { slideId: 's_1', elementId: 'e_table' };

const chartOf = (deck: Deck) => findElement(deck.slides[0]!, 'e_chart') as ChartElement;
const tableOf = (deck: Deck) => findElement(deck.slides[0]!, 'e_table') as TableElement;

beforeEach(() => stagePreview.setState({ deck: null }));

describe('chart options', () => {
  const types = [
    { label: 'Line: the trend', set: { chartType: 'line' } },
    { label: 'Area: the volume', set: { chartType: 'area', labels: true } },
  ];

  it('are shown as cards, and change nothing', async () => {
    const { bus, gallery, sets } = setup();
    const before = bus.deck;
    await gallery.service.present({
      kind: 'chart',
      target: CHART,
      prompt: 'Two types',
      options: types,
    });
    expect(sets()).toMatchObject([
      {
        kind: 'chart',
        target: CHART,
        prompt: 'Two types',
        cards: [
          { label: 'Line: the trend', state: 'ready', set: { chartType: 'line' } },
          { label: 'Area: the volume', state: 'ready' },
        ],
      },
    ]);
    // A type is told apart by its picture, not by words.
    expect(sets()[0]!.cards.every((card) => card.title === undefined)).toBe(true);
    expect(bus.deck).toBe(before);
    expect(bus.undoStack).toHaveLength(0);
  });

  it('are tried on the Stage without touching the deck', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({ kind: 'chart', target: CHART, options: types });
    const before = bus.deck;
    gallery.preview(sets()[0]!.id, 0);
    expect(chartOf(stagePreview.getState().deck!).chartType).toBe('line');
    expect(chartOf(stagePreview.getState().deck!).data).toEqual(SALES);
    expect(bus.deck).toBe(before);
    gallery.preview(sets()[0]!.id, null);
    expect(stagePreview.getState().deck).toBeNull();
  });

  it('a pick is one undo step that changes what the option names, and nothing else', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({ kind: 'chart', target: CHART, options: types });
    const [set] = sets();

    expect(gallery.pick(set!.id, 1, 'Pick an option')).toBe(true);
    expect(chartOf(bus.deck)).toMatchObject({ chartType: 'area', data: SALES });
    expect(chartOf(bus.deck).options.labels).toBe(true);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]).toMatchObject({ actor: 'user', label: 'Pick an option' });
    expect(sets()[0]!.picked).toEqual({ index: 1, txId: bus.undoStack[0]!.txId });

    expect(bus.undo()).toBe(true);
    expect(chartOf(bus.deck)).toMatchObject({ chartType: 'column' });
    expect(chartOf(bus.deck).options.labels).toBe(false);
    expect(bus.redo()).toBe(true);
    expect(chartOf(bus.deck).chartType).toBe('area');
  });

  it('a pick is made on the chart as it is then: what changed since the offer stays', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({ kind: 'chart', target: CHART, options: types });
    // The user fills in other data and hides the legend, and only then picks a type.
    const edited = { categories: ['Q1', 'Q2'], series: [{ name: 'Units', values: [7, 9] }] };
    bus.dispatch({
      type: 'element.update',
      slideId: 's_1',
      elementId: 'e_chart',
      patch: {
        data: edited,
        options: { ...chartOf(bus.deck).options, legend: { show: false, position: 'top' } },
      },
    });
    gallery.preview(sets()[0]!.id, 0);
    expect(chartOf(stagePreview.getState().deck!).data).toEqual(edited);

    expect(gallery.pick(sets()[0]!.id, 0, 'Pick')).toBe(true);
    expect(chartOf(bus.deck)).toMatchObject({ chartType: 'line', data: edited });
    expect(chartOf(bus.deck).options.legend).toEqual({ show: false, position: 'top' });
  });

  it('titles are cards of words, and a pick writes the title alone', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({
      kind: 'chart',
      target: CHART,
      options: [
        { label: 'The trend', set: { title: 'Revenue doubled in two years' } },
        { label: 'The number', set: { title: 'From 120 to 260' } },
      ],
    });
    expect(sets()[0]!.cards.map((card) => card.title)).toEqual([
      'Revenue doubled in two years',
      'From 120 to 260',
    ]);
    gallery.pick(sets()[0]!.id, 0, 'Pick');
    expect(chartOf(bus.deck).options.title).toBe('Revenue doubled in two years');
    expect(chartOf(bus.deck)).toMatchObject({ chartType: 'column', data: SALES });
    expect(bus.undoStack).toHaveLength(1);
  });

  it('are for the element of the session, whatever id an option names', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({
      kind: 'chart',
      target: CHART,
      options: [
        { label: 'Line', set: { chartType: 'line', elementId: 'e_table', slideId: 's_9' } },
        { label: 'Bar', set: { chartType: 'bar' } },
      ],
    });
    gallery.pick(sets()[0]!.id, 0, 'Pick');
    expect(chartOf(bus.deck).chartType).toBe('line');
  });

  it('say which option the chart cannot take, and need a chart to be for', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({
      kind: 'chart',
      target: CHART,
      options: [
        { label: 'No set' },
        { label: 'Not a type', set: { chartType: 'sunburst' } },
        // One value for three categories.
        { label: 'Short', set: { series: [{ name: 'Revenue', values: [1] }] } },
        { label: 'Pie', set: { chartType: 'pie' } },
      ],
    });
    expect(sets()[0]!.cards.map((card) => card.state)).toEqual([
      'failed',
      'failed',
      'failed',
      'ready',
    ]);
    expect(sets()[0]!.cards[2]!.problem).toMatch(/1 values for 3 categories/);
    expect(gallery.pick(sets()[0]!.id, 1, 'Pick')).toBe(false);
    expect(bus.undoStack).toHaveLength(0);

    await expect(
      gallery.service.present({
        kind: 'chart',
        target: CHART,
        options: [{ label: 'No set' }, { label: 'Not a type', set: { chartType: 'sunburst' } }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_input', message: /No option could be shown/ });
    // The set that could be shown is still the chart's.
    expect(sets()[0]!.cards).toHaveLength(4);

    for (const target of [TABLE, { slideId: 's_1', elementId: 'e_text' }, { slideId: 's_1' }]) {
      await expect(
        gallery.service.present({ kind: 'chart', target, options: types }),
      ).rejects.toMatchObject({ code: 'invalid_state' });
    }
  });

  it('an option that no longer fits the chart is not applied, and the others stay', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({
      kind: 'chart',
      target: CHART,
      options: [
        { label: 'Three', set: { series: [{ name: 'Revenue', values: [1, 2, 3] }] } },
        { label: 'Line', set: { chartType: 'line' } },
      ],
    });
    // The chart has two categories now: three values no longer fit it.
    bus.dispatch({
      type: 'element.update',
      slideId: 's_1',
      elementId: 'e_chart',
      patch: { data: { categories: ['a', 'b'], series: [{ name: 'Revenue', values: [1, 2] }] } },
    });
    const [set] = sets();
    expect(tryOn(set!, set!.cards[0]!, bus.deck)).toBeNull();
    expect(gallery.pick(set!.id, 0, 'Pick')).toBe(false);
    expect(sets()).toHaveLength(1);
    expect(gallery.pick(set!.id, 1, 'Pick')).toBe(true);
    expect(chartOf(bus.deck).chartType).toBe('line');
  });

  it('go with the chart they were for', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({ kind: 'chart', target: CHART, options: types });
    const [set] = sets();
    bus.dispatch({ type: 'element.remove', slideId: 's_1', elementIds: ['e_chart'] });
    gallery.preview(set!.id, 0);
    expect(stagePreview.getState().deck).toBeNull();
    expect(gallery.pick(set!.id, 0, 'Pick')).toBe(false);
    expect(sets()).toEqual([]);
  });
});

describe('table options', () => {
  const looks = [
    { label: 'Lines', set: { styleId: 'lines', bandedRows: false } },
    { label: 'Tinted', set: { styleId: 'tint', bandedRows: true, firstColumn: true } },
  ];

  it('a pick is one undo step that changes the look and keeps the cells', async () => {
    const { bus, gallery, sets } = setup();
    const before = tableOf(bus.deck);
    await gallery.service.present({ kind: 'table', target: TABLE, options: looks });
    expect(sets()[0]).toMatchObject({ kind: 'table', target: TABLE });
    expect(bus.deck.slides[0]!.elements).toContain(before);

    gallery.preview(sets()[0]!.id, 1);
    expect(tableOf(stagePreview.getState().deck!).style).toMatchObject({
      styleId: 'tint',
      bandedRows: true,
      firstColumn: true,
    });
    expect(tableOf(bus.deck)).toBe(before);

    expect(gallery.pick(sets()[0]!.id, 0, 'Pick')).toBe(true);
    const after = tableOf(bus.deck);
    expect(after.style).toMatchObject({ styleId: 'lines', bandedRows: false });
    expect(after.style.headerRow).toBe(before.style.headerRow);
    expect(after.cells).toEqual(before.cells);
    expect(after.frame).toEqual(before.frame);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undo()).toBe(true);
    expect(tableOf(bus.deck).style).toEqual(before.style);
    expect(bus.redo()).toBe(true);
    expect(tableOf(bus.deck).style.styleId).toBe('lines');
  });

  it('a pick is made on the table as it is then: a cell typed since the offer stays', async () => {
    const { bus, gallery, sets } = setup();
    await gallery.service.present({ kind: 'table', target: TABLE, options: looks });
    const typed = tableOf(bus.deck).cells[1]![1]!.content;
    bus.dispatch({
      type: 'text.set',
      slideId: 's_1',
      elementId: 'e_table',
      cell: { row: 1, col: 1 },
      content: { paragraphs: [{ ...typed.paragraphs[0]!, runs: [{ text: '999' }] }] },
    });
    gallery.pick(sets()[0]!.id, 0, 'Pick');
    expect(tableOf(bus.deck).cells[1]![1]!.content.paragraphs[0]!.runs[0]!.text).toBe('999');
    expect(tableOf(bus.deck).style.styleId).toBe('lines');
  });

  it('need a table to be for, and a style the app has', async () => {
    const { gallery, sets } = setup();
    await expect(
      gallery.service.present({ kind: 'table', target: CHART, options: looks }),
    ).rejects.toMatchObject({ code: 'invalid_state' });
    await gallery.service.present({
      kind: 'table',
      target: TABLE,
      options: [{ label: 'Fancy', set: { styleId: 'fancy' } }, looks[0]!],
    });
    expect(sets()[0]!.cards.map((card) => card.state)).toEqual(['failed', 'ready']);
  });
});
