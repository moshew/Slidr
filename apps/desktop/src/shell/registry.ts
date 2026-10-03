import { useMemo, type ComponentType } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { LucideIcon } from '@slidr/ui';
import type { SelectionKind } from './selection';

/*
 * What other areas plug into the shell, without editing it (PLAN WG3 acceptance):
 *   - panels for the Activity Bar and Tool Panel (SPEC 4.2, 4.3),
 *   - contextual tools for Top Tools row B (SPEC 4.4),
 *   - handlers for the fixed buttons of row A (insert, present, export).
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
  /** Shown in the Activity Bar tooltip. The shell handles Ctrl+1/2/3 for the AI tools. */
  shortcut?: string;
}

/**
 * An AI tool (SPEC 4.3). The shell draws its frame: the title, the scope chip, and the Chat and
 * Actions tabs; the panel supplies what goes in the tabs.
 */
export interface AiPanelDefinition extends PanelBase {
  kind: 'ai';
  /** What the tool works on; the scope chip follows the selection. */
  scope: 'deck' | 'slide' | 'object';
  chat: ComponentType;
  actions: ComponentType;
}

/** Any other panel: the shell draws the title bar, the panel draws the rest. */
export interface ToolPanelDefinition extends PanelBase {
  kind: 'tool';
  content: ComponentType;
}

export type PanelDefinition = AiPanelDefinition | ToolPanelDefinition;

/** The panel ids the shell refers to: the AI tools of Ctrl+1/2/3 and of the "AI" buttons. */
export const PanelId = {
  aiDeck: 'ai.deck',
  aiSlide: 'ai.slide',
  aiObject: 'ai.object',
  settings: 'settings',
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
export function groupContextTools(
  items: readonly ContextToolDefinition[],
  kind: SelectionKind,
): ContextToolDefinition[][] {
  const groups: ContextToolDefinition[][] = [];
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

interface ActionEntry extends Registered {
  id: ToolAction;
  run: () => void;
}

const actions = createRegistry<ActionEntry>();

/** Makes a row A button work. Returns a function that removes the handler. */
export function registerAction(id: ToolAction, run: () => void): () => void {
  return actions.register({ id, run });
}

/** The handler of a row A button, or undefined while nobody has registered one. */
export function useAction(id: ToolAction): (() => void) | undefined {
  return useStore(actions.store, (s) => s.items.find((a) => a.id === id)?.run);
}

/** For tests: the registries' stores. */
export const registries = {
  panels: panels.store,
  contextTools: contextTools.store,
  actions: actions.store,
};
