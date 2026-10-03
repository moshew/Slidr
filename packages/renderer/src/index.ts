// SlideRenderer and the element renderers: model -> DOM (SPEC 7, ADR-009).
export { SlideRenderer, ScaledSlide, type SlideRendererProps } from './SlideRenderer';
export type { AssetResolver, CellSlot, ElementSlot, RenderMode, TextSlot } from './context';
export {
  colorCss,
  familyCss,
  fontStack,
  hebrewFace,
  hebrewFaces,
  themeVariables,
  themeVariablesCss,
} from './theme';
export { fillStyle } from './fill';
export {
  cellLook,
  cellTextDefaults,
  tableEdges,
  tableLayout,
  tableStyle,
  tableStyles,
  type CellLook,
  type TableStyle,
} from './tableStyle';
export { presetPath, scalePath, shapePresets, isBoxPreset, type ShapePath } from './geometry';
export { imagePlacement, linePath } from './elements';
export {
  firstStrong,
  listMarkers,
  paragraphDirection,
  paragraphStyle,
  readsAsNumber,
  runStyle,
  MARKER_EM,
  LEVEL_EM,
  type TextDefaults,
} from './text';
export { sanitizeMarkup } from './sanitize';
export { scopeSlideCss } from './css';
export { settle } from './settle';
export { renderSlideOffscreen, type OffscreenOptions, type OffscreenSlide } from './offscreen';
export {
  measureSlide,
  type ElementMeasure,
  type SlideMeasurements,
  type TextMeasure,
  type TextSpanMeasure,
} from './measure';
