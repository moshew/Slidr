import { expect, test } from '@playwright/test';
import type { ImageElement } from '@slidr/model';
import {
  currentSlide,
  importPicture,
  openApp,
  pageProblems,
  undo,
  undoDepth,
} from './objects-helpers';

// A picture of the media panel dragged onto the slide (WG5-T13): it lands where it is dropped,
// as one undo step.

test.afterEach(({ page }) => {
  expect(pageProblems(page)).toEqual([]);
});

test('a picture dragged from the media panel lands where it is dropped', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const assetId = await importPicture(page, 'harbour.png', ['#2f5bea', '#f59e0b'], [640, 400]);
  await page.getByTestId('activity-bar').locator('[data-panel="media"]').click();
  const tile = page.getByTestId('media-uploads').locator(`[data-asset="${assetId}"]`);
  await expect(tile).toBeVisible();
  const steps = await undoDepth(page);

  // Dropped a quarter of the way into the slide: the picture is centred on that point.
  const slide = page.getByTestId('stage-frame').locator('.slidr-slide');
  const box = (await slide.boundingBox())!;
  await tile.dragTo(slide, { targetPosition: { x: box.width / 4, y: box.height / 4 } });

  await expect.poll(async () => (await currentSlide(page)).elements.length).toBe(1);
  const [image] = (await currentSlide(page)).elements as ImageElement[];
  expect(image).toMatchObject({ type: 'image', assetId });
  const centre = { x: image!.frame.x + image!.frame.w / 2, y: image!.frame.y + image!.frame.h / 2 };
  expect(Math.abs(centre.x - 1920 / 4)).toBeLessThan(12);
  expect(Math.abs(centre.y - 1080 / 4)).toBeLessThan(12);
  expect(await undoDepth(page)).toBe(steps + 1);
  await undo(page);
  expect((await currentSlide(page)).elements).toEqual([]);

  // A click still adds it, in the middle of the slide.
  await tile.click();
  await expect.poll(async () => (await currentSlide(page)).elements.length).toBe(1);
});
