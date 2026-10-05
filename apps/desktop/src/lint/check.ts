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

/** Errors one "fix" may go on to fix after its own: each is one the step before it opened. */
const MAX_FOLLOW_UPS = 4;

const nameOf = ({ slideId, rule, elementIds }: LintFinding) =>
  `${slideId} ${rule} ${elementIds.join(' ')}`;

/** One try at a finding: the finding with the commands of its fix. */
const attemptOf = (finding: LintFinding) => `${nameOf(finding)} ${JSON.stringify(finding.fix)}`;

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

  /**
   * Applies the fix of one finding, as one step to undo. Resolves false when it can no longer
   * run. The fix itself is applied at once, before anything is awaited.
   *
   * A fix changes what the slide measures, and a rule cannot measure: small text set at a
   * readable size is larger than the box that fitted it, and the warning it closed would come
   * back as an error. So the deck is checked again, and an error that the fix opened on the
   * elements of its finding is fixed too, in the same step: the box of that text is made taller
   * where there is room, and the text is shrunk to it where there is none. Errors that were
   * there before are not touched: the user asked for this finding.
   */
  async fix(finding: LintFinding, label: string): Promise<boolean> {
    const { findings: present } = this.state.getState();
    // A fix holds for the deck its finding is of: a finding of an earlier check is not run.
    if (!finding.fix || !this.current || !present.includes(finding)) return false;
    const known = new Set(present.map(nameOf));
    const txId = newId('tx');
    try {
      this.#bus.batch(finding.fix, { txId, label });
    } catch (error) {
      console.error('A fix of the design check did not apply', error);
      return false;
    }
    const tried = new Set<string>();
    for (let followed = 0; followed < MAX_FOLLOW_UPS; followed++) {
      const mine = this.#bus.deck;
      const findings = await this.check();
      // Somebody else changed the deck meanwhile: what is found now is no longer of this fix.
      if (this.#bus.deck !== mine || !this.current) break;
      const opened = findings.find(
        (f) =>
          f.severity === 'error' &&
          f.fix !== undefined &&
          f.slideId === finding.slideId &&
          f.elementIds.some((id) => finding.elementIds.includes(id)) &&
          !known.has(nameOf(f)) &&
          !tried.has(attemptOf(f)),
      );
      if (!opened?.fix) break;
      tried.add(attemptOf(opened));
      try {
        this.#bus.batch(opened.fix, { txId, label });
      } catch (error) {
        console.error('A fix of the design check did not apply', error);
        break;
      }
    }
    return true;
  }

  /**
   * Applies every fix there is for errors and warnings, of the whole deck or of one slide, as
   * one step to undo. A fix changes what the next one would find, so the deck is checked again
   * after each; a fix that did not close its finding is not tried twice. Resolves with the
   * number of fixes applied.
   *
   * What is not tried twice is the fix, not the finding: a finding that was closed and that a
   * later fix opened again (the box that was made to fit its text, before the text was set at
   * a readable size) comes back with another fix, and that one is applied.
   */
  async fixAll(label: string, slideId?: string): Promise<number> {
    const txId = newId('tx');
    const tried = new Set<string>();
    let applied = 0;
    while (applied < MAX_FIXES) {
      const findings = await this.check();
      const next = findings.find(
        (f) => fixable(f) && !tried.has(attemptOf(f)) && (!slideId || f.slideId === slideId),
      );
      if (!next?.fix || !this.current) break;
      tried.add(attemptOf(next));
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
