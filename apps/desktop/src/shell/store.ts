import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { PanelId } from './registry';
import { startsOnWelcome } from './startup';

export type ThemePreference = 'system' | 'light' | 'dark';
export type AiTab = 'chat' | 'actions';

/** The shell's own state: layout, view and appearance. Not part of the document. */
export interface ShellState {
  /** The panel shown in the Tool Panel. */
  activePanel: string;
  /** False when the Tool Panel is collapsed (UI-02); the Activity Bar stays. */
  panelOpen: boolean;
  /** The tab an AI tool shows (SPEC 4.3). One for the three tools: they share a frame. */
  aiTab: AiTab;
  /** Tool Panel width as a share of the window, once the user drags the splitter. */
  panelShare: number | null;
  /** The zoom the user picked: fit to the Stage, or a scale (1 = 100%). */
  zoom: 'fit' | number;
  /** The scale the Stage shows the slide at, for the status bar. Written by the Stage. */
  viewScale: number;
  theme: ThemePreference;
  /** The welcome screen is shown in place of the editor (DOC-05). */
  welcome: boolean;
  /**
   * The welcome screen was opened from the editor, over a document the user was working on: it
   * then offers the way back to that document, which no other way out of it is.
   */
  welcomeBack: boolean;
  /** The shortcut map is open (UI-06). */
  shortcutsOpen: boolean;
}

export const useShell = create<ShellState>()(
  persist(
    (): ShellState => ({
      activePanel: PanelId.ai,
      panelOpen: true,
      aiTab: 'chat',
      panelShare: null,
      zoom: 'fit',
      viewScale: 1,
      theme: 'system',
      welcome: startsOnWelcome(),
      welcomeBack: false,
      shortcutsOpen: false,
    }),
    {
      name: 'slidr.shell',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      // Version 1 had three AI tools, `ai.deck`, `ai.slide` and `ai.object`: one chat now (ADR-072).
      // Version 2 had a panel of the HTML import: its conversation is one of that chat's now.
      // Version 3 saved widths chosen for the former wide default. Start the compact layout at
      // its new default once; later splitter changes continue to persist normally.
      migrate: (stored, version) => {
        const state = (stored ?? {}) as Partial<ShellState>;
        if (version < 2 && state.activePanel?.startsWith('ai.')) state.activePanel = PanelId.ai;
        if (version < 3 && state.activePanel === 'import') state.activePanel = PanelId.ai;
        if (version < 4) state.panelShare = null;
        return state;
      },
      partialize: ({ activePanel, panelOpen, panelShare, theme }) => ({
        activePanel,
        panelOpen,
        panelShare,
        theme,
      }),
    },
  ),
);

/** Shows a panel in the Tool Panel, opening it if it was collapsed; an AI tool, on a tab. */
export function openPanel(id: string, tab?: AiTab): void {
  useShell.setState({ activePanel: id, panelOpen: true, ...(tab ? { aiTab: tab } : {}) });
}

/**
 * Shows the AI chat with the caret in its field (Ctrl+L). The selection stays as it is,
 * also selected text in a box being edited: the chat tells the agent about it with the next
 * message.
 */
export function openAiChat(): void {
  openPanel(PanelId.ai, 'chat');
  // The panel may only be opening: the field is there after the next frame.
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>('[data-testid="chat-input"]')?.focus(),
  );
}

export function setAiTab(aiTab: AiTab): void {
  useShell.setState({ aiTab });
}

/** The Activity Bar click: the open panel collapses, any other one opens. */
export function togglePanel(id: string): void {
  const { activePanel, panelOpen } = useShell.getState();
  useShell.setState(
    activePanel === id && panelOpen ? { panelOpen: false } : { activePanel: id, panelOpen: true },
  );
}

export function setPanelOpen(panelOpen: boolean): void {
  useShell.setState({ panelOpen });
}

export function setPanelShare(panelShare: number | null): void {
  useShell.setState({ panelShare });
}

export function setZoom(zoom: 'fit' | number): void {
  useShell.setState({ zoom });
}

/** The zoom range of the Stage (STG-01). */
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 4;

/** Zooms in or out from the scale the slide is shown at now, by a factor. */
export function zoomBy(factor: number): void {
  const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, useShell.getState().viewScale * factor));
  useShell.setState({ zoom: Math.round(next * 100) / 100 });
}

/**
 * Shows the welcome screen or leaves it. `back`: it is shown over the document that is open,
 * from the File menu, and offers the way back to it.
 */
export function setWelcome(welcome: boolean, back = false): void {
  useShell.setState({ welcome, welcomeBack: welcome && back });
}

export function showShortcuts(shortcutsOpen = true): void {
  useShell.setState({ shortcutsOpen });
}

export function setTheme(theme: ThemePreference): void {
  useShell.setState({ theme });
}

/* ---------------------------------------------------------------- theme */

const darkQuery = '(prefers-color-scheme: dark)';

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia(darkQuery).matches ? 'dark' : 'light';
}

/**
 * Keeps `data-theme` on <html> in step with the preference and, for "system", with the OS
 * (DSN-02). The tokens switch with it; nothing re-renders.
 */
export function syncTheme(root: HTMLElement = document.documentElement): () => void {
  const apply = () => {
    root.dataset.theme = resolveTheme(useShell.getState().theme);
  };
  apply();
  const media = window.matchMedia(darkQuery);
  media.addEventListener('change', apply);
  const unsubscribe = useShell.subscribe((state, previous) => {
    if (state.theme !== previous.theme) apply();
  });
  return () => {
    media.removeEventListener('change', apply);
    unsubscribe();
  };
}
