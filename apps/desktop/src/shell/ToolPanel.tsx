import {
  Activity,
  createContext,
  memo,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { PanelLeft } from '@slidr/ui/icons';
import { cx, EmptyState, IconButton, ScrollArea } from '@slidr/ui';
import { useWindowWidth } from './hooks';
import { panelLimits, panelWidth } from './layout';
import { usePanels, type PanelDefinition } from './registry';
import { setPanelOpen, setPanelShare, useShell } from './store';

/**
 * The Tool Panel (SPEC 4.1–4.3) with its splitter. It keeps the panel between 280 px and 45% of the
 * window (UI-01) and collapses to nothing, leaving the Activity Bar (UI-02). The content keeps
 * its width while the panel animates, so nothing reflows mid-way.
 *
 * A panel is drawn once and kept: the one that is not shown is hidden, with its state, and its
 * effects stopped until it is shown again. Once the app has had a quiet moment, the panels not
 * yet opened are drawn too, hidden, so opening any of them shows what is already there.
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
  const prepared = useQuietMoment();

  return (
    <>
      <aside
        data-testid="tool-panel"
        data-pane="panel"
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
          {panels.map((p) =>
            p === panel || prepared ? <PanelView key={p.id} panel={p} shown={p === panel} /> : null,
          )}
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

/** Where the shown panel's own buttons go in its title bar (`PanelActions`). */
const PanelActionsSlot = createContext<HTMLElement | null>(null);

/**
 * Buttons of a panel's own, drawn at the end of its title bar: the chat's conversations, for one.
 * A hidden panel has no title bar, and its buttons are not drawn.
 */
export function PanelActions({ children }: { children: ReactNode }) {
  const slot = useContext(PanelActionsSlot);
  return slot ? createPortal(children, slot) : null;
}

/** The title bar: the button that collapses the panel beside its title, and the panel's buttons. */
function PanelHeader({
  title,
  actions,
}: {
  title: string;
  actions: (slot: HTMLDivElement | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 px-2">
      <IconButton
        icon={PanelLeft}
        mirror
        size="sm"
        label={t('panels.collapse')}
        data-testid="panel-collapse"
        onClick={() => setPanelOpen(false)}
      />
      <h2 className="min-w-0 flex-1 animate-fade-in truncate text-md font-semibold">{title}</h2>
      <div ref={actions} className="flex shrink-0 items-center gap-1" />
    </div>
  );
}

/**
 * Whether the app has had a quiet moment since it opened: the first idle time of the page, or a
 * few seconds, whichever comes first.
 */
function useQuietMoment(): boolean {
  const [quiet, setQuiet] = useState(false);
  useEffect(() => {
    const done = () => startTransition(() => setQuiet(true));
    if (typeof requestIdleCallback !== 'function') {
      const timer = window.setTimeout(done, 1000);
      return () => window.clearTimeout(timer);
    }
    const id = requestIdleCallback(done, { timeout: 3000 });
    return () => cancelIdleCallback(id);
  }, []);
  return quiet;
}

/** A panel's own content: it does not draw again because the shell around it did. */
const PanelContent = memo(function PanelContent({ content: Content }: { content: ComponentType }) {
  return <Content />;
});

/**
 * A panel, shown or hidden. Hidden, its content is kept and drawn at a lower priority than what is
 * on screen, and its effects are stopped (`Activity`). Only the shown panel has a title bar.
 */
function PanelView({ panel, shown }: { panel: PanelDefinition; shown: boolean }) {
  const { t } = useTranslation();
  const [actions, setActions] = useState<HTMLElement | null>(null);
  return (
    <section
      aria-label={t(panel.title)}
      data-panel={panel.id}
      className={cx('min-h-0 flex-1 flex-col', shown ? 'flex' : 'hidden')}
    >
      {shown && <PanelHeader title={t(panel.title)} actions={setActions} />}
      <PanelActionsSlot value={actions}>
        <Activity mode={shown ? 'visible' : 'hidden'}>
          {panel.fill ? (
            // A chat scrolls its own messages and keeps its composer in place: it gets the room.
            <div className="flex min-h-0 flex-1 animate-panel-in flex-col">
              <PanelContent content={panel.content} />
            </div>
          ) : (
            <ScrollArea className="min-h-0 flex-1 animate-panel-in">
              <PanelContent content={panel.content} />
            </ScrollArea>
          )}
        </Activity>
      </PanelActionsSlot>
    </section>
  );
}

/** The empty states the shell's placeholder panels show until their areas register. */
export function PanelEmpty(props: Parameters<typeof EmptyState>[0]) {
  return <EmptyState {...props} className="min-h-80" />;
}
