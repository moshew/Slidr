// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHART_BUILD_MS, CHART_EVENT, type ChartCue } from './charts';
import { installFakeAnimations, type FakeAnimations } from './testing/fakeAnimations';
import { createTimeline } from './timeline';
import type { AnimationStep } from './types';

// Three charts: one that enters on a click, one inside a group that enters on a later click,
// and one that nothing brings in.
const SLIDE = `
  <div data-slide-id="s1">
    <div data-element-id="title"><p>Title</p></div>
    <div data-element-id="stepped"><div data-slidr-chart="{}" id="c-stepped"></div></div>
    <div data-element-id="group">
      <div data-element-id="inner"><div data-slidr-chart="{}" id="c-grouped"></div></div>
    </div>
    <div data-element-id="plain"><div data-slidr-chart="{}" id="c-plain"></div></div>
  </div>`;

const size = { w: 1920, h: 1080 };
let fake: FakeAnimations;
let slide: HTMLElement;
let cues: Record<string, ChartCue[]>;

function step(elementId: string, init: Partial<AnimationStep> = {}): AnimationStep {
  return {
    id: `a_${elementId}`,
    elementId,
    trigger: 'onClick',
    category: 'entrance',
    preset: 'fade',
    duration: 600,
    delay: 0,
    easing: 'ease-out',
    ...init,
  };
}

const last = (id: string) => cues[id]?.at(-1);
/** The animations of nothing that keep a group going while a chart builds. */
const markers = () =>
  fake.all.filter((a) => Array.isArray(a.keyframes) && a.keyframes.length === 0);

beforeEach(() => {
  fake = installFakeAnimations();
  document.body.innerHTML = SLIDE;
  slide = document.body.firstElementChild as HTMLElement;
  cues = {};
  for (const node of Array.from(slide.querySelectorAll<HTMLElement>('[data-slidr-chart]'))) {
    node.addEventListener(CHART_EVENT, (event) => {
      (cues[node.id] ??= []).push((event as CustomEvent<ChartCue>).detail);
    });
  }
});

afterEach(() => fake.uninstall());

const steps = [
  step('title', { trigger: 'afterPrevious', duration: 300 }),
  step('stepped', { delay: 200 }),
  step('group', { preset: 'appear', duration: 0 }),
];

describe('charts on the timeline (CHT-08)', () => {
  it('says nothing to a chart until a state is asked for', () => {
    createTimeline(slide, steps, { size });
    expect(cues).toEqual({});
  });

  it('keeps every chart waiting before the lead-in, and a chart with a step until its click', () => {
    const t = createTimeline(slide, steps, { size });
    t.apply(0);
    expect(last('c-plain')).toEqual({ state: 'wait' });
    expect(last('c-stepped')).toEqual({ state: 'wait' });
    t.apply(1);
    expect(last('c-plain')).toEqual({ state: 'rest' });
    expect(last('c-stepped')).toEqual({ state: 'wait' });
    expect(last('c-grouped')).toEqual({ state: 'wait' });
    t.apply(2);
    expect(last('c-stepped')).toEqual({ state: 'rest' });
    expect(last('c-grouped')).toEqual({ state: 'wait' });
    t.apply(3);
    expect(last('c-grouped')).toEqual({ state: 'rest' });
  });

  it('builds a chart without a step with the lead-in, and does not add a click for it', () => {
    const t = createTimeline(slide, steps, { size });
    expect(t.clicks).toBe(2);
    void t.play(0);
    expect(last('c-plain')).toEqual({ state: 'play', delay: 0, duration: CHART_BUILD_MS });
    expect(last('c-stepped')).toEqual({ state: 'wait' });
    // The lead-in lasts as long as the chart, not only as long as the title's fade.
    expect(t.duration(0)).toBe(CHART_BUILD_MS);
    expect(t.groups[0]?.duration).toBe(CHART_BUILD_MS);
  });

  it('builds a chart on the entrance of its element, when the step starts and for as long', () => {
    const t = createTimeline(slide, steps, { size });
    void t.play(1);
    expect(last('c-stepped')).toEqual({ state: 'play', delay: 200, duration: 600 });
    expect(last('c-plain')).toEqual({ state: 'rest' });
    expect(markers().map((m) => m.options.delay)).toEqual([200]);
  });

  it('builds a chart inside a group with the group, for a time even when the step takes none', () => {
    const t = createTimeline(slide, steps, { size });
    void t.play(2);
    const cue = last('c-grouped');
    expect(cue?.state).toBe('play');
    expect(cue).toMatchObject({ delay: 0 });
    expect((cue as { duration: number }).duration).toBeGreaterThanOrEqual(400);
    expect(t.duration(2)).toBeGreaterThanOrEqual(400);
  });

  it('plays the lead-in of a slide whose timeline is empty, for the chart', async () => {
    const t = createTimeline(slide, [], { size });
    expect(t.clicks).toBe(0);
    const played = t.play(0);
    expect(t.playing).toBe(true);
    expect(last('c-stepped')).toEqual({ state: 'play', delay: 0, duration: CHART_BUILD_MS });
    await fake.finishRunning();
    await played;
    expect(t.playing).toBe(false);
    expect(last('c-stepped')).toEqual({ state: 'rest' });
  });

  it('shows a chart whole when its group is cut short, and when the timeline is cleared', () => {
    const t = createTimeline(slide, steps, { size });
    void t.play(1);
    t.finish();
    expect(last('c-stepped')).toEqual({ state: 'rest' });
    t.apply(0);
    expect(last('c-stepped')).toEqual({ state: 'wait' });
    t.clear();
    for (const id of ['c-plain', 'c-stepped', 'c-grouped']) {
      expect(last(id)).toEqual({ state: 'rest' });
    }
    expect(fake.live().filter((a) => a.state === 'running')).toEqual([]);
  });

  it('leaves alone a chart that is marked as still', () => {
    slide.querySelector('#c-plain')?.setAttribute('data-slidr-chart-still', '');
    const t = createTimeline(slide, [], { size });
    void t.play(0);
    t.clear();
    expect(cues['c-plain']).toBeUndefined();
    expect(last('c-stepped')).toEqual({ state: 'rest' });
  });
});
