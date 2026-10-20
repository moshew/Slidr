import { createDeckApi, type SessionScope } from '@slidr/agent-tools';
import { CommandBus, createDeck, createSlide } from '@slidr/model';
import { describe, expect, it, vi } from 'vitest';
import type { AgentClient } from '../agent/agent';
import { AgentService, threadIdOf, type ChatThread } from '../agent/agentService';
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
        delayMs: 10,
      },
    ],
  ],
};

/** A turn that names the first slide, through the app's own tool. */
const rename: Script = {
  description: '',
  turns: [
    [
      {
        type: 'tool_call_started',
        id: 't1',
        name: 'slide_update',
        input: { slideId: 's_1', name: 'Renamed' },
        call: true,
      },
      { type: 'turn_completed', outcome: 'completed' },
    ],
  ],
};

const twoSlides = () =>
  createDeck({ slides: [createSlide({ id: 's_1' }), createSlide({ id: 's_2' })] });

function setup(speed = 0, script: Script = talk, imported?: () => SessionScope | null) {
  const bus = new CommandBus(twoSlides());
  const agent = createScriptedAgent({ script }, { speed });
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
  return { bus, sessions: createSessions(service, bus, imported), closed, started };
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

describe('another document in the window', () => {
  // The bug hunt's `ai-ui.md`, finding 2: the panel went on holding the chat of the document
  // that was open before, whose session the service had closed, so every tool call failed.
  it('is told to the panels, and the chat a slide has then is one that works', async () => {
    const { bus, sessions } = setup(0, rename);
    const held = sessions.thread(slide('s_1'));
    sessions.show(held);
    await held.send('Name the slide');
    await settled(held);
    expect(held.store.getState().entries.length).toBeGreaterThan(0);
    expect(sessions.opened.getState()).toBe(0);
    bus.dispatch({ type: 'slide.update', slideId: 's_2', patch: { name: 'An edit' } });
    expect(sessions.opened.getState()).toBe(0);

    // The same file is opened again: its slides carry the ids they had.
    bus.reset(twoSlides());
    expect(sessions.opened.getState()).toBe(1);
    expect(bus.deck.slides[0]?.name).not.toBe('Renamed');

    // What a panel does when that moves: it takes the chat of its scope again. The service
    // emptied the chat for the new document, so the conversation of the old one is not in it.
    const chat = sessions.thread(slide('s_1'));
    expect(chat.store.getState().entries).toEqual([]);
    sessions.show(chat);
    await chat.send('Name the slide');
    await settled(chat);
    const turn = chat.store.getState().entries.at(-1);
    const call = turn?.type === 'assistant' ? turn.parts.find((p) => p.type === 'tool') : undefined;
    expect(call).toMatchObject({ name: 'slide_update', state: 'ok' });
    expect(bus.deck.slides[0]?.name).toBe('Renamed');
  });
});

describe('the chat of a selection', () => {
  const selection = (...elementIds: string[]) =>
    ({ kind: 'object', slideId: 's_1', elementIds }) as const;
  const five = ['e_aaaaaaaa', 'e_bbbbbbbb', 'e_cccccccc', 'e_dddddddd', 'e_eeeeeeee'];

  it('is named by its elements, in whatever order they were selected', () => {
    expect(threadIdOf(selection('e_1'))).toBe('object-e_1');
    expect(threadIdOf(selection('e_2', 'e_1'))).toBe('object-e_1-e_2');
    expect(threadIdOf(selection(...five))).toBe(`object-${five.join('-')}`);
  });

  // The bug hunt's `ai-ui.md`, finding 15, and `agent-platform.md`, finding 8: the name was cut
  // at 64 characters, which is five ids, so a sixth element did not tell two selections apart
  // and the second got the chat, the session and the scope of the first.
  it('is its own chat for every selection, however many elements it has', () => {
    const { sessions } = setup();
    const first = selection(...five, 'e_ffffffff');
    const second = selection(...five, 'e_zzzzzzzz');
    const chat = sessions.thread(first);
    expect(sessions.thread(second)).not.toBe(chat);
    expect(sessions.thread(second).scope).toEqual(second);
    // The same selection, picked in another order, is the same chat.
    expect(sessions.thread(selection('e_ffffffff', ...[...five].reverse()))).toBe(chat);

    // The name is still one a folder can have, and leaves room for a conversation's suffix.
    for (const scope of [first, second, selection(...five, 'e_ffffffff', 'e_gggggggg')]) {
      expect(threadIdOf(scope)).toMatch(/^object-\d+x-[0-9a-z]+$/);
      expect(threadIdOf(scope).length).toBeLessThanOrEqual(64);
    }
    expect(threadIdOf(first)).not.toBe(threadIdOf(selection(...five, 'e_ffffffff', 'e_gggggggg')));
  });
});

describe('the conversations of the AI chat', () => {
  const IMPORT = { kind: 'import', file: 'deck.html' } as const;
  const listed = async (sessions: ReturnType<typeof setup>['sessions']) =>
    (await sessions.conversations()).map(({ id, scope }) => [id, scope.kind]);

  it('list the conversation of an import with those of the deck, and show the one picked', async () => {
    const { sessions } = setup(0, talk, () => IMPORT);
    // Nobody has written anything: the one on screen, the deck's first, and no other.
    expect(await listed(sessions)).toEqual([['deck', 'deck']]);

    // The request to import a file is the first message of its conversation.
    const ofImport = sessions.thread(IMPORT);
    await ofImport.send('Import the file "deck.html" as a deck.');
    await settled(ofImport);
    sessions.chat.setState('import', true);
    // The deck's own conversation is empty, and no longer on screen.
    expect(await listed(sessions)).toEqual([['import', 'import']]);

    // A new conversation is the deck's, also from the conversation of the import.
    sessions.startNew();
    expect(sessions.chat.getState()).toBe('deck');
    const list = await sessions.conversations();
    expect(list.map(({ scope }) => scope.kind)).toEqual(['deck', 'import']);
    expect(list[0]!.id).toMatch(/^deck-c/);
    expect(list[1]).toMatchObject({
      id: 'import',
      title: 'Import the file "deck.html" as a deck.',
    });

    sessions.open(list[1]!);
    expect(sessions.chat.getState()).toBe('import');
    sessions.open(list[0]!);
    expect(sessions.chat.getState()).toBe('deck');
    expect(sessions.thread({ kind: 'deck' }).id).toBe(list[0]!.id);
  });

  it('are those of the deck when it came from no import, and when another one is opened', async () => {
    const { bus, sessions } = setup();
    sessions.chat.setState('import', true);
    // The deck has no import to show the conversation of.
    expect(await listed(sessions)).toEqual([['deck', 'deck']]);
    bus.reset(twoSlides());
    expect(sessions.chat.getState()).toBe('deck');
  });
});
