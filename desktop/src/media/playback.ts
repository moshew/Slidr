import { bindClip, type Clip } from '@slidr/runtime';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { stageElement } from '../shell';
import type { ClipElement } from './clip';

/*
 * Playing the selected clip in place (MED-02): the video or the sound that the Stage draws is
 * played where it is, with its own sound, and nothing in the deck changes. The clip is the
 * runtime's (`bindClip`): the trim, the loop and the poster behave here exactly as they do in a
 * show and in an exported file, because it is the same code.
 *
 * The Stage draws a video silent and at its poster. While this plays it, it has the sound the
 * element is set to; when the selection moves on, the clip is put back as the Stage drew it.
 */

/** The media element of an element of the slide on the Stage. */
export function stageMedia(elementId: string): HTMLMediaElement | null {
  return stageElement(elementId)?.querySelector<HTMLMediaElement>('video, audio') ?? null;
}

export interface PlaybackState {
  /** The file is at hand: the clip can be played. */
  ready: boolean;
  playing: boolean;
  /** Where the clip stands, in seconds. */
  time: number;
  /** The length of the file in seconds, once the browser has read it. */
  duration: number | undefined;
}

export interface Playback extends PlaybackState {
  toggle: () => void;
  /** Shows a moment of the clip without playing it; playing goes on from there. */
  seek: (seconds: number) => void;
  /** Stops, and puts the clip back at its poster. */
  rest: () => void;
}

const AT_REST: PlaybackState = { ready: false, playing: false, time: 0, duration: undefined };

/** What the media element reports that changes what the tools show. */
const EVENTS = [
  'play',
  'pause',
  'ended',
  'timeupdate',
  'seeked',
  'durationchange',
  'loadedmetadata',
  'emptied',
] as const;

/** The session that has moved its clip from where the Stage drew it. */
let active: PlaybackSession | undefined;

/** Stops whatever the editor is playing in place, and puts it back at its poster: a show starts. */
export function stopPlayback(): void {
  active?.rest();
}

export interface PlaybackSession {
  subscribe: (listener: () => void) => () => void;
  state: () => PlaybackState;
  /** Finds the media element the Stage drew for the element, and takes charge of it. */
  attach: () => void;
  /** Plays or pauses; `muted` is the sound the element is set to. */
  toggle: (muted: boolean) => void;
  /** The element was muted or unmuted while it plays. */
  setMuted: (muted: boolean) => void;
  seek: (seconds: number) => void;
  rest: () => void;
  /** Puts the clip back as the Stage drew it and lets go of it. */
  dispose: () => void;
}

/** The playback of one element of the slide on the Stage. */
export function createPlaybackSession(
  elementId: string,
  find: (elementId: string) => HTMLMediaElement | null = stageMedia,
): PlaybackSession {
  const listeners = new Set<() => void>();
  let media: HTMLMediaElement | null = null;
  let clip: Clip | undefined;
  /** Whether this has moved the clip from where the Stage drew it. */
  let touched = false;
  let state = AT_REST;

  const sync = () => {
    const next: PlaybackState = media
      ? {
          ready: Boolean(media.getAttribute('src')),
          playing: clip?.playing ?? false,
          time: media.currentTime,
          duration: Number.isFinite(media.duration) ? media.duration : undefined,
        }
      : AT_REST;
    const same =
      next.ready === state.ready &&
      next.playing === state.playing &&
      next.time === state.time &&
      next.duration === state.duration;
    if (same) return;
    state = next;
    for (const listener of listeners) listener();
  };

  const rest = () => {
    if (media && clip && touched) {
      clip.rest();
      // As the Stage drew it: a video in the editor is silent.
      if (media.localName === 'video') media.muted = true;
    }
    touched = false;
  };

  const release = () => {
    if (!media) return;
    rest();
    for (const type of EVENTS) media.removeEventListener(type, sync);
    clip?.release();
    clip = undefined;
    media = null;
  };

  const session: PlaybackSession = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    state: () => state,
    attach: () => {
      const found = find(elementId);
      if (found !== media) {
        release();
        media = found;
        if (found) {
          clip = bindClip(found);
          // The Stage does not load a sound until it is played; the selected one says its length.
          if (found.preload === 'none') found.preload = 'metadata';
          for (const type of EVENTS) found.addEventListener(type, sync);
        }
      }
      sync();
    },
    toggle: (muted) => {
      session.attach();
      if (!media || !clip) return;
      if (clip.playing) {
        clip.pause();
        return;
      }
      touched = true;
      active = session;
      media.muted = muted;
      void clip.play();
    },
    setMuted: (muted) => {
      if (media && clip?.playing) media.muted = muted;
    },
    seek: (seconds) => {
      session.attach();
      if (!clip) return;
      touched = true;
      active = session;
      clip.seek(seconds);
      sync();
    },
    rest: () => {
      rest();
      sync();
    },
    dispose: () => {
      release();
      if (active === session) active = undefined;
      sync();
    },
  };
  return session;
}

/** Plays the clip of an element of the current slide in place, for the tools of row B. */
export function usePlayback(element: ClipElement): Playback {
  const session = useMemo(() => createPlaybackSession(element.id), [element.id]);
  const state = useSyncExternalStore(session.subscribe, session.state);
  // The sound the element is set to: a sound has no mute of its own.
  const muted = element.type === 'video' && element.muted;

  // The Stage draws the element, and may draw it anew: its node is looked up after every render.
  useEffect(() => session.attach());
  // The selection moved on, or the tools went away: the clip is as the Stage drew it again.
  useEffect(() => session.dispose, [session]);
  // Muting the element while it plays is heard at once.
  useEffect(() => session.setMuted(muted), [session, muted]);

  return useMemo(
    () => ({
      ...state,
      toggle: () => session.toggle(muted),
      seek: session.seek,
      rest: session.rest,
    }),
    [session, state, muted],
  );
}
