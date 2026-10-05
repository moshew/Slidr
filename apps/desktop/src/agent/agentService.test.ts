import {
  createDeckApi,
  type CaptureService,
  type ConversionService,
  type LintFinding,
  type LintService,
  type Services,
} from '@slidr/agent-tools';
import { CommandBus, createDeck, createSlide, findSlide } from '@slidr/model';
import { describe, expect, it, vi } from 'vitest';
import errorsScript from '../../src-tauri/src/harness/fixtures/scripts/errors.json';
import { createSessions } from '../ai/sessions';
import {
  AgentError,
  type AgentClient,
  type AgentEvent,
  type SessionConfig,
  type UserTurn,
} from './agent';
import {
  AgentService,
  type AgentServiceOptions,
  type AgentSettings,
  type ChatThread,
} from './agentService';
import { createScriptedAgent, type Script, type ScriptStep } from './scriptedAgent';
import {
  memoryTranscripts,
  parseTranscript,
  type AssistantEntry,
  type GatePart,
  type ToolPart,
} from './transcript';

/*
 * `AgentService` over the scripted mock harness and the real Deck API, in Node: the tools here
 * are the ones that need the model alone, and lint and capture are stand-ins. The same service
 * with the real conversion engine and the real lint is in `agentScenario.browser.test.ts`.
 */

const done = (extra: Partial<ScriptStep> = {}): ScriptStep => ({
  type: 'turn_completed',
  outcome: 'completed',
  usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 },
  costUsd: 0.01,
  durationMs: 100,
  ...extra,
});
const say = (text: string): ScriptStep => ({ type: 'text_delta', text });
const call = (id: string, name: string, input: unknown): ScriptStep => ({
  type: 'tool_call_started',
  id,
  name,
  input,
  call: true,
});
const script = (...turns: ScriptStep[][]): Script => ({ description: '', turns });

/** Lint that knows one rule: a slide named "bad" overflows, and one named "empty" is too bare. */
const lint: LintService = {
  lint: (deck, slideIds) =>
    Promise.resolve(
      slideIds.flatMap((slideId): LintFinding[] => {
        const name = findSlide(deck, slideId)?.name;
        if (name === 'bad') {
          return [
            {
              rule: 'L01',
              severity: 'error',
              slideId,
              elementIds: [],
              message: 'The text is 40px taller than its box.',
            },
          ];
        }
        if (name === 'small') {
          return [
            {
              rule: 'L04',
              severity: 'warning',
              slideId,
              elementIds: [],
              message: 'The smallest text here is drawn at 18px.',
            },
          ];
        }
        return [];
      }),
    ),
};

const capture: CaptureService = {
  renderSlide: (_deck, _slideId, { width }) =>
    Promise.resolve({ mimeType: 'image/png', data: 'AAAA', width }),
  renderContactSheet: () => Promise.reject(new Error('not here')),
};

interface Recorded {
  starts: { thread: string; config: SessionConfig }[];
  sends: UserTurn[];
  closed: string[];
}

/** The client with every start and send written down. */
function recording(client: AgentClient): { client: AgentClient; seen: Recorded } {
  const seen: Recorded = { starts: [], sends: [], closed: [] };
  return {
    seen,
    client: {
      ...client,
      start: (harnessId, thread, config, onEvent) => {
        seen.starts.push({ thread, config });
        return client.start(harnessId, thread, config, onEvent);
      },
      send: (sessionId, turn) => {
        seen.sends.push(turn);
        return client.send(sessionId, turn);
      },
      close: (sessionId) => {
        seen.closed.push(sessionId);
        return client.close(sessionId);
      },
    },
  };
}

function setup(
  scripts: Record<string, Script>,
  options: {
    settings?: AgentSettings;
    /** The settings of each conversation, by the id of its thread; over `settings`. */
    settingsOf?: (threadId: string) => AgentSettings;
    files?: Map<string, string>;
    speed?: number;
    bus?: CommandBus;
    wrap?: (client: AgentClient) => AgentClient;
    brief?: AgentServiceOptions['brief'];
    storeImage?: AgentServiceOptions['storeImage'];
    /** Services of the Deck API beside the lint and the capture every test has. */
    services?: Services;
  } = {},
) {
  const bus =
    options.bus ??
    new CommandBus(createDeck({ slides: [createSlide({ id: 's_1', name: 'first' })] }), {
      validate: true,
    });
  const api = createDeckApi(bus, { lint, capture, ...options.services });
  const agent = createScriptedAgent(scripts, { speed: options.speed ?? 0 });
  const { client, seen } = recording(options.wrap ? options.wrap(agent.client) : agent.client);
  const transcripts = memoryTranscripts(options.files);
  const touched: string[] = [];
  const service = new AgentService({
    client,
    connectBridge: agent.connectBridge,
    bus,
    api,
    lint,
    selection: () => ({
      currentSlideId: bus.deck.slides[0]?.id ?? null,
      selectedSlideIds: [],
      selectedElementIds: [],
      editingElementId: null,
    }),
    transcripts,
    settings: (threadId) => ({
      harnessId: 'mock',
      ...options.settings,
      ...options.settingsOf?.(threadId),
    }),
    onSlideTouched: (slideId) => touched.push(slideId),
    ...(options.brief ? { brief: options.brief } : {}),
    ...(options.storeImage ? { storeImage: options.storeImage } : {}),
    now: () => new Date(2026, 9, 3, 12, 0, 0),
  });
  return { bus, service, seen, transcripts, touched, thread: service.thread({ kind: 'deck' }) };
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

async function ask(thread: ChatThread, message: string): Promise<AssistantEntry> {
  await thread.send(message);
  await settled(thread);
  const last = thread.store.getState().entries.at(-1);
  if (last?.type !== 'assistant') throw new Error("the last entry is not the agent's");
  return last;
}

const tools = (entry: AssistantEntry) =>
  entry.parts.filter((p): p is ToolPart => p.type === 'tool');
const gates = (entry: AssistantEntry) =>
  entry.parts.filter((p): p is GatePart => p.type === 'gate');

describe('a turn', () => {
  const rename = script([
    { type: 'thinking_delta', text: '' },
    say('Renaming '),
    say('the slide.'),
    call('t1', 'slide_update', { slideId: 's_1', name: 'Intro' }),
    say(' Done.'),
    done(),
  ]);

  it('streams text and tool chips into one entry, as one undo step', async () => {
    const { bus, service, thread, touched } = setup({ rename });
    const entry = await ask(thread, '  Rename the first slide  ');

    expect(thread.store.getState().entries.map((e) => e.type)).toEqual(['user', 'assistant']);
    expect(thread.store.getState().entries[0]).toMatchObject({ text: 'Rename the first slide' });
    expect(entry.parts).toEqual([
      { type: 'text', text: 'Renaming the slide.' },
      {
        type: 'tool',
        id: 't1',
        name: 'slide_update',
        source: 'app',
        input: { slideId: 's_1', name: 'Intro' },
        state: 'ok',
        summary: expect.stringContaining('"changed":["s_1"]') as string,
        target: { slideId: 's_1' },
      },
      { type: 'text', text: ' Done.' },
    ]);
    expect(entry).toMatchObject({
      outcome: 'completed',
      usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 30, cacheWriteTokens: 40 },
      costUsd: 0.01,
      durationMs: 100,
    });
    expect(thread.store.getState()).toMatchObject({ busy: false, stopping: false, activity: null });
    expect(touched).toEqual(['s_1']);

    expect(bus.deck.slides[0]!.name).toBe('Intro');
    expect(bus.undoStack.at(-1)).toMatchObject({
      txId: entry.txId,
      label: 'Rename the first slide',
    });
    expect(service.undoInfo(entry.txId!)).toEqual({ steps: 1, otherEdits: 0 });
    expect(service.undoTurn(entry.txId!)).toBe(true);
    expect(bus.deck.slides[0]!.name).toBe('first');
  });

  it('has no undo when it changed nothing', async () => {
    const { thread } = setup({ talk: script([say('Hello.'), done()]) });
    const entry = await ask(thread, 'Hi');
    expect(entry.outcome).toBe('completed');
    expect(entry.txId).toBeUndefined();
  });

  it('starts the session with the prompt and tools of its scope, and each turn with context', async () => {
    const { bus, thread, seen } = setup({ rename });
    await ask(thread, 'Rename it');
    const [start] = seen.starts;
    expect(start!.thread).toBe(`${bus.deck.id}/deck`);
    expect(start!.config.scope).toEqual({ kind: 'deck' });
    expect(start!.config.toolEndpoint?.url).toBeTruthy();
    expect(start!.config.webAccess).toBe(true);
    expect(start!.config.resume).toBeUndefined();
    // The prompt names the tools the session has: lint and capture run here, conversion not.
    expect(start!.config.systemPrompt).toContain('`slide_render`');
    expect(start!.config.systemPrompt).not.toContain('slide_create_from_html');

    expect(seen.sends[0]!.text).toBe('Rename it');
    expect(seen.sends[0]!.context).toMatch(/^<slidr_context>\ntoday: "2026-10-03"\nscope: "deck"/);
    expect(seen.sends[0]!.context).toContain('changed_since_last_turn: {}');

    // Between turns the user moves on; the agent's own rename is not news to it.
    bus.dispatch({ type: 'slide.update', slideId: 's_1', patch: { notes: null, hidden: true } });
    await ask(thread, 'Again');
    expect(seen.starts).toHaveLength(1);
    expect(seen.sends[1]!.context).toContain('changed_since_last_turn: {"slides":["s_1"]}');
  });

  it('refuses a second message while a turn runs, and an empty one always', async () => {
    const { thread, seen } = setup({ rename });
    await thread.send('   ');
    expect(thread.store.getState().entries).toEqual([]);
    await thread.send('One');
    await thread.send('Two');
    await settled(thread);
    expect(seen.sends.map((turn) => turn.text)).toEqual(['One']);
  });
});

describe('what changed behind the conversation (CMD-08)', () => {
  const talk = script([say('One.'), done()], [say('Two.'), done()]);
  const changed = (turn: UserTurn | undefined) =>
    turn?.context?.split('\n').find((line) => line.startsWith('changed_since_last_turn'));

  it('is still told after the session was closed for sitting idle (AGT-07)', async () => {
    const sessions: string[] = [];
    let harness!: AgentClient;
    const wrap = (client: AgentClient): AgentClient => {
      harness = client;
      return {
        ...client,
        start: async (harnessId, thread, config, onEvent) => {
          const id = await client.start(harnessId, thread, config, onEvent);
          sessions.push(id);
          return id;
        },
      };
    };
    const { bus, thread, seen } = setup({ talk }, { wrap });
    await ask(thread, 'First');

    // The user goes on by hand; ten quiet minutes later the harness layer closes the session,
    // and the user edits some more before the next message.
    bus.dispatch({ type: 'slide.update', slideId: 's_1', patch: { name: 'renamed by hand' } });
    await harness.close(sessions[0]!);
    await vi.waitFor(() => expect(thread.sessionKey).toBeNull());
    bus.dispatch({ type: 'slide.add', slide: createSlide({ id: 's_2' }) });

    expect((await ask(thread, 'Second')).outcome).toBe('completed');
    expect(seen.starts).toHaveLength(2);
    expect(changed(seen.sends.at(-1))).toBe(
      'changed_since_last_turn: {"slides":["s_1","s_2"],"slide_order":true}',
    );
    // Told once: the turn after it hears only of what came since.
    await ask(thread, 'Third');
    expect(changed(seen.sends.at(-1))).toBe('changed_since_last_turn: {}');
  });

  it('is still told when the next turn runs on another model (CHT-U06)', async () => {
    const settings: AgentSettings = { model: 'talk' };
    const { bus, thread, seen } = setup({ talk, other: talk }, { settings });
    await ask(thread, 'First');
    bus.dispatch({ type: 'slide.update', slideId: 's_1', patch: { name: 'renamed by hand' } });
    settings.model = 'other';
    await ask(thread, 'Second');
    expect(seen.starts).toHaveLength(2);
    expect(changed(seen.sends.at(-1))).toBe('changed_since_last_turn: {"slides":["s_1"]}');
  });

  it("leaves out the conversation's own writes, whichever session made them", async () => {
    const rename = script(
      [call('t1', 'slide_update', { slideId: 's_1', name: 'Intro' }), done()],
      [say('Two.'), done()],
    );
    const settings: AgentSettings = { model: 'rename' };
    const { thread, seen } = setup({ rename, other: talk }, { settings });
    await ask(thread, 'Rename');
    settings.model = 'other';
    await ask(thread, 'Go on');
    expect(changed(seen.sends.at(-1))).toBe('changed_since_last_turn: {}');
  });

  it('says that anything may have changed when the conversation goes on from an earlier run', async () => {
    const first = setup({ talk });
    await ask(first.thread, 'First');
    const files = new Map(first.transcripts.files);

    // The app was closed and the deck opened again, with a slide the conversation never saw.
    // Nobody collected what happened in between: an empty value would say "nothing".
    const bus = new CommandBus(
      createDeck({ slides: [createSlide({ id: 's_1' }), createSlide({ id: 's_2' })] }),
    );
    const again = setup({ talk }, { files, bus });
    await again.thread.load();
    await ask(again.thread, 'Second');
    expect(again.seen.starts[0]!.config.resume).toBeTruthy();
    expect(changed(again.seen.sends[0])).toBe(
      'changed_since_last_turn: {"slides":["s_1","s_2"],"slide_order":true,"theme":true}',
    );
    // From here on the changes are collected, and the next turn hears of them alone.
    await ask(again.thread, 'Third');
    expect(changed(again.seen.sends[1])).toBe('changed_since_last_turn: {}');

    // The chat of a slide can only have seen its slide.
    const slide = again.service.thread({ kind: 'slide', slideId: 's_2' });
    await ask(slide, 'About this slide');
    expect(changed(again.seen.sends[2])).toBe('changed_since_last_turn: {}');
    await again.service.dispose();
    const later = setup({ talk }, { files: again.transcripts.files, bus });
    const resumed = later.service.thread({ kind: 'slide', slideId: 's_2' });
    await resumed.load();
    await ask(resumed, 'More');
    expect(changed(later.seen.sends[0])).toBe(
      'changed_since_last_turn: {"slides":["s_2"],"slide_order":true,"theme":true}',
    );
  });
});

describe('the transcript', () => {
  const talk = script([say('שלום.'), done()]);

  it('is kept with the deck, and a reopened deck shows it and resumes the conversation', async () => {
    const first = setup({ talk });
    await ask(first.thread, 'היי');
    const files = first.transcripts.files;
    const kept = parseTranscript(files.get('deck.jsonl') ?? '');
    expect(kept.map((e) => e.type)).toEqual(['user', 'assistant']);
    expect(kept[1]).toMatchObject({
      outcome: 'completed',
      parts: [{ type: 'text', text: 'שלום.' }],
    });
    const index = JSON.parse(files.get('threads.json') ?? '{}') as {
      threads: Record<string, { harnessId: string; nativeSessionId: string }>;
    };
    expect(index.threads.deck).toMatchObject({ harnessId: 'mock', scope: { kind: 'deck' } });
    const native = index.threads.deck!.nativeSessionId;
    expect(native).toMatch(/^mock-/);

    // Another run of the app, the same deck file.
    const again = setup({ talk }, { files: new Map(files) });
    await again.thread.load();
    expect(again.thread.store.getState()).toMatchObject({ ready: true, busy: false });
    expect(again.thread.store.getState().entries).toEqual(kept);
    await ask(again.thread, 'ועוד משהו');
    expect(again.seen.starts[0]!.config.resume).toBe(native);
    expect(parseTranscript(again.transcripts.files.get('deck.jsonl') ?? '')).toHaveLength(4);
  });

  it('starts over in a fresh session when the conversation cannot be resumed', async () => {
    const files = memoryTranscripts();
    await files.setRecord('deck', {
      scope: { kind: 'deck' },
      harnessId: 'mock',
      nativeSessionId: 'from-another-machine',
    });
    // A harness that has no such conversation: the turn fails and the session ends.
    const wrap = (client: AgentClient): AgentClient => ({
      ...client,
      start: (harnessId, thread, config, onEvent) => {
        if (!config.resume) return client.start(harnessId, thread, config, onEvent);
        return client
          .start(harnessId, thread, config, () => undefined)
          .then((sessionId) => {
            lost.set(sessionId, onEvent);
            return sessionId;
          });
      },
      send: (sessionId, turn) => {
        const emit = lost.get(sessionId);
        if (!emit) return client.send(sessionId, turn);
        const events: AgentEvent[] = [
          {
            type: 'error',
            kind: 'resume_failed',
            message: 'No conversation found',
            recoverable: false,
          },
          {
            type: 'turn_completed',
            outcome: 'failed',
            usage: NO_USAGE,
            costUsd: null,
            durationMs: 0,
          },
          { type: 'exited', code: 1 },
        ];
        queueMicrotask(() => events.forEach(emit));
        return Promise.resolve();
      },
    });
    const lost = new Map<string, (event: AgentEvent) => void>();
    const { thread, seen, transcripts } = setup({ talk }, { files: files.files, wrap });

    const entry = await ask(thread, 'היי');
    expect(seen.starts.map((s) => s.config.resume)).toEqual(['from-another-machine', undefined]);
    expect(seen.sends.map((s) => s.text)).toEqual(['היי', 'היי']);
    expect(entry).toMatchObject({ outcome: 'completed', parts: [{ type: 'text', text: 'שלום.' }] });
    expect(entry.problem).toBeUndefined();
    // The attempt that could not resume is not part of the turn: its cost is the fresh one's.
    expect(entry.costUsd).toBe(0.01);
    const index = JSON.parse(transcripts.files.get('threads.json') ?? '{}') as {
      threads: Record<string, { nativeSessionId: string }>;
    };
    expect(index.threads.deck!.nativeSessionId).toMatch(/^mock-/);
  });
});

const NO_USAGE = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

describe('the design check', () => {
  it('sends the agent back for findings, and closes the turn when they are fixed', async () => {
    const fix = script(
      [call('t1', 'slide_update', { slideId: 's_1', name: 'bad' }), say('Done.'), done()],
      [call('t2', 'slide_update', { slideId: 's_1', name: 'good' }), say('Fixed.'), done()],
    );
    const { bus, service, thread, seen } = setup({ fix });
    const entry = await ask(thread, 'Break it');

    expect(seen.sends).toHaveLength(2);
    const followUp = seen.sends[1]!;
    expect(followUp.text).toMatch(/^<slidr_quality_gate>\nround: 1\nrounds: 2\nfix: \[/);
    expect(followUp.text).toContain('"rule":"L01"');
    expect(followUp.text).toContain('"slide":{"id":"s_1","number":1,"name":"bad"}');
    expect(followUp.text).toMatch(/<\/slidr_quality_gate>$/);
    expect(followUp.text).not.toContain('look:');
    expect(followUp.context).toMatch(/^<slidr_context>/);

    expect(entry.parts.map((p) => p.type)).toEqual(['tool', 'text', 'gate', 'tool', 'text']);
    expect(gates(entry)).toEqual([
      {
        type: 'gate',
        round: 1,
        unseen: [],
        findings: [expect.objectContaining({ rule: 'L01', slideId: 's_1' })],
      },
    ]);
    expect(entry.remaining).toBeUndefined();
    // Both rounds are billed to the one entry, and are one undo step.
    expect(entry).toMatchObject({ outcome: 'completed', costUsd: 0.02, durationMs: 200 });
    expect(entry.usage?.outputTokens).toBe(40);
    expect(service.undoInfo(entry.txId!)).toEqual({ steps: 1, otherEdits: 0 });
    service.undoTurn(entry.txId!);
    expect(bus.deck.slides[0]!.name).toBe('first');
  });

  it('gives up after two rounds and leaves the findings for the user, who can ask again', async () => {
    const stuck = script(
      [call('t1', 'slide_update', { slideId: 's_1', name: 'bad' }), done()],
      [say('I tried.'), done()],
      [say('I cannot.'), done()],
      [call('t2', 'slide_update', { slideId: 's_1', name: 'good' }), done()],
    );
    const { thread, seen } = setup({ stuck });
    const entry = await ask(thread, 'Break it');
    expect(seen.sends).toHaveLength(3);
    expect(seen.sends[2]!.text).toContain('round: 2');
    expect(seen.sends[2]!.text).toContain('This is the last round.');
    expect(gates(entry).map((g) => g.round)).toEqual([1, 2]);
    expect(entry.remaining?.findings.map((f) => f.rule)).toEqual(['L01']);

    await thread.retryFixes(entry.id);
    await settled(thread);
    const retry = thread.store.getState().entries.at(-1) as AssistantEntry;
    expect(seen.sends).toHaveLength(4);
    expect(seen.sends[3]!.text).toMatch(/^<slidr_quality_gate>\nround: 1/);
    expect(retry.parts.map((p) => p.type)).toEqual(['gate', 'tool']);
    expect(retry.remaining).toBeUndefined();
    // Nothing is left to retry, on either entry.
    await thread.retryFixes(retry.id);
    expect(seen.sends).toHaveLength(4);
  });

  it('asks for a look at a slide that was changed and not rendered (QG-01)', async () => {
    const look = script(
      [call('t1', 'slide_duplicate', { slideId: 's_1' }), done()],
      [call('t2', 'slide_render', { slideId: { $ref: 't1.slideId' } }), done()],
    );
    const { bus, thread, seen } = setup({ look });
    const entry = await ask(thread, 'Copy it');
    const copy = bus.deck.slides[1]!.id;
    expect(seen.sends[1]!.text).toContain(`look: [{"id":"${copy}","number":2,"name":"first"}]`);
    expect(seen.sends[1]!.text).not.toContain('fix:');
    expect(gates(entry)).toEqual([{ type: 'gate', round: 1, unseen: [copy], findings: [] }]);
    expect(tools(entry).map((t) => [t.name, t.state, t.summary])).toEqual([
      ['slide_duplicate', 'ok', expect.any(String)],
      ['slide_render', 'ok', expect.stringContaining('[image]')],
    ]);
    expect(entry.remaining).toBeUndefined();
  });

  it('holds the agent only to what its turn brought to a slide that was already there (QG-08)', async () => {
    const bus = new CommandBus(createDeck({ slides: [createSlide({ id: 's_1', name: 'bad' })] }));
    const notes = script([
      call('t1', 'slide_update', { slideId: 's_1', notes: 'Say hello first.' }),
      done(),
    ]);
    const { thread, seen } = setup({ notes }, { bus });
    const entry = await ask(thread, 'Write notes');
    // The overflow was the user's before the turn; notes do not change the picture either.
    expect(seen.sends).toHaveLength(1);
    expect(gates(entry)).toEqual([]);
    expect(entry.remaining).toBeUndefined();
  });

  it('lets warnings that are advice pass, and can be turned off', async () => {
    const small = script([call('t1', 'slide_update', { slideId: 's_1', name: 'small' }), done()]);
    const advice = setup({ small });
    expect(gates(await ask(advice.thread, 'Go'))).toEqual([]);

    const bad = script([call('t1', 'slide_update', { slideId: 's_1', name: 'bad' }), done()]);
    const off = setup({ bad }, { settings: { qualityGate: false } });
    const entry = await ask(off.thread, 'Go');
    expect(off.seen.sends).toHaveLength(1);
    expect(entry.remaining).toBeUndefined();
  });
});

describe('stopping and failing', () => {
  it('stops a running turn: it ends interrupted, keeps what it wrote, and is not checked', async () => {
    const slow = script([
      call('t1', 'slide_update', { slideId: 's_1', name: 'bad' }),
      { ...say('A long answer'), delayMs: 5000 },
      done(),
    ]);
    const { bus, thread, seen } = setup({ slow }, { speed: 1 });
    await thread.send('Go');
    await vi.waitFor(() => expect(bus.deck.slides[0]!.name).toBe('bad'));
    expect(thread.store.getState().busy).toBe(true);
    await thread.stop();
    await settled(thread);

    const entry = thread.store.getState().entries.at(-1) as AssistantEntry;
    expect(entry.outcome).toBe('interrupted');
    expect(entry.txId).toBeDefined();
    expect(gates(entry)).toEqual([]);
    expect(seen.sends).toHaveLength(1);
    expect(thread.store.getState()).toMatchObject({ busy: false, stopping: false });
  });

  describe('Stop pressed while the turn is still being prepared', () => {
    // A turn that renames the slide twice, a moment apart: what a turn that runs on leaves.
    const rename = script([
      call('t1', 'slide_update', { slideId: 's_1', name: 'one' }),
      { ...say('…'), delayMs: 5000 },
      call('t2', 'slide_update', { slideId: 's_1', name: 'two' }),
      done(),
    ]);
    /** Something the turn waits for, for as long as the test says. */
    function held() {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { gate, release };
    }

    it('while the brief is being made: the turn is never sent', async () => {
      const brief = held();
      let briefs = 0;
      const { bus, service, seen } = setup(
        { rename },
        {
          speed: 1,
          // The brief of a slide or object session renders the slide: it takes a moment.
          brief: async () => {
            briefs++;
            await brief.gate;
            return null;
          },
        },
      );
      const thread = service.thread({ kind: 'slide', slideId: 's_1' });
      const sending = thread.send('Rename the slide');
      await vi.waitFor(() => expect(briefs).toBe(1));

      await thread.stop();
      expect(thread.store.getState()).toMatchObject({ busy: true, stopping: true });
      brief.release();
      await sending;

      const entry = thread.store.getState().entries.at(-1) as AssistantEntry;
      expect(entry).toMatchObject({ outcome: 'interrupted', parts: [] });
      expect(entry.problem).toBeUndefined();
      expect(thread.store.getState()).toMatchObject({ busy: false, stopping: false });
      // Nothing of the turn reached the harness, and so nothing of it reached the deck.
      expect(seen.sends).toEqual([]);
      expect(bus.deck.slides[0]!.name).toBe('first');
      // The session is there for the next message, which is sent as any other.
      await thread.send('Rename the slide');
      await vi.waitFor(() => expect(bus.deck.slides[0]!.name).toBe('one'));
      await thread.stop();
      await settled(thread);
      expect(seen.starts).toHaveLength(1);
    });

    it('while the turn is on its way to the harness: it is stopped as soon as it is there', async () => {
      const way = held();
      let onItsWay = 0;
      let delivered = false;
      const interrupts: string[] = [];
      const wrap = (client: AgentClient): AgentClient => ({
        ...client,
        // The harness has the turn only once `send` has answered.
        send: async (sessionId, turn) => {
          onItsWay++;
          await way.gate;
          await client.send(sessionId, turn);
          delivered = true;
        },
        interrupt: (sessionId) => {
          interrupts.push(delivered ? 'a turn' : 'no turn yet');
          return client.interrupt(sessionId);
        },
      });
      const { bus, thread, seen } = setup({ rename }, { speed: 1, wrap });
      const sending = thread.send('Rename the slide');
      await vi.waitFor(() => expect(onItsWay).toBe(1));
      await thread.stop();
      way.release();
      await sending;
      await settled(thread);

      const entry = thread.store.getState().entries.at(-1) as AssistantEntry;
      expect(entry.outcome).toBe('interrupted');
      // The first press found no turn to stop; the service asked again once the turn was there.
      expect(interrupts).toEqual(['no turn yet', 'a turn']);
      expect(seen.sends).toHaveLength(1);
      expect(bus.deck.slides[0]!.name).not.toBe('two');
    });

    it('a second press asks the harness again', async () => {
      let asked = 0;
      const wrap = (client: AgentClient): AgentClient => ({
        ...client,
        // A harness that lets the first request go by, as one does that has no turn yet.
        interrupt: (sessionId) => (++asked === 1 ? Promise.resolve() : client.interrupt(sessionId)),
      });
      const { bus, thread } = setup({ rename }, { speed: 1, wrap });
      await thread.send('Rename the slide');
      await vi.waitFor(() => expect(bus.deck.slides[0]!.name).toBe('one'));
      await thread.stop();
      expect(thread.store.getState()).toMatchObject({ busy: true, stopping: true });
      await thread.stop();
      await settled(thread);
      expect(asked).toBe(2);
      expect((thread.store.getState().entries.at(-1) as AssistantEntry).outcome).toBe(
        'interrupted',
      );
      expect(bus.deck.slides[0]!.name).toBe('one');
    });

    it('while the files of the message are being stored: the message stays, and no turn begins', async () => {
      const stored = held();
      let attaching = 0;
      const wrap = (client: AgentClient): AgentClient => ({
        ...client,
        attach: async (_thread, file) => {
          attaching++;
          await stored.gate;
          return file.name;
        },
      });
      const { thread, seen } = setup({ rename }, { speed: 1, wrap });
      const file = { name: 'brief.md', mime: 'text/markdown', bytes: new Uint8Array([35]) };
      const sending = thread.send('Read this', { attachments: [file] });
      await vi.waitFor(() => expect(attaching).toBe(1));
      await thread.stop();
      expect(thread.store.getState()).toMatchObject({ busy: true, stopping: true });
      stored.release();
      await sending;

      const [user, reply] = thread.store.getState().entries;
      expect(user).toMatchObject({ type: 'user', text: 'Read this' });
      expect(reply).toMatchObject({ type: 'assistant', outcome: 'interrupted', parts: [] });
      expect(thread.store.getState()).toMatchObject({ busy: false, stopping: false });
      expect(seen.starts).toEqual([]);
      expect(seen.sends).toEqual([]);
    });
  });

  it('shows why a harness cannot run instead of starting a session (CHT-U09)', async () => {
    const wrap = (client: AgentClient): AgentClient => ({
      ...client,
      probe: () =>
        Promise.resolve({
          state: 'not_logged_in',
          version: '2.1.287',
          account: null,
          detail: 'Run the sign-in command.',
        }),
    });
    const { thread, seen } = setup({ talk: script([done()]) }, { wrap });
    const entry = await ask(thread, 'Hi');
    expect(entry).toMatchObject({
      outcome: 'failed',
      parts: [],
      problem: { kind: 'not_logged_in', message: 'Run the sign-in command.' },
    });
    expect(seen.starts).toEqual([]);
  });

  it('keeps the harness error with a turn that failed, and a rejected start too', async () => {
    const { thread } = setup({ errors: errorsScript });
    await ask(thread, 'First turn: a tool fails and the agent recovers');
    const quota = await ask(thread, 'Second turn: the usage limit');
    expect(quota).toMatchObject({ outcome: 'failed', problem: { kind: 'quota' } });

    const none = setup({ talk: script([done()]) }, { settings: { harnessId: 'nope' } });
    expect(await ask(none.thread, 'Hi')).toMatchObject({
      outcome: 'failed',
      problem: { kind: 'unknown_harness' },
    });
    const rejected = setup(
      { talk: script([done()]) },
      {
        wrap: (client) => ({
          ...client,
          start: () => Promise.reject(new AgentError('not_installed', 'no CLI')),
        }),
      },
    );
    expect(await ask(rejected.thread, 'Hi')).toMatchObject({
      outcome: 'failed',
      problem: { kind: 'not_installed', message: 'no CLI' },
    });
  });

  describe('without a connection (WG13-T03)', () => {
    const lost: ScriptStep[] = [
      {
        type: 'error',
        kind: 'network',
        message: "API Error: Can't reach the API server (ENOTFOUND)",
        recoverable: true,
      },
      done({ outcome: 'failed', costUsd: 0, durationMs: 175_000 }),
    ];

    it('sends a turn that failed for want of a connection once more, and the user sees one turn', async () => {
      const back = [
        call('t1', 'slide_update', { slideId: 's_1', name: 'Intro' }),
        say('Renamed.'),
        done(),
      ];
      const { bus, thread, seen } = setup({ flaky: script(lost, back) });
      const entry = await ask(thread, 'Rename the first slide');

      // One message of the user, one answer: the failed try left no error and no second entry.
      expect(thread.store.getState().entries.map((e) => e.type)).toEqual(['user', 'assistant']);
      expect(entry.outcome).toBe('completed');
      expect(entry.problem).toBeUndefined();
      expect(entry.parts.at(-1)).toEqual({ type: 'text', text: 'Renamed.' });
      expect(bus.deck.slides[0]!.name).toBe('Intro');
      // The second try went to the same session, and asks the agent to go on, not to begin.
      expect(seen.starts).toHaveLength(1);
      expect(seen.sends).toHaveLength(2);
      expect(seen.sends[0]!.text).toBe('Rename the first slide');
      expect(seen.sends[1]!.text).toContain('Go on with my last request');
      expect(seen.sends[1]!.context).toContain('<slidr_context>');
      // Both tries are the turn's time; the work of both is one undo step.
      expect(entry.durationMs).toBe(175_100);
      expect(bus.undoStack).toHaveLength(1);
    });

    it('tells the user when the second try fails too, and does not try a third time', async () => {
      const { thread, seen } = setup({ down: script(lost, lost, [say('Never.'), done()]) });
      const entry = await ask(thread, 'Rename the first slide');
      expect(entry).toMatchObject({
        outcome: 'failed',
        parts: [],
        problem: { kind: 'network', message: expect.stringContaining('ENOTFOUND') as string },
      });
      expect(seen.sends).toHaveLength(2);
      // The next message of the user is a turn like any other, with a retry of its own.
      const next = await ask(thread, 'Again');
      expect(next.outcome).toBe('completed');
      expect(seen.sends).toHaveLength(3);
    });

    it('does not try again a turn the user stopped, or one that failed for another reason', async () => {
      const refused: ScriptStep[] = [
        { type: 'error', kind: 'turn_failed', message: 'API Error: 400', recoverable: true },
        done({ outcome: 'failed' }),
      ];
      const { thread, seen } = setup({ refused: script(refused, [done()]) });
      expect(await ask(thread, 'Go')).toMatchObject({
        outcome: 'failed',
        problem: { kind: 'turn_failed' },
      });
      expect(seen.sends).toHaveLength(1);
    });
  });

  it('opens a new session for a turn whose session was closed under it (AGT-07)', async () => {
    const talk = script([say('One.'), done()], [say('Two.'), done()]);
    let refuse = false;
    const wrap = (client: AgentClient): AgentClient => ({
      ...client,
      send: (sessionId, turn) => {
        if (!refuse) return client.send(sessionId, turn);
        // As the harness layer answers for a session it closed for sitting idle.
        refuse = false;
        return Promise.reject(new AgentError('unknown_session', `unknown session: ${sessionId}`));
      },
    });
    const { thread, seen, transcripts } = setup({ talk }, { wrap });
    await ask(thread, 'First');
    const resumeId = (await transcripts.read('deck')).record?.nativeSessionId;
    expect(resumeId).toBeTruthy();

    refuse = true;
    const entry = await ask(thread, 'Second');
    // The user sees an answer, not an error: the turn went to a session that resumes the
    // conversation, and the one that was gone is let go of.
    expect(entry.outcome).toBe('completed');
    expect(entry.problem).toBeUndefined();
    expect(seen.starts).toHaveLength(2);
    expect(seen.starts[1]!.config.resume).toBe(resumeId);
    expect(seen.closed).toHaveLength(1);
    expect(seen.sends.map((turn) => turn.text)).toEqual(['First', 'Second', 'Second']);
    // Once only: a session that is gone again is the turn's failure.
    const always = setup(
      { talk },
      {
        wrap: (client) => ({
          ...client,
          send: () => Promise.reject(new AgentError('process_exited', 'the session has ended')),
        }),
      },
    );
    expect(await ask(always.thread, 'Hi')).toMatchObject({
      outcome: 'failed',
      problem: { kind: 'process_exited' },
    });
    expect(always.seen.starts).toHaveLength(2);
  });

  describe('a session that ends while the next turn is on its way to it', () => {
    const SLIDE = { kind: 'slide', slideId: 's_1' } as const;
    /** A brief that takes as long as the test says, from its `slow`-th asking on. */
    function slowBrief(slow: number) {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let asked = 0;
      const brief: AgentServiceOptions['brief'] = async () => {
        asked++;
        if (asked === slow) await gate;
        return null;
      };
      return { brief, release, asked: () => asked };
    }

    it('closed for sitting idle (AGT-07): the turn goes to a session that resumes', async () => {
      const talk = script([say('One.'), done()], [say('Two.'), done()]);
      const sessions: string[] = [];
      let harness!: AgentClient;
      const wrap = (client: AgentClient): AgentClient => {
        harness = client;
        return {
          ...client,
          start: async (harnessId, thread, config, onEvent) => {
            const id = await client.start(harnessId, thread, config, onEvent);
            sessions.push(id);
            return id;
          },
        };
      };
      const slide = slowBrief(2);
      const { service, seen, transcripts } = setup({ talk }, { wrap, brief: slide.brief });
      const thread = service.thread(SLIDE);
      await ask(thread, 'First');
      const resumeId = (await transcripts.read(thread.id)).record?.nativeSessionId;

      // The second message is on its way (the slide is being rendered for the brief) when the
      // harness layer closes the idle session: its last event is `exited`.
      const sending = thread.send('Second');
      await vi.waitFor(() => expect(slide.asked()).toBe(2));
      await harness.close(sessions[0]!);
      await vi.waitFor(() => expect(thread.sessionKey).toBeNull());
      slide.release();
      await sending;
      await settled(thread);

      // The user sees an answer: the chat shows nothing of the session that went (ADR-066).
      const entry = thread.store.getState().entries.at(-1) as AssistantEntry;
      expect(entry).toMatchObject({ outcome: 'completed', parts: [{ type: 'text' }] });
      expect(entry.problem).toBeUndefined();
      expect(seen.starts).toHaveLength(2);
      expect(seen.starts[1]!.config.resume).toBe(resumeId);
      expect(seen.sends.map((turn) => turn.text)).toEqual(['First', 'Second']);
    });

    it('a resume that fails before the message is sent: one fresh session, and the message once', async () => {
      const files = memoryTranscripts();
      await files.setRecord('slide-s_1', {
        scope: SLIDE,
        harnessId: 'mock',
        nativeSessionId: 'from-another-machine',
      });
      // A harness that is asked to resume a conversation it does not have says so before any
      // message, and leaves (the real CLI does: `real_cli_resume_of_an_unknown_conversation`).
      const wrap = (client: AgentClient): AgentClient => ({
        ...client,
        start: async (harnessId, thread, config, onEvent) => {
          if (config.resume !== 'from-another-machine') {
            return client.start(harnessId, thread, config, onEvent);
          }
          const id = await client.start(harnessId, thread, config, () => undefined);
          setTimeout(() => {
            onEvent({
              type: 'error',
              kind: 'resume_failed',
              message: 'No conversation found with session ID: from-another-machine',
              recoverable: false,
            });
            void client.close(id);
            onEvent({ type: 'exited', code: 1 });
          }, 0);
          return id;
        },
      });
      const talk = script([say('Hello.'), done()]);
      const slide = slowBrief(1);
      const { service, seen } = setup({ talk }, { wrap, files: files.files, brief: slide.brief });
      const thread = service.thread(SLIDE);
      await thread.load();
      const sending = thread.send('Go on');
      // The first brief is still being made when the harness gives the conversation up.
      await vi.waitFor(() => expect(slide.asked()).toBe(1));
      await vi.waitFor(() => expect(thread.sessionKey).toBeNull());
      slide.release();
      await sending;
      await settled(thread);

      const entry = thread.store.getState().entries.at(-1) as AssistantEntry;
      expect(entry).toMatchObject({
        outcome: 'completed',
        parts: [{ type: 'text', text: 'Hello.' }],
      });
      expect(entry.problem).toBeUndefined();
      // One session that could not resume, and one fresh session that took the message, once.
      expect(seen.starts.map((s) => s.config.resume)).toEqual(['from-another-machine', undefined]);
      expect(seen.sends.map((turn) => turn.text)).toEqual(['Go on']);
    });

    it('a session that says why it ended is not opened again', async () => {
      const talk = script([say('One.'), done()]);
      const slide = slowBrief(1);
      const events = new Map<string, (event: AgentEvent) => void>();
      const wrap = (client: AgentClient): AgentClient => ({
        ...client,
        start: async (harnessId, thread, config, onEvent) => {
          const id = await client.start(harnessId, thread, config, onEvent);
          events.set(id, onEvent);
          return id;
        },
      });
      const { service, seen } = setup({ talk }, { wrap, brief: slide.brief });
      const thread = service.thread(SLIDE);
      const sending = thread.send('Hello');
      await vi.waitFor(() => expect(slide.asked()).toBe(1));
      // The process dies of something the harness can name, while the brief is being made.
      const [emit] = [...events.values()];
      emit!({
        type: 'error',
        kind: 'process_exited',
        message: 'the CLI exited (code 1): out of memory',
        recoverable: false,
      });
      emit!({ type: 'exited', code: 1 });
      await vi.waitFor(() => expect(thread.sessionKey).toBeNull());
      slide.release();
      await sending;
      await settled(thread);

      expect(thread.store.getState().entries.at(-1)).toMatchObject({
        outcome: 'failed',
        problem: { kind: 'process_exited', message: 'the CLI exited (code 1): out of memory' },
      });
      expect(seen.starts).toHaveLength(1);
      expect(seen.sends).toEqual([]);
    });
  });

  it('does not keep a session that was being opened when another deck took the window', async () => {
    const talk = script([say('One.'), done()]);
    let release!: () => void;
    const starting = new Promise<void>((resolve) => {
      release = resolve;
    });
    let begun = 0;
    const wrap = (client: AgentClient): AgentClient => ({
      ...client,
      // The first session takes a while to start: the CLI is being launched.
      start: async (harnessId, thread, config, onEvent) => {
        if (++begun === 1) await starting;
        return client.start(harnessId, thread, config, onEvent);
      },
    });
    const { bus, thread, seen } = setup({ talk }, { wrap });
    const old = bus.deck.id;
    const sending = thread.send('Hello');
    await vi.waitFor(() => expect(begun).toBe(1));
    bus.reset(createDeck({ slides: [createSlide({ id: 's_1' })] }));
    release();
    await sending;

    // The session of the old deck is closed, not left for the new deck's first message.
    await vi.waitFor(() => expect(seen.closed).toHaveLength(1));
    expect(thread.sessionKey).toBeNull();
    await ask(thread, 'Hello again');
    expect(seen.starts.map((s) => s.thread)).toEqual([`${old}/deck`, `${bus.deck.id}/deck`]);
    expect(seen.sends.map((turn) => turn.text)).toEqual(['Hello again']);
  });

  it('leaves the old chat behind when another deck is opened', async () => {
    const rename = script([call('t1', 'slide_update', { slideId: 's_1', name: 'Intro' }), done()]);
    const { bus, service, thread, seen } = setup({ rename });
    await ask(thread, 'Rename');
    bus.reset(createDeck({ slides: [createSlide({ id: 's_1' })] }));
    await vi.waitFor(() => expect(seen.closed).toHaveLength(1));
    // The panel keeps the thread it has, and the thread is now the new deck's chat.
    expect(service.thread({ kind: 'deck' })).toBe(thread);
    await thread.load();
    expect(thread.store.getState()).toMatchObject({ ready: true, busy: false });
    // The store here is one "file" for both decks, so the transcript is read again; what
    // matters is that the session is new, under the new deck's key, and that its tool calls
    // find their chat.
    const entry = await ask(thread, 'Rename');
    expect(entry.parts).toMatchObject([{ type: 'tool', name: 'slide_update', state: 'ok' }]);
    expect(bus.deck.slides[0]!.name).toBe('Intro');
    expect(seen.starts).toHaveLength(2);
    expect(seen.starts[1]!.thread).toBe(`${bus.deck.id}/deck`);
    expect(seen.starts[1]!.thread).not.toBe(seen.starts[0]!.thread);
  });

  describe('a chat that is cut in the middle of a turn', () => {
    const long = script([say('A long '), { ...say('answer'), delayMs: 5000 }, done()]);
    const SLIDE = { kind: 'slide', slideId: 's_1' } as const;

    it('by another deck (File > New, Open): it is no longer at work, and nothing more is written of it', async () => {
      const { bus, service, transcripts } = setup({ long }, { speed: 1 });
      // What the panels and the status bar work with: every chat a panel opened that is busy.
      const sessions = createSessions(service);
      const slide = sessions.thread(SLIDE);
      const second = sessions.thread({ kind: 'deck' }, 'deck-c1');
      await slide.send('Go');
      await second.send('Go');
      await vi.waitFor(() => expect(slide.store.getState().activity?.kind).toBe('writing'));
      await vi.waitFor(() => expect(second.store.getState().activity?.kind).toBe('writing'));
      expect(sessions.working.getState().threads).toEqual([slide, second]);
      const kept = new Map(transcripts.files);

      bus.reset(createDeck({ slides: [createSlide({ id: 's_other' })] }));

      // Neither chat is the new deck's, and neither stays "working" in the status bar for good.
      for (const thread of [slide, second]) {
        expect(thread.store.getState()).toMatchObject({
          busy: false,
          stopping: false,
          activity: null,
        });
        expect(thread.store.getState().entries.at(-1)).toMatchObject({
          type: 'assistant',
          outcome: 'interrupted',
        });
      }
      expect(sessions.working.getState().threads).toEqual([]);
      // The chat's files are by now the new document's: the old chats write nothing into them.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(transcripts.files).toEqual(kept);
      expect(service.thread(SLIDE)).not.toBe(slide);
    });

    it('by closing it: the turn is closed as interrupted, and kept with the deck', async () => {
      const { thread, transcripts, seen } = setup({ long }, { speed: 1 });
      await thread.send('Go');
      await vi.waitFor(() => expect(thread.store.getState().activity?.kind).toBe('writing'));
      await thread.close();

      expect(thread.store.getState()).toMatchObject({ busy: false, activity: null });
      expect(seen.closed).toHaveLength(1);
      const kept = parseTranscript(transcripts.files.get('deck.jsonl') ?? '');
      expect(kept.at(-1)).toMatchObject({
        type: 'assistant',
        outcome: 'interrupted',
        parts: [{ type: 'text', text: 'A long ' }],
      });
      // The record of the conversation is there for the session that resumes it.
      expect((await transcripts.read('deck')).record?.nativeSessionId).toMatch(/^mock-/);
    });
  });
});

/** A conversion that takes as long as the test says: the capture window at work on a slide. */
function slowConversion() {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const conversion: ConversionService = {
    async htmlToSlide() {
      calls++;
      await gate;
      return { slide: createSlide({ id: 's_made' }), assets: [], editability: 1, notes: [] };
    },
    convertElement: () => Promise.reject(new Error('not in this test')),
  };
  return {
    conversion,
    calls: () => calls,
    /** Lets the conversion answer, and waits until the call that asked has dealt with it. */
    async answer() {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

/**
 * A harness as the real ones are: asked to stop, it ends the turn at once and gives up the tool
 * call it was waiting for, and the app is not told (ADR-022). The scripted one waits for the
 * call instead.
 */
function givingUp(client: AgentClient): AgentClient {
  const events = new Map<string, (event: AgentEvent) => void>();
  return {
    ...client,
    start: async (harnessId, thread, config, onEvent) => {
      const id = await client.start(harnessId, thread, config, onEvent);
      events.set(id, onEvent);
      return id;
    },
    interrupt: (sessionId) => {
      void client.interrupt(sessionId);
      events.get(sessionId)?.({
        type: 'turn_completed',
        outcome: 'interrupted',
        usage: NO_USAGE,
        costUsd: 0,
        durationMs: 5,
      });
      return Promise.resolve();
    },
  };
}

describe('a tool call that is still at work when its turn is over', () => {
  const build = script([
    call('t1', 'slide_create_from_html', { html: '<section>hello</section>' }),
    done(),
  ]);

  it('writes nothing into the document that was opened in the meantime', async () => {
    const slow = slowConversion();
    const { bus, thread } = setup({ build }, { services: { conversion: slow.conversion } });
    await thread.send('Build a slide');
    await vi.waitFor(() => expect(slow.calls()).toBe(1));

    // File > New or Open while the agent works: the bus holds another deck from here on.
    const other = createDeck({ slides: [createSlide({ id: 's_other' })] });
    bus.reset(other);
    await slow.answer();

    // The other file is as it was opened: no slide of the old deck's turn, and no undo step of
    // an agent it never had a turn with.
    expect(bus.deck).toBe(other);
    expect(bus.undoStack).toEqual([]);
  });

  it('writes nothing once the user stopped the turn, so the entry says all the turn did', async () => {
    const slow = slowConversion();
    const { bus, thread } = setup(
      { build },
      { services: { conversion: slow.conversion }, wrap: givingUp },
    );
    await thread.send('Build a slide');
    await vi.waitFor(() => expect(slow.calls()).toBe(1));
    await thread.stop();
    await settled(thread);
    await slow.answer();

    const entry = thread.store.getState().entries.at(-1) as AssistantEntry;
    expect(entry.outcome).toBe('interrupted');
    // The slide that was being converted did not arrive after the chat said "stopped", so a
    // turn without "undo the changes" (CHT-U04) is a turn that changed nothing.
    expect(bus.deck.slides.map((slide) => slide.id)).toEqual(['s_1']);
    expect(entry.txId).toBeUndefined();
    expect(bus.undoStack).toEqual([]);
  });

  it('keeps the undo of what the turn wrote before it was stopped', async () => {
    const slow = slowConversion();
    const both = script([
      call('t1', 'slide_update', { slideId: 's_1', name: 'Intro' }),
      call('t2', 'slide_create_from_html', { html: '<section>hello</section>' }),
      done(),
    ]);
    const { bus, service, thread } = setup(
      { both },
      { services: { conversion: slow.conversion }, wrap: givingUp },
    );
    await thread.send('Rename, then build');
    await vi.waitFor(() => expect(slow.calls()).toBe(1));
    await thread.stop();
    await settled(thread);
    await slow.answer();

    const entry = thread.store.getState().entries.at(-1) as AssistantEntry;
    expect(bus.deck.slides.map((slide) => slide.name ?? slide.id)).toEqual(['Intro']);
    expect(service.undoInfo(entry.txId!)).toEqual({ steps: 1, otherEdits: 0 });
    expect(service.undoTurn(entry.txId!)).toBe(true);
    expect(bus.deck.slides[0]!.name).toBe('first');
  });
});

describe('an action, and the brief of a session', () => {
  const talk = script([say('Done.'), done()]);
  const SLIDE = { kind: 'slide', slideId: 's_1' } as const;

  it('keeps the action a message stands for, and names the turn after it', async () => {
    const rename = script([call('t1', 'slide_update', { slideId: 's_1', name: 'Intro' }), done()]);
    const { bus, thread, transcripts, seen } = setup({ rename });
    await thread.send('<slidr_action>\naction: "slide.notes"\n</slidr_action>', {
      action: { id: 'slide.notes', params: { language: 'Hebrew' } },
      label: 'Speaker notes',
    });
    await settled(thread);

    // The agent gets the message; the chat and the file keep what it stands for.
    expect(seen.sends[0]!.text).toContain('<slidr_action>');
    const [user] = thread.store.getState().entries;
    expect(user).toMatchObject({
      type: 'user',
      action: { id: 'slide.notes', params: { language: 'Hebrew' } },
    });
    expect(parseTranscript(transcripts.files.get('deck.jsonl')!)[0]).toEqual(user);
    expect(bus.undoStack.at(-1)).toMatchObject({ label: 'Speaker notes' });
  });

  it('sends the brief after the context block, with its picture', async () => {
    const asked: { kind: string; fresh: boolean }[] = [];
    const { service, seen } = setup(
      { talk },
      {
        brief: (scope, { fresh }) => {
          asked.push({ kind: scope.kind, fresh });
          return Promise.resolve({
            text: '<slidr_session>\nslide: {}\n</slidr_session>',
            images: [{ mediaType: 'image/png', data: 'AAAA' }],
          });
        },
      },
    );
    const thread = service.thread(SLIDE);
    await ask(thread, 'Shorten this');
    await ask(thread, 'More');

    expect(seen.sends[0]!.context).toMatch(
      /^<slidr_context>[\s\S]*<\/slidr_context>\n<slidr_session>\nslide: \{\}\n<\/slidr_session>$/,
    );
    expect(seen.sends[0]!.images).toEqual([{ mediaType: 'image/png', data: 'AAAA' }]);
    // The conversation starts with the first turn; after it the agent has been told.
    expect(asked).toEqual([
      { kind: 'slide', fresh: true },
      { kind: 'slide', fresh: false },
    ]);
  });

  it('sends a turn as it is when there is nothing to tell, or the brief fails', async () => {
    let answer: 'nothing' | 'fails' = 'nothing';
    const { service, seen } = setup(
      { talk },
      {
        brief: () =>
          answer === 'nothing' ? Promise.resolve(null) : Promise.reject(new Error('no picture')),
      },
    );
    const thread = service.thread(SLIDE);
    await ask(thread, 'First');
    answer = 'fails';
    const entry = await ask(thread, 'Second');

    expect(entry.outcome).toBe('completed');
    for (const send of seen.sends) {
      expect(send.context).toMatch(/<\/slidr_context>$/);
      expect(send.images).toBeUndefined();
    }
  });

  it('asks for the brief in the name of the conversation: a slide may have several', async () => {
    const asked: string[] = [];
    const { service } = setup(
      { talk },
      {
        brief: (_scope, turn) => {
          asked.push(turn.threadId);
          return Promise.resolve(null);
        },
      },
    );
    await ask(service.thread(SLIDE), 'One');
    // What the first conversation was told of the slide, the second was not.
    const second = service.newConversation(SLIDE);
    await ask(second, 'Two');
    expect(asked).toEqual(['slide-s_1', second.id]);
  });

  it('is told again from the start when the conversation could not be resumed', async () => {
    const files = new Map<string, string>();
    const first = setup({ talk }, { files, brief: () => Promise.resolve(null) });
    await ask(first.service.thread(SLIDE), 'Hello');
    await first.service.dispose();

    // The deck is opened again: the conversation resumes, so the agent has been told already.
    const fresh: boolean[] = [];
    const second = setup(
      { talk },
      {
        files,
        brief: (_scope, turn) => {
          fresh.push(turn.fresh);
          return Promise.resolve(null);
        },
      },
    );
    const thread = second.service.thread(SLIDE);
    await thread.load();
    await ask(thread, 'Again');
    expect(second.seen.starts[0]!.config.resume).toBeTruthy();
    expect(fresh).toEqual([false]);
  });
});

describe('a session that cannot remember its conversation (AGT-06)', () => {
  const talk = script([say('שלום.'), done()], [say('ועוד.'), done()]);

  /** A harness that has no conversation to resume: the turn fails, and the session ends. */
  function forgetful() {
    const lost = new Map<string, (event: AgentEvent) => void>();
    return (client: AgentClient): AgentClient => ({
      ...client,
      start: (harnessId, thread, config, onEvent) => {
        if (!config.resume) return client.start(harnessId, thread, config, onEvent);
        return client
          .start(harnessId, thread, config, () => undefined)
          .then((sessionId) => {
            lost.set(sessionId, onEvent);
            return sessionId;
          });
      },
      send: (sessionId, turn) => {
        const emit = lost.get(sessionId);
        if (!emit) return client.send(sessionId, turn);
        const events: AgentEvent[] = [
          { type: 'error', kind: 'resume_failed', message: 'No conversation', recoverable: false },
          {
            type: 'turn_completed',
            outcome: 'failed',
            usage: NO_USAGE,
            costUsd: null,
            durationMs: 0,
          },
          { type: 'exited', code: 1 },
        ];
        queueMicrotask(() => events.forEach(emit));
        return Promise.resolve();
      },
    });
  }

  it('is told what was said, from the transcript the deck keeps', async () => {
    const rename = script(
      [
        call('t1', 'slide_update', { slideId: 's_1', name: 'Intro' }),
        say('שיניתי את השם.'),
        done(),
      ],
      [say('בבקשה.'), done()],
    );
    const first = setup({ rename });
    await ask(first.thread, 'קרא לשקף הראשון Intro');
    const files = new Map(first.transcripts.files);

    // The deck on another machine: the harness there has never heard of the conversation.
    const again = setup({ rename }, { files, wrap: forgetful() });
    await again.thread.load();
    const entry = await ask(again.thread, 'תודה');
    expect(entry).toMatchObject({ outcome: 'completed' });
    expect(entry.problem).toBeUndefined();
    expect(again.seen.starts.map((s) => Boolean(s.config.resume))).toEqual([true, false]);

    // The turn that failed to resume carried no record; the one that started over does.
    const [resumed, fresh] = again.seen.sends;
    expect(resumed!.context).not.toContain('<slidr_conversation>');
    expect(fresh!.text).toBe('תודה');
    const record = fresh!.context!.slice(fresh!.context!.indexOf('<slidr_conversation>'));
    expect(record.split('\n')).toEqual([
      '<slidr_conversation>',
      expect.stringMatching(/^This session continues a conversation it has no memory of/),
      'user: "קרא לשקף הראשון Intro"',
      'you: {"said":"שיניתי את השם.","did":["slide_update"]}',
      expect.stringMatching(/^Take it as what was asked and what was done/),
      '</slidr_conversation>',
    ]);
    // The message being answered is not part of the record, and the context block comes first.
    expect(record).not.toContain('תודה');
    expect(fresh!.context).toMatch(/^<slidr_context>/);

    // From here the session remembers: the next turn carries no record.
    await ask(again.thread, 'ועוד משהו');
    expect(again.seen.sends.at(-1)!.context).not.toContain('<slidr_conversation>');
  });

  it('is told nothing when the conversation begins with it, or resumes', async () => {
    const first = setup({ talk });
    await ask(first.thread, 'היי');
    expect(first.seen.sends[0]!.context).not.toContain('<slidr_conversation>');

    const again = setup({ talk }, { files: new Map(first.transcripts.files) });
    await again.thread.load();
    await ask(again.thread, 'שוב');
    expect(again.seen.starts[0]!.config.resume).toBeTruthy();
    expect(again.seen.sends[0]!.context).not.toContain('<slidr_conversation>');
  });

  it('is told when the harness changed, since a conversation resumes only where it was held', async () => {
    const first = setup({ talk });
    await ask(first.thread, 'היי');
    const files = new Map(first.transcripts.files);
    const index = JSON.parse(files.get('threads.json')!) as {
      threads: Record<string, { harnessId: string }>;
    };
    index.threads.deck!.harnessId = 'another-harness';
    files.set('threads.json', JSON.stringify(index));

    const again = setup({ talk }, { files });
    await again.thread.load();
    await ask(again.thread, 'שוב');
    expect(again.seen.starts[0]!.config.resume).toBeUndefined();
    expect(again.seen.sends[0]!.context).toContain('user: "היי"');
    expect(again.seen.sends[0]!.context).toContain('you: {"said":"שלום."}');
  });
});

describe('the model of the next turn (CHT-U06)', () => {
  const a = script([say('A1.'), done()], [say('A2.'), done()]);
  const b = script([say('B1.'), done()]);

  it('starts the session again on the new model, and resumes the conversation there', async () => {
    const settings: AgentSettings = { model: 'a' };
    const { thread, seen } = setup({ a, b }, { settings });
    await ask(thread, 'one');
    // The same settings: the same session.
    await ask(thread, 'two');
    expect(seen.starts).toHaveLength(1);
    expect(seen.closed).toHaveLength(0);

    settings.model = 'b';
    const entry = await ask(thread, 'three');
    expect(entry.parts).toEqual([{ type: 'text', text: 'B1.' }]);
    expect(seen.closed).toHaveLength(1);
    expect(seen.starts.map((s) => s.config.model)).toEqual(['a', 'b']);
    expect(seen.starts[1]!.config.resume).toMatch(/^mock-/);
    // Resumed, so the agent remembers: no record of the conversation goes with the turn.
    expect(seen.sends.at(-1)!.context).not.toContain('<slidr_conversation>');
    expect(thread.store.getState().entries).toHaveLength(6);
  });

  it('tells the session that resumes what the conversation had cost, so its first turn has a cost', async () => {
    const settings: AgentSettings = { model: 'a' };
    const { thread, seen } = setup({ a, b }, { settings });
    await ask(thread, 'one');
    await ask(thread, 'two');
    // A session that begins has cost nothing, and says so to nobody.
    expect(seen.starts[0]!.config.resumedCostUsd).toBeUndefined();

    // A harness reports a running total: the two turns so far are where the next one starts.
    settings.model = 'b';
    await ask(thread, 'three');
    expect(seen.starts[1]!.config.resumedCostUsd).toBeCloseTo(0.02);

    settings.model = 'a';
    await ask(thread, 'four');
    expect(seen.starts[2]!.config.resumedCostUsd).toBeCloseTo(0.03);
  });

  it('says nothing of the cost once a turn of the session had none', async () => {
    const settings: AgentSettings = { model: 'a' };
    const unknown = script([say('?'), done({ costUsd: null })]);
    const { thread, seen } = setup({ a, b, unknown }, { settings });
    await ask(thread, 'one');
    settings.model = 'unknown';
    await ask(thread, 'two');
    expect(seen.starts[1]!.config.resumedCostUsd).toBeCloseTo(0.01);
    // What that turn cost is not known, so neither is the total the next process goes on from.
    settings.model = 'b';
    await ask(thread, 'three');
    expect(seen.starts[2]!.config).not.toHaveProperty('resumedCostUsd');
  });

  it('counts effort and web access as settings of a session too', async () => {
    const settings: AgentSettings = { model: 'a' };
    const { thread, seen } = setup({ a }, { settings });
    await ask(thread, 'one');
    settings.effort = 'high';
    await ask(thread, 'two');
    settings.webAccess = false;
    await ask(thread, 'three');
    expect(seen.starts.map((s) => [s.config.effort ?? null, s.config.webAccess])).toEqual([
      [null, true],
      ['high', true],
      ['high', false],
    ]);
    // The design check is read at the end of each turn: changing it needs no new session.
    settings.qualityGate = false;
    await ask(thread, 'four');
    expect(seen.starts).toHaveLength(3);
  });

  it('asks for the settings of its own conversation, so one chat runs on a model of its own (AGT-04)', async () => {
    const own: Record<string, AgentSettings> = { 'deck-c1': { model: 'b' } };
    const { service, seen } = setup(
      { a, b },
      { settings: { model: 'a' }, settingsOf: (threadId) => own[threadId] ?? {} },
    );
    const first = service.thread({ kind: 'deck' });
    const second = service.thread({ kind: 'deck' }, 'deck-c1');
    await ask(first, 'one');
    const reply = await ask(second, 'two');
    expect(reply.parts).toEqual([{ type: 'text', text: 'B1.' }]);
    expect(seen.starts.map((s) => s.config.model)).toEqual(['a', 'b']);

    // The conversation gives its choice back: its session starts again on the model of the
    // app, and the session of the other conversation is left as it is.
    delete own['deck-c1'];
    await ask(second, 'three');
    await ask(first, 'four');
    expect(seen.starts.map((s) => s.config.model)).toEqual(['a', 'b', 'a']);
    expect(seen.closed).toHaveLength(1);
  });
});

describe('the files of a message (CHT-U05)', () => {
  const talk = script([say('Done.'), done()]);
  const png = {
    name: 'logo.png',
    mime: 'image/png',
    bytes: new Uint8Array([1, 2, 3]),
    use: 'logo',
  };
  const doc = { name: 'brief.md', mime: 'text/markdown', bytes: new Uint8Array([35, 32, 72]) };
  const asset = {
    id: 'c'.repeat(64),
    file: `${'c'.repeat(64)}.png`,
    mime: 'image/png',
    kind: 'image' as const,
    bytes: 3,
    origin: 'upload' as const,
  };

  function attaching(extra: { fail?: boolean } = {}) {
    const attached: { thread: string; name: string; bytes: number }[] = [];
    const wrap = (client: AgentClient): AgentClient => ({
      ...client,
      attach: (thread, file) => {
        if (extra.fail) return Promise.reject(new AgentError('io', 'the disk is full'));
        attached.push({ thread, name: file.name, bytes: file.bytes.length });
        return Promise.resolve(file.name);
      },
    });
    const made = setup({ talk }, { wrap, storeImage: () => Promise.resolve(asset) });
    return { ...made, attached };
  }

  it('go to the conversation and, a picture, to the deck; the turn is told where each is', async () => {
    const { bus, thread, seen, attached } = attaching();
    await thread.send('Use this logo', { attachments: [png, doc] });
    await settled(thread);

    expect(attached).toEqual([
      { thread: `${bus.deck.id}/deck`, name: 'logo.png', bytes: 3 },
      { thread: `${bus.deck.id}/deck`, name: 'brief.md', bytes: 3 },
    ]);
    const [turn] = seen.sends;
    expect(turn!.text).toBe('Use this logo');
    const block = turn!.context!.slice(turn!.context!.indexOf('<slidr_attachments>'));
    expect(block.split('\n').slice(0, 3)).toEqual([
      '<slidr_attachments>',
      `file: {"name":"logo.png","path":"logo.png","kind":"image","asset_id":"${asset.id}","use":"logo"}`,
      'file: {"name":"brief.md","path":"brief.md","kind":"file"}',
    ]);
    // The picture is shown to a harness that takes pictures; the document is only on disk.
    expect(turn!.images).toEqual([{ mediaType: 'image/png', data: 'AQID' }]);

    // The picture is among the deck's assets, registered inside the turn...
    expect(bus.deck.assets[asset.id]).toEqual(asset);
    const [user, reply] = thread.store.getState().entries;
    expect(user).toMatchObject({
      type: 'user',
      text: 'Use this logo',
      attachments: [
        { name: 'logo.png', kind: 'image', assetId: asset.id },
        { name: 'brief.md', kind: 'file' },
      ],
    });
    // ...and a turn that did nothing else has nothing for "undo changes" to take back.
    expect(reply).toMatchObject({ type: 'assistant', outcome: 'completed' });
    expect((reply as AssistantEntry).txId).toBeUndefined();
  });

  it('may be the whole message', async () => {
    const { service, thread, seen } = attaching();
    await thread.send('  ', { attachments: [doc] });
    await settled(thread);
    // A turn needs words: the harness gets a line of the app's, the chat shows the file alone.
    expect(seen.sends[0]!.text).toBe('See the files attached to this message.');
    expect(thread.store.getState().entries[0]).toMatchObject({ text: '', attachments: [{}] });
    // Its conversation is named after the file.
    expect((await service.conversations({ kind: 'deck' }))[0]!.title).toBe('brief.md');
  });

  it('that could not be stored fail the turn where the user sees why', async () => {
    const { thread, seen } = attaching({ fail: true });
    await thread.send('Use this', { attachments: [doc] });
    await settled(thread);
    expect(seen.sends).toHaveLength(0);
    const [user, reply] = thread.store.getState().entries;
    expect(user).toMatchObject({ text: 'Use this', attachments: [{ name: 'brief.md' }] });
    expect(reply).toMatchObject({
      outcome: 'failed',
      problem: { kind: 'io', message: 'the disk is full' },
    });
    expect(thread.store.getState().busy).toBe(false);
  });
});

describe('the conversations of a scope (CHT-U07)', () => {
  const talk = script([say('One.'), done()], [say('Two.'), done()]);
  const DECK = { kind: 'deck' } as const;

  it('are several: a new one beside the first, each with its own transcript and session', async () => {
    const { service, seen, transcripts } = setup({ talk });
    const first = service.thread(DECK);
    await ask(first, 'The first conversation, about the plan');

    const second = service.newConversation(DECK);
    expect(second).not.toBe(first);
    expect(second.id).toMatch(/^deck-c[0-9a-z]+$/);
    expect(service.thread(DECK)).toBe(second);
    expect(second.store.getState().entries).toEqual([]);
    await ask(second, 'Another subject');
    // Its own session, started fresh under its own thread key.
    expect(seen.starts.map((s) => s.thread.split('/')[1])).toEqual(['deck', second.id]);
    expect(seen.starts[1]!.config.resume).toBeUndefined();
    expect(parseTranscript(transcripts.files.get(`${second.id}.jsonl`) ?? '')).toHaveLength(2);
    expect(parseTranscript(transcripts.files.get('deck.jsonl') ?? '')).toHaveLength(2);

    // The list: the latest first, each under the start of its first message.
    const list = await service.conversations(DECK);
    expect(list.map((c) => [c.id, c.title])).toEqual(
      expect.arrayContaining([
        ['deck', 'The first conversation, about the plan'],
        [second.id, 'Another subject'],
      ]),
    );
    expect(list).toHaveLength(2);

    // Going back shows the first again, as it was.
    expect(service.showConversation(DECK, 'deck')).toBe(first);
    expect(service.thread(DECK)).toBe(first);
    expect(first.store.getState().entries).toHaveLength(2);
    // A slide has conversations of its own, and none of the deck's.
    expect(await service.conversations({ kind: 'slide', slideId: 's_1' })).toEqual([
      { id: 'slide-s_1' },
    ]);
  });

  it('a deck that is opened again shows the conversation that was written in last', async () => {
    let now = new Date(2026, 9, 3, 12, 0, 0);
    const bus = new CommandBus(createDeck({ slides: [createSlide({ id: 's_1' })] }));
    const files = new Map<string, string>();
    const open = () => {
      const agent = createScriptedAgent({ talk }, { speed: 0 });
      return new AgentService({
        client: agent.client,
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
        settings: () => ({ harnessId: 'mock' }),
        now: () => now,
      });
    };
    const before = open();
    await ask(before.thread(DECK), 'First');
    now = new Date(2026, 9, 3, 13, 0, 0);
    const later = before.newConversation(DECK);
    await ask(later, 'Second');
    await before.dispose();

    const after = open();
    expect(after.thread(DECK).id).toBe('deck');
    await after.restore(DECK);
    expect(after.thread(DECK).id).toBe(later.id);
    await after.thread(DECK).load();
    expect(after.thread(DECK).store.getState().entries).toHaveLength(2);
    // Restoring happens once: it never moves the user off a conversation they chose.
    after.showConversation(DECK, 'deck');
    await after.restore(DECK);
    expect(after.thread(DECK).id).toBe('deck');
  });
});

describe('the outline setting (AID-03)', () => {
  const talk = script([say('Done.'), done()]);

  it('travels in the context block of a deck session, and is an outline first unless set', async () => {
    const settings: AgentSettings = {};
    const { service, thread, seen } = setup({ talk }, { settings });
    await ask(thread, 'A deck about the plan');
    expect(seen.sends[0]!.context).toContain('\noutline: "first"\n');

    settings.outline = 'build';
    await ask(thread, 'Another');
    expect(seen.sends[1]!.context).toContain('\noutline: "build"\n');
    // The setting is the deck chat's: a slide session is told nothing of outlines.
    const slide = service.thread({ kind: 'slide', slideId: 's_1' });
    await ask(slide, 'Shorten this');
    expect(seen.sends[2]!.context).not.toContain('outline:');
  });
});
