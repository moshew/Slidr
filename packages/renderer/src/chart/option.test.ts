import { createBaseTheme, createElement, type ChartElement } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { chartGlyphs, chartOption, label, numberFormat, roundUp, type ChartOption } from './option';
import { chartSpec, fade, type ChartSpec } from './spec';

const RLI = String.fromCodePoint(0x2067);
const PDI = String.fromCodePoint(0x2069);

const theme = createBaseTheme();

function chart(init: Partial<ChartElement> = {}): ChartElement {
  return createElement.chart({
    id: 'c',
    frame: { x: 0, y: 0, w: 900, h: 500 },
    chartType: 'column',
    data: {
      categories: ['Q1', 'Q2', 'Q3'],
      series: [
        { name: 'Revenue', values: [10, 20, null] },
        { name: 'Costs', values: [5, 8, 12] },
      ],
    },
    ...init,
  });
}

const spec = (init: Partial<ChartElement> = {}, dir: 'rtl' | 'ltr' = 'ltr'): ChartSpec =>
  chartSpec(chart(init), { theme, dir, lang: dir === 'rtl' ? 'he' : 'en' });

const still = { live: false };
type Part = Record<string, unknown>;
const part = (option: ChartOption, key: string) => option[key] as Part;
const series = (option: ChartOption) => option.series as Part[];

describe('chartSpec', () => {
  it('takes the series colours from the theme, and from the chart when it has its own', () => {
    expect(spec().palette).toEqual(theme.colors.chart);
    const own = spec({
      options: {
        ...chart().options,
        palette: [{ token: 'accent' }, { value: '#102030', alpha: 0.5 }],
      },
    });
    expect(own.palette).toEqual([theme.colors.accent, 'rgba(16, 32, 48, 0.5)']);
  });

  it('writes colours out as literals: an SVG attribute resolves no variable', () => {
    const s = spec({
      data: {
        categories: ['a'],
        series: [{ name: 's', values: [1], color: { token: 'secondary' } }],
      },
    });
    expect(s.series[0]?.color).toBe(theme.colors.secondary);
    expect(JSON.stringify(s)).not.toContain('var(');
  });

  it('is plain data, so an exported file can carry it', () => {
    const s = spec();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('fades a colour it can read, and leaves the rest to the browser', () => {
    expect(fade('#fff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(fade('rgb(1, 2, 3)', 0.25)).toBe('rgba(1, 2, 3, 0.25)');
    expect(fade('oklch(0.7 0.1 200)', 0.5)).toBe(
      'color-mix(in srgb, oklch(0.7 0.1 200) 50%, transparent)',
    );
    expect(fade('#123456', 1)).toBe('#123456');
    expect(fade('#123456', 0)).toBe('transparent');
  });
});

describe('chartOption', () => {
  it('draws each of the eight chart types with the series type that fits it', () => {
    const types = {
      column: 'bar',
      bar: 'bar',
      line: 'line',
      area: 'line',
      pie: 'pie',
      donut: 'pie',
      scatter: 'scatter',
      radar: 'radar',
    } as const;
    for (const [chartType, type] of Object.entries(types)) {
      const option = chartOption(
        spec({ chartType: chartType as ChartElement['chartType'] }),
        still,
      );
      expect(series(option)[0]?.type, chartType).toBe(type);
    }
  });

  it('is the same option for the same spec', () => {
    const json = (o: ChartOption) =>
      JSON.stringify(o, (_, v: unknown) => (typeof v === 'function' ? 'fn' : v));
    expect(json(chartOption(spec(), still))).toBe(json(chartOption(spec(), still)));
  });

  it('gives a gap for a value that is missing, and the series their colours', () => {
    const [revenue, costs] = series(chartOption(spec(), still));
    expect(revenue?.data).toEqual([10, 20, '-']);
    expect((revenue?.itemStyle as Part).color).toBe(theme.colors.chart[0]);
    expect((costs?.itemStyle as Part).color).toBe(theme.colors.chart[1]);
  });

  it('lays a bar chart on its side, with the first category on top', () => {
    const option = chartOption(spec({ chartType: 'bar' }), still);
    expect(part(option, 'yAxis')).toMatchObject({ type: 'category', inverse: true });
    expect(part(option, 'xAxis')).toMatchObject({ type: 'value' });
  });

  it('runs the categories from the right in a right-to-left deck, with the values on the right', () => {
    const column = chartOption(spec({}, 'rtl'), still);
    expect(part(column, 'xAxis')).toMatchObject({ type: 'category', inverse: true });
    expect(part(column, 'yAxis')).toMatchObject({ position: 'right' });
    const bar = chartOption(spec({ chartType: 'bar' }, 'rtl'), still);
    expect(part(bar, 'xAxis')).toMatchObject({ type: 'value', inverse: true });
    expect(part(bar, 'yAxis')).toMatchObject({ position: 'right' });
    const ltr = chartOption(spec(), still);
    expect(part(ltr, 'xAxis')).toMatchObject({ inverse: false });
    expect(part(ltr, 'yAxis')).toMatchObject({ position: 'left' });
  });

  it('keeps a scatter chart left to right in every deck: a plane of numbers', () => {
    const option = chartOption(spec({ chartType: 'scatter' }, 'rtl'), still);
    expect(part(option, 'xAxis').inverse).toBeUndefined();
    expect(part(option, 'yAxis')).toMatchObject({ position: 'left' });
  });

  it('reads the points of a scatter series from its values when it has none of its own', () => {
    const numeric = spec({
      chartType: 'scatter',
      data: { categories: ['1', '2.5', '1,000'], series: [{ name: 's', values: [3, null, 9] }] },
    });
    expect(series(chartOption(numeric, still))[0]?.data).toEqual([
      [1, 3],
      [1000, 9],
    ]);
    const named = spec({
      chartType: 'scatter',
      data: { categories: ['a', 'b'], series: [{ name: 's', values: [3, 4] }] },
    });
    expect(series(chartOption(named, still))[0]?.data).toEqual([
      [1, 3],
      [2, 4],
    ]);
    const own = spec({
      chartType: 'scatter',
      data: { categories: [], series: [{ name: 's', values: [], points: [{ x: 7, y: 8 }] }] },
    });
    expect(series(chartOption(own, still))[0]?.data).toEqual([[7, 8]]);
  });

  it('shows one series as a pie, and every series of a donut as a ring', () => {
    const pie = series(chartOption(spec({ chartType: 'pie' }), still));
    expect(pie).toHaveLength(1);
    expect((pie[0]?.data as Part[]).map((d) => d.name)).toEqual(['Q1', 'Q2', 'Q3']);
    // A slice has no size below nothing.
    expect((pie[0]?.data as Part[]).map((d) => d.value)).toEqual([10, 20, 0]);
    const donut = series(chartOption(spec({ chartType: 'donut' }), still));
    expect(donut).toHaveLength(2);
    const [inner, outer] = donut.map((ring) => ring.radius as [number, number]);
    expect(inner?.[0]).toBeGreaterThan(0);
    expect(outer?.[0]).toBeCloseTo(inner?.[1] ?? 0);
  });

  it('gives every spoke of a radar one scale', () => {
    const option = chartOption(spec({ chartType: 'radar' }), still);
    const indicator = part(option, 'radar').indicator as Part[];
    expect(indicator.map((i) => i.max)).toEqual([20, 20, 20]);
    expect(part(option, 'radar').clockwise).toBe(true);
    expect(part(chartOption(spec({ chartType: 'radar' }, 'rtl'), still), 'radar').clockwise).toBe(
      false,
    );
  });

  it('follows the options: title, legend, axes, labels, grid lines', () => {
    const base = chart().options;
    const option = chartOption(
      spec({
        options: {
          ...base,
          title: 'Sales',
          legend: { show: false, position: 'bottom' },
          labels: true,
          axes: {
            x: { show: false, gridLines: true },
            y: { show: true, title: 'USD', min: 0, max: 50, gridLines: false },
          },
        },
      }),
      still,
    );
    expect(part(option, 'title').text).toBe('Sales');
    expect(part(option, 'legend').show).toBe(false);
    expect((series(option)[0]?.label as Part).show).toBe(true);
    const x = part(option, 'xAxis');
    expect((x.axisLabel as Part).show).toBe(false);
    expect((x.splitLine as Part).show).toBe(true);
    const y = part(option, 'yAxis');
    expect(y).toMatchObject({ min: 0, max: 50, name: 'USD' });
    expect((y.splitLine as Part).show).toBe(false);
    expect(chartOption(spec(), still).title).toBeUndefined();
  });

  it('puts the legend where the options say, on the side the deck starts from', () => {
    const at = (position: ChartElement['options']['legend']['position'], dir: 'rtl' | 'ltr') =>
      part(
        chartOption(
          spec({ options: { ...chart().options, legend: { show: true, position } } }, dir),
          still,
        ),
        'legend',
      );
    expect(at('top', 'ltr')).toMatchObject({ orient: 'horizontal', left: 'center' });
    expect(at('bottom', 'ltr').bottom).toBeGreaterThan(0);
    expect(at('start', 'ltr').left).toBeGreaterThan(0);
    expect(at('start', 'rtl').right).toBeGreaterThan(0);
    expect(at('end', 'rtl').left).toBeGreaterThan(0);
    // In a right-to-left deck the first series is the rightmost, and its mark is on its right.
    expect(at('bottom', 'rtl')).toMatchObject({ data: ['Costs', 'Revenue'], align: 'right' });
    expect(at('bottom', 'ltr')).toMatchObject({ data: ['Revenue', 'Costs'], align: 'left' });
  });

  it('leaves the plot what the title and the legend do not take', () => {
    const plain = part(
      chartOption(
        spec({ options: { ...chart().options, legend: { show: false, position: 'bottom' } } }),
        still,
      ),
      'grid',
    );
    const titled = part(
      chartOption(
        spec({
          options: { ...chart().options, title: 'T', legend: { show: true, position: 'bottom' } },
        }),
        still,
      ),
      'grid',
    );
    expect(titled.top).toBeGreaterThan(plain.top as number);
    expect(titled.bottom).toBeGreaterThan(plain.bottom as number);
  });

  it('is still in the editor: no animation, no tooltip, nothing under the pointer', () => {
    const option = chartOption(spec(), still);
    expect(option.animation).toBe(false);
    expect(part(option, 'tooltip').show).toBe(false);
    expect(series(option).every((s) => s.silent === true)).toBe(true);
  });

  it('is live in a show, and builds when it is told to', () => {
    const rest = chartOption(spec(), { live: true });
    expect(rest.animation).toBe(false);
    expect(part(rest, 'tooltip')).toMatchObject({ show: true, trigger: 'axis', confine: true });
    expect(series(rest).every((s) => s.silent === false)).toBe(true);
    // A click on the slide moves the show on: it does not hide a series as well.
    expect(part(rest, 'legend').selectedMode).toBe(false);
    const building = chartOption(spec(), { live: true, build: { delay: 250, duration: 700 } });
    expect(building).toMatchObject({
      animation: true,
      animationDelay: 250,
      animationDuration: 700,
    });
  });

  it('writes a tooltip in the direction of the deck, with every text escaped', () => {
    const option = chartOption(
      spec(
        { data: { categories: ['<b>Q1</b>'], series: [{ name: 'A & B', values: [1234.5] }] } },
        'rtl',
      ),
      { live: true },
    );
    const tooltip = part(option, 'tooltip');
    expect(tooltip.extraCssText).toContain('direction:rtl');
    const format = tooltip.formatter as (params: unknown) => string;
    const html = format([
      { name: '<b>Q1</b>', seriesName: 'A & B', color: '#123456', value: 1234.5 },
    ]);
    expect(html).toContain('&lt;b&gt;Q1&lt;/b&gt;');
    expect(html).toContain('A &amp; B');
    expect(html).toContain('<span dir="ltr"');
    expect(html).toContain('1,234.5');
    expect(html).not.toContain('<b>');
  });
});

describe('labels', () => {
  it('isolates a label that starts with a right-to-left letter, and leaves the rest alone', () => {
    expect(label('מכירות Q1')).toBe(`${RLI}מכירות Q1${PDI}`);
    expect(label('2026 (תחזית)')).toBe(`${RLI}2026 (תחזית)${PDI}`);
    expect(label('Online (חדש)')).toBe('Online (חדש)');
    expect(label('+4%')).toBe('+4%');
    expect(label('')).toBe('');
  });

  it('writes numbers as the language of the deck does, with two decimals at most', () => {
    expect(numberFormat('en')(1234.567)).toBe('1,234.57');
    expect(numberFormat('he')(-1250.5)).toContain('1,250.5');
    expect(numberFormat('de')(1234.5)).toBe('1.234,5');
    // A language the browser does not know falls back, and does not throw.
    expect(numberFormat('not a language')(2)).toBe('2');
  });

  it('lists every sign a live chart may show: its texts, the digits and the signs of a number', () => {
    const glyphs = chartGlyphs(spec({ options: { ...chart().options, title: 'Sales' } }));
    for (const sign of 'SalesRevenueCostsQ1230123456789.,-%') expect(glyphs).toContain(sign);
  });

  it('rounds a value up to a number that reads well on an axis', () => {
    expect([0, 7, 18.5, 92, 250, 2600].map(roundUp)).toEqual([1, 10, 20, 100, 250, 5000]);
  });
});

describe('what is written around a chart', () => {
  it('ends a right-aligned title at the right edge, and starts a left-aligned one at the left', () => {
    const titled = (dir: 'rtl' | 'ltr') =>
      part(chartOption(spec({ options: { ...chart().options, title: 'T' } }, dir), still), 'title');
    // With an alignment of its own the library reads `left` as the point the text is aligned at.
    expect(titled('ltr')).toMatchObject({ textAlign: 'left' });
    expect(titled('ltr').left).toBeLessThan(20);
    expect(titled('rtl')).toMatchObject({ textAlign: 'right' });
    expect(titled('rtl').left).toBeGreaterThan(880);
    expect(titled('rtl').right).toBeUndefined();
  });

  it('names the slices beside a pie that has no legend, and only their shares beside one that has', () => {
    const pie = (legend: boolean) =>
      series(
        chartOption(
          spec({
            chartType: 'pie',
            options: {
              ...chart().options,
              labels: true,
              legend: { show: legend, position: 'bottom' },
            },
          }),
          still,
        ),
      )[0]!;
    const text = (legend: boolean) =>
      ((pie(legend).label as Part).formatter as (p: unknown) => string)({
        dataIndex: 1,
        percent: 67,
      });
    expect(text(true)).toBe('67%');
    expect(text(false)).toBe('Q2 67%');
    // The names take room beside the circle: it is smaller.
    const radius = (legend: boolean) => (pie(legend).radius as [number, number])[1];
    expect((pie(false).label as Part).overflow).toBe('none');
    expect(radius(false)).toBeGreaterThan(50);
  });

  it('does not let a few columns in a wide chart stand as thin posts', () => {
    const wide = chartOption(spec({ frame: { x: 0, y: 0, w: 1700, h: 600 } }), still);
    const narrow = chartOption(spec({ frame: { x: 0, y: 0, w: 500, h: 400 } }), still);
    expect(series(wide)[0]?.barMaxWidth).toBeGreaterThan(series(narrow)[0]?.barMaxWidth as number);
  });
});

describe('a chart on a dark slide', () => {
  const source = { ...chart(), frame: { w: 900, h: 500 } };
  const ctx = { theme, dir: 'ltr' as const, lang: 'en' };

  it('takes the colour of its box for its text and lines, in place of the theme text colours', () => {
    const plain = chartSpec(source, ctx);
    expect(plain.colors.text).toBe(theme.colors.text);
    expect(plain.colors.muted).toBe(theme.colors.muted);
    const light = chartSpec({ ...source, ink: '#ffffff' }, ctx);
    expect(light.colors.text).toBe('#ffffff');
    expect(light.colors.muted).toBe('rgba(255, 255, 255, 0.78)');
    expect(light.colors.grid).toBe('rgba(255, 255, 255, 0.22)');
    // The series keep the palette.
    expect(light.palette).toEqual(plain.palette);
  });

  it('reads a theme variable as the theme has it: an SVG attribute resolves none', () => {
    expect(chartSpec({ ...source, ink: 'var(--color-bg)' }, ctx).colors.text).toBe(theme.colors.bg);
    expect(chartSpec({ ...source, ink: 'var(--color-chart-2)' }, ctx).colors.text).toBe(
      theme.colors.chart[1],
    );
    expect(chartSpec({ ...source, ink: 'var(--other)' }, ctx).colors.text).toBe('var(--other)');
  });
});
