import { createDeckApi, deckTools } from '@slidr/agent-tools';
import { CommandBus, createDeck, createSlide } from '@slidr/model';
import { approvedOutline } from '@slidr/prompts';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../agent/agent';
import { AgentService, clipInput, type ChatThread } from '../agent/agentService';
import { createScriptedAgent, type Script } from '../agent/scriptedAgent';
import { memoryTranscripts, type ChatEntry } from '../agent/transcript';
import {
  added,
  approval,
  approvedAfter,
  draftOf,
  isEdited,
  moved,
  outlineOf,
  removed,
  retitled,
  slidesOf,
} from './outlineDraft';

/*
 * The outline in its card (AID-03): what the user makes of it there, and the approval that
 * carries it to the agent, also to a session that never saw the proposal (the bug hunt's
 * `ai-ui.md`, finding 8).
 */

const PROPOSED = [
  { title: 'Work plan 2027', archetype: 'hero', note: 'A big title' },
  { title: 'Where we stand', archetype: 'bigNumber' },
  { title: 'Three moves for the year', archetype: 'cards' },
];

describe('the outline in its card', () => {
  it('is read from the arguments of the call, as far as they hold one', () => {
    expect(outlineOf({ title: 'Plan', slides: [...PROPOSED, { archetype: 'hero' }, 7] })).toEqual({
      title: 'Plan',
      slides: PROPOSED,
    });
    expect(outlineOf(null)).toEqual({ slides: [] });
    expect(outlineOf({ slides: 'none' })).toEqual({ slides: [] });
  });

  it('is kept whole by the transcript: every slide an outline may have', () => {
    const tool = deckTools.find((t) => t.name === 'outline_propose')!;
    const slides = (count: number) =>
      Array.from({ length: count }, (_, i) => ({ title: `Slide ${i + 1}`, archetype: 'cards' }));
    // The most an outline takes is what the card must hold, or an approval would drop the rest.
    expect(tool.input.safeParse({ slides: slides(60) }).success).toBe(true);
    expect(tool.input.safeParse({ slides: slides(61) }).success).toBe(false);
    expect(outlineOf(clipInput({ slides: slides(60) })).slides).toHaveLength(60);
  });

  it('takes a new title, a move, a slide out and a slide in, each row staying the row it was', () => {
    const draft = draftOf(PROPOSED);
    expect(isEdited(draft, PROPOSED)).toBe(false);

    const renamed = retitled(draft, 1, 'Where we are today');
    expect(slidesOf(renamed)[1]).toEqual({ title: 'Where we are today', archetype: 'bigNumber' });
    expect(isEdited(renamed, PROPOSED)).toBe(true);

    const up = moved(draft, 2, -1);
    expect(up.map((slide) => slide.key)).toEqual([0, 2, 1]);
    expect(moved(up, 1, 1).map((slide) => slide.key)).toEqual([0, 1, 2]);
    // The ends hold.
    expect(moved(draft, 0, -1)).toEqual(draft);
    expect(moved(draft, 2, 1)).toEqual(draft);

    const fewer = removed(draft, 0);
    expect(slidesOf(fewer).map((slide) => slide.title)).toEqual([
      'Where we stand',
      'Three moves for the year',
    ]);

    // A slide that was added is a title and nothing else; until it has one it is not built.
    const more = added(fewer);
    expect(more.at(-1)).toEqual({ title: '', key: 3 });
    expect(slidesOf(more)).toHaveLength(2);
    expect(isEdited(added(draft), PROPOSED)).toBe(false);
    expect(slidesOf(retitled(more, 2, '  What we ask for  ')).at(-1)).toEqual({
      title: 'What we ask for',
    });
  });

  it('is approved with the outline as the card holds it, and says so when it was edited', () => {
    const plain = approval(PROPOSED, false, 'Hebrew');
    expect(plain.action).toEqual({ id: 'outline.approve' });
    expect(approvedOutline(plain.message)).toEqual(PROPOSED);
    expect(plain.message).toContain('as it stands');

    const draft = removed(retitled(draftOf(PROPOSED), 2, 'Three moves'), 0);
    const edited = approval(slidesOf(draft), true, 'Hebrew');
    expect(edited.action).toEqual({ id: 'outline.approve', params: { edited: 1 } });
    expect(edited.message).toContain('`outline` is the outline as they left it');
    expect(approvedOutline(edited.message)).toEqual([
      { title: 'Where we stand', archetype: 'bigNumber' },
      { title: 'Three moves', archetype: 'cards' },
    ]);
  });

  it('shows what was approved once it is answered, read from the approval itself', () => {
    const { message, action } = approval(slidesOf(removed(draftOf(PROPOSED), 1)), true, 'English');
    const entries: ChatEntry[] = [
      { type: 'user', id: 'u1', at: '', text: 'A deck about the plan' },
      { type: 'assistant', id: 'a1', at: '', parts: [] },
      { type: 'user', id: 'u2', at: '', text: message, action },
      { type: 'assistant', id: 'a2', at: '', parts: [] },
    ];
    expect(approvedAfter(entries, 'a1')?.map((slide) => slide.title)).toEqual([
      'Work plan 2027',
      'Three moves for the year',
    ]);
    // An outline that was answered in words, or not yet, has no approval to read.
    expect(approvedAfter(entries, 'a2')).toBeNull();
    expect(approvedAfter(entries, 'gone')).toBeNull();
    expect(approvedAfter([entries[0]!, entries[1]!, entries[0]!], 'a1')).toBeNull();
  });
});

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

describe('an outline that waits for an answer', () => {
  // The bug hunt's `ai-ui.md`, finding 8: the record a fresh session gets of the conversation
  // names the tools a turn called, not their arguments, so the outline was nowhere in it.
  it('is known to the session that builds it, also when the conversation could not be resumed', async () => {
    const propose: Script = {
      description: '',
      turns: [
        [
          {
            type: 'tool_call_started',
            id: 't1',
            name: 'outline_propose',
            input: { title: 'Work plan 2027', slides: PROPOSED },
            call: true,
          },
          { type: 'text_delta', text: 'This is the outline I propose.' },
          { type: 'turn_completed', outcome: 'completed', usage: {}, costUsd: 0, durationMs: 1 },
        ],
        [
          { type: 'text_delta', text: 'Building.' },
          { type: 'turn_completed', outcome: 'completed', usage: {}, costUsd: 0, durationMs: 1 },
        ],
      ],
    };
    const files = new Map<string, string>();
    const sends: { text: string; context: string }[] = [];
    const open = (forgetful: boolean) => {
      const bus = new CommandBus(createDeck({ id: 'd_1', slides: [createSlide({ id: 's_1' })] }));
      const agent = createScriptedAgent({ propose }, { speed: 0 });
      const lost = new Map<string, (event: AgentEvent) => void>();
      return new AgentService({
        client: {
          ...agent.client,
          start: (harnessId, thread, config, onEvent) => {
            if (!forgetful || !config.resume) {
              return agent.client.start(harnessId, thread, config, onEvent);
            }
            // The harness has no such conversation: another machine, or its history was cleaned.
            return agent.client
              .start(harnessId, thread, config, () => undefined)
              .then((id) => {
                lost.set(id, onEvent);
                return id;
              });
          },
          send: (sessionId, turn) => {
            const emit = lost.get(sessionId);
            if (!emit) {
              sends.push({ text: turn.text, context: turn.context ?? '' });
              return agent.client.send(sessionId, turn);
            }
            queueMicrotask(() => {
              emit({
                type: 'error',
                kind: 'resume_failed',
                message: 'No conversation',
                recoverable: false,
              });
              emit({
                type: 'turn_completed',
                outcome: 'failed',
                usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
                costUsd: null,
                durationMs: 0,
              });
              emit({ type: 'exited', code: 1 });
            });
            return Promise.resolve();
          },
        },
        connectBridge: agent.connectBridge,
        bus,
        api: createDeckApi(bus),
        selection: () => ({
          currentSlideId: 's_1',
          selectedSlideIds: [],
          selectedElementIds: [],
          editingElementId: null,
        }),
        transcripts: memoryTranscripts(files),
        settings: () => ({ harnessId: 'mock', qualityGate: false }),
      });
    };

    // The agent proposes an outline; the card waits. The deck is saved and closed.
    const before = open(false);
    const asked = before.thread({ kind: 'deck' });
    await asked.send('A deck about the work plan for 2027');
    await settled(asked);
    await before.dispose();

    // Opened where the harness cannot resume the conversation, the card is still open: it is
    // drawn from the transcript, and the user presses "Approve and build".
    const after = open(true);
    const thread = after.thread({ kind: 'deck' });
    await thread.load();
    const proposal = thread.store.getState().entries.at(-1)!;
    const part =
      proposal.type === 'assistant' ? proposal.parts.find((p) => p.type === 'tool') : undefined;
    const card = outlineOf(part?.type === 'tool' ? part.input : undefined);
    expect(card.slides).toEqual(PROPOSED);
    const { message, action } = approval(slidesOf(draftOf(card.slides)), false, 'English');
    await thread.send(message, { action });
    await settled(thread);

    // What the new session is told holds the outline it is asked to build.
    const told = sends.at(-1)!;
    expect(told.context).toContain('<slidr_conversation>');
    expect(told.text).toContain('Three moves for the year');
    expect(approvedOutline(told.text)).toEqual(PROPOSED);
    // And the card of the answered outline shows what was approved.
    expect(approvedAfter(thread.store.getState().entries, proposal.id)).toEqual(PROPOSED);
  });
});
