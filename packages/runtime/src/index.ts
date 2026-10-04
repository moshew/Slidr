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
export { animationPresets, describePreset, type Category, type PresetInfo } from './presets';
export { transitionTypes, transitionTurns, runTransition, type TransitionRun } from './transitions';
export {
  createTimeline,
  type SlideTimeline,
  type TimelineGroup,
  type TimelineOptions,
  type TimelinePart,
} from './timeline';
export {
  createPlayer,
  type Player,
  type PlayerOptions,
  type PlayerSlide,
  type PlayerState,
} from './player';
export { bindControls, toggleFullscreen, type ControlOptions } from './controls';
export {
  bindClip,
  clipSettings,
  CLIP_ATTRIBUTE,
  CLIP_AUTOPLAY,
  CLIP_END,
  CLIP_LOOP,
  CLIP_START,
  CLIP_STILL,
  CLIP_TOGGLE_ATTRIBUTE,
  CLIP_TOGGLE_SELECTOR,
  CLIP_VOLUME,
  type Clip,
  type ClipSettings,
} from './media';
export {
  CHART_BUILD_MS,
  CHART_EVENT,
  CHART_SELECTOR,
  CHART_STILL,
  type ChartBuild,
  type ChartCue,
} from './charts';
export {
  boot,
  readSlides,
  READY_CLASS,
  SLIDE_CLASS,
  STAGE_CLASS,
  VIEWPORT_CLASS,
} from './standalone';
