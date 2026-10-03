import { useMemo } from 'react';
import type { SessionScope } from '@slidr/agent-tools';
import { findElement, findSlide } from '@slidr/model';
import { useDeck, useSelection } from '../shell';

/*
 * What the slide tool and the object tool work on (SPEC 4.2): the slide on the Stage, and the
 * selection on it. The scope is what names the chat, so a new slide or a new selection is
 * another chat (AIS-01, AIO-01).
 */

/** The scope of the slide tool: the slide on the Stage; null in a deck without slides. */
export function useSlideScope(): (SessionScope & { kind: 'slide' }) | null {
  const slideId = useSelection((s) => s.currentSlideId);
  const exists = useDeck((s) => Boolean(slideId && findSlide(s.deck, slideId)));
  return useMemo(() => (slideId && exists ? { kind: 'slide', slideId } : null), [slideId, exists]);
}

/** The scope of the object tool: the selected elements; null while nothing is selected. */
export function useObjectScope(): (SessionScope & { kind: 'object' }) | null {
  const slideId = useSelection((s) => s.currentSlideId);
  const selected = useSelection((s) => s.selectedElementIds);
  // Ids of elements that are still on the slide, as one string: stable while nothing changes.
  const present = useDeck((s) => {
    const slide = slideId ? findSlide(s.deck, slideId) : undefined;
    return slide ? selected.filter((id) => findElement(slide, id)).join(' ') : '';
  });
  return useMemo(
    () => (slideId && present ? { kind: 'object', slideId, elementIds: present.split(' ') } : null),
    [slideId, present],
  );
}
