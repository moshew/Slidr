import { expect, test, type Page } from '@playwright/test';
import type { AudioElement, VideoElement } from '@slidr/model';
import {
  addElement,
  deck,
  dragSlider,
  pageProblems,
  row,
  selected,
  shape,
  steps,
  undo,
} from './objects-helpers';
import {
  addClip,
  lastStart,
  mediaLoaded,
  mediaState,
  noteStarts,
  openWithMedia,
  startedFrom,
  SOUND_SECONDS,
  STAGE_SOUND,
  STAGE_VIDEO,
  watchMedia,
} from './video-helpers';

/*
 * Playing the selected clip in place, and how a clip plays (MED-02): row B for a video and for a
 * sound. Playing changes nothing in the deck; every setting is one `element.update`, undone and
 * redone as one step.
 */

const redo = (page: Page) => page.evaluate(() => window.slidr!.bus.redo());
const play = (page: Page) => page.getByTestId('clip-play');
const tool = (page: Page, name: string) => row(page).getByRole('button', { name, exact: true });

/** The deck as text, to see that playing left it alone. */
const deckJson = (page: Page) => page.evaluate(() => JSON.stringify(window.slidr!.bus.deck));

test('a video plays in place with its sound, and the deck does not change', async ({ page }) => {
  const media = await openWithMedia(page);
  await addClip(page, 'video', media.video);
  await mediaLoaded(page, STAGE_VIDEO);
  const before = await deckJson(page);
  const history = await page.evaluate(() => window.slidr!.bus.undoStack.length);

  // At rest the Stage draws it silent and still.
  expect(await mediaState(page, STAGE_VIDEO)).toMatchObject({ paused: true, muted: true, time: 0 });
  await expect(play(page)).toHaveAccessibleName('ניגון');
  await expect(page.getByTestId('clip-time')).toHaveText(/^0:00 \/ 0:0[23]$/);

  await play(page).click();
  await expect(play(page)).toHaveAttribute('data-playing', 'true');
  await expect(play(page)).toHaveAccessibleName('השהיה');
  // The picture moves: a busy machine may take a moment to start it.
  await expect.poll(async () => (await mediaState(page, STAGE_VIDEO)).time).toBeGreaterThan(0.3);
  // With the sound the element is set to: this one is not muted.
  expect(await mediaState(page, STAGE_VIDEO)).toMatchObject({ paused: false, muted: false });

  await play(page).click();
  await expect(play(page)).toHaveAttribute('data-playing', 'false');
  const paused = await mediaState(page, STAGE_VIDEO);
  expect(paused.paused).toBe(true);
  expect(paused.time).toBeGreaterThan(0.3);
  // It goes on from where it was paused.
  await play(page).click();
  expect((await watchMedia(page, STAGE_VIDEO, 200)).min).toBeGreaterThanOrEqual(paused.time - 0.01);

  expect(await deckJson(page)).toBe(before);
  expect(await page.evaluate(() => window.slidr!.bus.undoStack.length)).toBe(history);
  expect(pageProblems(page)).toEqual([]);
});

test('a clip that plays to its end stops, and plays from the start the next time', async ({
  page,
}) => {
  const media = await openWithMedia(page);
  await addClip(page, 'video', media.video, { trim: { startMs: 500, endMs: 1100 } });
  await mediaLoaded(page, STAGE_VIDEO);
  await noteStarts(page, STAGE_VIDEO);
  await play(page).click();
  expect(startedFrom(await lastStart(page, STAGE_VIDEO), 0.5)).toBe(true);
  await expect(play(page)).toHaveAttribute('data-playing', 'false', { timeout: 6000 });
  const ended = await mediaState(page, STAGE_VIDEO);
  expect(ended.time).toBeGreaterThanOrEqual(1.1);
  expect(ended.time).toBeLessThan(1.2);
  // From its end it does not go on: it starts over.
  await play(page).click();
  expect(startedFrom(await lastStart(page, STAGE_VIDEO, 2), 0.5)).toBe(true);
});

test('the clip goes back to its poster, silent, when the selection moves on', async ({ page }) => {
  const media = await openWithMedia(page);
  await addElement(page, shape('rect', { frame: { x: 60, y: 60, w: 200, h: 120 } }));
  await addClip(page, 'video', media.video, { poster: { timeMs: 1500 } });
  await mediaLoaded(page, STAGE_VIDEO);
  await expect.poll(async () => (await mediaState(page, STAGE_VIDEO)).time).toBeCloseTo(1.5, 1);

  await noteStarts(page, STAGE_VIDEO);
  await play(page).click();
  await expect(play(page)).toHaveAttribute('data-playing', 'true');
  // From the start of the clip, not from the frame it was waiting at.
  expect(startedFrom(await lastStart(page, STAGE_VIDEO), 0)).toBe(true);

  await page.evaluate(() => window.slidr!.selection.getState().selectElements(['e_rect']));
  await expect(row(page)).toHaveAttribute('data-selection', 'shape');
  await expect
    .poll(async () => {
      const state = await mediaState(page, STAGE_VIDEO);
      return state.paused && state.muted && Math.abs(state.time - 1.5) < 0.05;
    })
    .toBe(true);
  expect(pageProblems(page)).toEqual([]);
});

test('a muted video plays silent, and muting while it plays is heard at once', async ({ page }) => {
  const media = await openWithMedia(page);
  await addClip(page, 'video', media.video, { muted: true });
  await mediaLoaded(page, STAGE_VIDEO);
  await expect(tool(page, 'השתקה')).toHaveAttribute('aria-pressed', 'true');
  await play(page).click();
  await expect(play(page)).toHaveAttribute('data-playing', 'true');
  expect((await mediaState(page, STAGE_VIDEO)).muted).toBe(true);

  expect(await steps(page, () => tool(page, 'השתקה').click())).toBe(1);
  expect((await selected<VideoElement>(page)).muted).toBe(false);
  await expect.poll(async () => (await mediaState(page, STAGE_VIDEO)).muted).toBe(false);
  // Still playing: a change of the element does not stop the clip.
  expect((await mediaState(page, STAGE_VIDEO)).paused).toBe(false);

  await undo(page);
  expect((await selected<VideoElement>(page)).muted).toBe(true);
  await expect.poll(async () => (await mediaState(page, STAGE_VIDEO)).muted).toBe(true);
  await redo(page);
  expect((await selected<VideoElement>(page)).muted).toBe(false);
});

test('how a video starts, its loop and its volume are one undo step each', async ({ page }) => {
  const media = await openWithMedia(page);
  await addClip(page, 'video', media.video);
  await mediaLoaded(page, STAGE_VIDEO);
  const video = () => selected<VideoElement>(page);

  // Start: automatically, or on a click.
  const start = row(page).getByRole('radiogroup', { name: 'התחלת הניגון בהצגה' });
  await expect(start.getByRole('radio', { name: 'בלחיצה' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(await steps(page, () => start.getByRole('radio', { name: 'אוטומטית' }).click())).toBe(1);
  expect((await video()).autoplay).toBe(true);
  await expect(page.locator(STAGE_VIDEO)).toHaveAttribute('data-clip-autoplay', '');
  await undo(page);
  expect((await video()).autoplay).toBe(false);
  await expect(start.getByRole('radio', { name: 'בלחיצה' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await redo(page);
  expect((await video()).autoplay).toBe(true);

  // Loop.
  expect(await steps(page, () => tool(page, 'ניגון בלולאה').click())).toBe(1);
  expect((await video()).loop).toBe(true);
  await expect(page.locator(STAGE_VIDEO)).toHaveAttribute('data-clip-loop', '');
  await undo(page);
  expect((await video()).loop).toBe(false);
  await redo(page);
  expect((await video()).loop).toBe(true);

  // Volume: a drag of the slider is one step, and the Stage's video follows it.
  await tool(page, 'עוצמת הקול').click();
  const popover = page.getByRole('dialog');
  const slider = popover.getByRole('slider', { name: 'עוצמת הקול' });
  await expect(slider).toHaveAttribute('aria-valuenow', '100');
  // In a right-to-left UI a slider grows to the left: a drag to the right turns it down.
  expect(await steps(page, () => dragSlider(page, slider, 60))).toBe(1);
  const quieter = (await video()).volume;
  expect(quieter).toBeLessThan(1);
  expect(quieter).toBeGreaterThan(0);
  expect((await mediaState(page, STAGE_VIDEO)).volume).toBeCloseTo(quieter, 5);
  // Typed, it is exact.
  const field = popover.getByRole('textbox', { name: 'עוצמת הקול' });
  await field.fill('25');
  await field.press('Enter');
  expect((await video()).volume).toBe(0.25);
  await undo(page);
  expect((await video()).volume).toBe(quieter);
  await undo(page);
  expect((await video()).volume).toBe(1);
  await redo(page);
  await redo(page);
  expect((await video()).volume).toBe(0.25);
  await page.keyboard.press('Escape');

  // A video has no controls of its own to show or hide.
  await expect(tool(page, 'פקדי ניגון בהצגה')).toHaveCount(0);
  expect(pageProblems(page)).toEqual([]);
});

test('a sound plays in place, and has its own row: no mute, and the controls of a show', async ({
  page,
}) => {
  const media = await openWithMedia(page);
  // A loop, so that it is still playing when a slow machine comes to look.
  await addClip(page, 'audio', media.sound, { loop: true });
  await expect(row(page)).toHaveAttribute('data-selection', 'media');
  const sound = () => selected<AudioElement>(page);

  // The selected sound reads its length, which the Stage does not load by itself.
  await mediaLoaded(page, STAGE_SOUND);
  await expect(page.getByTestId('clip-time')).toHaveText('0:00 / 0:01');
  expect((await mediaState(page, STAGE_SOUND)).duration).toBeCloseTo(SOUND_SECONDS, 1);

  const before = await page.evaluate(() => JSON.stringify(window.slidr!.bus.deck));
  await play(page).click();
  await expect(play(page)).toHaveAttribute('data-playing', 'true');
  await expect.poll(async () => (await mediaState(page, STAGE_SOUND)).time).toBeGreaterThan(0.2);
  expect(await mediaState(page, STAGE_SOUND)).toMatchObject({ paused: false, muted: false });
  // Its mark on the slide shows that it plays.
  expect(
    await page.evaluate(
      () =>
        document
          .querySelector('[data-testid="stage-frame"] [data-slidr-clip-toggle]')
          ?.getAnimations().length,
    ),
  ).toBe(1);
  await play(page).click();
  await expect(play(page)).toHaveAttribute('data-playing', 'false');
  expect(await page.evaluate(() => JSON.stringify(window.slidr!.bus.deck))).toBe(before);

  // No mute for a sound: its volume is its sound.
  await expect(tool(page, 'השתקה')).toHaveCount(0);
  // The controls a show draws for it.
  const controls = tool(page, 'פקדי ניגון בהצגה');
  await expect(controls).toHaveAttribute('aria-pressed', 'true');
  expect(await steps(page, () => controls.click())).toBe(1);
  expect((await sound()).showControls).toBe(false);
  await undo(page);
  expect((await sound()).showControls).toBe(true);
  await redo(page);
  expect((await sound()).showControls).toBe(false);

  expect(await steps(page, () => tool(page, 'ניגון בלולאה').click())).toBe(1);
  expect((await sound()).loop).toBe(false);
  await undo(page);
  expect((await sound()).loop).toBe(true);
  expect(pageProblems(page)).toEqual([]);
});

test('a show takes the sound: what the editor was playing stops', async ({ page }) => {
  const media = await openWithMedia(page);
  await addClip(page, 'video', media.video, { loop: true });
  await mediaLoaded(page, STAGE_VIDEO);
  await play(page).click();
  await expect(play(page)).toHaveAttribute('data-playing', 'true');

  await page.evaluate(async () => {
    const path = '/src/present/present.tsx';
    const present = (await import(/* @vite-ignore */ path)) as {
      startPresenting: (editor: unknown, options: object) => boolean;
    };
    present.startPresenting(window.slidr, { from: 'current', fullscreen: false });
  });
  await expect(page.getByTestId('present')).toHaveAttribute('data-ready', 'true');
  const under = await mediaState(page, STAGE_VIDEO);
  expect(under).toMatchObject({ paused: true, muted: true });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('present')).toHaveCount(0);
  expect(pageProblems(page)).toEqual([]);
});

test('two clips of one slide: the tools play the one that is selected', async ({ page }) => {
  const media = await openWithMedia(page);
  await addClip(page, 'audio', media.sound);
  await addClip(page, 'video', media.video);
  await mediaLoaded(page, STAGE_VIDEO);
  await play(page).click();
  await expect(play(page)).toHaveAttribute('data-playing', 'true');
  expect((await mediaState(page, STAGE_SOUND)).paused).toBe(true);

  // The sound is selected: the video rests, and the button is the sound's.
  await page.evaluate(() => window.slidr!.selection.getState().selectElements(['e_audio']));
  await expect(play(page)).toHaveAttribute('data-playing', 'false');
  await expect.poll(async () => (await mediaState(page, STAGE_VIDEO)).paused).toBe(true);
  await play(page).click();
  await expect(play(page)).toHaveAttribute('data-playing', 'true');
  expect((await mediaState(page, STAGE_SOUND)).paused).toBe(false);
  expect((await mediaState(page, STAGE_VIDEO)).paused).toBe(true);
  expect((await deck(page)).slides[0]!.elements).toHaveLength(2);
});
