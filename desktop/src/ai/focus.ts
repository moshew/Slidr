import { useMemo } from 'react';
import type { TextSelection } from '@slidr/agent-tools';
import { findElement, findSlide } from '@slidr/model';
import { useDeck, useSelection } from '../shell';
import { useSelectedText } from '../text/selectedText';

/*
 * What the AI chat is about at a given moment (ADR-072): the slide on the Stage, the elements
 * selected on it, and the words selected in a text being edited. There is one chat; this is what
 * goes to the agent with a message (the context block), what the chip beside the composer shows,
 * and what the ready-made actions work on.
 */

export interface Focus {
  /** The slide on the Stage; null in a deck without slides. */
  slideId: string | null;
  /** Its number, as the user counts; 0 without a slide. */
  slideNumber: number;
  /** The selected elements that are on that slide. */
  elementIds: readonly string[];
  /** Words selected in the text being edited. */
  text: TextSelection | null;
}

/** The kind of focus, from the narrowest: what "this" means in a message. */
export type FocusKind = 'text' | 'object' | 'slide' | 'deck';

export function focusKind(focus: Focus): FocusKind {
  if (focus.text) return 'text';
  if (focus.elementIds.length > 0) return 'object';
  return focus.slideId ? 'slide' : 'deck';
}

export function useFocus(): Focus {
  const slideId = useSelection((s) => s.currentSlideId);
  const selected = useSelection((s) => s.selectedElementIds);
  const slideNumber = useDeck((s) =>
    slideId ? s.deck.slides.findIndex((slide) => slide.id === slideId) + 1 : 0,
  );
  // Ids of elements that are still on the slide, as one string: stable while nothing changes.
  const present = useDeck((s) => {
    const slide = slideId ? findSlide(s.deck, slideId) : undefined;
    return slide ? selected.filter((id) => findElement(slide, id)).join(' ') : '';
  });
  const text = useSelectedText();
  const key = text ? JSON.stringify(text) : '';
  return useMemo(
    () => ({
      slideId: slideNumber > 0 ? slideId : null,
      slideNumber,
      elementIds: present ? present.split(' ') : [],
      text: text && text.slideId === slideId ? text : null,
    }),
    // The selected text is compared by value: it is read anew on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slideId, slideNumber, present, key],
  );
}
