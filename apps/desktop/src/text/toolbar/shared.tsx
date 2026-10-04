import { expandRange, findElement, findSlide, fullRange, newId, rangeCells } from '@slidr/model';
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
import { focusStage, useDeck, useEditor, useSelection, type Editor } from '../../shell';
import { formatOf, type TextTarget } from '../actions';
import { activeEditor, editorFor } from '../activeEditor';
import { cellScope } from '../cellScope';
import type { FormatContext, TextFormat } from '../format';

/* What the text tools of row B share: the target, the focus, and their layout. */

/**
 * The keys of the text area that are both a shortcut and a button's tooltip. Each is one key of
 * every layout: the backslash is where it is on a Hebrew keyboard too, and letters are matched
 * by the physical key.
 */
export const CLEAR_KEYS = 'Ctrl+\\';
export const PICK_FORMAT_KEYS = 'Ctrl+Alt+C';
export const PAINT_FORMAT_KEYS = 'Ctrl+Alt+V';

/* ---------------------------------------------------------------- the target */

/**
 * What a formatting command acts on now (ADR-013): the text editor's selection while a text box or
 * a shape is being edited, or all the text of the one selected text box or shape. For a table it
 * is the editor open in one of its cells, or else the text of its selected cells: the ones the
 * table area names (`cellScope`), and all of them when the table is selected as a whole. Null
 * otherwise.
 */
export function resolveTarget({ bus, selection }: Editor): TextTarget | null {
  const { currentSlideId, selectedElementIds, editingElementId } = selection.getState();
  const slide = currentSlideId ? findSlide(bus.deck, currentSlideId) : undefined;
  const id = editingElementId ?? (selectedElementIds.length === 1 ? selectedElementIds[0] : null);
  const element = slide && id ? findElement(slide, id) : undefined;
  if (!slide || !element) return null;
  const base = { bus, slideId: slide.id };
  const active = editingElementId ? editorFor(editingElementId) : null;
  if (element.type === 'table') {
    if (active) return { ...base, kind: 'editor', view: active.editor.view, element };
    const { scope } = cellScope.getState();
    const inScope = scope?.elementId === element.id && editingElementId === element.id;
    // The range is kept inside the table: an undo may have taken rows or columns away under it.
    const whole = fullRange(element);
    const range = inScope
      ? expandRange(element, {
          row0: Math.min(scope.range.row0, whole.row1),
          col0: Math.min(scope.range.col0, whole.col1),
          row1: Math.min(scope.range.row1, whole.row1),
          col1: Math.min(scope.range.col1, whole.col1),
        })
      : whole;
    return { ...base, kind: 'cells', element, cells: rangeCells(element, range) };
  }
  if (element.type !== 'text' && element.type !== 'shape') return null;
  // For the moment between "editing" and the editor being there, the element stands in.
  return active
    ? { ...base, kind: 'editor', view: active.editor.view, element }
    : { ...base, kind: 'element', element };
}

/** The theme and the direction text is formatted against: the deck's, and in a table the table's. */
export function formatContext({ bus }: Editor, target?: TextTarget | null): FormatContext {
  const dir = target?.element.type === 'table' ? target.element.dir : bus.deck.meta.dir;
  return { theme: bus.deck.theme, dir };
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
  useStore(cellScope, (s) => s.scope);
  const target = resolveTarget(editor);
  if (!target) return null;
  const ctx = formatContext(editor, target);
  let format = formatOf(target, ctx);
  // In a table the sides of the alignment are the table's (`TextDefaults.alignTo`): the
  // alignment buttons name them by its direction, whichever way a cell's own text reads.
  if (target.element.type === 'table') format = { ...format, direction: target.element.dir };
  return { target, format, ctx, editing: target.kind === 'editor' };
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
  else focusStage();
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

/** An on / off button of the text tools: small, and a click on it leaves the focus in the text. */
export function TextToggle(props: ToggleProps) {
  return <Toggle size="sm" onMouseDown={keepFocus} {...props} />;
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
