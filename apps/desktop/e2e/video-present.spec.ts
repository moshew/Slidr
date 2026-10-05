import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { Deck } from '@slidr/model';
import { openApp, pageProblems } from './objects-helpers';
import {
  lastStart,
  mediaState,
  noteStarts,
  secondSeen,
  startedFrom,
  testMedia,
  watchMedia,
  type TestMedia,
} from './video-helpers';

/*
 * Video and audio in a show (MED-02, MED-03): in the app's present mode and in an exported file.
 * The runtime owns how a clip behaves there: the same steps are taken in both, by the same
 * function, and must come out the same.
 */

const outDir = fileURLToPath(new URL('../test-results/objects/', import.meta.url));

/**
 * Three slides:
 *   1. a video that waits for a click, trimmed, with a chosen frame as its poster;
 *   2. a video that starts by itself and loops inside its trim, and a sound without controls;
 *   3. a sound that starts by itself and shows nothing, and a sound with the browser's controls.
 */
async function loadDeck(page: Page, media: TestMedia): Promise<void> {
  await page.evaluate(
    async ({ video, sound }) => {
      const editor = window.slidr!;
      const file = (base64: string, name: string, type: string) =>
        new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], name, { type });
      const clip = await editor.assets.import(file(video, 'clip.webm', 'video/webm'));
      const tone = await editor.assets.import(file(sound, 'tone.wav', 'audio/wav'));
      const base = editor.bus.deck;
      const blank = base.slides[0]!;
      const common = { rotation: 0, opacity: 1 };
      const videoOf = (id: string, extra: object) => ({
        ...common,
        id,
        type: 'video',
        assetId: clip.id,
        frame: { x: 480, y: 270, w: 960, h: 540 },
        autoplay: false,
        loop: false,
        // Silent: a browser lets a silent video start by itself on any page.
        muted: true,
        volume: 1,
        ...extra,
      });
      const soundOf = (id: string, y: number, extra: object) => ({
        ...common,
        id,
        type: 'audio',
        assetId: tone.id,
        frame: { x: 100, y, w: 320, h: 80 },
        autoplay: false,
        loop: false,
        volume: 0.5,
        showControls: false,
        ...extra,
      });
      const deck = {
        ...base,
        assets: { [clip.id]: clip, [tone.id]: tone },
        slides: [
          {
            ...blank,
            id: 's_waits',
            elements: [
              videoOf('e_waits', { trim: { startMs: 500, endMs: 2500 }, poster: { timeMs: 1500 } }),
            ],
          },
          {
            ...blank,
            id: 's_starts',
            elements: [
              videoOf('e_starts', {
                autoplay: true,
                loop: true,
                trim: { startMs: 500, endMs: 1000 },
              }),
              soundOf('e_mark', 100, { name: 'Tone', loop: true }),
            ],
          },
          {
            ...blank,
            id: 's_sounds',
            elements: [
              soundOf('e_background', 100, { autoplay: true, loop: true }),
              soundOf('e_controls', 300, { showControls: true }),
            ],
          },
        ],
      };
      editor.bus.reset(deck as unknown as Deck);
    },
    { video: media.video.toString('base64'), sound: media.sound.toString('base64') },
  );
  await expect(page.getByTestId('stage-frame')).toBeVisible();
}

/** A show, wherever it runs: the app's present mode, or an exported file. */
interface Show {
  page: Page;
  /** Selects inside the show: the editor under the app's show draws the same elements. */
  root: string;
  state: () => Promise<{ slide: number; step: number }>;
}

const media = (show: Show, id: string) => `${show.root}[data-element-id="${id}"] :is(video, audio)`;
const mark = (show: Show, id: string) =>
  show.page.locator(`${show.root}[data-element-id="${id}"] [data-slidr-clip-toggle]`);

/**
 * The steps of a show with clips. What it finds is the same wherever the show runs, because the
 * player that runs it is the same.
 */
async function playThrough(show: Show): Promise<void> {
  const { page } = show;
  const waits = media(show, 'e_waits');
  const starts = media(show, 'e_starts');

  // ---- Slide 1: a video that waits, at its poster frame.
  await expect.poll(async () => (await mediaState(page, waits)).time).toBeCloseTo(1.5, 1);
  expect((await mediaState(page, waits)).paused).toBe(true);
  // The frame itself, once the browser has drawn it.
  await expect.poll(() => secondSeen(page, waits)).toBe('second 1');
  // Nothing of another slide plays.
  expect((await mediaState(page, starts)).paused).toBe(true);

  // A click on it plays it, from the start of its trim, and is not a step of the show.
  await noteStarts(page, waits);
  await page.locator(waits).click();
  expect(startedFrom(await lastStart(page, waits), 0.5)).toBe(true);
  await expect.poll(async () => (await mediaState(page, waits)).paused).toBe(false);
  expect(await show.state()).toEqual({ slide: 0, step: 0 });
  // Another click pauses it; a third goes on from there.
  await page.locator(waits).click();
  const paused = await mediaState(page, waits);
  expect(paused.paused).toBe(true);
  await page.locator(waits).click();
  expect((await watchMedia(page, waits, 150)).min).toBeGreaterThanOrEqual(paused.time - 0.01);
  expect(await show.state()).toEqual({ slide: 0, step: 0 });

  // ---- A key moves on. The video that was playing stops; the one that starts by itself starts.
  await noteStarts(page, starts);
  await page.keyboard.press('ArrowRight');
  await expect.poll(show.state).toEqual({ slide: 1, step: 0 });
  expect(startedFrom(await lastStart(page, starts), 0.5)).toBe(true);
  await expect.poll(async () => (await mediaState(page, starts)).paused).toBe(false);
  expect((await mediaState(page, waits)).paused).toBe(true);
  // It goes round inside its trim, and never leaves it.
  const round = await watchMedia(page, starts, 1700);
  expect(round.paused).toBe(false);
  expect(round.min).toBeGreaterThanOrEqual(0.5 - 0.001);
  expect(round.max).toBeLessThanOrEqual(1.08);
  expect(round.wraps).toBeGreaterThanOrEqual(2);

  // ---- A sound without controls that waits for a click shows its mark: a click plays it.
  const tone = media(show, 'e_mark');
  await expect(mark(show, 'e_mark')).toBeVisible();
  await expect(mark(show, 'e_mark')).toHaveAttribute('role', 'button');
  expect((await mediaState(page, tone)).paused).toBe(true);
  await mark(show, 'e_mark').click();
  await expect.poll(async () => (await mediaState(page, tone)).time).toBeGreaterThan(0.1);
  expect(await mediaState(page, tone)).toMatchObject({ paused: false, volume: 0.5 });
  // The mark shows that the sound plays.
  expect(await mark(show, 'e_mark').evaluate((el) => el.getAnimations().length)).toBe(1);
  await mark(show, 'e_mark').click();
  expect((await mediaState(page, tone)).paused).toBe(true);
  expect(await mark(show, 'e_mark').evaluate((el) => el.getAnimations().length)).toBe(0);
  // Neither click moved the show, and the looping video played on.
  expect(await show.state()).toEqual({ slide: 1, step: 0 });
  expect((await mediaState(page, starts)).paused).toBe(false);

  // ---- A click on the slide itself is a step.
  await page
    .locator(`${show.root}[data-slide-id="s_starts"]`)
    .click({ position: { x: 40, y: 40 } });
  await expect.poll(show.state).toEqual({ slide: 2, step: 0 });
  expect((await mediaState(page, starts)).paused).toBe(true);

  // A sound that starts by itself and has no controls is heard and not seen.
  const background = media(show, 'e_background');
  await expect.poll(async () => (await mediaState(page, background)).time).toBeGreaterThan(0.1);
  expect((await mediaState(page, background)).paused).toBe(false);
  await expect(mark(show, 'e_background')).toHaveCount(0);
  await expect(page.locator(background)).toBeHidden();
  // A sound with controls shows the browser's, and no mark.
  await expect(page.locator(media(show, 'e_controls'))).toBeVisible();
  await expect(page.locator(media(show, 'e_controls'))).toHaveAttribute('controls', '');
  await expect(mark(show, 'e_controls')).toHaveCount(0);

  // ---- Back: the slide is opened anew, and its video starts over.
  await page.keyboard.press('ArrowLeft');
  await expect.poll(show.state).toEqual({ slide: 1, step: 0 });
  expect((await mediaState(page, background)).paused).toBe(true);
  expect(startedFrom(await lastStart(page, starts, 2), 0.5)).toBe(true);
  await expect.poll(async () => (await mediaState(page, starts)).paused).toBe(false);
  const again = await watchMedia(page, starts, 400);
  expect(again.min).toBeGreaterThanOrEqual(0.5 - 0.001);
  expect(again.max).toBeLessThanOrEqual(1.08);

  // ---- A black screen holds the show (PRS-04): the video stands still under it, and plays on
  // when the show is seen again. Neither key is a step.
  const blank = page.locator('[data-slidr-blank]');
  await page.keyboard.press('b');
  await expect(blank).toHaveAttribute('data-slidr-blank', 'black');
  await expect.poll(async () => (await mediaState(page, starts)).paused).toBe(true);
  const held = await watchMedia(page, starts, 400);
  expect(held.paused).toBe(true);
  expect(held.max - held.min).toBe(0);
  await page.keyboard.press('b');
  await expect(blank).toHaveCount(0);
  await expect.poll(async () => (await mediaState(page, starts)).paused).toBe(false);
  expect(await show.state()).toEqual({ slide: 1, step: 0 });
  // A clip that was not playing is not started by the show coming back.
  expect((await mediaState(page, tone)).paused).toBe(true);

  // ---- Past the last slide the show ends: a black screen, and nothing plays under it.
  await page.keyboard.press('ArrowRight');
  await expect.poll(show.state).toEqual({ slide: 2, step: 0 });
  await expect.poll(async () => (await mediaState(page, background)).paused).toBe(false);
  await page.keyboard.press('ArrowRight');
  const end = page.locator('[data-slidr-end]');
  await expect(end).toBeVisible();
  expect(await end.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(0, 0, 0)');
  expect((await mediaState(page, background)).paused).toBe(true);
  expect(await show.state()).toEqual({ slide: 2, step: 0 });
  // A step back is the last slide again, as it was left: its sound does not start over.
  await page.keyboard.press('ArrowLeft');
  await expect(end).toHaveCount(0);
  expect(await show.state()).toEqual({ slide: 2, step: 0 });
  expect((await mediaState(page, background)).paused).toBe(true);
}

test('clips in the app show: poster, click to play, autoplay, loop inside the trim', async ({
  page,
}) => {
  await openApp(page);
  await loadDeck(page, await testMedia(page));
  await page.evaluate(async () => {
    const path = '/src/present/present.tsx';
    const present = (await import(/* @vite-ignore */ path)) as {
      startPresenting: (editor: unknown, options: object) => boolean;
    };
    present.startPresenting(window.slidr, { from: 'first', fullscreen: false });
  });
  const view = page.getByTestId('present');
  await expect(view).toHaveAttribute('data-ready', 'true');
  await playThrough({
    page,
    root: '[data-testid="present"] ',
    state: async () => ({
      slide: Number(await view.getAttribute('data-slide')),
      step: Number(await view.getAttribute('data-step')),
    }),
  });

  // The show ends: nothing of it is left playing, and the editor is as it was.
  await page.keyboard.press('Escape');
  await expect(view).toHaveCount(0);
  expect(await page.evaluate(() => window.slidr!.bus.undoStack.length)).toBe(0);
  expect(pageProblems(page)).toEqual([]);
});

test('clips in an exported file behave as they do in the app show', async ({ page, context }) => {
  await openApp(page);
  await loadDeck(page, await testMedia(page));
  const html = await page.evaluate(async () => {
    const path = '/src/export/exportDeck.ts';
    const exporter = (await import(/* @vite-ignore */ path)) as {
      exportDeck: (editor: unknown, deck: unknown, choices: object) => Promise<{ html: string }>;
    };
    const editor = window.slidr!;
    const result = await exporter.exportDeck(editor, editor.bus.deck, {
      range: null,
      animations: true,
      media: 'inside',
    });
    return result.html;
  });
  // Nothing in the file starts a clip but the runtime, and no clip leans on a media fragment.
  expect(html).not.toMatch(/<(?:video|audio)[^>]*\sautoplay/);
  expect(html).not.toContain('#t=');
  expect(html).not.toContain('blob:');
  expect(html).toContain('data:video/webm;base64,');
  expect(html).toContain('data:audio/wav;base64,');

  mkdirSync(outDir, { recursive: true });
  const file = `${outDir}media-show.html`;
  writeFileSync(file, html);
  const opened = await context.newPage();
  const requests: string[] = [];
  opened.on('request', (request) => {
    if (!request.url().startsWith('file:') && !request.url().startsWith('data:')) {
      requests.push(request.url());
    }
  });
  const errors: string[] = [];
  opened.on('pageerror', (error) => errors.push(error.message));
  await opened.goto(pathToFileURL(file).href);
  await opened.waitForFunction(() => (window as { slidr?: unknown }).slidr !== undefined);

  await playThrough({
    page: opened,
    root: '',
    state: () =>
      opened.evaluate(() => {
        const { state } = (
          window as unknown as { slidr: { state: { slide: number; step: number } } }
        ).slidr;
        return { slide: state.slide, step: state.step };
      }),
  });
  // A file has nowhere to leave to: a step forward at its end changes nothing, and the end
  // says what it is in the language of the deck.
  await opened.keyboard.press('ArrowRight');
  await opened.keyboard.press('ArrowRight');
  await expect(opened.locator('[data-slidr-end]')).toHaveText('סוף ההצגה');
  await opened.screenshot({ path: `${outDir}media-show-end.png` });
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});
