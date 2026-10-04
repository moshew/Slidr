import { findElement, findSlide } from '@slidr/model';
import { createStore } from 'zustand/vanilla';
import { i18n } from '../i18n';
import type { Editor } from '../shell';
import { changeText, sampleTarget, type TextTarget } from './actions';
import { wordRange } from './editorFormat';
import { paintMarks, paintParagraph, pickFormat, type PickedFormat } from './format';

/*
 * The format painter (TXT-10). It picks up the character marks and the paragraph format at the
 * caret, or of a selected box, and gives them to the next text the user selects with the mouse
 * or the next text box they click. Picked up with a double click it stays in hand until Esc.
 *
 * The same pair works from the keyboard without the brush: Ctrl+Alt+C picks the format up, and
 * Ctrl+Alt+V gives it to whatever is selected then. Text formatting only: the look of an object
 * (ARR-06) is not carried.
 */

interface PainterState {
  /** The format picked up last. It outlives the brush, for Ctrl+Alt+V. */
  picked: PickedFormat | null;
  /** The brush is in hand: the next text selected or box clicked takes the format. */
  armed: boolean;
  /** Stays in hand after painting, until Esc. */
  sticky: boolean;
}

export const painter = createStore<PainterState>(() => ({
  picked: null,
  armed: false,
  sticky: false,
}));

/** Picks up the format of the target and takes the brush in hand. */
export function pickUp(target: TextTarget, sticky = false): void {
  painter.setState({ picked: pickFormat(sampleTarget(target)), armed: true, sticky });
}

/** Puts the brush down. The picked format stays. */
export function putDown(): void {
  painter.setState({ armed: false, sticky: false });
}

/**
 * Gives the picked format to the target, as one undo step: to the selection, or to all the text
 * of a box. A caret takes the word it is in, as a click on a word does in other editors; a caret
 * outside any word takes the paragraph format only. False when no format was picked up.
 */
export function paint(target: TextTarget): boolean {
  const { picked, sticky } = painter.getState();
  if (!picked) return false;
  const marks = paintMarks(picked);
  const paragraphs = paintParagraph(picked);
  const step = { label: i18n.t('text:step.paint') };
  if (target.kind === 'editor' && target.view.state.selection.empty) {
    const range = wordRange(target.view.state);
    changeText(target, range ? { marks, paragraphs, range } : { paragraphs }, step);
  } else changeText(target, { marks, paragraphs }, step);
  if (!sticky) putDown();
  return true;
}

/** Esc puts the brush down, and is not then the key that leaves the text or the selection. */
function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  // An open menu or popover closes first, as everywhere.
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return;
  event.preventDefault();
  event.stopPropagation();
  putDown();
}

const sameIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

/**
 * The brush on the Stage: while it is in hand, a text box or a shape that becomes the selection
 * is painted, all of its text. Inside the text editor the editor itself paints what is selected
 * there (`painterPlugin`). Returns the function that stops watching.
 */
export function watchPainter({ bus, selection }: Pick<Editor, 'bus' | 'selection'>): () => void {
  const stopKeys = painter.subscribe((state, previous) => {
    if (state.armed === previous.armed) return;
    // In the capture phase, before the Stage and the text editor see the key.
    if (state.armed) window.addEventListener('keydown', onKeyDown, true);
    else window.removeEventListener('keydown', onKeyDown, true);
  });
  let last = selection.getState().selectedElementIds;
  const stopSelection = selection.subscribe((state) => {
    const ids = state.selectedElementIds;
    const moved = !sameIds(ids, last);
    last = ids;
    if (!moved || !painter.getState().armed || state.editingElementId || ids.length !== 1) return;
    const slide = state.currentSlideId ? findSlide(bus.deck, state.currentSlideId) : undefined;
    const element = slide && ids[0] ? findElement(slide, ids[0]) : undefined;
    if (!slide || (element?.type !== 'text' && element?.type !== 'shape')) return;
    paint({ kind: 'element', bus, slideId: slide.id, element });
  });
  return () => {
    stopKeys();
    stopSelection();
    window.removeEventListener('keydown', onKeyDown, true);
  };
}
