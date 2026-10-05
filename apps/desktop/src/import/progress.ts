/**
 * What a turn of the import's chat is told about the import so far (IMP-09): which slides of
 * the deck came from a capture and what the agent pointed at for each, the size of its plan, and
 * what became of the isolated page. The words are the prompt package's (`importProgress`); this
 * gathers what the app holds. It says what was captured, never what is missing: working out
 * what is left of the file is the agent's (IMP-04).
 */
import type { Deck } from '@slidr/model';
import { importProgress, type CapturedSlide } from '@slidr/prompts';
import type { ImportState } from './session';

/** The captured slides that are in the deck now, in the order of the deck. */
export function capturedSlides(state: ImportState, deck: Deck): CapturedSlide[] {
  return deck.slides.flatMap((slide, index) => {
    const record = state.records[slide.id];
    if (!record) return [];
    return [
      {
        number: index + 1,
        id: slide.id,
        ...(slide.name ? { name: slide.name } : {}),
        ...(record.from ? { from: record.from } : {}),
      },
    ];
  });
}

/**
 * The block for the next turn of the import's chat; empty when the session knows everything
 * already. `fresh`: the harness session begins with this turn and does not remember the
 * conversation (it could not be resumed, or the settings it ran on were changed).
 */
export function importBrief(state: ImportState, deck: Deck, fresh: boolean): string {
  if (!state.file || state.deckId !== deck.id) return '';
  return importProgress({
    file: state.file,
    cut: state.phase === 'cut',
    fresh,
    ...(state.planned === null ? {} : { planned: state.planned }),
    captured: capturedSlides(state, deck),
    slidesInDeck: deck.slides.length,
    // A page that is closed is opened again when a tool needs it, if the deck keeps the file.
    page: !state.open && !state.kept ? 'gone' : state.stale ? 'reload' : 'open',
  });
}
