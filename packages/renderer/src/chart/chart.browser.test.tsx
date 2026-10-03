import { createDeck, createElement, createSlide } from '@slidr/model';
import { hebrewDeck } from '@slidr/model/fixtures';
import { expect, test, vi } from 'vitest';
import { chartDeck } from '../fixtures/chartDeck';
import { renderSlideOffscreen } from '../offscreen';

/** Whether the page has asked for the chart engine, and with it for the chart library. */
const engineLoaded = () =>
  performance
    .getEntriesByType('resource')
    .some((entry) => /\/chart\/engine|echarts/.test(entry.name));

const charts = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<SVGSVGElement>('[data-slidr-chart] [data-slidr-chart-box] svg'));

// The order matters: the first test is the page before any chart was drawn.
test('a slide without a chart does not load the chart library', async () => {
  const deck = hebrewDeck();
  const offscreen = await renderSlideOffscreen({ deck, slide: deck.slides[0]! });
  expect(offscreen.root.querySelector('[data-slidr-chart]')).toBeNull();
  expect(engineLoaded()).toBe(false);
  offscreen.dispose();
});

test('a chart without data is a mark of its place in the editor, and nothing in a show', async () => {
  // What a layout's chart placeholder is until someone fills it (`compose/layout.ts`).
  const empty = createElement.chart({
    id: 'e_empty',
    frame: { x: 200, y: 200, w: 800, h: 480 },
    chartType: 'column',
    data: { categories: [], series: [] },
  });
  const deck = createDeck({ slides: [createSlide({ id: 's_empty', elements: [empty] })] });
  const slide = deck.slides[0]!;

  const edited = await renderSlideOffscreen({ deck, slide });
  const mark = edited.root.querySelector('[data-element-id="e_empty"] [data-slidr-placeholder]');
  expect(mark?.getAttribute('data-slidr-placeholder')).toBe('chart');
  expect(mark?.querySelector('svg')).not.toBeNull();
  expect(edited.root.querySelector('[data-slidr-chart]')).toBeNull();
  edited.dispose();

  const shown = await renderSlideOffscreen({ deck, slide, mode: 'present' });
  expect(shown.root.querySelector('[data-element-id="e_empty"]')?.childElementCount).toBe(0);
  shown.dispose();
  // Nothing to draw, so the library was not asked for.
  expect(engineLoaded()).toBe(false);
});

test('a slide with charts has settled only when they are drawn', async () => {
  const deck = chartDeck('rtl');
  // Whoever measures or pictures a slide waits for exactly this promise (lint, capture).
  const offscreen = await renderSlideOffscreen({ deck, slide: deck.slides[0]! });
  expect(engineLoaded()).toBe(true);
  const drawn = charts(offscreen.root);
  expect(drawn).toHaveLength(4);
  for (const svg of drawn) {
    expect(svg.getAttribute('width')).toBe('888');
    expect(svg.querySelectorAll('path').length).toBeGreaterThan(3);
    expect(svg.querySelectorAll('text').length).toBeGreaterThan(3);
  }
  // The chart keeps to the box of its element.
  const box = offscreen.root.querySelector('[data-element-id="e_chart_column"]')!;
  expect(Math.round(box.getBoundingClientRect().width)).toBe(888);
  offscreen.dispose();
  expect(document.querySelector('[data-slidr-chart-box]')).toBeNull();
});

test('draws within the call in a window that gets no frames, as the capture window', async () => {
  const frames = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
  try {
    const deck = chartDeck('ltr');
    const offscreen = await renderSlideOffscreen({ deck, slide: deck.slides[1]! });
    const drawn = charts(offscreen.root);
    expect(drawn).toHaveLength(4);
    // The slices of the pie are there, though no frame was ever given to the library.
    expect(drawn[0]?.querySelectorAll('path').length).toBeGreaterThan(4);
    offscreen.dispose();
  } finally {
    frames.mockRestore();
  }
});

test('writes the spec of a chart on its node, for the file an export makes', async () => {
  const deck = chartDeck('rtl');
  const offscreen = await renderSlideOffscreen({ deck, slide: deck.slides[0]!, mode: 'present' });
  const node = offscreen.root.querySelector<HTMLElement>(
    '[data-element-id="e_chart_column"] [data-slidr-chart]',
  )!;
  const spec = JSON.parse(node.dataset.slidrChart ?? '{}') as Record<string, unknown>;
  expect(spec).toMatchObject({ type: 'column', dir: 'rtl', lang: 'he', w: 888, h: 484 });
  // The chart is laid out left to right, and the signs a tooltip may show are carried along.
  expect(node.dir).toBe('ltr');
  expect(node.querySelector('[data-slidr-chart-glyphs]')?.textContent).toContain('0123456789');
  offscreen.dispose();
});
