// Operations the catalogue leaves out on purpose (ADR-007): pure functions that compute
// commands from the catalogue. The editor (WG5-T06) and the Deck API share them.
export {
  alignElements,
  distributeElements,
  groupElements,
  reorderElements,
  type AlignEdge,
  type ArrangeReference,
  type DistributeAxis,
  type ZOrderMove,
} from './arrange';
export {
  cloneElement,
  duplicateElements,
  duplicateSlide,
  type DuplicateElementsOptions,
  type DuplicateSlideOptions,
} from './duplicate';
