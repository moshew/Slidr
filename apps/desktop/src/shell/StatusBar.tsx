import type { ComponentType, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx, Spinner } from '@slidr/ui';
import { autosaveFailure } from '../document/failures';
import { useDeck, useFile, useSelection } from './editor';
import { useStatusItem } from './registry';
import { useShell } from './store';

/**
 * The status bar (UI-07): slide n of total, zoom and save state at the start; the agent's state
 * and the design-check count at the end. The agent's state is drawn by the area that runs it
 * (`registerStatusItem`); the design-check count is a placeholder until WG7.
 */
export function StatusBar() {
  const { t } = useTranslation();
  const slides = useDeck((s) => s.deck.slides);
  const current = useSelection((s) => s.currentSlideId);
  const scale = useShell((s) => s.viewScale);
  const index = slides.findIndex((s) => s.id === current);
  const Agent = useStatusItem('agent');
  const Lint = useStatusItem('lint');

  return (
    <footer
      data-testid="status-bar"
      className="flex h-statusbar shrink-0 items-center gap-5 border-t border-ui-line bg-ui-chrome px-3 text-xs text-ui-fg-muted"
    >
      <span data-testid="status-slide" className="tabular-nums">
        {slides.length === 0
          ? t('status.noSlides')
          : t('status.slide', { current: index + 1, total: slides.length })}
      </span>
      <span data-testid="status-zoom" aria-label={t('status.zoom')} className="tabular-nums">
        {Math.round(scale * 100)}%
      </span>
      <SaveState />
      <div className="flex-1" />
      {Agent ? (
        <Registered render={Agent} />
      ) : (
        <StatusItem dot="bg-ui-fg-subtle">{t('status.agentIdle')}</StatusItem>
      )}
      {Lint ? (
        <Registered render={Lint} />
      ) : (
        <StatusItem dot="bg-ui-success-fg">{t('status.lintNone')}</StatusItem>
      )}
    </footer>
  );
}

/** A part of the bar that another area draws. */
function Registered({ render: Render }: { render: ComponentType }) {
  return <Render />;
}

/** One state in the status bar: a dot in the colour of the state, or a spinner, and a few words. */
export function StatusItem({
  dot,
  busy = false,
  children,
}: {
  dot?: string;
  /** Something is running: a spinner takes the dot's place. */
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {busy ? (
        <Spinner className="size-3" />
      ) : (
        dot && <span aria-hidden className={cx('size-1.5 shrink-0 rounded-full', dot)} />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

function SaveState() {
  const { t } = useTranslation();
  const { path, dirty, busy, autosaveFailure: failure } = useFile((s) => s);
  if (busy === 'saving') {
    return (
      <span data-testid="status-save">
        <StatusItem busy>{t('status.saving')}</StatusItem>
      </span>
    );
  }
  // The autosave cannot write (a full disk, a folder it may not write to): said for as long as
  // it lasts, because until then the changes are in memory alone (WG13-T03).
  if (failure) {
    return (
      <span data-testid="status-save" data-failure={failure} role="alert">
        <StatusItem dot="bg-ui-danger">
          <span className="text-ui-danger-fg">{autosaveFailure(failure)}</span>
        </StatusItem>
      </span>
    );
  }
  const [dot, label] = dirty
    ? ['bg-ui-warning-fg', t('status.unsaved')]
    : path
      ? ['bg-ui-success-fg', t('status.saved')]
      : ['bg-ui-fg-subtle', t('status.neverSaved')];
  return (
    <span data-testid="status-save">
      <StatusItem dot={dot}>{label}</StatusItem>
    </span>
  );
}
