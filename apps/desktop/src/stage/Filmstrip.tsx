import { createSlide, type CommandBus, type Deck, type SelectionStore } from '@slidr/model';
import { ScaledSlide, type AssetResolver } from '@slidr/renderer';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Icon, Tooltip } from '@slidr/ui';
import { Plus } from '@slidr/ui/icons';
import { useStore } from 'zustand';

/**
 * The Filmstrip (WG2-T07, FLM-01..03): thumbnails of every slide, in the reading direction of the
 * UI. Only the thumbnails in view are rendered, so 200 slides scroll as smoothly as 10 (NFR-05).
 * Click picks a slide, Ctrl adds to the selection, Shift selects a range; dragging reorders.
 */
export interface FilmstripProps {
  bus: CommandBus;
  deck: Deck;
  selection: SelectionStore;
  resolveAsset?: AssetResolver;
  /** The "new slide" button (FLM-03). Without it the button adds a blank slide after the current one. */
  onAddSlide?: () => void;
  /** Labels in the UI language. */
  labels?: { addSlide: string; slide: (n: number) => string };
  className?: string;
}

export const THUMB_W = 176;
export const THUMB_H = 99;
const GAP = 16;
const PAD = 16;
const STEP = THUMB_W + GAP;
/** Thumbnails rendered beyond each edge of the view. */
const OVERSCAN = 3;
const DRAG_PX = 4;

const DEFAULT_LABELS = { addSlide: 'New slide', slide: (n: number) => `Slide ${n}` };

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
}: {
  deck: Deck;
  slideIndex: number;
  selected: boolean;
  current: boolean;
  resolveAsset?: AssetResolver;
  label: string;
}) {
  const slide = deck.slides[slideIndex];
  if (!slide) return null;
  return (
    <div
      role="option"
      aria-selected={selected}
      aria-label={label}
      data-slide-id={slide.id}
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

export function Filmstrip({
  bus,
  deck,
  selection,
  resolveAsset,
  onAddSlide,
  labels = DEFAULT_LABELS,
  className,
}: FilmstripProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ pos: 0, width: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const currentId = useStore(selection, (s) => s.currentSlideId);
  const selectedIds = useStore(selection, (s) => s.selectedSlideIds);
  const slides = deck.slides;
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

  const addSlide = () => {
    if (onAddSlide) return onAddSlide();
    const index = slides.findIndex((s) => s.id === currentId) + 1;
    const slide = createSlide({});
    bus.dispatch({ type: 'slide.add', slide, index }, { label: 'New slide' });
    selection.getState().setCurrentSlide(slide.id);
  };

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
      bus.dispatch({ type: 'slide.remove', slideIds: selectedIds }, { label: 'Delete slides' });
    }
  };

  const indicator = drag?.active ? PAD + drag.slot * STEP - GAP / 2 - 1 : undefined;

  return (
    <div
      ref={scroller}
      role="listbox"
      aria-multiselectable
      aria-orientation="horizontal"
      tabIndex={0}
      className={className}
      onScroll={measure}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={onKeyDown}
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
          />
        ))}
        <div
          style={{ position: 'absolute', insetInlineStart: PAD + slides.length * STEP, top: 10 }}
        >
          <Tooltip content={labels.addSlide} shortcut="Ctrl+M">
            <button
              type="button"
              aria-label={labels.addSlide}
              data-testid="new-slide"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={addSlide}
              className="inline-flex h-thumb-h w-thumb-h cursor-default items-center justify-center rounded-small border border-dashed border-ui-line-strong text-ui-fg-muted transition-colors hover:bg-ui-hover hover:text-ui-fg active:bg-ui-pressed"
            >
              <Icon icon={Plus} size="md" />
            </button>
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
  );
}
