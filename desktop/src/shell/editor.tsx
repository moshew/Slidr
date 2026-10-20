import { createContext, useContext, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import {
  CommandBus,
  createDeck,
  createDeckStore,
  createSelectionStore,
  createSlide,
  refitAfter,
  type ChangeEvent,
  type Deck,
  type DeckState,
  type DeckStore,
  type SelectionState,
  type SelectionStore,
} from '@slidr/model';
import { memoryAssets, workspaceAssets, type AssetService } from '../document/assets';
import { DocumentService } from '../document/documentService';
import { failureKind, type FailureKind } from '../document/failures';
import type { Storage } from '../document/storage';

/** The open document as the shell shows it: title bar, status bar, File menu. */
export interface FileState {
  /** The `.slidr` file, or null for a deck that was never saved. */
  path: string | null;
  /** There are changes that are not in the file. */
  dirty: boolean;
  busy: 'opening' | 'saving' | null;
  /**
   * The window's first document is still on its way (`startDocument`): it has no workspace
   * yet, or what a crash left behind has not been listed. The shell is drawn and takes no input
   * until this is over, so that nothing is typed into a deck that has nowhere to be kept, and
   * the offer to recover comes before any work, not over it.
   */
  starting: boolean;
  /**
   * Why the autosave cannot write, while it cannot (WG13-T03): the changes are in memory alone,
   * and a crash now would lose them. Null again once a write goes through.
   */
  autosaveFailure: FailureKind | null;
}

/**
 * One editing window: the command bus and the stores built on it (ADR-007), and the document
 * service that ties the deck to a file. Other areas reach it with `useEditor()`.
 */
export interface Editor {
  bus: CommandBus;
  deck: DeckStore;
  selection: SelectionStore;
  /** Files and workspaces. Null in a plain browser (Playwright, the Vite page): no Tauri core. */
  document: DocumentService | null;
  /** The document's asset files: in the workspace, or in memory when there is no storage. */
  assets: AssetService;
  /** The storage under the document service; the shell reads the recent files from it. */
  storage: Storage | null;
  file: StoreApi<FileState>;
}

let deckFactory = (lang: string): Deck => createDeck({ lang, slides: [createSlide()] });

/** A new deck, in the language of the UI: one empty slide, unless an area set another start. */
export function newDeck(lang: string): Deck {
  return deckFactory(lang);
}

/** Sets what a new deck starts as: the templates area opens it on the default template (THM-08). */
export function setNewDeck(factory: (lang: string) => Deck): void {
  deckFactory = factory;
}

let current: Editor | null = null;
const waiting: ((editor: Editor) => void)[] = [];

/** Runs once the editor of this window exists: at once when it does, else when it is created. */
export function whenEditor(callback: (editor: Editor) => void): void {
  if (current) callback(current);
  else waiting.push(callback);
}

/**
 * The editor of this window, for code that is not a component: a row A action, a shortcut.
 * Components use `useEditor()`.
 */
export function getEditor(): Editor {
  if (!current) throw new Error('The editor has not been created yet.');
  return current;
}

export function createEditor(options: { lang: string; storage: Storage | null }): Editor {
  const editor = buildEditor(options);
  current = editor;
  for (const callback of waiting.splice(0)) callback(editor);
  return editor;
}

/**
 * The agent moves and resizes elements through the Deck API, which knows nothing of the Stage.
 * After each of its writes the groups around what it changed are fitted to their children again
 * (ARR-01), in the undo step of its turn. Once the change has reached every subscriber, not
 * while it is still on its way to them: a change made from inside a subscriber overtakes it.
 */
function fitAfterAgent(bus: CommandBus, event: ChangeEvent): void {
  const { actor, txId } = event;
  if (event.kind !== 'apply' || actor === 'user' || txId === undefined) return;
  if (refitAfter(event.deck, event.previous, event.affected).length === 0) return;
  queueMicrotask(() => {
    // Another change may have come since: the fit is of the deck as it is now.
    if (bus.undoStack.at(-1)?.txId !== txId) return;
    const fit = refitAfter(bus.deck, event.previous, event.affected);
    if (fit.length > 0) bus.batch(fit, { actor, txId });
  });
}

function buildEditor(options: { lang: string; storage: Storage | null }): Editor {
  const bus = new CommandBus(newDeck(options.lang));
  const file = createStore<FileState>(() => ({
    path: null,
    dirty: false,
    busy: null,
    starting: false,
    autosaveFailure: null,
  }));
  // Created before the subscription below, so `dirty` is current when it runs.
  const document = options.storage
    ? new DocumentService(options.storage, bus, {
        onAutosaveError: (error) => {
          console.error('Autosave failed', error);
          file.setState({ autosaveFailure: failureKind(error) });
        },
        onAutosaved: () => {
          if (file.getState().autosaveFailure) file.setState({ autosaveFailure: null });
        },
      })
    : null;
  bus.subscribe((event) => {
    file.setState({ dirty: document ? document.dirty : event.kind !== 'reset' });
  });
  bus.subscribe((event) => fitAfterAgent(bus, event));
  return {
    bus,
    deck: createDeckStore(bus),
    selection: createSelectionStore(bus),
    document,
    assets: document ? workspaceAssets(document) : memoryAssets(),
    storage: options.storage,
    file,
  };
}

/** Brings the file state in line with the document service after a file operation. */
export function syncFileState(editor: Editor): void {
  const { document } = editor;
  editor.file.setState(
    document ? { path: document.path, dirty: document.dirty, busy: null } : { busy: null },
  );
}

/* ---------------------------------------------------------------- React */

const EditorContext = createContext<Editor | null>(null);

export function EditorProvider({ editor, children }: { editor: Editor; children: ReactNode }) {
  return <EditorContext value={editor}>{children}</EditorContext>;
}

export function useEditor(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('useEditor needs an <EditorProvider>.');
  return editor;
}

/** Reads from the deck store; re-renders when the selected value changes. */
export function useDeck<T>(selector: (state: DeckState) => T): T {
  return useStore(useEditor().deck, selector);
}

export function useSelection<T>(selector: (state: SelectionState) => T): T {
  return useStore(useEditor().selection, selector);
}

export function useFile<T>(selector: (state: FileState) => T): T {
  return useStore(useEditor().file, selector);
}
