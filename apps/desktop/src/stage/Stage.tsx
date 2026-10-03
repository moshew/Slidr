import {
  newId,
  rotatedBounds,
  unionBounds,
  type CommandBus,
  type Deck,
  type Element as SlideElement,
  type Frame,
  type Point,
  type SelectionStore,
  type Slide,
} from '@slidr/model';
import { SlideRenderer, type AssetResolver, type TextSlot } from '@slidr/renderer';
import { TextEditor } from '../text/TextEditor';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  type WheelEvent,
} from 'react';
import { useStore } from 'zustand';
import {
  fitZoom,
  HANDLES,
  MAX_ZOOM,
  MIN_ZOOM,
  resizeFrame,
  rotationAt,
  snapBoxes,
  snapMove,
  type Guide,
  type Handle,
} from './geometry';

/**
 * The Stage (WG2-T03..T06): the slide at the chosen zoom, and the direct manipulation of its
 * elements. The slide is drawn by `SlideRenderer`; selection, handles, guides and the marquee are
 * a separate layer in screen pixels, so they stay crisp at every zoom (RND-02). Every change is a
 * command: a drag is one transaction, Esc rolls it back (ADR-007).
 */
export interface StageProps {
  bus: CommandBus;
  deck: Deck;
  selection: SelectionStore;
  /** Fit to the Stage (UI-03), or a scale where 1 is 100%. */
  zoom: 'fit' | number;
  /** Ctrl + wheel asks for a new zoom; the host owns the value. */
  onZoomChange?: (zoom: number) => void;
  /** The scale the slide is shown at, for the status bar. */
  onViewScale?: (scale: number) => void;
  resolveAsset?: AssetResolver;
  /**
   * Files dropped on the Stage or pasted into it (STG-09), with the slide point they landed on.
   * The host imports them as assets and inserts them (see `insert.ts`).
   */
  onFiles?: (files: File[], at: Point) => void;
  className?: string;
  style?: CSSProperties;
}

/** Screen pixels within which an edge snaps or a click counts as a click. */
const SNAP_PX = 6;
const DRAG_PX = 3;
const HANDLE_PX = 8;
const ROTATE_OFFSET_PX = 24;
/** Safe margin and column grid the guides offer (STG-04): 5% of the width, 12 columns. */
const SAFE_MARGIN = 96;
const COLUMNS = 12;
const GUTTER = 24;

type Gesture =
  | { kind: 'move'; txId: string; start: Point; originals: Map<string, Frame>; moved: boolean }
  | {
      kind: 'resize';
      txId: string;
      start: Point;
      id: string;
      frame: Frame;
      rotation: number;
      handle: Handle;
      aspect: boolean;
    }
  | { kind: 'rotate'; txId: string; start: Point; id: string; center: Point; rotation: number }
  | { kind: 'marquee'; start: Point; current: Point; additive: string[] }
  | { kind: 'pan'; start: Point; pan: Point };

function useElementSize(ref: RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** The top-level element of the slide under a DOM node: a click inside a group picks the group. */
function hitElementId(
  target: EventTarget | null,
  slideRoot: HTMLElement | null,
): string | undefined {
  if (!(target instanceof Element) || !slideRoot) return undefined;
  let hit = target.closest<HTMLElement>('[data-element-id]');
  if (!hit || !slideRoot.contains(hit)) return undefined;
  for (
    let up = hit.parentElement?.closest<HTMLElement>('[data-element-id]');
    up && slideRoot.contains(up);
    up = up.parentElement?.closest<HTMLElement>('[data-element-id]')
  ) {
    hit = up;
  }
  return hit.dataset.elementId;
}

/**
 * The top-level element under a point. By position, not by event target: while the Stage holds
 * pointer capture (during and right after a drag), events are aimed at the Stage itself.
 */
function hitElementAt(x: number, y: number, slideRoot: HTMLElement | null): string | undefined {
  for (const node of document.elementsFromPoint(x, y)) {
    const id = hitElementId(node, slideRoot);
    if (id) return id;
  }
  return undefined;
}

function isInEditor(target: EventTarget | null): boolean {
  return target instanceof globalThis.Element && Boolean(target.closest('[data-text-editor]'));
}

const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const;

/** The resize cursor of a handle on a box rotated by `rotation`. */
function handleCursor(handle: Handle, rotation: number): string {
  const angle = (Math.atan2(handle.y, handle.x) * 180) / Math.PI + rotation + 90;
  const index = Math.round((((angle % 180) + 180) % 180) / 45) % 4;
  return CURSORS[index] ?? 'move';
}

/** Images, SVG and video keep their proportions unless Shift says otherwise (IMG-02). */
function keepsAspect(e: SlideElement): boolean {
  return e.type === 'image' || e.type === 'svg' || e.type === 'video';
}

export function Stage({
  bus,
  deck,
  selection,
  zoom,
  onZoomChange,
  onViewScale,
  resolveAsset,
  onFiles,
  className,
  style,
}: StageProps) {
  const container = useRef<HTMLDivElement>(null);
  const slideRoot = useRef<HTMLDivElement>(null);
  const size = useElementSize(container);
  const currentSlideId = useStore(selection, (s) => s.currentSlideId);
  const selected = useStore(selection, (s) => s.selectedElementIds);
  const editingId = useStore(selection, (s) => s.editingElementId);
  /** Where a double-click asked for the caret. */
  const [caretAt, setCaretAt] = useState<Point | undefined>();
  const slide: Slide | undefined = deck.slides.find((s) => s.id === currentSlideId);

  // Panning belongs to the zoom it was made at: a new zoom from the host starts centred.
  const [view, setView] = useState<{ zoom: 'fit' | number; pan: Point }>({
    zoom,
    pan: { x: 0, y: 0 },
  });
  const pan = view.zoom === zoom ? view.pan : { x: 0, y: 0 };
  const setPan = (next: Point | ((p: Point) => Point), forZoom: 'fit' | number = zoom) =>
    setView((v) => {
      const current = v.zoom === forZoom ? v.pan : { x: 0, y: 0 };
      return { zoom: forZoom, pan: typeof next === 'function' ? next(current) : next };
    });
  const [hover, setHover] = useState<string | undefined>();
  const [guides, setGuides] = useState<Guide[]>([]);
  const [marquee, setMarquee] = useState<Frame | undefined>();
  const [spaceDown, setSpaceDown] = useState(false);
  const gesture = useRef<Gesture | null>(null);
  // What kind of drag is under way, for rendering; the gesture itself lives in the ref.
  const [activeKind, setActiveKind] = useState<Gesture['kind'] | null>(null);
  const begin = (g: Gesture) => {
    gesture.current = g;
    setActiveKind(g.kind);
  };
  const frame = useRef<number | undefined>(undefined);

  const scale = zoom === 'fit' ? fitZoom(size, deck.size) : zoom;
  // The fitted slide is centred and cannot be panned; a zoomed one can.
  const effectivePan = zoom === 'fit' ? { x: 0, y: 0 } : pan;
  const origin = {
    x: (size.w - deck.size.w * scale) / 2 + effectivePan.x,
    y: (size.h - deck.size.h * scale) / 2 + effectivePan.y,
  };

  useEffect(() => {
    if (size.w > 0) onViewScale?.(scale);
  }, [scale, size.w, onViewScale]);

  const toSlide = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = container.current?.getBoundingClientRect();
      return {
        x: (clientX - (rect?.left ?? 0) - origin.x) / scale,
        y: (clientY - (rect?.top ?? 0) - origin.y) / scale,
      };
    },
    [origin.x, origin.y, scale],
  );

  const elementById = useMemo(
    () => new Map((slide?.elements ?? []).map((e) => [e.id, e])),
    [slide],
  );

  const updateFrames = useCallback(
    (txId: string, frames: Map<string, Partial<Pick<SlideElement, 'frame' | 'rotation'>>>) => {
      if (!slide || frames.size === 0) return;
      const commands = [...frames].map(([elementId, patch]) => ({
        type: 'element.update' as const,
        slideId: slide.id,
        elementId,
        patch,
      }));
      bus.batch(commands, { txId, label: 'Move' });
    },
    [bus, slide],
  );

  const schedule = (work: () => void) => {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      work();
    });
  };

  const endGesture = (cancel: boolean) => {
    const g = gesture.current;
    gesture.current = null;
    setActiveKind(null);
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    setGuides([]);
    setMarquee(undefined);
    if (cancel && g && 'txId' in g) bus.rollback(g.txId);
  };

  // ---- Pointer ----

  const onPointerDown = (e: PointerEvent) => {
    if (!slide || e.button === 2) return;
    // Inside the text editor the pointer is the editor's: caret, selection, drag-select.
    if (isInEditor(e.target)) return;
    if (editingId) selection.getState().stopEditing();
    container.current?.focus({ preventScroll: true });
    container.current?.setPointerCapture(e.pointerId);
    const p = toSlide(e.clientX, e.clientY);
    if (e.button === 1 || spaceDown) {
      if (zoom !== 'fit') begin({ kind: 'pan', start: { x: e.clientX, y: e.clientY }, pan });
      return;
    }
    const handle = (e.target as HTMLElement).dataset.handle;
    const single = selected.length === 1 ? elementById.get(selected[0] as string) : undefined;
    if (handle && single) {
      const txId = newId('tx');
      if (handle === 'rotate') {
        const c = {
          x: single.frame.x + single.frame.w / 2,
          y: single.frame.y + single.frame.h / 2,
        };
        begin({
          kind: 'rotate',
          txId,
          start: p,
          id: single.id,
          center: c,
          rotation: single.rotation,
        });
      } else {
        begin({
          kind: 'resize',
          txId,
          start: p,
          id: single.id,
          frame: single.frame,
          rotation: single.rotation,
          handle: HANDLES[handle as keyof typeof HANDLES],
          aspect: keepsAspect(single),
        });
      }
      return;
    }
    const hit = hitElementId(e.target, slideRoot.current);
    const element = hit ? elementById.get(hit) : undefined;
    if (element && !element.locked) {
      const state = selection.getState();
      if (e.shiftKey) {
        state.toggleElement(element.id);
        return;
      }
      if (!state.selectedElementIds.includes(element.id)) state.selectElements([element.id]);
      const ids = selection
        .getState()
        .selectedElementIds.filter((id) => !elementById.get(id)?.locked);
      begin({
        kind: 'move',
        txId: newId('tx'),
        start: p,
        originals: new Map(ids.map((id) => [id, (elementById.get(id) as SlideElement).frame])),
        moved: false,
      });
      return;
    }
    const additive = e.shiftKey ? selection.getState().selectedElementIds : [];
    if (!e.shiftKey) selection.getState().clearSelection();
    begin({ kind: 'marquee', start: p, current: p, additive });
  };

  const onPointerMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) {
      const hit = hitElementId(e.target, slideRoot.current);
      setHover(hit && !elementById.get(hit)?.locked ? hit : undefined);
      return;
    }
    if (g.kind === 'pan') {
      setPan({ x: g.pan.x + e.clientX - g.start.x, y: g.pan.y + e.clientY - g.start.y });
      return;
    }
    const p = toSlide(e.clientX, e.clientY);
    const shift = e.shiftKey;
    const alt = e.altKey;
    const free = e.ctrlKey || e.metaKey;
    schedule(() => {
      if (gesture.current !== g || !slide) return;
      if (g.kind === 'marquee') {
        g.current = p;
        const box = unionBounds([
          { x: g.start.x, y: g.start.y, w: 0, h: 0 },
          { x: p.x, y: p.y, w: 0, h: 0 },
        ]);
        setMarquee(box);
        const hits = slide.elements
          .filter((el) => !el.locked && !el.hidden)
          .filter((el) => {
            const b = rotatedBounds(el.frame, el.rotation);
            return (
              b.x < box.x + box.w && b.x + b.w > box.x && b.y < box.y + box.h && b.y + b.h > box.y
            );
          })
          .map((el) => el.id);
        selection.getState().selectElements([...new Set([...g.additive, ...hits])]);
        return;
      }
      if (g.kind === 'move') {
        let dx = p.x - g.start.x;
        let dy = p.y - g.start.y;
        if (!g.moved && Math.hypot(dx, dy) * scale < DRAG_PX) return;
        g.moved = true;
        // Shift keeps the drag on one axis.
        if (shift) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const moving = [...g.originals].map(([id, f]) =>
          rotatedBounds({ ...f, x: f.x + dx, y: f.y + dy }, elementById.get(id)?.rotation ?? 0),
        );
        const snap = free
          ? { dx: 0, dy: 0, guides: [] }
          : snapMove(
              unionBounds(moving),
              {
                boxes: snapBoxes(slide.elements, new Set(g.originals.keys())),
                slide: deck.size,
                safeMargin: SAFE_MARGIN,
                columns: COLUMNS,
                gutter: GUTTER,
              },
              SNAP_PX / scale,
            );
        if (!shift || dx !== 0) dx += snap.dx;
        if (!shift || dy !== 0) dy += snap.dy;
        setGuides(snap.guides);
        updateFrames(
          g.txId,
          new Map(
            [...g.originals].map(([id, f]) => [
              id,
              { frame: { ...f, x: Math.round(f.x + dx), y: Math.round(f.y + dy) } },
            ]),
          ),
        );
        return;
      }
      if (g.kind === 'resize') {
        const next = resizeFrame(
          g.frame,
          g.rotation,
          g.handle,
          { x: p.x - g.start.x, y: p.y - g.start.y },
          {
            keepAspect: g.aspect !== shift,
            fromCenter: alt,
            min: 4,
          },
        );
        const rounded = {
          x: Math.round(next.x),
          y: Math.round(next.y),
          w: Math.round(next.w),
          h: Math.round(next.h),
        };
        updateFrames(g.txId, new Map([[g.id, { frame: rounded }]]));
        return;
      }
      if (g.kind === 'rotate') {
        updateFrames(
          g.txId,
          new Map([[g.id, { rotation: rotationAt(g.center, g.start, p, g.rotation, shift) }]]),
        );
      }
    });
  };

  const onPointerUp = (e: PointerEvent) => {
    if (container.current?.hasPointerCapture(e.pointerId))
      container.current.releasePointerCapture(e.pointerId);
    endGesture(false);
  };

  const onDoubleClick = (e: MouseEvent) => {
    const hit = hitElementAt(e.clientX, e.clientY, slideRoot.current);
    const element = hit ? elementById.get(hit) : undefined;
    if (element && !element.locked && (element.type === 'text' || element.type === 'shape')) {
      setCaretAt({ x: e.clientX, y: e.clientY });
      selection.getState().startEditing(element.id);
    }
  };

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom around the pointer: the slide point under it stays under it.
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale * Math.pow(1.0015, -e.deltaY)));
      const rect = container.current?.getBoundingClientRect();
      const px = e.clientX - (rect?.left ?? 0);
      const py = e.clientY - (rect?.top ?? 0);
      const p = toSlide(e.clientX, e.clientY);
      const ox = px - p.x * next;
      const oy = py - p.y * next;
      const rounded = Math.round(next * 1000) / 1000;
      setPan(
        {
          x: ox - (size.w - deck.size.w * rounded) / 2,
          y: oy - (size.h - deck.size.h * rounded) / 2,
        },
        rounded,
      );
      onZoomChange?.(rounded);
      return;
    }
    if (zoom === 'fit') return;
    setPan((v) => ({
      x: v.x - (e.shiftKey ? e.deltaY : e.deltaX),
      y: v.y - (e.shiftKey ? 0 : e.deltaY),
    }));
  };

  // ---- Keyboard ----

  const nudge = useRef<{ txId: string; at: number } | null>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    if (isInEditor(e.target)) return;
    if (e.key === 'Enter' && selected.length === 1) {
      const target = elementById.get(selected[0] as string);
      if (target && !target.locked && (target.type === 'text' || target.type === 'shape')) {
        e.preventDefault();
        setCaretAt(undefined);
        selection.getState().startEditing(target.id);
        return;
      }
    }
    if (e.key === ' ') {
      setSpaceDown(true);
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      if (gesture.current) endGesture(true);
      else selection.getState().clearSelection();
      return;
    }
    if (!slide) return;
    const ids = selected.filter((id) => !elementById.get(id)?.locked);
    if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) {
      bus.dispatch(
        { type: 'element.remove', slideId: slide.id, elementIds: ids },
        { label: 'Delete' },
      );
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      selection
        .getState()
        .selectElements(slide.elements.filter((el) => !el.locked && !el.hidden).map((el) => el.id));
      e.preventDefault();
      return;
    }
    const arrows: Record<string, Point> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const dir = arrows[e.key];
    if (dir && ids.length) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      // A burst of presses is one undo step (STG-08).
      const now = performance.now();
      if (!nudge.current || now - nudge.current.at > 800)
        nudge.current = { txId: newId('tx'), at: now };
      nudge.current.at = now;
      updateFrames(
        nudge.current.txId,
        new Map(
          ids.map((id) => {
            const f = (elementById.get(id) as SlideElement).frame;
            return [id, { frame: { ...f, x: f.x + dir.x * step, y: f.y + dir.y * step } }];
          }),
        ),
      );
    }
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') setSpaceDown(false);
  };

  // ---- Files ----

  const onDragOver = (e: DragEvent) => {
    if (!onFiles || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDrop = (e: DragEvent) => {
    const files = Array.from(e.dataTransfer.files);
    if (!onFiles || !files.length) return;
    e.preventDefault();
    onFiles(files, toSlide(e.clientX, e.clientY));
  };
  const onPaste = (e: ClipboardEvent) => {
    if (isInEditor(e.target)) return;
    const files = Array.from(e.clipboardData.files);
    if (!onFiles || !files.length) return;
    e.preventDefault();
    // Pasted files land in the middle of the slide.
    onFiles(files, { x: deck.size.w / 2, y: deck.size.h / 2 });
  };

  // ---- Rendering ----

  const exitEditing = useCallback(() => {
    selection.getState().stopEditing();
    container.current?.focus({ preventScroll: true });
  }, [selection]);
  const textSlot = useCallback<TextSlot>(
    (element) =>
      element.id === editingId && slide ? (
        <TextEditor
          bus={bus}
          slideId={slide.id}
          element={element}
          theme={deck.theme}
          caretAt={caretAt}
          onExit={exitEditing}
        />
      ) : undefined,
    [editingId, slide, bus, deck.theme, caretAt, exitEditing],
  );

  const screen = (f: Frame): CSSProperties => ({
    position: 'absolute',
    left: origin.x + f.x * scale,
    top: origin.y + f.y * scale,
    width: f.w * scale,
    height: f.h * scale,
  });

  const selectedElements = selected
    .map((id) => elementById.get(id))
    .filter((e): e is SlideElement => Boolean(e));
  const single = selectedElements.length === 1 ? selectedElements[0] : undefined;
  const active = activeKind;

  let overlay: ReactNode = null;
  if (slide) {
    overlay = (
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {hover && !selected.includes(hover) && elementById.get(hover) ? (
          <Outline element={elementById.get(hover) as SlideElement} screen={screen} hover />
        ) : null}
        {selectedElements.map((el) => (
          <Outline key={el.id} element={el} screen={screen} locked={el.locked} />
        ))}
        {selectedElements.length > 1 ? (
          <div
            style={{
              ...screen(
                unionBounds(selectedElements.map((el) => rotatedBounds(el.frame, el.rotation))),
              ),
              outline: '1px dashed var(--color-ui-accent)',
            }}
          />
        ) : null}
        {single && !single.locked && editingId !== single.id ? (
          <Handles
            element={single}
            screen={screen}
            scale={scale}
            label={
              active === 'resize'
                ? `${Math.round(single.frame.w)} × ${Math.round(single.frame.h)}`
                : active === 'rotate'
                  ? `${Math.round(single.rotation)}°`
                  : undefined
            }
          />
        ) : null}
        {guides.map((g, i) => (
          <div
            key={i}
            style={
              g.axis === 'x'
                ? {
                    position: 'absolute',
                    left: origin.x + g.at * scale - 0.5,
                    top: origin.y + g.from * scale,
                    width: 1,
                    height: (g.to - g.from) * scale,
                    background: 'var(--color-ui-danger)',
                  }
                : {
                    position: 'absolute',
                    top: origin.y + g.at * scale - 0.5,
                    left: origin.x + g.from * scale,
                    height: 1,
                    width: (g.to - g.from) * scale,
                    background: 'var(--color-ui-danger)',
                  }
            }
          />
        ))}
        {marquee ? (
          <div
            style={{
              ...screen(marquee),
              background: 'var(--color-ui-accent-soft)',
              outline: '1px solid var(--color-ui-accent)',
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={container}
      data-testid="stage-surface"
      className={className}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => endGesture(true)}
      onDoubleClick={onDoubleClick}
      onWheel={onWheel}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onPaste={onPaste}
      onPointerLeave={() => setHover(undefined)}
      style={{
        position: 'relative',
        overflow: 'hidden',
        outline: 'none',
        cursor: spaceDown ? 'grab' : undefined,
        userSelect: 'none',
        touchAction: 'none',
        ...style,
      }}
    >
      {slide && size.w > 0 && size.h > 0 ? (
        <div
          data-testid="stage-frame"
          style={{
            position: 'absolute',
            left: origin.x,
            top: origin.y,
            width: deck.size.w * scale,
            height: deck.size.h * scale,
            boxShadow: 'var(--shadow-slide)',
          }}
        >
          <div
            ref={slideRoot}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              transformOrigin: '0 0',
              transform: `scale(${scale})`,
            }}
          >
            <SlideRenderer
              deck={deck}
              slide={slide}
              mode="edit"
              resolveAsset={resolveAsset}
              textSlot={editingId ? textSlot : undefined}
            />
          </div>
        </div>
      ) : null}
      {overlay}
    </div>
  );
}

function Outline({
  element,
  screen,
  hover,
  locked,
}: {
  element: SlideElement;
  screen: (f: Frame) => CSSProperties;
  hover?: boolean;
  locked?: boolean;
}) {
  return (
    <div
      data-outline={element.id}
      style={{
        ...screen(element.frame),
        transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
        outline: `${hover ? 1 : 1.5}px ${locked ? 'dashed' : 'solid'} var(--color-ui-accent)`,
      }}
    />
  );
}

function Handles({
  element,
  screen,
  scale,
  label,
}: {
  element: SlideElement;
  screen: (f: Frame) => CSSProperties;
  scale: number;
  label?: string;
}) {
  const { w, h } = element.frame;
  const sw = w * scale;
  const sh = h * scale;
  const box: CSSProperties = {
    ...screen(element.frame),
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
  };
  const handle = (name: keyof typeof HANDLES): ReactNode => {
    const hd = HANDLES[name];
    // Handles that would sit on top of each other on a tiny box are left out.
    if ((hd.x === 0 && sw < 3 * HANDLE_PX) || (hd.y === 0 && sh < 3 * HANDLE_PX)) return null;
    return (
      <div
        key={name}
        data-handle={name}
        style={{
          position: 'absolute',
          left: ((hd.x + 1) / 2) * sw - HANDLE_PX / 2,
          top: ((hd.y + 1) / 2) * sh - HANDLE_PX / 2,
          width: HANDLE_PX,
          height: HANDLE_PX,
          boxSizing: 'border-box',
          background: 'var(--color-ui-panel)',
          border: '1.5px solid var(--color-ui-accent)',
          borderRadius: 2,
          pointerEvents: 'auto',
          cursor: handleCursor(hd, element.rotation),
        }}
      />
    );
  };
  return (
    <div style={box}>
      {(Object.keys(HANDLES) as (keyof typeof HANDLES)[]).map(handle)}
      <div
        data-handle="rotate"
        style={{
          position: 'absolute',
          left: sw / 2 - 5,
          top: -ROTATE_OFFSET_PX - 5,
          width: 10,
          height: 10,
          boxSizing: 'border-box',
          borderRadius: '50%',
          background: 'var(--color-ui-panel)',
          border: '1.5px solid var(--color-ui-accent)',
          pointerEvents: 'auto',
          cursor: 'grab',
        }}
      />
      {label ? (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: sh + 10,
            transform: `translateX(-50%) rotate(${-element.rotation}deg)`,
            padding: '2px 6px',
            borderRadius: 4,
            background: 'var(--color-ui-accent)',
            color: 'var(--color-ui-on-accent)',
            font: '500 11px/16px var(--font-ui)',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}
