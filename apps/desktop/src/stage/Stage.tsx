import {
  duplicateElements,
  newId,
  normalizeAngle,
  plainText,
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
  type TextElement,
} from '@slidr/model';
import { SlideRenderer, type AssetResolver, type HtmlSlot, type TextSlot } from '@slidr/renderer';
import { useKeyboardInUse } from '@slidr/ui';
import { fitRows } from '../table/fit';
import { useTableStage } from '../table/stage';
import { syncGrowHeights } from '../text/actions';
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
import { setStageGesture } from './gesture';
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
  rotateTogether,
  type Patch,
  type Placement,
} from './groups';
import {
  HANDLE_ORDER,
  resetStageKeys,
  setStageCommands,
  stageKeys,
  type StageCommand,
} from './keyboardSession';
import { isCtrlLetter, withAltGraph } from './keys';
import {
  addLinePoint,
  constrainAngle,
  distanceToLine,
  insertLinePoint,
  linePoints,
  moveLinePoint,
  neighbourIndex,
  removeLinePoint,
} from './line';
import {
  AgentMark,
  Beside,
  CropOverlay,
  elementBox,
  Handles,
  Label,
  LineOverlay,
  Outline,
  screenBox,
  toScreen,
  type StageView,
} from './overlays';
import { PlaceholderHint } from './PlaceholderHint';
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
  /**
   * A deck to draw in place of `deck`: a proposed change, shown without making it (STG-10). Only
   * the picture changes: the handles step aside, and the pointer and the keys still work on
   * `deck`.
   */
  preview?: Deck | null;
  /**
   * The host's toolbar for the selection (STG-05). The Stage places it beside what is selected,
   * and puts it away while a gesture is under way and while something is edited in place.
   */
  selectionToolbar?: ReactNode;
  /**
   * The elements the agent is changing right now, to mark on the slide (STG-11); the id of
   * the slide itself marks all of it.
   */
  marked?: readonly string[];
  /**
   * The words an empty placeholder shows where its text will be (ADR-040), by the host, which
   * knows the language. Undefined, or nothing for an element, shows nothing.
   */
  placeholderHint?: (element: TextElement) => string | undefined;
  /**
   * What a screen reader calls the Stage, by the host, which knows the language. The Stage takes
   * its own keys (the arrows move, Tab walks the objects), so it is an application to it.
   */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/** Room above the selection for the rotation handle, which the toolbar must not cover. */
const TOOLBAR_CLEAR_PX = 40;

/** Screen pixels within which an edge snaps or a click counts as a click. */
const SNAP_PX = 6;
const DRAG_PX = 3;
/** How far inside the Stage's edge a dragged selection stops following the pointer, in screen px. */
const STAGE_EDGE_PX = 8;
/** How near the stroke of a line the pointer has to be, in screen pixels. */
const LINE_HIT_PX = 6;
/** Safe margin and column grid the guides offer (STG-04): 5% of the width, 12 columns. */
const SAFE_MARGIN = 96;
const COLUMNS = 12;
const GUTTER = 24;
/** Wheel steps or arrow presses this close together are one undo step. */
const BURST_MS = 800;
/** How far a key moves the view of a zoomed slide, in screen pixels. */
const PAN_STEP_PX = 64;

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
      kind: 'rotate-together';
      txId: string;
      start: Point;
      /** The several elements, as they were when the turn began. */
      items: Located[];
      inverse: Matrix;
      /** The box around them, and its centre, which they turn around. */
      frame: Frame;
      center: Point;
      path: GroupElement[];
    }
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
  preview,
  selectionToolbar,
  marked,
  placeholderHint,
  label: name,
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
  /** While several elements are turned together: the box they started in, and how far it turned. */
  const [turn, setTurn] = useState<{ frame: Frame; angle: number } | undefined>();
  /** The groups the user went into by double-click, outermost first (ARR-01). */
  const [entered, setEntered] = useState<string[]>([]);
  /** Where the keyboard is beyond the selection: a crop handle, a point of a line, the walk. */
  const keys = useStore(stageKeys);
  /**
   * The Stage has the keyboard and the keyboard is what the user works with: it shows (DSN-08).
   * After a press on the slide what is selected says it, and the ring comes with the first key.
   */
  const [focused, setFocused] = useState(false);
  const ring = useKeyboardInUse() && focused;
  const gesture = useRef<Gesture | null>(null);
  // What kind of drag is under way, for rendering; the gesture itself lives in the ref.
  const [activeKind, setActiveKind] = useState<Gesture['kind'] | null>(null);
  /** The slide the gesture under way began on: what it changes is written there. */
  const gestureSlide = useRef<string | null>(null);
  const begin = (g: Gesture) => {
    gesture.current = g;
    gestureSlide.current = currentSlideId;
    setActiveKind(g.kind);
    setStageGesture(true);
  };
  useEffect(() => () => setStageGesture(false), []);
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

  /** A point of the window, moved inside the Stage's visible box if it is outside it. */
  const withinStage = (clientX: number, clientY: number): Point => {
    const rect = container.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    const inset = STAGE_EDGE_PX;
    return {
      x: Math.min(Math.max(clientX, rect.left + inset), rect.right - inset),
      y: Math.min(Math.max(clientY, rect.top + inset), rect.bottom - inset),
    };
  };

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
            // While they are turned, the box they started in turns with them; once the turn
            // ends, the box is the upright one around where they are.
            frame:
              turn?.frame ??
              unionBounds(
                selectedLocated.map((l) => rotatedBounds(l.element.frame, l.element.rotation)),
              ),
            rotation: turn?.angle ?? 0,
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
    // The arrows start on the picture, in every crop.
    if (stageKeys.getState().handle !== null) stageKeys.setState({ handle: null });
    const surface = container.current;
    if (!surface) return;
    // Crop mode is left with Esc and Enter, which the Stage hears only when it has the focus:
    // take it from the button that started crop mode, and from a button that went away with it.
    const active = document.activeElement;
    if (croppingId ? !surface.contains(active) : active === document.body) {
      surface.focus({ preventScroll: true });
    }
  }, [croppingId]);

  // ---- Where the keyboard is beyond the selection (UI-06) ----

  // The point of the selected line that the arrows move, for as long as that line is the selection.
  const pointAt =
    single && isLine(single) && !single.locked && !editingId && keys.point !== null
      ? Math.min(keys.point, single.element.points.length - 1)
      : null;
  // The crop handle that the arrows move; without one they move the picture under the frame.
  const handleAt = crop ? keys.handle : null;
  // The element the selection walk stands on, which Alt+Enter adds to the selection or takes out.
  const walkAt = keys.cursor !== null ? index.get(keys.cursor) : undefined;
  /** The selection is about to change by the walk's own toggle, which leaves the walk where it is. */
  const toggling = useRef(false);
  // What is selected, as one value: the same elements selected again are the same selection,
  // though the store hands out a new list for them.
  const selectedKey = selected.join('\n');
  useEffect(() => {
    const own = toggling.current;
    toggling.current = false;
    const { point, cursor } = stageKeys.getState();
    // A point belongs to the line that was selected, and the walk to the selection it started from.
    if (point !== null || (cursor !== null && !own)) {
      stageKeys.setState({ point: null, cursor: own ? cursor : null });
    }
  }, [selectedKey, currentSlideId]);
  useEffect(() => resetStageKeys, []);

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

  /**
   * The image being cropped as the deck has it now, not as it was drawn: wheel steps and key
   * presses can come faster than the Stage renders, and each one builds on the last.
   */
  const liveCrop = () => {
    if (!crop) return undefined;
    const located = liveIndex().get(crop.image.id) ?? crop.located;
    const image = located.element.type === 'image' ? located.element : crop.image;
    const asset = image.assetId ? deck.assets[image.assetId] : undefined;
    const view =
      asset?.width && asset.height
        ? cropView(image, { w: asset.width, h: asset.height })
        : crop.view;
    return { located, image, view };
  };

  /** Fits every group of the slide to its children, for changes that spanned several groups. */
  const refitSlide = (txId: string, slideId: string | null = currentSlideId) => {
    const now = bus.deck.slides.find((s) => s.id === slideId);
    if (!now) return;
    const fit = refitAll(now.elements);
    if (fit.size === 0) return;
    bus.batch(
      [...fit].map(([elementId, patch]) => ({
        type: 'element.update' as const,
        slideId: now.id,
        elementId,
        patch,
      })),
      { txId, label: 'Move' },
    );
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
    setStageGesture(false);
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
    setGuides([]);
    setMarquee(undefined);
    setTurn(undefined);
    if (!g || !('txId' in g)) return;
    if (cancel) {
      bus.rollback(g.txId);
      // The copies of a duplicating drag are gone again; the originals are selected as before.
      if (g.kind === 'move' && g.duplicate && g.moved) {
        selection.getState().selectElements(g.restore);
      }
    } else if (g.kind === 'move' && g.moved && !g.path) refitSlide(g.txId, gestureSlide.current);
    else if (g.kind === 'resize') {
      // A table cannot be shorter than its text: its rows are written as they came out.
      for (const { element } of g.items)
        if (element.type === 'table') fitRows(bus, element.id, g.txId);
      // And a text box that grows with its text is as tall as the text is in its new width.
      syncGrowHeights(
        bus,
        g.items.map((l) => l.element.id),
        g.txId,
      );
    }
  };

  // The slide went from under a gesture: the Stage was sent to another slide, or the slide was
  // removed. The gesture ends where it is: what it did so far stays, as its one undo step, and
  // no later move of the pointer is written to the slide that is shown now, where the elements
  // it held do not exist.
  useEffect(() => {
    if (gesture.current && gestureSlide.current !== currentSlideId) endGesture(false);
    // Only a change of the slide ends it; `endGesture` is made anew with every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlideId]);

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

  /** The frame of an element contains the point, wherever it is drawn. */
  const inFrameOf = (located: Located, p: Point): boolean => {
    const own = apply(invert(elementMatrix(located)), p);
    const { w, h } = located.element.frame;
    return own.x >= 0 && own.x <= w && own.y >= 0 && own.y <= h;
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
    if (!slide) return;
    // Inside the text editor the pointer is the editor's: caret, selection, drag-select.
    if (isInEditor(e.target)) return;
    if (e.button === 2) {
      // A right click is about what is under it: the host's menu acts on the selection, so an
      // element that is not selected yet becomes the selection, and the empty slide clears it.
      // So does a locked element, which the Stage does not select: its menu is the slide's, and
      // not that of another element that happens to be selected (unless the locked one is
      // itself selected, from the Layers panel: then the menu is its own, with "Unlock").
      const hit = resolveHit(pickAt(e.clientX, e.clientY), scope);
      const target = hit.id ? index.get(hit.id) : undefined;
      const state = selection.getState();
      if (target && state.selectedElementIds.includes(target.element.id)) return;
      if (editingId) state.stopEditing();
      setEntered(hit.scope);
      if (target && !target.locked) state.selectElements([target.element.id]);
      else state.clearSelection();
      return;
    }
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
    if (handle === 'rotate' && together) {
      // The rotation handle of the box around several elements turns them together.
      const f = together.element.frame;
      const inverse = invert(together.space);
      begin({
        kind: 'rotate-together',
        txId: newId('tx'),
        start: apply(inverse, p),
        items: selectedLocated,
        inverse,
        frame: f,
        center: { x: f.x + f.w / 2, y: f.y + f.h / 2 },
        path: together.path,
      });
      setTurn({ frame: f, angle: 0 });
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
    // The slide draws nothing outside itself, so the part of an element that is off the slide
    // cannot be picked. A selected one is still taken by it there: one dragged to the edge of the
    // Stage is grabbed again (ADR-066). On the slide, picking stays the drawing's own (a line by
    // its stroke, not by the box around it).
    const offSlide = p.x < 0 || p.y < 0 || p.x > deck.size.w || p.y > deck.size.h;
    const outside =
      hit.id || !offSlide
        ? undefined
        : selectedLocated.find((l) => !l.locked && !l.hidden && inFrameOf(l, p));
    const target = outside ?? (hit.id ? index.get(hit.id) : undefined);
    // A selected element is in the group the Stage is working in.
    const hitScope = outside ? [...scope] : hit.scope;
    const state = selection.getState();
    const within = sameIds(hitScope, scope);
    setEntered(hitScope);
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
    begin({ kind: 'marquee', start: p, current: p, additive, scope: hitScope });
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
    // What is moved follows the pointer as far as the edge of the Stage, and no further: past it,
    // what was grabbed would land under the panels, drawn out of view and out of reach (ADR-066).
    const at =
      g.kind === 'move' ? withinStage(e.clientX, e.clientY) : { x: e.clientX, y: e.clientY };
    const p = toSlide(at.x, at.y);
    const shift = e.shiftKey;
    const alt = e.altKey;
    const free = e.ctrlKey || e.metaKey;
    schedule(() => {
      if (gesture.current !== g || !slide || slide.id !== gestureSlide.current) return;
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
      if (g.kind === 'rotate-together') {
        const angle = rotationAt(g.center, g.start, apply(g.inverse, p), 0, shift);
        setTurn({ frame: g.frame, angle });
        const elements = g.items.map((l) => l.element);
        commit(g.txId, 'Rotate', g.path, rotateTogether(elements, g.center, angle));
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
    const cropped = gesture.current ? undefined : liveCrop();
    if (cropped) {
      // The wheel scales the picture under the frame, around the pointer.
      const { located, image, view: v } = cropped;
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
  /**
   * The turn of several elements that the keys are in the middle of: the elements as the first
   * press found them, the centre they turn around, how far they have turned, and where the last
   * press left them.
   */
  const keyTurn = useRef<{
    start: SlideElement[];
    center: Point;
    angle: number;
    left: Map<string, { x: number; y: number; rotation: number }>;
  } | null>(null);

  /**
   * Turning and sizing with the keyboard (UI-06), for what the handles do with the pointer. Alt
   * with a side arrow turns by a degree, with Shift by 15; Ctrl with an arrow moves the end and
   * the bottom edge by a pixel, with Shift by ten. Several elements of one parent go together,
   * as with the handles of the box around them. A burst of presses is one undo step.
   */
  const keyTransform = (moving: Located[], dir: Point, what: 'rotate' | 'resize', far: boolean) => {
    const one = moving.length === 1 ? moving[0] : undefined;
    const path = sharedPath(moving);
    if (!one && !path) return;
    const elements = moving.map((l) => l.element);
    const box = unionBounds(elements.map((el) => rotatedBounds(el.frame, el.rotation)));
    const txId = burstTx(nudge);
    if (what === 'rotate') {
      if (dir.x === 0) return;
      const by = dir.x * (far ? 15 : 1);
      if (one) {
        const rotation = tidy(normalizeAngle(one.element.rotation + by));
        commit(txId, 'Rotate', path, new Map<string, Patch>([[one.element.id, { rotation }]]));
        return;
      }
      // Several elements turn around the centre of the box around them. That box changes as
      // they turn, so its centre is taken once: for as long as the elements are where the last
      // press left them, the next press turns what the first one found by the whole angle so
      // far, around the same centre, as the handle does through a drag. Turning back by the
      // same presses then brings every element back to where it was.
      // The elements as the deck has them now: presses can come faster than the Stage draws.
      const live = liveIndex();
      const now = elements.map((el) => live.get(el.id)?.element ?? el);
      const last = keyTurn.current;
      const going =
        last !== null &&
        last.start.length === now.length &&
        now.every((el) => {
          const left = last.left.get(el.id);
          return (
            left !== undefined &&
            left.rotation === el.rotation &&
            left.x === el.frame.x &&
            left.y === el.frame.y
          );
        });
      const around = unionBounds(now.map((el) => rotatedBounds(el.frame, el.rotation)));
      const turn = going
        ? { start: last.start, center: last.center, angle: last.angle + by }
        : {
            start: now,
            center: { x: around.x + around.w / 2, y: around.y + around.h / 2 },
            angle: by,
          };
      const turned = rotateTogether(turn.start, turn.center, turn.angle);
      commit(txId, 'Rotate', path, turned);
      // Inside a group the fit of the group to its children moves all of them by one distance
      // in the group's axes: what the turn is measured from moves with them.
      const after = liveIndex();
      const head = turn.start[0];
      const wanted = head ? turned.get(head.id)?.frame : undefined;
      const written = head ? after.get(head.id)?.element.frame : undefined;
      const dx = wanted && written ? written.x - wanted.x : 0;
      const dy = wanted && written ? written.y - wanted.y : 0;
      keyTurn.current = {
        start:
          dx === 0 && dy === 0
            ? turn.start
            : turn.start.map((el) => ({
                ...el,
                frame: { ...el.frame, x: el.frame.x + dx, y: el.frame.y + dy },
              })),
        center: { x: turn.center.x + dx, y: turn.center.y + dy },
        angle: turn.angle,
        left: new Map(
          turn.start.flatMap((el) => {
            const at = after.get(el.id)?.element;
            return at ? [[el.id, { x: at.frame.x, y: at.frame.y, rotation: at.rotation }]] : [];
          }),
        ),
      };
      return;
    }
    const step = far ? 10 : 1;
    const by = { x: dir.x * step, y: dir.y * step };
    // A text box that grows with its text follows its new width, as after a drag of a handle.
    const grown = () =>
      syncGrowHeights(
        bus,
        elements.map((el) => el.id),
        txId,
      );
    if (!one) {
      const next = { ...box, w: Math.max(4, box.w + by.x), h: Math.max(4, box.h + by.y) };
      commit(txId, 'Resize', path, resizeTogether(elements, box, next));
      grown();
      return;
    }
    const { element } = one;
    // A line is shaped by its points, not by its box.
    if (element.type === 'line') return;
    const keepAspect = keepsAspect(element);
    const handle = keepAspect ? HANDLES.se : by.x !== 0 ? HANDLES.e : HANDLES.s;
    // The key moves an edge along the element's own axes, wherever it is turned.
    const fitted = resizeFrame(
      element.frame,
      element.rotation,
      handle,
      rotateVector(by, element.rotation),
      { keepAspect, min: 4 },
    );
    const frame = {
      x: tidy(fitted.x),
      y: tidy(fitted.y),
      w: Math.max(1, Math.round(fitted.w)),
      h: Math.max(1, Math.round(fitted.h)),
    };
    const patches =
      element.type === 'group'
        ? resizeGroup(element, frame)
        : new Map<string, Patch>([[element.id, { frame }]]);
    commit(txId, 'Resize', one.path, patches);
    // A table cannot be shorter than its text: its rows are written as they came out.
    if (element.type === 'table') fitRows(bus, element.id, txId);
    grown();
  };

  /** The elements Tab goes through: those of the group being worked in, bottom to top. */
  const walkOrder = () =>
    [...index.values()]
      .filter((l) => !l.locked && !l.hidden && sameIds(pathIds(l), scope))
      .sort((a, b) => a.order - b.order);

  const onKeyDown = (e: KeyboardEvent) => {
    if (isInEditor(e.target)) return;
    // So is the text of an `html` element that is edited where it stands: the keys it lets out
    // are for the app's shortcuts (Ctrl+S), not for the Stage (Ctrl with an arrow would size it).
    if (htmlId && dataOf(e.target, 'element-id') === htmlId) return;
    // Inside a table the arrows, Tab, Enter, Delete and Esc are about its cells.
    if (tables.onKeyDown(e)) return;
    // Alt is a modifier of drags here; it must not hand the focus to a menu bar.
    if (e.key === 'Alt') {
      e.preventDefault();
      return;
    }
    // Enter with Alt is not the way into an element: it is the selection walk's key.
    if (e.key === 'Enter' && !e.altKey) {
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
      // Out of the points of a line, or off the selection walk: the selection itself stays.
      else if (pointAt !== null) stageKeys.setState({ point: null });
      else if (walkAt) stageKeys.setState({ cursor: null });
      else if (scope.length) {
        // Out of the group, one level: the group itself is selected.
        const group = scope[scope.length - 1] as string;
        setEntered(scope.slice(0, -1));
        selection.getState().selectElements([group]);
      } else selection.getState().clearSelection();
      return;
    }
    if (!slide) return;
    // Among the crop handles and among the points of a line Tab goes from one to the next, and
    // Delete takes a point out: those are shortcuts of the registry (`register.tsx`), which hears
    // the key after this handler has let it pass.
    const inParts = Boolean(crop) || pointAt !== null;
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey && !inParts && !htmlId) {
      // Tab walks the elements of the group being worked in, bottom to top, and Shift+Tab walks
      // back (UI-06). Past either end the key is the browser's again: the selection is cleared
      // and the focus moves on, so the Stage is no trap for the keyboard.
      const walk = walkOrder();
      const at = walk.findIndex((l) => l.element.id === selected[0]);
      const to = selected.length === 0 ? (e.shiftKey ? -1 : 0) : at + (e.shiftKey ? -1 : 1);
      const next = walk[to];
      if (next) {
        e.preventDefault();
        selection.getState().selectElements([next.element.id]);
      } else if (selected.length) selection.getState().clearSelection();
      return;
    }
    const moving = movable(index);
    if ((e.key === 'Delete' || e.key === 'Backspace') && moving.length && pointAt === null) {
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
    if (isCtrlLetter(e, 'a')) {
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
    if (!dir) return;
    // Two families of arrows are shortcuts of the registry, and pass through here untouched: Ctrl
    // and Alt together move the view of a zoomed slide, and Alt with Up or Down walks the
    // selection. AltGr, which Windows reports as Ctrl and Alt, stays what Alt alone is.
    if (!withAltGraph(e) && e.altKey && (e.ctrlKey || (dir.x === 0 && !crop))) return;
    if (!crop && !moving.length) return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const by = { x: dir.x * step, y: dir.y * step };
    const plain = !e.altKey && !e.ctrlKey && !e.metaKey;
    if (pointAt !== null && plain && single) {
      // Among the points of a line the arrows move the point the keyboard is on; the other
      // points stay where they are on the slide, as when a point is dragged (SHP-05).
      const located = liveIndex().get(single.element.id);
      if (!located || !isLine(located)) return;
      const line = located.element;
      const at = linePoints(line)[Math.min(pointAt, line.points.length - 1)];
      if (!at) return;
      const to = applyVector(invert(located.space), by);
      const next = moveLinePoint(line, pointAt, { x: at.x + to.x, y: at.y + to.y });
      commit(burstTx(nudge), 'Edit line', located.path, new Map([[line.id, next]]));
      return;
    }
    if (!crop && !plain) {
      // With Alt the side arrows turn the selection, with Ctrl the arrows size it (UI-06).
      keyTransform(moving, dir, e.altKey ? 'rotate' : 'resize', e.shiftKey);
      return;
    }
    // A burst of presses is one undo step (STG-08).
    const txId = burstTx(nudge);
    const cropped = liveCrop();
    if (cropped) {
      // In crop mode the arrows move the picture under the frame, or the crop handle that Tab
      // went to: that handle goes the way the arrow points on the slide, as if it were dragged.
      const { located, view: v, image } = cropped;
      const delta = toFrameAxes(invert(located.space), v.rotation, by);
      const ratio = heldRatio(cropSession.getState().ratio, v.frame) ?? undefined;
      const next = handleAt
        ? cropResize(v, HANDLES[handleAt], delta, { ratio })
        : cropPan(v, delta);
      commit(txId, 'Crop', located.path, new Map([[image.id, cropPatch(next)]]));
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

  /**
   * What the shortcuts of the registry ask of the Stage (UI-06): the keys that are new with the
   * keyboard pass, which the user can change like any registered shortcut. They are the Stage's
   * only while it has the keyboard itself: not a tool beside the selection, and not the text
   * that is edited on the slide.
   */
  const runCommand = (command: StageCommand): boolean => {
    const surface = container.current;
    if (!slide || !surface) return false;
    const line = single && isLine(single) && !single.locked && !editingId ? single : undefined;
    if (command.type === 'points') {
      // Into the points of the line, or out of them again. The key is the Stage's only while the
      // Stage has the keyboard: Enter on a tool of row B presses that tool, whatever is selected.
      // The menu asks for the points too, and had the keyboard itself: the Stage takes it then.
      if (!command.fromMenu && document.activeElement !== surface) return false;
      if (pointAt !== null) stageKeys.setState({ point: null });
      else if (line) stageKeys.setState({ point: 0, cursor: null });
      else return false;
      surface.focus({ preventScroll: true });
      return true;
    }
    if (document.activeElement !== surface) return false;
    switch (command.type) {
      case 'pan': {
        // A fitted slide is all in view: there is nowhere to go.
        if (zoom === 'fit') return false;
        setPan((p) => ({
          x: p.x - command.dir.x * PAN_STEP_PX,
          y: p.y - command.dir.y * PAN_STEP_PX,
        }));
        return true;
      }
      case 'walk': {
        // From one element to the next without selecting it, round and round: what Tab walks.
        const walk = editingId ? [] : walkOrder();
        if (!walk.length) return false;
        const from = walkAt?.element.id ?? selected.at(-1);
        const at = walk.findIndex((l) => l.element.id === from);
        const to =
          at < 0
            ? command.step > 0
              ? 0
              : walk.length - 1
            : (at + command.step + walk.length) % walk.length;
        stageKeys.setState({ cursor: walk[to]?.element.id ?? null, point: null });
        return true;
      }
      case 'toggle': {
        if (!walkAt || editingId) return false;
        toggling.current = true;
        selection.getState().toggleElement(walkAt.element.id);
        return true;
      }
      case 'part': {
        if (crop) {
          // The picture itself, then the eight handles, clockwise from the top left corner.
          const order = [null, ...HANDLE_ORDER];
          const to = order.indexOf(handleAt) + command.step;
          // Past either end the key is the browser's again, as it is past the last element of
          // the slide: the keyboard goes on to what is beside the Stage, and back from the
          // picture that is row B, where the tools of the crop are. The crop itself goes on,
          // and the keyboard finds the picture when it comes back.
          if (to < 0 || to >= order.length) {
            if (handleAt !== null) stageKeys.setState({ handle: null });
            return false;
          }
          stageKeys.setState({ handle: order[to] ?? null });
          return true;
        }
        if (pointAt === null || !line) return false;
        const next = pointAt + command.step;
        // The same at the ends of a line: the keyboard leaves the points and the Stage, and the
        // line stays selected, so back from its first point are its own tools in row B.
        if (next < 0 || next >= line.element.points.length) {
          stageKeys.setState({ point: null });
          return false;
        }
        stageKeys.setState({ point: next });
        return true;
      }
      case 'point.add': {
        if (pointAt === null || !line) return false;
        const { index: at, ...patch } = addLinePoint(line.element, pointAt);
        commit(newId('tx'), 'Edit line', line.path, new Map([[line.element.id, patch]]));
        stageKeys.setState({ point: at });
        return true;
      }
      case 'point.remove': {
        if (pointAt === null || !line) return false;
        // A line keeps its two ends: the key then does nothing, and does not delete the line.
        const next = removeLinePoint(line.element, pointAt);
        if (next) {
          commit(newId('tx'), 'Edit line', line.path, new Map([[line.element.id, next]]));
          stageKeys.setState({ point: Math.min(pointAt, next.points.length - 1) });
        }
        return true;
      }
    }
  };
  useEffect(() => {
    setStageCommands(runCommand);
    return () => setStageCommands(null);
  });

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
  // The deck's footer, when the slide's layout draws one (SLD-04). It shows wherever the slide's
  // own footer is empty, in the seat of that empty footer: the words that stand there are the
  // deck's, and a hint would be drawn over them.
  const layoutFooter = useMemo(
    () =>
      deck.layouts
        .find((layout) => layout.id === slide?.layoutId)
        ?.decorations.some((decoration) => decoration.role === 'footer' && !decoration.hidden) ??
      false,
    [deck.layouts, slide?.layoutId],
  );
  // The empty placeholders of the slide and what each of them says (ADR-040). As one string,
  // so that the map below changes only when a hint does, and not with every move of an element.
  const hinted = useMemo(() => {
    if (!placeholderHint) return '';
    const entries: string[] = [];
    for (const { element, hidden } of index.values()) {
      if (element.type !== 'text' || !element.role || hidden) continue;
      if (plainText(element.content) !== '') continue;
      if (element.role === 'footer' && layoutFooter) continue;
      const hint = placeholderHint(element);
      if (hint) entries.push(`${element.id}\n${hint}`);
    }
    return entries.join('\n\n');
  }, [index, placeholderHint, layoutFooter]);
  const hints = useMemo(
    () =>
      new Map(
        hinted
          .split('\n\n')
          .filter(Boolean)
          .map((entry) => entry.split('\n') as [string, string]),
      ),
    [hinted],
  );
  const deckDir = deck.meta.dir;
  const textSlot = useCallback<TextSlot>(
    (element) => {
      if (element.id === editingId && slide) {
        return (
          <TextEditor
            bus={bus}
            slideId={slide.id}
            element={element}
            theme={deck.theme}
            caretAt={caretAt}
            onExit={exitEditing}
          />
        );
      }
      const hint = hints.get(element.id);
      return hint && element.type === 'text' ? (
        <PlaceholderHint element={element} theme={deck.theme} dir={deckDir} text={hint} />
      ) : undefined;
    },
    [editingId, slide, bus, deck.theme, deckDir, caretAt, exitEditing, hints],
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

  // The preview layer (STG-10): the slide as a proposed change would leave it.
  const previewSlide = preview?.slides.find((s) => s.id === slide?.id);
  const previewing = Boolean(preview && previewSlide);

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
  // Several elements show how far they turned, to either side.
  else if (turn && active === 'rotate-together')
    label = `${Math.round(turn.angle > 180 ? turn.angle - 360 : turn.angle)}°`;

  let overlay: ReactNode = null;
  // The handles are where the real elements are, which a preview may have moved or replaced.
  if (slide && !previewing) {
    overlay = (
      <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {[...hints.keys()].map((id) => {
          const located = index.get(id);
          return located && !selected.includes(id) && id !== editingId ? (
            <Outline key={id} located={located} view={stageView} placeholder />
          ) : null;
        })}
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
              point={located === single ? pointAt : null}
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
            <Handles located={together} view={stageView} />
          </>
        ) : selectedLocated.length > 1 ? (
          <div
            style={{
              ...screenBox(unionBounds(selectedLocated.map((l) => slideBounds(l))), stageView),
              outline: '1px dashed var(--color-ui-accent)',
            }}
          />
        ) : null}
        {walkAt && !walkAt.hidden ? <Outline located={walkAt} view={stageView} walk /> : null}
        {marked?.map((id) => {
          // A slide the agent built or rebuilt is marked as a whole.
          if (id === slide.id) {
            const whole = { x: 0, y: 0, w: deck.size.w, h: deck.size.h };
            return <AgentMark key={id} id={id} box={screenBox(whole, stageView)} />;
          }
          const located = index.get(id);
          return located && !located.hidden ? (
            <AgentMark key={id} id={id} box={elementBox(located, stageView)} />
          ) : null;
        })}
        {tables.overlay}
        {crop ? (
          <CropOverlay
            located={crop.located}
            view={stageView}
            crop={crop.view}
            url={crop.url}
            active={active === 'crop-resize' || active === 'crop-pan'}
            handle={handleAt}
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

  // Not part of the overlay: the overlay is hidden from assistive technology, and this is not.
  const toolbar =
    selectionToolbar &&
    slide &&
    !previewing &&
    selectedLocated.length > 0 &&
    !editingId &&
    !active ? (
      <Beside
        box={toScreen(unionBounds(selectedLocated.map((l) => slideBounds(l))), stageView)}
        stage={size}
        clear={selectedLocated.every((l) => l.locked) ? 0 : TOOLBAR_CLEAR_PX}
        onEnter={() => setHover(undefined)}
      >
        {selectionToolbar}
      </Beside>
    ) : null;

  return (
    <div
      ref={container}
      role="application"
      aria-label={name}
      data-testid="stage-surface"
      data-cropping={croppingId ?? undefined}
      data-entered={scope.length ? scope.join(' ') : undefined}
      data-previewing={previewing || undefined}
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
      onFocus={(e) => {
        if (e.target === e.currentTarget) setFocused(true);
      }}
      onBlur={(e) => {
        if (e.target === e.currentTarget) setFocused(false);
      }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        outline: ring ? '2px solid var(--color-ui-focus)' : 'none',
        outlineOffset: -2,
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
            {preview && previewSlide ? (
              <SlideRenderer
                deck={preview}
                slide={previewSlide}
                mode="edit"
                resolveAsset={resolveAsset}
              />
            ) : (
              <SlideRenderer
                deck={deck}
                slide={slide}
                mode="edit"
                resolveAsset={resolveAsset}
                textSlot={(editingId && !croppingId) || hints.size > 0 ? textSlot : undefined}
                cellSlot={tables.cellSlot}
                htmlSlot={htmlEditing ? htmlSlot : undefined}
              />
            )}
          </div>
        </div>
      ) : null}
      {overlay}
      {toolbar}
    </div>
  );
}
