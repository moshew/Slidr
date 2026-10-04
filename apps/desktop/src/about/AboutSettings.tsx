import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cx, Dialog, DialogContent, ScrollArea } from '@slidr/ui';
import {
  diagnostics,
  entrySummary,
  parseDiagnostics,
  type DiagnosticsEntry,
  type DiagnosticsView,
} from '../agent/diagnostics';
import { formatBytes, ltr } from '../export/exportDeck';
import { loadNotices, NOTICES_PATH } from './notices';

/** The version this build was made as; absent where nothing built it (a unit test). */
const VERSION = import.meta.env.VITE_SLIDR_VERSION as string | undefined;

/**
 * "About and diagnostics" in the settings screen: which version this is, the licences of what
 * the app is built from (WG13-T05), and the agent's diagnostics log (AGT-08). Each of the two
 * opens in a dialog of its own, since neither fits a settings column.
 */
export function AboutSettings() {
  const { t } = useTranslation('about');
  const [log, setLog] = useState<DiagnosticsView | null>(null);
  const [logFailed, setLogFailed] = useState(false);
  const [open, setOpen] = useState<'licenses' | 'log' | null>(null);

  const readLog = useCallback(
    () =>
      diagnostics()
        .read()
        .then(
          (view) => {
            setLog(view);
            setLogFailed(false);
          },
          (error: unknown) => {
            console.error('The diagnostics log could not be read', error);
            setLogFailed(true);
          },
        ),
    [],
  );
  useEffect(() => {
    void readLog();
  }, [readLog]);

  const clear = async () => {
    try {
      await diagnostics().clear();
    } catch (error) {
      console.error('The diagnostics log could not be cleared', error);
    }
    await readLog();
  };

  return (
    <div className="flex flex-col gap-4" data-testid="about">
      {VERSION && (
        <p className="text-sm text-ui-fg" data-testid="about-version">
          Slidr · {t('version', { version: ltr(VERSION) })}
        </p>
      )}
      <Row label={t('licenses.label')} hint={t('licenses.hint')}>
        <Button size="sm" onClick={() => setOpen('licenses')} data-testid="about-licenses">
          {t('licenses.open')}
        </Button>
      </Row>
      <Row label={t('diagnostics.label')} hint={t('diagnostics.hint')}>
        <p
          role={logFailed ? 'alert' : undefined}
          className={cx('text-xs', logFailed ? 'text-ui-danger-fg' : 'text-ui-fg-muted')}
          data-testid="about-log-size"
        >
          {logFailed
            ? t('diagnostics.failed')
            : !log
              ? ''
              : log.bytes === 0
                ? t('diagnostics.empty')
                : t('diagnostics.size', { size: ltr(formatBytes(log.bytes)) })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setOpen('log')} data-testid="about-log">
            {t('diagnostics.open')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!log || log.bytes === 0}
            onClick={() => void clear()}
            data-testid="about-log-clear"
          >
            {t('diagnostics.clear')}
          </Button>
        </div>
      </Row>
      <LicensesDialog open={open === 'licenses'} onClose={() => setOpen(null)} />
      <LogDialog
        open={open === 'log'}
        onClose={() => setOpen(null)}
        log={log}
        failed={logFailed}
        onRefresh={readLog}
      />
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1.5">
      <p className="text-sm font-medium text-ui-fg">{label}</p>
      <p className="text-xs text-ui-fg-muted">{hint}</p>
      {children}
    </div>
  );
}

/**
 * Text that is what it is in every language of the interface: names of events and files, an
 * error as it was given. Drawn in a `code` or `pre` element, which the design system sets in a
 * fixed pitch.
 */
const VERBATIM = 'text-xs text-ui-fg';

function LicensesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation('about');
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || text !== null) return;
    let alive = true;
    loadNotices().then(
      (notices) => alive && setText(notices),
      (error: unknown) => {
        console.error(`${NOTICES_PATH} could not be read`, error);
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [open, text]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title={t('licenses.title')}
        description={t('licenses.hint')}
        closeLabel={t('close')}
        className="w-216!"
        data-testid="licenses-dialog"
        footer={
          <Button variant="primary" onClick={onClose}>
            {t('close')}
          </Button>
        }
      >
        <ScrollArea className="h-112 rounded-control border border-ui-line bg-ui-field">
          {text !== null ? (
            <pre
              dir="ltr"
              className={cx(VERBATIM, 'p-3 text-start whitespace-pre-wrap wrap-anywhere')}
              data-testid="licenses-text"
            >
              {text}
            </pre>
          ) : (
            <p
              role={failed ? 'alert' : 'status'}
              className={cx('p-3 text-sm', failed ? 'text-ui-danger-fg' : 'text-ui-fg-muted')}
            >
              {failed ? t('licenses.failed') : t('licenses.loading')}
            </p>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/** `08:00:01` of an ISO time, as the clock of this computer shows it. */
function clock(at: string): string {
  const time = new Date(at);
  if (Number.isNaN(time.getTime())) return at;
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(time.getHours())}:${two(time.getMinutes())}:${two(time.getSeconds())}`;
}

function LogDialog({
  open,
  onClose,
  log,
  failed,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  log: DiagnosticsView | null;
  failed: boolean;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useTranslation('about');
  const entries = useMemo(() => parseDiagnostics(log?.text ?? ''), [log]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  // Opened, it shows the log as it is now, from its end: the newest entry is the one looked for.
  useEffect(() => {
    if (open) void onRefresh();
  }, [open, onRefresh]);
  useEffect(() => {
    if (open) end.current?.scrollIntoView({ block: 'end' });
  }, [open, entries]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(log?.text ?? '');
      setCopied(true);
    } catch (error) {
      console.error('The log could not be copied', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title={t('diagnostics.title')}
        description={t('diagnostics.description')}
        closeLabel={t('close')}
        className="w-216!"
        data-testid="log-dialog"
        footer={
          <>
            <Button onClick={() => void copy()} disabled={entries.length === 0}>
              {copied ? t('diagnostics.copied') : t('diagnostics.copy')}
            </Button>
            <Button onClick={() => void onRefresh()}>{t('diagnostics.refresh')}</Button>
            <Button variant="primary" onClick={onClose}>
              {t('close')}
            </Button>
          </>
        }
      >
        <ScrollArea className="h-104 rounded-control border border-ui-line bg-ui-field">
          {failed ? (
            <p role="alert" className="p-3 text-sm text-ui-danger-fg">
              {t('diagnostics.failed')}
            </p>
          ) : entries.length === 0 ? (
            <p className="p-3 text-sm text-ui-fg-muted">{t('diagnostics.empty')}</p>
          ) : (
            <div dir="ltr" role="log" className="flex flex-col py-1" data-testid="log-entries">
              {entries.map((entry, index) => (
                <Entry
                  key={index}
                  entry={entry}
                  expanded={expanded === index}
                  onToggle={() => setExpanded(expanded === index ? null : index)}
                />
              ))}
              <div ref={end} />
            </div>
          )}
        </ScrollArea>
        {log && (
          <div className="flex flex-col gap-0.5 text-xs text-ui-fg-muted">
            <p data-testid="log-count">{t('diagnostics.entries', { count: entries.length })}</p>
            <p>
              {t('diagnostics.file')}{' '}
              <code dir="ltr" className="wrap-anywhere" data-testid="log-path">
                {log.path}
              </code>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Entry({
  entry,
  expanded,
  onToggle,
}: {
  entry: DiagnosticsEntry;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div data-testid="log-entry" data-kind={entry.kind}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className={cx(
          VERBATIM,
          'flex w-full cursor-default items-baseline gap-3 px-3 py-1 text-start hover:bg-ui-hover',
          expanded && 'bg-ui-hover',
        )}
      >
        <code className="shrink-0 text-ui-fg-muted">{clock(entry.at)}</code>
        <code className="shrink-0 text-ui-fg-muted">{entry.session.slice(0, 6)}</code>
        <code className="w-10 shrink-0 font-semibold text-ui-accent-fg">{entry.kind}</code>
        <code className="min-w-0 flex-1 truncate">{entrySummary(entry)}</code>
      </button>
      {expanded && (
        <pre
          className={cx(
            VERBATIM,
            'border-y border-ui-line bg-ui-raised px-3 py-2 whitespace-pre-wrap wrap-anywhere',
          )}
        >
          {JSON.stringify(entry.data, null, 2)}
        </pre>
      )}
    </div>
  );
}
