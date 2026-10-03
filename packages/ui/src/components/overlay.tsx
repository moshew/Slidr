import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Dialog as RadixDialog, Popover as RadixPopover } from 'radix-ui';
import { X } from 'lucide-react';
import { cx } from '../cx';
import { IconButton } from './button';
import { usePortalContainer } from './provider';

/* ---------------------------------------------------------------- popover */

export const Popover = RadixPopover.Root;
export const PopoverTrigger = RadixPopover.Trigger;
export const PopoverAnchor = RadixPopover.Anchor;
export const PopoverClose = RadixPopover.Close;

/** A floating panel next to its trigger: forms and pickers. */
export function PopoverContent({
  className,
  sideOffset = 6,
  align = 'start',
  ...props
}: ComponentPropsWithRef<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal container={usePortalContainer()}>
      <RadixPopover.Content
        sideOffset={sideOffset}
        align={align}
        collisionPadding={8}
        className={cx(
          'z-50 w-popover rounded-panel border border-ui-line bg-ui-raised p-4 text-sm text-ui-fg shadow-overlay animate-overlay-in',
          className,
        )}
        {...props}
      />
    </RadixPopover.Portal>
  );
}

/* ---------------------------------------------------------------- dialog */

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps extends Omit<
  ComponentPropsWithRef<typeof RadixDialog.Content>,
  'title'
> {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons at the end of the dialog, the main action last. */
  footer?: ReactNode;
  /** The accessible name of the close button; omit it to have no close button. */
  closeLabel?: string;
}

/** A modal dialog centred over a scrim. */
export function DialogContent({
  title,
  description,
  footer,
  closeLabel,
  className,
  children,
  ...props
}: DialogContentProps) {
  return (
    <RadixDialog.Portal container={usePortalContainer()}>
      <RadixDialog.Overlay className="fixed inset-0 z-50 animate-fade-in bg-ui-scrim" />
      <RadixDialog.Content
        // A description is optional; Radix warns unless told there is none.
        {...(description ? {} : { 'aria-describedby': undefined })}
        className={cx(
          'fixed inset-0 z-50 m-auto flex h-fit w-dialog animate-overlay-in flex-col gap-4 rounded-panel border border-ui-line bg-ui-raised p-5 text-sm text-ui-fg shadow-overlay',
          className,
        )}
        {...props}
      >
        <div className="flex flex-col gap-1 pe-8">
          <RadixDialog.Title className="text-md font-semibold">{title}</RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="text-ui-fg-muted">
              {description}
            </RadixDialog.Description>
          )}
        </div>
        {children}
        {footer && <div className="flex justify-end gap-2 pt-1">{footer}</div>}
        {closeLabel && (
          <RadixDialog.Close asChild>
            <IconButton
              icon={X}
              label={closeLabel}
              size="sm"
              noTooltip
              className="absolute end-3 top-3"
            />
          </RadixDialog.Close>
        )}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
