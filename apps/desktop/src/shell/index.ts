// What other areas use from the shell. See docs/adr/ADR-008-design-system-and-shell.md.
export {
  PanelId,
  registerAction,
  registerActionPopover,
  registerContextTool,
  registerPanel,
  registerShortcut,
  registerSlideMark,
  registerStageLayer,
  registerStageMenu,
  registerStatusItem,
  type ActionPopoverProps,
  type AiPanelDefinition,
  type ContextToolDefinition,
  type ContextToolProps,
  type PanelDefinition,
  type PanelSlot,
  type ShortcutDefinition,
  type ShortcutSection,
  type SlideMarkDefinition,
  type StageLayerDefinition,
  type StageMenuDefinition,
  type ToolAction,
  type ToolPanelDefinition,
} from './registry';
export { aiKinds, selectionKind, elementKind, type SelectionKind } from './selection';
export { StatusItem } from './StatusBar';
export {
  getEditor,
  setNewDeck,
  useDeck,
  useEditor,
  useFile,
  useSelection,
  whenEditor,
  type Editor,
  type FileState,
} from './editor';
export {
  openAiChat,
  openPanel,
  setAiTab,
  setPanelOpen,
  setZoom,
  useShell,
  type AiTab,
  type ShellState,
} from './store';
export { ask, tell, type DialogAction, type DialogRequest } from './dialogs';
export { fitSlide, STAGE_MARGIN, type SlideFit } from './layout';
export { useElementSize } from './hooks';
export { useAssetResolver } from './assets';
export { focusStage, stageElement, stageSlide } from './stageDom';
export { isWebAddress, openExternal } from './external';
export type { AssetService } from '../document/assets';
