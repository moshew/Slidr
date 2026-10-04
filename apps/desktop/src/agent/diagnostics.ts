import { invoke, isTauri } from '@tauri-apps/api/core';

/*
 * The diagnostics log of the agent harnesses (AGT-08), as the webview reads it: what the
 * harnesses wrote and what the sessions did, kept by the core in a file of the app's own
 * (`src-tauri/src/harness/diagnostics.rs`). The settings screen shows it.
 */

/** The log as the core hands it over. */
export interface DiagnosticsView {
  /** Where the log is kept, for the user who wants the whole file. */
  path: string;
  /** The end of the log: one entry per line, the newest last. */
  text: string;
  /** How long the log is on disk. */
  bytes: number;
}

/** What an entry records. */
export type DiagnosticsKind = 'start' | 'send' | 'raw' | 'event' | 'close';

export interface DiagnosticsEntry {
  /** ISO time. */
  at: string;
  /** The harness layer's id of the session. */
  session: string;
  kind: DiagnosticsKind | (string & {});
  data: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The entries of a log's text. A line that is not an entry (a torn last line) is skipped. */
export function parseDiagnostics(text: string): DiagnosticsEntry[] {
  const entries: DiagnosticsEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry: unknown = JSON.parse(line);
      if (
        isRecord(entry) &&
        typeof entry.at === 'string' &&
        typeof entry.session === 'string' &&
        typeof entry.kind === 'string'
      ) {
        entries.push({ at: entry.at, session: entry.session, kind: entry.kind, data: entry.data });
      }
    } catch {
      // Not an entry.
    }
  }
  return entries;
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * An entry in a line: what it is about, in the harness's own words. The words are not
 * translated: they are names of events, tools and files, and an error as the harness gave it.
 */
export function entrySummary({ kind, data }: DiagnosticsEntry): string {
  if (!isRecord(data)) return typeof data === 'string' ? data : '';
  switch (kind) {
    case 'start':
      return [text(data.harness), text(data.thread), text(data.model), data.resume ? 'resume' : '']
        .filter(Boolean)
        .join(' · ');
    case 'send':
      return `${Number(data.textChars) || 0} + ${Number(data.contextChars) || 0} chars`;
    case 'close':
      return text(data.reason);
    case 'event': {
      const detail =
        text(data.name) || text(data.outcome) || text(data.kind) || text(data.model) || '';
      const said = text(data.message) || text(data.summary);
      return [text(data.type), detail, said].filter(Boolean).join(' · ');
    }
    default: {
      const detail = text(data.subtype) || text(data.error);
      return [text(data.type), detail].filter(Boolean).join(' · ');
    }
  }
}

/** Where the settings screen gets the log from. */
export interface DiagnosticsSource {
  read(): Promise<DiagnosticsView>;
  clear(): Promise<void>;
}

const tauriDiagnostics: DiagnosticsSource = {
  read: () => invoke<DiagnosticsView>('agent_diagnostics_read', {}),
  clear: async () => {
    await invoke('agent_diagnostics_clear');
  },
};

/**
 * The log of a plain browser page, which has no core and so no harness to log: a few entries of
 * each kind, so the screen can be drawn and tested there. In development only; elsewhere the
 * log of a page without a core is empty.
 */
function pageDiagnostics(): DiagnosticsSource {
  const sample: DiagnosticsEntry[] = import.meta.env.DEV
    ? [
        {
          at: '2026-10-04T06:00:00.000Z',
          session: '4f2a9c1e7b3d4a55',
          kind: 'start',
          data: { harness: 'claude-code', thread: 'd_k3x9/deck', model: 'sonnet', resume: null },
        },
        {
          at: '2026-10-04T06:00:01.210Z',
          session: '4f2a9c1e7b3d4a55',
          kind: 'send',
          data: { textChars: 42, contextChars: 913, images: 0 },
        },
        {
          at: '2026-10-04T06:00:02.004Z',
          session: '4f2a9c1e7b3d4a55',
          kind: 'raw',
          data: { type: 'system', subtype: 'api_retry', attempt: 1, max_retries: 10 },
        },
        {
          at: '2026-10-04T06:00:09.480Z',
          session: '4f2a9c1e7b3d4a55',
          kind: 'event',
          data: {
            type: 'tool_call_started',
            id: 'toolu_01',
            name: 'slide_create_from_html',
            source: 'app',
            input: { name: 'פתיחה', html: '<div data-archetype="hero">…</div>' },
          },
        },
        {
          at: '2026-10-04T06:00:11.932Z',
          session: '4f2a9c1e7b3d4a55',
          kind: 'event',
          data: {
            type: 'turn_completed',
            outcome: 'completed',
            costUsd: 0.0412,
            durationMs: 10722,
          },
        },
        {
          at: '2026-10-04T06:10:12.000Z',
          session: '4f2a9c1e7b3d4a55',
          kind: 'close',
          data: { reason: 'idle' },
        },
      ]
    : [];
  let lines = sample.map((entry) => JSON.stringify(entry)).join('\n');
  return {
    read: () =>
      Promise.resolve({
        path: 'C:\\Users\\you\\AppData\\Roaming\\dev.slidr.app\\agent\\diagnostics.jsonl',
        text: lines,
        bytes: new TextEncoder().encode(lines).length,
      }),
    clear: () => {
      lines = '';
      return Promise.resolve();
    },
  };
}

let source: DiagnosticsSource | undefined;

/** The log of this window: the core's in the app, a stand-in in a plain browser page. */
export function diagnostics(): DiagnosticsSource {
  source ??= isTauri() ? tauriDiagnostics : pageDiagnostics();
  return source;
}
