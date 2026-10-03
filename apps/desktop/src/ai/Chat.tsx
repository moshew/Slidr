import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import type { LintFinding, SessionScope } from '@slidr/agent-tools';
import {
  ArrowUp,
  Check,
  ChevronDown,
  CircleAlert,
  CircleStop,
  LocateFixed,
  ScanEye,
  Sparkles,
  Square,
  TriangleAlert,
  Undo2,
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
import type { Activity, ChatThread } from '../agent/agentService';
import type {
  AssistantEntry,
  ChatProblem,
  GatePart,
  GateReport,
  ToolPart,
  ToolTarget,
  UserEntry,
} from '../agent/transcript';
import { ask, useDeck, useEditor } from '../shell';
import { actionLabel } from './actionLabels';
import { Gallery } from './Gallery';
import { MarkdownView } from './MarkdownView';
import { he } from './messages';
import { agentOf, aiOf, navigateTo, setFollow, useAiPreferences } from './runtime';
import { activityLabel, targetSlideNumber, toolIcon, toolLabel } from './toolLabels';

/*
 * The chat of an AI tool (SPEC 11.8, WG11-T01): the conversation as it streams, a chip for
 * every tool call, the design check's follow-ups as folded status lines, "undo changes" on
 * every turn that changed the deck, and a card that says what to do when the agent cannot run.
 */

/**
 * The thread of a scope in the open deck. The panel that shows it is where the scope's session
 * lives: the chat of a slide or an object the panel has moved on from lets its session go.
 */
export function useThread(scope: SessionScope): ChatThread {
  const editor = useEditor();
  const { sessions } = aiOf(editor);
  const key = JSON.stringify(scope);
  // The scope is compared by value: a caller may build it anew on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const thread = useMemo(() => sessions.thread(scope), [sessions, key]);
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

/** What the user asked: their words, or the name of the action they pressed (SPEC 4.3). */
function UserMessage({ entry }: { entry: UserEntry }) {
  const { t } = useTranslation('ai');
  return (
    <div
      dir={entry.action ? undefined : 'auto'}
      aria-label={t('you')}
      data-testid="chat-user"
      data-action={entry.action?.id}
      className="ms-10 flex items-start gap-2 self-end rounded-panel bg-ui-accent-soft px-3 py-2 text-start text-md leading-6 whitespace-pre-wrap wrap-anywhere text-ui-fg"
    >
      {entry.action && <Icon icon={Zap} className="mt-1 text-ui-accent-fg" />}
      {entry.action ? actionLabel(t, entry.action) : entry.text}
    </div>
  );
}

/** Turns that were on the undo stack while this window was open: only those say "undone". */
const undoable = new Set<string>();

/** "Undo changes" of a turn that changed the deck (CHT-U04, CMD-06). */
function UndoTurn({ txId, disabled }: { txId: string; disabled: boolean }) {
  const { t } = useTranslation('ai');
  const editor = useEditor();
  const agent = agentOf(editor);
  // Read again after every change to the deck: undo and redo move the turn off and on the stack.
  useDeck((s) => s.revision);
  const info = agent.undoInfo(txId);
  if (info) undoable.add(txId);
  if (!info) {
    return undoable.has(txId) ? (
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
  onRetry,
}: {
  entry: AssistantEntry;
  busy: boolean;
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
        ) : part.type === 'tool' ? (
          <ToolChip key={part.id} part={part} />
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
  scope,
  busy,
  stopping,
  onSend,
  onStop,
}: {
  scope: SessionScope['kind'];
  busy: boolean;
  stopping: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const { t } = useTranslation('ai');
  const [text, setText] = useState('');
  const follow = useAiPreferences((s) => s.follow);
  const field = useRef<HTMLTextAreaElement>(null);
  const ready = text.trim().length > 0 && !busy;
  const send = () => {
    if (!ready) return;
    onSend(text);
    setText('');
    field.current?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; with Shift it is a new line. While an IME composes, Enter is the IME's.
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  };
  return (
    <div className="shrink-0 px-4 pt-2 pb-4">
      <Textarea
        ref={field}
        // The text finds its own direction; the placeholder keeps the panel's.
        dir={text ? 'auto' : undefined}
        value={text}
        aria-label={t('composer.label')}
        placeholder={t(`composer.placeholder.${scope}`)}
        data-testid="chat-input"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        footer={
          <div className="flex items-center gap-1">
            <Toggle
              icon={LocateFixed}
              size="sm"
              label={t('composer.follow')}
              pressed={follow}
              onPressedChange={setFollow}
            />
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

export function Chat({ scope }: { scope: SessionScope }) {
  const { t } = useTranslation('ai');
  const thread = useThread(scope);
  const state = useStore(thread.store);
  const { frame, onScroll, stick } = useStickToEnd(state);

  let content: ReactNode;
  if (!state.ready) {
    content = <Loading />;
  } else if (state.entries.length === 0) {
    content = (
      <EmptyState
        icon={Sparkles}
        title={t(`empty.${scope.kind}.title`)}
        description={t(`empty.${scope.kind}.body`)}
        className="min-h-64"
      />
    );
  } else {
    content = (
      <div className="flex flex-col gap-4 px-4 pt-1 pb-3">
        {state.entries.map((entry) =>
          entry.type === 'user' ? (
            <UserMessage key={entry.id} entry={entry} />
          ) : (
            <AssistantTurn
              key={entry.id}
              entry={entry}
              busy={state.busy}
              onRetry={() => void thread.retryFixes(entry.id)}
            />
          ),
        )}
        {state.busy && <Working activity={state.activity} stopping={state.stopping} />}
      </div>
    );
  }

  return (
    // The messages scroll; the options the agent offered and the composer stay in place.
    <div data-testid="chat" data-scope={scope.kind} className="flex min-h-0 flex-1 flex-col">
      <div ref={frame} onScrollCapture={onScroll} className="flex min-h-0 flex-1 flex-col">
        <ScrollArea className="min-h-0 flex-1">{content}</ScrollArea>
      </div>
      <Gallery scope={scope} />
      <Composer
        scope={scope.kind}
        busy={state.busy}
        stopping={state.stopping}
        onSend={(text) => {
          stick();
          void thread.send(text);
        }}
        onStop={() => void thread.stop()}
      />
    </div>
  );
}
