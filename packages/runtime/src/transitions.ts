import { safeEasing, travel, type Dir, type Vec } from './direction';
import type { transitionNames } from './names';
import type { Transition, Warn } from './types';

/**
 * The ready-made slide transitions (SPEC 5.6, WG8-T02), as Web Animations on the two slides.
 * `direction` is the way the slides travel; without one they travel towards `start`, which is how
 * a deck reads forwards: leftwards in LTR, rightwards in RTL.
 */

interface Motion {
  /** Keyframes of the slide that leaves and of the slide that comes in; either may stay still. */
  from?: Keyframe[];
  to?: Keyframe[];
  /** The slide that leaves is drawn above the one that comes in. */
  fromOnTop?: boolean;
}

const at = (v: Vec, share: number): string => `${v.x * share * 100}% ${v.y * share * 100}%`;

/** A wipe uncovers the incoming slide behind an edge that travels along `v`. */
function wipe(v: Vec, cut: number): string {
  const side = (on: boolean) => (on ? `${cut * 100}%` : '0%');
  return `inset(${side(v.y < 0)} ${side(v.x > 0)} ${side(v.y > 0)} ${side(v.x < 0)})`;
}

/** A quarter turn about the axis across the direction of travel. */
function turn(v: Vec, quarters: number): string {
  const angle = quarters * 90;
  return v.x !== 0
    ? `perspective(3000px) rotateY(${v.x * angle}deg)`
    : `perspective(3000px) rotateX(${-v.y * angle}deg)`;
}

const fade = (): Motion => ({ to: [{ opacity: 0 }, { opacity: 1 }] });

type Played = Exclude<(typeof transitionNames)[number], 'none'>;

const transitions: Record<Played, (v: Vec) => Motion> = {
  fade,
  push: (v) => ({
    from: [{ translate: '0% 0%' }, { translate: at(v, 1) }],
    to: [{ translate: at(v, -1) }, { translate: '0% 0%' }],
  }),
  cover: (v) => ({ to: [{ translate: at(v, -1) }, { translate: '0% 0%' }] }),
  reveal: (v) => ({ from: [{ translate: '0% 0%' }, { translate: at(v, 1) }], fromOnTop: true }),
  wipe: (v) => ({ to: [{ clipPath: wipe(v, 1) }, { clipPath: wipe(v, 0) }] }),
  zoom: () => ({
    from: [{ scale: '1' }, { scale: '1.12' }],
    to: [
      { scale: '0.88', opacity: 0 },
      { scale: '1', opacity: 1 },
    ],
  }),
  // The slide that leaves turns edge-on by the middle, where nothing of it shows, and the
  // incoming one turns in from there.
  flip: (v) => ({
    from: [
      { transform: turn(v, 0) },
      { transform: turn(v, 1), offset: 0.5 },
      { transform: turn(v, 1) },
    ],
    to: [
      { transform: turn(v, -1) },
      { transform: turn(v, -1), offset: 0.5 },
      { transform: turn(v, 0) },
    ],
  }),
  crossfade: () => ({
    from: [{ opacity: 1 }, { opacity: 0 }],
    to: [{ opacity: 0 }, { opacity: 1 }],
  }),
  blur: () => ({
    to: [
      { opacity: 0, filter: 'blur(28px)', scale: '1.04' },
      { opacity: 1, filter: 'blur(0px)', scale: '1' },
    ],
  }),
  flash: () => ({
    from: [{ opacity: 1 }, { opacity: 0 }],
    to: [
      { opacity: 0, filter: 'brightness(2)' },
      { opacity: 0.8, filter: 'brightness(1.6)', offset: 0.5 },
      { opacity: 1, filter: 'brightness(1)' },
    ],
  }),
  slide: (v) => ({
    to: [
      { translate: at(v, -0.6), opacity: 0.4 },
      { translate: '0% 0%', opacity: 1 },
    ],
  }),
  split: () => ({
    to: [
      { clipPath: 'polygon(50% 0%, 50% 0%, 50% 100%, 50% 100%)' },
      { clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' },
    ],
  }),
  iris: () => ({
    to: [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }],
  }),
  dissolve: () => ({
    from: [
      { opacity: 1, filter: 'blur(0px)' },
      { opacity: 0.8, filter: 'blur(2px)', offset: 0.3 },
      { opacity: 0, filter: 'blur(14px)', offset: 0.8 },
      { opacity: 0, filter: 'blur(14px)' },
    ],
    to: [
      { opacity: 0, filter: 'blur(14px)' },
      { opacity: 0.25, filter: 'blur(8px)', offset: 0.3 },
      { opacity: 1, filter: 'blur(0px)', offset: 0.8 },
      { opacity: 1, filter: 'blur(0px)' },
    ],
  }),
  rotate: () => ({
    from: [
      { transform: 'rotate(0deg) scale(1)', opacity: 1 },
      { transform: 'rotate(12deg) scale(1.08)', opacity: 0 },
    ],
    to: [
      { transform: 'rotate(-12deg) scale(0.85)', opacity: 0 },
      { transform: 'rotate(0deg) scale(1)', opacity: 1 },
    ],
  }),
  cube: (v) => ({
    from: [{ transform: turn(v, 0) }, { transform: turn(v, 1) }],
    to: [{ transform: turn(v, -1) }, { transform: turn(v, 0) }],
  }),
  swap: (v) => ({
    from: [
      { translate: '0% 0%', scale: '1', opacity: 1 },
      { translate: at(v, 0.35), scale: '0.8', opacity: 0 },
    ],
    to: [
      { translate: at(v, -0.35), scale: '1.2', opacity: 0 },
      { translate: '0% 0%', scale: '1', opacity: 1 },
    ],
  }),
};

export { transitionTypes } from './names';

/** Whether `direction` changes a transition; a picker offers a direction only then. */
export function transitionTurns(type: string): boolean {
  const make = (transitions as Record<string, ((v: Vec) => Motion) | undefined>)[type];
  if (!make) return false;
  return JSON.stringify(make({ x: 0, y: -1 })) !== JSON.stringify(make({ x: 1, y: 0 }));
}

export interface TransitionRun {
  /** Resolves when the incoming slide is in place, by itself or through `finish`. */
  finished: Promise<void>;
  /** Jumps to the end. */
  finish: () => void;
}

const DONE: TransitionRun = { finished: Promise.resolve(), finish: () => undefined };

/**
 * Plays the transition into `to`. Both slides must be displayed, stacked on each other; hiding
 * the one that left is the caller's part.
 */
export function runTransition(
  from: HTMLElement,
  to: HTMLElement,
  transition: Transition | undefined,
  dir: Dir,
  warn?: Warn,
): TransitionRun {
  if (!transition || transition.type === 'none' || transition.duration <= 0) return DONE;
  // The type is free text in the model: looked up by any string.
  const make = (transitions as Record<string, ((v: Vec) => Motion) | undefined>)[transition.type];
  // `morph` is not here yet (WG8-T08); it and any unknown name cross-fade.
  if (!make) warn?.(`Transition "${transition.type}" is not supported; fading instead`);
  const motion = (make ?? fade)(travel(transition.direction ?? 'start', dir));
  const timing: KeyframeAnimationOptions = {
    duration: transition.duration,
    easing: safeEasing(transition.easing),
    fill: 'both',
  };
  const animations: Animation[] = [];
  if (motion.from) animations.push(from.animate(motion.from, timing));
  if (motion.to) animations.push(to.animate(motion.to, timing));
  from.style.zIndex = motion.fromOnTop ? '2' : '1';
  to.style.zIndex = motion.fromOnTop ? '1' : '2';

  let done = false;
  let resolve = (): void => undefined;
  const finished = new Promise<void>((r) => (resolve = r));
  const end = () => {
    if (done) return;
    done = true;
    for (const animation of animations) animation.cancel();
    from.style.zIndex = '';
    to.style.zIndex = '';
    resolve();
  };
  for (const animation of animations) animation.finished.catch(() => undefined);
  void Promise.allSettled(animations.map((a) => a.finished)).then(end);
  return { finished, finish: end };
}
