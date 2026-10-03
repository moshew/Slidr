// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayer, type Player, type PlayerSlide, type PlayerState } from './player';
import { readSlides } from './standalone';
import { installFakeAnimations, type FakeAnimations } from './testing/fakeAnimations';
import type { AnimationStep, Transition } from './types';

const entrance = (elementId: string, trigger: AnimationStep['trigger']): AnimationStep => ({
  id: `a_${elementId}`,
  elementId,
  trigger,
  category: 'entrance',
  preset: 'fade',
  duration: 300,
  delay: 0,
  easing: 'ease',
});

const push: Transition = {
  type: 'push',
  direction: 'start',
  duration: 400,
  easing: 'ease',
  advance: { onClick: true },
};

const attr = (value: unknown) => JSON.stringify(value).replace(/"/g, '&quot;');

/** Three slides and a hidden one, as an exported file has them. */
const DOCUMENT = `
  <div class="slidr-viewport"><div class="slidr-stage">
    <section class="slide" data-slide="a"
      data-timeline="${attr([entrance('a1', 'afterPrevious'), entrance('a2', 'onClick'), entrance('a3', 'onClick')])}">
      <div data-slide-id="a" dir="ltr">
        <div data-element-id="a1"></div><div data-element-id="a2"></div><div data-element-id="a3"></div>
      </div>
    </section>
    <section class="slide" data-slide="b" data-transition="${attr(push)}"
      data-timeline="${attr([entrance('b1', 'onClick')])}">
      <div data-slide-id="b" dir="ltr"><div data-element-id="b1"></div></div>
    </section>
    <section class="slide" data-slide="hidden" data-hidden><div data-slide-id="hidden"></div></section>
    <section class="slide" data-slide="c"><div data-slide-id="c" dir="ltr"></div></section>
  </div></div>`;

let fake: FakeAnimations;
let player: Player;
let slides: PlayerSlide[];
let states: PlayerState[];

const shown = () => slides.filter((s) => s.el.style.display !== 'none').map((s) => s.id);
const el = (id: string) => document.querySelector(`[data-element-id="${id}"]`) as HTMLElement;

function start(state?: PlayerState): void {
  const viewport = document.querySelector('.slidr-viewport') as HTMLElement;
  const stage = document.querySelector('.slidr-stage') as HTMLElement;
  slides = readSlides(stage);
  player = createPlayer({ viewport, stage, slides, state });
  states = [];
  player.subscribe((s) => states.push(s));
}

beforeEach(() => {
  fake = installFakeAnimations();
  document.body.innerHTML = DOCUMENT;
});

afterEach(() => {
  player.destroy();
  fake.uninstall();
  vi.useRealTimers();
});

describe('readSlides', () => {
  it('reads the transition, the timeline and the hidden flag back from the markup', () => {
    start();
    expect(slides.map((s) => s.id)).toEqual(['a', 'b', 'hidden', 'c']);
    expect(slides[1]?.transition).toEqual(push);
    expect(slides[0]?.timeline).toHaveLength(3);
    expect(slides.map((s) => s.hidden)).toEqual([false, false, true, false]);
  });
});

describe('createPlayer', () => {
  it('opens the first slide and plays its lead-in', async () => {
    start();
    expect(player.state).toEqual({ slide: 0, step: 0 });
    expect(shown()).toEqual(['a']);
    expect(player.steps()).toBe(2);
    expect(fake.hidden(el('a2'))).toBe(true);
    await fake.finishRunning();
    expect(fake.hidden(el('a1'))).toBe(false);
  });

  it('steps through the clicks of a slide, then moves on with the transition', async () => {
    start();
    await fake.finishRunning();
    player.next();
    expect(player.state).toEqual({ slide: 0, step: 1 });
    await fake.finishRunning();
    expect(fake.hidden(el('a2'))).toBe(false);
    expect(fake.hidden(el('a3'))).toBe(true);
    player.next();
    await fake.finishRunning();
    player.next();
    expect(player.state).toEqual({ slide: 1, step: 0 });
    // Both slides are on stage while one pushes the other out.
    expect(shown()).toEqual(['a', 'b']);
    await fake.finishRunning();
    expect(shown()).toEqual(['b']);
    expect(states).toEqual([
      { slide: 0, step: 1 },
      { slide: 0, step: 2 },
      { slide: 1, step: 0 },
    ]);
  });

  it('takes the direction of a transition from the slide, not from the page around it', () => {
    // A left-to-right deck shown inside a right-to-left page.
    document.body.dir = 'rtl';
    start({ slide: 0, step: 2 });
    player.next();
    const incoming = fake.live().find((a) => a.target === slides[1]?.el);
    // A push towards the start: in LTR the slide comes in from the right.
    expect((incoming?.keyframes as Keyframe[])[0]?.translate).toBe('100% 0%');
    document.body.dir = '';
  });

  it('counts every press as one step, even while something is playing', () => {
    start();
    player.next();
    player.next();
    player.next();
    player.next();
    expect(player.state).toEqual({ slide: 1, step: 1 });
    expect(shown()).toEqual(['b']);
    expect(fake.hidden(el('a3'))).toBe(false);
  });

  it('goes back without animation, to the end of the slide before', () => {
    start({ slide: 1, step: 1 });
    player.prev();
    expect(player.state).toEqual({ slide: 1, step: 0 });
    expect(fake.hidden(el('b1'))).toBe(true);
    player.prev();
    expect(player.state).toEqual({ slide: 0, step: 2 });
    expect(shown()).toEqual(['a']);
    expect(fake.hidden(el('a3'))).toBe(false);
    expect(fake.live().filter((a) => a.state === 'running')).toEqual([]);
  });

  it('skips hidden slides both ways, and stops at the ends', () => {
    start({ slide: 1, step: 1 });
    player.next();
    expect(player.state).toEqual({ slide: 3, step: 0 });
    player.next();
    expect(player.state).toEqual({ slide: 3, step: 0 });
    player.prev();
    expect(player.state).toEqual({ slide: 1, step: 1 });
    player.setState({ slide: 0, step: 0 });
    player.prev();
    expect(player.state).toEqual({ slide: 0, step: 0 });
  });

  it('takes a state from outside as it is, and clamps the step', () => {
    start();
    player.setState({ slide: 0, step: 1 });
    expect(fake.hidden(el('a1'))).toBe(false);
    expect(fake.hidden(el('a2'))).toBe(false);
    expect(fake.hidden(el('a3'))).toBe(true);
    player.setState({ slide: 1, step: 99 });
    expect(player.state).toEqual({ slide: 1, step: 1 });
    // A hidden slide can still be shown on request.
    player.goTo(2);
    expect(shown()).toEqual(['hidden']);
  });

  it('opens a slide afresh with goTo: step 0, lead-in playing', () => {
    start({ slide: 1, step: 1 });
    player.goTo(0);
    expect(player.state).toEqual({ slide: 0, step: 0 });
    expect(fake.live().some((a) => a.target === el('a1') && a.state === 'running')).toBe(true);
  });

  it('moves on by itself after advance.afterMs of rest', async () => {
    vi.useFakeTimers();
    const auto: Transition = { ...push, type: 'none', advance: { onClick: false, afterMs: 500 } };
    document
      .querySelector('[data-slide="b"]')
      ?.setAttribute('data-transition', JSON.stringify(auto));
    start({ slide: 1, step: 0 });
    vi.advanceTimersByTime(499);
    expect(player.state).toEqual({ slide: 1, step: 0 });
    vi.advanceTimersByTime(1);
    expect(player.state).toEqual({ slide: 1, step: 1 });
    // The step is still playing: the clock starts again when it ends.
    vi.advanceTimersByTime(1000);
    expect(player.state).toEqual({ slide: 1, step: 1 });
    await vi.runAllTimersAsync();
    for (const animation of fake.all) animation.finish();
    await vi.runAllTimersAsync();
    vi.advanceTimersByTime(500);
    expect(player.state).toEqual({ slide: 3, step: 0 });
  });

  it('scales the stage into the viewport', () => {
    const viewport = document.querySelector('.slidr-viewport') as HTMLElement;
    Object.defineProperties(viewport, {
      clientWidth: { value: 960, configurable: true },
      clientHeight: { value: 700, configurable: true },
    });
    start();
    // Half size, centred vertically: (700 - 540) / 2.
    expect(slides[0]?.el.parentElement?.style.transform).toBe('translate(0px, 80px) scale(0.5)');
  });

  it('gives the slides back on destroy', async () => {
    start();
    await fake.finishRunning();
    player.next();
    player.destroy();
    expect(fake.live().filter((a) => a.state === 'running' || fake.hidden(a.target))).toEqual([]);
    expect(slides.every((s) => s.el.style.display === '')).toBe(true);
  });
});
