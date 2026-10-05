import { createDeckApi, startTurn, type ToolResult } from '@slidr/agent-tools';
import { FileInput } from '@slidr/ui/icons';
import { registerMessages } from '../i18n';
import { getEditor, openPanel, PanelId, registerPanel, whenEditor } from '../shell';
import { continueImport, importThread, startImport } from './flow';
import { ImportPanel } from './ImportPanel';
import { en, he } from './messages';
import { importBrief } from './progress';
import { buildReport } from './report';
import {
  createImporter,
  endImport,
  importState,
  openImport,
  refreshBlocked,
  reopenImport,
  turnEnded,
  watchDocuments,
  type ImportSource,
} from './session';

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

// A deck that was imported has its import again when it is opened (IMP-07). One whose import
// was cut is shown with the panel open, where going on with it is offered (IMP-09): the user
// who comes back after a crash should not have to know where to look.
whenEditor((editor) =>
  watchDocuments(editor, (state) => {
    if (state.phase === 'cut') openPanel(PanelId.htmlImport);
  }),
);

declare global {
  interface Window {
    /** The import session, for scripts that drive the app and for E2E tests. Development only. */
    slidrImport?: {
      start: typeof startImport;
      end: typeof endImport;
      state: typeof importState;
      /** The chat of the session, once a file is being imported. */
      thread(): ReturnType<typeof importThread> | null;
      /** The report the panel shows, with the refused requests read anew. */
      report(): Promise<ReturnType<typeof buildReport> | null>;
      /** Opens a session on a file with no agent and no message: the page, and the kept source. */
      open: (source: ImportSource) => Promise<string>;
      /** What the panel's "continue" does: the page again, and the message to the agent. */
      resume: () => Promise<void>;
      /** Opens the isolated page again on the source the deck keeps. */
      reopen: () => Promise<void>;
      /** What the next turn of the chat would be told about the import so far. */
      brief(fresh?: boolean): string;
      /**
       * Runs a tool of an import session as the app's Deck API does, in a turn of its own and
       * with no agent: for scripts that prove what a capture leaves behind.
       */
      call(name: string, input: unknown): Promise<ToolResult>;
      /** Ends the turn of `call` as a chat's turn ends: completed, or cut. */
      turnEnded: typeof turnEnded;
    };
  }
}

if (import.meta.env.DEV) {
  const file = () => importState.getState().file;
  const thread = () => {
    const name = file();
    return name ? importThread(getEditor(), name) : null;
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
    open: (source) => openImport(getEditor(), source),
    resume: () => continueImport(getEditor()),
    reopen: () => reopenImport(getEditor()),
    brief: (fresh = false) => importBrief(importState.getState(), getEditor().bus.deck, fresh),
    call(name, input) {
      const editor = getEditor();
      const api = createDeckApi(editor.bus, { importer: createImporter(editor) });
      const scope = { kind: 'import', file: file() ?? '' } as const;
      return api.call(startTurn('dev', scope), name, input);
    },
    turnEnded,
  };
}
