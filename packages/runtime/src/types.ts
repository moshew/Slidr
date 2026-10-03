/**
 * The data the runtime plays. These are the shapes of `AnimationStep` and `Transition` in
 * `@slidr/model` (SPEC 5.6), repeated here so that the runtime depends on nothing: the same code
 * is bundled into an exported file, where there is no model.
 */

/** `start` and `end` follow the reading direction of the slide. */
export type FlowDirection = 'up' | 'down' | 'start' | 'end';

export type Trigger = 'onClick' | 'withPrevious' | 'afterPrevious';

export type TextBy = 'all' | 'paragraph' | 'word' | 'char';

export interface AnimationStep {
  id: string;
  elementId: string;
  trigger: Trigger;
  category: 'entrance' | 'emphasis' | 'exit' | 'motion';
  preset: string;
  /** The way the element, or the edge of a wipe, travels. */
  direction?: FlowDirection | undefined;
  /** Milliseconds. */
  duration: number;
  delay: number;
  /** A CSS easing function. */
  easing: string;
  textBy?: TextBy | undefined;
}

/** How a slide comes in (`type`, `direction`, `duration`, `easing`) and when it is left (`advance`). */
export interface Transition {
  type: string;
  /** The way the slides travel. */
  direction?: FlowDirection | undefined;
  duration: number;
  easing: string;
  advance: { onClick: boolean; afterMs?: number | undefined };
}

export interface Size {
  w: number;
  h: number;
}

export type Warn = (message: string) => void;
