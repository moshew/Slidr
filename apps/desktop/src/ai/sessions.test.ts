import { createDeckApi } from '@slidr/agent-tools';
import { CommandBus, createDeck, createSlide } from '@slidr/model';
import { describe, expect, it, vi } from 'vitest';
import type { AgentClient } from '../agent/agent';
import { AgentService, type ChatThread } from '../agent/agentService';
import { createScriptedAgent, type Script } from '../agent/scriptedAgent';
import { memoryTranscripts } from '../agent/transcript';
import { createSessions } from './sessions';

/*
 * The chats the panels have open, over the scripted mock harness: a slide tool and an object
 * tool each keep a session for the chat they show, and the chat they left lets its session go.
 */

const talk: Script = {
  description: '',
  turns: [
    [
      { type: 'text_delta', text: 'Done.', delayMs: 10 },
      {
        type: 'turn_completed',
        outcome: 'completed',
        usage: {},
        costUsd: 0,
        durationMs: 10,
        delayMs: 10,
      },
    ],
  ],
};

function setup(speed = 0) {
  const bus = new CommandBus(
    createDeck({ slides: [createSlide({ id: 's_1' }), createSlide({ id: 's_2' })] }),
  );
  const agent = createScriptedAgent({ talk }, { speed });
  const closed: string[] = [];
  const started: string[] = [];
  const client: AgentClient = {
    ...agent.client,
    start: (harnessId, thread, config, onEvent) => {
      started.push(thread.split('/')[1]!);
      return agent.client.start(harnessId, thread, config, onEvent);
    },
    close: (sessionId) => {
      closed.push(sessionId);
      return agent.client.close(sessionId);
    },
  };
  const service = new AgentService({
    client,
    connectBridge: agent.connectBridge,
    bus,
    api: createDeckApi(bus),
    selection: () => ({
      currentSlideId: 's_1',
      selectedSlideIds: [],
      selectedElementIds: [],
      editingElementId: null,
    }),
    transcripts: memoryTranscripts(),
    settings: () => ({ harnessId: 'mock' }),
  });
  return { sessions: createSessions(service), closed, started };
}

function settled(thread: ChatThread): Promise<void> {
  return new Promise((resolve) => {
    if (!thread.store.getState().busy) return resolve();
    const stop = thread.store.subscribe((state) => {
      if (state.busy) return;
      stop();
      resolve();
    });
  });
}

const slide = (slideId: string) => ({ kind: 'slide', slideId }) as const;

describe('the sessions of the AI tools', () => {
  it('give every slide a chat of its own, and one chat per scope', () => {
    const { sessions } = setup();
    const first = sessions.thread(slide('s_1'));
    expect(sessions.thread(slide('s_1'))).toBe(first);
    expect(sessions.thread(slide('s_2'))).not.toBe(first);
    expect(first.id).toBe('slide-s_1');
  });

  it('close the session of the chat the panel moved on from, and resume it on return', async () => {
    const { sessions, closed, started } = setup();
    const first = sessions.thread(slide('s_1'));
    sessions.show(first);
    await first.send('Shorten');
    await settled(first);
    expect(started).toEqual(['slide-s_1']);
    expect(closed).toEqual([]);

    // The user goes to another slide: its chat is shown, and the first lets its session go.
    const second = sessions.thread(slide('s_2'));
    sessions.show(second);
    await vi.waitFor(() => expect(closed).toHaveLength(1));
    expect(first.sessionKey).toBeNull();
    // The conversation stays with the chat.
    expect(first.store.getState().entries).toHaveLength(2);

    // Back on the first slide: the next message opens a session again.
    sessions.show(first);
    await first.send('More');
    await settled(first);
    expect(started).toEqual(['slide-s_1', 'slide-s_1']);
    expect(first.store.getState().entries).toHaveLength(4);
  });

  it('let a turn that is running finish before its session is closed', async () => {
    const { sessions, closed } = setup(1);
    const first = sessions.thread(slide('s_1'));
    sessions.show(first);
    await first.send('Shorten');
    expect(first.store.getState().busy).toBe(true);
    sessions.show(sessions.thread(slide('s_2')));
    expect(closed).toEqual([]);

    await settled(first);
    expect(first.store.getState().entries.at(-1)).toMatchObject({ outcome: 'completed' });
    await vi.waitFor(() => expect(closed).toHaveLength(1));
  });

  it('keep the session of a chat the panel came back to before its turn ended', async () => {
    const { sessions, closed } = setup(1);
    const first = sessions.thread(slide('s_1'));
    sessions.show(first);
    await first.send('Shorten');
    sessions.show(sessions.thread(slide('s_2')));
    sessions.show(first);
    await settled(first);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed).toEqual([]);
    expect(first.sessionKey).not.toBeNull();
  });

  it('never close the deck chat, and keep the tools apart', async () => {
    const { sessions, closed } = setup();
    const deck = sessions.thread({ kind: 'deck' });
    sessions.show(deck);
    await deck.send('Hello');
    await settled(deck);
    const object = sessions.thread({ kind: 'object', slideId: 's_1', elementIds: ['e_1'] });
    sessions.show(object);
    await object.send('Hello');
    await settled(object);
    // A slide chat takes the place of no deck chat and of no object chat.
    sessions.show(sessions.thread(slide('s_1')));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed).toEqual([]);
  });

  it('say which chats are working', async () => {
    const { sessions } = setup(1);
    const first = sessions.thread(slide('s_1'));
    const seen: number[] = [];
    sessions.working.subscribe((state) => seen.push(state.threads.length));
    expect(sessions.working.getState().threads).toEqual([]);
    await first.send('Shorten');
    expect(sessions.working.getState().threads).toEqual([first]);
    await settled(first);
    expect(sessions.working.getState().threads).toEqual([]);
    expect(seen).toEqual([1, 0]);
  });
});
