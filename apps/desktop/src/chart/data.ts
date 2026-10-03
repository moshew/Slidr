import type { ChartElement, ChartType } from '@slidr/model';

/*
 * The data of a chart as a grid of strings, and back (WG6-T06, CHT-02, CHT-05). The data editor
 * shows the grid and the clipboard brings one. Every edit here is a pure function that returns the
 * patch of one `element.update`, so it is one undo step: no command and no schema of its own.
 *
 * The grid: row 0 holds the names of the series, from column 1 on; column 0 holds the categories,
 * from row 1 on; the rest are the values, an empty string for a gap. The corner is always empty.
 * For a scatter chart column 0 holds the x values.
 */

export type ChartData = ChartElement['data'];
type Series = ChartData['series'][number];

/** What of a chart its data depends on. */
export type ChartSource = Pick<ChartElement, 'chartType' | 'data' | 'options'>;

/** The fields of a chart an edit of its data writes. */
export interface ChartPatch {
  chartType?: ChartType;
  data?: ChartData;
  options?: ChartElement['options'];
}

/** A cell of the grid: row 0 is the series names, column 0 the categories. */
export interface GridCell {
  row: number;
  col: number;
}

/** The name of a series nobody named yet: the nth of the chart, counted from 1. */
export type SeriesName = (n: number) => string;

// ---------------------------------------------------------------------------------------------
// Numbers

/** The minus sign of typography and the en dash that stands in for it, by code point. */
const MINUS_SIGNS = new RegExp(
  `[${String.fromCodePoint(0x2212)}${String.fromCodePoint(0x2013)}]`,
  'g',
);

const count = (text: string, sign: string) => text.split(sign).length - 1;

/** Whole thousands: 1,234 or 12.345.678. A group of thousands does not start with a zero. */
const grouped = (text: string, separator: string) =>
  new RegExp(`^[1-9]\\d{0,2}(?:\\${separator}\\d{3})+$`).test(text);

/** Digits with their separators, without a sign. */
function magnitude(text: string): number | null {
  // 12, 12.5, .5, 5. and 1.5e-3: as a number is written in code.
  if (/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return Number(text);
  const commas = count(text, ',');
  const dots = count(text, '.');
  if (commas > 0 && dots === 0) {
    if (grouped(text, ',')) return Number(text.replaceAll(',', ''));
    // A decimal comma, only where the comma cannot be one of thousands: 1,5 and 0,123.
    return commas === 1 && /^\d*,\d+$/.test(text) ? Number(text.replace(',', '.')) : null;
  }
  if (dots > 1 && commas === 0) {
    return grouped(text, '.') ? Number(text.replaceAll('.', '')) : null;
  }
  if (commas > 0 && dots > 0) {
    // Both: the one that comes last is the decimal sign, the other groups the thousands.
    const [group, decimal] =
      text.lastIndexOf('.') > text.lastIndexOf(',') ? [',', '.'] : ['.', ','];
    if (count(text, decimal) !== 1) return null;
    const [whole = '', fraction = ''] = text.split(decimal);
    if (!/^\d*$/.test(fraction) || !grouped(whole, group)) return null;
    return Number(`${whole.replaceAll(group, '')}.${fraction}`);
  }
  return null;
}

/**
 * A number as people and spreadsheets write one: `1,234.5`, `1.234,5`, `-5`, `(5)` for minus five,
 * `12%` for twelve, with a currency sign or spaces around it. `1,5` is one and a half, but `1,234`
 * is a thousand and more. Null for an empty text, and for text that is no number.
 */
export function parseNumber(text: string): number | null {
  // Spaces (also the non-breaking ones), direction marks and currency signs say nothing.
  let rest = text.replace(/[\s\p{Cf}\p{Sc}]/gu, '').replace(MINUS_SIGNS, '-');
  if (rest === '') return null;
  let negative = false;
  // In accounts a number in brackets is a negative one.
  const bracketed = /^\((.+)\)$/.exec(rest);
  if (bracketed?.[1]) {
    negative = true;
    rest = bracketed[1];
  }
  if (rest.startsWith('%')) rest = rest.slice(1);
  else if (rest.endsWith('%')) rest = rest.slice(0, -1);
  const sign = /^[+-]|-$/.exec(rest)?.[0];
  if (sign) {
    if (bracketed) return null;
    negative = sign === '-';
    rest = rest.startsWith(sign) ? rest.slice(1) : rest.slice(0, -1);
  }
  const value = magnitude(rest);
  if (value === null || !Number.isFinite(value)) return null;
  return negative && value !== 0 ? -value : value;
}

/** A value as the grid shows it: the number as it is, and nothing for a gap. */
const valueText = (value: number | null | undefined): string =>
  value === null || value === undefined ? '' : String(value);

/** A name or a category: one line, without the spaces around it. */
const labelText = (text: string): string => text.replace(/\s*[\r\n]+\s*/g, ' ').trim();

/**
 * What is typed or pasted in column 0. For a scatter chart it is an x value: the renderer reads
 * it with `Number`, so a number is kept the way `Number` reads it back (`1,5` as `1.5`).
 */
function categoryText(text: string, chartType: ChartType): string {
  const label = labelText(text);
  if (chartType !== 'scatter') return label;
  const x = parseNumber(label);
  return x === null ? label : String(x);
}

/**
 * Whether a cell takes a text: names and categories take any, a value takes a number or nothing.
 * Text that a value cell does not take leaves the value as it was (`setCell`).
 */
export function isValidCell(cell: GridCell, text: string): boolean {
  return cell.row === 0 || cell.col === 0 || text.trim() === '' || parseNumber(text) !== null;
}

// ---------------------------------------------------------------------------------------------
// The grid

/** A series with these values, and with nothing but what a table holds: no `points`. */
function plain(series: Series, values: (number | null)[]): Series {
  return { name: series.name, values, ...(series.color ? { color: series.color } : {}) };
}

/**
 * The rows of a scatter chart whose series carry points of their own. Rows come in the order
 * each x first appears; a second point of one series at the same x takes a further row, so every
 * point has a cell. A series without points gives the ones the renderer draws for it: its values
 * over the categories read as numbers, or over 1, 2, 3 when a category is not a number.
 */
function pointRows(data: ChartData): ChartData {
  const xs = data.categories.map((category) => Number(category.replace(/[\s,]/g, '')));
  const numeric =
    xs.length > 0 && xs.every((x, i) => Number.isFinite(x) && data.categories[i] !== '');
  const rows: { x: number; values: (number | null)[] }[] = [];
  data.series.forEach((series, s) => {
    const points = series.points?.length
      ? series.points
      : series.values.flatMap((y, i) =>
          y === null ? [] : [{ x: numeric ? (xs[i] ?? i + 1) : i + 1, y }],
        );
    for (const point of points) {
      let row = rows.find((r) => r.x === point.x && r.values[s] === null);
      if (!row) {
        row = { x: point.x, values: data.series.map(() => null) };
        rows.push(row);
      }
      row.values[s] = point.y;
    }
  });
  return {
    categories: rows.map((row) => String(row.x)),
    series: data.series.map((series, s) =>
      plain(
        series,
        rows.map((row) => row.values[s] ?? null),
      ),
    ),
  };
}

/** The data as a table: every series as long as the categories, and no `points`. */
function tabular({ chartType, data }: Pick<ChartElement, 'chartType' | 'data'>): ChartData {
  if (chartType === 'scatter' && data.series.some((series) => series.points?.length)) {
    return pointRows(data);
  }
  const rows = Math.max(data.categories.length, ...data.series.map((s) => s.values.length));
  const each = Array.from({ length: rows }, (_, row) => row);
  return {
    categories: each.map((row) => data.categories[row] ?? ''),
    series: data.series.map((series) =>
      plain(
        series,
        each.map((row) => series.values[row] ?? null),
      ),
    ),
  };
}

const sameData = (a: ChartData, b: ChartData) => JSON.stringify(a) === JSON.stringify(b);

/** The patch that makes the data `next`, or undefined when that is what the chart shows already. */
function dataPatch(chart: ChartSource, next: ChartData): ChartPatch | undefined {
  return sameData(tabular(chart), next) ? undefined : { data: next };
}

/** The data of a chart as a grid of strings: what the data editor shows. */
export function chartGrid(chart: Pick<ChartElement, 'chartType' | 'data'>): string[][] {
  const { categories, series } = tabular(chart);
  return [
    ['', ...series.map((s) => s.name)],
    ...categories.map((category, row) => [
      category,
      ...series.map((s) => valueText(s.values[row])),
    ]),
  ];
}

/**
 * A grid of strings as the data of a chart: its first row names the series, its first column the
 * categories (for a scatter chart: the x values), and the rest are numbers; text that is no
 * number is a gap. A series keeps the colour the series in its column had (`previous`).
 */
export function gridData(
  grid: readonly (readonly string[])[],
  chartType: ChartType,
  previous?: ChartData,
): ChartData {
  const header = grid[0] ?? [];
  const body = grid.slice(1);
  const width = Math.max(1, ...grid.map((row) => row.length));
  return {
    categories: body.map((row) => categoryText(row[0] ?? '', chartType)),
    series: Array.from({ length: width - 1 }, (_, i) => {
      const color = previous?.series[i]?.color;
      return {
        name: labelText(header[i + 1] ?? ''),
        values: body.map((row) => parseNumber(row[i + 1] ?? '')),
        ...(color ? { color } : {}),
      };
    }),
  };
}

// ---------------------------------------------------------------------------------------------
// Cells

/**
 * Writes texts into the cells of a table of data, from one cell on, adding the categories and the
 * series the texts reach past. The corner of the grid takes nothing.
 */
function overlay(
  data: ChartData,
  chartType: ChartType,
  at: GridCell,
  cells: readonly (readonly string[])[],
  seriesName: SeriesName,
): ChartData {
  const height = cells.length;
  const width = Math.max(0, ...cells.map((row) => row.length));
  const rows = Math.max(data.categories.length, at.row + height - 1);
  const cols = Math.max(data.series.length, at.col + width - 1);
  const categories = Array.from({ length: rows }, (_, r) => data.categories[r] ?? '');
  const series = Array.from({ length: cols }, (_, c): Series => {
    const old = data.series[c];
    const values = Array.from({ length: rows }, (_, r) => old?.values[r] ?? null);
    return old ? plain(old, values) : { name: seriesName(c + 1), values };
  });
  cells.forEach((line, r) => {
    line.forEach((text, c) => {
      const row = at.row + r;
      const col = at.col + c;
      const target = series[col - 1];
      if (row === 0 && target) target.name = labelText(text);
      else if (col === 0 && row > 0) categories[row - 1] = categoryText(text, chartType);
      else if (target && row > 0) target.values[row - 1] = parseNumber(text);
    });
  });
  return { categories, series };
}

/**
 * Sets one cell: the name of a series, a category, or a value. Undefined when nothing changes:
 * the text is what the cell holds, or a value cell was given text that is no number, and keeps
 * the value it has.
 */
export function setCell(chart: ChartSource, cell: GridCell, text: string): ChartPatch | undefined {
  const data = tabular(chart);
  const inside = cell.row <= data.categories.length && cell.col <= data.series.length;
  if (!inside || cell.row < 0 || cell.col < 0 || !isValidCell(cell, text)) return undefined;
  // The names are the user's to give: an empty one stays empty.
  return dataPatch(
    chart,
    overlay(data, chart.chartType, cell, [[text]], () => ''),
  );
}

/**
 * The whole data from a grid: its first row the names of the series, its first column the
 * categories. Never fewer than one series and one category.
 */
export function replaceData(
  chart: ChartSource,
  cells: readonly (readonly string[])[],
  seriesName: SeriesName,
): ChartPatch | undefined {
  const width = Math.max(0, ...cells.map((row) => row.length));
  if (cells.length === 0 || width === 0) return undefined;
  const next = gridData(cells, chart.chartType, chart.data);
  if (next.categories.length === 0) {
    next.categories.push('');
    for (const series of next.series) series.values.push(null);
  }
  if (next.series.length === 0) {
    next.series.push({ name: seriesName(1), values: next.categories.map(() => null) });
  }
  return dataPatch(chart, next);
}

/**
 * Pastes a grid of strings from a cell on: it overlays what is there, and the chart grows by the
 * categories and the series it needs. Pasted at the corner, the grid replaces the whole data.
 */
export function pasteCells(
  chart: ChartSource,
  at: GridCell,
  cells: readonly (readonly string[])[],
  seriesName: SeriesName,
): ChartPatch | undefined {
  if (cells.length === 0) return undefined;
  if (at.row === 0 && at.col === 0) return replaceData(chart, cells, seriesName);
  return dataPatch(chart, overlay(tabular(chart), chart.chartType, at, cells, seriesName));
}

// ---------------------------------------------------------------------------------------------
// Rows and columns

const isRound = (chart: ChartSource) => chart.chartType === 'pie' || chart.chartType === 'donut';

/**
 * The colours of the slices after a category was added (`added`) or removed (`removed`). A pie
 * colours its slices by their place in the chart's own palette, so the palette moves with them:
 * every other slice keeps its colour, a new one takes the colour the next slice would have had,
 * and the colour of a removed one waits at the end of the line. Nothing to do for a chart that
 * follows the theme, or for one that colours series.
 */
function slicePalette(
  chart: ChartSource,
  slices: number,
  change: { added: number } | { removed: number },
): Pick<ChartPatch, 'options'> {
  const palette = chart.options.palette;
  if (!isRound(chart) || !palette?.length) return {};
  const cycle = (i: number) => palette[i % palette.length]!;
  // A colour for each slice, and after them the colours no slice has reached yet.
  const colors = Array.from({ length: Math.max(slices, palette.length) }, (_, i) => cycle(i));
  if ('added' in change) {
    const next = colors.length > slices ? colors.splice(slices, 1)[0]! : cycle(slices);
    colors.splice(change.added, 0, next);
  } else {
    colors.push(...colors.splice(change.removed, 1));
  }
  return { options: { ...chart.options, palette: colors } };
}

/** Adds a category as row `row` of the grid (1 is the first), with no values yet. */
export function insertRow(chart: ChartSource, row: number, category = ''): ChartPatch {
  const data = tabular(chart);
  const at = Math.min(Math.max(row, 1), data.categories.length + 1) - 1;
  return {
    data: {
      categories: data.categories.toSpliced(at, 0, categoryText(category, chart.chartType)),
      series: data.series.map((s) => plain(s, s.values.toSpliced(at, 0, null))),
    },
    ...slicePalette(chart, data.categories.length, { added: at }),
  };
}

/** Removes the category of a row of the grid. Undefined for the last one, and for row 0. */
export function deleteRow(chart: ChartSource, row: number): ChartPatch | undefined {
  const data = tabular(chart);
  if (row < 1 || row > data.categories.length || data.categories.length <= 1) return undefined;
  const at = row - 1;
  return {
    data: {
      categories: data.categories.toSpliced(at, 1),
      series: data.series.map((s) => plain(s, s.values.toSpliced(at, 1))),
    },
    ...slicePalette(chart, data.categories.length, { removed: at }),
  };
}

/** Adds a series as column `col` of the grid (1 is the first), with no values yet. */
export function insertColumn(chart: ChartSource, col: number, name: string): ChartPatch {
  const data = tabular(chart);
  const at = Math.min(Math.max(col, 1), data.series.length + 1) - 1;
  const added: Series = { name: labelText(name), values: data.categories.map(() => null) };
  return { data: { categories: data.categories, series: data.series.toSpliced(at, 0, added) } };
}

/** Removes the series of a column of the grid. Undefined for the last one, and for column 0. */
export function deleteColumn(chart: ChartSource, col: number): ChartPatch | undefined {
  const data = tabular(chart);
  if (col < 1 || col > data.series.length || data.series.length <= 1) return undefined;
  return { data: { categories: data.categories, series: data.series.toSpliced(col - 1, 1) } };
}

// ---------------------------------------------------------------------------------------------
// The type

/**
 * Another type for the same data (CHT-05). Into a scatter chart the categories and the values
 * stay as they are: the renderer reads the categories as x values. Out of a scatter chart whose
 * series carry points, the x values become the categories and the values line up with them; the
 * points go, since no other type draws them. Undefined when the chart is of that type already.
 */
export function changeType(chart: ChartSource, chartType: ChartType): ChartPatch | undefined {
  if (chart.chartType === chartType) return undefined;
  if (!chart.data.series.some((series) => series.points)) return { chartType };
  // Points a chart of another type was left with go as well: a scatter chart would draw them
  // in place of the values, which are what the chart showed until now.
  return { chartType, data: tabular(chart) };
}
