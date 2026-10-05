import { expect, test, type Page } from '@playwright/test';
import { addBoxes, openApp, THREE } from './arrange-helpers';
import { addElement, importPicture, line } from './objects-helpers';

/*
 * Pictures for the design gate (DSN-09) of what the keyboard pass draws on the Stage (WG13-T06):
 * the ring of the Stage itself, the selection walk, the point of a line and the crop handle the
 * keyboard is on. In the light and the dark scheme, in Hebrew and in English. Nothing is compared:
 * the pictures are for a person, under `test-results/a11y/` (not in git).
 */

const DIR = 'test-results/a11y';
const surface = (page: Page) => page.getByTestId('stage-surface');

const combinations = (['he', 'en'] as const).flatMap((lang) =>
  (['light', 'dark'] as const).map((theme) => ({ lang, theme })),
);

/**
 * Brings the keyboard to the Stage the way a person does, with Tab from the tool before it, and
 * not with `focus()` from the test: the Stage shows its ring for a keyboard that arrived by a
 * key. (Focused by a script after a press of the pointer it shows none, also once keys follow;
 * that gap is in the track's report.)
 */
async function tabToStage(page: Page) {
  await page.getByTestId('top-tools-b').getByRole('button').last().focus();
  await page.keyboard.press('Tab');
  await expect(surface(page)).toBeFocused();
}

/** The Stage region with the row of tools above it: where the keyboard is, and what it can do. */
async function shoot(page: Page, name: string) {
  // The rings are drawn a frame after the key.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.getByTestId('editor').screenshot({ path: `${DIR}/${name}.png` });
}

for (const { lang, theme } of combinations) {
  const tag = `${lang}-${theme}`;

  test(`the selection walk, ${tag}`, async ({ page }) => {
    await openApp(page, { lang, theme });
    await addBoxes(page, THREE);
    await tabToStage(page);
    // A is selected; the walk stands on C, which is not.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('Alt+ArrowDown');
    await expect(surface(page).locator('[data-walk="e_c"]')).toBeVisible();
    await shoot(page, `walk-${tag}`);
  });

  test(`a point of a line, ${tag}`, async ({ page }) => {
    await openApp(page, { lang, theme });
    await addElement(page, line({ stroke: { color: { token: 'primary' }, width: 6 } }));
    await tabToStage(page);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Insert');
    await expect(surface(page).locator('[data-line-point="1"]')).toHaveAttribute(
      'data-active',
      'true',
    );
    await shoot(page, `line-point-${tag}`);
  });

  test(`a crop handle, ${tag}`, async ({ page }) => {
    await openApp(page, { lang, theme });
    const assetId = await importPicture(page, 'picture.png', ['#2f5bea', '#f59e0b'], [1200, 800]);
    await addElement(page, {
      id: 'e_picture',
      type: 'image',
      frame: { x: 660, y: 340, w: 600, h: 400 },
      assetId,
      fit: 'cover',
    });
    await tabToStage(page);
    await page.keyboard.press('Enter');
    await expect(surface(page)).toHaveAttribute('data-cropping', 'e_picture');
    // The top right corner, brought in a little so the picture outside the frame shows.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowLeft');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowDown');
    await expect(surface(page).locator('[data-crop-handle="ne"]')).toHaveAttribute(
      'data-active',
      'true',
    );
    await shoot(page, `crop-handle-${tag}`);
  });
}
