import {
  findSlide,
  plainText,
  slideFromLayout,
  type Command,
  type Deck,
  type Element,
  type Layout,
  type Placeholder,
  type PlaceholderRole,
} from '@slidr/model';
import { arrivalsOf, movesOf, relayout, seatsOf, sitsOn } from './relayout';

/**
 * The commands that move an existing slide to another layout of its deck (SLD-02), with its
 * content mapped by role. A list given to `CommandBus.batch` is one undo step.
 *
 * - A slide nobody has written on (no elements, or only the empty ones its layout gave it, still
 *   on their seats) becomes what "new slide" would have made of the new layout.
 * - A slide that sits on a layout: its elements follow their placeholders to the new layout's,
 *   by role and place among the role (`relayout`), and what the user moved by hand stays. An
 *   element that is still an empty placeholder of the old layout goes when the new layout has
 *   no seat for it, and every seat of the new layout that nothing fills gets an empty element,
 *   on top of the others: without one there would be nowhere to type.
 * - A slide without a layout that holds content (drawn by hand, or written as HTML): each
 *   element that names a role goes to the seat of that role, the first to the first; everything
 *   else stays where it is, over what the layout draws. Such a slide was designed as a whole, so
 *   nothing is added to it.
 *
 * Nothing that holds content is deleted.
 */
export function changeLayout(
  deck: Deck,
  slideId: string,
  layoutId: string,
  options: { random?: () => number } = {},
): Command[] {
  const slide = findSlide(deck, slideId);
  const to = deck.layouts.find((layout) => layout.id === layoutId);
  if (!slide || !to || slide.layoutId === to.id) return [];
  const onto: Command = { type: 'slide.update', slideId, patch: { layoutId: to.id } };
  const add = (element: Element): Command => ({ type: 'element.add', slideId, element });
  const remove = (elements: readonly Element[]): Command[] =>
    elements.length === 0
      ? []
      : [{ type: 'element.remove', slideId, elementIds: elements.map((element) => element.id) }];
  /** What "new slide" makes of the layout, each element with the seat it is for. */
  const fresh = seated(to, slideFromLayout(deck, to.id, options).slide.elements);

  const from = deck.layouts.find((layout) => layout.id === slide.layoutId);
  const seats = from ? seatsOf(slide.elements, from) : new Map<string, never>();
  /** Still as its layout made it: on its seat, and holding nothing. */
  const untouched = (element: Element) => {
    const seat = seats.get(element.id);
    return seat !== undefined && sitsOn(element, seat.placeholder) && holdsNothing(element);
  };

  if (slide.elements.every(untouched)) {
    return [...remove(slide.elements), onto, ...fresh.map(({ element }) => add(element))];
  }

  if (from) {
    const moves = movesOf(slide, from, to);
    const left = slide.elements.filter((element) => untouched(element) && !moves.has(element.id));
    // A seat is filled by what moves to it, and by what already stands on it.
    const filled = new Set([
      ...[...moves.values()].map((move) => move.to.id),
      ...[...arrivalsOf(slide, from, to).values()].map((seat) => seat.id),
    ]);
    return [
      ...relayout(slide, from, to, deck.meta.dir),
      ...remove(left),
      onto,
      ...fresh.filter(({ seat }) => !filled.has(seat.id)).map(({ element }) => add(element)),
    ];
  }

  const taken = new Map<PlaceholderRole, number>();
  const moved: Command[] = [];
  for (const element of slide.elements) {
    if (!element.role) continue;
    const nth = taken.get(element.role) ?? 0;
    taken.set(element.role, nth + 1);
    const seat = to.placeholders.filter((p) => p.role === element.role)[nth];
    if (seat) moved.push(seatOn(slideId, element, seat));
  }
  return [...moved, onto];
}

/**
 * The elements "new slide" makes of a layout, each with the placeholder it came from. They are
 * in the order of the placeholders, and some placeholders give none (`slideFromLayout`).
 */
function seated(
  layout: Layout,
  elements: readonly Element[],
): { seat: Placeholder; element: Element }[] {
  const pairs: { seat: Placeholder; element: Element }[] = [];
  let next = 0;
  for (const seat of layout.placeholders) {
    const element = elements[next];
    if (element?.role !== seat.role) continue;
    next++;
    pairs.push({ seat, element });
  }
  return pairs;
}

/** Whether an element is as empty as the one a placeholder starts with. */
function holdsNothing(element: Element): boolean {
  switch (element.type) {
    case 'text':
      return plainText(element.content).trim() === '';
    case 'image':
      return element.assetId === undefined && element.prompt === undefined;
    case 'chart':
      return element.data.categories.length === 0 && element.data.series.length === 0;
    case 'table':
      return element.cells.every((row) =>
        row.every((cell) => plainText(cell.content).trim() === ''),
      );
    default:
      return false;
  }
}

/** An element on a seat: the seat's frame, and for text the colour the seat gives it. */
function seatOn(slideId: string, element: Element, seat: Placeholder): Command {
  return {
    type: 'element.update',
    slideId,
    elementId: element.id,
    patch: {
      frame: { ...seat.frame },
      ...(element.type === 'text' && seat.color ? { color: { ...seat.color } } : {}),
    },
  };
}
