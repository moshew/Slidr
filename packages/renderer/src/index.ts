// SlideRenderer and the element renderers: model -> DOM (SPEC 7, ADR-009).
export { SlideRenderer, ScaledSlide, type SlideRendererProps } from './SlideRenderer';
export type { AssetResolver, ElementSlot, RenderMode, TextSlot } from './context';
export { colorCss, fontStack, themeVariables, themeVariablesCss } from './theme';
export { fillStyle } from './fill';
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
