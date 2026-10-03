import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ImageElement } from '@slidr/model';
import {
  addElement,
  deck,
  dragSlider,
  importPicture,
  onStage,
  openApp,
  pageProblems,
  pngBytes,
  row,
  selected,
  steps,
  undo,
  undoDepth,
} from './objects-helpers';

/*
 * Row B for an image (WG5-T03: IMG-02, IMG-04, IMG-08, IMG-09, IMG-12). Every control writes a
 * field of the element and never the asset, so the original is always there to go back to.
 */

const imageOf = (page: Page) => selected<ImageElement>(page);
async function open(page: Page, name: string): Promise<Locator> {
  await row(page).getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  return page.getByRole('dialog');
}

const crop = { x: 0.1, y: 0.2, w: 0.6, h: 0.5 };

/** A picture on the slide, cropped, so a test can see what a control leaves alone. */
async function addPicture(page: Page, extra: Record<string, unknown> = {}): Promise<string> {
  const assetId = await importPicture(page, 'harbour.png');
  await addElement(page, {
    id: 'e_picture',
    type: 'image',
    name: 'harbour',
    alt: 'harbour',
    frame: { x: 560, y: 280, w: 640, h: 400 },
    rotation: 5,
    fit: 'cover',
    assetId,
    crop,
    ...extra,
  });
  await expect(row(page)).toHaveAttribute('data-selection', 'image');
  return assetId;
}

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('fit: cover, contain and stretch', async ({ page }) => {
  await addPicture(page);
  const fit = row(page).getByRole('button', { name: 'התאמה למסגרת' });
  await fit.click();
  await expect(page.getByRole('menuitemradio')).toHaveCount(3);
  await expect(page.getByRole('menuitemradio', { name: 'מילוי המסגרת' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(
    await steps(page, () => page.getByRole('menuitemradio', { name: 'התמונה כולה' }).click()),
  ).toBe(1);
  expect((await imageOf(page)).fit).toBe('contain');

  await fit.click();
  await page.getByRole('menuitemradio', { name: 'מתיחה' }).click();
  expect((await imageOf(page)).fit).toBe('fill');
  await undo(page);
  expect((await imageOf(page)).fit).toBe('contain');
  await undo(page);
  expect(await imageOf(page)).toMatchObject({ fit: 'cover', crop });
});

test('flip horizontally and vertically', async ({ page }) => {
  await addPicture(page);
  const horizontal = row(page).getByRole('button', { name: 'היפוך אופקי' });
  const vertical = row(page).getByRole('button', { name: 'היפוך אנכי' });
  await expect(horizontal).toHaveAttribute('aria-pressed', 'false');

  expect(await steps(page, () => horizontal.click())).toBe(1);
  expect((await imageOf(page)).flipH).toBe(true);
  await expect(horizontal).toHaveAttribute('aria-pressed', 'true');
  // Mirrored inside its box; the box keeps its rotation.
  await expect(onStage(page, 'e_picture').locator('> div')).toHaveCSS(
    'transform',
    'matrix(-1, 0, 0, 1, 0, 0)',
  );

  await vertical.click();
  expect(await imageOf(page)).toMatchObject({ flipH: true, flipV: true, rotation: 5 });
  // Off again removes the field rather than storing false.
  await horizontal.click();
  expect(await imageOf(page)).not.toHaveProperty('flipH');
  await undo(page);
  await undo(page);
  expect(await imageOf(page)).toMatchObject({ flipH: true });
  expect(await imageOf(page)).not.toHaveProperty('flipV');
});

test('replace: another picture in the same frame, with the crop and every style kept', async ({
  page,
}) => {
  const original = await addPicture(page, {
    border: { color: { token: 'accent' }, width: 6 },
    effects: { radius: 20 },
    opacity: 0.8,
    flipH: true,
  });
  const before = await imageOf(page);
  const bytes = await pngBytes(page, ['#0f9d8a', '#e5484d'], [300, 900]);

  const chooser = page.waitForEvent('filechooser');
  const depth = await undoDepth(page);
  await row(page).getByRole('button', { name: 'החלפת תמונה' }).click();
  const dialog = await chooser;
  expect(dialog.isMultiple()).toBe(false);
  await dialog.setFiles({ name: 'tower.png', mimeType: 'image/png', buffer: bytes });
  await expect.poll(async () => (await imageOf(page)).assetId).not.toBe(original);

  const after = await imageOf(page);
  const { assetId, alt, ...rest } = after;
  const { assetId: _assetId, alt: _alt, ...kept } = before;
  // Only the picture changed: the frame, the rotation, the crop, the border and the effects stay.
  expect(rest).toEqual(kept);
  expect(after).toMatchObject({ frame: before.frame, crop, rotation: 5, opacity: 0.8 });
  // The alt text was the old file's name, so it follows the new file.
  expect(alt).toBe('tower');
  const assets = (await deck(page)).assets;
  expect(assets[assetId ?? '']).toMatchObject({ name: 'tower.png', width: 300, height: 900 });
  // The original asset is untouched (IMG-12), and still in the deck for undo.
  expect(assets[original]).toMatchObject({ name: 'harbour.png', width: 640, height: 400 });
  await expect(onStage(page, 'e_picture').locator('img')).toHaveAttribute('src', /^blob:/);

  // One step: the new asset and the swap go together.
  expect(await undoDepth(page)).toBe(depth + 1);
  await undo(page);
  expect(await imageOf(page)).toEqual(before);
  expect(Object.keys((await deck(page)).assets)).toEqual([original]);
});

test('replace keeps an alt text the user wrote', async ({ page }) => {
  await addPicture(page, { alt: 'נמל חיפה בשקיעה' });
  const bytes = await pngBytes(page);
  const chooser = page.waitForEvent('filechooser');
  await row(page).getByRole('button', { name: 'החלפת תמונה' }).click();
  await (await chooser).setFiles({ name: 'other.png', mimeType: 'image/png', buffer: bytes });
  await expect.poll(async () => Object.keys((await deck(page)).assets).length).toBe(2);
  expect((await imageOf(page)).alt).toBe('נמל חיפה בשקיעה');
});

test('border, corners, shadow and opacity', async ({ page }) => {
  await addPicture(page);

  const border = await open(page, 'מסגרת');
  await expect(border.getByRole('radio', { name: 'ללא' })).toHaveAttribute('data-state', 'on');
  expect(await steps(page, () => border.getByRole('radio', { name: 'רציף' }).click())).toBe(1);
  const width = border.getByRole('textbox', { name: 'עובי' });
  await width.fill('10');
  await width.press('Enter');
  expect((await imageOf(page)).border).toEqual({ color: { token: 'text' }, width: 10 });
  // A border has no line ends to choose.
  await expect(border.getByRole('radiogroup', { name: 'קצוות' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  const corners = await open(page, 'פינות');
  expect(
    await steps(page, () => dragSlider(page, corners.getByRole('slider', { name: 'רדיוס' }), -60)),
  ).toBe(1);
  const radius = (await imageOf(page)).effects?.radius ?? 0;
  expect(radius).toBeGreaterThan(0);
  await expect(onStage(page, 'e_picture')).toHaveCSS('border-radius', `${radius}px`);
  await page.keyboard.press('Escape');

  const shadow = await open(page, 'צל');
  await shadow.getByRole('radio', { name: 'צל' }).click();
  expect((await imageOf(page)).effects).toEqual({
    radius,
    shadow: (await deck(page)).theme.shadow,
  });
  // An image is its own box, so its shadow can spread.
  await expect(shadow.getByRole('slider', { name: 'התפשטות' })).toBeVisible();
  await page.keyboard.press('Escape');

  const opacity = await open(page, 'אטימות');
  const field = opacity.getByRole('textbox', { name: 'אטימות' });
  await field.fill('60');
  expect(await steps(page, () => field.press('Enter'))).toBe(1);
  expect((await imageOf(page)).opacity).toBe(0.6);

  // None of it touched the picture or its crop.
  expect(await imageOf(page)).toMatchObject({ crop, fit: 'cover', rotation: 5 });
  await undo(page);
  await undo(page);
  await undo(page);
  expect(await imageOf(page)).toMatchObject({ opacity: 1, border: { width: 10 } });
  expect(await imageOf(page)).not.toHaveProperty('effects');
});

test('while the image is being cropped, the row is left to the crop tools', async ({ page }) => {
  await addPicture(page);
  const mine = [
    'התאמה למסגרת',
    'היפוך אופקי',
    'היפוך אנכי',
    'החלפת תמונה',
    'מסגרת',
    'פינות',
    'צל',
    'אטימות',
  ];
  for (const name of mine) {
    await expect(row(page).getByRole('button', { name, exact: true })).toBeVisible();
  }
  await page.evaluate(() => window.slidr!.selection.getState().startEditing('e_picture'));
  await expect(row(page)).toHaveAttribute('data-selection', 'image');
  for (const name of mine) {
    await expect(row(page).getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  await page.evaluate(() => window.slidr!.selection.getState().stopEditing());
  await expect(row(page).getByRole('button', { name: 'החלפת תמונה' })).toBeVisible();
});

test('a placeholder without a picture takes one through Replace', async ({ page }) => {
  await addElement(page, {
    id: 'e_placeholder',
    type: 'image',
    frame: { x: 560, y: 280, w: 640, h: 400 },
    fit: 'cover',
    prompt: 'A harbour at dusk',
  });
  const bytes = await pngBytes(page);
  const chooser = page.waitForEvent('filechooser');
  await row(page).getByRole('button', { name: 'החלפת תמונה' }).click();
  await (await chooser).setFiles({ name: 'dusk.png', mimeType: 'image/png', buffer: bytes });
  await expect.poll(async () => (await imageOf(page)).assetId).toBeDefined();
  expect(await imageOf(page)).toMatchObject({
    alt: 'dusk',
    frame: { x: 560, y: 280, w: 640, h: 400 },
  });
  await expect(onStage(page, 'e_placeholder').locator('img')).toBeVisible();
});
