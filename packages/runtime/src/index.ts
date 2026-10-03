// Player runtime: scaling, navigation, transitions and animations.
// Vanilla JS, no React: the same code runs in the editor, in present mode and in exported HTML (SPEC 5.6).
export type {
  AnimationStep,
  FlowDirection,
  Size,
  TextBy,
  Transition,
  Trigger,
  Warn,
} from './types';
export { travel, directionOf, slideDirection, type Dir, type Vec } from './direction';
export { schedule, type Group, type Slot, type Timed } from './schedule';
export { animationPresets, type Category } from './presets';
export { transitionTypes, runTransition, type TransitionRun } from './transitions';
export { createTimeline, type SlideTimeline, type TimelineOptions } from './timeline';
export {
  createPlayer,
  type Player,
  type PlayerOptions,
  type PlayerSlide,
  type PlayerState,
} from './player';
export { bindControls, toggleFullscreen, type ControlOptions } from './controls';
export {
  boot,
  readSlides,
  READY_CLASS,
  SLIDE_CLASS,
  STAGE_CLASS,
  VIEWPORT_CLASS,
} from './standalone';
