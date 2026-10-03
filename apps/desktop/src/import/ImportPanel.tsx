import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { isTauri } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import {
  CircleCheck,
  FileInput,
  FilePlus,
  ListChecks,
  ShieldCheck,
  TriangleAlert,
  WifiOff,
} from '@slidr/ui/icons';
import {
  Button,
  cx,
  EmptyState,
  Icon,
  IconButton,
  ScrollArea,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Toggle,
} from '@slidr/ui';
import { Chat } from '../ai/Chat';
import { agentOf } from '../ai/runtime';
import { useDeck, useEditor } from '../shell';
import { startImport } from './flow';
import { buildReport, type ImportReport, type ReportRow } from './report';
import { importState, type ImportSource } from './session';

/*
 * The import panel (SPEC 13.3, IMP-03; WG9-T18): choosing a file, the agent's plan and its
 * approval, the slides coming in, the report, and the chat that goes on afterwards. The chat is
 * the AI panels' own component on an import session; the report is the app's.
 */

const percent = (share: number) => Math.round(share * 100);

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------- choosing a file */

function Start({ onChoose }: { onChoose: (source: ImportSource, confirm: boolean) => void }) {
  const { t } = useTranslation('import');
  const [confirm, setConfirm] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  const choose = async () => {
    if (!isTauri()) {
      input.current?.click();
      return;
    }
    const path = await openDialog({
      multiple: false,
      directory: false,
      filters: [{ name: t('start.filter'), extensions: ['html', 'htm'] }],
    });
    if (path) onChoose({ path }, confirm);
  };
  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onChoose({ file }, confirm);
  };

  return (
    <div className="flex flex-col gap-5 px-4 pt-2 pb-6" data-testid="import-start">
      <EmptyState
        icon={FileInput}
        title={t('start.title')}
        description={t('start.body')}
        action={
          <Button variant="primary" icon={FilePlus} onClick={() => void choose()}>
            {t('start.choose')}
          </Button>
        }
      />
      {/* A plain browser has no file dialog of the app's; the page's own picker stands in. */}
      <input
        ref={input}
        type="file"
        accept=".html,.htm,text/html"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="import-file"
        onChange={picked}
      />
      <div className="flex items-center gap-3 rounded-panel border border-ui-line px-3 py-2.5">
        <Toggle
          icon={ListChecks}
          label={t('start.confirm')}
          pressed={confirm}
          onPressedChange={setConfirm}
          data-testid="import-confirm"
        />
        <div className="min-w-0">
          <div className="text-sm font-medium text-ui-fg">{t('start.confirm')}</div>
          <div className="text-xs text-ui-fg-muted">
            {t(confirm ? 'start.confirmOn' : 'start.confirmOff')}
          </div>
        </div>
      </div>
      <ul className="flex flex-col gap-2 text-xs leading-5 text-ui-fg-muted">
        <li className="flex items-start gap-2">
          <Icon icon={ShieldCheck} className="mt-0.5 shrink-0" />
          <span>{t('start.isolated')}</span>
        </li>
        <li className="flex items-start gap-2">
          <Icon icon={FilePlus} className="mt-0.5 shrink-0" />
          <span>{t('start.newDeck')}</span>
        </li>
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------------- the report */

function Figure({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-panel border border-ui-line px-3 py-2">
      <div className="truncate text-xs text-ui-fg-muted">{label}</div>
      <div
        dir="ltr"
        className={cx(
          'text-start text-md font-semibold tabular-nums',
          tone === 'good' && 'text-ui-success-fg',
          tone === 'bad' && 'text-ui-danger-fg',
          !tone && 'text-ui-fg',
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ row, onOpen }: { row: ReportRow; onOpen: () => void }) {
  const { t } = useTranslation('import');
  const [open, setOpen] = useState(false);
  const details = [
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
      </button>
      {row.kept.length > 0 && (
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
        className="min-h-80"
      />
    );
  }
  const total = report.rows.length;
  return (
    <div className="flex flex-col gap-4 px-4 pt-3 pb-6" data-testid="import-report">
      <div className="grid grid-cols-2 gap-2">
        <Figure label={t('report.slides')} value={String(total)} />
        <Figure
          label={t('report.faithful')}
          value={t('report.of', { n: report.faithful, total })}
          tone={report.faithful === total ? 'good' : 'bad'}
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

/* ---------------------------------------------------------------- a session */

function Session({ file, onAnother }: { file: string; onAnother: () => void }) {
  const { t } = useTranslation('import');
  const editor = useEditor();
  const state = useStore(importState);
  const deck = useDeck((s) => s.deck);
  const scope = useMemo(() => ({ kind: 'import', file }) as const, [file]);
  const thread = useMemo(() => agentOf(editor).thread(scope), [editor, scope]);
  const chat = useStore(thread.store);
  const report = useMemo(() => buildReport(state, deck, chat.entries), [state, deck, chat.entries]);
  const captured = report.rows.length;
  // The agent has answered and nothing was captured yet: it showed its plan and is waiting.
  const last = chat.entries.at(-1);
  const waiting =
    state.open &&
    !chat.busy &&
    captured === 0 &&
    last?.type === 'assistant' &&
    last.outcome === 'completed';

  return (
    <div className="absolute inset-0 flex flex-col" data-testid="import-session">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2">
        <Icon icon={FileInput} className="shrink-0 text-ui-fg-muted" />
        <span dir="auto" className="min-w-0 flex-1 truncate text-sm text-ui-fg">
          {file}
        </span>
        {captured > 0 && (
          <span
            className="shrink-0 rounded-full bg-ui-accent-soft px-2 py-0.5 text-xs font-medium text-ui-accent-fg tabular-nums"
            data-testid="import-count"
          >
            {t('captured', { n: captured })}
          </span>
        )}
        <IconButton
          icon={FilePlus}
          size="sm"
          label={t('another')}
          disabled={chat.busy}
          onClick={onAnother}
        />
      </div>
      <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="px-4">
          <TabsTrigger value="chat">{t('tabs.chat')}</TabsTrigger>
          <TabsTrigger value="report" data-testid="import-report-tab">
            {t('tabs.report')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
          {waiting && (
            <div
              className="flex shrink-0 items-center gap-3 border-b border-ui-line bg-ui-accent-soft px-4 py-2"
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
          {!state.open && (
            <div className="shrink-0 border-b border-ui-line px-4 py-2 text-xs text-ui-fg-muted">
              {t('closed')}
            </div>
          )}
          <div className="relative min-h-0 flex-1">
            <Chat scope={scope} />
          </div>
        </TabsContent>
        <TabsContent value="report" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <Report
              report={report}
              onOpen={(slideId) => editor.selection.getState().setCurrentSlide(slideId)}
            />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------------------------------------------------------- the panel */

export function ImportPanel() {
  const { t } = useTranslation('import');
  const editor = useEditor();
  const file = useStore(importState, (s) => s.file);
  const [opening, setOpening] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  const choose = (source: ImportSource, confirm: boolean) => {
    setOpening(true);
    setFailure(null);
    startImport(editor, source, { confirm })
      .then(
        (started) => {
          if (started) setChoosing(false);
        },
        (error: unknown) => setFailure(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setOpening(false));
  };

  if (opening) {
    return (
      <div
        className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 text-sm text-ui-fg-muted"
        data-testid="import-opening"
      >
        <Spinner />
        {t('opening')}
      </div>
    );
  }
  if (file && !choosing) return <Session file={file} onAnother={() => setChoosing(true)} />;
  return (
    <>
      {failure && (
        <div
          role="alert"
          className="mx-4 mt-2 rounded-panel border border-ui-line bg-ui-danger-soft px-3 py-2 text-sm text-ui-fg"
          data-testid="import-failed"
        >
          <div className="font-medium">{t('failed')}</div>
          <div dir="ltr" className="text-start text-xs text-ui-fg-muted">
            {failure}
          </div>
        </div>
      )}
      <Start onChoose={choose} />
    </>
  );
}
