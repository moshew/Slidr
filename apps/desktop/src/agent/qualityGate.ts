/**
 * The design check at the end of an agent's turn (SPEC 9.4, WG10-T13): did the agent look at
 * every slide it changed, and did it leave findings a turn may not end with? The service asks
 * `review` when the agent says it is done, and sends the agent back while the answer is not
 * clean, twice at most (QG-02).
 *
 * This file only watches and judges. What is sent back is worded in `@slidr/prompts`, and the
 * rounds are run by `AgentService`.
 */
import type { LintFinding, LintService, ToolResult } from '@slidr/agent-tools';
import { findSlide, type ChangeEvent, type Deck, type Slide } from '@slidr/model';
import type { GateReport } from './transcript';

/** How many times a turn is sent back (QG-02, QG-05). */
export const GATE_ROUNDS = 2;

/**
 * Findings that are warnings to a reader of the lint panel and demands to the agent: coverage
 * and text load (QG-03), and a slide with no visual element (QG-04).
 */
const DEMANDED = new Set(['L07', 'L13', 'L16']);

/** Whether a turn may not end with this finding (QG-02 to QG-04). */
export function holdsTurn(finding: LintFinding): boolean {
  return finding.severity === 'error' || DEMANDED.has(finding.rule);
}

/**
 * The fields of a slide that decide what it looks like. A change to the others (its name, its
 * speaker notes, its transition) leaves the picture the agent saw as good as it was, so it asks
 * for no new look: notes written for twenty slides are not twenty renders.
 */
const DRAWN: readonly (keyof Slide)[] = ['elements', 'background', 'css', 'layoutId'];

/** Two findings about the same thing, whatever was measured each time. */
function findingKey(finding: LintFinding): string {
  return `${finding.rule}|${[...finding.elementIds].sort().join(',')}`;
}

export const cleanReport: GateReport = { unseen: [], findings: [] };

export function isClean(report: GateReport): boolean {
  return report.unseen.length === 0 && report.findings.length === 0;
}

export interface ReviewOptions {
  /** Absent when the app cannot lint: then nothing is demanded. */
  lint?: LintService;
  /** The session has a tool that returns a picture of a slide (QG-01 needs one to ask for). */
  canLook: boolean;
}

/**
 * What one turn did to the deck, as far as the design check cares: which slides the agent
 * changed, when it last saw each, and how each slide was before the turn touched it.
 */
export class TurnWatch {
  /** Counts the turn's changes; a look is good for the changes up to its number. */
  #seq = 0;
  /** The slides the turn touched: the ones whose findings are the turn's. */
  readonly #changed = new Set<string>();
  /** For each, the number of the last change to what it looks like. */
  readonly #drawn = new Map<string, number>();
  readonly #seen = new Map<string, number>();
  /** The deck just before the turn first touched a slide that already existed (QG-08). */
  readonly #before = new Map<string, Deck>();
  readonly #baseline = new Map<string, Promise<Set<string>>>();

  /** The number of the latest change: what a picture taken now shows. */
  mark(): number {
    return this.#seq;
  }

  /** Whether the turn changed any slide that still counts. */
  get touched(): boolean {
    return this.#changed.size > 0;
  }

  /** A change the turn made to the deck, as the bus reported it. */
  changed(event: Pick<ChangeEvent, 'deck' | 'previous' | 'affected'>): void {
    if (event.affected.slides.length === 0) return;
    this.#seq++;
    for (const slideId of event.affected.slides) {
      const slide = findSlide(event.deck, slideId);
      if (!slide) {
        this.#changed.delete(slideId);
        this.#drawn.delete(slideId);
        this.#seen.delete(slideId);
        this.#before.delete(slideId);
        continue;
      }
      const was = findSlide(event.previous, slideId);
      // A slide that was there before the turn carries what was already wrong with it. The
      // deck is immutable, so keeping the earlier one costs a reference.
      if (!this.#changed.has(slideId) && was) this.#before.set(slideId, event.previous);
      this.#changed.add(slideId);
      // Unchanged parts of the deck keep their identity, so this compares four references.
      if (!was || DRAWN.some((field) => was[field] !== slide[field])) {
        this.#drawn.set(slideId, this.#seq);
      }
    }
  }

  /**
   * Takes slides on as this turn's own, unseen: for a turn that is sent back to what an earlier
   * one left (QG-05) after the watch that saw the earlier one is gone.
   */
  adopt(slideIds: readonly string[]): void {
    if (slideIds.length === 0) return;
    this.#seq++;
    for (const slideId of slideIds) {
      this.#changed.add(slideId);
      this.#drawn.set(slideId, this.#seq);
    }
  }

  /** The agent received a picture of a slide showing its state as of `mark`. */
  looked(slideId: string, mark: number): void {
    this.#seen.set(slideId, Math.max(mark, this.#seen.get(slideId) ?? -1));
  }

  /**
   * Notes the picture a tool call returned, if it returned one of a slide: `slide_render`, or
   * the render that comes back with an HTML write, which counts as a look as long as the slide
   * is not changed afterwards (ADR-019). `mark` is `mark()` from before the call for a tool
   * that only reads, and from after it for one that writes and then renders.
   */
  noteResult(result: ToolResult, mark: number): void {
    if (!result.ok || result.images.length === 0) return;
    const slideId = result.data.slideId;
    if (typeof slideId === 'string') this.looked(slideId, mark);
  }

  /** The findings a slide already had before the turn touched it. */
  #findingsBefore(slideId: string, lint: LintService): Promise<Set<string>> {
    let known = this.#baseline.get(slideId);
    if (!known) {
      const before = this.#before.get(slideId);
      known = before
        ? lint.lint(before, [slideId], 'agent').then(
            (findings) => new Set(findings.filter(holdsTurn).map(findingKey)),
            () => new Set<string>(),
          )
        : Promise.resolve(new Set<string>());
      this.#baseline.set(slideId, known);
    }
    return known;
  }

  /**
   * What stands between the turn and its end, on the deck as it is now. Only slides the agent
   * created or changed in the turn are judged (QG-08), and on a slide that existed before, only
   * findings the turn brought: what was already there is the user's to decide.
   */
  async review(deck: Deck, { lint, canLook }: ReviewOptions): Promise<GateReport> {
    const slides = [...this.#changed].filter((id) => findSlide(deck, id));
    const unseen = canLook
      ? slides.filter((id) => (this.#seen.get(id) ?? -1) < (this.#drawn.get(id) ?? -1))
      : [];
    if (!lint || slides.length === 0) return { unseen, findings: [] };

    let found: LintFinding[];
    try {
      found = await lint.lint(deck, slides, 'agent');
    } catch (error) {
      // A check that cannot run holds nobody: the app's failure is not the agent's to fix.
      console.error('The design check could not lint the turn', error);
      return { unseen, findings: [] };
    }
    const findings: LintFinding[] = [];
    for (const finding of found.filter(holdsTurn)) {
      const before = await this.#findingsBefore(finding.slideId, lint);
      if (!before.has(findingKey(finding))) findings.push(finding);
    }
    return { unseen, findings };
  }
}
