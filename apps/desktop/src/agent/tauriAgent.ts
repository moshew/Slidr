import { Channel, invoke, type InvokeArgs, type InvokeOptions } from '@tauri-apps/api/core';
import {
  AGENT_ERROR_KINDS,
  AgentError,
  type AgentClient,
  type AgentErrorKind,
  type AgentEvent,
  type HarnessDescriptor,
  type HarnessStatus,
} from './agent';
import {
  toReply,
  type BridgeCall,
  type ToolBridge,
  type ToolHandler,
  type ToolReply,
} from './toolBridge';

const KINDS = new Set<string>(AGENT_ERROR_KINDS);

/** Rust rejects with `{ kind, message }`; anything else is a bug on one side of the bridge. */
function toAgentError(error: unknown): AgentError {
  if (typeof error === 'object' && error !== null && 'kind' in error && 'message' in error) {
    const { kind, message } = error;
    if (typeof kind === 'string' && KINDS.has(kind)) {
      return new AgentError(kind as AgentErrorKind, String(message));
    }
  }
  return new AgentError('internal', error instanceof Error ? error.message : String(error));
}

async function call<T>(command: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  try {
    return await (options ? invoke<T>(command, args, options) : invoke<T>(command, args));
  } catch (error) {
    throw toAgentError(error);
  }
}

/** The harness contract over Tauri IPC (the commands in `src-tauri/src/harness/ipc.rs`). */
export const tauriAgent: AgentClient = {
  harnesses: () => call<HarnessDescriptor[]>('agent_harnesses'),
  probe: (harnessId) => call<HarnessStatus>('agent_probe', { harnessId }),
  // One channel per session: ordered, typed, and only this webview receives it.
  start: (harnessId, thread, config, onEvent) =>
    call<string>('agent_start', {
      harnessId,
      thread,
      config,
      onEvent: new Channel<AgentEvent>(onEvent),
    }),
  // The bytes go as the raw body, the thread and the name as headers: a file is not JSON.
  attach: (thread, file) =>
    call<string>('agent_attach', file.bytes, {
      headers: { 'x-thread': thread, 'x-file-name': encodeURIComponent(file.name) },
    }),
  send: async (sessionId, turn) => {
    await call('agent_send', { sessionId, turn });
  },
  interrupt: async (sessionId) => {
    await call('agent_interrupt', { sessionId });
  },
  close: async (sessionId) => {
    await call('agent_close', { sessionId });
  },
};

/**
 * Connects this webview to the tool bridge (the `tool_bridge_*` commands): from now on `handler`
 * runs every tool call of every session opened through the returned bridge, each under its
 * session key. Calls run side by side; the bridge does not order them.
 *
 * Connect once, when the app starts. Connecting again takes the bridge over, as a reloaded page
 * does: calls the earlier connection had not answered fail at once.
 */
export async function connectToolBridge(handler: ToolHandler): Promise<ToolBridge> {
  const answer = async ({ callId, sessionKey, name, input }: BridgeCall) => {
    let reply: ToolReply;
    try {
      reply = toReply(await handler(sessionKey, name, input));
    } catch (error) {
      // The Deck API never throws; whatever did is still an answer the agent can read.
      const text = error instanceof Error ? error.message : String(error);
      reply = { content: [{ type: 'text', text }], isError: true };
    }
    // Resolves `false` when the bridge no longer waits for this call (it timed out, its session
    // closed, the agent gave it up). Either way there is nothing left to do with the reply.
    await invoke('tool_bridge_reply', { callId, reply }).catch(() => undefined);
  };
  // One channel for all sessions: ordered, and only this webview receives it.
  const onCall = new Channel<BridgeCall>((toolCall) => void answer(toolCall));
  await call('tool_bridge_connect', { onCall });
  return {
    open: async (tools) => {
      const { sessionKey, url, token } = await call<{
        sessionKey: string;
        url: string;
        token: string;
      }>('tool_bridge_open', { tools });
      return { sessionKey, endpoint: { url, token } };
    },
    close: async (sessionKey) => {
      await call('tool_bridge_close', { sessionKey });
    },
  };
}
