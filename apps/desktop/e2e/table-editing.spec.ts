import { expect, test, type Page } from '@playwright/test';
import { openApp, pageProblems } from './objects-helpers';
import {
  addTable,
  cellCenter,
  cellOnStage,
  cellTarget,
  editingId,
  selectTable,
  settled,
  stage,
  steps,
  tab,
  table,
  tableOnStage,
  texts,
  typeInCell,
  typingCell,
} from './table-helpers';

// Tables on the Stage (WG6-T01, TBL-01): inserting one, typing in its cells, Tab between them,
// and the cells as a selection. Every change is one undo step; a burst of typing is one step.

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

const QUARTERS = [
  ['Quarter', 'Revenue', 'Growth'],
  ['Q1', '1.2M', '+4%'],
  ['Q2', '1.4M', '+17%'],
];

const undo = (page: Page) => page.evaluate(() => window.slidr!.bus.undo());

/** The selected cells, as the Stage marks them: "row0,col0-row1,col1" of the model's session. */
function selection(
  page: Page,
): Promise<{ left: number; top: number; width: number; height: number }> {
  return stage(page)
    .locator('[data-table-selection]')
    .evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height };
    });
}

/** The boxes of the cells a selection covers, to compare with what the Stage marks. */
async function cellsBox(page: Page, id: string, cells: [number, number][]) {
  const boxes = await Promise.all(cells.map(([r, c]) => cellOnStage(page, id, r, c).boundingBox()));
  const left = Math.min(...boxes.map((b) => b!.x));
  const top = Math.min(...boxes.map((b) => b!.y));
  const right = Math.max(...boxes.map((b) => b!.x + b!.width));
  const bottom = Math.max(...boxes.map((b) => b!.y + b!.height));
  return { left, top, width: right - left, height: bottom - top };
}

function sameBox(
  actual: { left: number; top: number; width: number; height: number },
  expected: { left: number; top: number; width: number; height: number },
) {
  // The selection is placed by the model, the cells by the browser: a pixel is rounding.
  for (const key of ['left', 'top', 'width', 'height'] as const) {
    expect(Math.abs(actual[key] - expected[key]), key).toBeLessThan(1.5);
  }
}

/** The Stage marks exactly these cells as selected. It draws the mark a frame after the key. */
async function expectSelected(page: Page, id: string, cells: [number, number][]) {
  await expect(async () => {
    sameBox(await selection(page), await cellsBox(page, id, cells));
  }).toPass({ timeout: 3000 });
}

test('row A inserts a table of the picked size and starts typing in its first cell', async ({
  page,
}) => {
  await openApp(page);
  await page.getByTestId('top-tools-a').getByRole('button', { name: 'טבלה' }).click();
  const grid = page.getByRole('grid');
  await grid.locator('[data-rows="3"][data-cols="4"]').hover();
  await expect(page.getByTestId('table-insert-size')).toHaveText('4 עמודות × 3 שורות');
  await page.screenshot({ path: 'test-results/table/insert-popover.png' });
  const before = await steps(page);
  await grid.locator('[data-rows="3"][data-cols="4"]').click();

  await expect(stage(page).locator('[data-text-editor]')).toBeFocused();
  // Inserting is one undo step.
  expect(await steps(page)).toBe(before + 1);
  const id = (await editingId(page))!;
  const inserted = await table(page, id);
  expect(inserted.rows).toHaveLength(3);
  expect(inserted.cols).toHaveLength(4);
  // A Hebrew deck: the table reads from the right.
  expect(inserted.dir).toBe('rtl');
  expect(await typingCell(page)).toBe('0,0');

  // Typing, then Tab: the next cell in reading order, which is to the left here.
  await page.keyboard.type('שם');
  await tab(page, '0,1');
  await page.keyboard.type('Q1 2026');
  await tab(page, '0,2');
  await page.keyboard.type('סה"כ');
  await tab(page, '0,1', true);
  expect((await texts(page, id))[0]).toEqual(['שם', 'Q1 2026', 'סה"כ', '']);
  const first = await cellOnStage(page, id, 0, 0).boundingBox();
  const second = await cellOnStage(page, id, 0, 1).boundingBox();
  expect(second!.x).toBeLessThan(first!.x);
  // The typing in each cell is one step of its own.
  expect(await steps(page)).toBe(before + 4);
  await page.screenshot({ path: 'test-results/table/typing-hebrew.png' });

  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect(await editingId(page)).toBeNull();
  // Four undos: the three cells, then the table itself.
  for (let i = 0; i < 4; i++) await undo(page);
  await expect(tableOnStage(page, id)).toHaveCount(0);
});

test('a double-click goes into a table and types in the cell under the pointer', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: QUARTERS });
  await typeInCell(page, id, 1, 1);
  expect(await editingId(page)).toBe(id);
  expect(await typingCell(page)).toBe('1,1');
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  expect((await texts(page))[1]).toEqual(['Q1', '1.2M!', '+4%']);

  // A click on another cell moves the editor there.
  await cellTarget(page, 2, 2).click();
  await expect.poll(() => typingCell(page)).toBe('2,2');
  await expect(stage(page).locator('[data-text-editor]')).toBeFocused();
  await page.screenshot({ path: 'test-results/table/typing-english.png' });

  // Esc: the cell stays selected; Esc again: the table is selected as an object.
  await page.keyboard.press('Escape');
  expect(await typingCell(page)).toBeNull();
  expect(await editingId(page)).toBe(id);
  await expect(stage(page).locator('[data-table-selection]')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await editingId(page)).toBeNull();
  await expect(stage(page).locator('[data-handle="se"]')).toBeVisible();
});

test('Enter on a selected table goes into its first cell, with its text selected', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: QUARTERS });
  await selectTable(page, id);
  await page.keyboard.press('Enter');
  await expect.poll(() => typingCell(page)).toBe('0,0');
  await expect(stage(page).locator('[data-text-editor]')).toBeFocused();
  // What is typed replaces the text of the cell.
  await page.keyboard.type('Period');
  expect((await texts(page))[0]).toEqual(['Period', 'Revenue', 'Growth']);
});

test('a burst of typing in a cell is one undo step, and Ctrl+Z is the deck', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: QUARTERS });
  await typeInCell(page, id, 2, 0);
  await page.keyboard.press('End');
  const before = await steps(page);
  await page.keyboard.type(' 2026');
  expect(await steps(page)).toBe(before + 1);
  // A pause starts the next step.
  await page.waitForTimeout(800);
  await page.keyboard.type(' (est.)');
  expect(await steps(page)).toBe(before + 2);
  expect((await texts(page))[2]![0]).toBe('Q2 2026 (est.)');

  await page.keyboard.press('Control+z');
  expect((await texts(page))[2]![0]).toBe('Q2 2026');
  // The editor shows what the model has, and is still open.
  await expect(cellOnStage(page, id, 2, 0).locator('[data-text-editor]')).toHaveText('Q2 2026');
  await page.keyboard.press('Control+z');
  expect((await texts(page))[2]![0]).toBe('Q2');
  expect(await steps(page)).toBe(before);
  await page.keyboard.press('Control+y');
  expect((await texts(page))[2]![0]).toBe('Q2 2026');
});

test('Tab in the last cell adds a row and goes on typing in it', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: QUARTERS });
  await typeInCell(page, id, 2, 2);
  const before = await steps(page);
  const tall = (await table(page)).frame.h;
  await tab(page, '3,0');
  const grown = await table(page);
  expect(grown.rows).toHaveLength(4);
  expect(grown.frame.h).toBeGreaterThan(tall);
  // The new row is one undo step.
  expect(await steps(page)).toBe(before + 1);
  await page.keyboard.type('Q3');
  expect((await texts(page))[3]).toEqual(['Q3', '', '']);
  await page.keyboard.press('Escape');
  await undo(page);
  await undo(page);
  expect((await table(page)).rows).toHaveLength(3);
});

test('undoing the row that Tab added brings the typing back to the last cell, with its text kept', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, {
    texts: [
      ['a', 'b'],
      ['keep me', 'd'],
    ],
  });
  await typeInCell(page, id, 1, 1);
  await tab(page, '2,0');
  expect((await table(page)).rows).toHaveLength(3);
  // One Tab too many: Ctrl+Z takes the row back from under the editor.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await table(page)).rows.length).toBe(2);
  // The typing is where it came from, at the end of that cell's text: no other cell's text is
  // selected for the next key to replace.
  await expect.poll(() => typingCell(page)).toBe('1,1');
  await expect(page.locator('[data-text-editor]')).toBeFocused();
  // The row comes back with Ctrl+Y and goes again with Ctrl+Z, the typing staying where it is.
  await page.keyboard.press('Control+y');
  await expect.poll(async () => (await table(page)).rows.length).toBe(3);
  expect(await typingCell(page)).toBe('1,1');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await table(page)).rows.length).toBe(2);
  await page.keyboard.type('x');
  await expect
    .poll(() => texts(page))
    .toEqual([
      ['a', 'b'],
      ['keep me', 'dx'],
    ]);
});

/** Where every line of text of a table is drawn, cell by cell, with its colour and weight. */
function lines(page: Page, id: string) {
  return tableOnStage(page, id).evaluate((root) =>
    Array.from(root.querySelectorAll('td'), (td) => {
      const blocks = Array.from(td.querySelectorAll('p, li'));
      return {
        cell: `${td.getAttribute('data-row')},${td.getAttribute('data-col')}`,
        lines: blocks.flatMap((block) => {
          const range = document.createRange();
          range.selectNodeContents(block);
          return Array.from(range.getClientRects(), (r) => [r.left, r.top, r.width, r.height]);
        }),
        styles: blocks.map((block) => {
          const style = getComputedStyle(block);
          return [style.color, style.fontWeight, style.direction, style.textAlign];
        }),
      };
    }),
  );
}

test('no line moves when a cell is edited, in a Hebrew table with mixed text', async ({ page }) => {
  await openApp(page);
  const id = await addTable(page, {
    dir: 'rtl',
    style: { bandedRows: true, firstColumn: true },
    texts: [
      ['רבעון', 'הכנסות (USD)', 'צמיחה'],
      ['Q1 2026', '1.2M', '+4%'],
      ['השקת ה-API לציבור', 'שתי שורות\nבתא אחד', '87%'],
    ],
  });
  const before = await lines(page, id);
  // A header cell (its own colour and weight), a first-column cell, a number, two lines.
  for (const [row, col] of [
    [0, 1],
    [2, 0],
    [1, 2],
    [2, 1],
  ] as const) {
    await typeInCell(page, id, row, col);
    const during = await lines(page, id);
    for (const [i, cell] of during.entries()) {
      expect(cell.styles, `styles of ${cell.cell} while ${row},${col} is edited`).toEqual(
        before[i]!.styles,
      );
      expect(cell.lines.length, `lines of ${cell.cell}`).toBe(before[i]!.lines.length);
      cell.lines.forEach((line, n) =>
        line.forEach((value, k) =>
          expect(
            Math.abs(value - before[i]!.lines[n]![k]!),
            `${cell.cell} while ${row},${col} is edited`,
          ).toBeLessThan(0.6),
        ),
      );
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }
  // Entering and leaving changed nothing.
  expect(await steps(page)).toBe(1);
});

test('a row grows with the text typed into it, in the undo step of the typing', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: QUARTERS });
  const start = await table(page);
  await typeInCell(page, id, 1, 0);
  const before = await steps(page);
  await page.keyboard.type(' is a quarter with a name long enough to wrap onto several lines');
  await settled(page);
  const grown = await table(page);
  expect(grown.rows[1]).toBeGreaterThan(start.rows[1]! + 40);
  expect(grown.rows[0]).toBeCloseTo(start.rows[0]!, 1);
  expect(grown.frame.h).toBeCloseTo(start.frame.h + grown.rows[1]! - start.rows[1]!, 1);
  // The frame the model has is the table that is drawn.
  const drawn = await tableOnStage(page, id).evaluate(
    (root) => (root.querySelector('table') as HTMLElement).offsetHeight,
  );
  expect(Math.abs(drawn - grown.frame.h)).toBeLessThan(1);
  expect(await steps(page)).toBe(before + 1);

  await page.keyboard.press('Control+z');
  expect(await table(page)).toEqual(start);
});

test('the arrows, Shift, Tab, Delete and Ctrl+A work on the cells of a table', async ({ page }) => {
  await openApp(page);
  const id = await addTable(page, {
    dir: 'rtl',
    texts: [
      ['א', 'ב', 'ג'],
      ['ד', 'ה', 'ו'],
      ['ז', 'ח', 'ט'],
    ],
  });
  await typeInCell(page, id, 0, 0);
  await page.keyboard.press('Escape');
  await expectSelected(page, id, [[0, 0]]);

  // The arrows are screen directions: in a right-to-left table the next column is to the left.
  await page.keyboard.press('ArrowLeft');
  await expectSelected(page, id, [[0, 1]]);
  await page.keyboard.press('ArrowDown');
  await expectSelected(page, id, [[1, 1]]);
  await page.keyboard.press('ArrowRight');
  await expectSelected(page, id, [[1, 0]]);
  // At the edge of the table the selection stays, and the table does not move.
  const frame = (await table(page)).frame;
  await page.keyboard.press('ArrowRight');
  await expectSelected(page, id, [[1, 0]]);
  expect((await table(page)).frame).toEqual(frame);

  // Tab follows the reading order, to the end of the row and on to the next.
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expectSelected(page, id, [[2, 0]]);
  await page.keyboard.press('Shift+Tab');
  await expectSelected(page, id, [[1, 2]]);

  // Shift reaches from where the selection began.
  await page.keyboard.press('Shift+ArrowUp');
  await page.keyboard.press('Shift+ArrowRight');
  await expectSelected(page, id, [
    [0, 1],
    [1, 2],
  ]);
  await page.screenshot({ path: 'test-results/table/range-hebrew.png' });

  // Delete empties the selected cells: one undo step.
  const before = await steps(page);
  await page.keyboard.press('Delete');
  expect(await texts(page)).toEqual([
    ['א', '', ''],
    ['ד', '', ''],
    ['ז', 'ח', 'ט'],
  ]);
  expect(await steps(page)).toBe(before + 1);
  await undo(page);
  expect((await texts(page))[0]).toEqual(['א', 'ב', 'ג']);
  // Deleting cells that are empty already is not a step.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Control+a');
  await expectSelected(page, id, [
    [0, 0],
    [2, 2],
  ]);

  // Enter types in the cell the selection reached.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(stage(page).locator('[data-text-editor]')).toBeFocused();
  expect(await editingId(page)).toBe(id);
});

test('a drag selects a range of cells, and Shift+click reaches to a cell', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: QUARTERS });
  await typeInCell(page, id, 0, 0);
  const from = await cellCenter(page, id, 1, 0);
  const to = await cellCenter(page, id, 2, 1);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  // A drag selects; it does not type.
  expect(await typingCell(page)).toBeNull();
  await expectSelected(page, id, [
    [1, 0],
    [2, 1],
  ]);
  const far = await cellCenter(page, id, 0, 2);
  await page.keyboard.down('Shift');
  await page.mouse.click(far.x, far.y);
  await page.keyboard.up('Shift');
  await expectSelected(page, id, [
    [0, 0],
    [1, 2],
  ]);
  // Nothing moved or changed: selecting is not a step.
  expect(await steps(page)).toBe(1);
  expect(await texts(page)).toEqual(QUARTERS);
});

test('a press on the cell beside its text keeps the editor, with the caret in the text', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const id = await addTable(page, { texts: QUARTERS, frame: { x: 360, y: 240, w: 1200, h: 480 } });
  await typeInCell(page, id, 1, 1);
  // Far to the right of the short text, and near the bottom of the tall cell.
  const box = (await cellOnStage(page, id, 1, 1).boundingBox())!;
  await page.mouse.click(box.x + box.width - 6, box.y + box.height - 6);
  expect(await typingCell(page)).toBe('1,1');
  await expect(stage(page).locator('[data-text-editor]')).toBeFocused();
  await page.keyboard.type('?');
  expect((await texts(page))[1]![1]).toBe('1.2M?');
  expect((await table(page)).frame).toEqual({ x: 360, y: 240, w: 1200, h: 480 });
});

test('a character typed on a selected cell starts its text over, in its formatting', async ({
  page,
}) => {
  await openApp(page);
  const id = await addTable(page, {
    dir: 'rtl',
    texts: [
      ['שם', 'ערך'],
      ['ישן', '12'],
    ],
  });
  await typeInCell(page, id, 1, 0);
  // Bold, so that there is formatting to keep.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+b');
  await page.keyboard.press('Escape');
  const before = await steps(page);

  // The first character opens the editor; the ones after it are typed into it. (Playwright
  // sends a key press only for a character of the US layout, so the first one is Latin.)
  await page.keyboard.press('N');
  await expect(stage(page).locator('[data-text-editor]')).toBeFocused();
  await page.keyboard.type('ew חדש');
  expect(await typingCell(page)).toBe('1,0');
  const cell = (await table(page)).cells[1]![0]!;
  expect(cell.content.paragraphs).toHaveLength(1);
  expect(cell.content.paragraphs[0]!.runs).toEqual([{ text: 'New חדש', marks: { weight: 700 } }]);
  // The whole of it is one burst of typing: one undo step.
  expect(await steps(page)).toBe(before + 1);
  await page.keyboard.press('Control+z');
  expect((await texts(page))[1]![0]).toBe('ישן');
});
