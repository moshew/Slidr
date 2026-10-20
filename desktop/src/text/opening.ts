import { findElement, findSlide, type SelectionStore } from '@slidr/model';
import type { Editor } from '../shell';
// By file, not through the shell's index: the text editor loads this, and the index loads it.
import { stageElement } from '../shell/stageDom';

/*
 * Opening the text editor from outside the Stage's own gestures (SHP-04): a character typed on a
 * selected text box or shape, and the "text" button of a shape's row B. The Stage mounts the
 * editor when an element is being edited and tells it where the last double click was; what is
 * asked for here takes the place of that: the caret goes to the end of the text, and what was
 * typed is the first of the typing that follows.
 *
 * The editor is not there at once. It is built a moment after editing starts, and takes the
 * keyboard a frame after that; a second character typed in that moment would still go to the
 * Stage, and be lost. So the characters are collected here until the editor has the focus: it
 * takes the ones typed so far when it is built (`takeOpening`), and the rest when the keyboard is
 * its own (`finishOpening`).
 */

interface Opening {
  elementId: string;
  /** What was typed on the element and the editor has not taken yet. */
  typed: string;
  at: number;
}

/** An editor that has not taken the keyboard within this long was not opened by the request. */
const VALID_MS = 1000;

let pending: Opening | null = null;

const current = (elementId: string): Opening | null =>
  pending?.elementId === elementId && performance.now() - pending.at < VALID_MS ? pending : null;

/** Starts editing the text of an element, with the caret at its end and `typed` typed there. */
export function openText(selection: SelectionStore, elementId: string, typed = ''): void {
  pending = { elementId, typed, at: performance.now() };
  selection.getState().startEditing(elementId);
  if (selection.getState().editingElementId !== elementId) pending = null;
}

/**
 * For the editor as it is built: whether it was asked for here, and what was typed so far. Null
 * when it was opened by the Stage (a double click, Enter).
 */
export function takeOpening(elementId: string): { typed: string } | null {
  const opening = current(elementId);
  if (!opening) return null;
  const { typed } = opening;
  opening.typed = '';
  return { typed };
}

/** For the editor as it takes the focus: what was typed since it was built. Ends the request. */
export function finishOpening(elementId: string): string {
  const typed = current(elementId)?.typed ?? '';
  if (pending?.elementId === elementId) pending = null;
  return typed;
}

/**
 * A character typed while one text box or one shape is selected starts editing it, and is typed
 * at the end of its text, as in other presentation editors. Only when the key was pressed on the
 * Stage: a key in a field, in a menu or in the Filmstrip is theirs. A space does not start it:
 * on the Stage the space pans. A key with Ctrl or Alt is a shortcut. Returns the function that
 * stops listening.
 */
export function typeToEdit({ bus, selection }: Pick<Editor, 'bus' | 'selection'>): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
    const { currentSlideId, selectedElementIds, editingElementId } = selection.getState();
    const [id] = selectedElementIds;
    if (selectedElementIds.length !== 1 || !id) return;
    // The Stage is what holds the element's box; nothing else that takes keys does.
    const box = stageElement(id);
    const target = event.target;
    if (!box || !(target instanceof HTMLElement) || target === document.body) return;
    if (!target.contains(box)) return;

    // The key is used up here: it is no shortcut of one letter (T adds a text box), and a space
    // that is on its way to the text does not pan the Stage.
    const take = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (editingElementId) {
      // The editor was asked for and does not have the keyboard yet: the character waits for it.
      const opening = editingElementId === id ? current(id) : null;
      if (!opening) return;
      opening.typed += event.key;
      return take();
    }
    if (event.key === ' ') return;
    const slide = currentSlideId ? findSlide(bus.deck, currentSlideId) : undefined;
    const element = slide ? findElement(slide, id) : undefined;
    if (element?.locked || (element?.type !== 'text' && element?.type !== 'shape')) return;
    take();
    openText(selection, id, event.key);
  };
  // In the capture phase: before the Stage's own keys and the shell's shortcuts.
  document.addEventListener('keydown', onKeyDown, true);
  return () => document.removeEventListener('keydown', onKeyDown, true);
}
