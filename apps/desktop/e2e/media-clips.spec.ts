import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { deck, elements, openApp, openMedia, undoDepth } from './media-helpers';

test('the Media upload button imports and places an audio file', async ({ page }) => {
  await openApp(page, { lang: 'en' });
  const panel = await openMedia(page, 'clips');
  const picking = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: 'Upload video or audio' }).click();
  const chooser = await picking;
  expect(await chooser.element().getAttribute('accept')).toContain('.wav');

  const samples = 2000;
  const bytes = Buffer.alloc(44 + samples, 128);
  bytes.write('RIFF', 0);
  bytes.writeUInt32LE(36 + samples, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(8000, 28);
  bytes.writeUInt16LE(1, 32);
  bytes.writeUInt16LE(8, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(samples, 40);
  await chooser.setFiles({ name: 'Short cue.wav', mimeType: 'audio/wav', buffer: bytes });

  await expect(panel.locator('[data-asset]')).toHaveCount(1);
  const clip = (await elements(page)).at(-1);
  expect(clip?.type).toBe('audio');
  expect(
    Object.values((await deck(page)).assets).some(
      (asset) => asset.id === (clip && 'assetId' in clip ? clip.assetId : undefined),
    ),
  ).toBe(true);
});

test('video and audio live in Media and existing files can be reused', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page, { lang: 'en' });
  const panel = await openMedia(page, 'clips');
  await expect(panel.getByText('No video or audio in the presentation yet')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Upload video or audio' })).toBeVisible();

  const [audioId, videoId] = await page.evaluate(async () => {
    const editor = window.slidr!;
    const audio = await editor.assets.import(
      new File([new Uint8Array(44)], 'Opening theme.wav', { type: 'audio/wav' }),
    );
    const video = await editor.assets.import(
      new File([new Uint8Array([1, 2, 3])], 'Team introduction.webm', { type: 'video/webm' }),
    );
    editor.bus.dispatch({ type: 'asset.add', asset: { ...audio, durationMs: 32000 } });
    editor.bus.dispatch({ type: 'asset.add', asset: { ...video, durationMs: 78000 } });
    return [audio.id, video.id];
  });

  const audio = panel.locator(`[data-asset="${audioId}"]`);
  const video = panel.locator(`[data-asset="${videoId}"]`);
  await expect(audio).toHaveAccessibleName('Add to the slide: Opening theme.wav');
  await expect(video).toHaveAccessibleName('Add to the slide: Team introduction.webm');
  await expect(panel.getByText('0:32')).toBeVisible();
  await expect(panel.getByText('1:18')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: fileURLToPath(new URL('../test-results/media/clips-en-1366.png', import.meta.url)),
  });

  const before = await undoDepth(page);
  await audio.click();
  expect((await elements(page)).at(-1)).toMatchObject({ type: 'audio', assetId: audioId });
  expect(await undoDepth(page)).toBe(before + 1);

  await panel.locator(`[data-remove-asset="${videoId}"]`).click({ force: true });
  await expect(video).toHaveCount(0);
  expect((await deck(page)).assets).not.toHaveProperty(videoId);

  await panel.locator(`[data-remove-asset="${audioId}"]`).click({ force: true });
  await expect(page.getByRole('dialog').or(page.getByRole('alertdialog'))).toContainText(
    'The presentation uses this file',
  );
  expect((await deck(page)).assets).toHaveProperty(audioId);
});

test('the Media tab and Elements grid fit in Hebrew at the narrow panel width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page, { lang: 'he' });
  await openMedia(page, 'clips');
  const splitter = page.getByTestId('panel-splitter');
  await splitter.focus();
  await splitter.press('Home');
  await expect(splitter).toHaveAttribute('aria-valuenow', '280');
  await page.getByTestId('media-tab-clips').click();
  await page.evaluate(async () => {
    const editor = window.slidr!;
    const audio = await editor.assets.import(
      new File([new Uint8Array(44)], 'פתיח לאירוע.wav', { type: 'audio/wav' }),
    );
    const video = await editor.assets.import(
      new File([new Uint8Array([1, 2, 3])], 'היכרות עם הצוות.webm', { type: 'video/webm' }),
    );
    editor.bus.dispatch({ type: 'asset.add', asset: { ...audio, durationMs: 32000 } });
    editor.bus.dispatch({ type: 'asset.add', asset: { ...video, durationMs: 78000 } });
  });
  const tabs = page.getByTestId('media-panel').getByRole('tab');
  await expect(tabs).toHaveCount(4);
  const bounds = await tabs.evaluateAll((items) =>
    items.map((item) => {
      const box = item.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width, scroll: item.scrollWidth };
    }),
  );
  expect(bounds.every((box) => box.scroll <= box.width + 1)).toBe(true);
  const tabList = await page.getByTestId('media-panel').getByRole('tablist').boundingBox();
  expect(tabList).not.toBeNull();
  expect(
    bounds.every((box) => box.left >= tabList!.x && box.right <= tabList!.x + tabList!.width),
  ).toBe(true);
  await page.screenshot({
    path: fileURLToPath(new URL('../test-results/media/clips-he-1366.png', import.meta.url)),
  });

  await page.getByTestId('activity-bar').locator('[data-panel="elements"]').click();
  const collections = page.getByTestId('element-collections').locator('[data-collection]');
  await expect(collections).toHaveCount(7);
  expect(
    await collections.evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-collection')),
    ),
  ).toEqual(['designs', 'shapes', 'graphics', 'emoji', 'icons', 'frames', 'tables']);
  await page.screenshot({
    path: fileURLToPath(new URL('../test-results/media/elements-he-280.png', import.meta.url)),
  });
});
