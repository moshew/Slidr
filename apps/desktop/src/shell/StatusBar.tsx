import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cx, Spinner } from '@slidr/ui';
import { useDeck, useFile, useSelection } from './editor';
import { useShell } from './store';

/**
 * The status bar (UI-07): slide n of total, zoom and save state at the start; the agent's state
 * and the design-check count at the end. The last two are placeholders until WG10 and WG7.
 */
export function StatusBar() {
  const { t } = useTranslation();
  const slides = useDeck((s) => s.deck.slides);
  const current = useSelection((s) => s.currentSlideId);
  const scale = useShell((s) => s.viewScale);
  const index = slides.findIndex((s) => s.id === current);

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
      <Item dot="bg-ui-fg-subtle">{t('status.agentIdle')}</Item>
      <Item dot="bg-ui-success-fg">{t('status.lintNone')}</Item>
    </footer>
  );
}

function Item({ dot, children }: { dot?: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      {dot && <span aria-hidden className={cx('size-1.5 rounded-full', dot)} />}
      {children}
    </span>
  );
}

function SaveState() {
  const { t } = useTranslation();
  const { path, dirty, busy } = useFile((s) => s);
  if (busy === 'saving') {
    return (
      <span data-testid="status-save" className="flex items-center gap-1.5">
        <Spinner className="size-3" />
        {t('status.saving')}
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
      <Item dot={dot}>{label}</Item>
    </span>
  );
}
