/**
 * Stock photos as the webview sees them (GEN-08, ADR-051). Rust implements the contract in
 * `src-tauri/src/stock/`; `tauriStock` is the IPC client; in a plain browser `memoryStock`
 * stands in for it.
 *
 * The shapes mirror the Rust serde output exactly: fields camelCase, enum values snake_case.
 * `src-tauri/src/stock/fixtures/contract.json` pins them, and both sides test against it.
 * Nothing here names a particular library, and the webview never holds the address of a
 * picture: it names a photo by its source and id, and Rust fetches it. So the page loads
 * nothing from a library's host, and its content security policy can stay closed.
 */
import type { AssetMeta } from '@slidr/model';
import type { ImportedAsset } from '../document/storage';
import type { SecretName } from '../settings';

/** A photo library with whether it can be searched now. */
export interface StockSource {
  /** Stable id, used in the settings and in requests. */
  id: string;
  /** Display name. Also what a credit ends with: "Photo by … on <name>". */
  name: string;
  /** The library's own page, shown next to its results as its terms ask. */
  homeUrl: string;
  /** The name of the licence its photos come under, kept with every asset. */
  license: string;
  /** The key the source needs; absent for one that needs none. */
  key?: SecretName;
  state: 'ready' | 'no_key';
}

export const STOCK_ORIENTATIONS = ['landscape', 'portrait', 'square'] as const;

export type StockOrientation = (typeof STOCK_ORIENTATIONS)[number];

export interface StockQuery {
  query: string;
  /** From 1; the first page when absent. */
  page?: number;
  /** 1 to 30; 20 when absent. */
  perPage?: number;
  orientation?: StockOrientation | null;
}

/** A photo a search found: what to show, and whom to credit. */
export interface StockPhoto {
  /** The library's id of the photo. */
  id: string;
  source: string;
  width: number;
  height: number;
  /** The photo's average colour, to fill its tile until the thumbnail arrives. */
  color: string | null;
  /** What the photo shows, in the library's words. */
  description: string | null;
  author: string;
  authorUrl: string;
  pageUrl: string;
}

export interface StockResults {
  /** The source that answered. */
  source: string;
  photos: StockPhoto[];
  /** How many photos the library has for the query. */
  total: number;
  page: number;
  hasMore: boolean;
}

/** A photo taken into the workspace's assets, with its credit. */
export interface ImportedPhoto {
  asset: ImportedAsset;
  attribution: { author: string; url: string; license: string };
  description: string | null;
}

/** Closed set of failure categories. */
export const STOCK_ERROR_KINDS = [
  /** No source with that id. */
  'unknown_source',
  /** The source's key is not stored. */
  'no_key',
  /** The library rejected the key. */
  'invalid_key',
  /** The library's request limit was reached. */
  'rate_limit',
  /** A malformed argument: an empty query, a page out of range. */
  'invalid_input',
  /** The photo is not among the recent results; search again. */
  'not_found',
  /** The workspace is not open, or no document is. */
  'unknown_workspace',
  /** The library could not be reached. */
  'network',
  /** The library answered, but not with what was asked for. */
  'failed',
  /** Reading or writing a file failed. */
  'io',
  /** A bug on the Rust side. */
  'internal',
] as const;

export type StockErrorKind = (typeof STOCK_ERROR_KINDS)[number];

/**
 * A rejected call. `message` is English; it may reach the agent as the result of its tool call,
 * so it says what to do next where there is something to do.
 */
export class StockError extends Error {
  readonly kind: StockErrorKind;

  constructor(kind: StockErrorKind, message: string) {
    super(message);
    this.name = 'StockError';
    this.kind = kind;
  }
}

/** The photo libraries. Every method rejects with `StockError`. */
export interface StockClient {
  /** The libraries, in display order. */
  sources(): Promise<StockSource[]>;
  /** The id of the source a search uses when it names none. */
  defaultSource(): Promise<string>;
  /** One page of photos. `source` null: the default one. */
  search(source: string | null, query: StockQuery): Promise<StockResults>;
  /** A small picture of a photo a search found. */
  thumbnail(source: string, id: string): Promise<Blob>;
  /** Takes a found photo into the workspace's assets, at slide size. */
  import(workspaceId: string, source: string, id: string): Promise<ImportedPhoto>;
}

/** The asset table's entry for a photo that was taken in: its origin and its credit. */
export function stockAsset(photo: ImportedPhoto): AssetMeta {
  const { name: _file, ...stored } = photo.asset;
  return {
    ...stored,
    origin: 'stock',
    attribution: photo.attribution,
    ...(photo.description ? { name: photo.description } : {}),
  };
}

/** The library a credit names: its licence is "<library> License". */
const libraryOf = (license: string | undefined) => license?.replace(/\s+License$/i, '').trim();

/**
 * The credit of a stock photo, as the libraries ask it to read: "Photo by Jeff Sheldon on
 * Unsplash". Undefined for an asset that has no author to name.
 */
export function creditOf(
  asset: AssetMeta,
): { author: string; library?: string; url?: string } | undefined {
  const { attribution } = asset;
  if (!attribution?.author) return undefined;
  const library = libraryOf(attribution.license);
  return {
    author: attribution.author,
    ...(library ? { library } : {}),
    ...(attribution.url ? { url: attribution.url } : {}),
  };
}
