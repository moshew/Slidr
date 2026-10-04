import { exportHtml, type ExportResult } from '@slidr/html-export';
import { referencedAssetIds, type AssetMeta, type Deck } from '@slidr/model';
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
  /** Where video and audio go: inside the file, or in a folder beside it (MED-05). */
  media: 'inside' | 'beside';
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

/* ---------------------------------------------------------------- video and audio (MED-05) */

/**
 * Media that adds more than this to the file gets a warning: a file past the size most mail
 * services take is hard to send, and slow to open.
 */
export const LARGE_MEDIA_BYTES = 25_000_000;

/**
 * Media that would add more than this cannot go inside the file at all. The whole file is one
 * string in the webview while it is built, and a string has a largest size; well before it the
 * export takes memory several times the size of the media.
 */
export const MEDIA_INSIDE_LIMIT_BYTES = 300_000_000;

/** What bytes add to a file that carries them inside: a data URI is four characters for three. */
export const embeddedSize = (bytes: number): number => Math.ceil(bytes / 3) * 4;

export interface MediaPlan {
  /** The video and audio the exported slides use. */
  assets: AssetMeta[];
  /** Their size as files. */
  bytes: number;
  /** What they would add to the file, inside it. */
  inFile: number;
  /** Inside the file they would make it large enough to warn about. */
  large: boolean;
  /** Too large to go inside the file. */
  tooLarge: boolean;
}

/** The video and audio of the slides an export writes, and what they weigh. */
export function planMedia(deck: Deck, slideIds: readonly string[]): MediaPlan {
  const chosen = new Set(slideIds);
  const used = referencedAssetIds({ ...deck, slides: deck.slides.filter((s) => chosen.has(s.id)) });
  const assets = Object.values(deck.assets).filter(
    (asset) => (asset.kind === 'video' || asset.kind === 'audio') && used.has(asset.id),
  );
  const bytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  const inFile = embeddedSize(bytes);
  return {
    assets,
    bytes,
    inFile,
    large: inFile > LARGE_MEDIA_BYTES,
    tooLarge: inFile > MEDIA_INSIDE_LIMIT_BYTES,
  };
}

/**
 * The name of the media folder of an exported file: the file's name without `.html`, and
 * `_media`. In the app the folder is made by Rust, which derives the same name from the path
 * (`media_folder_name` in `commands.rs`) and says what it is; this is for a plain browser.
 */
export function mediaFolderName(fileName: string): string {
  const name = fileName.split(/[\\/]/).at(-1) ?? fileName;
  return `${name.replace(/\.html?$/i, '')}_media`;
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

/** An asset's bytes, from where the renderer loads it; undefined when the file is not at hand. */
async function assetBlob(editor: Editor, asset: AssetMeta): Promise<Blob | undefined> {
  const url = editor.assets.url(asset);
  if (!url) return undefined;
  const response = await fetch(url);
  return response.ok ? response.blob() : undefined;
}

/**
 * The deck as one HTML file. The assets are read from where the renderer loads them. With
 * `mediaFolder` the video and audio are not read: the file refers to them in that folder.
 */
export function exportDeck(
  editor: Editor,
  deck: Deck,
  choices: ExportChoices,
  mediaFolder?: string,
): Promise<ExportResult> {
  return exportHtml(deck, {
    loadAsset: (asset) => assetBlob(editor, asset),
    slideIds: planExport(deck, choices.range).slideIds,
    animations: choices.animations,
    ...(mediaFolder === undefined ? {} : { mediaFolder }),
  });
}

/** Hands a file to the browser as a download. */
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // After the browser has taken the download.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
  download(new Blob([html], { type: 'text/html' }), destination.name);
}

/** The media folder of an export: its name, and the files that could not be put in it. */
interface PlacedMedia {
  folder: string;
  /** File names of assets that are not at hand. */
  missing: string[];
}

/** What `export_copy_media` answers (see `commands.rs`). */
interface CopiedMedia {
  folder: string;
  files: { file: string; bytes: number }[];
  missing: string[];
}

/**
 * Puts the video and audio of an export in the folder beside the file (MED-05).
 *
 * In the app Rust copies them from the workspace: the webview says which file the export is and
 * which assets go with it, and never reads or names a path for them. Rust derives the folder
 * from the path of the file and says what it is called.
 *
 * A plain browser has no folder to write to: each file is a download of its own, and the report
 * says in which folder they belong.
 */
async function placeMedia(
  editor: Editor,
  destination: Destination,
  media: readonly AssetMeta[],
): Promise<PlacedMedia> {
  if (destination.kind === 'file') {
    const workspaceId = editor.document?.workspace?.id;
    if (!workspaceId) throw new Error('The document has no workspace to copy media from.');
    const copied = await invoke<CopiedMedia>('export_copy_media', {
      workspaceId,
      path: destination.path,
      files: media.map((asset) => asset.file),
    });
    return { folder: copied.folder, missing: copied.missing };
  }
  const missing: string[] = [];
  for (const asset of media) {
    const blob = await assetBlob(editor, asset).catch(() => undefined);
    if (blob) download(blob, asset.file);
    else missing.push(asset.file);
  }
  return { folder: mediaFolderName(destination.name), missing };
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
  | { ok: false; step: 'export' | 'media' | 'save'; message: string };

/**
 * Exports the deck and writes the file to a destination already chosen. With the media beside
 * the file, the media is put in its folder first: a file is never written that points at media
 * which could not be copied.
 */
export async function exportTo(
  editor: Editor,
  deck: Deck,
  choices: ExportChoices,
  destination: Destination,
): Promise<Outcome> {
  const started = performance.now();
  const { slideIds } = planExport(deck, choices.range);
  const media = choices.media === 'beside' ? planMedia(deck, slideIds).assets : [];
  let placed: PlacedMedia | undefined;
  if (media.length > 0) {
    try {
      placed = await placeMedia(editor, destination, media);
    } catch (error) {
      console.error('The media of the export was not copied', error);
      return { ok: false, step: 'media', message: reason(error) };
    }
  }
  let result: ExportResult;
  try {
    result = await exportDeck(editor, deck, choices, placed?.folder);
  } catch (error) {
    console.error('Export failed', error);
    return { ok: false, step: 'export', message: reason(error) };
  }
  if (placed?.missing.length) {
    // What is not at hand is said, as it is for an asset that could not be read into the file.
    const missing = new Set(placed.missing);
    for (const asset of media.filter((a) => missing.has(a.file))) {
      const subject = asset.name ?? asset.file;
      result.warnings.push({
        code: 'asset-unreadable',
        subject,
        message: `Asset ${subject} could not be read`,
      });
    }
    result.assets = result.assets.filter((a) => a.file === undefined || !missing.has(a.file));
  }
  try {
    await writeExport(destination, result.html);
  } catch (error) {
    console.error('The exported file was not written', error);
    return { ok: false, step: 'save', message: reason(error) };
  }
  return { ok: true, result, destination, seconds: (performance.now() - started) / 1000 };
}
