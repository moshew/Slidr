// @vitest-environment happy-dom
import { createBaseTheme, createElement } from '@slidr/model';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chartController, chartsSettled, type ChartEngine } from './controller';
import { CHART_EVENT, lastCue, type ChartCue } from './cue';
import { chartSpec, type ChartSpec } from './spec';

const theme = createBaseTheme();

function spec(title: string): ChartSpec {
  const chart = createElement.chart({
    id: 'c',
    frame: { x: 0, y: 0, w: 600, h: 400 },
    chartType: 'column',
    data: { categories: ['a'], series: [{ name: 's', values: [1] }] },
  });
  return chartSpec(
    { ...chart, options: { ...chart.options, title } },
    { theme, dir: 'ltr', lang: 'en' },
  );
}

/** An engine that draws nothing and remembers what it was asked. */
function fakeEngine() {
  const calls: string[] = [];
  const engine: ChartEngine = {
    mountChart(host, drawn, live) {
      calls.push(`mount ${drawn.title} ${live ? 'live' : 'still'}`);
      const box = host.ownerDocument.createElement('div');
      box.setAttribute('data-slidr-chart-box', '');
      host.append(box);
      return {
        update: (next) => calls.push(`update ${next.title}`),
        dispose: () => {
          calls.push('dispose');
          box.remove();
        },
      };
    },
  };
  return { engine, calls };
}

let host: HTMLElement;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  host.remove();
  vi.restoreAllMocks();
});

describe('chartController', () => {
  it('does not ask for the engine until a chart is to be drawn', async () => {
    const { engine } = fakeEngine();
    const load = vi.fn(() => Promise.resolve(engine));
    const controller = chartController(host, false, load);
    await chartsSettled();
    expect(load).not.toHaveBeenCalled();
    controller.draw(spec('one'));
    await chartsSettled();
    expect(load).toHaveBeenCalledTimes(1);
    controller.dispose();
  });

  it('is settled only once the chart is in the DOM', async () => {
    const { engine, calls } = fakeEngine();
    let release = (_: ChartEngine) => {};
    const controller = chartController(
      host,
      false,
      () => new Promise<ChartEngine>((resolve) => (release = resolve)),
    );
    controller.draw(spec('one'));
    let settled = false;
    void chartsSettled().then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);
    expect(calls).toEqual([]);
    release(engine);
    await chartsSettled();
    expect(calls).toEqual(['mount one still']);
    expect(host.querySelector('[data-slidr-chart-box]')).not.toBeNull();
    controller.dispose();
  });

  it('draws the latest spec when several come while it is getting ready, then updates in place', async () => {
    const { engine, calls } = fakeEngine();
    const controller = chartController(host, true, () => Promise.resolve(engine));
    controller.draw(spec('one'));
    controller.draw(spec('two'));
    controller.draw(spec('three'));
    await chartsSettled();
    expect(calls).toEqual(['mount three live']);
    controller.draw(spec('four'));
    await chartsSettled();
    expect(calls).toEqual(['mount three live', 'update four']);
    controller.dispose();
    expect(calls.at(-1)).toBe('dispose');
  });

  it('keeps an invisible line of the signs a live chart may show, in the chart font', async () => {
    const { engine } = fakeEngine();
    const controller = chartController(host, true, () => Promise.resolve(engine));
    const drawn = spec('Sales');
    controller.draw(drawn);
    await chartsSettled();
    const carrier = host.querySelector<HTMLElement>('[data-slidr-chart-glyphs]');
    expect(carrier?.textContent).toContain('0123456789');
    expect(carrier?.textContent).toContain('Sales');
    expect(carrier?.style.visibility).toBe('hidden');
    expect(carrier?.style.font).toContain(`${drawn.font.size}px`);
    // One line, however often the chart is drawn.
    controller.draw(spec('Other'));
    await chartsSettled();
    expect(host.querySelectorAll('[data-slidr-chart-glyphs]')).toHaveLength(1);
    controller.dispose();
  });

  it('replaces the picture an export wrote into the file', async () => {
    host.innerHTML = '<div data-slidr-chart-box id="written"></div>';
    const { engine } = fakeEngine();
    const controller = chartController(host, true, () => Promise.resolve(engine));
    controller.draw(spec('one'));
    await chartsSettled();
    expect(host.querySelector('#written')).toBeNull();
    expect(host.querySelectorAll('[data-slidr-chart-box]')).toHaveLength(1);
    controller.dispose();
  });

  it('remembers a cue that came before the engine did', () => {
    const { engine } = fakeEngine();
    const controller = chartController(host, true, () => Promise.resolve(engine));
    const cue: ChartCue = { state: 'play', delay: 0, duration: 500 };
    host.dispatchEvent(new CustomEvent(CHART_EVENT, { detail: cue }));
    host.dispatchEvent(new CustomEvent(CHART_EVENT, { detail: { state: 'nonsense' } }));
    expect(lastCue(host)?.cue).toEqual(cue);
    controller.dispose();
    expect(lastCue(host)).toBeUndefined();
  });

  it('leaves the box empty and says why when a chart cannot be drawn, and still settles', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const controller = chartController(host, false, () => Promise.reject(new Error('no engine')));
    controller.draw(spec('one'));
    await chartsSettled();
    expect(host.dataset.slidrChartError).toBe('no engine');
    expect(warn).toHaveBeenCalled();
    controller.dispose();
  });

  it('draws nothing after it was disposed', async () => {
    const { engine, calls } = fakeEngine();
    const controller = chartController(host, false, () => Promise.resolve(engine));
    controller.draw(spec('one'));
    controller.dispose();
    await chartsSettled();
    expect(calls).toEqual([]);
  });
});
