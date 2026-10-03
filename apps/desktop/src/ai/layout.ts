import { findSlide, type Command, type Deck } from '@slidr/model';
import { relayout } from '@slidr/templates';

/**
 * Moving a slide to another layout of its deck (AIS-04), as one change: the elements that sat on
 * the old layout's placeholders follow the new one's, by role, and the ones the user moved by
 * hand stay where they are (SPEC 5.5). Empty when there is nothing to move from or to: a slide
 * written as HTML has no layout.
 */
export function switchLayoutCommands(deck: Deck, slideId: string, layoutId: string): Command[] {
  const slide = findSlide(deck, slideId);
  const from = deck.layouts.find((layout) => layout.id === slide?.layoutId);
  const to = deck.layouts.find((layout) => layout.id === layoutId);
  if (!slide || !from || !to || from === to) return [];
  return [
    ...relayout(slide, from, to),
    { type: 'slide.update', slideId, patch: { layoutId: to.id } },
  ];
}
