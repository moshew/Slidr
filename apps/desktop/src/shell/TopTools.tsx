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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  FilePlus,
  FolderOpen,
  History,
  House,
  Image,
  Keyboard,
  Play,
  RectangleHorizontal,
  Redo2,
  Save,
  Search,
  Shapes,
  Share,
  SkipBack,
  Slash,
  Sparkles,
  Sticker,
  Table,
  Type,
  Undo2,
  type LucideIcon,
} from '@slidr/ui/icons';
import {
  Button,
  cx,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Icon,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@slidr/ui';
import type { RecentFile } from '../document/storage';
import { useDeck, useEditor, useFile, useSelection } from './editor';
import {
  newDocument,
  openDocument,
  recentFiles,
  saveDocument,
  saveDocumentAs,
} from './fileActions';
import {
  PanelId,
  useAction,
  useActionPopover,
  useContextTools,
  usePanel,
  useShortcut,
  type ActionPopoverProps,
  type ToolAction,
} from './registry';
import { aiKinds, selectionKind, type SelectionKind } from './selection';
import { openAiChat, openPanel, setWelcome, setZoom, showShortcuts, useShell } from './store';
import { watchToolFocus } from './toolFocus';

/** Top Tools (SPEC 4.4): row A is fixed, row B follows the selection. */
export function TopTools() {
  const rows = useRef<HTMLDivElement>(null);
  // A tool that is used with the pointer does not keep the keyboard (`toolFocus.ts`).
  useEffect(() => (rows.current ? watchToolFocus(rows.current) : undefined), []);
  return (
    // A container, so that row B can tell how wide it is itself, whatever the window is.
    <div ref={rows} className="@container shrink-0 bg-ui-panel">
      <RowA />
      <RowB />
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

const inserts: { action: ToolAction; icon: LucideIcon; label: string }[] = [
  { action: 'insert.text', icon: Type, label: 'tools.insertText' },
  { action: 'insert.image', icon: Image, label: 'tools.insertImage' },
  { action: 'insert.shape', icon: Shapes, label: 'tools.insertShape' },
  { action: 'insert.line', icon: Slash, label: 'tools.insertLine' },
  { action: 'insert.table', icon: Table, label: 'tools.insertTable' },
  { action: 'insert.chart', icon: ChartColumn, label: 'tools.insertChart' },
  { action: 'insert.media', icon: Clapperboard, label: 'tools.insertMedia' },
  { action: 'insert.icon', icon: Sticker, label: 'tools.insertIcon' },
];

function RowA() {
  const { t } = useTranslation();
  return (
    <div
      role="toolbar"
      aria-label={t('panels.tools')}
      data-testid="top-tools-a"
      className="flex h-toolbar-a items-center gap-4 border-b border-ui-line px-3"
    >
      <FileMenu />
      <UndoRedo />
      {/* What is added to a slide is the part of this row that gives way when the row is narrow:
          the document's menu, undo, the zoom and the three buttons at the end stay in place. */}
      <ToolStrip testId="row-inserts">
        <Group>
          {inserts.map((insert) => (
            <ActionButton key={insert.action} {...insert} />
          ))}
        </Group>
      </ToolStrip>
      <div className="flex-1" />
      <ZoomMenu />
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="soft" icon={Sparkles} data-testid="ask-ai" onClick={openAiChat}>
          {t('tools.aiChat')}
        </Button>
        <ExportButton />
        <PresentButton />
      </div>
    </div>
  );
}

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
  if (popover) return <PopoverButton icon={icon} label={t(label)} content={popover} />;
  return <IconButton icon={icon} label={t(label)} disabled={!run} onClick={run} />;
}

/** A row A button whose area registered a popover, such as the shape library. */
function PopoverButton({
  icon,
  label,
  content: Content,
}: {
  icon: LucideIcon;
  label: string;
  content: ComponentType<ActionPopoverProps>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton icon={icon} label={label} />
      </PopoverTrigger>
      <PopoverContent>
        <Content close={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

function ExportButton() {
  return <ActionButton action="export" icon={Share} label="tools.export" />;
}

/**
 * "Present" as a split button: the button itself does what its area registered (from the
 * current slide), and the arrow beside it opens the two ways to start, which are the
 * registered shortcuts F5 and Shift+F5: the menu does what the keys do.
 */
function PresentButton() {
  const { t } = useTranslation();
  const editor = useEditor();
  const run = useAction('present');
  const fromStart = useShortcut('present.fromStart');
  const fromCurrent = useShortcut('present.fromCurrent');
  const ways = [
    { shortcut: fromStart, label: 'keys.presentStart', icon: SkipBack },
    { shortcut: fromCurrent, label: 'keys.presentCurrent', icon: Play },
  ];
  return (
    <div className="flex items-center" data-testid="present-button">
      <Button
        variant="primary"
        icon={Play}
        disabled={!run}
        onClick={run}
        className="rounded-e-none"
      >
        {t('tools.present')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            aria-label={t('tools.presentOptions')}
            disabled={!fromStart && !fromCurrent}
            className="rounded-s-none border-s border-ui-on-accent/25 px-1.5"
          >
            <Icon icon={ChevronDown} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="present-menu">
          {ways.map(
            ({ shortcut, label, icon }) =>
              shortcut && (
                <DropdownMenuItem
                  key={shortcut.id}
                  icon={icon}
                  shortcut={shortcut.keys}
                  onSelect={() => shortcut.run(editor, new KeyboardEvent('keydown'))}
                >
                  {t(label)}
                </DropdownMenuItem>
              ),
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function UndoRedo() {
  const { t } = useTranslation();
  const { bus } = useEditor();
  const canUndo = useDeck((s) => s.canUndo);
  const canRedo = useDeck((s) => s.canRedo);
  return (
    <Group>
      <IconButton
        icon={Undo2}
        mirror
        label={t('tools.undo')}
        shortcut="Ctrl+Z"
        disabled={!canUndo}
        onClick={() => bus.undo()}
      />
      <IconButton
        icon={Redo2}
        mirror
        label={t('tools.redo')}
        shortcut="Ctrl+Y"
        disabled={!canRedo}
        onClick={() => bus.redo()}
      />
    </Group>
  );
}

function FileMenu() {
  const { t } = useTranslation();
  const editor = useEditor();
  const busy = useFile((s) => s.busy);
  const [recent, setRecent] = useState<RecentFile[] | null>(null);
  const hasStorage = editor.document !== null;
  // Find and replace is another area's: the menu offers what its shortcut does, when it is there.
  const find = useShortcut('find.replace');
  const toFind = useRef(false);
  // So is HTML import: its panel asks for the file, and about the open document if it has work.
  const htmlImport = usePanel(PanelId.htmlImport);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && hasStorage) void recentFiles(editor).then(setRecent);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" iconEnd={ChevronDown} loading={busy !== null}>
          {t('file.menu')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        onCloseAutoFocus={(event) => {
          if (toFind.current) event.preventDefault();
          toFind.current = false;
        }}
      >
        <DropdownMenuItem
          icon={FilePlus}
          shortcut="Ctrl+N"
          onSelect={() => void newDocument(editor)}
        >
          {t('file.new')}
        </DropdownMenuItem>
        <DropdownMenuItem
          icon={FolderOpen}
          shortcut="Ctrl+O"
          disabled={!hasStorage}
          onSelect={() => void openDocument(editor)}
        >
          {t('file.open')}
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={History} disabled={!hasStorage}>
            {t('file.recent')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-w-96">
            {recent?.length ? (
              recent.slice(0, 10).map((file) => (
                <DropdownMenuItem
                  key={file.path}
                  disabled={!file.exists}
                  hint={file.exists ? undefined : t('file.missing')}
                  onSelect={() => void openDocument(editor, file.path)}
                >
                  {file.title || file.path.split(/[\\/]/).at(-1)}
                </DropdownMenuItem>
              ))
            ) : (
              <DropdownMenuItem disabled>{t('file.noRecent')}</DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {htmlImport && (
          <DropdownMenuItem icon={htmlImport.icon} onSelect={() => openPanel(htmlImport.id)}>
            {t('file.importHtml')}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          icon={Save}
          shortcut="Ctrl+S"
          disabled={!hasStorage}
          onSelect={() => void saveDocument(editor)}
        >
          {t('file.save')}
        </DropdownMenuItem>
        <DropdownMenuItem
          shortcut="Ctrl+Shift+S"
          disabled={!hasStorage}
          onSelect={() => void saveDocumentAs(editor)}
          className="ps-8"
        >
          {t('file.saveAs')}
        </DropdownMenuItem>
        {find && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={Search}
              shortcut={find.keys}
              onSelect={() => {
                // The find bar takes the keyboard; the menu must not hand it back to its button.
                toFind.current = true;
                find.run(editor, new KeyboardEvent('keydown'));
              }}
            >
              {t('file.find')}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={Keyboard} shortcut="Ctrl+/" onSelect={() => showShortcuts()}>
          {t('keys.shortcuts')}
        </DropdownMenuItem>
        <DropdownMenuItem icon={House} onSelect={() => setWelcome(true, true)}>
          {t('welcome.show')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const zoomSteps = [0.5, 1, 2];

function ZoomMenu() {
  const { t } = useTranslation();
  const zoom = useShell((s) => s.zoom);
  const viewScale = useShell((s) => s.viewScale);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          iconEnd={ChevronDown}
          aria-label={t('tools.zoom')}
          className="tabular-nums"
        >
          {Math.round(viewScale * 100)}%
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={String(zoom)}
          onValueChange={(value) => setZoom(value === 'fit' ? 'fit' : Number(value))}
        >
          <DropdownMenuRadioItem value="fit" shortcut="Ctrl+0">
            {t('tools.zoomFit')}
          </DropdownMenuRadioItem>
          {zoomSteps.map((step) => (
            <DropdownMenuRadioItem key={step} value={String(step)}>
              {step * 100}%
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
      data-selection={kind}
      // The groups are 12px apart: at 16 the row of a text box, the fullest one, did not hold the
      // tools of all the areas at 1920 or at 1366. In a row as narrow as the one of 1366 they are
      // 8px apart: at 12 the row of a table was wider than the editor there, in English.
      className="flex h-toolbar-b items-center gap-3 border-b border-ui-line px-3 @max-4xl:gap-2"
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
