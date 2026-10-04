import { useTranslation } from 'react-i18next';
import { UiProvider } from '@slidr/ui';
import { ActivityBar } from './ActivityBar';
import { DialogHost } from './dialogs';
import { useEditor } from './editor';
import { FilmstripRegion } from './FilmstripRegion';
import { ShortcutMap } from './ShortcutMap';
import { useShellShortcuts } from './shortcuts';
import { StageRegion } from './StageRegion';
import { StatusBar } from './StatusBar';
import { useShell } from './store';
import { TitleBar } from './TitleBar';
import { ToolPanel } from './ToolPanel';
import { TopTools } from './TopTools';
import { Welcome } from './Welcome';

/**
 * The window (SPEC 4.1). In a flex row the first child sits at the inline start, so the AI area
 * (Activity Bar, Tool Panel) is on the right in Hebrew and on the left in English (UI-01, UI-05),
 * and switching the language mirrors everything without a reload.
 *
 *   title bar                                                   36
 *   ┌ Activity Bar 56 ┬ Tool Panel 584 ┬ Top Tools        48 + 44 ┐
 *   │                 │                │ Stage            rest    │
 *   │                 │                │ Filmstrip        132     │
 *   status bar                                                  24
 *
 * Until a document is chosen, the welcome screen stands under the title bar in place of all of
 * it (DOC-05). The editor itself exists from the start; only what draws it waits.
 */
export function Shell() {
  const { i18n } = useTranslation();
  const editor = useEditor();
  const welcome = useShell((s) => s.welcome);
  useShellShortcuts(editor);

  return (
    <UiProvider dir={i18n.dir()}>
      <div data-testid="app-root" className="flex h-full flex-col bg-ui-chrome text-ui-fg">
        <TitleBar />
        {welcome ? (
          <Welcome />
        ) : (
          <>
            <div className="flex min-h-0 flex-1">
              <ActivityBar />
              <ToolPanel />
              <main data-testid="editor" className="flex min-w-0 flex-1 flex-col bg-ui-panel">
                <TopTools />
                <StageRegion />
                <FilmstripRegion />
              </main>
            </div>
            <StatusBar />
          </>
        )}
      </div>
      <ShortcutMap />
      <DialogHost />
    </UiProvider>
  );
}
