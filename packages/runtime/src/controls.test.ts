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
  /** Whether the show is held, as the controls last said. */
  const holds: boolean[] = [];
  const player: Player = {
    slides,
    state,
    steps: () => 0,
    next: () => calls.push('next'),
    prev: () => calls.push('prev'),
    goTo: (slide) => calls.push(`goTo ${slide}`),
    setState: () => undefined,
    subscribe: () => () => undefined,
    hold: (on) => {
      // As the player does: saying the same again changes nothing.
      if (on !== (holds[holds.length - 1] ?? false)) holds.push(on);
    },
    get held() {
      return holds[holds.length - 1] ?? false;
    },
    fit: () => undefined,
    destroy: () => undefined,
  };
  return { player, calls, holds, state };
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
    const { holds } = bind();
    press('b', 'KeyB');
    unbind();
    expect(blank()).toBeUndefined();
    // And the show with it is let go.
    expect(holds).toEqual([true, false]);
  });

  it('holds the show while it is up, and lets it go when the show is seen again', () => {
    const { holds } = bind();
    press('b', 'KeyB');
    expect(holds).toEqual([true]);
    // From black to white the show is still covered.
    press('w', 'KeyW');
    expect(holds).toEqual([true]);
    press('ArrowRight');
    expect(holds).toEqual([true, false]);
    press(',', 'Comma');
    viewport.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    expect(holds).toEqual([true, false, true, false]);
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

describe('a click', () => {
  const click = (target: Element) =>
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

  it('is a step, except on what takes the click for itself', () => {
    const { calls } = bind();
    viewport.innerHTML = `
      <div id="text"></div>
      <video id="clip" data-slidr-clip="video"></video>
      <video id="foreign"></video>
      <div><div id="mark" data-slidr-clip-toggle></div><audio data-slidr-clip="audio"></audio></div>
      <audio id="bar" controls data-slidr-clip="audio"></audio>`;
    const at = (id: string) => viewport.querySelector(`#${id}`) as Element;
    click(at('text'));
    expect(calls).toEqual(['next']);
    // A video of the deck and the mark of a sound play on a click (the player does that), and
    // the controls of a sound are the browser's: none of them moves the show.
    click(at('clip'));
    click(at('mark'));
    click(at('bar'));
    expect(calls).toEqual(['next']);
    // A video that is not a clip of the deck has no click of its own.
    click(at('foreign'));
    expect(calls).toEqual(['next', 'next']);
  });

  it('on a slide that clicks do not move stays there, but at the end of the show it is a step', () => {
    const { player, calls, state } = bind(2);
    const last = player.slides[1] as PlayerSlide;
    last.transition = {
      type: 'none',
      duration: 0,
      easing: 'ease',
      advance: { onClick: false, afterMs: 4000 },
    };
    state.slide = 1;
    click(viewport);
    expect(calls).toEqual([]);
    // The end of the show is no slide's: the click that leaves it is not held back.
    state.ended = true;
    click(viewport);
    expect(calls).toEqual(['next']);
  });
});

describe('a link', () => {
  const click = (target: Element) =>
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
  const links = () => {
    viewport.innerHTML = `
      <a id="slide" data-link-kind="slide" data-link-target="s3" tabindex="0" role="link">3</a>
      <div id="web" data-link-kind="url" data-link-target="https://example.com/" tabindex="0"></div>
      <div id="script" data-link-kind="url" data-link-target=" javascript:alert(1)"></div>
      <div id="file" data-link-kind="url" data-link-target="file:///C:/secret.txt"></div>
      <div id="data" data-link-kind="url" data-link-target="data:text/html,<b>x</b>"></div>`;
    return (id: string) => viewport.querySelector(`#${id}`) as HTMLElement;
  };

  it('to a slide is followed by Enter when it has the keyboard, and not taken for the next step', () => {
    const { calls } = bind();
    const at = links();
    at('slide').focus();
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    at('slide').dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(calls).toEqual(['goTo 2']);
    // With the keyboard elsewhere, Enter is the next step as it was.
    at('slide').blur();
    press('Enter');
    expect(calls).toEqual(['goTo 2', 'next']);
  });

  it('to an address opens only the addresses the app writes', () => {
    bind();
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const at = links();
    click(at('web'));
    at('web').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    for (const id of ['script', 'file', 'data']) click(at(id));
    expect(open.mock.calls).toEqual([
      ['https://example.com/', '_blank', 'noopener'],
      ['https://example.com/', '_blank', 'noopener'],
    ]);
    open.mockRestore();
  });
});
