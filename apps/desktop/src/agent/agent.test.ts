import { beforeEach, describe, expect, it, vi } from 'vitest';
import contract from '../../src-tauri/src/harness/fixtures/contract.json';
import errorsScript from '../../src-tauri/src/harness/fixtures/scripts/errors.json';
import importScript from '../../src-tauri/src/harness/fixtures/scripts/import.json';
import slideChatScript from '../../src-tauri/src/harness/fixtures/scripts/slide-chat.json';
import {
  AGENT_ERROR_KINDS,
  AgentError,
  type AgentEvent,
  type Capabilities,
  type HarnessDescriptor,
  type HarnessState,
  type HarnessStatus,
  type SessionConfig,
  type ToolSource,
  type TurnOutcome,
  type Usage,
  type UserTurn,
} from './agent';
import { tauriAgent } from './tauriAgent';

const { invoke, channels } = vi.hoisted(() => ({
  invoke: vi.fn(),
  channels: [] as { onmessage: (message: unknown) => void }[],
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  Channel: class {
    onmessage: (message: unknown) => void;
    constructor(onmessage: (message: unknown) => void) {
      this.onmessage = onmessage;
      channels.push(this);
    }
  },
}));

/** Every field of every event, as the TS types name them. The compiler checks the names. */
const EVENT_FIELDS: { [T in AgentEvent['type']]: (keyof Extract<AgentEvent, { type: T }>)[] } = {
  session_started: ['type', 'nativeSessionId', 'model'],
  text_delta: ['type', 'text'],
  thinking_delta: ['type', 'text'],
  tool_call_started: ['type', 'id', 'name', 'source', 'input'],
  tool_call_finished: ['type', 'id', 'ok', 'summary'],
  turn_completed: ['type', 'outcome', 'usage', 'costUsd', 'durationMs'],
  error: ['type', 'kind', 'message', 'recoverable'],
  exited: ['type', 'code'],
};
const USAGE_FIELDS: (keyof Usage)[] = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
];
const SOURCES: ToolSource[] = ['app', 'harness'];
const OUTCOMES: TurnOutcome[] = ['completed', 'interrupted', 'failed'];
const STATES: HarnessState[] = ['ready', 'not_installed', 'not_logged_in', 'unavailable'];

const sorted = (keys: Iterable<string>) => [...keys].sort();

/** Checks one event against the TS types. `exact`: every field present (what Rust emits). */
function expectEvent(event: Record<string, unknown>, exact: boolean) {
  const type = event.type as AgentEvent['type'];
  const fields: string[] = EVENT_FIELDS[type];
  expect(fields, `unknown event type ${String(event.type)}`).toBeDefined();
  if (exact) expect(sorted(Object.keys(event))).toEqual(sorted(fields));
  else expect(fields).toEqual(expect.arrayContaining(Object.keys(event)));
  if (type === 'tool_call_started') expect(SOURCES).toContain(event.source);
  if (type === 'error') expect(AGENT_ERROR_KINDS).toContain(event.kind);
  if (type === 'turn_completed') {
    expect(OUTCOMES).toContain(event.outcome);
    const usage = Object.keys(event.usage ?? {});
    if (exact) expect(sorted(usage)).toEqual(sorted(USAGE_FIELDS));
    else expect(USAGE_FIELDS).toEqual(expect.arrayContaining(usage));
  }
}

describe('the IPC contract (src-tauri/src/harness/fixtures/contract.json)', () => {
  it('events have exactly the fields of the TS types', () => {
    for (const event of contract.events) expectEvent(event, true);
    expect(sorted(new Set(contract.events.map((e) => e.type)))).toEqual(
      sorted(Object.keys(EVENT_FIELDS)),
    );
  });

  it('error kinds are the same closed set', () => {
    expect(contract.errorKinds).toEqual([...AGENT_ERROR_KINDS]);
    expect(sorted(Object.keys(contract.error))).toEqual(['kind', 'message']);
  });

  it('descriptors and statuses have the fields of the TS types', () => {
    const descriptor: (keyof HarnessDescriptor)[] = [
      'id',
      'name',
      'capabilities',
      'models',
      'defaultModel',
      'effortLevels',
    ];
    const capabilities: (keyof Capabilities)[] = [
      'streaming',
      'resume',
      'interrupt',
      'imageInput',
      'toolEndpoint',
      'thinking',
    ];
    const status: (keyof HarnessStatus)[] = ['state', 'version', 'account', 'detail'];
    expect(sorted(Object.keys(contract.descriptor))).toEqual(sorted(descriptor));
    expect(sorted(Object.keys(contract.descriptor.capabilities))).toEqual(sorted(capabilities));
    for (const s of contract.statuses) {
      expect(sorted(Object.keys(s))).toEqual(sorted(status));
      expect(STATES).toContain(s.state);
    }
  });

  it('the TS input types express the inputs Rust accepts', () => {
    const configs: SessionConfig[] = [
      { scope: { kind: 'deck' }, systemPrompt: 'You build slides.' },
      {
        scope: { kind: 'slide', slideId: 's_1' },
        systemPrompt: 'p',
        toolEndpoint: { url: 'http://127.0.0.1:5000/t/k', token: 'secret' },
        webAccess: false,
        model: 'sonnet',
        effort: 'high',
        resume: 'b2969d29',
      },
      {
        scope: { kind: 'object', slideId: 's_1', elementIds: ['e_1', 'e_2'] },
        systemPrompt: 'p',
        toolEndpoint: null,
        model: null,
      },
      { scope: { kind: 'import', file: 'C:/decks/plan.html' }, systemPrompt: 'p' },
    ];
    const turns: UserTurn[] = [
      { text: 'Make an opening slide' },
      {
        text: 'Like this',
        context: '<slidr_context>scope: slide</slidr_context>',
        images: [{ mediaType: 'image/png', data: 'iVBORw0KGgo=' }],
      },
    ];
    expect(configs).toEqual(contract.configs);
    expect(turns).toEqual(contract.turns);
  });

  it('the mock harness scripts hold only events the UI knows', () => {
    for (const script of [importScript, slideChatScript, errorsScript]) {
      for (const turn of script.turns) {
        for (const step of turn) {
          // `call` marks a tool call the mock carries out; it is the script's, not the event's.
          const { delayMs, call, ...event } = step as Record<string, unknown>;
          expect(typeof delayMs).toBe('number');
          expect([undefined, true]).toContain(call);
          expectEvent(event, false);
        }
        expect(turn.at(-1)?.type).toBe('turn_completed');
      }
    }
  });
});

describe('tauriAgent', () => {
  beforeEach(() => {
    invoke.mockReset();
    channels.length = 0;
  });

  it('starts a session with a channel that delivers its events', async () => {
    invoke.mockResolvedValue('session-1');
    const received: AgentEvent[] = [];
    const config: SessionConfig = { scope: { kind: 'deck' }, systemPrompt: 'p' };
    const id = await tauriAgent.start('mock', 'deck1/main', config, (e) => received.push(e));
    expect(id).toBe('session-1');
    expect(channels).toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith('agent_start', {
      harnessId: 'mock',
      thread: 'deck1/main',
      config,
      onEvent: channels[0],
    });
    const event: AgentEvent = { type: 'text_delta', text: 'hi' };
    channels[0]?.onmessage(event);
    expect(received).toEqual([event]);
  });

  it('maps every call to its command', async () => {
    invoke.mockResolvedValue(undefined);
    await tauriAgent.harnesses();
    await tauriAgent.probe('mock');
    await tauriAgent.send('s', { text: 'hello' });
    await tauriAgent.interrupt('s');
    await tauriAgent.close('s');
    expect(invoke.mock.calls).toEqual([
      ['agent_harnesses', undefined],
      ['agent_probe', { harnessId: 'mock' }],
      ['agent_send', { sessionId: 's', turn: { text: 'hello' } }],
      ['agent_interrupt', { sessionId: 's' }],
      ['agent_close', { sessionId: 's' }],
    ]);
  });

  it('rejects with AgentError', async () => {
    invoke.mockRejectedValueOnce({ kind: 'busy', message: 'a turn is still running' });
    const busy = tauriAgent.send('s', { text: 'again' });
    await expect(busy).rejects.toBeInstanceOf(AgentError);
    await expect(busy).rejects.toMatchObject({ kind: 'busy', message: 'a turn is still running' });

    invoke.mockRejectedValueOnce({ kind: 'no_such_kind', message: 'x' });
    await expect(tauriAgent.close('s')).rejects.toMatchObject({ kind: 'internal' });
    invoke.mockRejectedValueOnce('IPC failed');
    await expect(tauriAgent.close('s')).rejects.toMatchObject({
      kind: 'internal',
      message: 'IPC failed',
    });
  });
});
