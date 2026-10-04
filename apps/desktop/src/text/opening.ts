import { findElement, findSlide, type SelectionStore } from '@slidr/model';
import type { Editor } from '../shell';
// By file, not through the shell's index: the text editor loads this, and the index loads it.
import { stageElement } from '../shell/stageDom';

/*
 * Opening the text editor from outside the Stage's own gestures (SHP-04): a character typed on a
 * selected text box or shape, and the "text" button of a shape's row B. The Stage mounts the
 * editor when an element is being edited and tells it where the last double click was; what is
 * asked for here takes the place of that: the caret goes to the end of the text, and a typed
 * character is the first of the typing that follows.
 */

interface Opening {
  elementId: string;
  /** The character that was typed on the selected element. */
  typed?: string;
  at: number;
}

/** An editor that does not open within this long was not opened by the request. */
const VALID_MS = 1000;

let pending: Opening | null = null;

/** Starts editing the text of an element, with the caret at its end and `typed` typed there. */
export function openText(selection: SelectionStore, elementId: string, typed?: string): void {
  pending = { elementId, typed, at: performance.now() };
  selection.getState().startEditing(elementId);
  if (selection.getState().editingElementId !== elementId) pending = null;
}

/** For the editor as it opens: how it was asked to open, if it was. The request is used up. */
export function takeOpening(elementId: string): { typed?: string } | null {
  const opening = pending;
  if (opening?.elementId !== elementId) return null;
  pending = null;
  return performance.now() - opening.at < VALID_MS ? { typed: opening.typed } : null;
}

/**
 * A character typed while one text box or one shape is selected starts editing it, and is typed
 * at the end of its text, as in other presentation editors. Only when the key was pressed on the
 * Stage: a key in a field, in a menu or in the Filmstrip is theirs. The space is the Stage's own
 * (it pans), and a key with Ctrl or Alt is a shortcut. Returns the function that stops listening.
 */
export function typeToEdit({ bus, selection }: Pick<Editor, 'bus' | 'selection'>): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key.length !== 1 || event.key === ' ') return;
    const { currentSlideId, selectedElementIds, editingElementId } = selection.getState();
    const [id] = selectedElementIds;
    if (editingElementId || selectedElementIds.length !== 1 || !id) return;
    const slide = currentSlideId ? findSlide(bus.deck, currentSlideId) : undefined;
    const element = slide ? findElement(slide, id) : undefined;
    if (element?.locked || (element?.type !== 'text' && element?.type !== 'shape')) return;
    // The Stage is what holds the element's box; nothing else that takes keys does.
    const box = stageElement(id);
    const target = event.target;
    if (!box || !(target instanceof HTMLElement) || target === document.body) return;
    if (!target.contains(box)) return;
    // The key is used up here: it is not also a shortcut of one letter (T adds a text box).
    event.preventDefault();
    openText(selection, id, event.key);
  };
  // On the document: after the Stage's own keys, before the shell's shortcuts on the window.
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
