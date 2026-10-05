import type { ComponentPropsWithRef } from 'react';
import { Tabs as RadixTabs } from 'radix-ui';
import { cx } from '../cx';

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

export function TabsContent({
  className,
  ...props
}: ComponentPropsWithRef<typeof RadixTabs.Content>) {
  // The panel of a tab is a stop of Tab, so it shows when it has the keyboard, inside its edge.
  return (
    <RadixTabs.Content className={cx('focus-visible:-outline-offset-2', className)} {...props} />
  );
}
