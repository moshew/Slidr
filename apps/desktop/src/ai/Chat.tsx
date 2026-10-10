import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import type { LintFinding, SessionScope } from '@slidr/agent-tools';
import {
  Ai,
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  CircleStop,
  FileText,
  Image as ImageIcon,
  LocateFixed,
  Paperclip,
  ScanEye,
  Square,
  TriangleAlert,
  Undo2,
  X,
  Zap,
} from '@slidr/ui/icons';
import {
  Button,
  cx,
  EmptyState,
  Icon,
  IconButton,
  ScrollArea,
  Skeleton,
  Spinner,
  Textarea,
  Toggle,
} from '@slidr/ui';
import { threadIdOf, type Activity, type Attachment, type ChatThread } from '../agent/agentService';
import type {
  AssistantEntry,
  ChatEntry,
  ChatProblem,
  EntryAttachment,
  GatePart,
  GateReport,
  ToolPart,
  ToolTarget,
  UserEntry,
} from '../agent/transcript';
import { pickFiles } from '../objects/insert';
import { ask, openPanel, PanelId, useDeck, useEditor } from '../shell';
import { TemplateDraftCard } from '../templates/DraftCard';
import { actionLabel } from './actionLabels';
import { accepted, ATTACHABLE, pastedFiles, readAttachment, refusals } from './attachments';
import { ConversationBar } from './Conversations';
import { NO_DRAFT, type Draft } from './drafts';
import { FocusChip } from './FocusChip';
import { focusKind, useFocus, type Focus } from './focus';
import { Gallery } from './Gallery';
import { MarkdownView } from './MarkdownView';
import { he } from './messages';
import { ModelPicker } from './ModelPicker';
import { OutlineCard } from './Outline';
import { aiOf, navigateTo, setFollow, useAiPreferences } from './runtime';
import { DECK } from './sessions';
import { activityLabel, targetSlideNumber, toolIcon, toolLabel } from './toolLabels';

/*
 * The AI chat (SPEC 11.8, WG11-T01; ADR-072): the conversation as it streams, a chip for every
 * tool call, the design check's follow-ups as folded status lines, "undo changes" on every turn
 * that changed the deck, and a card that says what to do when the agent cannot run. There is one
 * chat, a deck session: what the user has selected goes to the agent with each message, and the
 * chip beside the composer says what that is. The conversation of an HTML import is one of its
 * conversations, on a session of its own (SPEC 13.3).
 */

/**
 * One conversation of a scope, in the document that is open now. A panel keeps what this gives
 * for as long as it gives the same: when another document is opened the chat is taken again,
 * since the one from before was the old document's and its session is gone, though the slide
 * or the elements may carry the same ids (the same file opened again).
 */
export function useConversation(scope: SessionScope, id: string): ChatThread {
  const { sessions } = aiOf(useEditor());
  const key = JSON.stringify(scope);
  const opened = useStore(sessions.opened);
  // The scope is compared by value: a caller may build it anew on every render. And `opened`
  // is not read, it is what makes the chat be asked for again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => sessions.thread(scope, id), [sessions, key, id, opened]);
}

/**
 * The thread of a scope in the open deck. The panel that shows it is where the scope's session
 * lives: a conversation the panel has moved on from lets its session go.
 */
export function useThread(scope: SessionScope): ChatThread {
  const editor = useEditor();
  const { agent, sessions } = aiOf(editor);
  const key = JSON.stringify(scope);
  // A scope may keep several conversations (CHT-U07): the panel shows the one chosen.
  const id = useStore(agent.shown, (shown) => shown[threadIdOf(scope)] ?? threadIdOf(scope));
  const thread = useConversation(scope, id);
  // A deck that is opened again picks up at the conversation that was written in last: when
  // the panel comes up, and when a document is opened under a panel that is up already.
  const opened = useStore(sessions.opened);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void agent.restore(scope), [agent, key, opened]);
  useEffect(() => sessions.show(thread), [sessions, thread]);
  return thread;
}

/* ---------------------------------------------------------------- tool chips */

function ChipState({ state }: { state: ToolPart['state'] }) {
  const { t } = useTranslation('ai');
  return (
    <span className="inline-flex size-control-sm shrink-0 items-center justify-center">
      {state === 'running' ? (
        <Spinner className="text-ui-fg-muted" />
      ) : state === 'ok' ? (
        <Icon icon={Check} className="text-ui-success-fg" />
      ) : (
        <Icon icon={CircleAlert} className="text-ui-danger-fg" />
      )}
      <span className="sr-only">{t(`chip.${state}`)}</span>
    </span>
  );
}

function Detail({ label, children }: { label: string; children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ui-fg-muted">{label}</span>
      <pre
        dir="ltr"
        className="max-h-40 overflow-auto rounded-inset bg-ui-field p-2 text-start text-xs leading-5 whitespace-pre-wrap wrap-anywhere text-ui-fg"
      >
        {children}
      </pre>
    </div>
  );
}

/** One tool call (CHT-U02): what it did in plain words, a click to its target, and details. */
function ToolChip({ part }: { part: ToolPart }) {
  const { t } = useTranslation('ai');
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const slideNumber = useDeck((s) => targetSlideNumber(s.deck, part.target));
  const target = slideNumber > 0 ? part.target : undefined;
  return (
    <div
      data-testid="tool-chip"
      data-tool={part.name}
      data-state={part.state}
      className="rounded-control border border-ui-line"
    >
      <div className="flex h-control items-center gap-0.5 px-0.5">
        <button
          type="button"
          disabled={!target}
          aria-label={target ? `${toolLabel(t, part, slideNumber)}. ${t('chip.goTo')}` : undefined}
          onClick={() => target && navigateTo(editor, target)}
          className="flex h-control-sm min-w-0 flex-1 cursor-default items-center gap-2 rounded-inset px-2 text-start text-sm text-ui-fg transition-colors hover:bg-ui-hover active:bg-ui-pressed disabled:hover:bg-transparent"
        >
          <Icon icon={toolIcon(part)} className="text-ui-fg-muted" />
          <span className="truncate">{toolLabel(t, part, slideNumber)}</span>
        </button>
        <ChipState state={part.state} />
        <IconButton
          icon={ChevronDown}
          size="sm"
          label={t('chip.details')}
          aria-expanded={open}
          noTooltip
          className={cx('transition-transform', open && 'rotate-180')}
          onClick={() => setOpen(!open)}
        />
      </div>
      {open && (
        <div className="flex flex-col gap-2 border-t border-ui-line p-2">
          <Detail label={t('chip.input')}>{JSON.stringify(part.input, null, 2)}</Detail>
          {part.summary && <Detail label={t('chip.result')}>{part.summary}</Detail>}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- the design check */

function isRule(rule: string): rule is Exclude<keyof typeof he.rule, 'other'> {
  return rule !== 'other' && Object.hasOwn(he.rule, rule);
}

/** What a report holds, a line per slide not looked at and per finding; a click goes there. */
function ReportList({ report }: { report: GateReport }) {
  const { t } = useTranslation('ai');
  const editor = useEditor();
  const deck = useDeck((s) => s.deck);
  const numberOf = (slideId: string) => targetSlideNumber(deck, { slideId });
  const ruleName = (rule: string) => (isRule(rule) ? t(`rule.${rule}`) : t('rule.other', { rule }));
  const row = (key: string, target: ToolTarget, label: string, detail?: string) => (
    <li key={key}>
      <button
        type="button"
        onClick={() => navigateTo(editor, target)}
        className="flex w-full cursor-default flex-col gap-0.5 rounded-inset px-2 py-1 text-start transition-colors hover:bg-ui-hover active:bg-ui-pressed"
      >
        <span className="text-sm text-ui-fg">{label}</span>
        {detail && (
          <span dir="ltr" className="text-start text-xs text-ui-fg-muted">
            {detail}
          </span>
        )}
      </button>
    </li>
  );
  return (
    <ul className="flex flex-col">
      {report.unseen.map((slideId) => {
        const n = numberOf(slideId);
        return row(
          `look-${slideId}`,
          { slideId },
          n ? t('gate.unseen', { n }) : t('gate.unseenGone'),
        );
      })}
      {report.findings.map((finding: LintFinding, i) => {
        const n = numberOf(finding.slideId);
        const rule = ruleName(finding.rule);
        return row(
          `fix-${i}`,
          { slideId: finding.slideId, elementIds: finding.elementIds },
          n ? t('gate.finding', { n, rule }) : t('gate.findingGone', { rule }),
          finding.message,
        );
      })}
    </ul>
  );
}

/** A follow-up of the design check, as a folded status line and not as a message (QG-06). */
function GateLine({ part }: { part: GatePart }) {
  const { t } = useTranslation('ai');
  const [open, setOpen] = useState(false);
  return (
    <div data-testid="gate-line" data-round={part.round} className="rounded-control bg-ui-field">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex h-control w-full cursor-default items-center gap-2 rounded-control px-2.5 text-start text-sm text-ui-fg-muted transition-colors hover:bg-ui-hover active:bg-ui-pressed"
      >
        <Icon icon={ScanEye} />
        <span className="min-w-0 flex-1 truncate">{t('gate.line')}</span>
        <span className="shrink-0 text-xs">{t('gate.round', { n: part.round })}</span>
        <Icon icon={ChevronDown} className={cx('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-1 pb-1">
          <ReportList report={part} />
        </div>
      )}
    </div>
  );
}

/** What the design check gave up on, with "try to fix again" (QG-05). */
function Remaining({
  report,
  disabled,
  onRetry,
}: {
  report: GateReport;
  disabled: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation('ai');
  return (
    <div
      data-testid="gate-remaining"
      className="flex flex-col gap-2 rounded-panel border border-ui-line p-3"
    >
      <div className="flex items-start gap-2">
        <Icon icon={TriangleAlert} className="mt-0.5 text-ui-warning-fg" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium text-ui-fg">{t('gate.remainingTitle')}</p>
          <p className="text-sm text-ui-fg-muted">{t('gate.remainingBody')}</p>
        </div>
      </div>
      <ReportList report={report} />
      <div>
        <Button variant="soft" size="sm" disabled={disabled} onClick={onRetry}>
          {t('gate.retry')}
        </Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- problems */

function isProblemKind(kind: string): kind is Exclude<keyof typeof he.problem, 'other'> {
  return kind !== 'other' && Object.hasOwn(he.problem, kind);
}

/** Why the agent could not run, and what to do about it (CHT-U09). */
function ProblemCard({ problem }: { problem: ChatProblem }) {
  const { t } = useTranslation('ai');
  const kind = isProblemKind(problem.kind) ? problem.kind : 'other';
  return (
    <div
      role="alert"
      data-testid="chat-problem"
      data-kind={problem.kind}
      className="flex items-start gap-2.5 rounded-panel bg-ui-danger-soft p-3"
    >
      <Icon icon={CircleAlert} className="mt-0.5 text-ui-danger-fg" />
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-sm font-medium text-ui-fg">{t(`problem.${kind}.title`)}</p>
        <p className="text-sm text-ui-fg">{t(`problem.${kind}.body`)}</p>
        {['not_installed', 'not_logged_in', 'unavailable', 'invalid_input'].includes(
          problem.kind,
        ) && (
          <Button size="sm" variant="ghost" onClick={() => openPanel(PanelId.settings)}>
            {t('settings:agent.configure')}
          </Button>
        )}
        {problem.message && (
          <p dir="ltr" className="text-start text-xs wrap-anywhere text-ui-fg-muted">
            {problem.message}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- a turn */

/** A file of a message: its name, and whether it is a picture. */
function FileChip({
  file,
  onRemove,
}: {
  file: Pick<EntryAttachment, 'name' | 'kind'>;
  onRemove?: () => void;
}) {
  const { t } = useTranslation('ai');
  return (
    <span
      data-testid="attachment"
      data-kind={file.kind}
      className="flex h-control-sm max-w-full items-center gap-1.5 rounded-control border border-ui-line ps-2 pe-1 text-xs text-ui-fg"
    >
      <Icon icon={file.kind === 'image' ? ImageIcon : FileText} className="text-ui-fg-muted" />
      <span dir="auto" className="min-w-0 truncate pe-1">
        {file.name}
      </span>
      {onRemove && (
        <IconButton
          icon={X}
          size="sm"
          label={t('composer.remove', { name: file.name })}
          noTooltip
          className="-me-0.5 size-5"
          onClick={onRemove}
        />
      )}
    </span>
  );
}

/** What the user asked: their words, or the name of the action they pressed (SPEC 4.3). */
function UserMessage({ entry }: { entry: UserEntry }) {
  const { t } = useTranslation('ai');
  const words = entry.action ? actionLabel(t, entry.action) : entry.text;
  return (
    <div
      // With a role the name is read: "You", before the words of the message.
      role="article"
      aria-label={t('you')}
      data-testid="chat-user"
      data-action={entry.action?.id}
      className="ms-10 flex max-w-full flex-col gap-1.5 self-end rounded-panel bg-ui-accent-soft px-3 py-2 text-ui-fg"
    >
      {words && (
        <div
          dir={entry.action ? undefined : 'auto'}
          className="flex items-start gap-2 text-start text-md leading-6 whitespace-pre-wrap wrap-anywhere"
        >
          {entry.action && <Icon icon={Zap} className="mt-1 text-ui-accent-fg" />}
          {words}
        </div>
      )}
      {entry.attachments && entry.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.attachments.map((file, i) => (
            <FileChip key={i} file={file} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * "Undo changes" of a turn that changed the deck (CHT-U04, CMD-06). Once the turn is undone it
 * says so; a turn that only left the history (it is long, or the deck was opened again) has
 * nothing to undo and nothing to say.
 */
function UndoTurn({ txId, disabled }: { txId: string; disabled: boolean }) {
  const { t } = useTranslation('ai');
  const { agent, undone } = aiOf(useEditor());
  // Read again after every change to the deck: undo and redo move the turn off and on the stack.
  useDeck((s) => s.revision);
  const wasUndone = useStore(undone, (s) => s.turns.has(txId));
  const info = agent.undoInfo(txId);
  if (!info) {
    return wasUndone ? (
      <span className="self-start text-xs text-ui-fg-muted">{t('turn.undone')}</span>
    ) : null;
  }
  const undo = async () => {
    if (info.otherEdits > 0) {
      const answer = await ask({
        title: t('turn.undoTitle'),
        body: t('turn.undoBody', { count: info.otherEdits }),
        actions: [
          { id: 'cancel', label: t('turn.cancel') },
          { id: 'undo', label: t('turn.undoConfirm'), variant: 'danger' },
        ],
        cancelId: 'cancel',
      });
      if (answer !== 'undo') return;
    }
    agent.undoTurn(txId);
  };
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={Undo2}
      disabled={disabled}
      data-testid="undo-turn"
      className="-ms-2.5 self-start text-ui-fg-muted"
      onClick={() => void undo()}
    >
      {t('turn.undo')}
    </Button>
  );
}

function AssistantTurn({
  entry,
  busy,
  last,
  thread,
  onRetry,
}: {
  entry: AssistantEntry;
  busy: boolean;
  /** Nothing was said after this turn: what it offered still waits for an answer. */
  last: boolean;
  thread: ChatThread;
  onRetry: () => void;
}) {
  const { t } = useTranslation('ai');
  return (
    <article
      aria-label={t('agent')}
      data-testid="chat-assistant"
      data-outcome={entry.outcome}
      className="flex flex-col gap-2"
    >
      {entry.parts.map((part, i) =>
        part.type === 'text' ? (
          <MarkdownView key={i} text={part.text} />
        ) : part.type === 'tool' && part.name === 'outline_propose' && part.state !== 'failed' ? (
          // An outline is shown as what it is, not as a chip (AID-03).
          <OutlineCard
            key={`${part.id}-${i}`}
            part={part}
            entryId={entry.id}
            thread={thread}
            open={last && !busy && entry.outcome === 'completed'}
          />
        ) : part.type === 'tool' ? (
          // A harness may reuse a call id in a later round of the same run.
          <ToolChip key={`${part.id}-${i}`} part={part} />
        ) : (
          <GateLine key={`gate-${part.round}`} part={part} />
        ),
      )}
      {entry.problem && <ProblemCard problem={entry.problem} />}
      {entry.remaining && <Remaining report={entry.remaining} disabled={busy} onRetry={onRetry} />}
      {entry.outcome === 'interrupted' && (
        <p className="flex items-center gap-1.5 text-xs text-ui-fg-muted">
          <Icon icon={CircleStop} />
          {t('turn.interrupted')}
        </p>
      )}
      {entry.txId && entry.outcome && <UndoTurn txId={entry.txId} disabled={busy} />}
    </article>
  );
}

/* ---------------------------------------------------------------- working, composing */

/** "Working…" with what the agent is doing right now (CHT-U03). */
function Working({ activity, stopping }: { activity: Activity | null; stopping: boolean }) {
  const { t } = useTranslation('ai');
  const slideNumber = useDeck((s) =>
    activity?.kind === 'tool' ? targetSlideNumber(s.deck, activity.target) : 0,
  );
  const label = stopping ? t('activity.stopping') : activityLabel(t, activity, slideNumber);
  return (
    <div
      role="status"
      data-testid="chat-working"
      className="flex items-center gap-2 text-sm text-ui-fg-muted"
    >
      <Spinner />
      <span className="truncate">{label}</span>
    </div>
  );
}

function Composer({
  focus,
  threadId,
  busy,
  stopping,
  draft,
  onDraft,
  onSend,
  onStop,
}: {
  /** What the message is about; null in a chat that is not about the selection. */
  focus: Focus | null;
  /** The conversation the chat shows: the one its picker of model and effort chooses for. */
  threadId: string;
  busy: boolean;
  stopping: boolean;
  /**
   * What is being written, words and files. It is kept outside the chat (`drafts.ts`), so it is
   * there when the panel comes back to this chat, and a suggestion can put words here.
   */
  draft: Draft;
  onDraft: (change: (draft: Draft) => Draft) => void;
  onSend: (text: string, files: readonly Attachment[]) => void;
  onStop: () => void;
}) {
  const { t } = useTranslation('ai');
  const { text, files } = draft;
  const follow = useAiPreferences((s) => s.follow);
  const field = useRef<HTMLTextAreaElement>(null);
  /** Why files of the last choice are not in the message: said until the files change again. */
  const [refused, setRefused] = useState<string[]>([]);
  const ready = (text.trim().length > 0 || files.length > 0) && !busy;
  const send = () => {
    if (!ready) return;
    onSend(text, files);
    onDraft(() => NO_DRAFT);
    setRefused([]);
    field.current?.focus();
  };
  /** Takes files into the message: as many as it still has room for (CHT-U05). */
  const add = async (offered: readonly File[]) => {
    const offer = accepted(offered, files.length);
    setRefused(refusals(t, offer));
    const read = await Promise.all(offer.files.map((file) => readAttachment(file)));
    // Into the draft as it is by now: reading a file takes a while.
    if (read.length > 0) onDraft((now) => ({ ...now, files: [...now.files, ...read] }));
  };
  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    // A pasted screenshot is a file; pasted words stay the field's own business.
    const pasted = pastedFiles(event.clipboardData, files.length);
    if (pasted.length === 0) return;
    event.preventDefault();
    void add(pasted);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; with Shift it is a new line. While an IME composes, Enter is the IME's.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };
  return (
    <div className="flex shrink-0 flex-col gap-1.5 px-4 pt-2 pb-4">
      {focus && <FocusChip focus={focus} />}
      {files.length > 0 && (
        <div
          role="list"
          aria-label={t('composer.attached')}
          data-testid="composer-files"
          className="flex flex-wrap gap-1"
        >
          {files.map((file, i) => (
            <FileChip
              key={i}
              file={{ name: file.name, kind: file.mime.startsWith('image/') ? 'image' : 'file' }}
              onRemove={() => {
                onDraft((now) => ({ ...now, files: now.files.filter((_, at) => at !== i) }));
                setRefused([]);
              }}
            />
          ))}
        </div>
      )}
      {refused.map((words) => (
        <p
          key={words}
          role="alert"
          data-testid="files-refused"
          className="text-xs text-ui-danger-fg"
        >
          {words}
        </p>
      ))}
      <Textarea
        ref={field}
        // The text finds its own direction; the placeholder keeps the panel's.
        dir={text ? 'auto' : undefined}
        value={text}
        aria-label={t('composer.label')}
        placeholder={t(`composer.placeholder.${focus ? focusKind(focus) : 'import'}`)}
        data-testid="chat-input"
        onChange={(event) => {
          const typed = event.target.value;
          onDraft((now) => ({ ...now, text: typed }));
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        footer={
          <div className="flex items-center gap-1">
            <IconButton
              icon={Paperclip}
              size="sm"
              label={t('composer.attach')}
              data-testid="chat-attach"
              onClick={() => void pickFiles(ATTACHABLE, true).then(add)}
            />
            <Toggle
              icon={LocateFixed}
              size="sm"
              label={t('composer.follow')}
              pressed={follow}
              onPressedChange={setFollow}
            />
            <ModelPicker threadId={threadId} />
            <span className="min-w-0 flex-1" />
            {busy ? (
              <IconButton
                icon={Square}
                size="sm"
                variant="secondary"
                label={t('composer.stop')}
                loading={stopping}
                data-testid="chat-stop"
                onClick={onStop}
              />
            ) : (
              <IconButton
                icon={ArrowUp}
                size="sm"
                variant="primary"
                label={t('composer.send')}
                shortcut="Enter"
                disabled={!ready}
                data-testid="chat-send"
                onClick={send}
              />
            )}
          </div>
        }
      />
    </div>
  );
}

/* ---------------------------------------------------------------- the chat */

/** Keeps the list at its end while content arrives, unless the user scrolled up to read. */
function useStickToEnd(version: unknown) {
  const frame = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const viewport = () =>
    frame.current?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]') ?? null;
  const onScroll = () => {
    const view = viewport();
    if (view) stuck.current = view.scrollHeight - view.scrollTop - view.clientHeight < 48;
  };
  useLayoutEffect(() => {
    const view = viewport();
    if (view && stuck.current) view.scrollTop = view.scrollHeight;
  }, [version]);
  return { frame, onScroll, stick: () => (stuck.current = true) };
}

function Loading() {
  const { t } = useTranslation('ai');
  return (
    <div role="status" aria-label={t('loading')} className="flex flex-col gap-3 p-4">
      <Skeleton className="ms-10 h-9" />
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

/**
 * Ready-made openings for an empty chat (CHT-U08), by what the user points at: a selection, a
 * slide that has something on it, or an empty deck.
 */
const SUGGESTIONS = {
  deck: ['topic', 'document', 'improve'],
  slide: ['redesign', 'shorten', 'visual'],
  object: ['reword', 'shorten', 'tone'],
} as const;

/** Each puts its words into the composer, for the user to finish or to send as they are. */
function Suggestions({ focus, onPick }: { focus: Focus; onPick: (prompt: string) => void }) {
  const { t } = useTranslation('ai');
  // A slide with something on it is worked on; an empty one is where a deck starts.
  const filled = useDeck((s) => {
    const slide = focus.slideId ? s.deck.slides.find((one) => one.id === focus.slideId) : undefined;
    return Boolean(slide && slide.elements.length > 0);
  });
  const kind = focusKind(focus);
  const scope = kind === 'text' || kind === 'object' ? 'object' : filled ? 'slide' : 'deck';
  const of = (name: string, part: 'label' | 'prompt') =>
    t(`suggest.${scope}.${name}.${part}` as 'suggest.deck.topic.label');
  return (
    <div
      role="group"
      aria-label={t('suggest.title')}
      data-testid="chat-suggestions"
      data-for={scope}
      className="flex flex-wrap justify-center gap-1.5 px-4 pb-4"
    >
      {SUGGESTIONS[scope].map((name) => (
        <Button
          key={name}
          variant="soft"
          size="sm"
          data-suggestion={name}
          onClick={() => onPick(of(name, 'prompt'))}
        >
          {of(name, 'label')}
        </Button>
      ))}
    </div>
  );
}

/**
 * What the agent said, once its turn has ended, for a screen reader (UI-06). The messages are
 * not a live region themselves: words that arrive a few at a time would be read a few at a time,
 * over the line that says what the agent is doing. So the closing words of a turn are said
 * once, when it ends; a problem announces itself (`ProblemCard`).
 */
function closingWords(entries: readonly ChatEntry[], busy: boolean, stopped: string): string {
  const last = entries.at(-1);
  if (busy || last?.type !== 'assistant' || !last.outcome) return '';
  // The last thing it wrote, after whatever it did.
  const words = last.parts.reduce((text, part) => (part.type === 'text' ? part.text : text), '');
  // The marks of Markdown are not words.
  const plain = words
    .replace(/[*_`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return last.outcome === 'interrupted' ? [plain, stopped].filter(Boolean).join(' ') : plain;
}

/**
 * The chat of a session: the AI chat, a deck session, by default; the conversation of an HTML
 * import is shown with it on its own session, which is about a file and not about a selection.
 * `afterMessages`: what the app itself has to say at the end of the conversation.
 */
export function Chat({
  scope = DECK,
  afterMessages,
}: {
  scope?: SessionScope;
  afterMessages?: ReactNode;
}) {
  const { t } = useTranslation('ai');
  const thread = useThread(scope);
  const focus = useFocus();
  const deck = scope.kind === 'deck';
  const state = useStore(thread.store);
  const said = closingWords(state.entries, state.busy, t('turn.interrupted'));
  const { frame, onScroll, stick } = useStickToEnd(state);
  // What is being written belongs to what the chat is about, whichever of its conversations is
  // shown, and outlives this component (`drafts.ts`).
  const { drafts } = aiOf(useEditor());
  const subject = threadIdOf(scope);
  const draft = useStore(drafts.store, (all) => all[subject] ?? NO_DRAFT);
  const pick = (prompt: string) => {
    drafts.change(subject, (now) => ({ ...now, text: prompt }));
    // The caret goes after the words, where an opening that ends mid-sentence is finished.
    requestAnimationFrame(() => {
      const field = document.querySelector<HTMLTextAreaElement>('[data-testid="chat-input"]');
      field?.focus();
      field?.setSelectionRange(prompt.length, prompt.length);
    });
  };

  let content: ReactNode;
  if (!state.ready) {
    content = <Loading />;
  } else if (state.entries.length === 0) {
    content = (
      <>
        <EmptyState
          icon={Ai}
          title={t(deck ? 'empty.deck.title' : 'empty.import.title')}
          description={t(deck ? 'empty.deck.body' : 'empty.import.body')}
          className="min-h-56"
        />
        {deck && <Suggestions focus={focus} onPick={pick} />}
        {afterMessages && <div className="flex flex-col gap-4 px-4 pb-3">{afterMessages}</div>}
      </>
    );
  } else {
    content = (
      <div className="flex flex-col gap-4 px-4 pt-1 pb-3">
        {state.entries.map((entry, index) =>
          entry.type === 'user' ? (
            <UserMessage key={entry.id} entry={entry} />
          ) : (
            <AssistantTurn
              key={entry.id}
              entry={entry}
              busy={state.busy}
              last={index === state.entries.length - 1}
              thread={thread}
              onRetry={() => void thread.retryFixes(entry.id)}
            />
          ),
        )}
        {state.busy && <Working activity={state.activity} stopping={state.stopping} />}
        {afterMessages}
      </div>
    );
  }

  return (
    // The messages scroll; the options the agent offered and the composer stay in place.
    <div
      data-testid="chat"
      data-scope={scope.kind}
      data-thread={thread.id}
      className="flex min-h-0 flex-1 flex-col"
    >
      <ConversationBar thread={thread} />
      <div
        ref={frame}
        onScrollCapture={onScroll}
        className="flex min-h-0 flex-1 flex-col select-text"
      >
        <ScrollArea className="min-h-0 flex-1">{content}</ScrollArea>
      </div>
      {/* A conversation that is opened is not news: only what ends while it is open is said. */}
      <p key={thread.id} role="status" className="sr-only" data-testid="chat-said">
        {said && `${t('agent')}: ${said}`}
      </p>
      {deck && <Gallery />}
      {/* A template the agent drafted is shown before anything is saved (THM-06). */}
      {deck && <TemplateDraftCard />}
      <Composer
        focus={deck ? focus : null}
        threadId={thread.id}
        busy={state.busy}
        stopping={state.stopping}
        draft={draft}
        onDraft={(change) => drafts.change(subject, change)}
        onSend={(text, files) => {
          stick();
          void thread.send(text, files.length > 0 ? { attachments: files } : {});
        }}
        onStop={() => void thread.stop()}
      />
    </div>
  );
}
