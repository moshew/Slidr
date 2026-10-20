import { findSlide, type Command, type Deck } from '@slidr/model';
import { changeLayout } from '@slidr/templates';

/**
 * Moving a slide to another layout of its deck (AIS-04), as one change: the elements that sat on
 * the old layout's placeholders follow the new one's, by role, and the ones the user moved by
 * hand stay where they are (SPEC 5.5). It is the move the "Layout" tool of row B makes
 * (`changeLayout`), so the two leave the same slide: empty placeholders the new layout has no
 * seat for go, and its free seats get empty elements. Empty when there is nothing to move from
 * or to: a slide written as HTML has no layout.
 */
export function switchLayoutCommands(deck: Deck, slideId: string, layoutId: string): Command[] {
  const slide = findSlide(deck, slideId);
  if (!slide || !deck.layouts.some((layout) => layout.id === slide.layoutId)) return [];
  return changeLayout(deck, slideId, layoutId);
}
