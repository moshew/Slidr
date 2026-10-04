import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import { openPanel, StatusItem, useEditor } from '../shell';
import { checkOf } from './app';

/** The id of the design check among the panels: the shell keeps the place under this name. */
export const PANEL_ID = 'lint';

/**
 * The design check in the status bar (UI-07): how many findings the open deck has, errors first.
 * A click opens the panel.
 */
export function StatusCount() {
  const { t } = useTranslation('lint');
  const { findings, pending } = useStore(checkOf(useEditor()).state);
  const errors = findings.filter((f) => f.severity === 'error').length;
  // Notes are information: the bar counts what asks to be looked at.
  const problems = findings.filter((f) => f.severity !== 'info').length;
  const [dot, label] =
    errors > 0
      ? [
          'bg-ui-danger-fg',
          errors === 1 ? t('status.error') : t('status.errors', { count: errors }),
        ]
      : problems > 0
        ? [
            'bg-ui-warning-fg',
            problems === 1 ? t('status.finding') : t('status.findings', { count: problems }),
          ]
        : ['bg-ui-success-fg', t('status.none')];
  return (
    <button
      type="button"
      aria-label={t('status.open')}
      data-testid="status-lint"
      data-errors={errors}
      data-problems={problems}
      onClick={() => openPanel(PANEL_ID)}
      className="flex min-w-0 cursor-default items-center rounded-control px-1 transition-colors hover:bg-ui-hover hover:text-ui-fg"
    >
      {/* The first check of a deck has nothing to show yet; later ones keep the last count. */}
      {pending && findings.length === 0 ? (
        <StatusItem busy>{t('status.checking')}</StatusItem>
      ) : (
        <StatusItem dot={dot}>{label}</StatusItem>
      )}
    </button>
  );
}
