// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { installFakeAnimations, type FakeAnimations } from './testing/fakeAnimations';
import { runTransition } from './transitions';
import type { Transition } from './types';

const push: Transition = {
  type: 'push',
  duration: 400,
  easing: 'ease',
  advance: { onClick: true },
};

let fake: FakeAnimations;

beforeEach(() => {
  fake = installFakeAnimations();
});

afterEach(() => {
  fake.uninstall();
});

it('moves left by default in both reading directions, while honoring an explicit RTL direction', () => {
  const from = document.createElement('div');
  const to = document.createElement('div');
  const outgoing = (transition: Transition, dir: 'ltr' | 'rtl') => {
    const run = runTransition(from, to, transition, dir);
    const frames = fake.live().find((animation) => animation.target === from)?.keyframes;
    run.finish();
    return (frames as Keyframe[])[1]?.translate;
  };

  expect(outgoing(push, 'ltr')).toBe('-100% 0%');
  expect(outgoing(push, 'rtl')).toBe('-100% 0%');
  expect(outgoing({ ...push, direction: 'start' }, 'rtl')).toBe('100% 0%');
});
