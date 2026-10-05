import { expect, test, type Locator, type Page } from '@playwright/test';
import type { TableCell, TableElement } from '@slidr/model';
import { dragSlider, openApp, pageProblems, row } from './objects-helpers';
import {
  addTable,
  cell,
  cellOnStage,
  expectSelection,
  leaveTable,
  oneUndoStep,
  selectCell,
  selectRange,
  selectTable,
  settled,
  steps,
  table,
  tableOnStage,
  texts,
  undo,
} from './table-helpers';

// How a table looks (WG6-T03, TBL-04, TBL-05, TBL-07): the table style and its parts, the
// direction of the table, and the fill, the borders, the vertical alignment and the text
// formatting of the selected cells. The tools act on the cells selected inside the table, and on
// the whole table when it is selected as an object. Every action is one undo step.

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

const QUARTERS = [
  ['Quarter', 'Revenue', 'Growth'],
  ['Q1', '1.2M', '+4%'],
  ['Q2', '1.4M', '+17%'],
];

const HEBREW = [
  ['רבעון', 'הכנסות', 'צמיחה', 'הערות'],
  ['Q1 2026', '1.2M ₪', '+4%', 'השקת המוצר'],
  ['Q2 2026', '1.4M ₪', '+17%', 'כניסה ל-API'],
  ['Q3 2026', '1.9M ₪', '+21%', 'שוק חדש'],
];

const CLEAR = 'rgba(0, 0, 0, 0)';

const tool = (page: Page, name: string) => row(page).getByRole('button', { name, exact: true });

/** Opens a popover of row B. */
async function open(page: Page, name: string): Promise<Locator> {
  await tool(page, name).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  return page.getByRole('dialog');
}

type Token = 'bg' | 'surface' | 'text' | 'muted' | 'primary' | 'secondary' | 'accent';

/** A colour of the deck's theme, as the browser reports a colour: "rgb(47, 91, 234)". */
function themeColor(page: Page, token: Token): Promise<string> {
  return page.evaluate((name) => {
    const { theme } = window.slidr!.bus.deck as unknown as {
      theme: { colors: Record<string, string> };
    };
    const probe = document.createElement('span');
    probe.style.color = theme.colors[name]!;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

/** Every cell of a table through a function, row by row. */
const each = <T>(t: TableElement, read: (c: TableCell) => T): T[][] =>
  t.cells.map((line) => line.map(read));

/** The widths of the borders a cell has of its own, side by side; null for a cell that has none. */
function borderWidths(c: TableCell): Record<string, number> | null {
  if (!c.borders) return null;
  return Object.fromEntries(
    Object.entries(c.borders).map(([side, stroke]) => [side, stroke.width]),
  );
}

/** The marks of every run of a cell, or null when its text has none. */
function marks(c: TableCell): unknown {
  const all = c.content.paragraphs.flatMap((p) => p.runs.map((run) => run.marks ?? null));
  return all.every((m) => m === null) ? null : all;
}

/* ---------------------------------------------------------------- the table style */

test('a style tile sets the style of the table, and the first one takes it off', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: QUARTERS });
  await selectTable(page, id);
  const start = await table(page);
  const popover = await open(page, 'Table style');
  const tile = (style: string) => popover.locator(`button[data-table-style="${style}"]`);
  await expect(popover.locator('button[data-table-style]')).toHaveCount(6);
  // A table without a style shows the first one.
  await expect(tile('plain')).toHaveAttribute('aria-pressed', 'true');

  const header = cellOnStage(page, id, 0, 0);
  const body = cellOnStage(page, id, 1, 1);
  const color = {
    primary: await themeColor(page, 'primary'),
    secondary: await themeColor(page, 'secondary'),
    surface: await themeColor(page, 'surface'),
  };
  await expect(header).toHaveCSS('background-color', color.primary);
  await expect(body).toHaveCSS('border-right-width', '0px');

  // What each style draws that the one before it did not.
  const drawn: Record<string, () => Promise<void>> = {
    grid: async () => {
      await expect(header).toHaveCSS('background-color', color.primary);
      await expect(body).toHaveCSS('border-right-width', '1px');
      await expect(header).toHaveCSS('border-top-width', '1px');
    },
    lines: async () => {
      await expect(header).toHaveCSS('background-color', CLEAR);
      await expect(header).toHaveCSS('border-bottom-width', '3px');
      await expect(body).toHaveCSS('border-right-width', '0px');
    },
    soft: async () => {
      await expect(header).toHaveCSS('background-color', color.surface);
      await expect(header).toHaveCSS('border-bottom-width', '0px');
      await expect(body).toHaveCSS('border-bottom-width', '0px');
    },
    tint: async () => {
      await expect(header).toHaveCSS('background-color', color.secondary);
      await expect(body).toHaveCSS('border-bottom-width', '1px');
    },
    boxed: async () => {
      await expect(header).toHaveCSS('background-color', color.surface);
      await expect(header).toHaveCSS('border-top-width', '2px');
      await expect(header).toHaveCSS('border-left-width', '2px');
      await expect(header).toHaveCSS('border-bottom-width', '2px');
      await expect(body).toHaveCSS('border-right-width', '1px');
    },
  };
  for (const style of ['grid', 'lines', 'soft', 'tint', 'boxed']) {
    const after = await oneUndoStep(page, () => tile(style).click());
    expect(after.style).toEqual({ ...start.style, styleId: style });
    // Nothing but the style changed: the table is where it was, as large as it was.
    expect({ ...after, style: start.style }).toEqual(start);
    await expect(tile(style)).toHaveAttribute('aria-pressed', 'true');
    await expect(tile('plain')).toHaveAttribute('aria-pressed', 'false');
    await drawn[style]!();
    // The table is drawn inside its frame, borders and all.
    const drawnHeight = await tableOnStage(page, id).evaluate(
      (root) => (root.querySelector('table') as HTMLElement).offsetHeight,
    );
    expect(Math.abs(drawnHeight - after.frame.h), style).toBeLessThan(1);
  }
  // The first style is what a table without a style has: it is not written.
  const plain = await oneUndoStep(page, () => tile('plain').click());
  expect(plain).toEqual(start);
  expect(plain.style).not.toHaveProperty('styleId');
  await expect(header).toHaveCSS('background-color', color.primary);
});

test('"Header row" switches the look of the first row', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: QUARTERS });
  await selectTable(page, id);
  const popover = await open(page, 'Table style');
  // An option of the style is a box to tick (ADR-060), not a pressed icon.
  const toggle = popover.getByRole('checkbox', { name: 'Header row', exact: true });
  await expect(toggle).toBeChecked();
  const header = cellOnStage(page, id, 0, 1);
  await expect(header).toHaveCSS('background-color', await themeColor(page, 'primary'));
  await expect(header.locator('p')).toHaveCSS('font-weight', '600');
  await expect(header.locator('p')).toHaveCSS('color', await themeColor(page, 'bg'));

  const off = await oneUndoStep(page, () => toggle.click());
  expect(off.style).toEqual({ headerRow: false, bandedRows: false, firstColumn: false });
  await expect(toggle).not.toBeChecked();
  await expect(header).toHaveCSS('background-color', CLEAR);
  await expect(header.locator('p')).toHaveCSS('font-weight', '400');
  await expect(header.locator('p')).toHaveCSS('color', await themeColor(page, 'text'));

  const on = await oneUndoStep(page, () => toggle.click());
  expect(on.style.headerRow).toBe(true);
});

test('"Banded rows" fills every second row under the header', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: [...QUARTERS, ['Q3', '1.9M', '+21%']] });
  await selectTable(page, id);
  const popover = await open(page, 'Table style');
  const toggle = popover.getByRole('checkbox', { name: 'Banded rows', exact: true });
  await expect(toggle).not.toBeChecked();
  await expect(cellOnStage(page, id, 2, 0)).toHaveCSS('background-color', CLEAR);

  const after = await oneUndoStep(page, () => toggle.click());
  expect(after.style).toEqual({ headerRow: true, bandedRows: true, firstColumn: false });
  const surface = await themeColor(page, 'surface');
  await expect(cellOnStage(page, id, 1, 0)).toHaveCSS('background-color', CLEAR);
  await expect(cellOnStage(page, id, 2, 0)).toHaveCSS('background-color', surface);
  await expect(cellOnStage(page, id, 2, 2)).toHaveCSS('background-color', surface);
  await expect(cellOnStage(page, id, 3, 0)).toHaveCSS('background-color', CLEAR);
});

test('"First column" makes the first column strong, on the right in a right-to-left table', async ({
  page,
}) => {
  await openApp(page);
  const id = await addTable(page, { dir: 'rtl', texts: HEBREW });
  await selectTable(page, id);
  const popover = await open(page, 'סגנון טבלה');
  const toggle = popover.getByRole('checkbox', { name: 'עמודה ראשונה', exact: true });
  const first = cellOnStage(page, id, 1, 0);
  const last = cellOnStage(page, id, 1, 3);
  await expect(first.locator('p')).toHaveCSS('font-weight', '400');

  const after = await oneUndoStep(page, () => toggle.click());
  expect(after.style).toEqual({ headerRow: true, bandedRows: false, firstColumn: true });
  await expect(first.locator('p')).toHaveCSS('font-weight', '600');
  await expect(last.locator('p')).toHaveCSS('font-weight', '400');
  // The first column is the one on the right.
  expect((await first.boundingBox())!.x).toBeGreaterThan((await last.boundingBox())!.x);
});

test('switching the direction mirrors the table, and switching back restores it exactly', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const accent = { color: { token: 'accent' }, width: 6 };
  const padding = { top: 12, right: 20, bottom: 12, left: 60 };
  const cells = QUARTERS.map((line) => line.map((text) => cell(text)));
  // A cell that is not the same on both of its sides: its left border and its left padding.
  cells[1]![0] = cell('Q1', { borders: { left: accent }, padding } as Partial<TableCell>);
  const id = await addTable(page, { texts: QUARTERS, cols: [300, 400, 500], extra: { cells } });
  await selectTable(page, id);
  const start = await table(page);
  const frame = (await tableOnStage(page, id).boundingBox())!;
  const boxes = async () =>
    Promise.all([0, 1, 2].map(async (col) => (await cellOnStage(page, id, 1, col).boundingBox())!));
  const before = await boxes();
  expect(before[0]!.x).toBeLessThan(before[2]!.x);

  const popover = await open(page, 'Table style');
  const group = popover.getByRole('radiogroup', { name: 'Table direction' });
  await expect(group.getByRole('radio', { name: 'Left to right' })).toBeChecked();
  const flipped = await oneUndoStep(page, () =>
    group.getByRole('radio', { name: 'Right to left' }).click(),
  );
  expect(flipped.dir).toBe('rtl');
  await expect(group.getByRole('radio', { name: 'Right to left' })).toBeChecked();
  // The texts are in the cells they were in, and so are the widths of the columns.
  expect(await texts(page)).toEqual(QUARTERS);
  expect(flipped.cols).toEqual(start.cols);
  expect(flipped.frame).toEqual(start.frame);
  // What was on the left of the cell is on its right.
  expect(flipped.cells[1]![0]!.borders).toEqual({ right: accent });
  expect(flipped.cells[1]![0]!.padding).toEqual({ ...padding, left: 20, right: 60 });

  // On the screen every column is where its mirror image was.
  const after = await boxes();
  after.forEach((box, col) => {
    const mirror = 2 * frame.x + frame.width - (before[col]!.x + before[col]!.width);
    expect(box.x, `column ${col}`).toBeCloseTo(mirror, 0);
    expect(box.width).toBeCloseTo(before[col]!.width, 0);
  });
  expect(after[0]!.x).toBeGreaterThan(after[2]!.x);
  await expect(cellOnStage(page, id, 1, 0)).toHaveCSS('border-right-width', '6px');
  await expect(cellOnStage(page, id, 1, 0)).toHaveCSS('padding-right', '60px');

  const back = await oneUndoStep(page, () =>
    group.getByRole('radio', { name: 'Left to right' }).click(),
  );
  expect(back).toEqual(start);
});

/* ---------------------------------------------------------------- fill */

test.describe('the fill of cells', () => {
  const ACCENT = { kind: 'solid', color: { token: 'accent' } };
  const fills = (t: TableElement) => each(t, (c) => c.fill ?? null);

  test('a theme colour fills the selected cells, and only them', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: QUARTERS });
    await selectRange(page, id, [1, 0], [1, 1]);
    await tool(page, 'Cell fill').click();
    const picker = page.getByRole('dialog');

    const after = await oneUndoStep(page, () =>
      picker.getByRole('button', { name: 'Accent', exact: true }).click(),
    );
    expect(fills(after)).toEqual([
      [null, null, null],
      [ACCENT, ACCENT, null],
      [null, null, null],
    ]);
    const accent = await themeColor(page, 'accent');
    await expect(cellOnStage(page, id, 1, 0)).toHaveCSS('background-color', accent);
    await expect(cellOnStage(page, id, 1, 1)).toHaveCSS('background-color', accent);
    await expect(cellOnStage(page, id, 1, 2)).toHaveCSS('background-color', CLEAR);
    // The cells are still the selected ones.
    await page.keyboard.press('Escape');
    await expectSelection(page, id, [1, 0], [1, 1]);
  });

  test('a colour dragged in the picker is one undo step', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: QUARTERS });
    await selectCell(page, id, 2, 2);
    await tool(page, 'Cell fill').click();
    const area = (await page.getByRole('dialog').getByTestId('color-area').boundingBox())!;

    const after = await oneUndoStep(page, async () => {
      await page.mouse.move(area.x + 20, area.y + 20);
      await page.mouse.down();
      await page.mouse.move(area.x + 80, area.y + 40, { steps: 6 });
      await page.mouse.move(area.x + area.width - 10, area.y + 10, { steps: 6 });
      await page.mouse.up();
    });
    expect(after.cells[2]![2]!.fill).toMatchObject({
      kind: 'solid',
      color: { value: expect.stringMatching(/^#/) },
    });
    expect(fills(after).flat().filter(Boolean)).toHaveLength(1);
  });

  test('"No colour" takes the fill of the table style off a cell', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: QUARTERS });
    // Two cells of the header row, which the style fills.
    await selectRange(page, id, [0, 0], [0, 1]);
    const primary = await themeColor(page, 'primary');
    await expect(cellOnStage(page, id, 0, 0)).toHaveCSS('background-color', primary);
    await tool(page, 'Cell fill').click();

    const after = await oneUndoStep(page, () =>
      page.getByRole('dialog').getByRole('button', { name: 'No colour', exact: true }).click(),
    );
    expect(fills(after)[0]).toEqual([{ kind: 'none' }, { kind: 'none' }, null]);
    await expect(cellOnStage(page, id, 0, 0)).toHaveCSS('background-color', CLEAR);
    await expect(cellOnStage(page, id, 0, 2)).toHaveCSS('background-color', primary);
    // Its text is no longer the text of a filled header: it can be read on the slide.
    const text = await themeColor(page, 'text');
    await expect(cellOnStage(page, id, 0, 0).locator('p')).toHaveCSS('color', text);
    await expect(cellOnStage(page, id, 0, 2).locator('p')).not.toHaveCSS('color', text);
  });

  test('on a table selected as an object the fill goes to all of its cells', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: QUARTERS });
    await selectTable(page, id);
    await tool(page, 'Cell fill').click();

    const after = await oneUndoStep(page, () =>
      page.getByRole('dialog').getByRole('button', { name: 'Accent', exact: true }).click(),
    );
    expect(fills(after).flat()).toEqual(Array.from({ length: 9 }, () => ACCENT));
    const accent = await themeColor(page, 'accent');
    for (const td of await tableOnStage(page, id).locator('td').all()) {
      await expect(td).toHaveCSS('background-color', accent);
    }
  });
});

/* ---------------------------------------------------------------- borders */

test.describe('the borders of cells', () => {
  // The range is the four cells at the bottom right of a table of nine. The table style draws a
  // line of one pixel under every row; the pen is six pixels wide.
  const PEN = 6;
  const RULE = 1;
  const edge = (popover: Locator, edges: string) =>
    popover.locator(`[data-border-edges="${edges}"]`);

  /** A table with the range selected, the borders popover open, and a pen of six pixels. */
  async function setUp(page: Page, dir: 'ltr' | 'rtl' = 'ltr') {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { dir, texts: QUARTERS });
    await selectRange(page, id, [1, 1], [2, 2]);
    const popover = await open(page, 'Borders');
    await expect(popover.locator('[data-border-edges]')).toHaveCount(10);
    // A pen alone draws nothing.
    const before = await steps(page);
    const width = popover.getByRole('textbox', { name: 'Width' });
    await width.fill(String(PEN));
    await width.press('Enter');
    expect(await steps(page)).toBe(before);
    return { id, popover };
  }

  const widths = (t: TableElement) => each(t, borderWidths);
  const sides = (td: Locator) =>
    td.evaluate((el) => {
      const style = getComputedStyle(el);
      return [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ].join(' ');
    });

  test('"All borders" draws every line of the range, on both cells of each line', async ({
    page,
  }) => {
    const { id, popover } = await setUp(page);
    const after = await oneUndoStep(page, () => edge(popover, 'all').click());
    const all = { top: PEN, right: PEN, bottom: PEN, left: PEN };
    expect(widths(after)).toEqual([
      // The cells above the range share its top line: it is their bottom.
      [null, { bottom: PEN }, { bottom: PEN }],
      // The cells beside it share its left line, and keep the line of the style under them.
      [{ bottom: RULE, right: PEN }, all, all],
      [{ bottom: RULE, right: PEN }, all, all],
    ]);
    await expect(edge(popover, 'all')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => sides(cellOnStage(page, id, 1, 1))).toBe('6px 6px 6px 6px');
    await expect.poll(() => sides(cellOnStage(page, id, 2, 2))).toBe('6px 6px 6px 6px');
    await expect.poll(() => sides(cellOnStage(page, id, 0, 1))).toBe('0px 0px 6px 0px');
    await expect.poll(() => sides(cellOnStage(page, id, 1, 0))).toBe('0px 6px 1px 0px');
    await expect.poll(() => sides(cellOnStage(page, id, 0, 0))).toBe('0px 0px 1px 0px');
    await page.screenshot({ path: 'test-results/table/borders-all.png' });
  });

  test('"Outside border" draws around the range and leaves the lines inside it', async ({
    page,
  }) => {
    const { id, popover } = await setUp(page);
    const after = await oneUndoStep(page, () => edge(popover, 'outer').click());
    expect(widths(after)).toEqual([
      [null, { bottom: PEN }, { bottom: PEN }],
      [
        { bottom: RULE, right: PEN },
        { bottom: RULE, top: PEN, left: PEN },
        { bottom: RULE, top: PEN, right: PEN },
      ],
      [
        { bottom: RULE, right: PEN },
        { bottom: PEN, left: PEN },
        { bottom: PEN, right: PEN },
      ],
    ]);
    await expect.poll(() => sides(cellOnStage(page, id, 1, 1))).toBe('6px 0px 1px 6px');
    await expect.poll(() => sides(cellOnStage(page, id, 2, 2))).toBe('0px 6px 6px 0px');
    await page.screenshot({ path: 'test-results/table/borders-outer.png' });
  });

  test('"Inside borders" draws the lines between the cells of the range', async ({ page }) => {
    const { id, popover } = await setUp(page);
    const after = await oneUndoStep(page, () => edge(popover, 'inner').click());
    expect(widths(after)).toEqual([
      [null, null, null],
      [null, { bottom: PEN, right: PEN }, { bottom: PEN, left: PEN }],
      [null, { bottom: RULE, top: PEN, right: PEN }, { bottom: RULE, top: PEN, left: PEN }],
    ]);
    await expect.poll(() => sides(cellOnStage(page, id, 1, 1))).toBe('0px 6px 6px 0px');
    await expect.poll(() => sides(cellOnStage(page, id, 2, 2))).toBe('6px 0px 1px 6px');
  });

  test('"No borders" removes every line in and around the range', async ({ page }) => {
    const { id, popover } = await setUp(page);
    const after = await oneUndoStep(page, () => edge(popover, 'none').click());
    expect(widths(after)).toEqual([
      // The line of the style under the header row is the top of the range: it goes.
      [null, {}, {}],
      [{ bottom: RULE }, {}, {}],
      [{ bottom: RULE }, {}, {}],
    ]);
    // "No borders" is an action, not a state: it does not stay pressed.
    await expect(edge(popover, 'none')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => sides(cellOnStage(page, id, 1, 1))).toBe('0px 0px 0px 0px');
    await expect.poll(() => sides(cellOnStage(page, id, 0, 1))).toBe('0px 0px 0px 0px');
    await expect.poll(() => sides(cellOnStage(page, id, 0, 0))).toBe('0px 0px 1px 0px');
  });

  test('"Left border" and "Right border" are sides of the screen, in a right-to-left table too', async ({
    page,
  }) => {
    const { id, popover } = await setUp(page, 'rtl');
    // Column 1 is the right column of the range here, and column 2 the left one.
    const left = await oneUndoStep(page, () => edge(popover, 'left').click());
    expect(widths(left)).toEqual([
      [null, null, null],
      [null, null, { bottom: RULE, left: PEN }],
      [null, null, { bottom: RULE, left: PEN }],
    ]);
    const right = await oneUndoStep(page, () => edge(popover, 'right').click());
    expect(widths(right)).toEqual([
      [null, null, null],
      // The line is shared with the first column, which is to the right of the range.
      [
        { bottom: RULE, left: PEN },
        { bottom: RULE, right: PEN },
        { bottom: RULE, left: PEN },
      ],
      [
        { bottom: RULE, left: PEN },
        { bottom: RULE, right: PEN },
        { bottom: RULE, left: PEN },
      ],
    ]);
    const inRange = (await cellOnStage(page, id, 1, 1).boundingBox())!;
    const beside = (await cellOnStage(page, id, 1, 0).boundingBox())!;
    expect(beside.x).toBeGreaterThan(inRange.x);
    await expect.poll(() => sides(cellOnStage(page, id, 1, 1))).toBe('0px 6px 1px 0px');
  });

  test('a change of the pen redraws the borders that were chosen', async ({ page }) => {
    const { id, popover } = await setUp(page);
    await edge(popover, 'outer').click();
    await settled(page);

    // The line style.
    const dashed = await oneUndoStep(page, () =>
      popover.getByRole('radio', { name: 'Dashed' }).click(),
    );
    expect(dashed.cells[1]![1]!.borders).toMatchObject({
      top: { width: PEN, dash: 'dashed' },
      left: { width: PEN, dash: 'dashed' },
      bottom: { width: RULE },
    });
    expect(dashed.cells[1]![1]!.borders!.bottom).not.toHaveProperty('dash');
    await expect(cellOnStage(page, id, 1, 1)).toHaveCSS('border-top-style', 'dashed');

    // The colour.
    await popover.getByRole('button', { name: 'Colour' }).click();
    const coloured = await oneUndoStep(page, () =>
      page.getByRole('dialog').last().getByRole('button', { name: 'Accent', exact: true }).click(),
    );
    await page.keyboard.press('Escape');
    expect(coloured.cells[2]![2]!.borders).toMatchObject({
      right: { color: { token: 'accent' }, width: PEN, dash: 'dashed' },
      bottom: { color: { token: 'accent' }, width: PEN, dash: 'dashed' },
    });
    await expect(cellOnStage(page, id, 2, 2)).toHaveCSS(
      'border-right-color',
      await themeColor(page, 'accent'),
    );

    // The width, typed.
    const width = popover.getByRole('textbox', { name: 'Width' });
    await width.fill('10');
    const typed = await oneUndoStep(page, () => width.press('Enter'));
    expect(each(typed, borderWidths)[1]).toEqual([
      { bottom: RULE, right: 10 },
      { bottom: RULE, top: 10, left: 10 },
      { bottom: RULE, top: 10, right: 10 },
    ]);
    await expect(cellOnStage(page, id, 1, 1)).toHaveCSS('border-top-width', '10px');
  });

  test('a drag of the width slider is one undo step', async ({ page }) => {
    const { id, popover } = await setUp(page);
    await edge(popover, 'all').click();
    await settled(page);

    const after = await oneUndoStep(page, () =>
      dragSlider(page, popover.getByRole('slider', { name: 'Width' }), 60),
    );
    const width = after.cells[1]![1]!.borders!.top!.width;
    expect(width).toBeGreaterThan(PEN);
    // Every line of the range has the new width, the shared ones on both of their cells.
    const all = { top: width, right: width, bottom: width, left: width };
    expect(widths(after)).toEqual([
      [null, { bottom: width }, { bottom: width }],
      [{ bottom: RULE, right: width }, all, all],
      [{ bottom: RULE, right: width }, all, all],
    ]);
    await expect(cellOnStage(page, id, 1, 1)).toHaveCSS('border-top-width', `${width}px`);
    await expect(popover.getByRole('textbox', { name: 'Width' })).toHaveValue(String(width));
    await page.screenshot({ path: 'test-results/table/borders-wide.png' });
  });

  test('on a table selected as an object "Outside border" frames the table', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: QUARTERS });
    await selectTable(page, id);
    const start = await table(page);
    const popover = await open(page, 'Borders');
    const width = popover.getByRole('textbox', { name: 'Width' });
    await width.fill(String(PEN));
    await width.press('Enter');

    const after = await oneUndoStep(page, () => edge(popover, 'outer').click());
    expect(widths(after)).toEqual([
      [
        { bottom: RULE, top: PEN, left: PEN },
        { bottom: RULE, top: PEN },
        { bottom: RULE, top: PEN, right: PEN },
      ],
      [{ bottom: RULE, left: PEN }, null, { bottom: RULE, right: PEN }],
      [{ bottom: PEN, left: PEN }, { bottom: PEN }, { bottom: PEN, right: PEN }],
    ]);
    // The frame of the table is drawn inside its frame: the table is where it was.
    expect(after.frame).toEqual(start.frame);
    const box = (await tableOnStage(page, id).boundingBox())!;
    const drawn = (await tableOnStage(page, id).locator('table').boundingBox())!;
    for (const key of ['x', 'y', 'width', 'height'] as const) {
      expect(Math.abs(drawn[key] - box[key]), key).toBeLessThan(1);
    }
  });
});

/* ---------------------------------------------------------------- vertical alignment */

test('the vertical alignment of the selected cells', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const frame = { x: 360, y: 240, w: 1200, h: 480 };
  const id = await addTable(page, { texts: QUARTERS, frame });
  await selectRange(page, id, [1, 0], [1, 2]);
  await tool(page, 'Vertical alignment').click();
  // A cell that says nothing is drawn in the middle.
  await expect(page.getByRole('menuitemradio', { name: 'Middle' })).toBeChecked();

  const after = await oneUndoStep(page, () =>
    page.getByRole('menuitemradio', { name: 'Bottom', exact: true }).click(),
  );
  expect(each(after, (c) => c.vAlign ?? null)).toEqual([
    [null, null, null],
    ['bottom', 'bottom', 'bottom'],
    [null, null, null],
  ]);
  await expect(cellOnStage(page, id, 1, 1)).toHaveCSS('vertical-align', 'bottom');
  await expect(cellOnStage(page, id, 2, 1)).toHaveCSS('vertical-align', 'middle');
  // The text is at the bottom of its cell.
  const td = (await cellOnStage(page, id, 1, 1).boundingBox())!;
  const text = (await cellOnStage(page, id, 1, 1).locator('p').boundingBox())!;
  expect(td.y + td.height - (text.y + text.height)).toBeLessThan(text.y - td.y);

  await tool(page, 'Vertical alignment').click();
  await expect(page.getByRole('menuitemradio', { name: 'Bottom' })).toBeChecked();
  const top = await oneUndoStep(page, () =>
    page.getByRole('menuitemradio', { name: 'Top', exact: true }).click(),
  );
  expect(top.cells[1]!.map((c) => c.vAlign)).toEqual(['top', 'top', 'top']);
  expect(top.frame).toEqual(frame);
});

/* ---------------------------------------------------------------- the text tools */

test.describe('the text tools', () => {
  const BOLD = [{ weight: 700 }];

  test('Bold on a range of cells makes the text of those cells bold', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: QUARTERS });
    await selectRange(page, id, [1, 0], [1, 1]);
    await expect(tool(page, 'Bold')).toHaveAttribute('aria-pressed', 'false');

    const after = await oneUndoStep(page, () => tool(page, 'Bold').click());
    expect(each(after, marks)).toEqual([
      [null, null, null],
      [BOLD, BOLD, null],
      [null, null, null],
    ]);
    await expect(tool(page, 'Bold')).toHaveAttribute('aria-pressed', 'true');
    await expect(cellOnStage(page, id, 1, 0).locator('p span').first()).toHaveCSS(
      'font-weight',
      '700',
    );
    await expect(cellOnStage(page, id, 1, 2).locator('p')).toHaveCSS('font-weight', '400');
    // The cells are still selected, and the keyboard is still on them.
    await expectSelection(page, id, [1, 0], [1, 1]);
    // An arrow moves from the cell the selection began at.
    await page.keyboard.press('ArrowDown');
    await expectSelection(page, id, [2, 0]);
  });

  test('on a table selected as an object Bold formats all of its cells', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: QUARTERS });
    await selectTable(page, id);

    const after = await oneUndoStep(page, () => tool(page, 'Bold').click());
    expect(each(after, marks).flat()).toEqual(Array.from({ length: 9 }, () => BOLD));
    await expect(tool(page, 'Bold')).toHaveAttribute('aria-pressed', 'true');
    // And off again, for all of them.
    const off = await oneUndoStep(page, () => tool(page, 'Bold').click());
    expect(each(off, marks).flat()).toEqual(Array.from({ length: 9 }, () => null));
  });

  for (const [key, mark] of [
    ['Control+b', { weight: 700 }],
    ['Control+i', { italic: true }],
    ['Control+u', { underline: true }],
  ] as const) {
    test(`${key} on a selected table formats the text of its cells`, async ({ page }) => {
      await openApp(page, { lang: 'en' });
      const id = await addTable(page, { texts: QUARTERS });
      await selectTable(page, id);
      const start = await table(page);

      const after = await oneUndoStep(page, () => page.keyboard.press(key));
      expect(each(after, marks).flat()).toEqual(Array.from({ length: 9 }, () => [mark]));
      // The same key takes it off.
      const off = await oneUndoStep(page, () => page.keyboard.press(key));
      expect(off).toEqual(start);
    });
  }

  test('the alignment buttons align the text of the selected cells', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: QUARTERS });
    await selectRange(page, id, [1, 1], [2, 2]);

    const after = await oneUndoStep(page, async () => {
      // In a row that is short of room the alignments are a menu.
      if (await tool(page, 'Align centre').count()) await tool(page, 'Align centre').click();
      else {
        await tool(page, 'Alignment').click();
        await page.getByRole('menuitemradio', { name: 'Align centre' }).click();
      }
    });
    expect(each(after, (c) => c.content.paragraphs.map((p) => p.align).join())).toEqual([
      ['start', 'start', 'start'],
      ['start', 'center', 'center'],
      ['start', 'center', 'center'],
    ]);
    await expect(cellOnStage(page, id, 1, 1).locator('p')).toHaveCSS('text-align', 'center');
    // In a cell `start` is the side the table starts from: the left, in this table.
    await expect(cellOnStage(page, id, 1, 0).locator('p')).toHaveCSS('text-align', 'left');
  });

  test('a larger font size makes the rows taller, in the undo step of the size', async ({
    page,
  }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: QUARTERS });
    await selectRange(page, id, [1, 0], [1, 2]);
    const start = await table(page);
    const size = row(page).getByRole('textbox', { name: 'Font size' });
    await size.fill('96');

    const after = await oneUndoStep(page, () => size.press('Enter'));
    expect(each(after, marks)[1]).toEqual([[{ size: 96 }], [{ size: 96 }], [{ size: 96 }]]);
    // The row grew with its text, and the frame with the row.
    expect(after.rows[1]).toBeGreaterThan(start.rows[1]! + 40);
    expect(after.rows[0]).toBe(start.rows[0]);
    expect(after.frame.h).toBeCloseTo(start.frame.h + after.rows[1]! - start.rows[1]!, 1);
    const drawn = await tableOnStage(page, id).evaluate(
      (root) => (root.querySelector('table') as HTMLElement).offsetHeight,
    );
    expect(Math.abs(drawn - after.frame.h)).toBeLessThan(1);
    await expectSelection(page, id, [1, 0], [1, 2]);
  });

  test('while a cell is typed in, Bold is for the selected text only', async ({ page }) => {
    await openApp(page, { lang: 'en' });
    const id = await addTable(page, { texts: QUARTERS });
    await selectCell(page, id, 1, 1);
    await page.keyboard.press('Enter');
    await expect(cellOnStage(page, id, 1, 1).locator('[data-text-editor]')).toBeFocused();
    await page.waitForTimeout(250);
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowLeft');
    const before = await steps(page);
    await tool(page, 'Bold').click();
    await settled(page);
    const after = await table(page);
    expect(after.cells[1]![1]!.content.paragraphs[0]!.runs).toEqual([
      { text: '1.2' },
      { text: 'M', marks: { weight: 700 } },
    ]);
    expect(await steps(page)).toBe(before + 1);
    // The editor kept the keyboard.
    await expect(cellOnStage(page, id, 1, 1).locator('[data-text-editor]')).toBeFocused();
    await undo(page);
    expect((await table(page)).cells[1]![1]!.content.paragraphs[0]!.runs).toEqual([
      { text: '1.2M' },
    ]);
  });
});

/* ---------------------------------------------------------------- for the design review */

for (const theme of ['light', 'dark'] as const) {
  test(`every table style on a Hebrew table, ${theme}`, async ({ page }) => {
    await openApp(page, { lang: 'he', theme });
    // Low on the slide, so that the popover does not cover it.
    const id = await addTable(page, {
      dir: 'rtl',
      texts: HEBREW,
      frame: { x: 360, y: 600, w: 1200, h: 320 },
      style: { bandedRows: true, firstColumn: true },
    });
    await selectTable(page, id);
    const popover = await open(page, 'סגנון טבלה');
    for (const style of ['plain', 'grid', 'lines', 'soft', 'tint', 'boxed']) {
      const tile = popover.locator(`button[data-table-style="${style}"]`);
      await tile.click();
      await expect(tile).toHaveAttribute('aria-pressed', 'true');
      await settled(page);
      // The pointer off the tile: its tooltip would cover the gallery.
      await page.mouse.move(40, 600);
      await page.screenshot({ path: `test-results/table/style-${style}-he-${theme}.png` });
    }
    expect((await table(page)).style.styleId).toBe('boxed');
    // Inside the table the range is marked the same way over every style.
    await page.keyboard.press('Escape');
    await selectRange(page, id, [1, 1], [2, 2]);
    await page.screenshot({ path: `test-results/table/style-boxed-range-he-${theme}.png` });
    await leaveTable(page);
  });
}
