import type { Deck } from '@slidr/model';
import { createStore } from 'zustand/vanilla';

/**
 * The Stage's preview layer (STG-10): a deck to draw in place of the real one, so that a
 * proposed change (a variation the user hovers in the gallery) shows on the slide without being
 * made. The model, the undo history and the Filmstrip stay as they are. Whoever shows a preview
 * takes it down again; the Stage draws it only for the slide it is on.
 */
export const stagePreview = createStore<{ deck: Deck | null }>(() => ({ deck: null }));

/** Shows `deck` on the Stage in place of the real deck; `null` takes the preview down. */
export function showPreview(deck: Deck | null): void {
  if (stagePreview.getState().deck !== deck) stagePreview.setState({ deck });
}
