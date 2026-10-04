// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindClip, clipOf, clipSettings, CLIP_TOGGLE_SELECTOR, type Clip } from './media';
import { installFakeAnimations, type FakeAnimations } from './testing/fakeAnimations';

/*
 * happy-dom's media element keeps `currentTime` and `paused` and sends `play` and `pause`, but it
 * plays nothing: a test moves the time by hand and says so with `timeupdate`, as a browser would.
 */

let fake: FakeAnimations;
let clip: Clip | undefined;

function media(markup: string): HTMLMediaElement {
  document.body.innerHTML = markup;
  return document.querySelector('video, audio') as HTMLMediaElement;
}

/** The clip plays on to `time`, as a browser would report it. */
function reach(element: HTMLMediaElement, time: number): void {
  element.currentTime = time;
  element.dispatchEvent(new Event('timeupdate'));
}

const loads = (element: HTMLMediaElement) => {
  const spy = vi.fn();
  element.addEventListener('emptied', spy);
  return spy;
};

beforeEach(() => {
  fake = installFakeAnimations();
});

afterEach(() => {
  clip?.release();
  clip = undefined;
  fake.uninstall();
  document.body.innerHTML = '';
});

describe('clipSettings', () => {
  it('reads what the renderer wrote on the element, in seconds', () => {
    const video = media(
      '<video data-slidr-clip="video" data-clip-start="1.5" data-clip-end="4" data-clip-loop data-clip-autoplay data-clip-still="2.25"></video>',
    );
    expect(clipSettings(video)).toEqual({
      start: 1.5,
      end: 4,
      loop: true,
      autoplay: true,
      still: 2.25,
    });
  });

  it('is the whole file, played once and on a click, for an element that says nothing', () => {
    expect(clipSettings(media('<audio></audio>'))).toEqual({
      start: 0,
      end: undefined,
      loop: false,
      autoplay: false,
      still: undefined,
    });
  });

  it('takes the loop of the element itself, and no end that is not after the start', () => {
    const video = media('<video loop data-clip-start="3" data-clip-end="2"></video>');
    expect(clipSettings(video)).toMatchObject({ start: 3, end: undefined, loop: true });
    expect(clipSettings(media('<video data-clip-start="x" data-clip-end="-1"></video>'))).toEqual({
      start: 0,
      end: undefined,
      loop: false,
      autoplay: false,
      still: undefined,
    });
  });

  it('is read anew every time: the editor rewrites the attributes of a clip it plays', async () => {
    const video = media('<video data-clip-start="1" data-clip-end="2"></video>');
    clip = bindClip(video);
    await clip.play();
    video.setAttribute('data-clip-end', '5');
    reach(video, 3);
    expect(video.paused).toBe(false);
    reach(video, 5);
    expect(video.paused).toBe(true);
  });
});

describe('bindClip', () => {
  it('plays from the start of the trim, and stops on the last frame at its end', async () => {
    const video = media('<video data-clip-start="1.5" data-clip-end="4"></video>');
    clip = bindClip(video);
    expect(await clip.play()).toBe(true);
    expect(video.currentTime).toBe(1.5);
    expect(clip.playing).toBe(true);
    reach(video, 3.9);
    expect(video.paused).toBe(false);
    reach(video, 4.02);
    expect(video.paused).toBe(true);
    expect(clip.playing).toBe(false);
    // Not moved back: the audience keeps the last frame.
    expect(video.currentTime).toBe(4.02);
  });

  it('starts over when it is played again from its end', async () => {
    const video = media('<video data-clip-start="1.5" data-clip-end="4"></video>');
    clip = bindClip(video);
    await clip.play();
    reach(video, 4);
    await clip.play();
    expect(video.currentTime).toBe(1.5);
    expect(video.paused).toBe(false);
  });

  it('goes on from where it was paused', async () => {
    const video = media('<video data-clip-start="1.5" data-clip-end="4"></video>');
    clip = bindClip(video);
    await clip.play();
    reach(video, 2.5);
    clip.toggle();
    expect(video.paused).toBe(true);
    clip.toggle();
    expect(video.paused).toBe(false);
    expect(video.currentTime).toBe(2.5);
  });

  it('goes round inside the trim when it loops', async () => {
    const video = media('<video data-clip-start="1.5" data-clip-end="4" data-clip-loop></video>');
    clip = bindClip(video);
    await clip.play();
    reach(video, 4.01);
    expect(video.currentTime).toBe(1.5);
    expect(video.paused).toBe(false);
    reach(video, 4);
    expect(video.currentTime).toBe(1.5);
    expect(video.paused).toBe(false);
  });

  it('goes back to the start of the trim when the file ends before the trim does', async () => {
    const audio = media('<audio data-clip-start="2" data-clip-end="900" data-clip-loop></audio>');
    clip = bindClip(audio);
    await clip.play();
    audio.currentTime = 30;
    audio.pause();
    const play = vi.spyOn(audio, 'play');
    audio.dispatchEvent(new Event('ended'));
    expect(audio.currentTime).toBe(2);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('leaves a clip that does not loop alone when its file ends', async () => {
    const audio = media('<audio></audio>');
    clip = bindClip(audio);
    await clip.play();
    audio.currentTime = 30;
    audio.pause();
    const play = vi.spyOn(audio, 'play');
    audio.dispatchEvent(new Event('ended'));
    expect(audio.currentTime).toBe(30);
    expect(play).not.toHaveBeenCalled();
  });

  it('keeps a clip started by the browser itself inside its trim too', () => {
    // The play button of the controls an audio element shows.
    const audio = media('<audio controls data-clip-start="2" data-clip-end="3"></audio>');
    clip = bindClip(audio);
    void audio.play();
    expect(audio.currentTime).toBe(2);
    reach(audio, 3.1);
    expect(audio.paused).toBe(true);
  });

  it('rests at the chosen frame, else at the start of the trim', async () => {
    const video = media(
      '<video data-clip-start="1.5" data-clip-end="4" data-clip-still="2.5"></video>',
    );
    clip = bindClip(video);
    clip.rest();
    expect(video.currentTime).toBe(2.5);
    // Played from rest, it starts at the trim, not at the frame it showed.
    await clip.play();
    expect(video.currentTime).toBe(1.5);
    reach(video, 3);
    clip.rest();
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(2.5);

    const plain = media('<video data-clip-start="1.5" data-clip-end="4"></video>');
    clip.release();
    clip = bindClip(plain);
    await clip.play();
    reach(plain, 3);
    clip.rest();
    expect(plain.currentTime).toBe(1.5);
  });

  it('brings a poster that is a picture back by loading the file anew, and only when it left', async () => {
    const video = media('<video poster="poster.png" data-clip-start="1"></video>');
    clip = bindClip(video);
    const loaded = loads(video);
    // At rest already: the poster shows, and a seek would take it away.
    clip.rest();
    expect(loaded).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(0);
    await clip.play();
    clip.rest();
    expect(loaded).toHaveBeenCalledTimes(1);
    expect(video.paused).toBe(true);
    // And the next play starts at the trim again.
    await clip.play();
    expect(video.currentTime).toBe(1);
  });

  it('shows a moment without playing, and plays on from there', async () => {
    const video = media('<video data-clip-start="1" data-clip-end="4"></video>');
    clip = bindClip(video);
    clip.seek(2.5);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(2.5);
    await clip.play();
    expect(video.currentTime).toBe(2.5);
    // A moment at or past the end is the end: playing starts over.
    clip.seek(4);
    await clip.play();
    expect(video.currentTime).toBe(1);
  });

  it('goes back to rest when the browser refuses to play, and says so', async () => {
    const video = media('<video data-clip-start="1" data-clip-still="3"></video>');
    clip = bindClip(video);
    vi.spyOn(video, 'play').mockRejectedValue(
      Object.assign(new Error('no gesture yet'), { name: 'NotAllowedError' }),
    );
    expect(await clip.play()).toBe(false);
    expect(video.currentTime).toBe(3);
    expect(clip.playing).toBe(false);
  });

  it('stays where it is when a pause cut the start of playing short', async () => {
    const video = media('<video data-clip-start="1" data-clip-still="3"></video>');
    clip = bindClip(video);
    vi.spyOn(video, 'play').mockRejectedValue(
      Object.assign(new Error('interrupted'), { name: 'AbortError' }),
    );
    expect(await clip.play()).toBe(false);
    expect(video.currentTime).toBe(1);
  });

  it('takes the volume an export wrote down', () => {
    const audio = media('<audio data-volume="0.4"></audio>');
    clip = bindClip(audio);
    expect(audio.volume).toBe(0.4);
  });

  it('shows on the mark of a sound that it plays, and stops showing it with the sound', async () => {
    const audio = media(
      '<div data-element-id="e"><div data-slidr-clip-toggle></div><audio data-slidr-clip="audio"></audio></div>',
    );
    const mark = document.querySelector('[data-slidr-clip-toggle]') as HTMLElement;
    clip = bindClip(audio);
    await clip.play();
    expect(fake.live().map((a) => a.target)).toEqual([mark]);
    clip.pause();
    expect(fake.live()).toHaveLength(0);
    await clip.play();
    clip.release();
    expect(fake.live()).toHaveLength(0);
  });

  it('lets go of the element on release', async () => {
    const video = media('<video data-clip-start="1" data-clip-end="2"></video>');
    clip = bindClip(video);
    await clip.play();
    clip.release();
    reach(video, 3);
    expect(video.paused).toBe(false);
  });
});

describe('what a click plays', () => {
  it('is a video without controls of its own, and the mark of a sound', () => {
    document.body.innerHTML = `
      <video id="clip" data-slidr-clip="video"></video>
      <video id="own" data-slidr-clip="video" controls></video>
      <video id="foreign"></video>
      <div><div id="mark" data-slidr-clip-toggle></div><audio id="sound" data-slidr-clip="audio"></audio></div>
      <audio id="bare" data-slidr-clip="audio"></audio>`;
    const hits = Array.from(document.querySelectorAll(CLIP_TOGGLE_SELECTOR), (el) => el.id);
    expect(hits).toEqual(['clip', 'mark']);
    expect(clipOf(document.getElementById('clip') as Element)?.id).toBe('clip');
    expect(clipOf(document.getElementById('mark') as Element)?.id).toBe('sound');
  });
});
