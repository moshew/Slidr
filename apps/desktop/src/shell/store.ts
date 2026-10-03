import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { PanelId } from './registry';

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
}

export const useShell = create<ShellState>()(
  persist(
    (): ShellState => ({
      activePanel: PanelId.aiDeck,
      panelOpen: true,
      aiTab: 'chat',
      panelShare: null,
      zoom: 'fit',
      viewScale: 1,
      theme: 'system',
    }),
    {
      name: 'slidr.shell',
      version: 1,
      storage: createJSONStorage(() => localStorage),
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
