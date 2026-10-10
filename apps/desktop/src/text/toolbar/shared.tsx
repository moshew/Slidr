import {
  expandRange,
  findElement,
  findSlide,
  fullRange,
  newId,
  plainText,
  rangeCells,
  walkElements,
  type Element,
  type TableElement,
} from '@slidr/model';
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
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from 'react';
import { create, useStore } from 'zustand';
import {
  returnKeyboard,
  toolClosed,
  useDeck,
  useEditor,
  useSelection,
  type Editor,
  type SelectionKind,
} from '../../shell';
import { formatOf, type TextHolder, type TextTarget } from '../actions';
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
export const LINK_KEYS = 'Ctrl+K';

/* ---------------------------------------------------------------- the target */

/**
 * What a formatting command acts on now (ADR-013): the text editor's selection while a text box or
 * a shape is being edited, or all the text of the one selected text box or shape. For a table it
 * is the editor open in one of its cells, or else the text of its selected cells: the ones the
 * table area names (`cellScope`), and all of them when the table is selected as a whole. For
 * several selected elements it is the text of all of them, when every one is a text box or a
 * shape with text: what the tools do must apply to every member of the selection. A group in
 * the selection, or selected alone, stands for the texts inside it: a card is a group, and its
 * text is formatted as the text of several text boxes is. Null otherwise.
 */
export function resolveTarget({
  bus,
  selection,
}: Pick<Editor, 'bus' | 'selection'>): TextTarget | null {
  const { currentSlideId, selectedElementIds, editingElementId } = selection.getState();
  const slide = currentSlideId ? findSlide(bus.deck, currentSlideId) : undefined;
  if (slide && !editingElementId) {
    const selected = selectedElementIds.map((id) => findElement(slide, id));
    if (selected.length > 1 || selected[0]?.type === 'group') {
      const held = selected.map(textsOf);
      if (!held.every((texts) => texts.length > 0)) return null;
      // A group and something inside it may both be selected: its text is formatted once.
      const elements = [...new Set(held.flat())];
      return { bus, slideId: slide.id, kind: 'elements', elements };
    }
  }
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

/**
 * Whether an element is one of several whose text is formatted together: a text box, or a shape
 * that has text. A shape without text has nothing the text tools would change.
 */
function holdsText(element: Element | undefined): element is TextHolder {
  if (element?.type === 'text') return true;
  return element?.type === 'shape' && plainText(element.content ?? { paragraphs: [] }) !== '';
}

/**
 * The texts a member of the selection brings to the tools: its own, and for a group those of
 * everything in it, at any depth. What is in a group and has no text (the box of a card, a
 * picture) is passed over; a member that brings none has nothing the tools would change.
 */
function textsOf(element: Element | undefined): TextHolder[] {
  if (element?.type === 'group') return [...walkElements(element.children)].filter(holdsText);
  return holdsText(element) ? [element] : [];
}

/**
 * The rows of a selection that is not one text and may hold several: several elements, and a
 * group. Both have the text tools of several elements (`SeveralTools.tsx`).
 */
export const SEVERAL_KINDS: readonly SelectionKind[] = ['multiple', 'group'];

/** Whether a tool is drawn in such a row, by the kind the row hands it. */
export const inSeveralRow = (kind: SelectionKind | undefined): boolean =>
  kind !== undefined && SEVERAL_KINDS.includes(kind);

/** The table a target is in, when it is the text of a table's cells. */
function tableOf(target: TextTarget | null | undefined): TableElement | undefined {
  return target && target.kind !== 'elements' && target.element.type === 'table'
    ? target.element
    : undefined;
}

/** The theme and the direction text is formatted against: the deck's, and in a table the table's. */
export function formatContext(
  { bus }: Pick<Editor, 'bus'>,
  target?: TextTarget | null,
): FormatContext {
  // The text of one text box has the box's colour where no run sets one.
  const color =
    target && target.kind !== 'elements' && target.element.type === 'text'
      ? target.element.color
      : undefined;
  return {
    theme: bus.deck.theme,
    dir: tableOf(target)?.dir ?? bus.deck.meta.dir,
    ...(color ? { color } : {}),
  };
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
  const table = tableOf(target);
  if (table) format = { ...format, direction: table.dir };
  return { target, format, ctx, editing: target.kind === 'editor' };
}

/* ---------------------------------------------------------------- focus */

/**
 * Gives the focus back to where the keyboard was working: the text editor while editing (its
 * selection comes back with it), the Stage otherwise, so Delete, the arrows and Enter keep acting
 * on the selected element.
 */
export const returnFocus = returnKeyboard;

/**
 * For `onCloseAutoFocus` of a popover or a menu: the focus goes back to the text, not to the
 * button that opened it, unless the keyboard was on that button when it opened; the rule is the
 * rows' own (`shell/toolFocus.ts`). Only when the closing left the focus nowhere or on a toolbar
 * button, though: a popover that closed because the user clicked into the text, into a field or
 * into another popover must not take the focus back from where that click put it.
 */
export const closeToText = toolClosed;

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
 * tools have three layouts, each used when the one before it does not fit:
 * - roomy (0), with everything SPEC 4.4 lists in the row;
 * - compact (1), with the secondary controls inside popovers;
 * - folded (2), for the row of several selected elements, which holds the arrange tools too: all
 *   the text tools are in the popover of one button (`SeveralTools.tsx`). A row that has no such
 *   button stays compact.
 */
type Density = 0 | 1 | 2;
const FOLDED: Density = 2;

const useDensity = create<{ level: Density }>(() => ({ level: 0 }));

/** The width the row's content took in each layout, the last time it was measured in it. */
const measured: number[] = [];

/**
 * `drawn` is the layout the row is drawn in. The row of several elements has two tools that
 * measure it (the fold button and the font). When the first finds the row too wide and picks the
 * next layout, the row is still drawn in the old one until React draws it again: measured then,
 * its width would be taken for the new layout's, and a row too wide to be roomy would go straight
 * to folded, without ever being compact.
 */
function measureRow(toolbar: HTMLElement, drawn: Density): void {
  if (useDensity.getState().level !== drawn) return;
  const boxes = [...toolbar.children]
    .map((child) => child.getBoundingClientRect())
    .filter((box) => box.width > 0);
  if (boxes.length === 0) return;
  const style = getComputedStyle(toolbar);
  const available =
    toolbar.clientWidth - parseFloat(style.paddingInlineStart) - parseFloat(style.paddingInlineEnd);
  // The tools sit in a strip that scrolls when the row has no room for them all
  // (`shell/TopTools.tsx`): what is scrolled out of sight is part of what the row has to hold.
  const strip = toolbar.querySelector<HTMLElement>('[data-row-tools]');
  const hidden = strip ? Math.max(0, strip.scrollWidth - strip.clientWidth) : 0;
  const content =
    Math.max(...boxes.map((box) => box.right)) - Math.min(...boxes.map((box) => box.left)) + hidden;
  const { level } = useDensity.getState();
  measured[level] = content;
  if (content > available + 0.5) {
    if (level < FOLDED) useDensity.setState({ level: (level + 1) as Density });
    return;
  }
  // Back to the layout before this one, once the room it was last seen to need is there.
  const before = level > 0 ? measured[level - 1] : undefined;
  if (before !== undefined && available >= before)
    useDensity.setState({ level: (level - 1) as Density });
}

/** Set around the tools that are drawn inside the popover of a folded row: there they are roomy. */
export const InFold = createContext(false);

/** Whether the text tools are in their compact layout. */
export function useCompact(): boolean {
  const inFold = useContext(InFold);
  return useDensity((s) => s.level > 0) && !inFold;
}

/** Whether the row has no room for the text tools even in their compact layout. */
export function useFolded(): boolean {
  return useDensity((s) => s.level === FOLDED);
}

/**
 * Measures the toolbar an element sits in and picks the layout. The font tool calls it, and in
 * the row of several elements the fold button too (`SeveralTools.tsx`); the others read
 * `useCompact`.
 */
export function useMeasuredDensity(anchor: RefObject<HTMLElement | null>): void {
  // The layout this render draws: the tool is drawn again whenever another one is picked.
  const level = useDensity((s) => s.level);
  const drawn = useRef(level);
  // After every render of the tool: what the row holds may have changed with the selection.
  useLayoutEffect(() => {
    drawn.current = level;
    const toolbar = anchor.current?.closest<HTMLElement>('[role="toolbar"]');
    if (toolbar) measureRow(toolbar, level);
  });
  useEffect(() => {
    const toolbar = anchor.current?.closest<HTMLElement>('[role="toolbar"]');
    if (!toolbar) return;
    const observer = new ResizeObserver(() => measureRow(toolbar, drawn.current));
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
  onClose,
  children,
}: {
  label: string;
  icon: LucideIcon;
  mirror?: boolean;
  /** The popover closed: the place to close an undo step that a drag left open. */
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <Popover onOpenChange={(open) => !open && onClose?.()}>
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
