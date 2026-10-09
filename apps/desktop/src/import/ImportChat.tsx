import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { isTauri } from '@tauri-apps/api/core';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import {
  ChevronDown,
  CircleCheck,
  CirclePause,
  Download,
  FileCode,
  ListChecks,
  Pencil,
  Trash2,
  TriangleAlert,
  WifiOff,
} from '@slidr/ui/icons';
import { Button, cx, EmptyState, Icon, Spinner } from '@slidr/ui';
import { Chat, useThread } from '../ai/Chat';
import { ask, useDeck, useEditor } from '../shell';
import { continueImport, followImport } from './flow';
import { buildReport, type ImportReport, type ReportRow } from './report';
import { exportSource, importState, pageSource, removeSource } from './session';

/*
 * The conversation of an HTML import in the AI chat (SPEC 13.3, IMP-03; WG9-T18). It is the
 * chat's own component on an import session: the request to import the file is its first
 * message, and the agent's plan, the slides coming in and the talk that goes on afterwards are
 * its turns. What the app itself has to say stands at the end of the conversation: the plan
 * waiting for approval, an import that was cut and can be continued (IMP-09), and the report,
 * which is the app's and not the agent's. A deck that was imported has this conversation
 * whenever it is open (IMP-07).
 */

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

const percent = (share: number) => Math.round(share * 100);

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------- the report */

/**
 * `words`: the value is a phrase in the language of the UI ("6 of 6") and reads in its
 * direction. A bare number, a percentage or a price reads left to right in both.
 */
function Figure({
  label,
  value,
  tone,
  words,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
  words?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-panel border border-ui-line px-3 py-2">
      <div className="truncate text-xs text-ui-fg-muted">{label}</div>
      <div
        className={cx(
          'text-start text-md font-semibold tabular-nums',
          tone === 'good' && 'text-ui-success-fg',
          tone === 'bad' && 'text-ui-danger-fg',
          !tone && 'text-ui-fg',
        )}
      >
        {/* The value starts where the label starts; only its own characters keep their order. */}
        {words ? value : <bdi dir="ltr">{value}</bdi>}
      </div>
    </div>
  );
}

function Row({ row, onOpen }: { row: ReportRow; onOpen: () => void }) {
  const { t } = useTranslation('import');
  const [open, setOpen] = useState(false);
  // A slide that was redesigned since its capture has no measurements of its own.
  const details = row.rebuilt
    ? [t('report.rebuilt')]
    : [
        t('report.textPercent', { n: percent(row.textEditability) }),
        ...(row.wholeSlideHtml
          ? [t('report.whole')]
          : row.kept.length > 0
            ? [t('report.kept', { n: row.kept.length })]
            : []),
        ...(row.exact ? [] : [t('report.approximate')]),
      ];
  return (
    <li className="border-b border-ui-line last:border-b-0" data-testid="import-row">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full cursor-default items-center gap-3 px-1 py-2 text-start transition-colors hover:bg-ui-hover"
      >
        <span className="w-6 shrink-0 text-center text-xs text-ui-fg-muted tabular-nums">
          {row.number}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ui-fg">
            {row.name ?? t('report.slide', { n: row.number })}
          </span>
          <span className="block truncate text-xs text-ui-fg-muted">{details.join(' · ')}</span>
        </span>
        {row.rebuilt ? (
          <Icon icon={Pencil} className="shrink-0 text-ui-fg-muted" />
        ) : (
          <>
            <span className="shrink-0 text-sm font-medium text-ui-fg tabular-nums">
              {t('report.editablePercent', { n: percent(row.editability) })}
            </span>
            <span className="inline-flex shrink-0">
              <Icon
                icon={row.faithful ? CircleCheck : TriangleAlert}
                className={row.faithful ? 'text-ui-success-fg' : 'text-ui-danger-fg'}
              />
              <span className="sr-only">
                {t(row.faithful ? 'report.rowFaithful' : 'report.rowUnfaithful')}
              </span>
            </span>
          </>
        )}
      </button>
      {!row.rebuilt && row.kept.length > 0 && (
        <div className="ps-10 pe-1 pb-2">
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="cursor-default text-xs text-ui-fg-muted underline-offset-2 hover:text-ui-fg hover:underline"
          >
            {t('report.reasons')}
          </button>
          {open && (
            <ul
              dir="ltr"
              className="mt-1 flex flex-col gap-0.5 text-start text-xs text-ui-fg-muted"
            >
              {row.kept.map((reason, i) => (
                <li key={i} className="wrap-anywhere">
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function Report({ report, onOpen }: { report: ImportReport; onOpen: (slideId: string) => void }) {
  const { t } = useTranslation('import');
  if (report.rows.length === 0) {
    return (
      <EmptyState
        icon={ListChecks}
        title={t('report.empty')}
        description={t('report.emptyBody')}
        className="min-h-40"
      />
    );
  }
  // The figures are about the slides that still hold what was captured.
  const total = report.measured;
  return (
    <div className="flex flex-col gap-4 p-3" data-testid="import-report">
      <div className="grid grid-cols-2 gap-2">
        <Figure label={t('report.slides')} value={String(report.rows.length)} />
        <Figure
          label={t('report.faithful')}
          value={t('report.of', { n: report.faithful, total })}
          tone={report.faithful === total ? 'good' : 'bad'}
          words
        />
        <Figure
          label={t('report.editable')}
          value={report.medianEditability === null ? '' : `${percent(report.medianEditability)}%`}
        />
        <Figure
          label={t('report.text')}
          value={
            report.medianTextEditability === null ? '' : `${percent(report.medianTextEditability)}%`
          }
        />
        <Figure label={t('report.time')} value={duration(report.durationMs)} />
        <Figure
          label={t('report.cost')}
          value={report.costUsd === null ? t('report.unknown') : `$${report.costUsd.toFixed(2)}`}
          words={report.costUsd === null}
        />
      </div>
      <ul className="flex flex-col">
        {report.rows.map((row) => (
          <Row key={row.slideId} row={row} onOpen={() => onOpen(row.slideId)} />
        ))}
      </ul>
      <section className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-2 text-sm font-medium text-ui-fg">
          <Icon icon={WifiOff} className="text-ui-fg-muted" />
          {t('report.blocked')}
          <span className="text-ui-fg-muted tabular-nums">{report.blocked.length}</span>
        </h3>
        <p className="text-xs leading-5 text-ui-fg-muted">
          {t(report.blocked.length > 0 ? 'report.blockedBody' : 'report.none')}
        </p>
        {report.blocked.length > 0 && (
          <ul
            dir="ltr"
            className="flex flex-col gap-0.5 text-start text-xs text-ui-fg-muted"
            data-testid="import-blocked"
          >
            {report.blocked.map((url) => (
              <li key={url} className="truncate">
                {url}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- the kept source */

/** The file the deck was imported from, which the deck file keeps (IMP-07). */
function SourceFile({ file }: { file: string }) {
  const { t } = useTranslation('import');
  const editor = useEditor();
  const [failure, setFailure] = useState<{ what: string; why: string } | null>(null);

  // The deck file carries the file it came from, with whatever was deleted from the deck since.
  // Passing the deck on without it is the user's to decide, and costs the way back to the file.
  const remove = async () => {
    setFailure(null);
    const answer = await ask({
      title: t('source.removeTitle'),
      body: t('source.removeBody'),
      actions: [
        { id: 'cancel', label: t('source.cancel'), variant: 'ghost' },
        { id: 'remove', label: t('source.removeConfirm'), variant: 'danger' },
      ],
      cancelId: 'cancel',
    });
    if (answer !== 'remove') return;
    try {
      await removeSource(editor);
    } catch (error) {
      setFailure({ what: t('source.removeFailed'), why: reason(error) });
    }
  };

  const save = async () => {
    setFailure(null);
    try {
      if (!isTauri()) {
        // A plain browser has no save dialog of the app's: the page's own download stands in.
        const source = pageSource(editor.bus.deck.id);
        if (!source) return;
        const link = document.createElement('a');
        link.href = URL.createObjectURL(source);
        link.download = source.name;
        link.click();
        URL.revokeObjectURL(link.href);
        return;
      }
      const path = await saveDialog({
        defaultPath: file,
        filters: [{ name: t('filter'), extensions: ['html', 'htm'] }],
      });
      if (path) await exportSource(editor, path);
    } catch (error) {
      setFailure({ what: t('source.failed'), why: reason(error) });
    }
  };

  return (
    <section
      className="flex flex-col gap-1.5 border-t border-ui-line p-3"
      data-testid="import-source"
    >
      <h3 className="flex items-center gap-2 text-sm font-medium text-ui-fg">
        <Icon icon={FileCode} className="text-ui-fg-muted" />
        {t('source.title')}
      </h3>
      {/* The name starts where the lines around it start; its own characters keep their order. */}
      <div className="truncate text-sm text-ui-fg">
        <bdi>{file}</bdi>
      </div>
      <p className="text-xs leading-5 text-ui-fg-muted">{t('source.kept')}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" icon={Download} onClick={() => void save()}>
          {t('source.save')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={Trash2}
          onClick={() => void remove()}
          data-testid="import-source-remove"
        >
          {t('source.remove')}
        </Button>
      </div>
      {failure && (
        <div role="alert" className="text-xs text-ui-danger-fg">
          <div>{failure.what}</div>
          <div dir="ltr" className="text-start text-ui-fg-muted">
            {failure.why}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The report at the end of the conversation (SPEC 13.3 step 7), folded like the other things the
 * app says in a chat: a line with how many slides came in (IMP-11), which opens on the figures,
 * the slides one by one, what the page was refused, and the source file the deck keeps.
 */
function ReportCard({
  report,
  count,
  source,
  onOpen,
}: {
  report: ImportReport;
  /** How many slides were captured, in words; absent before the first one. */
  count?: string;
  /** The kept source file, when the deck keeps one. */
  source?: string;
  onOpen: (slideId: string) => void;
}) {
  const { t } = useTranslation('import');
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-panel border border-ui-line" data-testid="import-report-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        data-testid="import-report-toggle"
        className="flex h-control w-full cursor-default items-center gap-2 rounded-panel px-2.5 text-start text-sm text-ui-fg transition-colors hover:bg-ui-hover active:bg-ui-pressed"
      >
        <Icon icon={ListChecks} className="text-ui-fg-muted" />
        <span className="min-w-0 flex-1 truncate">{t('report.title')}</span>
        {count && (
          <span
            className="shrink-0 rounded-full bg-ui-accent-soft px-2 py-0.5 text-xs font-medium text-ui-accent-fg tabular-nums"
            data-testid="import-count"
          >
            {count}
          </span>
        )}
        <Icon
          icon={ChevronDown}
          className={cx('text-ui-fg-muted transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <div className="border-t border-ui-line">
          <Report report={report} onOpen={onOpen} />
          {source && <SourceFile file={source} />}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- the conversation */

/** The conversation of the import the open deck came from, as the AI chat shows it. */
export function ImportChat({ file }: { file: string }) {
  const { t } = useTranslation('import');
  const editor = useEditor();
  const state = useStore(importState);
  const deck = useDeck((s) => s.deck);
  const scope = useMemo(() => ({ kind: 'import', file }) as const, [file]);
  // The conversation the chat shows, with its turns followed whichever one that is.
  const thread = followImport(useThread(scope));
  const chat = useStore(thread.store);
  const report = useMemo(() => buildReport(state, deck, chat.entries), [state, deck, chat.entries]);
  const captured = report.rows.length;
  // Against the size of the agent's plan, once it has said it (IMP-11).
  const count =
    state.planned === null
      ? t('captured', { n: captured })
      : t('capturedOf', { n: captured, total: state.planned });
  const counted = captured > 0 || state.planned !== null;
  // The import was at work when its turn was stopped or failed, or when the app went (IMP-09).
  const cut = state.phase === 'cut' && !chat.busy;
  const [resuming, setResuming] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const resume = () => {
    setResuming(true);
    setFailure(null);
    continueImport(editor)
      .catch((error: unknown) => setFailure(reason(error)))
      .finally(() => setResuming(false));
  };
  // The agent has answered and nothing was captured yet: it showed its plan and is waiting.
  const last = chat.entries.at(-1);
  const waiting =
    !cut &&
    (state.open || state.kept) &&
    !chat.busy &&
    captured === 0 &&
    last?.type === 'assistant' &&
    last.outcome === 'completed';
  // There is something to report once slides came in, or once a turn of the agent has ended;
  // not beside a plan that waits for its approval, where nothing has happened yet.
  const reported =
    !waiting &&
    (counted || cut || chat.entries.some((entry) => entry.type === 'assistant' && entry.outcome));

  return (
    <Chat
      scope={scope}
      afterMessages={
        <>
          {waiting && (
            <div
              className="flex items-center gap-3 rounded-panel bg-ui-accent-soft px-3 py-2.5"
              data-testid="import-approve"
            >
              <span className="min-w-0 flex-1 text-sm text-ui-fg">{t('approve.waiting')}</span>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void thread.send(t('message.approve'))}
              >
                {t('approve.action')}
              </Button>
            </div>
          )}
          {cut && (
            <div
              role="status"
              className="flex items-start gap-3 rounded-panel bg-ui-accent-soft px-3 py-2.5"
              data-testid="import-cut"
            >
              <Icon icon={CirclePause} className="mt-0.5 shrink-0 text-ui-warning-fg" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ui-fg">{t('cut.title')}</div>
                <div className="text-xs text-ui-fg-muted tabular-nums">
                  {counted ? count : t('cut.none')}
                </div>
                {failure && (
                  <div role="alert" className="mt-1 text-xs text-ui-danger-fg">
                    <div>{t('cut.failed')}</div>
                    <div dir="ltr" className="text-start text-ui-fg-muted">
                      {failure}
                    </div>
                  </div>
                )}
              </div>
              <Button variant="primary" size="sm" loading={resuming} onClick={resume}>
                {t('cut.action')}
              </Button>
            </div>
          )}
          {/* A page that is closed is opened again when it is needed, if the deck keeps the file. */}
          {!state.open && !state.kept && (
            <p className="text-xs text-ui-fg-muted" data-testid="import-closed">
              {t('closed')}
            </p>
          )}
          {reported && (
            <ReportCard
              report={report}
              count={counted ? count : undefined}
              source={state.kept ? file : undefined}
              onOpen={(slideId) => editor.selection.getState().setCurrentSlide(slideId)}
            />
          )}
        </>
      }
    />
  );
}

/** The file that was chosen is loading in the isolated page: the request is not in the chat yet. */
export function ImportOpening() {
  const { t } = useTranslation('import');
  return (
    <div
      role="status"
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-sm text-ui-fg-muted"
      data-testid="import-opening"
    >
      <Spinner />
      {t('opening')}
    </div>
  );
}
