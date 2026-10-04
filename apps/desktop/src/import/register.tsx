import { FileInput } from '@slidr/ui/icons';
import { agentOf } from '../ai/runtime';
import { registerMessages } from '../i18n';
import { getEditor, registerPanel } from '../shell';
import { startImport } from './flow';
import { ImportPanel } from './ImportPanel';
import { en, he } from './messages';
import { buildReport } from './report';
import { endImport, importState, refreshBlocked } from './session';

/*
 * HTML import (SPEC ch. 13, WG9-T18): a panel of the Activity Bar. The shell's File menu and its
 * welcome screen lead to it by the panel's id. See docs/adr/ADR-036-html-import.md.
 */

registerMessages('import', { he, en });

registerPanel({
  id: 'import',
  kind: 'tool',
  slot: 'tools',
  order: 90,
  title: 'import:panel',
  icon: FileInput,
  content: ImportPanel,
});

declare global {
  interface Window {
    /** The import session, for scripts that drive the app and for E2E tests. Development only. */
    slidrImport?: {
      start: typeof startImport;
      end: typeof endImport;
      state: typeof importState;
      /** The chat of the session, once a file is being imported. */
      thread(): ReturnType<ReturnType<typeof agentOf>['thread']> | null;
      /** The report the panel shows, with the refused requests read anew. */
      report(): Promise<ReturnType<typeof buildReport> | null>;
    };
  }
}

if (import.meta.env.DEV) {
  const thread = () => {
    const { file } = importState.getState();
    return file ? agentOf(getEditor()).thread({ kind: 'import', file }) : null;
  };
  window.slidrImport = {
    start: startImport,
    end: endImport,
    state: importState,
    thread,
    async report() {
      const chat = thread();
      if (!chat) return null;
      await refreshBlocked();
      return buildReport(
        importState.getState(),
        getEditor().bus.deck,
        chat.store.getState().entries,
      );
    },
  };
}
