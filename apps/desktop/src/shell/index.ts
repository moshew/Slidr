// What other areas use from the shell. See docs/adr/ADR-008-design-system-and-shell.md.
export {
  PanelId,
  registerAction,
  registerActionPopover,
  registerContextTool,
  registerImporter,
  registerPanel,
  registerShortcut,
  registerSlideMark,
  registerStageLayer,
  registerStageMenu,
  registerStatusItem,
  type ActionPopoverProps,
  type ContextToolDefinition,
  type ContextToolProps,
  type FileImporter,
  type PanelDefinition,
  type PanelSlot,
  type ShortcutDefinition,
  type ShortcutSection,
  type SlideMarkDefinition,
  type StageLayerDefinition,
  type StageMenuDefinition,
  type ToolAction,
} from './registry';
export { selectionKind, elementKind, elementDisplayKind, type SelectionKind } from './selection';
export { StatusItem } from './StatusBar';
export { PanelActions } from './ToolPanel';
export {
  EditorProvider,
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
  openSettings,
  setPanelOpen,
  setSettingsPage,
  setWelcome,
  setZoom,
  useShell,
  type ShellState,
} from './store';
export { ask, tell, type DialogAction, type DialogRequest } from './dialogs';
export { fitSlide, STAGE_MARGIN, type SlideFit } from './layout';
export { reveal, scrollerOf, useElementSize } from './hooks';
export { useAssetResolver } from './assets';
export {
  focusStage,
  registerKeyboardHome,
  returnKeyboard,
  stageElement,
  stageSlide,
} from './stageDom';
export { toolClosed } from './toolFocus';
export { keysNow } from './userKeys';
export { isWebAddress, openExternal } from './external';
export type { AssetService } from '../document/assets';
