/**
 * `AgentService` (SPEC 11.7, WG11-T02): the agent as the editor sees it. It owns the chats of
 * the open deck, one thread per scope, and for each thread the harness session behind it:
 *
 * ```text
 * once             connectBridge(handler)
 * per session      api.list(scope) ─► bridge.open ─► systemPrompt ─► client.start
 * per message      startTurn ─► contextBlock ─► client.send
 * the agent works  handler(sessionKey, name, input) ─► api.call(turn, …)   (one undo step)
 * the agent stops  design check ─► clean: the turn ends
 *                                ─► not clean: a follow-up, twice at most (SPEC 9.4)
 * ```
 *
 * It knows no harness by name and no wire protocol: it works on `AgentClient` and `ToolBridge`,
 * which the app fills with the Tauri clients and the tests with fakes (ADR-010, ADR-022). The
 * order above is the one ADR-026 sets out.
 */
import {
  startTurn,
  type DeckApi,
  type LintService,
  type SelectionSnapshot,
  type SessionScope,
  type ToolResult,
  type Turn,
} from '@slidr/agent-tools';
import { ChangeDigest, findSlide, type ChangeEvent, type CommandBus } from '@slidr/model';
import { contextBlock, qualityGateMessage, systemPrompt } from '@slidr/prompts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  AgentError,
  type AgentClient,
  type AgentEvent,
  type HarnessDescriptor,
  type Scope,
  type ToolSource,
  type TurnOutcome,
  type Usage,
} from './agent';
import { GATE_ROUNDS, isClean, TurnWatch } from './qualityGate';
import type { ToolBridge, ToolHandler } from './toolBridge';
import type {
  AssistantEntry,
  AssistantPart,
  ChatEntry,
  ChatProblem,
  GateReport,
  ThreadRecord,
  ToolPart,
  ToolTarget,
  TranscriptStore,
  UserEntry,
} from './transcript';

/** What the user, or for now a developer, chose for the agent. */
export interface AgentSettings {
  /** The harness to run sessions on; the first registered one when absent. */
  harnessId?: string;
  /** One of the harness's models; its default when absent. */
  model?: string;
  effort?: string;
  /** Web search and fetch (AID-07, D15). On unless turned off. */
  webAccess?: boolean;
  /** The design check at the end of a turn (SPEC 9.4). On unless turned off. */
  qualityGate?: boolean;
}

export interface AgentServiceOptions {
  client: AgentClient;
  /** Connects the tool bridge; called once, before the first session. */
  connectBridge: (handler: ToolHandler) => Promise<ToolBridge>;
  bus: CommandBus;
  api: DeckApi;
  /** What the design check judges with: the lint service the Deck API was given. */
  lint?: LintService;
  /** The user's selection, for the context block. */
  selection: () => SelectionSnapshot;
  transcripts: TranscriptStore;
  /** Read when a session starts and when a turn ends. */
  settings?: () => AgentSettings;
  /** A slide the agent has just created or changed, for the Stage to follow (AID-06). */
  onSlideTouched?: (slideId: string) => void;
  /** The user stopped a turn: stop what its tools left running (image jobs). */
  onInterrupt?: () => void;
  now?: () => Date;
}

/** What the agent is doing right now (CHT-U03). */
export type Activity =
  | { kind: 'starting' }
  | { kind: 'thinking' }
  | { kind: 'writing' }
  | { kind: 'tool'; name: string; source: ToolSource; target?: ToolTarget }
  /** The design check is looking at what the turn left. */
  | { kind: 'checking' };

export interface ThreadState {
  /** The thread's transcript was read from the deck. */
  ready: boolean;
  entries: ChatEntry[];
  /** A turn is running. */
  busy: boolean;
  /** The user asked the running turn to stop. */
  stopping: boolean;
  activity: Activity | null;
}

/** A failure with the words the chat needs. */
class ProblemError extends Error {
  readonly problem: ChatProblem;

  constructor(problem: ChatProblem) {
    super(problem.message);
    this.problem = problem;
  }
}

function problemOf(error: unknown): ChatProblem {
  if (error instanceof ProblemError) return error.problem;
  if (error instanceof AgentError) return { kind: error.kind, message: error.message };
  return { kind: 'internal', message: error instanceof Error ? error.message : String(error) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Longest string a chip's detail keeps of a tool's arguments: a slide's HTML runs to pages. */
const MAX_INPUT_TEXT = 2000;
const MAX_INPUT_ITEMS = 50;

/** A tool's arguments as the chip keeps them: the same shape, with long values cut. */
export function clipInput(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_INPUT_TEXT ? `${value.slice(0, MAX_INPUT_TEXT)}…` : value;
  }
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    return value.slice(0, MAX_INPUT_ITEMS).map((item) => clipInput(item, depth + 1));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clipInput(item, depth + 1)]),
    );
  }
  return value;
}

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
const texts = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/**
 * Where a tool call points: the slide and elements it names, or, for a call that made a slide,
 * the slide it reports. What the chip navigates to (CHT-U02).
 */
export function toolTarget(input: unknown, result?: ToolResult): ToolTarget | undefined {
  const args = isRecord(input) ? input : {};
  const data = result?.ok ? result.data : {};
  const slideId = text(data.slideId) ?? text(args.slideId) ?? texts(data.slides)[0];
  const one = text(args.elementId);
  const elementIds = one ? [one] : texts(args.elementIds);
  if (!slideId && elementIds.length === 0) return undefined;
  return { ...(slideId ? { slideId } : {}), ...(elementIds.length > 0 ? { elementIds } : {}) };
}

/** The session's scope as the harness layer takes it: an import always names its file there. */
function harnessScope(scope: SessionScope): Scope {
  return scope.kind === 'import' ? { kind: 'import', file: scope.file ?? '' } : scope;
}

/** An id for a chat entry: unique in its transcript, and nothing more. */
function entryId(): string {
  return `m_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

const NO_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/** An open harness session of a thread. */
interface Session {
  /** The harness layer's id of the session. */
  sessionId: string;
  /** The bridge's id: what tool calls arrive under, and what the turns are started with. */
  sessionKey: string;
  harnessId: string;
  /** The session has a tool that returns a picture of a slide. */
  canLook: boolean;
}

/** One user message being answered: the agent's turn and the design check's rounds after it. */
interface Run {
  entryId: string;
  /** What the turn was started with, to send again if the session has to start over. */
  message: string;
  /** Every write of the run, follow-up rounds included, is this one transaction (MCP-07). */
  turn: Turn | null;
  watch: TurnWatch;
  /** Follow-ups the design check has sent. */
  round: number;
  wrote: boolean;
  stopRequested: boolean;
  /** The conversation could not be resumed: start over once the session has gone. */
  startOver: boolean;
  problem?: ChatProblem;
  usage: Usage;
  costUsd: number | null;
  durationMs: number;
}

/** A tool result waiting for its chip, or a chip waiting for its result. */
interface Pairing {
  name: string;
  key: string;
}

/** One chat of the deck: its transcript, and the session that continues it. */
export class ChatThread {
  readonly id: string;
  readonly scope: SessionScope;
  readonly store: StoreApi<ThreadState>;
  readonly #service: AgentService;
  readonly #options: AgentServiceOptions;
  #record: ThreadRecord;
  #session: Session | null = null;
  #run: Run | null = null;
  /** Events are handled one at a time, in order, though judging a turn's end takes a while. */
  #queue: Promise<void> = Promise.resolve();
  /** The watch of a run the design check gave up on, for "try to fix again" (QG-05). */
  #heldWatch: { entryId: string; watch: TurnWatch } | null = null;
  #chips: (Pairing & { partId: string })[] = [];
  #results: (Pairing & { target: ToolTarget | undefined })[] = [];
  #loading: Promise<void> | null = null;

  constructor(service: AgentService, options: AgentServiceOptions, scope: SessionScope) {
    this.#service = service;
    this.#options = options;
    this.scope = scope;
    this.id = threadIdOf(scope);
    this.#record = { scope };
    this.store = createStore<ThreadState>(() => ({
      ready: false,
      entries: [],
      busy: false,
      stopping: false,
      activity: null,
    }));
  }

  /** The bridge session the thread's tool calls arrive under, while it has one. */
  get sessionKey(): string | null {
    return this.#session?.sessionKey ?? null;
  }

  /** Reads the thread's transcript from the deck. Safe to call again. */
  load(): Promise<void> {
    if (this.#loading) return this.#loading;
    const loading = this.#options.transcripts.read(this.id).then(
      ({ record, entries }) => {
        // Another deck was opened while this one's chat was being read.
        if (this.#loading !== loading) return;
        if (record) this.#record = { ...record, scope: this.scope };
        // A message sent while the transcript was being read stays after what was read.
        this.store.setState((state) => ({
          ready: true,
          entries: [...entries, ...state.entries],
        }));
      },
      (error: unknown) => {
        if (this.#loading !== loading) return;
        console.error('The chat could not be read from the deck', error);
        this.store.setState({ ready: true });
      },
    );
    this.#loading = loading;
    return loading;
  }

  /**
   * Another deck is open in the window: the session and what the chat showed were the old
   * deck's. The thread itself stays, so whoever holds it now holds the new deck's chat.
   */
  reset(): void {
    const session = this.#session;
    this.#session = null;
    this.#run = null;
    this.#heldWatch = null;
    this.#record = { scope: this.scope };
    this.#loading = null;
    this.store.setState({
      ready: false,
      entries: [],
      busy: false,
      stopping: false,
      activity: null,
    });
    if (session) void this.#endSession(session);
    void this.load();
  }

  /** Sends a user message and starts the agent's turn. Ignored while a turn runs. */
  async send(message: string): Promise<void> {
    const trimmed = message.trim();
    if (!trimmed || this.store.getState().busy) return;
    const user: UserEntry = { type: 'user', id: entryId(), at: this.#now(), text: trimmed };
    this.store.setState((state) => ({ entries: [...state.entries, user] }));
    this.#persist([user]);
    await this.#begin(trimmed, new TurnWatch(), 0);
  }

  /**
   * "Try to fix again" (QG-05): sends the agent back to what the design check gave up on in
   * the entry, as a turn of its own with a round of follow-ups of its own.
   */
  async retryFixes(entryId: string): Promise<void> {
    const state = this.store.getState();
    const entry = state.entries.find((e) => e.id === entryId);
    if (state.busy || entry?.type !== 'assistant' || !entry.remaining) return;
    const deck = this.#options.bus.deck;
    const report: GateReport = {
      unseen: entry.remaining.unseen.filter((id) => findSlide(deck, id)),
      findings: entry.remaining.findings.filter((f) => findSlide(deck, f.slideId)),
    };
    if (isClean(report)) return;
    // The watch that judged the entry knows what its slides looked like before; without it
    // (the deck was reopened) the slides are judged as they are.
    let watch = this.#heldWatch?.entryId === entryId ? this.#heldWatch.watch : null;
    if (!watch) {
      watch = new TurnWatch();
      const slides = new Set([...report.unseen, ...report.findings.map((f) => f.slideId)]);
      watch.adopt([...slides]);
    }
    const followUp = qualityGateMessage({ deck, round: 1, rounds: GATE_ROUNDS, ...report });
    await this.#begin(followUp, watch, 1, { type: 'gate', round: 1, ...report });
  }

  /** Stops the running turn (CHT-U03). It ends as `interrupted`; what it wrote stays. */
  async stop(): Promise<void> {
    const run = this.#run;
    if (!run || run.stopRequested) return;
    run.stopRequested = true;
    this.store.setState({ stopping: true });
    this.#options.onInterrupt?.();
    const session = this.#session;
    if (session) {
      // Refused when no turn runs on the harness (the design check is judging): then the
      // flag alone ends the run.
      await this.#options.client.interrupt(session.sessionId).catch(() => undefined);
    }
  }

  /** Ends the thread's session. The transcript stays with the deck. */
  async close(): Promise<void> {
    const session = this.#session;
    this.#session = null;
    this.#run = null;
    this.#heldWatch = null;
    if (session) await this.#endSession(session);
  }

  /** A change the bus applied: the run's own writes are what the design check judges. */
  noteChange(event: ChangeEvent): void {
    const run = this.#run;
    if (!run?.turn || event.txId !== run.turn.txId) return;
    run.wrote = true;
    run.watch.changed(event);
    const touched = event.affected.slides.findLast((id) => findSlide(event.deck, id));
    if (touched) this.#options.onSlideTouched?.(touched);
  }

  /** Runs one tool call of the thread's session, inside the running turn. */
  async callTool(name: string, input: unknown): Promise<ToolResult> {
    const run = this.#run;
    if (!run?.turn) {
      throw new Error(`${name} was not run: no turn is running in this chat.`);
    }
    const { api } = this.#options;
    const writes = api.tools.find((tool) => tool.name === name)?.writes ?? false;
    const before = run.watch.mark();
    const result = await api.call(run.turn, name, input);
    // A read shows the slide as it was when asked; a write is rendered after it was made.
    run.watch.noteResult(result, writes ? run.watch.mark() : before);
    this.#pairResult(name, input, result);
    return result;
  }

  #now(): string {
    return (this.#options.now?.() ?? new Date()).toISOString();
  }

  #settings(): AgentSettings {
    return this.#options.settings?.() ?? {};
  }

  #persist(entries: readonly ChatEntry[]): void {
    this.#options.transcripts.append(this.id, entries).catch((error: unknown) => {
      console.error('The chat could not be saved with the deck', error);
    });
  }

  #saveRecord(): void {
    this.#options.transcripts.setRecord(this.id, this.#record).catch((error: unknown) => {
      console.error('The chat index could not be saved with the deck', error);
    });
  }

  #patchEntry(entryId: string, patch: (entry: AssistantEntry) => AssistantEntry): void {
    this.store.setState((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === entryId && entry.type === 'assistant' ? patch(entry) : entry,
      ),
    }));
  }

  #patchParts(entryId: string, patch: (parts: AssistantPart[]) => AssistantPart[]): void {
    this.#patchEntry(entryId, (entry) => ({ ...entry, parts: patch(entry.parts) }));
  }

  /** Starts answering: a new assistant entry, a session if there is none, and the first turn. */
  async #begin(message: string, watch: TurnWatch, round: number, first?: AssistantPart) {
    const entry: AssistantEntry = {
      type: 'assistant',
      id: entryId(),
      at: this.#now(),
      parts: first ? [first] : [],
    };
    const run: Run = {
      entryId: entry.id,
      message,
      turn: null,
      watch,
      round,
      wrote: false,
      stopRequested: false,
      startOver: false,
      usage: NO_USAGE,
      costUsd: 0,
      durationMs: 0,
    };
    this.#run = run;
    this.#heldWatch = null;
    this.#chips = [];
    this.#results = [];
    this.store.setState((state) => ({
      entries: [...state.entries, entry],
      busy: true,
      stopping: false,
      activity: { kind: 'starting' },
    }));
    await this.#startTurn(run);
  }

  /** Opens a session if the thread has none, and sends the run's message as a turn. */
  async #startTurn(run: Run): Promise<void> {
    try {
      const session = this.#session ?? (await this.#openSession());
      if (this.#run !== run) return;
      if (run.stopRequested) {
        this.#finish(run, 'interrupted');
        return;
      }
      const label = run.message.split('\n')[0]?.slice(0, 60);
      run.turn ??= startTurn(session.sessionKey, this.scope, label ? { label } : {});
      await this.#options.client.send(session.sessionId, {
        text: run.message,
        context: this.#context(session),
      });
      if (this.#run === run) this.store.setState({ activity: { kind: 'thinking' } });
    } catch (error) {
      if (this.#run !== run) return;
      run.problem = problemOf(error);
      this.#finish(run, 'failed');
    }
  }

  #context(session: Session): string {
    const { bus, selection, now } = this.#options;
    return contextBlock({
      scope: this.scope,
      deck: bus.deck,
      selection: selection(),
      // The same id the turn is started with: the digest leaves out the session's own writes.
      changes: this.#service.digest.take(session.sessionKey),
      ...(now ? { now: now() } : {}),
    });
  }

  async #openSession(): Promise<Session> {
    const { client, api, bus } = this.#options;
    const settings = this.#settings();
    const harness = await this.#service.harness(settings.harnessId);
    const status = await client.probe(harness.id);
    if (status.state !== 'ready') {
      throw new ProblemError({ kind: status.state, message: status.detail ?? '' });
    }
    const bridge = await this.#service.bridge();
    const tools = api.list(this.scope.kind);
    const { sessionKey, endpoint } = await bridge.open(tools);
    const names = tools.map((tool) => tool.name);
    // A conversation continues only on the harness it was held on.
    const resume =
      harness.capabilities.resume && this.#record.harnessId === harness.id
        ? this.#record.nativeSessionId
        : undefined;
    const token: Partial<Session> = {};
    let sessionId: string;
    try {
      sessionId = await client.start(
        harness.id,
        `${bus.deck.id}/${this.id}`,
        {
          scope: harnessScope(this.scope),
          systemPrompt: systemPrompt({ scope: this.scope.kind, tools: names }),
          toolEndpoint: endpoint,
          webAccess: settings.webAccess ?? true,
          ...(settings.model ? { model: settings.model } : {}),
          ...(settings.effort ? { effort: settings.effort } : {}),
          ...(resume ? { resume } : {}),
        },
        (event) => this.#enqueue(token, event),
      );
    } catch (error) {
      await bridge.close(sessionKey).catch(() => undefined);
      throw error;
    }
    const session = Object.assign(token, {
      sessionId,
      sessionKey,
      harnessId: harness.id,
      canLook: names.includes('slide_render'),
    });
    this.#service.digest.track(sessionKey);
    this.#session = session;
    return session;
  }

  async #endSession(session: Session): Promise<void> {
    this.#service.digest.forget(session.sessionKey);
    await this.#options.client.close(session.sessionId).catch(() => undefined);
    const bridge = await this.#service.bridge().catch(() => null);
    await bridge?.close(session.sessionKey).catch(() => undefined);
  }

  #enqueue(token: Partial<Session>, event: AgentEvent): void {
    this.#queue = this.#queue
      .then(() => this.#handle(token, event))
      .catch((error: unknown) => console.error('An agent event could not be handled', error));
  }

  async #handle(token: Partial<Session>, event: AgentEvent): Promise<void> {
    // A session the thread has let go of (another deck was opened) has nothing to say.
    const session = this.#session;
    if (!session || session !== token) return;
    const run = this.#run;
    switch (event.type) {
      case 'session_started':
        this.#record = {
          ...this.#record,
          harnessId: session.harnessId,
          nativeSessionId: event.nativeSessionId,
          updatedAt: this.#now(),
        };
        this.#saveRecord();
        return;
      case 'thinking_delta':
        if (run) this.store.setState({ activity: { kind: 'thinking' } });
        return;
      case 'text_delta':
        if (!run || !event.text) return;
        this.#patchParts(run.entryId, (parts) => {
          const last = parts.at(-1);
          return last?.type === 'text'
            ? [...parts.slice(0, -1), { type: 'text', text: last.text + event.text }]
            : [...parts, { type: 'text', text: event.text }];
        });
        this.store.setState({ activity: { kind: 'writing' } });
        return;
      case 'tool_call_started': {
        if (!run) return;
        const target = toolTarget(event.input);
        const part: ToolPart = {
          type: 'tool',
          id: event.id,
          name: event.name,
          source: event.source,
          input: clipInput(event.input),
          state: 'running',
          ...(target ? { target } : {}),
        };
        this.#patchParts(run.entryId, (parts) => [...parts, part]);
        this.store.setState({
          activity: {
            kind: 'tool',
            name: event.name,
            source: event.source,
            ...(target ? { target } : {}),
          },
        });
        if (event.source === 'app') this.#pairChip(event.id, event.name, event.input);
        return;
      }
      case 'tool_call_finished':
        if (!run) return;
        this.#patchParts(run.entryId, (parts) =>
          parts.map((part) =>
            part.type === 'tool' && part.id === event.id
              ? { ...part, state: event.ok ? 'ok' : 'failed', summary: event.summary }
              : part,
          ),
        );
        this.store.setState({ activity: { kind: 'thinking' } });
        return;
      case 'error':
        if (!run) return;
        if (event.kind === 'resume_failed') {
          // The conversation is not on this machine, or not on this harness any more: go on
          // in a fresh session, which knows the deck but not what was said (AGT-06 is P1).
          run.startOver = true;
          this.#record = { scope: this.scope };
          this.#saveRecord();
        } else {
          run.problem = { kind: event.kind, message: event.message };
        }
        return;
      case 'turn_completed':
        if (run) await this.#turnEnded(run, session, event);
        return;
      case 'exited': {
        this.#session = null;
        this.#service.digest.forget(session.sessionKey);
        const bridge = await this.#service.bridge().catch(() => null);
        await bridge?.close(session.sessionKey).catch(() => undefined);
        if (!run || this.#run !== run) return;
        if (run.startOver && !run.stopRequested) {
          // Nothing was written yet, so the turn can belong to the new session from its start.
          run.startOver = false;
          run.turn = null;
          await this.#startTurn(run);
        } else {
          // A session that ended with a turn still open: the guard closes turns first, so
          // this is a turn that could not start over.
          run.problem ??= { kind: 'process_exited', message: 'the session ended' };
          this.#finish(run, run.stopRequested ? 'interrupted' : 'failed');
        }
        return;
      }
    }
  }

  /** The harness ended a turn: the agent says it is done, was stopped, or failed. */
  async #turnEnded(
    run: Run,
    session: Session,
    event: Extract<AgentEvent, { type: 'turn_completed' }>,
  ): Promise<void> {
    run.usage = addUsage(run.usage, event.usage);
    run.durationMs += event.durationMs;
    run.costUsd =
      run.costUsd === null || event.costUsd === null ? null : run.costUsd + event.costUsd;
    // The turn failed on a conversation that cannot be resumed: `exited` follows, and the
    // message is sent again in a fresh session.
    if (run.startOver && event.outcome === 'failed') return;
    if (event.outcome !== 'completed' || run.stopRequested) {
      this.#finish(run, run.stopRequested ? 'interrupted' : event.outcome);
      return;
    }

    const { bus, lint, client } = this.#options;
    const gated = (this.#settings().qualityGate ?? true) && this.scope.kind !== 'import';
    let report: GateReport = { unseen: [], findings: [] };
    if (gated && run.watch.touched) {
      this.store.setState({ activity: { kind: 'checking' } });
      report = await run.watch.review(bus.deck, {
        ...(lint ? { lint } : {}),
        canLook: session.canLook,
      });
      if (this.#run !== run) return;
    }
    if (isClean(report) || run.stopRequested) {
      this.#finish(run, run.stopRequested ? 'interrupted' : 'completed');
      return;
    }
    if (run.round >= GATE_ROUNDS || this.#session !== session) {
      this.#finish(run, 'completed', report);
      return;
    }

    run.round++;
    const gate: AssistantPart = { type: 'gate', round: run.round, ...report };
    this.#patchParts(run.entryId, (parts) => [...parts, gate]);
    try {
      await client.send(session.sessionId, {
        text: qualityGateMessage({
          deck: bus.deck,
          round: run.round,
          rounds: GATE_ROUNDS,
          ...report,
        }),
        context: this.#context(session),
      });
      if (this.#run !== run) return;
      this.store.setState({ activity: { kind: 'thinking' } });
      // Stop was pressed while the follow-up was on its way, when there was no turn to stop.
      if (run.stopRequested) await client.interrupt(session.sessionId).catch(() => undefined);
    } catch (error) {
      if (this.#run !== run) return;
      run.problem = problemOf(error);
      this.#finish(run, 'failed', report);
    }
  }

  /** Closes the run's entry and keeps it with the deck. */
  #finish(run: Run, outcome: TurnOutcome, remaining?: GateReport): void {
    if (this.#run !== run) return;
    this.#run = null;
    this.#heldWatch = remaining ? { entryId: run.entryId, watch: run.watch } : null;
    this.#patchEntry(run.entryId, (entry) => ({
      ...entry,
      // A call the turn left open did not finish (the turn was stopped, or its session died).
      parts: entry.parts.map((part) =>
        part.type === 'tool' && part.state === 'running' ? { ...part, state: 'failed' } : part,
      ),
      outcome,
      ...(run.wrote && run.turn ? { txId: run.turn.txId } : {}),
      ...(remaining ? { remaining } : {}),
      ...(run.problem ? { problem: run.problem } : {}),
      usage: run.usage,
      costUsd: run.costUsd,
      durationMs: run.durationMs,
    }));
    this.store.setState({ busy: false, stopping: false, activity: null });
    const entry = this.store.getState().entries.find((e) => e.id === run.entryId);
    if (entry) this.#persist([entry]);
  }

  /** A chip appeared: give it the target of its result, if the result is already in. */
  #pairChip(partId: string, name: string, input: unknown): void {
    const key = JSON.stringify(input ?? {});
    const at = this.#results.findIndex((r) => r.name === name && r.key === key);
    if (at < 0) {
      this.#chips.push({ partId, name, key });
      return;
    }
    const [result] = this.#results.splice(at, 1);
    this.#setTarget(partId, result?.target);
  }

  /** A result came in: give its target to the chip of the call, if the chip is already shown. */
  #pairResult(name: string, input: unknown, result: ToolResult): void {
    const target = toolTarget(input, result);
    const key = JSON.stringify(input ?? {});
    const at = this.#chips.findIndex((c) => c.name === name && c.key === key);
    if (at < 0) {
      this.#results.push({ name, key, target });
      return;
    }
    const [chip] = this.#chips.splice(at, 1);
    if (chip) this.#setTarget(chip.partId, target);
  }

  #setTarget(partId: string, target: ToolTarget | undefined): void {
    const run = this.#run;
    if (!run || !target) return;
    this.#patchParts(run.entryId, (parts) =>
      parts.map((part) =>
        part.type === 'tool' && part.id === partId ? { ...part, target } : part,
      ),
    );
  }
}

/** The id of the thread of a scope: one continuing chat per deck, slide or object (AID-01). */
export function threadIdOf(scope: SessionScope): string {
  switch (scope.kind) {
    case 'deck':
      return 'deck';
    case 'slide':
      return `slide-${scope.slideId}`;
    case 'object':
      return `object-${[...scope.elementIds].sort().join('-')}`.slice(0, 64);
    case 'import':
      return 'import';
  }
}

export class AgentService {
  /** What changed behind each session's back since its last turn (CMD-08). */
  readonly digest: ChangeDigest;
  readonly #options: AgentServiceOptions;
  readonly #threads = new Map<string, ChatThread>();
  #bridge: Promise<ToolBridge> | null = null;
  #harnesses: Promise<HarnessDescriptor[]> | null = null;
  readonly #unsubscribe: () => void;

  constructor(options: AgentServiceOptions) {
    this.#options = options;
    this.digest = new ChangeDigest(options.bus);
    this.#unsubscribe = options.bus.subscribe((event) => {
      if (event.kind === 'reset') {
        this.#reset();
      } else if (event.kind === 'apply' && event.txId) {
        for (const thread of this.#threads.values()) thread.noteChange(event);
      }
    });
  }

  /** The chat of a scope in the open deck; made, and read from the deck, on first use. */
  thread(scope: SessionScope): ChatThread {
    const id = threadIdOf(scope);
    let thread = this.#threads.get(id);
    if (!thread) {
      thread = new ChatThread(this, this.#options, scope);
      this.#threads.set(id, thread);
      void thread.load();
    }
    return thread;
  }

  /**
   * "Undo the changes" of an agent's turn (CHT-U04, CMD-06). `info` says what it would take:
   * `otherEdits` are changes made since the turn began that would go with it, which the chat
   * warns about first. Undefined once the turn is no longer on the undo stack.
   */
  undoInfo(txId: string): { steps: number; otherEdits: number } | undefined {
    return this.#options.bus.transactionInfo(txId);
  }

  undoTurn(txId: string): boolean {
    return this.#options.bus.undoTransaction(txId);
  }

  /** The tool bridge, connected on first use and once only: a second connection would drop
   * the calls the first one is waiting on (ADR-022). */
  bridge(): Promise<ToolBridge> {
    this.#bridge ??= this.#options.connectBridge(this.#toolHandler).catch((error: unknown) => {
      this.#bridge = null;
      throw error;
    });
    return this.#bridge;
  }

  /** The harness to run on: the one asked for, or the first the app offers. */
  async harness(harnessId: string | undefined): Promise<HarnessDescriptor> {
    this.#harnesses ??= this.#options.client.harnesses().catch((error: unknown) => {
      this.#harnesses = null;
      throw error;
    });
    const harnesses = await this.#harnesses;
    const harness = harnessId ? harnesses.find((h) => h.id === harnessId) : harnesses[0];
    if (!harness) {
      throw new AgentError(
        'unknown_harness',
        harnessId ? `no harness "${harnessId}"` : 'the app offers no agent harness',
      );
    }
    return harness;
  }

  /** Ends every session. The chats stay with their decks. */
  async dispose(): Promise<void> {
    this.#unsubscribe();
    this.digest.dispose();
    await Promise.all([...this.#threads.values()].map((thread) => thread.close()));
    this.#threads.clear();
  }

  /** Every tool call of every session comes through here, under its session's key. */
  readonly #toolHandler: ToolHandler = (sessionKey, name, input) => {
    for (const thread of this.#threads.values()) {
      if (thread.sessionKey === sessionKey) return thread.callTool(name, input);
    }
    return Promise.reject(new Error(`${name} was not run: its chat is no longer open.`));
  };

  /**
   * Another deck is open: the sessions were the old deck's. The deck's own chat starts over
   * in place, since the panel that shows it holds on to it; a chat of a slide or an object is
   * about ids the new deck does not have, and goes.
   */
  #reset(): void {
    for (const [id, thread] of this.#threads) {
      if (thread.scope.kind === 'deck') {
        thread.reset();
      } else {
        this.#threads.delete(id);
        void thread.close();
      }
    }
  }
}
