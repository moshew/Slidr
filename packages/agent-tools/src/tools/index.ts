import type { ToolDef } from '../tool';
import { animationSet, chartSet, tableSet, textSet } from './content';
import { deckApplyOps, themeUpdate, uiNavigate } from './deck';
import { elementAdd, elementDelete, elementsArrange, elementUpdate } from './elements';
import { outlinePropose } from './outline';
import { deckGetOutline, deckGetTheme, elementGet, selectionGet, slideGet } from './read';
import {
  deckLint,
  deckRenderContactSheet,
  elementConvert,
  iconSearch,
  imageEdit,
  imageGenerate,
  imageProcess,
  slideCreate,
  slideCreateFromHtml,
  slideLint,
  slideRender,
  slideReplaceFromHtml,
  stockSearch,
  templateApply,
  templateCreate,
  templateSave,
  uiPresentOptions,
} from './services';
import { slideDelete, slideDuplicate, slidesReorder, slideUpdate } from './slides';

/** The catalogue of SPEC 11.4, in its order. */
export const deckTools: readonly ToolDef[] = [
  deckGetOutline,
  deckGetTheme,
  slideGet,
  elementGet,
  slideRender,
  deckRenderContactSheet,
  selectionGet,
  slideCreate,
  slideCreateFromHtml,
  slideReplaceFromHtml,
  slideUpdate,
  slideDelete,
  slideDuplicate,
  slidesReorder,
  elementAdd,
  elementUpdate,
  elementDelete,
  elementsArrange,
  textSet,
  tableSet,
  chartSet,
  animationSet,
  elementConvert,
  themeUpdate,
  templateApply,
  templateCreate,
  templateSave,
  deckApplyOps,
  imageGenerate,
  imageEdit,
  imageProcess,
  stockSearch,
  iconSearch,
  slideLint,
  deckLint,
  uiPresentOptions,
  uiNavigate,
  outlinePropose,
];
