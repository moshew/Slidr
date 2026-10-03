import { expect, type Locator, type Page } from '@playwright/test';
import type { ChartElement, Element } from '@slidr/model';
import { currentSlide, row } from './objects-helpers';

/*
 * Shared by the specs of the chart editor (WG6-T06, T07): a chart on the app's first slide, the
 * chart as the model has it, the tools of row B, and the data editor.
 */

export const stage = (page: Page) => page.getByTestId('stage-surface');

/** A chart as the Stage draws it. */
export const chartOnStage = (page: Page, id = 'e_chart'): Locator =>
  page.getByTestId('stage-frame').locator(`[data-element-id="${id}"]`);

/** The picture the chart library drew for a chart on the Stage. */
export const chartSvg = (page: Page, id = 'e_chart'): Locator =>
  chartOnStage(page, id).locator('[data-slidr-chart-box] svg');

/** The text the chart on the Stage shows: its title, legend, axis labels and value labels. */
export const chartText = (page: Page, id = 'e_chart') =>
  chartSvg(page, id).evaluate((svg) => svg.textContent ?? '');

export const SALES = {
  categories: ['Q1', 'Q2', 'Q3'],
  series: [
    { name: 'Apples', values: [10, 20, 30] },
    { name: 'Pears', values: [1, null, 3] },
  ],
} as const;

export interface ChartInit {
  id?: string;
  chartType?: ChartElement['chartType'];
  data?: unknown;
  options?: Partial<ChartElement['options']>;
  frame?: { x: number; y: number; w: number; h: number };
  extra?: Record<string, unknown>;
}

/** Adds a chart to the current slide, and waits until it is drawn. Not selected. */
export async function addChart(page: Page, init: ChartInit = {}): Promise<string> {
  const id = init.id ?? 'e_chart';
  const element = {
    id,
    type: 'chart',
    frame: init.frame ?? { x: 410, y: 230, w: 1100, h: 620 },
    rotation: 0,
    opacity: 1,
    chartType: init.chartType ?? 'column',
    data: init.data ?? SALES,
    options: {
      legend: { show: true, position: 'bottom' },
      axes: { x: { show: true }, y: { show: true } },
      labels: false,
      ...init.options,
    },
    ...init.extra,
  };
  await page.evaluate((el) => {
    const { bus, selection } = window.slidr!;
    bus.dispatch({
      type: 'element.add',
      slideId: selection.getState().currentSlideId ?? '',
      element: el as never,
    });
  }, element);
  await expect(chartSvg(page, id)).toBeVisible();
  return id;
}

/** The chart as the model has it now. */
export async function chart(page: Page, id = 'e_chart'): Promise<ChartElement> {
  const found = await page.evaluate((elementId) => {
    const walk = (elements: readonly unknown[]): unknown => {
      for (const element of elements as { id: string; children?: unknown[] }[]) {
        if (element.id === elementId) return element;
        const inside = element.children ? walk(element.children) : undefined;
        if (inside) return inside;
      }
      return undefined;
    };
    for (const slide of window.slidr!.bus.deck.slides) {
      const element = walk(slide.elements);
      if (element) return element;
    }
    return null;
  }, id);
  if (!found) throw new Error(`No chart ${id}`);
  return found as ChartElement;
}

export const elements = async (page: Page): Promise<Element[]> =>
  (await currentSlide(page)).elements;

export const steps = (page: Page): Promise<number> =>
  page.evaluate(() => window.slidr!.bus.undoStack.length);

export const lastLabel = (page: Page): Promise<string | undefined> =>
  page.evaluate(() => window.slidr!.bus.undoStack.at(-1)?.label);

export const selectedIds = (page: Page): Promise<string[]> =>
  page.evaluate(() => window.slidr!.selection.getState().selectedElementIds);

export const undo = (page: Page) => page.evaluate(() => window.slidr!.bus.undo());
export const redo = (page: Page) => page.evaluate(() => window.slidr!.bus.redo());

/** Selects a chart as an object, with the keyboard on the Stage. */
export async function selectChart(page: Page, id = 'e_chart'): Promise<void> {
  await page.evaluate((elementId) => {
    window.slidr!.selection.getState().selectElements([elementId]);
  }, id);
  await stage(page).focus();
  await expect(row(page)).toHaveAttribute('data-selection', 'chart');
}

/**
 * Runs an action that must be exactly one undo step, and checks that undo takes the chart back to
 * what it was and redo brings the change back. Returns the chart as the action left it.
 */
export async function oneUndoStep(
  page: Page,
  action: () => Promise<unknown>,
  id = 'e_chart',
): Promise<ChartElement> {
  const before = await chart(page, id);
  const stepsBefore = await steps(page);
  await action();
  await expect.poll(() => steps(page)).toBe(stepsBefore + 1);
  const after = await chart(page, id);
  expect(after).not.toEqual(before);
  await undo(page);
  expect(await chart(page, id)).toEqual(before);
  expect(await steps(page)).toBe(stepsBefore);
  await redo(page);
  expect(await chart(page, id)).toEqual(after);
  expect(await steps(page)).toBe(stepsBefore + 1);
  return after;
}

/* ---------------------------------------------------------------- row B */

/** The names of the chart tools, in the two UI languages. */
export const NAMES = {
  he: {
    chart: 'גרף',
    type: 'סוג הגרף',
    data: 'עריכת נתונים',
    title: 'כותרת',
    titleField: 'כותרת הגרף',
    legend: 'מקרא',
    legendShow: 'הצגת המקרא',
    axes: 'צירים',
    labels: 'תוויות ערכים',
    colors: 'צבעים',
    panel: 'נתוני הגרף',
    close: 'סגירה',
    addRow: 'הוספת שורה מתחת',
    addColumn: 'הוספת עמודה',
    deleteRow: 'מחיקת השורה',
    deleteColumn: 'מחיקת העמודה',
  },
  en: {
    chart: 'Chart',
    type: 'Chart type',
    data: 'Edit data',
    title: 'Title',
    titleField: 'Chart title',
    legend: 'Legend',
    legendShow: 'Show the legend',
    axes: 'Axes',
    labels: 'Value labels',
    colors: 'Colours',
    panel: 'Chart data',
    close: 'Close',
    addRow: 'Add a row below',
    addColumn: 'Add a column',
    deleteRow: 'Delete the row',
    deleteColumn: 'Delete the column',
  },
} as const;

export type Lang = keyof typeof NAMES;

/** A tool of row B, by its name. */
export const tool = (page: Page, name: string): Locator =>
  row(page).getByRole('button', { name, exact: true });

/** The popover a tool of row B opened: the one that is not the data editor. */
export const popover = (page: Page): Locator =>
  page.locator('[role="dialog"]:not(:has([data-chart-data]))');

/* ---------------------------------------------------------------- the data editor */

/** The data editor: the popover of the "Edit data" button. */
export const dataEditor = (page: Page): Locator =>
  page.locator('[role="dialog"]:has([data-chart-data])');

/** A cell of the data grid. Row 0 holds the series names, column 0 the categories. */
export const gridCell = (page: Page, r: number, c: number): Locator =>
  dataEditor(page).locator(`[data-chart-cell="${r},${c}"]`);

/** The texts the data grid shows, row by row. */
export const gridTexts = (page: Page): Promise<string[][]> =>
  dataEditor(page)
    .locator('[data-chart-grid] tr')
    .evaluateAll((rows) =>
      rows.map((tr) =>
        Array.from(tr.children).map(
          (cell) => cell.querySelector('input')?.value ?? cell.textContent ?? '',
        ),
      ),
    );

/** The cell the keyboard of the data grid is on, as "row,col". */
export const activeCell = (page: Page): Promise<string | null> =>
  dataEditor(page)
    .locator('[data-chart-cell][aria-selected="true"]')
    .getAttribute('data-chart-cell');

/** Opens the data editor of the selected chart with its button, and waits for its grid. */
export async function openDataEditor(page: Page, lang: Lang = 'en'): Promise<void> {
  await tool(page, NAMES[lang].data).click();
  await expect(dataEditor(page)).toBeVisible();
  await expect(gridCell(page, 0, 0)).toBeFocused();
}

/** Clicks a cell of the data grid: it is then the selected one, with the keyboard on it. */
export async function clickCell(page: Page, r: number, c: number): Promise<void> {
  await gridCell(page, r, c).click();
  await expect(gridCell(page, r, c)).toBeFocused();
  await expect(gridCell(page, r, c)).toHaveAttribute('aria-selected', 'true');
}

/* ---------------------------------------------------------------- what the clipboard holds */

/** The `text/html` of a range copied in Excel: a whole document, with its styles and its markers. */
export const excelHtml = (
  grid: string[][],
  attributes = '',
) => `<html xmlns:v="urn:schemas-microsoft-com:vml"
xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">

<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Excel.Sheet>
<meta name=Generator content="Microsoft Excel 15">
<style>
<!--table
	{mso-displayed-decimal-separator:"\\.";
	mso-displayed-thousand-separator:"\\,";}
td
	{padding-top:1px;
	padding-right:1px;
	padding-left:1px;
	mso-ignore:padding;
	color:black;
	font-size:11.0pt;
	font-family:Calibri, sans-serif;
	mso-number-format:General;
	text-align:general;
	vertical-align:bottom;
	white-space:nowrap;}
.xl65
	{font-weight:700;}
.xl66
	{mso-number-format:"\\#\\,\\#\\#0";}
-->
</style>
</head>

<body link="#0563C1" vlink="#954F72">

<table border=0 cellpadding=0 cellspacing=0 width=${64 * grid[0]!.length} ${attributes}style='border-collapse:
 collapse;width:${48 * grid[0]!.length}pt'>
<!--StartFragment-->
 <col width=64 span=${grid[0]!.length} style='width:48pt'>
${grid
  .map(
    (line, r) => ` <tr height=20 style='height:15.0pt'>
${line
  .map(
    (text, c) =>
      `  <td ${c === 0 ? 'height=20 ' : ''}class=${r === 0 ? 'xl65' : 'xl66'}${
        /^[\d,]+$/.test(text) ? ' align=right' : ''
      } style='height:15.0pt'>${text.replaceAll('"', '&quot;')}</td>`,
  )
  .join('\n')}
 </tr>`,
  )
  .join('\n')}
<!--EndFragment-->
</table>

</body>

</html>
`;

/** The `text/plain` Excel puts next to it: tabs and CRLF, also after the last row. */
export const excelText = (grid: string[][]) =>
  grid.map((line) => line.join('\t')).join('\r\n') + '\r\n';

/** A range copied in Excel: its HTML, its text, and a picture of it. */
export const excel = (grid: string[][]) => ({
  data: { 'text/html': excelHtml(grid), 'text/plain': excelText(grid) },
  picture: true,
});

/** Plain text on the clipboard: TSV, CSV, or prose. */
export const plain = (text: string) => ({ data: { 'text/plain': text } });
