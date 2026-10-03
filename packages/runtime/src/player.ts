import { slideDirection } from './direction';
import { createTimeline, type SlideTimeline } from './timeline';
import { runTransition } from './transitions';
import type { AnimationStep, Size, Transition, Warn } from './types';

/**
 * The player (WG8-T01): scaling, navigation and the state machine of slides and steps. The same
 * code drives the editor's preview, present mode and an exported file (SPEC 5.6).
 *
 * What it expects in the DOM:
 *
 *   viewport            any box; the stage is fitted into it, letterboxed
 *   └─ stage            the slides' space, 1920x1080
 *      └─ slide ...     one wrapper per slide, holding the slide the renderer drew
 *
 * The player owns the stage and the wrappers: it positions them, shows one slide at a time and
 * moves them in transitions. It leaves the rendered slides themselves alone (see `timeline.ts`).
 */
export interface PlayerSlide {
  /** The wrapper of the rendered slide. */
  el: HTMLElement;
  id?: string | undefined;
  /** How the slide comes in, and when it is left. */
  transition?: Transition | undefined;
  timeline?: readonly AnimationStep[] | undefined;
  /** Skipped by next and previous; still reachable by `goTo` and `setState`. */
  hidden?: boolean | undefined;
}

/** Where a show stands: a slide, and how many of its click steps have played. */
export interface PlayerState {
  slide: number;
  step: number;
}

export interface PlayerOptions {
  viewport: HTMLElement;
  stage: HTMLElement;
  slides: readonly PlayerSlide[];
  /** Default 1920x1080. */
  size?: Size | undefined;
  /** The slide the show opens on, played in. Default: the first one that is not hidden. */
  start?: number | undefined;
  /** Where to start instead, shown as it is, without animation: a show that follows another. */
  state?: PlayerState | undefined;
  onWarn?: Warn | undefined;
}

export interface Player {
  readonly slides: readonly PlayerSlide[];
  readonly state: PlayerState;
  /** How many click steps a slide has; the current slide when no index is given. */
  steps: (slide?: number) => number;
  /** One step forward: the next click step, or the next slide with its transition. */
  next: () => void;
  /** One step back, without animation: the previous step, or the end of the previous slide. */
  prev: () => void;
  /** Opens a slide afresh: at step 0, with the animations that play by themselves. */
  goTo: (slide: number) => void;
  /**
   * Shows exactly this state, without animation. Together with `subscribe` this is the outside
   * interface of SPEC 10: a second window follows a show by mirroring its state.
   */
  setState: (state: PlayerState) => void;
  /** Calls back on every change of slide or step. Returns the way to stop. */
  subscribe: (listener: (state: PlayerState) => void) => () => void;
  /** Fits the stage to the viewport again; the player does it by itself when the viewport resizes. */
  fit: () => void;
  destroy: () => void;
}

const DEFAULT_SIZE: Size = { w: 1920, h: 1080 };

/** Where the trim of a media element starts: the renderer writes it as a `#t=start,end` fragment. */
function trimStart(media: HTMLMediaElement): number {
  const match = /#t=([\d.]+)/.exec(media.currentSrc || media.src);
  return match ? Number(match[1]) : 0;
}

export function createPlayer(options: PlayerOptions): Player {
  const { viewport, stage, slides } = options;
  const size = options.size ?? DEFAULT_SIZE;
  const warn = options.onWarn ?? (() => undefined);
  const listeners = new Set<(state: PlayerState) => void>();
  const view = viewport.ownerDocument.defaultView;

  let index = -1;
  let step = 0;
  let timeline: SlideTimeline | undefined;
  /** Brings whatever is in flight to its end at once. */
  let settleNow: (() => void) | undefined;
  /** Bumped by every action, so that the end of an older one does not act on a newer one. */
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // ---- Layout ----

  if (view && view.getComputedStyle(viewport).position === 'static') {
    viewport.style.position = 'relative';
  }
  Object.assign(stage.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    width: `${size.w}px`,
    height: `${size.h}px`,
    transformOrigin: '0 0',
    overflow: 'hidden',
  });
  for (const slide of slides) {
    // Physical left and top: in an RTL page `inset-inline` would hang the slide off the right.
    Object.assign(slide.el.style, { position: 'absolute', left: '0', top: '0', display: 'none' });
  }

  function fit(): void {
    const w = viewport.clientWidth;
    const h = viewport.clientHeight;
    const scale = Math.min(w / size.w, h / size.h) || 1;
    const x = (w - size.w * scale) / 2;
    const y = (h - size.h * scale) / 2;
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  }
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(fit);
  observer?.observe(viewport);
  fit();

  // ---- Media and scripted content follow the slide they are on ----

  const mediaOf = (slide: PlayerSlide) =>
    Array.from(slide.el.querySelectorAll<HTMLMediaElement>('video, audio'));

  for (const media of Array.from(stage.querySelectorAll<HTMLMediaElement>('video, audio'))) {
    // An export writes the volume down as an attribute: markup has no other place for it.
    if (media.dataset.volume) media.volume = Number(media.dataset.volume);
    // Nothing plays until its slide is shown.
    media.pause();
  }
  // Media on a slide that is not shown does not play, autoplay or not. `play` does not bubble,
  // so it is caught on its way down.
  const onPlay = (event: Event) => {
    const current = slides[index]?.el;
    const media = event.target;
    if (media instanceof HTMLMediaElement && !current?.contains(media)) media.pause();
  };
  stage.addEventListener('play', onPlay, true);

  function show(slide: PlayerSlide, revisit: boolean): void {
    // Spelled out: an exported file's stylesheet hides every slide until the player shows one.
    slide.el.style.display = 'block';
    const frames = Array.from(
      slide.el.querySelectorAll<HTMLIFrameElement>('iframe[data-slidr-html="frame"]'),
    );
    if (!revisit || !frames.length || !view) return;
    // A sandboxed frame loaded while its slide had no size, so its script starts over now that
    // it has one. Not before the slide has been drawn once: Chromium does not render a hidden
    // frame, and one that is reloaded in the frame it comes into view in stays blank.
    view.requestAnimationFrame(() =>
      view.requestAnimationFrame(() => {
        if (slides[index] !== slide) return;
        for (const frame of frames) {
          const { srcdoc } = frame;
          frame.srcdoc = srcdoc;
        }
      }),
    );
  }

  function hide(slide: PlayerSlide): void {
    slide.el.style.display = 'none';
    for (const media of mediaOf(slide)) media.pause();
  }

  function startMedia(slide: PlayerSlide): void {
    for (const media of mediaOf(slide)) {
      if (!media.autoplay) continue;
      media.currentTime = trimStart(media);
      // A browser refuses sound before the first click or key; the slide is shown either way.
      media.play().catch(() => undefined);
    }
  }

  // ---- State ----

  const visibleFrom = (from: number, by: 1 | -1): number => {
    for (let i = from + by; i >= 0 && i < slides.length; i += by) {
      if (!slides[i]?.hidden) return i;
    }
    return -1;
  };

  const timelineOf = (slide: PlayerSlide): SlideTimeline =>
    createTimeline(slide.el, slide.timeline ?? [], { size, onWarn: warn });

  function emit(): void {
    const state = { slide: index, step };
    for (const listener of listeners) listener(state);
  }

  function settle(): void {
    generation++;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const now = settleNow;
    settleNow = undefined;
    now?.();
  }

  /** The slide is at rest: `advance.afterMs` counts from here. */
  function rest(): void {
    settleNow = undefined;
    const after = slides[index]?.transition?.advance.afterMs;
    const more = (timeline && step < timeline.clicks) || visibleFrom(index, 1) !== -1;
    if (after !== undefined && more) timer = setTimeout(next, after);
  }

  function playGroup(group: number): void {
    const mine = ++generation;
    const playing = timeline;
    if (!playing) return;
    settleNow = () => playing.finish();
    void playing.play(group).then(() => {
      if (generation === mine) rest();
    });
  }

  /** Shows a slide without a transition: afresh, at its end, or at a given step. */
  function open(to: number, at: number | 'fresh' | 'end'): void {
    const slide = slides[to];
    if (!slide) return;
    settle();
    const from = slides[index];
    if (from !== slide) {
      if (from) hide(from);
      timeline?.clear();
      const revisit = index !== -1;
      index = to;
      timeline = timelineOf(slide);
      show(slide, revisit);
      startMedia(slide);
    }
    const current = timeline as SlideTimeline;
    if (at === 'fresh') {
      step = 0;
      current.apply(0);
      emit();
      playGroup(0);
      return;
    }
    step = at === 'end' ? current.clicks : Math.min(Math.max(at, 0), current.clicks);
    current.apply(step + 1);
    emit();
    rest();
  }

  /** Moves on to a slide with its transition, then plays its lead-in. */
  function enter(to: number): void {
    const slide = slides[to] as PlayerSlide;
    const from = slides[index] as PlayerSlide;
    const leaving = timeline;
    const entering = timelineOf(slide);
    index = to;
    step = 0;
    timeline = entering;
    entering.apply(0);
    show(slide, true);
    const mine = ++generation;
    const run = runTransition(from.el, slide.el, slide.transition, slideDirection(slide.el), warn);
    let arrived = false;
    const arrive = () => {
      if (arrived) return;
      arrived = true;
      hide(from);
      leaving?.clear();
      startMedia(slide);
    };
    settleNow = () => {
      run.finish();
      arrive();
      entering.apply(1);
    };
    void run.finished.then(() => {
      if (generation !== mine) return;
      arrive();
      playGroup(0);
    });
    emit();
  }

  function next(): void {
    settle();
    if (timeline && step < timeline.clicks) {
      step++;
      emit();
      playGroup(step);
      return;
    }
    const to = visibleFrom(index, 1);
    if (to !== -1) enter(to);
  }

  function prev(): void {
    if (step > 0) open(index, step - 1);
    else {
      const to = visibleFrom(index, -1);
      if (to !== -1) open(to, 'end');
      else settle();
    }
  }

  const player: Player = {
    slides,
    get state() {
      return { slide: index, step };
    },
    steps: (slide = index) => {
      if (slide === index && timeline) return timeline.clicks;
      const other = slides[slide];
      if (!other) return 0;
      const probe = timelineOf(other);
      return probe.clicks;
    },
    next,
    prev,
    goTo: (slide) => open(slide, 'fresh'),
    setState: (state) => open(state.slide, state.step),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    fit,
    destroy: () => {
      settle();
      timeline?.clear();
      timeline = undefined;
      listeners.clear();
      observer?.disconnect();
      stage.removeEventListener('play', onPlay, true);
      stage.style.transform = '';
      for (const slide of slides) slide.el.style.display = '';
    },
  };

  if (options.state) open(options.state.slide, options.state.step);
  else if (options.start !== undefined && slides[options.start]) open(options.start, 'fresh');
  else open(Math.max(visibleFrom(-1, 1), 0), 'fresh');
  return player;
}
