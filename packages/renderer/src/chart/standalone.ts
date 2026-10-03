// The entry of the script an exported file carries when its deck has charts (WG6-T08, EXP-12):
// the chart library reduced to the model's chart types, the same option builder and the same
// engine the editor draws with. See scripts/chartBundle.config.mjs.
//
// The file holds every chart twice: as the picture the editor drew, which is what shows without
// JavaScript, and as the spec on the chart's node. This script draws each chart again from its
// spec, so that it has a tooltip and builds on its step. It runs before the player's script and
// starts listening at once: the cues of the first slide come as soon as the player starts.
import { chartController } from './controller';
import { CHART_ATTRIBUTE } from './cue';
import * as engine from './engine';
import type { ChartSpec } from './spec';

const loadEngine = () => Promise.resolve(engine);

for (const node of Array.from(document.querySelectorAll<HTMLElement>(`[${CHART_ATTRIBUTE}]`))) {
  let spec: ChartSpec | undefined;
  try {
    spec = JSON.parse(node.getAttribute(CHART_ATTRIBUTE) ?? '') as ChartSpec;
  } catch {
    // Not a spec: the picture in the file stays.
  }
  if (spec) chartController(node, true, loadEngine).draw(spec);
}
