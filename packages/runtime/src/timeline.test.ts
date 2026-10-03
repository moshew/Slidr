// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeAnimations, type FakeAnimations } from './testing/fakeAnimations';
import { createTimeline } from './timeline';
import type { AnimationStep } from './types';

const SLIDE = `
  <div data-slide-id="s1" dir="rtl">
    <div data-element-id="title"><p>Title here</p></div>
    <div data-element-id="box"></div>
    <div data-element-id="list">
      <ul><li>one</li><li>two</li><li> </li><li>three</li></ul>
    </div>
  </div>`;

const size = { w: 1920, h: 1080 };
let fake: FakeAnimations;
let slide: HTMLElement;
let warnings: string[];

const node = (id: string) => slide.querySelector(`[data-element-id="${id}"]`) as HTMLElement;

function step(elementId: string, init: Partial<AnimationStep> = {}): AnimationStep {
  return {
    id: `a_${elementId}_${init.category ?? 'entrance'}`,
    elementId,
    trigger: 'onClick',
    category: 'entrance',
    preset: 'fade',
    duration: 300,
    delay: 0,
    easing: 'ease-out',
    ...init,
  };
}

const timeline = (steps: AnimationStep[]) =>
  createTimeline(slide, steps, { size, onWarn: (message) => warnings.push(message) });

/** The effect animations of the current run: everything that is not a hold. */
const effects = () =>
  fake.live().filter((a) => Array.isArray(a.keyframes) && a.state === 'running');

beforeEach(() => {
  fake = installFakeAnimations();
  warnings = [];
  document.body.innerHTML = SLIDE;
  slide = document.body.firstElementChild as HTMLElement;
});

afterEach(() => fake.uninstall());

describe('createTimeline', () => {
  it('counts the groups that wait for a click', () => {
    const t = timeline([
      step('title', { trigger: 'afterPrevious' }),
      step('box'),
      step('box', { category: 'emphasis', preset: 'pulse', trigger: 'withPrevious' }),
      step('box', { category: 'exit' }),
    ]);
    expect(t.clicks).toBe(2);
    expect(t.duration(0)).toBe(300);
  });

  it('hides what has not come in yet, and nothing else', () => {
    const t = timeline([step('title', { trigger: 'afterPrevious' }), step('box')]);
    t.apply(0);
    expect(fake.hidden(node('title'))).toBe(true);
    expect(fake.hidden(node('box'))).toBe(true);
    t.apply(1);
    expect(fake.hidden(node('title'))).toBe(false);
    expect(fake.hidden(node('box'))).toBe(true);
    t.apply(2);
    expect(fake.hidden(node('box'))).toBe(false);
  });

  it('keeps an element that only leaves in sight until it has left', () => {
    const t = timeline([step('box', { category: 'exit' })]);
    t.apply(1);
    expect(fake.hidden(node('box'))).toBe(false);
    t.apply(2);
    expect(fake.hidden(node('box'))).toBe(true);
  });

  it('plays a group and settles into the state after it', async () => {
    const t = timeline([step('box'), step('title', { trigger: 'afterPrevious', delay: 50 })]);
    let done = false;
    void t.play(1).then(() => (done = true));
    expect(t.playing).toBe(true);
    const running = effects();
    expect(running.map((a) => [a.target, a.options.delay, a.options.duration])).toEqual([
      [node('box'), 0, 300],
      [node('title'), 350, 300],
    ]);
    // The title stays hidden until its own start.
    const wait = fake.live().find((a) => a.target === node('title') && !Array.isArray(a.keyframes));
    expect(wait?.options).toMatchObject({ delay: 0, duration: 350 });
    await fake.finishRunning();
    expect(done).toBe(true);
    expect(t.playing).toBe(false);
    expect(effects()).toHaveLength(0);
    expect(fake.hidden(node('box'))).toBe(false);
    expect(fake.hidden(node('title'))).toBe(false);
  });

  it('can be cut short: finish jumps to the state after the group', async () => {
    const t = timeline([step('box', { category: 'exit' })]);
    let done = false;
    void t.play(1).then(() => (done = true));
    t.finish();
    await Promise.resolve();
    expect(done).toBe(true);
    expect(fake.hidden(node('box'))).toBe(true);
    expect(effects()).toHaveLength(0);
  });

  it('turns start and end around in an RTL slide', () => {
    const t = timeline([step('box', { preset: 'flyIn', direction: 'start' })]);
    void t.play(1);
    const [fly] = effects();
    const first = (fly?.keyframes as Keyframe[])[0];
    // Towards the start is rightwards in RTL, so the box comes in from the left.
    expect(String(first?.translate)).toMatch(/^-\d/);
  });

  it('brings paragraphs in one click at a time', () => {
    const t = timeline([step('list', { textBy: 'paragraph' })]);
    // The empty item is not a step.
    expect(t.clicks).toBe(3);
    const items = Array.from(node('list').querySelectorAll('li'));
    t.apply(2);
    expect(items.map((li) => fake.hidden(li))).toEqual([false, true, false, true]);
    expect(fake.hidden(node('list'))).toBe(false);
  });

  it('staggers words, and puts the text back when the group ends', async () => {
    const t = timeline([step('title', { textBy: 'word', duration: 500 })]);
    expect(t.duration(1)).toBe(600);
    const before = node('title').innerHTML;
    void t.play(1);
    const running = effects();
    expect(running.map((a) => [a.target.textContent, a.options.delay, a.options.fill])).toEqual([
      ['Title', 0, 'backwards'],
      ['here', 100, 'backwards'],
    ]);
    expect(node('title').querySelectorAll('[data-slidr-part]')).toHaveLength(2);
    await fake.finishRunning();
    expect(node('title').innerHTML).toBe(before);
  });

  it('warns about what it cannot play and carries on', () => {
    const t = timeline([
      step('nowhere'),
      step('box', { category: 'motion', preset: 'path' }),
      step('box', { preset: 'teleport' }),
    ]);
    expect(warnings).toHaveLength(3);
    // The unknown preset still brings its element in.
    expect(t.clicks).toBe(1);
    t.apply(0);
    expect(fake.hidden(node('box'))).toBe(true);
  });

  it('leaves nothing behind after clear', () => {
    const t = timeline([step('box'), step('title', { textBy: 'char' })]);
    const before = slide.innerHTML;
    void t.play(2);
    t.clear();
    expect(fake.live().filter((a) => a.state === 'running' || fake.hidden(a.target))).toEqual([]);
    expect(slide.innerHTML).toBe(before);
  });
});
