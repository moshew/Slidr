import type { ComponentPropsWithRef } from 'react';
import { Toggle as RadixToggle } from 'radix-ui';
import { cx } from '../cx';
import { Icon, type LucideIcon } from './icon';
import { Tooltip } from './tooltip';

export interface ToggleProps extends Omit<
  ComponentPropsWithRef<typeof RadixToggle.Root>,
  'children' | 'asChild'
> {
  icon: LucideIcon;
  /** The accessible name, also the tooltip. */
  label: string;
  shortcut?: string;
  size?: 'sm' | 'md';
}

/** An on/off icon button, such as Bold. Pressed reads as selected: the accent tint. */
export function Toggle({ icon, label, shortcut, size = 'md', className, ...props }: ToggleProps) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <RadixToggle.Root
        aria-label={label}
        className={cx(
          'inline-flex shrink-0 cursor-default items-center justify-center rounded-control text-ui-fg-muted transition-colors select-none',
          'hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed disabled:text-ui-fg-subtle',
          'data-[state=on]:bg-ui-accent-soft data-[state=on]:text-ui-accent-fg data-[state=on]:hover:bg-ui-accent-soft-hover',
          size === 'md' ? 'size-control' : 'size-control-sm',
          className,
        )}
        {...props}
      >
        <Icon icon={icon} />
      </RadixToggle.Root>
    </Tooltip>
  );
}
