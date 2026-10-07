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
  RectangleHorizontal,
  Shapes,
  Slash,
  Sparkles,
  Sticker,
  Table,
  Type,
  type LucideIcon,
} from '@slidr/ui/icons';
import { Button, cx, Icon, IconButton, Popover, PopoverContent, PopoverTrigger } from '@slidr/ui';
import { useDeck, useSelection } from './editor';
import {
  useAction,
  useActionPopover,
  useContextTools,
  type ActionPopoverProps,
  type ToolAction,
} from './registry';
import { aiKinds, selectionKind, type SelectionKind } from './selection';
import { openAiChat } from './store';
import { watchToolFocus } from './toolFocus';

/** The creation toolbar. Selection tools float separately inside the workspace. */
export function TopTools() {
  const rows = useRef<HTMLDivElement>(null);
  // A tool that is used with the pointer does not keep the keyboard (`toolFocus.ts`).
  useEffect(() => (rows.current ? watchToolFocus(rows.current) : undefined), []);
  return (
    // Creation tools scroll independently of the document actions in the title bar.
    <div ref={rows} className="@container shrink-0 bg-ui-panel">
      <RowA />
    </div>
  );
}

function Group({ children, label }: { children: ReactNode; label?: string }) {
  return (
    // A tool may draw nothing for the element at hand; its group then takes no room in the row.
    <div role="group" aria-label={label} className="flex items-center gap-0.5 empty:hidden">
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- row A */

const inserts: {
  action: ToolAction;
  icon: LucideIcon;
  label: string;
  caption: string;
  tone: string;
}[] = [
  {
    action: 'insert.text',
    icon: Type,
    label: 'tools.insertText',
    caption: 'tools.text',
    tone: 'violet',
  },
  {
    action: 'insert.image',
    icon: Image,
    label: 'tools.insertImage',
    caption: 'tools.insertImage',
    tone: 'blue',
  },
  {
    action: 'insert.shape',
    icon: Shapes,
    label: 'tools.insertShape',
    caption: 'tools.insertShape',
    tone: 'pink',
  },
  {
    action: 'insert.line',
    icon: Slash,
    label: 'tools.insertLine',
    caption: 'tools.insertLine',
    tone: 'teal',
  },
  {
    action: 'insert.table',
    icon: Table,
    label: 'tools.insertTable',
    caption: 'tools.insertTable',
    tone: 'green',
  },
  {
    action: 'insert.chart',
    icon: ChartColumn,
    label: 'tools.insertChart',
    caption: 'tools.insertChart',
    tone: 'orange',
  },
  {
    action: 'insert.media',
    icon: Clapperboard,
    label: 'tools.insertMedia',
    caption: 'tools.media',
    tone: 'rose',
  },
  {
    action: 'insert.icon',
    icon: Sticker,
    label: 'tools.insertIcon',
    caption: 'tools.insertIcon',
    tone: 'violet',
  },
];

function RowA() {
  const { t } = useTranslation();
  return (
    <div
      role="toolbar"
      aria-label={t('panels.tools')}
      data-testid="top-tools-a"
      data-pane="tools"
      className="flex h-toolbar-a min-w-0 items-center gap-3 border-b border-ui-line px-3"
    >
      <span className="shrink-0 px-1 text-sm font-semibold text-ui-fg-muted">
        {t('tools.create')}
      </span>
      <ToolStrip testId="row-inserts">
        <div className="flex items-center gap-1">
          {inserts.map((insert) => (
            <ActionButton key={insert.action} {...insert} />
          ))}
        </div>
      </ToolStrip>
      <div className="flex-1" />
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="soft" icon={Sparkles} data-testid="ask-ai" onClick={openAiChat}>
          {t('tools.aiChat')}
        </Button>
      </div>
    </div>
  );
}

function ActionButton({
  action,
  icon,
  label,
  caption,
  tone,
}: {
  action: ToolAction;
  icon: LucideIcon;
  label: string;
  caption: string;
  tone: string;
}) {
  const { t } = useTranslation();
  const run = useAction(action);
  const popover = useActionPopover(action);
  const trigger = (
    <Button
      variant="ghost"
      aria-label={t(label)}
      data-tool={action}
      className="creation-tool"
      disabled={!popover && !run}
      onClick={popover ? undefined : run}
    >
      <span className="creation-tool-icon" data-tone={tone}>
        <Icon icon={icon} size="lg" />
      </span>
      <span className="text-xs font-medium">{t(caption)}</span>
    </Button>
  );
  if (popover) return <PopoverButton trigger={trigger} content={popover} />;
  return trigger;
}

/** A row A button whose area registered a popover, such as the shape library. */
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

/* ---------------------------------------------------------------- row B */

const kindIcons: Record<SelectionKind, LucideIcon> = {
  none: RectangleHorizontal,
  text: Type,
  image: Image,
  shape: Shapes,
  table: Table,
  chart: ChartColumn,
  media: Clapperboard,
  html: Sticker,
  group: Shapes,
  multiple: Shapes,
};

function useSelectionKind(): { kind: SelectionKind; count: number } {
  const deck = useDeck((s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const elementIds = useSelection((s) => s.selectedElementIds);
  const editingId = useSelection((s) => s.editingElementId);
  return { kind: selectionKind(deck, slideId, elementIds, editingId), count: elementIds.length };
}

/** How much of the strip one press on its edge brings into view. */
const STRIP_STEP = 0.7;

/**
 * Tools of a row, in a strip that takes the room the row has for them: the tools of row B, and
 * the insert buttons of row A. They fit at the resolutions the layout is made for; when the Tool
 * Panel is dragged wider on a small window the row is narrower than its tools, and then the
 * strip scrolls sideways: by the wheel, by the arrow that shows on the side where tools are out
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

export function ContextTools() {
  const rows = useRef<HTMLDivElement>(null);
  useEffect(() => (rows.current ? watchToolFocus(rows.current) : undefined), []);
  return (
    <div ref={rows} className="@container mx-3 mt-3 shrink-0">
      <RowB />
    </div>
  );
}

function RowB() {
  const { t } = useTranslation();
  const { kind, count } = useSelectionKind();
  const groups = useContextTools(kind);
  const label =
    kind === 'multiple' ? t('selection.multiple', { n: count }) : t(`selection.${kind}`);

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
      className="mx-auto flex h-toolbar-b w-max max-w-full min-w-0 items-center gap-3 rounded-panel border border-ui-line bg-ui-raised px-3 shadow-floating @max-4xl:gap-2"
    >
      <span
        data-testid="selection-label"
        className="flex shrink-0 items-center gap-1.5 ps-1 text-sm font-medium text-ui-fg"
      >
        <Icon icon={kindIcons[kind]} className="text-ui-fg-muted" />
        {label}
      </span>
      <ToolStrip testId="row-tools" startOver={kind} gaps="gap-3 @max-4xl:gap-2">
        {groups.map((group) => (
          <Group key={group[0]?.group}>
            {group.map(({ id, render: Tool }) => (
              <Tool key={id} kind={kind} />
            ))}
          </Group>
        ))}
      </ToolStrip>
      {(kind === 'none' || aiKinds.has(kind)) && (
        <Button
          variant="soft"
          size="sm"
          icon={Sparkles}
          aria-label={t(kind === 'none' ? 'tools.aiSlide' : 'tools.aiSelection')}
          onClick={openAiChat}
        >
          {t('tools.ai')}
        </Button>
      )}
    </div>
  );
}
