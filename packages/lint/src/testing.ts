// Helpers for this package's tests (not exported from the package).
import {
  CommandBus,
  createDeck,
  createSlide,
  type CreateDeckOptions,
  type Element,
  type Frame,
  type Slide,
} from '@slidr/model';
import { lintSlide } from './lint';
import type {
  ElementMeasure,
  Rgb,
  SlideMeasurements,
  TextMeasure,
  TextSpanMeasure,
} from './measure';
import type { LintFinding } from './rule';
import { proseOf } from './text';

export const WHITE: Rgb = [255, 255, 255];
export const BLACK: Rgb = [0, 0, 0];

/** Body text as the base theme draws it: 30px, near black, on the white slide. */
export function span(overrides: Partial<TextSpanMeasure> = {}): TextSpanMeasure {
  return { color: [21, 23, 26], alpha: 1, fontSize: 30, backdrop: [WHITE], ...overrides };
}

/** Text whose glyphs fill `ink` and fit their box. */
export function text(ink: Frame, overrides: Partial<TextMeasure> = {}): TextMeasure {
  return { ink, overflow: { x: 0, y: 0 }, scale: 1, spans: [span()], ...overrides };
}

function measureInto(
  elements: readonly Element[],
  dx: number,
  dy: number,
  out: Record<string, ElementMeasure>,
): void {
  for (const element of elements) {
    if (element.hidden) continue;
    const { x, y, w, h } = element.frame;
    const box = { x: x + dx, y: y + dy, w, h };
    const shows = proseOf(element)?.paragraphs.some((p) => p.runs.some((run) => run.text !== ''));
    out[element.id] = shows || element.type === 'table' ? { box, text: text(box) } : { box };
    if (element.type === 'group') measureInto(element.children, box.x, box.y, out);
  }
}

/**
 * Measurements written by hand, as a render of unrotated elements gives them: every box is the
 * frame, and text fills its frame and fits it. `overrides` replaces single elements.
 */
export function measure(
  slide: Slide,
  overrides: Record<string, ElementMeasure> = {},
): SlideMeasurements {
  const elements: Record<string, ElementMeasure> = {};
  measureInto(slide.elements, 0, 0, elements);
  return { elements: { ...elements, ...overrides } };
}

/** The findings of one rule for a slide of the given elements. */
export function check(
  rule: string,
  elements: Element[],
  overrides: Record<string, ElementMeasure> = {},
  options: { slide?: Partial<Slide>; deck?: CreateDeckOptions } = {},
): LintFinding[] {
  const slide = createSlide({ id: 's_1', ...options.slide, elements });
  const deck = createDeck({ lang: 'en', ...options.deck, slides: [slide] });
  return lintSlide(deck, slide, measure(slide, overrides)).filter((f) => f.rule === rule);
}

/**
 * The slide of `check` after a finding's fix ran on it, through a command bus that validates
 * every command: a fix that is not a valid change of the deck fails here.
 */
export function fixed(
  elements: Element[],
  finding: LintFinding | undefined,
  options: { slide?: Partial<Slide>; deck?: CreateDeckOptions } = {},
): Slide {
  if (!finding?.fix) throw new Error('The finding has no fix.');
  const slide = createSlide({ id: 's_1', ...options.slide, elements });
  const deck = createDeck({ lang: 'en', ...options.deck, slides: [slide] });
  const bus = new CommandBus(deck, { validate: true });
  bus.batch(finding.fix);
  if (bus.undoStack.length !== 1) throw new Error('A fix is one step to undo.');
  return bus.deck.slides[0]!;
}
