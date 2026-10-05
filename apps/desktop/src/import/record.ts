/**
 * The record of an import as the deck file keeps it (`source/import.json`, beside the source
 * file itself; SPEC 5.8, IMP-07, IMP-09): what the app measured of every captured slide, what
 * the agent pointed at for it, the size of the plan, what the page was refused, and whether the
 * import was at work when the record was last written. A deck that is opened again gets its
 * import report from it, and an import that was cut is continued from it.
 *
 * It travels inside a `.slidr` file, which anyone can write. What is read from it is data: it
 * is taken field by field, a field of another kind is dropped, and nothing in it is run.
 */
import { invoke } from '@tauri-apps/api/core';

/** What the agent pointed at when a slide was captured: its own words, kept as data. */
export interface CaptureSource {
  selector?: string;
  js?: string;
  /** The script that brought the slide into view. */
  before?: string;
}

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
  /** Where in the file the slide came from, as the agent said it. */
  from?: CaptureSource;
}

/**
 * Where the import stands. `working`: the agent is at it, or was when the app last wrote.
 * `idle`: its last turn ended as the agent meant it to. `cut`: the turn was stopped or failed,
 * or the app went away, while the import was at work (IMP-09).
 */
export type ImportPhase = 'working' | 'idle' | 'cut';

export interface ImportRecord {
  version: 1;
  /** The deck the record is of. A record found in another deck's file is not that deck's. */
  deckId: string;
  /** The name the agent reads the source file under. */
  file: string;
  startedAt: number | null;
  /** How many slides the agent's plan had (IMP-11); null until it said. */
  planned: number | null;
  phase: ImportPhase;
  /** By slide id. */
  records: Record<string, SlideRecord>;
  /** Requests the isolated page was refused. */
  blocked: string[];
}

const MAX_SLIDES = 5000;
const MAX_TEXT = 600;
const MAX_CODE = 4000;
const MAX_LIST = 200;

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isShare = (value: unknown): value is number =>
  typeof value === 'number' && value >= 0 && value <= 1;

const isSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const texts = (value: unknown, max: number): string[] =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .slice(0, MAX_LIST)
        .map((item) => item.slice(0, max))
    : [];

function sourceOf(value: unknown): CaptureSource | undefined {
  if (!isObject(value)) return undefined;
  const from: CaptureSource = {};
  for (const key of ['selector', 'js', 'before'] as const) {
    const text = value[key];
    if (typeof text === 'string' && text) from[key] = text.slice(0, MAX_CODE);
  }
  return Object.keys(from).length > 0 ? from : undefined;
}

function slideOf(value: unknown): SlideRecord | null {
  if (!isObject(value)) return null;
  const { faithful, exact, wholeSlideHtml, editability, textEditability, source } = value;
  if (
    typeof faithful !== 'boolean' ||
    typeof exact !== 'boolean' ||
    typeof wholeSlideHtml !== 'boolean' ||
    !isShare(editability) ||
    !isShare(textEditability) ||
    !isObject(source) ||
    !isSize(source.width) ||
    !isSize(source.height)
  ) {
    return null;
  }
  const from = sourceOf(value.from);
  return {
    faithful,
    exact,
    wholeSlideHtml,
    editability,
    textEditability,
    kept: texts(value.kept, MAX_TEXT),
    source: { width: source.width, height: source.height },
    elementIds: texts(value.elementIds, MAX_TEXT),
    ...(from ? { from } : {}),
  };
}

/**
 * A key of the record is a slide id: any short text, the model says. One that every object
 * answers to (`__proto__`, `constructor`) is no slide's, and is not taken.
 */
const isSlideId = (key: string) =>
  key.length > 0 && key.length <= 120 && !(key in Object.prototype);

/**
 * The record a file holds, for the deck that is open. Null when the file has none, when it is
 * not a record, or when it is another deck's.
 */
export function parseRecord(text: string | null, deckId: string): ImportRecord | null {
  if (!text) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(value) || value.version !== 1 || value.deckId !== deckId) return null;
  const { file, startedAt, planned, phase } = value;
  if (typeof file !== 'string' || !file || file.length > MAX_TEXT) return null;
  const records: Record<string, SlideRecord> = {};
  if (isObject(value.records)) {
    for (const [slideId, entry] of Object.entries(value.records).slice(0, MAX_SLIDES)) {
      const record = isSlideId(slideId) ? slideOf(entry) : null;
      if (record) records[slideId] = record;
    }
  }
  return {
    version: 1,
    deckId,
    file,
    startedAt: typeof startedAt === 'number' && Number.isFinite(startedAt) ? startedAt : null,
    planned:
      typeof planned === 'number' && Number.isInteger(planned) && planned > 0 && planned <= 5000
        ? planned
        : null,
    phase: phase === 'working' || phase === 'cut' ? phase : 'idle',
    records,
    blocked: texts(value.blocked, MAX_TEXT),
  };
}

export function serializeRecord(record: ImportRecord): string {
  return JSON.stringify(record);
}

/** Where the record of the open document's import is kept. */
export interface RecordStore {
  read(): Promise<string | null>;
  write(text: string): Promise<void>;
}

/** The record in the workspace of a document, which every save packs into the deck file. */
export function workspaceRecord(workspaceId: string): RecordStore {
  return {
    read: () => invoke<string | null>('import_record_read', { workspaceId }),
    write: async (text) => {
      await invoke('import_record_write', { workspaceId, text });
    },
  };
}

/**
 * A plain browser page has no workspace: the record lives as long as the page, by the id of its
 * deck, so a deck that is put back in the window finds it. For development and tests only.
 */
const pageRecords = new Map<string, string>();

export function pageRecord(deckId: string): RecordStore {
  return {
    read: () => Promise.resolve(pageRecords.get(deckId) ?? null),
    write: (text) => {
      pageRecords.set(deckId, text);
      return Promise.resolve();
    },
  };
}
