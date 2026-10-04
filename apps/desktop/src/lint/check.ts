import { lintSlide, type LintFinding, type SlideMeasurements } from '@slidr/lint';
import { newId, type CommandBus, type Deck, type Slide } from '@slidr/model';
import { createStore, type StoreApi } from 'zustand';

/*
 * The user's design check (LNT-03): the findings of every rule on every slide of the open deck,
 * kept up to date as the deck changes, and the fixes of those findings. The panel and the
 * status bar read it; the agent has a lint of its own (`createLintService`).
 */

export interface CheckState {
  /** The findings of the whole deck, in the order of its slides. */
  findings: readonly LintFinding[];
  /** The deck state the findings are of. A fix holds for that deck only. */
  deck: Deck | null;
  /** A check is running or due: the findings are of an earlier state of the deck. */
  pending: boolean;
  /** The last check could not run. */
  failed: boolean;
}

export type Measure = (deck: Deck, slide: Slide) => Promise<SlideMeasurements>;

/** How long the deck has to rest before it is checked: a drag and a burst of typing are one. */
const REST_MS = 500;
/** Fixes one "fix all" may apply: each is followed by a check, and none may loop. */
const MAX_FIXES = 200;

/** What a slide's measurements depend on. The model keeps the identity of what did not change. */
type Key = readonly unknown[];
const keyOf = (deck: Deck, slide: Slide): Key => [
  slide,
  deck.theme,
  deck.layouts,
  deck.assets,
  deck.meta.dir,
  deck.meta.lang,
  deck.size,
];
const same = (a: Key, b: Key) => a.every((part, i) => part === b[i]);

const nameOf = ({ slideId, rule, elementIds }: LintFinding) =>
  `${slideId} ${rule} ${elementIds.join(' ')}`;

/** Fixing everything at once leaves alone what is only information: a colour may be meant. */
export const fixable = (finding: LintFinding) =>
  Boolean(finding.fix) && finding.severity !== 'info';

export class DesignCheck {
  readonly state: StoreApi<CheckState> = createStore<CheckState>(() => ({
    findings: [],
    deck: null,
    pending: true,
    failed: false,
  }));
  readonly #bus: CommandBus;
  readonly #measure: Measure;
  readonly #rest: number;
  /** A slide is measured once for as long as nothing it is drawn from changes. */
  readonly #measured = new Map<string, { key: Key; measured: SlideMeasurements }>();
  #running: Promise<void> | null = null;
  /** The deck state the last check failed on: it is not tried again until the deck changes. */
  #failedOn: Deck | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;

  constructor(bus: CommandBus, measure: Measure, options: { rest?: number } = {}) {
    this.#bus = bus;
    this.#measure = measure;
    this.#rest = options.rest ?? REST_MS;
  }

  /** Follows the deck from now on: every change is checked once the deck has rested. */
  watch(): () => void {
    const due = () => {
      this.state.setState({ pending: true });
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => void this.check(), this.#rest);
    };
    due();
    const stop = this.#bus.subscribe(due);
    return () => {
      stop();
      clearTimeout(this.#timer);
    };
  }

  /** Whether the findings are of the deck as it is now, so that their fixes may run. */
  get current(): boolean {
    return this.state.getState().deck === this.#bus.deck;
  }

  /** Checks the deck as it is now; resolves with its findings once they are of that deck. */
  async check(): Promise<readonly LintFinding[]> {
    for (;;) {
      if (this.#running) await this.#running;
      const now = this.#bus.deck;
      const { deck, findings } = this.state.getState();
      if (deck === now || this.#failedOn === now) return findings;
      this.#running ??= this.#run(now).finally(() => {
        this.#running = null;
      });
    }
  }

  async #run(deck: Deck): Promise<void> {
    this.state.setState({ pending: true, failed: false });
    try {
      const findings: LintFinding[] = [];
      for (const slide of deck.slides) {
        // The deck moved on: what would be found is already out of date.
        if (this.#bus.deck !== deck) return;
        const key = keyOf(deck, slide);
        let entry = this.#measured.get(slide.id);
        if (!entry || !same(entry.key, key)) {
          entry = { key, measured: await this.#measure(deck, slide) };
          this.#measured.set(slide.id, entry);
        }
        findings.push(...lintSlide(deck, slide, entry.measured, 'all'));
      }
      const kept = new Set(deck.slides.map((slide) => slide.id));
      for (const id of this.#measured.keys()) if (!kept.has(id)) this.#measured.delete(id);
      this.state.setState({ findings, deck, pending: this.#bus.deck !== deck });
    } catch (error) {
      console.error('The design check could not run', error);
      this.#failedOn = deck;
      this.state.setState({ pending: false, failed: true, deck: null });
    }
  }

  /** Applies the fix of one finding, as one step to undo. False when it can no longer run. */
  fix(finding: LintFinding, label: string): boolean {
    if (!finding.fix || !this.current) return false;
    try {
      this.#bus.batch(finding.fix, { label });
      return true;
    } catch (error) {
      console.error('A fix of the design check did not apply', error);
      return false;
    }
  }

  /**
   * Applies every fix there is for errors and warnings, of the whole deck or of one slide, as
   * one step to undo. A fix changes what the next one would find, so the deck is checked again
   * after each; a finding that its fix did not close is not tried twice. Resolves with the
   * number of fixes applied.
   */
  async fixAll(label: string, slideId?: string): Promise<number> {
    const txId = newId('tx');
    const tried = new Set<string>();
    let applied = 0;
    while (applied < MAX_FIXES) {
      const findings = await this.check();
      const next = findings.find(
        (f) => fixable(f) && !tried.has(nameOf(f)) && (!slideId || f.slideId === slideId),
      );
      if (!next?.fix || !this.current) break;
      tried.add(nameOf(next));
      try {
        this.#bus.batch(next.fix, { txId, label });
        applied++;
      } catch (error) {
        console.error('A fix of the design check did not apply', error);
      }
    }
    return applied;
  }
}
