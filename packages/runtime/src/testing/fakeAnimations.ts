/**
 * A stand-in for the Web Animations API in unit tests: happy-dom has no `Element.animate`.
 * It records what the runtime asked for and lets a test end the animations by hand. What the
 * animations look like is the business of the end-to-end tests, in a real browser.
 */
export interface FakeAnimation {
  target: Element;
  keyframes: Keyframe[] | PropertyIndexedKeyframes;
  options: KeyframeAnimationOptions;
  state: 'running' | 'finished' | 'cancelled';
  finished: Promise<void>;
  finish: () => void;
  cancel: () => void;
}

export interface FakeAnimations {
  all: FakeAnimation[];
  /** Animations that are still in effect: not cancelled. */
  live: () => FakeAnimation[];
  /** Whether a node is kept hidden, from now on, by a live animation. */
  hidden: (node: Element) => boolean;
  /** Ends everything that is running, as time would. */
  finishRunning: () => Promise<void>;
  uninstall: () => void;
}

function isHold(animation: FakeAnimation): boolean {
  const { keyframes, options } = animation;
  const visibility = Array.isArray(keyframes) ? undefined : keyframes.visibility;
  return Array.isArray(visibility) && visibility[0] === 'hidden' && options.fill === 'forwards';
}

export function installFakeAnimations(): FakeAnimations {
  const all: FakeAnimation[] = [];
  const original = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Element.prototype.animate = function animate(
    this: Element,
    keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ): Animation {
    let settle = (): void => undefined;
    let fail = (_reason: unknown): void => undefined;
    const finished = new Promise<void>((resolve, reject) => {
      settle = resolve;
      fail = reject;
    });
    const timing = typeof options === 'number' ? { duration: options } : (options ?? {});
    const animation: FakeAnimation = {
      target: this,
      keyframes: keyframes ?? [],
      options: timing,
      state: 'running',
      finished,
      finish: () => {
        if (animation.state !== 'running') return;
        animation.state = 'finished';
        settle();
      },
      cancel: () => {
        if (animation.state === 'running') fail(new DOMException('cancelled', 'AbortError'));
        animation.state = 'cancelled';
      },
    };
    // Nothing to wait for: an animation of no length that starts at once is over already.
    if (!timing.delay && !timing.duration) animation.finish();
    all.push(animation);
    return animation as unknown as Animation;
  };
  const live = () => all.filter((a) => a.state !== 'cancelled');
  return {
    all,
    live,
    hidden: (node) => live().some((a) => a.target === node && isHold(a) && !a.options.delay),
    finishRunning: async () => {
      for (const animation of all) animation.finish();
      // Let the promises that waited for the animations run.
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
    uninstall: () => {
      if (original) Object.defineProperty(Element.prototype, 'animate', original);
      else delete (Element.prototype as Partial<Element>).animate;
    },
  };
}
