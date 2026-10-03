/**
 * An HTML import session as the editor holds it (SPEC 13.3, WG9-T17, T18): the file, the
 * isolated page it runs in, and what the app itself measured about every slide that came in.
 * The report the user sees is built from this record and from the deck, not from what the
 * agent says (ADR-005 caught the agent miscounting).
 */
import type { HtmlImportService, ImportedSlide } from '@slidr/agent-tools';
import { createImportPage, type ImportPage } from '@slidr/html-import';
import { allElementIds, createDeck, type Deck } from '@slidr/model';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { createStore } from 'zustand/vanilla';
import { builtinFaces } from '../fonts/builtinFonts.generated';
import type { Editor } from '../shell';
import { runImportJob, type ImportJob } from './protocol';
import { checkCapture, checkPicture, checkText } from './validate';

/** What the app measured about one imported slide. */
export interface SlideRecord {
  faithful: boolean;
  /** The comparison with the source was exact, not through a scale. */
  exact: boolean;
  wholeSlideHtml: boolean;
  editability: number;
  textEditability: number;
  /** Why each region that stayed `html` did. */
  kept: string[];
  /** The size of the captured element in the source, in CSS px. */
  source: { width: number; height: number };
  /** The elements the capture put on the slide, to tell a slide that was rebuilt since. */
  elementIds: string[];
}

export interface ImportState {
  /** The file of the session, as the agent knows it; null before any import. */
  file: string | null;
  /** The isolated page is alive: the import tools work. */
  open: boolean;
  startedAt: number | null;
  /** By slide id. A slide the user or the agent has deleted since simply has no row. */
  records: Record<string, SlideRecord>;
  /** Requests the isolated page was refused. */
  blocked: string[];
}

const EMPTY: ImportState = { file: null, open: false, startedAt: null, records: {}, blocked: [] };

export const importState = createStore<ImportState>(() => EMPTY);

/** How long a capture may take in the page: longer than other jobs, for a heavy slide. */
const CAPTURE_TIMEOUT_MS = 120_000;
const LOAD_TIMEOUT_MS = 60_000;

const KEPT = /^Kept as HTML \(element [^)]*\): /;

function recordOf(slide: ImportedSlide): SlideRecord {
  return {
    faithful: slide.faithful,
    exact: slide.exact,
    wholeSlideHtml: slide.wholeSlideHtml,
    editability: slide.editability,
    textEditability: slide.textEditability,
    kept: slide.notes
      .filter((note) => KEPT.test(note))
      .map((note) => note.replace(KEPT, '').replace(/\.$/, '')),
    source: slide.source,
    elementIds: slide.slide.elements.map((element) => element.id),
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

/* ------------------------------------------------------------ a plain browser page */

/**
 * In a plain browser (the Vite page, Playwright) there is no import window: the file runs in a
 * hidden frame of the editor's own page, with nothing to take pictures with, so every slide is
 * accepted as proposed. For development and end-to-end tests only.
 */
let browserPage: ImportPage | null = null;
let browserSource: ArrayBuffer | null = null;

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

/** The import service of the Deck API (SPEC 13.2): each call is a job for the isolated page. */
export function createImporter(editor: Editor): HtmlImportService {
  const inApp = isTauri();

  async function run(job: ImportJob, timeoutMs?: number): Promise<unknown> {
    if (!importState.getState().open) throw jobError({ kind: 'no_session', message: '' });
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

  // Another document is open: the session was the old deck's.
  editor.bus.subscribe((event) => {
    if (event.kind === 'reset' && importState.getState().file) void endImport(true);
  });

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
    captured(slide) {
      importState.setState((state) => ({
        records: { ...state.records, [slide.slide.id]: recordOf(slide) },
      }));
    },
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
    invoke<unknown>('import_blocked').catch(() => []),
    before.open
      ? invoke<unknown>('import_run_job', { job: { kind: 'refused' } }).catch(() => [])
      : Promise.resolve([]),
  ]);
  const seen = new Set(before.blocked);
  for (const list of [fromPage, fromRust]) {
    if (!Array.isArray(list)) continue;
    for (const address of list) {
      if (typeof address === 'string' && address) seen.add(address.slice(0, MAX_BLOCKED_CHARS));
    }
  }
  const blocked = Array.from(seen).slice(0, MAX_BLOCKED);
  importState.setState({ blocked });
  return blocked;
}

/* ------------------------------------------------------------ starting and ending */

/** The file the user chose: a path in the app, the file itself in a plain browser. */
export type ImportSource = { path: string } | { file: File };

/**
 * Opens an import session on a file for the deck that is open now, and loads the file in the
 * isolated page. Returns the name the agent reads the file under. Throws what went wrong.
 */
export async function openImport(editor: Editor, source: ImportSource): Promise<string> {
  await endImport(true);
  let file: string;
  if ('path' in source) {
    const workspaceId = editor.document?.workspace?.id;
    if (!workspaceId) throw new Error('No document is open to import into.');
    try {
      const opened = await invoke<{ file: string; bytes: number }>('import_open', {
        path: source.path,
        thread: `${editor.bus.deck.id}/import`,
        workspaceId,
      });
      file = opened.file;
    } catch (error) {
      throw jobError(error);
    }
  } else {
    browserSource = await source.file.arrayBuffer();
    file = source.file.name;
  }
  importState.setState({ file, open: true, startedAt: Date.now(), records: {}, blocked: [] });
  try {
    if (isTauri())
      await invoke('import_run_job', { job: { kind: 'load' }, timeoutMs: LOAD_TIMEOUT_MS });
    else await runImportJob(pageInBrowser(editor), { kind: 'load' });
  } catch (error) {
    await endImport(true);
    throw jobError(error);
  }
  return file;
}

/**
 * Closes the isolated page. The record stays for the report unless `forget` is set; the chat
 * goes on as a deck session with the tools that need no page.
 */
export async function endImport(forget = false): Promise<void> {
  const state = importState.getState();
  if (state.open) {
    if (!forget) await refreshBlocked();
    if (isTauri()) await invoke('import_close').catch(() => undefined);
    else browserPage?.dispose();
    browserSource = null;
  }
  importState.setState(forget ? EMPTY : { open: false });
}
