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
import {
  ChangeDigest,
  findSlide,
  type AssetMeta,
  type ChangeEvent,
  type ChangeSummary,
  type CommandBus,
} from '@slidr/model';
import {
  attachmentsBlock,
  contextBlock,
  conversationSummary,
  qualityGateMessage,
  systemPrompt,
  type AttachedFile,
  type Exchange,
} from '@slidr/prompts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import {
  AgentError,
  type AgentClient,
  type AgentEvent,
  type HarnessDescriptor,
  type ImageAttachment,
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
  EntryAction,
  EntryAttachment,
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
  /**
   * What a deck chat does with a deck asked for by its subject alone (AID-03): `first` shows an
   * outline for the user to approve before anything is built, `build` builds at once. `first`
   * unless set.
   */
  outline?: 'first' | 'build';
}

/** What `outline` is when nobody set it. The one switch of the outline flow (WG11-T05). */
export const DEFAULT_OUTLINE: NonNullable<AgentSettings['outline']> = 'first';

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
  /**
   * Read when a session starts and when a turn ends, for the thread that asks: a conversation
   * may have a model and an effort of its own over the app's (AGT-04).
   */
  settings?: (threadId: string) => AgentSettings;
  /** A slide the agent has just created or changed, for the Stage to follow (AID-06). */
  onSlideTouched?: (slideId: string) => void;
  /** The user stopped a turn: stop what its tools left running (image jobs). */
  onInterrupt?: () => void;
  /**
   * What a session is told about its subject beside the context block (AIS-01, AIO-01): the
   * slide or the elements in full, and a picture of the slide. Asked before every user turn;
   * null when the session has nothing new to hear. `fresh`: the conversation starts here, so
   * the agent has not been told anything yet. `threadId`: the conversation that asks; a scope
   * may have several, and what one was told the others were not.
   */
  brief?: (
    scope: SessionScope,
    turn: { fresh: boolean; threadId: string },
  ) => Promise<TurnBrief | null>;
  /**
   * Stores a picture the user attached with the open document, so that the agent can place it
   * on a slide; returns its entry for the asset table. Absent where there is nowhere to keep it.
   */
  storeImage?: (file: Attachment) => Promise<AssetMeta | undefined>;
  now?: () => Date;
}

/** A file the user sends with a message (CHT-U05): a document to read, a picture to look at. */
export interface Attachment {
  name: string;
  /** The media type as the browser reported it; empty when it did not. */
  mime: string;
  bytes: Uint8Array;
  /** What the form it was chosen in called it, when it said: "logo". */
  use?: string;
}

/** What `brief` adds to a turn. */
export interface TurnBrief {
  /** Goes after the turn's context block. */
  text: string;
  /** For a harness that takes pictures; left out for one that does not. */
  images: ImageAttachment[];
}

/** How a message was sent, when it was not typed. */
export interface SendOptions {
  /** The action the message stands for (SPEC 4.3): kept with the entry, for the chat to show. */
  action?: EntryAction;
  /** The turn's name in the undo history; the message's first line when absent. */
  label?: string;
  attachments?: readonly Attachment[];
}

/** A conversation of a scope, for the list of conversations (CHT-U07). */
export interface Conversation {
  /** The id of its thread. */
  id: string;
  /** The start of its first message; `action:<id>` when that was a button. Absent while empty. */
  title?: string;
  updatedAt?: string;
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
/**
 * Longest list the transcript keeps of a tool's arguments. The card of an outline is drawn from
 * them, and what it holds is what an approval sends (AID-03), so an outline is kept whole: 60 is
 * the most slides `outline_propose` takes.
 */
const MAX_INPUT_ITEMS = 60;

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

/** What the harness is told when a message is only its attachments: a turn needs words. */
const ATTACHED_ONLY = 'See the files attached to this message.';

/**
 * What the agent is told when a turn that failed for want of a connection is tried again
 * (WG13-T03). The request it was working on is still the last thing the user said to it, with
 * whatever it had done before the connection went.
 */
const RECONNECTED =
  'The connection to the model was lost before this turn was finished, and it is back. Go on ' +
  'with my last request from where it stopped. Do not repeat what is already done, and do not ' +
  'mention the interruption.';

/** The session a turn was sent to is not there: the harness layer's two ways of saying so. */
const isSessionGone = (error: unknown): boolean =>
  error instanceof AgentError &&
  (error.kind === 'unknown_session' || error.kind === 'process_exited');

/** The pictures a harness can be shown, by media type. */
const SHOWN = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
/** A picture larger than this is not shown to the model; it is still attached as a file. */
const MAX_SHOWN_BYTES = 5 * 1024 * 1024;
/** How much of a conversation's first message its title keeps. */
const TITLE_CHARS = 80;

function base64(bytes: Uint8Array): string {
  let binary = '';
  // In pieces: one call with a megabyte of arguments overflows the stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
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
  /** The bridge's id: what tool calls arrive under. */
  sessionKey: string;
  harnessId: string;
  /** The session has a tool that returns a picture of a slide. */
  canLook: boolean;
  /** The harness takes pictures with a user turn. */
  imageInput: boolean;
  /** The conversation began with this session and no turn has been sent on it yet. */
  fresh: boolean;
  /** It goes on from an earlier session of the harness, with what that one had cost. */
  resumed: boolean;
  /** The settings it was started with: other settings need another session. */
  settings: string;
}

/** What of the settings a session is started with, as one string to compare. */
function sessionSettings({ harnessId, model, effort, webAccess }: AgentSettings): string {
  return JSON.stringify([harnessId ?? null, model ?? null, effort ?? null, webAccess ?? true]);
}

/** The files of a message as the turn carries them. */
interface Attached {
  /** The `<slidr_attachments>` block. */
  block: string;
  /** The pictures among them, for a harness that takes pictures. */
  images: ImageAttachment[];
  /** Pictures stored with the document, to register in the deck inside the turn. */
  assets: AssetMeta[];
}

/** One user message being answered: the agent's turn and the design check's rounds after it. */
interface Run {
  entryId: string;
  /** What the turn was started with, to send again if the session has to start over. */
  message: string;
  attached?: Attached;
  /** The turn's name in the undo history. */
  label?: string;
  /** Every write of the run, follow-up rounds included, is this one transaction (D8). */
  turn: Turn | null;
  /**
   * Goes off when the run is over, or the user asked it to stop: from then on its turn writes
   * nothing, also from a tool call that was already running in the app. A harness that is
   * stopped gives its call up and tells nobody (ADR-022), and a document that replaces the open
   * one finds the call still at work.
   */
  over: AbortController;
  watch: TurnWatch;
  /** Follow-ups the design check has sent. */
  round: number;
  wrote: boolean;
  stopRequested: boolean;
  /** The conversation could not be resumed: start over once the session has gone. */
  startOver: boolean;
  /** The turn failed once for want of a connection and was sent again. Once only. */
  retried: boolean;
  /** The session was gone when the turn reached it, and another was opened. Once only. */
  reopened: boolean;
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
  /** A message whose files are being stored, before it has a run: Stop is kept here meanwhile. */
  #sending: { stopped: boolean } | null = null;
  /**
   * The changes behind the conversation's back are being collected (`#changes`): from its first
   * turn in this window on. Before that nobody knows what became of the deck since its last turn.
   */
  #collecting = false;

  constructor(
    service: AgentService,
    options: AgentServiceOptions,
    scope: SessionScope,
    id: string = threadIdOf(scope),
  ) {
    this.#service = service;
    this.#options = options;
    this.scope = scope;
    this.id = id;
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
    // A call of the old deck's turn that is still at work must not write into the new one.
    this.#run?.over.abort();
    this.#run = null;
    this.#sending = null;
    this.#heldWatch = null;
    this.#record = { scope: this.scope };
    this.#loading = null;
    this.#collecting = false;
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
  async send(message: string, options: SendOptions = {}): Promise<void> {
    const trimmed = message.trim();
    const files = options.attachments ?? [];
    if ((!trimmed && files.length === 0) || this.store.getState().busy) return;
    // Taken at once: storing the files takes a moment, and a second send must not slip in.
    this.store.setState({ busy: true, stopping: false, activity: { kind: 'starting' } });
    const sending = { stopped: false };
    this.#sending = sending;
    let attached: Attached | undefined;
    let shown: EntryAttachment[] = [];
    let failure: unknown;
    try {
      if (files.length > 0) ({ attached, shown } = await this.#attach(files));
    } catch (error) {
      failure = error;
      shown = files.map(({ name, mime }) => ({
        name,
        kind: mime.startsWith('image/') ? 'image' : 'file',
      }));
    }
    // Another deck was opened, or the chat closed, while the files were being stored: the
    // message was said to a chat that is gone.
    if (this.#sending !== sending) return;
    this.#sending = null;
    const user: UserEntry = {
      type: 'user',
      id: entryId(),
      at: this.#now(),
      text: trimmed,
      ...(options.action ? { action: options.action } : {}),
      ...(shown.length > 0 ? { attachments: shown } : {}),
    };
    this.store.setState((state) => ({ entries: [...state.entries, user] }));
    this.#persist([user]);
    if (!this.#record.title) {
      const title = options.action ? `action:${options.action.id}` : trimmed || shown[0]?.name;
      this.#record = {
        ...this.#record,
        ...(title ? { title: [...title].slice(0, TITLE_CHARS).join('') } : {}),
        updatedAt: this.#now(),
      };
      this.#saveRecord();
    }
    await this.#begin(
      trimmed || ATTACHED_ONLY,
      new TurnWatch(),
      0,
      undefined,
      options.label,
      attached,
      failure,
      sending.stopped,
    );
  }

  /**
   * Puts the files of a message where the agent finds them: each in the folder of the
   * conversation, for its file tool, and a picture also with the document, so it can be placed
   * on a slide by its asset id.
   */
  async #attach(
    files: readonly Attachment[],
  ): Promise<{ attached: Attached; shown: EntryAttachment[] }> {
    const { client, bus, storeImage } = this.#options;
    const listed: AttachedFile[] = [];
    const shown: EntryAttachment[] = [];
    const images: ImageAttachment[] = [];
    const assets: AssetMeta[] = [];
    for (const file of files) {
      const path = await client.attach(`${bus.deck.id}/${this.id}`, file);
      const picture = file.mime.startsWith('image/');
      const asset = picture ? await storeImage?.(file).catch(() => undefined) : undefined;
      if (asset) assets.push(asset);
      listed.push({
        name: file.name,
        path,
        kind: picture ? 'image' : 'file',
        ...(asset ? { assetId: asset.id } : {}),
        ...(file.use ? { use: file.use } : {}),
      });
      shown.push({
        name: file.name,
        kind: picture ? 'image' : 'file',
        ...(asset ? { assetId: asset.id } : {}),
      });
      if (SHOWN.has(file.mime) && file.bytes.length <= MAX_SHOWN_BYTES) {
        images.push({
          mediaType: file.mime as ImageAttachment['mediaType'],
          data: base64(file.bytes),
        });
      }
    }
    return { attached: { block: attachmentsBlock(listed), images, assets }, shown };
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

  /**
   * Stops the running turn (CHT-U03). It ends as `interrupted`; what it wrote stays. A turn that
   * is still being prepared (its files are being stored, its session opened, its slide rendered
   * for the brief) is never sent.
   */
  async stop(): Promise<void> {
    const run = this.#run;
    if (!run) {
      // The files of the message are still being stored: there is no run yet to stop.
      const sending = this.#sending;
      if (sending && !sending.stopped) {
        sending.stopped = true;
        this.store.setState({ stopping: true });
      }
      return;
    }
    if (!run.stopRequested) {
      run.stopRequested = true;
      // From here on nothing is written for the turn, whatever its tool calls are still doing.
      run.over.abort();
      this.store.setState({ stopping: true });
      this.#options.onInterrupt?.();
    }
    // Asked on every press: the harness does nothing when it has no turn to stop (the turn is
    // on its way to it, or the design check is judging), and then the flag ends the run where
    // it is looked at next.
    const session = this.#session;
    if (session) await this.#options.client.interrupt(session.sessionId).catch(() => undefined);
  }

  /** Ends the thread's session. The transcript stays with the deck. */
  async close(): Promise<void> {
    const session = this.#session;
    this.#session = null;
    this.#run?.over.abort();
    this.#run = null;
    this.#sending = null;
    this.#heldWatch = null;
    if (session) await this.#endSession(session);
  }

  /** A change the bus applied: the run's own writes are what the design check judges. */
  noteChange(event: ChangeEvent): void {
    const run = this.#run;
    if (!run?.turn || event.txId !== run.turn.txId) return;
    const { affected } = event;
    // Registering a picture the user attached changes nothing they can see: a turn that did
    // only that has nothing to undo.
    if (
      affected.slides.length > 0 ||
      affected.elements.length > 0 ||
      affected.layouts.length > 0 ||
      affected.meta ||
      affected.theme ||
      affected.slideOrder
    ) {
      run.wrote = true;
    }
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
    // The run ended while the call was at work (it was stopped, or another deck was opened):
    // the answer has no chip to go to, and the chat may be showing another run by now.
    if (this.#run !== run) return result;
    // A read shows the slide as it was when asked; a write is rendered after it was made.
    run.watch.noteResult(result, writes ? run.watch.mark() : before);
    this.#pairResult(name, input, result);
    return result;
  }

  #now(): string {
    return (this.#options.now?.() ?? new Date()).toISOString();
  }

  #settings(): AgentSettings {
    return this.#options.settings?.(this.id) ?? {};
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
  async #begin(
    message: string,
    watch: TurnWatch,
    round: number,
    first?: AssistantPart,
    label?: string,
    attached?: Attached,
    failure?: unknown,
    stopped = false,
  ) {
    const entry: AssistantEntry = {
      type: 'assistant',
      id: entryId(),
      at: this.#now(),
      parts: first ? [first] : [],
    };
    const run: Run = {
      entryId: entry.id,
      message,
      ...(label ? { label } : {}),
      ...(attached ? { attached } : {}),
      turn: null,
      over: new AbortController(),
      watch,
      round,
      wrote: false,
      stopRequested: false,
      startOver: false,
      retried: false,
      reopened: false,
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
    if (stopped) {
      // Stop was pressed while the files were being stored: the message is in the chat, and
      // nothing of its turn began.
      run.stopRequested = true;
      this.#finish(run, 'interrupted');
      return;
    }
    if (failure !== undefined) {
      // The files could not be stored: the message is in the chat, and so is the reason.
      run.problem = problemOf(failure);
      this.#finish(run, 'failed');
      return;
    }
    await this.#startTurn(run);
  }

  /** Opens a session if the thread has none, and sends the run's message as a turn. */
  async #startTurn(run: Run): Promise<void> {
    try {
      // Another model or effort was chosen since the session began (CHT-U06): the conversation
      // goes on in a session started with it. Only between turns of the user's, never under a
      // follow-up of the design check.
      const open = this.#session;
      if (open && !run.turn && open.settings !== sessionSettings(this.#settings())) {
        this.#session = null;
        await this.#endSession(open);
        if (this.#run !== run) return;
      }
      const session = this.#session ?? (await this.#openSession());
      if (this.#run !== run) return;
      if (run.stopRequested) {
        this.#finish(run, 'interrupted');
        return;
      }
      const label = run.label ?? run.message.split('\n')[0]?.slice(0, 60);
      // Started under the conversation's id, not the session's: the digest leaves out the
      // changes of whoever it is asked for, and the conversation outlives its sessions.
      run.turn ??= startTurn(this.id, this.scope, {
        ...(label ? { label } : {}),
        ended: run.over.signal,
      });
      this.#registerAssets(run);
      // A brief that fails is a turn without one: the agent reads what it needs with its tools.
      const brief = await this.#options
        .brief?.(this.scope, { fresh: session.fresh, threadId: this.id })
        .catch(() => null);
      if (this.#run !== run) return;
      // Stop was pressed while the brief was being made (it renders the slide): the turn is not
      // sent, so nothing of it reaches the model or the deck.
      if (run.stopRequested) {
        this.#finish(run, 'interrupted');
        return;
      }
      // A session that starts in the middle of a conversation is told what was said (AGT-06).
      const summary = session.fresh ? this.#summary(run) : '';
      session.fresh = false;
      const context = [
        this.#context(run),
        summary,
        brief?.text ?? '',
        run.attached?.block ?? '',
      ].filter(Boolean);
      const images = session.imageInput
        ? [...(brief?.images ?? []), ...(run.attached?.images ?? [])]
        : [];
      await this.#options.client.send(session.sessionId, {
        text: run.message,
        context: context.join('\n'),
        ...(images.length > 0 ? { images } : {}),
      });
      if (this.#run !== run) return;
      this.store.setState({ activity: { kind: 'thinking' } });
      // Stop was pressed while the turn was on its way to the harness, which had no turn to
      // stop then: it has one now.
      if (run.stopRequested) {
        await this.#options.client.interrupt(session.sessionId).catch(() => undefined);
      }
    } catch (error) {
      if (this.#run !== run) return;
      // A turn the user stopped before it could be sent is a stopped turn, not a failed one.
      if (run.stopRequested) {
        this.#finish(run, 'interrupted');
        return;
      }
      // The session was gone when the turn reached it: closed a moment ago for sitting idle
      // (AGT-07), or its process had ended and the word had not arrived yet. Nothing was sent,
      // so the turn goes to a new session, which resumes the conversation by its id.
      const gone = this.#session;
      if (gone && isSessionGone(error) && !run.reopened && !run.stopRequested) {
        run.reopened = true;
        run.turn = null;
        this.#session = null;
        void this.#endSession(gone);
        await this.#startTurn(run);
        return;
      }
      run.problem = problemOf(error);
      this.#finish(run, 'failed');
    }
  }

  #context(run: Run): string {
    const { bus, selection, now } = this.#options;
    return contextBlock({
      scope: this.scope,
      deck: bus.deck,
      selection: selection(),
      changes: this.#changes(run),
      ...(now ? { now: now() } : {}),
      ...(this.scope.kind === 'deck'
        ? { outline: this.#settings().outline ?? DEFAULT_OUTLINE }
        : {}),
    });
  }

  /**
   * What changed behind the conversation's back since its last turn (CMD-08). It is collected
   * for the conversation, under the id its turns are started with, and not for the harness
   * session that happens to carry it: a session is closed for sitting idle, started again on
   * another model, or let go of when its panel shows another chat, and the conversation it
   * resumes must still hear what the user did in the meantime.
   */
  #changes(run: Run): ChangeSummary {
    const changes = this.#service.digest.take(this.id);
    if (this.#collecting) return changes;
    this.#collecting = true;
    const earlier = this.store
      .getState()
      .entries.some((entry) => entry.type === 'assistant' && entry.id !== run.entryId);
    if (!earlier) return changes;
    // The conversation goes on from an earlier run of the app, and nobody collected what became
    // of the deck since its last turn. An empty value would say that nothing changed: all the
    // conversation can have seen is reported as changed, so the agent reads before it relies.
    const { deck } = this.#options.bus;
    const { scope } = this;
    const slides =
      scope.kind === 'slide' || scope.kind === 'object'
        ? deck.slides.filter((slide) => slide.id === scope.slideId)
        : deck.slides;
    return {
      slides: slides.map((slide) => slide.id),
      elements: [],
      removedSlides: [],
      removedElements: [],
      slideOrder: true,
      theme: true,
    };
  }

  /** The pictures of the message join the deck's assets inside the turn, so undo takes them too. */
  #registerAssets(run: Run): void {
    const { bus } = this.#options;
    const assets = (run.attached?.assets ?? []).filter((asset) => !bus.deck.assets[asset.id]);
    if (!run.turn || assets.length === 0) return;
    bus.batch(
      assets.map((asset) => ({ type: 'asset.add', asset })),
      { actor: run.turn.actor, txId: run.turn.txId, ...(run.label ? { label: run.label } : {}) },
    );
  }

  /**
   * What was said in this conversation before the run, for a session that does not remember
   * it: the transcript the deck keeps, as exchanges. Empty when the run opens the conversation.
   */
  #summary(run: Run): string {
    const entries = this.store.getState().entries;
    const end = entries.findIndex((entry) => entry.id === run.entryId);
    const before = entries.slice(0, end < 0 ? entries.length : end);
    // The message being answered is not history.
    if (before.at(-1)?.type === 'user') before.pop();
    const exchanges: Exchange[] = [];
    for (const entry of before) {
      if (entry.type === 'user') {
        const said = entry.action ? `(pressed the "${entry.action.id}" action)` : entry.text;
        const files = entry.attachments?.map((file) => file.name).join(', ');
        exchanges.push({
          user: files ? `${said} [attached: ${files}]` : said,
          reply: '',
          tools: [],
        });
        continue;
      }
      // A turn the app began itself (a retry of the design check) has no message of its own.
      if (exchanges.length === 0) {
        exchanges.push({ user: '(a follow-up of the app)', reply: '', tools: [] });
      }
      const last = exchanges[exchanges.length - 1]!;
      const reply = entry.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []));
      const tools = entry.parts.flatMap((part) => (part.type === 'tool' ? [part.name] : []));
      exchanges[exchanges.length - 1] = {
        user: last.user,
        reply: [last.reply, ...reply].filter(Boolean).join('\n'),
        tools: [...last.tools, ...tools],
        ...(entry.outcome && entry.outcome !== 'completed' ? { outcome: entry.outcome } : {}),
      };
    }
    return conversationSummary(exchanges);
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
          ...(resume && this.#record.spentUsd !== undefined
            ? { resumedCostUsd: this.#record.spentUsd }
            : {}),
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
      imageInput: harness.capabilities.imageInput,
      fresh: !resume,
      resumed: Boolean(resume),
      settings: sessionSettings(settings),
    });
    this.#session = session;
    return session;
  }

  /** Keeps what the harness's session has cost, for the process that resumes it next. */
  #spent(costUsd: number | null): void {
    const { spentUsd: before, ...rest } = this.#record;
    const spentUsd = costUsd === null || before === undefined ? undefined : before + costUsd;
    if (spentUsd === before) return;
    this.#record = { ...rest, ...(spentUsd === undefined ? {} : { spentUsd }) };
    this.#saveRecord();
  }

  async #endSession(session: Session): Promise<void> {
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
          // A session that begins has cost nothing; one that goes on has cost what it had.
          ...(session.resumed ? {} : { spentUsd: 0 }),
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
          // in a fresh session, which is told what was said from the deck's own record (AGT-06).
          run.startOver = true;
          this.#record = {
            scope: this.scope,
            ...(this.#record.title ? { title: this.#record.title } : {}),
            updatedAt: this.#now(),
          };
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
    // The turn failed on a conversation that cannot be resumed: `exited` follows, and the
    // message is sent again in a fresh session. The attempt ran nothing, and what it reports
    // (no cost at all) is not the turn's.
    if (run.startOver && event.outcome === 'failed') return;
    run.usage = addUsage(run.usage, event.usage);
    run.durationMs += event.durationMs;
    run.costUsd =
      run.costUsd === null || event.costUsd === null ? null : run.costUsd + event.costUsd;
    this.#spent(event.costUsd);
    const { bus, lint, client } = this.#options;
    // The harness could not reach its model. One more try before the user is told (ADR-042):
    // the harness has been trying for minutes by then, and the connection may be back. The
    // session is alive, and has the request and whatever was done for it.
    if (
      event.outcome === 'failed' &&
      run.problem?.kind === 'network' &&
      !run.retried &&
      !run.stopRequested &&
      this.#session === session
    ) {
      run.retried = true;
      const lost = run.problem;
      delete run.problem;
      this.store.setState({ activity: { kind: 'starting' } });
      try {
        await client.send(session.sessionId, {
          text: RECONNECTED,
          context: this.#context(run),
        });
        if (this.#run !== run) return;
        this.store.setState({ activity: { kind: 'thinking' } });
        if (run.stopRequested) await client.interrupt(session.sessionId).catch(() => undefined);
      } catch {
        if (this.#run !== run) return;
        // The session did not take the second try: the user is told what stopped the first.
        run.problem = lost;
        this.#finish(run, 'failed');
      }
      return;
    }
    if (event.outcome !== 'completed' || run.stopRequested) {
      this.#finish(run, run.stopRequested ? 'interrupted' : event.outcome);
      return;
    }

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
        context: this.#context(run),
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
    // What the entry says of the turn is final: a call that is still at work adds nothing to it.
    run.over.abort();
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
    this.#record = { ...this.#record, updatedAt: this.#now() };
    this.#saveRecord();
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

/** The longest id a thread is given: it is part of a folder name, and of the key of a session. */
const MAX_THREAD_ID = 64;

/** A short, stable name for a long text: 53 bits of it, in base 36. A name, not a secret. */
function shortHash(text: string): string {
  let a = 0xdeadbeef;
  let b = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 2654435761);
    b = Math.imul(b ^ code, 1597334677);
  }
  a = Math.imul(a ^ (a >>> 16), 2246822507) ^ Math.imul(b ^ (b >>> 13), 3266489909);
  b = Math.imul(b ^ (b >>> 16), 2246822507) ^ Math.imul(a ^ (a >>> 13), 3266489909);
  return (4294967296 * (2097151 & b) + (a >>> 0)).toString(36);
}

/** The id of the thread of a scope: one continuing chat per deck, slide or object (AID-01). */
export function threadIdOf(scope: SessionScope): string {
  switch (scope.kind) {
    case 'deck':
      return 'deck';
    case 'slide':
      return `slide-${scope.slideId}`;
    case 'object': {
      const ids = [...scope.elementIds].sort().join('-');
      const id = `object-${ids}`;
      // A selection too large to be named by its ids is named by their number and a hash of
      // them. Cutting the name short gave every selection that shared its first five ids one
      // chat, with the session, the brief and the write guard of whichever was first.
      return id.length <= MAX_THREAD_ID
        ? id
        : `object-${scope.elementIds.length}x-${shortHash(ids)}`;
    }
    case 'import':
      return 'import';
  }
}

export class AgentService {
  /** What changed behind each conversation's back since its last turn (CMD-08), by thread id. */
  readonly digest: ChangeDigest;
  /**
   * The conversation each scope shows, under the id of the scope's first thread; a scope that
   * is absent shows that first thread.
   */
  readonly shown: StoreApi<Record<string, string>> = createStore<Record<string, string>>(
    () => ({}),
  );
  readonly #restored = new Set<string>();
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

  /**
   * The chat of a scope in the open deck; made, and read from the deck, on first use. A scope
   * may have several conversations (CHT-U07): without an id this is the one it shows now.
   */
  thread(scope: SessionScope, id: string = this.#shownId(scope)): ChatThread {
    let thread = this.#threads.get(id);
    if (!thread) {
      thread = new ChatThread(this, this.#options, scope, id);
      this.#threads.set(id, thread);
      void thread.load();
    }
    return thread;
  }

  #shownId(scope: SessionScope): string {
    const first = threadIdOf(scope);
    return this.shown.getState()[first] ?? first;
  }

  /**
   * The conversations the deck keeps of a scope, the latest first, with the one the scope shows
   * among them even while it is empty.
   */
  async conversations(scope: SessionScope): Promise<Conversation[]> {
    const first = threadIdOf(scope);
    const records = await this.#options.transcripts.records().catch(() => ({}));
    const list: Conversation[] = [];
    for (const [id, record] of Object.entries(records)) {
      // The index is a file: a record of no scope is skipped, not fatal.
      if (typeof record.scope !== 'object' || record.scope === null) continue;
      if (threadIdOf(record.scope) !== first) continue;
      list.push({
        id,
        ...(record.title ? { title: record.title } : {}),
        ...(record.updatedAt ? { updatedAt: record.updatedAt } : {}),
      });
    }
    const shown = this.#shownId(scope);
    if (!list.some((conversation) => conversation.id === shown)) list.push({ id: shown });
    // A conversation nobody wrote in yet is the newest of all.
    const time = (conversation: Conversation) => conversation.updatedAt ?? '9';
    return list.sort((a, b) => time(b).localeCompare(time(a)));
  }

  /** Starts a conversation of the scope beside the ones it has, and shows it. */
  newConversation(scope: SessionScope): ChatThread {
    const first = threadIdOf(scope);
    let id = `${first}-c${Date.now().toString(36)}`;
    while (this.#threads.has(id)) id += 'x';
    return this.showConversation(scope, id);
  }

  /** Shows one of the scope's conversations in its panel. */
  showConversation(scope: SessionScope, id: string): ChatThread {
    this.shown.setState({ [threadIdOf(scope)]: id });
    return this.thread(scope, id);
  }

  /**
   * Shows the conversation of the scope that was written in last: where a deck that is opened
   * again picks up. Once for each scope of a deck, and never over a choice the user made.
   */
  async restore(scope: SessionScope): Promise<void> {
    const first = threadIdOf(scope);
    if (this.#restored.has(first)) return;
    this.#restored.add(first);
    const latest = (await this.conversations(scope)).find((conversation) => conversation.updatedAt);
    if (latest && latest.id !== first && this.shown.getState()[first] === undefined) {
      this.shown.setState({ [first]: latest.id });
    }
  }

  /** The harnesses the app offers, for a picker of harness, model and effort (CHT-U06). */
  harnesses(): Promise<HarnessDescriptor[]> {
    this.#harnesses ??= this.#options.client.harnesses().catch((error: unknown) => {
      this.#harnesses = null;
      throw error;
    });
    return this.#harnesses;
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
    const harnesses = await this.harnesses();
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
    this.shown.setState({}, true);
    this.#restored.clear();
    for (const [id, thread] of this.#threads) {
      // Of the deck's conversations the first is the one a panel holds from the start.
      if (id === threadIdOf(thread.scope) && thread.scope.kind === 'deck') {
        thread.reset();
      } else {
        this.#threads.delete(id);
        this.digest.forget(id);
        void thread.close();
      }
    }
  }
}
