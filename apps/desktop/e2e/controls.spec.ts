import { expect, test } from '@playwright/test';

// The value controls and pickers of the design system (WG3-T06), on the component gallery.

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/gallery.html?theme=light&dir=ltr');
  await expect(page.getByTestId('gallery-light-ltr')).toBeVisible();
});

test('number field: commits on Enter, steps with the arrows, clamps, and drops junk', async ({
  page,
}) => {
  const size = page.getByRole('textbox', { name: 'Font size' }).first();
  await size.fill('48');
  await size.press('Enter');
  await expect(size).toHaveValue('48');
  await size.press('ArrowUp');
  await expect(size).toHaveValue('49');
  await size.press('Shift+ArrowDown');
  await expect(size).toHaveValue('39');
  await size.fill('5000');
  await size.press('Enter');
  await expect(size).toHaveValue('999');
  await size.fill('abc');
  await size.blur();
  await expect(size).toHaveValue('999');

  // One decimal place is kept, with a comma or a point.
  const rotation = page.getByRole('textbox', { name: 'Rotation' });
  await rotation.fill('7,25');
  await rotation.press('Enter');
  await expect(rotation).toHaveValue('7.3');
});

test('select and slider', async ({ page }) => {
  const weight = page.getByRole('combobox', { name: 'Weight' }).first();
  await expect(weight).toHaveText('Medium');
  await weight.click();
  await page.getByRole('option', { name: 'Bold' }).click();
  await expect(weight).toHaveText('Bold');

  const slider = page.getByRole('slider', { name: 'Opacity' }).first();
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('textbox', { name: 'Opacity' }).first()).toHaveValue('81');
});

test('colour picker: theme choices, hex, the square, alpha and no colour', async ({ page }) => {
  const card = page.locator('section', { hasText: 'Colour picker' });
  const value = card.locator('span[dir="ltr"]').first();
  await expect(value).toHaveText('#2f5bea');

  await card.getByRole('button', { name: 'Accent' }).click();
  await expect(value).toHaveText('#f59e0b');
  await expect(card.getByRole('button', { name: 'Accent' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const hex = card.getByRole('textbox', { name: 'Hex code' });
  await hex.fill('ff0000');
  await expect(value).toHaveText('#ff0000');
  await hex.press('Enter');
  await expect(hex).toHaveValue('FF0000');

  // A drag that leaves the square stays on its edge: the bottom edge is black, whatever the hue.
  const area = card.getByTestId('color-area');
  const box = (await area.boundingBox())!;
  const middle = box.x + box.width / 2;
  await page.mouse.move(middle, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(middle, box.y + box.height + 30);
  await page.mouse.up();
  await expect(value).toHaveText('#000000');
  // The middle of the top edge is the hue at half saturation: red stays the full channel.
  await page.mouse.move(middle, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(middle, box.y - 30);
  await page.mouse.up();
  await expect(value).toHaveText(/^#ff[0-9a-f]{4}$/);
  await expect(hex).toHaveValue(/^FF[0-9A-F]{4}$/);

  const alpha = card.getByRole('textbox', { name: 'Opacity' });
  await alpha.fill('50');
  await alpha.press('Enter');
  await expect(value).toHaveText(/^#ff[0-9a-f]{4}80$/);

  await card.getByRole('button', { name: 'No colour' }).click();
  await expect(value).toHaveText('No colour');
});

test('font picker: search, arrows and Enter', async ({ page }) => {
  const card = page.locator('section', { hasText: 'Font picker' });
  const list = card.getByRole('listbox');
  await expect(list.getByRole('option', { name: /Heebo/ })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  // Hebrew faces carry the mark; Latin-only ones do not.
  await expect(
    list.getByRole('option', { name: /Heebo/ }).getByRole('img', { name: 'Supports Hebrew' }),
  ).toBeVisible();

  const search = card.getByRole('combobox', { name: 'Search fonts' });
  await search.fill('playf');
  await expect(list.getByRole('option')).toHaveCount(1);
  await expect(list.getByRole('option').getByRole('img')).toHaveCount(0);
  await search.press('Enter');
  await search.fill('');
  await expect(list.getByRole('option', { name: 'Playfair Display' })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  await search.fill('zzz');
  await expect(card.getByText('No font by that name')).toBeVisible();
});
