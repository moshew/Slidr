import type { ComponentPropsWithRef } from 'react';
import { Tabs as RadixTabs } from 'radix-ui';
import { cx } from '../cx';
import { Icon, type LucideIcon } from './icon';

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentPropsWithRef<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cx('flex items-stretch gap-4 border-b border-ui-line', className)}
      {...props}
    />
  );
}

/** A tab: muted text, the active one in full colour over an accent underline. */
export function TabsTrigger({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cx(
        'relative -mx-1 -mb-px inline-flex h-9 cursor-default items-center gap-1.5 rounded-t-small border-b-2 border-transparent px-1 text-sm font-medium text-ui-fg-muted transition-colors select-none',
        'hover:text-ui-fg focus-visible:-outline-offset-2 disabled:text-ui-fg-subtle',
        'data-[state=active]:border-ui-accent data-[state=active]:text-ui-fg',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Tabs drawn as tiles, the way the Activity Bar draws its panels: an icon over a short label, the
 * active tile in the accent's soft tint. For a handful of topics in a narrow column, where a row
 * of words would not fit. The tiles share the row's width.
 */
export function TabsTileList({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixTabs.List>) {
  return <RadixTabs.List className={cx('flex items-stretch gap-0.5', className)} {...props} />;
}

export function TabsTile({
  icon,
  label,
  className,
  ...props
}: Omit<ComponentPropsWithRef<typeof RadixTabs.Trigger>, 'children'> & {
  icon: LucideIcon;
  /** The tile's words, and its accessible name. */
  label: string;
}) {
  return (
    <RadixTabs.Trigger
      className={cx(
        'inline-flex min-w-0 flex-1 cursor-default flex-col items-center justify-center gap-1 rounded-control px-0.5 py-2 text-ui-fg-muted transition-colors select-none',
        'hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed focus-visible:outline-offset-0 disabled:text-ui-fg-subtle',
        'data-[state=active]:bg-ui-accent-soft data-[state=active]:text-ui-accent-fg',
        className,
      )}
      {...props}
    >
      <Icon icon={icon} size="md" />
      <span className="w-full truncate text-center text-xs font-medium">{label}</span>
    </RadixTabs.Trigger>
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixTabs.Content>) {
  // The panel of a tab is a stop of Tab, so it shows when it has the keyboard, inside its edge.
  return (
    <RadixTabs.Content className={cx('focus-visible:-outline-offset-2', className)} {...props} />
  );
}
