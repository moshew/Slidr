/**
 * Video and audio on a slide (MED-02, MED-03): where a clip starts and ends, whether it goes
 * round, and what it shows while it waits. One implementation for the editor's playback in place,
 * for present mode and for an exported file: the renderer writes what a clip is on the media
 * element, and whoever plays it reads it back here.
 *
 *   <video data-slidr-clip data-clip-start="1.5" data-clip-end="4" data-clip-loop
 *          data-clip-autoplay data-clip-still="2.5" poster="..">
 *
 * A browser does none of this by itself. A `#t=start,end` fragment stops a clip at its end once
 * and never brings it round, and the `loop` attribute goes back to the start of the file, not to
 * the start of the trim.
 *
 * The names are those `packages/renderer/src/elements.tsx` writes; the runtime depends on
 * nothing, so they are repeated here, and a test in `@slidr/html-export` holds the two together.
 */
export const CLIP_ATTRIBUTE = 'data-slidr-clip';
/** The mark of a sound that shows no controls of its own: a click on it plays and pauses. */
export const CLIP_TOGGLE_ATTRIBUTE = 'data-slidr-clip-toggle';
/** What a click plays and pauses instead of moving the show on. */
export const CLIP_TOGGLE_SELECTOR = `video[${CLIP_ATTRIBUTE}]:not([controls]), [${CLIP_TOGGLE_ATTRIBUTE}]`;

/** The attributes of a clip, as markup carries them. Times are in seconds. */
export const CLIP_START = 'data-clip-start';
export const CLIP_END = 'data-clip-end';
export const CLIP_LOOP = 'data-clip-loop';
export const CLIP_AUTOPLAY = 'data-clip-autoplay';
/** The frame a video shows while it waits, when that is not the start of its trim. */
export const CLIP_STILL = 'data-clip-still';
/** Markup has no place for the volume of a media element: an export writes it here. */
export const CLIP_VOLUME = 'data-volume';

/** A clip counts as at its end from this long before it, in seconds: a frame or so. */
const END_SLACK = 0.04;

/** How the mark of a sound shows that it plays. */
const PULSE: Keyframe[] = [{ opacity: 1 }, { opacity: 0.55 }];
const PULSE_TIMING: KeyframeAnimationOptions = {
  duration: 700,
  direction: 'alternate',
  iterations: Infinity,
  easing: 'ease-in-out',
};

export interface ClipSettings {
  /** Seconds into the file. */
  start: number;
  /** Seconds into the file; undefined for the end of the file. */
  end: number | undefined;
  loop: boolean;
  autoplay: boolean;
  /** The frame shown at rest, in seconds; undefined for the start of the trim. */
  still: number | undefined;
}

function seconds(media: HTMLMediaElement, name: string): number | undefined {
  const text = media.getAttribute(name);
  if (text === null || text === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** What a media element says its clip is. Read anew each time: the editor rewrites it. */
export function clipSettings(media: HTMLMediaElement): ClipSettings {
  const start = seconds(media, CLIP_START) ?? 0;
  const end = seconds(media, CLIP_END);
  return {
    start,
    // An end at or before the start is no trim at all.
    end: end !== undefined && end > start ? end : undefined,
    loop: media.hasAttribute(CLIP_LOOP) || media.loop,
    autoplay: media.hasAttribute(CLIP_AUTOPLAY),
    still: seconds(media, CLIP_STILL),
  };
}

export interface Clip {
  readonly media: HTMLMediaElement;
  readonly playing: boolean;
  /**
   * Plays: from the start of the trim when the clip is at rest or stands at its end, else from
   * where it was paused. Resolves false when the browser refused, which it does for sound before
   * the first click or key on a page; the clip is then at rest again.
   */
  play: () => Promise<boolean>;
  pause: () => void;
  toggle: () => void;
  /** Shows a moment of the file without playing it; the next play goes on from there. */
  seek: (seconds: number) => void;
  /** Brings the clip to rest: paused, and showing its poster. */
  rest: () => void;
  /** Stops watching the element. The clip is left as it stands. */
  release: () => void;
}

/**
 * Takes charge of a media element as a clip. It keeps the clip inside its trim however it was
 * started (by `play`, by a click, by the browser's own controls), and brings it round when it
 * loops.
 */
export function bindClip(media: HTMLMediaElement): Clip {
  const view = media.ownerDocument.defaultView;
  /** At rest: the next play starts from the start of the trim. */
  let fresh = true;
  let frame: number | undefined;
  let pulse: Animation | undefined;

  const volume = Number(media.getAttribute(CLIP_VOLUME) ?? NaN);
  if (volume >= 0 && volume <= 1) media.volume = volume;

  const seek = (time: number) => {
    // Before the file's metadata is in, this is where playback will start.
    if (Math.abs(media.currentTime - time) > 0.001) media.currentTime = time;
  };

  const atEnd = () => {
    const { end } = clipSettings(media);
    return media.ended || (end !== undefined && media.currentTime >= end - END_SLACK);
  };

  /** Holds a playing clip to the end of its trim. */
  const check = () => {
    const { start, end, loop } = clipSettings(media);
    if (end === undefined || media.paused || media.currentTime < end) return;
    if (loop) seek(start);
    // Not a loop: the clip stops on its last frame, and the next play starts it over.
    else media.pause();
  };

  // `timeupdate` comes four times a second: too coarse for the end of a short loop. A frame
  // callback is exact while the page is seen, and `timeupdate` still works when it is not.
  const tick = () => {
    frame = undefined;
    check();
    if (!media.paused) watch();
  };
  const watch = () => {
    if (frame === undefined && view) frame = view.requestAnimationFrame(tick);
  };
  const unwatch = () => {
    if (frame !== undefined) view?.cancelAnimationFrame(frame);
    frame = undefined;
  };

  /** The mark of a sound without controls, beside it in the element's box. */
  const mark = () =>
    media.parentElement?.querySelector<HTMLElement>(`[${CLIP_TOGGLE_ATTRIBUTE}]`) ?? undefined;
  const setPulse = (on: boolean) => {
    pulse?.cancel();
    pulse = undefined;
    const target = on ? mark() : undefined;
    if (!target || typeof target.animate !== 'function') return;
    pulse = target.animate(PULSE, PULSE_TIMING);
    // Cancelling it is how it ends: not a failure anyone waits to hear of.
    pulse.finished.catch(() => undefined);
  };

  const onPlay = () => {
    // Started by the browser's own controls: `play` below has not placed it.
    if (fresh) seek(clipSettings(media).start);
    fresh = false;
    watch();
    setPulse(true);
  };
  const onPause = () => {
    unwatch();
    setPulse(false);
  };
  const onEnded = () => {
    setPulse(false);
    // The file ended inside the trim. `loop` on the element itself never gets here.
    const { start, loop } = clipSettings(media);
    if (!loop) return;
    seek(start);
    media.play().catch(() => undefined);
  };
  /** Another file took the element's place (the editor changed its source): it is at rest. */
  const onEmptied = () => {
    fresh = true;
    unwatch();
    setPulse(false);
  };

  media.addEventListener('play', onPlay);
  media.addEventListener('pause', onPause);
  media.addEventListener('ended', onEnded);
  media.addEventListener('timeupdate', check);
  media.addEventListener('emptied', onEmptied);

  const rest = () => {
    media.pause();
    const { start, still } = clipSettings(media);
    if (media.localName === 'video' && media.getAttribute('poster')) {
      // A picture as the poster: a browser shows it only until the first seek or play, and
      // only loading the file anew brings it back.
      if (!fresh) media.load();
    } else {
      seek(still ?? start);
    }
    fresh = true;
  };

  const clip: Clip = {
    media,
    get playing() {
      return !media.paused && !media.ended;
    },
    play: () => {
      if (fresh || atEnd()) seek(clipSettings(media).start);
      fresh = false;
      return media.play().then(
        () => true,
        (error: unknown) => {
          // Refused, not interrupted by a pause: the clip waits at its poster for a click.
          if (error instanceof Error && error.name === 'NotAllowedError') rest();
          return false;
        },
      );
    },
    pause: () => media.pause(),
    toggle: () => {
      if (clip.playing) media.pause();
      else void clip.play();
    },
    seek: (time) => {
      media.pause();
      fresh = false;
      seek(time);
    },
    rest,
    release: () => {
      unwatch();
      setPulse(false);
      media.removeEventListener('play', onPlay);
      media.removeEventListener('pause', onPause);
      media.removeEventListener('ended', onEnded);
      media.removeEventListener('timeupdate', check);
      media.removeEventListener('emptied', onEmptied);
    },
  };
  return clip;
}

/** The media element a click on `hit` plays and pauses: itself, or the sound its mark stands for. */
export function clipOf(hit: Element): HTMLMediaElement | undefined {
  if (hit instanceof HTMLMediaElement) return hit;
  return hit.parentElement?.querySelector<HTMLMediaElement>('audio, video') ?? undefined;
}
