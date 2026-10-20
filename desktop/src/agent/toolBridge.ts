/**
 * The webview's side of the tool bridge (SPEC 11.4, ADR-022): how an agent that runs outside the
 * app calls the Deck API. Rust serves each session's tools on a local endpoint and forwards every
 * call here; the handler runs it and its result goes back. `connectToolBridge` in `tauriAgent`
 * is the IPC client; tests can use a fake `ToolBridge`.
 *
 * The bridge carries calls and nothing else. Which turn a call belongs to, and what a session may
 * do, is the handler's business: it gets the session key and answers with the Deck API's result.
 *
 * The shapes mirror the Rust serde types exactly, and both sides test against `toolBridge` in
 * `src-tauri/src/harness/fixtures/contract.json`.
 */
import type { ToolResult } from '@slidr/agent-tools';
import type { ToolEndpoint } from './agent';

/** A tool as a session offers it to its agent. The Deck API's `ToolListing` fits as it is. */
export interface BridgeTool {
  name: string;
  /** For the agent. */
  description: string;
  /** JSON Schema of the arguments object. */
  inputSchema: Record<string, unknown>;
  /** How long a call may wait for its result, for a tool that needs more than the default 60 s. */
  timeoutMs?: number;
}

/** Runs one tool call of a session. The Deck API's `call`, once the session's turn is known. */
export type ToolHandler = (sessionKey: string, name: string, input: unknown) => Promise<ToolResult>;

/** An open session of the bridge. */
export interface BridgeSession {
  /** What the handler receives this session's calls under. */
  sessionKey: string;
  /** For `SessionConfig.toolEndpoint`. */
  endpoint: ToolEndpoint;
}

export interface ToolBridge {
  /**
   * Opens a session whose agent sees exactly `tools`: pass the Deck API's list for the session's
   * scope. Every session has its own endpoint and token.
   */
  open(tools: readonly BridgeTool[]): Promise<BridgeSession>;
  /**
   * Ends a session: its endpoint stops answering, and a call still running in it is dropped.
   * Closing a session that is not open does nothing.
   */
  close(sessionKey: string): Promise<void>;
}

/** One call as it arrives from Rust. */
export interface BridgeCall {
  /** What the reply is sent under. */
  callId: string;
  sessionKey: string;
  name: string;
  /** The arguments object as the agent sent it; the Deck API validates it. */
  input: unknown;
}

export type ReplyContent =
  | { type: 'text'; text: string }
  /** `data` is the file in base64. */
  | { type: 'image'; data: string; mimeType: string };

/** A result in the form the agent reads: text and images. */
export interface ToolReply {
  content: ReplyContent[];
  /** The tool failed; `content` tells the agent why. */
  isError: boolean;
}

/**
 * A Deck API result as the agent reads it (ADR-011): `data` as JSON text, then each image; a
 * failure as its message, marked as an error.
 */
export function toReply(result: ToolResult): ToolReply {
  if (!result.ok) {
    return { content: [{ type: 'text', text: result.error.message }], isError: true };
  }
  return {
    content: [
      { type: 'text', text: JSON.stringify(result.data) },
      ...result.images.map((image): ReplyContent => ({
        type: 'image',
        data: image.data,
        mimeType: image.mimeType,
      })),
    ],
    isError: false,
  };
}
