/**
 * The file layer as the document service sees it. The Rust core implements it (WG1-T07..T09);
 * tests use an in-memory fake. Rust never interprets the deck: it receives and returns
 * `deck.json` as text, and only reads `schemaVersion` and the asset table out of it.
 */

/** A deck unpacked into a working folder in app data (DOC-02). */
export interface Workspace {
  id: string;
  /** Absolute path of the folder; asset files are under `<dir>/assets/`. */
  dir: string;
  /** The `.slidr` file the workspace belongs to; null until the first save. */
  sourcePath: string | null;
}

export interface OpenedDeck {
  workspace: Workspace;
  deckJson: string;
  metaJson: string | null;
}

/** A workspace with unsaved changes left behind by a crash (DOC-03). */
export interface RecoverableWorkspace {
  id: string;
  sourcePath: string | null;
  title: string;
  /** ISO time of the last autosave. */
  autosavedAt: string | null;
}

export interface RecentFile {
  path: string;
  title: string;
  openedAt: string;
  exists: boolean;
}

/** What the content-addressed store knows about a file it took in (SPEC 5.7). */
export interface ImportedAsset {
  /** sha256 of the content. */
  id: string;
  file: string;
  mime: string;
  kind: 'image' | 'svg' | 'video' | 'audio' | 'font' | 'other';
  bytes: number;
  width?: number;
  height?: number;
  /** The original file name, when there was one. */
  name?: string;
}

export interface SavedDeck {
  /** Absolute path of the written file. */
  path: string;
  /** Assets the deck refers to that were not in the workspace, and so are not in the file. */
  missingAssets: string[];
}

export type StorageErrorKind =
  'not_found' | 'invalid_file' | 'invalid_input' | 'io' | 'unknown_workspace' | 'internal';

export class StorageError extends Error {
  readonly kind: StorageErrorKind;

  constructor(kind: StorageErrorKind, message: string) {
    super(message);
    this.name = 'StorageError';
    this.kind = kind;
  }
}

export interface Storage {
  create(): Promise<Workspace>;
  open(path: string): Promise<OpenedDeck>;
  /** Autosave: writes `deck.json` into the workspace and marks it as having unsaved changes. */
  writeDeck(workspaceId: string, deckJson: string, title: string): Promise<void>;
  /** Packs the workspace into a `.slidr` file, atomically (DOC-01). */
  save(workspaceId: string, path: string, deckJson: string, title: string): Promise<SavedDeck>;
  /** Deletes the workspace; also discards a leftover that is not to be recovered. */
  close(workspaceId: string): Promise<void>;
  listRecoverable(): Promise<RecoverableWorkspace[]>;
  recover(workspaceId: string): Promise<OpenedDeck>;
  /** Copies a `.slidr` file aside before it is migrated (DOC-04). Returns the copy's path. */
  backup(path: string, tag: string): Promise<string>;
  importAssetFile(workspaceId: string, path: string): Promise<ImportedAsset>;
  importAssetBytes(workspaceId: string, name: string, bytes: Uint8Array): Promise<ImportedAsset>;
  listRecents(): Promise<RecentFile[]>;
  removeRecent(path: string): Promise<void>;
}
