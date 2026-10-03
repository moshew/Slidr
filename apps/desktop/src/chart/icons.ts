import type { ChartType } from '@slidr/model';
import {
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartLine,
  ChartPie,
  ChartScatter,
  createLucideIcon,
  type LucideIcon,
} from '@slidr/ui/icons';

/*
 * The icons of the chart area. Lucide has one for six of the eight chart types; its "donut" is the
 * pastry with a bite taken, and its "radar" is a radar screen. Those two, and the pair of axes,
 * are drawn here the way Lucide draws its own: a 24 grid, the stroke of the icon set, through
 * Lucide's own factory (as the border icons of the table area are).
 */

/** A ring cut into three parts. */
const Donut = createLucideIcon('chart-donut', [
  ['circle', { cx: '12', cy: '12', r: '9', key: 'outer' }],
  ['circle', { cx: '12', cy: '12', r: '4', key: 'inner' }],
  ['path', { d: 'M12 3v5 M15.5 14l4.3 2.5 M8.5 14l-4.3 2.5', key: 'cuts' }],
]);

/** The five-sided web of a radar chart, and one series on it. */
const Radar = createLucideIcon('chart-radar', [
  ['path', { d: 'M12 2.5 21 9.1 17.6 19.7H6.4L3 9.1z', key: 'web' }],
  ['path', { d: 'M12 7l3.3 3.9-.1 5.5-5-2-3-3.9z', key: 'series' }],
]);

/** Two axes with their ticks. */
export const Axes = createLucideIcon('chart-axes', [
  ['path', { d: 'M4 3v17h17', key: 'axes' }],
  ['path', { d: 'M4 8h3 M4 13h3 M9 20v-3 M14 20v-3', key: 'ticks' }],
]);

/** The eight chart types (CHT-01), in the order the galleries show them. */
export const CHART_TYPES: readonly ChartType[] = [
  'column',
  'bar',
  'line',
  'area',
  'pie',
  'donut',
  'scatter',
  'radar',
];

export const typeIcons: Record<ChartType, LucideIcon> = {
  column: ChartColumn,
  bar: ChartBar,
  line: ChartLine,
  area: ChartArea,
  pie: ChartPie,
  donut: Donut,
  scatter: ChartScatter,
  radar: Radar,
};
