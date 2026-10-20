import { expect, test, type Locator, type Page } from '@playwright/test';
import type { AudioElement, VideoElement } from '@slidr/model';
import { deck, pageProblems, pngBytes, row, selected, steps, undo } from './objects-helpers';
import {
  addClip,
  colourAt,
  lastStart,
  mediaLoaded,
  mediaState,
  near,
  noteStarts,
  openWithMedia,
  secondSeen,
  startedFrom,
  STAGE_SOUND,
  STAGE_VIDEO,
  watchMedia,
} from './video-helpers';

/*
 * The trim and the poster of a clip (MED-03), in the editor: the tools of row B write them, and
 * playing in place honours them. A scrub shows a moment on the slide and changes nothing.
 */

const redo = (page: Page) => page.evaluate(() => window.slidr!.bus.redo());
const play = (page: Page) => page.getByTestId('clip-play');
const video = (page: Page) => selected<VideoElement>(page);

async function openTool(page: Page, name: string): Promise<Locator> {
  await row(page).getByRole('button', { name, exact: true }).click();
  const popover = page.getByRole('dialog');
  await expect(popover).toBeVisible();
  return popover;
}

/** Types a number into a field of a popover and commits it. */
async function type(field: Locator, value: string): Promise<void> {
  await field.fill(value);
  await field.press('Enter');
}

/** Moves the clip's own time line to a moment with the keyboard: 0.05 of a second a step. */
async function scrubTo(page: Page, popover: Locator, seconds: number): Promise<void> {
  const slider = popover.getByRole('slider', { name: 'מיקום בקליפ' });
  await slider.focus();
  await page.keyboard.press('Home');
  // Ten steps with Page Up, one with an arrow. The time line runs left to right in every language.
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < Math.floor(steps / 10); i++) await page.keyboard.press('PageUp');
  for (let i = 0; i < steps % 10; i++) await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => Math.abs((await mediaState(page, STAGE_VIDEO)).time - seconds))
    .toBeLessThan(0.03);
}

test('the start and the end of the trim are typed, each one undo step, and undone', async ({
  page,
}) => {
  const media = await openWithMedia(page);
  await addClip(page, 'video', media.video);
  await mediaLoaded(page, STAGE_VIDEO);
  const length = (await mediaState(page, STAGE_VIDEO)).duration;

  const popover = await openTool(page, 'חיתוך');
  const start = popover.getByRole('textbox', { name: 'התחלה (שניות)' });
  const end = popover.getByRole('textbox', { name: 'סוף (שניות)' });
  // An untrimmed clip is the whole file.
  await expect(start).toHaveValue('0');
  await expect(end).toHaveValue(String(Number(length.toFixed(2))));
  await expect(popover.getByRole('button', { name: 'הקליפ כולו' })).toBeDisabled();

  expect(await steps(page, () => type(start, '0.5'))).toBe(1);
  expect((await video(page)).trim).toEqual({ startMs: 500, endMs: Math.round(length * 1000) });
  expect(await steps(page, () => type(end, '1.25'))).toBe(1);
  expect((await video(page)).trim).toEqual({ startMs: 500, endMs: 1250 });
  // The Stage's video carries the trim, for whoever plays it.
  await expect(page.locator(STAGE_VIDEO)).toHaveAttribute('data-clip-start', '0.5');
  await expect(page.locator(STAGE_VIDEO)).toHaveAttribute('data-clip-end', '1.25');

  // The two ends never cross: a start past the end stops just short of it.
  await type(start, '9');
  expect((await video(page)).trim).toEqual({ startMs: 1150, endMs: 1250 });
  await undo(page);
  expect((await video(page)).trim).toEqual({ startMs: 500, endMs: 1250 });

  await undo(page);
  expect((await video(page)).trim).toEqual({ startMs: 500, endMs: Math.round(length * 1000) });
  await undo(page);
  expect((await video(page)).trim).toBeUndefined();
  await redo(page);
  await redo(page);
  expect((await video(page)).trim).toEqual({ startMs: 500, endMs: 1250 });

  // "The whole clip" takes the trim off, in one step.
  expect(await steps(page, () => popover.getByRole('button', { name: 'הקליפ כולו' }).click())).toBe(
    1,
  );
  expect((await video(page)).trim).toBeUndefined();
  await expect(page.locator(STAGE_VIDEO)).not.toHaveAttribute('data-clip-start');
  await undo(page);
  expect((await video(page)).trim).toEqual({ startMs: 500, endMs: 1250 });
  expect(pageProblems(page)).toEqual([]);
});

test('a scrub shows a moment on the slide without changing the deck, and sets the trim from it', async ({
  page,
}) => {
  const media = await openWithMedia(page);
  await addClip(page, 'video', media.video);
  await mediaLoaded(page, STAGE_VIDEO);
  const before = await page.evaluate(() => JSON.stringify(window.slidr!.bus.deck));

  const popover = await openTool(page, 'חיתוך');
  await scrubTo(page, popover, 0.5);
  await expect(popover.getByTestId('clip-position')).toHaveText('0:00.5');
  // The frame of that moment is on the slide, once the browser has drawn it.
  await expect.poll(() => secondSeen(page, STAGE_VIDEO)).toBe('second 0');
  expect(await page.evaluate(() => JSON.stringify(window.slidr!.bus.deck))).toBe(before);

  expect(await steps(page, () => page.getByTestId('clip-trim-start-here').click())).toBe(1);
  expect((await video(page)).trim?.startMs).toBe(500);
  await scrubTo(page, popover, 1.6);
  expect(await steps(page, () => page.getByTestId('clip-trim-end-here').click())).toBe(1);
  expect((await video(page)).trim).toEqual({ startMs: 500, endMs: 1600 });

  // The popover closes: the clip is back at rest, at the start of its trim.
  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect.poll(async () => (await mediaState(page, STAGE_VIDEO)).time).toBeCloseTo(0.5, 1);
  expect((await mediaState(page, STAGE_VIDEO)).paused).toBe(true);
  await expect.poll(() => secondSeen(page, STAGE_VIDEO)).toBe('second 0');
  expect(pageProblems(page)).toEqual([]);
});

test('playing in place keeps to the trim, and goes round inside it when the clip loops', async ({
  page,
}) => {
  const media = await openWithMedia(page);
  await addClip(page, 'video', media.video, { trim: { startMs: 500, endMs: 1000 } });
  await mediaLoaded(page, STAGE_VIDEO);

  // Once: from the start of the trim to its end, and there it stops.
  await noteStarts(page, STAGE_VIDEO);
  await play(page).click();
  const once = await watchMedia(page, STAGE_VIDEO, 1200);
  expect(startedFrom(await lastStart(page, STAGE_VIDEO), 0.5)).toBe(true);
  expect(once.min).toBeGreaterThanOrEqual(0.5 - 0.001);
  expect(once.max).toBeLessThanOrEqual(1.08);
  await expect(play(page)).toHaveAttribute('data-playing', 'false', { timeout: 6000 });
  expect((await mediaState(page, STAGE_VIDEO)).time).toBeLessThanOrEqual(1.08);

  // With the loop on it goes round, and never leaves the trim.
  await row(page).getByRole('button', { name: 'ניגון בלולאה', exact: true }).click();
  await play(page).click();
  const round = await watchMedia(page, STAGE_VIDEO, 1800);
  expect(round.paused).toBe(false);
  expect(round.min).toBeGreaterThanOrEqual(0.5 - 0.001);
  expect(round.max).toBeLessThanOrEqual(1.08);
  expect(round.wraps).toBeGreaterThanOrEqual(2);
  expect(pageProblems(page)).toEqual([]);
});

test('a sound is trimmed the same way', async ({ page }) => {
  const media = await openWithMedia(page);
  await addClip(page, 'audio', media.sound, { loop: true });
  await mediaLoaded(page, STAGE_SOUND);

  const popover = await openTool(page, 'חיתוך');
  await type(popover.getByRole('textbox', { name: 'התחלה (שניות)' }), '0.4');
  await type(popover.getByRole('textbox', { name: 'סוף (שניות)' }), '0.8');
  expect((await selected<AudioElement>(page)).trim).toEqual({ startMs: 400, endMs: 800 });
  await page.keyboard.press('Escape');

  await play(page).click();
  const round = await watchMedia(page, STAGE_SOUND, 1500);
  expect(round.paused).toBe(false);
  expect(round.min).toBeGreaterThanOrEqual(0.4 - 0.001);
  expect(round.max).toBeLessThanOrEqual(0.88);
  expect(round.wraps).toBeGreaterThanOrEqual(2);
  // A sound has no poster.
  await expect(row(page).getByRole('button', { name: 'תמונת פתיחה', exact: true })).toHaveCount(0);
  expect(pageProblems(page)).toEqual([]);
});

test('a chosen frame is the poster: the video waits at it, and plays from the start', async ({
  page,
}) => {
  const media = await openWithMedia(page);
  await addClip(page, 'video', media.video, { trim: { startMs: 500, endMs: 2500 } });
  await mediaLoaded(page, STAGE_VIDEO);

  const popover = await openTool(page, 'תמונת פתיחה');
  await expect(popover.getByTestId('clip-poster-now')).toHaveText('מוצגת תחילת הקליפ');
  await scrubTo(page, popover, 1.5);
  expect(await steps(page, () => page.getByTestId('clip-poster-frame').click())).toBe(1);
  expect((await video(page)).poster).toEqual({ timeMs: 1500 });
  await expect(popover.getByTestId('clip-poster-now')).toHaveText('מוצג הפריים שב-0:01.5');
  await page.keyboard.press('Escape');

  // At rest the Stage shows that frame.
  await expect.poll(async () => (await mediaState(page, STAGE_VIDEO)).time).toBeCloseTo(1.5, 1);
  await expect(page.locator(STAGE_VIDEO)).toHaveAttribute('data-clip-still', '1.5');
  await expect.poll(() => secondSeen(page, STAGE_VIDEO)).toBe('second 1');

  // Played, it starts at the start of its trim, not at the poster.
  await noteStarts(page, STAGE_VIDEO);
  await play(page).click();
  expect(startedFrom(await lastStart(page, STAGE_VIDEO), 0.5)).toBe(true);
  await play(page).click();

  await undo(page);
  expect((await video(page)).poster).toBeUndefined();
  await expect.poll(async () => (await mediaState(page, STAGE_VIDEO)).time).toBeCloseTo(0.5, 1);
  await redo(page);
  expect((await video(page)).poster).toEqual({ timeMs: 1500 });

  // "Reset" goes back to the start of the clip, in one step.
  const again = await openTool(page, 'תמונת פתיחה');
  expect(await steps(page, () => again.getByRole('button', { name: 'איפוס' }).click())).toBe(1);
  expect((await video(page)).poster).toBeUndefined();
  await expect(again.getByRole('button', { name: 'איפוס' })).toBeDisabled();
  expect(pageProblems(page)).toEqual([]);
});

test('a picture from a file is the poster: one undo step with its asset, and back after playing', async ({
  page,
}) => {
  const media = await openWithMedia(page);
  await addClip(page, 'video', media.video, { trim: { startMs: 500, endMs: 2500 } });
  await mediaLoaded(page, STAGE_VIDEO);
  const picture = await pngBytes(page, ['#00c2ff', '#00c2ff']);
  const blue: [number, number, number] = [0x00, 0xc2, 0xff];

  const popover = await openTool(page, 'תמונת פתיחה');
  const chooser = page.waitForEvent('filechooser');
  const added = await steps(page, async () => {
    await page.getByTestId('clip-poster-image').click();
    await (await chooser).setFiles({ name: 'poster.png', mimeType: 'image/png', buffer: picture });
    await expect(popover.getByTestId('clip-poster-now')).toHaveText('מוצגת התמונה poster.png');
  });
  expect(added).toBe(1);
  const poster = (await video(page)).poster as { assetId: string };
  expect((await deck(page)).assets[poster.assetId]).toMatchObject({
    kind: 'image',
    name: 'poster.png',
  });
  await page.keyboard.press('Escape');

  // The Stage shows the picture, and the address of the video carries no fragment that would
  // take the picture away.
  const state = await mediaState(page, STAGE_VIDEO);
  expect(state.poster).toMatch(/^blob:/);
  expect(state.src).not.toContain('#t=');
  await expect.poll(async () => near(await colourAt(page, STAGE_VIDEO), blue)).toBe(true);

  // Played, the picture gives way to the clip; let go, it is back.
  await play(page).click();
  await expect.poll(async () => (await mediaState(page, STAGE_VIDEO)).time).toBeGreaterThan(0.6);
  expect(near(await colourAt(page, STAGE_VIDEO), blue)).toBe(false);
  await page.evaluate(() => window.slidr!.selection.getState().clearSelection());
  await expect.poll(async () => near(await colourAt(page, STAGE_VIDEO), blue)).toBe(true);

  // One step back takes the poster and its asset away.
  await undo(page);
  expect((await deck(page)).slides[0]!.elements[0]).not.toHaveProperty('poster');
  expect((await deck(page)).assets[poster.assetId]).toBeUndefined();
  await redo(page);
  expect((await deck(page)).assets[poster.assetId]).toBeDefined();
  expect(pageProblems(page)).toEqual([]);
});
