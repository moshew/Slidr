import {
  slideFromLayout,
  type CommandBus,
  type Deck,
  type Layout,
  type SelectionStore,
  type Slide,
} from '@slidr/model';
import { ScaledSlide, type AssetResolver } from '@slidr/renderer';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  Icon,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
  Tooltip,
} from '@slidr/ui';
import {
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
} from '@slidr/ui/icons';
import { useStore } from 'zustand';
import {
  addSlide,
  allHidden,
  duplicateSlides,
  removeSlides,
  setSlidesHidden,
} from '../arrange/slides';

/**
 * The Filmstrip (WG2-T07, WG5-T08, FLM-01..03): thumbnails of every slide, in the reading
 * direction of the UI. Only the thumbnails in view are rendered, so 200 slides scroll as smoothly
 * as 10 (NFR-05). Click picks a slide, Ctrl adds to the selection, Shift selects a range; dragging
 * reorders; a right click opens the slide menu, which acts on the whole selection.
 *
 * It is a standalone component: it knows the bus and the selection, and gets its labels and the
 * clipboard from the host.
 */
export interface FilmstripProps {
  bus: CommandBus;
  deck: Deck;
  selection: SelectionStore;
  resolveAsset?: AssetResolver;
  /**
   * Copy, cut and paste of slides. The clipboard belongs to the host (it needs the window's
   * clipboard events); without it the menu leaves these three out.
   */
  clipboard?: FilmstripClipboard;
  /** Labels in the UI language. Default: English. */
  labels?: FilmstripLabels;
  /**
   * Opens the host's AI tool on the slide the menu was opened on, which is the current slide by
   * then. Without it the menu has no such item.
   */
  onAi?: () => void;
  className?: string;
}

export interface FilmstripClipboard {
  copy: (slideIds: string[]) => void;
  cut: (slideIds: string[]) => void;
  /** Pastes after the current slide. */
  paste: () => void;
  /** Whether there is something to paste; asked when the menu opens. */
  canPaste: () => boolean;
}

export interface FilmstripLabels {
  addSlide: string;
  slide: (n: number) => string;
  /** The mark on a slide that is left out of the presentation. */
  hidden: string;
  /** The first choice among the layouts of a new slide. */
  blank: string;
  duplicate: string;
  delete: string;
  hide: string;
  show: string;
  copy: string;
  cut: string;
  paste: string;
  /** The menu's way to the AI tool of the slide; shown when the host gives `onAi`. */
  ai?: string;
}

export const THUMB_W = 176;
export const THUMB_H = 99;
const GAP = 16;
const PAD = 16;
const STEP = THUMB_W + GAP;
/** Thumbnails rendered beyond each edge of the view. */
const OVERSCAN = 3;
/** What one line of a wheel that counts in lines scrolls the strip, in pixels. */
const WHEEL_LINE = 40;
const DRAG_PX = 4;
/** A layout in the "new slide" popover. */
const LAYOUT_W = 120;

const DEFAULT_LABELS: FilmstripLabels = {
  addSlide: 'New slide',
  slide: (n: number) => `Slide ${n}`,
  hidden: 'Hidden',
  blank: 'Blank slide',
  duplicate: 'Duplicate',
  delete: 'Delete',
  hide: 'Hide',
  show: 'Show',
  copy: 'Copy',
  cut: 'Cut',
  paste: 'Paste',
};

interface Drag {
  pointerId: number;
  startX: number;
  ids: string[];
  active: boolean;
  /** Slot the slides would land in, 0..n, counted in the full list. */
  slot: number;
}

const Thumb = memo(function Thumb({
  deck,
  slideIndex,
  selected,
  current,
  resolveAsset,
  label,
  hiddenLabel,
}: {
  deck: Deck;
  slideIndex: number;
  selected: boolean;
  current: boolean;
  resolveAsset?: AssetResolver;
  label: string;
  hiddenLabel: string;
}) {
  const slide = deck.slides[slideIndex];
  if (!slide) return null;
  return (
    <div
      role="option"
      aria-selected={selected}
      aria-label={slide.hidden ? `${label}, ${hiddenLabel}` : label}
      data-slide-id={slide.id}
      data-hidden={slide.hidden || undefined}
      style={{
        position: 'absolute',
        insetInlineStart: PAD + slideIndex * STEP,
        top: 10,
        width: THUMB_W,
      }}
    >
      <div
        style={{
          width: THUMB_W,
          height: THUMB_H,
          borderRadius: 'var(--radius-small)',
          overflow: 'hidden',
          opacity: slide.hidden ? 0.45 : 1,
          boxShadow: current
            ? '0 0 0 2px var(--color-ui-accent)'
            : selected
              ? '0 0 0 2px var(--color-ui-accent-soft-hover)'
              : '0 0 0 1px var(--color-ui-line)',
          transition: 'box-shadow var(--duration-fast) var(--ease-standard)',
        }}
      >
        <ScaledSlide
          deck={deck}
          slide={slide}
          width={THUMB_W}
          mode="thumbnail"
          resolveAsset={resolveAsset}
        />
      </div>
      {slide.hidden ? (
        // The mark sits outside the dimmed picture, so it stays at full strength.
        <div
          data-testid="slide-hidden-mark"
          style={{
            position: 'absolute',
            top: 6,
            insetInlineEnd: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 22,
            height: 22,
            borderRadius: 'var(--radius-small)',
            background: 'var(--color-ui-raised)',
            color: 'var(--color-ui-fg)',
            boxShadow: 'var(--shadow-raised), 0 0 0 1px var(--color-ui-line)',
          }}
        >
          <Icon icon={EyeOff} />
        </div>
      ) : null}
      <div
        style={{
          marginTop: 4,
          font: '500 11px/14px var(--font-ui)',
          color: current ? 'var(--color-ui-fg)' : 'var(--color-ui-fg-muted)',
          textAlign: 'center',
        }}
      >
        {slideIndex + 1}
      </div>
    </div>
  );
});

/** A layout as a small picture: its background and decorations, and where its placeholders sit. */
function LayoutPreview({
  deck,
  layout,
  resolveAsset,
}: {
  deck: Deck;
  layout: Layout;
  resolveAsset?: AssetResolver;
}) {
  // The slide of the layout without its (empty) elements: the renderer draws the rest.
  const slide = useMemo(
    () => ({ ...slideFromLayout(deck, layout.id).slide, elements: [] }),
    [deck, layout.id],
  );
  const scale = LAYOUT_W / deck.size.w;
  return (
    <div style={{ position: 'relative', width: LAYOUT_W, height: deck.size.h * scale }}>
      <ScaledSlide
        deck={deck}
        slide={slide}
        width={LAYOUT_W}
        mode="thumbnail"
        resolveAsset={resolveAsset}
      />
      {layout.placeholders.map((p) => (
        <div
          key={p.id}
          aria-hidden
          style={{
            position: 'absolute',
            left: p.frame.x * scale,
            top: p.frame.y * scale,
            width: p.frame.w * scale,
            height: p.frame.h * scale,
            boxSizing: 'border-box',
            border: '1px dashed var(--color-ui-fg-subtle)',
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

/** A slide with nothing on it, for the picture of the "blank" choice: the theme's background. */
const BLANK: Slide = { id: 's_blank', elements: [], timeline: [] };

/** The choices of a new slide (FLM-03): blank, or one of the deck's layouts. */
function LayoutChoices({
  deck,
  resolveAsset,
  blankLabel,
  onChoose,
}: {
  deck: Deck;
  resolveAsset?: AssetResolver;
  blankLabel: string;
  onChoose: (layoutId?: string) => void;
}) {
  const card =
    'flex cursor-default flex-col items-center gap-1.5 rounded-control p-1.5 text-xs text-ui-fg-muted transition-colors hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed';
  const frame = {
    borderRadius: 'var(--radius-small)',
    overflow: 'hidden',
    boxShadow: '0 0 0 1px var(--color-ui-line)',
  };
  return (
    <ScrollArea className="-m-2" viewportClassName="max-h-96">
      <div className="grid grid-cols-2 gap-1 p-2">
        <button type="button" data-layout="" className={card} onClick={() => onChoose()}>
          <div style={frame}>
            <ScaledSlide
              deck={deck}
              slide={BLANK}
              width={LAYOUT_W}
              mode="thumbnail"
              resolveAsset={resolveAsset}
            />
          </div>
          <span className="max-w-full truncate">{blankLabel}</span>
        </button>
        {deck.layouts.map((layout) => (
          <button
            key={layout.id}
            type="button"
            data-layout={layout.id}
            className={card}
            onClick={() => onChoose(layout.id)}
          >
            <div style={frame}>
              <LayoutPreview deck={deck} layout={layout} resolveAsset={resolveAsset} />
            </div>
            <span className="max-w-full truncate">{layout.name}</span>
          </button>
        ))}
      </div>
    </ScrollArea>
  );
}

const NO_KEYS = { ctrlKey: false, metaKey: false, shiftKey: false };

export function Filmstrip({
  bus,
  deck,
  selection,
  resolveAsset,
  clipboard,
  labels = DEFAULT_LABELS,
  onAi,
  className,
}: FilmstripProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ pos: 0, width: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  /** What the open menu is about: a slide (and the selection around it) or the empty strip. */
  const [menu, setMenu] = useState({ onSlide: false, canPaste: false });
  const [choosing, setChoosing] = useState(false);
  const currentId = useStore(selection, (s) => s.currentSlideId);
  const selectedIds = useStore(selection, (s) => s.selectedSlideIds);
  const slides = deck.slides;
  const hasLayouts = deck.layouts.length > 0;
  const total = PAD * 2 + slides.length * STEP + THUMB_W;

  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    // In RTL, Chromium reports scrollLeft as zero or negative; the distance from the start is what counts.
    setView({ pos: Math.abs(el.scrollLeft), width: el.clientWidth });
  };
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  // A mouse wheel turns up and down, and the strip runs along: turned over the strip it scrolls
  // the strip, toward the slides after when turned down, in either direction of the UI (ADR-066).
  // Shift and a touchpad already scroll it sideways; Ctrl is the browser's zoom.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const unit =
        e.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_LINE
          : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? el.clientWidth
            : 1;
      const by = e.deltaY * unit;
      // In RTL the strip's start is on the right, and `scrollLeft` runs from 0 down.
      const rtl = getComputedStyle(el).direction === 'rtl';
      const before = el.scrollLeft;
      el.scrollLeft += rtl ? -by : by;
      // At an end the wheel is the page's, as it is for any scroller that cannot go further.
      if (el.scrollLeft !== before) e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keep the current slide in view when it changes (from the Stage, the agent, or the keyboard).
  useEffect(() => {
    const el = scroller.current;
    const index = slides.findIndex((s) => s.id === currentId);
    if (!el || index < 0) return;
    const start = PAD + index * STEP;
    const pos = Math.abs(el.scrollLeft);
    const rtl = getComputedStyle(el).direction === 'rtl';
    const to = (p: number) => el.scrollTo({ left: rtl ? -p : p, behavior: 'smooth' });
    if (start < pos) to(start - PAD);
    else if (start + THUMB_W > pos + el.clientWidth) to(start + THUMB_W + PAD - el.clientWidth);
  }, [currentId, slides]);

  const first = Math.max(0, Math.floor((view.pos - PAD) / STEP) - OVERSCAN);
  const last = Math.min(slides.length - 1, Math.ceil((view.pos + view.width) / STEP) + OVERSCAN);

  /** The thumbnail slot under a pointer, 0..n, in the strip's own direction. */
  const slotAt = (clientX: number): number => {
    const el = scroller.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const inline = (rtl ? rect.right - clientX : clientX - rect.left) + Math.abs(el.scrollLeft);
    return Math.max(0, Math.min(slides.length, Math.round((inline - PAD + GAP / 2) / STEP)));
  };

  const indexAt = (clientX: number): number => {
    const el = scroller.current;
    if (!el) return -1;
    const rect = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const inline =
      (rtl ? rect.right - clientX : clientX - rect.left) + Math.abs(el.scrollLeft) - PAD;
    const i = Math.floor(inline / STEP);
    return inline - i * STEP <= THUMB_W && i >= 0 && i < slides.length ? i : -1;
  };

  const select = (index: number, e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }) => {
    const slide = slides[index];
    if (!slide) return;
    const state = selection.getState();
    if (e.ctrlKey || e.metaKey) {
      const has = state.selectedSlideIds.includes(slide.id);
      const ids = has
        ? state.selectedSlideIds.filter((id) => id !== slide.id)
        : [...state.selectedSlideIds, slide.id];
      if (!ids.length) return;
      // Adding a slide makes it current; removing the current one moves "current" to another.
      const keep =
        state.currentSlideId && state.currentSlideId !== slide.id
          ? state.currentSlideId
          : ids.at(-1);
      state.selectSlides(ids, has ? keep : slide.id);
      return;
    }
    if (e.shiftKey && state.currentSlideId) {
      const from = slides.findIndex((s) => s.id === state.currentSlideId);
      const [a, b] = from < index ? [from, index] : [index, from];
      state.selectSlides(
        slides.slice(a, b + 1).map((s) => s.id),
        state.currentSlideId,
      );
      return;
    }
    state.setCurrentSlide(slide.id);
    if (state.selectedSlideIds.length > 1) state.selectSlides([slide.id], slide.id);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const index = indexAt(e.clientX);
    if (index < 0) return;
    scroller.current?.focus({ preventScroll: true });
    const slide = slides[index] as Deck['slides'][number];
    const alreadySelected = selection.getState().selectedSlideIds.includes(slide.id);
    if (!alreadySelected || e.ctrlKey || e.metaKey || e.shiftKey) select(index, e);
    const ids = slides
      .filter((s) => selection.getState().selectedSlideIds.includes(s.id))
      .map((s) => s.id);
    scroller.current?.setPointerCapture(e.pointerId);
    setDrag({ pointerId: e.pointerId, startX: e.clientX, ids, active: false, slot: index });
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const active = drag.active || Math.abs(e.clientX - drag.startX) > DRAG_PX;
    if (active) setDrag({ ...drag, active, slot: slotAt(e.clientX) });
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    scroller.current?.releasePointerCapture(e.pointerId);
    if (drag.active) {
      // `slide.move` counts the position in the list without the slides that move (ADR-007).
      const moving = new Set(drag.ids);
      const toIndex = slides.slice(0, drag.slot).filter((s) => !moving.has(s.id)).length;
      bus.dispatch(
        { type: 'slide.move', slideIds: drag.ids, toIndex },
        { label: 'Reorder slides' },
      );
    } else {
      // A plain click on a slide that was part of a multi-selection narrows it to that slide.
      const index = indexAt(e.clientX);
      const slide = slides[index];
      if (slide && !(e.ctrlKey || e.metaKey || e.shiftKey)) {
        selection.getState().setCurrentSlide(slide.id);
        selection.getState().selectSlides([slide.id], slide.id);
      }
    }
    setDrag(null);
  };

  /** A right click acts on the selection the slide is part of, or on that slide alone. */
  const onContextMenu = (e: MouseEvent) => {
    const index = indexAt(e.clientX);
    const slide = slides[index];
    if (slide && !selection.getState().selectedSlideIds.includes(slide.id)) select(index, NO_KEYS);
    setMenu({ onSlide: Boolean(slide), canPaste: clipboard?.canPaste() ?? false });
  };

  const add = (layoutId?: string) => addSlide(bus, selection, { layoutId, label: labels.addSlide });
  /** The slides the menu acts on, as they are when an item is chosen. */
  const chosen = () => selection.getState().selectedSlideIds;
  const hiddenAll = allHidden(deck, selectedIds);

  const onKeyDown = (e: KeyboardEvent) => {
    const index = slides.findIndex((s) => s.id === currentId);
    const rtl = scroller.current ? getComputedStyle(scroller.current).direction === 'rtl' : false;
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[
      e.key
    ];
    if (step !== undefined) {
      e.preventDefault();
      const next = slides[Math.max(0, Math.min(slides.length - 1, index + step))];
      if (next) {
        if (e.shiftKey) select(slides.indexOf(next), e);
        else selection.getState().setCurrentSlide(next.id);
      }
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const target = e.key === 'Home' ? slides[0] : slides.at(-1);
      if (target) selection.getState().setCurrentSlide(target.id);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
      e.preventDefault();
      removeSlides(bus, selectedIds, labels.delete);
    }
  };

  const indicator = drag?.active ? PAD + drag.slot * STEP - GAP / 2 - 1 : undefined;

  const addButton = (
    <button
      type="button"
      aria-label={labels.addSlide}
      data-testid="new-slide"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={hasLayouts ? undefined : () => add()}
      className="inline-flex h-thumb-h w-thumb-h cursor-default items-center justify-center rounded-small border border-dashed border-ui-line-strong text-ui-fg-muted transition-colors hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed"
    >
      <Icon icon={Plus} size="md" />
    </button>
  );

  /*
   * The menu and the layout popover are siblings of the strip in the React tree, not children of
   * it: React events bubble through portals, and a click in a popover must not reach the strip's
   * pointer and key handlers.
   */
  return (
    <Popover open={choosing} onOpenChange={setChoosing}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={scroller}
            role="listbox"
            aria-multiselectable
            aria-orientation="horizontal"
            tabIndex={0}
            data-filmstrip=""
            className={className}
            onScroll={measure}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onKeyDown={onKeyDown}
            onContextMenu={onContextMenu}
            style={{
              position: 'relative',
              overflowX: 'auto',
              overflowY: 'hidden',
              outline: 'none',
              userSelect: 'none',
            }}
          >
            <div style={{ position: 'relative', width: total, height: '100%' }}>
              {slides.slice(first, last + 1).map((slide, i) => (
                <Thumb
                  key={slide.id}
                  deck={deck}
                  slideIndex={first + i}
                  selected={selectedIds.includes(slide.id)}
                  current={slide.id === currentId}
                  resolveAsset={resolveAsset}
                  label={labels.slide(first + i + 1)}
                  hiddenLabel={labels.hidden}
                />
              ))}
              <div
                style={{
                  position: 'absolute',
                  insetInlineStart: PAD + slides.length * STEP,
                  top: 10,
                }}
              >
                {/* With layouts in the deck the button offers them (FLM-03). */}
                <Tooltip content={labels.addSlide} shortcut="Ctrl+M">
                  {hasLayouts ? <PopoverTrigger asChild>{addButton}</PopoverTrigger> : addButton}
                </Tooltip>
              </div>
              {indicator !== undefined ? (
                <div
                  aria-hidden
                  style={{
                    position: 'absolute',
                    insetInlineStart: indicator,
                    top: 6,
                    width: 2,
                    height: THUMB_H + 8,
                    borderRadius: 1,
                    background: 'var(--color-ui-accent)',
                  }}
                />
              ) : null}
            </div>
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent data-testid="slide-menu">
          {hasLayouts ? (
            <ContextMenuSub>
              <ContextMenuSubTrigger icon={Plus}>{labels.addSlide}</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem onSelect={() => add()}>{labels.blank}</ContextMenuItem>
                <ContextMenuSeparator />
                {deck.layouts.map((layout) => (
                  <ContextMenuItem key={layout.id} onSelect={() => add(layout.id)}>
                    {layout.name}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          ) : (
            <ContextMenuItem icon={Plus} shortcut="Ctrl+M" onSelect={() => add()}>
              {labels.addSlide}
            </ContextMenuItem>
          )}
          {menu.onSlide ? (
            <>
              <ContextMenuItem
                icon={CopyPlus}
                shortcut="Ctrl+D"
                onSelect={() => duplicateSlides(bus, selection, chosen(), labels.duplicate)}
              >
                {labels.duplicate}
              </ContextMenuItem>
              <ContextMenuItem
                icon={hiddenAll ? Eye : EyeOff}
                onSelect={() =>
                  setSlidesHidden(bus, chosen(), !hiddenAll, hiddenAll ? labels.show : labels.hide)
                }
              >
                {hiddenAll ? labels.show : labels.hide}
              </ContextMenuItem>
              {onAi && labels.ai ? (
                <ContextMenuItem icon={Sparkles} shortcut="Ctrl+2" onSelect={onAi}>
                  {labels.ai}
                </ContextMenuItem>
              ) : null}
            </>
          ) : null}
          {clipboard ? (
            <>
              <ContextMenuSeparator />
              {menu.onSlide ? (
                <>
                  <ContextMenuItem
                    icon={Scissors}
                    shortcut="Ctrl+X"
                    onSelect={() => clipboard.cut(chosen())}
                  >
                    {labels.cut}
                  </ContextMenuItem>
                  <ContextMenuItem
                    icon={Copy}
                    shortcut="Ctrl+C"
                    onSelect={() => clipboard.copy(chosen())}
                  >
                    {labels.copy}
                  </ContextMenuItem>
                </>
              ) : null}
              <ContextMenuItem
                icon={ClipboardPaste}
                shortcut="Ctrl+V"
                disabled={!menu.canPaste}
                onSelect={() => clipboard.paste()}
              >
                {labels.paste}
              </ContextMenuItem>
            </>
          ) : null}
          {menu.onSlide ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                icon={Trash2}
                shortcut="Del"
                tone="danger"
                onSelect={() => removeSlides(bus, chosen(), labels.delete)}
              >
                {labels.delete}
              </ContextMenuItem>
            </>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
      {hasLayouts ? (
        <PopoverContent side="top" align="end" data-testid="layout-choices">
          <LayoutChoices
            deck={deck}
            resolveAsset={resolveAsset}
            blankLabel={labels.blank}
            onChoose={(layoutId) => {
              setChoosing(false);
              add(layoutId);
            }}
          />
        </PopoverContent>
      ) : null}
    </Popover>
  );
}
