import { expect, test, type Page } from '@playwright/test';

/*
 * The design system's buttons (ADR-060, ADR-057): one that turns disabled while it has the
 * keyboard keeps it until the focus leaves, an icon button that is a switch reads as pressed,
 * and a number field takes a test id.
 */

async function gallery(page: Page, dir: 'ltr' | 'rtl' = 'ltr') {
  await page.goto(`/dev/gallery.html?theme=light&dir=${dir}`);
  await expect(page.getByTestId(`gallery-light-${dir}`)).toBeVisible();
}

const focused = (page: Page) =>
  page.evaluate(
    () => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName,
  );

for (const id of ['gallery-once', 'gallery-once-icon']) {
  test(`${id}: a button that turns disabled while it has the keyboard keeps it`, async ({
    page,
  }) => {
    await gallery(page);
    const button = page.getByTestId(id);
    await button.focus();
    await page.keyboard.press('Enter');
    // Disabled: it says so and takes no click, but the focus is still on it, not on <body>.
    await expect(button).toBeDisabled();
    expect(await focused(page)).toBe(id);
    await page.keyboard.press('Enter');
    await expect(button).toBeDisabled();
    // The next Tab goes on from it, to the button after it, and not from the top of the page.
    await page.keyboard.press('Tab');
    expect(await focused(page)).not.toBe('BODY');
    const next = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(next).toBeTruthy();
    // Once the focus has left, it is disabled as any other: no longer in the order of Tab.
    await expect(button).toHaveAttribute('disabled', '');
  });
}

test('a busy button takes no press, from the pointer or from the keyboard', async ({ page }) => {
  await gallery(page);
  const button = page.getByTestId('gallery-busy');
  const presses = page.getByTestId('gallery-busy-presses');
  await expect(button).toHaveAttribute('aria-busy', 'true');
  await expect(presses).toHaveText('0');
  // The pointer is kept off it.
  expect(await button.evaluate((node) => getComputedStyle(node).pointerEvents)).toBe('none');
  await button.click({ force: true });
  // Enter and Space reach it, since it keeps its place in the order of Tab, and do nothing.
  await button.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(presses).toHaveText('0');
  // It is not disabled: the keyboard stays on it, and it says it is busy.
  expect(await focused(page)).toBe('gallery-busy');
  await expect(button).toBeEnabled();
});

test('a busy button that opens a menu still opens it, both ways', async ({ page }) => {
  await gallery(page);
  const button = page.getByTestId('gallery-busy-menu');
  await expect(button).toHaveAttribute('aria-busy', 'true');
  // Its own menu: the gallery keeps another one open, to show what a menu looks like.
  const menu = page.locator(`[role="menu"][aria-labelledby="${await button.getAttribute('id')}"]`);
  await expect(menu).toHaveCount(0);
  // With the pointer: what it opens is where the way to stop the work can be.
  expect(await button.evaluate((node) => getComputedStyle(node).pointerEvents)).not.toBe('none');
  await button.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  // And with the keyboard, as before.
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('an icon button that is a switch reads as pressed, and as not pressed', async ({ page }) => {
  await gallery(page);
  const pressed = page.getByTestId('gallery-pressed');
  await expect(pressed).toHaveAttribute('aria-pressed', 'true');
  const look = () =>
    pressed.evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, color: style.color };
    });
  const on = await look();
  await page.mouse.move(0, 0);
  await pressed.click();
  await page.mouse.move(0, 0);
  await expect(pressed).toHaveAttribute('aria-pressed', 'false');
  // Pressed is the accent's soft tint, as a Toggle is; not pressed is a quiet ghost. The colours
  // fade from one to the other, so the look is read once the fade is over.
  await expect.poll(async () => (await look()).background).toBe('rgba(0, 0, 0, 0)');
  const off = await look();
  expect(on.background).not.toBe(off.background);
  expect(on.color).not.toBe(off.color);
});

test('a number field takes a test id on the field one types into', async ({ page }) => {
  await gallery(page);
  const seconds = page.getByTestId('gallery-seconds');
  await expect(seconds).toHaveRole('textbox');
  await seconds.fill('2.5');
  await seconds.press('Enter');
  await expect(seconds).toHaveValue('2.5');
});
