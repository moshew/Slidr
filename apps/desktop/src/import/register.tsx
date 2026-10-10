import { createDeckApi, startTurn, type ToolResult } from '@slidr/agent-tools';
import { registerMessages } from '../i18n';
import { getEditor, registerAction, whenEditor } from '../shell';
import { continueImport, importFile, importRestored, importThread, startImport } from './flow';
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
 * HTML import (SPEC ch. 13, WG9-T18): "Import HTML" of the File menu and of the welcome screen
 * asks for the file, and the import is a conversation of the AI chat from its first message on.
 * See docs/adr/ADR-036-html-import.md.
 */

registerMessages('import', { he, en });

registerAction('import', () => void importFile(getEditor()));

// A deck that was imported has its import again when it is opened (IMP-07), and the AI chat
// goes back to its conversation (`importRestored`).
whenEditor((editor) => watchDocuments(editor, () => void importRestored(editor)));

declare global {
  interface Window {
    /** The import session, for scripts that drive the app and for E2E tests. Development only. */
    slidrImport?: {
      start: typeof startImport;
      end: typeof endImport;
      state: typeof importState;
      /** The chat of the session, once a file is being imported. */
      thread(): ReturnType<typeof importThread> | null;
      /** The report the conversation shows, with the refused requests read anew. */
      report(): Promise<ReturnType<typeof buildReport> | null>;
      /** Opens a session on a file with no agent and no message: the page, and the kept source. */
      open: (source: ImportSource) => Promise<string>;
      /** What "continue the import" does: the page again, and the message to the agent. */
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
      return buildReport(importState.getState(), getEditor().bus.deck);
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
