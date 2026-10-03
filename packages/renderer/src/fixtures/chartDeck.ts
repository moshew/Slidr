import {
  createDeck,
  createElement,
  createSlide,
  type AnimationStep,
  type ChartElement,
  type Deck,
  type Direction,
} from '@slidr/model';

/**
 * The eight chart types (CHT-01) on two slides, in a left-to-right and in a right-to-left deck:
 * what the chart regression pictures, and what the five uses of the renderer are compared on.
 * A third slide holds one chart with an entrance step, and a fourth one chart without, for the
 * runtime (CHT-08).
 */
type Words = Record<
  | 'revenue'
  | 'costs'
  | 'profit'
  | 'quarter'
  | 'byQuarter'
  | 'millions'
  | 'share'
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'online'
  | 'growth'
  | 'forecast'
  | 'teams'
  | 'speed'
  | 'quality'
  | 'price'
  | 'service'
  | 'design'
  | 'ours'
  | 'theirs'
  | 'adSpend'
  | 'sales',
  string
>;

const english: Words = {
  revenue: 'Revenue',
  costs: 'Costs',
  profit: 'Profit',
  quarter: 'Quarter',
  byQuarter: 'Revenue and costs by quarter',
  millions: 'USD (millions)',
  share: 'Share of sales by region',
  north: 'North',
  south: 'South',
  east: 'East',
  west: 'West',
  online: 'Online (new)',
  growth: 'Growth since 2022',
  forecast: '2026 (forecast)',
  teams: 'Product against the market',
  speed: 'Speed',
  quality: 'Quality',
  price: 'Price',
  service: 'Service',
  design: 'Design',
  ours: 'Ours',
  theirs: 'Market average',
  adSpend: 'Ad spend against sales',
  sales: 'Sales',
};

const hebrew: Words = {
  revenue: 'הכנסות',
  costs: 'הוצאות',
  profit: 'רווח',
  quarter: 'רבעון',
  byQuarter: 'הכנסות והוצאות לפי רבעון',
  millions: 'מיליוני ש"ח',
  share: 'נתח מכירות לפי אזור',
  north: 'צפון',
  south: 'דרום',
  east: 'מזרח',
  west: 'מערב',
  online: 'Online (חדש)',
  growth: 'צמיחה מאז 2022',
  forecast: '2026 (תחזית)',
  teams: 'המוצר מול השוק',
  speed: 'מהירות',
  quality: 'איכות',
  price: 'מחיר',
  service: 'שירות',
  design: 'עיצוב',
  ours: 'שלנו',
  theirs: 'ממוצע בשוק',
  adSpend: 'פרסום מול מכירות',
  sales: 'מכירות',
};

const CELLS = [
  { x: 48, y: 40 },
  { x: 984, y: 40 },
  { x: 48, y: 556 },
  { x: 984, y: 556 },
];
const SIZE = { w: 888, h: 484 };

type ChartInit = Pick<ChartElement, 'chartType' | 'data'> & {
  options?: Partial<ChartElement['options']>;
};

function chart(id: string, cell: number, init: ChartInit): ChartElement {
  const base = createElement.chart({
    id,
    frame: { ...(CELLS[cell] as { x: number; y: number }), ...SIZE },
    chartType: init.chartType,
    data: init.data,
  });
  return { ...base, options: { ...base.options, ...init.options } };
}

const quarters = (t: Words) => ['Q1', 'Q2', 'Q3', `${t.quarter} 4`];

function cartesianSlide(t: Words, id: string) {
  const twoSeries = {
    categories: quarters(t),
    series: [
      { name: t.revenue, values: [12, 18.5, 16, 24] },
      { name: t.costs, values: [9, 11, 12.5, 14] },
    ],
  };
  return createSlide({
    id,
    name: 'Column, bar, line, area',
    elements: [
      chart('e_chart_column', 0, {
        chartType: 'column',
        data: twoSeries,
        options: {
          title: t.byQuarter,
          labels: true,
          axes: { x: { show: true }, y: { show: true, title: t.millions } },
        },
      }),
      chart('e_chart_bar', 1, {
        chartType: 'bar',
        data: {
          categories: [t.north, t.south, t.east, t.online],
          series: [{ name: t.sales, values: [42, 31, 27, 1250.5] }],
        },
        options: { legend: { show: false, position: 'bottom' }, labels: true },
      }),
      chart('e_chart_line', 2, {
        chartType: 'line',
        data: {
          categories: ['2022', '2023', '2024', '2025', t.forecast],
          series: [
            { name: t.revenue, values: [40, 52, 61, 78, 96] },
            { name: t.profit, values: [-6, 2, null, 14, 21], color: { token: 'accent' } },
          ],
        },
        options: { title: t.growth, legend: { show: true, position: 'top' } },
      }),
      chart('e_chart_area', 3, {
        chartType: 'area',
        data: twoSeries,
        options: {
          legend: { show: true, position: 'end' },
          axes: { x: { show: true, title: t.quarter }, y: { show: true, gridLines: false } },
        },
      }),
    ],
  });
}

function roundSlide(t: Words, id: string) {
  const regions = {
    categories: [t.north, t.south, t.east, t.west, t.online],
    series: [{ name: t.sales, values: [38, 24, 17, 12, 9] }],
  };
  return createSlide({
    id,
    name: 'Pie, donut, scatter, radar',
    elements: [
      chart('e_chart_pie', 0, {
        chartType: 'pie',
        data: regions,
        options: { title: t.share, legend: { show: true, position: 'start' }, labels: true },
      }),
      chart('e_chart_donut', 1, {
        chartType: 'donut',
        data: regions,
        options: {
          palette: [
            { token: 'primary' },
            { token: 'primary', alpha: 0.7 },
            { token: 'secondary' },
            { token: 'secondary', alpha: 0.6 },
            { token: 'accent' },
          ],
        },
      }),
      chart('e_chart_scatter', 2, {
        chartType: 'scatter',
        data: {
          categories: [],
          series: [
            {
              name: t.ours,
              values: [],
              points: [
                { x: 10, y: 22 },
                { x: 18, y: 31 },
                { x: 25, y: 38 },
                { x: 33, y: 52 },
                { x: 41, y: 49 },
                { x: 48, y: 66 },
              ],
            },
            {
              name: t.theirs,
              values: [],
              points: [
                { x: 12, y: 15 },
                { x: 22, y: 21 },
                { x: 30, y: 30 },
                { x: 44, y: 35 },
              ],
            },
          ],
        },
        options: { title: t.adSpend, axes: { x: { show: true }, y: { show: true } } },
      }),
      chart('e_chart_radar', 3, {
        chartType: 'radar',
        data: {
          categories: [t.speed, t.quality, t.price, t.service, t.design],
          series: [
            { name: t.ours, values: [86, 92, 60, 78, 88] },
            { name: t.theirs, values: [70, 65, 75, 62, 58] },
          ],
        },
        options: { title: t.teams, legend: { show: true, position: 'end' } },
      }),
    ],
  });
}

const entrance = (id: string, elementId: string, preset: string): AnimationStep => ({
  id,
  elementId,
  trigger: 'onClick',
  category: 'entrance',
  preset,
  duration: 800,
  delay: 0,
  easing: 'ease-out',
});

/** One chart that waits for a click, beside a line of text that is there from the start. */
function steppedSlide(t: Words, id: string) {
  return createSlide({
    id,
    name: 'A chart on its step',
    elements: [
      chart('e_chart_step', 0, {
        chartType: 'column',
        data: {
          categories: quarters(t),
          series: [{ name: t.revenue, values: [12, 18.5, 16, 24] }],
        },
        options: { title: t.byQuarter },
      }),
      chart('e_chart_step_pie', 1, {
        chartType: 'donut',
        data: {
          categories: [t.north, t.south, t.east],
          series: [{ name: t.sales, values: [50, 30, 20] }],
        },
      }),
    ],
    timeline: [
      entrance('a_chart_step', 'e_chart_step', 'appear'),
      entrance('a_chart_step_pie', 'e_chart_step_pie', 'fade'),
    ],
  });
}

/** One chart without a step: it builds when its slide is shown. */
function plainSlide(t: Words, id: string) {
  return createSlide({
    id,
    name: 'A chart without a step',
    elements: [
      chart('e_chart_plain', 0, {
        chartType: 'line',
        data: {
          categories: ['2022', '2023', '2024', '2025'],
          series: [{ name: t.revenue, values: [40, 52, 61, 78] }],
        },
      }),
    ],
  });
}

export function chartDeck(dir: Direction = 'ltr'): Deck {
  const t = dir === 'rtl' ? hebrew : english;
  return createDeck({
    id: `chart-deck-${dir}`,
    title: dir === 'rtl' ? 'גרפים' : 'Charts',
    lang: dir === 'rtl' ? 'he' : 'en',
    dir,
    now: new Date('2026-01-01T00:00:00Z'),
    slides: [
      cartesianSlide(t, 's_chart_cartesian'),
      roundSlide(t, 's_chart_round'),
      steppedSlide(t, 's_chart_stepped'),
      plainSlide(t, 's_chart_plain'),
    ],
  });
}
