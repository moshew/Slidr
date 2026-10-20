import { ChartElement, createElement, type ChartType } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import {
  changeType,
  chartGrid,
  deleteColumn,
  deleteRow,
  gridData,
  insertColumn,
  insertRow,
  isValidCell,
  parseNumber,
  pasteCells,
  replaceData,
  setCell,
  type ChartData,
  type ChartPatch,
} from './data';

const FRAME = { x: 100, y: 100, w: 1100, h: 620 };
const names = (n: number) => `Series ${n}`;

/** Frozen all the way down, like everything in a deck that a bus holds. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function chart(data: ChartData, chartType: ChartType = 'column', extra = {}): ChartElement {
  return deepFreeze(
    createElement.chart({ id: 'e_chart', frame: FRAME, chartType, data, ...extra }),
  );
}

const SALES: ChartData = {
  categories: ['Q1', 'Q2', 'Q3'],
  series: [
    { name: 'Apples', values: [10, 20, 30], color: { token: 'accent' } },
    { name: 'Pears', values: [1, null, 3] },
  ],
};

/** The chart after a patch: still a valid chart element. */
function applied(before: ChartElement, patch: ChartPatch | undefined): ChartElement {
  expect(patch).toBeDefined();
  const next = { ...before, ...patch };
  expect(ChartElement.parse(next)).toEqual(next);
  return deepFreeze(next);
}

describe('parseNumber', () => {
  it('reads nothing as nothing', () => {
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('   ')).toBeNull();
    expect(parseNumber(String.fromCodePoint(0xa0))).toBeNull();
  });

  it('reads plain numbers', () => {
    expect(parseNumber('0')).toBe(0);
    expect(parseNumber('42')).toBe(42);
    expect(parseNumber('3.14')).toBe(3.14);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('5.')).toBe(5);
    expect(parseNumber(' 12 ')).toBe(12);
    expect(parseNumber('007')).toBe(7);
    expect(parseNumber('1e3')).toBe(1000);
    expect(parseNumber('2.5E-2')).toBe(0.025);
  });

  it('reads signs: a minus before or after, a plus, the typographic minus, brackets', () => {
    expect(parseNumber('-5')).toBe(-5);
    expect(parseNumber('+5')).toBe(5);
    expect(parseNumber('5-')).toBe(-5);
    expect(parseNumber(`${String.fromCodePoint(0x2212)}5`)).toBe(-5);
    expect(parseNumber(`${String.fromCodePoint(0x2013)}7.5`)).toBe(-7.5);
    expect(parseNumber('(5)')).toBe(-5);
    expect(parseNumber('(1,234.50)')).toBe(-1234.5);
    // Zero has no sign.
    expect(Object.is(parseNumber('-0'), 0)).toBe(true);
    expect(Object.is(parseNumber('(0)'), 0)).toBe(true);
  });

  it('reads a comma as thousands where it can be', () => {
    expect(parseNumber('1,234')).toBe(1234);
    expect(parseNumber('12,345,678')).toBe(12345678);
    expect(parseNumber('1,234.5')).toBe(1234.5);
    expect(parseNumber('-1,234.5')).toBe(-1234.5);
    expect(parseNumber('999,999')).toBe(999999);
  });

  it('reads a comma as the decimal sign only where it cannot be thousands', () => {
    expect(parseNumber('1,5')).toBe(1.5);
    expect(parseNumber('0,25')).toBe(0.25);
    expect(parseNumber('12,34')).toBe(12.34);
    expect(parseNumber('1234,567')).toBe(1234.567);
    // A group of thousands does not start with a zero.
    expect(parseNumber('0,123')).toBe(0.123);
    expect(parseNumber('-3,75')).toBe(-3.75);
  });

  it('reads the European way: dots for thousands, a comma for decimals', () => {
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('1.234.567')).toBe(1234567);
    expect(parseNumber('12.345.678,9')).toBe(12345678.9);
    // One dot is a decimal point.
    expect(parseNumber('1.234')).toBe(1.234);
  });

  it('drops what says nothing: percent, currency, spaces, direction marks', () => {
    expect(parseNumber('12%')).toBe(12);
    expect(parseNumber('12.5 %')).toBe(12.5);
    expect(parseNumber('%12')).toBe(12);
    expect(parseNumber('-4%')).toBe(-4);
    expect(parseNumber('$1,200')).toBe(1200);
    expect(parseNumber('1,200 ₪')).toBe(1200);
    expect(parseNumber('€ 3,5')).toBe(3.5);
    expect(parseNumber('-$5')).toBe(-5);
    expect(parseNumber('$-5')).toBe(-5);
    expect(parseNumber('($5.50)')).toBe(-5.5);
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber(`1${String.fromCodePoint(0xa0)}234`)).toBe(1234);
    expect(parseNumber(`1${String.fromCodePoint(0x202f)}234,5`)).toBe(1234.5);
    // Right-to-left and left-to-right marks around a number copied from Hebrew text.
    const rlm = String.fromCodePoint(0x200f);
    const lrm = String.fromCodePoint(0x200e);
    expect(parseNumber(`${rlm}-17${lrm}`)).toBe(-17);
  });

  it('gives null for anything else', () => {
    for (const text of [
      'abc',
      '12abc',
      'Q1',
      '1,2,3',
      '1,23,456',
      '1.2.3',
      '1,234,56',
      '12,3456.7',
      '--5',
      '-5-',
      '(-5)',
      '5 - 3',
      '1/2',
      '-',
      '%',
      '$',
      '.',
      ',',
      'NaN',
      'Infinity',
      '1e999',
      '0x10',
      '١٢',
    ]) {
      expect(parseNumber(text), text).toBeNull();
    }
  });
});

describe('isValidCell', () => {
  it('takes any text for a name or a category, and numbers or nothing for a value', () => {
    expect(isValidCell({ row: 0, col: 2 }, 'anything')).toBe(true);
    expect(isValidCell({ row: 3, col: 0 }, 'anything')).toBe(true);
    expect(isValidCell({ row: 1, col: 1 }, '1,5')).toBe(true);
    expect(isValidCell({ row: 1, col: 1 }, '  ')).toBe(true);
    expect(isValidCell({ row: 1, col: 1 }, 'n/a')).toBe(false);
  });
});

describe('chartGrid', () => {
  it('puts the series names in the first row and the categories in the first column', () => {
    expect(chartGrid(chart(SALES))).toEqual([
      ['', 'Apples', 'Pears'],
      ['Q1', '10', '1'],
      ['Q2', '20', ''],
      ['Q3', '30', '3'],
    ]);
  });

  it('shows numbers as they are, without grouping', () => {
    const grid = chartGrid(
      chart({ categories: ['a'], series: [{ name: 's', values: [1234567.25] }] }),
    );
    expect(grid[1]).toEqual(['a', '1234567.25']);
  });

  it('has a row for every value, also past the categories, and a cell for every row', () => {
    const ragged = chart({
      categories: ['a'],
      series: [
        { name: 's', values: [1, 2, 3] },
        { name: 't', values: [] },
      ],
    });
    expect(chartGrid(ragged)).toEqual([
      ['', 's', 't'],
      ['a', '1', ''],
      ['', '2', ''],
      ['', '3', ''],
    ]);
  });

  it('holds the x values of a scatter chart in the first column', () => {
    const scatter = chart(
      { categories: ['1', '2.5'], series: [{ name: 's', values: [10, 20] }] },
      'scatter',
    );
    expect(chartGrid(scatter)).toEqual([
      ['', 's'],
      ['1', '10'],
      ['2.5', '20'],
    ]);
  });

  it('builds the rows of a scatter chart from the points of its series', () => {
    const scatter = chart(
      {
        categories: [],
        series: [
          {
            name: 'A',
            values: [],
            points: [
              { x: 1, y: 10 },
              { x: 2, y: 20 },
              { x: 3, y: 30 },
            ],
          },
          {
            name: 'B',
            values: [],
            points: [
              { x: 2, y: 200 },
              { x: 5, y: 500 },
            ],
          },
        ],
      },
      'scatter',
    );
    // In the order each x first appears: A's, then the x only B has.
    expect(chartGrid(scatter)).toEqual([
      ['', 'A', 'B'],
      ['1', '10', ''],
      ['2', '20', '200'],
      ['3', '30', ''],
      ['5', '', '500'],
    ]);
  });

  it('gives a second point of one series at the same x a row of its own', () => {
    const scatter = chart(
      {
        categories: [],
        series: [
          {
            name: 'A',
            values: [],
            points: [
              { x: 1, y: 10 },
              { x: 1, y: 11 },
              { x: 2, y: 20 },
            ],
          },
          { name: 'B', values: [], points: [{ x: 1, y: 100 }] },
        ],
      },
      'scatter',
    );
    const grid = chartGrid(scatter);
    expect(grid).toEqual([
      ['', 'A', 'B'],
      ['1', '10', '100'],
      ['1', '11', ''],
      ['2', '20', ''],
    ]);
    // Nothing is lost: every point has its cell.
    const cells = grid.slice(1).flatMap((row) => row.slice(1).filter((text) => text !== ''));
    expect(cells).toHaveLength(4);
  });

  it('reads a series without points as the renderer draws it, next to one with points', () => {
    const scatter = chart(
      {
        categories: ['10', '20'],
        series: [
          { name: 'A', values: [1, 2] },
          { name: 'B', values: [], points: [{ x: 20, y: 9 }] },
        ],
      },
      'scatter',
    );
    expect(chartGrid(scatter)).toEqual([
      ['', 'A', 'B'],
      ['10', '1', ''],
      ['20', '2', '9'],
    ]);
  });

  it('ignores points a chart of another type was left with', () => {
    const column = chart({
      categories: ['a'],
      series: [{ name: 's', values: [7], points: [{ x: 99, y: 99 }] }],
    });
    expect(chartGrid(column)).toEqual([
      ['', 's'],
      ['a', '7'],
    ]);
  });
});

describe('gridData', () => {
  it('is the inverse of chartGrid, and keeps the colour of each series by its column', () => {
    const before = chart(SALES);
    expect(gridData(chartGrid(before), 'column', before.data)).toEqual(SALES);
  });

  it('reads the values as numbers, and a text that is no number as a gap', () => {
    const data = gridData(
      [
        ['ignored', ' Revenue ', 'Growth'],
        ['2024', '1,200', '4%'],
        ['2025', 'n/a', '(2)'],
      ],
      'line',
    );
    expect(data).toEqual({
      categories: ['2024', '2025'],
      series: [
        { name: 'Revenue', values: [1200, null] },
        { name: 'Growth', values: [4, -2] },
      ],
    });
  });

  it('makes a rectangle of rows of different lengths', () => {
    const data = gridData([['', 'a'], ['x', '1', '2'], ['y']], 'column');
    expect(data.categories).toEqual(['x', 'y']);
    expect(data.series).toEqual([
      { name: 'a', values: [1, null] },
      { name: '', values: [2, null] },
    ]);
  });

  it('keeps a name on one line', () => {
    const data = gridData(
      [
        ['', 'two\nlines'],
        ['first\r\nsecond', '1'],
      ],
      'column',
    );
    expect(data.series[0]?.name).toBe('two lines');
    expect(data.categories).toEqual(['first second']);
  });

  it('writes the x values of a scatter chart the way the renderer reads them', () => {
    const data = gridData(
      [
        ['', 'y'],
        ['1,5', '10'],
        ['2 000', '20'],
        ['12%', '30'],
        ['later', '40'],
      ],
      'scatter',
    );
    expect(data.categories).toEqual(['1.5', '2000', '12', 'later']);
    expect(data.series[0]).toEqual({ name: 'y', values: [10, 20, 30, 40] });
    // No points: a scatter chart that was edited is a table.
    expect(data.series.every((series) => !('points' in series))).toBe(true);
    // The same text in a chart of categories is a label, and stays as it was typed.
    expect(gridData([[''], ['1,5']], 'column').categories).toEqual(['1,5']);
  });

  it('turns the points of a scatter chart into a table and back to the same picture', () => {
    const scatter = chart(
      {
        categories: [],
        series: [
          {
            name: 'A',
            values: [],
            points: [
              { x: 1, y: 10 },
              { x: 1, y: 11 },
              { x: 2.5, y: 20 },
            ],
          },
          { name: 'B', values: [], points: [{ x: 2.5, y: 7 }], color: { value: '#112233' } },
        ],
      },
      'scatter',
    );
    const data = gridData(chartGrid(scatter), 'scatter', scatter.data);
    expect(data).toEqual({
      categories: ['1', '1', '2.5'],
      series: [
        { name: 'A', values: [10, 11, 20] },
        { name: 'B', values: [null, null, 7], color: { value: '#112233' } },
      ],
    });
    // The grid of the table is the grid of the points.
    expect(chartGrid({ chartType: 'scatter', data })).toEqual(chartGrid(scatter));
  });
});

describe('setCell', () => {
  const before = chart(SALES);

  it('sets a value', () => {
    const after = applied(before, setCell(before, { row: 2, col: 2 }, '2.5'));
    expect(after.data.series[1]?.values).toEqual([1, 2.5, 3]);
    // The rest is as it was, the colour of the other series included.
    expect(after.data.series[0]).toEqual(SALES.series[0]);
    expect(after.data.categories).toEqual(SALES.categories);
  });

  it('empties a value to a gap', () => {
    const after = applied(before, setCell(before, { row: 1, col: 1 }, ''));
    expect(after.data.series[0]?.values).toEqual([null, 20, 30]);
  });

  it('names a series and a category', () => {
    const named = applied(before, setCell(before, { row: 0, col: 2 }, ' אגסים '));
    expect(named.data.series[1]?.name).toBe('אגסים');
    const category = applied(before, setCell(before, { row: 3, col: 0 }, 'רבעון 3'));
    expect(category.data.categories).toEqual(['Q1', 'Q2', 'רבעון 3']);
  });

  it('writes nothing when the cell holds that already', () => {
    expect(setCell(before, { row: 1, col: 1 }, '10')).toBeUndefined();
    expect(setCell(before, { row: 1, col: 1 }, '10.0')).toBeUndefined();
    expect(setCell(before, { row: 2, col: 2 }, '  ')).toBeUndefined();
    expect(setCell(before, { row: 0, col: 1 }, 'Apples')).toBeUndefined();
  });

  it('keeps the value of a cell that is given text that is no number', () => {
    expect(setCell(before, { row: 1, col: 1 }, 'ten')).toBeUndefined();
    expect(setCell(before, { row: 1, col: 1 }, '1,2,3')).toBeUndefined();
  });

  it('takes nothing at the corner, and nothing outside the grid', () => {
    expect(setCell(before, { row: 0, col: 0 }, 'x')).toBeUndefined();
    expect(setCell(before, { row: 4, col: 1 }, '5')).toBeUndefined();
    expect(setCell(before, { row: 1, col: 3 }, '5')).toBeUndefined();
    expect(setCell(before, { row: -1, col: 1 }, '5')).toBeUndefined();
  });

  it('turns the points of a scatter chart into a table with the first edit', () => {
    const scatter = chart(
      {
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
      },
      'scatter',
    );
    const after = applied(scatter, setCell(scatter, { row: 2, col: 1 }, '25'));
    expect(after.data).toEqual({
      categories: ['1', '2'],
      series: [{ name: 'A', values: [10, 25] }],
    });
    // An x is kept as a number the renderer reads.
    const moved = applied(after, setCell(after, { row: 1, col: 0 }, '1,5'));
    expect(moved.data.categories).toEqual(['1.5', '2']);
    // A cell that is typed as it is leaves the points alone.
    expect(setCell(scatter, { row: 2, col: 1 }, '20')).toBeUndefined();
  });
});

describe('pasteCells', () => {
  const before = chart(SALES);

  it('overlays the values from a cell on', () => {
    const after = applied(
      before,
      pasteCells(
        before,
        { row: 2, col: 1 },
        [
          ['200', '2'],
          ['300', 'x'],
        ],
        names,
      ),
    );
    expect(chartGrid(after)).toEqual([
      ['', 'Apples', 'Pears'],
      ['Q1', '10', '1'],
      ['Q2', '200', '2'],
      // Text in a value cell is a gap.
      ['Q3', '300', ''],
    ]);
  });

  it('grows the chart by the rows and the columns the grid needs', () => {
    const after = applied(
      before,
      pasteCells(
        before,
        { row: 3, col: 2 },
        [
          ['7', '8'],
          ['9', '10'],
        ],
        names,
      ),
    );
    expect(chartGrid(after)).toEqual([
      ['', 'Apples', 'Pears', 'Series 3'],
      ['Q1', '10', '1', ''],
      ['Q2', '20', '', ''],
      ['Q3', '30', '7', '8'],
      ['', '', '9', '10'],
    ]);
    // The series that were there keep their colours.
    expect(after.data.series[0]?.color).toEqual({ token: 'accent' });
  });

  it('takes names from a grid pasted on the first row, and categories from the first column', () => {
    const header = applied(
      before,
      pasteCells(
        before,
        { row: 0, col: 2 },
        [
          ['B', 'C'],
          ['5', '6'],
        ],
        names,
      ),
    );
    expect(chartGrid(header)).toEqual([
      ['', 'Apples', 'B', 'C'],
      ['Q1', '10', '5', '6'],
      ['Q2', '20', '', ''],
      ['Q3', '30', '3', ''],
    ]);
    const side = applied(
      before,
      pasteCells(
        before,
        { row: 2, col: 0 },
        [
          ['b', '1'],
          ['c', '2'],
          ['d', '3'],
        ],
        names,
      ),
    );
    expect(chartGrid(side)).toEqual([
      ['', 'Apples', 'Pears'],
      ['Q1', '10', '1'],
      ['b', '1', ''],
      ['c', '2', '3'],
      ['d', '3', ''],
    ]);
  });

  it('replaces the whole data when pasted at the corner', () => {
    const after = applied(
      before,
      pasteCells(
        before,
        { row: 0, col: 0 },
        [
          ['מוצר', 'Q1', 'Q2'],
          ['תפוחים', '1,200', '1,350'],
          ['אגסים', '980', '1,040'],
        ],
        names,
      ),
    );
    expect(after.data).toEqual({
      categories: ['תפוחים', 'אגסים'],
      series: [
        // The first series keeps the colour of the series it took the place of.
        { name: 'Q1', values: [1200, 980], color: { token: 'accent' } },
        { name: 'Q2', values: [1350, 1040] },
      ],
    });
  });

  it('never leaves a chart without a series or without a category', () => {
    const row = applied(before, replaceData(before, [['', 'A', 'B']], names));
    expect(row.data.categories).toEqual(['']);
    expect(row.data.series.map((s) => s.values)).toEqual([[null], [null]]);
    const column = applied(before, replaceData(before, [['x'], ['a'], ['b']], names));
    expect(column.data).toEqual({
      categories: ['a', 'b'],
      series: [{ name: 'Series 1', values: [null, null] }],
    });
    expect(replaceData(before, [], names)).toBeUndefined();
    expect(pasteCells(before, { row: 1, col: 1 }, [], names)).toBeUndefined();
  });

  it('writes nothing when the grid is what the chart holds', () => {
    expect(pasteCells(before, { row: 0, col: 0 }, chartGrid(before), names)).toBeUndefined();
    expect(pasteCells(before, { row: 1, col: 1 }, [['10']], names)).toBeUndefined();
  });
});

describe('rows and columns', () => {
  const before = chart(SALES);

  it('adds a category where asked, with no values', () => {
    const after = applied(before, insertRow(before, 2, 'Q1.5'));
    expect(chartGrid(after)).toEqual([
      ['', 'Apples', 'Pears'],
      ['Q1', '10', '1'],
      ['Q1.5', '', ''],
      ['Q2', '20', ''],
      ['Q3', '30', '3'],
    ]);
    // Past the end is the end; before the first is the first.
    expect(applied(before, insertRow(before, 99)).data.categories).toEqual(['Q1', 'Q2', 'Q3', '']);
    expect(applied(before, insertRow(before, 0)).data.categories).toEqual(['', 'Q1', 'Q2', 'Q3']);
  });

  it('removes a category, but not the last one and not the header', () => {
    const after = applied(before, deleteRow(before, 2));
    expect(chartGrid(after)).toEqual([
      ['', 'Apples', 'Pears'],
      ['Q1', '10', '1'],
      ['Q3', '30', '3'],
    ]);
    expect(deleteRow(before, 0)).toBeUndefined();
    expect(deleteRow(before, 4)).toBeUndefined();
    const one = chart({ categories: ['only'], series: [{ name: 's', values: [1] }] });
    expect(deleteRow(one, 1)).toBeUndefined();
  });

  it('adds a series where asked, and the others keep their colours', () => {
    const after = applied(before, insertColumn(before, 1, 'New'));
    expect(after.data.series.map((s) => s.name)).toEqual(['New', 'Apples', 'Pears']);
    expect(after.data.series[0]).toEqual({ name: 'New', values: [null, null, null] });
    expect(after.data.series[1]?.color).toEqual({ token: 'accent' });
    const last = applied(before, insertColumn(before, 99, 'Last'));
    expect(last.data.series.map((s) => s.name)).toEqual(['Apples', 'Pears', 'Last']);
  });

  it('removes a series with its colour, but not the last one and not the categories', () => {
    const after = applied(before, deleteColumn(before, 1));
    expect(after.data.series).toEqual([{ name: 'Pears', values: [1, null, 3] }]);
    expect(deleteColumn(before, 0)).toBeUndefined();
    expect(deleteColumn(before, 3)).toBeUndefined();
    expect(deleteColumn(after, 1)).toBeUndefined();
  });

  it('keeps the colour of every slice of a pie when a category is added or removed', () => {
    const red = { value: '#ff0000' };
    const green = { value: '#00ff00' };
    const blue = { value: '#0000ff' };
    const grey = { value: '#888888' };
    const pie = chart(
      { categories: ['a', 'b', 'c'], series: [{ name: 's', values: [1, 2, 3] }] },
      'pie',
      {
        options: {
          legend: { show: true, position: 'bottom' },
          axes: { x: { show: true }, y: { show: true } },
          labels: false,
          palette: [red, green, blue, grey],
        },
      },
    );
    // The new slice takes the colour the next slice would have had; the others keep theirs.
    const added = applied(pie, insertRow(pie, 2, 'new'));
    expect(added.data.categories).toEqual(['a', 'new', 'b', 'c']);
    expect(added.options.palette).toEqual([red, grey, green, blue]);
    // The colour of a removed slice goes to the end of the line.
    const removed = applied(pie, deleteRow(pie, 1));
    expect(removed.data.categories).toEqual(['b', 'c']);
    expect(removed.options.palette).toEqual([green, blue, grey, red]);
    // A palette shorter than the slices is a cycle.
    const short = chart(pie.data, 'donut', { options: { ...pie.options, palette: [red, green] } });
    expect(applied(short, deleteRow(short, 1)).options.palette).toEqual([green, red, red]);
    expect(applied(short, insertRow(short, 1)).options.palette).toEqual([green, red, green, red]);
    // A column chart colours series, not categories: its palette is left alone.
    const columns = chart(pie.data, 'column', { options: pie.options });
    expect(insertRow(columns, 1)).not.toHaveProperty('options');
    // And a pie in the colours of the theme has no palette to keep.
    expect(insertRow(chart(pie.data, 'pie'), 1)).not.toHaveProperty('options');
  });
});

describe('changeType', () => {
  it('keeps the data', () => {
    const before = chart(SALES);
    for (const type of ['bar', 'line', 'area', 'pie', 'donut', 'radar', 'scatter'] as const) {
      const patch = changeType(before, type);
      expect(patch).toEqual({ chartType: type });
      expect(applied(before, patch).data).toBe(before.data);
    }
    expect(changeType(before, 'column')).toBeUndefined();
  });

  it('out of a scatter chart with points: the x values become the categories', () => {
    const scatter = chart(
      {
        categories: [],
        series: [
          {
            name: 'A',
            values: [],
            points: [
              { x: 1, y: 10 },
              { x: 2, y: 20 },
            ],
            color: { token: 'primary' },
          },
          { name: 'B', values: [], points: [{ x: 2, y: 5 }] },
        ],
      },
      'scatter',
    );
    const after = applied(scatter, changeType(scatter, 'line'));
    expect(after.chartType).toBe('line');
    expect(after.data).toEqual({
      categories: ['1', '2'],
      series: [
        { name: 'A', values: [10, 20], color: { token: 'primary' } },
        { name: 'B', values: [null, 5] },
      ],
    });
  });

  it('into a scatter chart: the categories and the values stay, stale points go', () => {
    const stale = chart({
      categories: ['1', '2'],
      series: [{ name: 's', values: [7, 8], points: [{ x: 99, y: 99 }] }],
    });
    const after = applied(stale, changeType(stale, 'scatter'));
    expect(after.data).toEqual({ categories: ['1', '2'], series: [{ name: 's', values: [7, 8] }] });
  });
});
