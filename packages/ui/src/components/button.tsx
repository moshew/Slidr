import type { ComponentPropsWithRef } from 'react';
import { cx } from '../cx';
import { Icon, type LucideIcon } from './icon';
import { Spinner } from './spinner';
import { Tooltip, type TooltipSide } from './tooltip';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'soft' | 'danger';
export type ButtonSize = 'sm' | 'md';

const base =
  'inline-flex shrink-0 cursor-default items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium select-none transition-colors disabled:pointer-events-none aria-busy:pointer-events-none';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-ui-accent text-ui-on-accent hover:bg-ui-accent-hover active:bg-ui-accent-pressed disabled:bg-ui-field disabled:text-ui-fg-subtle',
  secondary:
    'border border-ui-line-strong text-ui-fg hover:bg-ui-hover active:bg-ui-pressed disabled:border-ui-line disabled:text-ui-fg-subtle',
  ghost: 'text-ui-fg hover:bg-ui-hover active:bg-ui-pressed disabled:text-ui-fg-subtle',
  soft: 'bg-ui-accent-soft text-ui-accent-fg hover:bg-ui-accent-soft-hover active:bg-ui-accent-soft-hover disabled:bg-ui-field disabled:text-ui-fg-subtle',
  danger:
    'bg-ui-danger text-ui-on-danger hover:bg-ui-danger-hover active:bg-ui-danger-hover disabled:bg-ui-field disabled:text-ui-fg-subtle',
};

/** Icon-only ghost buttons sit in toolbars: muted until hovered, like the text around them. */
const quietGhost =
  'text-ui-fg-muted hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed active:text-ui-fg disabled:text-ui-fg-subtle';

const sizes: Record<ButtonSize, string> = {
  sm: 'h-control-sm px-2.5 text-sm',
  md: 'h-control px-3 text-sm',
};

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon. */
  icon?: LucideIcon;
  /** Trailing icon, e.g. a chevron on a menu button. */
  iconEnd?: LucideIcon;
  /** Busy: shows a spinner in place of the leading icon and ignores clicks. */
  loading?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconEnd,
  loading = false,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      aria-busy={loading || undefined}
      className={cx(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading ? <Spinner /> : icon && <Icon icon={icon} />}
      {children}
      {iconEnd && <Icon icon={iconEnd} className="-me-0.5 opacity-70" />}
    </button>
  );
}

export interface IconButtonProps extends Omit<ComponentPropsWithRef<'button'>, 'children'> {
  icon: LucideIcon;
  /** The accessible name, also shown as the tooltip. */
  label: string;
  shortcut?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Flip the icon in right-to-left layouts (undo, redo, arrows). */
  mirror?: boolean;
  loading?: boolean;
  tooltipSide?: TooltipSide;
  /** Skip the tooltip, when the label is already visible nearby. */
  noTooltip?: boolean;
}

/** A square icon button with a tooltip. The label is required: an icon is not a name. */
export function IconButton({
  icon,
  label,
  shortcut,
  variant = 'ghost',
  size = 'md',
  mirror,
  loading = false,
  tooltipSide = 'bottom',
  noTooltip = false,
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  const button = (
    <button
      type={type}
      aria-label={label}
      aria-busy={loading || undefined}
      className={cx(
        base,
        variant === 'ghost' ? quietGhost : variants[variant],
        size === 'md' ? 'size-control' : 'size-control-sm',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : <Icon icon={icon} mirror={mirror} />}
    </button>
  );
  if (noTooltip) return button;
  return (
    <Tooltip content={label} shortcut={shortcut} side={tooltipSide}>
      {/* A disabled button gets no pointer events; the wrapper still says what it is. */}
      {props.disabled ? <span className="inline-flex">{button}</span> : button}
    </Tooltip>
  );
}
