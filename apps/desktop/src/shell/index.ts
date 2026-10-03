// What other areas use from the shell. See docs/adr/ADR-008-design-system-and-shell.md.
export {
  PanelId,
  registerAction,
  registerContextTool,
  registerPanel,
  type AiPanelDefinition,
  type ContextToolDefinition,
  type ContextToolProps,
  type PanelDefinition,
  type PanelSlot,
  type ToolAction,
  type ToolPanelDefinition,
} from './registry';
export { selectionKind, elementKind, type SelectionKind } from './selection';
export { useDeck, useEditor, useFile, useSelection, type Editor, type FileState } from './editor';
export { openPanel, setPanelOpen, setZoom, useShell, type ShellState } from './store';
export { ask, tell, type DialogAction, type DialogRequest } from './dialogs';
export { fitSlide, STAGE_MARGIN, type SlideFit } from './layout';
export { useElementSize } from './hooks';
