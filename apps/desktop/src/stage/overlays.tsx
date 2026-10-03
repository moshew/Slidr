import type { Frame, LineElement, Point } from '@slidr/model';
import { linePath } from '@slidr/renderer';
import type { CSSProperties, ReactNode } from 'react';
import type { CropView } from './crop';
import { HANDLES, type Handle } from './geometry';
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

const HANDLE_PX = 8;
const ROTATE_OFFSET_PX = 24;
const ACCENT = 'var(--color-ui-accent)';
const PANEL = 'var(--color-ui-panel)';

/** A box of the element's size in screen pixels, laid over the element. */
function boxStyle(located: Located, view: StageView, flips = false): CSSProperties {
  const { w, h } = located.element.frame;
  return {
    position: 'absolute',
    left: 0,
    top: 0,
    width: w * view.scale,
    height: h * view.scale,
    transformOrigin: '0 0',
    transform: screenTransform(elementMatrix(located, flips), view.origin, view.scale),
  };
}

/** A slide-pixel box as a screen-pixel one. */
export function screenBox(f: Frame, view: StageView): CSSProperties {
  return {
    position: 'absolute',
    left: view.origin.x + f.x * view.scale,
    top: view.origin.y + f.y * view.scale,
    width: f.w * view.scale,
    height: f.h * view.scale,
  };
}

const CURSORS = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'] as const;

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
}: {
  located: Located;
  view: StageView;
  hover?: boolean;
  dashed?: boolean;
  /** The group the user is working inside: a quieter frame than a selection. */
  entered?: boolean;
}) {
  const { element } = located;
  return (
    <div
      {...(entered ? { 'data-entered-group': element.id } : { 'data-outline': element.id })}
      style={{
        ...boxStyle(located, view),
        outline: `${hover || entered ? 1 : 1.5}px ${dashed || entered ? 'dashed' : 'solid'} ${ACCENT}`,
        opacity: entered ? 0.7 : undefined,
      }}
    />
  );
}

/** The eight resize handles and the rotation handle of one element. */
export function Handles({
  located,
  view,
  rotateOnly,
  noRotate,
}: {
  located: Located;
  view: StageView;
  /** A line has handles on its points instead of on its box. */
  rotateOnly?: boolean;
  /** Several elements together are resized, not turned. */
  noRotate?: boolean;
}) {
  const { w, h } = located.element.frame;
  const sw = w * view.scale;
  const sh = h * view.scale;
  const matrix = elementMatrix(located);
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
          background: PANEL,
          border: `1.5px solid ${ACCENT}`,
          borderRadius: 2,
          pointerEvents: 'auto',
          cursor: handleCursor(hd, matrix),
        }}
      />
    );
  };
  return (
    <div style={boxStyle(located, view)}>
      {rotateOnly ? null : (Object.keys(HANDLES) as (keyof typeof HANDLES)[]).map(handle)}
      {noRotate ? null : (
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
            background: PANEL,
            border: `1.5px solid ${ACCENT}`,
            pointerEvents: 'auto',
            cursor: 'grab',
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
}: {
  located: Located & { element: LineElement };
  view: StageView;
  handles?: boolean;
  hover?: boolean;
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
                style={{
                  position: 'absolute',
                  left: view.origin.x + at.x * view.scale - 6,
                  top: view.origin.y + at.y * view.scale - 6,
                  width: 12,
                  height: 12,
                  boxSizing: 'border-box',
                  borderRadius: '50%',
                  // Filled, to tell a point of the line from the hollow rotation handle.
                  background: ACCENT,
                  border: `2px solid ${PANEL}`,
                  boxShadow: `0 0 0 1px ${ACCENT}`,
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

/** A crop handle: a corner bracket or an edge bar, with a larger area around it to grab. */
function CropHandle({
  name,
  sw,
  sh,
  matrix,
}: {
  name: keyof typeof HANDLES;
  sw: number;
  sh: number;
  matrix: Matrix;
}) {
  const hd = HANDLES[name];
  if ((hd.x === 0 && sw < 3 * CROP_ARM) || (hd.y === 0 && sh < 3 * CROP_ARM)) return null;
  const bar: CSSProperties = {
    position: 'absolute',
    background: ACCENT,
    boxShadow: `0 0 0 1px ${PANEL}`,
    borderRadius: 1,
  };
  // The bars hug the frame from the inside: `near` is the grip's side that lies on the frame.
  const nearX = hd.x < 0 ? { left: CROP_GRIP / 2 } : { right: CROP_GRIP / 2 };
  const nearY = hd.y < 0 ? { top: CROP_GRIP / 2 } : { bottom: CROP_GRIP / 2 };
  const midX = { left: (CROP_GRIP - CROP_ARM) / 2 };
  const midY = { top: (CROP_GRIP - CROP_ARM) / 2 };
  return (
    <div
      data-crop-handle={name}
      style={{
        position: 'absolute',
        left: ((hd.x + 1) / 2) * sw - CROP_GRIP / 2,
        top: ((hd.y + 1) / 2) * sh - CROP_GRIP / 2,
        width: CROP_GRIP,
        height: CROP_GRIP,
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
 * Crop mode (IMG-03): the whole picture, dimmed, around the frame; the frame with its crop
 * handles; a rule-of-thirds grid while something is dragged. Inside the frame the slide's own
 * image shows through, so masks, borders and adjustments look as they will.
 */
export function CropOverlay({
  located,
  view,
  crop,
  url,
  active,
}: {
  located: Located;
  view: StageView;
  crop: CropView;
  /** The picture; without it only the frame is drawn. */
  url: string | undefined;
  /** A crop gesture is under way. */
  active: boolean;
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
  const matrix = elementMatrix(located);
  const third: CSSProperties = { position: 'absolute', background: PANEL, opacity: 0.6 };
  return (
    <>
      {url ? (
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
      ) : null}
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
        {(Object.keys(HANDLES) as (keyof typeof HANDLES)[]).map((name) => (
          <CropHandle key={name} name={name} sw={sw} sh={sh} matrix={matrix} />
        ))}
      </div>
    </>
  );
}
