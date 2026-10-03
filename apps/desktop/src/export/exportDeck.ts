import { exportHtml, type ExportResult } from '@slidr/html-export';
import type { AssetMeta, Deck } from '@slidr/model';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import type { Editor } from '../shell';

/*
 * Exporting the open deck to one HTML file (WG9-T12, SPEC 12): what the dialog's choices mean,
 * the export itself, and where the file goes. In the app the file is written by the Rust command
 * `export_write_file`, to the place the user picks in the save dialog; in a plain browser (the
 * Vite page, Playwright) it is a download.
 */

/** The choices of EXP-08 that mean something today. */
export interface ExportChoices {
  /** Positions in the deck from 1, both included; null for the whole deck. */
  range: { from: number; to: number } | null;
  /** False leaves the transitions and the animations out. */
  animations: boolean;
}

export interface ExportPlan {
  /** The slides that go into the file, in the order of the deck. */
  slideIds: string[];
  /** Hidden slides the range holds: they are left out, and the dialog says so. */
  hidden: number;
}

/** What a choice of slides comes to. Hidden slides are never exported (ADR-021). */
export function planExport(deck: Deck, range: ExportChoices['range']): ExportPlan {
  const from = range ? Math.min(range.from, range.to) : 1;
  const to = range ? Math.max(range.from, range.to) : deck.slides.length;
  const within = deck.slides.slice(Math.max(from, 1) - 1, Math.max(to, 0));
  return {
    slideIds: within.filter((slide) => !slide.hidden).map((slide) => slide.id),
    hidden: within.filter((slide) => slide.hidden).length,
  };
}

/** The characters Windows does not take in a file name, and control characters. */
// eslint-disable-next-line no-control-regex
const UNSAFE = /[<>:"/\\|?*\x00-\x1f]/g;

/** The name an export is offered under: the document's, else the deck's title, else `fallback`. */
export function exportFileName(path: string | null, title: string, fallback: string): string {
  const fromPath = path
    ?.split(/[\\/]/)
    .at(-1)
    ?.replace(/\.slidr$/i, '');
  const name = (fromPath || title).replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
  return `${name || fallback}.html`;
}

/** A size as a person reads it: `820 B`, `41 kB`, `2.4 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 999_500) return `${Math.round(bytes / 1000)} kB`;
  const mb = bytes / 1_000_000;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

const LEFT_TO_RIGHT_ISOLATE = String.fromCodePoint(0x2066);
const POP_ISOLATE = String.fromCodePoint(0x2069);

/**
 * A size, a path or a file name inside a Hebrew sentence: read left to right, and kept apart from
 * the words around it, so a number does not jump to the far side of its unit.
 */
export const ltr = (text: string): string => `${LEFT_TO_RIGHT_ISOLATE}${text}${POP_ISOLATE}`;

/** The family a face belongs to: a Hebrew-only face is registered under a name of its own. */
export const fontFamilyName = (family: string): string => family.replace(/::\w+$/, '');

/** Where an export goes: a file the user chose, or a download when there is no file system. */
export type Destination = { kind: 'file'; path: string } | { kind: 'download'; name: string };

/** Asks where to save. Undefined when the user cancelled the save dialog. */
export async function chooseDestination(
  name: string,
  filterName: string,
): Promise<Destination | undefined> {
  if (!isTauri()) return { kind: 'download', name };
  const chosen = await saveDialog({
    defaultPath: name,
    filters: [{ name: filterName, extensions: ['html'] }],
  });
  if (!chosen) return undefined;
  return { kind: 'file', path: /\.html?$/i.test(chosen) ? chosen : `${chosen}.html` };
}

/** The deck as one HTML file. The assets are read from where the renderer loads them. */
export function exportDeck(
  editor: Editor,
  deck: Deck,
  choices: ExportChoices,
): Promise<ExportResult> {
  const loadAsset = async (asset: AssetMeta): Promise<Blob | undefined> => {
    const url = editor.assets.url(asset);
    if (!url) return undefined;
    const response = await fetch(url);
    return response.ok ? response.blob() : undefined;
  };
  return exportHtml(deck, {
    loadAsset,
    slideIds: planExport(deck, choices.range).slideIds,
    animations: choices.animations,
  });
}

/** Writes the file out. Rejects with the reason when it could not be written. */
export async function writeExport(destination: Destination, html: string): Promise<void> {
  if (destination.kind === 'file') {
    // The bytes go as the raw request body; the path travels as a header (see `commands.rs`).
    await invoke('export_write_file', new TextEncoder().encode(html), {
      headers: { 'x-file-path': encodeURIComponent(destination.path) },
    });
    return;
  }
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = destination.name;
  document.body.append(link);
  link.click();
  link.remove();
  // After the browser has taken the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const reason = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === 'object' && error !== null && 'message' in error
      ? String(error.message)
      : String(error);

/** How an export ended: with a file, or at the step that failed. */
export type Outcome =
  | { ok: true; result: ExportResult; destination: Destination; seconds: number }
  | { ok: false; step: 'export' | 'save'; message: string };

/** Exports the deck and writes the file to a destination already chosen. */
export async function exportTo(
  editor: Editor,
  deck: Deck,
  choices: ExportChoices,
  destination: Destination,
): Promise<Outcome> {
  const started = performance.now();
  let result: ExportResult;
  try {
    result = await exportDeck(editor, deck, choices);
  } catch (error) {
    console.error('Export failed', error);
    return { ok: false, step: 'export', message: reason(error) };
  }
  try {
    await writeExport(destination, result.html);
  } catch (error) {
    console.error('The exported file was not written', error);
    return { ok: false, step: 'save', message: reason(error) };
  }
  return { ok: true, result, destination, seconds: (performance.now() - started) / 1000 };
}
