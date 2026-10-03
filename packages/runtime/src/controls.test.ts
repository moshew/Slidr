// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bindControls } from './controls';
import type { Player, PlayerSlide, PlayerState } from './player';

/** A player that only records what it was asked to do. */
function fakePlayer(count: number, hidden: number[] = []) {
  const calls: string[] = [];
  const state: PlayerState = { slide: 0, step: 0 };
  const slides: PlayerSlide[] = Array.from({ length: count }, (_, i) => ({
    el: document.createElement('section'),
    id: `s${i + 1}`,
    hidden: hidden.includes(i),
  }));
  const player: Player = {
    slides,
    state,
    steps: () => 0,
    next: () => calls.push('next'),
    prev: () => calls.push('prev'),
    goTo: (slide) => calls.push(`goTo ${slide}`),
    setState: () => undefined,
    subscribe: () => () => undefined,
    fit: () => undefined,
    destroy: () => undefined,
  };
  return { player, calls };
}

let viewport: HTMLElement;
let unbind: () => void;

const press = (key: string, code = '', init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', {
    key,
    code,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  viewport.dispatchEvent(event);
  return event;
};
const blank = () => viewport.querySelector<HTMLElement>('[data-slidr-blank]')?.dataset.slidrBlank;
const typed = () => viewport.querySelector('[data-slidr-goto]')?.textContent;

function bind(count = 12, hidden: number[] = [], options = {}) {
  const fake = fakePlayer(count, hidden);
  unbind = bindControls(fake.player, { viewport, hash: false, ...options });
  return fake;
}

beforeEach(() => {
  vi.useFakeTimers();
  viewport = document.createElement('div');
  document.body.append(viewport);
});

afterEach(() => {
  unbind();
  viewport.remove();
  vi.useRealTimers();
});

describe('keys', () => {
  it('moves on and back, to the first slide shown and to the last', () => {
    const { calls } = bind(5, [0, 4]);
    press('ArrowRight');
    press(' ');
    press('ArrowLeft');
    press('Home');
    press('End');
    expect(calls).toEqual(['next', 'next', 'prev', 'goTo 1', 'goTo 3']);
  });

  it('takes letters from the physical key, so they work on a Hebrew layout', () => {
    const { calls } = bind();
    // The N and P keys with a Hebrew layout active.
    expect(press(String.fromCodePoint(0x5de), 'KeyN').defaultPrevented).toBe(true);
    press(String.fromCodePoint(0x5e4), 'KeyP');
    press('N', 'KeyN');
    expect(calls).toEqual(['next', 'prev', 'next']);
  });

  it('leaves alone what it does not know, and anything with Ctrl or Alt', () => {
    const { calls } = bind();
    expect(press('x', 'KeyX').defaultPrevented).toBe(false);
    expect(press('ArrowRight', 'ArrowRight', { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press('Shift', 'ShiftLeft').defaultPrevented).toBe(false);
    expect(calls).toEqual([]);
  });

  it('hands F to the host when the host has its own full screen', () => {
    const fullscreen = vi.fn();
    bind(3, [], { fullscreen });
    press('f', 'KeyF');
    expect(fullscreen).toHaveBeenCalledTimes(1);
  });
});

describe('a black or a white screen', () => {
  it('B covers the show in black, and the same key uncovers it', () => {
    const { calls } = bind();
    press('b', 'KeyB');
    expect(blank()).toBe('black');
    press('b', 'KeyB');
    expect(blank()).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('W is white, a full stop black and a comma white; the other colour switches', () => {
    bind();
    press('w', 'KeyW');
    expect(blank()).toBe('white');
    press('.', 'Period');
    expect(blank()).toBe('black');
    press(',', 'Comma');
    expect(blank()).toBe('white');
    // On a Hebrew layout the W key types an apostrophe.
    press("'", 'KeyW');
    expect(blank()).toBeUndefined();
  });

  it('any other key or a click brings the show back without moving it', () => {
    const { calls } = bind();
    press('b', 'KeyB');
    press('ArrowRight');
    expect(blank()).toBeUndefined();
    press('w', 'KeyW');
    viewport.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(blank()).toBeUndefined();
    expect(calls).toEqual([]);
    // The next key is a step again.
    press('ArrowRight');
    expect(calls).toEqual(['next']);
  });

  it('is gone once the controls are unbound', () => {
    bind();
    press('b', 'KeyB');
    unbind();
    expect(blank()).toBeUndefined();
  });
});

describe('a slide number and Enter', () => {
  it('jumps to that slide, hidden or not', () => {
    const { calls } = bind(12, [6]);
    press('1', 'Digit1');
    expect(typed()).toBe('1 / 12');
    press('2', 'Numpad2');
    expect(typed()).toBe('12 / 12');
    press('Enter');
    expect(calls).toEqual(['goTo 11']);
    expect(typed()).toBeUndefined();
    press('7', 'Digit7');
    press('Enter');
    expect(calls).toEqual(['goTo 11', 'goTo 6']);
  });

  it('ignores a number that is not a slide, and Enter alone is a step', () => {
    const { calls } = bind(3);
    press('9', 'Digit9');
    press('Enter');
    press('0', 'Digit0');
    press('Enter');
    expect(calls).toEqual([]);
    press('Enter');
    expect(calls).toEqual(['next']);
  });

  it('forgets the digits after a while, on Escape, and when another key comes', () => {
    const { calls } = bind();
    press('4', 'Digit4');
    vi.advanceTimersByTime(3000);
    expect(typed()).toBeUndefined();
    press('Enter');
    expect(calls).toEqual(['next']);

    press('4', 'Digit4');
    expect(press('Escape').defaultPrevented).toBe(true);
    expect(typed()).toBeUndefined();
    // With nothing typed, Escape is the host's.
    expect(press('Escape').defaultPrevented).toBe(false);

    press('4', 'Digit4');
    press('ArrowLeft');
    press('Enter');
    expect(calls).toEqual(['next', 'prev', 'next']);
  });
});
