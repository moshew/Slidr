import { lintSlide, type LintFinding, type SlideMeasurements } from '@slidr/lint';
import {
  batchFitted,
  newId,
  slideArchetype,
  type Command,
  type CommandBus,
  type Deck,
  type Slide,
} from '@slidr/model';
import { createStore, type StoreApi } from 'zustand';

/*
 * The user's design check (LNT-03): the findings of every rule on every slide of the open deck,
 * kept up to date as the deck changes, and the fixes of those findings. The status bar reads it;
 * the agent has a lint of its own (`createLintService`).
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

/**
 * What a slide's measurements depend on, but for the assets of the deck (`assetsReach`). The
 * model keeps the identity of what did not change.
 */
type Key = readonly unknown[];
const keyOf = (deck: Deck, slide: Slide): Key => [
  slide,
  deck.theme,
  deck.layouts,
  deck.meta.dir,
  deck.meta.lang,
  deck.size,
];
const same = (a: Key, b: Key) => a.length === b.length && a.every((part, i) => part === b[i]);

type Assets = Deck['assets'];

/**
 * The assets whose records differ between two tables: the ids of those added, removed or changed,
 * or `fonts` when a font is among them. The deck declares all its fonts on every slide, and one
 * that comes or goes may set any text anew.
 */
function changedAssets(before: Assets, after: Assets): ReadonlySet<string> | 'fonts' {
  const changed = new Set<string>();
  for (const id of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[id];
    const is = after[id];
    if (was === is) continue;
    if (was?.kind === 'font' || is?.kind === 'font') return 'fonts';
    changed.add(id);
  }
  return changed;
}

/**
 * Whether a change of these assets reaches a slide: one of them is named in the slide, in its
 * layout or in the theme. An asset is named by its id, anywhere in the data, as for
 * `referencedAssetIds`. The deck's whole table was once part of every slide's key, and a picture
 * put on one slide measured all the others again: on 200 slides, seconds of work.
 */
function assetsReach(deck: Deck, slide: Slide, changed: ReadonlySet<string> | 'fonts'): boolean {
  if (changed === 'fonts') return true;
  if (changed.size === 0) return false;
  const layout = slide.layoutId ? deck.layouts.find((l) => l.id === slide.layoutId) : undefined;
  const data = JSON.stringify([slide, layout, deck.theme]);
  return [...changed].some((id) => data.includes(id));
}

/**
 * What a slide's findings depend on beyond what it is drawn from: the slides around it, of which
 * a rule reads the order and the kinds (L14, slides of one kind in a row). The same for every
 * slide of a deck, and the same while slides are only edited.
 */
const orderOf = (deck: Deck): string =>
  deck.slides
    .map((slide) => `${slide.id}:${slide.hidden ? '-' : (slideArchetype(deck, slide) ?? '')}`)
    .join(' ');

/** Runs when the page is idle, or soon: returns what cancels it. */
function whenIdle(run: () => void): () => void {
  if (typeof requestIdleCallback !== 'function') {
    const timer = setTimeout(run, 0);
    return () => clearTimeout(timer);
  }
  const id = requestIdleCallback(run, { timeout: 2000 });
  return () => cancelIdleCallback(id);
}

/** A new deck's lone empty canvas is a starting point, not a slide to review yet. */
const isStarterCanvas = (deck: Deck, slide: Slide) =>
  deck.slides.length === 1 &&
  slide.elements.length === 0 &&
  !slide.layoutId &&
  !slide.background &&
  !slide.css;

/** Errors one "fix" may go on to fix after its own: each is one the step before it opened. */
const MAX_FOLLOW_UPS = 4;

const nameOf = ({ slideId, rule, elementIds }: LintFinding) =>
  `${slideId} ${rule} ${elementIds.join(' ')}`;

/** One try at a finding: the finding with the commands of its fix. */
const attemptOf = (finding: LintFinding) => `${nameOf(finding)} ${JSON.stringify(finding.fix)}`;

/** Fixing everything at once leaves alone what is only information: a colour may be meant. */
export const fixable = (finding: LintFinding) =>
  Boolean(finding.fix) && finding.severity !== 'info';

export interface CheckOptions {
  /** How long the deck has to rest before it is checked, in ms. */
  rest?: number;
  /**
   * The user is in the middle of something a check would cut into: a gesture on the Stage, or
   * typing. The deck that has rested is checked once this is over, and another rest has passed.
   */
  busy?: () => boolean;
}

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
  readonly #busy: () => boolean;
  /**
   * A slide is measured once for as long as nothing it is drawn from changes, and its findings
   * are found once for as long as neither that nor the order of the slides changes.
   */
  readonly #measured = new Map<
    string,
    {
      key: Key;
      /** The assets the slide was measured with, or a later table that draws it the same. */
      assets: Assets;
      measured: SlideMeasurements;
      found?: { order: string; findings: LintFinding[] };
    }
  >();
  #running: Promise<void> | null = null;
  /** The deck state the last check failed on: it is not tried again until the deck changes. */
  #failedOn: Deck | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  /** Cancels the check that waits for the page to be idle. */
  #idle: (() => void) | undefined;

  constructor(bus: CommandBus, measure: Measure, options: CheckOptions = {}) {
    this.#bus = bus;
    this.#measure = measure;
    this.#rest = options.rest ?? REST_MS;
    this.#busy = options.busy ?? (() => false);
  }

  /**
   * Follows the deck from now on: every change is checked once the deck has rested, the user is
   * not in the middle of a gesture or of typing, and the page is idle. A check draws the slides
   * that changed again, out of sight, and measures them: work a frame of a drag cannot wait for.
   */
  watch(): () => void {
    const cancel = () => {
      clearTimeout(this.#timer);
      this.#idle?.();
      this.#idle = undefined;
    };
    const wait = () => {
      cancel();
      this.#timer = setTimeout(() => {
        if (this.#busy()) return wait();
        this.#idle = whenIdle(() => {
          this.#idle = undefined;
          void this.check();
        });
      }, this.#rest);
    };
    const due = () => {
      // Written only when it changes: every write wakes the status bar, and a drag is a change
      // a frame.
      if (!this.state.getState().pending) this.state.setState({ pending: true });
      wait();
    };
    due();
    const stop = this.#bus.subscribe(due);
    return () => {
      stop();
      cancel();
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
      const order = orderOf(deck);
      /** What changed in the assets since each table the slides were measured with. */
      const changes = new Map<Assets, ReadonlySet<string> | 'fonts'>();
      let drawn = 0;
      for (const slide of deck.slides) {
        // The deck moved on: what would be found is already out of date.
        if (this.#bus.deck !== deck) return;
        // L07 still catches empty slides in a deck. Only the blank canvas of a new,
        // otherwise empty deck has no design to check yet.
        if (isStarterCanvas(deck, slide)) continue;
        const key = keyOf(deck, slide);
        let entry = this.#measured.get(slide.id);
        if (entry && same(entry.key, key) && entry.assets !== deck.assets) {
          let changed = changes.get(entry.assets);
          if (!changed) {
            changed = changedAssets(entry.assets, deck.assets);
            changes.set(entry.assets, changed);
          }
          if (!assetsReach(deck, slide, changed)) entry.assets = deck.assets;
        }
        if (!entry || !same(entry.key, key) || entry.assets !== deck.assets) {
          // Each slide drawn out of sight is a long task: the next one waits for a moment the
          // page has nothing else to do, so a check of many slides does not hold up the pointer.
          if (drawn++ > 0) {
            await new Promise<void>((resolve) => whenIdle(resolve));
            if (this.#bus.deck !== deck) return;
          }
          entry = { key, assets: deck.assets, measured: await this.#measure(deck, slide) };
          this.#measured.set(slide.id, entry);
        }
        if (entry.found?.order !== order)
          entry.found = { order, findings: lintSlide(deck, slide, entry.measured, 'all') };
        findings.push(...entry.found.findings);
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
   * Sends the commands of a fix. A rule fixes the element it found, wherever it is in the tree:
   * the text of a card is made taller, a part of a group is moved. The group around it has to
   * bound it again (ARR-01), so the fit is added to the step of the fix.
   */
  #apply(fix: readonly Command[], txId: string, label: string): void {
    batchFitted(this.#bus, fix, { txId, label });
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
      this.#apply(finding.fix, txId, label);
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
        this.#apply(opened.fix, txId, label);
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
        this.#apply(next.fix, txId, label);
        applied++;
      } catch (error) {
        console.error('A fix of the design check did not apply', error);
      }
    }
    return applied;
  }
}
