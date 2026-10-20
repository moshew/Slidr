import type { ChartElement, ChartType, Color, Theme } from '@slidr/model';
import type { ChartPatch, ChartSource } from './data';

/*
 * The options of a chart (WG6-T07, CHT-03, CHT-04): title, legend, axes, value labels and
 * colours. Like the edits of the data (`data.ts`), each is a pure function that returns the patch
 * of one `element.update`, or undefined when the chart is like that already.
 *
 * What an option means is the renderer's to say (`packages/renderer/src/chart/option.ts`):
 * `axes.x` is the axis of the categories and `axes.y` the axis of the values, whichever way the
 * chart lies; in a scatter chart they are the x and the y values.
 */

type Options = ChartElement['options'];
type Axis = Options['axes']['x'];
export type AxisName = 'x' | 'y';
export type LegendPosition = Options['legend']['position'];

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function optionsPatch(chart: ChartSource, options: Options): ChartPatch | undefined {
  return same(chart.options, options) ? undefined : { options };
}

/** The title of the chart. An empty one removes it. */
export function setTitle(chart: ChartSource, text: string): ChartPatch | undefined {
  const { title: _title, ...rest } = chart.options;
  const title = text.trim();
  return optionsPatch(chart, title ? { ...rest, title } : rest);
}

export function setLegend(
  chart: ChartSource,
  legend: Partial<Options['legend']>,
): ChartPatch | undefined {
  return optionsPatch(chart, { ...chart.options, legend: { ...chart.options.legend, ...legend } });
}

export function setLabels(chart: ChartSource, labels: boolean): ChartPatch | undefined {
  return optionsPatch(chart, { ...chart.options, labels });
}

/* ---------------------------------------------------------------- axes */

/** What of an axis a chart type draws, and so what its controls offer. */
export interface AxisControls {
  /** `category`, `value`, or the `x` and `y` of a scatter chart: the name of the axis. */
  kind: 'category' | 'value' | 'x' | 'y';
  /** The axis can be hidden, named, and given grid lines. */
  look: boolean;
  /** The axis is one of numbers: it has a minimum and a maximum. */
  range: boolean;
  /** Whether the grid lines show while the chart says nothing about them. */
  gridByDefault: boolean;
}

/**
 * The axes of a chart type, as the renderer draws them. A pie and a donut have none. A radar
 * chart has spokes and no axis to style, but its values have a minimum and a maximum.
 */
export function axisControls(chartType: ChartType): Partial<Record<AxisName, AxisControls>> {
  switch (chartType) {
    case 'pie':
    case 'donut':
      return {};
    case 'radar':
      return { y: { kind: 'value', look: false, range: true, gridByDefault: true } };
    case 'scatter':
      return {
        x: { kind: 'x', look: true, range: true, gridByDefault: true },
        y: { kind: 'y', look: true, range: true, gridByDefault: true },
      };
    default:
      return {
        x: { kind: 'category', look: true, range: false, gridByDefault: false },
        y: { kind: 'value', look: true, range: true, gridByDefault: true },
      };
  }
}

/** A change of one axis: an empty title, and a null minimum or maximum, go back to "none". */
export interface AxisChange {
  show?: boolean;
  title?: string;
  gridLines?: boolean;
  min?: number | null;
  max?: number | null;
}

export function setAxis(
  chart: ChartSource,
  name: AxisName,
  change: AxisChange,
): ChartPatch | undefined {
  const next: Record<string, unknown> = { ...chart.options.axes[name] };
  for (const key of Object.keys(change) as (keyof AxisChange)[]) {
    const value = change[key];
    if (value === undefined) continue;
    const given = typeof value === 'string' ? value.trim() : value;
    if (given === null || given === '') delete next[key];
    else next[key] = given;
  }
  const axes = { ...chart.options.axes, [name]: next as Axis };
  return optionsPatch(chart, { ...chart.options, axes });
}

/* ---------------------------------------------------------------- colours */

const isRound = (chart: ChartSource) => chart.chartType === 'pie' || chart.chartType === 'donut';

/** The palette a chart draws from: its own, or the chart colours of the theme. */
function palette(chart: ChartSource, theme: Theme): Color[] {
  return chart.options.palette?.length
    ? chart.options.palette
    : theme.colors.chart.map((value) => ({ value }));
}

/** What of a chart has a colour of its own: a series, or a slice of a pie or a donut. */
export interface Colored {
  name: string;
  /** The colour it is drawn in (CHT-04): its own, the chart's palette, or the theme's. */
  color: Color;
}

/**
 * The parts of a chart that are coloured one by one, in order: the series, or for a pie and a
 * donut the slices, since those colour the categories.
 */
export function coloredParts(chart: ChartSource, theme: Theme): Colored[] {
  const colors = palette(chart, theme);
  const fallback: Color = { token: 'primary' };
  const cycle = (i: number) => colors[i % Math.max(colors.length, 1)] ?? fallback;
  if (isRound(chart)) {
    return chart.data.categories.map((name, i) => ({ name, color: cycle(i) }));
  }
  return chart.data.series.map((series, i) => ({
    name: series.name,
    color: series.color ?? cycle(i),
  }));
}

/**
 * Gives a series a colour of its own. A slice of a pie or a donut is coloured through the
 * chart's palette, which then holds a colour for every slice: the theme's, as they are now, for
 * the slices that were not given one.
 */
export function setColor(
  chart: ChartSource,
  theme: Theme,
  index: number,
  color: Color,
): ChartPatch {
  if (isRound(chart)) {
    const colors = palette(chart, theme);
    const length = Math.max(colors.length, chart.data.categories.length, index + 1);
    const next = Array.from({ length }, (_, i) =>
      i === index ? color : (colors[i % Math.max(colors.length, 1)] ?? color),
    );
    return { options: { ...chart.options, palette: next } };
  }
  return {
    data: {
      ...chart.data,
      series: chart.data.series.map((series, i) => (i === index ? { ...series, color } : series)),
    },
  };
}

/** Whether the chart has colours of its own: a palette, or a series with a colour. */
export function hasOwnColors(chart: ChartSource): boolean {
  return Boolean(chart.options.palette) || chart.data.series.some((series) => series.color);
}

/** Back to the chart colours of the theme: the chart's palette and its series' colours go. */
export function resetColors(chart: ChartSource): ChartPatch | undefined {
  if (!hasOwnColors(chart)) return undefined;
  const { palette: _palette, ...options } = chart.options;
  return {
    options,
    data: {
      ...chart.data,
      series: chart.data.series.map(({ color: _color, ...series }) => series),
    },
  };
}
