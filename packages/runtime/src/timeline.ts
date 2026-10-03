import {
  CHART_BUILD_MIN_MS,
  CHART_BUILD_MS,
  chartNodes,
  cueChart,
  type ChartBuild,
} from './charts';
import { safeEasing, slideDirection, travel, type Dir } from './direction';
import { findPreset, inlinePreset, toKeyframes, type Box, type Preset } from './presets';
import { schedule, type Group } from './schedule';
import { countParts, paragraphsOf, splitText, type Part, type Split } from './text';
import type { AnimationStep, Size, Trigger, Warn } from './types';

/**
 * The animations of one slide (WG8-T01, T03): the timeline as groups that wait for a click, and
 * the state of the slide between them.
 *
 * The runtime never writes to the elements it animates. Everything it does to them is a Web
 * Animation, so `clear()` leaves the DOM as the renderer drew it, and the editor can play a
 * preview on the slide it is editing. The one exception is the text of a word or character
 * animation, which is wrapped while its group plays (see `text.ts`).
 *
 * Between groups the only thing a slide remembers is which targets are hidden: one that waits for
 * its entrance, or one that has left. That set is known for every point of the timeline in
 * advance, so going back a step, or arriving at a slide from the one after it, sets the state
 * directly instead of replaying anything.
 *
 * A chart is the one thing on a slide that animates itself: the runtime tells it when to build,
 * and where it stands before and after (see `charts.ts`).
 */
/** One step's share of a group. A step animated by paragraph has a part for every paragraph. */
export interface TimelinePart {
  stepId: string;
  /** Milliseconds from the start of the group. */
  start: number;
  end: number;
}

export interface TimelineGroup {
  /** Milliseconds. */
  duration: number;
  parts: readonly TimelinePart[];
}

export interface SlideTimeline {
  /** How many groups wait for a click. Group 0, the lead-in, plays by itself. */
  readonly clicks: number;
  /**
   * How the steps fall into groups and when each plays inside its group, for a timeline view. The
   * runtime is the one that knows: it depends on the paragraphs and words of the rendered text.
   * Group 0 is the lead-in, and may be empty.
   */
  readonly groups: readonly TimelineGroup[];
  /** Length of a group in milliseconds. */
  duration: (group: number) => number;
  /** Shows the slide as it is once `done` groups have played: 0 is before the lead-in. */
  apply: (done: number) => void;
  /** Plays a group from the state before it. Resolves when it ends or is cut short. */
  play: (group: number) => Promise<void>;
  /** Brings what is playing to its end. */
  finish: () => void;
  readonly playing: boolean;
  /** Removes everything the timeline did: the slide is as the renderer drew it. */
  clear: () => void;
}

export interface TimelineOptions {
  size: Size;
  onWarn?: Warn | undefined;
}

type Kind = 'entrance' | 'emphasis' | 'exit';

interface Effect {
  step: AnimationStep;
  kind: Kind;
  /** The node whose visibility the effect changes: the element, or one of its paragraphs. */
  target: HTMLElement;
  by: 'self' | 'word' | 'char';
  preset: Preset;
  /** Milliseconds between the starts of consecutive words or characters. */
  stagger: number;
  trigger: Trigger;
  delay: number;
  span: number;
}

/** The whole text never takes longer than this to start, however long it is. */
const MAX_SPREAD = 2400;

/**
 * The delay between consecutive parts. The model has no field for it, so it follows the
 * duration: a fifth of it between words, less between characters.
 */
function staggerOf(by: 'word' | 'char', duration: number, count: number): number {
  const base =
    by === 'word'
      ? Math.min(160, Math.max(40, duration * 0.2))
      : Math.min(60, Math.max(15, duration * 0.06));
  return count > 1 ? Math.min(base, MAX_SPREAD / (count - 1)) : 0;
}

function resolveEffects(root: HTMLElement, steps: readonly AnimationStep[], warn: Warn): Effect[] {
  const elements = new Map<string, HTMLElement>();
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-element-id]'))) {
    elements.set(el.dataset.elementId ?? '', el);
  }
  const effects: Effect[] = [];
  for (const step of steps) {
    const element = elements.get(step.elementId);
    if (!element) {
      warn(`Animation ${step.id}: element ${step.elementId} is not on the slide`);
      continue;
    }
    if (step.category === 'motion') {
      warn(`Animation ${step.id}: motion paths are not supported`);
      continue;
    }
    const kind: Kind = step.category;
    const { preset, known } = findPreset(kind, step.preset);
    if (!known) warn(`Animation ${step.id}: unknown ${kind} preset "${step.preset}"`);
    const base = { step, kind, preset, trigger: step.trigger, delay: step.delay };
    const by = step.textBy ?? 'all';
    if (by === 'paragraph') {
      // Every paragraph is an effect of its own with the step's trigger: a step that starts on
      // a click brings its paragraphs in one click at a time.
      const paragraphs = paragraphsOf(element);
      if (paragraphs.length) {
        for (const target of paragraphs) {
          effects.push({ ...base, target, by: 'self', stagger: 0, span: step.duration });
        }
        continue;
      }
    } else if (by === 'word' || by === 'char') {
      const count = countParts(element, by);
      if (count > 0) {
        const stagger = staggerOf(by, step.duration, count);
        const span = step.duration + stagger * (count - 1);
        effects.push({ ...base, target: element, by, stagger, span });
        continue;
      }
    }
    effects.push({ ...base, target: element, by: 'self', stagger: 0, span: step.duration });
  }
  return effects;
}

/** Whether a target is hidden changes when an entrance starts and when an exit ends. */
interface Turn {
  at: number;
  hidden: boolean;
}

function turnsOf(group: Group, effects: readonly Effect[]): Map<HTMLElement, Turn[]> {
  const turns = new Map<HTMLElement, Turn[]>();
  for (const slot of group.slots) {
    const effect = effects[slot.index] as Effect;
    if (effect.kind === 'emphasis') continue;
    const turn: Turn =
      effect.kind === 'entrance'
        ? { at: slot.start, hidden: false }
        : { at: slot.end, hidden: true };
    const list = turns.get(effect.target);
    if (list) list.push(turn);
    else turns.set(effect.target, [turn]);
  }
  for (const list of turns.values()) list.sort((a, b) => a.at - b.at);
  return turns;
}

/** The hidden targets before the lead-in and after every group. */
function hiddenStates(groups: readonly Group[], effects: readonly Effect[]): Set<HTMLElement>[] {
  const initial = new Set<HTMLElement>();
  const seen = new Set<HTMLElement>();
  for (const effect of effects) {
    if (effect.kind === 'emphasis' || seen.has(effect.target)) continue;
    seen.add(effect.target);
    // An element that enters is not there before; one that only leaves is.
    if (effect.kind === 'entrance') initial.add(effect.target);
  }
  const states = [initial];
  for (const group of groups) {
    const next = new Set(states[states.length - 1]);
    for (const [target, turns] of turnsOf(group, effects)) {
      if ((turns[turns.length - 1] as Turn).hidden) next.add(target);
      else next.delete(target);
    }
    states.push(next);
  }
  return states;
}

/**
 * When each chart of the slide builds: on the first entrance of the element it is in, over the
 * length of that step, or with the lead-in when nothing brings its element in.
 */
function chartBuilds(
  root: HTMLElement,
  groups: readonly Group[],
  effects: readonly Effect[],
): ChartBuild[] {
  return chartNodes(root).map((node) => {
    for (const [group, { slots }] of groups.entries()) {
      for (const slot of slots) {
        const effect = effects[slot.index] as Effect;
        if (effect.kind !== 'entrance' || effect.by !== 'self') continue;
        if (!effect.target.contains(node)) continue;
        const duration = Math.max(effect.step.duration, CHART_BUILD_MIN_MS);
        return { node, group, start: slot.start, duration };
      }
    }
    return { node, group: 0, start: 0, duration: CHART_BUILD_MS };
  });
}

/** The library that draws a chart runs on its own clock: the group ends a little after it. */
const CHART_SLACK_MS = 50;

function hide(node: HTMLElement, from: number, to: number): Animation | undefined {
  if (to <= from) return undefined;
  const hidden = { visibility: ['hidden', 'hidden'] };
  return to === Infinity
    ? node.animate(hidden, { delay: from, duration: 0, fill: 'forwards' })
    : node.animate(hidden, { delay: from, duration: to - from });
}

interface Run {
  group: number;
  animations: Animation[];
  splits: Split[];
  resolve: () => void;
}

export function createTimeline(
  slide: HTMLElement,
  steps: readonly AnimationStep[],
  options: TimelineOptions,
): SlideTimeline {
  const warn = options.onWarn ?? (() => undefined);
  const { size } = options;
  // The slide root the renderer draws carries the direction; `slide` may be a wrapper around it.
  const root = slide.querySelector<HTMLElement>('[data-slide-id]') ?? slide;
  const dir: Dir = slideDirection(slide);
  const effects = resolveEffects(root, steps, warn);
  const groups = schedule(effects);
  const states = hiddenStates(groups, effects);
  const builds = chartBuilds(root, groups, effects);
  /** How long a group lasts, the charts that build in it included. */
  const lengthOf = (index: number): number =>
    builds.reduce(
      (length, build) =>
        build.group === index ? Math.max(length, build.start + build.duration) : length,
      groups[index]?.duration ?? 0,
    );
  const holds = new Map<HTMLElement, Animation>();
  let run: Run | undefined;

  function end(current: Run): void {
    for (const animation of current.animations) animation.cancel();
    // Last split first: a later split may have wrapped text inside an earlier one's spans.
    for (const split of current.splits.reverse()) split.restore();
    current.resolve();
  }

  /** Ends what is playing and lets go of what is hidden. */
  function stop(): void {
    if (run) {
      const current = run;
      run = undefined;
      end(current);
    }
    for (const hold of holds.values()) hold.cancel();
    holds.clear();
  }

  function clear(): void {
    stop();
    for (const build of builds) cueChart(build.node, { state: 'rest' });
  }

  function apply(done: number): void {
    stop();
    const state = states[Math.min(Math.max(done, 0), states.length - 1)] as Set<HTMLElement>;
    for (const node of state) {
      const hold = hide(node, 0, Infinity);
      if (hold) holds.set(node, hold);
    }
    // A chart whose group has played is whole; one whose group is still to come waits.
    for (const build of builds) {
      cueChart(build.node, { state: done > build.group ? 'rest' : 'wait' });
    }
  }

  function start(index: number, group: Group, current: Run): void {
    const rect = root.getBoundingClientRect();
    const scale = rect.width / size.w || 1;
    const boxOf = (node: HTMLElement): Box => {
      const r = node.getBoundingClientRect();
      return {
        left: (r.left - rect.left) / scale,
        top: (r.top - rect.top) / scale,
        right: (r.right - rect.left) / scale,
        bottom: (r.bottom - rect.top) / scale,
      };
    };
    const add = (animation: Animation | undefined) => {
      if (!animation) return;
      // Cancelling rejects `finished`; nobody is waiting for that.
      animation.finished.catch(() => undefined);
      current.animations.push(animation);
    };

    // What is hidden, and when, while the group plays.
    const before = states[index] as Set<HTMLElement>;
    for (const [target, turns] of turnsOf(group, effects)) {
      holds.get(target)?.cancel();
      holds.delete(target);
      let hidden = before.has(target);
      let since = 0;
      for (const turn of turns) {
        if (hidden && !turn.hidden) add(hide(target, since, turn.at));
        if (!hidden && turn.hidden) since = turn.at;
        hidden = turn.hidden;
      }
      if (hidden) add(hide(target, since, Infinity));
    }

    const splits = new Map<string, Split>();
    const keyOf = (effect: Effect) => `${effect.step.elementId}:${effect.by}`;
    const partsOf = (effect: Effect): Part[] => {
      if (effect.by === 'self') return [{ node: effect.target, box: true }];
      // One element is split once per group, however many effects animate its text.
      const key = keyOf(effect);
      let split = splits.get(key);
      if (!split) {
        // Boxes only when a preset cannot do without them: inline spans never move the text.
        const boxes = group.slots.some((slot) => {
          const other = effects[slot.index] as Effect;
          return keyOf(other) === key && other.preset.inline !== undefined;
        });
        split = splitText(effect.target, effect.by, boxes);
        splits.set(key, split);
        current.splits.push(split);
      }
      return split.parts;
    };

    for (const slot of group.slots) {
      const effect = effects[slot.index] as Effect;
      const { step } = effect;
      const split = effect.by !== 'self';
      const parts = partsOf(effect);
      const v = travel(step.direction ?? effect.preset.direction, dir);
      const easing = safeEasing(step.easing);
      // A word waits unseen for its turn, and stays gone once it has left.
      const fill: FillMode =
        split && effect.kind === 'entrance'
          ? 'backwards'
          : split && effect.kind === 'exit'
            ? 'forwards'
            : 'none';
      parts.forEach((part, i) => {
        const own = part.node === effect.target ? getComputedStyle(part.node) : undefined;
        const preset = part.box ? effect.preset : inlinePreset(effect.kind, effect.preset);
        const frames = preset.frames({ v, box: boxOf(part.node), slide: size });
        const keyframes = toKeyframes(frames, {
          box: part.box,
          opacity: own ? Number(own.opacity) : 1,
          filter: own && own.filter !== 'none' ? own.filter : '',
          // Shrunken text is zoomed: a pixel inside it is less than a slide pixel.
          unit: 1 / (part.node.currentCSSZoom || 1),
        });
        add(
          part.node.animate(keyframes, {
            duration: step.duration,
            delay: slot.start + i * effect.stagger,
            easing,
            fill,
          }),
        );
      });
    }

    for (const build of builds) {
      if (build.group !== index) continue;
      const { node, start: delay, duration } = build;
      cueChart(node, { state: 'play', delay, duration });
      // An animation of nothing, as long as the build: the group lasts until the chart is
      // drawn, and ending the group early ends the build with it.
      add(node.animate([], { delay, duration: duration + CHART_SLACK_MS }));
    }
  }

  return {
    clicks: groups.length - 1,
    groups: groups.map((group, index) => ({
      duration: lengthOf(index),
      parts: group.slots.map((slot) => ({
        stepId: (effects[slot.index] as Effect).step.id,
        start: slot.start,
        end: slot.end,
      })),
    })),
    duration: lengthOf,
    apply,
    get playing() {
      return run !== undefined;
    },
    play(index) {
      const group = groups[index];
      apply(index);
      if (!group || (!group.slots.length && !builds.some((build) => build.group === index))) {
        apply(index + 1);
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        const current: Run = { group: index, animations: [], splits: [], resolve };
        run = current;
        start(index, group, current);
        void Promise.allSettled(current.animations.map((a) => a.finished)).then(() => {
          if (run === current) apply(index + 1);
        });
      });
    },
    finish() {
      if (run) apply(run.group + 1);
    },
    clear,
  };
}
