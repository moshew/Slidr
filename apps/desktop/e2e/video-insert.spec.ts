import { expect, test, type Page } from '@playwright/test';
import type { AudioElement, VideoElement } from '@slidr/model';
import {
  currentSlide,
  deck,
  onStage,
  openApp,
  pageProblems,
  pngBytes,
  row,
  selected,
  steps,
  undo,
} from './objects-helpers';
import {
  CLIP_SECONDS,
  CLIP_SIZE,
  mediaLoaded,
  SOUND_FILE,
  SOUND_SECONDS,
  STAGE_VIDEO,
  testMedia,
  VIDEO_FILE,
} from './video-helpers';

/*
 * Taking a local video or audio file in (MED-01): the Insert media button of row A, and a file
 * dropped on the Stage. The plain browser of these tests reads the files into memory; in the app
 * the same button uses Tauri's file dialog and copies by path, which only the real window shows.
 */

const insertButton = (page: Page) =>
  page.getByTestId('top-tools-a').getByRole('button', { name: 'וידאו או אודיו' });

const redo = (page: Page) => page.evaluate(() => window.slidr!.bus.redo());

/** Clicks Insert media and hands the file dialog these files. Returns what the dialog asked for. */
async function choose(
  page: Page,
  files: { name: string; mimeType: string; buffer: Buffer }[],
): Promise<{ accept: string | null; multiple: boolean }> {
  const chooser = page.waitForEvent('filechooser');
  await insertButton(page).click();
  const dialog = await chooser;
  const accept = await dialog.element().getAttribute('accept');
  await dialog.setFiles(files);
  return { accept, multiple: dialog.isMultiple() };
}

test('the Insert media button takes a video in: one undo step, selected, at its own proportions', async ({
  page,
}) => {
  await openApp(page);
  const media = await testMedia(page);
  await expect(insertButton(page)).toBeEnabled();

  let asked: Awaited<ReturnType<typeof choose>> | undefined;
  const added = await steps(page, async () => {
    asked = await choose(page, [{ ...VIDEO_FILE, buffer: media.video }]);
    await expect(row(page)).toHaveAttribute('data-selection', 'media');
  });
  // The formats of MED-01, and several files at once.
  expect(asked).toEqual({ accept: '.mp4,.webm,.mp3,.wav,.m4a', multiple: true });
  expect(added).toBe(1);

  const video = await selected<VideoElement>(page);
  expect(video.type).toBe('video');
  expect(video).toMatchObject({ autoplay: false, loop: false, muted: false, volume: 1 });
  expect(video.name).toBe('clip');
  // The frame has the proportions of the picture, in the middle of the slide.
  expect(video.frame).toEqual({
    x: (1920 - CLIP_SIZE.w) / 2,
    y: (1080 - CLIP_SIZE.h) / 2,
    w: CLIP_SIZE.w,
    h: CLIP_SIZE.h,
  });
  // What the file says about itself is kept with the asset.
  const asset = (await deck(page)).assets[video.assetId]!;
  expect(asset).toMatchObject({
    kind: 'video',
    name: 'clip.webm',
    width: CLIP_SIZE.w,
    height: CLIP_SIZE.h,
    bytes: media.video.length,
    origin: 'upload',
  });
  expect(asset.durationMs).toBeGreaterThan((CLIP_SECONDS - 0.5) * 1000);
  expect(asset.durationMs).toBeLessThan((CLIP_SECONDS + 0.5) * 1000);

  // The Stage draws it, at rest, and the keyboard is on the Stage.
  await mediaLoaded(page, STAGE_VIDEO.replace('e_video', video.id));
  await expect(page.getByTestId('stage-surface')).toBeFocused();

  // One step back takes the clip and its asset away; one step forward brings both back.
  await undo(page);
  expect((await currentSlide(page)).elements).toHaveLength(0);
  expect((await deck(page)).assets[video.assetId]).toBeUndefined();
  await redo(page);
  expect((await currentSlide(page)).elements.map((e) => e.id)).toEqual([video.id]);
  expect((await deck(page)).assets[video.assetId]).toBeDefined();
  expect(pageProblems(page)).toEqual([]);
});

test('a sound comes in as a mark, with the length of its file', async ({ page }) => {
  await openApp(page);
  const media = await testMedia(page);
  await choose(page, [{ ...SOUND_FILE, buffer: media.sound }]);
  await expect(row(page)).toHaveAttribute('data-selection', 'media');

  const sound = await selected<AudioElement>(page);
  expect(sound.type).toBe('audio');
  expect(sound).toMatchObject({ autoplay: false, loop: false, volume: 1, showControls: true });
  expect(sound.frame).toMatchObject({ w: 320, h: 80 });
  const asset = (await deck(page)).assets[sound.assetId]!;
  expect(asset.kind).toBe('audio');
  expect(asset.durationMs).toBeGreaterThan((SOUND_SECONDS - 0.1) * 1000);
  expect(asset.durationMs).toBeLessThan((SOUND_SECONDS + 0.1) * 1000);
  // In the editor a sound is its mark.
  await expect(onStage(page, sound.id).locator('[data-slidr-placeholder="audio"]')).toBeVisible();
  expect(pageProblems(page)).toEqual([]);
});

test('several files are one undo step, and all of them end selected', async ({ page }) => {
  await openApp(page);
  const media = await testMedia(page);
  const added = await steps(page, async () => {
    await choose(page, [
      { ...VIDEO_FILE, buffer: media.video },
      { ...SOUND_FILE, buffer: media.sound },
    ]);
    await expect(row(page)).toHaveAttribute('data-selection', 'multiple');
  });
  expect(added).toBe(1);
  expect((await currentSlide(page)).elements.map((e) => e.type)).toEqual(['video', 'audio']);
  await undo(page);
  expect((await currentSlide(page)).elements).toHaveLength(0);
  expect(Object.keys((await deck(page)).assets)).toHaveLength(0);
});

test('the same file twice is one asset and two clips', async ({ page }) => {
  await openApp(page);
  const media = await testMedia(page);
  await choose(page, [{ ...VIDEO_FILE, buffer: media.video }]);
  await expect(row(page)).toHaveAttribute('data-selection', 'media');
  await choose(page, [{ ...VIDEO_FILE, buffer: media.video }]);
  await expect.poll(async () => (await currentSlide(page)).elements.length).toBe(2);
  expect(Object.keys((await deck(page)).assets)).toHaveLength(1);
});

test('a file that is not video or audio is refused, with a message', async ({ page }) => {
  await openApp(page);
  await testMedia(page);
  // The dialog's "all files" choice lets anything through.
  await choose(page, [{ name: 'photo.png', mimeType: 'image/png', buffer: await pngBytes(page) }]);
  await expect(page.getByRole('dialog')).toContainText('הקובץ אינו וידאו או אודיו');
  expect((await currentSlide(page)).elements).toHaveLength(0);
  expect(await page.evaluate(() => window.slidr!.bus.undoStack.length)).toBe(0);
});

test('a cancelled dialog changes nothing', async ({ page }) => {
  await openApp(page);
  await choose(page, []);
  await page.waitForTimeout(200);
  expect((await currentSlide(page)).elements).toHaveLength(0);
  expect(pageProblems(page)).toEqual([]);
});

test('a video and a sound dropped on the Stage still land on the slide (STG-09)', async ({
  page,
}) => {
  await openApp(page);
  const media = await testMedia(page);
  const surface = page.getByTestId('stage-surface');
  const box = (await page.getByTestId('stage-frame').boundingBox())!;
  await surface.evaluate(
    (el, { video, sound, x, y }) => {
      const file = (base64: string, name: string, type: string) =>
        new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name, { type });
      const data = new DataTransfer();
      data.items.add(file(video, 'clip.webm', 'video/webm'));
      data.items.add(file(sound, 'tone.wav', 'audio/wav'));
      el.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: data,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    {
      video: media.video.toString('base64'),
      sound: media.sound.toString('base64'),
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    },
  );
  await expect.poll(async () => (await currentSlide(page)).elements.length).toBe(2);
  const [video, sound] = (await currentSlide(page)).elements;
  expect([video?.type, sound?.type]).toEqual(['video', 'audio']);
  await expect(onStage(page, video!.id).locator('video')).toHaveAttribute(
    'data-slidr-clip',
    'video',
  );
  await expect(onStage(page, sound!.id).locator('audio')).toHaveAttribute(
    'data-slidr-clip',
    'audio',
  );
  // One undo step for the drop.
  expect(await page.evaluate(() => window.slidr!.bus.undoStack.length)).toBe(1);
  expect(pageProblems(page)).toEqual([]);
});
