import {
  findSlide,
  slideFromLayout,
  type Command,
  type Deck,
  type Element,
  type PlaceholderRole,
} from '@slidr/model';
import { relayout } from './relayout';

/**
 * The commands that move an existing slide to another layout of its deck (SLD-02), with its
 * content mapped by role. A list given to `CommandBus.batch` is one undo step.
 *
 * - A slide that sits on a layout: its elements follow their placeholders to the new layout's,
 *   by role and place among the role (`relayout`), and what the user moved by hand stays.
 * - An empty slide without a layout becomes what "new slide" would have made of the layout: an
 *   empty element for each placeholder.
 * - A slide without a layout that holds content (drawn by hand, or written as HTML): each
 *   element that names a role goes to the seat of that role, the first to the first; everything
 *   else stays where it is, over what the layout draws.
 *
 * Nothing is deleted, and nothing is added to a slide that has content: a seat of the new
 * layout that no element fills stays empty.
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

  const from = deck.layouts.find((layout) => layout.id === slide.layoutId);
  if (from) return [...relayout(slide, from, to, deck.meta.dir), onto];

  if (slide.elements.length === 0) {
    const fresh = slideFromLayout(deck, to.id, options).slide;
    return [
      onto,
      ...fresh.elements.map((element): Command => ({ type: 'element.add', slideId, element })),
    ];
  }

  const taken = new Map<PlaceholderRole, number>();
  const seated: Command[] = [];
  for (const element of slide.elements) {
    if (!element.role) continue;
    const nth = taken.get(element.role) ?? 0;
    taken.set(element.role, nth + 1);
    const seat = to.placeholders.filter((p) => p.role === element.role)[nth];
    if (seat) seated.push(seatOn(slideId, element, seat.frame));
  }
  return [...seated, onto];
}

function seatOn(slideId: string, element: Element, frame: Element['frame']): Command {
  return {
    type: 'element.update',
    slideId,
    elementId: element.id,
    patch: { frame: { ...frame } },
  };
}
