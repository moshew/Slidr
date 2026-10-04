import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';
import { bindClip, type Clip } from './media';
import { createPlayer, type Player } from './player';
import { recordClip, toneWav } from './testing/recordedClip';

// A real video and a real sound, played by the engine WebView2 uses: what the unit tests cannot
// see is whether a clip that plays by itself is held to its trim closely enough, and where a
// video really stands when it is at rest. The clips are recorded here (see `recordedClip.ts`).

const SECONDS = 2;
let videoUrl = '';
let soundUrl = '';

beforeAll(async () => {
  videoUrl = URL.createObjectURL(await recordClip(SECONDS));
  soundUrl = URL.createObjectURL(new Blob([toneWav(1.5)], { type: 'audio/wav' }));
}, 30_000);

afterAll(() => {
  URL.revokeObjectURL(videoUrl);
  URL.revokeObjectURL(soundUrl);
});

let clip: Clip | undefined;
let player: Player | undefined;

afterEach(() => {
  clip?.release();
  clip = undefined;
  player?.destroy();
  player = undefined;
  document.body.innerHTML = '';
});

const event = (target: EventTarget, type: string) =>
  new Promise<void>((resolve) => target.addEventListener(type, () => resolve(), { once: true }));

/** A media element with its metadata in, silent so that no browser refuses to play it. */
async function media(markup: string): Promise<HTMLMediaElement> {
  document.body.innerHTML = markup;
  const element = document.querySelector('video, audio') as HTMLMediaElement;
  element.muted = true;
  if (element.readyState < 1) await event(element, 'loadedmetadata');
  return element;
}

/** Where a clip stands at every frame for `ms`, as the page sees it. */
function watch(element: HTMLMediaElement, ms: number): Promise<number[]> {
  return new Promise((resolve) => {
    const times: number[] = [];
    const started = performance.now();
    const tick = () => {
      times.push(element.currentTime);
      if (performance.now() - started < ms) requestAnimationFrame(tick);
      else resolve(times);
    };
    requestAnimationFrame(tick);
  });
}

/** The longest a clip may run past its end before it is brought back: three frames of a screen. */
const SLACK = 0.06;

describe('a real clip', () => {
  test('the recording is a file with a length, as the tests below assume', async () => {
    const video = await media(`<video src="${videoUrl}" preload="metadata"></video>`);
    expect(video.duration).toBeGreaterThan(SECONDS - 0.3);
    expect(Number.isFinite(video.duration)).toBe(true);
  });

  test('plays from the start of its trim and stops at its end', async () => {
    const video = await media(
      `<video src="${videoUrl}" data-clip-start="0.5" data-clip-end="1.1"></video>`,
    );
    clip = bindClip(video);
    expect(await clip.play()).toBe(true);
    const times = await watch(video, 1100);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(0.5 - 0.001);
    expect(Math.max(...times)).toBeLessThanOrEqual(1.1 + SLACK);
    expect(video.paused).toBe(true);
    // It stays on its last frame.
    expect(video.currentTime).toBeGreaterThanOrEqual(1.1);
    expect(video.currentTime).toBeLessThanOrEqual(1.1 + SLACK);
  });

  test('goes round inside its trim for as long as it plays', async () => {
    const video = await media(
      `<video src="${videoUrl}" data-clip-start="0.5" data-clip-end="0.9" data-clip-loop></video>`,
    );
    clip = bindClip(video);
    await clip.play();
    const times = await watch(video, 1700);
    expect(video.paused).toBe(false);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(0.5 - 0.001);
    expect(Math.max(...times)).toBeLessThanOrEqual(0.9 + SLACK);
    // It came back to the start more than once: 1.7 seconds of a clip that is 0.4 long.
    const wraps = times.filter((t, i) => i > 0 && t < (times[i - 1] ?? 0) - 0.2).length;
    expect(wraps).toBeGreaterThanOrEqual(3);
  });

  test('goes round to the start of its trim when the file ends first', async () => {
    const video = await media(
      `<video src="${videoUrl}" data-clip-start="1.5" data-clip-end="60" data-clip-loop></video>`,
    );
    clip = bindClip(video);
    await clip.play();
    const times = await watch(video, 1400);
    expect(video.paused).toBe(false);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(1.5 - 0.001);
    expect(times.some((t, i) => i > 0 && t < (times[i - 1] ?? 0) - 0.2)).toBe(true);
  });

  test('a sound is trimmed and brought round the same way', async () => {
    const audio = await media(
      `<button type="button">A click</button>
       <audio src="${soundUrl}" preload="metadata" data-clip-start="0.3" data-clip-end="0.7" data-clip-loop></audio>`,
    );
    clip = bindClip(audio);
    // A browser plays a sound only on a page that was clicked or typed in; silent or not.
    expect(await clip.play()).toBe(false);
    expect(audio.paused).toBe(true);
    await userEvent.click(document.querySelector('button') as HTMLElement);
    expect(await clip.play()).toBe(true);
    const times = await watch(audio, 1300);
    expect(audio.paused).toBe(false);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(0.3 - 0.001);
    expect(Math.max(...times)).toBeLessThanOrEqual(0.7 + SLACK);
    expect(
      times.filter((t, i) => i > 0 && t < (times[i - 1] ?? 0) - 0.2).length,
    ).toBeGreaterThanOrEqual(2);
  });

  test('rests at its chosen frame, and plays from the start of the trim', async () => {
    const video = await media(
      `<video src="${videoUrl}" data-clip-start="0.4" data-clip-end="1.5" data-clip-still="1.2"></video>`,
    );
    clip = bindClip(video);
    clip.rest();
    await event(video, 'seeked');
    expect(video.currentTime).toBeCloseTo(1.2, 2);
    await clip.play();
    const [first] = await watch(video, 50);
    expect(first).toBeGreaterThanOrEqual(0.4 - 0.001);
    expect(first).toBeLessThan(0.7);
  });
});

describe('a real clip in a show', () => {
  /** A stage of two slides: a video that waits for a click, and one that starts by itself. */
  async function show(): Promise<{ waits: HTMLVideoElement; starts: HTMLVideoElement }> {
    document.body.innerHTML = `
      <div id="viewport" style="position:relative;width:960px;height:540px">
        <div id="stage">
          <section><div data-slide-id="a" dir="ltr" style="width:1920px;height:1080px">
            <div data-element-id="text" style="position:absolute;left:0;top:0;width:400px;height:200px"></div>
            <div data-element-id="waits" style="position:absolute;left:480px;top:270px;width:960px;height:540px">
              <video muted src="${videoUrl}" data-slidr-clip="video" data-clip-start="0.5" data-clip-end="1.5"
                data-clip-still="1" style="width:100%;height:100%;pointer-events:auto"></video>
            </div>
          </div></section>
          <section><div data-slide-id="b" dir="ltr" style="width:1920px;height:1080px">
            <div data-element-id="starts" style="position:absolute;left:480px;top:270px;width:960px;height:540px">
              <video muted src="${videoUrl}" data-slidr-clip="video" data-clip-autoplay data-clip-start="0.5"
                data-clip-end="0.9" data-clip-loop style="width:100%;height:100%;pointer-events:auto"></video>
            </div>
          </div></section>
        </div>
      </div>`;
    const viewport = document.getElementById('viewport') as HTMLElement;
    const stage = document.getElementById('stage') as HTMLElement;
    const videos = Array.from(stage.querySelectorAll('video'));
    await Promise.all(
      videos.map((v) => (v.readyState < 1 ? event(v, 'loadedmetadata') : Promise.resolve())),
    );
    player = createPlayer({
      viewport,
      stage,
      slides: Array.from(stage.children, (el) => ({ el: el as HTMLElement })),
    });
    return { waits: videos[0] as HTMLVideoElement, starts: videos[1] as HTMLVideoElement };
  }

  test('a video waits at its poster frame, and a click plays and pauses it', async () => {
    const { waits } = await show();
    await event(waits, 'seeked');
    expect(waits.paused).toBe(true);
    expect(waits.currentTime).toBeCloseTo(1, 2);
    waits.click();
    await event(waits, 'playing');
    const [first] = await watch(waits, 50);
    // From the start of the trim, not from the poster frame.
    expect(first).toBeLessThan(0.8);
    waits.click();
    expect(waits.paused).toBe(true);
    expect(player?.state).toEqual({ slide: 0, step: 0 });
  });

  test('a video that starts by itself plays when its slide is shown, and stops when it is left', async () => {
    const { starts } = await show();
    expect(starts.paused).toBe(true);
    player?.next();
    await event(starts, 'playing');
    const times = await watch(starts, 900);
    expect(Math.min(...times)).toBeGreaterThanOrEqual(0.5 - 0.001);
    expect(Math.max(...times)).toBeLessThanOrEqual(0.9 + SLACK);
    expect(starts.paused).toBe(false);
    player?.prev();
    expect(starts.paused).toBe(true);
  });
});
