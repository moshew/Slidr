/**
 * Charts on the timeline (CHT-08). A chart is drawn by a library the runtime does not carry, so
 * the runtime only says when: it dispatches a `slidr-chart` event on the chart's node, and
 * whoever draws the chart listens. Dispatching an event writes nothing on the node, so the
 * runtime still leaves a slide as the renderer drew it.
 *
 * A chart builds on the entrance step of its element, over the length of that step. A chart
 * whose element has no entrance step builds with the lead-in, when its slide is shown.
 *
 * The names are those of `packages/renderer/src/chart/cue.ts`; the runtime depends on nothing,
 * so they are repeated here, and a test in `@slidr/html-export` holds the two together.
 */
export const CHART_SELECTOR = '[data-slidr-chart]';
export const CHART_EVENT = 'slidr-chart';
/** A chart that carries this attribute is not animated: an export without animations sets it. */
export const CHART_STILL = 'data-slidr-chart-still';

/** How long a chart takes to build with the lead-in, in milliseconds. */
export const CHART_BUILD_MS = 900;
/** A chart on a step builds for no less than this, whatever the step says: `appear` is no time. */
export const CHART_BUILD_MIN_MS = 400;

export type ChartCue =
  /** Before its step: the chart with its series not yet drawn. */
  | { state: 'wait' }
  /** Its step: the series grow in, `delay` milliseconds from now and over `duration`. */
  | { state: 'play'; delay: number; duration: number }
  /** Drawn whole, at once. */
  | { state: 'rest' };

/** When a chart of a slide builds: in which group, and when in it. */
export interface ChartBuild {
  node: HTMLElement;
  group: number;
  /** Milliseconds from the start of the group. */
  start: number;
  duration: number;
}

export function cueChart(node: HTMLElement, cue: ChartCue): void {
  const view = node.ownerDocument.defaultView;
  if (!view) return;
  node.dispatchEvent(new view.CustomEvent(CHART_EVENT, { detail: cue }));
}

/** The charts of a slide that are animated. */
export function chartNodes(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CHART_SELECTOR)).filter(
    (node) => !node.hasAttribute(CHART_STILL),
  );
}
