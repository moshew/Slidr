import {
  rotatedBounds,
  rotateVector,
  unionBounds,
  type Element,
  type Frame,
  type GroupElement,
} from '@slidr/model';
import { fitLine, linePoints } from './line';
import { tidyFrame } from './space';

/**
 * Keeping a group's frame around its children (ARR-01). A child's frame is relative to the group's
 * frame, and the group rotates and mirrors around the centre of that frame. So when a child moves
 * or changes size, the group takes the new bounds of its children and every child shifts by the
 * same amount the other way: nothing moves on the slide, and the frame bounds the children again.
 */

/** What a gesture changes of an element's placement. `null` stands for an element being removed. */
export type Placement = Partial<Pick<Element, 'frame' | 'rotation'>>;

/** A refit ignores differences below this: the model keeps a thousandth of a pixel. */
const EPSILON = 2e-3;

/**
 * The placements that go with a change inside nested groups.
 *
 * @param path The groups around the changed elements, outermost first, as they are before the
 *   change.
 * @param changes New frame and / or rotation of children of the innermost group; `null` removes
 *   the child.
 * @returns The changed children, their siblings and the groups of the path, each with the frame it
 *   has to get. Removed elements, and groups left empty by a removal, map to `null`.
 */
export function refitGroups(
  path: readonly GroupElement[],
  changes: ReadonlyMap<string, Placement | null>,
): Map<string, Placement | null> {
  const out = new Map<string, Placement | null>(changes);
  let pending: ReadonlyMap<string, Placement | null> = changes;
  for (let depth = path.length - 1; depth >= 0; depth--) {
    const group = path[depth] as GroupElement;
    const children = group.children
      .filter((child) => pending.get(child.id) !== null)
      .map((child) => {
        const change = pending.get(child.id);
        return {
          id: child.id,
          frame: change?.frame ?? child.frame,
          rotation: change?.rotation ?? child.rotation,
        };
      });
    if (children.length === 0) {
      // The command that removes the last child removes the group too (ADR-007).
      out.set(group.id, null);
      pending = new Map([[group.id, null]]);
      continue;
    }
    const bounds = unionBounds(children.map((c) => rotatedBounds(c.frame, c.rotation)));
    const { frame } = group;
    const moved = Math.abs(bounds.x) > EPSILON || Math.abs(bounds.y) > EPSILON;
    const resized =
      Math.abs(bounds.w - frame.w) > EPSILON || Math.abs(bounds.h - frame.h) > EPSILON;
    // The group already bounds its children, so nothing above it changes either.
    if (!moved && !resized) break;
    if (moved) {
      for (const child of children) {
        out.set(child.id, {
          ...out.get(child.id),
          frame: tidyFrame({
            ...child.frame,
            x: child.frame.x - bounds.x,
            y: child.frame.y - bounds.y,
          }),
        });
      }
    }
    // How far the centre of the children moved, in the group's own axes, and from there on the
    // slide: mirrored, then rotated, as the group draws its inside.
    const shift = {
      x: bounds.x + bounds.w / 2 - frame.w / 2,
      y: bounds.y + bounds.h / 2 - frame.h / 2,
    };
    const onParent = rotateVector(
      { x: group.flipH ? -shift.x : shift.x, y: group.flipV ? -shift.y : shift.y },
      group.rotation,
    );
    const next: Frame = tidyFrame({
      x: frame.x + frame.w / 2 + onParent.x - bounds.w / 2,
      y: frame.y + frame.h / 2 + onParent.y - bounds.h / 2,
      w: bounds.w,
      h: bounds.h,
    });
    out.set(group.id, { frame: next });
    pending = new Map([[group.id, { frame: next }]]);
  }
  return out;
}

/** What `element.update` takes; `frame` and `rotation` are what a refit reads and writes. */
export type Patch = Record<string, unknown> & Placement;

/**
 * The patches of a gesture on children of the innermost group of `path`, together with the frames
 * that keep the groups around them fitted. At the top level of the slide they are returned as
 * they are.
 */
export function refitPatches(
  path: readonly GroupElement[],
  patches: ReadonlyMap<string, Patch>,
): Map<string, Patch> {
  const out = new Map(patches);
  if (path.length === 0) return out;
  const placements = new Map<string, Placement>();
  for (const [id, patch] of patches) {
    placements.set(id, {
      ...(patch.frame ? { frame: patch.frame } : {}),
      ...(patch.rotation !== undefined ? { rotation: patch.rotation } : {}),
    });
  }
  for (const [id, placement] of refitGroups(path, placements)) {
    if (placement) out.set(id, { ...out.get(id), ...placement });
  }
  return out;
}

/**
 * The frames that fit every group of a tree to its children, innermost first: for changes that
 * were made without a refit, such as moving elements of several groups at once.
 */
export function refitAll(elements: readonly Element[]): Map<string, Placement> {
  const out = new Map<string, Placement>();
  const visit = (list: readonly Element[]): Element[] =>
    list.map((element) => {
      if (element.type !== 'group' || element.children.length === 0) return element;
      const children = visit(element.children);
      const fitted = refitGroups([{ ...element, children }], new Map());
      for (const [id, placement] of fitted)
        if (placement) out.set(id, { ...out.get(id), ...placement });
      const frame = fitted.get(element.id)?.frame ?? element.frame;
      return { ...element, frame, children };
    });
  visit(elements);
  return out;
}

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
