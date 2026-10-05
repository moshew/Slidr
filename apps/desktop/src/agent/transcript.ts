/**
 * The normalized transcript of a chat (AGT-05): what the user and the agent said and did, in a
 * form that does not depend on the harness that ran it. It is what the chat shows, and what is
 * kept with the deck in `chat/<thread>.jsonl`, one entry per line, so a reopened deck shows its
 * conversation. `chat/threads.json` maps each thread to the harness session that can resume it.
 */
import type { LintFinding, SessionScope } from '@slidr/agent-tools';
import { invoke } from '@tauri-apps/api/core';
import type { AgentErrorKind, HarnessState, ToolSource, TurnOutcome, Usage } from './agent';

/** A piece of the agent's reply. */
export interface TextPart {
  type: 'text';
  text: string;
}

/** Where a click on a tool chip goes (CHT-U02). */
export interface ToolTarget {
  slideId?: string;
  elementIds?: string[];
}

/** One tool call, shown as a chip. */
export interface ToolPart {
  type: 'tool';
  /** The harness's id of the call. */
  id: string;
  name: string;
  source: ToolSource;
  /** The arguments, with long strings cut: for the chip's detail. */
  input: unknown;
  state: 'running' | 'ok' | 'failed';
  /** A short text of the result. */
  summary?: string;
  target?: ToolTarget;
}

/** What the design check held a turn open for (SPEC 9.4). */
export interface GateReport {
  /** Slides the agent changed and did not look at afterwards (QG-01). */
  unseen: string[];
  /** Findings the turn may not end with (QG-02, QG-03). */
  findings: LintFinding[];
}

/** A follow-up the design check sent in place of a user message (QG-06). */
export interface GatePart extends GateReport {
  type: 'gate';
  /** From 1. */
  round: number;
}

export type AssistantPart = TextPart | ToolPart | GatePart;

/** What stopped a turn, or kept it from starting (CHT-U09). */
export interface ChatProblem {
  /** A harness that cannot run comes as its probe state; anything else as the error kind. */
  kind: AgentErrorKind | Exclude<HarnessState, 'ready'>;
  /** English, from the harness: for the detail under the app's own wording. */
  message: string;
}

/** A button of an AI tool that the user pressed in place of typing (SPEC 4.3). */
export interface EntryAction {
  /** The id of the action's template (`@slidr/prompts`). */
  id: string;
  /** What the user chose in the action's form. */
  params?: Record<string, string | number>;
}

/** A file the user sent with a message (CHT-U05), as the chat shows it afterwards. */
export interface EntryAttachment {
  name: string;
  kind: 'image' | 'file';
  /** For a picture: the id it has among the deck's assets, so the chat can show it. */
  assetId?: string;
}

export interface UserEntry {
  type: 'user';
  id: string;
  /** ISO time. */
  at: string;
  text: string;
  /** The action the message stands for: the chat shows its name, and `text` is what was sent. */
  action?: EntryAction;
  attachments?: EntryAttachment[];
}

/** Everything the agent did for one user message, the design check's rounds included. */
export interface AssistantEntry {
  type: 'assistant';
  id: string;
  at: string;
  parts: AssistantPart[];
  /** How the turn ended; absent while it runs. */
  outcome?: TurnOutcome;
  /** The undo transaction of the turn, when it changed the deck (CMD-06). */
  txId?: string;
  /** What the design check gave up on after its rounds (QG-05). */
  remaining?: GateReport;
  problem?: ChatProblem;
  usage?: Usage;
  /** Null when the harness could not attribute a cost to the turn. */
  costUsd?: number | null;
  durationMs?: number;
}

export type ChatEntry = UserEntry | AssistantEntry;

/** A thread as the index keeps it. */
export interface ThreadRecord {
  scope: SessionScope;
  /** The harness that ran the thread last. */
  harnessId?: string;
  /** What resumes the conversation on that harness (AGT-05: used for nothing else). */
  nativeSessionId?: string;
  /**
   * What the harness's session has cost so far, as the sum of its turns: the baseline of the
   * next process that resumes it. Absent once a turn's cost was unknown.
   */
  spentUsd?: number;
  updatedAt?: string;
  /** The start of the conversation's first message, for the list of conversations (CHT-U07). */
  title?: string;
}

/** Where the chats of the open document are kept. */
export interface TranscriptStore {
  /** The thread's record and entries; an empty thread when the deck has none. */
  read(threadId: string): Promise<{ record: ThreadRecord | null; entries: ChatEntry[] }>;
  /** Adds entries to the end of the thread. */
  append(threadId: string, entries: readonly ChatEntry[]): Promise<void>;
  /** Replaces the thread's record in the index. */
  setRecord(threadId: string, record: ThreadRecord): Promise<void>;
  /** Every thread the index knows, by id: what the list of conversations is made from. */
  records(): Promise<Record<string, ThreadRecord>>;
}

const INDEX_FILE = 'threads.json';
const INDEX_VERSION = 1;

interface ThreadIndex {
  version: number;
  threads: Record<string, ThreadRecord>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The entries of a transcript file. A line that does not parse is skipped, not fatal. The file
 * is only ever added to, so an entry that is written again (something about its turn became
 * known after it was closed) is a later line under the same id: that line is the entry, in the
 * place of the first.
 */
export function parseTranscript(text: string): ChatEntry[] {
  const entries: ChatEntry[] = [];
  const places = new Map<string, number>();
  const keep = (entry: ChatEntry) => {
    const place = places.get(entry.id);
    if (place === undefined) places.set(entry.id, entries.push(entry) - 1);
    else entries[place] = entry;
  };
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry: unknown = JSON.parse(line);
      if (!isRecord(entry) || typeof entry.id !== 'string') continue;
      if (entry.type === 'user' && typeof entry.text === 'string') {
        keep(entry as unknown as UserEntry);
      } else if (entry.type === 'assistant' && Array.isArray(entry.parts)) {
        keep(entry as unknown as AssistantEntry);
      }
    } catch {
      // A torn last line after a crash: the entries before it are intact.
    }
  }
  return entries;
}

export function serializeTranscript(entries: readonly ChatEntry[]): string {
  return entries.map((entry) => `${JSON.stringify(entry)}\n`).join('');
}

function parseIndex(text: string | null): ThreadIndex {
  try {
    const index: unknown = text ? JSON.parse(text) : null;
    if (isRecord(index) && isRecord(index.threads)) {
      return { version: INDEX_VERSION, threads: index.threads as Record<string, ThreadRecord> };
    }
  } catch {
    // An unreadable index costs the resume ids, not the transcripts.
  }
  return { version: INDEX_VERSION, threads: {} };
}

/** A thread id as a file name: the ids the app makes are plain already. */
function fileOf(threadId: string): string {
  return `${threadId.replace(/[^A-Za-z0-9_-]/g, '_')}.jsonl`;
}

/**
 * The chats in the workspace of the open document, through the `agent_chat_*` commands. The
 * workspace is looked up on every call: the store outlives the document. With no document open
 * there is nowhere to keep a chat, and it lives in memory only.
 */
export function workspaceTranscripts(workspaceId: () => string | null): TranscriptStore {
  const read = (file: string) => {
    const id = workspaceId();
    return id
      ? invoke<string | null>('agent_chat_read', { workspaceId: id, file })
      : Promise.resolve(null);
  };
  const write = async (file: string, text: string, append: boolean) => {
    const id = workspaceId();
    if (id) await invoke('agent_chat_write', { workspaceId: id, file, text, append });
  };
  // Index updates run one after another, so two records never overwrite each other.
  let last: Promise<unknown> = Promise.resolve();
  return {
    async read(threadId) {
      const [index, text] = await Promise.all([read(INDEX_FILE), read(fileOf(threadId))]);
      return {
        record: parseIndex(index).threads[threadId] ?? null,
        entries: parseTranscript(text ?? ''),
      };
    },
    append: (threadId, entries) => write(fileOf(threadId), serializeTranscript(entries), true),
    records: async () => parseIndex(await read(INDEX_FILE)).threads,
    setRecord(threadId, record) {
      const run = last.then(async () => {
        const index = parseIndex(await read(INDEX_FILE));
        index.threads[threadId] = record;
        await write(INDEX_FILE, JSON.stringify(index, null, 2), false);
      });
      last = run.catch(() => undefined);
      return run;
    },
  };
}

/** Chats kept in memory: a plain browser page and tests. `files` is what a deck file would hold. */
export function memoryTranscripts(
  files: Map<string, string> = new Map(),
): TranscriptStore & { files: Map<string, string> } {
  return {
    files,
    read: (threadId) =>
      Promise.resolve({
        record: parseIndex(files.get(INDEX_FILE) ?? null).threads[threadId] ?? null,
        entries: parseTranscript(files.get(fileOf(threadId)) ?? ''),
      }),
    append(threadId, entries) {
      const file = fileOf(threadId);
      files.set(file, (files.get(file) ?? '') + serializeTranscript(entries));
      return Promise.resolve();
    },
    records: () => Promise.resolve(parseIndex(files.get(INDEX_FILE) ?? null).threads),
    setRecord(threadId, record) {
      const index = parseIndex(files.get(INDEX_FILE) ?? null);
      index.threads[threadId] = record;
      files.set(INDEX_FILE, JSON.stringify(index, null, 2));
      return Promise.resolve();
    },
  };
}
