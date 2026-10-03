import {
  duplicateElements,
  newId,
  rotatedBounds,
  rotateVector,
  unionBounds,
  type CommandBus,
  type Deck,
  type Element as SlideElement,
  type Frame,
  type GroupElement,
  type ImageElement,
  type LineElement,
  type Point,
  type SelectionStore,
  type Slide,
} from '@slidr/model';
import { SlideRenderer, type AssetResolver, type HtmlSlot, type TextSlot } from '@slidr/renderer';
import { fitRows } from '../table/fit';
import { useTableStage } from '../table/stage';
import { createHtmlTextEditing } from '../text/htmlEditing';
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
  cropPan,
  cropPatch,
  cropResize,
  cropView,
  cropZoom,
  cropZoomLevel,
  positionToOwn,
  type CropView,
} from './crop';
import { cropSession, heldRatio, resetCropSession } from './cropSession';
import {
  fitZoom,
  HANDLES,
  MAX_ZOOM,
  MIN_ZOOM,
  resizeFrame,
  rotationAt,
  snapMove,
  snapResize,
  type Guide,
  type Handle,
} from './geometry';
import {
  refitAll,
  refitGroups,
  refitPatches,
  resizeGroup,
  resizeTogether,
  type Patch,
  type Placement,
} from './groups';
import {
  constrainAngle,
  distanceToLine,
  insertLinePoint,
  linePoints,
  moveLinePoint,
  neighbourIndex,
  removeLinePoint,
} from './line';
import {
  CropOverlay,
  Handles,
  Label,
  LineOverlay,
  Outline,
  screenBox,
  type StageView,
} from './overlays';
import {
  apply,
  applyVector,
  elementMatrix,
  indexElements,
  invert,
  isTranslation,
  pathIds,
  resolveHit,
  slideBounds,
  snapCandidates,
  tidy,
  validScope,
  type Located,
  type Matrix,
} from './space';

/**
 * The Stage (WG2-T03..T06, WG5): the slide at the chosen zoom, and the direct manipulation of its
 * elements. The slide is drawn by `SlideRenderer`; selection, handles, guides and the marquee are
 * a separate layer in screen pixels, so they stay crisp at every zoom (RND-02). Every change is a
 * command: a drag is one transaction, Esc rolls it back (ADR-007).
 *
 * Besides moving, resizing and rotating (ADR-012) it crops images, edits the points of lines and
 * works inside groups (ADR-016). Which group the user has entered is the Stage's own state; the
 * image being cropped is `selection.editingElementId`, like the text being edited.
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
/** How near the stroke of a line the pointer has to be, in screen pixels. */
const LINE_HIT_PX = 6;
/** Safe margin and column grid the guides offer (STG-04): 5% of the width, 12 columns. */
const SAFE_MARGIN = 96;
const COLUMNS = 12;
const GUTTER = 24;
/** Wheel steps or arrow presses this close together are one undo step. */
const BURST_MS = 800;

/** One element of a move, as it was when the drag began. */
interface MoveItem {
  id: string;
  frame: Frame;
  /** From slide pixels to the coordinates its frame is written in. */
  inverse: Matrix;
  bounds: Frame;
  path: GroupElement[];
}

type Gesture =
  | {
      kind: 'move';
      txId: string;
      start: Point;
      moved: boolean;
      /** Alt: the drag moves copies and leaves the originals (ARR-05). */
      duplicate: boolean;
      /** The selection the drag started from, to put back when a duplicating drag is cancelled. */
      restore: string[];
      items: MoveItem[];
      /** The groups around the moved elements, when they share them; otherwise undefined. */
      path: GroupElement[] | undefined;
      snapBoxes: Frame[];
    }
  | {
      kind: 'resize';
      txId: string;
      start: Point;
      /** One element, or several of one parent that are resized together. */
      items: Located[];
      /** The box the handles are on: the element's frame, or the box around the several. */
      frame: Frame;
      rotation: number;
      /** The space the box is written in, and the way back from the slide. */
      space: Matrix;
      inverse: Matrix;
      path: GroupElement[];
      handle: Handle;
      aspect: boolean;
      snapBoxes: Frame[];
    }
  | { kind: 'rotate'; txId: string; start: Point; located: Located; inverse: Matrix; center: Point }
  | {
      kind: 'line-point';
      txId: string;
      located: Located & { element: LineElement };
      inverse: Matrix;
      index: number;
      snapBoxes: Frame[];
    }
  | {
      kind: 'crop-resize' | 'crop-pan';
      txId: string;
      start: Point;
      located: Located;
      inverse: Matrix;
      view: CropView;
      handle: Handle;
    }
  | { kind: 'marquee'; start: Point; current: Point; additive: string[]; scope: string[] }
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

interface Burst {
  txId: string;
  at: number;
}

/** The transaction of a burst of key presses or wheel steps; a pause starts the next one. */
function burstTx(ref: { current: Burst | null }): string {
  const now = performance.now();
  if (!ref.current || now - ref.current.at > BURST_MS) ref.current = { txId: newId('tx'), at: now };
  ref.current.at = now;
  return ref.current.txId;
}

/** In the text editor, or in the table cell around it: the whole cell is the editor's (WG6). */
function isInEditor(target: EventTarget | null): boolean {
  return (
    target instanceof globalThis.Element &&
    Boolean(target.closest('[data-text-editor], [data-cell-editing]'))
  );
}

/** The value of a `data-*` attribute on the target or on what it sits in. */
function dataOf(target: EventTarget | null, name: string): string | undefined {
  if (!(target instanceof globalThis.Element)) return undefined;
  return target.closest(`[data-${name}]`)?.getAttribute(`data-${name}`) ?? undefined;
}

/** Images, SVG and video keep their proportions unless Shift says otherwise (IMG-02). */
function keepsAspect(e: SlideElement): boolean {
  return e.type === 'image' || e.type === 'svg' || e.type === 'video';
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

const intersects = (a: Frame, b: Frame) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** The groups around the elements when all of them sit in the same one. */
function sharedPath(items: readonly { path: GroupElement[] }[]): GroupElement[] | undefined {
  const head = items[0];
  if (!head) return undefined;
  const key = head.path.map((g) => g.id);
  const same = items.every((item) =>
    sameIds(
      item.path.map((g) => g.id),
      key,
    ),
  );
  return same ? head.path : undefined;
}

const isLine = (located: Located): located is Located & { element: LineElement } =>
  located.element.type === 'line';

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
  const [overCrop, setOverCrop] = useState(false);
  /** The groups the user went into by double-click, outermost first (ARR-01). */
  const [entered, setEntered] = useState<string[]>([]);
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

  /** Every element of the slide by id, nested ones too, with the space each is written in. */
  const index = useMemo(() => indexElements(slide?.elements ?? []), [slide]);
  const selectedLocated = selected
    .map((id) => index.get(id))
    .filter((l): l is Located => Boolean(l));
  const single = selectedLocated.length === 1 ? selectedLocated[0] : undefined;

  // The group being worked in: the one around the selection, or the one entered last.
  const first = selectedLocated[0];
  const scope = first ? pathIds(first) : validScope(entered, index);

  // Several elements of one parent have one box around them, in that parent's axes, with handles
  // that resize them together.
  const together: Located | undefined =
    first &&
    selectedLocated.length > 1 &&
    sharedPath(selectedLocated) &&
    selectedLocated.every((l) => !l.locked)
      ? {
          ...first,
          element: {
            ...first.element,
            id: 'selection',
            frame: unionBounds(
              selectedLocated.map((l) => rotatedBounds(l.element.frame, l.element.rotation)),
            ),
            rotation: 0,
            flipH: false,
            flipV: false,
          },
        }
      : undefined;

  // ---- Tables: the lines of a selected table, and the cells of one the user went into (WG6) ----

  const focusSurface = useCallback(() => container.current?.focus({ preventScroll: true }), []);
  const tables = useTableStage({
    bus,
    selection,
    slide,
    theme: deck.theme,
    index,
    single,
    editingId,
    view: { origin, scale },
    toSlide,
    focus: focusSurface,
  });

  // ---- Crop mode: `editingElementId` on an image that has a picture of a known size ----

  const editing = editingId ? index.get(editingId) : undefined;
  const crop = useMemo(() => {
    const image = editing?.element;
    if (!editing || image?.type !== 'image' || editing.locked) return undefined;
    const asset = image.assetId ? deck.assets[image.assetId] : undefined;
    if (!asset?.width || !asset.height) return undefined;
    return {
      located: editing,
      image,
      view: cropView(image, { w: asset.width, h: asset.height }),
      url: resolveAsset?.(asset),
    };
  }, [editing, deck.assets, resolveAsset]);
  const croppingId = crop?.image.id ?? null;

  useEffect(() => {
    // An image without a picture, or a locked one, has nothing to crop.
    if (editing?.element.type === 'image' && !croppingId) selection.getState().stopEditing();
  }, [editing, croppingId, selection]);

  // The `html` element whose text is edited in place (HTM-03). One with scripts runs in a frame
  // the editor cannot reach into, so it has no text to edit here.
  const htmlId =
    editing?.element.type === 'html' && !editing.element.hasScripts && !editing.locked
      ? editing.element.id
      : undefined;
  useEffect(() => {
    if (editing?.element.type === 'html' && !htmlId) selection.getState().stopEditing();
  }, [editing, htmlId, selection]);
  const wasHtml = useRef<string | undefined>(undefined);
  useEffect(() => {
    const ended = wasHtml.current !== undefined && htmlId === undefined;
    wasHtml.current = htmlId;
    const surface = container.current;
    if (!ended || !surface) return;
    // The text that had the keyboard is no longer editable: the Stage takes the keyboard back,
    // unless the user has already put it somewhere else.
    const active = document.activeElement;
    if (!active || active === document.body || surface.contains(active)) {
      surface.focus({ preventScroll: true });
    }
  }, [htmlId]);

  const wasCropping = useRef<string | null>(null);
  useEffect(() => {
    if (wasCropping.current === croppingId) return;
    wasCropping.current = croppingId;
    resetCropSession();
    const surface = container.current;
    if (!surface) return;
    // Crop mode is left with Esc and Enter, which the Stage hears only when it has the focus:
    // take it from the button that started crop mode, and from a button that went away with it.
    const active = document.activeElement;
    if (croppingId ? !surface.contains(active) : active === document.body) {
      surface.focus({ preventScroll: true });
    }
  }, [croppingId]);

  // ---- Commands ----

  /** Sends patches of elements as one change; `path` keeps the groups around them fitted. */
  const commit = useCallback(
    (
      txId: string,
      label: string,
      path: readonly GroupElement[] | undefined,
      patches: ReadonlyMap<string, Patch>,
    ) => {
      if (!slide || patches.size === 0) return;
      const all = path?.length ? refitPatches(path, patches) : patches;
      bus.batch(
        [...all].map(([elementId, patch]) => ({
          type: 'element.update' as const,
          slideId: slide.id,
          elementId,
          patch,
        })),
        { txId, label },
      );
    },
    [bus, slide],
  );

  const liveIndex = () =>
    indexElements(bus.deck.slides.find((s) => s.id === slide?.id)?.elements ?? []);

  /** Fits every group of the slide to its children, for changes that spanned several groups. */
  const refitSlide = (txId: string) => {
    const now = bus.deck.slides.find((s) => s.id === slide?.id);
    if (now) commit(txId, 'Move', undefined, refitAll(now.elements));
  };

  /** The selected elements that can move: not locked, and not inside another selected one. */
  const movable = (from: ReadonlyMap<string, Located>): Located[] => {
    const ids = new Set(selection.getState().selectedElementIds);
    return [...ids]
      .map((id) => from.get(id))
      .filter((l): l is Located => Boolean(l))
      .filter((l) => !l.locked && !l.path.some((group) => ids.has(group.id)));
  };

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
    if (!g || !('txId' in g)) return;
    if (cancel) {
      bus.rollback(g.txId);
      // The copies of a duplicating drag are gone again; the originals are selected as before.
      if (g.kind === 'move' && g.duplicate && g.moved) {
        selection.getState().selectElements(g.restore);
      }
    } else if (g.kind === 'move' && g.moved && !g.path) refitSlide(g.txId);
    else if (g.kind === 'resize') {
      // A table cannot be shorter than its text: its rows are written as they came out.
      for (const { element } of g.items)
        if (element.type === 'table') fitRows(bus, element.id, g.txId);
    }
  };

  // ---- Hit-testing ----

  /**
   * The element under a point, with the groups around it, outermost first. By position, not by
   * event target: while the Stage holds pointer capture, events are aimed at the Stage itself. A
   * line is hit by its stroke, with some slack, and not by the box around it.
   */
  const pickAt = (clientX: number, clientY: number): string[] => {
    const root = slideRoot.current;
    if (!root || !slide) return [];
    const p = toSlide(clientX, clientY);
    const reach = LINE_HIT_PX / scale;
    let best: Located | undefined;
    for (const located of index.values()) {
      if (!isLine(located) || located.hidden) continue;
      if (distanceToLine(located.element, apply(invert(located.space), p)) > reach) continue;
      if (!best || located.order > best.order) best = located;
    }
    for (const node of document.elementsFromPoint(clientX, clientY)) {
      if (!root.contains(node)) continue;
      const id = node.closest<HTMLElement>('[data-element-id]')?.dataset.elementId;
      const located = id ? index.get(id) : undefined;
      if (!located || isLine(located)) continue;
      if (!best || located.order > best.order) best = located;
      break;
    }
    return best ? [...pathIds(best), best.element.id] : [];
  };

  /** The frame of the image being cropped contains the point. */
  const inCropFrame = (p: Point): boolean => {
    if (!crop) return false;
    const own = apply(invert(elementMatrix(crop.located)), p);
    const { w, h } = crop.image.frame;
    return own.x >= 0 && own.x <= w && own.y >= 0 && own.y <= h;
  };

  /** A slide vector in the axes of the cropped image's frame: rotated with it, not mirrored. */
  const toFrameAxes = (inverse: Matrix, rotation: number, v: Point): Point =>
    rotateVector(applyVector(inverse, v), -rotation);

  // ---- Pointer ----

  const onPointerDown = (e: PointerEvent) => {
    if (!slide || e.button === 2) return;
    // Inside the text editor the pointer is the editor's: caret, selection, drag-select.
    if (isInEditor(e.target)) return;
    container.current?.focus({ preventScroll: true });
    container.current?.setPointerCapture(e.pointerId);
    const p = toSlide(e.clientX, e.clientY);
    if (e.button === 1 || spaceDown) {
      if (zoom !== 'fit') begin({ kind: 'pan', start: { x: e.clientX, y: e.clientY }, pan });
      return;
    }
    if (crop) {
      const name = dataOf(e.target, 'crop-handle');
      if (name || inCropFrame(p)) {
        begin({
          kind: name ? 'crop-resize' : 'crop-pan',
          txId: newId('tx'),
          start: p,
          located: crop.located,
          inverse: invert(crop.located.space),
          view: crop.view,
          handle: name ? HANDLES[name as keyof typeof HANDLES] : { x: 0, y: 0 },
        });
        return;
      }
      // A press anywhere else leaves crop mode, and then acts as it always does.
    }
    if (editingId) selection.getState().stopEditing();

    const pointIndex = dataOf(e.target, 'line-point');
    if (pointIndex !== undefined && single && isLine(single) && !single.locked) {
      begin({
        kind: 'line-point',
        txId: newId('tx'),
        located: single,
        inverse: invert(single.space),
        index: Number(pointIndex),
        snapBoxes: snapCandidates(index, new Set([single.element.id])),
      });
      return;
    }
    const handle = dataOf(e.target, 'handle');
    if (handle && single && !single.locked) {
      const txId = newId('tx');
      const inverse = invert(single.space);
      const { frame: f } = single.element;
      if (handle === 'rotate') {
        begin({
          kind: 'rotate',
          txId,
          start: apply(inverse, p),
          located: single,
          inverse,
          center: { x: f.x + f.w / 2, y: f.y + f.h / 2 },
        });
      } else {
        begin({
          kind: 'resize',
          txId,
          start: p,
          items: [single],
          frame: f,
          rotation: single.element.rotation,
          space: single.space,
          inverse,
          path: single.path,
          handle: HANDLES[handle as keyof typeof HANDLES],
          aspect: keepsAspect(single.element),
          snapBoxes: snapCandidates(index, new Set([single.element.id])),
        });
      }
      return;
    }
    if (handle && together) {
      // The handles of the box around several elements resize them together.
      begin({
        kind: 'resize',
        txId: newId('tx'),
        start: p,
        items: selectedLocated,
        frame: together.element.frame,
        rotation: 0,
        space: together.space,
        inverse: invert(together.space),
        path: together.path,
        handle: HANDLES[handle as keyof typeof HANDLES],
        aspect: false,
        snapBoxes: snapCandidates(index, new Set(selected)),
      });
      return;
    }

    const hit = resolveHit(pickAt(e.clientX, e.clientY), scope);
    const target = hit.id ? index.get(hit.id) : undefined;
    const state = selection.getState();
    const within = sameIds(hit.scope, scope);
    setEntered(hit.scope);
    if (target && !target.locked) {
      const { id } = target.element;
      if (e.shiftKey && within) {
        state.toggleElement(id);
        return;
      }
      const before = state.selectedElementIds;
      if (!before.includes(id)) state.selectElements([id]);
      begin({
        kind: 'move',
        txId: newId('tx'),
        start: p,
        moved: false,
        duplicate: e.altKey,
        restore: selection.getState().selectedElementIds,
        items: [],
        path: undefined,
        snapBoxes: [],
      });
      return;
    }
    const additive = e.shiftKey && within ? state.selectedElementIds : [];
    if (!additive.length) state.clearSelection();
    begin({ kind: 'marquee', start: p, current: p, additive, scope: hit.scope });
  };

  /** The drag passed the threshold: copy the elements if Alt asks for it, and note where they are. */
  const startMove = (g: Extract<Gesture, { kind: 'move' }>, alt: boolean): boolean => {
    if (!slide) return false;
    g.duplicate ||= alt;
    let moving = movable(index);
    if (g.duplicate && moving.length) {
      const commands = duplicateElements(
        bus.deck,
        slide.id,
        moving.map((l) => l.element.id),
      );
      bus.batch(commands, { txId: g.txId, label: 'Duplicate' });
      const copies = commands.map((c) => c.element.id);
      selection.getState().selectElements(copies);
      const live = liveIndex();
      moving = copies.map((id) => live.get(id)).filter((l): l is Located => Boolean(l));
      g.snapBoxes = snapCandidates(live, new Set(copies));
    } else {
      g.snapBoxes = snapCandidates(index, new Set(moving.map((l) => l.element.id)));
    }
    g.items = moving.map((l) => ({
      id: l.element.id,
      frame: l.element.frame,
      inverse: invert(l.space),
      bounds: slideBounds(l),
      path: l.path,
    }));
    g.path = sharedPath(g.items);
    return g.items.length > 0;
  };

  const snapTargets = (boxes: Frame[]) => ({
    boxes,
    slide: deck.size,
    safeMargin: SAFE_MARGIN,
    columns: COLUMNS,
    gutter: GUTTER,
  });

  const onPointerMove = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g) {
      if (crop) {
        setOverCrop(inCropFrame(toSlide(e.clientX, e.clientY)));
        setHover(undefined);
        return;
      }
      const id = resolveHit(pickAt(e.clientX, e.clientY), scope).id;
      setHover(id && !index.get(id)?.locked ? id : undefined);
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
        // What the marquee touches, among the elements of the group it was started in.
        const hits = [...index.values()]
          .filter((l) => !l.locked && !l.hidden && sameIds(pathIds(l), g.scope))
          .filter((l) => intersects(slideBounds(l), box))
          .map((l) => l.element.id);
        selection.getState().selectElements([...new Set([...g.additive, ...hits])]);
        return;
      }
      if (g.kind === 'move') {
        let dx = p.x - g.start.x;
        let dy = p.y - g.start.y;
        if (!g.moved) {
          if (Math.hypot(dx, dy) * scale < DRAG_PX) return;
          g.moved = true;
          if (!startMove(g, alt)) return;
        }
        if (!g.items.length) return;
        // Shift keeps the drag on one axis.
        if (shift) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        const moving = unionBounds(
          g.items.map((i) => ({ ...i.bounds, x: i.bounds.x + dx, y: i.bounds.y + dy })),
        );
        const snap = free
          ? { dx: 0, dy: 0, guides: [] }
          : snapMove(moving, snapTargets(g.snapBoxes), SNAP_PX / scale);
        if (!shift || dx !== 0) dx += snap.dx;
        if (!shift || dy !== 0) dy += snap.dy;
        setGuides(snap.guides);
        const patches = new Map<string, Patch>(
          g.items.map((item) => {
            // The same distance in the axes of the group the element is in.
            const d = applyVector(item.inverse, { x: dx, y: dy });
            return [
              item.id,
              {
                frame: {
                  ...item.frame,
                  x: Math.round(item.frame.x + d.x),
                  y: Math.round(item.frame.y + d.y),
                },
              },
            ];
          }),
        );
        commit(g.txId, g.duplicate ? 'Duplicate' : 'Move', g.path, patches);
        return;
      }
      if (g.kind === 'resize') {
        const keepAspect = g.aspect !== shift;
        const next = resizeFrame(
          g.frame,
          g.rotation,
          g.handle,
          applyVector(g.inverse, { x: p.x - g.start.x, y: p.y - g.start.y }),
          { keepAspect, fromCenter: alt, min: 4 },
        );
        // An upright box in an upright place snaps its moving edges, as a move does.
        let fitted = next;
        const upright = g.rotation === 0 && isTranslation(g.space);
        if (upright && !free && !alt) {
          const { e: ox, f: oy } = g.space;
          const snap = snapResize(
            { ...next, x: next.x + ox, y: next.y + oy },
            g.handle,
            snapTargets(g.snapBoxes),
            SNAP_PX / scale,
            { keepAspect },
          );
          setGuides(snap.guides);
          fitted = { ...snap.frame, x: snap.frame.x - ox, y: snap.frame.y - oy };
        } else setGuides([]);
        const rounded = {
          x: Math.round(fitted.x),
          y: Math.round(fitted.y),
          w: Math.max(1, Math.round(fitted.w)),
          h: Math.max(1, Math.round(fitted.h)),
        };
        // What is in a group is stretched with it, and so are several elements with their box.
        const only = g.items.length === 1 ? g.items[0]?.element : undefined;
        const patches = !only
          ? resizeTogether(
              g.items.map((l) => l.element),
              g.frame,
              rounded,
            )
          : only.type === 'group'
            ? resizeGroup(only, rounded)
            : new Map<string, Patch>([[only.id, { frame: rounded }]]);
        commit(g.txId, 'Resize', g.path, patches);
        return;
      }
      if (g.kind === 'rotate') {
        const { element } = g.located;
        const rotation = rotationAt(
          g.center,
          g.start,
          apply(g.inverse, p),
          element.rotation,
          shift,
        );
        commit(g.txId, 'Rotate', g.located.path, new Map([[element.id, { rotation }]]));
        return;
      }
      if (g.kind === 'line-point') {
        const line = g.located.element;
        const space = g.located.space;
        let to = p;
        // Which way the end may still snap: freely, or only along a constrained direction.
        let snapX = true;
        let snapY = true;
        if (shift) {
          // The angle is measured on the slide, from the neighbouring point.
          const neighbour = linePoints(line)[neighbourIndex(line.points.length, g.index)] as Point;
          const anchor = apply(space, neighbour);
          to = constrainAngle(anchor, p);
          const horizontal = Math.abs(to.y - anchor.y) < 1e-9;
          const vertical = Math.abs(to.x - anchor.x) < 1e-9;
          snapX = horizontal && !vertical;
          snapY = vertical && !horizontal;
        }
        const snap =
          free || (!snapX && !snapY)
            ? { dx: 0, dy: 0, guides: [] }
            : snapMove(
                { x: to.x, y: to.y, w: 0, h: 0 },
                { ...snapTargets(g.snapBoxes), spacing: false },
                SNAP_PX / scale,
              );
        setGuides(snap.guides.filter((guide) => (guide.axis === 'x' ? snapX : snapY)));
        to = { x: to.x + (snapX ? snap.dx : 0), y: to.y + (snapY ? snap.dy : 0) };
        // Whole pixels, unless that would bend a constrained angle.
        if (!shift || snapX || snapY) to = { x: Math.round(to.x), y: Math.round(to.y) };
        const next = moveLinePoint(line, g.index, apply(g.inverse, to));
        commit(g.txId, 'Edit line', g.located.path, new Map([[line.id, next]]));
        return;
      }
      // Crop: the pointer's way in the axes of the frame.
      const delta = toFrameAxes(g.inverse, g.view.rotation, {
        x: p.x - g.start.x,
        y: p.y - g.start.y,
      });
      let next: CropView;
      if (g.kind === 'crop-resize') {
        const { w, h } = g.view.frame;
        // The proportions a preset set are kept; Shift turns that around, as on a resize.
        const locked = heldRatio(cropSession.getState().ratio, g.view.frame);
        const ratio = shift ? (locked ? undefined : w / h) : (locked ?? undefined);
        next = cropResize(g.view, g.handle, delta, { ratio });
      } else next = cropPan(g.view, delta);
      commit(g.txId, 'Crop', g.located.path, new Map([[g.located.element.id, cropPatch(next)]]));
    });
  };

  const onPointerUp = (e: PointerEvent) => {
    if (container.current?.hasPointerCapture(e.pointerId))
      container.current.releasePointerCapture(e.pointerId);
    endGesture(false);
  };

  const canCrop = (image: ImageElement): boolean => {
    const asset = image.assetId ? deck.assets[image.assetId] : undefined;
    return Boolean(asset?.width && asset.height);
  };

  const onDoubleClick = (e: MouseEvent) => {
    if (!slide || crop || isInEditor(e.target)) return;
    // A double-click on a point of the selected line removes it; on its stroke it adds one.
    if (single && isLine(single) && !single.locked) {
      const line = single.element;
      const handle = document
        .elementsFromPoint(e.clientX, e.clientY)
        .map((node) => node.getAttribute('data-line-point'))
        .find((value) => value !== null);
      if (handle !== undefined && handle !== null) {
        const next = removeLinePoint(line, Number(handle));
        if (next) commit(newId('tx'), 'Edit line', single.path, new Map([[line.id, next]]));
        return;
      }
      const at = apply(invert(single.space), toSlide(e.clientX, e.clientY));
      if (distanceToLine(line, at) <= LINE_HIT_PX / scale) {
        const { frame: f, points } = insertLinePoint(line, at);
        commit(newId('tx'), 'Edit line', single.path, new Map([[line.id, { frame: f, points }]]));
        return;
      }
    }
    const chain = pickAt(e.clientX, e.clientY);
    const hit = resolveHit(chain, scope);
    const target = hit.id ? index.get(hit.id) : undefined;
    if (!target || target.locked) return;
    if (tables.onDoubleClick(target, e)) return;
    const element = target.element;
    if (element.type === 'text' || element.type === 'shape') {
      setCaretAt({ x: e.clientX, y: e.clientY });
      selection.getState().startEditing(element.id);
    } else if (element.type === 'image') {
      if (canCrop(element)) selection.getState().startEditing(element.id);
    } else if (element.type === 'html') {
      // The text inside it is edited where it stands (HTM-03); one with scripts is out of reach.
      if (!element.hasScripts) {
        setCaretAt({ x: e.clientX, y: e.clientY });
        selection.getState().startEditing(element.id);
      }
    } else if (element.type === 'group') {
      // One level in: the child under the pointer is selected, the rest of the group stays put.
      const inside = [...hit.scope, element.id];
      const child = index.get(chain[inside.length] ?? '');
      setEntered(inside);
      if (child && !child.locked) selection.getState().selectElements([child.element.id]);
      else selection.getState().clearSelection();
    }
  };

  const wheelBurst = useRef<Burst | null>(null);
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
    if (crop && !gesture.current) {
      // The wheel scales the picture under the frame, around the pointer. Wheel steps can come
      // faster than the Stage renders, and each one builds on the last: so the image is read
      // from the deck as it is now, not as it was drawn.
      const located = liveIndex().get(crop.image.id) ?? crop.located;
      const image = located.element.type === 'image' ? located.element : crop.image;
      const asset = image.assetId ? deck.assets[image.assetId] : undefined;
      const v =
        asset?.width && asset.height
          ? cropView(image, { w: asset.width, h: asset.height })
          : crop.view;
      const at = apply(invert(elementMatrix(located)), toSlide(e.clientX, e.clientY));
      const pivot = positionToOwn(v, {
        x: Math.min(v.frame.w, Math.max(0, at.x)),
        y: Math.min(v.frame.h, Math.max(0, at.y)),
      });
      const level = cropZoomLevel(v, image.fit) * Math.pow(1.0015, -e.deltaY);
      commit(
        burstTx(wheelBurst),
        'Crop',
        located.path,
        new Map([[image.id, cropPatch(cropZoom(v, image.fit, level, pivot))]]),
      );
      return;
    }
    if (zoom === 'fit') return;
    setPan((v) => ({
      x: v.x - (e.shiftKey ? e.deltaY : e.deltaX),
      y: v.y - (e.shiftKey ? 0 : e.deltaY),
    }));
  };

  // ---- Keyboard ----

  const nudge = useRef<Burst | null>(null);
  const onKeyDown = (e: KeyboardEvent) => {
    if (isInEditor(e.target)) return;
    // Inside a table the arrows, Tab, Enter, Delete and Esc are about its cells.
    if (tables.onKeyDown(e)) return;
    // Alt is a modifier of drags here; it must not hand the focus to a menu bar.
    if (e.key === 'Alt') {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter') {
      if (crop) {
        e.preventDefault();
        selection.getState().stopEditing();
        return;
      }
      const target = single && !single.locked ? single.element : undefined;
      if (target?.type === 'text' || target?.type === 'shape') {
        e.preventDefault();
        setCaretAt(undefined);
        selection.getState().startEditing(target.id);
        return;
      }
      if (target?.type === 'image' && canCrop(target)) {
        e.preventDefault();
        selection.getState().startEditing(target.id);
        return;
      }
      if (target?.type === 'html' && !target.hasScripts) {
        e.preventDefault();
        setCaretAt(undefined);
        selection.getState().startEditing(target.id);
        return;
      }
      if (target?.type === 'group' && single) {
        e.preventDefault();
        setEntered([...pathIds(single), target.id]);
        selection
          .getState()
          .selectElements(target.children.filter((c) => !c.locked && !c.hidden).map((c) => c.id));
        return;
      }
    }
    if (e.key === ' ') {
      setSpaceDown(true);
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      // Handled here, so a shortcut of the shell does not act on the same key.
      e.preventDefault();
      if (gesture.current) endGesture(true);
      else if (crop || htmlId) selection.getState().stopEditing();
      else if (scope.length) {
        // Out of the group, one level: the group itself is selected.
        const group = scope[scope.length - 1] as string;
        setEntered(scope.slice(0, -1));
        selection.getState().selectElements([group]);
      } else selection.getState().clearSelection();
      return;
    }
    if (!slide) return;
    const moving = movable(index);
    if ((e.key === 'Delete' || e.key === 'Backspace') && moving.length) {
      const ids = moving.map((l) => l.element.id);
      const path = sharedPath(moving);
      // The groups the elements leave shrink around what stays in them.
      const fitted: ReadonlyMap<string, Placement | null> = path?.length
        ? refitGroups(path, new Map(ids.map((id) => [id, null])))
        : new Map();
      const txId = newId('tx');
      bus.batch(
        [
          { type: 'element.remove' as const, slideId: slide.id, elementIds: ids },
          ...[...fitted].flatMap(([elementId, patch]) =>
            patch ? [{ type: 'element.update' as const, slideId: slide.id, elementId, patch }] : [],
          ),
        ],
        { txId, label: 'Delete' },
      );
      if (!path) refitSlide(txId);
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
      // Everything in the group being worked in, or on the slide.
      selection
        .getState()
        .selectElements(
          [...index.values()]
            .filter((l) => !l.locked && !l.hidden && sameIds(pathIds(l), scope))
            .map((l) => l.element.id),
        );
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
    if (!dir || (!crop && !moving.length)) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const by = { x: dir.x * step, y: dir.y * step };
    // A burst of presses is one undo step (STG-08).
    const txId = burstTx(nudge);
    if (crop) {
      // In crop mode the arrows move the picture under the frame.
      const { located, view: v, image } = crop;
      const delta = toFrameAxes(invert(located.space), v.rotation, by);
      commit(txId, 'Crop', located.path, new Map([[image.id, cropPatch(cropPan(v, delta))]]));
      return;
    }
    const patches = new Map<string, Patch>(
      moving.map((l) => {
        const d = applyVector(invert(l.space), by);
        const f = l.element.frame;
        return [l.element.id, { frame: { ...f, x: tidy(f.x + d.x), y: tidy(f.y + d.y) } }];
      }),
    );
    const path = sharedPath(moving);
    commit(txId, 'Move', path, patches);
    if (!path) refitSlide(txId);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') setSpaceDown(false);
    if (e.key === 'Alt') e.preventDefault();
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
  // The text of an `html` element is edited inside the element's own content (HTM-03).
  const slideId = slide?.id;
  const stopEditing = useCallback(() => selection.getState().stopEditing(), [selection]);
  const htmlEditing = useMemo(
    () =>
      htmlId && slideId
        ? createHtmlTextEditing({ bus, slideId, elementId: htmlId, caretAt, onExit: stopEditing })
        : undefined,
    // The caret is where the double-click that started the editing was: it is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [htmlId, slideId, bus, stopEditing],
  );
  const htmlSlot = useCallback<HtmlSlot>(
    (element) => (element.id === htmlId ? htmlEditing : undefined),
    [htmlId, htmlEditing],
  );

  const stageView: StageView = { origin, scale };
  const active = activeKind;
  const hovered = hover && !selected.includes(hover) ? index.get(hover) : undefined;
  const enteredGroup = scope.length ? index.get(scope[scope.length - 1] as string) : undefined;

  // The size or the angle, next to what a handle is changing.
  const sized = single ?? together;
  let label: string | undefined;
  if (sized && (active === 'resize' || active === 'crop-resize')) {
    label = `${Math.round(sized.element.frame.w)} × ${Math.round(sized.element.frame.h)}`;
  } else if (single && active === 'rotate') label = `${Math.round(single.element.rotation)}°`;

  let overlay: ReactNode = null;
  if (slide) {
    overlay = (
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {enteredGroup ? <Outline located={enteredGroup} view={stageView} entered /> : null}
        {hovered ? (
          isLine(hovered) ? (
            <LineOverlay located={hovered} view={stageView} hover />
          ) : (
            <Outline located={hovered} view={stageView} hover />
          )
        ) : null}
        {selectedLocated.map((located) =>
          located.element.id === croppingId ? null : isLine(located) ? (
            <LineOverlay
              key={located.element.id}
              located={located}
              view={stageView}
              handles={located === single && !located.locked}
            />
          ) : (
            <Outline
              key={located.element.id}
              located={located}
              view={stageView}
              dashed={located.locked}
            />
          ),
        )}
        {together ? (
          <>
            <Outline located={together} view={stageView} dashed />
            <Handles located={together} view={stageView} noRotate />
          </>
        ) : selectedLocated.length > 1 ? (
          <div
            style={{
              ...screenBox(unionBounds(selectedLocated.map((l) => slideBounds(l))), stageView),
              outline: '1px dashed var(--color-ui-accent)',
            }}
          />
        ) : null}
        {tables.overlay}
        {crop ? (
          <CropOverlay
            located={crop.located}
            view={stageView}
            crop={crop.view}
            url={crop.url}
            active={active === 'crop-resize' || active === 'crop-pan'}
          />
        ) : single && !single.locked && editingId !== single.element.id ? (
          <Handles located={single} view={stageView} rotateOnly={isLine(single)} />
        ) : null}
        {sized && label ? (
          <Label bounds={slideBounds(sized)} view={stageView} text={label} />
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
              ...screenBox(marquee, stageView),
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
      data-cropping={croppingId ?? undefined}
      data-entered={scope.length ? scope.join(' ') : undefined}
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
        cursor: spaceDown ? 'grab' : crop && overCrop ? 'move' : undefined,
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
              textSlot={editingId && !croppingId ? textSlot : undefined}
              cellSlot={tables.cellSlot}
              htmlSlot={htmlEditing ? htmlSlot : undefined}
            />
          </div>
        </div>
      ) : null}
      {overlay}
    </div>
  );
}
