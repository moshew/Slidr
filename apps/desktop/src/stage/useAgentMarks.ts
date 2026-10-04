import { useEffect } from 'react';
import { useStore } from 'zustand';
import type { ChatThread } from '../agent/agentService';
import { aiOf } from '../ai/runtime';
import type { Editor } from '../shell';
import { agentMarks } from './agentMarks';

/** The elements a thread's running tool call names, as one string; empty when there is none. */
function heldBy(thread: ChatThread): string {
  const { activity } = thread.store.getState();
  return activity?.kind === 'tool' ? (activity.target?.elementIds ?? []).join(' ') : '';
}

/**
 * The elements to mark on the Stage as being changed by the agent (STG-11): what its turns
 * write, as the writes land on the bus, and what the tool call it is waiting for names. Called
 * by whoever draws the Stage, so nothing of the agent starts before the editor is on the screen.
 */
export function useAgentMarks(editor: Editor): readonly string[] {
  useEffect(() => {
    const stopBus = editor.bus.subscribe(agentMarks.noteChange);
    const { working } = aiOf(editor).sessions;
    const followed = new Map<ChatThread, { stop: () => void; release?: () => void }>();

    const follow = (thread: ChatThread) => {
      const entry: { stop: () => void; release?: () => void } = { stop: () => undefined };
      let held = '';
      const sync = () => {
        // The thread's store changes with every word the agent writes: only a change of what
        // the running call names moves a mark.
        const now = heldBy(thread);
        if (now === held) return;
        held = now;
        entry.release?.();
        entry.release = now ? agentMarks.hold(now.split(' ')) : undefined;
      };
      entry.stop = thread.store.subscribe(sync);
      sync();
      return entry;
    };
    const refresh = () => {
      const threads = new Set(working.getState().threads);
      for (const [thread, entry] of followed) {
        if (threads.has(thread)) continue;
        entry.stop();
        entry.release?.();
        followed.delete(thread);
      }
      for (const thread of threads) if (!followed.has(thread)) followed.set(thread, follow(thread));
    };
    const stopWorking = working.subscribe(refresh);
    refresh();

    return () => {
      stopBus();
      stopWorking();
      for (const entry of followed.values()) {
        entry.stop();
        entry.release?.();
      }
      agentMarks.clear();
    };
  }, [editor]);
  return useStore(agentMarks.store, (s) => s.ids);
}
