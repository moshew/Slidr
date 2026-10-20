import {
  createElement,
  type ChartElement,
  type ChartType,
  type Color,
  type Element,
} from '@slidr/model';
import { attr, child, children, descendants, intAttr, path, textOf, type XmlElement } from '../xml';
import { readColor } from './drawing';
import type { PartContext } from './shapes';

/*
 * A chart of PowerPoint as a chart of Slidr: its type, its series with the values the chart part
 * caches, its colours, title, legend, axes and labels. What Slidr draws otherwise (a stacked or a
 * 3-D chart, two types in one) comes in as the nearest it has, with a warning.
 */

const TYPES: Record<string, ChartType> = {
  'c:barChart': 'column',
  'c:bar3DChart': 'column',
  'c:lineChart': 'line',
  'c:line3DChart': 'line',
  'c:stockChart': 'line',
  'c:areaChart': 'area',
  'c:area3DChart': 'area',
  'c:pieChart': 'pie',
  'c:pie3DChart': 'pie',
  'c:ofPieChart': 'pie',
  'c:doughnutChart': 'donut',
  'c:scatterChart': 'scatter',
  'c:bubbleChart': 'scatter',
  'c:radarChart': 'radar',
  'c:surfaceChart': 'area',
  'c:surface3DChart': 'area',
};

/** The points of a cache (`c:strCache`, `c:numCache`, or a literal), by index. */
function points(el: XmlElement | undefined): { count: number; values: Map<number, string> } {
  const ref = child(el, 'c:strRef', 'c:numRef');
  const multi = path(el, 'c:multiLvlStrRef', 'c:multiLvlStrCache');
  const cache = ref
    ? child(ref, 'c:strCache', 'c:numCache')
    : (multi ?? child(el, 'c:strLit', 'c:numLit'));
  // Categories of several levels: the innermost one names each point.
  const source = multi ? children(multi, 'c:lvl')[0] : cache;
  const values = new Map<number, string>();
  for (const pt of children(source, 'c:pt')) {
    values.set(intAttr(pt, 'idx') ?? 0, textOf(child(pt, 'c:v')));
  }
  const count =
    intAttr(child(cache, 'c:ptCount'), 'val') ?? (values.size ? Math.max(...values.keys()) + 1 : 0);
  return { count, values };
}

function seriesName(ser: XmlElement): string {
  const tx = child(ser, 'c:tx');
  const cached = points(tx).values.get(0);
  return (cached ?? textOf(child(tx, 'c:v'))).trim();
}

/** The colour of a series: its fill, or its line for a chart of lines. */
function seriesColor(ser: XmlElement, ctx: PartContext): Color | undefined {
  const spPr = child(ser, 'c:spPr');
  const fill = child(spPr, 'a:solidFill');
  const line = path(spPr, 'a:ln', 'a:solidFill');
  return readColor(fill ?? line, ctx.colors)?.color;
}

function richText(el: XmlElement | undefined): string | undefined {
  const rich = path(el, 'c:tx', 'c:rich');
  if (rich) {
    const text = children(rich, 'a:p')
      .map((p) => descendants(p, 'a:t').map(textOf).join(''))
      .join(' ')
      .trim();
    return text || undefined;
  }
  const ref = path(el, 'c:tx', 'c:strRef');
  return ref ? points(child(el, 'c:tx')).values.get(0) : undefined;
}

const number = (text: string | undefined): number | null => {
  if (text === undefined || text.trim() === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

export async function readChart(
  partPath: string,
  common: Omit<Element, 'type'>,
  ctx: PartContext,
): Promise<Element | undefined> {
  const space = await ctx.importer.pkg.xml(partPath);
  const chart = child(space, 'c:chart');
  const plot = child(chart, 'c:plotArea');
  if (!plot) {
    ctx.importer.warn('broken-part', ctx.slide, partPath);
    return undefined;
  }
  const typed = children(plot).filter((c) => TYPES[c.name]);
  const first = typed[0];
  if (!first) {
    ctx.importer.warn('chart-approximated', ctx.slide, 'chart');
    return undefined;
  }
  let chartType = TYPES[first.name]!;
  if (first.name === 'c:barChart' || first.name === 'c:bar3DChart') {
    chartType = attr(child(first, 'c:barDir'), 'val') === 'bar' ? 'bar' : 'column';
  }
  const grouping = attr(child(first, 'c:grouping'), 'val') ?? 'standard';
  if (
    typed.length > 1 ||
    /3D|stock|surface|bubble|ofPie/.test(first.name) ||
    /stacked/i.test(grouping)
  ) {
    ctx.importer.warn('chart-approximated', ctx.slide, first.name.replace('c:', ''));
  }
  const series = children(first, 'c:ser');
  const scatter = chartType === 'scatter';
  let categories: string[] = [];
  const out: ChartElement['data']['series'] = [];
  const pie = chartType === 'pie' || chartType === 'donut';
  for (const ser of pie ? series.slice(0, 1) : series) {
    if (scatter) {
      const xs = points(child(ser, 'c:xVal'));
      const ys = points(child(ser, 'c:yVal'));
      const n = Math.max(xs.count, ys.count);
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < n; i++) {
        const y = number(ys.values.get(i));
        if (y === null) continue;
        pts.push({ x: number(xs.values.get(i)) ?? i + 1, y });
      }
      const color = seriesColor(ser, ctx);
      out.push({
        name: seriesName(ser),
        values: pts.map((p) => p.y),
        points: pts,
        ...(color ? { color } : {}),
      });
      continue;
    }
    const cats = points(child(ser, 'c:cat'));
    const vals = points(child(ser, 'c:val'));
    const n = Math.max(cats.count, vals.count);
    if (categories.length < n) {
      categories = Array.from(
        { length: n },
        (_, i) => cats.values.get(i) ?? categories[i] ?? String(i + 1),
      );
    }
    const color = pie ? undefined : seriesColor(ser, ctx);
    out.push({
      name: seriesName(ser),
      values: Array.from({ length: n }, (_, i) => number(vals.values.get(i))),
      ...(color ? { color } : {}),
    });
  }
  if (scatter) categories = (out[0]?.points ?? []).map((p) => String(p.x));
  // The slices of a pie: each its own colour, which is the chart's palette in the model.
  let palette: Color[] | undefined;
  if (pie && series[0]) {
    const dPts = children(series[0], 'c:dPt');
    if (dPts.length) {
      const colors = new Map<number, Color>();
      for (const d of dPts) {
        const c = readColor(path(d, 'c:spPr', 'a:solidFill'), ctx.colors)?.color;
        if (c) colors.set(intAttr(child(d, 'c:idx'), 'val') ?? 0, c);
      }
      if (colors.size) {
        const fallback = ctx.importer.deckTheme.colors.chart;
        palette = categories.map(
          (_, i) => colors.get(i) ?? { value: fallback[i % fallback.length] ?? '#888888' },
        );
      }
    }
  }
  const autoTitleDeleted = attr(child(chart, 'c:autoTitleDeleted'), 'val') === '1';
  const title = child(chart, 'c:title')
    ? (richText(child(chart, 'c:title')) ??
      (out.length === 1 && !autoTitleDeleted ? out[0]?.name : undefined))
    : undefined;
  const legend = child(chart, 'c:legend');
  const legendPos = attr(child(legend, 'c:legendPos'), 'val') ?? 'r';
  const rtl = ctx.importer.rtl;
  const position =
    legendPos === 't'
      ? 'top'
      : legendPos === 'b'
        ? 'bottom'
        : (legendPos === 'l') !== rtl
          ? 'start'
          : 'end';
  const catAx = child(plot, 'c:catAx', 'c:dateAx') ?? children(plot, 'c:valAx')[scatter ? 0 : 1];
  const valAx = scatter ? children(plot, 'c:valAx')[1] : child(plot, 'c:valAx');
  const axis = (ax: XmlElement | undefined) => {
    const scaling = child(ax, 'c:scaling');
    const min = intAttrNum(child(scaling, 'c:min'));
    const max = intAttrNum(child(scaling, 'c:max'));
    const axisTitle = richText(child(ax, 'c:title'));
    return {
      show: attr(child(ax, 'c:delete'), 'val') !== '1' && ax !== undefined,
      ...(axisTitle ? { title: axisTitle } : {}),
      ...(min !== undefined ? { min } : {}),
      ...(max !== undefined ? { max } : {}),
      gridLines: child(ax, 'c:majorGridlines') !== undefined,
    };
  };
  const labels = descendants(first, 'c:showVal').some((s) => attr(s, 'val') === '1');
  return createElement.chart({
    ...common,
    chartType,
    data: { categories, series: out },
    options: {
      ...(title ? { title } : {}),
      legend: { show: legend !== undefined, position },
      axes: { x: axis(catAx), y: axis(valAx) },
      labels,
      ...(palette ? { palette } : {}),
    },
  });
}

function intAttrNum(el: XmlElement | undefined): number | undefined {
  const v = attr(el, 'val');
  if (v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
