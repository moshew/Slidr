import { expect, test, type Page } from '@playwright/test';
import type { ShapeElement } from '@slidr/model';
import { addSelected, elementOf, rect, toolsOutsideRow } from './format-helpers';
import { openApp, pageProblems, row, steps, undo } from './objects-helpers';
import { addTable, cellTarget, selectTable, table, typeInCell } from './table-helpers';
import { editingId, para } from './text-helpers';

/*
 * The link tool where it did nothing (TXT-09; ADR-060, "what was not done"): Ctrl+K on a shape
 * that is selected and not being edited, and on the text of a table's cells.
 */

const link = (page: Page) => row(page).getByRole('button', { name: 'קישור', exact: true });
const address = (page: Page) => page.getByRole('textbox', { name: 'כתובת' });

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test.describe('a selected shape', () => {
  test('Ctrl+K links all of its text, as it does for a selected text box', async ({ page }) => {
    await addSelected(page, [
      rect('s_text', 400, { content: { paragraphs: [para('Read more'), para('here')] } }),
    ]);
    await expect(link(page)).toHaveAttribute('data-linked', 'false');
    await page.keyboard.press('Control+k');
    await expect(address(page)).toBeFocused();
    await page.keyboard.type('slidr.dev/docs');
    expect(await steps(page, () => page.keyboard.press('Enter'))).toBe(1);
    const linked = { link: 'https://slidr.dev/docs', underline: true };
    expect((await elementOf<ShapeElement>(page, 's_text')).content?.paragraphs).toEqual([
      para('', { runs: [{ text: 'Read more', marks: linked }] }),
      para('', { runs: [{ text: 'here', marks: linked }] }),
    ]);
    // The shape is still selected, not edited, and the keyboard is back on the Stage.
    expect(await editingId(page)).toBeNull();
    await expect(page.getByTestId('stage-surface')).toBeFocused();
    await expect(link(page)).toHaveAttribute('data-linked', 'true');

    // The button opens the same popover, and takes the link away.
    await link(page).click();
    await expect(address(page)).toHaveValue('https://slidr.dev/docs');
    expect(await steps(page, () => page.getByRole('button', { name: 'הסרת הקישור' }).click())).toBe(
      1,
    );
    expect((await elementOf<ShapeElement>(page, 's_text')).content?.paragraphs).toEqual([
      para('Read more'),
      para('here'),
    ]);
    await undo(page);
    await expect(link(page)).toHaveAttribute('data-linked', 'true');
  });

  test('without text there is nothing to link: no button, and the key does nothing', async ({
    page,
  }) => {
    await addSelected(page, [rect('s_empty', 400)]);
    await expect(link(page)).toHaveCount(0);
    expect(await steps(page, () => page.keyboard.press('Control+k'))).toBe(0);
    await expect(address(page)).toHaveCount(0);
  });
});

test.describe('a table', () => {
  const texts = [
    ['Site', 'Mail'],
    ['Our site', 'Write to us'],
  ];

  test('Ctrl+K in a cell that is typed in links what is selected there', async ({ page }) => {
    await addTable(page, { texts });
    await typeInCell(page, 'e_table', 1, 0);
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Control+k');
    await expect(address(page)).toBeFocused();
    await page.keyboard.type('slidr.dev');
    await page.keyboard.press('Enter');
    expect((await table(page)).cells[1]?.[0]?.content.paragraphs[0]?.runs).toEqual([
      { text: 'Our site', marks: { link: 'https://slidr.dev', underline: true } },
    ]);
    // The cell is still typed in.
    await expect(page.locator('td[data-cell-editing] [data-text-editor]')).toBeFocused();
  });

  test('with cells selected the link goes on all the text of those cells, as one undo step', async ({
    page,
  }) => {
    await addTable(page, { texts });
    await typeInCell(page, 'e_table', 1, 1);
    // Out of the text: the cell stays selected, and the keyboard is on the Stage.
    await page.keyboard.press('Escape');
    await expect(cellTarget(page, 1, 1)).toBeVisible();
    await expect(link(page)).toBeVisible();
    await page.keyboard.press('Control+k');
    await expect(address(page)).toBeFocused();
    await page.keyboard.type('team@slidr.dev');
    expect(await steps(page, () => page.keyboard.press('Enter'))).toBe(1);
    const cells = (await table(page)).cells;
    expect(cells[1]?.[1]?.content.paragraphs[0]?.runs).toEqual([
      { text: 'Write to us', marks: { link: 'mailto:team@slidr.dev', underline: true } },
    ]);
    // Only the selected cell.
    expect(cells[1]?.[0]?.content.paragraphs[0]?.runs).toEqual([{ text: 'Our site' }]);
  });

  test('at 1366 the row of a table has no room for the button, and Ctrl+K still opens the link', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const lang of ['he', 'en'] as const) {
      await openApp(page, { lang });
      await addTable(page, { texts });
      await selectTable(page);
      await expect(row(page).getByTestId('link-anchor')).toHaveCount(1);
      await expect(
        row(page).getByRole('button', { name: lang === 'he' ? 'קישור' : 'Link', exact: true }),
      ).toHaveCount(0);
      expect(await toolsOutsideRow(page)).toEqual([]);
    }
    // The last language was English. The table is selected as an object: all of its cells.
    await page.keyboard.press('Control+k');
    const field = page.getByRole('textbox', { name: 'Address' });
    await expect(field).toBeFocused();
    // The popover is on the screen, under the row.
    const box = (await page.getByRole('dialog').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1366);
    await page.keyboard.type('slidr.dev');
    expect(await steps(page, () => page.keyboard.press('Enter'))).toBe(1);
    for (const cells of (await table(page)).cells) {
      for (const cell of cells) {
        expect(cell.content.paragraphs[0]?.runs[0]?.marks).toEqual({
          link: 'https://slidr.dev',
          underline: true,
        });
      }
    }
  });
});
