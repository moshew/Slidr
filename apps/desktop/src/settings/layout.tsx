import type { ReactNode } from 'react';
import { cx } from '@slidr/ui';

/*
 * What the sections of the settings screen are laid out with, so every tab reads alike: groups
 * under a small heading, each a card of rows divided by hairlines, and a note under the card
 * where one is needed.
 */

/** A group of settings: its heading, a card of rows, and a note under the card. */
export function SettingsGroup({
  title,
  note,
  children,
  className,
  'data-testid': testId,
}: {
  title?: string;
  /** A line under the card: what the settings above it apply to. */
  note?: ReactNode;
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-2', className)} data-testid={testId}>
      {title && <h4 className="px-1 text-xs font-semibold text-ui-fg-muted">{title}</h4>}
      <SettingsCard>{children}</SettingsCard>
      {note && <p className="px-1 text-xs text-ui-fg-muted">{note}</p>}
    </div>
  );
}

/** The card of a group: its rows, one under the other, divided by hairlines. */
export function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        'flex min-w-0 flex-col divide-y divide-ui-line overflow-hidden rounded-panel border border-ui-line bg-ui-panel',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A row of a card that lays out what it holds itself: a field, a switch, a key. */
export function SettingsItem({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('flex min-w-0 flex-col gap-2 px-3 py-3', className)}>{children}</div>;
}

/** A row of a card: what it is at the start, and its control at the end. */
export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm text-ui-fg">{label}</span>
        {hint && <span className="text-xs text-ui-fg-muted">{hint}</span>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-1.5">{children}</div>}
    </div>
  );
}

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

const pillTones: Record<StatusTone, string> = {
  success: 'bg-ui-tool-green text-ui-tool-green-fg',
  warning: 'bg-ui-tool-orange text-ui-tool-orange-fg',
  danger: 'bg-ui-danger-soft text-ui-danger-fg',
  neutral: 'bg-ui-field text-ui-fg-muted',
};

/** A state in a word or two, in a tinted pill with a dot: ready, needs a key, not signed in. */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex h-5 max-w-full shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        pillTones[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className="truncate">{children}</span>
    </span>
  );
}
