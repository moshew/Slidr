import { afterEach, expect, test } from 'vitest';
import { createTimeline } from './timeline';
import type { AnimationStep } from './types';

// A timeline with real Web Animations: what an element looks like while it waits for its
// entrance, and while it comes in. happy-dom computes no animated style, so the unit tests cannot
// see either.

afterEach(() => {
  document.body.innerHTML = '';
});

const size = { w: 1920, h: 1080 };

function step(init: Partial<AnimationStep>): AnimationStep {
  return {
    id: 'a_card',
    elementId: 'card',
    trigger: 'withPrevious',
    category: 'entrance',
    preset: 'fade',
    duration: 800,
    delay: 400,
    easing: 'linear',
    ...init,
  };
}

/**
 * A card at half opacity with a part that says `visibility: visible` of itself, as the copied
 * markup of an `html` element does; and the slide's own keyframes, in a layer as the renderer
 * writes a slide's `css`.
 */
function slide(): { root: HTMLElement; card: HTMLElement; part: HTMLElement } {
  document.body.innerHTML = `
    <div data-slide-id="s" dir="ltr" style="position:relative;width:1920px;height:1080px">
      <style>@layer { @keyframes kin { from { opacity: 0; transform: translateY(80px); } to { opacity: 1; transform: none; } } }</style>
      <div data-element-id="card" style="position:absolute;left:200px;top:200px;width:400px;height:300px;opacity:0.5;background:#246">
        <p id="part" style="visibility:visible;margin:0">Kept as html</p>
      </div>
    </div>`;
  return {
    root: document.querySelector('[data-slide-id]')!,
    card: document.querySelector('[data-element-id="card"]')!,
    part: document.querySelector('#part')!,
  };
}

const opacity = (el: Element) => Number(getComputedStyle(el).opacity);

test.each(['fade', 'css:kin'])(
  'an element waiting for its entrance shows nothing of itself, and comes in to its own opacity (%s)',
  async (preset) => {
    const { root, card, part } = slide();
    const timeline = createTimeline(root, [step({ preset })], {
      size,
      onWarn: (m) => expect.fail(m),
    });
    timeline.apply(0);
    // Hidden, and transparent too: the part that says it is visible does not show through.
    expect(getComputedStyle(card).visibility).toBe('hidden');
    expect(opacity(card)).toBe(0);
    const playing = timeline.play(0);
    const at = (ms: number) => {
      for (const animation of card.getAnimations()) {
        animation.pause();
        animation.currentTime = ms;
      }
    };
    at(200);
    expect(opacity(card)).toBe(0);
    expect(getComputedStyle(part).visibility).toBe('visible');
    // Half way through its 800 ms, from 0 to its own 0.5.
    at(800);
    expect(opacity(card)).toBeCloseTo(0.25, 2);
    at(1200);
    timeline.finish();
    await playing;
    expect(opacity(card)).toBe(0.5);
    expect(getComputedStyle(card).visibility).toBe('visible');
  },
);
