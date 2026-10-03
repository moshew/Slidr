import type { Deck, Element, Slide } from '@slidr/model';
import type { ElementMeasure } from './measure';

export type Severity = 'error' | 'warning' | 'info';

/** One problem on one slide. The same shape as `LintFinding` of the Deck API (ADR-011). */
export interface LintFinding {
  /** `L01` ... `L16` (SPEC 9.2, QG-04). */
  rule: string;
  severity: Severity;
  slideId: string;
  /** The elements to change; empty when the finding is about the slide as a whole. */
  elementIds: string[];
  /** Written for the agent: what was measured, and what would fix it. */
  message: string;
}

/** A rendered element that is not a group, with what its rendering measured. */
export interface Item<E extends Element = Element> {
  element: E;
  measure: ElementMeasure;
}

export interface SlideContext {
  deck: Deck;
  slide: Slide;
  /** Bottom to top. Elements inside groups are here too, with their place on the slide. */
  items: readonly Item[];
}

export type Problem = Pick<LintFinding, 'elementIds' | 'message'>;

export interface Rule {
  id: string;
  severity: Severity;
  /** Whether its findings go back to the agent after every write (LNT-04, QG-03, QG-04). */
  agent: boolean;
  check(ctx: SlideContext): Problem[];
}
