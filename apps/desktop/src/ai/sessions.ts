/**
 * The chats the AI panels have open (AIS-01, AIO-01). The deck has one chat; the slide tool has
 * one per slide and the object tool one per selection, and each of those two keeps a harness
 * session only for the chat it shows: when the user moves on, the chat they left closes its
 * session as soon as its turn is over. The conversation stays, and its next message resumes it.
 */
import type { SessionScope } from '@slidr/agent-tools';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AgentService, ChatThread } from '../agent/agentService';

export interface Sessions {
  /** The chat of a scope; from then on its work counts in `working`. */
  thread: (scope: SessionScope) => ChatThread;
  /**
   * The chat a slide or object panel shows now. The one the panel showed before lets go of its
   * session once it is idle.
   */
  show: (thread: ChatThread) => void;
  /** The chats with a turn running, for the status bar. */
  working: StoreApi<{ threads: ChatThread[] }>;
}

export function createSessions(agent: AgentService): Sessions {
  const working = createStore<{ threads: ChatThread[] }>(() => ({ threads: [] }));
  const watched = new Set<ChatThread>();
  /** The chat each tool shows: the one that may keep its session. */
  const shown = new Map<SessionScope['kind'], ChatThread>();

  const refresh = () => {
    const threads = [...watched].filter((thread) => thread.store.getState().busy);
    const before = working.getState().threads;
    if (threads.length !== before.length || threads.some((thread, i) => thread !== before[i])) {
      working.setState({ threads });
    }
  };

  /** Ends the session of a chat nobody looks at, now or when its turn ends. */
  const retire = (thread: ChatThread) => {
    const done = () => {
      if (shown.get(thread.scope.kind) !== thread) void thread.close();
    };
    if (!thread.store.getState().busy) return done();
    const stop = thread.store.subscribe((state) => {
      if (state.busy) return;
      stop();
      done();
    });
  };

  return {
    working,
    thread(scope) {
      const thread = agent.thread(scope);
      if (!watched.has(thread)) {
        watched.add(thread);
        thread.store.subscribe(refresh);
        refresh();
      }
      return thread;
    },
    show(thread) {
      const { kind } = thread.scope;
      if (kind === 'deck' || kind === 'import') return;
      const before = shown.get(kind);
      if (before === thread) return;
      shown.set(kind, thread);
      if (before) retire(before);
    },
  };
}
