import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  addChart,
  chart,
  chartSvg,
  chartText,
  dataEditor,
  lastLabel,
  NAMES,
  oneUndoStep,
  popover,
  SALES,
  selectChart,
  stage,
  steps,
  tool,
} from './chart-helpers';
import { deck, openApp, pageProblems, row } from './objects-helpers';

/*
 * Row B for a chart (WG6-T07, CHT-03, CHT-04, CHT-05): the type, the title, the legend, the axes,
 * the value labels and the colours. Every action is exactly one undo step.
 */

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

const en = NAMES.en;
const he = NAMES.he;

async function open(page: Page, init: Parameters<typeof addChart>[1] = {}): Promise<void> {
  await openApp(page, { lang: 'en' });
  await addChart(page, init);
  await selectChart(page);
}

/** Opens a popover of row B. */
async function openTool(page: Page, name: string): Promise<Locator> {
  await tool(page, name).click();
  await expect(popover(page)).toBeVisible();
  return popover(page);
}

/* ---------------------------------------------------------------- the row */

test('row B for a chart has its tools, named in Hebrew and in English', async ({ page }) => {
  await openApp(page);
  await addChart(page);
  await selectChart(page);
  await expect(page.getByTestId('selection-label')).toHaveText(he.chart);
  for (const name of [he.type, he.data, he.title, he.legend, he.axes, he.labels, he.colors]) {
    await expect(tool(page, name)).toBeVisible();
  }

  await openApp(page, { lang: 'en' });
  await addChart(page);
  await selectChart(page);
  await expect(page.getByTestId('selection-label')).toHaveText(en.chart);
  for (const name of [en.type, en.data, en.title, en.legend, en.axes, en.labels, en.colors]) {
    await expect(tool(page, name)).toBeVisible();
  }
  // Type and data first, as SPEC 4.4 lists them; the options after.
  const names = await row(page)
    .getByRole('button')
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent ?? ''),
    );
  expect(names.slice(0, 7)).toEqual([
    en.type,
    en.data,
    en.title,
    en.legend,
    en.axes,
    en.labels,
    en.colors,
  ]);
});

/* ---------------------------------------------------------------- type */

test('the type gallery changes the type and keeps the data, one undo step each', async ({
  page,
}) => {
  await open(page);
  const gallery = await openTool(page, en.type);
  await expect(gallery.locator('[data-chart-type]')).toHaveCount(8);
  await expect(gallery.locator('[data-chart-type="column"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  for (const type of ['bar', 'line', 'area', 'pie', 'donut', 'scatter', 'radar', 'column']) {
    const after = await oneUndoStep(page, () =>
      gallery.locator(`[data-chart-type="${type}"]`).click(),
    );
    expect(after.chartType).toBe(type);
    expect(after.data).toEqual(SALES);
    // The gallery stays open, and marks the type the chart has now.
    await expect(gallery.locator(`[data-chart-type="${type}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(gallery.locator('[aria-pressed="true"]')).toHaveCount(1);
    await expect(chartSvg(page)).toBeVisible();
  }
  expect(await lastLabel(page)).toBe('Chart type');
  // The type the chart has is not a change.
  const before = await steps(page);
  await gallery.locator('[data-chart-type="column"]').click();
  expect(await steps(page)).toBe(before);
});

test('Ctrl+Z and Ctrl+Y undo and redo a change of type', async ({ page }) => {
  await open(page);
  const gallery = await openTool(page, en.type);
  await gallery.locator('[data-chart-type="pie"]').click();
  expect((await chart(page)).chartType).toBe('pie');
  await page.keyboard.press('Escape');
  await expect(stage(page)).toBeFocused();
  await page.keyboard.press('Control+z');
  expect((await chart(page)).chartType).toBe('column');
  await page.keyboard.press('Control+y');
  expect((await chart(page)).chartType).toBe('pie');
});

test('out of a scatter chart with points, the points become the rows of the new type', async ({
  page,
}) => {
  await open(page, {
    chartType: 'scatter',
    data: {
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
  });
  const gallery = await openTool(page, en.type);
  const after = await oneUndoStep(page, () => gallery.locator('[data-chart-type="line"]').click());
  expect(after.chartType).toBe('line');
  expect(after.data).toEqual({ categories: ['1', '2'], series: [{ name: 'A', values: [10, 20] }] });
});

/* ---------------------------------------------------------------- title */

test('the title is written as it is typed, as one undo step, and Enter is done', async ({
  page,
}) => {
  await open(page);
  const box = await openTool(page, en.title);
  const field = box.getByRole('textbox', { name: en.titleField });
  await expect(field).toHaveValue('');
  await expect(field).toHaveAttribute('placeholder', 'No title');

  const after = await oneUndoStep(page, async () => {
    await field.click();
    await page.keyboard.type('Sales by quarter');
    // The chart on the slide has the title before the field is left.
    await expect.poll(() => chartText(page)).toContain('Sales by quarter');
    await page.keyboard.press('Enter');
  });
  expect(after.options.title).toBe('Sales by quarter');
  expect(await lastLabel(page)).toBe('Chart title');
  // Enter closed the popover and gave the keyboard back to the slide; it was not Enter on the
  // chart, which would open its data.
  await expect(popover(page)).toBeHidden();
  await expect(stage(page)).toBeFocused();
  await expect(dataEditor(page)).toBeHidden();

  // Typed again, it is another step; a space between words stays while it is typed.
  const again = await oneUndoStep(page, async () => {
    const reopened = (await openTool(page, en.title)).getByRole('textbox', { name: en.titleField });
    await expect(reopened).toHaveValue('Sales by quarter');
    await reopened.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' 2026');
    await expect(reopened).toHaveValue('Sales by quarter 2026');
    await page.keyboard.press('Escape');
  });
  expect(again.options.title).toBe('Sales by quarter 2026');
});

test('an empty title removes the title', async ({ page }) => {
  await open(page, { options: { title: 'Old title' } });
  const box = await openTool(page, en.title);
  const field = box.getByRole('textbox', { name: en.titleField });
  await expect(field).toHaveValue('Old title');
  const after = await oneUndoStep(page, async () => {
    await field.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
  });
  expect(after.options).not.toHaveProperty('title');
  await expect.poll(() => chartText(page)).not.toContain('Old title');
});

test('a Hebrew title is typed and shown right to left', async ({ page }) => {
  await openApp(page);
  await addChart(page);
  await selectChart(page);
  const box = await openTool(page, he.title);
  const field = box.getByRole('textbox', { name: he.titleField });
  await field.click();
  await page.keyboard.insertText('מכירות לפי רבעון');
  await expect.poll(async () => (await chart(page)).options.title).toBe('מכירות לפי רבעון');
  await expect(field).toHaveCSS('direction', 'rtl');
  await expect.poll(() => chartText(page)).toContain('מכירות לפי רבעון');
  expect(await lastLabel(page)).toBe('כותרת הגרף');
});

/* ---------------------------------------------------------------- legend */

test('the legend is hidden and shown, and put on each side', async ({ page }) => {
  await open(page);
  const box = await openTool(page, en.legend);
  const show = box.getByRole('button', { name: en.legendShow });
  const position = box.getByRole('radiogroup', { name: 'Position' });
  await expect(show).toHaveAttribute('aria-pressed', 'true');
  await expect(position.getByRole('radio', { name: 'Bottom' })).toBeChecked();
  expect(await chartText(page)).toContain('Apples');

  let after = await oneUndoStep(page, () => show.click());
  expect(after.options.legend).toEqual({ show: false, position: 'bottom' });
  expect(await lastLabel(page)).toBe('Legend');
  await expect(show).toHaveAttribute('aria-pressed', 'false');
  // A legend that is not shown has no side to choose.
  await expect(position.getByRole('radio', { name: 'Top' })).toBeDisabled();
  await expect.poll(() => chartText(page)).not.toContain('Apples');

  after = await oneUndoStep(page, () => show.click());
  expect(after.options.legend.show).toBe(true);

  // A deck that reads left to right: the right is where its text ends.
  const sides = [
    ['Top', 'top'],
    ['Right', 'end'],
    ['Left', 'start'],
    ['Bottom', 'bottom'],
  ] as const;
  for (const [name, value] of sides) {
    after = await oneUndoStep(page, () => position.getByRole('radio', { name }).click());
    expect(after.options.legend).toEqual({ show: true, position: value });
    await expect(position.getByRole('radio', { name })).toBeChecked();
  }
});

test('in a Hebrew deck the right side of the legend is where the text starts', async ({ page }) => {
  await openApp(page);
  await addChart(page);
  await selectChart(page);
  const box = await openTool(page, he.legend);
  const position = box.getByRole('radiogroup', { name: 'מיקום' });
  let after = await oneUndoStep(page, () => position.getByRole('radio', { name: 'מימין' }).click());
  expect(after.options.legend.position).toBe('start');
  after = await oneUndoStep(page, () => position.getByRole('radio', { name: 'משמאל' }).click());
  expect(after.options.legend.position).toBe('end');
  // The button of the right side is on the right.
  const right = (await position.getByRole('radio', { name: 'מימין' }).boundingBox())!;
  const left = (await position.getByRole('radio', { name: 'משמאל' }).boundingBox())!;
  expect(right.x).toBeGreaterThan(left.x);
});

/* ---------------------------------------------------------------- axes */

test('the category axis: shown, grid lines, and a title', async ({ page }) => {
  await open(page);
  const box = await openTool(page, en.axes);
  const axis = box.getByRole('group', { name: 'Category axis' });
  // An axis of categories has no minimum and no maximum.
  await expect(axis.getByRole('textbox')).toHaveCount(1);

  let after = await oneUndoStep(page, () =>
    axis.getByRole('button', { name: 'Show the axis' }).click(),
  );
  expect(after.options.axes.x).toEqual({ show: false });
  expect(await lastLabel(page)).toBe('Axes');
  await oneUndoStep(page, () => axis.getByRole('button', { name: 'Show the axis' }).click());

  // The grid lines of the categories are off until they are asked for.
  const grid = axis.getByRole('button', { name: 'Grid lines' });
  await expect(grid).toHaveAttribute('aria-pressed', 'false');
  after = await oneUndoStep(page, () => grid.click());
  expect(after.options.axes.x).toEqual({ show: true, gridLines: true });

  after = await oneUndoStep(page, async () => {
    await axis.getByRole('textbox', { name: 'Axis title' }).click();
    await page.keyboard.type('Quarter');
    await page.keyboard.press('Tab');
  });
  expect(after.options.axes.x).toEqual({ show: true, gridLines: true, title: 'Quarter' });
  expect(after.options.axes.y).toEqual({ show: true });
  await expect.poll(() => chartText(page)).toContain('Quarter');
});

test('the value axis: grid lines, a minimum and a maximum, and back to automatic', async ({
  page,
}) => {
  await open(page);
  const box = await openTool(page, en.axes);
  const axis = box.getByRole('group', { name: 'Value axis' });
  const min = axis.getByRole('textbox', { name: 'Minimum' });
  const max = axis.getByRole('textbox', { name: 'Maximum' });
  await expect(min).toHaveValue('');
  await expect(min).toHaveAttribute('placeholder', 'Automatic');

  // The grid lines of the values are on until they are taken off.
  const grid = axis.getByRole('button', { name: 'Grid lines' });
  await expect(grid).toHaveAttribute('aria-pressed', 'true');
  let after = await oneUndoStep(page, () => grid.click());
  expect(after.options.axes.y).toEqual({ show: true, gridLines: false });

  after = await oneUndoStep(page, async () => {
    await min.click();
    await page.keyboard.type('-5.5');
    await page.keyboard.press('Enter');
  });
  expect(after.options.axes.y.min).toBe(-5.5);

  after = await oneUndoStep(page, async () => {
    await max.click();
    await page.keyboard.type('50');
    await page.keyboard.press('Tab');
  });
  expect(after.options.axes.y).toEqual({ show: true, gridLines: false, min: -5.5, max: 50 });
  await expect.poll(() => chartText(page)).toContain('50');

  // Text that is no number changes nothing.
  const before = await steps(page);
  await max.click();
  await page.keyboard.type('high');
  await page.keyboard.press('Enter');
  expect(await steps(page)).toBe(before);
  await expect(max).toHaveValue('50');

  // The small button takes the axis back to automatic.
  after = await oneUndoStep(page, () =>
    axis.getByRole('button', { name: 'Back to automatic' }).first().click(),
  );
  expect(after.options.axes.y).toEqual({ show: true, gridLines: false, max: 50 });
  await expect(min).toHaveValue('');
  after = await oneUndoStep(page, () =>
    axis.getByRole('button', { name: 'Back to automatic' }).click(),
  );
  expect(after.options.axes.y).toEqual({ show: true, gridLines: false });
  await expect(axis.getByRole('button', { name: 'Back to automatic' })).toHaveCount(0);
});

test('the axes follow the type: none for a pie, a range for a radar, two ranges for a scatter', async ({
  page,
}) => {
  await open(page, { chartType: 'pie' });
  await expect(tool(page, en.axes)).toHaveCount(0);
  // The other tools are all there.
  await expect(tool(page, en.legend)).toBeVisible();
  await expect(tool(page, en.colors)).toBeVisible();

  const gallery = await openTool(page, en.type);
  await gallery.locator('[data-chart-type="radar"]').click();
  await page.keyboard.press('Escape');
  let box = await openTool(page, en.axes);
  await expect(box.getByRole('group')).toHaveCount(1);
  const radar = box.getByRole('group', { name: 'Value axis' });
  await expect(radar.getByRole('textbox')).toHaveCount(2);
  await expect(radar.getByRole('button', { name: 'Show the axis' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await (await openTool(page, en.type)).locator('[data-chart-type="scatter"]').click();
  await page.keyboard.press('Escape');
  box = await openTool(page, en.axes);
  for (const name of ['X axis', 'Y axis']) {
    const axis = box.getByRole('group', { name });
    await expect(axis.getByRole('textbox', { name: 'Minimum' })).toBeVisible();
    await expect(axis.getByRole('textbox', { name: 'Maximum' })).toBeVisible();
    // The grid lines of both axes of a scatter chart are on.
    await expect(axis.getByRole('button', { name: 'Grid lines' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  const x = box.getByRole('group', { name: 'X axis' });
  const after = await oneUndoStep(page, async () => {
    await x.getByRole('textbox', { name: 'Maximum' }).click();
    await page.keyboard.type('10');
    await page.keyboard.press('Enter');
  });
  expect(after.options.axes.x).toEqual({ show: true, max: 10 });
});

/* ---------------------------------------------------------------- value labels */

test('the value labels are put on and taken off', async ({ page }) => {
  await open(page);
  const labels = tool(page, en.labels);
  await expect(labels).toHaveAttribute('aria-pressed', 'false');
  // The texts the chart shows: the ticks of the axes and the legend, and then a number on each
  // of its five columns as well.
  const texts = () => chartSvg(page).locator('text').count();
  const plain = await texts();

  let after = await oneUndoStep(page, () => labels.click());
  expect(after.options.labels).toBe(true);
  expect(await lastLabel(page)).toBe('Value labels');
  await expect(labels).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(texts).toBe(plain + 5);

  after = await oneUndoStep(page, () => labels.click());
  expect(after.options.labels).toBe(false);
  await expect.poll(texts).toBe(plain);
});

/* ---------------------------------------------------------------- colours */

test('a series is given a colour of the theme, a colour of its own, and the theme colours again', async ({
  page,
}) => {
  await open(page);
  const { theme } = await deck(page);
  const box = await openTool(page, en.colors);
  await expect(box.getByText('A colour for each series')).toBeVisible();
  const reset = box.getByRole('button', { name: 'Back to the theme colours' });
  await expect(reset).toBeDisabled();
  // The chart is drawn in the chart colours of the theme.
  const fills = () =>
    chartSvg(page).evaluate((svg) =>
      Array.from(svg.querySelectorAll('path'), (path) => path.getAttribute('fill') ?? ''),
    );
  expect(await fills()).toContain(theme.colors.chart[1]);

  // A colour of the theme is kept as its token, so it follows the theme.
  await box.getByRole('button', { name: 'Pears', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(2);
  let after = await oneUndoStep(page, () =>
    page.getByRole('button', { name: 'Accent', exact: true }).click(),
  );
  expect(after.data.series[1]?.color).toEqual({ token: 'accent' });
  expect(after.data.series[0]).not.toHaveProperty('color');
  expect(after.options).not.toHaveProperty('palette');
  expect(await lastLabel(page)).toBe('Chart colours');
  await expect.poll(fills).toContain(theme.colors.accent);
  expect(await fills()).not.toContain(theme.colors.chart[1]);

  // A colour by its code.
  after = await oneUndoStep(page, async () => {
    const hex = page.getByRole('textbox', { name: 'Hex code' });
    await hex.fill('10AA20');
    await hex.press('Enter');
  });
  expect(after.data.series[1]?.color).toEqual({ value: '#10aa20' });

  // Esc closes the picker, and Esc again the colours.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(reset).toBeEnabled();
  after = await oneUndoStep(page, () => reset.click());
  expect(after.data).toEqual(SALES);
  await expect(reset).toBeDisabled();
  await expect.poll(fills).toContain(theme.colors.chart[1]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a drag in the colour picker is one undo step', async ({ page }) => {
  await open(page);
  const box = await openTool(page, en.colors);
  await box.getByRole('button', { name: 'Apples', exact: true }).click();
  const area = page.getByTestId('color-area');
  await expect(area).toBeVisible();
  const at = (await area.boundingBox())!;
  const after = await oneUndoStep(page, async () => {
    await page.mouse.move(at.x + 20, at.y + 20);
    await page.mouse.down();
    await page.mouse.move(at.x + 60, at.y + 40, { steps: 5 });
    await page.mouse.move(at.x + 120, at.y + 60, { steps: 5 });
    await page.mouse.up();
  });
  expect(after.data.series[0]?.color).toHaveProperty('value');
});

test('a pie colours its slices, through the palette of the chart', async ({ page }) => {
  await open(page, { chartType: 'pie' });
  const { theme } = await deck(page);
  const box = await openTool(page, en.colors);
  await expect(box.getByText('A colour for each slice')).toBeVisible();
  // The slices are the categories.
  for (const name of ['Q1', 'Q2', 'Q3']) {
    await expect(box.getByRole('button', { name, exact: true })).toBeVisible();
  }
  await box.getByRole('button', { name: 'Q2', exact: true }).click();
  const after = await oneUndoStep(page, () =>
    page.getByRole('button', { name: 'Primary', exact: true }).click(),
  );
  expect(after.options.palette?.[1]).toEqual({ token: 'primary' });
  expect(after.options.palette?.[0]).toEqual({ value: theme.colors.chart[0] });
  expect(after.data).toEqual(SALES);
  await page.keyboard.press('Escape');
  const back = await oneUndoStep(page, () =>
    box.getByRole('button', { name: 'Back to the theme colours' }).click(),
  );
  expect(back.options).not.toHaveProperty('palette');
});
