// @vitest-environment happy-dom
import {
  CommandBus,
  createDeck,
  createElement,
  createSelectionStore,
  createSlide,
  type ChartElement,
  type ChartType,
  type Deck,
  type Element,
} from '@slidr/model';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addColumn,
  addRow,
  canRemove,
  copiedCells,
  cutCell,
  editCell,
  pasteInGrid,
  pasteOnChart,
  removeColumn,
  removeRow,
  setType,
} from './actions';
import { chartGrid, type ChartData, type ChartPatch } from './data';
import { chartFrame, insertChart, sampleData } from './insert';
import './messages';
import {
  axisControls,
  coloredParts,
  hasOwnColors,
  resetColors,
  setAxis,
  setColor,
  setLabels,
  setLegend,
  setTitle,
} from './options';
import { chartSession, closeData, moveTo, openData } from './session';
import { chartTarget, type ChartEditor } from './target';

/*
 * Every action of the chart area on a real bus that validates the deck after each change: it is
 * exactly one undo step, undo gives the deck back as it was, and redo the change.
 */

const SALES: ChartData = {
  categories: ['Q1', 'Q2', 'Q3'],
  series: [
    { name: 'Apples', values: [10, 20, 30] },
    { name: 'Pears', values: [1, null, 3] },
  ],
};

interface TestEditor extends ChartEditor {
  bus: CommandBus;
}

function editorWith(elements: Element[], lang = 'en'): TestEditor {
  const deck = createDeck({ lang, slides: [createSlide({ id: 's_one', elements })] });
  const bus = new CommandBus(deck, { validate: true });
  return { bus, selection: createSelectionStore(bus) };
}

function chartOf(chartType: ChartType = 'column', data: ChartData = SALES): ChartElement {
  return createElement.chart({
    id: 'e_chart',
    frame: { x: 410, y: 230, w: 1100, h: 620 },
    chartType,
    data,
  });
}

/** An editor with one chart, selected. */
function withChart(chartType: ChartType = 'column', data: ChartData = SALES): TestEditor {
  const editor = editorWith([chartOf(chartType, data)]);
  editor.selection.getState().selectElements(['e_chart']);
  return editor;
}

const theChart = (editor: TestEditor): ChartElement => {
  const element = editor.bus.deck.slides[0]?.elements.find((e) => e.id === 'e_chart');
  if (element?.type !== 'chart') throw new Error('The chart is gone');
  return element;
};

/**
 * Runs an action that must be exactly one undo step, and checks that undo gives the deck back
 * and redo brings the change again. Returns the chart as the action left it.
 */
function oneStep(editor: TestEditor, action: () => unknown): ChartElement {
  const { bus } = editor;
  const before: Deck = bus.deck;
  const steps = bus.undoStack.length;
  action();
  expect(bus.undoStack.length, 'undo steps').toBe(steps + 1);
  const after = bus.deck;
  expect(after).not.toEqual(before);
  expect(bus.undoStack.at(-1)?.commands).toEqual(['element.update']);
  expect(bus.undo()).toBe(true);
  expect(bus.deck).toEqual(before);
  expect(bus.undoStack.length).toBe(steps);
  expect(bus.redo()).toBe(true);
  expect(bus.deck).toEqual(after);
  return theChart(editor);
}

/** Writes an option of the selected chart through its target, as a tool of row B does. */
function write(editor: TestEditor, patch: (chart: ChartElement) => ChartPatch | undefined) {
  const target = chartTarget(editor);
  if (!target) throw new Error('No chart is selected');
  return target.write(patch(target.chart), { label: 'test' });
}

beforeEach(() => {
  closeData();
});

describe('inserting a chart', () => {
  it('adds a chart of the type in the middle of the slide, selected, as one undo step', () => {
    const editor = editorWith([]);
    const chart = insertChart(editor, 'line');
    expect(chart).toBeDefined();
    const { bus, selection } = editor;
    expect(bus.deck.slides[0]?.elements).toEqual([chart]);
    expect(chart?.chartType).toBe('line');
    expect(chart?.frame).toEqual({ x: 410, y: 230, w: 1100, h: 620 });
    expect(chart?.frame).toEqual(chartFrame(bus.deck));
    expect(selection.getState().selectedElementIds).toEqual([chart?.id]);
    expect(bus.undoStack).toHaveLength(1);
    expect(bus.undoStack[0]?.commands).toEqual(['element.add']);
    expect(bus.undoStack[0]?.label).toBe('הוספת גרף');
    bus.undo();
    expect(bus.deck.slides[0]?.elements).toEqual([]);
    expect(selection.getState().selectedElementIds).toEqual([]);
    bus.redo();
    expect(bus.deck.slides[0]?.elements).toEqual([chart]);
  });

  it('steps aside when another element sits exactly there', () => {
    const editor = editorWith([]);
    const first = insertChart(editor, 'column');
    const second = insertChart(editor, 'pie');
    const third = insertChart(editor, 'bar');
    expect(second?.frame).toMatchObject({ x: first!.frame.x + 32, y: first!.frame.y + 32 });
    expect(third?.frame).toMatchObject({ x: first!.frame.x + 64, y: first!.frame.y + 64 });
  });

  it('does nothing without a slide to put it on', () => {
    const bus = new CommandBus(createDeck({ slides: [] }), { validate: true });
    expect(insertChart({ bus, selection: createSelectionStore(bus) }, 'column')).toBeUndefined();
    expect(bus.undoStack).toHaveLength(0);
  });

  it('labels the sample data in the language of the deck, whatever the UI is in', () => {
    const hebrew = insertChart(editorWith([], 'he'), 'column');
    expect(hebrew?.data.categories).toEqual(['קטגוריה 1', 'קטגוריה 2', 'קטגוריה 3', 'קטגוריה 4']);
    expect(hebrew?.data.series.map((s) => s.name)).toEqual(['סדרה 1', 'סדרה 2']);
    const english = insertChart(editorWith([], 'en-GB'), 'column');
    expect(english?.data.categories).toEqual([
      'Category 1',
      'Category 2',
      'Category 3',
      'Category 4',
    ]);
    expect(english?.data.series.map((s) => s.name)).toEqual(['Series 1', 'Series 2']);
    // A language the app has no strings in gets the English labels, and no error.
    expect(sampleData('column', 'fr').series[0]?.name).toBe('Series 1');
  });

  it('gives every type sample data that suits it', () => {
    for (const type of [
      'column',
      'bar',
      'line',
      'area',
      'pie',
      'donut',
      'scatter',
      'radar',
    ] as const) {
      const data = sampleData(type, 'he');
      expect(data.categories.length, type).toBeGreaterThan(2);
      expect(data.series.length, type).toBeGreaterThan(0);
      for (const series of data.series) {
        expect(series.values).toHaveLength(data.categories.length);
        expect(series.values.every((value) => typeof value === 'number')).toBe(true);
      }
    }
    // A pie shows one series; the x values of a scatter chart are numbers.
    expect(sampleData('pie', 'he').series).toHaveLength(1);
    expect(sampleData('scatter', 'he').categories.every((x) => Number.isFinite(Number(x)))).toBe(
      true,
    );
  });
});

describe('the target of the chart tools', () => {
  it('is the one selected chart', () => {
    const shape = createElement.shape({ id: 'e_shape', frame: { x: 0, y: 0, w: 100, h: 100 } });
    const editor = editorWith([chartOf(), shape]);
    const { selectElements, clearSelection } = editor.selection.getState();
    expect(chartTarget(editor)).toBeUndefined();
    selectElements(['e_shape']);
    expect(chartTarget(editor)).toBeUndefined();
    selectElements(['e_chart', 'e_shape']);
    expect(chartTarget(editor)).toBeUndefined();
    selectElements(['e_chart']);
    expect(chartTarget(editor)?.chart.id).toBe('e_chart');
    clearSelection();
    expect(chartTarget(editor)).toBeUndefined();
  });

  it('finds a chart inside a group', () => {
    const group = createElement.group({
      id: 'e_group',
      frame: { x: 100, y: 100, w: 1200, h: 700 },
      children: [chartOf()],
    });
    const editor = editorWith([group]);
    editor.selection.getState().selectElements(['e_chart']);
    const target = chartTarget(editor);
    expect(target?.chart.id).toBe('e_chart');
    expect(target?.write(setLabels(target.chart, true), { label: 'test' })).toBe(true);
    const inside = editor.bus.deck.slides[0]?.elements[0];
    expect(inside?.type === 'group' && inside.children[0]).toMatchObject({
      options: { labels: true },
    });
  });

  it('writes nothing for a change that changes nothing', () => {
    const editor = withChart();
    expect(write(editor, (chart) => setLabels(chart, false))).toBe(false);
    expect(write(editor, (chart) => setTitle(chart, '  '))).toBe(false);
    expect(editor.bus.undoStack).toHaveLength(0);
  });
});

describe('editing the data', () => {
  const at = { slideId: 's_one', elementId: 'e_chart' };

  it('sets a cell as one undo step', () => {
    const editor = withChart();
    const chart = oneStep(editor, () => {
      expect(editCell(editor.bus, at, { row: 1, col: 2 }, '1,5')).toBe('done');
    });
    expect(chart.data.series[1]?.values).toEqual([1.5, null, 3]);
    expect(editor.bus.undoStack.at(-1)?.label).toBe('עריכת נתונים');
    oneStep(editor, () => editCell(editor.bus, at, { row: 0, col: 1 }, 'תפוחים'));
    oneStep(editor, () => editCell(editor.bus, at, { row: 2, col: 0 }, 'רבעון 2'));
    expect(chartGrid(theChart(editor))).toEqual([
      ['', 'תפוחים', 'Pears'],
      ['Q1', '10', '1.5'],
      ['רבעון 2', '20', ''],
      ['Q3', '30', '3'],
    ]);
  });

  it('keeps the value of a cell that is given text, and leaves no step', () => {
    const editor = withChart();
    expect(editCell(editor.bus, at, { row: 1, col: 1 }, 'ten')).toBe('invalid');
    expect(editor.bus.undoStack).toHaveLength(0);
    expect(theChart(editor).data).toEqual(SALES);
    // The same text again is not a change either.
    expect(editCell(editor.bus, at, { row: 1, col: 1 }, '10')).toBe('done');
    expect(editor.bus.undoStack).toHaveLength(0);
  });

  it('writes a cell of a chart that is no longer the selection', () => {
    const editor = withChart();
    editor.selection.getState().clearSelection();
    oneStep(editor, () => editCell(editor.bus, at, { row: 1, col: 1 }, '11'));
    // A chart that is gone takes nothing, and nothing breaks.
    editor.bus.dispatch({ type: 'element.remove', slideId: 's_one', elementIds: ['e_chart'] });
    expect(editCell(editor.bus, at, { row: 1, col: 1 }, '12')).toBe('done');
  });

  it('pastes a grid from the cell the keyboard is on, as one undo step', () => {
    const editor = withChart();
    openData('e_chart');
    moveTo({ row: 2, col: 1 });
    const chart = oneStep(editor, () => {
      expect(
        pasteInGrid(editor, [
          ['200', '2'],
          ['300', '3'],
          ['400', '4'],
        ]),
      ).toBe(true);
    });
    expect(chartGrid(chart)).toEqual([
      ['', 'Apples', 'Pears'],
      ['Q1', '10', '1'],
      ['Q2', '200', '2'],
      ['Q3', '300', '3'],
      ['', '400', '4'],
    ]);
    expect(editor.bus.undoStack.at(-1)?.label).toBe('הדבקת נתונים');
  });

  it('pasted at the corner, a grid is the whole data', () => {
    const editor = withChart();
    openData('e_chart');
    expect(chartSession.getState().cell).toEqual({ row: 0, col: 0 });
    const chart = oneStep(editor, () =>
      pasteInGrid(editor, [
        ['', '2025'],
        ['North', '5'],
      ]),
    );
    expect(chart.data).toEqual({ categories: ['North'], series: [{ name: '2025', values: [5] }] });
  });

  it('one pasted text is as if it was typed in the cell', () => {
    const editor = withChart();
    openData('e_chart');
    moveTo({ row: 2, col: 2 });
    const chart = oneStep(editor, () => expect(pasteInGrid(editor, [['1,5']])).toBe(true));
    expect(chart.data.series[1]?.values).toEqual([1, 1.5, 3]);
    // Text on a value cell leaves the value; a grid with text in it would make a gap of it.
    const steps = editor.bus.undoStack.length;
    expect(pasteInGrid(editor, [['n/a']])).toBe(false);
    expect(theChart(editor).data.series[1]?.values).toEqual([1, 1.5, 3]);
    // At the corner one text is not the whole data of a chart: nothing changes.
    moveTo({ row: 0, col: 0 });
    expect(pasteInGrid(editor, [['Title']])).toBe(false);
    expect(editor.bus.undoStack.length).toBe(steps);
  });

  it('names a series that a paste adds in the language of the deck', () => {
    const editor = editorWith([chartOf()], 'he');
    editor.selection.getState().selectElements(['e_chart']);
    openData('e_chart');
    moveTo({ row: 1, col: 2 });
    const chart = oneStep(editor, () => pasteInGrid(editor, [['7', '8']]));
    expect(chart.data.series.map((s) => s.name)).toEqual(['Apples', 'Pears', 'סדרה 3']);
    expect(chart.data.series[2]?.values).toEqual([8, null, null]);
  });

  it('keeps the cell of the session inside a grid that an undo made smaller', () => {
    const editor = withChart();
    openData('e_chart');
    moveTo({ row: 9, col: 9 });
    oneStep(editor, () => pasteInGrid(editor, [['99']]));
    // The last cell of the grid, not a cell far outside it.
    expect(theChart(editor).data.series[1]?.values).toEqual([1, null, 99]);
  });

  it('a grid pasted on the selected chart replaces its data, as one undo step', () => {
    const editor = withChart('pie');
    const chart = oneStep(editor, () => {
      expect(
        pasteOnChart(editor, [
          ['מוצר', 'Q1', 'Q2'],
          ['תפוחים', '1,200', '1,350'],
          ['אגסים', '980', '1,040'],
        ]),
      ).toBe(true);
    });
    expect(chart.chartType).toBe('pie');
    expect(chart.data).toEqual({
      categories: ['תפוחים', 'אגסים'],
      series: [
        { name: 'Q1', values: [1200, 980] },
        { name: 'Q2', values: [1350, 1040] },
      ],
    });
  });

  it('pastes nothing without a selected chart', () => {
    const editor = editorWith([chartOf()]);
    expect(pasteOnChart(editor, [['a', 'b']])).toBe(false);
    expect(pasteInGrid(editor, [['1']])).toBe(false);
    expect(editor.bus.undoStack).toHaveLength(0);
  });

  it('adds a row under the cell and a column after it, and moves the keyboard there', () => {
    const editor = withChart();
    openData('e_chart');
    moveTo({ row: 1, col: 1 });
    let chart = oneStep(editor, () => expect(addRow(editor)).toBe(true));
    expect(chart.data.categories).toEqual(['Q1', '', 'Q2', 'Q3']);
    expect(chartSession.getState().cell).toEqual({ row: 2, col: 1 });
    expect(editor.bus.undoStack.at(-1)?.label).toBe('הוספת שורה');

    chart = oneStep(editor, () => expect(addColumn(editor)).toBe(true));
    expect(chart.data.series.map((s) => s.name)).toEqual(['Apples', 'Series 3', 'Pears']);
    expect(chart.data.series[1]?.values).toEqual([null, null, null, null]);
    expect(chartSession.getState().cell).toEqual({ row: 2, col: 2 });
  });

  it('from the corner, adds the first row and the first column', () => {
    const editor = withChart();
    openData('e_chart');
    oneStep(editor, () => addRow(editor));
    expect(theChart(editor).data.categories).toEqual(['', 'Q1', 'Q2', 'Q3']);
    moveTo({ row: 0, col: 0 });
    oneStep(editor, () => addColumn(editor));
    expect(theChart(editor).data.series.map((s) => s.name)).toEqual([
      'Series 3',
      'Apples',
      'Pears',
    ]);
  });

  it('gives a row added to a scatter chart the next x, so the points do not jump', () => {
    const editor = withChart('scatter', {
      categories: ['1', '2.5', '4'],
      series: [{ name: 'y', values: [10, 20, 30] }],
    });
    openData('e_chart');
    moveTo({ row: 3, col: 1 });
    const chart = oneStep(editor, () => addRow(editor));
    expect(chart.data.categories).toEqual(['1', '2.5', '4', '5']);
    expect(chart.data.series[0]?.values).toEqual([10, 20, 30, null]);
  });

  it('removes the row and the column of the cell, but never the last of them', () => {
    const editor = withChart();
    openData('e_chart');
    moveTo({ row: 3, col: 2 });
    let chart = oneStep(editor, () => expect(removeRow(editor)).toBe(true));
    expect(chart.data.categories).toEqual(['Q1', 'Q2']);
    // The keyboard is on the row that is now the last.
    expect(chartSession.getState().cell).toEqual({ row: 2, col: 2 });
    chart = oneStep(editor, () => expect(removeColumn(editor)).toBe(true));
    expect(chart.data.series.map((s) => s.name)).toEqual(['Apples']);
    expect(chartSession.getState().cell).toEqual({ row: 2, col: 1 });

    const steps = editor.bus.undoStack.length;
    expect(removeColumn(editor)).toBe(false);
    oneStep(editor, () => removeRow(editor));
    expect(removeRow(editor)).toBe(false);
    expect(editor.bus.undoStack.length).toBe(steps + 1);
    expect(canRemove(chartGrid(theChart(editor)), { row: 1, col: 1 })).toEqual({
      row: false,
      column: false,
    });
    // The header row and the column of the categories are not data to remove.
    expect(canRemove(chartGrid(chartOf()), { row: 0, col: 1 })).toEqual({
      row: false,
      column: true,
    });
    expect(canRemove(chartGrid(chartOf()), { row: 1, col: 0 })).toEqual({
      row: true,
      column: false,
    });
  });

  it('copies the cell, or the whole grid at the corner; a cut empties the cell', () => {
    const editor = withChart();
    openData('e_chart');
    expect(copiedCells(editor)).toEqual(chartGrid(chartOf()));
    moveTo({ row: 3, col: 1 });
    expect(copiedCells(editor)).toEqual([['30']]);
    const chart = oneStep(editor, () => expect(cutCell(editor)).toBe(true));
    expect(chart.data.series[0]?.values).toEqual([10, 20, null]);
    expect(editor.bus.undoStack.at(-1)?.label).toBe('גזירה');
    // An empty cell has nothing to cut.
    expect(cutCell(editor)).toBe(false);
  });
});

describe('the type', () => {
  it('changes as one undo step, and the data stays', () => {
    const editor = withChart();
    for (const type of [
      'bar',
      'line',
      'area',
      'pie',
      'donut',
      'scatter',
      'radar',
      'column',
    ] as const) {
      const chart = oneStep(editor, () => expect(setType(editor, type)).toBe(true));
      expect(chart.chartType).toBe(type);
      expect(chart.data).toEqual(SALES);
    }
    expect(setType(editor, 'column')).toBe(false);
    expect(editor.bus.undoStack.at(-1)?.label).toBe('סוג הגרף');
  });

  it('out of a scatter chart with points, the type and the data change in the same step', () => {
    const editor = withChart('scatter', {
      categories: [],
      series: [
        {
          name: 'A',
          values: [],
          points: [
            { x: 1, y: 10 },
            { x: 2, y: 20 },
          ],
        },
      ],
    });
    const chart = oneStep(editor, () => setType(editor, 'column'));
    expect(chart.chartType).toBe('column');
    expect(chart.data).toEqual({
      categories: ['1', '2'],
      series: [{ name: 'A', values: [10, 20] }],
    });
  });
});

describe('the options', () => {
  it('title: set, changed, and removed when empty', () => {
    const editor = withChart();
    let chart = oneStep(editor, () => write(editor, (c) => setTitle(c, '  מכירות 2026 ')));
    expect(chart.options.title).toBe('מכירות 2026');
    chart = oneStep(editor, () => write(editor, (c) => setTitle(c, 'Sales')));
    expect(chart.options.title).toBe('Sales');
    chart = oneStep(editor, () => write(editor, (c) => setTitle(c, '')));
    expect(chart.options).not.toHaveProperty('title');
  });

  it('a title typed letter by letter in one gesture is one undo step', () => {
    const editor = withChart();
    const before = editor.bus.deck;
    for (const text of ['S', 'Sa', 'Sal', 'Sale', 'Sales']) {
      const target = chartTarget(editor)!;
      target.write(setTitle(target.chart, text), { txId: 'tx_typing', label: 'title' });
    }
    expect(editor.bus.undoStack).toHaveLength(1);
    expect(theChart(editor).options.title).toBe('Sales');
    editor.bus.undo();
    expect(editor.bus.deck).toEqual(before);
  });

  it('legend: shown or hidden, and on each side', () => {
    const editor = withChart();
    let chart = oneStep(editor, () => write(editor, (c) => setLegend(c, { show: false })));
    expect(chart.options.legend).toEqual({ show: false, position: 'bottom' });
    for (const position of ['top', 'start', 'end', 'bottom'] as const) {
      chart = oneStep(editor, () => write(editor, (c) => setLegend(c, { position })));
      expect(chart.options.legend).toEqual({ show: false, position });
    }
    expect(write(editor, (c) => setLegend(c, { position: 'bottom' }))).toBe(false);
  });

  it('axes: shown, named, grid lines, minimum and maximum, each one undo step', () => {
    const editor = withChart();
    let chart = oneStep(editor, () => write(editor, (c) => setAxis(c, 'x', { show: false })));
    expect(chart.options.axes.x).toEqual({ show: false });
    expect(chart.options.axes.y).toEqual({ show: true });
    chart = oneStep(editor, () => write(editor, (c) => setAxis(c, 'x', { title: ' רבעון ' })));
    expect(chart.options.axes.x).toEqual({ show: false, title: 'רבעון' });
    chart = oneStep(editor, () => write(editor, (c) => setAxis(c, 'x', { gridLines: true })));
    expect(chart.options.axes.x.gridLines).toBe(true);
    chart = oneStep(editor, () => write(editor, (c) => setAxis(c, 'y', { gridLines: false })));
    expect(chart.options.axes.y).toEqual({ show: true, gridLines: false });
    oneStep(editor, () => write(editor, (c) => setAxis(c, 'y', { min: -10 })));
    chart = oneStep(editor, () => write(editor, (c) => setAxis(c, 'y', { max: 250.5 })));
    expect(chart.options.axes.y).toEqual({ show: true, gridLines: false, min: -10, max: 250.5 });
    // A minimum of zero is a minimum.
    chart = oneStep(editor, () => write(editor, (c) => setAxis(c, 'y', { min: 0 })));
    expect(chart.options.axes.y.min).toBe(0);
    // Back to automatic, and to no title: the fields go.
    oneStep(editor, () => write(editor, (c) => setAxis(c, 'y', { min: null })));
    oneStep(editor, () => write(editor, (c) => setAxis(c, 'y', { max: null })));
    chart = oneStep(editor, () => write(editor, (c) => setAxis(c, 'x', { title: '' })));
    expect(chart.options.axes).toEqual({
      x: { show: false, gridLines: true },
      y: { show: true, gridLines: false },
    });
    expect(write(editor, (c) => setAxis(c, 'y', { max: null }))).toBe(false);
  });

  it('offers for each type the axes the renderer draws', () => {
    expect(axisControls('pie')).toEqual({});
    expect(axisControls('donut')).toEqual({});
    expect(Object.keys(axisControls('radar'))).toEqual(['y']);
    expect(axisControls('radar').y).toMatchObject({ look: false, range: true });
    for (const type of ['column', 'bar', 'line', 'area'] as const) {
      const { x, y } = axisControls(type);
      expect(x).toMatchObject({ kind: 'category', look: true, range: false, gridByDefault: false });
      expect(y).toMatchObject({ kind: 'value', look: true, range: true, gridByDefault: true });
    }
    const scatter = axisControls('scatter');
    expect(scatter.x).toMatchObject({ kind: 'x', range: true, gridByDefault: true });
    expect(scatter.y).toMatchObject({ kind: 'y', range: true, gridByDefault: true });
  });

  it('value labels: on and off', () => {
    const editor = withChart();
    expect(oneStep(editor, () => write(editor, (c) => setLabels(c, true))).options.labels).toBe(
      true,
    );
    expect(oneStep(editor, () => write(editor, (c) => setLabels(c, false))).options.labels).toBe(
      false,
    );
  });

  it('colours: a colour for a series, and back to the theme', () => {
    const editor = withChart();
    const { theme } = editor.bus.deck;
    expect(coloredParts(theChart(editor), theme)).toEqual([
      { name: 'Apples', color: { value: theme.colors.chart[0] } },
      { name: 'Pears', color: { value: theme.colors.chart[1] } },
    ]);
    expect(hasOwnColors(theChart(editor))).toBe(false);
    expect(write(editor, (c) => resetColors(c))).toBe(false);

    let chart = oneStep(editor, () =>
      write(editor, (c) => setColor(c, theme, 1, { token: 'accent' })),
    );
    expect(chart.data.series[1]?.color).toEqual({ token: 'accent' });
    expect(chart.data.series[0]).not.toHaveProperty('color');
    expect(chart.options).not.toHaveProperty('palette');
    expect(coloredParts(chart, theme)[1]?.color).toEqual({ token: 'accent' });
    expect(hasOwnColors(chart)).toBe(true);

    chart = oneStep(editor, () => write(editor, (c) => resetColors(c)));
    expect(chart.data).toEqual(SALES);
    expect(hasOwnColors(chart)).toBe(false);
  });

  it('colours: a drag in the picker is one undo step', () => {
    const editor = withChart();
    const { theme } = editor.bus.deck;
    const before = editor.bus.deck;
    for (const value of ['#100000', '#200000', '#300000']) {
      const target = chartTarget(editor)!;
      target.write(setColor(target.chart, theme, 0, { value }), { txId: 'tx_drag', label: 'c' });
    }
    expect(editor.bus.undoStack).toHaveLength(1);
    expect(theChart(editor).data.series[0]?.color).toEqual({ value: '#300000' });
    editor.bus.undo();
    expect(editor.bus.deck).toEqual(before);
  });

  it('colours: a pie colours its slices, through the palette of the chart', () => {
    const editor = withChart('pie');
    const { theme } = editor.bus.deck;
    expect(coloredParts(theChart(editor), theme).map((part) => part.name)).toEqual([
      'Q1',
      'Q2',
      'Q3',
    ]);
    let chart = oneStep(editor, () =>
      write(editor, (c) => setColor(c, theme, 1, { value: '#ff00aa' })),
    );
    // A colour for every slice: the theme's, as they are now, and the one that was picked.
    expect(chart.options.palette).toHaveLength(theme.colors.chart.length);
    expect(chart.options.palette?.[0]).toEqual({ value: theme.colors.chart[0] });
    expect(chart.options.palette?.[1]).toEqual({ value: '#ff00aa' });
    expect(chart.data).toEqual(SALES);
    expect(coloredParts(chart, theme)[1]?.color).toEqual({ value: '#ff00aa' });

    chart = oneStep(editor, () => write(editor, (c) => resetColors(c)));
    expect(chart.options).not.toHaveProperty('palette');
  });

  it('colours: a slice past the end of the palette makes the palette longer', () => {
    const many = Array.from({ length: 9 }, (_, i) => `c${i + 1}`);
    const editor = withChart('donut', {
      categories: many,
      series: [{ name: 's', values: many.map((_, i) => i + 1) }],
    });
    const { theme } = editor.bus.deck;
    const chart = oneStep(editor, () =>
      write(editor, (c) => setColor(c, theme, 8, { token: 'primary' })),
    );
    expect(chart.options.palette).toHaveLength(9);
    expect(chart.options.palette?.[8]).toEqual({ token: 'primary' });
    // The slices before it keep the colours they had: the theme's, cycled.
    expect(chart.options.palette?.[6]).toEqual({ value: theme.colors.chart[0] });
  });
});
