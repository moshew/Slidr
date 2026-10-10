import type { Frame, LineElement, Point } from '@slidr/model';
import { linePath } from '@slidr/renderer';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import type { CropView } from './crop';
import { HANDLES, type Handle } from './geometry';
import type { HandleName } from './keyboardSession';
import {
  apply,
  applyVector,
  elementMatrix,
  screenTransform,
  type Located,
  type Matrix,
} from './space';

/**
 * What the Stage draws over the slide (RND-02): outlines, handles, line points and the crop frame.
 * All of it is in screen pixels, placed by the element's own map to the slide, so it is as crisp at
 * 10% as at 400%, and it follows an element inside rotated and mirrored groups.
 */

/** Where the slide is on the Stage: its corner in screen pixels, and the zoom. */
export interface StageView {
  origin: Point;
  scale: number;
}

/** A corner handle is a dot; the handle of an edge is a short bar that lies along the edge. */
const DOT_PX = 12;
const BAR_PX = 16;
const BAR_THICK_PX = 6;
/** The shortest bar that is still drawn, and the room kept between a bar and the corner dots. */
const BAR_MIN_PX = 8;
const BAR_GAP_PX = 4;
/** How far past what is drawn a handle still takes the pointer, on every side. */
const GRIP_PX = 4;
const ROTATE_OFFSET_PX = 24;
const ACCENT = 'var(--color-ui-accent)';
const PANEL = 'var(--color-ui-panel)';
/**
 * The handles lie on the slide, over whatever is drawn there, and not on the app's panels: they
 * are white in either theme of the app, with a hairline and a soft shadow that set them off from
 * a light picture as from a dark one.
 */
const HANDLE_FILL = '#fff';
const HANDLE_EDGE = '0 0 0 1px rgb(36 48 62 / 0.28), 0 1px 4px rgb(36 48 62 / 0.3)';
/** The ring around what the keyboard is on: a crop handle, a point of a line, the selection walk. */
const FOCUS = 'var(--color-ui-focus)';
const FOCUS_RING = `0 0 0 2px ${PANEL}, 0 0 0 4px ${FOCUS}`;

/**
 * How far the editing frame stands from the sides of a text box. The caret at the start of a
 * line needs horizontal room; vertically the frame keeps the text box's own height.
 */
const TYPING_PAD_PX = 6;

/**
 * A box of the element's size in screen pixels, laid over the element; `padX` and `padY` screen
 * pixels larger on their respective sides, in the element's own axes.
 */
function boxStyle(
  located: Located,
  view: StageView,
  flips = false,
  padX = 0,
  padY = padX,
): CSSProperties {
  const { w, h } = located.element.frame;
  const placed = screenTransform(elementMatrix(located, flips), view.origin, view.scale);
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: w * view.scale + 2 * padX,
    height: h * view.scale + 2 * padY,
    transformOrigin: '0 0',
    transform: padX || padY ? `${placed} translate(${-padX}px, ${-padY}px)` : placed,
  };
}

/** The box of an element on the Stage, for a mark that is not one of the Stage's own outlines. */
export function elementBox(located: Located, view: StageView): CSSProperties {
  return boxStyle(located, view);
}

/** A slide-pixel box in the screen pixels of the Stage. */
export function toScreen(f: Frame, view: StageView): Frame {
  return {
    x: view.origin.x + f.x * view.scale,
    y: view.origin.y + f.y * view.scale,
    w: f.w * view.scale,
    h: f.h * view.scale,
  };
}

/** A slide-pixel box as a screen-pixel one. */
export function screenBox(f: Frame, view: StageView): CSSProperties {
  const { x, y, w, h } = toScreen(f, view);
  return { position: 'absolute', left: x, top: y, width: w, height: h };
}

const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const;
const ROTATE_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M19.5 9a8 8 0 1 0 .3 5.5M19.5 9V3.5M19.5 9H14" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 9a8 8 0 1 0 .3 5.5M19.5 9V3.5M19.5 9H14" fill="none" stroke="#24303e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
)}") 12 12, grab`;

/** The resize cursor of a handle, by where the handle points on the screen. */
function handleCursor(handle: Handle, m: Matrix): string {
  const v = applyVector(m, { x: handle.x, y: handle.y });
  const angle = (Math.atan2(v.y, v.x) * 180) / Math.PI + 90;
  const index = Math.round((((angle % 180) + 180) % 180) / 45) % 4;
  return CURSORS[index] ?? 'move';
}

export function Outline({
  located,
  view,
  hover,
  dashed,
  entered,
  hoveredGroup,
  placeholder,
  walk,
  typing,
}: {
  located: Located;
  view: StageView;
  hover?: boolean;
  dashed?: boolean;
  /** A text box being edited: keep side room for its caret, with the normal box height. */
  typing?: boolean;
  /**
   * Where the selection walk stands (UI-06): an element the keyboard is on that may not be
   * selected. A dotted ring outside the element, clear of the outline of a selected one.
   */
  walk?: boolean;
  /** The group the user is working inside: a quieter frame than a selection. */
  entered?: boolean;
  /** The group a directly hovered child belongs to, before the user enters it. */
  hoveredGroup?: boolean;
  /** An empty placeholder: the quietest frame, there so that the empty box can be seen. */
  placeholder?: boolean;
}) {
  const { element } = located;
  const quiet = entered || hoveredGroup || placeholder;
  const mark = entered
    ? { 'data-entered-group': element.id }
    : hoveredGroup
      ? { 'data-hovered-group': element.id }
      : placeholder
        ? { 'data-placeholder': element.id }
        : walk
          ? { 'data-walk': element.id }
          : { 'data-outline': element.id };
  return (
    <div
      {...mark}
      style={{
        ...boxStyle(located, view, false, typing ? TYPING_PAD_PX : 0, 0),
        outline: walk
          ? `2px dotted ${FOCUS}`
          : `${hover || quiet ? 1 : 1.5}px ${dashed || quiet ? 'dashed' : 'solid'} ${ACCENT}`,
        outlineOffset: walk ? 4 : undefined,
        opacity: placeholder ? 0.45 : entered || hoveredGroup ? 0.7 : undefined,
      }}
    />
  );
}

/**
 * The mark of an element the agent is changing right now (STG-11, SPEC 4.0 rule 6): a frame
 * in the accent with a soft halo, that breathes. Where reduced motion is asked for, it stands
 * still. It takes no pointer: the element under it is still the one that is clicked.
 */
export function AgentMark({
  id,
  box,
}: {
  /** The element, or the slide when the agent built or rebuilt all of it. */
  id: string;
  /** Where it is on the Stage: see `elementBox` and `screenBox`. */
  box: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const breath = el.animate([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], {
      duration: 1400,
      iterations: Infinity,
      easing: 'ease-in-out',
    });
    return () => breath.cancel();
  }, []);
  return (
    <div
      ref={ref}
      data-agent-mark={id}
      style={{
        ...box,
        borderRadius: 4,
        outline: `2px solid ${ACCENT}`,
        outlineOffset: 3,
        boxShadow: `0 0 16px 5px color-mix(in srgb, ${ACCENT} 45%, transparent)`,
      }}
    />
  );
}

/**
 * What is drawn of a resize handle, in screen pixels: a dot on a corner, a bar along an edge. The
 * bar is shorter on a short edge, and on an edge with no room for it between the dots of the
 * corners there is none.
 */
export function handleSize(
  handle: Handle,
  sw: number,
  sh: number,
): { w: number; h: number } | undefined {
  if (handle.x !== 0 && handle.y !== 0) return { w: DOT_PX, h: DOT_PX };
  const along = handle.x === 0 ? sw : sh;
  const long = Math.min(BAR_PX, along - DOT_PX - 2 * BAR_GAP_PX);
  if (long < BAR_MIN_PX) return undefined;
  return handle.x === 0 ? { w: long, h: BAR_THICK_PX } : { w: BAR_THICK_PX, h: long };
}

/** The eight resize handles and the rotation handle of one element. */
export function Handles({
  located,
  view,
  rotateOnly,
  noRotate,
  held,
  typing,
}: {
  located: Located;
  view: StageView;
  /** A line has handles on its points instead of on its box. */
  rotateOnly?: boolean;
  /** Several elements together are resized, not turned. */
  noRotate?: boolean;
  /** The handle that is being dragged: it stays lit though the pointer has left it. */
  held?: string | null;
  /**
   * A text box whose text is typed in. The handles stand on its frame, with room at the sides of
   * the text, and the edge of that frame takes the pointer and moves the box (`data-move-frame`): a
   * press on the text itself is the editor's, so the box cannot be taken by what is in it.
   */
  typing?: boolean;
}) {
  const { w, h } = located.element.frame;
  const padX = typing ? TYPING_PAD_PX : 0;
  const sw = w * view.scale + 2 * padX;
  const sh = h * view.scale;
  const matrix = elementMatrix(located);
  /** The handle the pointer is over. */
  const [over, setOver] = useState<string | null>(null);
  const lit = (name: string) => (held ? held === name : over === name);
  const enter = (name: string) => ({
    onPointerEnter: () => setOver(name),
    onPointerLeave: () => setOver((at) => (at === name ? null : at)),
  });
  const handle = (name: keyof typeof HANDLES): ReactNode => {
    const hd = HANDLES[name];
    const drawn = handleSize(hd, sw, sh);
    if (!drawn) return null;
    const gw = drawn.w + 2 * GRIP_PX;
    const gh = drawn.h + 2 * GRIP_PX;
    return (
      <div
        key={name}
        data-handle={name}
        data-lit={lit(name) || undefined}
        {...enter(name)}
        style={{
          position: 'absolute',
          left: ((hd.x + 1) / 2) * sw - gw / 2,
          top: ((hd.y + 1) / 2) * sh - gh / 2,
          width: gw,
          height: gh,
          pointerEvents: 'auto',
          cursor: handleCursor(hd, matrix),
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: GRIP_PX,
            top: GRIP_PX,
            width: drawn.w,
            height: drawn.h,
            borderRadius: Math.min(drawn.w, drawn.h) / 2,
            background: lit(name) ? ACCENT : HANDLE_FILL,
            boxShadow: HANDLE_EDGE,
          }}
        />
      </div>
    );
  };
  // The four sides of the frame, from the edge of the text out to a little past the line.
  const sides: CSSProperties[] = typing
    ? [
        { left: -GRIP_PX, top: -GRIP_PX, width: sw + 2 * GRIP_PX, height: GRIP_PX },
        { left: -GRIP_PX, top: sh, width: sw + 2 * GRIP_PX, height: GRIP_PX },
        { left: -GRIP_PX, top: 0, width: padX + GRIP_PX, height: sh },
        { left: sw - padX, top: 0, width: padX + GRIP_PX, height: sh },
      ]
    : [];
  return (
    <div style={boxStyle(located, view, false, padX, 0)}>
      {sides.map((side, i) => (
        <div
          key={i}
          data-move-frame
          style={{ position: 'absolute', ...side, pointerEvents: 'auto', cursor: 'move' }}
        />
      ))}
      {rotateOnly ? null : (Object.keys(HANDLES) as (keyof typeof HANDLES)[]).map(handle)}
      {noRotate ? null : (
        <div
          data-handle="rotate"
          data-lit={lit('rotate') || undefined}
          {...enter('rotate')}
          style={{
            position: 'absolute',
            left: sw / 2 - 5,
            top: -ROTATE_OFFSET_PX - 5,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: lit('rotate') ? ACCENT : HANDLE_FILL,
            boxShadow: HANDLE_EDGE,
            pointerEvents: 'auto',
            cursor: ROTATE_CURSOR,
          }}
        />
      )}
    </div>
  );
}

/** The size or the angle next to the element while a handle is dragged. Always upright. */
export function Label({ bounds, view, text }: { bounds: Frame; view: StageView; text: string }) {
  return (
    <div
      data-stage-label
      style={{
        position: 'absolute',
        left: view.origin.x + (bounds.x + bounds.w / 2) * view.scale,
        top: view.origin.y + (bounds.y + bounds.h) * view.scale + 10,
        transform: 'translateX(-50%)',
        padding: '2px 6px',
        borderRadius: 4,
        background: ACCENT,
        color: 'var(--color-ui-on-accent)',
        font: '500 11px/16px var(--font-ui)',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </div>
  );
}

/** The gap between a box and what is placed beside it, and the margin kept to the Stage's edge. */
const BESIDE_GAP = 12;
const BESIDE_MARGIN = 8;

/**
 * Where a toolbar of the given size goes beside a box of the Stage, all in screen pixels: centred
 * above it, clear of the rotation handle; below it when there is no room above; and inside the
 * Stage whatever the box does, so a selection that fills the Stage still has its toolbar.
 */
export function besidePosition(
  box: Frame,
  own: { w: number; h: number },
  stage: { w: number; h: number },
  clear: number,
): Point {
  const above = box.y - clear - BESIDE_GAP - own.h;
  const below = box.y + box.h + BESIDE_GAP;
  const y =
    above >= BESIDE_MARGIN
      ? above
      : below + own.h <= stage.h - BESIDE_MARGIN
        ? below
        : BESIDE_MARGIN;
  const x = Math.min(
    Math.max(BESIDE_MARGIN, box.x + box.w / 2 - own.w / 2),
    Math.max(BESIDE_MARGIN, stage.w - own.w - BESIDE_MARGIN),
  );
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * The host's toolbar beside the selection (STG-05). It is the host's own UI on the Stage's
 * surface: the pointer and the keys in it stay in it, and a press on it does not take the
 * keyboard from the Stage, so the arrows and Delete go on working on the selection.
 */
export function Beside({
  box,
  stage,
  clear,
  onEnter,
  children,
}: {
  /** The selection, in screen pixels of the Stage. */
  box: Frame;
  stage: { w: number; h: number };
  /** Room to leave above the box for the rotation handle. */
  clear: number;
  /** The pointer came onto the toolbar: it is no longer over the slide. */
  onEnter?: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [own, setOwn] = useState<{ w: number; h: number } | undefined>();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { offsetWidth: w, offsetHeight: h } = el;
      setOwn((s) => (s?.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const at = own ? besidePosition(box, own, stage, clear) : { x: 0, y: 0 };
  const stop = (event: SyntheticEvent) => event.stopPropagation();
  return (
    <div
      ref={ref}
      data-stage-toolbar
      style={{
        position: 'absolute',
        left: at.x,
        top: at.y,
        // Measured first, then shown: it never flashes in the corner.
        visibility: own ? 'visible' : 'hidden',
        pointerEvents: 'auto',
      }}
      onPointerDown={stop}
      onPointerMove={stop}
      onPointerUp={stop}
      onPointerEnter={onEnter}
      onDoubleClick={stop}
      onWheel={stop}
      onKeyDown={stop}
      onKeyUp={stop}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}

/** A map from an element's own pixels to the screen, as an SVG transform. */
function svgTransform(m: Matrix, view: StageView): string {
  const s = view.scale;
  const n = (v: number) => Math.round(v * 1e5) / 1e5;
  return `matrix(${n(m.a * s)} ${n(m.b * s)} ${n(m.c * s)} ${n(m.d * s)} ${n(view.origin.x + m.e * s)} ${n(view.origin.y + m.f * s)})`;
}

/**
 * A line as the Stage marks it (SHP-05): its own path instead of the box around it, and, when it
 * is the one selected element, a handle on each of its points.
 */
export function LineOverlay({
  located,
  view,
  handles,
  hover,
  point: keyboardAt,
}: {
  located: Located & { element: LineElement };
  view: StageView;
  handles?: boolean;
  hover?: boolean;
  /** The point the keyboard is on, which the arrows move (UI-06). */
  point?: number | null;
}) {
  const line = located.element;
  // The line's points are in its mirrored box; the map with the flips takes them to the slide.
  const matrix = elementMatrix(located, true);
  return (
    <>
      <svg
        data-outline={line.id}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
        }}
      >
        <path
          d={linePath(line.points, line.curve)}
          transform={svgTransform(matrix, view)}
          vectorEffect="non-scaling-stroke"
          style={{ fill: 'none', stroke: ACCENT, strokeWidth: hover ? 1 : 1.5 }}
        />
      </svg>
      {handles
        ? line.points.map((point, i) => {
            const at = apply(matrix, point);
            return (
              <div
                key={i}
                data-line-point={i}
                data-active={i === keyboardAt || undefined}
                style={{
                  position: 'absolute',
                  left: view.origin.x + at.x * view.scale - 6,
                  top: view.origin.y + at.y * view.scale - 6,
                  width: 12,
                  height: 12,
                  boxSizing: 'border-box',
                  borderRadius: '50%',
                  // Filled, to tell a point of the line from the white rotation handle.
                  background: ACCENT,
                  border: `2px solid ${PANEL}`,
                  boxShadow: i === keyboardAt ? FOCUS_RING : `0 0 0 1px ${ACCENT}`,
                  pointerEvents: 'auto',
                  cursor: 'crosshair',
                }}
              />
            );
          })
        : null}
    </>
  );
}

const CROP_BAR = 4;
const CROP_ARM = 16;
/** The area around a crop handle that takes the pointer. */
const CROP_GRIP = 24;
const PICTURE_DOT = 12;
const PICTURE_GRIP = 18;

/** A crop handle: a corner bracket or an edge bar, with a larger area around it to grab. */
function CropHandle({
  name,
  sw,
  sh,
  matrix,
  active,
}: {
  name: keyof typeof HANDLES;
  sw: number;
  sh: number;
  matrix: Matrix;
  /** The keyboard is on this handle: the arrows move it (UI-06). */
  active: boolean;
}) {
  const hd = HANDLES[name];
  // On a small frame the handles of the edges would sit on those of the corners, and are left
  // out; the one the keyboard is on is drawn whatever the size, so it can be seen.
  const crowded = (hd.x === 0 && sw < 3 * CROP_ARM) || (hd.y === 0 && sh < 3 * CROP_ARM);
  if (crowded && !active) return null;
  const corner = hd.x !== 0 && hd.y !== 0;
  const bar: CSSProperties = {
    position: 'absolute',
    background: ACCENT,
    boxShadow: `0 0 0 1px ${PANEL}`,
    borderRadius: 1,
  };
  // The bars hug the frame from the inside: `near` is the grip's side that lies on the frame.
  const nearX =
    hd.x < 0 ? { left: corner ? 0 : CROP_GRIP / 2 } : { right: corner ? 0 : CROP_GRIP / 2 };
  const nearY =
    hd.y < 0 ? { top: corner ? 0 : CROP_GRIP / 2 } : { bottom: corner ? 0 : CROP_GRIP / 2 };
  const midX = { left: (CROP_GRIP - CROP_ARM) / 2 };
  const midY = { top: (CROP_GRIP - CROP_ARM) / 2 };
  return (
    <div
      data-crop-handle={name}
      data-active={active || undefined}
      style={{
        position: 'absolute',
        left: ((hd.x + 1) / 2) * sw - CROP_GRIP / 2 - (corner ? (hd.x * CROP_GRIP) / 2 : 0),
        top: ((hd.y + 1) / 2) * sh - CROP_GRIP / 2 - (corner ? (hd.y * CROP_GRIP) / 2 : 0),
        width: CROP_GRIP,
        height: CROP_GRIP,
        borderRadius: 4,
        boxShadow: active ? FOCUS_RING : undefined,
        pointerEvents: 'auto',
        cursor: handleCursor(hd, matrix),
      }}
    >
      {hd.y !== 0 ? (
        <div
          style={{ ...bar, ...nearY, ...(hd.x ? nearX : midX), width: CROP_ARM, height: CROP_BAR }}
        />
      ) : null}
      {hd.x !== 0 ? (
        <div
          style={{ ...bar, ...nearX, ...(hd.y ? nearY : midY), width: CROP_BAR, height: CROP_ARM }}
        />
      ) : null}
    </div>
  );
}

/**
 * The whole picture of an image, dimmed, around its frame: what the frame leaves out. Inside the
 * frame the slide's own image shows through, so masks, borders and adjustments look as they will.
 */
export function CropPicture({
  located,
  view,
  crop,
  url,
}: {
  located: Located;
  view: StageView;
  crop: CropView;
  url: string;
}) {
  const s = view.scale;
  const { picture } = crop;
  const sw = crop.frame.w * s;
  const sh = crop.frame.h * s;
  const pw = picture.w * s;
  const ph = picture.h * s;
  // The frame as a hole in the picture, in the picture's own pixels.
  const x0 = -picture.x * s;
  const y0 = -picture.y * s;
  const hole = `polygon(evenodd, 0 0, ${pw}px 0, ${pw}px ${ph}px, 0 ${ph}px, 0 0, ${x0}px ${y0}px, ${x0}px ${y0 + sh}px, ${x0 + sw}px ${y0 + sh}px, ${x0 + sw}px ${y0}px, ${x0}px ${y0}px)`;
  return (
    // In the frame's mirrored axes, as the renderer lays the picture out.
    <div data-crop-picture style={boxStyle(located, view, true)}>
      <img
        src={url}
        alt=""
        draggable={false}
        style={{
          position: 'absolute',
          left: picture.x * s,
          top: picture.y * s,
          width: pw,
          height: ph,
          maxWidth: 'none',
          opacity: 0.35,
          clipPath: hole,
          userSelect: 'none',
        }}
      />
    </div>
  );
}

/**
 * Crop mode (IMG-03): the whole picture, dimmed, around the frame; the frame with its crop
 * handles; a rule-of-thirds grid while something is dragged.
 */
export function CropOverlay({
  located,
  view,
  crop,
  url,
  active,
  handle,
}: {
  located: Located;
  view: StageView;
  crop: CropView;
  /** The crop handle the keyboard is on; without one the arrows move the picture. */
  handle?: HandleName | null;
  /** The picture; without it only the frame is drawn. */
  url: string | undefined;
  /** A crop gesture is under way. */
  active: boolean;
}) {
  const sw = crop.frame.w * view.scale;
  const sh = crop.frame.h * view.scale;
  const matrix = elementMatrix(located);
  const pictureMatrix = elementMatrix(located, true);
  const third: CSSProperties = { position: 'absolute', background: PANEL, opacity: 0.6 };
  return (
    <>
      {url ? <CropPicture located={located} view={view} crop={crop} url={url} /> : null}
      <div
        data-crop-frame={located.element.id}
        style={{ ...boxStyle(located, view), outline: `1.5px solid ${ACCENT}` }}
      >
        {active ? (
          <>
            <div style={{ ...third, left: sw / 3, top: 0, width: 1, height: sh }} />
            <div style={{ ...third, left: (2 * sw) / 3, top: 0, width: 1, height: sh }} />
            <div style={{ ...third, top: sh / 3, left: 0, height: 1, width: sw }} />
            <div style={{ ...third, top: (2 * sh) / 3, left: 0, height: 1, width: sw }} />
          </>
        ) : null}
        {/* The opening of a drawn frame is that frame's, and has no handles to change it by. */}
        {crop.outer
          ? null
          : (Object.keys(HANDLES) as (keyof typeof HANDLES)[]).map((name) => (
              <CropHandle
                key={name}
                name={name}
                sw={sw}
                sh={sh}
                matrix={matrix}
                active={name === handle}
              />
            ))}
      </div>
      {url ? (
        <div data-crop-picture-bounds style={boxStyle(located, view, true)}>
          <div
            style={{
              position: 'absolute',
              left: crop.picture.x * view.scale,
              top: crop.picture.y * view.scale,
              width: crop.picture.w * view.scale,
              height: crop.picture.h * view.scale,
              outline: `1.5px solid ${ACCENT}`,
            }}
          />
          {(['nw', 'ne', 'se', 'sw'] as const).map((name) => {
            const corner = HANDLES[name];
            return (
              <div
                key={name}
                data-picture-handle={name}
                style={{
                  position: 'absolute',
                  left:
                    (crop.picture.x + (corner.x > 0 ? crop.picture.w : 0)) * view.scale -
                    PICTURE_GRIP / 2,
                  top:
                    (crop.picture.y + (corner.y > 0 ? crop.picture.h : 0)) * view.scale -
                    PICTURE_GRIP / 2,
                  width: PICTURE_GRIP,
                  height: PICTURE_GRIP,
                  borderRadius: '50%',
                  background: HANDLE_FILL,
                  border: `${(PICTURE_GRIP - PICTURE_DOT) / 2}px solid transparent`,
                  backgroundClip: 'padding-box',
                  boxShadow: HANDLE_EDGE,
                  pointerEvents: 'auto',
                  cursor: handleCursor(corner, pictureMatrix),
                }}
              />
            );
          })}
        </div>
      ) : null}
    </>
  );
}
