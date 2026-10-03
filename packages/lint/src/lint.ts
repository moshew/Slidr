import {
  rotatedBounds,
  walkElements,
  type Deck,
  type Element,
  type Frame,
  type Slide,
} from '@slidr/model';
import type { SlideMeasurements } from './measure';
import type { Drawn, Item, LintFinding, SlideContext } from './rule';
import { rules } from './rules';
import { drawingsIn } from './visual';

/**
 * `agent`: the rules whose findings go back to the agent after every write (L01–L07, L13, L16;
 * LNT-04, QG-03, QG-04). `all`: every rule.
 */
export type RuleSet = 'agent' | 'all';

/** The elements a layout draws, each where its frame puts it on the slide. Hidden ones are not drawn. */
function placed(elements: readonly Element[], dx: number, dy: number, out: Item[]): Item[] {
  for (const element of elements) {
    if (element.hidden) continue;
    const frame = { ...element.frame, x: element.frame.x + dx, y: element.frame.y + dy };
    if (element.type === 'group') placed(element.children, frame.x, frame.y, out);
    else if (element.role !== 'logo') {
      out.push({ element, measure: { box: rotatedBounds(frame, element.rotation) } });
    }
  }
  return out;
}

function drawn(elements: readonly Element[], items: readonly Item[]): Drawn {
  const boxes = new Map<string, Frame>(items.map((item) => [item.element.id, item.measure.box]));
  return { items, drawings: drawingsIn(elements, boxes) };
}

/**
 * The design lint of one slide (SPEC 9.2): the model and what its rendering measured in,
 * findings out. Pure and synchronous (LNT-01): it never touches the DOM, so the same slide and
 * measurements always give the same findings, in the order of the rule list.
 */
export function lintSlide(
  deck: Deck,
  slide: Slide,
  measured: SlideMeasurements,
  set: RuleSet = 'all',
): LintFinding[] {
  const items: Item[] = [];
  for (const element of walkElements(slide.elements)) {
    const measure = measured.elements[element.id];
    // No measurement: the element is hidden, or inside a hidden group.
    if (element.type !== 'group' && measure) items.push({ element, measure });
  }
  const layout = slide.layoutId ? deck.layouts.find((l) => l.id === slide.layoutId) : undefined;
  const decorations = layout?.decorations ?? [];
  const ctx: SlideContext = {
    deck,
    slide,
    ...drawn(slide.elements, items),
    background: slide.background ?? layout?.background ?? deck.theme.background,
    layout: drawn(decorations, placed(decorations, 0, 0, [])),
  };
  const findings: LintFinding[] = [];
  for (const rule of rules) {
    if (set === 'agent' && !rule.agent) continue;
    for (const problem of rule.check(ctx)) {
      findings.push({ rule: rule.id, severity: rule.severity, slideId: slide.id, ...problem });
    }
  }
  return findings;
}
