// The template engine (SPEC 5.5, 9.3; ADR-023): what a template is, layouts for both directions,
// slides from layouts, and switching a deck to a template. Pure functions over the model: like
// `compose` there, they compute commands and change nothing. The built-in templates are WG7-T04.
export { Template, layoutsFor } from './template';
export { mirrorElement, mirrorLayout } from './mirror';
export {
  createSlide,
  fillLayout,
  type CreatedSlide,
  type CreateSlideRequest,
  type LayoutContent,
  type RoleFill,
} from './createSlide';
export {
  applyTemplate,
  changeDirection,
  deckFromTemplate,
  layoutAssets,
  type DeckFromTemplateOptions,
} from './deck';
export { matchLayout, relayout } from './relayout';
export {
  draftTemplate,
  layoutFromSlide,
  sampleDeckOf,
  themeFrom,
  type Draft,
  type DraftInput,
  type DrawnBox,
  type DrawnLayout,
  type LayoutFromSlide,
} from './draft';
