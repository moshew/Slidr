/**
 * The mock harness, in the webview: it plays the same recorded scripts as
 * `src-tauri/src/harness/mock.rs`, by the same rules, but needs no Rust. A plain browser page
 * (the Vite page, Playwright) and the tests of `AgentService` run their agent on it; in the app
 * the Rust mock does the same through the real tool bridge.
 *
 * A step with `"call": true` is carried out: the tool runs through the handler the service
 * connected, as a call through the bridge would, and its result is the step's
 * `tool_call_finished`. `{ "$ref": "t1.slideId" }` in a carried-out call's input stands for a
 * value of an earlier call's JSON result.
 */
import {
  AgentError,
  type AgentClient,
  type AgentEvent,
  type HarnessDescriptor,
  type SessionConfig,
} from './agent';
import { toReply, type ToolBridge, type ToolHandler } from './toolBridge';

/** One step of a script: an event in its IPC shape, the wait before it, and whether to run it. */
export type ScriptStep = Record<string, unknown> & {
  type: string;
  delayMs?: number;
  call?: boolean;
};

export interface Script {
  description: string;
  turns: ScriptStep[][];
}

export interface ScriptedAgentOptions {
  /** Multiplies the scripts' delays; 0 plays them at once. Default 1. */
  speed?: number;
}

export interface ScriptedAgent {
  client: AgentClient;
  connectBridge: (handler: ToolHandler) => Promise<ToolBridge>;
}

const HARNESS_ID = 'mock';
/** Length of a carried-out call's summary, in characters: what the real adapters keep. */
const SUMMARY_CHARS = 300;
/** The made-up scheme of a scripted session's tool endpoint; the rest of the URL is its key. */
const ENDPOINT = 'scripted:';

interface Session {
  script: Script;
  model: string;
  nativeId: string;
  /** The bridge session whose handler runs the carried-out calls. */
  sessionKey: string | null;
  emit: (event: AgentEvent) => void;
  started: boolean;
  nextTurn: number;
  /** A turn is playing. */
  busy: boolean;
  /** The playing turn was asked to stop. */
  stopping: boolean;
  /** Ends the wait the playing turn is in. */
  wake: (() => void) | null;
  playing: Promise<void> | null;
  /** What the carried-out calls returned, by call id. */
  results: Map<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `input` with every `{ "$ref": "<call id>.<path>" }` replaced by that value. */
function resolveRefs(input: unknown, results: ReadonlyMap<string, unknown>): unknown {
  if (Array.isArray(input)) return input.map((item) => resolveRefs(item, results));
  if (!isRecord(input)) return input;
  const keys = Object.keys(input);
  if (keys.length === 1 && typeof input.$ref === 'string') {
    const [call = '', ...path] = input.$ref.split('.');
    let value: unknown = results.get(call);
    for (const key of path) {
      value = Array.isArray(value) ? value[Number(key)] : isRecord(value) ? value[key] : undefined;
    }
    if (value === undefined) {
      throw new Error(
        `the script refers to "${input.$ref}", which no earlier call of the session returned`,
      );
    }
    return value;
  }
  return Object.fromEntries(keys.map((key) => [key, resolveRefs(input[key], results)]));
}

function shorten(summary: string): string {
  const chars = [...summary];
  return chars.length <= SUMMARY_CHARS ? summary : `${chars.slice(0, SUMMARY_CHARS).join('')}…`;
}

/** A step as the event it stands for, with the defaults the Rust types give it. */
function eventOf(step: ScriptStep): AgentEvent {
  const { delayMs: _delay, call: _call, ...event } = step;
  if (event.type === 'tool_call_started') return { source: 'app', ...event } as AgentEvent;
  return event as AgentEvent;
}

export function createScriptedAgent(
  scripts: Readonly<Record<string, Script>>,
  options: ScriptedAgentOptions = {},
): ScriptedAgent {
  const speed = options.speed ?? 1;
  const names = Object.keys(scripts);
  const sessions = new Map<string, Session>();
  let handler: ToolHandler | null = null;

  const descriptor: HarnessDescriptor = {
    id: HARNESS_ID,
    name: 'Scripted mock',
    capabilities: {
      streaming: true,
      resume: true,
      interrupt: true,
      imageInput: true,
      toolEndpoint: true,
      thinking: true,
    },
    models: names.map((name) => ({ id: name, label: name })),
    defaultModel: names[0] ?? null,
    effortLevels: [],
  };

  const session = (sessionId: string): Session => {
    const found = sessions.get(sessionId);
    if (!found) throw new AgentError('unknown_session', `no session ${sessionId}`);
    return found;
  };

  /** Runs one carried-out call and returns its `tool_call_finished`. */
  async function carryOut(
    current: Session,
    id: string,
    name: string,
    input: unknown,
  ): Promise<AgentEvent> {
    if (!current.sessionKey || !handler) {
      return {
        type: 'tool_call_finished',
        id,
        ok: false,
        summary: 'the session has no tool endpoint',
      };
    }
    let reply;
    try {
      reply = toReply(await handler(current.sessionKey, name, input));
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      reply = { content: [{ type: 'text' as const, text }], isError: true };
    }
    const parts = reply.content.map((part) => (part.type === 'text' ? part.text : '[image]'));
    if (!reply.isError && parts[0] !== undefined) {
      try {
        current.results.set(id, JSON.parse(parts[0]));
      } catch {
        // Not JSON: nothing for a later call to refer to.
      }
    }
    return {
      type: 'tool_call_finished',
      id,
      ok: !reply.isError,
      summary: shorten(parts.join('\n')),
    };
  }

  async function play(current: Session, steps: readonly ScriptStep[]): Promise<void> {
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ms);
        current.wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });

    for (const step of steps) {
      // Even at speed 0 a step yields, so a turn never finishes inside the `send` that began it.
      if (!current.stopping) await wait((step.delayMs ?? 0) * speed);
      if (current.stopping) break;
      const event = eventOf(step);
      if (!step.call || event.type !== 'tool_call_started') {
        current.emit(event);
        continue;
      }
      let input: unknown;
      try {
        input = resolveRefs(event.input, current.results);
      } catch (error) {
        current.emit(event);
        current.emit({
          type: 'tool_call_finished',
          id: event.id,
          ok: false,
          summary: shorten(error instanceof Error ? error.message : String(error)),
        });
        continue;
      }
      current.emit({ ...event, input });
      const finished = await carryOut(current, event.id, event.name, input);
      // A real harness whose turn was stopped mid-call never reports the call's result.
      if (current.stopping) break;
      current.emit(finished);
    }
    current.wake = null;
    current.busy = false;
    if (current.stopping) {
      // What a real harness emits for an interrupted turn: no more output.
      current.emit({ type: 'turn_completed', outcome: 'interrupted' });
    }
  }

  const client: AgentClient = {
    harnesses: () => Promise.resolve([descriptor]),
    probe: (harnessId) =>
      harnessId === HARNESS_ID
        ? Promise.resolve({ state: 'ready', version: '0', account: null, detail: null })
        : Promise.reject(new AgentError('unknown_harness', `no harness ${harnessId}`)),

    start(harnessId, _thread, config: SessionConfig, onEvent) {
      if (harnessId !== HARNESS_ID) {
        return Promise.reject(new AgentError('unknown_harness', `no harness ${harnessId}`));
      }
      const model = config.model ?? names[0] ?? '';
      const script = scripts[model];
      if (!script) {
        return Promise.reject(new AgentError('invalid_input', `no mock script named "${model}"`));
      }
      const url = config.toolEndpoint?.url;
      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, {
        script,
        model,
        nativeId: config.resume ?? `mock-${crypto.randomUUID()}`,
        sessionKey: url?.startsWith(ENDPOINT) ? url.slice(ENDPOINT.length) : null,
        emit: onEvent,
        started: false,
        nextTurn: 0,
        busy: false,
        stopping: false,
        wake: null,
        playing: null,
        results: new Map(),
      });
      return Promise.resolve(sessionId);
    },

    // There is no session folder here: the file is taken, and its place is the one Rust gives.
    attach: (_thread, file) => Promise.resolve(file.name),

    send(sessionId, turn) {
      const current = sessions.get(sessionId);
      if (!current) {
        return Promise.reject(new AgentError('unknown_session', `no session ${sessionId}`));
      }
      if (current.busy) {
        return Promise.reject(new AgentError('busy', 'a turn is still running in this session'));
      }
      if (!turn.text.trim() && !turn.images?.length) {
        return Promise.reject(
          new AgentError('invalid_input', 'the turn has no text and no images'),
        );
      }
      const steps = current.script.turns[current.nextTurn % current.script.turns.length] ?? [];
      current.nextTurn++;
      const first = !current.started;
      current.started = true;
      current.busy = true;
      current.stopping = false;
      current.playing = Promise.resolve().then(() => {
        if (first) {
          current.emit({
            type: 'session_started',
            nativeSessionId: current.nativeId,
            model: current.model,
          });
        }
        return play(current, steps);
      });
      return Promise.resolve();
    },

    async interrupt(sessionId) {
      const current = session(sessionId);
      if (!current.busy) return;
      current.stopping = true;
      current.wake?.();
      await current.playing;
    },

    async close(sessionId) {
      const current = sessions.get(sessionId);
      if (!current) return;
      if (current.busy) {
        current.stopping = true;
        current.wake?.();
      }
      await current.playing;
      sessions.delete(sessionId);
      current.emit({ type: 'exited', code: 0 });
    },
  };

  return {
    client,
    connectBridge(connected) {
      handler = connected;
      return Promise.resolve({
        open: () => {
          const sessionKey = crypto.randomUUID().replaceAll('-', '');
          return Promise.resolve({
            sessionKey,
            endpoint: { url: `${ENDPOINT}${sessionKey}`, token: '' },
          });
        },
        close: () => Promise.resolve(),
      });
    },
  };
}
