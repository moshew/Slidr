import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Image,
  Shapes,
  Slash,
  Table,
  Type,
  type LucideIcon,
} from '@slidr/ui/icons';
import { cx, IconButton, Popover, PopoverContent, PopoverTrigger } from '@slidr/ui';
import { useDeck, useSelection } from './editor';
import {
  useAction,
  useActionPopover,
  useContextTools,
  type ActionPopoverProps,
  type ToolAction,
} from './registry';
import { selectionKind } from './selection';
import { watchToolFocus } from './toolFocus';

function Group({ children, label }: { children: ReactNode; label?: string }) {
  return (
    // A tool may draw nothing for the element at hand; its group then takes no room in the row.
    <div role="group" aria-label={label} className="flex items-center gap-0.5 empty:hidden">
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- insertion tools */

const inserts: {
  action: ToolAction;
  icon: LucideIcon;
  label: string;
}[] = [
  {
    action: 'insert.text',
    icon: Type,
    label: 'tools.insertText',
  },
  {
    action: 'insert.image',
    icon: Image,
    label: 'tools.insertImage',
  },
  {
    action: 'insert.elements',
    icon: Shapes,
    label: 'elements:title',
  },
  {
    action: 'insert.line',
    icon: Slash,
    label: 'tools.insertLine',
  },
  {
    action: 'insert.table',
    icon: Table,
    label: 'tools.insertTable',
  },
  {
    action: 'insert.chart',
    icon: ChartColumn,
    label: 'tools.insertChart',
  },
  {
    action: 'insert.media',
    icon: Clapperboard,
    label: 'tools.insertMedia',
  },
];

function ActionButton({
  action,
  icon,
  label,
}: {
  action: ToolAction;
  icon: LucideIcon;
  label: string;
}) {
  const { t } = useTranslation();
  const run = useAction(action);
  const popover = useActionPopover(action);
  const trigger = (
    <IconButton
      icon={icon}
      label={t(label)}
      size="sm"
      data-tool={action}
      // As strong as the slide tools beside them, which carry their names: an icon button by
      // itself is muted until it is hovered.
      className="enabled:text-ui-fg"
      disabled={!popover && !run}
      onClick={popover ? undefined : run}
    />
  );
  if (popover) return <PopoverButton trigger={trigger} content={popover} />;
  return trigger;
}

/** An insertion button whose area registered a popover, such as the shape library. */
function PopoverButton({
  trigger,
  content: Content,
}: {
  trigger: ReactNode;
  content: ComponentType<ActionPopoverProps>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent>
        <Content close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/* ---------------------------------------------------------------- selection tools */

function useSelectionKind() {
  const deck = useDeck((s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const elementIds = useSelection((s) => s.selectedElementIds);
  const editingId = useSelection((s) => s.editingElementId);
  return selectionKind(deck, slideId, elementIds, editingId);
}

/** How much of the strip one press on its edge brings into view. */
const STRIP_STEP = 0.7;

/**
 * Selection tools and slide insertion buttons share a strip that takes the room the toolbar
 * has for them. When the row is narrower than its tools, the strip scrolls sideways: by the
 * wheel, by the arrow that shows on the side where tools are out
 * of sight, and by Tab, which brings the tool it lands on into view. No tool is ever out of
 * reach, and none is moved or folded away for it.
 */
function ToolStrip({
  testId,
  startOver,
  gaps = '',
  children,
}: {
  /** The arrows are `<testId>-start` and `<testId>-end`. */
  testId: string;
  /** What the strip shows: when it changes, the strip starts again from its first tool. */
  startOver?: string;
  /** The classes of the space between the groups of the strip. */
  gaps?: string;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const strip = useRef<HTMLDivElement>(null);
  const tools = useRef<HTMLDivElement>(null);
  /** Tools are out of sight before the strip's start, and after its end. */
  const [more, setMore] = useState({ start: false, end: false });
  // A strip that reads right to left scrolls to the left, which the browser counts down from 0.
  const towardsEnd = i18n.dir() === 'rtl' ? -1 : 1;

  const look = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    const hidden = el.scrollWidth - el.clientWidth;
    const at = Math.abs(el.scrollLeft);
    const next = { start: hidden > 1 && at > 1, end: hidden > 1 && at < hidden - 1 };
    setMore((was) => (was.start === next.start && was.end === next.end ? was : next));
  }, []);

  // Another kind of selection is another row: it starts from its first tool.
  useLayoutEffect(() => {
    strip.current?.scrollTo({ left: 0 });
    look();
  }, [startOver, look]);
  useEffect(() => {
    if (!strip.current || !tools.current) return;
    // The room the row has, and the room its tools take: either can change by itself.
    const observer = new ResizeObserver(look);
    observer.observe(strip.current);
    observer.observe(tools.current);
    return () => observer.disconnect();
  }, [look]);

  const scroll = (way: 1 | -1) => {
    const el = strip.current;
    if (!el) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({
      left: way * towardsEnd * el.clientWidth * STRIP_STEP,
      behavior: still ? 'auto' : 'smooth',
    });
  };

  return (
    <div className="relative flex min-w-0 items-center self-stretch">
      <div
        ref={strip}
        data-row-tools
        onScroll={look}
        onFocusCapture={(event) => {
          // Browser focus can leave a partially visible button clipped. Bring the whole control
          // and its focus ring into the strip, in either reading direction.
          const room = event.currentTarget.getBoundingClientRect();
          const box = event.target.getBoundingClientRect();
          if (box.left < room.left + 4)
            event.currentTarget.scrollBy({ left: box.left - room.left - 4 });
          else if (box.right > room.right - 4)
            event.currentTarget.scrollBy({ left: box.right - room.right + 4 });
        }}
        onWheel={(event) => {
          // The wheel of a mouse turns one way only: over the strip it scrolls it sideways.
          if (event.deltaX === 0) strip.current?.scrollBy({ left: towardsEnd * event.deltaY });
        }}
        // The padding leaves room for the focus ring of the first and the last tool, which the
        // edge of a strip that scrolls would cut.
        className="-mx-1 flex h-full min-w-0 items-center overflow-x-auto overflow-y-hidden px-1 [scrollbar-width:none]"
      >
        <div ref={tools} className={cx('flex w-max items-center', gaps)}>
          {children}
        </div>
      </div>
      {(['start', 'end'] as const).map(
        (side) =>
          more[side] && (
            // For the pointer only: the keyboard reaches every tool with Tab.
            <div
              key={side}
              aria-hidden
              data-testid={`${testId}-${side}`}
              className={cx(
                'absolute inset-y-0 flex items-center bg-ui-panel',
                side === 'start' ? '-start-1 border-e pe-1' : '-end-1 border-s ps-1',
                'border-ui-line',
              )}
            >
              <IconButton
                icon={side === 'start' ? ChevronLeft : ChevronRight}
                mirror
                size="sm"
                tabIndex={-1}
                label={t('tools.moreTools')}
                onClick={() => scroll(side === 'start' ? -1 : 1)}
              />
            </div>
          ),
      )}
    </div>
  );
}

/** One floating toolbar: insertion and slide tools, or the selected object's tools. */
export function ContextTools() {
  const rows = useRef<HTMLDivElement>(null);
  useEffect(() => (rows.current ? watchToolFocus(rows.current) : undefined), []);
  return (
    <div ref={rows} className="@container mx-3 mt-3 shrink-0">
      <ContextToolsRow />
    </div>
  );
}

function ContextToolsRow() {
  const { t } = useTranslation();
  const kind = useSelectionKind();
  const groups = useContextTools(kind);

  return (
    <div
      role="toolbar"
      aria-label={t('tools.contextTools')}
      data-testid="top-tools-b"
      data-pane="context"
      data-selection={kind}
      // The groups are 12px apart: at 16 the row of a text box, the fullest one, did not hold the
      // tools of all the areas at 1920 or at 1366. In a row as narrow as the one of 1366 they are
      // 8px apart: at 12 the row of a table was wider than the editor there, in English.
      className="mx-auto flex h-toolbar w-max max-w-full min-w-0 items-center gap-3 rounded-panel border border-ui-line bg-ui-raised px-3 shadow-floating @max-4xl:gap-2"
    >
      <ToolStrip testId="row-tools" startOver={kind} gaps="gap-3 @max-4xl:gap-2">
        {groups.map((group) => (
          <Group key={group[0]?.group}>
            {group.map(({ id, render: Tool }) => (
              <Tool key={id} kind={kind} />
            ))}
          </Group>
        ))}
        {kind === 'none' && (
          <div className="border-s border-ui-line ps-3">
            <Group label={t('tools.create')}>
              {inserts.map((insert) => (
                <ActionButton key={insert.action} {...insert} />
              ))}
            </Group>
          </div>
        )}
      </ToolStrip>
    </div>
  );
}
