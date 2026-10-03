/**
 * The agent harness contract as the webview sees it (ADR-010). Rust implements it in
 * `src-tauri/src/harness/`; `tauriAgent` is the IPC client; tests can use a fake `AgentClient`.
 *
 * The shapes mirror the Rust serde output exactly: fields camelCase, enum values snake_case.
 * `src-tauri/src/harness/fixtures/contract.json` pins them, and both sides test against it.
 * Nothing here names a particular harness: the UI knows `AgentEvent` and the descriptors only.
 */

/** Who serves a tool: the app (the Deck API, through the tool endpoint) or the harness itself. */
export type ToolSource = 'app' | 'harness';

/** How a turn ended. `failed` is preceded by an `error` event. */
export type TurnOutcome = 'completed' | 'interrupted' | 'failed';

/** Tokens of one turn. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Closed set of failure categories, for both rejected calls and `error` events. */
export const AGENT_ERROR_KINDS = [
  /** No harness with that id. */
  'unknown_harness',
  /** No open session with that id. */
  'unknown_session',
  /** A turn is still running in the session. */
  'busy',
  /** A malformed argument: thread key, model, image, empty turn. */
  'invalid_input',
  /** The harness program is not installed. */
  'not_installed',
  /** The harness is installed but not signed in. */
  'not_logged_in',
  /** A usage limit was reached. */
  'quota',
  /** The agent did not receive the app's tools; the turn was stopped. */
  'tools_unavailable',
  /** The conversation to resume does not exist for the harness; start anew with a summary. */
  'resume_failed',
  /** The harness process ended unexpectedly, or the session has already ended. */
  'process_exited',
  /** The harness reported an error for the turn. */
  'turn_failed',
  /** Writing the session's files or pipes failed. */
  'io',
  /** A bug on the Rust side. */
  'internal',
] as const;

export type AgentErrorKind = (typeof AGENT_ERROR_KINDS)[number];

/**
 * A normalized harness event. Per session, in order: `session_started` once, first; every
 * accepted turn ends in exactly one `turn_completed`; every `tool_call_started` is matched by a
 * `tool_call_finished` before its turn ends; `exited` is last.
 */
export type AgentEvent =
  /** `nativeSessionId` is what `SessionConfig.resume` takes. */
  | { type: 'session_started'; nativeSessionId: string; model: string }
  | { type: 'text_delta'; text: string }
  /** Some harnesses send it empty, as a "thinking" pulse. */
  | { type: 'thinking_delta'; text: string }
  /** `input` is the complete arguments object. */
  | { type: 'tool_call_started'; id: string; name: string; source: ToolSource; input: unknown }
  /** `summary`: a short text of the result (at most about 300 characters). */
  | { type: 'tool_call_finished'; id: string; ok: boolean; summary: string }
  /** `costUsd`: this turn's cost, `null` when the harness cannot attribute one to the turn. */
  | {
      type: 'turn_completed';
      outcome: TurnOutcome;
      usage: Usage;
      costUsd: number | null;
      durationMs: number;
    }
  /** `recoverable`: the session can take another turn. */
  | { type: 'error'; kind: AgentErrorKind; message: string; recoverable: boolean }
  /** The session is over. `code`: the process exit code, when there was one. */
  | { type: 'exited'; code: number | null };

/** What a session works on. */
export type Scope =
  | { kind: 'deck' }
  | { kind: 'slide'; slideId: string }
  | { kind: 'object'; slideId: string; elementIds: string[] }
  /** An HTML import session; `file` is the source file. */
  | { kind: 'import'; file: string };

/** Where the agent reaches the app's tools: local URL and per-session bearer token. */
export interface ToolEndpoint {
  url: string;
  token: string;
}

/** How to start a session. The session's folder is derived in Rust from the thread key. */
export interface SessionConfig {
  scope: Scope;
  /** Assembled from the prompt modules; replaces the harness's own prompt. */
  systemPrompt: string;
  /** The app's tools; without it the agent has only the harness's built-in tools. */
  toolEndpoint?: ToolEndpoint | null;
  /** Web search and fetch. Default `true`. */
  webAccess?: boolean;
  /** One of the descriptor's `models`; the harness's default when absent. */
  model?: string | null;
  /** One of the descriptor's `effortLevels`. */
  effort?: string | null;
  /** A `nativeSessionId` from an earlier `session_started`. */
  resume?: string | null;
}

export interface ImageAttachment {
  mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  /** The bytes, base64. */
  data: string;
}

/** One user message. */
export interface UserTurn {
  text: string;
  /** This turn's `<slidr_context>` block, kept apart from what the user wrote. */
  context?: string | null;
  images?: ImageAttachment[];
}

/** Feature flags; the UI hides what a harness does not support. */
export interface Capabilities {
  streaming: boolean;
  resume: boolean;
  interrupt: boolean;
  imageInput: boolean;
  toolEndpoint: boolean;
  thinking: boolean;
}

export interface ModelOption {
  /** What `SessionConfig.model` takes. */
  id: string;
  label: string;
}

export interface HarnessDescriptor {
  id: string;
  name: string;
  capabilities: Capabilities;
  models: ModelOption[];
  /** The model used when the session names none; `null`: the harness decides. */
  defaultModel: string | null;
  effortLevels: string[];
}

export type HarnessState = 'ready' | 'not_installed' | 'not_logged_in' | 'unavailable';

export interface HarnessStatus {
  state: HarnessState;
  version: string | null;
  /** The sign-in method and plan, as the harness describes them. */
  account: string | null;
  /** English guidance or error text. */
  detail: string | null;
}

/** A rejected call. `message` is English for logs; the UI words its own message from `kind`. */
export class AgentError extends Error {
  readonly kind: AgentErrorKind;

  constructor(kind: AgentErrorKind, message: string) {
    super(message);
    this.name = 'AgentError';
    this.kind = kind;
  }
}

/** The harness layer over IPC. Every method rejects with `AgentError`. */
export interface AgentClient {
  /** The registered harnesses, in display order. */
  harnesses(): Promise<HarnessDescriptor[]>;
  /** Installed? Which version? Signed in? */
  probe(harnessId: string): Promise<HarnessStatus>;
  /**
   * Starts a session and returns its id. `thread` names the conversation, `<deckId>/<threadId>`
   * (letters, digits, `-`, `_`): the same thread gets the same folder, which resume needs.
   * `onEvent` receives the session's events in order, until `exited`.
   */
  start(
    harnessId: string,
    thread: string,
    config: SessionConfig,
    onEvent: (event: AgentEvent) => void,
  ): Promise<string>;
  /** Starts a turn; rejects with `busy` while one runs. */
  send(sessionId: string, turn: UserTurn): Promise<void>;
  /** Stops the running turn; it ends with `turn_completed` (`interrupted`). */
  interrupt(sessionId: string): Promise<void>;
  /** Ends the session; its last event is `exited`. */
  close(sessionId: string): Promise<void>;
}
