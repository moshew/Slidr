import { expect, test } from '@playwright/test';
import { addElement, openApp, pageProblems, row, shape } from './objects-helpers';

/*
 * The keyboard in the popovers of row B (ADR-060, "ממצאים בשכבות של אחרים"): Esc closes the
 * colour picker, and the next Esc closes the popover it was opened from. A tooltip that the
 * focus brought back to the swatch used to take that Esc for itself.
 */

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test('Esc closes the colour picker, and the next Esc the popover around it', async ({ page }) => {
  await openApp(page);
  await addElement(page, shape('rect', { stroke: { color: { token: 'text' }, width: 4 } }));
  await row(page).getByRole('button', { name: 'קו מתאר', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  const outline = page.getByRole('dialog');
  // From the keyboard: Tab to the swatch, Enter opens the picker.
  const swatch = outline.getByRole('button', { name: 'צבע' });
  await swatch.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(2);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(swatch).toBeFocused();
  // The swatch has the keyboard back, and says nothing over the popover.
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
