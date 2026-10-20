import { newId, type AnimationStep, type Transition } from '@slidr/model';
import { attr, child, children, descendants, intAttr, type XmlElement } from '../xml';

/*
 * A slide's transition and the main sequence of its animations, as the model's: PowerPoint's
 * presets as the runtime's presets that look like them, a step's trigger from the kind of its
 * node, its duration from what it animates.
 */

const SIDE: Record<string, Transition['direction']> = { u: 'up', d: 'down' };

/** A side of DrawingML as the model's direction: `start` and `end` turn with the deck. */
function directionOf(dir: string | undefined, rtl: boolean): Transition['direction'] | undefined {
  if (!dir) return undefined;
  if (SIDE[dir]) return SIDE[dir];
  if (dir === 'l') return rtl ? 'end' : 'start';
  if (dir === 'r') return rtl ? 'start' : 'end';
  return undefined;
}

const TRANSITIONS: Record<string, string> = {
  fade: 'fade',
  push: 'push',
  wipe: 'wipe',
  cover: 'cover',
  pull: 'reveal',
  zoom: 'zoom',
  split: 'split',
  circle: 'iris',
  dissolve: 'dissolve',
  wheel: 'rotate',
  cut: 'none',
  prism: 'cube',
  flip: 'flip',
  reveal: 'reveal',
  ferris: 'rotate',
  flash: 'flash',
};

/**
 * The transition of a slide. `transition` is the element the file holds; in an
 * `mc:AlternateContent` the choice says the exact duration (`p14:dur`) and the fallback the
 * effect PowerPoint 2007 would show.
 */
export function readTransition(
  element: XmlElement | undefined,
  rtl: boolean,
  warn: (detail: string) => void,
): Transition | undefined {
  if (!element) return undefined;
  let transition = element;
  let duration: number | undefined;
  if (element.name === 'mc:AlternateContent') {
    const choice = child(child(element, 'mc:Choice'), 'p:transition');
    const fallback = child(child(element, 'mc:Fallback'), 'p:transition');
    duration = intAttr(choice, 'p14:dur');
    // The newer effect when it is one this knows; else the one it falls back to.
    const newer = children(choice)[0];
    const known = newer && TRANSITIONS[newer.name.split(':')[1] ?? ''];
    transition = (known ? choice : fallback) ?? choice ?? fallback ?? element;
  }
  if (transition.name !== 'p:transition') return undefined;
  duration ??= intAttr(transition, 'p14:dur');
  const spd = attr(transition, 'spd') ?? 'fast';
  duration ??= spd === 'slow' ? 1000 : spd === 'med' ? 750 : 500;
  const effect = children(transition).find(
    (c) => !c.name.startsWith('p:snd') && c.name !== 'p:sndAc' && c.name !== 'p:extLst',
  );
  let type = 'none';
  let direction: Transition['direction'];
  if (effect) {
    const name = effect.name.split(':')[1] ?? '';
    const mapped = TRANSITIONS[name];
    if (mapped) type = mapped;
    else {
      type = 'fade';
      warn(name);
    }
    if (name === 'fade' && attr(effect, 'thruBlk') === '1') type = 'flash';
    direction = directionOf(attr(effect, 'dir'), rtl);
  }
  const advClick = attr(transition, 'advClick');
  const advTm = intAttr(transition, 'advTm');
  if (type === 'none' && advTm === undefined && advClick !== '0') return undefined;
  return {
    type,
    ...(direction ? { direction } : {}),
    duration,
    easing: 'ease-in-out',
    advance: {
      onClick: advClick !== '0' && advClick !== 'false',
      ...(advTm !== undefined ? { afterMs: advTm } : {}),
    },
  };
}

const ENTRANCES: Record<number, string> = {
  1: 'appear',
  2: 'flyIn',
  3: 'wipe',
  10: 'fade',
  12: 'wipe',
  16: 'wipe',
  17: 'wipe',
  18: 'wipe',
  21: 'rotateIn',
  22: 'wipe',
  23: 'zoom',
  26: 'pop',
  31: 'rotateIn',
  37: 'rise',
  42: 'rise',
  47: 'fade',
  49: 'dropIn',
  53: 'zoom',
  55: 'zoom',
};
const EXITS: Record<number, string> = {
  1: 'disappear',
  2: 'flyOut',
  10: 'fade',
  22: 'wipe',
  23: 'zoom',
  42: 'sink',
  47: 'fade',
  53: 'zoom',
  55: 'zoom',
};
const EMPHASES: Record<number, string> = {
  6: 'growShrink',
  8: 'spin',
  9: 'flash',
  14: 'flicker',
  26: 'pulse',
  32: 'wiggle',
  35: 'bounce',
};

/** The direction a "Fly In" or a "Wipe" of PowerPoint moves, from the side its subtype names. */
function subtypeDirection(
  subtype: number | undefined,
  rtl: boolean,
  entrance: boolean,
): AnimationStep['direction'] {
  // 1 from the top, 2 from the right, 4 from the bottom, 8 from the left.
  const from = subtype === 1 ? 'top' : subtype === 2 ? 'right' : subtype === 8 ? 'left' : 'bottom';
  const toward = entrance
    ? { top: 'down', bottom: 'up', left: 'right', right: 'left' }[from]
    : { top: 'up', bottom: 'down', left: 'left', right: 'right' }[from];
  if (toward === 'up' || toward === 'down') return toward;
  return (toward === 'left') !== rtl ? 'start' : 'end';
}

/** The steps of the main sequence, with each target a shape id of the slide. */
export function readTiming(
  timing: XmlElement | undefined,
  elementOf: (spid: string) => string | undefined,
  rtl: boolean,
  warn: (detail: string) => void,
): AnimationStep[] {
  if (!timing) return [];
  const main = descendants(timing, 'p:cTn').find((c) => attr(c, 'nodeType') === 'mainSeq');
  if (!main) return [];
  const steps: AnimationStep[] = [];
  for (const effect of descendants(main, 'p:cTn')) {
    const presetClass = attr(effect, 'presetClass');
    if (!presetClass) continue;
    const target = descendants(effect, 'p:spTgt')[0];
    const elementId = elementOf(attr(target, 'spid') ?? '');
    if (!elementId) continue;
    const presetID = intAttr(effect, 'presetID') ?? 0;
    const subtype = intAttr(effect, 'presetSubtype');
    const category =
      presetClass === 'entr'
        ? 'entrance'
        : presetClass === 'exit'
          ? 'exit'
          : presetClass === 'emph'
            ? 'emphasis'
            : 'motion';
    if (category === 'motion' || presetClass === 'mediacall' || presetClass === 'verb') {
      warn(presetClass);
      continue;
    }
    const table = category === 'entrance' ? ENTRANCES : category === 'exit' ? EXITS : EMPHASES;
    let preset = table[presetID];
    if (!preset) {
      preset = category === 'entrance' ? 'fade' : category === 'exit' ? 'fade' : 'pulse';
      warn(`${presetClass}:${presetID}`);
    }
    const nodeType = attr(effect, 'nodeType');
    const trigger =
      nodeType === 'clickEffect'
        ? 'onClick'
        : nodeType === 'afterEffect'
          ? 'afterPrevious'
          : 'withPrevious';
    // How long it runs: the longest of what it animates.
    const durations = descendants(effect, 'p:cTn')
      .map((c) => Number(attr(c, 'dur')))
      .filter((d) => Number.isFinite(d) && d > 1);
    const duration = durations.length ? Math.max(...durations) : 500;
    const delay = Number(attr(child(child(effect, 'p:stCondLst'), 'p:cond'), 'delay')) || 0;
    const moves = preset === 'flyIn' || preset === 'flyOut' || preset === 'wipe';
    steps.push({
      id: newId('a'),
      elementId,
      trigger,
      category,
      preset,
      ...(moves ? { direction: subtypeDirection(subtype, rtl, category === 'entrance') } : {}),
      duration,
      delay: Math.max(0, delay),
      easing: 'ease-out',
    });
  }
  // A sequence that starts with no click starts with the slide: its first step follows it.
  return steps;
}
