import { fileURLToPath } from 'node:url';
import { expect, type Page } from '@playwright/test';
import type { AssetMeta, AudioElement, VideoElement } from '@slidr/model';
import { openApp, type OpenOptions } from './objects-helpers';

/*
 * Shared by the video and audio suites (WG5-T12): media to test with, and ways to put a clip on
 * the slide and to ask a media element where it stands.
 *
 * The media is generated, tiny and ours: a few frames of a canvas recorded with `MediaRecorder`
 * in the page, and a sine tone written by hand as a WAV file
 * (`packages/runtime/src/testing/recordedClip.ts`). Recording takes as long as the clip is, so a
 * worker records once and every test of it uses the same bytes.
 */

/** The length of the test video in seconds, as it is asked for; the file is a little shorter. */
export const CLIP_SECONDS = 3;
export const SOUND_SECONDS = 1.5;
/** The picture of the test video, in pixels. */
export const CLIP_SIZE = { w: 320, h: 180 } as const;

/** A recording smaller than this has no picture in it: three seconds are about 26 kB. */
const LEAST_CLIP_BYTES = 5000;
/** How far video compression may move a colour of the test video. */
const BAND_SLACK = 28;

export interface TestMedia {
  video: Buffer;
  sound: Buffer;
}

/** The recorder, as the page imports it from the dev server. */
const RECORDER = `/@fs/${fileURLToPath(
  new URL('../../../packages/runtime/src/testing/recordedClip.ts', import.meta.url),
).replaceAll('\\', '/')}`;

let recorded: Promise<TestMedia> | undefined;

/** The test video and the test sound. Recorded in the page the first time a worker asks. */
export function testMedia(page: Page): Promise<TestMedia> {
  recorded ??= page
    .evaluate(
      async ({ path, seconds, tone, size, least, bands, slack }) => {
        const recorder = (await import(/* @vite-ignore */ path)) as {
          recordClip: (seconds: number, size: { w: number; h: number }) => Promise<Blob>;
          toneWav: (seconds: number) => Uint8Array<ArrayBuffer>;
        };
        const base64 = (blob: Blob) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve(typeof reader.result === 'string' ? (reader.result.split(',')[1] ?? '') : '');
            reader.readAsDataURL(blob);
          });
        // The colour in a corner of the clip at a time, where no digit is drawn.
        const colourAt = async (clip: Blob, at: number): Promise<number[]> => {
          const video = document.createElement('video');
          video.muted = true;
          video.src = URL.createObjectURL(clip);
          const heard = (type: string) =>
            new Promise<boolean>((resolve) => {
              video.addEventListener(type, () => resolve(true), { once: true });
              video.addEventListener('error', () => resolve(false), { once: true });
              setTimeout(() => resolve(false), 3000);
            });
          try {
            if (!(await heard('loadeddata'))) return [];
            const seeked = heard('seeked');
            video.currentTime = at;
            if (!(await seeked)) return [];
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 8;
            const context = canvas.getContext('2d');
            if (!context) return [];
            context.drawImage(video, 0, 0, 32, 16, 0, 0, 8, 8);
            return Array.from(context.getImageData(4, 4, 1, 1).data.slice(0, 3));
          } finally {
            URL.revokeObjectURL(video.src);
          }
        };
        // A recording is good when the middle of each second shows that second's colour. On a
        // busy machine it can come out as a header with no frames in it (110 bytes, once in a
        // full run), or with its first frame held for seconds: such a clip is recorded again.
        const good = async (clip: Blob): Promise<boolean> => {
          if (clip.size < least) return false;
          for (let second = 0; second < Math.floor(seconds); second++) {
            const colour = await colourAt(clip, second + 0.5);
            const band = bands[second % bands.length] ?? [];
            if (colour.length !== 3) return false;
            if (!colour.every((value, i) => Math.abs(value - (band[i] ?? 0)) <= slack)) {
              return false;
            }
          }
          return true;
        };
        let clip = await recorder.recordClip(seconds, size);
        for (let again = 0; again < 4 && !(await good(clip)); again++) {
          clip = await recorder.recordClip(seconds, size);
        }
        return {
          video: await base64(clip),
          sound: await base64(new Blob([recorder.toneWav(tone)])),
        };
      },
      {
        path: RECORDER,
        seconds: CLIP_SECONDS,
        tone: SOUND_SECONDS,
        size: CLIP_SIZE,
        least: LEAST_CLIP_BYTES,
        bands: BANDS.map((band) => [...band]),
        slack: BAND_SLACK,
      },
    )
    .then(({ video, sound }) => ({
      video: Buffer.from(video, 'base64'),
      sound: Buffer.from(sound, 'base64'),
    }));
  // A recording that failed (its page was closed) is not kept: the next test records again.
  recorded.catch(() => (recorded = undefined));
  return recorded;
}

/** Opens the app and has the test media at hand. */
export async function openWithMedia(page: Page, options: OpenOptions = {}): Promise<TestMedia> {
  await openApp(page, options);
  return testMedia(page);
}

export const VIDEO_FILE = { name: 'clip.webm', mimeType: 'video/webm' } as const;
export const SOUND_FILE = { name: 'tone.wav', mimeType: 'audio/wav' } as const;

type ClipInit<T> = Partial<Omit<T, 'type' | 'assetId'>>;

/**
 * Puts a clip on the current slide and selects it: the file becomes an asset of the document,
 * and the element is added with it in one change. Returns the asset.
 */
export async function addClip<K extends 'video' | 'audio'>(
  page: Page,
  kind: K,
  bytes: Buffer,
  init: ClipInit<K extends 'video' ? VideoElement : AudioElement> = {},
): Promise<AssetMeta> {
  const file = kind === 'video' ? VIDEO_FILE : SOUND_FILE;
  // Fields of the element, whichever kind it is: the page only spreads them over the defaults.
  const fields: Record<string, unknown> = init;
  return page.evaluate(
    async ({ kind, base64, file, init }) => {
      const editor = window.slidr!;
      const binary = atob(base64);
      const data = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const asset = await editor.assets.import(
        new File([data], file.name, { type: file.mimeType }),
      );
      const slideId = editor.selection.getState().currentSlideId ?? '';
      const element = {
        id: kind === 'video' ? 'e_video' : 'e_audio',
        type: kind,
        assetId: asset.id,
        rotation: 0,
        opacity: 1,
        frame:
          kind === 'video' ? { x: 480, y: 270, w: 960, h: 540 } : { x: 800, y: 500, w: 320, h: 80 },
        autoplay: false,
        loop: false,
        volume: 1,
        ...(kind === 'video' ? { muted: false } : { showControls: true }),
        ...init,
      };
      editor.bus.batch([
        ...(asset.id in editor.bus.deck.assets ? [] : [{ type: 'asset.add' as const, asset }]),
        { type: 'element.add' as const, slideId, element: element as never },
      ]);
      editor.selection.getState().selectElements([element.id]);
      return asset;
    },
    { kind, base64: bytes.toString('base64'), file, init: fields },
  );
}

/** Where a media element stands, as the page sees it. */
export interface MediaState {
  time: number;
  paused: boolean;
  muted: boolean;
  volume: number;
  duration: number;
  src: string | null;
  poster: string | null;
  ready: number;
}

/** The state of the first media element under a selector. */
export function mediaState(page: Page, selector: string): Promise<MediaState> {
  return page.evaluate((s) => {
    const media = document.querySelector<HTMLMediaElement>(s);
    if (!media) throw new Error(`no media element at ${s}`);
    return {
      time: media.currentTime,
      paused: media.paused,
      muted: media.muted,
      volume: media.volume,
      duration: media.duration,
      src: media.getAttribute('src'),
      poster: media.getAttribute('poster'),
      ready: media.readyState,
    };
  }, selector);
}

/** The media element of an element on the Stage. */
export const STAGE_VIDEO = '[data-testid="stage-frame"] [data-element-id="e_video"] video';
export const STAGE_SOUND = '[data-testid="stage-frame"] [data-element-id="e_audio"] audio';

/**
 * Where a media element stands at every frame for a while: the least and the greatest time it
 * was seen at, how often it went back, and whether it was playing at the end.
 */
export function watchMedia(
  page: Page,
  selector: string,
  ms: number,
): Promise<{ min: number; max: number; wraps: number; paused: boolean; last: number }> {
  return page.evaluate(
    ({ s, ms }) =>
      new Promise((resolve) => {
        const media = document.querySelector<HTMLMediaElement>(s);
        if (!media) throw new Error(`no media element at ${s}`);
        const times: number[] = [];
        const started = performance.now();
        const tick = () => {
          times.push(media.currentTime);
          if (performance.now() - started < ms) requestAnimationFrame(tick);
          else {
            resolve({
              min: Math.min(...times),
              max: Math.max(...times),
              wraps: times.filter((t, i) => i > 0 && t < (times[i - 1] ?? 0) - 0.2).length,
              paused: media.paused,
              last: media.currentTime,
            });
          }
        };
        requestAnimationFrame(tick);
      }),
    { s: selector, ms },
  );
}

type Starts = HTMLMediaElement & { slidrStarts?: number[] };

/**
 * Notes where a media element stands each time it starts to play, from now on. A test that asks
 * "where did it start from" reads this, not the clock: by the time a busy machine looks, a clip
 * that started at the right place has long moved on.
 */
export async function noteStarts(page: Page, selector: string): Promise<void> {
  await page.evaluate((s) => {
    const media = document.querySelector<Starts>(s);
    if (!media) throw new Error(`no media element at ${s}`);
    if (media.slidrStarts) return;
    const starts: number[] = [];
    media.slidrStarts = starts;
    media.addEventListener('play', () => starts.push(media.currentTime));
  }, selector);
}

/** Where the media element stood the last time it started to play, once it has. */
export async function lastStart(page: Page, selector: string, count = 1): Promise<number> {
  const starts = () =>
    page.evaluate((s) => document.querySelector<Starts>(s)?.slidrStarts ?? [], selector);
  await expect.poll(async () => (await starts()).length).toBeGreaterThanOrEqual(count);
  return (await starts()).at(-1) ?? Number.NaN;
}

/**
 * How long after the start of its trim a clip may be found when it says it has started: the
 * `play` event comes a moment after the playing does, and a busy machine makes the moment longer.
 */
const START_SLACK = 0.3;

/** Whether a clip that says it started at `at` started from `from`. */
export const startedFrom = (at: number, from: number): boolean =>
  at >= from - 0.001 && at <= from + START_SLACK;

/** Waits until the media element under a selector has read the length of its file. */
export async function mediaLoaded(page: Page, selector: string): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate((s) => document.querySelector<HTMLMediaElement>(s)?.readyState, selector),
    )
    .toBeGreaterThanOrEqual(1);
}

/**
 * The colour in the middle of an element of the page, from a screenshot: what is really drawn
 * there, which for a video is its poster or the frame it stands at.
 */
export async function colourAt(page: Page, selector: string): Promise<[number, number, number]> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`nothing drawn at ${selector}`);
  const shot = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ shot, x, y }) => {
      const image = new Image();
      image.src = `data:image/png;base64,${shot}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      const [r, g, b] = context.getImageData(x, y, 1, 1).data;
      return [r ?? 0, g ?? 0, b ?? 0] as [number, number, number];
    },
    // A lower corner: the middle of the test video carries its time in white, and a popover of
    // row B may lie over its top.
    {
      shot,
      x: Math.round(box.x + box.width / 8),
      y: Math.round(box.y + (box.height * 7) / 8),
    },
  );
}

/**
 * Which second of the test video is drawn in the middle of an element of the page: `second 1`,
 * or the colour itself when it is none of the video's (a poster picture, an empty frame). Said
 * in words, so that a test that waits for one reads well when it fails.
 */
export async function secondSeen(page: Page, selector: string): Promise<string> {
  const colour = await colourAt(page, selector);
  const band = BANDS.findIndex((candidate) => near(colour, candidate));
  return band === -1 ? `rgb(${colour.join(', ')})` : `second ${band}`;
}

/** Whether two colours are the same to the eye: video compression moves them a little. */
export const near = (a: readonly number[], b: readonly number[], slack = BAND_SLACK): boolean =>
  a.every((value, i) => Math.abs(value - (b[i] ?? 0)) <= slack);

/** The colours of the test video's bands, a second each (see `recordedClip.ts`). */
export const BANDS: readonly [number, number, number][] = [
  [0xd6, 0x28, 0x28],
  [0x2a, 0x9d, 0x8f],
  [0x26, 0x46, 0x53],
  [0xe9, 0xc4, 0x6a],
  [0x6a, 0x4c, 0x93],
  [0xf4, 0xa2, 0x61],
];

/**
 * The colour the test video shows at a time. Ask for the middle of a second (0.5, 1.5): the
 * recording may have started a little late, and near the turn of a second the answer is a guess.
 */
export const bandAt = (seconds: number): readonly [number, number, number] =>
  BANDS[Math.floor(seconds) % BANDS.length] ?? [0, 0, 0];
