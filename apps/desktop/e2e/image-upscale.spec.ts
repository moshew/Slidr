import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { ImageElement } from '@slidr/model';
import {
  addElement,
  deck,
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
 * "Upscale" in row B of a picture (AIO-04): the picture drawn again at two or four times its
 * size, on this machine, as one undo step. In a plain browser the work is a stand-in that only
 * resamples (`memoryUpscaler`): what is tried here is everything around the model, which is the
 * same in the app: the choices and what each says, the picture that takes the other's place,
 * the progress, and stopping. The model itself is tried in Rust (`image_process::service`).
 */

const out = (name: string) =>
  fileURLToPath(new URL(`../test-results/media/${name}.png`, import.meta.url));

const imageOf = (page: Page) => selected<ImageElement>(page);
const button = (page: Page) => row(page).getByTestId('image-upscale');

/** What a picture has besides its file: all of it stays when the picture is upscaled. */
const LOOK = {
  frame: { x: 560, y: 280, w: 640, h: 400 },
  crop: { x: 0.1, y: 0.15, w: 0.8, h: 0.7 },
  mask: { kind: 'rounded', radius: 32 },
  adjust: { brightness: 1.1 },
  fit: 'cover',
} as const;

async function addPicture(page: Page, size: [number, number] = [640, 400]): Promise<string> {
  const assetId = await importPicture(page, 'harbour.png', ['#2f5bea', '#f59e0b'], size);
  await addElement(page, {
    id: 'e_picture',
    type: 'image',
    name: 'harbour',
    alt: 'harbour',
    assetId,
    ...LOOK,
  });
  await expect(row(page)).toHaveAttribute('data-selection', 'image');
  return assetId;
}

/** Turns the knobs of the page's stand-in: whether a model is there, and how long a job takes. */
async function standIn(
  page: Page,
  knobs: { installed?: boolean; tiles?: number; tileMs?: number },
): Promise<void> {
  await page.evaluate(
    async ({ path, knobs }) => {
      const module = (await import(/* @vite-ignore */ path)) as {
        pageUpscaling: Record<string, unknown>;
      };
      Object.assign(module.pageUpscaling, knobs);
    },
    { path: '/src/images/upscaler.ts', knobs },
  );
}

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test('a picture is upscaled four times as one undo step, and keeps its frame, crop and look', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const original = await addPicture(page);
  const before = await imageOf(page);
  const steps = await undoDepth(page);

  await button(page).click();
  // Each choice says what it gives.
  const twice = page.getByRole('menuitem', { name: '2 times the size' });
  const four = page.getByRole('menuitem', { name: '4 times the size' });
  await expect(twice).toContainText('1280 × 800');
  await expect(four).toContainText('2560 × 1600');
  await expect(four).toContainText('pixels');
  await four.click();

  await expect.poll(async () => (await imageOf(page)).assetId).not.toBe(original);
  const after = await imageOf(page);
  // Only the picture changed: the frame, the crop, the mask and the adjustments are the element's.
  expect(after).toEqual({ ...before, assetId: after.assetId });
  const assets = (await deck(page)).assets;
  expect(assets[after.assetId!]).toMatchObject({
    width: 2560,
    height: 1600,
    name: 'harbour.png',
    origin: 'upload',
    lineage: { parentAssetId: original },
  });
  // The original stays in the deck (IMG-12).
  expect(assets[original]).toBeDefined();
  expect(await undoDepth(page)).toBe(steps + 1);
  // What the Stage draws is the larger file, in the same box.
  const img = onStage(page, 'e_picture').locator('img');
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(2560);
  await expect(button(page)).toBeVisible();

  await undo(page);
  expect(await imageOf(page)).toEqual(before);
  expect((await deck(page)).assets[after.assetId!]).toBeUndefined();

  // Two times: the same, at half that.
  await button(page).click();
  await page.getByRole('menuitem', { name: '2 times the size' }).click();
  await expect.poll(async () => (await imageOf(page)).assetId).not.toBe(original);
  const half = (await deck(page)).assets[(await imageOf(page)).assetId!];
  expect(half).toMatchObject({ width: 1280, height: 800 });
});

test('while it works its place says how far it is, and the button beside it stops it', async ({
  page,
}) => {
  await openApp(page, { lang: 'en' });
  const original = await addPicture(page);
  const steps = await undoDepth(page);
  // Slow enough to be seen at work: ten tiles, a third of a second each.
  await standIn(page, { tiles: 10, tileMs: 300 });

  await button(page).click();
  await page.getByRole('menuitem', { name: '4 times the size' }).click();
  // The button gives its place to the progress and to the way to stop.
  const work = row(page).getByTestId('image-upscale-work');
  await expect(work.getByRole('status')).toHaveText(/Upscaling the picture: \d+%\s*\d+%/);
  await expect(button(page)).toHaveCount(0);
  const stop = work.getByRole('button', { name: 'Stop upscaling' });
  // The keyboard is on it: the button that was pressed is gone, and the page did not take it.
  await expect(stop).toBeFocused();
  await expect
    .poll(async () => Number.parseInt(await work.locator('span[aria-hidden]').innerText(), 10))
    .toBeGreaterThan(0);
  await page.screenshot({ path: out('upscale-working-en-light') });
  await stop.click();

  // Stopped at once for the user: the button is back, and the picture is the one it was.
  await expect(work).toHaveCount(0);
  await expect(button(page)).toBeFocused();
  // Past the time the whole job would have taken, nothing was put in its place.
  await page.waitForTimeout(3500);
  expect((await imageOf(page)).assetId).toBe(original);
  expect(await undoDepth(page)).toBe(steps);
  expect(Object.keys((await deck(page)).assets)).toEqual([original]);

  // And it can be asked for again.
  await standIn(page, { tiles: 2, tileMs: 20 });
  await button(page).click();
  await page.getByRole('menuitem', { name: '2 times the size' }).click();
  await expect.poll(async () => (await imageOf(page)).assetId).not.toBe(original);
  expect(await undoDepth(page)).toBe(steps + 1);
  await expect(button(page)).toBeVisible();
});

test('without the model the choices are there, off, and say why', async ({ page }) => {
  await openApp(page);
  await standIn(page, { installed: false });
  const original = await addPicture(page);
  await button(page).click();
  for (const name of ['פי 2', 'פי 4']) {
    const item = page.getByRole('menuitem', { name });
    await expect(item).toBeDisabled();
    await expect(item).toContainText('המודל אינו מותקן');
  }
  await page.screenshot({ path: out('upscale-no-model-he-light') });
  await page.keyboard.press('Escape');
  expect((await imageOf(page)).assetId).toBe(original);
});

test('a picture too large to go four times says so, and still goes two', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  // 2048 by 2048: four times would be 67 megapixels.
  await addPicture(page, [2048, 2048]);
  await button(page).click();
  const four = page.getByRole('menuitem', { name: '4 times the size' });
  await expect(four).toBeDisabled();
  await expect(four).toContainText('The picture is too large');
  const twice = page.getByRole('menuitem', { name: '2 times the size' });
  await expect(twice).toBeEnabled();
  await expect(twice).toContainText('4096 × 4096');
  await page.keyboard.press('Escape');
});

test('a picture that waits for its file has nothing to upscale', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  await addElement(page, {
    id: 'e_empty',
    type: 'image',
    name: 'placeholder',
    frame: { x: 560, y: 280, w: 640, h: 400 },
    fit: 'cover',
  });
  await expect(row(page)).toHaveAttribute('data-selection', 'image');
  await expect(button(page)).toBeDisabled();
});

for (const theme of ['light', 'dark'] as const) {
  for (const lang of ['he', 'en'] as const) {
    test(`the choices of Upscale: ${theme}, ${lang}`, async ({ page }) => {
      await openApp(page, { lang, theme });
      await addPicture(page, [1024, 768]);
      await button(page).click();
      await expect(page.getByRole('menuitem')).toHaveCount(2);
      // The sizes are numbers: they read left to right in both languages.
      await expect(page.getByRole('menuitem').last()).toContainText('4096 × 3072');
      await page.screenshot({ path: out(`upscale-menu-${lang}-${theme}`) });
      await page.keyboard.press('Escape');
    });
  }
}

for (const lang of ['he', 'en'] as const) {
  test(`the row of a picture still fits at 1366 with Upscale in it, at rest and at work: ${lang}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, { lang });
    await addPicture(page);
    const fits = async () => {
      const bar = (await row(page).boundingBox())!;
      // Every button of the row is inside it, whichever way the row runs.
      for (const box of await row(page)
        .getByRole('button')
        .evaluateAll((buttons) =>
          buttons.map((b) => {
            const { left, right } = b.getBoundingClientRect();
            return { left, right };
          }),
        )) {
        expect(box.left).toBeGreaterThanOrEqual(bar.x);
        expect(box.right).toBeLessThanOrEqual(bar.x + bar.width);
      }
      expect(await row(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    };
    await expect(button(page)).toBeVisible();
    await fits();
    // At work the button gives its place to two things, a little wider than it was.
    await standIn(page, { tiles: 10, tileMs: 300 });
    await button(page).click();
    await page.getByRole('menuitem').first().click();
    const work = row(page).getByTestId('image-upscale-work');
    await expect(work).toBeVisible();
    await fits();
    await page.screenshot({ path: out(`upscale-working-1366-${lang}`) });
    await work.getByRole('button').click();
    await expect(work).toHaveCount(0);
  });
}
