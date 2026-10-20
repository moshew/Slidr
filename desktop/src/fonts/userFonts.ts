import { bareFont } from '@slidr/html-export';
import { create } from 'zustand';
import { fontFacts, type FontFacts } from './fontFile';

/*
 * The user's own fonts (SPEC 4.2 "fonts", 5.7): font files the user added to the app. They are
 * offered in the font picker of every deck, drawn from the user's file until a deck carries the
 * font itself, and handed to a deck that uses one (`embed.ts`), which is how the font reaches
 * the deck's file and what is exported from it.
 *
 * The files are kept in the webview's own database (IndexedDB), by the hash of their content:
 * they are too large for the settings file, and the app's core has no store for them. A deck
 * never depends on this store: what it uses, it carries.
 */

/** A font file the user added, as the app lists it. */
export interface UserFont extends FontFacts {
  /** sha256 of the file: the same file is kept once, and is the same asset in every deck. */
  id: string;
  /** The file's name, as it was added. */
  name: string;
  /** Its size. */
  bytes: number;
}

/** Why a file was not added. */
export type UserFontProblem =
  /** Not a WOFF2, TrueType or OpenType font, or one that names no family. */
  | 'unreadable'
  /** The app could not keep it. */
  | 'storage';

export class UserFontError extends Error {
  readonly problem: UserFontProblem;

  constructor(problem: UserFontProblem, cause?: unknown) {
    super(`a font file was not added: ${problem}`, { cause });
    this.name = 'UserFontError';
    this.problem = problem;
  }
}

interface StoredFont extends UserFont {
  file: Blob;
}

/** Where the files are kept. */
export interface UserFontStore {
  all(): Promise<StoredFont[]>;
  put(font: StoredFont): Promise<void>;
  remove(id: string): Promise<void>;
}

const DATABASE = 'slidr-fonts';
const FILES = 'files';

function request<T>(made: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    made.onsuccess = () => resolve(made.result);
    made.onerror = () => reject(made.error ?? new Error('the font store failed'));
  });
}

/** The files in the webview's database, one record a file. */
function databaseStore(): UserFontStore {
  let opened: Promise<IDBDatabase> | undefined;
  const database = () => {
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DATABASE, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(FILES, { keyPath: 'id' });
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error ?? new Error('the font store could not be opened'));
    });
    // A store that could not be opened is tried again by the next call.
    opened.catch(() => (opened = undefined));
    return opened;
  };
  const files = async (mode: IDBTransactionMode) =>
    (await database()).transaction(FILES, mode).objectStore(FILES);
  return {
    all: async () => request((await files('readonly')).getAll() as IDBRequest<StoredFont[]>),
    put: async (font) => void (await request((await files('readwrite')).put(font))),
    remove: async (id) => void (await request((await files('readwrite')).delete(id))),
  };
}

/** The files in memory: where there is no database (a unit test), and gone with the page. */
export function memoryFontStore(): UserFontStore {
  const kept = new Map<string, StoredFont>();
  return {
    all: () => Promise.resolve([...kept.values()]),
    put: (font) => Promise.resolve(void kept.set(font.id, font)),
    remove: (id) => Promise.resolve(void kept.delete(id)),
  };
}

let store: UserFontStore | undefined;
const files = new Map<string, Blob>();

const kept = (): UserFontStore =>
  (store ??= typeof indexedDB === 'undefined' ? memoryFontStore() : databaseStore());

/** Puts another store in place of the database and forgets what was loaded: for tests. */
export function setUserFontStore(next: UserFontStore | null): void {
  store = next ?? undefined;
  loading = undefined;
  files.clear();
  useStore.setState({ fonts: [] });
  draw();
}

const useStore = create<{ fonts: readonly UserFont[] }>(() => ({ fonts: [] }));

/** By family, and within a family by weight: the order every list shows them in. */
function sorted(fonts: readonly UserFont[]): UserFont[] {
  return [...fonts].sort(
    (a, b) =>
      a.family.localeCompare(b.family) ||
      parseInt(a.weight, 10) - parseInt(b.weight, 10) ||
      a.style.localeCompare(b.style) ||
      a.name.localeCompare(b.name),
  );
}

/* ---------------------------------------------------------------- drawing with them */

const STYLE_ID = 'slidr-user-fonts';
const addresses = new Map<string, string>();

/**
 * Registers the user's fonts under their family names, as `registerBuiltinFonts` does for the
 * library: a deck that names one is drawn in it on this computer whether or not it carries the
 * file yet, and nothing is read until text uses a face.
 */
function draw(): void {
  if (typeof document === 'undefined') return;
  const fonts = useStore.getState().fonts;
  for (const [id, address] of addresses) {
    if (fonts.some((font) => font.id === id)) continue;
    URL.revokeObjectURL(address);
    addresses.delete(id);
  }
  const rules = fonts.flatMap((font) => {
    const file = files.get(font.id);
    if (!file) return [];
    let address = addresses.get(font.id);
    if (!address) {
      address = URL.createObjectURL(file);
      addresses.set(font.id, address);
    }
    return [
      `@font-face { font-family: ${JSON.stringify(font.family)}; font-weight: ${font.weight}; font-style: ${font.style}; font-display: block; src: url("${address}"); }`,
    ];
  });
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.append(style);
  }
  style.textContent = rules.join('\n');
}

/* ---------------------------------------------------------------- the library */

let loading: Promise<void> | undefined;

/** Reads the user's fonts once and registers them. A store that cannot be read has none. */
export function loadUserFonts(): Promise<void> {
  loading ??= kept()
    .all()
    .then(
      (stored) => {
        const fonts = stored.map(({ file, ...font }) => {
          files.set(font.id, file);
          return font;
        });
        useStore.setState({ fonts: sorted(fonts) });
        draw();
      },
      (error: unknown) => {
        console.error("The user's fonts could not be read", error);
      },
    );
  return loading;
}

/** The user's fonts, for a component: none until they were read. */
export function useUserFonts(): readonly UserFont[] {
  return useStore((state) => state.fonts);
}

/** Calls a listener whenever the user's fonts change. Returns a function that stops it. */
export function subscribeUserFonts(listener: () => void): () => void {
  return useStore.subscribe(listener);
}

/** The user's fonts as they are known now. */
export function userFonts(): readonly UserFont[] {
  return useStore.getState().fonts;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** The media type of a font file, by how the file begins. */
function mimeOf(bytes: Uint8Array): string {
  const start = String.fromCharCode(...bytes.subarray(0, 4));
  if (start === 'wOF2') return 'font/woff2';
  return start === 'OTTO' ? 'font/otf' : 'font/ttf';
}

/**
 * Adds a font file to the user's fonts: WOFF2, TrueType or OpenType. The family, the weight and
 * the style are the file's own. The same file added again is the font that is already there.
 * Rejects with `UserFontError`.
 */
export async function addUserFont(
  file: File,
  unpack: (bytes: Uint8Array) => Promise<Uint8Array | undefined> = bareFont,
): Promise<UserFont> {
  await loadUserFonts();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const bare = await unpack(bytes).catch(() => undefined);
  const facts = bare && fontFacts(bare);
  if (!facts) throw new UserFontError('unreadable');
  const font: UserFont = {
    id: await sha256(bytes),
    name: file.name,
    bytes: bytes.length,
    ...facts,
  };
  // Under the type of what it is: a file dialog does not always say, and a deck's asset should.
  const typed = new File([bytes], file.name, { type: mimeOf(bytes) });
  try {
    await kept().put({ ...font, file: typed });
  } catch (error) {
    throw new UserFontError('storage', error);
  }
  files.set(font.id, typed);
  useStore.setState((state) => ({
    fonts: sorted([...state.fonts.filter((f) => f.id !== font.id), font]),
  }));
  draw();
  return font;
}

/** Takes a font out of the user's fonts. A deck that carries it keeps its own copy. */
export async function removeUserFont(id: string): Promise<void> {
  await kept().remove(id);
  files.delete(id);
  useStore.setState((state) => ({ fonts: state.fonts.filter((font) => font.id !== id) }));
  draw();
}

/** The file of one of the user's fonts, to store with a deck; undefined once it is gone. */
export function userFontFile(font: UserFont): File | undefined {
  const file = files.get(font.id);
  return file ? new File([file], font.name, { type: file.type }) : undefined;
}
