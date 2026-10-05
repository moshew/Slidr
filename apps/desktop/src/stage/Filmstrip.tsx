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
  type ReactNode,
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
  useKeyboardInUse,
} from '@slidr/ui';
import {
  Blend,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eye,
  EyeOff,
  Film,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  type LucideIcon,
} from '@slidr/ui/icons';
import { useStore } from 'zustand';
import {
  addSlide,
  allHidden,
  duplicateSlides,
  removeSlides,
  setSlidesHidden,
} from '../arrange/slides';
import { setStripCommands, stageKeys, type StageCommand } from './keyboardSession';

/**
 * The Filmstrip (WG2-T07, WG5-T08, FLM-01..04): thumbnails of every slide, in the reading
 * direction of the UI. Only the thumbnails in view are rendered, so 200 slides scroll as smoothly
 * as 10 (NFR-05). Click picks a slide, Ctrl adds to the selection, Shift selects a range; dragging
 * reorders; a right click opens the slide menu, which acts on the whole selection.
 *
 * For the keyboard and for a screen reader (UI-06) the slides are a list with a name: the list
 * has the keyboard and says which slide it is on and how many there are; the strip around it
 * scrolls, takes the pointer, and holds the "new slide" button beside the list, not in it.
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
   * What other areas mark a slide with, drawn beside its number under the thumbnail (FLM-04): the design
   * check's findings. A screen reader hears it as the thumbnail's description.
   */
  mark?: (slideId: string) => ReactNode;
  /**
   * Opens the host's AI chat about the slide the menu was opened on, which is the current slide
   * by then. Without it the menu has no such item.
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
  /** The name of the list of slides, for a screen reader. */
  strip: string;
  addSlide: string;
  slide: (n: number) => string;
  /** The mark of a slide that comes in with a transition (FLM-04). */
  transition: string;
  /** The mark of a slide whose elements are animated, by how many animations (FLM-04). */
  animations: (count: number) => string;
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
  /** The undo step of slides moved along the strip, by a drag or by the keyboard. */
  move: string;
  /** The menu's way to the AI chat about the slide; shown when the host gives `onAi`. */
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
  strip: 'Slides',
  addSlide: 'New slide',
  slide: (n: number) => `Slide ${n}`,
  transition: 'Has a transition',
  animations: (count: number) => (count === 1 ? '1 animation' : `${count} animations`),
  hidden: 'Hidden',
  blank: 'Blank slide',
  duplicate: 'Duplicate',
  delete: 'Delete',
  hide: 'Hide',
  show: 'Show',
  copy: 'Copy',
  cut: 'Cut',
  paste: 'Paste',
  move: 'Move slides',
};

interface Drag {
  pointerId: number;
  startX: number;
  ids: string[];
  active: boolean;
  /** Slot the slides would land in, 0..n, counted in the full list. */
  slot: number;
}

/** The id of a slide's place in the list, which the list names as where the keyboard is. */
const optionId = (slideId: string) => `filmstrip-slide-${slideId}`;

/**
 * A state of the slide, beside its number (FLM-04): an icon, with words for a screen reader,
 * who hears them as the slide's description, and for whoever points at it.
 */
function StateMark({ icon, label, testId }: { icon: LucideIcon; label: string; testId: string }) {
  return (
    <Tooltip content={label}>
      <span data-testid={testId} className="inline-flex items-center text-ui-fg-muted">
        <Icon icon={icon} />
        <span className="sr-only">{label}</span>
      </span>
    </Tooltip>
  );
}

const Thumb = memo(function Thumb({
  deck,
  slideIndex,
  selected,
  current,
  walked,
  resolveAsset,
  label,
  hiddenLabel,
  transitionLabel,
  animationsLabel,
  mark,
}: {
  deck: Deck;
  slideIndex: number;
  selected: boolean;
  current: boolean;
  /** The selection walk stands on this slide (UI-06): the keyboard is here, selected or not. */
  walked: boolean;
  resolveAsset?: AssetResolver;
  label: string;
  hiddenLabel: string;
  transitionLabel: string;
  animationsLabel: (count: number) => string;
  mark?: (slideId: string) => ReactNode;
}) {
  const slide = deck.slides[slideIndex];
  if (!slide) return null;
  const markId = `filmstrip-mark-${slide.id}`;
  const stateId = `filmstrip-state-${slide.id}`;
  // A transition of "none" is no transition.
  const transition = Boolean(slide.transition && slide.transition.type !== 'none');
  const animations = slide.timeline.length;
  const hasState = transition || animations > 0;
  const described = [mark ? markId : '', hasState ? stateId : ''].filter(Boolean).join(' ');
  return (
    <div
      role="option"
      id={optionId(slide.id)}
      aria-selected={selected}
      aria-label={slide.hidden ? `${label}, ${hiddenLabel}` : label}
      aria-describedby={described || undefined}
      // Only the slides in view are drawn: the list says how many there are, and which this is.
      aria-setsize={deck.slides.length}
      aria-posinset={slideIndex + 1}
      data-slide-id={slide.id}
      data-hidden={slide.hidden || undefined}
      data-walk={walked || undefined}
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
      {walked ? (
        // The walk's ring, outside the frame of the picture as on the Stage. Not on the picture
        // itself: a hidden slide is dimmed, and the ring of the keyboard must not be.
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            insetInlineStart: 0,
            width: THUMB_W,
            height: THUMB_H,
            borderRadius: 'var(--radius-small)',
            outline: '2px dotted var(--color-ui-focus)',
            outlineOffset: 4,
            pointerEvents: 'none',
          }}
        />
      ) : null}
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
          position: 'relative',
          marginTop: 4,
          font: '500 11px/14px var(--font-ui)',
          color: current ? 'var(--color-ui-fg)' : 'var(--color-ui-fg-muted)',
          textAlign: 'center',
        }}
      >
        {slideIndex + 1}
        {mark && (
          // Beside the number, not over the picture: the thumbnail stays the slide as it is drawn.
          // The mark draws itself, or nothing.
          <div
            id={markId}
            data-testid="slide-mark"
            style={{ position: 'absolute', top: -1, insetInlineStart: 0, display: 'flex', gap: 4 }}
          >
            {mark(slide.id)}
          </div>
        )}
        {hasState && (
          // The slide's own states, at the other end of the row: how it comes in, and whether
          // anything on it moves. Beside the number too, for the same reason.
          <div
            id={stateId}
            data-testid="slide-state"
            style={{ position: 'absolute', top: -1, insetInlineEnd: 0, display: 'flex', gap: 4 }}
          >
            {transition && (
              <StateMark icon={Blend} label={transitionLabel} testId="slide-transition-mark" />
            )}
            {animations > 0 && (
              <StateMark
                icon={Film}
                label={animationsLabel(animations)}
                testId="slide-animations-mark"
              />
            )}
          </div>
        )}
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
        {/* A card is named by its layout; the picture of it, with its words, is not its name. */}
        <button type="button" data-layout="" className={card} onClick={() => onChoose()}>
          <div aria-hidden style={frame}>
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
            <div aria-hidden style={frame}>
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

/** Scrolls the strip so that the slide at an index is in view, if it is not. */
function revealSlide(el: HTMLElement, index: number, behavior: ScrollBehavior): void {
  if (index < 0) return;
  const start = PAD + index * STEP;
  const pos = Math.abs(el.scrollLeft);
  const rtl = getComputedStyle(el).direction === 'rtl';
  const to = (p: number) => el.scrollTo({ left: rtl ? -p : p, behavior });
  if (start < pos) to(start - PAD);
  else if (start + THUMB_W > pos + el.clientWidth) to(start + THUMB_W + PAD - el.clientWidth);
}

export function Filmstrip({
  bus,
  deck,
  selection,
  resolveAsset,
  clipboard,
  labels = DEFAULT_LABELS,
  mark,
  onAi,
  className,
}: FilmstripProps) {
  /** The strip: it scrolls and takes the pointer. */
  const scroller = useRef<HTMLDivElement>(null);
  /** The list of slides in it: it takes the keyboard. */
  const list = useRef<HTMLDivElement>(null);
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

  // The selection walk (UI-06): the slide the keyboard is on without having selected it.
  const walkId = useStore(stageKeys, (s) => s.slide);
  const walkIndex = walkId ? slides.findIndex((s) => s.id === walkId) : -1;
  const endWalk = () => {
    if (stageKeys.getState().slide !== null) stageKeys.setState({ slide: null });
  };
  // The list shows that it has the keyboard while the keyboard is what is being used (DSN-08).
  const [focused, setFocused] = useState(false);
  const ring = useKeyboardInUse() && focused;

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
    if (!el) return;
    // At once, not gliding, for whoever asked the system for less motion (UI-06).
    const still = el.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)');
    revealSlide(
      el,
      slides.findIndex((s) => s.id === currentId),
      still?.matches ? 'instant' : 'smooth',
    );
  }, [currentId, slides]);
  // And the slide the walk stands on: the keyboard is there, so it has to be seen.
  useEffect(() => {
    if (scroller.current) revealSlide(scroller.current, walkIndex, 'instant');
  }, [walkIndex]);

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
    // A press is a selection of its own: the walk is over, and the keyboard is the list's.
    endWalk();
    list.current?.focus({ preventScroll: true });
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
      bus.dispatch({ type: 'slide.move', slideIds: drag.ids, toIndex }, { label: labels.move });
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

  /**
   * A menu asked for from the keyboard (Shift+F10, the menu key) arrives at the middle of what
   * has the keyboard, which is no slide in particular: it used to make the slide that happened
   * to be there the current one. It is asked for again at the slide the keyboard is on, the
   * walked one or else the current one, so the menu is about that slide and opens beside it.
   */
  const onContextMenuCapture = (e: MouseEvent) => {
    // From the keyboard the event names no button; a press of the pointer names the right one.
    if (e.nativeEvent.button >= 0) return;
    const el = scroller.current;
    const index = walkIndex >= 0 ? walkIndex : slides.findIndex((s) => s.id === currentId);
    // Without a slide the menu is the strip's own, wherever it opens.
    if (!el || index < 0) return;
    // This event goes no further, so stopping the webview's own menu is done here too.
    e.preventDefault();
    e.stopPropagation();
    revealSlide(el, index, 'instant');
    const rect = el.getBoundingClientRect();
    const rtl = getComputedStyle(el).direction === 'rtl';
    const inline = PAD + index * STEP + THUMB_W / 2 - Math.abs(el.scrollLeft);
    el.dispatchEvent(
      new globalThis.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        view: el.ownerDocument.defaultView,
        button: 2,
        clientX: rtl ? rect.right - inline : rect.left + inline,
        clientY: rect.top + 10 + THUMB_H / 2,
      }),
    );
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

  /**
   * Moves the selected slides along the strip from the keyboard (UI-06), as a drag does: one
   * place on or back, or to either end. `slide.move` counts the place without the moving slides.
   */
  const moveSelected = (to: 'on' | 'back' | 'start' | 'end') => {
    const ids = selectedIds.length ? selectedIds : currentId ? [currentId] : [];
    const moving = new Set(ids);
    const rest = slides.filter((s) => !moving.has(s.id));
    const first = slides.findIndex((s) => moving.has(s.id));
    if (first < 0) return;
    const at = slides.slice(0, first).filter((s) => !moving.has(s.id)).length;
    const toIndex = { on: at + 1, back: at - 1, start: 0, end: rest.length }[to];
    if (toIndex < 0 || toIndex > rest.length) return;
    const ordered = slides.filter((s) => moving.has(s.id));
    const after = [...rest.slice(0, toIndex), ...ordered, ...rest.slice(toIndex)];
    // A move that leaves the order as it is is no undo step.
    if (after.every((s, i) => s === slides[i])) return;
    bus.dispatch(
      { type: 'slide.move', slideIds: ordered.map((s) => s.id), toIndex },
      { label: labels.move },
    );
  };

  const onKeyDown = (e: KeyboardEvent) => {
    // Esc ends the selection walk, and leaves the selection as the walk made it.
    if (e.key === 'Escape' && walkId) {
      e.preventDefault();
      endWalk();
      return;
    }
    // With Alt the arrows are the selection walk's, a shortcut of the registry (see below): the
    // key passes through here untouched.
    if (e.altKey) return;
    const index = slides.findIndex((s) => s.id === currentId);
    const rtl = scroller.current ? getComputedStyle(scroller.current).direction === 'rtl' : false;
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 }[
      e.key
    ];
    // Ctrl and an arrow carries the selected slides along; Ctrl+Home and Ctrl+End to an end.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const to =
        step === 1
          ? 'on'
          : step === -1
            ? 'back'
            : e.key === 'Home'
              ? 'start'
              : e.key === 'End'
                ? 'end'
                : undefined;
      if (to) {
        e.preventDefault();
        moveSelected(to);
        return;
      }
    }
    if (step !== undefined) {
      e.preventDefault();
      // An arrow of its own is a selection of its own: the walk is over.
      endWalk();
      const next = slides[Math.max(0, Math.min(slides.length - 1, index + step))];
      if (next) {
        if (e.shiftKey) select(slides.indexOf(next), e);
        else selection.getState().setCurrentSlide(next.id);
      }
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      endWalk();
      const target = e.key === 'Home' ? slides[0] : slides.at(-1);
      if (target) selection.getState().setCurrentSlide(target.id);
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length) {
      e.preventDefault();
      removeSlides(bus, selectedIds, labels.delete);
    }
  };

  /**
   * The selection walk in the strip (UI-06): the keys that walk the elements of the slide on the
   * Stage walk the slides here, and the key that adds an element to the selection adds a slide.
   * So slides that are not next to each other are selected without the pointer. The keys are
   * shortcuts of the registry; the strip answers them only while its list has the keyboard.
   */
  const runCommand = (command: StageCommand): boolean => {
    if (document.activeElement !== list.current) return false;
    if (command.type === 'walk') {
      // From where the walk stands, or from the current slide; it stops at the ends of the strip.
      const from = walkIndex >= 0 ? walkIndex : slides.findIndex((s) => s.id === currentId);
      const to = slides[Math.max(0, Math.min(slides.length - 1, from + command.step))];
      if (!to) return false;
      stageKeys.setState({ slide: to.id });
      return true;
    }
    if (command.type === 'toggle') {
      if (walkIndex < 0) return false;
      // What Ctrl and a click do: a slide that joins the selection is the one on the Stage.
      select(walkIndex, { ctrlKey: true, metaKey: false, shiftKey: false });
      return true;
    }
    return false;
  };
  useEffect(() => {
    setStripCommands(runCommand);
    return () => setStripCommands(null);
  });

  const indicator = drag?.active ? PAD + drag.slot * STEP - GAP / 2 - 1 : undefined;
  // The slide the keyboard is on: where the walk stands, else the current one. The list names
  // it only while its thumbnail is drawn, as only the slides in view are.
  const activeIndex = walkIndex >= 0 ? walkIndex : slides.findIndex((s) => s.id === currentId);
  const activeSlide = activeIndex >= first && activeIndex <= last ? slides[activeIndex] : undefined;

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
            data-filmstrip=""
            className={className}
            onScroll={measure}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            onContextMenuCapture={onContextMenuCapture}
            onContextMenu={onContextMenu}
            style={{
              position: 'relative',
              overflowX: 'auto',
              overflowY: 'hidden',
              // The ring of the list is drawn on the strip, which is what is in view of it.
              outline: ring ? '2px solid var(--color-ui-focus)' : 'none',
              outlineOffset: -2,
              userSelect: 'none',
            }}
          >
            <div style={{ position: 'relative', width: total, height: '100%' }}>
              {/* The list holds the slides and nothing else: it is as long as the strip, so
                  getting the focus never scrolls it, and the button after it lies over its end. */}
              <div
                ref={list}
                role="listbox"
                aria-label={labels.strip}
                aria-multiselectable
                aria-orientation="horizontal"
                aria-activedescendant={activeSlide ? optionId(activeSlide.id) : undefined}
                tabIndex={0}
                onKeyDown={onKeyDown}
                onFocus={(e) => {
                  if (e.target === e.currentTarget) setFocused(true);
                }}
                onBlur={(e) => {
                  if (e.target !== e.currentTarget) return;
                  setFocused(false);
                  // The walk is the keyboard's place in the list, and ends when it leaves.
                  endWalk();
                }}
                style={{ position: 'absolute', inset: 0, outline: 'none' }}
              >
                {slides.slice(first, last + 1).map((slide, i) => (
                  <Thumb
                    key={slide.id}
                    deck={deck}
                    slideIndex={first + i}
                    selected={selectedIds.includes(slide.id)}
                    current={slide.id === currentId}
                    walked={slide.id === walkId}
                    resolveAsset={resolveAsset}
                    label={labels.slide(first + i + 1)}
                    hiddenLabel={labels.hidden}
                    transitionLabel={labels.transition}
                    animationsLabel={labels.animations}
                    mark={mark}
                  />
                ))}
              </div>
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
                <ContextMenuItem icon={Sparkles} shortcut="Ctrl+L" onSelect={onAi}>
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
