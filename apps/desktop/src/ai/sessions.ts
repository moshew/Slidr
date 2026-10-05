/**
 * The chats the AI panels have open (AIS-01, AIO-01). The deck has one chat; the slide tool has
 * one per slide and the object tool one per selection, and each of those two keeps a harness
 * session only for the chat it shows: when the user moves on, the chat they left closes its
 * session as soon as its turn is over. The conversation stays, and its next message resumes it.
 */
import type { SessionScope } from '@slidr/agent-tools';
import type { CommandBus } from '@slidr/model';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AgentService, ChatThread } from '../agent/agentService';

export interface Sessions {
  /**
   * How many times another document was opened in the window. The chat of a slide or of a
   * selection ends with its document, and the service lets it go: a panel that holds one takes
   * the chat of its scope again when this moves, though the ids may be the same ones (the same
   * file opened again).
   */
  opened: StoreApi<number>;
  /**
   * The chat of a scope: the conversation it shows, or the one named. From then on its work
   * counts in `working`.
   */
  thread: (scope: SessionScope, id?: string) => ChatThread;
  /**
   * The chat a panel shows now. The one the panel showed before (another slide, another
   * selection, another conversation) lets go of its session once it is idle.
   */
  show: (thread: ChatThread) => void;
  /** The chats with a turn running, for the status bar. */
  working: StoreApi<{ threads: ChatThread[] }>;
}

export function createSessions(agent: AgentService, bus: CommandBus): Sessions {
  const working = createStore<{ threads: ChatThread[] }>(() => ({ threads: [] }));
  const opened = createStore<number>(() => 0);
  // The service subscribed before this, when it was made: by now it has let the old chats go.
  bus.subscribe((event) => {
    if (event.kind === 'reset') opened.setState((count) => count + 1, true);
  });
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
    opened,
    working,
    thread(scope, id) {
      const thread = agent.thread(scope, id);
      if (!watched.has(thread)) {
        watched.add(thread);
        thread.store.subscribe(refresh);
        refresh();
      }
      return thread;
    },
    show(thread) {
      const { kind } = thread.scope;
      if (kind === 'import') return;
      const before = shown.get(kind);
      if (before === thread) return;
      shown.set(kind, thread);
      if (before) retire(before);
    },
  };
}
