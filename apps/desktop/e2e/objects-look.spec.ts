import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { ImageElement } from '@slidr/model';
import {
  addElement,
  currentSlide,
  deck,
  dragSlider,
  importPicture,
  onStage,
  openApp,
  pageProblems,
  row,
  selected,
  undo,
  undoDepth,
} from './objects-helpers';

/*
 * The look of a picture in row B (WG5-T09: IMG-05, IMG-06, IMG-07, IMG-10): mask, adjustments,
 * ready-made filters and duotone in the theme's colours, and the picture as the slide background.
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/objects/${name}.png`, import.meta.url));

const imageOf = (page: Page) => selected<ImageElement>(page);

async function open(page: Page, name: string): Promise<Locator> {
  await row(page).getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  return page.getByRole('dialog');
}

async function addPicture(page: Page, extra: Record<string, unknown> = {}): Promise<string> {
  const assetId = await importPicture(page, 'harbour.png');
  await addElement(page, {
    id: 'e_picture',
    type: 'image',
    name: 'harbour',
    alt: 'harbour',
    frame: { x: 560, y: 280, w: 640, h: 400 },
    fit: 'cover',
    assetId,
    ...extra,
  });
  await expect(row(page)).toHaveAttribute('data-selection', 'image');
  return assetId;
}

/** The `<img>` of the picture on the Stage, and the box that clips it. */
const img = (page: Page) => onStage(page, 'e_picture').locator('img');
const clip = (page: Page) => onStage(page, 'e_picture').locator('> div');

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test('mask: a circle, rounded corners with a radius, a shape of the library, and none', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addPicture(page);
  const steps = await undoDepth(page);
  const popover = await open(page, 'Mask');

  await popover.getByRole('button', { name: 'Circle' }).click();
  expect((await imageOf(page)).mask).toEqual({ kind: 'ellipse' });
  await expect(clip(page)).toHaveCSS('border-radius', '50%');

  await popover.getByRole('button', { name: 'Rounded corners' }).click();
  expect((await imageOf(page)).mask).toEqual({ kind: 'rounded', radius: 50 });
  await dragSlider(page, popover.getByRole('slider', { name: 'Corner radius' }), 30);
  const radius = (await imageOf(page)).mask;
  expect(radius?.kind === 'rounded' && radius.radius).toBeGreaterThan(60);
  // Three choices so far, and the drag: four undo steps.
  expect(await undoDepth(page)).toBe(steps + 3);

  await popover.getByRole('button', { name: '5-point star' }).click();
  expect((await imageOf(page)).mask).toEqual({ kind: 'shape', preset: 'star5' });
  await expect(popover.getByRole('button', { name: '5-point star' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await clip(page).evaluate((box) => getComputedStyle(box).clipPath)).toContain('path(');
  // With a mask the corners of the picture are the mask's: row B offers no corner radius.
  await page.keyboard.press('Escape');
  await expect(row(page).getByRole('button', { name: 'Corners', exact: true })).toHaveCount(0);

  await undo(page);
  expect((await imageOf(page)).mask?.kind).toBe('rounded');
  const again = await open(page, 'Mask');
  await again.getByRole('button', { name: 'No mask' }).click();
  expect((await imageOf(page)).mask).toBeUndefined();
});

test('adjustments: a drag is one undo step, and reset brings the picture back', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  await addPicture(page);
  const steps = await undoDepth(page);
  const popover = await open(page, 'Adjustments');
  await expect(popover.getByRole('button', { name: 'Reset the adjustments' })).toBeDisabled();

  await dragSlider(page, popover.getByRole('slider', { name: 'Brightness' }), 40);
  const { adjust } = await imageOf(page);
  expect(adjust?.brightness).toBeGreaterThan(1.2);
  expect(await undoDepth(page)).toBe(steps + 1);
  await expect(img(page)).toHaveCSS('filter', /brightness/);

  await dragSlider(page, popover.getByRole('slider', { name: 'Temperature' }), 60);
  expect((await imageOf(page)).adjust?.temperature).toBeGreaterThan(0.3);
  // Temperature has no CSS filter: the picture refers to an SVG filter drawn beside it.
  await expect(img(page)).toHaveCSS('filter', /url\(/);
  await expect(onStage(page, 'e_picture').locator('filter feColorMatrix')).toHaveCount(1);

  await popover.getByRole('button', { name: 'Reset the adjustments' }).click();
  expect((await imageOf(page)).adjust).toBeUndefined();
  await expect(img(page)).toHaveCSS('filter', 'none');
  await undo(page);
  expect((await imageOf(page)).adjust?.temperature).toBeGreaterThan(0.3);
});

test('filters: a ready-made look, and a duotone that follows the theme', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addPicture(page);
  const popover = await open(page, 'Filter');
  await expect(popover.getByRole('button', { name: 'No filter' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await popover.getByRole('button', { name: 'Noir' }).click();
  expect((await imageOf(page)).filterPreset).toBe('noir');
  await expect(img(page)).toHaveCSS('filter', /grayscale\(1\) contrast\(1\.35\)/);

  await popover.getByRole('button', { name: 'Duotone: Primary and Background' }).click();
  expect((await imageOf(page)).filterPreset).toBe('duotone:primary:bg');
  const table = () =>
    onStage(page, 'e_picture').locator('filter feFuncR').getAttribute('tableValues');
  const before = await table();
  expect(before).toBeTruthy();
  // Another primary colour in the theme: the same picture is drawn in the new one.
  await page.evaluate(() => {
    const { bus } = window.slidr!;
    bus.dispatch({
      type: 'theme.update',
      patch: { colors: { ...bus.deck.theme.colors, primary: '#b91c1c' } },
    });
  });
  await expect.poll(table).not.toBe(before);
  expect((await table())!.startsWith('0.7255')).toBe(true);

  await popover.getByRole('button', { name: 'No filter' }).click();
  expect((await imageOf(page)).filterPreset).toBeUndefined();
  await expect(onStage(page, 'e_picture').locator('filter')).toHaveCount(0);
});

test('a picture becomes the background of its slide, and undo brings the element back', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const assetId = await addPicture(page);
  const steps = await undoDepth(page);
  await row(page).getByTestId('image-as-background').click();
  const slide = await currentSlide(page);
  expect(slide.elements).toEqual([]);
  expect(slide.background).toEqual({ fill: { kind: 'image', assetId, fit: 'cover' } });
  await expect(row(page)).toHaveAttribute('data-selection', 'none');
  expect(await undoDepth(page)).toBe(steps + 1);
  await undo(page);
  const back = await currentSlide(page);
  expect(back.background).toBeUndefined();
  expect(back.elements.map((element) => element.id)).toEqual(['e_picture']);
});

test('the background of a picture is removed on this machine, as one undo step', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const original = await addPicture(page);
  const steps = await undoDepth(page);

  await row(page).getByTestId('image-cutout').click();
  await page.getByRole('menuitem', { name: 'A flat background colour' }).click();
  await expect.poll(async () => (await imageOf(page)).assetId).not.toBe(original);
  const cutout = (await imageOf(page)).assetId!;
  const assets = (await deck(page)).assets;
  // A new picture with transparency, made from the original, which stays in the deck.
  expect(assets[cutout]).toMatchObject({
    mime: 'image/png',
    lineage: { parentAssetId: original },
    name: 'harbour.png',
  });
  expect(assets[original]).toBeDefined();
  expect(await undoDepth(page)).toBe(steps + 1);
  // The left half of the test picture is the colour of its border: it is see-through now.
  const alpha = await page.evaluate(
    async (src) => {
      const bitmap = await createImageBitmap(await (await fetch(src)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const g = canvas.getContext('2d')!;
      g.drawImage(bitmap, 0, 0);
      const at = (x: number) => g.getImageData(x, bitmap.height / 2, 1, 1).data[3];
      return [at(10), at(bitmap.width - 10)];
    },
    (await img(page).getAttribute('src'))!,
  );
  expect(alpha).toEqual([0, 255]);

  await undo(page);
  expect((await imageOf(page)).assetId).toBe(original);

  // By the subject: the model of the app, which a plain browser stands in for.
  await row(page).getByTestId('image-cutout').click();
  await page.getByRole('menuitem', { name: 'By the subject of the picture' }).click();
  await expect.poll(async () => (await imageOf(page)).assetId).toBe(cutout);
});

for (const theme of ['light', 'dark'] as const) {
  for (const { lang, dir } of [
    { lang: 'he', dir: 'rtl' },
    { lang: 'en', dir: 'ltr' },
  ] as const) {
    test(`the look popovers ${theme}-${dir}-1366`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await openApp(page, { lang, theme });
      await addPicture(page, { filterPreset: 'duotone:primary:bg' });
      const names =
        lang === 'he'
          ? { mask: 'מסכה', adjust: 'התאמות', filter: 'פילטר' }
          : { mask: 'Mask', adjust: 'Adjustments', filter: 'Filter' };
      for (const [key, name] of Object.entries(names)) {
        await open(page, name);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        await page.screenshot({ path: out(`image-${key}-${theme}-${dir}-1366`) });
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
    });
  }
}
