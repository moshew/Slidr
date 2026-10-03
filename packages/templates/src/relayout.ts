import type {
  CommandOf,
  Element,
  Frame,
  Layout,
  Placeholder,
  PlaceholderRole,
  Slide,
} from '@slidr/model';

/*
 * Moving a slide from one layout to another (SPEC 5.5): the layout is found by archetype, and the
 * elements find their placeholders by role. Switching a template and turning a deck to the other
 * direction are both built on this.
 */

const sameFrame = (a: Frame, b: Frame) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/**
 * Whether an element is where its placeholder put it. The model has no link from an element to
 * its placeholder, so the frame is the test: one that was moved or resized by hand has a frame of
 * its own, and keeps it.
 */
export function sitsOn(element: Element, placeholder: Placeholder): boolean {
  return sameFrame(element.frame, placeholder.frame);
}

function byRole<T extends { role?: PlaceholderRole }>(items: readonly T[]) {
  const groups = new Map<PlaceholderRole, T[]>();
  for (const item of items) {
    if (!item.role) continue;
    const group = groups.get(item.role);
    if (group) group.push(item);
    else groups.set(item.role, [item]);
  }
  return groups;
}

/** A placeholder of a layout, and its place among the layout's placeholders of the same role. */
interface Seat {
  placeholder: Placeholder;
  ordinal: number;
}

/**
 * The placeholder each top-level element of a slide belongs to. Among the elements of a role, one
 * that sits on a placeholder of the role belongs to it; the others take the placeholders left, in
 * order. An element beyond the placeholders of its role belongs to none, and neither does an
 * element inside a group, whose frame is not in slide coordinates.
 */
function seatsOf(elements: readonly Element[], layout: Layout): Map<string, Seat> {
  const seats = new Map<string, Seat>();
  const placeholders = byRole(layout.placeholders);
  for (const [role, group] of byRole(elements)) {
    const free = (placeholders.get(role) ?? []).map((placeholder, ordinal): Seat => ({
      placeholder,
      ordinal,
    }));
    const waiting: Element[] = [];
    for (const element of group) {
      const at = free.findIndex((seat) => sitsOn(element, seat.placeholder));
      const [seat] = at < 0 ? [] : free.splice(at, 1);
      if (seat) seats.set(element.id, seat);
      else waiting.push(element);
    }
    for (const element of waiting) {
      const seat = free.shift();
      if (seat) seats.set(element.id, seat);
    }
  }
  return seats;
}

/** The placeholder an element leaves and the one it goes to. */
export interface Move {
  from: Placeholder;
  to: Placeholder;
}

/**
 * Where the elements of a slide go when it moves from one layout to another: to the placeholder
 * of the same role, at the same place among those of the role. An element whose role has no such
 * placeholder in the new layout is not listed, and stays as it is.
 */
export function movesOf(slide: Slide, from: Layout, to: Layout): Map<string, Move> {
  const targets = byRole(to.placeholders);
  const moves = new Map<string, Move>();
  for (const [elementId, seat] of seatsOf(slide.elements, from)) {
    const target = targets.get(seat.placeholder.role)?.[seat.ordinal];
    if (target) moves.set(elementId, { from: seat.placeholder, to: target });
  }
  return moves;
}

/**
 * What an element takes from its new placeholder, as an `element.update` patch. It follows the
 * layout in what it had from the old placeholder: the frame, the vertical alignment, and the
 * alignment and text style of each paragraph. A value set by hand differs from the old
 * placeholder's, and stays (SPEC 5.5: an element with explicit values stays as it is).
 */
export function followPatch(element: Element, { from, to }: Move): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (sitsOn(element, from) && !sameFrame(from.frame, to.frame)) patch.frame = { ...to.frame };
  if (element.type !== 'text') return patch;

  const vAlign = to.vAlign ?? 'top';
  if (element.vAlign === (from.vAlign ?? 'top') && element.vAlign !== vAlign) patch.vAlign = vAlign;

  const fromAlign = from.align ?? 'start';
  const toAlign = to.align ?? 'start';
  let changed = false;
  const paragraphs = element.content.paragraphs.map((paragraph) => {
    const next = { ...paragraph };
    if (paragraph.align === fromAlign && toAlign !== fromAlign) {
      next.align = toAlign;
      changed = true;
    }
    if (paragraph.styleRef === from.styleRef && to.styleRef !== from.styleRef) {
      if (to.styleRef) next.styleRef = to.styleRef;
      else delete next.styleRef;
      changed = true;
    }
    return next;
  });
  if (changed) patch.content = { paragraphs };
  return patch;
}

/** The `element.update`s that take a slide's elements from one layout to another. */
export function relayout(slide: Slide, from: Layout, to: Layout): CommandOf<'element.update'>[] {
  const moves = movesOf(slide, from, to);
  const commands: CommandOf<'element.update'>[] = [];
  for (const element of slide.elements) {
    const move = moves.get(element.id);
    if (!move) continue;
    const patch = followPatch(element, move);
    if (Object.keys(patch).length > 0) {
      commands.push({ type: 'element.update', slideId: slide.id, elementId: element.id, patch });
    }
  }
  return commands;
}

function roleCounts(items: readonly { role?: PlaceholderRole }[]): Map<PlaceholderRole, number> {
  return new Map([...byRole(items)].map(([role, group]) => [role, group.length]));
}

/**
 * The layout a slide moves to. The one with the id of its present layout, when there is one: it
 * is the same layout in a new version. Otherwise a layout of the same archetype, and among
 * several of them the one with a placeholder for most of the slide's elements, then the one whose
 * placeholders are closest to the present layout's, then the first. Undefined when no layout has
 * the archetype.
 */
export function matchLayout(
  slide: Slide,
  from: Layout,
  candidates: readonly Layout[],
): Layout | undefined {
  const sameId = candidates.find((layout) => layout.id === from.id);
  if (sameId) return sameId;
  const options = candidates.filter((layout) => layout.archetype === from.archetype);
  if (options.length < 2) return options[0];

  const wanted = roleCounts(slide.elements);
  const present = roleCounts(from.placeholders);
  let best: { layout: Layout; placed: number; distance: number } | undefined;
  for (const layout of options) {
    const counts = roleCounts(layout.placeholders);
    let placed = 0;
    for (const [role, count] of wanted) placed += Math.min(count, counts.get(role) ?? 0);
    let distance = 0;
    for (const role of new Set([...present.keys(), ...counts.keys()])) {
      distance += Math.abs((present.get(role) ?? 0) - (counts.get(role) ?? 0));
    }
    if (!best || placed > best.placed || (placed === best.placed && distance < best.distance)) {
      best = { layout, placed, distance };
    }
  }
  return best?.layout;
}
