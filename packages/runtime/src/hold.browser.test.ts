import { afterEach, expect, test } from 'vitest';
import { createPlayer, type Player } from './player';
import type { AnimationStep, Transition } from './types';

// A held show with real animations: what the unit tests cannot see is that a step and a
// transition in flight really stop where they are, and go on from there. happy-dom has no Web
// Animations, so there the hold is tested for the wait and for the clips only.

let player: Player | undefined;

afterEach(() => {
  player?.destroy();
  player = undefined;
  document.body.innerHTML = '';
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** A browser stops an animation at its next frame, not in the call that asks for it. */
const STOPS_IN = 60;

const entrance: AnimationStep = {
  id: 'a_box',
  elementId: 'box',
  trigger: 'onClick',
  category: 'entrance',
  preset: 'fade',
  duration: 600,
  delay: 0,
  easing: 'linear',
};

const push: Transition = {
  type: 'push',
  direction: 'start',
  duration: 600,
  easing: 'linear',
  advance: { onClick: true },
};

/** Two slides: a box that fades in on a click, and a slide that is pushed in after it. */
function show(): { box: HTMLElement; second: HTMLElement } {
  document.body.innerHTML = `
    <div id="viewport" style="position:relative;width:960px;height:540px">
      <div id="stage">
        <section><div data-slide-id="a" dir="ltr" style="width:1920px;height:1080px">
          <div data-element-id="box" style="position:absolute;left:200px;top:200px;width:400px;height:300px;background:#246"></div>
        </div></section>
        <section><div data-slide-id="b" dir="ltr" style="width:1920px;height:1080px;background:#fff"></div></section>
      </div>
    </div>`;
  const viewport = document.getElementById('viewport') as HTMLElement;
  const stage = document.getElementById('stage') as HTMLElement;
  const [first, second] = Array.from(stage.children) as HTMLElement[];
  player = createPlayer({
    viewport,
    stage,
    slides: [
      { el: first as HTMLElement, timeline: [entrance] },
      { el: second as HTMLElement, transition: push },
    ],
  });
  return { box: stage.querySelector('[data-element-id="box"]') as HTMLElement, second: second! };
}

const opacity = (el: HTMLElement) => Number(getComputedStyle(el).opacity);

test('a step in flight stops where it is while the show is held, and goes on from there', async () => {
  const { box } = show();
  player?.next();
  await sleep(200);
  player?.hold(true);
  await sleep(STOPS_IN);
  const stoppedAt = opacity(box);
  // Part of the way in: neither still hidden nor already whole.
  expect(stoppedAt).toBeGreaterThan(0.05);
  expect(stoppedAt).toBeLessThan(0.95);
  // Longer than the step is: held, it does not move.
  await sleep(900);
  expect(opacity(box)).toBe(stoppedAt);
  expect(player?.state).toEqual({ slide: 0, step: 1 });

  player?.hold(false);
  await sleep(100);
  // On from where it stood, not over again from the start and not at its end at once.
  expect(opacity(box)).toBeGreaterThan(stoppedAt);
  expect(opacity(box)).toBeLessThan(1);
  await sleep(700);
  expect(opacity(box)).toBe(1);
  expect(getComputedStyle(box).visibility).toBe('visible');
});

test('a transition in flight stops too, and a step taken meanwhile ends it', async () => {
  const { second } = show();
  player?.setState({ slide: 0, step: 1 });
  player?.next();
  await sleep(200);
  player?.hold(true);
  await sleep(STOPS_IN);
  const stoppedAt = second.getBoundingClientRect().left;
  await sleep(900);
  // The slide that was coming in hangs where it was: part of the way across.
  expect(second.getBoundingClientRect().left).toBe(stoppedAt);
  expect(stoppedAt).toBeGreaterThan(0);
  expect(player?.state).toEqual({ slide: 1, step: 0 });

  // A step back while held is still a step: the show stands on the first slide, whole.
  player?.prev();
  expect(player?.state).toEqual({ slide: 0, step: 1 });
  player?.hold(false);
  await sleep(100);
  // Letting go starts nothing that the step ended.
  expect(getComputedStyle(second).display).toBe('none');
  expect(document.getAnimations().filter((a) => a.playState === 'running')).toEqual([]);
});

test('what ended before the hold is not played again when the show is let go', async () => {
  const { box } = show();
  // The box waits for its click, hidden by an animation that has ended and still holds it.
  expect(getComputedStyle(box).visibility).toBe('hidden');
  player?.hold(true);
  player?.hold(false);
  await sleep(100);
  expect(getComputedStyle(box).visibility).toBe('hidden');
  player?.next();
  await sleep(800);
  player?.hold(true);
  player?.hold(false);
  await sleep(100);
  expect(getComputedStyle(box).visibility).toBe('visible');
  expect(opacity(box)).toBe(1);
});
