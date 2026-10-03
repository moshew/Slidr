// What other areas use from the shell. See docs/adr/ADR-008-design-system-and-shell.md.
export {
  PanelId,
  registerAction,
  registerActionPopover,
  registerContextTool,
  registerPanel,
  registerShortcut,
  type ActionPopoverProps,
  type AiPanelDefinition,
  type ContextToolDefinition,
  type ContextToolProps,
  type PanelDefinition,
  type PanelSlot,
  type ShortcutDefinition,
  type ToolAction,
  type ToolPanelDefinition,
} from './registry';
export { selectionKind, elementKind, type SelectionKind } from './selection';
export {
  getEditor,
  useDeck,
  useEditor,
  useFile,
  useSelection,
  type Editor,
  type FileState,
} from './editor';
export { openPanel, setPanelOpen, setZoom, useShell, type ShellState } from './store';
export { ask, tell, type DialogAction, type DialogRequest } from './dialogs';
export { fitSlide, STAGE_MARGIN, type SlideFit } from './layout';
export { useElementSize } from './hooks';
export { useAssetResolver } from './assets';
export { focusStage, stageElement } from './stageDom';
export type { AssetService } from '../document/assets';
