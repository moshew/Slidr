import {
  createDeckApi,
  type CaptureService,
  type LintFinding,
  type LintService,
} from '@slidr/agent-tools';
import { CommandBus, createDeck, createSlide, findSlide } from '@slidr/model';
import { describe, expect, it, vi } from 'vitest';
import errorsScript from '../../src-tauri/src/harness/fixtures/scripts/errors.json';
import {
  AgentError,
  type AgentClient,
  type AgentEvent,
  type SessionConfig,
  type UserTurn,
} from './agent';
import { AgentService, type AgentSettings, type ChatThread } from './agentService';
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
    files?: Map<string, string>;
    speed?: number;
    bus?: CommandBus;
    wrap?: (client: AgentClient) => AgentClient;
  } = {},
) {
  const bus =
    options.bus ??
    new CommandBus(createDeck({ slides: [createSlide({ id: 's_1', name: 'first' })] }), {
      validate: true,
    });
  const api = createDeckApi(bus, { lint, capture });
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
    settings: () => ({ harnessId: 'mock', ...options.settings }),
    onSlideTouched: (slideId) => touched.push(slideId),
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

  it('leaves the old chat behind when another deck is opened', async () => {
    const rename = script([call('t1', 'slide_update', { slideId: 's_1', name: 'Intro' }), done()]);
    const { bus, service, thread, seen } = setup({ rename });
    await ask(thread, 'Rename');
    bus.reset(createDeck({ slides: [createSlide({ id: 's_1' })] }));
    await vi.waitFor(() => expect(seen.closed).toHaveLength(1));
    const next = service.thread({ kind: 'deck' });
    expect(next).not.toBe(thread);
    await next.load();
    // The store here is one "file" for both decks, so the transcript is read again; what
    // matters is that the session is new, under the new deck's key.
    await ask(next, 'Rename');
    expect(seen.starts).toHaveLength(2);
    expect(seen.starts[1]!.thread).toBe(`${bus.deck.id}/deck`);
    expect(seen.starts[1]!.thread).not.toBe(seen.starts[0]!.thread);
  });
});
