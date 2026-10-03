import { findElement, findSlide, newId } from '@slidr/model';
import {
  cx,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Toggle,
  type LucideIcon,
  type ToggleProps,
} from '@slidr/ui';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { create, useStore } from 'zustand';
import { useDeck, useEditor, useSelection, type Editor } from '../../shell';
import { formatOf, type TextTarget } from '../actions';
import { activeEditor, editorFor } from '../activeEditor';
import type { FormatContext, TextFormat } from '../format';

/* What the text tools of row B share: the target, the focus, and their layout. */

/* ---------------------------------------------------------------- the target */

/**
 * What a formatting command acts on now (ADR-013): the text editor's selection while a text box or
 * a shape is being edited, or all the text of the one selected text box or shape. Null otherwise.
 */
export function resolveTarget({ bus, selection }: Editor): TextTarget | null {
  const { currentSlideId, selectedElementIds, editingElementId } = selection.getState();
  const slide = currentSlideId ? findSlide(bus.deck, currentSlideId) : undefined;
  const id = editingElementId ?? (selectedElementIds.length === 1 ? selectedElementIds[0] : null);
  const element = slide && id ? findElement(slide, id) : undefined;
  if (!slide || !element || (element.type !== 'text' && element.type !== 'shape')) return null;
  const base = { bus, slideId: slide.id, element };
  const active = editingElementId ? editorFor(editingElementId) : null;
  // For the moment between "editing" and the editor being there, the element stands in.
  return active
    ? { ...base, kind: 'editor', view: active.editor.view }
    : { ...base, kind: 'element' };
}

export function formatContext({ bus }: Editor): FormatContext {
  return { theme: bus.deck.theme, dir: bus.deck.meta.dir };
}

export interface Text {
  target: TextTarget;
  format: TextFormat;
  ctx: FormatContext;
  /** The text editor is open: formatting goes to its selection. */
  editing: boolean;
}

/** The target and its current formatting, for a tool of row B. Follows the selection and the caret. */
export function useText(): Text | null {
  const editor = useEditor();
  // Each of these changes what the target is or how it is formatted.
  useDeck((s) => s.deck);
  useSelection((s) => s.currentSlideId);
  useSelection((s) => s.selectedElementIds);
  useSelection((s) => s.editingElementId);
  useStore(activeEditor, (s) => s.version);
  const target = resolveTarget(editor);
  if (!target) return null;
  const ctx = formatContext(editor);
  return { target, format: formatOf(target, ctx), ctx, editing: target.kind === 'editor' };
}

/* ---------------------------------------------------------------- focus */

/**
 * Gives the focus back to where the keyboard was working: the text editor while editing (its
 * selection comes back with it), the Stage otherwise, so Delete, the arrows and Enter keep acting
 * on the selected element.
 */
export function returnFocus(): void {
  const { active } = activeEditor.getState();
  if (active && !active.editor.isDestroyed) active.editor.view.focus();
  else
    document
      .querySelector<HTMLElement>('[data-testid="stage-surface"]')
      ?.focus({ preventScroll: true });
}

/**
 * For `onCloseAutoFocus` of a popover or a menu: the focus goes back to the text, not to the
 * button that opened it. Only when the closing left the focus nowhere or on a toolbar button,
 * though: a popover that closed because the user clicked into the text, into a field or into
 * another popover must not take the focus back from where that click put it.
 */
export function closeToText(event: Event): void {
  event.preventDefault();
  const active = document.activeElement;
  const onButton = active instanceof HTMLButtonElement && active.closest('[role="toolbar"]');
  if (!active || active === document.body || onButton) returnFocus();
}

/**
 * For `onOpenAutoFocus` of a popover: the focus goes to the popover itself, not to its first
 * control. A control that is focused shows its tooltip, over its neighbours, and the first Esc
 * would then close the tooltip instead of the popover.
 */
export function openOnPopover(event: Event): void {
  event.preventDefault();
  if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true });
}

/** For `onMouseDown` of a plain button: a click does not take the focus from the text. */
export function keepFocus(event: SyntheticEvent): void {
  event.preventDefault();
}

/**
 * The transaction of a control whose steps come one after another: the arrow keys in a number
 * field. Steps of one property (`key`) less than `ms` apart are one undo step; a step of another
 * property starts a new one.
 */
export function useBurstTx(ms = 800): (key?: string) => string {
  const last = useRef<{ txId: string; key: string; at: number } | null>(null);
  return useMemo(
    () =>
      (key = '') => {
        const now = performance.now();
        if (!last.current || last.current.key !== key || now - last.current.at > ms)
          last.current = { txId: newId('tx'), key, at: now };
        last.current.at = now;
        return last.current.txId;
      },
    [ms],
  );
}

/* ---------------------------------------------------------------- density */

/**
 * Row B is as wide as the editor column: about 1256px at 1920 and 866px at 1366 (SPEC 4.1), less
 * when the Tool Panel is dragged wider, and it also holds the tools of other areas. The text
 * tools have two layouts: roomy, with everything SPEC 4.4 lists in the row, and compact, with the
 * secondary controls inside popovers. Compact is used when roomy does not fit.
 */
const useDensity = create<{ compact: boolean }>(() => ({ compact: false }));

/** The width the row's content took in the roomy layout, the last time it was measured. */
let roomyWidth = 0;

function measureRow(toolbar: HTMLElement): void {
  const first = toolbar.firstElementChild?.getBoundingClientRect();
  const last = toolbar.lastElementChild?.getBoundingClientRect();
  if (!first || !last) return;
  const style = getComputedStyle(toolbar);
  const available =
    toolbar.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
  const content = Math.max(first.right, last.right) - Math.min(first.left, last.left);
  const { compact } = useDensity.getState();
  if (!compact) {
    roomyWidth = content;
    if (content > available + 0.5) useDensity.setState({ compact: true });
  } else if (roomyWidth > 0 && available >= roomyWidth) {
    useDensity.setState({ compact: false });
  }
}

/** Whether the text tools are in their compact layout. */
export function useCompact(): boolean {
  return useDensity((s) => s.compact);
}

/**
 * Measures the toolbar an element sits in and picks the layout. One tool of the row calls it (the
 * first); the others read `useCompact`.
 */
export function useMeasuredDensity(anchor: RefObject<HTMLElement | null>): void {
  // After every render of the tool: what the row holds may have changed with the selection.
  useLayoutEffect(() => {
    const toolbar = anchor.current?.closest<HTMLElement>('[role="toolbar"]');
    if (toolbar) measureRow(toolbar);
  });
  useEffect(() => {
    const toolbar = anchor.current?.closest<HTMLElement>('[role="toolbar"]');
    if (!toolbar) return;
    const observer = new ResizeObserver(() => measureRow(toolbar));
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, [anchor]);
}

/* ---------------------------------------------------------------- layout */

/** A row B button that opens a popover; closing it gives the focus back to the text. */
export function PopoverTool({
  label,
  icon,
  mirror,
  children,
}: {
  label: string;
  icon: LucideIcon;
  mirror?: boolean;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton icon={icon} mirror={mirror} label={label} size="sm" onMouseDown={keepFocus} />
      </PopoverTrigger>
      <PopoverContent
        onOpenAutoFocus={openOnPopover}
        onCloseAutoFocus={closeToText}
        className="focus-visible:outline-none"
      >
        <div className="flex flex-col gap-3">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * An on / off button of the text tools: small, and a click on it leaves the focus in the text.
 *
 * The pressed look is given here by `aria-pressed`. The design system's `Toggle` styles it by
 * `data-state="on"`, which its own tooltip overwrites with the tooltip's state, so a pressed
 * toggle looks like any other (reported to the owner of `@slidr/ui`).
 */
export function TextToggle({ className, ...props }: ToggleProps) {
  return (
    <Toggle
      size="sm"
      onMouseDown={keepFocus}
      className={cx(
        'aria-pressed:bg-ui-accent-soft aria-pressed:text-ui-accent-fg aria-pressed:hover:bg-ui-accent-soft-hover',
        className,
      )}
      {...props}
    />
  );
}

/** A control beside its label, in a popover. */
export function Row({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex min-h-control-sm items-center justify-between gap-3', className)}>
      <span className="text-xs font-medium text-ui-fg-muted">{label}</span>
      <div className="flex items-center gap-0.5">{children}</div>
    </div>
  );
}
