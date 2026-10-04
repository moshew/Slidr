// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlaybackSession, stopPlayback, type PlaybackSession } from './playback';

/*
 * The session that plays the selected clip in place, against happy-dom's media element: it keeps
 * a time and a paused flag and sends `play` and `pause`, and plays nothing. That a real clip is
 * heard and seen is the business of the end-to-end suite (e2e/video-playback.spec.ts).
 */

let session: PlaybackSession | undefined;

/** A stage with one clip, as the renderer draws it in the editor. */
function stage(markup: string) {
  document.body.innerHTML = `<div data-element-id="e_clip">${markup}</div>`;
  const find = (id: string) =>
    document.querySelector<HTMLMediaElement>(
      `[data-element-id="${id}"] video, [data-element-id="${id}"] audio`,
    );
  session = createPlaybackSession('e_clip', find);
  session.attach();
  return document.querySelector('video, audio') as HTMLMediaElement;
}

const VIDEO =
  '<video src="clip.webm#t=2" muted data-slidr-clip="video" data-clip-start="1" data-clip-end="4" data-clip-still="2"></video>';

afterEach(() => {
  session?.dispose();
  session = undefined;
  document.body.innerHTML = '';
});

describe('playing a clip in place', () => {
  it('is ready for a clip whose file is at hand', () => {
    stage(VIDEO);
    expect(session?.state()).toMatchObject({ ready: true, playing: false });
    session?.dispose();
    stage('<video data-slidr-clip="video"></video>');
    expect(session?.state().ready).toBe(false);
  });

  it('plays with the sound the element is set to, from the start of its trim', () => {
    const video = stage(VIDEO);
    session?.toggle(false);
    expect(video.paused).toBe(false);
    expect(video.muted).toBe(false);
    expect(video.currentTime).toBe(1);
    expect(session?.state().playing).toBe(true);
    session?.toggle(false);
    expect(video.paused).toBe(true);
    expect(session?.state().playing).toBe(false);
  });

  it('plays a muted element silent, and follows a change of its mute while it plays', () => {
    const video = stage(VIDEO);
    session?.toggle(true);
    expect(video.muted).toBe(true);
    session?.setMuted(false);
    expect(video.muted).toBe(false);
    session?.toggle(false);
    // Paused, the video stays as it is: the Stage's own silence is not a setting to follow.
    session?.setMuted(true);
    expect(video.muted).toBe(false);
  });

  it('puts the clip back as the Stage drew it when it is let go: silent, at its poster', () => {
    const video = stage(VIDEO);
    session?.toggle(false);
    video.currentTime = 3;
    session?.dispose();
    expect(video.paused).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.currentTime).toBe(2);
    // And it no longer keeps the trim: the element is the Stage's again.
    void video.play();
    video.currentTime = 9;
    video.dispatchEvent(new Event('timeupdate'));
    expect(video.paused).toBe(false);
  });

  it('leaves a clip it never moved exactly as it was', () => {
    const video = stage(VIDEO);
    video.currentTime = 2;
    const loaded = vi.fn();
    video.addEventListener('emptied', loaded);
    const seeking = vi.spyOn(video, 'pause');
    session?.dispose();
    expect(seeking).not.toHaveBeenCalled();
    expect(loaded).not.toHaveBeenCalled();
    expect(video.currentTime).toBe(2);
  });

  it('shows a moment without playing, and tells the tools where the clip stands', () => {
    const video = stage(VIDEO);
    const heard = vi.fn();
    session?.subscribe(heard);
    session?.seek(2.5);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBe(2.5);
    expect(session?.state().time).toBe(2.5);
    expect(heard).toHaveBeenCalled();
    // Rest puts the poster back.
    session?.rest();
    expect(video.currentTime).toBe(2);
    expect(session?.state().time).toBe(2);
  });

  it('follows the element when the Stage draws it anew', () => {
    const first = stage(VIDEO);
    session?.toggle(false);
    // The Stage replaced the node: a preview came and went, or the slide was drawn again.
    document.body.innerHTML = `<div data-element-id="e_clip">${VIDEO}</div>`;
    const second = document.querySelector('video') as HTMLVideoElement;
    session?.attach();
    expect(first.paused).toBe(true);
    expect(session?.state().playing).toBe(false);
    session?.toggle(false);
    expect(second.paused).toBe(false);
  });

  it('has nothing to play when the element is not on the Stage', () => {
    document.body.innerHTML = '';
    session = createPlaybackSession('e_clip', () => null);
    session.attach();
    expect(session.state()).toEqual({ ready: false, playing: false, time: 0, duration: undefined });
    session.toggle(false);
    session.seek(1);
    session.rest();
  });

  it('makes the selected sound read its length, which the Stage does not load by itself', () => {
    const audio = stage('<audio src="tone.wav" preload="none" data-slidr-clip="audio"></audio>');
    expect(audio.preload).toBe('metadata');
  });

  it('is stopped from outside when a show starts', () => {
    const video = stage(VIDEO);
    session?.toggle(false);
    video.currentTime = 3;
    stopPlayback();
    expect(video.paused).toBe(true);
    expect(video.muted).toBe(true);
    expect(video.currentTime).toBe(2);
    expect(session?.state().playing).toBe(false);
    // With nothing playing it does nothing.
    session?.dispose();
    stopPlayback();
  });
});
