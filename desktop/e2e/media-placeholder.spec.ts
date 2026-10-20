import { expect, test } from '@playwright/test';
import type { ImageElement } from '@slidr/model';
import {
  addPlaceholders,
  collectErrors,
  elements,
  openApp,
  openMedia,
  undo,
  undoDepth,
} from './media-helpers';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9xkKAAAAAASUVORK5CYII=',
  'base64',
);

test('clicking an empty image opens the file picker and fills its frame', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, { lang: 'he' });
  const [id] = await addPlaceholders(page, ['Portrait of the couple']);
  const before = (await elements(page))[0] as ImageElement;
  const steps = await undoDepth(page);

  const chooser = page.waitForEvent('filechooser');
  await page
    .getByTestId('stage-frame')
    .locator(`[data-element-id="${id}"] [data-slidr-placeholder="image"] svg`)
    .click();
  await (await chooser).setFiles({ name: 'portrait.png', mimeType: 'image/png', buffer: PNG });

  await expect.poll(async () => ((await elements(page))[0] as ImageElement).assetId).toBeTruthy();
  const after = (await elements(page))[0] as ImageElement;
  expect(after.frame).toEqual(before.frame);
  expect(after.id).toBe(id);
  expect(await undoDepth(page)).toBe(steps + 1);
  await undo(page);
  expect((await elements(page))[0]).toEqual(before);
  expect(errors).toEqual([]);
});

test('dragging an uploaded image into an empty image fills that frame', async ({ page }) => {
  const errors = collectErrors(page);
  await openApp(page, { lang: 'en' });
  const [id] = await addPlaceholders(page, ['Wedding portrait']);
  const assetId = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 30;
    canvas.getContext('2d')!.fillRect(0, 0, 40, 30);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((value) => resolve(value!), 'image/png'),
    );
    const editor = window.slidr!;
    const asset = await editor.assets.import(
      new File([blob], 'portrait.png', { type: 'image/png' }),
    );
    editor.bus.dispatch({ type: 'asset.add', asset });
    return asset.id;
  });
  const panel = await openMedia(page, 'uploads');
  const before = (await elements(page))[0] as ImageElement;
  const steps = await undoDepth(page);

  await panel
    .locator(`[data-asset="${assetId}"]`)
    .dragTo(
      page
        .getByTestId('stage-frame')
        .locator(`[data-element-id="${id}"] [data-slidr-placeholder="image"]`),
    );

  const after = (await elements(page))[0] as ImageElement;
  expect(after.assetId).toBe(assetId);
  expect(after.frame).toEqual(before.frame);
  expect(await elements(page)).toHaveLength(1);
  expect(await undoDepth(page)).toBe(steps + 1);
  await undo(page);
  expect((await elements(page))[0]).toEqual(before);
  expect(errors).toEqual([]);
});
