import { walkElements, type Deck, type Slide } from '@slidr/model';
import type { SlideMeasurements } from './measure';
import type { Item, LintFinding } from './rule';
import { rules } from './rules';

/**
 * `agent`: the rules whose findings go back to the agent after every write (L01–L07, L13, L16;
 * LNT-04, QG-03, QG-04). `all`: every rule.
 */
export type RuleSet = 'agent' | 'all';

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
  const ctx = { deck, slide, items };
  const findings: LintFinding[] = [];
  for (const rule of rules) {
    if (set === 'agent' && !rule.agent) continue;
    for (const problem of rule.check(ctx)) {
      findings.push({ rule: rule.id, severity: rule.severity, slideId: slide.id, ...problem });
    }
  }
  return findings;
}
