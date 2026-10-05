import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { findElement, findSlide, plainText, type Element } from '@slidr/model';
import {
  Layers,
  PanelLeftClose,
  RectangleHorizontal,
  SquareDashedMousePointer,
} from '@slidr/ui/icons';
import {
  cx,
  EmptyState,
  Icon,
  IconButton,
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  type LucideIcon,
} from '@slidr/ui';
import { useDeck, useEditor, useSelection } from './editor';
import { useWindowWidth } from './hooks';
import { panelLimits, panelWidth } from './layout';
import {
  usePanels,
  type AiPanelDefinition,
  type PanelDefinition,
  type ToolPanelDefinition,
} from './registry';
import { elementKind } from './selection';
import { setAiTab, setPanelOpen, setPanelShare, useShell } from './store';

/**
 * The Tool Panel (SPEC 4.1–4.3) with its splitter. It keeps the panel between 25% and 45% of the
 * window (UI-01) and collapses to nothing, leaving the Activity Bar (UI-02). The content keeps
 * its width while the panel animates, so nothing reflows mid-way.
 */
export function ToolPanel() {
  const windowWidth = useWindowWidth();
  const share = useShell((s) => s.panelShare);
  const open = useShell((s) => s.panelOpen);
  const activeId = useShell((s) => s.activePanel);
  const panels = usePanels();
  const [dragging, setDragging] = useState(false);
  const width = panelWidth(windowWidth, share);
  const panel = panels.find((p) => p.id === activeId) ?? panels[0];

  return (
    <>
      <aside
        data-testid="tool-panel"
        data-open={open}
        aria-hidden={!open}
        inert={!open}
        style={{ '--panel-width': `${width}px` } as CSSProperties}
        className={cx(
          'relative shrink-0 overflow-hidden bg-ui-panel',
          open ? 'w-(--panel-width) border-e border-ui-line' : 'w-0',
          !dragging && 'transition-[width] duration-(--duration-slow) ease-standard',
        )}
      >
        <div className="flex h-full w-(--panel-width) flex-col">
          {panel && <PanelView key={panel.id} panel={panel} />}
        </div>
      </aside>
      {open && <Splitter width={width} windowWidth={windowWidth} onDragging={setDragging} />}
    </>
  );
}

/* ---------------------------------------------------------------- splitter */

const KEY_STEP = 16;

function Splitter({
  width,
  windowWidth,
  onDragging,
}: {
  width: number;
  windowWidth: number;
  onDragging: (dragging: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const start = useRef<{ x: number; width: number } | null>(null);
  const { min, max } = panelLimits(windowWidth);
  // The panel grows towards the editor: right in LTR, left in RTL.
  const sign = i18n.dir() === 'rtl' ? -1 : 1;
  const resize = (next: number) => setPanelShare(Math.min(Math.max(next, min), max) / windowWidth);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, width };
    onDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    resize(start.current.width + sign * (event.clientX - start.current.x));
  };
  const onPointerUp = () => {
    start.current = null;
    onDragging(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = {
      ArrowRight: sign * KEY_STEP,
      ArrowLeft: -sign * KEY_STEP,
      Home: min - width,
      End: max - width,
    };
    const delta = keys[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    resize(width + delta);
  };

  return (
    <div className="relative z-10 w-0 shrink-0">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('panels.resize')}
        aria-valuenow={width}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        data-testid="panel-splitter"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={() => setPanelShare(null)}
        className={cx(
          'group absolute inset-y-0 -start-1 w-2 cursor-col-resize focus-visible:outline-none',
          'after:absolute after:inset-y-0 after:start-0.75 after:w-0.5 after:transition-colors',
          'hover:after:bg-ui-accent focus-visible:after:bg-ui-focus active:after:bg-ui-accent',
        )}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- panel views */

function PanelHeader({ title }: { title: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 ps-4 pe-2">
      <h2 className="min-w-0 flex-1 truncate text-md font-semibold">{title}</h2>
      <IconButton
        icon={PanelLeftClose}
        mirror
        size="sm"
        label={t('panels.collapse')}
        data-testid="panel-collapse"
        onClick={() => setPanelOpen(false)}
      />
    </div>
  );
}

function PanelView({ panel }: { panel: PanelDefinition }) {
  return panel.kind === 'ai' ? <AiPanelView panel={panel} /> : <ToolPanelView panel={panel} />;
}

function ToolPanelView({ panel }: { panel: ToolPanelDefinition }) {
  const { t } = useTranslation();
  const Content = panel.content;
  return (
    <section
      aria-label={t(panel.title)}
      data-panel={panel.id}
      className="flex min-h-0 flex-1 flex-col"
    >
      <PanelHeader title={t(panel.title)} />
      <ScrollArea className="min-h-0 flex-1">
        <Content />
      </ScrollArea>
    </section>
  );
}

/** The frame shared by the three AI tools (SPEC 4.3): title, scope chip, Chat and Actions. */
function AiPanelView({ panel }: { panel: AiPanelDefinition }) {
  const { t } = useTranslation();
  const tab = useShell((s) => s.aiTab);
  const { chat: Chat, actions: Actions } = panel;
  return (
    <section
      aria-label={t(panel.title)}
      data-panel={panel.id}
      className="flex min-h-0 flex-1 flex-col"
    >
      <PanelHeader title={t(panel.title)} />
      <div className="px-4 pb-3">
        <ScopeChip scope={panel.scope} />
      </div>
      <Tabs
        value={tab}
        onValueChange={(value) => setAiTab(value === 'actions' ? 'actions' : 'chat')}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="px-4">
          <TabsTrigger value="chat">{t('panels.chat')}</TabsTrigger>
          <TabsTrigger value="actions">{t('panels.actions')}</TabsTrigger>
        </TabsList>
        {/* A chat scrolls its own messages and keeps its composer in place: it gets the room. */}
        <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
          <Chat />
        </TabsContent>
        <TabsContent value="actions" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <Actions />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </section>
  );
}

interface ScopeView {
  icon: LucideIcon;
  label: string;
  detail?: string;
  empty?: boolean;
  onClick?: () => void;
}

function elementLabel(element: Element): string | undefined {
  if (element.name) return element.name;
  if (element.type === 'text') return plainText(element.content).split('\n')[0]?.slice(0, 40);
  return undefined;
}

/** What an AI tool works on; it follows the selection, and a click brings it into view. */
function ScopeChip({ scope }: { scope: AiPanelDefinition['scope'] }) {
  const { t } = useTranslation();
  const { selection } = useEditor();
  const deck = useDeck((s) => s.deck);
  const slideId = useSelection((s) => s.currentSlideId);
  const elementIds = useSelection((s) => s.selectedElementIds);

  const slideIndex = deck.slides.findIndex((s) => s.id === slideId);
  const slide = slideId ? findSlide(deck, slideId) : undefined;
  let view: ScopeView;
  if (scope === 'deck') {
    view = { icon: Layers, label: t('panels.scopeDeck'), detail: deck.meta.title || undefined };
  } else if (scope === 'slide') {
    view = slide
      ? {
          icon: RectangleHorizontal,
          label: t('panels.scopeSlide', { n: slideIndex + 1 }),
          detail: slide.name,
          onClick: () => selection.getState().clearSelection(),
        }
      : { icon: RectangleHorizontal, label: t('status.noSlides'), empty: true };
  } else {
    const element =
      slide && elementIds.length === 1 ? findElement(slide, elementIds[0] ?? '') : undefined;
    view = element
      ? {
          icon: SquareDashedMousePointer,
          // An icon shares the tools of a shape in row B, which is its kind there. The tool
          // that works on it names it as what it is, as its actions do.
          label:
            element.type === 'svg' ? t('selection.icon') : t(`selection.${elementKind(element)}`),
          detail: elementLabel(element),
          onClick: () => selection.getState().selectElements([element.id]),
        }
      : { icon: SquareDashedMousePointer, label: t('panels.scopeNone'), empty: true };
  }

  return (
    <button
      type="button"
      data-testid="scope-chip"
      disabled={!view.onClick}
      onClick={view.onClick}
      className={cx(
        'inline-flex h-7 max-w-full cursor-default items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
        view.empty
          ? 'border-dashed border-ui-line-strong text-ui-fg-muted'
          : 'border-transparent bg-ui-accent-soft text-ui-accent-fg hover:bg-ui-accent-soft-hover',
      )}
    >
      <Icon icon={view.icon} className="-ms-0.5" />
      <span className="shrink-0">{view.label}</span>
      {view.detail && <span className="truncate font-normal">· {view.detail}</span>}
    </button>
  );
}

/** The empty states the shell's placeholder panels show until their areas register. */
export function PanelEmpty(props: Parameters<typeof EmptyState>[0]) {
  return <EmptyState {...props} className="min-h-80" />;
}
