/**
 * The names of the ready-made animations and transitions, apart from the code that plays them.
 * A picker, the agent's `animation_set` tool and its prompt need the names and nothing of the
 * DOM, so this module imports nothing: `@slidr/runtime/names` compiles without the DOM library.
 * `presets.ts` and `transitions.ts` are typed by these lists, so a name without an implementation,
 * or an implementation without a name, does not compile.
 */
export const entranceNames = [
  'appear',
  'fade',
  'flyIn',
  'rise',
  'zoom',
  'pop',
  'wipe',
  'blur',
] as const;

export const emphasisNames = ['pulse', 'spin', 'wiggle', 'shake', 'bounce', 'flash'] as const;

export const exitNames = [
  'disappear',
  'fade',
  'flyOut',
  'sink',
  'zoom',
  'pop',
  'wipe',
  'blur',
] as const;

/** `none` shows the next slide at once; the others are played. */
export const transitionNames = [
  'none',
  'fade',
  'push',
  'cover',
  'reveal',
  'wipe',
  'zoom',
  'flip',
] as const;

export type Category = 'entrance' | 'emphasis' | 'exit';

/** The names of the presets, for a picker and for the agent's prompt. */
export const animationPresets: Record<Category, readonly string[]> = {
  entrance: entranceNames,
  emphasis: emphasisNames,
  exit: exitNames,
};

/** The names of the transitions, for a picker and for the agent's prompt. */
export const transitionTypes: readonly string[] = transitionNames;
