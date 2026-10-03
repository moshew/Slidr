import { CHART_ATTRIBUTE, CHART_EVENT, type ChartCue } from '@slidr/renderer';
import {
  CHART_EVENT as RUNTIME_EVENT,
  CHART_SELECTOR,
  type ChartCue as RuntimeCue,
} from '@slidr/runtime';
import { describe, expect, it } from 'vitest';
import { buildDocument, type DocumentParts } from './document';

const parts: DocumentParts = {
  title: 'Plan',
  lang: 'en',
  dir: 'ltr',
  size: { w: 1920, h: 1080 },
  slides: '<section class="slide"></section>',
  fontCss: '',
  script: 'player()',
};

describe('charts in an exported file (EXP-12)', () => {
  it('holds the runtime and the renderer to one name for a chart and for its cue', () => {
    // The runtime depends on nothing and repeats the names; this package has both.
    expect(CHART_SELECTOR).toBe(`[${CHART_ATTRIBUTE}]`);
    expect(RUNTIME_EVENT).toBe(CHART_EVENT);
    // The shapes of the cue are one type: each is assignable to the other.
    const toRuntime = (cue: ChartCue): RuntimeCue => cue;
    const toRenderer = (cue: RuntimeCue): ChartCue => cue;
    const cue = { state: 'play', delay: 0, duration: 1 } as const;
    expect(toRenderer(toRuntime(cue))).toBe(cue);
  });

  it('puts the chart script before the player, so charts listen when the first slide starts', () => {
    const html = buildDocument({ ...parts, chartScript: 'charts()' });
    const charts = html.indexOf('<script data-slidr-charts>charts()</script>');
    expect(charts).toBeGreaterThan(html.indexOf('</section>'));
    expect(html.indexOf('<script>player()</script>')).toBeGreaterThan(charts);
  });

  it('leaves the chart script out of a file without charts', () => {
    const html = buildDocument(parts);
    expect(html).not.toContain('data-slidr-charts');
    expect(html.match(/<script/g)).toHaveLength(1);
  });
});
