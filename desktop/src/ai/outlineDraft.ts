import { actionMessage, approvedOutline, type OutlineSlide } from '@slidr/prompts';
import type { ChatEntry, EntryAction } from '../agent/transcript';

/*
 * The outline of a deck while its card waits for an answer (AID-03): what the agent proposed,
 * what the user made of it in the card (titles, order, slides taken out and added), and the
 * approval that carries it to the agent. No React here: the card draws this and calls it.
 */

/** The outline a call carried, as far as its arguments can be read. */
export function outlineOf(input: unknown): { title?: string; slides: OutlineSlide[] } {
  const args =
    typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  const slides = Array.isArray(args.slides) ? args.slides : [];
  return {
    ...(typeof args.title === 'string' ? { title: args.title } : {}),
    slides: slides.flatMap((slide: unknown) => {
      if (typeof slide !== 'object' || slide === null) return [];
      const { title, archetype, note } = slide as Record<string, unknown>;
      if (typeof title !== 'string') return [];
      return [
        {
          title,
          ...(typeof archetype === 'string' ? { archetype } : {}),
          ...(typeof note === 'string' ? { note } : {}),
        },
      ];
    }),
  };
}

/** A slide of the outline in the card: `key` names its row, so the row is the same one as it moves. */
export interface DraftSlide extends OutlineSlide {
  key: number;
}

export function draftOf(slides: readonly OutlineSlide[]): DraftSlide[] {
  return slides.map((slide, key) => ({ ...slide, key }));
}

/** The draft with the slide at `index` one place earlier (-1) or later (1); the same at an end. */
export function moved(draft: readonly DraftSlide[], index: number, by: -1 | 1): DraftSlide[] {
  const to = index + by;
  const slide = draft[index];
  if (!slide || to < 0 || to >= draft.length) return [...draft];
  const next = draft.filter((_, at) => at !== index);
  next.splice(to, 0, slide);
  return next;
}

export function removed(draft: readonly DraftSlide[], index: number): DraftSlide[] {
  return draft.filter((_, at) => at !== index);
}

export function retitled(draft: readonly DraftSlide[], index: number, title: string): DraftSlide[] {
  return draft.map((slide, at) => (at === index ? { ...slide, title } : slide));
}

/** The draft with an empty slide at its end: a title to type, and the rest for the agent. */
export function added(draft: readonly DraftSlide[]): DraftSlide[] {
  const key = draft.reduce((highest, slide) => Math.max(highest, slide.key), -1) + 1;
  return [...draft, { title: '', key }];
}

/** What a draft asks to build: its slides in order, without those whose title is still empty. */
export function slidesOf(draft: readonly DraftSlide[]): OutlineSlide[] {
  return draft.flatMap(({ title, archetype, note }) =>
    title.trim()
      ? [{ title: title.trim(), ...(archetype ? { archetype } : {}), ...(note ? { note } : {}) }]
      : [],
  );
}

/** Whether the user made the outline another one than the agent proposed. */
export function isEdited(draft: readonly DraftSlide[], proposed: readonly OutlineSlide[]): boolean {
  return JSON.stringify(slidesOf(draft)) !== JSON.stringify(slidesOf(draftOf(proposed)));
}

/**
 * "Approve and build": the message that goes to the deck chat, and the action its entry is shown
 * by. The outline rides with it whether or not it was edited: a session that could not resume the
 * conversation was never told what the agent proposed.
 */
export function approval(
  slides: readonly OutlineSlide[],
  edited: boolean,
  replyIn: string,
): { message: string; action: EntryAction } {
  return {
    message: actionMessage({
      action: 'outline.approve',
      params: { outline: slides, ...(edited ? { edited: true } : {}) },
      replyIn,
    }),
    action: { id: 'outline.approve', ...(edited ? { params: { edited: 1 } } : {}) },
  };
}

/**
 * The outline that was approved in answer to the turn `entryId`, read from the approval itself:
 * what the card shows once it is answered, in this window and after the deck is opened again.
 * Null while the outline has no such answer.
 */
export function approvedAfter(
  entries: readonly ChatEntry[],
  entryId: string,
): OutlineSlide[] | null {
  const at = entries.findIndex((entry) => entry.id === entryId);
  const next = at < 0 ? undefined : entries[at + 1];
  if (next?.type !== 'user' || next.action?.id !== 'outline.approve') return null;
  return approvedOutline(next.text);
}
