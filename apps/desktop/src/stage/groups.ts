import {
  normalizeAngle,
  refitAll,
  rotateVector,
  type Element,
  type Frame,
  type GroupElement,
  type PlacementPatch,
  type Point,
} from '@slidr/model';
import { fitLine, linePoints } from './line';
import { tidy, tidyFrame } from './space';

/*
 * What a gesture of the Stage does to several elements at once: stretching a group with what is
 * in it, stretching several elements together, turning them together. Keeping a group's frame
 * around its children (ARR-01) is the model's (`@slidr/model`, `compose/refit.ts`), where every
 * other way of changing an element can reach it too; it is passed on from here for the Stage.
 */
export { refitAll, refitGroups, refitPatches, type Placement } from '@slidr/model';

/** What `element.update` takes; `frame` and `rotation` are what a refit reads and writes. */
export type Patch = PlacementPatch;

/**
 * An element stretched with the group it is in, by `kx` and `ky` along the group's axes. A line
 * takes it point by point, which is exact. A box that is turned inside the group cannot shear, so
 * it is sized by how far each of its own axes stretches. Text keeps its size: only its box changes.
 */
function scaleElement(element: Element, kx: number, ky: number, out: Map<string, Patch>): Element {
  if (element.type === 'line') {
    const fitted = fitLine(
      element,
      linePoints(element).map((p) => ({ x: p.x * kx, y: p.y * ky })),
    );
    out.set(element.id, fitted);
    return { ...element, ...fitted };
  }
  const { frame } = element;
  const along = rotateVector({ x: 1, y: 0 }, element.rotation);
  const w = frame.w * Math.hypot(kx * along.x, ky * along.y);
  const h = frame.h * Math.hypot(kx * along.y, ky * along.x);
  const next = tidyFrame({
    x: (frame.x + frame.w / 2) * kx - w / 2,
    y: (frame.y + frame.h / 2) * ky - h / 2,
    w,
    h,
  });
  out.set(element.id, { frame: next });
  if (element.type !== 'group') return { ...element, frame: next };
  const ix = frame.w > 0 ? w / frame.w : 1;
  const iy = frame.h > 0 ? h / frame.h : 1;
  const children = element.children.map((child) => scaleElement(child, ix, iy, out));
  return { ...element, frame: next, children };
}

/**
 * The patches that give a group a new frame: everything in it, at any depth, is stretched along.
 * Where turned children do not come to an exact fit, the groups take the box their children end
 * up in.
 */
export function resizeGroup(group: GroupElement, frame: Frame): Map<string, Patch> {
  const out = new Map<string, Patch>();
  const kx = group.frame.w > 0 ? frame.w / group.frame.w : 1;
  const ky = group.frame.h > 0 ? frame.h / group.frame.h : 1;
  const children = group.children.map((child) => scaleElement(child, kx, ky, out));
  out.set(group.id, { frame });
  for (const [id, placement] of refitAll([{ ...group, frame, children }])) {
    out.set(id, { ...out.get(id), ...placement });
  }
  return out;
}

/**
 * The patches that resize several elements of one parent together: the box around them goes from
 * `from` to `to` (both in the coordinates their frames are written in), and each element is
 * stretched with it, like the children of a group.
 */
export function resizeTogether(
  elements: readonly Element[],
  from: Frame,
  to: Frame,
): Map<string, Patch> {
  const out = new Map<string, Patch>();
  const kx = from.w > 0 ? to.w / from.w : 1;
  const ky = from.h > 0 ? to.h / from.h : 1;
  // Stretched around the corner of the box, then put where the box is now.
  const scaled = elements.map((element) =>
    scaleElement(
      {
        ...element,
        frame: { ...element.frame, x: element.frame.x - from.x, y: element.frame.y - from.y },
      },
      kx,
      ky,
      out,
    ),
  );
  for (const [id, placement] of refitAll(scaled)) out.set(id, { ...out.get(id), ...placement });
  for (const element of elements) {
    const patch = out.get(element.id);
    if (!patch?.frame) continue;
    out.set(element.id, {
      ...patch,
      frame: tidyFrame({ ...patch.frame, x: patch.frame.x + to.x, y: patch.frame.y + to.y }),
    });
  }
  return out;
}

/**
 * The patches that turn several elements of one parent together by `angle` degrees around
 * `center` (in the coordinates their frames are written in): each one turns by the angle, and
 * its centre travels around the common centre, as if they were a group for the length of the
 * gesture. A group among them turns as one thing, with what is in it.
 */
export function rotateTogether(
  elements: readonly Element[],
  center: Point,
  angle: number,
): Map<string, Patch> {
  const out = new Map<string, Patch>();
  for (const element of elements) {
    const { frame } = element;
    const arm = rotateVector(
      { x: frame.x + frame.w / 2 - center.x, y: frame.y + frame.h / 2 - center.y },
      angle,
    );
    out.set(element.id, {
      frame: tidyFrame({
        ...frame,
        x: center.x + arm.x - frame.w / 2,
        y: center.y + arm.y - frame.h / 2,
      }),
      rotation: tidy(normalizeAngle(element.rotation + angle)),
    });
  }
  return out;
}
