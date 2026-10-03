import type { ChartElement } from '@slidr/model';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { useRenderContext } from '../context';
import { chartController, type ChartController } from './controller';
import { chartSpec } from './spec';

/** The engine and the chart library with it: a chunk of its own, loaded by the first chart. */
const loadEngine = () => import('./engine');

/**
 * A chart (WG6-T05). React draws only the node, with the chart's spec on it (`CHART_ATTRIBUTE`);
 * the picture inside is the chart library's, drawn by the engine once it has loaded
 * (`controller.ts`). `settle` waits for that, so whoever pictures the slide sees the chart.
 *
 * The node reads left to right whatever the deck's direction: the library places text by its
 * left and right ends, and in a right-to-left box SVG turns them around.
 */
export function ChartView({ element: e }: { element: ChartElement }) {
  const { theme, dir, lang, mode } = useRenderContext();
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ChartController | null>(null);
  const live = mode === 'present';
  const { chartType, data, options } = e;
  const { w, h } = e.frame;
  // The model keeps the identity of what a change did not touch (ADR-007): moving a chart draws
  // nothing again.
  const spec = useMemo(
    () => chartSpec({ chartType, data, options, frame: { w, h } }, { theme, dir, lang }),
    [chartType, data, options, w, h, theme, dir, lang],
  );
  const json = useMemo(() => JSON.stringify(spec), [spec]);

  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const made = chartController(node, live, loadEngine);
    controller.current = made;
    return () => {
      controller.current = null;
      made.dispose();
    };
  }, [live]);

  // After the effect above, and again whenever the chart is another picture.
  useLayoutEffect(() => {
    controller.current?.draw(spec);
  }, [spec, live]);

  return (
    <div
      ref={host}
      data-slidr-chart={json}
      role="img"
      aria-label={options.title ?? chartType}
      dir="ltr"
      style={{
        position: 'absolute',
        inset: 0,
        margin: 0,
        padding: 0,
        // In the editor the Stage owns the pointer; in a show it reaches the chart, for the tooltip.
        pointerEvents: live ? 'auto' : 'none',
      }}
    />
  );
}
