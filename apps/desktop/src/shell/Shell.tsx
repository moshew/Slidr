import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { UiProvider } from '@slidr/ui';
import { ActivityBar } from './ActivityBar';
import { DialogHost } from './dialogs';
import { useEditor, useFile } from './editor';
import { installExternalLinks } from './external';
import { FilmstripRegion } from './FilmstripRegion';
import { ShortcutMap } from './ShortcutMap';
import { useShellShortcuts } from './shortcuts';
import { StageRegion } from './StageRegion';
import { StatusBar } from './StatusBar';
import { useShell } from './store';
import { TitleBar } from './TitleBar';
import { ToolPanel } from './ToolPanel';
import { Welcome } from './Welcome';

/**
 * The window (SPEC 4.1). In a flex row the first child sits at the inline start, so the AI area
 * (Activity Bar, Tool Panel) is on the right in Hebrew and on the left in English (UI-01, UI-05),
 * and switching the language mirrors everything without a reload.
 *
 *   title bar + document actions                                56
 *   ┌ Activity Bar 76 ┬ Tool Panel 584 ┬ Floating tools       80 ┐
 *   │                 │                │ Stage                    │
 *   │                 │                │ Filmstrip        132     │
 *   status bar + zoom                                           32
 *
 * Until a document is chosen, the welcome screen stands under the title bar in place of all of
 * it (DOC-05). The editor itself exists from the start; only what draws it waits.
 *
 * While the window's first document is still on its way (`FileState.starting`), everything
 * under the title bar is drawn and takes no input: the deck has no workspace to be kept in yet,
 * and the offer to recover what a crash left has not been made. It is a few tens of
 * milliseconds, and seconds on a busy machine. The title bar and the dialogs stay live.
 */
export function Shell() {
  const { i18n } = useTranslation();
  const editor = useEditor();
  const welcome = useShell((s) => s.welcome);
  const starting = useFile((s) => s.starting);
  useShellShortcuts(editor);
  // A link to the web opens in the browser of the system, not in this window.
  useEffect(() => installExternalLinks(), []);

  return (
    <UiProvider dir={i18n.dir()}>
      <div data-testid="app-root" className="flex h-full flex-col bg-ui-chrome text-ui-fg">
        <TitleBar />
        {/* No box of its own: what is inside is laid out as it was. */}
        <div
          data-testid="app-body"
          className="contents"
          inert={starting}
          aria-busy={starting || undefined}
        >
          {welcome ? (
            <Welcome />
          ) : (
            <>
              <div className="flex min-h-0 flex-1">
                <ActivityBar />
                <ToolPanel />
                <main data-testid="editor" className="flex min-w-0 flex-1 flex-col bg-ui-panel">
                  <StageRegion />
                  <FilmstripRegion />
                </main>
              </div>
              <StatusBar />
            </>
          )}
        </div>
      </div>
      <ShortcutMap />
      <DialogHost />
    </UiProvider>
  );
}
