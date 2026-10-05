/**
 * An HTML import session as the editor holds it (SPEC 13.3, WG9-T17, T18): the file, the
 * isolated page it runs in, and what the app itself measured about every slide that came in.
 * The report the user sees is built from this record and from the deck, not from what the
 * agent says (ADR-005 caught the agent miscounting).
 *
 * The record is kept with the deck (`record.ts`, IMP-07), and so is the source file. A deck
 * that is opened again has its import back without its page, and the page is opened again from
 * the kept source when an import tool next needs it (IMP-09).
 */
import type { HtmlImportService, ImportedSlide } from '@slidr/agent-tools';
import { createImportPage, type ImportPage } from '@slidr/html-import';
import { allElementIds, createDeck, type Deck } from '@slidr/model';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { createStore } from 'zustand/vanilla';
import { builtinFaces } from '../fonts/builtinFonts.generated';
import type { Editor } from '../shell';
import { runImportJob, type ImportJob } from './protocol';
import {
  pageRecord,
  parseRecord,
  serializeRecord,
  workspaceRecord,
  type CaptureSource,
  type ImportPhase,
  type ImportRecord,
  type RecordStore,
  type SlideRecord,
} from './record';
import { checkCapture, checkPicture, checkText } from './validate';

export type { CaptureSource, ImportPhase, SlideRecord } from './record';

export interface ImportState {
  /** The file of the session, as the agent knows it; null when the deck is no import. */
  file: string | null;
  /** The deck the session is of. */
  deckId: string | null;
  /** The isolated page is alive. */
  open: boolean;
  /** The deck keeps the source file: a page that was closed can be opened again from it. */
  kept: boolean;
  /**
   * The page is not the one the agent's last call left: it was closed, or loaded again, since.
   * The next turn is told (`progress.ts`); the agent's next call makes it the page it knows.
   */
  stale: boolean;
  startedAt: number | null;
  /** How many slides the agent's plan has (IMP-11); null until it says. */
  planned: number | null;
  /** Where the import stands; `cut` is what the panel offers to continue (IMP-09). */
  phase: ImportPhase;
  /** By slide id. A slide the user or the agent has deleted since simply has no row. */
  records: Record<string, SlideRecord>;
  /** Requests the isolated page was refused. */
  blocked: string[];
}

const EMPTY: ImportState = {
  file: null,
  deckId: null,
  open: false,
  kept: false,
  stale: false,
  startedAt: null,
  planned: null,
  phase: 'idle',
  records: {},
  blocked: [],
};

export const importState = createStore<ImportState>(() => EMPTY);

/** How long a capture may take in the page: longer than other jobs, for a heavy slide. */
const CAPTURE_TIMEOUT_MS = 120_000;
const LOAD_TIMEOUT_MS = 60_000;

const KEPT = /^Kept as HTML \(element [^)]*\): /;

function slideRecord(slide: ImportedSlide, from: CaptureSource | undefined): SlideRecord {
  return {
    faithful: slide.faithful,
    exact: slide.exact,
    wholeSlideHtml: slide.wholeSlideHtml,
    editability: slide.editability,
    textEditability: slide.textEditability,
    kept: slide.notes
      .filter((note) => KEPT.test(note))
      .map((note) => note.replace(KEPT, '').replace(/\.$/, '')),
    source: { width: slide.source.width, height: slide.source.height },
    elementIds: slide.slide.elements.map((element) => element.id),
    ...(from && Object.keys(from).length > 0 ? { from } : {}),
  };
}

/** What the engine needs of the deck to convert for it: no slide, no asset, no title. */
export function sourceDeck(deck: Deck): Deck {
  return createDeck({ id: deck.id, lang: deck.meta.lang, dir: deck.meta.dir, theme: deck.theme });
}

function jobError(error: unknown): Error {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const kind = 'kind' in error ? String(error.kind) : '';
    if (kind === 'no_session') {
      return new Error(
        'The isolated page of the import is closed, so the import tools no longer work here. The slides already captured are in the deck.',
      );
    }
    return new Error(String(error.message));
  }
  return new Error(String(error));
}

/* ------------------------------------------------------------ the record, kept with the deck */

/** Where the session's record is kept, and the text that was last written there. */
let store: RecordStore | null = null;
let written: string | null = null;
let writing: Promise<void> = Promise.resolve();

function recordOf(state: ImportState): ImportRecord | null {
  if (!state.file || !state.deckId) return null;
  return {
    version: 1,
    deckId: state.deckId,
    file: state.file,
    kept: state.kept,
    startedAt: state.startedAt,
    planned: state.planned,
    phase: state.phase,
    records: state.records,
    blocked: state.blocked,
  };
}

/**
 * Writes the record when it differs from what was written. Writes go one after another, so the
 * latest state is the one that stays. Resolves when what is in the state now is on its way to
 * the disk, or there.
 */
function saveRecord(): Promise<void> {
  const record = recordOf(importState.getState());
  const target = store;
  if (!record || !target) return writing;
  const text = serializeRecord(record);
  if (text === written) return writing;
  written = text;
  writing = writing
    .then(() => target.write(text))
    .catch((error: unknown) => {
      // The next change writes again; the deck in memory has everything.
      if (written === text) written = null;
      console.error('The import record could not be kept with the deck', error);
    });
  return writing;
}

importState.subscribe(() => void saveRecord());

/** The record of the document that is open: in its workspace, or with the page. */
function recordStore(editor: Editor): RecordStore | null {
  if (!isTauri()) return pageRecord(editor.bus.deck.id);
  const workspaceId = editor.document?.workspace?.id;
  return workspaceId ? workspaceRecord(workspaceId) : null;
}

/* ------------------------------------------------------------ turns */

/**
 * Goes off when the agent's turn is stopped or over. A capture call that is running takes it
 * when it begins (`import_capture`), so a call that is cut starts no further slide, and a slide
 * the page was still working on stays out of the deck.
 */
let turn = new AbortController();

/** The running turn was stopped, its session ended, or its document went: no more captures. */
export function interruptImport(): void {
  turn.abort();
  turn = new AbortController();
}

function atWork(): void {
  const { file, phase } = importState.getState();
  if (file && phase !== 'working') importState.setState({ phase: 'working' });
}

/**
 * A turn of the import's chat has ended. A turn that ended as the agent meant it to leaves
 * nothing to continue. One that was stopped or failed while the import was at work leaves the
 * import cut; one that was cut over something else (a question about a slide, long after the
 * import) leaves it as it was.
 */
export function turnEnded(completed: boolean): void {
  interruptImport();
  const { file, phase } = importState.getState();
  if (!file) return;
  if (completed) {
    if (phase !== 'idle') importState.setState({ phase: 'idle' });
  } else if (phase === 'working') {
    importState.setState({ phase: 'cut' });
  }
  // What the page was refused while the turn worked goes into the record now: the page may not
  // be there the next time the report is looked at.
  void refreshBlocked().catch(() => undefined);
}

/* ------------------------------------------------------------ a plain browser page */

/**
 * In a plain browser (the Vite page, Playwright) there is no import window: the file runs in a
 * hidden frame of the editor's own page, with nothing to take pictures with, so every slide is
 * accepted as proposed. For development and end-to-end tests only.
 */
let browserPage: ImportPage | null = null;
let browserSource: ArrayBuffer | null = null;
/** What a workspace keeps as `source/import.html`, by the id of the deck: here, in memory. */
const browserKept = new Map<string, { name: string; bytes: ArrayBuffer }>();

function pageInBrowser(editor: Editor): ImportPage {
  if (browserPage) return browserPage;
  const holder = document.createElement('div');
  holder.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none';
  document.body.append(holder);
  const blank = (width: number, height: number) =>
    new Promise<Blob>((resolve, reject) => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width));
      canvas.height = Math.max(1, Math.round(height));
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('The canvas gave no picture.'))),
        'image/png',
      );
    });
  const page = createImportPage({
    source: () =>
      browserSource
        ? Promise.resolve(browserSource)
        : Promise.reject(new Error('No file is being imported.')),
    host: {
      capture: (rect) => blank(rect.width, rect.height),
      storeAsset: (bytes, info) =>
        editor.assets.import(
          new File([bytes], info.name ?? 'imported', { type: info.mime }),
          'import',
        ),
      resolveAsset: (asset) => editor.assets.url(asset),
    },
    appFonts: builtinFaces.map((face) => ({ ...face, url: new URL(face.url, location.href).href })),
    parent: holder,
  });
  browserPage = {
    ...page,
    dispose() {
      page.dispose();
      holder.remove();
      browserPage = null;
    },
  };
  return browserPage;
}

/* ------------------------------------------------------------ the service */

const importers = new WeakMap<Editor, HtmlImportService>();

/**
 * The import service of the Deck API (SPEC 13.2): each call is a job for the isolated page.
 * One for an editor, whoever asks.
 */
export function createImporter(editor: Editor): HtmlImportService {
  let importer = importers.get(editor);
  if (!importer) {
    importer = makeImporter(editor);
    importers.set(editor, importer);
  }
  return importer;
}

function makeImporter(editor: Editor): HtmlImportService {
  const inApp = isTauri();

  async function run(job: ImportJob, timeoutMs?: number): Promise<unknown> {
    const state = importState.getState();
    if (!state.file || state.deckId !== editor.bus.deck.id) {
      throw jobError({ kind: 'no_session', message: '' });
    }
    if (!state.open) {
      // The page was closed with the app, or with the session before. The deck keeps the file:
      // it is loaded again, in a page nothing ran in, as the turn was told it would be.
      if (!state.kept) throw jobError({ kind: 'no_session', message: '' });
      await reopenImport(editor);
    }
    // From here on the page is the one the agent's own calls made it, and the import is at work.
    if (importState.getState().stale) importState.setState({ stale: false });
    atWork();
    if (!inApp) return runImportJob(pageInBrowser(editor), job);
    try {
      return await invoke<unknown>('import_run_job', {
        job,
        ...(timeoutMs ? { timeoutMs } : {}),
      });
    } catch (error) {
      throw jobError(error);
    }
  }

  return {
    async inspect(request) {
      const page = checkText(await run({ kind: 'inspect', request }));
      const blocked = await refreshBlocked();
      if (request.selector || request.js || blocked.length === 0) return page;
      return `Requests the page was refused (it has no network): ${JSON.stringify(blocked.slice(0, 40))}\n\n${page}`;
    },
    evaluate: async (code) => checkText(await run({ kind: 'evaluate', code }), 24_000),
    async screenshot(request) {
      const picture = checkPicture(await run({ kind: 'screenshot', request }));
      return { mimeType: 'image/png', ...picture };
    },
    setViewport: async (size) => checkText(await run({ kind: 'viewport', size }), 400),
    async capture(deck, request) {
      const answer = await run(
        {
          kind: 'capture',
          request: { ...request, deck: sourceDeck(deck), takenIds: [...allElementIds(deck)] },
        },
        CAPTURE_TIMEOUT_MS,
      );
      // The deck may have changed while the page worked: checked against what it is now.
      return checkCapture(answer, editor.bus.deck);
    },
    captured(slide, from) {
      const state = importState.getState();
      // A capture that outlived its session is no part of the record of the deck that is open.
      if (!state.file || state.deckId !== editor.bus.deck.id) return;
      importState.setState({
        records: { ...state.records, [slide.slide.id]: slideRecord(slide, from) },
      });
      // The record first, then the deck (the autosave waits for quiet, and a deck being
      // captured is never quiet). If the app dies between the two, the record names a slide
      // the deck does not have, which reads as "not captured" and is captured again; the other
      // way round the deck would hold a slide nobody can say the source of.
      void saveRecord()
        .then(() => editor.document?.flush())
        .catch(() => undefined);
    },
    planned(total) {
      const state = importState.getState();
      if (state.file && state.planned !== total) importState.setState({ planned: total });
    },
    interruption: () => turn.signal,
  };
}

const MAX_BLOCKED = 200;
const MAX_BLOCKED_CHARS = 300;

/**
 * Reads what the isolated page was refused so far into the session's record. Two lists make
 * it. The page's content policy stops a request before it leaves the page, and the browser
 * reports it to the page: that list comes back through a job, and is text from an untrusted
 * window like everything else from there. What the policy lets through is refused by Rust,
 * which writes it down itself. Neither is lost when the other cannot be read.
 */
export async function refreshBlocked(): Promise<string[]> {
  const before = importState.getState();
  if (!isTauri() || !before.file) return before.blocked;
  const [fromRust, fromPage] = await Promise.all([
    before.open ? invoke<unknown>('import_blocked').catch(() => []) : Promise.resolve([]),
    before.open
      ? invoke<unknown>('import_run_job', { job: { kind: 'refused' } }).catch(() => [])
      : Promise.resolve([]),
  ]);
  // Another document was opened while the lists were read: they are not its.
  if (importState.getState().deckId !== before.deckId) return importState.getState().blocked;
  const seen = new Set(importState.getState().blocked);
  for (const list of [fromPage, fromRust]) {
    if (!Array.isArray(list)) continue;
    for (const address of list) {
      if (typeof address === 'string' && address) seen.add(address.slice(0, MAX_BLOCKED_CHARS));
    }
  }
  const blocked = Array.from(seen).slice(0, MAX_BLOCKED);
  if (blocked.length !== importState.getState().blocked.length) importState.setState({ blocked });
  return blocked;
}

/* ------------------------------------------------------------ starting and ending */

/** The file the user chose: a path in the app, the file itself in a plain browser. */
export type ImportSource = { path: string } | { file: File };

/** The key of the agent's folder for the import of the deck that is open. */
const threadOf = (editor: Editor) => `${editor.bus.deck.id}/import`;

/**
 * Opens an import session on a file for the deck that is open now, and loads the file in the
 * isolated page. The file is kept with the deck from here on (IMP-07). Returns the name the
 * agent reads the file under. Throws what went wrong.
 */
export async function openImport(editor: Editor, source: ImportSource): Promise<string> {
  await endImport(true);
  const deckId = editor.bus.deck.id;
  let file: string;
  if ('path' in source) {
    const workspaceId = editor.document?.workspace?.id;
    if (!workspaceId) throw new Error('No document is open to import into.');
    try {
      const opened = await invoke<{ file: string; bytes: number }>('import_open', {
        path: source.path,
        thread: threadOf(editor),
        workspaceId,
      });
      file = opened.file;
    } catch (error) {
      throw jobError(error);
    }
  } else {
    browserSource = await source.file.arrayBuffer();
    file = source.file.name;
    browserKept.set(deckId, { name: file, bytes: browserSource });
  }
  try {
    if (isTauri())
      await invoke('import_run_job', { job: { kind: 'load' }, timeoutMs: LOAD_TIMEOUT_MS });
    else await runImportJob(pageInBrowser(editor), { kind: 'load' });
  } catch (error) {
    await closePage();
    throw jobError(error);
  }
  if (editor.bus.deck.id !== deckId) {
    await closePage();
    throw new Error('Another document was opened while the file loaded.');
  }
  store = recordStore(editor);
  written = null;
  importState.setState({
    ...EMPTY,
    file,
    deckId,
    open: true,
    kept: true,
    startedAt: Date.now(),
    // The first message asks for the import: the agent is at it from here.
    phase: 'working',
  });
  return file;
}

let reopening: Promise<void> | null = null;

/**
 * Opens the isolated page again on the source the deck keeps (IMP-07, IMP-09), for a session
 * whose page was closed: the deck was opened again, or the app was. The page is new, so whatever
 * the agent's scripts had done to the old one is undone. Throws when it cannot be opened.
 */
export function reopenImport(editor: Editor): Promise<void> {
  reopening ??= reopen(editor).finally(() => {
    reopening = null;
  });
  return reopening;
}

async function reopen(editor: Editor): Promise<void> {
  const { file, deckId, open } = importState.getState();
  if (open) return;
  if (!file || !deckId || deckId !== editor.bus.deck.id) {
    throw jobError({ kind: 'no_session', message: '' });
  }
  try {
    if (isTauri()) {
      const workspaceId = editor.document?.workspace?.id;
      if (!workspaceId) throw new Error('No document is open.');
      await invoke('import_reopen', { file, thread: threadOf(editor), workspaceId });
      await invoke('import_run_job', { job: { kind: 'load' }, timeoutMs: LOAD_TIMEOUT_MS });
    } else {
      const kept = browserKept.get(deckId);
      if (!kept) throw new Error('This deck keeps no source file of an import.');
      browserSource = kept.bytes;
      await runImportJob(pageInBrowser(editor), { kind: 'load' });
    }
  } catch (error) {
    await closePage();
    throw jobError(error);
  }
  // Another document was opened while the file loaded: the page is not its.
  if (importState.getState().deckId !== deckId || editor.bus.deck.id !== deckId) {
    await closePage();
    throw jobError({ kind: 'no_session', message: '' });
  }
  importState.setState({ open: true, stale: true });
}

/**
 * Gives a deck that was imported its import back: the record its file keeps becomes the
 * session's, without a page. An import that was at work when the record was last written was
 * cut by whatever closed the app. True when the open deck has a record.
 */
export async function restoreImport(editor: Editor): Promise<boolean> {
  const deckId = editor.bus.deck.id;
  const target = recordStore(editor);
  if (!target) return false;
  let text: string | null;
  try {
    text = await target.read();
  } catch {
    return false;
  }
  const record = parseRecord(text, deckId);
  // Another document was opened, or an import was started, while the record was read.
  if (!record || editor.bus.deck.id !== deckId || importState.getState().file) return false;
  store = target;
  written = text;
  importState.setState({
    file: record.file,
    deckId,
    open: false,
    kept: record.kept && (isTauri() || browserKept.has(deckId)),
    stale: true,
    startedAt: record.startedAt,
    planned: record.planned,
    phase: record.phase === 'working' ? 'cut' : record.phase,
    records: record.records,
    blocked: record.blocked,
  });
  return true;
}

async function closePage(): Promise<void> {
  if (isTauri()) await invoke('import_close').catch(() => undefined);
  else browserPage?.dispose();
  browserSource = null;
}

/**
 * Closes the isolated page. The record stays for the report, and the page can be opened again
 * from the kept source, unless `forget` is set: then the session is let go of at once, as when
 * its document is no longer the open one.
 */
export async function endImport(forget = false): Promise<void> {
  const state = importState.getState();
  if (forget) {
    interruptImport();
    store = null;
    written = null;
    importState.setState(EMPTY, true);
    if (state.open) await closePage();
    return;
  }
  if (!state.open) return;
  await refreshBlocked();
  await closePage();
  importState.setState({ open: false, stale: true });
}

/**
 * Follows the documents of the window: a session ends with its document, and a deck that was
 * imported gets its import back when it is opened (`restored`).
 */
export function watchDocuments(editor: Editor, restored: (state: ImportState) => void): void {
  editor.bus.subscribe((event) => {
    if (event.kind !== 'reset') return;
    void endImport(true)
      .then(() => restoreImport(editor))
      .then((found) => {
        if (found) restored(importState.getState());
      });
  });
}

/** The kept source of the open deck's import, for a copy outside the app. */
export async function exportSource(editor: Editor, path: string): Promise<void> {
  const workspaceId = editor.document?.workspace?.id;
  if (!workspaceId) throw new Error('No document is open.');
  try {
    await invoke('import_source_export', { workspaceId, path });
  } catch (error) {
    throw jobError(error);
  }
}

/**
 * Takes the source file out of the deck: a file saved from now on does not carry the file the
 * deck was imported from. A page that is open goes on working; once it is closed it cannot be
 * opened again, and an import that was cut can no longer be continued from the file.
 */
export async function removeSource(editor: Editor): Promise<void> {
  const { file, deckId } = importState.getState();
  if (!file || deckId !== editor.bus.deck.id) return;
  if (isTauri()) {
    const workspaceId = editor.document?.workspace?.id;
    if (!workspaceId) throw new Error('No document is open.');
    try {
      await invoke('import_source_remove', { workspaceId });
    } catch (error) {
      throw jobError(error);
    }
  } else {
    browserKept.delete(deckId);
  }
  if (importState.getState().deckId === deckId) importState.setState({ kept: false });
}

/** In a plain browser: the kept source as a file to download. Null when the deck keeps none. */
export function pageSource(deckId: string): File | null {
  const kept = browserKept.get(deckId);
  return kept ? new File([kept.bytes], kept.name, { type: 'text/html' }) : null;
}
