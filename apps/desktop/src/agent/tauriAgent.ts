import { Channel, invoke, type InvokeArgs } from '@tauri-apps/api/core';
import {
  AGENT_ERROR_KINDS,
  AgentError,
  type AgentClient,
  type AgentErrorKind,
  type AgentEvent,
  type HarnessDescriptor,
  type HarnessStatus,
} from './agent';

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

async function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
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
