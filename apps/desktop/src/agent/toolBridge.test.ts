import {
  createDeckApi,
  startTurn,
  type ToolListing,
  type ToolResult,
  type Turn,
} from '@slidr/agent-tools';
import { CommandBus } from '@slidr/model';
import { hebrewDeck } from '@slidr/model/fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import contract from '../../src-tauri/src/harness/fixtures/contract.json';
import { AgentError } from './agent';
import { connectToolBridge } from './tauriAgent';
import {
  toReply,
  type BridgeCall,
  type BridgeSession,
  type BridgeTool,
  type ToolHandler,
  type ToolReply,
} from './toolBridge';

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

const shapes = contract.toolBridge;
const sorted = (keys: Iterable<string>) => [...keys].sort();

/** The fake Rust side: opens sessions, and collects the replies the webview sends. */
function fakeRust() {
  const replies: { callId: string; reply: ToolReply }[] = [];
  invoke.mockImplementation((command: string, args: unknown) => {
    if (command === 'tool_bridge_open') return Promise.resolve(shapes.endpoint);
    if (command === 'tool_bridge_reply') replies.push(args as (typeof replies)[number]);
    return Promise.resolve(command === 'tool_bridge_reply' ? true : undefined);
  });
  return replies;
}

/** Delivers a call the way Rust does: on the channel passed to `tool_bridge_connect`. */
function deliver(call: BridgeCall) {
  channels[0]?.onmessage(call);
}

const text = (data: Record<string, unknown>): ToolResult => ({ ok: true, data, images: [] });

beforeEach(() => {
  invoke.mockReset();
  channels.length = 0;
});

describe('the IPC contract (toolBridge in contract.json)', () => {
  it('a Deck API result becomes the reply the agent reads', () => {
    const results: ToolResult[] = [
      {
        ok: true,
        data: { id: 's_1', name: 'פתיחה' },
        images: [{ mimeType: 'image/png', data: 'iVBORw0KGgo=', width: 960, height: 540 }],
      },
      { ok: false, error: { code: 'not_found', message: 'Slide "s_9" does not exist.' } },
    ];
    expect(results.map(toReply)).toEqual(shapes.replies);
  });

  it('calls, endpoints and tools have the fields of the TS types', () => {
    const call: (keyof BridgeCall)[] = ['callId', 'sessionKey', 'name', 'input'];
    expect(sorted(Object.keys(shapes.call))).toEqual(sorted(call));
    const { sessionKey, ...endpoint } = shapes.endpoint;
    const session: BridgeSession = { sessionKey, endpoint };
    expect(sorted(Object.keys(session.endpoint))).toEqual(['token', 'url']);
    // What Rust accepts as a tool: a listing of the Deck API as it is, or with its own limit.
    const tools: BridgeTool[] = shapes.tools;
    expect(tools.map((tool) => tool.timeoutMs)).toEqual([undefined, 300000]);
    const listing = (tools: readonly ToolListing[]): readonly BridgeTool[] => tools;
    expect(listing([])).toEqual([]);
  });
});

describe('connectToolBridge', () => {
  it('connects with one channel, then opens and closes sessions', async () => {
    fakeRust();
    const bridge = await connectToolBridge(() => Promise.resolve(text({})));
    expect(channels).toHaveLength(1);
    expect(invoke).toHaveBeenCalledWith('tool_bridge_connect', { onCall: channels[0] });

    const tools: BridgeTool[] = shapes.tools;
    const session = await bridge.open(tools);
    expect(invoke).toHaveBeenLastCalledWith('tool_bridge_open', { tools });
    expect(session).toEqual({
      sessionKey: 'k',
      endpoint: { url: 'http://127.0.0.1:5000/t/k', token: 'secret' },
    });

    await bridge.close(session.sessionKey);
    expect(invoke).toHaveBeenLastCalledWith('tool_bridge_close', { sessionKey: 'k' });
    expect(channels).toHaveLength(1);
  });

  it('runs a call in the handler and sends its result back under the call id', async () => {
    const replies = fakeRust();
    const handler = vi.fn<ToolHandler>(() => Promise.resolve(text({ id: 's_1' })));
    await connectToolBridge(handler);

    deliver(shapes.call);
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    expect(handler).toHaveBeenCalledWith('k', 'slide_get', { slideId: 's_1' });
    expect(replies[0]).toEqual({
      callId: 'call_1',
      reply: { content: [{ type: 'text', text: '{"id":"s_1"}' }], isError: false },
    });
  });

  it('runs calls side by side: each answer goes back when its own call is done', async () => {
    const replies = fakeRust();
    const finish = new Map<string, (result: ToolResult) => void>();
    await connectToolBridge(
      (_sessionKey, name) => new Promise<ToolResult>((resolve) => finish.set(name, resolve)),
    );

    deliver({ callId: 'call_1', sessionKey: 'a', name: 'slide_render', input: {} });
    deliver({ callId: 'call_2', sessionKey: 'b', name: 'slide_get', input: {} });
    await vi.waitFor(() => expect(finish.size).toBe(2));
    finish.get('slide_get')?.(text({ fast: true }));
    await vi.waitFor(() => expect(replies).toHaveLength(1));
    finish.get('slide_render')?.(text({ slow: true }));
    await vi.waitFor(() => expect(replies).toHaveLength(2));
    expect(replies.map((sent) => [sent.callId, sent.reply.content[0]])).toEqual([
      ['call_2', { type: 'text', text: '{"fast":true}' }],
      ['call_1', { type: 'text', text: '{"slow":true}' }],
    ]);
  });

  it('answers with an error when the handler throws or rejects', async () => {
    const replies = fakeRust();
    await connectToolBridge((sessionKey) => {
      if (sessionKey === 'gone') throw new Error('No open session has the key "gone".');
      return Promise.reject(new Error('rejected'));
    });
    deliver({ ...shapes.call, sessionKey: 'gone' });
    deliver({ ...shapes.call, callId: 'call_2' });
    await vi.waitFor(() => expect(replies).toHaveLength(2));
    expect(replies.map((sent) => sent.reply)).toEqual([
      { content: [{ type: 'text', text: 'No open session has the key "gone".' }], isError: true },
      { content: [{ type: 'text', text: 'rejected' }], isError: true },
    ]);
  });

  it('lets a reply nobody waits for go', async () => {
    const sent: string[] = [];
    invoke.mockImplementation((command: string) => {
      sent.push(command);
      return command === 'tool_bridge_reply'
        ? Promise.reject(new Error('IPC failed'))
        : Promise.resolve(undefined);
    });
    await connectToolBridge(() => Promise.resolve(text({})));
    deliver(shapes.call);
    await vi.waitFor(() => expect(sent).toEqual(['tool_bridge_connect', 'tool_bridge_reply']));
    // The rejected reply is not an unhandled rejection: the next call is served as usual.
    deliver({ ...shapes.call, callId: 'call_2' });
    await vi.waitFor(() => expect(sent).toHaveLength(3));
  });

  it('rejects with AgentError', async () => {
    invoke.mockResolvedValueOnce(undefined);
    const bridge = await connectToolBridge(() => Promise.resolve(text({})));
    invoke.mockRejectedValueOnce({ kind: 'io', message: 'could not start the tool server' });
    const opened = bridge.open([]);
    await expect(opened).rejects.toBeInstanceOf(AgentError);
    await expect(opened).rejects.toMatchObject({ kind: 'io' });
  });
});

describe('the bridge over the Deck API, wired as a session wires it', () => {
  it("publishes the scope's tools and runs calls in the session's turn", async () => {
    const replies = fakeRust();
    const bus = new CommandBus(hebrewDeck(), { validate: true });
    const api = createDeckApi(bus);
    // What the owner of the sessions keeps: the running turn of each, by session key.
    const turns = new Map<string, Turn>();
    const bridge = await connectToolBridge((sessionKey, name, input) => {
      const turn = turns.get(sessionKey);
      if (!turn) throw new Error(`No open session has the key "${sessionKey}".`);
      return api.call(turn, name, input);
    });

    const scope = { kind: 'slide', slideId: 's_he_hero' } as const;
    const session = await bridge.open(api.list(scope.kind));
    const [, opened] = invoke.mock.lastCall as [string, { tools: ToolListing[] }];
    const offered = opened.tools.map((tool) => tool.name);
    expect(offered).toContain('text_set');
    expect(offered).not.toContain('slide_delete');
    turns.set(session.sessionKey, startTurn(session.sessionKey, scope));

    const input = { elementId: 'e_he_hero_title', markdown: 'כותרת חדשה' };
    deliver({ callId: 'call_1', sessionKey: session.sessionKey, name: 'text_set', input });
    // Outside the session's scope: the Deck API refuses, and the agent reads why.
    deliver({ callId: 'call_2', sessionKey: session.sessionKey, name: 'slide_delete', input: {} });
    deliver({ callId: 'call_3', sessionKey: 'not-open', name: 'text_set', input });
    await vi.waitFor(() => expect(replies).toHaveLength(3));

    const byCall = new Map(replies.map((sent) => [sent.callId, sent.reply]));
    const written = byCall.get('call_1');
    expect(written?.isError).toBe(false);
    const first = written?.content[0];
    const data = JSON.parse(first?.type === 'text' ? first.text : '{}') as { changed: string[] };
    expect(data.changed).toEqual(['e_he_hero_title']);
    expect(bus.undoStack).toHaveLength(1);
    expect(byCall.get('call_2')?.isError).toBe(true);
    expect(byCall.get('call_3')).toEqual({
      content: [{ type: 'text', text: 'No open session has the key "not-open".' }],
      isError: true,
    });
  });
});
