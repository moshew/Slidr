import { createDeck, createElement, createSlide, type Element, type Slide } from '@slidr/model';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TRANSITION, deckTransition, defaultTimeline } from './motion';

/*
 * Motion by default (ADR-092): what a slide the agent made moves with when nobody said.
 */

const SIZE = { w: 1920, h: 1080 };

const words = (text: string) => ({
  paragraphs: [{ dir: 'ltr' as const, align: 'start' as const, runs: [{ text }] }],
});

function text(
  name: string,
  frame: Element['frame'],
  extra: Partial<Parameters<typeof createElement.text>[0]> = {},
) {
  return createElement.text({ name, frame, content: words(name), ...extra });
}

const names = (slide: Slide) => {
  const byId = new Map(slide.elements.map((e) => [e.id, e.name]));
  return defaultTimeline(slide, SIZE).map((s) => [byId.get(s.elementId), s.preset, s.delay]);
};

describe('defaultTimeline', () => {
  it('brings in what is on the slide in order, and leaves the title and the backdrop be', () => {
    const slide = createSlide({
      elements: [
        createElement.image({
          name: 'backdrop',
          frame: { x: 0, y: 0, w: 1920, h: 1080 },
          assetId: 'a',
        }),
        text('title', { x: 120, y: 100, w: 1200, h: 120 }, { role: 'title' }),
        text('lead', { x: 120, y: 260, w: 900, h: 80 }),
        createElement.group({
          name: 'card',
          frame: { x: 120, y: 420, w: 500, h: 400 },
          children: [createElement.shape({ frame: { x: 0, y: 0, w: 500, h: 400 } })],
        }),
        createElement.image({
          name: 'photo',
          frame: { x: 1100, y: 420, w: 600, h: 400 },
          assetId: 'a',
        }),
        text('footer', { x: 120, y: 1000, w: 600, h: 40 }, { role: 'footer' }),
      ],
    });
    expect(names(slide)).toEqual([
      ['lead', 'rise', 0],
      ['card', 'rise', 150],
      ['photo', 'fade', 300],
    ]);
    const [step] = defaultTimeline(slide, SIZE);
    expect(step).toMatchObject({
      trigger: 'withPrevious',
      category: 'entrance',
      direction: 'up',
      duration: 600,
      easing: 'ease-out',
    });
  });

  it('brings a small decoration in with what it stands beside, and keeps one by the title still', () => {
    const slide = createSlide({
      elements: [
        text('title', { x: 120, y: 100, w: 1000, h: 100 }, { role: 'title' }),
        createElement.shape({ name: 'underline', frame: { x: 120, y: 210, w: 160, h: 8 } }),
        createElement.shape({ name: 'dot', frame: { x: 120, y: 520, w: 24, h: 24 } }),
        text('point', { x: 170, y: 500, w: 900, h: 70 }),
        createElement.shape({ name: 'band', frame: { x: 0, y: 700, w: 1920, h: 160 } }),
      ],
    });
    expect(names(slide)).toEqual([
      ['point', 'rise', 0],
      ['dot', 'fade', 0],
    ]);
  });

  it('keeps a slide still when nothing on it is more than its frame', () => {
    const slide = createSlide({
      elements: [
        createElement.image({
          name: 'full',
          frame: { x: 0, y: 0, w: 1920, h: 1080 },
          assetId: 'a',
        }),
        text('title', { x: 120, y: 800, w: 1200, h: 140 }, { role: 'title' }),
      ],
    });
    expect(defaultTimeline(slide, SIZE)).toEqual([]);
  });

  it('lets a quote fade in slowly, and a big number grow in', () => {
    const quote = createSlide({
      archetype: 'quote',
      elements: [
        text('words', { x: 200, y: 300, w: 1500, h: 300 }),
        text('who', { x: 200, y: 660, w: 800, h: 60 }),
      ],
    });
    expect(names(quote)).toEqual([
      ['words', 'fade', 0],
      ['who', 'fade', 260],
    ]);
    expect(defaultTimeline(quote, SIZE)[0]!.duration).toBe(900);
    const number = createSlide({
      archetype: 'bigNumber',
      elements: [
        text('86%', { x: 200, y: 260, w: 900, h: 400 }),
        text('of riders', { x: 200, y: 700, w: 900, h: 80 }),
      ],
    });
    expect(names(number)).toEqual([
      ['86%', 'zoom', 0],
      ['of riders', 'rise', 150],
    ]);
  });

  it('keeps a long list of things within about a second', () => {
    const slide = createSlide({
      elements: Array.from({ length: 10 }, (_, i) =>
        text(`item ${i}`, {
          x: 120 + (i % 5) * 340,
          y: 300 + Math.floor(i / 5) * 300,
          w: 300,
          h: 200,
        }),
      ),
    });
    const delays = defaultTimeline(slide, SIZE).map((s) => s.delay);
    expect(delays[1]).toBe(100);
    expect(delays[9]).toBe(900);
  });
});

describe('deckTransition', () => {
  const deck = () => {
    const made = createDeck({ lang: 'en' });
    made.slides = [createSlide({}), createSlide({}), createSlide({})];
    return made;
  };

  it('is the default in a deck without one', () => {
    expect(deckTransition(deck(), 1)).toEqual(DEFAULT_TRANSITION);
  });

  it('follows the slide before the place, or else the slide after it', () => {
    const d = deck();
    const push = { ...DEFAULT_TRANSITION, type: 'push' };
    const cut = { ...DEFAULT_TRANSITION, type: 'none' };
    d.slides[2]!.transition = cut;
    expect(deckTransition(d, 1)).toEqual(cut);
    d.slides[0]!.transition = push;
    expect(deckTransition(d, 1)).toEqual(push);
    expect(deckTransition(d, 3)).toEqual(cut);
  });
});
