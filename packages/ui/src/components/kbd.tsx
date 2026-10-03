import { cx } from '../cx';

export interface KbdProps {
  /** Keys joined by `+`, as in SPEC Appendix A: `Ctrl+Shift+S`. */
  keys: string;
  /** `inverted` sits on a tooltip. */
  tone?: 'default' | 'inverted';
  className?: string;
}

/** A keyboard shortcut, one keycap per key. Always left-to-right, also in a Hebrew UI. */
export function Kbd({ keys, tone = 'default', className }: KbdProps) {
  return (
    <span dir="ltr" className={cx('inline-flex shrink-0 items-center gap-0.5', className)}>
      {keys.split('+').map((key, i) => (
        <kbd
          key={i}
          className={cx(
            'inline-flex items-center justify-center rounded-small px-1 font-ui text-xs font-medium',
            tone === 'default'
              ? 'h-5 min-w-5 border border-ui-line bg-ui-field text-ui-fg-muted'
              : 'h-4.5 min-w-4.5 bg-ui-on-tooltip/15 text-ui-on-tooltip',
          )}
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
