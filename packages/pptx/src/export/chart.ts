import type { ChartElement, Color, Frame } from '@slidr/model';
import { CONTENT_TYPE, NS, REL } from '../opc';
import { centipoints, emu } from '../units';
import { el, esc } from '../xml';
import type { ExportContext } from './context';
import { solidFillXml } from './drawing';
import type { PartWriter } from './elements';
import { cultureOf } from './text';
import { columnName, workbook, type Cell } from './xlsx';

/*
 * A chart as a chart of PowerPoint: a chart part with the series and their values cached, and
 * the workbook "Edit Data" opens. The colours are the deck's (each series its own, else the
 * chart's palette, else the theme's), and the text is set in the theme's fonts, as the renderer
 * draws the chart (`chartSpec`).
 */

const CAT_AX = 1001;
const VAL_AX = 1002;

function strCache(values: readonly string[]): string {
  return el(
    'c:strCache',
    {},
    el('c:ptCount', { val: values.length }),
    ...values.map((v, i) => el('c:pt', { idx: i }, `<c:v>${esc(v)}</c:v>`)),
  );
}

function numCache(values: readonly (number | null)[]): string {
  return el(
    'c:numCache',
    {},
    '<c:formatCode>General</c:formatCode>',
    el('c:ptCount', { val: values.length }),
    ...values.map((v, i) =>
      v === null || !Number.isFinite(v) ? undefined : el('c:pt', { idx: i }, `<c:v>${v}</c:v>`),
    ),
  );
}

const range = (col: number, from: number, to: number) =>
  `Sheet1!$${columnName(col)}$${from}:$${columnName(col)}$${to}`;

/** The text properties of a part of the chart: size, colour, weight, the theme's fonts. */
function txPr(
  size: number,
  color: Color,
  options: { bold?: boolean; heading?: boolean; rtl?: boolean } = {},
) {
  const major = options.heading;
  return el(
    'c:txPr',
    {},
    el('a:bodyPr'),
    el('a:lstStyle'),
    el(
      'a:p',
      {},
      el(
        'a:pPr',
        { rtl: options.rtl ? 1 : undefined },
        el(
          'a:defRPr',
          { sz: centipoints(size), b: options.bold ? 1 : 0 },
          solidFillXml(color),
          el('a:latin', { typeface: major ? '+mj-lt' : '+mn-lt' }),
          el('a:ea', { typeface: major ? '+mj-ea' : '+mn-ea' }),
          el('a:cs', { typeface: major ? '+mj-cs' : '+mn-cs' }),
        ),
      ),
      el('a:endParaRPr', { lang: 'en-US' }),
    ),
  );
}

export async function chartXml(
  e: ChartElement,
  ctx: ExportContext,
  part: PartWriter,
  frame: Frame,
  id: number,
): Promise<string> {
  part.shapeIds?.set(e.id, { id, text: false });
  const n = ctx.nextChart();
  const path = `ppt/charts/chart${n}.xml`;
  const { theme, meta } = ctx.deck;
  const rtl = meta.dir === 'rtl';
  const { data, options, chartType } = e;
  const palette: Color[] = options.palette?.length
    ? options.palette
    : theme.colors.chart.map((value) => ({ value }));
  const colorOf = (i: number): Color =>
    data.series[i]?.color ?? palette[i % palette.length] ?? { token: 'primary' };
  const caption = theme.textStyles.caption;
  const body = theme.textStyles.body;
  const ink: Color = { token: 'text' };
  const muted: Color = { token: 'muted' };
  const grid: Color = { token: 'muted', alpha: 0.22 };
  const axisLine: Color = { token: 'muted', alpha: 0.5 };
  const categories = data.categories;
  const last = categories.length + 1;
  const scatter = chartType === 'scatter';

  const labels = options.labels
    ? el(
        'c:dLbls',
        {},
        txPr(caption.size, ink),
        el('c:showLegendKey', { val: 0 }),
        el('c:showVal', { val: 1 }),
        el('c:showCatName', { val: 0 }),
        el('c:showSerName', { val: 0 }),
        el('c:showPercent', { val: 0 }),
        el('c:showBubbleSize', { val: 0 }),
      )
    : el(
        'c:dLbls',
        {},
        el('c:showLegendKey', { val: 0 }),
        el('c:showVal', { val: 0 }),
        el('c:showCatName', { val: 0 }),
        el('c:showSerName', { val: 0 }),
        el('c:showPercent', { val: 0 }),
        el('c:showBubbleSize', { val: 0 }),
      );

  const series = data.series.map((s, i) => {
    const col = i + 1;
    const tx = el(
      'c:tx',
      {},
      el('c:strRef', {}, `<c:f>Sheet1!$${columnName(col)}$1</c:f>`, strCache([s.name])),
    );
    const head = el('c:idx', { val: i }) + el('c:order', { val: i }) + tx;
    const color = colorOf(i);
    const line = chartType === 'line' || chartType === 'radar' || scatter;
    const spPr = line
      ? el('c:spPr', {}, el('a:ln', { w: emu(3), cap: 'rnd' }, solidFillXml(color), el('a:round')))
      : el('c:spPr', {}, solidFillXml(color), el('a:ln', {}, el('a:noFill')));
    const marker = el(
      'c:marker',
      {},
      el('c:symbol', { val: 'circle' }),
      el('c:size', { val: 6 }),
      el('c:spPr', {}, solidFillXml(color), el('a:ln', {}, el('a:noFill'))),
    );
    const cat = el(
      'c:cat',
      {},
      el('c:strRef', {}, `<c:f>${range(0, 2, last)}</c:f>`, strCache(categories)),
    );
    const val = el(
      'c:val',
      {},
      el('c:numRef', {}, `<c:f>${range(col, 2, last)}</c:f>`, numCache(s.values)),
    );
    switch (chartType) {
      case 'column':
      case 'bar':
        return el('c:ser', {}, head, spPr, el('c:invertIfNegative', { val: 0 }), cat, val);
      case 'line':
        return el('c:ser', {}, head, spPr, marker, cat, val, el('c:smooth', { val: 0 }));
      case 'area':
        return el('c:ser', {}, head, spPr, cat, val);
      case 'radar':
        return el('c:ser', {}, head, spPr, marker, cat, val);
      case 'pie':
      case 'donut': {
        // Each slice its own colour: the palette goes round the categories.
        const points = categories.map((_, k) =>
          el(
            'c:dPt',
            {},
            el('c:idx', { val: k }),
            el('c:bubble3D', { val: 0 }),
            el(
              'c:spPr',
              {},
              solidFillXml(palette[k % palette.length] ?? color),
              el('a:ln', { w: emu(2) }, solidFillXml({ token: 'bg' })),
            ),
          ),
        );
        return el('c:ser', {}, head, el('c:explosion', { val: 0 }), ...points, cat, val);
      }
      case 'scatter': {
        const points = s.points ?? s.values.map((v, k) => ({ x: k + 1, y: v ?? 0 }));
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        return el(
          'c:ser',
          {},
          head,
          el('c:spPr', {}, el('a:ln', { w: 19050 }, el('a:noFill'))),
          marker,
          el(
            'c:xVal',
            {},
            el('c:numRef', {}, `<c:f>${range(0, 2, points.length + 1)}</c:f>`, numCache(xs)),
          ),
          el(
            'c:yVal',
            {},
            el('c:numRef', {}, `<c:f>${range(col, 2, points.length + 1)}</c:f>`, numCache(ys)),
          ),
          el('c:smooth', { val: 0 }),
        );
      }
    }
  });

  const axes = options.axes;
  const axisTitle = (title: string | undefined) =>
    title
      ? el(
          'c:title',
          {},
          el(
            'c:tx',
            {},
            el(
              'c:rich',
              {},
              el('a:bodyPr'),
              el('a:lstStyle'),
              el(
                'a:p',
                {},
                el(
                  'a:pPr',
                  {},
                  el('a:defRPr', { sz: centipoints(caption.size), b: 0 }, solidFillXml(muted)),
                ),
                el(
                  'a:r',
                  {},
                  el(
                    'a:rPr',
                    { lang: cultureOf(meta.lang), sz: centipoints(caption.size), b: 0 },
                    solidFillXml(muted),
                  ),
                  `<a:t>${esc(title)}</a:t>`,
                ),
              ),
            ),
          ),
          el('c:overlay', { val: 0 }),
        )
      : undefined;
  const scaling = (axis: { min?: number; max?: number }, reverse: boolean) =>
    el(
      'c:scaling',
      {},
      el('c:orientation', { val: reverse ? 'maxMin' : 'minMax' }),
      axis.max !== undefined ? el('c:max', { val: axis.max }) : undefined,
      axis.min !== undefined ? el('c:min', { val: axis.min }) : undefined,
    );
  const lying = chartType === 'bar';
  const axisSp = el(
    'c:spPr',
    {},
    el('a:noFill'),
    el('a:ln', { w: emu(1) }, solidFillXml(axisLine)),
  );
  const gridLines = el(
    'c:majorGridlines',
    {},
    el('c:spPr', {}, el('a:ln', { w: emu(1) }, solidFillXml(grid))),
  );
  // The renderer mirrors a chart in a right-to-left deck: categories run from the right, the
  // values stand on the right. A lying bar chart lists its categories from the top.
  const reverseCats = lying ? true : rtl;
  const reverseVals = lying && rtl;
  const catAx = el(
    'c:catAx',
    {},
    el('c:axId', { val: CAT_AX }),
    scaling({}, reverseCats),
    el('c:delete', { val: axes.x.show ? 0 : 1 }),
    el('c:axPos', { val: lying ? (rtl ? 'r' : 'l') : 'b' }),
    axes.x.gridLines ? gridLines : undefined,
    axisTitle(axes.x.title),
    el('c:numFmt', { formatCode: 'General', sourceLinked: 1 }),
    el('c:majorTickMark', { val: 'none' }),
    el('c:minorTickMark', { val: 'none' }),
    el('c:tickLblPos', { val: 'nextTo' }),
    axisSp,
    txPr(caption.size, muted),
    el('c:crossAx', { val: VAL_AX }),
    el('c:crosses', { val: 'autoZero' }),
    el('c:auto', { val: 1 }),
    el('c:lblAlgn', { val: 'ctr' }),
    el('c:lblOffset', { val: 100 }),
    el('c:noMultiLvlLbl', { val: 0 }),
  );
  const valAx = (
    axId: number,
    cross: number,
    axis: typeof axes.y,
    position: string,
    reverse: boolean,
    crossesMax: boolean,
  ) =>
    el(
      'c:valAx',
      {},
      el('c:axId', { val: axId }),
      scaling(axis, reverse),
      el('c:delete', { val: axis.show ? 0 : 1 }),
      el('c:axPos', { val: position }),
      axis.gridLines !== false ? gridLines : undefined,
      axisTitle(axis.title),
      el('c:numFmt', { formatCode: 'General', sourceLinked: 1 }),
      el('c:majorTickMark', { val: 'none' }),
      el('c:minorTickMark', { val: 'none' }),
      el('c:tickLblPos', { val: 'nextTo' }),
      el('c:spPr', {}, el('a:noFill'), el('a:ln', {}, el('a:noFill'))),
      txPr(caption.size, muted),
      el('c:crossAx', { val: cross }),
      el('c:crosses', { val: crossesMax ? 'max' : 'autoZero' }),
      el('c:crossBetween', { val: chartType === 'area' || scatter ? 'midCat' : 'between' }),
    );
  const axisIds = el('c:axId', { val: CAT_AX }) + el('c:axId', { val: VAL_AX });
  let plot: string;
  let axesXml: string;
  switch (chartType) {
    case 'column':
    case 'bar':
      plot = el(
        'c:barChart',
        {},
        el('c:barDir', { val: lying ? 'bar' : 'col' }),
        el('c:grouping', { val: 'clustered' }),
        el('c:varyColors', { val: 0 }),
        ...series,
        labels,
        el('c:gapWidth', { val: 60 }),
        el('c:overlap', { val: -10 }),
        axisIds,
      );
      // A lying chart's values run along the bottom, from the side its categories start on.
      axesXml =
        catAx + valAx(VAL_AX, CAT_AX, axes.y, lying ? 'b' : rtl ? 'r' : 'l', reverseVals, lying);
      break;
    case 'line':
      plot = el(
        'c:lineChart',
        {},
        el('c:grouping', { val: 'standard' }),
        el('c:varyColors', { val: 0 }),
        ...series,
        labels,
        el('c:marker', { val: 1 }),
        axisIds,
      );
      axesXml = catAx + valAx(VAL_AX, CAT_AX, axes.y, rtl ? 'r' : 'l', false, false);
      break;
    case 'area':
      plot = el(
        'c:areaChart',
        {},
        el('c:grouping', { val: 'standard' }),
        el('c:varyColors', { val: 0 }),
        ...series,
        labels,
        axisIds,
      );
      axesXml = catAx + valAx(VAL_AX, CAT_AX, axes.y, rtl ? 'r' : 'l', false, false);
      break;
    case 'radar':
      plot = el(
        'c:radarChart',
        {},
        el('c:radarStyle', { val: 'marker' }),
        el('c:varyColors', { val: 0 }),
        ...series,
        labels,
        axisIds,
      );
      axesXml = catAx + valAx(VAL_AX, CAT_AX, axes.y, 'l', false, false);
      break;
    case 'pie':
      plot = el(
        'c:pieChart',
        {},
        el('c:varyColors', { val: 1 }),
        ...series.slice(0, 1),
        labels,
        el('c:firstSliceAng', { val: 0 }),
      );
      axesXml = '';
      break;
    case 'donut':
      plot = el(
        'c:doughnutChart',
        {},
        el('c:varyColors', { val: 1 }),
        ...series.slice(0, 1),
        labels,
        el('c:firstSliceAng', { val: 0 }),
        el('c:holeSize', { val: 55 }),
      );
      axesXml = '';
      break;
    case 'scatter':
      plot = el(
        'c:scatterChart',
        {},
        el('c:scatterStyle', { val: 'lineMarker' }),
        el('c:varyColors', { val: 0 }),
        ...series,
        labels,
        axisIds,
      );
      axesXml =
        valAx(CAT_AX, VAL_AX, axes.x, 'b', false, false) +
        valAx(VAL_AX, CAT_AX, axes.y, 'l', false, false);
      break;
  }

  const legendPos = (() => {
    const p = options.legend.position;
    if (p === 'top') return 't';
    if (p === 'bottom') return 'b';
    return (p === 'start') === rtl ? 'r' : 'l';
  })();
  const title = options.title
    ? el(
        'c:title',
        {},
        el(
          'c:tx',
          {},
          el(
            'c:rich',
            {},
            el('a:bodyPr'),
            el('a:lstStyle'),
            el(
              'a:p',
              {},
              el(
                'a:pPr',
                { rtl: rtl ? 1 : undefined },
                el(
                  'a:defRPr',
                  { sz: centipoints(body.size), b: theme.textStyles.heading.weight >= 600 ? 1 : 0 },
                  solidFillXml(ink),
                  el('a:latin', { typeface: '+mj-lt' }),
                  el('a:cs', { typeface: '+mj-cs' }),
                ),
              ),
              el(
                'a:r',
                {},
                el(
                  'a:rPr',
                  {
                    lang: cultureOf(meta.lang),
                    sz: centipoints(body.size),
                    b: theme.textStyles.heading.weight >= 600 ? 1 : 0,
                  },
                  solidFillXml(ink),
                  el('a:latin', { typeface: '+mj-lt' }),
                  el('a:cs', { typeface: '+mj-cs' }),
                ),
                `<a:t>${esc(options.title)}</a:t>`,
              ),
            ),
          ),
        ),
        el('c:overlay', { val: 0 }),
      )
    : el('c:autoTitleDeleted', { val: 1 });

  const chart = el(
    'c:chartSpace',
    { 'xmlns:c': NS.c, 'xmlns:a': NS.a, 'xmlns:r': NS.r },
    el('c:date1904', { val: 0 }),
    el('c:lang', { val: cultureOf(meta.lang) }),
    el('c:roundedCorners', { val: 0 }),
    el(
      'c:chart',
      {},
      title,
      el('c:plotArea', {}, el('c:layout'), plot, axesXml),
      options.legend.show
        ? el(
            'c:legend',
            {},
            el('c:legendPos', { val: legendPos }),
            el('c:overlay', { val: 0 }),
            txPr(caption.size, muted, { rtl }),
          )
        : undefined,
      el('c:plotVisOnly', { val: 1 }),
      el('c:dispBlanksAs', { val: 'gap' }),
    ),
    el('c:spPr', {}, el('a:noFill'), el('a:ln', {}, el('a:noFill'))),
    txPr(caption.size, muted, { rtl }),
    el('c:externalData', { 'r:id': 'rId1' }, el('c:autoUpdate', { val: 0 })),
  );

  // The workbook "Edit Data" opens: the categories in column A, a series in each column after.
  const rows: Cell[][] = [];
  if (scatter) {
    const longest = Math.max(0, ...data.series.map((s) => (s.points ?? s.values).length));
    rows.push(['X', ...data.series.map((s) => s.name)]);
    for (let k = 0; k < longest; k++) {
      const first = data.series[0];
      const x = first?.points?.[k]?.x ?? k + 1;
      rows.push([x, ...data.series.map((s) => s.points?.[k]?.y ?? s.values[k] ?? null)]);
    }
  } else {
    rows.push(['', ...data.series.map((s) => s.name)]);
    categories.forEach((category, k) => {
      rows.push([category, ...data.series.map((s) => s.values[k] ?? null)]);
    });
  }
  const book = `ppt/embeddings/Microsoft_Excel_Worksheet${n}.xlsx`;
  ctx.pkg.binary(book, await workbook(rows), CONTENT_TYPE.xlsx);
  ctx.pkg.rels(path).add(REL.package, book);
  ctx.pkg.xml(path, chart, CONTENT_TYPE.chart);

  const rel = part.rels.add(REL.chart, path);
  return el(
    'p:graphicFrame',
    {},
    el(
      'p:nvGraphicFramePr',
      {},
      el('p:cNvPr', { id, name: e.name ?? `Chart ${id - 1}`, hidden: e.hidden ? 1 : undefined }),
      el('p:cNvGraphicFramePr'),
      el('p:nvPr'),
    ),
    el(
      'p:xfrm',
      {},
      el('a:off', { x: emu(frame.x), y: emu(frame.y) }),
      el('a:ext', { cx: emu(frame.w), cy: emu(frame.h) }),
    ),
    el(
      'a:graphic',
      {},
      el('a:graphicData', { uri: NS.c }, el('c:chart', { 'xmlns:c': NS.c, 'r:id': rel })),
    ),
  );
}
