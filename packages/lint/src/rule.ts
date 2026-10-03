import type { Background, Deck, Element, Frame, Slide } from '@slidr/model';
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

/** What is drawn on a slide, as far as a rule about the picture cares. */
export interface Drawn {
  /** Bottom to top. Elements inside groups are here too, with their place on the slide. */
  items: readonly Item[];
  /** Groups that read as one drawing (`drawingsIn`), each as the box around its parts. */
  drawings: readonly Frame[];
}

/** The slide's own elements are `items` and `drawings`. */
export interface SlideContext extends Drawn {
  deck: Deck;
  slide: Slide;
  /** Behind everything: the slide's own background, else its layout's, else the theme's. */
  background: Background;
  /**
   * What the slide's layout draws under it: its decorations, placed by their frames (the
   * renderer gives them no element id, so nothing measures them). The logo is left out: it is
   * on every slide and says nothing about this one. A rule about what was written on the slide
   * reads `items`; a rule about what the slide looks like reads the layout as well, since a
   * slide built on a layout as the template drew it is as full as the template made it.
   */
  layout: Drawn;
}

export type Problem = Pick<LintFinding, 'elementIds' | 'message'>;

export interface Rule {
  id: string;
  severity: Severity;
  /** Whether its findings go back to the agent after every write (LNT-04, QG-03, QG-04). */
  agent: boolean;
  check(ctx: SlideContext): Problem[];
}
