import { useMemo, type ComponentType } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { LucideIcon } from '@slidr/ui';
import type { Editor } from './editor';
import type { SelectionKind } from './selection';

/*
 * What other areas plug into the shell, without editing it (PLAN WG3 acceptance):
 *   - panels for the Activity Bar and Tool Panel (SPEC 4.2, 4.3),
 *   - contextual tools for Top Tools row B (SPEC 4.4),
 *   - handlers for the fixed buttons of row A (insert, present, export),
 *   - parts of the Stage's right-click menu, and layers over the Stage,
 *   - keyboard shortcuts.
 * An area registers from its own `src/<area>/register.ts(x)`, which the shell loads at startup.
 */

interface Registered {
  id: string;
  /** Stands in until the real entry registers under the same id, and never replaces it. */
  placeholder?: boolean;
}

interface Registry<T extends Registered> {
  store: StoreApi<{ items: readonly T[] }>;
  /** Adds an entry, or replaces the one with the same id. Returns a function that removes it. */
  register: (item: T) => () => void;
}

function createRegistry<T extends Registered>(): Registry<T> {
  const store = createStore<{ items: readonly T[] }>(() => ({ items: [] }));
  return {
    store,
    register(item) {
      const items = store.getState().items;
      const existing = items.find((i) => i.id === item.id);
      if (existing && !existing.placeholder) {
        if (item.placeholder) return () => {};
        // Two real entries with one id is a mistake, except when a module hot-reloads.
        if (!import.meta.hot) console.warn(`"${item.id}" was registered twice; the last one wins.`);
      }
      store.setState({ items: [...items.filter((i) => i.id !== item.id), item] });
      return () => store.setState({ items: store.getState().items.filter((i) => i !== item) });
    },
  };
}

/* ---------------------------------------------------------------- panels */

/** Where a panel's button sits in the Activity Bar: the AI tools, the others, or the bottom. */
export type PanelSlot = 'ai' | 'tools' | 'footer';

interface PanelBase extends Registered {
  /** An i18n key; `namespace:key` for strings outside the shell's namespace. */
  title: string;
  icon: LucideIcon;
  slot: PanelSlot;
  /** Position within the slot, ascending. */
  order: number;
  /** Shown in the Activity Bar tooltip. The shell handles Ctrl+1 for the AI chat. */
  shortcut?: string;
}

/**
 * The AI tool (SPEC 4.3, ADR-072). The shell draws its frame: the title and the Chat and Actions
 * tabs; the panel supplies what goes in the tabs, including what the chat sees of the selection.
 */
export interface AiPanelDefinition extends PanelBase {
  kind: 'ai';
  chat: ComponentType;
  actions: ComponentType;
}

/** Any other panel: the shell draws the title bar, the panel draws the rest. */
export interface ToolPanelDefinition extends PanelBase {
  kind: 'tool';
  content: ComponentType;
}

export type PanelDefinition = AiPanelDefinition | ToolPanelDefinition;

/**
 * The panel ids the shell refers to: the AI chat of Ctrl+1 and Ctrl+L, and the HTML
 * import that the File menu and the welcome screen lead to.
 */
export const PanelId = {
  ai: 'ai',
  settings: 'settings',
  htmlImport: 'import',
} as const;

const panels = createRegistry<PanelDefinition>();

export const registerPanel = panels.register;

const slotOrder: Record<PanelSlot, number> = { ai: 0, tools: 1, footer: 2 };

/** All panels, in Activity Bar order. */
export function usePanels(): readonly PanelDefinition[] {
  const items = useStore(panels.store, (s) => s.items);
  return useMemo(
    () => [...items].sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot] || a.order - b.order),
    [items],
  );
}

/** A panel by its id, once its area registered it: the shell offers a way to it only then. */
export function usePanel(id: string): PanelDefinition | undefined {
  return useStore(panels.store, (s) => s.items.find((panel) => panel.id === id));
}

/* ---------------------------------------------------------------- Top Tools row B */

export interface ContextToolProps {
  kind: SelectionKind;
}

/** A tool in row B for some kinds of selection (SPEC 4.4), e.g. the font picker for text. */
export interface ContextToolDefinition extends Registered {
  kinds: readonly SelectionKind[];
  /** Tools of one group sit together; space separates groups. */
  group: string;
  /** Position in the row, ascending. */
  order: number;
  render: ComponentType<ContextToolProps>;
}

const contextTools = createRegistry<ContextToolDefinition>();

export const registerContextTool = contextTools.register;

/** The row B tools for a kind of selection, in order, split into groups. */
export function groupContextTools<T extends Omit<ContextToolDefinition, 'render'>>(
  items: readonly T[],
  kind: SelectionKind,
): T[][] {
  const groups: T[][] = [];
  const sorted = items.filter((i) => i.kinds.includes(kind)).sort((a, b) => a.order - b.order);
  for (const tool of sorted) {
    const last = groups.at(-1);
    if (last?.[0]?.group === tool.group) last.push(tool);
    else groups.push([tool]);
  }
  return groups;
}

export function useContextTools(kind: SelectionKind): ContextToolDefinition[][] {
  const items = useStore(contextTools.store, (s) => s.items);
  return useMemo(() => groupContextTools(items, kind), [items, kind]);
}

/* ---------------------------------------------------------------- the Stage's right-click menu */

/**
 * A part of the Stage's right-click menu for some kinds of selection (STG-06): `none` is the
 * slide itself. It draws `ContextMenuItem`s, and sub-menus, of `@slidr/ui`; it may draw none for
 * the element at hand, and its group then takes no room in the menu.
 */
export interface StageMenuDefinition extends Registered {
  kinds: readonly SelectionKind[];
  /** Parts of one group sit together; a line separates groups. */
  group: string;
  /** Position in the menu, ascending. */
  order: number;
  /**
   * A part of the menu of text that is being edited in place: it is drawn for a right click in
   * that text, where the parts about the element (delete, order, lock) are not. Off by default.
   */
  ofEditedText?: boolean;
  render: ComponentType<ContextToolProps>;
}

const stageMenu = createRegistry<StageMenuDefinition>();

export const registerStageMenu = stageMenu.register;

/**
 * The parts of the menu for a kind of selection, in order and in groups; with `ofEditedText`,
 * the parts of the menu of the text that is being edited instead.
 */
export function stageMenuParts<T extends Omit<StageMenuDefinition, 'render'>>(
  items: readonly T[],
  kind: SelectionKind,
  ofEditedText = false,
): T[][] {
  return groupContextTools(
    items.filter((item) => Boolean(item.ofEditedText) === ofEditedText),
    kind,
  );
}

export function useStageMenu(kind: SelectionKind, ofEditedText = false): StageMenuDefinition[][] {
  const items = useStore(stageMenu.store, (s) => s.items);
  return useMemo(() => stageMenuParts(items, kind, ofEditedText), [items, kind, ofEditedText]);
}

/* ---------------------------------------------------------------- Top Tools row A */

/** The buttons of row A that other areas implement. Unhandled, a button is disabled. */
export type ToolAction =
  | 'insert.text'
  | 'insert.image'
  | 'insert.shape'
  | 'insert.line'
  | 'insert.table'
  | 'insert.chart'
  | 'insert.media'
  | 'insert.icon'
  | 'present'
  | 'export';

/** What a row A button opens instead of acting at once, e.g. the shape library. */
export interface ActionPopoverProps {
  /** Closes the popover, after a choice. */
  close: () => void;
}

interface ActionEntry extends Registered {
  id: ToolAction;
  run?: () => void;
  popover?: ComponentType<ActionPopoverProps>;
}

const actions = createRegistry<ActionEntry>();

/** Makes a row A button work. Returns a function that removes the handler. */
export function registerAction(id: ToolAction, run: () => void): () => void {
  return actions.register({ id, run });
}

/**
 * Makes a row A button open a popover under it: the shell draws the popover, the area draws what
 * is in it and calls `close` when a choice was made.
 */
export function registerActionPopover(
  id: ToolAction,
  popover: ComponentType<ActionPopoverProps>,
): () => void {
  return actions.register({ id, popover });
}

/** The handler of a row A button, or undefined while nobody has registered one. */
export function useAction(id: ToolAction): (() => void) | undefined {
  return useStore(actions.store, (s) => s.items.find((a) => a.id === id)?.run);
}

/** The popover of a row A button, when its area registered one. */
export function useActionPopover(id: ToolAction): ComponentType<ActionPopoverProps> | undefined {
  return useStore(actions.store, (s) => s.items.find((a) => a.id === id)?.popover);
}

/* ---------------------------------------------------------------- keyboard shortcuts */

/** The headings of the shortcut map (UI-06), in the order it shows them. */
export const shortcutSections = [
  'file',
  'edit',
  'insert',
  'text',
  'arrange',
  'table',
  'slides',
  'view',
  'ai',
  'present',
] as const;
export type ShortcutSection = (typeof shortcutSections)[number];

/** A keyboard shortcut of some area (SPEC Appendix A). The shell listens; the area acts. */
export interface ShortcutDefinition extends Registered {
  /**
   * Modifiers and one key, joined by `+`: `Ctrl+D`, `Ctrl+Shift+G`, `Ctrl+]`, `T`, `F5`. Letters,
   * digits and brackets are matched by the physical key, so they work on a Hebrew layout too.
   */
  keys: string;
  /** Does it. Return false when there was nothing to act on: the key then goes its usual way. */
  run: (editor: Editor, event: KeyboardEvent) => boolean | void;
  /**
   * Whether it answers while the caret is in text. Off by default: the keys type there.
   *   - `true`: also in a text field and in the slide's text editor.
   *   - `'editor'`: the slide's text editor runs the same command itself, on the key this
   *     shortcut has now (`text/editorKeys.ts`), and acts on its own selection. The shell stays
   *     out of text for it, as for a shortcut without `inText`; the key it can be given is one
   *     that types nothing, as for a shortcut that answers in text.
   */
  inText?: boolean | 'editor';
  /**
   * What it does, as an i18n key (`namespace:key` outside the shell's namespace). The shortcut
   * map lists the shortcuts that have one (UI-06); without it the shortcut works and is not listed.
   */
  label?: string;
  /** The heading of the shortcut map it is listed under; `edit` when not given. */
  section?: ShortcutSection;
}

const shortcuts = createRegistry<ShortcutDefinition>();

export const registerShortcut = shortcuts.register;

/** `Ctrl+Shift+G` and `shift+ctrl+g` are the same shortcut. */
export function normalizeKeys(keys: string): string {
  const parts = keys.split('+').map((part) => part.trim().toLowerCase());
  const key = parts.pop() ?? '';
  return [...['ctrl', 'alt', 'shift'].filter((mod) => parts.includes(mod)), key].join('+');
}

/** The registered shortcuts for a key combination, the latest registration first. */
export function shortcutsFor(keys: string): ShortcutDefinition[] {
  const wanted = normalizeKeys(keys);
  return shortcuts.store
    .getState()
    .items.filter((s) => normalizeKeys(s.keys) === wanted)
    .reverse();
}

/** Every registered shortcut, in the order of registration, for the shortcut map. */
export function useShortcuts(): readonly ShortcutDefinition[] {
  return useStore(shortcuts.store, (s) => s.items);
}

/** A registered shortcut by its id, for a button that does what the key does. */
export function useShortcut(id: string): ShortcutDefinition | undefined {
  return useStore(shortcuts.store, (s) => s.items.find((shortcut) => shortcut.id === id));
}

/* ---------------------------------------------------------------- status bar */

/**
 * A part of the status bar that another area draws (UI-07): the agent's state, the count of
 * design findings. Until its area registers, the shell shows a resting state in its place.
 */
export interface StatusItemDefinition extends Registered {
  id: 'agent' | 'lint';
  render: ComponentType;
}

const statusItems = createRegistry<StatusItemDefinition>();

export const registerStatusItem = statusItems.register;

/** The component an area registered for a part of the status bar, when one did. */
export function useStatusItem(id: StatusItemDefinition['id']): ComponentType | undefined {
  return useStore(statusItems.store, (s) => s.items.find((item) => item.id === id)?.render);
}

/* ---------------------------------------------------------------- marks on the thumbnails */

/**
 * A mark another area puts on the Filmstrip's thumbnails (FLM-04), such as the design check's
 * findings. It draws itself for one slide, or nothing; the Filmstrip puts it beside the slide's number.
 */
export interface SlideMarkDefinition extends Registered {
  render: ComponentType<{ slideId: string }>;
}

const slideMarks = createRegistry<SlideMarkDefinition>();

export const registerSlideMark = slideMarks.register;

export function useSlideMarks(): readonly SlideMarkDefinition[] {
  return useStore(slideMarks.store, (s) => s.items);
}

/* ---------------------------------------------------------------- layers over the Stage */

/**
 * Something another area draws over the Stage region and places there itself, such as the find
 * bar. It is drawn above the slide and outside the Stage's own surface, so the pointer and the
 * keys in it are its own, and a right click on it does not open the Stage's menu.
 */
export interface StageLayerDefinition extends Registered {
  render: ComponentType;
}

const stageLayers = createRegistry<StageLayerDefinition>();

export const registerStageLayer = stageLayers.register;

export function useStageLayers(): readonly StageLayerDefinition[] {
  return useStore(stageLayers.store, (s) => s.items);
}

/** For tests: the registries' stores. */
export const registries = {
  panels: panels.store,
  contextTools: contextTools.store,
  actions: actions.store,
  shortcuts: shortcuts.store,
  statusItems: statusItems.store,
  stageLayers: stageLayers.store,
  stageMenu: stageMenu.store,
  slideMarks: slideMarks.store,
};
