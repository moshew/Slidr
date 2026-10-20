import { registerActionPopover, registerContextTool } from '../shell';
import { ChartInsert } from './ChartInsert';
import { installChartClipboard } from './clipboard';
import { installChartKeyboard } from './keyboard';
import './messages';
import { DataTools, OptionTools } from './tools';

/*
 * The chart area (WG6-T06, T07): inserting a chart (row A), the chart tools of row B with the
 * data editor, and pasting data. The chart itself is drawn by the renderer
 * (`packages/renderer/src/chart`); on the Stage it is an object like any other.
 */

/* ---------------------------------------------------------------- row A */

registerActionPopover('insert.chart', ChartInsert);

/* ---------------------------------------------------------------- row B */

/*
 * SPEC 4.4: type, data, legend, axes, colours; the title and the value labels sit with them
 * (CHT-03). Two groups: what the chart shows, and how it looks. The effects of every element and
 * the arrange menu follow them (orders 800 and 900).
 */
const tools = [
  { id: 'chart.data', group: 'chart.data', order: 10, render: DataTools },
  { id: 'chart.options', group: 'chart.options', order: 20, render: OptionTools },
];
for (const tool of tools) registerContextTool({ ...tool, kinds: ['chart'] });

/* ---------------------------------------------------------------- clipboard and keyboard */

const stopClipboard = installChartClipboard();
const stopKeyboard = installChartKeyboard();
import.meta.hot?.dispose(() => {
  stopClipboard();
  stopKeyboard();
});
