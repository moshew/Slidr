import { expect, test, type Page } from '@playwright/test';
import { openApp, pageProblems, row } from './objects-helpers';
import { addTable, cellTarget, selectTable, settled, stage, typeInCell } from './table-helpers';

// Screenshots of the table UI for the design gate (PLAN 1.2): both themes, both directions, and
// 1366x768. They are written to test-results/table/ to be looked at, not compared to a baseline.

const HEBREW = [
  ['רבעון', 'הכנסות', 'צמיחה', 'הערות'],
  ['Q1 2026', '1.2M ₪', '+4%', 'השקת המוצר'],
  ['Q2 2026', '1.4M ₪', '+17%', 'כניסה ל-API'],
  ['Q3 2026', '1.9M ₪', '+21%', ''],
];
const ENGLISH = [
  ['Quarter', 'Revenue', 'Growth', 'Notes'],
  ['Q1 2026', '$1.2M', '+4%', 'Product launch'],
  ['Q2 2026', '$1.4M', '+17%', 'API release'],
  ['Q3 2026', '$1.9M', '+21%', ''],
];

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/table/${name}.png` });

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

for (const lang of ['he', 'en'] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`the table tools, ${lang}, ${theme}`, async ({ page }) => {
      await openApp(page, { lang, theme });
      const id = await addTable(page, {
        texts: lang === 'he' ? HEBREW : ENGLISH,
        dir: lang === 'he' ? 'rtl' : 'ltr',
        style: { bandedRows: true },
      });
      const name = `${lang}-${theme}`;

      await selectTable(page, id);
      await shot(page, `${name}-selected`);

      // Inside the table: a range of cells.
      await typeInCell(page, id, 1, 1);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Shift+ArrowDown');
      await page.keyboard.press(lang === 'he' ? 'Shift+ArrowLeft' : 'Shift+ArrowRight');
      await expect(stage(page).locator('[data-table-selection]')).toBeVisible();
      await shot(page, `${name}-range`);

      for (const popover of ['style', 'borders'] as const) {
        const title = { style: ['סגנון טבלה', 'Table style'], borders: ['גבולות', 'Borders'] };
        await row(page)
          .getByRole('button', { name: title[popover][lang === 'he' ? 0 : 1], exact: true })
          .click();
        await expect(page.getByRole('dialog')).toBeVisible();
        await shot(page, `${name}-${popover}`);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();
      }

      await row(page)
        .getByRole('button', { name: lang === 'he' ? 'שורות ועמודות' : 'Rows and columns' })
        .click();
      await expect(page.getByRole('menu')).toBeVisible();
      await shot(page, `${name}-structure`);
      await page.keyboard.press('Escape');

      // Typing in a cell.
      await cellTarget(page, 2, 3).click();
      await expect(stage(page).locator('[data-text-editor]')).toBeFocused();
      await shot(page, `${name}-typing`);
      await settled(page);
    });
  }
}

test.describe('at 1366x768', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  for (const lang of ['he', 'en'] as const) {
    test(`the table tools fit the row, ${lang}`, async ({ page }) => {
      await openApp(page, { lang });
      const id = await addTable(page, {
        texts: lang === 'he' ? HEBREW : ENGLISH,
        dir: lang === 'he' ? 'rtl' : 'ltr',
      });
      await typeInCell(page, id, 1, 0);
      await shot(page, `${lang}-1366-typing`);

      // Nothing of row B is cut off: its last control ends inside the row.
      const toolbar = await row(page).boundingBox();
      const boxes = await row(page)
        .locator('button')
        .evaluateAll((buttons) =>
          buttons.map((button) => {
            const box = button.getBoundingClientRect();
            return { left: box.left, right: box.right };
          }),
        );
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(toolbar!.x - 0.5);
        expect(box.right).toBeLessThanOrEqual(toolbar!.x + toolbar!.width + 0.5);
      }
    });
  }
});
