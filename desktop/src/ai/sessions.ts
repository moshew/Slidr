/**
 * The chats the AI panel has open (AID-01, CHT-U07; ADR-072). There is one chat, a deck session,
 * with several conversations, and the conversation of an HTML import is one more among them, on
 * a session of its own. Each keeps a harness session only for the conversation it shows: when
 * the user moves to another conversation, the one they left closes its session as soon as its
 * turn is over. The conversation stays, and its next message resumes it.
 */
import type { SessionScope } from '@slidr/agent-tools';
import type { CommandBus } from '@slidr/model';
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { AgentService, ChatThread, Conversation } from '../agent/agentService';

/** The session of the chat: the whole deck, whatever the user points at in it. */
export const DECK: SessionScope = { kind: 'deck' };

/** A conversation the AI chat can show, and the session it is of. */
export interface ChatConversation extends Conversation {
  scope: SessionScope;
}

export interface Sessions {
  /**
   * How many times another document was opened in the window. The conversation of a slide or of
   * a selection ends with its document, and the service empties every chat for the new one: a
   * panel takes the chat of its scope again when this moves, though the ids may be the same ones
   * (the same file opened again), and what it gets is a chat that starts over.
   */
  opened: StoreApi<number>;
  /**
   * Whose conversation the AI chat shows: the deck's own, or the one of the HTML import the deck
   * came from (SPEC 13.3). A deck that is opened starts on its own.
   */
  chat: StoreApi<'deck' | 'import'>;
  /**
   * The conversations the AI chat can show, the latest first: the deck's, and with them the one
   * of its HTML import. One nobody has written in is listed only while it is on screen.
   */
  conversations: () => Promise<ChatConversation[]>;
  /** Shows one of them in the AI chat. */
  open: (conversation: ChatConversation) => void;
  /** Starts a conversation of the deck beside the ones it has, and shows it. */
  startNew: () => void;
  /**
   * The chat of a scope: the conversation it shows, or the one named. From then on its work
   * counts in `working`.
   */
  thread: (scope: SessionScope, id?: string) => ChatThread;
  /**
   * The chat a panel shows now. The one the panel showed before (another conversation) lets go
   * of its session once it is idle.
   */
  show: (thread: ChatThread) => void;
  /** The chats with a turn running, for the status bar. */
  working: StoreApi<{ threads: ChatThread[] }>;
}

/**
 * `imported`: the session of the HTML import the open deck came from, when it came from one.
 */
export function createSessions(
  agent: AgentService,
  bus: CommandBus,
  imported: () => SessionScope | null = () => null,
): Sessions {
  const working = createStore<{ threads: ChatThread[] }>(() => ({ threads: [] }));
  const opened = createStore<number>(() => 0);
  const chat = createStore<'deck' | 'import'>(() => 'deck');
  // The service subscribed before this, when it was made: by now it has emptied the old chats.
  bus.subscribe((event) => {
    if (event.kind !== 'reset') return;
    chat.setState('deck', true);
    opened.setState((count) => count + 1, true);
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
    chat,
    async conversations() {
      const ofImport = imported();
      const onScreen = chat.getState() === 'import' && ofImport ? ofImport : DECK;
      const lists = await Promise.all(
        (ofImport ? [DECK, ofImport] : [DECK]).map(async (scope) =>
          (await agent.conversations(scope))
            // The service lists what a scope shows also while it is empty.
            .filter((conversation) => conversation.updatedAt || scope === onScreen)
            .map((conversation) => ({ ...conversation, scope })),
        ),
      );
      // A conversation nobody wrote in yet is the newest of all.
      const time = (conversation: Conversation) => conversation.updatedAt ?? '9';
      return lists.flat().sort((a, b) => time(b).localeCompare(time(a)));
    },
    open({ scope, id }) {
      chat.setState(scope.kind === 'import' ? 'import' : 'deck', true);
      agent.showConversation(scope, id);
    },
    startNew() {
      chat.setState('deck', true);
      agent.newConversation(DECK);
    },
    working,
    thread(scope, id) {
      const thread = agent.thread(scope, id);
      if (!watched.has(thread)) {
        watched.add(thread);
        thread.store.subscribe(refresh);
        // A panel asks for its chat while it is being drawn, and a chat may be at work before
        // any panel showed it (an action sent from a menu of the Stage):
        // the status bar is told after the drawing, not in the middle of it.
        queueMicrotask(refresh);
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
